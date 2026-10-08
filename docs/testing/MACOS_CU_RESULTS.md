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

## MAC-002

更新：2026-10-08 21:40 +0800。报告 `.local/desktop-cu/mac-MAC-002.json` 为 `ok=true`，但工作树相对 `2aad00b` 仍是脏的。这不是完成绑定。干净 SHA 复跑通过前不能 `awr work complete`。

默认预算由这次夹具、TextEdit 和单文件 Finder 窗口实测确定，并写在 Scene 摘要里：`max_nodes=80`，`max_depth=6`（显式 expand 默认深度 24），`timeout_ms=4500`，`max_output_bytes=24000`。输出预算下限是 256。文本区、文本框、密码框和标尺默认不向下展开，原因是 `content_not_expanded`，不是完整树。脚本用 `NSDate` 在超时前返回已收集节点和 `TRUNC|time_budget`；外部 kill 只是 900ms 宽限后的兜底。

| 验收 | 结果 | 证据 |
| --- | --- | --- |
| 同 App 双窗口按 CGWindowID 选择，不回退 `window 1` | pass | 夹具两窗 `ambiguous_window`；指定 id 后左右标记不串窗 |
| 深度 16 按 `0/0/...` 展开到达 `depth-target` | pass | `deep_expand` 1.341s，`timeout_ms=8000` |
| 同级 40 个子元素展开到达 `sib-39` | pass | `sibling_expand` 3.018s，41 个节点 |
| 节点、深度、输出、时间预算原因明确 | pass | `node_budget` 1 个元素；`depth_budget` 5 个元素；请求 256 字节得到 `output_budget`；`timeout_ms=1` 为 `time_budget`，health 仍 200 |
| 超时前返回已收集节点，不把空超时当成功 | pass | TextEdit `timeout_ms=1000` 1.198s，9 个元素，`time_budget`，`window_id=1499` |
| 密码值不进入 Scene | pass | 响应不含 `vcu-secret-should-not-leak` |
| `nN` 引用拒绝 live mutation | pass | invoke `n1` HTTP 400，observation-only |
| TextEdit 默认预算有窗口和元素 | pass | 3.768s，29 个元素，`content_not_expanded`，不是 0 元素空超时 |
| Finder 临时窗口有窗口和元素，删除前关闭 | pass | 4.658s，46 个元素，`time_budget`；`finder_cleanup` pass |
| mock/Windows/MCP 可选字段 | pass | `vcu-server` lib 108；`vcu-mcp` mcp_stdio 1；`vcu-cli` 4 |

窗口身份仍用本进程 `CGWindowListCopyWindowInfo` 的 `kCGWindowNumber`，再按标题和几何匹配。System Events 的 `id of window` 不能转成文本，也不回退 `window 1`。新 Scene 仍是 observation-only。

### 已跑命令

- `python3 scripts/poc_mac_002_scene.py`：隔离 daemon 与自建夹具，`ok=true`。Darwin 27.0 arm64。没有改 TCC，没有点 Edge Allow，没有移动系统光标，没有自动化微信。
- `cargo test -p vcu-server --lib`：108 通过。
- `cargo test -p vcu-mcp --test mcp_stdio`：1 通过。
- `cargo test -p vcu-cli`：4 通过。

### 不宣称

- 不宣称 Finder 在 4500ms 内走完默认深度。这次实测在 46 个元素处按 `time_budget` 返回，窗口 id 已绑定。
- 不宣称文本内容、标尺标记或密码控件子树已展开。这些角色记为 `content_not_expanded`。
- 不把这次脏工作树结果写成已完成。没有领取 `MAC-003` 或 `BR-001`。没有结束会话 `01M4DJ9FZJA5A39ZS0CBB5V8GA` 或 `01M3KKZTFFQTZ3FF0DWWZHP5QV`。
