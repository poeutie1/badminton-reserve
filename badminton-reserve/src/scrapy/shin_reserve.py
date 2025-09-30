# reserve_single_day.py
# -*- coding: utf-8 -*-

import os, re, time, subprocess
from datetime import datetime
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright

# ====== 固定設定 ======
BASE = "https://www2.pf489.com/toshima/WebR/Home/WgR_ModeSelect"
FACILITY_NAME = "ふるさと千川館"
ROOM_LABEL = "多目的ホール"

# 指定したい時間帯（この日のみ）
WANTED_SLOTS = ["18:30~19:30", "19:30~20:30", "20:30~21:30"]

# 予約したい単日（ここだけ変える）
TARGET_DATE = "2025-10-13"

# 送信はしない（確認/フォーム入力まで）
AUTO_SUBMIT = False
USER_DATA_DIR = "udata"
DEBUG = True

# ログイン入力欄（フォールバックあり）
SEL_ID = "#body > div.content_body.clearfix > div.login_info.clearfix > dl.userid.clearfix > dd input"
SEL_PW = "#body > div.content_body.clearfix > div.login_info.clearfix > dl.pswd.clearfix > dd input"

OK_MARKS = {"○", "△"}
MONTH_RE = re.compile(r"(\d{4})年\s*(\d{1,2})月")
TIME_RANGE_RE = re.compile(r"(?P<h1>\d{1,2})\s*[:：]?\d*\s*[\-–~〜～－]\s*(?P<h2>\d{1,2})\s*[:：]?\d*")

# ====== .env ======
load_dotenv()
LOGIN_ID = os.getenv("LOGIN_ID")
LOGIN_PASSWORD = os.getenv("LOGIN_PASSWORD")


# ====== 共通ユーティリティ ======
def route_block(route):
    # 常時ブロック（画面は見えなくてよい）
    if route.request.resource_type in {"image", "media", "font"}:
        return route.abort()
    return route.continue_()

def save_diag(page, prefix="diag"):
    if not DEBUG: return
    try:
        os.makedirs("diag", exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        page.screenshot(path=f"diag/{prefix}_{ts}.png", full_page=True)
        with open(f"diag/{prefix}_{ts}.html", "w", encoding="utf-8") as f:
            f.write(page.content())
    except Exception:
        pass

def norm_wave(s: str) -> str:
    if s is None: return ""
    return re.sub(r"\s+"," ", s.replace("〜","~").replace("～","~").replace("–","~").replace("－","~")).strip()

def unique_norm(labels):
    seen=set(); out=[]
    for x in labels:
        nx = norm_wave(x)
        if nx not in seen:
            seen.add(nx); out.append(x)
    return out

def _parse_date_yyyy_mm_dd(s: str) -> datetime:
    m = re.match(r"^\s*(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s*$", s)
    if not m: raise ValueError(f"invalid TARGET_DATE: {s}")
    y, mm, dd = map(int, m.groups())
    return datetime(y, mm, dd)

def _console_filter(msg):
    text = msg.text or ""
    if "Failed to load resource" in text:
        return  # 画像/フォント遮断由来のノイズは黙る
    print(f"[console] {msg.type} {text}")


# ====== ログイン ======
def is_logged_in(page) -> bool:
    try:
        if page.locator("a:has-text('ログアウト'), .logout a").count(): return True
        if page.get_by_text("施設別空き状況", exact=False).count(): return True
        if page.get_by_text("施設の検索", exact=False).count(): return True
    except Exception:
        pass
    return False

def login(page):
    page.goto(BASE, wait_until="domcontentloaded")
    if is_logged_in(page): return

    # ログイン画面へ
    link = page.locator(
        "a:has-text('ログイン'), button:has-text('ログイン'), "
        "[onclick*='Login'], a[href*='Login'], a[href*='WgR_Login'], "
        "input[type='submit'][value*='ログイン']"
    )
    if link.count():
        link.first.click()
        page.wait_for_load_state("domcontentloaded")

    # ID/PW入力
    try:
        (page.locator(SEL_ID).first if page.locator(SEL_ID).count()
         else page.locator("input[type='text'], input[type='tel'], input:not([type])").first
         ).fill(LOGIN_ID, timeout=3000)

        (page.locator(SEL_PW).first if page.locator(SEL_PW).count()
         else page.locator("input[type='password']").first
         ).fill(LOGIN_PASSWORD, timeout=3000)

        # 送信
        for s in ["#body .login_info input[type='submit']",
                  "#body .login_info button[type='submit']",
                  "input[type='submit']",
                  "button[type='submit']"]:
            loc = page.locator(s)
            if loc.count():
                loc.first.click()
                break
        else:
            page.keyboard.press("Enter")
        page.wait_for_load_state("domcontentloaded")
    except Exception:
        pass

    if not is_logged_in(page):
        save_diag(page, "login_fail")
        raise RuntimeError("ログイン失敗")


# ====== 施設タイルを“一回だけ”押す ======

def click_next(page, timeout_ms: int = 8000) -> bool:
    """『次へ進む』系のボタン/リンクを押す（遷移あり/なし両対応）。"""
    import re as _re
    deny = _re.compile(r"(戻る|メニュー|ログアウト)")
    cands = [
        lambda: page.get_by_role("button", name=_re.compile(r"(次へ進む|次へ|進む)")),
        lambda: page.locator("button:has-text('次へ進む')"),
        lambda: page.locator("button:has-text('次へ')"),
        lambda: page.locator("input[type='submit'][value*='次']"),
        lambda: page.get_by_role("link", name=_re.compile(r"(次へ進む|次へ)")),
        lambda: page.locator("[id*='Next'], [name*='Next']"),
        lambda: page.locator("a.btnBlue:has-text('次へ進む')"),
    ]
    try:
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(60)
    except Exception:
        pass
    for fn in cands:
        try:
            loc = fn()
            n = loc.count() if hasattr(loc, "count") else 0
            for i in range(n):
                el = loc.nth(i)
                text = ((el.inner_text() or "") + " " + (el.get_attribute("value") or "")).strip()
                if deny.search(text):
                    continue
                try:
                    el.scroll_into_view_if_needed(timeout=800)
                except Exception:
                    pass
                try:
                    with page.expect_navigation(wait_until="domcontentloaded", timeout=timeout_ms):
                        el.click(timeout=timeout_ms)
                except Exception:
                    # URLが変わらないDOM書換え型もある
                    try:
                        el.click(timeout=1200)
                    except Exception:
                        pass
                # 到着チェック
                if page.locator("input[name='checktime']").count() or page.locator("input[name='checkdate']").count():
                    return True
                return True
        except Exception:
            continue
    # 最後の保険
    try:
        clicked = page.evaluate("""
            () => {
              const q = Array.from(document.querySelectorAll('a,button,input[type=submit],[role=button]'));
              const el = q.find(el=>{
                const t = (el.innerText || el.textContent || el.value || '').trim();
                return /次へ進む|次へ/.test(t) && !/戻る|メニュー|ログアウト/.test(t);
              });
              if (el){ el.click(); return true; }
              return false;
            }
        """)
        if clicked:
            try:
                page.wait_for_load_state("domcontentloaded", timeout=timeout_ms)
            except Exception:
                pass
            return True
    except Exception:
        pass
    return False


def _try_category_button(page) -> bool:
    """『カテゴリから探す』のタイルから FACILITY_NAME を一発クリック。"""
    try:
        page.wait_for_selector("#tabs, .tabs-panel, body", state="visible", timeout=3000)
    except Exception:
        pass

    cands = [
        f"#tabs div.category.tabs-panel.selected input[type='button'][value='{FACILITY_NAME}']",
        f"input[type='button'][value='{FACILITY_NAME}']",
        f"input[id^='category_'][type='button'][value='{FACILITY_NAME}']",
        f"button:has-text('{FACILITY_NAME}')",
        f"a:has-text('{FACILITY_NAME}')",
        f"[role='button']:has-text('{FACILITY_NAME}')",
    ]
    for sel in cands:
        loc = page.locator(sel)
        if loc.count():
            try:
                loc.first.scroll_into_view_if_needed(timeout=500)
            except Exception:
                pass
            try:
                with page.expect_load_state("domcontentloaded", timeout=2000):
                    loc.first.click(timeout=1500)
            except Exception:
                try:
                    loc.first.click(timeout=1200)
                except Exception:
                    continue
            return True
    return False


def click_next(page, timeout_ms: int = 8000) -> bool:
    import re as _re
    deny = _re.compile(r"(戻る|メニュー|ログアウト)")
    cands = [
        lambda: page.get_by_role("button", name=_re.compile(r"(次へ進む|次へ|進む)")),
        lambda: page.locator("button:has-text('次へ進む')"),
        lambda: page.locator("button:has-text('次へ')"),
        lambda: page.locator("input[type='submit'][value*='次']"),
        lambda: page.get_by_role("link", name=_re.compile(r"(次へ進む|次へ)")),
        lambda: page.locator("[id*='Next'], [name*='Next']"),
        lambda: page.locator("a.btnBlue:has-text('次へ進む')"),
    ]
    try:
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(80)
    except Exception:
        pass
    for fn in cands:
        try:
            loc = fn()
            n = loc.count() if hasattr(loc, "count") else 0
            for i in range(n):
                el = loc.nth(i)
                text = ((el.inner_text() or "") + " " + (el.get_attribute("value") or "")).strip()
                if deny.search(text):
                    continue
                try: el.scroll_into_view_if_needed(timeout=1000)
                except Exception: pass
                try:
                    with page.expect_navigation(wait_until="domcontentloaded", timeout=timeout_ms):
                        el.click(timeout=timeout_ms)
                except Exception:
                    try: el.click(timeout=1200)
                    except Exception: pass
                return True
        except Exception:
            continue
    # フォールバック（JSで文字を探してクリック）
    try:
        clicked = page.evaluate("""
            () => {
              const q = Array.from(document.querySelectorAll('a,button,input[type=submit],[role=button]'));
              const el = q.find(el=>{
                const t = (el.innerText || el.textContent || el.value || '').trim();
                return /次へ進む|次へ/.test(t) && !/戻る|メニュー|ログアウト/.test(t);
              });
              if (el){ el.click(); return true; }
              return false;
            }
        """)
        if clicked:
            try: page.wait_for_load_state("domcontentloaded", timeout=timeout_ms)
            except Exception: pass
            return True
    except Exception:
        pass
    return False


def _try_category_button(page) -> bool:
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
            try: loc.first.scroll_into_view_if_needed(timeout=500)
            except Exception: pass
            loc.first.click(timeout=3000)
            page.wait_for_load_state("domcontentloaded")
            return True
    rb = page.get_by_role("button", name=FACILITY_NAME)
    if rb.count():
        rb.first.click(timeout=3000)
        page.wait_for_load_state("domcontentloaded")
        return True
    return False


def _try_shisetsutbl_and_next(page) -> bool:
    tbl = page.locator("#shisetsutbl")
    if not tbl.count():
        return False
    lbl = tbl.locator("td.shisetsu.toggle label").filter(has_text=FACILITY_NAME)
    if not lbl.count():
        page.wait_for_timeout(200)
        lbl = tbl.locator("td.shisetsu.toggle label").filter(has_text=FACILITY_NAME)
    if not lbl.count():
        return False
    lab = lbl.first
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
    page.wait_for_timeout(120)
    if click_next(page):
        return True
    alt = page.locator("button:has-text('次へ進む'), input[type='submit'][value*='次'], a:has-text('次へ')")
    if alt.count():
        alt.first.click(timeout=3000)
        page.wait_for_load_state("domcontentloaded")
        return True
    return False


def select_facility_and_next(page):
    """
    ふるさと千川館タイルを押す →（出たら）#shisetsutblで選択→次へ。
    検索フォームは使わない。元コードのルートそのまま。
    """
    # 1) カテゴリタイルを押す
    if not _try_category_button(page):
        save_diag(page, "category_tile_not_found")
        raise RuntimeError("『ふるさと千川館』タイルが見つかりません")

    # 2) 直接グリッドにいるなら終了（施設別/月次）
    try:
        if page.locator("table.calendar.horizon.toggle").count() or \
           page.locator("input[name='checkdate']").count():
            return
    except Exception:
        pass

    # 3) 施設一覧が出たらチェックして次へ
    _try_shisetsutbl_and_next(page)


# ====== 月次 → 単日クリック（○/△のみ） ======
def force_timeslot_range(page, start_dt):
    """時間帯ページで『表示開始日= start_dt』『期間=1ヶ月』にして 表示 を押す"""
    y, m, d = start_dt.year, start_dt.month, start_dt.day
    val = f"{y}/{m}/{d}"
    # 値セット + イベント発火 + 1ヶ月ラジオON
    page.evaluate(
        """({val})=>{
            const fire=(el,t)=>{ if(!el) return; try{ el.dispatchEvent(new Event(t,{bubbles:true})); }catch(e){} };
            const $ = (s)=>document.querySelector(s);
            const dp = $('#dpStartDate') || document.querySelector('input[name="textDate"]');
            if (dp){ dp.value = val; fire(dp,'input'); fire(dp,'change'); dp.blur && dp.blur(); }
            const r  = $('#radioPeriod1month')
                    || document.querySelector('input[type="radio"][value="1month"]')
                    || document.querySelector('input[type="radio"][name*="Period"][value="1"]');
            if (r){ r.checked = true; fire(r,'input'); fire(r,'change'); }
        }""",
        {"val": val}
    )
    # 「表示」押下（複数セレクタ保険）
    for sel in ["#btnHyoji", "button:has-text('表示')", "input[type='submit'][value*='表示']"]:
        loc = page.locator(sel)
        if loc.count():
            try:
                loc.first.click(timeout=1200)
                break
            except Exception:
                continue
    try:
        page.wait_for_load_state("domcontentloaded", timeout=3000)
    except Exception:
        pass
    page.wait_for_timeout(150)

def _facility_header_year_month(page):
    try:
        head = page.locator("table.calendar.horizon.toggle .pagination .month")
        if head.count():
            m = MONTH_RE.search((head.first.inner_text() or "").strip())
            if m: return int(m.group(1)), int(m.group(2))
    except Exception:
        pass
    return None, None

def _facility_click_next_month(page) -> bool:
    try:
        page.evaluate("window.__doPostBack && window.__doPostBack('period','next')")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(120)
        return True
    except Exception:
        pass
    for sel in ["table.calendar.horizon.toggle .pagination .next a",
                "button:has-text('＞')", "a:has-text('＞')"]:
        loc = page.locator(sel)
        if loc.count():
            try:
                loc.first.click(timeout=1200)
                page.wait_for_load_state("domcontentloaded")
                return True
            except Exception:
                continue
    return False

def ensure_facility_month_visible(page, target_dt: datetime, max_hops=3):
    ty, tm = target_dt.year, target_dt.month
    y, m = _facility_header_year_month(page)
    hops = 0
    while y is not None and (y, m) != (ty, tm) and hops < max_hops:
        if not _facility_click_next_month(page): break
        y, m = _facility_header_year_month(page)
        hops += 1

def read_mark_from_label(lab):
    try:
        t = (lab.inner_text() or "").strip()
        if t in {"○","△","×","―"}: return t
    except Exception: pass
    for attr in ("title","aria-label"):
        try:
            v = (lab.get_attribute(attr) or "").strip()
            if v in {"○","△","×","―"}: return v
        except Exception: pass
    try:
        img = lab.locator("img")
        if img.count():
            alt = (img.first.get_attribute("alt") or "").strip().lower()
            amap = {"circle":"○","maru":"○","○":"○",
                    "triangle":"△","sankaku":"△","△":"△",
                    "cross":"×","batsu":"×","×":"×",
                    "bar":"―","line":"―","―":"―"}
            return amap.get(alt,"")
    except Exception: pass
    return ""

def month_click_if_ok(page, d: datetime) -> bool:
    ymd = d.strftime("%Y%m%d")
    inputs = page.locator(f'input[name="checkdate"][value^="{ymd}"]')
    if inputs.count() == 0:
        return False
    for i in range(inputs.count()):
        el = inputs.nth(i)
        # 行が多目的ホールか
        try:
            row = el.locator("xpath=ancestor::tr[1]")
            row_txt = (row.first.text_content() or "").strip() if row.count() else ""
        except Exception:
            row_txt = ""
        if ROOM_LABEL not in row_txt and ("多目的" not in row_txt and "ﾎｰﾙ" not in row_txt):
            continue
        cid = el.get_attribute("id") or ""
        lab = page.locator(f'label[for="{cid}"]')
        if not lab.count(): continue
        mark = read_mark_from_label(lab.first)
        if DEBUG: print(f"[month] {ymd} {ROOM_LABEL} mark={mark or '(empty)'}")
        if mark in OK_MARKS:
            try:
                lab.first.click(timeout=800)
            except Exception:
                try: el.check(timeout=600)
                except Exception: pass
            page.wait_for_timeout(120)
            return True
    return False


# ====== 時間帯別 ======
def is_timeslot_grid(page) -> bool:
    try:
        if page.get_by_text("時間帯別空き状況", exact=False).count(): return True
        return page.locator("input[name='checktime']").count() > 0
    except Exception:
        return False

def go_to_timeslot_grid(page) -> bool:
    for sel in [
        "button:has-text('次へ進む')",
        "button:has-text('次へ')",
        "a:has-text('次へ進む')",
        "a:has-text('次へ')",
        "input[type='submit'][value*='次']",
        "li.next > a.btnBlue",
    ]:
        loc = page.locator(sel)
        if loc.count():
            try:
                with page.expect_navigation(wait_until="domcontentloaded", timeout=7000):
                    loc.first.click(timeout=2500)
            except Exception:
                try: loc.first.click(timeout=1200)
                except Exception: pass
            try:
                page.wait_for_selector("input[name='checktime']", timeout=4000)
                return True
            except Exception:
                pass
    try:
        page.evaluate("window.__doPostBack && window.__doPostBack('next','')")
        page.wait_for_selector("input[name='checktime']", timeout=6000)
        return True
    except Exception:
        return False

def _extract_range_from_header(th_text: str):
    t = (th_text or "").replace("\u3000"," ").strip()
    t = t.replace("〜","~").replace("～","~").replace("－","-").replace("–","-")
    m = TIME_RANGE_RE.search(t.replace(" ", ""))
    if m: return int(m.group("h1")), int(m.group("h2"))
    return None

def find_table_and_row_for_room(page, room_label: str):
    tables = page.locator("table.calendar.horizon.toggle")
    for i in range(tables.count()):
        t = tables.nth(i)
        rows = t.locator("tbody tr")
        for r in range(rows.count()):
            row = rows.nth(r)
            head = row.locator("td.shisetsu, th.shisetsu")
            if head.count():
                txt = (head.first.text_content() or "").strip()
                if room_label in txt:
                    return t, row
    return None, None

def _collect_wanted_cols_for_row(table, row) -> list:
    ths = table.locator("thead th")
    wanted_norm = {norm_wave(s) for s in unique_norm(WANTED_SLOTS)}
    cols = []
    for i in range(ths.count()):
        lbl = norm_wave((ths.nth(i).text_content() or ""))
        rng = _extract_range_from_header(lbl)
        if not rng: continue
        slot = f"{rng[0]:02d}:30~{rng[1]:02d}:30" if ":30" in lbl else f"{rng[0]}:00~{rng[1]}:00"
        if norm_wave(slot) in wanted_norm or norm_wave(lbl) in wanted_norm:
            cols.append(i)
    return cols

def ensure_checktime_checked(cell) -> bool:
    try:
        inps = cell.locator("input[name='checktime' i][type='checkbox'], input[name='checktime' i][type='radio']")
        if inps.count() == 0: return False
        box = inps.first
        try:
            box.check(timeout=800); return True
        except Exception:
            pass
        try:
            lab = cell.locator("label")
            if lab.count():
                lab.first.click(timeout=800); return True
        except Exception:
            pass
        try:
            box.evaluate("(el)=>{el.checked=true; el.dispatchEvent(new Event('change',{bubbles:true}));}")
            return True
        except Exception:
            pass
    except Exception:
        return False
    return False

def pick_exact_three_slots_for_current_day(page) -> bool:
    if not is_timeslot_grid(page): return False
    t, row = find_table_and_row_for_room(page, ROOM_LABEL)
    if not t or not row:
        if DEBUG: print("[time] 行が見つからない")
        return False

    cols = _collect_wanted_cols_for_row(t, row)
    if len(cols) < len(WANTED_SLOTS):
        if DEBUG: print("[time] 対象列が不足")
        return False

    cells = row.locator("td")
    picked = 0
    for ci in cols:
        if ci >= cells.count(): continue
        cell = cells.nth(ci)
        mark_txt = (cell.text_content() or "")
        okish = ("○" in mark_txt) or ("△" in mark_txt) or cell.locator("img[alt*='○'], img[alt*='maru'], img[alt*='circle']").count()
        if not okish: return False
        if not ensure_checktime_checked(cell): return False
        picked += 1
        page.wait_for_timeout(60)

    if DEBUG: print(f"[time] wanted={len(WANTED_SLOTS)} picked={picked}")
    return picked == len(WANTED_SLOTS)

def next_after_timeslots(page) -> bool:
    for sel in [
        "button:has-text('次へ進む')",
        "a.btnBlue:has-text('次へ進む')",
        "a:has-text('次へ')",
        "input[type='submit'][value*='次']",
        "li.next > a.btnBlue",
    ]:
        loc = page.locator(sel)
        if loc.count():
            try:
                with page.expect_navigation(wait_until="domcontentloaded", timeout=6000):
                    loc.first.click(timeout=2500)
            except Exception:
                try: loc.first.click(timeout=1200)
                except Exception: pass
            return True
    try:
        page.evaluate("window.__doPostBack && window.__doPostBack('next','')")
        page.wait_for_load_state("domcontentloaded")
        return True
    except Exception:
        return False


# ====== フォーム ======
def is_shousai_form(page) -> bool:
    try:
        if page.get_by_text("利用人数", exact=False).count(): return True
        if page.locator("#shousai").count(): return True
        if page.locator("label:has-text('バドミントン')").count(): return True
        if page.locator("#contents1 input[type='text'], #contents2 input[type='text'], #contents3 input[type='text']").count():
            return True
    except Exception:
        pass
    return False

def fill_application_form(page, *, auto_submit: bool = AUTO_SUBMIT) -> bool:
    if not is_shousai_form(page): return False
    if DEBUG: print("[form] 詳細申請フォーム → 入力")

    try:
        ninzu = page.locator("#ninzu input[type='number'], input[name='spinnerNinzu']")
        if ninzu.count(): ninzu.first.fill("20")
    except Exception: pass
    try: page.locator("label:has-text('バドミントン')").first.click()
    except Exception: pass
    try: page.locator("#shousai > input[type='text']").first.fill("バドミントン")
    except Exception: pass
    try: page.locator("#contents1 > input[type='text']").first.fill("三廉康平")
    except Exception: pass
    try: page.locator("#contents2 > input[type='text']").first.fill("0")
    except Exception: pass
    try: page.locator("#contents3 > input[type='text']").first.fill("なし")
    except Exception: pass

    if not auto_submit:
        if DEBUG: print("[form] 入力のみ（確定は押さない）")
        return True

    for sel in ["button:has-text('確定')","input[type='submit'][value*='確定']","a:has-text('確定')"]:
        loc = page.locator(sel)
        if loc.count():
            try:
                with page.expect_navigation(wait_until="domcontentloaded", timeout=5000):
                    loc.first.click(timeout=1500)
            except Exception:
                try: loc.first.click(timeout=1200)
                except Exception: pass
            break
    return True


# ====== メインフロー（単日） ======
def book_single_date(page, d: datetime) -> bool:
    if not is_logged_in(page):
        login(page)

    # トップ → タイル一発 → グリッド表示
    page.goto(BASE, wait_until="domcontentloaded")
    select_facility_and_next(page)

    # 目標月へ
    ensure_facility_month_visible(page, d, max_hops=3)

    # 単日（○/△）をクリック
    if not month_click_if_ok(page, d):
        if DEBUG: print(f"[single] {d.date()} は○/△ではありません")
        return False

    # 時間帯別へ
    if not go_to_timeslot_grid(page):
        if DEBUG: print("[single] 時間帯別へ遷移失敗")
        return False

    # 3枠すべて選択
    if not pick_exact_three_slots_for_current_day(page):
        if DEBUG: print("[single] 3枠選択できず")
        return False

    # 次へ → フォーム
    if not next_after_timeslots(page):
        if DEBUG: print("[single] 次へ進む失敗（時間帯後）")
        return False

    if is_shousai_form(page):
        return fill_application_form(page, auto_submit=AUTO_SUBMIT)

    # 確認画面のみの施設もあるので True 扱い
    return True


# ====== エントリーポイント ======
def main():
    if not (LOGIN_ID and LOGIN_PASSWORD):
        raise SystemExit(".env に LOGIN_ID / LOGIN_PASSWORD を設定してください。")

    target_dt = _parse_date_yyyy_mm_dd(TARGET_DATE)

    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=USER_DATA_DIR,
            headless=False,
            slow_mo=0,
            locale="ja-JP",
            timezone_id="Asia/Tokyo",
            args=["--disable-dev-shm-usage","--disable-gpu","--no-sandbox"],
        )
        page = ctx.new_page()
        page.on("console", _console_filter)
        page.set_default_navigation_timeout(30000)
        page.route("**/*", route_block)

        try:
            ok = book_single_date(page, target_dt)
            print("result:", ok)
        finally:
            input("終了するには Enter：")
            try: ctx.close()
            except Exception: pass

if __name__ == "__main__":
    main()
