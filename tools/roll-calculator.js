// ============================================================================
//  RollCalculator (v5) — player + DM roll calculator / party tracker.
//
//  Worker resolves each player's applicable modifiers (my_modifiers); the page
//  computes the breakdown and drives toggles/activations, the party HP+shield
//  steppers, personal buffs, and the DM turn engine + active-effects panel.
//
//  v5 additions (worker v9.5):
//    • System rules arrive in the sync payload (data.rules) and drive all roll
//      math — armor mods, class passives, damage tiers, dice, caps. FALLBACK_RULES
//      mirrors the historical values so the page still works against an older
//      worker that doesn't send rules yet.
//    • Battlefield bar: campaign bosses with HP bars (per-instance hp_visible).
//      Attack rolls apply their final (capped, read-only) damage to a boss.
//    • Action economy: one action per turn across attack/heal/buff (rules-driven).
//      Header chip shows the state; a spent action disables the other panels.
//    • Knocked Out: 0 HP blocks all actions until HP is restored; all UI language
//      uses "Knocked Out"/"KO" (the API field is still `eliminated`).
//    • DM panel reorganised into tabs: Turn & Effects / Bosses / Players / Log.
//      Boss skills fire only while the turn is locked; DoTs and reveals are
//      managed per-effect (hidden from players until the DM toggles them).
//    • Party rows show roster-profile portraits (public med-worker /roster).
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

  // Mirrors the worker's DEFAULT_RULES — used only when the worker predates
  // v9.5 and the sync payload has no `rules` block.
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
  function modLabel(m) { return m.label ? m.label : (m.item_name + (m.ability_name ? ' · ' + m.ability_name : '')); }
  function targetText(m) {
    switch (m.target_kind) {
      case 'self': return 'self'; case 'group': return 'group';
      case 'class': return String(m.target_ref || '').toUpperCase();
      case 'holder_item': return 'item holder'; case 'party_member': return 'chosen target';
    }
    return '';
  }

  // ── Plain-language descriptions ────────────────────────────────────────────
  // Turns the raw modifier fields (type/value/target/mode/duration) into a
  // readable sentence instead of jargon like "+8 attack output · → self · 1t".
  var CLASS_PLURAL = { tank: 'Tanks', dps: 'DPS', healer: 'Healers' };
  function typePhrase(type, value) {
    var v = (value >= 0 ? '+' : '') + value;
    switch (type) {
      case 'attack_roll': return v + ' attack roll bonus';
      case 'defense_roll': return v + ' defense roll bonus';
      case 'heal_roll': return v + ' healing roll bonus';
      case 'attack_output': return v + ' bonus attack damage';
      case 'heal_output': return v + ' bonus healing';
      case 'shield': return 'grants ' + value + ' shield';
      case 'heal': return 'restores ' + value + ' HP';
    }
    return v + ' ' + String(type || '').replace(/_/g, ' ');
  }
  function targetPhrase(tk, ref) {
    switch (tk) {
      case 'self': return 'the holder';
      case 'group': return 'the whole party';
      case 'class': return 'all ' + (CLASS_PLURAL[ref] || String(ref || '').toUpperCase());
      case 'holder_item': return 'the item’s holder';
      case 'party_member': return 'a chosen ally';
    }
    return '';
  }
  // For a catalogue modifier (My Items / admin): full "when → what → to whom" sentence.
  function describeModifier(m) {
    if (m.type === 'none') return m.label || 'Special effect — see the item text.';
    var when = m.mode === 'always' ? 'Always' : m.mode === 'toggle' ? 'While turned on' : 'When activated';
    var core = typePhrase(m.type, m.value);
    var to = ' to ' + targetPhrase(m.target_kind, m.target_ref);
    var dur = m.duration_turns === 1 ? ', this turn' : m.duration_turns > 1 ? ', for ' + m.duration_turns + ' turns' : '';
    return when + ', ' + core + to + dur + '.';
  }
  // For an active effect (already resolved target_label + remaining turns).
  function describeActiveEffect(e) {
    if (e.type === 'none') return e.label || 'Special effect';
    var core = typePhrase(e.type, e.value);
    var tp = targetPhrase(e.target_kind, e.target_ref);
    if (e.target_kind === 'party_member') tp = e.target_label || 'a chosen ally';
    if (e.target_kind === 'holder_item') tp = e.target_label || 'the item’s holder';
    var to = tp ? ' to ' + tp : '';
    var dur = e.remaining_turns != null ? ' — ' + e.remaining_turns + (e.duration_turns ? ' of ' + e.duration_turns : '') + ' turn' + (e.remaining_turns === 1 && !e.duration_turns ? '' : 's') + ' left' : '';
    return core + to + dur;
  }

  // ── Action economy (client view) ──────────────────────────────────────────
  // my_turn: { limit, used, actions: [...], ko } from the worker. Older workers
  // don't send it — fall back to the legacy healed_this_turn behaviour.
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
    if (t && t.limit > 0 && t.used >= t.limit) return 'Action used this turn: ' + (t.actions || []).join(', ') + '.';
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
    return { base: base, rows: rows, total: total, outputRows: outputRows, outputTotal: outputTotal };
  }

  function Breakdown(props) {
    var calc = props.calc;
    return h('div', { className: 'rp-breakdown' },
      h('div', { className: 'rp-bd-row rp-bd-base' }, h('span', null, 'Roll'), h('span', null, String(calc.base))),
      calc.rows.map(function (r, i) { return h('div', { className: 'rp-bd-row', key: i }, h('span', null, r.label), h('span', null, fmt(r.value))); }),
      h('div', { className: 'rp-bd-rule' }), props.children);
  }

  // ── Gate cards ────────────────────────────────────────────────────────────
  function LockedCard() {
    return h('div', { className: 'rp-gate' },
      h('span', { className: 'material-icons rp-gate-icon', 'aria-hidden': 'true' }, 'lock'),
      h('h2', null, 'Members only'),
      h('p', null, 'Sign in with your character account to use the Roll Calculator.'),
      h('a', { className: 'rp-btn', href: '/pv/admin/login.html?redirect=/pv/tools/roll-calculator.html' }, 'Sign in'));
  }
  function PausedCard(props) {
    return h('div', { className: 'rp-gate' },
      h('span', { className: 'material-icons rp-gate-icon', 'aria-hidden': 'true' }, 'pause_circle'),
      h('h2', null, props.title || 'No active session'),
      h('p', null, props.message || 'There is no live campaign session right now. When an officer starts one and adds your character, the calculator will unlock automatically.'));
  }

  // ── Battlefield (bosses) ──────────────────────────────────────────────────
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
    return b.damage_mult + '× vulnerable' + (b.damage_mult_turns != null ? ' · ' + b.damage_mult_turns + 't' : '');
  }
  function BossCard(props) {
    var b = props.boss;
    var vuln = vulnText(b);
    // Skills the DM has toggled visible show their name + description under the
    // boss, persistently, for everyone. Collapsible so a long list stays tidy.
    var revealed = b.revealed_skills || [];
    var openState = useState(true); var open = openState[0], setOpen = openState[1];
    return h('div', { className: 'rp-boss-card' + (b.defeated ? ' is-down' : '') },
      b.image_url ? h('img', { className: 'rp-boss-img', src: b.image_url, alt: '', onError: function (e) { e.target.style.display = 'none'; } }) : null,
      h('div', { className: 'rp-boss-info' },
        h('div', { className: 'rp-boss-name' }, b.name,
          b.defeated ? h('span', { className: 'rp-boss-down-tag' }, 'Defeated') : null,
          props.isDM && !b.hp_visible ? h('span', { className: 'rp-boss-down-tag' }, 'HP hidden') : null,
          vuln ? h('span', { className: 'rp-boss-vuln-tag' }, vuln) : null),
        h(BossHpBar, { boss: b }),
        revealed.length ? h('div', { className: 'rp-boss-skills' },
          h('button', { type: 'button', className: 'rp-boss-skills-toggle', onClick: function () { setOpen(!open); } },
            (open ? '▾ ' : '▸ ') + revealed.length + ' skill' + (revealed.length === 1 ? '' : 's')),
          open ? revealed.map(function (s) {
            return h('div', { className: 'rp-boss-tele', key: s.id },
              h('strong', null, s.name), s.description ? ' — ' + s.description : null);
          }) : null) : null),
      props.isDM ? h('button', { type: 'button', className: 'rp-boss-eye',
        title: b.hp_visible ? 'HP is visible to players — click to hide' : 'HP is hidden from players — click to show',
        onClick: function () { props.onBossVisible(b, !b.hp_visible); } },
        h('span', { className: 'material-icons', 'aria-hidden': 'true' }, b.hp_visible ? 'visibility' : 'visibility_off')) : null);
  }
  function BossBar(props) {
    var bosses = props.bosses || [];
    if (!bosses.length) return null;
    return h('div', { className: 'rp-bossbar' },
      bosses.map(function (b) {
        return h(BossCard, { key: b.id, boss: b, isDM: props.isDM, onBossVisible: props.onBossVisible });
      }));
  }

  // ── Roll panels ───────────────────────────────────────────────────────────
  function AttackPanel(props) {
    var ctx = props.ctx; var rules = ctx.rules;
    var rollState = useState(''); var roll = rollState[0], setRoll = rollState[1];
    var bossState = useState(''); var bossPick = bossState[0], setBossPick = bossState[1];
    var busyState = useState(false); var busy = busyState[0], setBusy = busyState[1];
    var msgState = useState(''); var msg = msgState[0], setMsg = msgState[1];
    var calc = computeRoll('attack', roll, ctx); var dmg = damageFor(rules, calc.total);
    var finalDmg = Math.max(0, dmg + calc.outputTotal);
    var capped = Math.min(finalDmg, rules.max_damage_per_attack);
    var living = (props.bosses || []).filter(function (b) { return !b.defeated; });
    var selected = bossPick && living.some(function (b) { return String(b.id) === bossPick; }) ? bossPick : (living.length ? String(living[0].id) : '');
    var selBoss = living.filter(function (b) { return String(b.id) === selected; })[0];
    var effDmg = selBoss && selBoss.damage_mult > 1 ? Math.max(1, Math.floor(capped * selBoss.damage_mult)) : capped;
    var canApply = living.length > 0 && !props.locked && props.canAttack && roll !== '' && capped > 0 && !busy;

    function apply() {
      if (!selected) return;
      setBusy(true); setMsg('');
      Promise.resolve(props.onApplyDamage(selected, capped, parseInt(roll, 10) || 0))
        .then(function () { setBusy(false); setRoll(''); setMsg('Damage applied.'); setTimeout(function () { setMsg(''); }, 2500); })
        .catch(function (e) { setBusy(false); setMsg(e.message || 'Failed to apply.'); });
    }

    return h('div', { className: 'rp-card' }, h('h3', null, 'Attack Roll'),
      props.blockReason ? h('p', { className: 'rp-note', style: { color: 'var(--accent-gold)' } }, props.blockReason) : null,
      h('label', { className: 'rp-input-label' }, 'Raw D' + rules.attack_die + ' roll', h('input', { className: 'rp-input', type: 'number', inputMode: 'numeric', min: 0, max: rules.attack_die, value: roll, placeholder: 'e.g. 14', onChange: function (e) { setRoll(clampNum(e.target.value, rules.attack_die)); } })),
      h(Breakdown, { calc: calc }, h('div', { className: 'rp-bd-row rp-bd-total' }, h('span', null, 'Modified Roll'), h('span', null, calc.total + ' → ' + dmg + ' Damage'))),
      calc.outputRows.length ? h('div', { className: 'rp-breakdown rp-breakdown-output' },
        h('div', { className: 'rp-bd-row rp-bd-base' }, h('span', null, 'Base Damage'), h('span', null, String(dmg))),
        calc.outputRows.map(function (r, i) { return h('div', { className: 'rp-bd-row', key: i }, h('span', null, r.label + ' damage'), h('span', null, fmt(r.value))); }),
        h('div', { className: 'rp-bd-rule' }), h('div', { className: 'rp-bd-row rp-bd-total' }, h('span', null, 'Final Damage'), h('span', null, String(finalDmg)))) : null,
      capped < finalDmg ? h('p', { className: 'rp-note' }, 'Capped at ' + rules.max_damage_per_attack + ' damage per attack.') : null,

      // Apply to a boss — the number is computed and read-only by design.
      living.length ? h('div', { className: 'rp-heal-apply' },
        living.length > 1 ? h('label', { className: 'rp-input-label' }, 'Target',
          h('select', { className: 'rp-select', value: selected, disabled: props.locked || busy, onChange: function (e) { setBossPick(e.target.value); } },
            living.map(function (b) { return h('option', { key: b.id, value: b.id }, b.name); }))) : null,
        h('button', { type: 'button', className: 'rp-btn', disabled: !canApply, onClick: apply },
          busy ? 'Applying…' : 'Apply ' + (effDmg !== capped ? capped + ' → ' + effDmg : capped) + ' damage to ' + (living.length > 1 ? 'target' : living[0].name)),
        (selBoss && selBoss.damage_mult > 1) ? h('p', { className: 'rp-note' }, selBoss.name + ' is ' + selBoss.damage_mult + '× vulnerable — damage is multiplied.') : null,
        msg ? h('p', { className: 'rp-note', style: { color: 'var(--accent-gold)' } }, msg) : null) : null);
  }
  function DefensePanel(props) {
    var rules = props.ctx.rules;
    var rollState = useState(''); var roll = rollState[0], setRoll = rollState[1];
    var calc = computeRoll('defense', roll, props.ctx);
    return h('div', { className: 'rp-card' }, h('h3', null, 'Defensive Roll'),
      h('label', { className: 'rp-input-label' }, 'Raw D' + rules.attack_die + ' roll', h('input', { className: 'rp-input', type: 'number', inputMode: 'numeric', min: 0, max: rules.attack_die, value: roll, placeholder: 'e.g. 10', onChange: function (e) { setRoll(clampNum(e.target.value, rules.attack_die)); } })),
      h(Breakdown, { calc: calc }, h('div', { className: 'rp-bd-row rp-bd-total' }, h('span', null, 'Modified Roll'), h('span', null, String(calc.total)))),
      h('p', { className: 'rp-note' }, 'Provide your final defensive roll number to the DM.'));
  }
  // Even split of a pool across N member ids; earliest ids take the remainder.
  function evenSplit(ids, total) {
    var out = {}; var n = ids.length; if (!n) return out;
    var base = Math.floor(total / n); var rem = total - base * n;
    ids.forEach(function (id, i) { out[id] = base + (i < rem ? 1 : 0); });
    return out;
  }
  function HealPanel(props) {
    var ctx = props.ctx; var rules = ctx.rules; var me = ctx.character; var party = props.party || [];
    var isHealer = me.class_role === 'healer';
    var rollState = useState(''); var roll = rollState[0], setRoll = rollState[1];
    var modeState = useState('single'); var mode = modeState[0], setMode = modeState[1];
    var countState = useState(''); var count = countState[0], setCount = countState[1];
    var singleState = useState(String(me.member_id)); var single = singleState[0], setSingle = singleState[1];
    var allocState = useState({}); var alloc = allocState[0], setAlloc = allocState[1]; // member_id -> amount
    var busyState = useState(false); var busy = busyState[0], setBusy = busyState[1];
    var msgState = useState(''); var msg = msgState[0], setMsg = msgState[1];

    var effMode = isHealer ? mode : 'single';
    var calc = computeRoll('heal', roll, ctx); var pool = calc.total + calc.outputTotal;
    // KO'd (0 HP) allies can't be healed back up during a session — exclude them.
    var living = party.filter(function (p) { return !p.eliminated; });
    var maxPeople = Math.max(1, parseInt(count, 10) || 1);
    var selectedIds = Object.keys(alloc).map(Number);
    var allocated = selectedIds.reduce(function (s, id) { return s + (Number(alloc[id]) || 0); }, 0);

    function reset() { setRoll(''); setCount(''); setAlloc({}); }
    function flash(m) { setMsg(m); setTimeout(function () { setMsg(''); }, 2500); }
    function apply(entries) {
      var clean = entries.filter(function (e) { return e.amount > 0; });
      if (!clean.length) return;
      setBusy(true); setMsg('');
      Promise.resolve(props.onApplyHeal(clean)).then(function () { setBusy(false); reset(); flash('Healing applied.'); })
        .catch(function (e) { setBusy(false); setMsg(e.message || 'Failed to apply.'); });
    }
    function applySingle() { var id = isHealer ? Number(single) : me.member_id; apply([{ member_id: id, amount: pool }]); }
    function applyAoe() { apply(selectedIds.map(function (id) { return { member_id: id, amount: Number(alloc[id]) || 0 }; })); }
    function toggleTarget(id) {
      var ids = selectedIds.slice();
      if (alloc.hasOwnProperty(id)) ids = ids.filter(function (x) { return x !== id; });
      else { if (ids.length >= maxPeople) return; ids = ids.concat(id); }
      setAlloc(evenSplit(ids, pool));
    }
    function setAmount(id, raw) { var n = parseInt(raw, 10); if (isNaN(n) || n < 0) n = 0; var next = Object.assign({}, alloc); next[id] = n; setAlloc(next); }

    var canApply = !props.locked && !busy && pool > 0 && props.canHeal;
    return h('div', { className: 'rp-card' }, h('h3', null, 'Healing Roll'),
      props.blockReason ? h('p', { className: 'rp-note', style: { color: 'var(--accent-gold)' } }, props.blockReason) : null,
      isHealer ? h('div', { className: 'rp-seg' },
        h('button', { type: 'button', className: 'rp-seg-btn' + (mode === 'single' ? ' is-active' : ''), onClick: function () { setMode('single'); } }, 'Single Target'),
        h('button', { type: 'button', className: 'rp-seg-btn' + (mode === 'aoe' ? ' is-active' : ''), onClick: function () { setMode('aoe'); } }, 'AOE')) : null,
      h('label', { className: 'rp-input-label' }, 'Raw D' + rules.heal_die + ' heal roll', h('input', { className: 'rp-input', type: 'number', inputMode: 'numeric', min: 0, max: rules.heal_die, value: roll, placeholder: 'e.g. 3', onChange: function (e) { var v = clampNum(e.target.value, rules.heal_die); setRoll(v); var nc = computeRoll('heal', v, ctx); setAlloc(evenSplit(selectedIds, nc.total + nc.outputTotal)); } })),
      effMode === 'aoe' ? h('label', { className: 'rp-input-label' }, 'Raw D' + rules.heal_die + ' target count (max people)', h('input', { className: 'rp-input', type: 'number', inputMode: 'numeric', min: 1, max: rules.aoe_max_targets, value: count, placeholder: 'e.g. 3', onChange: function (e) { setCount(clampNum(e.target.value, rules.aoe_max_targets)); } })) : null,
      h(Breakdown, { calc: calc }, calc.outputRows.map(function (r, i) { return h('div', { className: 'rp-bd-row', key: 'o' + i }, h('span', null, r.label), h('span', null, fmt(r.value))); })
        .concat([h('div', { className: 'rp-bd-row rp-bd-total', key: 'tot' }, h('span', null, 'Modified Heal'), h('span', null, String(pool)))])),

      // Single-target apply
      effMode === 'single' ? h('div', { className: 'rp-heal-apply' },
        isHealer ? h('label', { className: 'rp-input-label' }, 'Target',
          h('select', { className: 'rp-select', value: single, disabled: props.locked, onChange: function (e) { setSingle(e.target.value); } },
            living.map(function (p) { return h('option', { key: p.member_id, value: p.member_id }, p.member_name + (p.member_id === me.member_id ? ' (you)' : '')); })))
          : h('p', { className: 'rp-note' }, 'Self-heal only — applies to you.'),
        h('button', { type: 'button', className: 'rp-btn', disabled: !canApply, onClick: applySingle }, busy ? 'Applying…' : 'Apply +' + pool + ' to target')) : null,

      // AOE distribute
      effMode === 'aoe' ? h('div', { className: 'rp-heal-apply' },
        h('p', { className: 'rp-note' }, 'Select up to ' + maxPeople + ' to split ' + pool + ' across (even by default — adjust as needed). Allocated ' + allocated + ' / ' + pool + '.'),
        h('div', { className: 'rp-heal-targets' }, living.map(function (p) {
          var on = alloc.hasOwnProperty(p.member_id);
          return h('div', { className: 'rp-heal-target' + (on ? ' is-on' : ''), key: p.member_id },
            h('label', { className: 'rp-heal-pick' },
              h('input', { type: 'checkbox', checked: on, disabled: props.locked || (!on && selectedIds.length >= maxPeople), onChange: function () { toggleTarget(p.member_id); } }),
              h('span', null, p.member_name + (p.member_id === me.member_id ? ' (you)' : ''))),
            on ? h('input', { className: 'rp-buff-val', type: 'number', min: 0, inputMode: 'numeric', value: String(alloc[p.member_id]), disabled: props.locked, onChange: function (e) { setAmount(p.member_id, e.target.value); } }) : null);
        })),
        h('button', { type: 'button', className: 'rp-btn', disabled: !canApply || allocated <= 0, onClick: applyAoe }, busy ? 'Applying…' : 'Apply heal to ' + selectedIds.length + ' target(s)')) : null,
      msg ? h('p', { className: 'rp-note', style: { color: 'var(--accent-gold)' } }, msg) : null);
  }

  // ── Modifier row (in My Items) ────────────────────────────────────────────
  function ModifierRow(props) {
    var m = props.modifier;
    var targetState = useState(''); var pickTarget = targetState[0], setPickTarget = targetState[1];
    var plain = describeModifier(m);
    var extras = [];
    if (m.mode === 'activated' && m.uses_per_session > 0) extras.push((m.uses_per_session - (m.uses_this_session || 0)) + ' of ' + m.uses_per_session + ' uses left');
    if (m.active && m.remaining_turns != null) extras.push('active — ' + m.remaining_turns + (m.duration_turns ? ' of ' + m.duration_turns : '') + ' turns left');
    else if (m.active) extras.push('active now');

    var spent = m.mode === 'activated' && m.uses_per_session > 0 && (m.uses_this_session || 0) >= m.uses_per_session;
    var control;
    if (m.mode === 'activated') {
      var needTarget = m.target_kind === 'party_member';
      control = h('div', { className: 'rp-mod-control' },
        needTarget ? h('select', { className: 'rp-select', value: pickTarget, disabled: props.locked, onChange: function (e) { setPickTarget(e.target.value); } },
          h('option', { value: '' }, 'target…'),
          props.party.map(function (p) { return h('option', { key: p.member_id, value: p.member_id }, p.member_name); })) : null,
        h('button', { type: 'button', className: 'rp-btn is-small', disabled: props.locked || spent || (needTarget && !pickTarget),
          onClick: function () { props.onActivate(m, needTarget ? Number(pickTarget) : null); } }, spent ? 'Spent' : 'Activate'));
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

  // ── My Items ──────────────────────────────────────────────────────────────
  // Mirrors My Profile > My Items: a grid of card thumbnails (art + name +
  // ability count) that each open a detail popup. The popup carries the
  // interactive modifier controls. Reuses the shared .venue-card / .venue-modal
  // / .contrast-border styles from styles.css so the torn border and fallback
  // tile behave exactly like the profile view.
  var ITEM_FALLBACK_BG = 'linear-gradient(135deg, #2a1f1c 0%, #14100e 100%)';
  function ItemCard(props) {
    var it = props.item; var n = (it.abilities || []).length;
    return h('button', { type: 'button', className: 'venue-card rp-item-card', 'aria-label': it.name, onClick: props.onOpen },
      h('div', { className: 'venue-card-media' },
        it.image_url
          ? h('img', { className: 'venue-card-img', src: it.image_url, alt: '', loading: 'lazy', onError: function (e) { e.target.style.display = 'none'; } })
          : h('span', { className: 'venue-card-sig' }, (it.name || '').toLowerCase()),
        h('span', { className: 'contrast-border-half', 'aria-hidden': 'true' })),
      h('div', { className: 'venue-card-body' },
        h('div', { className: 'venue-card-title-row' }, h('h3', { className: 'venue-card-title' }, it.name)),
        n ? h('p', { className: 'venue-card-location' }, n + (n === 1 ? ' ABILITY' : ' ABILITIES')) : null));
  }
  function ItemModal(props) {
    var it = props.item;
    useEffect(function () {
      function onKey(e) { if (e.key === 'Escape' && props.onClose) props.onClose(); }
      document.addEventListener('keydown', onKey);
      var prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
      return function () { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
    }, []);
    var media = it.image_url
      ? h('div', { className: 'contrast-media' },
          h('img', { className: 'venue-modal-img', src: it.image_url, alt: '' }),
          h('span', { className: 'contrast-border', 'aria-hidden': 'true' }))
      : h('div', { className: 'venue-modal-img venue-modal-img-fallback', style: { background: ITEM_FALLBACK_BG } },
          h('span', { className: 'venue-card-sig' }, (it.name || '').toLowerCase()),
          h('span', { className: 'contrast-border', 'aria-hidden': 'true' }));
    return h('div', { className: 'venue-modal-overlay is-open', onMouseDown: function (e) { if (e.target === e.currentTarget && props.onClose) props.onClose(); } },
      h('div', { className: 'venue-modal rp-item-modal', role: 'dialog', 'aria-modal': 'true' },
        h('button', { type: 'button', className: 'venue-modal-close', 'aria-label': 'Close', onClick: props.onClose }, '✕'),
        media,
        h('div', { className: 'venue-modal-content' },
          h('h2', { className: 'venue-modal-title' }, it.name),
          it.description ? h('p', { className: 'venue-modal-desc', style: { whiteSpace: 'pre-wrap' } }, it.description) : null,
          (it.abilities || []).length ? h('div', { className: 'rp-item-abilities' },
            (it.abilities || []).map(function (ab) {
              return h('div', { className: 'rp-item-ability', key: ab.id },
                h('div', { className: 'rp-ability-head' },
                  h('strong', null, ab.name),
                  ab.activate_all ? h('button', { type: 'button', className: 'rp-btn is-small is-ghost', disabled: props.locked,
                    onClick: function () { props.onActivateAll(ab); } }, 'Activate all') : null),
                ab.description ? h('p', { className: 'rp-item-ability-desc' }, ab.description) : null,
                (ab.modifiers || []).map(function (m) {
                  return h(ModifierRow, { key: m.id, modifier: m, party: props.party, locked: props.locked, onToggle: props.onToggle, onActivate: props.onActivate });
                }));
            })) : null)));
  }
  function ItemsPanel(props) {
    var items = props.items;
    var openState = useState(null); var openId = openState[0], setOpenId = openState[1];
    if (!items.length) return h('div', { className: 'rp-items-panel' }, h('h3', null, 'My Items'), h('p', { className: 'rp-note' }, 'No items equipped. An admin assigns and equips items.'));
    // Re-derive the open item from live props each render so its controls track
    // the latest poll (active/uses state) instead of a stale click-time snapshot.
    var openItem = openId ? items.filter(function (it) { return it.item_id === openId; })[0] : null;
    return h('div', { className: 'rp-items-panel' }, h('h3', null, 'My Items'),
      h('div', { className: 'rp-items-grid' },
        items.map(function (it) {
          return h(ItemCard, { key: it.item_id, item: it, onOpen: function () { setOpenId(it.item_id); } });
        })),
      openItem ? h(ItemModal, { item: openItem, party: props.party, locked: props.locked,
        onToggle: props.onToggle, onActivate: props.onActivate, onActivateAll: props.onActivateAll,
        onClose: function () { setOpenId(null); } }) : null);
  }

  // ── Personal buffs ────────────────────────────────────────────────────────
  var BUFF_COMMIT_MS = 900;
  function BuffSlotRow(props) {
    var slot = props.slot;
    var typeState = useState(slot ? slot.type : ''); var type = typeState[0], setType = typeState[1];
    var valState = useState(slot ? String(slot.value) : '1'); var val = valState[0], setVal = valState[1];
    var timerRef = useRef(null); var pendingRef = useRef(false);
    // Sync from props only when settled, so a debounced edit isn't clobbered mid-typing.
    useEffect(function () { if (!pendingRef.current) { setType(slot ? slot.type : ''); setVal(slot ? String(slot.value) : '1'); } }, [slot ? slot.type : '', slot ? slot.value : null]);
    useEffect(function () { return function () { if (timerRef.current) clearTimeout(timerRef.current); }; }, []);
    function fire(nextType, raw) { pendingRef.current = false; if (!nextType) { props.onChange(null); return; } var n = parseInt(raw, 10); if (isNaN(n)) n = 0; props.onChange({ type: nextType, value: n }); }
    // Picking a type / editing the value is debounced — a fresh slot starts at a default
    // value that's usually corrected immediately, so we hold the write until it settles.
    function schedule(nextType, raw) { pendingRef.current = true; if (timerRef.current) clearTimeout(timerRef.current); timerRef.current = setTimeout(function () { fire(nextType, raw); }, BUFF_COMMIT_MS); }
    function onType(e) { var t = e.target.value; setType(t); if (timerRef.current) clearTimeout(timerRef.current); if (!t) { fire('', val); } else { schedule(t, val); } }
    function onVal(e) { var v = e.target.value; setVal(v); if (type) schedule(type, v); }
    function commitNow() { if (timerRef.current) clearTimeout(timerRef.current); if (type) fire(type, val); }
    return h('div', { className: 'rp-buff-row' },
      h('span', { className: 'rp-buff-label' }, props.label),
      h('div', { className: 'rp-buff-controls' },
        h('select', { className: 'rp-select', value: type, disabled: props.disabled, onChange: onType },
          h('option', { value: '' }, '— empty —'), h('option', { value: 'attack_roll' }, 'Attack'), h('option', { value: 'defense_roll' }, 'Defense'), h('option', { value: 'heal_roll' }, 'Heal')),
        type ? h('input', { className: 'rp-buff-val', type: 'number', inputMode: 'numeric', value: val, disabled: props.disabled,
          onChange: onVal, onBlur: commitNow, onKeyDown: function (e) { if (e.key === 'Enter') e.target.blur(); } }) : null));
  }
  function BuffPanel(props) {
    var c = props.character; var savingState = useState(false); var saving = savingState[0], setSaving = savingState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];
    var slots = [c.buff_slot_1, c.buff_slot_2, c.buff_slot_3]; var shield = c.shield_value;
    function occupied(next) { var n = 0; next.forEach(function (s) { if (s) n++; }); if (shield > 0) n++; return n; }
    async function patch(body) { setSaving(true); setErr(''); try { await props.onSave(body); } catch (e) { setErr(e.message || 'Failed to save.'); } finally { setSaving(false); } }
    function setSlot(idx, value) { var next = slots.slice(); next[idx] = value; if (occupied(next) > 3) { setErr('Buff slots full (max 3; an active shield counts as one).'); return; } var body = {}; body['buff_slot_' + (idx + 1)] = value; patch(body); }
    var disabled = saving || props.locked || !props.canBuff;
    return h('div', { className: 'rp-card' }, h('h3', null, 'Personal Buffs'),
      err ? h('div', { className: 'rp-flash error' }, err) : null,
      props.blockReason ? h('p', { className: 'rp-note', style: { color: 'var(--accent-gold)' } }, props.blockReason) : null,
      slots.map(function (slot, idx) { return h(BuffSlotRow, { key: idx, label: 'Slot ' + (idx + 1), slot: slot, disabled: disabled, onChange: function (v) { setSlot(idx, v); } }); }),
      h('p', { className: 'rp-note' }, 'Your own stat buffs only. Max 3 slots; if you have an active shield it uses one slot. Setting a buff uses your action for the turn (further buff edits that turn are free). Shields are edited in the Party panel.'));
  }

  // ── Party (HP + shield, universal) ────────────────────────────────────────
  function Stepper(props) {
    return h('div', { className: 'rp-stepper' },
      h('button', { type: 'button', className: 'rp-btn is-small', disabled: props.disabled, onClick: function () { props.onChange(props.value - 1); } }, '−'),
      h('span', { className: 'rp-step-val' + (props.compact ? ' is-compact' : '') }, props.label),
      h('button', { type: 'button', className: 'rp-btn is-small', disabled: props.disabled, onClick: function () { props.onChange(props.value + 1); } }, '+'));
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
      h('button', { type: 'button', className: 'rp-btn is-small', disabled: props.disabled, onClick: function () { nudge(-1); } }, '−'),
      h('input', { className: 'rp-hp-input' + (props.compact ? ' is-compact' : ''), type: 'number', inputMode: 'numeric', value: val, disabled: props.disabled,
        onChange: function (e) { pendingRef.current = true; setVal(e.target.value); }, onBlur: commitTyped,
        onKeyDown: function (e) { if (e.key === 'Enter') e.target.blur(); } }),
      props.showMax ? h('span', { className: 'rp-hp-max' }, '/ ' + props.max) : null,
      h('button', { type: 'button', className: 'rp-btn is-small', disabled: props.disabled, onClick: function () { nudge(1); } }, '+'));
  }
  function Avatar(props) {
    var imgErrState = useState(false); var imgErr = imgErrState[0], setImgErr = imgErrState[1];
    var url = props.url;
    if (url && !imgErr) return h('img', { className: 'rp-avatar', src: url, alt: '', onError: function () { setImgErr(true); } });
    return h('span', { className: 'rp-avatar rp-avatar-fallback' }, (props.name || '?').charAt(0).toUpperCase());
  }
  function PartyPanel(props) {
    var shieldMax = props.shieldMax != null ? props.shieldMax : 3;
    return h('div', { className: 'rp-card' }, h('h3', null, 'Party'),
      h('div', { className: 'rp-party' },
        props.party.map(function (p) {
          var ko = p.eliminated;
          return h('div', { className: 'rp-party-row' + (ko ? ' is-elim' : '') + (p.member_id === props.myId ? ' is-me' : ''), key: p.member_id },
            h(Avatar, { url: (props.avatars || {})[p.member_id], name: p.member_name }),
            h('div', { className: 'rp-party-id' },
              h('strong', { className: 'rp-party-name' }, p.member_name),
              ko ? h('span', { className: 'rp-elim-tag' }, 'KO') : h('span', { className: 'rp-party-role' }, ROLE_LABEL[p.class_role] || p.class_role)),
            h('div', { className: 'rp-party-stats' },
              h('div', { className: 'rp-hp-edit', title: 'HP' },
                h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'favorite'),
                h(HpStepper, { value: p.current_hp, max: p.max_hp, showMax: true, disabled: props.locked, onChange: function (v) { props.onHp(p, v); } })),
              h('div', { className: 'rp-shield-edit' + (p.shield_value > 0 ? ' is-on' : ''), title: 'Shield' },
                h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'shield'),
                h(HpStepper, { value: p.shield_value, max: shieldMax, compact: true, disabled: props.locked, onChange: function (v) { props.onShield(p, v); } }))));
        })));
  }

  // ── DM panel ──────────────────────────────────────────────────────────────
  function bossEffectText(e) {
    if (e.type === 'none') return 'narrative';  // no target for narrative effects
    var t = e.target_kind === 'party_member' ? 'chosen player' : e.target_kind === 'party_members' ? 'chosen players' : e.target_kind === 'class' ? String(e.target_ref || '').toUpperCase() : 'party';
    var core = e.type === 'damage' ? e.value + ' dmg' : e.value + ' dmg/turn' + (e.duration_turns > 0 ? ' (' + e.duration_turns + 't)' : ' (until removed)');
    return core + ' → ' + t;
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
          onClick: function () { props.onRevealSkill(boss, a, !a.revealed); } }, a.revealed ? 'Shown' : 'Show')),
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
  function DMBossesTab(props) {
    var pickState = useState(''); var pick = pickState[0], setPick = pickState[1];
    var library = props.library || [];
    return h('div', null,
      h('p', { className: 'rp-note', style: { marginTop: 0 } },
        props.campaign.turn_locked
          ? 'Turn locked — boss skills are live.'
          : 'Boss skills unlock while the turn is locked (press End Turn — it’s the boss’ turn).'),
      h('div', { className: 'rp-boss-add' },
        h('select', { className: 'rp-select', value: pick, onChange: function (e) { setPick(e.target.value); } },
          h('option', { value: '' }, library.length ? '— add a boss from the library —' : 'No bosses in the library yet'),
          library.map(function (b) { return h('option', { key: b.id, value: b.id }, b.name + ' (' + b.max_hp + ' HP)'); })),
        h('button', { type: 'button', className: 'rp-btn is-small', disabled: !pick, onClick: function () { props.onBossAdd(pick); setPick(''); } }, 'Add')),
      (props.bosses || []).map(function (b) {
        return h('div', { className: 'rp-dm-boss' + (b.defeated ? ' is-down' : ''), key: b.id },
          h('div', { className: 'rp-dm-boss-head' },
            h('strong', null, b.name), b.defeated ? h('span', { className: 'rp-boss-down-tag' }, 'Defeated') : null,
            h('div', { className: 'rp-effect-ctl' },
              h(HpStepper, { value: b.current_hp, max: b.max_hp, showMax: true, disabled: false, onChange: function (v) { props.onBossHp(b, v); } }),
              h('button', { type: 'button', className: 'rp-btn is-small is-ghost', title: b.hp_visible ? 'HP visible to players — click to hide' : 'HP hidden from players — click to show',
                onClick: function () { props.onBossVisible(b, !b.hp_visible); } },
                h('span', { className: 'material-icons', style: { fontSize: '1rem', verticalAlign: 'middle' } }, b.hp_visible ? 'visibility' : 'visibility_off')),
              h('button', { type: 'button', className: 'rp-chip-x', title: 'Remove boss', onClick: function () { props.onBossRemove(b); } }, '✕'))),
          h(DMBossVuln, { boss: b, onSetVuln: props.onSetVuln }),
          (b.abilities || []).map(function (a) {
            return h(DMBossSkillRow, { key: a.id, ability: a, boss: b, party: props.party, turnLocked: props.campaign.turn_locked, onUseEffect: props.onUseEffect, onRevealSkill: props.onRevealSkill });
          }),
          !(b.abilities || []).length ? h('p', { className: 'rp-note' }, 'No skills on this boss (add them in the admin Boss Library).') : null);
      }),
      !(props.bosses || []).length ? h('p', { className: 'rp-note' }, 'No bosses on the field.') : null,

      props.bossEffects && props.bossEffects.length ? h('div', { style: { marginTop: '0.75rem' } },
        h('h4', { className: 'rp-dm-sub' }, 'Active boss effects'),
        props.bossEffects.map(function (e) {
          var detail = (e.type === 'dot' ? e.value + ' dmg/turn' + (e.target_label ? ' · → ' + e.target_label : '') : 'narrative') +
            (e.remaining_turns != null ? ' · ' + e.remaining_turns + ' turns left' : '');
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
    return h('div', null,
      h('p', { className: 'rp-note', style: { marginTop: 0 } }, 'Reset a player’s spent action if it was a misclick. KO’d players regain the ability to act the moment their HP is raised above 0 in the Party panel.'),
      (props.party || []).map(function (p) {
        var acts = byMember[p.member_id] || [];
        return h('div', { className: 'rp-effect', key: p.member_id },
          h('div', { className: 'rp-effect-info' },
            h('strong', null, p.member_name + (p.eliminated ? ' (KO)' : '')),
            h('span', { className: 'rp-effect-meta' }, acts.length ? 'Action used: ' + acts.join(', ') : 'Action available')),
          h('button', { type: 'button', className: 'rp-btn is-small is-ghost', disabled: !acts.length,
            onClick: function () { props.onResetAction(p.member_id); } }, 'Reset action'));
      }));
  }
  function DMPanel(props) {
    var c = props.campaign; var effects = props.effects; var hpLog = props.hpLog || [];
    var tabState = useState('turn'); var tab = tabState[0], setTab = tabState[1];
    var tabs = [{ id: 'turn', label: 'Turn & Effects' }, { id: 'bosses', label: 'Bosses' }, { id: 'players', label: 'Players' }, { id: 'log', label: 'Log' }];
    return h('div', { className: 'rp-card rp-dm' },
      h('div', { className: 'rp-dm-head' },
        h('h3', null, 'DM Tools'),
        h('div', { className: 'rp-dm-turn' },
          h('span', { className: 'rp-turn-badge' + (c.turn_locked ? ' is-locked' : '') }, 'Turn ' + c.turn_number + (c.turn_locked ? ' · locked' : '')),
          h('button', { type: 'button', className: 'rp-btn is-small', disabled: c.turn_locked, onClick: props.onEndTurn }, 'End Turn'),
          h('button', { type: 'button', className: 'rp-btn is-small', disabled: !c.turn_locked, onClick: props.onNextTurn }, 'Next Turn'))),
      h('div', { className: 'rp-dm-session' },
        h('button', { type: 'button', className: 'rp-btn is-small is-ghost', onClick: props.onPauseSession }, 'Pause session'),
        h('button', { type: 'button', className: 'rp-btn is-small is-danger', onClick: props.onEndSession }, 'End session')),
      h('p', { className: 'rp-note' }, 'End Turn locks the board (the boss’ turn — boss skills go live). Next Turn ticks all timers and DoTs, clears everyone’s spent action, and reopens play. Pause keeps everyone’s values but sends the party back to the standby screen.'),
      h('div', { className: 'rp-dm-tabs' },
        tabs.map(function (t) { return h('button', { type: 'button', key: t.id, className: 'rp-dm-tab' + (tab === t.id ? ' is-active' : ''), onClick: function () { setTab(t.id); } }, t.label); })),

      tab === 'turn' ? h('div', { className: 'rp-dm-effects' },
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
          })) : null,

      tab === 'bosses' ? h(DMBossesTab, { campaign: c, bosses: props.bosses, bossEffects: props.bossEffects, library: props.library, party: props.party,
        onBossAdd: props.onBossAdd, onBossHp: props.onBossHp, onBossVisible: props.onBossVisible, onBossRemove: props.onBossRemove, onSetVuln: props.onSetVuln,
        onUseEffect: props.onUseEffect, onRevealSkill: props.onRevealSkill, onBossEffectPatch: props.onBossEffectPatch, onBossEffectRemove: props.onBossEffectRemove }) : null,

      tab === 'players' ? h(DMPlayersTab, { party: props.party, turnActions: props.turnActions, onResetAction: props.onResetAction }) : null,

      tab === 'log' ? h('aside', { className: 'rp-dm-log' },
        h('h4', { className: 'rp-dm-sub' }, 'Change log'),
        !hpLog.length ? h('p', { className: 'rp-note' }, 'No changes yet this session.') :
          h('div', { className: 'rp-log-list' }, hpLog.map(function (l) {
            var sameTarget = l.actor_member_id === l.target_member_id && l.actor_member_id != null;
            var main = (l.note && sameTarget) ? (l.actor_name || 'Someone')
              : (l.actor_name || 'Someone') + ' → ' + (l.target_name || (l.target_member_id != null ? 'Member ' + l.target_member_id : '—'));
            // Note-only rows (buffs, skill uses) vs numeric rows; numeric rows
            // may carry a note suffix like "rolled 14" on boss damage.
            var noteOnly = l.note && !l.delta;
            var right = noteOnly ? l.note
              : (fmt(l.delta) + ' ' + (l.field === 'shield' ? 'shield' : l.field === 'boss' ? 'boss HP' : 'HP') + ' (now ' + l.new_value + ')' + (l.note ? ' · ' + l.note : ''));
            var rightClass = noteOnly ? 'rp-log-delta rp-log-note' : ('rp-log-delta' + (l.delta >= 0 ? ' is-up' : ' is-down'));
            return h('div', { className: 'rp-log', key: l.id },
              h('span', { className: 'rp-log-main' }, main),
              h('span', { className: rightClass }, right));
          }))) : null);
  }

  // ── Active skills (player view): floating button + popup ──────────────────
  function FloatingSkills(props) {
    var effects = props.effects || [];
    var bossEffects = props.bossEffects || [];
    var openState = useState(false); var open = openState[0], setOpen = openState[1];
    var seenState = useState({}); var seen = seenState[0], setSeen = seenState[1];
    var expState = useState({}); var exp = expState[0], setExp = expState[1];
    var passives = effects.filter(function (e) { return e.mode === 'always'; });
    var actives = effects.filter(function (e) { return e.mode !== 'always'; });
    // "Unseen" = skills used (non-passive) + revealed boss effects the player
    // hasn't opened the panel to view yet.
    var unseen = actives.filter(function (e) { return !seen[e.id]; }).length +
      bossEffects.filter(function (e) { return !seen['b' + e.id]; }).length;
    function openPop() { var s = Object.assign({}, seen); effects.forEach(function (e) { s[e.id] = true; }); bossEffects.forEach(function (e) { s['b' + e.id] = true; }); setSeen(s); setOpen(true); }
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
      var detail = (e.type === 'dot' ? e.value + ' dmg/turn' + (e.target_label ? ' · → ' + e.target_label : '') : 'Narrative') +
        (e.remaining_turns != null ? ' · ' + e.remaining_turns + ' turns left' : '');
      return h('div', { className: 'rp-skill' + (exp[key] ? ' is-open' : ''), key: key },
        h('button', { type: 'button', className: 'rp-skill-head', onClick: function () { toggle(key); } },
          h('span', { className: 'rp-skill-text' },
            h('span', { className: 'rp-skill-name' }, h('strong', null, e.boss_name), ' · ', e.name),
            h('span', { className: 'rp-skill-sum' }, detail)),
          h('span', { className: 'material-icons rp-skill-caret', 'aria-hidden': 'true' }, exp[key] ? 'expand_less' : 'expand_more')),
        exp[key] ? h('div', { className: 'rp-skill-body' },
          e.description ? h('p', { className: 'rp-skill-desc' }, e.description) : h('p', { className: 'rp-skill-desc rp-muted' }, 'No description.')) : null);
    }
    function section(title, list, renderer) { return list.length ? h('div', { className: 'rp-skill-group' }, h('h4', { className: 'rp-skill-group-title' }, title), list.map(renderer)) : null; }
    return h('div', null,
      open ? h('div', { className: 'rp-fab-backdrop', onClick: function () { setOpen(false); } }) : null,
      open ? h('div', { className: 'rp-fab-pop', role: 'dialog', 'aria-label': 'Active skills' },
        h('div', { className: 'rp-fab-pop-head' }, h('h3', null, 'Active Skills'),
          h('button', { type: 'button', className: 'rp-chip-x', title: 'Close', onClick: function () { setOpen(false); } }, '✕')),
        (!effects.length && !bossEffects.length) ? h('p', { className: 'rp-note' }, 'No active skills right now.')
          : h('div', null, section('Passives (always on)', passives, row), section('Active & ongoing', actives, row), section('Boss effects', bossEffects, bossRow)),
        h('p', { className: 'rp-note' }, 'Tap a skill to see its modifiers and description.')) : null,
      h('button', { type: 'button', className: 'rp-fab', title: 'Active skills', 'aria-label': 'Active skills',
        onClick: function () { open ? setOpen(false) : openPop(); } },
        h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'auto_awesome'),
        (!open && unseen > 0) ? h('span', { className: 'rp-fab-badge' }, String(unseen)) : null));
  }

  // ── App ───────────────────────────────────────────────────────────────────
  function App() {
    var sessionState = useState(PVAdminAPI.getSession()); var session = sessionState[0];
    var dataState = useState(null); var data = dataState[0], setData = dataState[1];
    var loadingState = useState(true); var loading = loadingState[0], setLoading = loadingState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];
    var avatarsState = useState({}); var avatars = avatarsState[0], setAvatars = avatarsState[1];
    var libraryState = useState(null); var library = libraryState[0], setLibrary = libraryState[1];
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
    function onSaveBuffs(body) { return PVRollAPI.request('PATCH', '/rp/campaigns/' + cid() + '/characters/' + dataRef.current.character.member_id, body).then(refresh); }
    function onToggle(m, enabled) { act(function () { return PVRollAPI.request('POST', '/rp/modifiers/' + m.id + '/toggle', { campaign_id: cid(), enabled: enabled }); }); }
    function onActivate(m, targetId) { act(function () { return PVRollAPI.request('POST', '/rp/modifiers/' + m.id + '/activate', { campaign_id: cid(), target_member_id: targetId }); }); }
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
    function onBossVisible(b, vis) { act(function () { return PVRollAPI.request('PATCH', '/rp/campaigns/' + cid() + '/bosses/' + b.id, { hp_visible: vis }); }); }
    function onSetVuln(b, mult, turns) { act(function () { return PVRollAPI.request('PATCH', '/rp/campaigns/' + cid() + '/bosses/' + b.id, { damage_mult: mult, damage_mult_turns: turns }); }); }
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
      if (data && data.reason === 'paused') return h(PausedCard, { title: 'Session paused', message: 'Your DM paused the session. Everyone’s HP, shields, and buffs are saved — the board returns the moment it’s resumed.' });
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
      (camp.turn_locked && !isDM) ? h('div', { className: 'rp-flash rp-locked' }, 'Turn locked — the DM is resolving. Hang tight until the next turn.') : null,
      ko ? h('div', { className: 'rp-flash rp-ko' }, 'You’re knocked out — you can’t act until your HP is restored.') : null,

      h(BossBar, { bosses: data.bosses || [], isDM: isDM, onBossVisible: onBossVisible }),

      isDM ? null : h(FloatingSkills, { effects: data.active_effects || [], bossEffects: data.boss_effects || [] }),

      isDM ? h(DMPanel, { campaign: camp, effects: data.active_effects || [], hpLog: data.hp_log || [],
        bosses: data.bosses || [], bossEffects: data.boss_effects || [], library: library || [], party: data.party || [], turnActions: data.turn_actions || [],
        onEndTurn: onEndTurn, onNextTurn: onNextTurn, onToggleEffect: onToggleEffect, onSetTurns: onSetTurns, onRemoveEffect: onRemoveEffect,
        onPauseSession: onPauseSession, onEndSession: onEndSession,
        onBossAdd: onBossAdd, onBossHp: onBossHp, onBossVisible: onBossVisible, onBossRemove: onBossRemove, onSetVuln: onSetVuln, onUseEffect: onUseEffect, onRevealSkill: onRevealSkill,
        onBossEffectPatch: onBossEffectPatch, onBossEffectRemove: onBossEffectRemove, onResetAction: onResetAction }) : null,

      c ? h('div', { className: 'rp-grid' },
        h('div', { className: 'rp-col' },
          h(AttackPanel, { ctx: ctx, bosses: data.bosses || [], locked: actionLocked || ko, canAttack: canAct(data, 'attack'), blockReason: !canAct(data, 'attack') ? actionBlockReason(data, 'attack') : '', onApplyDamage: onApplyDamage }),
          h(DefensePanel, { ctx: ctx }),
          h(HealPanel, { ctx: ctx, party: data.party || [], locked: actionLocked || ko, canHeal: canAct(data, 'heal'), blockReason: !canAct(data, 'heal') ? actionBlockReason(data, 'heal') : '', onApplyHeal: onApplyHeal }),
          h(BuffPanel, { character: c, locked: actionLocked || ko, canBuff: canAct(data, 'buff'), blockReason: !canAct(data, 'buff') ? actionBlockReason(data, 'buff') : '', onSave: onSaveBuffs })),
        h('div', { className: 'rp-col' },
          h(PartyPanel, { party: data.party || [], myId: c.member_id, locked: bookLocked, avatars: avatars, shieldMax: rules.shield_max, onHp: onHp, onShield: onShield }),
          h(ItemsPanel, { items: data.items || [], party: data.party || [], locked: actionLocked || ko, onToggle: onToggle, onActivate: onActivate, onActivateAll: onActivateAll }))
      ) : h(PartyPanel, { party: data.party || [], myId: null, locked: bookLocked, avatars: avatars, shieldMax: rules.shield_max, onHp: onHp, onShield: onShield }));
  }

  window.RollCalculator = App;
})();
