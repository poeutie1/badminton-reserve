# -*- coding: utf-8 -*-
"""
ふるさと千川館 自動予約スクリプト

毎月1日に翌月分を最大5日予約する。
曜日優先順位: 月→火→水→木（金曜以外の平日）
週を分散して予約（第3週→第4週→第5週→第2週→第1週）。
--dry-run の場合は申込確認画面で停止する。

Usage:
    python auto_reserve.py                    # 来月分を最大5日予約
    python auto_reserve.py --dry-run          # 確認画面まで（申込しない）
    python auto_reserve.py --test             # 翌月・ふるさと千川の部屋で確認のみ
"""

import argparse
import fcntl
import os
import re
import sys
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path
from time import perf_counter

import holidays
from dotenv import load_dotenv
from playwright.sync_api import Error as PlaywrightError, sync_playwright

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
NAVIGATION_TIMEOUT = 15000
CALENDAR_SELECTOR = "#btnHyoji"
CONFIRM_SELECTOR = 'form[action*="WgR_YoyakuKakunin"]'


class DryRunComplete(Exception):
    """申込前で止め、他の日付にも進まない。"""


class BookingResultUnknown(RuntimeError):
    """申込済みの可能性があるため、自動再試行せずに終了する。"""


class AlreadyRunning(Exception):
    pass


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
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


@contextmanager
def single_instance():
    """cron / launchd の重複起動で同じブラウザを操作しない。"""
    with (Path(__file__).parent / ".auto_reserve.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise AlreadyRunning from exc
        try:
            yield
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def navigate_and_wait(page, action, ready_selector=None):
    """同じURLへのPOSTも、新しいdocumentと遷移先の要素を待つ。

    読み込み済みの旧画面では load_state がすぐ返ることがあるため、
    操作前のdocumentに印を付け、置き換わったことを先に確認する。
    """
    started = perf_counter()
    token = uuid.uuid4().hex
    page.evaluate("token => { window.__badmintonNavigationToken = token; }", token)
    try:
        action()
    except PlaywrightError as exc:
        # submit直後に旧documentが破棄される場合も、新documentを確認する。
        if "Execution context was destroyed" not in str(exc):
            raise
    page.wait_for_function(
        "token => window.__badmintonNavigationToken !== token",
        arg=token,
        timeout=NAVIGATION_TIMEOUT,
    )
    page.wait_for_load_state("domcontentloaded", timeout=NAVIGATION_TIMEOUT)
    if ready_selector:
        page.locator(ready_selector).first.wait_for(
            state="attached", timeout=NAVIGATION_TIMEOUT
        )
    debug(f"[nav] 遷移確認 {perf_counter() - started:.2f}s")


def postback(page, event, argument="", ready_selector=None):
    navigate_and_wait(
        page,
        lambda: page.evaluate(
            "({event, argument}) => window.__doPostBack(event, argument)",
            {"event": event, "argument": argument},
        ),
        ready_selector,
    )


def is_calendar(page) -> bool:
    return page.locator(CALENDAR_SELECTOR).count() > 0


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
    postback(page, "login", ready_selector="#userID")
    save_diag(page, "step1_login_page")

    # ID/PW 入力（実サイトのセレクター）
    page.locator("#userID").fill(LOGIN_ID)
    page.locator("#passWord").fill(LOGIN_PASSWORD)
    debug("[login] ID/PW 入力完了")

    # ログインボタンクリック
    navigate_and_wait(
        page,
        lambda: page.locator("a.btnBlue:has-text('ログイン')").click(),
        "a:has-text('ログアウト')",
    )

    debug("[login] ログイン成功")
    save_diag(page, "step2_logged_in")


def is_logged_in(page) -> bool:
    """現在のページでログイン状態を確認"""
    try:
        return page.locator("a:has-text('ログアウト')").count() > 0
    except Exception:
        return False


def is_session_timeout(page) -> bool:
    """セッションタイムアウトでセッションが切れたページかどうか判定。
    カウントダウン表示（あとN分）ではなく、施設テーブルもログアウトリンクもない
    メッセージだけのページを検出する。"""
    try:
        # ログアウトリンクがあればセッション有効
        if page.locator("a:has-text('ログアウト')").count() > 0:
            return False
        # 施設テーブルがあればセッション有効
        if page.locator("#shisetsutbl").count() > 0:
            return False
        # メッセージページで「セッションタイムアウト」が含まれていれば切れている
        text = page.text_content("body") or ""
        return "セッションタイムアウト" in text
    except Exception:
        return False


# ====== Step 2: 施設選択（ふるさと千川館 → 多目的ホール） ======
def dismiss_overlays(page):
    """セッションタイムアウト警告やお知らせ等のオーバーレイを閉じる"""
    try:
        page.evaluate("""() => {
            // remodal系オーバーレイ
            document.querySelectorAll('.remodal-overlay, .remodal').forEach(el => {
                el.style.display = 'none';
            });
            // メッセージダイアログの「閉じる」ボタン
            document.querySelectorAll('a[href*="close"], button').forEach(el => {
                if ((el.textContent || '').includes('閉じる') || (el.textContent || '').includes('×')) {
                    el.click();
                }
            });
        }""")
    except Exception:
        pass  # ナビゲーション中の場合は無視


def select_facility(page, _retry: int = 0):
    if _retry > 1:
        raise RuntimeError("施設選択のリトライ上限に達しました")
    if is_calendar(page):
        return
    # ModeSelect に戻る（ログイン後のページから）
    if not page.locator("#category_18").count():
        page.goto(BASE_URL, wait_until="domcontentloaded")
    if not is_logged_in(page):
        login(page)

    dismiss_overlays(page)

    # カテゴリ「ふるさと千川館」(#category_18) をクリック
    debug("[facility] ふるさと千川館 を選択")
    cat_btn = page.locator("#category_18")
    if not cat_btn.count():
        save_diag(page, "category_not_found", level=1)
        raise RuntimeError("カテゴリ『ふるさと千川館』が見つかりません")
    navigate_and_wait(page, cat_btn.click)

    # カテゴリクリック後もセッションタイムアウトの可能性あり
    if is_session_timeout(page):
        debug("[facility] カテゴリ選択後にセッションタイムアウト検知")
        login(page)
        return select_facility(page, _retry=_retry + 1)

    page.wait_for_selector("#shisetsutbl", timeout=5000)
    dismiss_overlays(page)
    save_diag(page, "step3_facility_list")

    # Step 2a: 施設一覧から施設 or 部屋を選択
    tbl = page.locator("#shisetsutbl")
    if not tbl.count():
        debug("[facility] 直接カレンダー画面に遷移")
        return

    # ROOM_LABEL（多目的ホール等）が直接見つかればそれを選択
    room_labels = tbl.locator("td.shisetsu.toggle label").filter(has_text=ROOM_LABEL)
    if room_labels.count():
        room_labels.first.click()
        debug(f"[facility] {ROOM_LABEL} チェック済み")
        if not click_next_button(page, CALENDAR_SELECTOR):
            raise RuntimeError("カレンダーへ進むボタンが見つかりません")
        save_diag(page, "step4_calendar")
        return

    # 施設名のみ表示 → 施設を選択して「次へ進む」→ 部屋選択画面へ
    facility_labels = tbl.locator("td.shisetsu label").filter(has_text=FACILITY_NAME)
    if facility_labels.count():
        facility_labels.first.click()
        debug(f"[facility] {FACILITY_NAME} チェック済み")
    else:
        debug("[facility] 施設は既に選択済みの可能性あり")

    if not click_next_button(page):
        save_diag(page, "next_button_not_found", level=1)
        raise RuntimeError("「次へ進む」ボタンが見つかりません")

    # セッションタイムアウト検知 → 再ログインしてリトライ
    if is_session_timeout(page):
        debug("[facility] セッションタイムアウト検知、再ログインします")
        login(page)
        return select_facility(page, _retry=_retry + 1)

    dismiss_overlays(page)

    # 新しいdocumentの実要素を待つ。固定間隔のポーリングは不要。
    room_toggles = page.locator(
        "#shisetsutbl td.shisetsu.toggle label"
    ).filter(has_text=ROOM_LABEL)
    page.wait_for_function(
        """room => document.querySelector('#btnHyoji') ||
            [...document.querySelectorAll('#shisetsutbl td.shisetsu.toggle label')]
                .some(label => label.textContent.includes(room))""",
        arg=ROOM_LABEL,
        timeout=NAVIGATION_TIMEOUT,
    )

    # 遷移先の判定は #shisetsutbl の有無ではなく実要素で行う。
    # 施設→部屋選択を挟まず直接カレンダーへ遷移する場合、そのテーブルの
    # id は shisetsutbl ではないため、旧判定はカレンダーページを部屋選択
    # ページと誤認していた。カレンダーは表示ボタンで区別する。
    if not is_calendar(page) and room_toggles.count():
        # 真の部屋選択ページ: ROOM_LABEL を選択して次へ
        save_diag(page, "step3b_room_list")
        room_toggles.first.click()
        debug(f"[facility] {ROOM_LABEL} チェック済み（2段階目）")
        if not click_next_button(page, CALENDAR_SELECTOR):
            raise RuntimeError("部屋選択からカレンダーへ進めません")
        save_diag(page, "step4_calendar")
    else:
        # カレンダーページに直接遷移（施設別空き状況・部屋は行で区別）
        debug("[facility] カレンダーページに直接遷移（部屋選択不要）")
        save_diag(page, "step4_calendar")


def click_next_button(page, ready_selector=None):
    """共通: 「次へ進む」系のボタンをクリック"""
    for sel in [
        "a.btnBlue:has-text('次へ進む')",
        "button:has-text('次へ進む')",
        "input[type='submit'][value*='次']",
        "a:has-text('次へ')",
    ]:
        btn = page.locator(sel)
        if btn.count():
            navigate_and_wait(page, btn.first.click, ready_selector)
            return True
    debug("[next] 次へボタンが見つかりません")
    return False


# ====== Step 3: カレンダー操作 ======
def set_display_period_one_month(page, start_date: datetime):
    """表示期間を「1ヶ月」に設定して表示ボタンを押す"""
    y, m, d = start_date.year, start_date.month, start_date.day
    val = f"{y}/{m}/{d}"

    if not is_calendar(page):
        return False
    settings = page.evaluate("""() => ({
        date: (document.querySelector('#dpStartDate') ||
               document.querySelector('input[name="textDate"]'))?.value,
        month: document.querySelector('#radioPeriod1month')?.checked
    })""")
    shown_date = re.findall(r"\d+", settings.get("date") or "")
    if (settings.get("month") and [int(v) for v in shown_date] == [y, m, d]
            and get_calendar_header_year_month(page) == (y, m)):
        return True

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
            navigate_and_wait(page, btn.first.click, CALENDAR_SELECTOR)
            page.locator("table.calendar.horizon.toggle").first.wait_for(state="attached")
            debug(f"[calendar] 表示期間を1ヶ月に設定: {val}")
            return True
    debug("[calendar] 表示ボタンが見つかりません")
    return False


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
            postback(page, "period", "next", CALENDAR_SELECTOR)
        else:
            postback(page, "period", "prev", CALENDAR_SELECTOR)
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
            if (!room.includes(roomLabel)) return;
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
    result = page.evaluate("""({ymd, room}) => {
        const inputs = [...document.querySelectorAll('input[name="checkdate"]')];
        for (const input of inputs) {
            if (!input.value.startsWith(ymd) || input.disabled) continue;
            const row = input.closest('tr');
            if (!row || !row.textContent.includes(room)) continue;
            const label = document.querySelector('label[for="' + input.id + '"]');
            if (!label) continue;
            const marks = [label.textContent.trim(), label.title,
                label.getAttribute('aria-label'), label.querySelector('img')?.alt];
            const mark = marks.find(value => ['○', '△'].includes(value));
            if (!mark) continue;
            // 戻る操作で前の日のチェックが残っていても、申込対象は常に1日。
            inputs.filter(el => el !== input && el.checked).forEach(el => el.click());
            if (!input.checked) input.click();
            return {checked: input.checked, mark};
        }
        return null;
    }""", {"ymd": ymd, "room": ROOM_LABEL})
    if result and result["checked"]:
        debug(f"[calendar] {d.strftime('%Y-%m-%d')} を選択 (mark={result['mark']})")
        return True
    debug(f"[calendar] {d.strftime('%Y-%m-%d')} は空きなし")
    return False


# ====== Step 4: 時間帯選択 ======
def go_to_timeslot_grid(page) -> bool:
    """カレンダー画面から時間帯別画面へ遷移"""
    try:
        if click_next_button(page, 'form[action*="WgR_JikantaibetsuAkiJoukyou"]'):
            debug("[timeslot] 時間帯別画面へ遷移成功")
            save_diag(page, "step5_timeslot")
            return True
    except PlaywrightError as exc:
        debug(f"[timeslot] 時間帯別画面への遷移失敗: {exc}")
        save_diag(page, "timeslot_fail", level=1)
    return False


def pick_time_slots(page) -> bool:
    """希望3枠を一括確認し、全部空いている場合だけ選択する。"""
    result = page.evaluate(r"""({room, wanted}) => {
        for (const table of document.querySelectorAll('table.calendar.horizon.toggle')) {
            const row = [...table.querySelectorAll('tbody tr')].find(row =>
                row.querySelector('td.shisetsu, th.shisetsu')?.textContent.includes(room));
            if (!row) continue;
            const columns = [...table.querySelectorAll('thead th')].map((th, index) => {
                const m = th.textContent.match(/(\d{1,2})\s*[:：]\s*(\d{2})\s*[~～〜\-－–]\s*(\d{1,2})\s*[:：]\s*(\d{2})/);
                return m ? {index, slot: `${m[1].padStart(2, '0')}:${m[2]}~${m[3].padStart(2, '0')}:${m[4]}`} : null;
            }).filter(col => col && wanted.includes(col.slot));
            if (columns.length !== wanted.length ||
                    new Set(columns.map(col => col.slot)).size !== wanted.length)
                return {ok: false, reason: '対象時間帯の列が不足'};
            const cells = [...row.querySelectorAll('td')];
            const inputs = [];
            for (const {index, slot} of columns) {
                const cell = cells[index];
                const input = cell?.querySelector('input[name="checktime"]');
                const marks = [cell?.textContent || '',
                    ...[...(cell?.querySelectorAll('img') || [])].map(img => img.alt)];
                if (!input || input.disabled || !marks.some(text => /[○△]/.test(text)))
                    return {ok: false, reason: `${slot} は空きなし`};
                inputs.push(input);
            }
            // 戻る操作で残った希望時間外の選択も消してから、3枠だけを選ぶ。
            table.querySelectorAll('input[name="checktime"]:checked').forEach(input => {
                if (!inputs.includes(input)) input.click();
            });
            inputs.forEach(input => { if (!input.checked) input.click(); });
            return {ok: inputs.every(input => input.checked), slots: columns.map(col => col.slot)};
        }
        return {ok: false, reason: '対象の部屋の行が見つかりません'};
    }""", {"room": ROOM_LABEL, "wanted": [norm_wave(s) for s in WANTED_SLOTS]})
    debug(f"[timeslot] {result.get('slots') if result['ok'] else result.get('reason', '選択失敗')}")
    return result["ok"]


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
    """施設別空き状況へのリンクで直接戻り、実際の到着を確認する。"""
    if is_calendar(page):
        return True
    history = page.locator(
        'a[href*="WgR_ShisetsubetsuAkiJoukyou"]'
    )
    if history.count():
        try:
            navigate_and_wait(page, history.first.click, CALENDAR_SELECTOR)
            debug("[back] カレンダーに復帰（施設別空き状況リンク）")
            return True
        except PlaywrightError as exc:
            debug(f"[back] カレンダー復帰失敗: {exc}")
            return False

    for sel in [
        "a.btnGray:has-text('戻る')",
        "a:has-text('戻る')",
        "button:has-text('戻る')",
        "input[type='submit'][value*='戻る']",
        "input[type='button'][value*='戻る']",
    ]:
        btn = page.locator(sel)
        if btn.count():
            try:
                navigate_and_wait(page, btn.first.click, CALENDAR_SELECTOR)
                debug("[back] カレンダー画面への復帰を確認")
                return True
            except PlaywrightError as exc:
                debug(f"[back] 戻る操作でカレンダーに復帰できません: {exc}")
                return False

    debug("[back] 戻るボタンが見つかりません")
    return False


def return_to_calendar_after_booking(page) -> bool:
    """カレンダーを再利用し、セッション切れの場合だけログインする。"""
    if go_back_to_calendar(page):
        return True
    try:
        if not is_logged_in(page):
            login(page)
        select_facility(page)
        if is_calendar(page):
            debug("[return] カレンダーに復帰（施設選択経由）")
            return True
    except Exception as e:
        debug(f"[return] 施設選択からの復帰失敗: {e}")
    return False


def prepare_calendar(page, target_month):
    """選択月を保ったままカレンダーを再利用する。"""
    if not return_to_calendar_after_booking(page):
        raise RuntimeError("カレンダーへの復帰に失敗しました")
    if not set_display_period_one_month(page, target_month):
        raise RuntimeError("カレンダーの表示期間を設定できません")
    if not navigate_to_month(page, target_month):
        raise RuntimeError("対象月のカレンダーを確認できません")


def booking_completed(page) -> bool:
    """確認画面が消え、受付完了の明示的な文言が出たことを確認する。"""
    if page.get_by_role("button", name=re.compile(r"申込$")).count():
        return False
    text = re.sub(r"\s+", "", page.locator("body").inner_text())
    return bool(re.search(
        r"(?:予約|申込み?|申し込み|申請)(?:の(?:手続き|受付))?(?:が|を|は)?"
        r"(?:正常に)?(?:完了(?:しました|いたしました)|受け付け(?:ました|いたしました)|"
        r"受付(?:しました|いたしました))",
        text,
    ))


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
    if not click_next_button(page, "input[name='spinnerNinzu']"):
        debug(f"[book] {ymd} 時間枠後の遷移に失敗")
        go_back_to_calendar(page)
        return False

    # フォーム入力
    if not fill_application_form(page):
        raise RuntimeError("申請フォームに入力できない項目があります")

    # Step 1: 確定ボタンを押す → 申込確認画面へ遷移
    try:
        postback(page, "next", ready_selector=CONFIRM_SELECTOR)
        page.locator("input[type='button'][value*='申込']").wait_for(state="attached")
        debug(f"[book] {ymd}({weekday_name}) 確定 → 申込確認画面")
    except Exception as e:
        debug(f"[book] 確定ボタン押下失敗: {e}")
        save_diag(page, f"confirm_fail_{ymd}", level=1)
        return False

    save_diag(page, f"step7_confirm_{ymd}")

    # DRY_RUN: 確認画面で停止（申込しない）
    if DRY_RUN:
        debug(f"[book] {ymd}({weekday_name}) DRY_RUN: 確認画面で停止（申込しません）")
        raise DryRunComplete(ymd)

    # Step 2: 申込確認画面 → 「申込」ボタンを押す
    try:
        postback(page, "next")
        if not booking_completed(page):
            raise BookingResultUnknown("申込後に受付完了を確認できません")
        debug(f"[book] {ymd}({weekday_name}) 申込完了")
    except Exception as e:
        debug(f"[book] 申込結果が未確認: {e}")
        save_diag(page, f"submit_fail_{ymd}", level=1)
        raise BookingResultUnknown(
            f"{ymd} は申込済みの可能性があります。予約照会で確認してください。自動再試行はしません。"
        ) from e

    save_diag(page, f"booked_{ymd}")
    return True


# ====== メインフロー: 最大5日予約 ======
def book_days(page, target_month: datetime) -> list[datetime]:
    """
    対象月の平日(月火水木)を最大MAX_DAYS日予約する。
    曜日優先順位: 月→火→水→木
    同じ週には1日だけ。確認済みの候補は成功後も再確認しない。

    戻り値: 予約成功した日のリスト
    """
    year, month = target_month.year, target_month.month
    booked: list[datetime] = []
    booked_weeks: set[int] = set()
    tried_ymds: set[str] = set()
    started = perf_counter()

    debug(f"[main] 対象月: {year}年{month}月 / 最大{MAX_DAYS}日")

    # === セットアップ（1回だけ） ===
    login(page)
    select_facility(page)

    # カレンダー表示設定
    target_month_start = datetime(year, month, 1)
    prepare_calendar(page, target_month_start)

    while len(booked) < MAX_DAYS:
        candidates = build_candidate_days(year, month, booked_weeks)
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
        for index, day in enumerate(available_candidates):
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
                    prepare_calendar(page, target_month_start)
                break  # 候補リストを再生成（booked_weeksが更新されたので）
            else:
                if index + 1 < len(available_candidates):
                    debug(f"[main] {ymd} は取得できず → カレンダーを再利用して次候補へ")
                    prepare_calendar(page, target_month_start)

        if not reserved_this_round:
            debug("[main] この周回で予約できる日がありませんでした")
            break

    debug(f"[main] 完了: {len(booked)}日予約成功")
    debug(f"[main] 所要時間: {perf_counter() - started:.2f}s / 確認候補: {len(tried_ymds)}日")
    for d in booked:
        debug(f"  - {d.strftime('%Y-%m-%d')}({WEEKDAY_JA[d.weekday()]}) 第{get_week_number(d)}週")
    return booked


def parse_args():
    parser = argparse.ArgumentParser(description="ふるさと千川館 自動予約")
    parser.add_argument("--test", action="store_true",
                        help="翌月・ふるさと千川の部屋で確認のみ（申込しない）")
    parser.add_argument("--dry-run", action="store_true",
                        help="確認画面まで進んで申込せずに停止")
    parser.add_argument("--headless", action="store_true", default=True,
                        help="ヘッドレスモードで実行（デフォルト: 有効）")
    parser.add_argument("--no-headless", dest="headless", action="store_false",
                        help="GUIモードで実行")
    parser.add_argument("--diag-level", type=int, choices=[0, 1, 2], default=None,
                        help="診断レベル (0=なし, 1=エラー時のみ, 2=全ステップ)")
    return parser.parse_args()


def launch_browser_context(p, headless):
    options = {
        "user_data_dir": str(USER_DATA_DIR),
        "headless": headless,
        "locale": "ja-JP",
        "timezone_id": "Asia/Tokyo",
        "args": ["--disable-dev-shm-usage", "--disable-gpu", "--no-sandbox"],
    }
    # Playwright更新・キャッシュ削除後も、インストール済みChromeを利用できる。
    chromium = Path(p.chromium.executable_path)
    if chromium.is_file():
        options["executable_path"] = str(chromium)
    elif Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome").is_file():
        options["channel"] = "chrome"
        debug("[browser] インストール済みGoogle Chromeを使用")
    else:
        raise RuntimeError(
            f"ブラウザがありません。{sys.executable} -m playwright install chromium を実行してください。"
        )
    return p.chromium.launch_persistent_context(**options)


def run():
    global ROOM_LABEL, DIAG_LEVEL, MAX_DAYS, DRY_RUN

    args = parse_args()

    if not (LOGIN_ID and LOGIN_PASSWORD):
        print("ERROR: .env に LOGIN_ID / LOGIN_PASSWORD を設定してください。", file=sys.stderr)
        sys.exit(1)

    target_month = first_of_next_month(datetime.now())
    if args.test:
        ROOM_LABEL = "ふるさと千川の部屋"
        MAX_DAYS = 1
        DRY_RUN = True
        debug("[main] テストモード: 翌月 / ふるさと千川の部屋 / 申込しません")
        if args.diag_level is None:
            DIAG_LEVEL = 2  # テスト時はデフォルト全出力
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
        ctx = launch_browser_context(p, headless)
        page = ctx.new_page()
        page.set_default_navigation_timeout(NAVIGATION_TIMEOUT)
        page.set_default_timeout(NAVIGATION_TIMEOUT)

        # 不要リソースをブロック — 最小限のUIで高速遷移
        BLOCKED_TYPES = {"image", "font", "media", "stylesheet"}
        BLOCKED_URLS = [
            "google-analytics", "googletagmanager", "gtag",
            "facebook", "twitter", "jquery-ui.min.css",
            "remodal", "favicon",
        ]

        def handle_route(route):
            # dry-runは制御フローに加え、確認画面からのPOST自体も遮断する。
            if (DRY_RUN and route.request.method == "POST"
                    and "wgr_yoyakukakunin" in route.request.url.lower()):
                route.abort()
                return
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
        except DryRunComplete as preview:
            debug(f"[main] DRY_RUN完了: {preview} の申込確認画面まで検証（申込0件）")
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


def main():
    try:
        with single_instance():
            run()
    except AlreadyRunning:
        debug("[main] 別の予約処理が実行中のため、重複起動をスキップ")


if __name__ == "__main__":
    main()
