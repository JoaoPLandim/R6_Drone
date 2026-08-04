import express from "express";
import cors from "cors";
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("R6_Drone.db"); //pragmas are settings
db.exec("PRAGMA journal_mode = WAL;"); //WAL means that writes are written on a log so reads dont have to wait
db.exec("PRAGMA foreign_keys = ON;"); //ON makes the database enforce my refenrences

//create tables, IF NOT EXIST makes this idempotent, it can run multiple times without changing the dadtabase.
//do if it runs twice it wont make the table twice
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

//middleware
const app = express();  //express() makes an empty pipeline and routing table
app.use(cors());        //app.use adds middleware to the pipeline.
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

//natural language queries
//LLM classifies the question into intent, doesnt mess w the SQL
const intentHandlers = {
  last_seen: (p) => {
    const row = db
      .prepare("SELECT label, score, created_at FROM events WHERE label = ? ORDER BY id DESC LIMIT 1")
      .get(p.label);
    return row
      ? `Last saw "${row.label}" at ${row.created_at} (${Math.round(row.score * 100)}% confidence).`
      : `I've never seen "${p.label}".`;
  },
  count: (p) => {
    const row = db
      .prepare("SELECT COUNT(*) AS n FROM events WHERE label = ?")
      .get(p.label);
    return `"${p.label}" has been detected ${row.n} time(s) total.`;
  },
  list_recent: () => {
    const rows = db
    .prepare("SELECT label, created_at FROM events ORDER BY id DESC LIMIT 5")
    .all();
    if (rows.length === 0) return "No events logged yet.";
    return "Recent sightings: " + rows.map((r) => `${r.label} at ${r.created_at}`).join("; ");
  },
};

app.post("/api/query", async (req, res) => {
  const { question } = req.body ?? {};
  if (!question) return res.status(400).json({ error: "question is required" });

  const knownLabels = db.prepare("SELECT DISTINCT label FROM events").all().map((r) => r.label);

  const prompt = `You classify questions about a camera detection log into intents.
  The log currently contains these detected object labels: ${JSON.stringify(knownLabels)}
  (the detector is COCO-SSD, so other COCO class names are also possible)

  Map the user's wording to the closest matching label — e.g. "phone" -> "cell phone",
  "someone" -> "person". If they ask about something unrelated to any label, use "unknown".

  Respond with ONLY a JSON object, no markdown fences, in one of these shapes:
  {"intent":"last_seen","label":"<object name>"}   - when did X last appear
  {"intent":"count","label":"<object name>"}       - how many times has X been seen
  {"intent":"list_recent"}                          - what happened recently / show latest events
  {"intent":"unknown"}                              - anything else

  Question: ${question}`;

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );

    //HTTP-level failure: keep google's explanation instead of throwing it away
    if (!r.ok) {
      const body = await r.text();
      console.error("Gemini error body:", body);
      return res.status(502).json({ error: `LLM API error ${r.status}: ${body.slice(0, 300)}` });
    }

    const data = await r.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const clean = text.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      return res.status(502).json({ error: "Could not parse LLM response" });
    }

    const handler = intentHandlers[parsed.intent];
    if (!handler || (parsed.intent !== "list_recent" && !parsed.label)) {
      return res.json({ answer: "I can answer things like: when did you last see X, how many times has X appeared, or what happened recently." });
    }

    res.json({ answer: handler(parsed) });
  } catch (err) {
    //exception-level failure: network died, DNS failed, etc.
    res.status(502).json({ error: "Query failed: " + err.message });
  }
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`R6_Drone backend listening on http://localhost:${PORT}`);
});