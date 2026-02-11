import CalibrateOverlay from "./components/CalibrateOverlay";
import GazeDot from "./components/GazeDot";
import SpeechToTextPanel from "./components/SpeechToTextPanel";

export default function App() {
  return (
    <>
      <CalibrateOverlay />
      <GazeDot />

      {/* Speech panel overlay */}
      <SpeechToTextPanel />
    </>
  );
}
