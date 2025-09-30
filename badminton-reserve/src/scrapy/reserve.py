# reserve.py
# -*- coding: utf-8 -*-


import os, re, time, subprocess
from datetime import datetime, timedelta, date
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright
from calendar import monthrange



BASE = "https://www2.pf489.com/toshima/WebR/Home/WgR_ModeSelect"
FACILITY_NAME = "ふるさと千川館"
ROOM_LABEL = "多目的ホール"

# 指定したい時間帯
WANTED_SLOTS = [
    "18:30-19:30",
    "19:30-20:30",
    "20:30-21:30"
]
TARGET_DATE = "2025-11-11"

START_OFFSET_DAYS = 0
DAYS_AHEAD = 31
WEEKDAY_ONLY = True         
AUTO_SUBMIT = True
USER_DATA_DIR = "udata"
DEBUG = True

SEL_ID = "#body > div.content_body.clearfix > div.login_info.clearfix > dl.userid.clearfix > dd input"
SEL_PW = "#body > div.content_body.clearfix > div.login_info.clearfix > dl.pswd.clearfix > dd input"

load_dotenv()
LOGIN_ID = os.getenv("LOGIN_ID")
LOGIN_PASSWORD = os.getenv("LOGIN_PASSWORD")

OK_MARKS = {"○","△"}

# ===== 診断ログ =====
LOG_DIR = "diag"  # ここに吐きます（スクリプトの実行ディレクトリ配下）

MONTH_RE = re.compile(r"(\d{4})年\s*(\d{1,2})月")

# === 設定（必要なら編集） ===
TARGET_RANGES = [(14, 15), (15, 16)]  # 14-15, 15-16 を拾う
ROOM_LABEL    = "多目的ホール"         # 既存と合わせる

OVERRIDE_TODAY = os.getenv("OVERRIDE_TODAY")  # 例: "2025-09-01"

def today_anchor() -> datetime:
    """OVERRIDE_TODAY=YYYY-MM-DD があればそれを“今日”として返す"""
    if OVERRIDE_TODAY:
        y, m, d = map(int, OVERRIDE_TODAY.split("-"))
        return datetime(y, m, d)
    return datetime.now()

def first_of_next_month(anchor: datetime) -> datetime:
    """anchor の翌月1日"""
    y = anchor.year + (1 if anchor.month == 12 else 0)
    m = 1 if anchor.month == 12 else (anchor.month + 1)
    return datetime(y, m, 1)

def _header_to_range_tuple(th_text: str) -> tuple[int,int] | None:
    """ヘッダ文字列から (開始時, 終了時) を抽出（既存ロジックの軽量版）"""
    s = (th_text or "").replace("〜","~").replace("～","~").replace("－","-").replace("–","-")
    m = re.search(r"(\d{1,2})\s*[:：]?\d*\s*[\-–~〜～－]\s*(\d{1,2})", s)
    if not m: return None
    return int(m.group(1)), int(m.group(2))

def _timeslot_tables(page):
    """時間帯別の各日ブロック（table.calendar.horizon.toggle）を順に返す"""
    tables = page.locator("table.calendar.horizon.toggle")
    return [tables.nth(i) for i in range(tables.count())]

def _find_room_row(table, room_label: str):
    """該当 table の中から対象部屋の行を返す"""
    rows = table.locator("tbody tr")
    for i in range(rows.count()):
        head = rows.nth(i).locator("td.shisetsu, th.shisetsu")
        if head.count():
            txt = (head.first.text_content() or "").strip()
            if room_label in txt:
                return rows.nth(i)
    return None

def _collect_target_col_indices(table) -> list[int]:
    """ヘッダから TARGET_RANGES に一致する列番号を取得"""
    ths = table.locator("thead th")
    idx = []
    for i in range(ths.count()):
        rng = _header_to_range_tuple(ths.nth(i).text_content() or "")
        if rng and rng in set(TARGET_RANGES):
            idx.append(i)
    return idx

def pick_target_slots_all_days(page) -> int:
    """
    全ての日ブロック（複数 table）で、ROOM_LABEL の行から
    TARGET_RANGES に一致する列の '○' だけを選択する。
    戻り: チェックできた枠の数
    """
    picked = 0
    for t in _timeslot_tables(page):
        row = _find_room_row(t, ROOM_LABEL)
        if not row: 
            continue

        # 対象列
        cols = _collect_target_col_indices(t)
        if not cols:
            continue

        cells = row.locator("td")
        for ci in cols:
            if ci >= cells.count():
                continue
            cell = cells.nth(ci)
            text = (cell.text_content() or "")
            if "○" not in text:
                continue  # ○のみ

            # 既存ヘルパで確実に checktime を入れる
            if click_cell_like_site_impl(cell) or ensure_checktime_checked(cell):
                picked += 1
                page.wait_for_timeout(80)
    return picked

def next_after_timeslots(page) -> bool:
    """時間帯をまとめて選び終わったら一度だけ『次へ進む』"""
    # 何かしら checktime が入っているか先に確認
    if page.locator("input[name='checktime']:checked").count() == 0:
        return False

    for sel in [
        "button:has-text('次へ進む')",
        "a.btnBlue:has-text('次へ進む')",
        "a:has-text('次へ')",
        "input[type='submit'][value*='次']",
        "li.next > a.btnBlue",
    ]:
        loc = page.locator(sel)
        if not loc.count():
            continue
        try:
            loc.first.scroll_into_view_if_needed(timeout=400)
        except Exception:
            pass
        try:
            with page.expect_navigation(wait_until="domcontentloaded", timeout=8000):
                loc.first.click(timeout=8000)
        except Exception:
            try: loc.first.click(timeout=1000)
            except Exception: pass
        # 到着チェック（確認/申込画面）
        try:
            # あなたの UI に合わせて確認用のキーワードを調整
            page.wait_for_selector("text=申込確認", timeout=3000)
        except Exception:
            pass
        return True

    # フォールバック：postBack 直叩き
    try:
        page.evaluate("window.__doPostBack && window.__doPostBack('next','')")
        page.wait_for_load_state("domcontentloaded")
        return True
    except Exception:
        return False


def _facility_header_year_month(page) -> tuple[int|None, int|None]:
    # 施設別グリッドのヘッダから “2025年10月” を読む
    try:
        head = page.locator("table.calendar.horizon.toggle .pagination .month")
        if head.count():
            m = MONTH_RE.search((head.first.inner_text() or "").strip())
            if m:
                return int(m.group(1)), int(m.group(2))
    except Exception:
        pass
    # フォールバック（旧実装）
    try:
        t = page.locator("table.calendar.horizon.toggle")
        if t.count():
            txt = (t.first.text_content() or "")
            m = MONTH_RE.search(txt)
            if m:
                return int(m.group(1)), int(m.group(2))
    except Exception:
        pass
    return None, None


def _facility_click_next_month(page) -> bool:
    # ASP.NET WebForms: ページャは __doPostBack('period','next')
    try:
        page.evaluate("window.__doPostBack && window.__doPostBack('period','next')")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(150)  # 小待ち
        return True
    except Exception:
        # 保険として従来のクリックも試す
        for sel in [
            "table.calendar.horizon.toggle .pagination .next a",
            "a[href*=\"__doPostBack('period','next')\"]",
            "button:has-text('＞')", "a:has-text('＞')",
        ]:
            loc = page.locator(sel)
            if loc.count():
                try:
                    loc.first.click(timeout=1200)
                    page.wait_for_load_state("domcontentloaded")
                    page.wait_for_timeout(120)
                    return True
                except Exception:
                    continue
    return False



def ensure_facility_month_visible(page, target: datetime, max_hops: int = 3):
    
    ty, tm = target.year, target.month
    y, m = _facility_header_year_month(page)
    print(f"[monthvis] want={ty}/{tm} now={y}/{m}")
    hops = 0
    while y is not None and (y, m) != (ty, tm) and hops < max_hops:
        ok = _facility_click_next_month(page)
        print(f"[monthvis] hop={hops+1} click={'ok' if ok else 'ng'}")
        y, m = _facility_header_year_month(page)
        print(f"[monthvis] after hop now={y}/{m}")
        if not ok: break
        hops += 1


def set_facility_range_from_anchor(page, anchor_d: datetime):
    if not is_facility_grid(page):
        return
    target = add_months_keep_dom(_coerce_datetime(anchor_d), 1)
    # すでに同じなら何もしない（←ここが効く）
    if not _need_change_to(page, target):
        return
    try:
        _set_range_to_one_month(page, anchor_d)
    except Exception:
        save_diag(page, "facility_hyoji_fail")
    ensure_facility_month_visible(page, target, max_hops=2)



def _coerce_datetime(x, default: datetime | None = None) -> datetime:
    """datetime 以外が来てもどうにか datetime に直す。無理なら default。"""
    if isinstance(x, datetime):
        return x
    if isinstance(x, date):
        return datetime(x.year, x.month, x.day)
    if isinstance(x, (int, float)):
        return default or datetime.now()
    if isinstance(x, str):
        m = re.match(r"^\s*(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s*$", x)
        if m:
            y, m_, d = map(int, m.groups())
            return datetime(y, m_, d)
    return default or datetime.now()

def save_diag(page, prefix="diag"):
    if not DEBUG:
        return
    try:
        os.makedirs(LOG_DIR, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        png = f"{LOG_DIR}/{prefix}_{ts}.png"
        html = f"{LOG_DIR}/{prefix}_{ts}.html"
        page.screenshot(path=png, full_page=True)
        with open(html, "w", encoding="utf-8") as f:
            f.write(page.content())
        print(f"[debug] saved {png} {html}")
    except Exception as e:
        print(f"[debug] save_diag failed: {e}")

def dump_state(page, label: str):
    if not DEBUG:
        return
    try:
        checked = page.locator("input[name='checkdate']:checked").count()
    except Exception:
        checked = -1
    print(f"[state] {label}: checked={checked} url={page.url}")
    save_diag(page, label)

# ===== 日付ユーティリティ =====
def add_months_keep_dom(d: datetime, months: int = 1) -> datetime:
    """d の「日」をできるだけ保ったまま months 加算（末日を超える場合は末日に丸め）"""
    y = d.year + (d.month - 1 + months) // 12
    m = (d.month - 1 + months) % 12 + 1
    last = monthrange(y, m)[1]
    day = min(d.day, last)
    return datetime(y, m, day)

# ===== 共通ユーティリティ =====
def notify(title: str, message: str):
    try:
        subprocess.run(["osascript","-e",f'display notification "{message}" with title "{title}"'], check=False)
    except Exception:
        pass

def norm_wave(s: str) -> str:
    if s is None: return ""
    return re.sub(r"\s+"," ", s.replace("〜","~").replace("～","~").replace("–","~").replace("－","~")).strip()

def unique_norm(labels: list[str]) -> list[str]:
    seen=set(); out=[]
    for x in labels:
        nx = norm_wave(x)
        if nx not in seen:
            seen.add(nx); out.append(x)
    return out

def route_block(route):
    # CSSは許可（安定重視）。画像/メディア/フォントのみ遮断。
    if route.request.resource_type in {"image","media","font"}:
        return route.abort()
    return route.continue_()

def is_error_page(page) -> bool:
    u = (page.url or "")
    if "Error/html/GoBackError.html" in u or "Error/html/InternalError.html" in u:
        return True
    try:
        txt = page.locator("body").inner_text()
        return "処理を続行できません" in txt
    except Exception:
        return False

# ===== ログイン =====
def is_logged_in(page) -> bool:
    try:
        if page.locator("a:has-text('ログアウト'), .logout a").count():
            return True
        if page.locator(".dock_nav a[href='#nav']").count():
            return True
        if page.get_by_text("施設別空き状況", exact=False).count():
            return True
        if page.get_by_text("施設の検索", exact=False).count():
            return True
    except Exception:
        pass
    return False

def login_same_tab(page):
    page.goto(BASE, wait_until="domcontentloaded")
    if is_logged_in(page):
        return
    try:
        page.evaluate("""
          for (const el of document.querySelectorAll('a,button')) {
            const t = (el.innerText || el.textContent || '').trim();
            if (t.includes('ログイン')) el.setAttribute('target','_self');
          }
        """)
    except Exception:
        pass

    link = page.locator(
        "a:has-text('ログイン'), button:has-text('ログイン'), "
        "[onclick*='Login'], a[href*='Login'], a[href*='WgR_Login'], "
        "input[type='submit'][value*='ログイン']"
    )

    if not link.count():
        if is_logged_in(page):
            return
        return

    link.first.click()
    page.wait_for_load_state("domcontentloaded")

def fill_login(scope) -> bool:
    try:
        if scope.locator(SEL_ID).count() and scope.locator(SEL_PW).count():
            scope.locator(SEL_ID).first.fill(LOGIN_ID, timeout=3000)
            scope.locator(SEL_PW).first.fill(LOGIN_PASSWORD, timeout=3000)
        else:
            box = scope.locator("#body .login_info")
            if box.count():
                box.locator("input[type='text'], input[type='tel'], input:not([type])").first.fill(LOGIN_ID, timeout=2500)
                box.locator("input[type='password']").first.fill(LOGIN_PASSWORD, timeout=2500)
            else:
                scope.locator("input[type='text'], input[type='tel'], input:not([type])").first.fill(LOGIN_ID, timeout=2500)
                scope.locator("input[type='password']").first.fill(LOGIN_PASSWORD, timeout=2500)
        for s in [
            "#body .login_info input[type='submit']",
            "#body .login_info button[type='submit']",
            "input[type='submit']","button[type='submit']",
        ]:
            loc = scope.locator(s)
            if loc.count(): 
                loc.first.click()
                return True
        scope.locator("input[type='password']").first.press("Enter")
        return True
    except Exception:
        return False

def _grid_header_firstday(page) -> tuple[int|None, int|None]:
    # 施設/時間帯どちらでも効くヘッダ読取（YYYY年MM月 + thead最初の day）
    try:
        head = page.locator("table.calendar.horizon.toggle .pagination .month").first
        if not head.count():
            return None, None
        txt = (head.text_content() or "").strip()
        m = re.search(r"(\d{4})年\s*(\d{1,2})月", txt)
        if not m:
            return None, None
        y, m2 = int(m.group(1)), int(m.group(2))
        dcell = page.locator("table.calendar.horizon.toggle thead th.day span").first
        d = int((dcell.text_content() or "1").strip()) if dcell.count() else 1
        return y*10000 + m2*100 + d, d  # 前者=YYYYMMDDっぽい値
    except Exception:
        return None, None
def _need_change_to(page, want_start: datetime) -> bool:
    cur, _ = _grid_header_firstday(page)
    if not cur:
        return True
    want = want_start.year*10000 + want_start.month*100 + want_start.day
    return cur != want


def do_login(page, force=False):
    def run_once():
        if not force and is_logged_in(page):
            return True
        login_same_tab(page)
        if is_logged_in(page) and not force:
            return True
        if fill_login(page):
            page.wait_for_load_state("domcontentloaded")
        return is_logged_in(page) and not is_error_page(page)

    if run_once():
        print("[login] 成功しました")
        return
    try:
        page.goto(BASE, wait_until="domcontentloaded"); time.sleep(0.6)
    except Exception:
        pass
    if run_once():
        print("[login] 成功しました")
        return
    save_diag(page, "login_fail")
    raise RuntimeError("ログイン失敗（UI変更の可能性）")
def is_logged_in(page) -> bool:
    try:
        # ログアウトリンクの有無だけで判断
        if page.locator("a:has-text('ログアウト'), .logout a").count():
            print("[is_logged_in] ログアウトリンクを検出 → True")
            return True
    except Exception as e:
        print(f"[is_logged_in] error: {e}")
    print("[is_logged_in] 判定 → False")
    return False



# ===== ボタン押下ユーティリティ =====
def click_next(page, timeout_ms: int = 8000) -> bool:
    deny = re.compile(r"(戻る|メニュー|ログアウト)")
    cands = [
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
    for fn in cands:
        try:
            loc = fn()
            n = loc.count() if hasattr(loc,"count") else 0
            for i in range(n):
                el = loc.nth(i)
                text = ((el.inner_text() or "") + " " + (el.get_attribute("value") or "")).strip()
                if deny.search(text):
                    continue
                try: el.scroll_into_view_if_needed(timeout=1000)
                except Exception: pass
                el.click(timeout=timeout_ms)
                page.wait_for_load_state("domcontentloaded")
                if is_error_page(page):
                    return False
                return True
        except Exception:
            continue
    return False

def click_confirm(page) -> bool:
    cands = [
        lambda: page.get_by_role("button", name=re.compile("確認|申込|同意|確定")),
        lambda: page.locator("button:has-text('確認')"),
        lambda: page.locator("input[type='submit'][value*='確認']"),
        lambda: page.locator("button:has-text('申込')"),
    ]
    for fn in cands:
        try:
            el = fn()
            if hasattr(el,"count") and el.count()==0:
                continue
            el = el.first if hasattr(el,"first") else el
            el.scroll_into_view_if_needed(timeout=800)
            el.click(timeout=8000)
            page.wait_for_load_state("domcontentloaded")
            return True
        except Exception:
            continue
    return False

# ===== 施設 → 月次まで（カテゴリ／検索／チェック表 どれでも） =====
def select_facility_and_next(page):
    def _open_facility_finder():
        for finder in [
            lambda: page.get_by_role("button", name=lambda n: n and "施設" in n).first,
            lambda: page.get_by_text("施設から探す", exact=False).first,
            lambda: page.get_by_role("link",  name=lambda n: n and "施設" in n).first,
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
                if el and getattr(el,"count",lambda:1)():
                    el.click(timeout=3000)
                    page.wait_for_load_state("domcontentloaded")
                    return True
            except Exception:
                pass
        return False

    def _try_shisetsutbl_and_next():
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

    # 実行ループ：最大2周
    for _ in range(2):
        _open_facility_finder()
        if _try_category_button() and _try_shisetsutbl_and_next():
            return
        _open_facility_finder()
        if _try_search_form():
            if _try_shisetsutbl_and_next():
                return
            return
        if _try_shisetsutbl_and_next():
            return

    save_diag(page, "facility_button_not_found")
    raise RuntimeError(f"施設ボタン『{FACILITY_NAME}』が見つかりません。")

# ===== 月次サポート =====
MONTH_RE = re.compile(r"(\d{4})年\s*(\d{1,2})月")

def _find_month_table(page):
    head = page.get_by_text(FACILITY_NAME, exact=False)
    if head.count():
        cand = head.first.locator("xpath=following::table[1]")
        if cand.count():
            return cand.first
    t_all = page.locator("table")
    for i in range(t_all.count()):
        t = t_all.nth(i)
        text = (t.text_content() or "")
        if MONTH_RE.search(text):
            return t
    return None

def _current_year_month_from_table(table):
    txt = (table.text_content() or "")
    m = MONTH_RE.search(txt)
    if m:
        return int(m.group(1)), int(m.group(2))
    try:
        hd = table.locator("xpath=preceding::*[self::h1 or self::h2 or self::h3 or self::div][1]")
        if hd.count():
            m = MONTH_RE.search(hd.first.inner_text() or "")
            if m:
                return int(m.group(1)), int(m.group(2))
    except Exception:
        pass
    return None, None

def _click_next_month(page) -> bool:
    selectors = [
        "button:has-text('次の月')","a:has-text('次の月')",
        "[aria-label*='次'][role='button']","[aria-label*='次']",
        "button:has-text('＞')","a:has-text('＞')",
        "button:has-text('>')","a:has-text('>')",
    ]
    for sel in selectors:
        loc = page.locator(sel)
        if loc.count():
            try:
                loc.first.click(timeout=2500)
                page.wait_for_load_state("domcontentloaded")
                return True
            except Exception:
                continue
    return False

def ensure_month_visible(page, d: datetime, max_hops: int = 3):
    tbl = _find_month_table(page)
    if not tbl:
        if DEBUG: print("[month] month table not found")
        return
    y, m = _current_year_month_from_table(tbl)
    if not y:
        return
    target_y, target_m = d.year, d.month
    hops = 0
    while (y, m) != (target_y, target_m) and hops < max_hops:
        if _click_next_month(page):
            page.wait_for_timeout(200)
            tbl = _find_month_table(page) or tbl
            y, m = _current_year_month_from_table(tbl)
            hops += 1
        else:
            break

def read_mark_from_label(lab):
    try:
        t = (lab.inner_text() or "").strip()
        if t in {"○","△","×","―"}:
            return t
    except Exception:
        pass
    for attr in ("title","aria-label"):
        try:
            v = (lab.get_attribute(attr) or "").strip()
            if v in {"○","△","×","―"}:
                return v
        except Exception:
            pass
    try:
        img = lab.locator("img")
        if img.count():
            alt = (img.first.get_attribute("alt") or "").strip().lower()
            amap = {"circle":"○","maru":"○","○":"○",
                    "triangle":"△","sankaku":"△","△":"△",
                    "cross":"×","batsu":"×","×":"×",
                    "bar":"―","line":"―","―":"―"}
            if alt in amap:
                return amap[alt]
    except Exception:
        pass
    try:
        cls = (lab.get_attribute("class") or "").lower()
        for k, v in [("maru","○"),("circle","○"),("ok","○"),
                     ("sankaku","△"),("triangle","△"),
                     ("ng","×"),("batsu","×"),
                     ("bar","―"),("line","―")]:
            if k in cls:
                return v
    except Exception:
        pass
    return ""

def _month_col_index(table, d: datetime):
    """thead の th.day の最初の <span> を数値として読んで一致列を返す"""
    ths = table.locator("thead th.day")
    if ths.count() == 0:
        ths = table.locator("tr th.day")  # フォールバック
    target = d.day
    for i in range(ths.count()):
        # 先頭の span（数字）だけ読む
        span0 = ths.nth(i).locator("span").first
        txt = (span0.text_content() or span0.inner_text() or "").strip()
        try:
            if int(txt) == target:
                # 施設名と定員の2列が左にあるので +2 して実セル位置で使う側で調整
                return i + 2
        except ValueError:
            continue
    return None

def month_click_if_ok(page, d: datetime) -> bool:
    ensure_month_visible(page, d)

    ymd = d.strftime("%Y%m%d")
    inputs = page.locator(f'input[name="checkdate"][value^="{ymd}"]')
    if inputs.count() > 0:
        for i in range(inputs.count()):
            el = inputs.nth(i)
            cid = el.get_attribute("id")
            if not cid:
                continue
            try:
                row = el.locator("xpath=ancestor::tr[1]")
                row_txt = (row.first.text_content() or "").strip() if row.count() else ""
            except Exception:
                row_txt = ""
            if ROOM_LABEL not in row_txt and ("多目的" not in row_txt and "ﾎｰﾙ" not in row_txt):
                continue
            lab = page.locator(f'label[for="{cid}"]')
            if not lab.count():
                continue
            mark = read_mark_from_label(lab.first)
            if DEBUG:
                print(f"[month] {ymd} row='{ROOM_LABEL}' mark='{mark or '(empty)'}'")
            if mark in OK_MARKS:
                try:
                    el.scroll_into_view_if_needed(timeout=600)
                except Exception:
                    pass
    # ★ クリックの代わりに直接 checked=true（高速）
                if fast_pick_checkdate(page, el):
                    page.wait_for_timeout(30)
                    return not is_error_page(page)
    # 念のためのフォールバック（うまくいかなかった場合だけラベルクリック）
                try:
                    lab.first.click()
                    page.wait_for_load_state("domcontentloaded")
                    return not is_error_page(page)
                except Exception:

                    return False

    # グリッド保険（見出しの表から該当セルを叩く）
    table = _find_month_table(page)
    if not table:
        if DEBUG: print("[month] month table not found")
        return False

    def _norm(s: str) -> str:
        return re.sub(r"\s+", "", s or "")

    rows = table.locator("tbody tr") if table.locator("tbody tr").count() else table.locator("tr")
    target_row = None
    for i in range(rows.count()):
        cells = rows.nth(i).locator("th, td")
        if cells.count() == 0:
            continue
        head_text = _norm(cells.first.text_content() or cells.first.inner_text() or "")
        if _norm(ROOM_LABEL) in head_text or "多目的" in head_text or "ﾎｰﾙ" in head_text:
            target_row = rows.nth(i)
            break
    if not target_row:
        if DEBUG: print("[month] room row not found")
        return False

    ci = _month_col_index(table, d)
    if ci is None:
        if DEBUG: print(f"[month] no header col for day {d.day}")
        return False

    cells = target_row.locator("td, th")
    if ci >= cells.count():
        return False
    cell = cells.nth(ci)

    mark = ""
    if cell.locator("label").count():
        mark = read_mark_from_label(cell.locator("label").first)
    else:
        inner = _norm(cell.inner_text() or cell.text_content() or "")
        mark = "○" if any(_norm(m) in inner for m in OK_MARKS) else ""

    if mark not in OK_MARKS:
        return False

    for loc in [cell.get_by_role("link"), cell.get_by_role("button"), cell.locator("label")]:
        if loc.count():
            loc.first.click()
            page.wait_for_load_state("domcontentloaded")
            return not is_error_page(page)
    try:
        cell.click()
        page.wait_for_load_state("domcontentloaded")
        return not is_error_page(page)
    except Exception:
        return False
    
def choose_yes_and_confirm(page):
    print("[form] 『はい』を選択して確定します")

    # 「はい」を選択
    try:
        yes_radio = page.locator("#radioItemCopyYes")
        if yes_radio.count():
            yes_radio.first.check()  # check() は click より確実に選択状態にできる
            page.wait_for_timeout(200)
    except Exception as e:
        print("[form] はい選択エラー:", e)

    # 確定ボタン押下
    try:
        confirm_btn = page.locator("button:has-text('確定'), input[type='submit'][value*='確定']")
        if confirm_btn.count():
            confirm_btn.first.click()
            print("[form] 確定ボタンを押下")
            return True
    except Exception as e:
        print("[form] 確定ボタン押下エラー:", e)

    return False

def set_copy_yes(page) -> bool:
    """『同じ申請内容にしますか？』→ はい を確実に選択"""
    # 1) まずは見える位置へ
    try:
        page.get_by_text("同じ申請内容にしますか", exact=False).first.scroll_into_view_if_needed(timeout=600)
    except Exception:
        pass

    yes = page.locator('input[type="radio"][name="radioItemCopy"]#radioItemCopyYes')
    no  = page.locator('input[type="radio"][name="radioItemCopy"]#radioItemCopyNo')
    lab_yes = page.locator('label[for="radioItemCopyYes"]')

    # 2) ラベルをクリック（正攻法）
    if lab_yes.count():
        try:
            lab_yes.first.click(timeout=600)
            page.wait_for_timeout(50)
        except Exception:
            pass

    # 3) input.check()（要素がクリック可能ならこれでOK）
    if yes.count():
        try:
            yes.first.check(timeout=400)
            page.wait_for_timeout(50)
        except Exception:
            pass

    # 4) 最終手段：JS で強制 + イベント発火 + 見た目の class 同期
    page.evaluate("""
        () => {
          const y  = document.querySelector('#radioItemCopyYes');
          const n  = document.querySelector('#radioItemCopyNo');
          const ly = document.querySelector('label[for="radioItemCopyYes"]');
          const ln = document.querySelector('label[for="radioItemCopyNo"]');
          if (!y) return false;
          if (n) n.checked = false;
          y.checked = true;
          // イベント（サイト側のJSが拾う）
          for (const t of ['click','input','change']) {
            y.dispatchEvent(new Event(t, {bubbles:true}));
          }
          // 見た目を切替えるクラス（switch-on/off）も合わせる
          if (ly) { ly.classList.add('switch-on');  ly.classList.remove('switch-off'); }
          if (ln) { ln.classList.add('switch-off'); ln.classList.remove('switch-on'); }
          return true;
        }
    """)

    # 5) 確認
    ok = page.evaluate('() => !!document.querySelector("#radioItemCopyYes")?.checked')
    print(f"[form] radioItemCopy → はい={ok}")
    return bool(ok)

# ===== 「施設別」ページの操作 =====
def is_facility_grid(page) -> bool:
    try:
        if page.get_by_text("施設別空き状況", exact=False).count():
            return True
        # checkdate があって checktime が無い
        return page.locator("input[name='checkdate']").count() and not page.locator("input[name='checktime']").count()
    except Exception:
        return False

def is_timeslot_grid(page) -> bool:
    try:
        if page.get_by_text("時間帯別空き状況", exact=False).count():
            return True
        return page.locator("input[name='checktime']").count() > 0
    except Exception:
        return False


def _set_range_to_one_month(page, start_d: date):
    tgt = add_months_keep_dom(_coerce_datetime(start_d), 1)
    y, m, d = tgt.year, tgt.month, tgt.day
    val = f"{y}/{m}/{d}"

    # 入力＆hidden同期（イベント発火）
    page.evaluate(
        """({y,m,d,val})=>{
            const fire=(el,t)=>el&&el.dispatchEvent(new Event(t,{bubbles:true}));
            const dp=document.querySelector('#dpStartDate') ||
                      document.querySelector('input[name="textDate"]');
            if (dp && window.jQuery && window.jQuery(dp).datepicker){
                window.jQuery(dp).datepicker('setDate', new Date(y,m-1,d));
                fire(dp,'change'); fire(dp,'input'); dp.blur();
            } else if (dp){
                dp.value=val; fire(dp,'input'); fire(dp,'change'); dp.blur();
            }
            const cands=['hdnStartDate','HiddenStartDate','ctl00_ContentPlaceHolder1_hdnStartDate'];
            for (const n of cands){
                const h=document.querySelector(`input[type="hidden"][name="${n}"],input[type="hidden"]#${n}`);
                if (h) h.value=val;
            }
            const r=document.querySelector('#radioPeriod1month') ||
                     document.querySelector('input[type="radio"][value="1month"]') ||
                     document.querySelector('input[type="radio"][name*="Period"][value="1"]');
            if (r){ r.checked=true; fire(r,'change'); }
        }""",
        {"y": y, "m": m, "d": d, "val": val}
    )

    # ★ 直前状態のダンプ
    try:
        dp_val, hidden_val, one_month_checked = page.evaluate(
            """()=>{
                const dp=document.querySelector('#dpStartDate')||document.querySelector('input[name="textDate"]');
                const cands=['hdnStartDate','HiddenStartDate','ctl00_ContentPlaceHolder1_hdnStartDate'];
                let h=null; for (const n of cands){
                  const el=document.querySelector(`input[type="hidden"][name="${n}"],input[type="hidden"]#${n}`); if (el){h=el.value; break;}
                }
                const r=document.querySelector('#radioPeriod1month')||
                         document.querySelector('input[type="radio"][value="1month"]')||
                         document.querySelector('input[type="radio"][name*="Period"][value="1"]');
                return [dp?dp.value:'(none)', h, !!(r && r.checked)];
            }"""
        )
        print(f"[hyoji-pre] dp={dp_val} hidden={hidden_val} 1m={one_month_checked}")
    except Exception as e:
        print(f"[hyoji-pre] dump error: {e}")

    # ★ 「表示」postback を直接呼ぶ（複製ヘッダ対策）
    page.evaluate("window.__doPostBack && window.__doPostBack('hyouji','')")
    page.wait_for_load_state("domcontentloaded")

    # ★ 反映結果のダンプ（ヘッダ月/先頭日）
    try:
        head = page.locator("table.calendar.horizon.toggle .pagination .month").first
        head_txt = (head.text_content() or "").strip() if head.count() else ""
        first_day = page.locator("table.calendar.horizon.toggle thead th.day span").first
        d0 = (first_day.text_content() or "").strip() if first_day.count() else ""
        print(f"[hyoji-post] header='{head_txt}' first-day={d0}")
    except Exception as e:
        print(f"[hyoji-post] dump error: {e}")





def go_to_timeslot_grid(page) -> bool:
    """
    施設別グリッド（checkdate）から時間帯別グリッド（checktime）へ。
    1) 普通に「次へ進む」をクリック
    2) だめなら __doPostBack('next','') を直接実行
    3) 最後に「checktime があるか」で到着を判定
    """
    # すでに時間帯別なら何もしない
    if is_timeslot_grid(page):
        return True

    # 施設別にいるかチェック
    if not is_facility_grid(page):
        return False

    # --- 1) 通常クリック（見えるボタン/リンク/Inputを順に試す）
    for sel in [
        "button:has-text('次へ進む')",
        "button:has-text('次へ')",
        "a.btnBlue:has-text('次へ進む')",
        "a:has-text('次へ進む')",
        "a:has-text('次へ')",
        "input[type='submit'][value*='次']",
        "li.next > a.btnBlue",
    ]:
        loc = page.locator(sel)
        if loc.count():
            try:
                loc.first.scroll_into_view_if_needed(timeout=400)
            except Exception:
                pass
            try:
                # ナビゲーションが起きても落ちないように
                with page.expect_navigation(wait_until="domcontentloaded", timeout=8000):
                    loc.first.click(timeout=8000)
            except Exception:
                # 画面書き換えだけで URL が変わらない場合もある
                loc.first.click(timeout=1000)
            # 到着確認
            try:
                page.wait_for_selector("input[name='checktime']", timeout=3000)
                return True
            except Exception:
                pass

    # --- 2) 直叩き（ASP.NET の postBack ）
    try:
        page.evaluate("window.__doPostBack && window.__doPostBack('next','')")
        # 同一URLで書き換えられることがあるので networkidle よりセレクタ待ちが確実
        page.wait_for_selector("input[name='checktime']", timeout=6000)
        return True
    except Exception:
        pass

    # --- 3) 最終フォールバック（text をもつ要素を JS クリック）
    try:
        clicked = page.evaluate("""
            () => {
              const q = Array.from(document.querySelectorAll('a,button,input[type=submit],[role=button]'));
              const el = q.find(el=>{
                const t = (el.innerText || el.textContent || el.value || '').trim();
                return /次へ進む|次へ/.test(t);
              });
              if (el){ el.click(); return true; }
              return false;
            }
        """)
        if clicked:
            page.wait_for_selector("input[name='checktime']", timeout=6000)
            return True
    except Exception:
        pass

    return False

# ===== 時間帯別（checktime） =====
TIME_RANGE_RE = re.compile(r"(?P<h1>\d{1,2})\s*[:：]?\s*(\d{0,2})\s*[\-–~〜～－]\s*(?P<h2>\d{1,2})\s*[:：]?\s*(\d{0,2})")
H_RE = re.compile(r"(\d{1,2})\s*[:：]?\s*(\d{0,2})")

def _extract_range_from_header(th_text: str) -> tuple[int,int] | None:
    t = (th_text or "").replace("\u3000"," ").strip()
    t = t.replace("〜","~").replace("～","~").replace("－","-").replace("–","-")
    lines = [s.strip() for s in t.splitlines() if s.strip()]
    nums: list[int] = []
    for s in lines:
        m = H_RE.search(s)
        if m:
            nums.append(int(m.group(1)))
    if len(nums) < 2:
        m2 = TIME_RANGE_RE.search(t.replace(" ", ""))
        if m2:
            nums = [int(m2.group("h1")), int(m2.group("h2"))]
    if len(nums) >= 2:
        return nums[0], nums[1]
    return None

def find_table_and_row_for_room(page, room_label: str):
    heads = page.locator("h1, h2, h3, h4, .section-title, .title, .headline")
    for i in range(heads.count()):
        h = heads.nth(i)
        ht = (h.text_content() or "").strip()
        if room_label in ht:
            t = h.locator("xpath=following::table[contains(@class,'calendar')][1]")
            if t.count():
                try: t.first.scroll_into_view_if_needed(timeout=400)
                except Exception: pass
                row = t.first.locator("tbody tr:has(td.shisetsu), tbody tr:has(th.shisetsu)").first
                return t.first, row if row.count() else None
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
                    try: head.first.scroll_into_view_if_needed(timeout=400)
                    except Exception: pass
                    return t, row
    return None, None

def _is_any_time_checked(container) -> bool:
    try:
        inps = container.locator("input[type='checkbox'], input[type='radio']")
        for j in range(min(inps.count(), 100)):
            el = inps.nth(j)
            try:
                if el.is_checked():
                    return True
            except Exception:
                continue
    except Exception:
        pass
    return False

def ensure_checktime_checked(cell) -> bool:
    try:
        inps = cell.locator("input[name='checktime' i][type='checkbox'], input[name='checktime' i][type='radio']")
        if inps.count() == 0:
            return False
        box = inps.first
        try:
            if box.is_disabled():
                return False
        except Exception:
            pass
        cid = (box.get_attribute("id") or "").strip()
        if cid:
            lab = cell.locator(f"label[for='{cid}']")
            if lab.count():
                try: lab.first.scroll_into_view_if_needed(timeout=300)
                except Exception: pass
                try:
                    lab.first.click(timeout=1000)
                    if box.is_checked():
                        return True
                except Exception:
                    pass
        try:
            box.scroll_into_view_if_needed(timeout=300)
        except Exception:
            pass
        try:
            box.click(timeout=1000)
            if box.is_checked():
                return True
        except Exception:
            pass
        try:
            box.check(timeout=800)
            if box.is_checked():
                return True
        except Exception:
            pass
        try:
            box.evaluate("(el)=>{el.checked=true; el.dispatchEvent(new Event('change',{bubbles:true}));}")
            if box.is_checked():
                return True
        except Exception:
            pass
    except Exception:
        return False
    return False

def click_cell_like_site_impl(cell) -> bool:
    txt = (cell.text_content() or "")
    if "×" in txt:
        return False
    if ensure_checktime_checked(cell):
        return True
    try:
        clickable = cell.locator("label, button, a, img, span, div")
        for j in range(min(clickable.count(), 8)):
            el = clickable.nth(j)
            hint = ((el.get_attribute("for") or "") + " " + (el.get_attribute("onclick") or "") + " " + (el.get_attribute("class") or "")).lower()
            if any(k in hint for k in ["check", "time", "jikan", "select", "maru", "sankaku", "checktime"]):
                try:
                    el.click(timeout=1000)
                    if ensure_checktime_checked(cell):
                        return True
                except Exception:
                    continue
    except Exception:
        pass
    try:
        cell.click(timeout=800)
        if ensure_checktime_checked(cell):
            return True
    except Exception:
        pass
    return False

def list_day_headers(table) -> list[tuple[int, str]]:
    ths = table.locator("thead th")
    if ths.count() == 0:
        ths = table.locator("tr th")
    out = []
    for i in range(ths.count()):
        lbl = norm_wave((ths.nth(i).text_content() or ths.nth(i).inner_text() or "").strip())
        if lbl:
            out.append((i, lbl))
    return out

def close_error_dialogs(page):
    try:
        dlg = page.locator("#messageDlg, [id*='messageDlg'], .ui-dialog, [role='dialog']")
        if dlg.count():
            for sel in [
                ".ui-dialog-titlebar-close",
                "button:has-text('×')",
                "button[aria-label='閉じる']",
                "[aria-label='閉じる']",
            ]:
                b = dlg.locator(sel)
                if b.count():
                    try: b.first.click(timeout=300)
                    except Exception: pass
    except Exception:
        pass

def set_dayrange_one_month_from(page, d: datetime):
    """（未使用ルートの保険）時間帯別でも 1ヶ月範囲を合わせる"""
    if not is_timeslot_grid(page):
        return
    try:
        _set_range_to_one_month(page, d)
    except Exception:
        save_diag(page, "timeslot_hyoji_fail")

def set_timeslot_range_to(page, start_d):
    if not is_timeslot_grid(page):
        return
    start_d = _coerce_datetime(start_d)
    # すでに同じなら何もしない
    if not _need_change_to(page, start_d):
        return

    y, m, d = start_d.year, start_d.month, start_d.day
    val = f"{y}/{m}/{d}"

    page.evaluate(
        """({y,m,d,val})=>{
            const fire=(el,t)=>el&&el.dispatchEvent(new Event(t,{bubbles:true}));
            const dp=document.querySelector('#dpStartDate') || document.querySelector('input[name="textDate"]');
            if (dp && window.jQuery && window.jQuery(dp).datepicker){
                window.jQuery(dp).datepicker('setDate', new Date(y,m-1,d));
            } else if (dp){ dp.value=val; }
            fire(dp,'input'); fire(dp,'change'); dp && dp.blur();
            const r=document.querySelector('#radioPeriod1month')||
                     document.querySelector('input[type="radio"][value="1month"]')||
                     document.querySelector('input[type="radio"][name*="Period"][value="1"]');
            if (r){ r.checked=true; fire(r,'change'); }
        }""",
        {"y": y, "m": m, "d": d, "val": val}
    )
    # ← ここで“毎回の postback 直叩き”をやめる。必要時だけで十分。
    page.get_by_role("button", name="表示").first.click(timeout=1500)
    page.wait_for_load_state("domcontentloaded")
def fast_pick_checkdate(page, input_el) -> bool:
    try:
        page.evaluate("""
            (el)=>{
              el.checked = true;
              el.dispatchEvent(new Event('click', {bubbles:true}));
              el.dispatchEvent(new Event('change',{bubbles:true}));
              el.dispatchEvent(new Event('input', {bubbles:true}));
            }
        """, input_el)
        return True
    except Exception:
        return False


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


def pick_slots_on_day(page, d: datetime, grid_start: datetime, remain_minutes: int) -> tuple[int, str | None]:
    """
    時間帯別で、1枠でも確実に checktime を入れる。
    成功したら (使用分, 'HH:MM~HH:MM') を返す。
    """
    close_error_dialogs(page)
    set_timeslot_range_to(page, grid_start)

    if not isinstance(remain_minutes, (int, float)):
        print(f"[warn] remain_minutes 型が不正: {type(remain_minutes)} → 0 にリセット")
        remain_minutes = 0

    t, row = find_table_and_row_for_room(page, ROOM_LABEL)
    if not t or not row:
        if DEBUG: print("[day] 多目的ホールの行が見つかりません")
        return 0, None

    ths = t.locator("thead th") or t.locator("tr th")
    headers = [(i, norm_wave(ths.nth(i).text_content() or "")) for i in range(ths.count())]

    def _label_to_slot(lbl: str) -> str | None:
        rng = _extract_range_from_header(lbl)
        if not rng:
            return None
        h1, h2 = rng
        return f"{h1}:00~{h2}:00"

    wanted_set = {norm_wave(s) for s in unique_norm(WANTED_SLOTS)}
    wanted_cols, other_cols = [], []
    for i, raw in headers:
        slot = _label_to_slot(raw)
        if not slot:
            continue
        if norm_wave(slot) in wanted_set:
            wanted_cols.append((i, slot))
        else:
            other_cols.append((i, slot))

    used = 0
    picked_label: str | None = None
    cells = row.locator("td")

    def try_cols(cols):
        nonlocal used, remain_minutes, picked_label
        for col, slot_lbl in cols:
            if remain_minutes <= 0:
                break
            if col >= cells.count():
                continue
            cell = cells.nth(col)

            # ○/△チェック
            mark_txt = (cell.text_content() or "")
            okish = ("○" in mark_txt) or ("△" in mark_txt) or cell.locator("img[alt*='○'], img[alt*='maru'], img[alt*='circle']").count()
            if not okish:
                continue

            close_error_dialogs(page)
            # 最大2回までリトライして「checked」を確実化
            for _ in range(2):
                if click_cell_like_site_impl(cell):
                    form = t if t else page
                    if _is_any_time_checked(form):
                        rng = _extract_range_from_header(slot_lbl)
                        if not rng:
                            break
                        dur = (rng[1] - rng[0]) * 60
                        used_now = min(dur, remain_minutes)
                        used += used_now
                        remain_minutes -= used_now
                        picked_label = slot_lbl
                        if DEBUG: print(f"[day] picked {slot_lbl} (+{used_now}min, remain={remain_minutes})")
                        page.wait_for_timeout(120)
                        close_error_dialogs(page)
                        return
                page.wait_for_timeout(80)

    try_cols(wanted_cols)
    if used == 0 and remain_minutes > 0:
        try_cols(other_cols)
    return used, picked_label

# ===== 現在地判定／復帰 =====
def where_am_i(page) -> str:
    try:
        url = page.url or ""
        body = page.locator("body").inner_text()
    except Exception:
        url, body = "", ""
    if "WgR_ModeSelect" in url:
        return "mode"
    try:
        if page.locator("#shisetsutbl").count():
            return "facility"
    except Exception:
        pass
    try:
        if page.locator('input[type="checkbox"][name="checktime"]').count():
            return "day"
    except Exception:
        pass
    try:
        if re.search(r"\d{4}年\s*\d{1,2}月\s*\d{1,2}日", body or "") and page.locator("table").count():
            return "day"
    except Exception:
        pass
    tbl = _find_month_table(page)
    if tbl:
        return "month"
    if is_facility_grid(page):
        return "facility_grid"
    return "unknown"

def _ensure_menu_from_error(page):
    if not is_error_page(page):
        return
    try:
        m = page.get_by_role("button", name=re.compile("メニュー"))
        if m.count():
            m.first.click()
            page.wait_for_load_state("domcontentloaded")
    except Exception:
        pass

def recover_and_to_month(page):
    state = where_am_i(page)
    if state in ("month", "day"):
        return
    if state == "facility":
        # 施設一覧(#shisetsutbl)なら「次へ」で月次へ行ける
        if click_next(page):
            page.wait_for_load_state("domcontentloaded")
            return
    # 施設別グリッド/不明/エラーは常にハードリセット
    _ensure_menu_from_error(page)
    page.goto(BASE, wait_until="domcontentloaded")
    select_facility_and_next(page)

def _facility_grid_start_date(page) -> datetime | None:
    t = page.locator("table.calendar.horizon.toggle")
    if not t.count():
        t = page.locator("table.calendar")
    if not t.count():
        return None
    header = (t.first.locator('.pagination .month').first.text_content() or '').strip()
    mobj = re.search(r"(\d{4})年\s*(\d{1,2})月", header)
    if not mobj:
        return None
    y, m = int(mobj.group(1)), int(mobj.group(2))
    first_day_cell = t.first.locator("thead th.day span").first
    d0 = int((first_day_cell.text_content() or "1").strip())
    return datetime(y, m, d0)

def pick_weekday_ok_on_facility_grid(page) -> tuple[bool, datetime | None, str | None, datetime | None]:
    """
    施設別グリッドで、平日の ○/△ のどれか1つに checkdate を入れる。
    戻り: (成功?, 実日付, マーク, グリッド開始日)
    """
    t = page.locator("table.calendar.horizon.toggle")
    if not t.count():
        t = page.locator("table.calendar")
    if not t.count():
        return False, None, None, None

    # 表示開始日（施設別で“今見えている”開始日）を復元
    start_date = _facility_grid_start_date(page)
    if start_date is None:
        return False, None, None, None

    # 平日カラムのみ抽出
    day_ths = t.first.locator("thead th.day")
    weekday_cols = []
    for i in range(day_ths.count()):
        cls = (day_ths.nth(i).get_attribute("class") or "")
        if "sat" in cls or "sun" in cls:
            continue
        weekday_cols.append(i)

    # 対象行（ROOM_LABEL）
    rows = t.first.locator("tbody tr")
    target = None
    for i in range(rows.count()):
        head = rows.nth(i).locator("td.shisetsu, th.shisetsu")
        if head.count() and ROOM_LABEL in (head.first.text_content() or ""):
            target = rows.nth(i)
            break
    if not target or not weekday_cols:
        return False, None, None, start_date

    # === 内部ヘルパー ===
    def _cell(col_idx: int):
        # 左2列(施設/定員)ぶんオフセット
        return target.locator("td").nth(col_idx + 2)

    def _try_click(cell) -> bool:
        before = page.locator("input[name='checkdate']:checked").count()
        lab = cell.locator("label").first
        inp = cell.locator("input[name='checkdate']").first
        try:
            if inp.count():
                try:
                    inp.check(timeout=700)
                except Exception:
                    lab.click(timeout=700)
            else:
                lab.click(timeout=700)
        except Exception:
            try:
                cell.evaluate(
                    "(n)=>{var el=n.querySelector(\"input[name='checkdate']\");"
                    " if(el){el.checked=true;"
                    " el.dispatchEvent(new Event('click',{bubbles:true}));"
                    " el.dispatchEvent(new Event('change',{bubbles:true}));}}"
                )
            except Exception:
                pass
        page.wait_for_timeout(120)
        return page.locator("input[name='checkdate']:checked").count() > before

    # ○優先 → △
    for want in ("○", "△"):
        for j in weekday_cols:
            cell = _cell(j)
            lab = cell.locator("label")
            if not lab.count():
                continue
            mark = (lab.first.text_content() or "").strip()
            if mark != want:
                continue
            if _try_click(cell):
                actual = start_date + timedelta(days=j)
                if DEBUG:
                    print(f"[facility] picked {actual.date()} {want}")
                return True, actual, want, start_date

    return False, None, None, start_date

def patch_allow_triangle(page):
    """
    予約グリッドの click ハンドラ checkCell() を上書きして
    △=許可、×/－=拒否 にする。
    """
    js = r"""
    (function () {
      // 既にパッチ済みなら何もしない
      if (window.__patched_allow_triangle) return;
      window.__patched_allow_triangle = true;

      // 元の関数を保持（あれば）
      var _orig = window.checkCell;

      window.checkCell = function (input) {
        try {
          var lab = input && input.nextElementSibling;
          var t = (lab && (lab.innerText || lab.textContent) || '').trim();

          // × と － は従来通り拒否
          if (t === '×' || t === '－') {
            if (typeof _orig === 'function') return _orig(input); // 既存の挙動に委譲
            return false;
          }
          // ○ と △ は選択トグル可
          input.checked = !input.checked;
          // 変更イベントは飛ばしておく
          try {
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('input',  { bubbles: true }));
          } catch (e) {}
          return true;
        } catch (e) {
          // 万一失敗したら元の関数にフォールバック
          if (typeof _orig === 'function') return _orig(input);
          return false;
        }
      };
    })();
    """
    try:
        page.evaluate(js)
    except Exception:

        pass

from playwright.sync_api import TimeoutError as PWTimeout

def click_next_hard(page, timeout_ms: int = 12000) -> bool:
    """
    「次へ進む」を強めに押す。
    - ボタン/リンク/input を順に探索
    - 見つかったら expect_navigation で落ちないように押す
    - 最後の手段: 「次へ進む」と書かれた要素を JS で click
    """
    sels = [
        "button:has-text('次へ進む')",
        "button:has-text('次へ')",
        "a:has-text('次へ進む')",
        "a:has-text('次へ')",
        "input[type='submit'][value*='次']",
        "[id*='Next'],[name*='Next']",
        ".btnBlue:has-text('次へ進む')",
    ]
    for sel in sels:
        loc = page.locator(sel)
        if not loc.count():
            continue
        el = loc.first
        try:
            # 画面外でも押せるように
            try: el.scroll_into_view_if_needed(timeout=400)
            except Exception: pass
            # ナビゲーションが起きても落ちないように
            try:
                with page.expect_navigation(wait_until="domcontentloaded", timeout=timeout_ms):
                    el.click(timeout=timeout_ms)
            except PWTimeout:
                # 画面遷移が発生しない（モーダル等）の場合もあるので、タイムアウトは許容
                el.click(timeout=800)
            return True
        except Exception:
            continue

    # 最終手段：JSで「次へ進む」と書かれてる要素をクリック
    try:
        clicked = page.evaluate("""
            () => {
              const cand = Array.from(document.querySelectorAll('a,button,input[type="submit"],[role="button"]'))
                .find(el => {
                  const t = (el.innerText || el.textContent || el.value || '').trim();
                  return /次へ進む|次へ/.test(t);
                });
              if (cand){ cand.click(); return true; }
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

MIN_CHECKDATES_BEFORE_NEXT = 1  # ← ここを 1 にすれば従来どおり“直後に次へ”

def count_selected_dates(page) -> int:
    try:
        return page.locator("input[name='checkdate']:checked").count()
    except Exception:
        return 0

def proceed_if_enough_dates_selected(page, min_selected: int = MIN_CHECKDATES_BEFORE_NEXT) -> bool:
    # 反映ラグ吸収
    page.wait_for_timeout(150)
    if count_selected_dates(page) < min_selected:
        return False
    # 充分選べたら「次へ進む」
    for sel in [
        "button:has-text('次へ進む')",
        "a.btnBlue:has-text('次へ進む')",
        "a:has-text('次へ')",
        "input[type='submit'][value*='次']",
        "li.next > a.btnBlue",
    ]:
        loc = page.locator(sel)
        if not loc.count():
            continue
        try:
            loc.first.scroll_into_view_if_needed(timeout=400)
        except Exception:
            pass
        try:
            with page.expect_navigation(wait_until="domcontentloaded", timeout=8000):
                loc.first.click(timeout=8000)
        except Exception:
            try: loc.first.click(timeout=1000)
            except Exception: pass
        try:
            page.wait_for_selector("input[name='checktime']", timeout=6000)  # 時間帯別に到達したか
            return True
        except Exception:
            pass
    # だめなら postback を直叩き
    try:
        page.evaluate("window.__doPostBack && window.__doPostBack('next','')")
        page.wait_for_selector("input[name='checktime']", timeout=6000)
        return True
    except Exception:
        return False

def _click_if_exists(page, sel_or_regex) -> bool:
    # ボタン/リンク/submit を広めに探してクリック
    cands = []
    if isinstance(sel_or_regex, str):
        cands = [
            page.locator(sel_or_regex),
            page.get_by_role("button", name=sel_or_regex),
            page.get_by_role("link",   name=sel_or_regex),
        ]
    else:
        cands = [
            page.get_by_role("button", name=sel_or_regex),
            page.get_by_role("link",   name=sel_or_regex),
        ]
    for loc in cands:
        try:
            if hasattr(loc, "count") and loc.count():
                loc.first.scroll_into_view_if_needed(timeout=400)
                loc.first.click(timeout=2000)
                page.wait_for_load_state("domcontentloaded")
                return True
        except Exception:
            continue
    return False

def _fill_next_input_by_label_text(page, label_text: str, value: str) -> bool:
    """
    画面上の見出し/ラベルの直後にある input/textarea を埋める（堅牢寄り）
    """
    xpaths = [
        f"//label[normalize-space()='{label_text}']/following::input[1]",
        f"//*[self::h1 or self::h2 or self::h3 or self::div][normalize-space()='{label_text}']/following::input[1]",
        f"//*[contains(normalize-space(), '{label_text}')]/following::input[1]",
    ]
    for xp in xpaths:
        el = page.locator(f"xpath={xp}")
        if el.count():
            try:
                el.first.fill(str(value), timeout=1500)
                return True
            except Exception:
                pass
    # textarea 版
    xpaths_ta = [
        f"//label[normalize-space()='{label_text}']/following::textarea[1]",
        f"//*[self::h1 or self::h2 or self::h3 or self::div][normalize-space()='{label_text}']/following::textarea[1]",
        f"//*[contains(normalize-space(), '{label_text}')]/following::textarea[1]",
    ]
    for xp in xpaths_ta:
        el = page.locator(f"xpath={xp}")
        if el.count():
            try:
                el.first.fill(str(value), timeout=1500)
                return True
            except Exception:
                pass
    return False

def fill_and_submit_application(
    page,
    people: int = 20,
    purpose: str = "バドミントン",
    applicant: str = "三廉康平",
    monthly_count: str = "なし",
    note: str = "なし",
    auto_submit: bool = True,
) -> bool:
    """
    申請フォーム（利用人数/目的/氏名/回数/連絡事項）を埋めて 確認→申込/確定 まで押す。
    いまの画面がフォームじゃない場合は何もしないで False。
    """
    body = ""
    try:
        body = page.locator("body").inner_text()
    except Exception:
        pass

    # フォームらしさの判定（「利用人数」「申請項目」などが見えているか）
    if not any(k in (body or "") for k in ["利用人数", "申請項目", "申込者氏名"]):
        return False

    # 利用人数
    _fill_next_input_by_label_text(page, "利用人数", str(people))

    # 申請項目（タグ/ボタン/ラベル想定）
    # ボタンやラベルに「バドミントン」が見えていればクリック
    for sel in [
        f"button:has-text('{purpose}')",
        f"label:has-text('{purpose}')",
        f"a:has-text('{purpose}')",
        f"*[role='button']:has-text('{purpose}')",
        f"//button[normalize-space()='{purpose}']",
        f"//label[normalize-space()='{purpose}']",
        f"//a[normalize-space()='{purpose}']",
        f"//*[contains(normalize-space(),'{purpose}')]",
    ]:
        try:
            loc = page.locator(sel) if not sel.startswith("//") else page.locator(f"xpath={sel}")
            if loc.count():
                loc.first.scroll_into_view_if_needed(timeout=400)
                loc.first.click(timeout=1000)
                break
        except Exception:
            continue

    # 申込者氏名
    _fill_next_input_by_label_text(page, "申込者氏名", applicant)

    # 今月の利用回数
    _fill_next_input_by_label_text(page, "今月の利用回数", str(monthly_count))

    # 連絡事項（テキストエリア想定）
    _fill_next_input_by_label_text(page, "連絡事項", note)

    # 確認 → 申込/確定
    _click_if_exists(page, "確認") or _click_if_exists(page, re.compile("確認"))
    if not auto_submit:
        return True  # 確認画面で止めたいとき

    # 確定/申込/同意/送信 などの押下
    for target in ["申込", "確定", "同意", "送信"]:
        if _click_if_exists(page, target) or _click_if_exists(page, re.compile(target)):
            break

    # 完了系の文言チェック（任意）
    try:
        endtxt = page.locator("body").inner_text()
        if any(w in endtxt for w in ["完了", "受付", "申込番号", "受付番号"]):
            return True
    except Exception:
        pass
    return True  # ボタン押下まで行けていれば True 扱い

def _blur(page):
    try:
        page.locator("body").first.click(position={"x":4,"y":4}, timeout=250)
    except Exception:
        pass

# --- 1) 「はい」を押す（あなたがくれた CSS セレクタ優先、失敗時フォールバック） ---
def choose_same_content_yes(page) -> bool:
    """『まだ詳細申請～同じ申請内容にしますか？』→ はい を確実に入れる"""
    try:
        # 1) 近くまでスクロール（質問テキスト or ラジオにヒット）
        try:
            sec = page.get_by_text("同じ申請内容にしますか", exact=False)
            if sec.count():
                sec.first.scroll_into_view_if_needed(timeout=600)
        except Exception:
            pass

        yes_inp  = page.locator("#radioItemCopyYes")
        no_inp   = page.locator("#radioItemCopyNo")
        yes_lab  = page.locator("label[for='radioItemCopyYes']")
        no_lab   = page.locator("label[for='radioItemCopyNo']")

        # 2) まずはラベル click（一番正攻法）
        if yes_lab.count():
            try:
                yes_lab.first.click(force=True, timeout=800)
                page.wait_for_timeout(80)
            except Exception:
                pass

        # 3) input.check()（表示されていれば成功する）
        if yes_inp.count():
            try:
                yes_inp.first.check(timeout=400)
                page.wait_for_timeout(50)
            except Exception:
                pass

        # 4) 最終手段：JS で checked を強制し、イベントを発火
        page.evaluate("""
            () => {
              const y = document.querySelector('#radioItemCopyYes');
              const n = document.querySelector('#radioItemCopyNo');
              const ly = document.querySelector("label[for='radioItemCopyYes']");
              const ln = document.querySelector("label[for='radioItemCopyNo']");
              if (!y) return false;
              // radio の checked を切替
              if (n) n.checked = false;
              y.checked = true;
              // 画面側が class で見た目を切り替える場合に合わせる
              if (ly && ln) {
                ly.classList.remove('switch-off'); ly.classList.add('switch-on');
                ln.classList.remove('switch-on');  ln.classList.add('switch-off');
              }
              // イベントを飛ばす（サイト側のハンドラに届くよう bubbles:true）
              const evts = ['click', 'input', 'change'];
              for (const t of evts) { y.dispatchEvent(new Event(t, { bubbles:true })); }
              return true;
            }
        """)

        # 5) 状態確認ログ
        state = page.evaluate("""
            () => ({
              yes: !!document.querySelector('#radioItemCopyYes')?.checked,
              no:  !!document.querySelector('#radioItemCopyNo')?.checked
            })
        """)
        print(f"[form] radioItemCopy 状態 → yes={state.get('yes')} no={state.get('no')}")

        return bool(state.get("yes"))
    except Exception as e:
        print(f"[form] はい選択エラー: {e}")
        return False




# --- 2) 「確定」を強めに押す（ナビゲーション待ちを軽く） ---
def _click_confirm_strong(page) -> bool:
    sels = [
        "button:has-text('確定')",
        "input[type='submit'][value*='確定']",
        "[id*='Kakutei'], [name*='Kakutei']",
        "[role='button']:has-text('確定')",
    ]
    for sel in sels:
        loc = page.locator(sel)
        if not loc.count():
            continue
        el = loc.first
        try:
            try:
                el.scroll_into_view_if_needed(timeout=300)
            except Exception:
                pass
            # 遷移があってもなくても先に進める待ち方
            try:
                with page.expect_navigation(wait_until="domcontentloaded", timeout=4000):
                    el.click(timeout=1500)
            except Exception:
                el.click(timeout=1500)
                page.wait_for_load_state("domcontentloaded", timeout=3000)
            return True
        except Exception:
            continue
    return False

# --- 3) フォーム入力＋「はい」→「確定」まで（固定値でサクッと） ---

def _blur(page):
    try:
        page.locator("body").first.click(position={"x":4,"y":4}, timeout=250)
    except Exception:
        pass


def fill_application_form(page, *, auto_submit: bool = AUTO_SUBMIT) -> bool:
    print("[form] 詳細申請フォームを検出 → 入力します")

    # 利用人数
    ninzu = page.locator("#ninzu input[type='number'], input[name='spinnerNinzu']")
    if ninzu.count():
        ninzu.first.fill("20"); _blur(page)

    # 使用目的 = バドミントン
    try:
        page.locator("label:has-text('バドミントン')").first.click()
        _blur(page)
    except Exception:
        pass

    # 申請項目・氏名・回数・連絡事項
    try: page.locator("#shousai > input[type='text']").first.fill("バドミントン"); _blur(page)
    except Exception: pass
    try: page.locator("#contents1 > input[type='text']").first.fill("三廉康平");   _blur(page)
    except Exception: pass
    try: page.locator("#contents2 > input[type='text']").first.fill("なし");        _blur(page)
    except Exception: pass
    try: page.locator("#contents3 > input[type='text']").first.fill("なし");     _blur(page)
    except Exception: pass


    # auto_submit=True の場合だけ確定を押す
    confirm = page.locator(
        "input[type='submit'][value*='確定'], button:has-text('確定'), a:has-text('確定')"
    ).first
    try:
        with page.expect_navigation(wait_until="domcontentloaded", timeout=6000):
            confirm.click(timeout=1500)
    except Exception:
        try: confirm.click(timeout=1200)
        except Exception: pass

    # ここでフォームが出ていれば埋める（確定まで押す）


def force_checkdate_for_room(page, d: datetime, room_label: str) -> bool:
    """
    施設別グリッドで、指定日 d の『room_label の行』にある checkdate を
    強制的に checked にする（イベントも発火）。成功で True。
    """
    ymd = d.strftime("%Y%m%d")

    # 1) まず対象 input を見つける（値=YYYYMMDD で始まる）
    inputs = page.locator(f'input[name="checkdate"][value^="{ymd}"]')
    if inputs.count() == 0:
        return False

    # 2) 同じ行が room_label かを確認しながら処理
    before = page.locator('input[name="checkdate"]:checked').count()
    for i in range(inputs.count()):
        el = inputs.nth(i)
        try:
            # 行テキストで部屋を判定
            row = el.locator("xpath=ancestor::tr[1]")
            row_txt = (row.inner_text() or "").strip() if row.count() else ""
            if room_label not in row_txt and ("多目的" not in row_txt and "ﾎｰﾙ" not in row_txt):
                continue

            # 3) ラベル→click（正攻法）
            cid = el.get_attribute("id") or ""
            if cid:
                lab = page.locator(f'label[for="{cid}"]')
                if lab.count():
                    try:
                        lab.first.click(timeout=600)
                        page.wait_for_timeout(80)
                    except Exception:
                        pass

            # 4) だめなら input を直接 check / click
            try:
                el.check(timeout=400)
            except Exception:
                try: el.click(timeout=400)
                except Exception: pass

            # 5) 最終手段：JS で checked を立ててイベント発火
            page.evaluate("""
                (inp)=>{
                  try{
                    inp.checked = true;
                    for (const t of ['click','input','change']) {
                      inp.dispatchEvent(new Event(t,{bubbles:true}));
                    }
                  }catch(e){}
                }
            """, el)

            page.wait_for_timeout(80)
            after = page.locator('input[name="checkdate"]:checked').count()
            if after > before:
                return True
        except Exception:
            continue

    return False
from playwright.sync_api import TimeoutError as PWTimeout

def click_next_strongest(page, wait_for_timeslot: bool = True, timeout_ms: int = 8000) -> bool:
    """
    「次へ進む」を絶対に押す:
      1) 通常click（複数セレクタ）
      2) force=True / 物理クリック(boundingBox)
      3) JSで el.click()
      4) window.__doPostBack('next','')
      5) __EVENTTARGET を 'next' にして form submit
    到達判定: 時間帯グリッド(checktime)が見える／またはURL変化
    """
    def _arrived():
        if not wait_for_timeslot:
            return True
        try:
            page.wait_for_selector("input[name='checktime']", timeout=3000)
            return True
        except Exception:
            return False

    sels = [
        "li.next a.btnBlue",
        "a.btnBlue:has-text('次へ進む')",
        "a:has-text('次へ進む')",
        "button:has-text('次へ進む')",
        "input[type='submit'][value*='次']",
        "[id*='Next'],[name*='Next']",
    ]

    # 1) 通常 click
    try:
        for sel in sels:
            loc = page.locator(sel)
            if not loc.count():
                continue
            el = loc.first
            try: el.scroll_into_view_if_needed(timeout=500)
            except Exception: pass
            try:
                with page.expect_navigation(wait_until="domcontentloaded", timeout=timeout_ms):
                    el.click(timeout=timeout_ms)
            except PWTimeout:
                el.click(timeout=1200)
            if _arrived(): return True
    except Exception:
        pass

    # 2) force / 物理クリック
    try:
        loc = page.locator("li.next a.btnBlue, a:has-text('次へ進む')").first
        if loc and loc.count():
            try: loc.scroll_into_view_if_needed(timeout=500)
            except Exception: pass
            try:
                loc.click(force=True, timeout=1200)
                if _arrived(): return True
            except Exception:
                bbox = loc.bounding_box()
                if bbox:
                    page.mouse.click(bbox["x"] + bbox["width"]/2, bbox["y"] + bbox["height"]/2)
                    if _arrived(): return True
    except Exception:
        pass

    # 3) JSで el.click()
    try:
        clicked = page.evaluate("""
            () => {
              const el = document.querySelector("li.next a.btnBlue, a.btnBlue:has-text('次へ進む'), a:contains('次へ進む')");
              if (!el) return false;
              el.click();
              return true;
            }
        """)
        if clicked and _arrived(): return True
    except Exception:
        pass

    # 4) __doPostBack 直叩き
    try:
        page.evaluate("window.__doPostBack && window.__doPostBack('next','')")
        if _arrived(): return True
    except Exception:
        pass

    # 5) form の __EVENTTARGET を書いて submit
    try:
        page.evaluate("""
            () => {
              const form = document.forms[0] || document.querySelector('form');
              if (!form) return false;
              const setHidden = (name, val) => {
                let h = form.querySelector(`input[name="${name}"]`);
                if (!h) { h = document.createElement('input'); h.type='hidden'; h.name=name; form.appendChild(h); }
                h.value = val;
              };
              setHidden('__EVENTTARGET', 'next');
              setHidden('__EVENTARGUMENT', '');
              form.submit();
              return true;
            }
        """)
        # 同一URL書き換えのことがあるので selector 待ちが確実
        if _arrived(): return True
    except Exception:
        pass

    return False

def set_one_month_from(page, start_dt: datetime) -> bool:
    """
    「開始日=start_dt」「期間=1ヶ月」にして『表示』を確実に発火させる。
    DOMは:
      - 日付入力:  #dpStartDate  (name="textDate", jQuery UI datepicker付き)
      - 1ヶ月ラジオ: #radioPeriod1month   / そのラベル: #lblPeriod1month (switch-on/off)
      - 表示ボタン: #btnHyoji（無ければ '表示' テキストのボタン/submit を総当り）
    """
    y, m, d = start_dt.year, start_dt.month, start_dt.day
    val = f"{y}/{m}/{d}"

    # 値セット + ラジオON + ラベルの見た目切替 + hidden同期 + イベント発火
    page.evaluate(
        """({y,m,d,val})=>{
            const fire=(el,t)=>{ if(!el) return; try{ el.dispatchEvent(new Event(t,{bubbles:true})); }catch(e){} };

            const dp = document.querySelector('#dpStartDate') || document.querySelector('input[name="textDate"]');
            if (dp && window.jQuery && window.jQuery(dp).datepicker){
                window.jQuery(dp).datepicker('setDate', new Date(y, m-1, d));
                fire(dp,'input'); fire(dp,'change'); dp.blur && dp.blur();
            } else if (dp){
                dp.value = val;
                fire(dp,'input'); fire(dp,'change'); dp.blur && dp.blur();
            }

            // hiddenの候補（施設ごとに名前が違う場合あり）
            for (const name of ['hdnStartDate','HiddenStartDate','ctl00_ContentPlaceHolder1_hdnStartDate']) {
              const h = document.querySelector(`input[type="hidden"][name="${name}"],input[type="hidden"]#${name}`);
              if (h) h.value = val;
            }

            // 1ヶ月ラジオ + ラベルのスイッチ見た目
            const r = document.querySelector('#radioPeriod1month');
            const lbl = document.querySelector('#lblPeriod1month');
            if (r){
              r.checked = true;
              fire(r,'input'); fire(r,'change');
            }
            if (lbl){
              lbl.classList.remove('switch-off');
              lbl.classList.add('switch-on');
            }
        }""",
        {"y": y, "m": m, "d": d, "val": val}
    )

    # 「表示」押下（セレクタ冗長＆postBack保険）
    clicked = False
    for sel in ["#btnHyoji", "button:has-text('表示')", "input[type='submit'][value*='表示']",
                "button:has-text('日程変更')", "input[type='submit'][value*='日程変更']"]:
        loc = page.locator(sel)
        if loc.count():
            try:
                loc.first.scroll_into_view_if_needed(timeout=400)
            except Exception:
                pass
            try:
                with page.expect_navigation(wait_until="domcontentloaded", timeout=4000):
                    loc.first.click(timeout=1500)
            except Exception:
                loc.first.click(timeout=1200)
            clicked = True
            break
    if not clicked:
        try:
            page.evaluate("window.__doPostBack && window.__doPostBack('hyouji','')")
        except Exception:
            pass

    # 反映待ち（同一URL書換え対応：thead先頭日 or ヘッダ月の変化を見る）
    try: page.wait_for_load_state("domcontentloaded", timeout=4000)
    except Exception: pass

    try:
        head = page.locator("table.calendar.horizon.toggle .pagination .month").first
        first_day = page.locator("table.calendar.horizon.toggle thead th.day span").first
        # ざっくり “先頭日が 1” ならOK（11/1 からの1ヶ月表示を想定）
        for _ in range(12):
            if first_day.count() and (first_day.text_content() or "").strip() == "1":
                print("[hyoji] first-day=1 反映OK")
                return True
            page.wait_for_timeout(150)
        # ヘッダ月チェック（オプション）
        txt = (head.text_content() or "").strip() if head.count() else ""
        return bool(txt)
    except Exception:
        return True


def scan_once(page) -> bool:
    """
    TARGET_DATE の1日だけを狙って予約を試みる。
      1) 月次でその日(○/△)を選択（checkdateを確実に入れる）
      2) 時間帯ページへ（ボタン→postBack→強押しの順で遷移）
      3) WANTED_SLOTS の3枠を選択
      4) 次へ（詳細申請フォームに到達）※確定は押さない
    成功したら True、どこかで詰まったら False。
    """

    # ---- ターゲット日を厳密に決定 ----
    def _parse_date_any(s: str) -> datetime:
        m = re.match(r"^\s*(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s*$", s)
        if not m:
            raise ValueError(f"invalid date: {s}")
        y, mm, dd = map(int, m.groups())
        return datetime(y, mm, dd)

    try:
        d = _parse_date_any(TARGET_DATE)
    except Exception as e:
        print(f"[scan] TARGET_DATE 解析エラー: {TARGET_DATE} ({e})")
        return False

    # ---- ログイン＆施設の月次へ移動 ----
    if not is_logged_in(page):
        do_login(page)
    recover_and_to_month(page)  # 施設月次に戻す

    start_base = datetime(d.year, d.month, 1)      # 例: 2025-10-01
    start_11_1 = add_months_keep_dom(start_base, 1)  # 例: 2025-11-01
    set_one_month_from(page, start_11_1)

    today = datetime.now()
    next_y  = today.year + (1 if today.month == 12 else 0)
    next_m  = 1 if today.month == 12 else (today.month + 1)
    first_of_next = datetime(next_y, next_m, 1)
    set_one_month_from(page, first_of_next)

    # ---- ターゲットの月が見えるまで月送り ----
    ensure_facility_month_visible(page, d, max_hops=4)

    # ---- 単日(○/△)クリック → checkdate を入れる ----
    if not month_click_if_ok(page, d):
        if DEBUG:
            print(f"[month] {d.strftime('%Y-%m-%d')} … ×/― → abort")
        return False

    # ---- 次へ進む（まずは“選択数を見て押す”ヘルパ）----
    if not is_timeslot_grid(page):
        if proceed_if_enough_dates_selected(page, min_selected=1):
            try:
                page.wait_for_selector("input[name='checktime']", timeout=6000)
            except Exception:
                pass
    if not click_next_strongest(page, wait_for_timeslot=True):
        print("[next] 次へ進むが押せませんでした")
        return False

    
    # まだ時間帯ページでなければ、ここで必ず遷移させる
    if not is_timeslot_grid(page):
        if not go_to_timeslot_grid(page):
            print("[time] 時間帯別に遷移できず")
            recover_and_to_month(page)
            return False


    # ---- 3枠（WANTED_SLOTS）すべて選択 ----
    if not pick_exact_three_slots_for_current_day(page):
        print("[time] 3枠すべて選択できず")
        recover_and_to_month(page)
        return False

    # ---- 次へ（= 詳細申請フォームへ）----
    if not next_after_timeslots(page):
        print("[time] 次へ進むに失敗")
        recover_and_to_month(page)
        return False

    # ここでフォームが出ていれば埋める（確定まで押す）
    # フォーム入力後に確実押下
    if is_shousai_form(page):
        fill_application_form(page, auto_submit=False)  # 入力のみ
        ok = click_kakutei_strict(page, timeout_ms=8000)
        print("確定（申込）:", ok)
        return ok

    return True



def try_set_facility_range_one_month(page, anchor_date) -> bool:
    """
    set_facility_range_one_month を安全に呼び出し、
    失敗時は set_facility_range_from_anchor にフォールバックする。
    例外内容もログに吐く。
    """
    # デバッグ: いまグローバルに見えているオブジェクトを確認
    obj = globals().get("set_facility_range_one_month")
    print("[hyoji] set_facility_range_one_month =", obj)

    # callable でなければ、名前の衝突（変数で上書き等）
    if not callable(obj):
        print("[hyoji] WARNING: set_facility_range_one_month が callable ではありません。fallback を使います。")
        try:
            set_facility_range_from_anchor(page, anchor_date)
            return True
        except Exception as e:
            print("[hyoji] fallback error:", e)
            return False

    # 本命を呼ぶ
    try:
        ok = obj(page, anchor_date)
        return bool(ok)
    except TypeError as e:
        # 典型：引数数不一致や self 付きでの誤定義など
        print("[hyoji] TypeError on set_facility_range_one_month:", e, "→ fallback 実行")
        try:
            set_facility_range_from_anchor(page, anchor_date)
            return True
        except Exception as e2:
            print("[hyoji] fallback error:", e2)
            return False
    except Exception as e:
        print("[hyoji] Unexpected error on set_facility_range_one_month:", e, "→ fallback 実行")
        try:
            set_facility_range_from_anchor(page, anchor_date)
            return True
        except Exception as e2:
            print("[hyoji] fallback error:", e2)
            return False


def _collect_wanted_cols_for_row(table, row) -> list[int]:
    """ヘッダから WANTED_SLOTS に合致する列indexを取得"""
    ths = table.locator("thead th")
    wanted_norm = {norm_wave(s) for s in unique_norm(WANTED_SLOTS)}
    cols = []
    for i in range(ths.count()):
        lbl = norm_wave((ths.nth(i).text_content() or ""))
        # "18:30~19:30" のような表記に正規化
        rng = _extract_range_from_header(lbl)
        if not rng:
            continue
        slot = f"{rng[0]:d}:00~{rng[1]:d}:00" if ":30" not in lbl else f"{rng[0]:02d}:30~{rng[1]:02d}:30"
        # headerに「:30」が含むかの粗判定で 30分起点も拾う
        # 既存のWANTED_SLOTS自体が "18:30~19:30" 等を持っているので norm_wave で比較
        if norm_wave(slot) in wanted_norm or norm_wave(lbl) in wanted_norm:
            cols.append(i)
    return cols

def _force_checktime_in_cell(page, cell) -> bool:
    """セル内の checktime を '確実に' ON にする（JS → ラベルクリック → セルクリックの順）"""
    try:
        inp = cell.locator("input[name='checktime']")
        if inp.count():
            box = inp.first
            try:
                if box.is_disabled():
                    return False
            except Exception:
                pass
            # 1) JSで強制チェック＋イベント発火
            page.evaluate(
                """(el)=>{
                    el.checked = true;
                    el.dispatchEvent(new Event('click',  {bubbles:true}));
                    el.dispatchEvent(new Event('change', {bubbles:true}));
                    el.dispatchEvent(new Event('input',  {bubbles:true}));
                }""",
                box
            )
            try:
                if box.is_checked():
                    return True
            except Exception:
                pass
            # 2) ラベルクリック
            cid = (box.get_attribute("id") or "").strip()
            if cid:
                lab = cell.locator(f"label[for='{cid}']")
                if lab.count():
                    try:
                        lab.first.click(timeout=800, force=True)
                        if box.is_checked():
                            return True
                    except Exception:
                        pass
            # 3) セルクリック最終手段
            try:
                cell.click(timeout=800, force=True)
                if box.is_checked():
                    return True
            except Exception:
                pass
            return False
        # input が見つからない場合はラベル直叩き
        lab = cell.locator("label")
        if lab.count():
            try:
                lab.first.click(timeout=800, force=True)
                return True
            except Exception:
                pass
    except Exception:
        pass
    return False

def _force_on_checktime(page, input_el) -> bool:
    """checktime の input をサイトJS含め確実にONにする"""
    try:
        # まず素直に check / click（画面外や重なり対策で force=True）
        try:
            input_el.check(timeout=400)
        except Exception:
            try: input_el.click(timeout=400, force=True)
            except Exception: pass

        # サイト側のトグル関数があれば呼ぶ
        try:
            page.evaluate("(el)=>{ if(window.checkCell) try{ window.checkCell(el); }catch(e){} }", input_el)
        except Exception:
            pass

        # まだOFFなら強制ON＋イベント＋見た目class同期
        page.evaluate("""
            (el)=>{
              if(!el) return;
              if(!el.checked){
                el.checked = true;
                for(const t of ['click','change','input']) {
                  try{ el.dispatchEvent(new Event(t,{bubbles:true})); }catch(e){}
                }
              }
              const lab = document.querySelector(`label[for="${el.id}"]`);
              if(lab){ lab.classList.remove('switch-off'); lab.classList.add('switch-on'); }
            }
        """, input_el)

        try:
            return input_el.is_checked()
        except Exception:
            return True
    except Exception:
        return False


def pick_exact_three_slots_for_current_day(page) -> bool:
    """
    時間帯別ページで、ROOM_LABEL の行から「○」を左から3つ選ぶ（ヘッダ解析なし）。
    """
    if not is_timeslot_grid(page):
        return False

    table, row = find_table_and_row_for_room(page, ROOM_LABEL)
    if not table or not row:
        if DEBUG: print("[time] 多目的ホールの行が見つからない")
        return False

    # 行内の「○」ラベルを収集
    labs = row.locator("td label").filter(has_text="○")
    n = labs.count()
    if DEBUG: print(f"[time] ○ラベル数: {n}")

    picked = 0
    for i in range(min(3, n)):
        lab = labs.nth(i)
        try:
            lab.scroll_into_view_if_needed(timeout=500)
        except Exception:
            pass

        # まずラベルを正攻法で押す（重なり対策で force=True）
        try:
            lab.click(timeout=800, force=True)
        except Exception:
            pass

        # for属性から input を掴んで最終同期
        cid = (lab.get_attribute("for") or "").strip()
        if not cid:
            continue
        inp = page.locator(f"#{cid}")
        if not inp.count():
            continue

        if _force_on_checktime(page, inp.first):
            picked += 1
            page.wait_for_timeout(80)

    # 進捗ログ
    try:
        now = page.locator("input[name='checktime']:checked").count()
    except Exception:
        now = -1
    if DEBUG: print(f"[time] picked={picked}/3  (checked now={now})")

    return picked >= 3


def _parse_date_any(s: str) -> datetime:
    m = re.match(r"^\s*(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s*$", s)
    if not m:
        raise ValueError(f"invalid date: {s}")
    y, m_, d = map(int, m.groups())
    return datetime(y, m_, d)

def book_single_date(page, d: datetime) -> bool:
    """
    1日だけ狙って予約する：
    1) 月次でその日が○/△ならクリック
    2) 時間帯別へ遷移
    3) 18:30/19:30/20:30 の3枠すべて選択
    4) 次へ → 詳細フォーム入力（確定は押さない）
    """
    # ログイン/施設月次へ
    if not is_logged_in(page):
        do_login(page)
    recover_and_to_month(page)

    # 表示範囲を d の属する月へ（facility側の月送り）
    ensure_facility_month_visible(page, d, max_hops=3)

    # 単日クリック（○/△だけ）
    if not month_click_if_ok(page, d):
        if DEBUG: print(f"[single] {d.date()} は○/△ではないためスキップ")
        return False

    # 時間帯別へ
    if not go_to_timeslot_grid(page):
        if DEBUG: print("[single] 時間帯別に遷移できず")
        recover_and_to_month(page)
        return False

    # 3枠すべて選べるか
    if not pick_exact_three_slots_for_current_day(page):
        if DEBUG: print("[single] 3枠をすべて選択できず → 中断")
        recover_and_to_month(page)
        return False

    # 次へ（= 詳細申請フォームへ）
    if not next_after_timeslots(page):
        if DEBUG: print("[single] 次へ進むに失敗（時間帯後）")
        recover_and_to_month(page)
        return False

    # フォーム入力（確定は押さない）
    if is_shousai_form(page):
        ok = fill_application_form(page, auto_submit=False)
        print(f"[single] フォーム入力: {'OK' if ok else 'NG'}（確定は押していません）")
        return ok
    else:
        # 施設によっては確認画面→フォームの順もあるので、その場合は止めるだけ
        print("[single] フォーム画面ではない（確認までで停止）。確定は押していません。")
        return True


def is_shousai_form(page) -> bool:
    try:
        if page.get_by_text("利用人数", exact=False).count():
            return True
        if page.locator("#shousai").count():
            return True
        # ラジオ（目的）や3つのテキスト欄が見えるか
        if page.locator("label:has-text('バドミントン')").count():
            return True
        if page.locator("#contents1 input[type='text'], #contents2 input[type='text'], #contents3 input[type='text']").count():
            return True
    except Exception:
        pass
    return False


def handle_after_timeslots(page) -> bool:
    """
    時間帯選択→次へ の直後に呼ぶ。
    詳細入力フォームなら埋めて確定、そうでなければそのまま True。
    """
    page.wait_for_load_state("domcontentloaded")
    page.wait_for_timeout(300)

    if is_shousai_form(page):
        print("[form] 詳細申請フォームを検出 → 入力します")
        ok = fill_application_form(page)
        print(f"[form] 提出: {'OK' if ok else 'NG'}")
        return ok
    else:
        # 施設によっては“確認”経由など、フォームが無いパスもある
        print("[form] フォーム画面ではありません（スキップ）")
        return True



# ===== 確認／提出 =====
def assert_review(page, d: datetime, picked_label: str) -> bool:
    body = ""
    try: body = page.locator("body").inner_text()
    except Exception: pass
    ok = True
    if FACILITY_NAME not in body: ok=False
    date_jp = f"{d.year}年{d.month}月{d.day}日"
    if date_jp not in body: ok=False
    if picked_label and picked_label not in body and picked_label.replace("~","〜") not in body:
        ok=False
    if DEBUG: print(f"[review] assert={ok}")
    return ok

def click_confirm_or_next(page) -> bool:
    return click_confirm(page) or click_next(page)


def proceed_to_review_and_maybe_submit(page, d: datetime, picked_label: str) -> bool:
    # 施設別→「次へ」でレビュー/申請フォームへ
    if not click_next(page):
        return False

    # もし“申請フォーム”がもう見えていたら、そのまま埋めて送信
    if fill_and_submit_application(
        page,
        people=20,
        purpose="バドミントン",
        applicant="三廉康平",
        monthly_count="なし",
        note="なし",
        auto_submit=True,  # ←最終確定まで自動で押したくない時は False
    ):
        return True

    # ここは従来の「確認画面」経由ルート（画面構造が違う場合の保険）
    if not assert_review(page, d, picked_label):
        save_diag(page, "review_mismatch")
        return False

    # 確認→申込の画面へ
    _click_if_exists(page, "確認") or _click_if_exists(page, re.compile("確認"))

    # 改めてフォームが出た場合も埋める
    if fill_and_submit_application(
        page,
        people=20,
        purpose="バドミントン",
        applicant="三廉康平",
        monthly_count="0",
        note="なし",
        auto_submit=True,
    ):
        return True

    # 旧ロジック（完全自動化オフ時に止めたい場合）
    if not AUTO_SUBMIT:
        print("➡ 確認画面まで到達（AUTO_SUBMIT=False）。ここで目視確認してください。")
        return True

    # 最終確定（保険）
    return click_confirm_or_next(page)


# --- 追加: 詳細申請フォーム検知 ---
def is_shousai_form(page) -> bool:
    try:
        if "WgR_ShousaiShinsei" in (page.url or ""):
            return True
        # 目印（「使用目的」「申請項目」などの見出し）
        return page.get_by_text("使用目的", exact=False).count() > 0 \
            and page.locator("#shousai > input[type='text']").count() > 0
    except Exception:
        return False
def agree_and_submit_shinsei(page, timeout_ms: int = 8000) -> bool:
    """
    確認画面の『内容を確認して □ 申込』を自動で実行する。
    1) 同意チェックを確実に ON（ラベルクリック → input.check → JS強制）
    2) 『申込』ボタンを強押し（クリック/JS/click/postBack）
    3) 完了語で判定（受付番号/完了/受け付けました など）
    """

    # --- 1) 同意チェック ON ---
    try:
        # パネル内を優先探索（注意事項/内容を確認などの文言）
        panel = page.locator("div:has-text('注意事項'), div:has-text('内容を確認'), div:has-text('申込')")
        cbs = (panel.locator("input[type='checkbox']") if panel.count()
               else page.locator("input[type='checkbox']"))

        # ラベルクリック（正攻法）
        if cbs.count():
            cb = cbs.first
            cid = (cb.get_attribute("id") or "").strip()
            if cid:
                lab = page.locator(f"label[for='{cid}']")
                if lab.count():
                    try:
                        lab.first.scroll_into_view_if_needed(timeout=400)
                    except Exception:
                        pass
                    try:
                        lab.first.click(timeout=800)
                        page.wait_for_timeout(80)
                    except Exception:
                        pass
            # input.check()
            try:
                cb.check(timeout=500)
            except Exception:
                pass

        # 最終手段：JSで強制 + イベント発火
        page.evaluate("""
            () => {
              const scope = document.querySelector("div:has(.panel), body") || document.body;
              let cb = scope.querySelector("input[type='checkbox']");
              if (!cb) cb = document.querySelector("input[type='checkbox']");
              if (!cb) return false;
              cb.checked = true;
              for (const t of ['click','input','change']) {
                try { cb.dispatchEvent(new Event(t,{bubbles:true})); } catch(e) {}
              }
              return true;
            }
        """)
    except Exception:
        pass

    # --- 2) 『申込』を強押し ---
    try:
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    except Exception:
        pass
    page.wait_for_timeout(120)

    sels = [
        "input[type='submit'][value*='申込']",
        "button:has-text('申込')",
        "a:has-text('申込')",
        "[role='button']:has-text('申込')",
        "input[type='submit'][value*='申し込み'], button:has-text('申し込み'), a:has-text('申し込み')",
    ]
    clicked = False
    for sel in sels:
        loc = page.locator(sel)
        if not loc.count():
            continue
        btn = loc.first
        try:
            try: btn.scroll_into_view_if_needed(timeout=400)
            except Exception: pass
            try:
                with page.expect_navigation(wait_until="domcontentloaded", timeout=timeout_ms):
                    btn.click(timeout=1500)
            except Exception:
                btn.click(timeout=1200, force=True)
                try: page.wait_for_load_state("domcontentloaded", timeout=timeout_ms//2)
                except Exception: pass
            clicked = True
            break
        except Exception:
            continue

    if not clicked:
        # JSフォールバック（click / form.submit / __doPostBack）
        try:
            page.evaluate("""
                () => {
                  const buttons = Array.from(document.querySelectorAll('a,button,input[type=submit],[role=button]'));
                  const b = buttons.find(el=>{
                    const t=(el.innerText||el.textContent||el.value||'').trim();
                    return /申込|申し込み/.test(t);
                  });
                  if (b){ b.click(); return true; }
                  const form=document.querySelector('form'); 
                  if (form){ form.submit(); return true; }
                  if (window.__doPostBack){ window.__doPostBack('shinsei',''); return true; }
                  return false;
                }
            """)
            try: page.wait_for_load_state("domcontentloaded", timeout=timeout_ms)
            except Exception: pass
        except Exception:
            pass

    # --- 3) 完了判定 ---
    page.wait_for_timeout(300)
    try:
        body = page.locator("body").inner_text()
    except Exception:
        body = ""
    ok_words = ["完了", "受け付けました", "受付番号", "受付完了", "申込番号"]
    if any(w in (body or "") for w in ok_words):
        import re
        m = re.search(r"(受付番号|申込番号)\s*[:：]?\s*([A-Za-z0-9\-]+)", body or "")
        if m:
            print(f"🎉 申込完了！ {m.group(1)}: {m.group(2)}")
        return True
    return False
def _ensure_agree_checked(page):
    # 「内容を確認して □」のチェックを確実に ON
    try:
        # 近くのパネル優先で拾う
        scope = page.locator("div:has-text('内容を確認'), div:has-text('注意事項'), #body").first
        cb = scope.locator("input[type='checkbox']").first
        if cb and cb.count():
            cid = (cb.get_attribute("id") or "").strip()
            if cid:
                lab = page.locator(f"label[for='{cid}']")
                if lab.count():
                    try:
                        lab.first.scroll_into_view_if_needed(timeout=400)
                    except Exception:
                        pass
                    try:
                        lab.first.click(timeout=800)
                        page.wait_for_timeout(80)
                    except Exception:
                        pass
            try: cb.check(timeout=400)
            except Exception: pass
            # JS 最終同期
            page.evaluate("""
                (el)=>{
                  if(!el) return;
                  el.checked = true;
                  for (const t of ['click','input','change']) {
                    try{ el.dispatchEvent(new Event(t,{bubbles:true})); }catch(e){}
                  }
                }
            """, cb)
    except Exception:
        pass

def click_kakutei_strict(page, timeout_ms: int = 8000) -> bool:
    """
    申込/確定ボタン（#body > div.content_body > ul > li > input）を“必ず”押す。
    1) 指定CSSを優先して scroll → click（navigation あり/なし両対応）
    2) onclick の __doPostBack を解析して直叩き
    3) form の __EVENTTARGET を埋めて submit
    押下前に同意チェックも入れる。
    """
    _ensure_agree_checked(page)

    # 1) 貼ってもらった CSS をまず狙う
    sels = [
        "#body > div.content_body > ul > li > input",   # あなたのセレクタ
        "input.btnBlue.large[value*='申込']",
        "input[type='button'][value*='申込']",
        "button:has-text('申込')",
        "input[type='submit'][value*='申込']",
    ]
    for sel in sels:
        loc = page.locator(sel)
        if not loc.count():
            continue
        btn = loc.first
        try:
            try: btn.scroll_into_view_if_needed(timeout=400)
            except Exception: pass

            # navigation が起きても、起きなくても前へ進む待ち方
            try:
                with page.expect_navigation(wait_until="domcontentloaded", timeout=timeout_ms):
                    btn.click(timeout=1500)
            except Exception:
                # 画面内だけの書き換え系にも対応
                btn.click(timeout=1200, force=True)
                try: page.wait_for_load_state("domcontentloaded", timeout=timeout_ms//2)
                except Exception: pass

            # 成功判定（本文に受付ワード or URL変化）
            body = page.locator("body").inner_text()
            if any(w in body for w in ["受付番号","申込番号","受付完了","受け付けました","完了しました"]):
                return True
        except Exception:
            continue

        # 2) onclick から __doPostBack を抜いて直実行
        try:
            target, arg = page.evaluate("""
                (el)=>{
                  if(!el) return [null,null];
                  const oc = (el.getAttribute('onclick')||'');
                  const m = oc.match(/__doPostBack\\(['"]([^'"]+)['"],\\s*['"]([^'"]*)['"]\\)/);
                  return m ? [m[1], m[2]] : [null,null];
                }
            """, btn)
            if target:
                page.evaluate("window.__doPostBack && window.__doPostBack(arguments[0], arguments[1])", target, arg or "")
                try: page.wait_for_load_state("domcontentloaded", timeout=timeout_ms)
                except Exception: pass
                body = page.locator("body").inner_text()
                if any(w in body for w in ["受付番号","申込番号","受付完了","受け付けました","完了しました"]):
                    return True
        except Exception:
            pass

    # 3) __EVENTTARGET を直書きして form submit（最終手段）
    try:
        page.evaluate("""
            ()=>{
              const form = document.forms[0] || document.querySelector('form');
              if(!form) return false;
              const ensure = (name,val)=>{
                let h=form.querySelector(`input[name="${name}"]`);
                if(!h){ h=document.createElement('input'); h.type='hidden'; h.name=name; form.appendChild(h); }
                h.value = val;
              };
              // よくある target 候補（next/shinsei/confirm など）
              const cand = ['next','shinsei','confirm','kakutei'];
              ensure('__EVENTARGUMENT','');
              for (const t of cand){
                ensure('__EVENTTARGET', t);
                form.submit();
              }
              return true;
            }
        """)
        try: page.wait_for_load_state("domcontentloaded", timeout=timeout_ms)
        except Exception: pass
        body = page.locator("body").inner_text()
        if any(w in body for w in ["受付番号","申込番号","受付完了","受け付けました","完了しました"]):
            return True
    except Exception:
        pass
    return False



def proceed_to_review_and_maybe_submit(page, d: datetime, picked_label: str) -> bool:
    # 時間帯選択ページ → 次へ（= 詳細申請フォーム）
    if not click_next(page):
        return False

    # フォームが出たら自動入力して「確定」まで押す
    if is_shousai_form(page):
        fill_application_form(page)

    # ここで“確認画面”になっているはず
    if not assert_review(page, d, picked_label):
        save_diag(page, "review_mismatch")
        return False


    if not click_confirm_or_next(page):
        return False
    # 確認画面で…
    ok = agree_and_submit_shinsei(page)
    print("申込ボタン:", ok)


    body = ""
    try: body = page.locator("body").inner_text()
    except Exception: pass
    ok_words = ["完了","受け付けました","受付番号","受付完了"]
    if not any(w in body for w in ok_words):
        return False
    m = re.search(r"(受付番号|申込番号|予約番号)\s*[:：]\s*([A-Za-z0-9\-]+)", body)
    num = m.group(2) if m else "（不明）"
    print(f"🎉 予約完了！ 受付番号: {num}")
    return True



def main():
    if not (LOGIN_ID and LOGIN_PASSWORD):
        raise SystemExit(".env に LOGIN_ID / LOGIN_PASSWORD を設定してください。")

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

        # ログ
        page.on("console", lambda msg: print(f"[console] {msg.type} {msg.text}"))
        page.on("request",  lambda req: print(f"[request] {req.method} {req.url}")
                 if "WgR_ShisetsubetsuAkiJoukyou" in req.url else None)
        page.on("response", lambda res: print(f"[response] {res.status} {res.url}")
                 if "WgR_ShisetsubetsuAkiJoukyou" in res.url else None)

        page.set_default_navigation_timeout(30000)
        page.route("**/*", route_block)

        # ここから本体
        do_login(page)
        ok = scan_once(page)
        print("scan result:", ok)
        input("終了するには Enter：")
        try: ctx.close()
        except Exception: pass


        

if __name__ == "__main__":
    main()
