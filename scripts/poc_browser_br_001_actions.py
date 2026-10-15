#!/usr/bin/env python3
"""BR-001: DOM actions and pixel observe must stay in the collapsed VCU group.

Does not launch Chrome or Edge, reload the extension, stop the daemon, click
Allow, attach CDP, move the OS cursor, or automate WeChat. A stolen foreground
is restored to the app that was frontmost immediately before the action.
"""
from __future__ import annotations

import json
import os
import subprocess
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / ".local" / "browser-cu" / "br-001-actions.json"
VCU = ROOT / "target" / "debug" / "vcu"
MARKER = f"vcu-br001-act-{os.getpid()}-{int(time.time())}"


def load_config() -> dict:
    path = Path.home() / ".vcu" / "config.json"
    return json.loads(path.read_text()) if path.exists() else {}


def endpoint() -> str:
    cfg = load_config()
    return f"http://{cfg.get('daemon_host') or '127.0.0.1'}:{int(cfg.get('daemon_port') or 17890)}"


def token() -> str:
    return str(load_config().get("pairing_token") or "")


def http_json(method: str, path: str, body: dict | None = None, timeout: float = 25) -> tuple[int, dict]:
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        endpoint() + path,
        data=data,
        headers={"X-Vcu-Token": token(), "Content-Type": "application/json"},
        method=method,
    )
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


def cli(args: list[str], timeout: float = 30) -> tuple[int, dict]:
    proc = subprocess.run(
        [str(VCU), "--json", *args],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
    )
    text = (proc.stdout or "").strip()
    try:
        parsed = json.loads(text) if text else {}
    except json.JSONDecodeError:
        parsed = {"ok": False, "error": {"message": (text or proc.stderr or "")[:800]}}
    return proc.returncode, parsed


def frontmost() -> str:
    proc = subprocess.run(
        ["osascript", "-e", 'tell application "System Events" to get name of first application process whose frontmost is true'],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=6,
    )
    return (proc.stdout or "").strip()


def app_running(name: str) -> bool:
    proc = subprocess.run(["pgrep", "-x", name], capture_output=True, text=True, timeout=4)
    return proc.returncode == 0


def restore_front(name: str) -> str:
    if not name or name in {"Microsoft Edge", "Google Chrome", "WeChat", "Weixin", "微信"}:
        return "skipped"
    if not app_running(name):
        return "not_running"
    script = f'tell application "{name}" to activate'
    proc = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=6)
    return "restored" if proc.returncode == 0 else "restore_failed"


def tabs() -> tuple[list[dict], list[dict]]:
    code, body = http_json("GET", "/v1/browser/tabs")
    if code != 200 or body.get("ok") is not True:
        return [], []
    data = body.get("data") or {}
    return list(data.get("tabs") or []), list(data.get("groups") or [])


def focused(kind: str = "edge") -> dict | None:
    listed, _ = tabs()
    hits = [t for t in listed if t.get("browser") == kind and (t.get("focused") or t.get("active"))]
    return hits[0] if hits else None


def windows(kind: str = "edge") -> set[str]:
    listed, _ = tabs()
    return {str(t.get("window_id")) for t in listed if t.get("browser") == kind and t.get("window_id") is not None}


class Sampler:
    def __init__(self) -> None:
        self.samples: list[str] = []
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

    def start(self) -> None:
        self._thread.start()

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                self.samples.append(frontmost())
            except Exception as exc:
                self.samples.append(f"error:{exc}")
            self._stop.wait(0.12)

    def stop(self) -> list[str]:
        self._stop.set()
        self._thread.join(timeout=2)
        return self.samples


class Fixture(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        page = f"""<!doctype html><meta charset="utf-8"><title>{MARKER}</title>
<style>
  html,body {{ margin:0; background:#111; color:#fff; font:16px sans-serif; }}
  #banner {{ height:48px; background:#ff00aa; }}
  #hit,#hover {{ width:140px; height:42px; margin:12px; }}
  #field {{ width:240px; height:36px; margin:12px; }}
  #spacer {{ height:2400px; background:#222; }}
</style>
<div id="banner"></div>
<main id="marker">{MARKER}</main>
<button id="hit" data-hits="0">hit</button>
<input id="field" value="">
<button id="hover" data-hovers="0">hover</button>
<div id="spacer" data-scroll="0">scroll</div>
<script>
  const hit = document.getElementById("hit");
  hit.addEventListener("click", () => {{ hit.dataset.hits = String(Number(hit.dataset.hits || 0) + 1); }});
  const hover = document.getElementById("hover");
  hover.addEventListener("mouseover", () => {{ hover.dataset.hovers = String(Number(hover.dataset.hovers || 0) + 1); }});
  const field = document.getElementById("field");
  field.addEventListener("input", () => {{ field.dataset.len = String(field.value.length); }});
  const spacer = document.getElementById("spacer");
  addEventListener("scroll", () => {{ spacer.dataset.scroll = String(scrollY); }}, {{ passive: true }});
</script>""".encode()
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
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, port


def summarize(body: dict) -> dict:
    err = body.get("error") or {}
    data = body.get("data") or {}
    ext = data.get("extension") or {}
    return {
        "ok": body.get("ok"),
        "error": err.get("message") or err.get("code"),
        "source": data.get("source") or ext.get("source"),
        "pressed": data.get("pressed"),
        "typed": data.get("typed") or ext.get("typed"),
        "hovered": data.get("hovered") or ext.get("hovered"),
        "scrolled": data.get("scrolled"),
        "scroll_y": ext.get("scroll_y") or data.get("scroll_y"),
        "background_capture": data.get("background_capture") or (data.get("snapshot") or {}).get("background_capture"),
        "background_scroll": data.get("background_scroll") or ext.get("background_scroll"),
        "capture_id": data.get("capture_id") or (data.get("snapshot") or {}).get("capture_id"),
        "detail": None if not err.get("detail") else str(err.get("detail"))[:1500],
    }



def viewport_scroll(value):
    if isinstance(value, dict):
        viewport = value.get("viewport")
        if isinstance(viewport, dict) and "scroll_y" in viewport:
            return viewport.get("scroll_y")
        for child in value.values():
            found = viewport_scroll(child)
            if found is not None:
                return found
    elif isinstance(value, list):
        for child in value:
            found = viewport_scroll(child)
            if found is not None:
                return found
    return None


def main() -> int:
    report: dict = {
        "id": "BR-001-actions",
        "ok": False,
        "completion_allowed": False,
        "checks": [],
        "os_cursor_used": False,
        "allow_clicked": False,
        "wechat_touched": False,
        "cold_started": False,
    }
    before_front = frontmost()
    report["frontmost_before"] = before_front
    protected = focused("edge")
    report["protected_tab"] = None if not protected else {
        "tab_id": protected.get("tab_id"),
        "window_id": protected.get("window_id"),
        "url": protected.get("url"),
    }
    before_windows = windows("edge")
    report["windows_before"] = sorted(before_windows)
    if not protected or not protected.get("tab_id"):
        report["error"] = "no focused Edge tab; refusing to open a fixture"
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps({"ok": False, "error": report["error"]}))
        return 1

    fixture, port = start_fixture()
    created: list[str] = []
    sampler = Sampler()
    stolen = False
    try:
        sampler.start()
        url = f"http://127.0.0.1:{port}/{MARKER}.html"
        code, opened = cli([
            "browser", "open", "--url", url, "--background", "--browser", "edge",
            "--session-name", f"VCU-ACT-{MARKER[-6:]}",
        ], timeout=30)
        time.sleep(0.4)
        listed, groups = tabs()
        opened_tabs = [t for t in listed if str(t.get("url") or "").startswith(url)]
        now = focused("edge")
        group = None
        if opened_tabs:
            created.append(str(opened_tabs[-1].get("tab_id")))
            gid = str(opened_tabs[-1].get("group_id") or "")
            group = next((g for g in groups if str(g.get("group_id")) == gid), opened_tabs[-1].get("group"))
        open_ok = bool(opened_tabs) and opened.get("ok") is True
        page_same = str((now or {}).get("tab_id")) == str(protected.get("tab_id"))
        collapsed = bool(group and group.get("collapsed") is True)
        report["checks"].append({
            "name": "open_collapsed_group",
            "status": "pass" if open_ok and page_same and collapsed else "fail",
            "http": code,
            "tab_id": created[-1] if created else None,
            "active": None if not opened_tabs else opened_tabs[-1].get("active"),
            "collapsed": None if not group else group.get("collapsed"),
            "group_title": None if not group else group.get("title"),
            "focused_after": None if not now else now.get("tab_id"),
            "error": (opened.get("error") or {}).get("message"),
        })
        if not page_same:
            stolen = True
            return finish(report, protected, before_front, created, sampler, stolen)
        if not created:
            return finish(report, protected, before_front, created, sampler, stolen)

        tab_id = created[-1]
        actions = [
            ("click", ["browser", "click", "--selector", "#hit", "--tab", tab_id, "--browser", "edge"]),
            ("type", ["browser", "type", "--selector", "#field", "--text", "vcu-act", "--tab", tab_id, "--browser", "edge"]),
            ("hover", ["browser", "hover", "--selector", "#hover", "--tab", tab_id, "--browser", "edge"]),
            ("extract", ["browser", "extract", "--selector", "#marker", "--tab", tab_id, "--browser", "edge"]),
            ("scroll", ["browser", "scroll", "--tab", tab_id, "--browser", "edge", "--dy", "480"]),
            ("observe_pixels", ["browser", "observe", "--tab", tab_id, "--browser", "edge", "--pixels", "true"]),
        ]
        for name, args in actions:
            front_at = frontmost()
            code, body = cli(args, timeout=40)
            time.sleep(0.25)
            now = focused("edge")
            listed, groups = tabs()
            agent = next((t for t in listed if str(t.get("tab_id")) == tab_id), None)
            gid = str((agent or {}).get("group_id") or "")
            group = next((g for g in groups if str(g.get("group_id")) == gid), None)
            page_same = str((now or {}).get("tab_id")) == str(protected.get("tab_id"))
            front_now = frontmost()
            front_same = front_now == front_at == before_front or (front_now == before_front and front_at == before_front)
            # The sampler is the authority for a transient steal.
            item = {
                "name": name,
                "status": "pass" if body.get("ok") is True and page_same and front_now == before_front else "fail",
                "http": code,
                "page_same": page_same,
                "front_same": front_now == before_front,
                "front_now": front_now,
                "agent_active": None if not agent else agent.get("active"),
                "group_collapsed": None if not group else group.get("collapsed"),
                "summary": summarize(body),
            }
            if name == "extract":
                item["marker_read"] = MARKER in json.dumps(body)
                if not item["marker_read"]:
                    item["status"] = "fail"
            if name == "scroll":
                scroll_y = item["summary"].get("scroll_y")
                item["scroll_moved"] = isinstance(scroll_y, (int, float)) and not isinstance(scroll_y, bool) and scroll_y > 0
                if not item["scroll_moved"]:
                    item["status"] = "fail"
            if name == "observe_pixels":
                capture_id = item["summary"].get("capture_id")
                saved = {}
                if capture_id:
                    path = Path.home() / ".vcu" / "captures" / f"viewport-{capture_id}.json"
                    if path.exists():
                        saved = json.loads(path.read_text())
                viewport = saved.get("viewport") if isinstance(saved.get("viewport"), dict) else {}
                item["observe_scroll_y"] = viewport.get("scroll_y")
                item["observe_url"] = viewport.get("url")
                item["observe_scrolled"] = (
                    isinstance(item["observe_scroll_y"], (int, float))
                    and not isinstance(item["observe_scroll_y"], bool)
                    and item["observe_scroll_y"] > 0
                    and MARKER in str(item["observe_url"] or "")
                )
                if not item["observe_scrolled"]:
                    item["status"] = "fail"
            report["checks"].append(item)
            if not page_same or front_now != before_front:
                stolen = True
                break
        after_windows = windows("edge")
        report["windows_after_actions"] = sorted(after_windows)
        report["checks"].append({
            "name": "no_extra_window_left",
            "status": "pass" if after_windows == before_windows else "fail",
            "before": sorted(before_windows),
            "after": sorted(after_windows),
        })
    finally:
        samples = sampler.stop()
        report["frontmost_samples"] = samples
        unique = sorted({s for s in samples if s})
        report["frontmost_seen"] = unique
        if any(s and s != before_front for s in samples):
            stolen = True
            report["front_restore"] = restore_front(before_front)
        for tab_id in created:
            http_json("POST", "/v1/browser/close", {"tab_id": tab_id, "browser": "edge"})
        leftover, groups = tabs()
        for tab in leftover:
            if MARKER in str(tab.get("url") or "") or MARKER in str(tab.get("title") or ""):
                http_json("POST", "/v1/browser/close", {"tab_id": str(tab.get("tab_id")), "browser": str(tab.get("browser") or "edge")})
        time.sleep(0.3)
        final = focused("edge")
        report["protected_after"] = None if not final else {"tab_id": final.get("tab_id"), "url": final.get("url")}
        report["protected_restored"] = str((final or {}).get("tab_id")) == str(protected.get("tab_id"))
        if not report["protected_restored"]:
            http_json("POST", "/v1/browser/select", {
                "tab_id": str(protected.get("tab_id")),
                "browser": "edge",
                "focus_window": False,
                "activate": True,
            })
            final = focused("edge")
            report["protected_after_restore"] = None if not final else final.get("tab_id")
            report["protected_restored"] = str((final or {}).get("tab_id")) == str(protected.get("tab_id"))
        _, groups = tabs()
        report["groups_left"] = [
            {"group_id": g.get("group_id"), "title": g.get("title"), "collapsed": g.get("collapsed")}
            for g in groups
            if "VCU" in str(g.get("title") or "") or MARKER[-6:] in str(g.get("title") or "")
        ]
        report["windows_after_cleanup"] = sorted(windows("edge"))
        fixture.shutdown()
        failed = any(item.get("status") == "fail" for item in report["checks"])
        report["stolen"] = stolen or not report.get("protected_restored")
        report["ok"] = not failed and not report["stolen"] and report.get("protected_restored") is True
        report["completion_allowed"] = False
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps({
            "ok": report["ok"],
            "stolen": report["stolen"],
            "protected_restored": report.get("protected_restored"),
            "frontmost_seen": report.get("frontmost_seen"),
            "checks": [{k: item.get(k) for k in ("name", "status", "page_same", "front_same", "agent_active", "group_collapsed")} for item in report["checks"]],
            "out": str(OUT),
        }, ensure_ascii=False))
    return 0 if report.get("ok") else 1


def finish(report, protected, before_front, created, sampler, stolen) -> int:
    report["stolen"] = stolen
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
