import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 5173);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png"
};

function firebaseConfigScript() {
  const envMap = {
    apiKey: "FIREBASE_API_KEY",
    authDomain: "FIREBASE_AUTH_DOMAIN",
    databaseURL: "FIREBASE_DATABASE_URL",
    projectId: "FIREBASE_PROJECT_ID",
    storageBucket: "FIREBASE_STORAGE_BUCKET",
    messagingSenderId: "FIREBASE_MESSAGING_SENDER_ID",
    appId: "FIREBASE_APP_ID"
  };
  const config = Object.fromEntries(
    Object.entries(envMap)
      .map(([key, envName]) => [key, process.env[envName] || ""])
      .filter(([, value]) => value)
  );
  return `window.__FIREBASE_CONFIG__ = ${JSON.stringify(config)};`;
}

function sanitizeUrl(url) {
  const pathname = decodeURIComponent(new URL(url, `http://localhost:${port}`).pathname);
  if (pathname === "/api/firebase-config.js") return pathname;
  if (pathname === "/") return "/index.html";
  const normalized = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  return normalized;
}

const server = createServer(async (request, response) => {
  try {
    const requestPath = sanitizeUrl(request.url || "/");
    if (requestPath === "/api/firebase-config.js") {
      response.writeHead(200, {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "no-store"
      });
      response.end(firebaseConfigScript());
      return;
    }

    const filePath = path.join(root, requestPath);
    const target = existsSync(filePath) ? filePath : path.join(root, "index.html");
    const ext = path.extname(target);
    const body = await readFile(target);
    response.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream"
    });
    response.end(body);
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(error instanceof Error ? error.message : "Server error");
  }
});

server.listen(port, () => {
  console.log(`투자의 신 dev server: http://localhost:${port}`);
});
