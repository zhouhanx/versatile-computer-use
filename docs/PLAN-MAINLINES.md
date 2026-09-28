# VCU 全主线计划与验收总览

更新：2026-09-28。用户要求把 macOS AX、浏览器等所有主线及验收统一写入计划。本文覆盖已有产品目标和已识别后续项，不代表全部开工；当前开发优先级仍为 macOS。总入口为 [PLAN.md](PLAN.md)，状态和依赖为 `.awr/intake/work-ledger.yaml`。

## 1. 主线地图

| 主线 | 当前基础（历史证据） | 本轮/后续目标 | 工作项与详细计划 |
| --- | --- | --- | --- |
| macOS AX 与窗口观察 | 有限 BFS、CGWindow、TextEdit/Notes 分项 POC | 权限诊断、指定窗口、深层子树、脱敏、Scene/ref/capture 新鲜度 | MAC-001…003，[macOS 计划](PLAN-MACOS.md) |
| macOS 动作与原生 App | AXPress/AXSetValue、Finder open/reveal、终端受限输入 | 精确目标、动作后读回、目标滚动/wait/extract、真实任务闭环 | MAC-004/005/007、APP-001；[macOS 计划](PLAN-MACOS.md)及本文第 5 节 |
| Stage/Guide 可见会话 | 原生 HUD、虚拟指针、Abort | HUD 就绪与动作门禁、Escape/异常清理、缩放/多屏点位 | MAC-006；[macOS 计划](PLAN-MACOS.md) |
| Chrome/Edge 浏览器 | Bridge 0.2.8，用户登录态、DOM、截图、原生组、多浏览器定向 | 基线复测、连接恢复、路由隔离、DOM/表单、截图可靠性、复杂目标研究 | BR-001…006 → BROWSER-NEXT，[浏览器计划](PLAN-BROWSER.md) |
| 公共运行时与路由 | Rust daemon/session、browser/desktop adapters | 会话隔离、异常恢复、超时不重放、source 与 target 契约 | CORE-001，[运行时与交付计划](PLAN-RUNTIME-DELIVERY.md) |
| CLI/MCP 与宿主接入 | CLI、MCP、playbook、安装指南 | 真实 tools/call、错误一致性、宿主最短闭环、混合 surface 结果一致 | MAC-008 + HOST-001，[运行时与交付计划](PLAN-RUNTIME-DELIVERY.md) |
| 视觉能力 | 宿主截图交接、可选视觉配置 | 有视觉宿主零额外配置；无视觉宿主的显式 provider 配置及错误边界 | VISION-NEXT（draft），[运行时与交付计划](PLAN-RUNTIME-DELIVERY.md) |
| Windows UIA 与产品会话 | 修复至 009、视觉记录至 013、会话至 091 | 跨机器/DPI、真实结果验证、窗口身份及完整任务回归 | WIN-101…103 → WIN-NEXT，[Windows 后续计划](PLAN-EPIC-WIN-SESSION.md#后续执行计划2026-09-28未实施) |
| 策略、隐私与证据 | allowlist/denylist、Return 门禁、可选审计、浏览器冻结测试 | 统一权限/脱敏/审计验证，按环境记录能力，杜绝 mock/历史证据冒充当前真机 | POLICY-001（本文第 4 节）、QA-001，[验收方法](testing/METHODOLOGY.md) |
| 安装、更新与交付 | CU-D-700 Release/self update、unpacked 扩展 | 隔离前缀安装升级、失败保留旧版本、daemon/扩展版本一致、候选包验收 | DELIVERY-001，[运行时与交付计划](PLAN-RUNTIME-DELIVERY.md) |

macOS AX 负责原生窗口与控件，扩展负责网页 HTML；两者均有独立验收。AXWebArea/浏览器外壳不是 DOM；跨源 DOM 与 trusted 输入也不是同一项能力。

## 2. 执行批次与依赖

| 批次 | 执行内容 | 进入/退出条件 |
| --- | --- | --- |
| A：macOS 基座 | MAC-001 → 002 → 003 → 004 → 005 → 006 | 首项 ready；每项按实际 POC、负向测试和浏览器冻结门禁推进 |
| B：浏览器持续基线 | MAC-001 后 BR-001 → 002 → 003 → 004 | macOS 上 Chrome/Edge 自建页面复测；发现问题才修；在 MAC-007 混合任务前完成，不与桌面真机抢窗口 |
| C：macOS 产品闭环 | MAC-007（依赖 MAC-006、BR-004）→ MAC-008 → MAC-NEXT | 原生+网页均独立验证；完成仅覆盖受测 App/架构/显示器 |
| D：公共能力与候选交付 | CORE-001（MAC-006 后）→ HOST-001（另依赖 MAC-008）；POLICY-001（CORE 后）；BR-006（BR-004、MAC-008 后）→ DELIVERY-001 → QA-001 | 复用平台证据，补跨 surface/宿主/安装/故障验证；本轮仅规划，不发布 |
| E：后置扩展 | BR-005（MAC-NEXT、BR-004 后）、APP-001（MAC-NEXT 后）、WIN-101…103（QA-001 后） | 浏览器探索先证明可行性，App 先只读，Windows 需真机；这些不阻塞 macOS 自身收口 |
| 候选 | FEISHU-001、VISION-NEXT、EXTRACT-NEXT、LINUX-NEXT、HARNESS-NEXT、COORD-NEXT | draft 不可领取；每项已有研究范围与退出条件，重新排期后才实施 |

完整依赖在台账。MAC-NEXT 是 macOS 本轮验收，BROWSER-NEXT 是浏览器基线加可行性结论汇总，WIN-NEXT 是 Windows 下一批验收；三者均不是发布命令。BR-005 研究报告即使判定不可行，也可关闭该研究切片，但相应功能必须继续标「不支持/未交付」。

同一时间只领取一条产品主切片。macOS 优先；BR-001…004 是 MAC-007 的网页门禁，不改变 macOS 优先方向。公共代码改动必须回归相关平台，跨机器证据缺失时不得外推。

## 3. 各主线统一验收方式

具体输入、期望和命令见各专项；统一执行以下规则：

1. 先明确场景和实际版本：work ID、source SHA/未提交差异、实际 daemon/二进制/扩展版本、平台架构、App/浏览器、权限及缩放。
2. 先确定性/夹具验证，再以自建窗口或 localhost 页面进行只读定位、dry-run（接口支持时）、live 和结果读回。HTTP 200、`ok=true`、AXPress 返回零均不能单独证明业务成功。
3. 每个 mutation 至少有一个成功结果和对应负向结果：错目标/旧引用/旧截图/权限不足/不支持能力/超时。拒绝前后要证明未改错窗口，超时不得盲目重放。
4. 平台适配器需真实平台验证；mock 只证明策略和协议。手动环境、CI 机器、具体浏览器/架构/显示器分别记证据，不以一个通过覆盖所有组合。
5. 桌面检查 HUD/Guide 和 Abort 清理；浏览器检查用户页/焦点/组未被改动。任务失败也清理自建资源。
6. 报告结果用 pass/fail/blocked/not-run；研究可用 supported/unsupported/needs-evidence 描述能力。blocked/not-run 不是通过。结果与限制摘要进版本化文档，敏感截图及完整报告留 `.local/`。
7. 所有代码切片跑相关单测、扩展测试和既有 `make check`；平台 live 另跑专项 POC。历史用例数不可当本次结果；重跑范围由改动决定。

报告至少包含 `work_id`、`source_sha`、`dirty_diff_digest`（如适用）、`environment`、`command`、`verified_at`、`checks[]`（criterion/expected/actual/status/evidence）、`cleanup` 和报告摘要/哈希。此为规划的共同字段约定；接入 AWR evidence 时必须遵循当前 CLI 实际报告 schema，不声称这就是 AWR 可直接导入格式。

总验收矩阵与跨主线命令见 [METHODOLOGY.md](testing/METHODOLOGY.md)。验收通过后才更新相应 completed 和能力说明，不能用本计划作为功能完成证据。

## 4. POLICY-001：策略、隐私与审计一致性

状态 planned，P0，依赖 CORE-001；验收是 DELIVERY-001 的前置。

- 落点：`crates/vcu-server/src/app/mod.rs`、`api.rs`、`audit.rs`、`doctor.rs`，各 adapter、Scene 及扩展内容读取路径。
- 实施：列出 browser/desktop、CLI/MCP 的策略入口；复用既有拒绝测试，检查公共 schema 新增字段是否泄露密码/配置；为审计建立 session/target/source/input_path/result 的关联，审计关闭时不额外留内容。
- 正向：授权自建控件可操作；仅记录完成验证所需字段；打开审计后能追溯一次操作属于哪个会话、窗口/标签及真实路径。
- 负向：微信硬拒绝、无 HUD 桌面拒绝、盲 Return 拒绝、错目标拒绝；密码值/凭据不出现在 Scene/日志；不引入 CDP Allow/系统光标/HID 绕过。用 mock/静态检查验证微信拒绝，不打开微信做 POC。
- 门禁：相关 Rust/扩展策略测试、临时用户目录中的日志内容检查及受控失败流程；审计关闭/开启分别测试。拟新增专项 POC，不直接读取用户聊天或私有数据。
- 完成：记录每个策略入口与测试映射，红线无例外路径、错误回执一致；浏览器可行性若与策略冲突，按不支持处理，不能修改红线求通过。

## 5. APP-001 与 FEISHU-001：应用覆盖与飞书候选

### APP-001：原生/Electron 应用兼容矩阵

状态 planned，P2，依赖 MAC-NEXT。复用 MAC-007 的 TextEdit/Finder/Notes/Terminal 结果；先扩展只读观察，避免每个 App 再造一套动作框架。

- 落点：`app/macos.rs`、`playbooks/desktop.md`、`playbooks/feishu.md`、已有 `scripts/poc_desktop_*.py`。
- 实施：为 TextEdit、Finder、Notes、Terminal、系统设置和飞书列 observation/window capture/ref action/type/scroll/send 六类能力。不可访问的 Electron 内容明确标记；系统设置保持只读、Terminal 不执行命令。
- 正向：自建窗口深 AX/截帧结果可定位；飞书只读观察须验证实际截图属于指定窗，AX 只见外壳则如实记载；已有基础矩阵逐格引用旧证据版本或新复测版本。
- 负向：缺 App/缺权限/空树/无动作能力不报成功；不为补矩阵打开用户个人文档或发送消息。
- 完成：矩阵每格标明支持、拒绝、未测及原因/证据；至少本轮核心 TextEdit/Finder 真机闭环在当前版本可复测。飞书等未授权/未运行 App 可保留未测，不能声称支持它们。

### FEISHU-001：明确授权后的消息发送验证

状态 draft，P3，依赖 APP-001。仅规划不代表授权发送；移除历史收信人对当前执行的暗示。

- 前置：用户另行明确客户端发送任务、收信人和内容；确认 VCU 在该环境有真实可行的输入/发送路径。
- 实施：通过 VCU + 宿主截图定位正确会话 → 验证标题/收信人 → 输入但不发送 → 核对文本 → 已授权时执行一次发送 → 独立观察消息气泡与会话。不能以 lark-cli 或 osascript 文本 `ok` 替代 VCU 验收。
- 正向：正确会话只出现一次指定内容，截图或独立读取证明可见；输入/发送每步标真实 input_path，不把 AXWebArea 当发送按钮。
- 负向：会话不符、内容不符、权限不足、AX 不可达、发送超时/结果不明时停止并观察；不能自动重发或尝试另一个收信人。没有授权时只做 mock/观察。
- 完成：真实授权条件与证据齐全才可判发送能力通过；若技术不可行只记录阻塞，不能以「观察通过」关闭发送验收。

## 6. 其他已有产品候选（均 draft，不混入本轮验收）

以下承接旧需求文档中的二期方向，列出研究起点，不默认增加本轮产品承诺。

| ID | 范围与实施起点 | 研究/验收退出条件 |
| --- | --- | --- |
| EXTRACT-NEXT | 分页、滚动加载、结构化抓取；先用本地有限分页夹具验证 DOM 提取，再评估是否需要网络层 | 有限数据集行数/去重/分页结束可核对；超时/缺页标不完整；不把 ETH 样本当全站能力，不抓取无授权站点或导出 cookies |
| LINUX-NEXT | 现有源码构建可行性与浏览器链路；先明确发行版/架构和窗口系统 | 干净环境构建+CLI/MCP+自建网页 POC 有记录；无桌面后端时明确不支持，不宣称已有预编译包；打包/发布另行安排 |
| HARNESS-NEXT | 更多宿主接入模板、可选 AWR 桥接；先复用 HOST-001 的标准 CLI/MCP | 一份模板能在隔离配置下完成握手/观察/动作/Abort，卸载模板不动其他配置；不把未测宿主列兼容 |
| COORD-NEXT | 多 Agent 协作与会话借用/归还；先核对现有 coordination 状态机，避免重复做完整框架 | 两个受控客户端不能同时获得冲突 mutation 所有权；超时/断连释放租约，任务可追溯；不引入自动消息发送或后台无限执行 |

VISION-NEXT 另见共享计划：已有视觉宿主无额外模型依赖；新增 provider/真实付费调用另行选择和配置，不在规划阶段发请求。

Firefox、云端浏览器、验证码/风控绕过、cookie 导出注入及微信自动化不列为本轮路线图承诺。旧设计中的空 profile、CDP 默认路径和「待确认桌面立项」仅供历史追溯，当前入口与策略以 PLAN/专项/AGENTS 为准。
