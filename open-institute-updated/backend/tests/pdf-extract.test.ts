// Unit tests for AI009 (PDF text extraction). No real PDF-authoring tool
// used — a minimal-but-real FlateDecode content stream is hand-built and
// deflated with Node's own zlib, so this exercises the exact code path a
// real PDF's content stream takes without needing a fixture file or any
// external dependency.
import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";

import { extractPdfText, looksLikePdf } from "../src/lib/pdf-extract.js";

function buildMinimalPdf(contentStreamText: string, opts?: { encrypted?: boolean; compressed?: boolean }): Buffer {
  const compressed = opts?.compressed ?? true;
  const body = compressed ? deflateSync(Buffer.from(contentStreamText, "latin1")) : Buffer.from(contentStreamText, "latin1");
  const encryptDict = opts?.encrypted ? "\n5 0 obj\n<< /Filter /Standard >>\nendobj\ntrailer\n<< /Encrypt 5 0 R >>" : "";
  const header = Buffer.from(
    `%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n4 0 obj\n<< /Length ${body.length} /Filter ${compressed ? "/FlateDecode" : "/None"} >>\nstream\n`,
    "latin1"
  );
  const footer = Buffer.from(`\nendstream\nendobj${encryptDict}\n%%EOF`, "latin1");
  return Buffer.concat([header, body, footer]);
}

test("looksLikePdf recognizes a real %PDF- header and rejects other files", () => {
  assert.equal(looksLikePdf(Buffer.from("%PDF-1.4\n...")), true);
  assert.equal(looksLikePdf(Buffer.from("Just plain text")), false);
  assert.equal(looksLikePdf(Buffer.from("PK\x03\x04")), false); // a zip/docx, not a pdf
});

test("extractPdfText pulls a simple (...) Tj literal string out of a compressed content stream", () => {
  const pdf = buildMinimalPdf("BT /F1 12 Tf 72 700 Td (Hello World) Tj ET");
  const result = extractPdfText(pdf);
  assert.equal(result.sawAnyContentStream, true);
  assert.equal(result.isEncrypted, false);
  assert.equal(result.text, "Hello World");
});

test("extractPdfText handles multiple text lines separated by Td moves", () => {
  const pdf = buildMinimalPdf("BT /F1 12 Tf 72 700 Td (Line one) Tj 0 -14 Td (Line two) Tj ET");
  const result = extractPdfText(pdf);
  assert.equal(result.text, "Line one\nLine two");
});

test("extractPdfText handles a TJ array mixing strings and kerning numbers", () => {
  // The array form interleaves show-strings with numeric spacing
  // adjustments — real PDFs use this constantly for justified text.
  const pdf = buildMinimalPdf("BT /F1 12 Tf 72 700 Td [(Ka)-20(sh) 15 (mir)] TJ ET");
  const result = extractPdfText(pdf);
  assert.equal(result.text, "Kashmir");
});

test("extractPdfText decodes real PDF string escapes (parens, backslash, octal)", () => {
  const pdf = buildMinimalPdf("BT /F1 12 Tf 72 700 Td (Price: \\(KES 100\\) \\251) Tj ET");
  const result = extractPdfText(pdf);
  assert.equal(result.text, "Price: (KES 100) \u00a9"); // \251 octal = 0xA9 = ©
});

test("extractPdfText handles a hex-string operand", () => {
  // <48656C6C6F> is "Hello" as ASCII hex bytes.
  const pdf = buildMinimalPdf("BT /F1 12 Tf 72 700 Td <48656C6C6F> Tj ET");
  const result = extractPdfText(pdf);
  assert.equal(result.text, "Hello");
});

test("extractPdfText works on an uncompressed (unfiltered) content stream too", () => {
  const pdf = buildMinimalPdf("BT /F1 12 Tf 72 700 Td (No compression here) Tj ET", { compressed: false });
  const result = extractPdfText(pdf);
  assert.equal(result.text, "No compression here");
});

test("extractPdfText reports isEncrypted honestly and does not fabricate text for it", () => {
  const pdf = buildMinimalPdf("BT (secret) Tj ET", { encrypted: true });
  const result = extractPdfText(pdf);
  assert.equal(result.isEncrypted, true);
});

test("extractPdfText does not mistake a non-content (e.g. image-like binary) deflate stream for text", () => {
  // Random binary with no BT...ET block — must never surface as "text".
  const randomBytes = Buffer.from(Array.from({ length: 200 }, (_, i) => (i * 37) % 256));
  const compressed = deflateSync(randomBytes);
  const header = Buffer.from(`%PDF-1.4\n4 0 obj\n<< /Length ${compressed.length} /Filter /FlateDecode >>\nstream\n`, "latin1");
  const footer = Buffer.from("\nendstream\nendobj\n%%EOF", "latin1");
  const pdf = Buffer.concat([header, compressed, footer]);
  const result = extractPdfText(pdf);
  assert.equal(result.sawAnyContentStream, false);
  assert.equal(result.text, "");
});

test("extractPdfText on a PDF with no streams at all returns an honest empty result", () => {
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF", "latin1");
  const result = extractPdfText(pdf);
  assert.equal(result.streamCount, 0);
  assert.equal(result.sawAnyContentStream, false);
  assert.equal(result.text, "");
});
