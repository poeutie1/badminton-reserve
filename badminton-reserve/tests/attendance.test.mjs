import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const { outputText } = ts.transpileModule(readFileSync(new URL("../src/lib/attendance.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { readAttendance, participantCount, addGuest, joinMember, cancelMember, removeGuest, promoteWaitlist } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const guest = id => ({ id: `guest-${id}`, name: `ゲスト${id}`, addedBy: "line:admin", addedAt: "2026-11-18T00:00:00Z" });

test("満員のゲスト追加はエラーではなく共通待機列の末尾へ登録", () => {
  const state = readAttendance({ participants: ["line:host"], waitlist: ["line:first"] });
  assert.equal(addGuest(state, guest("next"), 1).status, "waiting");
  assert.deepEqual(state.waitlist, ["line:first", "guest-next"]);
  assert.equal(participantCount(state), 1);
});
test("ゲストと会員は受付順を守り、新しい会員も追い越さない", () => {
  const state = readAttendance({ participants: ["line:host"] });
  addGuest(state, guest("first"), 1);
  joinMember(state, "line:second", 1);
  addGuest(state, guest("third"), 1);
  assert.deepEqual(state.waitlist, ["guest-first", "line:second", "guest-third"]);
});
test("会員キャンセルでゲストを参加へ移し、追加管理者を通知先とする", () => {
  const state = readAttendance({ participants: ["line:host"], waitlist: ["guest-next"], guestWaitlist: [guest("next")] });
  assert.deepEqual(cancelMember(state, "line:host", 1), [{ id: "guest-next", guestName: "ゲストnext", notifyUserId: "line:admin" }]);
  assert.deepEqual(state.guests, [guest("next")]);
  assert.deepEqual(state.participants, []);
  assert.deepEqual(state.guestWaitlist, []);
});
test("参加ゲストの削除で次の会員を繰り上げる", () => {
  const state = readAttendance({ guests: [guest("in")], waitlist: ["line:next"] });
  assert.equal(removeGuest(state, "guest-in", 1)[0].id, "line:next");
  assert.deepEqual(state.participants, ["line:next"]);
});
test("待機ゲストの取り消しは参加人数と他の人の順番を変えない", () => {
  const state = readAttendance({ participants: ["line:host"], waitlist: ["line:a", "guest:b", "guest-c", "line:d"], guestWaitlist: [guest("c")] });
  assert.deepEqual(removeGuest(state, "guest-c", 1), []);
  assert.deepEqual(state.waitlist, ["line:a", "guest:b", "line:d"]);
  assert.equal(participantCount(state), 1);
});
test("定員増加で会員とゲストを順番に必要な人数だけ繰り上げる", () => {
  const state = readAttendance({ participants: ["line:host"], waitlist: ["guest-a", "line:b", "guest-c"], guestWaitlist: [guest("a"), guest("c")] });
  assert.deepEqual(promoteWaitlist(state, 3).map(person => person.id), ["guest-a", "line:b"]);
  assert.equal(participantCount(state), 3);
  assert.deepEqual(state.waitlist, ["guest-c"]);
});
test("空き枠があっても既存の待機者を先に繰り上げる", () => {
  const state = readAttendance({ waitlist: ["guest-a"], guestWaitlist: [guest("a")] });
  assert.equal(joinMember(state, "line:new", 1).status, "waiting");
  assert.deepEqual(state.guests, [guest("a")]);
});
test("ゲスト参照を正規化で消さず、重複と不明な参照だけを除外", () => {
  const state = readAttendance({ participants: ["line:host", "line:host"], waitlist: ["guest-a", "line:b", "guest-a", "guest-missing", "line:host"], guestWaitlist: [guest("a")] });
  assert.deepEqual(state.waitlist, ["guest-a", "line:b"]);
});
test("待機取り消し・未登録者の削除では空き枠があっても勝手に繰り上げない", () => {
  const state = readAttendance({ waitlist: ["line:a", "line:b"] });
  assert.deepEqual(cancelMember(state, "line:a", 2), []);
  assert.deepEqual(removeGuest(state, "guest-missing", 2), []);
});
test("定員超過・定員ゼロ・繰り上げなしの管理者除外を扱う", () => {
  const state = readAttendance({ participants: ["line:a", "line:b"], waitlist: ["line:c"] });
  assert.deepEqual(cancelMember(state, "line:a", 1), []);
  assert.deepEqual(promoteWaitlist(state, 0), []);
  assert.deepEqual(cancelMember(state, "line:b", 1, false), []);
});
