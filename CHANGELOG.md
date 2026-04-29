# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.3.3] - 2026-04-29

### Fixed - the actual root cause

- **Release zip was missing `systems/`.** `.github/workflows/release.yml` listed only `module.json README.md LICENSE scripts/ styles/ templates/ lang/` in its `zip` invocation - `systems/` was never bundled. `scripts/systems.js` does `import dnd5eShim from "../systems/dnd5e.js"`, which 404'd in every install via the Foundry manifest URL. That import failure aborted the entry module before any `Hooks.once("init", ...)` registration could fire - which is why no settings, no keybindings, and no scene-control button appeared.

  This was THE bug. v0.3.0 had it. v0.3.1 had it. v0.3.2 had it. The TDZ fix in v0.3.1 and the CSS / listener fixes in v0.3.2 were all real and necessary - but none of them could ever take effect on a user install, because the module entry script never finished loading. I should have downloaded and inspected the actual published `module.zip` after v0.3.1 instead of relying on local-clone testing alone.

  Verified: the v0.3.3 release zip contents include `systems/dnd5e.js`.

### Added

- **Verbose `console.log` breadcrumbs in `scripts/module.mjs`.** The module now logs `Macro Dashboard | <stage>` to the F12 console at every life-cycle stage:
  - `module.mjs evaluating` (very first line; if absent, the entry script never ran - check Network tab for 404s)
  - `imports resolved (constants, apps, systems)` (if absent but the previous line is present, an import threw)
  - `init hook firing` / `init complete: 6 settings + 2 keybindings registered`
  - `ready hook firing` / `public API exposed at game.macroDashboard`
  - `getSceneControlButtons fired (controls is Array (v12)|Record (v13/v14))` (per render of the scene controls bar; identifies which API shape Foundry is passing)
  - `Registered built-in shim for system "<id>"` (already present pre-0.3.3; logged only when the active system has a bundled shim, currently dnd5e)

### Files

- Updated: [`.github/workflows/release.yml`](.github/workflows/release.yml) - added `systems/` to the zip, plus a comment explaining why every runtime-loaded directory must be listed.
- Updated: [`scripts/module.mjs`](scripts/module.mjs) - added 6 `console.log` breadcrumbs and a header comment explaining how to use them for diagnostics.

## [0.3.2] - 2026-04-29

### Fixed

- **Global CSS pollution from `styles/tokens.css`.** That file was a hallucinated design-system artifact: it loaded BEFORE `macro-dashboard.css` in the manifest, declared the entire `--fdry-*` token palette on `:root`, overrode Foundry core CSS variables (`--color-text-primary`, `--color-text-secondary`, `--color-bg-option`), and set global element styles on `body`, `h1`–`h4`, `p`, `a`. This silently restyled every Foundry window for every connected user — login screen, sidebar, every system's actor sheets, every dialog. Deleted `tokens.css` entirely; moved the design tokens this module actually uses into a single `.macro-dashboard { ... }` block at the top of `macro-dashboard.css` so they cannot leak. Removed `tokens.css` from `module.json` `styles`.

- **Module CSS losing the cascade to Foundry core.** `macro-dashboard.css` wrapped its entire body in `@layer modules { ... }`. CSS cascade priority is `unlayered author > @layer'd author`, and Foundry core CSS is unlayered, so any core selector that touched the same properties on the same elements silently overrode the module's scoped rules regardless of selector specificity. Stripped the `@layer modules` wrapping. Module CSS now applies at natural specificity.

- **Invalid `compatibility.maximum: ""` in `module.json`.** Empty string is not a valid semver and Foundry's version comparator can misbehave on it. Omitted the field — Foundry treats absence as "no upper bound", which is the intent.

- **`_onRender` listener-attachment idempotency.** Both `MacroDashboardApp._onRender` and `MacroLibraryApp._onRender` attached event listeners to every matching element on every render. ApplicationV2's HandlebarsApplicationMixin replaces part contents on full renders, so freshly-rendered elements had no prior listeners and accumulation did not manifest in practice — but a future render strategy that preserved DOM nodes (or a partial re-render that surgically updated one element) would have caused handlers to fire 2×, 4×, 8× per gesture. Every wiring loop now filters `:not([data-wired])` and stamps `dataset.wired = "1"` on each element it wires, making attachment idempotent regardless of render strategy.

- **Singleton instance leak in both apps.** `MacroDashboardApp.#_instance` and `MacroLibraryApp.#_instance` were set in `toggle()` but never nulled in `_onClose`, so a closed window's full private state (tooltip element, context-menu element, per-instance Sets and Maps) lingered in memory for the rest of the session. Both `_onClose` overrides now null the singleton if it points at the closing instance.

### Changed

- **Keybindings now expose hint text in Configure Controls.** `MACRO_DASHBOARD.Keybinding.ToggleDashboard.Hint` and `.ToggleLibrary.Hint` added to `lang/en.json`; the `hint:` field added to both `game.keybindings.register()` calls. The Configure Controls panel previously showed a blank description row under each binding.

- **Keybindings now declare `precedence` explicitly** as `CONST.KEYBINDING_PRECEDENCE?.NORMAL ?? 0` (matching the canonical pattern from `cpr-netrunner-cockpit`). Functionally equivalent to the previous implicit default but v12-safe and explicit.

- **Removed redundant `if (game.user.isGM)` guards from keybinding `onDown` handlers.** Both keybindings already declared `restricted: true`, which causes Foundry to suppress the binding entirely for non-GM users. The internal guard was dead code.

- **"Drop to add" CSS string is now localisable.** Was hardcoded as `content: "Drop to add"` in a `::after` pseudo-element rule, which cannot be passed through `game.i18n`. Now set on the canvas element as `data-drop-label="{{localize 'MACRO_DASHBOARD.Drop.Pill'}}"` from `dashboard.hbs`, and pulled into the pseudo-element via `content: attr(data-drop-label)`.

- **Setting keys extracted to a frozen `SETTINGS` constants object** in `scripts/constants.mjs`. Every `game.settings.register` / `.get` / `.set` call across `module.mjs` and `dashboard-app.mjs` now references `SETTINGS.AUTO_SWITCH` (etc.) rather than bare string literals. A typo at a call site (`SETTINGS.AUTOSWICH`) is now a static `ReferenceError` instead of a silent "always returns the default" runtime bug.

### Considered and intentionally not changed

- **Per-tile hotkey listener stays attached to `document` via `Hooks.once("ready")`.** Audited as a candidate for moving into `MacroDashboardApp._onFirstRender` / `_onClose`, but tying it to the dashboard window's lifecycle would silently break the feature: per-tile hotkeys are designed to fire whether or not the tile's parent dashboard is currently open. The listener attaches exactly once per session (`Hooks.once` runs once, and a page reload destroys the entire JS context) so no accumulation is possible. Added an explanatory comment in `module.mjs`.

### Files

- Removed: `styles/tokens.css`.
- Updated: `module.json`, `lang/en.json`, `templates/dashboard.hbs`, `styles/macro-dashboard.css`, `scripts/constants.mjs`, `scripts/module.mjs`, `scripts/apps/dashboard-app.mjs`, `scripts/apps/library-app.mjs`.

### Audit context

This release ships the Tier 1 and Tier 2 items from a structural audit comparing this module against two known-working Foundry modules ([`Jesperhh01/cpr-rolltable-dashboard-module`](https://github.com/Jesperhh01/cpr-rolltable-dashboard-module), [`VebjornNyvoll/cpr-netrunner-cockpit`](https://github.com/VebjornNyvoll/cpr-netrunner-cockpit)) plus the v13/v14 official API docs and the League of Foundry Developers wiki. The two scene-controls / TDZ regressions fixed in v0.3.1 were the headline blockers; this release addresses the structural issues that the audit surfaced underneath them.

## [0.3.1] - 2026-04-29

### Fixed

- **Module failed to load when enabled (regression in v0.3.0).** A circular import between `scripts/module.mjs` and the app modules under `scripts/apps/` triggered a Temporal Dead Zone `ReferenceError`: each app class evaluated `static PARTS = { template: \`modules/${MODULE_ID}/...\` }` at class-declaration time, which read the imported `MODULE_ID` binding before `module.mjs` had executed its own `export const MODULE_ID = "..."` line. The entry module aborted, `Hooks.once("init", ...)` never registered, and users saw an enabled module with no settings, no keybindings, and no toolbar button. Extracted `MODULE_ID` into a new leaf module [`scripts/constants.mjs`](scripts/constants.mjs) (no imports of its own) and repointed every consumer there. `module.mjs` re-exports `MODULE_ID` for back-compat.
- **Scene-controls button missing on Foundry v13/v14.** The `getSceneControlButtons` hook used the v12-only API: `controls` was treated as an Array and the token control as `"token"` (singular). v13/v14 changed `controls` to `Record<string, SceneControl>`, renamed the control to `"tokens"` (plural), changed `tools` to `Record<string, SceneControlTool>`, and replaced `onClick` with `onChange`. The hook now feature-detects (`Array.isArray`) and adds the tool with the matching shape on either runtime, and sets both `onClick` and `onChange` so the same tool object works on v12 and v13/v14.

### Files

- New: [`scripts/constants.mjs`](scripts/constants.mjs) — single source of truth for `MODULE_ID`. Intentionally a leaf module to break the circular import.
- Updated: `scripts/module.mjs` — re-exports `MODULE_ID` from constants; rewritten `getSceneControlButtons` for v12 + v13/v14 compatibility.
- Updated: `scripts/systems.js`, `scripts/apps/dashboard-app.mjs`, `scripts/apps/library-app.mjs`, `scripts/apps/create-group-dialog.mjs`, `scripts/apps/edit-tile-dialog.mjs` — `MODULE_ID` import repointed at `../constants.mjs`. `State` is still imported from `module.mjs` (only read inside method bodies, so no TDZ risk).

## [0.3.0] - 2026-04-28

### Added

- **Multi-system shim seam** — `game.macroDashboard.API.addSystemIntegration(shim, version?)` lets companion modules register per-system data. Shim shape is the small contract `{ VERSION, CATEGORIES, DEFAULT_PRESET_GROUPS }`. Validation throws descriptive errors for missing required keys. Pattern follows the Item Piles model documented in [`cross-system-architecture.md`](file:///C:/Users/user/.claude/skills/foundry-vtt-module/references/cross-system-architecture.md). Companion modules call from `Hooks.once("macro-dashboard-ready", ...)`.
- **Built-in D&D 5e shim** — when `game.system.id === "dnd5e"`, the module auto-registers `systems/dnd5e.js` providing six default categories (Combat, Rest, Spells, Conditions, Loot, Information) with appropriate FontAwesome icons. Future systems can be added by appending to the `BUILTIN_SHIMS` registry in `scripts/systems.js`.
- **`API.applySystemDefaultGroups()`** — idempotent helper to seed the world with `DEFAULT_PRESET_GROUPS` from the active shim, resolving macro names against `game.macros.getName(...)`. Skips if any groups already exist.
- **Drag-to-reorder tabs** — drag a dashboard tab horizontally to reorder within its scope. Globals reorder among globals; scene tabs among scene tabs. Cross-scope drops are rejected. Reorder persists in the world setting.
- **Per-tile hotkeys** — assign a key combo (e.g. `Shift+1`, `Ctrl+A`, `KeyZ`) in the Edit Macro dialog's new Hotkey field. Pressing the combo (with no input/textarea focused) executes the tile's macro using the currently controlled token's actor. The hotkey renders as a small monospace `kbd` badge in the tile's bottom-right corner. Combos are layout-independent (uses `event.code`).
- `Hooks.callAll("macro-dashboard-ready", API)` — fired during the `ready` hook after the API is exposed and built-in shims are registered.

### Files

- New: [`scripts/systems.js`](scripts/systems.js) — SYSTEMS resolver + API class + version-pinned shim resolution.
- New: [`systems/dnd5e.js`](systems/dnd5e.js) — first-party shim.
- Updated: `module.mjs` (expose `SYSTEMS` + `API` on `game.macroDashboard`, register builtin shims, document keydown listener for tile hotkeys).
- Updated: `dashboard-app.mjs` (tab drag-reorder, propagate hotkey through Edit dialog, render kbd badge).
- Updated: `edit-tile-dialog.mjs` (Hotkey field).
- Updated: `dashboard.hbs` (`draggable="true"` on tabs, kbd badge on tiles).
- Updated: `macro-dashboard.css` (`.md-tile-kbd`, `.md-tab.dragging`, `.md-tab.drag-over`).

### Notes

All v0.1, v0.2, and v0.3 roadmap items are now shipped. The original design handoff README's spec is fully implemented.

## [0.2.0] - 2026-04-28

### Added

- **Right-click context menu** — full menu replacing the v0.1 shift-right-click pattern. Items: **Edit Macro**, **Duplicate**, **Execute Macro**, **Change Color Stripe** (inline 7-swatch row), **Add to Preset Group** (submenu listing existing groups + "New group..."), **Remove from Dashboard** (danger). Closes on outside-click or Escape.
- **Edit Macro Slot dialog** — `DialogV2`-based form to edit the underlying macro's name, image, and command, plus a per-tile **description** (stored as a flag on the macro, displayed in the hover tooltip) and **color stripe** (CSS-only `:checked` radio swatches). The macro update propagates to every tile that references it.
- **Preset Groups** — full CRUD. Library "Groups" tab shows existing groups as collapsible cards, each draggable as a unit (drops all member macros at once, laid out 4-wide × 2-cells-tall stride from the drop point, all sharing the group's stripe color). Each macro inside a group is also individually draggable. The first row of the Groups tab is **"+ Create new group from selection..."** which opens the **Create Preset Group** dialog (`ApplicationV2` + macro-picker checklist). Group rename + delete via context menu on the group card.
- **Hover tooltip** — floating tooltip appears next to a tile on mouse-hover, showing macro name (display serif), description (if set via Edit dialog), and a monospace command preview (first 80 chars).
- **Columns layout** — alternative to free-grid. Tiles auto-bin by stripe color into named columns: Combat / Rest / Ambience / Hazards / Loot / Info / Macros. Toggle via Module Configuration. Drop-on-column inherits the column's stripe.
- **Per-tile color stripes** — already supported in the v0.1 data model (`tile.stripe`), now editable via the context menu and Edit dialog. Renders as a 3px top edge on the tile.
- `game.macroDashboard.API.editTile(dashboardId, tileId)` — public method to programmatically open the Edit Macro dialog.
- `game.macroDashboard.API.openCreateGroupDialog()` — public method to open the Create Preset Group dialog.
- 50+ new i18n keys for context menu, edit dialog, group dialog, columns, tooltip, stripe colors.

### Changed

- Tile right-click no longer opens the macro's built-in sheet. Use the context menu's "Edit Macro" item, which opens the new dialog. **Shift+right-click** still opens the underlying macro's built-in sheet for power users.
- `State` helper extended with `readGroups()`, `writeGroups()`, `createGroup()`, `updateGroup()`, `destroyGroup()`.
- Tile execution preserves `controlled token` semantics; `Ctrl+left-click` now skips token resolution (executes with `null` actor/token) for situations where the controlled token would interfere.

### Fixed

- Tabs with global scope but matching scene id no longer duplicate in the tab strip.
- Library search input no longer loses focus on each keystroke (debounce-free re-focus).

### Internal

- Bumped `actions/checkout` to `v5`. Added `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` to the release workflow's env to silence Node 20 deprecation warnings ahead of GitHub's 2026-09-16 cutover.

## [0.1.0] - 2026-04-28

### Added

- Initial scaffold — `ApplicationV2 + HandlebarsApplicationMixin` dashboard window.
- Scene-controls left-rail tool button (GM only).
- Keybindings (M, L) for toggling dashboard / library.
- Per-scene + global dashboard scoping with auto-switch (default) or manual scene picker.
- Tab management (add, switch, rename, delete) with confirm-on-delete for non-empty tabs.
- Free-grid canvas with snap-positioned macro tiles.
- Drag-drop from library → dashboard, and tile reposition within canvas.
- Click tile to execute macro (passes controlled token's actor).
- Shift+right-click to delete a tile.
- Macro Library palette with search filter.
- Settings: Auto-switch, Tile size, Layout (Free Grid only).
- 49 i18n keys (English).
- GitHub Actions release workflow with token substitution.
