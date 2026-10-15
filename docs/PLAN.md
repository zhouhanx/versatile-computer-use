# VCU 当前计划：浏览器基线与 macOS 优先开发

更新：2026-09-28。用户要求所有主线均有具体计划与验收，保持 macOS 优先。完整主线、批次和验收见 [PLAN-MAINLINES.md](PLAN-MAINLINES.md)，macOS 细则见 [PLAN-MACOS.md](PLAN-MACOS.md)。本文优先于 HANDOFF 历史快照；Git HEAD、推送状态和当前测试状态应实查，不沿用历史哈希。Windows 开发见 [WINDOWS-DEV.md](WINDOWS-DEV.md)，接入见 [AGENT.md](AGENT.md)。扩展继续本地加载，不上商店。

## 当前节点

**浏览器基线（2026-10-15）：** `19327b0` 干净工作树复跑 `scripts/poc_browser_br_001_macos.py` 返回 `ok=true`，`dirty=false`，`completion_allowed=true`。Chrome 受保护页 `1934573032` 和 Edge 受保护页 `1828173166` 仍 focused，前台仍是 Hearthstone。夹具已关。断连后 ping 不是 ok，再按 `target/debug/vcu-daemon --user-dir ~/.vcu` 拉起，`extension_profile=user`。没有冷启动，没有点 Allow，没有改 profile。缺扩展和 stale SW 由门禁测试覆盖，live stale SW 没有注入。keypress、snapshot、现场挪窗仍 not_run，不写成已交付。源状态改为 completed。不要自动领取 `BR-002`、`CORE-001` 或 `MAC-007`。不要结束会话 `01M4X5644CBJ89DN3Y69SZ1WBS`。证据 `docs/testing/br-001-completion.json` 和 `.local/browser-cu/br-001.json`。

**浏览器标签组（2026-10-15）：** 折叠 VCU 组里的 `example.com` 已能读到真实段落，且不切正在看的 Apple 页 `1828173166`。点名工作页 `1828173152` 的 `p` 提取 HTTP 200，首条是中文文档示例段落。当前 `example.com` 没有 `h1`，`h1` 提取是 `selector matched no text`，`read_page=true`，`stage=idle`，不再谎称没读到。单测 75 通过。扩展 SHA256 `429a31d79a47b2cbd48dcad081d8cb6277bfb8e2e9333a9491004d5a62c2949a`。Chrome、断连、keypress、snapshot、现场挪窗和干净 SHA 仍缺。这不是 `BR-001` 完成。证据 `.local/browser-cu/br-001-selector-miss.json`。

**已发布：浏览器版 Bridge 0.2.8。** GitHub Release `v0.2.8`（Latest）已上线，`curl | sh` 与 `vcu self update` 均真机验证通过。浏览器门禁仍有效。`vcu --version` 仍打印 crate `0.1.0`，不代表没更新。

**浏览器工作面复核（2026-10-15）：** 点名飞书页 `1828171512` 的 `input#marker` click 改打安静窗工作页 `1828173126`，HTTP 200，`pressed=true`，`released_reading_page=1828171512`，`focused=false`。飞书页地址没变，仍 focused。CG 顺序是 Ghostty、飞书窗、安静窗。安静窗仍在 `1420,880` 的 `500x375`，边界和飞书窗重叠，但排在后面，这次没有盖住。扩展 SHA256 `5a736eba`，没有重载。Chrome 未运行，断连未停 daemon，工作树脏，源状态仍 planned，不能完成。没有领取 `CORE-001`。证据 `.local/browser-cu/br-001-retarget-click.json`。

**浏览器工作面（2026-10-15）：** 操作留在安静窗自己的 VCU 组，不替换、不搬走正在看的页。带 `tab_id` 的 `/v1/browser/open` 原地更新未聚焦工作页 `1828173126`，HTTP 200，`in_place=true`，没有新建标签。飞书页 `1828171512` 仍 focused。随后 type 读回 `vcu-br001-inplace-type`。夹具进程已停，不要重载该页。运行中的 daemon 没有 `POST /v1/browser/navigate`，返回 404。AppleScript 只改安静窗标签地址也会把 Edge 的 last focused window 改到安静窗，即使 OS 前台采样仍是 Ghostty；不要再用。已用显式 select 把焦点交还飞书页 `1828171512`。交还后点名 `1828173126` 的 `input#marker` type HTTP 200，`typed=true`，`via=content_message`，`input_path=dom_type`，回执没有 `background_action`。extract 读回 `vcu-br001-1792019564`。scroll `dy=640` HTTP 200，`scrolled=true`，`scroll_before=0`，`scroll_y=640`。飞书页仍 focused，工作页仍 `active=true` 且 `focused=false`。前台采样都是 Ghostty，间隔约 0.20 秒，不能写成绝对零闪烁。keypress 和扩展 snapshot 仍 not_run。Chrome、断连和干净 SHA 仍缺。这不是 `BR-001` 完成。

**最高准则（2026-10-14）：** 停手、挂起、阻塞或标记完成前，必须用 AWR 实查可执行/待派发工作并验明阻塞真假。禁止说谎，禁止未充分测试就标记完成。任务和阶段完成后必须落地标注和文档。准则见 [AGENTS.md](../AGENTS.md) 与台账头部；它不授权擅自领取下一项。

**下一轮主线：macOS 受限桌面会话。** 历史 CU-D-010…700 已关闭；新排期为 MAC-001…008，MAC-NEXT 为总验收。`MAC-001` 在 `00d2be7` 干净工作树上预检 `ok=true`。`MAC-002` 在 `a350741` 干净工作树上 POC `ok=true`，源状态已完成。`MAC-003` 在 `2033326` 干净工作树上 POC `ok=true`，源状态已完成。`MAC-004` 在 `64daa23` 干净工作树上 POC `ok=true`，`dirty=false`，源状态已完成。证据是 `mac-004-actions`。`MAC-005` 在 `bfff2f4` 干净工作树上 POC `ok=true`，`dirty=false`，源状态已完成。证据是 `mac-005-navigation`。`MAC-006` 在 `e6fa5e9` 干净工作树上 POC `ok=true`，`dirty=false`，源状态已完成。证据是 `mac-006-stage`。`BR-001` 已领取，源状态仍是 planned。2026-10-15 daemon `97464` 上，后台重载、打开和截图都不切飞书页 `1828171512`。截图窗口是 `1828172973`，不展开用户窗口里的 VCU 组，OS 前台仍是 Ghostty。2026-10-14 动作探针也是 `ok=true`。2026-10-15 官方 POC 的 Edge 基线 pass，飞书页和 Ghostty 都没被抢走；Chrome 未跑，记 not_run。工作树是脏的，没有干净 SHA，这不是完成。2026-10-15 按窗口 id 停放后，02:29 最小后台截图仍复用 `1828173041`，126 次采样没有盖住飞书；只读复核安静窗 CG `20648` 在 `1420,915`，飞书 CG `7243` 在前面。源状态仍 planned。2026-10-15 放大改为从停放角落长出，不再复制用户窗原点；`reload_self` 后 ping `quiet_stage=parked-origin`。飞书页和 Ghostty 未变，安静窗仍在 `1420,915`。同坐标 `/stage` 返回 `ok`。没有重跑放大截图。源状态仍 planned。2026-10-15 隐式动作只进折叠 VCU 组，正在看的非 VCU 页拒绝 click/type/hover/scroll/navigate/close；`dry_run` 和活动页截图仍只读。安静窗不再放大。单测 43 通过。`reload_self` 后 ping `quiet_stage=parked-size`。飞书页 `1828171512` 仍活动，Ghostty 仍前台，安静窗 CG `20648` 仍在 `1420,915`。打开折叠 VCU 组并点击 example.com 没有切飞书，测完已关。没有重跑放大截图，bounds 未漂移所以没有再打 `/stage`。Chrome 未运行，记 not_run。源状态仍 planned。2026-10-15 服务端非 dry_run 的隐式 click/type/hover/scroll 不再把正在看的非 VCU 页的 `last_observe` 发给扩展，改为 `tab_id_source=agent_group`。对应 lib 测试和 `app_http` 各 1 通过。daemon `97464` 未重启，未加载，不能写成真机已生效。2026-10-15 扩展 SHA256 `23e889b7` 已重载，ping `quiet_act=agent-group`，飞书页 `1828171512` 仍活动，Ghostty 仍前台。这只证明扩展标记已加载，不证明服务端绑定已生效，也不是完成。2026-10-15 停放安静窗改为 `agent_owned`，不再被标成正在看的页。扩展 SHA256 `62e7eeec` 重载后 ping `quiet_own=quiet-window`。飞书页 `1828171512` 仍 focused，安静窗 `1828173042` 的 `page_being_read=false`。daemon `10393` 已替换 `97464` 并加载该绑定。不带 `tab_id` 的 click 拒绝正在看的飞书页；折叠 VCU 组夹具被命中，`tab_id_source=agent_group`，extract 读回 `hits-1` 后已关闭。证据 `.local/browser-cu/br-001-daemon-agent-group.json`。2026-10-15 不带 `tab_id` 的 type/hover/scroll 留在折叠 session 组。`br-001-dom-actions.json` 的紧随 extract 仍是 `y-0`，不能证明滚动。`br-001-scroll-persist.json` 先滚 480，`dy=0` 再读仍是 480，0.5 秒后 extract 是 `y-480/top-480`；飞书页 `1828171512` 仍 focused，Ghostty 仍前台。2026-10-15 折叠组夹具的显式截图来自安静窗 `1828173041`，不是用户窗；视口点击打中该夹具，extract 读回 `hits-1`，飞书页仍 focused。证据 `.local/browser-cu/br-001-collapsed-shot.json` 和 `.local/browser-cu/br-001-viewport-click.json`。不带 `tab_id` 的截图仍绑 last observe。2026-10-15 后台截图和滚动重试不再把非 VCU/session、且不在 Agent 窗里的用户页 `tabs.move` 进安静窗。单测 47 通过。`reload_self` 后 ping `quiet_move=agent-surface`。折叠 session 组夹具截图仍来自安静窗 `1828173041`，飞书页 `1828171512` 仍 focused，Ghostty 仍前台。证据 `.local/browser-cu/br-001-quiet-move.json`。Chrome、断连和干净 SHA 仍缺，不能完成。2026-10-15 只读复核：daemon `10393` 仍在，ping 未重载仍是 `quiet_move=agent-surface`，单测 47 通过。飞书页 `1828171512` 仍 focused，Ghostty 仍前台。证据 `.local/browser-cu/br-001-quiet-move-recheck.json`。2026-10-15 session 组改为标题匹配；组号复用到用户组 1/3 时拒绝搬移。单测 49 通过。`allow_page_reload=false` 重载后 ping `quiet_session=match-title`。飞书页 `1828171512` 仍 focused。服务端 `agent_surface` 未加载。证据 `.local/browser-cu/br-001-session-title.json`。2026-10-15 正在看的活动页不再 `tabs.move`。记成 Agent 窗的用户窗口不再整窗授权搬移。单测 52 通过。扩展 SHA256 `b079409a` 重载后 ping `quiet_reading=never-move`。飞书页 `1828171512` 仍 focused，哔哩哔哩页未换窗，Ghostty 仍前台。证据 `.local/browser-cu/br-001-never-move.json`。服务端 `agent_surface` 仍未加载。源状态仍 planned，不能完成。2026-10-15 运行中的 daemon 若仍把正在看的页绑进 click/type/hover/scroll/keypress/snapshot，扩展改打已有折叠 VCU/session 组，返回 released_reading_page 和 tab_id_source=agent_group。没有 Agent 页时仍拒绝。navigate、close_tab、click_point 不改打别的页。dry_run 和活动页截图仍可检查该页但不移动它。单测 52 通过。扩展 SHA256 `8b6669a7aa7f671239f3e8f4afddf06af441907de51ab9ff698d4771efce38a0`。不重载 ping 仍是 `quiet_release=agent-group`，同时 `quiet_reading=never-move`。只读复核飞书页 `1828171512` 仍 focused，哔哩哔哩页未换窗，Ghostty 仍前台。证据 `.local/browser-cu/br-001-release-reading.json` 和 `.local/browser-cu/br-001-release-reading-recheck.json`。没有对飞书页发送会执行的动作。当前没有折叠 VCU/session 的 http 页；安静窗 about:blank 不可注入。因此若请求仍带飞书页，扩展会拒绝，不会改打，也不会搬走。本轮没有发送该动作。2026-10-15 navigate 若目标是正在看的页，不再 tabs.update 该页。http(s) URL 改在已有安静窗的折叠 VCU 组打开；没有安静窗时才在用户窗折叠 VCU 组打开，并恢复原活动页。close_tab/click_point 仍不改打。没有 Agent http 页时 click/type/hover/scroll/keypress/snapshot 仍拒绝。单测 55 通过。扩展 SHA256 `e91caf3e079ed3d002970d70b04e42583923b1d0c73515ba8580e6a8c36ecf8c`。`allow_page_reload=false` 重载后 ping `quiet_nav=agent-group`。飞书页 `1828171512` 仍 focused，地址未变，哔哩哔哩页未换窗，Ghostty 仍前台。没有对飞书页发送 navigate。证据 `.local/browser-cu/br-001-nav-agent-group.json`。daemon `10393` 未重启，服务端改打未加载。Chrome、断连和干净 SHA 仍缺，源状态仍 planned，不能完成。daemon `10393` 二进制是 `04:07`，`login_state.rs` 是 `04:55`，服务端 `agent_surface` 和 `release_reading_page_target` 未加载，不能写成真机已生效。Chrome 未运行，记 not_run。断连重连未停 daemon，记 not_run。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。源状态仍 planned，不能完成。2026-10-15 没有 Agent http 页时，点名正在看的页的 click/type/hover/scroll/keypress/snapshot 改为在安静窗优先的折叠 VCU 组打开 `https://example.com/` 再改打，不激活该页。单测 56 通过。扩展 SHA256 `8eda9087c4cb7494b0317dfbd62845560bf32fec57b8cf324786943aa0ae9634`。`allow_page_reload=false` 重载后 ping `quiet_work=ensure-group`。飞书页 `1828171512` 仍 focused，哔哩哔哩页未换窗，Ghostty 仍前台。没有对飞书页发送 click 或 navigate，真机确保路径记 not_run。证据 `.local/browser-cu/br-001-ensure-group.json`。daemon `10393` 未重启，服务端改打未加载。Chrome、断连和干净 SHA 仍缺，源状态仍 planned，不能完成。2026-10-15 不带 tab_id 且没有 Agent http 页时，click/type/hover/scroll/keypress/snapshot 也在安静窗优先的折叠 VCU 组打开 `https://example.com/` 再执行。dry_run 不新开页。单测 57 通过。扩展 SHA256 `918ecb2940ac9cb49fed2088406aeefa659f5e0c96e4b83434f03d260193316a`。`allow_page_reload=false` 重载后 ping `quiet_implicit=ensure-group`。飞书页 `1828171512` 仍 focused，Ghostty 仍前台。没有对飞书页发送动作。证据 `.local/browser-cu/br-001-implicit-ensure.json`。daemon `10393` 未重启，服务端改打未加载。Chrome、断连和干净 SHA 仍缺，源状态仍 planned，不能完成。2026-10-15 默认 open 改为优先停放安静窗的折叠 VCU 组，并且不激活新标签，避免 Edge 把该窗抬到正在看的页前面。没有安静窗时才退回用户窗折叠组。单测 58 通过。扩展 SHA256 `e77d6a5fff1a154d863090ca58c06cc01aabef054d171690c1680e46c64e19af`。`allow_page_reload=false` 重载后 ping `quiet_open=agent-group`。真机 `POST /v1/browser/open` 打开 `https://example.com/`，新页 `1828173126` 在安静窗 `1828173041` 的折叠 VCU 组，`active=false`，`page_being_read=false`。飞书页 `1828171512` 仍 focused，地址和窗口未变，哔哩哔哩页未换窗，Ghostty 仍前台。证据 `.local/browser-cu/br-001-open-quiet.json`。daemon `10393` 未重启，服务端改打未加载。Chrome、断连和干净 SHA 仍缺，源状态仍 planned，不能完成。2026-10-15 非活动工作页原地注入超时后，已在安静窗的标签只在该窗激活再重试，不新建窗口，也不 `tabs.update` 正在看的页。单测 61 通过。扩展 SHA256 `edf57595`。`allow_page_reload=false` 重载后 ping `quiet_inject=activate-then-retry`。点名 example.com `1828173126` 的截图 HTTP 200，窗口是安静窗 `1828173041`，PNG 是 example.com。飞书页 `1828171512` 仍 focused，Ghostty 仍前台。`dy=0` 滚动 HTTP 200，但是截图注入后的原地读取，`background_scroll=false`，不能单独写成滚动挂起回退已真机证明。证据 `.local/browser-cu/br-001-quiet-inject.json`。daemon `10393` 未重启。Chrome、断连和干净 SHA 仍缺，源状态仍 planned，不能完成。不要领取 `CORE-001`。`CORE-001` 可领取，但用户要求先完成 `BR-001`，不要领取。`MAC-007` 仍依赖 `BR-004`。2026-10-15 非活动工作页 content messaging 超时后只在安静窗激活再重试。单测 64 通过。扩展 SHA256 `583e9a74`。ping `quiet_message=activate-then-retry`。点名 example.com `1828173126` 的 `body` 点击 HTTP 200，`pressed=true`，`via=content_message`，`background_action=true`，`focused=false`。飞书页 `1828171512` 仍 focused，VCU 组仍折叠，Ghostty 仍前台。先前 `h1` 点击 HTTP 400，是 selector not found，不能当成回退证据。没有采样动作中途是否闪过安静窗。daemon `10393` 未重启。Chrome、断连和干净 SHA 仍缺，源状态仍 planned，不能完成。证据 `.local/browser-cu/br-001-quiet-message.json`。交接见 [HANDOFF.md](HANDOFF.md)。

Windows 已复测范围以 [PLAN-EPIC-WIN-SESSION.md](PLAN-EPIC-WIN-SESSION.md) 的 CU-WIN-SESSION-001…091、[修复计划](PLAN-WINDOWS-FIX.md) 的 WIN-FIX-001…009、[视觉记录](PLAN-WINDOWS-VISUAL.md) 至 WIN-VIS-013 为准。它们是历史证据，不是完整 Windows 产品 CU，也未在本轮复测。CI run `36129175359` 是历史恢复证据，不代表本轮新跑的检查。

## 全部主线（已写计划，未新增功能验收）

| 主线 | 工作项 | 计划与验收入口 |
| --- | --- | --- |
| macOS AX/窗口/截图 | MAC-001…003 | [macOS 计划](PLAN-MACOS.md) |
| macOS 动作/滚动/真实 App | MAC-004/005/007、APP-001 | [macOS 计划](PLAN-MACOS.md)、[应用覆盖](PLAN-MAINLINES.md) |
| Stage/Guide 可见会话 | MAC-006 | [macOS 计划](PLAN-MACOS.md) |
| Chrome/Edge 登录态与浏览器能力 | BR-001…006、BROWSER-NEXT | [浏览器计划](PLAN-BROWSER.md) |
| 公共 daemon/会话/路由 | CORE-001 | [运行时计划](PLAN-RUNTIME-DELIVERY.md) |
| CLI/MCP/宿主接入 | MAC-008、HOST-001 | [运行时计划](PLAN-RUNTIME-DELIVERY.md) |
| 宿主视觉/可选 provider | VISION-NEXT（draft） | [视觉计划](PLAN-RUNTIME-DELIVERY.md) |
| Windows UIA/会话/DPI | WIN-101…103、WIN-NEXT | [Windows 后续计划](PLAN-EPIC-WIN-SESSION.md) |
| 策略/隐私/审计/验收矩阵 | POLICY-001、QA-001 | [全主线计划](PLAN-MAINLINES.md)、[验收方法](testing/METHODOLOGY.md) |
| 安装/升级/扩展分发/候选包 | DELIVERY-001 | [交付计划](PLAN-RUNTIME-DELIVERY.md) |

飞书发送、抓取增强、Linux、更多宿主模板与协作增强也有候选范围和研究退出条件，见 [全主线计划第 5–6 节](PLAN-MAINLINES.md)；它们保持 draft，不因列入文档而自动开工。

## macOS 优先执行顺序

| 顺序 | 工作项 | 交付目标 | 初始状态 |
| --- | --- | --- | --- |
| 1 | MAC-001 | 权限诊断、构建/daemon 版本核对与本机基线 | ready |
| 2 | MAC-002 | 有预算、可展开、可脱敏的深 AX Scene | `a350741` POC ok=true，源状态 completed |
| 3 | MAC-003 | 指定窗口、Scene/ref 与截图绑定，拒绝过期目标 | `2033326` POC ok=true，源状态 completed |
| 4 | MAC-004 | 精确点击和输入，独立读回验证 | completed；64daa23 干净 POC ok=true |
| 5 | MAC-005 | 目标滚动、等待和提取 | completed；bfff2f4 干净 POC ok=true |
| 6 | MAC-006 | Stage/Guide 生命周期、Abort 与坐标验证 | completed；e6fa5e9 干净 POC ok=true |
| 7 | MAC-007 | TextEdit/Finder/受控原生控件的真实任务闭环 | planned，依赖 MAC-006、BR-004 |
| 8 | MAC-008 | CLI/MCP 契约、回归、本地打包与能力说明 | planned，依赖 007 |
| 收口 | MAC-NEXT | 汇总本轮 macOS 验收与限制 | planned，依赖 008 |

每项的代码落点、POC、验收和负向用例见 [macOS 执行计划](PLAN-MACOS.md)。具体状态以 AWR 台账为准；此表为排期起点，不是动态完成记录。首项结束后按真实基线估算工作量，不将旧路线图的周数当新承诺。

跨主线安排：

1. **浏览器基线 BR-001…004**：MAC-001 后可按顺序执行，在 MAC-007 混合任务前完成；macOS 优先，串行使用真机。
2. **浏览器探索 BR-005**：MAC-NEXT 后研究跨源/trusted/TC-B-040 可行性，不承诺可实现。BR-006 负责稳定路径闭环；BROWSER-NEXT 改为 planned 汇总验收。
3. **公共运行时与交付**：CORE/HOST/POLICY → DELIVERY → QA，细依赖见台账；本轮不发布新版本。
4. **Windows**：QA-001 后 WIN-101…103 → WIN-NEXT，已写具体计划并改为 planned；受限环境必须如实记录未测。
5. **候选**：FEISHU/VISION/EXTRACT/LINUX/HARNESS/COORD 保持 draft；发布托管历史仍归 CU-D-700。

红线不变：不搬系统光标，不代点 Edge Allow，不自动化微信，不改 `~/.codex/computer-use/`，不动用户标签组 1/3。网页细操作必须 `source=extension_dom`。代码提交前要有足够 POC。

**已关闭切片流水（至 CU-D-700，不是进行中史诗）：** 对标 Codex Computer Use **含桌面**。阶段 1–5 已过。CU-D-060 CI 真机列窗+PrintWindow 已过（run `35462329205`）。CU-D-070 CI `SETVALUE_OK path=wm_settext`（非 ValuePattern）。CU-D-080 单测已过。CU-D-090 CI 已过。CU-D-100 CI 已过。CU-D-110 CI 已过。CU-D-120 CI 已过。CU-D-130 CI 已过。CU-D-140 CI 已过（`TYPE_OK path=clipboard_paste` + `NEWLINE_DENIED`）。未宣称完整 Windows 产品 CU。CU-D-140/150/160/170/180/190/200/210/220/230 已过。CU-D-230 CI `TYPE_OK path=clipboard_paste` + `NEWLINE_DENIED` run `35473547564`。CU-D-240 CI `ABORT_OK hud=false` / `HUD_GONE` run `35473997888`。CU-D-250 CI `HOVER_OK path=guide_hover` run `35474340766`。CU-D-260 CI `HOVER_OK` then `INVOKE_OK path=bm_click` run `35474689948`。CU-D-270 CI `SCOPE_OK` / `BACKEND_OK` run `35475108584`。CU-D-280 CI `TOOLS_OK` / `CU-D-280 OK` run `35476413803`。CU-D-290 CI `HOVER_OK path=guide_hover` / `ABORT_OK via=mcp_tools_call` run `35477727787`。CU-D-300 CI `INVOKE_OK path=bm_click` / `CU-D-300 OK` run `35478128021`。CU-D-310 CI `WAIT_OK path=scene_wait` / `CU-D-310 OK` run `35478526783`。CU-D-320 CI `TYPE_OK path=wm_settext` / `CU-D-320 OK` run `35479050203`。CU-D-330 CI `NEWLINE_DENIED via=mcp_tools_call` / `CU-D-330 OK` run `35479929439`。CU-D-340 CI `SCROLL_OK path=wm_vscroll` / `CU-D-340 OK` run `35480404968`。CU-D-350 CI `EXTRACT_OK count=1` / `CU-D-350 OK` run `35481212302`。CU-D-360 CI `SHOT_OK mime=image/png` / `CU-D-360 OK` run `35481626341`。CU-D-370 CI `KEY_DENIED via=mcp_tools_call` / `CU-D-370 OK` run `35482034139`。CU-D-380 CI `WAIT_MISS_OK` / `WAIT_REF_MISS_OK` / `CU-D-380 OK` run `35482614685`。CU-D-390 CI `SCOPE_OK` / `BACKEND_OK` / `STAGE_OK via=mcp_tools_call` / `CU-D-390 OK` run `35483037087`。CU-D-400 真机 `CHROME_HELLO_OK` / `EDGE_HELLO_OK` / `MERGE_OK browser_count=2` / `CU-D-400 OK`（Chrome 5 + Edge 13 tabs）。未宣称完整 Windows 产品 CU / 完整 Codex CU。CU-D-410 真机 health `extension_browsers=["chrome","edge"]` count=2，无占位 `browser`。CU-D-420 真机 observe 进程名 `Chrome` `target.allowed=true`，无 AppDenied。CU-D-430 真机 observe `tabs_source=extension_tabs`。CU-D-440 真机 `/v1/browser/observe` 统一 CLI/MCP。CU-D-450 真机 last_observe 绑定。CU-D-460 lens 按 observe 浏览器定向。CU-D-470 screenshot 绑 last observe。CU-D-480 open 绑 observe 浏览器。CU-D-490 desktop.scene 附 browser_tabs。CU-D-500 MCP initialize 已改。CU-D-510 `login-state`/`next` 在 lens polling 时 next_action 为 ping→observe→60s last observe；CLI help 同步。CU-D-520 真机同一次 tabs chrome+edge。CU-D-530 真机 observe 绑前台 USER 浏览器。CU-D-540 真机 login-state 前台优先。CU-D-550 真机 extract 绑 last observe。CU-D-560 health/init observe-bind 文案。CU-D-570 lens observe 不走 AX 全树。CU-D-580 observe capture 可 viewport dry-run click。CU-D-590 真机 `observe --tab` 抛页 live viewport click 0→1。CU-D-600 无 `--tab` 时前台非 USER Chrome/Edge 则诚实失败。CU-D-610 真机 observe 后 live type/scroll 绑 last observe；滚动后旧截图 stale_viewport，重新 observe 后 dry-run 通过。CU-D-620 真机 hover + DOM wait。CU-D-630 真机 observe --browser 定向 Chrome/Edge。CU-D-640 真机 close --browser 定向。CU-D-650 真机 extract/type/click --browser。CU-D-660 真机 hover/scroll/wait --browser。CU-D-670 真机 open --browser 与 group 同浏览器。CU-D-680 `group-update --browser`、CU-D-690 原生 `<select>`、CU-D-700 Release 托管 + `vcu self update` 均已真机/发布验证。`make check` 0。其后停放 P2。未宣称完整 Windows 产品 CU / 完整 Codex CU。总览与编排见 [`ROADMAP-CU.md`](ROADMAP-CU.md)，测试见 [`testing/DESKTOP_CU_TEST_PLAN.md`](testing/DESKTOP_CU_TEST_PLAN.md)。排期桌面切片已关闭，仍不得把 VCU 写成完整桌面 CU 或完整 Windows 产品 CU。

本地对照实现在 gitignore 的 `/reference/computer-use/`：可反编译作结构参考，笔记进 `docs/research/`，自有代码进仓库；`.app` / 反编译源码 / 官方素材不上传。

0.2.8 仍是登录态浏览器操作层；桌面工作不得回退 `make check` / 扩展测试，不得 warp OS 光标、代点 Allow、自动化微信、修改 Codex CU 安装。

额度规则：用户已重置总额度。旧“周额度不足10%”提示无效；今后按重置后的**总额度剩10%**要求写交接，不能把goal token计数当账户余额。

## 目标与范围

保持已发布浏览器能力，优先完成 macOS 指定窗口的观察、可靠动作、结果验证与可中止会话。原 PARITY 浏览器交互迭代已作为历史基线保留，每个新切片留下可复核记录。

- 主路径：USER Edge/Chrome + Browser Bridge，保留登录态。宿主已有视觉时不要求`vcu init model`。
- 网页：明确tab、DOM selector、绑定截图的viewport坐标点击、输入/滚动、原生标签组。
- 浏览器整窗：macOS窗口ID截图与Guide；AXPress失败必须诚实报错。
- 0.2.8 发布口径仍是浏览器；新增 macOS 能力按 PLAN-MACOS 单独验收。微信自动化、CDP Allow、OS cursor warp、修改 Codex CU 安装仍然禁止。

## 历史浏览器阶段清单

| ID | 阶段 | 当前状态 | 完成证据 / 剩余项 |
| --- | --- | --- | --- |
| PARITY-001 | Codex比较与阶段设计 | 完成 | `docs/design/09-browser-interaction-parity.md` |
| PARITY-002 | 精确tab与DOM动作 | 完成 | 失效ID不fallback、唯一/可编辑/无遮挡目标、无mutation重放；真机DOM通过 |
| PARITY-003 | 原生标签组与网页选择 | 完成 | 命名、折叠/展开、选择自动展开、解除分组；CLI/MCP和真实窗口POC |
| PARITY-004 | Codex光标外观对齐 | 同背景终验已做并修 halo | 浅色同页对照 native/DOM/Guide；放大光晕至约66px 圆雾。不宣称逐像素动画或官方资源复刻 |
| PARITY-005 | 最终整体验收 | Chrome 真机 + 原生 popup 已过 | 40 Node；Chrome extract/click/type source=extension_dom，counter 0→1；原生 popup 跨窗禁选。双扩展错路由会 retryable |
| PARITY-006 | 绑定截图的网页坐标点击 | 完成 | capture绑定文档/布局、60秒过期、一次消费；真实点选counter0→1 |
| PARITY-007 | 多窗口与面板约束 | **本节点完成** | 后台开窗不抢焦点、跨窗拒绝无副作用、组显式保留所属窗口；面板按窗口分区/跨窗禁选 |
| PARITY-008 | 布局变化与截图可靠性 | **本节点完成** | CSSOM移动/遮挡、input事件、JSON排序往返、截图频率控制、大PNG回执；正向/反向测试均通过 |

以前的 TEST/EXTRACT/ETH 阶段属于基线。ETH 只是 L1/L2/L3 样本，不是全站抓取；FEISHU-001 停放。MAC-NEXT 已重构为本轮 macOS 总验收。TC-B-040 通用 AX 网页像素真点仍未通过，已验证的是 extension DOM viewport 路线。

## 历史浏览器节点验收（非本轮复测）

- `rtk proxy make check` exit **0**：**102 Rust +35 Node**；mock/extra/login-state、release打包、checksum/curl-install/MCP smoke全部通过。
- `scripts/poc_browser_parity.py --live`：**32项通过**，测试页安全清理。包含稳定截图允许point dry-run，以及CSS/输入变化必须拒绝；不再只有负向测试。
- 真实看图点选：PNG像素(120,318) → CSS(75,198.705)，counter **0→1**，只发生一次。
- 布局JSON经过Rust重排键后仍可用；完整几何留在sidecar，模型只接收摘要。
- 截图统一排队以满足浏览器每秒2次限制；只读截图可做一次限流恢复，点击/输入等mutation不自动重放。
- AX先启用再枚举窗口，跳过小控制浮窗；截图失败不包装成成功，不使用被遮挡的屏幕区域冒充浏览器图像。

完整结果：`docs/testing/BROWSER_PARITY_RESULTS.md`；机器可读索引：`docs/testing/BROWSER_PARITY_NODE_REPORT.json`。门禁在定版提交前的工作树通过；定版 SHA 为 `d8ee9ad`。

## 历史切片记录（保留当时状态，不用于领取下一任务）

- [x] **P1 / PARITY-004**：同背景浅色页对照 native/DOM/Guide 的 idle/click/move；DOM 按 tab zoom 逆缩放。发现 halo 过小过淡后已加大圆雾并统一 Guide。约束仍有效：不再向用户索要截图；不退回长箭尾/硬圆环；仅 mismatch 时改代码；可参考开源/公开技术；不修改私有安装。
- [x] **P1 / PARITY-005**：Chrome 真机 DOM extract/click/type 已过（counter 0→1，input=chrome-live，遮挡拒绝）。原生 popup 已过。用户 1/3 组未改。
- [x] **P2 / PARITY-005（定版提交）**：工作树已定版提交 `d8ee9ad` 并准备推送 origin/main。AWR 证据绑定该 SHA；光标终验与 Chrome 真机仍未完成。
- [x] **P2 / 0.2.7 体验补丁**：光标朝向与点击压缩、viewport 截图保留光标、合并 Edge+Chrome tabs、CLI/MCP hover、同源 iframe 内层点选、canvas 合成点击。
- [x] **P2 / 0.2.8**：`install-lens --reload` 热更新已连接 Edge/Chrome SW；默认 `open` 在现有 USER 窗口开新标签。
- [ ] **P2 后续（浏览器）**：跨源 iframe / trusted 手势 / TC-B-040 仍不在范围内。双浏览器 live 已过（CU-D-400）。
- [x] **CU-B-010**：tabs/health 报告 `browser_count`/`browsers`（单测）。真机 Chrome 未连。
- [x] **CU-B-011**：doctor `lens_dual_browser` 在双浏览器已装但只连一个时 warn（单测）。真机仍 Edge-only。
- [x] **CU-D-010**：无 Stage HUD 则 desktop session 失败（`StageRequired`）；HTTP `stage_hud=true`。
- [x] **CU-D-011**：`vcu session abort` / HTTP abort 拆会话（单测）。未弹用户 HUD 做目视 Escape。
- [x] **CU-D-012**：微信 denylist + 覆盖点拒绝（单测）。
- [x] **CU-D-020/021/022/024**：AXPress 非零失败、Return 门禁、Guide overlay、像素命中不报 extension_dom（单测）。
- [x] **CU-D-023**：TextEdit 真机 `e8` AXTextArea 写入标记，`os_cursor_used=false`；Notes AXPress `axpress:0`。CLI session `type --tab`；`resolve_tab` 优先 active app。
- [x] **CU-D-032**：浏览器回归 ping 0.2.8 / tabs / 现窗新标签 / screenshot capture dry-run / throwaway DOM click。组 1/3 未动。
- [x] **CU-D-040**：Finder CG 列窗 + VCU `reveal`/`open_path`（nsworkspace）真机打开 `OPENME`。非 AXPress、非 Return。
- [x] **CU-D-041**：Terminal.app `ax_menu_paste` 真机输入；换行/Return 拒绝。未碰 Ghostty。
- [x] **CU-D-042**：飞书客户端 CG 窗观察；无发送；气泡不在 AX。
- [x] **CU-D-030/031/033**：Observation surface/source；USER Edge AXWebArea 不得假绿；`playbooks/desktop.md`。
- [x] **CU-D-050/051/052**：HUD 文案、Guide 短三角、`VCU_AUDIT=1`。
- [x] **CU-D-060**：CI run `35462329205` Notepad `UIA_OK` + `PRINTWINDOW_OK`。非 `vcu session` 产品路径。
- [x] **CU-D-070**：CI `SETVALUE_OK path=wm_settext`（Edit 无 ValuePattern）。
- [x] **CU-D-080**：backend set_value 回退 WM_SETTEXT（单测）。
- [x] **CU-D-090**：CI `STAGE_OK`/`SNAP_OK`/`TYPE_OK path=wm_settext`。
- [x] **CU-D-100**：CI `INVOKE_OK path=bm_click`（非 InvokePattern）。
- [x] **CU-D-110**：CI `SHOT_OK` 768x519 PNG（PrintWindow）。
- [x] **CU-D-120**：CI `OPEN_OK path=explorer_open`。
- [x] **CU-D-130**：CI `REVEAL_OK path=explorer_reveal`。
- [x] **CU-D-140**：CI `SNAP_OK`/`TYPE_OK path=clipboard_paste`/`NEWLINE_DENIED` run `35469208163`。无 SendInput；未执行命令。
- [x] **CU-D-150**：`playbooks/desktop.md` Windows 最短环（cmd `clipboard_paste`，禁换行）。
- [x] **README**：Windows CI 覆盖（cmd `clipboard_paste` / Explorer / WinForms Stage）；明确非产品会话。
- [x] **CU-D-160**：CI `SNAP_OK ref=e14` / `INVOKE_OK path=bm_click` run `35470610934`（win32calc）。无 SendInput。
- [x] **CU-D-170**：CI `SNAP_OK` / `CLICK_DENIED` / `TYPE_DENIED` run `35471043411`（SystemSettings）。无 SendInput；未改设置。
- [x] **CU-D-180**：CI `SCROLL_OK path=wm_vscroll` run `35471497693`。无 SendInput / mouse_event。
- [x] **CU-D-190**：CI `EXTRACT_OK count=1` run `35471859281`。无 SendInput。
- [x] **CU-D-200**：CI `WAIT_OK path=scene_wait found_ref=e2 os_cursor_used=False` / `CU-D-200 OK` run `35472199783`。无 SendInput。
- [x] **CU-D-210**：CI `WAIT_MISS_OK` / `WAIT_REF_MISS_OK` / `CU-D-210 OK` run `35472851832`。`ActionFailed` timed out 含 value/ref。无 SendInput。
- [x] **CU-D-220**：CI `KEY_DENIED` / `CU-D-220 OK` run `35473210457`。`FocusPolicyViolation` Return gated。无 SendInput。
- [x] **CU-D-230**：CI `TYPE_OK path=clipboard_paste` / `NEWLINE_DENIED` / `CU-D-230 OK` run `35473547564` tab `win:powershell:6700`。无 SendInput；未执行命令。
- [x] **CU-D-240**：CI `ABORT_OK hud=false` / `HUD_GONE` / `ACT_DENIED` / `CU-D-240 OK` run `35473997888`。无 SendInput。
- [x] **CU-D-250**：CI `HOVER_OK path=guide_hover overlay=True os_cursor_used=False` / `GUIDE_FILE_OK x=462 y=347.5` / `CU-D-250 OK` run `35474340766`。无 SendInput。
- [x] **CU-D-260**：CI `HOVER_OK path=guide_hover` / `INVOKE_OK path=bm_click os_cursor_used=False` / `CU-D-260 OK` run `35474689948`。无 SendInput。
- [x] **CU-D-270**：CI `SCOPE_OK` / `BACKEND_OK` / `STAGE_OK` / `CU-D-270 OK` run `35475108584`。doctor warn 不是产品 Windows CU；无 AXPress 假绿。
- [x] **CU-D-280**：CI `TOOLS_OK hover=vcu_hover abort=vcu_session_abort wait.value=true` / `CU-D-280 OK` run `35476413803`。tools/list only。无 SendInput。
- [x] **CU-D-290**：CI `HOVER_OK path=guide_hover os_cursor_used=False via=mcp_tools_call` / `ABORT_OK via=mcp_tools_call` / `CU-D-290 OK` run `35477727787`。无 SendInput。
- [x] **CU-D-300**：CI `INVOKE_OK path=bm_click os_cursor_used=False via=mcp_tools_call` / `CU-D-300 OK` run `35478128021`。无 SendInput。
- [x] **CU-D-310**：CI `WAIT_OK path=scene_wait via=mcp_tools_call` / `CU-D-310 OK` run `35478526783`。无 SendInput。
- [x] **CU-D-320**：CI `TYPE_OK path=wm_settext os_cursor_used=False via=mcp_tools_call` / `CU-D-320 OK` run `35479050203`。无 SendInput。
- [x] **CU-D-330**：CI `NEWLINE_DENIED via=mcp_tools_call` / `CU-D-330 OK` run `35479929439`。无 SendInput。
- [x] **CU-D-340**：CI `SCROLL_OK path=wm_vscroll os_cursor_used=False via=mcp_tools_call` / `CU-D-340 OK` run `35480404968`。无 SendInput。
- [x] **CU-D-350**：CI `EXTRACT_OK count=1 via=mcp_tools_call` / `CU-D-350 OK` run `35481212302`。无 SendInput。
- [x] **CU-D-360**：CI `SHOT_OK mime=image/png via=mcp_tools_call` / `CU-D-360 OK` run `35481626341`。无 SendInput。
- [x] **CU-D-370**：CI `KEY_DENIED via=mcp_tools_call` / `CU-D-370 OK` run `35482034139`。无 SendInput。
- [x] **CU-D-380**：CI `WAIT_MISS_OK via=mcp_tools_call` / `WAIT_REF_MISS_OK via=mcp_tools_call` / `CU-D-380 OK` run `35482614685`。无 SendInput。
- [x] **CU-D-390**：CI `SCOPE_OK via=mcp_tools_call` / `BACKEND_OK via=mcp_tools_call` / `STAGE_OK via=mcp_tools_call` / `CU-D-390 OK` run `35483037087`。无 SendInput。
- [x] **CU-D-400**：真机 `CHROME_HELLO_OK` / `EDGE_HELLO_OK` / `MERGE_OK browser_count=2` / `CU-D-400 OK`。同路径 unpacked 共用 runtime id，client key 为 `browser:id`。组 1/3 未动。无 SendInput。
- [x] **CU-D-410**：真机 health `extension_browsers=["chrome","edge"]` `extension_browser_count=2`；doctor `lens polling chrome+edge`。无占位 client。
- [x] **CU-D-420**：真机 allowlist 含 `Chrome`/`Google Chrome`；observe `app_id=proc:Chrome:*` `allowed=true` 无 AppDenied；`poc_login_state.sh` PASS hud=false；`make check` 0。无 SendInput。
- [x] **CU-D-430**：login-state observe 合并 extension tabs/url；真机 `tabs_source=extension_tabs` tabs=5 `page_url_source=extension_tabs`；不写 `source=extension_dom`；不宣称 AX 网页像素点击。`make check` 0。无 SendInput。
- [x] **CU-D-440**：`POST /v1/browser/observe` 为 CLI/MCP 唯一路径；遍历 user_browsers；标 `tab_id`/`tab_id_source=extension_tabs`；真机 `tab_id` 非空 tabs=6。不是 TC-B-040。`make check` 0。无 SendInput。
- [x] **CU-D-450**：DOM click/type/hover/scroll/extract 无 tab_id 时绑 60s 内 last observe；显式 tab_id 优先；`tab_id_source=last_observe`。真机 body dry-run 绑到 observe tab。不是 TC-B-040。`make check` 0。无 SendInput。
- [x] **CU-D-460**：DOM 动作 `call_timeout_hinted` 按 last observe 的 Chrome/Edge 定向 lens client；tab 未登记时不落到另一浏览器。`browser_hint_targets_client_when_tab_unknown`。不是 TC-B-040。`make check` 0。无 SendInput。
- [x] **CU-D-470**：`browser screenshot`/`capture_tab` 无 tab_id 时绑 last observe；`tab_id_source=last_observe`。真机 screenshot tab 与 observe 相同。不是 TC-B-040。`make check` 0。无 SendInput。
- [x] **CU-D-480**：`open_tab` 按 last observe 的 Chrome/Edge 定向现有窗口；真机 example.com 后台开在 Chrome 后关闭。组 1/3 未动。不是 TC-B-040。`make check` 0。无 SendInput。
- [x] **CU-D-490**：desktop.scene 快照附 `browser_tabs`/`page_url`，不改 `source=ax_scene`、不替换 AX targets；select/close/group 也按 last observe 定向。`desktop_scene_attaches_extension_tabs_for_edge`。不是 TC-B-040。`make check` 0。无 SendInput。
- [x] **CU-D-500**：MCP initialize instructions 改为 ping→observe→60s last observe（click/screenshot/open）；Never CDP Allow。`mcp_initialize_and_session_tools` 断言。不是 TC-B-040。`make check` 0。无 SendInput。
- [x] **CU-D-510**：polling lens 视为 user；next_action 含 observe / last observe；CLI observe/screenshot/open/click help 同步。真机 login-state PASS。不是 TC-B-040。`make check` 0。无 SendInput。
- [x] **CU-D-520**：同一次 tabs chrome=6 edge=7，`browsers_failed=[]`。Edge 新 SW 挂 POST poll；`--reload` 超时则打开 `reload.html`。`poc_cu_d_520.py` OK。不是 TC-B-040。无 SendInput。
- [x] **CU-D-530**：observe 前台 USER Chrome/Edge。真机前台 Edge 时 `app_id=proc:Microsoft_Edge:60318` `frontmost_matched=true`。`poc_cu_d_530.py` OK。不是 TC-B-040。无 SendInput。
- [x] **CU-D-540**：login-state `user_browsers[0]` 为前台浏览器。真机 Edge pid 60318。`poc_cu_d_540.py` OK。不是 TC-B-040。无 SendInput。
- [x] **CU-D-550**：extract 无 tab 时 `tab_id_source=last_observe`。真机 tab 与 observe 相同。`poc_cu_d_550.py` OK。不是 TC-B-040。无 SendInput。
- [x] **CU-D-560**：health click 与 `vcu init` next 为 ping→observe→last observe，不再 tabs-then-screenshot / pixel-only。`poc_cu_d_560.py` OK。无 SendInput。
- [x] **CU-D-570**：lens polling 时 observe 用 extension viewport，不扫 AX。真机 0.49s。`poc_cu_d_570.py` OK。不是 TC-B-040。无 SendInput。
- [x] **CU-D-580**：observe `capture_id` 可 viewport dry-run click。`poc_cu_d_580.py` OK。不是 TC-B-040。无 SendInput。
- [x] **CU-D-590**：`observe --tab` 指定抛页，不抢 OS 前台；live viewport click `#hit` 0→1 后关闭。`poc_cu_d_590.py` OK。组 1/3 未动。不是 TC-B-040。无 SendInput。
- [x] **CU-D-600**：无 `--tab` 的 observe 在前台不是 USER Chrome/Edge 时 `InvalidInput`，要求 `--tab`；不静默绑另一浏览器。`poc_cu_d_600.py` OK。组 1/3 未动。无 SendInput。
- [x] **CU-D-610**：observe `--tab` 后无 `--tab` 的 live type/scroll `tab_id_source=last_observe`，输入可见、scrollY 变化。滚动后旧截图 dry-run 必须被 `stale_viewport` 拒绝；重新 `observe --tab` 的截图 dry-run 成功且 `source=extension_dom`。`poc_cu_d_610.py` 本机 OK（tab 1013794813，y=900）。没有放宽 scroll_y。组 1/3 未动。无 SendInput。不是完整 Windows 产品 CU。
- [x] **CU-D-620**：observe 后 live hover `hovered=1`；`wait --selector` 等到 DOM 文本，miss 诚实超时。`poc_cu_d_620.py` OK。组 1/3 未动。无 SendInput。
- [x] **CU-D-630**：`observe --browser chrome|edge` 定向 last observe；tab_id 双浏览器撞号须带 `--browser`。`poc_cu_d_630.py` OK。组 1/3 未动。无 SendInput。
- [x] **CU-D-640**：`close`/`select` 接受 `--browser`；撞号无 `--browser` 拒绝；错浏览器 close 为 tab not found。`poc_cu_d_640.py` OK。组 1/3 未动。无 SendInput。
- [x] **CU-D-650**：extract/type/click `--browser` 定向；observe 不再把 Chrome tab 的 last_observe 写成 Edge 进程。`poc_cu_d_650.py` OK。组 1/3 未动。无 SendInput。
- [x] **CU-D-660**：hover/scroll/wait/screenshot `--browser`；撞号无 `--browser` 拒绝。`poc_cu_d_660.py` OK。组 1/3 未动。无 SendInput。
- [x] **CU-D-670**：`open --browser` 定向 Chrome/Edge；group/ungroup 拒绝跨浏览器 tab。`poc_cu_d_670.py` OK。组 1/3 未动。无 SendInput。
- [x] **CU-D-680**：`group-update --browser` 真机通过。`scripts/poc_cu_d_680.py` CU-D-680 OK：组列表带 `browser` 标记、唯一 id 无 `--browser` 正确解析、`--browser` 定向只改对应浏览器组、错浏览器/未知 id 诚实失败且不误改、组清理干净、组 1/3 未动。撞号分支由 `app_http` `upd_amb` 单测覆盖。无 SendInput。同时删除仓库残留 `extension/background.js.bak`。
- [x] **CU-D-690**：extension DOM 支持原生 `<select>`。`type --selector` 接受 `<select>`：按 option value/可见文本匹配，设置后派发 `input`+`change`，回执 `input_path=dom_select`；匹配不到诚实报错且不改值，文本输入仍 `dom_type`。`scripts/poc_cu_d_690.py` CU-D-690 OK；真机验收＝用 VCU 在 GitHub Support 工单页选中「Type of Issue」并提交成功（`.local/desktop-cu/cu-d-690-github-ticket.png`）。
- [x] **CU-D-700**：Release 托管 + `vcu self update` 可用性。已发布 `v0.2.8`（Latest）：`curl | sh` 装到临时前缀成功，`vcu self update`（无 `VCU_BASE_URL`）`updated: true` 且与 Release 包 sha256 一致；失败路径输出 installer stderr + 本地 `file://` 提示。同时修复发布管线两个缺陷（0 字节 `dist/.gitkeep`、Windows 侧 CRLF `install.sh`）。
- [x] **清理**：删除被 git 跟踪的残留备份 `extension/background.js.bak`（2026-09-17 旧 service worker，2460B）。


## 操作入口

```sh
vcu browser ping --json
vcu browser observe --json          # 看 PNG；60s 内无 --tab 的动作绑这次 observe
vcu browser observe --tab <id> --json  # 指定标签，不抢 OS 前台
vcu browser screenshot --json       # 无 --tab 时截 last observe 页
vcu browser click --selector body --dry-run --json
vcu browser open --url https://example.com
vcu browser close --tab <id>
```

`source=extension_dom`用于网页动作，`extension_tabs`用于标签管理，`extension_viewport`用于网页截图。DOM是synthetic事件，`trusted=false`；iframe/canvas等需要原生手势的点目标不假报成功。布局绑定上限1000个viewport可见交互目标、5000候选扫描，超限明确拒绝。细节见`playbooks/user-browser.md`。
