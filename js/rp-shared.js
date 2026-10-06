/**
 * rp-shared.js — lists and plain-language helpers shared by the Roll Calculator
 * (tools/roll-calculator.js) and the Combat Toolkit (admin/rp-rolls.js).
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
      case 'damage_reduction': return '−' + value + ' damage taken';
      case 'shield': return 'grants ' + value + ' shield';
      case 'heal': return 'restores ' + value + ' HP';
      case 'damage': return 'deals ' + value + ' damage';
      case 'dot': return value + ' damage per turn';
      case 'stun_immune': return 'grants stun immunity';
    }
    return v + ' ' + String(type || '').replace(/_/g, ' ');
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

  // Who a boss skill hits, in plain words.
  function bossTargetPhrase(tk, ref) {
    switch (tk) {
      case 'party_member': return 'a chosen player';
      case 'party_members': return 'chosen players';
      case 'class': return 'all ' + (CLASS_PLURAL[ref] || String(ref || '').toUpperCase());
      case 'group': return 'the whole party';
    }
    return 'a target';
  }

  global.PVRpShared = {
    SKILLS: SKILLS,
    skillLabel: skillLabel,
    RP_LOCATIONS: RP_LOCATIONS,
    RP_TIMES: RP_TIMES,
    CLASS_PLURAL: CLASS_PLURAL,
    rollsPhrase: rollsPhrase,
    typePhrase: typePhrase,
    parseConditions: parseConditions,
    conditionPhrase: conditionPhrase,
    bossTargetPhrase: bossTargetPhrase
  };
})(window);
