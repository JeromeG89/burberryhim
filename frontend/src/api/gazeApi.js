const API_BASE = "http://127.0.0.1:8000";

export async function resetCalibration() {
  const res = await fetch(`${API_BASE}/gaze/calibrate/reset`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function captureCalibration() {
  const res = await fetch(`${API_BASE}/gaze/calibrate/capture`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // { ok: true/false }
}
