import { useEffect, useRef, useState } from "react";

export function useGaze() {
  const [gaze, setGaze] = useState({
    x: 0.5,
    y: 0.5,
    calibrated: false,
    blink: false, // Added blink property to the initial state
    ts_ms: 0,
  });

  const wsRef = useRef(null);

  useEffect(() => {
    // Guard: don't create multiple sockets
    if (wsRef.current) return;

    const ws = new WebSocket("ws://localhost:8000/gaze/ws");
    wsRef.current = ws;

    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);

        // Ensure we capture all properties sent from the backend (x, y, blink, calibrated)
        if (typeof data?.x === "number" && typeof data?.y === "number") {
          setGaze(data);
        }
      } catch (e) {
        console.error("Bad WS message:", e);
      }
    };

    ws.onerror = (e) => console.error("gaze ws error:", e);

    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  return gaze;
}
