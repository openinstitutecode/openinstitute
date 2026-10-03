// AI034 (Voice AI — voice input) and AI035 (Text-to-speech).
//
// Honest scope: this is the browser's native Web Speech API
// (SpeechRecognition for voice-to-text, speechSynthesis for
// text-to-speech), not a server-hosted speech model. That means:
//  - Zero new backend infrastructure, zero credentials — it genuinely
//    works today, unlike AI033 (AI viva), which needs real conversational
//    speech infrastructure this project doesn't have and stays ⬜.
//  - Browser-dependent: SpeechRecognition ships in Chrome/Edge (desktop
//    and Android) but not in Firefox or Safari as of this writing, and
//    the `supported` flags below reflect that honestly rather than
//    pretending it works everywhere.
//  - Kiswahili quality depends entirely on the voices/language packs the
//    user's browser or OS ships — this app has no control over that and
//    makes no claim about accuracy in either language.
//
// See docs/feature-audit-400.md AI034/AI035 for the full note.

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionResultLike = { transcript: string };
type SpeechRecognitionEventLike = { results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>> };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const STT_LANG: Record<"en" | "sw", string> = { en: "en-US", sw: "sw-KE" };
const TTS_LANG: Record<"en" | "sw", string> = { en: "en-US", sw: "sw-KE" };

/**
 * AI034 — voice input. Returns a transcript that fills as the student
 * speaks (interim results) and settles once they pause. The caller owns
 * what happens with the transcript (e.g. setting it as chat input) — this
 * hook only manages the recognition session.
 */
export function useSpeechToText(language: "en" | "sw" = "en") {
  const [supported] = useState(() => getRecognitionCtor() !== null);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError("Voice input isn't supported in this browser — try Chrome or Edge.");
      return;
    }
    setError(null);
    setTranscript("");
    const recognition = new Ctor();
    recognition.lang = STT_LANG[language];
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      setTranscript(text);
    };
    recognition.onerror = () => setError("Couldn't capture audio — check microphone permission and try again.");
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [language]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  return { supported, listening, transcript, error, start, stop };
}

/**
 * AI035 — text-to-speech. speak() reads real text aloud via the browser's
 * speechSynthesis; stop() cancels mid-read. `speaking` reflects the
 * actual browser event, not an assumed duration, so the UI never shows
 * "reading" after playback has actually finished or been interrupted.
 */
export function useTextToSpeech(language: "en" | "sw" = "en") {
  const [supported] = useState(() => typeof window !== "undefined" && "speechSynthesis" in window);
  const [speaking, setSpeaking] = useState(false);

  const speak = useCallback(
    (text: string) => {
      if (!supported || !text.trim()) return;
      window.speechSynthesis.cancel(); // one utterance at a time
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = TTS_LANG[language];
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utterance);
    },
    [supported, language]
  );

  const stop = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  useEffect(() => () => { if (supported) window.speechSynthesis.cancel(); }, [supported]);

  return { supported, speaking, speak, stop };
}
