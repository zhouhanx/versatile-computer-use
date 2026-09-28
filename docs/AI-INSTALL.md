# VCU AI 安装指南

本文供 AI 编码代理在用户机器上安装 Versatile Computer Use。默认安装 GitHub Release；Linux 没有预编译包，只有用户明确接受源码路径时才从源码构建。

安装完成必须同时满足：

1. `vcu`、`vcu-daemon` 和 `vcu-mcp` 可执行
2. daemon 能在 `127.0.0.1:17890` 启动
3. 用户浏览器已加载 `lens-extension`
4. `vcu browser ping --json` 返回 `pong=true`
5. `vcu browser login-state --json` 返回 `extension_profile=user`
6. MCP 宿主使用本机 `vcu-mcp` 的绝对路径

## 安装原则

- 保留现有配置；不要覆盖整个宿主配置文件
- 不读取、打印或发送 `~/.vcu/config.json` 中的 pairing token
- 不修改 `~/.codex/computer-use/` 或其他 Computer Use 产品
- 不开启 Chrome / Edge 远程调试，不点击「允许调试」
- 不同时加载包内 `share/vcu/extension` 和 `~/.vcu/lens-extension`
- 浏览器扩展页的“加载解压缩”由用户完成；AI 只准备目录并给出准确路径
- 宿主已经能查看图片时，不运行 `vcu init model`

## 1. 识别平台

macOS：

```bash
uname -s
uname -m
```

Windows PowerShell：

```powershell
[System.Environment]::OSVersion.Platform
$env:PROCESSOR_ARCHITECTURE
```

预编译 Release 支持 macOS arm64 / x64 和 Windows x64。Linux 使用下文的源码构建流程。

## 2. 安装二进制

### macOS

```bash
curl -fsSL https://github.com/zhouhanx/versatile-computer-use/releases/latest/download/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
vcu --version
```

默认安装到 `~/.local/bin`，用户数据放在 `~/.vcu`。

### Windows x64

在 PowerShell 中执行：

```powershell
irm https://github.com/zhouhanx/versatile-computer-use/releases/latest/download/install.ps1 | iex
$env:Path = "$env:USERPROFILE\.local\bin;$env:Path"
vcu --version
```

安装脚本不会永久修改 PATH。若任务包含系统配置，可将 `%USERPROFILE%\.local\bin` 合并到用户 PATH；否则把该目录和手工操作告知用户。

### Linux 源码安装

前提：已安装 Rust stable 和 Cargo，并位于仓库根目录。

```bash
cargo build --release -p vcu-cli -p vcu-daemon -p vcu-mcp
install -d "$HOME/.local/bin"
install -m 755 target/release/vcu "$HOME/.local/bin/vcu"
install -m 755 target/release/vcu-daemon "$HOME/.local/bin/vcu-daemon"
install -m 755 target/release/vcu-mcp "$HOME/.local/bin/vcu-mcp"
export PATH="$HOME/.local/bin:$PATH"
vcu --version
vcu init --json
vcu browser install-lens --from ./extension
```

不要把开发目录本身加入用户 PATH。Linux 浏览器能力需要在目标发行版上自行验证。

## 3. 初始化并启动 daemon

安装脚本会初始化用户目录；再次执行是幂等的：

```bash
vcu init --json
vcu daemon start
vcu daemon status
```

macOS 如需登录后自动启动：

```bash
vcu service install
```

Windows 没有该 service，使用 `vcu daemon start`。

## 4. 准备浏览器扩展

```bash
vcu browser install-lens
```

确认以下文件存在：

- macOS / Linux：`~/.vcu/lens-extension/manifest.json`
- Windows：`%USERPROFILE%\.vcu\lens-extension\manifest.json`

然后把下面的手工步骤交给用户：

1. 在用户自己的 Chrome 打开 `chrome://extensions`，或在 Edge 打开 `edge://extensions`
2. 开启“开发者模式”
3. 选择“加载已解压的扩展程序”
4. 选择上面的 `lens-extension` 目录

不要替用户点击调试同意框。若浏览器已加载旧版本扩展，让用户在扩展页点击“重新加载”；已经打开的网页还需要刷新，才能使用新的 content script。

## 5. 验证浏览器连接

```bash
vcu browser ping --json
vcu browser login-state --json
vcu doctor
```

检查结果，而不只检查退出码：

- `ping` 包含 `pong=true`
- `login-state` 包含 `extension_profile=user`
- `allow_dialog_visible=false`

`extension_profile=agent` 表示连到空白 Agent Profile；`none` 表示尚未接通。此时运行下面的命令获取下一步，不要改走 CDP：

```bash
vcu browser next --json
```

## 6. 配置 MCP 宿主

先获取由 VCU 生成的绝对路径：

```bash
vcu mcp print-config --json
```

若任务授权包含配置宿主，将对应配置合并到现有文件中，保留其他 MCP server。配置修改后，需要重启宿主或新开会话。

Codex 的配置文件是 TOML：

- macOS / Linux：`~/.codex/config.toml`
- Windows：`%USERPROFILE%\.codex\config.toml`

macOS 示例：

```toml
[mcp_servers.vcu]
command = "/Users/USER/.local/bin/vcu-mcp"
args = ["--user-dir", "/Users/USER/.vcu"]
```

Windows 示例：

```toml
[mcp_servers.vcu]
command = "C:\\Users\\USER\\.local\\bin\\vcu-mcp.exe"
args = ["--user-dir", "C:\\Users\\USER\\.vcu"]
```

Windows 的 `command` 必须指向 `vcu-mcp.exe`。不要修改 `[mcp_servers.computer-use]`。

Claude、Cursor 和其他 MCP 宿主使用 `vcu mcp print-config --json` 输出中的 `mcpServers` 配置。

## 7. 最终冒烟检查

```bash
vcu browser tabs --json
vcu browser open --url https://example.com --json
```

只对这次新开的标签进行观察：

```bash
vcu browser observe --tab <tab-id> --json
```

成功标准：能列出用户浏览器标签，能在后台打开 `example.com`，并返回 `source=extension_viewport` 的观察结果。不要操作用户已有标签，也不要用真实账号页面做安装测试。

安装完成后，AI 的操作规则见 [AGENT.md](AGENT.md)，浏览器命令闭环见 [../playbooks/user-browser.md](../playbooks/user-browser.md)。

## 常见问题

- 找不到 `vcu`：使用绝对路径，或把 `~/.local/bin` / `%USERPROFILE%\.local\bin` 加入 PATH
- daemon 不可达：运行 `vcu daemon start`，不要启动第二个实例
- `ping` 没有 pong：确认加载的是 `lens-extension`，然后重新加载扩展
- `content lens is stale`：刷新目标网页
- `unknown method`：扩展后台版本旧，重新加载扩展
- 宿主没有 VCU 工具：检查 MCP 路径并重启宿主
