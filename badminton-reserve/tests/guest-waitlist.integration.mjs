import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { loadRoute } from "./route-loader.mjs";

if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080") {
  throw new Error("確認用のFirestore Emulator（127.0.0.1:8080）が必要です。本番DBでは実行しません。");
}
await fetch("http://127.0.0.1:8080/", { signal: AbortSignal.timeout(3000) });
const suffix = randomUUID();
const admin = `line:guest-test-admin-${suffix}`;
const member = `line:guest-test-member-${suffix}`;
const host = `line:guest-test-host-${suffix}`;
process.env.ADMIN_UIDS = admin;
process.env.LINE_NOTIFICATIONS_DISABLED = "true";
const app = initializeApp({ projectId: "demo-badminton-local" }, `guest-tests-${suffix}`);
const db = getFirestore(app);
globalThis.guestTest = { actor: admin, db, pushes: [] };
const guests = await loadRoute("events/[id]/guests");
const join = await loadRoute("events/[id]/join");
const cancel = await loadRoute("events/[id]/cancel");
const capacity = await loadRoute("admin/events/[id]");
const eventIds = [];
const request = (id, method, body) => new Request(`http://localhost:3000/api/events/${id}/guests`, {
  method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
});
const context = id => ({ params: Promise.resolve({ id }) });
const state = async id => (await db.collection("events").doc(id).get()).data();
async function fixture() {
  const ref = db.collection("events").doc(`guest-test-${randomUUID()}`);
  eventIds.push(ref.id);
  await ref.set({ title: "ゲスト待機テスト", date: Timestamp.now(), capacity: 1, participants: [host], guests: [], waitlist: [] });
  return ref.id;
}
test("管理者専用ゲスト登録API：満員→待機→順番どおり繰り上げ→取り消し", async () => {
  const id = await fixture();
  try {
    guestTest.actor = admin;
    let response = await guests.POST(request(id, "POST", { name: "確認ゲストA" }), context(id));
    assert.equal(response.status, 200);
    const first = await response.json();
    assert.equal(first.status, "waiting");
    assert.deepEqual((await state(id)).waitlist, [first.guestId]);
    assert.equal((await state(id)).guests.length, 0);

    guestTest.actor = member;
    response = await guests.POST(request(id, "POST", { name: "権限なし" }), context(id));
    assert.equal(response.status, 403);
    response = await guests.DELETE(request(id, "DELETE", { guestId: first.guestId }), context(id));
    assert.equal(response.status, 403);
    await join.POST(request(id, "POST"), context(id));

    guestTest.actor = admin;
    const third = await (await guests.POST(request(id, "POST", { name: "確認ゲストC" }), context(id))).json();
    assert.deepEqual((await state(id)).waitlist, [first.guestId, member, third.guestId]);

    guestTest.actor = host;
    await cancel.POST(request(id, "POST"), context(id));
    assert.deepEqual((await state(id)).guests.map(guest => guest.id), [first.guestId]);
    const notes = await db.collection("users").doc(admin).collection("notifications").where("guestId", "==", first.guestId).get();
    assert.equal(notes.size, 1);
    assert.equal(guestTest.pushes.at(-1).to, admin);

    guestTest.actor = admin;
    await guests.DELETE(request(id, "DELETE", { guestId: first.guestId }), context(id));
    assert.deepEqual((await state(id)).participants, [member]);
    assert.deepEqual((await state(id)).waitlist, [third.guestId]);
    await capacity.PATCH(request(id, "PATCH", { capacity: 2 }), context(id));
    assert.deepEqual((await state(id)).guests.map(guest => guest.id), [third.guestId]);
    assert.deepEqual((await state(id)).waitlist, []);

    const waiting = await (await guests.POST(request(id, "POST", { name: "取消確認" }), context(id))).json();
    assert.equal(waiting.status, "waiting");
    await guests.DELETE(request(id, "DELETE", { guestId: waiting.guestId }), context(id));
    assert.deepEqual((await state(id)).waitlist, []);
    assert.equal((await state(id)).participants.length + (await state(id)).guests.length, 2);
  } finally {
    await Promise.all(eventIds.map(id => db.collection("events").doc(id).delete()));
    for (const user of [admin, member, host]) await db.recursiveDelete(db.collection("users").doc(user));
  }
});
test("同時にゲスト登録しても定員を超えず、後続が待機になる", async () => {
  const id = await fixture();
  try {
    await db.collection("events").doc(id).update({ participants: [] });
    guestTest.actor = admin;
    const responses = await Promise.all(["同時A", "同時B"].map(name => guests.POST(request(id, "POST", { name }), context(id))));
    assert.deepEqual(responses.map(response => response.status), [200, 200]);
    const current = await state(id);
    assert.equal(current.guests.length, 1);
    assert.equal(current.waitlist.length, 1);
    assert.equal(current.guestWaitlist.length, 1);
  } finally {
    await db.collection("events").doc(id).delete();
    await deleteApp(app);
  }
});
