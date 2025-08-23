import "server-only";
import {
  getApps,
  initializeApp,
  cert,
  type AppOptions,
  type ServiceAccount,
} from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

/** サービスアカウントJSONの構造（snake_case） */
type ServiceAccountJson = {
  project_id?: string;
  private_key?: string;
  client_email?: string;
  [k: string]: unknown;
};

const svcRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!svcRaw) {
  throw new Error(
    "FIREBASE_SERVICE_ACCOUNT が未設定です。サービスアカウントJSONを1行で入れてください。"
  );
}

let parsed: ServiceAccountJson;
try {
  parsed = JSON.parse(svcRaw) as ServiceAccountJson;
} catch {
  throw new Error(
    "FIREBASE_SERVICE_ACCOUNT のJSONが不正です。1行JSON（ダブルクォート）で入れてください。"
  );
}

// 改行を復元
const privateKey = parsed.private_key?.replace(/\\n/g, "\n");

const projectId =
  process.env.FIREBASE_PROJECT_ID || parsed.project_id || undefined;

if (!projectId) {
  throw new Error(
    "projectId が見つかりません。FIREBASE_PROJECT_ID を設定するか、JSON内に project_id を含めてください。"
  );
}

// cert() が要求する camelCase の ServiceAccount に変換
const serviceAccount: ServiceAccount = {
  projectId,
  privateKey,
  clientEmail: parsed.client_email,
};

if (process.env.NODE_ENV !== "production") {
  console.log("[firebaseAdmin] using service account for project:", projectId);
}

export const app =
  getApps()[0] ??
  initializeApp({
    credential: cert(serviceAccount),
    projectId,
  } satisfies AppOptions);

export function getAdminDb() {
  return getFirestore(app);
}
