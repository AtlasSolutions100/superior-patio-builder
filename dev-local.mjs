#!/usr/bin/env node
// Local development launcher (outside Replit).
//   node dev-local.mjs
// Loads ./.env, starts the API (tsx watch, port 8080) and the web app
// (vite, port 18735, proxies /api -> 8080), and stops both on Ctrl+C.
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
process.chdir(root);

function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    out[key] = val;
  }
  return out;
}

const dotenv = loadEnv(path.join(root, ".env"));
const missing = ["DATABASE_URL", "CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY", "VITE_CLERK_PUBLISHABLE_KEY"].filter(k => !dotenv[k] && !process.env[k]);
if (missing.length) {
  console.error(`[dev] missing in .env: ${missing.join(", ")}`);
  process.exit(1);
}

const API_PORT = process.env.API_PORT ?? "8080";
const WEB_PORT = process.env.WEB_PORT ?? "18735";
const children = [];

function run(name, cmd, args, cwd, extraEnv) {
  const child = spawn(cmd, args, {
    cwd: path.join(root, cwd),
    env: { ...process.env, ...dotenv, ...extraEnv },
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const tag = `[${name}] `;
  const pipe = (stream, dest) => {
    let buf = "";
    stream.on("data", d => {
      buf += d.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const l of lines) dest.write(tag + l + "\n");
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", code => {
    console.log(`${tag}exited with code ${code}`);
    shutdown(code ?? 1);
  });
  children.push(child);
  return child;
}

let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const c of children) {
    try {
      if (process.platform === "win32") execSync(`taskkill /pid ${c.pid} /T /F`, { stdio: "ignore" });
      else c.kill("SIGTERM");
    } catch {}
  }
  process.exit(code);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log(`[dev] API  -> http://localhost:${API_PORT}/api/healthz`);
console.log(`[dev] Web  -> http://localhost:${WEB_PORT}/`);

run("api", "pnpm", ["exec", "tsx", "watch", "src/index.ts"], "artifacts/api-server", {
  PORT: API_PORT,
  NODE_ENV: "development",
});
run("web", "pnpm", ["exec", "vite", "--config", "vite.config.ts", "--host", "0.0.0.0"], "artifacts/job-board", {
  PORT: WEB_PORT,
  BASE_PATH: "/",
  API_PROXY_TARGET: `http://localhost:${API_PORT}`,
});
