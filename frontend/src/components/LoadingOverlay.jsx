import React from "react";

export default function LoadingOverlay({
  visible,
  title = "Thinking…",
  subtitle = "Hold on a sec",
}) {
  if (!visible) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <div style={styles.spinner} />
        <div style={styles.title}>{title}</div>
        <div style={styles.subtitle}>{subtitle}</div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 99999999,
    background: "rgba(10,10,10,0.72)",
    backdropFilter: "blur(10px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  },
  card: {
    width: "min(560px, 92vw)",
    borderRadius: 24,
    padding: "26px 26px",
    border: "2px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 14,
    boxShadow: "0 30px 120px rgba(0,0,0,0.45)",
  },
  title: {
    fontSize: 26,
    fontWeight: 950,
    letterSpacing: 0.2,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    fontWeight: 800,
    opacity: 0.85,
    textAlign: "center",
  },
  spinner: {
    width: 56,
    height: 56,
    borderRadius: 999,
    border: "6px solid rgba(255,255,255,0.20)",
    borderTopColor: "rgba(0,255,102,0.95)",
    animation: "spin 0.85s linear infinite",
  },
};

// Inject keyframes once (no CSS file needed)
if (typeof document !== "undefined" && !document.getElementById("loading-overlay-kf")) {
  const style = document.createElement("style");
  style.id = "loading-overlay-kf";
  style.innerHTML = `
    @keyframes spin { 
      from { transform: rotate(0deg); } 
      to { transform: rotate(360deg); } 
    }
  `;
  document.head.appendChild(style);
}
