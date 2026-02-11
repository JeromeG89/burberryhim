import { useEffect, useRef, useState } from "react";
import CalibrateOverlay from "./components/CalibrateOverlay";
import GazeDot from "./components/GazeDot";
import GazeQuestionsGrid from "./components/GazeQuestionsGrid";
import { useSpeechToText } from "./hooks/useSpeechToText";

const API_BASE = "https://burberryhim.onrender.com";

export default function App() {
  const [questions, setQuestions] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [lastPrompt, setLastPrompt] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false); // NEW: drive loading overlay

  const fetchingRef = useRef(false); // prevent double-fetch race

  const {
    isSupported,
    isListening,
    transcript,
    finalTranscript,
    error,
    start,
    stop,
    reset,
  } = useSpeechToText({ lang: "en-SG" });

  // keep isRecording in sync with real listening state
  useEffect(() => {
    setIsRecording(Boolean(isListening));
  }, [isListening]);

  async function fetchQuestions(text) {
    const clean = (text || "").trim();
    if (!clean) return;

    // prevent repeated calls for the same transcript / double effect runs
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    setIsTranscribing(true);
    setLastPrompt(clean);

    try {
      const res = await fetch(`${API_BASE}/get-educational-questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: clean }),
      });

      if (!res.ok) throw new Error(await res.text());

      const data = await res.json();
      setQuestions(Array.isArray(data.questions) ? data.questions : []);
    } catch (e) {
      console.error("Failed to fetch questions:", e);
      setQuestions([]);
    } finally {
      setIsTranscribing(false);
      fetchingRef.current = false;
    }
  }

  // when user stops talking and final transcript arrives -> generate questions
  useEffect(() => {
    // Only fire once per stop: when listening becomes false AND we have finalTranscript
    if (!isListening && finalTranscript) {
      fetchQuestions(finalTranscript);
    }
  }, [isListening, finalTranscript]); // ok

  function startRecording() {
    if (!isSupported) return;
    if (isTranscribing) return; // don't start while fetching questions

    // reset UI state
    reset();
    setQuestions([]);
    setLastPrompt("");

    // start speech recognition
    start();
  }

  function stopRecording() {
    // stop speech recognition (finalTranscript will come later)
    stop();

    // show overlay while we wait for finalTranscript + backend question gen
    // (if finalTranscript comes instantly, the effect will flip it off quickly)
    setIsTranscribing(true);
  }

  function clearAll() {
    stop();
    reset();
    setQuestions([]);
    setLastPrompt("");
    setIsTranscribing(false);
    fetchingRef.current = false;
  }

  // IMPORTANT: if we set transcribing true on stop, but finalTranscript never arrives
  // (speech hook bug / permissions), don't lock the UI forever.
  useEffect(() => {
    if (!isListening && !finalTranscript) return;
    if (!isListening && finalTranscript) return; // handled by fetchQuestions
    // if listening resumed, ensure overlay not stuck
    if (isListening) setIsTranscribing(false);
  }, [isListening, finalTranscript]);

  return (
    <>
      <CalibrateOverlay />
      <GazeDot />

      <GazeQuestionsGrid
        questions={questions}
        prompt={lastPrompt}
        onClear={clearAll}
        onMicRequest={startRecording}
        onMicStop={stopRecording}          // ✅ ADD THIS (your grid expects it)
        isRecording={isRecording}
        isTranscribing={isTranscribing}    // ✅ ADD THIS (to show loading overlay)
        liveTranscript={transcript}
        error={error}
      />
    </>
  );
}
