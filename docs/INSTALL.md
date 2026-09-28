# Install (no npm / no source tree required)

Repository: https://github.com/zhouhanx/versatile-computer-use

## macOS — curl

```bash
curl -fsSL https://github.com/zhouhanx/versatile-computer-use/releases/latest/download/install.sh | sh
```

Installs to `~/.local/bin` (`vcu`, `vcu-daemon`, `vcu-mcp`, and on macOS `vcu-stage`) and bundles the browser extension under `~/.local/share/vcu/extension`. Windows omits `vcu-stage`.

GitHub Release 暂不提供 Linux 预编译包。Linux 源码安装见 [AI-INSTALL.md](AI-INSTALL.md)。

### Local mirror (dev)

```bash
bash scripts/pack-release.sh
VCU_BASE_URL=file://$PWD/dist bash scripts/install/install.sh
```

## Windows — irm

```powershell
irm https://github.com/zhouhanx/versatile-computer-use/releases/latest/download/install.ps1 | iex
```

## Release artifacts (CI)

| Asset | Platform |
| --- | --- |
| `vcu-*-macos-arm64.tar.gz` | Apple Silicon |
| `vcu-*-macos-x64.tar.gz` | Intel Mac |
| `vcu-*-windows-x64.tar.gz` | Windows x64 |
| `install.sh` / `install.ps1` | installers |

Built by `.github/workflows/ci.yml` (artifacts) and `.github/workflows/release.yml` (GitHub Release on tag `v*`).

## After install

二进制装好之后还要接扩展和宿主。两边的目录、Codex TOML 和给 AI 的顺序见 [AGENT.md](AGENT.md)。不要把包内 `share/vcu/extension` 和 `lens-extension` 同时加载。

macOS：

```bash
export PATH="$HOME/.local/bin:$PATH"
vcu daemon start
vcu browser install-lens
vcu mcp print-config --json
# 可选登录自启。Windows 没有这条。
vcu service install
```

Windows：把 `%USERPROFILE%\.local\bin` 加进用户 PATH，然后：

```powershell
vcu daemon start
vcu browser install-lens
vcu mcp print-config --json
```

然后在用户 Edge 或 Chrome 里加载解压缩扩展：macOS `~/.vcu/lens-extension`，Windows `%USERPROFILE%\.vcu\lens-extension`。不要点「允许调试」。

## Verify

```bash
bash scripts/poc_install_curl.sh
cargo test --workspace
```

## Update

```bash
vcu self update
# or versioned:
vcu self update --version 0.1.0
```

`vcu self update` 走 `releases/latest/download/install.sh`（`VCU_BASE_URL` 可覆盖）。若镜像没有对应资产会失败，此时错误里会带上 base URL、installer 的 stderr 摘要与下面的本地通路提示。

### Local mirror（无 Release 时）

```bash
bash scripts/pack-release.sh                       # 产出 dist/vcu-latest-*.tar.gz + .sha256
VCU_BASE_URL=file://$PWD/dist vcu self update      # 等价于 curl|sh 的本地通路
```

更新后重启 daemon 才会用上新二进制：`vcu daemon stop && vcu daemon start`。

`vcu --version` 与浏览器扩展的版本独立。扩展版本和连接状态以 `vcu browser ping --json` 为准。

## Uninstall

```bash
# remove binaries + share (keeps ~/.vcu config)
vcu self uninstall --yes

# also delete config
vcu self uninstall --yes --purge-config
```

**Never** removes Codex Computer Use or other third-party computer-use apps.

## Browser extension

The runtime tarball on GitHub Releases already contains `extension/`. A separate `vcu-lens-extension.zip` is attached to the Latest Release by `.github/workflows/lens-asset.yml`. If that asset is unavailable, Windows installation falls back to `extension/` inside `vcu-latest-windows-x64.tar.gz`.

Windows, without cloning and without clicking the debugging consent dialog:

```powershell
irm https://raw.githubusercontent.com/zhouhanx/versatile-computer-use/main/scripts/install/install-lens.ps1 | iex
```

The script tries `vcu-lens-extension.zip` first, then falls back to `vcu-latest-windows-x64.tar.gz`. It copies the extension to `%USERPROFILE%\.vcu\lens-extension`. Then in Edge: `edge://extensions`, Developer mode, Load unpacked. Do not start CDP. A checkout can still run `powershell -File scripts/install/install-lens.ps1 -FromRelease -Open`.

From a source checkout, omit `-FromRelease` to copy `extension/` directly.

Checkout updates do not go through a browser store or `vcu self update`. See [WINDOWS-DEV.md](WINDOWS-DEV.md). `git pull` does not update `~/.vcu/lens-extension`.
