#!/usr/bin/env python3
"""MAC-002 read-only scene POC.

Builds an isolated daemon from this worktree and a local AX fixture.
Does not reset TCC, click Edge Allow, move the OS cursor, automate WeChat,
or use the new scene for live mutation.
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
OUT = ROOT / ".local" / "desktop-cu" / "mac-MAC-002.json"
USER_DIR = ROOT / ".local" / "desktop-cu" / "mac002-daemon"
FIXTURE_APP = ROOT / ".local" / "desktop-cu" / "VCUAxFixture.app"
FIXTURE_BIN = FIXTURE_APP / "Contents" / "MacOS" / "vcu-ax-fixture"
SECRET = "vcu-secret-should-not-leak"
VCU = ROOT / "target" / "debug" / "vcu"


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


def step(report: dict, name: str, status: str, **extra: object) -> None:
    item = {"name": name, "status": status}
    item.update(extra)
    report["checks"].append(item)


def blob(value: object) -> str:
    return json.dumps(value, ensure_ascii=False)


def contains_secret(value: object) -> bool:
    return SECRET in blob(value)


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
        "app_allowlist": ["vcu-ax-fixture", "TextEdit", "Finder"],
    }
    (USER_DIR / "config.json").write_text(json.dumps(config))
    proc = subprocess.Popen(
        [str(VCU), "--user-dir", str(USER_DIR), "daemon", "start", "--foreground"],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    token = ""
    endpoint = ""
    for _ in range(50):
        cfg_path = USER_DIR / "config.json"
        if cfg_path.exists() and not token:
            cfg = json.loads(cfg_path.read_text())
            token = cfg.get("pairing_token", "")
            endpoint = f"http://{cfg.get('daemon_host', '127.0.0.1')}:{cfg.get('daemon_port')}"
        if token and endpoint:
            code, body = api("GET", "/v1/health", token, endpoint, timeout=2)
            if code == 200:
                step(report, "isolated_daemon", "pass", endpoint=endpoint, pid=proc.pid)
                return proc, token, endpoint
        if proc.poll() is not None:
            err = ""
            if proc.stderr:
                err = proc.stderr.read()[:400]
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
        ["swiftc", "-framework", "AppKit", "-framework", "Foundation", "-o", str(FIXTURE_BIN), "scripts/fixtures/mac_ax_fixture.swift"],
        timeout=90,
    )
    if compiled.returncode != 0:
        step(report, "fixture_build", "fail", stderr=(compiled.stderr or "")[:500])
        return False
    plist = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>vcu-ax-fixture</string>
<key>CFBundleIdentifier</key><string>local.vcu.ax-fixture</string>
<key>CFBundleName</key><string>vcu-ax-fixture</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>NSPrincipalClass</key><string>NSApplication</string>
<key>LSBackgroundOnly</key><false/>
</dict></plist>
"""
    (FIXTURE_APP / "Contents" / "Info.plist").write_text(plist)
    step(report, "fixture_build", "pass", bin=str(FIXTURE_BIN))
    return True


def launch_fixture(report: dict) -> subprocess.Popen[str] | None:
    proc = subprocess.Popen(
        [str(FIXTURE_BIN)],
        cwd=ROOT,
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
    step(report, "fixture_launch", "pass", pid=ready.get("pid"), title=ready.get("title"))
    report["fixture"] = ready
    time.sleep(1.0)
    return proc


def window_ids(process: str, pid: int | None = None) -> tuple[list[dict], str]:
    pid_js = "null" if pid is None else str(int(pid))
    script = """
ObjC.import("CoreGraphics");
const info = ObjC.castRefToObject($.CGWindowListCopyWindowInfo(1, 0));
const rows = ObjC.deepUnwrap(info);
const wantPid = __PID__;
const wantName = __NAME__;
const mine = rows.filter(w => {
  if (Number(w.kCGWindowLayer) !== 0) return false;
  const owner = String(w.kCGWindowOwnerName || "");
  if (wantPid !== null) return Number(w.kCGWindowOwnerPID) === wantPid;
  return owner === wantName;
}).map(w => ({
  id: Number(w.kCGWindowNumber),
  title: String(w.kCGWindowName || ""),
  pid: Number(w.kCGWindowOwnerPID)
}));
JSON.stringify(mine);
""".replace("__PID__", pid_js).replace("__NAME__", json.dumps(process))
    result = run(["osascript", "-l", "JavaScript", "-e", script], timeout=15)
    if result.returncode != 0:
        return [], (result.stderr or "")[:300]
    try:
        rows = json.loads(result.stdout or "[]")
    except json.JSONDecodeError:
        return [], (result.stdout or "")[:200]
    out = []
    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, dict):
            continue
        wid = row.get("id")
        if isinstance(wid, int) and wid > 0:
            out.append({"id": wid, "title": str(row.get("title") or "")})
    return out, ""


def names_of(body: dict) -> list[str]:
    data = payload_of(body)
    elements = data.get("elements") or []
    return [str(item.get("name") or "") for item in elements if isinstance(item, dict)]


def snapshot(token: str, endpoint: str, app_id: str, **extra: object) -> tuple[float, int, dict]:
    body = {"id": app_id, "scene": True, "budget": 4000}
    body.update(extra)
    started = time.perf_counter()
    code, env = api("POST", "/v1/app/snapshot", token, endpoint, body, timeout=20)
    elapsed = time.perf_counter() - started
    return elapsed, code, env


def scene_fields(body: dict) -> dict:
    data = payload_of(body)
    elements = data.get("elements") or []
    return {
        "window_id": data.get("window_id"),
        "reason": data.get("truncation_reason"),
        "elements": len(elements) if isinstance(elements, list) else 0,
        "truncated": data.get("truncated"),
        "summary": str(data.get("summary") or "")[:400],
        "scene_id": data.get("scene_id"),
    }


def useful_scene(code: int, body: dict, *, reason: str | None = None, require_elements: bool = True) -> bool:
    fields = scene_fields(body)
    if code != 200 or not fields["window_id"]:
        return False
    if reason is not None and fields["reason"] != reason:
        return False
    if require_elements and fields["elements"] == 0:
        return False
    if fields["elements"] == 0 and fields["reason"] == "time_budget" and reason != "time_budget":
        return False
    return True


def measure_process(report: dict, name: str, process: str) -> None:
    listed = run(
        ["osascript", "-e", f'tell application "System Events" to unix id of process "{process}"'],
        timeout=12,
    )
    if listed.returncode != 0:
        step(report, name, "untested", detail=(listed.stderr or "")[:240])
        return
    pid = (listed.stdout or "").strip()
    if not pid.isdigit():
        step(report, name, "untested", detail="no pid")
        return
    app_id = f"proc:{process}:{pid}"
    # Filled by caller that has the daemon. Stored for the later pass.
    report.setdefault("measure_ids", {})[name] = app_id


def close_textedit(marker: str) -> None:
    script = f'''
tell application "TextEdit"
  repeat with d in documents
    try
      if text of d contains "{marker}" then close d saving no
    end try
  end repeat
end tell
'''
    run(["osascript", "-e", script], timeout=15)


def main() -> int:
    report: dict = {
        "id": "MAC-002",
        "ok": False,
        "checks": [],
        "mutation": "observation_only",
        "os_cursor_used": False,
    }
    identity = run(["git", "rev-parse", "HEAD"], timeout=10)
    status = run(["git", "status", "--porcelain"], timeout=10)
    report["source"] = {
        "sha": (identity.stdout or "").strip(),
        "dirty": bool((status.stdout or "").strip()),
    }
    if platform.system() != "Darwin":
        step(report, "platform", "untested", detail=platform.system())
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps({"ok": False, "out": str(OUT)}))
        return 1
    built = run(["cargo", "build", "-p", "vcu-cli"], timeout=180)
    if built.returncode != 0 or not VCU.exists():
        step(report, "cargo_build", "fail", stderr=(built.stderr or "")[-400:])
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(report, indent=2) + "\n")
        return 1
    step(report, "cargo_build", "pass", bin=str(VCU))
    daemon, token, endpoint = start_daemon(report)
    fixture = None
    textedit_marker = f"VCU-MAC-002-{int(time.time())}-{os.getpid()}"
    try:
        if not token:
            report["ok"] = False
            return 1
        if not compile_fixture(report):
            return 1
        fixture = launch_fixture(report)
        if fixture is None:
            return 1
        for _ in range(8):
            windows, window_err = window_ids("vcu-ax-fixture", int(report["fixture"]["pid"]))
            if len(windows) >= 2:
                break
            time.sleep(0.25)
        step(report, "fixture_windows", "pass" if len(windows) >= 2 else "fail", windows=windows, stderr=window_err)
        app_id = f"proc:vcu-ax-fixture:{report['fixture']['pid']}"
        elapsed, code, env = snapshot(token, endpoint, app_id, max_nodes=8, max_depth=2)
        data = payload_of(env)
        ambiguous = data.get("truncation_reason") == "ambiguous_window" or any(
            (item.get("role") == "AXWindow") for item in data.get("elements") or [] if isinstance(item, dict)
        )
        step(
            report,
            "ambiguous_windows",
            "pass" if code == 200 and ambiguous and not contains_secret(env) else "fail",
            elapsed_s=round(elapsed, 3),
            http=code,
            reason=data.get("truncation_reason"),
            summary=str(data.get("summary") or env)[:500],
            windows=windows,
        )
        primary = next((w for w in windows if "FIXTURE" in w["title"]), None)
        other = next((w for w in windows if "OTHER" in w["title"]), None)
        if not primary or not other:
            step(report, "explicit_window", "fail", detail="missing window id")
            return 1
        e1, c1, left = snapshot(token, endpoint, app_id, window_id=primary["id"], max_nodes=40, max_depth=3)
        e2, c2, right = snapshot(token, endpoint, app_id, window_id=other["id"], max_nodes=20, max_depth=3)
        left_names = names_of(left)
        right_names = names_of(right)
        distinct = "other-window-marker" in right_names and "other-window-marker" not in left_names
        step(
            report,
            "explicit_window",
            "pass" if c1 == 200 and c2 == 200 and distinct and payload_of(left).get("window_id") else "fail",
            left_window=payload_of(left).get("window_id"),
            right_names=right_names[:8],
            left_names=left_names[:8],
            left_s=round(e1, 3),
            right_s=round(e2, 3),
        )
        deep_elapsed, deep_code, deep = snapshot(
            token,
            endpoint,
            app_id,
            window_id=primary["id"],
            expand="0/0/0/0/0/0/0/0/0/0/0/0/0/0/0",
            max_nodes=40,
            max_depth=24,
            timeout_ms=8000,
        )
        deep_names = names_of(deep)
        step(
            report,
            "deep_expand",
            "pass" if deep_code == 200 and "depth-target" in deep_names and not contains_secret(deep) else "fail",
            elapsed_s=round(deep_elapsed, 3),
            names=deep_names[:20],
            reason=payload_of(deep).get("truncation_reason"),
            scene_id=payload_of(deep).get("scene_id"),
        )
        sib_elapsed, sib_code, sib = snapshot(
            token,
            endpoint,
            app_id,
            window_id=primary["id"],
            expand="1",
            max_nodes=80,
            max_depth=4,
            timeout_ms=8000,
        )
        sib_names = names_of(sib)
        step(
            report,
            "sibling_expand",
            "pass" if sib_code == 200 and "sib-39" in sib_names else "fail",
            elapsed_s=round(sib_elapsed, 3),
            count=len(sib_names),
            reason=payload_of(sib).get("truncation_reason"),
        )
        low_elapsed, low_code, low = snapshot(
            token,
            endpoint,
            app_id,
            window_id=primary["id"],
            max_nodes=1,
            max_depth=2,
        )
        low_data = payload_of(low)
        step(
            report,
            "node_budget",
            "pass" if useful_scene(low_code, low, reason="node_budget") else "fail",
            elapsed_s=round(low_elapsed, 3),
            reason=low_data.get("truncation_reason"),
            elements=len(low_data.get("elements") or []),
            window_id=low_data.get("window_id"),
        )
        depth_elapsed, depth_code, depth_body = snapshot(
            token,
            endpoint,
            app_id,
            window_id=primary["id"],
            max_nodes=40,
            max_depth=1,
        )
        step(
            report,
            "depth_budget",
            "pass" if useful_scene(depth_code, depth_body, reason="depth_budget") else "fail",
            elapsed_s=round(depth_elapsed, 3),
            **scene_fields(depth_body),
        )
        out_elapsed, out_code, out_body = snapshot(
            token,
            endpoint,
            app_id,
            window_id=primary["id"],
            max_nodes=20,
            max_depth=3,
            max_output_bytes=256,
        )
        step(
            report,
            "output_budget",
            "pass" if useful_scene(out_code, out_body, reason="output_budget", require_elements=False) else "fail",
            elapsed_s=round(out_elapsed, 3),
            **scene_fields(out_body),
        )
        health_codes = []

        def poll_health() -> None:
            for _ in range(8):
                code, _body = api("GET", "/v1/health", token, endpoint, timeout=2)
                health_codes.append(code)
                time.sleep(0.05)

        import threading

        poller = threading.Thread(target=poll_health)
        poller.start()
        timed_elapsed, timed_code, timed = snapshot(
            token, endpoint, app_id, window_id=primary["id"], timeout_ms=1, max_nodes=80, max_depth=6
        )
        poller.join(timeout=3)
        timed_data = payload_of(timed)
        step(
            report,
            "time_budget_and_daemon",
            "pass" if timed_elapsed < 3 and timed_data.get("truncation_reason") == "time_budget" and 200 in health_codes else "fail",
            elapsed_s=round(timed_elapsed, 3),
            http=timed_code,
            reason=timed_data.get("truncation_reason"),
            health=health_codes,
        )
        secret_hit = contains_secret(left) or contains_secret(deep) or contains_secret(sib) or contains_secret(low)
        step(report, "password_not_in_scene", "pass" if not secret_hit else "fail")
        mutate = api(
            "POST",
            "/v1/app/invoke",
            token,
            endpoint,
            {"id": app_id, "ref": "n1"},
            timeout=10,
        )
        step(
            report,
            "refuse_live_mutation",
            "pass" if mutate[0] >= 400 and "observation-only" in blob(mutate[1]) else "fail",
            http=mutate[0],
        )
        created = run(
            ["osascript", "-e", f'tell application "TextEdit" to make new document with properties {{text:"{textedit_marker}"}}'],
            timeout=20,
        )
        if created.returncode != 0:
            step(report, "textedit_timing", "fail", stderr=(created.stderr or "")[:240])
        else:
            time.sleep(0.3)
            te_pid = run(["osascript", "-e", 'tell application "System Events" to unix id of process "TextEdit"'], timeout=10)
            pid = (te_pid.stdout or "").strip()
            te_windows, _te_err = window_ids("TextEdit", int(pid) if pid.isdigit() else None)
            target = next((w for w in te_windows if textedit_marker in w["title"] or w["title"]), te_windows[-1] if te_windows else None)
            if pid.isdigit() and target:
                te_elapsed, te_code, te_body = snapshot(
                    token,
                    endpoint,
                    f"proc:TextEdit:{pid}",
                    window_id=target["id"],
                )
                step(
                    report,
                    "textedit_timing",
                    "pass" if useful_scene(te_code, te_body) else "fail",
                    elapsed_s=round(te_elapsed, 3),
                    **scene_fields(te_body),
                )
                coop_elapsed, coop_code, coop_body = snapshot(
                    token,
                    endpoint,
                    f"proc:TextEdit:{pid}",
                    window_id=target["id"],
                    timeout_ms=1000,
                    max_nodes=80,
                    max_depth=6,
                )
                step(
                    report,
                    "cooperative_time_budget",
                    "pass" if useful_scene(coop_code, coop_body, reason="time_budget") else "fail",
                    elapsed_s=round(coop_elapsed, 3),
                    **scene_fields(coop_body),
                )
            else:
                step(report, "textedit_timing", "fail", detail="no TextEdit window id")
                step(report, "cooperative_time_budget", "fail", detail="no TextEdit window id")
            close_textedit(textedit_marker)
        import tempfile

        finder_dir = Path(tempfile.mkdtemp(prefix="vcu-mac-002-"))
        (finder_dir / "marker.txt").write_text("vcu-mac-002\n")
        opened = run(["open", "-g", str(finder_dir)], timeout=10)
        if opened.returncode != 0:
            step(report, "finder_timing", "fail", stderr=(opened.stderr or "")[:240])
        else:
            time.sleep(0.6)
            finder = run(["osascript", "-e", 'tell application "System Events" to unix id of process "Finder"'], timeout=10)
            fpid = (finder.stdout or "").strip()
            f_elapsed, f_code, f_body = 0.0, 0, {}
            target = None
            f_windows = []
            f_err = ""
            for _ in range(4):
                if not fpid.isdigit():
                    break
                f_windows, f_err = window_ids("Finder", int(fpid))
                target = next((w for w in f_windows if finder_dir.name in w["title"]), None)
                if target is None:
                    time.sleep(0.4)
                    continue
                f_elapsed, f_code, f_body = snapshot(
                    token,
                    endpoint,
                    f"proc:Finder:{fpid}",
                    window_id=target["id"],
                )
                if useful_scene(f_code, f_body):
                    break
                time.sleep(0.4)
            if not fpid.isdigit() or target is None:
                step(report, "finder_timing", "fail", detail="no Finder window id", stderr=f_err, windows=f_windows[:6])
            else:
                step(
                    report,
                    "finder_timing",
                    "pass" if useful_scene(f_code, f_body) else "fail",
                    elapsed_s=round(f_elapsed, 3),
                    title=target["title"],
                    http=f_code,
                    error=blob(f_body)[:400],
                    **scene_fields(f_body),
                )
            closed_ok = False
            close_err = ""
            for _ in range(3):
                try:
                    closed = run(
                        ["osascript", "-e", f'tell application "Finder" to close window "{finder_dir.name}"'],
                        timeout=4,
                    )
                except subprocess.TimeoutExpired:
                    close_err = "close timed out"
                    continue
                if closed.returncode == 0:
                    closed_ok = True
                    break
                close_err = (closed.stderr or "")[:180]
                time.sleep(0.2)
            if closed_ok:
                subprocess.run(["rm", "-rf", str(finder_dir)], check=False)
                step(report, "finder_cleanup", "pass", title=finder_dir.name)
            else:
                step(report, "finder_cleanup", "fail", detail=close_err or "window still open", title=finder_dir.name)
        required = [
            "ambiguous_windows",
            "explicit_window",
            "deep_expand",
            "sibling_expand",
            "node_budget",
            "depth_budget",
            "output_budget",
            "time_budget_and_daemon",
            "password_not_in_scene",
            "refuse_live_mutation",
            "textedit_timing",
            "cooperative_time_budget",
            "finder_timing",
            "finder_cleanup",
        ]
        by_name = {item["name"]: item["status"] for item in report["checks"]}
        report["ok"] = all(by_name.get(name) == "pass" for name in required)
        return 0 if report["ok"] else 1
    finally:
        if fixture is not None and fixture.poll() is None:
            fixture.terminate()
            try:
                fixture.wait(timeout=3)
            except subprocess.TimeoutExpired:
                fixture.kill()
        close_textedit(textedit_marker)
        stop_daemon(daemon)
        OUT.parent.mkdir(parents=True, exist_ok=True)
        report["finished_at"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
        OUT.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps({"ok": report.get("ok"), "out": str(OUT)}, ensure_ascii=False))


if __name__ == "__main__":
    raise SystemExit(main())
