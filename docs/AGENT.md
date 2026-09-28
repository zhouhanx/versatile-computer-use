# 给 AI 的接入说明

更新：2026-09-28。本文给要操作这台电脑的 AI，不是给改仓库的人。改代码先读根目录 `AGENTS.md`，再读 `docs/PLAN.md`。不要把本文当成排期，也不要 claim `MAC-NEXT` 或 `FEISHU-001`。

已发布能力是浏览器桥 **0.2.8**。`vcu --version` 打印 crate `0.1.0`，不代表桥没装上。Release 包不含只在 `main` 上的后续提交。宿主能看图就够了，不要要求 `vcu init model`。

安装步骤见 [`AI-INSTALL.md`](AI-INSTALL.md)。本文是你接到机器之后怎么判断、怎么停。

## 先判断系统

看自己跑在哪。路径不要混用。

| | macOS | Windows |
| --- | --- | --- |
| 二进制 | `~/.local/bin` | `%USERPROFILE%\.local\bin` |
| 必须有 | `vcu`、`vcu-daemon`、`vcu-mcp`、`vcu-stage` | `vcu.exe`、`vcu-daemon.exe`、`vcu-mcp.exe`。没有 `vcu-stage` |
| 用户目录 | `~/.vcu` | `%USERPROFILE%\.vcu` |
| 扩展目录 | `~/.vcu/lens-extension` | `%USERPROFILE%\.vcu\lens-extension` |
| daemon | `127.0.0.1:17890` | 同左 |
| 常驻 | 可以 `vcu service install` | 没有。`vcu service install` 会报未实现 |

Linux 用 macOS 那条 `curl | sh`，没有 `vcu-stage`，也没有 LaunchAgent。不要把 Linux 写成已发布的桌面产品。

安装包里的 `~/.local/share/vcu/extension`（Windows 是 `%USERPROFILE%\.local\share\vcu\extension`）只是包内副本。浏览器只加载 `lens-extension` 这一份。两份都加载会变成两个扩展。

## 接通之前

按这个顺序。某一步失败就停，不要换一条没写在这里的通路。

1. 二进制不在 PATH 里：macOS 用 `export PATH="$HOME/.local/bin:$PATH"`。Windows 把 `%USERPROFILE%\.local\bin` 加进用户 PATH。安装脚本不会替 Windows 改 PATH。
2. `vcu daemon start`。已经在跑会返回 `already_running`，不要再开一个。
3. 扩展目录没有 `manifest.json` 时，跑 `vcu browser install-lens`。这只复制文件，不点界面。
4. 让人在自己的 Edge 或 Chrome 里加载解压缩扩展，目录就是上表的 `lens-extension`。扩展页是 `edge://extensions` 或 `chrome://extensions`。你不要自己去点，尤其不要点「允许调试」。
5. `vcu browser ping --json` 必须 `pong=true`，`version=0.2.8`。
6. `vcu browser login-state --json` 必须 `extension_profile=user`，`allow_dialog_visible=false`。`agent` 是空配置，`none` 是没配对。都不是登录态。
7. 宿主还没有 VCU 工具时，跑 `vcu mcp print-config --json`，把绝对路径交给人写进宿主，然后新开一轮。不要改 Codex 的 `computer-use` 项，不要改 `~/.codex/computer-use/`。

Codex 的配置是 TOML，不是打印出来的 JSON。

macOS：`~/.codex/config.toml`

```toml
[mcp_servers.vcu]
command = "/Users/YOU/.local/bin/vcu-mcp"
args = ["--user-dir", "/Users/YOU/.vcu"]
```

Windows：`%USERPROFILE%\.codex\config.toml`

```toml
[mcp_servers.vcu]
command = "C:\\Users\\YOU\\.local\\bin\\vcu-mcp.exe"
args = ["--user-dir", "C:\\Users\\YOU\\.vcu"]
```

Windows 上 `print-config` 可能写出不带 `.exe` 的 `vcu-mcp`。配置里要用 `vcu-mcp.exe`。Claude、Cursor 和其他 MCP 宿主用它打印的 `mcpServers` JSON。不会 MCP 时，直接跑 `vcu … --json`。

`vcu install-skill` 只把技能写进当前目录，不代替上面的 MCP 配置。已安装的 0.2.8 二进制里，这条命令写出的仍是发布时编进去的技能文本。操作说明以本文为准，不要等它带出后文。

## 网页怎么做

登录态网页只走扩展。细操作的回执必须是 `source=extension_dom`。标签管理是 `extension_tabs`，页面截图是 `extension_viewport`。AX 或 UIA 的浏览器外壳不是 HTML DOM，不要拿它冒充点到了按钮。

```bash
vcu browser tabs --json
vcu browser open --url https://example.com
vcu browser observe --tab <id> --json
vcu browser click --tab <id> --selector '<css>' --dry-run --json
```

- 打开网页会新建后台标签，放进折叠的紫色「VCU」组，不替换当前页，不抢焦点。
- 没有 `--tab` 时，observe 只绑当前前台的用户 Chrome 或 Edge。前台不是这两者就失败。改用 `--tab`，不要猜另一个浏览器。
- Windows 用前台窗口的进程映像名判断，不改焦点。macOS 用窗口列表，同样不改焦点。
- observe 之后 60 秒内，不带 `--tab` 的 click / type / hover / scroll / extract 绑这次 observe。显式 `--tab` 优先。
- 两个浏览器的 `tab_id` 可能撞号。撞号时必须带 `--browser chrome|edge`。
- 像素点击先看这次截图，再用它的 `capture_id`。滚动或页面变了，旧图会被拒绝。重新 observe，不要盲重试。
- DOM 事件是合成的，`trusted=false`。跨源 iframe、要原生手势的目标，失败就是失败。
- 原生 `<select>` 用 `type --selector`，回执应是 `input_path=dom_select`。
- 不带 selector 的地址栏输入只在 macOS 上是 AX。不要在 Windows 上把这条当成已接通。
- 已经打开的旧网页不会自动换成新内容脚本。报 `content lens is stale` 时，让人刷新那个页，不要点允许调试。

手册：`playbooks/user-browser.md`。

## 两边都不要做

- 不要点 Edge 或 Chrome 的「允许调试」，不要开远程调试，不要走 CDP 接管。
- 不要移动系统光标，不要用 HID、SendInput、`CGWarpMouseCursorPosition`。
- 不要自动化微信。
- 不要改 `~/.codex/computer-use/`，也不要把它的文件拷进仓库。
- 不要动用户已有的标签组 1 和 3。只动这次自己打开的标签。
- 不要把飞书消息发出去。没有人点名收信人时，只允许观察。
- 不要为了接浏览器去勾辅助功能，也不要自己改系统设置。
- 扩展不上 Chrome 网上应用店，也不上 Edge 加载项。

## 桌面不要当成已经接入

用户没点名桌面时，不要 `vcu session start --surface desktop`。

macOS 桌面会话能对 TextEdit、Notes、Finder 做有限观察和动作，深 AX 仍停放。缺辅助功能时，`vcu doctor` 只会提示人去系统设置，你不要去点。

Windows 的窗口观察和控件动作是 CI 或本机会话切片，不是产品会话。`vcu doctor` 的 `windows_desktop_scope` 为 warn 时，照实说，不要写成完整 Windows Computer Use。不要把 `WM_SETTEXT` 写成 UIA ValuePattern，不要把 `BM_CLICK` 写成 InvokePattern。

无论哪边，`os_cursor_used` 必须是 false。网页里的按钮仍走上面的扩展路径。

## 失败时怎么说

- ping 不是 pong：daemon 没起，或扩展没加载到 `lens-extension`。把目录告诉人。不要自己点扩展页。
- `extension_profile` 不是 `user`：还没接到登录态浏览器。不要改用空 Agent 配置冒充。
- `frontmost is not USER Chrome/Edge`：换 `--tab`，不要把别的窗口当浏览器。
- `unknown method`：扩展后台是旧的。让人在扩展页点重新加载。不是点允许调试。
- Windows 上 `vcu daemon stop` 会去调用不存在的 `kill`，只删 pid 文件，`vcu-daemon.exe` 还在。要停就在任务管理器结束这个进程。不要结束 Edge 或 Chrome。
- macOS 取消登录自启：`vcu service uninstall`。这只卸 `com.vcu.daemon`，不卸 Codex。

做完用 observe 或 extract 核对页面结果。动作已派发不等于业务成功。
