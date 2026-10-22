import { useState } from "react";
import NoteScreen from "./NoteScreen";
import TaskListScreen from "./TaskListScreen";
import LoginScreen from "./LoginScreen";
import { getToken, clearToken } from "./api";
import "./App.css";

export default function App() {
  const [loggedIn, setLoggedIn] = useState(!!getToken());
  // 0 = Note screen, 1 = Task List screen
  const [screen, setScreen] = useState(0);

  if (!loggedIn) {
    return <LoginScreen onLoggedIn={() => setLoggedIn(true)} />;
  }

  function handleLogout() {
    clearToken();
    setLoggedIn(false);
  }

  return (
    <div className="app-shell">
      <div className="swipe-container">
        {/* Only the active screen is rendered, switched by the buttons
            below. Earlier this used a CSS transform to slide a 200%-wide
            track sideways, but that combination (a GPU-composited
            transformed layer clipped by an overflow:hidden ancestor) hit
            a WebKit rasterization bug on iOS Safari: a bright
            antialiasing seam right at the layer's edge, which no
            background color could mask. Rendering one screen at a time
            avoids that class of bug entirely. */}
        {screen === 0 ? <NoteScreen /> : <TaskListScreen />}
      </div>

      <div className="bottom-bar">
        <button
          className="nav-arrow"
          onClick={() => setScreen(0)}
          disabled={screen === 0}
          aria-label="Go to capture"
        >
          ‹
        </button>

        <div className="dots">
          <button
            className={`dot ${screen === 0 ? "active" : ""}`}
            onClick={() => setScreen(0)}
            aria-label="Note screen"
          />
          <button
            className={`dot ${screen === 1 ? "active" : ""}`}
            onClick={() => setScreen(1)}
            aria-label="Task screen"
          />
        </div>

        <button
          className="nav-arrow"
          onClick={() => setScreen(1)}
          disabled={screen === 1}
          aria-label="Go to tasks"
        >
          ›
        </button>

        <button className="logout-link" onClick={handleLogout} aria-label="Lock">🔒</button>
      </div>
    </div>
  );
}
