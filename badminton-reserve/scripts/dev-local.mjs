import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const require = createRequire(import.meta.url);
const nextRequire = createRequire(require.resolve("next/package.json"));
nextRequire("@next/env").loadEnvConfig(process.cwd(), true);
mkdirSync(".local-preview", { recursive: true });
const secretFile = ".local-preview/auth-secret";
if (!existsSync(secretFile)) writeFileSync(secretFile, randomBytes(32).toString("hex"), { mode: 0o600 });
const secret = readFileSync(secretFile, "utf8").trim();
Object.assign(process.env, {
  NODE_ENV: "development", LOCAL_PREVIEW: "true",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_PROJECT_ID: "demo-badminton-local",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-badminton-local", NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  NEXT_PUBLIC_FIREBASE_API_KEY: "local-preview-only", NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "localhost",
  NEXT_PUBLIC_FIREBASE_APP_ID: "local-preview-only", FIREBASE_SERVICE_ACCOUNT: "",
  LINE_NOTIFICATIONS_DISABLED: "true", LINE_CHANNEL_ACCESS_TOKEN: "",
  LINE_CLIENT_ID: "local-preview-only", LINE_CLIENT_SECRET: "local-preview-only",
  ADMIN_UIDS: "line:local-admin", AUTH_SECRET: secret, NEXTAUTH_SECRET: secret,
  AUTH_URL: "http://localhost:3000", NEXTAUTH_URL: "http://localhost:3000",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
});
try {
  const response = await fetch("http://127.0.0.1:8080/", { signal: AbortSignal.timeout(3000) });
  await response.text();
} catch {
  console.error("先に pnpm emulator:local で確認用DBを起動してください。");
  process.exit(1);
}
const { seedLocal } = await import("./seed-local.mjs");
const month = await seedLocal(process.argv.includes("--reset"));
console.log(`確認URL: http://localhost:3000/events/${month.year}/${month.month}`);
const child = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3000"], { stdio: "inherit", env: process.env });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", code => process.exit(code ?? 0));
