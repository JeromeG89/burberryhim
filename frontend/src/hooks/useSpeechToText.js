import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function useSpeechToText(options = {}) {
  const {
    lang = "en-SG",
    continuous = true,
    interimResults = true,
  } = options;

  const recognitionRef = useRef(null);

  const SpeechRecognitionCtor = useMemo(() => {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }, []);

  // ✅ derive support directly (no setState in effect)
  const isSupported = !!SpeechRecognitionCtor;

  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = lang;
    recognition.continuous = continuous;
    recognition.interimResults = interimResults;

    recognition.onstart = () => {
      setError("");
      setIsListening(true);
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript("");
    };

    recognition.onerror = (e) => {
      setError(e?.error || "speech_recognition_error");
      setIsListening(false);
    };

    recognition.onresult = (event) => {
      let interim = "";
      let finals = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const text = res[0]?.transcript ?? "";
        if (res.isFinal) finals += text;
        else interim += text;
      }

      if (finals) setFinalTranscript((prev) => (prev + " " + finals).trim());
      setInterimTranscript(interim.trim());
    };

    recognitionRef.current = recognition;

    return () => {
      try {
        recognition.stop();
      } catch {
        // ignore stop errors
      }
      recognitionRef.current = null;
    };
  }, [SpeechRecognitionCtor, lang, continuous, interimResults]);

  const start = useCallback(() => {
    setError("");
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.start();
    } catch {
      setError("start_failed");
    }
  }, []);

  const stop = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch {
      // ignore stop errors
    }
  }, []);

  const reset = useCallback(() => {
    setInterimTranscript("");
    setFinalTranscript("");
    setError("");
  }, []);

  const transcript = (finalTranscript + " " + interimTranscript).trim();

  return {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    finalTranscript,
    error,
    start,
    stop,
    reset,
  };
}
