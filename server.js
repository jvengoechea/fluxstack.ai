import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "127.0.0.1";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "change-me";
const DB_PATH = path.resolve("data/db.json");

const CATEGORY_KEYWORDS = {
  Writing: ["write", "copy", "content", "email", "blog", "script"],
  Research: ["research", "study", "learn", "compare", "analysis", "citation"],
  Image: ["image", "photo", "logo", "design", "art", "thumbnail"],
  Video: ["video", "reel", "youtube", "edit", "motion", "clips"],
  Audio: ["voice", "audio", "podcast", "speech", "music", "narration"],
  Coding: ["code", "developer", "debug", "build", "app", "program"],
  Productivity: ["notes", "task", "workflow", "organize", "meeting", "plan"],
};

const STATIC_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

const server = createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host}`);

    if (requestUrl.pathname.startsWith("/api/")) {
      await routeApi(req, res, requestUrl);
      return;
    }

    await serveStatic(res, requestUrl.pathname);
  } catch (error) {
    sendJSON(res, 500, { error: "Internal server error" });
    console.error(error);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Fluxstack server running at http://${HOST}:${PORT}`);
});

async function routeApi(req, res, requestUrl) {
  const { pathname, searchParams } = requestUrl;
  const method = req.method || "GET";

  if (pathname === "/api/health" && method === "GET") {
    sendJSON(res, 200, { ok: true, timestamp: new Date().toISOString() });
    return;
  }

  if (pathname === "/api/tools" && method === "GET") {
    const db = await readDB();
    const query = (searchParams.get("query") || "").trim();
    const category = (searchParams.get("category") || "All").trim();
    const limitParam = Number.parseInt(searchParams.get("limit") || "0", 10);

    let ranked = filterAndRankTools(db.tools, query, category);
    if (Number.isInteger(limitParam) && limitParam > 0) {
      ranked = ranked.slice(0, Math.min(limitParam, 100));
    }

    sendJSON(res, 200, {
      tools: ranked,
      categories: ["All", ...new Set(db.tools.map((tool) => tool.category).sort())],
      inferredCategory: inferCategory(query.toLowerCase()),
    });
    return;
  }

  if (pathname.startsWith("/api/tools/") && pathname.endsWith("/vote") && method === "POST") {
    const id = pathname.split("/")[3];
    const db = await readDB();
    const tool = db.tools.find((entry) => entry.id === id);

    if (!tool) {
      sendJSON(res, 404, { error: "Tool not found" });
      return;
    }

    tool.votes += 1;
    await writeDB(db);
    sendJSON(res, 200, { ok: true, votes: tool.votes });
    return;
  }

  if (pathname === "/api/assistant" && method === "GET") {
    const db = await readDB();
    const query = (searchParams.get("q") || "").trim();

    if (!query) {
      sendJSON(res, 400, { error: "Query is required" });
      return;
    }

    const inferredCategory = inferCategory(query.toLowerCase());
    const tools = filterAndRankTools(db.tools, query, inferredCategory || "All").slice(0, 3);
    const intro = inferredCategory
      ? `Based on your request, ${inferredCategory.toLowerCase()} tools fit best.`
      : "I found these tools based on your use case.";

    sendJSON(res, 200, {
      intro,
      inferredCategory,
      recommendations: tools,
    });
    return;
  }

  if (pathname === "/api/submissions" && method === "POST") {
    const payload = await parseJSONBody(req);
    const error = validateSubmission(payload);

    if (error) {
      sendJSON(res, 400, { error });
      return;
    }

    const db = await readDB();
    db.submissions.unshift({
      id: randomUUID(),
      name: payload.name.trim(),
      url: payload.url.trim(),
      category: payload.category,
      description: payload.description.trim(),
      tags: deriveTags(payload.description),
      votes: 0,
      submittedAt: new Date().toISOString(),
    });

    await writeDB(db);
    sendJSON(res, 201, { ok: true });
    return;
  }

  if (pathname === "/api/submissions" && method === "GET") {
    if (!isAdmin(req)) {
      sendJSON(res, 401, { error: "Admin token required" });
      return;
    }

    const db = await readDB();
    sendJSON(res, 200, { submissions: db.submissions });
    return;
  }

  if (pathname.startsWith("/api/submissions/") && pathname.endsWith("/approve") && method === "POST") {
    if (!isAdmin(req)) {
      sendJSON(res, 401, { error: "Admin token required" });
      return;
    }

    const id = pathname.split("/")[3];
    const db = await readDB();
    const index = db.submissions.findIndex((entry) => entry.id === id);

    if (index === -1) {
      sendJSON(res, 404, { error: "Submission not found" });
      return;
    }

    const [approved] = db.submissions.splice(index, 1);
    db.tools.unshift(approved);
    await writeDB(db);

    sendJSON(res, 200, { ok: true });
    return;
  }

  if (pathname.startsWith("/api/submissions/") && pathname.endsWith("/reject") && method === "POST") {
    if (!isAdmin(req)) {
      sendJSON(res, 401, { error: "Admin token required" });
      return;
    }

    const id = pathname.split("/")[3];
    const db = await readDB();
    const before = db.submissions.length;
    db.submissions = db.submissions.filter((entry) => entry.id !== id);

    if (db.submissions.length === before) {
      sendJSON(res, 404, { error: "Submission not found" });
      return;
    }

    await writeDB(db);
    sendJSON(res, 200, { ok: true });
    return;
  }

  sendJSON(res, 404, { error: "Not found" });
}

async function serveStatic(res, pathname) {
  const normalized = pathname === "/" ? "/index.html" : pathname;
  const safePath = path.normalize(normalized).replace(/^\.\.(\/|\\|$)/, "");
  const filePath = path.resolve(`.${safePath}`);

  if (!filePath.startsWith(path.resolve("."))) {
    sendJSON(res, 403, { error: "Forbidden" });
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const type = STATIC_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "content-type": type });
    res.end(content);
  } catch {
    if (pathname !== "/index.html") {
      await serveStatic(res, "/index.html");
      return;
    }
    sendJSON(res, 404, { error: "Not found" });
  }
}

function filterAndRankTools(tools, query, category) {
  const cleanQuery = query.toLowerCase().trim();
  const inferredCategory = inferCategory(cleanQuery);

  return tools
    .filter((tool) => category === "All" || tool.category === category)
    .filter((tool) => {
      if (!cleanQuery) return true;
      const corpus = `${tool.name} ${tool.description} ${tool.tags.join(" ")} ${tool.category}`.toLowerCase();
      return cleanQuery.split(/\s+/).every((word) => corpus.includes(word));
    })
    .map((tool) => {
      let score = tool.votes;
      if (inferredCategory && inferredCategory === tool.category) score += 20;
      if (cleanQuery && tool.name.toLowerCase().includes(cleanQuery)) score += 20;
      return { ...tool, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ score, ...tool }) => tool);
}

function inferCategory(query) {
  if (!query) return null;

  let bestCategory = null;
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (query.includes(keyword)) score += 1;
    }

    if (score > bestScore) {
      bestCategory = category;
      bestScore = score;
    }
  }

  return bestScore > 0 ? bestCategory : null;
}

function validateSubmission(payload) {
  if (!payload || typeof payload !== "object") return "Invalid payload";

  const required = ["name", "url", "category", "description"];
  for (const field of required) {
    if (typeof payload[field] !== "string" || !payload[field].trim()) {
      return `Invalid ${field}`;
    }
  }

  try {
    const parsed = new URL(payload.url);
    if (!["http:", "https:"].includes(parsed.protocol)) return "URL must be http or https";
  } catch {
    return "Invalid URL";
  }

  if (payload.description.length > 400) return "Description is too long";
  return null;
}

function deriveTags(text) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 4)
    .slice(0, 3);
}

async function parseJSONBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
    if (Buffer.concat(chunks).length > 1024 * 1024) {
      throw new Error("Payload too large");
    }
  }

  if (!chunks.length) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Invalid JSON");
  }
}

function isAdmin(req) {
  const token = req.headers["x-admin-token"];
  return typeof token === "string" && token === ADMIN_TOKEN;
}

async function readDB() {
  const raw = await fs.readFile(DB_PATH, "utf8");
  return JSON.parse(raw);
}

async function writeDB(data) {
  const tmpPath = `${DB_PATH}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmpPath, DB_PATH);
}

function sendJSON(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload));
}
