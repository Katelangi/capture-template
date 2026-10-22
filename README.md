# Capture

A small mobile web app for quick capture and tasks, backed by your own
Notion. One screen to type a thought into a Notion page, one screen to
see and check off your tasks. Optionally, it can also add an event to your
Google Calendar. Checking off a task only updates that task's Status in
Notion. Notes that should skip the Capture page and show
up as a task right away (a reminder, say) can be sent straight to the Tasks
database with the "Add to tasks" button on the Capture screen.

Your data stays in your own Notion workspace. Each person runs their own
copy of this app with their own passcode, nothing is shared between
copies.

## How it's built

- **Frontend**: React + Vite, styled for mobile.
- **Backend**: serverless functions (`/api/tasks`, `/api/capture`,
  `/api/calendar-event`, `/api/config`) that hold the Notion token (and
  Google credentials, if used) and talk to those APIs. The frontend never
  touches Notion or Google directly, or sees either secret.

## What your Notion needs

The app reads and writes a **Tasks database** and a **Capture page**. The
names matter, the code looks for them.

**Tasks database** properties:

| Property | Type | Notes |
|---|---|---|
| Task | Title | |
| Project | Select | Your own options, the app reads them live |
| Priority | Select | Options named `High`, `Medium`, `Low` |
| Urgency | Select | Options named `High`, `Medium`, `Low` |
| Due | Date | |
| Status | Select | Needs at least `To Do` and `Done`. `Today` and `In Progress` also work |
| Notes | Text | |
| Captured | Created time | |
| Previous Status | Text | Created automatically the first time a task is completed |

**Capture page**: a normal Notion page containing a heading 2 whose text
starts with `Today's` (for example `Today's capture`). New notes are added
as bullets at the end of the page.

## Setup

1. **Notion**: duplicate the Tasks database and Capture page into your
   workspace (or build them to match the tables above). Then go to
   [notion.so/my-integrations](https://notion.so/my-integrations), create
   an internal integration, and copy its secret. On both the Tasks
   database and the Capture page, open the `•••` menu → Connections → add
   your integration.
2. **IDs**: copy the Tasks database ID and the Capture page ID from their
   Notion URLs (the 32-character string, see `.env.example`).
3. **Values**: you need these environment variables.

   | Variable | What it is |
   |---|---|
   | `NOTION_TOKEN` | The integration secret from step 1 |
   | `TASKS_DATABASE_ID` | From step 2 |
   | `CAPTURE_PAGE_ID` | The Capture page ID from step 2 |
   | `APP_PASSWORD` | A passcode you make up, you type it to open the app |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` | Optional, see Google Calendar below |

4. **Deploy**: import this repo into [vercel.com](https://vercel.com)
   (Add New Project), add the variables above under Settings →
   Environment Variables, and deploy. Open the URL it gives you on your
   phone.

Never commit real values into the code, `.env` files are git-ignored.

### Running locally

1. Copy `.env.example` to `.env` and fill it in.
2. `npm install`
3. `vercel dev` (the API routes need it, `npm run dev` runs the frontend
   only).

## Google Calendar (optional)

Leave the three `GOOGLE_*` variables unset and the "Add to calendar"
button simply doesn't appear. If you do want it, it creates a real event
on your own Google Calendar. Setup, done once:

1. Go to [console.cloud.google.com](https://console.cloud.google.com),
   create a project (or use an existing one).
2. Under **APIs & Services → Library**, enable the "Google Calendar API".
3. Under **APIs & Services → OAuth consent screen**, set the app name and
   your email, choose "External", add the
   `https://www.googleapis.com/auth/calendar.events` scope, and add your
   own Google account under "Test users" (otherwise Google blocks the
   next steps).
4. Under **APIs & Services → Credentials**, click "Create Credentials" →
   "OAuth client ID", type "Web application". Add
   `https://developers.google.com/oauthplayground` as an authorized
   redirect URI. This gives you `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET`.
5. Go to [Google's OAuth Playground](https://developers.google.com/oauthplayground):
   - Click the gear icon → check "Use your own OAuth credentials" → paste
     in your Client ID and Client Secret.
   - In "Input your own scopes", enter
     `https://www.googleapis.com/auth/calendar.events`.
   - Click "Authorize APIs", sign in with your own Google account, and
     approve (you may need to click Advanced → continue past an
     "unverified app" warning, it's your own app).
   - Click "Exchange authorization code for tokens". The `refresh_token`
     in the response is `GOOGLE_REFRESH_TOKEN`. It doesn't expire on its
     own, the server uses it to get a fresh access token on every request.
6. Add all three as environment variables and redeploy.

## What's here

- `src/App.jsx` — switches between the two screens (tap `‹`/`›` or the
  dots), gates on login
- `src/LoginScreen.jsx` — the passcode screen
- `src/NoteScreen.jsx` — the Capture screen: text box, project, optional
  calendar
- `src/TaskListScreen.jsx` — the filterable, sortable task list
- `src/api.js` — attaches the session token to every request, handles logout on expiry
- `lib/auth.js` — creates and verifies signed session tokens
- `api/auth.js` — checks the passcode, issues a session token
- `api/tasks.js` — reads Tasks (with filters), updates Status
- `api/capture.js` — appends notes to the Capture page, tagged with the chosen project
- `api/calendar-event.js` — creates the event on Google Calendar
- `api/config.js` — reads your real Project/Priority/Urgency options and
  whether Calendar is set up, so nothing about one business is hardcoded

## Known gaps

- The passcode is a single shared secret, fine for one person, not built
  for multiple distinct users with separate logins.
- Not installable as a home-screen app: the manifest and home-screen tags
  were removed while chasing a thin light line down the screen edges on
  iPhone. That line turned out to be a 1px side border left over from the
  Vite starter's `src/index.css` (on `#root`), now removed. The home-screen
  tags could be added back.
