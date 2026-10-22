import { useEffect, useState, useCallback, useMemo } from "react";
import { authedFetch } from "./api";

const SECTIONS = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "later", label: "Later" },
];

const SORT_OPTIONS = [
  { value: "due", label: "Due date" },
  { value: "priority", label: "Priority" },
  { value: "urgency", label: "Urgency" },
  { value: "captured", label: "Date entered" },
  { value: "task", label: "Task name" },
];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Buckets a task by due date relative to today, using plain date-string
// comparison (not Date object math) for the today/overdue check so it's
// immune to UTC/local timezone shifting a date-only string by a day.
function bucketFor(task, today) {
  if (!task.due) return "later";
  const dueDate = task.due.slice(0, 10);
  if (dueDate <= today) return "today";
  const days = Math.round((new Date(`${dueDate}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000);
  return days <= 7 ? "upcoming" : "later";
}

export default function TaskListScreen() {
  const [openTasks, setOpenTasks] = useState([]);
  const [completedTasks, setCompletedTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [projects, setProjects] = useState([]);
  const [priorities, setPriorities] = useState([]);
  const [urgencies, setUrgencies] = useState([]);

  const [projectFilter, setProjectFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState("");
  const [sortBy, setSortBy] = useState("due");
  const sortDir = "asc";

  const [activeStat, setActiveStat] = useState("open");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [completingIds, setCompletingIds] = useState(() => new Set());
  const [reopeningIds, setReopeningIds] = useState(() => new Set());
  const [collapsed, setCollapsed] = useState(() => new Set());

  const today = todayStr();

  // Load the real Project/Priority/Urgency options for this deployment's
  // Tasks database once, on mount. This is what makes the app work for
  // anyone's business names, not just one person's.
  useEffect(() => {
    authedFetch("/api/config")
      .then((res) => res.json())
      .then((data) => {
        setProjects(data.projects || []);
        setPriorities(data.priorities || []);
        setUrgencies(data.urgencies || []);
      })
      .catch(() => {
        // Non-fatal, filters just won't have options if this fails,
        // the task list itself still works.
      });
  }, []);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const baseParams = new URLSearchParams();
      if (projectFilter) baseParams.set("project", projectFilter);
      if (priorityFilter) baseParams.set("priority", priorityFilter);
      if (urgencyFilter) baseParams.set("urgency", urgencyFilter);

      const doneParams = new URLSearchParams(baseParams);
      doneParams.set("status", "Done");

      const [openRes, doneRes] = await Promise.all([
        authedFetch(`/api/tasks?${baseParams.toString()}`),
        authedFetch(`/api/tasks?${doneParams.toString()}`),
      ]);
      if (!openRes.ok || !doneRes.ok) throw new Error("load failed");
      const [openData, doneData] = await Promise.all([openRes.json(), doneRes.json()]);
      setOpenTasks(openData.tasks);
      setCompletedTasks(doneData.tasks);
    } catch (err) {
      setError("Couldn't load tasks");
    } finally {
      setLoading(false);
    }
  }, [projectFilter, priorityFilter, urgencyFilter]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  async function completeTask(id) {
    if (completingIds.has(id)) return;
    // Show the checkbox filled in and the row highlighted first, so
    // tapping it gives clear confirmation before the row disappears from
    // this list, rather than vanishing instantly. The actual move from
    // open to completed happens after that brief pause.
    const task = openTasks.find((t) => t.id === id);
    setCompletingIds((prev) => new Set(prev).add(id));

    const patchPromise = authedFetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "Done", previousStatus: task?.status || null }),
    });

    setTimeout(async () => {
      setOpenTasks((prev) => prev.filter((t) => t.id !== id));
      if (task) setCompletedTasks((prev) => [{ ...task, status: "Done", previousStatus: task.status }, ...prev]);
      setCompletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      try {
        const res = await patchPromise;
        if (!res.ok) throw new Error("update failed");
      } catch (err) {
        // Put it back if the update actually failed server-side
        loadTasks();
      }
    }, 500);
  }

  // The reverse of completeTask: unchecking a completed task sends it
  // back to the open list as "To Do". Same brief pause as completing, so
  // the tap visibly registers before the row leaves the Completed list.
  async function reopenTask(id) {
    if (reopeningIds.has(id)) return;
    const task = completedTasks.find((t) => t.id === id);
    // Back to whatever it was before it was completed, "To Do" only if
    // that was never recorded (tasks completed before this was tracked).
    const restoreTo = task?.previousStatus && task.previousStatus !== "Done" ? task.previousStatus : "To Do";
    setReopeningIds((prev) => new Set(prev).add(id));

    const patchPromise = authedFetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: restoreTo, previousStatus: null }),
    });

    setTimeout(async () => {
      setCompletedTasks((prev) => prev.filter((t) => t.id !== id));
      if (task) setOpenTasks((prev) => [{ ...task, status: restoreTo, previousStatus: null }, ...prev]);
      setReopeningIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      try {
        const res = await patchPromise;
        if (!res.ok) throw new Error("update failed");
      } catch (err) {
        loadTasks();
      }
    }, 500);
  }

  const dueTodayCount = useMemo(
    () => openTasks.filter((t) => t.due && t.due.slice(0, 10) === today).length,
    [openTasks, today]
  );

  const baseList = activeStat === "completed" ? completedTasks : openTasks;
  const statFiltered =
    activeStat === "dueToday"
      ? baseList.filter((t) => t.due && t.due.slice(0, 10) === today)
      : baseList;
  const searched = search.trim()
    ? statFiltered.filter((t) => t.task.toLowerCase().includes(search.trim().toLowerCase()))
    : statFiltered;

  const sorted = [...searched].sort((a, b) => {
    let cmp;
    if (sortBy === "due" || sortBy === "captured") {
      if (!a[sortBy]) cmp = 1;
      else if (!b[sortBy]) cmp = -1;
      else cmp = new Date(a[sortBy]) - new Date(b[sortBy]);
    } else if (sortBy === "task" || sortBy === "project") {
      cmp = (a[sortBy] || "").localeCompare(b[sortBy] || "");
    } else {
      const order = { High: 0, Medium: 1, Low: 2 };
      cmp = (order[a[sortBy]] ?? 3) - (order[b[sortBy]] ?? 3);
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const groups = { today: [], upcoming: [], later: [] };
  if (activeStat !== "completed") {
    for (const t of sorted) groups[bucketFor(t, today)].push(t);
  }

  function toggleSection(key) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="screen task-screen">
      <div className="tasks-topbar">
        <div className="screen-header">
          <h1>Tasks</h1>
        </div>
        <div className="tasks-icons">
          <button className="icon-btn" onClick={() => setSearchOpen((v) => !v)} aria-label="Search tasks">
            ⌕
          </button>
          <button className="icon-btn" onClick={loadTasks} aria-label="Refresh tasks">
            ⟳
          </button>
        </div>
      </div>

      {searchOpen && (
        <input
          className="task-search"
          placeholder="Search tasks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      )}

      <div className="filters">
        <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>Sort: {o.label}</option>
          ))}
        </select>
        <button
          className={`icon-btn filter-toggle ${showMoreFilters ? "active" : ""}`}
          onClick={() => setShowMoreFilters((v) => !v)}
          aria-label="More filters"
        >
          ⏷
        </button>
      </div>

      {showMoreFilters && (
        <div className="filters">
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
            <option value="">Any priority</option>
            {priorities.map((l) => (
              <option key={l} value={l}>{l} priority</option>
            ))}
          </select>
          <select value={urgencyFilter} onChange={(e) => setUrgencyFilter(e.target.value)}>
            <option value="">Any urgency</option>
            {urgencies.map((l) => (
              <option key={l} value={l}>{l} urgency</option>
            ))}
          </select>
        </div>
      )}

      <div className="stats-bar">
        <button className={`stat ${activeStat === "open" ? "active" : ""}`} onClick={() => setActiveStat("open")}>
          <span className="stat-num">{openTasks.length}</span>
          <span className="stat-label">Open</span>
        </button>
        <button className={`stat ${activeStat === "dueToday" ? "active" : ""}`} onClick={() => setActiveStat("dueToday")}>
          <span className="stat-num">{dueTodayCount}</span>
          <span className="stat-label">Due Today</span>
        </button>
        <button className={`stat ${activeStat === "completed" ? "active" : ""}`} onClick={() => setActiveStat("completed")}>
          <span className="stat-num">{completedTasks.length}</span>
          <span className="stat-label">Completed</span>
        </button>
      </div>

      {loading && <p className="status-msg">Loading...</p>}
      {error && <p className="status-msg error">{error}</p>}
      {!loading && !error && sorted.length === 0 && <p className="status-msg">Nothing here. Nice.</p>}

      {!loading && !error && sorted.length > 0 && (
        <div className="task-groups">
          {activeStat === "completed"
            ? (
              <div className="task-rows">
                {sorted.map((t) => (
                  <TaskRow key={t.id} t={t} onReopen={reopenTask} today={today} done reopening={reopeningIds.has(t.id)} />
                ))}
              </div>
            )
            : SECTIONS.map(({ key, label }) => groups[key].length > 0 && (
              <div className="task-section" key={key}>
                <button className="section-header" onClick={() => toggleSection(key)}>
                  <span>{label}</span>
                  <span className="chevron">{collapsed.has(key) ? "›" : "⌄"}</span>
                </button>
                {!collapsed.has(key) && (
                  <div className="task-rows">
                    {groups[key].map((t) => (
                      <TaskRow key={t.id} t={t} onComplete={completeTask} today={today} completing={completingIds.has(t.id)} />
                    ))}
                  </div>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function TaskRow({ t, onComplete, onReopen, today, done, completing, reopening }) {
  const isDueToday = t.due && t.due.slice(0, 10) === today;
  const checked = (!!done && !reopening) || !!completing;
  return (
    <div className={`task-row ${completing ? "completing" : ""} ${reopening ? "reopening" : ""}`}>
      <input
        type="checkbox"
        className="task-check"
        checked={checked}
        onChange={() => {
          if (completing || reopening) return;
          if (done) onReopen(t.id);
          else onComplete(t.id);
        }}
        disabled={!!completing || !!reopening}
        aria-label={done ? `Mark ${t.task} as not done` : `Complete ${t.task}`}
      />
      <div className="task-row-body">
        <div className="task-row-top">
          <span className="task-row-title">{t.task}</span>
          <span className="task-row-due-wrap">
            {t.urgency === "High" && <span className="task-flag" aria-label="High urgency">⚑</span>}
            {t.due && <span className={`task-due ${isDueToday ? "due-today" : ""}`}>{isDueToday ? "Today" : formatDate(t.due)}</span>}
          </span>
        </div>
        <div className="task-row-meta">
          {t.project && (
            <span className="task-project">
              <span className="dot-bullet" />{t.project}
            </span>
          )}
          {t.priority && <span className={`pill-outline priority-${t.priority.toLowerCase()}`}>{t.priority}</span>}
        </div>
      </div>
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
