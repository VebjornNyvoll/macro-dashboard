// Macro Library window - searchable list of all game.macros, draggable rows.

import { MODULE_ID } from "../module.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class MacroLibraryApp extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id:      "macro-library-app",
    classes: ["macro-dashboard"],   // share design tokens via the same scope class
    tag:     "div",
    window: {
      title:       "MACRO_DASHBOARD.Window.Library.Title",
      icon:        "fa-solid fa-book",
      resizable:   true,
      minimizable: true
    },
    position: { width: 300, height: 560 },
    actions: {
      switchLibTab: MacroLibraryApp.#onSwitchTab
    }
  };

  static PARTS = {
    main: {
      template:   `modules/${MODULE_ID}/templates/library.hbs`,
      scrollable: [".md-lib-body"]
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
  searchTerm = "";
  activeLibTab = "macros";    // "macros" | "groups"

  async _prepareContext() {
    const term = this.searchTerm.toLowerCase().trim();
    const macros = game.macros.contents
      .filter(m => !term || m.name.toLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(m => ({
        id:   m.id,
        name: m.name,
        img:  m.img || "icons/svg/dice-target.svg",
        type: m.type,
        cmd:  (m.command ?? "").slice(0, 80)
      }));

    return {
      activeLibTab: this.activeLibTab,
      isMacrosTab:  this.activeLibTab === "macros",
      isGroupsTab:  this.activeLibTab === "groups",
      macros,
      macroCount:   macros.length,
      term:         this.searchTerm,
      noResults:    term.length > 0 && macros.length === 0
    };
  }

  _onRender(context, options) {
    const root = this.element;

    // Search input
    const search = root.querySelector("input.md-lib-search-input");
    if (search) {
      search.addEventListener("input", (ev) => {
        this.searchTerm = ev.target.value;
        this.render({ parts: ["main"] });
        // Re-focus and restore caret position
        requestAnimationFrame(() => {
          const el = this.element.querySelector("input.md-lib-search-input");
          if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
        });
      });
    }

    // Drag handlers on macro rows
    for (const row of root.querySelectorAll(".md-lib-row[data-macro-id]")) {
      row.addEventListener("dragstart", (ev) => {
        const macroId = row.dataset.macroId;
        ev.dataTransfer.setData("application/json", JSON.stringify({ type: "macro", macroId }));
        ev.dataTransfer.effectAllowed = "copy";
        row.classList.add("dragging");
      });
      row.addEventListener("dragend", () => row.classList.remove("dragging"));
    }
  }

  static #onSwitchTab(event, target) {
    this.activeLibTab = target.dataset.libTab;
    this.render();
  }
}
