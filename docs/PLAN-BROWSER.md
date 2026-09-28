# 浏览器主线计划：BR-001…BR-006

更新：2026-09-28。本文件是浏览器下一轮的规划，不是实现报告；本轮只写文档，未做真机操作，任何 planned/研究项均不得写成已通过。

## 1. 定位、基线与边界

- 已发布基线是 Browser Bridge 0.2.8：USER Chrome/Edge + `~/.vcu/lens-extension`，网页动作必须走 `source=extension_dom`。
- 当前优先级仍是 macOS；按 [全主线计划](PLAN-MAINLINES.md) 调度。MAC-001 后执行 BR-001…004，作为 MAC-007 混合任务的网页门禁，不能等 MAC-008 后才开始。
- BR-001…004 是 macOS 主线的浏览器基线/发现问题修复项；只有发现阻塞 macOS 门禁的回归才修复，不与 macOS 切片争用真机。
- BR-005 后置且只做跨源/trusted 可行性研究；BR-006 在已有能力上做 CLI/MCP 闭环，不等待 BR-005。
- 永久边界：不点 Edge Allow debugging，不用 CDP 接管，不用 HID/系统光标，不自动化微信，不改 `~/.codex/computer-use/`，不动用户标签组 1/3。

当前代码表面：`extension/background.js` 负责 bootstrap、hello/poll、双浏览器 client、tab/group 路由和截图限流；`extension/content.js` 负责 DOM extract/click/type/select/hover/scroll、viewport/layout revision 与同源 frame/canvas 边界；`extension/popup.js` 展示按窗口/原生组分区的用户标签。服务端落点为 `crates/vcu-server/src/browser/extension.rs`、`browser/desktop.rs`、`api.rs`，入口为 `crates/vcu-cli/src/main.rs` 与 `crates/vcu-mcp/src/main.rs`。

## 2. 依赖与执行顺序

| ID | 工作项 | 前置 | 状态/范围 |
| --- | --- | --- | --- |
| BR-001 | macOS Chrome/Edge 基线、连接与重载 | MAC-001 | planned；先复用 macOS 基线门禁 |
| BR-002 | 多浏览器/窗口/tab/原生组路由与隔离 | BR-001 | planned |
| BR-003 | DOM 动作、表单、滚动/wait/extract、同源边界 | BR-002 | planned |
| BR-004 | 截图新鲜度、缩放、布局、限流、一次消费 | BR-003 | planned |
| BR-005 | 跨源 iframe/trusted/TC-B-040 可行性研究 | BR-004 + MAC-NEXT | planned；研究交付 |
| BR-006 | CLI/MCP 浏览器任务闭环与验收 | BR-004 + MAC-008 | planned；不依赖 BR-005 |
| BROWSER-NEXT | 汇总稳定能力和研究边界 | BR-005 + BR-006 | planned；总验收 |

每次只领取一条与当前依赖匹配的浏览器项。BR-001…004 的真机动作只限用户自建/可清理网页和既有 macOS 门禁复用；不得为了浏览器计划抢占 MAC-001…008 的窗口、权限或证据。BR-005 若 POC 失败，仍可完成“研究结论/门禁关闭”，但能力不交付。

## 3. 共同验收与证据规则

每项先静态检查和 mock，再 dry-run，最后才在允许范围内做 live；正向和反向用例必须同时登记。动作回执只证明动作派发，不证明网页业务成功，必须重新 observe/extract 或读回状态。证据至少包含 work ID、真实 SHA/diff 摘要、OS/浏览器/扩展版本、命令、时间、`source`、`input_path`、`tab_id`/`browser`、截图或读回结果和清理结果。

网页 DOM 与浏览器整窗 AX 是两条不同观察面：网页 extract/click/type/scroll/wait 必须 `extension_dom`；整窗 `ax_scene` 不能冒充 HTML DOM。`trusted=false`、`os_cursor_used=false` 与失败原因要保留在回执，不能用 AX、CDP、HID 或重试伪造成功。

## BR-001：macOS Chrome/Edge 基线与连接重载（依赖 MAC-001）

目标是确认 macOS 上 USER Chrome、USER Edge、daemon 与 unpacked lens 的实际连接、版本、轮询和重载恢复；不新增网页能力。

代码落点：`browser/extension.rs` 的 client key、poll/health/reload fallback，`login_state.rs`/`api.rs` 的 USER 分类，`extension/background.js` 的 bootstrap/hello/poll/reload_self，`extension/reload.js`，CLI/MCP 的 `ping`、`install-lens --reload` 和 next 文案。

实施步骤：

1. 记录 MAC-001 给出的 OS/架构、daemon/extension 版本和 Chrome/Edge USER 判定，不创建空 Agent profile。
2. 先跑 `vcu browser ping --json`、`vcu browser login-state --json`、`vcu doctor`，再用 `install-lens --reload` 复核每个已连接 browser。
3. 验证 `reload_self` 不响应时只打开对应 `reload.html`，等待新的 pong 后清理 reload 标签；不点 Allow、不把启动成功当重载成功。

正向验收：分别覆盖 Chrome 单连、Edge 单连和双连接；USER 扩展、browser 名和 poll 年龄可解释，重载后版本/health 恢复。反向验收：无扩展、stale SW、Agent profile、非 USER 前台和失联均诚实失败；缺浏览器环境记 blocked/not-run，不能用一个浏览器通过覆盖整个基线。不得改绑另一浏览器、要求点击 Allow、退回 CDP。

现有门禁：`rtk proxy make check`、`rtk proxy node --test extension/tests/*.test.cjs`、`rtk cargo test -p vcu-server --test extension_bridge --test browser_gates --test extension_bootstrap`、`scripts/poc_login_state.sh`、`scripts/poc_extension_bootstrap.sh`。拟新增 `scripts/poc_browser_br_001_macos.py`，但本文件编写时不存在。

证据：`.local/browser-cu/br-001.json`（拟），附 ping/login-state/reload/pong 输出和 `MAC-001` 报告引用；若无用户浏览器只记 SKIP，不记通过。

## BR-002：多浏览器、窗口/tab、原生组路由与隔离（依赖 BR-001）

目标是证明 Chrome 与 Edge 的 tab/window/group 能按 browser 和显式 ID 路由，默认 USER 目标不抢焦点、不跨窗/跨浏览器污染。

代码落点：`extension/background.js` 的 `listTabsState`、`resolveHttpTabState`、`openTab`、`groupTabs`/`selectTab`；`extension/popup.js` 的窗口分区与选择约束；`browser/extension.rs` 的 `list_tabs_merged`、`target_client_for_action`、collision/retryable 错误；CLI/MCP browser/group 参数。

实施步骤：建立双 browser、双 window 的受控 fixture；tab/group 撞号用确定性 mock 覆盖，真机不能强造同号时单列未测；列出 browser_count、window_id、focused、group collapsed；逐一测试显式 `--browser`、last-observe、open/background/new-window、select/close/group/ungroup；结束只清理自建标签。

正向验收：tab/group 返回 `source=extension_tabs` 和 browser 标识；显式目标只作用于所属 lens；新 tab 默认后台进入 VCU 组，select 才展开/聚焦；同窗分组成功，未选用户页和用户组不动。

反向验收：撞号无 `--browser` 拒绝或 retryable；跨窗、跨浏览器、restricted、pinned、失效 tab/group 均失败且无副作用；Agent/非 HTTP 页不能成为隐式目标；open/close/group 不静默替换焦点页。

现有证据/测试：`extension/tests/background.test.cjs` 的窗口、组和 explicit-target 用例，`crates/vcu-server/tests/browser_parity.rs`，`scripts/poc_cu_d_400.py`、`poc_cu_d_630.py`、`poc_cu_d_640.py`、`poc_cu_d_650.py`、`poc_cu_d_660.py`、`poc_cu_d_670.py`、`poc_cu_d_680.py`。拟新增 `scripts/poc_browser_br_002_isolation.py`；证据拟写 `.local/browser-cu/br-002.json`。

## BR-003：DOM 动作、表单、滚动/wait/extract 与同源边界（依赖 BR-002）

目标是把已存在的 extension DOM 路径做成可复核的动作—验证基线：唯一 selector、输入/原生 select、滚动后重测、DOM wait/extract，以及同源 iframe/canvas 的明确边界。

代码落点：`extension/content.js` 的 `resolveUniqueSelector`、`validateTarget`、`typeDom`、`clickDom`、`scrollDom`、`extractDom`、`sameOriginIframeHit`、`clickPoint`；`background.js` 的 `ensureContent`/一次发送；服务端 `api.rs`/`extension.rs` 的 source、tab 和超时回执。

实施步骤：用现有 `interaction.html`/localhost fixture 覆盖 input、textarea、select（value/label）、contenteditable、offscreen、遮挡、disabled/readonly；依次 dry-run→live→observe/extract；再测 selector wait、DOM revision、同源 iframe 和 canvas；每个超时先重新观察，禁止盲目重放 mutation。

正向验收：动作回执带 `source=extension_dom`、`trusted=false`、`os_cursor_used=false`；唯一可编辑目标只改目标，select 派发 input/change；目标可滚动后重新 hit-test；wait/extract 只读同一 tab，并返回 tab/page/focused 元数据；同源 frame/canvas 仅在当前合成路径明确成功时记录。

反向验收：零/多匹配、隐藏、disabled、readonly、inert、occluded、失效 tab 和 stale content 诚实失败；DOM 失败不 AX fallback；cross-origin iframe、object 或要求真实手势的目标返回 unsupported/trusted-input 错误；不把 synthetic event 或 `pressed=true` 写成业务成功。

现有测试：`rtk proxy node --test extension/tests/content.test.cjs extension/tests/background.test.cjs`、`scripts/poc_mock_flow.sh`、`scripts/poc_browser_extract.sh`、`scripts/poc_cu_d_620.py`、`scripts/poc_cu_d_690.py`、`scripts/poc_browser_more_scenarios.py`。拟新增 `scripts/poc_browser_br_003_dom.py`；证据拟写 `.local/browser-cu/br-003.json`，包含正反向 source/input_path 和读回。

## BR-004：截图新鲜度、缩放、布局、限流与一次消费（依赖 BR-003）

目标是证明 viewport PNG 与指定 tab/document/layout 绑定，在 Retina/网页 zoom/scroll/layout 变化时拒绝旧目标，遵守 capture 限流并防止 capture 重用或 mutation 重放。

代码落点：`extension/background.js` 的 `captureVisiblePng` 队列/2 次每秒配额、`capture_tab` 前后 metadata；`content.js` 的 `viewportSnapshot`、document/revision/layout signature、`sameViewport`/`clickPoint`；服务端 `browser/desktop.rs`、`api.rs`、CLI/MCP 的 capture_id 传递。

实施步骤：覆盖 1×/Retina/网页 zoom、CSSOM 位移、遮挡、input/change、scroll、tab 切换、Rust JSON 键序往返和大 PNG；先 screenshot→查看 PNG→dry-run→一次 live click，再重新 observe/extract 验证；记录 60 秒过期和连续截图等待。

正向验收：PNG 尺寸到 CSS viewport 映射正确；capture 绑定 tab、document、URL、尺寸、scroll、zoom、revision/layout；稳定 dry-run 可用，真实动作最多消费一次；队列满足浏览器每秒 2 次限制，大回执可传输但模型只收布局摘要。

反向验收：页面/布局/滚动/输入/窗口或 tab 改变、capture 过期/已消费、超出 layout/scan 预算均拒绝并要求 recapture；window/webview 图不能套 viewport 坐标；失败不可自动重放 click/type/open；截图失败不能复用旧图或包装成功。

现有测试/证据：`extension/tests/content.test.cjs` 的 stale/layout/zoom/canvas 与 JSON roundtrip，`extension/tests/background.test.cjs` 的 capture binding/rate/one-shot，`scripts/poc_browser_parity.py --live`，`docs/testing/BROWSER_PARITY_RESULTS.md`。拟新增 `scripts/poc_browser_br_004_capture.py`；证据拟写 `.local/browser-cu/br-004.json`。

## BR-005：跨源 iframe、trusted 与 TC-B-040 可行性研究（依赖 BR-004 + MAC-NEXT）

这是后置研究门禁，不是实现承诺。研究问题必须拆开：跨源 DOM 是否能在扩展 host permission/frame 注入和身份路由约束下安全读取/定位；trusted 输入是否能由当前浏览器扩展 API 产生。前者即使可行，也不等于后者可行；DOM 可读写不能证明 `event.isTrusted` 或真实用户手势。

研究落点：仅检查 `content.js` 的 `sameOriginIframeHit`/object 拒绝、manifest host permissions、`background.js` 的 frame 路由，以及服务端 `extension.rs`/`desktop.rs` 的 `extension_dom` 保护；参考 `TC-B-040`（L5 非 dry-run 像素点击）及 `scripts/poc_etherscan_labels.sh`，不得绕过既有门禁。

步骤：用两个受控 localhost origin 构造 same-origin/cross-origin frame，记录 content-script 注入、selector/extract、frame 身份和失败码；单独验证 synthetic pointer/keyboard 的 trusted 属性；评估浏览器公开 API/权限限制和清理；不点击 Allow、不启 CDP、不用 HID、OS cursor 或用户真实账号站点。

研究正向验收：保留同源已知结果和跨源实验的可复核日志；若发现安全、权限和 API 证据支持一个受限方案，只写“可行性候选”和未交付风险，不改宣称矩阵。反向验收：跨源访问失败、frame 不可注入、trusted 仍不可产生、TC-B-040 无法安全完成，都记录为研究结论；不得把失败 POC、DOM `trusted=false` 或 AX 像素点击写成浏览器能力通过。

拟新增 `scripts/poc_browser_br_005_cross_origin.py` 与 `docs/testing/BROWSER_CROSS_ORIGIN_RESULTS.md`；报告拟写 `.local/browser-cu/br-005.json`。研究完成的证据是约束、失败/成功路径和后续门禁，不是 release 功能。

## BR-006：CLI/MCP 浏览器任务闭环与验收（依赖 BR-004 + MAC-008，不依赖 BR-005）

目标是让 CLI 与 MCP 对同一 Bridge 契约完成 `ping → observe/查看 PNG → 明确 tab → DOM/viewport 动作 → observe/extract 读回`，同时维持 browser/source/error/安全策略一致。

代码落点：`crates/vcu-cli/src/main.rs` 的 browser 子命令和 help/next，`crates/vcu-mcp/src/main.rs` 的 tools/list/tools/call 与 vision handoff，`crates/vcu-server/src/api.rs`、`browser/extension.rs` 的路由/lease/retry，`playbooks/user-browser.md` 的最短环。

步骤：先以 mock/假扩展跑 CLI 和 MCP 同一 JSON；再做 USER Chrome/Edge dry-run；覆盖 ping/reload、observe、screenshot capture、selector click/type/scroll/wait/extract、tabs/open/group 和错误/超时；最后做一条自建 localhost live 闭环并清理。

正向验收：两入口的 source、tab_id/browser、capture_id、新鲜度、`trusted=false`、错误码和读回结果一致；MCP 有 PNG image content/`must_view`；CLI help 和 next 不引导 Allow；Return 仍有 confirm/send ref 门禁；业务未验证时明确标未验证。

反向验收：断线、stale SW、wrong browser、失效 capture、unsupported cross-origin target、动作超时、selector 失败均不静默换目标、不二次派发、不 AX 假绿；不提供 OS cursor/HID/CDP/微信路径。MAC-008 未通过前不把新桌面契约混入浏览器完成声明。

现有门禁：`rtk cargo test --workspace --offline`、`rtk proxy node --test extension/tests/*.test.cjs`、`rtk proxy make check`、`crates/vcu-mcp/tests/mcp_stdio.rs`、`crates/vcu-server/tests/browser_parity.rs`、`scripts/poc_browser_parity.py --live`。拟新增 `scripts/poc_browser_br_006_contract.py`；证据拟写 `.local/browser-cu/br-006.json`。

## 4. BROWSER-NEXT 收口门禁

BROWSER-NEXT 只有 BR-005 研究报告和 BR-006 闭环证据都完成后才汇总：逐项列出已测浏览器/OS/扩展版本、正反向结果、未测环境、已知限制和是否需要新切片。它不覆盖 macOS MAC-NEXT，也不改变 0.2.8 已发布口径；任何跨源/trusted/TC-B-040 仍停留在研究结论，就明确写“未交付”。本轮只同步规划文档与 AWR 台账，不执行上述功能。

## 5. 统一命令、跳过与证据判读

- 静态/单测基线：`rtk cargo test --workspace --offline`、`rtk proxy node --test extension/tests/*.test.cjs`、`rtk proxy make check`。
- mock 基线：`rtk proxy bash scripts/poc_mock_flow.sh`；登录态 dry-run：`rtk proxy bash scripts/poc_login_state.sh`（无 USER 浏览器只能 `SKIP`，整项不能判通过）。
- DOM 基线：`rtk proxy bash scripts/poc_browser_extract.sh`；交互/截图基线：`rtk proxy python3 scripts/poc_browser_parity.py --live`（仅受控页面）。
- 当前已存在的 parity 报告是历史证据；不能把旧 SHA、旧浏览器或模拟结果绑定到新切片完成状态。
- 拟新增的 `poc_browser_br_00N.*` 在实际实现前均不存在；脚本名是计划落点，不是已运行证据。
- 每项报告必须区分 `PASS`、`FAIL`、`SKIP`、`NOT_RUN`；设备、权限、扩展或浏览器缺失不能通过扩大宣称范围来掩盖。
- 真机 live 仅使用 localhost/临时 fixture；不得登录真实站点、改用户数据或关闭用户现有标签。
- 先完成 BR-001 的连接基线，再复用各项门禁；发现阻塞问题时只提交最小修复和对应反向回归。
- 任何代码修复都要回填 source SHA、测试命令、截图/JSON 证据和清理结果，再由主线负责人决定是否更新台账。
