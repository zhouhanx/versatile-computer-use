#!/usr/bin/env python3
"""Legacy resident restacker. Do not run this.

launchd starts scripts/quiet_window_restack_inetd.sh per request on
127.0.0.1:17991. A long-running Python listener dies and then the quiet
window covers the user's page again.
"""
from __future__ import annotations

import json
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = "127.0.0.1"
PORT = 17991


def restack(left: int, top: int, width: int, height: int) -> str:
    script = f"""
tell application "Microsoft Edge"
  set moved to false
  repeat with w in windows
    try
      set b to bounds of w
      set nearLeft to (item 1 of b) ≥ {left - 8} and (item 1 of b) ≤ {left + 8}
      set nearTop to (item 2 of b) ≥ {top - 8} and (item 2 of b) ≤ {top + 8}
      set nearRight to (item 3 of b) ≥ {left + width - 12} and (item 3 of b) ≤ {left + width + 12}
      set nearBottom to (item 4 of b) ≥ {top + height - 12} and (item 4 of b) ≤ {top + height + 12}
      if nearLeft and nearTop and nearRight and nearBottom then
        set index of w to 1
        set moved to true
      end if
    end try
  end repeat
  if moved then return "ok"
  return "miss"
end tell
"""
    proc = subprocess.run(
        ["osascript", "-e", script],
        capture_output=True,
        text=True,
        timeout=3,
        check=False,
    )
    if proc.returncode != 0:
        return "error"
    return (proc.stdout or "").strip() or "miss"


class Handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:
        if self.path != "/restack":
            self.send_response(404)
            self.end_headers()
            return
        length = int(self.headers.get("Content-Length") or "0")
        raw = self.rfile.read(min(length, 4096))
        try:
            body = json.loads(raw.decode() or "{}")
            left = int(body["left"])
            top = int(body["top"])
            width = int(body["width"])
            height = int(body["height"])
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            self.send_response(400)
            self.end_headers()
            return
        if width < 800 or height < 500:
            self.send_response(400)
            self.end_headers()
            return
        status = restack(left, top, width, height)
        payload = json.dumps({"ok": status == "ok", "status": status}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, fmt: str, *args) -> None:
        return


def main() -> None:
    raise SystemExit("refusing resident Python listener; use scripts/quiet_window_restack")


if __name__ == "__main__":
    main()
