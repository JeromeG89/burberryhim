import { useEffect, useState } from "react";
import { useSpeechToText } from "../hooks/useSpeechToText";

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

  // --- NEW: AI FETCH LOGIC ---
  const fetchQuestions = async (text) => {
    if (!text) return;
    setLoading(true);
    try {
      const response = await fetch(
        "http://localhost:8000/get-educational-questions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: text }),
        }
      );
      const data = await response.json();
      setQuestions(data.questions || []);
    } catch (err) {
      console.error("AI Error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Only trigger when you STOP speaking and have a valid final result
    if (!isListening && finalTranscript) {
      fetchQuestions(finalTranscript);
    }
  }, [isListening, finalTranscript]); // Use finalTranscript as the dependency

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        if (isListening) stop();
        else start();
      }
      if (e.code === "Escape") {
        reset();
        setQuestions([]); // Clear questions on reset
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isListening, start, stop, reset]);

  if (!isSupported) return null;

  return (
    <>
      {/* 1. NEW: THE 6 QUESTIONS GRID (Center of Screen) */}
      {questions.length > 0 && (
        <div style={styles.gridOverlay}>
          {questions.map((q, idx) => (
            <div key={idx} style={styles.gazeButton} className="gaze-target">
              {q}
            </div>
          ))}
        </div>
      )}

      {/* 2. THE EXISTING SPEECH PANEL */}
      <div style={styles.wrap}>
        <div style={styles.header}>
          <div style={{ fontWeight: 700 }}>
            Speech {loading && "• Generating..."}
          </div>
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
          {transcript ? (
            transcript
          ) : (
            <span style={{ opacity: 0.6 }}>Say something…</span>
          )}
        </div>

        <div style={styles.hint}>Space = start/stop • Esc = clear</div>
      </div>
    </>
  );
}

const styles = {
  // NEW STYLES FOR THE GAZE BUTTONS
  gridOverlay: {
    position: "fixed",
    top: "10%",
    left: "10%",
    width: "80%",
    height: "60%",
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)", // 3 columns
    gridTemplateRows: "repeat(2, 1fr)", // 2 rows
    gap: "20px",
    zIndex: 999998,
  },
  gazeButton: {
    background: "rgba(255, 255, 255, 0.15)",
    border: "2px solid rgba(255, 255, 255, 0.3)",
    borderRadius: "16px",
    color: "black",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    textAlign: "center",
    fontSize: "18px",
    backdropFilter: "blur(10px)",
    transition: "all 0.2s ease",
  },
  // YOUR EXISTING STYLES
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
