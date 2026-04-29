// Macro Dashboard window (v0.2) - tabs, free-grid OR columns canvas,
// drag-drop with snap, hover tooltip, right-click context menu with
// stripe submenu and group submenu, edit-macro dialog integration.

import { MODULE_ID, SETTINGS } from "../constants.mjs";
import { State }              from "../module.mjs";
import { EditTileDialog }     from "./edit-tile-dialog.mjs";
import { CreateGroupDialog }  from "./create-group-dialog.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const COLUMN_KEYS = {
  "#a23a3a": "MACRO_DASHBOARD.Layout.Column.Combat",
  "#4a7a3c": "MACRO_DASHBOARD.Layout.Column.Rest",
  "#5a2c7a": "MACRO_DASHBOARD.Layout.Column.Ambience",
  "#b08038": "MACRO_DASHBOARD.Layout.Column.Hazards",
  "#c79a3a": "MACRO_DASHBOARD.Layout.Column.Loot",
  "#3a7aa8": "MACRO_DASHBOARD.Layout.Column.Info"
};

const STRIPES = ["", "#a23a3a", "#4a7a3c", "#5a2c7a", "#b08038", "#c79a3a", "#3a7aa8"];

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Heuristic: does `s` look like a file path (FilePicker output) rather than
 *  a FontAwesome class string? Used to switch between <img> and <i> rendering
 *  for group icons (which were FA-only before file-picker support landed). */
function isImagePath(s) {
  if (!s) return false;
  return s.includes("/") || /\.(png|jpg|jpeg|svg|webp|gif|avif)$/i.test(s);
}

export class MacroDashboardApp extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id:      "macro-dashboard-app",
    classes: ["macro-dashboard"],
    tag:     "div",
    window: {
      title:       "MACRO_DASHBOARD.Window.Dashboard.Title",
      icon:        "fa-solid fa-th",
      resizable:   true,
      minimizable: true
    },
    position: { width: 680, height: 560 },
    actions: {
      addTab:           MacroDashboardApp.#onAddTab,
      switchTab:        MacroDashboardApp.#onSwitchTab,
      removeTab:        MacroDashboardApp.#onRemoveTab,
      renameTab:        MacroDashboardApp.#onRenameTab,
      toggleAutoSwitch: MacroDashboardApp.#onToggleAutoSwitch,
      executeTile:      MacroDashboardApp.#onExecuteTile
    }
  };

  static PARTS = {
    main: {
      template:   `modules/${MODULE_ID}/templates/dashboard.hbs`,
      scrollable: [".md-canvas"]
    }
  };

  static #_instance = null;
  static get instance() { return this.#_instance; }
  static toggle() {
    if (!game.user.isGM) {
      ui.notifications.warn(game.i18n.localize("MACRO_DASHBOARD.Notification.NotGM"));
      return;
    }
    if (this.#_instance?.rendered) return this.#_instance.close();
    this.#_instance = new this();
    return this.#_instance.render({ force: true });
  }

  // Per-instance UI state
  activeId = null;

  // Box-selected tile ids (in the active dashboard). Populated by the
  // canvas mousedown drag-rectangle in #onCanvasMouseDown; cleared on
  // canvas click, on tile delete, after Group-from-selection, etc.
  selectedTileIds = new Set();

  // Detached overlay DOM elements (mounted into <body>, not the app root)
  #tooltipEl = null;
  #ctxMenuEl = null;
  #ctxDocListeners = null;

  // -----------------------------------------------------------------------
  async _prepareContext() {
    const data       = State.read();
    const autoSwitch = game.settings.get(MODULE_ID, SETTINGS.AUTO_SWITCH);
    const tileSize   = game.settings.get(MODULE_ID, SETTINGS.TILE_SIZE);
    const layout     = game.settings.get(MODULE_ID, SETTINGS.LAYOUT);
    const activeScene = game.scenes.active ?? game.scenes.viewed;

    let viewingSceneId = autoSwitch
      ? activeScene?.id
      : (game.settings.get(MODULE_ID, SETTINGS.VIEWING_SCENE_ID) || activeScene?.id);
    if (!game.scenes.get(viewingSceneId)) viewingSceneId = activeScene?.id;

    const viewingScene = game.scenes.get(viewingSceneId);
    const isOverriding = !autoSwitch && viewingSceneId !== activeScene?.id;

    const globals = (data.global ?? []).map(d => ({ ...d, scope: "global" }));
    const scoped  = (data[viewingSceneId] ?? []).map(d => ({ ...d, scope: "scene" }));
    const tabs    = [...globals, ...scoped];

    if (!tabs.find(t => t.id === this.activeId)) this.activeId = tabs[0]?.id ?? null;
    const activeTab = tabs.find(t => t.id === this.activeId) ?? null;

    const tiles = (activeTab?.tiles ?? []).map(t => {
      const macro = game.macros.get(t.macroId);
      return {
        id:       t.id,
        macroId:  t.macroId,
        x:        t.x ?? 0,
        y:        t.y ?? 0,
        stripe:   t.stripe ?? null,
        name:     macro?.name ?? "(missing)",
        img:      macro?.img ?? "icons/svg/hazard.svg",
        missing:  !macro,
        hotkey:   t.hotkey ?? null
      };
    });

    // Build columns when layout === "columns"
    let columns = null;
    if (layout === "columns" && activeTab) {
      const map = new Map();
      for (const t of tiles) {
        const key = t.stripe || "_misc";
        if (!map.has(key)) {
          const lkey = COLUMN_KEYS[t.stripe] || "MACRO_DASHBOARD.Layout.Column.Macros";
          map.set(key, { stripe: t.stripe || "", name: game.i18n.localize(lkey), tiles: [] });
        }
        map.get(key).tiles.push(t);
      }
      columns = [...map.values()];
    }

    return {
      modeBar: {
        viewingSceneName: viewingScene?.name ?? "—",
        activeSceneName:  activeScene?.name  ?? "—",
        autoSwitch,
        isOverriding,
        overrideTooltip:  game.i18n.format("MACRO_DASHBOARD.ModeBar.OverrideTooltip", { name: activeScene?.name ?? "" }),
        scenes: game.scenes.contents.map(s => ({
          id:       s.id,
          label:    s.name + (s.id === activeScene?.id ? game.i18n.localize("MACRO_DASHBOARD.ModeBar.ActiveSceneSuffix") : ""),
          selected: s.id === viewingSceneId
        }))
      },
      tabs:           tabs.map(t => ({ ...t, isActive: t.id === this.activeId, isGlobal: t.scope === "global" })),
      activeTab:      activeTab ? { ...activeTab, isGlobal: activeTab.scope === "global" } : null,
      tiles,
      columns,
      isColumns:      layout === "columns",
      emptyDashboards:tabs.length === 0,
      emptyTiles:     !!activeTab && tiles.length === 0,
      tileSize,
      layout,
      viewingSceneId
    };
  }

  // -----------------------------------------------------------------------
  // Listener-attachment idempotency: every queryselector below filters out
  // elements that already carry [data-wired]. New elements created by a
  // re-render get wired exactly once; survivors of a partial re-render
  // are skipped. ApplicationV2's HandlebarsApplicationMixin replaces part
  // contents on full renders (so new elements appear unwired and pass the
  // filter), but the guard makes us robust to any future render strategy
  // that preserves DOM nodes across renders.
  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;

    // Canvas drag-drop + box-select
    const canvas = root.querySelector(".md-canvas:not([data-wired])");
    if (canvas) {
      canvas.dataset.wired = "1";
      canvas.addEventListener("dragover", this.#onCanvasDragOver.bind(this));
      canvas.addEventListener("dragleave", this.#onCanvasDragLeave.bind(this));
      canvas.addEventListener("drop", this.#onCanvasDrop.bind(this));
      canvas.addEventListener("mousedown", this.#onCanvasMouseDown.bind(this));
    }

    // Tile interactions: drag, contextmenu, hover tooltip
    for (const tile of root.querySelectorAll(".md-tile:not([data-wired])")) {
      tile.dataset.wired = "1";
      const tileId  = tile.dataset.tileId;
      const macroId = tile.dataset.macroId;

      tile.addEventListener("dragstart", (ev) => {
        // If the user drags a tile that's part of a multi-selection, send
        // ALL selected tiles in the payload (with their starting positions)
        // so the drop handler can move them as a group while preserving
        // their relative offsets. Otherwise it's a single-tile drag.
        const inSelection = this.selectedTileIds.size > 1 && this.selectedTileIds.has(tileId);
        let payload;
        if (inSelection) {
          const positions = {};
          const data = State.read();
          for (const arr of Object.values(data)) {
            if (!Array.isArray(arr)) continue;
            for (const d of arr) {
              if (d.id !== this.activeId) continue;
              for (const t of (d.tiles ?? [])) {
                if (this.selectedTileIds.has(t.id)) {
                  positions[t.id] = { x: t.x ?? 0, y: t.y ?? 0 };
                }
              }
            }
          }
          payload = {
            type:       "tiles",
            primary:    tileId,
            primaryPos: positions[tileId] ?? { x: 0, y: 0 },
            positions
          };
        } else {
          payload = { type: "tile", tileId };
        }
        ev.dataTransfer.setData("application/json", JSON.stringify(payload));
        // "copyMove" so the canvas dragover (which sets dropEffect="copy"
        // for library drops) still accepts the move; the browser silently
        // suppresses the drop event when dropEffect is not in effectAllowed.
        ev.dataTransfer.effectAllowed = "copyMove";
        // Centre the drag-ghost on the cursor instead of letting the browser
        // anchor it to wherever the user happened to click inside the tile.
        ev.dataTransfer.setDragImage(tile, tile.offsetWidth / 2, tile.offsetHeight / 2);
        tile.classList.add("dragging");
        this.#hideTooltip();
      });
      tile.addEventListener("dragend", () => tile.classList.remove("dragging"));

      tile.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        if (ev.shiftKey) {
          // Shift+right-click opens the macro's built-in sheet (power-user shortcut)
          game.macros.get(macroId)?.sheet.render(true);
          return;
        }
        this.#openContextMenu(ev.clientX, ev.clientY, tile);
      });

      tile.addEventListener("mouseenter", () => this.#showTooltip(tile));
      tile.addEventListener("mouseleave", () => this.#hideTooltip());
    }

    // Scene picker (manual mode)
    const sceneSelect = root.querySelector("[data-scene-select]:not([data-wired])");
    if (sceneSelect) {
      sceneSelect.dataset.wired = "1";
      sceneSelect.addEventListener("change", async (ev) => {
        await game.settings.set(MODULE_ID, SETTINGS.VIEWING_SCENE_ID, ev.target.value);
        this.activeId = null;
        this.render();
      });
    }

    // Tab interactions: rename via dblclick, drag-to-reorder within scope,
    // right-click for the tab context menu (rename / duplicate / toggle
    // scope / delete).
    for (const tab of root.querySelectorAll(".md-tab[data-tab-id]:not([data-wired])")) {
      tab.dataset.wired = "1";
      tab.addEventListener("dblclick", (ev) => {
        if (ev.target.closest(".md-tab-close")) return;
        this.#startInlineRename(tab.dataset.tabId, tab);
      });
      tab.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.#openTabContextMenu(ev.clientX, ev.clientY, tab);
      });
      tab.addEventListener("dragstart", (ev) => {
        ev.stopPropagation();
        ev.dataTransfer.setData("application/json", JSON.stringify({
          type: "tab", tabId: tab.dataset.tabId, scope: tab.dataset.tabScope
        }));
        ev.dataTransfer.effectAllowed = "move";
        // Centre the drag-ghost on the cursor for the tab too.
        ev.dataTransfer.setDragImage(tab, tab.offsetWidth / 2, tab.offsetHeight / 2);
        tab.classList.add("dragging");
      });
      tab.addEventListener("dragend", () => tab.classList.remove("dragging"));
      tab.addEventListener("dragover", (ev) => {
        ev.preventDefault();
        ev.dataTransfer.dropEffect = "move";
        tab.classList.add("drag-over");
      });
      tab.addEventListener("dragleave", (ev) => {
        if (tab.contains(ev.relatedTarget)) return;
        tab.classList.remove("drag-over");
      });
      tab.addEventListener("drop", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        tab.classList.remove("drag-over");
        let payload;
        try { payload = JSON.parse(ev.dataTransfer.getData("application/json")); }
        catch { return; }
        if (payload.type !== "tab") return;
        if (payload.scope !== tab.dataset.tabScope) return;
        if (payload.tabId === tab.dataset.tabId) return;
        await this.#reorderTab(payload.tabId, tab.dataset.tabId, payload.scope);
      });
    }
  }

  _onClose(options) {
    this.#hideTooltip();
    this.#closeContextMenu();
    if (this.#tooltipEl) { this.#tooltipEl.remove(); this.#tooltipEl = null; }
    // Drop the singleton reference so toggle() doesn't keep a closed
    // instance (and all its private state) alive for the rest of the
    // session. The next toggle() will construct a fresh instance.
    if (MacroDashboardApp.#_instance === this) MacroDashboardApp.#_instance = null;
    super._onClose?.(options);
  }

  // -----------------------------------------------------------------------
  // Drag-drop helpers

  #cellSize() {
    const inner = this.element?.querySelector(".md-canvas-inner");
    if (!inner) return 80;
    const v = parseInt(getComputedStyle(inner).getPropertyValue("--md-cell"));
    return Number.isFinite(v) ? v : 80;
  }

  #snapTo(ev, canvas) {
    const rect = canvas.getBoundingClientRect();
    const cell = this.#cellSize();
    // Convert viewport-relative cursor coords into the canvas-inner's local
    // coordinate system (which moves with scrollTop/scrollLeft), then snap
    // such that the tile's CENTRE lands on the cursor. This matches the
    // centred drag-image set in dragstart so the visible ghost and the
    // actual drop position agree. Without the `- cell/2` offset the tile's
    // top-left corner would land where the cursor was, dragging the visible
    // ghost (which is centred) down and right.
    const innerX = ev.clientX - rect.left + canvas.scrollLeft - 12 - cell / 2;
    const innerY = ev.clientY - rect.top  + canvas.scrollTop  - 12 - cell / 2;
    const x = Math.max(0, Math.round(innerX / cell));
    const y = Math.max(0, Math.round(innerY / cell));
    return { x, y };
  }

  #onCanvasDragOver(ev) {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = "copy";
    ev.currentTarget.classList.add("drop-active");

    // Drop ghost only in grid layout
    if (game.settings.get(MODULE_ID, SETTINGS.LAYOUT) !== "grid") return;
    let ghost = ev.currentTarget.querySelector(".md-drop-ghost");
    if (!ghost) {
      ghost = document.createElement("div");
      ghost.className = "md-drop-ghost";
      ev.currentTarget.querySelector(".md-canvas-inner")?.appendChild(ghost);
    }
    const { x, y } = this.#snapTo(ev, ev.currentTarget);
    ghost.style.left = `calc(12px + ${x} * var(--md-cell))`;
    ghost.style.top  = `calc(12px + ${y} * var(--md-cell))`;
  }

  #onCanvasDragLeave(ev) {
    if (ev.currentTarget.contains(ev.relatedTarget)) return;
    ev.currentTarget.classList.remove("drop-active");
    ev.currentTarget.querySelector(".md-drop-ghost")?.remove();
  }

  /** Box-select drag start. Left-click on empty canvas (not a tile) clears
   *  any existing selection and begins a marquee. While the mouse moves
   *  with the button held, an .md-select-box overlay is drawn inside the
   *  canvas-inner. On mouseup, every .md-tile whose viewport bounding rect
   *  intersects the box is added to selectedTileIds and given a
   *  .selected outline. A click without measurable drag (< 4px) is treated
   *  as a click-to-clear and does nothing else. Only fires in grid layout
   *  - in columns layout, tiles snap into auto-binned columns and a
   *    bounding-rect marquee makes no sense. */
  #onCanvasMouseDown(ev) {
    if (ev.button !== 0) return;
    if (ev.target.closest(".md-tile")) return;
    if (game.settings.get(MODULE_ID, SETTINGS.LAYOUT) !== "grid") return;

    if (this.selectedTileIds.size) this.#clearSelection();

    const canvasInner = this.element.querySelector(".md-canvas-inner");
    if (!canvasInner) return;

    const startX = ev.clientX;
    const startY = ev.clientY;

    const box = document.createElement("div");
    box.className = "md-select-box";
    canvasInner.appendChild(box);

    const onMove = (mev) => {
      const innerR = canvasInner.getBoundingClientRect();
      const x1 = Math.min(startX, mev.clientX);
      const y1 = Math.min(startY, mev.clientY);
      const x2 = Math.max(startX, mev.clientX);
      const y2 = Math.max(startY, mev.clientY);
      box.style.left   = `${x1 - innerR.left}px`;
      box.style.top    = `${y1 - innerR.top}px`;
      box.style.width  = `${x2 - x1}px`;
      box.style.height = `${y2 - y1}px`;
    };

    const onUp = (mev) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onUp);

      const w = Math.abs(mev.clientX - startX);
      const h = Math.abs(mev.clientY - startY);
      if (w < 4 && h < 4) {
        // Treat as click-to-clear; box never grew.
        box.remove();
        return;
      }

      const x1 = Math.min(startX, mev.clientX);
      const y1 = Math.min(startY, mev.clientY);
      const x2 = Math.max(startX, mev.clientX);
      const y2 = Math.max(startY, mev.clientY);

      for (const tileEl of this.element.querySelectorAll(".md-tile")) {
        const r = tileEl.getBoundingClientRect();
        // Standard AABB intersection test.
        if (r.right > x1 && r.left < x2 && r.bottom > y1 && r.top < y2) {
          tileEl.classList.add("selected");
          this.selectedTileIds.add(tileEl.dataset.tileId);
        }
      }

      box.remove();
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
  }

  /** Clear the current multi-selection: empty the set and strip the
   *  .selected class from every still-rendered tile. Safe to call when
   *  there is no active selection (no-op). */
  #clearSelection() {
    if (!this.selectedTileIds.size) return;
    this.selectedTileIds.clear();
    this.element?.querySelectorAll(".md-tile.selected").forEach(el => { el.classList.remove("selected"); });
  }

  /** Bulk-delete every tile currently in the multi-selection from the
   *  active dashboard. One settings write, not N. */
  async #deleteSelection() {
    const ids = new Set(this.selectedTileIds);
    if (!this.activeId || !ids.size) return;
    await State.update(this.activeId, d => ({
      ...d,
      tiles: (d.tiles ?? []).filter(t => !ids.has(t.id))
    }));
    ui.notifications.info(game.i18n.format("MACRO_DASHBOARD.Notification.SelectionDeleted", { n: ids.size }));
    this.#clearSelection();
    this.render();
  }

  /** Open the Create Preset Group dialog with the macros from every tile
   *  in the selection pre-selected (deduped, since the same macro can
   *  appear on multiple tiles). */
  async #groupSelection() {
    const macroIds = new Set();
    for (const tileId of this.selectedTileIds) {
      const found = this.#findTile(tileId);
      if (found?.tile?.macroId) macroIds.add(found.tile.macroId);
    }
    if (!macroIds.size) return;
    await CreateGroupDialog.open({ initialMacroIds: [...macroIds] });
    this.#clearSelection();
    game.macroDashboard?.MacroLibraryApp?.instance?.render?.();
    this.render();
  }

  async #onCanvasDrop(ev) {
    ev.preventDefault();
    const canvasEl = ev.currentTarget;
    canvasEl.classList.remove("drop-active");
    canvasEl.querySelector(".md-drop-ghost")?.remove();

    let payload;
    try { payload = JSON.parse(ev.dataTransfer.getData("application/json")); }
    catch { return; }

    if (!this.activeId) return;
    const layout = game.settings.get(MODULE_ID, SETTINGS.LAYOUT);

    // In columns mode, dropping on a column inherits its stripe color
    let columnStripe = null;
    if (layout === "columns") {
      const col = ev.target.closest(".md-column");
      columnStripe = col?.dataset.stripe || null;
    }

    const { x, y } = this.#snapTo(ev, canvasEl);

    if (payload.type === "macro") {
      await State.update(this.activeId, d => ({
        ...d,
        tiles: [...(d.tiles ?? []), { id: State.newId("t"), macroId: payload.macroId, x, y, stripe: columnStripe || null }]
      }));
    } else if (payload.type === "group") {
      const group = State.readGroups().find(g => g.id === payload.groupId);
      if (!group) return;
      const newTiles = group.macros.map((mid, i) => ({
        id:      State.newId("t"),
        macroId: mid,
        x:       x + (i % 4),
        y:       y + Math.floor(i / 4) * 2,
        stripe:  columnStripe || group.color
      }));
      await State.update(this.activeId, d => ({ ...d, tiles: [...(d.tiles ?? []), ...newTiles] }));
    } else if (payload.type === "tile") {
      await State.update(this.activeId, d => ({
        ...d,
        tiles: (d.tiles ?? []).map(t => t.id === payload.tileId ? { ...t, x, y } : t)
      }));
    } else if (payload.type === "tiles") {
      // Multi-tile move: compute the delta the primary tile moved, then
      // apply that delta to every other selected tile, preserving the
      // group's relative layout. Negative coords are clamped at 0.
      const dx = x - (payload.primaryPos?.x ?? 0);
      const dy = y - (payload.primaryPos?.y ?? 0);
      await State.update(this.activeId, d => ({
        ...d,
        tiles: (d.tiles ?? []).map(t => {
          const p = payload.positions?.[t.id];
          if (!p) return t;
          return { ...t, x: Math.max(0, p.x + dx), y: Math.max(0, p.y + dy) };
        })
      }));
    }

    this.render();
  }

  // -----------------------------------------------------------------------
  // Tab actions

  static async #onAddTab() {
    const ctx = await this._prepareContext();
    const newDash = {
      id:    State.newId("d"),
      name:  game.i18n.localize("MACRO_DASHBOARD.Tab.NewName"),
      icon:  "fa-solid fa-bolt",
      scope: "scene",
      tiles: []
    };
    await State.create(ctx.viewingSceneId, newDash);
    this.activeId = newDash.id;
    this.render();
  }

  static #onSwitchTab(event, target) {
    this.activeId = target.dataset.tabId;
    this.render();
  }

  static async #onRemoveTab(event, target) {
    event.stopPropagation();
    const tabId = target.closest("[data-tab-id]")?.dataset.tabId;
    if (!tabId) return;

    const data = State.read();
    let found = null;
    for (const arr of Object.values(data)) if (Array.isArray(arr)) found = arr.find(d => d.id === tabId) ?? found;
    if (!found) return;

    const confirmed = (found.tiles?.length ?? 0) === 0 ? true : await foundry.applications.api.DialogV2.confirm({
      window:      { title: game.i18n.localize("MACRO_DASHBOARD.Tab.ConfirmDelete.Title") },
      content:     game.i18n.format("MACRO_DASHBOARD.Tab.ConfirmDelete.Content", { name: found.name }),
      rejectClose: false
    });
    if (!confirmed) return;

    await State.destroy(tabId);
    if (this.activeId === tabId) this.activeId = null;
    this.render();
  }

  static async #onRenameTab(event, target) {
    event.stopPropagation();
    const tabId = target.closest("[data-tab-id]")?.dataset.tabId;
    if (!tabId) return;
    const tab = this.element.querySelector(`.md-tab[data-tab-id="${tabId}"]`);
    if (tab) this.#startInlineRename(tabId, tab);
  }

  #startInlineRename(tabId, tabEl) {
    const nameSpan = tabEl.querySelector(".md-tab-name");
    if (!nameSpan) return;
    const current = nameSpan.textContent.trim();
    const input = document.createElement("input");
    input.type = "text"; input.className = "rename"; input.value = current;
    nameSpan.replaceWith(input);
    input.focus(); input.select();

    const commit = async () => {
      const val = input.value.trim() || current;
      await State.update(tabId, d => ({ ...d, name: val }));
      this.render();
    };
    input.addEventListener("blur", commit, { once: true });
    input.addEventListener("keydown", ev => {
      if (ev.key === "Enter")  { ev.preventDefault(); input.blur(); }
      if (ev.key === "Escape") { input.value = current; input.blur(); }
    });
  }

  async #reorderTab(srcId, dstId, scope) {
    const ctx = await this._prepareContext();
    const data = State.read();
    const key = scope === "global" ? "global" : ctx.viewingSceneId;
    const arr = data[key];
    if (!Array.isArray(arr)) return;
    const srcIdx = arr.findIndex(d => d.id === srcId);
    const dstIdx = arr.findIndex(d => d.id === dstId);
    if (srcIdx < 0 || dstIdx < 0) return;
    const [moved] = arr.splice(srcIdx, 1);
    arr.splice(dstIdx, 0, moved);
    await State.write(data);
    this.render();
  }

  static async #onToggleAutoSwitch() {
    const cur = game.settings.get(MODULE_ID, SETTINGS.AUTO_SWITCH);
    await game.settings.set(MODULE_ID, SETTINGS.AUTO_SWITCH, !cur);
    this.render();
  }

  // -----------------------------------------------------------------------
  // Tile execute

  static async #onExecuteTile(event, target) {
    const macroId = target.dataset.macroId;
    const macro   = game.macros.get(macroId);
    if (!macro) return ui.notifications.warn(game.i18n.localize("MACRO_DASHBOARD.Notification.MacroMissing"));
    const skipToken = event.ctrlKey || event.metaKey;
    const token     = skipToken ? null : canvas.tokens.controlled[0];
    await macro.execute({ actor: token?.actor, token });
  }

  // -----------------------------------------------------------------------
  // Tile actions invoked from the context menu

  /** Locate a tile across all dashboards. @returns {{tile, dashboardId}|null} */
  #findTile(tileId) {
    const data = State.read();
    for (const arr of Object.values(data)) {
      if (!Array.isArray(arr)) continue;
      for (const d of arr) {
        const t = d.tiles?.find(x => x.id === tileId);
        if (t) return { tile: t, dashboardId: d.id };
      }
    }
    return null;
  }

  async editTile(tileId) {
    const found = this.#findTile(tileId);
    if (!found) return;
    const macro = game.macros.get(found.tile.macroId);
    if (!macro) return ui.notifications.warn(game.i18n.localize("MACRO_DASHBOARD.Notification.MacroMissing"));

    const result = await EditTileDialog.open({ tile: found.tile, macro });
    if (!result) return;

    await macro.update({
      name:    result.name?.trim() || macro.name,
      img:     result.img?.trim()  || macro.img,
      command: result.command ?? macro.command
    });
    if (result.description?.trim()) {
      await macro.setFlag(MODULE_ID, "description", result.description.trim());
    } else {
      await macro.unsetFlag(MODULE_ID, "description");
    }
    await State.update(found.dashboardId, d => ({
      ...d,
      tiles: d.tiles.map(t => t.id === tileId ? { ...t, stripe: result.stripe || null, hotkey: (result.hotkey || "").trim() || null } : t)
    }));
    this.render();
  }

  async duplicateTile(tileId) {
    const found = this.#findTile(tileId);
    if (!found) return;
    const t = found.tile;
    await State.update(found.dashboardId, d => ({
      ...d,
      tiles: [...d.tiles, { ...t, id: State.newId("t"), x: (t.x ?? 0) + 1, y: t.y ?? 0 }]
    }));
    this.render();
  }

  async setTileStripe(tileId, stripe) {
    const found = this.#findTile(tileId);
    if (!found) return;
    await State.update(found.dashboardId, d => ({
      ...d,
      tiles: d.tiles.map(t => t.id === tileId ? { ...t, stripe: stripe || null } : t)
    }));
    this.render();
  }

  async removeTile(tileId) {
    const found = this.#findTile(tileId);
    if (!found) return;
    await State.update(found.dashboardId, d => ({
      ...d,
      tiles: d.tiles.filter(t => t.id !== tileId)
    }));
    this.render();
  }

  async addMacroToGroup(macroId, groupId) {
    if (groupId) {
      const group = State.readGroups().find(g => g.id === groupId);
      if (!group) return;
      if (group.macros.includes(macroId)) {
        ui.notifications.info(`Already in group "${group.name}".`);
        return;
      }
      await State.updateGroup(groupId, g => ({ ...g, macros: [...g.macros, macroId] }));
      ui.notifications.info(`Added to group "${group.name}".`);
    } else {
      // No group provided -> create new with this macro pre-selected
      await CreateGroupDialog.open({ initialMacroIds: [macroId] });
    }
    game.macroDashboard?.MacroLibraryApp?.instance?.render?.();
  }

  // -----------------------------------------------------------------------
  // Hover tooltip

  #showTooltip(tileEl) {
    const macroId = tileEl.dataset.macroId;
    const macro   = game.macros.get(macroId);
    if (!macro) return;
    const description = macro.getFlag(MODULE_ID, "description") ?? "";
    const cmdPreview  = (macro.command ?? "").slice(0, 80);

    if (!this.#tooltipEl) {
      this.#tooltipEl = document.createElement("div");
      this.#tooltipEl.className = "md-tooltip macro-dashboard";
      document.body.appendChild(this.#tooltipEl);
    }

    this.#tooltipEl.innerHTML = `
      <strong>${escHtml(macro.name)}</strong>
      ${description ? `<div>${escHtml(description)}</div>` : ""}
      ${cmdPreview ? `<em style="display:block;margin-top:4px;">${escHtml(cmdPreview)}</em>` : ""}
    `;

    const rect = tileEl.getBoundingClientRect();
    this.#tooltipEl.style.display = "block";
    const tipRect = this.#tooltipEl.getBoundingClientRect();
    let left = rect.right + 6;
    if (left + tipRect.width > window.innerWidth) left = rect.left - tipRect.width - 6;
    let top = rect.top;
    if (top + tipRect.height > window.innerHeight) top = window.innerHeight - tipRect.height - 8;
    if (top < 8) top = 8;

    this.#tooltipEl.style.left = `${left}px`;
    this.#tooltipEl.style.top  = `${top}px`;
  }

  #hideTooltip() {
    if (this.#tooltipEl) this.#tooltipEl.style.display = "none";
  }

  // -----------------------------------------------------------------------
  // Context menu

  #closeContextMenu() {
    if (this.#ctxMenuEl) {
      this.#ctxMenuEl.remove();
      this.#ctxMenuEl = null;
    }
    if (this.#ctxDocListeners) {
      document.removeEventListener("mousedown", this.#ctxDocListeners.onDoc);
      document.removeEventListener("keydown",   this.#ctxDocListeners.onKey);
      this.#ctxDocListeners = null;
    }
  }

  #openContextMenu(x, y, tileEl) {
    this.#closeContextMenu();
    this.#hideTooltip();

    const tileId  = tileEl.dataset.tileId;
    const macroId = tileEl.dataset.macroId;
    const groups  = State.readGroups();

    const stripeRow = STRIPES.map(s => {
      const cls   = s ? "swatch" : "swatch none";
      const style = s ? `background:${s}` : "";
      const inner = s ? "" : '<i class="fa-solid fa-ban"></i>';
      const title = s || game.i18n.localize("MACRO_DASHBOARD.Stripe.None");
      return `<button type="button" class="${cls}" data-ctx-stripe="${s}" title="${escHtml(title)}" style="${style}">${inner}</button>`;
    }).join("");

    const renderGroupIcon = (g) => isImagePath(g.icon)
      ? `<span class="md-ctx-icon"><img src="${escAttr(g.icon)}" alt="" style="width:14px;height:14px;border-radius:2px;object-fit:cover;"/></span>`
      : `<span class="md-ctx-icon" style="color:${g.color}"><i class="${escAttr(g.icon)}"></i></span>`;

    const groupItems = groups.length === 0
      ? `<div class="md-ctx-item" data-ctx-add-group="">
           <span class="md-ctx-icon"><i class="fa-solid fa-plus"></i></span>
           <span>${game.i18n.localize("MACRO_DASHBOARD.ContextMenu.NewGroupFromTile")}</span>
         </div>`
      : groups.map(g => `
          <div class="md-ctx-item" data-ctx-add-group="${g.id}">
            ${renderGroupIcon(g)}
            <span>${escHtml(g.name)}</span>
          </div>`).join("") +
        `<div class="md-ctx-item" data-ctx-add-group="">
           <span class="md-ctx-icon"><i class="fa-solid fa-plus"></i></span>
           <span>${game.i18n.localize("MACRO_DASHBOARD.ContextMenu.NewGroupFromTile")}</span>
         </div>`;

    // If the right-clicked tile is part of a multi-tile selection, prepend
    // selection-wide actions ABOVE the per-tile section. Below the
    // separator the regular per-tile menu still applies (acting on the
    // single right-clicked tile, not the whole selection).
    const selectionActive = this.selectedTileIds.size > 1 && this.selectedTileIds.has(tileId);
    const selectionN      = this.selectedTileIds.size;
    const selectionHeader = !selectionActive ? "" : `
      <div style="padding:4px 10px 0;font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--fdry-fg-muted);">
        Selection (${selectionN} tiles)
      </div>
      <div class="md-ctx-item danger" data-ctx-action="deleteSelection">
        <span class="md-ctx-icon"><i class="fa-solid fa-trash"></i></span>
        <span>${game.i18n.format("MACRO_DASHBOARD.SelectionMenu.Delete", { n: selectionN })}</span>
      </div>
      <div class="md-ctx-item" data-ctx-action="groupSelection">
        <span class="md-ctx-icon"><i class="fa-solid fa-folder-plus"></i></span>
        <span>${game.i18n.format("MACRO_DASHBOARD.SelectionMenu.Group", { n: selectionN })}</span>
      </div>
      <div class="md-ctx-item" data-ctx-action="clearSelection">
        <span class="md-ctx-icon"><i class="fa-solid fa-xmark"></i></span>
        <span>${game.i18n.localize("MACRO_DASHBOARD.SelectionMenu.Clear")}</span>
      </div>
      <div class="md-ctx-sep"></div>
    `;

    const menu = document.createElement("div");
    menu.className = "md-ctx macro-dashboard";
    menu.innerHTML = selectionHeader + `
      <div class="md-ctx-item" data-ctx-action="edit">
        <span class="md-ctx-icon"><i class="fa-solid fa-pen"></i></span>
        <span>${game.i18n.localize("MACRO_DASHBOARD.ContextMenu.Edit")}</span>
      </div>
      <div class="md-ctx-item" data-ctx-action="duplicate">
        <span class="md-ctx-icon"><i class="fa-solid fa-copy"></i></span>
        <span>${game.i18n.localize("MACRO_DASHBOARD.ContextMenu.Duplicate")}</span>
      </div>
      <div class="md-ctx-item" data-ctx-action="execute">
        <span class="md-ctx-icon"><i class="fa-solid fa-bolt"></i></span>
        <span>${game.i18n.localize("MACRO_DASHBOARD.ContextMenu.Execute")}</span>
      </div>
      <div class="md-ctx-sep"></div>
      <div class="md-ctx-submenu">
        <span class="label">${game.i18n.localize("MACRO_DASHBOARD.ContextMenu.ChangeColor")}</span>
        ${stripeRow}
      </div>
      <div class="md-ctx-sep"></div>
      <div style="padding:4px 10px 0;font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--fdry-fg-muted);">
        ${game.i18n.localize("MACRO_DASHBOARD.ContextMenu.AddToGroup")}
      </div>
      ${groupItems}
      <div class="md-ctx-sep"></div>
      <div class="md-ctx-item danger" data-ctx-action="remove">
        <span class="md-ctx-icon"><i class="fa-solid fa-trash"></i></span>
        <span>${game.i18n.localize("MACRO_DASHBOARD.ContextMenu.Remove")}</span>
      </div>
    `;

    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    const px = Math.min(x, window.innerWidth  - rect.width  - 8);
    const py = Math.min(y, window.innerHeight - rect.height - 8);
    menu.style.left = `${px}px`;
    menu.style.top  = `${py}px`;

    menu.addEventListener("click", async (ev) => {
      const stripeBtn = ev.target.closest("[data-ctx-stripe]");
      const groupItem = ev.target.closest("[data-ctx-add-group]");
      const ctxItem   = ev.target.closest("[data-ctx-action]");

      if (stripeBtn) {
        const stripe = stripeBtn.dataset.ctxStripe;
        this.#closeContextMenu();
        await this.setTileStripe(tileId, stripe);
        return;
      }
      if (groupItem) {
        const groupId = groupItem.dataset.ctxAddGroup;
        this.#closeContextMenu();
        await this.addMacroToGroup(macroId, groupId || null);
        return;
      }
      if (!ctxItem) return;
      const action = ctxItem.dataset.ctxAction;
      this.#closeContextMenu();
      switch (action) {
        case "edit":             await this.editTile(tileId);       break;
        case "duplicate":        await this.duplicateTile(tileId);  break;
        case "execute":
          await game.macros.get(macroId)?.execute({
            actor: canvas.tokens.controlled[0]?.actor,
            token: canvas.tokens.controlled[0]
          });
          break;
        case "remove":           await this.removeTile(tileId);     break;
        case "deleteSelection":  await this.#deleteSelection();     break;
        case "groupSelection":   await this.#groupSelection();      break;
        case "clearSelection":   this.#clearSelection();            break;
      }
    });

    this.#ctxMenuEl = menu;

    // Outside-click + Escape dismiss
    const onDoc = (ev) => { if (!menu.contains(ev.target)) this.#closeContextMenu(); };
    const onKey = (ev) => { if (ev.key === "Escape") this.#closeContextMenu(); };
    this.#ctxDocListeners = { onDoc, onKey };
    setTimeout(() => {
      document.addEventListener("mousedown", onDoc);
      document.addEventListener("keydown", onKey);
    }, 0);
  }

  // -----------------------------------------------------------------------
  // Tab right-click context menu
  //
  // Reuses the same #ctxMenuEl + #ctxDocListeners infrastructure as the tile
  // context menu (so opening one closes the other). Items: rename inline,
  // duplicate this tab, toggle scope (global <-> currently-viewed scene),
  // delete (with confirm if non-empty).

  #openTabContextMenu(x, y, tabEl) {
    this.#closeContextMenu();
    this.#hideTooltip();

    const tabId    = tabEl.dataset.tabId;
    const scope    = tabEl.dataset.tabScope;     // "global" or "scene"
    const isGlobal = scope === "global";

    const menu = document.createElement("div");
    menu.className = "md-ctx macro-dashboard";
    menu.innerHTML = `
      <div class="md-ctx-item" data-ctx-action="rename">
        <span class="md-ctx-icon"><i class="fa-solid fa-pen"></i></span>
        <span>${game.i18n.localize("MACRO_DASHBOARD.TabContextMenu.Rename")}</span>
      </div>
      <div class="md-ctx-item" data-ctx-action="duplicate">
        <span class="md-ctx-icon"><i class="fa-solid fa-copy"></i></span>
        <span>${game.i18n.localize("MACRO_DASHBOARD.TabContextMenu.Duplicate")}</span>
      </div>
      <div class="md-ctx-item" data-ctx-action="toggleScope">
        <span class="md-ctx-icon"><i class="fa-solid ${isGlobal ? "fa-map-location-dot" : "fa-globe"}"></i></span>
        <span>${game.i18n.localize(isGlobal ? "MACRO_DASHBOARD.TabContextMenu.MakeSceneScoped" : "MACRO_DASHBOARD.TabContextMenu.MakeGlobal")}</span>
      </div>
      <div class="md-ctx-sep"></div>
      <div class="md-ctx-item danger" data-ctx-action="remove">
        <span class="md-ctx-icon"><i class="fa-solid fa-trash"></i></span>
        <span>${game.i18n.localize("MACRO_DASHBOARD.TabContextMenu.Remove")}</span>
      </div>
    `;

    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    const px = Math.min(x, window.innerWidth  - rect.width  - 8);
    const py = Math.min(y, window.innerHeight - rect.height - 8);
    menu.style.left = `${px}px`;
    menu.style.top  = `${py}px`;

    menu.addEventListener("click", async (ev) => {
      const ctxItem = ev.target.closest("[data-ctx-action]");
      if (!ctxItem) return;
      const action = ctxItem.dataset.ctxAction;
      this.#closeContextMenu();
      switch (action) {
        case "rename": {
          const liveTab = this.element.querySelector(`.md-tab[data-tab-id="${tabId}"]`);
          if (liveTab) this.#startInlineRename(tabId, liveTab);
          break;
        }
        case "duplicate":   await this.#duplicateTab(tabId);   break;
        case "toggleScope": await this.#toggleTabScope(tabId); break;
        case "remove":      await this.#confirmRemoveTab(tabId); break;
      }
    });

    this.#ctxMenuEl = menu;

    // Outside-click + Escape dismiss
    const onDoc = (ev) => { if (!menu.contains(ev.target)) this.#closeContextMenu(); };
    const onKey = (ev) => { if (ev.key === "Escape") this.#closeContextMenu(); };
    this.#ctxDocListeners = { onDoc, onKey };
    setTimeout(() => {
      document.addEventListener("mousedown", onDoc);
      document.addEventListener("keydown", onKey);
    }, 0);
  }

  /** Duplicate the tab with the given id. The clone gets fresh tile ids
   *  (so edits to one don't propagate to the other) and the active tab
   *  switches to the new copy. */
  async #duplicateTab(tabId) {
    const clone = await State.duplicate(tabId);
    if (!clone) return;
    this.activeId = clone.id;
    this.render();
  }

  /** Toggle the tab's scope between "global" and the currently-viewed scene.
   *  No-op if the current scope is a scene other than the viewed one (which
   *  shouldn't happen in normal UI flow because tabs only render for global
   *  + the viewed scene). */
  async #toggleTabScope(tabId) {
    const data = State.read();
    let currentScope = null;
    for (const key of Object.keys(data)) {
      if (Array.isArray(data[key]) && data[key].some(d => d.id === tabId)) {
        currentScope = key;
        break;
      }
    }
    if (!currentScope) return;

    const ctx = await this._prepareContext();
    const newScope = currentScope === "global" ? ctx.viewingSceneId : "global";
    if (!newScope) {
      ui.notifications.warn("Macro Dashboard: cannot move tab - no current scene to attach it to.");
      return;
    }
    await State.moveScope(tabId, newScope);
    this.render();
  }

  /** Confirm-then-delete the tab. No confirm if the tab is empty. */
  async #confirmRemoveTab(tabId) {
    const data = State.read();
    let found = null;
    for (const arr of Object.values(data)) {
      if (Array.isArray(arr)) found = arr.find(d => d.id === tabId) ?? found;
    }
    if (!found) return;

    const confirmed = (found.tiles?.length ?? 0) === 0
      ? true
      : await foundry.applications.api.DialogV2.confirm({
          window:      { title: game.i18n.localize("MACRO_DASHBOARD.Tab.ConfirmDelete.Title") },
          content:     game.i18n.format("MACRO_DASHBOARD.Tab.ConfirmDelete.Content", { name: found.name }),
          rejectClose: false
        });
    if (!confirmed) return;

    await State.destroy(tabId);
    if (this.activeId === tabId) this.activeId = null;
    this.render();
  }
}
