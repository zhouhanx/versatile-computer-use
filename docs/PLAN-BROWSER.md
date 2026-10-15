# 浏览器主线计划：BR-001…BR-006

更新：2026-09-28。本文件是浏览器下一轮的规划，不是实现报告；本轮只写文档，未做真机操作，任何 planned/研究项均不得写成已通过。

## 1. 定位、基线与边界

- 已发布基线是 Browser Bridge 0.2.8：USER Chrome/Edge + `~/.vcu/lens-extension`，网页动作必须走 `source=extension_dom`。
- 当前优先级仍是 macOS；按 [全主线计划](PLAN-MAINLINES.md) 调度。MAC-001 后执行 BR-001…004，作为 MAC-007 混合任务的网页门禁，不能等 MAC-008 后才开始。
- BR-001…004 是 macOS 主线的浏览器基线/发现问题修复项；只有发现阻塞 macOS 门禁的回归才修复，不与 macOS 切片争用真机。
- BR-005 后置且只做跨源/trusted 可行性研究；BR-006 在已有能力上做 CLI/MCP 闭环，不等待 BR-005。
- 永久边界：不点 Edge Allow debugging，不用 CDP 接管，不用 HID/系统光标，不自动化微信，不改 `~/.codex/computer-use/`，不动用户标签组 1/3。Agent 的打开、观察、提取、点击、输入、滚动和截图不得替换用户正在看的页面，不得聚焦其窗口或展开其标签组，也不得把不属于 VCU/session 组且不在 Agent 窗里的用户页搬进安静窗；工作面是该窗口里折叠的 VCU/session 组。显式 `browser select` 仍可切换。隐式 click/type/hover/scroll 不把正在看的非 VCU 页当目标。若请求仍把正在看的页绑进 click/type/hover/scroll/keypress/snapshot，改打已有折叠 VCU/session http 页；没有时在安静窗优先的折叠 VCU 组打开 https://example.com/ 再改打，不激活正在看的页。打开会替换该页时仍拒绝。不带 tab_id 的 click/type/hover/scroll/keypress/snapshot 同样先开这个工作页。dry_run 不新开页，仍拒绝。extract、close、click_point 和分组不改打。非 `dry_run` 时服务端不得把该页的 `last_observe` 绑进这四个动作，应放开为 `agent_group`。`dry_run` 和活动页截图可以检查，但不移动它。安静窗保持停放尺寸，不再放大盖住当前页。正在看的活动页即使所在窗口曾被记成 Agent 窗，也不 `tabs.move`；分组、close_tab、click_point 和进入用户组的 open 仍拒绝。

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

`19327b0` 干净工作树复跑 `scripts/poc_browser_br_001_macos.py` 返回 `ok=true`，`dirty=false`，`completion_allowed=true`。Chrome 受保护页 `1934573032` 和 Edge 受保护页 `1828173166` 仍 focused，前台仍是 Hearthstone。夹具已关。断连后 ping 不是 ok，再按 `target/debug/vcu-daemon --user-dir ~/.vcu` 拉起，`extension_profile=user`。没有冷启动，没有点 Allow，没有改 profile。缺扩展和 stale SW 由门禁测试覆盖，live stale SW 没有注入。keypress、snapshot、现场挪窗仍 not_run，不写成已交付。源状态改为 completed。不要自动领取 `BR-002`、`CORE-001` 或 `MAC-007`。不要结束会话 `01M4X5644CBJ89DN3Y69SZ1WBS`。证据 `docs/testing/br-001-completion.json` 和 `.local/browser-cu/br-001.json`。

2026-10-15 官方 POC `scripts/poc_browser_br_001_macos.py` 在脏工作树上 `ok=true`，`completion_allowed=false`。Chrome 和 Edge 基线都 pass。受保护页没被替换：Edge Apple 页 `1828173166`、Chrome 必应页 `1934573032` 仍 focused。前台始终是 Hearthstone。夹具开在各自安静窗折叠组，测完已关，没有落回正在看的窗。断连停掉当时的 daemon 后 ping 诚实失败，再按 `target/debug/vcu-daemon --user-dir ~/.vcu` 拉起，USER 扩展重连，`quiet_open=own-window`。没有冷启动，没有点 Allow，没有改 profile。扩展单测 104 通过、0 失败。`background.js` SHA256 `21c52d21ac682bb9b630a1211688462f87868e64fc5de3af36c6428b6a9ffb0c`。keypress、snapshot、现场挪窗和 live stale SW 仍 not_run。Edge 截图采样没有记录受保护 CG 窗口 id，不能补写成几何已证明。提交前 HEAD 是 `e6fa5e9`，工作树脏。源状态仍 planned，不能完成。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。证据 `.local/browser-cu/br-001.json`、`.local/browser-cu/br-001-reverse.json`。

2026-10-15 折叠 VCU 组的非活动页可以读到真实 DOM，且不切换正在看的页。当前正在看的页是 Apple 支持页 `1828173166`，地址 `https://support.apple.com/zh-cn/111111`。工作页 `1828173152` 仍是 `https://example.com/`，在用户窗 `1828171349` 的折叠紫色 VCU 组 `2112453533`，`active=false`。`example.com` 现由 `/s.js` 注入段落，没有 `h1`。点名 `p` 提取 HTTP 200，`count=6`，首条中文段落与页面一致。点名 `h1` 返回 `selector matched no text`，`read_page=true`，`stage=idle`，没有编造标题，也没有展开或重载。`extension/tests/background.test.cjs` 75 通过，0 失败。工作树和安装目录 SHA256 都是 `429a31d79a47b2cbd48dcad081d8cb6277bfb8e2e9333a9491004d5a62c2949a`。`allow_page_reload=false` 重载后 ping `quiet_extract=document-idle`。标签 id 集合没变。Chrome 未运行，断连未停 daemon `10393`，keypress、snapshot、现场挪窗和干净 SHA 仍 not_run。工作树脏，HEAD `e6fa5e9`。源状态仍 planned，不能完成。证据 `.local/browser-cu/br-001-selector-miss.json`。

2026-10-15 运行中的旧服务工作者会在 select 时聚焦窗口并激活标签。源码改为拒绝切走正在看的页，`select_tab` 不再谎称 `activated=true`。`extension/tests/background.test.cjs` 71 通过，0 失败。工作树和安装目录 SHA256 都是 `6dd469abba48b0bd141cb57856436ea7cab502aa4b4627b6ee01561f55353278`。`allow_page_reload=false` 重载后 ping `quiet_raise=never`，`quiet_helper=no-applescript`，`quiet_park=dock-clear`，`quiet_inject=in-place`。飞书页 `1828171512` 仍 focused，地址没变。工作页 `1828173126` 仍在安静窗 VCU 组 `48700119`。点名工作页的 select HTTP 400，没有切走飞书页。前台仍是 ghostty。现场挪窗和 CG 记 not_run。Chrome 未运行，断连未停 daemon `10393`，工作树脏，HEAD `e6fa5e9`。源状态仍 planned，不能完成。证据 `.local/browser-cu/br-001-tab-group-no-interrupt.json`。

2026-10-15 停放请求改为贴用户窗底边，不再请求压进正在看的页的 `screenHeight - 200`。`extension/tests/background.test.cjs` 71 通过，0 失败。工作树和安装目录 SHA256 都是 `eb3ac93dba9ea4d16ae24dd47e91862c412c8b15900293e080b1a9b7912f2f6e`，没有重载，运行中的 ping 还没有 `quiet_park=dock-clear`。飞书页 `1828171512` 仍 focused，工作页 `1828173126` 仍在安静窗 VCU 组，System Events 前台是 ghostty。CG 安静窗 `20648` 仍是 `1420,880` 的 `500x375`，在飞书窗后面。AX 读位置 `-25205`，System Events 看不到 Edge 窗口，现场挪窗记 not_run。Chrome 未运行，断连未停 daemon `10393`，工作树脏，HEAD `e6fa5e9`。源状态仍 planned，不能完成。证据 `.local/browser-cu/br-001-dock-clear.json`。

2026-10-15 点名飞书页 `1828171512` 的 click 改打安静窗工作页 `1828173126`。HTTP 200，`pressed=true`，`via=content_message`，`focused=false`，`released_reading_page=1828171512`，`page_url=http://127.0.0.1:58472/inplace`。飞书页仍是用户窗 `1828171349` 的活动且 focused 页，地址没变。CG 窗口顺序前后都是 Ghostty、飞书窗、安静窗。安静窗仍在 `1420,880` 的 `500x375`，和飞书窗有边界重叠，但排在后面，这次没有盖住。扩展 SHA256 `5a736eba258ebb0e2517eee73f46049b345eac7c277b3352a30ed72147b1f031`，没有重载。前台采样 1 次是 Ghostty，不能写成绝对零闪烁。Chrome 主进程不在，断连未停 daemon，工作树脏，HEAD `e6fa5e9`。keypress 和 snapshot 仍 not_run。源状态仍 planned，不能完成。证据 `.local/browser-cu/br-001-retarget-click.json`。

2026-10-15 复核：点名工作页 `1828173126` 的 `input#marker` click HTTP 200，`pressed=true`，`via=content_message`，`focused=false`，没有切飞书页 `1828171512`。Edge 用户窗 index 1，安静窗 index 2，停在 `1420,880` 的 `500x375`。扩展 SHA256 `5a736eba258ebb0e2517eee73f46049b345eac7c277b3352a30ed72147b1f031`，ping `quiet_prefer=quiet-window`。单测 70 通过，0 失败。Chrome 主进程不在，断连未停 daemon，工作树脏，HEAD `e6fa5e9`。keypress 和 snapshot 仍 not_run。源状态仍 planned，不能完成。证据 `.local/browser-cu/br-001-quiet-prefer-recheck.json`。

2026-10-15 带 `tab_id` 的 `/v1/browser/open` 原地更新未聚焦工作页 `1828173126` 到 `http://127.0.0.1:58472/inplace`。HTTP 200，`in_place=true`，`reused=true`，没有新建标签，没有 `windows.update({focused:true})`。`allow_page_reload=false` 重载后 ping `quiet_open_reuse=in-place`。飞书页 `1828171512` 仍 focused，哔哩哔哩页未换窗，工作页仍在安静窗 `1828173041`，`active=true`，`focused=false`。type HTTP 200，`typed=true`，extract 读回 `vcu-br001-inplace-type`。前台采样都是 Ghostty，打开间隔最大 0.24 秒，不能写成绝对零闪烁。夹具进程已停，不要重载该标签。keypress 和 snapshot 记 not_run。Chrome、断连和干净 SHA 仍缺，源状态仍 planned，不能完成。证据 `.local/browser-cu/br-001-open-reuse.json`。

2026-10-15 已 active 且未聚焦的安静窗工作页完成输入和滚动读回。运行中的 daemon 没有 `POST /v1/browser/navigate`，返回 404。没有启动会话，没有重启 daemon，没有重载扩展。AppleScript 只改安静窗 `1828173041` 里 example.com 标签的地址，OS 前台采样 2 次都是 Ghostty，但 Edge last focused window 被改到安静窗，飞书页 `focused` 变成 false。这不是安全导航，不要再用。`POST /v1/browser/select` 交还飞书页 `1828171512` 后，修复期间 16 次采样都是 Ghostty。工作页 `1828173126` 仍 `active=true`、`focused=false`。type HTTP 200，`typed=true`，`via=content_message`，`input_path=dom_type`，回执没有 `background_action`。extract 读回 `vcu-br001-1792019564`。scroll `dy=640` HTTP 200，`scrolled=true`，`scroll_before=0`，`scroll_y=640`。飞书页地址未变，哔哩哔哩页未换窗。type 和 scroll 各 2 次采样，间隔 0.203 秒，不能写成绝对零闪烁。夹具进程已退出，不要重载该标签。keypress 和扩展 snapshot 记 not_run。Chrome、断连和干净 SHA 仍缺，源状态仍 planned，不能完成。证据 `.local/browser-cu/br-001-stay-active-input.json`。

2026-10-15 已 active 的安静窗工作页截图走原地 `captureVisibleTab`，没有再 `tabs.update`。本轮没有改扩展，没有重载。点名 example.com `1828173126` 的 screenshot HTTP 200，`capture_window_id=1828173041`，`background_capture=false`，`focused=false`，PNG 是 example.com，不是飞书。hover HTTP 200，`hovered=true`，`via=content_message`，回执没有 `background_action`。`dy=0` 滚动 HTTP 200，`scrolled=false`，只证明原地消息。type HTTP 400，body 不是可编辑元素，detail `focused=false`，不是成功输入。extract 和 observe HTTP 200，页仍是 example.com。每次前后飞书页 `1828171512` 仍 focused，哔哩哔哩页未换窗，工作页仍 active 且不 focused。前台采样都是 Ghostty，每次 2 到 4 次，间隔约 0.16–0.18 秒，不能写成绝对零闪烁。keypress 和扩展 snapshot 没有不启动会话的浏览器 HTTP 路由，会话列表为空，没有启动会话，记 not_run。daemon `10393` 未重启。Chrome、断连和干净 SHA 仍缺，源状态仍 planned，不能完成。证据 `.local/browser-cu/br-001-stay-active-actions.json`。

2026-10-15 已在安静窗的 Agent 页动作后保持 active，不再交还给 `about:blank`。组保持展开，避免 Edge 折叠组时取消活动页，下一次不必 `tabs.update({active:true})` 再抬窗。用户窗里的 VCU 页仍搬入后归还。单测 65 通过。扩展 SHA256 `3c67eab85d30d8fd373f54b76aec3e6e87f444b43395b118d88dcd63bab3a866`。`allow_page_reload=false` 重载后 ping `quiet_keep=stay-active`。点名 example.com `1828173126` 连续两次 `body` 点击 HTTP 200；之后工作页 `active=true`，VCU 组展开，仍在安静窗 `1828173041`。已 active 后再点一次，`via=content_message`，没有 `background_action`。飞书页 `1828171512` 仍 focused，哔哩哔哩页未换窗，前台采样都是 Ghostty。采样间隔约 0.15 秒，不能写成绝对零闪烁。前两次点击的扩展层回执没记全，不能写成 `background_action=false`。daemon `10393` 未重启。Chrome、断连和干净 SHA 仍缺，源状态仍 planned，不能完成。证据 `.local/browser-cu/br-001-stay-active.json`。

目标是确认 macOS 上 USER Chrome、USER Edge、daemon 与 unpacked lens 的实际连接、版本、轮询和重载恢复；不新增网页能力。2026-10-14 发现观察会激活不可见标签并切走用户当前页。修复是不在 observe 里 select。2026-10-14 Edge 真机已确认打开、点击、输入、悬停、提取、真实滚动和像素观察都不切用户当前页，工作面是同窗口折叠的 VCU 组。这台 Edge 没有 `tabs.captureTab`；后台截图只把目标页短暂移到未聚焦安静窗口。视口在安静窗口读取并校正，放回时保持折叠，不在用户窗口展开 VCU 组。2026-10-15 真机 `capture_window_id=1828172973`，不是用户窗口 `1828171349`；采样期间没有展开用户组，没有抢走飞书页，前台保持 Ghostty。证据是 `.local/browser-cu/br-001-collapsed-capture.json`。滚动成功必须看到 page-world `window.scrollY` 变化。未连接浏览器的请求拒绝，不串到另一个浏览器。2026-10-15 daemon `97464` 上，`allow_page_reload=false` 的重载是 `reload_self`，不是可见页。后台打开进入同一窗口折叠 VCU 组，`collapsed=true`，不激活飞书页 `1828171512`，不抢 Ghostty 前台。Chrome 未运行。证据是 `.local/browser-cu/br-001-actions.json`、`.local/browser-cu/br-001-quiet-reload.json` 和 `.local/browser-cu/br-001-collapsed-capture.json`。2026-10-15 官方 `scripts/poc_browser_br_001_macos.py` 的 Edge 基线再次 pass。安静窗不再在成功路径删除或最小化，空闲时缩到角落并复用。Edge 把 `360x220` 夹成 `500x375`，CG `20648` 在 `1560,736`，不是新增全尺寸在屏 `about:blank`。截图 `capture_window_id=1828173041`，不是用户窗口 `1828171349`；采样 31 次，`fixture_title_seen=true`，`user_group_expansions=0`。飞书页 `1828171512` 未变，前台保持 Ghostty。Chrome 记 not_run，`completion_allowed=false`。证据是 `.local/browser-cu/br-001.json` 和 `.local/browser-cu/br-001-corner-park.json`。仍缺 Chrome 和干净 SHA，这还不是 BR-001 完成。2026-10-15 空闲安静窗改为请求 Edge 最小值 `500x375`，并沉到 Edge 允许的最低位置 `1420,890`。再往下会被拒绝。写回用户窗 bounds 不改变叠放，进程外 `CGSOrderWindow` 返回 1000。停放后由 `scripts/quiet_window_restack.py` 把用户窗 `set index to 1`，飞书 CG `7243` 压过安静窗 CG `20648`，不抢 Ghostty。最小后台截图仍复用 `1828173041`，不是用户窗口 `1828171349`。证据 `.local/browser-cu/br-001-restack.json`。2026-10-15 launchd 按次 `osascript` 会卡住 Edge Apple Event，已卸掉，不能为它弹授权。回排改为当前 GUI 会话的 `scripts/quiet_window_restack_watch.sh` 拉起 `.local/browser-cu/quiet_window_restack`；监听退出后由同一 watchdog 再拉起。扩展停放和放大后都请求回排。最小后台截图仍复用 `1828173041`，不是用户窗口 `1828171349`。飞书 CG `7243` 在安静窗 CG `20648` 前面，前台保持 Ghostty。证据 `.local/browser-cu/br-001-session-restack.json`。2026-10-15 回排改为按窗口 id。`/stage` 只改安静窗 bounds，再只把用户窗 `set index to 1`，不写用户窗 bounds，也不再 `set index of quiet to 2`。02:29 最小后台截图仍复用 `1828173041`，不是用户窗口 `1828171349`；126 次采样没有盖住飞书，前台保持 Ghostty。本轮只读复核安静窗 CG `20648` 在 `1420,915` 的 `500x375`，飞书 CG `7243` 在前面。证据 `.local/browser-cu/br-001-window-id.json`。源状态仍 planned，不能完成。随后失败恢复不再 `windows.update({focused:true})`，已停放的安静窗不再二分重探。扩展 SHA256 `6e38016af7ce1fab85bc541bd8fdc4a5b56ffd56206508c2de17ae50e90d2fd6`。`reload_self` 后飞书页和 Ghostty 未变，安静窗 CG `20648` 仍在 `1420,915`。单测 38 项通过。源状态仍 planned。2026-10-15 安静窗二分探测只走 `/stage`；失败即停止，不再用 `chrome.windows.update` 把安静窗抬过飞书。单测 39 项通过。扩展 SHA256 `b31d3350c0b9c597e65b7fe6f2386ec495371157ce7081e0ef770dc27fc7b45b`。`reload_self` 后 ping `quiet_probe=stage-only`。飞书页 `1828171512` 仍活动，Ghostty 仍前台，安静窗 CG `20648` 仍在 `1420,915`。Chrome 与干净 SHA 仍缺。源状态仍 planned，不能完成。2026-10-15 安静窗停放和放大不再回退 `chrome.windows.update`。`/stage` 失败就拒绝后台截图，不把安静窗抬过飞书。单测 40 项通过。扩展 SHA256 `990617b88b1c76686996b5d9853ee827f5bc4fa5966fbc2346c9e52f0b28effc`。`reload_self` 后 ping `quiet_place=stage-only`。飞书页 `1828171512` 仍活动，Ghostty 仍前台，安静窗 CG `20648` 仍在 `1420,915`。源状态仍 planned，不能完成。2026-10-15 `/stage` 改为先回排用户窗，再改安静窗 bounds，随后再回排两次；不设置安静窗 index。缺省 Agent 窗不再建 `1100x800`，只复用或在角落建未聚焦小窗并立即回排。加入折叠 VCU 组后重新折叠。单测 42 项通过。扩展 SHA256 `d841a5555a071bc682f203a1d69b37deea7da876fb3ed9179574805a34fe60d0`。`reload_self` 后 ping `quiet_stage=restack-first`。飞书页 `1828171512` 仍活动，Ghostty 仍前台，安静窗仍在 `1420,915`。本轮没有重跑放大截图。源状态仍 planned，不能完成。2026-10-15 放大不再复制用户窗原点。`quietStageBounds` 和视口校正从停放角落往外长，缺坐标不再退回 `0,30`。覆盖用户页超过 25% 就拒绝，不回退 `chrome.windows.update`。单测 42 项通过。扩展 SHA256 `dba4f34750f06c5f887dc4cbccfd0e7df723e656f0a96e13f0dd6642e1e42f33`。`reload_self` 后 ping `quiet_stage=parked-origin`。飞书页 `1828171512` 仍活动，Ghostty 仍前台，安静窗仍在 `1420,915`。同坐标 `/stage` 返回 `ok`，没有抬窗。没有重跑放大截图。Chrome 未运行，记 not_run。源状态仍 planned，不能完成。2026-10-15 隐式动作只选折叠 VCU 组；正在看的非 VCU 页拒绝 click、click_point、type、hover、scroll、navigate、close_tab。`dry_run` 放行，活动页截图保持只读。`quietStageBounds` 改为停放尺寸，不再放大。单测 43 项通过。扩展 SHA256 `e2bc62c9937909221ebecb8de543fc801c20a0ba211e350a3d4adf22d3fa82a7`。`reload_self` 后 ping `quiet_stage=parked-size`。飞书页 `1828171512` 仍活动，Ghostty 仍前台，安静窗 CG `20648` 仍在 `1420,915` 的 `500x375`。折叠 VCU 组打开 example.com 后，显式点击飞书被拒绝，隐式点击打到该组，随后关闭。bounds 未漂移，没有再打 `/stage`，也没有重跑放大截图。Chrome 未运行，记 not_run。源状态仍 planned，不能完成。2026-10-15 服务端补上同一条边界：非 `dry_run` 的隐式 click/type/hover/scroll 若 `last_observe` 是正在看的非 VCU 页，放开该 tab，`tab_id_source=agent_group`，请求不带该 tab。`dry_run`、extract、screenshot、wait、显式 tab、viewport/capture 点击仍绑 `last_observe`。`release_reading_page_only_for_live_last_observe` 1 通过，`snapshot_merges_extension_tabs_for_empty_ax_edge` 1 通过。daemon `97464` 未重启，这段改动未加载，不能写成真机已生效。2026-10-15 扩展 SHA256 `23e889b70e13b0d62c3de7ce7bc1460de08d7fb686a65968ea3d403bc2e3dba8` 已装入 `~/.vcu/lens-extension`。`allow_page_reload=false` 的 `reload_self` 返回 `reloaded=1`，没有 `reload.html`。再 ping 是 `quiet_act=agent-group`。飞书页 `1828171512` 仍是用户窗 `1828171349` 的活动且 focused 页，Ghostty 仍前台，安静窗 CG `20648` 仍在 `1420,915`。证据 `.local/browser-cu/br-001-agent-group-reload.json`。安静窗 `about:blank` 也被标成 `page_being_read`，但它不是 focused，这不是切页。服务端绑定仍未加载。2026-10-15 列表把 `quietCaptureWindowId` 也算作 Agent 窗。停放安静窗不再被标成正在看的页；focused 用户页仍拒绝动作。单测 45 项通过。扩展 SHA256 `62e7eeec97f572afe4a8777c1e99ad91f4ece68da5eb1cf4a600904990bed2ae`。`reload_self` 后 ping `quiet_own=quiet-window`。飞书页 `1828171512` 仍 focused 且 `page_being_read=true`。安静窗 `1828173042` 是 `agent_owned=true`、`page_being_read=false`。Ghostty 仍前台，安静窗 CG `20648` 仍在 `1420,915`。证据 `.local/browser-cu/br-001-quiet-own-reload.json`。daemon `97464` 未重启，服务端绑定仍未加载。Chrome 未运行，记 not_run。源状态仍 planned，不能完成。2026-10-15 旧 daemon 已退出。daemon `10393` 父进程 1，听 `127.0.0.1:17890`，二进制晚于服务端改动。`pixels=false` observe 仍看飞书页且不切页。没有 Agent http 页时隐式 click 拒绝该页；折叠 VCU 组里的夹具被不带 `tab_id` 的 click 命中，`tab_id_source=agent_group`，extract 读回 `hits-1`，夹具已关。飞书页 `1828171512` 仍 focused，Ghostty 仍前台。证据 `.local/browser-cu/br-001-daemon-agent-group.json`。2026-10-15 不带 `tab_id` 的 type/hover/scroll 留在折叠 session 组，不切飞书页。`br-001-dom-actions.json` 紧随 extract 仍是 `y-0`，不能当滚动证明。`br-001-scroll-persist.json` 的 page-world 读回先是 `scroll_y=480`，`dy=0` 再读仍是 480，随后 extract 为 `y-480/top-480`。组保持折叠，前台保持 Ghostty。2026-10-15 显式截折叠组夹具，`capture_window_id=1828173041`，`user_group_expansions=0`，画面是夹具不是飞书页。同一路径的视口点击 `pressed=true`，extract 读回 `hits-1`，不切飞书页。不带 `tab_id` 的截图仍绑 last observe。2026-10-15 后台截图和滚动重试不再把非 VCU/session、且不在 Agent 窗里的用户页搬进安静窗。单测 47 项通过。扩展 SHA256 `228fdfd3`。`reload_self` 后 ping `quiet_move=agent-surface`。折叠 session 组夹具截图仍是安静窗 `1828173041`，画面是夹具不是飞书页；飞书页 `1828171512` 仍 focused，Ghostty 仍前台。证据 `.local/browser-cu/br-001-quiet-move.json`。Chrome 与断连仍是 not_run，没有干净 SHA。源状态仍 planned，不能完成。2026-10-15 只读复核未重载扩展：ping 仍是 `quiet_move=agent-surface`，单测 47 通过。飞书页 `1828171512` 仍 focused，哔哩哔哩页未换窗，Ghostty 仍前台。证据 `.local/browser-cu/br-001-quiet-move-recheck.json`。Chrome、断连和干净 SHA 仍缺，源状态仍 planned，不能完成。2026-10-15 已记录 session 组必须标题匹配才可搬进安静窗，组号复用到用户组 `1`/`3` 时拒绝。标题匹配的折叠组是隐式工作面。单测 49 通过。`allow_page_reload=false` 重载后 ping `quiet_session=match-title`。飞书页 `1828171512` 仍 focused，Ghostty 仍前台。daemon 未重启，服务端 `agent_surface` 未加载。证据 `.local/browser-cu/br-001-session-title.json`。Chrome、断连和干净 SHA 仍缺，源状态仍 planned，不能完成。2026-10-15 正在看的活动页不再 `tabs.move`。记成 Agent 窗的用户窗口不再整窗授权搬移。分组、keypress、snapshot 拒绝正在看的页。open 拒绝进入用户组 `1`/`3` 或含正在看的页的组。单测 52 通过。扩展 SHA256 `b079409a1c33751e6bd595c1f28600ce41b11083f36ffd61d5dd2febdf54a9b3`。`allow_page_reload=false` 重载后 ping `quiet_reading=never-move`。飞书页 `1828171512` 仍 focused，哔哩哔哩页 `1828171351`、`1828171545` 未换窗，Ghostty 仍前台。证据 `.local/browser-cu/br-001-never-move.json`。daemon `10393` 未重启，服务端 `agent_surface` 未加载。Chrome、断连和干净 SHA 仍缺，源状态仍 planned，不能完成。2026-10-15 运行中的 daemon 若仍把正在看的页绑进 click/type/hover/scroll/keypress/snapshot，扩展改打已有折叠 VCU/session 组，返回 released_reading_page 和 tab_id_source=agent_group。没有 Agent 页时仍拒绝。navigate、close_tab、click_point 不改打别的页。dry_run 和活动页截图仍可检查该页但不移动它。单测 52 通过。扩展 SHA256 `8b6669a7aa7f671239f3e8f4afddf06af441907de51ab9ff698d4771efce38a0`。不重载 ping 仍是 `quiet_release=agent-group`，同时 `quiet_reading=never-move`。只读复核飞书页 `1828171512` 仍 focused，哔哩哔哩页未换窗，Ghostty 仍前台。证据 `.local/browser-cu/br-001-release-reading.json` 和 `.local/browser-cu/br-001-release-reading-recheck.json`。没有对飞书页发送会执行的动作。当前没有折叠 VCU/session 的 http 页；安静窗 about:blank 不可注入。因此若请求仍带飞书页，扩展会拒绝，不会改打，也不会搬走。本轮没有发送该动作。2026-10-15 navigate 若目标是正在看的页，不再 tabs.update 该页。http(s) URL 改在已有安静窗的折叠 VCU 组打开；没有安静窗时才在用户窗折叠 VCU 组打开，并恢复原活动页。close_tab/click_point 仍不改打。没有 Agent http 页时 click/type/hover/scroll/keypress/snapshot 仍拒绝。单测 55 通过。扩展 SHA256 `e91caf3e079ed3d002970d70b04e42583923b1d0c73515ba8580e6a8c36ecf8c`。`allow_page_reload=false` 重载后 ping `quiet_nav=agent-group`。飞书页 `1828171512` 仍 focused，地址未变，哔哩哔哩页未换窗，Ghostty 仍前台。没有对飞书页发送 navigate。证据 `.local/browser-cu/br-001-nav-agent-group.json`。daemon `10393` 未重启，服务端改打未加载。Chrome、断连和干净 SHA 仍缺，源状态仍 planned，不能完成。daemon `10393` 二进制是 `04:07`，`login_state.rs` 是 `04:55`，服务端 `agent_surface` 和 `release_reading_page_target` 未加载，不能写成真机已生效。Chrome 未运行，记 not_run。断连重连未停 daemon，记 not_run。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。源状态仍 planned，不能完成。2026-10-15 没有 Agent http 页时，点名正在看的页的 click/type/hover/scroll/keypress/snapshot 改为在安静窗优先的折叠 VCU 组打开 `https://example.com/` 再改打，不激活该页。单测 56 通过。扩展 SHA256 `8eda9087c4cb7494b0317dfbd62845560bf32fec57b8cf324786943aa0ae9634`。`allow_page_reload=false` 重载后 ping `quiet_work=ensure-group`。飞书页 `1828171512` 仍 focused，哔哩哔哩页未换窗，Ghostty 仍前台。没有对飞书页发送 click 或 navigate，真机确保路径记 not_run。证据 `.local/browser-cu/br-001-ensure-group.json`。daemon `10393` 未重启，服务端改打未加载。Chrome、断连和干净 SHA 仍缺，源状态仍 planned，不能完成。2026-10-15 不带 tab_id 且没有 Agent http 页时，click/type/hover/scroll/keypress/snapshot 也在安静窗优先的折叠 VCU 组打开 `https://example.com/` 再执行。dry_run 不新开页。单测 57 通过。扩展 SHA256 `918ecb2940ac9cb49fed2088406aeefa659f5e0c96e4b83434f03d260193316a`。`allow_page_reload=false` 重载后 ping `quiet_implicit=ensure-group`。飞书页 `1828171512` 仍 focused，Ghostty 仍前台。没有对飞书页发送动作。证据 `.local/browser-cu/br-001-implicit-ensure.json`。daemon `10393` 未重启，服务端改打未加载。Chrome、断连和干净 SHA 仍缺，源状态仍 planned，不能完成。

2026-10-15 默认 open 改为优先停放安静窗的折叠 VCU 组，并且不激活新标签，避免 Edge 把该窗抬到正在看的页前面。没有安静窗时才退回用户窗折叠组。单测 58 通过。扩展 SHA256 `e77d6a5fff1a154d863090ca58c06cc01aabef054d171690c1680e46c64e19af`。`allow_page_reload=false` 重载后 ping `quiet_open=agent-group`。真机 `POST /v1/browser/open` 打开 `https://example.com/`，新页 `1828173126` 在安静窗 `1828173041` 的折叠 VCU 组，`active=false`，`page_being_read=false`。飞书页 `1828171512` 仍 focused，地址和窗口未变，哔哩哔哩页未换窗，Ghostty 仍前台。证据 `.local/browser-cu/br-001-open-quiet.json`。daemon `10393` 未重启，服务端改打未加载。Chrome、断连和干净 SHA 仍缺，源状态仍 planned，不能完成。

代码落点：`browser/extension.rs` 的 client key、poll/health/reload fallback，`login_state.rs`/`api.rs` 的 USER 分类，`extension/background.js` 的 bootstrap/hello/poll/reload_self，`extension/reload.js`，CLI/MCP 的 `ping`、`install-lens --reload` 和 next 文案。

实施步骤：

1. 记录 MAC-001 给出的 OS/架构、daemon/extension 版本和 Chrome/Edge USER 判定，不创建空 Agent profile。
2. 先跑 `vcu browser ping --json`、`vcu browser login-state --json`、`vcu doctor`，再用 `install-lens --reload` 复核每个已连接 browser。
3. 验证 `reload_self` 不响应时只打开对应 `reload.html`，等待新的 pong 后清理 reload 标签；不点 Allow、不把启动成功当重载成功。

正向验收：分别覆盖 Chrome 单连、Edge 单连和双连接；USER 扩展、browser 名和 poll 年龄可解释，重载后版本/health 恢复。反向验收：无扩展、stale SW、Agent profile、非 USER 前台和失联均诚实失败；缺浏览器环境记 blocked/not-run，不能用一个浏览器通过覆盖整个基线。不得改绑另一浏览器、要求点击 Allow、退回 CDP。

现有门禁：`rtk proxy make check`、`rtk proxy node --test extension/tests/*.test.cjs`、`rtk cargo test -p vcu-server --test extension_bridge --test browser_gates --test extension_bootstrap`、`scripts/poc_login_state.sh`、`scripts/poc_extension_bootstrap.sh`。拟新增 `scripts/poc_browser_br_001_macos.py`，但本文件编写时不存在。

证据：`.local/browser-cu/br-001.json`（拟），附 ping/login-state/reload/pong 输出和 `MAC-001` 报告引用；若无用户浏览器只记 SKIP，不记通过。

2026-10-15 安静窗激活后立刻回排，搬回用户窗前先交还原活动标签，避免替换正在看的页。单测 59 通过。扩展 SHA256 `b87f48b77380aa45392f30d6d276ee86fe9a0620dc60b6c9143508586cc87ce9`。`allow_page_reload=false` 重载后 ping `quiet_raise=restack-after-activate`。飞书页 `1828171512` 仍 focused，example.com 页 `1828173126` 仍在安静窗折叠 VCU 组。点名该工作页的截图和 `dy=0` 滚动分别超时，真机激活回排记 `not_run`。daemon `10393` 未重启。Chrome、断连和干净 SHA 仍缺，源状态仍 planned，不能完成。证据 `.local/browser-cu/br-001-quiet-raise.json`。
2026-10-15 非活动工作页的原地 `executeScript` 限制在 800ms。超时后，已在安静窗的 Agent 标签只在该窗激活并回排；用户窗里的 VCU 标签仍搬入安静窗再归还；非 VCU 页拒绝且不搬。单测 61 通过。扩展 SHA256 `edf575956b029c1b11101d04fac3075a430689d9c51e9c7152cf0019898bf219`。`allow_page_reload=false` 重载后 ping `quiet_inject=activate-then-retry`。点名 example.com `1828173126` 的截图 HTTP 200，捕获窗口 `1828173041`，PNG 是 example.com。飞书页 `1828171512` 仍 focused，哔哩哔哩页未换窗，Ghostty 仍前台。`dy=0` 滚动 HTTP 200，但 `background_scroll=false`，只证明截图之后的原地读取，不单独证明滚动挂起回退。daemon `10393` 未重启。Chrome、断连和干净 SHA 仍缺，源状态仍 planned，不能完成。证据 `.local/browser-cu/br-001-quiet-inject.json`。
2026-10-15 非活动工作页的 content messaging 限时后，只在安静窗激活再重试并回排。`click`、`type`、`hover`、`click_point` 走这条路径。`dry_run` 不激活。页面返回 `ok:false` 不重放。单测 64 通过，0 失败。扩展 SHA256 `583e9a74460d4d2c3fbee28237b576ed51eac410199a3cc9fee79260d8324df7`，与 `~/.vcu/lens-extension/background.js` 一致。ping `quiet_message=activate-then-retry`，同时保留 `quiet_inject=activate-then-retry` 和 `quiet_reading=never-move`。点名 example.com `1828173126` 的 `body` 点击 HTTP 200，`pressed=true`，`via=content_message`，`background_action=true`，`focused=false`，`tab_id_source=explicit`。飞书页 `1828171512` 仍在用户窗 `1828171349` 且 focused，地址未变。哔哩哔哩页未换窗。工作页仍在安静窗 `1828173041` 的折叠 VCU 组，`active=false`。OS 前台仍是 Ghostty。先前 `h1` 点击 HTTP 400，原因是 example.com 没有该选择器，不能当成回退证据。这次没有在动作期间采样，不能写成零闪烁。daemon `10393` 未重启，服务端 `release_reading_page_target` 未加载。Chrome 未运行，记 not_run。断连未停 daemon，记 not_run。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。源状态仍 planned，不能完成。证据 `.local/browser-cu/br-001-quiet-message.json`。

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
