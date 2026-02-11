import React, { useMemo, useState } from "react";
import { captureCalibration, resetCalibration } from "../api/gazeApi";

const STEPS = [
  { name: "TOP-LEFT", pos: { left: 30, top: 30 } },
  { name: "TOP-RIGHT", pos: { right: 30, top: 30 } },
  { name: "BOTTOM-LEFT", pos: { left: 30, bottom: 30 } },
  { name: "BOTTOM-RIGHT", pos: { right: 30, bottom: 30 } },
  {
    name: "CENTER",
    pos: { left: "50%", top: "50%", transform: "translate(-50%, -50%)" },
  },
];

export default function CalibrateOverlay() {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const done = step >= STEPS.length;
  const current = useMemo(() => (done ? null : STEPS[step]), [step, done]);

  async function onReset() {
    setErr("");
    setBusy(true);
    try {
      await resetCalibration();
      setStep(0);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function onCapture() {
    setErr("");
    setBusy(true);
    try {
      const data = await captureCalibration(); // { ok: true/false }
      if (!data.ok) {
        setErr("No face detected. Try again.");
        return;
      }
      setStep((s) => s + 1);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000005, // ✅ ALWAYS above your white idle screen
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 16,
          top: 16,
          padding: 12,
          borderRadius: 12,
          background: "rgba(0,0,0,0.65)",
          color: "white",
          width: 320,
          pointerEvents: "auto", // ✅ only this panel is clickable
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Calibration</div>

        {!done ? (
          <>
            <div style={{ marginBottom: 10 }}>
              Step {step + 1}/5: Look at <b>{current.name}</b>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button disabled={busy} onClick={onCapture}>
                {busy ? "..." : "Capture"}
              </button>
              <button disabled={busy} onClick={onReset}>
                Reset
              </button>
            </div>

            {err && <div style={{ marginTop: 8, color: "#ff8080" }}>{err}</div>}
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
              Tip: keep your head still; move only your eyes.
            </div>
          </>
        ) : (
          <>
            <div style={{ marginBottom: 10 }}>✅ Calibrated.</div>
            <button disabled={busy} onClick={onReset}>
              Reset & Recalibrate
            </button>
            {err && <div style={{ marginTop: 8, color: "#ff8080" }}>{err}</div>}
          </>
        )}
      </div>

      {!done && (
        <div
          style={{
            position: "absolute",
            width: 26,
            height: 26,
            borderRadius: 9999,
            background: "orange",
            boxShadow: "0 0 18px rgba(255,165,0,0.7)",
            pointerEvents: "none",
            ...current.pos,
          }}
        />
      )}
    </div>
  );
}
