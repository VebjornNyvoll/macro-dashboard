// Macro Library window (v0.2) - searchable list, draggable rows, Groups tab
// with collapsible cards (each draggable as a unit), "Create new group from
// selection..." trigger.

import { MODULE_ID }          from "../constants.mjs";
import { State }              from "../module.mjs";
import { CreateGroupDialog }  from "./create-group-dialog.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class MacroLibraryApp extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id:      "macro-library-app",
    classes: ["macro-dashboard"],
    tag:     "div",
    window: {
      title:       "MACRO_DASHBOARD.Window.Library.Title",
      icon:        "fa-solid fa-book",
      resizable:   true,
      minimizable: true
    },
    position: { width: 320, height: 560 },
    actions: {
      switchLibTab: MacroLibraryApp.#onSwitchTab,
      createGroup:  MacroLibraryApp.#onCreateGroup,
      toggleGroup:  MacroLibraryApp.#onToggleGroup,
      editGroup:    MacroLibraryApp.#onEditGroup,
      deleteGroup:  MacroLibraryApp.#onDeleteGroup
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/library.hbs`, scrollable: [".md-lib-body"] }
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
  searchTerm     = "";
  activeLibTab   = "macros";   // "macros" | "groups"
  expandedGroups = new Set();

  async _prepareContext() {
    const term = this.searchTerm.toLowerCase().trim();

    const macros = game.macros.contents
      .filter(m => !term || m.name.toLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(m => ({
        id:   m.id,
        name: m.name,
        img:  m.img || "icons/svg/dice-target.svg",
        cmd:  (m.command ?? "").slice(0, 80)
      }));

    const groups = State.readGroups()
      .filter(g => !term || g.name.toLowerCase().includes(term))
      .map(g => ({
        ...g,
        expanded:   this.expandedGroups.has(g.id),
        countLabel: game.i18n.format("MACRO_DASHBOARD.Library.GroupCount", { n: g.macros.length }),
        macroDetails: g.macros.map(mid => {
          const m = game.macros.get(mid);
          return { id: mid, name: m?.name ?? "(missing)", img: m?.img ?? "icons/svg/hazard.svg", missing: !m };
        })
      }));

    return {
      activeLibTab: this.activeLibTab,
      isMacrosTab:  this.activeLibTab === "macros",
      isGroupsTab:  this.activeLibTab === "groups",
      macros,
      macroCount:   macros.length,
      groups,
      groupCount:   groups.length,
      term:         this.searchTerm,
      noResults:    term.length > 0 && this.activeLibTab === "macros" && macros.length === 0,
      noGroups:     this.activeLibTab === "groups" && groups.length === 0
    };
  }

  // Listener-attachment idempotency: every queryselector below filters out
  // elements that already carry [data-wired]. ApplicationV2's
  // HandlebarsApplicationMixin replaces part contents on full renders, so
  // freshly-rendered elements pass the filter; the guard makes us robust
  // to any future render strategy that preserves DOM nodes across renders.
  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;

    // Search input - re-focus after re-render (which destroys and recreates the input)
    const search = root.querySelector("input.md-lib-search-input:not([data-wired])");
    if (search) {
      search.dataset.wired = "1";
      search.addEventListener("input", (ev) => {
        this.searchTerm = ev.target.value;
        this.render();
        requestAnimationFrame(() => {
          const el = this.element.querySelector("input.md-lib-search-input");
          if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
        });
      });
    }

    // Drag from macro rows (Macros tab + nested rows in expanded groups)
    for (const row of root.querySelectorAll(".md-lib-row[data-macro-id]:not([data-wired])")) {
      row.dataset.wired = "1";
      row.addEventListener("dragstart", (ev) => {
        const macroId = row.dataset.macroId;
        ev.dataTransfer.setData("application/json", JSON.stringify({ type: "macro", macroId }));
        ev.dataTransfer.effectAllowed = "copy";
        // Centre the drag-ghost on the cursor instead of anchoring to
        // wherever the user clicked inside the row (default browser behaviour).
        ev.dataTransfer.setDragImage(row, row.offsetWidth / 2, row.offsetHeight / 2);
        row.classList.add("dragging");
      });
      row.addEventListener("dragend", () => row.classList.remove("dragging"));
    }

    // Drag from group header (drops the entire group as a batch)
    for (const head of root.querySelectorAll(".md-group-head[data-group-id]:not([data-wired])")) {
      head.dataset.wired = "1";
      head.addEventListener("dragstart", (ev) => {
        const groupId = head.dataset.groupId;
        ev.dataTransfer.setData("application/json", JSON.stringify({ type: "group", groupId }));
        ev.dataTransfer.effectAllowed = "copy";
        // Centre the drag-ghost on the cursor.
        ev.dataTransfer.setDragImage(head, head.offsetWidth / 2, head.offsetHeight / 2);
        head.classList.add("dragging");
      });
      head.addEventListener("dragend", () => head.classList.remove("dragging"));
    }
  }

  _onClose(options) {
    // Drop the singleton reference so toggle() doesn't keep a closed
    // instance (and all its private state) alive for the rest of the
    // session. The next toggle() will construct a fresh instance.
    if (MacroLibraryApp.#_instance === this) MacroLibraryApp.#_instance = null;
    super._onClose?.(options);
  }

  static #onSwitchTab(event, target) {
    this.activeLibTab = target.dataset.libTab;
    this.render();
  }

  static async #onCreateGroup() {
    await CreateGroupDialog.open();
    this.render();
  }

  static #onToggleGroup(event, target) {
    const gid = target.closest("[data-group-id]")?.dataset.groupId;
    if (!gid) return;
    if (this.expandedGroups.has(gid)) this.expandedGroups.delete(gid);
    else this.expandedGroups.add(gid);
    this.render();
  }

  static async #onEditGroup(event, target) {
    event.stopPropagation();
    const gid = target.closest("[data-group-id]")?.dataset.groupId;
    if (!gid) return;
    await CreateGroupDialog.open({ existingGroupId: gid });
    this.render();
  }

  static async #onDeleteGroup(event, target) {
    event.stopPropagation();
    const gid = target.closest("[data-group-id]")?.dataset.groupId;
    if (!gid) return;
    const group = State.readGroups().find(g => g.id === gid);
    if (!group) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window:      { title: "Delete Group?" },
      content:     `<p>Delete preset group <strong>${group.name}</strong>? Macros in your library are unaffected.</p>`,
      rejectClose: false
    });
    if (!confirmed) return;
    await State.destroyGroup(gid);
    ui.notifications.info(game.i18n.format("MACRO_DASHBOARD.Notification.GroupDeleted", { name: group.name }));
    this.render();
  }
}
