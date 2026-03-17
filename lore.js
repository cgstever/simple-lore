/**
 * simple-lore  —  D&D 5e stateful RPG lore module for StatefullLore
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

const VERSION = '1.5.0';

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
// Warlock: pact magic — inner array = [slot_count, slot_level]
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
            saves:  [],   // proficient saving throw stats e.g. ['str','con']
            skills: [],   // proficient skill names
            speed:  30,
            gold: 0, silver: 0, copper: 0,
        },
        inventory:  [],
        quests:     [],
        conditions: [],
        spellSlots: null,
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

    const raceDisplay  = p.race  ? p.race.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '—';
    const classDisplay = p.class ? p.class.charAt(0).toUpperCase() + p.class.slice(1) : '—';

    const goldStr = [
        p.gold   ? `${p.gold}gp`   : '',
        p.silver ? `${p.silver}sp` : '',
        p.copper ? `${p.copper}cp` : '',
    ].filter(Boolean).join(' ') || '0gp';

    const lines = [
        `══ ${p.name} ══`,
        `${raceDisplay} ${classDisplay}  •  Level ${level}  •  Prof Bonus +${prof}`,
        `HP ${hpBar}  •  AC ${p.ac}  •  Init ${sign(mod(p.dex))}  •  Speed ${p.speed}ft`,
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

    const activeQ = state.quests.filter(q => !q.done);
    const doneQ   = state.quests.filter(q => q.done);
    if (activeQ.length) {
        lines.push(`──`);
        lines.push(`QUESTS:`);
        activeQ.forEach(q => lines.push(`  [!] ${q.title}: ${q.objective}`));
    }
    if (doneQ.length) {
        lines.push(`  Completed: ${doneQ.map(q => q.title).join(', ')}`);
    }

    lines.push(`══ Turn ${state.turn}  |  World: ${state.flags.world?.id || 'unknown'} ══`);
    return lines.join('\n');
}

// ── Event Parser & Applier ─────────────────────────────────────────────────────

function parseGameEvents(text) {
    const events = [];
    const rx = /```game\s*([\s\S]*?)```/gi;
    let m;
    while ((m = rx.exec(text)) !== null) {
        try {
            const ev = JSON.parse(m[1].trim());
            if (Array.isArray(ev)) events.push(...ev);
            else events.push(ev);
        } catch (_) { /* malformed — skip */ }
    }
    return events;
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
            state.flags.world  = pickWorld();
            state.flags.freshStart = true;
            break;

        // ── Core Stats ──────────────────────────────────────────────────────
        case 'rename':
            if (ev.name) p.name = ev.name;
            break;

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
        case 'long_rest':
            p.hp = p.maxHp;
            state.conditions = state.conditions.filter(c =>
                !['Poisoned','Blinded','Deafened','Prone'].includes(c));
            if (state.spellSlots) {
                if (state.spellSlots.pact) {
                    state.spellSlots.pact.used = 0;
                } else {
                    Object.values(state.spellSlots).forEach(s => { s.used = 0; });
                }
            }
            break;

        case 'short_rest':
            if (state.spellSlots && state.spellSlots.pact) {
                state.spellSlots.pact.used = 0; // warlock slots on short rest
            }
            if (ev.hitDiceSpent && p.class) {
                const cls     = CLASSES[p.class];
                const healAmt = (Number(ev.hitDiceSpent) || 1) + mod(p.con);
                p.hp = Math.min(p.maxHp, p.hp + Math.max(1, healAmt));
            }
            break;

        // ── Misc ────────────────────────────────────────────────────────────
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
//   low  = CR 1/8–1  (levels 1–2)   mid = CR 2–3 (levels 3–4)   high = CR 4–5 (levels 5+)
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
            'Missing loggers — men have been vanishing in the deep wood for weeks',
            'A fey bargain gone wrong — a farmer\'s daughter was taken as payment for a debt her grandfather forgot',
            'Ruins sighted — a scout returned with rubble carved in no known script and died three days later',
        ],
    },
    {
        id: 'saltmere',
        region: 'The Salthallow Coast',
        regionDesc: 'a jagged coastline of sea stacks, hidden coves, and tidal caves — smuggler country, where the crown\'s writ barely reaches',
        town: 'Saltmere',
        townDesc: 'a fishing town built on stilts above a tidal flat, its harbour perpetually crowded with boats whose captains ask no questions',
        tavern: 'The Drowned Anchor',
        tavernDesc: 'a raucous dockside tavern built into a converted warehouse, its walls hung with salvaged figureheads and nets',
        hooks: [
            'A merchant vessel ran aground — its cargo was intact but every soul aboard was gone',
            'Tidal caves — locals whisper of lights beneath the water and a voice that calls names',
            'Smuggler war — two crews are about to spill blood over a shipment nobody will describe',
        ],
    },
    {
        id: 'ashford',
        region: 'The Cinder Plains',
        regionDesc: 'a scorched expanse of volcanic rock and ash fields stretching between two mountain ranges, dotted with obsidian spires and the bones of dead dragons',
        town: 'Ashford',
        townDesc: 'a mining boomtown built around a rich vein of bloodstone, its streets choked with fortune-seekers and the company guards who watch them',
        tavern: 'The Ember & Tongs',
        tavernDesc: 'a broad miners\' hall that doubles as a forge waiting room, its tables carved with the names of those who struck it rich — and those who didn\'t',
        hooks: [
            'The deep vein — miners broke into a sealed chamber and something sealed it from the inside for a reason',
            'Company trouble — the Bloodstone Company is overworking its conscripted labour and someone needs to know',
            'Dragon bones — a collector is paying absurd sums for intact dragon teeth, which has sent fools into the wastes',
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
            'The pass is closing — an early blizzard is coming and a caravan is three days overdue',
            'Cairn walkers — the ancient burial mounds have been disturbed and the dead are not resting',
            'A noble\'s ransom — a young lord was taken off the road and his family is too proud to involve the crown',
        ],
    },
    {
        id: 'dunmere',
        region: 'The Dunwater Fens',
        regionDesc: 'a vast wetland of shallow lakes, reed beds, and floating peat islands that shift season to season — maps are useless here',
        town: 'Dunmere',
        townDesc: 'a town built on a rare slab of solid ground above the fens, its houses connected by a web of rope bridges, its people deeply suspicious of outsiders',
        tavern: 'The Bogwitch',
        tavernDesc: 'a creaking, leaning tavern that smells of marsh gas and smoked eel, its landlady a retired hedge witch who charges double for anything after dark',
        hooks: [
            'The paths are moving — the fen routes that locals have used for generations no longer lead where they should',
            'Will-o-wisps — travellers are being led into the deep fens and not returning; the wisps have never been this bold',
            'An old shrine — a half-submerged temple has surfaced after a dry season and factions are already fighting over it',
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
            'Clan war brewing — two steppe clans are feuding over grazing rights and both have approached the garrison for support',
            'The iron sickness — a blight is killing horses across three clans\' territories and nobody knows its source',
            'A sealed vault — an imperial survey team found a pre-empire structure buried in the steppe and promptly disappeared',
        ],
    },
];

function pickWorld() {
    return WORLDS[Math.floor(Math.random() * WORLDS.length)];
}

// ── System Prompts ─────────────────────────────────────────────────────────────

const CREATION_PROMPT = `
You are the Game Master. The player is building their D&D 5e character.
Complete ALL FOUR STEPS before starting the adventure.

━━ STEP 1 — ABILITY SCORES ━━
Simulate 4d6-drop-lowest six times. Present the results like:
  Roll 1: 16   Roll 2: 14   Roll 3: 13   Roll 4: 12   Roll 5: 10   Roll 6: 8
Ask the player to assign each roll to STR / DEX / CON / INT / WIS / CHA.
Once assigned, emit set_scores. Example event:
  { "type": "set_scores", "str": 12, "dex": 16, "con": 13, "int": 10, "wis": 14, "cha": 8 }

━━ STEP 2 — RACE ━━
Present these 15 options with bonuses and signature traits:
  Human (+1 all), High Elf (+2 DEX +1 INT), Wood Elf (+2 DEX +1 WIS),
  Hill Dwarf (+2 CON +1 WIS), Mountain Dwarf (+2 CON +2 STR),
  Lightfoot Halfling (+2 DEX +1 CHA), Stout Halfling (+2 DEX +1 CON),
  Forest Gnome (+2 INT +1 DEX), Rock Gnome (+2 INT +1 CON),
  Tiefling (+2 CHA +1 INT), Dragonborn (+2 STR +1 CHA),
  Half-Elf (+2 CHA +1 to two of your choice),
  Half-Orc (+2 STR +1 CON), Aasimar (+2 CHA +1 WIS)
Once chosen, emit set_race. For half-elf, include bonusStat1 and bonusStat2.
  { "type": "set_race", "race": "High Elf" }

━━ STEP 3 — CLASS ━━
Present all 12 classes with hit dice and role flavour:
  Barbarian (d12 — primal warrior), Bard (d8 — arcane performer),
  Cleric (d8 — divine champion), Druid (d8 — nature mystic),
  Fighter (d10 — weapon master), Monk (d8 — martial artist),
  Paladin (d10 — holy crusader), Ranger (d10 — wilderness hunter),
  Rogue (d8 — shadow operative), Sorcerer (d6 — innate mage),
  Warlock (d8 — eldritch pact), Wizard (d6 — scholarly caster)
Choose 2 class-appropriate starting skill proficiencies and include them.
  { "type": "set_class", "class": "Wizard", "skills": ["Arcana", "History"] }

━━ STEP 4 — NAME ━━
Ask for the character's name (and optionally a brief backstory hook).
  { "type": "rename", "name": "Lyra Ashveil" }

Then emit, in order:
1. creation_complete
2. item_add events for class-appropriate starting gear (weapon, armor if any,
   adventuring supplies). Use realistic 5e starting equipment for the class.
   Examples — Fighter: longsword, shield, chain mail, 5x javelins, explorer's pack
              Wizard: quarterstaff, spellbook, component pouch, scholar's pack, 10gp
              Rogue: shortsword, shortbow + 20 arrows, leather armor, thieves' tools, burglar's pack
3. gold_change for starting gold appropriate to the class (PHB starting wealth)
4. A quest_add for the first hook — keep it vague, just enough to motivate leaving the tavern

Do NOT start the adventure or describe any scene yet. That happens next turn.
`.trim();

function buildOpeningPrompt(state) {
    const w = state.flags.world;
    const p = state.player;
    const hook = w.hooks[Math.floor(Math.random() * w.hooks.length)];

    // Store the chosen hook so it stays consistent after this turn
    if (!state.flags.openingHook) state.flags.openingHook = hook;
    const usedHook = state.flags.openingHook;

    return `
━━ OPENING SCENE ━━
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
• Set the scene inside ${w.tavern} in vivid second-person prose (4–8 sentences).
• Establish the atmosphere, a few notable NPCs present, and the ambient mood.
• Weave in the hook naturally — overheard conversation, a notice board, a stranger's muttered warning.
• End with 4–6 numbered action choices for the player.
• Do NOT resolve anything yet. This is the opening scene only.
`.trim();
}


You are the Game Master for a D&D 5e text-based RPG.
The player stat block above reflects the current game state exactly.

STAT LINE
Begin EVERY response (outside char gen) with a single compact stat line
formatted exactly like this, on its own line:
`⚔ HP: 32/40 | AC: 14 | XP: 75/300 | Gold: 10gp | Turn: 4`
Use the actual current values from the stat block. Do not skip this line.
After this line, add a blank line, then your narrative.

NARRATIVE
• Vivid second-person prose, 4–8 sentences per scene.
• End every turn with 4–6 numbered action choices for the player.
• Progress time naturally (morning → noon → afternoon → evening → night).

ABILITY CHECKS & SAVES
• Set a DC (8 easy / 12 moderate / 16 hard / 20 very hard / 25 nearly impossible).
• Roll: d20 + relevant ability modifier + proficiency bonus (if proficient).
• Proficiency bonus is shown in the stat block. Skills marked in the Skills line get +prof.
• Advantage = roll twice take higher. Disadvantage = roll twice take lower.

COMBAT
• Initiative: d20 + DEX modifier — describe turn order.
• Attack roll: d20 + ability mod + prof bonus (if proficient) vs. target AC.
• Damage: weapon die + ability modifier.
• Natural 20 = critical hit: roll damage dice twice, add mods once.
• 0 HP → unconscious, death saving throws (3 successes = stable, 3 fails = dead).
• Unconscious characters get advantage on death saves when a creature is within 5ft.

SPELLCASTING
• Use_spell_slot events when a spell slot is expended.
• Concentration spells break on taking damage unless a CON save is passed (DC 10 or half damage).
• Warlock pact slots recharge on short rest; all other slots on long rest.

RESTING
• Short rest (1 hr): spend Hit Dice to heal (HD + CON mod per die).
  Emit: { "type": "short_rest", "hitDiceSpent": N }
• Long rest (8 hrs): full HP and spell slot recovery.
  Emit: { "type": "long_rest" }

ENCOUNTERS & LOOT
The stat block includes a WORLD ID. Use it to pull from the encounter tables
already loaded in this module. When describing a combat encounter:
• Use the monster's AC and HP values provided — do not invent them.
• Match the CR band to the player's level (low ≤ 2, mid 3–4, high 5+).
• After defeating an encounter, award loot by tier:
    trivial/low → gold coins only
    mid encounter → gold + roll for 1 common item
    hard/boss → gold + uncommon item
    rare/legendary → gold + rare item
  Emit item_add for any magic item awarded.
• XP per monster is roughly: CR×200 (CR 0 = 10xp, CR ¼ = 50xp, CR ½ = 100xp).

EVENT BLOCKS — emit AFTER narrative, only include events that occurred:
\`\`\`game
[
  { "type": "xp_gain",          "amount": 75 },
  { "type": "gold_change",      "amount": -5 },
  { "type": "hp_change",        "amount": -14 },
  { "type": "use_spell_slot",   "level": 2 },
  { "type": "item_add",         "item": "Wand of Magic Missiles" },
  { "type": "item_remove",      "item": "Torch" },
  { "type": "quest_add",        "title": "The Bandit King", "objective": "Defeat Rogan at Redstone Keep." },
  { "type": "quest_complete",   "title": "A New Beginning" },
  { "type": "condition_add",    "condition": "Poisoned" },
  { "type": "condition_remove", "condition": "Poisoned" },
  { "type": "armor_change",     "ac": 16, "armorType": "medium", "shield": true },
  { "type": "flag_set",         "key": "knows_secret_passage", "value": true },
  { "type": "long_rest" }
]
\`\`\`
`.trim();

// ── HUD ───────────────────────────────────────────────────────────────────────
// Cached state reference so the panel can live-update without waiting for IDB.
let _hudState = null;
let _hudInterval = null;

function buildHudHtml(state) {
    if (!state || !state.player) {
        return `<div style="color:#888;font-style:italic;padding:8px;">
            Waiting for game to start…
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
    const questHtml = activeQ.length
        ? activeQ.map(q => `<div style="margin:3px 0;padding:4px 6px;background:#1a1a2e;border-left:3px solid #7c4dff;border-radius:2px;font-size:12px;">
            <b style="color:#ce93d8;">${q.title}</b><br>
            <span style="color:#aaa;">${q.objective}</span>
          </div>`).join('')
        : `<div style="color:#555;font-style:italic;font-size:12px;">No active quests</div>`;

    const invHtml = (state.inventory || []).length
        ? (state.inventory || []).map(i => `<div style="font-size:12px;color:#ccc;padding:1px 0;">• ${i}</div>`).join('')
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
    ${p.race ? p.race.charAt(0).toUpperCase()+p.race.slice(1) : '—'}
    ${p.class ? p.class.charAt(0).toUpperCase()+p.class.slice(1) : '—'}
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

  <details style="margin-top:8px;">
    <summary style="cursor:pointer;font-size:12px;color:#888;">Inventory (${(state.inventory||[]).length})</summary>
    <div style="margin-top:4px;">${invHtml}</div>
  </details>

  <details style="margin-top:6px;" open>
    <summary style="cursor:pointer;font-size:12px;color:#888;">Quests (${activeQ.length})</summary>
    <div style="margin-top:4px;">${questHtml}</div>
  </details>

  <div style="margin-top:6px;font-size:10px;color:#444;">Turn ${state.turn || 0} · simple-lore v${VERSION}</div>
</div>`;
}

// ── Module Export ──────────────────────────────────────────────────────────────

const SimpleLore = {
    name:    'Simple Lore',
    version: VERSION,

    init(data) {
        console.log(`[SimpleLore] v${VERSION} loaded`);
        return {};
    },

    getSettingsHtml() {
        return `<div id="simple-lore-hud">${buildHudHtml(_hudState)}</div>`;
    },

    onSettingsRendered() {
        // Refresh the HUD panel every 2s so it stays live after each turn
        if (_hudInterval) clearInterval(_hudInterval);
        _hudInterval = setInterval(() => {
            const el = document.getElementById('simple-lore-hud');
            if (el) el.innerHTML = buildHudHtml(_hudState);
        }, 2000);
    },

    processTurn({ state, systemText, messages, charNameHint, personaName } = {}) {
        if (!state) state = {};
        if (!state.player) Object.assign(state, defaultState());

        state.turn      = (state.turn || 0) + 1;
        state.player.ac = calcAC(state);

        const levelUp = checkLevelUp(state);

        let systemPrompt;

        if (state.charCreation) {
            systemPrompt = CREATION_PROMPT;
        } else if (state.flags.freshStart) {
            // First turn after char gen — set the opening scene
            state.flags.freshStart = false;
            systemPrompt = buildStatBlock(state) + '\n\n'
                         + GM_RULES + '\n\n'
                         + buildOpeningPrompt(state);
        } else {
            systemPrompt = buildStatBlock(state) + '\n\n' + GM_RULES;
            if (levelUp) {
                systemPrompt +=
                    `\n\n[LEVEL UP! ${state.player.name} reached level ${levelUp.to} ` +
                    `(was ${levelUp.from}). Max HP increased by ${levelUp.hpGain}. ` +
                    `Announce this dramatically before the scene.]`;
            }
        }

        _hudState = state;
        return { systemPrompt, state };
    },

    handleResponse({ assistantText, state } = {}) {
        if (!state) return {};
        const events = parseGameEvents(assistantText || '');
        for (const ev of events) applyEvent(state, ev);
        state.player.ac = calcAC(state);

        // Strip ```game ... ``` blocks from the visible chat message
        const cleanedText = (assistantText || '')
            .replace(/```game[\s\S]*?```/gi, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        _hudState = state;
        return { state, cleanedText };
    },
};

export default SimpleLore;
