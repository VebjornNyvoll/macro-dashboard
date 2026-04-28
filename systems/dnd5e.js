// Macro Dashboard - D&D 5th Edition (dnd5e) system shim.
//
// Auto-registered by the core module when game.system.id === "dnd5e".
// Other systems should follow the same shape - see the cross-system-architecture
// reference inside the foundry-vtt-module engineering skill.

export default {
  VERSION: "1.0.0",

  /** Suggested stripe categories for D&D 5e games. The dashboard exposes these
   *  in the stripe picker labels (no functional difference vs. the v0.2
   *  hard-coded names; this just makes the UX system-aware). */
  CATEGORIES: [
    { name: "Combat",      color: "#a23a3a", icon: "fa-solid fa-burst"           },
    { name: "Rest",        color: "#4a7a3c", icon: "fa-solid fa-bed"             },
    { name: "Spells",      color: "#5a2c7a", icon: "fa-solid fa-wand-sparkles"   },
    { name: "Conditions",  color: "#b08038", icon: "fa-solid fa-heart-crack"     },
    { name: "Loot",        color: "#c79a3a", icon: "fa-solid fa-coins"           },
    { name: "Information", color: "#3a7aa8", icon: "fa-solid fa-book-open"       }
  ],

  /** Optional preset groups seeded if the world has no groups yet AND
   *  the GM calls game.macroDashboard.API.applySystemDefaultGroups().
   *  Macro lookups are by exact macro NAME against game.macros.getName(...). */
  DEFAULT_PRESET_GROUPS: []
};
