import { createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { loadConfig } from "./config.js";
import { fetchSafeInsights, MetaApiError } from "./meta.js";
import { ClientInputError, parseDateRange } from "./safety.js";

const config = loadConfig();
const rateBuckets = new Map();

const server = createServer(async (req, res) => {
  setSecurityHeaders(res);

  if (req.method === "OPTIONS") {
    if (!setCorsHeaders(req, res)) return sendJson(res, 403, { error: "Origin denied" });
    res.writeHead(204);
    return res.end();
  }

  if (!setCorsHeaders(req, res)) {
    return sendJson(res, 403, { error: "Origin denied" });
  }

  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && requestUrl.pathname === "/health") {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method !== "GET" || requestUrl.pathname !== "/v1/meta/insights") {
    return sendJson(res, 404, { error: "Not found" });
  }

  if (!hasValidApiKey(req.headers["x-api-key"])) {
    return sendJson(res, 401, { error: "Unauthorized" });
  }

  if (!consumeRateLimit(req.socket.remoteAddress || "unknown")) {
    res.setHeader("Retry-After", "60");
    return sendJson(res, 429, { error: "Too many requests" });
  }

  try {
    const dateRange = parseDateRange(requestUrl.searchParams, config.maxDateRangeDays);
    const data = await fetchSafeInsights(config, dateRange);
    return sendJson(res, 200, {
      data,
      meta: { since: dateRange.since, until: dateRange.until, level: "ad" }
    });
  } catch (error) {
    if (error instanceof ClientInputError) {
      return sendJson(res, 400, { error: error.message });
    }

    if (error instanceof MetaApiError) {
      console.error("Meta API request failed", { code: error.code, message: error.message });
      return sendJson(res, 502, { error: "Meta data is temporarily unavailable" });
    }

    console.error("Unexpected request failure", error);
    return sendJson(res, 500, { error: "Internal server error" });
  }
});

server.listen(config.port, () => {
  console.log(`Safe Meta Ads API listening on port ${config.port}`);
});

function hasValidApiKey(value) {
  if (typeof value !== "string" || !value) return false;
  const expected = createHash("sha256").update(config.dashboardApiKey).digest();
  const actual = createHash("sha256").update(value).digest();
  return timingSafeEqual(expected, actual);
}

function consumeRateLimit(clientId) {
  const minute = Math.floor(Date.now() / 60_000);
  const bucket = rateBuckets.get(clientId);
  if (!bucket || bucket.minute !== minute) {
    rateBuckets.set(clientId, { minute, count: 1 });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= config.rateLimitPerMinute;
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (!config.allowedOrigin || origin !== config.allowedOrigin) return false;

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Headers", "X-API-Key, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Vary", "Origin");
  return true;
}

function setSecurityHeaders(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.end(JSON.stringify(payload));
}
