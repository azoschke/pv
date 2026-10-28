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
  // A roll_bonus modifier boosts one or more rolls with a single value.
  function rollsPhrase(rolls, value) {
    var v = (value >= 0 ? '+' : '') + value;
    var set = Array.isArray(rolls) ? rolls : [];
    if (set.length >= 3) return v + ' to all rolls';
    if (!set.length) return v + ' roll bonus';
    var names = set.map(function (r) { return r === 'attack_roll' ? 'attack' : r === 'defense_roll' ? 'defense' : 'healing'; });
    return v + ' to ' + names.join(' & ') + ' roll' + (set.length > 1 ? 's' : '');
  }
  function typePhrase(type, value) {
    var v = (value >= 0 ? '+' : '') + value;
    switch (type) {
      case 'attack_roll': return v + ' attack roll bonus';
      case 'defense_roll': return v + ' defense roll bonus';
      case 'heal_roll': return v + ' healing roll bonus';
      case 'attack_output': return v + ' bonus attack damage';
      case 'heal_output': return v + ' bonus healing';
      case 'attack_mult': return '×' + value + ' attack damage';
      case 'heal_mult': return '×' + value + ' healing';
      case 'heal_received': return v + ' healing received';
      case 'extra_attack': return v + ' extra attack' + (value === 1 ? '' : 's');
      case 'weaken': return '−' + Math.abs(value) + ' to its damage';
      case 'damage_reduction': return '−' + value + ' damage taken';
      case 'shield': return 'grants ' + value + ' shield';
      case 'heal': return 'restores ' + value + ' HP';
      case 'damage': return 'deals ' + value + ' damage';
      case 'dot': return value + ' damage per turn';
      case 'stun_immune': return 'grants stun immunity';
    }
    return v + ' ' + String(type || '').replace(/_/g, ' ');
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

  // How a strike or damage over time treats the target's defences:
  // "unmitigated" skips damage reduction, "ignores shields" goes straight to HP.
  // '' for anything else.
  // A boss's own damage right now (sync dmg_add / dmg_mult): "+2", "−1 ×2", or ''.
  function bossDamagePhrase(b) {
    var add = (b && b.dmg_add) || 0, mult = (b && b.dmg_mult) || 1;
    var p = [];
    if (add) p.push((add > 0 ? '+' : '−') + Math.abs(add));
    if (mult > 1) p.push('×' + mult);
    return p.join(' ');
  }

  function hitNote(m) {
    if (!m || (m.type !== 'damage' && m.type !== 'dot')) return '';
    return [m.unmitigated ? 'unmitigated' : null, m.ignore_shields ? 'ignores shields' : null].filter(Boolean).join(', ');
  }

  // An effect's length: ", this turn" / ", for 3 turns". "Wait a turn"
  // (start_next_turn) starts it next turn instead. Damage over time and heals
  // each turn never land when pressed (their first tick is the next Next
  // Turn), so they always read from next turn; a heal once with "Wait a turn"
  // heals once, next turn.
  function durationPhrase(m) {
    var n = m.duration_turns;
    if (m.type === 'dot') return n === 1 ? ', next turn' : n > 1 ? ', for ' + n + ' turns, starting next turn' : ', starting next turn';
    if (m.type === 'heal') {
      if (m.mode === 'always' || m.mode === 'toggle') return ', each turn';
      if (n === 1) return m.start_next_turn ? ', next turn' : ', this turn';
      return n > 1 ? ', each turn for ' + n + ' turns, starting next turn' : ', each turn, starting next turn';
    }
    if (m.start_next_turn)
      return n === 1 ? ', next turn' : n > 1 ? ', for ' + n + ' turns, starting next turn' : ', starting next turn';
    return n === 1 ? ', this turn' : n > 1 ? ', for ' + n + ' turns' : '';
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
    rollsPhrase: rollsPhrase,
    typePhrase: typePhrase,
    isCondBuff: isCondBuff,
    pickNeeded: pickNeeded,
    firesByItself: firesByItself,
    waitsForCondition: waitsForCondition,
    hitNote: hitNote,
    bossDamagePhrase: bossDamagePhrase,
    bossModePrefix: bossModePrefix,
    durationPhrase: durationPhrase,
    parseConditions: parseConditions,
    conditionPhrase: conditionPhrase,
    bossTargetPhrase: bossTargetPhrase,
    bossEffectText: bossEffectText
  };
})(window);
