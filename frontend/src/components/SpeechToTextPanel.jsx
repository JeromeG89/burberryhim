import { useEffect, useState } from "react";
import { useSpeechToText } from "../hooks/useSpeechToText";
import GazeQuestionsGrid from "./GazeQuestionsGrid"; // NEW

export default function SpeechToTextPanel() {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);

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

  const fetchQuestions = async (text) => {
    if (!text) return;
    setLoading(true);
    try {
      const response = await fetch("http://localhost:8000/get-educational-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text }),
      });
      const data = await response.json();
      setQuestions(data.questions || []);
    } catch (err) {
      console.error("AI Error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isListening && finalTranscript) {
      fetchQuestions(finalTranscript);
    }
  }, [isListening, finalTranscript]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        if (isListening) stop();
        else start();
      }
      if (e.code === "Escape") {
        reset();
        setQuestions([]);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isListening, start, stop, reset]);

  if (!isSupported) return null;

  return (
    <>
      {/* NEW: questions grid + gaze selection + explanation fetch */}
      <GazeQuestionsGrid
        questions={questions}
        prompt={finalTranscript}
        onClear={() => setQuestions([])}
      />


      {/* Existing speech panel */}
      <div style={styles.wrap}>
        <div style={styles.header}>
          <div style={{ fontWeight: 700 }}>Speech {loading && "• Generating..."}</div>
          <div style={styles.status}>{isListening ? "Listening…" : "Idle"}</div>
        </div>

        {error && (
          <div style={styles.error}>
            <div>
              <b>Error:</b> {error}
            </div>
          </div>
        )}

        <div style={styles.box}>
          {transcript ? transcript : <span style={{ opacity: 0.6 }}>Say something…</span>}
        </div>

        <div style={styles.hint}>Space = start/stop • Esc = clear</div>
      </div>
    </>
  );
}

// keep your styles exactly as before
const styles = {
  wrap: {
    position: "fixed",
    left: 16,
    bottom: 16,
    width: 360,
    zIndex: 999999,
    padding: 12,
    borderRadius: 14,
    background: "rgba(0,0,0,0.55)",
    border: "1px solid rgba(255,255,255,0.18)",
    color: "white",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    backdropFilter: "blur(6px)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  status: {
    fontSize: 12,
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.18)",
    opacity: 0.9,
  },
  box: {
    minHeight: 70,
    padding: 10,
    borderRadius: 12,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    lineHeight: 1.35,
    fontSize: 14,
    whiteSpace: "pre-wrap",
  },
  error: {
    marginBottom: 8,
    padding: 10,
    borderRadius: 12,
    background: "rgba(255, 80, 80, 0.18)",
    border: "1px solid rgba(255, 80, 80, 0.35)",
    fontSize: 13,
  },
  hint: { marginTop: 8, fontSize: 12, opacity: 0.75 },
};
