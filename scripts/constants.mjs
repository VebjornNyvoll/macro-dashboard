// Single source of truth for the module id.
//
// Kept in its OWN file (no imports) so that other module files can read
// MODULE_ID at class-declaration time without tripping the Temporal Dead
// Zone trap caused by circular imports through module.mjs.

export const MODULE_ID = "macro-dashboard";
