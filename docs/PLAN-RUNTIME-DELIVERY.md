# VCU Runtime / Host / Delivery 计划

更新：2026-09-28。本文件是后续执行计划，不代表任何功能已实现或已验收。
当前优先级仍为 macOS，浏览器 Bridge 0.2.8 保持回归门禁；批次与全部依赖见 [PLAN-MAINLINES.md](PLAN-MAINLINES.md)。本轮只更新规划和台账，不改实现、版本号或用户机器上的活跃安装。

## 1. 范围、顺序与不变量

MAC-006 后可推进 CORE-001；HOST-001 同时依赖 CORE-001 与 MAC-008，不要求把 CORE-001 插入 macOS 串行链。
DELIVERY-001 等待 HOST-001、BR-006 与 POLICY-001；QA-001 位于隔离交付验证之后。VISION-NEXT 是 draft，
不进入默认队列，也不调用模型。CORE/HOST 是跨平台公共层；MAC-008 只负责 macOS 切片
的入口回归、能力说明和本地打包，不与公共契约重复计完成。

不变量：浏览器细操作继续 `source=extension_dom`；桌面动作不移动 OS 光标、不使用 HID；
不点击 Edge/Chrome Allow、不自动化微信、不修改 `~/.codex/computer-use/`；扩展保持 unpacked。
所有 POC 只使用临时用户目录、临时前缀、自建窗口/localhost 页面和可清理资源。

现有设计锚点：`vcu-daemon` 持有 Steward 状态，`vcu-cli` 和 `vcu-mcp` 通过本机 HTTP
与 pairing token 接入；稳定边界是 JSON envelope（`ok/error.code/session_revision/evidence_refs`）。
现有落点为 `crates/vcu-core/src/{config,protocol,result,error}.rs`、
`crates/vcu-server/src/{runtime,state,api,vision}.rs`、`crates/vcu-daemon/src/main.rs`、
`crates/vcu-cli/src/main.rs`、`crates/vcu-mcp/src/main.rs`；不预设重写这些模块。

## 2. 工作项

### CORE-001：runtime/daemon/session 路由隔离与恢复（依赖 MAC-006）

- 落点：`vcu-server/src/runtime.rs`、`state.rs`、`api.rs`，`vcu-core/src/protocol.rs`，
  `vcu-daemon/src/main.rs`；仅在现有锁、endpoint、pid、`SessionSlot` 基础上补契约。
- 步骤：固定 `user_dir + daemon endpoint + session_id + surface/backend` 路由键；隔离
  token、session、borrow、blackboard 和 idempotency；定义 checkpoint/重启后的可恢复状态，
  对旧 Scene/ref/capture 统一失效；保留单 daemon lock 与现有错误码。
- 正向验收：两个临时 `VCU_DIR` 可并行启动且互不读写；同目录只允许一个 daemon；重启后
  可列出安全的 checkpoint/closed 状态并继续只读恢复，动作必须重新观察；session revision、
  surface/source 与 evidence_refs 在 HTTP/CLI/MCP 回执一致。
- 反向验收：错 token、错 `user_dir`、跨 session ref、旧 revision、重复 idempotency、
  stale capture、daemon 重复启动均明确失败且无副作用；崩溃/端口冲突不得假报成功或串用其他会话。
- 命令：`rtk cargo test -p vcu-core -p vcu-server --offline`；`rtk proxy make check`。
- 拟脚本：`scripts/poc_core_001_isolation.py`（双目录、重启、过期 ref/capture、清理）。
- 证据：`.local/runtime-delivery/CORE-001.json`，记录真实 SHA、端口、目录、路由矩阵、
  正反向回执和清理结果；不写 token 原文。

### HOST-001：CLI/MCP 契约与宿主接入（依赖 CORE-001、MAC-008）

- 落点：`crates/vcu-cli/src/main.rs`、`crates/vcu-mcp/src/main.rs` 及其测试，
  `docs/AGENT.md`/接入说明；消费 MAC-008 的 macOS 行为，不重做 MAC-008 的真机切片。
- 步骤：冻结 CLI `--json` 与 MCP Content-Length/tools/call 的同一 JSON envelope、错误码、
  session/source/Abort 语义；保持 MCP 直连 daemon、无 shell fallback；校验 `print-config`
  给出绝对 `vcu-mcp` 路径且只描述合并，不自动覆盖宿主配置。
- 正向验收：CLI 与 MCP 各完成 macOS 观察→动作→独立读回→Abort；字段和错误 repair hint
  一致；`vcu mcp print-config --json`、宿主初始化、daemon 不可达提示可直接复现。
- 反向验收：畸形帧、未知 tool/method、缺字段、无效 token、stale ref、权限拒绝、超时、
  已停止 session 在两入口均诚实失败；不得回退到另一个 session、浏览器或 shell 命令。
- 命令：`rtk cargo test -p vcu-cli -p vcu-mcp --offline`；`rtk proxy node --test extension/tests/*.test.cjs`。
- 拟脚本：`scripts/poc_host_001_contract.py`（CLI/MCP 同请求矩阵、绝对路径检查、token 脱敏）。
- 证据：`.local/runtime-delivery/HOST-001.json`，附 tools/list、tools/call、CLI JSON 摘要和
  宿主配置 diff（默认应为空）；不记录 pairing token。

### VISION-NEXT：宿主视觉/可选外部视觉配置与失败边界（draft）

- 状态：不排入默认队列；本轮不调用模型、不发送图片、不要求 `vcu init model`，只规划边界。
- 落点：`vcu-server/src/vision.rs`、`api.rs`、`vcu-core/src/config.rs` 与 CLI model/policy
  解析；沿用 `VisionPolicy`、`VisionInfo`、宿主已可看图的 handoff，不新增供应商耦合。
- 步骤：明确 `dom_first/dom_only/explicit external` 的选择、预算、超时、脱敏和 provider
  配置 schema；把“宿主已看图”和“daemon 外部请求”分成可审计的两条路径；默认关闭网络视觉。
- 正向验收（仅离线）：无模型配置时 DOM/AX 与宿主 handoff 正常；配置可解析、摘要字段可
  序列化；mock/静态测试确认 `used/provider/summary` 语义，且记录 `model_called=false`。
- 反向验收（仅离线）：缺配置、缺 key、超预算、超时、非 2xx、空响应、脱敏违规都返回
  有界错误，不泄露 key/图片，不静默改用云端；默认队列和默认命令不触发外部请求。
- 命令：`rtk cargo test -p vcu-core -p vcu-server vision --offline`；禁止运行 `model test`。
- 拟脚本：`scripts/poc_vision_001_boundary.py`（配置/错误/无网络断言；不加载真实 API key）。
- 证据：`.local/runtime-delivery/VISION-NEXT.json`，含配置 schema、错误样本、网络调用计数为 0；
  该文件只能作为 draft 记录，不能宣称视觉能力已交付。

### DELIVERY-001：隔离安装升级/打包/扩展分发（依赖 HOST-001、BR-006、POLICY-001）

- 落点：`scripts/pack-release.sh`、`scripts/install/*`、`crates/vcu-cli/src/main.rs` 的
  `self/service` 路径、`extension/`、`Makefile`；只复用已发布 0.2.8 流程，不开新发布通道。
- 步骤：在临时 prefix 和临时 `VCU_DIR` 构建 CLI/daemon/MCP（macOS arm64/x64 按实机记录）；
  生成 archive/sha256；跑 install、`self info/update/uninstall`；验证扩展只复制到
  `~/.vcu/lens-extension` 的隔离替身并保留 unpacked 手工加载说明。
- 正向验收：三类二进制、macOS `vcu-stage`、manifest、skills/playbooks 均存在，受测 Mac 上 Stage 能实际拉起；
  安装后 health/ping/MCP smoke 通过；更新前后 checksum 与版本可解释；原用户 `~/.vcu` 和宿主
  配置未被覆盖，扩展包不要求商店权限。
- 反向验收：损坏包、缺资产、sha256 不匹配、无权限、旧 daemon lock、重复扩展目录均停止并
  给出可修复错误；失败升级须验证隔离目录中的旧安装仍可用或可恢复，不能半更新后报成功；uninstall 只删临时 prefix，不删用户配置、浏览器 profile 或 Codex CU。
- 命令：`rtk proxy bash scripts/pack-release.sh`；`rtk proxy bash scripts/poc_self_lifecycle.sh`；
  `rtk cargo test -p vcu-cli --test self_update_failure --offline`。
- 拟脚本：`scripts/poc_delivery_001_isolated.sh`（临时 prefix/VCU_DIR、校验和、扩展 manifest、
  cleanup）；不触碰真实 `~/.local/bin` 或 `~/.vcu`。
- 证据：`.local/runtime-delivery/DELIVERY-001.json`，附 archive 名称/sha256、安装日志摘要、
  extension manifest 检查和“未发布/未上商店”结论；不新增 Release tag。

### QA-001：全主线证据/集成回归矩阵与性能基线（依赖 DELIVERY-001）

- 范围：优先 macOS + 浏览器 Bridge；Windows 行随后补充，缺 Windows 设备不阻塞 macOS 收口，
  也不把历史 Windows CI 写成产品完成证据。
- 落点：现有 `crates/*/tests`、`extension/tests`、`scripts/poc_*`、`Makefile`，以及拟新增的
  证据索引；不引入另一个测试框架或大规模重构。
- 步骤：把 MAC-001…008、BR-006、CORE/HOST/DELIVERY 的 ID、SHA、OS/arch、二进制、命令、
  source/input_path、截图/读回、清理和限制编成矩阵；在 macOS 测 startup/health、snapshot、
  action-readback、Abort、MCP handshake、extension observe 的 p50/p95/超时基线。
- 正向验收：候选构建通过定向 POC、Rust/Node/browser 门禁和隔离安装；每个已宣称能力都有可追溯
  证据、环境和限制，性能基线重复运行可比较；Windows 缺口单列为 follow-up。
- 反向验收：stale ref/capture、错路由、权限拒绝、Abort 后动作、坏包、默认视觉网络调用、
  浏览器扩展旧版等故障均在矩阵中得到预期失败；跳过、设备缺失和 flaky 不得标为 pass。
- 命令：`rtk cargo test --workspace --offline`；`rtk proxy node --test extension/tests/*.test.cjs`；
  `rtk proxy make check`；`rtk proxy awr --project . status`（仅核对状态，不改台账）。
- 拟脚本：`scripts/poc_qa_001_matrix.py`、`scripts/bench_runtime_qa.py`（采集 JSON，不上传数据）。
- 证据：`.local/runtime-delivery/QA-001.json` 与拟新增 `docs/testing/RUNTIME_DELIVERY_RESULTS.md`；
  记录 p50/p95、失败样本、未测平台和回归结论。

## 3. 依赖、证据与发布边界

依赖图：`MAC-006 → CORE-001`；`CORE-001 + MAC-008 → HOST-001`；`CORE-001 → POLICY-001`；`BR-006 + HOST-001 + POLICY-001 → DELIVERY-001 → QA-001`。
VISION-NEXT 仅保留 draft，不阻塞上述队列。MAC-008 的 macOS 契约验收与 HOST-001 的公共 CLI/MCP
聚合验收各计一次；CORE-001 不重复 MAC-008，DELIVERY-001 不重复已关闭的 CU-D-700。

所有证据必须带 `work_id/source_sha/platform/arch/command/result/cleanup`，敏感值只写存在性和哈希。
实现阶段先 POC、再最小代码改动、再定向测试、最后更新报告；本轮计划本身不创建拟脚本、不跑模型。

发布权限保持不变：不发新 Release、不推送发布、不上 Chrome Web Store/Edge Add-ons；不修改用户活跃
宿主配置、`~/.vcu`、浏览器既有标签组或 `~/.codex/computer-use/`。任何需要真实用户配置或外部
服务的步骤应先检查现有任务授权；未获授权时使用隔离夹具，不把规划当发布或外部调用授权。
