#!/bin/bash
# Restart the session restacker if it exits. Must be started from the user
# GUI session. launchd cannot send Edge Apple Events without a permission
# prompt, and a prompt is not allowed.
set -u
root="$(cd "$(dirname "$0")/.." && pwd)"
bin="$root/.local/browser-cu/quiet_window_restack"
while true; do
  if [[ -x "$bin" ]]; then
    "$bin"
  fi
  sleep 0.3
done
