import React, { useState, useEffect, useRef } from "react";
import { useGaze } from "../hooks/useGaze";
import { captureCalibration, resetCalibration } from "../api/gazeApi";

export default function GazeDot() {
  const { x, y, calibrated, blink } = useGaze();
  const lastBlinkTime = useRef(0);
  const blinkStartRef = useRef(null); // Track when current blink started

  const [isDoubleBlinking, setIsDoubleBlinking] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [isHoldingReset, setIsHoldingReset] = useState(false);

  useEffect(() => {
    let holdInterval = null;

    if (blink) {
      // 1. Record the start time of the blink
      if (!blinkStartRef.current) {
        blinkStartRef.current = Date.now();
      }

      // 2. Monitor for the Long Blink Reset while eyes are closed
      holdInterval = setInterval(() => {
        if (blinkStartRef.current) {
          const holdDuration = Date.now() - blinkStartRef.current;
          if (holdDuration > 2000) {
            handleLongBlinkReset();
            clearInterval(holdInterval);
            blinkStartRef.current = null;
          } else if (holdDuration > 1000) {
            setIsHoldingReset(true);
          }
        }
      }, 100);
    } else {
      // 3. Eyes JUST opened - check if this was a pulse for calibration
      if (blinkStartRef.current) {
        const duration = Date.now() - blinkStartRef.current;
        setIsHoldingReset(false);

        // IMPORTANT: If the eye was closed for less than 800ms, treat it as a potential double-blink
        if (duration < 800 && !calibrated) {
          const currentTime = Date.now();
          const timeDiff = currentTime - lastBlinkTime.current;

          // Check if this is the second pulse in the sequence
          if (timeDiff > 50 && timeDiff < 700) {
            if (countdown === null) {
              console.log("Valid Double-Blink detected for capture");
              triggerCountdown();
            }
          }
          lastBlinkTime.current = currentTime;
        }
        blinkStartRef.current = null;
      }
      if (holdInterval) clearInterval(holdInterval);
    }

    return () => {
      if (holdInterval) clearInterval(holdInterval);
    };
  }, [blink, calibrated, countdown]);

  const handleLongBlinkReset = async () => {
    try {
      console.log("Long blink detected! Resetting calibration...");
      await resetCalibration();
      // Reload the page to ensure all component states (steps, etc.) are fresh
      window.location.reload();
    } catch (err) {
      console.error("Reset failed:", err);
    }
  };

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
      if (data.ok) {
        window.dispatchEvent(new CustomEvent("calibration-point-captured"));
      }
    } catch (err) {
      console.error("Capture API error:", err);
    } finally {
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
        zIndex: 9999999,
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
          // Background color transitions to white when holding for a reset
          background: isHoldingReset
            ? "#ffffff"
            : countdown
            ? "#FFD700"
            : blink
            ? "#ff3333"
            : calibrated
            ? "#00ff66"
            : "#777",
          boxShadow: isHoldingReset
            ? "0 0 30px #ffffff"
            : countdown
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

      {isHoldingReset && (
        <div style={styles.resetText}>KEEP HOLDING TO RESET...</div>
      )}

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
  resetText: {
    position: "absolute",
    left: "50%",
    top: "40%",
    transform: "translateX(-50%)",
    color: "#ffffff",
    fontSize: "20px",
    fontWeight: "bold",
    textShadow: "0 0 10px rgba(0,0,0,0.5)",
  },
};
