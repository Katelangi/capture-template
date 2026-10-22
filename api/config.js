// Vercel serverless function. Returns the actual Project options
// configured on this deployment's Tasks database, read live from Notion's
// schema. This is what makes the frontend work for anyone who duplicates
// the template, their business names populate automatically, nothing
// about any one person's specific projects is hardcoded anywhere in the app.

import { Client } from "@notionhq/client";
import { requireAuth } from "../lib/auth.js";

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const TASKS_DATABASE_ID = process.env.TASKS_DATABASE_ID;

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.NOTION_TOKEN || !TASKS_DATABASE_ID) {
    return res.status(500).json({
      error: "Missing configuration",
      detail:
        "NOTION_TOKEN and TASKS_DATABASE_ID must be set as environment variables. See README.md.",
    });
  }

  try {
    // Notion's 2025-09-03 API moved property schema (Select options, etc.)
    // off the database object and onto its data source(s). Resolve the
    // database's first data source, then read the schema from there.
    const db = await notion.databases.retrieve({ database_id: TASKS_DATABASE_ID });
    const dataSource = await notion.dataSources.retrieve({ data_source_id: db.data_sources[0].id });
    const projectOptions = dataSource.properties?.Project?.select?.options?.map((o) => o.name) || [];
    const priorityOptions = dataSource.properties?.Priority?.select?.options?.map((o) => o.name) || [];
    const urgencyOptions = dataSource.properties?.Urgency?.select?.options?.map((o) => o.name) || [];
    const statusOptions = dataSource.properties?.Status?.select?.options?.map((o) => o.name) || [];

    return res.status(200).json({
      projects: projectOptions,
      priorities: priorityOptions,
      urgencies: urgencyOptions,
      statuses: statusOptions,
      // The "Add to calendar" button only shows when all three Google
      // values are set on this deployment, so the app works fine for
      // anyone who skips the Google setup entirely.
      calendarEnabled: Boolean(
        process.env.GOOGLE_CLIENT_ID &&
          process.env.GOOGLE_CLIENT_SECRET &&
          process.env.GOOGLE_REFRESH_TOKEN
      ),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to load config", detail: err.message });
  }
}
