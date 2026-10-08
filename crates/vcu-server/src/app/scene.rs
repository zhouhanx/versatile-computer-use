//! Read-only AX scene identity, budgets, and redaction.
//! `nN` refs stay observation-only. Generation-bound actions live in `binding`.

use serde::{Deserialize, Serialize};
use vcu_core::{ErrorCode, VcuError, VcuResult};

use super::AppElement;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SceneQuery {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub window_id: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expand: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_nodes: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_depth: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timeout_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_output_bytes: Option<u32>,
}

#[derive(Debug, Clone)]
pub struct SceneBudgets {
    pub max_nodes: i32,
    pub max_depth: i32,
    pub timeout_ms: u64,
    pub max_output_bytes: usize,
}

#[derive(Debug, Clone)]
pub struct SceneWalk {
    pub window_id: Option<String>,
    pub window_frame: Option<[f64; 4]>,
    pub page_title: Option<String>,
    pub elements: Vec<AppElement>,
    pub truncated: bool,
    pub truncation_reason: Option<String>,
}

/// Measured on the MAC-002 fixture, TextEdit, and a one-file Finder window.
/// Leaf controls, text runs, and rulers are not descended; that is
/// `content_not_expanded`, not a complete tree.
pub const DEFAULT_SCENE_NODES: u32 = 80;
pub const DEFAULT_SCENE_DEPTH: u32 = 6;
pub const DEFAULT_SCENE_EXPAND_DEPTH: u32 = 24;
pub const DEFAULT_SCENE_TIMEOUT_MS: u64 = 4500;
pub const DEFAULT_SCENE_OUTPUT_BYTES: u32 = 24_000;
pub const SCENE_KILL_GRACE_MS: u64 = 900;

pub fn scene_kill_after_ms(timeout_ms: u64) -> u64 {
    timeout_ms
        .saturating_add(SCENE_KILL_GRACE_MS)
        .clamp(250, 9_000)
}

pub fn budgets_for(query: &SceneQuery, path_len: usize, token_budget: u64) -> SceneBudgets {
    let expanding = path_len > 0;
    let max_nodes = query
        .max_nodes
        .unwrap_or(DEFAULT_SCENE_NODES)
        .min(400) as i32;
    let default_depth = if expanding {
        DEFAULT_SCENE_EXPAND_DEPTH
    } else {
        DEFAULT_SCENE_DEPTH
    };
    let max_depth = query.max_depth.unwrap_or(default_depth).clamp(1, 32) as i32;
    let timeout_ms = query
        .timeout_ms
        .unwrap_or(DEFAULT_SCENE_TIMEOUT_MS)
        .clamp(1, 8000);
    let token_cap = if token_budget == 0 {
        DEFAULT_SCENE_OUTPUT_BYTES
    } else {
        token_budget.saturating_mul(8).clamp(256, 200_000) as u32
    };
    let max_output_bytes = query
        .max_output_bytes
        .unwrap_or(token_cap.min(DEFAULT_SCENE_OUTPUT_BYTES))
        .clamp(256, 200_000) as usize;
    SceneBudgets {
        max_nodes,
        max_depth,
        timeout_ms,
        max_output_bytes,
    }
}

pub fn validate_expand(raw: Option<&str>) -> VcuResult<Vec<u32>> {
    let Some(raw) = raw.map(str::trim).filter(|s| !s.is_empty()) else {
        return Ok(Vec::new());
    };
    if raw.len() > 200
        || raw.starts_with('/')
        || raw.ends_with('/')
        || raw.contains("//")
        || !raw.chars().all(|c| c.is_ascii_digit() || c == '/')
    {
        return Err(VcuError::coded(
            ErrorCode::InvalidInput,
            "expand must be a slash-separated child index path",
        ));
    }
    let mut out = Vec::new();
    for part in raw.split('/') {
        let idx: u32 = part.parse().map_err(|_| {
            VcuError::coded(ErrorCode::InvalidInput, "expand index is not a number")
        })?;
        if idx > 10_000 {
            return Err(VcuError::coded(
                ErrorCode::InvalidInput,
                "expand index is out of range",
            ));
        }
        out.push(idx);
    }
    if out.len() > 32 {
        return Err(VcuError::coded(
            ErrorCode::InvalidInput,
            "expand path is deeper than 32",
        ));
    }
    Ok(out)
}

pub fn observation_only_scene_ref(r#ref: &str) -> bool {
    let Some(rest) = r#ref.strip_prefix('n') else {
        return false;
    };
    !rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit())
}

pub fn refuse_live_mutation(r#ref: &str) -> VcuResult<()> {
    if observation_only_scene_ref(r#ref) {
        return Err(VcuError::coded(
            ErrorCode::InvalidInput,
            "scene ref is observation-only until window binding; refusing live mutation",
        ));
    }
    Ok(())
}

pub fn is_secret_control(role: &str, name: &str) -> bool {
    let blob = format!("{role} {name}").to_ascii_lowercase();
    blob.contains("secure")
        || blob.contains("password")
        || blob.contains("passwd")
        || blob.contains("密码")
}

pub fn scene_id(pid: Option<i32>, window_id: Option<&str>) -> String {
    let ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!(
        "ax:{}:{}:{ms}",
        pid.unwrap_or(0),
        window_id.unwrap_or("none")
    )
}

pub fn scene_summary(
    process: &str,
    elements: usize,
    truncated: bool,
    reason: Option<&str>,
    window_id: Option<&str>,
) -> String {
    format!(
        "kind=desktop.scene process=\"{process}\" window_id={} elements={elements} truncated={truncated} truncation_reason={} mutation=observation_only",
        window_id.unwrap_or(""),
        reason.unwrap_or("")
    )
}

#[derive(Debug, Clone)]
pub struct WindowPick {
    pub id: u64,
    pub title: String,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

pub fn applescript_string(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for ch in raw.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' | '\r' | '\t' => out.push(' '),
            other => out.push(other),
        }
    }
    out.replace("__", "_ ")
}

pub fn ambiguous_walk(windows: &[WindowPick]) -> SceneWalk {
    let elements = windows
        .iter()
        .enumerate()
        .map(|(idx, win)| AppElement {
            r#ref: format!("w{}", idx + 1),
            role: "AXWindow".into(),
            name: win.title.clone(),
            value: Some(win.id.to_string()),
            frame: Some([win.x as f64, win.y as f64, win.width as f64, win.height as f64]),
            parent_ref: None,
            actions: Vec::new(),
            editable: Some(false),
            index_path: None,
            ax_identifier: None,
            bound_ref: None,
        })
        .collect();
    SceneWalk {
        window_id: None,
        window_frame: None,
        page_title: None,
        elements,
        truncated: true,
        truncation_reason: Some("ambiguous_window".into()),
    }
}

pub fn ax_scene_script(
    process: &str,
    pick: &WindowPick,
    expand: &[u32],
    budgets: &SceneBudgets,
) -> String {
    let process = applescript_string(process);
    let title = applescript_string(&pick.title);
    let window_id = pick.id.to_string();
    let x = pick.x;
    let y = pick.y;
    let width = pick.width;
    let height = pick.height;
    let path = if expand.is_empty() {
        "{}".to_string()
    } else {
        format!(
            "{{{}}}",
            expand
                .iter()
                .map(|n| n.to_string())
                .collect::<Vec<_>>()
                .join(", ")
        )
    };
    format!(
        r#"use framework "Foundation"
property vcuLastRole : ""
on vcuClean(t)
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
on vcuOver(vcuStarted, vcuBudgetMs)
  try
    set vcuElapsed to (-(vcuStarted's timeIntervalSinceNow())) * 1000
    if vcuElapsed >= vcuBudgetMs then return true
  end try
  return false
end vcuOver
on vcuLeaf(r)
  try
    set r to r as text
  on error
    return false
  end try
  if r contains "Button" then return true
  if r contains "StaticText" then return true
  if r contains "static text" then return true
  if r contains "CheckBox" then return true
  if r contains "ComboBox" then return true
  if r contains "TextArea" then return true
  if r contains "TextField" then return true
  if r contains "SecureText" then return true
  if r contains "Ruler" then return true
  if r contains "ScrollBar" then return true
  if r contains "Slider" then return true
  if r contains "Image" then return true
  if r contains "MenuItem" then return true
  if r contains "InsertionPoint" then return true
  return false
end vcuLeaf
on vcuHidesChildren(r)
  try
    set r to r as text
  on error
    return false
  end try
  if r contains "TextArea" then return true
  if r contains "TextField" then return true
  if r contains "SecureText" then return true
  if r contains "Ruler" then return true
  return false
end vcuHidesChildren
set vcuStarted to current application's NSDate's alloc()'s init()
tell application "System Events"
  tell process "{process}"
    set vcuKnownId to "{window_id}"
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
    set vcuFrame to (vcuX as text) & "," & (vcuY as text) & "," & (vcuW as text) & "," & (vcuH as text)
    set vcuTitle to vcuTitleWant
    try
      set vcuTitle to my vcuClean(name of vcuWin)
    end try
    set header to "SCENE|" & vcuKnownId & "|" & vcuFrame & "|" & vcuTitle
    if my vcuOver(vcuStarted, {budget_ms}) then return header & linefeed & "TRUNC|time_budget"
    if {max_nodes} <= 0 then return header & linefeed & "TRUNC|node_budget"
    set vcuPath to {path}
    set vcuRoot to vcuWin
    set vcuParent to ""
    set vcuPathText to ""
    set n to 0
    set vcuAcc to ""
    set vcuReason to ""
    set vcuCollapsed to false
    set vcuUnvisited to false
    set vcuDepth to 0
    set my vcuLastRole to ""
    if (count of vcuPath) > 0 then
      repeat with vcuStep in vcuPath
        if vcuReason is not "" then exit repeat
        if my vcuOver(vcuStarted, {budget_ms}) then
          set vcuReason to "time_budget"
          exit repeat
        end if
        set vcuDepth to vcuDepth + 1
        if vcuDepth > {max_depth} then
          set vcuReason to "depth_budget"
          exit repeat
        end if
        try
          set vcuKids to UI elements of vcuRoot
        on error
          return header & linefeed & vcuAcc & "PATHMISSING"
        end try
        set vcuI to vcuStep as integer
        if ((vcuI < 0) or (vcuI >= (count of vcuKids))) then return header & linefeed & vcuAcc & "PATHMISSING"
        try
          set el to item (vcuI + 1) of vcuKids
        on error
          return header & linefeed & vcuAcc & "PATHMISSING"
        end try
        set n to n + 1
        if n > {max_nodes} then
          set vcuReason to "node_budget"
          exit repeat
        end if
        if vcuPathText is "" then
          set vcuPathText to (vcuI as text)
        else
          set vcuPathText to vcuPathText & "/" & (vcuI as text)
        end if
        set built to my vcuNodeLine(el, "n" & n, vcuParent, vcuPathText)
        if (length of vcuAcc) + (length of built) > {max_output} then
          set vcuReason to "output_budget"
          exit repeat
        end if
        set vcuAcc to vcuAcc & built & linefeed
        set vcuParent to "n" & n
        set vcuRoot to el
      end repeat
    end if
    if vcuReason is not "" then return header & linefeed & vcuAcc & "TRUNC|" & vcuReason
    set vcuFront to {{vcuRoot}}
    set vcuParents to {{vcuParent}}
    set vcuFrontPaths to {{vcuPathText}}
    set vcuLevel to vcuDepth
    set vcuEmit to true
    if (count of vcuPath) > 0 then set vcuEmit to false
    if (count of vcuPath) is 0 then set vcuLevel to 0
    repeat while ((count of vcuFront) > 0) and (vcuReason is "")
      set vcuNext to {{}}
      set vcuNextParents to {{}}
      set vcuNextPaths to {{}}
      set vcuSkipped to false
      repeat with vcuIdx from 1 to (count of vcuFront)
        if vcuReason is not "" then exit repeat
        set el to item vcuIdx of vcuFront
        set parentRef to item vcuIdx of vcuParents
        set pathText to item vcuIdx of vcuFrontPaths
        if vcuEmit then
          set n to n + 1
          if n > {max_nodes} then
            set vcuReason to "node_budget"
            exit repeat
          end if
          set built to my vcuNodeLine(el, "n" & n, parentRef, pathText)
          if (length of vcuAcc) + (length of built) > {max_output} then
            set vcuReason to "output_budget"
            exit repeat
          end if
          set vcuAcc to vcuAcc & built & linefeed
          set parentRef to "n" & n
        end if
        if my vcuOver(vcuStarted, {budget_ms}) then
          set vcuReason to "time_budget"
          exit repeat
        end if
        set vcuRole to my vcuLastRole
        if my vcuLeaf(vcuRole) then
          if my vcuHidesChildren(vcuRole) then set vcuCollapsed to true
        else if vcuLevel >= {max_depth} then
          try
            if (count of UI elements of el) > 0 then set vcuSkipped to true
          end try
        else
          try
            set kids to UI elements of el
            set kCount to count of kids
            set kMax to kCount
            if kMax > {max_nodes} then set kMax to {max_nodes}
            if kCount > kMax then set vcuUnvisited to true
            repeat with kidIdx from 1 to kMax
              if my vcuOver(vcuStarted, {budget_ms}) then
                set vcuReason to "time_budget"
                exit repeat
              end if
              try
                set end of vcuNext to item kidIdx of kids
                set end of vcuNextParents to parentRef
                set kidPath to ((kidIdx - 1) as text)
                if pathText is not "" then set kidPath to pathText & "/" & kidPath
                set end of vcuNextPaths to kidPath
              end try
            end repeat
          end try
        end if
      end repeat
      set vcuEmit to true
      if (vcuSkipped and (vcuReason is "")) then set vcuReason to "depth_budget"
      set vcuFront to vcuNext
      set vcuParents to vcuNextParents
      set vcuFrontPaths to vcuNextPaths
      set vcuLevel to vcuLevel + 1
    end repeat
    if ((vcuReason is "") and ((count of vcuFront) > 0)) then set vcuReason to "node_budget"
    if ((vcuReason is "") and (vcuUnvisited is true)) then set vcuReason to "node_budget"
    if ((vcuReason is "") and (vcuCollapsed is true)) then set vcuReason to "content_not_expanded"
    if ((n is 0) and (vcuReason is "")) then return header & linefeed & "EXPOSED|0"
    if vcuReason is not "" then return header & linefeed & vcuAcc & "TRUNC|" & vcuReason
    return header & linefeed & vcuAcc
  end tell
end tell
on vcuNodeLine(el, refText, parentRef, pathText)
  tell application "System Events"
    set r to ""
    set nm to ""
    set fr to "0,0,0,0"
    set editable to "0"
    set acts to ""
    set val to "-"
    set vcuSecure to false
    try
      set r to my vcuClean(role of el)
    end try
    try
      set nm to my vcuClean(name of el)
    end try
    if nm is "" then
      try
        set nm to my vcuClean(description of el)
      end try
    end if
    if r contains "Secure" then set vcuSecure to true
    if r contains "Password" then set vcuSecure to true
    if nm contains "password" then set vcuSecure to true
    if nm contains "Password" then set vcuSecure to true
    if nm contains "密码" then set vcuSecure to true
    try
      set p to position of el
      set sz to size of el
      set fr to (item 1 of p as text) & "," & (item 2 of p as text) & "," & (item 1 of sz as text) & "," & (item 2 of sz as text)
    end try
    try
      set vcuAttr to attribute "AXValue" of el
      if settable of vcuAttr then set editable to "1"
    end try
    if vcuSecure then set editable to "1"
    if vcuSecure is false then
      try
        if r contains "Text" then
          set vcuTmp to value of el as text
          if vcuTmp is not "missing value" then
            if vcuTmp is not "" then set val to my vcuClean(vcuTmp)
          end if
        end if
        if r contains "text" then
          set vcuTmp to value of el as text
          if vcuTmp is not "missing value" then
            if vcuTmp is not "" then set val to my vcuClean(vcuTmp)
          end if
        end if
      end try
    end if
    try
      set vcuShown to 0
      repeat with act in (actions of el)
        if vcuShown >= 8 then exit repeat
        try
          set actName to my vcuClean(name of act)
          if actName is not "" then
            if acts is "" then
              set acts to actName
            else
              set acts to acts & "," & actName
            end if
            set vcuShown to vcuShown + 1
          end if
        end try
      end repeat
    end try
    set my vcuLastRole to r
    set ident to ""
    try
      set ident to my vcuClean(value of attribute "AXIdentifier" of el)
    end try
    if ident is "" then
      try
        set ident to my vcuClean(value of attribute "AXDescription" of el)
      end try
    end if
    if ident is "" then
      if r contains "Button" or r contains "button" then
        try
          set ident to my vcuClean(value of el as text)
        end try
      end if
    end if
    return "NODE|" & refText & "|" & parentRef & "|" & r & "|" & nm & "|" & fr & "|" & editable & "|" & acts & "|" & val & "|" & pathText & "|" & ident
  end tell
end vcuNodeLine
"#,
        process = process,
        title = title,
        window_id = window_id,
        x = x,
        y = y,
        width = width,
        height = height,
        path = path,
        max_nodes = budgets.max_nodes,
        max_depth = budgets.max_depth,
        max_output = budgets.max_output_bytes,
        budget_ms = budgets.timeout_ms,
    )
}

pub fn interpret_walk(raw: VcuResult<String>, budgets: &SceneBudgets) -> VcuResult<SceneWalk> {
    match raw {
        Err(err) if super::macos::permission_error_is_terminal(err.code()) => Err(err),
        Err(err) if is_timeout(&err) => Ok(limited_walk("time_budget")),
        Err(err) => Err(err),
        Ok(text) => parse_scene_text(&text, budgets),
    }
}

fn is_timeout(err: &VcuError) -> bool {
    let blob = format!("{} {}", err.message(), err.detail().unwrap_or_default());
    let lower = blob.to_ascii_lowercase();
    lower.contains("timed out") || lower.contains("timeout")
}

pub fn limited_walk(reason: &str) -> SceneWalk {
    SceneWalk {
        window_id: None,
        window_frame: None,
        page_title: None,
        elements: Vec::new(),
        truncated: true,
        truncation_reason: Some(reason.to_string()),
    }
}

pub fn parse_scene_text(raw: &str, budgets: &SceneBudgets) -> VcuResult<SceneWalk> {
    let text = raw.trim();
    if text.is_empty() {
        return Ok(limited_walk("content_not_exposed"));
    }
    if text == "NOWINDOW" {
        return Ok(limited_walk("no_window"));
    }
    if text == "WINAMBIG" || text.starts_with("WINAMBIG") {
        return Err(VcuError::coded(
            ErrorCode::InvalidInput,
            "window identity matched more than one accessibility window; refusing to guess",
        ));
    }
    if text == "WINMISSING" || text.starts_with("WINMISSING") {
        return Err(VcuError::coded(
            ErrorCode::InvalidInput,
            "window_id was not found; refusing to fall back to window order",
        ));
    }
    let mut window_id = None;
    let mut window_frame = None;
    let mut page_title = None;
    let mut elements = Vec::new();
    let mut truncated = false;
    let mut reason = None;
    let mut ambiguous = false;
    let mut win_idx = 0usize;
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if line == "AMBIGUOUS" {
            ambiguous = true;
            truncated = true;
            reason = Some("ambiguous_window".into());
            continue;
        }
        if line == "EXPOSED|0" {
            truncated = true;
            reason.get_or_insert_with(|| "content_not_exposed".into());
            continue;
        }
        if line == "PATHMISSING" {
            return Err(VcuError::coded(
                ErrorCode::InvalidInput,
                "expand path does not exist in the selected window",
            ));
        }
        if let Some(rest) = line.strip_prefix("TRUNC|") {
            truncated = true;
            reason = Some(rest.trim().to_string());
            continue;
        }
        if let Some(rest) = line.strip_prefix("SCENE|") {
            let mut parts = rest.splitn(3, '|');
            window_id = nonempty(parts.next().unwrap_or(""));
            window_frame = parse_frame_text(parts.next().unwrap_or(""));
            page_title = nonempty(parts.next().unwrap_or(""));
            continue;
        }
        if let Some(rest) = line.strip_prefix("WIN|") {
            win_idx += 1;
            let mut parts = rest.splitn(3, '|');
            let id = parts.next().unwrap_or("").trim();
            let name = parts.next().unwrap_or("").trim();
            let frame = parse_frame_text(parts.next().unwrap_or(""));
            elements.push(AppElement {
                r#ref: format!("w{win_idx}"),
                role: "AXWindow".into(),
                name: name.to_string(),
                value: nonempty(id),
                frame,
                parent_ref: None,
                actions: Vec::new(),
                editable: Some(false),
                index_path: None,
                ax_identifier: None,
                bound_ref: None,
            });
            continue;
        }
        if let Some(rest) = line.strip_prefix("NODE|") {
            if let Some(el) = parse_node(rest) {
                elements.push(el);
            }
        }
    }
    if ambiguous && window_id.is_none() {
        truncated = true;
        reason = Some("ambiguous_window".into());
    }
    apply_output_budget(
        &mut elements,
        budgets.max_output_bytes,
        &mut truncated,
        &mut reason,
    );
    if elements.is_empty() && reason.is_none() {
        truncated = true;
        reason = Some("content_not_exposed".into());
    }
    if truncated && reason.is_none() {
        reason = Some("unspecified".into());
    }
    Ok(SceneWalk {
        window_id,
        window_frame,
        page_title,
        elements,
        truncated,
        truncation_reason: reason,
    })
}

fn parse_node(rest: &str) -> Option<AppElement> {
    let mut parts = rest.splitn(10, '|');
    let r#ref = parts.next().unwrap_or("").trim();
    let parent = parts.next().unwrap_or("").trim();
    let role = parts.next().unwrap_or("").trim();
    let name = parts.next().unwrap_or("").trim();
    let frame = parts.next().unwrap_or("").trim();
    let editable = parts.next().unwrap_or("").trim();
    let actions = parts.next().unwrap_or("").trim();
    let value = parts.next().unwrap_or("").trim();
    let index_path = parts.next().unwrap_or("").trim();
    let identifier = parts.next().unwrap_or("").trim();
    if r#ref.is_empty() {
        return None;
    }
    let secret = is_secret_control(role, name);
    let value = if secret {
        None
    } else {
        nonempty(value).filter(|v| v != "-")
    };
    let actions = actions
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();
    Some(AppElement {
        r#ref: r#ref.to_string(),
        role: role.to_string(),
        name: name.to_string(),
        value,
        frame: parse_frame_text(frame),
        parent_ref: nonempty(parent),
        actions,
        editable: match editable {
            "1" | "true" => Some(true),
            "0" | "false" => Some(false),
            _ => None,
        },
        index_path: nonempty(index_path),
        ax_identifier: nonempty(identifier),
        bound_ref: None,
    })
}

fn parse_frame_text(s: &str) -> Option<[f64; 4]> {
    let parts: Vec<&str> = s.split(',').map(|x| x.trim()).collect();
    if parts.len() != 4 {
        return None;
    }
    let nums: Vec<f64> = parts.iter().map(|p| p.parse().ok()).collect::<Option<Vec<_>>>()?;
    if nums.iter().all(|n| *n == 0.0) {
        return None;
    }
    Some([nums[0], nums[1], nums[2], nums[3]])
}

fn nonempty(s: &str) -> Option<String> {
    let t = s.trim();
    if t.is_empty() || t == "missing value" || t == "-" {
        None
    } else {
        Some(t.to_string())
    }
}

fn apply_output_budget(
    elements: &mut Vec<AppElement>,
    max_bytes: usize,
    truncated: &mut bool,
    reason: &mut Option<String>,
) {
    let mut kept = elements.len();
    while kept > 0 {
        let bytes = serde_json::to_vec(&elements[..kept])
            .map(|v| v.len())
            .unwrap_or(usize::MAX);
        if bytes <= max_bytes {
            break;
        }
        kept -= 1;
    }
    if kept < elements.len() {
        elements.truncate(kept);
        *truncated = true;
        if reason.is_none() {
            *reason = Some("output_budget".into());
        }
    }
}

pub fn walk_contains_secret(walk: &SceneWalk, secret: &str) -> bool {
    if walk.page_title.as_deref().unwrap_or("").contains(secret) {
        return true;
    }
    walk.elements.iter().any(|el| {
        el.name.contains(secret)
            || el.role.contains(secret)
            || el.value.as_deref().unwrap_or("").contains(secret)
            || el.r#ref.contains(secret)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn budgets() -> SceneBudgets {
        SceneBudgets {
            max_nodes: 80,
            max_depth: 24,
            timeout_ms: 4500,
            max_output_bytes: 24_000,
        }
    }

    fn sample_pick() -> WindowPick {
        WindowPick {
            id: 42,
            title: "Say \"hi\"".into(),
            x: 10,
            y: 20,
            width: 640,
            height: 420,
        }
    }

    #[test]
    fn scene_script_selects_by_id_and_does_not_mutate() {
        let script = ax_scene_script("TextEdit", &sample_pick(), &[0, 1], &budgets());
        assert!(!script.contains("window 1"));
        assert!(script.contains("dx <= 12"));
        assert!(!script.contains("dx <= 3"));
        assert!(!script.contains("id of w"));
        assert!(script.contains("vcuKnownId"));
        assert!(script.contains("42"));
        assert!(script.contains("Say \\\"hi\\\""));
        assert!(script.contains("{0, 1}"));
        assert!(!script.contains("perform action"));
        assert!(!script.contains("set value"));
        assert!(!script.contains("set frontmost"));
        assert!(!script.contains("AXEnhancedUserInterface"));
        let secure = script.find("set vcuSecure to true").unwrap();
        let read_value = script.find("value of el as text").unwrap();
        assert!(secure < read_value);
        assert!(script.contains("if vcuSecure is false"));
        assert!(script.contains("tell application \"System Events\""));
        assert!(script.contains("use framework \"Foundation\""));
        assert!(script.contains("vcuOver"));
        assert!(script.contains("TRUNC|time_budget"));
        assert!(script.contains("content_not_expanded"));
        assert!(script.contains("vcuLeaf"));
        assert!(!script.contains("entire contents"));
    }

    #[test]
    fn kill_grace_lets_script_return_before_the_fallback() {
        assert_eq!(scene_kill_after_ms(1), 901);
        assert!(scene_kill_after_ms(1) < 3_000);
        assert_eq!(scene_kill_after_ms(4500), 5400);
        assert_eq!(scene_kill_after_ms(8000), 8900);
        let defaults = budgets_for(&SceneQuery::default(), 0, 4000);
        assert_eq!(defaults.max_nodes, DEFAULT_SCENE_NODES as i32);
        assert_eq!(defaults.max_depth, DEFAULT_SCENE_DEPTH as i32);
        assert_eq!(defaults.timeout_ms, DEFAULT_SCENE_TIMEOUT_MS);
        assert_eq!(defaults.max_output_bytes, DEFAULT_SCENE_OUTPUT_BYTES as usize);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn generated_scene_script_compiles() {
        let script = ax_scene_script("TextEdit", &sample_pick(), &[0, 1], &budgets());
        let dir = std::env::temp_dir();
        let src = dir.join(format!("vcu-scene-{}.applescript", std::process::id()));
        let dst = dir.join(format!("vcu-scene-{}.scpt", std::process::id()));
        std::fs::write(&src, &script).unwrap();
        let compiled = std::process::Command::new("osacompile")
            .arg("-o")
            .arg(&dst)
            .arg(&src)
            .output()
            .expect("osacompile");
        let _ = std::fs::remove_file(&src);
        let _ = std::fs::remove_file(&dst);
        assert!(
            compiled.status.success(),
            "{}",
            String::from_utf8_lossy(&compiled.stderr)
        );
    }

    #[test]
    fn expand_path_rejects_injection() {
        assert!(validate_expand(Some("0/1/2")).is_ok());
        assert!(validate_expand(Some("0; do shell script \"id\"")).is_err());
        assert!(validate_expand(Some("../1")).is_err());
        assert!(validate_expand(None).unwrap().is_empty());
    }

    #[test]
    fn parse_records_parent_actions_and_redacts_password() {
        let raw = "\
SCENE|99|10,20,800,600|Fixture
NODE|n1||AXWindow|Fixture|10,20,800,600|0|AXRaise|
NODE|n2|n1|AXGroup|depth-target|1,2,3,4|0|AXPress|
NODE|n3|n1|AXSecureTextField|Password|5,6,7,8|1||vcu-secret-should-not-leak
NODE|n4|n2|AXButton|sib-39|9,9,9,9|0|AXPress,AXShowMenu|
";
        let walk = parse_scene_text(raw, &budgets()).unwrap();
        assert_eq!(walk.window_id.as_deref(), Some("99"));
        assert_eq!(walk.elements.len(), 4);
        assert_eq!(walk.elements[1].parent_ref.as_deref(), Some("n1"));
        assert_eq!(walk.elements[1].name, "depth-target");
        assert!(walk.elements[3].actions.iter().any(|a| a == "AXPress"));
        assert_eq!(walk.elements[2].editable, Some(true));
        assert!(walk.elements[2].value.is_none());
        assert!(!walk_contains_secret(&walk, "vcu-secret-should-not-leak"));
        let summary = scene_summary("Fixture", walk.elements.len(), false, None, Some("99"));
        assert!(!summary.contains("vcu-secret-should-not-leak"));
    }

    #[test]
    fn truncation_reasons_are_distinct_and_empty_is_not_success() {
        let node = parse_scene_text("SCENE|1|0,0,1,1|T\nTRUNC|node_budget\n", &budgets()).unwrap();
        assert_eq!(node.truncation_reason.as_deref(), Some("node_budget"));
        assert!(node.truncated);
        assert!(node.elements.is_empty());
        let depth = parse_scene_text("SCENE|1|0,0,1,1|T\nTRUNC|depth_budget\n", &budgets()).unwrap();
        assert_eq!(depth.truncation_reason.as_deref(), Some("depth_budget"));
        let exposed = parse_scene_text("SCENE|1|0,0,1,1|T\nEXPOSED|0\n", &budgets()).unwrap();
        assert_eq!(
            exposed.truncation_reason.as_deref(),
            Some("content_not_exposed")
        );
        let collapsed = parse_scene_text(
            "SCENE|1|0,0,1,1|T\nNODE|n1||AXTextArea|body|1,2,3,4|1|AXSetValue|hello\nTRUNC|content_not_expanded\n",
            &budgets(),
        )
        .unwrap();
        assert_eq!(
            collapsed.truncation_reason.as_deref(),
            Some("content_not_expanded")
        );
        assert_eq!(collapsed.elements.len(), 1);
        assert!(collapsed.window_id.is_some());
        assert!(exposed.truncated);
        let missing = parse_scene_text("WINMISSING", &budgets());
        assert!(missing.is_err());
    }

    #[test]
    fn ambiguous_windows_are_selectable_without_a_fake_tree() {
        let raw = "\
AMBIGUOUS
WIN|11|Left|0,0,100,100
WIN|22|Right|200,0,100,100
";
        let walk = parse_scene_text(raw, &budgets()).unwrap();
        assert_eq!(walk.truncation_reason.as_deref(), Some("ambiguous_window"));
        assert!(walk.window_id.is_none());
        assert_eq!(walk.elements.len(), 2);
        assert_eq!(walk.elements[0].value.as_deref(), Some("11"));
        assert_eq!(walk.elements[1].name, "Right");
        assert!(!observation_only_scene_ref("w1"));
        assert!(observation_only_scene_ref("n16"));
        assert!(refuse_live_mutation("n16").is_err());
        assert!(refuse_live_mutation("e1").is_ok());
    }

    #[test]
    fn sibling_overflow_and_output_budget() {
        let mut lines = vec!["SCENE|7|0,0,10,10|Wide".to_string()];
        for i in 1..=33 {
            lines.push(format!(
                "NODE|n{i}|n0|AXButton|sib-{i}|1,2,3,4|0|AXPress|"
            ));
        }
        let walk = parse_scene_text(&lines.join("\n"), &budgets()).unwrap();
        assert_eq!(walk.elements.len(), 33);
        assert_eq!(walk.elements[32].name, "sib-33");
        let tiny = SceneBudgets {
            max_output_bytes: 180,
            ..budgets()
        };
        let capped = parse_scene_text(&lines.join("\n"), &tiny).unwrap();
        assert!(capped.truncated);
        assert_eq!(capped.truncation_reason.as_deref(), Some("output_budget"));
        assert!(capped.elements.len() < 33);
    }

    #[test]
    fn timeout_does_not_become_a_complete_scene() {
        let err = VcuError::coded(ErrorCode::ActionFailed, "ax command timed out");
        let walk = interpret_walk(Err(err), &budgets()).unwrap();
        assert!(walk.truncated);
        assert_eq!(walk.truncation_reason.as_deref(), Some("time_budget"));
        assert!(walk.elements.is_empty());
    }
}
