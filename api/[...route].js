import { query } from "../lib/db.js";

const CATEGORY_KEYWORDS = {
  Writing: ["write", "copy", "content", "email", "blog", "script"],
  Research: ["research", "study", "learn", "compare", "analysis", "citation"],
  Image: ["image", "photo", "logo", "design", "art", "thumbnail"],
  Video: ["video", "reel", "youtube", "edit", "motion", "clips"],
  Audio: ["voice", "audio", "podcast", "speech", "music", "narration"],
  Coding: ["code", "developer", "debug", "build", "app", "program"],
  Productivity: ["notes", "task", "workflow", "organize", "meeting", "plan"],
};

export default async function handler(req, res) {
  try {
    const segments = normalizeSegments(req.query.route);
    const method = req.method || "GET";

    if (segments.length === 1 && segments[0] === "health" && method === "GET") {
      return sendJSON(res, 200, { ok: true, timestamp: new Date().toISOString() });
    }

    if (segments.length === 1 && segments[0] === "tools" && method === "GET") {
      return handleToolsList(req, res);
    }

    if (segments.length === 3 && segments[0] === "tools" && segments[2] === "vote" && method === "POST") {
      return handleVote(res, segments[1]);
    }

    if (segments.length === 1 && segments[0] === "assistant" && method === "GET") {
      return handleAssistant(req, res);
    }

    if (segments.length === 1 && segments[0] === "submissions" && method === "POST") {
      return handleSubmissionCreate(req, res);
    }

    if (segments.length === 1 && segments[0] === "submissions" && method === "GET") {
      if (!isAdmin(req)) return sendJSON(res, 401, { error: "Admin token required" });
      return handleSubmissionList(res);
    }

    if (segments.length === 3 && segments[0] === "submissions" && segments[2] === "approve" && method === "POST") {
      if (!isAdmin(req)) return sendJSON(res, 401, { error: "Admin token required" });
      return handleSubmissionApprove(res, segments[1]);
    }

    if (segments.length === 3 && segments[0] === "submissions" && segments[2] === "reject" && method === "POST") {
      if (!isAdmin(req)) return sendJSON(res, 401, { error: "Admin token required" });
      return handleSubmissionReject(res, segments[1]);
    }

    return sendJSON(res, 404, { error: "Not found" });
  } catch (error) {
    const message = getErrorMessage(error);
    const status = message.includes("DATABASE_URL") ? 500 : 400;
    return sendJSON(res, status, { error: message });
  }
}

async function handleToolsList(req, res) {
  const queryText = String(req.query.query || "").trim();
  const category = String(req.query.category || "All").trim();
  const limitParam = Number.parseInt(String(req.query.limit || "0"), 10);

  const result = await query(
    "select id, name, category, description, tags, url, votes from tools order by created_at desc"
  );

  let ranked = filterAndRankTools(result.rows, queryText, category);
  if (Number.isInteger(limitParam) && limitParam > 0) {
    ranked = ranked.slice(0, Math.min(limitParam, 100));
  }

  const categories = ["All", ...new Set(result.rows.map((tool) => tool.category).sort())];
  return sendJSON(res, 200, {
    tools: ranked,
    categories,
    inferredCategory: inferCategory(queryText.toLowerCase()),
  });
}

async function handleVote(res, id) {
  const updated = await query("update tools set votes = votes + 1 where id = $1 returning votes", [id]);

  if (!updated.rows.length) {
    return sendJSON(res, 404, { error: "Tool not found" });
  }

  return sendJSON(res, 200, { ok: true, votes: updated.rows[0].votes });
}

async function handleAssistant(req, res) {
  const q = String(req.query.q || "").trim();
  if (!q) return sendJSON(res, 400, { error: "Query is required" });

  const result = await query(
    "select id, name, category, description, tags, url, votes from tools order by created_at desc"
  );

  const inferredCategory = inferCategory(q.toLowerCase());
  const recommendations = filterAndRankTools(result.rows, q, inferredCategory || "All").slice(0, 3);

  const intro = inferredCategory
    ? `Based on your request, ${inferredCategory.toLowerCase()} tools fit best.`
    : "I found these tools based on your use case.";

  return sendJSON(res, 200, { intro, inferredCategory, recommendations });
}

async function handleSubmissionCreate(req, res) {
  const payload = await parseBody(req);
  const validationError = validateSubmission(payload);
  if (validationError) return sendJSON(res, 400, { error: validationError });

  await query(
    `insert into submissions (name, url, category, description, tags, votes)
     values ($1, $2, $3, $4, $5, 0)`,
    [payload.name.trim(), payload.url.trim(), payload.category, payload.description.trim(), deriveTags(payload.description)]
  );

  return sendJSON(res, 201, { ok: true });
}

async function handleSubmissionList(res) {
  const result = await query(
    "select id, name, url, category, description, tags, votes, submitted_at from submissions order by submitted_at desc"
  );
  return sendJSON(res, 200, { submissions: result.rows });
}

async function handleSubmissionApprove(res, id) {
  const result = await query(
    `with moved as (
      delete from submissions
      where id = $1
      returning name, url, category, description, tags, votes
    )
    insert into tools (id, name, url, category, description, tags, votes)
    select concat('tool-', replace(lower(name), ' ', '-'), '-', substring(md5(random()::text), 1, 6)),
           name, url, category, description, tags, votes
    from moved
    returning id`,
    [id]
  );

  if (!result.rows.length) {
    return sendJSON(res, 404, { error: "Submission not found" });
  }

  return sendJSON(res, 200, { ok: true, toolId: result.rows[0].id });
}

async function handleSubmissionReject(res, id) {
  const result = await query("delete from submissions where id = $1 returning id", [id]);
  if (!result.rows.length) {
    return sendJSON(res, 404, { error: "Submission not found" });
  }

  return sendJSON(res, 200, { ok: true });
}

function normalizeSegments(routeParam) {
  if (!routeParam) return [];
  if (Array.isArray(routeParam)) return routeParam.filter(Boolean);
  return [String(routeParam)];
}

function isAdmin(req) {
  const expected = process.env.ADMIN_TOKEN;
  const provided = req.headers["x-admin-token"];
  return Boolean(expected) && typeof provided === "string" && provided === expected;
}

function filterAndRankTools(tools, userQuery, category) {
  const cleanQuery = userQuery.toLowerCase().trim();
  const inferredCategory = inferCategory(cleanQuery);

  return tools
    .filter((tool) => category === "All" || tool.category === category)
    .filter((tool) => {
      if (!cleanQuery) return true;
      const corpus = `${tool.name} ${tool.description} ${(tool.tags || []).join(" ")} ${tool.category}`.toLowerCase();
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

function inferCategory(userQuery) {
  if (!userQuery) return null;

  let bestCategory = null;
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (userQuery.includes(keyword)) score += 1;
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
  return String(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 4)
    .slice(0, 3);
}

async function parseBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body) {
    return JSON.parse(req.body);
  }

  return await new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function getErrorMessage(error) {
  if (error?.message?.includes("ECONNREFUSED") || error?.message?.includes("DATABASE_URL")) {
    return "Database connection failed. Set DATABASE_URL and run schema setup.";
  }
  if (error?.message) return error.message;
  return "Request failed";
}

function sendJSON(res, status, payload) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
}
