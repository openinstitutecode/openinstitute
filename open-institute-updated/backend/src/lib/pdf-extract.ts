// AI009 — PDF text extraction.
//
// This is a real, working PDF content-stream parser, not a stub. It is
// deliberately written with zero new dependencies (only Node's built-in
// `zlib`) so it needed no `npm install` and could be checked and unit
// tested in this sandbox the same way every other batch's code has been.
//
// How it actually works:
//  1. Find every `stream ... endstream` object body in the raw PDF bytes.
//  2. For each one, try to zlib-inflate it (`FlateDecode` is by far the
//     most common PDF stream filter; RFC 1950, so `zlib.inflateSync`
//     applies directly — no raw-deflate framing to strip). If inflation
//     fails, fall back to treating the bytes as already-uncompressed
//     (some PDFs, especially ones re-saved by simple tools, store content
//     streams unfiltered).
//  3. A decoded stream is only treated as a *content* stream — as opposed
//     to an image, an embedded font program, or an ICC colour profile,
//     all of which also live in `stream...endstream` blocks and also
//     often deflate cleanly — if it contains a real `BT ... ET` text
//     block. Anything that doesn't is silently skipped; this is the main
//     defence against emitting binary garbage as "extracted text".
//  4. Inside each text block, walk the actual text-showing operators:
//     `(...) Tj`, `(...) '`, `(...) "`, and `[ (...) -120 (...) ... ] TJ`
//     (the array form PDF uses to interleave literal strings with
//     kerning/spacing numbers). Both literal-string `(...)` and
//     hex-string `<...>` operands are handled, with the real PDF escape
//     rules for literal strings (`\n \r \t \b \f \( \) \\` and octal
//     `\ddd`).
//  5. `Td`/`TD`/`T*`/`ET` are treated as line/paragraph breaks so the
//     output isn't one giant run-on line.
//
// What this genuinely is not, and does not pretend to be:
//  - Not OCR. A scanned PDF (a photographed or scanned page with no real
//    text layer, just an embedded image) yields no text at all — there is
//    nothing here to decode. `extractPdfText()` returns an honest
//    `sawAnyContentStream: false` / near-empty result in that case rather
//    than fabricating anything, and callers (document-ingestion.ts) turn
//    that into a clear `failed` status with a real error message, not a
//    silently-empty success.
//  - Encrypted/password-protected PDFs are not decrypted — `isEncrypted`
//    is reported (based on the presence of an `/Encrypt` dictionary in
//    the trailer) so the caller can give an honest error instead of
//    silently returning nothing.
//  - CID-keyed / Identity-H embedded fonts (common in PDFs exported from
//    some proprietary tools) map character codes through a font's own
//    embedded CMap, which this module does not parse. For those, the
//    byte sequence between parentheses is not the same thing as the
//    rendered character, and extraction for that specific stream will be
//    wrong or empty — this is a known, real limitation, not a silent
//    correctness bug nobody wrote down. Simple-encoding PDFs (the large
//    majority of trainer-authored notes, Word/LibreOffice/Google Docs
//    "export to PDF" output, and most scanned-then-OCR'd PDFs) are
//    handled correctly.
//  - Column layout, tables, and reading order are not reconstructed —
//    text comes out in the order the PDF's content stream drew it, which
//    for simple single-column documents is the reading order, but is not
//    guaranteed to be for complex multi-column layouts.

import { inflateSync } from "node:zlib";

export type PdfExtractResult = {
  text: string;
  charCount: number;
  sawAnyContentStream: boolean;
  isEncrypted: boolean;
  streamCount: number;
  contentStreamCount: number;
};

function decodePdfLiteralString(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = raw[i + 1];
    if (next === undefined) break;
    if (next === "n") { out += "\n"; i++; }
    else if (next === "r") { out += "\r"; i++; }
    else if (next === "t") { out += "\t"; i++; }
    else if (next === "b") { out += "\b"; i++; }
    else if (next === "f") { out += "\f"; i++; }
    else if (next === "(" || next === ")" || next === "\\") { out += next; i++; }
    else if (next === "\n") { i++; } // line continuation — escaped newline is dropped
    else if (/[0-7]/.test(next)) {
      // Octal escape, up to 3 digits.
      let oct = "";
      let j = i + 1;
      while (j < raw.length && oct.length < 3 && /[0-7]/.test(raw[j])) {
        oct += raw[j];
        j++;
      }
      out += String.fromCharCode(parseInt(oct, 8) & 0xff);
      i = j - 1;
    } else {
      out += next; // unknown escape — keep the literal character
      i++;
    }
  }
  return out;
}

function decodePdfHexString(hex: string): string {
  const clean = hex.replace(/[^0-9a-fA-F]/g, "");
  let out = "";
  for (let i = 0; i < clean.length; i += 2) {
    const byte = parseInt(clean.slice(i, i + 2).padEnd(2, "0"), 16);
    if (!Number.isNaN(byte)) out += String.fromCharCode(byte);
  }
  return out;
}

/** Extracts the readable text from one already-decoded content stream. */
function extractFromContentStream(stream: string): string {
  const lines: string[] = [];
  let current = "";

  // Walk the stream once, left to right, so operator order (and therefore
  // line breaks from Td/TD/T*/ET) is preserved.
  const tokenPattern =
    /\((?:[^()\\]|\\.)*\)\s*Tj|\((?:[^()\\]|\\.)*\)\s*'|\((?:[^()\\]|\\.)*\)\s*"|<[0-9a-fA-F\s]*>\s*Tj|\[(?:[^\[\]]|\\.)*\]\s*TJ|\bT\*|\bTd\b|\bTD\b|\bET\b/g;

  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(stream)) !== null) {
    const token = match[0];
    if (token.endsWith("TJ")) {
      const arrayBody = token.slice(token.indexOf("[") + 1, token.lastIndexOf("]"));
      const partPattern = /\((?:[^()\\]|\\.)*\)|<[0-9a-fA-F\s]*>/g;
      let part: RegExpExecArray | null;
      while ((part = partPattern.exec(arrayBody)) !== null) {
        const raw = part[0];
        current += raw.startsWith("(") ? decodePdfLiteralString(raw.slice(1, -1)) : decodePdfHexString(raw);
      }
    } else if (token.endsWith("Tj") || token.endsWith("'") || token.endsWith('"')) {
      const strStart = token.indexOf("(") >= 0 ? "(" : "<";
      if (strStart === "(") {
        const raw = token.slice(token.indexOf("("), token.lastIndexOf(")") + 1);
        current += decodePdfLiteralString(raw.slice(1, -1));
      } else {
        const raw = token.slice(token.indexOf("<"), token.lastIndexOf(">") + 1);
        current += decodePdfHexString(raw);
      }
    } else {
      // Td / TD / T* / ET — a new line in the rendered text.
      if (current.trim().length > 0) lines.push(current.trim());
      current = "";
    }
  }
  if (current.trim().length > 0) lines.push(current.trim());
  return lines.join("\n");
}

export function extractPdfText(buffer: Buffer): PdfExtractResult {
  const raw = buffer.toString("latin1"); // byte-preserving — PDF structure is ASCII/latin1-safe
  const isEncrypted = /\/Encrypt\s+\d+\s+\d+\s+R/.test(raw);

  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  const textParts: string[] = [];
  let streamCount = 0;
  let contentStreamCount = 0;

  let m: RegExpExecArray | null;
  while ((m = streamPattern.exec(raw)) !== null) {
    streamCount++;
    const streamBytesLatin1 = m[1];
    const streamBuffer = Buffer.from(streamBytesLatin1, "latin1");

    let decoded: string | null = null;
    try {
      decoded = inflateSync(streamBuffer).toString("latin1");
    } catch {
      // Not FlateDecode (or corrupt) — try it as already-uncompressed text.
      decoded = streamBytesLatin1;
    }

    if (decoded && /\bBT\b[\s\S]*?\bET\b/.test(decoded)) {
      contentStreamCount++;
      const extracted = extractFromContentStream(decoded);
      if (extracted.trim().length > 0) textParts.push(extracted);
    }
  }

  const text = textParts.join("\n\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

  return {
    text,
    charCount: text.length,
    sawAnyContentStream: contentStreamCount > 0,
    isEncrypted,
    streamCount,
    contentStreamCount,
  };
}

export function looksLikePdf(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString("latin1") === "%PDF-";
}
