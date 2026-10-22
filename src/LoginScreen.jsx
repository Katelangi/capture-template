import { useState } from "react";
import { setToken } from "./api";

export default function LoginScreen({ onLoggedIn }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!password) return;
    setChecking(true);
    setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }
      setToken(data.token);
      onLoggedIn();
    } catch (err) {
      setError("Couldn't reach the server, try again");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="screen login-screen">
      <div className="screen-header">
        <h1>Capture</h1>
        <p className="hint">Enter your passcode</p>
      </div>
      <form onSubmit={handleSubmit} className="login-form">
        <input
          type="password"
          className="login-input"
          placeholder="Passcode"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        <button className="save-button" disabled={!password || checking}>
          {checking ? "Checking..." : "Unlock"}
        </button>
        {error && <p className="status-msg error">{error}</p>}
      </form>
    </div>
  );
}
