# -*- coding: utf-8 -*-
"""
Playwright helper that grabs the availability grid for FACILITY_NAME/ROOM_LABEL,
clicks TARGET_DATE when it is marked as ○/△, selects the desired WANTED_SLOTS,
and stops on the “次へ進む”後の画面（最終確定は押さない）。

大きなスクリプトになりすぎていたので、実際に利用している最小限の機能だけを
ピックアップして 1,000 行以内のシンプルな構成に書き直しています。
"""

import os
import re
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from playwright.sync_api import sync_playwright

BASE_URL = "https://www2.pf489.com/toshima/WebR/Home/WgR_ModeSelect"
FACILITY_NAME = "ふるさと千川館"
ROOM_LABEL = "多目的ホール"
WANTED_SLOTS = ["18:30~19:30", "19:30~20:30", "20:30~21:30"]
TARGET_DATE = "2026-01-01"
USER_DATA_DIR = "udata"
LOG_DIR = Path("diag")
DEBUG = True

load_dotenv()
LOGIN_ID = os.getenv("LOGIN_ID")
LOGIN_PASSWORD = os.getenv("LOGIN_PASSWORD")

OK_MARKS = {"○", "△"}


def debug(msg: str):
    if DEBUG:
        print(msg)


def first_of_next_month(anchor: datetime) -> datetime:
    year = anchor.year + (1 if anchor.month == 12 else 0)
    month = 1 if anchor.month == 12 else (anchor.month + 1)
    return datetime(year, month, 1)


def save_diag(page, label: str):
    if not DEBUG:
        return
    try:
        LOG_DIR.mkdir(exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        png = LOG_DIR / f"{label}_{ts}.png"
        html = LOG_DIR / f"{label}_{ts}.html"
        page.screenshot(path=str(png), full_page=True)
        html.write_text(page.content(), encoding="utf-8")
        debug(f"[diag] saved {png}")
    except Exception as exc:
        debug(f"[diag] failed: {exc}")


def route_block(route):
    if route.request.resource_type in {"image", "media", "font"}:
        return route.abort()
    return route.continue_()


def is_error_page(page) -> bool:
    url = page.url or ""
    if "Error/html" in url:
        return True
    try:
        body = page.locator("body").inner_text()
        return "処理を続行できません" in body
    except Exception:
        return False


def is_logged_in(page) -> bool:
    try:
        if page.locator("a:has-text('ログアウト'), .logout a").count():
            return True
        if page.get_by_text("施設別空き状況", exact=False).count():
            return True
        if page.get_by_text("施設の検索", exact=False).count():
            return True
    except Exception:
        pass
    return False


def login(page):
    page.goto(BASE_URL, wait_until="domcontentloaded")
    if is_logged_in(page):
        return
    debug("[login] start")

    for sel in [
        "a:has-text('ログイン')",
        "button:has-text('ログイン')",
        "input[type='submit'][value*='ログイン']",
    ]:
        btn = page.locator(sel)
        if btn.count():
            btn.first.click()
            page.wait_for_load_state("domcontentloaded")
            break

    scope = page.locator("#body .login_info")
    if not scope.count():
        scope = page
    scope.locator("input[type='text'], input[type='tel'], input:not([type])").first.fill(LOGIN_ID or "")
    scope.locator("input[type='password']").first.fill(LOGIN_PASSWORD or "")
    submit = scope.locator("input[type='submit'], button[type='submit']")
    if submit.count():
        submit.first.click()
    else:
        scope.locator("input[type='password']").first.press("Enter")
    try:
        page.wait_for_load_state("domcontentloaded", timeout=6000)
    except Exception:
        pass
    if not is_logged_in(page):
        save_diag(page, "login_fail")
        raise RuntimeError("ログインに失敗しました")
    debug("[login] ok")


def click_next(page, timeout_ms: int = 6000) -> bool:
    deny = re.compile(r"(戻る|メニュー|ログアウト)")
    selectors = [
        lambda: page.get_by_role("button", name=re.compile(r"(次へ進む|次へ|進む)")),
        lambda: page.locator("button:has-text('次へ進む')"),
        lambda: page.locator("button:has-text('次へ')"),
        lambda: page.locator("input[type='submit'][value*='次']"),
        lambda: page.get_by_role("link", name=re.compile(r"(次へ進む|次へ)")),
        lambda: page.locator("[id*='Next'], [name*='Next']"),
        lambda: page.locator("a.btnBlue:has-text('次へ進む')"),
    ]
    try:
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(80)
    except Exception:
        pass
    for finder in selectors:
        try:
            loc = finder()
            count = loc.count() if hasattr(loc, "count") else 0
            for i in range(count):
                el = loc.nth(i)
                text = ((el.inner_text() or "") + " " + (el.get_attribute("value") or "")).strip()
                if deny.search(text):
                    continue
                try:
                    el.scroll_into_view_if_needed(timeout=800)
                except Exception:
                    pass
                el.click(timeout=timeout_ms)
                page.wait_for_load_state("domcontentloaded")
                if is_error_page(page):
                    return False
                return True
        except Exception:
            continue
    return False


def select_facility_and_next(page):
    if is_facility_grid(page):
        return True

    def _try_shisetsutbl_and_next():
        tbl = page.locator("#shisetsutbl")
        if not tbl.count():
            return False
        labels = tbl.locator("td.shisetsu.toggle label").filter(has_text=FACILITY_NAME)
        if not labels.count():
            page.wait_for_timeout(200)
            labels = tbl.locator("td.shisetsu.toggle label").filter(has_text=FACILITY_NAME)
        if not labels.count():
            return False
        lab = labels.first
        for_id = lab.get_attribute("for")
        if for_id:
            inp = page.locator(f"#{for_id}")
            try:
                if not (inp.count() and inp.first.is_checked()):
                    lab.click()
            except Exception:
                lab.click()
        else:
            lab.click()
        page.wait_for_timeout(150)
        if click_next(page):
            return True
        alt = page.locator("button:has-text('次へ進む'), input[type='submit'][value*='次'], a:has-text('次へ')")
        if alt.count():
            alt.first.click(timeout=3000)
            page.wait_for_load_state("domcontentloaded")
            return True
        return False

    def _open_facility_finder():
        for finder in [
            lambda: page.get_by_role("button", name=lambda n: n and "施設" in n).first,
            lambda: page.get_by_text("施設から探す", exact=False).first,
            lambda: page.get_by_role("link", name=lambda n: n and "施設" in n).first,
        ]:
            try:
                el = finder()
                if el and getattr(el, "count", lambda: 1)():
                    el.click(timeout=3000)
                    page.wait_for_load_state("domcontentloaded")
                    return True
            except Exception:
                pass
        return False

    def _try_category_button():
        try:
            page.wait_for_selector("#tabs, .tabs-panel", state="visible", timeout=3000)
        except Exception:
            return False
        cands = [
            f"#tabs div.category.tabs-panel.selected input[type='button'][value='{FACILITY_NAME}']",
            f"input[type='button'][value='{FACILITY_NAME}']",
            f"input[id^='category_'][type='button'][value='{FACILITY_NAME}']",
        ]
        for sel in cands:
            loc = page.locator(sel)
            if loc.count():
                try:
                    loc.first.scroll_into_view_if_needed(timeout=400)
                except Exception:
                    pass
                loc.first.click(timeout=3000)
                page.wait_for_load_state("domcontentloaded")
                return True
        btn = page.get_by_role("button", name=FACILITY_NAME)
        if btn.count():
            btn.first.click(timeout=3000)
            page.wait_for_load_state("domcontentloaded")
            return True
        return False

    def _try_search_form():
        box = page.locator("label:has-text('施設名')")
        if not box.count():
            return False
        try:
            inp = box.first.locator("xpath=following::input[1]")
            btn = page.get_by_role("button", name=lambda n: n and "検索" in n).first
            inp.fill(FACILITY_NAME, timeout=1500)
            btn.click(timeout=2500)
            page.wait_for_load_state("domcontentloaded")
        except Exception:
            return False
        for finder in [
            lambda: page.get_by_role("link", name=lambda n: n and FACILITY_NAME in n).first,
            lambda: page.get_by_text(FACILITY_NAME, exact=False).first,
        ]:
            try:
                el = finder()
                if el and getattr(el, "count", lambda: 1)():
                    el.click(timeout=3000)
                    page.wait_for_load_state("domcontentloaded")
                    return True
            except Exception:
                pass
        return False

    # facility list is already visible → just pick & next
    if _try_shisetsutbl_and_next():
        return True

    for _ in range(3):
        _open_facility_finder()
        if _try_category_button() and _try_shisetsutbl_and_next():
            return True
        _open_facility_finder()
        if _try_search_form():
            if _try_shisetsutbl_and_next():
                return True
            return False
        if _try_shisetsutbl_and_next():
            return True

    save_diag(page, "facility_button_not_found")
    return False


def is_facility_grid(page) -> bool:
    try:
        if page.locator("input[name='checkdate']").count() > 0 and not page.locator(
            "input[name='checktime']"
        ).count():
            return True
        if page.get_by_text("施設別空き状況", exact=False).count() and page.locator(
            "table.calendar.horizon.toggle"
        ).count():
            return True
    except Exception:
        pass
    return False


def is_timeslot_grid(page) -> bool:
    try:
        return page.locator("input[name='checktime']").count() > 0
    except Exception:
        return False


def where_am_i(page) -> str:
    if is_timeslot_grid(page):
        return "time"
    if is_facility_grid(page):
        return "facility"
    try:
        if page.get_by_text("施設別空き状況", exact=False).count():
            return "menu"
    except Exception:
        pass
    return "unknown"


def recover_and_to_month(page):
    state = where_am_i(page)
    if state == "facility":
        return True
    try:
        page.goto(BASE_URL, wait_until="domcontentloaded")
    except Exception:
        pass
    try:
        if page.locator("input[type='password']").count():
            login(page)
    except Exception:
        pass
    if not select_facility_and_next(page):
        raise RuntimeError("施設別画面に遷移できませんでした")
    return True


def _find_month_table(page):
    tables = page.locator("table.calendar.horizon.toggle, table.calendar")
    return tables.first if tables.count() else None


def _current_year_month_from_table(table):
    txt = (table.text_content() or "").strip()
    m = re.search(r"(\d{4})年\s*(\d{1,2})月", txt)
    if m:
        return int(m.group(1)), int(m.group(2))
    return None, None


def _facility_header_year_month(page):
    table = _find_month_table(page)
    if not table:
        return None, None
    return _current_year_month_from_table(table)


def _facility_click_next_month(page):
    for action in [
        lambda: page.evaluate("window.__doPostBack && window.__doPostBack('period','next')"),
        lambda: page.locator("table .pagination .next a, button:has-text('＞'), a:has-text('＞')").first.click(),
    ]:
        try:
            action()
            page.wait_for_load_state("domcontentloaded")
            page.wait_for_timeout(150)
            return True
        except Exception:
            continue
    return False


def _facility_click_prev_month(page):
    for action in [
        lambda: page.evaluate("window.__doPostBack && window.__doPostBack('period','prev')"),
        lambda: page.locator("table .pagination .prev a, button:has-text('＜'), a:has-text('＜')").first.click(),
    ]:
        try:
            action()
            page.wait_for_load_state("domcontentloaded")
            page.wait_for_timeout(150)
            return True
        except Exception:
            continue
    return False


def ensure_facility_month_visible(page, target: datetime, max_hops: int = 6):
    want = (target.year, target.month)
    have = _facility_header_year_month(page)
    hops = 0
    while have != want and hops < max_hops and all(have):
        if have < want:
            moved = _facility_click_next_month(page)
        else:
            moved = _facility_click_prev_month(page)
        hops += 1
        have = _facility_header_year_month(page)
        if not moved:
            break
    debug(f"[month] target={want} now={have} hops={hops}")
    return have == want


def set_one_month_from(page, anchor_date: datetime):
    start = first_of_next_month(anchor_date)
    y, m, d = start.year, start.month, start.day
    val = f"{y}/{m}/{d}"

    date_input = page.locator("#dpStartDate, input[name='textDate']")
    if date_input.count():
        inp = date_input.first
        try:
            inp.click(timeout=1200)
        except Exception:
            pass
        try:
            page.wait_for_selector("#ui-datepicker-div", state="visible", timeout=1500)
        except Exception:
            pass
        cal = page.locator("#ui-datepicker-div")
        if cal.count():
            try:
                nxt = cal.locator("a.ui-datepicker-next")
                if nxt.count():
                    nxt.first.click(timeout=1200)
                    page.wait_for_timeout(80)
            except Exception:
                pass
            try:
                day_link = cal.locator(f"table tbody tr td a:has-text('{d}')")
                if day_link.count():
                    day_link.first.click(timeout=1200)
                else:
                    fallback = page.locator("#ui-datepicker-div > table > tbody > tr:nth-child(1) > td:nth-child(2) > a")
                    if fallback.count():
                        fallback.first.click(timeout=1200)
            except Exception:
                pass
        else:
            try:
                inp.fill(val)
            except Exception:
                try:
                    inp.press("Control+A")
                except Exception:
                    pass
                inp.type(val, delay=20)
            try:
                inp.press("Enter")
            except Exception:
                pass
        try:
            page.wait_for_timeout(100)
        except Exception:
            pass

    label = page.locator("#lblPeriod1month")
    if label.count():
        try:
            label.first.click(timeout=1000)
        except Exception:
            pass

    radio = page.locator("#radioPeriod1month")
    if radio.count():
        try:
            radio.first.check(timeout=1000)
        except Exception:
            pass

    page.evaluate(
        """({val})=>{
            const fire=(el,t)=>{ if(!el) return; try{ el.dispatchEvent(new Event(t,{bubbles:true})); }catch(e){} };
            const dp=document.querySelector('#dpStartDate')||document.querySelector('input[name="textDate"]');
            if (dp){ dp.value = val; fire(dp,'input'); fire(dp,'change'); dp.blur && dp.blur(); }
            const radio=document.querySelector('#radioPeriod1month')||
                         document.querySelector('input[type="radio"][value="1month"]')||
                         document.querySelector('input[type="radio"][name*="Period"][value="1"]');
            if (radio){ radio.checked = true; fire(radio,'input'); fire(radio,'change'); }
        }""",
        {"val": val},
    )

    for sel in [
        "#btnHyoji",
        "button:has-text('表示')",
        "input[type='submit'][value*='表示']",
        "button:has-text('日程変更')",
        "input[type='submit'][value*='日程変更']",
    ]:
        btn = page.locator(sel)
        if not btn.count():
            continue
        try:
            with page.expect_navigation(wait_until="domcontentloaded", timeout=4000):
                btn.first.click()
        except Exception:
            btn.first.click()
            page.wait_for_load_state("domcontentloaded")
        break

    try:
        page.wait_for_load_state("domcontentloaded", timeout=2000)
    except Exception:
        pass


def read_mark_from_label(label):
    if not label.count():
        return ""
    txt = (label.first.inner_text() or "").strip()
    if txt in OK_MARKS:
        return txt
    for attr in ("title", "aria-label"):
        val = (label.first.get_attribute(attr) or "").strip()
        if val in OK_MARKS:
            return val
    img = label.first.locator("img")
    if img.count():
        alt = (img.first.get_attribute("alt") or "").strip()
        if alt in OK_MARKS:
            return alt
    return ""


def _month_col_index(table, target_day: int):
    headers = table.locator("thead th.day")
    for idx in range(headers.count()):
        day = headers.nth(idx).locator("span").first
        txt = (day.text_content() or "").strip()
        if txt.isdigit() and int(txt) == target_day:
            return idx + 2  # skip facility/定員列
    return None


def month_click_if_ok(page, d: datetime) -> bool:
    table = _find_month_table(page)
    if not table:
        debug("[month] table not found")
        return False

    rows = table.locator("tbody tr")
    target_row = None
    for i in range(rows.count()):
        head = rows.nth(i).locator("th, td").first
        txt = (head.text_content() or "").strip()
        if ROOM_LABEL in txt or "多目的" in txt:
            target_row = rows.nth(i)
            break
    if not target_row:
        debug("[month] room row missing")
        return False

    col = _month_col_index(table, d.day)
    if col is None:
        debug(f"[month] no column for day {d.day}")
        return False

    cells = target_row.locator("td, th")
    if col >= cells.count():
        return False
    cell = cells.nth(col)
    label = cell.locator("label")
    mark = read_mark_from_label(label)
    debug(f"[month] {d.strftime('%Y-%m-%d')} mark={mark}")
    if mark not in OK_MARKS:
        return False
    try:
        label.first.click()
        page.wait_for_timeout(200)
        return not is_error_page(page)
    except Exception:
        return False


def go_to_timeslot_grid(page):
    if is_timeslot_grid(page):
        return True
    for sel in [
        "button:has-text('次へ進む')",
        "a.btnBlue:has-text('次へ進む')",
        "a:has-text('次へ')",
        "input[type='submit'][value*='次']",
    ]:
        btn = page.locator(sel)
        if btn.count():
            try:
                with page.expect_navigation(wait_until="domcontentloaded", timeout=6000):
                    btn.first.click()
            except Exception:
                btn.first.click()
            try:
                page.wait_for_selector("input[name='checktime']", timeout=5000)
                return True
            except Exception:
                pass
    try:
        page.evaluate("window.__doPostBack && window.__doPostBack('next','')")
        page.wait_for_selector("input[name='checktime']", timeout=5000)
        return True
    except Exception:
        return False


def find_table_and_row_for_room(page, room_label: str):
    tables = page.locator("table.calendar.horizon.toggle")
    for i in range(tables.count()):
        table = tables.nth(i)
        rows = table.locator("tbody tr")
        for j in range(rows.count()):
            head = rows.nth(j).locator("td.shisetsu, th.shisetsu")
            if head.count() and room_label in (head.first.text_content() or ""):
                return table, rows.nth(j)
    return None, None


def norm_wave(text: str) -> str:
    if not text:
        return ""
    return (
        text.replace("〜", "~")
        .replace("～", "~")
        .replace("－", "-")
        .replace("–", "-")
        .replace("—", "-")
        .replace("：", ":")
        .strip()
    )


def unique_norm(labels):
    seen = set()
    out = []
    for lbl in labels:
        key = norm_wave(lbl)
        if key and key not in seen:
            seen.add(key)
            out.append(lbl)
    return out


def _extract_range_from_header(text: str):
    m = re.search(r"(\d{1,2})[:：]?(\d{0,2})\s*[~-]\s*(\d{1,2})", text)
    if not m:
        return None
    start = int(m.group(1))
    end = int(m.group(3))
    has_half = ":30" in text or "：30" in text
    offset = ":30" if has_half else ":00"
    return f"{start:02d}{offset}", f"{end:02d}{offset}"


def _collect_wanted_cols_for_row(table, row, wanted_slots):
    wanted = {norm_wave(s) for s in unique_norm(wanted_slots)}
    cols = []
    headers = table.locator("thead th")
    for i in range(headers.count()):
        header_text = headers.nth(i).text_content() or ""
        rng = _extract_range_from_header(header_text.replace(" ", ""))
        if not rng:
            continue
        slot = f"{rng[0][:2]}:{rng[0][2:]}~{rng[1][:2]}:{rng[1][2:]}"
        if norm_wave(slot) in wanted or norm_wave(header_text) in wanted:
            cols.append(i)
    return cols


def _force_checktime_in_cell(page, cell):
    try:
        box = cell.locator("input[name='checktime']").first
        box.check(timeout=500)
        return True
    except Exception:
        try:
            cell.click(force=True, timeout=800)
            return cell.locator("input[name='checktime']").first.is_checked()
        except Exception:
            return False


def pick_wanted_slots_for_current_day(page, wanted_slots=None):
    if wanted_slots is None:
        wanted_slots = WANTED_SLOTS
    if not is_timeslot_grid(page):
        return False
    table, row = find_table_and_row_for_room(page, ROOM_LABEL)
    if not table or not row:
        debug("[time] row not found")
        return False
    cols = _collect_wanted_cols_for_row(table, row, wanted_slots)
    if not cols:
        debug("[time] wanted cols not found")
        return False
    cells = row.locator("td")
    picked = 0
    for idx in cols:
        if idx >= cells.count():
            continue
        cell = cells.nth(idx)
        txt = (cell.text_content() or "")
        if not any(mark in txt for mark in OK_MARKS):
            continue
        if _force_checktime_in_cell(page, cell):
            picked += 1
            page.wait_for_timeout(80)
    debug(f"[time] picked {picked}/{len(cols)}")
    return picked == len(cols)


def next_after_timeslots(page):
    if page.locator("input[name='checktime']:checked").count() == 0:
        return False
    for sel in [
        "button:has-text('次へ進む')",
        "a.btnBlue:has-text('次へ進む')",
        "a:has-text('次へ')",
        "input[type='submit'][value*='次']",
    ]:
        btn = page.locator(sel)
        if btn.count():
            try:
                with page.expect_navigation(wait_until="domcontentloaded", timeout=6000):
                    btn.first.click()
            except Exception:
                btn.first.click()
            return True
    try:
        page.evaluate("window.__doPostBack && window.__doPostBack('next','')")
        return True
    except Exception:
        return False


def _parse_date_any(text: str) -> datetime:
    m = re.match(r"\s*(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s*", text)
    if not m:
        raise ValueError(f"invalid date: {text}")
    y, mth, d = map(int, m.groups())
    return datetime(y, mth, d)


def scan_once(page) -> bool:
    target = _parse_date_any(TARGET_DATE)
    recover_and_to_month(page)
    set_one_month_from(page, target)
    ensure_facility_month_visible(page, target)
    if not month_click_if_ok(page, target):
        debug("[scan] target day is not available")
        return False
    if not go_to_timeslot_grid(page):
        debug("[scan] failed to open timeslot grid")
        return False
    if not pick_wanted_slots_for_current_day(page):
        debug("[scan] failed to pick slots")
        return False
    if not next_after_timeslots(page):
        debug("[scan] failed to press next")
        return False
    debug("[scan] completed (submission is manual)")
    return True


def main():
    if not (LOGIN_ID and LOGIN_PASSWORD):
        raise SystemExit(".env に LOGIN_ID / LOGIN_PASSWORD を設定してください。")

    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=USER_DATA_DIR,
            headless=False,
            locale="ja-JP",
            timezone_id="Asia/Tokyo",
        )
        page = ctx.new_page()
        page.route("**/*", route_block)
        login(page)
        if not select_facility_and_next(page):
            raise SystemExit("施設選択に失敗しました")
        ok = scan_once(page)
        print(f"scan result: {ok}")
        input("終了するには Enter：")
        ctx.close()


if __name__ == "__main__":
    main()
