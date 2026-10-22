// Vercel serverless function. Runs server-side only, the Notion token
// never reaches the browser. The frontend calls /api/tasks, never Notion
// directly.

import { Client } from "@notionhq/client";
import { requireAuth } from "../lib/auth.js";

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// The Tasks database ID. Each deployment sets its own, via the
// TASKS_DATABASE_ID environment variable, so this code works unmodified
// for anyone who duplicates the Capture Notion template into their own
// workspace, not just this one specific database.
const TASKS_DATABASE_ID = process.env.TASKS_DATABASE_ID;

// Notion's 2025-09-03 API added data sources as a layer between databases
// and pages (a database can now have more than one). Querying needs a
// data source id, not the database id, so resolve it once and cache it
// for this warm serverless instance. Most databases have exactly one data
// source, use the first one.
let dataSourceId = null;
async function getDataSourceId() {
  if (!dataSourceId) {
    const db = await notion.databases.retrieve({ database_id: TASKS_DATABASE_ID });
    dataSourceId = db.data_sources[0].id;
  }
  return dataSourceId;
}

// Where a task's status is remembered while it's Done, so unchecking it in
// the Completed list can put it back exactly where it was (To Do, Today,
// In Progress...) instead of guessing. Lives in the Tasks database itself
// as a text property, so it works from any device. Created automatically
// the first time it's needed, if the database doesn't have it yet.
const PREVIOUS_STATUS_PROPERTY = "Previous Status";
let previousStatusReady = false;
async function ensurePreviousStatusProperty() {
  if (previousStatusReady) return true;
  try {
    const id = await getDataSourceId();
    const ds = await notion.dataSources.retrieve({ data_source_id: id });
    if (!ds.properties?.[PREVIOUS_STATUS_PROPERTY]) {
      await notion.dataSources.update({
        data_source_id: id,
        properties: { [PREVIOUS_STATUS_PROPERTY]: { rich_text: {} } },
      });
    }
    previousStatusReady = true;
    return true;
  } catch (err) {
    // Not fatal: completing and reopening still work, a reopened task just
    // falls back to "To Do" because nothing could be remembered.
    console.error("Could not set up the Previous Status property", err);
    return false;
  }
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  if (!process.env.NOTION_TOKEN || !TASKS_DATABASE_ID) {
    return res.status(500).json({
      error: "Missing configuration",
      detail: "NOTION_TOKEN and TASKS_DATABASE_ID must be set as environment variables. See README.md.",
    });
  }
  if (req.method === "GET") {
    return handleGet(req, res);
  }
  if (req.method === "PATCH") {
    return handlePatch(req, res);
  }
  return res.status(405).json({ error: "Method not allowed" });
}

// GET /api/tasks?project=Work&priority=High&urgency=High&status=To+Do
// Any filter is optional. Omit to get everything not Done.
async function handleGet(req, res) {
  try {
    const { project, priority, urgency, status } = req.query;

    const filters = [];
    // Default: hide Done tasks unless a status filter explicitly asks for it
    if (status) {
      filters.push({ property: "Status", select: { equals: status } });
    } else {
      filters.push({ property: "Status", select: { does_not_equal: "Done" } });
    }
    if (project) filters.push({ property: "Project", select: { equals: project } });
    if (priority) filters.push({ property: "Priority", select: { equals: priority } });
    if (urgency) filters.push({ property: "Urgency", select: { equals: urgency } });

    const response = await notion.dataSources.query({
      data_source_id: await getDataSourceId(),
      filter: filters.length > 1 ? { and: filters } : filters[0],
      sorts: [
        { property: "Due", direction: "ascending" },
        { property: "Captured", direction: "descending" },
      ],
    });

    const tasks = response.results.map(formatTask);
    return res.status(200).json({ tasks });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to load tasks", detail: err.message });
  }
}

// PATCH /api/tasks  body: { id: "page-id", status: "Done" }
// Only status updates are supported right now, that's all the app needs
// for the checkbox interaction. This never touches Context, updating a
// Task's Status only changes that one row in Tasks.
// PATCH /api/tasks  body: { id, status, previousStatus? }
// previousStatus: a string remembers it (sent when completing a task),
// null clears it (sent when reopening), leave it out to not touch it.
async function handlePatch(req, res) {
  try {
    const { id, status, previousStatus } = req.body;
    if (!id || !status) {
      return res.status(400).json({ error: "id and status are required" });
    }

    const properties = { Status: { select: { name: status } } };
    if (previousStatus !== undefined && (await ensurePreviousStatusProperty())) {
      properties[PREVIOUS_STATUS_PROPERTY] = {
        rich_text: previousStatus ? [{ type: "text", text: { content: previousStatus } }] : [],
      };
    }

    await notion.pages.update({ page_id: id, properties });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update task", detail: err.message });
  }
}

function formatTask(page) {
  const p = page.properties;
  return {
    id: page.id,
    task: p.Task?.title?.[0]?.plain_text || "(untitled)",
    project: p.Project?.select?.name || null,
    priority: p.Priority?.select?.name || null,
    urgency: p.Urgency?.select?.name || null,
    status: p.Status?.select?.name || null,
    previousStatus: p[PREVIOUS_STATUS_PROPERTY]?.rich_text?.[0]?.plain_text || null,
    due: p.Due?.date?.start || null,
    notes: p.Notes?.rich_text?.[0]?.plain_text || "",
    captured: p.Captured?.created_time || null,
  };
}
