#!/usr/bin/env python3
"""MAC-006 Stage/Guide lifecycle, abort cleanup, and coordinate checks.

A locked screen stops before any GUI launch. Does not reset TCC, click Edge
Allow, move the OS cursor, automate WeChat, or inject a global Escape.
Abort coverage is the abort file, CLI, and MCP tools/call.
"""
from __future__ import annotations

import json
import os
import platform
import select
import signal
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / ".local" / "desktop-cu" / "mac-MAC-006.json"
USER_DIR = ROOT / ".local" / "desktop-cu" / "mac006-daemon"
FIXTURE_APP = ROOT / ".local" / "desktop-cu" / "VCUAxBinding.app"
FIXTURE_BIN = FIXTURE_APP / "Contents" / "MacOS" / "vcu-ax-binding"
VCU = ROOT / "target" / "debug" / "vcu"
MCP = ROOT / "target" / "debug" / "vcu-mcp"
STAGE = ROOT / "target" / "debug" / "vcu-stage"
PROCESS = "vcu-ax-binding"
TMP = Path(tempfile.gettempdir())
GUIDE_SIZE = 84.0
HOTSPOT = (32.0, 50.0)


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


def error_code(envelope: dict) -> str:
    err = envelope.get("error")
    if isinstance(err, dict):
        return str(err.get("code") or "")
    return ""


def error_message(envelope: dict) -> str:
    err = envelope.get("error")
    if isinstance(err, dict):
        return str(err.get("message") or err.get("detail") or "")[:300]
    return str(envelope.get("error") or "")[:300]


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


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


def pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def owner_files() -> set[Path]:
    return set(TMP.glob("vcu-stage-*.owner"))


def read_json(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


def bundle_from_owner(path: Path) -> dict:
    owner = read_json(path)
    stem = path.with_suffix("")
    return {
        "owner_path": path,
        "stem": stem,
        "control": stem.with_suffix(".json"),
        "visible": stem.with_suffix(".visible"),
        "abort": stem.with_suffix(".abort"),
        "ready": stem.with_suffix(".ready"),
        "daemon_pid": int(owner.get("daemon_pid") or 0),
        "helper_pid": int(owner.get("helper_pid") or 0),
    }


def newest_bundle(before: set[Path]) -> dict | None:
    created = [path for path in owner_files() - before if path.is_file()]
    if not created:
        created = [path for path in owner_files() if path.is_file()]
    if not created:
        return None
    created.sort(key=lambda path: path.stat().st_mtime, reverse=True)
    return bundle_from_owner(created[0])


def stage_windows(pid: int) -> list[dict]:
    if pid <= 0:
        return []
    script = """
ObjC.import("CoreGraphics");
const info = ObjC.castRefToObject($.CGWindowListCopyWindowInfo(1, 0));
const rows = ObjC.deepUnwrap(info);
const want = __PID__;
const mine = rows.filter(w => Number(w.kCGWindowOwnerPID) === want).map(w => {
  const b = w.kCGWindowBounds || {};
  return {
    id: Number(w.kCGWindowNumber),
    owner: String(w.kCGWindowOwnerName || ""),
    pid: Number(w.kCGWindowOwnerPID || 0),
    layer: Number(w.kCGWindowLayer || 0),
    x: Number(b.X || 0),
    y: Number(b.Y || 0),
    width: Number(b.Width || 0),
    height: Number(b.Height || 0)
  };
});
JSON.stringify(mine);
""".replace("__PID__", str(pid))
    result = run(["osascript", "-l", "JavaScript", "-e", script], timeout=15)
    if result.returncode != 0:
        return []
    try:
        parsed = json.loads(result.stdout or "[]")
    except json.JSONDecodeError:
        return []
    return parsed if isinstance(parsed, list) else []


def is_guide(win: dict) -> bool:
    return abs(float(win.get("width") or 0) - GUIDE_SIZE) <= 6 and abs(float(win.get("height") or 0) - GUIDE_SIZE) <= 6


def is_hud(win: dict) -> bool:
    height = float(win.get("height") or 0)
    width = float(win.get("width") or 0)
    return 16 <= height <= 48 and width >= 80 and not is_guide(win)


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


def wait_until(predicate, timeout: float = 3.0, interval: float = 0.05):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        last = predicate()
        if last:
            return last
        time.sleep(interval)
    return last


def start_daemon(report: dict, clean: bool) -> tuple[subprocess.Popen[str] | None, str, str]:
    if clean and USER_DIR.exists():
        subprocess.run(["rm", "-rf", str(USER_DIR)], check=False)
    USER_DIR.mkdir(parents=True, exist_ok=True)
    config_path = USER_DIR / "config.json"
    if clean or not config_path.exists():
        token = os.urandom(32).hex()
        port = free_port()
        config_path.write_text(json.dumps({
            "version": 1,
            "pairing_token": token,
            "daemon_host": "127.0.0.1",
            "daemon_port": port,
            "app_allowlist": [PROCESS, "TextEdit"],
        }))
    else:
        config = json.loads(config_path.read_text())
        token = str(config["pairing_token"])
        port = int(config["daemon_port"])
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
            step(report, "isolated_daemon" if clean else "daemon_restart", "pass", endpoint=endpoint, pid=proc.pid)
            return proc, token, endpoint
        if proc.poll() is not None:
            err = proc.stderr.read()[:400] if proc.stderr else ""
            step(report, "isolated_daemon" if clean else "daemon_restart", "fail", stderr=err)
            return None, token, endpoint
        time.sleep(0.1)
    step(report, "isolated_daemon" if clean else "daemon_restart", "fail", detail="health timeout")
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
    step(report, "fixture_launch", "pass", pid=ready.get("pid"), ax_windows=ready.get("ax_windows"))
    report["fixture"] = ready
    time.sleep(0.4)
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


def presses(status: dict) -> dict:
    raw = status.get("presses") or {}
    return {str(k): int(v) for k, v in raw.items()} if isinstance(raw, dict) else {}


def snapshot(token: str, endpoint: str, app_id: str, window_id: int) -> tuple[int, dict]:
    return api(
        "POST",
        "/v1/app/snapshot",
        token,
        endpoint,
        {"id": app_id, "scene": True, "window_id": window_id, "budget": 4000, "max_nodes": 160, "max_depth": 12, "timeout_ms": 6000},
        timeout=25,
    )


def elements(body: dict) -> list[dict]:
    raw = payload_of(body).get("elements") or []
    return [item for item in raw if isinstance(item, dict)]


def by_ident(items: list[dict], ident: str) -> dict | None:
    exact = [item for item in items if item.get("ax_identifier") == ident and item.get("bound_ref") and item.get("frame")]
    return exact[0] if exact else None


def hover(token: str, endpoint: str, sid: str, app_id: str, ref: str) -> tuple[int, dict]:
    return api(
        "POST",
        f"/v1/session/{sid}/act",
        token,
        endpoint,
        {"type": "hover", "target": {"ref": ref, "tab_id": app_id}, "args": {}},
        timeout=20,
    )


def invoke(token: str, endpoint: str, app_id: str, ref: str, scene_id: str | None) -> tuple[int, dict]:
    body = {"id": app_id, "ref": ref}
    if scene_id:
        body["scene_id"] = scene_id
    return api("POST", "/v1/app/invoke", token, endpoint, body, timeout=15)


def start_session(token: str, endpoint: str, app_id: str) -> tuple[int, dict, str, dict | None]:
    before = owner_files()
    code, body = api(
        "POST",
        "/v1/session/start",
        token,
        endpoint,
        {"browser": "auto", "surface": "desktop", "app_id": app_id},
        timeout=25,
    )
    data = payload_of(body)
    sid = str(data.get("session_id") or "")
    bundle = newest_bundle(before)
    if bundle is None:
        bundle = wait_until(lambda: newest_bundle(before), timeout=2)
        if not isinstance(bundle, dict):
            bundle = None
    return code, body, sid if sid else "", bundle


def visible_hud(bundle: dict | None) -> bool | None:
    if not bundle:
        return None
    path = bundle["visible"]
    if not path.is_file():
        return False
    raw = read_json(path)
    return raw.get("hud") is True


def hide_hud(bundle: dict) -> None:
    bundle["control"].write_text(json.dumps({"stop": False, "hud": False}))


def write_abort(bundle: dict) -> None:
    bundle["abort"].write_text("1")


def session_gone(token: str, endpoint: str, sid: str) -> bool:
    code, _body = api("GET", f"/v1/session/{sid}", token, endpoint, timeout=5)
    return code == 404


def windows_gone(pid: int) -> bool:
    return pid > 0 and not pid_alive(pid) and not stage_windows(pid)


def cli_abort(sid: str) -> tuple[int, dict]:
    result = run([str(VCU), "--user-dir", str(USER_DIR), "--json", "session", "abort", sid], timeout=20)
    try:
        body = json.loads(result.stdout or "{}")
    except json.JSONDecodeError:
        body = {"raw": (result.stdout or "")[:300], "stderr": (result.stderr or "")[:300]}
    return result.returncode, body


def read_mcp(fd: int, deadline: float) -> dict:
    header = b""
    while b"\r\n\r\n" not in header:
        if time.time() > deadline:
            raise TimeoutError("mcp header timeout")
        ready, _, _ = select.select([fd], [], [], 0.2)
        if not ready:
            continue
        chunk = os.read(fd, 1)
        if not chunk:
            raise EOFError("mcp eof")
        header += chunk
    length = 0
    for line in header.decode("utf-8", "replace").split("\r\n"):
        if line.lower().startswith("content-length:"):
            length = int(line.split(":", 1)[1].strip())
    body = b""
    while len(body) < length:
        if time.time() > deadline:
            raise TimeoutError("mcp body timeout")
        ready, _, _ = select.select([fd], [], [], 0.2)
        if not ready:
            continue
        chunk = os.read(fd, length - len(body))
        if not chunk:
            raise EOFError("mcp body eof")
        body += chunk
    return json.loads(body.decode("utf-8"))


def mcp_abort(sid: str) -> dict:
    proc = subprocess.Popen(
        [str(MCP), "--user-dir", str(USER_DIR)],
        cwd=ROOT,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert proc.stdin is not None and proc.stdout is not None
    fd = proc.stdout.fileno()
    os.set_blocking(fd, False)

    def send(obj: dict) -> None:
        raw = json.dumps(obj).encode()
        proc.stdin.write(f"Content-Length: {len(raw)}\r\n\r\n".encode() + raw)
        proc.stdin.flush()

    try:
        send({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "mac006", "version": "0"}},
        })
        init = read_mcp(fd, time.time() + 8)
        send({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {"name": "vcu_session_abort", "arguments": {"session": sid}},
        })
        called = read_mcp(fd, time.time() + 8)
        text = ""
        content = called.get("result", {}).get("content") if isinstance(called.get("result"), dict) else None
        if isinstance(content, list) and content and isinstance(content[0], dict):
            text = str(content[0].get("text") or "")
        parsed = {}
        if text:
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                parsed = {"raw": text[:300]}
        return {"ok": init.get("id") == 1 and bool(parsed), "init_id": init.get("id"), "parsed": parsed, "rpc": called}
    finally:
        proc.kill()


def map_guide(ax_x: float, ax_y: float) -> dict:
    result = run([str(STAGE), "--map-guide", str(ax_x), str(ax_y)], timeout=8)
    if result.returncode != 0:
        return {"ok": False, "stderr": (result.stderr or "")[:300]}
    try:
        parsed = json.loads(result.stdout or "{}")
    except json.JSONDecodeError:
        return {"ok": False, "stdout": (result.stdout or "")[:300]}
    parsed["ok"] = True
    return parsed


def screens() -> list[dict]:
    result = run([str(STAGE), "--screens"], timeout=8)
    if result.returncode != 0:
        return []
    try:
        parsed = json.loads(result.stdout or "[]")
    except json.JSONDecodeError:
        return []
    return parsed if isinstance(parsed, list) else []


def stage_pids() -> set[int]:
    result = run(["pgrep", "-x", "vcu-stage"], timeout=5)
    pids = set()
    for line in (result.stdout or "").splitlines():
        if line.strip().isdigit():
            pids.add(int(line.strip()))
    return pids


def close_enough(a: float, b: float, tol: float = 2.0) -> bool:
    return abs(a - b) <= tol


def cursor_same(before: dict | None, after: dict | None) -> bool:
    if not before or not after:
        return False
    return close_enough(float(before.get("x") or 0), float(after.get("x") or 0), 1.0) and close_enough(
        float(before.get("y") or 0), float(after.get("y") or 0), 1.0
    )


def require_live_session(report: dict, name: str, token: str, endpoint: str, app_id: str) -> tuple[str, dict] | None:
    code, body, sid, bundle = start_session(token, endpoint, app_id)
    data = payload_of(body)
    if code != 200 or not sid or data.get("stage_hud") is not True:
        step(report, name, "fail", http=code, error=error_message(body), stage_hud=data.get("stage_hud"))
        return None
    ready = wait_until(
        lambda: visible_hud(bundle) and stage_windows(int((bundle or {}).get("helper_pid") or 0)),
        timeout=8,
    )
    if not bundle or not ready:
        step(
            report,
            name,
            "fail",
            detail="hud did not become visible",
            presenter=data.get("stage_presenter"),
            bundle=bool(bundle),
            visible=visible_hud(bundle),
            helper_pid=(bundle or {}).get("helper_pid"),
            visible_path=str((bundle or {}).get("visible") or ""),
        )
        return None
    step(report, name, "pass", session_id=sid, presenter=data.get("stage_presenter"), helper_pid=bundle.get("helper_pid"))
    return sid, bundle


def cleanup_session(token: str, endpoint: str, sid: str) -> None:
    if sid:
        api("POST", f"/v1/session/{sid}/abort", token, endpoint, {}, timeout=8)


def finish(report: dict, code: int) -> int:
    required = [item for item in report["checks"] if item["status"] in {"pass", "fail"} and not str(item["name"]).startswith("note_")]
    report["ok"] = bool(required) and all(item["status"] == "pass" for item in required) and not any(
        item["status"] == "fail" for item in report["checks"]
    )
    dirty = bool(report.get("source", {}).get("dirty"))
    report["completion_allowed"] = bool(report["ok"] and not dirty)
    if dirty:
        report["note"] = "dirty worktree evidence is not a completion claim"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"ok": report["ok"], "completion_allowed": report["completion_allowed"], "out": str(OUT)}))
    return 0 if report["ok"] else code


def main() -> int:
    report: dict = {
        "id": "MAC-006",
        "ok": False,
        "completion_allowed": False,
        "checks": [],
        "os_cursor_used": False,
        "note": "completion requires ok=true and a clean source SHA",
        "untested": [],
    }
    identity = run(["git", "rev-parse", "HEAD"], timeout=10)
    status = run(["git", "status", "--porcelain"], timeout=10)
    dirty = bool((status.stdout or "").strip())
    report["source"] = {"sha": (identity.stdout or "").strip(), "dirty": dirty, "porcelain": (status.stdout or "").strip().splitlines()}
    report["host"] = {"os": platform.platform(), "machine": platform.machine(), "python": platform.python_version()}
    if platform.system() != "Darwin":
        step(report, "platform", "untested", detail=platform.system())
        report["untested"].append("non-darwin")
        return finish(report, 1)
    locked = screen_locked()
    if locked is not False:
        step(report, "screen_unlocked", "blocked", locked=locked, detail="screen locked or unknown; refusing GUI before launch")
        report["note"] = "stopped before GUI; this is not a MAC-006 functional failure"
        report["ok"] = False
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps({"ok": False, "blocked_by": "screen_lock", "out": str(OUT)}))
        return 1
    step(report, "screen_unlocked", "pass")
    built = run(["cargo", "build", "-p", "vcu-cli", "-p", "vcu-mcp", "--offline"], timeout=240)
    stage_built = run(["swiftc", "-framework", "AppKit", "-o", str(STAGE), "helpers/vcu-stage/main.swift"], timeout=90)
    if built.returncode != 0 or stage_built.returncode != 0 or not VCU.exists() or not MCP.exists() or not STAGE.exists():
        step(report, "build", "fail", cargo=(built.stderr or "")[-500:], swift=(stage_built.stderr or "")[-500:])
        return finish(report, 1)
    step(report, "build", "pass", vcu=str(VCU), mcp=str(MCP), stage=str(STAGE))

    before_pids = stage_pids()
    before_files = owner_files()
    display_rows = screens()
    mapped = map_guide(100, 200)
    after_pids = stage_pids()
    after_files = owner_files()
    no_hud = after_pids == before_pids and after_files == before_files and mapped.get("ok") is True and display_rows
    step(
        report,
        "screens_and_map_guide_do_not_start_hud",
        "pass" if no_hud else "fail",
        screens=len(display_rows),
        new_pids=sorted(after_pids - before_pids),
        new_files=len(after_files - before_files),
        map_ok=mapped.get("ok"),
    )
    report["displays"] = display_rows
    scales = sorted({float(row.get("scale") or 0) for row in display_rows})
    negative = [row for row in display_rows if float((row.get("frame") or [0])[0]) < 0 or float((row.get("frame") or [0, 0])[1]) < 0]
    report["untested"].append("scale_1x" if 1.0 not in scales else "scale_1x_present_not_used_for_live_guide")
    if 1.0 in scales:
        step(report, "scale_1x_live_guide", "untested", detail="1x display exists but the live guide check uses the fixture display")
    else:
        step(report, "scale_1x_live_guide", "untested", detail="no 1x display")
    if 3.0 not in scales:
        step(report, "scale_3x_live_guide", "untested", detail="no 3x display")
        report["untested"].append("scale_3x")
    else:
        step(report, "scale_3x_live_guide", "untested", detail="3x display exists but was not the fixture guide target")
    if not negative:
        step(report, "negative_origin_live_guide", "untested", detail="no display with a negative Cocoa origin")
        report["untested"].append("negative_display_origin")
    formula_ok = (
        mapped.get("ok") is True
        and mapped.get("hotspot") == [32, 50]
        and mapped.get("size") == 84
        and close_enough(float(mapped.get("quartz", [0, 0])[0]), 100 - 32)
        and close_enough(float(mapped.get("quartz", [0, 0])[1]), 200 - (84 - 50))
    )
    step(report, "map_guide_formula", "pass" if formula_ok else "fail", mapped=mapped)
    if negative:
        frame = negative[0].get("frame") or [0, 0, 0, 0]
        primary = next((row for row in display_rows if row.get("primary")), display_rows[0])
        primary_max_y = float(primary.get("max_y") or 0)
        ax_x = float(frame[0]) + 20
        ax_y = primary_max_y - (float(frame[1]) + float(frame[3])) + 20
        neg_map = map_guide(ax_x, ax_y)
        neg_ok = neg_map.get("ok") is True and close_enough(float(neg_map.get("quartz", [0, 0])[0]), ax_x - 32)
        step(report, "map_guide_negative_origin_formula", "pass" if neg_ok else "fail", ax=[ax_x, ax_y], mapped=neg_map)
        step(report, "negative_origin_live_guide", "untested", detail="formula checked; guide was not placed on that display")

    daemon, token, endpoint = start_daemon(report, clean=True)
    fixture = None
    helper_pids: list[int] = []
    try:
        if not token or not daemon or not compile_fixture(report):
            return finish(report, 1)
        fixture = launch_fixture(report)
        if fixture is None:
            return finish(report, 1)
        pid = int(report["fixture"]["pid"])
        app_id = f"proc:{PROCESS}:{pid}"
        windows = []
        for _ in range(8):
            windows = [row for row in window_ids(PROCESS, pid) if int(row.get("pid") or 0) == pid]
            if any(row.get("title") == "VCU-MAC-003-A" for row in windows):
                break
            time.sleep(0.25)
        left = next((row for row in windows if row.get("title") == "VCU-MAC-003-A"), None)
        step(report, "fixture_window", "pass" if left else "fail", windows=windows)
        if not left:
            return finish(report, 1)
        window_id = int(left["id"])

        started = require_live_session(report, "visible_hud_session", token, endpoint, app_id)
        if not started:
            return finish(report, 1)
        sid, bundle = started
        helper_pids.append(int(bundle["helper_pid"]))
        scene_code, scene = snapshot(token, endpoint, app_id, window_id)
        target = by_ident(elements(scene), "go-a")
        if scene_code != 200 or not target:
            step(report, "guide_hover_matches_window", "fail", http=scene_code, detail="no go-a frame")
            return finish(report, 1)
        frame = target["frame"]
        ax_x = float(frame[0]) + float(frame[2]) / 2
        ax_y = float(frame[1]) + float(frame[3]) / 2
        mouse_before = mouse_location()
        hover_code, hover_body = hover(token, endpoint, sid, app_id, str(target["bound_ref"]))
        mouse_after = mouse_location()
        guide = payload_of(hover_body).get("detail", {}).get("guide") or payload_of(hover_body).get("guide") or {}
        mapped_live = map_guide(float(guide.get("x") or ax_x), float(guide.get("y") or ax_y))
        wins = stage_windows(int(bundle["helper_pid"]))
        guides = [win for win in wins if is_guide(win)]
        expected = mapped_live.get("quartz") or [ax_x - 32, ax_y - 34]
        guide_match = False
        if guides and mapped_live.get("ok"):
            guide_match = any(
                close_enough(float(win["x"]), float(expected[0])) and close_enough(float(win["y"]), float(expected[1]))
                for win in guides
            )
        hover_ok = (
            hover_code == 200
            and guide.get("os_cursor_used") is False
            and close_enough(float(guide.get("x") or -1), ax_x, 1.5)
            and close_enough(float(guide.get("y") or -1), ax_y, 1.5)
            and guide_match
            and cursor_same(mouse_before, mouse_after)
        )
        step(
            report,
            "guide_hover_matches_window",
            "pass" if hover_ok else "fail",
            http=hover_code,
            ax=[ax_x, ax_y],
            guide=guide,
            windows=wins,
            expected_quartz=expected,
            cursor_before=mouse_before,
            cursor_after=mouse_after,
            error=error_message(hover_body),
        )
        report["measured_display_scale"] = next((row.get("scale") for row in display_rows if row.get("primary")), None)

        hide_hud(bundle)
        became_hidden = wait_until(lambda: visible_hud(bundle) is False, timeout=2)
        reject_code, reject_body = hover(token, endpoint, sid, app_id, str(target["bound_ref"]))
        app_code, app_body = invoke(token, endpoint, app_id, str(target["bound_ref"]), payload_of(scene).get("scene_id"))
        hidden_ok = bool(became_hidden) and reject_code == 400 and error_code(reject_body) == "StageRequired"
        step(
            report,
            "hidden_hud_rejects_action",
            "pass" if hidden_ok else "fail",
            visible=visible_hud(bundle),
            http=reject_code,
            code=error_code(reject_body),
            message=error_message(reject_body),
            app_invoke_http=app_code,
            app_invoke_code=error_code(app_body),
        )
        if app_code == 200:
            step(report, "note_app_invoke_while_hidden", "fail", detail="app invoke bypassed the hidden HUD gate")

        helper_pid = int(bundle["helper_pid"])
        os.kill(helper_pid, signal.SIGKILL)
        gone = wait_until(lambda: session_gone(token, endpoint, sid) and not stage_windows(helper_pid), timeout=8)
        post_code, post_body = hover(token, endpoint, sid, app_id, str(target["bound_ref"]))
        kill_ok = bool(gone) and post_code in {400, 404} and not pid_alive(helper_pid)
        step(
            report,
            "helper_exit_rejects_and_cleans",
            "pass" if kill_ok else "fail",
            helper_alive=pid_alive(helper_pid),
            windows=stage_windows(helper_pid),
            http=post_code,
            code=error_code(post_body),
        )

        restarted = require_live_session(report, "restart_probe_session", token, endpoint, app_id)
        if not restarted:
            return finish(report, 1)
        old_sid, old_bundle = restarted
        helper_pids.append(int(old_bundle["helper_pid"]))
        old_scene_code, old_scene = snapshot(token, endpoint, app_id, window_id)
        old_target = by_ident(elements(old_scene), "go-a")
        epoch_before = (USER_DIR / "stage-epoch").read_text(encoding="utf-8").strip() if (USER_DIR / "stage-epoch").exists() else ""
        old_scene_id = str(payload_of(old_scene).get("scene_id") or "")
        old_ref = str((old_target or {}).get("bound_ref") or "")
        if old_scene_code != 200 or not old_ref or not epoch_before:
            step(report, "daemon_restart_drops_old_scene", "fail", http=old_scene_code, epoch=epoch_before)
            return finish(report, 1)
        orphan_pid = int(old_bundle["helper_pid"])
        os.kill(daemon.pid, signal.SIGKILL)
        daemon.wait(timeout=3)
        daemon = None
        time.sleep(0.2)
        orphan_alive = pid_alive(orphan_pid)
        daemon, token, endpoint = start_daemon(report, clean=False)
        if not daemon:
            return finish(report, 1)
        epoch_after = (USER_DIR / "stage-epoch").read_text(encoding="utf-8").strip() if (USER_DIR / "stage-epoch").exists() else ""
        swept = wait_until(lambda: not pid_alive(orphan_pid) and not stage_windows(orphan_pid), timeout=3)
        new_started = require_live_session(report, "post_restart_session", token, endpoint, app_id)
        new_scene_id = ""
        stale_code = 0
        stale_body: dict = {}
        if new_started:
            new_sid, new_bundle = new_started
            helper_pids.append(int(new_bundle["helper_pid"]))
            new_code, new_scene = snapshot(token, endpoint, app_id, window_id)
            new_scene_id = str(payload_of(new_scene).get("scene_id") or "")
            stale_code, stale_body = hover(token, endpoint, new_sid, app_id, old_ref)
            cleanup_session(token, endpoint, new_sid)
        restart_ok = (
            orphan_alive
            and bool(swept)
            and epoch_after
            and epoch_after != epoch_before
            and new_scene_id
            and new_scene_id != old_scene_id
            and stale_code != 200
        )
        step(
            report,
            "daemon_restart_drops_old_scene",
            "pass" if restart_ok else "fail",
            orphan_alive_before_restart=orphan_alive,
            swept=bool(swept),
            epoch_before=epoch_before,
            epoch_after=epoch_after,
            old_scene_id=old_scene_id,
            new_scene_id=new_scene_id,
            stale_http=stale_code,
            stale_code=error_code(stale_body),
        )
        cleanup_session(token, endpoint, old_sid)

        for name, cleaner in (
            ("cli_abort_cleans_hud", lambda sid: cli_abort(sid)),
            ("mcp_abort_cleans_hud", lambda sid: (0, mcp_abort(sid))),
            ("abort_file_cleans_hud", None),
        ):
            live = require_live_session(report, name + "_setup", token, endpoint, app_id)
            if not live:
                step(report, name, "fail", detail="could not start session")
                continue
            live_sid, live_bundle = live
            helper = int(live_bundle["helper_pid"])
            helper_pids.append(helper)
            if cleaner is None:
                write_abort(live_bundle)
                result_ok = True
            else:
                rc, body = cleaner(live_sid)
                result_ok = rc == 0 or bool(body)
            cleaned = wait_until(lambda: session_gone(token, endpoint, live_sid) and not stage_windows(helper), timeout=3)
            step(report, name, "pass" if result_ok and cleaned and not pid_alive(helper) else "fail", helper_alive=pid_alive(helper), windows=stage_windows(helper))
            cleanup_session(token, endpoint, live_sid)
        return finish(report, 1)
    finally:
        if fixture is not None and fixture.poll() is None:
            fixture.kill()
        stop_daemon(daemon)
        for helper in helper_pids:
            if pid_alive(helper):
                try:
                    os.kill(helper, signal.SIGKILL)
                except OSError:
                    pass


if __name__ == "__main__":
    raise SystemExit(main())
