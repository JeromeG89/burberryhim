import React from "react";
import { useGaze } from "../hooks/useGaze";

export default function GazeDot() {
  const { x, y, calibrated } = useGaze();

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999999 }}>
      <div
        style={{
          position: "absolute",
          left: `${x * 100}%`,
          top: `${y * 100}%`,
          transform: "translate(-50%, -50%)",
          width: 18,
          height: 18,
          borderRadius: 9999,
          background: calibrated ? "#00ff66" : "#777",
          boxShadow: "0 0 18px rgba(0,0,0,0.35)",
          border: "2px solid rgba(255,255,255,0.8)",
        }}
      />
    </div>
  );
}
