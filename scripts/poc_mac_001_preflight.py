#!/usr/bin/env python3
"""MAC-001 preflight baseline.

Records OS, architecture, source identity, binary/daemon paths, and permission
class. Does not reset TCC, click Edge Allow, move the OS cursor, automate
WeChat, or capture the user screen.

A script-created TextEdit document is observed only when both Automation and
Accessibility succeed. Only that temporary document is closed.
Existing TextEdit/Notes/Finder POCs are not re-run and are recorded as untested.
"""
from __future__ import annotations

import hashlib
import json
import os
import platform
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / ".local" / "desktop-cu" / "mac-MAC-001.json"
MARKER = f"VCU-MAC-001-{int(time.time())}-{os.getpid()}"


def run(cmd: list[str], timeout: float = 20) -> subprocess.CompletedProcess[str]:
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


def file_sha256(path: str) -> str | None:
    try:
        digest = hashlib.sha256()
        with open(path, "rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()
    except OSError as exc:
        return f"unreadable:{exc}"


def screen_recording_preflight() -> dict:
    if platform.system() != "Darwin":
        return {"status": "untested", "detail": "CGPreflightScreenCaptureAccess is macOS-only"}
    try:
        import ctypes

        lib = ctypes.cdll.LoadLibrary("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics")
        lib.CGPreflightScreenCaptureAccess.restype = ctypes.c_bool
        granted = bool(lib.CGPreflightScreenCaptureAccess())
    except Exception as exc:
        return {"status": "untested", "detail": f"preflight unavailable: {exc}"[:300]}
    return {
        "status": "pass" if granted else "fail",
        "detail": "CGPreflightScreenCaptureAccess only; this POC does not capture the screen",
        "granted": granted,
    }


def git_identity() -> dict:
    sha = run(["git", "rev-parse", "HEAD"])
    status = run(["git", "status", "--short"])
    diff = run(["git", "diff", "--stat"])
    sha_text = (sha.stdout or "").strip()
    dirty = bool((status.stdout or "").strip())
    if sha.returncode != 0 or len(sha_text) < 7:
        return {"status": "untested", "sha": None, "dirty": None, "error": (sha.stderr or "")[:300]}
    return {
        "status": "warn" if dirty else "pass",
        "sha": sha_text,
        "dirty": dirty,
        "status_short": (status.stdout or "")[:2000],
        "diff_stat": (diff.stdout or "")[:2000],
    }


def classify_osascript(stderr: str, returncode: int) -> str:
    text = stderr.lower()
    if returncode == 0:
        return "pass"
    if "not authorized to send" in text or "-1743" in text or "-1744" in text:
        return "automation_denied"
    if "assistive" in text or "-25211" in text or "not allowed" in text or "1002" in text:
        return "accessibility_denied"
    return "fail"


def observe_textedit(report: dict) -> None:
    create = f'''
tell application "TextEdit"
  set d to make new document
  set text of d to "{MARKER}"
  set seen to text of d
  set docName to name of d
  return seen & linefeed & docName
end tell
'''
    created = run(["osascript", "-e", create], timeout=25)
    created_class = classify_osascript(created.stderr or "", created.returncode)
    if created.returncode != 0:
        step(
            report,
            "textedit_observe",
            "fail" if created_class != "pass" else "fail",
            classification=created_class,
            stderr=(created.stderr or "")[:400],
            note="did not create a document; no close attempted",
        )
        return
    stdout = (created.stdout or "").strip()
    textedit_read = MARKER in stdout
    time.sleep(0.4)
    ax = run(
        [
            "osascript",
            "-e",
            'tell application "System Events" to get name of first process',
        ],
        timeout=20,
    )
    ax_class = classify_osascript(ax.stderr or "", ax.returncode)
    window_probe = run(
        [
            "osascript",
            "-e",
            f'''
tell application "System Events"
  tell process "TextEdit"
    set hits to {{}}
    repeat with w in windows
      try
        if (name of w as text) contains "{MARKER}" then set end of hits to "window-name:{MARKER}"
      end try
      try
        repeat with a in (every text area of w)
          try
            if (value of a as text) contains "{MARKER}" then set end of hits to "window-text-area:{MARKER}"
          end try
        end repeat
      end try
      try
        repeat with s in (every scroll area of w)
          try
            repeat with a in (every text area of s)
              try
                if (value of a as text) contains "{MARKER}" then set end of hits to "scroll-text-area:{MARKER}"
              end try
            end repeat
          end try
        end repeat
      end try
    end repeat
    return hits as text
  end tell
end tell
''',
        ],
        timeout=25,
    )
    window_class = classify_osascript(window_probe.stderr or "", window_probe.returncode)
    observed = window_probe.returncode == 0 and MARKER in (window_probe.stdout or "")
    close = run(
        [
            "osascript",
            "-e",
            f'''
tell application "TextEdit"
  repeat with d in documents
    try
      if text of d contains "{MARKER}" then close d saving no
    end try
  end repeat
end tell
''',
        ],
        timeout=25,
    )
    leftover = run(
        [
            "osascript",
            "-e",
            f'''
tell application "TextEdit"
  set hits to 0
  repeat with d in documents
    try
      if text of d contains "{MARKER}" then set hits to hits + 1
    end try
  end repeat
  return hits
end tell
''',
        ],
        timeout=20,
    )
    leftover_count = (leftover.stdout or "").strip()
    cleaned = leftover.returncode == 0 and leftover_count == "0"
    if ax_class == "automation_denied" or window_class == "automation_denied":
        status = "fail"
        note = "Automation denied; TextEdit observation not claimed"
    elif window_class == "accessibility_denied" or ax_class == "accessibility_denied":
        status = "fail"
        note = "Accessibility denied; TextEdit observation not claimed"
    elif observed and textedit_read and cleaned:
        status = "pass"
        note = "script-created TextEdit document observed and closed"
    else:
        status = "fail"
        note = "created document was not independently observed or not cleaned"
    step(
        report,
        "textedit_observe",
        status,
        note=note,
        textedit_read=textedit_read,
        ax_probe=ax_class,
        window_probe=window_class,
        window_stdout=(window_probe.stdout or "")[:300],
        window_stderr=(window_probe.stderr or "")[:400],
        closed=close.returncode == 0,
        close_stderr=(close.stderr or "")[:300],
        leftover=leftover_count,
        cleaned=cleaned,
    )


def main() -> int:
    report = {
        "work_id": "MAC-001",
        "ok": False,
        "marker": MARKER,
        "os": platform.system(),
        "arch": platform.machine(),
        "release": platform.platform(),
        "checks": [],
        "constraints": {
            "tcc_modified": False,
            "edge_allow_clicked": False,
            "os_cursor_moved": False,
            "wechat_automated": False,
            "screen_captured": False,
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    identity = git_identity()
    step(report, "source_identity", identity.pop("status"), **identity)
    screens = run(
        ["osascript", "-e", 'tell application "System Events" to count of desktops'],
        timeout=8,
    )
    if screens.returncode == 0 and (screens.stdout or "").strip().isdigit():
        step(report, "displays", "pass", count=int(screens.stdout.strip()), note="count only; no screen capture")
    else:
        step(
            report,
            "displays",
            "untested",
            stderr=(screens.stderr or "")[:200],
            note="display count unavailable; no screen capture attempted",
        )
    for name in ("vcu", "vcu-daemon", "vcu-stage"):
        found = shutil.which(name)
        digest = file_sha256(found) if found else None
        workspace_hit = None
        if found:
            for candidate in (
                ROOT / "target" / "debug" / name,
                ROOT / "target" / "release" / name,
            ):
                if candidate.is_file() and file_sha256(str(candidate)) == digest:
                    workspace_hit = str(candidate)
                    break
        status = "pass" if found else "untested"
        if found and workspace_hit is None:
            status = "warn"
        step(
            report,
            f"which_{name}",
            status,
            path=found,
            sha256=digest,
            workspace_build=workspace_hit,
            note=None if workspace_hit or not found else "PATH binary is not a workspace debug/release build of this tree",
        )
    probe = run(["osascript", "-e", 'tell application "System Events" to get name of first process'])
    probe_class = classify_osascript(probe.stderr or "", probe.returncode)
    if probe.returncode == 0:
        step(report, "automation", "pass", detail=(probe.stdout or "").strip()[:200])
        step(report, "accessibility", "pass", detail="System Events process probe succeeded")
    elif probe_class == "automation_denied":
        step(report, "automation", "fail", stderr=(probe.stderr or "")[:400], hint="Grant Automation. This is not Accessibility.")
        step(report, "accessibility", "untested", detail="probe failed before an assistive-access result")
    elif probe_class == "accessibility_denied":
        step(report, "automation", "pass", detail="Apple Events reached System Events")
        step(report, "accessibility", "fail", stderr=(probe.stderr or "")[:400])
    else:
        step(report, "permission_probe", "fail", classification=probe_class, stderr=(probe.stderr or "")[:400])
        step(report, "automation", "untested")
        step(report, "accessibility", "untested")
    recording = screen_recording_preflight()
    step(report, "screen_recording", recording.pop("status"), **recording)
    step(report, "existing_textedit_poc", "untested", detail="not re-run; historical POC is not this SHA")
    step(report, "existing_notes_poc", "untested", detail="not re-run; historical POC is not this SHA")
    step(report, "existing_finder_poc", "untested", detail="not re-run; historical POC is not this SHA")
    automation_ok = any(c["name"] == "automation" and c["status"] == "pass" for c in report["checks"])
    accessibility_ok = any(c["name"] == "accessibility" and c["status"] == "pass" for c in report["checks"])
    if automation_ok and accessibility_ok:
        try:
            observe_textedit(report)
        except subprocess.TimeoutExpired as exc:
            step(report, "textedit_observe", "fail", detail=f"timeout: {exc}")
    else:
        step(
            report,
            "textedit_observe",
            "untested",
            detail="skipped because Automation and Accessibility did not both succeed; permission block is not completion",
        )
    required = {"source_identity", "automation", "accessibility", "textedit_observe"}
    by_name = {c["name"]: c["status"] for c in report["checks"]}
    report["ok"] = all(by_name.get(name) == "pass" for name in required)
    report["blocked_by_permission"] = by_name.get("textedit_observe") in {"untested", "fail"} and not (
        automation_ok and accessibility_ok and by_name.get("textedit_observe") == "pass"
    )
    OUT.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"ok": report["ok"], "out": str(OUT), "checks": report["checks"]}, indent=2, ensure_ascii=False))
    return 0 if report["ok"] else 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps({"work_id": "MAC-001", "ok": False, "error": str(exc)}, indent=2) + "\n")
        print(f"MAC-001 POC failed: {exc}", file=sys.stderr)
        raise SystemExit(2)
