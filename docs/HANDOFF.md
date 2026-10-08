# 会话交接

## 2026-10-08：MAC-001 已测，干净树复跑前不完成（当前入口）

定向测试、扩展测试、mock/安装 POC 和自建 TextEdit 观察已经跑过。预检在脏工作树上 `textedit_observe=pass`，但 `source_identity=warn`，整体 `ok=false`。这不是完成。

- 不要覆盖未提交改动，不要覆盖 `~/.local/bin/vcu-stage`。
- PATH 二进制不是 `target/debug` 或 `target/release`，报告里保持 warn。
- 现有 TextEdit/Notes/Finder POC 保持 untested，不能改绑到这个 SHA。
- 提交后必须在干净工作树复跑 `scripts/poc_mac_001_preflight.py`。只有 JSON `ok=true` 才能写完成、`awr work complete` 和推送完成声明。
- 未完成前不领取 `MAC-002`。领取会话仍是 `01M3KKZTFFQTZ3FF0DWWZHP5QV`，不要结束或窃取。
- 为跑 login-state 临时启动过 debug daemon（pid 8063），随后已 stop。没有改 TCC，没有点 Edge Allow，没有移动系统光标，没有自动化微信。

```sh
rtk git status --short
rtk proxy python3 scripts/poc_mac_001_preflight.py
rtk proxy awr --project . status
```

## 2026-09-28 会话关闭：MAC-001 部分落地，未验收（历史入口）

用户要求停止当前开发并写入交接。`MAC-001` 没有完成，没有 POC 结果，没有测试通过记录，没有提交，没有推送，没有领取 `MAC-002`。

### 工作区

- 目录：`/Users/zhouhan/ai/versatile-computer-use`；分支 `main`。
- HEAD 是 `aa28f36`（`docs: record macOS-first plans and acceptance`），比 `origin/main` 超前 1 个提交。关闭前未 fetch，不能推断远端没有新提交。这个文档提交本身尚未推送。
- **MAC-001 代码和脚本都未提交。** 已跟踪修改：`crates/vcu-core/src/error.rs`、`crates/vcu-core/tests/errors_protocol.rs`、`crates/vcu-server/src/api.rs`、`crates/vcu-server/src/app/macos.rs`、`crates/vcu-server/src/browser/desktop.rs`、`crates/vcu-server/src/doctor.rs`、`crates/vcu-server/src/stage.rs`、`helpers/vcu-stage/main.swift`。未跟踪：`scripts/poc_mac_001_preflight.py`。不要清理或覆盖这些文件。
- 没有 `.local/desktop-cu/mac-MAC-001.json`，也没有 `docs/testing/MACOS_CU_RESULTS.md`。证据文件只能在 POC 实际运行后写入。

### 已写入但未验证的代码

- `ErrorCode::AutomationDenied` 已加入核心错误、协议测试、CLI 退出码和 API 映射。提示针对自动化，不把 `-1743`/`-1744` 写成辅助功能。
- `app/macos.rs` 用 `ps -o lstart=` 识别超时进程；空的或不相符的起始记录不得发信号。缺 Screen Recording 时截图仍返回 `Ok(None)`。截图失败分为 `screenshot_capture_failed` 和 `screenshot_decode_failed`。
- Stage HUD 在 `placeHud`/`orderFront` 后写 `{control}.ready`。进程活着但没有 ready 文件时，不把 250ms 存活当成就绪。`require_hud_for_action` 会拒绝未显示、未就绪、helper 已退出或已中止的非 mock handle。desktop click/type/hover/click_pixels/act 已接这个门禁。
- `doctor.rs` 已补上此前缺失的 `macos_permission_checks`、`host_identity_check`、`daemon_liveness_check`、`version_identity_check`、`git_sha_check`、`read_git_sha`、`pid_alive_kill0`。daemon 存活只用 `kill -0`。doctor 源码不得调用截屏。Git SHA 不可用时是 `untested`，脏工作区是 `warn`，不能假通过。版本比较的是 CLI 与 daemon 的 crate 版本，不把扩展 Bridge `0.2.8` 当成 daemon 版本。
- `scripts/poc_mac_001_preflight.py` 已写好，但**没有运行**。它只在 Automation 和 Accessibility 都成功时观察自建 TextEdit，并且只关闭带标记的临时文档。现有 TextEdit/Notes/Finder POC 不重跑，脚本里记为 `untested`。

### 明确未做

- 没有 `cargo test`、`make check`、扩展测试，也没有编译确认。新增 doctor 函数可能仍有编译或测试错误。
- 没有真机权限探针，没有 TextEdit 观察，没有超时/HUD 的进程级验收输出。权限阻塞不能写成完成。
- 没有 `awr work complete`，没有聚焦提交，没有推送 `aa28f36` 或 MAC-001。
- 没有改 TCC，没有点 Edge Allow，没有移动系统光标，没有自动化微信，没有编辑 `~/.codex/computer-use/`，没有覆盖 `~/.local/bin/vcu-stage`。

### AWR

- 关闭时 `awr status`：100 项，Continue 1，Claimable 0，Waiting 30，Blocked 1。当前项仍是 `MAC-001`，源状态保持 `ready`，证据为空。
- `MAC-001` 的领取会话是 `01M3KKZTFFQTZ3FF0DWWZHP5QV`。不要结束或窃取该会话。另有三条更早的 active 会话：`01M2TR5WWZZSNG58HJEKCAQ99G`、`01M2QWSMF94JZ8A9VZSPY22G1V`、`01M2QVJ3YYJSFGAJFR6DDRNYW0`，也不是本次关闭动作创建的。
- 25 个 planned 与 6 个 draft 仍不可领。`VISION-NEXT` 的 blocked 是 draft 停放，不是新的产品故障。依赖等待不是完成。

### 下次入口

1. 保留工作树。先读本段，再读 `docs/PLAN.md` 和 `docs/PLAN-MACOS.md`。
2. 继续 `MAC-001`，不要领取 `MAC-002`。先编译并跑新增 doctor、超时和 HUD 测试。
3. 测试通过后运行 `scripts/poc_mac_001_preflight.py`。只有脚本实际写出 `.local/desktop-cu/mac-MAC-001.json` 后，才写 `docs/testing/MACOS_CU_RESULTS.md`。
4. TextEdit 观察被权限挡住时，保留阻塞原因，不把 `MAC-001` 标完成，不推送完成声明。
5. 只有验收证据齐全后，才 `awr work complete`、聚焦提交，并推送尚未推送的 `aa28f36` 与 MAC-001 提交。停止前再跑 `rtk proxy awr --project . ready`。

```sh
rtk git status --short
rtk proxy awr --project . status
rtk cargo test -p vcu-server --lib doctor::tests app::macos::tests stage::tests -- --test-threads=8
rtk proxy python3 scripts/poc_mac_001_preflight.py
```

## 2026-09-28 16:49 CST：本轮会话关闭记录（历史入口）

用户要求保存当前信息后关闭会话。本轮完成的是全部主线规划、验收设计和台账统一；未实施任何新产品功能。优先级已经确定为 macOS，下一开发入口为 MAC-001，不需要重新讨论是否优先 macOS。

### 工作区与保存状态

- 目录：`/Users/zhouhan/ai/versatile-computer-use`；分支 `main`。
- 关闭时 HEAD 与本地远端跟踪引用 `origin/main` 都是 `8ac82e24fcee48bb7899bf82476553dce9f0869e`。本轮未 fetch，不能据此推断远端此刻没有新提交。
- **尚未提交、尚未推送。** 工作区有 20 个已跟踪文件修改、4 个未跟踪的新计划文件；均为本轮保留的文档/台账/配置变更，不能清理或覆盖。
- 四个新文件必须保留：`docs/PLAN-MAINLINES.md`、`docs/PLAN-MACOS.md`、`docs/PLAN-BROWSER.md`、`docs/PLAN-RUNTIME-DELIVERY.md`。仅查看 `git diff --stat` 不会包含这些未跟踪文件。
- 已修改的配套文件包括 PLAN/ROADMAP/HANDOFF、文档导航与旧设计定位、Windows 三份专项、浏览器/桌面测试计划及 METHODOLOGY、飞书 playbook、AGENTS、`.awr/intake/GOALS.md` 和 `work-ledger.yaml`、两份 AWR project.toml 及 `.gitignore`。
- AWR 已接入现有 AGENTS.md 规则源；`.awr/mutations/` 是本地配置回执与快照，已忽略，不随产品文档提交。不要提交 AWR 数据库、锁、私有截图或报告。

### 关闭时工作状态

- AWR project revision 为 169；三个源为目标、台账和 AGENTS 规则。台账共 100 项：68 个历史 completed、25 planned、6 draft、1 ready；当前没有 in_progress 工作项，唯一可领取项为 MAC-001。
- 68 个 completed 包含三条 Windows 历史记录索引；本轮没有重验这些功能。未来 32 项均有计划和验收，不能把规划写成完成。
- `awr status` 的 waiting/blocked 包含依赖未完成和 draft 不可领取；它们是当前排期的预期结果，不是新发生的产品故障。
- 本轮没有新建 AWR session 或 claim。`session list` 仍有三条旧 active 记录：`01M2TR5WWZZSNG58HJEKCAQ99G`、`01M2QWSMF94JZ8A9VZSPY22G1V`、`01M2QVJ3YYJSFGAJFR6DDRNYW0`；它们不是本轮会话，未擅自结束或接管。下次不要误称库内所有历史 session 均已关闭。

### 下次执行入口

1. 先读 `AGENTS.md` 和 `docs/PLAN.md`，再读 `docs/PLAN-MAINLINES.md`、`docs/PLAN-MACOS.md`；桌面架构参考 ROADMAP，不能把历史流水当当前排期。
2. 查看并保留现有工作树。开始开发时先准备 MAC-001 上下文，建立自己的 AWR session/claim 后执行；不要领取 MAC-NEXT 总验收或其他未就绪切片。
3. MAC-001 首先核对本机实际构建/daemon/helper 身份、权限、超时和 HUD readiness，建立自建窗口基线；不能沿用旧真机快照。
4. MAC-007 需要 MAC-006 与 BR-004；BR-001…004 从 MAC-001 后推进。BR-005 研究在 MAC-NEXT 后，Windows WIN-101…103 在 QA-001 后。六项 draft 保持候选。

```sh
rtk git status --short
rtk proxy awr --project . status
rtk proxy awr --project . ready
rtk proxy awr --project . context compile --work MAC-001 --goal 'goal#vcu' --budget 5000
```

### 验证与未做事项

规划阶段已通过 YAML/ID/依赖/milestone/计划覆盖、20 份 Markdown 链接/围栏、AWR 重索引/intake/context 和 `git diff --check`。关闭前再次查询 intake：无 source issues/warnings，唯一 executable_work 为 MAC-001。

本轮未运行产品测试、未观察或操作真实 App/浏览器、未核对当前 daemon/扩展运行状态、未生成新 Release、未发送消息或调用模型。没有改产品代码、用户活跃安装、系统光标或 Codex CU 安装。下方为本轮详细记录及更早快照；以此关闭记录和权威计划为接续入口。

## 2026-09-28：全部主线计划与验收补齐（本轮详细记录）

用户追加要求将 macOS AX、浏览器及其他主线全部写成具体计划并包含验收。保留 macOS 优先，本轮只更新规划、台账及导航，不实施功能。

- 总入口 `docs/PLAN.md`；新增 `docs/PLAN-MAINLINES.md`（十条主线、批次、依赖、通用验收、应用/策略与候选）、`docs/PLAN-BROWSER.md`（BR-001…006）、`docs/PLAN-RUNTIME-DELIVERY.md`（公共运行时/宿主/视觉/交付/QA）。
- MAC-001 仍是唯一 ready。MAC-001…006 为桌面基座；BR-001…004 从 MAC-001 后推进，MAC-007 同时依赖 MAC-006 与 BR-004；MAC-008 后 MAC-NEXT 收口。
- BR-005 是 MAC-NEXT 后的跨源 DOM/trusted/TC-B-040 研究，结论不可行可完成研究但不能宣称功能交付；BR-006 不依赖该研究。BROWSER-NEXT 已改 planned 汇总。
- CORE-001、HOST-001、POLICY-001、DELIVERY-001、QA-001 定义公共契约、隔离交付及候选验收；APP-001 负责应用能力矩阵。Windows 追加 WIN-101…103，QA-001 后执行，WIN-NEXT 改 planned。
- 候选为 FEISHU-001、VISION-NEXT、EXTRACT-NEXT、LINUX-NEXT、HARNESS-NEXT、COORD-NEXT，共六项 draft。旧 VISION-001 是历史完成项，保留原证据；新候选使用 VISION-NEXT 避免重用历史 ID。飞书标题移除固定收信人，不代表当前发送授权。
- `testing/METHODOLOGY.md` 已扩展为跨主线验收矩阵；浏览器/桌面用例仍各自验证，mock、历史 POC、研究结论都不能冒充候选版本真机通过。旧设计说明已加历史定位。

台账为 100 个唯一工作项：68 条历史 completed、25 planned、6 draft、1 ready；没有新增功能完成声明。后续只按就绪依赖领取，不能同时抢真机窗口。所有切片定义了正反向结果、独立读回、清理与证据版本要求；拟新增脚本尚未创建。本轮不发 Release、不发送消息、不调用模型、不改用户活跃安装，未提交或推送。

验证已完成：YAML 解析、ID 唯一、依赖无环、milestone 引用、32 个后续项的计划/验收覆盖、20 份修改 Markdown 的相对链接/围栏及 `git diff --check` 均通过。AWR 三个权威源重索引成功，intake 无 source issues/warnings 或非预期组织缺口，ready 仅 MAC-001，MAC-001 context 为 COMPLETE。仅文档/台账改动，未运行产品代码或 GUI 验收。

## 2026-09-28：上一轮 macOS 优先计划与台账统一（历史）

用户明确要求先统一计划和台账，优先开发 macOS，并先写具体执行计划。本轮仅修改计划、台账及导航，没有实施功能、运行真机动作或发布。

- 新执行入口：`docs/PLAN-MACOS.md`，含代码现状、八个切片、依赖、实现落点、正反向验收、报告和回归要求。
- 首项 `MAC-001` 为 ready：权限、实际构建/daemon/helper 身份、超时及 HUD 就绪诊断、本机基线。`MAC-002…008` 为 planned，串行依赖；`MAC-NEXT` 为最后总验收。没有产品切片在本轮被 claim 或标成 in_progress。
- `MAC-NEXT` 的旧发布托管条件已移除，该能力归已完成的 CU-D-700。新主线不再受旧「MAC-NEXT 停放、未点名不开」约束。
- `FEISHU-001`、`BROWSER-NEXT`、`WIN-NEXT` 为 draft 候选，不在本轮功能队列。飞书历史标题不是发送授权。
- Windows 历史索引统一为修复 001…009、视觉记录至 013、会话 001…091；台账补三条历史汇总索引。未重验历史报告，未宣称完整 Windows CU。
- 总计划、路线图、目标、测试计划、AGENTS 与导航均指向新排期。下方全部是历史快照，其「默认不开工」和旧进度不覆盖当前计划。
- AWR 现有源映射补入 AGENTS.md（复用已有规则，不新增规则文件）；配置预览通过后已应用，MAC-001 的 context compile 不再缺 rules source。配置回执留在本地 `.awr/mutations/`，不进入产品提交。

本轮验证：`git diff --check`、YAML 解析、80 个工作项 ID 唯一性与无环依赖、macOS 串行状态/验收、修改文档链接和代码围栏检查均通过。AWR source reindex 成功，ready 仅 MAC-001，intake 无 source issues/warnings、无非预期组织缺口；MAC-001 context 为 COMPLETE。8 项依赖等待与 3 项 draft 不可领取是排期预期。历史 completed 数量为 68（含新增的三条 Windows 记录索引），没有在本轮重验功能证据。仅文档/台账/源映射及本地回执忽略项改动，未运行产品代码测试；尚未提交或推送。

下一次开发从 `MAC-001` 准备上下文并领取，只在其范围内实施。先读 PLAN → PLAN-MACOS → ROADMAP 架构；AWR 源重索引后检查 ready/intake。规划完成不等于 macOS 功能通过，未来报告必须绑定真实受测版本。保留浏览器回归及既有红线。

## 2026-09-28：README 与安装文档历史交接

下面是此前 README 与安装文档整理会话的关闭记录，不是当前排期。

## 这次做了什么

本次只修改文档。产品代码、浏览器扩展和发布资产均未改动。

| 内容 | 结果 |
| --- | --- |
| README | 重写为产品说明，聚焦 VCU 解决的问题、运行结构、浏览器能力、安装、MCP 接入和使用边界 |
| AI 安装 | 新增 `docs/AI-INSTALL.md`，给出平台识别、二进制或源码安装、daemon、扩展、MCP 和最终验收步骤 |
| 安装口径 | 明确预编译 Release 是 macOS arm64 / x64 与 Windows x64；Linux 没有预编译包，只提供需自行验证的源码路径 |
| 文档导航 | `docs/README.md` 和 `docs/AGENT.md` 已指向新的 AI 安装指南 |
| 安装参考 | `docs/INSTALL.md` 移除本机验证记录和硬编码版本现场，修正 Linux Release 描述 |

上述内容提交为 `058f519`（`docs: simplify readme and add AI install guide`），已经推送到 `origin/main`。推送时一并包含此前未推送的交接提交 `5e2bf5a`。

## 产品定位与安装口径

- VCU 是厂商与模型无关的本机 Computer Use 运行时，通过 CLI、daemon 和 MCP 把 AI 宿主连接到用户已登录的 Chrome / Edge。
- 已发布主路径是解压缩浏览器扩展。网页细操作必须诚实返回 `source=extension_dom`；AX / UIA 浏览器外壳不是 HTML DOM。
- 宿主能查看截图时，不需要配置额外视觉模型。
- 安装完成以可执行文件、daemon、`pong=true`、`extension_profile=user` 和 MCP 绝对路径同时成立为准。
- 扩展只加载 `~/.vcu/lens-extension`（Windows 为 `%USERPROFILE%\.vcu\lens-extension`）。不要同时加载包内副本，不开启远程调试，不点击「允许调试」。
- 桌面 Computer Use 仍是受限能力，不是浏览器主路径的替代品。

## 验证与现场

- `git diff --check` 通过。
- README、AI 安装指南、文档索引和接入文档中的相对 Markdown 链接检查通过。
- 修改文件没有尾随空格。
- 没有运行代码测试，因为本次只有 Markdown 文档改动。
- 写入本交接前，`main` 与 `origin/main` 同为 `058f519`，工作区干净。
- 本会话没有重新检查正在运行的 daemon、浏览器扩展或登录态；不要把旧快照当作本次复测结果。

## 下一次接着做时

先读 `docs/PLAN.md`。安装或接入任务再读 `README.md`、`docs/AI-INSTALL.md` 和 `docs/AGENT.md`；Windows 开发再读 `docs/WINDOWS-DEV.md`。本文后面的历史快照只用于追溯，不是当前计划。

README 保持简洁，不写版本流水、提交身份、本机环境或工作台账。AI 安装步骤以 `docs/AI-INSTALL.md` 为入口；安装完成后的操作约束以 `docs/AGENT.md` 为入口。

## 明确没做

- 没有改产品代码、扩展源码或发布工作流。
- 没有创建新的 GitHub Release，也没有上架浏览器扩展。
- 没有操作用户浏览器、系统光标或 `~/.codex/computer-use/`。
- 没有把桌面能力描述成完整产品能力。

## 2026-09-28 上一轮 macOS 快照

下面是身份改名和扩展核对那次的关闭记录，不是当前现场，也不是排期。当时写的「未推送」已过时：`4498331` 与 `dc7b747` 已在 `origin/main`。

## 那次做了什么

把 Windows 已推送的 `main` 同步到这台 Mac，改仓库身份，并确认用户 Edge 已加载同一份扩展。没有改产品代码，没有改写历史，没有推送。

| 点 | 做法 | 提交 |
| --- | --- | --- |
| 检出 | 快进到当时的 `origin/main` `2c0060e` | 已在远端 |
| 登录名 | GitHub 从 `zhouhanker` 改为 `zhouhanx`。`origin` 是 `https://github.com/zhouhanx/versatile-computer-use.git`，SSH 记在 `docs/IDENTITY.md` | `4498331`，本地，未推送 |
| 扩展 | `~/.vcu/lens-extension` 与仓库 `extension/` 23 个文件一致，清单 `0.2.8`。用户已在 Edge 重载 | 无产品提交 |
| Codex 告警 | 从 `~/.codex/config.toml` 删掉三个已被忽略的键 | 不进仓库 |

作者 `zhouhanx <zhouhanker@gmail.com>`。本仓库 `user.name` 是 `zhouhanx`，`user.email` 是 `zhouhanker@gmail.com`。

## 本机复测

关闭前再查：

- `vcu browser ping --json` 返回 `pong=true`，`version=0.2.8`，`os_cursor_used=false`。
- `vcu browser login-state --json` 返回 `extension_profile=user`，`extension_sw_stale=false`，`allow_dialog_visible=false`，`lens_dir=/Users/zhouhan/.vcu/lens-extension`。用户浏览器是 Microsoft Edge。
- 扩展目录与仓库 `extension/` 无差异。

同一会话早先的行为检查：后台打开 `https://example.com`，进入折叠的紫色「VCU」组，没有抢走当时的 GitHub 页。测试标签已关，原有三个标签未动。没有点「允许调试」，没有移动系统光标。

已经打开的旧网页仍是旧内容脚本。细操作前要刷新，否则会报 `content lens is stale`。

## Codex 配置

Codex 报的是一条告警，里面有 3 个被忽略的键，不是两个独立故障。已从 `~/.codex/config.toml` 删除：

- `disable_response_storage`
- `[mcp_servers.computer-use]` 的 `type`
- `[mcp_servers.node_repl]` 的 `type`

两个服务的 `command` 都还在，传输仍由 `command` 决定。`computer-use` 仍是 `enabled = false`，没有启用。没有改 `~/.codex/computer-use/`。现行配置参考没有这三个键，也没有把 `disable_response_storage` 换成 `history.persistence`；后者只控制本地会话记录。新开一个 Codex 会话后，这条告警才会消失。

## 那次留下的下次说明

先读 `docs/PLAN.md`，再读 `docs/AGENT.md`，再读 `docs/WINDOWS-DEV.md`，再读本文。不要把下面的 Windows 快照当成当前现场，也不要当成排期。

身份提交 `4498331` 与交接 `dc7b747` 已随接入文档推送。没有新的要求就不要再 `git push`。不要 claim `MAC-NEXT` 或 `FEISHU-001`。Shell 命令前缀用 `rtk`。

Windows 机器下次仍按 `docs/WINDOWS-DEV.md`。那边的 daemon 和扩展目录与这台 Mac 不是同一份。

## 明确没做

- 没有推送 `4498331`，也没有推送这次交接。
- 没有新的 GitHub Release，没有上架扩展。
- 没有改产品代码，没有 claim `MAC-NEXT` 或 `FEISHU-001`。
- 没有点「允许调试」，没有移动系统光标，没有自动化微信。
- 没有改 `~/.codex/computer-use/`。

## 2026-09-26 Windows 快照

下面是当时 Windows 会话的上下文，不是当前 macOS 现场，也不是排期。

Windows 浏览器相对 macOS 补了两点，都已推到 `origin/main`。

| 点 | 做法 | 提交 |
| --- | --- | --- |
| 前台判断 | `GetForegroundWindow` + 进程映像名。不改焦点，不用 AX，不用 `CGWindowID` | `971a7b7` |
| 扩展重载兜底 | worker 没接住 `reload_self` 时，只把 `chrome-extension://<id>/reload.html` 交给已经在跑的用户浏览器 | `971a7b7` |
| 复测记录 | 见下方 | `858ef22` |

作者 `zhouhanx <zhouhanker@gmail.com>`。远端 `git@github.com:zhouhanx/versatile-computer-use.git`，HTTPS `https://github.com/zhouhanx/versatile-computer-use.git`。本机 GitHub 用户名是 `zhouhanx`（原 `zhouhanker`）。没有改写历史。

流程细则在 `docs/WINDOWS-DEV.md`。扩展继续本地加载，不上 Chrome 网上应用店，也不上 Edge 加载项。README 不写大段边界。

## 本机复测

前台：

- Windows Terminal 在前台时，`login-state` 的 `frontmost_app` 为空。不带 `--tab` 的 `observe` 失败，错误是 `frontmost is not USER Chrome/Edge`。
- Edge 在前台时，`frontmost_app` 是 `Microsoft Edge`，`frontmost_matched=true`，`source=extension_viewport`，`app_id=proc:Microsoft_Edge:16520`。

重载：

- 已连接时 `vcu browser ping --reload` 仍走 `reload_self`。标签数不变，焦点不变。
- 让正在跑的 worker 拒绝 `reload_self` 后，同一条命令返回 `page_reload=true`、`confirmed=true`，随后 `ping` 再次 pong。没有调试同意框，没有残留 reload 标签。
- 直接 `msedge.exe chrome-extension://<id>/reload.html` 也能让扩展重载。标签经常马上消失，因为 `reload.js` 立刻调用 `chrome.runtime.reload()`。这不代表没打开。
- `--app` 和 `--new-window` 会落到 `edge://newtab` 并留下窗口，不要用。摸文件 mtime 不会重载。不要加 `--remote-debugging-port`。浏览器没在跑就不冷启动。

本机 Edge 扩展 id 是 `hmmglhlabkppklocfnnbogpajolnijgl`，目录是 `%USERPROFILE%\.vcu\lens-extension`。测试时临时改过已安装的 `background.js`，已经还原。ping 不再带 probe。

没有测 Chrome。没有点「允许调试」。没有移动系统光标。没有自动化微信。没有改 `~/.codex/computer-use/`。不是 `TC-B-040`。

## 下一次接着做时

先读 `docs/PLAN.md`，再读 `docs/WINDOWS-DEV.md`，再读本文。不要把下面的旧快照当成排期。

本机命令前缀用 `rtk`。工具链是 `cargo +stable-x86_64-pc-windows-gnu`。二进制在 `target/x86_64-pc-windows-gnu/debug/`。daemon 是独立 crate `vcu-daemon`。只编 `vcu-server` 不会换掉正在跑的 `vcu-daemon.exe`。替换时先 `Stop-Process` 停旧进程，再启动：

```powershell
target\x86_64-pc-windows-gnu\debug\vcu-daemon.exe --user-dir C:\Users\liyue\.vcu
```

`vcu daemon stop` 在 Windows 上会去调用不存在的 `kill`，只删 pid 文件，进程还在。用户目录是 `%USERPROFILE%\.vcu`，扩展轮询 `http://127.0.0.1:17890`。

2026-09-26 晚间已经换上含 `confirmed` 字符串的新 daemon。除非要再换二进制，不要无故重启。

macOS 同步：在仓库里 `git pull`，使检出与 `origin/main` 一致。扩展页指向仓库 `extension/` 时，点一次重新加载。指向 `~/.vcu/lens-extension` 时：

```bash
vcu browser install-lens --from ./extension --reload
vcu browser ping --json
```

已经打开的网页不会自动换成新内容脚本，那些页要刷新，否则会报 `content lens is stale`。

## 明确没做

- 登录态地址栏输入仍是 macOS AX，没有搬到 Windows。
- `TC-B-040`、微信、系统光标、Edge Allow、商店上架、新 Release，都不做。
- Windows 上不另开 Chrome 复测，除非改动明确分浏览器。
- `.gitignore` 里未提交的 AWR 本地目录不要放进产品提交。

## 旧快照

下面的行是当天更早的现场记录，不是当前计划。

更新：2026-09-26。新 daemon 复测：worker 拒绝 reload_self 后，`vcu browser ping --reload` 返回 page_reload=true、confirmed=true，随后 ping 再次 pong。没有调试同意框，没有残留 reload 标签。前台是 Windows Terminal 时 observe 失败并要求 --tab；Edge 在前台时 frontmost_matched=true，source=extension_viewport。
更新：2026-09-26。Windows 浏览器补齐：前台判断用 GetForegroundWindow，不改焦点。worker 没接住 reload_self 时，只把 chrome-extension reload.html 交给已在跑的用户 Edge，不加调试端口，也不用 --app/--new-window。本机 Edge 154 复测 probe 字段能随 ping 回来，没有调试同意框。不是 TC-B-040，没有测 Chrome，没有新的 GitHub Release。
更新：2026-09-26。Windows 开发流程见 docs/WINDOWS-DEV.md。扩展继续本地加载，不上 Chrome 网上应用店，也不上 Edge 加载项。README 不再写大段边界。

更新：2026-09-26。打开网页不再抢占用户当前页。`open_tab` 一律新建后台标签，不聚焦窗口，也不改用户正在看的地址。未指定分组时进入折叠的紫色原生标签组「VCU」，同窗口复用，不接管已有用户组。Codex 的做法是浏览器扩展用 `chrome.tabs.group` / `tabGroups.update` 建任务组，例如红色的「Lichess AI practice」，`openTabs` 带回 `tabGroup`；建组在扩展里，不替换用户当前页。本机没有 `~/.codex/computer-use/`，没有改它的安装。Edge 复测：焦点停在 `https://x.com/home`，example.com 进 VCU 组且 active=false，测完已关。

更新：2026-09-26。CU-WIN-SESSION-091 已在本机复测：科学计算器名为「分数」的按钮计算的是阶乘。5 变成显示为 120。路径是 uia_invoke。这不是把小数换成分数。测完切回标准模式，π 按钮消失。没有 SendInput，没有移动系统光标。同一 pid 的 ApplicationFrameHost 仍被拒绝。不是模数，也不是完整科学函数矩阵，也不是完整 Windows 产品 CU。

更新：2026-09-26。CU-WIN-SESSION-090 已在本机复测：科学计算器 8 模 3 是 2。按「八」、「模数」、「三」、「等于」。路径是 uia_invoke，显示为 2。模数按钮之前显示不能已经是 2。测完切回标准模式，π 按钮消失。没有 SendInput，没有移动系统光标。同一 pid 的 ApplicationFrameHost 仍被拒绝。不是除法，也不是 x 的指数，也不是完整科学函数矩阵，也不是完整 Windows 产品 CU。

更新：2026-09-26。CU-WIN-SESSION-089 已在本机复测：科学计算器按 Euler 数字。路径是 uia_invoke，显示以显示为 2.718281828 开头。测完切回标准模式，π 按钮消失。没有 SendInput，没有移动系统光标。同一 pid 的 ApplicationFrameHost 仍被拒绝。不是 π，也不是完整科学函数矩阵，也不是完整 Windows 产品 CU。

更新：2026-09-26。CU-WIN-SESSION-088 已在本机复测：科学计算器按「指数」进入科学计数法。2 变成显示为 2.e+0，再按 3 变成显示为 2.e+3，等于后是显示为 2,000。路径是 uia_invoke。这不是 10 的指数，也不是 x 的指数。测完切回标准模式，π 按钮消失。没有 SendInput，没有移动系统光标。同一 pid 的 ApplicationFrameHost 仍被拒绝。不是完整科学函数矩阵，也不是完整 Windows 产品 CU。

更新：2026-09-26。CU-WIN-SESSION-087 已在本机复测：科学计算器 2 的 3 次方是 8。按「“X”的指数」走 uia_invoke。BM_CLICK 不会让这个按钮进入乘方，所以不再把它报成成功。显示为 8。测完切回标准模式，π 按钮消失。没有 SendInput，没有移动系统光标。同一 pid 的 ApplicationFrameHost 仍被拒绝。不是 10 的指数，也不是完整科学函数矩阵，也不是完整 Windows 产品 CU。

更新：2026-09-26。CU-WIN-SESSION-086 已在本机复测：科学计算器 10 的指数，2 的结果是 100。路径是 uia_invoke。显示为 100。测完切回标准模式，π 按钮消失。没有 SendInput，没有移动系统光标。同一 pid 的 ApplicationFrameHost 仍被拒绝。不是绝对值，也不是完整科学函数矩阵，也不是完整 Windows 产品 CU。

更新：2026-09-26。CU-WIN-SESSION-085 已在本机复测：科学计算器先按正负再按绝对值，5 的负值变回 5。路径是 uia_invoke。测完切回标准模式，π 按钮消失。没有 SendInput，没有移动系统光标。同一 pid 的 ApplicationFrameHost 仍被拒绝。不是倒数，也不是完整科学函数矩阵，也不是完整 Windows 产品 CU。

更新：2026-09-26。CU-WIN-SESSION-084 已在本机复测：科学计算器倒数 4 是 0.25，路径是 uia_invoke。显示为 0.25。测完切回标准模式，π 按钮消失。没有 SendInput，没有移动系统光标。同一 pid 的 ApplicationFrameHost 仍被拒绝。不是平方，也不是完整科学函数矩阵，也不是完整 Windows 产品 CU。

更新：2026-09-26。CU-WIN-SESSION-083 已在本机复测：科学计算器平方 8 是 64，路径是 uia_invoke。显示为 64。测完切回标准模式，π 按钮消失。没有 SendInput，没有移动系统光标。同一 pid 的 ApplicationFrameHost 仍被拒绝。不是完整科学函数矩阵，也不是完整 Windows 产品 CU。

更新：2026-09-26。CU-WIN-SESSION-082 已在本机复测：科学计算器平方根 9 是 3，路径是 uia_invoke。显示为 3。测完切回标准模式，π 按钮消失。没有 SendInput，没有移动系统光标。同一 pid 的 ApplicationFrameHost 仍被拒绝。不是完整科学函数矩阵，也不是完整 Windows 产品 CU。

更新：2026-09-26。CU-WIN-SESSION-081 已在本机复测：会话右键打开自建上下文菜单并点中指定条目，路径是 context_item。标签变成 VCU-CTX-HIT。只打开菜单不算成功。左键不会点中条目。缺失条目被拒绝。再次点已完成的条目被拒绝。弹出层不认投递坐标，条目用 accDoDefaultAction 激活。没有 SendInput，没有移动系统光标。不是 context_pixel，也不是 menu_pixel，也不是完整 Windows 产品 CU。

更新：2026-09-26。CU-WIN-SESSION-080 已在本机复测：会话右键自建按钮打开上下文菜单，路径是 context_pixel。左键仍是 button_pixel，不会打开菜单。再次右键已打开的菜单被拒绝。缺失目标被拒绝。没有 SendInput，没有移动系统光标。不是 menu_pixel，也不是完整 Windows 产品 CU。

更新：2026-09-26。CU-WIN-SESSION-079 已在本机复测：会话双击自建列表视图的一行，路径是 lvrow_dblclick。标签先变成 VCU-LVD-HIT，再双击已选中行变成 VCU-LVD-HIT2。屏幕外的一行先滚进视图再双击。只发一次 WM_LBUTTONDBLCLK 不会触发托管事件，所以辅助进程连发两次点击再补 DBLCLK。单击仍是 lvrow_pixel，不会改双击标签。没有 SendInput，没有移动系统光标。不是 LVM_SETITEMSTATE，也不是完整 Windows 产品 CU。

更新：2026-09-26。CU-WIN-SESSION-078 已在本机复测：会话双击自建列表框的一行，路径是 list_dblclick。标签先变成 VCU-DBL-HIT，再双击已选中行变成 VCU-DBL-HIT2。屏幕外的一行也能双击。缺失行被拒绝。单击仍是 list_pixel，不会改双击标签。没有 SendInput，没有移动系统光标。不是 LB_SETCURSEL，也不是完整 Windows 产品 CU。

更新：2026-09-26。CU-D-610 已在本机复测：滚动后旧截图 dry-run 被拒绝，错误含 stale_viewport。重新 observe --tab 后新截图 dry-run 成功，source=extension_dom。输入 vcu-d-610，scroll y=900，tab_id_source=last_observe，tab 1013794813。只开 127.0.0.1 抛页并关闭该标签。没有放宽 scroll_y 校验，没有 SendInput，没有测 Chrome，没有点 Allow。不是完整 Windows 产品 CU。

更新：2026-09-26。Windows Stage 把淡阴影画进预乘文字层。红底上胶囊四角仍是红底，胶囊下方 4 到 10 像素略暗，18 像素外恢复红底。不是直角黑底，也不是 macOS 系统材质，也不是完整 Windows 产品 CU。

更新：2026-09-26。再查 GitHub：当时 Contributors API 只有旧登录名 zhouhanker，282 次贡献。仓库页和 graphs/contributors 没有单独的 zhouhan。仓库历史作者字符串仍是 zhouhanker <zhouhanker@gmail.com>。没有改写历史。当前登录名是 zhouhanx。旧网页图若还显示旧名字，那是缓存，不是当前作者。

更新：2026-09-26。CU-WIN-SESSION-077 已在本机复测：会话先点自建时间框的秒字段，再点下箭头，路径是 time_second_down_pixel。标签变成 VCU-TIME-08:00:00。同一时刻、非法时间和一次点击跨分钟被拒绝。点击本身没有移动系统光标。不是 time_second_pixel，也不是 DTM_SETSYSTEMTIME，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-076 已在本机复测：会话先点自建时间框的分钟字段，再点下箭头，路径是 time_minute_down_pixel。标签变成 VCU-TIME-08:00:00。同一时刻、非法时间和一次点击跨小时被拒绝。点击本身没有移动系统光标。不是 time_down_pixel，也不是 DTM_SETSYSTEMTIME，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-075 已在本机复测：会话先点自建时间框的秒字段，再点上箭头，路径是 time_second_pixel。标签变成 VCU-TIME-08:00:01。同一时刻、非法时间和一次点击跨两秒被拒绝。点击本身没有移动系统光标。不是 time_minute_pixel，也不是 DTM_SETSYSTEMTIME，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-074 已在本机复测：会话先点自建时间框的分钟字段，再点上箭头，路径是 time_minute_pixel。标签变成 VCU-TIME-08:01:00。同一时刻、非法时间和一次点击跨两分钟被拒绝。点击本身没有移动系统光标。不是 time_pixel，也不是 DTM_SETSYSTEMTIME，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-073 已在本机复测：会话点自建时间框的下箭头，路径是 time_down_pixel。标签变成 VCU-TIME-07:00:00。同一时刻、非法时间和一次点击跨两小时被拒绝。没有移动系统光标。不是 time_pixel，也不是 time_set，也不是 DTM_SETSYSTEMTIME，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-072 已在本机复测：会话点自建时间框的上箭头，路径是 time_pixel。标签变成 VCU-TIME-09:00:00。同一时刻、非法时间和一次点击跨两小时被拒绝。没有移动系统光标。不是 time_set，也不是 DTM_SETSYSTEMTIME，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。Windows Stage 胶囊后面的直角黑底是 Acrylic accent，它不裁圆角。已改成按胶囊区域做系统模糊，文字层只留描边和白字。不是 macOS 系统材质，也不是完整 Windows 产品 CU。

更新：2026-09-26。Windows Stage 的淡阴影改画在文字层里，不再单独开阴影窗。本机截图胶囊仍是圆角，后面没有纯黑长方形。不是 macOS 系统材质，也不是完整 Windows 产品 CU。

更新：2026-09-26。CU-WIN-SESSION-071 已在本机复测：会话点自建日期框的下拉箭头，再连点三次下个月按钮，然后点 15 日，路径是 month3_pixel。标签变成 VCU-DTP-2026-04-15。前两次点击后目标日期还不可见。同一天、非法日期和只跨两个月被拒绝。没有移动系统光标。不是 date_set，也不是 DTM_SETSYSTEMTIME，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-070 已在本机复测：会话点自建日期框的下拉箭头，再连点两次下个月按钮，然后点 15 日，路径是 month2_pixel。标签变成 VCU-DTP-2026-03-15。第一次点击后目标日期还不可见。同一天、非法日期和只跨一个月被拒绝。没有移动系统光标。不是 date_set，也不是 DTM_SETSYSTEMTIME，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-069 已在本机复测：会话点自建日期框的下拉箭头，再点下个月按钮，然后点 15 日，路径是 month_pixel。标签变成 VCU-DTP-2026-02-15。同一天、非法日期、同月和跨两个月被拒绝。没有移动系统光标。不是 date_set，也不是 DTM_SETSYSTEMTIME，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-068 已在本机复测：会话点自建日期框的下拉箭头，再点当月可见的 20 日，路径是 date_pixel。标签变成 VCU-DTP-2026-01-20。同一天、非法日期和别的月份被拒绝。没有移动系统光标。不是 date_set，也不是 DTM_SETSYSTEMTIME，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。Windows Stage 胶囊后面的纯黑长方形是阴影窗。分层内容没有盖住整窗，露出的客户区是黑的。不再显示这层阴影窗。胶囊还在。不是完整 Windows 产品 CU。

更新：2026-09-26。CU-WIN-SESSION-067 已在本机复测：会话点自建列表视图一行 VCU-LV-B 的文字中心，路径是 lvrow_pixel。标签变成 VCU-LV-PICKED-B。已选中的行和不存在的行被拒绝。没有移动系统光标。不是 listview_select，也不是 LVM_SETITEMSTATE，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。当时 GitHub Contributors API 仍只有旧登录名 zhouhanker（267）。仓库历史作者字符串是 zhouhanker <zhouhanker@gmail.com>。stats/contributors 这次返回空缓存。不改写历史。当前登录名是 zhouhanx。网页图如果还显示 zhouhan，那是 GitHub 图缓存，不是当前提交作者。

更新：2026-09-26。CU-WIN-SESSION-066 已在本机复测：会话点已勾选的自建列表视图 VCU-LV-B 的复选框，路径是 lvuncheck_pixel。标签变成 VCU-LV-OFF-B。未勾选的行和不存在的行被拒绝。没有移动系统光标。不是 listview_uncheck，也不是 LVM_SETITEMSTATE，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-065 已在本机复测：会话点自建列表视图 VCU-LV-B 的复选框，路径是 lvcheck_pixel。标签变成 VCU-LV-ON-B。已勾选的行和不存在的行被拒绝。没有移动系统光标。不是 listview_check，也不是 LVM_SETITEMSTATE，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-064 已在本机复测：会话点自建按钮 VCU-CLICK-022 的客户区中心，路径是 button_pixel。标签变成 VCU-CLICKED-022。标签已经是这个文本、以及不存在的按钮被拒绝。没有移动系统光标。不是 bm_click，也不是完整 Windows 产品 CU。列表视图复选框的像素点击从 daemon 脚本里没有勾上，没有写成成功。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-063 已在本机复测：会话点自建单选按钮 VCU-RADIO-B 的客户区中心，路径是 radio_pixel。B 变成选中，A 被清掉，标签变成 VCU-RADIO-SHOW-B。已选中的按钮和不存在的按钮被拒绝。没有移动系统光标。不是 bm_click，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-062 已在本机复测：会话点已勾选的自建勾选列表 VCU-CHK-B 的复选框，路径是 uncheck_pixel。标签变成 VCU-CHK-OFF-B。未勾选的行和不存在的行被拒绝。没有移动系统光标。不是 uncheck_set，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-061 已在本机复测：会话点自建勾选列表 VCU-CHK-B 的复选框，路径是 check_pixel。标签变成 VCU-CHK-ON-B。已勾选的行和不存在的行被拒绝。没有移动系统光标。不是 check_set，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。当时 GitHub Contributors API 和 stats/contributors 只有旧登录名 zhouhanker。仓库历史和提交搜索里没有独立的 zhouhan。不改写历史。当前登录名是 zhouhanx。网页图如果还显示旧名字，那是 GitHub 图缓存，不是当前提交作者。

更新：2026-09-26。CU-WIN-SESSION-060 已在本机复测：没有重定向位图的自建窗口让 PrintWindow 变成空白，中心被挡住后会话截图拒绝复制屏幕。路径是 OCCLUDED。没有移动系统光标。052 的有像素窗口仍走窗口像素，不是这次拒绝。不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-059 已在本机复测：会话点自建树节点 VCU-TREE-B 的文字，路径是 tree_pixel。标签变成 VCU-TREE-SHOW-B。已选中的节点和不存在的节点被拒绝。没有移动系统光标。不是 tree_select，也不是 TVM_SELECTITEM，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-058 已在本机复测：会话点自建列表框的一行 VCU-LIST-B，路径是 list_pixel。标签变成 VCU-LIST-HIT。滚出视口的 VCU-LIST-FAR 也会点中。已选中的行和不存在的行被拒绝。没有移动系统光标。不是 list_select，也不是 LB_SETCURSEL，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-057 已在本机复测：会话点自建标签页 VCU-TAB-B 的标题，路径是 tab_pixel。标签变成 VCU-TAB-SHOW-B。已选中的页和不存在的页被拒绝。没有移动系统光标。不是 tab_select，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-056 已在本机复测：会话把自建滑块从 10 拖到 40，路径是 track_drag。标签变成 VCU-TRACK-40。同一位置、超出范围和非整数被拒绝。没有移动系统光标。不是 TBM_SETPOS，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-055 已在本机复测：会话先打开自建菜单，再点弹出层里的 VCU-MENU-B，路径是 menu_pixel。上面还有 VCU-MENU-A，标签变成 VCU-MENU-HIT，说明没有点错行。不存在的项被拒绝。没有移动系统光标。不是 accDoDefaultAction，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-054 已在本机复测：会话点已展开的自建树节点 VCU-COL-A 的折叠图标，路径是 fold_icon。标签变成 VCU-COL-CLOSED。已折叠的节点和不存在的节点被拒绝。没有移动系统光标。不是 tree_collapse，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-053 已在本机复测：会话点自建树节点 VCU-EXP-A 的展开图标，路径是 tree_icon。标签变成 VCU-EXP-OPEN。已展开的节点和不存在的节点被拒绝。没有移动系统光标。不是 TVM_EXPAND，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-052 已在本机复测：绿色置顶窗盖住品红窗口中心后，会话截图中心仍是窗口颜色，不是挡板。路径是 window-pixels。PrintWindow 空白且中心属于别的窗口时会拒绝复制屏幕；这一轮没有走到拒绝分支。没有移动系统光标。不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-051 已在本机复测：两个同名菜单项 VCU-SAME 都在场景里。点击第二个编号走 menu_nth，标签变成 VCU-SAME-2。点击第一个编号仍走 menu_click，标签变成 VCU-SAME-1。没有移动系统光标。不是 UIA 原生子项，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-050 已在本机复测：会话先展开自建下拉层，再点选 VCU-COMBO-B，路径是 combo_drop。标签变成 VCU-DROP-VCU-COMBO-B。已选中的项和不存在的项被拒绝。没有移动系统光标。不是 CB_SETCURSEL，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-049 已在本机复测：会话按自建数字框上箭头从 10 加到 11，路径是 spin_up。到顶再向上被拒绝。向下回到 10，路径是 spin_down。错误方向被拒绝。没有移动系统光标。不是直接写数值，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-048 已在本机复测：会话把自建数字框从 10.25 设成 12.5，路径是 decimal_set。标签变成 VCU-DEC-12.5。同一数值、超出范围、非小数和没有小数点的文本被拒绝。没有移动系统光标。不是点箭头，也不是 number_set，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-047 已在本机复测：会话把自建时间从 08:00:00 设成 15:30:45，路径是 time_set。标签变成 VCU-TIME-15:30:45。同一时刻、非法时间和非时间文本被拒绝。没有移动系统光标。不是点箭头，也不是 date_set，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-046 已在本机复测：会话按名字取消勾选自建列表视图的 VCU-LV-B，路径是 listview_uncheck。标签变成 VCU-LV-OFF-B。已取消的行和不存在的行被拒绝。没有移动系统光标。不是点复选框像素，也不是 listview_check，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-045 已在本机复测：会话场景里能看到自建菜单项 VCU-SCENE-B，`wait --name` 返回 ref=e5。点击这个 ref 走 menu_click，标签变成 VCU-SCENE-HIT。不存在的名字不会被编进场景。没有移动系统光标。这不是 UIA 原生子项，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-044 已在本机复测：会话按名字点击自建菜单项 VCU-MENU-B，路径是 menu_click。标签变成 VCU-MENU-HIT。不存在的项被拒绝。没有移动系统光标。菜单项仍不在 UIA 场景树里。不是点菜单像素，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-043 已在本机复测：会话点击自建链接 VCU-LINK-B，路径是 link_click。标签变成 VCU-LINK-HIT。普通静态标签不再被 BM_CLICK 假报成功。按钮点击仍是 bm_click。没有移动系统光标。不是点链接像素，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-042 已在本机复测：会话按名字勾选自建列表视图的 VCU-LV-B，路径是 listview_check。标签变成 VCU-LV-ON-B。已勾选的行和不存在的行被拒绝。没有移动系统光标。不是点复选框像素，也不是 listview_select，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-041 已在本机复测：会话把自建数字框从 10 设成 40，路径是 number_set。标签变成 VCU-NUM-40。同一数字、超出范围和非整数被拒绝。没有移动系统光标。只改编辑框文字而没有 ValueChanged 不算成功。不是普通文本框，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-040 已在本机复测：会话把自建日期从 2026-01-02 设成 2026-03-15，路径是 date_set。标签变成 VCU-DTP-2026-03-15。同一天、非法日期和非日期文本被拒绝。没有移动系统光标。只改原生日期而没有 ValueChanged 不算成功。不是点日历像素，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-039 已在本机复测：会话按名字取消自建勾选列表的 VCU-CHK-B，路径是 uncheck_set。标签变成 VCU-CHK-OFF-B。不存在的行被拒绝。没有移动系统光标。不是点复选框像素，也不是 check_set，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-038 已在本机复测：会话按名字勾选自建勾选列表的 VCU-CHK-B，路径是 check_set。标签变成 VCU-CHK-ON-B。不存在的行被拒绝。没有移动系统光标。不是点复选框像素，也不是 list_select，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-037 已在本机复测：会话按名字折叠已展开的自建树节点 VCU-COL-A，路径是 tree_collapse。标签变成 VCU-COL-CLOSED。不存在的节点被拒绝。没有移动系统光标。只发 TVE_COLLAPSE 不会跑 AfterCollapse，成功路径在展开位清掉后反射 TVN_ITEMEXPANDEDW。不是点折叠图标，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。Edge 自建页复测通过：`scripts/poc_win_edge_dom.py` 输出 `EDGE-DOM OK edge tab closed hit=0->1 typed=vcu-edge-dom source=extension_dom`。没有测 Chrome，没有改已有标签，没有点允许调试。

更新：2026-09-26。CU-WIN-SESSION-036 已在本机复测：会话按名字展开自建树节点 VCU-EXP-A，路径是 tree_expand。标签变成 VCU-EXP-OPEN。不存在的节点被拒绝。没有移动系统光标。不是点展开图标，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-035 已在本机复测：会话把自建进度条的原生位置从 10 设成 40，路径是 progress_set。超出读回和非整数被拒绝。没有移动系统光标。不是托管 Value，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-034 已在本机复测：会话按名字把自建列表视图从 VCU-LV-A 选成 VCU-LV-B，路径是 listview_select。不存在的行被拒绝。没有移动系统光标。不是点行像素，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-033 已在本机复测：会话按名字把自建树从 VCU-TREE-A 选成子节点 VCU-TREE-B，路径是 tree_select。不存在的节点被拒绝。没有移动系统光标。不是点节点像素，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-032 已在本机复测：会话按名字把自建标签从 VCU-TAB-A 选成 VCU-TAB-B，路径是 tab_select。不存在的标签被拒绝。没有移动系统光标。不是点标签像素，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-031 已在本机复测：会话把自建滑块从 10 设成 40，路径是 track_select。超出范围和非整数被拒绝。没有移动系统光标。不是 RangeValuePattern，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。Release `v0.2.8` 上的 `vcu-lens-extension.zip` 已随 `lens-asset` run `36199818913` 更新。本机下载 41527 字节，里面的 `content.js` 含 `data-vcu-fog` 和 72px 雾盒。不是新的产品 Release。

更新：2026-09-26。WIN-VIS-012 已在本机 Edge 复测：共享网页指针的雾心是箭尖 + (6, 6)，半径 36，和 macOS 短箭同一点。点击使 #hit 从 0 变成 1，source=extension_dom。没有移动系统光标。详见 docs/PLAN-WINDOWS-VISUAL.md。

更新：2026-09-26。`vcu-lens-extension.zip` 已挂到 Release `v0.2.8`。工作流 `lens-asset` run `36199325828` 成功。本机下载 41483 字节，15 个文件，`manifest.json` 版本 0.2.8。`install-lens.ps1 -FromRelease` 装到临时目录回执 `LENS_FROM zip`。没有点允许调试，没有新的产品 Release。

更新：2026-09-26。扩展安装包改为挂到当前 Latest Release，不新开版本。本机没有 GitHub token，上传由 `.github/workflows/lens-asset.yml` 完成。在该工作流把 `vcu-lens-extension.zip` 传上之前，不能把下载地址写成已经可用。

更新：2026-09-26。WIN-VIS-011 已在本机复测：Windows 胶囊按 macOS 把强调色圆点、半粗标题和常规字重的 Esc 取消排成一组，宽度限制在 220 到 320。不是两端拆开。没有移动系统光标。不是 NSVisualEffectView。详见 docs/PLAN-WINDOWS-VISUAL.md。

更新：2026-09-26。CU-WIN-SESSION-030 已在本机复测：会话把自建列表框从 VCU-LIST-A 选成 VCU-LIST-B，路径是 list_select。不存在的行被拒绝。没有移动系统光标。不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-029 已在本机复测：会话把自建下拉列表从 VCU-COMBO-A 选成 VCU-COMBO-B，路径是 combo_select。不存在的条目被拒绝。没有移动系统光标。不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-028 已在本机复测：会话点击把单选按钮 B 设为选中，A 同时变成未选中。路径是 bm_click。没有移动系统光标。不是 TogglePattern，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-027 已在本机复测：会话点击把自建复选框从 toggle-off 翻到 toggle-on，再翻回去。路径是 bm_click。普通按钮没有被标成复选框。没有移动系统光标。不是 TogglePattern，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-026 已在本机复测：会话按角色等待命中自建按钮，角色是 ControlType.Pane。用 ControlType.Window 不会误命中。没有移动系统光标。不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-024 已在本机复测：会话提取读到自建文本框 VCU-EXTRACT-024，source=desktop.scene。不存在的选择器是空列表。没有移动系统光标。不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-023 已在本机复测：窗口和按钮同名时 wait 返回按钮 e2，点击后标签变成 VCU-SAME-CLICKED。没有移动系统光标。不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-022 已在本机复测：会话点击自建按钮后标签变成 VCU-CLICKED-022，路径是 bm_click。没有移动系统光标。不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-021 已在本机复测：会话向自建文本框写入 VCU-TYPED-021，路径是 wm_settext，随后按新值等到。没有移动系统光标。不是 ValuePattern，也不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-020 已在本机复测：会话等待按文本框的值找到 VCU-VAL-020，缺失值诚实超时。没有移动系统光标。不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-019 已在本机复测：会话等待找到自建按钮 VCU-WAIT-019，缺失名字诚实超时。没有移动系统光标。不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-018 已在本机复测：会话截图自建品红窗口，中心像素是 220,30,160，不是黑图。PrintWindow 空白时只复制窗口矩形。不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。WIN-VIS-010 已在本机复测：Acrylic 胶囊加上半粗标题、1px 描边和轻阴影。描边亮于中心，阴影暗于下方背景。不是 macOS NSVisualEffectView。详见 docs/PLAN-WINDOWS-VISUAL.md。

更新：2026-09-26。WIN-VIS-009 已在本机复测：Windows 11 胶囊使用系统 Acrylic，背后从绿变红后 220ms 内跟着变，白字仍可读。不是 macOS NSVisualEffectView。详见 docs/PLAN-WINDOWS-VISUAL.md。

更新：2026-09-26。Windows 扩展安装可以不克隆仓库：`irm` 原始 `install-lens.ps1` 后 `iex`。当前 Release 没有独立 zip，脚本会退回已有的 Windows 压缩包。没有点允许调试，也没有新的 GitHub Release。

更新：2026-09-26。本机 Edge 复测通过：只打开自建 127.0.0.1 页，extract/click/type 的 source 是 extension_dom，点击使 #hit 从 0 变为 1，输入读回 vcu-edge-dom，只关闭这个新标签。已有标签未改。没有测 Chrome，没有点允许调试，没有移动系统光标。详见 scripts/poc_win_edge_dom.py。

更新：2026-09-26。CU-WIN-SESSION-017 已在本机复测：科学模式 sin(π) 角度显示约 0.0548，弧度显示为 0，并切回标准模式。不是完整科学计算器。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-016 已在本机复测：科学模式 tan(45°) 显示「显示为 1」，并切回标准模式。不是完整科学计算器。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-015 已在本机复测：科学模式 cos(0) 显示「显示为 1」，并切回标准模式。不是完整科学计算器。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-014 已在本机复测：科学模式 sin(30°) 显示「显示为 0.5」，三角学菜单用 toggle 展开，并切回标准模式。不是完整科学计算器。

更新：2026-09-26。CU-WIN-SESSION-013 已在本机复测：科学模式 ln(e) 显示「显示为 1」，并切回标准模式。不是完整科学计算器。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-012 已在本机复测：科学模式 log10(100) 显示「显示为 2」，并切回标准模式。不是完整科学计算器。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-011 已在本机复测：科学模式输入 π，显示为 3.1415926535897932384626433832795，并切回标准模式。列表项点击是 selection_item。不是完整科学计算器。

更新：2026-09-26。CU-WIN-SESSION-010 已在本机复测：清除全部记忆后调用，显示仍是「显示为 0」，不是之前存的 5。不是完整计算器产品。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-009 已在本机复测：记忆里 5 减 2，调用后显示「显示为 3」。不是完整计算器产品。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-008 已在本机复测：记忆里 2 加 3，调用后显示「显示为 5」。不是完整计算器产品。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-007 已在本机复测：记忆存储 5，清除后调用，显示回到「显示为 5」。不是完整计算器产品。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-006 已在本机复测：会话计算 12+7，显示变成「显示为 19」。当时 GitHub Contributors API 只列出旧登录名 zhouhanker（198），没有 zhouhan；当前登录名是 zhouhanx。Insights 若仍显示旧名，那是图缓存，没有改历史。不是完整 Windows 产品 CU。

更新：2026-09-26。CU-WIN-SESSION-005 已在本机复测：会话滚动把自建列表从 `top=0` 滚到 `top=8`，系统光标仍是 `1187,239`。不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。CU-WIN-SESSION-004 已在本机复测：会话悬停把 Guide 放到自建按钮上，`dart=78`，系统光标仍是 `1187,239`。不是完整 Windows 产品 CU。详见 docs/PLAN-EPIC-WIN-SESSION.md。

更新：2026-09-26。WIN-VIS-008 已在本机复测：正后方从蓝变绿后胶囊从 `14,49,125` 变成 `14,121,36`，下方仍是蓝，说明没有只采下方。不是 macOS 系统材质。详见 docs/PLAN-WINDOWS-VISUAL.md。

更新：2026-09-26。WIN-VIS-007 已在本机复测：胶囊模糊从 `119,16,99` 跟着背后变成 `14,121,38`，没有重启 Stage。不是 macOS 系统材质。详见 docs/PLAN-WINDOWS-VISUAL.md。

更新：2026-09-26。WIN-VIS-006 已在本机复测：HUD 采样桌面模糊后像素 `125,26,105`，不是不透明海军蓝，也不是 macOS `NSVisualEffectView`。详见 docs/PLAN-WINDOWS-VISUAL.md。

更新：2026-09-26。WIN-FIX-009 已在本机复测并准备提交：`scripts/poc_win_session_own_edit.ps1` 对自建 WinForms 编辑框写入成功，`input_path=wm_settext`，独立 WM_GETTEXT 读回标记，没有剪贴板假成功，没有移动系统光标。不是完整 Windows 产品 CU。详见 docs/PLAN-WINDOWS-FIX.md。

# VCU 会话交接

更新：2026-09-26。WIN-FIX-001 至 006 已提交并在本机复测。WIN-FIX-007 已复测：中文 Windows 上的 POC 不再因 GBK UnicodeDecodeError 退出。CU-D-590 与 CU-D-620 通过。CU-D-610 的 DOM 输入和滚动成功，但截图 dry-run 仍失败，不写成整项通过。计算器宿主仍未放行。没有新的 GitHub Release。详见 docs/PLAN-WINDOWS-FIX.md。 WIN-VIS-001：Windows Stage 改为 280x28 胶囊和圆形短箭，实机可见；不是完整产品 CU，也没有 DPI 逐像素对齐。详见 docs/PLAN-WINDOWS-VISUAL.md。


更新：2026-09-25。HEAD `e5d47df`，`main` 与 `origin/main` 同步，工作区在写入本交接前是干净的。上一轮功能收尾是 2026-09-20 的 CU-D-680/690/700（当时 HEAD `b627506`，交接提交 `5a3ae97`）。

## 当前进度

- 已发布产品是浏览器 Bridge **0.2.8**。crate 仍打印 `0.1.0`，不代表没更新。
- 桌面切片 `CU-D-010`…`CU-D-700` 已关闭。不是完整 Codex CU，也不是完整 Windows 产品 CU。
- 台账无进行中切片。可领取只剩停放的 `MAC-NEXT`、`FEISHU-001`。未点名不开。
- CI 已恢复：Actions run `36129175359`（代码 `9c69b8c`）五件 job 全绿。文档记录提交是 `e5d47df`。

## 下一步大纲（未开工）

默认停在收口，不新开史诗。用户点名后只开一条：

1. 守门：CI 或真机回归坏了再修。
2. 浏览器诚实缺口：跨源 iframe / trusted 手势 / `TC-B-040`。
3. Windows 产品会话：现有 Windows 切片不是 `vcu session` 产品路径。
4. `MAC-NEXT`：深 AX，先过 Accessibility 门禁。
5. `FEISHU-001`：点名收信人之后才谈发送。

红线：不搬系统光标，不代点 Edge Allow，不自动化微信，不改 `~/.codex/computer-use/`，不动标签组 1/3。网页细操作必须 `source=extension_dom`。

## 本轮（收口 + CI 门禁）

- 不新开停放史诗。`MAC-NEXT` / `FEISHU-001` 仍不 claim。
- 对齐覆盖边界：`README.md` 增加「边界」；`GOALS.md` 从 0.2.5 改到已发布 0.2.8；测试计划第 8 节去掉已通过的 TC-D-690/700「未过不得宣称」。
- CI 失败根因不是产品回归。`observe_failure` 的假 daemon 只等 5 秒，且非阻塞读把 `WouldBlock` 当失败；Windows 上 `vcu` 还因 1MB 主线程栈溢出（`0xC00000FD`）在连上 mock 前退出。随后 `self_update_failure` 在 windows-latest 上调用了 WSL stub `bash`，没有跑 `install.ps1`。
- 修复：假 daemon 活到 CLI 退出；CLI 入口改到 8MB 栈，Windows 二进制 `/STACK:8388608`；Windows `self update` 走 `install.ps1`，安装器 UTF-16 输出可解码。本地 POC：`observe_failure` 连续 21 次，以及 `cargo test -p vcu-cli --tests --bin vcu`。
- 门禁已恢复：Actions run `36129175359`（`9c69b8c`）五件 job 全绿，含 `test (windows-latest)`、`test (macos-latest)`、`package-windows`、`package-macos`。

## 2026-09-20 收尾

HEAD `b627506`（main 已推送）。上一轮结尾为 `7a7a7c8`（CU-D-670）。

## 本轮完成（CU-D-680 → CU-D-690 → CU-D-700，全部提交并推送）

- **CU-D-680 `group-update --browser`（真机通过）**：`scripts/poc_cu_d_680.py` → `CU-D-680 OK`，报告 `.local/desktop-cu/cu-d-680.json`。覆盖：合并列表带 `browser` 标记；`--browser chrome|edge` 只改对应组（title/color/collapsed），另一浏览器组不动；id 唯一时无 `--browser` 正确解析；另一浏览器真实 id + 错 `--browser`、以及未知 id 都是诚实失败且不误改；组清理干净、组 1/3 未动。撞号分支由 `cargo test -p vcu-server --test app_http`（`upd_amb`）覆盖（真机构造不出同号 `group_id`）。提交 `03db63b`、`1ad02ca`、`84e48ec`。
- **CU-D-690 extension DOM 原生 `<select>`（真机通过）**：`type --selector` 接受 `<select>`，按 option 的 value 或可见文本匹配，设置后派发 `input`+`change`，回执 `input_path=dom_select`；匹配不到报 `select option not found` 且不改值；文本输入仍是 `dom_type`。单测 46 项（`extension/tests/content.test.cjs`）；真机 `scripts/poc_cu_d_690.py` → `CU-D-690 OK`。真机验收：用 VCU 在 GitHub Support 工单页选中「Type of Issue」并**成功提交**（页面回执「您的信息已成功提交」，证据 `.local/desktop-cu/cu-d-690-github-ticket.png`）。提交 `ee66ae7`、`1af8764`。
- **CU-D-700 Release 托管 + `vcu self update`（完成）**：发布 GitHub Release `v0.2.8`（Latest，16 资产）。`curl -fsSL .../releases/latest/download/install.sh | sh` 装到临时前缀成功；不带 `VCU_BASE_URL` 的 `vcu self update` → `updated: true`，装出的 vcu/vcu-daemon/vcu-mcp 与 Release 包 sha256 完全一致。失败路径输出 installer stderr + 本地 `file://` 提示（单测 `crates/vcu-cli/tests/self_update_failure.rs`，并用真机 404 复现）。提交 `98737ca`、`f9a94c7`。
- **顺手清理 / 修复**：删除被 git 跟踪的残留 `extension/background.js.bak`（`fdd76f9`）；修发布管线两个缺陷——0 字节 `dist/.gitkeep` 被当资产导致 publish job 失败（改显式资产列表）、Windows checkout 的 CRLF `install.sh` 覆盖 LF 导致 `curl | sh` 报 `set: pipefail: invalid option name`（`.gitattributes` + publish 步骤 `tr` 归一化）；提交 `c0c49dd`，并用临时 tag 端到端验证（run `35511683467` 绿：14 资产、无 0 字节、install.sh 为 LF），验证后删除该 tag，记录于 `b627506`。

## 门禁与证据

- `cargo test --workspace` 全绿；`node --test extension/tests/*.test.cjs` **46** 通过；`make check` **0**（mock 流程 / 额外动作 / 打包 / curl 安装 POC）。
- 真机 POC：`scripts/poc_cu_d_680.py`、`scripts/poc_cu_d_690.py`（报告 `.local/desktop-cu/`）。
- 发布冒烟：`curl | sh` 临时前缀安装 + `vcu self update` 二进制 sha256 对照（对照对象是线上 Release 资产）。

## 本机环境状态

- `~/.local/bin` 的 `vcu` / `vcu-daemon` / `vcu-mcp` 是 **Release v0.2.8 包内二进制**（sha256 与 release tarball 逐字节一致），`vcu-stage` 也在。
- `vcu --version` 仍打印 crate 版本 `0.1.0`（浏览器桥版本为 0.2.8）——版本号不变不代表没更新。
- daemon 在跑（`127.0.0.1:17890`），lens 已重连，`extension_browsers=["chrome","edge"]`。本轮为真机需要启动了 Chrome（此前只有 Edge 在线）。
- 本轮排查发布问题时下载的临时文件在 `/private/tmp`（可忽略）。AWR 无未关闭会话/claim。

## 本轮解决的两个真实问题（保留现场记录，均已修复）

1. **原生 `<select>` 无法设置** → CU-D-690。现场证据：`type` → `target is not an editable text element`；点 `option` → `target has no visible bounds`；`key` 只出策略 plan（`pressed=false`）。根因：`validateTarget(el,{editable:true})` 只认 input/textarea/contenteditable，且原生弹层点不到。
2. **`vcu self update` 不可用且不解释** → CU-D-700。现场证据：GitHub Releases 为空 → installer 非零退出，CLI 只报 `update installer exited non-zero`（stderr 被 `Stdio::null()` 吞掉）。

## 测试边界（不变）

- 允许：`127.0.0.1` 抛页、dry-run、自己的 tab
- 禁止：组 1/3、用户站点真点、微信动作、CDP Allow、OS cursor、SendInput
- 原生标签组只属于一个浏览器窗口

## 下次会话

1. 先读 `docs/PLAN.md` 的「下一步大纲」。默认不 claim。用户点名一条之后再开工。
2. 台账 `.awr/intake/work-ledger.yaml` 已无进行中切片；可领取只剩 `MAC-NEXT`（深 AX，停放）与 `FEISHU-001`（停放）。**不要 claim 这两项**，除非用户明确要开。
3. CI `test` 三平台与打包已在 run `36129175359` 全绿。不要把这次修复写成完整 Windows 产品 CU。
4. AWR 完成登记：`work complete` / `evidence add` 的报告 schema 未摸清（模板未公开，报错只有通用提示），现用台账 `status: completed` + docs 证据指针，与仓库既有做法一致。
5. 停放项：TC-B-040 / 跨源 iframe / trusted 手势 / 产品 Windows CU / MAC-NEXT 深 AX / FEISHU-001。不要 claim 完整 Codex CU 或完整 Windows 产品 CU。
