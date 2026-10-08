use std::fs;
use std::process::{Command, Stdio};

use vcu_core::{DaemonStatus, DoctorCheck, DoctorReport, UserConfig, VcuPaths};

use crate::state::AppState;

pub async fn build_report(paths: &VcuPaths, live: Option<&AppState>) -> DoctorReport {
    let mut checks = Vec::new();
    let mut ok = true;

    // user dir
    if paths.root.exists() {
        checks.push(DoctorCheck {
            name: "user_dir".into(),
            status: "pass".into(),
            detail: format!("{}", paths.root.display()),
            hint: None,
        });
    } else {
        ok = false;
        checks.push(DoctorCheck {
            name: "user_dir".into(),
            status: "fail".into(),
            detail: format!("{} missing", paths.root.display()),
            hint: Some("Run `vcu init`".into()),
        });
    }

    let cfg = paths.load_config().ok();
    match &cfg {
        Some(c) => {
            checks.push(DoctorCheck {
                name: "config".into(),
                status: "pass".into(),
                detail: format!(
                    "port={} vision_policy={:?} models={}",
                    c.daemon_port,
                    c.vision_policy,
                    c.models.len()
                ),
                hint: None,
            });
            if c.models.is_empty() {
                checks.push(DoctorCheck {
                    name: "vision_model".into(),
                    status: "warn".into(),
                    detail: "no vision model configured; DOM-only mode still works".into(),
                    hint: Some("Optional: `vcu init model` only if the host agent has no vision. Grok/GPT-4o-class hosts can read Scene screenshots directly.".into()),
                });
            } else {
                checks.push(DoctorCheck {
                    name: "vision_model".into(),
                    status: "pass".into(),
                    detail: format!("default={:?}", c.default_vision_model),
                    hint: None,
                });
            }
        }
        None => {
            ok = false;
            checks.push(DoctorCheck {
                name: "config".into(),
                status: "fail".into(),
                detail: "config.json unreadable".into(),
                hint: Some("Run `vcu init`".into()),
            });
        }
    }

    let daemon = if let Some(state) = live {
        checks.push(DoctorCheck {
            name: "daemon".into(),
            status: "pass".into(),
            detail: format!("in-process version {}", state.version),
            hint: None,
        });
        let ext_ok = state.extension_bridge.is_connected().await;
        let ext_poll = state.extension_bridge.is_polling().await;
        let mut ext_profile = crate::login_state::inspect_login_browsers().extension_profile;
        if state.extension_bridge.likely_user_profile().await {
            ext_profile = "user";
        }
        let ext_browsers = state.extension_bridge.active_browsers().await;
        let (ext_status, ext_detail, ext_hint) = if ext_poll && ext_profile == "user" {
            (
                "pass",
                format!(
                    "VCU extension polling in the USER browser (login-state DOM lens); browsers={}",
                    if ext_browsers.is_empty() { "unknown".into() } else { ext_browsers.join(",") }
                ),
                None,
            )
        } else if ext_poll && ext_profile == "agent" {
            (
                "warn",
                "extension polling on empty Agent Edge — not login-state".into(),
                Some("Load ~/.local/share/vcu/extension unpacked in your USER Edge (edge://extensions) for DOM lens with cookies. Do not treat Agent Edge as logged-in.".into()),
            )
        } else if ext_poll {
            (
                "warn",
                "extension polling but profile unknown".into(),
                Some("Prefer loading the extension in the USER Edge for login-state.".into()),
            )
        } else if ext_ok {
            (
                "warn",
                "extension hello seen but poll loop idle (MV3 SW asleep)".into(),
                None,
            )
        } else {
            (
                "warn",
                "no extension hello yet — unpacked extension auto-pairs via POST /v1/extension/bootstrap".into(),
                Some("For login-state, load the unpacked extension in USER Edge, not the empty Agent profile.".into()),
            )
        };
        checks.push(DoctorCheck {
            name: "extension_bridge".into(),
            status: ext_status.into(),
            detail: ext_detail,
            hint: ext_hint,
        });
        {
            let chrome_app = std::path::Path::new("/Applications/Google Chrome.app").exists()
                || std::path::Path::new(r"C:\Program Files\Google\Chrome\Application\chrome.exe").exists();
            let edge_app = std::path::Path::new("/Applications/Microsoft Edge.app").exists()
                || std::path::Path::new(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe").exists();
            checks.push(dual_browser_lens_check(chrome_app, edge_app, &ext_browsers));
        }
        let cfg = state.config.read().await;
        DaemonStatus {
            running: true,
            endpoint: Some(VcuPaths::endpoint_url(&cfg)),
            pid: Some(std::process::id()),
            version: Some(state.version.clone()),
        }
    } else {
        match probe_daemon(paths, cfg.as_ref()).await {
            Ok(status) => {
                checks.push(DoctorCheck {
                    name: "daemon".into(),
                    status: if status.running { "pass" } else { "fail" }.into(),
                    detail: status
                        .endpoint
                        .clone()
                        .unwrap_or_else(|| "not running".into()),
                    hint: if status.running {
                        None
                    } else {
                        Some("Run `vcu daemon start`".into())
                    },
                });
                if !status.running {
                    ok = false;
                }
                status
            }
            Err(e) => {
                ok = false;
                checks.push(DoctorCheck {
                    name: "daemon".into(),
                    status: "fail".into(),
                    detail: e,
                    hint: Some("Run `vcu daemon start`".into()),
                });
                DaemonStatus {
                    running: false,
                    endpoint: None,
                    pid: None,
                    version: None,
                }
            }
        }
    };


    // CDP abandoned for login-state. Probe only as optional leftover, never as a required next step.
    checks.push(DoctorCheck {
        name: "cdp_endpoint".into(),
        status: "pass".into(),
        detail: "CDP abandoned for login-state; use USER Edge extension extract/observe".into(),
        hint: Some("Do not click Allow. Do not vcu config set-cdp for cookies/DOM.".into()),
    });
    if let Some(c) = &cfg {
        if let Some(url) = &c.cdp_url {
            checks.push(DoctorCheck {
                name: "cdp_url_legacy".into(),
                status: "warn".into(),
                detail: format!("{url} is configured but CDP is not the login-state path"),
                hint: Some("Ignore leftover cdp_url. Prefer extension extract on the USER browser. Never click Allow.".into()),
            });
        }
    }

    // macOS accessibility probe
    #[cfg(target_os = "macos")]
    {
        let probe = std::process::Command::new("osascript")
            .args(["-e", "tell application \"System Events\" to get name of first process"])
            .output();
        let (probe_ok, stderr) = match probe {
            Ok(output) => (
                output.status.success(),
                String::from_utf8_lossy(&output.stderr).trim().to_string(),
            ),
            Err(err) => (false, err.to_string()),
        };
        let ax_ok = probe_ok;
        let perm = macos_permission_checks(probe_ok, &stderr);
        if perm.iter().any(|check| check.status == "fail") {
            ok = false;
        }
        checks.extend(perm);
        let rec = crate::app::macos::screen_capture_enabled();
        checks.push(scene_webview_crop_check(ax_ok, rec));
        checks.push(DoctorCheck {
            name: "macos_screen_recording".into(),
            status: if rec { "pass" } else { "fail" }.into(),
            detail: if rec {
                "Screen Recording already granted — desktop Scene can attach window pixels".into()
            } else {
                "Screen Recording not granted to this process — Scene stays AX-only (no TCC prompt will be shown)".into()
            },
            hint: if rec {
                None
            } else {
                Some("系统设置 → 隐私与安全 → 屏幕录制，勾选 vcu-daemon 和你的终端；授权后执行 `vcu daemon stop && vcu daemon start`".into())
            },
        });
        let chrome = std::path::Path::new("/Applications/Google Chrome.app").exists();
        let edge = std::path::Path::new("/Applications/Microsoft Edge.app").exists();
        checks.push(DoctorCheck {
            name: "browsers_installed".into(),
            status: if chrome || edge { "pass" } else { "warn" }.into(),
            detail: format!("chrome={chrome} edge={edge}"),
            hint: if chrome || edge {
                None
            } else {
                Some("Install Chrome or Edge for CDP/extension backends".into())
            },
        });
    }

    {
        #[cfg(target_os = "macos")]
        let found = crate::stage::resolve_stage_bin();
        #[cfg(not(target_os = "macos"))]
        let found: Option<std::path::PathBuf> = None;
        checks.push(stage_helper_check(found.as_deref(), std::env::consts::OS));
    }

    let exe = std::env::current_exe()
        .ok()
        .map(|path| path.display().to_string());
    let daemon_command = daemon_command_path(daemon.pid);
    checks.push(host_identity_check(
        std::env::consts::OS,
        std::env::consts::ARCH,
        exe.as_deref(),
        daemon_command.as_deref(),
        daemon.pid,
    ));
    let in_process = live.is_some();
    let liveness_alive = if in_process {
        Some(true)
    } else if daemon.pid.is_some() {
        #[cfg(unix)]
        {
            daemon.pid.map(pid_alive_kill0)
        }
        #[cfg(not(unix))]
        {
            None
        }
    } else {
        None
    };
    let liveness = daemon_liveness_check(daemon.pid, liveness_alive, in_process);
    if liveness.status == "fail" && daemon.running {
        ok = false;
    }
    checks.push(liveness);
    let version = version_identity_check(env!("CARGO_PKG_VERSION"), daemon.version.as_deref());
    if version.status == "fail" {
        ok = false;
    }
    checks.push(version);
    checks.push(git_sha_check(read_git_sha().as_deref()));
    checks.push(app_backend_check(std::env::consts::OS));
    if let Some(scope) = windows_desktop_scope_check(std::env::consts::OS) {
        checks.push(scope);
    }

    // OS cursor policy invariant documentation check
    checks.push(DoctorCheck {
        name: "os_cursor_policy".into(),
        status: "pass".into(),
        detail: "browser sessions enforce os_cursor=deny".into(),
        hint: None,
    });

    let mut login_report = crate::login_state::inspect_login_browsers();
    if let Some(state) = live {
        if state.extension_bridge.likely_user_profile().await {
            login_report.extension_profile = "user";
        }
        login_report.next_action = crate::login_state::login_next_action(
            login_report.user_browsers.is_empty() && login_report.extension_profile != "user",
            login_report.lens_copied,
            login_report.extension_profile,
            false,
            &login_report.lens_dir,
            false,
        );
    }
    checks.push(login_browser_check(&login_report));

    DoctorReport {
        ok,
        checks,
        user_dir: paths.root.display().to_string(),
        daemon,
    }
}

async fn probe_daemon(paths: &VcuPaths, cfg: Option<&UserConfig>) -> Result<DaemonStatus, String> {
    let endpoint = if let Some(c) = cfg {
        VcuPaths::endpoint_url(c)
    } else if paths.endpoint_path().exists() {
        fs::read_to_string(paths.endpoint_path()).map_err(|e| e.to_string())?
    } else {
        return Ok(DaemonStatus {
            running: false,
            endpoint: None,
            pid: read_pid(paths),
            version: None,
        });
    };
    let endpoint = endpoint.trim().to_string();
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(800))
        .build()
        .map_err(|e| e.to_string())?;
    let url = format!("{}/v1/health", endpoint.trim_end_matches('/'));
    match client.get(url).send().await {
        Ok(resp) if resp.status().is_success() => {
            let v: serde_json::Value = resp.json().await.unwrap_or_default();
            Ok(DaemonStatus {
                running: true,
                endpoint: Some(endpoint),
                pid: read_pid(paths),
                version: v
                    .pointer("/data/version")
                    .and_then(|x| x.as_str())
                    .map(|s| s.to_string()),
            })
        }
        _ => Ok(DaemonStatus {
            running: false,
            endpoint: Some(endpoint),
            pid: read_pid(paths),
            version: None,
        }),
    }
}

fn read_pid(paths: &VcuPaths) -> Option<u32> {
    fs::read_to_string(paths.pid_path())
        .ok()
        .and_then(|s| s.trim().parse().ok())
}


fn macos_permission_checks(probe_ok: bool, stderr: &str) -> Vec<DoctorCheck> {
    if probe_ok {
        return vec![
            DoctorCheck {
                name: "macos_accessibility".into(),
                status: "pass".into(),
                detail: "System Events process probe succeeded; Accessibility is available to this process".into(),
                hint: None,
            },
            DoctorCheck {
                name: "macos_automation".into(),
                status: "pass".into(),
                detail: "Apple Events to System Events succeeded; Automation is available to this process".into(),
                hint: None,
            },
        ];
    }
    let stderr = stderr.trim();
    match crate::app::macos::classify_ax_permission_error(stderr) {
        Some(vcu_core::ErrorCode::AutomationDenied) => vec![
            DoctorCheck {
                name: "macos_automation".into(),
                status: "fail".into(),
                detail: format!("Automation denied: {stderr}"),
                hint: Some(vcu_core::ErrorCode::AutomationDenied.default_hint().into()),
            },
            DoctorCheck {
                name: "macos_accessibility".into(),
                status: "untested".into(),
                detail: "Accessibility was not classified; Apple Events failed before an assistive-access result".into(),
                hint: Some("Grant Automation first, then rerun doctor. Do not treat this as Accessibility and do not click Edge Allow.".into()),
            },
        ],
        Some(vcu_core::ErrorCode::AccessibilityDenied) => vec![
            DoctorCheck {
                name: "macos_accessibility".into(),
                status: "fail".into(),
                detail: format!("Accessibility denied: {stderr}"),
                hint: Some(vcu_core::ErrorCode::AccessibilityDenied.default_hint().into()),
            },
            DoctorCheck {
                name: "macos_automation".into(),
                status: "pass".into(),
                detail: "Apple Events reached System Events; the failure is assistive access, not Automation".into(),
                hint: None,
            },
        ],
        _ => vec![
            DoctorCheck {
                name: "macos_ax_probe".into(),
                status: "fail".into(),
                detail: format!("System Events probe failed without a permission class: {stderr}"),
                hint: Some("Inspect the probe stderr. Do not reset TCC and do not click Edge Allow debugging.".into()),
            },
            DoctorCheck {
                name: "macos_accessibility".into(),
                status: "untested".into(),
                detail: "Accessibility class unknown".into(),
                hint: None,
            },
            DoctorCheck {
                name: "macos_automation".into(),
                status: "untested".into(),
                detail: "Automation class unknown".into(),
                hint: None,
            },
        ],
    }
}

fn host_identity_check(
    os: &str,
    arch: &str,
    exe: Option<&str>,
    daemon_command: Option<&str>,
    daemon_pid: Option<u32>,
) -> DoctorCheck {
    let binary = exe.filter(|path| !path.trim().is_empty()).unwrap_or("unknown");
    let daemon = daemon_command.unwrap_or("unavailable");
    let pid = daemon_pid
        .map(|pid| pid.to_string())
        .unwrap_or_else(|| "none".into());
    DoctorCheck {
        name: "host_identity".into(),
        status: if binary == "unknown" { "warn" } else { "pass" }.into(),
        detail: format!("os={os} arch={arch} binary={binary} daemon_pid={pid} daemon_command={daemon}"),
        hint: if binary == "unknown" {
            Some("current_exe was unavailable; record the built vcu and vcu-daemon paths in the MAC-001 report".into())
        } else {
            None
        },
    }
}

fn daemon_liveness_check(pid: Option<u32>, alive: Option<bool>, in_process: bool) -> DoctorCheck {
    if in_process {
        return DoctorCheck {
            name: "daemon_liveness".into(),
            status: "pass".into(),
            detail: "in-process daemon is the current process; liveness was not probed with a signal".into(),
            hint: None,
        };
    }
    match (pid, alive) {
        (None, _) => DoctorCheck {
            name: "daemon_liveness".into(),
            status: "untested".into(),
            detail: "no daemon pid; liveness not claimed".into(),
            hint: Some("Run `vcu daemon status` after start if a live daemon is expected.".into()),
        },
        (Some(pid), Some(true)) => DoctorCheck {
            name: "daemon_liveness".into(),
            status: "pass".into(),
            detail: format!("pid {pid} is alive via kill -0 only; doctor did not capture the screen"),
            hint: None,
        },
        (Some(pid), Some(false)) => DoctorCheck {
            name: "daemon_liveness".into(),
            status: "fail".into(),
            detail: format!("pid {pid} is not alive; stale pid file or exited daemon"),
            hint: Some("Clear the stale pid with `vcu daemon stop`, then `vcu daemon start` from this build.".into()),
        },
        (Some(pid), None) => DoctorCheck {
            name: "daemon_liveness".into(),
            status: "untested".into(),
            detail: format!("pid {pid} is recorded but kill -0 was not available"),
            hint: None,
        },
    }
}

fn version_identity_check(cli_version: &str, daemon_version: Option<&str>) -> DoctorCheck {
    match daemon_version.map(str::trim).filter(|version| !version.is_empty()) {
        None => DoctorCheck {
            name: "version_identity".into(),
            status: "untested".into(),
            detail: format!("cli={cli_version}; daemon health version unavailable. Extension Bridge 0.2.8 is not a daemon version."),
            hint: Some("Compare this CLI CARGO_PKG_VERSION with /v1/health data.version from the same build.".into()),
        },
        Some(daemon) if daemon == cli_version => DoctorCheck {
            name: "version_identity".into(),
            status: "pass".into(),
            detail: format!("cli={cli_version} daemon={daemon}"),
            hint: None,
        },
        Some(daemon) => DoctorCheck {
            name: "version_identity".into(),
            status: "fail".into(),
            detail: format!("cli={cli_version} daemon={daemon}; crate versions differ. Extension Bridge 0.2.8 is not this comparison."),
            hint: Some("Restart vcu-daemon from the same build as this CLI.".into()),
        },
    }
}

fn git_sha_check(sha: Option<&str>) -> DoctorCheck {
    let raw = sha.map(str::trim).filter(|value| !value.is_empty());
    let Some(raw) = raw else {
        return DoctorCheck {
            name: "git_sha".into(),
            status: "untested".into(),
            detail: "source SHA unavailable; not claiming a clean match".into(),
            hint: Some("Record `git rev-parse HEAD` and `git status --short` from the workspace. Do not invent a SHA.".into()),
        };
    };
    let head = raw.split_whitespace().next().unwrap_or("");
    if head.len() < 7 || !head.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return DoctorCheck {
            name: "git_sha".into(),
            status: "untested".into(),
            detail: format!("source identity was not a git SHA: {raw}"),
            hint: None,
        };
    }
    if raw.contains("dirty") || raw.contains("worktree-untested") {
        return DoctorCheck {
            name: "git_sha".into(),
            status: "warn".into(),
            detail: format!("source {raw}"),
            hint: Some("Worktree differs from HEAD or could not be checked. Bind evidence to the diff, not HEAD alone.".into()),
        };
    }
    DoctorCheck {
        name: "git_sha".into(),
        status: "pass".into(),
        detail: format!("source {head}"),
        hint: None,
    }
}

fn read_git_sha() -> Option<String> {
    let sha = Command::new("git")
        .args(["rev-parse", "--verify", "HEAD"])
        .stderr(Stdio::null())
        .output()
        .ok()?;
    if !sha.status.success() {
        return None;
    }
    let sha = String::from_utf8_lossy(&sha.stdout).trim().to_string();
    if sha.len() < 7 || !sha.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return None;
    }
    let dirty = Command::new("git")
        .args(["status", "--porcelain"])
        .stderr(Stdio::null())
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| !String::from_utf8_lossy(&output.stdout).trim().is_empty());
    match dirty {
        Some(true) => Some(format!("{sha} dirty")),
        Some(false) => Some(sha),
        None => Some(format!("{sha} worktree-untested")),
    }
}

fn daemon_command_path(pid: Option<u32>) -> Option<String> {
    let pid = pid.filter(|pid| *pid != 0)?;
    let output = Command::new("ps")
        .args(["-p", &pid.to_string(), "-o", "command="])
        .stderr(Stdio::null())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let line = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if line.is_empty() { None } else { Some(line) }
}

#[cfg(unix)]
fn pid_alive_kill0(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    Command::new("kill")
        .args(["-0", &pid.to_string()])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn scene_webview_crop_check(ax_ok: bool, rec: bool) -> DoctorCheck {
    let ready = ax_ok && rec;
    DoctorCheck {
        name: "scene_webview_crop".into(),
        status: if ready { "pass" } else { "warn" }.into(),
        detail: if ready {
            "AX + Screen Recording — screenshot/snapshot can attach webview crop (messenger pane)".into()
        } else {
            "webview crop needs Accessibility and Screen Recording; AX-only Scene still works".into()
        },
        hint: if ready {
            Some("MCP vcu_screenshot/vcu_snapshot pass tab_id; mode=full or app snapshot --pixels. App snapshot does not raise HUD.".into())
        } else {
            Some("系统设置 → 隐私与安全：辅助功能 + 屏幕录制给 vcu-daemon/终端；不要点 Edge Allow debugging".into())
        },
    }
}

fn login_browser_check(report: &crate::login_state::LoginBrowserReport) -> DoctorCheck {
    let user_n = report.user_browsers.len();
    let agent_n = report.agent_browsers.len();
    let (status, detail) = if user_n > 0 {
        let pids: Vec<String> = report
            .user_browsers
            .iter()
            .map(|b| format!("{}:{}", b.name, b.pid))
            .collect();
        (
            "pass",
            format!(
                "user browser login-state via desktop surface ({}); agent_profile={} cdp_9222={} handshake={} infobar={} allow_dialog={}",
                pids.join(","),
                agent_n,
                report.cdp_listening,
                report.cdp_handshake,
                report.automation_infobar,
                report.allow_dialog_visible
            ),
        )
    } else if agent_n > 0 {
        (
            "warn",
            format!(
                "only empty Agent Edge (no user cookies). Start desktop on the user Edge window. cdp_9222={}",
                report.cdp_listening
            ),
        )
    } else {
        (
            "warn",
            "no Chrome/Edge main process. Login-state needs the user browser window.".into(),
        )
    };
    DoctorCheck {
        name: "login_browser".into(),
        status: status.into(),
        detail,
        hint: Some(report.next_action.clone()),
    }
}

fn dual_browser_lens_check(
    chrome_installed: bool,
    edge_installed: bool,
    polling: &[String],
) -> DoctorCheck {
    let chrome_poll = polling.iter().any(|b| b.eq_ignore_ascii_case("chrome"));
    let edge_poll = polling.iter().any(|b| b.eq_ignore_ascii_case("edge"));
    if chrome_installed && edge_installed && !(chrome_poll && edge_poll) {
        let have = if polling.is_empty() {
            "none".to_string()
        } else {
            polling.join(",")
        };
        return DoctorCheck {
            name: "lens_dual_browser".into(),
            status: "warn".into(),
            detail: format!("Chrome and Edge are installed but lens is polling: {have}"),
            hint: Some(
                "Load unpacked ~/.vcu/lens-extension in the missing USER browser, then Reload. Never click Allow.".into(),
            ),
        };
    }
    let detail = if chrome_poll && edge_poll {
        "lens polling chrome+edge".into()
    } else if polling.is_empty() {
        "lens polling none".into()
    } else {
        format!("lens polling {}", polling.join(","))
    };
    DoctorCheck {
        name: "lens_dual_browser".into(),
        status: "pass".into(),
        detail,
        hint: None,
    }
}

fn app_backend_check(os: &str) -> DoctorCheck {
    if os == "windows" {
        return DoctorCheck {
            name: "app_backend".into(),
            status: "pass".into(),
            detail: "Windows adapter present; honest paths wm_settext / bm_click / clipboard_paste / wm_vscroll / guide_hover".into(),
            hint: Some(
                "CI live slices only. Not product Windows CU. Not complete Codex CU. WeChat denied. No SendInput / OS cursor."
                    .into(),
            ),
        };
    }
    DoctorCheck {
        name: "app_backend".into(),
        status: "pass".into(),
        detail: format!("platform adapter present ({os})"),
        hint: Some(
            "desktop surface uses AXPress/AXSetValue; WeChat is denied; OS cursor still denied"
                .into(),
        ),
    }
}

fn windows_desktop_scope_check(os: &str) -> Option<DoctorCheck> {
    if os != "windows" {
        return None;
    }
    Some(DoctorCheck {
        name: "windows_desktop_scope".into(),
        status: "warn".into(),
        detail: "CI slices: Notepad/Explorer/cmd/PowerShell/Calculator/Settings-observe/Guide/Abort. Not a product Windows Computer Use session.".into(),
        hint: Some("Do not claim complete Codex CU. WeChat denied. OS cursor denied.".into()),
    })
}

fn stage_helper_check(found: Option<&std::path::Path>, os: &str) -> DoctorCheck {
    if os == "windows" {
        return DoctorCheck {
            name: "stage_helper".into(),
            status: "pass".into(),
            detail: "WinForms Stage HUD (not vcu-stage); abort tears down; Guide overlay; no OS cursor".into(),
            hint: None,
        };
    }
    if os != "macos" {
        return DoctorCheck {
            name: "stage_helper".into(),
            status: "pass".into(),
            detail: "vcu-stage is macOS-only; Linux omits the helper".into(),
            hint: None,
        };
    }
    match found {
        Some(path) => DoctorCheck {
            name: "stage_helper".into(),
            status: "pass".into(),
            detail: format!("native Stage helper {}", path.display()),
            hint: None,
        },
        None => DoctorCheck {
            name: "stage_helper".into(),
            status: "warn".into(),
            detail: "vcu-stage not on PATH or next to vcu-daemon; desktop HUD falls back to JXA capsule".into(),
            hint: Some(
                "Install the macOS archive (includes vcu-stage) or run `bash scripts/build-stage.sh && cp target/release/vcu-stage ~/.local/bin/`"
                    .into(),
            ),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::{
        app_backend_check, daemon_liveness_check, dual_browser_lens_check, git_sha_check,
        host_identity_check, login_browser_check, macos_permission_checks,
        scene_webview_crop_check, stage_helper_check, version_identity_check,
        windows_desktop_scope_check,
    };
    use std::path::Path;

    #[test]
    fn dual_browser_lens_warns_when_only_one_polls() {
        let c = dual_browser_lens_check(true, true, &["edge".into()]);
        assert_eq!(c.name, "lens_dual_browser");
        assert_eq!(c.status, "warn");
        assert!(c.detail.contains("edge"), "{}", c.detail);
        assert!(c.hint.unwrap().contains("Never click Allow"));
        let p = dual_browser_lens_check(true, true, &["chrome".into(), "edge".into()]);
        assert_eq!(p.status, "pass");
        assert!(p.detail.contains("chrome+edge"));
        let one = dual_browser_lens_check(false, true, &["edge".into()]);
        assert_eq!(one.status, "pass");
    }

    #[test]
    fn stage_helper_is_optional_off_macos() {
        let c = stage_helper_check(None, "linux");
        assert_eq!(c.name, "stage_helper");
        assert_eq!(c.status, "pass");
        assert!(c.detail.contains("macOS-only"));
        let w = stage_helper_check(None, "windows");
        assert_eq!(w.status, "pass");
        assert!(w.detail.contains("WinForms"), "{}", w.detail);
        assert!(!w.detail.contains("omit the helper"), "{}", w.detail);
    }

    #[test]
    fn windows_app_backend_names_honest_paths_not_ax() {
        let w = app_backend_check("windows");
        assert_eq!(w.name, "app_backend");
        assert!(w.detail.contains("wm_settext"), "{}", w.detail);
        assert!(w.detail.contains("bm_click"), "{}", w.detail);
        assert!(w.detail.contains("clipboard_paste"), "{}", w.detail);
        assert!(!w.detail.contains("AXPress"), "{}", w.detail);
        let hint = w.hint.unwrap();
        assert!(hint.contains("Not product Windows CU"), "{hint}");
        assert!(hint.contains("No SendInput"), "{hint}");
        let m = app_backend_check("macos");
        assert!(m.hint.unwrap().contains("AXPress"));
    }

    #[test]
    fn windows_desktop_scope_warns_not_product() {
        assert!(windows_desktop_scope_check("macos").is_none());
        let c = windows_desktop_scope_check("windows").unwrap();
        assert_eq!(c.name, "windows_desktop_scope");
        assert_eq!(c.status, "warn");
        assert!(c.detail.contains("Not a product Windows"), "{}", c.detail);
        assert!(!c.detail.contains("AXPress"));
    }

    #[test]
    fn stage_helper_warns_when_missing_on_macos() {
        let c = stage_helper_check(None, "macos");
        assert_eq!(c.status, "warn");
        assert!(c.detail.contains("JXA"));
    }

    #[test]
    fn stage_helper_passes_when_found_on_macos() {
        let p = Path::new("/usr/local/bin/vcu-stage");
        let c = stage_helper_check(Some(p), "macos");
        assert_eq!(c.status, "pass");
        assert!(c.detail.contains("vcu-stage"));
    }

    #[test]
    fn accessibility_repair_is_settings_hint_not_tcc_or_allow() {
        let w = scene_webview_crop_check(false, false);
        let hint = w.hint.unwrap();
        assert!(hint.contains("系统设置"), "{hint}");
        assert!(hint.contains("不要点") || hint.to_ascii_lowercase().contains("do not click"), "{hint}");
        assert!(!hint.contains("tccutil"), "{hint}");
        assert!(!hint.contains("x-apple.systempreferences"), "{hint}");
        let ax = vcu_core::ErrorCode::AccessibilityDenied.default_hint();
        assert!(ax.contains("系统设置"), "{ax}");
        assert!(ax.contains("Do not click Edge Allow debugging"), "{ax}");
        assert!(!ax.contains("tccutil"));
    }

    #[test]
    fn scene_webview_crop_pass_when_ax_and_recording() {
        let c = scene_webview_crop_check(true, true);
        assert_eq!(c.name, "scene_webview_crop");
        assert_eq!(c.status, "pass");
        assert!(c.detail.contains("webview crop"));
        let w = scene_webview_crop_check(true, false);
        assert_eq!(w.status, "warn");
        let w = scene_webview_crop_check(false, true);
        assert_eq!(w.status, "warn");
    }

    #[test]
    fn permission_classes_do_not_collapse_or_reset_tcc() {
        let automation = macos_permission_checks(
            false,
            "Not authorized to send Apple events to System Events. (-1743)",
        );
        let automation_fail = automation.iter().find(|check| check.name == "macos_automation").unwrap();
        assert_eq!(automation_fail.status, "fail");
        let hint = automation_fail.hint.clone().unwrap();
        assert!(hint.contains("自动化"), "{hint}");
        assert!(!hint.contains("辅助功能"), "{hint}");
        assert!(!hint.contains("tccutil"), "{hint}");
        let ax = automation.iter().find(|check| check.name == "macos_accessibility").unwrap();
        assert_eq!(ax.status, "untested");

        let access = macos_permission_checks(
            false,
            "osascript is not allowed assistive access. (-25211)",
        );
        let access_fail = access.iter().find(|check| check.name == "macos_accessibility").unwrap();
        assert_eq!(access_fail.status, "fail");
        let hint = access_fail.hint.clone().unwrap();
        assert!(hint.contains("辅助功能"), "{hint}");
        assert!(hint.contains("Do not click Edge Allow"), "{hint}");
        assert_eq!(
            access.iter().find(|check| check.name == "macos_automation").unwrap().status,
            "pass"
        );

        let unknown = macos_permission_checks(false, "syntax error");
        assert!(unknown.iter().all(|check| check.status != "pass"));
        assert!(unknown.iter().any(|check| check.status == "untested"));
        let ok = macos_permission_checks(true, "");
        assert!(ok.iter().all(|check| check.status == "pass"));
    }

    #[test]
    fn identity_version_and_sha_do_not_fake_pass() {
        let host = host_identity_check("macos", "aarch64", Some("/tmp/vcu"), Some("/tmp/vcu-daemon"), Some(42));
        assert_eq!(host.status, "pass");
        assert!(host.detail.contains("os=macos"));
        assert!(host.detail.contains("arch=aarch64"));
        assert!(host.detail.contains("binary=/tmp/vcu"));
        assert!(host.detail.contains("daemon_pid=42"));
        assert_eq!(host_identity_check("macos", "aarch64", None, None, None).status, "warn");

        let matched = version_identity_check("0.1.0", Some("0.1.0"));
        assert_eq!(matched.status, "pass");
        let missing = version_identity_check("0.1.0", None);
        assert_eq!(missing.status, "untested");
        assert!(missing.detail.contains("0.2.8"));
        assert_ne!(missing.status, "fail");
        let mismatched = version_identity_check("0.1.0", Some("0.2.8"));
        assert_eq!(mismatched.status, "fail");
        assert!(mismatched.detail.contains("Extension Bridge 0.2.8 is not this comparison"));

        assert_eq!(git_sha_check(None).status, "untested");
        assert_ne!(git_sha_check(None).status, "pass");
        let dirty = git_sha_check(Some("aa28f36abcdef dirty"));
        assert_eq!(dirty.status, "warn");
        assert_eq!(git_sha_check(Some("aa28f36abcdef")).status, "pass");
        assert_eq!(git_sha_check(Some("not-a-sha")).status, "untested");

        assert_eq!(daemon_liveness_check(None, None, false).status, "untested");
        assert_eq!(daemon_liveness_check(Some(9), Some(false), false).status, "fail");
        assert_eq!(daemon_liveness_check(Some(9), None, false).status, "untested");
        let live = daemon_liveness_check(Some(9), Some(true), false);
        assert_eq!(live.status, "pass");
        assert!(live.detail.contains("kill -0"));
        assert!(live.detail.contains("did not capture the screen"));
        assert_eq!(daemon_liveness_check(None, None, true).status, "pass");
    }

    #[test]
    fn doctor_source_does_not_capture_the_screen_or_reset_tcc() {
        let src = include_str!("doctor.rs");
        let prod = src.split("mod tests").next().unwrap_or(src);
        assert!(!prod.contains("screencapture"), "doctor must not invoke screencapture");
        assert!(!prod.contains("CGDisplayCreateImage"));
        assert!(!prod.contains("CGWindowListCreateImage"));
        assert!(!prod.contains("tccutil"));
        assert!(prod.contains("kill -0") || prod.contains("[\"-0\""));
    }

    #[cfg(unix)]
    #[test]
    fn kill0_does_not_signal_a_live_process() {
        let mut child = std::process::Command::new("/bin/sleep").arg("30").spawn().expect("sleep");
        let pid = child.id();
        assert!(super::pid_alive_kill0(pid));
        std::thread::sleep(std::time::Duration::from_millis(100));
        match child.try_wait() {
            Ok(None) => {}
            other => panic!("kill -0 terminated the sleeper: {other:?}"),
        }
        let _ = child.kill();
        let _ = child.wait();
        assert!(!super::pid_alive_kill0(pid));
    }

    #[test]
    fn login_browser_pass_when_user_edge() {
        let report = crate::login_state::LoginBrowserReport {
            preferred_path: "desktop_user_window",
            user_browsers: vec![crate::login_state::BrowserProc {
                pid: 10,
                name: "Microsoft Edge".into(),
                profile: "user".into(),
                command_excerpt: "Microsoft Edge".into(),
            }],
            agent_browsers: vec![],
            cdp_listening: true,
            cdp_note: "x".into(),
            extension_profile: "agent",
            automation_infobar: true,
            allow_dialog_visible: false,
            cdp_handshake: "listening_may_block",
            host_vision: "h",
            never: vec![],
            lens_copied: true,
            lens_dir: "/tmp/lens".into(),
            next_action: "x".into(),
            never_click_allow: true,
            never_os_cursor: true,
            never_wechat: true,
            frontmost_app: None,
        };
        let c = login_browser_check(&report);
        assert_eq!(c.name, "login_browser");
        assert_eq!(c.status, "pass");
        assert!(c.detail.contains("user browser"));
    }
}
