// Single source of truth for module-wide constants.
//
// Kept in its OWN file (no imports) so that other module files can read
// MODULE_ID at class-declaration time without tripping the Temporal Dead
// Zone trap caused by circular imports through module.mjs.

export const MODULE_ID = "macro-dashboard";

// Setting keys. Indirected through this object so that a typo at a call
// site is a static error (`SETTINGS.AUTOSWITCH`) rather than a silent
// "always returns default" runtime bug.
export const SETTINGS = Object.freeze({
  DASHBOARDS:       "dashboards",
  GROUPS:           "groups",
  AUTO_SWITCH:      "autoSwitch",
  TILE_SIZE:        "tileSize",
  LAYOUT:           "layout",
  VIEWING_SCENE_ID: "viewingSceneId"
});
