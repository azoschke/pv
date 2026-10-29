/**
 * rp-shared.js — lists and plain-language helpers shared by the Roll Calculator
 * (js/roll-calculator.js) and the Combat Toolkit (js/admin/rp-rolls.js).
 *
 * Load before either of those scripts:
 *   <script src="js/rp-shared.js"></script>
 *
 * Exposes a global `PVRpShared`.
 */
(function (global) {
  // Character skill checks (d20 + item skill bonuses). The worker validates
  // against the same list (lib/constants.js SKILL_KINDS).
  var SKILLS = [
    { value: 'perception', label: 'Perception' },
    { value: 'investigation', label: 'Investigation' },
    { value: 'stealth', label: 'Stealth' },
    { value: 'sleight_of_hand', label: 'Sleight of Hand' },
    { value: 'disarm_traps', label: 'Disarm Traps' },
    { value: 'athletics', label: 'Athletics' },
    { value: 'animal_handling', label: 'Animal Handling' },
    { value: 'deception', label: 'Deception' },
    { value: 'persuasion', label: 'Persuasion' },
    { value: 'diplomacy', label: 'Diplomacy' }
  ];
  function skillLabel(v) { for (var i = 0; i < SKILLS.length; i++) if (SKILLS[i].value === v) return SKILLS[i].label; return v; }

  // Scene state (location / time of day) the DM sets from the Control Deck.
  // Must stay in step with the worker (lib/constants.js RP_LOCATIONS / RP_TIMES).
  var RP_LOCATIONS = ['Arctic', 'Cave', 'Coastal', 'Desert', 'Forest', 'Jungle', 'Grassland', 'Mountain', 'Swamp', 'Town'];
  var RP_TIMES = ['Morning', 'Afternoon', 'Evening', 'Night'];

  // ── Plain-language descriptions ─────────────────────────────────────────
  var CLASS_PLURAL = { tank: 'Tanks', dps: 'DPS', healer: 'Healers' };
  function signed(v) { return (v >= 0 ? '+' : '−') + Math.abs(v); }
  // The rolls a roll_bonus boosts: "attack & defense", or "all".
  function rollsWords(rolls) {
    var set = Array.isArray(rolls) ? rolls : [];
    if (set.length >= 3) return 'all';
    return set.map(function (r) { return r === 'attack_roll' ? 'attack' : r === 'defense_roll' ? 'defense' : 'healing'; }).join(' & ');
  }
  var ROLL_WORD = { attack_roll: 'attack', defense_roll: 'defense', heal_roll: 'healing' };
  // "Take more damage": "+2 extra damage", "×2 damage", or "+2 extra damage, ×2".
  function vulnWords(m) {
    var mult = m.mult > 1 ? '×' + m.mult : '';
    if (!(m.value > 0) && mult) return mult + ' damage';
    return signed(m.value || 0) + ' extra damage' + (mult ? ', ' + mult : '');
  }

  // What an item effect does, as a short phrase in the same terms as
  // itemEffectText: "+5 attack damage", "+1 to attack & defense rolls", "a
  // shield of 2". The Roll Calculator's lists of effects in play use it, and
  // it names an effect saved without a label.
  function effectPhrase(m) {
    var v = m.value;
    switch (m.type) {
      case 'roll_bonus': return signed(v) + ' to ' + rollsWords(m.rolls) + ' rolls';
      case 'attack_roll': case 'defense_roll': case 'heal_roll': return signed(v) + ' to ' + ROLL_WORD[m.type] + ' rolls';
      case 'skill_roll': return signed(v) + ' to ' + skillLabel(m.skill) + ' checks';
      case 'attack_output': return signed(v) + ' attack damage';
      case 'attack_mult': return '×' + v + ' attack damage';
      case 'heal_output': return signed(v) + ' healing';
      case 'heal_mult': return '×' + v + ' healing';
      case 'heal_received': return signed(v) + ' healing received';
      case 'extra_attack': return v + ' extra attack' + (v === 1 ? '' : 's');
      case 'damage_reduction': return Math.abs(v) + ' less damage per hit';
      case 'vulnerability': return vulnWords(m).replace(' damage', ' damage taken');
      case 'weaken': return Math.abs(v) + ' less damage dealt';
      case 'stun_immune': return 'stun immunity';
      case 'shield': return 'a shield of ' + v;
      case 'heal': return v + ' HP of healing';
      case 'damage': return v + ' damage';
      case 'dot': return v + ' damage per turn';
      case 'stun': return 'stun';
      case 'summon': return 'summon';
      case 'none': return 'narrative';
    }
    return signed(v) + ' ' + String(m.type || '').replace(/_/g, ' ');
  }

  // Roll / output bonuses. Must stay in step with the worker (lib/constants.js
  // ROLL_OUTPUT_TYPES).
  var ROLL_OUTPUT_TYPES = ['attack_roll', 'defense_roll', 'heal_roll', 'roll_bonus', 'skill_roll', 'attack_output', 'attack_mult', 'heal_output', 'heal_mult'];
  // A "Press to use" roll/output bonus with a condition runs by itself, so it has
  // no Activate button (worker isCondBuff). With a turn count it starts each
  // time its condition turns on, runs those turns, then waits for the
  // condition to turn off and on again.
  function isCondBuff(m) { return !!(m && m.conditions) && m.mode === 'activated' && ROLL_OUTPUT_TYPES.indexOf(m.type) !== -1; }

  // Who an effect needs picked when it's pressed, and what a condition does to
  // it. Must stay in step with the worker (lib/effects.js).
  var TRIGGER_TYPES = ['summon', 'damage', 'dot', 'vulnerability', 'stun', 'weaken'];
  var ENEMY_KINDS = ['boss', 'some_bosses', 'all_bosses', 'minions'];
  function aimsAtEnemies(m) {
    return m.type === 'damage' || m.type === 'dot' || m.type === 'weaken' ||
      ((m.type === 'vulnerability' || m.type === 'stun') && ENEMY_KINDS.indexOf(m.target_kind) !== -1);
  }
  // 'enemy' | 'enemies' | 'ally' | 'allies', or null when the effect knows its
  // targets (self, everyone, a class, item holders, all enemies, all minions).
  function pickNeeded(m) {
    if (aimsAtEnemies(m)) {
      if (m.target_kind === 'some_bosses') return 'enemies';
      return (m.target_kind === 'all_bosses' || m.target_kind === 'minions') ? null : 'enemy';
    }
    if (m.type === 'summon' || m.type === 'none') return null;
    if (m.target_kind === 'party_member') return 'ally';
    if (m.target_kind === 'party_members') return 'allies';
    return null;
  }
  // With a condition, a summon / strike / damage over time / stun / "take more
  // damage" fires by itself when the condition turns on, so it has no button.
  // One aimed at chosen targets can't (nobody to pick them): the condition lets
  // the player press it instead, only while it holds.
  function firesByItself(m) { return !!(m && m.conditions) && TRIGGER_TYPES.indexOf(m.type) !== -1 && !pickNeeded(m); }
  function waitsForCondition(m) { return !!(m && m.conditions) && TRIGGER_TYPES.indexOf(m.type) !== -1 && !!pickNeeded(m); }

  // A boss's own damage right now (sync dmg_add / dmg_mult): "+2", "−1 ×2", or ''.
  function bossDamagePhrase(b) {
    var add = (b && b.dmg_add) || 0, mult = (b && b.dmg_mult) || 1;
    var p = [];
    if (add) p.push((add > 0 ? '+' : '−') + Math.abs(add));
    if (mult > 1) p.push('×' + mult);
    return p.join(' ');
  }

  // How a strike or damage over time treats the target's defences:
  // "unmitigated" skips damage reduction, "ignores shields" goes straight to HP.
  // '' for anything else.
  function hitNote(m) {
    if (!m || (m.type !== 'damage' && m.type !== 'dot')) return '';
    return [m.unmitigated ? 'unmitigated' : null, m.ignore_shields ? 'ignores shields' : null].filter(Boolean).join(', ');
  }

  // Conditional-activation gate (HP / scene). The worker sends `conditions` as a
  // parsed object already, but tolerate a JSON string too.
  function parseConditions(c) {
    if (!c) return null;
    if (typeof c === 'object') return c;
    try { return JSON.parse(c) || null; } catch (_) { return null; }
  }
  function conditionPhrase(c) {
    c = parseConditions(c);
    if (!c) return '';
    if (c.kind === 'hp') {
      var opWord = { '<': 'below', '<=': 'at or below', '=': 'at exactly', '>=': 'at or above', '>': 'above' };
      function pt(p) { return p ? (opWord[p.op] || p.op) + ' ' + p.value + (p.unit === 'flat' ? ' HP' : '%') : ''; }
      // A boss skill's condition watches its own HP.
      if (c.subject === 'self') return 'Only while its HP is ' + pt(c.start);
      var whose = c.subject === 'item_holder' ? 'another item’s holder' : 'the holder';
      var s = 'Only while ' + whose + ' is ' + pt(c.start);
      if (c.stop) s += ' (until ' + pt(c.stop) + ')';
      return s;
    }
    if (c.kind === 'scene') {
      var parts = [];
      if (Array.isArray(c.locations) && c.locations.length) parts.push('in ' + c.locations.join(', '));
      if (Array.isArray(c.times) && c.times.length) parts.push('at ' + c.times.join(', '));
      return parts.length ? 'Only ' + parts.join(' ') : '';
    }
    return '';
  }

  // ── An item effect in plain words ───────────────────────────────────────
  // Shared by the Combat Toolkit and the Roll Calculator: when it happens, what
  // it does to whom, and for how long. "When activated, gives the holder +5
  // attack damage, this turn." o (all optional): names, the item names by id
  // (for "the holders of ..."); members, [{ id, name }] (for picked players);
  // uses / condition, add its session uses and its condition to the end.
  function refIds(ref) {
    if (Array.isArray(ref)) return ref.map(String);
    try { var a = JSON.parse(ref); return Array.isArray(a) ? a.map(String) : [String(a)]; } catch (_) { return ref ? [String(ref)] : []; }
  }
  // Who it reaches, and how many (for the verb).
  function itemTarget(m, o) {
    switch (m.target_kind) {
      case 'self': return ['the holder', 1];
      case 'group': return ['the whole party', 1];
      case 'class': return ['all ' + (CLASS_PLURAL[m.target_ref] || String(m.target_ref || '').toUpperCase()), 2];
      case 'holder_item': case 'holder_items': {
        var ids = refIds(m.target_ref);
        var names = ids.map(function (id) { return o.names && o.names[id]; }).filter(Boolean);
        if (names.length && names.length === ids.length) return ['the holder' + (names.length > 1 ? 's' : '') + ' of ' + names.join(' and '), names.length > 1 ? 2 : 1];
        return [ids.length > 1 ? 'the items’ holders' : 'the item’s holder', ids.length > 1 ? 2 : 1];
      }
      case 'party_member': return ['a chosen ally', 1];
      case 'party_members': return ['several chosen allies', 2];
      case 'players': {
        var pnames = refIds(m.target_ref).map(function (id) { var mb = (o.members || []).filter(function (x) { return String(x.id) === id; })[0]; return mb ? mb.name : null; }).filter(Boolean);
        return pnames.length ? [pnames.join(' and '), pnames.length > 1 ? 2 : 1] : ['specific players', 2];
      }
      case 'boss': return ['a chosen enemy', 1];
      case 'some_bosses': return [m.target_ref ? 'up to ' + m.target_ref + ' chosen enemies' : 'several chosen enemies', 2];
      case 'all_bosses': return ['all enemies', 2];
      case 'minions': return ['all minions', 2];
    }
    return ['its target', 1];
  }
  function itemWhen(m) {
    if (isCondBuff(m)) return m.duration_turns > 0 ? 'When its condition turns on' : 'While its condition holds';
    if (firesByItself(m)) return 'When its condition turns on';
    return m.mode === 'always' ? 'Always' : m.mode === 'toggle' ? 'While turned on' : 'When activated';
  }
  function itemCore(m, o) {
    var tn = itemTarget(m, o), t = tn[0], many = tn[1] > 1;
    var v = m.value;
    var hit = hitNote(m); hit = hit ? ' (' + hit + ')' : '';
    switch (m.type) {
      case 'roll_bonus': case 'attack_roll': case 'defense_roll': case 'heal_roll': case 'skill_roll':
      case 'attack_output': case 'attack_mult': case 'heal_output': case 'heal_mult': case 'heal_received': case 'extra_attack':
        return 'gives ' + t + ' ' + effectPhrase(m);
      case 'damage_reduction': return t + (many ? ' take ' : ' takes ') + Math.abs(v) + ' less damage per hit';
      case 'vulnerability': return t + (many ? ' take ' : ' takes ') + vulnWords(m);
      case 'weaken': return t + (many ? ' deal ' : ' deals ') + Math.abs(v) + ' less damage';
      case 'stun_immune': return t + (many ? ' are' : ' is') + ' immune to stun';
      case 'shield': return 'shields ' + t + ' for ' + v;
      case 'heal': return 'heals ' + t + ' for ' + v + ' HP';
      case 'damage': return 'deals ' + v + ' damage' + hit + ' to ' + t;
      case 'dot': return 'deals ' + v + ' damage per turn' + hit + ' to ' + t;
      case 'stun': return 'stuns ' + t;
      case 'summon': {
        var sm = m.summon && typeof m.summon === 'object' ? m.summon : (function () { try { return JSON.parse(m.summon) || {}; } catch (_) { return {}; } })();
        var atk = sm.attack_mode === 'd20' ? 'attacks on a d20' : sm.attack ? 'attacks for ' + sm.attack : 'no attack';
        return 'summons ' + (sm.count || 1) + ' × ' + (sm.name || 'Minion') + ' (' + (sm.hp || 1) + ' HP, ' + atk + ', ' + (sm.turns ? sm.turns + ' turns' : 'until defeated') + ')';
      }
    }
    return effectPhrase(m) + ' to ' + t;
  }
  // How long: lasting effects say when they end; one-off actions don't. "Wait
  // a turn" (start_next_turn) starts it next turn. Damage over time and heals
  // each turn never land when pressed (their first tick is the next Next
  // Turn).
  function itemLength(m) {
    var n = m.duration_turns;
    var wait = !!m.start_next_turn;
    if (m.type === 'dot') return n === 1 ? ', next turn' : n > 1 ? ', for ' + n + ' turns, starting next turn' : ', every turn, starting next turn';
    if (m.type === 'heal') {
      if (m.mode !== 'activated') return ' each turn';
      if (n === 1) return wait ? ', next turn' : '';
      return n > 1 ? ' each turn for ' + n + ' turns, starting next turn' : ' each turn, starting next turn';
    }
    if (m.type === 'damage' || m.type === 'summon') return wait ? ', next turn' : '';
    if (m.type === 'shield') return m.mode === 'activated' ? (wait ? ', next turn' : '') : ' each turn';
    if (m.type === 'stun') { var st = Math.max(1, n || 1); return ' for ' + st + ' turn' + (st === 1 ? '' : 's') + (wait ? ', starting next turn' : ''); }
    if (m.mode !== 'activated' || (isCondBuff(m) && !(n > 0))) return '';
    if (wait) return n === 1 ? ', next turn' : n > 1 ? ', for ' + n + ' turns, starting next turn' : ', from next turn for the rest of the session';
    return n === 1 ? ', this turn' : n > 1 ? ', for ' + n + ' turns' : ', for the rest of the session';
  }
  function itemEffectText(m, o) {
    o = o || {};
    var uses = o.uses && m.mode === 'activated' && m.uses_per_session > 0 ? ' · ' + m.uses_per_session + ' use' + (m.uses_per_session === 1 ? '' : 's') + '/session' : '';
    var cnd = o.condition ? conditionPhrase(m.conditions) : '';
    var tail = uses + (cnd ? ' · ' + cnd : '');
    if (m.type === 'none') return (m.mode === 'activated' ? 'Narrative only, pressed to use' + (m.duration_turns === 1 ? ', this turn' : '') + '.' : 'Narrative only.') + tail;
    return itemWhen(m) + ', ' + itemCore(m, o) + itemLength(m) + '.' + (m.type === 'summon' && m.start_next_turn ? ' They attack from next turn.' : '') + tail;
  }

  // How a boss skill effect is used: "Always on: " / "While switched on: " / ''.
  function bossModePrefix(e) {
    return e && e.mode === 'always' ? 'Always on: ' : e && e.mode === 'toggle' ? 'While switched on: ' : '';
  }

  // Who a boss skill reaches, in plain words: players, or the enemies' side.
  function bossTargetPhrase(tk, ref) {
    switch (tk) {
      case 'self': return 'itself';
      case 'ally': return 'a chosen enemy';
      case 'allies': return 'chosen enemies';
      case 'all_allies': return 'all enemies';
      case 'party_member': return 'a chosen player';
      case 'party_members': return 'chosen players';
      case 'class': return 'all ' + (CLASS_PLURAL[ref] || String(ref || '').toUpperCase());
      case 'group': return 'the whole party';
    }
    return 'a target';
  }

  // A boss skill effect in plain words, shared by the Combat Toolkit (withUses:
  // its session limit too) and the Roll Calculator's DM panel.
  function bossEffectText(e, withUses) {
    var cnd = conditionPhrase(e.conditions);
    var uses = withUses && e.uses_per_session > 0 ? ' · ' + e.uses_per_session + ' use' + (e.uses_per_session === 1 ? '' : 's') + '/session' : '';
    return bossModePrefix(e) + bossEffectCore(e) + uses + (cnd ? ' · ' + cnd : '');
  }
  function bossEffectCore(e) {
    // Always on / switched on: no turn count, and a shield tops up each turn.
    var lasting = e.mode === 'always' || e.mode === 'toggle';
    var span = lasting ? '' : e.duration_turns > 0 ? ', for ' + e.duration_turns + ' turns' : ', until removed';
    // Damage over time and heals each turn tick from the next Next Turn.
    var later = lasting ? '' : e.duration_turns > 0 ? ', for ' + e.duration_turns + ' turns, starting next turn' : ', starting next turn, until removed';
    if (e.type === 'none') return 'Narrative effect.';
    var to = bossTargetPhrase(e.target_kind, e.target_ref);
    if (e.type === 'shield' && lasting) return 'Keeps ' + to + ' shielded up to ' + e.value + ', topped up each turn.';
    if (e.type === 'heal') return (e.duration_turns === 1 && !e.start_next_turn && !lasting ? 'Heals ' + to + ' for ' + e.value + ' HP' : 'Heals ' + to + ' for ' + e.value + ' HP per turn' + later) + '.';
    if (e.type === 'damage_reduction') return (e.target_kind === 'self' ? 'Takes ' : 'Gives ' + to + ' ') + e.value + ' less damage per hit' + span + '.';
    if (e.type === 'shield') return 'Shields ' + to + ' for ' + e.value + '.';
    if (e.type === 'attack_output') return 'Gives ' + to + ' +' + e.value + ' damage per hit' + span + '.';
    if (e.type === 'attack_mult') return 'Gives ' + to + ' ×' + e.value + ' damage' + span + '.';
    if (e.type === 'stun_immune') return 'Makes ' + to + ' immune to stun' + span + '.';
    if (e.type === 'vulnerability') return 'Makes ' + to + ' take ' + [e.value > 0 ? '+' + e.value : null, e.mult > 1 ? '×' + e.mult : null].filter(Boolean).join(' & ') + ' damage' + span + '.';
    var hit = hitNote(e); hit = hit ? ' (' + hit + ')' : '';
    if (e.type === 'damage') return 'Deals ' + e.value + ' damage' + hit + ' to ' + to + '.';
    if (e.type === 'stun') { var n = e.duration_turns > 0 ? e.duration_turns : 1; return 'Stuns ' + to + ' for ' + n + ' turn' + (n === 1 ? '' : 's') + '.'; }
    return e.value + ' damage per turn' + hit + ' to ' + to + later + '.';
  }

  global.PVRpShared = {
    SKILLS: SKILLS,
    skillLabel: skillLabel,
    RP_LOCATIONS: RP_LOCATIONS,
    RP_TIMES: RP_TIMES,
    CLASS_PLURAL: CLASS_PLURAL,
    effectPhrase: effectPhrase,
    itemEffectText: itemEffectText,
    isCondBuff: isCondBuff,
    pickNeeded: pickNeeded,
    firesByItself: firesByItself,
    waitsForCondition: waitsForCondition,
    hitNote: hitNote,
    bossDamagePhrase: bossDamagePhrase,
    bossModePrefix: bossModePrefix,
    parseConditions: parseConditions,
    conditionPhrase: conditionPhrase,
    bossTargetPhrase: bossTargetPhrase,
    bossEffectText: bossEffectText
  };
})(window);
