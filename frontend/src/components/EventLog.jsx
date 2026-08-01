import { useEffect, useState } from "react";

export default function EventLog() {
  const [events, setEvents] = useState([]);

  async function refresh() {
    try {
      const res = await fetch("/api/events?limit=30");
      setEvents(await res.json());
    } catch {
      //backend down — keep showing what we have
    }
  }

  useEffect(() => {
    refresh(); //fetch immediately on mount
    const timer = setInterval(refresh, 5000); //now fetch every ~5s
    return () => clearInterval(timer); //cleanup at unmount
  }, []);

  return (
    <div>
      <h2>Event Log</h2>
      {events.length === 0 ? (
        <p>No events yet. Start the camera and step into frame.</p>
      ) : (
        <ul>
          {events.map((e) => (
            <li key={e.id}>
              {e.created_at.slice(11, 19)} — {e.label} ({(e.score * 100).toFixed(0)}%) — {e.camera_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}