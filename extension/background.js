// VCU extension service worker — Codex-like: auto-pair with local daemon, no CDP Allow dialogs.
const DEFAULT_ENDPOINT = "http://127.0.0.1:17890";
const DEFAULT_GROUP_COLOR = "purple";
// Codex keeps agent pages in one native tab group instead of replacing the
// user's current tab. This title is ours; do not attach to an existing user group.
const AGENT_GROUP_TITLE = "VCU";
const AGENT_WORK_URL = "https://example.com/";
const TAB_GROUP_COLORS = new Set([
  "grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange",
]);

function currentBrowser() {
  try {
    const ua = (globalThis.navigator && globalThis.navigator.userAgent) || "";
    return /Edg\//.test(ua) ? "edge" : "chrome";
  } catch (_) {
    return "chrome";
  }
}
let agentWindowId = null;
let agentExpandAllowed = 0;
let pairingToken = null;
let endpoint = DEFAULT_ENDPOINT;
let polling = false;
let lastError = null;

chrome.runtime.onInstalled.addListener(() => { void bootstrapAndStart();
void ensureOffscreen(); });
chrome.runtime.onStartup.addListener(() => { void bootstrapAndStart(); });
chrome.alarms.create("vcu-keepalive", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "vcu-keepalive" || a.name === "vcu-quick") void bootstrapAndStart();
});
void bootstrapAndStart();

chrome.runtime.onConnect.addListener((port) => {
  if (!port || port.name !== "vcu-keepalive") return;
  void bootstrapAndStart();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg.type === "browser_command") {
      const popupUrl = chrome.runtime.getURL("popup.html");
      const allowed = new Set(["list_tabs", "select_tab", "group_tabs", "update_group", "ungroup_tabs"]);
      const command = msg.command || {};
      if (!sender || sender.id !== chrome.runtime.id || sender.url !== popupUrl) {
        sendResponse({ ok: false, error: "browser_command requires the VCU popup sender" });
        return;
      }
      if (!allowed.has(command.method)) {
        sendResponse({ ok: false, error: "browser_command method not allowed" });
        return;
      }
      sendResponse(await handleCommand({ method: command.method, params: command.params || {} }));
      return;
    }
    if (msg.type === "vcu_wake") {
      void bootstrapAndStart();
      sendResponse({ ok: true, woke: true });
      return;
    }
    if (msg.type === "set_config") {
      endpoint = msg.endpoint || endpoint;
      pairingToken = msg.token || pairingToken;
      await chrome.storage.local.set({ endpoint, token: pairingToken });
      await hello();
      await ensureOffscreen();
      startPollLoop();
      const id = await ensureAgentWindow();
      sendResponse({ ok: true, endpoint, hasToken: !!pairingToken, windowId: id });
      return;
    }
    if (msg.type === "status") {
      sendResponse({
        ok: true, endpoint, hasToken: !!pairingToken, agentWindowId, polling, lastError,
        connected: !!pairingToken && polling,
      });
      return;
    }
    if (msg.type === "ensure_agent_window") {
      const windowId = await ensureAgentWindow();
      sendResponse(windowId == null
        ? { ok: false, error: "agent window refused without covering the page being read", windowId: null }
        : { ok: true, windowId });
      return;
    }
    if (msg.type === "keepalive") {
      await hello();
      if (!polling) startPollLoop();
      sendResponse({ ok: true });
      return;
    }
    if (msg.type === "rebootstrap") {
      await bootstrapAndStart(true);
      sendResponse({ ok: true, hasToken: !!pairingToken, endpoint, lastError });
      return;
    }
    sendResponse({ ok: false, error: "unknown" });
  })();
  return true;
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let captureQueue = Promise.resolve();
let lastCaptureAt = 0;
function enqueueCapture(run) {
  const job = captureQueue.then(async () => {
    const perSecond = Number(chrome.tabs.MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND) || 2;
    const interval = Math.ceil(1000 / perSecond) + 25;
    const wait = Math.max(0, lastCaptureAt + interval - Date.now());
    if (wait) await sleep(wait);
    lastCaptureAt = Date.now();
    try {
      return await run();
    } catch (error) {
      // A worker restart may inherit the browser's quota while losing the
      // in-memory clock. Screenshots are read-only, so one bounded retry is safe.
      if (!String(error).includes("MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND")) throw error;
      await sleep(1000);
      lastCaptureAt = Date.now();
      return run();
    }
  });
  captureQueue = job.catch(() => {});
  return job;
}

function captureVisiblePng(windowId) {
  return enqueueCapture(() => chrome.tabs.captureVisibleTab(windowId, { format: "png" }));
}

function commandTimeoutMs(method) {
  // Quiet-window capture can exceed the normal action budget on a cold Edge window.
  return method === "capture_tab" ? 12000 : 6000;
}

function withTimeout(promise, ms, timeoutValue) {
  let t;
  const timeout = new Promise((resolve) => {
    t = setTimeout(() => resolve(timeoutValue), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

function isRestrictedUrl(url) {
  if (!url) return true;
  return /^(chrome|edge|devtools|chrome-extension|edge-extension|about|data|blob|file):/i.test(url)
    || url.startsWith("https://chrome.google.com/webstore")
    || url.startsWith("https://chromewebstore.google.com")
    || url.startsWith("https://microsoftedge.microsoft.com/addons");
}

async function ensureOffscreen() {
  try {
    if (!chrome.offscreen || !chrome.offscreen.createDocument) return;
    let exists = false;
    try {
      if (chrome.runtime.getContexts) {
        const ctxs = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
        exists = !!(ctxs && ctxs.length);
      }
    } catch (_) {}
    if (exists) return;
    const tries = [["BLOBS"], ["DOM_PARSER"]];
    let last = null;
    for (const reasons of tries) {
      try {
        await chrome.offscreen.createDocument({
          url: "offscreen.html",
          reasons,
          justification: "Keep VCU extension poll loop alive without UI clicks",
        });
        lastError = lastError && String(lastError).startsWith("offscreen:") ? null : lastError;
        return;
      } catch (e) {
        last = e;
        if (/already exists|duplicate|single offscreen/i.test(String(e))) return;
      }
    }
    lastError = "offscreen:" + String(last || "createDocument failed");
  } catch (e) {
    lastError = "offscreen:" + String(e);
  }
}

async function bootstrapAndStart(force = false) {
  try {
    const stored = await chrome.storage.local.get(["endpoint", "token"]);
    endpoint = stored.endpoint || DEFAULT_ENDPOINT;
    pairingToken = stored.token || null;
    if (!pairingToken || force) {
      const boot = await tryBootstrap();
      if (boot && boot.token) {
        pairingToken = boot.token;
        if (boot.endpoint) endpoint = boot.endpoint;
        await chrome.storage.local.set({ endpoint, token: pairingToken });
      }
    }
    if (!quietParkedOnBoot) {
      quietParkedOnBoot = true;
      try { await parkRememberedQuietWindow(); } catch (_) {}
      setTimeout(() => { void parkRememberedQuietWindow(); }, 1200);
    }
    if (pairingToken) {
      await hello();
      await ensureOffscreen();
      startPollLoop();
      lastError = null;
      try { chrome.alarms.create("vcu-quick", { delayInMinutes: 0.5 }); } catch (_) {}
    } else {
      lastError = "no_token_bootstrap_failed";
      setTimeout(() => void bootstrapAndStart(true), 5000);
    }
  } catch (e) {
    lastError = String(e);
    setTimeout(() => void bootstrapAndStart(true), 8000);
  }
}

async function tryBootstrap() {
  try {
    const resp = await fetch(endpoint + "/v1/extension/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client: "vcu-extension", version: chrome.runtime.getManifest().version }),
    });
    if (!resp.ok) return null;
    const body = await resp.json();
    const data = body && body.data ? body.data : body;
    if (data && data.token) return data;
  } catch (_) {}
  return null;
}

async function hello() {
  if (!pairingToken) return;
  try {
    let hosts = [];
    try {
      const tabs = await chrome.tabs.query({});
      for (const t of tabs) {
        try {
          const h = new URL(t.url || "about:blank").hostname;
          if (h && !hosts.includes(h)) hosts.push(h);
        } catch (_) {}
        if (hosts.length >= 12) break;
      }
    } catch (_) {}
    const likely_user_profile = hosts.some((h) => h && !h.endsWith("msn.com"));
    const browser = currentBrowser();
    const body = await fetchJson(endpoint + "/v1/extension/hello", {
      method: "POST",
      headers: { "X-Vcu-Token": pairingToken, "Content-Type": "application/json" },
      body: JSON.stringify({
        likely_user_profile,
        hosts,
        client_id: chrome.runtime.id,
        browser,
        command_pull: true,
      }),
    }, 5000);
    const cmd = body && body.data && body.data.command;
    if (cmd && cmd.id && cmd.method) {
      const result = await withTimeout(
        handleCommand(cmd),
        6000,
        { ok: false, error: "command timeout " + cmd.method, stage: captureStage }
      );
      await fetchJson(endpoint + "/v1/extension/result", {
        method: "POST",
        headers: { "X-Vcu-Token": pairingToken, "Content-Type": "application/json" },
        body: JSON.stringify({ id: cmd.id, result: result || { ok: false, error: "empty result" } }),
      }, 8000);
    }
  } catch (e) {
    lastError = "hello_failed:" + String(e);
  }
}

async function keepGroupCollapsed(groupId, shouldCollapse) {
  if (!shouldCollapse || groupId == null) return;
  for (let attempt = 0; attempt < 4; attempt++) {
    try { await chrome.tabGroups.update(groupId, { collapsed: true }); } catch (_) {}
    try {
      const group = await findGroup(groupId);
      if (group && group.collapsed === true) return;
    } catch (_) {}
    if (attempt < 3) await sleep(40);
  }
}

async function ensureAgentWindow() {
  // Codex works in its own tab group. Creating or restacking a window covers
  // the page being read, and the restack helper activates Edge. Reuse a parked
  // window id only; never create or reorder one from here.
  if (agentWindowId === null) {
    const stored = await chrome.storage.local.get(["agentWindowId", "quietCaptureWindowId"]);
    if (stored.agentWindowId != null) agentWindowId = stored.agentWindowId;
    else if (stored.quietCaptureWindowId != null) agentWindowId = stored.quietCaptureWindowId;
  }
  if (agentWindowId !== null) {
    try {
      const existing = await chrome.windows.get(agentWindowId);
      if (existing && existing.type !== "devtools" && existing.type !== "popup") return agentWindowId;
    } catch (_) {}
  }
  agentWindowId = null;
  return null;
}

function groupInfo(group) {
  if (!group || group.id == null) return null;
  return {
    group_id: String(group.id),
    window_id: String(group.windowId),
    title: group.title || "",
    color: group.color || DEFAULT_GROUP_COLOR,
    collapsed: !!group.collapsed,
  };
}

async function queryTabGroups() {
  if (!chrome.tabGroups || typeof chrome.tabGroups.query !== "function") return [];
  const groups = await chrome.tabGroups.query({});
  return (groups || []).map(groupInfo).filter(Boolean);
}

async function listTabsState() {
  await loadQuietWindowId();
  await loadAgentWindowId();
  await loadSessionGroupIds();
  const rawTabs = await chrome.tabs.query({});
  let focusedId = null;
  let focusedWindow = null;
  try {
    const f = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (f && f[0]) {
      focusedId = String(f[0].id);
      if (f[0].windowId != null) focusedWindow = String(f[0].windowId);
    }
  } catch (_) {}
  const groups = await queryTabGroups();
  const groupById = new Map(groups.map((g) => [g.group_id, g]));
  const tabs = (rawTabs || []).map((t) => {
    const rawGroupId = t.groupId;
    const numericGroupId = Number(rawGroupId);
    const groupId = rawGroupId != null && Number.isFinite(numericGroupId) && numericGroupId >= 0
      ? String(numericGroupId)
      : null;
    const mapped = {
      tab_id: String(t.id),
      window_id: String(t.windowId),
      title: t.title || "",
      url: t.url || "",
      active: !!t.active,
      focused: String(t.id) === focusedId,
      pinned: !!t.pinned,
      controllable: /^https?:/i.test(t.url || "") && !isRestrictedUrl(t.url),
      group_id: groupId,
      group: groupId ? (groupById.get(groupId) || null) : null,
      browser: currentBrowser(),
    };
    const windowId = String(t.windowId);
    const quietOwned = quietCaptureWindowId != null && windowId === String(quietCaptureWindowId);
    // A stored agent window id must not mark the window the user is reading as
    // agent-owned. That would let clicks and grouping treat their page as work.
    const storedAgent = agentWindowId != null && windowId === String(agentWindowId) && windowId !== focusedWindow;
    mapped.agent_owned = quietOwned || storedAgent;
    mapped.agent_surface = mapped.agent_owned
      || !!(mapped.group && agentGroupTitle(mapped.group.title))
      || sessionGroupMatches(mapped.group);
    mapped.page_being_read = pageBeingRead(mapped);
    return mapped;
  });
  return { tabs, groups };
}

async function listTabs() {
  return (await listTabsState()).tabs;
}

function tabIdNumber(id) {
  if (id === undefined || id === null || id === "") return null;
  const n = Number(id);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function isInjectableHttpTab(tab) {
  return !!tab && /^https?:/i.test(tab.url || "") && !isRestrictedUrl(tab.url);
}

function tabActionState(tab) {
  return {
    tab_id: tab ? String(tab.tab_id) : null,
    page_url: tab ? (tab.url || "") : "",
    focused: !!(tab && tab.focused),
  };
}

function agentGroupTitle(title) {
  const name = String(title || "");
  return name === AGENT_GROUP_TITLE || name.startsWith("VCU-") || name.startsWith("VCU ");
}

function agentWorkTab(tabs) {
  const pool = (tabs || []).filter((tab) => {
    if (!isInjectableHttpTab(tab)) return false;
    if (tab.agent_surface || tab.agent_owned) return true;
    return !!(tab.group && agentGroupTitle(tab.group.title));
  });
  if (!pool.length) return null;
  // Codex works in its own group and does not take the window the user is
  // reading. Prefer an agent tab in another window, usually the parked quiet
  // window, over a VCU tab sitting beside the page being read.
  const reading = (tabs || []).find((tab) => tab && (tab.focused || tab.page_being_read));
  const readingWindow = reading && reading.window_id;
  const away = readingWindow ? pool.filter((tab) => tab.window_id !== readingWindow) : [];
  const chosen = (away.length ? away : pool).slice().sort((a, b) => Number(b.tab_id) - Number(a.tab_id));
  return chosen[0] || null;
}

function pageBeingRead(tab) {
  if (!tab || tab.agent_owned || tab.agent_surface) return false;
  if (!tab.active && !tab.focused) return false;
  if (tab.group && agentGroupTitle(tab.group.title)) return false;
  return true;
}

function refusePageBeingRead(tab, action, dryRun) {
  // A dry run does not click, type, scroll, or navigate. It may inspect the
  // page being read, but it must not become the implicit work target.
  if (dryRun) return null;
  if (!pageBeingRead(tab)) return null;
  return {
    ok: false,
    error: action + " refused without moving the page being read; work in the collapsed VCU group",
    repair: "omit tab_id and retry in the collapsed VCU group; do not select or activate this page",
    tab_id: tab.tab_id || null,
    os_cursor_used: false,
  };
}

async function openNavigationAwayFromReadingPage(url) {
  const target = String(url || "");
  if (!/^https?:/i.test(target)) {
    return { ok: false, error: "http(s) url required", os_cursor_used: false };
  }
  const beforeActive = await activeTabsByWindow();
  const beforeFocused = await focusedWindowId();
  const quietId = await agentWorkWindowId(beforeFocused, beforeActive);
  if (quietId && quietId.ok === false) return quietId;
  const windows = quietId == null ? [] : [Number(quietId)];
  let lastError = "no browser window accepted the agent tab";
  for (const windowId of windows) {
    let tab = null;
    try {
      tab = await chrome.tabs.create({ url: target, active: false, windowId });
      await attachDedicatedAgentGroup(tab);
      await restoreStolenActiveTabs(beforeActive);
      let current = tab;
      try { current = await chrome.tabs.get(tab.id); } catch (_) {}
      const homeId = beforeActive.get(String(current && current.windowId));
      if (current && current.active && homeId != null && homeId !== current.id && String(current.windowId) === String(beforeFocused)) {
        await restoreStolenActiveTabs(beforeActive);
        try { await chrome.tabs.remove(tab.id); } catch (_) {}
        await restoreStolenActiveTabs(beforeActive);
        lastError = "navigate refused because it replaced the page being read";
        continue;
      }
      // Do not activate the new tab. On Edge that focuses its window and
      // interrupts the page the user is reading. An inactive collapsed-group
      // tab is still injectable.
      await restoreUserFocus(beforeFocused, beforeActive);
      return { ok: true, tab: current, os_cursor_used: false, activated_user_page: false };
    } catch (e) {
      if (tab && tab.id != null) {
        try { await chrome.tabs.remove(tab.id); } catch (_) {}
      }
      await restoreStolenActiveTabs(beforeActive);
      lastError = String(e);
    }
  }
  await restoreUserFocus(beforeFocused, beforeActive);
  return {
    ok: false,
    error: "navigate refused without moving the page being read: " + lastError,
    os_cursor_used: false,
  };
}

async function prepareAgentWork(resolved, action, dryRun) {
  if (resolved && resolved.mismatch) return { resolved, error: wrongBrowserOrMissing(resolved) };
  if (!resolved) return { resolved, error: wrongBrowserOrMissing(resolved) };
  // A dry run may inspect the page being read. It must not open a work tab.
  if (dryRun || !(resolved.no_agent_tab || (resolved.tab && pageBeingRead(resolved.tab)))) {
    if (resolved.no_agent_tab || !resolved.tab) return { resolved, error: wrongBrowserOrMissing(resolved) };
    return releaseReadingPageWork(resolved, action, dryRun);
  }
  if (resolved.tab && pageBeingRead(resolved.tab)) return releaseReadingPageWork(resolved, action, false);
  const opened = await openNavigationAwayFromReadingPage(AGENT_WORK_URL);
  if (!opened.ok) {
    const refused = wrongBrowserOrMissing(resolved);
    refused.detail = opened.error;
    return { resolved, error: refused };
  }
  const agent = await resolveHttpTabState();
  if (agent && agent.tab && !agent.no_agent_tab && !agent.mismatch && !pageBeingRead(agent.tab)) {
    return {
      resolved: agent,
      error: null,
      ensured_agent_tab: agent.tab.tab_id,
      tab_id_source: "agent_group",
    };
  }
  return { resolved, error: wrongBrowserOrMissing(resolved) };
}

async function releaseReadingPageWork(resolved, action, dryRun) {
  if (!resolved || !resolved.tab || dryRun || !pageBeingRead(resolved.tab)) {
    return { resolved, error: null };
  }
  // The running daemon can still send the page being read as tab_id. Do the
  // work in the collapsed VCU group instead of refusing and stopping there.
  // If that group has no http page yet, open one in the parked quiet window.
  let agent = await resolveHttpTabState();
  if (!(agent && agent.tab && !agent.no_agent_tab && !agent.mismatch && !pageBeingRead(agent.tab))) {
    const opened = await openNavigationAwayFromReadingPage(AGENT_WORK_URL);
    if (!opened.ok) return { resolved, error: refusePageBeingRead(resolved.tab, action, false) };
    agent = await resolveHttpTabState();
  }
  if (agent && agent.tab && !agent.no_agent_tab && !agent.mismatch && !pageBeingRead(agent.tab)) {
    return {
      resolved: agent,
      error: null,
      released_reading_page: resolved.tab.tab_id,
      tab_id_source: "agent_group",
    };
  }
  return { resolved, error: refusePageBeingRead(resolved.tab, action, false) };
}

function withReadingPageRelease(result, release) {
  if (!release) return result;
  const extra = {};
  if (release.released_reading_page) {
    extra.released_reading_page = release.released_reading_page;
    extra.tab_id_source = "agent_group";
  }
  if (release.ensured_agent_tab) {
    extra.ensured_agent_tab = release.ensured_agent_tab;
    extra.tab_id_source = release.tab_id_source || "agent_group";
  }
  return Object.keys(extra).length ? Object.assign({}, result, extra) : result;
}

async function resolveHttpTab(preferredId) {
  const { tabs } = await listTabsState();
  const hasPreferred = preferredId !== undefined && preferredId !== null && String(preferredId) !== "";
  if (hasPreferred) {
    const id = String(preferredId);
    const hit = tabs.find((t) => t.tab_id === id);
    // An explicit target is authoritative. A missing, restricted, non-http, or
    // otherwise non-injectable target must never silently select another tab.
    return hit && isInjectableHttpTab(hit) ? tabIdNumber(hit.tab_id) : 0;
  }
  // Codex-style work stays in the agent group. The page being read is not an
  // implicit target, even when it is the last-focused USER tab.
  const agent = agentWorkTab(tabs);
  return agent ? tabIdNumber(agent.tab_id) : 0;
}

async function resolveHttpTabState(preferredId) {
  const { tabs } = await listTabsState();
  const hasPreferred = preferredId !== undefined && preferredId !== null && String(preferredId) !== "";
  if (hasPreferred) {
    const hit = tabs.find((t) => t.tab_id === String(preferredId));
    if (!hit) return { mismatch: true };
    if (!isInjectableHttpTab(hit)) return null;
    const id = tabIdNumber(hit.tab_id);
    return id ? { id, tab: hit } : null;
  }
  const agent = agentWorkTab(tabs);
  if (!agent) return { no_agent_tab: true };
  const id = tabIdNumber(agent.tab_id);
  return id ? { id, tab: agent } : { no_agent_tab: true };
}

function wrongBrowserOrMissing(resolved) {
  if (resolved && resolved.mismatch) {
    return { ok: false, error: "wrong_extension_browser", retryable: true };
  }
  if (resolved && resolved.no_agent_tab) {
    return {
      ok: false,
      error: "no agent tab in the VCU group; refusing to use the page being read",
      repair: "open a background tab in the collapsed VCU group, then omit tab_id",
    };
  }
  if (!resolved) return { ok: false, error: "no injectable http tab" };
  return null;
}

async function fetchJson(url, opts = {}, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, Object.assign({}, opts, { signal: ctrl.signal }));
    return await resp.json();
  } finally {
    clearTimeout(t);
  }
}

let pollGen = 0;
async function injectTabHeartbeat() {
  if (!chrome.scripting || !chrome.scripting.executeScript || !chrome.tabs || !chrome.tabs.query) return;
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({});
  } catch (_) {
    return;
  }
  for (const tab of tabs) {
    if (!tab || tab.id == null || isRestrictedUrl(tab.url || "")) continue;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          if (globalThis.__vcuKeepalive) return;
          const beat = () => {
            try {
              chrome.runtime.sendMessage({ type: "keepalive" }, () => {
                void chrome.runtime.lastError;
              });
            } catch (_) {}
          };
          beat();
          globalThis.__vcuKeepalive = setInterval(beat, 5000);
        },
      });
    } catch (_) {}
  }
}

function startPollLoop() {
  if (polling) return;
  const gen = ++pollGen;
  polling = true;
  void injectTabHeartbeat();
  (async function loop() {
    try {
      while (gen === pollGen && pairingToken) {
        try {
          const body = await fetchJson(endpoint + "/v1/extension/poll", {
            method: "POST",
            headers: { "X-Vcu-Token": pairingToken, "Content-Type": "application/json" },
            body: JSON.stringify({
              wait_ms: 4000,
              client_id: chrome.runtime.id || "",
              browser: currentBrowser(),
            }),
          }, 10000);
          const cmd = body && body.data;
          if (cmd && cmd.id && cmd.method) {
            const result = await withTimeout(
              handleCommand(cmd),
              commandTimeoutMs(cmd.method),
              { ok: false, error: "command timeout " + cmd.method, stage: captureStage }
            );
            await fetchJson(endpoint + "/v1/extension/result", {
              method: "POST",
              headers: { "X-Vcu-Token": pairingToken, "Content-Type": "application/json" },
              body: JSON.stringify({ id: cmd.id, result: result || { ok: false, error: "empty result" } }),
            }, 8000);
          }
        } catch (e) {
          lastError = String(e);
          await new Promise((r) => setTimeout(r, 1200));
        }
      }
    } finally {
      if (gen === pollGen) polling = false;
    }
  })();
}

async function waitTabComplete(tabId, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 12000);
  while (Date.now() < deadline) {
    try {
      const t = await chrome.tabs.get(tabId);
      if (t && t.status === "complete") return t;
    } catch (_) {
      return null;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  try { return await chrome.tabs.get(tabId); } catch (_) { return null; }
}


async function readViewportSettled(tabId) {
  let lastInject = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    captureStage = "post-viewport-" + attempt;
    if (attempt) await sleep(250);
    let after = await sendToTab(tabId, { type: "vcu_viewport", keep_cursor: true }, 900);
    if (after?.ok && after.viewport) return after;
    captureStage = "post-inject-" + attempt;
    lastInject = await injectContent(tabId, 1000);
    if (lastInject?.ok) {
      after = await sendToTab(tabId, { type: "vcu_viewport", keep_cursor: true }, 900);
      if (after?.ok && after.viewport) return after;
    }
  }
  captureStage = "post-probe";
  const probe = await withTimeout(chrome.scripting.executeScript({
    target: { tabId },
    world: "ISOLATED",
    injectImmediately: true,
    func: () => ({
      version: globalThis.__vcuContent && globalThis.__vcuContent.version || null,
      ready: document.readyState,
      href: String(location.href || ""),
    }),
  }), 800, null);
  let tab = null;
  try { tab = await chrome.tabs.get(tabId); } catch (_) {}
  const probeResult = probe && probe[0] ? probe[0].result : null;
  return {
    ok: false,
    error: "viewport metadata unavailable after background capture"
      + " inject=" + String(lastInject && (lastInject.error || lastInject.ok))
      + " probe=" + JSON.stringify(probeResult)
      + " status=" + (tab && tab.status)
      + " active=" + (tab && tab.active)
      + " window=" + (tab && tab.windowId),
  };
}

async function sendToTab(tabId, payload, ms) {
  try {
    const msg = await withTimeout(chrome.tabs.sendMessage(tabId, payload), ms, null);
    return msg;
  } catch (_) {
    return null;
  }
}

async function injectContent(tabId, timeoutMs) {
  try {
    const injected = await withTimeout(chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
      injectImmediately: true,
    }), timeoutMs, null);
    if (!injected) return { ok: false, error: "inject timeout" };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: "inject content.js: " + String(e) };
  }
}

async function ensureContent(tabId, injectTimeoutMs, pingTimeoutMs) {
  const expectedVersion = chrome.runtime.getManifest().version;
  let ping = await sendToTab(tabId, { type: "vcu_ping_page" }, pingTimeoutMs);
  if (ping) {
    if (ping.ok && ping.version === expectedVersion) return { ok: true, via: "content_message" };
    if (ping.ok) return { ok: false, error: "content lens is stale; reload this page" };
    return ping;
  }

  // A failed/timeout ping has no page mutation attached to it, so it is safe
  // to install the listener. The action itself is sent only once below.
  const injected = await injectContent(tabId, injectTimeoutMs);
  if (!injected.ok) return injected;
  ping = await sendToTab(tabId, { type: "vcu_ping_page" }, pingTimeoutMs);
  if (ping && ping.ok && ping.version === expectedVersion) return { ok: true, via: "content_inject" };
  if (ping && ping.ok) return { ok: false, error: "content lens is stale; reload this page" };
  if (ping && ping.ok === false) return ping;
  return { ok: false, error: "no content script" };
}

async function actionViaContent(tabId, payload, actionName, actionTimeoutMs, injectTimeoutMs, pingTimeoutMs, reveal) {
  let injectMs = injectTimeoutMs;
  let pingMs = pingTimeoutMs;
  let actionMs = actionTimeoutMs;
  let inactive = false;
  if (reveal !== false) {
    try {
      const live = await chrome.tabs.get(tabId);
      inactive = !!(live && live.active === false);
    } catch (_) {}
    // A collapsed Agent tab can leave sendMessage and executeScript pending.
    // Fail that attempt quickly, then reveal only inside the quiet window.
    if (inactive) {
      injectMs = Math.min(injectMs, IN_PLACE_SCRIPT_MS);
      pingMs = Math.min(pingMs, 400);
      actionMs = Math.min(actionMs, IN_PLACE_SCRIPT_MS);
    }
  }
  const ready = await ensureContent(tabId, injectMs, pingMs);
  if (!ready.ok) {
    if (reveal === false || !inactive || payload.dry_run || !contentFailureCanReveal(ready)) return ready;
    return revealInactiveContentAction(tabId, () => actionViaContent(
      tabId, payload, actionName, actionTimeoutMs, injectTimeoutMs, pingTimeoutMs, false
    ));
  }
  // Native CU pointers keep their apparent size when the webpage zooms.
  // Scale only our drawing; event and hit-test coordinates remain CSS px.
  if (typeof chrome.tabs.getZoom === "function") {
    payload.cursor_zoom = await chrome.tabs.getZoom(tabId);
  }
  const msg = await sendToTab(tabId, payload, actionMs);
  // An explicit response is authoritative. In particular, do not replay an
  // action after the page reports ok:false: it may already have side effects.
  if (msg && msg.ok) return Object.assign({ via: ready.via }, msg);
  if (msg && msg.ok === false) return msg;
  const failed = { ok: false, error: actionName + " content timeout" };
  if (reveal === false || !inactive || payload.dry_run || !contentFailureCanReveal(failed)) return failed;
  return revealInactiveContentAction(tabId, () => actionViaContent(
    tabId, payload, actionName, actionTimeoutMs, injectTimeoutMs, pingTimeoutMs, false
  ));
}

async function revealInactiveContentAction(tabId, fn) {
  const beforeActive = await activeTabsByWindow();
  const quiet = await withVisibleAgentTab(tabId, beforeActive, fn);
  await restoreStolenActiveTabs(beforeActive);
  if (quiet && quiet.ok) return Object.assign({ background_action: true }, quiet);
  return quiet || { ok: false, error: "background action refused without moving the user page" };
}

function extractMatchText(match) {
  if (!match) return "";
  return String(match.text || match.value || "").replace(/\s+/g, " ").trim();
}

function contentExtractHasText(msg) {
  if (!msg || msg.ok !== true || !Array.isArray(msg.matches)) return false;
  return msg.matches.some((match) => extractMatchText(match));
}

function renderedSelectorMiss(last) {
  if (!last || last.ok !== true || last.timeout) return false;
  if (contentExtractHasText(last)) return false;
  const url = String(last.url || "");
  if (!/^https?:/i.test(url)) return false;
  if (last.ready && last.ready !== "complete") return false;
  if (extractMatchText({ text: last.body_text })) return true;
  const html = String(last.html || "");
  return html.indexOf("<body") >= 0 && html.indexOf("</body>") >= 0;
}

function selectorMiss(last) {
  const sel = last && last.sel ? String(last.sel) : "";
  const url = (last && last.url) || "";
  return {
    ok: false,
    error: "selector matched no text: sel=" + sel + " url=" + url,
    count: 0,
    matches: [],
    page_url: url,
    source: "extension_dom",
    read_page: true,
    stage: (last && last.stage) || "read",
    os_cursor_used: false,
  };
}

function extractMiss(last, ready, extra) {
  const url = (last && (last.url || last.page_url)) || "";
  const title = (last && last.title) || "";
  const readyState = (last && last.ready) || "";
  const detail = [
    extra || (last && last.error) || (ready && ready.error) || "empty document",
    last && last.sel ? "sel=" + last.sel : "",
    last && last.body_text ? "body=" + last.body_text : "",
    last && last.html ? "html=" + last.html : "",
    url ? "url=" + url : "",
    title ? "title=" + title : "",
    readyState ? "ready=" + readyState : "",
  ].filter(Boolean).join(" ");
  return {
    ok: false,
    error: "extract did not read the page: " + detail.slice(0, 500),
    count: 0,
    matches: [],
    page_url: url,
    source: "extension_dom",
    os_cursor_used: false,
  };
}

async function inactiveAgentTab(tabId) {
  const listed = await listTabsState();
  const mapped = (listed.tabs || []).find((tab) => String(tab.tab_id) === String(tabId));
  if (!mapped || mapped.active || mapped.focused || mapped.page_being_read) return false;
  return !!(mapped.agent_surface || mapped.agent_owned);
}

async function collapsedAgentGroupId(tabId) {
  let tab = null;
  try { tab = await chrome.tabs.get(tabId); } catch (_) { return null; }
  const groupId = groupIdNumber(tab && tab.groupId);
  if (groupId == null) return null;
  const group = await findGroup(groupId);
  if (!group || group.collapsed !== true || protectedUserGroupTitle(group.title)) return null;
  if (!(agentGroupTitle(group.title) || sessionGroupMatches(group))) return null;
  return groupId;
}

function unrenderedAgentDocument(last, live) {
  if (!last || last.ok === false || last.timeout) return true;
  if (!last.url || last.url === "about:blank") return true;
  if (last.ready && last.ready !== "complete") return true;
  if (live && (live.discarded || (live.status && live.status !== "complete"))) return true;
  if (!extractMatchText({ text: last.body_text }) && !(last.matches || []).length) return true;
  return false;
}

async function extractViaContent(tabId, selector) {
  const ready = await ensureContent(tabId, 900, 400);
  if (ready.ok) {
    const msg = await sendToTab(tabId, { type: "vcu_extract", selector }, 400);
    if (msg && msg.ok === false) return msg;
    if (contentExtractHasText(msg)) return Object.assign({ via: ready.via }, msg);
  }
  // A collapsed inactive tab can answer with an empty document. Read it after
  // the document is idle. Do not activate the tab; that replaces the page
  // being read. An empty result is a failure, never a fabricated match.
  return readInactiveAgentDocument(tabId, selector, ready);
}

async function readInactiveAgentDocument(tabId, selector, ready) {
  let last = await extractPageInPlace(tabId, selector, 1500);
  if (last) last.stage = "idle";
  if (contentExtractHasText(last)) return Object.assign({ via: "page_script", page_url: last.url || "" }, last);
  // A complete page with body text and no selector hit was read. Do not expand,
  // reload, or claim the read failed. example.com no longer has an h1.
  if (renderedSelectorMiss(last)) return selectorMiss(last);
  if (!(await inactiveAgentTab(tabId))) return extractMiss(last, ready, "not-agent");
  const before = await activeTabsByWindow();
  const groupId = await collapsedAgentGroupId(tabId);
  if (groupId != null) {
    agentExpandAllowed = Date.now() + 800;
    try { await chrome.tabGroups.update(groupId, { collapsed: false }); } catch (_) {}
    await sleep(200);
    last = await extractPageInPlace(tabId, selector, 1500);
    if (last) last.stage = "expanded";
    try { await chrome.tabGroups.update(groupId, { collapsed: true }); } catch (_) {}
    await restoreStolenActiveTabs(before);
    if (contentExtractHasText(last)) return Object.assign({ via: "page_script", page_url: last.url || "" }, last);
    if (renderedSelectorMiss(last)) return selectorMiss(last);
  }
  let live = null;
  try { live = await chrome.tabs.get(tabId); } catch (_) {}
  if (unrenderedAgentDocument(last, live) && live && live.active === false && chrome.tabs && typeof chrome.tabs.reload === "function") {
    try { await chrome.tabs.reload(tabId); }
    catch (e) {
      await restoreStolenActiveTabs(before);
      return extractMiss(last, ready, "reload " + e);
    }
    await restoreStolenActiveTabs(before);
    await waitTabComplete(tabId, 2000);
    await restoreStolenActiveTabs(before);
    last = await extractPageInPlace(tabId, selector, 1500);
    if (last) last.stage = "reloaded";
    await restoreStolenActiveTabs(before);
    if (contentExtractHasText(last)) return Object.assign({ via: "page_script", page_url: last.url || "" }, last);
    if (renderedSelectorMiss(last)) return selectorMiss(last);
  }
  await restoreStolenActiveTabs(before);
  if (renderedSelectorMiss(last)) return selectorMiss(last);
  if (last) last.stage = (last && last.stage) || "unread";
  return extractMiss(last, ready, last && last.stage);
}

async function extractPageInPlace(tabId, selector, timeoutMs) {
  const wanted = String(selector || "h1");
  const ran = await runPageScript(tabId, {
    target: { tabId },
    world: "MAIN",
    args: [wanted],
    func: (sel) => {
      const query = sel || "h1";
      let nodes;
      try { nodes = document.querySelectorAll(query); }
      catch (e) {
        return { ok: false, error: String(e), sel: String(query), url: location.href, title: document.title || "", ready: document.readyState, source: "extension_dom" };
      }
      const matches = [];
      for (let i = 0; i < nodes.length && matches.length < 20; i++) {
        const el = nodes[i];
        matches.push({
          tag: el.tagName,
          text: String(el.textContent || el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 160),
          href: el.href || null,
          value: el.value == null ? null : String(el.value),
        });
      }
      return {
        ok: true,
        matches,
        count: matches.length,
        truncated: nodes.length > matches.length,
        sel: String(query),
        url: location.href,
        title: document.title || "",
        ready: document.readyState,
        body_text: String((document.body && document.body.textContent) || "").replace(/\s+/g, " ").trim().slice(0, 80),
        html: String(document.documentElement ? document.documentElement.outerHTML : "").slice(0, 180),
        source: "extension_dom",
      };
    },
  }, timeoutMs || 1500);
  if (ran.timeout) return { ok: false, error: "extract page script timeout", os_cursor_used: false };
  if (ran.error) return { ok: false, error: "extract page script: " + ran.error, os_cursor_used: false };
  return ran.result || { ok: false, error: "extract page script empty", os_cursor_used: false };
}

async function typeViaContent(tabId, selector, text, dryRun) {
  return actionViaContent(
    tabId,
    { type: "vcu_type", selector: selector || null, text: text || "", dry_run: !!dryRun },
    "type",
    1500,
    2500,
    1500,
  );
}

async function clickViaContent(tabId, selector, dryRun) {
  return actionViaContent(
    tabId,
    { type: "vcu_click", selector: selector || null, dry_run: !!dryRun },
    "click",
    1500,
    900,
    1000,
  );
}

async function scrollViaContent(tabId, dy, dryRun) {
  return actionViaContent(
    tabId,
    { type: "vcu_scroll", dy, dry_run: !!dryRun },
    "scroll",
    1500,
    2500,
    1500,
  );
}

function groupIdNumber(groupId) {
  if (groupId === undefined || groupId === null || groupId === "") return null;
  const n = Number(groupId);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

async function findGroup(groupId) {
  const id = String(groupId);
  const groups = await queryTabGroups();
  return groups.find((g) => g.group_id === id) || null;
}

function normalizeTabIds(rawIds) {
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return { ok: false, error: "tab_ids must be a non-empty array" };
  }
  const ids = [];
  const seen = new Set();
  for (const raw of rawIds) {
    const id = tabIdNumber(raw);
    if (id === null) return { ok: false, error: "invalid tab_id " + String(raw) };
    if (seen.has(String(id))) return { ok: false, error: "duplicate tab_id " + String(raw) };
    seen.add(String(id));
    ids.push(id);
  }
  return { ok: true, ids };
}

function validateGroupColor(color) {
  if (color == null || color === "") return DEFAULT_GROUP_COLOR;
  const value = String(color).toLowerCase();
  return TAB_GROUP_COLORS.has(value) ? value : null;
}

async function freshTabsForIds(ids) {
  const { tabs, groups } = await listTabsState();
  const wanted = new Set(ids.map((id) => String(id)));
  return {
    tabs: tabs.filter((t) => wanted.has(t.tab_id)),
    groups,
  };
}

function tabsResult(state, extra = {}) {
  return Object.assign({
    ok: true,
    tabs: state.tabs,
    groups: state.groups,
    source: "extension_tabs",
    os_cursor_used: false,
  }, extra);
}

async function groupTabs(params) {
  const parsed = normalizeTabIds(params.tab_ids);
  if (!parsed.ok) return parsed;
  const title = params.title == null ? "" : String(params.title).trim();
  if (!title) return { ok: false, error: "group title required" };
  const color = validateGroupColor(params.color);
  if (!color) return { ok: false, error: "invalid tab group color" };

  const rawTabs = [];
  try {
    for (const id of parsed.ids) rawTabs.push(await chrome.tabs.get(id));
  } catch (e) {
    return { ok: false, error: "tabs.get: " + String(e) };
  }
  const windowId = rawTabs[0] && String(rawTabs[0].windowId);
  if (rawTabs.some((t) => String(t.windowId) !== windowId)) {
    return { ok: false, error: "all tabs must be in the same window" };
  }
  const invalid = rawTabs.find((t) => !/^https?:/i.test(t.url || "") || isRestrictedUrl(t.url));
  if (invalid) return { ok: false, error: "tab_ids must contain only unrestricted http(s) tabs" };
  const pinned = rawTabs.find((t) => t.pinned);
  if (pinned) return { ok: false, error: "pinned tabs cannot be grouped" };
  const listed = await listTabsState();
  const reading = readingTabIn(listed.tabs, parsed.ids);
  if (reading) return refusePageBeingRead(reading, "group_tabs");

  let groupId;
  try {
    groupId = await chrome.tabs.group({ tabIds: parsed.ids, createProperties: { windowId: Number(windowId) } });
    await chrome.tabGroups.update(groupId, {
      title,
      color,
      collapsed: params.collapsed == null ? false : !!params.collapsed,
    });
  } catch (e) {
    return { ok: false, error: "group tabs: " + String(e) };
  }
  const state = await freshTabsForIds(parsed.ids);
  const group = state.groups.find((g) => g.group_id === String(groupId)) || null;
  return tabsResult(state, { group });
}

async function updateGroup(params) {
  const id = groupIdNumber(params.group_id);
  if (id === null) return { ok: false, error: "invalid group_id" };
  const patch = {};
  if (params.title !== undefined) patch.title = String(params.title);
  if (params.color !== undefined) {
    const color = validateGroupColor(params.color);
    if (!color) return { ok: false, error: "invalid tab group color" };
    patch.color = color;
  }
  if (params.collapsed !== undefined) patch.collapsed = !!params.collapsed;
  if (!Object.keys(patch).length) return { ok: false, error: "group update requires title, color, or collapsed" };
  const listed = await listTabsState();
  const reading = (listed.tabs || []).find((tab) => tab.group_id === String(id) && pageBeingRead(tab));
  if (reading) return refusePageBeingRead(reading, "update_group");
  try {
    await chrome.tabGroups.update(id, patch);
  } catch (e) {
    return { ok: false, error: "tabGroups.update: " + String(e) };
  }
  const group = await findGroup(id);
  return { ok: true, group, source: "extension_tabs", os_cursor_used: false };
}

async function ungroupTabs(params) {
  const parsed = normalizeTabIds(params.tab_ids);
  if (!parsed.ok) return parsed;
  const listed = await listTabsState();
  const reading = readingTabIn(listed.tabs, parsed.ids);
  if (reading) return refusePageBeingRead(reading, "ungroup_tabs");
  try {
    await chrome.tabs.ungroup(parsed.ids);
  } catch (e) {
    return { ok: false, error: "ungroup tabs: " + String(e) };
  }
  const state = await freshTabsForIds(parsed.ids);
  return tabsResult(state);
}

async function selectTab(params) {
  const id = tabIdNumber(params.tab_id);
  if (id === null) return { ok: false, error: "invalid tab_id" };
  let tab;
  try {
    tab = await chrome.tabs.get(id);
  } catch (e) {
    return { ok: false, error: "tabs.get: " + String(e) };
  }
  if (!isInjectableHttpTab({ url: tab.url || "" })) {
    return { ok: false, error: "select_tab requires an unrestricted http(s) tab" };
  }
  // Agent observe/capture must not replace the page the user is looking at.
  // focus_window:false is that path and does not activate unless activate:true
  // is explicit (used only to put back a page we already changed). CLI and the
  // popup omit focus_window, so an explicit select still activates.
  const activate = params.activate === true || params.focus_window !== false;
  if (!activate) {
    const state = await freshTabsForIds([id]);
    const selected = state.tabs[0] || null;
    const selectedGroup = selected && selected.group_id
      ? state.groups.find((g) => g.group_id === selected.group_id) || selected.group || null
      : null;
    return tabsResult(state, Object.assign(tabActionState(selected), { group: selectedGroup, activated: false }));
  }
  // Switching a tab or focusing its window replaces the page being read.
  // Codex keeps that page and works in its own group. Do not expand, focus,
  // or activate from select.
  const listed = await listTabsState();
  const reading = (listed.tabs || []).find((item) => item && item.page_being_read);
  if (reading && String(reading.tab_id) !== String(id)) {
    return {
      ok: false,
      error: "select refused without moving the page being read; work in the VCU group",
      repair: "do not select or activate the page being read; act on the VCU group",
      tab_id: String(id),
      activated: false,
      os_cursor_used: false,
    };
  }
  if (String(tab.windowId) !== String(await focusedWindowId())) {
    return {
      ok: false,
      error: "select refused without raising a browser window; work in the VCU group",
      tab_id: String(id),
      activated: false,
      os_cursor_used: false,
    };
  }
  const state = await freshTabsForIds([id]);
  const selected = state.tabs[0] || null;
  const selectedGroup = selected && selected.group_id
    ? state.groups.find((g) => g.group_id === selected.group_id) || selected.group || null
    : null;
  // No tabs.update and no windows.update. Report the current selection without
  // claiming this call activated or raised anything.
  return tabsResult(state, Object.assign(tabActionState(selected), { group: selectedGroup, activated: false }));
}

async function activeTabsByWindow() {
  const tabs = await chrome.tabs.query({});
  const map = new Map();
  for (const tab of tabs || []) {
    if (tab && tab.active && tab.id != null && tab.windowId != null) map.set(String(tab.windowId), tab.id);
  }
  return map;
}

async function agentTabShouldRemainActive(windowId, tabId) {
  await loadQuietWindowId();
  await loadSessionGroupIds();
  if (quietCaptureWindowId == null || String(windowId) !== String(quietCaptureWindowId) || tabId == null) return false;
  let tab = null;
  try { tab = await chrome.tabs.get(tabId); } catch (_) { return false; }
  if (!tab || !isInjectableHttpTab(tab) || Number(tab.windowId) !== Number(quietCaptureWindowId)) return false;
  const groupId = groupIdNumber(tab.groupId);
  if (groupId == null) return false;
  const group = await findGroup(groupId);
  if (!group || protectedUserGroupTitle(group.title)) return false;
  return !!(agentGroupTitle(group.title) || sessionGroupMatches(group));
}

async function captureTabStayed(current, resolved) {
  if (!current || !resolved || !resolved.tab) return false;
  if (String(current.windowId) !== String(resolved.tab.window_id)) return false;
  if (!!current.active === !!resolved.tab.active) return true;
  // The quiet VCU tab stays active so the next action does not raise that
  // window. That is not a failure to restore the page being read.
  return !!(current.active && await agentTabShouldRemainActive(current.windowId, current.id));
}

async function restoreStolenActiveTabs(before) {
  if (!before) return;
  const after = await activeTabsByWindow();
  for (const [windowId, tabId] of before) {
    if (after.get(windowId) === tabId) continue;
    // The agent tab stays active inside the quiet window so the next action
    // does not call tabs.update and raise that window again. Never do this
    // for the page being read.
    if (await agentTabShouldRemainActive(windowId, after.get(windowId))) {
      await restackUserWindow(quietParkAnchor, quietCaptureWindowId);
      continue;
    }
    try { await chrome.tabs.update(tabId, { active: true }); } catch (_) {}
    // Putting the previous quiet-window tab back can focus that window on
    // Edge. Restack the page being read; do not focus Edge over the OS app.
    if (quietCaptureWindowId != null && String(windowId) === String(quietCaptureWindowId)) {
      await restackUserWindow(quietParkAnchor, quietCaptureWindowId);
    }
  }
}

async function activateQuietTab(tabId, quietId, userWindowId) {
  const tab = await chrome.tabs.get(tabId);
  if (Number(tab.windowId) !== Number(quietId)) return false;
  const beforeFocused = await focusedWindowId();
  noteUserFocus(beforeFocused, quietId);
  noteUserFocus(userWindowId, quietId);
  // A previous tabs.update may have left last-focused on the quiet window.
  // Do not treat that as legal, and do not activate again. Restoring focus
  // would need windows.update({focused:true}) or AppleScript; both are refused.
  if (quietFocusIsStolen(beforeFocused, quietId)) return false;
  if (tab.active) return true;
  const beforeActive = await activeTabsByWindow();
  const previous = beforeActive && beforeActive.get(String(quietId));
  const groupId = groupIdNumber(tab.groupId);
  let wasCollapsed = false;
  if (groupId != null) {
    const group = await findGroup(groupId);
    wasCollapsed = !!(group && group.collapsed !== false);
    if (wasCollapsed) {
      try { await updateRecordedGroup(groupId, { collapsed: false }); } catch (_) {}
    }
  }
  try {
    // Activate only inside the quiet window. Never windows.update
    // focused:true, and never tabs.update the page being read.
    await chrome.tabs.update(tabId, { active: true });
  } catch (_) {
    if (wasCollapsed && groupId != null) {
      try { await updateRecordedGroup(groupId, { collapsed: true }); } catch (_) {}
    }
    return false;
  }
  let current = null;
  try { current = await chrome.tabs.get(tabId); } catch (_) { current = null; }
  const nowFocused = await focusedWindowId();
  const nowActive = await activeTabsByWindow();
  const userWindow = userWindowId != null ? Number(userWindowId) : beforeFocused;
  const stole = quietFocusIsStolen(nowFocused, quietId)
    || (userWindow != null && !userFocusIntact(beforeFocused, beforeActive, userWindow, nowFocused, nowActive));
  const active = !!(current && current.active && Number(current.windowId) === Number(quietId));
  if (stole || !active) {
    if (previous != null && Number(previous) !== Number(tabId)) {
      try { await chrome.tabs.update(previous, { active: true }); } catch (_) {}
    }
    if (wasCollapsed && groupId != null) {
      try { await updateRecordedGroup(groupId, { collapsed: true }); } catch (_) {}
    }
    return false;
  }
  return true;
}

async function releaseQuietTabBeforeReturn(tabId, quietId, userWindowId, quietActiveBefore, keepAgentActive) {
  if (quietId == null) return;
  let current = null;
  try { current = await chrome.tabs.get(tabId); } catch (_) { return; }
  if (!current || Number(current.windowId) !== Number(quietId) || !current.active) return;
  // A tab that already lives in the quiet VCU group should stay active there.
  // Handing it back to about:blank forces the next action to raise the window.
  if (keepAgentActive && await agentTabShouldRemainActive(quietId, tabId)) {
    await restackUserWindow(await windowAnchor(userWindowId), quietId);
    return;
  }
  // Moving an active tab back into the user window replaces the page being
  // read. Hand the quiet window back to its previous tab first.
  const previous = quietActiveBefore != null && Number(quietActiveBefore) !== Number(tabId)
    ? quietActiveBefore
    : null;
  // Handing the quiet window to another tab, or restacking via AppleScript,
  // raises a browser window over the page being read. Leave both windows.
  void previous;
  void userWindowId;
}

let quietCaptureWindowId = null;
let quietParkAnchor = null;
let quietParkedOnBoot = false;
let captureStage = "";
let quietGroupTrace = null;
let quietFocusBaseline = null;

function noteUserFocus(windowId, quietId) {
  if (windowId == null || quietId == null) return;
  if (String(windowId) === String(quietId)) return;
  quietFocusBaseline = windowId;
}

function quietFocusIsStolen(nowFocused, quietId) {
  if (quietFocusBaseline == null || quietId == null || nowFocused == null) return false;
  return String(nowFocused) === String(quietId) && String(nowFocused) !== String(quietFocusBaseline);
}

function noteTabGroupUpdate(id, patch) {
  if (!quietGroupTrace || !patch) return;
  quietGroupTrace.push({
    id: String(id),
    collapsed: Object.prototype.hasOwnProperty.call(patch, "collapsed") ? !!patch.collapsed : null,
  });
}

async function updateRecordedGroup(id, patch) {
  noteTabGroupUpdate(id, patch);
  return chrome.tabGroups.update(id, patch);
}

function userGroupExpansions() {
  return (quietGroupTrace || []).filter((item) => item.collapsed === false).length;
}

async function focusedWindowId() {
  try {
    const win = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
    return win && win.id != null ? win.id : null;
  } catch (_) {
    return null;
  }
}

function userFocusIntact(beforeFocused, beforeActive, userWindowId, nowFocused, nowActive) {
  if (beforeFocused != null && nowFocused !== beforeFocused) return false;
  const expected = beforeActive && beforeActive.get(String(userWindowId));
  if (expected != null && nowActive.get(String(userWindowId)) !== expected) return false;
  return true;
}

async function restoreUserFocus(beforeFocused, beforeActive) {
  await restoreStolenActiveTabs(beforeActive);
  const focused = Number(beforeFocused);
  if (!Number.isInteger(focused) || focused <= 0) return;
  const nowFocused = await focusedWindowId();
  if (nowFocused === beforeFocused) return;
  // Restack by window id only. chrome.windows.update({focused:true}) activates
  // Edge and steals the OS front app from whatever the user is using.
  await postQuietHelper("/restack", { window_id: focused });
}

function viewportDrift(expected, actual, options) {
  if (!expected || !actual) return "missing";
  const changed = [];
  const fields = ["document_id", "url", "scroll_x", "scroll_y", "device_pixel_ratio", "visual_scale", "visual_offset_x", "visual_offset_y"];
  if (!(options && options.ignoreRevision)) fields.push("revision");
  for (const field of fields) {
    if (expected[field] !== actual[field]) changed.push(field);
  }
  if (!(options && options.ignoreGeometry)) {
    if (Math.abs(Number(expected.width) - Number(actual.width)) > 1) changed.push("width");
    if (Math.abs(Number(expected.height) - Number(actual.height)) > 1) changed.push("height");
    if (JSON.stringify(expected.layout_signature) !== JSON.stringify(actual.layout_signature)) changed.push("layout_signature");
  }
  return changed.join(",");
}

async function windowIsQuiet(id, userWindowId, beforeFocused) {
  if (id == null || Number(id) === Number(userWindowId) || Number(id) === Number(beforeFocused)) return false;
  try {
    const win = await chrome.windows.get(id);
    return !!(win && win.type !== "devtools" && win.type !== "popup");
  } catch (_) {
    return false;
  }
}

async function rememberQuietWindow(id) {
  quietCaptureWindowId = id;
  try { await chrome.storage.local.set({ quietCaptureWindowId: id }); } catch (_) {}
}

async function loadQuietWindowId() {
  if (quietCaptureWindowId != null) return quietCaptureWindowId;
  try {
    const stored = await chrome.storage.local.get(["quietCaptureWindowId"]);
    if (stored && stored.quietCaptureWindowId != null) quietCaptureWindowId = stored.quietCaptureWindowId;
  } catch (_) {}
  return quietCaptureWindowId;
}

const sessionGroupTitles = new Map();
let sessionGroupsLoaded = false;

async function loadAgentWindowId() {
  if (agentWindowId != null) return agentWindowId;
  try {
    const stored = await chrome.storage.local.get(["agentWindowId"]);
    if (stored && stored.agentWindowId != null) agentWindowId = stored.agentWindowId;
  } catch (_) {}
  return agentWindowId;
}

function protectedUserGroupTitle(title) {
  const name = String(title || "").trim();
  return name === "1" || name === "3";
}

async function loadSessionGroupIds() {
  if (sessionGroupsLoaded) return sessionGroupTitles;
  sessionGroupsLoaded = true;
  try {
    const stored = await chrome.storage.local.get(["agentSessionGroupIds"]);
    const ids = stored && stored.agentSessionGroupIds;
    if (Array.isArray(ids)) {
      for (const item of ids) {
        if (item && typeof item === "object") {
          const id = item.id != null ? String(item.id) : "";
          if (id) sessionGroupTitles.set(id, item.title != null ? String(item.title) : "");
        } else if (item != null && String(item) !== "") {
          sessionGroupTitles.set(String(item), "");
        }
      }
    }
  } catch (_) {}
  return sessionGroupTitles;
}

async function rememberSessionGroup(groupId, title) {
  if (groupId == null) return;
  await loadSessionGroupIds();
  sessionGroupTitles.set(String(groupId), title != null ? String(title) : "");
  try {
    await chrome.storage.local.set({
      agentSessionGroupIds: Array.from(sessionGroupTitles, ([id, remembered]) => ({ id, title: remembered })),
    });
  } catch (_) {}
}

function sessionGroupMatches(group) {
  if (!group) return false;
  const id = group.group_id != null ? group.group_id : group.id;
  if (id == null || !sessionGroupTitles.has(String(id))) return false;
  const title = String(group.title || "");
  if (protectedUserGroupTitle(title)) return false;
  const remembered = sessionGroupTitles.get(String(id));
  if (remembered && remembered !== title) return false;
  return true;
}

function readingTabIn(tabs, ids) {
  const wanted = ids ? new Set(ids.map((id) => String(id))) : null;
  return (tabs || []).find((tab) => pageBeingRead(tab) && (!wanted || wanted.has(String(tab.tab_id)))) || null;
}

async function mayRelocateToQuietWindow(live, group) {
  if (!live || live.active) return false;
  await loadQuietWindowId();
  await loadAgentWindowId();
  await loadSessionGroupIds();
  const windowId = String(live.windowId);
  // Already in the quiet window. Do not treat a stored agent window id as
  // permission to move every tab in the window the user is reading.
  if (quietCaptureWindowId != null && windowId === String(quietCaptureWindowId)) return true;
  if (group && agentGroupTitle(group.title) && !protectedUserGroupTitle(group.title)) return true;
  if (sessionGroupMatches(group)) return true;
  if (agentWindowId != null && windowId === String(agentWindowId)) {
    const focused = await focusedWindowId();
    if (focused != null && String(focused) === windowId) return false;
    return true;
  }
  return false;
}

function refuseUserTabRelocation(kind) {
  return {
    ok: false,
    error: kind + " refused without moving the user page: target is not in the VCU group or agent window",
    repair: "work in the collapsed VCU group; do not move the page being read",
    os_cursor_used: false,
  };
}

const QUIET_PARK_WIDTH = 500;
const QUIET_PARK_HEIGHT = 375;
const QUIET_FALLBACK_SCREEN_WIDTH = 1920;
const QUIET_FALLBACK_WORK_BOTTOM = 956;

function noteQuietAnchor(anchor) {
  const width = Number(anchor && anchor.width);
  const height = Number(anchor && anchor.height);
  if (width > 800 && height > 500) quietParkAnchor = anchor;
  return quietParkAnchor;
}

function quietParkFrame(anchor) {
  const chosen = noteQuietAnchor(anchor) || anchor;
  const left = Number(chosen && chosen.left);
  const top = Number(chosen && chosen.top);
  const width = Number(chosen && chosen.width);
  const height = Number(chosen && chosen.height);
  const usable = width > 800 && height > 500 && Number.isFinite(left) && Number.isFinite(top);
  const screenLeft = usable && left > 80 ? Math.round(left) : 0;
  const screenWidth = usable
    ? Math.max(QUIET_FALLBACK_SCREEN_WIDTH, Math.round((left > 80 ? 0 : left) + width))
    : QUIET_FALLBACK_SCREEN_WIDTH;
  const workBottom = usable ? Math.round(top + height) : QUIET_FALLBACK_WORK_BOTTOM;
  return { screenLeft, screenWidth, workBottom };
}

function quietVisibleCreateBounds(anchor) {
  const parked = quietParkBounds(anchor);
  const frame = quietParkFrame(anchor);
  const width = parked.width;
  const height = parked.height;
  // windows.create rejects a window that is less than half on the visible
  // screen. Keep the whole quiet window inside the known work area, at the
  // bottom-right, instead of starting it below the screen edge.
  return {
    state: "normal",
    focused: false,
    left: Math.max(frame.screenLeft, Math.round(frame.screenLeft + frame.screenWidth - width)),
    top: Math.max(0, Math.round(frame.workBottom - height)),
    width,
    height,
  };
}

function quietCreateFallbackBounds(anchor) {
  const width = QUIET_PARK_WIDTH;
  const height = QUIET_PARK_HEIGHT;
  const left = Number(anchor && anchor.left);
  const top = Number(anchor && anchor.top);
  const anchorWidth = Number(anchor && anchor.width);
  const anchorHeight = Number(anchor && anchor.height);
  if (![left, top, anchorWidth, anchorHeight].every(Number.isFinite) || anchorWidth < width || anchorHeight < height) {
    return { state: "normal", focused: false, left: 40, top: 40, width, height };
  }
  return {
    state: "normal",
    focused: false,
    left: Math.round(left + anchorWidth - width),
    top: Math.round(top + anchorHeight - height),
    width,
    height,
  };
}

function quietParkBounds(anchor) {
  const frame = quietParkFrame(anchor);
  // Sit on the user window's bottom edge. The old screenHeight-200 request
  // overlapped the page being read by 76px and could cover that page.
  return {
    state: "normal",
    focused: false,
    left: Math.round(frame.screenLeft + frame.screenWidth - QUIET_PARK_WIDTH),
    top: frame.workBottom,
    width: QUIET_PARK_WIDTH,
    height: QUIET_PARK_HEIGHT,
  };
}

function quietDockBounds(anchor) {
  return quietParkBounds(anchor);
}

function boundsApplied(actual, bounds) {
  if (!actual || !bounds) return false;
  const fields = ["left", "top", "width", "height"];
  for (const field of fields) {
    if (!Number.isFinite(Number(actual[field])) || !Number.isFinite(Number(bounds[field]))) return false;
  }
  return Math.abs(Number(actual.left) - Number(bounds.left)) <= 30
    && Math.abs(Number(actual.top) - Number(bounds.top)) <= 30
    && Math.abs(Number(actual.width) - Number(bounds.width)) <= 40
    && Math.abs(Number(actual.height) - Number(bounds.height)) <= 40;
}

function boundsOverlap(a, b) {
  if (!a || !b) return false;
  const aLeft = Number(a.left);
  const aTop = Number(a.top);
  const bLeft = Number(b.left);
  const bTop = Number(b.top);
  const aRight = aLeft + Number(a.width);
  const aBottom = aTop + Number(a.height);
  const bRight = bLeft + Number(b.width);
  const bBottom = bTop + Number(b.height);
  if (![aLeft, aTop, aRight, aBottom, bLeft, bTop, bRight, bBottom].every(Number.isFinite)) return false;
  return aLeft < bRight && aRight > bLeft && aTop < bBottom && aBottom > bTop;
}

function overlapArea(a, b) {
  if (!boundsOverlap(a, b)) return 0;
  const width = Math.min(Number(a.left) + Number(a.width), Number(b.left) + Number(b.width)) - Math.max(Number(a.left), Number(b.left));
  const height = Math.min(Number(a.top) + Number(a.height), Number(b.top) + Number(b.height)) - Math.max(Number(a.top), Number(b.top));
  return width > 0 && height > 0 ? width * height : 0;
}

function quietCoversUserPage(actual, anchor) {
  const userWidth = Number(anchor && anchor.width);
  const userHeight = Number(anchor && anchor.height);
  if (!(userWidth > 0) || !(userHeight > 0)) return false;
  return overlapArea(actual, anchor) > userWidth * userHeight * 0.25;
}

function quietStageBounds(anchor) {
  // Stay at the parked size. Growing to the user viewport covers the page
  // being read, even when the origin is the corner.
  return quietParkBounds(anchor);
}

async function windowAnchor(windowId) {
  if (windowId == null) return null;
  try { return await chrome.windows.get(windowId); } catch (_) { return null; }
}

let quietParkDrop = null;

function alreadySunkQuiet(current, bounds) {
  if (!current || current.state === "minimized" || current.focused) return false;
  const width = Number(current.width);
  const height = Number(current.height);
  const top = Number(current.top);
  const left = Number(current.left);
  if (![width, height, top, left].every(Number.isFinite)) return false;
  if (width > Number(bounds.width) + 40 || height > Number(bounds.height) + 40) return false;
  return top + 8 >= Number(bounds.top);
}

async function sunkQuietBounds(quietId, anchor) {
  const bounds = quietParkBounds(anchor);
  const frame = quietParkFrame(anchor);
  let current = null;
  try { current = await chrome.windows.get(quietId); } catch (_) {}
  if (alreadySunkQuiet(current, bounds)) {
    return {
      state: "normal",
      focused: false,
      left: Math.round(Number(current.left)),
      top: Math.round(Number(current.top)),
      width: Math.round(Number(current.width)),
      height: Math.round(Number(current.height)),
    };
  }
  if (!(frame.workBottom > bounds.top + 8)) return bounds;
  if (quietParkDrop == null) {
    let low = bounds.top;
    let high = frame.workBottom;
    let appliedAny = false;
    for (let i = 0; i < 4; i++) {
      if (high - low <= 8) break;
      const mid = Math.round((low + high) / 2);
      const trial = Object.assign({}, bounds, { top: mid });
      let applied = false;
      try {
        // Probe only through /stage. A failed helper must not fall back to
        // chrome.windows.update: that raises the quiet window over the page
        // the user is reading. Stop and keep the requested park bounds.
        if (!(await stageQuietBehind(quietId, trial, anchor))) break;
        applied = boundsApplied(await chrome.windows.get(quietId), trial);
      } catch (_) {
        break;
      }
      if (applied) {
        low = mid;
        appliedAny = true;
      } else {
        high = mid;
      }
    }
    quietParkDrop = appliedAny ? low - bounds.top : 0;
  }
  return Object.assign({}, bounds, { top: bounds.top + quietParkDrop });
}

async function postQuietHelper(path, body) {
  // The helper runs `tell application "Microsoft Edge"`, which activates Edge,
  // then `set index` / `set bounds`, which reorder the window being read.
  // Codex works in its own tab group and does not do that.
  void path;
  void body;
  return false;
}

async function restackUserWindow(anchor, quietId) {
  const id = Number(anchor && anchor.id);
  const left = Number(anchor && anchor.left);
  const top = Number(anchor && anchor.top);
  const width = Number(anchor && anchor.width);
  const height = Number(anchor && anchor.height);
  const quiet = Number(quietId);
  if (Number.isInteger(id) && id > 0) {
    return postQuietHelper("/restack", {
      window_id: id,
      quiet_id: Number.isInteger(quiet) && quiet > 0 && quiet !== id ? quiet : 0,
      left: Number.isFinite(left) ? Math.round(left) : 0,
      top: Number.isFinite(top) ? Math.round(top) : 0,
      width: Number.isFinite(width) ? Math.round(width) : 0,
      height: Number.isFinite(height) ? Math.round(height) : 0,
    });
  }
  if (![left, top, width, height].every(Number.isFinite)) return false;
  if (width < 800 || height < 500) return false;
  return postQuietHelper("/restack", {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(width),
    height: Math.round(height),
  });
}

async function stageQuietBehind(quietId, bounds, anchor) {
  const quiet = Number(quietId);
  const user = Number(anchor && anchor.id);
  const left = Number(bounds && bounds.left);
  const top = Number(bounds && bounds.top);
  const width = Number(bounds && bounds.width);
  const height = Number(bounds && bounds.height);
  if (!Number.isInteger(quiet) || quiet <= 0 || !Number.isInteger(user) || user <= 0 || quiet === user) return false;
  if (![left, top, width, height].every(Number.isFinite)) return false;
  return postQuietHelper("/stage", {
    user_id: user,
    quiet_id: quiet,
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(width),
    height: Math.round(height),
  });
}

async function placeQuietWindow(quietId, bounds, anchor) {
  let current = null;
  try { current = await chrome.windows.get(quietId); } catch (_) {}
  if (quietCoversUserPage(current, anchor) || quietCoversUserPage(bounds, anchor)) return false;
  if (current && current.state !== "minimized" && current.focused !== true && boundsApplied(current, bounds)) {
    await restackUserWindow(anchor, quietId);
    return true;
  }
  // chrome.windows.update raises the quiet window over the page the user is
  // reading, even with focused:false. Placement is /stage or nothing.
  // A helper miss must not become a covering window: an unfocused window that
  // does not overlap the page being read can still host the agent tab.
  if (!(await stageQuietBehind(quietId, bounds, anchor))) {
    const width = Number(current && current.width);
    const height = Number(current && current.height);
    const known = width > 0 && height > 0;
    return !!(known && current && current.focused !== true && current.state !== "minimized" && !quietCoversUserPage(current, anchor));
  }
  let after = null;
  try { after = await chrome.windows.get(quietId); } catch (_) { return false; }
  if (quietCoversUserPage(after, anchor)) return false;
  return true;
}

async function dropQuietWindow(quietId) {
  if (quietId == null) return;
  try { await chrome.windows.remove(quietId); } catch (_) {}
  if (quietCaptureWindowId === quietId) quietCaptureWindowId = null;
  try { await chrome.storage.local.remove("quietCaptureWindowId"); } catch (_) {}
}

async function parkQuietWindow(quietId, anchor) {
  if (quietId == null) return;
  try {
    const tabs = await chrome.tabs.query({ windowId: quietId });
    const occupied = (tabs || []).some((tab) => tab && tab.url && tab.url !== "about:blank");
    const chosen = anchor || quietParkAnchor;
    const bounds = await sunkQuietBounds(quietId, chosen);
    await placeQuietWindow(quietId, bounds, chosen);
    if (!occupied) await rememberQuietWindow(quietId);
  } catch (_) {
    try {
      await chrome.windows.get(quietId);
    } catch (_) {
      if (quietCaptureWindowId === quietId) {
        quietCaptureWindowId = null;
        try { await chrome.storage.local.remove("quietCaptureWindowId"); } catch (_) {}
      }
    }
  }
}

async function parkRememberedQuietWindow() {
  if (captureStage) return;
  const id = await loadQuietWindowId();
  if (id == null) return;
  let anchor = quietParkAnchor;
  if (!anchor) {
    try {
      const wins = await chrome.windows.getAll({ windowTypes: ["normal"] });
      anchor = (wins || []).find((win) => win && Number(win.id) !== Number(id) && Number(win.width) > 800 && Number(win.height) > 500) || null;
    } catch (_) {}
  }
  await parkQuietWindow(id, anchor);
}

function quietStoleFocus() {
  return {
    ok: false,
    error: "background tab screenshot refused without moving the user page: quiet window stole focus",
  };
}

async function ensureQuietCaptureWindow(userWindowId, beforeFocused, beforeActive) {
  await loadQuietWindowId();
  const anchor = await windowAnchor(userWindowId);
  noteQuietAnchor(anchor);
  if (await windowIsQuiet(quietCaptureWindowId, userWindowId, beforeFocused)) {
    try {
      await chrome.windows.get(quietCaptureWindowId);
      if (!(await placeQuietWindow(quietCaptureWindowId, quietStageBounds(anchor), anchor))) return null;
      const nowFocused = await focusedWindowId();
      const nowActive = await activeTabsByWindow();
      if (!userFocusIntact(beforeFocused, beforeActive, userWindowId, nowFocused, nowActive)) {
        await parkQuietWindow(quietCaptureWindowId, anchor);
        await restoreUserFocus(beforeFocused, beforeActive);
        return quietStoleFocus();
      }
      return quietCaptureWindowId;
    } catch (_) {
      quietCaptureWindowId = null;
    }
  }
  const parked = quietVisibleCreateBounds(anchor);
  let win;
  try {
    win = await chrome.windows.create({
      url: "about:blank",
      type: "normal",
      focused: false,
      left: parked.left,
      top: parked.top,
      width: parked.width,
      height: parked.height,
    });
  } catch (e) {
    if (!/bounds|visible screen/i.test(String(e))) throw e;
    const fallback = quietCreateFallbackBounds(anchor);
    win = await chrome.windows.create({
      url: "about:blank",
      type: "normal",
      focused: false,
      left: fallback.left,
      top: fallback.top,
      width: fallback.width,
      height: fallback.height,
    });
  }
  // Create can order the new window over the page being read before focused
  // flips. Do not restack through the helper: that activates the browser.
  if (win && win.id != null) await rememberQuietWindow(win.id);
  const nowFocused = await focusedWindowId();
  const nowActive = await activeTabsByWindow();
  if (!quietCaptureWindowId || !userFocusIntact(beforeFocused, beforeActive, userWindowId, nowFocused, nowActive)) {
    const stole = !userFocusIntact(beforeFocused, beforeActive, userWindowId, nowFocused, nowActive);
    if (quietCaptureWindowId != null) {
      try { await chrome.windows.remove(quietCaptureWindowId); } catch (_) {}
    }
    quietCaptureWindowId = null;
    await restoreUserFocus(beforeFocused, beforeActive);
    return stole ? quietStoleFocus() : null;
  }
  if (!(await placeQuietWindow(quietCaptureWindowId, quietStageBounds(anchor), anchor))) {
    await parkQuietWindow(quietCaptureWindowId, anchor);
    return null;
  }
  const stagedFocused = await focusedWindowId();
  const stagedActive = await activeTabsByWindow();
  if (!userFocusIntact(beforeFocused, beforeActive, userWindowId, stagedFocused, stagedActive)) {
    await parkQuietWindow(quietCaptureWindowId, anchor);
    await restoreUserFocus(beforeFocused, beforeActive);
    return quietStoleFocus();
  }
  return quietCaptureWindowId;
}

async function restoreTabHome(tabId, home) {
  let current;
  try { current = await chrome.tabs.get(tabId); } catch (_) { return; }
  if (Number(current.windowId) !== Number(home.windowId) || Number(current.index) !== Number(home.index)) {
    try { await chrome.tabs.move(tabId, { windowId: home.windowId, index: home.index }); } catch (_) {}
  }
  if (home.groupId == null) return;
  try {
    await chrome.tabs.group({ tabIds: [tabId], groupId: home.groupId });
    await updateRecordedGroup(home.groupId, { collapsed: !!home.collapsed });
  } catch (_) {
    try {
      const created = await chrome.tabs.group({
        tabIds: [tabId],
        createProperties: { windowId: home.windowId },
      });
      await updateRecordedGroup(created, {
        title: home.groupTitle || AGENT_GROUP_TITLE,
        color: home.groupColor || DEFAULT_GROUP_COLOR,
        collapsed: home.collapsed !== false,
      });
    } catch (_) {}
  }
}

async function fitQuietViewport(quietId, tabId, target, beforeFocused, beforeActive, userWindowId) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const nowFocused = await focusedWindowId();
    const nowActive = await activeTabsByWindow();
    if (!userFocusIntact(beforeFocused, beforeActive, userWindowId, nowFocused, nowActive)) {
      return { ok: false, error: "background tab screenshot refused without moving the user page: quiet window stole focus" };
    }
    const snap = await sendToTab(tabId, { type: "vcu_viewport", keep_cursor: true }, 700);
    if (!snap?.ok || !snap.viewport) {
      return { ok: false, error: "background tab screenshot refused without moving the user page: viewport unavailable in quiet window" };
    }
    if (!target) return { ok: true, viewport: snap.viewport, parked: true };
    const drift = viewportDrift(target, snap.viewport, { ignoreRevision: true, ignoreGeometry: true });
    if (drift) {
      return { ok: false, error: "background tab screenshot refused without moving the user page: viewport mismatch " + drift };
    }
    return { ok: true, viewport: snap.viewport, parked: true };
  }
  return { ok: false, error: "background tab screenshot refused without moving the user page: viewport unavailable in quiet window" };
}


async function closeQuietWindow(quietId) {
  await parkQuietWindow(quietId);
}


const IN_PLACE_SCRIPT_MS = 800;

async function runPageScript(tabId, details, timeoutMs) {
  try {
    const injected = await withTimeout(chrome.scripting.executeScript(details), timeoutMs || IN_PLACE_SCRIPT_MS, null);
    if (!injected) return { timeout: true };
    return { timeout: false, result: injected[0] && injected[0].result };
  } catch (e) {
    return { timeout: false, error: String(e) };
  }
}

async function readPageScroll(tabId) {
  const ran = await runPageScript(tabId, {
    target: { tabId },
    world: "MAIN",
    injectImmediately: true,
    func: () => {
      const el = document.scrollingElement || document.documentElement;
      return {
        y: Math.round(window.scrollY || window.pageYOffset || 0),
        top: Math.round((el && el.scrollTop) || 0),
      };
    },
  });
  if (ran.timeout) return { timeout: true, y: null, top: null };
  return ran.result || { y: 0, top: 0 };
}

async function applyPageScroll(tabId, dy) {
  const ran = await runPageScript(tabId, {
    target: { tabId },
    world: "MAIN",
    injectImmediately: true,
    args: [Number(dy) || 0],
    func: (delta) => {
      const el = document.scrollingElement || document.documentElement;
      const before = Math.round(window.scrollY || window.pageYOffset || (el && el.scrollTop) || 0);
      try { window.scrollBy(0, delta); } catch (_) {}
      if (el && Math.round(window.scrollY || el.scrollTop || 0) === before && delta !== 0) {
        try { el.scrollTop = before + delta; } catch (_) {}
      }
      const elAfter = document.scrollingElement || document.documentElement;
      return {
        before,
        y: Math.round(window.scrollY || window.pageYOffset || 0),
        top: Math.round((elAfter && elAfter.scrollTop) || 0),
      };
    },
  });
  if (ran.timeout) return { timeout: true };
  return ran.result || null;
}

function pageScrollMoved(before, after) {
  if (!after) return false;
  const y = Number(after.y);
  return Number.isFinite(y) && y !== before;
}

function injectFailureCanReveal(ready) {
  if (!ready || ready.ok) return false;
  const error = String(ready.error || "");
  return error === "inject timeout"
    || error === "no content script"
    || error === "script timeout"
    || error.indexOf("inject content.js:") === 0;
}

function contentFailureCanReveal(result) {
  if (injectFailureCanReveal(result)) return true;
  if (!result || result.ok) return false;
  return / content timeout$/.test(String(result.error || ""));
}

async function runAgentPageScript(tabId, tab, details) {
  if (!tab || tab.active !== false) {
    const injected = await chrome.scripting.executeScript(details);
    return { ok: true, result: injected && injected[0] ? injected[0].result : null, background_script: false };
  }
  const first = await runPageScript(tabId, details);
  if (!first.timeout && !first.error) return { ok: true, result: first.result, background_script: false };
  if (first.error) return { ok: false, error: "script: " + first.error };
  const beforeActive = await activeTabsByWindow();
  const quiet = await withVisibleAgentTab(tabId, beforeActive, async () => {
    const ran = await runPageScript(tabId, details);
    if (ran.timeout) return { ok: false, error: "script timeout in quiet window" };
    if (ran.error) return { ok: false, error: "script: " + ran.error };
    return { ok: true, result: ran.result, background_script: true };
  });
  await restoreStolenActiveTabs(beforeActive);
  if (quiet && quiet.ok) return Object.assign({ background_action: true }, quiet);
  return quiet || { ok: false, error: "script timeout" };
}

async function readingWindowId(quietId, beforeFocused) {
  if (beforeFocused != null && String(beforeFocused) !== String(quietId)) return beforeFocused;
  try {
    const wins = await chrome.windows.getAll({ windowTypes: ["normal"] });
    const hit = (wins || []).find((win) => win && String(win.id) !== String(quietId) && win.focused)
      || (wins || []).find((win) => win && String(win.id) !== String(quietId) && Number(win.width) > 800)
      || (wins || []).find((win) => win && String(win.id) !== String(quietId));
    if (hit) return hit.id;
  } catch (_) {}
  return beforeFocused;
}

async function withVisibleAgentTab(tabId, beforeActive, fn) {
  const beforeFocused = await focusedWindowId();
  let live;
  try { live = await chrome.tabs.get(tabId); } catch (e) {
    return { ok: false, error: "background action refused without moving the user page: " + String(e) };
  }
  if (live.active) return fn();
  await loadQuietWindowId();
  if (quietCaptureWindowId != null && String(live.windowId) === String(quietCaptureWindowId)) {
    const groupId = groupIdNumber(live.groupId);
    const group = groupId == null ? null : await findGroup(groupId);
    if (!(await mayRelocateToQuietWindow(live, group))) return refuseUserTabRelocation("background action");
    const quietId = live.windowId;
    const userWindowId = await readingWindowId(quietId, beforeFocused);
    const quietActiveBefore = beforeActive && beforeActive.get(String(quietId));
    const wasCollapsed = !group || group.collapsed !== false;
    try {
      if (!(await activateQuietTab(tabId, quietId, userWindowId))) {
        return { ok: false, error: "background action refused without moving the user page: quiet tab stayed inactive" };
      }
      const nowFocused = await focusedWindowId();
      const nowActive = await activeTabsByWindow();
      if (quietFocusIsStolen(nowFocused, quietId) || (userWindowId != null && !userFocusIntact(beforeFocused, beforeActive, userWindowId, nowFocused, nowActive))) {
        return { ok: false, error: "background action refused without moving the user page: quiet window stole focus" };
      }
      return await fn();
    } catch (e) {
      return { ok: false, error: "background action refused without moving the user page: " + String(e) };
    } finally {
      const keepAgentActive = await agentTabShouldRemainActive(quietId, tabId);
      await releaseQuietTabBeforeReturn(tabId, quietId, userWindowId, quietActiveBefore, keepAgentActive);
      // Collapsing the group deactivates its tab on Edge and the next action
      // has to raise the quiet window again. Leave this group as the agent
      // workspace. User groups are never updated here.
      if (groupId != null && wasCollapsed && !keepAgentActive) {
        try { await updateRecordedGroup(groupId, { collapsed: true }); } catch (_) {}
      }
      await restoreUserFocus(beforeFocused, beforeActive);
    }
  }
  return withQuietVisibleTab(tabId, beforeActive, fn);
}

async function captureRevealedInactiveTab(tabId, beforeActive) {
  return withVisibleAgentTab(tabId, beforeActive, async () => {
    const ready = await ensureContent(tabId, 1500, 500);
    if (!ready.ok) return ready;
    const before = await sendToTab(tabId, { type: "vcu_viewport", keep_cursor: true }, 700);
    if (!before?.ok || !before.viewport) {
      return { ok: false, error: "viewport metadata unavailable after quiet activation" };
    }
    const live = await chrome.tabs.get(tabId);
    if (!live.active) {
      return { ok: false, error: "background capture refused without moving the user page: quiet tab stayed inactive" };
    }
    const dataUrl = await captureVisiblePng(live.windowId);
    const after = await sendToTab(tabId, { type: "vcu_viewport", keep_cursor: true }, 700);
    const viewport = after && after.viewport ? after.viewport : before.viewport;
    return {
      ok: !!(dataUrl && viewport),
      dataUrl,
      viewport,
      beforeViewport: before.viewport,
      capture_window_id: String(live.windowId),
      error: dataUrl ? (viewport ? null : "viewport metadata unavailable after quiet activation") : "browser did not return a PNG",
    };
  });
}

async function withQuietVisibleTab(tabId, beforeActive, fn) {
  void beforeActive;
  void fn;
  let live;
  try { live = await chrome.tabs.get(tabId); } catch (e) {
    return { ok: false, error: "background action refused without moving the user page: " + String(e) };
  }
  const groupId = groupIdNumber(live.groupId);
  const group = groupId == null ? null : await findGroup(groupId);
  if (!(await mayRelocateToQuietWindow(live, group))) return refuseUserTabRelocation("background action");
  // chrome.tabs.move shifts the tab strip beside the page being read, and
  // activating the destination window covers that page. Leave the tab in its
  // VCU group.
  return {
    ok: false,
    error: "background action refused without moving the user page: VCU tab stays in its group",
    repair: "work in the VCU tab group; do not move the page being read",
    tab_id: String(tabId),
    os_cursor_used: false,
  };
}

async function deactivateQuietTab(tabId, quietId) {
  const tabs = await chrome.tabs.query({ windowId: quietId });
  const other = (tabs || []).find((tab) => tab && tab.id !== tabId);
  if (!other) return false;
  try { await chrome.tabs.update(other.id, { active: true }); } catch (_) { return false; }
  return true;
}

async function captureInactiveTabInQuietWindow(tabId, beforeActive, targetViewport) {
  const beforeFocused = await focusedWindowId();
  let live;
  try { live = await chrome.tabs.get(tabId); } catch (e) {
    return { ok: false, error: "background tab screenshot refused without moving the user page: " + String(e) };
  }
  const groupId = groupIdNumber(live.groupId);
  const group = groupId == null ? null : await findGroup(groupId);
  if (!(await mayRelocateToQuietWindow(live, group))) return refuseUserTabRelocation("background tab screenshot");
  const userWindowId = live.windowId;
  const home = {
    windowId: live.windowId,
    index: live.index,
    groupId,
    groupTitle: group && (group.title || group.group_title),
    groupColor: group && (group.color || group.group_color),
    collapsed: !group || group.collapsed !== false,
  };
  quietGroupTrace = [];
  let quietId = null;
  try {
    const openedQuiet = await ensureQuietCaptureWindow(userWindowId, beforeFocused, beforeActive);
    if (openedQuiet && openedQuiet.ok === false) return openedQuiet;
    quietId = openedQuiet;
    if (quietId == null) {
      return { ok: false, error: "background tab screenshot refused without moving the user page: quiet window unavailable" };
    }
    try { await chrome.tabs.move(tabId, { windowId: quietId, index: -1 }); } catch (e) {
      return { ok: false, error: "background tab screenshot refused without moving the user page: " + String(e) };
    }
    let movedFocused = await focusedWindowId();
    let movedActive = await activeTabsByWindow();
    if (!userFocusIntact(beforeFocused, beforeActive, userWindowId, movedFocused, movedActive)) {
      await restoreTabHome(tabId, home);
      await keepGroupCollapsed(home.groupId, home.collapsed);
      await dropQuietWindow(quietId);
      await restoreUserFocus(beforeFocused, beforeActive);
      return { ok: false, error: "background tab screenshot refused without moving the user page: quiet window stole focus" };
    }
    // captureVisibleTab reads the active tab of the quiet window. Activate only
    // that tab; if Edge focuses the window, put the user page back and stop.
    try { await chrome.tabs.update(tabId, { active: true }); } catch (e) {
      await deactivateQuietTab(tabId, quietId);
      await restoreTabHome(tabId, home);
      await dropQuietWindow(quietId);
      return { ok: false, error: "background tab screenshot refused without moving the user page: " + String(e) };
    }
    movedFocused = await focusedWindowId();
    movedActive = await activeTabsByWindow();
    if (!userFocusIntact(beforeFocused, beforeActive, userWindowId, movedFocused, movedActive)) {
      await deactivateQuietTab(tabId, quietId);
      await restoreTabHome(tabId, home);
      await keepGroupCollapsed(home.groupId, home.collapsed);
      await dropQuietWindow(quietId);
      await restoreUserFocus(beforeFocused, beforeActive);
      return { ok: false, error: "background tab screenshot refused without moving the user page: quiet window stole focus" };
    }
    const fit = await fitQuietViewport(quietId, tabId, targetViewport, beforeFocused, beforeActive, userWindowId);
    if (!fit.ok) {
      await deactivateQuietTab(tabId, quietId);
      await restoreTabHome(tabId, home);
      await keepGroupCollapsed(home.groupId, home.collapsed);
      await restoreUserFocus(beforeFocused, beforeActive);
      return fit;
    }
    const dataUrl = await captureVisiblePng(quietId);
    const after = await sendToTab(tabId, { type: "vcu_viewport", keep_cursor: true }, 700);
    await deactivateQuietTab(tabId, quietId);
    await restoreTabHome(tabId, home);
    await keepGroupCollapsed(home.groupId, home.collapsed);
    await parkQuietWindow(quietId, await windowAnchor(userWindowId));
    await restoreUserFocus(beforeFocused, beforeActive);
    const settled = after && after.ok && after.viewport ? after : { ok: true, viewport: fit.viewport };
    if (!dataUrl || !settled.viewport) {
      return { ok: false, error: "background tab screenshot refused without moving the user page: browser did not return a PNG" };
    }
    return {
      ok: true,
      dataUrl,
      viewport: settled.viewport,
      settled,
      capture_window_id: String(quietId),
      user_group_expansions: userGroupExpansions(),
      os_cursor_used: false,
    };
  } catch (e) {
    if (quietId != null) {
      try { await deactivateQuietTab(tabId, quietId); } catch (_) {}
      try { await restoreTabHome(tabId, home); } catch (_) {}
    }
    await restoreUserFocus(beforeFocused, beforeActive);
    return { ok: false, error: "background tab screenshot refused without moving the user page: " + String(e) };
  } finally {
    quietGroupTrace = null;
  }
}

function isUserWindowId(id) {
  return id != null && String(id) !== String(agentWindowId);
}

async function parkedQuietWindowId(beforeFocused) {
  await loadQuietWindowId();
  const quietId = quietCaptureWindowId != null ? Number(quietCaptureWindowId) : null;
  if (!Number.isInteger(quietId) || quietId <= 0) return null;
  if (String(quietId) === String(beforeFocused)) return null;
  return quietId;
}

function blankOrExtensionUrl(url) {
  const value = String(url || "");
  return !value || value === "about:blank" || value.startsWith("chrome-extension://") || value.startsWith("edge-extension://");
}

async function tabBelongsToAgentSurface(tab) {
  if (!tab) return false;
  if (blankOrExtensionUrl(tab.url)) return true;
  const groupId = groupIdNumber(tab.groupId);
  if (groupId == null) return false;
  const group = await findGroup(groupId);
  return !!(group && agentGroupTitle(group.title) && !protectedUserGroupTitle(group.title));
}

async function discoverAgentWindowId(beforeFocused) {
  let tabs = [];
  try { tabs = await chrome.tabs.query({}); } catch (_) { return null; }
  const byWindow = new Map();
  for (const tab of tabs || []) {
    if (!tab || tab.windowId == null) continue;
    if (beforeFocused != null && String(tab.windowId) === String(beforeFocused)) continue;
    if (!byWindow.has(tab.windowId)) byWindow.set(tab.windowId, []);
    byWindow.get(tab.windowId).push(tab);
  }
  const found = [];
  for (const [windowId, windowTabs] of byWindow) {
    if (!windowTabs.length) continue;
    let own = true;
    for (const tab of windowTabs) {
      if (!(await tabBelongsToAgentSurface(tab))) {
        own = false;
        break;
      }
    }
    if (!own) continue;
    try {
      const win = await chrome.windows.get(windowId);
      if (!win || win.type === "devtools" || win.type === "popup" || win.focused) continue;
    } catch (_) {
      continue;
    }
    found.push(Number(windowId));
  }
  if (!found.length) return null;
  found.sort((a, b) => a - b);
  return found[0];
}

async function agentWorkWindowId(beforeFocused, beforeActive) {
  const parked = await parkedQuietWindowId(beforeFocused);
  if (parked != null) {
    try {
      const win = await chrome.windows.get(parked);
      if (win && win.type !== "devtools" && win.type !== "popup" && !win.focused) return parked;
    } catch (_) {
      quietCaptureWindowId = null;
      try { await chrome.storage.local.remove("quietCaptureWindowId"); } catch (_) {}
    }
  }
  const discovered = await discoverAgentWindowId(beforeFocused);
  if (discovered != null) {
    await rememberQuietWindow(discovered);
    return discovered;
  }
  const userWindow = beforeFocused != null ? beforeFocused : await userWindowIdForNewTab();
  const created = await ensureQuietCaptureWindow(userWindow, beforeFocused, beforeActive);
  if (created && created.ok === false) {
    return {
      ok: false,
      error: "open refused without moving the page being read: quiet window stole focus",
      os_cursor_used: false,
    };
  }
  if (created == null) {
    return {
      ok: false,
      error: "open refused without moving the page being read: quiet window unavailable",
      os_cursor_used: false,
    };
  }
  return created;
}

async function userWindowIdForNewTab() {
  try {
    const focused = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
    if (focused && isUserWindowId(focused.id)) return focused.id;
  } catch (_) {}
  try {
    const wins = await chrome.windows.getAll({ windowTypes: ["normal"] });
    const hit = (wins || []).find((w) => w && w.focused && isUserWindowId(w.id))
      || (wins || []).find((w) => w && isUserWindowId(w.id));
    if (hit) return hit.id;
  } catch (_) {}
  try {
    const tabs = await chrome.tabs.query({});
    const hit = (tabs || []).find((t) => t && t.focused && isUserWindowId(t.windowId))
      || (tabs || []).find((t) => t && t.active && isUserWindowId(t.windowId))
      || (tabs || []).find((t) => t && isUserWindowId(t.windowId));
    if (hit) return hit.windowId;
  } catch (_) {}
  return null;
}


async function attachDedicatedAgentGroup(tab) {
  if (!tab || tab.id == null || tab.windowId == null) return null;
  if (!chrome.tabs || typeof chrome.tabs.group !== "function") return null;
  if (!chrome.tabGroups || typeof chrome.tabGroups.update !== "function") return null;
  const windowId = tab.windowId;
  let groups = [];
  try { groups = await queryTabGroups(); } catch (_) { groups = []; }
  const existing = groups.find((g) => String(g.window_id) === String(windowId) && g.title === AGENT_GROUP_TITLE);
  try {
    if (existing) {
      const id = groupIdNumber(existing.group_id);
      if (id === null) return null;
      await chrome.tabs.group({ tabIds: [tab.id], groupId: id });
      // Chromium expands a collapsed group when a tab joins it, often again
      // when the tab finishes loading. Collapse after that load.
      await waitTabComplete(tab.id, 1500);
      await keepGroupCollapsed(id, true);
      return id;
    }
    const created = await chrome.tabs.group({
      tabIds: [tab.id],
      createProperties: { windowId },
    });
    await chrome.tabGroups.update(created, {
      title: AGENT_GROUP_TITLE,
      color: DEFAULT_GROUP_COLOR,
      collapsed: true,
    });
    await waitTabComplete(tab.id, 1500);
    await keepGroupCollapsed(created, true);
    return created;
  } catch (_) {
    return null;
  }
}

async function openReloadTab() {
  if (!chrome.runtime || typeof chrome.runtime.getURL !== "function") {
    return { ok: false, error: "reload tab unavailable" };
  }
  const url = chrome.runtime.getURL("reload.html");
  if (!url || url.indexOf("/reload.html") < 0) {
    return { ok: false, error: "reload tab url refused" };
  }
  const beforeActive = await activeTabsByWindow();
  const beforeFocused = await focusedWindowId();
  const windowId = await agentWorkWindowId(beforeFocused, beforeActive);
  if (windowId && windowId.ok === false) return windowId;
  if (windowId == null) {
    return { ok: false, error: "reload tab refused without moving the page being read: quiet window unavailable", os_cursor_used: false };
  }
  let tab;
  try {
    tab = await chrome.tabs.create({ url, active: false, windowId: Number(windowId) });
  } catch (e) {
    return { ok: false, error: "reload tab refused: " + String(e) };
  }
  const replacedReading = !!(tab && tab.active && String(tab.windowId) === String(beforeFocused));
  if (!tab || replacedReading) {
    await restoreStolenActiveTabs(beforeActive);
    if (tab && tab.id != null) {
      try { await chrome.tabs.remove(tab.id); } catch (_) {}
    }
    return { ok: false, error: "reload tab refused because it would replace the current page" };
  }
  const groupId = await attachDedicatedAgentGroup(tab);
  if (groupId != null) {
    try { await chrome.tabGroups.update(groupId, { collapsed: true }); } catch (_) {}
  }
  await restoreStolenActiveTabs(beforeActive);
  let current = tab;
  try { current = await chrome.tabs.get(tab.id); } catch (_) {}
  if (!current || (current.active && String(current.windowId) === String(beforeFocused))) {
    await restoreStolenActiveTabs(beforeActive);
    try { await chrome.tabs.remove(tab.id); } catch (_) {}
    return { ok: false, error: "reload tab refused because it replaced the current page" };
  }
  return {
    ok: true,
    tab_id: String(tab.id),
    active: false,
    url,
    window_id: String(current.windowId),
    group_id: groupId == null ? null : String(groupId),
    background_group: groupId != null,
    activated_user_page: false,
    os_cursor_used: false,
  };
}

async function openExistingAgentTab(params, url) {
  const rawId = params.tab_id;
  if (rawId === undefined || rawId === null || String(rawId).trim() === "") return null;
  const requested = tabIdNumber(rawId);
  if (requested === null) return { ok: false, error: "tab_id must be a nonnegative integer string", os_cursor_used: false };
  if (params.new_window === true || Object.prototype.hasOwnProperty.call(params, "session_name") || Object.prototype.hasOwnProperty.call(params, "group_id")) {
    return { ok: false, error: "tab_id cannot be combined with new_window, session_name, or group_id", os_cursor_used: false };
  }
  const resolved = await resolveHttpTabState(requested);
  if (resolved && resolved.mismatch) return { ok: false, error: "tab not found", tab_id: String(requested), os_cursor_used: false };
  if (!resolved || !resolved.tab) return { ok: false, error: "no injectable http tab", tab_id: String(requested), os_cursor_used: false };
  const beforeActive = await activeTabsByWindow();
  const beforeFocused = await focusedWindowId();
  // The page the user is looking at is never rewritten. Open the requested
  // URL in the quiet VCU group instead, same as navigate.
  if (resolved.tab.focused || pageBeingRead(resolved.tab)) {
    const opened = await openNavigationAwayFromReadingPage(url);
    if (!opened.ok) return opened;
    return {
      ok: true,
      url,
      reused: false,
      released_reading_page: resolved.tab.tab_id,
      tab_id_source: "agent_group",
      tab_id: opened.tab && opened.tab.id != null ? String(opened.tab.id) : null,
      window_id: opened.tab && opened.tab.windowId != null ? String(opened.tab.windowId) : null,
      active: !!(opened.tab && opened.tab.active),
      activated_user_page: false,
      os_cursor_used: false,
      input_path: "extension",
    };
  }
  if (!resolved.tab.agent_surface) {
    return {
      ok: false,
      error: "open refused without changing a user tab; work in the VCU group",
      repair: "omit tab_id so the tab opens in the collapsed VCU group",
      tab_id: resolved.tab.tab_id,
      os_cursor_used: false,
    };
  }
  // Keep an already-active quiet-window tab active. Forcing active:false
  // makes the next action reveal it and raise that window. Never focus it.
  const keepActive = !!resolved.tab.active && (beforeFocused == null || String(resolved.tab.window_id) !== String(beforeFocused));
  try {
    await chrome.tabs.update(resolved.id, { url, active: keepActive });
  } catch (e) {
    return { ok: false, error: "tabs.update:" + String(e), tab_id: String(resolved.id), os_cursor_used: false };
  }
  // Stay inside the 6s open_tab command budget. A slow load is still a
  // successful in-place update; do not open a second tab.
  const settled = await waitTabComplete(resolved.id, 1500);
  const readingTab = beforeFocused == null ? null : beforeActive.get(String(beforeFocused));
  if (readingTab != null && readingTab !== resolved.id) {
    const now = await activeTabsByWindow();
    if (now.get(String(beforeFocused)) !== readingTab) {
      try { await chrome.tabs.update(readingTab, { active: true }); } catch (_) {}
    }
  }
  let current = settled;
  try { current = await chrome.tabs.get(resolved.id); } catch (_) {}
  return {
    ok: true,
    url: (current && current.url) || url,
    status: current && current.status,
    reused: true,
    in_place: true,
    tab_id: String(resolved.id),
    window_id: current && current.windowId != null ? String(current.windowId) : resolved.tab.window_id,
    active: !!(current && current.active),
    activated_user_page: false,
    os_cursor_used: false,
    input_path: "extension",
  };
}

async function openTab(params) {
  const url = params.url || "";
  if (!url || !/^https?:/i.test(url)) return { ok: false, error: "http(s) url required" };
  const reused = await openExistingAgentTab(params, url);
  if (reused) return reused;
  const hasSessionName = Object.prototype.hasOwnProperty.call(params, "session_name");
  const hasGroupId = Object.prototype.hasOwnProperty.call(params, "group_id");
  if (hasSessionName && hasGroupId) return { ok: false, error: "session_name and group_id are mutually exclusive" };
  const sessionName = hasSessionName && params.session_name != null ? String(params.session_name).trim() : "";
  if (hasSessionName && !sessionName) return { ok: false, error: "session_name must be nonempty" };
  // active=true used to switch the user's current tab and focus the window.
  // That is not the Codex tab-group model. Open never replaces that page.
  const active = false;
  const newWindow = params.new_window === true;
  if (params.new_window !== undefined && typeof params.new_window !== "boolean") return { ok: false, error: "new_window must be boolean" };
  if (newWindow && hasGroupId) return { ok: false, error: "new_window and group_id are mutually exclusive" };
  let targetGroup = null;
  let targetGroupId = null;
  if (hasGroupId) {
    if (params.group_id == null || String(params.group_id).trim() === "") return { ok: false, error: "invalid group_id" };
    targetGroupId = groupIdNumber(params.group_id);
    if (targetGroupId === null) return { ok: false, error: "invalid group_id" };
    targetGroup = await findGroup(targetGroupId);
    if (!targetGroup) return { ok: false, error: "group not found" };
    if (protectedUserGroupTitle(targetGroup.title)) {
      return {
        ok: false,
        error: "open refused without moving the page being read: user tab group is reserved",
        repair: "omit group_id so the tab opens in the collapsed VCU group",
        os_cursor_used: false,
      };
    }
    const listed = await listTabsState();
    const reading = (listed.tabs || []).find((tab) => tab.group_id === String(targetGroupId) && pageBeingRead(tab));
    if (reading) return refusePageBeingRead(reading, "open_tab");
  }
  const createInfo = { url, active };
  if (targetGroup) createInfo.windowId = Number(targetGroup.window_id);
  const beforeActive = await activeTabsByWindow();
  const beforeFocused = await focusedWindowId();
  let tab;
  try {
    if (newWindow) {
      const previous = beforeFocused;
      const anchor = await windowAnchor(previous);
      const win = await chrome.windows.create({ url, type: "normal", focused: false });
      await restackUserWindow(anchor || { id: previous }, win && win.id);
      tab = win.tabs?.[0] || (await chrome.tabs.query({ windowId: win.id }))[0];
      if (!tab) return { ok: false, error: "new browser window has no tab", window_id: String(win.id) };
    } else {
      if (createInfo.windowId == null) {
        const quietId = await agentWorkWindowId(beforeFocused, beforeActive);
        if (quietId && quietId.ok === false) return quietId;
        if (quietId == null) return { ok: false, error: "open refused without moving the page being read: quiet window unavailable", os_cursor_used: false };
        tab = await chrome.tabs.create({ url, active: false, windowId: Number(quietId) });
      } else {
        tab = await chrome.tabs.create(createInfo);
      }
    }
    if (sessionName) {
      const createdGroupId = await chrome.tabs.group({ tabIds: [tab.id], createProperties: { windowId: tab.windowId } });
      await chrome.tabGroups.update(createdGroupId, {
        title: sessionName,
        color: DEFAULT_GROUP_COLOR,
        collapsed: true,
      });
      // Remember before load so a late expand is folded back into this group.
      await rememberSessionGroup(createdGroupId, sessionName);
      await waitTabComplete(tab.id, 1500);
      await keepGroupCollapsed(createdGroupId, true);
      await sleep(180);
      await keepGroupCollapsed(createdGroupId, true);
    } else if (targetGroupId !== null) {
      await chrome.tabs.group({ tabIds: [tab.id], groupId: targetGroupId });
      await keepGroupCollapsed(targetGroupId, !targetGroup || targetGroup.collapsed !== false);
    } else {
      await attachDedicatedAgentGroup(tab);
    }
    await restoreUserFocus(beforeFocused, beforeActive);
  } catch (e) {
    await restoreUserFocus(beforeFocused, beforeActive);
    return { ok: false, error: "open tab: " + String(e) };
  }
  let current = tab;
  try { current = await chrome.tabs.get(tab.id); } catch (_) {}
  const homeId = current && beforeActive.get(String(current.windowId));
  if (current && current.active && homeId != null && homeId !== current.id) {
    await restoreStolenActiveTabs(beforeActive);
    try { await chrome.tabs.remove(tab.id); } catch (_) {}
    await restoreStolenActiveTabs(beforeActive);
    return { ok: false, error: "open refused because it replaced the page being read", activated_user_page: false };
  }
  const state = await freshTabsForIds([tab.id]);
  const opened = state.tabs[0] || null;
  const group = opened && opened.group_id
    ? state.groups.find((g) => g.group_id === opened.group_id) || opened.group || null
    : null;
  return tabsResult(state, Object.assign(tabActionState(opened), {
    group,
    url: opened ? (opened.url || url) : url,
    active: !!(current && current.active),
    activated_user_page: false,
  }));
}

async function handleCommand(cmd) {
  try {
    switch (cmd.method) {
      case "capture_tab": {
        const resolved = await resolveHttpTabState(cmd.params?.tab_id);
        if (resolved && resolved.mismatch) return { ok: false, error: "wrong_extension_browser", retryable: true };
        if (!resolved) return { ok: false, error: "screenshot target tab is no longer available; capture again without activating another page" };
        const beforeActive = await activeTabsByWindow();
        const userWindowId = Number(resolved.tab.window_id);
        try {
          const inactive = resolved.tab && resolved.tab.active === false;
          const canDirect = !!(chrome.tabs && typeof chrome.tabs.captureTab === "function");
          const ready = await ensureContent(
            resolved.id,
            inactive && !canDirect ? IN_PLACE_SCRIPT_MS : 1500,
            inactive && !canDirect ? 400 : 500,
          );
          if (!ready.ok) {
            if (!(inactive && !canDirect && injectFailureCanReveal(ready))) return ready;
            // A collapsed VCU tab may not answer until it is active. Capture it
            // in an unfocused window and put it back. A tab that already lives
            // in that window stays there; do not activate the page being read.
            await loadQuietWindowId();
            const alreadyQuiet = quietCaptureWindowId != null && String(resolved.tab.window_id) === String(quietCaptureWindowId);
            const quiet = alreadyQuiet
              ? await captureRevealedInactiveTab(resolved.id, beforeActive)
              : await captureInactiveTabInQuietWindow(resolved.id, beforeActive, null);
            if (!quiet || quiet.ok === false) {
              await restoreStolenActiveTabs(beforeActive);
              return quiet || ready;
            }
            const current = await chrome.tabs.get(resolved.id);
            const stayed = await captureTabStayed(current, resolved);
            if (!stayed) {
              return { ok: false, error: "background capture did not restore the user page: window " + current.windowId + " active " + current.active };
            }
            const viewport = quiet.viewport;
            if (!viewport || current.url !== viewport.url) {
              return { ok: false, error: "page changed during screenshot; capture again: url" };
            }
            if (!quiet.dataUrl || !String(quiet.dataUrl).startsWith("data:image/png;base64,")) {
              return { ok: false, error: quiet.error || "browser did not return a PNG" };
            }
            return {
              ok: true,
              ...tabActionState(resolved.tab),
              viewport,
              png_base64: quiet.dataUrl.split(",")[1],
              source: "extension_viewport",
              os_cursor_used: false,
              capture_window_id: quiet.capture_window_id || String(current.windowId),
              background_capture: true,
              user_group_expansions: quiet.user_group_expansions || 0,
            };
          }
          const before = await sendToTab(resolved.id, { type: "vcu_viewport", keep_cursor: true }, 700);
          if (!before?.ok || !before.viewport) return { ok: false, error: "viewport metadata unavailable; refresh the page" };
          let dataUrl = null;
          let usedDirect = false;
          let quietMove = false;
          let quietKeep = false;
          let quiet = null;
          let captureWindowId = String(userWindowId);
          if (!resolved.tab.active) {
            await loadQuietWindowId();
            const alreadyQuiet = quietCaptureWindowId != null && String(resolved.tab.window_id) === String(quietCaptureWindowId);
            if (alreadyQuiet) {
              quiet = await captureRevealedInactiveTab(resolved.id, beforeActive);
              if (!quiet || quiet.ok === false) return quiet || { ok: false, error: "background capture failed without moving the user page" };
              quietKeep = true;
              dataUrl = quiet.dataUrl;
              captureWindowId = quiet.capture_window_id || captureWindowId;
              usedDirect = !!dataUrl;
            } else if (chrome.tabs && typeof chrome.tabs.captureTab === "function") {
              try {
                dataUrl = await enqueueCapture(() => chrome.tabs.captureTab(resolved.id, { format: "png" }));
                usedDirect = !!dataUrl;
                quietKeep = true;
              } catch (e) {
                return { ok: false, error: "background capture failed without moving the user page: " + String(e) };
              }
            } else {
              quiet = await captureInactiveTabInQuietWindow(resolved.id, beforeActive, before.viewport);
              if (!quiet.ok) return quiet;
              quietMove = true;
              dataUrl = quiet.dataUrl;
              captureWindowId = quiet.capture_window_id || captureWindowId;
              usedDirect = !!dataUrl;
            }
          } else {
            dataUrl = await captureVisiblePng(userWindowId);
          }
          await restoreStolenActiveTabs(beforeActive);
          let after = quietMove ? quiet.settled : await sendToTab(resolved.id, { type: "vcu_viewport", keep_cursor: true }, 700);
          if (!quietMove && (!after?.ok || !after.viewport)) {
            const injected = await injectContent(resolved.id, 1000);
            if (injected.ok) after = await sendToTab(resolved.id, { type: "vcu_viewport", keep_cursor: true }, 700);
          }
          if (quietKeep && (!after?.ok || !after.viewport) && quiet && quiet.viewport) {
            after = { ok: true, viewport: quiet.viewport };
          }
          const current = await chrome.tabs.get(resolved.id);
          const stayed = await captureTabStayed(current, resolved);
          if (!resolved.tab.active && !usedDirect) {
            return { ok: false, error: "background capture failed without moving the user page" };
          }
          if (!stayed) {
            return { ok: false, error: "background capture did not restore the user page: window " + current.windowId + " active " + current.active };
          }
          if (current.url !== before.viewport.url) {
            return { ok: false, error: "page changed during screenshot; capture again: url" };
          }
          if (!after?.ok || !after.viewport) {
            return { ok: false, error: after?.error || "viewport metadata unavailable after background capture" };
          }
          const drift = viewportDrift(before.viewport, after.viewport, quietMove ? { ignoreRevision: true, ignoreGeometry: true } : undefined);
          if (drift) return { ok: false, error: "page changed during screenshot; capture again: " + drift };
          if (!dataUrl?.startsWith("data:image/png;base64,")) return { ok: false, error: "browser did not return a PNG" };
          return {
            ok: true,
            ...tabActionState(resolved.tab),
            viewport: after.viewport,
            png_base64: dataUrl.split(",")[1],
            source: "extension_viewport",
            os_cursor_used: false,
            capture_window_id: captureWindowId,
            background_capture: !resolved.tab.active,
            in_place_capture: !!(usedDirect && !quietMove),
            user_group_expansions: quietMove ? Number(quiet.user_group_expansions || 0) : 0,
          };
        } finally {
          await restoreStolenActiveTabs(beforeActive);
        }
      }
      case "click_point": {
        const resolved = await resolveHttpTabState(cmd.params?.tab_id);
        // The screenshot pins an explicit tab/document. A user switching to
        // another tab must neither retarget the action nor force focus back.
        if (resolved && resolved.mismatch) return { ok: false, error: "wrong_extension_browser", retryable: true };
        if (resolved && resolved.no_agent_tab) return wrongBrowserOrMissing(resolved);
        if (!resolved) return { ok: false, error: "screenshot target tab is no longer available; capture again" };
        const refusedPoint = refusePageBeingRead(resolved.tab, "click", !!cmd.params.dry_run);
        if (refusedPoint) return refusedPoint;
        const result = await actionViaContent(resolved.id, {
          type: "vcu_click_point", x: cmd.params.x, y: cmd.params.y,
          expected_viewport: cmd.params.expected_viewport, dry_run: !!cmd.params.dry_run,
        }, "point click", 1500, 1500, 500);
        return Object.assign(tabActionState(resolved.tab), result);
      }
      case "ensure_agent_window": {
        const id = await ensureAgentWindow();
        if (id == null) {
          return {
            ok: false,
            error: "agent window refused without covering the page being read",
            repair: "reuse the existing VCU tab group; do not create or restack a window",
            window_id: null,
            os_cursor_used: false,
          };
        }
        return { ok: true, window_id: String(id) };
      }
      case "ping":
        return {
          ok: true,
          pong: true,
          ts: Date.now(),
          version: chrome.runtime.getManifest().version,
          quiet_tab_group: true,
          background_reload_tab: true,
          background_capture: !!(chrome.tabs && typeof chrome.tabs.captureTab === "function"),
          quiet_background_capture: true,
          quiet_restack: "window-id",
          quiet_probe: "stage-only",
          quiet_place: "stage-only",
          quiet_stage: "parked-size",
          quiet_group: "keep-collapsed",
          quiet_act: "agent-group",
          quiet_own: "quiet-window",
          quiet_move: "agent-surface",
          quiet_session: "match-title",
          quiet_reading: "never-move",
          quiet_release: "agent-group",
          quiet_nav: "agent-group",
          quiet_work: "ensure-group",
          quiet_implicit: "ensure-group",
          quiet_open: "own-window",
          quiet_open_reuse: "in-place",
          quiet_prefer: "quiet-window",
          quiet_park: "dock-clear",
          quiet_nav_keep: "stay-active",
          quiet_raise: "never",
          quiet_helper: "no-applescript",
          quiet_inject: "in-place",
          quiet_message: "in-place",
          quiet_extract: "document-idle",
          quiet_shot: "quiet-tab-activate",
          quiet_keep: "stay-active",
          quiet_revision_policy: "ignore-move-only",
          capture_apis: Object.keys(chrome.tabs || {}).filter((name) => /capture/i.test(name)),
        };
      case "open_tab": {
        return openTab(cmd.params || {});
      }
      case "open_reload_tab": {
        return openReloadTab();
      }
      case "close_tab": {
        const id = tabIdNumber(cmd.params?.tab_id);
        if (id === null) return { ok: false, error: "an explicit tab_id is required to close a tab" };
        const resolvedClose = await resolveHttpTabState(id);
        const closeMismatch = wrongBrowserOrMissing(resolvedClose);
        if (closeMismatch) return closeMismatch;
        const refusedClose = refusePageBeingRead(resolvedClose.tab, "close_tab");
        if (refusedClose) return refusedClose;
        const tab = await chrome.tabs.get(id);
        await chrome.tabs.remove(id);
        const remaining = await chrome.tabs.query({});
        if (remaining.some(t => t.id === id)) return { ok: false, error: "tab did not close", tab_id: String(id) };
        return { ok: true, closed: true, tab_id: String(id), window_id: String(tab.windowId), source: "extension_tabs", os_cursor_used: false };
      }
      case "reload_self":
        polling = false;
        pollGen += 1;
        setTimeout(() => chrome.runtime.reload(), 50);
        return { ok: true, reloading: true, version: chrome.runtime.getManifest().version };
      case "list_tabs": {
        const state = await listTabsState();
        return tabsResult(state);
      }
      case "select_tab":
        return selectTab(cmd.params || {});
      case "group_tabs":
        return groupTabs(cmd.params || {});
      case "update_group":
        return updateGroup(cmd.params || {});
      case "ungroup_tabs":
        return ungroupTabs(cmd.params || {});
      case "navigate": {
        const tabId = tabIdNumber(cmd.params && cmd.params.tab_id);
        const resolvedNav = await resolveHttpTabState(tabId);
        const navMismatch = wrongBrowserOrMissing(resolvedNav);
        if (navMismatch) return navMismatch;
        if (pageBeingRead(resolvedNav.tab)) {
          const opened = await openNavigationAwayFromReadingPage(cmd.params && cmd.params.url);
          if (!opened.ok) return opened;
          return {
            ok: true,
            url: cmd.params.url,
            status: opened.tab && opened.tab.status,
            released_reading_page: resolvedNav.tab.tab_id,
            tab_id_source: "agent_group",
            tab_id: String(opened.tab.id),
            window_id: opened.tab.windowId != null ? String(opened.tab.windowId) : null,
            activated_user_page: false,
            os_cursor_used: false,
            input_path: "extension",
          };
        }
        const beforeFocused = await focusedWindowId();
        // Keep an already-active quiet tab active. active:false would hand the
        // quiet window back to about:blank and the next action would raise it.
        const keepActive = !!(resolvedNav.tab && resolvedNav.tab.active)
          && (beforeFocused == null || String(resolvedNav.tab.window_id) !== String(beforeFocused));
        try {
          await chrome.tabs.update(resolvedNav.id, { url: cmd.params.url, active: keepActive });
        } catch (e) {
          return { ok: false, error: "tabs.update:" + String(e) };
        }
        const tab = await waitTabComplete(tabId, 8000);
        await sleep(200);
        return { ok: true, url: cmd.params.url, status: tab && tab.status, os_cursor_used: false, input_path: "extension" };
      }
      case "snapshot": {
        const resolvedSnapRaw = await resolveHttpTabState(cmd.params?.tab_id);
        const releasedSnap = await prepareAgentWork(resolvedSnapRaw, "snapshot", false);
        if (releasedSnap.error) return releasedSnap.error;
        const resolvedSnap = releasedSnap.resolved;
        const tabId = resolvedSnap.id;
        const snapScript = await runAgentPageScript(resolvedSnap.id, resolvedSnap.tab, {
          target: { tabId },
          injectImmediately: true,
          func: () => {
            const refs = [];
            let i = 0;
            document.querySelectorAll("a,button,input,textarea,select,h1,h2,h3,h4,li,label,summary,[role]").forEach((el) => {
              if (refs.length >= 120) return;
              const id = "e" + ++i;
              try { el.setAttribute("data-vcu-ref", id); } catch (_) {}
              refs.push({
                ref: id,
                role: el.getAttribute("role") || el.tagName.toLowerCase(),
                name: (el.getAttribute("aria-label") || el.innerText || el.value || "").trim().slice(0, 80),
                selector: el.tagName.toLowerCase() + '[data-vcu-ref="' + id + '"]',
              });
            });
            return {
              a11y_summary: 'document title="' + document.title + '" url="' + location.href + '" nodes=' + refs.length,
              text_excerpt: ((document.body && document.body.innerText) || "").slice(0, 8000),
              dom_refs: refs,
              truncated: false,
              budget_tokens_est: refs.length * 10,
            };
          },
        });
        if (!snapScript.ok) {
          return withReadingPageRelease(Object.assign(tabActionState(resolvedSnap.tab), snapScript), releasedSnap);
        }
        return withReadingPageRelease(Object.assign({
          ok: true,
          background_action: !!snapScript.background_action,
        }, snapScript.result || {}, tabActionState(resolvedSnap.tab)), releasedSnap);
      }
      case "click": {
        const params = cmd.params || {};
        const resolvedRaw = await resolveHttpTabState(params.tab_id);
        const released = await prepareAgentWork(resolvedRaw, "click", !!params.dry_run);
        if (released.error) return released.error;
        const resolved = released.resolved;
        const tabId = resolved.id;
        let selector = params.selector || null;
        if (!selector && params.ref) selector = '[data-vcu-ref="' + params.ref + '"]';
        if (!selector) return { ok: false, error: "click requires selector or ref" };
        const result = await clickViaContent(tabId, selector, !!params.dry_run);
        return withReadingPageRelease(Object.assign(tabActionState(resolved.tab), result || { ok: false, error: "no result" }), released);
      }
      case "hover": {
        const params = cmd.params || {};
        const resolvedRaw = await resolveHttpTabState(params.tab_id);
        const releasedHover = await prepareAgentWork(resolvedRaw, "hover", !!params.dry_run);
        if (releasedHover.error) return releasedHover.error;
        const resolved = releasedHover.resolved;
        let selector = params.selector || null;
        if (!selector && params.ref) selector = '[data-vcu-ref="' + params.ref + '"]';
        if (!selector) return { ok: false, error: "hover requires selector or ref" };
        const result = await actionViaContent(
          resolved.id,
          {
            type: "vcu_hover",
            selector,
            dry_run: !!params.dry_run,
          },
          "hover",
          400,
          900,
          400,
        );
        return withReadingPageRelease(Object.assign(tabActionState(resolved.tab), result || { ok: false, error: "no result" }), releasedHover);
      }
      case "keypress": {
        const resolvedKeyRaw = await resolveHttpTabState(cmd.params?.tab_id);
        const releasedKey = await prepareAgentWork(resolvedKeyRaw, "keypress", false);
        if (releasedKey.error) return releasedKey.error;
        const resolvedKey = releasedKey.resolved;
        const keyed = await runAgentPageScript(resolvedKey.id, resolvedKey.tab, {
          target: { tabId: resolvedKey.id },
          injectImmediately: true,
          func: (key) => {
            const el = document.activeElement || document.body;
            el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
            el.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
            return { ok: true, key, input_path: "extension", os_cursor_used: false };
          },
          args: [cmd.params.key || "Enter"],
        });
        if (!keyed.ok) {
          return withReadingPageRelease(Object.assign(tabActionState(resolvedKey.tab), keyed), releasedKey);
        }
        const result = keyed.result;
        return withReadingPageRelease(Object.assign({
          ok: !result || result.ok !== false,
          background_action: !!keyed.background_action,
        }, tabActionState(resolvedKey.tab), result || {}), releasedKey);
      }
      case "type": {
        const params = cmd.params || {};
        const resolvedRaw = await resolveHttpTabState(params.tab_id);
        const releasedType = await prepareAgentWork(resolvedRaw, "type", !!params.dry_run);
        if (releasedType.error) return releasedType.error;
        const resolved = releasedType.resolved;
        const tabId = resolved.id;
        let selector = params.selector || null;
        if (!selector && params.ref) selector = '[data-vcu-ref="' + params.ref + '"]';
        const result = await typeViaContent(tabId, selector, params.text || "", !!params.dry_run);
        return withReadingPageRelease(Object.assign(tabActionState(resolved.tab), result || { ok: false, error: "no result" }), releasedType);
      }
      case "extract": {
        const params = cmd.params || {};
        const resolved = await resolveHttpTabState(params.tab_id);
        const mismatch = wrongBrowserOrMissing(resolved);
        if (mismatch) return mismatch;
        const result = await extractViaContent(resolved.id, params.selector || "a");
        return Object.assign(tabActionState(resolved.tab), result || { ok: false, error: "no result" });
      }
      case "scroll": {
        const params = cmd.params || {};
        const resolvedRaw = await resolveHttpTabState(params.tab_id);
        const releasedScroll = await prepareAgentWork(resolvedRaw, "scroll", !!params.dry_run);
        if (releasedScroll.error) return releasedScroll.error;
        const resolved = releasedScroll.resolved;
        const tabId = resolved.id;
        const dy = params.dy == null ? 400 : params.dy;
        const beforeActive = await activeTabsByWindow();
        const inactive = resolved.tab && resolved.tab.active === false;
        if (!params.dry_run && inactive) {
          const before = await readPageScroll(tabId);
          const beforeHung = !!(before && before.timeout);
          const start = beforeHung ? null : (Number.isFinite(Number(before.y)) ? Number(before.y) : Number(before.top || 0));
          let moved = beforeHung ? null : await applyPageScroll(tabId, dy);
          const applyHung = !!(moved && moved.timeout);
          let backgroundScroll = false;
          let reportedStart = start;
          const inPlaceOk = !beforeHung && !applyHung && (Number(dy) === 0 || pageScrollMoved(start, moved));
          if (!inPlaceOk) {
            const quiet = await withVisibleAgentTab(tabId, beforeActive, async () => {
              const started = await readPageScroll(tabId);
              if (started && started.timeout) return { ok: false, error: "scroll script timeout in quiet window" };
              const quietStart = Number.isFinite(Number(started.y)) ? Number(started.y) : Number(started.top || 0);
              const applied = await applyPageScroll(tabId, dy);
              if (applied && applied.timeout) return { ok: false, error: "scroll script timeout in quiet window" };
              const changed = Number(dy) === 0 || pageScrollMoved(quietStart, applied);
              return {
                ok: changed,
                applied,
                start: quietStart,
                error: changed ? null : "scroll did not move the page",
              };
            });
            if (quiet && quiet.ok && quiet.applied) {
              moved = quiet.applied;
              reportedStart = quiet.start;
              backgroundScroll = true;
            } else if (quiet && quiet.ok === false) {
              await restoreStolenActiveTabs(beforeActive);
              return withReadingPageRelease(Object.assign(tabActionState(resolved.tab), quiet), releasedScroll);
            }
          }
          await restoreStolenActiveTabs(beforeActive);
          const y = moved && !moved.timeout ? Number(moved.y) : reportedStart;
          const top = moved && !moved.timeout ? Number(moved.top) : reportedStart;
          const changed = pageScrollMoved(reportedStart, moved && !moved.timeout ? moved : null);
          if (Number(dy) !== 0 && !changed) {
            return withReadingPageRelease(Object.assign(tabActionState(resolved.tab), {
              ok: false,
              scrolled: false,
              dy,
              scroll_y: Number.isFinite(y) ? y : start,
              error: "scroll did not move the page",
              source: "extension_dom",
              os_cursor_used: false,
            }), releasedScroll);
          }
          return withReadingPageRelease(Object.assign(tabActionState(resolved.tab), {
            ok: true,
            scrolled: changed,
            dy,
            scroll_y: Number.isFinite(y) ? y : start,
            background_scroll: backgroundScroll,
            source: "extension_dom",
            os_cursor_used: false,
          }), releasedScroll);
        }
        const result = await scrollViaContent(tabId, dy, !!params.dry_run);
        await restoreStolenActiveTabs(beforeActive);
        return withReadingPageRelease(Object.assign(tabActionState(resolved.tab), result || { ok: false, error: "no result" }), releasedScroll);
      }
      case "wait": {
        const ms = Math.min(Math.max(Number(cmd.params.ms) || 100, 0), 15000);
        await sleep(ms);
        return { ok: true, waited_ms: ms, os_cursor_used: false };
      }
      case "screenshot": {
        const dataUrl = await captureVisiblePng(agentWindowId);
        const png_base64 = (dataUrl || "").split(",")[1] || "";
        return { ok: true, png_base64, data_url: dataUrl };
      }
      default:
        return { ok: false, error: "unknown method " + cmd.method };
    }
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}


function agentGroupShouldStayCollapsed(group) {
  if (!group || group.collapsed !== false || Date.now() < agentExpandAllowed) return false;
  const title = String(group.title || "");
  if (protectedUserGroupTitle(title)) return false;
  return agentGroupTitle(title) || sessionGroupTitles.has(String(group.id));
}

if (chrome.tabGroups && chrome.tabGroups.onUpdated && typeof chrome.tabGroups.onUpdated.addListener === "function") {
  chrome.tabGroups.onUpdated.addListener((group) => {
    if (!agentGroupShouldStayCollapsed(group)) return;
    void keepGroupCollapsed(group.id, true);
  });
}
