// Macro Dashboard - module entry point.
// Registers settings, keybindings, scene-controls tool button, and exposes
// the public API at game.macroDashboard.

import { MacroDashboardApp } from "./apps/dashboard-app.mjs";
import { MacroLibraryApp }   from "./apps/library-app.mjs";
import { SYSTEMS, API, registerBuiltinShims } from "./systems.js";

export const MODULE_ID = "macro-dashboard";

// ---------------------------------------------------------------------------
// Settings & keybindings registration

function registerSettings() {
  game.settings.register(MODULE_ID, "dashboards", {
    scope:   "world",
    config:  false,
    type:    Object,
    default: { global: [] }
  });

  game.settings.register(MODULE_ID, "groups", {
    scope:   "world",
    config:  false,
    type:    Object,
    default: []
  });

  game.settings.register(MODULE_ID, "autoSwitch", {
    name:    "MACRO_DASHBOARD.Settings.AutoSwitch.Name",
    hint:    "MACRO_DASHBOARD.Settings.AutoSwitch.Hint",
    scope:   "world",
    config:  true,
    type:    Boolean,
    default: true,
    onChange: () => MacroDashboardApp.instance?.render()
  });

  game.settings.register(MODULE_ID, "tileSize", {
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

  game.settings.register(MODULE_ID, "layout", {
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
  game.settings.register(MODULE_ID, "viewingSceneId", {
    scope:   "client",
    config:  false,
    type:    String,
    default: ""
  });
}

function registerKeybindings() {
  game.keybindings.register(MODULE_ID, "toggleDashboard", {
    name:     "MACRO_DASHBOARD.Keybinding.ToggleDashboard.Name",
    editable: [{ key: "KeyM" }],
    onDown:   () => { if (game.user.isGM) MacroDashboardApp.toggle(); return true; },
    restricted: true
  });

  game.keybindings.register(MODULE_ID, "toggleLibrary", {
    name:     "MACRO_DASHBOARD.Keybinding.ToggleLibrary.Name",
    editable: [{ key: "KeyL" }],
    onDown:   () => { if (game.user.isGM) MacroLibraryApp.toggle(); return true; },
    restricted: true
  });
}

// ---------------------------------------------------------------------------
// State helpers (read/write the world setting holding all dashboards)

export const State = {
  /** @returns {{global: Dashboard[], [sceneId: string]: Dashboard[]}} */
  read() {
    return foundry.utils.deepClone(game.settings.get(MODULE_ID, "dashboards") ?? { global: [] });
  },

  /** @param {object} next */
  async write(next) {
    return game.settings.set(MODULE_ID, "dashboards", next);
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

  /** Generate a new short id. */
  newId(prefix = "md") {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  },

  // -------- Groups --------------------------------------------------------

  /** @returns {PresetGroup[]} */
  readGroups() {
    return foundry.utils.deepClone(game.settings.get(MODULE_ID, "groups") ?? []);
  },

  async writeGroups(groups) {
    return game.settings.set(MODULE_ID, "groups", groups);
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
  registerSettings();
  registerKeybindings();
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

  // Auto-register first-party system shims (e.g. dnd5e)
  registerBuiltinShims();

  // Notify companion modules that the API is ready for addSystemIntegration calls
  Hooks.callAll("macro-dashboard-ready", API);

  // Per-tile hotkey listener (GM only - skip when typing in input fields)
  if (game.user?.isGM) {
    document.addEventListener("keydown", _onTileHotkey);
  }
});

// Scene-controls left-rail tool button (GM only)
Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user?.isGM) return;
  const tokenControls = controls.find(c => c.name === "token");
  if (!tokenControls) return;

  const binding = game.keybindings?.bindings?.get(`${MODULE_ID}.toggleDashboard`)?.[0];
  const keyLabel = binding?.key?.replace(/^Key/, "") ?? "M";

  tokenControls.tools.push({
    name:    "macro-dashboard",
    title:   game.i18n.format("MACRO_DASHBOARD.SceneControl.Tooltip", { key: keyLabel }),
    icon:    "fa-solid fa-th",
    button:  true,
    visible: true,
    onClick: () => MacroDashboardApp.toggle()
  });
});

// Auto-switch: when the canvas displays a new scene, re-render the dashboard
// so its "Viewing:" line and tabs reflect the new scene.
Hooks.on("canvasReady", () => {
  if (!game.user?.isGM) return;
  if (game.settings.get(MODULE_ID, "autoSwitch")) {
    MacroDashboardApp.instance?.render();
  }
});
