import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { authedFetch } from "./api";

export default function NoteScreen() {
  const [note, setNote] = useState("");
  const [status, setStatus] = useState(""); // "", "saving", "saved", "error", "calendar-error"
  const [addToCalendar, setAddToCalendar] = useState(false);
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [projects, setProjects] = useState([]);
  const [calendarEnabled, setCalendarEnabled] = useState(false);
  const [project, setProject] = useState("");
  const textareaRef = useRef(null);
  // Same live Project list the Tasks screen filters by, so this dropdown
  // is never hardcoded to one business either.
  useEffect(() => {
    authedFetch("/api/config")
      .then((res) => res.json())
      .then((data) => {
        setProjects(data.projects || []);
        setCalendarEnabled(!!data.calendarEnabled);
      })
      .catch(() => {
        // Non-fatal, the dropdown just won't have options if this fails,
        // saving a note without a project still works.
      });
  }, []);

  // Grow with the content, like the Notes app, instead of scrolling
  // inside a fixed box.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [note]);

  const BULLET = "• ";

  // Auto-bullet like the Notes app: the first character typed gets a
  // bullet, and every Enter starts a new bulleted line. Backspace on an
  // empty bullet removes it instead of leaving a dangling marker.
  function handleChange(e) {
    const el = e.target;
    const value = el.value;
    if (note === "" && value !== "") {
      const cursor = el.selectionStart;
      setNote(BULLET + value);
      requestAnimationFrame(() => el.setSelectionRange(cursor + BULLET.length, cursor + BULLET.length));
    } else {
      setNote(value);
    }
  }

  function handleKeyDown(e) {
    const el = textareaRef.current;
    if (e.key === "Enter") {
      e.preventDefault();
      const { selectionStart, selectionEnd } = el;
      const insertion = "\n" + BULLET;
      const newValue = note.slice(0, selectionStart) + insertion + note.slice(selectionEnd);
      setNote(newValue);
      const pos = selectionStart + insertion.length;
      requestAnimationFrame(() => el.setSelectionRange(pos, pos));
    } else if (e.key === "Backspace") {
      const { selectionStart, selectionEnd } = el;
      if (selectionStart !== selectionEnd) return;
      const before = note.slice(0, selectionStart);
      if (before.endsWith("\n" + BULLET)) {
        e.preventDefault();
        const cut = selectionStart - (1 + BULLET.length);
        setNote(note.slice(0, cut) + note.slice(selectionStart));
        requestAnimationFrame(() => el.setSelectionRange(cut, cut));
      } else if (before === BULLET) {
        e.preventDefault();
        setNote("");
      }
    }
  }

  function firstLine(text) {
    const line = text
      .split("\n")
      .map((l) => l.replace(/^•\s*/, "").trim())
      .find(Boolean);
    return line || "Untitled event";
  }

  async function handleSave() {
    if (!note.trim()) return;
    if (addToCalendar && (!eventDate || !eventTime)) return;
    setStatus("saving");
    try {
      const calendar = addToCalendar ? { date: eventDate, time: eventTime } : null;
      const res = await authedFetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note, calendar, project: project || null }),
      });
      if (!res.ok) throw new Error("save failed");

      let calendarFailed = false;
      if (addToCalendar) {
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const calRes = await authedFetch("/api/calendar-event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: firstLine(note),
            description: note,
            date: eventDate,
            time: eventTime,
            timeZone,
          }),
        });
        calendarFailed = !calRes.ok;
      }

      setNote("");
      setAddToCalendar(false);
      setEventDate("");
      setEventTime("");
      setStatus(calendarFailed ? "calendar-error" : "saved");
      setTimeout(() => setStatus(""), calendarFailed ? 3000 : 1500);
    } catch (err) {
      setStatus("error");
    }
  }

  return (
    <div className="screen note-screen">
      <div className="screen-header">
        <h1>Capture</h1>
      </div>

      <div className="note-input-wrap" onClick={() => textareaRef.current?.focus()}>
        <textarea
          ref={textareaRef}
          className="note-input"
          placeholder="What's on your mind..."
          value={note}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          autoFocus
          rows={1}
        />
      </div>

      <div className="capture-options-row">
        {calendarEnabled && (
          <button
            type="button"
            className={`calendar-toggle ${addToCalendar ? "active" : ""}`}
            onClick={() => setAddToCalendar((v) => !v)}
            aria-pressed={addToCalendar}
          >
            Add to calendar
          </button>
        )}

        <select
          className="project-select"
          value={project}
          onChange={(e) => setProject(e.target.value)}
          aria-label="Project"
        >
          <option value="">Select project</option>
          {projects.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      {calendarEnabled && addToCalendar && (
        <div className="calendar-fields">
          <input
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            aria-label="Event date"
          />
          <input
            type="time"
            value={eventTime}
            onChange={(e) => setEventTime(e.target.value)}
            aria-label="Event time"
          />
        </div>
      )}

      <button
        className="save-button"
        onClick={handleSave}
        disabled={!note.trim() || status === "saving" || (addToCalendar && (!eventDate || !eventTime))}
      >
        {status === "saving" ? "Saving..." : "Capture my thought"}
      </button>

      {status === "saved" && <p className="status-msg success">Saved</p>}
      {status === "calendar-error" && <p className="status-msg error">Saved, but couldn't add to calendar</p>}
      {status === "error" && <p className="status-msg error">Couldn't save, try again</p>}
    </div>
  );
}
