import React from "react";
import { useGaze } from "../hooks/useGaze";

export default function GazeDot() {
  const { x, y, calibrated } = useGaze();

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: `${x * 100}%`,
          top: `${y * 100}%`,
          transform: "translate(-50%, -50%)",
          width: 16,
          height: 16,
          borderRadius: 9999,
          background: calibrated ? "#00ff66" : "#777",
          boxShadow: "0 0 16px rgba(0,0,0,0.35)",
        }}
      />
    </div>
  );
}
