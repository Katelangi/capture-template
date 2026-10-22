// Shared helper for creating and checking session tokens. Not itself an
// API route, lives outside /api so Vercel doesn't treat it as one.
//
// How this works: after a correct password, the server hands back a
// signed token (an expiry timestamp plus a signature, both derived from
// APP_PASSWORD). The app stores that token and sends it with every
// request after that. The server re-checks the signature on every
// request, if it doesn't match or has expired, the request is rejected.
// Nothing about this trusts the browser, the signature can only be
// produced by someone who knows APP_PASSWORD, which never leaves the
// server.

import crypto from "crypto";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function getKey() {
  return crypto.createHash("sha256").update(process.env.APP_PASSWORD || "").digest();
}

export function createToken() {
  const payload = JSON.stringify({ exp: Date.now() + SESSION_TTL_MS });
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const sig = crypto.createHmac("sha256", getKey()).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

export function verifyToken(token) {
  if (!token) return false;
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return false;

  const expectedSig = crypto.createHmac("sha256", getKey()).update(payloadB64).digest("base64url");
  // Constant-time comparison, avoids leaking timing information about
  // the signature.
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    return payload.exp > Date.now();
  } catch {
    return false;
  }
}

// Call at the top of any protected API route. Returns true and does
// nothing if the request is authenticated. Returns false and has already
// sent a 401 response if not, in which case the route should just return.
export function requireAuth(req, res) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!verifyToken(token)) {
    res.status(401).json({ error: "Not authenticated" });
    return false;
  }
  return true;
}
