import { useState } from "react";

export default function QueryBox() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(null);
  const [busy, setBusy] = useState(false);

  async function ask() {
    if (!question.trim() || busy) return;
    setBusy(true);
    setAnswer(null);
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      setAnswer(data.answer ?? data.error ?? "Something went wrong.");
    } catch {
      setAnswer("Could not reach the backend.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2>Ask the drone</h2>
      <input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && ask()}
        placeholder='e.g. "when did you last see a person?"'
        style={{ width: 320 }}
      />
      <button onClick={ask} disabled={busy}>
        {busy ? "Thinking…" : "Ask"}
      </button>
      {answer && <p>{answer}</p>}
    </div>
  );
}