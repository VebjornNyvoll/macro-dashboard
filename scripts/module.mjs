// Macro Dashboard - module entry point.
// Registers settings, keybindings, scene-controls tool button, and exposes
// the public API at game.macroDashboard.
//
// Diagnostics: this file logs `Macro Dashboard | <stage>` to the F12
// console at every life-cycle stage. If you don't see at least the
// "module.mjs evaluating" line, the entry script never ran and Foundry
// is failing at the manifest / esmodules / 404 layer (check the Network
// tab for failing requests).

console.log("Macro Dashboard | module.mjs evaluating");

// IMPORTANT: keep `./constants.mjs` as the FIRST import so that MODULE_ID is
// fully initialized before any of the app modules below are evaluated. They
// access MODULE_ID at class-declaration time (in `static PARTS`) and would
// otherwise hit a Temporal Dead Zone error through this circular graph.
import { MODULE_ID, SETTINGS }                from "./constants.mjs";
import { MacroDashboardApp }                  from "./apps/dashboard-app.mjs";
import { MacroLibraryApp }                    from "./apps/library-app.mjs";
import { SYSTEMS, API, registerBuiltinShims } from "./systems.js";

export { MODULE_ID, SETTINGS };

console.log("Macro Dashboard | imports resolved (constants, apps, systems)");

// ---------------------------------------------------------------------------
// Settings & keybindings registration

function registerSettings() {
  game.settings.register(MODULE_ID, SETTINGS.DASHBOARDS, {
    scope:   "world",
    config:  false,
    type:    Object,
    default: { global: [] }
  });

  game.settings.register(MODULE_ID, SETTINGS.GROUPS, {
    scope:   "world",
    config:  false,
    type:    Object,
    default: []
  });

  game.settings.register(MODULE_ID, SETTINGS.AUTO_SWITCH, {
    name:    "MACRO_DASHBOARD.Settings.AutoSwitch.Name",
    hint:    "MACRO_DASHBOARD.Settings.AutoSwitch.Hint",
    scope:   "world",
    config:  true,
    type:    Boolean,
    default: true,
    onChange: () => MacroDashboardApp.instance?.render()
  });

  game.settings.register(MODULE_ID, SETTINGS.TILE_SIZE, {
    name:    "MACRO_DASHBOARD.Settings.TileSize.Name",
    hint:    "MACRO_DASHBOARD.Settings.TileSize.Hint",
    scope:   "client",
    config:  true,
    type:    String,
    choices: {
      sm: "MACRO_DASHBOARD.Settings.TileSize.Small",
      md: "MACRO_DASHBOARD.Settings.TileSize.Medium",
      lg: "MACRO_DASHBOARD.Settings.TileSize.Large"
    },
    default: "md",
    onChange: () => MacroDashboardApp.instance?.render()
  });

  game.settings.register(MODULE_ID, SETTINGS.LAYOUT, {
    name:    "MACRO_DASHBOARD.Settings.Layout.Name",
    hint:    "MACRO_DASHBOARD.Settings.Layout.Hint",
    scope:   "client",
    config:  true,
    type:    String,
    choices: {
      grid:    "MACRO_DASHBOARD.Settings.Layout.Grid",
      columns: "MACRO_DASHBOARD.Settings.Layout.Columns"
    },
    default: "grid",
    onChange: () => MacroDashboardApp.instance?.render()
  });

  // Manual mode: which scene the GM is currently viewing dashboards for.
  // Only consulted when autoSwitch === false.
  game.settings.register(MODULE_ID, SETTINGS.VIEWING_SCENE_ID, {
    scope:   "client",
    config:  false,
    type:    String,
    default: ""
  });
}

function registerKeybindings() {
  game.keybindings.register(MODULE_ID, "toggleDashboard", {
    name:       "MACRO_DASHBOARD.Keybinding.ToggleDashboard.Name",
    hint:       "MACRO_DASHBOARD.Keybinding.ToggleDashboard.Hint",
    editable:   [{ key: "KeyM" }],
    onDown:     () => { MacroDashboardApp.toggle(); return true; },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE?.NORMAL ?? 0
  });

  game.keybindings.register(MODULE_ID, "toggleLibrary", {
    name:       "MACRO_DASHBOARD.Keybinding.ToggleLibrary.Name",
    hint:       "MACRO_DASHBOARD.Keybinding.ToggleLibrary.Hint",
    editable:   [{ key: "KeyL" }],
    onDown:     () => { MacroLibraryApp.toggle(); return true; },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE?.NORMAL ?? 0
  });
}

// ---------------------------------------------------------------------------
// State helpers (read/write the world setting holding all dashboards)

export const State = {
  /** @returns {{global: Dashboard[], [sceneId: string]: Dashboard[]}} */
  read() {
    return foundry.utils.deepClone(game.settings.get(MODULE_ID, SETTINGS.DASHBOARDS) ?? { global: [] });
  },

  /** @param {object} next */
  async write(next) {
    return game.settings.set(MODULE_ID, SETTINGS.DASHBOARDS, next);
  },

  /** Update the dashboard with the given id, applying mutator(d) -> newD. */
  async update(dashboardId, mutator) {
    const data = this.read();
    let found = false;
    for (const key of Object.keys(data)) {
      const arr = data[key];
      if (!Array.isArray(arr)) continue;
      const idx = arr.findIndex(d => d.id === dashboardId);
      if (idx >= 0) {
        arr[idx] = mutator(arr[idx]);
        found = true;
        break;
      }
    }
    if (!found) return null;
    await this.write(data);
    return data;
  },

  /** Add a new dashboard scoped to the given scene id (or "global"). */
  async create(scope, dashboard) {
    const data = this.read();
    if (!Array.isArray(data[scope])) data[scope] = [];
    data[scope].push(dashboard);
    await this.write(data);
    return dashboard;
  },

  /** Delete a dashboard by id from any scope. */
  async destroy(dashboardId) {
    const data = this.read();
    for (const key of Object.keys(data)) {
      if (!Array.isArray(data[key])) continue;
      const before = data[key].length;
      data[key] = data[key].filter(d => d.id !== dashboardId);
      if (data[key].length !== before) {
        await this.write(data);
        return true;
      }
    }
    return false;
  },

  /** Move a dashboard from its current scope to `newScope` (a scene id, or
   *  the literal string "global"). Returns the moved dashboard, or null if
   *  no dashboard with that id was found. */
  async moveScope(dashboardId, newScope) {
    const data = this.read();
    let dashboard = null;
    for (const key of Object.keys(data)) {
      if (!Array.isArray(data[key])) continue;
      const idx = data[key].findIndex(d => d.id === dashboardId);
      if (idx >= 0) {
        dashboard = data[key].splice(idx, 1)[0];
        break;
      }
    }
    if (!dashboard) return null;
    if (!Array.isArray(data[newScope])) data[newScope] = [];
    data[newScope].push(dashboard);
    await this.write(data);
    return dashboard;
  },

  /** Duplicate a dashboard within its current scope. Tiles are deep-cloned
   *  with fresh ids so edits to the copy don't affect the original. Returns
   *  the new dashboard, or null if `dashboardId` was not found. */
  async duplicate(dashboardId) {
    const data = this.read();
    for (const key of Object.keys(data)) {
      if (!Array.isArray(data[key])) continue;
      const original = data[key].find(d => d.id === dashboardId);
      if (!original) continue;
      const clone = {
        ...foundry.utils.deepClone(original),
        id:    this.newId("d"),
        name:  `${original.name} (copy)`,
        tiles: (original.tiles ?? []).map(t => ({ ...t, id: this.newId("t") }))
      };
      data[key].push(clone);
      await this.write(data);
      return clone;
    }
    return null;
  },

  /** Generate a new short id. */
  newId(prefix = "md") {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  },

  // -------- Groups --------------------------------------------------------

  /** @returns {PresetGroup[]} */
  readGroups() {
    return foundry.utils.deepClone(game.settings.get(MODULE_ID, SETTINGS.GROUPS) ?? []);
  },

  async writeGroups(groups) {
    return game.settings.set(MODULE_ID, SETTINGS.GROUPS, groups);
  },

  async createGroup(group) {
    const groups = this.readGroups();
    groups.push(group);
    await this.writeGroups(groups);
    return group;
  },

  async updateGroup(groupId, mutator) {
    const groups = this.readGroups();
    const idx = groups.findIndex(g => g.id === groupId);
    if (idx < 0) return null;
    groups[idx] = mutator(groups[idx]);
    await this.writeGroups(groups);
    return groups[idx];
  },

  async destroyGroup(groupId) {
    const groups = this.readGroups();
    const filtered = groups.filter(g => g.id !== groupId);
    if (filtered.length === groups.length) return false;
    await this.writeGroups(filtered);
    return true;
  }
};

// ---------------------------------------------------------------------------
// Lifecycle hooks

Hooks.once("init", () => {
  console.log("Macro Dashboard | init hook firing");
  registerSettings();
  registerKeybindings();
  console.log("Macro Dashboard | init complete: 6 settings + 2 keybindings registered");
});

// ---------------------------------------------------------------------------
// Per-tile hotkey listener helpers

function _comboFromEvent(ev) {
  if (!ev.key || ev.key.length === 0) return null;
  if (["Control", "Shift", "Alt", "Meta", "OS"].includes(ev.key)) return null;
  const parts = [];
  if (ev.ctrlKey)  parts.push("Ctrl");
  if (ev.altKey)   parts.push("Alt");
  if (ev.shiftKey) parts.push("Shift");
  parts.push(ev.code);
  return parts.join("+");
}

function _normalizeCombo(s) {
  if (!s) return "";
  return s.split("+").map(p => p.trim()).filter(Boolean).map(p => {
    const k = p.toLowerCase();
    if (k === "ctrl" || k === "control") return "Ctrl";
    if (k === "shift")                   return "Shift";
    if (k === "alt")                     return "Alt";
    if (k === "meta" || k === "cmd")     return "Meta";
    if (/^[a-zA-Z]$/.test(p)) return "Key" + p.toUpperCase();
    if (/^[0-9]$/.test(p))    return "Digit" + p;
    return p;
  }).join("+");
}

function _onTileHotkey(ev) {
  if (!game.user?.isGM) return;
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable) return;

  const combo = _comboFromEvent(ev);
  if (!combo) return;

  const data = State.read();
  const activeSceneId = game.scenes.active?.id;
  const candidates = [
    ...(data.global ?? []),
    ...(data[activeSceneId] ?? [])
  ];
  for (const dash of candidates) {
    for (const tile of (dash.tiles ?? [])) {
      if (!tile.hotkey) continue;
      if (_normalizeCombo(tile.hotkey) === combo) {
        ev.preventDefault();
        const macro = game.macros.get(tile.macroId);
        const token = canvas.tokens.controlled[0];
        macro?.execute({ actor: token?.actor, token });
        return;
      }
    }
  }
}

Hooks.once("ready", () => {
  console.log("Macro Dashboard | ready hook firing");

  // Public API
  game.macroDashboard = {
    open:        () => MacroDashboardApp.toggle(),
    openLibrary: () => MacroLibraryApp.toggle(),
    State,
    SYSTEMS,
    API,
    MacroDashboardApp,
    MacroLibraryApp
  };
  console.log("Macro Dashboard | public API exposed at game.macroDashboard");

  // Auto-register first-party system shims (e.g. dnd5e)
  registerBuiltinShims();

  // Notify companion modules that the API is ready for addSystemIntegration calls
  Hooks.callAll("macro-dashboard-ready", API);

  // Per-tile hotkey listener.
  //
  // GM only and intentionally GLOBAL (attached to `document`) - per-tile
  // hotkeys must fire whether or not the dashboard window is open. Tying
  // this listener to the dashboard application's lifecycle would silently
  // break the hotkey feature any time the user closed the window.
  //
  // The listener is attached exactly once per session: `Hooks.once("ready")`
  // fires once, and a page reload destroys the entire JS context (so no
  // stale listener can survive into the next session).
  if (game.user?.isGM) {
    document.addEventListener("keydown", _onTileHotkey);
  }
});

// Scene-controls left-rail tool button (GM only)
//
// v12: `controls` is an Array of { name, tools: Array }. Token control is "token".
// v13/v14: `controls` is a Record<string, control> keyed by control name. The
// token control was renamed to "tokens" (plural) and `tools` is now a
// Record<string, tool> keyed by tool name. The callback property is also
// `onChange` instead of `onClick` (we set both - the unused one is ignored).
Hooks.on("getSceneControlButtons", (controls) => {
  console.log(`Macro Dashboard | getSceneControlButtons fired (controls is ${Array.isArray(controls) ? "Array (v12)" : "Record (v13/v14)"})`);
  if (!game.user?.isGM) return;

  const binding = game.keybindings?.bindings?.get(`${MODULE_ID}.toggleDashboard`)?.[0];
  const keyLabel = binding?.key?.replace(/^Key/, "") ?? "M";

  const tool = {
    name:    "macro-dashboard",
    title:   game.i18n.format("MACRO_DASHBOARD.SceneControl.Tooltip", { key: keyLabel }),
    icon:    "fa-solid fa-th",
    button:  true,
    visible: true,
    order:   99,
    onClick: () => MacroDashboardApp.toggle(),
    onChange: () => MacroDashboardApp.toggle()
  };

  // Locate the token control across both API shapes.
  const tokenControls = Array.isArray(controls)
    ? controls.find(c => c.name === "token")        // v12
    : (controls.tokens ?? controls.token);          // v13/v14
  if (!tokenControls) return;

  // Add the tool across both API shapes.
  if (Array.isArray(tokenControls.tools)) {
    tokenControls.tools.push(tool);                 // v12
  } else if (tokenControls.tools && typeof tokenControls.tools === "object") {
    tokenControls.tools[tool.name] = tool;          // v13/v14
  }
});

// Auto-switch: when the canvas displays a new scene, re-render the dashboard
// so its "Viewing:" line and tabs reflect the new scene.
Hooks.on("canvasReady", () => {
  if (!game.user?.isGM) return;
  if (game.settings.get(MODULE_ID, SETTINGS.AUTO_SWITCH)) {
    MacroDashboardApp.instance?.render();
  }
});
