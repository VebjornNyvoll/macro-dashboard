# Macro Dashboard

A Foundry VTT module that gives GMs a scene-aware dashboard for organizing and triggering macros. Drag macros from the library onto a tabbed dashboard bound to a scene (or made global). Switch scenes — the dashboard follows. Trigger macros by clicking, hotkey, or scene-controls tool button.

> **Status: v0.3.0 — full original spec shipped.** All v0.1 / v0.2 / v0.3 roadmap items from the design handoff are implemented.

## Install

In Foundry VTT, paste this manifest URL into *Add-on Modules → Install Module*:

```
https://github.com/VebjornNyvoll/macro-dashboard/releases/latest/download/module.json
```

This URL is permanent and always resolves to the latest stable release. Auto-updates are handled by Foundry's built-in update checker.

For local development, drop this folder into `{userData}/Data/modules/macro-dashboard/` (or symlink) and restart Foundry.

Compatibility: Foundry **v12** minimum, **v13** verified, untested above.

## Usage

### Opening the windows

1. Enable the module in your world.
2. Click the **grid icon** (`fa-th`) on the scene-controls left rail (under Tokens, Walls, etc.) — or press **M**.
3. Open the **Macro Library** with **L**.

### Building a dashboard

1. Drag a macro row from the Library onto the dashboard canvas. The tile snaps to the grid.
2. Drag tiles within the canvas to reposition them.
3. **+ New Tab** creates a new dashboard scoped to the currently-viewed scene.
4. Double-click a tab name to rename inline. Drag tabs horizontally to reorder them within their scope.
5. The **✕** on a tab deletes it (with a confirmation if it has tiles).

### Tile interactions

| Action | Result |
|---|---|
| Left-click | Execute the macro (passes the controlled token's actor). |
| **Ctrl + Left-click** | Execute without resolving a controlled token (clean context). |
| Right-click | Open the rich context menu (Edit / Duplicate / Execute / Stripe / Group / Remove). |
| **Shift + Right-click** | Open Foundry's built-in macro sheet (power-user shortcut). |
| Hover | Show floating tooltip with name, description, and command preview. |
| Drag | Move the tile within the canvas. |
| Press the assigned hotkey | Execute the macro from anywhere (when no input is focused). |

### Mode bar

The mode bar at the top of the dashboard window shows the **viewing scene** and a toggle between **Auto-Switch** (default — dashboard follows the active scene) and **Manual** (GM picks any scene from a dropdown). In Manual mode, an **Override** badge appears when the chosen scene differs from the active scene.

### Preset Groups

The Library has a **Groups** tab where you can save sets of macros as a named group with its own color stripe.

1. In the Groups tab, click **+ Create new group from selection...** to open the Create Preset Group dialog.
2. Pick a name, icon, accent color, and check the macros to include.
3. Drag the group card onto the dashboard canvas — every macro in the group lands as a tile, laid out 4-wide × 2-cells-tall, all sharing the group's stripe color.
4. Edit a group via the pencil icon on its card; delete via the trash icon.

You can also add a single macro to an existing group via the right-click context menu's **Add to Preset Group** submenu.

### Per-tile hotkeys (v0.3+)

Open a tile's **Edit Macro** dialog and fill in the Hotkey field. Examples:

- `Shift+1`, `Ctrl+A`, `Alt+KeyZ` — modifier + key
- `KeyZ`, `Digit5` — bare keys (use `event.code` names — `KeyA` not just `A`, `Digit1` not just `1`)
- Plain `A` or `1` is accepted and normalized to `KeyA` / `Digit1`

Pressing the combo executes the tile's macro with the controlled token's actor. The hotkey appears as a small monospace badge in the bottom-right corner of the tile. Hotkeys are inactive while typing in any `<input>`, `<textarea>`, or contenteditable element.

### Layouts

- **Free Grid** (default) — tiles snap to a dot-matrix grid; you place them wherever.
- **Columns** — tiles auto-bin by stripe color into named columns (Combat / Rest / Ambience / Hazards / Loot / Info / Macros). Drop on a column inherits its stripe.

Toggle in *Module Configuration → Macro Dashboard → Layout*.

## Settings

| Setting | Scope | Default | Description |
|---|---|---|---|
| Auto-switch with scene | World (GM) | `true` | Dashboard follows the active scene; when off, GM picks any scene from the manual dropdown. |
| Tile size | Client | Medium | Small / Medium / Large — affects the snap-grid cell size. |
| Layout | Client | Free Grid | Free Grid or Columns. |

## Keybindings

| Action | Default |
|---|---|
| Toggle Dashboard | **M** |
| Toggle Library | **L** |

Rebind under *Foundry → Game Settings → Configure Controls → Macro Dashboard*. These are global keybindings; the per-tile hotkeys (assigned via the Edit dialog) live separately on each tile and are matched at the document level.

## Public API

```js
// Available on game.macroDashboard after the "ready" hook
game.macroDashboard.API.addSystemIntegration(shim, version?)  // register a system shim
game.macroDashboard.API.applySystemDefaultGroups()            // seed groups from active shim
game.macroDashboard.API.editTile(tileId)                       // open the Edit dialog
game.macroDashboard.API.openCreateGroupDialog(opts?)           // open the Group dialog

// Plus convenience accessors:
game.macroDashboard.open()         // toggle dashboard window
game.macroDashboard.openLibrary()  // toggle library window
game.macroDashboard.State          // CRUD helper: read, write, update, create, destroy, readGroups, writeGroups, ...
game.macroDashboard.SYSTEMS        // active system shim resolver (game.macroDashboard.SYSTEMS.DATA)
game.macroDashboard.MacroDashboardApp
game.macroDashboard.MacroLibraryApp
```

### Custom hooks

The module fires its own hooks for companion modules to participate in:

```js
Hooks.once("macro-dashboard-ready", (API) => {
  // API is now exposed on game.macroDashboard.API.
  // Companion modules (or in-tree systems/) register here.
  API.addSystemIntegration({
    VERSION: "1.0.0",
    CATEGORIES: [
      { name: "Combat", color: "#a23a3a", icon: "fa-solid fa-burst" }
      // ...
    ],
    DEFAULT_PRESET_GROUPS: [
      { name: "Combat Tools", icon: "fa-solid fa-sword", color: "#a23a3a",
        macros: ["Roll Initiative", "Apply Damage"] }
    ]
  });
});
```

## Multi-system support

When `game.system.id` matches a system with a registered shim, the dashboard exposes that system's `CATEGORIES` and `DEFAULT_PRESET_GROUPS` to the UI.

A first-party shim ships in [`systems/dnd5e.js`](systems/dnd5e.js) with six categories (Combat / Rest / Spells / Conditions / Loot / Information). Auto-registers when `game.system.id === "dnd5e"`.

To add support for another system: write a shim in `systems/<system-id>.js` and add it to the `BUILTIN_SHIMS` map at the top of [`scripts/systems.js`](scripts/systems.js). Or ship a separate companion module that registers via the public API at `Hooks.once("macro-dashboard-ready", ...)`.

The shim contract is intentionally small:

```ts
{
  VERSION: string,                                       // semver, drives migration
  CATEGORIES: { name, color, icon }[],                   // candidate stripe categories
  DEFAULT_PRESET_GROUPS: { name, icon, color, macros: string[] }[]  // optional seed
}
```

Pattern reference: the [Item Piles](https://github.com/fantasycomputer-works/foundryvtt-item-piles) shim contract, scaled down for macro-dashboard's narrower needs. See [`cross-system-architecture.md`](file:///C:/Users/user/.claude/skills/foundry-vtt-module/references/cross-system-architecture.md) in the engineering skill for the full pattern.

## Data layout

### `game.settings.get("macro-dashboard", "dashboards")`

```js
{
  "global": [
    { id: "d-...", name: "Quick Tools", icon: "fa-solid fa-bolt", scope: "global",
      tiles: [{ id, macroId, x, y, stripe?, hotkey? }] }
  ],
  "<sceneId>": [
    { id, name, icon, scope: "scene", tiles: [...] }
  ]
}
```

### `game.settings.get("macro-dashboard", "groups")`

```js
[
  { id: "g-...", name: "Combat Tools", icon: "fa-solid fa-sword",
    color: "#a23a3a", macros: ["<macroId>", "<macroId>"] }
]
```

### Macro-level flags

Per-tile descriptions (used in the hover tooltip) are stored as macro flags so they're shared across every tile referencing the same macro:

```js
macro.flags["macro-dashboard"].description  // string
```

The dashboard is purely a launcher / organizer; macro definitions themselves live in `game.macros` and are edited via Foundry's built-in macro sheet (or the Macro Dashboard's Edit dialog, which writes directly to the macro document).

## Required permissions

This is a **GM-only** tool. The scene-controls button, keybindings, hotkey listener, and dashboard windows are all guarded by `game.user.isGM`. Players never see the UI and the world setting holding dashboard data is GM-writable only.

## Design

Visuals follow the [Vebjørn's Modules Design System](https://github.com/VebjornNyvoll) — dark fantasy + parchment + gold rules + warm shadows. CSS is scoped under `.macro-dashboard` and wrapped in `@layer modules { ... }` so it cascades correctly relative to Foundry's own stylesheets in v13+.

Tokens (colors, type, spacing, shadows, radii) are in [`styles/tokens.css`](styles/tokens.css). Module-specific styles in [`styles/macro-dashboard.css`](styles/macro-dashboard.css). Both ported from the design handoff prototype.

## Engineering

Built per the engineering conventions of the `foundry-vtt-module` Claude skill. Three application classes (all `ApplicationV2 + HandlebarsApplicationMixin`):

- `MacroDashboardApp` — singleton, the main window
- `MacroLibraryApp` — singleton, the library palette
- `CreateGroupDialog` — instance-per-use, the macro-picker form

Plus one `DialogV2` wrapper (`EditTileDialog.open(...)` returning a Promise) and detached overlay DOM for the tooltip and right-click context menu.

Hooks: `init` for registration, `ready` to expose the API and register builtin shims, `getSceneControlButtons` for the tool button, `canvasReady` for auto-switch, `keydown` (document-level) for tile hotkeys.

## Architecture highlights

- **Three-plane separation**: Engine (hooks/CONFIG/game), Document (Macro/Scene/User flags), Application (windows/dialogs).
- **Hooks-first extension** — no monkey-patching, no `lib-wrapper` needed.
- **System-agnostic by design** with the Item Piles shim contract pattern.
- **Public API** on `game.macroDashboard.API` for companion modules.
- **Custom hooks** (`macro-dashboard-ready`) for extension seams.
- **CSS-only stripe picker** via `:checked + label` cascade in the Edit dialog.
- **Document flags** namespaced under `macro-dashboard.<key>`.
- **CI/CD** with token substitution, Node 24 opt-in, automated GitHub releases.
- **Localization-first** — 100+ i18n keys, zero hardcoded UI strings.

## Releases

| Version | Highlights |
|---|---|
| **v0.3.0** | Multi-system shim seam, drag-reorder tabs, per-tile hotkeys |
| v0.2.0 | Right-click context menu, Edit Macro dialog, Preset Groups, Hover tooltip, Columns layout |
| v0.1.0 | Initial scaffold — dashboard + library + tabs + drag-drop |

See [CHANGELOG.md](CHANGELOG.md) for full release notes.

## License

MIT — see [LICENSE](LICENSE).
