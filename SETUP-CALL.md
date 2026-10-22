# Setting up Capture for someone else (call runbook)

Done-for-you setup, about 30 minutes on a screen share. The customer owns
every account. You guide the steps, the customer clicks the sign-in buttons.

Rule for the whole call: **no secrets in chat, email, or text.** The Notion
secret and the passcode are typed or pasted by the customer, directly into
Notion and Vercel.

## Before the call (you, 5 minutes)

- [ ] "Capture (template)" Notion page is published with **Allow duplicate as
      template** on. Have the link ready.
- [ ] GitHub repo is a **template repo** and public (Settings → check "Template
      repository"). Secrets are already scrubbed, `.env` is git-ignored.
- [ ] The customer has: a Notion workspace they can edit, a Google account (to
      sign in to Vercel and GitHub), and their phone nearby.
- [ ] Skip Google Calendar for the first setup. The "Add to calendar" button
      simply won't appear. Add it later if wanted.

## On the call

### Part 1: Customer's Notion (10 min)

1. Open your template link and click **Duplicate** (top right). This creates a
   Tasks database and a "My Daily Captures" page in their workspace.
2. **Projects:** open the Tasks database, click the **Project** property →
   edit options. Replace yours with their real projects. The app reads these
   live, so no code change.
3. **Integration:** go to notion.so/my-integrations → New integration → type
   **Internal** → name it "Capture" → Save. Under *Capabilities*, enable Read,
   Update and Insert content. Click **Show** on the secret and **copy** it.
   Keep it on the clipboard for step 9.
4. **Connect it:** on the Tasks database, `•••` → Connections → add "Capture".
   Repeat on the "My Daily Captures" page.
5. **IDs:** open each in the browser and copy the 32-character string from the
   URL (the part before `?v=` for the database).
   - Tasks database → `TASKS_DATABASE_ID`
   - My Daily Captures page → `CAPTURE_PAGE_ID`

Check: the Capture page has a heading 2 starting with `Today's`. It comes with
the template. Don't rename it.

### Part 2: Customer's accounts and deploy (15 min)

6. **GitHub:** sign in (or create an account with Google) at github.com.
7. Go to your repo → **Use this template** → Create a new repository. Name it
   `capture`, private is fine. This makes their own copy.
8. **Vercel:** go to vercel.com → Sign up → Continue with GitHub (free Hobby
   plan). Add New → Project → import the `capture` repo.
9. Before clicking Deploy, open **Environment Variables** and paste:

   | Name | Value |
   |---|---|
   | `NOTION_TOKEN` | the secret from step 3 |
   | `TASKS_DATABASE_ID` | step 5 |
   | `CAPTURE_PAGE_ID` | step 5 |
   | `APP_PASSWORD` | a passcode they make up (they type it, you don't see it) |

10. Click **Deploy**. Wait about a minute for the URL.

### Part 3: Test together (5 min)

11. Open the URL on their phone and enter the passcode.
12. Write a test note, pick a project, tap **Capture my thought**. Check it
    appears as a bullet on their "My Daily Captures" page.
13. Add a task in Notion's Tasks database with a Due date. Check it shows on
    the Tasks screen. Check it off, confirm Status changes to Done.
14. Bookmark the URL on their phone (Share → Add Bookmark, or add it to a
    Safari tab group).

## If something goes wrong

| Symptom | Likely cause |
|---|---|
| "Couldn't save" on Capture | Integration not connected to the Capture page (step 4), or the `Today's` heading was renamed |
| Tasks screen empty or error | Integration not connected to the Tasks database, or wrong `TASKS_DATABASE_ID` |
| Project dropdown empty | No options in the Project property |
| Wrong passcode loop | Changed `APP_PASSWORD` but didn't redeploy: Vercel → Deployments → Redeploy |
| Any env var change | Always needs a redeploy to take effect |

## After the call

- Send the URL and remind them the passcode is theirs to keep.
- Projects can be added or renamed anytime in Notion, no redeploy needed.
- Updates to the app: you push to your repo, but their copy doesn't update
  automatically. Decide upfront whether updates are part of the deal.
