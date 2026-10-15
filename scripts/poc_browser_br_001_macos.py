#!/usr/bin/env python3
"""BR-001 macOS Chrome/Edge connection baseline.

Does not launch Chrome or Edge, and does not use `open -a`. A browser that is not
already running is NOT_RUN. A disconnected extension is recorded as not connected;
it is not reloaded by replacing the user page. Does not click Allow, attach CDP,
move the OS cursor, automate WeChat, change a browser profile, or overwrite ~/.local/bin.

Completion requires both browsers to have USER ping/observe and a reload whose
version matches, plus honest reverse failures, on a clean source SHA.
"""
from __future__ import annotations

import json
import os
import platform
import shutil
import socket
import subprocess
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / ".local" / "browser-cu" / "br-001.json"
VCU = ROOT / "target" / "debug" / "vcu"
DAEMON = ROOT / "target" / "debug" / "vcu-daemon"
MARKER = f"vcu-br001-{os.getpid()}-{int(time.time())}"
BROWSERS = ("chrome", "edge")
MAIN = {
    "chrome": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "edge": "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
}
APP = {"chrome": "Google Chrome", "edge": "Microsoft Edge"}


def run(cmd: list[str], timeout: float = 30) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["PATH"] = f"{ROOT / 'target' / 'debug'}{os.pathsep}{env.get('PATH', '')}"
    return subprocess.run(
        cmd,
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        env=env,
    )


def step(report: dict, name: str, status: str, **detail) -> None:
    item = {"name": name, "status": status}
    item.update({k: v for k, v in detail.items() if v is not None})
    report["checks"].append(item)
    print(f"{status.upper():7} {name}", flush=True)


def load_config() -> dict:
    path = Path.home() / ".vcu" / "config.json"
    return json.loads(path.read_text()) if path.exists() else {}


def endpoint() -> str:
    cfg = load_config()
    host = cfg.get("daemon_host") or "127.0.0.1"
    port = int(cfg.get("daemon_port") or 17890)
    return f"http://{host}:{port}"


def token() -> str:
    return str(load_config().get("pairing_token") or "")


def http_json(method: str, path: str, body: dict | None = None, timeout: float = 20) -> tuple[int, dict]:
    data = None if body is None else json.dumps(body).encode()
    headers = {"X-Vcu-Token": token(), "Content-Type": "application/json"}
    req = urllib.request.Request(endpoint() + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            parsed = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            parsed = {"ok": False, "error": {"message": raw[:500]}}
        return exc.code, parsed
    except Exception as exc:
        return 0, {"ok": False, "error": {"message": str(exc)}}


def cli(args: list[str], timeout: float = 40) -> tuple[int, dict, str]:
    proc = run([str(VCU), "--json", *args], timeout=timeout)
    text = (proc.stdout or "").strip()
    parsed: dict = {}
    if text:
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            parsed = {"ok": False, "error": {"message": text[:800]}}
    elif proc.stderr:
        parsed = {"ok": False, "error": {"message": proc.stderr[-800:]}}
    return proc.returncode, parsed, proc.stderr or ""


def main_pids() -> dict[str, list[int]]:
    found = {kind: [] for kind in BROWSERS}
    proc = run(["ps", "-ax", "-o", "pid=,command="], timeout=10)
    for line in (proc.stdout or "").splitlines():
        for kind, path in MAIN.items():
            if path in line and "Helper" not in line:
                pid = line.strip().split(" ", 1)[0]
                if pid.isdigit():
                    found[kind].append(int(pid))
    return found


def lens_runtime_id(kind: str) -> str | None:
    root = Path.home() / "Library" / "Application Support" / APP[kind]
    if not root.exists():
        return None
    for path in root.glob("**/Secure Preferences"):
        try:
            data = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        settings = ((data.get("extensions") or {}).get("settings") or {})
        for ext_id, ext in settings.items():
            norm = str(ext.get("path") or "").replace("\\", "/").lower().rstrip("/")
            if len(ext_id) == 32 and norm.endswith("/.vcu/lens-extension"):
                return ext_id
    return None


def health_up() -> bool:
    try:
        with urllib.request.urlopen(endpoint() + "/v1/health", timeout=2) as resp:
            return resp.status == 200
    except Exception:
        return False


def daemon_start() -> bool:
    if health_up():
        return True
    proc = run([str(VCU), "daemon", "start", "--json"], timeout=20)
    deadline = time.time() + 8
    while time.time() < deadline:
        if health_up():
            return True
        time.sleep(0.2)
    return health_up() or proc.returncode == 0 and health_up()


def daemon_stop() -> None:
    run([str(VCU), "daemon", "stop"], timeout=15)


def wait_health_down(timeout: float = 5) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if not health_up():
            return True
        time.sleep(0.2)
    return not health_up()


def run_disconnect_reconnect(report: dict, preexisting: bool) -> None:
    report["reverse_stopped_preexisting"] = preexisting
    daemon_stop()
    down = wait_health_down()
    down_code, body, _ = cli(["browser", "ping"], timeout=15)
    down_msg = str((body.get("error") or {}).get("message") or body)
    honest = down and body.get("ok") is not True and not health_up()
    step(
        report,
        "reverse_disconnect",
        "pass" if honest else "fail",
        http=down_code,
        health_down=down,
        preexisting=preexisting,
        error=down_msg[-300:],
    )
    daemon_start()
    back = wait_poll(12)
    profile = (back.get("data") or back).get("extension_profile")
    step(
        report,
        "reconnect_after_daemon_restart",
        "pass" if profile == "user" and health_up() else "fail",
        extension_profile=profile,
        health_up=health_up(),
    )


def wait_poll(timeout: float = 20) -> dict:
    deadline = time.time() + timeout
    last: dict = {}
    while time.time() < deadline:
        code, body, _ = cli(["browser", "login-state"], timeout=15)
        last = body
        data = body.get("data") or body
        if code == 0 and data.get("extension_profile") == "user":
            return body
        time.sleep(1)
    return last


def doctor_browsers(body: dict) -> list[str]:
    checks = ((body.get("data") or body).get("checks") or [])
    for item in checks:
        if item.get("name") == "extension_bridge":
            detail = str(item.get("detail") or "")
            if "browsers=" in detail:
                raw = detail.split("browsers=", 1)[1].strip()
                if raw and raw != "unknown" and raw != "none":
                    return [part for part in raw.split(",") if part]
    return []


def tab_snapshot() -> dict:
    code, body = http_json("GET", "/v1/browser/tabs")
    if code != 200 or body.get("ok") is not True:
        return {"tabs": [], "groups": []}
    data = body.get("data") or {}
    return {"tabs": list(data.get("tabs") or []), "groups": list(data.get("groups") or [])}


def tabs() -> list[dict]:
    return tab_snapshot()["tabs"]


def close_tab(tab_id: str, browser: str) -> dict:
    code, body = http_json("POST", "/v1/browser/close", {"tab_id": tab_id, "browser": browser})
    return {"http": code, "ok": body.get("ok"), "error": (body.get("error") or {}).get("message")}


def restore_tab(tab_id: str, browser: str) -> None:
    # focus_window false alone must not activate. Only an explicit restore,
    # after we have already detected a stolen page, may activate.
    http_json(
        "POST",
        "/v1/browser/select",
        {"tab_id": tab_id, "browser": browser, "focus_window": False, "activate": True},
    )


def focused_tab(kind: str) -> str | None:
    listed = [t for t in tabs() if t.get("browser") == kind and t.get("focused")]
    return str(listed[0].get("tab_id")) if listed else None


def front_app() -> str:
    proc = run(
        ["osascript", "-e", 'tell application "System Events" to get name of first application process whose frontmost is true'],
        timeout=8,
    )
    return (proc.stdout or "").strip().lower()


class Fixture(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        page = (
            "<!doctype html><title>VCU BR-001</title>"
            f"<main id='marker'>{MARKER}</main>"
        ).encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(page)))
        self.end_headers()
        self.wfile.write(page)

    def log_message(self, fmt: str, *args) -> None:
        return


def start_fixture() -> tuple[ThreadingHTTPServer, int]:
    server = ThreadingHTTPServer(("127.0.0.1", 0), Fixture)
    port = int(server.server_address[1])
    import threading

    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, port


def open_reload(kind: str, runtime_id: str) -> bool:
    # macOS `open -a` focuses the browser and replaces the page the user is viewing.
    # A dead worker cannot place reload.html in the collapsed VCU group, so refuse.
    _ = (kind, runtime_id)
    return False



WATCH_SRC = r"""import CoreGraphics
import Foundation

let owner = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "Microsoft Edge"
while true {
    let info = CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as? [[String: Any]] ?? []
    var parts: [String] = []
    for item in info {
        let nameOwner = item[kCGWindowOwnerName as String] as? String ?? ""
        guard nameOwner == owner else { continue }
        let layer = item[kCGWindowLayer as String] as? Int ?? -1
        guard layer == 0 else { continue }
        let bounds = item[kCGWindowBounds as String] as? [String: Any] ?? [:]
        let width = Int((bounds["Width"] as? Double) ?? 0)
        let height = Int((bounds["Height"] as? Double) ?? 0)
        guard width > 400 && height > 300 else { continue }
        let number = item[kCGWindowNumber as String] as? Int ?? -1
        let title = (item[kCGWindowName as String] as? String ?? "").replacingOccurrences(of: "\t", with: " ").replacingOccurrences(of: "|", with: "/")
        parts.append("\(number)|\(width)x\(height)|\(title)")
    }
    let line = parts.joined(separator: "\t") + "\n"
    if let data = line.data(using: .utf8) {
        FileHandle.standardOutput.write(data)
    }
    Thread.sleep(forTimeInterval: 0.005)
}
"""
WATCH_BIN = ROOT / ".local" / "browser-cu" / "window-watch"
FIXTURE_TITLE = "VCU BR-001"


def ensure_window_watch() -> Path:
    WATCH_BIN.parent.mkdir(parents=True, exist_ok=True)
    src = WATCH_BIN.with_suffix(".swift")
    if WATCH_BIN.exists() and src.exists() and src.read_text() == WATCH_SRC:
        return WATCH_BIN
    src.write_text(WATCH_SRC)
    proc = run(["swiftc", "-O", "-o", str(WATCH_BIN), str(src)], timeout=90)
    if proc.returncode != 0 or not WATCH_BIN.exists():
        raise RuntimeError((proc.stderr or proc.stdout or "swiftc failed")[-400:])
    return WATCH_BIN


def parse_watch_line(line: str) -> list[dict]:
    windows = []
    for part in line.split("\t"):
        bits = part.split("|", 2)
        if len(bits) != 3 or not bits[0]:
            continue
        windows.append({"id": bits[0], "size": bits[1], "title": bits[2]})
    return windows


def read_watch_line(proc, timeout: float = 0.05) -> str | None:
    import select

    if proc.stdout is None:
        return None
    ready, _, _ = select.select([proc.stdout], [], [], timeout)
    if not ready:
        return None
    raw = proc.stdout.readline()
    if not raw:
        return None
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", "replace")
    return raw.strip()


def quiet_screenshot(kind: str, tab_id: str, protected: str | None, user_window, front_before: str, fixture_url: str) -> dict:
    import threading

    before_state = tab_snapshot()
    protected_tab = next((t for t in before_state["tabs"] if protected and str(t.get("tab_id")) == str(protected)), None)
    protected_url = str((protected_tab or {}).get("url") or "")
    protected_title = str((protected_tab or {}).get("title") or "")
    holder: dict = {}
    watcher = None
    try:
        watcher = subprocess.Popen(
            [str(ensure_window_watch()), APP[kind]],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
        baseline = None
        deadline = time.time() + 2
        while baseline is None and time.time() < deadline:
            line = read_watch_line(watcher, 0.1)
            if line:
                baseline = parse_watch_line(line)
        baseline = baseline or []
        protected_cg = next((item for item in baseline if protected_title and item["title"] == protected_title), None)
        baseline_ids = {item["id"] for item in baseline}

        def run_shot() -> None:
            holder["result"] = cli(["browser", "screenshot", "--tab", tab_id, "--browser", kind], timeout=40)

        fronts: list[str] = []
        stop = threading.Event()

        def watch_front() -> None:
            while not stop.is_set():
                fronts.append(front_app())
                stop.wait(0.25)

        worker = threading.Thread(target=run_shot)
        front_worker = threading.Thread(target=watch_front)
        worker.start()
        front_worker.start()
        samples = []
        while worker.is_alive():
            line = read_watch_line(watcher, 0.02)
            if line:
                samples.append(parse_watch_line(line))
        for _ in range(5):
            line = read_watch_line(watcher, 0.02)
            if not line:
                break
            samples.append(parse_watch_line(line))
        stop.set()
        worker.join(timeout=2)
        front_worker.join(timeout=1)
        code, body, err = holder.get("result", (0, {}, "screenshot did not return"))
        data = body.get("data") or body
        capture_window = str(data.get("capture_window_id") or "")
        protected_id = None if protected_cg is None else protected_cg["id"]
        stolen_active = []
        if protected_id:
            for sample in samples:
                current = next((item for item in sample if item["id"] == protected_id), None)
                if current is None or current["title"] != protected_title:
                    stolen_active.append(sample)
                    break
        new_ids = sorted({
            item["id"]
            for sample in samples
            for item in sample
            if item["id"] not in baseline_ids
        })
        fixture_seen = any(
            item["id"] != protected_id and FIXTURE_TITLE in item["title"]
            for sample in samples
            for item in sample
        )
        saw_quiet = bool(new_ids or fixture_seen)
        stole_front = [
            item for item in fronts
            if front_before not in {"microsoft edge", "google chrome"} and item in {"microsoft edge", "google chrome"}
        ]
        after_state = tab_snapshot()
        expanded_after = [
            group for group in after_state["groups"]
            if str(group.get("window_id")) == str(user_window) and group.get("collapsed") is not True
        ]
        evidence = {
            "http": code,
            "ok": body.get("ok"),
            "background_capture": data.get("background_capture"),
            "capture_window_id": capture_window or None,
            "user_window_id": str(user_window),
            "source": data.get("source"),
            "sampler": "coregraphics",
            "samples": len(samples),
            "baseline_windows": len(baseline),
            "protected_cg_window": protected_id,
            "saw_quiet_window": saw_quiet,
            "new_window_ids": new_ids[:6],
            "fixture_title_seen": fixture_seen,
            "user_group_expansions": data.get("user_group_expansions"),
            "protected_url": protected_url,
            "protected_title_unchanged": not stolen_active,
            "stolen_active": stolen_active[:1],
            "expanded_user_window_groups": [
                {key: group.get(key) for key in ("group_id", "title", "collapsed", "window_id")}
                for group in expanded_after[:3]
            ],
            "fronts": sorted({item for item in fronts if item}),
            "error": (body.get("error") or {}).get("message") or (err or "")[-200:],
        }
        if body.get("ok") is not True:
            return {"ok": False, "detail": "background screenshot failed", "evidence": evidence}
        if data.get("background_capture") is not True:
            return {"ok": False, "detail": "inactive tab screenshot was not a background capture", "evidence": evidence}
        in_place = data.get("in_place_capture") is True
        evidence["in_place_capture"] = in_place
        if in_place:
            if stolen_active or expanded_after or stole_front:
                return {"ok": False, "detail": "in-place captureTab moved the page being read", "evidence": evidence}
            if data.get("user_group_expansions") not in (0, None):
                return {"ok": False, "detail": "in-place captureTab expanded a user group", "evidence": evidence}
            return {"ok": True, "detail": "captureTab stayed in the collapsed group and did not move the page being read", "evidence": evidence}
        if not capture_window or capture_window == str(user_window):
            return {"ok": False, "detail": "background screenshot stayed in the user window", "evidence": evidence}
        if not protected_url or not protected_title or protected_cg is None:
            return {"ok": False, "detail": "protected page was not visible to the window sampler", "evidence": evidence}
        if stolen_active:
            return {"ok": False, "detail": "background screenshot replaced the user focused tab", "evidence": evidence}
        if expanded_after:
            return {"ok": False, "detail": "background screenshot left a group expanded in the user window", "evidence": evidence}
        if stole_front:
            return {"ok": False, "detail": "background screenshot stole the OS front app", "evidence": evidence}
        if data.get("user_group_expansions") != 0:
            return {"ok": False, "detail": "background screenshot did not report zero user-group expansions", "evidence": evidence}
        if len(samples) < 3:
            return {"ok": False, "detail": "screenshot sampler did not watch the move", "evidence": evidence}
        if not saw_quiet:
            return {"ok": False, "detail": "sampler did not see the fixture leave the user window", "evidence": evidence}
        return {"ok": True, "detail": "background screenshot stayed outside the user window", "evidence": evidence}
    finally:
        if watcher is not None and watcher.poll() is None:
            watcher.terminate()
            try:
                watcher.wait(timeout=1)
            except subprocess.TimeoutExpired:
                watcher.kill()


def version_of(body: dict) -> str:
    data = body.get("data") or body
    ext = data.get("extension") or {}
    ping = ext.get("ping") or {}
    return str(ext.get("version") or ping.get("version") or data.get("version") or "")


def check_status(report: dict, name: str) -> str | None:
    for item in report["checks"]:
        if item.get("name") == name:
            return item.get("status")
    return None


def finish(report: dict) -> int:
    statuses = [item["status"] for item in report["checks"]]
    both = all(report["browsers"].get(kind, {}).get("status") == "pass" for kind in BROWSERS)
    dirty = bool(report.get("source", {}).get("dirty"))
    failed = any(status == "fail" for status in statuses)
    reverse = check_status(report, "reverse_disconnect")
    reconnect = check_status(report, "reconnect_after_daemon_restart")
    reverse_ok = reverse == "pass" and reconnect == "pass"
    report["ok"] = both and not failed and "pass" in statuses and reverse_ok
    report["completion_allowed"] = bool(report["ok"] and not dirty)
    if not both:
        report["note"] = "one browser cannot cover the baseline; missing browsers stay NOT_RUN"
    elif not reverse_ok:
        report["note"] = "disconnect and reconnect must be executed; not_run is not a pass"
    elif dirty:
        report["note"] = "dirty worktree evidence is not a completion claim"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({
        "ok": report["ok"],
        "completion_allowed": report["completion_allowed"],
        "out": str(OUT),
    }))
    return 0 if report["ok"] else 1


def run_reverse_tests(report: dict) -> None:
    cargo = run(
        [
            "cargo", "test", "-p", "vcu-server", "--offline", "--lib",
            "extension_on_agent_profile_is_not_login_state", "--", "--exact",
        ],
        timeout=180,
    )
    step(
        report,
        "reverse_agent_profile_unit",
        "pass" if cargo.returncode == 0 else "fail",
        detail="classify_extension_profile agent is not login-state; no Agent profile created",
        tail=(cargo.stderr or cargo.stdout or "")[-300:],
    )
    bridge = run(
        [
            "cargo", "test", "-p", "vcu-server", "--offline", "--test", "extension_bridge",
            "reload_all_clients", "--", "--test-threads=8",
        ],
        timeout=180,
    )
    step(
        report,
        "reverse_reload_targets_each_client",
        "pass" if bridge.returncode == 0 else "fail",
        detail="reload_self is targeted per connected client; no Allow click",
        tail=(bridge.stderr or "")[-300:],
    )
    gates = run(
        ["cargo", "test", "-p", "vcu-server", "--offline", "--test", "browser_gates", "--", "--test-threads=8"],
        timeout=240,
    )
    step(
        report,
        "reverse_browser_gates",
        "pass" if gates.returncode == 0 else "fail",
        detail="browser_gates includes extract_requires_user_extension, ping_unknown_method_is_stale, and login_state_marks_stale_sw; live stale SW was not injected",
        tail=(gates.stderr or "")[-300:],
    )
    tests = sorted(str(path) for path in (ROOT / "extension" / "tests").glob("*.test.cjs"))
    node = run(["node", "--test", *tests], timeout=90)
    step(
        report,
        "reverse_extension_node",
        "pass" if tests and node.returncode == 0 else "fail",
        tests=tests,
        tail=(node.stderr or node.stdout or "")[-300:],
    )


def browser_pass(report: dict, kind: str, **detail) -> None:
    report["browsers"][kind] = {"status": "pass", **detail}
    step(report, f"{kind}_baseline", "pass", **detail)


def browser_gap(report: dict, kind: str, status: str, **detail) -> None:
    report["browsers"][kind] = {"status": status, **detail}
    step(report, f"{kind}_baseline", status, **detail)


def live_browser(report: dict, kind: str, port: int, started_daemon: bool) -> list[str]:
    created: list[str] = []
    before = tabs()
    before_focused = focused_tab(kind)
    front_before = front_app()
    url = f"http://127.0.0.1:{port}/br001.html"
    code, opened, err = cli(
        ["browser", "open", "--url", url, "--background", "--browser", kind, "--session-name", f"VCU-BR001-{MARKER[-6:]}"],
        timeout=30,
    )
    opened_tabs = [t for t in tabs() if str(t.get("url") or "").startswith(url) and t.get("browser") == kind]
    if not opened_tabs:
        browser_gap(report, kind, "fail", detail="fixture tab was not opened", http=code, error=(opened.get("error") or {}).get("message") or err[-200:])
        return created
    tab_id = str(opened_tabs[-1].get("tab_id"))
    created.append(tab_id)
    state = tab_snapshot()
    fixture = next((t for t in state["tabs"] if str(t.get("tab_id")) == tab_id), opened_tabs[-1])
    group = next((g for g in state["groups"] if str(g.get("group_id")) == str(fixture.get("group_id"))), None)
    still_focused = focused_tab(kind)
    if fixture.get("active") or fixture.get("focused") or (before_focused and still_focused and still_focused != before_focused):
        browser_gap(
            report,
            kind,
            "fail",
            detail="open replaced the user focused tab",
            before_focused=before_focused,
            after_focused=still_focused,
            tab_id=tab_id,
        )
        return created
    if (
        not group
        or group.get("collapsed") is not True
        or str(group.get("window_id")) != str(fixture.get("window_id"))
        or str(fixture.get("window_id")) != str(opened_tabs[-1].get("window_id"))
    ):
        browser_gap(
            report,
            kind,
            "fail",
            detail="open did not stay in a collapsed group in the user window",
            tab_id=tab_id,
            group=None if not group else {key: group.get(key) for key in ("group_id", "title", "collapsed", "window_id")},
        )
        return created
    obs_code, obs, _ = cli(["browser", "observe", "--browser", kind, "--tab", tab_id, "--pixels", "false"], timeout=30)
    data = obs.get("data") or obs
    source = str(data.get("source") or (data.get("snapshot") or {}).get("source") or "")
    if obs.get("ok") is not True:
        browser_gap(report, kind, "fail", detail="observe failed", error=(obs.get("error") or {}).get("message"), tab_id=tab_id)
        return created
    ext_code, extracted = http_json("POST", "/v1/browser/extract", {"selector": "#marker", "tab_id": tab_id, "browser": kind})
    text = json.dumps(extracted)
    if MARKER not in text or extracted.get("ok") is not True:
        browser_gap(report, kind, "fail", detail="extract did not read the fixture marker", http=ext_code, source=source, tab_id=tab_id)
        return created
    extract_source = str((extracted.get("data") or {}).get("source") or "")
    if extract_source and extract_source != "extension_dom":
        browser_gap(report, kind, "fail", detail="extract source is not extension_dom", source=extract_source)
        return created
    shot = quiet_screenshot(kind, tab_id, before_focused, opened_tabs[-1].get("window_id"), front_before, url)
    if not shot["ok"]:
        if before_focused:
            restore_tab(before_focused, kind)
        browser_gap(report, kind, "fail", detail=shot["detail"], tab_id=tab_id, screenshot=shot["evidence"])
        return created
    after_extract = focused_tab(kind)
    if before_focused and after_extract and after_extract != before_focused:
        restore_tab(before_focused, kind)
        browser_gap(
            report,
            kind,
            "fail",
            detail="observe/extract replaced the user focused tab",
            before_focused=before_focused,
            after_focused=after_extract,
            tab_id=tab_id,
        )
        return created
    ping_code, ping, _ = cli(["browser", "ping"], timeout=20)
    before_version = version_of(ping)
    reload_code, reloaded = http_json(
        "POST",
        "/v1/browser/ping",
        {"reload": True, "allow_page_reload": False},
        timeout=40,
    )
    time.sleep(1.5)
    after_code, after, _ = cli(["browser", "ping"], timeout=20)
    after_version = version_of(after)
    manifest_version = json.loads((ROOT / "extension" / "manifest.json").read_text()).get("version")
    reload_ok = reloaded.get("ok") is True and after.get("ok") is True and after_version == manifest_version
    new_reload_tabs = [
        t for t in tabs()
        if "/reload.html" in str(t.get("url") or "") and t.get("browser") == kind and str(t.get("tab_id")) not in {str(x.get("tab_id")) for x in before}
    ]
    for tab in new_reload_tabs:
        close_tab(str(tab.get("tab_id")), kind)
    after_reload = focused_tab(kind)
    page_stolen = bool(before_focused and after_reload and after_reload != before_focused)
    if page_stolen:
        restore_tab(before_focused, kind)
    if not reload_ok or page_stolen:
        browser_gap(
            report,
            kind,
            "fail",
            detail="reload did not restore the same extension version" if not reload_ok else "reload replaced the user focused tab",
            before_focused=before_focused,
            after_focused=after_reload,
            page_stolen=page_stolen,
            before_version=before_version,
            after_version=after_version,
            manifest_version=manifest_version,
            reload_http=reload_code,
            ping_http=after_code,
            reload_error=(reloaded.get("error") or {}).get("message"),
        )
        return created
    front_after = front_app()
    stole_front = front_before not in {"microsoft edge", "google chrome"} and front_after in {"microsoft edge", "google chrome"}
    if stole_front:
        browser_gap(
            report,
            kind,
            "fail",
            detail="browser operation stole the OS front app",
            front_before=front_before,
            front_after=front_after,
            before_focused=before_focused,
            after_focused=after_reload,
            tab_id=tab_id,
        )
        return created
    browser_pass(
        report,
        kind,
        tab_id=tab_id,
        observe_source=source or "extension_lens",
        extract_source=extract_source or "extension_dom",
        version=after_version,
        before_version=before_version,
        reload_tabs_closed=len(new_reload_tabs),
        ping_http=ping_code,
        started_daemon=started_daemon,
        os_cursor_used=False,
        allow_clicked=False,
        before_focused=before_focused,
        after_focused=after_reload,
        protected_tab_unchanged=bool(before_focused and after_reload == before_focused),
        front_before=front_before,
        front_after=front_after,
        screenshot=shot["evidence"],
    )
    return created


def main() -> int:
    report: dict = {
        "id": "BR-001",
        "ok": False,
        "completion_allowed": False,
        "checks": [],
        "browsers": {},
        "os_cursor_used": False,
        "allow_clicked": False,
        "cold_started": False,
        "profile_changed": False,
        "wechat_touched": False,
        "codex_cu_touched": False,
        "note": "completion requires both browsers, honest reverse failures, and a clean SHA",
    }
    identity = run(["git", "rev-parse", "HEAD"], timeout=10)
    status = run(["git", "status", "--porcelain"], timeout=10)
    report["source"] = {
        "sha": (identity.stdout or "").strip(),
        "dirty": bool((status.stdout or "").strip()),
        "porcelain": (status.stdout or "").strip().splitlines(),
    }
    report["host"] = {
        "os": platform.platform(),
        "machine": platform.machine(),
        "python": platform.python_version(),
        "product": subprocess.getoutput("sw_vers -productVersion"),
    }
    if platform.system() != "Darwin":
        step(report, "platform", "untested", detail=platform.system())
        return finish(report)
    if not VCU.exists() or not DAEMON.exists():
        step(report, "worktree_binary", "fail", vcu=str(VCU), daemon=str(DAEMON))
        return finish(report)
    step(report, "worktree_binary", "pass", vcu=str(VCU), daemon=str(DAEMON), local_bin_untouched=True)
    before_pids = main_pids()
    report["running_before"] = before_pids
    for kind in BROWSERS:
        report["lens_runtime_id"] = report.get("lens_runtime_id") or {}
        report["lens_runtime_id"][kind] = lens_runtime_id(kind)
    run_reverse_tests(report)

    already = health_up()
    started = False
    if not already:
        started = daemon_start()
    if not health_up():
        step(report, "daemon", "fail", detail="worktree daemon did not become healthy")
        for kind in BROWSERS:
            browser_gap(report, kind, "not_run" if not before_pids[kind] else "fail", detail="daemon unavailable")
        return finish(report)
    step(report, "daemon", "pass", started_by_poc=not already, endpoint=endpoint())

    login = wait_poll(20)
    login_data = login.get("data") or login
    if login_data.get("extension_profile") != "user":
        step(
            report,
            "visible_reload_refused",
            "pass",
            detail="extension was not polling; open -a was not used and the current page was not replaced",
        )
    code, doctor, _ = cli(["doctor"], timeout=30)
    polling = doctor_browsers(doctor)
    report["polling_browsers"] = polling
    step(
        report,
        "login_state",
        "pass" if login_data.get("never_click_allow") is True else "fail",
        extension_profile=login_data.get("extension_profile"),
        next_action=login_data.get("next_action"),
        user_pids=[item.get("pid") for item in (login_data.get("user_browsers") or [])],
        doctor_http=code,
    )
    action = str(login_data.get("next_action") or "")
    asks_for_allow = "click Allow debugging" in action or "User: click Allow" in action
    step(
        report,
        "never_click_allow",
        "pass" if login_data.get("never_click_allow") is True and not asks_for_allow else "fail",
        never_click_allow=login_data.get("never_click_allow"),
        asks_for_allow=asks_for_allow,
    )

    connected = set(polling)
    fixture, port = start_fixture()
    created: list[tuple[str, str]] = []
    try:
        for kind in BROWSERS:
            if not before_pids[kind]:
                browser_gap(report, kind, "not_run", detail="browser process was not running; not cold-started")
                continue
            if kind not in connected and login_data.get("extension_profile") != "user":
                browser_gap(report, kind, "fail", detail="USER extension did not poll; Allow was not clicked")
                continue
            if connected and kind not in connected:
                browser_gap(report, kind, "not_run", detail="browser is running but its lens is not polling; not rebound to the other browser")
                continue
            for tab_id in live_browser(report, kind, port, started):
                created.append((kind, tab_id))
        for kind, tab_id in created:
            close_tab(tab_id, kind)
        created.clear()
        missing = "chrome" if "chrome" not in connected else None
        if missing and before_pids.get("edge") and "edge" in (connected or {"edge"}):
            wrong_code, wrong, _ = cli(["browser", "observe", "--browser", "chrome", "--pixels", "false"], timeout=20)
            wrong_ok = wrong.get("ok") is True
            step(
                report,
                "reverse_missing_chrome_not_rebound",
                "fail" if wrong_ok else "pass",
                http=wrong_code,
                error=(wrong.get("error") or {}).get("message"),
            )
        if login.get("ok") is True or login_data.get("extension_profile") == "user":
            run_disconnect_reconnect(report, preexisting=not started)
    finally:
        for kind, tab_id in created:
            close_tab(tab_id, kind)
        leftover = [t for t in tabs() if MARKER in str(t.get("url") or "") or f"VCU-BR001-{MARKER[-6:]}" in str(t.get("title") or "")]
        for tab in leftover:
            close_tab(str(tab.get("tab_id")), str(tab.get("browser") or "edge"))
        fixture.shutdown()
        if started:
            daemon_stop()
        elif report.get("reverse_stopped_preexisting") and not health_up():
            daemon_start()
    after_pids = main_pids()
    report["running_after"] = after_pids
    launched = any(set(after_pids[kind]) - set(before_pids[kind]) for kind in BROWSERS)
    report["cold_started"] = launched
    step(report, "no_cold_start", "fail" if launched else "pass", before=before_pids, after=after_pids)
    if "chrome" not in report["browsers"]:
        browser_gap(report, "chrome", "not_run", detail="not recorded")
    if "edge" not in report["browsers"]:
        browser_gap(report, "edge", "not_run", detail="not recorded")
    return finish(report)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps({"id": "BR-001", "ok": False, "completion_allowed": False, "error": str(exc)}, indent=2) + "\n")
        raise
