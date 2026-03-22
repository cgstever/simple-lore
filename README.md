# Simple Lore

A stateful D&D 5e RPG lore module for the [StatefullLore](https://github.com/cgstever/StatefullLore) SillyTavern extension.

Simple Lore turns any SillyTavern chat into a rules-driven tabletop RPG. It injects a live player stat block into the system prompt every turn and gives the AI structured rules for running a text-based adventure — stats, inventory, quests, spells, XP, gold, HP, and level-ups are all tracked automatically.

## Features

- **Full D&D 5e stat foundation** — STR, DEX, CON, INT, WIS, CHA with proper modifiers and proficiency bonuses
- **12 playable classes** — Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin, Ranger, Rogue, Sorcerer, Warlock, Wizard
- **14 race options** with racial ability score bonuses
- **4-step character creation** — ability scores → race → class → name
- **Spell slot tracking** — full casters, half casters, and Warlock pact magic
- **Automatic level-ups** using official 5e XP thresholds
- **HP calculation** from class hit die + CON modifier
- **AC rules** respecting armor type and DEX caps
- **Saving throw proficiencies** per class
- **Conditions system** and long/short rest mechanics
- **Multi-currency economy** — GP, SP, CP
- **Inventory and quest management**
- **Auto-update** — StatefullLore polls `version.json` on startup and downloads new versions automatically

## Stat Block (injected each turn)

```
╔══════════════════════════════════╗
║  Adventurer — Human              ║
╠══════════════════════════════════╣
║  Level:  1       XP: 0/100       ║
║  HP:     40/40   AC: 10          ║
║  Gold:   10                      ║
╠══════════════════════════════════╣
║  STR 10   DEX 10   INT 10   LCK 10║
╠══════════════════════════════════╣
║  INVENTORY                       ║
║    1. Rusty Sword                 ║
║    2. Leather Tunic               ║
╠══════════════════════════════════╣
║  ACTIVE QUESTS                   ║
║    [!] A New Beginning: ...       ║
╚══════════════════════════════════╝
Turn: 1
```

## How State Updates Work

The AI emits a fenced ` ```game ``` ` block after its narrative whenever something changes. The extension parses these blocks and applies them to the persisted state automatically.

### Supported Event Types

| Type | Fields | Effect |
|------|--------|--------|
| `xp_gain` | `amount` | Adds XP; triggers level-up if threshold crossed |
| `gold_change` | `amount` (+/-) | Adjusts gold balance |
| `hp_change` | `amount` (+/-) | Adjusts HP within 0–maxHp |
| `item_add` | `item` | Appends item to inventory |
| `item_remove` | `item` | Removes first matching item |
| `quest_add` | `title`, `objective` | Adds a new active quest |
| `quest_complete` | `title` | Marks quest as done |
| `flag_set` | `key`, `value` | Sets an arbitrary story flag |
| `stat_change` | `stat`, `amount` | Adjusts STR/DEX/INT/LCK |
| `rename` | `name`, `race` | Sets player name and race |

## Installation

1. Install [SillyTavern](https://github.com/SillyTavern/SillyTavern)
2. Install the [StatefullLore](https://github.com/cgstever/StatefullLore) extension
3. In StatefullLore settings, point it at:

```
https://raw.githubusercontent.com/cgstever/simple-lore/main/lore.js
```

The module will be downloaded and activated automatically.

## File Structure

```
simple-lore/
├── lore.js          ← Main module (default export) — D&D 5e engine
├── version.json     ← Version string polled by StatefullLore for auto-updates
└── README.md
```

## Auto-Update

StatefullLore polls `version.json` on every SillyTavern startup. When the version differs from what's currently loaded, it downloads a fresh copy of `lore.js` automatically. When pushing updates, always bump the `VERSION` constant inside `lore.js` **and** the version in `version.json` together.

## Current Version

**v2.8.0**

## Related Projects

- [StatefullLore](https://github.com/cgstever/StatefullLore) — The SillyTavern extension that loads and runs this module
- [overwrite-st](https://github.com/cgstever/overwrite-st) — X-Change World, a more advanced lore module for the same engine

## License

This project is provided as-is for use with SillyTavern.
