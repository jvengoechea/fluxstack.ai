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

let schemaReadyPromise;

export default async function handler(req, res) {
  try {
    await ensureSchema();

    const segments = normalizeSegments(req);
    const method = req.method || "GET";

    if (segments.length === 1 && segments[0] === "health" && method === "GET") {
      return sendJSON(res, 200, { ok: true, timestamp: new Date().toISOString() });
    }

    if (segments.length === 1 && segments[0] === "tools" && method === "GET") {
      return handleToolsList(req, res);
    }

    if (segments.length === 1 && segments[0] === "tools" && method === "POST") {
      if (!isAdmin(req)) return sendJSON(res, 401, { error: "Admin token required" });
      return handleToolCreate(req, res);
    }

    if (segments.length === 1 && segments[0] === "tools-enrich" && method === "POST") {
      return handleToolEnrich(req, res);
    }

    if (segments.length === 1 && segments[0] === "tool-vote" && method === "POST") {
      return handleToolVoteByPayload(req, res);
    }

    if (segments.length === 1 && segments[0] === "tool-update" && method === "POST") {
      if (!isAdmin(req)) return sendJSON(res, 401, { error: "Admin token required" });
      return handleToolUpdateByPayload(req, res);
    }

    if (segments.length === 1 && segments[0] === "tool-delete" && method === "POST") {
      if (!isAdmin(req)) return sendJSON(res, 401, { error: "Admin token required" });
      return handleToolDeleteByPayload(req, res);
    }

    if (segments.length === 1 && segments[0] === "submission-approve" && method === "POST") {
      if (!isAdmin(req)) return sendJSON(res, 401, { error: "Admin token required" });
      return handleSubmissionApproveByPayload(req, res);
    }

    if (segments.length === 1 && segments[0] === "submission-reject" && method === "POST") {
      if (!isAdmin(req)) return sendJSON(res, 401, { error: "Admin token required" });
      return handleSubmissionRejectByPayload(req, res);
    }

    if (segments.length === 2 && segments[0] === "tools" && segments[1] === "enrich" && method === "POST") {
      return handleToolEnrich(req, res);
    }

    if (segments.length === 2 && segments[0] === "tools" && method === "PATCH") {
      if (!isAdmin(req)) return sendJSON(res, 401, { error: "Admin token required" });
      return handleToolUpdate(req, res, segments[1]);
    }

    if (segments.length === 3 && segments[0] === "tools" && segments[2] === "update" && method === "POST") {
      if (!isAdmin(req)) return sendJSON(res, 401, { error: "Admin token required" });
      return handleToolUpdate(req, res, segments[1]);
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
    `select id, name, category, description, tags, url, votes,
            thumbnail_url as "thumbnailUrl",
            demo_video_url as "demoVideoUrl",
            created_at as "createdAt"
       from tools
      order by created_at desc`
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

async function handleToolCreate(req, res) {
  const payload = await parseBody(req);
  const validationError = validateSubmission(payload);
  if (validationError) return sendJSON(res, 400, { error: validationError });

  const toolId = generateToolId(payload.name);
  const thumbnailUrl = resolveThumbnailUrl(payload.thumbnailUrl, payload.demoVideoUrl);

  await query(
    `insert into tools (id, name, url, category, description, tags, votes, thumbnail_url, demo_video_url)
     values ($1, $2, $3, $4, $5, $6, 0, $7, $8)`,
    [
      toolId,
      payload.name.trim(),
      payload.url.trim(),
      payload.category,
      payload.description.trim(),
      deriveTags(payload.description),
      thumbnailUrl,
      normalizeOptionalUrl(payload.demoVideoUrl),
    ]
  );

  return sendJSON(res, 201, { ok: true, id: toolId });
}

async function handleToolUpdate(req, res, id) {
  const payload = await parseBody(req);
  const validationError = validateSubmission(payload);
  if (validationError) return sendJSON(res, 400, { error: validationError });
  const votes = parseVotes(payload.votes);
  if (votes === "invalid") return sendJSON(res, 400, { error: "Invalid votes value" });
  const thumbnailUrl = resolveThumbnailUrl(payload.thumbnailUrl, payload.demoVideoUrl);

  const updated = await query(
    `update tools
        set name = $2,
            url = $3,
            category = $4,
            description = $5,
            tags = $6,
            thumbnail_url = $7,
            demo_video_url = $8,
            votes = coalesce($9::int, votes)
      where id = $1
      returning id`,
    [
      id,
      payload.name.trim(),
      payload.url.trim(),
      payload.category,
      payload.description.trim(),
      deriveTags(payload.description),
      thumbnailUrl,
      normalizeOptionalUrl(payload.demoVideoUrl),
      votes,
    ]
  );

  if (!updated.rows.length) {
    return sendJSON(res, 404, { error: "Tool not found" });
  }

  return sendJSON(res, 200, { ok: true, id: updated.rows[0].id });
}

async function handleToolVoteByPayload(req, res) {
  const payload = await parseBody(req);
  const id = String(payload.id || "").trim();
  if (!id) return sendJSON(res, 400, { error: "Tool id is required" });
  return handleVote(res, id);
}

async function handleToolUpdateByPayload(req, res) {
  const payload = await parseBody(req);
  const id = String(payload.id || "").trim();
  if (!id) return sendJSON(res, 400, { error: "Tool id is required" });
  return handleToolUpdate({ ...req, body: payload }, res, id);
}

async function handleToolDeleteByPayload(req, res) {
  const payload = await parseBody(req);
  const id = String(payload.id || "").trim();
  if (!id) return sendJSON(res, 400, { error: "Tool id is required" });

  const deleted = await query("delete from tools where id = $1 returning id", [id]);
  if (!deleted.rows.length) {
    return sendJSON(res, 404, { error: "Tool not found" });
  }

  return sendJSON(res, 200, { ok: true, id });
}

async function handleToolEnrich(req, res) {
  const payload = await parseBody(req);
  const rawUrl = String(payload.url || "").trim();

  if (!rawUrl) return sendJSON(res, 400, { error: "URL is required" });

  let parsed;
  try {
    parsed = new URL(rawUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return sendJSON(res, 400, { error: "URL must be http or https" });
    }
  } catch {
    return sendJSON(res, 400, { error: "Invalid URL" });
  }

  try {
    const html = await fetchHTML(parsed.toString());
    const meta = extractMeta(parsed, html);

    return sendJSON(res, 200, {
      ok: true,
      enrichment: {
        title: meta.title || parsed.hostname.replace(/^www\./, ""),
        description: meta.description || null,
        thumbnailUrl: meta.thumbnailUrl || `${parsed.origin}/favicon.ico`,
        demoVideoUrl: meta.demoVideoUrl || null,
        source: "open-graph",
      },
    });
  } catch {
    return sendJSON(res, 200, {
      ok: true,
      enrichment: {
        title: parsed.hostname.replace(/^www\./, ""),
        description: null,
        thumbnailUrl: `${parsed.origin}/favicon.ico`,
        demoVideoUrl: null,
        source: "fallback",
      },
    });
  }
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
    `select id, name, category, description, tags, url, votes,
            thumbnail_url as "thumbnailUrl",
            demo_video_url as "demoVideoUrl"
       from tools
      order by created_at desc`
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
    `insert into submissions (name, url, category, description, tags, votes, thumbnail_url, demo_video_url)
     values ($1, $2, $3, $4, $5, 0, $6, $7)`,
    [
      payload.name.trim(),
      payload.url.trim(),
      payload.category,
      payload.description.trim(),
      deriveTags(payload.description),
      normalizeOptionalUrl(payload.thumbnailUrl),
      normalizeOptionalUrl(payload.demoVideoUrl),
    ]
  );

  return sendJSON(res, 201, { ok: true });
}

async function handleSubmissionList(res) {
  const result = await query(
    `select id, name, url, category, description, tags, votes,
            thumbnail_url as "thumbnailUrl",
            demo_video_url as "demoVideoUrl",
            submitted_at as "submittedAt"
       from submissions
      order by submitted_at desc`
  );
  return sendJSON(res, 200, { submissions: result.rows });
}

async function handleSubmissionApprove(res, id) {
  const result = await query(
    `with moved as (
      delete from submissions
      where id = $1
      returning name, url, category, description, tags, votes, thumbnail_url, demo_video_url
    )
    insert into tools (id, name, url, category, description, tags, votes, thumbnail_url, demo_video_url)
    select concat('tool-', replace(lower(name), ' ', '-'), '-', substring(md5(random()::text), 1, 6)),
           name, url, category, description, tags, votes, thumbnail_url, demo_video_url
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

async function handleSubmissionApproveByPayload(req, res) {
  const payload = await parseBody(req);
  const id = String(payload.id || "").trim();
  if (!id) return sendJSON(res, 400, { error: "Submission id is required" });
  return handleSubmissionApprove(res, id);
}

async function handleSubmissionRejectByPayload(req, res) {
  const payload = await parseBody(req);
  const id = String(payload.id || "").trim();
  if (!id) return sendJSON(res, 400, { error: "Submission id is required" });
  return handleSubmissionReject(res, id);
}

function normalizeSegments(req) {
  const routeParam = req?.query?.route;
  if (!routeParam) {
    const url = String(req?.url || "");
    const pathname = url.split("?")[0] || "";
    if (!pathname.startsWith("/api/")) return [];
    return pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  }
  if (Array.isArray(routeParam)) return routeParam.filter(Boolean);
  const asString = String(routeParam);

  if (asString.includes("/")) {
    return asString.split("/").filter(Boolean);
  }

  return [asString];
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

  const optionalUrlFields = ["thumbnailUrl", "demoVideoUrl"];
  for (const field of optionalUrlFields) {
    if (payload[field] && !isValidHttpUrl(String(payload[field]))) {
      return `Invalid ${field}`;
    }
  }

  return null;
}

function deriveTags(text) {
  return String(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 4)
    .slice(0, 3);
}

function normalizeOptionalUrl(value) {
  const trimmed = String(value || "").trim();
  return trimmed || null;
}

function resolveThumbnailUrl(thumbnailUrl, demoVideoUrl) {
  const explicit = normalizeOptionalUrl(thumbnailUrl);
  if (explicit) return explicit;
  return inferThumbnailFromVideoUrl(normalizeOptionalUrl(demoVideoUrl));
}

function inferThumbnailFromVideoUrl(videoUrl) {
  if (!videoUrl) return null;
  try {
    const parsed = new URL(videoUrl);
    const host = parsed.hostname.toLowerCase();

    if (host.includes("youtube.com")) {
      const id = parsed.searchParams.get("v");
      return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
    }

    if (host.includes("youtu.be")) {
      const id = parsed.pathname.split("/").filter(Boolean).pop();
      return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
    }

    if (host.includes("vimeo.com")) {
      const id = parsed.pathname.split("/").filter(Boolean).pop();
      return id ? `https://vumbnail.com/${id}.jpg` : null;
    }
  } catch {
    return null;
  }

  return null;
}

function parseVotes(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const num = Number.parseInt(String(value), 10);
  if (!Number.isFinite(num) || Number.isNaN(num) || num < 0) return "invalid";
  return num;
}

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function generateToolId(name) {
  const slug = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 50);
  return `tool-${slug}-${Math.random().toString(36).slice(2, 8)}`;
}

async function fetchHTML(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "user-agent": "FluxstackBot/1.0 (+https://fluxstack.ai)",
        accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      throw new Error(`Could not fetch URL (${response.status})`);
    }

    const html = await response.text();
    return html.slice(0, 300000);
  } finally {
    clearTimeout(timeout);
  }
}

function extractMeta(baseUrl, html) {
  const title =
    findMetaContent(html, "property", "og:title") ||
    findMetaContent(html, "name", "twitter:title") ||
    findTagContent(html, "title");

  const description =
    findMetaContent(html, "property", "og:description") ||
    findMetaContent(html, "name", "description") ||
    findMetaContent(html, "name", "twitter:description");

  const thumb =
    findMetaContent(html, "property", "og:image") ||
    findMetaContent(html, "name", "twitter:image") ||
    findMetaContent(html, "property", "og:image:url");

  const video =
    findMetaContent(html, "property", "og:video") ||
    findMetaContent(html, "property", "og:video:url") ||
    findMetaContent(html, "name", "twitter:player") ||
    null;

  const thumbnailUrl = absolutizeUrl(baseUrl, thumb);
  const demoVideoUrl = absolutizeUrl(baseUrl, video);

  return {
    title: cleanText(title),
    description: cleanText(description),
    thumbnailUrl,
    demoVideoUrl,
  };
}

function findMetaContent(html, attrName, attrValue) {
  const escaped = escapeRegex(attrValue);
  const regex = new RegExp(`<meta[^>]*${attrName}=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i");
  const reverseRegex = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*${attrName}=["']${escaped}["'][^>]*>`, "i");
  const match = html.match(regex) || html.match(reverseRegex);
  return match?.[1] || null;
}

function findTagContent(html, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = html.match(regex);
  return match?.[1] || null;
}

function cleanText(value) {
  if (!value) return null;
  return String(value).replace(/\s+/g, " ").trim();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function absolutizeUrl(baseUrl, candidate) {
  if (!candidate) return null;
  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return null;
  }
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
  if (error?.name === "AbortError") {
    return "Request timed out while fetching metadata";
  }
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

async function ensureSchema() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = query(`
      create extension if not exists pgcrypto;

      create table if not exists tools (
        id text primary key,
        name text not null,
        category text not null,
        description text not null,
        tags text[] not null default '{}',
        url text not null,
        votes integer not null default 0,
        thumbnail_url text,
        demo_video_url text,
        created_at timestamptz not null default now()
      );

      create table if not exists submissions (
        id uuid primary key default gen_random_uuid(),
        name text not null,
        category text not null,
        description text not null,
        tags text[] not null default '{}',
        url text not null,
        votes integer not null default 0,
        thumbnail_url text,
        demo_video_url text,
        submitted_at timestamptz not null default now()
      );

      alter table tools add column if not exists thumbnail_url text;
      alter table tools add column if not exists demo_video_url text;
      alter table submissions add column if not exists thumbnail_url text;
      alter table submissions add column if not exists demo_video_url text;
    `).catch((error) => {
      schemaReadyPromise = undefined;
      throw error;
    });
  }

  return schemaReadyPromise;
}
