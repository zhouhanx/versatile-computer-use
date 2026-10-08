# macOS CU 结果

更新：2026-10-08。这里只记录已经实际跑过的命令。`.local/desktop-cu/mac-MAC-001.json` 是 gitignore 的绑定报告；工作树脏时 `source_identity=warn`，整体 `ok` 不得当成完成。

## MAC-001

| 验收 | 结果 | 证据 |
| --- | --- | --- |
| 缺权限、Automation 与 Accessibility 不混写 | pass | `doctor::tests::permission_classes_do_not_collapse_or_reset_tcc`；`AutomationDenied` CLI 退出码 4 |
| 超时不杀已退出或复用 pid，超时后无残留 | pass | `empty_or_mismatched_start_token_must_not_signal`、`mismatched_start_token_does_not_kill_live_sleep`、`bounded_timeout_reaps_unique_sleeper` |
| HUD 未就绪拒绝动作 | pass | `stage::tests::unready_native_hud_rejects_action`、`browser::desktop::tests::desktop_action_rejects_unready_hud` |
| 截图失败分类，缺 Screen Recording 不弹窗 | pass | `classify_screenshot_failure`；doctor 生产代码不调用 `screencapture` |
| 授权下观察自建 TextEdit 并关闭 | pass | 预检 `textedit_observe`，命中 `scroll-text-area`，leftover `0` |
| 现有 TextEdit/Notes/Finder POC | untested | 不把历史 POC 改绑到这个 SHA |
| PATH 二进制就是本工作树 | warn | `~/.local/bin` 的 vcu/vcu-daemon/vcu-stage 不是 `target/debug` 或 `target/release`。没有覆盖这些文件 |
| 干净 source SHA | pass | `00d2be7bf15a75ba0bf002c4613e68e3100ff8fb`，预检 `ok=true`，dirty=false |

预检还记录了 Automation、Accessibility 和 `CGPreflightScreenCaptureAccess` 均成功，且没有截屏。显示器只计数，不截图。

### 已跑命令

- `cargo test --workspace`：通过。`vcu-server` lib 98 项通过。
- `node --test extension/tests/*.test.cjs`：47 通过。
- `scripts/poc_mock_flow.sh`、`scripts/poc_actions_extra.sh`、`scripts/poc_login_state.sh`、`scripts/pack-release.sh`、`scripts/poc_install_curl.sh`：通过。
- `make check` 第一次失败：本机没有监听 `127.0.0.1:17890` 的 daemon，且 `pack-release.sh` 调用了不存在的 `python`。随后用 `target/debug/vcu daemon start` 临时拉起 daemon，跑完 login-state 后已 `daemon stop`。打包脚本改为 `python3`。没有覆盖 `~/.local/bin`。
- `python3 scripts/poc_mac_001_preflight.py`：`00d2be7` 和文档提交 `745bcb9` 的干净工作树都是 `ok=true`。最终绑定 SHA 是 `745bcb9c1429217cefa8199479ba1774bda647cc`。Darwin arm64，2 个显示器只计数。TextEdit 由 `scroll-text-area` 命中，leftover `0`。PATH 三个二进制仍是 warn。

### 不宣称

- 不宣称 `~/.local/bin` 的 Release 二进制包含 `00d2be7`。没有覆盖 `vcu-stage`。
- 不把历史 TextEdit/Notes/Finder POC 改绑到这个 SHA。
- 文档提交后的复跑 JSON 才是最终绑定；如果复跑不是 `ok=true`，不能把本文件当成完成。
