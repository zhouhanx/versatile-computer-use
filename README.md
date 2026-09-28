# Versatile Computer Use

Versatile Computer Use（VCU）是一个厂商与模型无关的本机 Computer Use 运行时。它通过 CLI、后台 daemon 和 MCP，让 Codex、Claude、Cursor 或自建 Agent 操作用户已经登录的 Chrome / Edge。

## 它解决什么问题

AI 的浏览器工具通常需要新建隔离配置、丢失用户登录态，或通过远程调试接管浏览器。VCU 在本机增加一层受控桥接：AI 仍在自己的宿主中推理，VCU 只负责观察页面、执行动作并返回可核对的结果。

```text
AI 宿主（MCP 或 JSON CLI）
            │
        vcu-daemon
            │  localhost + pairing token
        VCU 扩展
            │
  用户自己的 Chrome / Edge
```

宿主能看图时，可以直接使用 VCU 返回的页面截图，不需要另外配置视觉模型。

## 主要能力

- 复用用户浏览器的登录态，不启动空白 Agent Profile
- 列出、选择、打开、关闭和分组标签页
- 按 CSS selector 执行 click、hover、type、scroll、wait 和 extract
- 获取 viewport 截图，并用与截图绑定的坐标点击
- 新页面默认进入折叠的原生「VCU」标签组，不替换当前页面
- 同时提供 MCP 工具和结构化 JSON CLI

网页动作通过扩展 DOM 执行时，结果会明确标记 `source=extension_dom`。浏览器外壳的 AX / UIA 信息不会冒充 HTML DOM。

## 安装

### macOS

```bash
curl -fsSL https://github.com/zhouhanx/versatile-computer-use/releases/latest/download/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
```

### Windows x64

```powershell
irm https://github.com/zhouhanx/versatile-computer-use/releases/latest/download/install.ps1 | iex
```

安装后将 `%USERPROFILE%\.local\bin` 加入用户 PATH。

Linux 暂无预编译 Release，可按 [AI 安装指南](docs/AI-INSTALL.md) 从源码构建。其他安装细节见 [docs/INSTALL.md](docs/INSTALL.md)。

## 连接浏览器

```bash
vcu daemon start
vcu browser install-lens
```

然后在用户自己的浏览器中加载解压缩扩展：

- Chrome：打开 `chrome://extensions`
- Edge：打开 `edge://extensions`
- 开启开发者模式，选择 `~/.vcu/lens-extension`
- Windows 对应目录为 `%USERPROFILE%\.vcu\lens-extension`

只加载 `lens-extension` 这一份。不要开启远程调试，也不要点击「允许调试」。

验证连接：

```bash
vcu browser ping --json
vcu browser login-state --json
```

正常结果应包含 `pong=true` 和 `extension_profile=user`。

## 连接 AI 宿主

```bash
vcu mcp print-config --json
```

该命令会输出当前机器上的绝对路径。将配置合并到 MCP 宿主后，重新启动宿主或新开会话。Codex、Claude、Cursor 的配置方式及 Windows 路径差异见 [AI 安装指南](docs/AI-INSTALL.md)。

也可以不使用 MCP，直接调用 JSON CLI：

```bash
vcu browser tabs --json
vcu browser open --url https://example.com --json
vcu browser observe --tab <tab-id> --json
```

## 使用边界

- 已发布的主路径是用户 Chrome / Edge 的浏览器桥
- 扩展以解压缩形式安装，不发布到 Chrome 网上应用店或 Edge 加载项
- VCU 不移动系统鼠标，也不依赖 CDP 调试接管浏览器
- DOM 事件是合成事件；可信手势和跨源 iframe 可能无法操作
- 桌面 Computer Use 仍是受限能力，不应当作浏览器路径的替代品

## 开发

需要 Rust stable 和 Node.js：

```bash
cargo build
make test
```

Windows 开发、Edge 测试和扩展更新见 [docs/WINDOWS-DEV.md](docs/WINDOWS-DEV.md)。

## 文档

- [AI 安装指南](docs/AI-INSTALL.md)：供 AI 编码代理执行安装、验证和 MCP 配置
- [AI 操作指南](docs/AGENT.md)：安装完成后的浏览器操作约束与故障处理
- [浏览器操作手册](playbooks/user-browser.md)：观察、操作和验证的最短闭环
- [安装参考](docs/INSTALL.md)：安装、更新和卸载

## License

[Apache-2.0](LICENSE)
