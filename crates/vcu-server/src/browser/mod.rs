pub mod cdp;
pub mod desktop;
pub mod extension;
pub mod mock;

use async_trait::async_trait;
use vcu_core::{ActionRequest, DomRef, ExtractResult, SnapshotMode, TabInfo, VcuResult};

#[async_trait]
pub trait BrowserBackend: Send + Sync {
    fn name(&self) -> &str;
    async fn ensure_agent_window(&mut self) -> VcuResult<String>;
    async fn list_tabs(&self) -> VcuResult<Vec<TabInfo>>;
    async fn navigate(&mut self, tab_id: &str, url: &str) -> VcuResult<()>;
    async fn snapshot(
        &self,
        tab_id: &str,
        mode: SnapshotMode,
        budget_tokens: u64,
    ) -> VcuResult<SnapshotData>;
    async fn click(&mut self, tab_id: &str, target_ref: &str) -> VcuResult<ActionResultDetail>;
    async fn type_text(
        &mut self,
        tab_id: &str,
        text: &str,
        target_ref: Option<&str>,
    ) -> VcuResult<ActionResultDetail>;
    async fn extract(&self, tab_id: &str, selector: &str) -> VcuResult<ExtractResult>;
    async fn screenshot(&self, tab_id: &str, full_page: bool) -> VcuResult<ScreenshotData>;
    async fn act(&mut self, tab_id: &str, action: &ActionRequest) -> VcuResult<ActionResultDetail>;
    fn abort_watch_path(&self) -> Option<std::path::PathBuf> {
        None
    }
    fn stage_helper_pid(&self) -> Option<u32> {
        None
    }
    fn stage_hud(&self) -> Option<(bool, &'static str)> {
        None
    }
    fn request_stage_abort(&self) -> vcu_core::VcuResult<()> {
        Err(vcu_core::VcuError::coded(
            vcu_core::ErrorCode::InvalidInput,
            "Stage abort is only for desktop sessions",
        ))
    }

    /// App mutations share the desktop session Stage gate. Non-desktop backends allow the call.
    fn require_visible_stage(&self) -> vcu_core::VcuResult<()> {
        Ok(())
    }

    /// `Some(false)` means the helper exited, including a zombie the daemon still owns.
    fn stage_helper_running(&self) -> Option<bool> {
        None
    }
}

#[derive(Debug, Clone)]
pub struct SnapshotData {
    pub a11y_summary: Option<String>,
    pub dom_refs: Vec<DomRef>,
    pub text_excerpt: Option<String>,
    pub screenshot_png: Option<Vec<u8>>,
    pub truncated: bool,
    pub budget_tokens_est: u64,
    pub webview: bool,
    pub webview_ref: Option<String>,
    pub webview_png: Option<Vec<u8>>,
    pub screenshot_scale: Option<f64>,
    pub webview_screenshot_scale: Option<f64>,
}

#[derive(Debug, Clone)]
pub struct ActionResultDetail {
    pub ok: bool,
    pub detail: serde_json::Value,
}

#[derive(Debug, Clone)]
pub struct ScreenshotData {
    pub png: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub frame: Option<[f64; 4]>,
    pub scale: Option<f64>,
    pub webview_png: Option<Vec<u8>>,
    pub webview_ref: Option<String>,
    pub webview_frame: Option<[f64; 4]>,
    pub webview_scale: Option<f64>,
}

pub use mock::MockBackend;

pub use extension::{ExtensionBackend, ExtensionBridge};
