import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import handler from "./api/[...route].js";

const PORT = 3000;
const HOST = "127.0.0.1";
const ROOT = process.cwd();

const MIME = {
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
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      req.query = Object.fromEntries(url.searchParams.entries());
      req.query.route = url.pathname
        .replace(/^\/api\/?/, "")
        .split("/")
        .filter(Boolean);
      await handler(req, res);
      return;
    }

    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = path.resolve(ROOT, `.${pathname}`);

    if (!filePath.startsWith(ROOT)) {
      res.statusCode = 403;
      res.end("Forbidden");
      return;
    }

    try {
      const content = await readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      res.statusCode = 200;
      res.setHeader("content-type", MIME[ext] || "application/octet-stream");
      res.end(content);
    } catch {
      const html = await readFile(path.resolve(ROOT, "index.html"));
      res.statusCode = 200;
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(html);
    }
  } catch {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Local server error" }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Fluxstack local dev server running at http://${HOST}:${PORT}`);
});
