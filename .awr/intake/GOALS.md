# Versatile Computer Use {#vcu status=active}

构建 **厂商/模型/Agent 宿主无关** 的可插拔 Computer Use 运行时（VCU）：在 Codex、Claude Code、Pi、Cursor 等工具中，即使用户不使用其自带模型或内置 CU，也能通过 VCU 获得稳定的计算机操作能力。

首期聚焦 **Chrome/Edge 浏览器**：独立 Agent 工作面、不抢系统光标、可附着已打开浏览器、显式借用用户标签、页面观察与抓取；通过 CLI/MCP/Skill 快速接入；支持 `vcu init model` 配置视觉模型，使无多模态主 Agent 仍可完成需要“看见”的步骤。后续再扩展 macOS/Windows 桌面 App。

**当前版本与优先级（2026-09-28）：已发布浏览器 Bridge 0.2.8。历史 CU-D-010…700 已关闭；用户要求所有主线均有具体计划与验收，仍优先 macOS。总览 docs/PLAN-MAINLINES.md，macOS MAC-001…008 → MAC-NEXT，浏览器 BR-001…006 → BROWSER-NEXT，公共 CORE/HOST/POLICY/DELIVERY/QA，Windows WIN-101…103 → WIN-NEXT。本轮只完成规划，功能未实施。**

Success criteria:

- 需求与方案文档回答：语言选型、浏览器不打断/接管架构、视觉与主子协同、接入面、分期边界。
- 选定跨平台技术栈（至少覆盖 macOS 与 Windows 交付形态）。
- 明确与 BrowserSkill、Codex Browser/CU、CDP 方案的差异化与边界。
- 产品实现前不提前写 runtime 业务代码；设计接受后由台账切开实现项。
- 仓库由 AWR（≥0.4.0）托管；Agent shell 绑定 RTK。
- 本轮 macOS：明确窗口的深 AX 观察、绑定 Scene 的可靠动作、独立读回、可见且可中止的会话，在 TextEdit/Finder/受控原生窗口完成 CLI/MCP 任务闭环。
- 每项验收绑定实际受测版本，区分 mock、本机真机和未测环境；浏览器门禁不回退，不宣称完整桌面 CU。
- 浏览器单列 USER 连接、路由/标签组、DOM/表单、截图新鲜度、CLI/MCP 闭环验收；复杂目标研究结论与功能交付分开。
- 公共运行时、策略/审计、宿主、隔离安装与 Windows 后续均有依赖和正反向验收；视觉/飞书等候选列 draft，不能因计划而执行外部请求或发送。

Provenance: 2026-09-17 用户强制初始化需求（RTK/AWR、可插拔 CU、跨平台调研、浏览器优先、CLI 视觉配置、借鉴 AWR）。覆盖此前空目录名推导的泛化目标。

历史迭代目标（2026-09-19 用户明确）：对比 Codex Computer Use，统一虚拟指针视觉与浏览器网页选择，实现原生可折叠命名标签组。PARITY 已纳入浏览器基线，不作为当前新排期。

当前执行依据（2026-09-28 用户明确并补充）：先统一计划和台账、优先 macOS，再把 AX、浏览器等全部主线及验收写入文档。首项 MAC-001 为 ready，后续按依赖 planned；BR-001…004 在 MAC-007 前作为网页门禁。BROWSER-NEXT/WIN-NEXT 从候选改为有具体切片的 planned 总验收；研究 BR-005 与 Windows 均后置。FEISHU-001、VISION-NEXT、EXTRACT-NEXT、LINUX-NEXT、HARNESS-NEXT、COORD-NEXT 保持 draft。发布托管历史归 CU-D-700，当前规划不发布。

Windows 历史范围：WIN-FIX-001…009、视觉记录至 WIN-VIS-013、CU-WIN-SESSION-001…091，分别见专项文档与台账历史汇总索引。本轮未复测，不等于完整 Windows 产品 CU。CI run `36129175359` 仅为历史恢复证据。保留用户标签组 1/3；不搬系统光标、不代点 Allow、不自动化微信、不改 Codex CU 安装。
