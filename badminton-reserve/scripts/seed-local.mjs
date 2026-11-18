import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

export const localProjectId = "demo-badminton-local";

export async function seedLocal(reset = false) {
  const host = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
  if (!/^(localhost|127\.0\.0\.1):\d+$/.test(host)) throw new Error("ローカルEmulator専用です");
  process.env.FIRESTORE_EMULATOR_HOST = host;
  const app = getApps().find(app => app.name === "local-seed") ?? initializeApp({ projectId: localProjectId }, "local-seed");
  const db = getFirestore(app);
  const tomorrow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const date = new Date(Date.UTC(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate(), 9, 30));
  const admin = "line:local-admin";
  const guest = (id, name) => ({ id, name, gender: "未回答", years: 3, addedBy: admin, addedAt: new Date().toISOString() });
  const users = [
    { id: admin, name: "確認用管理者", gender: "未回答" },
    { id: "line:local-member-a", name: "確認用会員A", gender: "男性" },
    { id: "line:local-member-b", name: "確認用会員B", gender: "女性" },
  ];
  for (const user of users) {
    const profile = { displayName: user.name, nickname: user.name, gender: user.gender, years: 5 };
    await db.collection("users").doc(user.id).set(profile, { merge: true });
    await db.collection("profiles").doc(user.id).set(profile, { merge: true });
    if (reset) await db.recursiveDelete(db.collection("users").doc(user.id).collection("notifications"));
  }
  const base = { date: Timestamp.fromDate(date), time: "18:30〜21:30", location: "ローカル確認用の会場", createdBy: admin, status: "open" };
  const events = [
    { id: "local-guest-waitlist", title: "キャンセル待ち確認用（満員）", capacity: 2,
      participants: [admin, "line:local-member-a"], guests: [],
      waitlist: ["line:local-member-b", "guest-local-waiting"],
      guestWaitlist: [guest("guest-local-waiting", "ゲスト花子")] },
    { id: "local-guest-open", title: "ゲスト参加確認用（空きあり）", capacity: 4,
      participants: [admin], guests: [guest("guest-local-joined", "ゲスト太郎")], waitlist: [], guestWaitlist: [] },
  ];
  for (const { id, ...event } of events) {
    const ref = db.collection("events").doc(id);
    if (reset || !(await ref.get()).exists) await ref.set({ ...base, ...event });
  }
  console.log("ローカル確認用データ準備完了（demo-badminton-local）");
  return { year: tomorrow.getUTCFullYear(), month: tomorrow.getUTCMonth() + 1 };
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  await seedLocal(process.argv.includes("--reset"));
  process.exit(0);
}
