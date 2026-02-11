import React, { useEffect, useMemo, useRef, useState } from "react";
import { useGaze } from "../hooks/useGaze";

const API_BASE = "https://burberryhim.onrender.com";

// layout (5 tiles total = 2 rows x 3 cols, last tile reserved for BACK)
const GRID_COLS = 3;
const GRID_ROWS = 2;

// dwell config
const DWELL_MS = 2000;
const COOLDOWN_MS = 1200;

// ---------- helpers ----------
function normalizeXY(x, y) {
  // already normalized
  if (
    typeof x === "number" &&
    typeof y === "number" &&
    x >= 0 &&
    x <= 1 &&
    y >= 0 &&
    y <= 1
  ) {
    return { nx: x, ny: y };
  }
  // pixel coords -> normalize to viewport
  const w = Math.max(1, window.innerWidth);
  const h = Math.max(1, window.innerHeight);
  return { nx: (x ?? 0) / w, ny: (y ?? 0) / h };
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

// ---------- Loading Overlay (inline component) ----------
function LoadingOverlay({ visible, title = "Thinking…", subtitle = "Please wait" }) {
  if (!visible) return null;

  // inject keyframes once
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

  return (
    <div style={loadingStyles.overlay}>
      <div style={loadingStyles.card}>
        <div style={loadingStyles.spinner} />
        <div style={loadingStyles.title}>{title}</div>
        <div style={loadingStyles.subtitle}>{subtitle}</div>
      </div>
    </div>
  );
}

const loadingStyles = {
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

export default function GazeQuestionsGrid({
  questions,
  prompt,
  onClear,
  onMicRequest, // start recording
  onMicStop, // optional: stop recording
  isRecording = false, // IMPORTANT: passed from parent, default false

  // NEW: parent can pass this while speech->text is being sent / transcribed
  isTranscribing = false, // default false
}) {
  const { x, y, calibrated } = useGaze();
  const { nx, ny } = useMemo(() => normalizeXY(x, y), [x, y]);

  // modes: idle -> grid -> explain
  const [mode, setMode] = useState("idle");

  // 5 questions max
  const q5 = (questions || []).slice(0, 5);
  const hasQuestions = q5.length > 0;

  // explain data
  const [activeQuestion, setActiveQuestion] = useState("");
  const [explanation, setExplanation] = useState("");
  const [followUps, setFollowUps] = useState([]);
  const [fuSelectedIndex, setFuSelectedIndex] = useState(-1);

  // split loading (overlay only blocks while explanation is generating)
  const [loadingExplanation, setLoadingExplanation] = useState(false);
  const [loadingFollowups, setLoadingFollowups] = useState(false);

  const [err, setErr] = useState("");

  // hover state (single source of truth)
  // grid: -1 none, 0..4 questions, 5 back tile
  const [gridHoverIndex, setGridHoverIndex] = useState(-1);

  // explain: -1 none, 0 back card, 1 follow-up top, 2 follow-up bottom
  const [explainHoverTarget, setExplainHoverTarget] = useState(-1);

  // idle: mic hover
  const [idleHover, setIdleHover] = useState(false);

  // dwell controller (one for whichever mode is active)
  const dwell = useRef({
    target: -1,
    start: 0,
    lastFire: 0,
    progress: 0,
  });

  const [dwellProgress, setDwellProgress] = useState(0);

  // switch modes when questions appear/disappear
  useEffect(() => {
    if (mode === "explain") return;
    setMode(hasQuestions ? "grid" : "idle");
  }, [hasQuestions]); // eslint-disable-line

  // ---------- hit testing ----------
  // IDLE mic bounds: matches styles.micButton position (center)
  function hitMic(nx, ny) {
    // big centered button area
    const left = 0.25,
      right = 0.75,
      top = 0.25,
      bottom = 0.80;
    return nx >= left && nx <= right && ny >= top && ny <= bottom;
  }

  // IMPORTANT: do not allow hover over empty tiles
  function hitGrid(nx, ny, qCount) {
    // gridOverlay: top 6%, left 6%, width 88%, height 72%
    const left = 0.06,
      top = 0.06,
      width = 0.88,
      height = 0.72;

    if (nx < left || nx > left + width || ny < top || ny > top + height) return -1;

    const relX = (nx - left) / width;
    const relY = (ny - top) / height;

    const col = Math.min(GRID_COLS - 1, Math.max(0, Math.floor(relX * GRID_COLS)));
    const row = Math.min(GRID_ROWS - 1, Math.max(0, Math.floor(relY * GRID_ROWS)));

    const idx = row * GRID_COLS + col; // 0..5
    if (idx < 0 || idx > 5) return -1;

    if (idx === 5) return 5; // BACK always valid
    if (idx >= qCount) return -1; // empty tile => ignore
    return idx;
  }

  function hitExplain(nx, ny) {
    // right half
    if (nx < 0.5) return -1;

    // top back region
    const BACK_Y_MAX = 0.22;
    if (ny <= BACK_Y_MAX) return 0;

    if (!followUps || followUps.length < 2) return -1;

    const relY = (ny - BACK_Y_MAX) / (1 - BACK_Y_MAX);
    return relY < 0.5 ? 1 : 2;
  }

  // update hover states
  useEffect(() => {
    if (!calibrated) {
      setIdleHover(false);
      setGridHoverIndex(-1);
      setExplainHoverTarget(-1);
      return;
    }

    if (mode === "idle") {
      setIdleHover(hitMic(nx, ny));
    } else if (mode === "grid") {
      setGridHoverIndex(hitGrid(nx, ny, q5.length));
    } else if (mode === "explain") {
      setExplainHoverTarget(hitExplain(nx, ny));
    }
  }, [mode, calibrated, nx, ny, followUps, q5.length]);

  // ---------- dwell loop (ONE RAF) ----------
  useEffect(() => {
    let raf = 0;

    function tick() {
      const t = Date.now();

      // determine current hover target depending on mode
      let hoverTarget = -1;

      if (!calibrated) {
        hoverTarget = -1;
      } else if (mode === "idle") {
        hoverTarget = idleHover ? 100 : -1; // 100 = mic
      } else if (mode === "grid") {
        hoverTarget = gridHoverIndex; // -1 or 0..5
      } else if (mode === "explain") {
        hoverTarget = explainHoverTarget; // -1 or 0..2
      }

      // cooldown
      if (t - dwell.current.lastFire < COOLDOWN_MS) {
        dwell.current.target = -1;
        dwell.current.start = 0;
        dwell.current.progress = 0;
        setDwellProgress(0);
        raf = requestAnimationFrame(tick);
        return;
      }

      // no hover -> reset
      if (hoverTarget === -1) {
        dwell.current.target = -1;
        dwell.current.start = 0;
        dwell.current.progress = 0;
        setDwellProgress(0);
        raf = requestAnimationFrame(tick);
        return;
      }

      // lock target if none
      if (dwell.current.target === -1) {
        dwell.current.target = hoverTarget;
        dwell.current.start = t;
        dwell.current.progress = 0;
        setDwellProgress(0);
        raf = requestAnimationFrame(tick);
        return;
      }

      // sticky target: only progress if still on SAME target
      if (hoverTarget !== dwell.current.target) {
        // tiny decay instead of reset (prevents jitter killing dwell)
        dwell.current.progress = Math.max(0, dwell.current.progress - 0.02);
        setDwellProgress(dwell.current.progress);
        raf = requestAnimationFrame(tick);
        return;
      }

      // progress
      const elapsed = t - dwell.current.start;
      const prog = clamp01(elapsed / DWELL_MS);
      dwell.current.progress = prog;
      setDwellProgress(prog);

      if (elapsed >= DWELL_MS) {
        const firedTarget = dwell.current.target;

        dwell.current.lastFire = t;
        dwell.current.target = -1;
        dwell.current.start = 0;
        dwell.current.progress = 0;
        setDwellProgress(0);

        // FIRE ACTION
        if (mode === "idle" && firedTarget === 100) {
          if (isRecording) onMicStop?.();
          else onMicRequest?.();
        }

        if (mode === "grid" && firedTarget >= 0) {
          if (firedTarget === 5) {
            goToIdleWhite();
          } else {
            if (!q5[firedTarget]) {
              raf = requestAnimationFrame(tick);
              return;
            }
            selectQuestionFromGrid(firedTarget);
          }
        }

        if (mode === "explain" && firedTarget >= 0) {
          if (firedTarget === 0) {
            setMode("grid");
          } else if (firedTarget === 1 || firedTarget === 2) {
            const idx = firedTarget === 1 ? 0 : 1;
            selectFollowUp(idx);
          }
        }
      }

      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [
    mode,
    calibrated,
    idleHover,
    gridHoverIndex,
    explainHoverTarget,
    isRecording,
    onMicRequest,
    onMicStop,
    q5,
  ]);

  // ---------- actions ----------
  async function selectQuestionFromGrid(idx) {
    // IMPORTANT: only block if prompt is null/undefined, NOT if it's ""
    if (prompt == null) return;

    const q = q5[idx];
    if (!q) return;

    await fetchExplanationAndFollowups(q);
    setMode("explain");
  }

  async function selectFollowUp(idx) {
    const q = followUps[idx];
    if (!q) return;
    setFuSelectedIndex(idx);
    await fetchExplanationAndFollowups(q);
  }

  async function fetchExplanationAndFollowups(question) {
    setErr("");
    setActiveQuestion(question);
    setExplanation("");
    setFollowUps([]);
    setFuSelectedIndex(-1);

    try {
      // 1) explanation (BLOCKING overlay)
      setLoadingExplanation(true);
      const res = await fetch(`${API_BASE}/get-educational-explanation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, question }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const text = (data.explanation || "").trim();
      setExplanation(text);
      setLoadingExplanation(false);

      // 2) followups (non-blocking; UI stays visible)
      setLoadingFollowups(true);
      const qRes = await fetch(`${API_BASE}/get-followup-questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, question, explanation: text }),
      });
      if (!qRes.ok) throw new Error(await qRes.text());
      const qData = await qRes.json();
      const fqs = Array.isArray(qData.followups) ? qData.followups : [];
      setFollowUps(fqs.slice(0, 2));
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoadingExplanation(false);
      setLoadingFollowups(false);
    }
  }

  function goToIdleWhite() {
    setMode("idle");
    setActiveQuestion("");
    setExplanation("");
    setFollowUps([]);
    setFuSelectedIndex(-1);
    setErr("");
    setLoadingExplanation(false);
    setLoadingFollowups(false);
    onClear?.();
  }

  // ESC
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code !== "Escape") return;
      if (mode === "explain") setMode("grid");
      else if (mode === "grid") goToIdleWhite();
      else onClear?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode]); // eslint-disable-line

  const pct = Math.round(dwellProgress * 100);
  const tiles = [...q5, "BACK"];

  // NEW: show overlay when either explanation is being generated OR speech->text is being sent/transcribed
  const showOverlay = Boolean(loadingExplanation || isTranscribing);

  return (
    <>
      {/* FULLSCREEN LOADING OVERLAY (EXPLANATION OR TRANSCRIPTION) */}
      <LoadingOverlay
        visible={showOverlay}
        title={isTranscribing ? "Transcribing speech…" : "Generating explanation…"}
        subtitle={isTranscribing ? "Sending audio to backend" : "Please wait"}
      />

      {/* DEBUG HUD (REMOVE LATER) */}
      {/* <div style={styles.debugHud}>
        mode:{mode} cal:{String(calibrated)} rec:{String(isRecording)} transcribing:
        {String(isTranscribing)}
        <br />
        nx:{nx.toFixed(3)} ny:{ny.toFixed(3)} pct:{pct}%
        <br />
        gridHover:{gridHoverIndex} explainHover:{explainHoverTarget} idleHover:{String(idleHover)}
        <br />
        promptLen:{String((prompt ?? "").length)} qCount:{q5.length}
        <br />
        loadingExp:{String(loadingExplanation)} loadingFU:{String(loadingFollowups)}
      </div> */}

      {/* IDLE WHITE PAGE */}
      {mode === "idle" && (
        <div style={styles.idleScreen}>
          <div style={styles.idleHint}>
            {calibrated ? "Look at the mic to start/stop recording" : "Calibrate gaze first"}
          </div>

          <div
            style={{
              ...styles.micButton,
              ...(idleHover ? styles.hoveredNoMove : null),
            }}
          >
            <div style={{ fontSize: 160, fontWeight: 900, lineHeight: 1 }}>🎤</div>

            <div style={{ marginTop: 22, fontSize: 54, fontWeight: 950 }}>
              {isRecording ? "Recording…" : "Start Recording"}
            </div>

            <div style={{ marginTop: 16, fontSize: 24, fontWeight: 900, opacity: 0.75 }}>
              Hold gaze for {DWELL_MS / 1000}s
            </div>

            {/* Recording indicator */}
            {isRecording && <div style={styles.recordPill}>● LIVE</div>}

            {idleHover && calibrated && (
              <>
                <div style={{ marginTop: 18, fontSize: 18, fontWeight: 900, opacity: 0.9 }}>
                  Selecting… {pct}%
                </div>
                <div style={{ ...styles.progressTrack, marginTop: 12 }}>
                  <div style={{ ...styles.progressFill, width: `${pct}%` }} />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* GRID MODE */}
      {mode === "grid" && hasQuestions && (
        <>
          <div style={styles.gridOverlay}>
            {tiles.map((label, idx) => {
              const isHover = idx === gridHoverIndex;
              const isBackTile = idx === 5;

              return (
                <div
                  key={idx}
                  style={{
                    ...styles.gridCard,
                    ...(isBackTile ? styles.backTile : null),
                    ...(isHover ? styles.hoveredNoMove : null),
                  }}
                >
                  {label}

                  {isHover && calibrated && (
                    <>
                      <div style={styles.dwellHint}>Selecting… {pct}%</div>
                      <div style={styles.progressTrackAbs}>
                        <div style={{ ...styles.progressFill, width: `${pct}%` }} />
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div style={styles.gridTopBar}>
            <div style={{ fontWeight: 900 }}>Questions (5 + Back)</div>
            <div style={{ opacity: 0.85 }}>
              {calibrated ? "Gaze calibrated" : "Gaze not calibrated"}
            </div>
            <button style={styles.smallBtn} onClick={goToIdleWhite}>
              Clear
            </button>
          </div>
        </>
      )}

      {/* EXPLAIN MODE */}
      {mode === "explain" && (
        <div style={styles.fullscreen}>
          {/* LEFT HALF */}
          <div style={styles.mainCol}>
            <div style={styles.mainHeader}>
              <div style={{ fontWeight: 900, fontSize: 18 }}>Explanation</div>
              <div style={{ opacity: 0.85 }}>{loadingExplanation ? "Thinking…" : ""}</div>
              <div style={{ flex: 1 }} />
            </div>

            <div style={styles.questionPill}>
              <b>Q:</b> {activeQuestion || "(none)"}
            </div>

            {err && <div style={styles.errBox}>{err}</div>}

            <div style={styles.chatBody}>
              {explanation ? explanation : <span style={{ opacity: 0.7 }}>Waiting…</span>}
            </div>
          </div>

          {/* RIGHT HALF */}
          <div style={styles.sideCol}>
            <div
              style={{
                ...styles.bigBackCard,
                ...(explainHoverTarget === 0 ? styles.hoveredNoMove : null),
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontWeight: 950, fontSize: 26 }}>← Back to Questions</div>
                <div style={{ fontWeight: 900, opacity: 0.85 }}>
                  {explainHoverTarget === 0 && calibrated ? `${pct}%` : ""}
                </div>
              </div>

              {explainHoverTarget === 0 && calibrated && (
                <div style={{ marginTop: 14 }}>
                  <div style={styles.progressTrack}>
                    <div style={{ ...styles.progressFill, width: `${pct}%` }} />
                  </div>
                </div>
              )}

              <div style={{ marginTop: 12, fontSize: 14, opacity: 0.85 }}>
                Hold gaze {DWELL_MS / 1000}s
              </div>
            </div>

            <div style={styles.sideTitleBig}>Follow-ups</div>

            <div style={styles.followUpWrap}>
              {[0, 1].map((i) => {
                const text = followUps[i] || (loadingFollowups ? "Generating…" : "—");
                const isHover = i === 0 ? explainHoverTarget === 1 : explainHoverTarget === 2;

                return (
                  <div
                    key={i}
                    style={{
                      ...styles.followUpCard,
                      ...(isHover ? styles.hoveredNoMove : null),
                      opacity: followUps[i] ? 1 : 0.7,
                    }}
                  >
                    {text}

                    {isHover && followUps[i] && calibrated && (
                      <>
                        <div style={styles.dwellHint}>Selecting… {pct}%</div>
                        <div style={styles.progressTrackAbs}>
                          <div style={{ ...styles.progressFill, width: `${pct}%` }} />
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {!calibrated && (
              <div style={{ marginTop: 12, fontSize: 12, opacity: 0.85 }}>
                (Gaze not calibrated — selection won’t work)
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const styles = {
  debugHud: {
    position: "fixed",
    bottom: 12,
    right: 12,
    zIndex: 9999999,
    background: "rgba(0,0,0,0.75)",
    color: "white",
    padding: "8px 10px",
    borderRadius: 10,
    fontSize: 12,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },

  smallBtn: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.25)",
    background: "rgba(255,255,255,0.10)",
    color: "white",
    cursor: "pointer",
    fontWeight: 800,
  },

  // IDLE WHITE PAGE
  idleScreen: {
    position: "fixed",
    inset: 0,
    background: "white",
    zIndex: 999990,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  },
  idleHint: {
    position: "fixed",
    top: 24,
    left: "50%",
    transform: "translateX(-50%)",
    fontSize: 18,
    fontWeight: 900,
    color: "#111",
    opacity: 0.7,
  },

  micButton: {
    width: 680,
    height: 520,
    borderRadius: 46,
    border: "3px solid rgba(0,0,0,0.12)",
    background: "rgba(255,255,255,0.97)",
    boxShadow: "0 40px 120px rgba(0,0,0,0.18)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    cursor: "pointer",
    position: "fixed",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
  },

  recordPill: {
    marginTop: 18,
    padding: "10px 18px",
    borderRadius: 999,
    background: "rgba(255,0,0,0.12)",
    border: "2px solid rgba(255,0,0,0.45)",
    color: "#b00000",
    fontWeight: 950,
    letterSpacing: 1,
    fontSize: 18,
  },

  // MAIN GRID
  gridOverlay: {
    position: "fixed",
    top: "6%",
    left: "6%",
    width: "88%",
    height: "72%",
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gridTemplateRows: "repeat(2, 1fr)",
    gap: 28,
    zIndex: 999998,
    pointerEvents: "none",
  },

  gridCard: {
    position: "relative",
    background: "rgba(255, 255, 255, 0.18)",
    border: "2px solid rgba(255, 255, 255, 0.35)",
    borderRadius: 26,
    color: "black",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 34,
    textAlign: "center",
    fontSize: 28,
    fontWeight: 800,
    lineHeight: 1.25,
    backdropFilter: "blur(10px)",
    transition: "box-shadow 0.12s ease, border-color 0.12s ease",
  },

  backTile: {
    background: "rgba(255, 60, 60, 0.22)",
    border: "2px solid rgba(255, 60, 60, 0.55)",
    color: "#7a0000",
  },

  gridTopBar: {
    position: "fixed",
    top: 16,
    left: 16,
    zIndex: 999999,
    padding: 12,
    borderRadius: 14,
    background: "rgba(0,0,0,0.55)",
    border: "1px solid rgba(255,255,255,0.18)",
    color: "white",
    display: "flex",
    alignItems: "center",
    gap: 12,
    backdropFilter: "blur(6px)",
  },

  // FULLSCREEN EXPLAIN
  fullscreen: {
    position: "fixed",
    inset: 0,
    zIndex: 999999,
    display: "flex",
    background: "rgba(10,10,10,0.92)",
    color: "white",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    backdropFilter: "blur(10px)",
  },

  mainCol: {
    width: "50%",
    padding: 26,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },

  sideCol: {
    width: "50%",
    borderLeft: "1px solid rgba(255,255,255,0.12)",
    padding: 24,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },

  mainHeader: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },

  questionPill: {
    padding: "14px 16px",
    borderRadius: 18,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.12)",
    lineHeight: 1.3,
    fontSize: 16,
  },

  chatBody: {
    flex: 1,
    padding: 18,
    borderRadius: 22,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    whiteSpace: "pre-wrap",
    overflow: "auto",
    lineHeight: 1.6,
    fontSize: 18,
  },

  bigBackCard: {
    width: "100%",
    padding: "22px 22px",
    borderRadius: 22,
    border: "2px solid rgba(255,255,255,0.22)",
    background: "rgba(255,255,255,0.10)",
    color: "white",
    transition: "box-shadow 0.12s ease, border-color 0.12s ease",
  },

  sideTitleBig: {
    fontWeight: 950,
    fontSize: 18,
    opacity: 0.9,
    paddingLeft: 4,
  },

  followUpWrap: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },

  followUpCard: {
    position: "relative",
    flex: 1,
    padding: 28,
    borderRadius: 24,
    background: "rgba(255,255,255,0.08)",
    border: "2px solid rgba(255,255,255,0.18)",
    transition: "box-shadow 0.12s ease, border-color 0.12s ease",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    whiteSpace: "pre-wrap",
    fontSize: 24,
    fontWeight: 800,
    lineHeight: 1.25,
  },

  // IMPORTANT: no transform here => no movement
  hoveredNoMove: {
    borderColor: "rgba(0, 255, 102, 0.9)",
    boxShadow: "0 0 0 6px rgba(0,255,102,0.18)",
  },

  dwellHint: {
    position: "absolute",
    top: 14,
    left: 16,
    right: 16,
    textAlign: "center",
    fontSize: 14,
    fontWeight: 800,
    opacity: 0.9,
    pointerEvents: "none",
  },

  progressTrack: {
    width: "100%",
    height: 12,
    borderRadius: 999,
    background: "rgba(0,0,0,0.16)",
    overflow: "hidden",
    pointerEvents: "none",
  },

  progressTrackAbs: {
    position: "absolute",
    bottom: 14,
    left: 18,
    right: 18,
    height: 12,
    borderRadius: 999,
    background: "rgba(0,0,0,0.16)",
    overflow: "hidden",
    pointerEvents: "none",
  },

  progressFill: {
    height: "100%",
    borderRadius: 999,
    background: "rgba(0, 255, 102, 0.85)",
  },

  errBox: {
    padding: 12,
    borderRadius: 14,
    background: "rgba(255, 80, 80, 0.18)",
    border: "1px solid rgba(255, 80, 80, 0.35)",
    fontSize: 13,
  },
};
