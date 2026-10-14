#!/usr/bin/env python3
"""MAC-005 bound scroll, same-window wait, and scene extract.

Dry-run first. A locked screen fails before any GUI launch. Does not reset
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
OUT = ROOT / ".local" / "desktop-cu" / "mac-MAC-005.json"
USER_DIR = ROOT / ".local" / "desktop-cu" / "mac005-daemon"
FIXTURE_APP = ROOT / ".local" / "desktop-cu" / "VCUAxBinding.app"
FIXTURE_BIN = FIXTURE_APP / "Contents" / "MacOS" / "vcu-ax-binding"
VCU = ROOT / "target" / "debug" / "vcu"
PROCESS = "vcu-ax-binding"
DOC_NAME = "VCU-MAC-005"
DOC_FILE = ROOT / ".local" / "desktop-cu" / "VCU-MAC-005.txt"
SECRET = "vcu-secret-should-not-leak"


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


def step(report: dict, name: str, status: str, **extra: object) -> None:
    item = {"name": name, "status": status}
    item.update(extra)
    report["checks"].append(item)


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
        "app_allowlist": [PROCESS, "TextEdit"],
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
        step(report, "fixture_build", "fail", stderr=(compiled.stderr or "")[:800])
        return False
    plist = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>vcu-ax-binding</string>
<key>CFBundleIdentifier</key><string>ai.vcu.ax-binding</string>
<key>CFBundleName</key><string>vcu-ax-binding</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>LSUIElement</key><false/>
</dict></plist>
"""
    (FIXTURE_APP / "Contents" / "Info.plist").write_text(plist)
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
        parsed = json.loads(result.stdout or "[]")
    except json.JSONDecodeError:
        return []
    return parsed if isinstance(parsed, list) else []


def snapshot(token: str, endpoint: str, app_id: str, window_id: int | None = None) -> tuple[int, dict]:
    body: dict = {"id": app_id, "scene": True, "budget": 4000, "max_nodes": 160, "max_depth": 12, "timeout_ms": 6000}
    if window_id:
        body["window_id"] = window_id
    return api("POST", "/v1/app/snapshot", token, endpoint, body, timeout=25)


def elements(body: dict) -> list[dict]:
    raw = payload_of(body).get("elements") or []
    return [item for item in raw if isinstance(item, dict)]


def by_ident(items: list[dict], ident: str) -> dict | None:
    exact = [item for item in items if item.get("ax_identifier") == ident and item.get("bound_ref")]
    return exact[0] if exact else None


def offsets(status: dict) -> dict:
    raw = status.get("offsets") or {}
    return {str(k): int(v) for k, v in raw.items()} if isinstance(raw, dict) else {}


def presses(status: dict) -> dict:
    raw = status.get("presses") or {}
    return {str(k): int(v) for k, v in raw.items()} if isinstance(raw, dict) else {}


def cursor_clean(detail: dict) -> bool:
    return detail.get("os_cursor_used") is False and detail.get("hid_injected") is False


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


def open_textedit(report: dict, marker: str) -> tuple[str, int] | None:
    DOC_FILE.parent.mkdir(parents=True, exist_ok=True)
    DOC_FILE.write_text(marker + "\n", encoding="utf-8")
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
    windows = window_ids("TextEdit", pid=int(pid_text)) if pid_text.isdigit() else []
    target = next((row for row in windows if DOC_NAME in str(row.get("title") or "")), None)
    if not pid_text.isdigit() or target is None:
        step(report, "textedit_open", "fail", pid=pid_text, windows=windows, stderr=(created.stderr or "")[:200])
        return None
    step(report, "textedit_open", "pass", pid=int(pid_text), window_id=target["id"], title=target.get("title"))
    return f"proc:TextEdit:{pid_text}", int(target["id"])


def scroll(token: str, endpoint: str, app_id: str, ref: str, dy: int, scene_id: str | None, dry_run: bool = False) -> tuple[int, dict]:
    body = {"id": app_id, "ref": ref, "dy": dy, "dry_run": dry_run}
    if scene_id:
        body["scene_id"] = scene_id
    return api("POST", "/v1/app/scroll", token, endpoint, body, timeout=30)


def main() -> int:
    report: dict = {
        "id": "MAC-005",
        "ok": False,
        "checks": [],
        "os_cursor_used": False,
        "note": "completion requires ok=true and a clean source SHA",
    }
    identity = run(["git", "rev-parse", "HEAD"], timeout=10)
    status = run(["git", "status", "--porcelain"], timeout=10)
    dirty = bool((status.stdout or "").strip())
    report["source"] = {"sha": (identity.stdout or "").strip(), "dirty": dirty}
    if dirty:
        report["note"] = "dirty worktree evidence is not a completion claim"
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
        step(report, "cargo_build", "fail", stderr=(built.stderr or "")[-800:])
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
        right = next((row for row in windows if row.get("title") == "VCU-MAC-003-B"), None)
        step(report, "fixture_window", "pass" if left and right else "fail", windows=windows)
        if not left or not right:
            return 1
        snap_code, snap = snapshot(token, endpoint, app_id, int(left["id"]))
        items = elements(snap)
        scroll_a = by_ident(items, "scroll-a")
        scroll_b = by_ident(items, "scroll-b")
        button = by_ident(items, "go-a")
        distinct = bool(scroll_a and scroll_b and scroll_a.get("bound_ref") != scroll_b.get("bound_ref"))
        step(
            report,
            "fixture_scene",
            "pass" if snap_code == 200 and scroll_a and scroll_b and button and distinct else "fail",
            http=snap_code,
            roles=sorted({str(item.get("role")) for item in items})[:16],
            scroll_a={k: scroll_a.get(k) for k in ("role", "name", "ax_identifier", "actions", "bound_ref")} if scroll_a else None,
            scroll_b={k: scroll_b.get(k) for k in ("role", "name", "ax_identifier", "bound_ref")} if scroll_b else None,
        )
        if not scroll_a or not scroll_b or not button or not distinct:
            return 1
        scene_id = payload_of(snap).get("scene_id")
        before = offsets(command(fixture, "status"))
        dry_code, dry = scroll(token, endpoint, app_id, scroll_a["bound_ref"], 400, scene_id, dry_run=True)
        dry_data = payload_of(dry)
        after_dry = offsets(command(fixture, "status"))
        step(
            report,
            "scroll_dry_isolated",
            "pass" if dry_code == 200 and dry_data.get("dry_run") is True and dry_data.get("verified") is False and after_dry == before and cursor_clean(dry_data) else "fail",
            http=dry_code,
            body=dry_data,
            offsets=after_dry,
        )
        live_code, live = scroll(token, endpoint, app_id, scroll_a["bound_ref"], 400, scene_id)
        live_data = payload_of(live)
        after_a = offsets(command(fixture, "status"))
        a_only = (
            live_code == 200
            and live_data.get("verified") is True
            and live_data.get("input_path") == "bound_ax_scroll"
            and cursor_clean(live_data)
            and after_a.get("scroll-a", -1) > before.get("scroll-a", 0)
            and after_a.get("scroll-b") == before.get("scroll-b")
        )
        step(
            report,
            "scroll_a_only",
            "pass" if a_only else "fail",
            http=live_code,
            body=live_data,
            before=before,
            after=after_a,
        )
        snap_b_code, snap_b = snapshot(token, endpoint, app_id, int(left["id"]))
        scroll_b_now = by_ident(elements(snap_b), "scroll-b")
        if not scroll_b_now:
            step(report, "scroll_b_only", "fail", detail="scroll-b missing after first scroll", http=snap_b_code)
        else:
            before_b = offsets(command(fixture, "status"))
            b_code, b_body = scroll(token, endpoint, app_id, scroll_b_now["bound_ref"], 400, payload_of(snap_b).get("scene_id"))
            b_data = payload_of(b_body)
            after_b = offsets(command(fixture, "status"))
            b_only = (
                b_code == 200
                and b_data.get("verified") is True
                and cursor_clean(b_data)
                and after_b.get("scroll-b", -1) > before_b.get("scroll-b", 0)
                and after_b.get("scroll-a") == before_b.get("scroll-a")
            )
            step(report, "scroll_b_only", "pass" if b_only else "fail", http=b_code, body=b_data, before=before_b, after=after_b)
        fail_scene_code, fail_scene = snapshot(token, endpoint, app_id, int(left["id"]))
        button_now = by_ident(elements(fail_scene), "go-a")
        before_fail = command(fixture, "status")
        if not button_now:
            step(report, "unsupported_scroll_isolated", "fail", detail="button missing", http=fail_scene_code)
        else:
            bad_code, bad = scroll(token, endpoint, app_id, button_now["bound_ref"], 400, payload_of(fail_scene).get("scene_id"))
            after_fail = command(fixture, "status")
            isolated = (
                bad_code >= 400
                and offsets(after_fail) == offsets(before_fail)
                and presses(after_fail) == presses(before_fail)
            )
            step(
                report,
                "unsupported_scroll_isolated",
                "pass" if isolated else "fail",
                http=bad_code,
                body=bad,
                before=offsets(before_fail),
                after=offsets(after_fail),
                presses=presses(after_fail),
            )
        replay_code, replay = scroll(token, endpoint, app_id, scroll_a["bound_ref"], 400, scene_id)
        after_replay = offsets(command(fixture, "status"))
        step(
            report,
            "scroll_no_replay",
            "pass" if replay_code >= 400 and after_replay.get("scroll-a") == after_a.get("scroll-a") else "fail",
            http=replay_code,
            body=replay,
            offsets=after_replay,
        )
        wait_scene_code, wait_scene = snapshot(token, endpoint, app_id, int(left["id"]))
        named = by_ident(elements(wait_scene), "scroll-a")
        if not named:
            step(report, "wait_name_role", "fail", detail="scroll-a missing", http=wait_scene_code)
        else:
            wait_code, wait_body = api(
                "POST",
                "/v1/app/wait",
                token,
                endpoint,
                {
                    "id": app_id,
                    "window_id": int(left["id"]),
                    "name": "scroll-a",
                    "role": named.get("role"),
                    "timeout_ms": 1200,
                },
                timeout=12,
            )
            wait_data = payload_of(wait_body)
            identity_ok = (
                wait_code == 200
                and cursor_clean(wait_data)
                and wait_data.get("identifier") == "scroll-a"
                and wait_data.get("name") == "scroll-a"
                and wait_data.get("role") == named.get("role")
                and wait_data.get("found_ref")
                and wait_data.get("found_ref") != scroll_b.get("bound_ref")
            )
            step(
                report,
                "wait_name_role",
                "pass" if identity_ok else "fail",
                http=wait_code,
                body=wait_data,
                expected_role=named.get("role"),
            )
        ambiguous_code, ambiguous = api(
            "POST",
            "/v1/app/wait",
            token,
            endpoint,
            {"id": app_id, "name": "scroll-a", "timeout_ms": 800},
            timeout=12,
        )
        step(
            report,
            "wait_ambiguous_refused",
            "pass" if ambiguous_code >= 400 and "guess" in json.dumps(ambiguous).lower() else "fail",
            http=ambiguous_code,
            body=ambiguous,
        )
        missing_code, missing = api(
            "POST",
            "/v1/app/wait",
            token,
            endpoint,
            {"id": app_id, "window_id": int(left["id"]), "name": "missing-target-xyz", "timeout_ms": 700},
            timeout=12,
        )
        step(
            report,
            "wait_missing_timeout",
            "pass" if missing_code >= 400 and "timed out" in json.dumps(missing).lower() else "fail",
            http=missing_code,
            body=missing,
        )
        stale_code, stale = api(
            "POST",
            "/v1/app/wait",
            token,
            endpoint,
            {
                "id": app_id,
                "window_id": int(left["id"]),
                "ref": "b1.01ARZ3NDEKTSV4RRFFQ69G5FAV.n2",
                "timeout_ms": 700,
            },
            timeout=12,
        )
        stale_blob = json.dumps(stale)
        step(
            report,
            "wait_stale_ref",
            "pass" if stale_code >= 400 and "b1.01ARZ3NDEKTSV4RRFFQ69G5FAV.n2" not in str(payload_of(stale).get("found_ref") or "") and SECRET not in stale_blob else "fail",
            http=stale_code,
            body=stale,
        )
        marker = f"VCU-MAC-005-{os.urandom(4).hex()}"
        opened = open_textedit(report, marker)
        if not opened:
            return 1
        te_id, te_window = opened
        value_code, value_body = api(
            "POST",
            "/v1/app/wait",
            token,
            endpoint,
            {"id": te_id, "window_id": te_window, "value": marker, "timeout_ms": 2500},
            timeout=20,
        )
        value_data = payload_of(value_body)
        independent = textedit_text()
        step(
            report,
            "wait_value",
            "pass" if value_code == 200 and value_data.get("found_ref") and marker in independent and cursor_clean(value_data) else "fail",
            http=value_code,
            body=value_data,
            independent=independent[:180],
        )
        extract_code, extract_body = api(
            "POST",
            "/v1/app/extract",
            token,
            endpoint,
            {"id": te_id, "window_id": te_window, "selector": marker, "timeout_ms": 6000},
            timeout=20,
        )
        extract_data = payload_of(extract_body)
        extract_blob = json.dumps(extract_body)
        matches = extract_data.get("matches") or []
        extract_ok = (
            extract_code == 200
            and extract_data.get("source") == "desktop.scene"
            and marker in extract_blob
            and marker in independent
            and SECRET not in extract_blob
            and any(item.get("source") == "desktop.scene" for item in matches if isinstance(item, dict))
        )
        step(
            report,
            "extract_marker",
            "pass" if extract_ok else "fail",
            http=extract_code,
            count=extract_data.get("count"),
            source=extract_data.get("source"),
            window_id=extract_data.get("window_id"),
        )
        secret_code, secret_body = api(
            "POST",
            "/v1/app/extract",
            token,
            endpoint,
            {"id": app_id, "window_id": int(left["id"]), "selector": "*", "max_nodes": 160},
            timeout=20,
        )
        secret_blob = json.dumps(secret_body)
        secret_matches = payload_of(secret_body).get("matches") or []
        password = [
            item for item in secret_matches
            if isinstance(item, dict) and "password" in f"{item.get('role')} {item.get('name')}".lower()
        ]
        redacted = bool(password) and all(item.get("value") in (None, "") and item.get("redacted") is True for item in password)
        step(
            report,
            "extract_secret_redacted",
            "pass" if secret_code == 200 and SECRET not in secret_blob and redacted else "fail",
            http=secret_code,
            password_count=len(password),
            leaked=SECRET in secret_blob,
        )
        required = [
            "scroll_dry_isolated",
            "scroll_a_only",
            "scroll_b_only",
            "unsupported_scroll_isolated",
            "scroll_no_replay",
            "wait_name_role",
            "wait_value",
            "wait_missing_timeout",
            "wait_stale_ref",
            "wait_ambiguous_refused",
            "extract_marker",
            "extract_secret_redacted",
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
