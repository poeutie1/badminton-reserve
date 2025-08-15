import "server-only";
import {
  getApps,
  initializeApp,
  cert,
  type AppOptions,
} from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const svcRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!svcRaw) {
  throw new Error(
    "FIREBASE_SERVICE_ACCOUNT が未設定です。サービスアカウントJSONを1行で入れてください。"
  );
}

let svc: any;
try {
  svc = JSON.parse(svcRaw);
} catch {
  throw new Error(
    "FIREBASE_SERVICE_ACCOUNT のJSONが不正です。1行JSON（ダブルクォート）で入れてください。"
  );
}

if (typeof svc.private_key === "string") {
  svc.private_key = svc.private_key.replace(/\\n/g, "\n");
}

const projectId = process.env.FIREBASE_PROJECT_ID || svc.project_id;

if (!projectId) {
  throw new Error(
    "projectId が見つかりません。FIREBASE_PROJECT_ID を設定するか、JSON内に project_id を含めてください。"
  );
}

// デバッグ用（秘密は出さない）
if (process.env.NODE_ENV !== "production") {
  console.log("[firebaseAdmin] using service account for project:", projectId);
}

const app =
  getApps()[0] ??
  initializeApp({
    credential: cert(svc), // ← 必ず credential を渡す（applicationDefault にしない）
    projectId,
  } satisfies AppOptions);

export function getAdminDb() {
  return getFirestore(app);
}
