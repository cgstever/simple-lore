/**
 * simple-lore  —  a minimal stateful RPG lore module for StatefullLore
 *
 * Exports a default object with processTurn() and handleResponse().
 * The StatefullLore extension calls these hooks each turn and injects
 * the returned text into the SillyTavern system prompt.
 *
 * State shape (stored in IndexedDB by the extension):
 *   state.player  — core player stats
 *   state.inventory — array of item strings
 *   state.quests  — array of { title, objective, done }
 *   state.flags   — free-form key/value bag for events/story beats
 *   state.turn    — turn counter
 */

// ─── Version ────────────────────────────────────────────────────────────────
// Keep in sync with version.json in this repo.
const VERSION = '1.0.0';

// ─── Default state ──────────────────────────────────────────────────────────
function defaultPlayer() {
    return {
        name:       'Adventurer',
        race:       'Human',
        level:      1,
        xp:         0,
        xpToNext:   100,
        hp:         40,
        maxHp:      40,
        gold:       10,
        strength:   10,
        dexterity:  10,
        intelligence: 10,
        luck:       10,
        ac:         10,
    };
}

function defaultState() {
    return {
        player:    defaultPlayer(),
        inventory: ['Rusty Sword', 'Leather Tunic', 'Health Potion x2', 'Torch', 'Rations x3'],
        quests:    [
            { title: 'A New Beginning', objective: 'Find your footing in this world.', done: false }
        ],
        flags:     {},
        turn:      0,
    };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Level-up if XP threshold crossed. Returns true if leveled up. */
function checkLevelUp(state) {
    const p = state.player;
    if (p.xp >= p.xpToNext) {
        p.xp      -= p.xpToNext;
        p.level   += 1;
        p.xpToNext = Math.floor(p.xpToNext * 1.5);
        p.maxHp   += 10;
        p.hp       = Math.min(p.hp + 10, p.maxHp);   // partial heal on level-up
        p.strength     += 1;
        p.dexterity    += 1;
        p.intelligence += 1;
        return true;
    }
    return false;
}

/** Simple AC formula: 10 + dex modifier + any armor bonus tracked in flags. */
function recalcAC(state) {
    const dexMod   = Math.floor((state.player.dexterity - 10) / 2);
    const armorMod = state.flags.armorBonus || 0;
    state.player.ac = 10 + dexMod + armorMod;
}

/** Format the stat block that gets injected into the system prompt each turn. */
function buildStatBlock(state) {
    const p  = state.player;
    const hp = `${p.hp}/${p.maxHp}`;
    const xp = `${p.xp}/${p.xpToNext}`;

    const inventoryLines = state.inventory.length
        ? state.inventory.map((item, i) => `  ${i + 1}. ${item}`).join('\n')
        : '  (empty)';

    const questLines = state.quests
        .filter(q => !q.done)
        .map(q => `  [!] ${q.title}: ${q.objective}`)
        .join('\n') || '  (no active quests)';

    const completedLines = state.quests
        .filter(q => q.done)
        .map(q => `  [✓] ${q.title}`)
        .join('\n');

    return [
        '╔══════════════════════════════════╗',
        `║  ${(p.name + ' — ' + p.race).padEnd(32)}║`,
        '╠══════════════════════════════════╣',
        `║  Level:  ${String(p.level).padEnd(6)}  XP: ${xp.padEnd(11)}║`,
        `║  HP:     ${hp.padEnd(9)}  AC: ${String(p.ac).padEnd(12)}║`,
        `║  Gold:   ${String(p.gold).padEnd(24)}║`,
        '╠══════════════════════════════════╣',
        `║  STR ${String(p.strength).padEnd(4)} DEX ${String(p.dexterity).padEnd(4)} INT ${String(p.intelligence).padEnd(4)} LCK ${String(p.luck).padEnd(3)}║`,
        '╠══════════════════════════════════╣',
        '║  INVENTORY                       ║',
        ...inventoryLines.split('\n').map(l => `║  ${l.padEnd(32)}║`),
        '╠══════════════════════════════════╣',
        '║  ACTIVE QUESTS                   ║',
        ...questLines.split('\n').map(l => `║  ${l.padEnd(32)}║`),
        ...(completedLines
            ? ['╠══════════════════════════════════╣',
               '║  COMPLETED                       ║',
               ...completedLines.split('\n').map(l => `║  ${l.padEnd(32)}║`)]
            : []),
        `╚══════════════════════════════════╝`,
        `Turn: ${state.turn}`,
    ].join('\n');
}

/** Parse the AI's last response for any structured game events.
 *  The AI is instructed to emit JSON blocks wrapped in ```game ... ```
 *  so we can pick them up here without polluting the narrative.
 */
function parseGameEvents(responseText) {
    const events = [];
    const rx = /```game\s*([\s\S]*?)```/gi;
    let m;
    while ((m = rx.exec(responseText)) !== null) {
        try {
            const ev = JSON.parse(m[1].trim());
            if (Array.isArray(ev)) events.push(...ev);
            else events.push(ev);
        } catch (_) { /* malformed block — skip */ }
    }
    return events;
}

/** Apply a single game event to the state. */
function applyEvent(state, ev) {
    const p = state.player;
    switch (ev.type) {
        case 'xp_gain':
            p.xp += Number(ev.amount) || 0;
            break;
        case 'gold_change':
            p.gold = Math.max(0, p.gold + (Number(ev.amount) || 0));
            break;
        case 'hp_change':
            p.hp = Math.min(p.maxHp, Math.max(0, p.hp + (Number(ev.amount) || 0)));
            break;
        case 'item_add':
            if (ev.item) state.inventory.push(ev.item);
            break;
        case 'item_remove': {
            const idx = state.inventory.findIndex(i =>
                i.toLowerCase().includes((ev.item || '').toLowerCase()));
            if (idx !== -1) state.inventory.splice(idx, 1);
            break;
        }
        case 'quest_add':
            if (ev.title && !state.quests.find(q => q.title === ev.title)) {
                state.quests.push({ title: ev.title, objective: ev.objective || '', done: false });
            }
            break;
        case 'quest_complete': {
            const q = state.quests.find(q =>
                q.title.toLowerCase().includes((ev.title || '').toLowerCase()));
            if (q) q.done = true;
            break;
        }
        case 'flag_set':
            state.flags[ev.key] = ev.value;
            break;
        case 'stat_change':
            if (ev.stat && ev.stat in p) {
                p[ev.stat] = Math.max(1, (p[ev.stat] || 0) + (Number(ev.amount) || 0));
            }
            break;
        case 'rename':
            if (ev.name) p.name = ev.name;
            if (ev.race) p.race = ev.race;
            break;
        default:
            break;
    }
}

// ─── System prompt additions ─────────────────────────────────────────────────

const GAME_MASTER_RULES = `
You are the Game Master for a text-based RPG. Follow these rules every turn:

NARRATIVE RULES
• Stay in character as GM — vivid, second-person prose.
• 3–8 sentences per scene description.
• Always end your turn with 4–6 numbered action choices for the player.
• Progress time naturally (morning → noon → evening → night → next day).

MECHANICAL RULES
• Use the player stat block above to inform difficulty and consequences.
• For any contested action, mentally roll a d20 and apply relevant modifiers.
• HP, gold, XP, items, and quests change through events (see below).

STRUCTURED EVENT BLOCKS
After your narrative, emit any state changes in a fenced \`\`\`game\`\`\` block.
Omit the block entirely if nothing changed. Format:

\`\`\`game
[
  { "type": "xp_gain",       "amount": 25 },
  { "type": "gold_change",   "amount": -5 },
  { "type": "hp_change",     "amount": -8 },
  { "type": "item_add",      "item": "Goblin Ear" },
  { "type": "item_remove",   "item": "Health Potion" },
  { "type": "quest_add",     "title": "The Lost Amulet", "objective": "Find the amulet in the old mine." },
  { "type": "quest_complete","title": "A New Beginning" },
  { "type": "flag_set",      "key": "met_blacksmith", "value": true },
  { "type": "stat_change",   "stat": "strength", "amount": 1 },
  { "type": "rename",        "name": "Torrin", "race": "Elf" }
]
\`\`\`

Only include events that actually occurred this turn.
`.trim();

// ─── Module export ────────────────────────────────────────────────────────────

const SimpleLore = {

    name:    'Simple Lore',
    version: VERSION,

    /** Called once when the module is first loaded. */
    init(data) {
        console.log(`[SimpleLore] v${VERSION} initialised`);
        return {};
    },

    /**
     * Called by StatefullLore BEFORE each generation.
     * Must return { injection: string, state: object }.
     *
     * @param {object} state   — current persisted state (may be empty on turn 1)
     * @param {object} context — { chat, characterData, userMessage, ... }
     */
    processTurn(state, context) {
        // Seed defaults on first turn
        if (!state.player) {
            Object.assign(state, defaultState());
        }

        state.turn = (state.turn || 0) + 1;
        recalcAC(state);

        const leveledUp = checkLevelUp(state);
        const statBlock  = buildStatBlock(state);

        let injection = `${statBlock}\n\n${GAME_MASTER_RULES}`;
        if (leveledUp) {
            injection += `\n\n[LEVEL UP! The player just reached level ${state.player.level}. Announce it dramatically.]`;
        }

        return { injection, state };
    },

    /**
     * Called by StatefullLore AFTER the AI responds.
     * Parse any structured events out of the response and apply them.
     *
     * @param {string} response — raw AI response text
     * @param {object} state    — current persisted state
     */
    handleResponse(response, state) {
        const events = parseGameEvents(response);
        for (const ev of events) {
            applyEvent(state, ev);
        }
        recalcAC(state);
        return { state };
    },
};

export default SimpleLore;
