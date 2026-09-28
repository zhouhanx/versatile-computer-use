# VCU testing methodology

## Current scope and evidence

Updated 2026-09-28. Released Bridge 0.2.8 remains the browser baseline. New work follows [PLAN-MAINLINES.md](../PLAN-MAINLINES.md): macOS first, browser baseline maintained, shared runtime/host/delivery next, Windows after the macOS/browser candidate gate. Plans and historical reports are not fresh verification results.

Desktop coverage is verified separately from browser coverage. Feishu sending and optional vision/provider work remain draft candidates. No live task, sending, model request or publishing is authorized merely by this test plan.

## Hard bans
- **No WeChat / 微信** automation in any test.
- **Never uninstall/modify Codex Computer Use**.
- **Never click Edge Allow debugging**.
- Do not treat App/Feishu POCs as browser-version gates.
- Do not treat AX chrome (`source=ax_scene_fallback`) as HTML DOM extract.

## Layers
1. Unit/integration: `rtk cargo test --workspace --offline` (includes TC-B policy/coord/mock session/extract/ping)
2. Mock browser POC: `scripts/poc_mock_flow.sh`
3. Live login-state dry-run: `scripts/poc_login_state.sh` (user Edge)
4. Live DOM extract: `scripts/poc_browser_extract.sh` (ping pong + `source=extension_dom`)
5. Install lifecycle: `vcu self info|update|uninstall`
6. App live tests: run the platform-specific POCs in addition to `make check`; a mock backend does not verify AX/UIA. Feishu sending is excluded from default gates. CDP smoke never replaces the USER extension route.

## Authority
- Plan: `docs/PLAN.md`
- Browser test plan: `docs/testing/BROWSER_TEST_PLAN.md`
- Cases: `docs/testing/BROWSER_TEST_CASES.md`
- All tracks and dependencies: `docs/PLAN-MAINLINES.md`
- macOS: `docs/PLAN-MACOS.md` and `docs/testing/DESKTOP_CU_TEST_PLAN.md`
- Browser execution: `docs/PLAN-BROWSER.md`
- Runtime, host, vision and delivery: `docs/PLAN-RUNTIME-DELIVERY.md`
- Windows next batch: `docs/PLAN-EPIC-WIN-SESSION.md`, WIN-101…103

## Acceptance matrix (planned, not executed)

| Track / case group | Work items | Positive evidence | Negative evidence / cleanup |
| --- | --- | --- | --- |
| TC-MAC-001…008 | MAC-001…008 / MAC-NEXT | Deep AX, exact window, write/readback, scroll, real workflow, live CLI/MCP | Permission, stale ref/capture, wrong window, timeout, HUD unavailable, Abort and owned-resource cleanup |
| TC-BR-001…004 | BR-001…004 | Connected USER Chrome/Edge; isolated routing/groups; DOM values/events; valid capture click exactly once | Missing/stale extension, colliding IDs, ambiguous/covered/read-only target, stale/consumed capture, no wrong-tab mutations |
| TC-BR-005 | BR-005 | Inspectable feasibility results for cross-origin DOM, trusted gestures and TC-B-040 separately | Unsupported remains explicit; no CDP Allow, HID or cursor warp workaround; failed research is not delivered capability |
| TC-BR-006 | BR-006 / BROWSER-NEXT | CLI/MCP controlled browser task and independent page state | Disconnect/timeout/missing targets do not replay mutations; restore only owned tabs/groups |
| TC-CORE-001 | CORE-001 | Session and browser/desktop routing isolation, recoverable read paths | Conflicting clients, timeout, restart, stale sessions, no cross-session actions or mutation replay |
| TC-HOST-001 | HOST-001 | Real stdio tools/call and CLI return consistent source/target/results | Malformed/unsupported requests and failures match, isolated host config only |
| TC-POLICY-001 | POLICY-001 | Allowed fixtures and traceable opt-in audit | Denylist, no HUD, Return, credential/password redaction, audit-off behavior |
| TC-APP-001 | APP-001 | App-by-capability matrix linked to concrete versions | Unsupported/absent/private environments stay untested; no implicit message send |
| TC-FEISHU-001 | FEISHU-001 (draft) | Explicitly authorized correct recipient/content appears exactly once | No authorization/wrong recipient/unknown send outcome: stop, never retry blindly |
| TC-VISION-NEXT | VISION-NEXT (draft) | Host-visible screenshots without extra model; configured provider mock response | No default upload/request, no credential logging; unavailable provider/invalid output honest failure |
| TC-WIN-101…103 | WIN-101…103 / WIN-NEXT | Two environments, 100%/150% DPI, representative UIA/control tasks and live CLI/MCP | Wrong HWND/alias, blank occluded capture, stale refs, forbidden keys, Abort; cursor unchanged |
| TC-DELIVERY-001 | DELIVERY-001 | Isolated-prefix install/upgrade and daemon/extension reconnection | Missing/corrupt assets, failed upgrade preserves usable old install, no user profile modification |
| TC-QA-001 | QA-001 | macOS/browser/shared candidate checks and measured performance matrix | Fail/blocked/not-run are explicit; evidence source/version/coverage cannot be inferred from old reports |

## Recording and completion

Each report records work ID, source SHA (plus dirty diff digest when relevant), actual binaries/daemon/extension, OS/architecture/DPI/App/browser, command, time, criterion/expected/actual/status/evidence and cleanup. Keep sensitive captures and detailed reports in `.local/`; commit only redacted summaries and inspectable test code. The report fields are a project convention; use the installed AWR CLI's actual evidence schema when importing.

Pass requires all mandatory criteria at the declared evidence level. `blocked` and `not-run` do not count as passed. A research task can conclude unsupported, but the capability stays unsupported. Historical `completed` is a source assertion, not a fresh candidate-version check. Never rewrite an old report's SHA to the current HEAD.

Run targeted tests first, then the existing product gates for code changes:

```sh
rtk cargo test --workspace --offline
rtk proxy node --test extension/tests/*.test.cjs
rtk proxy make check
```

Platform live POCs and candidate install checks are additional gates, not implied by these commands. Do not freeze historical test counts as expected totals. Documentation-only changes need links, YAML/dependency consistency, AWR reindex/readiness/context and `git diff --check`; they do not require GUI actions or product test reruns.

## False greens (do not repeat)
- `osa_out=ok` / lark-cli send is not VCU.
- Mock Send ref is not a real composer Send.
- `poc-login` dry-run is not a live click (TC-B-040 / LOGIN-LIVE).
- CDP smoke is not login-state.
- `vcu browser extract` with `source=ax_scene_fallback` is not DOM extract.
- `unknown method ping` is a stale service worker, not a working lens.
- Clicking through a WeChat/微信 overlay is not browser CU; live press must AppDenied.
