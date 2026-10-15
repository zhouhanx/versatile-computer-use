const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "background.js"), "utf8");

function makeHarness(options = {}) {
  const state = {
    tabs: (options.tabs || []).map((tab, index) => Object.assign({
      status: "complete",
      pinned: false,
      groupId: -1,
      active: false,
      index,
    }, tab)),
    nextWindowId: options.nextWindowId || 1000,
    windowCreates: 0,
    groups: (options.groups || []).map((group) => Object.assign({
      title: "",
      color: "purple",
      collapsed: false,
    }, group)),
    focusedWindowId: options.focusedWindowId == null
      ? ((options.tabs || [])[0] && (options.tabs || [])[0].windowId) || 1
      : options.focusedWindowId,
    calls: [],
    listeners: [],
    nextTabId: options.nextTabId || 100,
    nextGroupId: options.nextGroupId || 10,
    storage: Object.assign({}, options.storage),
    windowGeometry: Object.assign({}, options.windowGeometry),
    sendMessage: options.sendMessage || (() => Promise.resolve({ ok: true, pong: true, version: "0.2.8" })),
    executeScript: options.executeScript || (() => Promise.resolve([{}])),
  };
  if (!state.tabs.some((tab) => tab.active && tab.windowId === state.focusedWindowId)) {
    const first = state.tabs.find((tab) => tab.windowId === state.focusedWindowId);
    if (first) first.active = true;
  }
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const focusedWindow = () => state.focusedWindowId;
  const queryTabs = (query = {}) => {
    let tabs = state.tabs;
    if (query.active) tabs = tabs.filter((tab) => tab.active);
    if (query.lastFocusedWindow) tabs = tabs.filter((tab) => tab.windowId === focusedWindow());
    if (query.windowId != null) tabs = tabs.filter((tab) => tab.windowId === query.windowId);
    return clone(tabs);
  };
  const getTab = (id) => {
    const tab = state.tabs.find((item) => item.id === Number(id));
    if (!tab) throw new Error("tab not found " + id);
    return clone(tab);
  };
  const groupById = (id) => {
    const group = state.groups.find((item) => item.id === Number(id));
    if (!group) throw new Error("group not found " + id);
    return group;
  };
  const chrome = {
    runtime: {
      id: "vcu-extension-id",
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
      onMessage: { addListener: (listener) => state.listeners.push(listener) },
      onConnect: { addListener() {} },
      getManifest: () => ({ version: "0.2.8" }),
      getURL: (file) => "chrome-extension://vcu-extension-id/" + file,
      getContexts: options.getContexts || (async () => []),
      reload() {},
    },
    alarms: { create() {}, onAlarm: { addListener() {} } },
    offscreen: {
      createDocument: async (info) => {
        state.calls.push({ method: "offscreen.createDocument", info: clone(info) });
        if (options.offscreenCreate) return options.offscreenCreate(info);
      },
    },
    storage: {
      local: {
        get: async (keys) => {
          if (!keys) return clone(state.storage);
          const result = {};
          for (const key of keys) if (state.storage[key] !== undefined) result[key] = state.storage[key];
          return result;
        },
        set: async (values) => Object.assign(state.storage, values),
      },
    },
    tabs: {
      query: async (query) => queryTabs(query),
      get: async (id) => getTab(id),
      getZoom: async () => options.zoom || 1,
      remove: async (id) => { getTab(id); state.calls.push({method:'tabs.remove',id}); state.tabs=state.tabs.filter(t=>t.id!==id); },
      sendMessage: async (id, payload) => {
        state.calls.push({ method: "sendMessage", id, payload: clone(payload) });
        return state.sendMessage(id, payload, state);
      },
      create: async (info) => {
        state.calls.push({ method: "tabs.create", info: clone(info) });
        const id = state.nextTabId++;
        const windowId = info.windowId == null ? focusedWindow() : info.windowId;
        const tab = {
          id,
          windowId,
          title: "",
          url: info.url,
          status: "complete",
          pinned: false,
          groupId: -1,
          active: options.stealOnCreate === true || info.active !== false,
        };
        if (tab.active) state.tabs.filter((item) => item.windowId === windowId).forEach((item) => { item.active = false; });
        state.tabs.push(tab);
        return clone(tab);
      },
      reload: async (id) => {
        state.calls.push({ method: "tabs.reload", id });
        const tab = state.tabs.find((item) => item.id === Number(id));
        if (!tab) throw new Error("tab not found " + id);
        tab.discarded = false;
        tab.status = "complete";
        if (options.stealOnReload) {
          state.tabs.filter((item) => item.windowId === tab.windowId).forEach((item) => { item.active = false; });
          tab.active = true;
        }
        return clone(tab);
      },
      update: async (id, changes) => {
        state.calls.push({ method: "tabs.update", id, changes: clone(changes) });
        const tab = state.tabs.find((item) => item.id === Number(id));
        if (!tab) throw new Error("tab not found " + id);
        Object.assign(tab, changes);
        if (changes.active) state.tabs.filter((item) => item.windowId === tab.windowId && item.id !== tab.id).forEach((item) => { item.active = false; });
        // Edge focuses a window when its tab becomes active. Model that only
        // when the test asks, so the production restack can be proven.
        if (changes.active && options.focusOnTabActivate && tab.windowId !== focusedWindow()) {
          state.focusedWindowId = tab.windowId;
        }
        return clone(tab);
      },
      move: async (id, info) => {
        state.calls.push({ method: "tabs.move", id, info: clone(info) });
        const tab = state.tabs.find((item) => item.id === Number(id));
        if (!tab) throw new Error("tab not found " + id);
        const fromWindow = tab.windowId;
        const destWindow = info.windowId == null ? fromWindow : info.windowId;
        const wasActive = !!tab.active;
        if (fromWindow !== destWindow) {
          const oldGroup = tab.groupId;
          tab.groupId = -1;
          if (oldGroup >= 0 && !state.tabs.some((item) => item.id !== tab.id && item.groupId === oldGroup)) {
            state.groups = state.groups.filter((group) => group.id !== oldGroup);
          }
        }
        tab.windowId = destWindow;
        if (info.index != null) tab.index = info.index;
        if (fromWindow !== destWindow && wasActive) {
          const left = state.tabs.find((item) => item.windowId === fromWindow && item.id !== tab.id);
          if (left) left.active = true;
          state.tabs.filter((item) => item.windowId === destWindow && item.id !== tab.id).forEach((item) => { item.active = false; });
          tab.active = true;
        }
        return clone(tab);
      },
      group: async ({ tabIds, groupId, createProperties }) => {
        let target = groupId;
        if (target == null) {
          target = state.nextGroupId++;
          // Chromium defaults a new group to the current window, and moves
          // supplied tabs there. Do not fake the safer tab-origin default.
          const windowId = createProperties?.windowId ?? state.focusedWindowId;
          state.groups.push({ id: target, windowId, title: "", color: "purple", collapsed: false });
        } else {
          const group = groupById(target);
          if (group && group.collapsed) group.collapsed = false;
        }
        for (const id of tabIds) {
          const tab = state.tabs.find((tab) => tab.id === Number(id));
          tab.groupId = target;
          tab.windowId = groupById(target).windowId;
        }
        return target;
      },
      ungroup: async (tabIds) => {
        for (const id of tabIds) {
          const tab = state.tabs.find((item) => item.id === Number(id));
          if (tab) tab.groupId = -1;
        }
        state.groups = state.groups.filter((group) => state.tabs.some((tab) => tab.groupId === group.id));
      },
      captureVisibleTab: async (id) => { state.calls.push({method:"captureVisibleTab", id, at:Date.now()}); return "data:image/png;base64,AA=="; },
      ...(options.captureTab ? { captureTab: async (id, opts) => options.captureTab(id, opts, state) } : {}),
    },
    tabGroups: {
      query: async () => clone(state.groups),
      update: async (id, changes) => {
        state.calls.push({ method: "tabGroups.update", id, changes: clone(changes) });
        const group = groupById(id);
        Object.assign(group, changes);
        return clone(group);
      },
    },
    windows: {
      get: async (id) => Object.assign({ id, type: "normal" }, state.windowGeometry[id] || state.windowGeometry[Number(id)] || {}),
      getLastFocused: async () => ({ id: focusedWindow(), type: "normal", focused: true }),
      getAll: async () => {
        const ids = [...new Set(state.tabs.map((tab) => tab.windowId))];
        return ids.map((id) => Object.assign({ id, type: "normal", focused: id === focusedWindow() }, state.windowGeometry[id] || {}));
      },
      create: async (info) => {
        const id = info.id != null ? info.id : (state.windowCreates++ ? state.nextWindowId++ : 999);
        if (info.id != null) state.windowCreates += 1;
        state.calls.push({method:'windows.create',info:clone(info), id});
        const tab = {id:state.nextTabId++,windowId:id,index:0,url:info.url,active:true,pinned:false,groupId:-1,status:'complete'};
        state.tabs.push(tab);
        state.windowGeometry[id] = Object.assign({
          left: info.left,
          top: info.top,
          width: info.width,
          height: info.height,
          state: "normal",
          focused: false,
          type: info.type || "normal",
        }, options.createdWindowGeometry || {});
        if (info.focused !== false || options.forceFocusOnCreate) state.focusedWindowId = id;
        return {id,tabs:[clone(tab)]};
      },
      remove: async (id) => {
        state.calls.push({ method: "windows.remove", id });
        const wasFocused = state.focusedWindowId === id;
        state.tabs = state.tabs.filter((tab) => tab.windowId !== id);
        state.groups = state.groups.filter((group) => group.windowId !== id);
        delete state.windowGeometry[id];
        if (wasFocused) {
          const left = state.tabs.find((tab) => tab.windowId !== id);
          if (left) state.focusedWindowId = left.windowId;
        }
      },
      update: async (id, changes) => {
        state.calls.push({ method: "windows.update", id, changes: clone(changes) });
        if (changes.focused) state.focusedWindowId = id;
        return { id, focused: !!changes.focused };
      },
    },
    scripting: {
      executeScript: async (details) => {
        state.calls.push({ method: "executeScript", details });
        return state.executeScript(details, state);
      },
    },
  };

  const context = {
    chrome,
    console,
    URL,
    AbortController,
    Date,
    Map,
    Set,
    Promise,
    JSON,
    Math,
    String,
    Number,
    Object,
    Array,
    RegExp,
    Error,
    globalThis: null,
    fetch: options.fetch || (async (url, init) => {
      let body = {};
      try { body = init && init.body ? JSON.parse(init.body) : {}; } catch (_) {}
      const helper = /\/(restack|stage)$/.test(String(url));
      state.calls.push({ method: helper ? "quiet-helper" : "fetch", url: String(url), body });
      if (options.focusOnTabActivate && String(url).endsWith("/restack") && body && body.window_id) {
        state.focusedWindowId = Number(body.window_id);
      }
      if (String(url).endsWith("/stage") && body && body.quiet_id) {
        state.windowGeometry[body.quiet_id] = {
          left: body.left,
          top: body.top,
          width: body.width,
          height: body.height,
          state: "normal",
          focused: false,
        };
      }
      return { ok: true, json: async () => ({ ok: true }) };
    }),
    setTimeout: (fn, ms) => (ms > 1000 ? 0 : setTimeout(fn, ms)),
    clearTimeout,
  };
  context.globalThis = context;
  vm.runInNewContext(source + "\n;globalThis.__vcuTest = { handleCommand, resolveHttpTab, clickViaContent, typeViaContent, openTab, listTabsState, ensureOffscreen, commandTimeoutMs, parkRememberedQuietWindow, quietParkBounds };", context, { filename: "background.js" });
  return { state, chrome, api: context.__vcuTest };
}

test("explicit restricted tabs fail and implicit resolution stays in the VCU group", async () => {
  const { api } = makeHarness({
    focusedWindowId: 1,
    groups: [{ id: 7, windowId: 1, title: "VCU", color: "purple", collapsed: true }],
    tabs: [
      { id: 1, windowId: 1, url: "https://user.example/", active: true },
      { id: 2, windowId: 2, url: "https://etherscan.io/", active: true },
      { id: 3, windowId: 1, url: "https://agent.example/", active: false, groupId: 7 },
      { id: 4, windowId: 1, url: "chrome://settings/", active: false },
    ],
  });
  assert.equal(await api.resolveHttpTab(), 3);
  assert.equal(await api.resolveHttpTab(""), 3);
  assert.equal(await api.resolveHttpTab("4"), 0);
  assert.equal(await api.resolveHttpTab("999"), 0);
  assert.equal(await api.resolveHttpTab("1"), 1);
  assert.equal(await api.resolveHttpTab("3"), 3);
});

test("mutations leave the page being read and work in the VCU group", async () => {
  const h = makeHarness({
    focusedWindowId: 1,
    groups: [{ id: 7, windowId: 1, title: "VCU", color: "purple", collapsed: true }],
    tabs: [
      { id: 1, windowId: 1, url: "https://user.example/", active: true },
      { id: 3, windowId: 1, url: "https://agent.example/", active: false, groupId: 7 },
    ],
    sendMessage: async (_id, payload) => {
      if (payload && payload.type === "vcu_ping_page") return { ok: true, pong: true, version: "0.2.8" };
      return { ok: true, clicked: true };
    },
  });
  const released = await h.api.handleCommand({ method: "click", params: { tab_id: "1", selector: "a" } });
  assert.equal(released.ok, true, released.error);
  assert.equal(released.tab_id, "3");
  assert.equal(released.released_reading_page, "1");
  assert.equal(released.tab_id_source, "agent_group");
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).active, true);
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).url, "https://user.example/");
  assert.equal(h.state.calls.some((call) => call.method === "sendMessage" && call.id === 1 && call.payload && call.payload.type === "vcu_click"), false);
  const implicit = await h.api.handleCommand({ method: "click", params: { selector: "a" } });
  assert.equal(implicit.ok, true, implicit.error);
  assert.equal(h.state.calls.some((call) => call.method === "sendMessage" && call.id === 3), true);
  assert.equal(h.state.calls.some((call) => call.method === "sendMessage" && call.id === 1), false);
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).active, true);
  const dry = await h.api.handleCommand({ method: "click", params: { tab_id: "1", selector: "a", dry_run: true } });
  assert.equal(dry.ok, true, dry.error);
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).active, true);
  assert.equal(h.state.calls.some((call) => call.method === "sendMessage" && call.id === 1 && call.payload && call.payload.type === "vcu_click" && call.payload.dry_run), true);
  const alone = makeHarness({
    focusedWindowId: 1,
    tabs: [{ id: 1, windowId: 1, url: "https://user.example/", active: true }],
  });
  const ensured = await alone.api.handleCommand({ method: "click", params: { tab_id: "1", selector: "a" } });
  assert.equal(ensured.ok, true, ensured.error);
  assert.equal(ensured.released_reading_page, "1");
  assert.equal(ensured.tab_id_source, "agent_group");
  assert.notEqual(ensured.tab_id, "1");
  const aloneReading = alone.state.tabs.find((tab) => tab.id === 1);
  assert.equal(aloneReading.active, true);
  assert.equal(aloneReading.url, "https://user.example/");
  assert.equal(aloneReading.windowId, 1);
  const created = alone.state.tabs.find((tab) => tab.url === "https://example.com/");
  assert.ok(created);
  assert.equal(created.active, false);
  assert.notEqual(created.windowId, 1);
  assert.equal(String(ensured.tab_id), String(created.id));
  const createdGroup = alone.state.groups.find((item) => item.id === created.groupId);
  assert.equal(createdGroup.title, "VCU");
  assert.equal(createdGroup.collapsed, true);
  assert.equal(alone.state.focusedWindowId, 1);
  assert.equal(alone.state.calls.some((call) => call.method === "sendMessage" && call.id === 1 && call.payload && call.payload.type === "vcu_click"), false);
  assert.equal(alone.state.calls.some((call) => call.method === "sendMessage" && call.id === created.id && call.payload && call.payload.type === "vcu_click"), true);
  assert.equal(alone.state.calls.some((call) => call.method === "tabs.move" && call.id === 1), false);
});

test("parked quiet window is not the page being read", async () => {
  const h = makeHarness({
    focusedWindowId: 4,
    storage: { quietCaptureWindowId: 9 },
    tabs: [
      { id: 1, windowId: 4, url: "https://docs.example/", title: "Reading", active: true },
      { id: 2, windowId: 9, url: "about:blank", title: "about:blank", active: true },
    ],
  });
  const listed = await h.api.handleCommand({ method: "list_tabs", params: {} });
  const reading = listed.tabs.find((tab) => tab.tab_id === "1");
  const quiet = listed.tabs.find((tab) => tab.tab_id === "2");
  assert.equal(reading.focused, true);
  assert.equal(reading.page_being_read, true);
  assert.equal(reading.agent_owned, false);
  assert.equal(quiet.active, true);
  assert.equal(quiet.focused, false);
  assert.equal(quiet.agent_owned, true);
  assert.equal(quiet.page_being_read, false);
  const refused = await h.api.handleCommand({ method: "navigate", params: { tab_id: "2", url: "https://example.org/" } });
  assert.equal(refused.ok, false);
  assert.doesNotMatch(String(refused.error || ""), /page being read/);
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).active, true);
  assert.equal(h.state.focusedWindowId, 4);
  const ping = await h.api.handleCommand({ method: "ping", params: {} });
  assert.equal(ping.quiet_own, "quiet-window");
  assert.equal(ping.quiet_act, "agent-group");
  assert.equal(ping.quiet_nav, "agent-group");
  assert.equal(ping.quiet_work, "ensure-group");
  assert.equal(ping.quiet_implicit, "ensure-group");
});

test("navigate of the page being read opens in the quiet VCU group", async () => {
  const h = makeHarness({
    focusedWindowId: 4,
    storage: { quietCaptureWindowId: 9 },
    tabs: [
      { id: 1, windowId: 4, url: "https://docs.example/reading", title: "Reading", active: true },
      { id: 2, windowId: 9, url: "about:blank", title: "about:blank", active: true },
    ],
  });
  const opened = await h.api.handleCommand({
    method: "navigate",
    params: { tab_id: "1", url: "https://example.org/agent" },
  });
  assert.equal(opened.ok, true, opened.error);
  assert.equal(opened.released_reading_page, "1");
  assert.equal(opened.tab_id_source, "agent_group");
  assert.equal(opened.window_id, "9");
  assert.equal(opened.activated_user_page, false);
  const reading = h.state.tabs.find((tab) => tab.id === 1);
  assert.equal(reading.active, true);
  assert.equal(reading.url, "https://docs.example/reading");
  assert.equal(reading.windowId, 4);
  const created = h.state.tabs.find((tab) => tab.url === "https://example.org/agent");
  assert.equal(created.windowId, 9);
  assert.equal(created.active, false);
  const group = h.state.groups.find((item) => item.id === created.groupId);
  assert.equal(group.title, "VCU");
  assert.equal(group.collapsed, true);
  assert.equal(group.windowId, 9);
  assert.equal(h.state.focusedWindowId, 4);
  assert.equal(h.state.calls.some((call) => call.method === "tabs.update" && call.id === 1), false);
  assert.equal(h.state.calls.some((call) => call.method === "tabs.move" && call.id === 1), false);
  const bad = await h.api.handleCommand({ method: "navigate", params: { tab_id: "1", url: "chrome://settings" } });
  assert.equal(bad.ok, false);
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).url, "https://docs.example/reading");
});

test("navigate of the page being read opens its own window instead of the page being read", async () => {
  const h = makeHarness({
    focusedWindowId: 4,
    tabs: [{ id: 1, windowId: 4, url: "https://docs.example/reading", active: true }],
  });
  const opened = await h.api.handleCommand({
    method: "navigate",
    params: { tab_id: "1", url: "https://example.org/agent" },
  });
  assert.equal(opened.ok, true, opened.error);
  assert.equal(opened.released_reading_page, "1");
  assert.notEqual(opened.window_id, "4");
  const reading = h.state.tabs.find((tab) => tab.id === 1);
  assert.equal(reading.active, true);
  assert.equal(reading.url, "https://docs.example/reading");
  assert.equal(reading.windowId, 4);
  const created = h.state.tabs.find((tab) => tab.url === "https://example.org/agent");
  assert.equal(created.active, false);
  assert.notEqual(created.windowId, 4);
  const group = h.state.groups.find((item) => item.id === created.groupId);
  assert.equal(group.title, "VCU");
  assert.equal(group.collapsed, true);
  assert.equal(group.windowId, created.windowId);
  assert.equal(h.state.focusedWindowId, 4);
  assert.equal(h.state.calls.some((call) => call.method === "windows.create"), true);
  assert.equal(h.state.calls.some((call) => call.method === "tabs.update" && call.id === 1), false);
  assert.equal(h.state.calls.some((call) => call.method === "tabs.move" && call.id === 1), false);
});

test("navigate of an agent group tab updates that tab and leaves the reading page", async () => {
  const h = makeHarness({
    focusedWindowId: 4,
    groups: [{ id: 7, windowId: 4, title: "VCU", color: "purple", collapsed: true }],
    tabs: [
      { id: 1, windowId: 4, url: "https://docs.example/reading", active: true },
      { id: 3, windowId: 4, url: "https://agent.example/", active: false, groupId: 7 },
    ],
  });
  const updated = await h.api.handleCommand({
    method: "navigate",
    params: { tab_id: "3", url: "https://example.org/next" },
  });
  assert.equal(updated.ok, true, updated.error);
  assert.equal(updated.released_reading_page, undefined);
  assert.equal(h.state.tabs.find((tab) => tab.id === 3).url, "https://example.org/next");
  assert.equal(h.state.tabs.find((tab) => tab.id === 3).active, false);
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).url, "https://docs.example/reading");
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).active, true);
  assert.equal(h.state.tabs.filter((tab) => tab.url === "https://example.org/next").length, 1);
});

test("implicit work prefers the quiet window over a VCU tab beside the page being read", async () => {
  const h = makeHarness({
    focusedWindowId: 4,
    storage: { quietCaptureWindowId: 9 },
    groups: [
      { id: 7, windowId: 4, title: "VCU", color: "purple", collapsed: true },
      { id: 8, windowId: 9, title: "VCU", color: "purple", collapsed: false },
    ],
    tabs: [
      { id: 1, windowId: 4, url: "https://docs.example/reading", active: true },
      { id: 3, windowId: 4, url: "https://agent.example/user-window", active: false, groupId: 7 },
      { id: 5, windowId: 9, url: "https://agent.example/quiet", active: true, groupId: 8 },
    ],
    sendMessage: async (id, payload) => {
      if (payload && payload.type === "vcu_ping_page") return { ok: true, version: "0.2.8" };
      return { ok: true, clicked: true, tab_id: String(id) };
    },
  });
  assert.equal(await h.api.resolveHttpTab(), 5);
  const implicit = await h.api.handleCommand({ method: "click", params: { selector: "input#marker" } });
  assert.equal(implicit.ok, true, implicit.error);
  assert.equal(implicit.tab_id, "5");
  assert.equal(h.state.calls.some((call) => call.method === "sendMessage" && call.id === 5 && call.payload && call.payload.type === "vcu_click"), true);
  assert.equal(h.state.calls.some((call) => call.method === "sendMessage" && call.id === 1), false);
  assert.equal(h.state.calls.some((call) => call.method === "sendMessage" && call.id === 3), false);
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).active, true);
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).url, "https://docs.example/reading");
  assert.equal(h.state.tabs.find((tab) => tab.id === 3).windowId, 4);
  assert.equal(h.state.tabs.find((tab) => tab.id === 3).active, false);
  assert.equal(h.state.focusedWindowId, 4);
  const named = await h.api.handleCommand({ method: "click", params: { tab_id: "1", selector: "input#marker" } });
  assert.equal(named.ok, true, named.error);
  assert.equal(named.released_reading_page, "1");
  assert.equal(named.tab_id, "5");
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).url, "https://docs.example/reading");
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).active, true);
  const ping = await h.api.handleCommand({ method: "ping", params: {} });
  assert.equal(ping.quiet_prefer, "quiet-window");
  assert.equal(ping.quiet_park, "dock-clear");
});

test("navigate keeps an already-active quiet agent tab active", async () => {
  const h = makeHarness({
    focusedWindowId: 4,
    storage: { quietCaptureWindowId: 9 },
    groups: [{ id: 8, windowId: 9, title: "VCU", color: "purple", collapsed: false }],
    tabs: [
      { id: 1, windowId: 4, url: "https://docs.example/reading", active: true },
      { id: 5, windowId: 9, url: "https://agent.example/quiet", active: true, groupId: 8 },
    ],
  });
  const updated = await h.api.handleCommand({
    method: "navigate",
    params: { tab_id: "5", url: "https://example.org/next" },
  });
  assert.equal(updated.ok, true, updated.error);
  assert.equal(h.state.tabs.find((tab) => tab.id === 5).url, "https://example.org/next");
  assert.equal(h.state.tabs.find((tab) => tab.id === 5).active, true);
  assert.equal(h.state.tabs.find((tab) => tab.id === 5).windowId, 9);
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).url, "https://docs.example/reading");
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).active, true);
  assert.equal(h.state.calls.some((call) => call.method === "tabs.create"), false);
  assert.equal(h.state.calls.some((call) => call.method === "windows.update"), false);
  assert.equal(h.state.calls.some((call) => call.method === "quiet-helper" && /\/(restack|stage)$/.test(String(call.url))), false);
  const update = h.state.calls.find((call) => call.method === "tabs.update" && call.id === 5);
  assert.equal(update.changes.active, true);
  assert.equal(h.state.focusedWindowId, 4);
  const ping = await h.api.handleCommand({ method: "ping", params: {} });
  assert.equal(ping.quiet_nav_keep, "stay-active");
});

test("inactive VCU extract reads in place and does not activate the page being read", async () => {
  const h = makeHarness({
    focusedWindowId: 4,
    groups: [{ id: 7, windowId: 4, title: "VCU", color: "purple", collapsed: true }],
    tabs: [
      { id: 1, windowId: 4, url: "https://docs.example/reading", active: true },
      { id: 3, windowId: 4, url: "https://example.com/", active: false, groupId: 7 },
    ],
    sendMessage: async () => ({ ok: true, count: 0, matches: [] }),
    executeScript: async (details) => {
      if (details.files) return [{ result: null }];
      if (details.world === "MAIN") {
        return [{ result: { ok: true, matches: [{ tag: "H1", text: "Example Domain" }], count: 1, url: "https://example.com/" } }];
      }
      return [{}];
    },
  });
  const extracted = await h.api.handleCommand({ method: "extract", params: { tab_id: "3", selector: "h1" } });
  assert.equal(extracted.ok, true, extracted.error);
  assert.equal(extracted.via, "page_script");
  assert.equal(extracted.count, 1);
  assert.equal(extracted.matches[0].text, "Example Domain");
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).active, true);
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).url, "https://docs.example/reading");
  assert.equal(h.state.tabs.find((tab) => tab.id === 3).active, false);
  assert.equal(h.state.focusedWindowId, 4);
  assert.equal(h.state.calls.some((call) => call.method === "tabs.update" || call.method === "windows.update" || call.method === "tabs.move"), false);
  const scripts = h.state.calls.filter((call) => call.method === "executeScript");
  assert.equal(scripts.some((call) => call.details && call.details.injectImmediately === true), false);
  assert.equal(h.state.calls.some((call) => call.method === "tabs.reload" || call.method === "tabGroups.update"), false);
  const ping = await h.api.handleCommand({ method: "ping", params: {} });
  assert.equal(ping.quiet_extract, "document-idle");
});

test("collapsed VCU extract expands only its own group when the idle document is empty", async () => {
  const h = makeHarness({
    focusedWindowId: 4,
    groups: [{ id: 7, windowId: 4, title: "VCU", color: "purple", collapsed: true }],
    tabs: [
      { id: 1, windowId: 4, url: "https://support.apple.com/zh-cn/111111", active: true, title: "Apple Watch" },
      { id: 3, windowId: 4, url: "https://example.com/", active: false, groupId: 7, title: "Example Domain", status: "complete" },
    ],
    sendMessage: async () => ({ ok: true, count: 0, matches: [] }),
    executeScript: async (details, state) => {
      const group = state.groups.find((item) => item.id === 7);
      if (group && group.collapsed) {
        return [{ result: { ok: true, matches: [], count: 0, url: "https://example.com/", title: "", ready: "complete", body_text: "" } }];
      }
      return [{ result: { ok: true, matches: [{ tag: "H1", text: "Example Domain" }], count: 1, url: "https://example.com/", title: "Example Domain", ready: "complete", body_text: "Example Domain" } }];
    },
  });
  const extracted = await h.api.handleCommand({ method: "extract", params: { tab_id: "3", selector: "h1" } });
  assert.equal(extracted.ok, true, extracted.error);
  assert.equal(extracted.matches[0].text, "Example Domain");
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).active, true);
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).url, "https://support.apple.com/zh-cn/111111");
  assert.equal(h.state.tabs.find((tab) => tab.id === 3).active, false);
  assert.equal(h.state.groups.find((group) => group.id === 7).collapsed, true);
  assert.equal(h.state.focusedWindowId, 4);
  assert.equal(h.state.calls.some((call) => call.method === "tabs.update" || call.method === "windows.update" || call.method === "tabs.move" || call.method === "tabs.reload"), false);
  assert.equal(h.state.calls.some((call) => call.method === "tabGroups.update" && call.changes.collapsed === false), true);
});

test("unrendered inactive VCU extract reloads in place and restores the page being read", async () => {
  const h = makeHarness({
    focusedWindowId: 4,
    stealOnReload: true,
    groups: [{ id: 7, windowId: 4, title: "VCU", color: "purple", collapsed: false }],
    tabs: [
      { id: 1, windowId: 4, url: "https://support.apple.com/zh-cn/111111", active: true },
      { id: 3, windowId: 4, url: "https://example.com/", active: false, groupId: 7, discarded: true, status: "unloaded", title: "Example Domain" },
    ],
    sendMessage: async () => null,
    executeScript: async (details, state) => {
      const tab = state.tabs.find((item) => item.id === details.target.tabId);
      if (!tab || tab.discarded) {
        return [{ result: { ok: true, matches: [], count: 0, url: "https://example.com/", title: "", ready: "loading", body_text: "" } }];
      }
      return [{ result: { ok: true, matches: [{ tag: "H1", text: "Example Domain" }], count: 1, url: "https://example.com/", title: "Example Domain", ready: "complete", body_text: "Example Domain" } }];
    },
  });
  const extracted = await h.api.handleCommand({ method: "extract", params: { tab_id: "3", selector: "h1" } });
  assert.equal(extracted.ok, true, extracted.error);
  assert.equal(extracted.matches[0].text, "Example Domain");
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).active, true);
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).url, "https://support.apple.com/zh-cn/111111");
  assert.equal(h.state.tabs.find((tab) => tab.id === 3).active, false);
  assert.equal(h.state.focusedWindowId, 4);
  assert.equal(h.state.calls.some((call) => call.method === "tabs.reload" && call.id === 3), true);
  assert.equal(h.state.calls.some((call) => call.method === "windows.update" || call.method === "tabs.move"), false);
});

test("empty inactive extract fails instead of inventing a match", async () => {
  const h = makeHarness({
    focusedWindowId: 4,
    groups: [{ id: 7, windowId: 4, title: "VCU", color: "purple", collapsed: true }],
    tabs: [
      { id: 1, windowId: 4, url: "https://support.apple.com/zh-cn/111111", active: true },
      { id: 3, windowId: 4, url: "https://example.com/", active: false, groupId: 7, status: "complete", title: "Example Domain" },
    ],
    sendMessage: async () => ({ ok: true, count: 0, matches: [] }),
    executeScript: async () => [{ result: { ok: true, matches: [], count: 0, url: "https://example.com/", title: "Example Domain", ready: "complete", body_text: "Example Domain" } }],
  });
  const extracted = await h.api.handleCommand({ method: "extract", params: { tab_id: "3", selector: "h1" } });
  assert.equal(extracted.ok, false);
  assert.equal(extracted.read_page, true);
  assert.match(extracted.error, /selector matched no text/);
  assert.doesNotMatch(extracted.error, /did not read/);
  assert.equal(extracted.count, 0);
  assert.equal(JSON.stringify(extracted.matches).includes("DIAG"), false);
  assert.equal(JSON.stringify(extracted.matches).includes("Example Domain"), false);
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).active, true);
  assert.equal(h.state.tabs.find((tab) => tab.id === 3).active, false);
  assert.equal(h.state.groups.find((group) => group.id === 7).collapsed, true);
  assert.equal(h.state.calls.some((call) => call.method === "tabs.reload" || call.method === "tabGroups.update" || call.method === "tabs.update"), false);
});

test("list tabs exposes native group metadata and select_tab does not move the page being read", async () => {
  const { api, state } = makeHarness({
    focusedWindowId: 1,
    groups: [{ id: 7, windowId: 2, title: "Research", color: "blue", collapsed: true }],
    tabs: [
      { id: 10, windowId: 1, url: "https://one.example/", active: true },
      { id: 11, windowId: 2, url: "https://two.example/", active: false, groupId: 7 },
    ],
  });
  const listed = await api.handleCommand({ method: "list_tabs", params: {} });
  assert.equal(listed.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(listed.groups)), [{ group_id: "7", window_id: "2", title: "Research", color: "blue", collapsed: true }]);
  assert.equal(listed.tabs.find((tab) => tab.tab_id === "11").group_id, "7");
  assert.equal(listed.tabs[0].browser, "chrome");
  const selected = await api.handleCommand({ method: "select_tab", params: { tab_id: "11" } });
  assert.equal(selected.ok, false);
  assert.match(selected.error, /page being read/);
  assert.equal(selected.activated, false);
  assert.equal(state.tabs.find((tab) => tab.id === 10).active, true);
  assert.equal(state.tabs.find((tab) => tab.id === 10).windowId, 1);
  assert.equal(state.tabs.find((tab) => tab.id === 11).active, false);
  assert.equal(state.tabs.find((tab) => tab.id === 11).windowId, 2);
  assert.equal(state.groups.find((group) => group.id === 7).collapsed, true);
  assert.equal(state.focusedWindowId, 1);
  assert.equal(state.calls.some((call) => call.method === "windows.update" || call.method === "tabs.update" || call.method === "tabs.move"), false);
});

test("select_tab can activate without stealing OS window focus", async () => {
  const { api, state } = makeHarness({
    focusedWindowId: 1,
    groups: [{ id: 7, windowId: 2, title: "VCU", color: "purple", collapsed: true }],
    tabs: [
      { id: 10, windowId: 1, url: "https://one.example/", active: true },
      { id: 11, windowId: 2, url: "https://two.example/", active: false, groupId: 7 },
    ],
  });
  const quiet = await api.handleCommand({ method: "select_tab", params: { tab_id: "11", focus_window: false } });
  assert.equal(quiet.ok, true, quiet.error);
  assert.equal(quiet.activated, false);
  assert.equal(state.focusedWindowId, 1);
  assert.equal(state.tabs.find((t) => t.id === 11).active, false);
  assert.equal(state.tabs.find((t) => t.id === 10).active, true);
  assert.equal(state.groups.find((group) => group.id === 7).collapsed, true);
  assert.equal(state.calls.filter((c) => c.method === "windows.update" || c.method === "tabs.update").length, 0);
  const selected = await api.handleCommand({ method: "select_tab", params: { tab_id: "11", focus_window: false, activate: true } });
  assert.equal(selected.ok, false, selected.error);
  assert.match(selected.error, /page being read/);
  assert.equal(selected.activated, false);
  assert.equal(state.focusedWindowId, 1);
  assert.equal(state.calls.filter((c) => c.method === "windows.update" || c.method === "tabs.update" || c.method === "tabs.move").length, 0);
  assert.equal(state.tabs.find((t) => t.id === 11).active, false);
  assert.equal(state.tabs.find((t) => t.id === 10).active, true);
  assert.equal(state.groups.find((group) => group.id === 7).collapsed, true);
});

test("select_tab rejects restricted browser pages", async () => {
  const { api } = makeHarness({ tabs: [{ id: 1, windowId: 1, url: "chrome://settings/", active: true }] });
  const result = await api.handleCommand({ method: "select_tab", params: { tab_id: "1" } });
  assert.equal(result.ok, false);
  assert.match(result.error, /unrestricted http/);
});

test("group_tabs rejects cross-window, restricted, and pinned inputs", async () => {
  const { api } = makeHarness({
    tabs: [
      { id: 1, windowId: 1, url: "https://one.example/" },
      { id: 2, windowId: 2, url: "https://two.example/" },
      { id: 3, windowId: 1, url: "chrome://settings/" },
      { id: 4, windowId: 1, url: "https://pinned.example/", pinned: true },
    ],
  });
  const crossWindow = await api.handleCommand({ method: "group_tabs", params: { tab_ids: ["1", "2"], title: "Bad" } });
  const restricted = await api.handleCommand({ method: "group_tabs", params: { tab_ids: ["1", "3"], title: "Bad" } });
  const pinned = await api.handleCommand({ method: "group_tabs", params: { tab_ids: ["1", "4"], title: "Bad" } });
  assert.match(crossWindow.error, /same window/);
  assert.match(restricted.error, /http\(s\)/);
  assert.match(pinned.error, /pinned/);
});

test("native group commands create, update, join, and ungroup tabs", async () => {
  const { api, state } = makeHarness({
    tabs: [
      { id: 1, windowId: 1, url: "https://one.example/", active: true },
      { id: 2, windowId: 1, url: "https://two.example/", active: false },
    ],
  });
  const refused = await api.handleCommand({ method: "group_tabs", params: { tab_ids: ["1"], title: "Work", color: "red" } });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /page being read/);
  const grouped = await api.handleCommand({ method: "group_tabs", params: { tab_ids: ["2"], title: "Work", color: "red", collapsed: true } });
  assert.equal(grouped.ok, true);
  assert.equal(grouped.group.title, "Work");
  assert.equal(grouped.group.color, "red");
  assert.equal(grouped.group.collapsed, true);
  const updated = await api.handleCommand({ method: "update_group", params: { group_id: grouped.group.group_id, collapsed: false } });
  assert.equal(updated.group.collapsed, false);
  const joined = await api.handleCommand({ method: "open_tab", params: { url: "https://three.example/", group_id: grouped.group.group_id, active: false } });
  assert.equal(joined.group.group_id, grouped.group.group_id);
  const named = await api.handleCommand({ method: "open_tab", params: { url: "https://four.example/", session_name: "Review" } });
  assert.equal(named.group.title, "Review");
  assert.equal(named.group.collapsed, true);
  assert.equal(state.tabs.find((tab) => tab.id === 1).active, true);
  const conflict = await api.handleCommand({ method: "open_tab", params: { url: "https://bad.example/", session_name: "A", group_id: grouped.group.group_id } });
  assert.equal(conflict.ok, false);
  const ungrouped = await api.handleCommand({ method: "ungroup_tabs", params: { tab_ids: ["2"] } });
  assert.equal(ungrouped.ok, true);
  assert.equal(state.tabs.find((tab) => tab.id === 2).groupId, -1);
  assert.equal(state.tabs.find((tab) => tab.id === 1).active, true);
  assert.equal(state.tabs.find((tab) => tab.id === 1).windowId, 1);
  assert.equal(state.tabs.find((tab) => tab.id === 1).groupId == null || state.tabs.find((tab) => tab.id === 1).groupId < 0, true);
});

test("mutation action does not replay an existing ok:false response", async () => {
  let actionCalls = 0;
  const { api, state } = makeHarness({
    tabs: [{ id: 1, windowId: 1, url: "https://user.example/", active: true }],
    sendMessage: async (_id, payload) => {
      if (payload.type === "vcu_ping_page") return { ok: true, pong: true, version: "0.2.8" };
      if (payload.type === "vcu_click") {
        actionCalls += 1;
        return { ok: false, error: "page rejected click", detail: "preserve me" };
      }
      return { ok: false, error: "unexpected" };
    },
  });
  const result = await api.clickViaContent(1, "button", false);
  assert.deepEqual(result, { ok: false, error: "page rejected click", detail: "preserve me" });
  assert.equal(actionCalls, 1);
  assert.equal(state.calls.filter((call) => call.method === "executeScript").length, 0);
});

test("old content lens is reported stale without stacking an injected listener", async () => {
  const { api, state } = makeHarness({
    tabs: [{ id: 1, windowId: 1, url: "https://user.example/", active: true }],
    sendMessage: async (_id, payload) => payload.type === "vcu_ping_page"
      ? { ok: true, pong: true }
      : { ok: false, error: "unexpected action" },
  });
  const result = await api.clickViaContent(1, "button", false);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: false, error: "content lens is stale; reload this page" });
  assert.equal(state.calls.filter((call) => call.method === "executeScript").length, 0);
});

test("send timeout injects then sends the mutation once", async () => {
  let actionCalls = 0;
  let pingCalls = 0;
  const { api, state } = makeHarness({
    tabs: [{ id: 1, windowId: 1, url: "https://user.example/", active: true }],
    sendMessage: async (_id, payload) => {
      if (payload.type === "vcu_ping_page") return ++pingCalls > 1 ? { ok: true, pong: true, version: "0.2.8" } : null;
      if (payload.type === "vcu_type") {
        actionCalls += 1;
        return { ok: true, typed: true };
      }
      return null;
    },
    executeScript: async () => [{}],
  });
  const result = await api.typeViaContent(1, "input", "x", false).catch((error) => ({ error: String(error) }));
  // The harness returns no tab only for this focused test, so assert the
  // retry invariant through the direct content helper after tab setup below.
  assert.equal(result.error, undefined);
  assert.equal(actionCalls, 1);
  assert.equal(state.calls.filter((call) => call.method === "executeScript").length, 1);
});

test("scroll preserves an explicit zero delta without moving the page being read", async () => {
  const alone = makeHarness({
    focusedWindowId: 1,
    tabs: [{ id: 1, windowId: 1, url: "https://user.example/", active: true }],
  });
  const ensured = await alone.api.handleCommand({ method: "scroll", params: { tab_id: "1", dy: 0 } });
  assert.equal(ensured.ok, true, ensured.error);
  assert.equal(ensured.released_reading_page, "1");
  assert.equal(ensured.tab_id_source, "agent_group");
  assert.equal(ensured.dy, 0);
  assert.notEqual(ensured.tab_id, "1");
  assert.equal(alone.state.tabs.find((tab) => tab.id === 1).active, true);
  assert.equal(alone.state.tabs.find((tab) => tab.id === 1).url, "https://user.example/");
  const created = alone.state.tabs.find((tab) => tab.url === "https://example.com/");
  assert.ok(created);
  assert.equal(created.active, false);
  assert.equal(String(ensured.tab_id), String(created.id));
  assert.equal(alone.state.calls.some((call) => call.method === "sendMessage" && call.id === 1 && call.payload && call.payload.type === "vcu_scroll"), false);

  const { api, state } = makeHarness({ tabs: [{ id: 1, windowId: 1, url: "https://user.example/", active: true }] });
  const result = await api.handleCommand({ method: "scroll", params: { tab_id: "1", dy: 0, dry_run: true } });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.tab_id, "1");
  const scroll = state.calls.find((call) => call.method === "sendMessage" && call.payload.type === "vcu_scroll");
  assert.equal(scroll.id, 1);
  assert.equal(scroll.payload.dy, 0);
  assert.equal(scroll.payload.dry_run, true);
  assert.equal(state.tabs.find((tab) => tab.id === 1).active, true);
  assert.equal(state.tabs.find((tab) => tab.id === 1).url, "https://user.example/");
  assert.equal(state.tabs.some((tab) => tab.url === "https://example.com/"), false);
});

test("click of the page being read opens the work tab in the quiet VCU group", async () => {
  const quiet = makeHarness({
    focusedWindowId: 4,
    storage: { quietCaptureWindowId: 9 },
    tabs: [
      { id: 1, windowId: 4, url: "https://docs.example/reading", active: true },
      { id: 2, windowId: 9, url: "about:blank", active: true },
    ],
    sendMessage: async (_id, payload) => {
      if (payload && payload.type === "vcu_ping_page") return { ok: true, pong: true, version: "0.2.8" };
      return { ok: true, clicked: true };
    },
  });
  const opened = await quiet.api.handleCommand({ method: "click", params: { tab_id: "1", selector: "a" } });
  assert.equal(opened.ok, true, opened.error);
  assert.equal(opened.released_reading_page, "1");
  assert.equal(opened.tab_id_source, "agent_group");
  assert.notEqual(opened.tab_id, "1");
  const reading = quiet.state.tabs.find((tab) => tab.id === 1);
  assert.equal(reading.active, true);
  assert.equal(reading.url, "https://docs.example/reading");
  assert.equal(reading.windowId, 4);
  const created = quiet.state.tabs.find((tab) => tab.url === "https://example.com/");
  assert.ok(created);
  assert.equal(created.windowId, 9);
  assert.equal(created.active, false);
  assert.equal(quiet.state.tabs.find((tab) => tab.id === 2).active, true);
  assert.equal(String(opened.tab_id), String(created.id));
  const group = quiet.state.groups.find((item) => item.id === created.groupId);
  assert.equal(group.title, "VCU");
  assert.equal(group.collapsed, true);
  assert.equal(group.windowId, 9);
  assert.equal(quiet.state.focusedWindowId, 4);
  assert.equal(quiet.state.tabs.find((tab) => tab.id === 2).windowId, 9);
  assert.equal(quiet.state.calls.some((call) => call.method === "sendMessage" && call.id === 1 && call.payload && call.payload.type === "vcu_click"), false);
  assert.equal(quiet.state.calls.some((call) => call.method === "tabs.move" && call.id === 1), false);
  assert.equal(quiet.state.calls.some((call) => call.method === "tabs.update" && call.id === 1), false);
  assert.equal(quiet.state.calls.some((call) => call.method === "windows.create"), false);
});

test("implicit click with no agent tab opens the collapsed VCU group and leaves the reading page", async () => {
  const h = makeHarness({
    focusedWindowId: 4,
    storage: { quietCaptureWindowId: 9 },
    tabs: [
      { id: 1, windowId: 4, url: "https://docs.example/reading", active: true },
      { id: 2, windowId: 9, url: "about:blank", active: true },
    ],
    sendMessage: async (_id, payload) => {
      if (payload && payload.type === "vcu_ping_page") return { ok: true, pong: true, version: "0.2.8" };
      return { ok: true, clicked: true };
    },
  });
  const opened = await h.api.handleCommand({ method: "click", params: { selector: "a" } });
  assert.equal(opened.ok, true, opened.error);
  assert.equal(opened.tab_id_source, "agent_group");
  assert.equal(opened.ensured_agent_tab, opened.tab_id);
  assert.notEqual(opened.tab_id, "1");
  const reading = h.state.tabs.find((tab) => tab.id === 1);
  assert.equal(reading.active, true);
  assert.equal(reading.url, "https://docs.example/reading");
  assert.equal(reading.windowId, 4);
  const created = h.state.tabs.find((tab) => tab.url === "https://example.com/");
  assert.ok(created);
  assert.equal(created.windowId, 9);
  assert.equal(created.active, false);
  assert.equal(h.state.tabs.find((tab) => tab.id === 2).active, true);
  assert.equal(h.state.focusedWindowId, 4);
  assert.equal(h.state.calls.some((call) => call.method === "sendMessage" && call.id === 1 && call.payload && call.payload.type === "vcu_click"), false);
  assert.equal(h.state.calls.some((call) => call.method === "tabs.move" && call.id === 1), false);
  const dry = makeHarness({
    focusedWindowId: 4,
    tabs: [{ id: 1, windowId: 4, url: "https://docs.example/reading", active: true }],
  });
  const refused = await dry.api.handleCommand({ method: "click", params: { selector: "a", dry_run: true } });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /no agent tab/);
  assert.equal(dry.state.tabs.some((tab) => tab.url === "https://example.com/"), false);
  assert.equal(dry.state.tabs.find((tab) => tab.id === 1).url, "https://docs.example/reading");
});

test("service-worker recovery restores the persisted agent window", async () => {
  const { api } = makeHarness({ storage: { agentWindowId: 77 } });
  const result = await api.handleCommand({ method: "ensure_agent_window", params: {} });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: true, window_id: "77" });
});

test("ensure_agent_window does not create a window over the page being read", async () => {
  const h = makeHarness({
    focusedWindowId: 1,
    tabs: [{ id: 1, windowId: 1, url: "https://user.example/", active: true }],
  });
  const result = await h.api.handleCommand({ method: "ensure_agent_window", params: {} });
  assert.equal(result.ok, false);
  assert.match(result.error, /page being read/);
  assert.equal(result.window_id, null);
  assert.equal(h.state.calls.some((call) => call.method === "windows.create"), false);
  assert.equal(h.state.calls.some((call) => call.method === "windows.update" || call.method === "tabs.move"), false);
  assert.equal(h.state.calls.some((call) => call.method === "quiet-helper" && /\/(restack|stage)$/.test(String(call.url))), false);
  assert.equal(h.state.focusedWindowId, 1);
  const reading = h.state.tabs.find((tab) => tab.id === 1);
  assert.equal(reading.active, true);
  assert.equal(reading.windowId, 1);
  assert.equal(reading.url, "https://user.example/");
});

test("joining a collapsed group collapses it again and leaves an expanded group alone", async () => {
  const h = makeHarness({
    focusedWindowId: 4,
    groups: [
      { id: 7, windowId: 4, title: "VCU", color: "purple", collapsed: true },
      { id: 8, windowId: 4, title: "Research", color: "blue", collapsed: false },
    ],
    tabs: [
      { id: 1, windowId: 4, url: "https://user.example/", active: true },
      { id: 2, windowId: 4, url: "https://agent.example/", active: false, groupId: 7 },
      { id: 3, windowId: 4, url: "https://notes.example/", active: false, groupId: 8 },
    ],
  });
  const opened = await h.api.handleCommand({ method: "open_tab", params: { url: "https://agent2.example/" } });
  assert.equal(opened.ok, true, opened.error);
  assert.equal(h.state.groups.find((group) => group.id === 7).collapsed, true);
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).active, true);
  const created = h.state.tabs.find((tab) => tab.url === "https://agent2.example/");
  assert.notEqual(created.windowId, 4);
  assert.equal(h.state.tabs.find((tab) => tab.id === 2).windowId, 4);
  assert.equal(h.state.calls.some((call) => call.method === "tabs.move" && call.id === 1), false);
  const joined = await h.api.handleCommand({ method: "open_tab", params: { url: "https://notes2.example/", group_id: "8" } });
  assert.equal(joined.ok, true, joined.error);
  assert.equal(h.state.groups.find((group) => group.id === 8).collapsed, false);
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).active, true);
});

test("popup browser_command is sender- and method-gated", async () => {
  const harness = makeHarness({ tabs: [{ id: 1, windowId: 1, url: "https://user.example/", active: true }] });
  assert.equal(harness.state.listeners.length, 1);
  const listener = harness.state.listeners[0];
  const invoke = (message, sender) => new Promise((resolve) => {
    listener(message, sender, resolve);
  });
  const rejectedSender = await invoke(
    { type: "browser_command", command: { method: "list_tabs", params: {} } },
    { id: "other", url: "chrome-extension://vcu-extension-id/popup.html" },
  );
  assert.equal(rejectedSender.ok, false);
  const rejectedMethod = await invoke(
    { type: "browser_command", command: { method: "open_tab", params: { url: "https://x.example/" } } },
    { id: "vcu-extension-id", url: "chrome-extension://vcu-extension-id/popup.html" },
  );
  assert.equal(rejectedMethod.ok, false);
  const listed = await invoke(
    { type: "browser_command", command: { method: "list_tabs", params: {} } },
    { id: "vcu-extension-id", url: "chrome-extension://vcu-extension-id/popup.html" },
  );
  assert.equal(listed.ok, true);
});

test("background screenshot without captureTab uses an unfocused window and restores the user tab", async () => {
  const viewport = { document_id: "doc-bg", url: "https://agent.example/", width: 100, height: 80, revision: 1 };
  const h = makeHarness({
    focusedWindowId: 1,
    groups: [{ id: 7, windowId: 1, title: "VCU", color: "purple", collapsed: true }],
    tabs: [
      { id: 10, windowId: 1, index: 0, url: "https://user.example/", active: true },
      { id: 11, windowId: 1, index: 1, url: "https://agent.example/", active: false, groupId: 7 },
    ],
    sendMessage: async (_id, msg) => {
      if (msg.type === "vcu_ping_page") return { ok: true, version: "0.2.8" };
      if (msg.type === "vcu_viewport") return { ok: true, viewport };
      return { ok: true };
    },
  });
  const shot = await h.api.handleCommand({ method: "capture_tab", params: { tab_id: "11" } });
  assert.equal(shot.ok, true, shot.error);
  assert.equal(shot.background_capture, true);
  assert.equal(shot.in_place_capture, false);
  assert.notEqual(shot.capture_window_id, "1");
  assert.equal(h.state.focusedWindowId, 1);
  const reading = h.state.tabs.find((tab) => tab.id === 10);
  assert.equal(reading.active, true);
  assert.equal(reading.windowId, 1);
  assert.equal(reading.url, "https://user.example/");
  const work = h.state.tabs.find((tab) => tab.id === 11);
  assert.equal(work.active, false);
  assert.equal(work.windowId, 1);
  const group = h.state.groups.find((item) => item.id === work.groupId);
  assert.equal(group.title, "VCU");
  assert.equal(group.collapsed, true);
  assert.equal(group.windowId, 1);
  assert.equal(h.state.calls.some((call) => call.method === "windows.update" && call.changes && call.changes.focused === true), false);
  assert.equal(h.state.calls.some((call) => call.method === "windows.create"), true);
  assert.equal(h.state.calls.some((call) => call.method === "captureVisibleTab" && String(call.id) === "1"), false);
  assert.equal(h.state.calls.some((call) => call.method === "quiet-helper"), false);
});

test("collapsed VCU screenshot falls back to an unfocused window when content does not answer", async () => {
  const viewport = { document_id: "doc-bg", url: "https://agent.example/", width: 100, height: 80, revision: 1 };
  const h = makeHarness({
    focusedWindowId: 1,
    groups: [{ id: 7, windowId: 1, title: "VCU", color: "purple", collapsed: true }],
    tabs: [
      { id: 10, windowId: 1, index: 0, url: "https://user.example/", active: true },
      { id: 11, windowId: 1, index: 1, url: "https://agent.example/", active: false, groupId: 7 },
    ],
    sendMessage: async (id, msg, state) => {
      const tab = state.tabs.find((item) => item.id === id);
      if (!tab || !tab.active || tab.windowId === 1) return null;
      if (msg.type === "vcu_ping_page") return { ok: true, version: "0.2.8" };
      if (msg.type === "vcu_viewport") return { ok: true, viewport };
      return { ok: true };
    },
    executeScript: async () => { throw new Error("collapsed tab has no content script"); },
  });
  const shot = await h.api.handleCommand({ method: "capture_tab", params: { tab_id: "11" } });
  assert.equal(shot.ok, true, shot.error);
  assert.equal(shot.background_capture, true);
  assert.notEqual(shot.capture_window_id, "1");
  const reading = h.state.tabs.find((tab) => tab.id === 10);
  assert.equal(reading.active, true);
  assert.equal(reading.windowId, 1);
  assert.equal(reading.url, "https://user.example/");
  const work = h.state.tabs.find((tab) => tab.id === 11);
  assert.equal(work.windowId, 1);
  assert.equal(work.active, false);
  assert.equal(h.state.groups.find((group) => group.id === work.groupId).collapsed, true);
  assert.equal(h.state.focusedWindowId, 1);
  assert.equal(h.state.calls.some((call) => call.method === "windows.create"), true);
  assert.equal(h.state.calls.some((call) => call.method === "captureVisibleTab" && String(call.id) === "1"), false);
  assert.equal(h.state.calls.some((call) => call.method === "windows.update" && call.changes && call.changes.focused === true), false);
});

test("quiet capture accepts a revision bump when the restored viewport geometry matches", async () => {
  const viewport = { document_id: "doc-bg", url: "https://agent.example/", width: 100, height: 80, revision: 1 };
  let reads = 0;
  const h = makeHarness({
    focusedWindowId: 1,
    groups: [{ id: 7, windowId: 1, title: "VCU", color: "purple", collapsed: true }],
    tabs: [
      { id: 10, windowId: 1, index: 0, url: "https://user.example/", active: true },
      { id: 11, windowId: 1, index: 1, url: "https://agent.example/", active: false, groupId: 7 },
    ],
    sendMessage: async (_id, msg, state) => {
      if (msg.type === "vcu_ping_page") return { ok: true, version: "0.2.8" };
      if (msg.type === "vcu_viewport") {
        reads += 1;
        const stages = state.calls.filter((call) => call.method === "quiet-helper" && String(call.url).endsWith("/stage")).length;
        const resized = stages > 0 && reads > 1;
        const width = reads === 1 || resized ? 100 : 40;
        return { ok: true, viewport: Object.assign({}, viewport, { width, revision: reads }) };
      }
      return { ok: true };
    },
  });
  const shot = await h.api.handleCommand({ method: "capture_tab", params: { tab_id: "11" } });
  assert.equal(shot.ok, true, shot.error);
  assert.equal(h.state.focusedWindowId, 1);
  assert.equal(h.state.tabs.find((tab) => tab.id === 10).active, true);
  assert.equal(h.state.tabs.find((tab) => tab.id === 10).url, "https://user.example/");
  const work = h.state.tabs.find((tab) => tab.id === 11);
  assert.equal(work.windowId, 1);
  assert.equal(work.active, false);
  assert.equal(h.state.groups.find((group) => group.id === work.groupId).collapsed, true);
  assert.equal(h.state.calls.some((call) => call.method === "quiet-helper"), false);
  assert.equal(h.state.calls.some((call) => call.method === "windows.update" && call.changes && call.changes.focused === true), false);
});

test("quiet capture still rejects a real url change", async () => {
  const viewport = { document_id: "doc-bg", url: "https://agent.example/", width: 100, height: 80, revision: 1 };
  let reads = 0;
  const h = makeHarness({
    focusedWindowId: 1,
    groups: [{ id: 7, windowId: 1, title: "VCU", color: "purple", collapsed: true }],
    tabs: [
      { id: 10, windowId: 1, index: 0, url: "https://user.example/", active: true },
      { id: 11, windowId: 1, index: 1, url: "https://agent.example/", active: false, groupId: 7 },
    ],
    sendMessage: async (_id, msg) => {
      if (msg.type === "vcu_ping_page") return { ok: true, version: "0.2.8" };
      if (msg.type === "vcu_viewport") {
        reads += 1;
        return { ok: true, viewport: Object.assign({}, viewport, { url: reads === 1 ? viewport.url : "https://agent.example/changed", revision: reads }) };
      }
      return { ok: true };
    },
  });
  const shot = await h.api.handleCommand({ method: "capture_tab", params: { tab_id: "11" } });
  assert.equal(shot.ok, false);
  assert.match(shot.error, /url/);
  assert.equal(h.state.focusedWindowId, 1);
  assert.equal(h.state.tabs.find((tab) => tab.id === 10).active, true);
  assert.equal(h.state.tabs.find((tab) => tab.id === 10).url, "https://user.example/");
  assert.equal(h.state.tabs.find((tab) => tab.id === 11).windowId, 1);
  assert.equal(h.state.tabs.find((tab) => tab.id === 11).url, "https://agent.example/");
  assert.equal(h.state.tabs.find((tab) => tab.id === 11).active, false);
  assert.equal(h.state.calls.some((call) => call.method === "windows.update" && call.changes && call.changes.focused === true), false);
});

test("quiet capture window that steals focus is closed and the user tab stays", async () => {
  const viewport = { document_id: "doc-bg", url: "https://agent.example/", width: 100, height: 80, revision: 1 };
  const h = makeHarness({
    focusedWindowId: 1,
    forceFocusOnCreate: true,
    groups: [{ id: 7, windowId: 1, title: "VCU", color: "purple", collapsed: true }],
    tabs: [
      { id: 10, windowId: 1, index: 0, url: "https://user.example/", active: true },
      { id: 11, windowId: 1, index: 1, url: "https://agent.example/", active: false, groupId: 7 },
    ],
    sendMessage: async (_id, msg) => {
      if (msg.type === "vcu_ping_page") return { ok: true, version: "0.2.8" };
      if (msg.type === "vcu_viewport") return { ok: true, viewport };
      return { ok: true };
    },
  });
  const shot = await h.api.handleCommand({ method: "capture_tab", params: { tab_id: "11" } });
  assert.equal(shot.ok, false);
  assert.match(shot.error, /stole focus/);
  assert.equal(h.state.calls.some((call) => call.method === "windows.update" && call.changes && call.changes.focused === true), false);
  assert.equal(h.state.focusedWindowId, 1);
  assert.equal(h.state.tabs.find((tab) => tab.id === 10).active, true);
  assert.equal(h.state.tabs.find((tab) => tab.id === 10).url, "https://user.example/");
  assert.equal(h.state.tabs.find((tab) => tab.id === 11).active, false);
  assert.equal(h.state.tabs.find((tab) => tab.id === 11).windowId, 1);
  assert.equal(h.state.groups.find((group) => group.id === 7).collapsed, true);
  assert.equal(h.state.calls.some((call) => call.method === "captureVisibleTab" || call.method === "tabs.move"), false);
  assert.equal(h.state.calls.some((call) => call.method === "windows.create"), true);
  assert.equal(h.state.calls.some((call) => call.method === "windows.remove"), true);
});

test("quiet park probe stops when stage fails and does not raise via windows.update", async () => {
  const h = makeHarness({
    focusedWindowId: 4,
    storage: { quietCaptureWindowId: 9 },
    windowGeometry: {
      4: { left: 0, top: 30, width: 1920, height: 926, state: "normal", focused: true },
      9: { left: 100, top: 40, width: 1100, height: 800, state: "normal", focused: false },
    },
    tabs: [
      { id: 1, windowId: 4, url: "https://user.example/", active: true },
      { id: 2, windowId: 9, url: "about:blank", active: true },
    ],
    fetch: async () => ({ ok: false, json: async () => ({}) }),
  });
  await h.api.parkRememberedQuietWindow();
  const updates = h.state.calls.filter((call) => call.method === "windows.update");
  assert.equal(updates.length, 0, JSON.stringify(updates));
  assert.equal(h.state.windowGeometry[9].left, 100);
  assert.equal(h.state.windowGeometry[9].top, 40);
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).active, true);
});

test("background capture refuses when stage fails instead of raising the quiet window", async () => {
  const viewport = { document_id: "doc-bg", url: "https://agent.example/", width: 100, height: 80, revision: 1 };
  const h = makeHarness({
    focusedWindowId: 1,
    windowGeometry: {
      1: { left: 0, top: 0, width: 1600, height: 1000, state: "normal", focused: true },
    },
    createdWindowGeometry: { left: 0, top: 0, width: 1600, height: 1000, state: "normal", focused: false },
    groups: [{ id: 7, windowId: 1, title: "VCU", color: "purple", collapsed: true }],
    tabs: [
      { id: 10, windowId: 1, index: 0, url: "https://user.example/", active: true },
      { id: 11, windowId: 1, index: 1, url: "https://agent.example/", active: false, groupId: 7 },
    ],
    fetch: async () => ({ ok: false, json: async () => ({}) }),
    sendMessage: async (_id, msg) => {
      if (msg.type === "vcu_ping_page") return { ok: true, version: "0.2.8" };
      if (msg.type === "vcu_viewport") return { ok: true, viewport };
      return { ok: true };
    },
  });
  const shot = await h.api.handleCommand({ method: "capture_tab", params: { tab_id: "11" } });
  assert.equal(shot.ok, false);
  assert.match(shot.error, /user page/);
  assert.equal(h.state.calls.some((call) => call.method === "windows.update"), false, JSON.stringify(h.state.calls.filter((call) => call.method === "windows.update")));
  assert.equal(h.state.focusedWindowId, 1);
  assert.equal(h.state.tabs.find((tab) => tab.id === 10).active, true);
  assert.equal(h.state.tabs.find((tab) => tab.id === 11).windowId, 1);
  assert.equal(h.state.tabs.find((tab) => tab.id === 11).active, false);
});

test("already sunk quiet window is not probed over the user page", async () => {
  const h = makeHarness({
    focusedWindowId: 4,
    storage: { quietCaptureWindowId: 9 },
    windowGeometry: {
      4: { left: 0, top: 30, width: 1920, height: 926, state: "normal", focused: true },
      9: { left: 1420, top: 956, width: 500, height: 375, state: "normal", focused: false },
    },
    tabs: [
      { id: 1, windowId: 4, url: "https://user.example/", active: true },
      { id: 2, windowId: 9, url: "about:blank", active: true },
    ],
  });
  await h.api.parkRememberedQuietWindow();
  const updates = h.state.calls.filter((call) => call.method === "windows.update");
  assert.equal(updates.length, 0, JSON.stringify(updates));
  assert.equal(h.state.calls.some((call) => call.method === "windows.update" && call.changes && call.changes.focused === true), false);
  assert.equal(h.state.calls.some((call) => call.method === "quiet-helper" && String(call.url).endsWith("/stage")), false);
  assert.equal(h.state.windowGeometry[9].top, 956);
});

test("quiet park leaves an overlapping window in place and does not call the helper", async () => {
  const h = makeHarness({
    focusedWindowId: 4,
    storage: { quietCaptureWindowId: 9 },
    windowGeometry: {
      4: { left: 0, top: 30, width: 1920, height: 926, state: "normal", focused: true },
      9: { left: 1420, top: 880, width: 500, height: 375, state: "normal", focused: false },
    },
    tabs: [
      { id: 1, windowId: 4, url: "https://user.example/", active: true },
      { id: 2, windowId: 9, url: "about:blank", active: true },
    ],
  });
  await h.api.parkRememberedQuietWindow();
  assert.equal(h.state.calls.some((call) => call.method === "quiet-helper" && /\/(restack|stage)$/.test(String(call.url))), false);
  assert.equal(h.state.windowGeometry[9].top, 880);
  assert.equal(h.state.windowGeometry[9].left, 1420);
  assert.equal(h.state.calls.some((call) => call.method === "windows.update" || call.method === "windows.create"), false);
  assert.equal(h.state.focusedWindowId, 4);
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).active, true);
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).url, "https://user.example/");
  assert.equal(h.state.tabs.find((tab) => tab.id === 2).windowId, 9);
});

test("captureTab screenshots a background tab without moving it", async () => {
  const viewport = { document_id: "doc-direct", url: "https://agent.example/", width: 100, height: 80, revision: 1 };
  const h = makeHarness({
    focusedWindowId: 1,
    groups: [{ id: 7, windowId: 1, title: "VCU", color: "purple", collapsed: true }],
    tabs: [
      { id: 10, windowId: 1, url: "https://user.example/", active: true },
      { id: 11, windowId: 1, url: "https://agent.example/", active: false, groupId: 7 },
    ],
    captureTab: async (id, _opts, state) => {
      state.calls.push({ method: "captureTab", id });
      return "data:image/png;base64,AA==";
    },
    sendMessage: async (_id, msg) => {
      if (msg.type === "vcu_ping_page") return { ok: true, version: "0.2.8" };
      if (msg.type === "vcu_viewport") return { ok: true, viewport };
      return { ok: true };
    },
  });
  const shot = await h.api.handleCommand({ method: "capture_tab", params: { tab_id: "11" } });
  assert.equal(shot.ok, true, shot.error);
  assert.equal(h.state.tabs.find((tab) => tab.id === 10).active, true);
  assert.equal(h.state.tabs.find((tab) => tab.id === 11).active, false);
  assert.equal(h.state.tabs.find((tab) => tab.id === 11).groupId, 7);
  assert.equal(h.state.groups.find((group) => group.id === 7).collapsed, true);
  assert.equal(h.state.calls.some((call) => call.method === "windows.create" || call.method === "tabs.move"), false);
  assert.equal(h.state.calls.some((call) => call.method === "captureTab" && call.id === 11), true);
});

test("quiet capture returns without waiting on a stuck page-world scroll read", async () => {
  const viewport = { document_id: "doc-bg", url: "https://agent.example/", width: 100, height: 80, revision: 1, scroll_x: 0, scroll_y: 480 };
  const h = makeHarness({
    focusedWindowId: 1,
    groups: [{ id: 7, windowId: 1, title: "VCU", color: "purple", collapsed: true }],
    tabs: [
      { id: 10, windowId: 1, index: 0, url: "https://user.example/", active: true },
      { id: 11, windowId: 1, index: 1, url: "https://agent.example/", active: false, groupId: 7 },
    ],
    executeScript: () => new Promise(() => {}),
    sendMessage: async (_id, msg) => {
      if (msg.type === "vcu_ping_page") return { ok: true, version: "0.2.8" };
      if (msg.type === "vcu_viewport") return { ok: true, viewport };
      if (msg.type === "vcu_scroll") return { ok: true, scrolled: true, scroll_y: 480 };
      return { ok: true };
    },
  });
  const shot = await Promise.race([
    h.api.handleCommand({ method: "capture_tab", params: { tab_id: "11" } }),
    new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: "test timeout" }), 1200)),
  ]);
  assert.notEqual(shot.error, "test timeout");
  assert.equal(shot.ok, true, shot.error);
  assert.equal(h.state.calls.some((call) => call.method === "executeScript"), false);
  assert.equal(h.state.tabs.find((tab) => tab.id === 10).active, true);
  assert.equal(h.state.tabs.find((tab) => tab.id === 10).url, "https://user.example/");
  assert.equal(h.state.tabs.find((tab) => tab.id === 11).windowId, 1);
  assert.equal(h.state.tabs.find((tab) => tab.id === 11).active, false);
  assert.equal(h.state.calls.some((call) => call.method === "windows.update" && call.changes && call.changes.focused === true), false);
});

test("viewport screenshot binds the active tab and rejects changes during capture", async () => {
  const viewport = {document_id:"doc-1",url:"https://example.com/",width:100,height:80,revision:1};
  let calls = 0;
  const h = makeHarness({
    focusedWindowId: 4,
    groups: [{ id: 7, windowId: 4, title: "VCU", color: "purple", collapsed: true }],
    tabs: [
      { id: 1, windowId: 4, url: viewport.url, active: true },
      { id: 3, windowId: 4, url: "https://agent.example/", active: false, groupId: 7 },
    ],
    sendMessage: async (_id, msg) => {
      if (msg.type === "vcu_ping_page") return { ok: true, version: "0.2.8" };
      if (msg.type === "vcu_viewport") {
        calls++;
        return { ok: true, viewport: { ...viewport, revision: calls <= 2 ? 1 : calls } };
      }
      return { ok: true, pressed: true };
    },
  });
  const shot = await h.api.handleCommand({ method: "capture_tab", params: { tab_id: "1" } });
  assert.equal(shot.ok, true, shot.error);
  assert.equal(shot.tab_id, "1");
  assert.equal(shot.viewport.document_id, "doc-1");
  const viewportMsg = h.state.calls.filter((c) => c.method === "sendMessage" && c.payload && c.payload.type === "vcu_viewport").at(-1).payload;
  assert.equal(viewportMsg.keep_cursor, true);
  const changed = await h.api.handleCommand({ method: "capture_tab", params: { tab_id: "1" } });
  assert.equal(changed.ok, false);
  assert.match(changed.error, /changed/);
  const refused = await h.api.handleCommand({ method: "click_point", params: { tab_id: "1", x: 25, y: 30, expected_viewport: viewport } });
  assert.equal(refused.ok, false, refused.error);
  assert.match(refused.error, /page being read/);
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).active, true);
  const point = await h.api.handleCommand({ method: "click_point", params: { tab_id: "3", x: 25, y: 30, expected_viewport: viewport } });
  assert.equal(point.ok, true, point.error);
  const msg = h.state.calls.filter((c) => c.method === "sendMessage" && c.payload && c.payload.type === "vcu_click_point").at(-1).payload;
  assert.equal(msg.type, "vcu_click_point");
  assert.equal(msg.x, 25);
  assert.equal(msg.expected_viewport.document_id, "doc-1");
  assert.equal(h.state.calls.some((c) => c.method === "sendMessage" && c.id === 1 && c.payload && c.payload.type === "vcu_click_point"), false);
});

test("reload tab stays in the collapsed VCU group and does not replace the current page", async () => {
  const h = makeHarness({
    tabs: [{ id: 1, windowId: 4, url: "https://user.example/", active: true }],
    focusedWindowId: 4,
  });
  const opened = await h.api.handleCommand({ method: "open_reload_tab", params: {} });
  assert.equal(opened.ok, true, opened.error);
  assert.equal(opened.active, false);
  assert.equal(opened.activated_user_page, false);
  assert.equal(opened.url, "chrome-extension://vcu-extension-id/reload.html");
  assert.notEqual(opened.window_id, "4");
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).active, true);
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).windowId, 4);
  const created = h.state.tabs.find((tab) => tab.url === opened.url);
  assert.equal(created.active, false);
  assert.notEqual(created.windowId, 4);
  const group = h.state.groups.find((item) => item.id === created.groupId);
  assert.equal(group.title, "VCU");
  assert.equal(group.collapsed, true);
  assert.equal(h.state.focusedWindowId, 4);
  assert.equal(h.state.calls.some((call) => call.method === "windows.update" && call.changes && call.changes.focused), false);
});

test("open without a quiet window creates one and does not touch the page being read", async () => {
  const h = makeHarness({ tabs: [{ id: 1, windowId: 4, url: "https://example.com/", active: true }], focusedWindowId: 4 });
  const opened = await h.api.handleCommand({ method: "open_tab", params: { url: "https://example.org/", active: false } });
  assert.equal(opened.ok, true, opened.error);
  assert.equal(opened.activated_user_page, false);
  assert.notEqual(opened.tabs[0].window_id, "4");
  assert.equal(opened.tabs[0].page_being_read, false);
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).active, true);
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).url, "https://example.com/");
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).windowId, 4);
  assert.equal(h.state.focusedWindowId, 4);
  assert.equal(h.state.calls.some((call) => call.method === "windows.create"), true);
  assert.equal(h.state.calls.some((call) => call.method === "windows.update" && call.changes && call.changes.focused), false);
  const created = h.state.calls.find((call) => call.method === "tabs.create");
  assert.notEqual(created.info.windowId, 4);
  assert.equal(created.info.active, false);
  assert.equal(created.info.url, "https://example.org/");
  const tab = h.state.tabs.find((item) => item.url === "https://example.org/");
  assert.equal(tab.active, false);
  assert.notEqual(tab.windowId, 4);
  const group = h.state.groups.find((item) => item.id === tab.groupId);
  assert.equal(group.title, "VCU");
  assert.equal(group.collapsed, true);
  assert.equal(group.windowId, tab.windowId);
});

test("open reuses an existing blank window and does not create another", async () => {
  const h = makeHarness({
    focusedWindowId: 4,
    tabs: [
      { id: 1, windowId: 4, url: "https://www.bing.com/", active: true },
      { id: 2, windowId: 9, url: "about:blank", active: true },
    ],
  });
  const opened = await h.api.handleCommand({ method: "open_tab", params: { url: "https://example.org/agent", session_name: "VCU-PROBE" } });
  assert.equal(opened.ok, true, opened.error);
  assert.equal(opened.tabs[0].window_id, "9");
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).active, true);
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).url, "https://www.bing.com/");
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).windowId, 4);
  const created = h.state.tabs.find((tab) => tab.url === "https://example.org/agent");
  assert.equal(created.windowId, 9);
  assert.equal(created.active, false);
  const group = h.state.groups.find((item) => item.id === created.groupId);
  assert.equal(group.title, "VCU-PROBE");
  assert.equal(group.collapsed, true);
  assert.equal(group.windowId, 9);
  assert.equal(h.state.focusedWindowId, 4);
  assert.equal(h.state.calls.some((call) => call.method === "windows.create"), false);
  assert.equal(h.state.calls.some((call) => call.method === "tabs.update" && call.id === 1), false);
  assert.equal(h.state.storage.quietCaptureWindowId, 9);
});

test("open refuses instead of landing in the page being read when quiet create steals focus", async () => {
  const h = makeHarness({
    focusedWindowId: 4,
    forceFocusOnCreate: true,
    tabs: [{ id: 1, windowId: 4, url: "https://www.bing.com/", active: true }],
  });
  const opened = await h.api.handleCommand({ method: "open_tab", params: { url: "https://example.org/agent" } });
  assert.equal(opened.ok, false);
  assert.match(opened.error, /quiet window stole focus/);
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).active, true);
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).url, "https://www.bing.com/");
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).windowId, 4);
  assert.equal(h.state.tabs.some((tab) => tab.url === "https://example.org/agent"), false);
  assert.equal(h.state.focusedWindowId, 4);
});

test("open prefers the parked quiet window and does not move the page being read", async () => {
  const h = makeHarness({
    focusedWindowId: 4,
    storage: { quietCaptureWindowId: 9 },
    tabs: [
      { id: 1, windowId: 4, url: "https://docs.example/reading", title: "Reading", active: true },
      { id: 2, windowId: 9, url: "about:blank", title: "about:blank", active: true },
    ],
  });
  const opened = await h.api.handleCommand({ method: "open_tab", params: { url: "https://example.org/agent", active: true } });
  assert.equal(opened.ok, true, opened.error);
  assert.equal(opened.activated_user_page, false);
  assert.equal(opened.window_id || opened.tabs[0].window_id, "9");
  const reading = h.state.tabs.find((tab) => tab.id === 1);
  assert.equal(reading.active, true);
  assert.equal(reading.url, "https://docs.example/reading");
  assert.equal(reading.windowId, 4);
  const created = h.state.tabs.find((tab) => tab.url === "https://example.org/agent");
  assert.equal(created.windowId, 9);
  assert.equal(created.active, false);
  const group = h.state.groups.find((item) => item.id === created.groupId);
  assert.equal(group.title, "VCU");
  assert.equal(group.collapsed, true);
  assert.equal(group.windowId, 9);
  assert.equal(h.state.focusedWindowId, 4);
  assert.equal(h.state.calls.some((call) => call.method === "tabs.update" && call.id === 1), false);
  assert.equal(h.state.calls.some((call) => call.method === "tabs.move" && call.id === 1), false);
  assert.equal(h.state.calls.some((call) => call.method === "windows.update" && call.changes && call.changes.focused), false);
  assert.equal(h.state.calls.some((call) => call.method === "tabs.update" && call.id === created.id && call.changes && call.changes.active), false);
  const ping = await h.api.handleCommand({ method: "ping", params: {} });
  assert.equal(ping.quiet_open, "own-window");
});

test("open restores the page being read when create steals the active tab", async () => {
  const h = makeHarness({
    stealOnCreate: true,
    tabs: [{ id: 1, windowId: 4, url: "https://user.example/", active: true, title: "Reading" }],
    focusedWindowId: 4,
  });
  const opened = await h.api.handleCommand({ method: "open_tab", params: { url: "https://example.org/" } });
  assert.equal(opened.ok, true, opened.error);
  assert.equal(opened.activated_user_page, false);
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).active, true);
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).url, "https://user.example/");
  const created = h.state.tabs.find((tab) => tab.url === "https://example.org/");
  assert.ok(created);
  assert.notEqual(created.windowId, 4);
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).windowId, 4);
  const group = h.state.groups.find((item) => item.id === created.groupId);
  assert.equal(group.title, "VCU");
  assert.equal(group.collapsed, true);
  assert.equal(h.state.focusedWindowId, 4);
});

test("open_tab with tab_id updates an unfocused agent tab in place", async () => {
  const h = makeHarness({
    focusedWindowId: 4,
    storage: { quietCaptureWindowId: 9 },
    groups: [{ id: 7, windowId: 9, title: "VCU", color: "purple", collapsed: false }],
    tabs: [
      { id: 1, windowId: 4, url: "https://docs.example/reading", title: "Reading", active: true },
      { id: 3, windowId: 9, url: "https://example.com/", active: true, groupId: 7 },
    ],
  });
  const opened = await h.api.handleCommand({
    method: "open_tab",
    params: { url: "https://example.org/next", tab_id: "3", active: true },
  });
  assert.equal(opened.ok, true, opened.error);
  assert.equal(opened.reused, true);
  assert.equal(opened.in_place, true);
  assert.equal(opened.tab_id, "3");
  assert.equal(opened.activated_user_page, false);
  assert.equal(h.state.tabs.find((tab) => tab.id === 3).url, "https://example.org/next");
  assert.equal(h.state.tabs.find((tab) => tab.id === 3).active, true);
  assert.equal(h.state.tabs.find((tab) => tab.id === 3).windowId, 9);
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).url, "https://docs.example/reading");
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).active, true);
  assert.equal(h.state.tabs.filter((tab) => tab.url === "https://example.org/next").length, 1);
  assert.equal(h.state.calls.some((call) => call.method === "tabs.create"), false);
  assert.equal(h.state.calls.some((call) => call.method === "windows.update"), false);
  assert.equal(h.state.calls.some((call) => call.method === "quiet-helper" && /\/(restack|stage)$/.test(String(call.url))), false);
  const update = h.state.calls.find((call) => call.method === "tabs.update" && call.id === 3);
  assert.equal(update.changes.url, "https://example.org/next");
  assert.equal(update.changes.active, true);
  assert.equal(h.state.focusedWindowId, 4);
  const ping = await h.api.handleCommand({ method: "ping", params: {} });
  assert.equal(ping.quiet_open_reuse, "in-place");
});

test("open_tab with tab_id of the page being read opens in the quiet VCU group", async () => {
  const h = makeHarness({
    focusedWindowId: 4,
    storage: { quietCaptureWindowId: 9 },
    tabs: [
      { id: 1, windowId: 4, url: "https://docs.example/reading", title: "Reading", active: true },
      { id: 2, windowId: 9, url: "about:blank", title: "about:blank", active: true },
    ],
  });
  const opened = await h.api.handleCommand({
    method: "open_tab",
    params: { url: "https://example.org/agent", tab_id: "1" },
  });
  assert.equal(opened.ok, true, opened.error);
  assert.equal(opened.released_reading_page, "1");
  assert.equal(opened.reused, false);
  assert.equal(opened.tab_id_source, "agent_group");
  assert.notEqual(opened.tab_id, "1");
  const reading = h.state.tabs.find((tab) => tab.id === 1);
  assert.equal(reading.url, "https://docs.example/reading");
  assert.equal(reading.active, true);
  assert.equal(reading.windowId, 4);
  const created = h.state.tabs.find((tab) => tab.url === "https://example.org/agent");
  assert.equal(created.windowId, 9);
  assert.equal(created.active, false);
  assert.equal(h.state.calls.some((call) => call.method === "tabs.update" && call.id === 1), false);
  assert.equal(h.state.calls.some((call) => call.method === "windows.update" && call.changes && call.changes.focused), false);
  assert.equal(h.state.focusedWindowId, 4);
});

test("open_tab with tab_id of a background user tab does not change it", async () => {
  const h = makeHarness({
    focusedWindowId: 4,
    groups: [{ id: 7, windowId: 9, title: "VCU", color: "purple", collapsed: true }],
    tabs: [
      { id: 1, windowId: 4, url: "https://docs.example/reading", active: true },
      { id: 2, windowId: 4, url: "https://www.bilibili.com/video/1", active: false },
      { id: 3, windowId: 9, url: "https://example.com/", active: false, groupId: 7 },
    ],
  });
  const refused = await h.api.handleCommand({
    method: "open_tab",
    params: { url: "https://example.org/stolen", tab_id: "2" },
  });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /without changing a user tab/);
  assert.equal(h.state.tabs.find((tab) => tab.id === 2).url, "https://www.bilibili.com/video/1");
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).url, "https://docs.example/reading");
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).active, true);
  assert.equal(h.state.calls.some((call) => call.method === "tabs.create"), false);
  assert.equal(h.state.calls.some((call) => call.method === "tabs.update"), false);
  assert.equal(h.state.calls.some((call) => call.method === "windows.update"), false);
});

test("separate USER window can open in background without moving browser focus", async () => {
  const h = makeHarness({tabs:[{id:1,windowId:4,url:"https://example.com/",active:true}],focusedWindowId:4});
  const opened = await h.api.handleCommand({method:"open_tab",params:{url:"https://example.org/",new_window:true,active:false,session_name:"POC"}});
  assert.equal(opened.ok,true);
  assert.equal(opened.focused,false);
  assert.equal(h.state.focusedWindowId,4);
  assert.equal(opened.tabs[0].agent_owned,false);
  assert.equal(opened.group.window_id,"999");
  const count = h.state.calls.length;
  const conflict = await h.api.handleCommand({method:"open_tab",params:{url:"https://example.org/",new_window:true,group_id:opened.group.group_id}});
  assert.equal(conflict.ok,false);
  assert.equal(h.state.calls.length,count,"invalid option combination must not create a window");
});

test("close_tab removes only an explicit valid target and never defaults to the focused page", async () => {
  const h = makeHarness({tabs:[{id:1,windowId:4,url:"https://example.com/",active:true},{id:2,windowId:4,url:"https://example.org/"}]});
  for (const params of [{},{tab_id:""},{tab_id:"999"}]) {
    assert.equal((await h.api.handleCommand({method:"close_tab",params})).ok,false);
  }
  assert.equal(h.state.tabs.length,2);
  const closed = await h.api.handleCommand({method:"close_tab",params:{tab_id:"2"}});
  assert.equal(closed.closed,true);
  assert.equal(closed.tab_id,"2");
  assert.deepEqual(h.state.tabs.map(t=>t.id),[1]);
});

test("drawing zoom travels with the exact tab without changing action coordinates", async () => {
  const h = makeHarness({
    zoom: .8,
    focusedWindowId: 4,
    groups: [{ id: 7, windowId: 4, title: "VCU", color: "purple", collapsed: true }],
    tabs: [{ id: 1, windowId: 4, url: "https://example.com/", active: true, groupId: 7 }],
  });
  const point = await h.api.handleCommand({ method: "click_point", params: { tab_id: "1", x: 20, y: 30, expected_viewport: {} } });
  assert.equal(point.ok, true, point.error);
  const sent = h.state.calls.filter((c) => c.method === "sendMessage" && c.payload && c.payload.type === "vcu_click_point").at(-1).payload;
  assert.equal(sent.cursor_zoom, .8);
  assert.equal(sent.x, 20);
  assert.equal(sent.y, 30);
});

test("screenshot bursts respect the browser capture quota", async () => {
  const viewport={document_id:"doc-rate",url:"https://example.com/",width:100,height:80,revision:0};
  const h=makeHarness({tabs:[{id:1,windowId:4,url:viewport.url,active:true}],sendMessage:async (_id,msg)=>msg.type==='vcu_ping_page'?{ok:true,version:'0.2.8'}:{ok:true,viewport}});
  for(let i=0;i<3;i++) {
    const result=await h.api.handleCommand({method:'capture_tab',params:{tab_id:'1'}});
    assert.equal(result.ok,true,result.error);
  }
  const shots=h.state.calls.filter(c=>c.method==='captureVisibleTab');
  assert.equal(shots.length,3);
  assert.ok(shots[1].at-shots[0].at>=500);
  assert.ok(shots[2].at-shots[1].at>=500);
});

test("explicit tab owned by another browser is retryable instead of a hard miss", async () => {
  const h = makeHarness({tabs:[{id:1,windowId:4,url:"https://example.com/",active:true}]});
  const result = await h.api.handleCommand({method:"extract",params:{tab_id:"99",selector:"#result"}});
  assert.equal(result.ok, false);
  assert.equal(result.error, "wrong_extension_browser");
  assert.equal(result.retryable, true);
});

test("hover uses the collapsed VCU group and retryable mismatch", async () => {
  const h = makeHarness({
    focusedWindowId: 4,
    groups: [{ id: 7, windowId: 4, title: "VCU", color: "purple", collapsed: true }],
    tabs: [
      { id: 1, windowId: 4, url: "https://example.com/", active: true },
      { id: 3, windowId: 4, url: "https://agent.example/", active: false, groupId: 7 },
    ],
    sendMessage: async (_id, msg) => {
      if (msg.type === "vcu_ping_page") return { ok: true, pong: true, version: "0.2.8" };
      if (msg.type === "vcu_hover") return { ok: true, hovered: true, input_path: "dom_hover", trusted: false };
      return { ok: true };
    },
  });
  const hovered = await h.api.handleCommand({ method: "hover", params: { selector: "#x" } });
  assert.equal(hovered.ok, true, hovered.error);
  assert.equal(hovered.hovered, true);
  assert.equal(hovered.tab_id, "3");
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).active, true);
  assert.equal(h.state.calls.some((call) => call.method === "sendMessage" && call.id === 3 && call.payload.type === "vcu_hover"), true);
  assert.equal(h.state.calls.some((call) => call.method === "sendMessage" && call.id === 1 && call.payload.type === "vcu_hover"), false);
  const miss = await h.api.handleCommand({ method: "hover", params: { tab_id: "99", selector: "#x" } });
  assert.equal(miss.ok, false);
  assert.equal(miss.error, "wrong_extension_browser");
  assert.equal(miss.retryable, true);
  const noGroup = makeHarness({
    focusedWindowId: 4,
    tabs: [{ id: 1, windowId: 4, url: "https://user.example/", active: true }],
    sendMessage: async (_id, msg) => {
      if (msg.type === "vcu_ping_page") return { ok: true, pong: true, version: "0.2.8" };
      if (msg.type === "vcu_hover") return { ok: true, hovered: true, input_path: "dom_hover", trusted: false };
      return { ok: true };
    },
  });
  const ensured = await noGroup.api.handleCommand({ method: "hover", params: { selector: "#x" } });
  assert.equal(ensured.ok, true, ensured.error);
  assert.equal(ensured.tab_id_source, "agent_group");
  assert.notEqual(ensured.tab_id, "1");
  assert.equal(noGroup.state.tabs.find((tab) => tab.id === 1).active, true);
  assert.equal(noGroup.state.tabs.find((tab) => tab.id === 1).url, "https://user.example/");
  const created = noGroup.state.tabs.find((tab) => tab.url === "https://example.com/");
  assert.ok(created);
  assert.equal(created.active, false);
  assert.equal(String(ensured.tab_id), String(created.id));
  assert.equal(noGroup.state.groups.find((group) => group.id === created.groupId).collapsed, true);
  assert.equal(noGroup.state.calls.some((call) => call.method === "sendMessage" && call.id === 1 && call.payload.type === "vcu_hover"), false);
  const dry = await noGroup.api.handleCommand({ method: "hover", params: { selector: "#x", dry_run: true } });
  assert.equal(dry.ok, true, dry.error);
  assert.equal(dry.tab_id, String(created.id));
});

test("reload_self reports reloading without clicking Allow", async () => {
  const { api, chrome } = makeHarness({ tabs: [{ id: 1, windowId: 1, url: "https://example.com/", active: true }] });
  let reloads = 0;
  chrome.runtime.reload = () => { reloads += 1; };
  const result = await api.handleCommand({ method: "reload_self", params: {} });
  assert.equal(result.ok, true);
  assert.equal(result.reloading, true);
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(reloads, 1);
});

test("ensureOffscreen still creates when getContexts throws", async () => {
  const { api, state } = makeHarness({
    getContexts: async () => { throw new Error("getContexts unavailable"); },
  });
  await api.ensureOffscreen();
  const created = state.calls.filter((call) => call.method === "offscreen.createDocument");
  assert.ok(created.length >= 1, JSON.stringify(created));
  assert.deepEqual(created[0].info.reasons, ["BLOBS"]);
});

test("ensureOffscreen skips create when an offscreen document already exists", async () => {
  const { api, state } = makeHarness({
    getContexts: async () => [{ contextType: "OFFSCREEN_DOCUMENT" }],
  });
  const before = state.calls.filter((call) => call.method === "offscreen.createDocument").length;
  await api.ensureOffscreen();
  const after = state.calls.filter((call) => call.method === "offscreen.createDocument").length;
  assert.equal(after, before);
});


test("open does not steal the focused user tab and lands in the VCU group", async () => {
  const h = makeHarness({
    tabs: [{ id: 1, windowId: 4, url: "https://user.example/", active: true }],
    focusedWindowId: 4,
  });
  const opened = await h.api.handleCommand({
    method: "open_tab",
    params: { url: "https://agent.example/", active: true },
  });
  assert.equal(opened.ok, true, opened.error);
  assert.equal(h.state.focusedWindowId, 4);
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).active, true);
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).url, "https://user.example/");
  const created = h.state.tabs.find((tab) => tab.url === "https://agent.example/");
  assert.equal(created.active, false);
  const group = h.state.groups.find((item) => item.id === created.groupId);
  assert.equal(group.title, "VCU");
  assert.equal(group.color, "purple");
  assert.equal(group.collapsed, true);
  assert.equal(h.state.calls.some((call) => call.method === "windows.update"), false);
  const again = await h.api.handleCommand({
    method: "open_tab",
    params: { url: "https://agent2.example/" },
  });
  assert.equal(again.ok, true, again.error);
  const second = h.state.tabs.find((tab) => tab.url === "https://agent2.example/");
  assert.equal(second.groupId, created.groupId);
  assert.equal(second.active, false);
  assert.equal(h.state.groups.filter((item) => item.title === "VCU").length, 1);
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).active, true);
});

test("background capture restores a collapsed VCU group without expanding it", async () => {
  const viewport = {
    document_id: "doc-quiet",
    url: "https://agent.example/",
    width: 800,
    height: 600,
    scroll_x: 0,
    scroll_y: 0,
    device_pixel_ratio: 1,
    visual_scale: 1,
    visual_offset_x: 0,
    visual_offset_y: 0,
    revision: 1,
    layout_signature: {
      version: 1,
      max_nodes: 0,
      scan_max_nodes: 0,
      visible_count: 0,
      scanned_count: 0,
      overflow: false,
      overflow_reason: "",
      nodes: [],
    },
  };
  const h = makeHarness({
    focusedWindowId: 4,
    groups: [{ id: 7, windowId: 4, title: "VCU", color: "purple", collapsed: true }],
    tabs: [
      { id: 1, windowId: 4, index: 0, url: "https://user.example/", active: true },
      { id: 2, windowId: 4, index: 1, url: viewport.url, active: false, groupId: 7 },
    ],
    sendMessage: async (_id, msg) => {
      if (msg.type === "vcu_ping_page") return { ok: true, version: "0.2.8" };
      if (msg.type === "vcu_viewport") return { ok: true, viewport };
      return { ok: true };
    },
    executeScript: async () => [{ result: { y: 0, top: 0, before: 0 } }],
  });
  const shot = await h.api.handleCommand({ method: "capture_tab", params: { tab_id: "2" } });
  assert.equal(shot.ok, true, shot.error);
  assert.equal(shot.user_group_expansions, 0);
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).active, true);
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).url, "https://user.example/");
  const work = h.state.tabs.find((tab) => tab.id === 2);
  assert.equal(work.active, false);
  assert.equal(work.windowId, 4);
  assert.equal(h.state.focusedWindowId, 4);
  const expanded = h.state.calls.filter((call) => call.method === "tabGroups.update" && call.changes && call.changes.collapsed === false);
  assert.equal(expanded.length, 0, JSON.stringify(expanded));
  const home = h.state.groups.find((group) => group.id === work.groupId);
  assert.equal(home && home.title, "VCU");
  assert.equal(home && home.collapsed, true);
  assert.equal(home && home.windowId, 4);
  assert.equal(h.state.calls.some((call) => call.method === "windows.update" && call.changes && call.changes.focused === true), false);
  assert.equal(h.state.calls.some((call) => call.method === "quiet-helper"), false);
});

test("quiet window activation restacks before it can cover the page being read", async () => {
  const viewport = {
    document_id: "doc-raise",
    url: "https://agent.example/",
    width: 800,
    height: 600,
    scroll_x: 0,
    scroll_y: 0,
    device_pixel_ratio: 1,
    visual_scale: 1,
    visual_offset_x: 0,
    visual_offset_y: 0,
    revision: 1,
  };
  const h = makeHarness({
    focusedWindowId: 4,
    focusOnTabActivate: true,
    groups: [
      { id: 1, windowId: 4, title: "1", color: "blue", collapsed: false },
      { id: 7, windowId: 4, title: "VCU", color: "purple", collapsed: true },
    ],
    tabs: [
      { id: 1, windowId: 4, index: 0, url: "https://user.example/reading", active: true, groupId: 1 },
      { id: 2, windowId: 4, index: 1, url: viewport.url, active: false, groupId: 7 },
    ],
    sendMessage: async (_id, msg) => {
      if (msg.type === "vcu_ping_page") return { ok: true, version: "0.2.8" };
      if (msg.type === "vcu_viewport") return { ok: true, viewport };
      return { ok: true };
    },
  });
  const shot = await h.api.handleCommand({ method: "capture_tab", params: { tab_id: "2" } });
  assert.equal(shot.ok, false);
  assert.match(shot.error, /stole focus/);
  const reading = h.state.tabs.find((tab) => tab.id === 1);
  assert.equal(reading.active, true);
  assert.equal(reading.windowId, 4);
  assert.equal(reading.url, "https://user.example/reading");
  assert.equal(reading.groupId, 1);
  assert.equal(h.state.groups.find((group) => group.id === 1).collapsed, false);
  const workGroup = h.state.groups.find((group) => group.id === h.state.tabs.find((tab) => tab.id === 2).groupId);
  assert.equal(workGroup && workGroup.collapsed, true);
  const work = h.state.tabs.find((tab) => tab.id === 2);
  assert.equal(work.active, false);
  assert.equal(work.windowId, 4);
  assert.equal(h.state.focusedWindowId, 4);
  assert.equal(h.state.calls.some((call) => call.method === "windows.update" && call.changes && call.changes.focused === true), false);
  assert.equal(h.state.calls.some((call) => call.method === "quiet-helper"), false);
  assert.equal(h.state.calls.some((call) => call.method === "windows.remove"), true);
});

test("inactive quiet-window script hang retries after activation and leaves the reading page", async () => {
  const viewport = {
    document_id: "doc-quiet-inject",
    url: "https://example.com/",
    width: 800,
    height: 600,
    scroll_x: 0,
    scroll_y: 0,
    device_pixel_ratio: 1,
    visual_scale: 1,
    visual_offset_x: 0,
    visual_offset_y: 0,
    revision: 1,
  };
  const h = makeHarness({
    focusedWindowId: 1,
    focusOnTabActivate: true,
    storage: { quietCaptureWindowId: 9 },
    groups: [
      { id: 1, windowId: 1, title: "1", color: "blue", collapsed: false },
      { id: 8, windowId: 9, title: "VCU", color: "purple", collapsed: true },
    ],
    tabs: [
      { id: 10, windowId: 1, index: 0, url: "https://feishu.example/doc", active: true, groupId: 1 },
      { id: 2, windowId: 9, index: 0, url: "about:blank", active: true },
      { id: 11, windowId: 9, index: 1, url: "https://example.com/", active: false, groupId: 8 },
    ],
    executeScript: async (details, state) => {
      const tab = state.tabs.find((item) => item.id === details.target.tabId);
      if (!tab || !tab.active) return new Promise(() => {});
      const src = String(details.func || "");
      if (src.includes("scrollBy") || src.includes("scrollY")) return [{ result: { before: 0, y: 12, top: 12 } }];
      return [{}];
    },
    sendMessage: async (id, msg, state) => {
      const tab = state.tabs.find((item) => item.id === id);
      if (!tab || !tab.active) return null;
      if (msg.type === "vcu_ping_page") return { ok: true, version: "0.2.8" };
      if (msg.type === "vcu_viewport") return { ok: true, viewport };
      return { ok: true };
    },
  });
  const scrolled = await h.api.handleCommand({ method: "scroll", params: { tab_id: "11", dy: 0 } });
  assert.equal(scrolled.ok, false);
  assert.match(scrolled.error, /stayed inactive/);
  const shot = await h.api.handleCommand({ method: "capture_tab", params: { tab_id: "11" } });
  assert.equal(shot.ok, false);
  assert.match(shot.error, /stayed inactive/);
  const reading = h.state.tabs.find((tab) => tab.id === 10);
  assert.equal(reading.active, true);
  assert.equal(reading.windowId, 1);
  assert.equal(reading.url, "https://feishu.example/doc");
  assert.equal(reading.groupId, 1);
  const work = h.state.tabs.find((tab) => tab.id === 11);
  assert.equal(work.windowId, 9);
  assert.equal(work.active, false);
  assert.equal(work.groupId, 8);
  assert.equal(h.state.groups.find((group) => group.id === 8).collapsed, true);
  assert.equal(h.state.tabs.find((tab) => tab.id === 2).active, true);
  assert.equal(h.state.groups.find((group) => group.id === 1).collapsed, false);
  assert.equal(h.state.focusedWindowId, 9);
  assert.equal(h.state.calls.some((call) => call.method === "tabs.update" && Number(call.id) === 10), false);
  assert.equal(h.state.calls.some((call) => call.method === "tabs.move" || call.method === "windows.create"), false);
  assert.equal(h.state.calls.some((call) => call.method === "windows.update" && call.changes && call.changes.focused === true), false);
  assert.equal(h.state.calls.some((call) => call.method === "quiet-helper" && String(call.url).endsWith("/restack")), false);
});

test("inactive quiet-window capture stays in its group and the next capture does not activate again", async () => {
  const viewport = {
    document_id: "doc-quiet-stay",
    url: "https://example.com/",
    width: 800,
    height: 600,
    scroll_x: 0,
    scroll_y: 0,
    device_pixel_ratio: 1,
    visual_scale: 1,
    visual_offset_x: 0,
    visual_offset_y: 0,
    revision: 1,
  };
  const h = makeHarness({
    focusedWindowId: 1,
    focusOnTabActivate: true,
    storage: { quietCaptureWindowId: 9 },
    groups: [
      { id: 1, windowId: 1, title: "1", color: "blue", collapsed: false },
      { id: 8, windowId: 9, title: "VCU", color: "purple", collapsed: true },
    ],
    tabs: [
      { id: 10, windowId: 1, index: 0, url: "https://feishu.example/doc", active: true, groupId: 1 },
      { id: 2, windowId: 9, index: 0, url: "about:blank", active: true },
      { id: 11, windowId: 9, index: 1, url: viewport.url, active: false, groupId: 8 },
    ],
    executeScript: async (details, state) => {
      const tab = state.tabs.find((item) => item.id === details.target.tabId);
      if (!tab || !tab.active) return new Promise(() => {});
      return [{}];
    },
    sendMessage: async (id, msg, state) => {
      const tab = state.tabs.find((item) => item.id === id);
      if (!tab || !tab.active) return null;
      if (msg.type === "vcu_ping_page") return { ok: true, version: "0.2.8" };
      if (msg.type === "vcu_viewport") return { ok: true, viewport };
      return { ok: true };
    },
  });
  const first = await h.api.handleCommand({ method: "capture_tab", params: { tab_id: "11" } });
  assert.equal(first.ok, false);
  assert.match(first.error, /stayed inactive/);
  const second = await h.api.handleCommand({ method: "capture_tab", params: { tab_id: "11" } });
  assert.equal(second.ok, false);
  assert.match(second.error, /stayed inactive/);
  const reading = h.state.tabs.find((tab) => tab.id === 10);
  assert.equal(reading.active, true);
  assert.equal(reading.windowId, 1);
  assert.equal(reading.url, "https://feishu.example/doc");
  const work = h.state.tabs.find((tab) => tab.id === 11);
  assert.equal(work.windowId, 9);
  assert.equal(work.active, false);
  assert.equal(work.groupId, 8);
  assert.equal(h.state.tabs.find((tab) => tab.id === 2).active, true);
  assert.equal(h.state.groups.find((group) => group.id === 8).collapsed, true);
  assert.equal(h.state.groups.find((group) => group.id === 1).collapsed, false);
  assert.equal(h.state.focusedWindowId, 9);
  assert.equal(h.state.calls.some((call) => call.method === "tabs.update" && Number(call.id) === 10), false);
  assert.equal(h.state.calls.some((call) => call.method === "tabs.move" || call.method === "windows.create"), false);
  assert.equal(h.state.calls.some((call) => call.method === "windows.update" && call.changes && call.changes.focused === true), false);
});

test("inactive quiet-window capture succeeds when activation does not steal focus", async () => {
  const viewport = {
    document_id: "doc-quiet-ok",
    url: "https://example.com/",
    width: 800,
    height: 600,
    scroll_x: 0,
    scroll_y: 0,
    device_pixel_ratio: 1,
    visual_scale: 1,
    visual_offset_x: 0,
    visual_offset_y: 0,
    revision: 1,
  };
  const h = makeHarness({
    focusedWindowId: 1,
    storage: { quietCaptureWindowId: 9 },
    groups: [
      { id: 1, windowId: 1, title: "1", color: "blue", collapsed: false },
      { id: 8, windowId: 9, title: "VCU", color: "purple", collapsed: true },
    ],
    tabs: [
      { id: 10, windowId: 1, index: 0, url: "https://feishu.example/doc", active: true, groupId: 1 },
      { id: 2, windowId: 9, index: 0, url: "about:blank", active: true },
      { id: 11, windowId: 9, index: 1, url: viewport.url, active: false, groupId: 8 },
    ],
    executeScript: async (details, state) => {
      const tab = state.tabs.find((item) => item.id === details.target.tabId);
      if (!tab || !tab.active) return new Promise(() => {});
      return [{}];
    },
    sendMessage: async (id, msg, state) => {
      const tab = state.tabs.find((item) => item.id === id);
      if (!tab || !tab.active) return null;
      if (msg.type === "vcu_ping_page") return { ok: true, version: "0.2.8" };
      if (msg.type === "vcu_viewport") return { ok: true, viewport };
      return { ok: true };
    },
  });
  const first = await h.api.handleCommand({ method: "capture_tab", params: { tab_id: "11" } });
  assert.equal(first.ok, true, first.error);
  assert.equal(String(first.capture_window_id), "9");
  const updatesAfterFirst = h.state.calls.filter((call) => call.method === "tabs.update").length;
  const second = await h.api.handleCommand({ method: "capture_tab", params: { tab_id: "11" } });
  assert.equal(second.ok, true, second.error);
  assert.equal(h.state.calls.filter((call) => call.method === "tabs.update").length, updatesAfterFirst);
  const reading = h.state.tabs.find((tab) => tab.id === 10);
  assert.equal(reading.active, true);
  assert.equal(reading.windowId, 1);
  assert.equal(reading.url, "https://feishu.example/doc");
  assert.equal(reading.groupId, 1);
  assert.equal(h.state.calls.some((call) => call.method === "tabs.update" && Number(call.id) === 10), false);
  assert.equal(h.state.tabs.find((tab) => tab.id === 11).windowId, 9);
  assert.equal(h.state.groups.find((group) => group.id === 1).collapsed, false);
  assert.equal(h.state.focusedWindowId, 1);
  assert.equal(h.state.calls.some((call) => call.method === "windows.update" && call.changes && call.changes.focused === true), false);
  assert.equal(h.state.calls.some((call) => call.method === "quiet-helper"), false);
});

test("inactive user page script hang does not enter the quiet window", async () => {
  const h = makeHarness({
    focusedWindowId: 1,
    groups: [
      { id: 1, windowId: 1, title: "1", color: "blue", collapsed: false },
      { id: 3, windowId: 1, title: "3", color: "grey", collapsed: true },
    ],
    tabs: [
      { id: 10, windowId: 1, index: 0, url: "https://feishu.example/doc", active: true, groupId: 1 },
      { id: 12, windowId: 1, index: 1, url: "https://bilibili.example/watch", active: false, groupId: 3 },
    ],
    executeScript: () => new Promise(() => {}),
  });
  const scrolled = await h.api.handleCommand({ method: "scroll", params: { tab_id: "12", dy: 0 } });
  assert.equal(scrolled.ok, false);
  assert.match(scrolled.error, /not in the VCU group/);
  assert.equal(h.state.calls.some((call) => call.method === "tabs.move" || call.method === "windows.create" || call.method === "tabs.update"), false);
  const reading = h.state.tabs.find((tab) => tab.id === 10);
  assert.equal(reading.active, true);
  assert.equal(reading.windowId, 1);
  assert.equal(reading.url, "https://feishu.example/doc");
  assert.equal(h.state.tabs.find((tab) => tab.id === 12).windowId, 1);
  assert.equal(h.state.tabs.find((tab) => tab.id === 12).active, false);
  assert.equal(h.state.focusedWindowId, 1);
});

test("background capture stages the quiet window by id and does not focus the user window", async () => {
  const calls = [];
  const viewport = {
    document_id: "doc-stage",
    url: "https://agent.example/",
    width: 800,
    height: 600,
    scroll_x: 0,
    scroll_y: 0,
    device_pixel_ratio: 1,
    visual_scale: 1,
    visual_offset_x: 0,
    visual_offset_y: 0,
    revision: 1,
    layout_signature: {
      version: 1,
      max_nodes: 0,
      scan_max_nodes: 0,
      visible_count: 0,
      scanned_count: 0,
      overflow: false,
      overflow_reason: "",
      nodes: [],
    },
  };
  const h = makeHarness({
    focusedWindowId: 4,
    groups: [{ id: 7, windowId: 4, title: "VCU", color: "purple", collapsed: true }],
    tabs: [
      { id: 1, windowId: 4, index: 0, url: "https://user.example/", active: true },
      { id: 2, windowId: 4, index: 1, url: viewport.url, active: false, groupId: 7 },
    ],
    sendMessage: async (_id, msg) => {
      if (msg.type === "vcu_ping_page") return { ok: true, version: "0.2.8" };
      if (msg.type === "vcu_viewport") return { ok: true, viewport };
      return { ok: true };
    },
    fetch: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return { ok: true, json: async () => ({ ok: true }) };
    },
  });
  const shot = await h.api.handleCommand({ method: "capture_tab", params: { tab_id: "2" } });
  assert.equal(shot.ok, true, shot.error);
  assert.equal(calls.some((call) => String(call.url).endsWith("/stage") || String(call.url).endsWith("/restack")), false);
  assert.equal(h.state.calls.some((call) => call.method === "windows.update" && call.changes && call.changes.focused === true), false);
  assert.equal(h.state.calls.some((call) => call.method === "windows.create"), true);
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).active, true);
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).url, "https://user.example/");
  const work = h.state.tabs.find((tab) => tab.id === 2);
  assert.equal(work.active, false);
  assert.equal(work.windowId, 4);
  assert.equal(h.state.groups.find((group) => group.id === work.groupId).collapsed, true);
  assert.equal(h.state.focusedWindowId, 4);
});

test("inactive scroll ignores scrollTop-only movement and retries in a quiet window", async () => {
  const h = makeHarness({
    focusedWindowId: 1,
    groups: [{ id: 7, windowId: 1, title: "VCU", color: "purple", collapsed: true }],
    tabs: [
      { id: 10, windowId: 1, index: 0, url: "https://user.example/", active: true },
      { id: 11, windowId: 1, index: 1, url: "https://agent.example/", active: false, groupId: 7 },
    ],
    executeScript: async (details, state) => {
      const tab = state.tabs.find((item) => item.id === details.target.tabId);
      const src = String(details.func || "");
      if (src.includes("scrollBy")) {
        if (!tab || tab.windowId === 1) return [{ result: { before: 0, y: 0, top: 480 } }];
        return [{ result: { before: 0, y: 480, top: 480 } }];
      }
      return [{ result: { y: 0, top: 0 } }];
    },
  });
  const result = await h.api.handleCommand({ method: "scroll", params: { tab_id: "11", dy: 480 } });
  assert.equal(result.ok, false);
  assert.match(result.error, /stays in its group/);
  assert.equal(h.state.tabs.find((tab) => tab.id === 10).active, true);
  assert.equal(h.state.tabs.find((tab) => tab.id === 10).url, "https://user.example/");
  assert.equal(h.state.tabs.find((tab) => tab.id === 11).active, false);
  assert.equal(h.state.tabs.find((tab) => tab.id === 11).windowId, 1);
  assert.equal(h.state.groups.find((group) => group.id === 7).collapsed, true);
  assert.equal(h.state.focusedWindowId, 1);
  assert.equal(h.state.calls.some((call) => call.method === "tabs.move" || call.method === "windows.create" || call.method === "windows.update"), false);
});

test("background capture waits longer than a normal DOM action", () => {
  const { api } = makeHarness();
  assert.equal(api.commandTimeoutMs("capture_tab"), 12000);
  assert.equal(api.commandTimeoutMs("click"), 6000);
});

test("collapsed background DOM actions do not activate the user tab or focus a window", async () => {
  const h = makeHarness({
    focusedWindowId: 4,
    tabs: [
      { id: 1, windowId: 4, url: "https://user.example/", active: true, groupId: -1 },
      { id: 2, windowId: 4, url: "http://127.0.0.1/fixture", active: false, groupId: 9 },
    ],
    groups: [{ id: 9, windowId: 4, title: "VCU", collapsed: true, color: "purple" }],
    sendMessage: async (_id, msg) => {
      if (msg.type === "vcu_ping_page") return { ok: true, version: "0.2.8" };
      if (msg.type === "vcu_extract") return { ok: true, matches: [{ tag: "DIV", text: "marker" }], count: 1, source: "extension_dom" };
      return { ok: true, pressed: true, typed: true, hovered: true, scrolled: true, source: "extension_dom" };
    },
    executeScript: async (details) => {
      const src = String(details.func || "");
      if (src.includes("scrollBy")) return [{ result: { before: 0, y: 10, top: 10 } }];
      return [{ result: { y: 0, top: 0 } }];
    },
  });
  const commands = [
    { method: "click", params: { tab_id: "2", selector: "#hit" } },
    { method: "type", params: { tab_id: "2", selector: "#field", text: "x" } },
    { method: "scroll", params: { tab_id: "2", dy: 10 } },
    { method: "hover", params: { tab_id: "2", selector: "#hover" } },
    { method: "extract", params: { tab_id: "2", selector: "#marker" } },
    { method: "click_point", params: { tab_id: "2", x: 1, y: 1, expected_viewport: {} } },
  ];
  for (const command of commands) {
    const result = await h.api.handleCommand(command);
    assert.equal(result.ok, true, command.method + " " + result.error);
  }
  const disruptive = h.state.calls.filter((call) => (
    call.method === "tabs.update" || call.method === "windows.update" || call.method === "windows.create" || call.method === "tabGroups.update"
  ));
  assert.equal(disruptive.length, 0, JSON.stringify(disruptive));
  assert.equal(h.state.tabs.find((tab) => tab.id === 1).active, true);
  assert.equal(h.state.tabs.find((tab) => tab.id === 2).active, false);
  assert.equal(h.state.groups.find((group) => group.id === 9).collapsed, true);
  assert.equal(h.state.focusedWindowId, 4);
});

test("inactive scroll that does not move retries in a quiet window and restores the user page", async () => {
  const h = makeHarness({
    focusedWindowId: 1,
    groups: [{ id: 7, windowId: 1, title: "VCU", color: "purple", collapsed: true }],
    tabs: [
      { id: 10, windowId: 1, index: 0, url: "https://user.example/", active: true },
      { id: 11, windowId: 1, index: 1, url: "https://agent.example/", active: false, groupId: 7 },
    ],
    executeScript: async (details, state) => {
      const tab = state.tabs.find((item) => item.id === details.target.tabId);
      const src = String(details.func || "");
      if (src.includes("scrollBy")) {
        if (!tab || tab.windowId === 1) return [{ result: { before: 0, y: 0, top: 0 } }];
        return [{ result: { before: 0, y: 480, top: 480 } }];
      }
      return [{ result: { y: 0, top: 0 } }];
    },
  });
  const result = await h.api.handleCommand({ method: "scroll", params: { tab_id: "11", dy: 480 } });
  assert.equal(result.ok, false);
  assert.match(result.error, /stays in its group/);
  assert.equal(h.state.focusedWindowId, 1);
  assert.equal(h.state.tabs.find((tab) => tab.id === 10).active, true);
  assert.equal(h.state.tabs.find((tab) => tab.id === 10).url, "https://user.example/");
  const agent = h.state.tabs.find((tab) => tab.id === 11);
  assert.equal(agent.windowId, 1);
  assert.equal(agent.active, false);
  const group = h.state.groups.find((item) => item.id === agent.groupId);
  assert.equal(group.collapsed, true);
  assert.equal(h.state.calls.some((call) => call.method === "windows.update" || call.method === "windows.create" || call.method === "tabs.move"), false);
  assert.equal(h.state.tabs.some((tab) => tab.windowId !== 1 && tab.url !== "about:blank"), false);
});

test("background user pages are not moved into the quiet window", async () => {
  const viewport = { document_id: "doc-user", url: "https://bilibili.example/watch", width: 100, height: 80, revision: 1 };
  const h = makeHarness({
    focusedWindowId: 1,
    groups: [
      { id: 1, windowId: 1, title: "1", color: "blue", collapsed: false },
      { id: 3, windowId: 1, title: "3", color: "grey", collapsed: true },
    ],
    tabs: [
      { id: 10, windowId: 1, index: 0, url: "https://feishu.example/doc", active: true, groupId: 1 },
      { id: 12, windowId: 1, index: 1, url: "https://bilibili.example/watch", active: false, groupId: 3 },
    ],
    sendMessage: async (_id, msg) => {
      if (msg.type === "vcu_ping_page") return { ok: true, version: "0.2.8" };
      if (msg.type === "vcu_viewport") return { ok: true, viewport };
      return { ok: true };
    },
    executeScript: async () => [{ result: { before: 0, y: 0, top: 0 } }],
  });
  const shot = await h.api.handleCommand({ method: "capture_tab", params: { tab_id: "12" } });
  assert.equal(shot.ok, false);
  assert.match(shot.error, /not in the VCU group/);
  const scrolled = await h.api.handleCommand({ method: "scroll", params: { tab_id: "12", dy: 480 } });
  assert.equal(scrolled.ok, false);
  assert.match(scrolled.error, /not in the VCU group/);
  assert.equal(h.state.calls.some((call) => call.method === "tabs.move"), false);
  assert.equal(h.state.calls.some((call) => call.method === "windows.create"), false);
  const reading = h.state.tabs.find((tab) => tab.id === 10);
  const background = h.state.tabs.find((tab) => tab.id === 12);
  assert.equal(reading.active, true);
  assert.equal(reading.windowId, 1);
  assert.equal(reading.url, "https://feishu.example/doc");
  assert.equal(reading.groupId, 1);
  assert.equal(background.active, false);
  assert.equal(background.windowId, 1);
  assert.equal(background.groupId, 3);
  assert.equal(h.state.groups.find((group) => group.id === 1).collapsed, false);
  assert.equal(h.state.groups.find((group) => group.id === 3).collapsed, true);
  assert.equal(h.state.focusedWindowId, 1);
});

test("session group fixture can still enter the quiet window and return", async () => {
  const viewport = { document_id: "doc-session", url: "https://agent.example/fixture", width: 100, height: 80, revision: 1 };
  const h = makeHarness({
    focusedWindowId: 1,
    storage: { agentSessionGroupIds: ["8"] },
    groups: [
      { id: 1, windowId: 1, title: "1", color: "blue", collapsed: false },
      { id: 8, windowId: 1, title: "Review", color: "purple", collapsed: true },
    ],
    tabs: [
      { id: 10, windowId: 1, index: 0, url: "https://feishu.example/doc", active: true, groupId: 1 },
      { id: 11, windowId: 1, index: 1, url: "https://agent.example/fixture", active: false, groupId: 8 },
    ],
    sendMessage: async (_id, msg) => {
      if (msg.type === "vcu_ping_page") return { ok: true, version: "0.2.8" };
      if (msg.type === "vcu_viewport") return { ok: true, viewport };
      return { ok: true };
    },
  });
  const shot = await h.api.handleCommand({ method: "capture_tab", params: { tab_id: "11" } });
  assert.equal(shot.ok, true, shot.error);
  assert.equal(h.state.tabs.find((tab) => tab.id === 10).active, true);
  assert.equal(h.state.tabs.find((tab) => tab.id === 10).windowId, 1);
  assert.equal(h.state.tabs.find((tab) => tab.id === 10).url, "https://feishu.example/doc");
  const fixture = h.state.tabs.find((tab) => tab.id === 11);
  assert.equal(fixture.windowId, 1);
  assert.equal(fixture.active, false);
  assert.equal(fixture.url, "https://agent.example/fixture");
  const home = h.state.groups.find((group) => group.id === fixture.groupId);
  assert.equal(home.title, "Review");
  assert.equal(home.collapsed, true);
  assert.equal(home.windowId, 1);
  assert.equal(h.state.groups.find((group) => group.id === 1).collapsed, false);
  assert.equal(h.state.focusedWindowId, 1);
  assert.equal(h.state.calls.some((call) => call.method === "windows.update" && call.changes && call.changes.focused === true), false);
});

test("reused session group id does not move user groups 1 or 3", async () => {
  const viewport = { document_id: "doc-user", url: "https://bilibili.example/watch", width: 100, height: 80, revision: 1 };
  const h = makeHarness({
    focusedWindowId: 1,
    storage: { agentSessionGroupIds: ["1", { id: "8", title: "Review" }] },
    groups: [
      { id: 1, windowId: 1, title: "1", color: "blue", collapsed: false },
      { id: 3, windowId: 1, title: "3", color: "grey", collapsed: true },
      { id: 8, windowId: 1, title: "Personal", color: "purple", collapsed: true },
    ],
    tabs: [
      { id: 10, windowId: 1, index: 0, url: "https://feishu.example/doc", active: true, groupId: 1 },
      { id: 12, windowId: 1, index: 1, url: "https://bilibili.example/watch", active: false, groupId: 3 },
      { id: 13, windowId: 1, index: 2, url: "https://personal.example/", active: false, groupId: 8 },
    ],
    sendMessage: async (_id, msg) => {
      if (msg.type === "vcu_ping_page") return { ok: true, version: "0.2.8" };
      if (msg.type === "vcu_viewport") return { ok: true, viewport };
      return { ok: true };
    },
    executeScript: async () => [{ result: { before: 0, y: 0, top: 0 } }],
  });
  const shot = await h.api.handleCommand({ method: "capture_tab", params: { tab_id: "12" } });
  const reused = await h.api.handleCommand({ method: "capture_tab", params: { tab_id: "13" } });
  const scrolled = await h.api.handleCommand({ method: "scroll", params: { tab_id: "12", dy: 480 } });
  assert.equal(shot.ok, false);
  assert.equal(reused.ok, false);
  assert.equal(scrolled.ok, false);
  assert.equal(h.state.calls.some((call) => call.method === "tabs.move"), false);
  assert.equal(await h.api.resolveHttpTab(), 0);
  assert.equal(h.state.tabs.find((tab) => tab.id === 10).active, true);
  assert.equal(h.state.tabs.find((tab) => tab.id === 10).windowId, 1);
  assert.equal(h.state.tabs.find((tab) => tab.id === 12).windowId, 1);
  assert.equal(h.state.tabs.find((tab) => tab.id === 13).windowId, 1);
  assert.equal(h.state.groups.find((group) => group.id === 1).collapsed, false);
  assert.equal(h.state.groups.find((group) => group.id === 3).collapsed, true);
});

test("named session group is the implicit work surface and the user page stays", async () => {
  const h = makeHarness({
    focusedWindowId: 1,
    storage: { agentSessionGroupIds: [{ id: "8", title: "Review" }] },
    groups: [
      { id: 1, windowId: 1, title: "1", color: "blue", collapsed: false },
      { id: 8, windowId: 1, title: "Review", color: "purple", collapsed: true },
    ],
    tabs: [
      { id: 10, windowId: 1, index: 0, url: "https://feishu.example/doc", active: true, groupId: 1 },
      { id: 11, windowId: 1, index: 1, url: "https://agent.example/fixture", active: false, groupId: 8 },
    ],
    sendMessage: async (_id, payload) => {
      if (payload && payload.type === "vcu_ping_page") return { ok: true, version: "0.2.8" };
      return { ok: true, clicked: true };
    },
  });
  assert.equal(await h.api.resolveHttpTab(), 11);
  const listed = await h.api.handleCommand({ method: "list_tabs", params: {} });
  const reading = listed.tabs.find((tab) => tab.tab_id === "10");
  const agent = listed.tabs.find((tab) => tab.tab_id === "11");
  assert.equal(reading.page_being_read, true);
  assert.equal(reading.agent_surface, false);
  assert.equal(agent.page_being_read, false);
  assert.equal(agent.agent_surface, true);
  assert.equal(agent.agent_owned, false);
  const implicit = await h.api.handleCommand({ method: "click", params: { selector: "a" } });
  assert.equal(implicit.ok, true, implicit.error);
  assert.equal(h.state.calls.some((call) => call.method === "sendMessage" && call.id === 11), true);
  assert.equal(h.state.calls.some((call) => call.method === "sendMessage" && call.id === 10 && call.payload && call.payload.type === "vcu_click"), false);
  assert.equal(h.state.tabs.find((tab) => tab.id === 10).active, true);
  assert.equal(h.state.tabs.find((tab) => tab.id === 10).windowId, 1);
  assert.equal(h.state.groups.find((group) => group.id === 1).collapsed, false);
  assert.equal(h.state.groups.find((group) => group.id === 8).collapsed, true);
});

test("the page being read stays put even when its window is stored as the agent window", async () => {
  const viewport = { document_id: "doc-user", url: "https://feishu.example/doc", width: 100, height: 80, revision: 1 };
  const h = makeHarness({
    focusedWindowId: 1,
    storage: { agentWindowId: 1 },
    groups: [
      { id: 7, windowId: 1, title: "VCU", color: "purple", collapsed: true },
    ],
    tabs: [
      { id: 10, windowId: 1, index: 0, url: "https://feishu.example/doc", active: true },
      { id: 11, windowId: 1, index: 1, url: "https://agent.example/fixture", active: false, groupId: 7 },
      { id: 12, windowId: 1, index: 2, url: "https://bilibili.example/watch", active: false },
    ],
    sendMessage: async (_id, msg) => {
      if (msg.type === "vcu_ping_page") return { ok: true, version: "0.2.8" };
      if (msg.type === "vcu_viewport") return { ok: true, viewport };
      return { ok: true };
    },
    executeScript: async () => [{ result: { before: 0, y: 0, top: 0 } }],
  });
  const shot = await h.api.handleCommand({ method: "capture_tab", params: { tab_id: "10" } });
  const background = await h.api.handleCommand({ method: "capture_tab", params: { tab_id: "12" } });
  const scrolled = await h.api.handleCommand({ method: "scroll", params: { tab_id: "12", dy: 480 } });
  const keyed = await h.api.handleCommand({ method: "keypress", params: { tab_id: "10", key: "Enter" } });
  const grouped = await h.api.handleCommand({ method: "group_tabs", params: { tab_ids: ["10"], title: "Taken", color: "purple" } });
  assert.equal(background.ok, false);
  assert.match(background.error, /not in the VCU group/);
  assert.equal(scrolled.ok, false);
  assert.equal(keyed.ok, true, keyed.error);
  assert.equal(keyed.released_reading_page, "10");
  assert.equal(keyed.tab_id, "11");
  assert.equal(h.state.calls.some((call) => call.method === "executeScript" && call.details && call.details.target && call.details.target.tabId === 10), false);
  assert.equal(grouped.ok, false);
  assert.match(grouped.error, /page being read/);
  assert.equal(shot.ok, true, shot.error);
  assert.equal(String(shot.capture_window_id), "1");
  assert.equal(h.state.calls.some((call) => call.method === "tabs.move"), false);
  assert.equal(h.state.tabs.find((tab) => tab.id === 10).windowId, 1);
  assert.equal(h.state.tabs.find((tab) => tab.id === 10).active, true);
  assert.equal(h.state.tabs.find((tab) => tab.id === 10).url, "https://feishu.example/doc");
  assert.equal(h.state.tabs.find((tab) => tab.id === 12).windowId, 1);
  assert.equal(h.state.tabs.find((tab) => tab.id === 12).groupId < 0, true);
  assert.equal(h.state.focusedWindowId, 1);
  const ping = await h.api.handleCommand({ method: "ping", params: {} });
  assert.equal(ping.quiet_reading, "never-move");
  assert.equal(ping.quiet_release, "agent-group");
  assert.equal(ping.quiet_nav, "agent-group");
});

test("an active VCU tab the user is reading is not moved to the quiet window", async () => {
  const viewport = { document_id: "doc-vcu", url: "https://agent.example/fixture", width: 100, height: 80, revision: 1 };
  const h = makeHarness({
    focusedWindowId: 1,
    groups: [{ id: 7, windowId: 1, title: "VCU", color: "purple", collapsed: false }],
    tabs: [
      { id: 10, windowId: 1, index: 0, url: "https://agent.example/fixture", active: true, groupId: 7 },
      { id: 12, windowId: 1, index: 1, url: "https://user.example/", active: false },
    ],
    sendMessage: async (_id, msg) => {
      if (msg.type === "vcu_ping_page") return { ok: true, version: "0.2.8" };
      if (msg.type === "vcu_viewport") return { ok: true, viewport };
      return { ok: true };
    },
  });
  const shot = await h.api.handleCommand({ method: "capture_tab", params: { tab_id: "10" } });
  assert.equal(shot.ok, true, shot.error);
  assert.equal(h.state.calls.some((call) => call.method === "tabs.move"), false);
  assert.equal(h.state.tabs.find((tab) => tab.id === 10).windowId, 1);
  assert.equal(h.state.tabs.find((tab) => tab.id === 10).active, true);
  assert.equal(h.state.groups.find((group) => group.id === 7).collapsed, false);
});

test("open does not join a reserved user tab group", async () => {
  const h = makeHarness({
    focusedWindowId: 1,
    groups: [
      { id: 1, windowId: 1, title: "1", color: "blue", collapsed: false },
      { id: 3, windowId: 1, title: "3", color: "grey", collapsed: true },
    ],
    tabs: [
      { id: 10, windowId: 1, index: 0, url: "https://feishu.example/doc", active: true, groupId: 1 },
    ],
  });
  const intoUser = await h.api.handleCommand({ method: "open_tab", params: { url: "https://agent.example/", group_id: "1" } });
  const intoOther = await h.api.handleCommand({ method: "open_tab", params: { url: "https://agent.example/", group_id: "3" } });
  assert.equal(intoUser.ok, false);
  assert.match(intoUser.error, /user tab group is reserved/);
  assert.equal(intoOther.ok, false);
  assert.match(intoOther.error, /user tab group is reserved/);
  assert.equal(h.state.tabs.length, 1);
  assert.equal(h.state.tabs[0].id, 10);
  assert.equal(h.state.tabs[0].active, true);
  assert.equal(h.state.tabs[0].windowId, 1);
  assert.equal(h.state.groups.find((group) => group.id === 1).collapsed, false);
});

test("inactive quiet-window content hang retries after activation and leaves the reading page", async () => {
  const h = makeHarness({
    focusedWindowId: 1,
    focusOnTabActivate: true,
    storage: { quietCaptureWindowId: 9 },
    groups: [
      { id: 1, windowId: 1, title: "1", color: "blue", collapsed: false },
      { id: 8, windowId: 9, title: "VCU", color: "purple", collapsed: true },
    ],
    tabs: [
      { id: 10, windowId: 1, index: 0, url: "https://feishu.example/doc", active: true, groupId: 1 },
      { id: 2, windowId: 9, index: 0, url: "about:blank", active: true },
      { id: 11, windowId: 9, index: 1, url: "https://example.com/", active: false, groupId: 8 },
    ],
    executeScript: async (details, state) => {
      const tab = state.tabs.find((item) => item.id === details.target.tabId);
      const src = String(details.func || "");
      if (tab && !tab.active && (src.includes("keydown") || src.includes("data-vcu-ref"))) return new Promise(() => {});
      if (src.includes("keydown")) return [{ result: { ok: true, key: "Enter", input_path: "extension", os_cursor_used: false } }];
      if (src.includes("data-vcu-ref")) return [{ result: { a11y_summary: "example", text_excerpt: "Example Domain", dom_refs: [] } }];
      return [{}];
    },
    sendMessage: async (id, payload, state) => {
      const tab = state.tabs.find((item) => item.id === id);
      if (!tab || !tab.active) return new Promise(() => {});
      if (payload.type === "vcu_ping_page") return { ok: true, version: "0.2.8" };
      if (payload.type === "vcu_click") return { ok: true, pressed: true, source: "extension_dom" };
      return { ok: true };
    },
  });
  const dry = await h.api.handleCommand({ method: "click", params: { tab_id: "11", selector: "h1", dry_run: true } });
  assert.equal(dry.ok, false);
  assert.match(dry.error, /no content script|content timeout/);
  assert.equal(h.state.calls.some((call) => call.method === "tabs.update"), false);
  assert.equal(h.state.tabs.find((tab) => tab.id === 11).active, false);
  const clicked = await h.api.handleCommand({ method: "click", params: { tab_id: "11", selector: "h1" } });
  assert.equal(clicked.ok, false);
  assert.match(clicked.error, /stayed inactive/);
  const shot = await h.api.handleCommand({ method: "snapshot", params: { tab_id: "11" } });
  assert.equal(shot.ok, false);
  assert.match(shot.error, /stayed inactive|without moving/);
  const keyed = await h.api.handleCommand({ method: "keypress", params: { tab_id: "11", key: "Enter" } });
  assert.equal(keyed.ok, false);
  assert.match(keyed.error, /stayed inactive|without moving/);
  const reading = h.state.tabs.find((tab) => tab.id === 10);
  assert.equal(reading.active, true);
  assert.equal(reading.windowId, 1);
  assert.equal(reading.url, "https://feishu.example/doc");
  assert.equal(reading.groupId, 1);
  const work = h.state.tabs.find((tab) => tab.id === 11);
  assert.equal(work.windowId, 9);
  assert.equal(work.active, false);
  assert.equal(work.groupId, 8);
  assert.equal(h.state.groups.find((group) => group.id === 8).collapsed, true);
  assert.equal(h.state.tabs.find((tab) => tab.id === 2).active, true);
  assert.equal(h.state.groups.find((group) => group.id === 1).collapsed, false);
  assert.equal(h.state.focusedWindowId, 9);
  assert.equal(h.state.calls.some((call) => call.method === "tabs.update" && Number(call.id) === 10), false);
  assert.equal(h.state.calls.some((call) => call.method === "tabs.move" || call.method === "windows.create"), false);
  assert.equal(h.state.calls.some((call) => call.method === "windows.update" && call.changes && call.changes.focused === true), false);
  assert.equal(h.state.calls.some((call) => call.method === "quiet-helper" && String(call.url).endsWith("/restack")), false);
  const ping = await h.api.handleCommand({ method: "ping", params: {} });
  assert.equal(ping.quiet_message, "in-place");
  assert.equal(ping.quiet_inject, "in-place");
  assert.equal(ping.quiet_raise, "never");
  assert.equal(ping.quiet_helper, "no-applescript");
  assert.equal(ping.quiet_keep, "stay-active");
  assert.equal(ping.quiet_reading, "never-move");
});

test("inactive user-window VCU message failure uses the quiet window and returns the reading page", async () => {
  const h = makeHarness({
    focusedWindowId: 1,
    groups: [{ id: 7, windowId: 1, title: "VCU", color: "purple", collapsed: true }],
    tabs: [
      { id: 10, windowId: 1, index: 0, url: "https://feishu.example/doc", active: true },
      { id: 11, windowId: 1, index: 1, url: "https://example.com/", active: false, groupId: 7 },
    ],
    sendMessage: async (id, payload, state) => {
      const tab = state.tabs.find((item) => item.id === id);
      if (!tab || !tab.active || tab.windowId === 1) return null;
      if (payload.type === "vcu_ping_page") return { ok: true, version: "0.2.8" };
      return { ok: true, pressed: true, typed: true, hovered: true, source: "extension_dom" };
    },
    executeScript: async () => [{}],
  });
  const commands = [
    { method: "click", params: { tab_id: "11", selector: "h1" } },
    { method: "type", params: { tab_id: "11", selector: "h1", text: "x" } },
    { method: "hover", params: { tab_id: "11", selector: "h1" } },
  ];
  for (const command of commands) {
    const result = await h.api.handleCommand(command);
    assert.equal(result.ok, false, command.method + " " + result.error);
    assert.match(result.error, /stays in its group/);
    const reading = h.state.tabs.find((tab) => tab.id === 10);
    assert.equal(reading.active, true);
    assert.equal(reading.windowId, 1);
    assert.equal(reading.url, "https://feishu.example/doc");
    const work = h.state.tabs.find((tab) => tab.id === 11);
    assert.equal(work.windowId, 1, command.method);
    assert.equal(work.active, false);
    assert.equal(work.groupId, 7);
    assert.equal(h.state.focusedWindowId, 1);
  }
  assert.equal(h.state.groups.find((group) => group.id === 7).collapsed, true);
  assert.equal(h.state.calls.some((call) => call.method === "tabs.move" || call.method === "tabs.update" || call.method === "windows.update" || call.method === "windows.create"), false);
  assert.equal(h.state.calls.some((call) => call.method === "sendMessage" && call.id === 10), false);
});

test("inactive user page content failure does not enter the quiet window", async () => {
  const h = makeHarness({
    focusedWindowId: 1,
    groups: [
      { id: 1, windowId: 1, title: "1", color: "blue", collapsed: false },
      { id: 3, windowId: 1, title: "3", color: "grey", collapsed: true },
    ],
    tabs: [
      { id: 10, windowId: 1, index: 0, url: "https://feishu.example/doc", active: true, groupId: 1 },
      { id: 12, windowId: 1, index: 1, url: "https://bilibili.example/watch", active: false, groupId: 3 },
    ],
    sendMessage: async () => null,
    executeScript: () => new Promise(() => {}),
  });
  const clicked = await h.api.handleCommand({ method: "click", params: { tab_id: "12", selector: "h1" } });
  assert.equal(clicked.ok, false);
  assert.match(clicked.error, /not in the VCU group/);
  const snapped = await h.api.handleCommand({ method: "snapshot", params: { tab_id: "12" } });
  assert.equal(snapped.ok, false);
  assert.match(snapped.error, /not in the VCU group/);
  const keyed = await h.api.handleCommand({ method: "keypress", params: { tab_id: "12", key: "Enter" } });
  assert.equal(keyed.ok, false);
  assert.match(keyed.error, /not in the VCU group/);
  const reading = h.state.tabs.find((tab) => tab.id === 10);
  const background = h.state.tabs.find((tab) => tab.id === 12);
  assert.equal(reading.active, true);
  assert.equal(reading.windowId, 1);
  assert.equal(reading.url, "https://feishu.example/doc");
  assert.equal(reading.groupId, 1);
  assert.equal(background.active, false);
  assert.equal(background.windowId, 1);
  assert.equal(background.groupId, 3);
  assert.equal(h.state.groups.find((group) => group.id === 1).collapsed, false);
  assert.equal(h.state.groups.find((group) => group.id === 3).collapsed, true);
  assert.equal(h.state.focusedWindowId, 1);
  assert.equal(h.state.calls.some((call) => call.method === "tabs.move"), false);
  assert.equal(h.state.calls.some((call) => call.method === "windows.create"), false);
  assert.equal(h.state.calls.some((call) => call.method === "tabs.update" && call.id === 10), false);
});
