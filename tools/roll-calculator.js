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
      h('label', { className: 'rp-input-label' }, 'Raw D20 roll', h('input', { className: 'rp-input', type: 'number', inputMode: 'numeric', value: roll, placeholder: 'e.g. 14', onChange: function (e) { setRoll(e.target.value); } })),
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
      h('label', { className: 'rp-input-label' }, 'Raw D20 roll', h('input', { className: 'rp-input', type: 'number', inputMode: 'numeric', value: roll, placeholder: 'e.g. 10', onChange: function (e) { setRoll(e.target.value); } })),
      h(Breakdown, { calc: calc }, h('div', { className: 'rp-bd-row rp-bd-total' }, h('span', null, 'Modified Roll'), h('span', null, String(calc.total)))),
      h('p', { className: 'rp-note' }, 'Report this number to the GM. No damage tier is shown on defense.'));
  }
  function HealPanel(props) {
    var rollState = useState(''); var roll = rollState[0], setRoll = rollState[1];
    var modeState = useState('single'); var mode = modeState[0], setMode = modeState[1];
    var targetsState = useState(''); var targets = targetsState[0], setTargets = targetsState[1];
    var calc = computeRoll('heal', roll, props.ctx); var finalHeal = calc.total + calc.outputTotal;
    return h('div', { className: 'rp-card' }, h('h3', null, 'Healing Roll'),
      h('div', { className: 'rp-seg' },
        h('button', { type: 'button', className: 'rp-seg-btn' + (mode === 'single' ? ' is-active' : ''), onClick: function () { setMode('single'); } }, 'Single Target'),
        h('button', { type: 'button', className: 'rp-seg-btn' + (mode === 'aoe' ? ' is-active' : ''), onClick: function () { setMode('aoe'); } }, 'AOE')),
      h('label', { className: 'rp-input-label' }, 'Raw D5 heal roll', h('input', { className: 'rp-input', type: 'number', inputMode: 'numeric', value: roll, placeholder: 'e.g. 3', onChange: function (e) { setRoll(e.target.value); } })),
      mode === 'aoe' ? h('label', { className: 'rp-input-label' }, 'Raw D5 target count', h('input', { className: 'rp-input', type: 'number', inputMode: 'numeric', value: targets, placeholder: 'e.g. 3', onChange: function (e) { setTargets(e.target.value); } })) : null,
      h(Breakdown, { calc: calc }, calc.outputRows.map(function (r, i) { return h('div', { className: 'rp-bd-row', key: 'o' + i }, h('span', null, r.label), h('span', null, fmt(r.value))); })
        .concat([h('div', { className: 'rp-bd-row rp-bd-total', key: 'tot' }, h('span', null, 'Modified Heal'), h('span', null, String(finalHeal)))])),
      mode === 'aoe' ? h('p', { className: 'rp-note' }, 'Distribute ' + finalHeal + ' across ' + (parseInt(targets, 10) || 0) + ' target(s) manually.') : null);
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
                h(Stepper, { value: p.current_hp, label: p.current_hp + ' / ' + p.max_hp, disabled: props.locked, onChange: function (v) { props.onHp(p, v); } })),
              h('div', { className: 'rp-shield-edit' + (p.shield_value > 0 ? ' is-on' : '') },
                h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'shield'),
                h(Stepper, { value: p.shield_value, label: String(p.shield_value), compact: true, disabled: props.locked, onChange: function (v) { props.onShield(p, v); } })),
              elim ? h('span', { className: 'rp-elim-tag' }, 'Eliminated') : null));
        })));
  }

  // ── DM panel ──────────────────────────────────────────────────────────────
  function DMPanel(props) {
    var c = props.campaign; var effects = props.effects;
    return h('div', { className: 'rp-card rp-dm' },
      h('div', { className: 'rp-dm-head' },
        h('h3', null, 'DM Tools'),
        h('div', { className: 'rp-dm-turn' },
          h('span', { className: 'rp-turn-badge' + (c.turn_locked ? ' is-locked' : '') }, 'Turn ' + c.turn_number + (c.turn_locked ? ' · locked' : '')),
          h('button', { type: 'button', className: 'rp-btn is-small', disabled: c.turn_locked, onClick: props.onEndTurn }, 'End Turn'),
          h('button', { type: 'button', className: 'rp-btn is-small', disabled: !c.turn_locked, onClick: props.onNextTurn }, 'Next Turn'))),
      h('p', { className: 'rp-note' }, 'End Turn locks the board to you. Next Turn ticks all timers down and reopens play.'),
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
        }));
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
            party: s.party, my_modifiers: s.my_modifiers, active_effects: s.active_effects,
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
          party: s.party, my_modifiers: s.my_modifiers, active_effects: s.active_effects,
          character: me || cur.character, items: mergeItemState(dataRef.current.items, s.my_item_state)
        }));
      } catch (_e) {}
    }

    function cid() { return dataRef.current.campaign.id; }
    async function act(fn) { setErr(''); try { await fn(); await refresh(); } catch (e) { setErr(e.message || 'Action failed.'); } }

    function onHp(p, v) { act(function () { return PVRollAPI.request('PATCH', '/rp/campaigns/' + cid() + '/characters/' + p.member_id, { current_hp: Math.max(0, Math.min(v, p.max_hp)) }); }); }
    function onShield(p, v) { act(function () { return PVRollAPI.request('PATCH', '/rp/campaigns/' + cid() + '/characters/' + p.member_id, { shield_value: Math.max(0, v) }); }); }
    function onSaveBuffs(body) { return PVRollAPI.request('PATCH', '/rp/campaigns/' + cid() + '/characters/' + dataRef.current.character.member_id, body).then(refresh); }
    function onToggle(m, enabled) { act(function () { return PVRollAPI.request('POST', '/rp/modifiers/' + m.id + '/toggle', { campaign_id: cid(), enabled: enabled }); }); }
    function onActivate(m, targetId) { act(function () { return PVRollAPI.request('POST', '/rp/modifiers/' + m.id + '/activate', { campaign_id: cid(), target_member_id: targetId }); }); }
    function onActivateAll(ab) { act(function () { return PVRollAPI.request('POST', '/rp/abilities/' + ab.id + '/activate-all', { campaign_id: cid() }); }); }
    function onEndTurn() { act(function () { return PVRollAPI.request('POST', '/rp/campaigns/' + cid() + '/turn/end', {}); }); }
    function onNextTurn() { act(function () { return PVRollAPI.request('POST', '/rp/campaigns/' + cid() + '/turn/next', {}); }); }
    function onToggleEffect(e, enabled) { act(function () { return PVRollAPI.request('PATCH', '/rp/campaigns/' + cid() + '/active-modifiers/' + e.id, { enabled: enabled }); }); }
    function onSetTurns(e, v) { act(function () { return PVRollAPI.request('PATCH', '/rp/campaigns/' + cid() + '/active-modifiers/' + e.id, { remaining_turns: Math.max(0, v) }); }); }
    function onRemoveEffect(e) { act(function () { return PVRollAPI.request('DELETE', '/rp/campaigns/' + cid() + '/active-modifiers/' + e.id); }); }

    if (!session) return h(LockedCard);
    if (loading) return h('div', { className: 'rp-gate' }, h('p', null, 'Loading…'));
    if (err && !data) return h('div', { className: 'rp-gate' }, h('p', { className: 'rp-flash error' }, err));
    if (!data || !data.active) {
      if (data && data.reason === 'not_linked') return h(PausedCard, { title: 'Account not linked', message: 'Your login isn’t linked to a Free Company roster character yet. Ask an officer to add you.' });
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

      isDM ? h(DMPanel, { campaign: camp, effects: data.active_effects || [], onEndTurn: onEndTurn, onNextTurn: onNextTurn, onToggleEffect: onToggleEffect, onSetTurns: onSetTurns, onRemoveEffect: onRemoveEffect }) : null,

      c ? h('div', { className: 'rp-grid' },
        h('div', { className: 'rp-col' },
          h(AttackPanel, { ctx: ctx }), h(DefensePanel, { ctx: ctx }),
          c.class_role === 'healer' ? h(HealPanel, { ctx: ctx }) : null,
          h(BuffPanel, { character: c, locked: locked, onSave: onSaveBuffs })),
        h('div', { className: 'rp-col' },
          h(PartyPanel, { party: data.party || [], myId: c.member_id, locked: locked, onHp: onHp, onShield: onShield }),
          h(ItemsPanel, { items: data.items || [], party: data.party || [], locked: locked, onToggle: onToggle, onActivate: onActivate, onActivateAll: onActivateAll }))
      ) : h(PartyPanel, { party: data.party || [], myId: null, locked: camp.turn_locked && !isDM, onHp: onHp, onShield: onShield }));
  }

  window.RollCalculator = App;
})();
