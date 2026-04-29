# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.3.8] - 2026-04-29

### Fixed

- **Tile right-click context menu now opens.** v0.3.6's `renderGroupIcon` helper called `escAttr(...)` - but `escAttr` only exists in `edit-tile-dialog.mjs`; this file only defines `escHtml`. Every tile right-click hit `ReferenceError: escAttr is not defined` inside `#openContextMenu`, which v0.3.7's defensive try/catch surfaced clearly in F12. Replaced with `escHtml`, which is safe for both attribute and text contexts (escapes `& < > " '` identically).

- **Drag ghost is no longer half-transparent.** v0.3.5 set the drag image to the source tile element via `setDragImage(tile, ...)`, but the same dragstart handler then adds the `.dragging` class which sets `opacity: 0.55`. The browser captures the source element's appearance at dragstart, so the ghost ended up faded - users saw the tile turn dark and assumed the drag never started. Drag image is now a clone of the tile with `.dragging` and `.selected` classes stripped and `opacity: 1` forced; positioned offscreen, snapshotted by the browser, then removed on the next tick. The ghost is now fully visible and tracks the cursor properly.

- **Defensive `selectedTileIds instanceof Set` check** added to `dragstart` (matching v0.3.7's `#openContextMenu` defence). Same rationale - if the field somehow isn't a Set at the moment of dragstart, the dragstart no longer crashes mid-handler.

### Added

- **Drops never overlap existing tiles.** New `nearestFreeCell(x, y, occupied)` helper does an outward-spiral search for the nearest unoccupied cell. Applied to every drop type:
  - **New macro from library** - if the drop cell is already taken, the new tile lands on the nearest free cell.
  - **Group from library** - each group member is placed at its 4-wide-stride seed position, then snapped to the nearest free cell from there. The occupancy set updates as each tile is placed so group members don't collide with each other either.
  - **Single tile move** - the moved tile resolves to the nearest free cell. The tile's *old* position doesn't count as occupied (it's leaving).
  - **Multi-tile move** - the primary tile resolves to nearest free; the delta is applied to the rest of the selection. Per-tile fallback: if applying the delta to a non-primary tile lands it on an occupied cell, just that tile is shifted to the nearest free cell. The full multi-move occupancy is tracked so selection members don't collide with each other.

### Files

- Updated: [`scripts/apps/dashboard-app.mjs`](scripts/apps/dashboard-app.mjs) - `escAttr` → `escHtml` fix in `renderGroupIcon`; cloned-and-stripped drag ghost in tile dragstart; `selectedTileIds` defensive coercion in dragstart; new `nearestFreeCell` helper; `#onCanvasDrop` rewritten to consult `nearestFreeCell` for every payload type and track occupancy across multi-tile placements.

## [0.3.7] - 2026-04-29

### Fixed

- **`File picker is not available in this Foundry version` warning on v12.** v0.3.6's `FilePicker` resolution chain was `foundry.applications?.apps?.FilePicker ?? globalThis.FilePicker`. Two problems:
  1. In v13/v14 the namespaced `foundry.applications.apps.FilePicker` is a *wrapper* object, not a constructor — `new` requires `.implementation`. The chain returned the wrapper but `new` against it failed silently or returned `null`.
  2. In v12 `globalThis.FilePicker` was apparently undefined for the user (likely build-specific globalThis vs. window scoping). The bare-identifier read `FilePicker` is the only reliable v12 path, but it would throw `ReferenceError` in strict-mode ES modules if undefined — so it has to be guarded with `typeof FilePicker !== "undefined"`, which is the only probe that never throws on an unbound identifier.

  New `getFilePickerClass()` helper in `edit-tile-dialog.mjs` (also imported by `create-group-dialog.mjs`) tries, in order: `foundry.applications.apps.FilePicker.implementation` (v13/v14), the namespaced wrapper itself if it's a function (older v13 builds), the bare global `FilePicker` (v12, via `typeof` probe), and `window.FilePicker` (final fallback). The "File picker not available" warning now only fires when none of those resolve — which should be effectively never.

### Added

- **Defensive try/catch + logging around `#openContextMenu`.** The v0.3.6 right-click-on-tile regression silently failed because any exception inside the contextmenu listener vanished into the event-listener void with no UI sign that the click was even received. The tile contextmenu handler now logs `Macro Dashboard | tile contextmenu - opening menu` to F12 console on click, wraps `#openContextMenu` in try/catch, and surfaces any thrown error both as `console.error` and as a `ui.notifications.error` so the user sees that something happened. If the regression persists, the F12 console will now show the actual cause rather than dead silence.
- **Defensive `selectedTileIds instanceof Set` check** at the top of `#openContextMenu`. If the field somehow isn't a Set at the moment the menu is opened (initialisation race, framework subclass shenanigans, anything), the code falls back to an empty Set so the missing `.size` / `.has` calls never crash the menu open.

### Files

- Updated: [`scripts/apps/edit-tile-dialog.mjs`](scripts/apps/edit-tile-dialog.mjs) — exported `getFilePickerClass()` helper with v12 + v13/v14 + window fallbacks; both `render` callback and the create-group-dialog now use it.
- Updated: [`scripts/apps/create-group-dialog.mjs`](scripts/apps/create-group-dialog.mjs) — imports `getFilePickerClass` from edit-tile-dialog; `#onPickIcon` uses it.
- Updated: [`scripts/apps/dashboard-app.mjs`](scripts/apps/dashboard-app.mjs) — tile contextmenu listener wraps `#openContextMenu` in try/catch with `console.error` + `ui.notifications.error`; logs entry breadcrumb on every right-click; `#openContextMenu` defensively coerces `this.selectedTileIds` to a Set before reading `.size` / `.has`.

## [0.3.6] - 2026-04-29

### Fixed

- **Drop position now matches what the cursor is hovering over.** `#snapTo` had two bugs that compounded:
  1. It didn't account for `canvas.scrollLeft` / `canvas.scrollTop`, so once the user scrolled the dashboard, the snap target diverged from the visible cursor position by `scroll/cell` cells.
  2. It computed snap such that the tile's TOP-LEFT corner landed where the cursor was — but v0.3.5's `setDragImage` change centred the visible drag-ghost on the cursor. The two visuals disagreed, getting worse the larger the tile size.

  Both fixed: cursor coords are now converted into the canvas-inner's local coord system (with scroll), and `cell/2` is subtracted before rounding so the tile's CENTRE lands on the cursor. Drop ghost and drag image now agree pixel-for-pixel.

- **Accent color picker in Create / Edit Group dialog rendered as bare browser buttons.** The CSS rule `.md-stripe-picker label.md-stripe-swatch` only matched `<label>` elements, so the `<button>` swatches in the group dialog inherited only default browser styling — they came out roughly 1em tall as horizontal stripes with no visible color. Selector dropped the `label` qualifier and added `padding: 0; appearance: none;` so the rule applies to both `<label>` (Edit Tile) and `<button>` (Create Group) usages and overrides the browser's button defaults.

### Added

- **File picker on the icon field** in both the Create / Edit Preset Group dialog and the Edit Tile dialog. A new "browse" button next to the icon input opens Foundry's `FilePicker` (image type, current path pre-filled). Selecting a file writes the path back into the input. Cross-version compatible: prefers `foundry.applications.apps.FilePicker` (v13/14) and falls back to the global `FilePicker` (v12).

- **Group icons can now be image paths**, not only FontAwesome class strings. The library and the per-tile context menu both detect path-like values (contain `/`, or end in `.png|.jpg|.jpeg|.svg|.webp|.gif|.avif`) via a new `isImagePath` helper and render `<img>` for paths, `<i>` for FA classes. Existing FA-class group icons keep working unchanged.

- **Box-select on the dashboard grid.** Left-click-and-drag on empty canvas (in grid layout, GM only) draws a marquee. Every tile whose viewport bounding rect intersects the box gets a gold outline and is added to the selection. A click without a measurable drag (< 4 px) clears the selection. The new selection unlocks two right-click actions:
  - **Delete N tiles** — bulk-deletes the entire selection in a single settings-write.
  - **Group N tiles into a preset...** — opens the Create Preset Group dialog with all selected macros pre-checked (deduped, since the same macro can appear on multiple tiles).
  - **Clear selection** — same effect as clicking empty canvas.

- **Multi-tile drag.** Dragging any tile that's part of a multi-selection now moves the entire selection, preserving every tile's position relative to the dragged "primary". Implemented by serialising all selected tiles' starting positions into the dragstart payload and computing a single delta on drop. Out-of-bounds positions are clamped at `(0, 0)`.

### Files

- Updated: [`scripts/apps/dashboard-app.mjs`](scripts/apps/dashboard-app.mjs) — `#snapTo` (cursor-centred + scroll-aware); `selectedTileIds` instance field; `#onCanvasMouseDown` for marquee drag; `#clearSelection`, `#deleteSelection`, `#groupSelection` helpers; multi-drag payload in tile dragstart; `tiles` payload type in `#onCanvasDrop`; selection-aware header in `#openContextMenu`; image-path-aware `renderGroupIcon` helper.
- Updated: [`scripts/apps/library-app.mjs`](scripts/apps/library-app.mjs) — `isImagePath` helper; `iconIsImage` flag on each group in `_prepareContext`.
- Updated: [`scripts/apps/edit-tile-dialog.mjs`](scripts/apps/edit-tile-dialog.mjs) — icon input wrapped in `.md-input-with-button`; `render` callback wires the new browse button to `FilePicker`.
- Updated: [`scripts/apps/create-group-dialog.mjs`](scripts/apps/create-group-dialog.mjs) — `pickIcon` action handler that opens `FilePicker` and writes back into the input + `presetIcon` instance field.
- Updated: [`templates/create-group.hbs`](templates/create-group.hbs) — icon input wrapped in `.md-input-with-button` with a `data-action="pickIcon"` button.
- Updated: [`templates/library.hbs`](templates/library.hbs) — group icon switches between `<img>` and `<i>` on `iconIsImage`.
- Updated: [`styles/macro-dashboard.css`](styles/macro-dashboard.css) — stripe-picker selector fix; `.md-input-with-button` and `.md-pick-btn` layout for the file-picker button; `.md-select-box` and `.md-tile.selected` for the marquee + selection outline; `.md-group-icon img` sizing.
- Updated: [`lang/en.json`](lang/en.json) — IconPicker / SelectionMenu / Notification.SelectionDeleted keys.

## [0.3.5] - 2026-04-29

### Fixed

- **Cannot move a tile after placement.** Tile `dragstart` set `effectAllowed = "move"` while the canvas `dragover` set `dropEffect = "copy"` unconditionally. Per the HTML5 drag-and-drop spec, the browser silently suppresses the `drop` event when `dropEffect` is not in `effectAllowed`, so library drops worked (`copy`/`copy`) but tile-move drops did not (`move`/`copy`). Tile `dragstart` now sets `effectAllowed = "copyMove"`, which the canvas dragover's `dropEffect = "copy"` satisfies. Tile movement on the grid now works.

- **Drag ghost misaligned with cursor.** Default browser behaviour is to anchor the drag ghost relative to wherever inside the source element the user happened to grab — which is why the offset varied. All three `dragstart` handlers (tile, library macro row, library group head) now call `ev.dataTransfer.setDragImage(el, el.offsetWidth / 2, el.offsetHeight / 2)` so the ghost is centred on the cursor. Tab-reorder dragstart got the same treatment.

### Added

- **Right-click context menu on tabs.** Right-clicking a tab in the dashboard opens a small menu with:
  - **Rename Tab** — inline rename (same flow as double-click).
  - **Duplicate Tab** — clones the tab in its current scope; tile ids are regenerated so edits to the copy don't propagate to the original. The active tab switches to the new copy.
  - **Move to Global / Move to current scene** — flips the tab between the global-scope dashboard list and the currently-viewed scene's list. Resolves the long-standing "how do I make a tab global?" UX gap.
  - **Delete Tab** — confirm-then-delete (no confirm for empty tabs); same logic as the tab strip's × button.

### Changed

- **`State.moveScope(dashboardId, newScope)`** — new helper that pulls a dashboard out of its current scope key and pushes it onto the target scope key in a single settings-write. Returns the moved dashboard, or `null` if no dashboard with that id was found.
- **`State.duplicate(dashboardId)`** — new helper that deep-clones a dashboard within its current scope, regenerating the dashboard id and every tile id, and renaming to `"<original> (copy)"`. Returns the new dashboard, or `null` if the source id was not found.

### Files

- Updated: [`scripts/apps/dashboard-app.mjs`](scripts/apps/dashboard-app.mjs) — tile + tab `dragstart` use `setDragImage(el, w/2, h/2)`; tile `effectAllowed` is now `"copyMove"`; new `#openTabContextMenu`, `#duplicateTab`, `#toggleTabScope`, `#confirmRemoveTab` helpers; tab `contextmenu` listener added inside the wired-tab loop.
- Updated: [`scripts/apps/library-app.mjs`](scripts/apps/library-app.mjs) — macro row + group head `dragstart` use `setDragImage(el, w/2, h/2)`.
- Updated: [`scripts/module.mjs`](scripts/module.mjs) — added `State.moveScope` and `State.duplicate`.
- Updated: [`lang/en.json`](lang/en.json) — five new `MACRO_DASHBOARD.TabContextMenu.*` keys.

## [0.3.4] - 2026-04-29

### Fixed - defensive against the v0.3.3 class of bug

- **System shims are now loaded lazily via dynamic `import()`.** Previously, `scripts/systems.js` did `import dnd5eShim from "../systems/dnd5e.js"` at module top level — a static import that runs unconditionally regardless of which system the user has active, and which aborts the entire module entry script if the file is missing or 404s. This was the mechanism by which the missing-`systems/`-in-zip bug (fixed in v0.3.3 by including `systems/` in the release archive) silently broke module load for users on cyberpunk-red-core, swade, pf2e, etc. - systems for which the dnd5e shim was never relevant.

  v0.3.4 replaces the static `import` with a `BUILTIN_SHIM_LOADERS` map of dynamic `import()` thunks, fetched only when the active system has a shim entry, and wrapped in a `.catch()` that downgrades any failure to a console warning. The module continues to work with `DEFAULT_SETTINGS` if the shim file is missing.

  Practical effect: even if the release pipeline ever drops a shim file again, the module still loads. Users on systems without a built-in shim see a clear "no shim for system X - using defaults" log instead of a load failure.

### Files

- Updated: [`scripts/systems.js`](scripts/systems.js) - replaced static `import dnd5eShim from "../systems/dnd5e.js"` with a `BUILTIN_SHIM_LOADERS` map of dynamic-import thunks; `registerBuiltinShims()` now `.then/.catch`-handles the async load so a missing shim warns instead of throwing.

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
