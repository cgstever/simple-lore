/**
 * simple-lore   -   D&D 5e stateful RPG lore module for StatefullLore
 *
 * Implements a full D&D 5e stat foundation:
 *   - STR/DEX/CON/INT/WIS/CHA with modifiers
 *   - Proficiency bonus (level-based)
 *   - XP thresholds (official 5e table)
 *   - HP from class hit die + CON mod
 *   - AC respecting armor type + DEX cap rules
 *   - Saving throw proficiencies from class
 *   - Spell slots for full/half casters + warlock pact magic
 *   - 4-step character creation (scores → race → class → name)
 *   - All 12 classes, 14 race options
 *   - Conditions, long/short rests, gp/sp/cp currency
 */

const VERSION = '2.5.0';

// ── D&D 5e Tables ─────────────────────────────────────────────────────────────

// Proficiency bonus by level (index = level, index 0 unused)
const PROF_BONUS = [0, 2,2,2,2, 3,3,3,3, 4,4,4,4, 5,5,5,5, 6,6,6,6];

// Cumulative XP required to reach each level (index = level)
const XP_THRESHOLDS = [
    0, 0, 300, 900, 2700, 6500, 14000, 23000,
    34000, 48000, 64000, 85000, 100000, 120000,
    140000, 165000, 195000, 225000, 265000, 305000, 355000,
];

const CLASSES = {
    barbarian: { hitDie: 12, saves: ['str', 'con'] },
    bard:      { hitDie:  8, saves: ['dex', 'cha'] },
    cleric:    { hitDie:  8, saves: ['wis', 'cha'] },
    druid:     { hitDie:  8, saves: ['int', 'wis'] },
    fighter:   { hitDie: 10, saves: ['str', 'con'] },
    monk:      { hitDie:  8, saves: ['str', 'dex'] },
    paladin:   { hitDie: 10, saves: ['wis', 'cha'] },
    ranger:    { hitDie: 10, saves: ['str', 'dex'] },
    rogue:     { hitDie:  8, saves: ['dex', 'int'] },
    sorcerer:  { hitDie:  6, saves: ['con', 'cha'] },
    warlock:   { hitDie:  8, saves: ['wis', 'cha'] },
    wizard:    { hitDie:  6, saves: ['int', 'wis'] },
};

// Spell slots per class type.
// Full casters / half casters: index = level-1, inner array = [1st,2nd,3rd,...] slot counts
// Warlock: pact magic  -  inner array = [slot_count, slot_level]
const SPELL_SLOTS_FULL = [
/*L1 */ [2],
/*L2 */ [3],
/*L3 */ [4, 2],
/*L4 */ [4, 3],
/*L5 */ [4, 3, 2],
/*L6 */ [4, 3, 3],
/*L7 */ [4, 3, 3, 1],
/*L8 */ [4, 3, 3, 2],
/*L9 */ [4, 3, 3, 3, 1],
/*L10*/ [4, 3, 3, 3, 2],
];

const SPELL_SLOTS_HALF = [
/*L1 */ null,
/*L2 */ [2],
/*L3 */ [3],
/*L4 */ [3],
/*L5 */ [4, 2],
/*L6 */ [4, 2],
/*L7 */ [4, 3],
/*L8 */ [4, 3],
/*L9 */ [4, 3, 2],
/*L10*/ [4, 3, 2],
];

const WARLOCK_PACT = [
/*L1 */ { count: 1, level: 1 },
/*L2 */ { count: 2, level: 1 },
/*L3 */ { count: 2, level: 2 },
/*L4 */ { count: 2, level: 2 },
/*L5 */ { count: 2, level: 3 },
/*L6 */ { count: 2, level: 3 },
/*L7 */ { count: 2, level: 4 },
/*L8 */ { count: 2, level: 4 },
/*L9 */ { count: 2, level: 5 },
/*L10*/ { count: 2, level: 5 },
];

const CLASS_CASTER_TYPE = {
    bard: 'full', cleric: 'full', druid: 'full', sorcerer: 'full', wizard: 'full',
    paladin: 'half', ranger: 'half',
    warlock: 'warlock',
};

const RACES = {
    'human':              { bonuses: { str:1,dex:1,con:1,int:1,wis:1,cha:1 }, speed: 30, traits: ['Versatile: +1 to all ability scores'] },
    'high elf':           { bonuses: { dex:2,int:1 },      speed: 30, traits: ['Darkvision 60ft', 'Fey Ancestry', 'Trance', 'One free Wizard cantrip'] },
    'wood elf':           { bonuses: { dex:2,wis:1 },      speed: 35, traits: ['Darkvision 60ft', 'Fey Ancestry', 'Trance', 'Mask of the Wild'] },
    'hill dwarf':         { bonuses: { con:2,wis:1 },      speed: 25, traits: ['Darkvision 60ft', 'Dwarven Resilience (adv vs poison)', 'Stonecunning', 'Dwarven Toughness (+1 HP/level)'] },
    'mountain dwarf':     { bonuses: { con:2,str:2 },      speed: 25, traits: ['Darkvision 60ft', 'Dwarven Resilience', 'Stonecunning', 'Dwarven Armor Training'] },
    'lightfoot halfling': { bonuses: { dex:2,cha:1 },      speed: 25, traits: ['Lucky (reroll 1s on d20)', 'Brave (adv vs frightened)', 'Halfling Nimbleness', 'Naturally Stealthy'] },
    'stout halfling':     { bonuses: { dex:2,con:1 },      speed: 25, traits: ['Lucky', 'Brave', 'Halfling Nimbleness', 'Stout Resilience (adv vs poison)'] },
    'forest gnome':       { bonuses: { int:2,dex:1 },      speed: 25, traits: ['Darkvision 60ft', 'Gnome Cunning (adv INT/WIS/CHA saves vs magic)', 'Natural Illusionist', 'Speak with Small Beasts'] },
    'rock gnome':         { bonuses: { int:2,con:1 },      speed: 25, traits: ["Darkvision 60ft", "Gnome Cunning", "Artificer's Lore", 'Tinker'] },
    'tiefling':           { bonuses: { int:1,cha:2 },      speed: 30, traits: ['Darkvision 60ft', 'Hellish Resistance (fire)', 'Infernal Legacy (thaumaturgy + spells)'] },
    'dragonborn':         { bonuses: { str:2,cha:1 },      speed: 30, traits: ['Draconic Ancestry (choose dragon type)', 'Breath Weapon (2d6, scales with level)', 'Damage Resistance (matching dragon type)'] },
    'half-elf':           { bonuses: { cha:2 },            speed: 30, traits: ['Darkvision 60ft', 'Fey Ancestry', 'Skill Versatility (2 bonus skill profs)', 'Also +1 to two ability scores of your choice'] },
    'half-orc':           { bonuses: { str:2,con:1 },      speed: 30, traits: ['Darkvision 60ft', 'Menacing (Intimidation proficiency)', 'Relentless Endurance (1/LR: fall to 1 HP instead of 0)', 'Savage Attacks (extra damage die on crit)'] },
    'aasimar':            { bonuses: { wis:1,cha:2 },      speed: 30, traits: ['Darkvision 60ft', 'Celestial Resistance (necrotic + radiant)', 'Healing Hands', 'Light Bearer (light cantrip)'] },
};

// ── Core Calculations ──────────────────────────────────────────────────────────

const mod = score => Math.floor((score - 10) / 2);
const pb  = level => PROF_BONUS[Math.max(1, Math.min(20, level))] || 2;
const sign = n => (n >= 0 ? '+' : '') + n;

function levelFromXP(xp) {
    for (let l = 20; l >= 1; l--) if (xp >= XP_THRESHOLDS[l]) return l;
    return 1;
}

function xpToNextLevel(xp) {
    const l = levelFromXP(xp);
    return l >= 20 ? null : XP_THRESHOLDS[l + 1] - xp;
}

function calcMaxHP(state) {
    const p = state.player;
    if (!p.class || !CLASSES[p.class]) return p.maxHp || 8;
    const cls    = CLASSES[p.class];
    const conMod = mod(p.con);
    const hill   = (p.race || '').toLowerCase() === 'hill dwarf' ? p.level : 0;
    const l1     = cls.hitDie + conMod;
    const perLvl = Math.floor(cls.hitDie / 2) + 1 + conMod;
    return Math.max(1, l1 + (p.level - 1) * perLvl + hill);
}

function calcAC(state) {
    const p        = state.player;
    const dexMod   = mod(p.dex);
    const aBonus   = state.flags.armorBonus || 0;
    const aType    = state.flags.armorType  || 'none';
    const shield   = state.flags.shield     || false;
    let ac;
    switch (aType) {
        case 'light':  ac = aBonus + dexMod; break;
        case 'medium': ac = aBonus + Math.min(dexMod, 2); break;
        case 'heavy':  ac = aBonus; break;
        default:       ac = 10 + dexMod + (state.flags.unarmoredBonus || 0); break;
    }
    return ac + (shield ? 2 : 0);
}

function savingThrow(state, stat) {
    const proficient = (state.player.saves || []).includes(stat);
    return mod(state.player[stat]) + (proficient ? pb(state.player.level) : 0);
}

function buildSpellSlots(cls, level) {
    const type = CLASS_CASTER_TYPE[cls];
    if (!type) return null;

    if (type === 'warlock') {
        const idx = Math.min(level, WARLOCK_PACT.length) - 1;
        const pact = WARLOCK_PACT[idx];
        return { pact: { count: pact.count, level: pact.level, used: 0 } };
    }

    const table = type === 'full' ? SPELL_SLOTS_FULL : SPELL_SLOTS_HALF;
    const idx   = Math.min(level, table.length) - 1;
    const slots = table[idx];
    if (!slots) return null;

    const result = {};
    slots.forEach((max, i) => {
        if (max > 0) result[i + 1] = { max, used: 0 };
    });
    return Object.keys(result).length ? result : null;
}

// ── Default State ──────────────────────────────────────────────────────────────

function defaultState() {
    return {
        player: {
            name:  'Adventurer',
            race:  null,
            class: null,
            level: 1,
            xp:    0,
            hp:    null,
            maxHp: null,
            str: 10, dex: 10, con: 10,
            int: 10, wis: 10, cha: 10,
            ac:    10,
            saves:  [],
            skills: [],
            speed:  30,
            gold: 0, silver: 0, copper: 0,
        },
        inventory:  [],
        quests:     [],
        conditions: [],
        spellSlots: null,
        equipped:   null,
        offhand:    null,
        armor:      null,
        combat:     null,   // null = not in combat. See startCombat()
        deathSaves: null,   // null = alive. { successes, failures } when at 0 HP
        time:       { hour: 8, day: 1 },  // 24hr clock, starts at 8am day 1
        flags:      {},
        turn:       0,
        charCreation: { step: 'intro' },
    };
}

// ── Stat Block ─────────────────────────────────────────────────────────────────

function buildStatBlock(state) {
    const p     = state.player;
    const level = p.level;
    const prof  = pb(level);

    const hpBar   = `${p.hp}/${p.maxHp}`;
    const xpLeft  = xpToNextLevel(p.xp);
    const xpStr   = xpLeft !== null
        ? `${p.xp} XP  (${xpLeft} to Lv${level + 1})`
        : `${p.xp} XP  (MAX LEVEL)`;

    const stats = ['str','dex','con','int','wis','cha'];
    const statsLine1 = stats.slice(0, 3)
        .map(s => `${s.toUpperCase()} ${p[s]}(${sign(mod(p[s]))})`).join('  ');
    const statsLine2 = stats.slice(3)
        .map(s => `${s.toUpperCase()} ${p[s]}(${sign(mod(p[s]))})`).join('  ');

    const saveStr = stats.map(s => {
        const val  = savingThrow(state, s);
        const mark = (p.saves || []).includes(s) ? '✦' : ' ';
        return `${s.toUpperCase()}${mark}${sign(val)}`;
    }).join('  ');

    const raceDisplay  = p.race  ? p.race.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : ' - ';
    const classDisplay = p.class ? p.class.charAt(0).toUpperCase() + p.class.slice(1) : ' - ';

    const goldStr = [
        p.gold   ? `${p.gold}gp`   : '',
        p.silver ? `${p.silver}sp` : '',
        p.copper ? `${p.copper}cp` : '',
    ].filter(Boolean).join(' ') || '0gp';

    const lines = [
        `══ ${p.name} ══`,
        `${raceDisplay} ${classDisplay}  *  Level ${level}  *  Prof Bonus +${prof}`,
        `HP ${hpBar}  *  AC ${p.ac}  *  Init ${sign(mod(p.dex))}  *  Speed ${p.speed}ft`,
        xpStr,
        `──`,
        statsLine1,
        statsLine2,
        `──`,
        `Saves (✦=prof): ${saveStr}`,
    ];

    if (p.skills && p.skills.length) {
        lines.push(`Skills: ${p.skills.join(', ')}`);
    }
    lines.push(`Gold: ${goldStr}`);

    // Spell slots
    if (state.spellSlots) {
        if (state.spellSlots.pact) {
            const pk = state.spellSlots.pact;
            lines.push(`Pact Slots (L${pk.level}): ${pk.count - pk.used}/${pk.count}  [short rest]`);
        } else {
            const slotStr = Object.entries(state.spellSlots)
                .map(([l, s]) => `L${l}:${s.max - s.used}/${s.max}`)
                .join('  ');
            lines.push(`Spell Slots: ${slotStr}`);
        }
    }

    // Conditions
    if (state.conditions && state.conditions.length) {
        lines.push(`Conditions: ${state.conditions.join(', ')}`);
    }

    // Race traits (only show if set and not too long)
    if (state.flags.raceTraits && state.flags.raceTraits.length) {
        lines.push(`Racial Traits: ${state.flags.raceTraits.join(' | ')}`);
    }

    lines.push(`──`);
    lines.push(`INVENTORY:`);
    if (state.inventory.length) {
        state.inventory.forEach((item, i) => lines.push(`  ${i + 1}. ${item}`));
    } else {
        lines.push(`  (empty)`);
    }

    const activeQ = (state.quests || []).filter(q => !q.done && !q.failed);
    const doneQ   = (state.quests || []).filter(q => q.done && !q.failed);
    const failedQ = (state.quests || []).filter(q => q.failed);
    const qt      = state.flags?.activeQuest;
    if (activeQ.length) {
        lines.push(`──`);
        lines.push(`QUESTS:`);
        activeQ.forEach(q => {
            const stageNum = qt && qt.title === q.title ? (qt.stage || 0) + 1 : 1;
            const total    = qt && qt.title === q.title ? qt.stages.length : '?';
            lines.push(`  [!] ${q.title} (${stageNum}/${total}): ${q.objective}`);
        });
    }
    if (doneQ.length)   lines.push(`  Done: ${doneQ.map(q => q.title).join(', ')}`);
    if (failedQ.length) lines.push(`  Failed: ${failedQ.map(q => q.title).join(', ')}`);

    const world = state.flags.world;
    const worldAnchor = world
        ? `WORLD: ${world.id} | ${world.town}, ${world.region}\n${world.regionDesc}.`
        : 'WORLD: unknown';

    lines.push(`══ Turn ${state.turn}  |  World: ${state.flags.world?.id || 'unknown'} ══`);
    lines.push(worldAnchor);
    return lines.join('\n');
}

// ── Event Parser & Applier ─────────────────────────────────────────────────────

function parseGameEvents(text) {
    const events = [];

    // Extract all ```game ... ``` and ```json ... ``` fenced blocks
    const rx = /```(?:game|json)\s*([\s\S]*?)```/gi;
    let m;
    while ((m = rx.exec(text)) !== null) {
        extractEventsFromBlock(m[1].trim(), events);
    }

    // Also catch bare JSON objects/arrays with a "type" field outside fences
    const bareRx = /^\s*(\{[\s\S]*?"type"\s*:[\s\S]*?\}|\[[\s\S]*?"type"\s*:[\s\S]*?\])\s*$/gm;
    while ((m = bareRx.exec(text)) !== null) {
        extractEventsFromBlock(m[1].trim(), events);
    }

    return events;
}

function extractEventsFromBlock(block, events) {
    // 1. Try parsing as valid JSON first (array or single object)
    try {
        const parsed = JSON.parse(block);
        if (Array.isArray(parsed)) {
            parsed.forEach(ev => { if (ev && ev.type) events.push(ev); });
        } else if (parsed && parsed.type) {
            events.push(parsed);
        }
        return;
    } catch (_) { /* fall through to recovery */ }

    // 2. Recovery: extract individual JSON objects line by line
    // Handles the case where the model dumps multiple objects without array brackets
    // or mixes loose objects with an array in the same block
    const lines = block.split('\n');
    let buffer = '';
    let depth  = 0;

    for (const line of lines) {
        for (const ch of line) {
            if (ch === '{' || ch === '[') depth++;
            if (ch === '}' || ch === ']') depth--;
            buffer += ch;
            if (depth === 0 && buffer.trim()) {
                try {
                    const parsed = JSON.parse(buffer.trim());
                    if (Array.isArray(parsed)) {
                        parsed.forEach(ev => { if (ev && ev.type) events.push(ev); });
                    } else if (parsed && parsed.type) {
                        events.push(parsed);
                    }
                } catch (_) { /* skip unparseable fragment */ }
                buffer = '';
            }
        }
        buffer += '\n';
    }
}

function applyEvent(state, ev) {
    const p = state.player;

    switch (ev.type) {

        // ── Character Creation ──────────────────────────────────────────────
        case 'set_scores':
            ['str','dex','con','int','wis','cha'].forEach(s => {
                if (ev[s] != null) p[s] = Number(ev[s]);
            });
            if (p.class) { p.maxHp = calcMaxHP(state); p.hp = p.maxHp; }
            state.charCreation = { ...state.charCreation, scoresSet: true };
            break;

        case 'set_race': {
            const key = (ev.race || '').toLowerCase();
            p.race = ev.race;
            const rd = RACES[key];
            if (rd) {
                Object.entries(rd.bonuses || {}).forEach(([s, b]) => { p[s] = (p[s] || 10) + b; });
                p.speed = rd.speed || 30;
                state.flags.raceTraits = rd.traits;
            }
            // half-elf bonus stats
            if (key === 'half-elf') {
                if (ev.bonusStat1) p[ev.bonusStat1] = (p[ev.bonusStat1] || 10) + 1;
                if (ev.bonusStat2) p[ev.bonusStat2] = (p[ev.bonusStat2] || 10) + 1;
            }
            if (p.class) { p.maxHp = calcMaxHP(state); }
            state.charCreation = { ...state.charCreation, raceSet: true };
            break;
        }

        case 'set_class': {
            const key = (ev.class || '').toLowerCase();
            p.class = key;
            const cls = CLASSES[key];
            if (cls) {
                p.saves  = cls.saves;
                p.maxHp  = calcMaxHP(state);
                p.hp     = p.maxHp;
                state.spellSlots = buildSpellSlots(key, p.level);
            }
            if (ev.skills) p.skills = ev.skills;
            state.charCreation = { ...state.charCreation, classSet: true };
            break;
        }

        case 'creation_complete':
            state.charCreation = null;
            // Recalculate HP now that race + class are both set
            if (state.player.class) {
                state.player.maxHp = calcMaxHP(state);
                if (!state.player.hp || state.player.hp === null) {
                    state.player.hp = state.player.maxHp;
                }
            }
            if (!state.flags.world) state.flags.world = pickWorld();
            // Pick a quest matching the world's hook
            {
                const hookIdx = state.flags.hookIndex || 0;
                const qt = pickQuestForHook(state.flags.world.id, hookIdx);
                if (qt) {
                    // Deep copy so we can track stage separately
                    state.flags.activeQuest = JSON.parse(JSON.stringify(qt));
                    state.flags.activeQuest.stage = 0;
                    state.flags.activeQuest.done  = false;
                    state.flags.activeQuest.failed = false;
                    // Add to visible quest list (only if not already there)
                    state.quests = state.quests || [];
                    if (!state.quests.find(q => q.title === qt.title)) {
                        state.quests.push({
                            title:     qt.title,
                            objective: qt.stages[0].objective,
                            done:      false,
                            failed:    false,
                        });
                    }
                }
            }
            state.flags.freshStart = true;
            break;

        // ── Core Stats ──────────────────────────────────────────────────────
        case 'rename':
            if (ev.name) p.name = ev.name;
            break;

        case 'set_world': {
            const idx = Number(ev.worldIndex);
            state.flags.world = WORLDS_BY_ID[idx] || pickWorld();
            console.log('[SimpleLore] World set to:', state.flags.world?.id);
            break;
        }

        case 'xp_gain':
            p.xp += Number(ev.amount) || 0;
            break;

        case 'hp_change':
            p.hp = Math.min(p.maxHp, Math.max(0, p.hp + (Number(ev.amount) || 0)));
            break;

        case 'hp_set':
            p.hp = Math.min(p.maxHp, Math.max(0, Number(ev.value) || 0));
            break;

        case 'gold_change':
            p.gold = Math.max(0, (p.gold || 0) + (Number(ev.amount) || 0));
            break;

        case 'silver_change':
            p.silver = Math.max(0, (p.silver || 0) + (Number(ev.amount) || 0));
            break;

        case 'copper_change':
            p.copper = Math.max(0, (p.copper || 0) + (Number(ev.amount) || 0));
            break;

        case 'stat_change':
            if (ev.stat && ev.stat in p) {
                p[ev.stat] = Math.max(1, Math.min(30, (p[ev.stat] || 10) + (Number(ev.amount) || 0)));
                if (['str','dex','con','int','wis','cha'].includes(ev.stat)) {
                    p.maxHp = calcMaxHP(state);
                }
            }
            break;

        // ── Inventory ───────────────────────────────────────────────────────
        case 'item_add':
            if (ev.item) state.inventory.push(ev.item);
            break;

        case 'item_remove': {
            const idx = state.inventory.findIndex(i =>
                i.toLowerCase().includes((ev.item || '').toLowerCase()));
            if (idx !== -1) state.inventory.splice(idx, 1);
            break;
        }

        // ── Quests ──────────────────────────────────────────────────────────
        case 'quest_add':
            // Skip if title already exists or matches our active template quest
            if (ev.title && !state.quests.find(q =>
                q.title === ev.title ||
                (state.flags.activeQuest && state.flags.activeQuest.title === ev.title)
            )) {
                state.quests.push({ title: ev.title, objective: ev.objective || '', done: false });
            }
            break;

        case 'quest_stage': {
            // Advance active quest to next stage (or specific stage index)
            const qt = state.flags.activeQuest;
            if (qt) {
                const nextStage = ev.stage != null ? Number(ev.stage) : (qt.stage || 0) + 1;
                qt.stage = Math.min(nextStage, qt.stages.length - 1);
                // Sync the display quest objective
                const q = state.quests.find(q => q.title === qt.title);
                if (q && qt.stages[qt.stage]) {
                    q.objective = qt.stages[qt.stage].objective;
                }
            }
            break;
        }

        case 'quest_complete': {
            const qt = state.flags.activeQuest;
            if (qt && qt.title.toLowerCase().includes((ev.title || '').toLowerCase())) {
                // Auto-apply reward
                if (qt.reward) {
                    state.player.xp   = (state.player.xp   || 0) + (qt.reward.xp   || 0);
                    state.player.gold = (state.player.gold  || 0) + (qt.reward.gold || 0);
                    if (qt.reward.item) state.inventory.push(qt.reward.item);
                }
                qt.done = true;
                state.flags.activeQuest = null;
            }
            // Also mark in quests array
            const q = state.quests.find(q =>
                q.title.toLowerCase().includes((ev.title || '').toLowerCase()));
            if (q) q.done = true;
            break;
        }

        case 'quest_fail': {
            const qt = state.flags.activeQuest;
            if (qt) { qt.failed = true; state.flags.activeQuest = null; }
            const q = state.quests.find(q =>
                q.title.toLowerCase().includes((ev.title || ev.id || '').toLowerCase()));
            if (q) { q.failed = true; q.done = true; }
            break;
        }

        // ── Combat & Conditions ─────────────────────────────────────────────
        case 'condition_add':
            if (ev.condition && !state.conditions.includes(ev.condition)) {
                state.conditions.push(ev.condition);
            }
            break;

        case 'condition_remove':
            state.conditions = state.conditions.filter(c =>
                c.toLowerCase() !== (ev.condition || '').toLowerCase());
            break;

        // ── Armor ───────────────────────────────────────────────────────────
        case 'armor_change':
            state.flags.armorBonus = Number(ev.ac) || 10;
            state.flags.armorType  = ev.armorType || 'none';
            if (ev.shield != null) state.flags.shield = Boolean(ev.shield);
            if (ev.name) state.armor = ev.name;
            break;

        case 'equip_weapon':
            if (ev.slot === 'offhand') {
                state.offhand = ev.weapon || null;
            } else {
                state.equipped = ev.weapon || null;
            }
            break;

        case 'unequip_weapon':
            if (ev.slot === 'offhand') state.offhand = null;
            else state.equipped = null;
            break;

        // ── Spells ──────────────────────────────────────────────────────────
        case 'use_spell_slot':
            if (state.spellSlots) {
                if (state.spellSlots.pact) {
                    state.spellSlots.pact.used = Math.min(
                        state.spellSlots.pact.count,
                        state.spellSlots.pact.used + 1
                    );
                } else if (ev.level && state.spellSlots[ev.level]) {
                    state.spellSlots[ev.level].used = Math.min(
                        state.spellSlots[ev.level].max,
                        state.spellSlots[ev.level].used + 1
                    );
                }
            }
            break;

        // ── Rests ───────────────────────────────────────────────────────────
        case 'long_rest': {
            const lrCheck = canLongRest(state);
            if (!lrCheck.ok) {
                // Block illegal rest - log it so GM sees it next turn
                state.flags.restBlocked = lrCheck.reason;
                break;
            }
            state.flags.restBlocked = null;
            p.hp = p.maxHp;
            state.conditions = (state.conditions || []).filter(c =>
                !['Poisoned','Blinded','Deafened','Prone','Exhaustion 1'].includes(c));
            if (state.spellSlots) {
                if (state.spellSlots.pact) {
                    state.spellSlots.pact.used = 0;
                } else {
                    Object.values(state.spellSlots).forEach(s => { s.used = 0; });
                }
            }
            // Advance time by 8 hours and record rest
            advanceTime(state, LONG_REST_HOURS * 60);
            state.flags.lastLongRest  = { ...state.time };
            state.flags.lastShortRest = null;
            postRoll('Long Rest', { display: `8 hours pass. Now ${formatTime(state.time)} Day ${state.time.day}. Full HP and slots restored.` });
            break;
        }

        case 'short_rest': {
            const srCheck = canShortRest(state);
            if (!srCheck.ok) {
                state.flags.restBlocked = srCheck.reason;
                break;
            }
            state.flags.restBlocked = null;
            if (state.spellSlots && state.spellSlots.pact) {
                state.spellSlots.pact.used = 0;
            }
            if (ev.hitDiceSpent && p.class) {
                const healAmt = (Number(ev.hitDiceSpent) || 1) + mod(p.con);
                const healed  = Math.min(p.maxHp - p.hp, Math.max(1, healAmt));
                p.hp = Math.min(p.maxHp, p.hp + healed);
                postRoll('Short Rest', { display: `1 hour passes. Spent ${ev.hitDiceSpent} HD. Healed ${healed}HP. Now at ${p.hp}/${p.maxHp}HP.` });
            } else {
                postRoll('Short Rest', { display: `1 hour passes. Now ${formatTime(state.time)}.` });
            }
            advanceTime(state, SHORT_REST_HOURS * 60);
            state.flags.lastShortRest = { ...state.time };
            break;
        }

        case 'time_advance':
            // Explicit time advance (travel, waiting, etc.)
            advanceTime(state, Number(ev.minutes) || MINUTES_PER_TURN);
            break;

        // ── Misc ────────────────────────────────────────────────────────────
        case 'combat_start': {
            // AI tells us what enemies to fight - module runs the actual math
            const enemies = Array.isArray(ev.enemies) ? ev.enemies : [];
            // Look up enemy stats from encounter tables if not provided
            const worldId = state.flags.world?.id;
            const resolved = enemies.map(e => {
                if (e.hp && e.ac) return e; // AI provided full stats
                const found = pickEncounter(worldId, state.player.level);
                return found ? { ...found, ...e } : { name: e.name || 'Enemy', hp: 10, ac: 12, cr: 1, damageDice: '1d6' };
            });
            startCombat(state, resolved);
            break;
        }

        case 'combat_attack': {
            // Module resolves the attack roll - AI just triggers it
            const weaponName = ev.weapon || state.equipped || 'Unarmed';
            const target     = ev.target || state.combat?.enemies[0]?.name || '';
            if (state.combat?.active) {
                resolvePlayerAttack(state, target, weaponName);
            }
            break;
        }

        case 'enemy_attack': {
            // Module resolves enemy attack against player
            const attacker = ev.attacker || state.combat?.enemies.find(e => e.hp > 0)?.name || '';
            if (state.combat?.active) {
                resolveEnemyAttack(state, attacker);
            }
            break;
        }

        case 'enemy_hp': {
            // Direct enemy HP adjustment (for spells, traps, etc. where we skip attack roll)
            const enemy = state.combat?.enemies.find(e =>
                e.name.toLowerCase().includes((ev.name || '').toLowerCase()));
            if (enemy) {
                enemy.hp = Math.max(0, enemy.hp + (Number(ev.amount) || 0));
                const line = `${ev.name} takes ${Math.abs(ev.amount)} damage (${enemy.hp}/${enemy.maxHp}HP)`;
                state.combat.log.push(line);
                if (state.combat.log.length > 6) state.combat.log.shift();
            }
            break;
        }

        case 'combat_end':
            endCombat(state);
            break;

        case 'next_round':
            if (state.combat) state.combat.round += 1;
            break;

        case 'death_save':
            resolveDeathSave(state);
            break;

        case 'stabilize':
            state.deathSaves = null;
            state.player.hp  = 1;
            state.conditions = (state.conditions || []).filter(c => c !== 'Unconscious');
            break;

        case 'companion_hp':
            if (state.companion) {
                state.companion.hp = Math.min(
                    state.companion.maxHp,
                    Math.max(0, state.companion.hp + (Number(ev.amount) || 0))
                );
            }
            break;

        case 'flag_set':
            state.flags[ev.key] = ev.value;
            break;

        default:
            break;
    }
}

// ── Level Up ───────────────────────────────────────────────────────────────────

function checkLevelUp(state) {
    const p        = state.player;
    const newLevel = levelFromXP(p.xp);
    if (newLevel <= p.level) return null;

    const oldLevel = p.level;
    p.level        = newLevel;
    const newMax   = calcMaxHP(state);
    const hpGain   = newMax - p.maxHp;
    p.maxHp        = newMax;
    p.hp           = Math.min(p.maxHp, p.hp + hpGain);

    // Rebuild spell slots at new level (preserve unused slots where possible)
    if (CLASS_CASTER_TYPE[p.class]) {
        state.spellSlots = buildSpellSlots(p.class, p.level);
    }

    return { from: oldLevel, to: newLevel, hpGain };
}

// ── Encounter Tables (Open5e SRD, CC-BY 4.0) ─────────────────────────────────
// Monsters per biome, in three CR bands:
//   low  = CR 1/8-1  (levels 1-2)   mid = CR 2-3 (levels 3-4)   high = CR 4-5 (levels 5+)
// AC and HP are included so the GM can run combat accurately.

const ENCOUNTERS = {
    thornvale: {
        low:  [{ name: 'Bandit', cr: 0.125, ac: 12, hp: 11 }, { name: 'Blood Hawk', cr: 0.125, ac: 12, hp: 7 }, { name: 'Cultist', cr: 0.125, ac: 12, hp: 9 }, { name: 'Flying Snake', cr: 0.125, ac: 14, hp: 5 }, { name: 'Giant Rat', cr: 0.125, ac: 12, hp: 7 }, { name: 'Giant Weasel', cr: 0.125, ac: 13, hp: 9 }, { name: 'Guard', cr: 0.125, ac: 16, hp: 11 }, { name: 'Kobold', cr: 0.125, ac: 12, hp: 5 }, { name: 'Mastiff', cr: 0.125, ac: 12, hp: 5 }, { name: 'Stirge', cr: 0.125, ac: 14, hp: 2 }],
        mid:  [{ name: 'Ankheg', cr: 2.0, ac: 14, hp: 39 }, { name: 'Awakened Tree', cr: 2.0, ac: 13, hp: 59 }, { name: 'Bandit Captain', cr: 2.0, ac: 15, hp: 65 }, { name: 'Berserker', cr: 2.0, ac: 13, hp: 67 }, { name: 'Black Dragon Wyrmling', cr: 2.0, ac: 17, hp: 33 }, { name: 'Centaur', cr: 2.0, ac: 12, hp: 45 }, { name: 'Cult Fanatic', cr: 2.0, ac: 13, hp: 22 }, { name: 'Druid', cr: 2.0, ac: 11, hp: 27 }],
        high: [{ name: 'Black Pudding', cr: 4.0, ac: 7, hp: 85 }, { name: 'Couatl', cr: 4.0, ac: 19, hp: 97 }, { name: 'Ettin', cr: 4.0, ac: 12, hp: 85 }, { name: 'Ghost', cr: 4.0, ac: 11, hp: 45 }, { name: 'Wereboar', cr: 4.0, ac: 10, hp: 78 }, { name: 'Weretiger', cr: 4.0, ac: 12, hp: 120 }],
    },
    saltmere: {
        low:  [{ name: 'Bandit', cr: 0.125, ac: 12, hp: 11 }, { name: 'Blood Hawk', cr: 0.125, ac: 12, hp: 7 }, { name: 'Cultist', cr: 0.125, ac: 12, hp: 9 }, { name: 'Flying Snake', cr: 0.125, ac: 14, hp: 5 }, { name: 'Giant Crab', cr: 0.125, ac: 15, hp: 13 }, { name: 'Giant Rat', cr: 0.125, ac: 12, hp: 7 }, { name: 'Guard', cr: 0.125, ac: 16, hp: 11 }, { name: 'Kobold', cr: 0.125, ac: 12, hp: 5 }, { name: 'Merfolk', cr: 0.125, ac: 11, hp: 11 }, { name: 'Stirge', cr: 0.125, ac: 14, hp: 2 }],
        mid:  [{ name: 'Bandit Captain', cr: 2.0, ac: 15, hp: 65 }, { name: 'Berserker', cr: 2.0, ac: 13, hp: 67 }, { name: 'Bronze Dragon Wyrmling', cr: 2.0, ac: 17, hp: 32 }, { name: 'Cult Fanatic', cr: 2.0, ac: 13, hp: 22 }, { name: 'Gargoyle', cr: 2.0, ac: 15, hp: 52 }, { name: 'Gelatinous Cube', cr: 2.0, ac: 6, hp: 84 }, { name: 'Ghast', cr: 2.0, ac: 13, hp: 36 }, { name: 'Sea Hag', cr: 2.0, ac: 14, hp: 52 }],
        high: [{ name: 'Black Pudding', cr: 4.0, ac: 7, hp: 85 }, { name: 'Chuul', cr: 4.0, ac: 16, hp: 93 }, { name: 'Ghost', cr: 4.0, ac: 11, hp: 45 }, { name: 'Sahuagin Baron', cr: 5.0, ac: 16, hp: 76 }, { name: 'Giant Crocodile', cr: 5.0, ac: 14, hp: 85 }, { name: 'Giant Shark', cr: 5.0, ac: 13, hp: 126 }],
    },
    ashford: {
        low:  [{ name: 'Bandit', cr: 0.125, ac: 12, hp: 11 }, { name: 'Blood Hawk', cr: 0.125, ac: 12, hp: 7 }, { name: 'Camel', cr: 0.125, ac: 9, hp: 15 }, { name: 'Cultist', cr: 0.125, ac: 12, hp: 9 }, { name: 'Flying Snake', cr: 0.125, ac: 14, hp: 5 }, { name: 'Giant Crab', cr: 0.125, ac: 15, hp: 13 }, { name: 'Giant Rat', cr: 0.125, ac: 12, hp: 7 }, { name: 'Guard', cr: 0.125, ac: 16, hp: 11 }, { name: 'Kobold', cr: 0.125, ac: 12, hp: 5 }, { name: 'Stirge', cr: 0.125, ac: 14, hp: 2 }],
        mid:  [{ name: 'Azer', cr: 2.0, ac: 17, hp: 39 }, { name: 'Bandit Captain', cr: 2.0, ac: 15, hp: 65 }, { name: 'Berserker', cr: 2.0, ac: 13, hp: 67 }, { name: 'Gargoyle', cr: 2.0, ac: 15, hp: 52 }, { name: 'Gelatinous Cube', cr: 2.0, ac: 6, hp: 84 }, { name: 'Ghast', cr: 2.0, ac: 13, hp: 36 }, { name: 'Grick', cr: 2.0, ac: 14, hp: 27 }, { name: 'Ogre', cr: 2.0, ac: 11, hp: 59 }],
        high: [{ name: 'Black Pudding', cr: 4.0, ac: 7, hp: 85 }, { name: 'Chuul', cr: 4.0, ac: 16, hp: 93 }, { name: 'Ettin', cr: 4.0, ac: 12, hp: 85 }, { name: 'Ghost', cr: 4.0, ac: 11, hp: 45 }, { name: 'Air Elemental', cr: 5.0, ac: 15, hp: 90 }, { name: 'Earth Elemental', cr: 5.0, ac: 17, hp: 126 }],
    },
    highmark: {
        low:  [{ name: 'Bandit', cr: 0.125, ac: 12, hp: 11 }, { name: 'Blood Hawk', cr: 0.125, ac: 12, hp: 7 }, { name: 'Cultist', cr: 0.125, ac: 12, hp: 9 }, { name: 'Giant Weasel', cr: 0.125, ac: 13, hp: 9 }, { name: 'Guard', cr: 0.125, ac: 16, hp: 11 }, { name: 'Kobold', cr: 0.125, ac: 12, hp: 5 }, { name: 'Mastiff', cr: 0.125, ac: 12, hp: 5 }, { name: 'Noble', cr: 0.125, ac: 15, hp: 9 }, { name: 'Stirge', cr: 0.125, ac: 14, hp: 2 }, { name: 'Tribal Warrior', cr: 0.125, ac: 12, hp: 11 }],
        mid:  [{ name: 'Bandit Captain', cr: 2.0, ac: 15, hp: 65 }, { name: 'Berserker', cr: 2.0, ac: 13, hp: 67 }, { name: 'Druid', cr: 2.0, ac: 11, hp: 27 }, { name: 'Gargoyle', cr: 2.0, ac: 15, hp: 52 }, { name: 'Ghast', cr: 2.0, ac: 13, hp: 36 }, { name: 'Giant Boar', cr: 2.0, ac: 12, hp: 42 }, { name: 'Ogre', cr: 2.0, ac: 11, hp: 59 }, { name: 'Worg', cr: 0.5, ac: 13, hp: 26 }],
        high: [{ name: 'Ettin', cr: 4.0, ac: 12, hp: 85 }, { name: 'Ghost', cr: 4.0, ac: 11, hp: 45 }, { name: 'Lamia', cr: 4.0, ac: 13, hp: 97 }, { name: 'Wereboar', cr: 4.0, ac: 10, hp: 78 }, { name: 'Air Elemental', cr: 5.0, ac: 15, hp: 90 }, { name: 'Bulette', cr: 5.0, ac: 17, hp: 94 }],
    },
    dunmere: {
        low:  [{ name: 'Bandit', cr: 0.125, ac: 12, hp: 11 }, { name: 'Blood Hawk', cr: 0.125, ac: 12, hp: 7 }, { name: 'Cultist', cr: 0.125, ac: 12, hp: 9 }, { name: 'Flying Snake', cr: 0.125, ac: 14, hp: 5 }, { name: 'Giant Crab', cr: 0.125, ac: 15, hp: 13 }, { name: 'Giant Rat', cr: 0.125, ac: 12, hp: 7 }, { name: 'Giant Rat (Diseased)', cr: 0.125, ac: 12, hp: 7 }, { name: 'Giant Weasel', cr: 0.125, ac: 13, hp: 9 }, { name: 'Kobold', cr: 0.125, ac: 12, hp: 5 }, { name: 'Stirge', cr: 0.125, ac: 14, hp: 2 }],
        mid:  [{ name: 'Ankheg', cr: 2.0, ac: 14, hp: 39 }, { name: 'Awakened Tree', cr: 2.0, ac: 13, hp: 59 }, { name: 'Bandit Captain', cr: 2.0, ac: 15, hp: 65 }, { name: 'Black Dragon Wyrmling', cr: 2.0, ac: 17, hp: 33 }, { name: 'Centaur', cr: 2.0, ac: 12, hp: 45 }, { name: 'Cult Fanatic', cr: 2.0, ac: 13, hp: 22 }, { name: 'Druid', cr: 2.0, ac: 11, hp: 27 }, { name: 'Will-o-Wisp', cr: 2.0, ac: 19, hp: 22 }],
        high: [{ name: 'Couatl', cr: 4.0, ac: 19, hp: 97 }, { name: 'Ghost', cr: 4.0, ac: 11, hp: 45 }, { name: 'Green Hag', cr: 3.0, ac: 14, hp: 82 }, { name: 'Wereboar', cr: 4.0, ac: 10, hp: 78 }, { name: 'Weretiger', cr: 4.0, ac: 12, hp: 120 }, { name: 'Bulette', cr: 5.0, ac: 17, hp: 94 }],
    },
    ironcross: {
        low:  [{ name: 'Bandit', cr: 0.125, ac: 12, hp: 11 }, { name: 'Blood Hawk', cr: 0.125, ac: 12, hp: 7 }, { name: 'Camel', cr: 0.125, ac: 9, hp: 15 }, { name: 'Cultist', cr: 0.125, ac: 12, hp: 9 }, { name: 'Flying Snake', cr: 0.125, ac: 14, hp: 5 }, { name: 'Giant Rat', cr: 0.125, ac: 12, hp: 7 }, { name: 'Giant Weasel', cr: 0.125, ac: 13, hp: 9 }, { name: 'Guard', cr: 0.125, ac: 16, hp: 11 }, { name: 'Kobold', cr: 0.125, ac: 12, hp: 5 }, { name: 'Tribal Warrior', cr: 0.125, ac: 12, hp: 11 }],
        mid:  [{ name: 'Ankheg', cr: 2.0, ac: 14, hp: 39 }, { name: 'Bandit Captain', cr: 2.0, ac: 15, hp: 65 }, { name: 'Berserker', cr: 2.0, ac: 13, hp: 67 }, { name: 'Centaur', cr: 2.0, ac: 12, hp: 45 }, { name: 'Cult Fanatic', cr: 2.0, ac: 13, hp: 22 }, { name: 'Ghast', cr: 2.0, ac: 13, hp: 36 }, { name: 'Ogre', cr: 2.0, ac: 11, hp: 59 }, { name: 'Worg', cr: 0.5, ac: 13, hp: 26 }],
        high: [{ name: 'Couatl', cr: 4.0, ac: 19, hp: 97 }, { name: 'Elephant', cr: 4.0, ac: 12, hp: 76 }, { name: 'Ettin', cr: 4.0, ac: 12, hp: 85 }, { name: 'Ghost', cr: 4.0, ac: 11, hp: 45 }, { name: 'Lamia', cr: 4.0, ac: 13, hp: 97 }, { name: 'Gladiator', cr: 5.0, ac: 16, hp: 112 }],
    },
};

// ── Loot Tables (Open5e SRD, CC-BY 4.0) ──────────────────────────────────────
// Tiered by rarity. GM picks tier based on encounter difficulty:
//   low encounter → common   mid → uncommon   high/boss → rare

const LOOT = {
    common: [
        'Bag of Tricks','Boots of False Tracks','Candle of the Deep',
        'Cloak of Billowing','Cloak of Many Fashions','Driftglobe',
        'Ear Horn of Hearing','Enduring Spellbook','Hat of Vermin',
        "Heward's Handy Spice Pouch",'Horn of Silent Alarm',
        'Instrument of Illusions','Mystery Key','Pipe of Smoke Monsters',
        'Pole of Collapsing','Rope of Mending','Talking Doll',
        'Wand of Conducting','Wand of Pyrotechnics',
    ],
    uncommon: [
        'Adamantine Armor','Ammunition +1','Amulet of Proof against Detection and Location',
        'Bag of Holding','Boots of Elvenkind','Boots of Striding and Springing',
        'Bracers of Archery','Brooch of Shielding','Broom of Flying',
        'Cloak of Elvenkind','Cloak of Protection','Eyes of Charming',
        'Gauntlets of Ogre Power','Goggles of Night','Hat of Disguise',
        'Headband of Intellect','Helm of Comprehending Languages','Immovable Rod',
        'Lantern of Revealing','Mithral Armor','Necklace of Adaptation',
        'Pearl of Power','Ring of Jumping','Ring of Mind Shielding',
        'Ring of Swimming','Ring of Warmth','Ring of Water Walking',
        'Rope of Climbing','Sending Stones','Shield +1',
        'Slippers of Spider Climbing','Wand of Magic Missiles',
        'Wand of Secrets','Weapon +1','Wind Fan',
    ],
    rare: [
        'Amulet of Health','Belt of Giant Strength (Hill)','Boots of Levitation',
        'Boots of Speed','Bracers of Defense','Carpet of Flying',
        'Cloak of Displacement','Cloak of the Bat','Cube of Force',
        "Daern's Instant Fortress",'Dagger of Venom','Dragon Scale Mail',
        'Dragon Slayer','Elven Chain','Flame Tongue','Folding Boat',
        'Gem of Seeing','Giant Slayer','Glamoured Studded Leather',
        'Helm of Teleportation','Horn of Blasting','Ioun Stone',
        'Mace of Disruption','Mace of Terror','Necklace of Fireballs',
        'Ring of Animal Influence','Ring of Evasion','Ring of Feather Falling',
        'Ring of Free Action','Ring of Protection','Ring of Spell Storing',
        'Ring of X-ray Vision','Robe of Eyes','Rod of Rulership',
        'Rope of Entanglement','Shield +2','Staff of Charming',
        'Staff of Healing','Staff of the Woodlands','Sun Blade',
        'Sword +2','Sword of Life Stealing','Trident of Fish Command',
        'Wand of Fireballs','Wand of Lightning Bolts','Wand of Wonder',
        'Wings of Flying',
    ],
};



// ── Weapon Table (Open5e SRD v2, CC-BY 4.0) ──────────────────────────────────
// stat: 'str' = STR mod, 'dex' = DEX mod, 'best' = higher of STR/DEX (finesse)
// Attack roll: d20 + stat_mod + prof_bonus (if proficient) vs target AC
// Damage:      weapon_dice + stat_mod

const WEAPONS = {
    'Club':           { dice: '1d4',  type: 'Bludgeoning', simple: true,  range: 0,   stat: 'str',  props: ['Light'] },
    'Dagger':         { dice: '1d4',  type: 'Piercing',    simple: true,  range: 20,  stat: 'best', props: ['Finesse','Light','Thrown 20/60'] },
    'Greatclub':      { dice: '1d8',  type: 'Bludgeoning', simple: true,  range: 0,   stat: 'str',  props: ['Two-Handed'] },
    'Handaxe':        { dice: '1d6',  type: 'Slashing',    simple: true,  range: 20,  stat: 'dex',  props: ['Light','Thrown 20/60'] },
    'Javelin':        { dice: '1d6',  type: 'Piercing',    simple: true,  range: 30,  stat: 'dex',  props: ['Thrown 30/120'] },
    'Light Hammer':   { dice: '1d4',  type: 'Bludgeoning', simple: true,  range: 20,  stat: 'dex',  props: ['Light','Thrown 20/60'] },
    'Mace':           { dice: '1d6',  type: 'Bludgeoning', simple: true,  range: 0,   stat: 'str',  props: [] },
    'Quarterstaff':   { dice: '1d6',  type: 'Bludgeoning', simple: true,  range: 0,   stat: 'str',  props: ['Versatile 1d8'] },
    'Sickle':         { dice: '1d4',  type: 'Slashing',    simple: true,  range: 0,   stat: 'str',  props: ['Light'] },
    'Spear':          { dice: '1d6',  type: 'Piercing',    simple: true,  range: 20,  stat: 'dex',  props: ['Thrown 20/60','Versatile 1d8'] },
    'Light Crossbow': { dice: '1d8',  type: 'Piercing',    simple: true,  range: 80,  stat: 'dex',  props: ['Ammunition','Loading','Two-Handed'] },
    'Shortbow':       { dice: '1d6',  type: 'Piercing',    simple: true,  range: 80,  stat: 'dex',  props: ['Ammunition','Two-Handed'] },
    'Sling':          { dice: '1d4',  type: 'Bludgeoning', simple: true,  range: 30,  stat: 'dex',  props: ['Ammunition'] },
    'Battleaxe':      { dice: '1d8',  type: 'Slashing',    simple: false, range: 0,   stat: 'str',  props: ['Versatile 1d10'] },
    'Flail':          { dice: '1d8',  type: 'Bludgeoning', simple: false, range: 0,   stat: 'str',  props: [] },
    'Glaive':         { dice: '1d10', type: 'Slashing',    simple: false, range: 0,   stat: 'str',  props: ['Heavy','Reach','Two-Handed'] },
    'Greataxe':       { dice: '1d12', type: 'Slashing',    simple: false, range: 0,   stat: 'str',  props: ['Heavy','Two-Handed'] },
    'Greatsword':     { dice: '2d6',  type: 'Slashing',    simple: false, range: 0,   stat: 'str',  props: ['Heavy','Two-Handed'] },
    'Halberd':        { dice: '1d10', type: 'Slashing',    simple: false, range: 0,   stat: 'str',  props: ['Heavy','Reach','Two-Handed'] },
    'Longsword':      { dice: '1d8',  type: 'Slashing',    simple: false, range: 0,   stat: 'str',  props: ['Versatile 1d10'] },
    'Maul':           { dice: '2d6',  type: 'Bludgeoning', simple: false, range: 0,   stat: 'str',  props: ['Heavy','Two-Handed'] },
    'Morningstar':    { dice: '1d8',  type: 'Piercing',    simple: false, range: 0,   stat: 'str',  props: [] },
    'Pike':           { dice: '1d10', type: 'Piercing',    simple: false, range: 0,   stat: 'str',  props: ['Heavy','Reach','Two-Handed'] },
    'Rapier':         { dice: '1d8',  type: 'Piercing',    simple: false, range: 0,   stat: 'best', props: ['Finesse'] },
    'Scimitar':       { dice: '1d6',  type: 'Slashing',    simple: false, range: 0,   stat: 'best', props: ['Finesse','Light'] },
    'Shortsword':     { dice: '1d6',  type: 'Piercing',    simple: false, range: 0,   stat: 'best', props: ['Finesse','Light'] },
    'Trident':        { dice: '1d8',  type: 'Piercing',    simple: false, range: 20,  stat: 'dex',  props: ['Thrown 20/60','Versatile 1d10'] },
    'War Pick':       { dice: '1d8',  type: 'Piercing',    simple: false, range: 0,   stat: 'str',  props: ['Versatile 1d10'] },
    'Warhammer':      { dice: '1d8',  type: 'Bludgeoning', simple: false, range: 0,   stat: 'str',  props: ['Versatile 1d10'] },
    'Whip':           { dice: '1d4',  type: 'Slashing',    simple: false, range: 0,   stat: 'best', props: ['Finesse','Reach'] },
    'Hand Crossbow':  { dice: '1d6',  type: 'Piercing',    simple: false, range: 30,  stat: 'dex',  props: ['Ammunition','Light','Loading'] },
    'Heavy Crossbow': { dice: '1d10', type: 'Piercing',    simple: false, range: 100, stat: 'dex',  props: ['Ammunition','Heavy','Loading','Two-Handed'] },
    'Longbow':        { dice: '1d8',  type: 'Piercing',    simple: false, range: 150, stat: 'dex',  props: ['Ammunition','Heavy','Two-Handed'] },
};

// Get weapon stat modifier (handles finesse)
function weaponStatMod(w, player) {
    if (!w) return mod(player.str);
    if (w.stat === 'best') return Math.max(mod(player.str), mod(player.dex));
    if (w.stat === 'dex')  return mod(player.dex);
    return mod(player.str);
}

// Build attack string for HUD display: "+5 to hit, 1d8+3 slashing"
function weaponAttackStr(weaponName, player, proficient = true) {
    const w = WEAPONS[weaponName];
    if (!w) return null;
    const sMod   = weaponStatMod(w, player);
    const prof   = proficient ? pb(player.level) : 0;
    const toHit  = sMod + prof;
    const dmgMod = sMod;
    return {
        toHit:  sign(toHit),
        damage: `${w.dice}${dmgMod >= 0 ? '+' : ''}${dmgMod} ${w.type}`,
        props:  w.props,
        range:  w.range,
    };
}

// ── Spell Lists (Open5e SRD, CC-BY 4.0) ──────────────────────────────────────
// Cantrips + L1 + L2 per caster class. Used for HUD display and GM reference.

const SPELL_LISTS = {
    bard:      { cantrips: ["Dancing Lights","Light","Mage Hand","Mending","Message","Minor Illusion","Prestidigitation","True Strike"], lvl1: ["Animal Friendship","Bane","Charm Person","Comprehend Languages","Cure Wounds","Detect Magic","Disguise Self","Faerie Fire","Feather Fall","Healing Word"], lvl2: ["Animal Messenger","Blindness/Deafness","Calm Emotions","Detect Thoughts","Enhance Ability","Enthrall","Heat Metal","Hold Person"] },
    cleric:    { cantrips: ["Guidance","Light","Mending","Resistance","Sacred Flame","Spare the Dying","Thaumaturgy"], lvl1: ["Bane","Bless","Burning Hands","Charm Person","Command","Create or Destroy Water","Cure Wounds","Detect Evil and Good","Detect Magic","Detect Poison and Disease"], lvl2: ["Aid","Augury","Barkskin","Blindness/Deafness","Calm Emotions","Continual Flame","Enhance Ability","Find Traps"] },
    druid:     { cantrips: ["Druidcraft","Guidance","Mending","Poison Spray","Produce Flame","Resistance","Shillelagh"], lvl1: ["Animal Friendship","Charm Person","Create or Destroy Water","Cure Wounds","Detect Magic","Detect Poison and Disease","Entangle","Faerie Fire","Fog Cloud","Goodberry"], lvl2: ["Acid Arrow","Animal Messenger","Barkskin","Blur","Darkness","Darkvision","Enhance Ability","Find Traps"] },
    paladin:   { cantrips: [], lvl1: ["Bless","Command","Cure Wounds","Detect Evil and Good","Detect Magic","Detect Poison and Disease","Divine Favor","Heroism","Protection from Evil and Good","Shield of Faith"], lvl2: ["Aid","Branding Smite","Find Steed","Lesser Restoration","Locate Object","Magic Weapon","Protection from Poison","Zone of Truth"] },
    ranger:    { cantrips: [], lvl1: ["Alarm","Animal Friendship","Cure Wounds","Detect Magic","Detect Poison and Disease","Fog Cloud","Goodberry","Hunter's Mark","Jump","Longstrider"], lvl2: ["Animal Messenger","Barkskin","Darkvision","Find Traps","Lesser Restoration","Locate Animals or Plants","Locate Object","Pass without Trace"] },
    sorcerer:  { cantrips: ["Acid Splash","Chill Touch","Dancing Lights","Fire Bolt","Light","Mage Hand","Mending","Message"], lvl1: ["Burning Hands","Charm Person","Color Spray","Comprehend Languages","Detect Magic","Disguise Self","Expeditious Retreat","False Life","Feather Fall","Fog Cloud"], lvl2: ["Alter Self","Blindness/Deafness","Blur","Darkness","Darkvision","Detect Thoughts","Enhance Ability","Enlarge/Reduce"] },
    warlock:   { cantrips: ["Chill Touch","Eldritch Blast","Mage Hand","Minor Illusion","Poison Spray","Prestidigitation","True Strike"], lvl1: ["Burning Hands","Charm Person","Command","Comprehend Languages","Expeditious Retreat","Faerie Fire","Hellish Rebuke","Hideous Laughter","Illusory Script","Protection from Evil and Good"], lvl2: ["Blindness/Deafness","Calm Emotions","Darkness","Detect Thoughts","Enthrall","Hold Person","Invisibility","Mirror Image"] },
    wizard:    { cantrips: ["Acid Splash","Chill Touch","Dancing Lights","Fire Bolt","Light","Mage Hand","Mending","Message"], lvl1: ["Alarm","Burning Hands","Charm Person","Color Spray","Comprehend Languages","Detect Magic","Disguise Self","Expeditious Retreat","False Life","Feather Fall"], lvl2: ["Acid Arrow","Alter Self","Arcane Lock","Blindness/Deafness","Blur","Continual Flame","Darkness","Darkvision"] },
    barbarian: { cantrips: [], lvl1: [], lvl2: [] },
    fighter:   { cantrips: [], lvl1: [], lvl2: [] },
    monk:      { cantrips: [], lvl1: [], lvl2: [] },
    rogue:     { cantrips: [], lvl1: [], lvl2: [] },
};

// Pick a level-appropriate random encounter for the current world
function pickEncounter(worldId, playerLevel) {
    const table = ENCOUNTERS[worldId];
    if (!table) return null;
    const band = playerLevel <= 2 ? 'low' : playerLevel <= 4 ? 'mid' : 'high';
    const pool = table[band];
    return pool[Math.floor(Math.random() * pool.length)];
}

// Pick N unique loot items from a rarity tier
function pickLoot(rarity, count = 1) {
    const pool = LOOT[rarity] || LOOT.common;
    const used = new Set();
    const out  = [];
    while (out.length < count && out.length < pool.length) {
        const item = pool[Math.floor(Math.random() * pool.length)];
        if (!used.has(item)) { used.add(item); out.push(item); }
    }
    return out;
}


// ── Quest Templates (one per world hook) ─────────────────────────────────────
// Pre-written quests tied to each world's hooks.
// Rewards applied automatically by the module on quest_complete.
// The current stage objective is injected into the system prompt every turn.

const QUEST_TEMPLATES = {
  thornvale: [
    { id: 'thornvale_loggers', title: 'The Vanishing Loggers', giver: 'Captain Aldric', giverLocation: 'The Split Log tavern',
      stages: [
        { objective: 'Speak to the families of the missing loggers and learn where they were last working', hint: 'The families mention Sorrow\'s Edge, the deepest part of the Thornwood' },
        { objective: 'Investigate Sorrow\'s Edge and find evidence of what took the loggers', hint: 'Drag marks, fey sigils, a single boot' },
        { objective: 'Follow the trail into the fey crossing and confront whatever is taking people', hint: 'A redcap warren or a hag\'s bargain gone wrong' },
      ], reward: { xp: 300, gold: 40, item: 'Cloak of Elvenkind' }, failCondition: 'The player retreats from the fey crossing without resolving the threat' },
    { id: 'thornvale_fey', title: 'The Debt of Petals', giver: 'Maren the Farmer', giverLocation: 'Thornvale market',
      stages: [
        { objective: 'Find the fey bargain contract hidden in the old mill at the forest edge', hint: 'The mill is guarded by animated farm tools' },
        { objective: 'Negotiate with or trick the fey creditor into voiding the debt', hint: 'The fey wants a name, a memory, or a firstborn - find a loophole' },
        { objective: 'Return the daughter safely to her family before the next new moon', hint: 'Time is a factor - every wasted day costs something' },
      ], reward: { xp: 250, gold: 30, item: 'Rope of Climbing' }, failCondition: 'The new moon passes before the daughter is returned' },
    { id: 'thornvale_ruins', title: 'The Unnamed Script', giver: 'Scholar Vorath', giverLocation: 'The Split Log tavern',
      stages: [
        { objective: 'Retrieve a rubbing of the ruins inscription from the collapsed tower northeast of town', hint: 'The tower is unstable - DEX checks to navigate safely' },
        { objective: 'Bring the rubbing to the sage at Thornvale\'s library for translation', hint: 'The sage recognizes it as a ward - and it\'s been broken' },
        { objective: 'Reseal the ward at the ruins before whatever it was containing fully escapes', hint: 'A shadow creature is already seeping through' },
      ], reward: { xp: 350, gold: 50, item: 'Pearl of Power' }, failCondition: 'The shadow creature escapes the ruins entirely' },
  ],
  saltmere: [
    { id: 'saltmere_vessel', title: 'The Empty Crossing', giver: 'Harbormistress Duna', giverLocation: 'The Drowned Anchor',
      stages: [
        { objective: 'Board the grounded vessel and search for survivors or clues', hint: 'The ship is the Pale Morning - cargo intact, crew gone, tables still set for dinner' },
        { objective: 'Find the captain\'s log and decode the last entry', hint: 'Written in a shaking hand - mentions lights below the water and voices' },
        { objective: 'Dive to the tidal cave entrance and confront the source', hint: 'Aboleth thrall or deep sea hag luring ships' },
      ], reward: { xp: 400, gold: 60, item: 'Cloak of the Manta Ray' }, failCondition: 'The player is charmed and does not break free before leaving the cave' },
    { id: 'saltmere_caves', title: 'The Calling Dark', giver: 'Fisher Tam', giverLocation: 'The Drowned Anchor docks',
      stages: [
        { objective: 'Find the entrance to the tidal caves accessible only at low tide', hint: 'A local fisherman marks the path on a piece of sailcloth for a few coins' },
        { objective: 'Locate the source of the voice and resist its compulsion (WIS DC 14)', hint: 'Failure means moving toward it involuntarily' },
        { objective: 'Destroy or seal the calling stone generating the effect', hint: 'Smashing it causes a psychic burst - CON save or 2d6 psychic damage' },
      ], reward: { xp: 300, gold: 35, item: 'Sending Stones' }, failCondition: 'The player succumbs to the voice and cannot be recovered' },
    { id: 'saltmere_smugglers', title: 'The Unmarked Cargo', giver: 'Merchant Osric', giverLocation: 'The Drowned Anchor back room',
      stages: [
        { objective: 'Infiltrate the docks at night and identify which ship carries the contested cargo', hint: 'STR or DEX check to avoid crew patrols' },
        { objective: 'Learn what the cargo actually is before either crew discovers you', hint: 'The crate contains a bound imp - both crews think it is something else' },
        { objective: 'Resolve the standoff before blood is spilled', hint: 'Three possible outcomes each with different rewards' },
      ], reward: { xp: 250, gold: 55, item: 'Hat of Disguise' }, failCondition: 'Both crews are killed or the imp escapes into town' },
  ],
  ashford: [
    { id: 'ashford_deep_vein', title: 'What Was Sealed', giver: 'Foreman Grak', giverLocation: 'The Ember and Tongs',
      stages: [
        { objective: 'Descend to the sealed chamber at vein 7B and determine what is inside', hint: 'The door bears warning glyphs in Dwarvish - something was deliberately imprisoned here' },
        { objective: 'Find out why it was sealed and who sealed it', hint: 'Old journal pages scattered in the antechamber tell a partial story' },
        { objective: 'Either re-seal the chamber or permanently destroy what is inside', hint: 'Re-sealing requires a ritual component; destroying it means a fight' },
      ], reward: { xp: 350, gold: 45, item: 'Obsidian Amulet' }, failCondition: 'The sealed entity escapes the mine entirely' },
    { id: 'ashford_company', title: 'Blood and Bloodstone', giver: 'Miner Elva', giverLocation: 'The Ember and Tongs',
      stages: [
        { objective: 'Gather testimony from three miners willing to speak against the Company', hint: 'Most are afraid - CHA checks to convince them, or find physical evidence' },
        { objective: 'Steal or copy the Company ledger showing forced labor contracts', hint: 'The ledger is in the Company office - guarded at night' },
        { objective: 'Deliver the evidence to the regional magistrate\'s courier before the Company suppresses it', hint: 'The Company sends guards to intercept at the town gate' },
      ], reward: { xp: 300, gold: 40, item: 'Immovable Rod' }, failCondition: 'The evidence is destroyed or the courier is killed' },
    { id: 'ashford_bones', title: 'The Tooth Market', giver: 'Collector Siris', giverLocation: 'The Ember and Tongs',
      stages: [
        { objective: 'Track the collectors into the wastes and find their dig site', hint: 'Follow wagon tracks east into the obsidian fields - 4 hours on foot' },
        { objective: 'Discover what the collectors actually found - not just teeth', hint: 'A partially intact dragon skull with a spirit still bound inside' },
        { objective: 'Free or re-bind the spirit and deal with the collectors', hint: 'The dragon spirit offers a boon if freed; the collectors will fight to keep their prize' },
      ], reward: { xp: 400, gold: 70, item: 'Dragon Scale Mail' }, failCondition: 'The dragon skull is sold and leaves the region' },
  ],
  highmark: [
    { id: 'highmark_blizzard', title: 'The Lost Caravan', giver: 'Innkeeper Brede', giverLocation: 'The Wayward Ram',
      stages: [
        { objective: 'Head into the pass and find where the caravan was stopped', hint: 'Signs of avalanche - the snow is disturbed in a pattern that looks deliberate' },
        { objective: 'Rescue any survivors before the next storm hits (6 turns)', hint: 'Race against time - the blizzard is coming' },
        { objective: 'Deal with whoever triggered the avalanche', hint: 'Bandits with a camp hidden in a switchback above the road' },
      ], reward: { xp: 300, gold: 50, item: 'Boots of Speed' }, failCondition: 'The blizzard arrives before the survivors are found' },
    { id: 'highmark_cairns', title: 'The Restless Dead', giver: 'Elder Maren', giverLocation: 'The Wayward Ram',
      stages: [
        { objective: 'Visit three cairn sites and determine which one was disturbed', hint: 'The third cairn on the north ridge has been excavated from below' },
        { objective: 'Descend into the cairn and find what was taken from inside', hint: 'A burial crown - whoever took it left tracks heading south' },
        { objective: 'Recover the crown and return it to the cairn before the wight fully manifests', hint: 'The wight is already forming - they have until dawn' },
      ], reward: { xp: 350, gold: 30, item: 'Ring of Protection' }, failCondition: 'The wight fully manifests and escapes the cairn' },
    { id: 'highmark_ransom', title: 'The Quiet Lord', giver: 'Lady Voss', giverLocation: 'The Wayward Ram private room',
      stages: [
        { objective: 'Find where the kidnappers are holding Lord Aldren without alerting them', hint: 'A shepherd saw riders heading toward the old mine headworks two days ago' },
        { objective: 'Infiltrate the hideout and assess the situation', hint: 'Four kidnappers, one lord, one locked cellar - stealth or deception first' },
        { objective: 'Extract Lord Aldren alive', hint: 'The kidnappers have a signal arrow - if fired, reinforcements arrive in 3 turns' },
      ], reward: { xp: 400, gold: 100, item: 'Glamoured Studded Leather' }, failCondition: 'Lord Aldren is killed or reinforcements overwhelm the party' },
  ],
  dunmere: [
    { id: 'dunmere_paths', title: 'The Shifting Ways', giver: 'Guide Corra', giverLocation: 'The Bogwitch',
      stages: [
        { objective: 'Follow the old fen path markers and document where they now lead incorrectly', hint: 'The markers have been moved deliberately to lead travelers into the deep fens' },
        { objective: 'Find whoever is moving the markers and why', hint: 'A feral druid is keeping people out of a nesting area for something large' },
        { objective: 'Resolve the druid\'s concern without the nesting creature being killed', hint: 'Diplomacy, a detour route, or confronting the threat to the nest directly' },
      ], reward: { xp: 250, gold: 30, item: 'Boots of Elvenkind' }, failCondition: 'The nesting creature is killed or the druid is driven off without resolution' },
    { id: 'dunmere_wisps', title: 'The Light Shepherd', giver: 'Widow Hessa', giverLocation: 'The Bogwitch',
      stages: [
        { objective: 'Follow a will-o-wisp at a safe distance to find where they lead travelers (WIS DC 13 each turn or follow involuntarily)', hint: 'The destination is a sunken ruin' },
        { objective: 'Explore the ruin and find what feeds the wisps', hint: 'A drowned necromancer\'s phylactery animating the fen dead' },
        { objective: 'Destroy the phylactery and disperse the wisp cluster', hint: 'The phylactery is underwater - the necromancer fights through the drowned dead' },
      ], reward: { xp: 400, gold: 40, item: 'Necklace of Adaptation' }, failCondition: 'Three or more travelers are lost to the wisps before the phylactery is destroyed' },
    { id: 'dunmere_shrine', title: 'The Surfaced Temple', giver: 'Priest Aldour', giverLocation: 'The Bogwitch',
      stages: [
        { objective: 'Reach the surfaced temple before the rival faction and enter safely', hint: 'The entrance is still partially flooded - Athletics check to force the door' },
        { objective: 'Recover the central relic before the rival faction does', hint: 'They arrive midway through exploration - now it is a race' },
        { objective: 'Escape the temple with the relic before it re-submerges at high tide (8 turns)', hint: 'The tide timer is real' },
      ], reward: { xp: 350, gold: 55, item: 'Trident of Fish Command' }, failCondition: 'The temple re-submerges with the player inside or the rival faction takes the relic' },
  ],
  ironcross: [
    { id: 'ironcross_clans', title: 'The Grazing Rights', giver: 'Garrison Commander Veth', giverLocation: 'The Red Stirrup',
      stages: [
        { objective: 'Meet with both clan leaders separately and understand each side\'s actual grievance', hint: 'The land dispute is a cover - one clan\'s horses are sick and they need the other\'s water source' },
        { objective: 'Find a compromise before the next moon muster', hint: 'Someone is deliberately poisoning the horses to spark the war' },
        { objective: 'Expose who is poisoning the horses and why', hint: 'A merchant who profits from clan conflict has a warehouse of weapons ready to sell to the winner' },
      ], reward: { xp: 300, gold: 45, item: 'Wand of Secrets' }, failCondition: 'The clans go to war before the poisoner is exposed' },
    { id: 'ironcross_sickness', title: 'The Red Cough', giver: 'Clan Rider Asha', giverLocation: 'The Red Stirrup',
      stages: [
        { objective: 'Travel to affected clan camps and find a common cause for the sick horses', hint: 'All sick horses drank from streams flowing past a specific steppe section' },
        { objective: 'Follow the streams to their source and find what contaminates them', hint: 'A collapsed iron mine is leaching - but something is living in it now' },
        { objective: 'Clear the mine and seal the contamination source', hint: 'The creature living there is hostile but also sick - it can be driven out rather than killed' },
      ], reward: { xp: 350, gold: 40, item: 'Periapt of Proof against Poison' }, failCondition: 'The contamination spreads to the main Ironcross water supply' },
    { id: 'ironcross_vault', title: 'The Buried Survey', giver: 'Scholar Petrin', giverLocation: 'The Red Stirrup',
      stages: [
        { objective: 'Locate the pre-empire structure using the partial survey notes', hint: 'The notes reference a stone marker shaped like a seated figure - still there, half-buried' },
        { objective: 'Enter the structure and find out what happened to the survey team', hint: 'They are inside alive but time-locked - the structure slows time within its walls' },
        { objective: 'Solve the mechanism holding the time field and collapse it safely', hint: 'INT check to understand it, then a sequence puzzle using the room\'s symbols' },
      ], reward: { xp: 400, gold: 60, item: 'Gem of Seeing' }, failCondition: 'The player becomes time-locked inside the structure' },
  ],
};

function getQuestsForWorld(worldId) {
    return QUEST_TEMPLATES[worldId] || [];
}

// Pick the quest that matches the opening hook index
function pickQuestForHook(worldId, hookIndex) {
    const quests = getQuestsForWorld(worldId);
    return quests[hookIndex % quests.length] || quests[0];
}

// ── World Table ───────────────────────────────────────────────────────────────
//
// Each entry defines a region with a named starting town and its tavern.
// Randomly selected at creation_complete and stored in state.flags.world.
// The GM is given this as the anchor for the opening scene.

const WORLDS = [
    {
        id: 'thornvale',
        region: 'The Thornwood Marches',
        regionDesc: 'a vast, mist-choked forest of black thorns and ancient ruins, where fey spirits and worse things stir at night',
        town: 'Thornvale',
        townDesc: 'a fortified logging settlement carved out of the forest edge, its timber walls patched and re-patched after decades of raids',
        tavern: 'The Split Log',
        tavernDesc: 'low-ceilinged and smoky, smelling of pine resin and cheap ale, favoured by loggers and frontier trappers',
        hooks: [
            'Missing loggers  -  men have been vanishing in the deep wood for weeks',
            'A fey bargain gone wrong  -  a farmer\'s daughter was taken as payment for a debt her grandfather forgot',
            'Ruins sighted  -  a scout returned with rubble carved in no known script and died three days later',
        ],
    },
    {
        id: 'saltmere',
        region: 'The Salthallow Coast',
        regionDesc: 'a jagged coastline of sea stacks, hidden coves, and tidal caves  -  smuggler country, where the crown\'s writ barely reaches',
        town: 'Saltmere',
        townDesc: 'a fishing town built on stilts above a tidal flat, its harbour perpetually crowded with boats whose captains ask no questions',
        tavern: 'The Drowned Anchor',
        tavernDesc: 'a raucous dockside tavern built into a converted warehouse, its walls hung with salvaged figureheads and nets',
        hooks: [
            'A merchant vessel ran aground  -  its cargo was intact but every soul aboard was gone',
            'Tidal caves  -  locals whisper of lights beneath the water and a voice that calls names',
            'Smuggler war  -  two crews are about to spill blood over a shipment nobody will describe',
        ],
    },
    {
        id: 'ashford',
        region: 'The Cinder Plains',
        regionDesc: 'a scorched expanse of volcanic rock and ash fields stretching between two mountain ranges, dotted with obsidian spires and the bones of dead dragons',
        town: 'Ashford',
        townDesc: 'a mining boomtown built around a rich vein of bloodstone, its streets choked with fortune-seekers and the company guards who watch them',
        tavern: 'The Ember & Tongs',
        tavernDesc: 'a broad miners\' hall that doubles as a forge waiting room, its tables carved with the names of those who struck it rich  -  and those who didn\'t',
        hooks: [
            'The deep vein  -  miners broke into a sealed chamber and something sealed it from the inside for a reason',
            'Company trouble  -  the Bloodstone Company is overworking its conscripted labour and someone needs to know',
            'Dragon bones  -  a collector is paying absurd sums for intact dragon teeth, which has sent fools into the wastes',
        ],
    },
    {
        id: 'highmark',
        region: 'The Greymount Highlands',
        regionDesc: 'a highland expanse of windswept moors, cairn-dotted ridgelines, and deep glacial valleys where old kingdoms lie buried under the peat',
        town: 'Highmark',
        townDesc: 'a crossroads town at the summit of the only reliable pass through the mountains, its economy built entirely on toll revenue and traveller hospitality',
        tavern: 'The Wayward Ram',
        tavernDesc: 'a broad highland inn with a roaring central hearth, its common room full of merchants, pilgrims, and soldiers all waiting for the same weather to pass',
        hooks: [
            'The pass is closing  -  an early blizzard is coming and a caravan is three days overdue',
            'Cairn walkers  -  the ancient burial mounds have been disturbed and the dead are not resting',
            'A noble\'s ransom  -  a young lord was taken off the road and his family is too proud to involve the crown',
        ],
    },
    {
        id: 'dunmere',
        region: 'The Dunwater Fens',
        regionDesc: 'a vast wetland of shallow lakes, reed beds, and floating peat islands that shift season to season  -  maps are useless here',
        town: 'Dunmere',
        townDesc: 'a town built on a rare slab of solid ground above the fens, its houses connected by a web of rope bridges, its people deeply suspicious of outsiders',
        tavern: 'The Bogwitch',
        tavernDesc: 'a creaking, leaning tavern that smells of marsh gas and smoked eel, its landlady a retired hedge witch who charges double for anything after dark',
        hooks: [
            'The paths are moving  -  the fen routes that locals have used for generations no longer lead where they should',
            'Will-o-wisps  -  travellers are being led into the deep fens and not returning; the wisps have never been this bold',
            'An old shrine  -  a half-submerged temple has surfaced after a dry season and factions are already fighting over it',
        ],
    },
    {
        id: 'ironcross',
        region: 'The Iron Steppe',
        regionDesc: 'a vast flat grassland of red iron-rich soil where nomadic clans ride in circles around the few permanent settlements, and the wind never stops',
        town: 'Ironcross',
        townDesc: 'a walled trade post at the intersection of two ancient steppe roads, its population a volatile mix of settlers, clan traders, and imperial garrison soldiers',
        tavern: 'The Red Stirrup',
        tavernDesc: 'a wide-open travellers\' hall built for high volume, its walls decorated with clan banners and its staff armed and unimpressed',
        hooks: [
            'Clan war brewing  -  two steppe clans are feuding over grazing rights and both have approached the garrison for support',
            'The iron sickness  -  a blight is killing horses across three clans\' territories and nobody knows its source',
            'A sealed vault  -  an imperial survey team found a pre-empire structure buried in the steppe and promptly disappeared',
        ],
    },
];

function pickWorld() {
    return WORLDS[Math.floor(Math.random() * WORLDS.length)];
}

// Ordered list matching the 1-6 numbering shown in the creation prompt
const WORLDS_BY_ID = {
    1: WORLDS.find(w => w.id === 'thornvale'),
    2: WORLDS.find(w => w.id === 'saltmere'),
    3: WORLDS.find(w => w.id === 'ashford'),
    4: WORLDS.find(w => w.id === 'highmark'),
    5: WORLDS.find(w => w.id === 'dunmere'),
    6: WORLDS.find(w => w.id === 'ironcross'),
};

// ── System Prompts ─────────────────────────────────────────────────────────────

function buildCreationPrompt(state) {
    // Roll ONCE and cache in state so re-renders don't re-roll
    if (!state.charCreation.scoreRolls) {
        state.charCreation.scoreRolls = Array.from({ length: 6 }, () => roll4d6dropLowest());
    }
    const scoreRolls = state.charCreation.scoreRolls;
    const rollLines  = scoreRolls
        .map((r, i) => `Roll ${i+1}: ${r.total}  (rolled ${r.rolls.join(',')}, kept ${r.kept.join('+')})`)
        .join('\n  ');

    return (`
You are the Game Master. The player is building their D&D 5e character.
Complete ALL FOUR STEPS before starting the adventure.

-- STEP 1  -  ABILITY SCORES --
The dice have ALREADY been rolled using real 4d6-drop-lowest. Present these EXACT results:
  ${rollLines}
Ask the player to assign each roll to STR / DEX / CON / INT / WIS / CHA.
Once assigned, emit set_scores in a fenced block. Do NOT show raw JSON outside the fences:
\`\`\`game
{ "type": "set_scores", "str": 12, "dex": 16, "con": 13, "int": 10, "wis": 14, "cha": 8 }
\`\`\`

-- STEP 2  -  RACE --
Present these options with bonuses and signature traits:
  Human (+1 all), High Elf (+2 DEX +1 INT), Wood Elf (+2 DEX +1 WIS),
  Hill Dwarf (+2 CON +1 WIS), Mountain Dwarf (+2 CON +2 STR),
  Lightfoot Halfling (+2 DEX +1 CHA), Stout Halfling (+2 DEX +1 CON),
  Forest Gnome (+2 INT +1 DEX), Rock Gnome (+2 INT +1 CON),
  Tiefling (+2 CHA +1 INT), Dragonborn (+2 STR +1 CHA),
  Half-Elf (+2 CHA +1 to two of your choice), Half-Orc (+2 STR +1 CON), Aasimar (+2 CHA +1 WIS)
Once chosen, emit set_race inside fences. For half-elf, include bonusStat1 and bonusStat2:
\`\`\`game
{ "type": "set_race", "race": "High Elf" }
\`\`\`

-- STEP 3  -  CLASS --
Present all 12 classes with hit dice and role flavour:
  Barbarian (d12 - primal warrior), Bard (d8 - arcane performer),
  Cleric (d8 - divine champion), Druid (d8 - nature mystic),
  Fighter (d10 - weapon master), Monk (d8 - martial artist),
  Paladin (d10 - holy crusader), Ranger (d10 - wilderness hunter),
  Rogue (d8 - shadow operative), Sorcerer (d6 - innate mage),
  Warlock (d8 - eldritch pact), Wizard (d6 - scholarly caster)
Choose 2 class-appropriate starting skill proficiencies and emit inside fences:
\`\`\`game
{ "type": "set_class", "class": "Wizard", "skills": ["Arcana", "History"] }
\`\`\`

-- STEP 4  -  NAME --
Ask for the character's name (and optionally a brief backstory hook), then emit inside fences:
\`\`\`game
{ "type": "rename", "name": "Lyra Ashveil" }
\`\`\`

-- STEP 5  -  STARTING REGION --
Present the following six regions and ask the player to choose one:

  1. The Thornwood Marches  - a vast mist-choked forest of black thorns and ancient ruins
  2. The Salthallow Coast   - a jagged coastline of hidden coves and smuggler country
  3. The Cinder Plains      - a scorched volcanic expanse with mining boomtowns
  4. The Greymount Highlands - windswept moorland and glacial valleys with buried kingdoms
  5. The Dunwater Fens      - shifting wetlands of floating peat and will-o-wisps
  6. The Iron Steppe        - a vast flat grassland where nomadic clans ride

Once the player chooses, emit set_world then immediately emit the final creation block.
\`\`\`game
{ "type": "set_world", "worldIndex": 2 }
\`\`\`

Then emit ALL of the following in a SINGLE fenced block. Replace items/gold with class-appropriate gear.
creation_complete MUST be in the array or the game will not start.
Do NOT emit quest_add - the quest system handles this automatically.
\`\`\`game
[
  { "type": "rename", "name": "Cody" },
  { "type": "set_world", "worldIndex": 2 },
  { "type": "creation_complete" },
  { "type": "gold_change", "amount": 15 },
  { "type": "item_add", "item": "Quarterstaff" },
  { "type": "item_add", "item": "Spellbook" },
  { "type": "item_add", "item": "Component Pouch" },
  { "type": "item_add", "item": "Health Potion" }
]
\`\`\`
Do NOT start the adventure or describe any scene yet. That happens next turn.
`).trim();
}

function buildOpeningPrompt(state) {
    const w = state.flags.world;
    const p = state.player;
    const hook = w.hooks[Math.floor(Math.random() * w.hooks.length)];

    // Store the chosen hook so it stays consistent after this turn
    if (!state.flags.openingHook) state.flags.openingHook = hook;
    const usedHook = state.flags.openingHook;

    return `
-- OPENING SCENE --
The adventure begins NOW. Do not do any more character creation.

WORLD: ${w.region}
${w.regionDesc}.

TOWN: ${w.town}
${w.townDesc}.

TAVERN: ${w.tavern}
${w.tavernDesc}.

CHARACTER: ${p.name}, a level ${p.level} ${p.race} ${p.class ? p.class.charAt(0).toUpperCase() + p.class.slice(1) : ''}.

OPENING HOOK (the rumour already in the air when the player sits down):
${usedHook}

YOUR JOB THIS TURN:
* Set the scene inside ${w.tavern} in vivid second-person prose (4-8 sentences).
* Establish the atmosphere, a few notable NPCs present, and the ambient mood.
* Weave in the hook naturally  -  overheard conversation, a notice board, a stranger's muttered warning.
* End with 4-6 numbered action choices for the player.
* Do NOT resolve anything yet. This is the opening scene only.
`.trim();
}




// ── Combat Engine ─────────────────────────────────────────────────────────────
// The module owns all combat math. The AI narrates, emits events, and describes
// outcomes — but the actual d20 rolls, damage, and tracking happen here.
//
// Combat state shape:
// state.combat = {
//   active:     true,
//   round:      1,
//   enemies:    [{ name, hp, maxHp, ac, cr, attackBonus, damageDice }],
//   initiative: [{ name, roll, isPlayer }],  // sorted high to low
//   log:        string[]   // last few roll results for GM context
// }

function startCombat(state, enemies) {
    // Roll initiative for player and all enemies
    const playerInit = d20().total + mod(state.player.dex);
    const initiatives = [{ name: state.player.name, roll: playerInit, isPlayer: true }];

    for (const e of enemies) {
        const eInit = d20().total + Math.floor((e.cr || 0));
        initiatives.push({ name: e.name, roll: eInit, isPlayer: false });
    }
    initiatives.sort((a, b) => b.roll - a.roll);

    state.combat = {
        active:     true,
        round:      1,
        enemies:    enemies.map(e => ({
            name:        e.name,
            hp:          e.hp,
            maxHp:       e.hp,
            ac:          e.ac,
            cr:          e.cr || 0,
            attackBonus: Math.round((e.cr || 0) * 0.5) + 2,  // approx CR to attack bonus
            damageDice:  e.damageDice || '1d6',
        })),
        initiative: initiatives,
        log:        [`Round 1 initiative: ${initiatives.map(i => `${i.name}(${i.roll})`).join(', ')}`],
    };
    return state.combat;
}

function endCombat(state) {
    state.combat    = null;
    state.deathSaves = null;
}

// Roll a player attack against a specific enemy
function resolvePlayerAttack(state, enemyName, weaponName) {
    const p       = state.player;
    const enemy   = state.combat?.enemies.find(e => e.name.toLowerCase().includes(enemyName.toLowerCase()));
    if (!enemy) return null;

    const w       = WEAPONS[weaponName] || null;
    const sMod    = w ? weaponStatMod(w, p) : mod(p.str);
    const prof    = pb(p.level);
    const atkRoll = d20();
    const total   = atkRoll.total + sMod + prof;
    const crit    = atkRoll.total === 20;
    const miss    = atkRoll.total === 1;
    const hit     = crit || (!miss && total >= enemy.ac);

    postRoll(
        `${p.name} attacks ${enemy.name} (AC ${enemy.ac})`,
        { display: `[d20: ${atkRoll.total} + ${sMod + prof} = ${total}] -- ${crit ? 'CRITICAL HIT' : hit ? 'HIT' : miss ? 'CRITICAL MISS' : 'MISS'}` }
    );

    let damage = 0;
    let dmgDisplay = '';
    if (hit) {
        const dice    = w ? w.dice : '1d6';
        const dmgRoll = roll(crit ? dice + '+' + dice : dice);
        damage        = Math.max(1, dmgRoll.total + sMod);
        enemy.hp      = Math.max(0, enemy.hp - damage);
        dmgDisplay    = `${dmgRoll.display}+${sMod}=${damage} ${w ? w.type : 'Bludgeoning'}`;
        postRoll(
            `Damage to ${enemy.name}${crit ? ' (CRIT)' : ''}`,
            { display: `${dmgDisplay} -- ${enemy.hp}/${enemy.maxHp} HP remaining` }
        );
    }

    const result = {
        attacker: p.name, target: enemy.name,
        atkRoll: atkRoll.total, modifier: sMod + prof, total,
        targetAC: enemy.ac, hit, crit, miss, damage, dmgDisplay,
        enemyHp: enemy.hp, enemyMaxHp: enemy.maxHp, enemyDead: enemy.hp <= 0,
    };

    const line = `${p.name} attacks ${enemy.name}: d20(${atkRoll.total})+${sMod+prof}=${total} vs AC${enemy.ac} - ` +
        (crit ? `CRITICAL HIT! ${dmgDisplay}` : hit ? `HIT ${dmgDisplay}` : `MISS`) +
        (result.enemyDead ? ` - ${enemy.name} DEFEATED` : ` (${enemy.hp}/${enemy.maxHp}HP)`);
    state.combat.log.push(line);
    if (state.combat.log.length > 6) state.combat.log.shift();

    return result;
}

// Roll an enemy attack against the player
function resolveEnemyAttack(state, enemyName) {
    const p     = state.player;
    const enemy = state.combat?.enemies.find(e =>
        e.name.toLowerCase().includes(enemyName.toLowerCase()) && e.hp > 0);
    if (!enemy) return null;

    const atkRoll = d20();
    const total   = atkRoll.total + enemy.attackBonus;
    const crit    = atkRoll.total === 20;
    const miss    = atkRoll.total === 1;
    const hit     = crit || (!miss && total >= p.ac);

    postRoll(
        `${enemy.name} attacks ${p.name} (AC ${p.ac})`,
        { display: `[d20: ${atkRoll.total} + ${enemy.attackBonus} = ${total}] -- ${crit ? 'CRITICAL HIT' : hit ? 'HIT' : miss ? 'CRITICAL MISS' : 'MISS'}` }
    );

    let damage = 0;
    if (hit) {
        const dmgRoll = roll(crit ? enemy.damageDice + '+' + enemy.damageDice : enemy.damageDice);
        damage = Math.max(1, dmgRoll.total);
        p.hp   = Math.max(0, p.hp - damage);
        postRoll(
            `${enemy.name} deals damage`,
            { display: `${dmgRoll.display} = ${damage} -- ${p.name} at ${p.hp}/${p.maxHp} HP` }
        );
    }

    if (p.hp <= 0 && !state.deathSaves) {
        state.deathSaves = { successes: 0, failures: 0 };
        state.conditions = [...(state.conditions || []).filter(c => c !== 'Unconscious'), 'Unconscious'];
        postRoll(`${p.name} is DOWN`, { display: `Death saving throws begin` });
    }

    const result = {
        attacker: enemy.name, target: p.name,
        atkRoll: atkRoll.total, total, targetAC: p.ac,
        hit, crit, miss, damage,
        playerHp: p.hp, playerMaxHp: p.maxHp, playerDown: p.hp <= 0,
    };

    const line = `${enemy.name} attacks ${p.name}: d20(${atkRoll.total})+${enemy.attackBonus}=${total} vs AC${p.ac} - ` +
        (crit ? `CRITICAL HIT! ${damage}dmg` : hit ? `HIT ${damage}dmg` : `MISS`) +
        (result.playerDown ? ' - PLAYER DOWN' : ` (${p.hp}/${p.maxHp}HP)`);
    state.combat.log.push(line);
    if (state.combat.log.length > 6) state.combat.log.shift();

    return result;
}

// Roll a death saving throw
function resolveDeathSave(state) {
    if (!state.deathSaves) return null;
    const r       = d20();
    const success = r.total >= 10;
    const natural = r.total === 20;

    postRoll('Death Saving Throw', { display: `[d20: ${r.total}] -- ${r.total >= 10 ? 'SUCCESS' : 'FAILURE'}${r.total === 20 ? ' (Nat 20!)' : r.total === 1 ? ' (Nat 1 - two failures!)' : ''}` });

    if (natural) {
        state.player.hp = 1;
        state.deathSaves = null;
        state.conditions = (state.conditions || []).filter(c => c !== 'Unconscious');
        return { roll: r.total, success: true, natural20: true, message: 'Nat 20 - regain 1 HP!' };
    }
    if (r.total === 1) {
        // Nat 1 = two failures
        state.deathSaves.failures += 2;
    } else if (success) {
        state.deathSaves.successes += 1;
    } else {
        state.deathSaves.failures += 1;
    }

    const dead   = state.deathSaves.failures >= 3;
    const stable = state.deathSaves.successes >= 3;

    if (dead) {
        state.conditions = [...(state.conditions || []).filter(c => c !== 'Unconscious'), 'Dead'];
        state.deathSaves = null;
    } else if (stable) {
        state.deathSaves = null;
        state.conditions = (state.conditions || []).filter(c => c !== 'Unconscious');
    }

    return {
        roll:       r.total,
        success,
        successes:  state.deathSaves?.successes ?? (stable ? 3 : 0),
        failures:   state.deathSaves?.failures  ?? (dead   ? 3 : 0),
        stable,
        dead,
        message:    r.total === 1   ? 'Nat 1 - two failures!'
                  : stable          ? 'Stable!'
                  : dead            ? 'Dead.'
                  : success         ? `Success (${state.deathSaves?.successes}/3)`
                  : `Failure (${state.deathSaves?.failures}/3)`,
    };
}

// Build the combat status line injected into the system prompt every combat turn
function buildCombatBlock(state) {
    if (!state.combat?.active) return null;

    const c     = state.combat;
    const alive = c.enemies.filter(e => e.hp > 0);
    const dead  = c.enemies.filter(e => e.hp <= 0);

    const initOrder = c.initiative
        .map(i => `${i.name}(${i.roll})${i.isPlayer ? '*' : ''}`)
        .join(' > ');

    const enemyLines = alive.map(e =>
        `  ${e.name}: HP ${e.hp}/${e.maxHp}  AC ${e.ac}  ATK +${e.attackBonus}  DMG ${e.damageDice}`
    ).join('\n');

    const deadLines = dead.length
        ? `  Defeated: ${dead.map(e => e.name).join(', ')}`
        : '';

    const deathLine = state.deathSaves
        ? `\nDEATH SAVES: ${state.deathSaves.successes} successes / ${state.deathSaves.failures} failures (need 3 to stabilize)`
        : '';

    const logLines = c.log.slice(-4).map(l => `  ${l}`).join('\n');

    return [
        `COMBAT ACTIVE - Round ${c.round}`,
        `Initiative: ${initOrder}  (* = player)`,
        ``,
        `ENEMIES:`,
        enemyLines,
        deadLines,
        deathLine,
        ``,
        `RECENT ROLLS:`,
        logLines,
        ``,
        `COMBAT RULES THIS TURN:`,
        `- Use the enemy stats above EXACTLY. Do not invent AC or HP.`,
        `- Emit combat_attack for each attack that happens this turn.`,
        `- If the player reaches 0 HP emit death_save next turn instead of actions.`,
        `- If all enemies are at 0 HP emit combat_end.`,
    ].filter(l => l !== undefined).join('\n');
}


// ── Time Engine ───────────────────────────────────────────────────────────────
// Tracks 24hr clock and day count. Advances automatically each turn.
// Controls rest legality and encounter probability.
//
// state.time = { hour: 0-23, day: 1 }
// MINUTES_PER_TURN: how much time passes each narrative turn (default 30min)

const MINUTES_PER_TURN = 30;   // adjust if game feels too fast/slow
const LONG_REST_HOURS  = 8;    // hours required for a long rest
const SHORT_REST_HOURS = 1;    // hours required for a short rest

// Valid long rest window: 20:00 - 06:00 (can only long rest at night/dawn)
// Short rest: any time outside combat
function canLongRest(state) {
    if (state.combat?.active) return { ok: false, reason: 'Cannot rest during combat.' };
    const h = state.time?.hour ?? 8;
    if (h >= 6 && h < 20) return { ok: false, reason: `It is ${formatTime(state.time)} - too early to make camp. Wait until evening.` };
    if (state.flags.lastLongRest) {
        const hoursSince = hoursBetween(state.flags.lastLongRest, state.time);
        if (hoursSince < 16) return { ok: false, reason: `You rested ${Math.floor(hoursSince)}hrs ago - need at least 16hrs between long rests.` };
    }
    return { ok: true };
}

function canShortRest(state) {
    if (state.combat?.active) return { ok: false, reason: 'Cannot rest during combat.' };
    if (state.flags.lastShortRest) {
        const hoursSince = hoursBetween(state.flags.lastShortRest, state.time);
        if (hoursSince < 1) return { ok: false, reason: 'You need at least 1 hour between short rests.' };
    }
    return { ok: true };
}

function formatTime(time) {
    if (!time) return '08:00';
    const h = time.hour ?? 8;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12  = h % 12 || 12;
    return `${h12}:00 ${ampm}`;
}

function timeOfDay(time) {
    const h = time?.hour ?? 8;
    if (h >= 5  && h < 8)  return 'Dawn';
    if (h >= 8  && h < 12) return 'Morning';
    if (h >= 12 && h < 14) return 'Noon';
    if (h >= 14 && h < 17) return 'Afternoon';
    if (h >= 17 && h < 20) return 'Evening';
    if (h >= 20 && h < 22) return 'Dusk';
    return 'Night';
}

function advanceTime(state, minutes) {
    if (!state.time) state.time = { hour: 8, day: 1 };
    const totalMins  = (state.time.hour * 60) + (minutes || MINUTES_PER_TURN);
    state.time.hour  = Math.floor(totalMins / 60) % 24;
    const daysPassed = Math.floor(totalMins / (24 * 60));
    if (daysPassed > 0) state.time.day = (state.time.day || 1) + daysPassed;
}

function hoursBetween(savedTime, currentTime) {
    if (!savedTime || !currentTime) return 99;
    const savedTotal   = (savedTime.day   || 1) * 24 + (savedTime.hour   || 0);
    const currentTotal = (currentTime.day || 1) * 24 + (currentTime.hour || 0);
    return currentTotal - savedTotal;
}

function buildTimeBlock(state) {
    const t    = state.time || { hour: 8, day: 1 };
    const tod  = timeOfDay(t);
    const fmt  = formatTime(t);
    const canLR = canLongRest(state);
    const canSR = canShortRest(state);
    return `TIME: Day ${t.day}  ${fmt}  (${tod})  |  Long rest: ${canLR.ok ? 'available' : 'unavailable'}  Short rest: ${canSR.ok ? 'available' : 'unavailable'}`;
}

// ── Companion Block ───────────────────────────────────────────────────────────
// Reads the ST character card (systemText) and injects it as a companion NPC.
// The companion travels with the player, is roleplayed by the GM, and has their
// own HP tracked in state.companion.

function buildCompanionBlock(systemText, state) {
    if (!systemText || !systemText.trim()) return null;

    // Extract name from the card - ST puts "Name: X" or just the name at the top
    const nameMatch = systemText.match(/^(?:Name:\s*)?([^\r\n]{1,40})/i);
    const name = nameMatch ? nameMatch[1].replace(/^Name:\s*/i, '').trim() : 'Companion';

    // Don't treat generic/placeholder names as real companions
    if (!name || name.toLowerCase().includes('assistant') || name.toLowerCase() === 'lore') {
        return null;
    }

    // Seed companion HP if not already set
    if (!state.companion) {
        state.companion = {
            name,
            hp:    20,
            maxHp: 20,
        };
    } else if (state.companion.name !== name) {
        // Character card changed - new companion
        state.companion = { name, hp: 20, maxHp: 20 };
    }

    const c = state.companion;
    const hpBar = `${c.hp}/${c.maxHp}`;

    // Trim the card to a reasonable length for injection
    const cardText = systemText.trim().slice(0, 800);

    return [
        `COMPANION: ${c.name} (HP: ${hpBar})`,
        `The following character card describes your companion who travels with the player.`,
        `Roleplay them consistently based on their personality. They act on their own turn in combat.`,
        `When the companion takes damage emit: { "type": "companion_hp", "amount": -N }`,
        `When the companion heals emit: { "type": "companion_hp", "amount": +N }`,
        `---`,
        cardText,
        `---`,
    ].join('\n');
}

// ── Quest Anchor ──────────────────────────────────────────────────────────────
// Injected into every system prompt so the model always knows the current
// quest stage, what triggers advancement, and what the reward is.

function buildQuestAnchor(state) {
    const qt = state.flags?.activeQuest;
    if (!qt || qt.done || qt.failed) {
        return 'ACTIVE QUEST: None. Watch for new quest opportunities in the scene.';
    }

    const stage   = qt.stage || 0;
    const current = qt.stages[stage];
    const isLast  = stage === qt.stages.length - 1;
    const reward  = qt.reward;

    const stageLines = qt.stages.map((s, i) => {
        const marker = i < stage ? '[DONE]' : i === stage ? '[CURRENT]' : '[LOCKED]';
        return `  ${marker} Stage ${i + 1}: ${s.objective}`;
    }).join('\n');

    return [
        `ACTIVE QUEST: ${qt.title}`,
        `  Given by: ${qt.giver} at ${qt.giverLocation}`,
        `  Reward on completion: ${reward.xp}xp  ${reward.gold}gp  ${reward.item ? '+ ' + reward.item : ''}`,
        `  Fail condition: ${qt.failCondition}`,
        ``,
        stageLines,
        ``,
        `CURRENT OBJECTIVE (Stage ${stage + 1}): ${current?.objective}`,
        `  GM HINT: ${current?.hint}`,
        ``,
        isLast
            ? `This is the FINAL stage. When resolved, emit quest_complete.`
            : `When this stage resolves, emit quest_stage to advance. Do NOT skip stages.`,
        `quest_stage format: { "type": "quest_stage" }`,
        `quest_complete format: { "type": "quest_complete", "title": "${qt.title}" }`,
        `quest_fail format: { "type": "quest_fail", "title": "${qt.title}" }`,
    ].join('\n');
}

const GM_RULES = `
You are the Game Master for a D&D 5e text-based RPG.
The stat block and world anchor above are the single source of truth. Never contradict them.

=====================================================================
OUTPUT FORMAT - FOLLOW EXACTLY EVERY TURN
=====================================================================

NON-COMBAT TURNS:
  [One paragraph. Max 4 sentences. Second person. No exceptions.]

  1. Action one
  2. Action two
  3. Action three
  4. Action four

COMBAT TURNS - STRICT STRUCTURE:
  The COMBAT BLOCK above shows live enemy HP, AC, and recent rolls computed by the engine.
  Use those exact numbers. Do not invent HP or AC.

  Each combat turn format:
  ROUND [N]
  [Enemy action - 1 sentence. Emit enemy_attack for the enemy whose turn it is.]
  [Player action result - 1 sentence based on the roll the engine computed.]
  [One sentence consequence.]

  1. Attack with [weapon] - emit combat_attack {"weapon":"X","target":"Y"}
  2. Cast [spell] (uses 1 slot) - emit use_spell_slot + enemy_hp for damage
  3. Dash / Disengage / Dodge - no attack this turn
  4. Use item - emit item_remove
  5. [Other]

  COMBAT EVENTS (the engine rolls the dice - just emit the trigger):
  Start combat:  {"type":"combat_start","enemies":[{"name":"Goblin","hp":7,"ac":15,"cr":0.25,"damageDice":"1d6"}]}
  Player attack: {"type":"combat_attack","weapon":"Longsword","target":"Goblin"}
  Enemy attack:  {"type":"enemy_attack","attacker":"Goblin"}
  Direct damage: {"type":"enemy_hp","name":"Goblin","amount":-8}
  Next round:    {"type":"next_round"}
  End combat:    {"type":"combat_end"}
  Death save:    {"type":"death_save"}  (emit when player is at 0 HP instead of action choices)

=====================================================================
MANDATORY RULES
=====================================================================

WORLD LOCK
  You are in [WORLD]. Never reference Waterdeep, Baldur's Gate, Faerun,
  or any named D&D setting. All locations, NPCs, and lore must fit the
  world described in the stat block. Invent names that fit the region.

EVENTS ARE MANDATORY - NOT OPTIONAL
  Every time something changes in the game world, you MUST emit an event.
  Missing events = broken game. No exceptions:
  - Player picks up ANY item → item_add (includes quest rewards, loot, found objects)
  - Player loses/uses ANY item → item_remove
  - HP changes for ANY reason → hp_change
  - Gold changes → gold_change
  - Spell slot used → use_spell_slot
  - Quest starts → quest_add
  - Quest ends → quest_complete
  - Condition applied/removed → condition_add / condition_remove
  - Weapon equipped → equip_weapon
  - XP earned → xp_gain (use monster CR x 200 for kills)

DICE ROLLS
  Always roll and show the result. Format: d20 + MOD = TOTAL vs DC/AC.
  Never describe an action resolving without showing the roll first.
  Failed rolls have real consequences - do not soften them.

LOOT
  When an enemy is defeated or a container is searched:
  - Always award something (gold at minimum)
  - Named items found in the world MUST trigger item_add
  - Magic items: emit item_add with the exact item name

COMBAT MATH
  Use the stat block values exactly:
  - Player attack = d20 + weapon stat mod + proficiency bonus vs enemy AC
  - Enemy attack = d20 + enemy attack bonus vs player AC [from stat block]
  - Damage = weapon/spell dice + modifier
  - Track enemy HP yourself across turns - it does not reset

EVENT BLOCK FORMAT - emit after every response:
\`\`\`game
[
  { "type": "hp_change",     "amount": -8 },
  { "type": "xp_gain",       "amount": 100 },
  { "type": "item_add",      "item": "Obsidian Amulet" },
  { "type": "gold_change",   "amount": 25 },
  { "type": "use_spell_slot","level": 1 },
  { "type": "quest_complete","title": "Quest Name" }
]
\`\`\`
Omit the block only if absolutely nothing changed this turn.
`.trim();

function buildWeaponHtml(state) {
    const p = state.player;
    if (!p) return '';

    const renderWeapon = (name, slot) => {
        if (!name) {
            return `<div style="font-size:12px;color:#555;font-style:italic;">${slot}: none</div>`;
        }
        const atk = weaponAttackStr(name, p, true);
        if (!atk) {
            // Unknown weapon (magic item, custom) — just show name
            return `<div style="font-size:12px;color:#ccc;padding:2px 0;">
                <span style="color:#ffb74d;">&#x2694;</span>
                <b style="color:#ffe082;">${name}</b>
                <span style="color:#666;font-size:10px;margin-left:4px;">${slot}</span>
            </div>`;
        }
        const rangeStr = atk.range > 0 ? `<span style="color:#888;font-size:10px;margin-left:4px;">range ${atk.range}ft</span>` : '';
        const propsStr = atk.props.length
            ? `<div style="font-size:10px;color:#666;margin-left:12px;">${atk.props.join(' · ')}</div>`
            : '';
        return `<div style="padding:3px 0;border-bottom:1px solid #1a1a2e;">
            <span style="color:#ffb74d;">&#x2694;</span>
            <b style="color:#ffe082;margin-left:4px;">${name}</b>
            <span style="color:#666;font-size:10px;margin-left:4px;">${slot}</span>
            <div style="font-size:11px;color:#aaa;margin-left:12px;">
                <span style="color:#ef9a9a;">${atk.toHit} to hit</span>
                <span style="color:#555;margin:0 4px;">|</span>
                <span style="color:#a5d6a7;">${atk.damage}</span>
                ${rangeStr}
            </div>
            ${propsStr}
        </div>`;
    };

    const offhandName = state.offhand;
    const armorName   = state.armor;
    const shield      = state.flags?.shield;

    const offhandDisplay = shield
        ? `<div style="font-size:12px;color:#90caf9;padding:2px 0;"><span style="color:#90caf9;">&#x1F6E1;</span> Shield (+2 AC)</div>`
        : renderWeapon(offhandName, 'off-hand');

    const armorDisplay = armorName
        ? `<div style="font-size:12px;color:#90caf9;padding:2px 0;"><span>&#x1F455;</span> <b style="color:#90caf9;">${armorName}</b> <span style="color:#666;font-size:10px;">AC ${p.ac}</span></div>`
        : '';

    return `<details style="margin-top:6px;" open>
    <summary style="cursor:pointer;font-size:12px;color:#888;">Equipment</summary>
    <div style="margin-top:4px;">
        ${renderWeapon(state.equipped, 'main hand')}
        ${offhandDisplay}
        ${armorDisplay}
    </div>
</details>`;
}

function buildSpellsHtml(state) {
    const cls = state.player?.class?.toLowerCase();
    const spells = SPELL_LISTS[cls];
    const slots  = state.spellSlots;

    if (!spells || (!spells.cantrips.length && !spells.lvl1.length)) return '';

    const known = state.flags.knownSpells || {};

    const slotBadge = (lvl) => {
        if (!slots) return '';
        if (slots.pact) {
            const pk = slots.pact;
            return `<span style="background:#4a148c;color:#e1bee7;border-radius:3px;padding:0 4px;font-size:10px;margin-left:4px;">Pact L${pk.level}: ${pk.count - pk.used}/${pk.count}</span>`;
        }
        if (slots[lvl]) {
            const s = slots[lvl];
            const color = s.used >= s.max ? '#555' : '#4a148c';
            return `<span style="background:${color};color:#e1bee7;border-radius:3px;padding:0 4px;font-size:10px;margin-left:4px;">${s.max - s.used}/${s.max}</span>`;
        }
        return '';
    };

    const spellRow = (name, lvl) => {
        const prepared = known[name];
        const dot = prepared
            ? `<span style="color:#ce93d8;margin-right:4px;">&#x25CF;</span>`
            : `<span style="color:#444;margin-right:4px;">&#x25CB;</span>`;
        return `<div style="font-size:12px;color:#ccc;padding:1px 0;">${dot}${name}</div>`;
    };

    let html = `<details style="margin-top:6px;">
    <summary style="cursor:pointer;font-size:12px;color:#888;">Spells</summary>
    <div style="margin-top:4px;">`;

    if (spells.cantrips.length) {
        html += `<div style="font-size:11px;color:#7986cb;margin:4px 0 2px;">Cantrips (at will)</div>`;
        html += spells.cantrips.map(s => spellRow(s, 0)).join('');
    }
    if (spells.lvl1.length) {
        html += `<div style="font-size:11px;color:#7986cb;margin:4px 0 2px;">Level 1 ${slotBadge(1)}</div>`;
        html += spells.lvl1.map(s => spellRow(s, 1)).join('');
    }
    if (spells.lvl2.length && (state.player?.level || 1) >= 3) {
        html += `<div style="font-size:11px;color:#7986cb;margin:4px 0 2px;">Level 2 ${slotBadge(2)}</div>`;
        html += spells.lvl2.map(s => spellRow(s, 2)).join('');
    }

    html += `</div></details>`;
    return html;
}

// ── Floating HUD Window ───────────────────────────────────────────────────────
// Injects a draggable, resizable overlay into the main ST window.
// Toggled by the Float button in the panel HUD or window._simpleLoreFloatToggle().

function initFloatingHud() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('sl-float')) return; // already exists

    const win = document.createElement('div');
    win.id = 'sl-float';
    win.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        width: 280px;
        max-height: 80vh;
        overflow-y: auto;
        background: #0d0d1a;
        border: 1px solid #333;
        border-radius: 8px;
        box-shadow: 0 4px 24px rgba(0,0,0,0.7);
        z-index: 9999;
        display: none;
        font-family: monospace;
        scrollbar-width: thin;
        scrollbar-color: #333 #0d0d1a;
    `;

    // Drag handle
    const header = document.createElement('div');
    header.style.cssText = `
        padding: 6px 10px;
        background: #1a1a2e;
        border-bottom: 1px solid #333;
        border-radius: 8px 8px 0 0;
        cursor: move;
        display: flex;
        justify-content: space-between;
        align-items: center;
        user-select: none;
    `;
    header.innerHTML = `
        <span style="font-size:12px;color:#ce93d8;font-weight:bold;">&#x2694; Simple Lore</span>
        <button id="sl-float-close" style="background:none;border:none;color:#888;cursor:pointer;font-size:14px;padding:0;">&#x2715;</button>
    `;

    const body = document.createElement('div');
    body.id   = 'sl-float-body';
    body.style.padding = '8px 10px';

    win.appendChild(header);
    win.appendChild(body);
    document.body.appendChild(win);

    // Close button
    document.getElementById('sl-float-close').onclick = () => { win.style.display = 'none'; };

    // Drag logic
    let dragging = false, ox = 0, oy = 0;
    header.addEventListener('mousedown', e => {
        dragging = true;
        ox = e.clientX - win.offsetLeft;
        oy = e.clientY - win.offsetTop;
        e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
        if (!dragging) return;
        win.style.left = (e.clientX - ox) + 'px';
        win.style.top  = (e.clientY - oy) + 'px';
        win.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => { dragging = false; });

    // Toggle function
    window._simpleLoreFloatToggle = () => {
        win.style.display = win.style.display === 'none' ? 'block' : 'none';
        if (win.style.display === 'block') {
            const el = document.getElementById('sl-float-body');
            if (el) el.innerHTML = buildHudHtml(_hudState);
        }
    };

    // Keep float window in sync with HUD state
    window._simpleLoreFloatRefresh = () => {
        if (win.style.display === 'none') return;
        const el = document.getElementById('sl-float-body');
        if (el) el.innerHTML = buildHudHtml(_hudState);
    };
}

// ── HUD ───────────────────────────────────────────────────────────────────────
// Cached state reference so the panel can live-update without waiting for IDB.
let _hudState = null;
let _hudInterval = null;

function buildHudHtml(state) {
    if (!state || !state.player) {
        return `<div style="color:#888;font-style:italic;padding:8px;">
            Waiting for game to start...
        </div>`;
    }

    const p     = state.player;
    const prof  = pb(p.level);
    const hpPct = Math.max(0, Math.min(100, Math.round((p.hp / p.maxHp) * 100)));
    const xpLeft = xpToNextLevel(p.xp);
    const xpPct  = xpLeft !== null
        ? Math.round((p.xp / XP_THRESHOLDS[p.level + 1]) * 100)
        : 100;

    const hpColor  = hpPct > 60 ? '#4caf50' : hpPct > 25 ? '#ff9800' : '#f44336';
    const stats    = ['str','dex','con','int','wis','cha'];
    const statGrid = stats.map(s => `
        <div style="text-align:center;background:#1a1a2e;border-radius:4px;padding:4px 2px;">
            <div style="font-size:10px;color:#888;text-transform:uppercase;">${s}</div>
            <div style="font-size:14px;font-weight:bold;color:#e0e0ff;">${p[s]}</div>
            <div style="font-size:11px;color:#aaa;">${sign(mod(p[s]))}</div>
        </div>`).join('');

    const activeQ  = (state.quests || []).filter(q => !q.done);
    const qtActive = state.flags?.activeQuest;
    const questHtml = activeQ.length
        ? activeQ.map(q => {
            const isActive = qtActive && qtActive.title === q.title;
            const stageNum = isActive ? (qtActive.stage || 0) + 1 : 1;
            const total    = isActive ? qtActive.stages.length : '?';
            const hint     = isActive && qtActive.stages[qtActive.stage] ? qtActive.stages[qtActive.stage].hint : '';
            const reward   = isActive && qtActive.reward
                ? `${qtActive.reward.xp}xp  ${qtActive.reward.gold}gp${qtActive.reward.item ? '  +' + qtActive.reward.item : ''}`
                : '';
            return `<div style="margin:3px 0;padding:4px 6px;background:#1a1a2e;border-left:3px solid #7c4dff;border-radius:2px;font-size:12px;">
              <b style="color:#ce93d8;">${q.title}</b>
              <span style="color:#555;font-size:10px;margin-left:6px;">Stage ${stageNum}/${total}</span><br>
              <span style="color:#aaa;">${q.objective}</span><br>
              ${hint ? `<span style="color:#555;font-size:10px;">Hint: ${hint}</span><br>` : ''}
              ${reward ? `<span style="color:#7c4dff;font-size:10px;">Reward: ${reward}</span>` : ''}
            </div>`;
          }).join('')
        : `<div style="color:#555;font-style:italic;font-size:12px;">No active quests</div>`;

    const invHtml = (state.inventory || []).length
        ? (state.inventory || []).map(i => `<div style="font-size:12px;color:#ccc;padding:1px 0;">* ${i}</div>`).join('')
        : `<div style="color:#555;font-style:italic;font-size:12px;">Empty</div>`;

    const condHtml = (state.conditions || []).length
        ? (state.conditions || []).map(c => `<span style="background:#b71c1c;color:#fff;border-radius:3px;padding:1px 5px;font-size:11px;margin-right:3px;">${c}</span>`).join('')
        : '';

    const world = state.flags?.world;
    const worldLine = world
        ? `<div style="font-size:11px;color:#888;margin-bottom:6px;">${world.town}, ${world.region}</div>`
        : '';

    let slotHtml = '';
    if (state.spellSlots) {
        if (state.spellSlots.pact) {
            const pk = state.spellSlots.pact;
            slotHtml = `<div style="margin-top:6px;font-size:12px;color:#ce93d8;">Pact Slots (L${pk.level}): ${pk.count - pk.used}/${pk.count}</div>`;
        } else {
            const slots = Object.entries(state.spellSlots)
                .map(([l, s]) => `<span style="background:#4a148c;color:#e1bee7;border-radius:3px;padding:1px 5px;font-size:11px;margin-right:2px;">L${l}: ${s.max - s.used}/${s.max}</span>`)
                .join('');
            slotHtml = `<div style="margin-top:6px;">${slots}</div>`;
        }
    }

    const goldStr = [
        p.gold   ? `${p.gold}gp`   : '',
        p.silver ? `${p.silver}sp` : '',
        p.copper ? `${p.copper}cp` : '',
    ].filter(Boolean).join(' ') || '0gp';

    return `
<div style="font-family:monospace;color:#e0e0ff;font-size:13px;line-height:1.5;">
  <div style="font-size:15px;font-weight:bold;color:#ce93d8;margin-bottom:2px;">
    ${p.name || 'Adventurer'}
  </div>
  ${worldLine}
  <div style="font-size:12px;color:#aaa;margin-bottom:8px;">
    ${p.race ? p.race.charAt(0).toUpperCase()+p.race.slice(1) : ' - '}
    ${p.class ? p.class.charAt(0).toUpperCase()+p.class.slice(1) : ' - '}
    · Level ${p.level} · Prof +${prof}
  </div>

  <div style="margin-bottom:4px;font-size:11px;color:#888;">HP</div>
  <div style="background:#111;border-radius:4px;overflow:hidden;height:14px;margin-bottom:2px;">
    <div style="width:${hpPct}%;background:${hpColor};height:100%;transition:width .3s;"></div>
  </div>
  <div style="font-size:12px;margin-bottom:6px;">${p.hp}/${p.maxHp} · AC ${p.ac} · Init ${sign(mod(p.dex))}</div>

  <div style="margin-bottom:4px;font-size:11px;color:#888;">XP</div>
  <div style="background:#111;border-radius:4px;overflow:hidden;height:8px;margin-bottom:2px;">
    <div style="width:${xpPct}%;background:#7c4dff;height:100%;transition:width .3s;"></div>
  </div>
  <div style="font-size:11px;color:#aaa;margin-bottom:8px;">
    ${p.xp} XP · ${xpLeft !== null ? `${xpLeft} to Lv${p.level+1}` : 'Max Level'}
  </div>

  <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:3px;margin-bottom:8px;">
    ${statGrid}
  </div>

  <div style="font-size:11px;color:#888;margin-bottom:2px;">Gold: ${goldStr} · Speed: ${p.speed}ft</div>
  ${condHtml ? `<div style="margin:4px 0;">${condHtml}</div>` : ''}
  ${slotHtml}

  ${buildWeaponHtml(state)}

  <details style="margin-top:8px;">
    <summary style="cursor:pointer;font-size:12px;color:#888;">Inventory (${(state.inventory||[]).length})</summary>
    <div style="margin-top:4px;">${invHtml}</div>
  </details>

  <details style="margin-top:6px;" open>
    <summary style="cursor:pointer;font-size:12px;color:#888;">Quests (${activeQ.length})</summary>
    <div style="margin-top:4px;">${questHtml}</div>
  </details>

  ${buildSpellsHtml(state)}

  <div style="margin-top:8px;display:flex;gap:6px;align-items:center;">
    <div style="margin-top:6px;font-size:10px;color:#444;">Turn ${state.turn || 0} · simple-lore v${VERSION}</div>
    <button onclick="window._simpleLoreFloatToggle?.()" style="font-size:10px;padding:2px 6px;background:#2a2a4a;border:1px solid #444;border-radius:3px;color:#aaa;cursor:pointer;margin-left:auto;">&#x26F6; Float</button>
  </div>
</div>`;
}


// ── Dice Integration ─────────────────────────────────────────────────────────
// Uses SillyTavern.libs.droll (exposed by Extension-Dice) if available.
// Falls back to Math.random() if the extension is not installed.
// Rolls are posted as system messages in chat so the player sees the animation.

function roll(formula) {
    const result = { formula, total: 0, rolls: [], display: '' };

    if (typeof window !== 'undefined' && window.SillyTavern?.libs?.droll) {
        try {
            const r = window.SillyTavern.libs.droll.roll(formula);
            if (r) {
                result.total = r.total;
                result.rolls = r.rolls;
                result.display = `[${formula}: ${r.rolls.join('+')} = ${r.total}]`;
                // (system message intentionally omitted - use postRoll() for visible rolls)
                return result;
            }
        } catch (_) { /* fall through */ }
    }

    // Fallback: pure JS roll
    const match = formula.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
    if (match) {
        const count = parseInt(match[1]) || 1;
        const sides = parseInt(match[2]) || 6;
        const bonus = parseInt(match[3]) || 0;
        const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
        result.rolls = rolls;
        result.total = rolls.reduce((a, b) => a + b, 0) + bonus;
        result.display = bonus
            ? `[${formula}: ${rolls.join('+')}${bonus >= 0 ? '+' : ''}${bonus} = ${result.total}]`
            : `[${formula}: ${rolls.join('+')} = ${result.total}]`;
    } else {
        result.total = Math.floor(Math.random() * 20) + 1;
        result.display = `[${formula}: ${result.total}]`;
    }
    return result;
}

// Convenience wrappers used in event processing
const d20 = () => roll('1d20');
const d12 = () => roll('1d12');
const d10 = () => roll('1d10');
const d8  = () => roll('1d8');
const d6  = () => roll('1d6');
const d4  = () => roll('1d4');

// Roll 4d6 drop lowest (ability score generation)
function roll4d6dropLowest() {
    const rolls = [d6().total, d6().total, d6().total, d6().total];
    const min   = Math.min(...rolls);
    const kept  = [...rolls];
    kept.splice(kept.indexOf(min), 1);
    return { total: kept.reduce((a, b) => a + b, 0), rolls, kept };
}


// Post a visible roll result to chat (use for combat/checks, not for every die)
function postRoll(label, result) {
    if (typeof window === 'undefined' || !window.SillyTavern) return;
    try {
        const ctx = window.SillyTavern.getContext();
        ctx?.sendSystemMessage?.('generic',
            `${label}: ${result.display}`,
            { isSmallSys: true }
        );
    } catch (_) { /* optional */ }
}

// ── Module Export ──────────────────────────────────────────────────────────────

const SimpleLore = {
    name:    'Simple Lore',
    version: VERSION,
    updateUrl:  'https://raw.githubusercontent.com/cgstever/simple-lore/main/lore.js',
    versionUrl: 'https://raw.githubusercontent.com/cgstever/simple-lore/main/version.json',

    init(data) {
        console.log(`[SimpleLore] v${VERSION} loaded`);
        return {};
    },

    getSettingsHtml() {
        return `
<div id="simple-lore-hud">${buildHudHtml(_hudState)}</div>

<div id="sl-char-manager" style="margin-top:10px;border-top:1px solid #2a2a4a;padding-top:8px;">
  <div style="font-size:12px;color:#888;margin-bottom:6px;cursor:pointer;user-select:none;"
       onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
    &#x1F4BE; Characters &#x25BE;
  </div>
  <div id="sl-char-panel" style="display:none;">
    <div style="display:flex;gap:4px;margin-bottom:6px;">
      <input id="sl-char-name" type="text" placeholder="Save name..." maxlength="32"
        style="flex:1;background:#1a1a2e;border:1px solid #333;border-radius:4px;color:#e0e0ff;padding:4px 6px;font-size:12px;"/>
      <button id="sl-char-save" style="background:#2a2a4a;border:1px solid #444;border-radius:4px;color:#ce93d8;padding:4px 8px;font-size:11px;cursor:pointer;">Save</button>
    </div>
    <select id="sl-char-select" style="width:100%;background:#1a1a2e;border:1px solid #333;border-radius:4px;color:#e0e0ff;padding:4px;font-size:12px;margin-bottom:6px;">
      <option value="">-- saved characters --</option>
    </select>
    <div style="display:flex;gap:4px;">
      <button id="sl-char-load"   style="flex:1;background:#1a3a1a;border:1px solid #2a5a2a;border-radius:4px;color:#a5d6a7;padding:4px 6px;font-size:11px;cursor:pointer;">Load</button>
      <button id="sl-char-export" style="flex:1;background:#1a2a3a;border:1px solid #2a4a6a;border-radius:4px;color:#90caf9;padding:4px 6px;font-size:11px;cursor:pointer;">Export</button>
      <button id="sl-char-delete" style="flex:1;background:#3a1a1a;border:1px solid #6a2a2a;border-radius:4px;color:#ef9a9a;padding:4px 6px;font-size:11px;cursor:pointer;">Delete</button>
    </div>
    <div id="sl-char-msg" style="font-size:11px;margin-top:4px;min-height:14px;"></div>
  </div>
</div>`;
    },

    onSettingsRendered() {
        // ── Character Manager ─────────────────────────────────────────────────
        // ── Character Manager ─────────────────────────────────────────────────
        // Characters are stored on the ST server so any device on the same
        // ST instance can access them. An index file tracks name -> server path.
        // Falls back to local IndexedDB if the server upload fails.

        const CHAR_DB_KEY   = 'simple-lore::chars';
        const CHAR_INDEX_FILE = 'sl-chars-index.json';

        // ---- Server helpers ----

        const uploadToServer = async (filename, jsonObj) => {
            // ST /api/files/upload expects { name, data } with base64-encoded data
            const raw    = JSON.stringify(jsonObj, null, 2);
            const b64    = btoa(unescape(encodeURIComponent(raw))); // UTF-8 safe base64
            const resp   = await fetch('/api/files/upload', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ name: filename, data: b64 }),
            });
            if (!resp.ok) {
                const text = await resp.text();
                throw new Error(`Upload failed ${resp.status}: ${text.slice(0,100)}`);
            }
            const result = await resp.json();
            return result.path || result.url;
        };

        const fetchFromServer = async (serverPath) => {
            // serverPath is a relative URL like /user/files/...
            const resp = await fetch(serverPath + '?t=' + Date.now());
            if (!resp.ok) throw new Error(`Fetch failed ${resp.status}`);
            return resp.json();
        };

        // ---- Index management ----
        // Index shape: { charName: { path: '/api/files/...', savedAt: timestamp, preview: 'Race Class Lv1' } }

        let _charIndexPath = null; // server path to the index file itself

        const loadIndex = async () => {
            try {
                // Try server first
                if (_charIndexPath) {
                    return await fetchFromServer(_charIndexPath);
                }
                // Try to find index path in local IDB
                const db  = await openCharDB();
                const row = await new Promise((res, rej) => {
                    const tx  = db.transaction('session_state', 'readonly');
                    const req = tx.objectStore('session_state').get('simple-lore::index-path');
                    req.onsuccess = () => res(req.result?.data ?? null);
                    req.onerror   = () => rej(req.error);
                });
                if (row) {
                    _charIndexPath = row;
                    return await fetchFromServer(_charIndexPath);
                }
            } catch (_) { /* no server index yet */ }
            // Fall back to local IDB char list
            return await loadLocalCharList();
        };

        const saveIndex = async (index) => {
            try {
                const path = await uploadToServer(CHAR_INDEX_FILE, index);
                _charIndexPath = path;
                // Persist index path locally so other devices using the same ST also find it
                const db = await openCharDB();
                const tx = db.transaction('session_state', 'readwrite');
                tx.objectStore('session_state').put({ id: 'simple-lore::index-path', data: path });
            } catch (e) {
                console.warn('[SimpleLore] Server index save failed, falling back to local:', e.message);
                await saveLocalCharList(index);
            }
        };

        // ---- Local IDB fallback ----
        const openCharDB = () => new Promise((res, rej) => {
            const req = indexedDB.open('overwrite', 2);
            req.onsuccess = () => res(req.result);
            req.onerror   = () => rej(req.error);
        });

        const loadLocalCharList = async () => {
            try {
                const db  = await openCharDB();
                const tx  = db.transaction('session_state', 'readonly');
                const req = tx.objectStore('session_state').get(CHAR_DB_KEY);
                return await new Promise((res, rej) => {
                    req.onsuccess = () => res(req.result?.data || {});
                    req.onerror   = () => rej(req.error);
                });
            } catch (_) { return {}; }
        };

        const saveLocalCharList = async (list) => {
            const db  = await openCharDB();
            const tx  = db.transaction('session_state', 'readwrite');
            const req = tx.objectStore('session_state').put({ id: CHAR_DB_KEY, data: list });
            return new Promise((res, rej) => { req.onsuccess = res; req.onerror = rej; });
        };

        // ---- UI helpers ----
        const refreshSelect = async () => {
            const sel = document.getElementById('sl-char-select');
            if (!sel) return;
            const index = await loadIndex();
            const keys  = Object.keys(index).sort();
            sel.innerHTML = '<option value="">-- saved characters --</option>' +
                keys.map(k => {
                    const entry   = index[k];
                    const preview = entry.preview || entry.player
                        ? (entry.preview || `${entry.player?.race || '?'} ${entry.player?.class || '?'} Lv${entry.player?.level || 1}`)
                        : '?';
                    return `<option value="${k}">${k}  (${preview})</option>`;
                }).join('');
        };

        const msg = (text, color = '#aaa') => {
            const el = document.getElementById('sl-char-msg');
            if (el) { el.textContent = text; el.style.color = color; }
        };

        // ---- Button logic ----
        const wireButtons = async () => {
            await refreshSelect();

            document.getElementById('sl-char-save')?.addEventListener('click', async () => {
                const nameEl = document.getElementById('sl-char-name');
                const name   = nameEl?.value?.trim();
                if (!name)          { msg('Enter a save name.', '#ef9a9a'); return; }
                if (!_hudState?.player) { msg('No character to save yet.', '#ef9a9a'); return; }

                msg('Saving...', '#aaa');
                try {
                    const charData = JSON.parse(JSON.stringify(_hudState));
                    charData._savedAt = Date.now();

                    // Upload the character file to the ST server
                    const filename  = `sl-char-${name.replace(/[^a-z0-9]/gi, '_')}.json`;
                    const charPath  = await uploadToServer(filename, charData);

                    // Update and re-upload the index
                    const index = await loadIndex();
                    index[name] = {
                        path:    charPath,
                        savedAt: charData._savedAt,
                        preview: `${charData.player?.race || '?'} ${charData.player?.class || '?'} Lv${charData.player?.level || 1}`,
                    };
                    await saveIndex(index);

                    if (nameEl) nameEl.value = '';
                    await refreshSelect();
                    msg(`Saved "${name}" to server.`, '#a5d6a7');
                } catch (e) {
                    // Server failed — fall back to local IDB
                    console.warn('[SimpleLore] Server save failed, using local:', e.message);
                    const list = await loadLocalCharList();
                    list[name] = JSON.parse(JSON.stringify(_hudState));
                    list[name]._savedAt = Date.now();
                    await saveLocalCharList(list);
                    if (nameEl) nameEl.value = '';
                    await refreshSelect();
                    msg(`Saved "${name}" locally (server unavailable).`, '#ffe082');
                }
            });

            document.getElementById('sl-char-load')?.addEventListener('click', async () => {
                const sel  = document.getElementById('sl-char-select');
                const name = sel?.value;
                if (!name) { msg('Select a character first.', '#ef9a9a'); return; }

                msg('Loading...', '#aaa');
                try {
                    const index = await loadIndex();
                    const entry = index[name];
                    if (!entry) { msg('Not found in index.', '#ef9a9a'); return; }

                    // Fetch the character from server if we have a path, else use inline data
                    let charData;
                    if (entry.path) {
                        charData = await fetchFromServer(entry.path);
                    } else {
                        charData = entry; // legacy local save stored inline
                    }

                    // Write into current session slot
                    const ctx    = window.SillyTavern?.getContext();
                    const chatId = ctx?.getCurrentChatId?.() || 'unknown';
                    let charName = ctx?.characters?.[ctx?.characterId]?.name || 'unknown';
                    const key    = `${charName}::${chatId}`;
                    const db     = await openCharDB();
                    const tx     = db.transaction('session_state', 'readwrite');
                    const req    = tx.objectStore('session_state').put({ id: key, data: charData });
                    await new Promise((res, rej) => { req.onsuccess = res; req.onerror = rej; });

                    _hudState = charData;
                    const hudEl = document.getElementById('simple-lore-hud');
                    if (hudEl) hudEl.innerHTML = buildHudHtml(_hudState);
                    window._simpleLoreFloatRefresh?.();
                    msg(`Loaded "${name}". Send a message to resume.`, '#a5d6a7');
                } catch (e) { msg('Load failed: ' + e.message, '#ef9a9a'); }
            });

            document.getElementById('sl-char-export')?.addEventListener('click', async () => {
                const sel  = document.getElementById('sl-char-select');
                const name = sel?.value;
                if (!name) { msg('Select a character first.', '#ef9a9a'); return; }
                try {
                    const index = await loadIndex();
                    const entry = index[name];
                    let charData = entry?.path ? await fetchFromServer(entry.path) : entry;
                    const blob = new Blob([JSON.stringify(charData, null, 2)], { type: 'application/json' });
                    const a    = document.createElement('a');
                    a.href     = URL.createObjectURL(blob);
                    a.download = `${name.replace(/\s+/g, '-')}-simplelore.json`;
                    a.click();
                    msg(`Exported "${name}".`, '#90caf9');
                } catch (e) { msg('Export failed: ' + e.message, '#ef9a9a'); }
            });

            document.getElementById('sl-char-delete')?.addEventListener('click', async () => {
                const sel  = document.getElementById('sl-char-select');
                const name = sel?.value;
                if (!name) { msg('Select a character first.', '#ef9a9a'); return; }
                if (!confirm(`Delete "${name}"?`)) return;
                try {
                    const index = await loadIndex();
                    delete index[name];
                    await saveIndex(index);
                    await refreshSelect();
                    msg(`Deleted "${name}".`, '#ef9a9a');
                } catch (e) { msg('Delete failed: ' + e.message, '#ef9a9a'); }
            });
        };

        wireButtons();
        document.getElementById('sl-char-panel')?.parentElement
            ?.querySelector('[onclick]')
            ?.addEventListener('click', () => setTimeout(refreshSelect, 50));

        // ── HUD refresh ───────────────────────────────────────────────────────
        // ── HUD refresh ───────────────────────────────────────────────────────
        const tryLoadState = async () => {
            try {
                if (typeof window === 'undefined' || !window.SillyTavern) return;
                const ctx    = window.SillyTavern.getContext();
                const chatId = ctx.getCurrentChatId?.() || 'unknown';
                let charName = ctx.characters?.[ctx.characterId]?.name;
                if (!charName) {
                    const chatLog = ctx.chat || [];
                    for (let i = chatLog.length - 1; i >= 0; i--) {
                        const m = chatLog[i];
                        if (!m.is_user && !m.is_system && m.name) { charName = m.name; break; }
                    }
                }
                charName = charName || 'unknown';
                const key = `${charName}::${chatId}`;
                const db  = await openCharDB();
                const stored = await new Promise((res, rej) => {
                    const tx  = db.transaction('session_state', 'readonly');
                    const req = tx.objectStore('session_state').get(key);
                    req.onsuccess = () => res(req.result?.data ?? null);
                    req.onerror   = () => rej(req.error);
                });
                if (stored && stored.player) {
                    _hudState = stored;
                    const el = document.getElementById('simple-lore-hud');
                    if (el) el.innerHTML = buildHudHtml(_hudState);
                }
            } catch (_) { /* IDB not available yet */ }
        };

        tryLoadState();
        initFloatingHud();

        if (_hudInterval) clearInterval(_hudInterval);
        _hudInterval = setInterval(async () => {
            await tryLoadState();
            const el = document.getElementById('simple-lore-hud');
            if (el && document.contains(el)) el.innerHTML = buildHudHtml(_hudState);
            window._simpleLoreFloatRefresh?.();
        }, 5000);
    },

    processTurn({ state, systemText, messages, charNameHint, personaName } = {}) {
        if (!state) state = {};
        if (!state.player) Object.assign(state, defaultState());

        state.turn      = (state.turn || 0) + 1;
        state.player.ac = calcAC(state);
        // Advance time each turn unless in active combat (combat time handled per round)
        if (!state.combat?.active && state.turn > 1) {
            advanceTime(state, MINUTES_PER_TURN);
        }

        const levelUp = checkLevelUp(state);

        let systemPrompt;

        if (state.charCreation) {
            systemPrompt = buildCreationPrompt(state);
        } else if (state.flags.freshStart) {
            // First turn after char gen  -  set the opening scene
            state.flags.freshStart = false;
            const rules1 = GM_RULES.replace('[WORLD]', state.flags.world?.town || 'this region');
            const companionBlock1 = buildCompanionBlock(systemText, state);
            const combatBlock1    = buildCombatBlock(state);
            systemPrompt = buildStatBlock(state) + '\n\n' + buildQuestAnchor(state) + '\n\n' + rules1
                         + (combatBlock1    ? '\n\n' + combatBlock1    : '')
                         + (companionBlock1 ? '\n\n' + companionBlock1 : '')
                         + '\n\n' + buildOpeningPrompt(state);
        } else {
            const rules2 = GM_RULES.replace('[WORLD]', state.flags.world?.town || 'this region');
            const companionBlock2 = buildCompanionBlock(systemText, state);
            const combatBlock2    = buildCombatBlock(state);
            const restWarning     = state.flags.restBlocked
                ? `\n\nREST BLOCKED: ${state.flags.restBlocked} Tell the player this and clear state.flags.restBlocked.`
                : '';
            systemPrompt = buildStatBlock(state) + '\n\n' + buildQuestAnchor(state) + '\n\n' + rules2
                         + (combatBlock2    ? '\n\n' + combatBlock2    : '')
                         + (companionBlock2 ? '\n\n' + companionBlock2 : '')
                         + restWarning;
            if (levelUp) {
                systemPrompt +=
                    `\n\n[LEVEL UP! ${state.player.name} reached level ${levelUp.to} ` +
                    `(was ${levelUp.from}). Max HP increased by ${levelUp.hpGain}. ` +
                    `Announce this dramatically before the scene.]`;
            }
        }        _hudState = state;
        window._simpleLoreFloatRefresh?.();
        return { systemPrompt, state };
    },

    handleResponse({ assistantText, state } = {}) {
        if (!state) return {};
        const events = parseGameEvents(assistantText || '');
        for (const ev of events) applyEvent(state, ev);
        state.player.ac = calcAC(state);

        // Strip ```game ... ``` blocks from the visible chat message
        // Also strip bare JSON lines that look like game events leaked without fences
        const cleanedText = (assistantText || '')
            .replace(/```game[\s\S]*?```/gi, '')
            .replace(/^\s*\{[\s\S]*?"type"\s*:\s*"[^"]+[\s\S]*?\}\s*$/gm, '')
            .replace(/^\s*\[[\s\S]*?"type"\s*:\s*"[^"]+[\s\S]*?\]\s*$/gm, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        _hudState = state;
        window._simpleLoreFloatRefresh?.();
        return { state, cleanedText };
    },
};

export default SimpleLore;
