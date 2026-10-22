// Vercel serverless function. Creates an event directly on the user's own
// Google Calendar via the Calendar API. Uses a long-lived refresh token
// (obtained once through Google's OAuth consent screen) to mint a fresh
// access token on every call, since Vercel functions can't hold state
// between requests the way a long-running server could.

import { requireAuth } from "../lib/auth.js";

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    return res.status(500).json({
      error: "Missing configuration",
      detail: "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN must be set as environment variables. See README.md.",
    });
  }

  try {
    const { title, description, date, time, timeZone } = req.body;
    if (!title || !date || !time) {
      return res.status(400).json({ error: "title, date, and time are required" });
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: GOOGLE_REFRESH_TOKEN,
        grant_type: "refresh_token",
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      throw new Error(tokenData.error_description || "Failed to refresh Google access token");
    }

    // One hour by default, this app doesn't ask for an end time. Uses a
    // UTC-anchored Date purely as a rollover-safe calendar calculator
    // (so 11:30pm + 1hr correctly becomes 12:30am the next day), the
    // actual timezone meaning is applied separately below via the
    // `timeZone` field Google expects alongside these wall-clock strings.
    const [year, month, day] = date.split("-").map(Number);
    const [hour, minute] = time.split(":").map(Number);
    const start = new Date(Date.UTC(year, month - 1, day, hour, minute));
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    const pad = (n) => String(n).padStart(2, "0");
    const fmt = (d) =>
      `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00`;

    const eventRes = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: title,
        description: description || "",
        start: { dateTime: fmt(start), timeZone: timeZone || "UTC" },
        end: { dateTime: fmt(end), timeZone: timeZone || "UTC" },
      }),
    });
    const eventData = await eventRes.json();
    if (!eventRes.ok) {
      throw new Error(eventData.error?.message || "Failed to create calendar event");
    }

    return res.status(200).json({ ok: true, eventUrl: eventData.htmlLink });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to create calendar event", detail: err.message });
  }
}
