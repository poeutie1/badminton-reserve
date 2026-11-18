// Route handlersを実際のFirestore Emulatorで実行するためのテスト用ローダー。
// 認証済みユーザーの取得と外部LINE送信だけを差し替える。
import { readFileSync } from "node:fs";
import ts from "typescript";
const sources = new Map();
const encoded = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const overrides = {
  "next/server": encoded("export const NextResponse={json:(body,init)=>Response.json(body,init)};"),
  "@/lib/user": encoded("export async function requireUserId(){ return {userId:globalThis.guestTest.actor}; }"),
  "@/auth": encoded("export async function auth(){return {user:{id:globalThis.guestTest.actor}};}"),
  "./firebaseAdmin": encoded("export function getAdminDb(){return globalThis.guestTest.db;}"),
  "@/lib/firebaseAdmin": encoded("export function getAdminDb(){return globalThis.guestTest.db;}"),
  "./line": encoded("export async function pushPromotedMessage(message){globalThis.guestTest.pushes.push(message);return true;}"),
};
function moduleUrl(file) {
  if (sources.has(file.href)) return sources.get(file.href);
  let { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  outputText = outputText.replace(/from (["'])([^"']+)\1/g, (_, quote, specifier) => {
    const url = overrides[specifier] ?? (specifier.startsWith("@/")
      ? moduleUrl(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url))
      : specifier.startsWith(".") ? moduleUrl(new URL(specifier + ".ts", file)) : import.meta.resolve(specifier));
    return `from ${JSON.stringify(url)}`;
  });
  const url = encoded(outputText);
  sources.set(file.href, url);
  return url;
}
export async function loadRoute(path) {
  return import(moduleUrl(new URL(`../src/app/api/${path}/route.ts`, import.meta.url)));
}
