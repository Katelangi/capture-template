import crypto from "crypto";
import { createToken } from "../lib/auth.js";

// Nothing locks an account out after wrong guesses (serverless functions
// don't share memory between requests), so each wrong guess costs a short
// wait instead. That makes guessing passcodes one after another much
// slower. It does not stop many guesses sent at once, a long passcode is
// still the real protection.
const WRONG_GUESS_DELAY_MS = 1500;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Compare without leaking, through timing, how much of a guess was right.
// Hashing both sides first gives equal-length buffers for any input.
function passwordMatches(guess, actual) {
  if (typeof guess !== "string") return false;
  const hash = (s) => crypto.createHash("sha256").update(s).digest();
  return crypto.timingSafeEqual(hash(guess), hash(actual));
}

export default async function handler(req, res) {
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
  if (!passwordMatches(password, process.env.APP_PASSWORD)) {
    await sleep(WRONG_GUESS_DELAY_MS);
    // Deliberately vague, doesn't confirm whether a password was even
    // provided, just that it didn't work.
    return res.status(401).json({ error: "Incorrect password" });
  }

  return res.status(200).json({ token: createToken() });
}
