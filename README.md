# R6 Drone

A working Rainbow Six Siege–style camera drone.

The current platform: a live camera feed with real-time, in-browser object
detection, where every detection is routed through a REST API into a SQL event
store. So the drone can eventually answer questions like *"when did you last
see a person?"*

**Status: software platform running on a laptop webcam. Robot chassis (2-wheeled,
drivable) is the next phase.**

<!-- Camera sources are pluggable (`cameras.kind`): laptop webcam today; -->
phone (WebRTC) and a simulated drone camera (ROS 2 / Gazebo) planned.

## What works today

- Live webcam capture in the browser (`getUserMedia`)
- Real-time object detection fully client-side (TensorFlow.js, COCO-SSD,
  ~2.5 FPS, no GPU server)
- Bounding-box overlay with class labels and confidence scores
- Detection events rate-limited per class (10 s cooldown) and persisted via
  REST into SQLite: cameras → sessions → events
- Relational schema with enforced foreign keys and JOIN-based event queries

## Run it

Requires Node 22.13+ (uses the built-in `node:sqlite` module).

```bash
# Terminal 1 — backend on :4000
cd backend
npm install
npm run dev

# Terminal 2 — frontend on :5173
cd frontend
npm install
npm run dev
```

Open http://localhost:5173, click **Start Camera**, and step into frame.
The first start downloads the detection model (~6 MB, cached after).
See logged events at http://localhost:4000/api/events.

## Roadmap

- [ ] Live event log + stats panel in the UI
- [ ] LLM natural-language queries over the event store
- [ ] Phone as a second camera (WebRTC)
- [ ] Simulated drone camera via ROS 2 / Gazebo
- [ ] Physical chassis: 2-wheeled drivable robot with the camera onboard