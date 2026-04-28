# Macro Dashboard

A Foundry VTT module that gives GMs a scene-aware dashboard for organizing and triggering macros. Drag macros from the library onto a tabbed dashboard bound to a scene (or made global). Switch scenes — the dashboard follows. Toggle via a scene-controls tool button or hotkey.

> **Status: v0.1.0 (initial scaffold).** The free-grid layout, tile drag-drop, scene auto-switch, and library palette work. Preset groups, the columns layout, and the rich edit-macro dialog are scoped for v0.2.

## Install

In Foundry VTT, paste this manifest URL into Add-on Modules → Install Module:

```
https://github.com/<your-username>/macro-dashboard/releases/latest/download/module.json
```

Until the first GitHub release, install manually by dropping this folder into `{userData}/Data/modules/macro-dashboard/`.

## Usage

1. Enable the module in your world.
2. Click the **grid icon** (`fa-th`) on the scene-controls left rail (under Tokens, Walls, etc.) — or press **M**.
3. Open the **Macro Library** with **L**.
4. Drag a macro row from the Library onto the dashboard canvas. The tile snaps to the grid.
5. Click a tile to execute the macro.
6. Right-click a tile to open the underlying macro's edit sheet (Foundry's built-in editor for v0.1).
7. **+ New Tab** creates a new dashboard scoped to the currently viewed scene. Double-click a tab name to rename. The **✕** on the tab deletes it.
8. The mode bar at the top shows whether the dashboard auto-switches with scenes or is in **Manual** mode (toggle via the link on the right).

## Settings

| Setting | Scope | Default | Description |
|---|---|---|---|
| Auto-switch with scene | World (GM) | `true` | Dashboard follows the active scene. When off, GM picks the scene manually. |
| Tile size | Client | Medium | Small / Medium / Large. |
| Layout | Client | Free Grid | Free Grid (v0.1) — Columns coming v0.2. |

## Keybindings

| Action | Default |
|---|---|
| Toggle Dashboard | **M** |
| Toggle Library | **L** |

Both can be rebound under Foundry → Game Settings → Configure Controls → Macro Dashboard.

## Data layout

Dashboards are stored in a single world setting `macro-dashboard.dashboards`:

```js
{
  "global": [
    { id: "...", name: "Quick Tools", icon: "fa-bolt", scope: "global",
      tiles: [{ id, macroId, x, y, stripe? }] }
  ],
  "<sceneId>": [
    { id, name, icon, scope: "scene", tiles: [...] }
  ]
}
```

Preset groups (v0.2) will live in `macro-dashboard.groups`.

Editing a tile's macro happens through the macro's own sheet — `macro.sheet.render(true)`. The dashboard is purely a launcher / organizer; macro definitions remain in `game.macros`.

## Required permissions

This is a **GM-only** tool. The scene-controls button and keybindings only fire for users with `game.user.isGM === true`. Players don't see the dashboard.

## Design

Visuals follow the [Vebjørn's Modules Design System](file:///C:/Users/user/.claude/skills/vebjorns-modules-design-system) — dark fantasy + parchment + gold rules + warm shadows. CSS is scoped under `.macro-dashboard` and wrapped in `@layer modules { ... }` so it cascades correctly relative to Foundry's own stylesheets in v13+.

Tokens (colors, type, spacing, shadows, radii) are in [`styles/tokens.css`](styles/tokens.css). Module-specific styles in [`styles/macro-dashboard.css`](styles/macro-dashboard.css). Both ported from the design handoff prototype.

## Engineering

Built per the [`foundry-vtt-module`](file:///C:/Users/user/.claude/skills/foundry-vtt-module) skill conventions. Two `ApplicationV2 + HandlebarsApplicationMixin` windows. World setting for dashboard data, client settings for UI prefs. Hooks: `init` for registration, `getSceneControlButtons` for the tool button, `canvasReady` for auto-switch.

## Roadmap

**v0.2** — preset groups, custom Edit Macro dialog with stripe color picker, columns layout, hover tooltip with macro description, right-click context menu (Edit / Duplicate / Color / Remove), keybindable per-tile shortcuts.

**v0.3** — multi-system shim seam (`game.macroDashboard.API.addSystemIntegration(...)`) for system-specific macro categories.

## License

MIT.
