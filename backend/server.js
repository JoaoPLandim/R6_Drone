import express from "express";
import cors from "cors";
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("R6_Drone.db");
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
    CREATE TABLE IF NOT EXISTS cameras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'webcam'
    );

    CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        camera_id INTEGER NOT NULL REFERENCES cameras(id),
        start_time TEXT NOT NULL DEFAULT (datetime('now')),
        end_time TEXT
    );

    CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL REFERENCES sessions(id),
        label TEXT NOT NULL,
        score REAL NOT NULL,
        bbox TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
`)

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => { 
  res.json({ ok: true, service: "R6_Drone-backend" });
});

//cams
app.get("/api/cameras", (req, res) => {
    const cameras = db.prepare("SELECT * FROM cameras ORDER BY id").all();
    res.json(cameras);
});

app.post("/api/cameras", (req, res) => {
  const { name, kind = "webcam" } = req.body ?? {};
  if (!name) return res.status(400).json({ error: "name is required" });

  const info = db.prepare("INSERT INTO cameras (name, kind) VALUES (?, ?)").run(name, kind);
  const camera = db.prepare("SELECT * FROM cameras WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json(camera);
});

//sessions
app.post("/api/sessions/start", (req, res) => {
  const { camera_id } = req.body ?? {};
  if (!camera_id) return res.status(400).json({ error: "camera_id is required" });

  const info = db.prepare("INSERT INTO sessions (camera_id) VALUES (?)").run(camera_id);
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json(session);
});

app.post("/api/sessions/:id/stop", (req, res) => {
  const info = db
    .prepare("UPDATE sessions SET end_time = datetime('now') WHERE id = ? AND end_time IS NULL")
    .run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "active session not found" });
  res.json(db.prepare("SELECT * FROM sessions WHERE id = ?").get(req.params.id));
});

//events
app.post("/api/events", (req, res) => {
  const { session_id, label, score, bbox } = req.body ?? {};
  if (!session_id || !label || score == null) {
    return res.status(400).json({ error: "session_id, label, and score are required" });
  }
  const info = db
    .prepare("INSERT INTO events (session_id, label, score, bbox) VALUES (?, ?, ?, ?)")
    .run(session_id, label, score, JSON.stringify(bbox ?? null));
  res.status(201).json({ id: info.lastInsertRowid });
});

app.get("/api/events", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  const rows = db.prepare(`
    SELECT e.id, e.label, e.score, e.created_at, s.camera_id, c.name AS camera_name
    FROM events e
    JOIN sessions s ON s.id = e.session_id
    JOIN cameras c ON c.id = s.camera_id
    ORDER BY e.id DESC
    LIMIT ?
  `).all(limit);
  res.json(rows);
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`R6_Drone backend listening on http://localhost:${PORT}`);
});