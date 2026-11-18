import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

async function load(file) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}
const { readAttendance, participantCount, addGuest, joinMember, cancelMember, removeGuest, promoteWaitlist } = await load("../src/lib/attendance.ts");
const guest = id => ({ id: `guest-${id}`, name: `ゲスト${id}`, addedBy: "line:admin", addedAt: "2026-11-18T00:00:00Z" });
const empty = () => readAttendance({});

test("既存の会員のみのイベントを変更なしで扱える", () => {
  const state = readAttendance({ participants: ["line:a"], waitlist: ["line:b"], guests: [guest("in")] });
  assert.deepEqual(state.waitlist, ["line:b"]);
  assert.equal(participantCount(state), 2);
  assert.deepEqual(state.guestWaitlist, []);
});

test("満員時のゲストは会員と共通の列の末尾に入る", () => {
  const state = readAttendance({ participants: ["line:a"], waitlist: ["line:b"] });
  assert.equal(addGuest(state, guest("c"), 1).status, "waiting");
  assert.deepEqual(state.waitlist, ["line:b", "guest-c"]);
  assert.equal(participantCount(state), 1);
});

test("ゲストの後に登録した会員は追い越さない", () => {
  const state = readAttendance({ participants: ["line:a"] });
  addGuest(state, guest("b"), 1);
  joinMember(state, "line:c", 1);
  assert.deepEqual(state.waitlist, ["guest-b", "line:c"]);
});

test("会員キャンセルで先頭のゲストを参加へ移し、登録者へ通知する", () => {
  const state = readAttendance({ participants: ["line:a"], waitlist: ["guest-b", "line:c"], guestWaitlist: [guest("b")] });
  const promoted = cancelMember(state, "line:a", 1);
  assert.deepEqual(state.guests, [guest("b")]);
  assert.deepEqual(state.participants, []);
  assert.deepEqual(state.waitlist, ["line:c"]);
  assert.deepEqual(state.guestWaitlist, []);
  assert.deepEqual(promoted, [{ kind: "guest", id: "guest-b", name: "ゲストb", notifyUserId: "line:admin" }]);
});

test("参加ゲスト削除で先頭の会員が繰り上がる", () => {
  const state = readAttendance({ guests: [guest("a")], waitlist: ["line:b", "guest-c"], guestWaitlist: [guest("c")] });
  const promoted = removeGuest(state, "guest-a", 1);
  assert.deepEqual(state.participants, ["line:b"]);
  assert.deepEqual(state.waitlist, ["guest-c"]);
  assert.equal(promoted[0].notifyUserId, "line:b");
});

test("待機ゲストの取り消しは参加人数と他の人の順番を変えない", () => {
  const state = readAttendance({ participants: ["line:a"], waitlist: ["line:b", "guest-c", "line:d"], guestWaitlist: [guest("c")] });
  assert.deepEqual(removeGuest(state, "guest-c", 1), []);
  assert.deepEqual(state.waitlist, ["line:b", "line:d"]);
  assert.equal(participantCount(state), 1);
});

test("待機会員の取り消しはゲストを参加に繰り上げない", () => {
  const state = readAttendance({ participants: ["line:a"], waitlist: ["line:b", "guest-c"], guestWaitlist: [guest("c")] });
  assert.deepEqual(cancelMember(state, "line:b", 1), []);
  assert.deepEqual(state.waitlist, ["guest-c"]);
});

test("定員増加は会員とゲストを混在する順番で必要な人数だけ繰り上げる", () => {
  const state = readAttendance({ participants: ["line:a"], waitlist: ["guest-b", "line:c", "guest-d"], guestWaitlist: [guest("b"), guest("d")] });
  assert.deepEqual(promoteWaitlist(state, 3).map(person => person.id), ["guest-b", "line:c"]);
  assert.equal(participantCount(state), 3);
  assert.deepEqual(state.waitlist, ["guest-d"]);
});

test("参加者が定員を超えている間はキャンセルが出ても繰り上げない", () => {
  const state = readAttendance({ participants: ["line:a", "line:b"], guests: [guest("c")], waitlist: ["line:d"] });
  assert.deepEqual(cancelMember(state, "line:a", 1), []);
  assert.deepEqual(state.waitlist, ["line:d"]);
});

test("空き枠があっても既存の待機ゲストを先に繰り上げる", () => {
  const state = readAttendance({ waitlist: ["guest-a"], guestWaitlist: [guest("a")] });
  assert.equal(joinMember(state, "line:b", 1).status, "waiting");
  assert.deepEqual(state.guests, [guest("a")]);
  assert.deepEqual(state.waitlist, ["line:b"]);
});

test("新規ゲストも既存の待機会員を追い越さない", () => {
  const state = readAttendance({ waitlist: ["line:a"] });
  assert.equal(addGuest(state, guest("b"), 1).status, "waiting");
  assert.deepEqual(state.participants, ["line:a"]);
  assert.deepEqual(state.waitlist, ["guest-b"]);
});

test("表示用の正規化で待機ゲストを消さず、存在しない参照と重複だけを除く", () => {
  const state = readAttendance({ participants: ["line:a", " line:a "], waitlist: ["guest-b", "line:c", "guest-b", "guest-missing", "dummyUser", "line:a"], guestWaitlist: [guest("b")] });
  assert.deepEqual(state.waitlist, ["guest-b", "line:c"]);
  assert.deepEqual(state.guestWaitlist, [guest("b")]);
});

test("待機人数は定員の参加人数に含めない", () => {
  const state = readAttendance({ participants: ["line:a"], guests: [guest("b")], waitlist: ["guest-c", "line:d"], guestWaitlist: [guest("c")] });
  assert.equal(participantCount(state), 2);
});

test("参加済み・待機済みの会員の二重登録を防ぐ", () => {
  const state = readAttendance({ participants: ["line:a"], waitlist: ["line:b"] });
  assert.equal(joinMember(state, "line:a", 1).status, "in");
  assert.equal(joinMember(state, "line:b", 1).status, "waiting");
  assert.deepEqual(state.participants, ["line:a"]);
  assert.deepEqual(state.waitlist, ["line:b"]);
});

test("存在しない参加者・ゲストの削除は待機を繰り上げない", () => {
  const state = readAttendance({ waitlist: ["line:b"] });
  assert.deepEqual(cancelMember(state, "line:missing", 1), []);
  assert.deepEqual(removeGuest(state, "guest-missing", 1), []);
});

test("定員0と管理者の繰り上げなし除外を扱う", () => {
  const state = readAttendance({ participants: ["line:a"], waitlist: ["line:b"] });
  assert.deepEqual(promoteWaitlist(state, 0), []);
  assert.deepEqual(cancelMember(state, "line:a", 1, false), []);
  assert.deepEqual(state.waitlist, ["line:b"]);
});

test("Emulator利用時のLINE通知は通信を一切行わない", async () => {
  const line = await load("../src/lib/line.ts");
  const previous = process.env.FIRESTORE_EMULATOR_HOST;
  const originalFetch = globalThis.fetch;
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  globalThis.fetch = () => { throw new Error("外部送信してはいけない"); };
  try {
    assert.equal(await line.pushPromotedMessage({ to: "line:Utest", title: "確認", whenLabel: "明日", eventUrl: "http://localhost:3000", guestName: "ゲストA" }), true);
    assert.match(JSON.stringify(line.buildPromotionFlex({ title: "確認", whenText: "明日", url: "http://localhost:3000", guestName: "ゲストA" })), /ゲストA/);
  } finally {
    globalThis.fetch = originalFetch;
    if (previous === undefined) delete process.env.FIRESTORE_EMULATOR_HOST;
    else process.env.FIRESTORE_EMULATOR_HOST = previous;
  }
});

test("ローカル確認ログインは本番DBやリモートDBでは有効にならない", async () => {
  const { isLocalPreview } = await load("../src/lib/localPreview.ts");
  const previous = { ...process.env };
  try {
    Object.assign(process.env, { LOCAL_PREVIEW: "true", NODE_ENV: "development", FIREBASE_PROJECT_ID: "demo-badminton-local", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" });
    assert.equal(isLocalPreview(), true);
    process.env.FIREBASE_PROJECT_ID = "production-project";
    assert.throws(isLocalPreview);
    process.env.FIREBASE_PROJECT_ID = "demo-badminton-local";
    process.env.FIRESTORE_EMULATOR_HOST = "remote.example:8080";
    assert.throws(isLocalPreview);
  } finally {
    for (const key of ["LOCAL_PREVIEW", "NODE_ENV", "FIREBASE_PROJECT_ID", "FIRESTORE_EMULATOR_HOST"]) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
  }
});
