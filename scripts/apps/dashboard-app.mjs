// Macro Dashboard window - tabs, snap-grid canvas, drag-drop, tile execution.

import { MODULE_ID, State } from "../module.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

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
      executeTile:      MacroDashboardApp.#onExecuteTile,
      editTile:         MacroDashboardApp.#onEditTile,
      deleteTile:       MacroDashboardApp.#onDeleteTile
    }
  };

  static PARTS = {
    main: {
      template:   `modules/${MODULE_ID}/templates/dashboard.hbs`,
      scrollable: [".md-canvas"]
    }
  };

  /** Singleton accessor + toggle */
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

  // ---------------------------------------------------------------
  // Per-instance UI state (NOT persisted)
  activeId  = null;          // currently active tab id

  // ---------------------------------------------------------------
  async _prepareContext() {
    const data       = State.read();
    const autoSwitch = game.settings.get(MODULE_ID, "autoSwitch");
    const tileSize   = game.settings.get(MODULE_ID, "tileSize");
    const layout     = game.settings.get(MODULE_ID, "layout");
    const activeScene = game.scenes.active ?? game.scenes.viewed;

    // viewing scene = active scene in auto-switch, else the manual selection
    let viewingSceneId = autoSwitch
      ? activeScene?.id
      : (game.settings.get(MODULE_ID, "viewingSceneId") || activeScene?.id);
    if (!game.scenes.get(viewingSceneId)) viewingSceneId = activeScene?.id;

    const viewingScene = game.scenes.get(viewingSceneId);
    const isOverriding = !autoSwitch && viewingSceneId !== activeScene?.id;

    // Build the tab list: globals first, then this scene's
    const globals = (data.global ?? []).map(d => ({ ...d, scope: "global" }));
    const scoped  = (data[viewingSceneId] ?? []).map(d => ({ ...d, scope: "scene" }));
    const tabs    = [...globals, ...scoped];

    // Pick / preserve activeId
    if (!tabs.find(t => t.id === this.activeId)) this.activeId = tabs[0]?.id ?? null;
    const activeTab = tabs.find(t => t.id === this.activeId) ?? null;

    // Resolve macros for the active tab's tiles (drop tiles whose macro is gone)
    const tiles = (activeTab?.tiles ?? []).map(t => {
      const macro = game.macros.get(t.macroId);
      return {
        id:      t.id,
        macroId: t.macroId,
        x:       t.x ?? 0,
        y:       t.y ?? 0,
        stripe:  t.stripe ?? null,
        name:    macro?.name ?? "(missing)",
        img:     macro?.img ?? "icons/svg/hazard.svg",
        missing: !macro
      };
    });

    return {
      modeBar: {
        viewingSceneName: viewingScene?.name ?? "—",
        activeSceneName:  activeScene?.name  ?? "—",
        autoSwitch,
        isOverriding,
        scenes: game.scenes.contents.map(s => ({
          id:       s.id,
          label:    s.name + (s.id === activeScene?.id ? game.i18n.localize("MACRO_DASHBOARD.ModeBar.ActiveSceneSuffix") : ""),
          selected: s.id === viewingSceneId
        }))
      },
      tabs:     tabs.map(t => ({ ...t, isActive: t.id === this.activeId })),
      activeTab,
      tiles,
      emptyDashboards: tabs.length === 0,
      emptyTiles:      !!activeTab && tiles.length === 0,
      tileSize,
      layout,
      viewingSceneId
    };
  }

  // ---------------------------------------------------------------
  _onRender(context, options) {
    const root = this.element;

    // Canvas drag-drop
    const canvas = root.querySelector(".md-canvas");
    if (canvas) {
      canvas.addEventListener("dragover", this.#onCanvasDragOver.bind(this));
      canvas.addEventListener("dragleave", this.#onCanvasDragLeave.bind(this));
      canvas.addEventListener("drop", this.#onCanvasDrop.bind(this));
    }

    // Tile drag (move within canvas)
    for (const tile of root.querySelectorAll(".md-tile")) {
      tile.addEventListener("dragstart", (ev) => {
        const tileId = tile.dataset.tileId;
        ev.dataTransfer.setData("application/json", JSON.stringify({ type: "tile", tileId }));
        ev.dataTransfer.effectAllowed = "move";
        tile.classList.add("dragging");
      });
      tile.addEventListener("dragend", () => tile.classList.remove("dragging"));

      // Right-click: open the macro's own sheet (Foundry's built-in editor)
      tile.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        const macroId = tile.dataset.macroId;
        const tileId  = tile.dataset.tileId;
        if (ev.shiftKey) return this.#confirmDeleteTile(tileId);
        const macro = game.macros.get(macroId);
        if (macro) macro.sheet.render(true);
        else ui.notifications.warn(game.i18n.localize("MACRO_DASHBOARD.Notification.MacroMissing"));
      });
    }

    // Scene <select> in manual mode
    const sceneSelect = root.querySelector("[data-scene-select]");
    if (sceneSelect) {
      sceneSelect.addEventListener("change", async (ev) => {
        await game.settings.set(MODULE_ID, "viewingSceneId", ev.target.value);
        this.activeId = null;
        this.render();
      });
    }

    // Inline tab rename via dblclick on tab name
    for (const tab of root.querySelectorAll(".md-tab[data-tab-id]")) {
      tab.addEventListener("dblclick", (ev) => {
        if (ev.target.closest(".md-tab-close")) return;
        const id = tab.dataset.tabId;
        this.#startInlineRename(id, tab);
      });
    }
  }

  // ---------------------------------------------------------------
  // Drag-drop handlers

  #cellSize() {
    const inner = this.element?.querySelector(".md-canvas-inner");
    if (!inner) return 80;
    const v = parseInt(getComputedStyle(inner).getPropertyValue("--md-cell"));
    return Number.isFinite(v) ? v : 80;
  }

  #snapTo(ev, canvas) {
    const rect = canvas.getBoundingClientRect();
    const cell = this.#cellSize();
    const x = Math.max(0, Math.round((ev.clientX - rect.left - 12) / cell));
    const y = Math.max(0, Math.round((ev.clientY - rect.top  - 12) / cell));
    return { x, y };
  }

  #onCanvasDragOver(ev) {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = "copy";
    ev.currentTarget.classList.add("drop-active");

    // Position drop ghost
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

  async #onCanvasDrop(ev) {
    ev.preventDefault();
    const canvasEl = ev.currentTarget;
    canvasEl.classList.remove("drop-active");
    canvasEl.querySelector(".md-drop-ghost")?.remove();

    let payload;
    try { payload = JSON.parse(ev.dataTransfer.getData("application/json")); }
    catch { return; }

    if (!this.activeId) return;
    const { x, y } = this.#snapTo(ev, canvasEl);

    if (payload.type === "macro") {
      await State.update(this.activeId, d => ({
        ...d,
        tiles: [...(d.tiles ?? []), { id: State.newId("t"), macroId: payload.macroId, x, y }]
      }));
    } else if (payload.type === "tile") {
      await State.update(this.activeId, d => ({
        ...d,
        tiles: (d.tiles ?? []).map(t => t.id === payload.tileId ? { ...t, x, y } : t)
      }));
    }

    this.render();
  }

  // ---------------------------------------------------------------
  // Tab actions

  static async #onAddTab(event, target) {
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
    let found  = null;
    for (const arr of Object.values(data)) {
      if (Array.isArray(arr)) found = arr.find(d => d.id === tabId) ?? found;
    }
    if (!found) return;

    const confirmed = (found.tiles?.length ?? 0) === 0 ? true : await foundry.applications.api.DialogV2.confirm({
      window:  { title: game.i18n.localize("MACRO_DASHBOARD.Tab.ConfirmDelete.Title") },
      content: game.i18n.format("MACRO_DASHBOARD.Tab.ConfirmDelete.Content", { name: found.name }),
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
    input.type = "text";
    input.className = "rename";
    input.value = current;
    nameSpan.replaceWith(input);
    input.focus();
    input.select();

    const commit = async () => {
      const val = input.value.trim() || current;
      await State.update(tabId, d => ({ ...d, name: val }));
      this.render();
    };
    input.addEventListener("blur",   commit, { once: true });
    input.addEventListener("keydown", ev => {
      if (ev.key === "Enter")  { ev.preventDefault(); input.blur(); }
      if (ev.key === "Escape") { input.value = current; input.blur(); }
    });
  }

  static async #onToggleAutoSwitch() {
    const cur = game.settings.get(MODULE_ID, "autoSwitch");
    await game.settings.set(MODULE_ID, "autoSwitch", !cur);
    this.render();
  }

  // ---------------------------------------------------------------
  // Tile actions

  static async #onExecuteTile(event, target) {
    const macroId = target.dataset.macroId;
    const macro   = game.macros.get(macroId);
    if (!macro) return ui.notifications.warn(game.i18n.localize("MACRO_DASHBOARD.Notification.MacroMissing"));
    const token   = canvas.tokens.controlled[0];
    await macro.execute({ actor: token?.actor, token });
  }

  static #onEditTile(event, target) {
    const macroId = target.dataset.macroId;
    game.macros.get(macroId)?.sheet.render(true);
  }

  static async #onDeleteTile(event, target) {
    const tileId = target.dataset.tileId;
    return this.#confirmDeleteTile(tileId);
  }

  async #confirmDeleteTile(tileId) {
    if (!this.activeId) return;
    await State.update(this.activeId, d => ({
      ...d,
      tiles: (d.tiles ?? []).filter(t => t.id !== tileId)
    }));
    this.render();
  }
}
