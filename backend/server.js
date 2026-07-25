import express from "express";
import cors from "cors";
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("R6_Drone.db");
db.exec("PRAGMA journal_mode = WAL;");

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

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`R6_Drone backend listening on http://localhost:${PORT}`);
});