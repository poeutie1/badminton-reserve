"""外部へ接続せず、遅延するPOST遷移と予約フローを実ブラウザで検証する。"""

import importlib.util
from collections import Counter
from datetime import datetime
from html import escape
from pathlib import Path
from urllib.parse import parse_qs

import pytest
from playwright.sync_api import sync_playwright


spec = importlib.util.spec_from_file_location(
    "auto_reserve", Path(__file__).parents[1] / "auto_reserve.py"
)
reserve = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reserve)

TARGET = datetime(2026, 11, 1)
ORIGIN = "https://reserve.test"
ACTIONS = {
    "menu": "WgR_ModeSelect",
    "login": "WgR_Login",
    "facility": "WgR_ShisetsuKensaku",
    "calendar": "WgR_ShisetsubetsuAkiJoukyou",
    "timeslot": "WgR_JikantaibetsuAkiJoukyou",
    "application": "WgR_ShousaiShinsei",
    "confirmation": "WgR_YoyakuKakunin",
    "complete": "WgR_YoyakuKanryou",
}


def link(event, text, argument=""):
    return f'''<a class="btnBlue" href="javascript:__doPostBack('{event}','{argument}')">{text}</a>'''


class ReservationSite:
    """実サイトと同じform/action、戻るリンクを持つオフラインの予約画面。"""

    def __init__(self):
        self.logged_in = False
        self.available = set()
        self.attempts = []
        self.counts = Counter()
        self.current_day = ""
        self.month = TARGET
        self.completion = "complete"
        self.missing_field = False

    def route(self, route):
        request = route.request
        data = parse_qs(request.post_data or "")
        stage = data.get("stage", ["calendar" if request.url.endswith("/calendar") else "menu"])[0]
        event = data.get("event", [""])[0]
        argument = data.get("argument", [""])[0]
        if stage == "menu" and event == "login":
            stage = "login"
        elif stage == "login" and event == "signin":
            self.logged_in = True
            self.counts["login"] += 1
            stage = "menu"
        elif stage == "menu" and event == "category":
            stage = "facility"
        elif stage == "facility" and event == "next":
            stage = "calendar"
        elif stage == "calendar" and event == "hyouji":
            self.counts["display"] += 1
            self.month = datetime.strptime(data["textDate"][0], "%Y/%m/%d")
        elif stage == "calendar" and event == "next":
            selected = data.get("checkdate", [])
            assert len(selected) == 1, "申込対象は1日だけ"
            self.current_day = selected[0]
            self.attempts.append(self.current_day)
            stage = "timeslot"
        elif event == "history" and argument == "WgR_ShisetsubetsuAkiJoukyou":
            self.counts["calendar_return"] += 1
            stage = "calendar"
        elif stage == "timeslot" and event == "next":
            assert len(data.get("checktime", [])) == 3
            stage = "application"
        elif stage == "application" and event == "next":
            self.counts["confirm"] += 1
            stage = "confirmation"
        elif stage == "confirmation" and event == "next":
            self.counts["submit"] += 1
            stage = self.completion
        route.fulfill(status=200, content_type="text/html; charset=utf-8", body=self.html(stage))

    def html(self, stage):
        body = ''
        if stage == "menu":
            body = ("<button id='category_18' onclick=\"__doPostBack('category','')\">ふるさと千川館</button>"
                    if self.logged_in else link("login", "ログイン"))
        elif stage == "login":
            body = '<input id="userID"><input id="passWord">' + link("signin", "ログイン")
        elif stage == "facility":
            body = ("<table id='shisetsutbl'><tr><td class='shisetsu'><label>ふるさと千川館</label>"
                    "</td></tr></table>" + link("next", "次へ進む"))
        elif stage == "calendar":
            days = reserve.build_candidate_days(self.month.year, self.month.month, set())
            cells = ''.join(
                f'<td><input type="checkbox" name="checkdate" id="date{i}" value="{day:%Y%m%d}">'
                f'<label for="date{i}">△</label></td>' for i, day in enumerate(days)
            )
            body = (f'<input id="dpStartDate" name="textDate" value="{self.month.year}/{self.month.month}/1">'
                    '<input type="radio" id="radioPeriod1month" checked>'
                    '<input type="button" id="btnHyoji" value="表示" onclick="__doPostBack(\'hyouji\',\'\')">'
                    f'<table class="calendar horizon toggle"><caption>{self.month.year}年{self.month.month}月</caption>'
                    f'<tbody><tr><td class="shisetsu">多目的ホール</td>{cells}</tr></tbody></table>'
                    + link("next", "次へ進む"))
        elif stage == "timeslot":
            headers = '<th>部屋</th>' + ''.join(f'<th>{slot}</th>' for slot in reserve.WANTED_SLOTS)
            cells = '<td class="shisetsu">多目的ホール</td>'
            for i, slot in enumerate(reserve.WANTED_SLOTS):
                mark = "○" if self.current_day in self.available or i != 1 else "×"
                cells += (f'<td><input type="checkbox" style="display:none" name="checktime" id="time{i}" value="{i}">'
                          f'<label for="time{i}">{mark}</label></td>')
            body = (f'<table class="calendar horizon toggle"><thead><tr>{headers}</tr></thead>'
                    f'<tbody><tr>{cells}</tr></tbody></table>' + link("next", "次へ進む"))
        elif stage == "application":
            names = ['spinnerNinzu', 'txtYykShousai', 'txtContents1', 'txtContents2', 'txtContents3']
            if self.missing_field:
                names.remove('txtContents1')
            body = ''.join(f'<input name="{name}">' for name in names)
            body += ('<div id="mokuteki"><input type="radio" id="badminton">'
                     '<label for="badminton">バドミントン</label></div>' + link("next", "次へ進む"))
        elif stage == "confirmation":
            body = '<input type="button" value="申込" onclick="__doPostBack(\'next\',\'\')">'
        elif stage == "complete":
            body = '<h1>予約の申し込みを受け付けました。</h1>'
        elif stage == "unknown":
            body = '<h1>処理結果を確認してください</h1>'
        if self.logged_in:
            body += '<a href="#logout">ログアウト</a>'
        if stage in ['timeslot', 'application', 'confirmation', 'complete']:
            body += link("history", "施設別空き状況", "WgR_ShisetsubetsuAkiJoukyou")
        action = ACTIONS.get(stage, 'WgR_Result')
        return f'''<!doctype html><html><body>
            <form method="post" action="/{action}">
            <input type="hidden" name="stage" value="{escape(stage)}">
            <input type="hidden" name="event"><input type="hidden" name="argument">
            {body}</form>
            <script>
            window.__doPostBack = (event, argument) => {{
                const form = document.forms[0];
                form.elements.event.value = event;
                form.elements.argument.value = argument;
                // 旧画面のDOMContentLoadedは済んでいるが、POSTは少し遅れて発生する。
                setTimeout(() => form.submit(), 40);
            }};
            </script></body></html>'''


@pytest.fixture(scope="module")
def browser():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome", headless=True)
        yield browser
        browser.close()


@pytest.fixture
def scenario(browser, monkeypatch, tmp_path):
    monkeypatch.setattr(reserve, "BASE_URL", ORIGIN + '/mode')
    monkeypatch.setattr(reserve, "DIAG_LEVEL", 0)
    monkeypatch.setattr(reserve, "DRY_RUN", False)
    monkeypatch.setattr(reserve, "MAX_DAYS", 5)
    monkeypatch.setattr(reserve, "USER_DATA_DIR", tmp_path / 'browser')
    context = browser.new_context()
    site = ReservationSite()
    # 全通信をローカルで応答。実サイトへのリクエストは一切送らない。
    context.route("**/*", site.route)
    page = context.new_page()
    yield site, page
    context.close()


def test_unavailable_days_reuse_calendar_without_relogin(scenario):
    site, page = scenario
    assert reserve.book_days(page, TARGET) == []
    assert len(site.attempts) == len(reserve.build_candidate_days(2026, 11, set())) == 15
    assert site.counts['login'] == 1
    assert site.counts['display'] == 0
    assert site.counts['submit'] == 0


def test_failed_days_are_not_revisited_after_success(scenario, monkeypatch):
    site, page = scenario
    monkeypatch.setattr(reserve, 'MAX_DAYS', 2)
    site.available = {'20261130', '20261117'}
    booked = reserve.book_days(page, TARGET)
    assert [day.strftime('%Y%m%d') for day in booked] == ['20261130', '20261117']
    assert len(site.attempts) == len(set(site.attempts))
    assert site.counts['login'] == 1
    assert site.counts['submit'] == 2


def test_dry_run_stops_at_first_confirmation_without_submit(scenario, monkeypatch):
    site, page = scenario
    monkeypatch.setattr(reserve, 'DRY_RUN', True)
    site.available = {'20261116'}
    with pytest.raises(reserve.DryRunComplete):
        reserve.book_days(page, TARGET)
    assert site.attempts == ['20261116']
    assert site.counts['confirm'] == 1
    assert site.counts['submit'] == 0


@pytest.mark.parametrize('completion', ['unknown', 'confirmation'])
def test_unconfirmed_submission_stops_without_retry(scenario, completion):
    site, page = scenario
    site.available = {'20261116', '20261130'}
    site.completion = completion
    with pytest.raises(reserve.BookingResultUnknown):
        reserve.book_days(page, TARGET)
    assert site.counts['submit'] == 1
    assert site.attempts == ['20261116']


def test_failed_form_does_not_reach_confirmation(scenario):
    site, page = scenario
    site.available = {'20261116'}
    site.missing_field = True
    with pytest.raises(RuntimeError, match='入力できない'):
        reserve.book_days(page, TARGET)
    assert site.counts['confirm'] == site.counts['submit'] == 0


def test_slot_check_does_not_select_partial_availability(scenario):
    site, page = scenario
    page.set_content(site.html('timeslot'))
    assert reserve.pick_time_slots(page) is False
    assert page.locator('input[name="checktime"]:checked').count() == 0


def test_only_requested_slots_are_selected(scenario):
    site, page = scenario
    site.available.add(site.current_day)
    page.set_content(site.html('timeslot'))
    assert reserve.pick_time_slots(page) is True
    assert page.locator('input[name="checktime"]:checked').count() == 3


def test_previous_date_selection_is_cleared(scenario):
    site, page = scenario
    page.set_content(site.html('calendar'))
    page.locator('input[name="checkdate"]').first.check()
    assert reserve.click_date_on_calendar(page, datetime(2026, 11, 30))
    assert page.locator('input[name="checkdate"]:checked').count() == 1
    assert page.locator('input[name="checkdate"]:checked').input_value() == '20261130'


def test_same_url_postback_waits_for_new_calendar(scenario):
    site, page = scenario
    site.month = datetime(2026, 10, 1)
    page.goto(ORIGIN + '/calendar')
    original_url = page.url
    assert reserve.set_display_period_one_month(page, TARGET)
    assert reserve.get_calendar_header_year_month(page) == (2026, 11)
    assert site.counts['display'] == 1
    assert reserve.set_display_period_one_month(page, TARGET)
    assert site.counts['display'] == 1
    # 2回目も同一URLにPOSTするケースを確認する。
    reserve.postback(page, 'hyouji', ready_selector=reserve.CALENDAR_SELECTOR)
    assert page.url != original_url
    url = page.url
    reserve.postback(page, 'hyouji', ready_selector=reserve.CALENDAR_SELECTOR)
    assert page.url == url


@pytest.mark.parametrize('text', [
    '予約申込が完了しました。',
    '予約の申し込みを受け付けました。',
    '申込みが完了しました。',
])
def test_completion_requires_success_message_and_no_submit_button(scenario, text):
    site, page = scenario
    page.set_content(f'<form action="/WgR_YoyakuKakunin"><h1>{text}</h1></form>')
    assert reserve.booking_completed(page)
    page.set_content(site.html('confirmation'))
    assert not reserve.booking_completed(page)


def test_duplicate_process_is_skipped():
    with reserve.single_instance():
        with pytest.raises(reserve.AlreadyRunning):
            with reserve.single_instance():
                pytest.fail('二重起動を許可してはいけない')
    with reserve.single_instance():
        pass
