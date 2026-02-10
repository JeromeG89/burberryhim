import { useEffect, useState } from "react";

export default function App() {
  const [status, setStatus] = useState("loading...");

  useEffect(() => {
    fetch("http://localhost:8000/health")
      .then((r) => r.json())
      .then((d) => setStatus(d.ok ? "Python server OK" : "Not OK"))
      .catch(() => setStatus("Python server not reachable"));
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <h1>Eye Tracking Local App</h1>
      <p>{status}</p>
    </div>
  );
}
