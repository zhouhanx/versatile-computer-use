# macOS 桌面能力执行计划

更新：2026-09-28。依据：用户明确要求「统一计划和台账，优先开发 macOS 端功能，先写具体执行计划」。本轮交付为计划和台账；以下功能切片尚未实施、未复测。总体优先级见 [PLAN.md](PLAN.md)，执行状态以 `.awr/intake/work-ledger.yaml` 为准。

## 1. 目标与范围

在保留 Browser Bridge 0.2.8 登录态网页主路径的基础上，把 macOS 桌面从分项 POC 推进为可重复使用的受限产品能力：指定真实窗口 → 有预算的 AX 观察与窗口截图 → 绑定观察结果的动作 → 独立读回验证 → 可见、可中止、可清理的会话。

本轮优先覆盖 TextEdit、Finder 和脚本自建原生测试窗口；Notes 仅验证已有非破坏性控件。Terminal 只保留无换行输入与拒绝执行的回归，系统设置只读。飞书发送、Windows 新功能、跨源 iframe、trusted 手势和 TC-B-040 不进入本轮。

「深 AX」指能按需展开原生应用可访问的深层控件，并诚实报告预算截断或不可访问区域；不承诺读取任意 App 的全部内容，不用增大常量伪装完整树。网页内容仍由扩展提供 `source=extension_dom`。宿主已有视觉时无需配置额外模型。

## 2. 已有基础与本轮缺口

以下为 2026-09-28 静态代码检查和历史记录，不代表本轮真机验收。

| 已有基础 | 代码或证据 | 本轮需要补齐 |
| --- | --- | --- |
| AX BFS、窗口元数据与 CG 列窗降级 | `crates/vcu-server/src/app/macos.rs`：`ax_bfs_script`、`snapshot` | 当前默认最多 80 节点、深度 13；增强应用 160 节点、深度 14；单节点子元素取前 16/32 个。需可控展开、精确截断原因与超时隔离 |
| 扁平 Scene 元素、预算截断 | `crates/vcu-server/src/app/mod.rs`：`AppElement`、`AppSnapshot` | 补窗口身份、观察代次、父子关系与动作能力；密码等敏感值脱敏 |
| `eN` 引用、AXPress / AXSetValue | `macos.rs`：`ax_invoke_script`、`set_value` | 引用按重新遍历序号匹配，多处依赖 `window 1`；TextEdit 失败后回退首个文本区。需拒绝过期/错窗引用及不匹配的回退 |
| 截图缓存、滚动、等待和提取路径 | `macos.rs`：`scroll`；`browser/desktop.rs`：`last_capture`、`click_pixels`、wait/extract；`api.rs` | 截图缓存尚无观察代次绑定；滚动不按传入 ref 定位。需拒绝旧图/新树混用并精确验证目标 |
| Stage HUD、Guide、Abort | `crates/vcu-server/src/stage.rs`、`helpers/vcu-stage/main.swift` | 复测真实 Escape、helper 异常退出、会话失效和多屏坐标，动作与可见会话生命周期一致 |
| TextEdit、Notes、Finder、Terminal 分项 POC | `scripts/poc_desktop_*.py`、`tests/desktop_session.rs`、`tests/app_http.rs` | 明确构建版本与 daemon 版本，完成同一任务的观察—动作—验证，并保留负向证据 |

## 3. 实现约定

1. 继续使用现有 Rust daemon / CLI / MCP 与 macOS 后端，不新建第二套运行时。先验证现有 AppleScript/JXA 路径；只有它无法满足某项验收且 POC 证明原生 AX 路径有效时，才在本仓库引入最小原生 helper，并记录选择依据。
2. Scene 新字段采取向后兼容的可选字段。拟增加 `window_id`、`scene_id`、元素父引用、支持的动作和 `truncation_reason`；精确 schema 在 MAC-002/003 固化。mock、Windows 及 MCP 兼容测试同改。
3. 动作引用必须绑定进程实例、指定窗口与 Scene；不把裸 `eN` 当跨观察稳定 ID。先校验再动作，失效要求重新观察；超时 mutation 不自动重放。
4. 窗口截图、AX frame 和 Guide 使用同一坐标转换；截图失败不能拿被遮挡的屏幕区域冒充。像素动作必须验证截图与窗口、缩放和布局的新鲜度。
5. 执行回执与业务结果分开：AX 调用成功后仍要读回值、控件状态或截图。无法确认结果则明确返回未验证，不能直接声称任务成功。
6. 沿用现有 App 策略、微信拒绝、Return 门禁、浏览器扩展路由和用户标签组 1/3 保护。不搬系统光标，不代点 Edge Allow，不改 `~/.codex/computer-use/`，不自动发送消息。

## 4. 切片、依赖和验收

`MAC-NEXT` 保留为 macOS 本轮总验收项；发布托管验收归已完成的 CU-D-700，不再混入深 AX。

执行顺序：`MAC-001 → MAC-002 → MAC-003 → MAC-004 → MAC-005 → MAC-006 → MAC-007 → MAC-008 → MAC-NEXT`。MAC-007 另依赖浏览器基线 BR-004，完整主线见 [PLAN-MAINLINES.md](PLAN-MAINLINES.md)。同一时间只领取一条主切片。首项为 ready，后续为 planned 并受前置依赖约束；planned 不表示已经开工。每项先完成最小 POC，再改产品代码，最后记录可复核证据。

### MAC-001：权限、构建与基线诊断（P0，ready）

- 目标：区分缺权限、空树、超时、截图失败和版本不匹配，建立本机基线。
- 落点：`doctor.rs`、`app/macos.rs`、现有 macOS POC；拟新增 `scripts/poc_mac_001_preflight.py`。
- 工作：记录 OS/架构、构建 SHA、实际二进制及 daemon 路径、权限诊断、当前窗口观察结果。区分 Accessibility、Screen Recording 及现有 Apple Events 路径涉及的 Automation 问题，核对实际 daemon/helper 身份。检查列窗/截帧起始查询的超时、延时 kill 线程的进程复用风险，以及 helper 活着但 HUD 未就绪的情况。复用 TextEdit/Notes/Finder POC，不重做已证明的功能。
- 验收：缺权限分支有确定性测试并给出正确 repair hint；有权限时能观察脚本自建 TextEdit 窗；超时有边界且无残留子进程，不对已退出/复用的 pid 延迟发送终止信号；HUD 未就绪不得动作；基线报告逐项标明 pass/fail/未测。真机权限不足时保留阻塞原因，不修改 TCC，不把整项写成完成。
- 下一步：修复实际基线故障，完成本项后才推进深 AX。

### MAC-002：有预算的深 AX Scene（P0，planned）

- 前置：MAC-001。
- 落点：`app/macos.rs` 的读取/遍历/解析；`app/mod.rs` Scene 类型；拟新增 `scripts/poc_mac_002_scene.py` 和受控原生 AX 测试夹具。
- 工作：先建立只读的 pid/窗口身份与显式选窗，避免继续依赖 `window 1`，再支持指定窗口内子树按需展开；记录父子关系、role/name/frame、可用动作、可编辑性。区分节点/深度/时间/输出预算截断、权限失败及 App 不暴露内容；脱敏密码控件；避免同步 AX 卡住整个 daemon。MAC-003 通过前，新 Scene 不用于 live mutation。
- 验收：夹具含深度超过 14、同级超过 32 个子元素，目标可通过显式子树展开到达；有限预算返回准确原因，不能以空树假成功；密码值不进入 Scene/日志；低预算与异常节点不使 daemon 失去响应。
- 预算：首轮以现有 4.5s/8s 超时为基线记录耗时，不承诺未测性能。最终默认节点、深度、超时和输出预算必须由夹具及 TextEdit/Finder 实测确定并写进报告。

### MAC-003：指定窗口、Scene 引用与截图绑定（P0，planned）

- 前置：MAC-002。
- 落点：`app/macos.rs`、`app/mod.rs`、`browser/desktop.rs`、`api.rs`、`state.rs`；拟新增 `scripts/poc_mac_003_binding.py`。
- 工作：按 pid/窗口身份观察和动作；Scene 代次绑定 ref。校验目标角色与身份，禁止重新 BFS 后只按 `eN` 执行；截图绑定窗口、几何、缩放和观察代次。明确移动/滚动/重建后的失效规则。
- 验收：同一 App 两个自建窗口、同名控件、窗口重排/关闭、元素插入/移除、旧 Scene/ref/capture 的负向测试均不误操作；无明确目标且有歧义时拒绝；新观察后正确目标 dry-run 与 live 均可验证；无静默焦点抢占。

### MAC-004：精确点击与输入、动作后读回（P0，planned）

- 前置：MAC-003。
- 落点：`invoke`、`set_value`、`press_at_point`、HTTP/MCP 动作回执；拟新增 `scripts/poc_mac_004_actions.py`。
- 工作：按 Scene 暴露的能力选择 AXPress/AXSetValue；收紧 TextEdit 首文本区回退，目标不能重定向。区分调用成功与结果已验证；非零、不可编辑、不可用动作及超时均诚实返回。
- 验收：TextEdit 指定自建文档写入唯一标记并独立读回；测试按钮改变明确状态；错误 ref/只读控件/非零 AX 错误不改变其他控件；无自动重放；`os_cursor_used=false`；Return 与终端换行门禁保持。

### MAC-005：目标滚动、等待和提取（P1，planned）

- 前置：MAC-004。
- 落点：`app/macos.rs::scroll`、`browser/desktop.rs` 的 wait/extract 及 `api.rs`；拟新增 `scripts/poc_mac_005_navigation.py`。
- 工作：滚动必须尊重指定 ref 与窗口，按可用 AX 动作或滚动条能力执行；等待每次重新观察并使用明确定位条件；提取来自同一窗口/Scene，继承脱敏规则。
- 验收：双滚动区只改变指定区；滚动后可见内容或滚动条读回发生预期变化；等待值/名称/角色命中正确控件，缺失目标诚实超时；提取能读回 MAC-004 标记；不支持的滚动明确失败。

### MAC-006：Stage/Guide 生命周期与坐标（P1，planned）

- 前置：MAC-005；现有 StageRequired/Abort 门禁在前面所有切片中持续有效。
- 落点：`stage.rs`、`helpers/vcu-stage/main.swift`、desktop session 管理；拟新增 `scripts/poc_mac_006_session.py`。
- 工作：补齐 HUD 启动失败、helper 退出、Escape/CLI/MCP Abort、会话结束及 daemon 重启的清理；动作前确认会话可见且未中止；统一 AX 点、截图像素和 Guide 坐标。
- 验收：HUD 不可见或 Abort 后的动作被拒绝，重启不复用旧 Scene；无残留自建 HUD/Guide；Retina 缩放及负坐标用确定性测试；本机可用显示器做真机点位对照。多屏/1× 无设备时标未测，缩小宣称范围。

### MAC-007：真实应用任务闭环（P1，planned）

- 前置：MAC-006、BR-004（登录态网页基线）。
- 落点：复用 `poc_desktop_textedit.py`、`poc_desktop_finder.py`、`poc_desktop_notes.py`、`poc_desktop_terminal.py`；拟新增 `scripts/poc_mac_007_workflows.py`。
- 工作：把单动作证据组成可重复任务；只用临时文档、临时目录、自建窗口和 localhost 浏览器抛页。
- 验收：TextEdit 观察→写入→滚动/提取→验证；Finder 临时目录观察→reveal/open_path→新窗验证（如走 NSWorkspace 必须如实标注）；受控原生按钮 AXPress→状态验证；浏览器与原生 App 切换后各走正确 source。成功与中途失败均清理自建资源，不关闭用户已有文档。
- Terminal 仅复测无换行输入/拒绝执行，Notes 仅复测非破坏性控件；不得把 Finder open_path 证据写成 AX 图标点击。

### MAC-008：CLI/MCP 契约、回归与交付说明（P1，planned）

- 前置：MAC-007。
- 落点：`crates/vcu-cli`、`crates/vcu-mcp`、HTTP 契约测试、`playbooks/desktop.md`、安装/接入文档及能力矩阵；拟新增 `scripts/poc_mac_008_contract.py`。
- 工作：CLI 与 MCP tools/call 统一目标、Scene、source、错误与 Abort 语义；更新宿主最短操作环；验证本地构建/打包安装到隔离前缀后的桌面路径。
- 验收：两入口至少各跑一条观察→动作→读回→Abort；错误 ref/权限/超时/Abort 行为一致；Rust/Node/浏览器冻结门禁通过；能力矩阵区分单测、本机真机、其他机器未测；不将 arm64 真机证据外推至 x64。
- 本项不创建新 Release、不推送发布、不上架扩展。发布版本与发布动作单独安排。

### MAC-NEXT：本轮总验收（P1，planned）

- 前置：MAC-008（通过依赖链覆盖 MAC-001…007）。
- 完成标准：上述八项对各自受测版本有证据；最终候选版本完成集成与浏览器回归；未覆盖 App/显示器/架构及限制写入能力矩阵；计划、台账、接入文档一致。旧报告不改绑新 SHA。
- 可宣称：已验证 App 和环境下的 macOS 受限桌面会话能力。不得宣称完整 macOS/Windows/Codex CU、任意 App 全树或 trusted 网页操作。

## 5. 验证、证据和执行节奏

拟新增脚本是交付物约定，目前尚不存在。实现时先复用仓库已有 POC，避免重复测试设施。每条切片的报告写入 `.local/desktop-cu/mac-<ID>.json`，摘要写入拟新增的 `docs/testing/MACOS_CU_RESULTS.md`。

每份报告至少记录：work ID、真实 source SHA（未提交修改另记 diff 摘要/哈希）、OS/架构/显示器、实际二进制与 daemon、命令、时间、逐条验收结果、source/input_path、截图或读回证据、清理结果。本轮规划文档不能充当未来功能完成报告。

现有 `desktop_session.rs`/`app_http.rs` 主要使用 MockAppBackend，`make check` 不代替 macOS 真机 POC。每条切片跑相关定向测试；产品代码交付必须跑：

```sh
rtk cargo test --workspace --offline
rtk proxy node --test extension/tests/*.test.cjs
rtk proxy make check
```

真机先 dry-run（接口支持时），再对脚本自建目标 live。没有 dry-run 的接口先过 mock/只读定位检查；不要虚构命令参数。依赖或设备缺失要记录，不将跳过写成通过。浏览器真机只动自建 localhost 标签。

MAC-001 结束后依据基线重新估算工作量；每个切片以验收门禁推进，不沿用旧路线图的周数承诺。遇到 AX 不暴露控件，先记录受限结果并验证最小替代路径，不能以 HID/移动鼠标绕过。

## 6. 其他主线与历史状态

| 主线 | 本轮安排 |
| --- | --- |
| 浏览器 Bridge 0.2.8 | BR-001…004 做当前基线并作为 MAC-007 门禁，BR-006 做 CLI/MCP 闭环；BR-005 在 MAC-NEXT 后做跨源/trusted 可行性研究，BROWSER-NEXT 为 planned 汇总 |
| Windows | 保留 WIN-FIX-001…009、WIN-VIS 至 013、CU-WIN-SESSION-001…091 历史证据；QA-001 后 WIN-101…103 → WIN-NEXT，planned，不排在 macOS 前 |
| 飞书 | `FEISHU-001` 改为 draft 表示停放候选，移出可领取队列；真发送另需用户明确任务与收信人 |
| 发布托管 | CU-D-700 已完成，不再纳入 MAC-NEXT |
| 运行时/宿主/策略/交付 | CORE/HOST/POLICY/DELIVERY/QA 补公共能力与候选包验证，复用本轮 macOS 证据，不重复计功 |

历史 Windows 成果以专项文档为细项来源，台账用三条历史汇总索引承接；汇总 completed 只表示既有记录已整理，不代表本次重新验证或完整产品验收。AWR source-completed 数量不是当前版本测试通过数。
