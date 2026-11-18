import "server-only";
import { isLocalPreview } from "./localPreview";
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

const emulator = process.env.FIRESTORE_EMULATOR_HOST;
// LOCAL_PREVIEW指定時は、設定不備で本番に接続しないよう先に検証する。
isLocalPreview();

function appOptions(): AppOptions {
  if (emulator) {
    return { projectId: process.env.FIREBASE_PROJECT_ID || "demo-badminton-local" };
  }
  const svcRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!svcRaw) throw new Error("FIREBASE_SERVICE_ACCOUNT が未設定です");
  let parsed: ServiceAccountJson;
  try { parsed = JSON.parse(svcRaw) as ServiceAccountJson; }
  catch { throw new Error("FIREBASE_SERVICE_ACCOUNT のJSONが不正です"); }
  const projectId = process.env.FIREBASE_PROJECT_ID || parsed.project_id;
  if (!projectId) throw new Error("Firebase projectId が見つかりません");
  const serviceAccount: ServiceAccount = {
    projectId,
    privateKey: parsed.private_key?.replace(/\\n/g, "\n"),
    clientEmail: parsed.client_email,
  };
  return { credential: cert(serviceAccount), projectId };
}

export const app = getApps()[0] ?? initializeApp(appOptions());

export function getAdminDb() {
  return getFirestore(app);
}
