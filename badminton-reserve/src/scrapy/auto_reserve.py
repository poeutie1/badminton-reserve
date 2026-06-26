# -*- coding: utf-8 -*-
"""
ふるさと千川館 自動予約スクリプト

毎月1日に翌月分を最大5日予約する。
曜日優先順位: 月→火→水→木（金曜以外の平日）
週を分散して予約（第1週→第2週→…）。
AUTO_SUBMIT=False の場合は確定ボタンを押す前で停止する。

Usage:
    python auto_reserve.py                    # 来月分を最大5日予約
    python auto_reserve.py --test             # テストモード（4月分、ふるさと千川の部屋）
"""

import argparse
import os
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

import holidays
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright

JP_HOLIDAYS = holidays.Japan()

# ====== 設定 ======
BASE_URL = "https://www2.pf489.com/toshima/WebR/Home/WgR_ModeSelect"
FACILITY_NAME = "ふるさと千川館"
ROOM_LABEL = "多目的ホール"
WANTED_SLOTS = ["18:30~19:30", "19:30~20:30", "20:30~21:30"]
MAX_DAYS = 5
# 曜日優先順位: 月(0)→火(1)→水(2)→木(3)
WEEKDAY_PRIORITY = [0, 1, 2, 3]
DRY_RUN = False
USER_DATA_DIR = Path(__file__).parent / "udata"
LOG_DIR = Path(__file__).parent / "diag"
# 診断レベル: 0=なし, 1=エラー時のみ, 2=全ステップ
DIAG_LEVEL = 1

# ====== .env ======
load_dotenv(Path(__file__).parent / ".env")
LOGIN_ID = os.getenv("LOGIN_ID", "")
LOGIN_PASSWORD = os.getenv("LOGIN_PASSWORD", "")
NINZU = os.getenv("NINZU", "20")
MOKUTEKI = os.getenv("MOKUTEKI", "バドミントン")

OK_MARKS = {"○", "△"}
MONTH_RE = re.compile(r"(\d{4})年\s*(\d{1,2})月")
WEEKDAY_JA = ["月", "火", "水", "木", "金", "土", "日"]


# ====== ユーティリティ ======
def debug(msg: str):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")


def save_diag(page, label: str, level: int = 2):
    """診断情報を保存。level <= DIAG_LEVEL の場合のみ実行。"""
    if level > DIAG_LEVEL:
        return
    try:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        page.screenshot(path=str(LOG_DIR / f"{label}_{ts}.png"), full_page=True)
        if DIAG_LEVEL >= 2:
            (LOG_DIR / f"{label}_{ts}.html").write_text(page.content(), encoding="utf-8")
        debug(f"[diag] saved {label}_{ts}")
    except Exception as exc:
        debug(f"[diag] failed: {exc}")


def norm_wave(s: str) -> str:
    if not s:
        return ""
    return (
        s.replace("〜", "~")
        .replace("～", "~")
        .replace("–", "~")
        .replace("－", "~")
        .replace("：", ":")
        .strip()
    )


def first_of_next_month(anchor: datetime) -> datetime:
    year = anchor.year + (1 if anchor.month == 12 else 0)
    month = 1 if anchor.month == 12 else (anchor.month + 1)
    return datetime(year, month, 1)


def get_weekdays_in_month(year: int, month: int, weekday: int) -> list[datetime]:
    """指定月の指定曜日(0=月,...6=日)を全て返す"""
    days = []
    d = datetime(year, month, 1)
    while d.month == month:
        if d.weekday() == weekday:
            days.append(d)
        d += timedelta(days=1)
    return days


def get_week_number(d: datetime) -> int:
    """月内の週番号を返す (1始まり)。日付の日を7で割って算出。"""
    return (d.day - 1) // 7 + 1


def build_candidate_days(year: int, month: int, booked_weeks: set[int]) -> list[datetime]:
    """
    曜日優先順位(月→火→水→木)×週分散で候補日リストを生成。
    週の優先順位: 第3週→第4週→第5週→第2週→第1週（後半週が競合少ない傾向）。
    祝日は除外。既に予約済みの週はスキップ。
    """
    week_priority = [3, 4, 5, 2, 1]
    candidates = []
    for weekday in WEEKDAY_PRIORITY:
        days = get_weekdays_in_month(year, month, weekday)
        # 祝日を除外
        days = [d for d in days if d.date() not in JP_HOLIDAYS]
        days_by_week = {get_week_number(d): d for d in days}
        for wn in week_priority:
            if wn in booked_weeks or wn not in days_by_week:
                continue
            candidates.append(days_by_week[wn])
    return candidates


# ====== Step 1: ログイン ======
def login(page):
    debug("[login] ModeSelect へ移動")
    page.goto(BASE_URL, wait_until="domcontentloaded")

    # 既にログイン済みかチェック
    if page.locator("a:has-text('ログアウト')").count():
        debug("[login] 既にログイン済み")
        return

    # __doPostBack('login','') でログインページへ遷移
    debug("[login] ログインページへ遷移")
    page.evaluate("__doPostBack('login','')")
    page.wait_for_load_state("domcontentloaded")
    page.wait_for_selector("#userID", timeout=5000)
    save_diag(page, "step1_login_page")

    # ID/PW 入力（実サイトのセレクター）
    page.locator("#userID").fill(LOGIN_ID)
    page.locator("#passWord").fill(LOGIN_PASSWORD)
    debug("[login] ID/PW 入力完了")

    # ログインボタンクリック
    page.locator("a.btnBlue:has-text('ログイン')").click()
    page.wait_for_load_state("domcontentloaded")
    page.wait_for_selector("a:has-text('ログアウト')", timeout=10000)

    debug("[login] ログイン成功")
    save_diag(page, "step2_logged_in")


def is_logged_in(page) -> bool:
    """現在のページでログイン状態を確認"""
    try:
        return page.locator("a:has-text('ログアウト')").count() > 0
    except Exception:
        return False


# ====== Step 2: 施設選択（ふるさと千川館 → 多目的ホール） ======
def select_facility(page):
    # ModeSelect に戻る（ログイン後のページから）
    if not page.locator("#category_18").count():
        page.goto(BASE_URL, wait_until="domcontentloaded")

    # カテゴリ「ふるさと千川館」(#category_18) をクリック
    debug("[facility] ふるさと千川館 を選択")
    cat_btn = page.locator("#category_18")
    if not cat_btn.count():
        save_diag(page, "category_not_found", level=1)
        raise RuntimeError("カテゴリ『ふるさと千川館』が見つかりません")
    cat_btn.click()
    page.wait_for_load_state("domcontentloaded")
    page.wait_for_selector("#shisetsutbl", timeout=5000)
    save_diag(page, "step3_facility_list")

    # 施設一覧 (#shisetsutbl) が表示された場合
    tbl = page.locator("#shisetsutbl")
    if tbl.count():
        # まず ROOM_LABEL で部屋を検索（部屋一覧が表示されている場合）
        labels = tbl.locator("td.shisetsu.toggle label").filter(has_text=ROOM_LABEL)
        if labels.count():
            labels.first.click()
            debug(f"[facility] {ROOM_LABEL} チェック済み")
        else:
            # 部屋一覧がない場合（施設名のみ表示）→ 施設「ふるさと千川館」を選択
            facility_labels = tbl.locator("td.shisetsu label").filter(has_text=FACILITY_NAME)
            if facility_labels.count():
                cb = facility_labels.first
                cb.click()
                debug(f"[facility] {FACILITY_NAME} チェック済み（部屋選択は後続画面）")
            else:
                # チェックボックスが既に選択済みの可能性もある
                debug("[facility] 施設は既に選択済みの可能性あり、次へ進む")

        # 「次へ進む」ボタンをクリック
        click_next_button(page)
        save_diag(page, "step4_calendar")
    else:
        # 直接カレンダーに遷移した場合
        debug("[facility] 直接カレンダー画面に遷移")


def click_next_button(page):
    """共通: 「次へ進む」系のボタンをクリック"""
    for sel in [
        "a.btnBlue:has-text('次へ進む')",
        "button:has-text('次へ進む')",
        "input[type='submit'][value*='次']",
        "a:has-text('次へ')",
    ]:
        btn = page.locator(sel)
        if btn.count():
            btn.first.click()
            page.wait_for_load_state("domcontentloaded")
            return True
    debug("[next] 次へボタンが見つかりません")
    return False


# ====== Step 3: カレンダー操作 ======
def set_display_period_one_month(page, start_date: datetime):
    """表示期間を「1ヶ月」に設定して表示ボタンを押す"""
    y, m, d = start_date.year, start_date.month, start_date.day
    val = f"{y}/{m}/{d}"

    page.evaluate(
        """({val}) => {
            const fire = (el, t) => {
                if (!el) return;
                el.dispatchEvent(new Event(t, {bubbles: true}));
            };
            const dp = document.querySelector('#dpStartDate') ||
                       document.querySelector('input[name="textDate"]');
            if (dp) {
                dp.value = val;
                fire(dp, 'input');
                fire(dp, 'change');
            }
            const radio = document.querySelector('#radioPeriod1month') ||
                          document.querySelector('input[type="radio"][value="1month"]') ||
                          document.querySelector('input[type="radio"][name*="Period"][value="1"]');
            if (radio) {
                radio.checked = true;
                fire(radio, 'input');
                fire(radio, 'change');
            }
        }""",
        {"val": val},
    )

    # 「表示」ボタンクリック
    for sel in [
        "#btnHyoji",
        "button:has-text('表示')",
        "input[type='submit'][value*='表示']",
    ]:
        btn = page.locator(sel)
        if btn.count():
            btn.first.click()
            page.wait_for_load_state("domcontentloaded")
            page.wait_for_selector("table.calendar.horizon.toggle", timeout=5000)
            debug(f"[calendar] 表示期間を1ヶ月に設定: {val}")
            return
    debug("[calendar] 表示ボタンが見つかりません")


def get_calendar_header_year_month(page) -> tuple:
    """カレンダーテーブルのヘッダーから年月を取得"""
    try:
        table = page.locator("table.calendar.horizon.toggle")
        if table.count():
            txt = table.first.text_content() or ""
            m = MONTH_RE.search(txt)
            if m:
                return int(m.group(1)), int(m.group(2))
    except Exception:
        pass
    return None, None


def navigate_to_month(page, target: datetime, max_hops: int = 6):
    """カレンダーを目標の月まで移動"""
    want = (target.year, target.month)
    have = get_calendar_header_year_month(page)
    hops = 0
    while have != want and hops < max_hops and all(have):
        if have < want:
            page.evaluate("__doPostBack('period','next')")
        else:
            page.evaluate("__doPostBack('period','prev')")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_selector("table.calendar.horizon.toggle", timeout=5000)
        have = get_calendar_header_year_month(page)
        hops += 1
    debug(f"[calendar] target={want} now={have} hops={hops}")
    return have == want


def read_all_availability(page, room_label: str) -> dict[str, str]:
    """カレンダーから全日程の空きマークをJS一括読み取りで取得。
    戻り値: {YYYYMMDD: マーク(○/△/×等)}
    """
    return page.evaluate("""(roomLabel) => {
        const result = {};
        document.querySelectorAll('input[name="checkdate"]').forEach(inp => {
            const val = inp.value || '';
            const ymd = val.substring(0, 8);
            const id = inp.id;
            const label = document.querySelector('label[for="' + id + '"]');
            if (!label) return;
            const row = inp.closest('tr');
            if (!row) return;
            const roomCell = row.querySelector('td.shisetsu, th.shisetsu');
            const room = roomCell ? roomCell.textContent.trim() : '';
            if (!room.includes(roomLabel) && !room.includes('多目的')) return;
            const mark = (label.innerText || '').trim();
            if (mark) result[ymd] = mark;
        });
        return result;
    }""", room_label)


def scan_available_days(availability: dict[str, str], candidates: list[datetime]) -> list[datetime]:
    """事前スキャン結果から空きありの候補日のみ返す"""
    available = []
    for d in candidates:
        ymd = d.strftime("%Y%m%d")
        mark = availability.get(ymd, "")
        if mark in OK_MARKS:
            available.append(d)
            debug(f"[scan] {d.strftime('%Y-%m-%d')}({WEEKDAY_JA[d.weekday()]}) mark={mark} → 空きあり")
        elif mark:
            debug(f"[scan] {d.strftime('%Y-%m-%d')}({WEEKDAY_JA[d.weekday()]}) mark={mark} → スキップ")
    return available


def click_date_on_calendar(page, d: datetime) -> bool:
    """カレンダーの指定日をクリック"""
    ymd = d.strftime("%Y%m%d")
    inputs = page.locator(f'input[name="checkdate"][value^="{ymd}"]')
    for i in range(inputs.count()):
        el = inputs.nth(i)
        try:
            row = el.locator("xpath=ancestor::tr[1]")
            row_txt = (row.first.text_content() or "") if row.count() else ""
        except Exception:
            row_txt = ""
        if ROOM_LABEL not in row_txt and "多目的" not in row_txt:
            continue
        cid = el.get_attribute("id") or ""
        lab = page.locator(f'label[for="{cid}"]')
        if not lab.count():
            continue
        mark = _read_mark(lab.first)
        if mark in OK_MARKS:
            lab.first.click()
            debug(f"[calendar] {d.strftime('%Y-%m-%d')} をクリック (mark={mark})")
            return True
    debug(f"[calendar] {d.strftime('%Y-%m-%d')} は空きなし")
    return False


def _read_mark(lab) -> str:
    """ラベル要素から空きマーク(○/△/×等)を読み取る"""
    try:
        t = (lab.inner_text() or "").strip()
        if t in {"○", "△", "×", "―"}:
            return t
    except Exception:
        pass
    for attr in ("title", "aria-label"):
        try:
            v = (lab.get_attribute(attr) or "").strip()
            if v in {"○", "△", "×", "―"}:
                return v
        except Exception:
            pass
    try:
        img = lab.locator("img")
        if img.count():
            alt = (img.first.get_attribute("alt") or "").strip()
            if alt in {"○", "△", "×", "―"}:
                return alt
    except Exception:
        pass
    return ""


# ====== Step 4: 時間帯選択 ======
def go_to_timeslot_grid(page) -> bool:
    """カレンダー画面から時間帯別画面へ遷移"""
    if click_next_button(page):
        try:
            page.wait_for_selector("input[name='checktime']", timeout=5000)
            debug("[timeslot] 時間帯別画面へ遷移成功")
            save_diag(page, "step5_timeslot")
            return True
        except Exception:
            pass

    # フォールバック: __doPostBack
    try:
        page.evaluate("__doPostBack('next','')")
        page.wait_for_selector("input[name='checktime']", timeout=5000)
        debug("[timeslot] 時間帯別画面へ遷移成功 (postback)")
        return True
    except Exception:
        save_diag(page, "timeslot_fail", level=1)
        debug("[timeslot] 時間帯別画面への遷移失敗")
        return False


def pick_time_slots(page) -> bool:
    """18:30~19:30, 19:30~20:30, 20:30~21:30 の3枠を選択"""
    table, row = _find_room_row(page)
    if not table or not row:
        debug("[timeslot] 多目的ホール行が見つかりません")
        return False

    wanted_norm = {norm_wave(s) for s in WANTED_SLOTS}
    cols = _find_wanted_columns(table, wanted_norm)
    if len(cols) < len(WANTED_SLOTS):
        debug(f"[timeslot] 対象列が不足: found={len(cols)} want={len(WANTED_SLOTS)}")
        return False

    cells = row.locator("td")
    picked = 0
    for ci in cols:
        if ci >= cells.count():
            continue
        cell = cells.nth(ci)
        mark_txt = cell.text_content() or ""
        if not any(m in mark_txt for m in OK_MARKS):
            debug(f"[timeslot] col={ci} は空きなし")
            return False
        if _check_time_cell(cell):
            picked += 1

    debug(f"[timeslot] picked={picked}/{len(WANTED_SLOTS)}")
    return picked == len(WANTED_SLOTS)


def _find_room_row(page):
    """時間帯テーブルから多目的ホール行を見つける"""
    tables = page.locator("table.calendar.horizon.toggle")
    for i in range(tables.count()):
        t = tables.nth(i)
        rows = t.locator("tbody tr")
        for r in range(rows.count()):
            row = rows.nth(r)
            head = row.locator("td.shisetsu, th.shisetsu")
            if head.count():
                txt = (head.first.text_content() or "").strip()
                if ROOM_LABEL in txt:
                    return t, row
    return None, None


def _find_wanted_columns(table, wanted_norm: set) -> list[int]:
    """テーブルヘッダーからWANTED_SLOTSに対応する列インデックスを返す"""
    ths = table.locator("thead th")
    cols = []
    for i in range(ths.count()):
        raw = ths.nth(i).text_content() or ""
        header_text = norm_wave(raw)
        m = re.search(r"(\d{1,2})\s*[:：]\s*(\d{2})\s*[~～〜\-－–]\s*(\d{1,2})\s*[:：]\s*(\d{2})", header_text)
        if not m:
            continue
        h1, m1, h2, m2 = int(m.group(1)), m.group(2), int(m.group(3)), m.group(4)
        slot = f"{h1:02d}:{m1}~{h2:02d}:{m2}"
        if norm_wave(slot) in wanted_norm or header_text in wanted_norm:
            cols.append(i)
            debug(f"[timeslot] col={i} matched: {slot}")
    return cols


def _check_time_cell(cell) -> bool:
    """時間枠セルのチェックボックスをオンにする"""
    try:
        inp = cell.locator("input[name='checktime']")
        if inp.count():
            inp.first.check(timeout=800)
            return True
    except Exception:
        pass
    try:
        lab = cell.locator("label")
        if lab.count():
            lab.first.click(timeout=800)
            return True
    except Exception:
        pass
    try:
        inp = cell.locator("input[name='checktime']")
        if inp.count():
            inp.first.evaluate(
                "(el) => { el.checked = true; el.dispatchEvent(new Event('change', {bubbles: true})); }"
            )
            return True
    except Exception:
        pass
    return False


# ====== Step 5: 申請フォーム入力 ======
def fill_application_form(page) -> bool:
    """申請フォームに必要事項を入力。
    jQuery/JSで直接値をセットすることでオーバーレイ等の影響を回避する。
    """
    page.wait_for_selector("input[name='spinnerNinzu']", timeout=5000)

    # まずオーバーレイを閉じる（セッションタイムアウト警告等）
    page.evaluate("""() => {
        document.querySelectorAll('.remodal-overlay').forEach(el => {
            el.style.display = 'none';
        });
        document.querySelectorAll('.remodal').forEach(el => {
            el.style.display = 'none';
        });
    }""")

    # 全フィールドをJavaScriptで一括設定
    result = page.evaluate("""({ninzu, mokuteki, name, count, note}) => {
        const errors = [];

        // 利用人数 (jQuery UI spinner)
        try {
            const sp = document.querySelector("input[name='spinnerNinzu']");
            if (sp) {
                sp.value = ninzu;
                sp.setAttribute('value', ninzu);
                // jQuery UI spinner の内部値も更新
                if (window.jQuery) {
                    jQuery(sp).spinner('value', parseInt(ninzu));
                }
            } else {
                errors.push('spinnerNinzu not found');
            }
        } catch(e) { errors.push('ninzu: ' + e.message); }

        // 使用目的 (ラジオボタン: ラベルテキストで検索、優先順: バドミントン > 軽スポーツ)
        try {
            let found = false;
            const labels = document.querySelectorAll('#mokuteki label');
            const priorities = ['バドミントン', '軽スポーツ', '軽運動'];
            for (const keyword of priorities) {
                if (found) break;
                for (const label of labels) {
                    if (label.textContent.includes(keyword)) {
                        const forId = label.getAttribute('for');
                        if (forId) {
                            const radio = document.getElementById(forId);
                            if (radio) {
                                radio.checked = true;
                                radio.dispatchEvent(new Event('change', {bubbles: true}));
                                radio.dispatchEvent(new Event('click', {bubbles: true}));
                                found = true;
                            }
                        }
                        break;
                    }
                }
            }
            if (!found) errors.push('mokuteki: バドミントン/軽スポーツ not found');
        } catch(e) { errors.push('mokuteki: ' + e.message); }

        // 申請項目
        try {
            const el = document.querySelector("input[name='txtYykShousai']");
            if (el) {
                el.value = mokuteki;
                el.setAttribute('value', mokuteki);
                el.dispatchEvent(new Event('input', {bubbles: true}));
                el.dispatchEvent(new Event('change', {bubbles: true}));
            } else {
                errors.push('txtYykShousai not found');
            }
        } catch(e) { errors.push('shousai: ' + e.message); }

        // 申込者氏名
        try {
            const el = document.querySelector("input[name='txtContents1']");
            if (el) {
                el.value = name;
                el.setAttribute('value', name);
                el.dispatchEvent(new Event('input', {bubbles: true}));
                el.dispatchEvent(new Event('change', {bubbles: true}));
            } else {
                errors.push('txtContents1 not found');
            }
        } catch(e) { errors.push('contents1: ' + e.message); }

        // 今月の利用回数
        try {
            const el = document.querySelector("input[name='txtContents2']");
            if (el) {
                el.value = count;
                el.setAttribute('value', count);
                el.dispatchEvent(new Event('input', {bubbles: true}));
                el.dispatchEvent(new Event('change', {bubbles: true}));
            } else {
                errors.push('txtContents2 not found');
            }
        } catch(e) { errors.push('contents2: ' + e.message); }

        // 連絡事項
        try {
            const el = document.querySelector("input[name='txtContents3']");
            if (el) {
                el.value = note;
                el.setAttribute('value', note);
                el.dispatchEvent(new Event('input', {bubbles: true}));
                el.dispatchEvent(new Event('change', {bubbles: true}));
            } else {
                errors.push('txtContents3 not found');
            }
        } catch(e) { errors.push('contents3: ' + e.message); }

        return {errors: errors, ok: errors.length === 0};
    }""", {
        "ninzu": NINZU,
        "mokuteki": MOKUTEKI,
        "name": "三廉康平",
        "count": "０",
        "note": "なし",
    })

    if result.get("errors"):
        for e in result["errors"]:
            debug(f"[form] ERROR: {e}")
    if result.get("ok"):
        debug("[form] 全フィールド入力成功")
    else:
        debug(f"[form] 一部入力失敗: {result}")

    save_diag(page, "step6_form_filled")
    return result.get("ok", False)


# ====== 戻る操作 ======
def go_back_to_calendar(page) -> bool:
    """時間帯選択画面からカレンダー画面へ戻る"""
    for sel in [
        "a.btnGray:has-text('戻る')",
        "a:has-text('戻る')",
        "button:has-text('戻る')",
        "input[type='submit'][value*='戻る']",
        "input[type='button'][value*='戻る']",
    ]:
        btn = page.locator(sel)
        if btn.count():
            btn.first.click()
            page.wait_for_load_state("domcontentloaded")
            debug("[back] カレンダー画面へ戻りました")
            return True

    # フォールバック: __doPostBack で戻る
    try:
        page.evaluate("__doPostBack('prev','')")
        page.wait_for_load_state("domcontentloaded")
        debug("[back] カレンダー画面へ戻りました (postback)")
        return True
    except Exception:
        pass

    debug("[back] 戻るボタンが見つかりません")
    return False


def return_to_calendar_after_booking(page) -> bool:
    """予約完了後にカレンダー画面へ復帰する。
    施設選択からやり直す（最も確実で高速）。
    """
    try:
        select_facility(page)
        debug("[return] カレンダーに復帰（施設選択経由）")
        return True
    except Exception as e:
        debug(f"[return] 施設選択からの復帰失敗: {e}")
        return False


# ====== 1日分の予約フロー（カレンダー画面から開始） ======
def book_single_day(page, target: datetime) -> bool:
    """
    1日分の予約を実行する（カレンダー画面上にいる前提）。
    カレンダークリック → 時間帯 → フォーム → 確定 → 申込。
    成功したらTrue、失敗したらFalse。
    """
    ymd = target.strftime("%Y-%m-%d")
    weekday_name = WEEKDAY_JA[target.weekday()]
    debug(f"[book] === {ymd}({weekday_name}) を試行 ===")

    # カレンダーで日付クリック
    if not click_date_on_calendar(page, target):
        debug(f"[book] {ymd} はカレンダー上で空きなし → スキップ")
        return False

    # 時間帯選択画面へ遷移
    if not go_to_timeslot_grid(page):
        debug(f"[book] {ymd} 時間帯画面への遷移失敗")
        go_back_to_calendar(page)
        return False

    # 3枠すべて空いているか確認して選択
    if not pick_time_slots(page):
        debug(f"[book] {ymd} 18:30-21:30 が空いていない → 戻る")
        go_back_to_calendar(page)
        return False

    # 次へ → フォーム画面
    if not click_next_button(page):
        debug(f"[book] {ymd} 時間枠後の遷移に失敗")
        go_back_to_calendar(page)
        return False

    # フォーム入力
    fill_application_form(page)

    # Step 1: 確定ボタンを押す → 申込確認画面へ遷移
    try:
        page.evaluate("__doPostBack('next','')")
        page.wait_for_load_state("domcontentloaded")
        debug(f"[book] {ymd}({weekday_name}) 確定 → 申込確認画面")
    except Exception as e:
        debug(f"[book] 確定ボタン押下失敗: {e}")
        save_diag(page, f"confirm_fail_{ymd}", level=1)
        return False

    save_diag(page, f"step7_confirm_{ymd}")

    # DRY_RUN: 確認画面で停止（申込しない）
    if DRY_RUN:
        debug(f"[book] {ymd}({weekday_name}) DRY_RUN: 確認画面で停止（申込しません）")
        return False

    # Step 2: 申込確認画面 → 「申込」ボタンを押す
    try:
        page.evaluate("__doPostBack('next','')")
        page.wait_for_load_state("domcontentloaded")
        debug(f"[book] {ymd}({weekday_name}) 申込完了")
    except Exception as e:
        debug(f"[book] 申込ボタン押下失敗: {e}")
        save_diag(page, f"submit_fail_{ymd}", level=1)
        return False

    save_diag(page, f"booked_{ymd}")
    return True


# ====== メインフロー: 最大5日予約 ======
def book_days(page, target_month: datetime) -> list[datetime]:
    """
    対象月の平日(月火水木)を最大MAX_DAYS日予約する。
    曜日優先順位: 月→火→水→木
    週を分散: 第1週→第2週→…、同じ週には1日だけ。

    戻り値: 予約成功した日のリスト
    """
    year, month = target_month.year, target_month.month
    booked: list[datetime] = []
    booked_weeks: set[int] = set()

    debug(f"[main] 対象月: {year}年{month}月 / 最大{MAX_DAYS}日")

    # === セットアップ（1回だけ） ===
    login(page)
    select_facility(page)

    # カレンダー表示設定
    target_month_start = datetime(year, month, 1)
    set_display_period_one_month(page, target_month_start)
    navigate_to_month(page, target_month)

    while len(booked) < MAX_DAYS:
        candidates = build_candidate_days(year, month, booked_weeks)
        tried_ymds = {d.strftime("%Y%m%d") for d in booked}
        candidates = [d for d in candidates if d.strftime("%Y%m%d") not in tried_ymds]

        if not candidates:
            debug("[main] 候補日がもうありません")
            break

        # === 事前スキャン: カレンダーの空き状況を一括取得 ===
        availability = read_all_availability(page, ROOM_LABEL)
        available_candidates = scan_available_days(availability, candidates)

        if not available_candidates:
            debug("[main] 空きのある候補日がありません")
            break

        reserved_this_round = False
        for day in available_candidates:
            ymd = day.strftime("%Y%m%d")
            if ymd in tried_ymds:
                continue
            tried_ymds.add(ymd)

            if book_single_day(page, day):
                wn = get_week_number(day)
                booked.append(day)
                booked_weeks.add(wn)
                debug(f"[main] 予約成功 {len(booked)}/{MAX_DAYS}: "
                      f"{day.strftime('%Y-%m-%d')}({WEEKDAY_JA[day.weekday()]}) 第{wn}週")
                reserved_this_round = True

                # カレンダーに復帰して次の予約へ
                if len(booked) < MAX_DAYS:
                    if not return_to_calendar_after_booking(page):
                        # 復帰失敗: フルリセット
                        debug("[main] カレンダー復帰失敗 → フルリセット")
                        login(page)
                        select_facility(page)
                    set_display_period_one_month(page, target_month_start)
                    navigate_to_month(page, target_month)
                break  # 候補リストを再生成（booked_weeksが更新されたので）

        if not reserved_this_round:
            debug("[main] この周回で予約できる日がありませんでした")
            break

    debug(f"[main] 完了: {len(booked)}日予約成功")
    for d in booked:
        debug(f"  - {d.strftime('%Y-%m-%d')}({WEEKDAY_JA[d.weekday()]}) 第{get_week_number(d)}週")
    return booked


def parse_args():
    parser = argparse.ArgumentParser(description="ふるさと千川館 自動予約")
    parser.add_argument("--test", action="store_true",
                        help="テストモード（4月分、ふるさと千川の部屋）")
    parser.add_argument("--dry-run", action="store_true",
                        help="確認画面まで進んで申込せずに停止")
    parser.add_argument("--headless", action="store_true", default=True,
                        help="ヘッドレスモードで実行（デフォルト: 有効）")
    parser.add_argument("--no-headless", dest="headless", action="store_false",
                        help="GUIモードで実行")
    parser.add_argument("--diag-level", type=int, choices=[0, 1, 2], default=None,
                        help="診断レベル (0=なし, 1=エラー時のみ, 2=全ステップ)")
    return parser.parse_args()


def main():
    global ROOM_LABEL, DIAG_LEVEL

    if not (LOGIN_ID and LOGIN_PASSWORD):
        print("ERROR: .env に LOGIN_ID / LOGIN_PASSWORD を設定してください。", file=sys.stderr)
        sys.exit(1)

    args = parse_args()

    global DRY_RUN

    # テストモード: 7月分、ふるさと千川の部屋、1日だけ
    if args.test:
        ROOM_LABEL = "ふるさと千川の部屋"
        MAX_DAYS = 1
        target_month = datetime(2026, 7, 1)
        debug("[main] テストモード: 7月分 / ふるさと千川の部屋 / 1日のみ")
        if args.diag_level is None:
            DIAG_LEVEL = 2  # テスト時はデフォルト全出力
    else:
        now = datetime.now()
        target_month = first_of_next_month(now)

    if args.diag_level is not None:
        DIAG_LEVEL = args.diag_level

    if args.dry_run:
        DRY_RUN = True
        debug("[main] DRY_RUN: 確認画面まで進み、申込はしません")

    # テスト時はGUIがデフォルト（--headless で上書き可）
    headless = args.headless
    if args.test and "--headless" not in sys.argv:
        headless = False

    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=str(USER_DATA_DIR),
            headless=headless,
            locale="ja-JP",
            timezone_id="Asia/Tokyo",
            args=["--disable-dev-shm-usage", "--disable-gpu", "--no-sandbox"],
        )
        page = ctx.new_page()
        page.set_default_navigation_timeout(30000)

        # 不要リソースをブロック — 最小限のUIで高速遷移
        BLOCKED_TYPES = {"image", "font", "media", "stylesheet"}
        BLOCKED_URLS = [
            "google-analytics", "googletagmanager", "gtag",
            "facebook", "twitter", "jquery-ui.min.css",
            "remodal", "favicon",
        ]

        def handle_route(route):
            if route.request.resource_type in BLOCKED_TYPES:
                route.abort()
                return
            url = route.request.url.lower()
            if any(b in url for b in BLOCKED_URLS):
                route.abort()
                return
            route.continue_()

        page.route("**/*", handle_route)

        try:
            booked = book_days(page, target_month)
            if booked:
                print(f"予約完了: {len(booked)}日")
                for d in booked:
                    print(f"  {d.strftime('%Y-%m-%d')}({WEEKDAY_JA[d.weekday()]})")
            else:
                print("予約できませんでした（空きなし or エラー）。")

            if not args.headless:
                input("終了するには Enter を押してください: ")
        except Exception as exc:
            save_diag(page, "error", level=1)
            print(f"ERROR: {exc}", file=sys.stderr)
            if not args.headless:
                input("エラー発生。Enter で終了: ")
            sys.exit(1)
        finally:
            try:
                ctx.close()
            except Exception:
                pass


if __name__ == "__main__":
    main()
