import WebcamFeed from "./components/webcam.jsx";
import EventLog from "./components/EventLog.jsx";
import QueryBox from "./components/QueryBox.jsx";

export default function App() {
  return (
    <div>
      <h1>R6 Drone Console</h1>
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        <WebcamFeed />
        <EventLog />
      </div>
      <QueryBox />
    </div>
  );
}