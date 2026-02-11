import { useEffect } from "react";
import { useSpeechToText } from "../hooks/useSpeechToText";

export default function SpeechToTextPanel() {
  const {
    isSupported,
    isListening,
    transcript,
    error,
    start,
    stop,
    reset,
  } = useSpeechToText({ lang: "en-SG" });

  // Spacebar toggles start/stop (so you don't need to click)
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        if (isListening) stop();
        else start();
      }
      if (e.code === "Escape") {
        reset();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isListening, start, stop, reset]);

  if (!isSupported) return null;

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <div style={{ fontWeight: 700 }}>Speech</div>
        <div style={styles.status}>{isListening ? "Listening…" : "Idle"}</div>
      </div>

      {error ? (
        <div style={styles.error}>
          <div><b>Error:</b> {error}</div>
          <div style={{ opacity: 0.85, fontSize: 12 }}>
            Allow microphone permission in browser.
          </div>
        </div>
      ) : null}

      <div style={styles.box}>
        {transcript ? transcript : <span style={{ opacity: 0.6 }}>Say something…</span>}
      </div>

      <div style={styles.hint}>
        Space = start/stop • Esc = clear
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    position: "fixed",
    left: 16,
    bottom: 16,
    width: 360,
    zIndex: 999999, // above overlays
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
