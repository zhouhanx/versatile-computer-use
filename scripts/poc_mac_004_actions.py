#!/usr/bin/env python3
"""MAC-004 bound press/set with independent readback.

Dry-run first, then live-check a self-built TextEdit document and the AX
fixture button. A locked screen fails before any GUI launch. Does not reset
TCC, click Edge Allow, move the OS cursor, or automate WeChat.
"""
from __future__ import annotations

import json
import os
import platform
import signal
import socket
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / ".local" / "desktop-cu" / "mac-MAC-004.json"
USER_DIR = ROOT / ".local" / "desktop-cu" / "mac004-daemon"
FIXTURE_APP = ROOT / ".local" / "desktop-cu" / "VCUAxBinding.app"
FIXTURE_BIN = FIXTURE_APP / "Contents" / "MacOS" / "vcu-ax-binding"
VCU = ROOT / "target" / "debug" / "vcu"
PROCESS = "vcu-ax-binding"
DOC_NAME = "VCU-MAC-004"
DOC_FILE = ROOT / ".local" / "desktop-cu" / "VCU-MAC-004.txt"


def run(cmd: list[str], timeout: float = 60) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
    )


def screen_locked() -> bool | None:
    script = """
ObjC.import("CoreGraphics");
const dict = ObjC.deepUnwrap(ObjC.castRefToObject($.CGSessionCopyCurrentDictionary()));
JSON.stringify(!!(dict && dict.CGSSessionScreenIsLocked));
"""
    result = run(["osascript", "-l", "JavaScript", "-e", script], timeout=8)
    if result.returncode != 0:
        return None
    raw = (result.stdout or "").strip().lower()
    if raw == "true":
        return True
    if raw == "false":
        return False
    return None


def mouse_location() -> dict | None:
    script = """
ObjC.import("CoreGraphics");
const event = $.CGEventCreate(null);
const point = $.CGEventGetLocation(event);
JSON.stringify({x: point.x, y: point.y});
"""
    result = run(["osascript", "-l", "JavaScript", "-e", script], timeout=8)
    if result.returncode != 0:
        return None
    try:
        parsed = json.loads(result.stdout or "")
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def step(report: dict, name: str, status: str, **extra: object) -> None:
    item = {"name": name, "status": status}
    item.update(extra)
    report["checks"].append(item)


def blob(value: object) -> str:
    return json.dumps(value, ensure_ascii=False)


def api(method: str, path: str, token: str, endpoint: str, body: dict | None = None, timeout: float = 25) -> tuple[int, dict]:
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        endpoint.rstrip("/") + path,
        data=data,
        method=method,
        headers={"X-Vcu-Token": token, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", "replace")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        try:
            parsed = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            parsed = {"raw": raw[:500]}
        return exc.code, parsed
    except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as exc:
        return 0, {"error": str(exc)[:300]}


def payload_of(envelope: dict) -> dict:
    if isinstance(envelope.get("data"), dict):
        return envelope["data"]
    return envelope


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def start_daemon(report: dict) -> tuple[subprocess.Popen[str] | None, str, str]:
    if USER_DIR.exists():
        subprocess.run(["rm", "-rf", str(USER_DIR)], check=False)
    USER_DIR.mkdir(parents=True, exist_ok=True)
    token = os.urandom(32).hex()
    port = free_port()
    config = {
        "version": 1,
        "pairing_token": token,
        "daemon_host": "127.0.0.1",
        "daemon_port": port,
        "app_allowlist": [PROCESS, "TextEdit", "Terminal"],
    }
    (USER_DIR / "config.json").write_text(json.dumps(config))
    proc = subprocess.Popen(
        [str(VCU), "--user-dir", str(USER_DIR), "daemon", "start", "--foreground"],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    endpoint = f"http://127.0.0.1:{port}"
    for _ in range(50):
        code, _body = api("GET", "/v1/health", token, endpoint, timeout=2)
        if code == 200:
            step(report, "isolated_daemon", "pass", endpoint=endpoint, pid=proc.pid)
            return proc, token, endpoint
        if proc.poll() is not None:
            err = proc.stderr.read()[:400] if proc.stderr else ""
            step(report, "isolated_daemon", "fail", stderr=err)
            return None, "", ""
        time.sleep(0.1)
    step(report, "isolated_daemon", "fail", detail="health timeout")
    return proc, token, endpoint


def stop_daemon(proc: subprocess.Popen[str] | None) -> None:
    if proc is None or proc.poll() is not None:
        return
    proc.send_signal(signal.SIGTERM)
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


def compile_fixture(report: dict) -> bool:
    if FIXTURE_APP.exists():
        subprocess.run(["rm", "-rf", str(FIXTURE_APP)], check=False)
    FIXTURE_BIN.parent.mkdir(parents=True, exist_ok=True)
    compiled = run(
        ["swiftc", "-framework", "AppKit", "-framework", "Foundation", "-o", str(FIXTURE_BIN), "scripts/fixtures/mac_ax_binding_fixture.swift"],
        timeout=90,
    )
    if compiled.returncode != 0:
        step(report, "fixture_build", "fail", stderr=(compiled.stderr or "")[:500])
        return False
    plist = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>vcu-ax-binding</string>
<key>CFBundleIdentifier</key><string>local.vcu.ax-binding</string>
<key>CFBundleName</key><string>vcu-ax-binding</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>LSMinimumSystemVersion</key><string>12.0</string>
<key>NSPrincipalClass</key><string>NSApplication</string>
<key>LSBackgroundOnly</key><false/>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
"""
    (FIXTURE_APP / "Contents" / "Info.plist").write_text(plist)
    signed = run(["codesign", "-s", "-", "--force", str(FIXTURE_APP)], timeout=20)
    if signed.returncode != 0:
        step(report, "fixture_build", "fail", stderr=(signed.stderr or signed.stdout or "")[:400])
        return False
    step(report, "fixture_build", "pass", bin=str(FIXTURE_BIN))
    return True


def launch_fixture(report: dict) -> subprocess.Popen[str] | None:
    proc = subprocess.Popen(
        [str(FIXTURE_BIN)],
        cwd=ROOT,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    assert proc.stdout is not None
    line = ""
    deadline = time.time() + 8
    while time.time() < deadline and not line:
        if proc.poll() is not None:
            err = proc.stderr.read()[:400] if proc.stderr else ""
            step(report, "fixture_launch", "fail", stderr=err)
            return None
        chunk = proc.stdout.readline()
        if chunk:
            line = chunk.strip()
    if not line:
        step(report, "fixture_launch", "fail", detail="no ready line")
        proc.kill()
        return None
    try:
        ready = json.loads(line)
    except json.JSONDecodeError:
        step(report, "fixture_launch", "fail", stdout=line[:200])
        proc.kill()
        return None
    if ready.get("ax_windows") != 2:
        step(report, "fixture_launch", "fail", ready=ready)
        proc.kill()
        return None
    step(report, "fixture_launch", "pass", pid=ready.get("pid"), ax_windows=ready.get("ax_windows"))
    report["fixture"] = ready
    time.sleep(0.6)
    return proc


def command(proc: subprocess.Popen[str], name: str, timeout: float = 5) -> dict:
    assert proc.stdin is not None and proc.stdout is not None
    proc.stdin.write(name + "\n")
    proc.stdin.flush()
    deadline = time.time() + timeout
    while time.time() < deadline:
        line = proc.stdout.readline()
        if not line:
            break
        if line.startswith("ACK "):
            return json.loads(line[4:])
    return {"ok": False, "error": "command timeout", "command": name}


def window_ids(process: str, pid: int | None = None) -> list[dict]:
    script = """
ObjC.import("CoreGraphics");
const info = ObjC.castRefToObject($.CGWindowListCopyWindowInfo(1, 0));
const rows = ObjC.deepUnwrap(info);
const want = "__NAME__";
const wantPid = __PID__;
const mine = rows.filter(w => {
  if (Number(w.kCGWindowLayer) !== 0) return false;
  if (wantPid > 0) return Number(w.kCGWindowOwnerPID) === wantPid;
  return String(w.kCGWindowOwnerName || "") === want;
}).map(w => ({
  id: Number(w.kCGWindowNumber),
  title: String(w.kCGWindowName || ""),
  owner: String(w.kCGWindowOwnerName || ""),
  pid: Number(w.kCGWindowOwnerPID || 0)
}));
JSON.stringify(mine);
""".replace("__NAME__", process).replace("__PID__", str(pid or 0))
    result = run(["osascript", "-l", "JavaScript", "-e", script], timeout=15)
    if result.returncode != 0:
        return []
    try:
        rows = json.loads(result.stdout or "[]")
    except json.JSONDecodeError:
        return []
    return [row for row in rows if isinstance(row, dict) and int(row.get("id") or 0) > 0]


def snapshot(token: str, endpoint: str, app_id: str, window_id: int | None = None) -> tuple[int, dict]:
    body: dict = {"id": app_id, "scene": True, "budget": 4000, "max_nodes": 120, "max_depth": 10, "timeout_ms": 6000}
    if window_id:
        body["window_id"] = window_id
    return api("POST", "/v1/app/snapshot", token, endpoint, body, timeout=25)


def elements(body: dict) -> list[dict]:
    raw = payload_of(body).get("elements") or []
    return [item for item in raw if isinstance(item, dict)]


def by_ident(items: list[dict], ident: str) -> dict | None:
    exact = [item for item in items if item.get("ax_identifier") == ident and item.get("bound_ref")]
    return exact[0] if exact else None


def text_target(items: list[dict]) -> dict | None:
    ranked = []
    for item in items:
        role = str(item.get("role") or "")
        editable = item.get("editable") is True
        actions = item.get("actions") or []
        if not item.get("bound_ref"):
            continue
        if editable or "AXSetValue" in actions or "text" in role.lower():
            ranked.append(item)
    ranked.sort(key=lambda item: (item.get("editable") is True, "text area" in str(item.get("role") or "").lower()), reverse=True)
    return ranked[0] if ranked else None


def presses(status: dict) -> dict:
    raw = status.get("presses") or {}
    return {str(k): int(v) for k, v in raw.items()} if isinstance(raw, dict) else {}


def cursor_clean(detail: dict) -> bool:
    return detail.get("os_cursor_used") is False and detail.get("hid_injected") is False


def textedit_matches(name: str) -> bool:
    return DOC_NAME in name


def textedit_text() -> str:
    script = f'''
tell application "TextEdit"
  set hits to ""
  repeat with d in documents
    if name of d contains "{DOC_NAME}" then set hits to text of d as text
  end repeat
  return hits
end tell
'''
    result = run(["osascript", "-e", script], timeout=12)
    return (result.stdout or "").strip()


def close_textedit() -> None:
    script = f'''
tell application "TextEdit"
  repeat with d in documents
    if name of d contains "{DOC_NAME}" then close d saving no
  end repeat
end tell
'''
    run(["osascript", "-e", script], timeout=12)


def open_textedit(report: dict) -> tuple[str, int] | None:
    DOC_FILE.parent.mkdir(parents=True, exist_ok=True)
    DOC_FILE.write_text("seed\n", encoding="utf-8")
    script = f'''
tell application "TextEdit"
  activate
  open POSIX file "{DOC_FILE}"
  return name of front document
end tell
'''
    created = run(["osascript", "-e", script], timeout=20)
    if created.returncode != 0:
        step(report, "textedit_open", "fail", stderr=(created.stderr or "")[:300])
        return None
    time.sleep(0.6)
    pid = run(["osascript", "-e", 'tell application "System Events" to unix id of process "TextEdit"'], timeout=10)
    pid_text = (pid.stdout or "").strip()
    windows = window_ids("TextEdit", pid=int(pid_text))
    target = next((row for row in windows if DOC_NAME in str(row.get("title") or "")), None)
    if not pid_text.isdigit() or target is None:
        step(
            report,
            "textedit_open",
            "fail",
            pid=pid_text,
            windows=windows,
            stdout=(created.stdout or "")[:200],
            stderr=(created.stderr or "")[:200],
        )
        return None
    step(report, "textedit_open", "pass", pid=int(pid_text), window_id=target["id"], title=target.get("title"), path=str(DOC_FILE))
    return f"proc:TextEdit:{pid_text}", int(target["id"])



def process_pids(name: str) -> set[int]:
    result = run(["pgrep", "-x", name], timeout=5)
    pids = set()
    for line in (result.stdout or "").splitlines():
        line = line.strip()
        if line.isdigit():
            pids.add(int(line))
    return pids



def action_slow_press_gate(report: dict, fixture: subprocess.Popen[str], token: str, endpoint: str, app_id: str, window_id: int) -> None:
    armed = command(fixture, "arm-slow", timeout=8)
    scene_code, scene = snapshot(token, endpoint, app_id, window_id)
    target = by_ident(elements(scene), "go-a")
    if not armed.get("ok") or not target:
        step(report, "action_slow_press_kept", "fail", detail="cannot arm slow go-a", armed=armed, http=scene_code)
        return
    before = presses(command(fixture, "status", timeout=8))
    mouse_before = mouse_location()
    started = time.time()
    code, body = api(
        "POST",
        "/v1/app/invoke",
        token,
        endpoint,
        {"id": app_id, "ref": target["bound_ref"], "scene_id": payload_of(scene).get("scene_id")},
        timeout=12,
    )
    elapsed = round(time.time() - started, 3)
    after = presses(command(fixture, "status", timeout=8))
    mouse_after = mouse_location()
    data = payload_of(body)
    kept = (
        code == 200
        and data.get("verified") is True
        and elapsed < 3.2
        and after.get("go-a") == before.get("go-a", 0) + 1
        and after.get("go-b") == before.get("go-b")
        and cursor_clean(data)
    )
    step(
        report,
        "action_slow_press_kept",
        "pass" if kept else "fail",
        http=code,
        elapsed_s=elapsed,
        body=body,
        before=before,
        after=after,
        mouse_before=mouse_before,
        mouse_after=mouse_after,
    )



def action_edge_press_gate(report: dict, fixture: subprocess.Popen[str], token: str, endpoint: str, app_id: str, window_id: int) -> None:
    armed = command(fixture, "arm-edge", timeout=8)
    scene_code, scene = snapshot(token, endpoint, app_id, window_id)
    target = by_ident(elements(scene), "go-a")
    if not armed.get("ok") or not target:
        step(report, "action_edge_press_kept", "fail", detail="cannot arm edge go-a", armed=armed, http=scene_code)
        return
    before = presses(command(fixture, "status", timeout=8))
    mouse_before = mouse_location()
    started = time.time()
    code, body = api(
        "POST",
        "/v1/app/invoke",
        token,
        endpoint,
        {"id": app_id, "ref": target["bound_ref"], "scene_id": payload_of(scene).get("scene_id")},
        timeout=12,
    )
    elapsed = round(time.time() - started, 3)
    after = presses(command(fixture, "status", timeout=8))
    mouse_after = mouse_location()
    data = payload_of(body)
    kept = (
        code == 200
        and data.get("verified") is True
        and elapsed < 3.6
        and after.get("go-a") == before.get("go-a", 0) + 1
        and after.get("go-b") == before.get("go-b")
        and cursor_clean(data)
    )
    step(
        report,
        "action_edge_press_kept",
        "pass" if kept else "fail",
        http=code,
        elapsed_s=elapsed,
        body=body,
        before=before,
        after=after,
        mouse_before=mouse_before,
        mouse_after=mouse_after,
    )


def action_timeout_gate(report: dict, fixture: subprocess.Popen[str], token: str, endpoint: str, app_id: str, window_id: int) -> None:
    armed = command(fixture, "arm-hang", timeout=8)
    scene_code, scene = snapshot(token, endpoint, app_id, window_id)
    hang = by_ident(elements(scene), "go-a")
    if not armed.get("ok") or not hang:
        step(
            report,
            "action_slow_press_kept",
            "action_edge_press_kept",
            "action_timeout_isolated",
            "fail",
            detail="cannot arm go-a hang",
            armed=armed,
            http=scene_code,
        )
        step(report, "action_timeout_not_replayed", "fail", detail="cannot arm go-a hang")
        return
    before = presses(command(fixture, "status", timeout=8))
    mouse_before = mouse_location()
    started = time.time()
    code, body = api(
        "POST",
        "/v1/app/invoke",
        token,
        endpoint,
        {"id": app_id, "ref": hang["bound_ref"], "scene_id": payload_of(scene).get("scene_id")},
        timeout=12,
    )
    elapsed = round(time.time() - started, 3)
    recovered = presses(command(fixture, "status", timeout=10))
    mouse_after = mouse_location()
    reason = blob(body).lower()
    unchanged = (
        recovered.get("go-a") == before.get("go-a")
        and recovered.get("go-b") == before.get("go-b")
        and recovered.get("go-fail", 0) == before.get("go-fail", 0)
    )
    step(
        report,
        "action_timeout_isolated",
        "pass"
        if code >= 400
        and ("timed out" in reason or "timeout" in reason)
        and elapsed < 5.5
        and unchanged
        else "fail",
        http=code,
        elapsed_s=elapsed,
        body=body,
        before=before,
        after=recovered,
        mouse_before=mouse_before,
        mouse_after=mouse_after,
        target={k: hang.get(k) for k in ("role", "name", "ax_identifier", "index_path", "actions", "bound_ref")},
    )
    replay_started = time.time()
    replay_code, replay = api(
        "POST",
        "/v1/app/invoke",
        token,
        endpoint,
        {"id": app_id, "ref": hang["bound_ref"]},
        timeout=8,
    )
    replay_elapsed = round(time.time() - replay_started, 3)
    after_replay = presses(command(fixture, "status", timeout=8))
    step(
        report,
        "action_timeout_not_replayed",
        "pass"
        if replay_code >= 400
        and "consumed" in blob(replay)
        and replay_elapsed < 3
        and after_replay.get("go-a") == recovered.get("go-a")
        and after_replay.get("go-b") == recovered.get("go-b")
        else "fail",
        http=replay_code,
        elapsed_s=replay_elapsed,
        body=replay,
        presses=after_replay,
    )


def terminal_newline_gate(report: dict, token: str, endpoint: str) -> None:
    before = process_pids("Terminal")
    mouse_before = mouse_location()
    code, body = api(
        "POST",
        "/v1/app/set-value",
        token,
        endpoint,
        {"id": "proc:Terminal:1", "ref": "b1.not-live.n0", "value": "echo\nhi"},
        timeout=10,
    )
    after = process_pids("Terminal")
    mouse_after = mouse_location()
    reason = blob(body)
    step(
        report,
        "terminal_newline_refused",
        "pass"
        if code == 409
        and "refuses newlines" in reason
        and after == before
        else "fail",
        http=code,
        body=body,
        terminal_pids_before=sorted(before),
        terminal_pids_after=sorted(after),
        mouse_before=mouse_before,
        mouse_after=mouse_after,
    )
    text_code, text_body = api(
        "POST",
        "/v1/app/set-value",
        token,
        endpoint,
        {"id": "proc:TextEdit:1", "ref": "b1.not-live.n0", "value": "hello\n"},
        timeout=10,
    )
    text_reason = blob(text_body)
    step(
        report,
        "textedit_newline_not_terminal_gated",
        "pass" if text_code >= 400 and "refuses newlines" not in text_reason else "fail",
        http=text_code,
        body=text_body,
    )

def main() -> int:
    report: dict = {
        "id": "MAC-004",
        "ok": False,
        "checks": [],
        "os_cursor_used": False,
        "note": "completion requires ok=true and a clean source SHA",
    }
    identity = run(["git", "rev-parse", "HEAD"], timeout=10)
    status = run(["git", "status", "--porcelain"], timeout=10)
    dirty = bool((status.stdout or "").strip())
    report["source"] = {"sha": (identity.stdout or "").strip(), "dirty": dirty}
    report["note"] = (
        "dirty worktree evidence is not a completion claim"
        if dirty
        else "completion requires ok=true and a clean source SHA"
    )
    if platform.system() != "Darwin":
        step(report, "platform", "untested", detail=platform.system())
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(report, indent=2) + "\n")
        return 1
    locked = screen_locked()
    if locked is not False:
        step(report, "screen_unlocked", "fail", locked=locked, detail="screen locked or unknown; refusing GUI fixture")
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps({"ok": False, "out": str(OUT)}))
        return 1
    step(report, "screen_unlocked", "pass")
    built = run(["cargo", "build", "-p", "vcu-cli", "--offline"], timeout=180)
    if built.returncode != 0 or not VCU.exists():
        step(report, "cargo_build", "fail", stderr=(built.stderr or "")[-500:])
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(report, indent=2) + "\n")
        return 1
    step(report, "cargo_build", "pass")
    daemon, token, endpoint = start_daemon(report)
    fixture = None
    code = 1
    try:
        if not token or not compile_fixture(report):
            return 1
        fixture = launch_fixture(report)
        if fixture is None:
            return 1
        pid = int(report["fixture"]["pid"])
        app_id = f"proc:{PROCESS}:{pid}"
        windows = []
        for _ in range(8):
            windows = [row for row in window_ids(PROCESS) if int(row.get("pid") or 0) == pid]
            if any(row.get("title") == "VCU-MAC-003-A" for row in windows):
                break
            time.sleep(0.25)
        left = next((row for row in windows if row.get("title") == "VCU-MAC-003-A"), None)
        step(report, "fixture_window", "pass" if left else "fail", windows=windows)
        if not left:
            return 1
        snap_code, snap = snapshot(token, endpoint, app_id, int(left["id"]))
        items = elements(snap)
        go = by_ident(items, "go-a")
        fail = by_ident(items, "go-fail")
        locked_el = by_ident(items, "locked")
        right = next((row for row in windows if row.get("title") == "VCU-MAC-003-B"), None)
        other = None
        other_code = 0
        if right:
            other_code, other_snap = snapshot(token, endpoint, app_id, int(right["id"]))
            other = by_ident(elements(other_snap), "go-b")
        distinct = bool(go and other and go.get("bound_ref") != other.get("bound_ref"))
        step(
            report,
            "fixture_scene",
            "pass" if snap_code == 200 and other_code == 200 and go and other and fail and locked_el and distinct else "fail",
            http=snap_code,
            other_http=other_code,
            go=bool(go),
            other=bool(other),
            fail=bool(fail),
            locked=bool(locked_el),
            distinct_refs=distinct,
            roles=sorted({str(item.get("role")) for item in items})[:12],
        )
        if not go or not other or not distinct:
            return 1
        before = presses(command(fixture, "status"))
        mouse_before = mouse_location()
        dry_code, dry = api(
            "POST",
            "/v1/app/invoke",
            token,
            endpoint,
            {"id": app_id, "ref": go["bound_ref"], "dry_run": True, "scene_id": payload_of(snap).get("scene_id")},
            timeout=20,
        )
        dry_data = payload_of(dry)
        after_dry = presses(command(fixture, "status"))
        step(
            report,
            "button_dry_run",
            "pass" if dry_code == 200 and dry_data.get("dry_run") is True and dry_data.get("verified") is False and after_dry.get("go-a") == before.get("go-a") and cursor_clean(dry_data) else "fail",
            http=dry_code,
            body=dry_data,
            presses=after_dry,
        )
        live_code, live = api(
            "POST",
            "/v1/app/invoke",
            token,
            endpoint,
            {"id": app_id, "ref": go["bound_ref"], "scene_id": payload_of(snap).get("scene_id")},
            timeout=25,
        )
        live_data = payload_of(live)
        after_live = presses(command(fixture, "status"))
        mouse_after = mouse_location()
        button_ok = (
            live_code == 200
            and live_data.get("verified") is True
            and str(live_data.get("readback") or "").startswith("presses=")
            and live_data.get("readback") != "presses=0"
            and after_live.get("go-a") == before.get("go-a", 0) + 1
            and after_live.get("go-b") == before.get("go-b")
            and cursor_clean(live_data)
        )
        step(
            report,
            "button_live_readback",
            "pass" if button_ok else "fail",
            http=live_code,
            body=live_data,
            before=before,
            after=after_live,
            mouse_before=mouse_before,
            mouse_after=mouse_after,
        )
        replay_code, replay = api(
            "POST",
            "/v1/app/invoke",
            token,
            endpoint,
            {"id": app_id, "ref": go["bound_ref"]},
            timeout=15,
        )
        after_replay = presses(command(fixture, "status"))
        step(
            report,
            "button_no_replay",
            "pass" if replay_code >= 400 and "consumed" in blob(replay) and after_replay.get("go-a") == after_live.get("go-a") else "fail",
            http=replay_code,
            body=replay,
            presses=after_replay,
        )
        legacy_code, legacy = api("POST", "/v1/app/invoke", token, endpoint, {"id": app_id, "ref": "e1"}, timeout=10)
        observation_code, observation = api("POST", "/v1/app/invoke", token, endpoint, {"id": app_id, "ref": "n1"}, timeout=10)
        step(
            report,
            "wrong_ref_refused",
            "pass" if legacy_code >= 400 and observation_code >= 400 and presses(command(fixture, "status")).get("go-b") == before.get("go-b") else "fail",
            legacy=legacy_code,
            observation=observation_code,
            legacy_body=legacy,
            observation_body=observation,
        )
        fail_scene_code, fail_scene = snapshot(token, endpoint, app_id, int(left["id"]))
        fail_now = by_ident(elements(fail_scene), "go-fail")
        if not fail_now:
            step(report, "nonzero_or_unverified_press", "fail", detail="go-fail missing after fresh snapshot", http=fail_scene_code)
        else:
            fail_code, fail_body = api(
                "POST",
                "/v1/app/invoke",
                token,
                endpoint,
                {"id": app_id, "ref": fail_now["bound_ref"], "scene_id": payload_of(fail_scene).get("scene_id")},
                timeout=20,
            )
            fail_presses = presses(command(fixture, "status"))
            fail_reason = blob(fail_body)
            step(
                report,
                "nonzero_or_unverified_press",
                "pass"
                if fail_code >= 400
                and "consumed" not in fail_reason
                and fail_presses.get("go-a") == after_replay.get("go-a")
                and fail_presses.get("go-b") == before.get("go-b")
                and fail_presses.get("go-fail", 0) == 0
                else "fail",
                http=fail_code,
                body=fail_body,
                presses=fail_presses,
            )
        lock_scene_code, lock_scene = snapshot(token, endpoint, app_id, int(left["id"]))
        locked_now = by_ident(elements(lock_scene), "locked")
        if not locked_now:
            step(report, "readonly_set_refused", "fail", detail="locked field missing after fresh snapshot", http=lock_scene_code)
        else:
            set_code, set_body = api(
                "POST",
                "/v1/app/set-value",
                token,
                endpoint,
                {
                    "id": app_id,
                    "ref": locked_now["bound_ref"],
                    "value": "should-not-land",
                    "scene_id": payload_of(lock_scene).get("scene_id"),
                },
                timeout=15,
            )
            set_reason = blob(set_body)
            after_lock = presses(command(fixture, "status"))
            step(
                report,
                "readonly_set_refused",
                "pass"
                if set_code >= 400
                and "consumed" not in set_reason
                and ("not editable" in set_reason or "AXSetValue" in set_reason)
                and after_lock.get("go-a") == after_replay.get("go-a")
                and after_lock.get("go-b") == before.get("go-b")
                else "fail",
                http=set_code,
                body=set_body,
                used="locked",
                presses=after_lock,
            )
        action_slow_press_gate(report, fixture, token, endpoint, app_id, int(left["id"]))
        action_edge_press_gate(report, fixture, token, endpoint, app_id, int(left["id"]))
        action_timeout_gate(report, fixture, token, endpoint, app_id, int(left["id"]))
        opened = open_textedit(report)
        if not opened:
            return 1
        te_id, te_window = opened
        te_code, te_snap = snapshot(token, endpoint, te_id, te_window)
        te_items = elements(te_snap)
        target = text_target(te_items)
        step(
            report,
            "textedit_scene",
            "pass" if te_code == 200 and target else "fail",
            http=te_code,
            count=len(te_items),
            target={k: target.get(k) for k in ("role", "name", "editable", "actions", "bound_ref")} if target else None,
        )
        if not target:
            return 1
        marker = f"VCU-MAC-004-{os.urandom(4).hex()}"
        seed = textedit_text()
        dry_set_code, dry_set = api(
            "POST",
            "/v1/app/set-value",
            token,
            endpoint,
            {
                "id": te_id,
                "ref": target["bound_ref"],
                "value": marker,
                "dry_run": True,
                "scene_id": payload_of(te_snap).get("scene_id"),
            },
            timeout=20,
        )
        dry_text = textedit_text()
        step(
            report,
            "textedit_dry_run",
            "pass" if dry_set_code == 200 and payload_of(dry_set).get("verified") is False and marker not in dry_text else "fail",
            http=dry_set_code,
            body=payload_of(dry_set),
            text=dry_text[:180],
        )
        set_live_code, set_live = api(
            "POST",
            "/v1/app/set-value",
            token,
            endpoint,
            {
                "id": te_id,
                "ref": target["bound_ref"],
                "value": marker,
                "scene_id": payload_of(te_snap).get("scene_id"),
            },
            timeout=25,
        )
        independent = textedit_text()
        set_data = payload_of(set_live)
        text_ok = (
            set_live_code == 200
            and set_data.get("verified") is True
            and marker in str(set_data.get("readback") or "")
            and marker in independent
            and cursor_clean(set_data)
        )
        step(
            report,
            "textedit_independent_readback",
            "pass" if text_ok else "fail",
            http=set_live_code,
            body=set_data,
            independent=independent[:180],
            seed=seed[:80],
        )
        replay_set_code, replay_set = api(
            "POST",
            "/v1/app/set-value",
            token,
            endpoint,
            {"id": te_id, "ref": target["bound_ref"], "value": marker + "-replay"},
            timeout=15,
        )
        step(
            report,
            "textedit_no_replay",
            "pass" if replay_set_code >= 400 and marker + "-replay" not in textedit_text() else "fail",
            http=replay_set_code,
            body=replay_set,
        )
        terminal_newline_gate(report, token, endpoint)
        required = [
            "action_slow_press_kept",
            "action_edge_press_kept",
            "action_timeout_isolated",
            "action_timeout_not_replayed",
            "terminal_newline_refused",
            "textedit_newline_not_terminal_gated",
            "button_dry_run",
            "button_live_readback",
            "button_no_replay",
            "wrong_ref_refused",
            "nonzero_or_unverified_press",
            "readonly_set_refused",
            "textedit_dry_run",
            "textedit_independent_readback",
            "textedit_no_replay",
        ]
        by_name = {item["name"]: item["status"] for item in report["checks"]}
        report["ok"] = all(by_name.get(name) == "pass" for name in required)
        dirty = bool(report.get("source", {}).get("dirty"))
        report["completion_allowed"] = bool(report["ok"]) and not dirty
        if report["completion_allowed"]:
            report.pop("completion_block", None)
        elif dirty:
            report["completion_block"] = "worktree is dirty or evidence is not bound to a clean source SHA"
        else:
            report["completion_block"] = "required checks did not all pass"
        code = 0 if report["ok"] else 1
        return code
    finally:
        close_textedit()
        if fixture is not None and fixture.poll() is None:
            fixture.kill()
        stop_daemon(daemon)
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps({"ok": report.get("ok"), "out": str(OUT), "checks": [(c["name"], c["status"]) for c in report["checks"]]}, ensure_ascii=False))


if __name__ == "__main__":
    raise SystemExit(main())
