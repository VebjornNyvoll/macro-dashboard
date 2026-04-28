# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

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
