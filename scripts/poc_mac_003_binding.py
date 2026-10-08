#!/usr/bin/env python3
"""MAC-003 scene/ref/capture binding POC.

Proves old eN refs and stale captures cannot operate the wrong control, then
verifies a fresh observation can dry-run and live-press only the bound target.
Does not reset TCC, click Edge Allow, move the OS cursor, or automate WeChat.
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
OUT = ROOT / ".local" / "desktop-cu" / "mac-MAC-003.json"
USER_DIR = ROOT / ".local" / "desktop-cu" / "mac003-daemon"
FIXTURE_APP = ROOT / ".local" / "desktop-cu" / "VCUAxBinding.app"
FIXTURE_BIN = FIXTURE_APP / "Contents" / "MacOS" / "vcu-ax-binding"
VCU = ROOT / "target" / "debug" / "vcu"
PROCESS = "vcu-ax-binding"


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


def blob(value: object) -> str:
    return json.dumps(value, ensure_ascii=False)


def api(method: str, path: str, token: str, endpoint: str, body: dict | None = None, timeout: float = 20) -> tuple[int, dict]:
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


def frontmost() -> str:
    result = run(
        ["osascript", "-e", 'tell application "System Events" to name of first process whose frontmost is true'],
        timeout=8,
    )
    return (result.stdout or "").strip()


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
        "app_allowlist": [PROCESS],
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
    ax_windows = ready.get("ax_windows")
    if ax_windows != 2:
        step(
            report,
            "fixture_launch",
            "fail",
            pid=ready.get("pid"),
            ax_windows=ax_windows,
            detail="fixture did not expose two AXWindow elements",
        )
        proc.kill()
        return None
    step(report, "fixture_launch", "pass", pid=ready.get("pid"), ax_windows=ax_windows)
    report["fixture"] = ready
    time.sleep(0.8)
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


def window_ids(pid: int) -> list[dict]:
    script = """
ObjC.import("CoreGraphics");
const info = ObjC.castRefToObject($.CGWindowListCopyWindowInfo(1, 0));
const rows = ObjC.deepUnwrap(info);
const wantPid = __PID__;
const mine = rows.filter(w => Number(w.kCGWindowLayer) === 0 && Number(w.kCGWindowOwnerPID) === wantPid).map(w => ({
  id: Number(w.kCGWindowNumber),
  title: String(w.kCGWindowName || ""),
  x: Number((w.kCGWindowBounds || {}).X || 0),
  y: Number((w.kCGWindowBounds || {}).Y || 0),
  w: Number((w.kCGWindowBounds || {}).Width || 0),
  h: Number((w.kCGWindowBounds || {}).Height || 0)
}));
JSON.stringify(mine);
""".replace("__PID__", str(int(pid)))
    result = run(["osascript", "-l", "JavaScript", "-e", script], timeout=15)
    if result.returncode != 0:
        return []
    try:
        rows = json.loads(result.stdout or "[]")
    except json.JSONDecodeError:
        return []
    return [row for row in rows if isinstance(row, dict) and int(row.get("id") or 0) > 0]


def snapshot(token: str, endpoint: str, app_id: str, **extra: object) -> tuple[int, dict]:
    body = {"id": app_id, "scene": True, "budget": 4000, "max_nodes": 80, "max_depth": 8, "timeout_ms": 4500}
    body.update(extra)
    code, env = api("POST", "/v1/app/snapshot", token, endpoint, body, timeout=20)
    return code, env


def elements(body: dict) -> list[dict]:
    data = payload_of(body)
    raw = data.get("elements") or []
    return [item for item in raw if isinstance(item, dict)]


def bound_go(items: list[dict], ident: str) -> dict | None:
    matches = [
        item for item in items
        if item.get("bound_ref") and (item.get("ax_identifier") == ident or item.get("name") == "Go" and ident in blob(item))
    ]
    exact = [item for item in matches if item.get("ax_identifier") == ident]
    if exact:
        return exact[0]
    named = [item for item in items if item.get("name") == "Go" and item.get("bound_ref") and item.get("ax_identifier") == ident]
    return named[0] if named else None


def presses(status: dict) -> dict:
    raw = status.get("presses") or {}
    return {str(k): int(v) for k, v in raw.items()} if isinstance(raw, dict) else {}


def invoke(token: str, endpoint: str, app_id: str, ref: str, **extra: object) -> tuple[int, dict]:
    body = {"id": app_id, "ref": ref}
    body.update(extra)
    return api("POST", "/v1/app/invoke", token, endpoint, body, timeout=15)


def refused(code: int, body: dict, needle: str) -> bool:
    return code >= 400 and needle in blob(body)


def main() -> int:
    report: dict = {
        "id": "MAC-003",
        "ok": False,
        "checks": [],
        "os_cursor_used": False,
        "focus_stolen": False,
    }
    identity = run(["git", "rev-parse", "HEAD"], timeout=10)
    status = run(["git", "status", "--porcelain"], timeout=10)
    report["source"] = {"sha": (identity.stdout or "").strip(), "dirty": bool((status.stdout or "").strip())}
    if platform.system() != "Darwin":
        step(report, "platform", "untested", detail=platform.system())
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(report, indent=2) + "\n")
        return 1
    locked = screen_locked()
    if locked is not False:
        step(
            report,
            "screen_unlocked",
            "fail",
            detail="screen is locked or lock state is unknown; refusing to launch the GUI fixture",
        )
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps({"ok": False, "out": str(OUT), "checks": [(c["name"], c["status"]) for c in report["checks"]]}, ensure_ascii=False))
        return 1
    step(report, "screen_unlocked", "pass")
    built = run(["cargo", "build", "-p", "vcu-cli"], timeout=180)
    if built.returncode != 0 or not VCU.exists():
        step(report, "cargo_build", "fail", stderr=(built.stderr or "")[-400:])
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(report, indent=2) + "\n")
        return 1
    step(report, "cargo_build", "pass", bin=str(VCU))
    daemon, token, endpoint = start_daemon(report)
    fixture = None
    try:
        if not token:
            return 1
        if not compile_fixture(report):
            return 1
        fixture = launch_fixture(report)
        if fixture is None:
            return 1
        pid = int(report["fixture"]["pid"])
        app_id = f"proc:{PROCESS}:{pid}"
        windows = []
        for _ in range(8):
            windows = window_ids(pid)
            if len(windows) >= 2:
                break
            time.sleep(0.25)
        by_title = {row["title"]: row for row in windows}
        left = by_title.get("VCU-MAC-003-A")
        right = by_title.get("VCU-MAC-003-B")
        step(report, "two_windows", "pass" if left and right else "fail", windows=windows)
        if not left or not right:
            return 1
        code, ambiguous = snapshot(token, endpoint, app_id)
        amb = payload_of(ambiguous)
        amb_refs = [item.get("bound_ref") for item in elements(ambiguous) if item.get("bound_ref")]
        step(
            report,
            "ambiguous_without_window_refuses",
            "pass" if amb.get("truncation_reason") == "ambiguous_window" and not amb_refs else "fail",
            http=code,
            reason=amb.get("truncation_reason"),
            bound_refs=amb_refs,
        )
        code_a, scene_a = snapshot(token, endpoint, app_id, window_id=left["id"], pixels=True)
        code_b, scene_b = snapshot(token, endpoint, app_id, window_id=right["id"])
        go_a = bound_go(elements(scene_a), "go-a")
        go_b = bound_go(elements(scene_b), "go-b")
        data_a = payload_of(scene_a)
        step(
            report,
            "same_name_distinct_bindings",
            "pass" if go_a and go_b and go_a.get("bound_ref") != go_b.get("bound_ref") and go_a.get("name") == "Go" and go_b.get("name") == "Go" else "fail",
            http_a=code_a,
            http_b=code_b,
            a=go_a,
            b={"bound_ref": None if not go_b else go_b.get("bound_ref"), "identifier": None if not go_b else go_b.get("ax_identifier"), "path": None if not go_b else go_b.get("index_path")},
            names=[item.get("name") for item in elements(scene_a)],
            identifiers=[item.get("ax_identifier") for item in elements(scene_a)],
        )
        if not go_a or not go_b:
            return 1
        before = command(fixture, "status")
        e_code, e_body = invoke(token, endpoint, app_id, "e1")
        n_code, n_body = invoke(token, endpoint, app_id, "n1")
        after_legacy = command(fixture, "status")
        step(
            report,
            "legacy_en_and_nn_do_not_act",
            "pass" if refused(e_code, e_body, "legacy eN") and refused(n_code, n_body, "observation-only") and presses(before) == presses(after_legacy) else "fail",
            e=e_code,
            n=n_code,
            presses=presses(after_legacy),
        )
        capture_id = data_a.get("capture_id")
        capture_ok = (
            capture_id
            and str(data_a.get("capture_window_id")) == str(left["id"])
            and data_a.get("capture_scene_id")
            and data_a.get("capture_generation") == data_a.get("capture_scene_id")
            and data_a.get("capture_scale")
            and data_a.get("capture_frame")
        )
        step(
            report,
            "capture_bound_to_window_generation",
            "pass" if capture_ok else "fail",
            capture_id=capture_id,
            window=data_a.get("capture_window_id"),
            scene=data_a.get("capture_scene_id"),
            scale=data_a.get("capture_scale"),
            frame=data_a.get("capture_frame"),
            skipped=data_a.get("screenshot_skipped"),
        )
        front_before = frontmost()
        dry_code, dry_body = invoke(token, endpoint, app_id, str(go_a["bound_ref"]), dry_run=True, capture_id=capture_id)
        dry = payload_of(dry_body)
        after_dry = command(fixture, "status")
        step(
            report,
            "fresh_dry_run_does_not_press",
            "pass" if dry_code == 200 and dry.get("dry_run") is True and dry.get("identifier") == "go-a" and dry.get("focus_stolen") is False and presses(after_dry).get("go-a", 0) == 0 and presses(after_dry).get("go-b", 0) == 0 else "fail",
            http=dry_code,
            body=blob(dry_body)[:500],
            presses=presses(after_dry),
        )
        live_code, live_body = invoke(token, endpoint, app_id, str(go_a["bound_ref"]), capture_id=capture_id)
        live = payload_of(live_body)
        front_after = frontmost()
        after_live = command(fixture, "status")
        live_presses = presses(after_live)
        step(
            report,
            "fresh_live_presses_only_bound_target",
            "pass" if live_code == 200 and live.get("identifier") == "go-a" and live.get("os_cursor_used") is False and live.get("focus_stolen") is False and live_presses.get("go-a") == 1 and live_presses.get("go-b", 0) == 0 and front_before == front_after else "fail",
            http=live_code,
            body=blob(live_body)[:500],
            presses=live_presses,
            front_before=front_before,
            front_after=front_after,
        )
        report["focus_stolen"] = front_before != front_after
        replay_code, replay_body = invoke(token, endpoint, app_id, str(go_a["bound_ref"]))
        after_replay = command(fixture, "status")
        step(
            report,
            "consumed_generation_is_not_replayed",
            "pass" if refused(replay_code, replay_body, "replay") and presses(after_replay).get("go-a") == 1 else "fail",
            http=replay_code,
            body=blob(replay_body)[:400],
            presses=presses(after_replay),
        )
        command(fixture, "reset")
        time.sleep(0.4)
        windows = window_ids(pid)
        by_title = {row["title"]: row for row in windows}
        left = by_title.get("VCU-MAC-003-A")
        right = by_title.get("VCU-MAC-003-B")
        if not left or not right:
            step(report, "reset_windows", "fail", windows=windows)
            return 1
        _, fresh = snapshot(token, endpoint, app_id, window_id=left["id"], pixels=True)
        fresh_go = bound_go(elements(fresh), "go-a")
        fresh_capture = payload_of(fresh).get("capture_id")
        if not fresh_go:
            step(report, "reobserve_after_reset", "fail", names=[item.get("name") for item in elements(fresh)], identifiers=[item.get("ax_identifier") for item in elements(fresh)])
            return 1
        command(fixture, "insert")
        time.sleep(0.2)
        insert_code, insert_body = invoke(token, endpoint, app_id, str(fresh_go["bound_ref"]), dry_run=True)
        insert_status = command(fixture, "status")
        insert_presses = presses(insert_status)
        step(
            report,
            "insert_does_not_press_decoy",
            "pass" if insert_presses.get("go-decoy", 0) == 0 and insert_presses.get("go-b", 0) == 0 and (insert_code >= 400 or payload_of(insert_body).get("identifier") == "go-a") else "fail",
            http=insert_code,
            body=blob(insert_body)[:400],
            presses=insert_presses,
        )
        command(fixture, "replace")
        time.sleep(0.2)
        replace_code, replace_body = invoke(token, endpoint, app_id, str(fresh_go["bound_ref"]))
        replace_status = command(fixture, "status")
        step(
            report,
            "replaced_control_is_not_pressed",
            "pass" if replace_code >= 400 and presses(replace_status).get("go-replaced", 0) == 0 and presses(replace_status).get("go-b", 0) == 0 else "fail",
            http=replace_code,
            body=blob(replace_body)[:400],
            presses=presses(replace_status),
        )
        command(fixture, "reset")
        time.sleep(0.4)
        windows = window_ids(pid)
        by_title = {row["title"]: row for row in windows}
        left = by_title.get("VCU-MAC-003-A")
        if not left:
            step(report, "reorder_setup", "fail", windows=windows)
            return 1
        _, before_move = snapshot(token, endpoint, app_id, window_id=left["id"], pixels=True)
        move_go = bound_go(elements(before_move), "go-a")
        move_capture = payload_of(before_move).get("capture_id")
        command(fixture, "reorder")
        time.sleep(0.3)
        moved = window_ids(pid)
        moved_left = next((row for row in moved if row["title"] == "VCU-MAC-003-A"), None)
        geometry_changed = bool(moved_left and abs(moved_left["x"] - left["x"]) > 20)
        reorder_code, reorder_body = invoke(
            token,
            endpoint,
            app_id,
            str(move_go.get("bound_ref") if move_go else ""),
            capture_id=move_capture,
        )
        reorder_status = command(fixture, "status")
        step(
            report,
            "reorder_invalidates_ref_and_capture",
            "pass" if geometry_changed and move_go and refused(reorder_code, reorder_body, "geometry") and presses(reorder_status).get("go-a", 0) == 0 and presses(reorder_status).get("go-b", 0) == 0 else "fail",
            http=reorder_code,
            body=blob(reorder_body)[:400],
            geometry_changed=geometry_changed,
            presses=presses(reorder_status),
        )
        again_go = None
        if moved_left:
            _, again = snapshot(token, endpoint, app_id, window_id=moved_left["id"])
            again_go = bound_go(elements(again), "go-a")
            again_front = frontmost()
            again_code, again_body = invoke(token, endpoint, app_id, str(again_go.get("bound_ref") if again_go else "missing"), dry_run=True)
            again_live_code, again_live_body = invoke(token, endpoint, app_id, str(again_go.get("bound_ref") if again_go else "missing"))
            again_status = command(fixture, "status")
            step(
                report,
                "reobserve_after_move_hits_same_window",
                "pass" if again_code == 200 and again_live_code == 200 and payload_of(again_live_body).get("identifier") == "go-a" and presses(again_status).get("go-a") == 1 and presses(again_status).get("go-b", 0) == 0 and frontmost() == again_front else "fail",
                dry=again_code,
                live=again_live_code,
                body=blob(again_live_body)[:400],
                presses=presses(again_status),
            )
        command(fixture, "close-a")
        time.sleep(0.3)
        close_ref = again_go.get("bound_ref") if again_go else "missing"
        close_code, close_body = invoke(token, endpoint, app_id, str(close_ref))
        close_status = command(fixture, "status")
        step(
            report,
            "closed_window_does_not_fall_back",
            "pass" if close_code >= 400 and presses(close_status).get("go-b", 0) == 0 else "fail",
            http=close_code,
            body=blob(close_body)[:400],
            presses=presses(close_status),
        )
        right_now = next((row for row in window_ids(pid) if row["title"] == "VCU-MAC-003-B"), None)
        if right_now:
            _, scene_right = snapshot(token, endpoint, app_id, window_id=right_now["id"])
            go_right = bound_go(elements(scene_right), "go-b")
            before_right = presses(command(fixture, "status"))
            right_code, right_body = invoke(token, endpoint, app_id, str(go_right.get("bound_ref") if go_right else "missing"))
            right_status = presses(command(fixture, "status"))
            isolated = (
                right_code == 200
                and payload_of(right_body).get("identifier") == "go-b"
                and right_status.get("go-b", 0) == before_right.get("go-b", 0) + 1
                and right_status.get("go-a", 0) == before_right.get("go-a", 0)
            )
            step(
                report,
                "other_window_live_is_isolated",
                "pass" if isolated else "fail",
                http=right_code,
                body=blob(right_body)[:400],
                before=before_right,
                presses=right_status,
            )
        else:
            step(report, "other_window_live_is_isolated", "fail", detail="window B missing")
        required = [
            "ambiguous_without_window_refuses",
            "same_name_distinct_bindings",
            "legacy_en_and_nn_do_not_act",
            "capture_bound_to_window_generation",
            "fresh_dry_run_does_not_press",
            "fresh_live_presses_only_bound_target",
            "consumed_generation_is_not_replayed",
            "insert_does_not_press_decoy",
            "replaced_control_is_not_pressed",
            "reorder_invalidates_ref_and_capture",
            "reobserve_after_move_hits_same_window",
            "closed_window_does_not_fall_back",
            "other_window_live_is_isolated",
        ]
        by_name = {item["name"]: item["status"] for item in report["checks"]}
        report["ok"] = all(by_name.get(name) == "pass" for name in required)
        return 0 if report["ok"] else 1
    finally:
        if fixture is not None and fixture.poll() is None:
            fixture.kill()
        stop_daemon(daemon)
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps({"ok": report.get("ok"), "out": str(OUT), "checks": [(c["name"], c["status"]) for c in report["checks"]]}, ensure_ascii=False))


if __name__ == "__main__":
    raise SystemExit(main())
