import React, { useState, useEffect, useRef } from "react";
import { useGaze } from "../hooks/useGaze";
import { captureCalibration } from "../api/gazeApi";

export default function GazeDot() {
  const { x, y, calibrated, blink } = useGaze();
  const lastBlinkTime = useRef(0);
  const [isDoubleBlinking, setIsDoubleBlinking] = useState(false);
  const [countdown, setCountdown] = useState(null);

  useEffect(() => {
    // Only detect blinks for calibration if NOT already calibrated
    if (blink && !calibrated) {
      const currentTime = Date.now();
      const timeDiff = currentTime - lastBlinkTime.current;

      // Logic: Second blink must be 50ms to 600ms after the first
      if (timeDiff > 50 && timeDiff < 600) {
        if (countdown === null) {
          console.log("Double-blink detected! Starting countdown...");
          triggerCountdown();
        }
      }
      lastBlinkTime.current = currentTime;
    }
  }, [blink, calibrated, countdown]);

  const triggerCountdown = () => {
    setIsDoubleBlinking(true);
    let timer = 3;
    setCountdown(timer);

    const interval = setInterval(() => {
      timer -= 1;
      if (timer > 0) {
        setCountdown(timer);
      } else {
        clearInterval(interval);
        setCountdown("CAPTURING...");
        performCapture();
      }
    }, 333);
  };

  const performCapture = async () => {
    try {
      const data = await captureCalibration();
      console.log("Capture response:", data);
      if (data.ok) {
        // This tells CalibrateOverlay to move to the next dot
        window.dispatchEvent(new CustomEvent("calibration-point-captured"));
      } else {
        console.warn("Capture failed: Backend couldn't see face.");
      }
    } catch (err) {
      console.error("Capture API error:", err);
    } finally {
      // RESET everything so the next dot can be captured
      setCountdown(null);
      setIsDoubleBlinking(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 999999,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: `${x * 100}%`,
          top: `${y * 100}%`,
          transform: "translate(-50%, -50%)",
          width: countdown ? 45 : 16,
          height: countdown ? 45 : 16,
          borderRadius: 9999,
          background: countdown
            ? "#FFD700"
            : blink
            ? "#ff3333"
            : calibrated
            ? "#00ff66"
            : "#777",
          boxShadow: countdown
            ? "0 0 30px #FFD700"
            : blink
            ? "0 0 20px rgba(255, 51, 51, 0.6)"
            : "0 0 16px rgba(0,0,0,0.35)",
          transition: "all 0.1s ease",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "black",
          fontSize: "14px",
          fontWeight: "bold",
        }}
      >
        {countdown && typeof countdown === "number" ? countdown : ""}
      </div>

      {countdown && (
        <div style={styles.statusText}>
          {countdown === "CAPTURING..."
            ? "STAY STILL..."
            : `CAPTURE IN: ${countdown}`}
        </div>
      )}
    </div>
  );
}

const styles = {
  statusText: {
    position: "absolute",
    left: "50%",
    top: "45%",
    transform: "translateX(-50%)",
    color: "#FFD700",
    fontSize: "24px",
    fontWeight: "bold",
    textShadow: "2px 2px 8px rgba(0,0,0,0.8)",
  },
};
