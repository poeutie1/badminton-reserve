"""localhost + demo Firestore専用の実ブラウザ検証。確認用イベントだけを作成・削除する。"""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from time import monotonic

from playwright.sync_api import expect, sync_playwright

BASE = "http://localhost:3000"
JST = timezone(timedelta(hours=9))
tomorrow = datetime.now(JST) + timedelta(days=1)
PAGE = f"{BASE}/events/{tomorrow.year}/{tomorrow.month}"


def api(context, path, method="GET", data=None):
    response = context.request.fetch(BASE + path, method=method, data=data, timeout=120000)
    assert response.ok, (path, response.status, response.text()[:500])
    return response.json()


def event(context, event_id):
    return next(item for item in api(context, "/api/events") if item["id"] == event_id)


def wait_event(page, event_id, predicate):
    deadline = monotonic() + 30
    while monotonic() < deadline:
        state = event(page.context, event_id)
        if predicate(state):
            return state
        page.wait_for_timeout(100)
    raise AssertionError(f"更新完了を確認できません: {state}")


def login(browser, role, label):
    context = browser.new_context(viewport={"width": 1280, "height": 1000})
    context.route("**/*", lambda route: route.continue_() if route.request.url.startswith((BASE, "http://127.0.0.1:")) else route.abort())
    page = context.new_page()
    page.on("dialog", lambda dialog: dialog.accept())
    page.goto(PAGE, wait_until="networkidle", timeout=120000)
    page.get_by_role("button", name=label, exact=True).click()
    expect(page.get_by_text(f"確認用{role}でログイン中", exact=True)).to_be_visible(timeout=90000)
    print(f"LOGIN OK: {role}", flush=True)
    return context, page


def record(results, message):
    results.append(message)
    print("PASS:", message, flush=True)


def clean_notifications(context, event_ids):
    for user_id in ["line:local-admin", "line:local-member-a", "line:local-member-b"]:
        path = f"http://127.0.0.1:8080/v1/projects/demo-badminton-local/databases/(default)/documents/users/{user_id}/notifications"
        response = context.request.get(path)
        if not response.ok:
            continue
        for note in response.json().get("documents", []):
            if note.get("fields", {}).get("eventId", {}).get("stringValue") in event_ids:
                deleted = context.request.delete("http://127.0.0.1:8080/v1/" + note["name"])
                assert deleted.ok


def main():
    created = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome", headless=True)
        admin, page = login(browser, "管理者", "管理者で確認")
        member, member_page = login(browser, "会員A", "会員Aで確認")
        assert api(admin, "/api/auth/session")["user"]["id"] == "line:local-admin"
        assert api(member, "/api/auth/session")["user"]["id"] == "line:local-member-a"
        results = []
        try:
            result = api(admin, "/api/admin/events", "POST", {
                "title": "E2E ゲストと会員の受付順確認", "date": tomorrow.strftime("%Y-%m-%d") + "T09:30:00.000Z", "capacity": 1,
            })
            event_id = result["id"]
            created.append(event_id)
            api(admin, f"/api/events/{event_id}/join", "POST")
            page.reload(wait_until="networkidle")
            card = page.locator(f'[id="{event_id}"]')
            card.get_by_role("button", name="+ ゲスト追加", exact=True).click()
            card.get_by_label("ゲストの名前", exact=True).fill("検証ゲストA")
            card.get_by_role("button", name="追加", exact=True).click()
            wait_event(page, event_id, lambda state: len(state.get("guestWaitlist", [])) == 1)
            expect(card.get_by_text("検証ゲストA", exact=True)).to_be_visible()
            first = event(admin, event_id)
            guest_a = first["guestWaitlist"][0]["id"]
            assert len(first["participants"]) + len(first["guests"]) == 1
            api(member, f"/api/events/{event_id}/join", "POST")
            added = api(admin, f"/api/events/{event_id}/guests", "POST", {"name": "検証ゲストB"})
            guest_b = added["guestId"]
            assert added["status"] == "waiting"
            state = event(admin, event_id)
            assert state["waitlist"] == [guest_a, "line:local-member-a", guest_b]
            page.reload(wait_until="networkidle")
            text = card.inner_text()
            assert text.index("検証ゲストA") < text.index("確認用会員A") < text.index("検証ゲストB")
            assert event(admin, event_id)["waitlist"] == state["waitlist"], "一覧表示で待機ゲストを消してはいけない"
            record(results, "満員時に画面からゲストを待機登録し、会員と受付順で混在表示")

            response = member.request.post(BASE + f"/api/events/{event_id}/guests", data={"name": "権限なし"})
            assert response.status == 403
            member_page.reload(wait_until="networkidle")
            assert member_page.get_by_role("button", name="+ ゲスト追加", exact=True).count() == 0
            record(results, "一般会員はゲストを追加・管理できない")

            api(admin, f"/api/events/{event_id}/cancel", "POST")
            state = event(admin, event_id)
            assert [g["id"] for g in state["guests"]] == [guest_a]
            assert state["participants"] == []
            assert state["waitlist"] == ["line:local-member-a", guest_b]
            page.reload(wait_until="networkidle")
            expect(page.get_by_text("キャンセル待ち繰り上げのお知らせ", exact=True)).to_be_visible()
            expect(page.locator(f'a[href$="#{event_id}"]').filter(has_text="ゲスト「検証ゲストA」が参加に繰り上がりました")).to_be_visible()
            record(results, "会員キャンセルで先頭ゲストが参加へ移り、登録管理者のアプリ内通知に表示")

            card.locator("summary").click()
            expect(card.get_by_title("ゲストを削除")).to_be_visible()
            with page.expect_navigation(wait_until="networkidle"):
                card.get_by_title("ゲストを削除").click()
            wait_event(page, event_id, lambda state: "line:local-member-a" in state["participants"])
            state = event(admin, event_id)
            assert state["guests"] == [] and state["waitlist"] == [guest_b], json.dumps(state, ensure_ascii=False)
            record(results, "画面から参加ゲストを削除すると次の会員が繰り上がる")

            card.get_by_role("button", name="定員変更", exact=True).click()
            card.locator('input[type="number"]').fill("2")
            with page.expect_navigation(wait_until="networkidle"):
                card.get_by_role("button", name="保存", exact=True).click()
            wait_event(page, event_id, lambda state: state["capacity"] == 2 and len(state["guests"]) == 1)
            state = event(admin, event_id)
            assert state["guests"][0]["id"] == guest_b and state["waitlist"] == []
            record(results, "画面から定員を増やすと待機ゲストが繰り上がる")

            guest_c = api(admin, f"/api/events/{event_id}/guests", "POST", {"name": "検証取り消しゲスト"})["guestId"]
            page.reload(wait_until="networkidle")
            card.locator("summary").click()
            with page.expect_navigation(wait_until="networkidle"):
                card.get_by_title("ゲストのキャンセル待ちを取り消す").click()
            wait_event(page, event_id, lambda state: len(state["waitlist"]) == 0)
            state = event(admin, event_id)
            assert guest_c not in state["waitlist"] and len(state["participants"]) + len(state["guests"]) == 2
            record(results, "待機ゲストの取り消しで参加人数が変わらない")

            race_id = api(admin, "/api/admin/events", "POST", {
                "title": "E2E 同時登録確認", "date": tomorrow.strftime("%Y-%m-%d") + "T09:30:00.000Z", "capacity": 1,
            })["id"]
            created.append(race_id)
            responses = page.evaluate("""async id => Promise.all([
                fetch(`/api/events/${id}/join`, {method:'POST'}),
                fetch(`/api/events/${id}/guests`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'同時登録ゲスト'})})
            ].map(async response => {const r = await response; return {status:r.status, data:await r.json()};}))""", race_id)
            assert all(response["status"] == 200 for response in responses)
            state = event(admin, race_id)
            assert len(state["participants"]) + len(state["guests"]) == 1 and len(state["waitlist"]) == 1
            record(results, "会員とゲストの同時登録でも定員超過せず、残り1人が待機になる")
        finally:
            for event_id in created:
                api(admin, f"/api/admin/events/{event_id}", "DELETE")
            clean_notifications(admin, created)
        page.goto(PAGE, wait_until="networkidle")
        Path('.local-preview').mkdir(exist_ok=True)
        page.screenshot(path='.local-preview/guest-waitlist.png', full_page=True)
        print(json.dumps({"passed": results, "url": PAGE, "screenshot": ".local-preview/guest-waitlist.png"}, ensure_ascii=False, indent=2))
        browser.close()


if __name__ == "__main__":
    main()
