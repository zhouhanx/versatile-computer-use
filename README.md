# Versatile Computer Use

厂商与模型无关的本机 Computer Use 运行时。通过 CLI、本地 daemon 与 MCP，把观察与操作接到 Codex、Claude、Cursor 等宿主。宿主已能看图时，不必再配视觉模型。

仓库：[github.com/zhouhanx/versatile-computer-use](https://github.com/zhouhanx/versatile-computer-use)

GitHub 登录名现为 zhouhanx（原 zhouhanker，2026-09-28 改名）。没有改写历史。提交邮箱仍是 zhouhanker@gmail.com。不要用 zhouhan 或 `zhouhan@users.noreply.github.com`。

Browser Bridge **0.2.8**。运行时软件包 **0.1.0**。`vcu --version` 打印的是 crate 版本，不代表浏览器桥没有更新。

已发布的接入是浏览器桥：用户自己的 Chrome / Edge，加上解压缩扩展。桌面会话不是两边的默认接入，也不是完整 Codex CU，更不是完整 Windows 产品 CU。

## 能做什么

- 使用已登录的 Chrome / Edge，不另开空的 Agent 配置
- 列出、选择、打开、关闭标签。打开网页时新建后台标签，放进折叠的紫色原生标签组「VCU」，不替换当前页
- 按 CSS selector 做 click、hover、type、scroll、extract
- `observe` 生成 viewport PNG，可按截图像素点击

扩展不进 Chrome 网上应用店，也不进 Edge 加载项。Windows 上怎么改代码、怎么更新扩展，见 [docs/WINDOWS-DEV.md](docs/WINDOWS-DEV.md)。

## 安装

macOS / Linux：

```bash
curl -fsSL https://github.com/zhouhanx/versatile-computer-use/releases/latest/download/install.sh | sh
```

Windows（PowerShell）：

```powershell
irm https://github.com/zhouhanx/versatile-computer-use/releases/latest/download/install.ps1 | iex
```

安装只放下二进制。浏览器还要单独加载扩展，见下一节。Release `v0.2.8` 不包含只存在于 `main` 的后续提交。安装细节见 [docs/INSTALL.md](docs/INSTALL.md)。

## 接入

两边相同：daemon 听 `127.0.0.1:17890`，扩展从用户目录轮询它，宿主用 MCP 或 `vcu --json`。不要点「允许调试」。包内的 `share/vcu/extension` 只是副本，不要和 `lens-extension` 同时加载。

| | macOS | Windows |
| --- | --- | --- |
| 二进制 | `~/.local/bin`，含 `vcu-stage` | `%USERPROFILE%\.local\bin`，没有 `vcu-stage` |
| 用户目录 | `~/.vcu` | `%USERPROFILE%\.vcu` |
| 要加载的扩展 | `~/.vcu/lens-extension` | `%USERPROFILE%\.vcu\lens-extension` |
| 常驻 | 可 `vcu service install` | 没有 service。用 `vcu daemon start` |

macOS：

```bash
export PATH="$HOME/.local/bin:$PATH"
vcu daemon start
vcu browser install-lens
# 用户 Edge 或 Chrome：扩展页 → 开发者模式 → 加载解压缩 → ~/.vcu/lens-extension
vcu browser ping --json
vcu mcp print-config --json
```

可选登录自启：`vcu service install`。这是 macOS LaunchAgent。Windows 上这条会报未实现。

Windows：先把 `%USERPROFILE%\.local\bin` 加进用户 PATH。安装脚本只提示，不会改 PATH。

```powershell
vcu daemon start
vcu browser install-lens
# edge://extensions 或 chrome://extensions → 开发者模式 → 加载解压缩 → %USERPROFILE%\.vcu\lens-extension
vcu browser ping --json
vcu mcp print-config --json
```

没有检出时，也可以只复制扩展：

```powershell
irm https://raw.githubusercontent.com/zhouhanx/versatile-computer-use/main/scripts/install/install-lens.ps1 | iex
```

### 接到宿主

`vcu mcp print-config --json` 给出绝对路径。写进宿主之后新开一轮会话。

Codex 用 TOML。macOS 写 `~/.codex/config.toml`，Windows 写 `%USERPROFILE%\.codex\config.toml`：

```toml
[mcp_servers.vcu]
command = "/Users/YOU/.local/bin/vcu-mcp"
args = ["--user-dir", "/Users/YOU/.vcu"]
```

Windows 的 `command` 用 `vcu-mcp.exe`。`print-config` 有时不带这个后缀，要自己补上。不要改 `[mcp_servers.computer-use]`，也不要改 `~/.codex/computer-use/`。

Claude、Cursor 和其他 MCP 宿主用打印出的 `mcpServers` JSON。给 AI 的操作顺序在 [docs/AGENT.md](docs/AGENT.md)。已安装的 0.2.8 里，`vcu install-skill` 不会带出这篇，因为它在发布时就编进了二进制。

## 开始使用

```bash
vcu browser ping --json
vcu browser open --url https://example.com
vcu browser observe --tab <id> --json
```

网页动作的回执应是 `source=extension_dom`。浏览器手册：[playbooks/user-browser.md](playbooks/user-browser.md)。

## 文档

| 文档 | 说明 |
| --- | --- |
| [docs/AGENT.md](docs/AGENT.md) | 给接入方 AI：Windows / macOS 怎么接、怎么停 |
| [docs/PLAN.md](docs/PLAN.md) | 当前版本计划 |
| [docs/WINDOWS-DEV.md](docs/WINDOWS-DEV.md) | Windows 开发与扩展更新 |
| [docs/INSTALL.md](docs/INSTALL.md) | 安装 |
| [docs/ROADMAP-CU.md](docs/ROADMAP-CU.md) | Computer Use 路线图 |
| [playbooks/user-browser.md](playbooks/user-browser.md) | 浏览器手册 |
| [playbooks/desktop.md](playbooks/desktop.md) | 桌面手册，不是默认接入 |
