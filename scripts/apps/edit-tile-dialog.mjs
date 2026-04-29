// Edit Tile dialog - DialogV2-based form for editing the underlying macro
// (name, image, command) plus per-tile description (stored as macro flag) and
// color stripe (stored on the tile). CSS-only :checked radio swatch picker.

import { MODULE_ID } from "../constants.mjs";

const { DialogV2 } = foundry.applications.api;

const STRIPE_OPTIONS = [
  { value: "",         labelKey: "MACRO_DASHBOARD.Stripe.None",     swatch: null,      none: true },
  { value: "#a23a3a",  labelKey: "MACRO_DASHBOARD.Stripe.Combat",   swatch: "#a23a3a" },
  { value: "#4a7a3c",  labelKey: "MACRO_DASHBOARD.Stripe.Rest",     swatch: "#4a7a3c" },
  { value: "#5a2c7a",  labelKey: "MACRO_DASHBOARD.Stripe.Ambience", swatch: "#5a2c7a" },
  { value: "#b08038",  labelKey: "MACRO_DASHBOARD.Stripe.Hazards",  swatch: "#b08038" },
  { value: "#c79a3a",  labelKey: "MACRO_DASHBOARD.Stripe.Loot",     swatch: "#c79a3a" },
  { value: "#3a7aa8",  labelKey: "MACRO_DASHBOARD.Stripe.Info",     swatch: "#3a7aa8" }
];

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function escAttr(s) { return escHtml(s); }

/** Resolve Foundry's FilePicker class across versions:
 *  - v13/v14 expose a wrapper at `foundry.applications.apps.FilePicker` whose
 *    actual constructor is `.implementation`. Calling `new FilePicker()`
 *    directly on the wrapper fails or behaves unexpectedly.
 *  - v12 exposes a bare global `FilePicker` class.
 *  Bare-identifier reads in strict-mode ES modules throw ReferenceError when
 *  the identifier is undefined; `typeof X !== "undefined"` is the only probe
 *  that never throws. */
export function getFilePickerClass() {
  const ns = foundry?.applications?.apps?.FilePicker;
  if (ns?.implementation) return ns.implementation;
  if (typeof ns === "function")          return ns;
  if (typeof FilePicker !== "undefined") return FilePicker;
  if (typeof window !== "undefined" && window.FilePicker) return window.FilePicker;
  return null;
}

function renderStripePicker(currentStripe) {
  return STRIPE_OPTIONS.map((opt, i) => {
    const id = `md-stripe-opt-${i}`;
    const checked = (opt.value === (currentStripe ?? "")) ? "checked" : "";
    const labelText = game.i18n.localize(opt.labelKey);
    const labelClass = opt.none ? "md-stripe-swatch md-stripe-none" : "md-stripe-swatch";
    const labelStyle = opt.swatch ? `background: ${opt.swatch}` : "";
    const inner = opt.none ? '<i class="fa-solid fa-ban"></i>' : "";
    return `
      <input type="radio" name="stripe" id="${id}" value="${escAttr(opt.value)}" ${checked}/>
      <label for="${id}" class="${labelClass}" style="${labelStyle}" title="${escAttr(labelText)}">${inner}</label>
    `;
  }).join("");
}

export class EditTileDialog {

  /**
   * Open the Edit Macro Slot dialog.
   * @param {object} params
   * @param {{id, macroId, stripe?}} params.tile
   * @param {Macro} params.macro
   * @returns {Promise<{name, img, command, description, stripe}|null>}
   */
  static async open({ tile, macro }) {
    if (!macro) return null;

    const description = macro.getFlag(MODULE_ID, "description") ?? "";

    const content = `
      <div class="md-edit-body macro-dashboard">
        <div class="md-edit-preview">
          <div class="md-edit-tile" style="${tile.stripe ? `box-shadow: inset 0 3px 0 ${tile.stripe}, var(--fdry-shadow-emboss);` : ''}">
            <img src="${escAttr(macro.img)}" alt=""/>
          </div>
          <div class="md-edit-meta">
            <div class="md-edit-name">${escHtml(macro.name)}</div>
            <div class="md-edit-cmd">${escHtml((macro.command ?? "").slice(0, 80))}</div>
          </div>
        </div>

        <form class="md-edit-form">
          <div class="form-group">
            <label>${game.i18n.localize("MACRO_DASHBOARD.EditDialog.Name")}</label>
            <input type="text" name="name" value="${escAttr(macro.name)}"/>
          </div>

          <div class="form-group">
            <label>${game.i18n.localize("MACRO_DASHBOARD.EditDialog.Icon")}</label>
            <div class="md-input-with-button">
              <input type="text" name="img" value="${escAttr(macro.img)}"/>
              <button type="button" class="md-pick-btn" data-pick-img
                      title="${escAttr(game.i18n.localize("MACRO_DASHBOARD.IconPicker.Title"))}">
                <i class="fa-solid fa-folder-open"></i>
              </button>
            </div>
            <p class="hint">${game.i18n.localize("MACRO_DASHBOARD.EditDialog.IconHint")}</p>
          </div>

          <div class="form-group">
            <label>${game.i18n.localize("MACRO_DASHBOARD.EditDialog.Description")}</label>
            <input type="text" name="description" value="${escAttr(description)}"/>
            <p class="hint">${game.i18n.localize("MACRO_DASHBOARD.EditDialog.DescriptionHint")}</p>
          </div>

          <div class="form-group">
            <label>${game.i18n.localize("MACRO_DASHBOARD.EditDialog.Stripe")}</label>
            <div class="md-stripe-picker">
              ${renderStripePicker(tile.stripe)}
            </div>
          </div>

          <div class="form-group">
            <label>${game.i18n.localize("MACRO_DASHBOARD.EditDialog.Hotkey")}</label>
            <input type="text" name="hotkey" value="${escAttr(tile.hotkey ?? "")}" placeholder="Shift+1, Ctrl+A, KeyZ"/>
            <p class="hint">${game.i18n.localize("MACRO_DASHBOARD.EditDialog.HotkeyHint")}</p>
          </div>

          <div class="form-group">
            <label>${game.i18n.localize("MACRO_DASHBOARD.EditDialog.Command")}</label>
            <textarea name="command" rows="6">${escHtml(macro.command ?? "")}</textarea>
            <p class="hint">${game.i18n.localize("MACRO_DASHBOARD.EditDialog.CommandHint")}</p>
          </div>
        </form>
      </div>
    `;

    return DialogV2.prompt({
      window: {
        title:          game.i18n.localize("MACRO_DASHBOARD.EditDialog.Title"),
        icon:           "fa-solid fa-pen",
        contentClasses: ["macro-dashboard"]
      },
      position:    { width: 500 },
      content,
      ok: {
        label:    game.i18n.localize("MACRO_DASHBOARD.EditDialog.Save"),
        icon:     "fa-solid fa-floppy-disk",
        callback: (event, button, dialog) => {
          const form = button.form ?? dialog.element.querySelector("form");
          const fd   = new foundry.applications.ux.FormDataExtended(form).object;
          return {
            name:        fd.name,
            img:         fd.img,
            command:     fd.command,
            description: fd.description,
            stripe:      fd.stripe || null,
            hotkey:      (fd.hotkey || "").trim() || null
          };
        }
      },
      rejectClose: false,
      modal:       true,
      // Wire the icon-field "Browse..." button to Foundry's FilePicker. We
      // do this in the post-render hook because DialogV2.prompt's content
      // is opaque HTML that we have no other handle on.
      render: (event, dialog) => {
        const root    = dialog?.element ?? event?.currentTarget;
        if (!root) return;
        const input   = root.querySelector('input[name="img"]');
        const pickBtn = root.querySelector("[data-pick-img]");
        if (!input || !pickBtn) return;
        pickBtn.addEventListener("click", () => {
          const FP = getFilePickerClass();
          if (!FP) {
            ui.notifications.warn("File picker is not available in this Foundry version.");
            return;
          }
          new FP({
            type:    "image",
            current: input.value || "icons/svg/dice-target.svg",
            callback: (path) => { input.value = path; }
          }).render(true);
        });
      }
    });
  }
}
