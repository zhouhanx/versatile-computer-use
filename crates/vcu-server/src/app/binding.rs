//! Generation-bound scene refs and window captures.
//! Bare `eN` / `nN` refs are not executable. A bound ref may act only after the
//! same window, geometry, and element identity still match. Live success
//! consumes the generation so the mutation is not replayed.

use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};

use vcu_core::{new_id, ErrorCode, VcuError, VcuResult};

use super::scene::WindowPick;
use super::AppElement;
use super::AppSnapshot;

pub const FRAME_TOLERANCE: f64 = 12.0;
const MAX_SCENES: usize = 64;
const MAX_CAPTURES: usize = 64;

#[derive(Debug, Clone)]
pub struct BoundElement {
    pub local_ref: String,
    pub role: String,
    pub name: String,
    pub path: Vec<u32>,
    pub identifier: Option<String>,
}

#[derive(Debug, Clone)]
struct SceneRecord {
    scene_id: String,
    token: String,
    app_id: String,
    process: String,
    window_id: u64,
    frame: [f64; 4],
    title: String,
    elements: HashMap<String, BoundElement>,
    consumed: bool,
}

#[derive(Debug, Clone)]
pub struct CaptureRecord {
    pub capture_id: String,
    pub scene_id: String,
    pub token: String,
    pub window_id: u64,
    pub frame: [f64; 4],
    pub width: u32,
    pub height: u32,
    pub scale: Option<f64>,
    pub consumed: bool,
}

#[derive(Debug, Clone)]
pub struct PreparedAction {
    pub token: String,
    pub scene_id: String,
    pub app_id: String,
    pub process: String,
    pub window_id: u64,
    pub frame: [f64; 4],
    pub title: String,
    pub element: BoundElement,
    pub capture_id: Option<String>,
}

pub struct SceneBindings {
    inner: Mutex<Store>,
}

struct Store {
    scenes: HashMap<String, SceneRecord>,
    order: VecDeque<String>,
    captures: HashMap<String, CaptureRecord>,
    capture_order: VecDeque<String>,
}

impl SceneBindings {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            inner: Mutex::new(Store {
                scenes: HashMap::new(),
                order: VecDeque::new(),
                captures: HashMap::new(),
                capture_order: VecDeque::new(),
            }),
        })
    }

    pub fn register_scene(&self, snap: &mut AppSnapshot, app_id: &str, pick: &WindowPick) {
        let Some(window_id) = snap.window_id.as_deref().and_then(|s| s.parse::<u64>().ok()) else {
            return;
        };
        if window_id != pick.id {
            return;
        }
        let Some(frame) = snap.window_frame else {
            return;
        };
        let scene_id = snap
            .scene_id
            .clone()
            .unwrap_or_else(|| format!("ax:{}:{window_id}", snap.target.pid.unwrap_or(0)));
        let token = new_id();
        let mut counts: HashMap<String, usize> = HashMap::new();
        for el in &snap.elements {
            if let Some(ident) = el.ax_identifier.as_deref().filter(|s| !s.is_empty()) {
                *counts.entry(ident.to_string()).or_default() += 1;
            }
        }
        let mut elements = HashMap::new();
        let mut bound = 0usize;
        for el in &mut snap.elements {
            let Some(path) = el.index_path.as_deref().filter(|s| !s.is_empty()) else {
                continue;
            };
            if el.role.to_ascii_lowercase().contains("window") {
                continue;
            }
            if let Some(ident) = el.ax_identifier.as_deref() {
                if counts.get(ident).copied().unwrap_or(0) > 1 {
                    continue;
                }
            }
            let Ok(steps) = parse_index_path(path) else {
                continue;
            };
            if steps.is_empty() {
                continue;
            }
            let local = el.r#ref.clone();
            let bound_ref = format!("b1.{token}.{local}");
            el.bound_ref = Some(bound_ref);
            elements.insert(
                local.clone(),
                BoundElement {
                    local_ref: local,
                    role: el.role.clone(),
                    name: el.name.clone(),
                    path: steps,
                    identifier: el.ax_identifier.clone(),
                },
            );
            bound += 1;
        }
        if bound == 0 {
            return;
        }
        snap.scene_id = Some(scene_id.clone());
        snap.summary.push_str(&format!(
            " binding_token={token} bound_refs={bound} mutation=generation_bound"
        ));
        let record = SceneRecord {
            scene_id,
            token: token.clone(),
            app_id: app_id.to_string(),
            process: snap.target.bundle_or_exe.clone(),
            window_id,
            frame,
            title: pick.title.clone(),
            elements,
            consumed: false,
        };
        let Ok(mut store) = self.inner.lock() else {
            return;
        };
        store.scenes.insert(token.clone(), record);
        store.order.push_back(token);
        while store.order.len() > MAX_SCENES {
            if let Some(old) = store.order.pop_front() {
                store.scenes.remove(&old);
            }
        }
    }

    pub fn register_capture(
        &self,
        capture_id: &str,
        scene_id: &str,
        token: &str,
        window_id: u64,
        frame: [f64; 4],
        width: u32,
        height: u32,
        scale: Option<f64>,
    ) -> VcuResult<()> {
        let mut store = self.inner.lock().map_err(|_| {
            VcuError::coded(ErrorCode::Internal, "scene binding lock poisoned")
        })?;
        let Some(scene) = store.scenes.get(token) else {
            return Err(VcuError::coded(
                ErrorCode::InvalidInput,
                "capture has no generation-bound scene; observe the window again",
            ));
        };
        if scene.consumed || scene.scene_id != scene_id || scene.window_id != window_id {
            return Err(VcuError::coded(
                ErrorCode::InvalidInput,
                "capture does not match the current scene generation",
            ));
        }
        store.captures.insert(
            capture_id.to_string(),
            CaptureRecord {
                capture_id: capture_id.to_string(),
                scene_id: scene_id.to_string(),
                token: token.to_string(),
                window_id,
                frame,
                width,
                height,
                scale,
                consumed: false,
            },
        );
        store.capture_order.push_back(capture_id.to_string());
        while store.capture_order.len() > MAX_CAPTURES {
            if let Some(old) = store.capture_order.pop_front() {
                store.captures.remove(&old);
            }
        }
        Ok(())
    }

    pub fn window_of(&self, element_ref: &str) -> VcuResult<u64> {
        let parsed = parse_bound_ref(element_ref)?;
        let store = self.inner.lock().map_err(|_| {
            VcuError::coded(ErrorCode::Internal, "scene binding lock poisoned")
        })?;
        store
            .scenes
            .get(&parsed.token)
            .map(|scene| scene.window_id)
            .ok_or_else(|| {
                VcuError::coded(
                    ErrorCode::InvalidInput,
                    "scene generation is unknown; observe the window again",
                )
            })
    }

    pub fn prepare_action(
        &self,
        app_id: &str,
        element_ref: &str,
        scene_id: Option<&str>,
        capture_id: Option<&str>,
        live_frame: Option<[f64; 4]>,
    ) -> VcuResult<PreparedAction> {
        let parsed = parse_bound_ref(element_ref)?;
        let store = self.inner.lock().map_err(|_| {
            VcuError::coded(ErrorCode::Internal, "scene binding lock poisoned")
        })?;
        let Some(scene) = store.scenes.get(&parsed.token) else {
            return Err(VcuError::coded(
                ErrorCode::InvalidInput,
                "scene generation is unknown; observe the window again",
            ));
        };
        if scene.consumed {
            return Err(VcuError::coded(
                ErrorCode::InvalidInput,
                "scene generation was consumed; refusing to replay the mutation",
            ));
        }
        if scene.app_id != app_id {
            return Err(VcuError::coded(
                ErrorCode::InvalidInput,
                "bound ref belongs to a different app; refusing to retarget",
            ));
        }
        if let Some(want) = scene_id {
            if want != scene.scene_id {
                return Err(VcuError::coded(
                    ErrorCode::InvalidInput,
                    "scene_id does not match the bound generation",
                ));
            }
        }
        let Some(live) = live_frame else {
            return Err(VcuError::coded(
                ErrorCode::InvalidInput,
                "bound window is gone; refusing to fall back to another window",
            ));
        };
        if !frames_match(scene.frame, live, FRAME_TOLERANCE) {
            return Err(VcuError::coded(
                ErrorCode::InvalidInput,
                "scene geometry changed; observe the window again",
            ));
        }
        let Some(element) = scene.elements.get(&parsed.local_ref).cloned() else {
            return Err(VcuError::coded(
                ErrorCode::InvalidInput,
                "bound ref is not in this scene generation",
            ));
        };
        if let Some(cid) = capture_id {
            let Some(cap) = store.captures.get(cid) else {
                return Err(VcuError::coded(
                    ErrorCode::InvalidInput,
                    "capture_id is unknown or expired; capture the same window again",
                ));
            };
            if cap.consumed || cap.token != scene.token || cap.window_id != scene.window_id {
                return Err(VcuError::coded(
                    ErrorCode::InvalidInput,
                    "capture is stale for this window generation",
                ));
            }
            if !frames_match(cap.frame, live, FRAME_TOLERANCE) {
                return Err(VcuError::coded(
                    ErrorCode::InvalidInput,
                    "capture geometry does not match the window; capture again",
                ));
            }
        }
        Ok(PreparedAction {
            token: scene.token.clone(),
            scene_id: scene.scene_id.clone(),
            app_id: scene.app_id.clone(),
            process: scene.process.clone(),
            window_id: scene.window_id,
            frame: live,
            title: scene.title.clone(),
            element,
            capture_id: capture_id.map(str::to_string),
        })
    }

    pub fn consume(&self, token: &str, capture_id: Option<&str>) {
        let Ok(mut store) = self.inner.lock() else {
            return;
        };
        if let Some(scene) = store.scenes.get_mut(token) {
            scene.consumed = true;
        }
        if let Some(cid) = capture_id {
            if let Some(cap) = store.captures.get_mut(cid) {
                cap.consumed = true;
            }
        }
        for cap in store.captures.values_mut() {
            if cap.token == token {
                cap.consumed = true;
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedBoundRef {
    pub token: String,
    pub local_ref: String,
}

pub fn is_bound_ref(raw: &str) -> bool {
    parse_bound_ref(raw).is_ok()
}

pub fn require_bound_ref(raw: &str) -> VcuResult<ParsedBoundRef> {
    parse_bound_ref(raw)
}

pub fn parse_bound_ref(raw: &str) -> VcuResult<ParsedBoundRef> {
    let raw = raw.trim();
    if super::scene::observation_only_scene_ref(raw) {
        return Err(VcuError::coded(
            ErrorCode::InvalidInput,
            "scene ref is observation-only until window binding; refusing live mutation",
        ));
    }
    if is_legacy_index_ref(raw) {
        return Err(VcuError::coded(
            ErrorCode::InvalidInput,
            "legacy eN ref is not generation-bound; refusing to re-walk by index",
        ));
    }
    let mut parts = raw.split('.');
    let kind = parts.next().unwrap_or("");
    let token = parts.next().unwrap_or("");
    let local = parts.next().unwrap_or("");
    if kind != "b1"
        || parts.next().is_some()
        || token.len() != 26
        || !token.chars().all(|c| c.is_ascii_alphanumeric())
        || !is_local_ref(local)
    {
        return Err(VcuError::coded(
            ErrorCode::InvalidInput,
            "action requires a generation-bound scene ref; observe the window again",
        ));
    }
    Ok(ParsedBoundRef {
        token: token.to_string(),
        local_ref: local.to_string(),
    })
}

fn is_legacy_index_ref(raw: &str) -> bool {
    let Some(rest) = raw.strip_prefix('e') else {
        return false;
    };
    !rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit())
}

fn is_local_ref(raw: &str) -> bool {
    let Some(rest) = raw.strip_prefix('n') else {
        return false;
    };
    !rest.is_empty() && rest.len() <= 6 && rest.chars().all(|c| c.is_ascii_digit())
}

pub fn parse_index_path(raw: &str) -> VcuResult<Vec<u32>> {
    if raw.trim().is_empty() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for part in raw.split('/') {
        let idx: u32 = part.parse().map_err(|_| {
            VcuError::coded(ErrorCode::InvalidInput, "element index path is not numeric")
        })?;
        if idx > 10_000 {
            return Err(VcuError::coded(
                ErrorCode::InvalidInput,
                "element index path is out of range",
            ));
        }
        out.push(idx);
    }
    Ok(out)
}

pub fn frames_match(bound: [f64; 4], live: [f64; 4], tolerance: f64) -> bool {
    bound.iter().zip(live).all(|(a, b)| (a - b).abs() <= tolerance)
}

pub fn token_from_elements(elements: &[AppElement]) -> Option<String> {
    elements.iter().find_map(|el| {
        el.bound_ref
            .as_deref()
            .and_then(|raw| parse_bound_ref(raw).ok())
            .map(|parsed| parsed.token)
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ActionReport {
    Dry {
        role: String,
        name: String,
        identifier: String,
    },
    Pressed {
        role: String,
        name: String,
        identifier: String,
    },
    Set {
        role: String,
        name: String,
        identifier: String,
    },
    Stale,
    Missing,
    Ambiguous,
    Failed(String),
}

pub fn interpret_action(raw: &str) -> VcuResult<ActionReport> {
    let line = raw.lines().find(|l| !l.trim().is_empty()).unwrap_or("").trim();
    let mut parts = line.split('|');
    let kind = parts.next().unwrap_or("");
    let role = parts.next().unwrap_or("").to_string();
    let name = parts.next().unwrap_or("").to_string();
    let identifier = parts.next().unwrap_or("").to_string();
    match kind {
        "DRY" => Ok(ActionReport::Dry {
            role,
            name,
            identifier,
        }),
        "PRESSED" => Ok(ActionReport::Pressed {
            role,
            name,
            identifier,
        }),
        "SET" => Ok(ActionReport::Set {
            role,
            name,
            identifier,
        }),
        "STALE" => Ok(ActionReport::Stale),
        "MISSING" | "WINMISSING" | "PATHMISSING" => Ok(ActionReport::Missing),
        "WINAMBIG" => Ok(ActionReport::Ambiguous),
        other => Ok(ActionReport::Failed(if other.is_empty() {
            "empty action result".into()
        } else {
            line.to_string()
        })),
    }
}

pub fn action_error(report: &ActionReport) -> VcuError {
    match report {
        ActionReport::Stale => VcuError::coded(
            ErrorCode::InvalidInput,
            "bound element identity no longer matches; refusing to act on a different control",
        ),
        ActionReport::Missing => VcuError::coded(
            ErrorCode::InvalidInput,
            "bound window or element is gone; refusing to fall back to another target",
        ),
        ActionReport::Ambiguous => VcuError::coded(
            ErrorCode::InvalidInput,
            "window identity is ambiguous; refusing to guess",
        ),
        ActionReport::Failed(detail) => {
            VcuError::with_detail(ErrorCode::ActionFailed, "bound action failed", detail.clone())
        }
        _ => VcuError::coded(ErrorCode::Internal, "bound action was not a failure"),
    }
}

pub fn ax_bound_action_script(
    prepared: &PreparedAction,
    dry_run: bool,
    set_value: Option<&str>,
) -> String {
    let process = super::scene::applescript_string(&prepared.process);
    let title = super::scene::applescript_string(&prepared.title);
    let role = super::scene::applescript_string(&prepared.element.role);
    let name = super::scene::applescript_string(&prepared.element.name);
    let ident = super::scene::applescript_string(prepared.element.identifier.as_deref().unwrap_or(""));
    let value = super::scene::applescript_string(set_value.unwrap_or(""));
    let path = if prepared.element.path.is_empty() {
        "{}".to_string()
    } else {
        format!(
            "{{{}}}",
            prepared
                .element
                .path
                .iter()
                .map(|n| n.to_string())
                .collect::<Vec<_>>()
                .join(", ")
        )
    };
    let dry = if dry_run { "true" } else { "false" };
    let do_set = if set_value.is_some() && !dry_run { "true" } else { "false" };
    let x = prepared.frame[0].round() as i32;
    let y = prepared.frame[1].round() as i32;
    let width = prepared.frame[2].round() as i32;
    let height = prepared.frame[3].round() as i32;
    format!(
        r#"on vcuClean(t)
  set oldDelims to AppleScript's text item delimiters
  try
    set t to t as text
    if t is "missing value" then
      set AppleScript's text item delimiters to oldDelims
      return ""
    end if
    set AppleScript's text item delimiters to {{return, linefeed, tab, "|"}}
    set bits to text items of t
    set AppleScript's text item delimiters to " "
    set t to bits as text
    if length of t > 180 then set t to text 1 thru 180 of t
    set AppleScript's text item delimiters to oldDelims
    return t
  on error
    set AppleScript's text item delimiters to oldDelims
    return ""
  end try
end vcuClean
tell application "System Events"
  tell process "{process}"
    set vcuTitleWant to "{title}"
    set vcuX to {x}
    set vcuY to {y}
    set vcuW to {width}
    set vcuH to {height}
    set vcuWin to missing value
    set vcuHits to 0
    repeat with w in windows
      try
        set nm to name of w as text
        if nm is "missing value" then set nm to ""
        set p to position of w
        set sz to size of w
        set dx to (item 1 of p) - vcuX
        if dx < 0 then set dx to -dx
        set dy to (item 2 of p) - vcuY
        if dy < 0 then set dy to -dy
        set dw to (item 1 of sz) - vcuW
        if dw < 0 then set dw to -dw
        set dh to (item 2 of sz) - vcuH
        if dh < 0 then set dh to -dh
        set titleOk to true
        if vcuTitleWant is not "" then
          if nm is not vcuTitleWant then set titleOk to false
        end if
        if titleOk is true then
          if dx <= 12 then
            if dy <= 12 then
              if dw <= 12 then
                if dh <= 12 then
                  set vcuHits to vcuHits + 1
                  set vcuWin to w
                end if
              end if
            end if
          end if
        end if
      end try
    end repeat
    if vcuHits is 0 then return "WINMISSING"
    if vcuHits > 1 then return "WINAMBIG"
    set vcuEl to vcuWin
    set vcuSteps to {path}
    repeat with vcuStep in vcuSteps
      try
        set vcuKids to UI elements of vcuEl
      on error
        return "PATHMISSING"
      end try
      set vcuI to vcuStep as integer
      if ((vcuI < 0) or (vcuI >= (count of vcuKids))) then return "PATHMISSING"
      try
        set vcuEl to item (vcuI + 1) of vcuKids
      on error
        return "PATHMISSING"
      end try
    end repeat
    set r to ""
    set nm to ""
    set ident to ""
    try
      set r to my vcuClean(role of vcuEl)
    end try
    try
      set nm to my vcuClean(name of vcuEl)
    end try
    if nm is "" then
      try
        set nm to my vcuClean(description of vcuEl)
      end try
    end if
    try
      set ident to my vcuClean(value of attribute "AXIdentifier" of vcuEl)
    end try
    if ident is "" then
      try
        set ident to my vcuClean(value of attribute "AXDescription" of vcuEl)
      end try
    end if
    if ident is "" then
      if r contains "Button" or r contains "button" then
        try
          set ident to my vcuClean(value of vcuEl as text)
        end try
      end if
    end if
    if r is not "{role}" then return "STALE|" & r & "|" & nm & "|" & ident
    if nm is not "{name}" then return "STALE|" & r & "|" & nm & "|" & ident
    if "{ident}" is not "" then
      if ident is not "{ident}" then return "STALE|" & r & "|" & nm & "|" & ident
    end if
    if {dry} then return "DRY|" & r & "|" & nm & "|" & ident
    if {do_set} then
      try
        set value of vcuEl to "{value}"
        return "SET|" & r & "|" & nm & "|" & ident
      on error errMsg
        return "ERROR|" & errMsg
      end try
    end if
    try
      perform action "AXPress" of vcuEl
      return "PRESSED|" & r & "|" & nm & "|" & ident
    on error errMsg
      return "ERROR|" & errMsg
    end try
  end tell
end tell
"#,
        process = process,
        title = title,
        x = x,
        y = y,
        width = width,
        height = height,
        path = path,
        role = role,
        name = name,
        ident = ident,
        dry = dry,
        do_set = do_set,
        value = value,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::{AppElement, AppSnapshot, AppTarget};

    fn element(r#ref: &str, role: &str, name: &str, path: &str, ident: &str) -> AppElement {
        AppElement {
            r#ref: r#ref.into(),
            role: role.into(),
            name: name.into(),
            value: None,
            frame: Some([1.0, 2.0, 3.0, 4.0]),
            parent_ref: None,
            actions: vec!["AXPress".into()],
            editable: Some(false),
            index_path: Some(path.into()),
            ax_identifier: Some(ident.into()),
            bound_ref: None,
        }
    }

    fn snap(elements: Vec<AppElement>) -> AppSnapshot {
        AppSnapshot {
            target: AppTarget {
                id: "proc:vcu-ax-binding:9".into(),
                title: "A".into(),
                bundle_or_exe: "vcu-ax-binding".into(),
                pid: Some(9),
                allowed: true,
                browser_profile: None,
            },
            summary: "kind=desktop.scene".into(),
            elements,
            truncated: false,
            window_frame: Some([10.0, 20.0, 400.0, 300.0]),
            webview: false,
            webview_ref: None,
            page_title: Some("A".into()),
            page_url: None,
            tabs: vec![],
            ax_enhanced: false,
            window_id: Some("42".into()),
            scene_id: Some("ax:9:42:1".into()),
            truncation_reason: None,
        }
    }

    #[test]
    fn legacy_refs_are_not_generation_bound() {
        assert!(parse_bound_ref("e1").unwrap_err().message().contains("legacy eN"));
        assert!(parse_bound_ref("n3").unwrap_err().message().contains("observation-only"));
        assert!(parse_bound_ref("w1").is_err());
        assert!(parse_bound_ref("").is_err());
        let ok = parse_bound_ref("b1.01ARZ3NDEKTSV4RRFFQ69G5FAV.n2").unwrap();
        assert_eq!(ok.local_ref, "n2");
    }

    #[test]
    fn same_name_controls_get_distinct_refs_and_duplicates_do_not() {
        let bindings = SceneBindings::new();
        let pick = WindowPick {
            id: 42,
            title: "A".into(),
            x: 10,
            y: 20,
            width: 400,
            height: 300,
        };
        let mut scene = snap(vec![
            element("n1", "AXButton", "Go", "0/1", "go-a"),
            element("n2", "AXButton", "Go", "0/2", "go-b"),
            element("n3", "AXButton", "Go", "0/3", "dup"),
            element("n4", "AXButton", "Go", "0/4", "dup"),
        ]);
        bindings.register_scene(&mut scene, "proc:vcu-ax-binding:9", &pick);
        assert!(scene.elements[0].bound_ref.as_deref().unwrap().starts_with("b1."));
        assert_ne!(scene.elements[0].bound_ref, scene.elements[1].bound_ref);
        assert!(scene.elements[2].bound_ref.is_none());
        assert!(scene.elements[3].bound_ref.is_none());
        assert!(scene.summary.contains("mutation=generation_bound"));
        let live = Some([10.0, 20.0, 400.0, 300.0]);
        let prepared = bindings
            .prepare_action(
                "proc:vcu-ax-binding:9",
                scene.elements[0].bound_ref.as_deref().unwrap(),
                Some("ax:9:42:1"),
                None,
                live,
            )
            .unwrap();
        assert_eq!(prepared.element.identifier.as_deref(), Some("go-a"));
        assert!(bindings
            .prepare_action("proc:other:1", scene.elements[0].bound_ref.as_deref().unwrap(), None, None, live)
            .is_err());
        assert!(bindings
            .prepare_action(
                "proc:vcu-ax-binding:9",
                scene.elements[0].bound_ref.as_deref().unwrap(),
                None,
                None,
                None,
            )
            .unwrap_err()
            .message()
            .contains("gone"));
        assert!(bindings
            .prepare_action(
                "proc:vcu-ax-binding:9",
                scene.elements[0].bound_ref.as_deref().unwrap(),
                None,
                None,
                Some([80.0, 20.0, 400.0, 300.0]),
            )
            .unwrap_err()
            .message()
            .contains("geometry"));
        bindings.consume(&prepared.token, None);
        assert!(bindings
            .prepare_action(
                "proc:vcu-ax-binding:9",
                scene.elements[0].bound_ref.as_deref().unwrap(),
                None,
                None,
                live,
            )
            .unwrap_err()
            .message()
            .contains("replay"));
    }

    #[test]
    fn action_script_does_not_steal_focus_or_use_window_order() {
        let prepared = PreparedAction {
            token: "01ARZ3NDEKTSV4RRFFQ69G5FAV".into(),
            scene_id: "ax:1:2:3".into(),
            app_id: "proc:Fixture:1".into(),
            process: "vcu-ax-binding".into(),
            window_id: 7,
            frame: [1.0, 2.0, 30.0, 40.0],
            title: "VCU-MAC-003-A".into(),
            element: BoundElement {
                local_ref: "n2".into(),
                role: "AXButton".into(),
                name: "Go".into(),
                path: vec![0, 1],
                identifier: Some("go-a".into()),
            },
            capture_id: None,
        };
        let dry = ax_bound_action_script(&prepared, true, None);
        assert!(dry.contains("vcuDry") || dry.contains("if true then return \"DRY|\""));
        assert!(!dry.contains("set frontmost"));
        assert!(!dry.contains("window 1"));
        assert!(!dry.contains("AXEnhancedUserInterface"));
        assert!(dry.contains("perform action \"AXPress\""));
        assert!(dry.contains("{0, 1}"));
        assert!(dry.contains("STALE|"));
        let live = ax_bound_action_script(&prepared, false, None);
        assert!(live.contains("if false then return \"DRY|\""));
        assert_eq!(
            interpret_action("STALE|AXButton|Go|go-decoy").unwrap(),
            ActionReport::Stale
        );
        assert!(matches!(
            interpret_action("PRESSED|AXButton|Go|go-a").unwrap(),
            ActionReport::Pressed { .. }
        ));
    }

    #[test]
    fn capture_must_match_generation_and_geometry() {
        let bindings = SceneBindings::new();
        let pick = WindowPick {
            id: 42,
            title: "A".into(),
            x: 10,
            y: 20,
            width: 400,
            height: 300,
        };
        let mut scene = snap(vec![element("n1", "AXButton", "Go", "1", "go-a")]);
        bindings.register_scene(&mut scene, "proc:vcu-ax-binding:9", &pick);
        let token = token_from_elements(&scene.elements).unwrap();
        bindings
            .register_capture(
                "cap1",
                "ax:9:42:1",
                &token,
                42,
                [10.0, 20.0, 400.0, 300.0],
                800,
                600,
                Some(2.0),
            )
            .unwrap();
        let r#ref = scene.elements[0].bound_ref.as_deref().unwrap();
        assert!(bindings
            .prepare_action(
                "proc:vcu-ax-binding:9",
                r#ref,
                None,
                Some("cap1"),
                Some([10.0, 21.0, 400.0, 300.0]),
            )
            .is_ok());
        let err = bindings
            .prepare_action(
                "proc:vcu-ax-binding:9",
                r#ref,
                None,
                Some("cap1"),
                Some([200.0, 20.0, 400.0, 300.0]),
            )
            .unwrap_err();
        assert!(err.message().contains("geometry"));
        assert!(bindings
            .prepare_action(
                "proc:vcu-ax-binding:9",
                r#ref,
                None,
                Some("missing"),
                Some([10.0, 20.0, 400.0, 300.0]),
            )
            .is_err());
    }
}
