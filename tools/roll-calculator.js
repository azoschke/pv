// ============================================================================
//  RollCalculator (v7) — player + DM roll calculator / party tracker.
//  v7: borderless layout — one tabbed action composer, enemy/party targeting
//  with live projections, item image strip, Active Skills modal, collapsible
//  DM Control Deck. Data plumbing / handlers unchanged from v6.
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useRef = React.useRef;

  var POLL_MS = 5000;

  var ARMOR_LABEL = { heavy: 'Heavy Armor', medium: 'Medium Armor', light: 'Light Armor' };
  var ROLE_LABEL  = { tank: 'Tank', dps: 'DPS', healer: 'Healer' };
  var BUFF_LABEL  = { attack_roll: 'Attack', defense_roll: 'Defense', heal_roll: 'Heal' };
  // Material Symbols glyphs per buff type (crossed swords / reinforced shield / heart).
  var BUFF_ICON   = { attack_roll: 'swords', defense_roll: 'add_moderator', heal_roll: 'favorite' };
  // Tab glyphs.
  var TAB_ICON = { attack: 'swords', heal: 'healing', buff: 'auto_awesome', defend: 'shield', skill: 'target' };
  // Character skill checks (d20 + item skill bonuses). Kept in sync with the
  // admin item editor's skill list.
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
  function skillPhrase(skill, value) { return (value >= 0 ? '+' : '') + value + ' to ' + skillLabel(skill) + ' checks'; }

  var FALLBACK_RULES = {
    role_base_hp: { tank: 25, dps: 20, healer: 15 },
    shield_max: 3,
    armor: { heavy: { attack: -1, defense: 2 }, medium: { attack: 1, defense: 1 }, light: { attack: 2, defense: -1 } },
    class_passives: [
      { class: 'dps', type: 'attack_roll', value: 1, label: 'DPS Passive' },
      { class: 'tank', type: 'defense_roll', value: 2, label: 'Tank Passive' }
    ],
    damage_tiers: [{ min: 20, damage: 5 }, { min: 16, damage: 4 }, { min: 11, damage: 3 }, { min: 6, damage: 2 }, { min: 0, damage: 1 }],
    attack_die: 20, heal_die: 5, aoe_max_targets: 5, max_damage_per_attack: 15,
    actions_per_turn: 1, action_types: { attack: true, heal: true, buff: true }
  };
  function rulesOf(data) { return (data && data.rules) || FALLBACK_RULES; }

  function damageFor(rules, r) {
    var tiers = (rules.damage_tiers || []).slice().sort(function (a, b) { return b.min - a.min; });
    for (var i = 0; i < tiers.length; i++) { if (r >= tiers[i].min) return tiers[i].damage; }
    return tiers.length ? tiers[tiers.length - 1].damage : 1;
  }
  // Clamp a raw number-input string to [0, max]; keeps '' so the field can be cleared.
  function clampNum(raw, max) { if (raw === '' || raw == null) return ''; var n = parseInt(raw, 10); if (isNaN(n)) return ''; if (n < 0) n = 0; if (n > max) n = max; return String(n); }
  function fmt(n) { return (n >= 0 ? '+' : '') + n; }
  // Shorten a multi-word name to "First L." — used on the heal target so the
  // highlighted row (ring + pill) wraps less. Single-word names are left alone.
  function abbrevLastName(name) {
    var parts = String(name || '').trim().split(/\s+/);
    if (parts.length < 2) return name;
    return parts.slice(0, -1).join(' ') + ' ' + parts[parts.length - 1].charAt(0) + '.';
  }
  function modLabel(m) { return m.label ? m.label : (m.item_name + (m.ability_name ? ' · ' + m.ability_name : '')); }
  function targetText(m) {
    switch (m.target_kind) {
      case 'self': return 'self'; case 'group': return 'group';
      case 'class': return String(m.target_ref || '').toUpperCase();
      case 'holder_item': case 'holder_items': return 'item holders';
      case 'party_member': return 'chosen target'; case 'party_members': return 'chosen targets';
      case 'some_bosses': return 'chosen enemies'; case 'all_bosses': return 'all enemies';
    }
    return '';
  }

  // ── Plain-language descriptions ────────────────────────────────────────────
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
    }
    return v + ' ' + String(type || '').replace(/_/g, ' ');
  }
  function targetPhrase(tk, ref) {
    switch (tk) {
      case 'self': return 'the holder';
      case 'group': return 'the whole party';
      case 'class': return 'all ' + (CLASS_PLURAL[ref] || String(ref || '').toUpperCase());
      case 'holder_item': return 'the item’s holder';
      case 'holder_items': return 'the items’ holders';
      case 'party_member': return 'a chosen ally';
      case 'party_members': return 'several chosen allies';
      case 'boss': return 'a chosen enemy';
      case 'some_bosses': return 'several chosen enemies';
      case 'all_bosses': return 'all enemies';
    }
    return '';
  }
  // For a catalogue modifier (My Items / admin): full "when → what → to whom" sentence.
  function describeModifier(m) {
    if (m.type === 'none') return m.label || 'Special effect — see the item text.';
    var when = m.mode === 'always' ? 'Always' : m.mode === 'toggle' ? 'While turned on' : 'When activated';
    var core = m.type === 'roll_bonus' ? rollsPhrase(m.rolls, m.value) : m.type === 'skill_roll' ? skillPhrase(m.skill, m.value) : typePhrase(m.type, m.value);
    var to = ' to ' + targetPhrase(m.target_kind, m.target_ref);
    var dur = m.duration_turns === 1 ? ', this turn' : m.duration_turns > 1 ? ', for ' + m.duration_turns + ' turns' : '';
    return when + ', ' + core + to + dur + '.';
  }
  // For an active effect (already resolved target_label + remaining turns).
  function describeActiveEffect(e) {
    if (e.type === 'none') return e.label || 'Special effect';
    var core = e.type === 'roll_bonus' ? rollsPhrase(e.rolls, e.value) : e.type === 'skill_roll' ? skillPhrase(e.skill, e.value) : typePhrase(e.type, e.value);
    var tp = targetPhrase(e.target_kind, e.target_ref);
    if (e.target_kind === 'party_member' || e.target_kind === 'party_members') tp = e.target_label || tp;
    if (e.target_kind === 'holder_item' || e.target_kind === 'holder_items') tp = e.target_label || tp;
    var to = tp ? ' to ' + tp : '';
    var dur = e.remaining_turns != null ? ' — ' + e.remaining_turns + (e.duration_turns ? ' of ' + e.duration_turns : '') + ' turn' + (e.remaining_turns === 1 && !e.duration_turns ? '' : 's') + ' left' : '';
    return core + to + dur;
  }

  // ── Action economy (client view) ──────────────────────────────────────────
  function canAct(data, type) {
    var t = data.my_turn;
    if (!t) return type === 'heal' ? !data.healed_this_turn : true;
    if (t.ko) return false;
    var rules = rulesOf(data);
    if (rules.action_types && rules.action_types[type] === false) return true;
    if (type === 'buff' && (t.actions || []).indexOf('buff') !== -1) return true;
    if (!t.limit) return true;  // 0 = unlimited
    return t.used < t.limit;
  }
  function actionBlockReason(data, type) {
    var t = data.my_turn;
    if (t && t.ko) return 'You’re knocked out — you can’t act until your HP is restored.';
    if (type === 'heal' && !t && data.healed_this_turn) return 'You can only heal once per turn.';
    // "Action used this turn" is already shown in the turn banner above the
    // composer — no need to repeat it as a note on each tabbed card.
    return '';
  }
  function ActionChip(props) {
    var t = props.myTurn;
    if (!t) return null;
    if (t.ko) return h('span', { className: 'rp-action-chip is-ko' }, 'Knocked Out');
    if (t.limit > 0 && t.used >= t.limit) return h('span', { className: 'rp-action-chip is-used' }, 'Action used: ' + (t.actions || []).join(', '));
    return h('span', { className: 'rp-action-chip is-ready' }, 'Action ready');
  }

  // ── Roll math ─────────────────────────────────────────────────────────────
  function computeRoll(kind, raw, ctx) {
    var rollType = kind === 'attack' ? 'attack_roll' : kind === 'defense' ? 'defense_roll' : 'heal_roll';
    var outputType = kind === 'attack' ? 'attack_output' : kind === 'heal' ? 'heal_output' : null;
    var rules = ctx.rules;
    var c = ctx.character; var rows = []; var base = parseInt(raw, 10); if (isNaN(base)) base = 0; var total = base;
    function add(label, val) { if (val) { rows.push({ label: label, value: val }); total += val; } }
    var armor = rules.armor[c.armor_type] || { attack: 0, defense: 0 };
    if (kind === 'attack')  add(ARMOR_LABEL[c.armor_type], armor.attack);
    if (kind === 'defense') add(ARMOR_LABEL[c.armor_type], armor.defense);
    (rules.class_passives || []).forEach(function (p) { if (p.class === c.class_role && p.type === rollType) add(p.label || (p.class.toUpperCase() + ' Passive'), p.value); });
    ctx.myModifiers.forEach(function (m) { if (m.type === rollType) add(modLabel(m), m.value); });
    var outputRows = [], outputTotal = 0;
    if (outputType) ctx.myModifiers.forEach(function (m) { if (m.type === outputType) { outputRows.push({ label: modLabel(m), value: m.value }); outputTotal += m.value; } });
    // Attack damage multipliers (item attack_mult) stack multiplicatively.
    var mult = 1, multRows = [];
    if (kind === 'attack') ctx.myModifiers.forEach(function (m) { if (m.type === 'attack_mult' && m.value >= 1) { mult *= m.value; multRows.push({ label: modLabel(m), value: m.value }); } });
    return { base: base, rows: rows, total: total, outputRows: outputRows, outputTotal: outputTotal, mult: mult, multRows: multRows };
  }

  // Skill check: raw d20 + any item "skill bonus" modifiers for that skill.
  // Conditional bonuses are just skill modifiers on a toggle/press ability, so
  // whatever the player has active counts here.
  function computeSkill(skill, raw, myModifiers) {
    var base = parseInt(raw, 10); if (isNaN(base)) base = 0;
    var rows = []; var total = base;
    (myModifiers || []).forEach(function (m) { if (m.type === 'skill_roll' && m.skill === skill) { rows.push({ label: modLabel(m), value: m.value }); total += m.value; } });
    return { base: base, rows: rows, total: total };
  }

  // ── Presentational building blocks ─────────────────────────────────────────
  // The hero roll field — the largest control in a composer.
  function RollHero(props) {
    return h('label', { className: 'rp-roll-hero' },
      h('input', { className: 'rp-roll-input', type: 'number', inputMode: 'numeric', min: 0, max: props.max,
        value: props.value, placeholder: props.placeholder != null ? props.placeholder : '0', disabled: props.disabled,
        'aria-label': props.ariaLabel, onChange: props.onChange }),
      h('span', { className: 'rp-roll-caption' }, props.caption));
  }
  // A horizontal "roll + mods = result" chip expression. terms are plain strings.
  function ChipExpr(props) {
    var kids = [];
    (props.terms || []).forEach(function (t, i) {
      if (i) kids.push(h('span', { className: 'rp-chip-op', key: 'op' + i }, '+'));
      kids.push(h('span', { className: 'rp-chip', key: 't' + i }, t));
    });
    kids.push(h('span', { className: 'rp-chip-op', key: 'eq' }, '='));
    kids.push(h('span', { className: 'rp-chip rp-chip-result tone-' + (props.tone || 'neutral'), key: 'res' }, props.resultText));
    return h('div', { className: 'rp-chip-expr' }, kids);
  }

  // Even split of a pool across N member ids; earliest ids take the remainder.
  function evenSplit(ids, total) {
    var out = {}; var n = ids.length; if (!n) return out;
    var base = Math.floor(total / n); var rem = total - base * n;
    ids.forEach(function (id, i) { out[id] = base + (i < rem ? 1 : 0); });
    return out;
  }

  // ── Gate cards ────────────────────────────────────────────────────────────
  function LockedCard() {
    return h('div', { className: 'rp-gate' },
      h('span', { className: 'material-icons rp-gate-icon', 'aria-hidden': 'true' }, 'lock'),
      h('h2', null, 'Members only'),
      h('p', null, 'Sign in with your account to use the Roll Calculator.'),
      h('a', { className: 'rp-btn', href: '/pv/admin/login.html?redirect=/pv/tools/roll-calculator.html' }, 'Sign in'));
  }
  function PausedCard(props) {
    return h('div', { className: 'rp-gate' },
      h('span', { className: 'material-icons rp-gate-icon', 'aria-hidden': 'true' }, 'pause_circle'),
      h('h2', null, props.title || 'No active session'),
      h('p', null, props.message || 'There is no live campaign session right now.'),
      props.onResume ? h('button', { type: 'button', className: 'rp-btn', onClick: props.onResume }, 'Resume session') : null);
  }

  // ── Battlefield (enemies) ──────────────────────────────────────────────────
  function BossHpBar(props) {
    var b = props.boss;
    if (b.current_hp == null) {
      return h('div', { className: 'rp-boss-hp is-hidden' },
        h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'visibility_off'),
        h('span', null, 'HP hidden'));
    }
    var pct = b.max_hp > 0 ? Math.max(0, Math.min(100, Math.round(b.current_hp / b.max_hp * 100))) : 0;
    return h('div', { className: 'rp-boss-hp' },
      h('div', { className: 'rp-hpbar' }, h('div', { className: 'rp-hpbar-fill', style: { width: pct + '%' } })),
      h('span', { className: 'rp-boss-hp-num' }, b.current_hp + ' / ' + b.max_hp));
  }
  function vulnText(b) {
    if (!b || !(b.damage_mult > 1)) return null;
    return b.damage_mult + '× vulnerable' + (b.damage_mult_turns != null ? ' · ' + b.damage_mult_turns + (b.damage_mult_turns === 1 ? ' turn' : ' turns') : '');
  }
  function BossCard(props) {
    var b = props.boss;
    var vuln = vulnText(b);
    var revealed = b.revealed_skills || [];
    var openState = useState(false); var open = openState[0], setOpen = openState[1];
    // Track which revealed skills the viewer has seen, so a newly-shown skill
    // gets an unseen badge (like Active Skills). Opening the list marks them seen.
    var seenState = useState({}); var seen = seenState[0], setSeen = seenState[1];
    var revealedIds = revealed.map(function (s) { return s.id; }).join(',');
    useEffect(function () {
      if (open && revealed.length) setSeen(function (prev) { var m = Object.assign({}, prev); revealed.forEach(function (s) { m[s.id] = true; }); return m; });
    }, [open, revealedIds]);
    var unseenSkills = revealed.filter(function (s) { return !seen[s.id]; }).length;
    // Attack-mode: the card is the enemy target picker.
    var clickable = props.attackMode && !b.defeated;
    function pick() { if (clickable && props.onTarget) props.onTarget(String(b.id)); }
    return h('div', { className: 'rp-boss-card' + (b.defeated ? ' is-down' : '') + (props.isTarget ? ' is-target' : '') + (clickable ? ' is-pickable' : ''),
        role: clickable ? 'button' : null, tabIndex: clickable ? 0 : null,
        'aria-pressed': clickable ? (props.isTarget ? 'true' : 'false') : null,
        onClick: clickable ? pick : null,
        onKeyDown: clickable ? function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } } : null },
      b.image_url ? h('img', { className: 'rp-boss-img', src: b.image_url, alt: '', onError: function (e) { e.target.style.display = 'none'; } }) : null,
      h('div', { className: 'rp-boss-info' },
        h('div', { className: 'rp-boss-name' }, b.name,
          b.defeated ? h('span', { className: 'rp-boss-down-tag' }, 'Defeated') : null,
          vuln ? h('span', { className: 'rp-boss-vuln-tag' }, vuln) : null),
        h('div', { className: 'rp-boss-hp-line' },
          h(BossHpBar, { boss: b }),
          props.isDM ? h('button', { type: 'button', className: 'rp-boss-eye',
            title: b.hp_visible ? 'HP is visible to players — click to hide' : 'HP is hidden from players — click to show',
            onClick: function (e) { e.stopPropagation(); props.onBossVisible(b, !b.hp_visible); } },
            h('span', { className: 'material-icons', 'aria-hidden': 'true' }, b.hp_visible ? 'visibility' : 'visibility_off')) : null),
        props.isDM && !b.hp_visible ? h('div', { className: 'rp-boss-hp-hidden' }, 'HP hidden from players') : null,
        props.isTarget ? h('div', { className: 'rp-boss-target-note' }, 'Target') : null,
        (b.dots && b.dots.length) ? h('div', { className: 'rp-boss-dots' },
          b.dots.map(function (dt) {
            return h('span', { className: 'rp-boss-dot', key: dt.id },
              '🔥 ' + (dt.label || 'DoT') + ' ' + dt.value + '/turn' + (dt.remaining_turns != null ? ' · ' + dt.remaining_turns + ' left' : ''),
              props.isDM ? h('button', { type: 'button', className: 'rp-chip-x', title: 'Clear DoT', onClick: function (e) { e.stopPropagation(); props.onBossDotRemove(b, dt); } }, '✕') : null);
          })) : null,
        revealed.length ? h('div', { className: 'rp-boss-skills' },
          h('button', { type: 'button', className: 'rp-boss-skills-toggle', onClick: function (e) { e.stopPropagation(); setOpen(!open); } },
            (open ? '▾ ' : '▸ ') + revealed.length + ' skill' + (revealed.length === 1 ? '' : 's'),
            (!open && unseenSkills > 0) ? h('span', { className: 'rp-boss-skills-badge' }, String(unseenSkills)) : null),
          open ? h('div', { className: 'rp-boss-skills-pop' }, revealed.map(function (s) {
            return h('div', { className: 'rp-boss-tele', key: s.id },
              h('strong', null, s.name), s.description ? ' — ' + s.description : null);
          })) : null) : null));
  }
  function BossBar(props) {
    var bosses = props.bosses || [];
    if (!bosses.length) return null;
    return h('div', { className: 'rp-battlefield' },
      h('h3', { className: 'rp-section-label' }, 'Enemies'),
      h('div', { className: 'rp-bossbar' },
        bosses.map(function (b) {
          return h(BossCard, { key: b.id, boss: b, isDM: props.isDM,
            attackMode: props.attackMode, isTarget: props.attackMode && String(b.id) === String(props.targetId), onTarget: props.onTarget,
            onBossVisible: props.onBossVisible, onBossDotRemove: props.onBossDotRemove });
        })));
  }

  // ── Modifier row (in item detail) ──────────────────────────────────────────
  function ModifierRow(props) {
    var m = props.modifier;
    var targetState = useState(''); var pickTarget = targetState[0], setPickTarget = targetState[1];
    var targetsState = useState([]); var pickTargets = targetsState[0], setPickTargets = targetsState[1];
    function togglePick(id) { setPickTargets(function (cur) { return cur.indexOf(id) !== -1 ? cur.filter(function (x) { return x !== id; }) : cur.concat([id]); }); }
    var bossPickState = useState(''); var bossPick = bossPickState[0], setBossPick = bossPickState[1];
    var bossPicksState = useState([]); var bossPicks = bossPicksState[0], setBossPicks = bossPicksState[1];
    function toggleBoss(id, cap) { setBossPicks(function (cur) { if (cur.indexOf(id) !== -1) return cur.filter(function (x) { return x !== id; }); if (cap && cur.length >= cap) return cur; return cur.concat([id]); }); }
    var plain = describeModifier(m);
    var extras = [];
    if (m.mode === 'activated' && m.uses_per_session > 0) extras.push((m.uses_per_session - (m.uses_this_session || 0)) + ' of ' + m.uses_per_session + ' uses left');
    if (m.active && m.remaining_turns != null) extras.push('active — ' + m.remaining_turns + (m.duration_turns ? ' of ' + m.duration_turns : '') + ' turns left');
    else if (m.active) extras.push('active now');

    var spent = m.mode === 'activated' && m.uses_per_session > 0 && (m.uses_this_session || 0) >= m.uses_per_session;
    var liveBosses = (props.bosses || []).filter(function (b) { return !b.defeated; });
    var control;
    if (m.mode === 'activated') {
      var needTarget = m.target_kind === 'party_member';    // one ally
      var needTargets = m.target_kind === 'party_members';  // several allies
      var needBoss = m.target_kind === 'boss';              // one enemy
      var needBosses = m.target_kind === 'some_bosses';     // several enemies (cap in target_ref)
      var allBosses = m.target_kind === 'all_bosses';       // every enemy
      var bossCap = needBosses ? (parseInt(m.target_ref, 10) || 0) : 0; // 0 = no cap
      var bossSel = needBoss ? (bossPick && liveBosses.some(function (b) { return String(b.id) === bossPick; }) ? bossPick : (liveBosses.length ? String(liveBosses[0].id) : '')) : '';
      var disabled = props.locked || spent || (needTarget && !pickTarget) || (needTargets && !pickTargets.length) || (needBoss && !bossSel) || (needBosses && !bossPicks.length) || (allBosses && !liveBosses.length);
      control = h('div', { className: 'rp-mod-control' },
        needTarget ? h('select', { className: 'rp-select', value: pickTarget, disabled: props.locked, onChange: function (e) { setPickTarget(e.target.value); } },
          h('option', { value: '' }, 'target…'),
          props.party.map(function (p) { return h('option', { key: p.member_id, value: p.member_id }, p.member_name); })) : null,
        needTargets ? h('div', { className: 'rp-pick-multi' },
          props.party.map(function (p) {
            return h('label', { key: p.member_id, className: 'rp-pick-chip' + (pickTargets.indexOf(p.member_id) !== -1 ? ' is-on' : '') },
              h('input', { type: 'checkbox', checked: pickTargets.indexOf(p.member_id) !== -1, disabled: props.locked, onChange: function () { togglePick(p.member_id); } }),
              p.member_name);
          })) : null,
        needBosses ? h('div', { className: 'rp-pick-multi' },
          (bossCap ? [h('span', { key: 'cap', className: 'rp-pick-cap' }, 'pick up to ' + bossCap)] : []).concat(
          liveBosses.map(function (b) {
            var on = bossPicks.indexOf(String(b.id)) !== -1;
            return h('label', { key: b.id, className: 'rp-pick-chip' + (on ? ' is-on' : '') },
              h('input', { type: 'checkbox', checked: on, disabled: props.locked || (!on && bossCap && bossPicks.length >= bossCap), onChange: function () { toggleBoss(String(b.id), bossCap); } }),
              b.name);
          }))) : null,
        (needBoss && liveBosses.length > 1) ? h('select', { className: 'rp-select', value: bossSel, disabled: props.locked, onChange: function (e) { setBossPick(e.target.value); } },
          liveBosses.map(function (b) { return h('option', { key: b.id, value: b.id }, b.name); })) : null,
        h('button', { type: 'button', className: 'rp-btn is-small', disabled: disabled,
          onClick: function () { props.onActivate(m, { memberId: needTarget ? Number(pickTarget) : null, memberIds: needTargets ? pickTargets.slice() : null, bossId: needBoss ? bossSel : null, bossIds: needBosses ? bossPicks.slice() : null, allBosses: allBosses }); } }, spent ? 'Spent' : 'Activate'));
    } else {
      control = h('button', { type: 'button', className: 'rp-btn is-small' + (m.active ? ' is-active' : ''), disabled: props.locked,
        onClick: function () { props.onToggle(m, !m.active); } }, m.active ? 'On' : 'Off');
    }
    return h('div', { className: 'rp-mod' },
      h('div', { className: 'rp-mod-info' },
        h('span', null, h('strong', null, m.label || (m.type === 'none' ? 'Effect' : typePhrase(m.type, m.value)))),
        h('span', { className: 'rp-mod-meta' }, plain + (extras.length ? ' · ' + extras.join(' · ') : ''))),
      m.type === 'none' && m.mode === 'always' ? null : control);
  }

  // ── Items — image strip + inline detail (no modal) ─────────────────────────
  var ITEM_FALLBACK_BG = 'linear-gradient(135deg, #2a1f1c 0%, #14100e 100%)';
  function ItemTile(props) {
    var it = props.item;
    return h('button', { type: 'button', className: 'rp-item-tile' + (props.selected ? ' is-selected' : ''), 'aria-pressed': props.selected ? 'true' : 'false',
        'aria-label': it.name, onClick: props.onSelect },
      h('span', { className: 'rp-item-thumb sketch-wash' },
        it.image_url
          ? h('img', { className: 'rp-item-thumb-img', src: it.image_url, alt: '', loading: 'lazy', onError: function (e) { e.target.style.display = 'none'; } })
          : h('span', { className: 'rp-item-thumb-fallback', 'aria-hidden': 'true', style: { background: ITEM_FALLBACK_BG } }),
        h('span', { className: 'contrast-border-half', 'aria-hidden': 'true' })),
      h('span', { className: 'rp-item-tile-name' }, it.name));
  }
  function ItemDetail(props) {
    var it = props.item;
    return h('div', { className: 'rp-item-detail' },
      h('h3', { className: 'rp-item-detail-name' }, it.name),
      it.description ? h('p', { className: 'rp-item-detail-desc' }, it.description) : null,
      (it.abilities || []).length ? h('div', { className: 'rp-item-abilities' },
        (it.abilities || []).map(function (ab) {
          return h('div', { className: 'rp-item-ability', key: ab.id },
            h('div', { className: 'rp-ability-head' },
              h('strong', null, ab.name),
              ab.activate_all ? h('button', { type: 'button', className: 'rp-btn is-small is-ghost', disabled: props.locked,
                onClick: function () { props.onActivateAll(ab); } }, 'Activate all') : null),
            ab.description ? h('p', { className: 'rp-item-ability-desc' }, ab.description) : null,
            (ab.modifiers || []).map(function (m) {
              return h(ModifierRow, { key: m.id, modifier: m, party: props.party, bosses: props.bosses, locked: props.locked, onToggle: props.onToggle, onActivate: props.onActivate });
            }));
        })) : null);
  }
  function ItemsStrip(props) {
    var items = props.items || [];
    var openState = useState(null); var openId = openState[0], setOpenId = openState[1];
    if (!items.length) return null;  // no items → hide the section entirely
    // Default to the first item selected, and re-derive the open item from live
    // props each render so its controls track the latest poll (active/uses state).
    var effId = (openId != null && items.some(function (it) { return it.item_id === openId; })) ? openId : items[0].item_id;
    var openItem = items.filter(function (it) { return it.item_id === effId; })[0];
    return h('div', { className: 'rp-items-panel' },
      h('h3', { className: 'rp-section-label' }, 'Items'),
      h('div', { className: 'rp-items-strip' },
        items.map(function (it) {
          return h(ItemTile, { key: it.item_id, item: it, selected: it.item_id === effId, onSelect: function () { setOpenId(it.item_id); } });
        })),
      openItem ? h(ItemDetail, { item: openItem, party: props.party, bosses: props.bosses, locked: props.locked,
        onToggle: props.onToggle, onActivate: props.onActivate, onActivateAll: props.onActivateAll }) : null);
  }

  // ── Personal buffs ────────────────────────────────────────────────────────
  // A buff is placed as a single editable DRAFT during your turn (your action).
  // Attacking or healing instead discards it; at End Turn it commits and goes
  // live the FOLLOWING turn. Committed buffs are read-only here — only the DM can
  // change them, from the Active Effects panel.
  var BUFF_COMMIT_MS = 900;
  function DraftBuffRow(props) {
    var d = props.draft;
    var typeState = useState(d ? d.type : ''); var type = typeState[0], setType = typeState[1];
    var valState = useState(d ? String(d.value) : '1'); var val = valState[0], setVal = valState[1];
    var durState = useState(d ? String(d.duration) : '1'); var dur = durState[0], setDur = durState[1];
    var timerRef = useRef(null); var pendingRef = useRef(false);
    // Sync from props only when settled, so a debounced edit isn't clobbered mid-typing.
    useEffect(function () { if (!pendingRef.current) { setType(d ? d.type : ''); setVal(d ? String(d.value) : '1'); setDur(d ? String(d.duration) : '1'); } },
      [d ? d.type : '', d ? d.value : null, d ? d.duration : null]);
    useEffect(function () { return function () { if (timerRef.current) clearTimeout(timerRef.current); }; }, []);
    function fire(nextType, rawV, rawD) {
      pendingRef.current = false;
      if (!nextType) { props.onSave({ clear: true }); return; }
      var n = parseInt(rawV, 10); if (isNaN(n)) n = 0;
      var dd = parseInt(rawD, 10); if (isNaN(dd) || dd < 1) dd = 1;
      props.onSave({ type: nextType, value: n, duration: dd });
    }
    // Debounced — a fresh draft starts at a default that's usually corrected right
    // away, so hold the write until it settles.
    function schedule(nextType, rawV, rawD) { pendingRef.current = true; if (timerRef.current) clearTimeout(timerRef.current); timerRef.current = setTimeout(function () { fire(nextType, rawV, rawD); }, BUFF_COMMIT_MS); }
    function onType(e) { var t = e.target.value; setType(t); if (timerRef.current) clearTimeout(timerRef.current); if (!t) { fire('', val, dur); } else { schedule(t, val, dur); } }
    function onVal(e) { var v = e.target.value; setVal(v); if (type) schedule(type, v, dur); }
    function onDur(e) { var v = e.target.value; setDur(v); if (type) schedule(type, val, v); }
    function commitNow() { if (timerRef.current) clearTimeout(timerRef.current); if (type) fire(type, val, dur); }
    // Apply saves the current values and commits them now (locks the buff in as this
    // turn's action) instead of waiting for the DM's End Turn.
    function applyNow() {
      if (!type) return;
      pendingRef.current = false; if (timerRef.current) clearTimeout(timerRef.current);
      var n = parseInt(val, 10); if (isNaN(n)) n = 0;
      var dd = parseInt(dur, 10); if (isNaN(dd) || dd < 1) dd = 1;
      props.onApply({ type: type, value: n, duration: dd });
    }
    return h('div', { className: 'rp-buff-row' },
      h('span', { className: 'rp-buff-label' }, 'Set one buff'),
      h('div', { className: 'rp-buff-controls' },
        h('select', { className: 'rp-select', value: type, disabled: props.disabled, onChange: onType },
          h('option', { value: '' }, '— empty —'), h('option', { value: 'attack_roll' }, 'Attack'), h('option', { value: 'defense_roll' }, 'Defense'), h('option', { value: 'heal_roll' }, 'Heal')),
        type ? h('input', { className: 'rp-buff-val', type: 'number', inputMode: 'numeric', value: val, disabled: props.disabled, title: 'Bonus',
          onChange: onVal, onBlur: commitNow, onKeyDown: function (e) { if (e.key === 'Enter') e.target.blur(); } }) : null,
        type ? h('label', { className: 'rp-buff-dur', title: 'Turns the buff stays active once it goes live' },
          h('span', null, 'for'),
          h('input', { className: 'rp-buff-val rp-buff-dur-input', type: 'number', min: 1, inputMode: 'numeric', value: dur, disabled: props.disabled,
            onChange: onDur, onBlur: commitNow, onKeyDown: function (e) { if (e.key === 'Enter') e.target.blur(); } }),
          h('span', null, 'turns')) : null,
        type ? h('button', { type: 'button', className: 'rp-btn is-small', disabled: props.disabled, title: 'Lock this buff in as your action for the turn', onClick: applyNow }, 'Apply') : null));
  }
  function buffStatusText(b) {
    if (b.state === 'draft') return 'becomes your action at end of turn';
    if (b.pending) return 'activates next turn (' + b.duration + (b.duration === 1 ? ' turn)' : ' turns)');
    if (!b.enabled) return 'paused by DM';
    return b.remaining_turns + (b.remaining_turns === 1 ? ' turn left' : ' turns left');
  }
  // The three buff slots, visualised as chips (committed buffs + an active shield,
  // then empties). Max 3, an active shield counting as one.
  function BuffSlots(props) {
    var committed = props.committed || [];
    var chips = [];
    committed.forEach(function (b) { chips.push({ key: 'b' + b.id, label: (BUFF_LABEL[b.type] || b.type) + ' ' + fmt(b.value), meta: buffStatusText(b), on: true }); });
    if (props.shield > 0) chips.push({ key: 'shield', label: 'Shield ' + props.shield, meta: 'active', on: true });
    while (chips.length < 3) chips.push({ key: 'empty' + chips.length, label: 'slot ' + (chips.length + 1) + ' · empty', meta: '', on: false });
    return h('div', { className: 'rp-buff-slots' },
      chips.slice(0, 3).map(function (c) {
        return h('div', { className: 'rp-buff-slot' + (c.on ? ' is-filled' : ''), key: c.key, title: c.meta || undefined },
          h('span', { className: 'rp-buff-slot-name' }, c.label),
          c.meta ? h('span', { className: 'rp-buff-slot-meta' }, c.meta) : null);
      }));
  }
  function BuffComposer(props) {
    var c = props.character;
    var buffs = props.buffs || [];
    var committed = buffs.filter(function (b) { return b.state === 'committed'; });
    var draft = buffs.filter(function (b) { return b.state === 'draft'; })[0] || null;
    var shieldSlots = c.shield_value > 0 ? 1 : 0;
    var usedSlots = committed.length + shieldSlots;
    var roomForNew = usedSlots < 3;
    var disabled = props.locked || !props.canBuff;
    var showDraft = !!draft || (roomForNew && props.canBuff && !props.locked);
    return h('div', { className: 'rp-composer' },
      props.blockReason ? h('p', { className: 'rp-note rp-note-warn' }, props.blockReason) : null,
      h(BuffSlots, { committed: committed, shield: c.shield_value }),
      showDraft
        ? h(DraftBuffRow, { draft: draft, disabled: disabled, onSave: props.onSaveDraft, onApply: props.onApplyBuff })
        : (!committed.length ? h('p', { className: 'rp-note' }, roomForNew ? 'Setting a buff uses your action this turn.' : 'Buff slots full (max 3; an active shield counts as one).') : null),
      h('p', { className: 'rp-note' }, 'Set one buff per turn. Attacking or healing will discard a pending buff. Max buff 3 slots, including shield.'));
  }

  // ── Party (HP + shield, universal) ────────────────────────────────────────
  function Stepper(props) {
    return h('div', { className: 'rp-stepper' },
      h('button', { type: 'button', className: 'rp-step-btn', disabled: props.disabled, 'aria-label': 'Decrease', onClick: function () { props.onChange(props.value - 1); } }, h('span', { className: 'material-symbols-outlined', 'aria-hidden': 'true' }, 'remove')),
      h('span', { className: 'rp-step-val' + (props.compact ? ' is-compact' : '') }, props.label),
      h('button', { type: 'button', className: 'rp-step-btn', disabled: props.disabled, 'aria-label': 'Increase', onClick: function () { props.onChange(props.value + 1); } }, h('span', { className: 'material-symbols-outlined', 'aria-hidden': 'true' }, 'add')));
  }
  // HP control: free-typed absolute value plus ± nudges. Nudges update the display
  // instantly but the write is debounced, so a burst of clicks lands as one PATCH —
  // i.e. one net-delta entry in the DM log instead of one per click.
  var HP_COMMIT_MS = 700;
  function HpStepper(props) {
    var valState = useState(String(props.value)); var val = valState[0], setVal = valState[1];
    var timerRef = useRef(null);
    var pendingRef = useRef(false);  // an uncommitted local edit is in flight
    // Sync from props only when settled, so a background poll can't yank the field mid-edit.
    useEffect(function () { if (!pendingRef.current) setVal(String(props.value)); }, [props.value]);
    useEffect(function () { return function () { if (timerRef.current) clearTimeout(timerRef.current); }; }, []);
    function clamp(n) { if (n < 0) n = 0; if (props.max != null && n > props.max) n = props.max; return n; }
    function commitNow(n) { pendingRef.current = false; n = clamp(n); if (n !== props.value) props.onChange(n); }
    function schedule(n) { pendingRef.current = true; if (timerRef.current) clearTimeout(timerRef.current); timerRef.current = setTimeout(function () { commitNow(n); }, HP_COMMIT_MS); }
    function nudge(d) { var cur = parseInt(val, 10); if (isNaN(cur)) cur = props.value; var next = clamp(cur + d); setVal(String(next)); schedule(next); }
    function commitTyped() { if (timerRef.current) clearTimeout(timerRef.current); var n = parseInt(val, 10); if (isNaN(n)) { pendingRef.current = false; setVal(String(props.value)); return; } n = clamp(n); setVal(String(n)); commitNow(n); }
    return h('div', { className: 'rp-stepper' },
      h('button', { type: 'button', className: 'rp-step-btn', disabled: props.disabled, 'aria-label': 'Decrease', onClick: function () { nudge(-1); } }, h('span', { className: 'material-symbols-outlined', 'aria-hidden': 'true' }, 'remove')),
      h('input', { className: 'rp-hp-input' + (props.compact ? ' is-compact' : ''), type: 'number', inputMode: 'numeric', value: val, disabled: props.disabled,
        onChange: function (e) { pendingRef.current = true; setVal(e.target.value); }, onBlur: commitTyped,
        onKeyDown: function (e) { if (e.key === 'Enter') e.target.blur(); } }),
      props.showMax ? h('span', { className: 'rp-hp-max' }, '/ ' + props.max) : null,
      h('button', { type: 'button', className: 'rp-step-btn', disabled: props.disabled, 'aria-label': 'Increase', onClick: function () { nudge(1); } }, h('span', { className: 'material-symbols-outlined', 'aria-hidden': 'true' }, 'add')));
  }
  function Avatar(props) {
    var imgErrState = useState(false); var imgErr = imgErrState[0], setImgErr = imgErrState[1];
    var url = props.url;
    if (url && !imgErr) return h('img', { className: 'rp-avatar', src: url, alt: '', onError: function () { setImgErr(true); } });
    return h('span', { className: 'rp-avatar rp-avatar-fallback' }, (props.name || '?').charAt(0).toUpperCase());
  }
  function PartyPanel(props) {
    var shieldMax = props.shieldMax != null ? props.shieldMax : 3;
    var heal = props.heal;  // { active, mode, targetId, pool, alloc, onTarget } | null
    return h('div', { className: 'rp-card rp-party-card' },
      h('div', { className: 'rp-party-head' },
        h('h3', { className: 'rp-section-label' }, 'Party'),
        props.showSkills ? h('button', { type: 'button', className: 'rp-skills-btn', onClick: props.onOpenSkills },
          h('span', { className: 'material-symbols-outlined', 'aria-hidden': 'true' }, 'auto_awesome'),
          h('span', null, 'Active skills'),
          props.skillsUnseen > 0 ? h('span', { className: 'rp-skills-badge' }, String(props.skillsUnseen)) : null) : null),
      h('div', { className: 'rp-party' },
        props.party.map(function (p) {
          var ko = p.eliminated;
          var isTarget = heal && heal.active && !ko && (heal.mode === 'single'
            ? String(p.member_id) === String(heal.targetId)
            : Object.prototype.hasOwnProperty.call(heal.alloc, p.member_id));
          var pill = null;
          if (heal && heal.active && !ko) {
            if (heal.mode === 'single') { if (String(p.member_id) === String(heal.targetId)) pill = heal.pool; }
            else if (Object.prototype.hasOwnProperty.call(heal.alloc, p.member_id)) pill = heal.alloc[p.member_id];
          }
          var rowClickable = heal && heal.active && !ko && !props.locked && heal.canRetarget;
          function pickRow() { if (rowClickable) heal.onTarget(p.member_id); }
          return h('div', { className: 'rp-party-row' + (ko ? ' is-elim' : '') + (p.member_id === props.myId ? ' is-me' : '') + (isTarget ? ' is-target' : '') + (rowClickable ? ' is-pickable' : ''),
              key: p.member_id, role: rowClickable ? 'button' : null, tabIndex: rowClickable ? 0 : null,
              onClick: rowClickable ? pickRow : null,
              onKeyDown: rowClickable ? function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickRow(); } } : null },
            h(Avatar, { url: (props.avatars || {})[p.member_id], name: p.member_name }),
            h('div', { className: 'rp-party-id' },
              h('strong', { className: 'rp-party-name' }, isTarget ? abbrevLastName(p.member_name) : p.member_name),
              ko ? h('span', { className: 'rp-elim-tag' }, 'KO') : h('span', { className: 'rp-party-role' }, ROLE_LABEL[p.class_role] || p.class_role)),
            h('div', { className: 'rp-party-stats' },
              pill != null ? h('span', { className: 'rp-heal-pill' }, 'Heal ' + fmt(pill)) : null,
              h('div', { className: 'rp-hp-edit', title: 'HP', onClick: function (e) { e.stopPropagation(); } },
                h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'favorite'),
                h(HpStepper, { value: p.current_hp, max: p.max_hp, showMax: true, disabled: props.locked, onChange: function (v) { props.onHp(p, v); } })),
              h('div', { className: 'rp-shield-edit' + (p.shield_value > 0 ? ' is-on' : ''), title: 'Shield', onClick: function (e) { e.stopPropagation(); } },
                h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'shield'),
                h(HpStepper, { value: p.shield_value, max: shieldMax, compact: true, disabled: props.locked, onChange: function (v) { props.onShield(p, v); } }))));
        })));
  }

  // ── Active skills modal (player-facing) ────────────────────────────────────
  function SkillsModal(props) {
    var effects = props.effects || [];
    var bossEffects = props.bossEffects || [];
    var expState = useState({}); var exp = expState[0], setExp = expState[1];
    var passives = effects.filter(function (e) { return e.mode === 'always'; });
    var actives = effects.filter(function (e) { return e.mode !== 'always'; });
    useEffect(function () {
      function onKey(e) { if (e.key === 'Escape' && props.onClose) props.onClose(); }
      document.addEventListener('keydown', onKey);
      var prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
      return function () { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
    }, []);
    function toggle(id) { var n = Object.assign({}, exp); n[id] = !n[id]; setExp(n); }
    function row(e) {
      var detail = describeActiveEffect(e);
      return h('div', { className: 'rp-skill' + (exp[e.id] ? ' is-open' : ''), key: e.id },
        h('button', { type: 'button', className: 'rp-skill-head', onClick: function () { toggle(e.id); } },
          h('span', { className: 'rp-skill-text' },
            h('span', { className: 'rp-skill-name' }, h('strong', null, e.holder_name), ' · ', e.item_name + (e.ability_name ? ' — ' + e.ability_name : '')),
            h('span', { className: 'rp-skill-sum' }, detail)),
          h('span', { className: 'material-icons rp-skill-caret', 'aria-hidden': 'true' }, exp[e.id] ? 'expand_less' : 'expand_more')),
        exp[e.id] ? h('div', { className: 'rp-skill-body' },
          e.label ? h('div', { className: 'rp-skill-label' }, e.label) : null,
          e.ability_description ? h('p', { className: 'rp-skill-desc' }, e.ability_description) : h('p', { className: 'rp-skill-desc rp-muted' }, 'No description.')) : null);
    }
    function bossRow(e) {
      var key = 'b' + e.id;
      var detail = describeBossActiveEffect(e);
      return h('div', { className: 'rp-skill' + (exp[key] ? ' is-open' : ''), key: key },
        h('button', { type: 'button', className: 'rp-skill-head', onClick: function () { toggle(key); } },
          h('span', { className: 'rp-skill-text' },
            h('span', { className: 'rp-skill-name' }, h('strong', null, e.boss_name), ' · ', e.name),
            h('span', { className: 'rp-skill-sum' }, detail)),
          h('span', { className: 'material-icons rp-skill-caret', 'aria-hidden': 'true' }, exp[key] ? 'expand_less' : 'expand_more')),
        exp[key] ? h('div', { className: 'rp-skill-body' },
          e.description ? h('p', { className: 'rp-skill-desc' }, e.description) : h('p', { className: 'rp-skill-desc rp-muted' }, 'No description.')) : null);
    }
    // Sub-grouping shared by both top groups: skill checks, narrative-only, and
    // everything else (battle effects — damage/heal/shield/roll & other buffs).
    function effectGroup(e) {
      if (e.type === 'skill_roll') return 'skills';
      if (e.type === 'none') return 'narrative';
      return 'battle';
    }
    function grid(list, renderer) { return h('div', { className: 'rp-skill-grid' }, list.map(renderer)); }
    function sub(title, list, renderer) { return list.length ? h('div', { className: 'rp-skill-sub' }, h('h5', { className: 'rp-skill-sub-title' }, title), grid(list, renderer)) : null; }
    function topGroup(title, list) {
      var b = list.filter(function (e) { return effectGroup(e) === 'battle'; });
      var n = list.filter(function (e) { return effectGroup(e) === 'narrative'; });
      var s = list.filter(function (e) { return effectGroup(e) === 'skills'; });
      if (!b.length && !n.length && !s.length) return null;
      return h('div', { className: 'rp-skill-top' },
        h('h4', { className: 'rp-skill-group-title' }, title),
        sub('Battle Effects', b, row), sub('Narrative', n, row), sub('Skills', s, row));
    }
    return h('div', { className: 'rp-modal-overlay', onMouseDown: function (e) { if (e.target === e.currentTarget && props.onClose) props.onClose(); } },
      h('div', { className: 'rp-modal rp-modal-wide', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Active skills' },
        h('div', { className: 'rp-modal-head' },
          h('h3', null, 'Active Skills'),
          h('button', { type: 'button', className: 'rp-chip-x', title: 'Close', onClick: props.onClose }, '✕')),
        h('p', { className: 'rp-note rp-modal-help' }, 'Tap a skill to see its modifiers and description.'),
        (!effects.length && !bossEffects.length) ? h('p', { className: 'rp-note' }, 'No active skills right now.')
          : h('div', null,
              topGroup('Active & Ongoing', actives),
              topGroup('Passives (Always On)', passives),
              bossEffects.length ? h('div', { className: 'rp-skill-top' }, h('h4', { className: 'rp-skill-group-title' }, 'Boss Effects'), grid(bossEffects, bossRow)) : null)));
  }

  // ── Summons (temporary minions) — shown below the party for everyone ────────
  function MinionRow(props) {
    var mn = props.minion;
    var owner = props.myId != null && Number(mn.owner_member_id) === Number(props.myId);
    var live = props.liveBosses || [];
    var pickState = useState(''); var pick = pickState[0], setPick = pickState[1];
    var bossSel = pick && live.some(function (b) { return String(b.id) === pick; }) ? pick : (live.length ? String(live[0].id) : '');
    var meta = mn.current_hp + '/' + mn.max_hp + ' HP · ' + (mn.attack > 0 ? mn.attack + ' atk' : 'no attack')
      + (mn.remaining_turns != null ? ' · ' + mn.remaining_turns + ' turn' + (mn.remaining_turns === 1 ? '' : 's') + ' left' : '')
      + ' · ' + (mn.owner_name || ('Member ' + mn.owner_member_id));
    return h('div', { className: 'rp-summon' },
      h('div', { className: 'rp-summon-info' },
        h('strong', { className: 'rp-summon-name' }, mn.name),
        h('span', { className: 'rp-summon-meta' }, meta)),
      h('div', { className: 'rp-summon-ctl' },
        (owner && mn.attack > 0 && live.length) ? h('span', { className: 'rp-summon-atk' },
          live.length > 1 ? h('select', { className: 'rp-select', value: bossSel, disabled: props.locked, onChange: function (e) { setPick(e.target.value); } },
            live.map(function (b) { return h('option', { key: b.id, value: b.id }, b.name); })) : null,
          h('button', { type: 'button', className: 'rp-btn is-small', disabled: props.locked || !bossSel, onClick: function () { props.onAttack(mn, bossSel); } }, 'Attack ' + mn.attack)) : null,
        props.isDM ? h('span', { className: 'rp-summon-dm' },
          h('input', { type: 'number', className: 'rp-hp-input', value: String(mn.current_hp), 'aria-label': 'Minion HP',
            onChange: function (e) { var v = parseInt(e.target.value, 10); if (!isNaN(v)) props.onHp(mn, v); } }),
          h('button', { type: 'button', className: 'rp-btn is-small is-ghost', onClick: function () { props.onRemove(mn); } }, 'Remove')) : null));
  }
  function SummonsPanel(props) {
    var minions = props.minions || [];
    if (!minions.length) return null;
    var live = (props.bosses || []).filter(function (b) { return !b.defeated; });
    return h('div', { className: 'rp-card rp-party-card rp-summons-card' },
      h('div', { className: 'rp-party-head' }, h('h3', null, 'Summons')),
      h('div', { className: 'rp-summons' },
        minions.map(function (mn) {
          return h(MinionRow, { key: mn.id, minion: mn, liveBosses: live, myId: props.myId, isDM: props.isDM, locked: props.locked,
            onAttack: props.onMinionAttack, onRemove: props.onMinionRemove, onHp: props.onMinionHp });
        })));
  }

  // ── Combat board (character view): enemies + tabbed composer + party + items ─
  function Board(props) {
    var data = props.data, ctx = props.ctx, rules = props.rules, c = ctx.character;
    var party = props.party || [], bosses = props.bosses || [];
    var isHealer = c.class_role === 'healer';

    var tabState = useState('attack'); var tab = tabState[0], setTab = tabState[1];
    // Attack state
    var atkRollState = useState(''); var atkRoll = atkRollState[0], setAtkRoll = atkRollState[1];
    var atkTargetState = useState(''); var atkTarget = atkTargetState[0], setAtkTarget = atkTargetState[1];
    var atkBusyState = useState(false); var atkBusy = atkBusyState[0], setAtkBusy = atkBusyState[1];
    var atkMsgState = useState(''); var atkMsg = atkMsgState[0], setAtkMsg = atkMsgState[1];
    // Heal state
    var healRollState = useState(''); var healRoll = healRollState[0], setHealRoll = healRollState[1];
    var healModeState = useState('single'); var healMode = healModeState[0], setHealMode = healModeState[1];
    var healSingleState = useState(String(c.member_id)); var healSingle = healSingleState[0], setHealSingle = healSingleState[1];
    var healCountState = useState(''); var healCount = healCountState[0], setHealCount = healCountState[1];
    var healAllocState = useState({}); var healAlloc = healAllocState[0], setHealAlloc = healAllocState[1];
    var healBusyState = useState(false); var healBusy = healBusyState[0], setHealBusy = healBusyState[1];
    var healMsgState = useState(''); var healMsg = healMsgState[0], setHealMsg = healMsgState[1];
    // Defend state
    var defRollState = useState(''); var defRoll = defRollState[0], setDefRoll = defRollState[1];
    // Skills state
    var skillSelState = useState('perception'); var skillSel = skillSelState[0], setSkillSel = skillSelState[1];
    var skillRollState = useState(''); var skillRoll = skillRollState[0], setSkillRoll = skillRollState[1];

    var locked = props.actionLocked || props.ko;

    // ── Attack derived ──
    var atkCalc = computeRoll('attack', atkRoll, ctx);
    var atkDmg = damageFor(rules, atkCalc.total);
    var atkPreMult = atkDmg + atkCalc.outputTotal;
    var atkFinal = Math.max(0, Math.round(atkPreMult * atkCalc.mult));
    var atkCapped = Math.min(atkFinal, rules.max_damage_per_attack);
    var living = bosses.filter(function (b) { return !b.defeated; });
    var atkSel = (atkTarget && living.some(function (b) { return String(b.id) === atkTarget; })) ? atkTarget : (living.length ? String(living[0].id) : '');
    var atkBoss = living.filter(function (b) { return String(b.id) === atkSel; })[0];
    var atkEff = atkBoss && atkBoss.damage_mult > 1 ? Math.max(1, Math.floor(atkCapped * atkBoss.damage_mult)) : atkCapped;
    var atkCanApply = living.length > 0 && !locked && props.canAttack && atkRoll !== '' && atkCapped > 0 && !atkBusy;
    function applyAttack() {
      if (!atkSel) return;
      setAtkBusy(true); setAtkMsg('');
      Promise.resolve(props.onApplyDamage(atkSel, atkCapped, parseInt(atkRoll, 10) || 0))
        .then(function () { setAtkBusy(false); setAtkRoll(''); setAtkMsg('Damage applied.'); setTimeout(function () { setAtkMsg(''); }, 2500); })
        .catch(function (e) { setAtkBusy(false); setAtkMsg(e.message || 'Failed to apply.'); });
    }

    // ── Heal derived ──
    var effHealMode = isHealer ? healMode : 'single';
    var healCalc = computeRoll('heal', healRoll, ctx); var pool = healCalc.total + healCalc.outputTotal;
    var healLiving = party.filter(function (p) { return !p.eliminated; });
    var maxPeople = Math.max(1, parseInt(healCount, 10) || 1);
    var allocIds = Object.keys(healAlloc).map(Number);
    var allocated = allocIds.reduce(function (s, id) { return s + (Number(healAlloc[id]) || 0); }, 0);
    var healCanApply = !locked && !healBusy && pool > 0 && props.canHeal;
    function resetHeal() { setHealRoll(''); setHealCount(''); setHealAlloc({}); }
    function flashHeal(m) { setHealMsg(m); setTimeout(function () { setHealMsg(''); }, 2500); }
    function applyHeal(entries) {
      var clean = entries.filter(function (e) { return e.amount > 0; });
      if (!clean.length) return;
      setHealBusy(true); setHealMsg('');
      Promise.resolve(props.onApplyHeal(clean)).then(function () { setHealBusy(false); resetHeal(); flashHeal('Healing applied.'); })
        .catch(function (e) { setHealBusy(false); setHealMsg(e.message || 'Failed to apply.'); });
    }
    function applyHealSingle() { var id = isHealer ? Number(healSingle) : c.member_id; applyHeal([{ member_id: id, amount: pool }]); }
    function applyHealAoe() { applyHeal(allocIds.map(function (id) { return { member_id: id, amount: Number(healAlloc[id]) || 0 }; })); }
    function toggleHealTarget(id) {
      var ids = allocIds.slice();
      if (Object.prototype.hasOwnProperty.call(healAlloc, id)) ids = ids.filter(function (x) { return x !== id; });
      else { if (ids.length >= maxPeople) return; ids = ids.concat(id); }
      setHealAlloc(evenSplit(ids, pool));
    }
    function setHealAmount(id, raw) { var n = parseInt(raw, 10); if (isNaN(n) || n < 0) n = 0; var next = Object.assign({}, healAlloc); next[id] = n; setHealAlloc(next); }
    // Row / dropdown targeting share one selection (single = set; aoe = toggle).
    // Non-healers self-heal only — worker rules reject anything else, so keep the
    // target (and the highlighted party row) locked to the acting player.
    function onHealRowTarget(id) { if (!isHealer) return; if (effHealMode === 'single') setHealSingle(String(id)); else toggleHealTarget(id); }
    var healSingleMember = healLiving.filter(function (p) { return String(p.member_id) === String(healSingle); })[0]
      || party.filter(function (p) { return String(p.member_id) === String(healSingle); })[0];

    // ── Defend derived ──
    var defCalc = computeRoll('defense', defRoll, ctx);
    // ── Skills derived ──
    var skillCalc = computeSkill(skillSel, skillRoll, ctx.myModifiers);

    // Tab availability (for the muted "used" cue). Skill checks aren't turn-gated.
    var avail = { attack: props.canAttack, heal: props.canHeal, buff: props.canBuff, defend: true, skill: true };

    // Composer bodies -------------------------------------------------------
    function attackBody() {
      var atkTerms = ['roll ' + atkCalc.base].concat(atkCalc.rows.map(function (r) { return r.label + ' ' + fmt(r.value); }));
      var hasDetail = atkCalc.outputRows.length || atkCalc.multRows.length;
      var newHp = (atkBoss && atkBoss.current_hp != null) ? Math.max(0, atkBoss.current_hp - atkEff) : null;
      return h('div', { className: 'rp-composer' },
        props.blockAttack ? h('p', { className: 'rp-note rp-note-warn' }, props.blockAttack) : null,
        h('div', { className: 'rp-roll-line' },
          h(RollHero, { value: atkRoll, max: rules.attack_die, caption: 'D' + rules.attack_die + ' ROLL', ariaLabel: 'Raw D' + rules.attack_die + ' roll',
            disabled: locked, onChange: function (e) { setAtkRoll(clampNum(e.target.value, rules.attack_die)); } }),
          h(ChipExpr, { terms: atkTerms, resultText: atkCalc.total + ' → ' + atkDmg + ' dmg', tone: 'damage' })),
        hasDetail ? h(ChipExpr, { terms: [String(atkDmg) + ' base'].concat(
            atkCalc.outputRows.map(function (r) { return r.label + ' ' + fmt(r.value); }),
            atkCalc.multRows.map(function (r) { return '×' + r.value; })),
          resultText: atkFinal + ' dmg', tone: 'damage' }) : null,
        atkCapped < atkFinal ? h('p', { className: 'rp-note' }, 'Capped at ' + rules.max_damage_per_attack + ' damage per attack.') : null,
        h('div', { className: 'rp-divider' }),
        living.length ? h('div', { className: 'rp-target-block' },
          h('h4', { className: 'rp-target-label' }, 'Target'),
          h('div', { className: 'rp-target-row' },
            living.length > 1
              ? h('select', { className: 'rp-select rp-target-select', value: atkSel, disabled: locked || atkBusy, onChange: function (e) { setAtkTarget(e.target.value); } },
                  living.map(function (b) { return h('option', { key: b.id, value: b.id }, b.name); }))
              : h('span', { className: 'rp-target-name' }, atkBoss ? atkBoss.name : '—'),
            (atkBoss && newHp != null) ? h('span', { className: 'rp-target-newhp' }, String(atkBoss.current_hp), ' → ', h('span', { className: 'tone-damage' }, String(newHp))) : null),
          h('button', { type: 'button', className: 'rp-commit', disabled: !atkCanApply, onClick: applyAttack },
            atkBusy ? 'Applying…' : 'Deal ' + atkEff + ' damage to ' + (atkBoss ? atkBoss.name : 'target')),
          (atkBoss && atkBoss.damage_mult > 1) ? h('p', { className: 'rp-note' }, atkBoss.name + ' is vulnerable, damage is multiplied ' + atkBoss.damage_mult + '×.') : null,
          atkMsg ? h('p', { className: 'rp-note rp-note-ok' }, atkMsg) : null)
          : h('p', { className: 'rp-note' }, 'No enemies on the field.'));
    }

    function healBody() {
      var healTerms = ['roll ' + healCalc.base]
        .concat(healCalc.rows.map(function (r) { return r.label + ' ' + fmt(r.value); }))
        .concat(healCalc.outputRows.map(function (r) { return r.label + ' ' + fmt(r.value); }));
      var newHp = (healSingleMember) ? Math.min(healSingleMember.max_hp, healSingleMember.current_hp + pool) : null;
      return h('div', { className: 'rp-composer' },
        props.blockHeal ? h('p', { className: 'rp-note rp-note-warn' }, props.blockHeal) : null,
        isHealer ? h('div', { className: 'rp-seg' },
          h('button', { type: 'button', className: 'rp-seg-btn' + (healMode === 'single' ? ' is-active' : ''), onClick: function () { setHealMode('single'); } }, 'Single'),
          h('button', { type: 'button', className: 'rp-seg-btn' + (healMode === 'aoe' ? ' is-active' : ''), onClick: function () { setHealMode('aoe'); } }, 'AOE')) : null,
        h('div', { className: 'rp-roll-line' },
          h(RollHero, { value: healRoll, max: rules.heal_die, caption: 'D' + rules.heal_die + ' ROLL', ariaLabel: 'Raw D' + rules.heal_die + ' heal roll',
            disabled: locked, onChange: function (e) { var v = clampNum(e.target.value, rules.heal_die); setHealRoll(v); var nc = computeRoll('heal', v, ctx); setHealAlloc(evenSplit(allocIds, nc.total + nc.outputTotal)); } }),
          h(ChipExpr, { terms: healTerms, resultText: pool + ' heal', tone: 'heal' })),
        effHealMode === 'aoe' ? h('label', { className: 'rp-input-label' }, 'D' + rules.heal_die + ' target count (max people)',
          h('input', { className: 'rp-input', type: 'number', inputMode: 'numeric', min: 1, max: rules.aoe_max_targets, value: healCount, placeholder: 'e.g. 3', onChange: function (e) { setHealCount(clampNum(e.target.value, rules.aoe_max_targets)); } })) : null,
        h('div', { className: 'rp-divider' }),
        effHealMode === 'single' ? h('div', { className: 'rp-target-block' },
          h('h4', { className: 'rp-target-label' }, 'Target'),
          h('div', { className: 'rp-target-row' },
            isHealer ? h('select', { className: 'rp-select rp-target-select', value: healSingle, disabled: locked, onChange: function (e) { setHealSingle(e.target.value); } },
                healLiving.map(function (p) { return h('option', { key: p.member_id, value: p.member_id }, p.member_name); }))
              : h('span', { className: 'rp-target-name' }, healSingleMember ? healSingleMember.member_name : 'You'),
            (healSingleMember && newHp != null) ? h('span', { className: 'rp-target-newhp' }, String(healSingleMember.current_hp), ' → ', h('span', { className: 'tone-heal' }, String(newHp))) : null),
          !isHealer ? h('p', { className: 'rp-note' }, 'Self-heal only.') : null,
          h('button', { type: 'button', className: 'rp-commit', disabled: !healCanApply, onClick: applyHealSingle },
            healBusy ? 'Applying…' : 'Heal ' + (healSingleMember ? healSingleMember.member_name : 'target') + ' ' + fmt(pool)),
          healMsg ? h('p', { className: 'rp-note rp-note-ok' }, healMsg) : null)
          : h('div', { className: 'rp-target-block' },
            h('h4', { className: 'rp-target-label' }, 'Distribute'),
            h('p', { className: 'rp-note' }, 'Select up to ' + maxPeople + ' in the party list to split ' + pool + ' across.'),
            allocIds.length ? h('div', { className: 'rp-heal-targets' }, allocIds.map(function (id) {
              var p = party.filter(function (x) { return x.member_id === id; })[0]; if (!p) return null;
              return h('div', { className: 'rp-heal-target is-on', key: id },
                h('span', null, p.member_name + (p.member_id === c.member_id ? ' (you)' : '')),
                h('input', { className: 'rp-buff-val', type: 'number', min: 0, inputMode: 'numeric', value: String(healAlloc[id]), disabled: locked, onChange: function (e) { setHealAmount(id, e.target.value); } }));
            })) : h('p', { className: 'rp-note' }, 'No targets selected yet.'),
            h('button', { type: 'button', className: 'rp-commit', disabled: !healCanApply || allocated <= 0, onClick: applyHealAoe }, healBusy ? 'Applying…' : 'Apply heal to ' + allocIds.length + ' targets'),
            healMsg ? h('p', { className: 'rp-note rp-note-ok' }, healMsg) : null));
    }

    function defendBody() {
      return h('div', { className: 'rp-composer' },
        h('div', { className: 'rp-roll-line' },
          h(RollHero, { value: defRoll, max: rules.attack_die, caption: 'D' + rules.attack_die + ' ROLL', ariaLabel: 'Raw D' + rules.attack_die + ' roll',
            disabled: false, onChange: function (e) { setDefRoll(clampNum(e.target.value, rules.attack_die)); } }),
          h(ChipExpr, { terms: ['roll ' + defCalc.base].concat(defCalc.rows.map(function (r) { return r.label + ' ' + fmt(r.value); })), resultText: String(defCalc.total), tone: 'neutral' })),
        h('p', { className: 'rp-note' }, 'Provide your final defensive roll number to the DM.'));
    }

    function skillBody() {
      return h('div', { className: 'rp-composer' },
        h('label', { className: 'rp-input-label' }, 'Skill',
          h('select', { className: 'rp-select', value: skillSel, onChange: function (e) { setSkillSel(e.target.value); } },
            SKILLS.map(function (s) { return h('option', { key: s.value, value: s.value }, s.label); }))),
        h('div', { className: 'rp-roll-line' },
          h(RollHero, { value: skillRoll, max: rules.attack_die, caption: 'D' + rules.attack_die + ' ROLL', ariaLabel: 'Raw D' + rules.attack_die + ' skill roll',
            disabled: false, onChange: function (e) { setSkillRoll(clampNum(e.target.value, rules.attack_die)); } }),
          h(ChipExpr, { terms: ['roll ' + skillCalc.base].concat(skillCalc.rows.map(function (r) { return r.label + ' ' + fmt(r.value); })), resultText: String(skillCalc.total), tone: 'neutral' })),
        h('p', { className: 'rp-note' }, 'Give your ' + skillLabel(skillSel) + ' total to the DM.'));
    }

    var bodies = {
      attack: attackBody,
      heal: healBody,
      buff: function () { return h(BuffComposer, { character: c, buffs: props.buffs, locked: locked, canBuff: props.canBuff, blockReason: props.blockBuff, onSaveDraft: props.onSaveBuffDraft, onApplyBuff: props.onApplyBuff }); },
      defend: defendBody,
      skill: skillBody
    };

    var tabs = [{ id: 'attack', label: 'Attack', sub: 'D' + rules.attack_die }, { id: 'heal', label: 'Heal', sub: 'D' + rules.heal_die }, { id: 'buff', label: 'Buff', sub: 'SELF' }, { id: 'defend', label: 'Defend', sub: 'REACTION' }, { id: 'skill', label: 'Skills', sub: 'CHECK' }];

    var healShare = { active: tab === 'heal', mode: effHealMode, targetId: healSingle, pool: pool, alloc: healAlloc, onTarget: onHealRowTarget, canRetarget: isHealer };

    return h('div', null,
      h(BossBar, { bosses: bosses, isDM: props.isDM,
        attackMode: tab === 'attack' && props.canAttack && !locked, targetId: atkSel, onTarget: setAtkTarget,
        onBossVisible: props.onBossVisible, onBossDotRemove: props.onBossDotRemove }),
      props.turnNotice ? h('div', { className: 'rp-turn-notice' + (props.actionLocked ? ' is-locked' : '') }, props.turnNotice) : null,
      h('div', { className: 'rp-grid' },
        h('div', { className: 'rp-col rp-action-col' },
          h('div', { className: 'rp-tabs' }, tabs.map(function (t) {
            return h('button', { type: 'button', key: t.id, className: 'rp-tab' + (tab === t.id ? ' is-active' : '') + (!avail[t.id] ? ' is-unavail' : ''), onClick: function () { setTab(t.id); } },
              h('span', { className: 'material-symbols-outlined rp-tab-icon', 'aria-hidden': 'true' }, TAB_ICON[t.id]),
              h('span', { className: 'rp-tab-label' }, t.label),
              h('span', { className: 'rp-tab-sub' }, t.sub));
          })),
          h('div', { className: 'rp-composer-wrap' }, bodies[tab]())),
        h('div', { className: 'rp-col rp-party-col' },
          h(PartyPanel, { party: party, myId: c.member_id, locked: props.bookLocked, avatars: props.avatars, shieldMax: rules.shield_max,
            heal: healShare, onHp: props.onHp, onShield: props.onShield,
            showSkills: true, skillsUnseen: props.skillsUnseen, onOpenSkills: props.onOpenSkills }),
          h(SummonsPanel, { minions: props.minions, bosses: bosses, myId: c.member_id, isDM: props.isDM, locked: locked,
            onMinionAttack: props.onMinionAttack, onMinionRemove: props.onMinionRemove, onMinionHp: props.onMinionHp }))),
      h(ItemsStrip, { items: props.items, party: party, bosses: bosses, locked: locked,
        onToggle: props.onToggle, onActivate: props.onActivate, onActivateAll: props.onActivateAll }));
  }

  // ── DM panel ──────────────────────────────────────────────────────────────
  function bossTargetPhrase(tk, ref) {
    switch (tk) {
      case 'party_member': return 'a chosen player';
      case 'party_members': return 'chosen players';
      case 'class': return 'all ' + (CLASS_PLURAL[ref] || String(ref || '').toUpperCase());
      case 'group': return 'the whole party';
    }
    return 'a target';
  }
  // Plain-language boss-effect wording, mirroring the item describer.
  function bossEffectText(e) {
    if (e.type === 'none') return 'Narrative effect.';
    var to = bossTargetPhrase(e.target_kind, e.target_ref);
    if (e.type === 'damage') return 'Deals ' + e.value + ' damage to ' + to + '.';
    return e.value + ' damage per turn to ' + to + (e.duration_turns > 0 ? ', for ' + e.duration_turns + ' turns' : ', until removed') + '.';
  }
  // Active (in-play) boss effect — target already resolved to names.
  function describeBossActiveEffect(e) {
    if (e.type === 'none') return 'Narrative effect';
    var to = e.target_label || bossTargetPhrase(e.target_kind, e.target_ref);
    var core = e.type === 'dot' ? e.value + ' damage per turn' : 'Effect';
    return core + ' to ' + to + (e.remaining_turns != null ? ' — ' + e.remaining_turns + ' turns left' : '');
  }
  function bossSkillSummary(a) {
    var fx = (a.effects || []).map(bossEffectText);
    var bits = fx.length ? [fx.join(' + ')] : ['no effects configured'];
    if (a.uses_per_session > 0) bits.push((a.uses_per_session - (a.uses_this_session || 0)) + '/' + a.uses_per_session + ' uses');
    return bits.join(' · ');
  }
  // One effect of a boss skill — its own targeting, hits, and Use button, plus
  // its own session-use count. Mirrors an item's modifier row.
  function DMBossEffectRow(props) {
    var e = props.effect; var boss = props.boss; var living = props.living;
    var singleState = useState(''); var single = singleState[0], setSingle = singleState[1];
    var picksState = useState({}); var picks = picksState[0], setPicks = picksState[1];
    var hitsState = useState('1'); var hits = hitsState[0], setHits = hitsState[1];
    var needSingle = e.type !== 'none' && e.target_kind === 'party_member';
    var needMulti = e.type !== 'none' && e.target_kind === 'party_members';
    var hasDamage = e.type === 'damage' || e.type === 'dot';
    var spent = e.uses_per_session > 0 && (e.uses_this_session || 0) >= e.uses_per_session;
    var pickedIds = Object.keys(picks).filter(function (k) { return picks[k]; }).map(Number);
    var canUse = props.turnLocked && !boss.defeated && !spent &&
      (needMulti ? pickedIds.length > 0 : needSingle ? !!single : true);
    var summary = bossEffectText(e) + (e.uses_per_session > 0 ? ' · ' + (e.uses_per_session - (e.uses_this_session || 0)) + '/' + e.uses_per_session + ' uses' : '');
    function toggle(id) { var n = Object.assign({}, picks); n[id] = !n[id]; setPicks(n); }
    function use() {
      var ids = needMulti ? pickedIds : (needSingle && single ? [Number(single)] : []);
      props.onUseEffect(boss, e, ids, Math.max(1, parseInt(hits, 10) || 1));
      setSingle(''); setPicks({}); setHits('1');
    }
    return h('div', { className: 'rp-mod', style: { flexWrap: 'wrap' } },
      h('div', { className: 'rp-mod-info' },
        h('span', { className: 'rp-mod-meta' }, summary),
        needMulti ? h('div', { className: 'rp-skill-picks' },
          living.map(function (p) {
            return h('label', { key: p.member_id },
              h('input', { type: 'checkbox', checked: !!picks[p.member_id], onChange: function () { toggle(p.member_id); } }),
              h('span', null, p.member_name));
          })) : null),
      h('div', { className: 'rp-mod-control' },
        needSingle ? h('select', { className: 'rp-select', value: single, onChange: function (ev) { setSingle(ev.target.value); } },
          h('option', { value: '' }, 'target…'),
          living.map(function (p) { return h('option', { key: p.member_id, value: p.member_id }, p.member_name); })) : null,
        hasDamage ? h('label', { className: 'rp-hits', title: 'Hits — multiplies the damage' },
          h('span', null, '×'),
          h('input', { className: 'rp-hits-input', type: 'number', min: 1, inputMode: 'numeric', value: hits, onChange: function (ev) { setHits(ev.target.value); } })) : null,
        h('button', { type: 'button', className: 'rp-btn is-small', disabled: !canUse, onClick: use }, spent ? 'Spent' : 'Use')));
  }
  // A skill is a named container (like an item ability): a Show toggle plus its
  // effects, each fired on its own.
  function DMBossSkillRow(props) {
    var a = props.ability; var boss = props.boss;
    var effects = a.effects || [];
    var living = (props.party || []).filter(function (p) { return !p.eliminated; });
    return h('div', { className: 'rp-boss-skill' },
      h('div', { className: 'rp-boss-skill-head' },
        h('strong', null, a.name),
        h('button', { type: 'button', className: 'rp-btn is-small is-ghost' + (a.revealed ? ' is-active' : ''),
          title: a.revealed ? 'Skill shown to players under the boss — click to hide' : 'Show this skill’s name + description to players under the boss (no damage)',
          onClick: function () { props.onRevealSkill(boss, a, !a.revealed); } },
          h('span', { className: 'material-icons', 'aria-hidden': 'true', style: { fontSize: '1rem' } }, a.revealed ? 'visibility' : 'visibility_off'),
          a.revealed ? 'Shown' : 'Show')),
      a.description ? h('p', { className: 'rp-boss-skill-desc' }, a.description) : null,
      effects.length
        ? effects.map(function (e) {
            return h(DMBossEffectRow, { key: e.id, effect: e, boss: boss, living: living, turnLocked: props.turnLocked, onUseEffect: props.onUseEffect });
          })
        : h('p', { className: 'rp-note' }, 'No effects configured (add them in the admin Boss Library).'));
  }
  // Per-boss vulnerability window (damage taken multiplier).
  function DMBossVuln(props) {
    var b = props.boss;
    var multState = useState(String(b.damage_mult != null ? b.damage_mult : 2)); var mult = multState[0], setMult = multState[1];
    var turnsState = useState(''); var turns = turnsState[0], setTurns = turnsState[1];
    var active = b.damage_mult > 1;
    function apply() {
      var mv = parseFloat(mult) || 1;
      var tv = turns === '' ? null : Math.max(0, parseInt(turns, 10) || 0);
      props.onSetVuln(b, mv, tv);
    }
    return h('div', { className: 'rp-vuln' },
      h('span', { className: 'rp-vuln-label' }, 'Vulnerability'),
      active ? h('span', { className: 'rp-boss-vuln-tag' }, vulnText(b)) : null,
      h('label', { className: 'rp-hits', title: 'Damage-taken multiplier' },
        h('span', null, '×'),
        h('input', { className: 'rp-hits-input', type: 'number', min: 1, step: '0.5', inputMode: 'decimal', value: mult, onChange: function (e) { setMult(e.target.value); } })),
      h('input', { className: 'rp-hits-input', type: 'number', min: 0, inputMode: 'numeric', placeholder: '∞ turns', value: turns, onChange: function (e) { setTurns(e.target.value); }, style: { width: '5rem' } }),
      h('button', { type: 'button', className: 'rp-btn is-small', onClick: apply }, 'Set'),
      active ? h('button', { type: 'button', className: 'rp-btn is-small is-ghost', onClick: function () { props.onSetVuln(b, 1, null); } }, 'Clear') : null);
  }
  // One staged boss in the DM deck — collapsible so a long skill list doesn't
  // bloat the panel. Collapsed by default; the head (name, HP, eye, remove)
  // stays visible.
  function DMBossManageRow(props) {
    var b = props.boss;
    var openState = useState(false); var open = openState[0], setOpen = openState[1];
    var skillCount = (b.abilities || []).length;
    return h('div', { className: 'rp-dm-boss' + (b.defeated ? ' is-down' : '') },
      h('div', { className: 'rp-dm-boss-head' },
        h('button', { type: 'button', className: 'rp-dm-boss-toggle', 'aria-expanded': open ? 'true' : 'false', onClick: function () { setOpen(!open); } },
          h('span', { className: 'material-icons', 'aria-hidden': 'true' }, open ? 'expand_more' : 'chevron_right'),
          h('strong', null, b.name),
          h('span', { className: 'rp-dm-boss-count' }, skillCount + ' skill' + (skillCount === 1 ? '' : 's'))),
        b.defeated ? h('span', { className: 'rp-boss-down-tag' }, 'Defeated') : null,
        h('div', { className: 'rp-effect-ctl' },
          h(HpStepper, { value: b.current_hp, max: b.max_hp, showMax: true, disabled: false, onChange: function (v) { props.onBossHp(b, v); } }),
          h('button', { type: 'button', className: 'rp-btn is-small is-ghost', title: b.hp_visible ? 'HP visible to players — click to hide' : 'HP hidden from players — click to show',
            onClick: function () { props.onBossVisible(b, !b.hp_visible); } },
            h('span', { className: 'material-icons', style: { fontSize: '1rem', verticalAlign: 'middle' } }, b.hp_visible ? 'visibility' : 'visibility_off')),
          h('button', { type: 'button', className: 'rp-chip-x', title: 'Remove boss', onClick: function () { props.onBossRemove(b); } }, '✕'))),
      open ? h('div', { className: 'rp-dm-boss-body' },
        h(DMBossVuln, { boss: b, onSetVuln: props.onSetVuln }),
        (b.abilities || []).map(function (a) {
          return h(DMBossSkillRow, { key: a.id, ability: a, boss: b, party: props.party, turnLocked: props.campaign.turn_locked, onUseEffect: props.onUseEffect, onRevealSkill: props.onRevealSkill });
        }),
        !skillCount ? h('p', { className: 'rp-note' }, 'No skills on this boss (add them in the admin Boss Library).') : null) : null);
  }
  function DMBossesTab(props) {
    var pickState = useState(''); var pick = pickState[0], setPick = pickState[1];
    var library = props.library || [];
    return h('div', null,
      h('div', { className: 'rp-boss-add' },
        h('select', { className: 'rp-select', value: pick, onChange: function (e) { setPick(e.target.value); } },
          h('option', { value: '' }, library.length ? '— add a boss from the library —' : 'No bosses in the library yet'),
          library.map(function (b) { return h('option', { key: b.id, value: b.id }, b.name + ' (' + b.max_hp + ' HP)'); })),
        h('button', { type: 'button', className: 'rp-btn is-small', disabled: !pick, onClick: function () { props.onBossAdd(pick); setPick(''); } }, 'Add')),
      (props.bosses || []).map(function (b) {
        return h(DMBossManageRow, { key: b.id, boss: b, campaign: props.campaign, party: props.party,
          onBossHp: props.onBossHp, onBossVisible: props.onBossVisible, onBossRemove: props.onBossRemove,
          onSetVuln: props.onSetVuln, onUseEffect: props.onUseEffect, onRevealSkill: props.onRevealSkill });
      }),
      !(props.bosses || []).length ? h('p', { className: 'rp-note' }, 'No bosses on the field.') : null,

      props.bossEffects && props.bossEffects.length ? h('div', { style: { marginTop: '0.75rem' } },
        h('h4', { className: 'rp-dm-sub' }, 'Active boss effects'),
        props.bossEffects.map(function (e) {
          var detail = describeBossActiveEffect(e);
          return h('div', { className: 'rp-effect' + (e.enabled ? '' : ' is-off'), key: e.id },
            h('div', { className: 'rp-effect-info' },
              h('strong', null, e.boss_name + ' — ' + e.name),
              h('span', { className: 'rp-effect-meta' }, detail + ' · ' + (e.visible ? 'visible to players' : 'hidden from players'))),
            h('div', { className: 'rp-effect-ctl' },
              e.remaining_turns != null ? h(Stepper, { value: e.remaining_turns, label: String(e.remaining_turns), disabled: false, onChange: function (v) { props.onBossEffectPatch(e, { remaining_turns: Math.max(0, v) }); } }) : null,
              h('button', { type: 'button', className: 'rp-btn is-small is-ghost', title: e.visible ? 'Hide from players' : 'Reveal to players',
                onClick: function () { props.onBossEffectPatch(e, { visible: !e.visible }); } },
                h('span', { className: 'material-icons', style: { fontSize: '1rem', verticalAlign: 'middle' } }, e.visible ? 'visibility' : 'visibility_off')),
              h('button', { type: 'button', className: 'rp-btn is-small is-ghost', onClick: function () { props.onBossEffectPatch(e, { enabled: !e.enabled }); } }, e.enabled ? 'Disable' : 'Enable'),
              h('button', { type: 'button', className: 'rp-chip-x', title: 'Remove', onClick: function () { props.onBossEffectRemove(e); } }, '✕')));
        })) : null);
  }
  function DMPlayersTab(props) {
    var byMember = {};
    (props.turnActions || []).forEach(function (t) { byMember[t.member_id] = t.actions; });
    var draftBy = {}; (props.buffDrafts || []).forEach(function (b) { draftBy[b.member_id] = b; });
    return h('div', { className: 'rp-dm-section' },
      h('h4', { className: 'rp-dm-sub' }, 'Players'),
      (props.party || []).map(function (p) {
        var acts = byMember[p.member_id] || [];
        var draft = draftBy[p.member_id];
        var status = acts.length
          ? 'Action used: ' + acts.join(', ')
          : (draft ? 'Buff pending — ' + (BUFF_LABEL[draft.type] || draft.type) + ' ' + (draft.value >= 0 ? '+' : '') + draft.value : 'Action available');
        return h('div', { className: 'rp-effect', key: p.member_id },
          h('div', { className: 'rp-effect-info' },
            h('strong', null, p.member_name + (p.eliminated ? ' (KO)' : '')),
            h('span', { className: 'rp-effect-meta' }, status)),
          h('button', { type: 'button', className: 'rp-btn is-small is-ghost', disabled: !acts.length,
            onClick: function () { props.onResetAction(p.member_id); } }, 'Reset action'));
      }));
  }
  // Committed personal buffs, DM-controllable (edit bonus / adjust turns / pause /
  // remove), plus a read-out of any not-yet-committed drafts. Sits in Turn & Effects.
  function DMPersonalBuffs(props) {
    var buffs = props.buffs || []; var drafts = props.drafts || [];
    if (!buffs.length && !drafts.length) return null;
    function buffName(b) { return b.member_name + ' — ' + (BUFF_LABEL[b.type] || b.type) + ' ' + (b.value >= 0 ? '+' : '') + b.value; }
    return h('div', { className: 'rp-dm-section' },
      h('h4', { className: 'rp-dm-sub' }, 'Personal buffs'),
      buffs.map(function (b) {
        var meta = b.pending
          ? 'activates next turn (' + b.duration + (b.duration === 1 ? ' turn)' : ' turns)')
          : b.remaining_turns + (b.remaining_turns === 1 ? ' turn left' : ' turns left');
        return h('div', { className: 'rp-effect' + (b.enabled ? '' : ' is-off'), key: b.id },
          h('div', { className: 'rp-effect-info' },
            h('strong', null, buffName(b)),
            h('span', { className: 'rp-effect-meta' }, meta)),
          h('div', { className: 'rp-effect-ctl' },
            h('div', { className: 'rp-buff-ctl', title: (BUFF_LABEL[b.type] || b.type) + ' bonus' },
              h('span', { className: 'material-symbols-outlined', 'aria-hidden': 'true' }, BUFF_ICON[b.type] || 'swords'),
              h(Stepper, { value: b.value, label: fmt(b.value), compact: true, disabled: false, onChange: function (v) { props.onBuffPatch(b, { value: v }); } })),
            h('div', { className: 'rp-buff-ctl', title: 'Turns' },
              h('span', { className: 'material-symbols-outlined', 'aria-hidden': 'true' }, 'schedule'),
              h(Stepper, { value: b.remaining_turns, label: String(b.remaining_turns), compact: true, disabled: false, onChange: function (v) { props.onBuffPatch(b, { remaining_turns: Math.max(0, v) }); } })),
            h('button', { type: 'button', className: 'rp-btn is-small is-ghost', onClick: function () { props.onBuffPatch(b, { enabled: !b.enabled }); } }, b.enabled ? 'Pause' : 'Resume'),
            h('button', { type: 'button', className: 'rp-chip-x', title: 'Remove', onClick: function () { props.onBuffRemove(b); } }, '✕')));
      }),
      drafts.map(function (b) {
        return h('div', { className: 'rp-effect is-off', key: b.id },
          h('div', { className: 'rp-effect-info' },
            h('strong', null, buffName(b)),
            h('span', { className: 'rp-effect-meta' }, 'not committed until End Turn')));
      }));
  }
  // The collapsible DM Control Deck. Turn controls live on the header bar and
  // stay visible when collapsed; everything else lives in the body. Collapsed by
  // default; players never see this.
  function DMDeck(props) {
    var c = props.campaign; var effects = props.effects; var hpLog = props.hpLog || [];
    var openState = useState(false); var open = openState[0], setOpen = openState[1];
    var tabState = useState('turn'); var tab = tabState[0], setTab = tabState[1];
    var tabs = [{ id: 'turn', label: 'Turn & Effects' }, { id: 'bosses', label: 'Bosses' }, { id: 'players', label: 'Players' }, { id: 'log', label: 'Log' }];
    return h('div', { className: 'rp-deck' + (open ? ' is-open' : '') },
      h('div', { className: 'rp-deck-head' },
        h('button', { type: 'button', className: 'rp-deck-title', 'aria-expanded': open ? 'true' : 'false', onClick: function () { setOpen(!open); } },
          h('span', { className: 'material-symbols-outlined', 'aria-hidden': 'true' }, 'tune'),
          h('span', null, 'DM Control Deck'),
          h('span', { className: 'rp-turn-badge' + (c.turn_locked ? ' is-locked' : '') }, 'Turn ' + c.turn_number + (c.turn_locked ? ' · locked' : ''))),
        h('div', { className: 'rp-deck-head-ctl' },
          h('button', { type: 'button', className: 'rp-btn is-small', disabled: c.turn_locked, onClick: props.onEndTurn }, 'End Turn'),
          h('button', { type: 'button', className: 'rp-btn is-small', disabled: !c.turn_locked, onClick: props.onNextTurn }, 'Next Turn'),
          h('button', { type: 'button', className: 'rp-btn is-small is-ghost rp-deck-toggle', 'aria-expanded': open ? 'true' : 'false', onClick: function () { setOpen(!open); } },
            h('span', { className: 'material-icons', 'aria-hidden': 'true' }, open ? 'expand_less' : 'expand_more'),
            open ? 'Hide' : 'Show'))),
      open ? h('div', { className: 'rp-deck-body' },
        h('div', { className: 'rp-dm-session' },
          h('button', { type: 'button', className: 'rp-btn is-small is-ghost', onClick: props.onPauseSession }, 'Pause session'),
          h('button', { type: 'button', className: 'rp-btn is-small is-danger', onClick: props.onEndSession }, 'End session')),
        h('div', { className: 'rp-dm-tabs' },
          tabs.map(function (t) { return h('button', { type: 'button', key: t.id, className: 'rp-dm-tab' + (tab === t.id ? ' is-active' : ''), onClick: function () { setTab(t.id); } }, t.label); })),

        tab === 'turn' ? h('div', null,
          h('div', { className: 'rp-dm-section' },
          h('h4', { className: 'rp-dm-sub' }, 'Active effects'),
          !effects.length ? h('p', { className: 'rp-note' }, 'No active effects.') :
            effects.map(function (e) {
              return h('div', { className: 'rp-effect' + (e.enabled ? '' : ' is-off'), key: e.id },
                h('div', { className: 'rp-effect-info' },
                  h('strong', null, e.holder_name + ' — ' + e.item_name),
                  h('span', { className: 'rp-effect-meta' },
                    (e.ability_name ? e.ability_name + ' · ' : '') + describeActiveEffect(e))),
                h('div', { className: 'rp-effect-ctl' },
                  e.remaining_turns != null ? h(Stepper, { value: e.remaining_turns, label: String(e.remaining_turns), disabled: false, onChange: function (v) { props.onSetTurns(e, v); } }) : null,
                  h('button', { type: 'button', className: 'rp-btn is-small is-ghost', onClick: function () { props.onToggleEffect(e, !e.enabled); } }, e.enabled ? 'Disable' : 'Enable'),
                  h('button', { type: 'button', className: 'rp-chip-x', title: 'Remove', onClick: function () { props.onRemoveEffect(e); } }, '✕')));
            })),
          h(DMPersonalBuffs, { buffs: props.personalBuffs || [], drafts: props.buffDrafts || [], onBuffPatch: props.onBuffPatch, onBuffRemove: props.onBuffRemove })) : null,

        tab === 'bosses' ? h(DMBossesTab, { campaign: c, bosses: props.bosses, bossEffects: props.bossEffects, library: props.library, party: props.party,
          onBossAdd: props.onBossAdd, onBossHp: props.onBossHp, onBossVisible: props.onBossVisible, onBossRemove: props.onBossRemove, onSetVuln: props.onSetVuln,
          onUseEffect: props.onUseEffect, onRevealSkill: props.onRevealSkill, onBossEffectPatch: props.onBossEffectPatch, onBossEffectRemove: props.onBossEffectRemove }) : null,

        tab === 'players' ? h(DMPlayersTab, { party: props.party, turnActions: props.turnActions, buffDrafts: props.buffDrafts, onResetAction: props.onResetAction }) : null,

        tab === 'log' ? h('aside', { className: 'rp-dm-log' },
          h('h4', { className: 'rp-dm-sub' }, 'Change log'),
          !hpLog.length ? h('p', { className: 'rp-note' }, 'No changes yet this session.') :
            h('div', { className: 'rp-log-list' }, hpLog.map(function (l) {
              var sameTarget = l.actor_member_id === l.target_member_id && l.actor_member_id != null;
              var main = (l.note && sameTarget) ? (l.actor_name || 'Someone')
                : (l.actor_name || 'Someone') + ' → ' + (l.target_name || (l.target_member_id != null ? 'Member ' + l.target_member_id : '—'));
              var noteOnly = l.note && !l.delta;
              var right = noteOnly ? l.note
                : (fmt(l.delta) + ' ' + (l.field === 'shield' ? 'shield' : l.field === 'boss' ? 'boss HP' : 'HP') + ' (now ' + l.new_value + ')' + (l.note ? ' · ' + l.note : ''));
              var rightClass = noteOnly ? 'rp-log-delta rp-log-note' : ('rp-log-delta' + (l.delta >= 0 ? ' is-up' : ' is-down'));
              return h('div', { className: 'rp-log', key: l.id },
                h('span', { className: 'rp-log-main' }, main),
                h('span', { className: rightClass }, right));
            }))) : null) : null);
  }

  // ── App ───────────────────────────────────────────────────────────────────
  function App() {
    var sessionState = useState(PVAdminAPI.getSession()); var session = sessionState[0];
    var dataState = useState(null); var data = dataState[0], setData = dataState[1];
    var loadingState = useState(true); var loading = loadingState[0], setLoading = loadingState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];
    var avatarsState = useState({}); var avatars = avatarsState[0], setAvatars = avatarsState[1];
    var libraryState = useState(null); var library = libraryState[0], setLibrary = libraryState[1];
    // Active-skills modal + "unseen" indicator (was the floating FAB in v6).
    var skillsOpenState = useState(false); var skillsOpen = skillsOpenState[0], setSkillsOpen = skillsOpenState[1];
    var seenState = useState({}); var seen = seenState[0], setSeen = seenState[1];
    var dataRef = useRef(null); dataRef.current = data;

    async function bootstrap() {
      if (!session) { setLoading(false); return; }
      try { var d = await PVRollAPI.request('GET', '/rp/me/active'); setData(d); setErr(''); }
      catch (e) { if (e.status === 401) setData(null); else setErr(e.message || 'Failed to load.'); }
      finally { setLoading(false); }
    }
    useEffect(function () { bootstrap(); /* eslint-disable-next-line */ }, []);

    // Public roster portraits (member_id -> image_url), for the party rows.
    // Public endpoint, no auth; non-fatal if it's unreachable.
    useEffect(function () {
      fetch(PVAdminAPI.API_BASE + '/roster', { headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (rows) {
          var map = {}; (rows || []).forEach(function (r) { if (r && r.image_url && r.member_id != null) map[r.member_id] = r.image_url; });
          setAvatars(map);
        }).catch(function () {});
    }, []);

    // Boss library for the DM's add-boss picker (lazy; 403/404 tolerated).
    useEffect(function () {
      if (!data || !data.active || !data.campaign.is_dm || library !== null) return;
      PVRollAPI.request('GET', '/rp/boss-library')
        .then(function (rows) { setLibrary(rows || []); })
        .catch(function () { setLibrary([]); });
    }, [data && data.active, data && data.campaign && data.campaign.is_dm]);

    function mergeItemState(items, stateList) {
      var byMod = {}; (stateList || []).forEach(function (s) { byMod[s.modifier_id] = s; });
      return (items || []).map(function (it) {
        return Object.assign({}, it, { abilities: (it.abilities || []).map(function (ab) {
          return Object.assign({}, ab, { modifiers: (ab.modifiers || []).map(function (m) {
            var s = byMod[m.id]; return s ? Object.assign({}, m, { active: s.active, remaining_turns: s.remaining_turns, runtime_target_member_id: s.runtime_target_member_id, uses_this_session: s.uses_this_session }) : m;
          }) });
        }) });
      });
    }
    function mergeSync(cur, s) {
      var me2 = (s.party || []).filter(function (p) { return cur.character && p.member_id === cur.character.member_id; })[0];
      return Object.assign({}, cur, {
        campaign: Object.assign({}, cur.campaign, { turn_number: s.turn_number, turn_locked: s.turn_locked, is_dm: s.is_dm }),
        party: s.party, my_modifiers: s.my_modifiers, active_effects: s.active_effects, hp_log: s.hp_log, healed_this_turn: s.healed_this_turn,
        rules: s.rules || cur.rules, bosses: s.bosses, boss_effects: s.boss_effects, my_turn: s.my_turn, turn_actions: s.turn_actions,
        my_personal_buffs: s.my_personal_buffs, personal_buffs: s.personal_buffs, buff_drafts: s.buff_drafts,
        character: me2 || cur.character, items: mergeItemState(cur.items, s.my_item_state)
      });
    }

    useEffect(function () {
      if (!data || !data.active) return;
      var cid = data.campaign.id;
      var timer = setInterval(async function () {
        try {
          var s = await PVRollAPI.request('GET', '/rp/campaigns/' + cid + '/sync');
          if (!s.active) { bootstrap(); return; }
          var cur = dataRef.current; if (!cur) return;
          setData(mergeSync(cur, s));
        } catch (_e) {}
      }, POLL_MS);
      return function () { clearInterval(timer); };
    }, [data && data.active, data && data.campaign && data.campaign.id]);

    async function refresh() {
      var cur = dataRef.current; if (!cur || !cur.active) return;
      try {
        var s = await PVRollAPI.request('GET', '/rp/campaigns/' + cur.campaign.id + '/sync');
        setData(mergeSync(dataRef.current, s));
      } catch (_e) {}
    }

    function cid() { return dataRef.current.campaign.id; }
    async function act(fn) { setErr(''); try { await fn(); await refresh(); } catch (e) { setErr(e.message || 'Action failed.'); } }

    var rules = rulesOf(data);
    function onHp(p, v) { act(function () { return PVRollAPI.request('PATCH', '/rp/campaigns/' + cid() + '/characters/' + p.member_id, { current_hp: Math.max(0, Math.min(v, p.max_hp)) }); }); }
    function onShield(p, v) { act(function () { return PVRollAPI.request('PATCH', '/rp/campaigns/' + cid() + '/characters/' + p.member_id, { shield_value: Math.max(0, Math.min(v, rules.shield_max)) }); }); }
    function onSaveBuffDraft(body) { return PVRollAPI.request('POST', '/rp/campaigns/' + cid() + '/buffs/draft', body).then(refresh); }
    // Apply = save the draft, then commit it now (locks it in as the turn's action).
    function onApplyBuff(body) {
      return PVRollAPI.request('POST', '/rp/campaigns/' + cid() + '/buffs/draft', body)
        .then(function () { return PVRollAPI.request('POST', '/rp/campaigns/' + cid() + '/buffs/apply', {}); })
        .then(refresh).catch(function (e) { setErr(e.message || 'Failed to apply buff.'); });
    }
    function onBuffPatch(b, body) { act(function () { return PVRollAPI.request('PATCH', '/rp/campaigns/' + cid() + '/personal-buffs/' + b.id, body); }); }
    function onBuffRemove(b) { act(function () { return PVRollAPI.request('DELETE', '/rp/campaigns/' + cid() + '/personal-buffs/' + b.id); }); }
    function onToggle(m, enabled) { act(function () { return PVRollAPI.request('POST', '/rp/modifiers/' + m.id + '/toggle', { campaign_id: cid(), enabled: enabled }); }); }
    function onActivate(m, opts) { opts = opts || {}; act(function () { return PVRollAPI.request('POST', '/rp/modifiers/' + m.id + '/activate', { campaign_id: cid(), target_member_id: opts.memberId != null ? opts.memberId : null, target_member_ids: opts.memberIds && opts.memberIds.length ? opts.memberIds : null, target_boss_id: opts.bossId || null, target_boss_ids: opts.bossIds && opts.bossIds.length ? opts.bossIds : null, all_bosses: !!opts.allBosses }); }); }
    function onActivateAll(ab) { act(function () { return PVRollAPI.request('POST', '/rp/abilities/' + ab.id + '/activate-all', { campaign_id: cid() }); }); }
    function onEndTurn() { act(function () { return PVRollAPI.request('POST', '/rp/campaigns/' + cid() + '/turn/end', {}); }); }
    function onNextTurn() { act(function () { return PVRollAPI.request('POST', '/rp/campaigns/' + cid() + '/turn/next', {}); }); }
    function onToggleEffect(e, enabled) { act(function () { return PVRollAPI.request('PATCH', '/rp/campaigns/' + cid() + '/active-modifiers/' + e.id, { enabled: enabled }); }); }
    function onSetTurns(e, v) { act(function () { return PVRollAPI.request('PATCH', '/rp/campaigns/' + cid() + '/active-modifiers/' + e.id, { remaining_turns: Math.max(0, v) }); }); }
    function onRemoveEffect(e) { act(function () { return PVRollAPI.request('DELETE', '/rp/campaigns/' + cid() + '/active-modifiers/' + e.id); }); }
    function onPauseSession() { setErr(''); PVRollAPI.request('POST', '/rp/campaigns/' + cid() + '/session/pause', {}).then(bootstrap).catch(function (e) { setErr(e.message || 'Failed to pause.'); }); }
    function onEndSession() { if (!confirm('End the session? Buffs and shields clear.')) return; setErr(''); PVRollAPI.request('POST', '/rp/campaigns/' + cid() + '/session/end', {}).then(bootstrap).catch(function (e) { setErr(e.message || 'Failed to end.'); }); }
    // Heal apply: one atomic request — additive server-side (no lost heals when two
    // land together) and unable to revive KO'd targets. Then refresh.
    function onApplyHeal(entries) {
      return PVRollAPI.request('POST', '/rp/campaigns/' + cid() + '/heal', { entries: entries }).then(refresh);
    }
    // Attack apply: the capped, computed damage lands on the chosen boss.
    // The raw roll rides along purely so the DM log can show "rolled N".
    function onApplyDamage(bossId, amount, roll) {
      return PVRollAPI.request('POST', '/rp/campaigns/' + cid() + '/bosses/' + bossId + '/damage', { amount: amount, roll: roll || 0 }).then(refresh);
    }
    // DM boss controls
    function onBossAdd(libId) { act(function () { return PVRollAPI.request('POST', '/rp/campaigns/' + cid() + '/bosses', { boss_id: libId }); }); }
    function onBossHp(b, v) { act(function () { return PVRollAPI.request('PATCH', '/rp/campaigns/' + cid() + '/bosses/' + b.id, { current_hp: Math.max(0, Math.min(v, b.max_hp)) }); }); }
    function onMinionAttack(mn, bossId) { act(function () { return PVRollAPI.request('POST', '/rp/campaigns/' + cid() + '/minions/' + mn.id + '/attack', { boss_id: bossId }); }); }
    function onMinionRemove(mn) { act(function () { return PVRollAPI.request('DELETE', '/rp/campaigns/' + cid() + '/minions/' + mn.id); }); }
    function onMinionHp(mn, hp) { act(function () { return PVRollAPI.request('PATCH', '/rp/campaigns/' + cid() + '/minions/' + mn.id, { current_hp: hp }); }); }
    function onBossVisible(b, vis) { act(function () { return PVRollAPI.request('PATCH', '/rp/campaigns/' + cid() + '/bosses/' + b.id, { hp_visible: vis }); }); }
    function onSetVuln(b, mult, turns) { act(function () { return PVRollAPI.request('PATCH', '/rp/campaigns/' + cid() + '/bosses/' + b.id, { damage_mult: mult, damage_mult_turns: turns }); }); }
    function onBossDotRemove(b, dt) { act(function () { return PVRollAPI.request('DELETE', '/rp/campaigns/' + cid() + '/boss-dots/' + dt.id); }); }
    function onBossRemove(b) { if (!confirm('Remove ' + b.name + ' from the field?')) return; act(function () { return PVRollAPI.request('DELETE', '/rp/campaigns/' + cid() + '/bosses/' + b.id); }); }
    function onUseEffect(b, e, targetIds, hits) { act(function () { return PVRollAPI.request('POST', '/rp/campaigns/' + cid() + '/bosses/' + b.id + '/use-effect', { effect_id: e.id, target_member_ids: targetIds || [], hits: hits || 1 }); }); }
    function onRevealSkill(b, a, revealed) { act(function () { return PVRollAPI.request('POST', '/rp/campaigns/' + cid() + '/bosses/' + b.id + '/reveal-skill', { ability_id: a.id, revealed: revealed }); }); }
    function onBossEffectPatch(e, body) { act(function () { return PVRollAPI.request('PATCH', '/rp/campaigns/' + cid() + '/boss-effects/' + e.id, body); }); }
    function onBossEffectRemove(e) { act(function () { return PVRollAPI.request('DELETE', '/rp/campaigns/' + cid() + '/boss-effects/' + e.id); }); }
    function onResetAction(memberId) { act(function () { return PVRollAPI.request('DELETE', '/rp/campaigns/' + cid() + '/turn-actions/' + memberId); }); }

    if (!session) return h(LockedCard);
    if (loading) return h('div', { className: 'rp-gate' }, h('p', null, 'Loading…'));
    if (err && !data) return h('div', { className: 'rp-gate' }, h('p', { className: 'rp-flash error' }, err));
    if (!data || !data.active) {
      if (data && data.reason === 'not_linked') return h(PausedCard, { title: 'Account not linked', message: 'Your login isn’t linked to a Free Company roster character yet. Ask an officer to add you.' });
      if (data && data.reason === 'paused') return h(PausedCard, { title: 'Session paused', message: 'Your DM paused the session.',
        onResume: data.can_resume ? function () { setErr(''); PVRollAPI.request('POST', '/rp/campaigns/' + data.campaign_id + '/session/resume', {}).then(bootstrap).catch(function (e) { setErr(e.message || 'Failed to resume.'); }); } : null });
      return h(PausedCard, {});
    }

    var camp = data.campaign;
    var c = data.character;
    var isDM = camp.is_dm;
    var ko = !!(c && c.eliminated);
    // Character actions (attack/heal/buff/items) lock for EVERYONE during turn
    // lock — the DM included. Party bookkeeping stays DM-exempt.
    var actionLocked = camp.turn_locked;
    var bookLocked = camp.turn_locked && !isDM;
    var ctx = c ? { character: c, myModifiers: data.my_modifiers || [], rules: rules } : null;
    // One prominent notice above the action columns: locked while the turn is
    // resolving (shown to everyone, DM included), otherwise a reminder once this
    // player has spent their action for the turn.
    var actionUsed = !!(data.my_turn && data.my_turn.limit > 0 && data.my_turn.used >= data.my_turn.limit);
    var turnNotice = actionLocked
      ? (isDM ? 'Boss turn — Player actions locked.' : 'Turn is locked — the DM is acting.')
      : (actionUsed ? 'You’ve used your action this turn (' + (data.my_turn.actions || []).join(', ') + ').' : '');

    // Active-skills "unseen" indicator: used (non-passive) effects + revealed boss
    // effects the player hasn't opened the modal to view yet.
    var effectsList = data.active_effects || [];
    var bossEffectsList = data.boss_effects || [];
    var skillsUnseen = effectsList.filter(function (e) { return e.mode !== 'always' && !seen[e.id]; }).length
      + bossEffectsList.filter(function (e) { return !seen['b' + e.id]; }).length;
    function openSkills() {
      var s = Object.assign({}, seen);
      effectsList.forEach(function (e) { s[e.id] = true; });
      bossEffectsList.forEach(function (e) { s['b' + e.id] = true; });
      setSeen(s); setSkillsOpen(true);
    }

    return h('div', { className: 'rp-tool' },
      h('header', { className: 'rp-header' },
        h('div', null, h('h1', null, 'Roll Calculator'), h('p', { className: 'rp-sub' }, camp.name + ' · Turn ' + camp.turn_number + (camp.turn_locked ? ' (locked)' : ''))),
        h('div', { className: 'rp-me' },
          h('div', { className: 'rp-me-id' },
            c ? h(Avatar, { url: avatars[c.member_id], name: c.member_name }) : null,
            h('strong', null, c ? c.member_name : 'Dungeon Master')),
          c ? h('span', null, ROLE_LABEL[c.class_role] + ' · ' + ARMOR_LABEL[c.armor_type]) : null,
          c ? h(ActionChip, { myTurn: data.my_turn }) : null)),
      err ? h('div', { className: 'rp-flash error' }, err) : null,
      ko ? h('div', { className: 'rp-flash rp-ko' }, 'You’re knocked out — you can’t act until your HP is restored.') : null,

      isDM ? h(DMDeck, { campaign: camp, effects: effectsList, hpLog: data.hp_log || [],
        bosses: data.bosses || [], bossEffects: bossEffectsList, library: library || [], party: data.party || [], turnActions: data.turn_actions || [],
        onEndTurn: onEndTurn, onNextTurn: onNextTurn, onToggleEffect: onToggleEffect, onSetTurns: onSetTurns, onRemoveEffect: onRemoveEffect,
        onPauseSession: onPauseSession, onEndSession: onEndSession,
        onBossAdd: onBossAdd, onBossHp: onBossHp, onBossVisible: onBossVisible, onBossRemove: onBossRemove, onSetVuln: onSetVuln, onUseEffect: onUseEffect, onRevealSkill: onRevealSkill,
        onBossEffectPatch: onBossEffectPatch, onBossEffectRemove: onBossEffectRemove, onResetAction: onResetAction,
        personalBuffs: data.personal_buffs || [], buffDrafts: data.buff_drafts || [], onBuffPatch: onBuffPatch, onBuffRemove: onBuffRemove }) : null,

      c ? h(Board, { data: data, ctx: ctx, rules: rules, party: data.party || [], bosses: data.bosses || [], items: data.items || [], avatars: avatars,
          isDM: isDM, actionLocked: actionLocked, ko: ko, bookLocked: bookLocked, turnNotice: turnNotice,
          canAttack: canAct(data, 'attack'), canHeal: canAct(data, 'heal'), canBuff: canAct(data, 'buff'),
          blockAttack: actionBlockReason(data, 'attack'), blockHeal: actionBlockReason(data, 'heal'), blockBuff: actionBlockReason(data, 'buff'),
          buffs: data.my_personal_buffs || [],
          skillsUnseen: skillsUnseen, onOpenSkills: openSkills,
          onApplyDamage: onApplyDamage, onApplyHeal: onApplyHeal, onSaveBuffDraft: onSaveBuffDraft, onApplyBuff: onApplyBuff,
          onHp: onHp, onShield: onShield, onToggle: onToggle, onActivate: onActivate, onActivateAll: onActivateAll,
          minions: data.minions || [], onMinionAttack: onMinionAttack, onMinionRemove: onMinionRemove, onMinionHp: onMinionHp,
          onBossVisible: onBossVisible, onBossDotRemove: onBossDotRemove })
        : h('div', null,
          h(BossBar, { bosses: data.bosses || [], isDM: isDM, onBossVisible: onBossVisible, onBossDotRemove: onBossDotRemove }),
          h(PartyPanel, { party: data.party || [], myId: null, locked: bookLocked, avatars: avatars, shieldMax: rules.shield_max, heal: null, onHp: onHp, onShield: onShield, showSkills: false })),

      skillsOpen ? h(SkillsModal, { effects: effectsList, bossEffects: bossEffectsList, onClose: function () { setSkillsOpen(false); } }) : null);
  }

  window.RollCalculator = App;
})();
