// Create / Edit Preset Group dialog - ApplicationV2 form with macro-picker
// checklist. Returns the resulting group object via Promise resolution.

import { MODULE_ID }          from "../constants.mjs";
import { State }              from "../module.mjs";
import { getFilePickerClass } from "./edit-tile-dialog.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class CreateGroupDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id:      "macro-dashboard-group-dialog",
    classes: ["macro-dashboard"],
    tag:     "form",
    window:  {
      title:       "MACRO_DASHBOARD.GroupDialog.CreateTitle",
      icon:        "fa-solid fa-folder-plus",
      resizable:   false,
      minimizable: false
    },
    position: { width: 540 },
    actions:  {
      pickColor:   CreateGroupDialog.#onPickColor,
      toggleMacro: CreateGroupDialog.#onToggleMacro,
      cancel:      CreateGroupDialog.#onCancel,
      pickIcon:    CreateGroupDialog.#onPickIcon
    },
    form: {
      handler:        CreateGroupDialog.#onSubmit,
      closeOnSubmit:  true,
      submitOnChange: false
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/create-group.hbs` }
  };

  // Per-instance UI state
  selected = new Set();    // selected macro ids
  groupId  = null;         // null = create new; non-null = edit existing
  presetName  = "";
  presetIcon  = "fa-solid fa-folder";
  presetColor = "#a23a3a";
  initialMacros = [];

  /**
   * Open dialog for creating a new group OR editing an existing one.
   * If `existingGroupId` is provided, the dialog pre-fills with that group's data
   * and saves changes back to it.
   * Optionally pre-select an initial set of macro ids.
   * @returns {Promise<PresetGroup|null>}
   */
  static async open({ existingGroupId = null, initialMacroIds = [] } = {}) {
    return new Promise((resolve) => {
      const app = new CreateGroupDialog();
      app.#resolveOnClose = resolve;

      if (existingGroupId) {
        const g = State.readGroups().find(g => g.id === existingGroupId);
        if (g) {
          app.groupId      = g.id;
          app.presetName   = g.name;
          app.presetIcon   = g.icon;
          app.presetColor  = g.color;
          app.selected     = new Set(g.macros);
          app.initialMacros= [...g.macros];
        }
      } else if (initialMacroIds.length) {
        app.selected = new Set(initialMacroIds);
      }

      app.render({ force: true });
    });
  }

  #resolveOnClose = null;
  #resolved       = false;

  async _prepareContext() {
    const allMacros = game.macros.contents
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(m => ({
        id:       m.id,
        name:     m.name,
        img:      m.img || "icons/svg/dice-target.svg",
        selected: this.selected.has(m.id)
      }));

    const colors = [
      "#a23a3a", "#4a7a3c", "#5a2c7a", "#b08038", "#c79a3a", "#3a7aa8"
    ].map(c => ({ value: c, active: c === this.presetColor }));

    return {
      isEdit:      !!this.groupId,
      titleKey:    this.groupId ? "MACRO_DASHBOARD.GroupDialog.EditTitle" : "MACRO_DASHBOARD.GroupDialog.CreateTitle",
      submitLabel: this.groupId ? game.i18n.localize("MACRO_DASHBOARD.GroupDialog.Save")
                                : game.i18n.localize("MACRO_DASHBOARD.GroupDialog.Create"),
      name:   this.presetName,
      icon:   this.presetIcon,
      color:  this.presetColor,
      colors,
      macros: allMacros,
      selectedCount: this.selected.size,
      selectedLabel: game.i18n.format("MACRO_DASHBOARD.GroupDialog.Selected", { n: this.selected.size })
    };
  }

  _onClose(options) {
    if (!this.#resolved && this.#resolveOnClose) {
      this.#resolved = true;
      this.#resolveOnClose(null);
    }
    super._onClose?.(options);
  }

  // ---------------------------------------------------------------
  // Action handlers

  static #onPickColor(event, target) {
    this.presetColor = target.dataset.color;
    this.render();
  }

  static #onToggleMacro(event, target) {
    const id = target.dataset.macroId;
    if (this.selected.has(id)) this.selected.delete(id);
    else this.selected.add(id);
    this.render();
  }

  static #onCancel() {
    this.close();
  }

  /** Open Foundry's FilePicker for the icon field. The selected path is
   *  written back to both the live <input> and the per-instance
   *  presetIcon (so a re-render preserves the selection). */
  static #onPickIcon(event, target) {
    const input = this.element.querySelector('input[name="icon"]');
    if (!input) return;
    const FP = getFilePickerClass();
    if (!FP) {
      ui.notifications.warn("File picker is not available in this Foundry version.");
      return;
    }
    new FP({
      type:    "image",
      current: input.value || "icons/svg/dice-target.svg",
      callback: (path) => {
        this.presetIcon = path;
        input.value     = path;
      }
    }).render(true);
  }

  static async #onSubmit(event, form, formData) {
    const data = formData.object;
    const macros = [...this.selected];

    if (macros.length === 0) {
      ui.notifications.warn(game.i18n.localize("MACRO_DASHBOARD.Notification.NoMacrosSelected"));
      return;
    }

    const groupData = {
      name:   (data.name || game.i18n.localize("MACRO_DASHBOARD.GroupDialog.NamePlaceholder")).trim(),
      icon:   (data.icon || "fa-solid fa-folder").trim(),
      color:  this.presetColor,
      macros
    };

    let result;
    if (this.groupId) {
      result = await State.updateGroup(this.groupId, g => ({ ...g, ...groupData }));
    } else {
      result = await State.createGroup({ id: State.newId("g"), ...groupData });
      ui.notifications.info(game.i18n.format("MACRO_DASHBOARD.Notification.GroupCreated", { name: result.name }));
    }

    this.#resolved = true;
    this.#resolveOnClose?.(result);

    // Re-render any open library window so the new/updated group appears
    const lib = game.macroDashboard?.MacroLibraryApp?.instance;
    if (lib?.rendered) lib.render();
  }
}
