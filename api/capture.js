// Vercel serverless function. Appends a line to the Capture page's
// "Today's dump" section, the same place you'd type into by hand. The
// nightly Scheduled Task reads and sorts this later, this function just
// gets the note onto the page.

import { Client } from "@notionhq/client";
import { requireAuth } from "../lib/auth.js";

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Each deployment sets its own, via CAPTURE_PAGE_ID, so this works
// unmodified for anyone who duplicates the Capture Notion template.
// CAPTURE_PAGE_ID is the old name, still honored so existing deployments keep working.
const CAPTURE_PAGE_ID = process.env.CAPTURE_PAGE_ID || process.env.BRAIN_DUMP_PAGE_ID;

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  if (!process.env.NOTION_TOKEN || !CAPTURE_PAGE_ID) {
    return res.status(500).json({
      error: "Missing configuration",
      detail: "NOTION_TOKEN and CAPTURE_PAGE_ID must be set as environment variables. See README.md.",
    });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { note, calendar, project } = req.body;
    if (!note || !note.trim()) {
      return res.status(400).json({ error: "note is required" });
    }

    // Find the "Today's dump" heading block, append the new line right
    // after it (and after any existing lines under it), not at the very
    // end of the page, so it stays inside that section.
    const children = await notion.blocks.children.list({
      block_id: CAPTURE_PAGE_ID,
      page_size: 100,
    });

    // Matches "Today's dump" or "Today's capture", the Notion page's own
    // heading text has been renamed at least once already (to match the
    // app's "Capture" branding), matching loosely on "Today's" so a
    // future rename doesn't silently break this again.
    const headingIndex = children.results.findIndex(
      (b) =>
        b.type === "heading_2" &&
        b.heading_2?.rich_text?.[0]?.plain_text?.startsWith("Today's")
    );

    if (headingIndex === -1) {
      return res.status(500).json({ error: "Could not find the \"Today's ...\" section on the Capture page" });
    }

    // Split into one bullet per line, matching how the page itself asks
    // for input ("Type below, one thought per line"). Without this, a
    // multi-line note would land as a single bullet with a literal line
    // break inside it instead of separate bullets. The frontend shows its
    // own "• " marker as you type, strip it here since Notion renders
    // its own bullet for the block.
    const prefix = project ? `[${project}] ` : "";
    const lines = note
      .split("\n")
      .map((l) => l.replace(/^•\s*/, "").trim())
      .filter(Boolean)
      .map((l) => prefix + l);

    // Record the calendar addition as its own line, right after the
    // note, so the Capture page keeps a plain-text record even though
    // the actual event lives on Google Calendar, not in Notion.
    if (calendar && calendar.date && calendar.time) {
      const when = new Date(`${calendar.date}T${calendar.time}:00`);
      const formatted = when.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      lines.push(`📅 Added to calendar: ${formatted}`);
    }

    // Append at the end of the block list. Since nothing lives below
    // "Today's dump" in the page today, appending to the page is
    // equivalent to appending to the end of that section. If that ever
    // changes, this needs to insert after the last bullet instead.
    await notion.blocks.children.append({
      block_id: CAPTURE_PAGE_ID,
      children: lines.map((line) => ({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{ type: "text", text: { content: line } }],
        },
      })),
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to save note", detail: err.message });
  }
}
