import CalibrateOverlay from "./components/CalibrateOverlay";
import GazeDot from "./components/GazeDot";
import SpeechToTextPanel from "./components/SpeechToTextPanel";

export default function App() {
  async function fetchQuestions(transcript) {
    try {
      const response = await fetch(
        "http://localhost:8000/get-educational-questions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: transcript }),
        }
      );

      const data = await response.json();
      // data.questions is now your array of 6 strings!
      displayGazeButtons(data.questions);
    } catch (error) {
      console.error("Failed to fetch questions:", error);
    }
  }
  return (
    <>
      <CalibrateOverlay />
      <GazeDot />

      {/* Speech panel overlay */}
      <SpeechToTextPanel />
    </>
  );
}
