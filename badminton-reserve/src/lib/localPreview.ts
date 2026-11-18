export const localPreviewUsers = [
  { key: "admin", id: "line:local-admin", name: "確認用管理者" },
  { key: "member-a", id: "line:local-member-a", name: "確認用会員A" },
  { key: "member-b", id: "line:local-member-b", name: "確認用会員B" },
] as const;

/** Local credentials must never enable access to a production database. */
export function isLocalPreview(): boolean {
  if (process.env.LOCAL_PREVIEW !== "true") return false;
  if (process.env.NODE_ENV === "production" ||
      process.env.FIREBASE_PROJECT_ID !== "demo-badminton-local" ||
      !/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? "")) {
    throw new Error("ローカル確認には専用demoプロジェクトとローカルFirestore Emulatorが必要です");
  }
  return true;
}

export function isLocalPreviewRequest(request: Request): boolean {
  return isLocalPreview() && ["localhost", "127.0.0.1"].includes(new URL(request.url).hostname);
}
