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

const VERSION = '1.1.0';

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

    lines.push(`══ Turn ${state.turn} ══`);
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
Then emit creation_complete and give the player starting equipment
(emit item_add events) and a starting quest (quest_add).

Do NOT start the adventure until all four steps are done.
`.trim();

const GM_RULES = `
You are the Game Master for a D&D 5e text-based RPG.
The player stat block above reflects the current game state exactly.

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

ECONOMY
Use gold (gp), silver (sp), copper (cp). 1gp = 10sp = 100cp.

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

// ── Module Export ──────────────────────────────────────────────────────────────

const SimpleLore = {
    name:    'Simple Lore',
    version: VERSION,

    init(data) {
        console.log(`[SimpleLore] v${VERSION} loaded`);
        return {};
    },

    processTurn(state, context) {
        if (!state.player) Object.assign(state, defaultState());

        state.turn        = (state.turn || 0) + 1;
        state.player.ac   = calcAC(state);

        const levelUp = checkLevelUp(state);

        let injection;

        if (state.charCreation) {
            injection = CREATION_PROMPT;
        } else {
            injection = buildStatBlock(state) + '\n\n' + GM_RULES;
            if (levelUp) {
                injection +=
                    `\n\n[LEVEL UP! ${state.player.name} reached level ${levelUp.to} ` +
                    `(was ${levelUp.from}). Max HP increased by ${levelUp.hpGain}. ` +
                    `Announce this dramatically before the scene.]`;
            }
        }

        return { injection, state };
    },

    handleResponse(response, state) {
        const events = parseGameEvents(response);
        for (const ev of events) applyEvent(state, ev);
        state.player.ac = calcAC(state);
        return { state };
    },
};

export default SimpleLore;
