import { createToken } from "../lib/auth.js";

export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.APP_PASSWORD) {
    return res.status(500).json({
      error: "Missing configuration",
      detail: "APP_PASSWORD must be set as an environment variable. See README.md.",
    });
  }

  const { password } = req.body || {};
  if (password !== process.env.APP_PASSWORD) {
    // Deliberately vague, doesn't confirm whether a password was even
    // provided, just that it didn't work.
    return res.status(401).json({ error: "Incorrect password" });
  }

  return res.status(200).json({ token: createToken() });
}
