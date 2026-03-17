# simple-lore

A minimal stateful RPG lore module for the [StatefullLore](https://github.com/cgstever/StatefullLore) SillyTavern extension.

## What it does

Injects a live player stat block into the system prompt every turn and gives the AI GM structured rules for running a text RPG — stats, inventory, quests, XP, gold, HP, and level-ups all tracked automatically.

## Stat block (injected each turn)

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
║    ...                            ║
╠══════════════════════════════════╣
║  ACTIVE QUESTS                   ║
║    [!] A New Beginning: ...       ║
╚══════════════════════════════════╝
Turn: 1
```

## How state updates work

The AI is instructed to emit a fenced ` ```game ``` ` block after its narrative when anything changes. The extension parses these blocks and applies them to the persisted state automatically.

Supported event types:

| type | fields | effect |
|------|--------|--------|
| `xp_gain` | `amount` | adds XP, triggers level-up if threshold crossed |
| `gold_change` | `amount` (positive or negative) | adjusts gold |
| `hp_change` | `amount` (positive or negative) | adjusts HP within 0–maxHp |
| `item_add` | `item` | appends to inventory |
| `item_remove` | `item` | removes first matching item |
| `quest_add` | `title`, `objective` | adds a new active quest |
| `quest_complete` | `title` | marks quest done |
| `flag_set` | `key`, `value` | sets an arbitrary story flag |
| `stat_change` | `stat`, `amount` | adjusts STR/DEX/INT/LCK |
| `rename` | `name`, `race` | sets player name/race |

## File structure

```
simple-lore/
├── lore.js        ← main module (export default)
├── version.json   ← polled by StatefullLore for auto-updates
└── README.md
```

## Auto-update

`StatefullLore` polls `version.json` on every ST startup. When the version differs from what's loaded, it downloads a fresh `lore.js` automatically. Always bump `VERSION` inside `lore.js` **and** `version.json` together when pushing updates.

## Usage

In SillyTavern with StatefullLore installed, point it at:

```
https://raw.githubusercontent.com/cgstever/simple-lore/main/lore.js
```
