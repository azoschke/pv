// ============================================================================
//  RollCalculator (v4) — player + DM roll calculator / party tracker.
//
//  Worker resolves each player's applicable modifiers (my_modifiers); the page
//  computes the breakdown and drives toggles/activations, the party HP+shield
//  steppers, personal buffs, and the DM turn engine + active-effects panel.
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useRef = React.useRef;

  var POLL_MS = 5000;

  var ARMOR_ATTACK  = { heavy: -1, medium: 1, light: 2 };
  var ARMOR_DEFENSE = { heavy: 2,  medium: 1, light: -1 };
  var ARMOR_LABEL   = { heavy: 'Heavy Armor', medium: 'Medium Armor', light: 'Light Armor' };
  var ROLE_LABEL    = { tank: 'Tank', dps: 'DPS', healer: 'Healer' };
  var BUFF_LABEL    = { attack_roll: 'Attack', defense_roll: 'Defense', heal_roll: 'Heal' };

  function damageFor(r) { if (r >= 20) return 5; if (r >= 16) return 4; if (r >= 11) return 3; if (r >= 6) return 2; return 1; }
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
  function statBuffsOf(c) {
    var out = [];
    ['buff_slot_1', 'buff_slot_2', 'buff_slot_3'].forEach(function (k) { var b = c[k]; if (b && b.type && BUFF_LABEL[b.type]) out.push(b); });
    return out;
  }

  // ── Roll math ─────────────────────────────────────────────────────────────
  function computeRoll(kind, raw, ctx) {
    var rollType = kind === 'attack' ? 'attack_roll' : kind === 'defense' ? 'defense_roll' : 'heal_roll';
    var outputType = kind === 'attack' ? 'attack_output' : kind === 'heal' ? 'heal_output' : null;
    var c = ctx.character; var rows = []; var base = parseInt(raw, 10); if (isNaN(base)) base = 0; var total = base;
    function add(label, val) { if (val) { rows.push({ label: label, value: val }); total += val; } }
    if (kind === 'attack')  add(ARMOR_LABEL[c.armor_type], ARMOR_ATTACK[c.armor_type]);
    if (kind === 'defense') add(ARMOR_LABEL[c.armor_type], ARMOR_DEFENSE[c.armor_type]);
    if (kind === 'attack'  && c.class_role === 'dps')  add('DPS Passive', 1);
    if (kind === 'defense' && c.class_role === 'tank') add('Tank Passive', 2);
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

  // ── Roll panels ───────────────────────────────────────────────────────────
  function AttackPanel(props) {
    var rollState = useState(''); var roll = rollState[0], setRoll = rollState[1];
    var calc = computeRoll('attack', roll, props.ctx); var dmg = damageFor(calc.total); var finalDmg = dmg + calc.outputTotal;
    return h('div', { className: 'rp-card' }, h('h3', null, 'Attack Roll'),
      h('label', { className: 'rp-input-label' }, 'Raw D20 roll', h('input', { className: 'rp-input', type: 'number', inputMode: 'numeric', min: 0, max: 20, value: roll, placeholder: 'e.g. 14', onChange: function (e) { setRoll(clampNum(e.target.value, 20)); } })),
      h(Breakdown, { calc: calc }, h('div', { className: 'rp-bd-row rp-bd-total' }, h('span', null, 'Modified Roll'), h('span', null, calc.total + ' → ' + dmg + ' Damage'))),
      calc.outputRows.length ? h('div', { className: 'rp-breakdown rp-breakdown-output' },
        h('div', { className: 'rp-bd-row rp-bd-base' }, h('span', null, 'Base Damage'), h('span', null, String(dmg))),
        calc.outputRows.map(function (r, i) { return h('div', { className: 'rp-bd-row', key: i }, h('span', null, r.label + ' damage'), h('span', null, fmt(r.value))); }),
        h('div', { className: 'rp-bd-rule' }), h('div', { className: 'rp-bd-row rp-bd-total' }, h('span', null, 'Final Damage'), h('span', null, String(finalDmg)))) : null);
  }
  function DefensePanel(props) {
    var rollState = useState(''); var roll = rollState[0], setRoll = rollState[1];
    var calc = computeRoll('defense', roll, props.ctx);
    return h('div', { className: 'rp-card' }, h('h3', null, 'Defensive Roll'),
      h('label', { className: 'rp-input-label' }, 'Raw D20 roll', h('input', { className: 'rp-input', type: 'number', inputMode: 'numeric', min: 0, max: 20, value: roll, placeholder: 'e.g. 10', onChange: function (e) { setRoll(clampNum(e.target.value, 20)); } })),
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
    var ctx = props.ctx; var me = ctx.character; var party = props.party || [];
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
    // Eliminated (0 HP) allies can't be healed back up during a session — exclude them.
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

    var healed = props.healedThisTurn;
    var canApply = !props.locked && !busy && pool > 0 && !healed;
    return h('div', { className: 'rp-card' }, h('h3', null, 'Healing Roll'),
      healed ? h('p', { className: 'rp-note', style: { color: 'var(--accent-gold)' } }, 'You’ve already healed this turn — wait for the next turn.') : null,
      isHealer ? h('div', { className: 'rp-seg' },
        h('button', { type: 'button', className: 'rp-seg-btn' + (mode === 'single' ? ' is-active' : ''), onClick: function () { setMode('single'); } }, 'Single Target'),
        h('button', { type: 'button', className: 'rp-seg-btn' + (mode === 'aoe' ? ' is-active' : ''), onClick: function () { setMode('aoe'); } }, 'AOE')) : null,
      h('label', { className: 'rp-input-label' }, 'Raw D5 heal roll', h('input', { className: 'rp-input', type: 'number', inputMode: 'numeric', min: 0, max: 5, value: roll, placeholder: 'e.g. 3', onChange: function (e) { var v = clampNum(e.target.value, 5); setRoll(v); var nc = computeRoll('heal', v, ctx); setAlloc(evenSplit(selectedIds, nc.total + nc.outputTotal)); } })),
      effMode === 'aoe' ? h('label', { className: 'rp-input-label' }, 'Raw D5 target count (max people)', h('input', { className: 'rp-input', type: 'number', inputMode: 'numeric', min: 1, max: 5, value: count, placeholder: 'e.g. 3', onChange: function (e) { setCount(clampNum(e.target.value, 5)); } })) : null,
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
    var summary = [];
    if (m.type !== 'none') summary.push(fmt(m.value) + ' ' + m.type.replace('_', ' '));
    summary.push(targetText(m));
    if (m.duration_turns > 0) summary.push(m.duration_turns + '-turn');
    if (m.mode === 'activated' && m.uses_per_session > 0) summary.push((m.uses_per_session - (m.uses_this_session || 0)) + '/' + m.uses_per_session + ' uses');
    if (m.active && m.remaining_turns != null) summary.push('active · ' + m.remaining_turns + (m.duration_turns ? '/' + m.duration_turns : '') + ' turns left');
    else if (m.active) summary.push('active');

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
        h('span', null, h('span', { className: 'rp-mod-mode' }, m.mode), ' ', h('strong', null, m.label || (m.type === 'none' ? 'effect' : m.type.replace('_', ' ')))),
        h('span', { className: 'rp-mod-meta' }, summary.join(' · '))),
      m.type === 'none' && m.mode === 'always' ? null : control);
  }

  // ── My Items ──────────────────────────────────────────────────────────────
  function ItemsPanel(props) {
    var items = props.items;
    if (!items.length) return h('div', { className: 'rp-card' }, h('h3', null, 'My Items'), h('p', { className: 'rp-note' }, 'No items equipped. An admin assigns and equips items.'));
    return h('div', { className: 'rp-card' }, h('h3', null, 'My Items'),
      items.map(function (it) {
        return h('div', { className: 'rp-item', key: it.item_id },
          h('div', { className: 'rp-item-name' }, it.name),
          it.description ? h('p', { className: 'rp-item-flavor' }, it.description) : null,
          (it.abilities || []).map(function (ab) {
            return h('div', { className: 'rp-ability', key: ab.id },
              h('div', { className: 'rp-ability-head' },
                h('strong', null, ab.name),
                ab.activate_all ? h('button', { type: 'button', className: 'rp-btn is-small is-ghost', disabled: props.locked,
                  onClick: function () { props.onActivateAll(ab); } }, 'Activate all') : null),
              ab.description ? h('p', { className: 'rp-ability-desc' }, ab.description) : null,
              (ab.modifiers || []).map(function (m) {
                return h(ModifierRow, { key: m.id, modifier: m, party: props.party, locked: props.locked, onToggle: props.onToggle, onActivate: props.onActivate });
              }));
          }));
      }));
  }

  // ── Personal buffs ────────────────────────────────────────────────────────
  function BuffSlotRow(props) {
    var slot = props.slot; var type = slot ? slot.type : '';
    var valState = useState(slot ? String(slot.value) : '1'); var val = valState[0], setVal = valState[1];
    useEffect(function () { setVal(slot ? String(slot.value) : '1'); }, [type, slot ? slot.value : null]);
    function commit(nextType, raw) { if (!nextType) { props.onChange(null); return; } var n = parseInt(raw, 10); if (isNaN(n)) n = 0; props.onChange({ type: nextType, value: n }); }
    return h('div', { className: 'rp-buff-row' },
      h('span', { className: 'rp-buff-label' }, props.label),
      h('div', { className: 'rp-buff-controls' },
        h('select', { className: 'rp-select', value: type, disabled: props.disabled, onChange: function (e) { commit(e.target.value, val); } },
          h('option', { value: '' }, '— empty —'), h('option', { value: 'attack_roll' }, 'Attack'), h('option', { value: 'defense_roll' }, 'Defense'), h('option', { value: 'heal_roll' }, 'Heal')),
        type ? h('input', { className: 'rp-buff-val', type: 'number', inputMode: 'numeric', value: val, disabled: props.disabled,
          onChange: function (e) { setVal(e.target.value); }, onBlur: function () { commit(type, val); }, onKeyDown: function (e) { if (e.key === 'Enter') e.target.blur(); } }) : null));
  }
  function BuffPanel(props) {
    var c = props.character; var savingState = useState(false); var saving = savingState[0], setSaving = savingState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];
    var slots = [c.buff_slot_1, c.buff_slot_2, c.buff_slot_3]; var shield = c.shield_value;
    function occupied(next) { var n = 0; next.forEach(function (s) { if (s) n++; }); if (shield > 0) n++; return n; }
    async function patch(body) { setSaving(true); setErr(''); try { await props.onSave(body); } catch (e) { setErr(e.message || 'Failed to save.'); } finally { setSaving(false); } }
    function setSlot(idx, value) { var next = slots.slice(); next[idx] = value; if (occupied(next) > 3) { setErr('Buff slots full (max 3; an active shield counts as one).'); return; } var body = {}; body['buff_slot_' + (idx + 1)] = value; patch(body); }
    return h('div', { className: 'rp-card' }, h('h3', null, 'Personal Buffs'),
      err ? h('div', { className: 'rp-flash error' }, err) : null,
      slots.map(function (slot, idx) { return h(BuffSlotRow, { key: idx, label: 'Slot ' + (idx + 1), slot: slot, disabled: saving || props.locked, onChange: function (v) { setSlot(idx, v); } }); }),
      h('p', { className: 'rp-note' }, 'Your own stat buffs only. Max 3 slots; if you have an active shield it uses one slot. Shields are edited in the Party panel.'));
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
  function PartyPanel(props) {
    return h('div', { className: 'rp-card' }, h('h3', null, 'Party'),
      h('div', { className: 'rp-party' },
        props.party.map(function (p) {
          var elim = p.eliminated;
          return h('div', { className: 'rp-party-row' + (elim ? ' is-elim' : '') + (p.member_id === props.myId ? ' is-me' : ''), key: p.member_id },
            h('div', { className: 'rp-party-id' }, h('strong', null, p.member_name), h('span', { className: 'rp-party-role' }, ROLE_LABEL[p.class_role] || p.class_role)),
            h('div', { className: 'rp-party-stats' },
              h('div', { className: 'rp-hp-edit' },
                h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'favorite'),
                h(HpStepper, { value: p.current_hp, max: p.max_hp, showMax: true, disabled: props.locked, onChange: function (v) { props.onHp(p, v); } })),
              h('div', { className: 'rp-shield-edit' + (p.shield_value > 0 ? ' is-on' : '') },
                h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'shield'),
                h(HpStepper, { value: p.shield_value, max: 3, compact: true, disabled: props.locked, onChange: function (v) { props.onShield(p, v); } })),
              elim ? h('span', { className: 'rp-elim-tag' }, 'Eliminated') : null));
        })));
  }

  // ── DM panel ──────────────────────────────────────────────────────────────
  function DMPanel(props) {
    var c = props.campaign; var effects = props.effects; var hpLog = props.hpLog || [];
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
      h('p', { className: 'rp-note' }, 'End Turn locks the board to you. Next Turn ticks all timers down and reopens play. Pause keeps everyone’s values but sends the party back to the standby screen (resume it from the Combat Toolkit).'),
      h('div', { className: 'rp-dm-cols' },
        h('div', { className: 'rp-dm-effects' },
          h('h4', { className: 'rp-dm-sub' }, 'Active effects'),
          !effects.length ? h('p', { className: 'rp-note' }, 'No active effects.') :
            effects.map(function (e) {
              return h('div', { className: 'rp-effect' + (e.enabled ? '' : ' is-off'), key: e.id },
                h('div', { className: 'rp-effect-info' },
                  h('strong', null, e.holder_name + ' — ' + e.item_name),
                  h('span', { className: 'rp-effect-meta' },
                    (e.ability_name ? e.ability_name + ' · ' : '') + (e.label ? e.label + ' · ' : '') +
                    (e.type === 'none' ? 'narrative' : fmt(e.value) + ' ' + e.type.replace('_', ' ')) + ' · → ' + e.target_label +
                    (e.remaining_turns != null ? ' · ' + e.remaining_turns + (e.duration_turns ? '/' + e.duration_turns : '') + ' turns left' : ''))),
                h('div', { className: 'rp-effect-ctl' },
                  e.remaining_turns != null ? h(Stepper, { value: e.remaining_turns, label: String(e.remaining_turns), disabled: false, onChange: function (v) { props.onSetTurns(e, v); } }) : null,
                  h('button', { type: 'button', className: 'rp-btn is-small is-ghost', onClick: function () { props.onToggleEffect(e, !e.enabled); } }, e.enabled ? 'Disable' : 'Enable'),
                  h('button', { type: 'button', className: 'rp-chip-x', title: 'Remove', onClick: function () { props.onRemoveEffect(e); } }, '✕')));
            })),
        h('aside', { className: 'rp-dm-log' },
          h('h4', { className: 'rp-dm-sub' }, 'Change log'),
          !hpLog.length ? h('p', { className: 'rp-note' }, 'No changes yet this session.') :
            h('div', { className: 'rp-log-list' }, hpLog.map(function (l) {
              var sameTarget = l.actor_member_id === l.target_member_id;
              var main = (l.note && sameTarget) ? (l.actor_name || 'Someone')
                : (l.actor_name || 'Someone') + ' → ' + (l.target_name || ('Member ' + l.target_member_id));
              var right = l.note ? l.note : (fmt(l.delta) + ' ' + (l.field === 'shield' ? 'shield' : 'HP') + ' (now ' + l.new_value + ')');
              var rightClass = l.note ? 'rp-log-delta rp-log-note' : ('rp-log-delta' + (l.delta >= 0 ? ' is-up' : ' is-down'));
              return h('div', { className: 'rp-log', key: l.id },
                h('span', { className: 'rp-log-main' }, main),
                h('span', { className: rightClass }, right));
            })))));
  }

  // ── Active skills (player view): floating button + popup ──────────────────
  function FloatingSkills(props) {
    var effects = props.effects || [];
    var openState = useState(false); var open = openState[0], setOpen = openState[1];
    var seenState = useState({}); var seen = seenState[0], setSeen = seenState[1];
    var expState = useState({}); var exp = expState[0], setExp = expState[1];
    var passives = effects.filter(function (e) { return e.mode === 'always'; });
    var actives = effects.filter(function (e) { return e.mode !== 'always'; });
    // "Unseen" = skills used (non-passive) the player hasn't opened the panel to view yet.
    var unseen = actives.filter(function (e) { return !seen[e.id]; }).length;
    function openPop() { var s = Object.assign({}, seen); effects.forEach(function (e) { s[e.id] = true; }); setSeen(s); setOpen(true); }
    function toggle(id) { var n = Object.assign({}, exp); n[id] = !n[id]; setExp(n); }
    function row(e) {
      var detail = (e.type === 'none' ? 'Narrative' : fmt(e.value) + ' ' + e.type.replace('_', ' ')) + ' · → ' + e.target_label +
        (e.remaining_turns != null ? ' · ' + e.remaining_turns + (e.duration_turns ? '/' + e.duration_turns : '') + ' turns left' : '');
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
    function section(title, list) { return list.length ? h('div', { className: 'rp-skill-group' }, h('h4', { className: 'rp-skill-group-title' }, title), list.map(row)) : null; }
    return h('div', null,
      open ? h('div', { className: 'rp-fab-backdrop', onClick: function () { setOpen(false); } }) : null,
      open ? h('div', { className: 'rp-fab-pop', role: 'dialog', 'aria-label': 'Active skills' },
        h('div', { className: 'rp-fab-pop-head' }, h('h3', null, 'Active Skills'),
          h('button', { type: 'button', className: 'rp-chip-x', title: 'Close', onClick: function () { setOpen(false); } }, '✕')),
        !effects.length ? h('p', { className: 'rp-note' }, 'No active skills right now.')
          : h('div', null, section('Passives (always on)', passives), section('Active & ongoing', actives)),
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
    var dataRef = useRef(null); dataRef.current = data;

    async function bootstrap() {
      if (!session) { setLoading(false); return; }
      try { var d = await PVRollAPI.request('GET', '/rp/me/active'); setData(d); setErr(''); }
      catch (e) { if (e.status === 401) setData(null); else setErr(e.message || 'Failed to load.'); }
      finally { setLoading(false); }
    }
    useEffect(function () { bootstrap(); /* eslint-disable-next-line */ }, []);

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

    useEffect(function () {
      if (!data || !data.active) return;
      var cid = data.campaign.id;
      var timer = setInterval(async function () {
        try {
          var s = await PVRollAPI.request('GET', '/rp/campaigns/' + cid + '/sync');
          if (!s.active) { bootstrap(); return; }
          var cur = dataRef.current; if (!cur) return;
          var me = (s.party || []).filter(function (p) { return cur.character && p.member_id === cur.character.member_id; })[0];
          setData(Object.assign({}, cur, {
            campaign: Object.assign({}, cur.campaign, { turn_number: s.turn_number, turn_locked: s.turn_locked, is_dm: s.is_dm }),
            party: s.party, my_modifiers: s.my_modifiers, active_effects: s.active_effects, hp_log: s.hp_log, healed_this_turn: s.healed_this_turn,
            character: me || cur.character, items: mergeItemState(cur.items, s.my_item_state)
          }));
        } catch (_e) {}
      }, POLL_MS);
      return function () { clearInterval(timer); };
    }, [data && data.active, data && data.campaign && data.campaign.id]);

    async function refresh() {
      var cur = dataRef.current; if (!cur || !cur.active) return;
      try {
        var s = await PVRollAPI.request('GET', '/rp/campaigns/' + cur.campaign.id + '/sync');
        var me = (s.party || []).filter(function (p) { return cur.character && p.member_id === cur.character.member_id; })[0];
        setData(Object.assign({}, dataRef.current, {
          campaign: Object.assign({}, cur.campaign, { turn_number: s.turn_number, turn_locked: s.turn_locked, is_dm: s.is_dm }),
          party: s.party, my_modifiers: s.my_modifiers, active_effects: s.active_effects, hp_log: s.hp_log, healed_this_turn: s.healed_this_turn,
          character: me || cur.character, items: mergeItemState(dataRef.current.items, s.my_item_state)
        }));
      } catch (_e) {}
    }

    function cid() { return dataRef.current.campaign.id; }
    async function act(fn) { setErr(''); try { await fn(); await refresh(); } catch (e) { setErr(e.message || 'Action failed.'); } }

    function onHp(p, v) { act(function () { return PVRollAPI.request('PATCH', '/rp/campaigns/' + cid() + '/characters/' + p.member_id, { current_hp: Math.max(0, Math.min(v, p.max_hp)) }); }); }
    function onShield(p, v) { act(function () { return PVRollAPI.request('PATCH', '/rp/campaigns/' + cid() + '/characters/' + p.member_id, { shield_value: Math.max(0, Math.min(v, 3)) }); }); }
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
    // land together) and unable to revive eliminated targets. Then refresh.
    function onApplyHeal(entries) {
      return PVRollAPI.request('POST', '/rp/campaigns/' + cid() + '/heal', { entries: entries }).then(refresh);
    }

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
    var locked = camp.turn_locked && !isDM;
    var ctx = c ? { character: c, myModifiers: data.my_modifiers || [] } : null;

    return h('div', { className: 'rp-tool' },
      h('header', { className: 'rp-header' },
        h('div', null, h('h1', null, 'Roll Calculator'), h('p', { className: 'rp-sub' }, camp.name + ' · Turn ' + camp.turn_number + (camp.turn_locked ? ' (locked)' : ''))),
        c ? h('div', { className: 'rp-me' }, h('strong', null, c.member_name), h('span', null, ROLE_LABEL[c.class_role] + ' · ' + ARMOR_LABEL[c.armor_type])) : h('div', { className: 'rp-me' }, h('strong', null, 'Dungeon Master'))),
      err ? h('div', { className: 'rp-flash error' }, err) : null,
      locked ? h('div', { className: 'rp-flash rp-locked' }, 'Turn locked — the DM is resolving. Hang tight until the next turn.') : null,

      isDM ? null : h(FloatingSkills, { effects: data.active_effects || [] }),

      isDM ? h(DMPanel, { campaign: camp, effects: data.active_effects || [], hpLog: data.hp_log || [], onEndTurn: onEndTurn, onNextTurn: onNextTurn, onToggleEffect: onToggleEffect, onSetTurns: onSetTurns, onRemoveEffect: onRemoveEffect, onPauseSession: onPauseSession, onEndSession: onEndSession }) : null,

      c ? h('div', { className: 'rp-grid' },
        h('div', { className: 'rp-col' },
          h(AttackPanel, { ctx: ctx }), h(DefensePanel, { ctx: ctx }),
          h(HealPanel, { ctx: ctx, party: data.party || [], locked: locked, healedThisTurn: !!data.healed_this_turn, onApplyHeal: onApplyHeal }),
          h(BuffPanel, { character: c, locked: locked, onSave: onSaveBuffs })),
        h('div', { className: 'rp-col' },
          h(PartyPanel, { party: data.party || [], myId: c.member_id, locked: locked, onHp: onHp, onShield: onShield }),
          h(ItemsPanel, { items: data.items || [], party: data.party || [], locked: locked, onToggle: onToggle, onActivate: onActivate, onActivateAll: onActivateAll }))
      ) : h(PartyPanel, { party: data.party || [], myId: null, locked: camp.turn_locked && !isDM, onHp: onHp, onShield: onShield }));
  }

  window.RollCalculator = App;
})();
