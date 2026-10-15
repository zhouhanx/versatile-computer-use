# 会话交接

## 2026-10-15：BR-001 脏树基线与断连重连通过，仍不能完成

2026-10-15 官方 POC `scripts/poc_browser_br_001_macos.py` 在脏工作树上 `ok=true`，`completion_allowed=false`。Chrome 和 Edge 基线都 pass。受保护页没被替换：Edge Apple 页 `1828173166`、Chrome 必应页 `1934573032` 仍 focused。前台始终是 Hearthstone。夹具开在各自安静窗折叠组，测完已关，没有落回正在看的窗。断连停掉当时的 daemon 后 ping 诚实失败，再按 `target/debug/vcu-daemon --user-dir ~/.vcu` 拉起，USER 扩展重连，`quiet_open=own-window`。没有冷启动，没有点 Allow，没有改 profile。扩展单测 104 通过、0 失败。`background.js` SHA256 `21c52d21ac682bb9b630a1211688462f87868e64fc5de3af36c6428b6a9ffb0c`。keypress、snapshot、现场挪窗和 live stale SW 仍 not_run。Edge 截图采样没有记录受保护 CG 窗口 id，不能补写成几何已证明。提交前 HEAD 是 `e6fa5e9`，工作树脏。源状态仍 planned，不能完成。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。证据 `.local/browser-cu/br-001.json`、`.local/browser-cu/br-001-reverse.json`。

- 反向探针 `.local/browser-cu/br-001-reverse.json`：`pass=true`。停服后 health 为 false，CLI ping 不是 ok。重启后 `extension_profile=user`，焦点页和前台都没变，Chrome/Edge 主进程没被重新拉起。
- 官方 POC 随后又停服一次并重连，`reverse_disconnect=pass`，`reconnect_after_daemon_restart=pass`，`no_cold_start=pass`。结束后 daemon 是 `target/debug/vcu-daemon --user-dir ~/.vcu`。
- 夹具标签已关。用户窗里旧的折叠 `example.com` `1828173152` 不是本轮夹具，没有关。
- 这不是完成。干净 SHA 复跑且 `completion_allowed=true` 之前，源状态保持 planned。


## 2026-10-15：BR-001 折叠组提取读到真实段落，h1 缺失不再谎称没读到

当前正在看的页是 Apple 支持页 `1828173166`，不是飞书页。工作页 `1828173152` 在用户窗 `1828171349` 的折叠 VCU 组 `2112453533`。`example.com` 现在没有 `h1`，标题文字由 `/s.js` 写成段落。上一轮把选择器落空写成 `extract did not read the page`，这是假失败。

- `node --test extension/tests/background.test.cjs`：75 通过，0 失败。已渲染且正文有文本、但选择器没有文本时，返回 `selector matched no text` 和 `read_page=true`，不展开组，不重载，不编造 `Example Domain`。空文档仍走展开或原地重载。
- 工作树和 `~/.vcu/lens-extension/background.js` SHA256 都是 `429a31d79a47b2cbd48dcad081d8cb6277bfb8e2e9333a9491004d5a62c2949a`。`allow_page_reload=false` 重载返回 `reloaded=1`。再 ping 是 `quiet_extract=document-idle`。
- 点名 `1828173152` 的 `p` 提取 HTTP 200，`count=6`，首条是 `该域名仅用于文档示例，无需获得许可。这并非一项服务，请勿将其用于测试和监控目的。`，`page_url=https://example.com/`。同一页的 `h1` 提取 HTTP 400，detail 是 `selector matched no text: sel=h1 url=https://example.com/`，`read_page=true`，`stage=idle`。没有写成读取失败，也没有编造 `h1`。
- 重载和两次提取前后，Apple 页 `1828173166` 都是 focused，地址 `https://support.apple.com/zh-cn/111111` 没变。工作页仍 `active=false`。VCU 组仍折叠。标签 id 集合没变。没有 `tabs.update` 正在看的页，没有建窗，没有用 AppleScript。
- Chrome 未运行，记 `not_run`。断连未停 daemon `10393`，记 `not_run`。现场挪窗和 CG 记 `not_run`。keypress 和 snapshot 仍 `not_run`。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。源状态仍 planned，不能完成。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。

证据是 `.local/browser-cu/br-001-quiet-extract.json` 和 `.local/browser-cu/br-001-selector-miss.json`。


## 2026-10-15：BR-001 运行中的扩展不再切走正在看的页

用户要求浏览器操作留在自己的标签组，不移动正在使用的页面。上一轮源码已拒绝建窗、激活和 AppleScript，但安装目录还是旧服务工作者：ping 是 `quiet_raise=restack-after-activate`，`quiet_inject=activate-then-retry`。本轮只装入这个隔离，不用 AppleScript 挪窗。

- `extension/tests/background.test.cjs`：71 通过，0 失败。停放重叠窗不再要求零 fetch；bootstrap 请求不是 helper。断言改为没有 `/stage` 或 `/restack`，几何和正在看的页保持不动。`select_tab` 不再返回 `activated=true`，因为这条路径没有 `tabs.update`。
- 工作树和 `~/.vcu/lens-extension/background.js` SHA256 都是 `6dd469abba48b0bd141cb57856436ea7cab502aa4b4627b6ee01561f55353278`。`allow_page_reload=false` 的重载返回 `reloaded=1`。再 ping 是 `quiet_raise=never`，`quiet_helper=no-applescript`，`quiet_park=dock-clear`，`quiet_inject=in-place`，`quiet_message=in-place`。
- 重载前后飞书页 `1828171512` 都是用户窗 `1828171349` 的活动且 focused 页，地址没变。哔哩哔哩页 `1828171351`、`1828171545` 未换窗。工作页 `1828173126` 仍在安静窗 `1828173041` 的 VCU 组 `48700119`，`active=true`，`focused=false`，地址没变。没有重载这个夹具页。
- 点名工作页的 select HTTP 400，`activated=false`，错误是 `select refused without moving the page being read`。飞书页仍 focused。System Events 前台重载前后都是 ghostty。没有对飞书页发送可执行动作。
- 现场挪窗和 CG 几何本轮记 not_run。没有 Quartz 模块，不用会激活 Edge 的 AppleScript。不能把上一轮的 `1420,880` 写成这次又测过。
- Chrome 未运行，记 not_run，没有冷启动。断连未停 daemon `10393`，记 not_run。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。keypress 和 snapshot 仍 not_run。源状态仍 planned，不能完成。
- 没有自动领取下一项：`BR-001` 仍是当前领取，AWR ready 被 `active_claim` 挡住。用户要求先完成 `BR-001`。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。

证据是 `.local/browser-cu/br-001-tab-group-no-interrupt.json`。

## 2026-10-15：BR-001 停放请求改为贴用户窗底边，现场窗未挪

用户要求浏览器操作留在自己的标签组，不移动正在使用的页面。本轮只改停放公式和单测，没有重载扩展，没有重启 daemon，没有冷启动 Chrome，没有用会激活 Edge 的 AppleScript 挪现场窗。

- `quietParkBounds` 的 top 改为用户窗底边 `workBottom`，不再用 `screenHeight - 200`。那条旧公式会压进正在看的页 76px。`quietDockBounds` 与它相同。ping 增加 `quiet_park=dock-clear`，运行中的扩展还没有这个字段。
- `node --test extension/tests/background.test.cjs`：71 通过，0 失败。新增回归要求停放请求不与用户窗重叠，已经贴底的安静窗不再 `/stage`。
- 工作树与 `~/.vcu/lens-extension/background.js` SHA256 都是 `eb3ac93dba9ea4d16ae24dd47e91862c412c8b15900293e080b1a9b7912f2f6e`。没有重载。ping 仍是旧服务工作者，没有 `dock-clear`，仍有 `quiet_prefer=quiet-window`。
- 只读复核：飞书页 `1828171512` 仍是用户窗 `1828171349` 的活动且 focused 页，地址没变。工作页 `1828173126` 仍在安静窗 `1828173041` 的 VCU 组 `48700119`，`active=true`，`focused=false`，组仍展开。哔哩哔哩页未换窗。System Events 前台是 ghostty。CG 顺序是 Ghostty `2039`、飞书窗 `7243` `0,30` 的 `1920x926`、安静窗 `20648` `1420,880` 的 `500x375`。几何上仍重叠 76px，但排在飞书窗后面，这次没有盖住。
- 现场挪到 `1420,956` 记 not_run。AX 读位置返回 `-25205`。System Events 看到 Edge 窗口数为 0，读的时候没有抢走 ghostty。`chrome.windows.update` 会抬起安静窗。`tell application "Microsoft Edge"` 会激活 Edge。没有确认不抢前台的移动方式，所以没有挪。
- Chrome 主进程不在，记 not_run，没有冷启动。断连未停 daemon `10393`，它仍听 `127.0.0.1:17890`。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。keypress 和 snapshot 仍 not_run。源状态仍 planned，不能完成。
- 没有自动领取下一项：`BR-001` 仍是当前领取，AWR ready 被 `active_claim` 挡住。`CORE-001` 只是可领取。用户要求先完成 `BR-001`。没有 `BR00`。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。

证据是 `.local/browser-cu/br-001-dock-clear.json`。


## 2026-10-15：BR-001 工作页点击不切飞书页，源状态仍不能完成

用户要求浏览器操作留在自己的标签组，不移动正在使用的页面。本轮没有改代码，没有重载扩展，没有重启 daemon，没有冷启动 Chrome。

- 扩展 SHA256 `5a736eba258ebb0e2517eee73f46049b345eac7c277b3352a30ed72147b1f031`，工作树与 `~/.vcu/lens-extension/background.js` 一致。ping 版本 `0.2.8`，含 `quiet_prefer=quiet-window`、`quiet_nav_keep=stay-active`、`quiet_open_reuse=in-place`、`quiet_reading=never-move`。上一节记录的 `0f2ee3c8` 不是当前文件哈希。
- `node --test extension/tests/background.test.cjs`：70 通过，0 失败。
- 点名工作页 `1828173126` 的 `input#marker` click HTTP 200，`pressed=true`，`via=content_message`，`input_path=dom_click`，`tag=INPUT`，`focused=false`。回执没有 `background_action`，不能写成 false。没有 `released_reading_page`。
- 飞书页 `1828171512` 前后都是用户窗 `1828171349` 的活动且 focused 页，地址没变。Edge 里该窗 index 仍是 1，bounds `0,30,1920,956`。安静窗 `1828173041` index 2，bounds `1420,880,1920,1255`，没有盖住飞书窗。工作页仍 `active=true`、`focused=false`，VCU 组 `48700119` 仍展开。哔哩哔哩页 `1828171351`、`1828171545` 未换窗。
- 前台采样 2 次都是 Ghostty，不能写成绝对零闪烁。没有对飞书页发送可执行动作，没有重载 `1828173126`。
- Chrome 主进程不在，记 not_run，没有冷启动。断连未停 daemon `10393`，记 not_run。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。`/v1/browser/key` 仍只计划并返回 `pressed=false`，不调用扩展 keypress。没有不启动会话的 snapshot 路由。这两项记 not_run。源状态仍 planned，不能完成。
- 没有自动领取下一项：`BR-001` 仍是当前领取，AWR ready 被 `active_claim` 挡住。`CORE-001` 只是可领取。用户要求先完成 `BR-001`，而 Chrome、断连和干净 SHA 仍缺。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。

证据是 `.local/browser-cu/br-001-quiet-prefer-recheck.json`。

## 2026-10-15：BR-001 带 tab_id 的 open 原地更新未聚焦工作页

用户要求浏览器操作不要移动正在使用的页面，要在自己的标签组里工作。运行中的 daemon 没有 `POST /v1/browser/navigate`。没有启动会话，没有重启 daemon。

- `extension/tests/background.test.cjs` 68 项通过，0 失败。带 `tab_id` 的 `open_tab` 原地更新未聚焦 Agent 页，不新建标签，不 `windows.update({focused:true})`，不调用 quiet helper `/restack`。正在看的页改在安静窗折叠 VCU 组打开。非 Agent 用户页拒绝且不改。
- 扩展 SHA256 `0f2ee3c8c7e0c339c7e11ed90321c82b9512f223998bf1736cf87a16ea078a3b`，工作树与 `~/.vcu/lens-extension/background.js` 一致。`allow_page_reload=false` 重载返回 `reloaded=1`。ping `quiet_open_reuse=in-place`，同时保留 `quiet_keep=stay-active` 和 `quiet_reading=never-move`。版本 `0.2.8`。
- 真机 `POST /v1/browser/open` 点名 `1828173126`，URL `http://127.0.0.1:58472/inplace`，HTTP 200，`in_place=true`，`reused=true`，`active=true`，`window_id=1828173041`。没有新建标签。标题读回 `VCU BR-001 in-place`。
- 随后点名该页 `input#marker` type HTTP 200，`typed=true`，`via=content_message`，`input_path=dom_type`，`focused=false`。回执没有 `background_action`，不能写成 false。extract HTTP 200，读回 `vcu-br001-inplace-type`。
- 飞书页 `1828171512` 重载、打开和输入后仍是用户窗 `1828171349` 的活动且 focused 页，地址没变。哔哩哔哩页 `1828171351`、`1828171545` 未换窗。没有对飞书页发送可执行动作，没有关闭 `1828173126`。打开期间 4 次前台采样都是 Ghostty，最大间隔 0.24 秒，不能写成绝对零闪烁。
- 夹具进程在 URL 确认后已停。不要重载 `1828173126`，否则会变成连接失败页。keypress 和扩展 snapshot 仍 not_run。daemon `10393` 未重启。Chrome 未运行，记 not_run。断连未测，记 not_run。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。源状态仍 planned，不能完成。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。

证据是 `.local/browser-cu/br-001-open-reuse.json` 和 `.local/browser-cu/br-001-open-reuse-type.json`。


## 2026-10-15：BR-001 已 active 工作页输入和滚动读回，AppleScript 导航会抢走 Edge 焦点

用户要求浏览器操作不要移动正在使用的页面，要在自己的标签组里工作。运行中的 daemon 没有 `POST /v1/browser/navigate`，返回 404。没有启动会话，没有重启 daemon，没有重载扩展。

- 只读复核时，飞书页 `1828171512` 是用户窗 `1828171349` 的活动且 focused 页。工作页 `1828173126` 是安静窗 `1828173041` 的 example.com，`active=true`，`focused=false`，VCU 组 `48700119` 展开。OS 前台是 Ghostty。
- 已 active 工作页的截图证据仍在 `.local/browser-cu/br-001-stay-active-actions.json`：原地 `captureVisibleTab`，`background_capture=false`，PNG 是 example.com，不是飞书。那次 type 是 HTTP 400，不是成功输入。
- 为了给已 active 的工作页一个输入框，本轮用 AppleScript 只改安静窗里 example.com 标签的地址，没有改飞书窗。OS 前台采样 2 次都是 Ghostty，间隔 0.199 秒。但 Edge 的 last focused window 被改到安静窗：飞书页 `focused` 变成 false，工作页 `focused` 变成 true。这不是安全导航，不要再用。
- 修复是 `POST /v1/browser/select` 点名飞书页，再激活 Ghostty。修复期间 16 次采样都是 Ghostty。之后飞书页恢复 focused，地址没变。工作页仍在安静窗，`active=true`，`focused=false`，地址是本机夹具，标题是 `VCU BR-001 fixture`。夹具进程随后已退出，不要重载这个标签。
- 修复后点名 `1828173126` 的 `input#marker` type HTTP 200，`typed=true`，`via=content_message`，`input_path=dom_type`，`focused=false`。回执没有 `background_action`，不能写成 false。extract HTTP 200，读回 `vcu-br001-1792019564`。scroll `dy=640` HTTP 200，`scrolled=true`，`scroll_before=0`，`scroll_y=640`，`via=content_message`，`focused=false`。
- 动作前后飞书页仍是用户窗的活动且 focused 页，哔哩哔哩页 `1828171351`、`1828171545` 未换窗。没有对飞书页发送可执行动作，没有关闭 `1828173126`。type 和 scroll 的前台采样各 2 次，都是 Ghostty，间隔 0.203 秒。extract 只有 1 次采样。不能写成绝对零闪烁。
- keypress 和扩展 snapshot 仍没有不启动会话的浏览器 HTTP 路由，记 not_run。daemon `10393` 未重启。Chrome 未运行，记 not_run。断连未测，记 not_run。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。源状态仍 planned，不能完成。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。

证据是 `.local/browser-cu/br-001-stay-active-input.json`。

# 会话交接

## 2026-10-15：BR-001 安静窗工作页动作后保持 active

用户要求浏览器操作不要移动正在使用的页面，要在自己的标签组里工作。已在安静窗的 Agent 页，动作后不再交还给 `about:blank`。组保持展开，标签保持 active，下一次动作不必再 `tabs.update({active:true})`，也就不会再次抬起安静窗。用户窗里的 VCU 页仍搬入后归还，不能留成用户窗的活动页。

- `extension/tests/background.test.cjs` 65 项通过，0 失败。安静窗挂起回退后工作页保持 active；第二次截图不再 `tabs.update` 同一页。用户窗路径仍归还。
- 扩展 SHA256 `3c67eab85d30d8fd373f54b76aec3e6e87f444b43395b118d88dcd63bab3a866`，工作树与 `~/.vcu/lens-extension/background.js` 一致。`allow_page_reload=false` 重载返回 `reloaded=1`。ping `quiet_keep=stay-active`，同时保留 `quiet_message=activate-then-retry` 和 `quiet_reading=never-move`。版本 `0.2.8`。
- 真机连续两次 `POST /v1/browser/click` 点名 `1828173126` 的 `body`，HTTP 200，`pressed=true`，`focused=false`，`source=extension_dom`。点击前工作页 `active=false`、VCU 组折叠；两次之后 `active=true`，组 `48700119` 展开，仍在安静窗 `1828173041`。前台采样 9 次都是 Ghostty。
- 工作页已经 active 后再点一次 `body`，HTTP 200，`via=content_message`，回执没有 `background_action`，没有走非活动揭示路径。前台采样仍是 Ghostty。
- 飞书页 `1828171512` 重载和点击前后都是用户窗 `1828171349` 的活动且 focused 页，地址没变。哔哩哔哩页 `1828171351`、`1828171545` 未换窗。没有对飞书页发送可执行动作，没有关闭 `1828173126`。
- 前两次点击的扩展层 `via`/`background_action` 没记下来，不能把那两次写成 `background_action=false`。采样间隔约 0.15 秒，不能写成绝对零闪烁。daemon `10393` 未重启。Chrome 未运行，记 `not_run`。断连未测，记 `not_run`。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。源状态仍 planned，不能完成。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。

证据是 `.local/browser-cu/br-001-stay-active.json`。


## 2026-10-15：BR-001 非活动工作页消息超时后只在安静窗激活

用户要求浏览器操作不要移动正在使用的页面，要在自己的折叠标签组里工作。content messaging 在非活动 Agent 页上可能挂起。超时后只在安静窗激活再重试，并立刻回排。不 `tabs.update` 正在看的页。`dry_run` 不激活。页面返回 `ok:false` 不重放。

- `extension/tests/background.test.cjs` 64 项通过，0 失败。新增安静窗消息挂起回退、用户窗 VCU 标签搬入后归还、非 VCU 页拒绝。
- 扩展 SHA256 `583e9a74460d4d2c3fbee28237b576ed51eac410199a3cc9fee79260d8324df7`，工作树与 `~/.vcu/lens-extension/background.js` 一致。本轮没有再重载。ping 是 `quiet_message=activate-then-retry`，同时保留 `quiet_inject=activate-then-retry` 和 `quiet_reading=never-move`。版本 `0.2.8`。
- 真机 `POST /v1/browser/click` 点名 `1828173126`，选择器 `body`，HTTP 200。`pressed=true`，`via=content_message`，`background_action=true`，`focused=false`，`tab_id_source=explicit`，`page_url=https://example.com/`。这是一次安静窗挂起回退的真机证据，不是所有动作的证据。
- 飞书页 `1828171512` 点击前后都是用户窗 `1828171349` 的活动且 focused 页，地址没变。哔哩哔哩页 `1828171351`、`1828171545` 未换窗。example.com 仍在安静窗 `1828173041` 的折叠 VCU 组 `48700119`，`active=false`。OS 前台仍是 Ghostty。
- 先前 `h1` 点击 HTTP 400，detail 是 `selector not found`，页面仍是 example.com。那次不能当成回退证据。
- 没有在点击期间采样，不能写成零闪烁。daemon `10393` 未重启。服务端 `release_reading_page_target` 未加载。Chrome 未运行，记 `not_run`。断连重连未停 daemon，记 `not_run`。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。源状态仍 planned，不能完成。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。

证据是 `.local/browser-cu/br-001-quiet-message.json`。

## 2026-10-15：BR-001 非活动工作页注入超时后只在安静窗激活

用户要求浏览器操作不要移动正在使用的页面。上一轮点名安静窗里的 example.com 时，截图在进安静窗路径前就返回 `inject timeout`，`dy=0` 滚动的 `executeScript` 没有时限，打到命令超时。本轮把原地脚本限制在 800ms。超时后，已在安静窗的 Agent 标签只在该窗内激活并回排，不 `tabs.update` 正在看的页，也不新建窗口。用户窗里的非活动 VCU 标签仍走原来的安静窗搬入再归还。非 VCU 页超时后拒绝，不搬。

- `extension/tests/background.test.cjs` 61 项通过，0 失败。新增「inactive quiet-window script hang retries after activation and leaves the reading page」和「inactive user page script hang does not enter the quiet window」。
- 扩展 SHA256 `edf575956b029c1b11101d04fac3075a430689d9c51e9c7152cf0019898bf219`，工作树与 `~/.vcu/lens-extension/background.js` 一致。`allow_page_reload=false` 重载返回 `reloaded=1`。再 ping 是 `quiet_inject=activate-then-retry`，同时保留 `quiet_raise=restack-after-activate`、`quiet_open=agent-group` 和 `quiet_reading=never-move`。
- 真机 `POST /v1/browser/screenshot` 点名 `1828173126`，HTTP 200。截图窗口是安静窗 `1828173041`，`page_url=https://example.com/`，PNG 是 example.com，不是飞书。飞书页 `1828171512` 仍是用户窗 `1828171349` 的活动且 focused 页，地址没变。哔哩哔哩页 `1828171351`、`1828171545` 未换窗。example.com 仍在安静窗折叠 VCU 组，`active=false`。OS 前台仍是 Ghostty。
- 随后 `dy=0` 滚动同一工作页 HTTP 200，`background_scroll=false`。这是截图注入之后的原地读取，不是单独证明滚动挂起回退。滚动挂起后激活只在单测里证明。
- daemon `10393` 未重启。服务端 `release_reading_page_target` 未加载。Chrome 未运行，记 `not_run`。断连重连未停 daemon，记 `not_run`。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。源状态仍 planned，不能完成。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。

证据是 `.local/browser-cu/br-001-quiet-inject.json`。



## 2026-10-15：BR-001 安静窗激活后立即回排，不搬正在看的页

用户要求浏览器操作不要移动正在使用的页面，要像 Codex Computer Use 一样在自己的折叠标签组里工作，不打断当前使用。默认打开已经进安静窗折叠 VCU 组。本轮补的是后台截图和滚动回退：Edge 在 `tabs.update({active:true})` 时会聚焦安静窗。激活后立刻按窗口 id 回排，不用 `windows.update({focused:true})`。把标签搬回用户窗之前，先把安静窗的活动标签交还原标签，避免活动标签回移时替换正在看的页。

- `extension/tests/background.test.cjs` 59 项通过，0 失败。新增「quiet window activation restacks before it can cover the page being read」。模拟 Edge 激活即抢焦点后，回排把焦点还到用户窗，正在看的页没有 `tabs.move` 或 `tabs.update`。
- 扩展 SHA256 `b87f48b77380aa45392f30d6d276ee86fe9a0620dc60b6c9143508586cc87ce9`，工作树与 `~/.vcu/lens-extension/background.js` 一致。`allow_page_reload=false` 重载返回 `reloaded=1`。再 ping 是 `quiet_raise=restack-after-activate`，同时保留 `quiet_open=agent-group` 和 `quiet_reading=never-move`。
- 只读复核：飞书页 `1828171512` 重载前后都是用户窗 `1828171349` 的活动且 focused 页，地址没变。哔哩哔哩页 `1828171351`、`1828171545` 未换窗。example.com 页 `1828173126` 仍在安静窗 `1828173041` 的折叠 VCU 组，`active=false`。OS 前台仍是 Ghostty。
- 点名 example.com 的截图返回 `inject timeout`，发生在搬移之前。`dy=0` 滚动返回 `command timeout`。两次都没有搬走飞书页，也不能写成安静窗激活回排已在真机走通。真机激活回排记 `not_run`。
- daemon `10393` 未重启。服务端 `release_reading_page_target` 未加载。Chrome 未运行，记 `not_run`。断连重连未停 daemon，记 `not_run`。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。源状态仍 planned，不能完成。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。

证据是 `.local/browser-cu/br-001-quiet-raise.json`。


## 2026-10-15：BR-001 默认打开留在安静窗折叠组

用户要求浏览器操作不要移动正在使用的页面，要像 Codex Computer Use 一样在自己的标签组里工作。默认 `open_tab` 以前落在用户当前窗口。现在优先已有安静窗的折叠 VCU 组，并且不激活新标签，避免 Edge 抬起该窗。没有安静窗时才退回用户窗折叠组。显式 `group_id` 和 `new_window` 不变。`select` 仍是显式切换。

- `extension/tests/background.test.cjs` 58 项通过，0 失败。有安静窗时 open 进入窗口 `9`，用户页 URL、active 和焦点不变，新标签保持 inactive。
- 扩展 SHA256 `e77d6a5fff1a154d863090ca58c06cc01aabef054d171690c1680e46c64e19af`，工作树与 `~/.vcu/lens-extension/background.js` 一致。`allow_page_reload=false` 重载后 ping `quiet_open=agent-group`。
- 真机 `POST /v1/browser/open` 打开 `https://example.com/`。新页 `1828173126` 在安静窗 `1828173041`，组 `VCU` 折叠，`active=false`，`focused=false`，`page_being_read=false`。飞书页 `1828171512` 仍是用户窗 `1828171349` 的活动且 focused 页，地址没变。哔哩哔哩页 `1828171351`、`1828171545` 未换窗。OS 前台仍是 Ghostty。没有对飞书页发送 click 或 navigate。example.com 留在安静窗折叠组，作为工作页，没有关掉。
- daemon `10393` 未重启。服务端 `release_reading_page_target` 未加载。扩展侧打开改道已加载。
- Chrome 未运行，记 `not_run`。断连重连未停 daemon，记 `not_run`。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。源状态仍 planned，不能完成。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。
- 没有自动领取下一项：`BR-001` 仍是当前领取，AWR ready 被 `active_claim` 挡住。`CORE-001` 只是可领取。用户要求先完成 `BR-001`，而它还没有 Chrome、断连和干净 SHA 证据。

证据是 `.local/browser-cu/br-001-open-quiet.json`。


## 2026-10-15：BR-001 没有工作页时隐式动作也先开折叠组

不带 `tab_id` 的 `click`、`type`、`hover`、`scroll`、`keypress`、`snapshot`，在没有可注入的 Agent http 页时，不再返回 `no agent tab`。扩展在已有安静窗的折叠 VCU 组打开 `https://example.com/`；没有安静窗时才在用户窗折叠 VCU 组打开，并且不激活正在看的页。动作打到新页，回执带 `ensured_agent_tab` 和 `tab_id_source=agent_group`。`dry_run` 不新开页，仍拒绝。`extract`、`close_tab`、`click_point` 和分组不走这条路。点名正在看的页的改打保持上一轮行为。

- `extension/tests/background.test.cjs` 57 项通过，0 失败。安静窗存在时，不带 `tab_id` 的 click 把 `https://example.com/` 开在窗口 `9` 的折叠 VCU 组，用户页 URL、active 和窗口不变，click 不发给用户页。`dry_run` 不创建该页。
- 扩展 SHA256 `918ecb2940ac9cb49fed2088406aeefa659f5e0c96e4b83434f03d260193316a`，工作树与 `~/.vcu/lens-extension/background.js` 一致。`allow_page_reload=false` 重载返回 `reloaded=1`。再 ping 是 `quiet_implicit=ensure-group`，同时保留 `quiet_work=ensure-group` 和 `quiet_reading=never-move`。
- 只读复核：飞书页 `1828171512` 仍是用户窗 `1828171349` 的活动且 focused 页，地址没变。哔哩哔哩页未换窗。安静窗 `1828173042` 仍是 `about:blank`。OS 前台仍是 Ghostty。没有对飞书页发送动作，也没有打开 `example.com`。真机隐式开工路径记 `not_run`。
- daemon `10393` 未重启。二进制是 `04:07`，`login_state.rs` 是 `04:55`。服务端 `release_reading_page_target` 未加载。扩展侧隐式开工已加载；当前 daemon 仍可能把正在看的页写进 `tab_id`，扩展会改打，不会切页。
- Chrome 未运行，记 `not_run`。断连重连未停 daemon，记 `not_run`。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。源状态仍 planned，不能完成。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。

证据是 `.local/browser-cu/br-001-implicit-ensure.json`。


## 2026-10-15：BR-001 没有 Agent 页时先开折叠组，不切正在看的页

运行中的 daemon 若仍把正在看的页绑进 `click`、`type`、`hover`、`scroll`、`keypress`、`snapshot`，且没有可注入的 Agent http 页，扩展不再停在拒绝。它在已有安静窗的折叠 VCU 组打开 `https://example.com/`；没有安静窗时才在用户窗的折叠 VCU 组打开，并且不激活正在看的页。动作改打新页，返回 `released_reading_page` 和 `tab_id_source=agent_group`。正在看的页不被 `tabs.update` 或 `tabs.move`。打开若会替换该页，仍拒绝，并且不发送动作。不带 `tab_id` 且没有 Agent 页的隐式动作仍返回 `no agent tab`。`close_tab`、`click_point` 和分组仍拒绝。`dry_run` 仍可检查正在看的页，但不新开页。

- `extension/tests/background.test.cjs` 56 项通过，0 失败。单独正在看的页上的 click 和 `dy: 0` scroll 会打开折叠 VCU 组里的 `https://example.com/`，用户页 URL 和 active 不变，动作不发给该页。安静窗存在时新页进窗口 `9`，不进用户窗，也不 `windows.create`。`dry_run` 仍打正在看的页，且不新开页。
- 扩展 SHA256 `8eda9087c4cb7494b0317dfbd62845560bf32fec57b8cf324786943aa0ae9634`，工作树与 `~/.vcu/lens-extension/background.js` 一致。`allow_page_reload=false` 重载返回 `reloaded=1`。再 ping 是 `quiet_work=ensure-group`，同时保留 `quiet_nav=agent-group`、`quiet_release=agent-group` 和 `quiet_reading=never-move`。
- 只读复核：飞书页 `1828171512` 重载前后都是用户窗 `1828171349` 的活动且 focused 页，地址没变。哔哩哔哩页 `1828171351`、`1828171545` 未换窗。安静窗 `1828173042` 仍是 `about:blank`。OS 前台仍是 Ghostty。没有对飞书页发送 click 或 navigate，也没有打开 `example.com`。因此真机确保工作组的路径是 `not_run`，只由单测证明。
- daemon `10393` 父进程 1，仍听 `127.0.0.1:17890`。二进制是 `04:07`，`login_state.rs` 是 `04:55`。服务端 `agent_surface` 和 `release_reading_page_target` 未加载，不能写成服务端已改打。扩展侧确保工作组已加载。
- Chrome 未运行，记 `not_run`。断连重连未停 daemon，记 `not_run`。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。源状态仍 planned，不能完成。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。

证据是 `.local/browser-cu/br-001-ensure-group.json`。


## 2026-10-15：BR-001 导航正在看的页改为打开安静窗折叠组

`navigate` 如果目标是正在看的页，不再 `tabs.update` 该页。请求的 http(s) URL 改在已有安静窗的折叠 VCU 组打开；没有安静窗时才在用户窗的折叠 VCU 组打开，并恢复原活动页。`close_tab` 和 `click_point` 仍不改打别的页。没有 Agent http 页时，click/type/hover/scroll/keypress/snapshot 仍拒绝，不发明一个空白页去点击。

- `extension/tests/background.test.cjs` 55 项通过，0 失败。安静窗路径把新页开在窗口 `9` 的折叠 VCU 组，用户页 URL 和 active 不变，没有 `tabs.update` 用户页。没有安静窗时新页进用户窗折叠 VCU 组，用户页仍 active。已有 VCU 组页的 navigate 仍只更新该页。
- 扩展 SHA256 `e91caf3e079ed3d002970d70b04e42583923b1d0c73515ba8580e6a8c36ecf8c`，工作树与 `~/.vcu/lens-extension/background.js` 一致。`allow_page_reload=false` 重载返回 `reloaded=1`。再 ping 是 `quiet_nav=agent-group`，同时保留 `quiet_release=agent-group` 和 `quiet_reading=never-move`。
- 只读复核：飞书页 `1828171512` 重载前后都是用户窗 `1828171349` 的活动且 focused 页，地址没变。哔哩哔哩页未换窗。安静窗 `1828173042` 仍是 `about:blank`。OS 前台仍是 Ghostty。没有对飞书页发送 navigate。
- daemon `10393` 未重启。服务端 `release_reading_page_target` 仍未加载，不能写成服务端已改打。扩展侧导航改道已加载。
- Chrome 未运行，记 `not_run`。断连重连未停 daemon，记 `not_run`。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。源状态仍 planned，不能完成。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。

证据是 `.local/browser-cu/br-001-nav-agent-group.json`。


## 2026-10-15：BR-001 正在看的页改打折叠组，不搬走

运行中的 daemon 若仍把正在看的页绑进 `click`、`type`、`hover`、`scroll`、`keypress`、`snapshot`，扩展改打已有的折叠 VCU/session 组，并返回 `released_reading_page` 和 `tab_id_source=agent_group`。没有 Agent 页时仍拒绝。`navigate`、`close_tab`、`click_point` 不改打别的页。`dry_run` 和活动页截图仍可检查该页，但不移动它。

- `extension/tests/background.test.cjs` 52 项通过，0 失败。显式点击正在看的页会改打折叠组夹具，用户页保持 active；没有 Agent 页时拒绝。`keypress` 同样改打。分组仍拒绝正在看的页。`tabs.move` 没有被调用。
- 扩展 SHA256 `8b6669a7aa7f671239f3e8f4afddf06af441907de51ab9ff698d4771efce38a0`，工作树与 `~/.vcu/lens-extension/background.js` 一致。上一轮 `allow_page_reload=false` 重载后 ping 是 `quiet_release=agent-group`，同时保留 `quiet_reading=never-move`。本轮不重载再 ping，HTTP 200，标记相同，没有 `reloaded`。
- 只读复核：飞书页 `1828171512` 仍是用户窗 `1828171349` 的活动且 focused 页。哔哩哔哩页 `1828171351`、`1828171545` 未换窗。安静窗 `1828173042` 仍是 `agent_owned=true`，`page_being_read=false`。OS 前台仍是 Ghostty。没有对飞书页发送会执行的动作。
- daemon `10393` 父进程 1，仍听 `127.0.0.1:17890`。二进制是 `04:07`，`login_state.rs` 是 `04:55`。服务端 `agent_surface` 和 `release_reading_page_target` 未加载，不能写成真机已生效。扩展侧改打已加载。
- 当前没有折叠 VCU/session 的 http 页；安静窗 about:blank 不可注入。因此若请求仍带飞书页，扩展会拒绝，不会改打，也不会搬走。本轮没有发送该动作。
- Chrome 未运行，记 `not_run`。断连重连未停 daemon，记 `not_run`。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。源状态仍 planned，不能完成。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。

证据是 `.local/browser-cu/br-001-release-reading.json` 和 `.local/browser-cu/br-001-release-reading-recheck.json`。


## 2026-10-15：BR-001 命名 session 组留下，用户组 1/3 不搬

后台截图和滚动仍只搬 Agent 工作面。已记录的 session 组必须标题匹配，组号复用到用户组 `1`/`3` 或其他标题时拒绝 `tabs.move`。标题匹配的折叠 session 组成为隐式动作目标，正在看的非 Agent 页保持不动。

- `extension/tests/background.test.cjs` 49 项通过。新增反向用例：存储里的组号 `1` 和标题不符的组号 `8` 都不 `tabs.move`，也不能成为隐式目标。正向用例：标题为 `Review` 的 session 组接受隐式点击，用户页仍 active。
- `cargo test -p vcu-server --lib release_reading_page` 1 通过。服务端把 `agent_surface` 也视为工作面。daemon `10393` 没有重启，这段服务端改动未加载，不能写成真机已生效。
- 扩展 SHA256 `5e9db08e5ed0bf9d5c6cc259220cd8d584ffc65354058bd3d8802ba58f5992ae`，工作树与 `~/.vcu/lens-extension/background.js` 一致。`allow_page_reload=false` 的重载返回 `reloaded=1`。再 ping 是 `quiet_session=match-title`，`quiet_move=agent-surface`。飞书页 `1828171512` 重载前后都 focused。哔哩哔哩页未换窗。OS 前台仍是 Ghostty。
- Chrome 未运行，记 `not_run`。断连重连未停 daemon，记 `not_run`。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。源状态仍 planned，不能完成。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。

证据是 `.local/browser-cu/br-001-session-title.json`。

# 会话交接

## 2026-10-15：BR-001 只读复核，用户页仍未被搬走

没有新改代码。运行中的 Edge 扩展 ping 仍是 `quiet_move=agent-surface`，版本 `0.2.8`。这次 ping 没有 `reload`。工作树和 `~/.vcu/lens-extension/background.js` 的 SHA256 都是 `228fdfd3f80933704bb4a1f7ce2e784a9a9e98c81ebe311a68579441298902ff`。`extension/tests/background.test.cjs` 47 项通过，0 失败。

- daemon `10393` 父进程 1，仍听 `127.0.0.1:17890`。飞书页 `1828171512` 仍是用户窗 `1828171349` 的活动且 focused 页，`page_being_read=true`。哔哩哔哩页 `1828171351`、`1828171545` 仍在同一窗口，不是 focused。安静窗 `1828173042` 是 `agent_owned=true`，`page_being_read=false`。OS 前台仍是 Ghostty。
- 后台截图和滚动重试仍拒绝把用户组或未分组用户页 `tabs.move` 进安静窗。Agent 只在 VCU / `VCU-` / `VCU ` 组、已记录的 session 组，或已经在 Agent/安静窗里的标签上短暂搬移。
- Chrome 未运行，记 `not_run`。断连重连未停 daemon，记 `not_run`。工作树 27 个脏路径，HEAD `e6fa5e9`，没有干净 SHA。源状态仍 planned，不能完成。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。

证据是 `.local/browser-cu/br-001-quiet-move-recheck.json`。

# 会话交接

## 2026-10-15：BR-001 用户页不再被搬进安静窗

后台截图和滚动重试只允许短暂搬移 VCU / `VCU-` / `VCU ` 组、已记录的 session 组，或已经在 Agent/安静窗里的标签。用户组 `1`/`3` 和未分组的后台页不再 `tabs.move`。Agent 组夹具仍可进安静窗并归还。飞书页 `1828171512` 重载和复测前后都 focused。OS 前台仍是 Ghostty。daemon `10393` 仍在。没有覆盖 `~/.local/bin`，没有冷启动，没有点 Allow，没有用 CDP。

- `extension/tests/background.test.cjs` 47 项通过。新增反向用例：用户后台页截图和滚动不得 `tabs.move`，活动页保持不动。已记录的 session 组夹具仍能进安静窗并折叠归还。
- 扩展 SHA256 `228fdfd3f80933704bb4a1f7ce2e784a9a9e98c81ebe311a68579441298902ff`，工作树与 `~/.vcu/lens-extension/background.js` 一致。`allow_page_reload=false` 的 `reload_self` 返回 `reloaded=1`。再 ping 是 `quiet_move=agent-surface`。重载前后标签 id 集合没变。
- `.local/browser-cu/br-001-quiet-move.json`：折叠 session 组夹具 `1828173120` 显式截图 `capture_window_id=1828173041`，不是用户窗 `1828171349`。`background_capture=true`，`user_group_expansions=0`。画面是品红条和夹具标题，文件 `viewport-01M4Y2DB5FTWETZA3RCJPADG2E.png`。夹具已关。飞书页仍 focused，前台仍是 Ghostty。原用户标签没有换窗，也没有被激活。
- 夹具是组里唯一标签，搬去安静窗时原组被浏览器解散，归还后重建为同名折叠组 `598810935`。这不是搬用户页。没有对飞书页或哔哩哔哩页做会搬移的实测。
- Chrome 未运行，记 `not_run`。断连重连未停 daemon，记 `not_run`。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。源状态仍 planned，不能完成。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。不要结束会话 `01M4X5644CBJ89DN3Y69SZ1WBS`、`01M4X0GJ2YM9HX9R0P7BF5QX6R`、`01M4WYGS48DZE0X55A2HDJMP00`、`01M4WK83ATFMZE2GT1NR2J3H9Z`、`01M4DY9QJG6MXVSR03ZSV76SN1`、`01M4DJ9FZJA5A39ZS0CBB5V8GA` 或 `01M3KKZTFFQTZ3FF0DWWZHP5QV`。

# 会话交接

## 2026-10-15：BR-001 折叠组截图和视口点击不切飞书页

显式截折叠 session 组里的夹具，画面来自安静窗，不是用户窗。随后用这张截图的视口坐标点击，打中夹具按钮，不切飞书页 `1828171512`。OS 前台仍是 Ghostty。daemon `10393` 仍在。没有覆盖 `~/.local/bin`，没有冷启动，没有点 Allow，没有用 CDP。

- `.local/browser-cu/br-001-collapsed-shot.json`：夹具 `1828173108` 在用户窗 `1828171349` 的折叠组，`active=false`。截图 `capture_window_id=1828173041`，不是用户窗。`background_capture=true`，`user_group_expansions=0`。文件 `viewport-01M4Y1QEHSP79ZW0V0N3NX42XK.png` 是品红条和夹具标题，不是飞书页。截完夹具回到原窗并保持折叠，随后已关。
- `.local/browser-cu/br-001-viewport-click.json`：同一路径截图后，`space=viewport` 点击 `pixel_x=80`、`pixel_y=80`。回执 `pressed=true`，`source=extension_dom`，`os_cursor_used=false`，目标是夹具 `1828173114`。extract 读回 `hits-1`。组保持折叠，夹具已关。飞书页仍 focused，前台仍是 Ghostty。
- 这不是隐式截图。不带 `tab_id` 的截图仍绑 last observe，不能写成已经改道。Chrome 未运行，记 `not_run`。断连重连未停 daemon，记 `not_run`。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。源状态仍 planned，不能完成。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。不要结束会话 `01M4X5644CBJ89DN3Y69SZ1WBS`、`01M4X0GJ2YM9HX9R0P7BF5QX6R`、`01M4WYGS48DZE0X55A2HDJMP00`、`01M4WK83ATFMZE2GT1NR2J3H9Z`、`01M4DY9QJG6MXVSR03ZSV76SN1`、`01M4DJ9FZJA5A39ZS0CBB5V8GA` 或 `01M3KKZTFFQTZ3FF0DWWZHP5QV`。

# 会话交接

## 2026-10-15：BR-001 隐式 type/hover/scroll 留在折叠组，滚动读回已核实

不带 `tab_id` 的 type、hover、scroll 打到刚打开的折叠 session 组，不切飞书页 `1828171512`。OS 前台采样只有 Ghostty。daemon `10393` 仍是父进程 1，听 `127.0.0.1:17890`。没有覆盖 `~/.local/bin`，没有冷启动，没有点 Allow，没有用 CDP。

- `.local/browser-cu/br-001-dom-actions.json` 的 type/hover 读回是 `vcu-dom` 和 `hovers-1`，`tab_id_source=agent_group`，`stolen=false`。它的 scroll 顶层 `scroll_y` 和 `background_scroll` 都是空，紧接着的 extract 仍是 `y-0`。那份文件不能证明滚动。
- `.local/browser-cu/br-001-implicit-dom.json`：打开进入折叠组，`active=false`。不带 `tab_id` 的 type/hover/scroll 都打到夹具 `1828173094`，`tab_id_source=implicit`，`source=extension_dom`。scroll 回执 `scroll_y=480`、`scrolled=true`、`background_scroll=false`。紧接着的 extract 仍是 `y-0`，所以这一下也不能单独证明页面滚动留下。夹具已关，飞书页仍 focused。
- `.local/browser-cu/br-001-scroll-persist.json`：同一路径先 `dy=480`，再 `dy=0` 独立读回仍是 `scroll_y=480`。0.5 秒后 extract 读回 `y-480/top-480`。组保持折叠，夹具已关。飞书页 `1828171512` 仍 focused，前台仍是 Ghostty。`background_scroll=false`，没有把夹具挪进安静窗。
- 已有 Agent http 页时来源是 `implicit`，不是 `agent_group`。没有 Agent http 页时，服务端仍放开正在看的页并改走 `agent_group`。两种来源都没有打到飞书页。
- Chrome 未运行，记 `not_run`。断连重连未停 daemon，记 `not_run`。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。源状态仍 planned，不能完成。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。不要结束会话 `01M4X5644CBJ89DN3Y69SZ1WBS`、`01M4X0GJ2YM9HX9R0P7BF5QX6R`、`01M4WYGS48DZE0X55A2HDJMP00`、`01M4WK83ATFMZE2GT1NR2J3H9Z`、`01M4DY9QJG6MXVSR03ZSV76SN1`、`01M4DJ9FZJA5A39ZS0CBB5V8GA` 或 `01M3KKZTFFQTZ3FF0DWWZHP5QV`。

# 会话交接

## 2026-10-15：BR-001 新 daemon 已把隐式点击留在折叠 VCU 组

旧 daemon `97464` 已不在。当前 daemon `10393` 父进程 1，听 `127.0.0.1:17890`，二进制是 `04:07` 编的 `target/debug/vcu-daemon`，晚于 `api.rs` / `login_state.rs`。没有覆盖 `~/.local/bin`，没有冷启动，没有点 Allow，没有用 CDP。health `ok=true`，扩展 `polling=true`。

- `pixels=false` 的 observe 打到飞书页 `1828171512`，`page_being_read=true`，`act_target=agent_group`，没有切页。
- 没有 Agent http 页时，不带 `tab_id` 的 click 返回 `no agent tab in the VCU group; refusing to use the page being read`。飞书页仍 focused。
- 后台打开本机夹具进入用户窗 `1828171349` 的折叠 VCU 组，`active=false`。不带 `tab_id` 的 click 回执是 `tab_id=1828173086`，`tab_id_source=agent_group`，`source=extension_dom`，`input_path=dom_click`，`os_cursor_used=false`。extract 读回按钮文本 `hits-1`。夹具已关闭，标签 id 集合恢复为打开前的四项，VCU 组消失。
- 采样期间 OS 前台只有 Ghostty。飞书页重测后仍是 `1828171512`，focused，`page_being_read=true`。窗口 id 前后都是 Ghostty `2039`、飞书 `7243`、安静窗 `20648`。探针没解析出坐标；测后只读坐标是飞书 `0,30` 的 `1920x926`，安静窗 `1420,915` 的 `500x375`。
- `extension/tests/background.test.cjs` 45 项通过。`release_reading_page_only_for_live_last_observe` 1 通过。Chrome 未运行，记 `not_run`。断连重连未停 daemon，记 `not_run`。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。源状态仍 planned，不能完成。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。

证据是 `.local/browser-cu/br-001-daemon-agent-group.json`。中间有一次探针因解析错误和 `finally` 吞异常写成空检查，已作废；以上只采用最后一次五项都 pass 的结果。

## 2026-10-15：BR-001 安静窗不再被标成正在看的页

列表以前只认 `agentWindowId`。重载后停放窗记在 `quietCaptureWindowId`，所以安静窗里的活动 `about:blank` 被标成 `page_being_read`。现在列表会读取停放窗 id，安静窗和 Agent 窗都算 `agent_owned`，不再当成正在看的页。正在看的 focused 用户页仍拒绝动作。

- `extension/tests/background.test.cjs` 45 项通过。新增「parked quiet window is not the page being read」。ping 标记是 `quiet_own=quiet-window`，`quiet_act=agent-group`。
- 扩展 SHA256 `62e7eeec97f572afe4a8777c1e99ad91f4ece68da5eb1cf4a600904990bed2ae`，工作树与 `~/.vcu/lens-extension/background.js` 一致。`allow_page_reload=false` 的 `reload_self` 返回 `reloaded=1`，没有 `reload.html`。再 ping 是 `quiet_own=quiet-window`。
- 飞书页 `1828171512` 重载前后都是用户窗 `1828171349` 的活动且 focused 页，`page_being_read=true`，`agent_owned=false`。安静窗标签 `1828173042` 现在是 `agent_owned=true`，`page_being_read=false`，`focused=false`。标签 id 集合没变。OS 前台仍是 Ghostty。飞书 CG `7243` 仍在 `0,30`，安静窗 CG `20648` 仍在 `1420,915` 的 `500x375`。没有打 `/stage`，没有点 Allow，没有用 CDP，没有冷启动。
- daemon `97464` 没有重启。服务端把正在看的页放开、改走 `tab_id_source=agent_group` 仍未加载，不能写成真机已生效。Chrome 未运行，记 `not_run`。断连重连未停 daemon，记 `not_run`。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。源状态仍 planned，不能完成。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。不要结束会话 `01M4X5644CBJ89DN3Y69SZ1WBS`、`01M4X0GJ2YM9HX9R0P7BF5QX6R`、`01M4WYGS48DZE0X55A2HDJMP00`、`01M4WK83ATFMZE2GT1NR2J3H9Z`、`01M4DY9QJG6MXVSR03ZSV76SN1`、`01M4DJ9FZJA5A39ZS0CBB5V8GA` 或 `01M3KKZTFFQTZ3FF0DWWZHP5QV`。

证据是 `.local/browser-cu/br-001-quiet-own-reload.json`。停手前已 `awr source reindex`，project revision `312`。AWR：Continue 1（`BR-001`），Claimable 1（`CORE-001`），Waiting 23，Blocked 1（`VISION-NEXT` draft）。没有领取 `CORE-001`。

# 会话交接

## 2026-10-15：BR-001 扩展重载后 quiet_act=agent-group，飞书页未切

工作树 `extension/background.js` 与 `~/.vcu/lens-extension/background.js` 的 SHA256 都是 `23e889b70e13b0d62c3de7ce7bc1460de08d7fb686a65968ea3d403bc2e3dba8`。先 GET `/v1/browser/tabs`，再 POST `/v1/browser/ping`，body 是 `{"reload":true,"allow_page_reload":false}`。HTTP 200，`reloaded=1`，没有打开 `reload.html`。1.2 秒后再 ping，`quiet_act=agent-group`，`quiet_stage=parked-size`，`quiet_group=keep-collapsed`，`quiet_place=stage-only`，版本 `0.2.8`。重载前的 ping 没有 `quiet_act`。

- 飞书页 `1828171512` 重载前后都是用户窗 `1828171349` 的活动且 focused 页，标题仍是飞书文档。标签 id 集合没变。OS 前台仍是 Ghostty。安静窗 CG `20648` 仍在 `1420,915` 的 `500x375`，飞书 CG `7243` 仍在 `0,30`。没有打 `/stage`，没有重跑放大截图，没有点 Allow，没有用 CDP，没有冷启动。
- 重载后列表把飞书页标成 `page_being_read=true`。安静窗里的 `about:blank` `1828173042` 也是 `active=true`、`page_being_read=true`，但它 `focused=false`，不是用户正在看的页。这是标记过宽，不是切页。
- daemon `97464` 没有重启。服务端非 dry_run 隐式动作放开正在看的页、改走 `tab_id_source=agent_group` 的改动仍未加载，不能写成真机已生效。扩展侧的拒绝和 `quiet_act` 已经在运行中的 Edge 扩展里。
- Chrome 未运行，记 `not_run`。断连重连未停 daemon，记 `not_run`。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。源状态仍 planned，不能完成。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。不要结束会话 `01M4X5644CBJ89DN3Y69SZ1WBS`、`01M4X0GJ2YM9HX9R0P7BF5QX6R`、`01M4WYGS48DZE0X55A2HDJMP00`、`01M4WK83ATFMZE2GT1NR2J3H9Z`、`01M4DY9QJG6MXVSR03ZSV76SN1`、`01M4DJ9FZJA5A39ZS0CBB5V8GA` 或 `01M3KKZTFFQTZ3FF0DWWZHP5QV`。

证据是 `.local/browser-cu/br-001-agent-group-reload.json`。停手前已 `awr source reindex`，project revision `310`。AWR：Continue 1（`BR-001`），Claimable 1（`CORE-001`），Waiting 23，Blocked 1（`VISION-NEXT` draft）。没有领取 `CORE-001`。

# 会话交接

## 2026-10-15：BR-001 服务端不再把正在看的页绑进真实隐式动作

扩展已经会拒绝打到正在看的非 VCU 页。服务端仍把新鲜 `last_observe` 写成隐式 click/type/hover/scroll 的 `tab_id`，于是真实动作会被扩展拒绝，而不是进入折叠 VCU 组。这一轮只改绑定。

- `release_reading_page_target`：非 `dry_run`、来源是 `last_observe`、目标是正在看的非 VCU 页时，返回 `(None, "agent_group")`，请求不带该 tab。`dry_run`、显式 tab、VCU 组、后台页和 `agent_owned` 保持原绑定。
- 只接到 click、type、hover、scroll。extract、screenshot、wait、显式 `tab_id`、viewport/capture 点击仍走原来的 `bound_dom_target`。
- `cargo test -p vcu-server --lib login_state::tests::release_reading_page_only_for_live_last_observe` 1 通过。`cargo test -p vcu-server --test app_http snapshot_merges_extension_tabs_for_empty_ax_edge` 1 通过。mock tab `42` 是活动页；dry-run 仍是 `last_observe`，非 dry-run 是 `agent_group` 且请求没有该 tab。wait 仍是 `last_observe`。
- daemon `97464` 没有重启，也没有重载。这段服务端改动没有加载进正在运行的进程，不能写成真机已生效。没有再操作飞书页 `1828171512`，没有打 `/stage`，没有重跑放大截图。
- Chrome 未运行，记 `not_run`。断连重连未停 daemon，记 `not_run`。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。源状态仍 planned，不能完成。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。不要结束会话 `01M4X5644CBJ89DN3Y69SZ1WBS`、`01M4X0GJ2YM9HX9R0P7BF5QX6R`、`01M4WYGS48DZE0X55A2HDJMP00`、`01M4WK83ATFMZE2GT1NR2J3H9Z`、`01M4DY9QJG6MXVSR03ZSV76SN1`、`01M4DJ9FZJA5A39ZS0CBB5V8GA` 或 `01M3KKZTFFQTZ3FF0DWWZHP5QV`。

## 2026-10-15：BR-001 动作留在折叠 VCU 组，安静窗不再放大

隐式 click、type、hover、scroll 不再把正在看的页当目标，只选 `VCU` / `VCU-` / `VCU ` 组或 `agent_owned` 标签。没有这种标签就返回 `no_agent_tab`。显式 click、click_point、type、hover、scroll、navigate、close_tab 打到正在看的非 VCU 页会被拒绝，不切换、不滚动、不关闭。`dry_run` 放行，活动页截图仍是只读。显式 `select_tab` 仍可切换。`quietStageBounds` 现在等于 `quietParkBounds`，不再从角落放大盖住当前页。

- `extension/tests/background.test.cjs` 43 项通过。拒绝正在看的页、隐式点击进 VCU 组、`dry_run` 保留 0 滚动、活动页截图只读、坐标点击改到 VCU 组、隐式 hover 打到折叠组。
- 扩展 SHA256 `e2bc62c9937909221ebecb8de543fc801c20a0ba211e350a3d4adf22d3fa82a7`，工作树与 `~/.vcu/lens-extension/background.js` 一致。`reload_self` 成功，`allow_page_reload=false`，`reloaded=1`。ping 是 `quiet_stage=parked-size`，`quiet_group=keep-collapsed`，`quiet_place=stage-only`，版本 `0.2.8`。
- 重载前后飞书页 `1828171512` 都是用户窗 `1828171349` 的活动且 focused 页，标题仍是飞书文档。CG `7243` 仍在 `0,30` 的 `1920x926`。安静窗 `1828173041` 的 CG `20648` 仍在 `1420,915` 的 `500x375`。OS 前台仍是 Ghostty。bounds 没有漂移，所以没有再打 `/stage`，也没有重跑会放大安静窗的后台截图。
- 打开 `https://example.com/` 进入同一窗口折叠 VCU 组 `1860526523`，标签 `1828173078`，`active=false`，`collapsed=true`。显式点击飞书页被拒绝，错误是 `click refused without moving the page being read`。不带 tab 的点击打到 example.com，不是飞书页。随后关闭 `1828173078`，组消失。飞书页、Ghostty 和安静窗都没变。
- daemon `97464` 未停，仍听 `127.0.0.1:17890`。watchdog `5888` 拉起 `7432`，仍听 `127.0.0.1:17991`。没有冷启动，没有点 Allow，没有用 CDP。
- Chrome 未运行，记 `not_run`。断连重连未停 daemon，记 `not_run`。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。源状态仍 planned，不能完成。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。不要结束会话 `01M4X5644CBJ89DN3Y69SZ1WBS`、`01M4X0GJ2YM9HX9R0P7BF5QX6R`、`01M4WYGS48DZE0X55A2HDJMP00`、`01M4WK83ATFMZE2GT1NR2J3H9Z`、`01M4DY9QJG6MXVSR03ZSV76SN1`、`01M4DJ9FZJA5A39ZS0CBB5V8GA` 或 `01M3KKZTFFQTZ3FF0DWWZHP5QV`。


## 2026-10-15：BR-001 安静窗从停放角落放大，不再复制用户窗原点

`quietStageBounds` 不再复制用户窗原点。视口校正缺坐标时也不再退回 `0,30`，而是从 `quietParkBounds` 往外长。请求或回读的安静窗覆盖用户页超过 25% 时，`placeQuietWindow` 返回 false，不回退 `chrome.windows.update`。停放二分探测仍允许角落下方的中间 top，但不允许把安静窗挪到用户页原点。

- `extension/tests/background.test.cjs` 42 项通过。放大断言改为：所有 `/stage` 的 `left` 是 `1420` 且 `top >= 880`，至少一次放大是 `1420,880` 且 `width > 500`，没有 `left=0` 或 `top=30`。
- 扩展 SHA256 `dba4f34750f06c5f887dc4cbccfd0e7df723e656f0a96e13f0dd6642e1e42f33`，工作树与 `~/.vcu/lens-extension/background.js` 一致。`reload_self` 成功，`allow_page_reload=false`，`reloaded=1`。ping 是 `quiet_stage=parked-origin`，`quiet_group=keep-collapsed`，`quiet_place=stage-only`，版本 `0.2.8`。
- 重载前后飞书页 `1828171512` 都是用户窗 `1828171349` 的活动页。安静窗 `1828173041` 仍是 index 2，bounds `1420,915,1920,1290`。OS 前台仍是 Ghostty。同坐标 `/stage` 返回 `ok`，没有抬窗，也没有改飞书页。本轮没有重跑会放大安静窗的后台截图，所以放大瞬间是否仍会闪一下，没有新的真机证据。
- Chrome 未运行，记 `not_run`。断连重连未停 daemon，记 `not_run`。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。源状态仍 planned，不能完成。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。不要结束会话 `01M4X5644CBJ89DN3Y69SZ1WBS`、`01M4X0GJ2YM9HX9R0P7BF5QX6R`、`01M4WYGS48DZE0X55A2HDJMP00`、`01M4WK83ATFMZE2GT1NR2J3H9Z`、`01M4DY9QJG6MXVSR03ZSV76SN1`、`01M4DJ9FZJA5A39ZS0CBB5V8GA` 或 `01M3KKZTFFQTZ3FF0DWWZHP5QV`。

## 2026-10-15：BR-001 安静窗放大先回排，新建窗口不再盖住当前页

`/stage` 现在先把用户窗 `set index to 1`，再改安静窗 bounds，随后立刻再回排，并在 0.05 秒后再回排一次。不设置安静窗 index，避免把空白窗抬到前面。扩展侧新建窗口不再用默认的 `1100x800`：缺窗时只在角落建 `500x375` 且 `focused:false`，创建后立即按窗口 id 回排。加入已折叠的 VCU 组后会再折叠，避免 Chromium 把用户标签条展开。已展开的用户组保持原样。

- `extension/tests/background.test.cjs` 42 项通过。新增缺窗停放和折叠组回归。扩展 SHA256 `d841a5555a071bc682f203a1d69b37deea7da876fb3ed9179574805a34fe60d0`，工作树与 `~/.vcu/lens-extension/background.js` 一致。`reload_self` 成功，`allow_page_reload=false`，`reloaded=1`。ping 是 `quiet_stage=restack-first`，`quiet_group=keep-collapsed`，`quiet_place=stage-only`，版本 `0.2.8`。
- 回排助手已换成含 `delay 0.05` 的新二进制。watchdog `5888` 拉起 `7432`，仍听 `127.0.0.1:17991`。daemon `97464` 未停，仍听 `127.0.0.1:17890`。
- 重载前后飞书页 `1828171512` 都是用户窗 `1828171349` 的活动页。安静窗 `1828173041` 仍是 index 2，bounds `1420,915,1920,1290`。OS 前台仍是 Ghostty。同坐标 `/stage` 返回 `ok`，没有抬窗，也没有改飞书页。本轮没有重跑会放大安静窗的后台截图，所以放大瞬间是否仍会闪一下，没有新的真机证据。
- Chrome 未运行，记 `not_run`。断连重连未停 daemon，记 `not_run`。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。源状态仍 planned，不能完成。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。不要结束会话 `01M4X5644CBJ89DN3Y69SZ1WBS`、`01M4X0GJ2YM9HX9R0P7BF5QX6R`、`01M4WYGS48DZE0X55A2HDJMP00`、`01M4WK83ATFMZE2GT1NR2J3H9Z`、`01M4DY9QJG6MXVSR03ZSV76SN1`、`01M4DJ9FZJA5A39ZS0CBB5V8GA` 或 `01M3KKZTFFQTZ3FF0DWWZHP5QV`。

## 2026-10-15：BR-001 安静窗停放不再回退 chrome.windows.update

`placeQuietWindow` 和 `parkQuietWindow` 不再在 `/stage` 失败时调用 `chrome.windows.update`。即使 `focused:false`，这个调用也会把安静窗抬到正在看的页前面。停放和放大只走 `/stage`；助手失败就拒绝后台截图，不抬窗。显式 `select_tab` 仍可聚焦。

- `extension/tests/background.test.cjs` 40 项通过。新增 `background capture refuses when stage fails instead of raising the quiet window`。探测失败用例改为断言没有任何 `windows.update`，安静窗坐标保持原位。
- 扩展 SHA256 `990617b88b1c76686996b5d9853ee827f5bc4fa5966fbc2346c9e52f0b28effc`，工作树与 `~/.vcu/lens-extension/background.js` 一致。`reload_self` 成功，`allow_page_reload=false`，`reloaded=1`。ping 是 `quiet_place=stage-only`，`quiet_probe=stage-only`，`quiet_restack=window-id`，版本 `0.2.8`。
- 重载前后飞书页 `1828171512` 都是用户窗 `1828171349` 的活动页。安静窗 CG `20648` 仍在 `1420,915` 的 `500x375`，窗口列表在飞书 CG `7243` 后面。OS 前台仍是 Ghostty。没有冷启动，没有点 Allow，没有停 daemon `97464`，没有为了对齐旧坐标再挪它。本轮没有重跑会放大安静窗的后台截图。
- Chrome 未运行，记 `not_run`。断连重连未停 daemon，记 `not_run`。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。源状态仍 planned，不能完成。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。不要结束会话 `01M4X5644CBJ89DN3Y69SZ1WBS`、`01M4X0GJ2YM9HX9R0P7BF5QX6R`、`01M4WYGS48DZE0X55A2HDJMP00`、`01M4WK83ATFMZE2GT1NR2J3H9Z`、`01M4DY9QJG6MXVSR03ZSV76SN1`、`01M4DJ9FZJA5A39ZS0CBB5V8GA` 或 `01M3KKZTFFQTZ3FF0DWWZHP5QV`。

## 2026-10-15：BR-001 安静窗探测失败不再用 Chrome API 抬窗

`sunkQuietBounds` 的二分探测只走 `/stage`。助手失败或抛错就停止，不再 `chrome.windows.update` 试更低的位置。那会把安静窗抬到正在看的飞书页前面。失败后的停放请求仍是原来的角落 bounds；单测里助手缺失时，最终 `windows.update` 只有 `1420,880` 的 `500x375`，`focused:false`，没有探测 top。助手可用时，停放和放大仍先走 `/stage`，成功路径不再 `windows.update`。已经停在角落的安静窗仍不重探。

- `extension/tests/background.test.cjs` 39 项通过。新增 `quiet park probe stops when stage fails and does not raise trial bounds`。`background capture stages the quiet window by id` 断言成功的 `/stage` 路径没有 `windows.update`。
- 扩展 SHA256 `b31d3350c0b9c597e65b7fe6f2386ec495371157ce7081e0ef770dc27fc7b45b`，工作树与 `~/.vcu/lens-extension/background.js` 一致。`reload_self` 成功，`allow_page_reload=false`，`reloaded=1`。ping 是 `quiet_probe=stage-only`，`quiet_restack=window-id`，版本 `0.2.8`。
- 重载前后飞书页 `1828171512` 都是用户窗 `1828171349` 的活动页。安静窗 CG `20648` 仍在 `1420,915` 的 `500x375`，窗口列表在飞书 CG `7243` 后面。OS 前台仍是 Ghostty。没有冷启动，没有点 Allow，没有停 daemon `97464`，没有为了对齐旧坐标再挪它。本轮没有重跑会放大安静窗的后台截图。
- Chrome 未运行，记 `not_run`。断连重连未停 daemon，记 `not_run`。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。源状态仍 planned，不能完成。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。不要结束会话 `01M4X5644CBJ89DN3Y69SZ1WBS`、`01M4X0GJ2YM9HX9R0P7BF5QX6R`、`01M4WYGS48DZE0X55A2HDJMP00`、`01M4WK83ATFMZE2GT1NR2J3H9Z`、`01M4DY9QJG6MXVSR03ZSV76SN1`、`01M4DJ9FZJA5A39ZS0CBB5V8GA` 或 `01M3KKZTFFQTZ3FF0DWWZHP5QV`。

## 2026-10-15：BR-001 失败恢复不再抢前台，已停放的安静窗不再重探

后台截图失败时，`restoreUserFocus` 不再调用 `chrome.windows.update({focused:true})`。那会激活 Edge，抢走 OS 前台。现在只恢复被换掉的活动标签，并用窗口 id 回排。已经停在角落的安静窗不再做二分探测，位置未变时也不再 `windows.update`。

- `extension/tests/background.test.cjs` 38 项通过。新增 `already sunk quiet window is not probed over the user page`。抢焦点用例改为断言没有 `focused:true`。
- 扩展 SHA256 `6e38016af7ce1fab85bc541bd8fdc4a5b56ffd56206508c2de17ae50e90d2fd6`，工作树与 `~/.vcu/lens-extension/background.js` 一致。`reload_self` 成功，`allow_page_reload=false`。ping 仍是 `quiet_restack=window-id`，版本 `0.2.8`。
- 重载后飞书页 `1828171512` 仍是用户窗活动页。安静窗 CG `20648` 仍在 `1420,915` 的 `500x375`，窗口列表在飞书 CG `7243` 后面。OS 前台仍是 Ghostty。没有冷启动，没有点 Allow，没有停 daemon `97464`。
- Chrome 未运行，记 `not_run`。断连重连未停 daemon，记 `not_run`。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。源状态仍 planned，不能完成。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。不要结束会话 `01M4X5644CBJ89DN3Y69SZ1WBS`、`01M4X0GJ2YM9HX9R0P7BF5QX6R`、`01M4WYGS48DZE0X55A2HDJMP00`、`01M4WK83ATFMZE2GT1NR2J3H9Z`、`01M4DY9QJG6MXVSR03ZSV76SN1`、`01M4DJ9FZJA5A39ZS0CBB5V8GA` 或 `01M3KKZTFFQTZ3FF0DWWZHP5QV`。


## 2026-10-15：BR-001 按窗口 id 停放安静窗，仍不能完成

回排按 bounds 匹配会在安静窗放大到飞书位置后同时命中两个窗口，最后把安静窗抬到前面。`set index of quiet to 2` 也会把空白窗抬到前面，已删除。`scripts/quiet_window_restack.c` 增加按窗口 id 的 `/restack` 和 `/stage`。`/stage` 只改安静窗 bounds，然后只把用户窗 `set index to 1`，不写用户窗 bounds。扩展停放、放大和视口校正走 `placeQuietWindow`，失败才退回 `chrome.windows.update`。ping 字段是 `quiet_restack=window-id`。

- 02:29 最小后台截图 HTTP 200，`background_capture=true`，`capture_window_id=1828173041`，不是用户窗口 `1828171349`。`user_group_expansions=0`。PNG `viewport-01M4XTV980NY2K2KYEXH1RNFXT.png` 27621 字节，3824x1616，夹具标签 `1828173072`。126 次采样 `covered_samples` 为空，前台只有 Ghostty。飞书页未变，夹具已关闭。本轮没有重跑这次会放大安静窗的截图。证据 `.local/browser-cu/br-001-window-id.json`。
- 只读复核：daemon `97464` 父进程 1，听 `127.0.0.1:17890`。watchdog `5888` 父进程 1，监听 `6245` 听 `127.0.0.1:17991`。扩展 SHA256 `63a9cbc353b815d43d891af21432598d98b093f8bb1a975093bb0c9cdf4108c7`，工作树与 `~/.vcu/lens-extension/background.js` 一致。ping `quiet_restack=window-id`，版本 `0.2.8`。飞书页 `1828171512` 仍是用户窗活动页。安静窗 CG `20648` 停在 `1420,915` 的 `500x375`，窗口列表在飞书 CG `7243` 后面。OS 前台是 Ghostty。没有为了对齐旧坐标再挪它。
- `extension/tests/background.test.cjs` 37 项通过，含 `background capture stages the quiet window by id and does not focus the user window`。Chrome 未运行，记 `not_run`。断连重连未停 daemon，记 `not_run`。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。源状态仍 planned，不能完成。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。不要结束会话 `01M4X5644CBJ89DN3Y69SZ1WBS`、`01M4X0GJ2YM9HX9R0P7BF5QX6R`、`01M4WYGS48DZE0X55A2HDJMP00`、`01M4WK83ATFMZE2GT1NR2J3H9Z`、`01M4DY9QJG6MXVSR03ZSV76SN1`、`01M4DJ9FZJA5A39ZS0CBB5V8GA` 或 `01M3KKZTFFQTZ3FF0DWWZHP5QV`。


## 2026-10-15：BR-001 回排改由会话助手拉起，仍不能完成

launchd 按次启动的 `osascript` 会卡住 Edge Apple Event，且不能为了授权弹窗让用户点允许。已卸掉 `com.vcu.quiet-window-restack`。回排改由当前 GUI 会话里的监听进程处理；进程退出后由同会话 watchdog 拉起，不依赖会退出后停住的 Python 监听。

- 扩展 SHA256 `f22a0cf85e18b7047ef8035f191cd6be97be766240ca7f63157807de1328d53b`，工作树与 `~/.vcu/lens-extension/background.js` 一致。`reload_self` 成功，`allow_page_reload=false`，ping 回报 `quiet_restack=session-helper`。没有 `open -a`，没有点 Allow，没有停 daemon `97464`。
- watchdog pid `5888`，父进程 1。监听进程被杀掉后由它拉起为 pid `5905`，仍听 `127.0.0.1:17991`。两次回排都是 `ok`，不抢 Ghostty。安静窗 CG `20648` 仍是 `1420,890` 的 `500x375`。飞书 CG `7243` 仍是 `0,30 1920x926`，z 序在安静窗前面。
- 最小后台截图 `background_capture=true`，`capture_window_id=1828173041`，不是用户窗口 `1828171349`。`user_group_expansions=0`。PNG `viewport-01M4XT1CD704BKEHPAD1QHEVKC.png` 34142 字节，3824x1616，标签是夹具 `1828173066`，不是飞书页。飞书页 `1828171512` 未变。采样前台只有 Ghostty。没有新增 CG 窗口，没有新增全尺寸在屏 `about:blank`。夹具已关闭。证据 `.local/browser-cu/br-001-session-restack.json`。
- `extension/tests/background.test.cjs` 36 项通过。Chrome 未运行，记 `not_run`。断连重连未停 daemon，记 `not_run`。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。源状态仍 planned，不能完成。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。不要结束会话 `01M4X5644CBJ89DN3Y69SZ1WBS`、`01M4X0GJ2YM9HX9R0P7BF5QX6R`、`01M4WYGS48DZE0X55A2HDJMP00`、`01M4WK83ATFMZE2GT1NR2J3H9Z`、`01M4DY9QJG6MXVSR03ZSV76SN1`、`01M4DJ9FZJA5A39ZS0CBB5V8GA` 或 `01M3KKZTFFQTZ3FF0DWWZHP5QV`。


## 2026-10-15：BR-001 空闲安静窗改到飞书后面，仍不能完成

空闲安静窗不能再盖住正在看的飞书页。Edge 把正常窗口最小夹到 `500x375`，并且拒绝少于约一半在屏内，所以不能整窗沉进 Dock。`chrome.windows.update` 写回用户窗原 bounds 不改变叠放。进程外 `CGSOrderWindow` 返回 1000。Edge AppleScript `set index to 1` 能把用户窗放到安静窗前面，且不激活 Edge、不抢 Ghostty。

- 扩展 SHA256 `4a46aea68fa1e230018c5b0513a3853541821b6517798484a8a8d7f7229073fa`，工作树与 `~/.vcu/lens-extension/background.js` 一致。`reload_self` 成功，`allow_page_reload=false`。没有 `open -a`，没有点 Allow，没有停 daemon `97464`。
- 安静窗 Chrome id `1828173041`，CG `20648`，停在 `1420,890` 的 `500x375`。飞书窗 CG `7243` 仍是 `0,30 1920x926`，z 序在安静窗前面。旧幽灵窗 `20630`、`20633`、`20636`、`20643` 没有新关。回排助手是 `scripts/quiet_window_restack.py`，pid `5176`，父进程 1，只听 `127.0.0.1:17991`。助手不在时扩展仍停放，但安静窗会重新压到飞书上。
- 最小后台截图 `background_capture=true`，`capture_window_id=1828173041`，不是用户窗口 `1828171349`。`user_group_expansions=0`。飞书页 `1828171512` 未变，采样前台只有 Ghostty。没有新增 CG 窗口，没有新增全尺寸在屏 `about:blank`。夹具已关闭。证据 `.local/browser-cu/br-001-restack.json`。
- `extension/tests/background.test.cjs` 36 项通过。Chrome 未运行，记 `not_run`。断连重连未停 daemon，记 `not_run`。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。源状态仍 planned，不能完成。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。不要结束会话 `01M4X5644CBJ89DN3Y69SZ1WBS`、`01M4X0GJ2YM9HX9R0P7BF5QX6R`、`01M4WYGS48DZE0X55A2HDJMP00`、`01M4WK83ATFMZE2GT1NR2J3H9Z`、`01M4DY9QJG6MXVSR03ZSV76SN1`、`01M4DJ9FZJA5A39ZS0CBB5V8GA` 或 `01M3KKZTFFQTZ3FF0DWWZHP5QV`。


## 2026-10-15：BR-001 安静窗停在角落，官方 Edge 基线仍 pass，不能完成

没有 `tabs.captureTab` 时，后台截图仍把目标页短暂移到未聚焦安静窗口，截完放回折叠的 VCU 组。成功路径不再删除或最小化该窗口。删除会在用户窗口同一位置留下窗口服务器幽灵窗；最小化后 CoreGraphics 仍看到全尺寸在屏 `about:blank`。空闲时把同一窗口缩到用户窗口右下角并复用，截图时再放大，不聚焦，不切用户页。

- 扩展 SHA256 `d31c87eda971a9d3f3366ecccfd0c893f4fd20a93681e5415e59489b13422fa6`，工作树与 `~/.vcu/lens-extension/background.js` 一致。`reload_self` 成功，`allow_page_reload=false`。没有 `open -a`，没有点 Allow，没有停 daemon `97464`。
- Edge 把请求的 `360x220` 夹到 `500x375`。复用窗口 Chrome id `1828173041`，CG `20648`，位置 `1560,736`，标题 `about:blank`。这不是新增全尺寸在屏空白窗。旧幽灵窗 `20630`、`20633`、`20636`、`20643` 仍是 `1920x926`，Chrome 看不到，没有关闭。飞书真实窗 CG `7243` 没有隐藏或关闭。
- 最小后台截图和官方 POC 都没有切飞书页 `1828171512`，没有展开用户组，前台保持 Ghostty。官方 `scripts/poc_browser_br_001_macos.py` 的 Edge 基线 pass：`capture_window_id=1828173041`，用户窗口 `1828171349`，CoreGraphics 采样 31 次，`fixture_title_seen=true`，`user_group_expansions=0`，`new_window_ids=[]`。Chrome 未运行，记 `not_run`。断连重连未停 daemon，记 `not_run`。`completion_allowed=false`。
- 证据是 `.local/browser-cu/br-001.json` 和 `.local/browser-cu/br-001-corner-park.json`。`extension/tests/background.test.cjs` 36 项通过。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。源状态仍 planned，不能完成。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。不要结束会话 `01M4X5644CBJ89DN3Y69SZ1WBS`、`01M4X0GJ2YM9HX9R0P7BF5QX6R`、`01M4WYGS48DZE0X55A2HDJMP00`、`01M4WK83ATFMZE2GT1NR2J3H9Z`、`01M4DY9QJG6MXVSR03ZSV76SN1`、`01M4DJ9FZJA5A39ZS0CBB5V8GA` 或 `01M3KKZTFFQTZ3FF0DWWZHP5QV`。

## 2026-10-15：BR-001 官方门禁加入后台截图，Edge 仍 pass，Chrome 仍 not_run

`scripts/poc_browser_br_001_macos.py` 现在会在 Edge 基线里截后台夹具页，并检查受保护页、用户窗口标签组和 OS 前台。结果仍是 `completion_allowed=false`。

- 截图 `ok=true`，`background_capture=true`，`source=extension_viewport`。`capture_window_id=1828172994`，用户窗口是 `1828171349`。采样只有 1 次，因为前台查询比搬移慢；不能把这一次采样写成全程监视。结果字段和结束后的标签状态证明截图没有留在用户窗口。
- 受保护页始终是飞书 `1828171512`。前台保持 Ghostty。夹具已关闭，组已消失，只剩用户窗口。没有冷启动，没有点 Allow，没有停 daemon `97464`。
- Chrome 仍 `not_run`。断连重连仍 `not_run`。工作树脏，HEAD `e6fa5e9`，没有干净 SHA。不能标完成。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。不要结束会话 `01M4X5644CBJ89DN3Y69SZ1WBS`、`01M4X0GJ2YM9HX9R0P7BF5QX6R`、`01M4WYGS48DZE0X55A2HDJMP00`、`01M4WK83ATFMZE2GT1NR2J3H9Z`、`01M4DY9QJG6MXVSR03ZSV76SN1`、`01M4DJ9FZJA5A39ZS0CBB5V8GA` 或 `01M3KKZTFFQTZ3FF0DWWZHP5QV`。

## 2026-10-15：BR-001 官方 Edge 基线通过，Chrome 仍 not_run

`scripts/poc_browser_br_001_macos.py` 在当前脏树上返回 `completion_allowed=false`。Edge 基线 `pass`，Chrome `not_run`。这不是完成。

- 没有冷启动。Edge 进程始终是 `95352`。没有 `open -a`，没有点 Allow，没有停 daemon `97464`。
- Edge：observe `source=extension_viewport`，extract `source=extension_dom`，重载前后版本都是 `0.2.8`。受保护页始终是飞书 `1828171512`，`protected_tab_unchanged=true`。OS 前台前后都是 Ghostty。夹具 `1828172987` 已关闭，组已消失，只剩用户窗口 `1828171349`。
- 反向：未连接的 Chrome observe 被拒绝，没有串到 Edge。`never_click_allow=true`。agent profile、reload 定向、browser_gates 和扩展测试通过。已在跑的 daemon 没有被停，所以断连重连记 `not_run`，不是通过。
- 证据 `.local/browser-cu/br-001.json`。工作树仍脏，HEAD `e6fa5e9`。没有干净 SHA，不能标完成。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。不要结束会话 `01M4X5644CBJ89DN3Y69SZ1WBS`、`01M4X0GJ2YM9HX9R0P7BF5QX6R`、`01M4WYGS48DZE0X55A2HDJMP00`、`01M4WK83ATFMZE2GT1NR2J3H9Z`、`01M4DY9QJG6MXVSR03ZSV76SN1`、`01M4DJ9FZJA5A39ZS0CBB5V8GA` 或 `01M3KKZTFFQTZ3FF0DWWZHP5QV`。

## 2026-10-15：BR-001 后台截图不展开用户窗口里的 VCU 组，源状态未完成

用户要求浏览器操作不得替换正在使用的页面，只在自己的折叠标签组里工作。`BR-001` 仍是 planned，不能标完成。

- 复核 daemon `97464` 仍在，父进程 1，听 `127.0.0.1:17890`，二进制是工作树 `target/debug/vcu-daemon`。没有覆盖 `~/.local/bin`。工作树 `extension/background.js` 与 `~/.vcu/lens-extension/background.js` SHA256 一致：`d88d7551e178402918b4b40ac4d37a09a20001ebc0aed7fd759769f359c44e21`。没有 `open -a`，没有冷启动，没有点 Allow。
- 当前 ping HTTP 200，版本 `0.2.8`，`quiet_tab_group=true`，`quiet_background_capture=true`。这台 Edge 没有 `tabs.captureTab`，所以 `background_capture=false`，后台截图走未聚焦安静窗口。
- 真机证据 `.local/browser-cu/br-001-collapsed-capture.json`：受保护页是飞书 `1828171512`，窗口 `1828171349`。截图 `background_capture=true`，`capture_window_id=1828172973`，不是用户窗口。采样期间 `expanded_user_window_groups=[]`，`stolen_active=[]`，前台是 Ghostty。夹具已关闭，组已消失。
- 停手复核：活动页仍是飞书 `1828171512`，只剩用户窗口 `1828171349`，组为空。OS 前台是 Ghostty。
- `extension/tests/background.test.cjs` 36 项通过，包含 `background capture restores a collapsed VCU group without expanding it`。视口在安静窗口读取，放回时不把用户窗口里的 VCU 组展开。
- Chrome 未运行，记 `not_run`。工作树是脏的，HEAD 仍是 `e6fa5e9`。没有干净 SHA，双浏览器证据没有，不能标完成。
- 没有自动领取 `CORE-001`：`BR-001` 仍是当前领取项，用户要求先完成它。`CORE-001` 只是可领取，不是本轮下一项。不要领取 `BR-002` 或 `MAC-007`。不要结束会话 `01M4X5644CBJ89DN3Y69SZ1WBS`、`01M4X0GJ2YM9HX9R0P7BF5QX6R`、`01M4WYGS48DZE0X55A2HDJMP00`、`01M4WK83ATFMZE2GT1NR2J3H9Z`、`01M4DY9QJG6MXVSR03ZSV76SN1`、`01M4DJ9FZJA5A39ZS0CBB5V8GA` 或 `01M3KKZTFFQTZ3FF0DWWZHP5QV`。

## 2026-10-15：BR-001 后台重载和打开不切飞书页，源状态未完成

用户要求浏览器操作不得替换正在使用的页面，只在自己的折叠标签组里工作。`BR-001` 仍是 planned，不能标完成。

- daemon `97464` 仍在，父进程 1，听 `127.0.0.1:17890`，二进制是工作树 `target/debug/vcu-daemon`。没有覆盖 `~/.local/bin`。扩展文件与工作树 `extension/background.js` 一致。没有 `open -a`，没有冷启动，没有点 Allow。
- 重启后扩展已重新 poll。`POST /v1/browser/ping` `reload=true, allow_page_reload=false` 返回 HTTP 200，`reloaded=1`。这是 `reload_self`，不是可见页重载。重连后 ping 版本仍是 `0.2.8`，`background_reload_tab=true`，`quiet_tab_group=true`。
- 受保护页从头到尾是飞书文档 `1828171512`，窗口 `1828171349`，URL `https://pcnizpum6g5i.feishu.cn/wiki/FDRjw3hZWiDKHQkULu1cVyLjnrg`。没有切回旧的 Bilibili。OS 前台全程是 Ghostty，没有被抢走。
- 后台打开本机夹具进入同一窗口的折叠 VCU 组：`collapsed=true`，标签 `active=false`。提取 `source=extension_dom`，读到夹具标记。测试页已关闭，组已消失，用户页仍是飞书。证据 `.local/browser-cu/br-001-quiet-reload.json`。
- Chrome 未运行，记 `not_run`。工作树是脏的，HEAD 仍是 `e6fa5e9`。没有干净 SHA，双浏览器证据没有，不能标完成。
- `scripts/poc_browser_br_001_macos.py` 不再调用 `open -a`，也不再走 `install-lens --reload`。未连接时只记未连接。
- 不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。不要结束会话 `01M4X5644CBJ89DN3Y69SZ1WBS`、`01M4X0GJ2YM9HX9R0P7BF5QX6R`、`01M4WYGS48DZE0X55A2HDJMP00`、`01M4WK83ATFMZE2GT1NR2J3H9Z`、`01M4DY9QJG6MXVSR03ZSV76SN1`、`01M4DJ9FZJA5A39ZS0CBB5V8GA` 或 `01M3KKZTFFQTZ3FF0DWWZHP5QV`。

## 2026-10-14：BR-001 动作后截图仍留在折叠组，源状态未完成

用户要求浏览器操作不得替换正在使用的页面，只在自己的折叠标签组里工作。`BR-001` 仍是 planned，不能标完成。

- 2026-10-14 停手前已 `awr source reindex`，project revision `274`，source issues 0。台账证据指向 `docs/HANDOFF.md`、`docs/PLAN-BROWSER.md` 和 `.local/browser-cu/br-001-actions.json`。这些证据没有干净 SHA 绑定，不能当完成证明。AWR：Continue 1（`BR-001`），Claimable 1（`CORE-001`），Waiting 23，Blocked 1（`VISION-NEXT` draft）。没有领取 `CORE-001`。

- 工作树 daemon 是 `94041`，父进程 1，听 `127.0.0.1:17890`。没有覆盖 `~/.local/bin`。只复制 `extension/background.js` 到 `~/.vcu/lens-extension`，`reload_self` 成功，`page_reload=false`，没有 `open -a`，没有点 Allow。
- Edge 没有 `tabs.captureTab`。后台截图仍把目标页短暂移到未聚焦安静窗口，截完放回。放回后若立刻折叠，内容脚本会失去响应；所以先在未折叠的 VCU 组读视口，确认 URL、尺寸、滚动和布局，再折回并关闭安静窗口。不展开用户正在看的组，不激活用户页，不抢 OS 前台。
- 后台滚动只认 page-world `window.scrollY`。仅 `scrollTop` 变化不算成功，否则会误报 `scroll_y=480` 而画面仍在页顶。
- `scripts/poc_browser_br_001_actions.py` 返回 `ok=true`。点击、输入、悬停、提取、滚动和像素观察都留在折叠 VCU 组，`agent_active=false`。受保护页从头到尾是 Bilibili 首页 `1828171351`。OS 前台全程是已经在前台的 Microsoft Edge，没有被抢走。滚动 `scroll_y=480`，观察元数据也是 480，URL 是本机夹具，不是用户页。PNG 顶部是间隔色 `(34, 34, 34)`。测试页和组已清理，Edge 窗口数回到 1。
- 扩展测试 `extension/tests/background.test.cjs` 34 项通过。Chrome 未运行，记 `not_run`。工作树是脏的，HEAD 仍是 `e6fa5e9`。双浏览器和干净 SHA 都没有，不能标完成。
- 恢复前台时跳过微信，不激活它。不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。不要结束会话 `01M4X5644CBJ89DN3Y69SZ1WBS`、`01M4X0GJ2YM9HX9R0P7BF5QX6R`、`01M4WYGS48DZE0X55A2HDJMP00`、`01M4WK83ATFMZE2GT1NR2J3H9Z`、`01M4DY9QJG6MXVSR03ZSV76SN1`、`01M4DJ9FZJA5A39ZS0CBB5V8GA` 或 `01M3KKZTFFQTZ3FF0DWWZHP5QV`。


## 2026-10-14：BR-001 后台截图不切当前页，仍未完成

用户要求浏览器操作不得替换正在使用的页面，要像 Codex Computer Use 一样只在自己的标签组里工作。`BR-001` 仍是 planned，不能标完成。

- 工作树 daemon 已从 `91792` 换成 `93219`，仍听 `127.0.0.1:17890`，父进程是 1。没有覆盖 `~/.local/bin`。只复制了 `extension/background.js` 到 `~/.vcu/lens-extension`，`reload_self` 成功，`page_reload=false`，没有 `open -a`，没有点 Allow。
- Edge 真机：折叠 VCU 组打开夹具页后，后台截图返回 `background_capture=true`，`capture_window_id` 不是用户窗口。受保护页仍是 Bilibili `1828171545`。OS 前台全程是 Hearthstone，120ms 采样没有被抢走。测试页已关闭，组已消失，Edge 窗口数回到 1。
- 这台 Edge 只有 `captureVisibleTab`，没有 `tabs.captureTab`。后台标签会短暂移到未聚焦的安静窗口，按原 viewport 截图后放回折叠组并关闭该窗口。安静窗口造成的 revision 跳动可以忽略；活动页截图仍拒绝真实 revision 变化。PNG 是整幅夹具色，显示配置把 CSS `#ff00aa` 记成 `(232, 50, 168)`，不是用户页。
- 指定 `browser=chrome` 且 Chrome 未连接时，旧 daemon 会把无 tab 截图派给 Edge 并截到用户当前页。该图已删除。新 daemon 返回 HTTP 400 `ActionFailed`，不产生新截图，不启动 Chrome。
- Chrome 未运行，记 `not_run`。工作树是脏的。双浏览器正反向和干净 SHA 都还没有，不能标完成。
- 不要领取 `CORE-001`、`BR-002` 或 `MAC-007`。不要结束会话 `01M4X5644CBJ89DN3Y69SZ1WBS`、`01M4X0GJ2YM9HX9R0P7BF5QX6R`、`01M4WYGS48DZE0X55A2HDJMP00`、`01M4WK83ATFMZE2GT1NR2J3H9Z`、`01M4DY9QJG6MXVSR03ZSV76SN1`、`01M4DJ9FZJA5A39ZS0CBB5V8GA` 或 `01M3KKZTFFQTZ3FF0DWWZHP5QV`。

## 2026-10-14：MAC-006 完成

`e6fa5e9aee54d96360e085ec4b8cd65314333187` 干净工作树复跑 `scripts/poc_mac_006_session.py` 返回 `ok=true`，`dirty=false`，`completion_allowed=true`。证据 `mac-006-stage` 已登记。`awr work complete` 不能改写 `.awr` 台账，所以完成状态直接写在源台账。不要领取 `MAC-007`、`BR-001` 或 `CORE-001`，除非用户明确要求。停手时 AWR ready 已有 `BR-001` 和 `CORE-001`。`MAC-007` 仍等待 `BR-004`。不要结束会话 `01M4X0GJ2YM9HX9R0P7BF5QX6R`、`01M4WYGS48DZE0X55A2HDJMP00`、`01M4WK83ATFMZE2GT1NR2J3H9Z`、`01M4DY9QJG6MXVSR03ZSV76SN1`、`01M4DJ9FZJA5A39ZS0CBB5V8GA` 或 `01M3KKZTFFQTZ3FF0DWWZHP5QV`。

- 两块显示器都是 2×。屏幕未锁。查询屏幕和坐标映射没有启动 HUD。
- HUD 可见时 Guide hover HTTP 200，命中 AX `[124, 897]`，窗口点 `[92, 863]`。系统光标前后都是 `[3173.234375, 668.8125]`，`os_cursor_used=false`。
- 隐藏 HUD 后 hover 和 `/v1/app/invoke` 都是 HTTP 400 `StageRequired`。helper `SIGKILL` 后窗口清空，动作 HTTP 404 `SessionNotFound`。
- daemon `SIGKILL` 后 epoch 从 `01M4X2NWFRD8546YA9H1VG3FS4` 变为 `01M4X2P4V8BZEEDXXXB7TT3T84`。旧 Scene 不复用，orphan stage 被 sweep，旧 ref HTTP 400 `InvalidInput`。
- CLI、MCP 和 abort 文件都清理了自建 HUD/Guide。abort 文件是 Escape 写入的同一清理路径。物理 Escape 键没有按，不能写成已验证。
- 1×、3× 和负原点真机点位未测。负坐标确定性测试 `negative_display_origin_maps_retina_pixels_and_guide` 通过。同一次干净 SHA 上，helper reap、隐藏 Stage 拒绝和 orphan sweep 单测通过。
- 没有改 TCC，没有点 Edge Allow，没有移动系统光标，没有自动化微信，没有注入全局 Escape。

## 2026-10-14：MAC-005 完成

`bfff2f420d2d2882fc7d5962628873efc8a6d977` 干净工作树复跑 `scripts/poc_mac_005_navigation.py` 返回 `ok=true`，`dirty=false`，`completion_allowed=true`。证据 `mac-005-navigation` 已登记。`awr work complete` 不能改写 `.awr` 台账，所以完成状态直接写在源台账。不要领取 `MAC-006` 或 `BR-001`，除非用户明确要求。不要结束会话 `01M4WYGS48DZE0X55A2HDJMP00`、`01M4WK83ATFMZE2GT1NR2J3H9Z`、`01M4DY9QJG6MXVSR03ZSV76SN1`、`01M4DJ9FZJA5A39ZS0CBB5V8GA` 或 `01M3KKZTFFQTZ3FF0DWWZHP5QV`。

- `scroll-a` 从 0 到 90，`scroll-b` 保持 0。重新观察后 `scroll-b` 从 0 到 90，`scroll-a` 保持 90。两条 `verified=true`，`scroll_route=scroll-area-bar`，读回 `offset=90 bar=0.2`。
- 按钮滚动 HTTP 400，两个 offset 仍是 90，三个按钮计数仍是 0。已消费代次拒绝重放。
- wait 名称/角色命中 `scroll-a` / `AXScrollArea`，返回的是新 bound ref。无 `window_id` 时拒绝猜测。缺失目标 700ms 超时。旧 ref 不能重放。
- TextEdit 值等待命中 `AXTextArea`，AppleScript 独立读回 `VCU-MAC-005-0c04fff6`。提取 `source=desktop.scene`，count 1。没有重开 MAC-004 历史文件，也没有读回 `VCU-MAC-004-eb21c3ba`。
- 夹具提取看到 1 个 password 节点，值为空且 `redacted=true`。`vcu-secret-should-not-leak` 未出现。`os_cursor_used=false`，`hid_injected=false`。
- 同一次干净 SHA 上，`app::binding::tests` 7 passed，包含 `scroll_route_stays_on_the_named_control`。没有改 TCC，没有点 Edge Allow，没有移动系统光标，没有自动化微信。
- 不宣称滚动区的 `AXScrollDownByPage` 已在真机上作为成功路径验证。夹具滚动区走的是自身滚动条。非滚动区翻页动作只在单测里覆盖。

## 2026-10-14：MAC-004 完成

`64daa23271f8d9375f4195b09a3c4acefd7cfa7f` 干净工作树复跑 `scripts/poc_mac_004_actions.py` 返回 `ok=true`，`dirty=false`，`completion_allowed=true`。证据 `mac-004-actions` 已登记。`awr work complete` 不能改写 `.awr` 台账，所以完成状态直接写在源台账。不要领取 `MAC-005` 或 `BR-001`，除非用户明确要求。不要结束会话 `01M4WK83ATFMZE2GT1NR2J3H9Z`、`01M4DY9QJG6MXVSR03ZSV76SN1`、`01M4DJ9FZJA5A39ZS0CBB5V8GA` 或 `01M3KKZTFFQTZ3FF0DWWZHP5QV`。

- TextEdit 自建文件写入 `VCU-MAC-004-eb21c3ba`，AppleScript 独立读回一致。`go-a` live 从 0 到 1，`verified=true`，读回 `presses=1`。
- 1.2 秒慢按压 HTTP 1.862 秒保留，`go-a` 从 1 到 2。1.5 秒边界按压 HTTP 2.178 秒保留，`go-a` 从 2 到 3。4.191 秒超时返回 `ax command timed out`，计数未变。
- `e1`、`n1`、只读 set-value、`go-fail` 和已消费代次都拒绝，没有改其他目标。终端换行 HTTP 409，没有启动 Terminal。`os_cursor_used=false`，`hid_injected=false`。
- 同一次干净 SHA 上，`app::binding::tests` 6 passed，`ax_bfs_scripts_share_walk_and_avoid_entire_contents` 1 passed。没有改 TCC，没有点 Edge Allow，没有移动系统光标，没有自动化微信。
- 下面 17:58 和 18:01 的脏树记录已被这次干净复跑取代，不能再当作当前结果。


## 2026-10-14 18:01：绑定单测复跑通过，仍不是完成

`cargo test -p vcu-server --lib --offline -- app::binding::tests` 6 passed。`ax_bfs_scripts_share_walk_and_avoid_entire_contents` 1 passed，覆盖终端换行拒绝和 TextEdit 换行放行。这只证明当前脏树的脚本门禁，不替代 17:58 真机报告，也不能把 `MAC-004` 标成 completed。

## 2026-10-14 17:58：解锁后 MAC-004 脏树 POC ok=true，不是完成

`.local/desktop-cu/mac-MAC-004.json` 最新报告 `ok=true`，`completion_allowed=false`。HEAD 仍是 `501d476`，工作树脏。源状态保持 `planned`，证据数 0。16:25 的“屏幕锁定、POC 未复跑”已被这次真机报告取代，但不能把脏树通过写成完成。

- 屏幕已解锁，`CGSSessionScreenIsLocked=false`。复跑了 `scripts/poc_mac_004_actions.py`。24 项检查全部 pass。`os_cursor_used=false`。
- 慢返回读回仍在 `tell application "System Events"` 内，最多 3 次、间隔 0.2 秒。`action_slow_press_kept`：HTTP 200，`elapsed_s=1.862`，`verified=true`，读回 `presses=2`，`go-a` 从 1 到 2。`action_edge_press_kept`：HTTP 200，`elapsed_s=2.18`，读回 `presses=3`，`go-a` 从 2 到 3。两条都没有进入 4 秒杀手。
- `action_timeout_isolated`：HTTP 400，`elapsed_s=4.185`，错误是 `ax command timed out`。计数未变，`go-a=3`。`action_timeout_not_replayed`：0.002 秒返回 `scene generation was consumed`。
- TextEdit 独立读回 `VCU-MAC-004-7a150f03`。终端换行返回 HTTP 409 `FocusPolicyViolation`，没有启动 Terminal。
- POC 不再把系统光标像素完全相等当成这四项的通过条件。坐标仍写入报告。通过条件仍是 `os_cursor_used=false`、`hid_injected=false`、HTTP 结果、计数或进程未误变。这次运行光标坐标碰巧没变，不代表像素相等仍是门槛。
- 当前领取仍是会话 `01M4WK83ATFMZE2GT1NR2J3H9Z`。不要结束旧会话，不要领取 `BR-001`。完成前必须由用户要求提交，再在干净 SHA 上复跑，`dirty=false` 且 `ok=true`，然后绑定证据。


## 2026-10-14 16:25：读回留在 System Events 内，屏幕仍锁定

`vcuChanged` 处理器在 tell 外读 AX 元素，引用可能无效，已删掉。成功和错误分支都在 `tell application "System Events"` 内重试读 `AXHelp`/`AXValue`，最多 3 次、间隔 0.2 秒。状态变化才返回 `PRESSED`，否则进入 4 秒杀手。`app::binding::tests` 6 passed，`vcu-cli` 已重新构建。`CGSSessionScreenIsLocked` 仍是 true，POC 未复跑。16:14 报告不覆盖这段代码。不要领取 `BR-001`。解锁后先复跑 `scripts/poc_mac_004_actions.py`。

## 2026-10-14 16:23：读回重试已写入，屏幕仍锁定


慢返回的 AX 读回改为最多 3 次、间隔 0.2 秒。成功分支和错误分支都先看状态是否变化，没变化才进入 4 秒杀手。`app::binding::tests` 6 passed，`vcu-cli` 已重新构建。`CGSSessionScreenIsLocked` 仍是 true，POC 未复跑。16:14 报告不覆盖这段代码。不要领取 `BR-001`。

## 2026-10-14 16:20：MAC-004 慢按压读回已写入，真机未复跑


锁屏，`CGSSessionScreenIsLocked=true`。没有启动 GUI 夹具，也没有重跑 `scripts/poc_mac_004_actions.py`，避免用锁屏失败覆盖 16:14 报告。16:14 的 `ok=true` 不覆盖这次代码。

- 慢按压不再只靠 `elapsed >= 1.45` 杀进程。System Events 返回且耗时达到 1.45 秒时，同一脚本读 AXHelp/AXValue。读回相对动作前变化才返回 `PRESSED`；否则 `delay 5`，仍由 4 秒杀手消费代次。错误分支仍在 1.45 秒后进入杀手，避免 `return false` 的挂起被写成普通失败。
- 夹具新增 `arm-edge`：睡 1.5 秒后计数并返回。POC 增加 `action_edge_press_kept`。这是为了覆盖 1.45 到约 1.6 秒的完成按压，但锁屏期间没有真机结果。
- `app::binding::tests` 6 passed。`vcu-cli` 已离线构建。HEAD 仍是 `501d476`，工作树脏。源状态保持 `planned`，证据数 0。
- 当前领取仍是会话 `01M4WK83ATFMZE2GT1NR2J3H9Z`。不要结束旧会话，不要领取 `BR-001`。解锁后先复跑 POC。完成前仍须用户要求提交、干净 SHA、`dirty=false` 且 `ok=true` 的复跑，再绑定证据。

## 2026-10-14 16:14：MAC-004 放弃阈值收紧，脏树 POC ok=true（已被 16:20 代码取代，真机报告不覆盖新代码）


`.local/desktop-cu/mac-MAC-004.json` 最新报告 `ok=true`，`completion_allowed=false`。HEAD 仍是 `501d476`，工作树脏。源状态保持 `planned`，证据数 0。16:04 的报告已被这次取代，但不能把脏树通过写成完成。

- 动作脚本放弃阈值从 `>= 1` 收到 `>= 1.45`。System Events 约 1.6 秒放弃仍在执行的 `AXPress`。1.45 秒以下完成的按压仍返回 `PRESSED`；约 1.6 秒放弃的调用进入 `delay 5`，由 4 秒杀手消费代次。1.45 到约 1.6 秒之间真正完成的慢按压仍可能被误杀，这次没有覆盖该区间。
- `action_slow_press_kept` 通过：夹具在 `accessibilityPerformPress` 睡 1.2 秒后计数并返回。HTTP 200，`elapsed_s=1.872`，`verified=true`，读回 `presses=2`，`go-a` 从 1 到 2，`go-b` 仍为 0。没有进入 4 秒杀手。
- `action_timeout_isolated` 通过：挂起改为睡 1.7 秒后返回 false。HTTP 400，`elapsed_s=4.187`，错误是 `ax command timed out`。计数未变：`go-a=2`，`go-b=0`，`go-fail=0`。
- `action_timeout_not_replayed` 通过：0.003 秒返回 `scene generation was consumed`。
- 同一次报告里，TextEdit 独立读回 `VCU-MAC-004-f478007e`，`go-a` live 按压、错 ref、只读、`go-fail`、终端换行 409 都是 pass。`os_cursor_used=false`。`app::binding::tests` 6 passed。
- 当前领取仍是会话 `01M4WK83ATFMZE2GT1NR2J3H9Z`。不要结束旧会话，不要领取 `BR-001`。完成前必须在用户要求提交后的干净 SHA 上复跑，`dirty=false` 且 `ok=true`，再绑定证据。

## 2026-10-14 16:04：MAC-004 脏树 POC ok=true（已被 16:14 报告取代）

`.local/desktop-cu/mac-MAC-004.json` 最新报告 `ok=true`，`completion_allowed=false`。HEAD 仍是 `501d476`，工作树脏。源状态保持 `planned`，证据数 0。15:30 的 `ok=false` 已被这次报告取代，但不能把脏树通过写成完成。

- `action_timeout_isolated` 通过：HTTP 400，`elapsed_s=4.21`，错误是 `ax command timed out`。这是 `run_osascript_timeout` 的 4 秒杀手，不是窗口消失。计数未变：`go-a=1`，`go-b=0`，`go-fail=0`。
- System Events 约 1.6 秒就会放弃仍在执行的 `AXPress` 并返回成功。夹具挂起留在 `accessibilityPerformPress`，只睡 1.55 秒后返回，避免主线程在 System Events 返回后继续堵死读回。动作脚本在按压耗时达到 1 秒时不报 `PRESSED`，把同一个 osascript 留到 4 秒杀手。
- `action_timeout_not_replayed` 通过：0.003 秒返回 `scene generation was consumed`。
- 同一次报告里，TextEdit 独立读回 `VCU-MAC-004-85abe436`、`go-a` live 按压读回 `presses=1`、错 ref、只读、`go-fail`、终端换行 409 都是 pass。`os_cursor_used=false`。
- 当前领取仍是会话 `01M4WK83ATFMZE2GT1NR2J3H9Z`。不要结束旧会话，不要领取 `BR-001`。完成前必须在用户要求提交后的干净 SHA 上复跑，`dirty=false` 且 `ok=true`，再绑定证据。

## 2026-10-14 15:30：MAC-004 脏树报告 ok=false（已被 16:04 报告取代）

`.local/desktop-cu/mac-MAC-004.json` 的最新报告是 `ok=false`，`completion_allowed=false`。HEAD 仍是 `501d476`，工作树脏。源状态保持 `planned`，证据数 0。下面较早的 `ok=true` 记录已被这次报告取代，不能再当作当前结果。

- `action_timeout_isolated` 失败：HTTP 400，`elapsed_s=3.463`，错误是 `bound window or element is gone`，不是超时。目标是新快照的 `go-a`，`bound_ref=b1.01M4WN2SNH97217GZ9ATW918H4.n2`。计数未变：`go-a=1`，`go-b=0`，`go-fail=0`。系统光标坐标未变。
- `action_timeout_not_replayed` 通过：0.003 秒返回 `scene generation was consumed`。这只说明重放被拒绝，不证明超时杀手已执行。
- 同一次报告里，TextEdit 独立读回、`go-a` live 按压、错 ref、只读、`go-fail`、终端换行 409 都是 pass。这些通过项不能把总报告写成 `ok=true`。
- 当前领取仍是会话 `01M4WK83ATFMZE2GT1NR2J3H9Z`。不要结束旧会话，不要领取 `BR-001`。完成前必须先让有上限的真机超时进入杀手路径，再在干净 SHA 上复跑并绑定证据。

## 2026-10-14：MAC-004 较早脏树 POC 通过（已被 15:30 报告取代）

`scripts/poc_mac_004_actions.py` 在未锁屏的本机返回 `ok=true`。证据文件是 `.local/desktop-cu/mac-MAC-004.json`。HEAD 仍是 `501d476`，工作树是脏的，报告 `completion_allowed=false`。这不是完成证据，源状态保持 `planned`，没有登记 completion evidence，没有改台账为 completed。

- TextEdit 自建文件 `VCU-MAC-004.txt` 写入 `VCU-MAC-004-9a440045`，AX 读回与 AppleScript 独立读回一致，`verified=true`，`os_cursor_used=false`。中文系统窗口所有者是「文本编辑」，POC 按 PID 找窗口。
- 夹具 `go-a` live 按压后独立读回 `presses=1`，`go-b` 仍为 0。系统光标前后坐标未变。dry-run 不改变计数。已消费代次重放返回 400。
- 错 ref `e1`/`n1` 被拒绝。新观察后的 `go-fail` 按压返回 ActionFailed，计数不变。只读 `locked` 因不可编辑且无 AXSetValue 被拒绝，没有改其他目标。
- 终端换行门禁已走隔离 daemon：`proc:Terminal:1` 提交 `echo\nhi` 返回 HTTP 409 `FocusPolicyViolation`，没有启动 Terminal，系统光标坐标未变。TextEdit 换行不受该门禁拦截。超时仍只有单测，没有真机挂起。
- 当前领取会话是 `01M4WK83ATFMZE2GT1NR2J3H9Z`，继承自 `01M4WHM4WCRMSBK3Z6W3QJCC71`。不要结束旧会话，不要领取 `BR-001`。完成前必须在干净 SHA 上复跑 POC 并绑定证据。

## 2026-10-14：最高准则写入台账

用户要求把停手前自检写入 AWR 台账的最高准则。已写入 `AGENTS.md`「最高准则」、`.awr/intake/work-ledger.yaml` 头部、`GOALS.md` 的 `goal#vcu`，并同步 `docs/PLAN.md`。这是治理规则，不是功能完成。

停手、挂起、阻塞或标记完成前必须 `rtk proxy awr --project . status` 和 `ready`。仍有可执行或待派发工作时如实报告。假阻塞不得写成 blocked。禁止说谎，禁止未充分测试就标记完成。任务和阶段完成后必须落地标注和文档。不得擅自领取下一项。

## 2026-10-09 会话关闭：MAC-003 已完成，未领取下一项

用户要求记录进度并关闭当前会话。已核对 Git 与 AWR，没有领取新工作，没有提交，没有推送。HEAD 仍是 `501d476`（`docs: mark MAC-003 complete after the clean binding POC`），比 `origin/main` 超前 9。功能证据是代码提交 `2033326`，不要把 `501d476` 或本段未提交文档当成新功能。

- 关闭记录本身未提交。脏文件只有 `docs/HANDOFF.md` 和 `docs/PLAN.md`。不要丢弃，也不要把它记成产品完成证据。
- `MAC-001`、`MAC-002`、`MAC-003` 源状态都是 completed。`MAC-003` 证据 `mac-003-binding` 绑定干净 SHA `2033326d03798122cdbf5d1e5478f02bd3fd11ff`，POC `ok=true`，`dirty=false`。不要重做，也不要改回未完成。
- AWR 关闭核对：Continue 0，Claimable 2，Waiting 26，Blocked 1。`MAC-004` 和 `BR-001` 都是 ready，都没有 claim。下次没有用户明确要求就不要领取，也不要开始实现。
- `MAC-003` 仍有 active claim，会话 `01M4DY9QJG6MXVSR03ZSV76SN1`。`01M4DJ9FZJA5A39ZS0CBB5V8GA`、`01M3KKZTFFQTZ3FF0DWWZHP5QV` 和更早的 active 会话都还在。不要结束它们。
- 没有改 TCC，没有点 Edge Allow，没有移动系统光标，没有自动化微信，没有改 `~/.codex/computer-use/`，没有覆盖 `~/.local/bin`。

下次先读 `docs/PLAN.md`、`docs/PLAN-MACOS.md` 和本文。Shell 命令前缀用 `rtk`。锁屏时不要把空 AX 树当成产品故障。

```sh
rtk git status --short
rtk proxy awr --project . status
```

## 2026-10-09：MAC-003 完成

`2033326d03798122cdbf5d1e5478f02bd3fd11ff` 干净工作树复跑 `scripts/poc_mac_003_binding.py` 返回 `ok=true`，`dirty=false`。证据 `mac-003-binding` 已登记。`awr work complete` 不能改写 `.awr` 台账，所以完成状态直接写在源台账。不要领取 `MAC-004` 或 `BR-001`，除非用户明确要求。不要结束会话 `01M4DY9QJG6MXVSR03ZSV76SN1`、`01M4DJ9FZJA5A39ZS0CBB5V8GA` 或 `01M3KKZTFFQTZ3FF0DWWZHP5QV`。

- 未指定窗口返回 `ambiguous_window` 且没有 bound ref。同名 `Go` 分别绑定 `go-a` 和 `go-b`。
- 旧 `e1`/`n1`、插入、替换、重排、关闭和已消费代次都是 HTTP 400，没有误按。新观察后的 dry-run 不按，live 只增加目标计数。
- 截图绑定窗口 `1845`、几何、缩放 2 和 scene 代次。前台保持 Microsoft Edge。`os_cursor_used=false`，`focus_stolen=false`。
- 夹具按钮的 System Events 角色是 `AXUnknown`，不是 `AXButton`。隔离靠 identifier 和按压计数，不把角色写成按钮。
- 锁屏时公开 AX 会把窗口藏成 `AXApplication`。POC 在锁屏时直接失败。没有改 TCC，没有点 Edge Allow，没有移动系统光标，没有自动化微信。

## 2026-10-08：MAC-002 完成

`a350741e2c875bf70ef0574ee30912d0b7e2e32a` 干净工作树复跑 `scripts/poc_mac_002_scene.py` 返回 `ok=true`，`dirty=false`。TextEdit 29 个元素，Finder 51 个元素，协作式超时 9 个元素。证据 `mac-002-scene` 已登记。`awr work complete` 不能改写 `.awr` 台账，所以完成状态直接写在源台账。不要领取 `MAC-003` 或 `BR-001`，除非用户明确要求。不要结束会话 `01M4DJ9FZJA5A39ZS0CBB5V8GA` 或 `01M3KKZTFFQTZ3FF0DWWZHP5QV`。

- 只读 Scene 用 CGWindowID 选择窗口，不回退 `window 1`。`nN` 引用拒绝 live mutation。
- 0 元素外部超时不算 TextEdit 或 Finder 成功。摘要在 `docs/testing/MACOS_CU_RESULTS.md`。
- 没有改 TCC，没有点 Edge Allow，没有移动系统光标，没有自动化微信。


## 2026-10-08：MAC-001 完成，下一入口 MAC-002

`745bcb9` 干净工作树复跑 `scripts/poc_mac_001_preflight.py` 返回 `ok=true`。绑定 JSON 在 `.local/desktop-cu/mac-MAC-001.json`。代码提交是 `00d2be7`。PATH 二进制仍是旧安装，报告为 warn，没有覆盖。

- 台账状态是 completed。AWR `work complete` 拒绝再次 Complete，因为源状态已经是 completed。证据记录 `mac-001-preflight` 已写入。
- 现有 TextEdit/Notes/Finder POC 保持 untested。
- `MAC-002` 已由新会话 `01M4DJ9FZJA5A39ZS0CBB5V8GA` 领取。不要结束旧会话 `01M3KKZTFFQTZ3FF0DWWZHP5QV`。MAC-002 还没实现，不能标完成。
- 没有改 TCC，没有点 Edge Allow，没有移动系统光标，没有自动化微信。

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
