// Multi-system shim seam for Macro Dashboard.
// Companion modules (or built-in shims under systems/) call
//   game.macroDashboard.API.addSystemIntegration(shim, version?)
// from Hooks.once("macro-dashboard-ready", ...) to register per-system data.
//
// Pattern reference: foundry-vtt-module/cross-system-architecture.md (the
// Item Piles pattern, with a smaller contract appropriate for macros).

import { State } from "./module.mjs";

// First-party shims bundled with the module, loaded LAZILY via dynamic
// `import()` so a missing or 404'd shim file degrades to a warning
// instead of aborting the entire module entry script. (Static imports
// at module top level run unconditionally - even on systems for which
// the shim is irrelevant - and any failure cascades up through every
// importer until the entry module fails to evaluate.) The active game
// system's loader is invoked at most once, from registerBuiltinShims().
//
// Add one entry per system you ship a shim for. Key MUST match
// `game.system.id.toLowerCase()`.
const BUILTIN_SHIM_LOADERS = {
  dnd5e: () => import("../systems/dnd5e.js").then(m => m.default)
};

// ---------------------------------------------------------------------------
// SYSTEMS resolver

export const SYSTEMS = {

  /** @type {Record<string, Record<string, object>>} - keyed by system id, then version */
  SUPPORTED_SYSTEMS: {},

  /** Falsy-default contract. Modules read from SYSTEMS.DATA which always returns a complete object. */
  DEFAULT_SETTINGS: {
    VERSION:               "",
    CATEGORIES:            [],   // [{ name, color, icon }] - candidate stripe categories
    DEFAULT_PRESET_GROUPS: []    // [{ name, icon, color, macros: [<macro names>] }]
  },

  _cache: false,

  get HAS_SYSTEM_SUPPORT() {
    return !!this.SUPPORTED_SYSTEMS?.[game.system.id.toLowerCase()];
  },

  get DATA() {
    if (this._cache) return this._cache;

    const id = game.system.id.toLowerCase();
    const system = this.SUPPORTED_SYSTEMS?.[id];
    if (!system) return this.DEFAULT_SETTINGS;

    if (system[game.system.version]) {
      this._cache = foundry.utils.mergeObject(this.DEFAULT_SETTINGS, system[game.system.version]);
      return this._cache;
    }

    const versions = Object.keys(system);
    if (versions.length === 1) {
      this._cache = foundry.utils.mergeObject(this.DEFAULT_SETTINGS, system[versions[0]]);
      return this._cache;
    }

    versions.sort((a, b) =>
      a === "latest" || b === "latest" ? -Infinity
        : (foundry.utils.isNewerVersion(b, a) ? -1 : 1));
    const v = versions.find(ver =>
      ver === "latest" || !foundry.utils.isNewerVersion(game.system.version, ver));
    this._cache = foundry.utils.mergeObject(this.DEFAULT_SETTINGS, system[v]);
    return this._cache;
  },

  addSystem(data, version = "latest") {
    const id = game.system.id.toLowerCase();
    this.SUPPORTED_SYSTEMS[id] = { ...this.SUPPORTED_SYSTEMS[id], [version]: data };
    this._cache = false;
  }
};

/** Auto-register the first-party shim for the active game system, if one
 *  exists in BUILTIN_SHIM_LOADERS. Returns immediately; the shim file is
 *  fetched + registered asynchronously via dynamic import. A missing
 *  shim file is logged as a warning, NOT thrown - so a packaging bug
 *  in `systems/<id>.js` never breaks module load. */
export function registerBuiltinShims() {
  const id = game.system.id.toLowerCase();
  const loader = BUILTIN_SHIM_LOADERS[id];
  if (!loader) {
    console.log(`Macro Dashboard | No built-in shim for system "${id}" - using DEFAULT_SETTINGS. Companion modules can register one via game.macroDashboard.API.addSystemIntegration(shim).`);
    return;
  }
  loader().then(shim => {
    SYSTEMS.addSystem(shim, "latest");
    console.log(`Macro Dashboard | Registered built-in shim for system "${id}"`);
  }).catch(err => {
    console.warn(`Macro Dashboard | Failed to load built-in shim for system "${id}" - falling back to DEFAULT_SETTINGS. Cause:`, err);
  });
}

// ---------------------------------------------------------------------------
// Public API exposed on game.macroDashboard.API

export class API {

  /**
   * Register a system integration shim.
   * @param {object} inData                   - shim object (see DEFAULT_SETTINGS for shape)
   * @param {string} [version="latest"]       - "latest" or a specific game system version
   */
  static addSystemIntegration(inData, version = "latest") {
    const data = foundry.utils.mergeObject(
      foundry.utils.deepClone(SYSTEMS.DEFAULT_SETTINGS),
      inData,
      { insertKeys: false }
    );

    if (typeof data.VERSION !== "string")
      throw new Error("addSystemIntegration | data.VERSION must be a string");
    if (!Array.isArray(data.CATEGORIES))
      throw new Error("addSystemIntegration | data.CATEGORIES must be an array");
    if (!Array.isArray(data.DEFAULT_PRESET_GROUPS))
      throw new Error("addSystemIntegration | data.DEFAULT_PRESET_GROUPS must be an array");

    data.INTEGRATION = true;
    SYSTEMS.addSystem(data, version);
    console.log(`Macro Dashboard | System integration registered for "${game.system.id}" (v${data.VERSION})`);
  }

  /**
   * Programmatically open the Edit Tile dialog.
   * @param {string} tileId
   */
  static async editTile(tileId) {
    const app = game.macroDashboard?.MacroDashboardApp?.instance;
    return app?.editTile?.(tileId);
  }

  /**
   * Open the Create / Edit Preset Group dialog.
   * @param {{existingGroupId?: string, initialMacroIds?: string[]}} [opts]
   */
  static async openCreateGroupDialog(opts = {}) {
    const { CreateGroupDialog } = await import("./apps/create-group-dialog.mjs");
    return CreateGroupDialog.open(opts);
  }

  /**
   * Idempotently seed the world with DEFAULT_PRESET_GROUPS from the active system shim.
   * Skips if any groups exist already. Resolves macro names against game.macros.
   * @returns {Promise<boolean>} true if at least one group was created
   */
  static async applySystemDefaultGroups() {
    if (State.readGroups().length > 0) return false;
    const presets = SYSTEMS.DATA.DEFAULT_PRESET_GROUPS ?? [];
    if (!presets.length) return false;

    let created = 0;
    for (const preset of presets) {
      const macros = (preset.macros ?? [])
        .map(name => game.macros.getName?.(name))
        .filter(Boolean)
        .map(m => m.id);
      if (macros.length === 0) continue;
      await State.createGroup({
        id:    State.newId("g"),
        name:  preset.name,
        icon:  preset.icon ?? "fa-solid fa-folder",
        color: preset.color ?? "#a23a3a",
        macros
      });
      created++;
    }
    return created > 0;
  }
}
