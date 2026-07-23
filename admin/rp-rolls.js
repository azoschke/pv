// ============================================================================
//  PVAdminRpRolls — RP roll-session management (portal section).
//
//  Two areas:
//    Campaigns  (officer | admin): create campaigns, start/end live sessions,
//               roster members, set each character's class/armor/max-HP.
//    Catalogue  (admin only):      items + abilities, and equipping items to
//               a campaign character.
//
//  Talks to pv-campaign-rolls-worker via PVRollAPI (separate from the med
//  worker). The member picker for "add to campaign" reads the med worker's
//  /members list via PVAdminAPI.request.
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;

  var CLASS_ROLES = [
    { value: 'tank', label: 'Tank' },
    { value: 'dps', label: 'DPS' },
    { value: 'healer', label: 'Healer' }
  ];
  var ARMOR_TYPES = [
    { value: 'heavy', label: 'Heavy' },
    { value: 'medium', label: 'Medium' },
    { value: 'light', label: 'Light' }
  ];
  // Every effect is a modifier on an ability. 'shield' grants shield (auto-pushed
  // for activated/always; manual for targeted), 'none' is narrative-only text.
  var MOD_TYPES = ['attack_roll', 'defense_roll', 'heal_roll', 'attack_output', 'heal_output', 'shield', 'heal', 'none'];
  var TARGET_KINDS = [
    { value: 'self', label: 'Self' },
    { value: 'group', label: 'Group (everyone)' },
    { value: 'class', label: 'Class' },
    { value: 'holder_item', label: 'Holder of item' },
    { value: 'party_member', label: 'Party member (picked on use)' }
  ];
  var MODES = [
    { value: 'always', label: 'Always on' },
    { value: 'toggle', label: 'Toggle (manual on/off)' },
    { value: 'activated', label: 'Activated (press)' }
  ];

  function flashHook() {
    var st = useState(''); var msg = st[0], set = st[1];
    function go(m) { set(m); setTimeout(function () { set(''); }, 3000); }
    return [msg, go];
  }

  // ── Roster row (one character) ────────────────────────────────────────────
  function RosterRow(props) {
    var ch = props.character;
    var roleState = useState(ch.class_role); var role = roleState[0], setRole = roleState[1];
    var armorState = useState(ch.armor_type); var armor = armorState[0], setArmor = armorState[1];
    var hpState = useState(String(ch.max_hp)); var maxHp = hpState[0], setMaxHp = hpState[1];
    var savingState = useState(false); var saving = savingState[0], setSaving = savingState[1];

    var itemsState = useState(null); var items = itemsState[0], setItems = itemsState[1]; // attached items, null = loading
    var pickState = useState(''); var pick = pickState[0], setPick = pickState[1];
    var showAddState = useState(false); var showAdd = showAddState[0], setShowAdd = showAddState[1];
    var itemErrState = useState(''); var itemErr = itemErrState[0], setItemErr = itemErrState[1];
    var imgErrState = useState(false); var imgErr = imgErrState[0], setImgErr = imgErrState[1];

    var dirty = role !== ch.class_role || armor !== ch.armor_type || String(ch.max_hp) !== maxHp;

    async function loadItems() {
      try {
        var rows = await PVRollAPI.request('GET', '/rp/campaigns/' + props.campaignId + '/characters/' + ch.member_id + '/items');
        setItems(rows || []);
      } catch (e) { setItemErr(e.message); setItems([]); }
    }
    useEffect(function () { loadItems(); /* eslint-disable-next-line */ }, [ch.member_id]);

    async function save() {
      setSaving(true);
      try {
        await props.onSave(ch.member_id, { class_role: role, armor_type: armor, max_hp: parseInt(maxHp, 10) || ch.max_hp });
      } finally { setSaving(false); }
    }

    async function addItem() {
      if (!pick) return;
      setItemErr('');
      try {
        await PVRollAPI.request('POST', '/rp/campaigns/' + props.campaignId + '/characters/' + ch.member_id + '/items', { item_id: pick, equipped: true });
        setPick(''); setShowAdd(false); await loadItems();
        if (props.onItemsChanged) props.onItemsChanged();
      } catch (e) { setItemErr(e.message); }
    }
    async function removeItem(it) {
      setItemErr('');
      try {
        await PVRollAPI.request('DELETE', '/rp/campaigns/' + props.campaignId + '/characters/' + ch.member_id + '/items/' + it.item_id);
        await loadItems();
        if (props.onItemsChanged) props.onItemsChanged();
      } catch (e) { setItemErr(e.message); }
    }

    var attachedIds = {}; (items || []).forEach(function (i) { attachedIds[i.item_id] = true; });
    // Each item is unique: hide ones already assigned to a different member.
    var available = (props.catalogue || []).filter(function (c) {
      if (attachedIds[c.id]) return false;
      return c.assigned_member_id == null || Number(c.assigned_member_id) === Number(ch.member_id);
    });

    return h('div', { className: 'portal-card rp-roster-card', style: { marginBottom: '0.6rem' } },
      // Portrait pulled from the member's roster profile when they have one;
      // otherwise the venue-style fallback tile (gradient + name in script).
      // Full-bleed image + torn contrast border, matching the item cards.
      h('div', { className: 'rp-card-media' },
        (props.imageUrl && !imgErr)
          ? h('img', { src: props.imageUrl, alt: '', onError: function () { setImgErr(true); } })
          : h('span', { className: 'rp-card-sig' }, (ch.member_name || '').toLowerCase()),
        h('span', { className: 'contrast-border-half', 'aria-hidden': 'true' })),
      h('h3', { className: 'rp-roster-name' }, ch.member_name),
      h('div', { className: 'rp-roster-substat' },
        'HP ' + ch.current_hp + '/' + ch.max_hp + (ch.shield_value ? ' · shield ' + ch.shield_value : '') + (ch.eliminated ? ' · KO' : '')),
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(8rem, 1fr))', gap: '0.5rem', marginTop: '0.5rem' } },
        h('div', { className: 'portal-field' },
          h('label', null, 'Class'),
          h('select', { value: role, onChange: function (e) { setRole(e.target.value); } },
            CLASS_ROLES.map(function (o) { return h('option', { key: o.value, value: o.value }, o.label); }))
        ),
        h('div', { className: 'portal-field' },
          h('label', null, 'Armor'),
          h('select', { value: armor, onChange: function (e) { setArmor(e.target.value); } },
            ARMOR_TYPES.map(function (o) { return h('option', { key: o.value, value: o.value }, o.label); }))
        ),
        h('div', { className: 'portal-field' },
          h('label', null, 'Max HP'),
          h('input', { type: 'number', value: maxHp, onChange: function (e) { setMaxHp(e.target.value); } })
        )
      ),

      // Save / Remove — ties to the character as a whole, above the items list.
      h('div', { style: { display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' } },
        h('button', { type: 'button', className: 'portal-btn is-small', disabled: !dirty || saving, onClick: save },
          saving ? 'Saving…' : 'Save'),
        h('button', { type: 'button', className: 'portal-btn is-small is-danger',
          onClick: function () { props.onRemove(ch); } }, 'Remove')
      ),

      // Attached items (inline)
      h('div', { style: { marginTop: '0.6rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-color)' } },
        h('label', { style: { display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: '0.35rem' } }, 'Items'),
        itemErr ? h('div', { className: 'portal-flash error' }, itemErr) : null,
        items === null ? h('p', { style: { color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 } }, 'Loading…') :
          (!items.length ? h('p', { style: { color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 0.4rem' } }, 'No items attached.') :
            items.map(function (it) {
              return h('div', { key: it.item_id, style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0' } },
                h('span', null, it.name),
                props.canEquip ? h('button', { type: 'button', className: 'portal-btn is-small is-danger',
                  onClick: function () { removeItem(it); } }, 'Remove') : null
              );
            })),
        props.canEquip ? (showAdd
          ? h('div', { style: { display: 'flex', gap: '0.5rem', marginTop: '0.4rem', flexWrap: 'wrap' } },
              h('select', { value: pick, style: { flex: '1 1 12rem' }, onChange: function (e) { setPick(e.target.value); } },
                h('option', { value: '' }, available.length ? '— choose an item —' : 'No more items to add'),
                available.map(function (c) { return h('option', { key: c.id, value: c.id }, c.name); })),
              h('button', { type: 'button', className: 'portal-btn is-small', disabled: !pick, onClick: addItem }, 'Add'),
              h('button', { type: 'button', className: 'portal-btn is-small is-ghost', onClick: function () { setShowAdd(false); setPick(''); } }, 'Cancel'))
          : h('button', { type: 'button', className: 'portal-btn is-small is-ghost', style: { marginTop: '0.4rem' }, disabled: !available.length,
              onClick: function () { setShowAdd(true); } }, '+ Add item')) : null
      )
    );
  }

  function fmtNum(n) { return (n >= 0 ? '+' : '') + n; }

  // ── Ability form (name + text + activate-all) ─────────────────────────────
  function AbilityForm(props) {
    var a = props.initial || {};
    var nameState = useState(a.name || ''); var name = nameState[0], setName = nameState[1];
    var descState = useState(a.description || ''); var desc = descState[0], setDesc = descState[1];
    var allState = useState(!!a.activate_all); var activateAll = allState[0], setActivateAll = allState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];

    async function submit(e) {
      e.preventDefault();
      if (!name.trim()) { setErr('Name is required.'); return; }
      try { await props.onSubmit({ name: name.trim(), description: desc.trim() || null, activate_all: activateAll }); }
      catch (e2) { setErr(e2.message || 'Failed to save.'); }
    }
    return h('form', { onSubmit: submit, className: 'portal-card', style: { marginTop: '0.5rem', background: 'var(--bg-card-light)' } },
      err ? h('div', { className: 'portal-flash error' }, err) : null,
      h('div', { className: 'portal-field' }, h('label', null, 'Ability name *'),
        h('input', { type: 'text', value: name, onChange: function (e) { setName(e.target.value); } })),
      h('div', { className: 'portal-field' }, h('label', null, 'Description (shown to the player)'),
        h('textarea', { rows: 4, value: desc, onChange: function (e) { setDesc(e.target.value); } })),
      h('label', { style: { display: 'flex', alignItems: 'center', gap: '0.4rem', margin: '0.25rem 0' } },
        h('input', { type: 'checkbox', checked: activateAll, onChange: function (e) { setActivateAll(e.target.checked); } }),
        'Offer an “Activate all” master control on this ability'),
      h('div', { style: { display: 'flex', gap: '0.5rem', marginTop: '0.5rem' } },
        h('button', { type: 'submit', className: 'portal-btn is-small' }, props.initial ? 'Save ability' : 'Add ability'),
        h('button', { type: 'button', className: 'portal-btn is-small is-ghost', onClick: props.onCancel }, 'Cancel')));
  }

  // ── Modifier form ─────────────────────────────────────────────────────────
  function ModifierForm(props) {
    var m = props.initial || {};
    var labelState = useState(m.label || ''); var label = labelState[0], setLabel = labelState[1];
    var valState = useState(String(m.value != null ? m.value : 1)); var val = valState[0], setVal = valState[1];
    var typeState = useState(m.type || 'attack_roll'); var type = typeState[0], setType = typeState[1];
    var tkState = useState(m.target_kind || 'self'); var tk = tkState[0], setTk = tkState[1];
    var refState = useState(m.target_ref || ''); var ref = refState[0], setRef = refState[1];
    var modeState = useState(m.mode || 'always'); var mode = modeState[0], setMode = modeState[1];
    var usesState = useState(String(m.uses_per_session != null ? m.uses_per_session : 0)); var uses = usesState[0], setUses = usesState[1];
    var durState = useState(String(m.duration_turns != null ? m.duration_turns : 0)); var dur = durState[0], setDur = durState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];
    var guideState = useState(false); var guide = guideState[0], setGuide = guideState[1];

    async function submit(e) {
      e.preventDefault();
      var payload = { label: label.trim() || null, value: parseInt(val, 10) || 0, type: type, target_kind: tk,
        mode: mode, uses_per_session: parseInt(uses, 10) || 0, duration_turns: parseInt(dur, 10) || 0 };
      if (tk === 'class') payload.target_ref = ref || 'tank';
      else if (tk === 'holder_item') { if (!ref) { setErr('Pick the item whose holder is targeted.'); return; } payload.target_ref = ref; }
      else payload.target_ref = null;
      try { await props.onSubmit(payload); } catch (e2) { setErr(e2.message || 'Failed to save.'); }
    }
    return h('form', { onSubmit: submit, className: 'portal-card', style: { marginTop: '0.4rem', background: 'var(--bg-darker)' } },
      err ? h('div', { className: 'portal-flash error' }, err) : null,
      h('div', { style: { display: 'flex', justifyContent: 'flex-end' } },
        h('button', { type: 'button', className: 'portal-btn is-small is-ghost', onClick: function () { setGuide(!guide); } },
          (guide ? '▾ ' : '▸ ') + 'Modifier guide')),
      guide ? h('div', { style: { fontSize: '0.8rem', lineHeight: 1.5, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0.6rem 0.75rem', margin: '0.25rem 0 1.1rem' } },
        h('div', null, h('strong', null, 'Type'), ' — roll/output types (attack, defense, heal_roll, …) feed the player’s roll math. ', h('strong', null, 'shield'), '/', h('strong', null, 'heal'), ' apply straight to shield / HP. ', h('strong', null, 'none'), ' is narrative text only.'),
        h('div', { style: { marginTop: '0.3rem' } }, h('strong', null, 'Target'), ' — self · group · a class · holder of another item · a party member chosen when used.'),
        h('div', { style: { marginTop: '0.3rem' } }, h('strong', null, 'Mode'), ' — always on · toggle (manual on/off) · activated (a press; set Uses, 0 = unlimited).'),
        h('div', { style: { marginTop: '0.3rem' } }, h('strong', null, 'Turns'), ' — ', h('strong', null, '0 = infinite'), ' (shield/heal re-applies every round; a roll buff just stays on). ', h('strong', null, '1'), ' = this round only, used up when the DM hits Next Turn. ', h('strong', null, 'N'), ' = lasts N rounds; the activation round counts as the first.')
      ) : null,
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(7rem, 1fr))', gap: '0.5rem' } },
        h('div', { className: 'portal-field' }, h('label', null, 'Label'),
          h('input', { type: 'text', value: label, placeholder: 'optional', onChange: function (e) { setLabel(e.target.value); } })),
        h('div', { className: 'portal-field' }, h('label', null, 'Value'),
          h('input', { type: 'number', value: val, onChange: function (e) { setVal(e.target.value); } })),
        h('div', { className: 'portal-field' }, h('label', null, 'Type'),
          h('select', { value: type, onChange: function (e) { setType(e.target.value); } },
            MOD_TYPES.map(function (t) { return h('option', { key: t, value: t }, t.replace('_', ' ')); }))),
        h('div', { className: 'portal-field' }, h('label', null, 'Target'),
          h('select', { value: tk, onChange: function (e) { setTk(e.target.value); setRef(''); } },
            TARGET_KINDS.map(function (t) { return h('option', { key: t.value, value: t.value }, t.label); }))),
        tk === 'class' ? h('div', { className: 'portal-field' }, h('label', null, 'Class'),
          h('select', { value: ref || 'tank', onChange: function (e) { setRef(e.target.value); } },
            CLASS_ROLES.map(function (o) { return h('option', { key: o.value, value: o.value }, o.label); }))) : null,
        tk === 'holder_item' ? h('div', { className: 'portal-field' }, h('label', null, 'Of item'),
          h('select', { value: ref, onChange: function (e) { setRef(e.target.value); } },
            h('option', { value: '' }, '— pick —'),
            (props.catalogue || []).map(function (c) { return h('option', { key: c.id, value: c.id }, c.name); }))) : null,
        h('div', { className: 'portal-field' }, h('label', null, 'Mode'),
          h('select', { value: mode, onChange: function (e) { setMode(e.target.value); } },
            MODES.map(function (o) { return h('option', { key: o.value, value: o.value }, o.label); }))),
        mode === 'activated' ? h('div', { className: 'portal-field' }, h('label', null, 'Uses (0=∞)'),
          h('input', { type: 'number', min: 0, value: uses, onChange: function (e) { setUses(e.target.value); } })) : null,
        h('div', { className: 'portal-field' }, h('label', null, 'Turns (0=∞)'),
          h('input', { type: 'number', min: 0, value: dur, onChange: function (e) { setDur(e.target.value); } }))
      ),
      h('p', { className: 'portal-field-help', style: { margin: '0.35rem 0 0' } },
        'Turns: 0 = infinite (shield/heal ticks every round) · 1 = this round only · N = N rounds (activation counts as turn 1).'),
      h('div', { style: { display: 'flex', gap: '0.5rem', marginTop: '0.4rem' } },
        h('button', { type: 'submit', className: 'portal-btn is-small' }, props.initial ? 'Save modifier' : 'Add modifier'),
        h('button', { type: 'button', className: 'portal-btn is-small is-ghost', onClick: props.onCancel }, 'Cancel')));
  }

  function modifierSummary(m, catalogue) {
    var t;
    switch (m.target_kind) {
      case 'self': t = 'self'; break;
      case 'group': t = 'group'; break;
      case 'class': t = String(m.target_ref || '').toUpperCase(); break;
      case 'holder_item': { var it = (catalogue || []).filter(function (c) { return c.id === m.target_ref; })[0]; t = 'holder of ' + (it ? it.name : 'item'); break; }
      case 'party_member': t = 'chosen target'; break;
      default: t = '';
    }
    return (m.type === 'none' ? 'narrative' : fmtNum(m.value) + ' ' + m.type.replace('_', ' ')) + ' · → ' + t + ' · ' + m.mode +
      (m.duration_turns > 0 ? ' · ' + m.duration_turns + 't' : '') +
      (m.mode === 'activated' && m.uses_per_session > 0 ? ' · ' + m.uses_per_session + '×' : '');
  }

  // ── Boss library (officer/admin) ──────────────────────────────────────────
  // Bosses are reusable library entries; DMs spawn instances into a campaign
  // from the calculator (or staff pre-stage them in the campaign panel below).
  // Skills are single-level effects: damage (instant), dot (per turn), none.
  var BOSS_TYPES = [
    { value: 'damage', label: 'Damage (instant)' },
    { value: 'dot', label: 'DoT (damage per turn)' },
    { value: 'none', label: 'Narrative (no numbers)' }
  ];
  var BOSS_TARGETS = [
    { value: 'party_member', label: 'Chosen player (picked on use)' },
    { value: 'party_members', label: 'Chosen players (AOE, picked on use)' },
    { value: 'class', label: 'Class' },
    { value: 'group', label: 'Whole party' }
  ];

  function bossEffectSummary(e) {
    var t = e.target_kind === 'party_member' ? 'chosen player' : e.target_kind === 'party_members' ? 'chosen players' : e.target_kind === 'class' ? String(e.target_ref || '').toUpperCase() : 'party';
    var core = e.type === 'damage' ? e.value + ' dmg' : e.type === 'dot' ? e.value + ' dmg/turn' + (e.duration_turns > 0 ? ' · ' + e.duration_turns + 't' : ' · until removed') : 'narrative';
    return core + (e.type === 'none' ? '' : ' · → ' + t) + (e.uses_per_session > 0 ? ' · ' + e.uses_per_session + '×/session' : '');
  }

  // Skill container: name + description. Numbers and uses live on its effects,
  // which the DM fires one at a time (like an item ability's modifiers).
  function BossAbilityForm(props) {
    var a = props.initial || {};
    var nameState = useState(a.name || ''); var name = nameState[0], setName = nameState[1];
    var descState = useState(a.description || ''); var desc = descState[0], setDesc = descState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];

    async function submit(e) {
      e.preventDefault();
      if (!name.trim()) { setErr('Name is required.'); return; }
      try { await props.onSubmit({ name: name.trim(), description: desc.trim() || null }); }
      catch (e2) { setErr(e2.message || 'Failed to save.'); }
    }
    return h('form', { onSubmit: submit, className: 'portal-card', style: { marginTop: '0.4rem', background: 'var(--bg-card-light)' } },
      err ? h('div', { className: 'portal-flash error' }, err) : null,
      h('div', { className: 'portal-field' }, h('label', null, 'Skill name *'),
        h('input', { type: 'text', value: name, onChange: function (e) { setName(e.target.value); } })),
      h('div', { className: 'portal-field' }, h('label', null, 'Description (shown to players if the DM reveals the skill)'),
        h('textarea', { rows: 3, value: desc, onChange: function (e) { setDesc(e.target.value); } })),
      h('p', { className: 'portal-field-help', style: { margin: '0.35rem 0 0' } },
        'Add effects after creating the skill — the DM fires each effect on its own, with its own uses. Skills fire only while the turn is locked and stay hidden from players until the DM reveals them.'),
      h('div', { style: { display: 'flex', gap: '0.5rem', marginTop: '0.4rem' } },
        h('button', { type: 'submit', className: 'portal-btn is-small' }, props.initial ? 'Save skill' : 'Add skill'),
        h('button', { type: 'button', className: 'portal-btn is-small is-ghost', onClick: props.onCancel }, 'Cancel')));
  }

  function BossEffectForm(props) {
    var x = props.initial || {};
    var typeState = useState(x.type || 'damage'); var type = typeState[0], setType = typeState[1];
    var valState = useState(String(x.value != null ? x.value : 2)); var val = valState[0], setVal = valState[1];
    var tkState = useState(x.target_kind || 'party_member'); var tk = tkState[0], setTk = tkState[1];
    var refState = useState(x.target_ref || 'tank'); var ref = refState[0], setRef = refState[1];
    var durState = useState(String(x.duration_turns != null ? x.duration_turns : 0)); var dur = durState[0], setDur = durState[1];
    var usesState = useState(String(x.uses_per_session != null ? x.uses_per_session : 0)); var uses = usesState[0], setUses = usesState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];

    async function submit(e) {
      e.preventDefault();
      var payload = { type: type, value: parseInt(val, 10) || 0, target_kind: tk,
        target_ref: tk === 'class' ? ref : null, duration_turns: parseInt(dur, 10) || 0, uses_per_session: parseInt(uses, 10) || 0 };
      try { await props.onSubmit(payload); } catch (e2) { setErr(e2.message || 'Failed to save.'); }
    }
    return h('form', { onSubmit: submit, className: 'portal-card', style: { marginTop: '0.4rem', background: 'var(--bg-darker)' } },
      err ? h('div', { className: 'portal-flash error' }, err) : null,
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(8rem, 1fr))', gap: '0.5rem' } },
        h('div', { className: 'portal-field' }, h('label', null, 'Type'),
          h('select', { value: type, onChange: function (e) { setType(e.target.value); } },
            BOSS_TYPES.map(function (t) { return h('option', { key: t.value, value: t.value }, t.label); }))),
        type !== 'none' ? h('div', { className: 'portal-field' }, h('label', null, type === 'dot' ? 'Damage / turn' : 'Damage'),
          h('input', { type: 'number', min: 0, value: val, onChange: function (e) { setVal(e.target.value); } })) : null,
        type !== 'none' ? h('div', { className: 'portal-field' }, h('label', null, 'Target'),
          h('select', { value: tk, onChange: function (e) { setTk(e.target.value); } },
            BOSS_TARGETS.map(function (t) { return h('option', { key: t.value, value: t.value }, t.label); }))) : null,
        type !== 'none' && tk === 'class' ? h('div', { className: 'portal-field' }, h('label', null, 'Class'),
          h('select', { value: ref, onChange: function (e) { setRef(e.target.value); } },
            CLASS_ROLES.map(function (o) { return h('option', { key: o.value, value: o.value }, o.label); }))) : null,
        type === 'dot' ? h('div', { className: 'portal-field' }, h('label', null, 'Turns (0=∞)'),
          h('input', { type: 'number', min: 0, value: dur, onChange: function (e) { setDur(e.target.value); } })) : null,
        h('div', { className: 'portal-field' }, h('label', null, 'Uses / session (0=∞)'),
          h('input', { type: 'number', min: 0, value: uses, onChange: function (e) { setUses(e.target.value); } }))),
      h('p', { className: 'portal-field-help', style: { margin: '0.35rem 0 0' } },
        'Boss damage always hits shields first, then HP. DoTs tick when used and again on every Next Turn. The DM fires this effect on its own, with its own uses/session.'),
      h('div', { style: { display: 'flex', gap: '0.5rem', marginTop: '0.4rem' } },
        h('button', { type: 'submit', className: 'portal-btn is-small' }, props.initial ? 'Save effect' : 'Add effect'),
        h('button', { type: 'button', className: 'portal-btn is-small is-ghost', onClick: props.onCancel }, 'Cancel')));
  }

  function BossForm(props) {
    var b = props.initial || {};
    var nameState = useState(b.name || ''); var name = nameState[0], setName = nameState[1];
    var descState = useState(b.description || ''); var desc = descState[0], setDesc = descState[1];
    var imageState = useState(b.image_url || ''); var image = imageState[0], setImage = imageState[1];
    var hpState = useState(String(b.max_hp != null ? b.max_hp : 30)); var maxHp = hpState[0], setMaxHp = hpState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];

    async function submit(e) {
      e.preventDefault();
      if (!name.trim()) { setErr('Name is required.'); return; }
      var hp = parseInt(maxHp, 10);
      if (!hp || hp < 1) { setErr('Max HP must be a positive number.'); return; }
      try { await props.onSubmit({ name: name.trim(), description: desc.trim() || null, image_url: image.trim() || null, max_hp: hp }); }
      catch (e2) { setErr(e2.message || 'Failed to save.'); }
    }
    return h('form', { onSubmit: submit, className: props.inModal ? '' : 'portal-card', style: props.inModal ? {} : { marginBottom: '1rem' } },
      props.inModal ? null : h('h3', { style: { marginTop: 0 } }, props.initial ? 'Edit boss' : 'New boss'),
      err ? h('div', { className: 'portal-flash error' }, err) : null,
      h('div', { className: 'portal-field' }, h('label', null, 'Name *'),
        h('input', { type: 'text', value: name, onChange: function (e) { setName(e.target.value); } })),
      h('div', { className: 'portal-field' }, h('label', null, 'Flavor / description (staff-only notes)'),
        h('textarea', { rows: 3, value: desc, onChange: function (e) { setDesc(e.target.value); } })),
      h('div', { className: 'portal-field' }, h('label', null, 'Default max HP *'),
        h('input', { type: 'number', min: 1, value: maxHp, onChange: function (e) { setMaxHp(e.target.value); } })),
      (window.PVAdminQuestUtils && PVAdminQuestUtils.ImageField)
        ? h(PVAdminQuestUtils.ImageField, {
            value: image,
            onChange: function (v) { setImage(v); },
            uploadPath: '/venues/images',
            extraFields: { venue_name: name.trim() || 'boss' },
            resize: { square: true, maxSize: 600 },
            help: 'Shown on the battlefield bar in the roll calculator.'
          })
        : h('div', { className: 'portal-field' }, h('label', null, 'Image URL'),
            h('input', { type: 'text', value: image, placeholder: 'https://…', onChange: function (e) { setImage(e.target.value); } })),
      h('div', { style: { display: 'flex', gap: '0.5rem', marginTop: '0.5rem' } },
        h('button', { type: 'submit', className: 'portal-btn' }, props.initial ? 'Save boss' : 'Create boss'),
        h('button', { type: 'button', className: 'portal-btn is-ghost', onClick: props.onCancel }, 'Cancel')));
  }

  function BossCard(props) {
    var b = props.boss;
    var imgErrState = useState(false); var imgErr = imgErrState[0], setImgErr = imgErrState[1];
    return h('div', { className: 'portal-card rp-catalogue-card' },
      h('div', { className: 'rp-card-media' },
        (b.image_url && !imgErr)
          ? h('img', { src: b.image_url, alt: '', onError: function () { setImgErr(true); } })
          : h('span', { className: 'rp-card-sig' }, (b.name || '').toLowerCase()),
        h('span', { className: 'contrast-border-half', 'aria-hidden': 'true' })),
      h('h3', { className: 'rp-catalogue-name' }, b.name),
      h('p', { className: 'rp-catalogue-desc' }, b.max_hp + ' HP · ' + (b.abilities || []).length + ' skill' + ((b.abilities || []).length === 1 ? '' : 's')),
      b.description ? h('p', { className: 'rp-catalogue-desc' }, b.description) : null,
      h('div', { className: 'rp-catalogue-actions' },
        h('button', { type: 'button', className: 'portal-btn is-small', onClick: function () { props.onEdit(b); } }, 'Edit'),
        h('button', { type: 'button', className: 'portal-btn is-small is-danger', onClick: function () { props.onDelete(b); } }, 'Delete')));
  }

  function BossEditorModal(props) {
    var b = props.boss;
    var abFormState = useState(null); var abForm = abFormState[0], setAbForm = abFormState[1]; // null | {ability?}
    var fxFormState = useState(null); var fxForm = fxFormState[0], setFxForm = fxFormState[1]; // null | {abilityId, effect?}
    var errState = useState(''); var err = errState[0], setErr = errState[1];
    var savedState = useState(''); var saved = savedState[0], setSaved = savedState[1];

    async function saveBoss(payload) {
      await PVRollAPI.request('PATCH', '/rp/boss-library/' + b.id, payload);
      setSaved('Boss details saved.'); setTimeout(function () { setSaved(''); }, 2500);
      if (props.onChanged) await props.onChanged();
    }
    async function submitAbility(payload) {
      if (abForm && abForm.ability) await PVRollAPI.request('PATCH', '/rp/boss-abilities/' + abForm.ability.id, payload);
      else await PVRollAPI.request('POST', '/rp/boss-library/' + b.id + '/abilities', payload);
      setAbForm(null); if (props.onChanged) await props.onChanged();
    }
    async function deleteAbility(a) {
      if (!confirm('Delete skill “' + a.name + '” and its effects?')) return;
      try { await PVRollAPI.request('DELETE', '/rp/boss-abilities/' + a.id); if (props.onChanged) await props.onChanged(); }
      catch (e) { setErr(e.message); }
    }
    async function submitEffect(payload) {
      if (fxForm.effect) await PVRollAPI.request('PATCH', '/rp/boss-ability-effects/' + fxForm.effect.id, payload);
      else await PVRollAPI.request('POST', '/rp/boss-abilities/' + fxForm.abilityId + '/effects', payload);
      setFxForm(null); if (props.onChanged) await props.onChanged();
    }
    async function deleteEffect(x) {
      if (!confirm('Delete this effect?')) return;
      try { await PVRollAPI.request('DELETE', '/rp/boss-ability-effects/' + x.id); if (props.onChanged) await props.onChanged(); }
      catch (e) { setErr(e.message); }
    }

    return h(window.PVAdminModal, { title: 'Edit boss — ' + b.name, size: 'lg', onClose: props.onClose },
      saved ? h('div', { className: 'portal-flash success' }, saved) : null,
      h(BossForm, { initial: b, inModal: true, onSubmit: saveBoss, onCancel: props.onClose }),
      h('div', { className: 'rp-editor-section' },
        h('h4', null, 'Skills'),
        err ? h('div', { className: 'portal-flash error' }, err) : null,
        abForm ? h(BossAbilityForm, { initial: abForm.ability, onSubmit: submitAbility, onCancel: function () { setAbForm(null); } })
          : h('button', { type: 'button', className: 'portal-btn is-small', style: { marginBottom: '0.6rem' }, onClick: function () { setAbForm({}); } }, '+ Add skill'),
        !(b.abilities || []).length ? h('p', { style: { color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 } }, 'No skills yet. Skills are what the DM fires during the locked (boss) turn — each can carry several effects.') :
          (b.abilities || []).map(function (a) {
            return h('div', { key: a.id, style: { padding: '0.4rem 0', borderTop: '1px solid var(--border-color)' } },
              h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' } },
                h('div', null,
                  h('strong', null, a.name),
                  a.description ? h('div', { style: { fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.15rem', whiteSpace: 'pre-wrap' } }, a.description) : null),
                h('div', { style: { display: 'flex', gap: '0.3rem', flexShrink: 0 } },
                  h('button', { type: 'button', className: 'portal-btn is-small is-ghost', onClick: function () { setAbForm({ ability: a }); } }, 'Edit'),
                  h('button', { type: 'button', className: 'portal-btn is-small is-danger', onClick: function () { deleteAbility(a); } }, '✕'))),
              (a.effects || []).map(function (x) {
                return h('div', { key: x.id, style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0.5rem', background: 'var(--bg-card-light)', border: '1px solid var(--border-color)', borderRadius: '0.35rem', marginTop: '0.3rem' } },
                  h('span', { style: { fontSize: '0.8rem' } }, bossEffectSummary(x)),
                  h('span', { style: { display: 'flex', gap: '0.3rem', flexShrink: 0 } },
                    h('button', { type: 'button', className: 'portal-btn is-small is-ghost', style: { padding: '0.12rem 0.4rem', fontSize: '0.72rem' }, onClick: function () { setFxForm({ abilityId: a.id, effect: x }); } }, 'Edit'),
                    h('button', { type: 'button', className: 'portal-btn is-small is-danger', style: { padding: '0.12rem 0.4rem', fontSize: '0.72rem' }, onClick: function () { deleteEffect(x); } }, '✕')));
              }),
              (fxForm && fxForm.abilityId === a.id)
                ? h(BossEffectForm, { initial: fxForm.effect, onSubmit: submitEffect, onCancel: function () { setFxForm(null); } })
                : h('button', { type: 'button', className: 'portal-btn is-small is-ghost', style: { marginTop: '0.3rem', padding: '0.12rem 0.4rem', fontSize: '0.72rem' }, onClick: function () { setFxForm({ abilityId: a.id, effect: null }); } }, '+ Add effect'));
          })));
  }

  // ── System rules editor (admin only) ──────────────────────────────────────
  // One global JSON doc on the worker (rp_rules), strictly validated server-side.
  // Missing keys always fall back to code defaults, so this form can never brick
  // the calculator. History keeps the last 5 saves for one-click restore.
  var PASSIVE_TYPES = [
    { value: 'attack_roll', label: 'Attack roll' },
    { value: 'defense_roll', label: 'Defense roll' },
    { value: 'heal_roll', label: 'Heal roll' }
  ];
  function RulesEditor(props) {
    var docState = useState(null); var doc = docState[0], setDoc = docState[1];
    var defaultsState = useState(null); var defaults = defaultsState[0], setDefaults = defaultsState[1];
    var metaState = useState(null); var meta = metaState[0], setMeta = metaState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];
    var savedState = useState(''); var saved = savedState[0], setSaved = savedState[1];
    var savingState = useState(false); var saving = savingState[0], setSaving = savingState[1];
    var histState = useState(null); var history = histState[0], setHistory = histState[1];
    var showHistState = useState(false); var showHist = showHistState[0], setShowHist = showHistState[1];

    function clone(x) { return JSON.parse(JSON.stringify(x)); }
    async function load() {
      try {
        var r = await PVRollAPI.request('GET', '/rp/rules');
        setDoc(clone(r.rules)); setDefaults(r.defaults || null); setMeta({ updated_by: r.updated_by, updated_at: r.updated_at });
      } catch (e) { setErr(e.status === 404 ? 'The worker doesn’t support editable rules yet — deploy v9.5 first.' : (e.message || 'Failed to load rules.')); }
    }
    useEffect(function () { load(); /* eslint-disable-next-line */ }, []);

    function upd(fn) { var next = clone(doc); fn(next); setDoc(next); }
    function num(v) { var n = parseInt(v, 10); return isNaN(n) ? 0 : n; }

    async function save() {
      setSaving(true); setErr(''); setSaved('');
      try {
        var r = await PVRollAPI.request('PUT', '/rp/rules', doc);
        setDoc(clone(r.rules)); setSaved('Rules saved — live sessions pick them up within a few seconds.');
        setTimeout(function () { setSaved(''); }, 4000);
        setHistory(null);
      } catch (e) { setErr(e.message || 'Failed to save.'); }
      finally { setSaving(false); }
    }
    async function loadHistory() {
      try { setHistory(await PVRollAPI.request('GET', '/rp/rules/history') || []); }
      catch (e) { setErr(e.message); setHistory([]); }
    }
    async function restore(entry) {
      if (!confirm('Restore the rules saved by ' + (entry.updated_by || 'unknown') + '? Current rules go into history.')) return;
      try { var r = await PVRollAPI.request('POST', '/rp/rules/restore', { history_id: entry.id }); setDoc(clone(r.rules)); setHistory(null); setSaved('Rules restored.'); setTimeout(function () { setSaved(''); }, 3000); }
      catch (e) { setErr(e.message); }
    }

    if (!doc) return h('div', { className: 'portal-card' }, err ? h('div', { className: 'portal-flash error' }, err) : 'Loading rules…');

    var fieldGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(8rem, 1fr))', gap: '0.5rem' };
    return h('div', null,
      props.anyLive ? h('div', { className: 'portal-flash error' }, 'A session is live right now — saved changes apply to it immediately.') : null,
      err ? h('div', { className: 'portal-flash error' }, err) : null,
      saved ? h('div', { className: 'portal-flash success' }, saved) : null,
      meta && meta.updated_at ? h('p', { style: { color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '0 0 0.75rem' } },
        'Last saved by ' + (meta.updated_by || 'unknown') + ' · ' + new Date(meta.updated_at * 1000).toLocaleString()) : null,

      // Base HP + shield + action economy
      h('div', { className: 'portal-card', style: { marginBottom: '0.6rem' } },
        h('h3', { style: { marginTop: 0 } }, 'Classes & core caps'),
        h('div', { style: fieldGrid },
          CLASS_ROLES.map(function (o) {
            return h('div', { className: 'portal-field', key: o.value }, h('label', null, o.label + ' base HP'),
              h('input', { type: 'number', min: 1, value: String(doc.role_base_hp[o.value]), onChange: function (e) { var v = num(e.target.value); upd(function (d) { d.role_base_hp[o.value] = v; }); } }));
          }),
          h('div', { className: 'portal-field' }, h('label', null, 'Shield max'),
            h('input', { type: 'number', min: 0, value: String(doc.shield_max), onChange: function (e) { var v = num(e.target.value); upd(function (d) { d.shield_max = v; }); } })),
          h('div', { className: 'portal-field' }, h('label', null, 'Max damage / attack'),
            h('input', { type: 'number', min: 1, value: String(doc.max_damage_per_attack), onChange: function (e) { var v = num(e.target.value); upd(function (d) { d.max_damage_per_attack = v; }); } })),
          h('div', { className: 'portal-field' }, h('label', null, 'Actions / turn (0=∞)'),
            h('input', { type: 'number', min: 0, value: String(doc.actions_per_turn), onChange: function (e) { var v = num(e.target.value); upd(function (d) { d.actions_per_turn = v; }); } }))),
        h('p', { className: 'portal-field-help', style: { margin: '0.35rem 0 0.5rem' } }, 'Which actions consume the per-turn budget:'),
        h('div', { style: { display: 'flex', gap: '1rem', flexWrap: 'wrap' } },
          ['attack', 'heal', 'buff'].map(function (k) {
            return h('label', { key: k, style: { display: 'flex', alignItems: 'center', gap: '0.35rem' } },
              h('input', { type: 'checkbox', checked: doc.action_types[k] !== false, onChange: function (e) { var v = e.target.checked; upd(function (d) { d.action_types[k] = v; }); } }), k);
          })),
        h('p', { className: 'portal-field-help', style: { margin: '0.5rem 0 0' } }, 'Cap changes never sweep existing values mid-session — they apply from the next change onward. Buff slots are fixed at 3 (an active shield occupies one).')),

      // Dice
      h('div', { className: 'portal-card', style: { marginBottom: '0.6rem' } },
        h('h3', { style: { marginTop: 0 } }, 'Dice'),
        h('div', { style: fieldGrid },
          h('div', { className: 'portal-field' }, h('label', null, 'Attack/defense die (D)'),
            h('input', { type: 'number', min: 1, value: String(doc.attack_die), onChange: function (e) { var v = num(e.target.value); upd(function (d) { d.attack_die = v; }); } })),
          h('div', { className: 'portal-field' }, h('label', null, 'Heal die (D)'),
            h('input', { type: 'number', min: 1, value: String(doc.heal_die), onChange: function (e) { var v = num(e.target.value); upd(function (d) { d.heal_die = v; }); } })),
          h('div', { className: 'portal-field' }, h('label', null, 'AOE heal max targets'),
            h('input', { type: 'number', min: 1, value: String(doc.aoe_max_targets), onChange: function (e) { var v = num(e.target.value); upd(function (d) { d.aoe_max_targets = v; }); } })))),

      // Armor modifiers
      h('div', { className: 'portal-card', style: { marginBottom: '0.6rem' } },
        h('h3', { style: { marginTop: 0 } }, 'Armor modifiers'),
        ARMOR_TYPES.map(function (o) {
          return h('div', { key: o.value, style: { display: 'grid', gridTemplateColumns: '6rem 1fr 1fr', gap: '0.5rem', alignItems: 'end', marginBottom: '0.35rem' } },
            h('strong', { style: { paddingBottom: '0.55rem' } }, o.label),
            h('div', { className: 'portal-field' }, h('label', null, 'Attack'),
              h('input', { type: 'number', value: String(doc.armor[o.value].attack), onChange: function (e) { var v = num(e.target.value); upd(function (d) { d.armor[o.value].attack = v; }); } })),
            h('div', { className: 'portal-field' }, h('label', null, 'Defense'),
              h('input', { type: 'number', value: String(doc.armor[o.value].defense), onChange: function (e) { var v = num(e.target.value); upd(function (d) { d.armor[o.value].defense = v; }); } })));
        })),

      // Class passives
      h('div', { className: 'portal-card', style: { marginBottom: '0.6rem' } },
        h('h3', { style: { marginTop: 0 } }, 'Class passives'),
        (doc.class_passives || []).map(function (p, i) {
          return h('div', { key: i, style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(7rem, 1fr)) 2.2rem', gap: '0.5rem', alignItems: 'end', marginBottom: '0.35rem' } },
            h('div', { className: 'portal-field' }, h('label', null, 'Class'),
              h('select', { value: p.class, onChange: function (e) { var v = e.target.value; upd(function (d) { d.class_passives[i].class = v; }); } },
                CLASS_ROLES.map(function (o) { return h('option', { key: o.value, value: o.value }, o.label); }))),
            h('div', { className: 'portal-field' }, h('label', null, 'Applies to'),
              h('select', { value: p.type, onChange: function (e) { var v = e.target.value; upd(function (d) { d.class_passives[i].type = v; }); } },
                PASSIVE_TYPES.map(function (o) { return h('option', { key: o.value, value: o.value }, o.label); }))),
            h('div', { className: 'portal-field' }, h('label', null, 'Value'),
              h('input', { type: 'number', value: String(p.value), onChange: function (e) { var v = num(e.target.value); upd(function (d) { d.class_passives[i].value = v; }); } })),
            h('div', { className: 'portal-field' }, h('label', null, 'Label'),
              h('input', { type: 'text', value: p.label || '', onChange: function (e) { var v = e.target.value; upd(function (d) { d.class_passives[i].label = v; }); } })),
            h('button', { type: 'button', className: 'portal-btn is-small is-danger', style: { marginBottom: '0.15rem' }, onClick: function () { upd(function (d) { d.class_passives.splice(i, 1); }); } }, '✕'));
        }),
        h('button', { type: 'button', className: 'portal-btn is-small is-ghost', onClick: function () { upd(function (d) { d.class_passives.push({ class: 'dps', type: 'attack_roll', value: 1, label: '' }); }); } }, '+ Add passive')),

      // Damage tiers
      h('div', { className: 'portal-card', style: { marginBottom: '0.6rem' } },
        h('h3', { style: { marginTop: 0 } }, 'Attack damage tiers'),
        h('p', { className: 'portal-field-help', style: { margin: '0 0 0.5rem' } }, 'A modified roll of at least “min roll” deals that damage. Exactly one tier must have min roll 0 (the catch-all).'),
        (doc.damage_tiers || []).map(function (t, i) {
          return h('div', { key: i, style: { display: 'grid', gridTemplateColumns: '1fr 1fr 2.2rem', gap: '0.5rem', alignItems: 'end', marginBottom: '0.35rem' } },
            h('div', { className: 'portal-field' }, h('label', null, 'Min roll'),
              h('input', { type: 'number', min: 0, value: String(t.min), onChange: function (e) { var v = num(e.target.value); upd(function (d) { d.damage_tiers[i].min = v; }); } })),
            h('div', { className: 'portal-field' }, h('label', null, 'Damage'),
              h('input', { type: 'number', min: 0, value: String(t.damage), onChange: function (e) { var v = num(e.target.value); upd(function (d) { d.damage_tiers[i].damage = v; }); } })),
            h('button', { type: 'button', className: 'portal-btn is-small is-danger', style: { marginBottom: '0.15rem' }, onClick: function () { upd(function (d) { d.damage_tiers.splice(i, 1); }); } }, '✕'));
        }),
        h('button', { type: 'button', className: 'portal-btn is-small is-ghost', onClick: function () { upd(function (d) { d.damage_tiers.push({ min: 0, damage: 1 }); }); } }, '+ Add tier')),

      // Save / defaults / history
      h('div', { style: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' } },
        h('button', { type: 'button', className: 'portal-btn', disabled: saving, onClick: save }, saving ? 'Saving…' : 'Save rules'),
        defaults ? h('button', { type: 'button', className: 'portal-btn is-ghost', onClick: function () { if (confirm('Load the built-in defaults into the form? Nothing is saved until you press Save.')) setDoc(clone(defaults)); } }, 'Load defaults') : null,
        h('button', { type: 'button', className: 'portal-btn is-ghost', onClick: function () { var next = !showHist; setShowHist(next); if (next && history === null) loadHistory(); } }, (showHist ? '▾ ' : '▸ ') + 'History')),
      showHist ? h('div', { className: 'portal-card', style: { marginTop: '0.6rem' } },
        history === null ? h('p', { style: { margin: 0 } }, 'Loading…') :
          (!history.length ? h('p', { style: { margin: 0, color: 'var(--text-secondary)' } }, 'No previous saves yet.') :
            history.map(function (e2) {
              return h('div', { key: e2.id, style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0', borderTop: '1px solid var(--border-color)' } },
                h('span', { style: { fontSize: '0.85rem' } }, (e2.updated_by || 'unknown') + ' · ' + new Date(e2.updated_at * 1000).toLocaleString()),
                h('button', { type: 'button', className: 'portal-btn is-small is-ghost', onClick: function () { restore(e2); } }, 'Restore'));
            }))) : null);
  }

  // ── Item card (compact; opens the editor modal) ───────────────────────────
  // Image sits full-bleed on top (or the fallback signature tile), text is
  // padded below with the torn contrast border between — matching the roster
  // and public item cards. Editing happens in a modal so the grid never shifts.
  function ItemCard(props) {
    var it = props.item;
    var imgErrState = useState(false); var imgErr = imgErrState[0], setImgErr = imgErrState[1];
    return h('div', { className: 'portal-card rp-catalogue-card' },
      h('div', { className: 'rp-card-media' },
        (it.image_url && !imgErr)
          ? h('img', { src: it.image_url, alt: '', onError: function () { setImgErr(true); } })
          : h('span', { className: 'rp-card-sig' }, (it.name || '').toLowerCase()),
        h('span', { className: 'contrast-border-half', 'aria-hidden': 'true' })),
      h('h3', { className: 'rp-catalogue-name' }, it.name),
      it.description ? h('p', { className: 'rp-catalogue-desc' }, it.description) : null,
      h('div', { className: 'rp-catalogue-actions' },
        h('button', { type: 'button', className: 'portal-btn is-small', onClick: function () { props.onEdit(it); } }, 'Edit'),
        h('button', { type: 'button', className: 'portal-btn is-small is-danger', onClick: function () { props.onDelete(it); } }, 'Delete')));
  }

  // ── Item editor modal (item fields + abilities → modifiers) ───────────────
  function ItemEditorModal(props) {
    var it = props.item;
    var abilitiesState = useState(null); var abilities = abilitiesState[0], setAbilities = abilitiesState[1];
    var abFormState = useState(null); var abForm = abFormState[0], setAbForm = abFormState[1]; // null | {ability?}
    var modFormState = useState(null); var modForm = modFormState[0], setModForm = modFormState[1]; // null | {abilityId, modifier?}
    var errState = useState(''); var err = errState[0], setErr = errState[1];
    var savedState = useState(''); var saved = savedState[0], setSaved = savedState[1];

    async function loadAbilities() {
      try { setAbilities(await PVRollAPI.request('GET', '/rp/items/' + it.id + '/abilities') || []); }
      catch (e) { setErr(e.message); }
    }
    useEffect(function () { loadAbilities(); /* eslint-disable-next-line */ }, [it.id]);

    async function saveItem(payload) {
      await PVRollAPI.request('PATCH', '/rp/items/' + it.id, payload);
      setSaved('Item details saved.'); setTimeout(function () { setSaved(''); }, 2500);
      if (props.onChanged) props.onChanged();
    }
    async function submitAbility(payload) {
      if (abForm && abForm.ability) await PVRollAPI.request('PATCH', '/rp/abilities/' + abForm.ability.id, payload);
      else await PVRollAPI.request('POST', '/rp/items/' + it.id + '/abilities', payload);
      setAbForm(null); await loadAbilities();
    }
    async function deleteAbility(ab) {
      if (!confirm('Delete ability “' + ab.name + '” and its modifiers?')) return;
      try { await PVRollAPI.request('DELETE', '/rp/abilities/' + ab.id); await loadAbilities(); } catch (e) { setErr(e.message); }
    }
    async function submitModifier(payload) {
      if (modForm.modifier) await PVRollAPI.request('PATCH', '/rp/modifiers/' + modForm.modifier.id, payload);
      else await PVRollAPI.request('POST', '/rp/abilities/' + modForm.abilityId + '/modifiers', payload);
      setModForm(null); await loadAbilities();
    }
    async function deleteModifier(mod) {
      if (!confirm('Delete this modifier?')) return;
      try { await PVRollAPI.request('DELETE', '/rp/modifiers/' + mod.id); await loadAbilities(); } catch (e) { setErr(e.message); }
    }

    return h(window.PVAdminModal, { title: 'Edit item — ' + it.name, size: 'lg', onClose: props.onClose },
      saved ? h('div', { className: 'portal-flash success' }, saved) : null,
      // Item details — Cancel closes the modal.
      h(ItemForm, { initial: it, inModal: true, onSubmit: saveItem, onCancel: props.onClose }),

      h('div', { className: 'rp-editor-section' },
        h('h4', null, 'Abilities'),
        err ? h('div', { className: 'portal-flash error' }, err) : null,
        abForm ? h(AbilityForm, { initial: abForm.ability, onSubmit: submitAbility, onCancel: function () { setAbForm(null); } })
          : h('button', { type: 'button', className: 'portal-btn is-small', style: { marginBottom: '0.6rem' }, onClick: function () { setAbForm({}); } }, '+ Add ability'),
        abilities === null ? h('p', null, 'Loading…') :
          (!abilities.length ? h('p', { style: { color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 } }, 'No abilities yet. All item effects live on abilities — add one to get started.') :
          abilities.map(function (ab) {
            return h('div', { key: ab.id, style: { padding: '0.4rem 0', borderTop: '1px solid var(--border-color)' } },
              h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' } },
                h('div', null,
                  h('strong', null, ab.name),
                  ab.activate_all ? h('span', { style: { marginLeft: '0.4rem', fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '0.3rem', padding: '0 0.3rem' } }, 'activate all') : null,
                  ab.description ? h('div', { style: { fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.15rem', whiteSpace: 'pre-wrap' } }, ab.description) : null),
                h('div', { style: { display: 'flex', gap: '0.3rem' } },
                  h('button', { type: 'button', className: 'portal-btn is-small is-ghost', onClick: function () { setAbForm({ ability: ab }); } }, 'Edit'),
                  h('button', { type: 'button', className: 'portal-btn is-small is-danger', onClick: function () { deleteAbility(ab); } }, '✕'))),
              (ab.modifiers || []).map(function (mod) {
                return h('div', { key: mod.id, style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0.5rem', background: 'var(--bg-card-light)', border: '1px solid var(--border-color)', borderRadius: '0.35rem', marginTop: '0.3rem' } },
                  h('span', { style: { fontSize: '0.8rem' } }, (mod.label ? mod.label + ' — ' : '') + modifierSummary(mod, props.catalogue)),
                  h('span', { style: { display: 'flex', gap: '0.3rem', flexShrink: 0 } },
                    h('button', { type: 'button', className: 'portal-btn is-small is-ghost', style: { padding: '0.12rem 0.4rem', fontSize: '0.72rem' }, onClick: function () { setModForm({ abilityId: ab.id, modifier: mod }); } }, 'Edit'),
                    h('button', { type: 'button', className: 'portal-btn is-small is-danger', style: { padding: '0.12rem 0.4rem', fontSize: '0.72rem' }, onClick: function () { deleteModifier(mod); } }, '✕')));
              }),
              (modForm && modForm.abilityId === ab.id)
                ? h(ModifierForm, { initial: modForm.modifier, catalogue: props.catalogue, onSubmit: submitModifier, onCancel: function () { setModForm(null); } })
                : h('button', { type: 'button', className: 'portal-btn is-small is-ghost', style: { marginTop: '0.3rem', padding: '0.12rem 0.4rem', fontSize: '0.72rem' }, onClick: function () { setModForm({ abilityId: ab.id, modifier: null }); } }, '+ Add modifier'));
          }))
      ));
  }

  // ── Item form ─────────────────────────────────────────────────────────────
  function ItemForm(props) {
    var it = props.initial || {};
    var nameState = useState(it.name || ''); var name = nameState[0], setName = nameState[1];
    var descState = useState(it.description || ''); var desc = descState[0], setDesc = descState[1];
    var imageState = useState(it.image_url || ''); var image = imageState[0], setImage = imageState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];

    async function submit(e) {
      e.preventDefault();
      if (!name.trim()) { setErr('Name is required.'); return; }
      try {
        await props.onSubmit({ name: name.trim(), description: desc.trim() || null, image_url: image.trim() || null });
      } catch (e2) { setErr(e2.message || 'Failed to save.'); }
    }

    return h('form', { onSubmit: submit, className: props.inModal ? '' : 'portal-card', style: props.inModal ? {} : { marginBottom: '1rem' } },
      props.inModal ? null : h('h3', { style: { marginTop: 0 } }, props.initial ? 'Edit item' : 'New item'),
      err ? h('div', { className: 'portal-flash error' }, err) : null,
      h('div', { className: 'portal-field' }, h('label', null, 'Name *'),
        h('input', { type: 'text', value: name, onChange: function (e) { setName(e.target.value); } })),
      h('div', { className: 'portal-field' }, h('label', null, 'Flavor / description (shown to the player)'),
        h('textarea', { rows: 3, value: desc, onChange: function (e) { setDesc(e.target.value); } })),
      (window.PVAdminQuestUtils && PVAdminQuestUtils.ImageField)
        ? h(PVAdminQuestUtils.ImageField, {
            value: image,
            onChange: function (v) { setImage(v); },
            uploadPath: '/venues/images',
            extraFields: { venue_name: name.trim() || 'item' },
            resize: { square: true, maxSize: 600 },
            help: 'Paste a URL or upload an image. Uploads are square-cropped to 600×600. Shown on the roll calculator and My Items.'
          })
        : h('div', { className: 'portal-field' }, h('label', null, 'Image URL'),
            h('input', { type: 'text', value: image, placeholder: 'https://…', onChange: function (e) { setImage(e.target.value); } })),
      h('p', { className: 'portal-field-help', style: { margin: '0 0 0.5rem' } },
        'All modifiers live on the item’s abilities (passive or activated). Add them after creating the item.'),
      h('div', { style: { display: 'flex', gap: '0.5rem', marginTop: '0.5rem' } },
        h('button', { type: 'submit', className: 'portal-btn' }, props.initial ? 'Save item' : 'Create item'),
        h('button', { type: 'button', className: 'portal-btn is-ghost', onClick: props.onCancel }, 'Cancel')
      )
    );
  }

  // ── Main component ────────────────────────────────────────────────────────
  function PVAdminRpRolls(props) {
    var roles = (props.session && props.session.roles) || [];
    var isAdmin = roles.indexOf('admin') !== -1;

    var tabState = useState('campaigns'); var tab = tabState[0], setTab = tabState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];
    var flash = flashHook();

    // campaigns
    var campaignsState = useState([]); var campaigns = campaignsState[0], setCampaigns = campaignsState[1];
    var selectedState = useState(null); var selected = selectedState[0], setSelected = selectedState[1]; // campaign object
    var rosterState = useState([]); var roster = rosterState[0], setRoster = rosterState[1];
    var newNameState = useState(''); var newName = newNameState[0], setNewName = newNameState[1];
    var showNewState = useState(false); var showNew = showNewState[0], setShowNew = showNewState[1];
    var newErrState = useState(''); var newErr = newErrState[0], setNewErr = newErrState[1];

    // member picker
    var membersState = useState(null); var members = membersState[0], setMembers = membersState[1];
    var pickMemberState = useState(''); var pickMember = pickMemberState[0], setPickMember = pickMemberState[1];
    var pickRoleState = useState('dps'); var pickRole = pickRoleState[0], setPickRole = pickRoleState[1];
    var pickArmorState = useState('medium'); var pickArmor = pickArmorState[0], setPickArmor = pickArmorState[1];
    var defaultsState = useState({}); var defaults = defaultsState[0], setDefaults = defaultsState[1]; // member_id -> {class_role, armor_type, max_hp}

    // items
    var itemsState = useState([]); var items = itemsState[0], setItems = itemsState[1];
    var itemFormState = useState(null); var itemForm = itemFormState[0], setItemForm = itemFormState[1]; // new-item form only
    var editItemState = useState(null); var editItem = editItemState[0], setEditItem = editItemState[1]; // item open in the editor modal
    var itemQueryState = useState(''); var itemQuery = itemQueryState[0], setItemQuery = itemQueryState[1];

    // boss library + per-campaign staged bosses
    var bossLibState = useState([]); var bossLib = bossLibState[0], setBossLib = bossLibState[1];
    var bossFormState = useState(false); var bossForm = bossFormState[0], setBossForm = bossFormState[1]; // new-boss form open
    var editBossState = useState(null); var editBoss = editBossState[0], setEditBoss = editBossState[1]; // boss open in the editor modal
    var bossQueryState = useState(''); var bossQuery = bossQueryState[0], setBossQuery = bossQueryState[1];
    var campBossesState = useState(null); var campBosses = campBossesState[0], setCampBosses = campBossesState[1]; // instances in the selected campaign
    var campBossPickState = useState(''); var campBossPick = campBossPickState[0], setCampBossPick = campBossPickState[1];
    var bossesSupportedState = useState(true); var bossesSupported = bossesSupportedState[0], setBossesSupported = bossesSupportedState[1];

    // member_id -> profile portrait, so roster cards can show a face when the
    // member has published/drafted a roster profile with an image.
    var profileImgState = useState({}); var profileImages = profileImgState[0], setProfileImages = profileImgState[1];

    // Per-campaign disabled item ids (Set-like map). Loaded when a campaign is
    // opened for management; drives the "Campaign items" toggle panel.
    var disabledItemsState = useState(null); var disabledItems = disabledItemsState[0], setDisabledItems = disabledItemsState[1];
    var disabledSupportedState = useState(true); var disabledSupported = disabledSupportedState[0], setDisabledSupported = disabledSupportedState[1];
    var itemsAdvancedState = useState(false); var itemsAdvanced = itemsAdvancedState[0], setItemsAdvanced = itemsAdvancedState[1]; // per-item list expanded

    async function loadCampaigns() {
      try { setCampaigns(await PVRollAPI.request('GET', '/rp/campaigns') || []); }
      catch (e) { setErr(e.message); }
    }
    async function loadItems() {
      try { setItems(await PVRollAPI.request('GET', '/rp/items') || []); }
      catch (e) { setErr(e.message); }
    }
    async function loadRoster(cid) {
      try { setRoster(await PVRollAPI.request('GET', '/rp/campaigns/' + cid + '/characters') || []); }
      catch (e) { setErr(e.message); }
    }
    async function loadDefaults() {
      try {
        var rows = await PVRollAPI.request('GET', '/rp/member-defaults') || [];
        var map = {}; rows.forEach(function (r) { map[r.member_id] = r; }); setDefaults(map);
      } catch (e) { /* non-fatal */ }
    }
    // Officer/admin-only endpoint; non-fatal if it 401s — roster just shows the
    // fallback tiles instead of portraits.
    async function loadProfileImages() {
      try {
        var rows = await PVAdminAPI.request('GET', '/member-profiles/admin', undefined, true) || [];
        var map = {}; rows.forEach(function (r) { if (r && r.image_url) map[r.member_id] = r.image_url; });
        setProfileImages(map);
      } catch (e) { /* no portraits */ }
    }
    // Boss library — 404 means the worker predates v9.5; hide boss UI quietly.
    async function loadBossLib() {
      try { var rows = await PVRollAPI.request('GET', '/rp/boss-library') || []; setBossLib(rows); setBossesSupported(true); return rows; }
      catch (e) { if (e.status === 404) setBossesSupported(false); setBossLib([]); return []; }
    }
    async function loadCampBosses(cid) {
      setCampBosses(null);
      try { setCampBosses(await PVRollAPI.request('GET', '/rp/campaigns/' + cid + '/bosses') || []); }
      catch (e) { setCampBosses([]); }
    }
    useEffect(function () { loadCampaigns(); loadItems(); loadDefaults(); loadProfileImages(); loadBossLib(); /* eslint-disable-next-line */ }, []);

    // When a member is chosen to add, swap class/armor to their saved defaults
    // (or back to neutral when they have none) so the controls always reflect
    // the picked member.
    function onPickMember(id) {
      setPickMember(id);
      var def = defaults[id] || defaults[Number(id)];
      setPickRole(def && def.class_role ? def.class_role : 'dps');
      setPickArmor(def && def.armor_type ? def.armor_type : 'medium');
    }

    // Per-campaign disabled items. GET returns an array of item ids. If the
    // worker doesn't have the endpoint yet we hide the panel instead of erroring.
    async function loadDisabledItems(cid) {
      setDisabledItems(null);
      try {
        var rows = await PVRollAPI.request('GET', '/rp/campaigns/' + cid + '/disabled-items') || [];
        var map = {}; rows.forEach(function (id) { map[id] = true; });
        setDisabledItems(map); setDisabledSupported(true);
      } catch (e) {
        if (e.status === 404) { setDisabledSupported(false); setDisabledItems({}); }
        else { setDisabledItems({}); }
      }
    }
    async function toggleItemDisabled(itemId, disabled) {
      var next = Object.assign({}, disabledItems || {});
      if (disabled) next[itemId] = true; else delete next[itemId];
      setDisabledItems(next); // optimistic
      try { await PVRollAPI.request('POST', '/rp/campaigns/' + selected.id + '/disabled-items', { item_id: itemId, disabled: disabled }); }
      catch (e) { setErr(e.message); loadDisabledItems(selected.id); }
    }
    // Items actually pulled into this campaign = catalogue items owned by a member
    // on the roster (adding a member auto-equips their owned items). We only expose
    // these in the toggle panel — unassigned catalogue items aren't in play here.
    function campaignItemList() {
      var ids = {}; roster.forEach(function (r) { ids[Number(r.member_id)] = true; });
      return (items || []).filter(function (it) { return it.assigned_member_id != null && ids[Number(it.assigned_member_id)]; });
    }
    async function setAllItemsDisabled(disabled) {
      var camp = campaignItemList();
      var next = Object.assign({}, disabledItems || {});
      var reqs = [];
      camp.forEach(function (it) {
        var off = !!next[it.id];
        if (off === disabled) return; // already in the desired state
        if (disabled) next[it.id] = true; else delete next[it.id];
        reqs.push(PVRollAPI.request('POST', '/rp/campaigns/' + selected.id + '/disabled-items', { item_id: it.id, disabled: disabled }));
      });
      if (!reqs.length) return;
      setDisabledItems(next); // optimistic
      try { await Promise.all(reqs); } catch (e) { setErr(e.message); loadDisabledItems(selected.id); }
    }

    function selectCampaign(c) {
      setSelected(c); setRoster([]); loadRoster(c.id); loadDefaults(); loadDisabledItems(c.id);
      if (bossesSupported) loadCampBosses(c.id);
      if (members === null) {
        PVAdminAPI.request('GET', '/members', undefined, true)
          .then(function (rows) { setMembers(rows || []); })
          .catch(function (e) { setErr('Could not load FC members: ' + e.message); });
      }
    }

    async function createCampaign() {
      if (!newName.trim()) { setNewErr('Enter a campaign name.'); return; }
      try {
        await PVRollAPI.request('POST', '/rp/campaigns', { name: newName.trim() });
        setNewName(''); setNewErr(''); setShowNew(false); flash[1]('Campaign created.'); await loadCampaigns();
      } catch (e) { setNewErr(e.message); }
    }
    async function startSession(c) {
      try { await PVRollAPI.request('POST', '/rp/campaigns/' + c.id + '/session/start'); flash[1]('Session started.'); await loadCampaigns(); if (selected && selected.id === c.id) await loadRoster(c.id); }
      catch (e) { setErr(e.message); }
    }
    async function endSession(c) {
      if (!confirm('End the live session for “' + c.name + '”? Buffs and shields clear.')) return;
      try { await PVRollAPI.request('POST', '/rp/campaigns/' + c.id + '/session/end'); flash[1]('Session ended.'); await loadCampaigns(); }
      catch (e) { setErr(e.message); }
    }
    async function pauseSession(c) {
      try { await PVRollAPI.request('POST', '/rp/campaigns/' + c.id + '/session/pause'); flash[1]('Session paused — values kept.'); await loadCampaigns(); }
      catch (e) { setErr(e.message); }
    }
    async function resumeSession(c) {
      try { await PVRollAPI.request('POST', '/rp/campaigns/' + c.id + '/session/resume'); flash[1]('Session resumed.'); await loadCampaigns(); if (selected && selected.id === c.id) await loadRoster(c.id); }
      catch (e) { setErr(e.message); }
    }
    async function deleteCampaign(c) {
      if (!confirm('Delete campaign “' + c.name + '” and all its characters? This cannot be undone.')) return;
      try { await PVRollAPI.request('DELETE', '/rp/campaigns/' + c.id); if (selected && selected.id === c.id) setSelected(null); await loadCampaigns(); }
      catch (e) { setErr(e.message); }
    }

    async function addCharacter() {
      if (!pickMember) return;
      var m = (members || []).filter(function (x) { return String(x.id) === String(pickMember); })[0];
      try {
        await PVRollAPI.request('POST', '/rp/campaigns/' + selected.id + '/characters',
          { member_id: Number(pickMember), member_name: m ? m.name : undefined, class_role: pickRole, armor_type: pickArmor });
        setPickMember(''); await loadRoster(selected.id); await loadDefaults();
      } catch (e) { setErr(e.message); }
    }
    async function saveCharacter(memberId, body) {
      await PVRollAPI.request('PATCH', '/rp/campaigns/' + selected.id + '/characters/' + memberId, body);
      await loadDefaults();
      await loadRoster(selected.id); flash[1]('Saved.');
    }
    async function removeCharacter(ch) {
      if (!confirm('Remove ' + ch.member_name + ' from this campaign?')) return;
      try { await PVRollAPI.request('DELETE', '/rp/campaigns/' + selected.id + '/characters/' + ch.member_id); await loadRoster(selected.id); }
      catch (e) { setErr(e.message); }
    }

    async function submitItem(payload) {
      if (itemForm && itemForm.item) await PVRollAPI.request('PATCH', '/rp/items/' + itemForm.item.id, payload);
      else await PVRollAPI.request('POST', '/rp/items', payload);
      setItemForm(null); await loadItems();
    }
    async function deleteItem(it) {
      if (!confirm('Delete item “' + it.name + '” and its abilities?')) return;
      try { await PVRollAPI.request('DELETE', '/rp/items/' + it.id); await loadItems(); }
      catch (e) { setErr(e.message); }
    }
    async function createBoss(payload) {
      await PVRollAPI.request('POST', '/rp/boss-library', payload);
      setBossForm(false); await loadBossLib();
    }
    async function deleteBoss(b) {
      if (!confirm('Delete boss “' + b.name + '” and its skills? Bosses already on a battlefield keep their snapshot.')) return;
      try { await PVRollAPI.request('DELETE', '/rp/boss-library/' + b.id); await loadBossLib(); }
      catch (e) { setErr(e.message); }
    }
    // Keep the open editor modal in sync after ability edits reload the library.
    async function refreshBossLib() {
      var rows = await loadBossLib();
      setEditBoss(function (cur) { if (!cur) return cur; var nb = rows.filter(function (x) { return x.id === cur.id; })[0]; return nb || cur; });
    }
    async function addCampBoss() {
      if (!campBossPick || !selected) return;
      try { await PVRollAPI.request('POST', '/rp/campaigns/' + selected.id + '/bosses', { boss_id: campBossPick }); setCampBossPick(''); await loadCampBosses(selected.id); }
      catch (e) { setErr(e.message); }
    }
    async function removeCampBoss(b) {
      if (!confirm('Remove ' + b.name + ' from this campaign?')) return;
      try { await PVRollAPI.request('DELETE', '/rp/campaigns/' + selected.id + '/bosses/' + b.id); await loadCampBosses(selected.id); }
      catch (e) { setErr(e.message); }
    }
    async function toggleBossHp(b) {
      try { await PVRollAPI.request('PATCH', '/rp/campaigns/' + selected.id + '/bosses/' + b.id, { hp_visible: !b.hp_visible }); await loadCampBosses(selected.id); }
      catch (e) { setErr(e.message); }
    }
    async function setDmFor(c, memberId) {
      try { await PVRollAPI.request('PATCH', '/rp/campaigns/' + c.id, { dm_member_id: memberId === '' ? null : Number(memberId) }); flash[1]('DM updated.'); await loadCampaigns(); }
      catch (e) { setErr(e.message); }
    }

    // available members = roster-eligible not already in this campaign
    var inCampaign = {}; roster.forEach(function (r) { inCampaign[r.member_id] = true; });
    var availableMembers = (members || []).filter(function (m) { return !inCampaign[m.id]; });

    return h('div', null,
      h(window.PVAdminSubnav, {
        tabs: [{ id: 'campaigns', label: 'Campaigns & Sessions' }]
          .concat(isAdmin ? [{ id: 'items', label: 'Item Catalogue' }] : [])
          .concat(bossesSupported ? [{ id: 'bosses', label: 'Boss Library' }] : [])
          .concat(isAdmin && bossesSupported ? [{ id: 'rules', label: 'System Rules' }] : []),
        active: tab,
        onChange: setTab
      }),
      flash[0] ? h('div', { className: 'portal-flash success' }, flash[0]) : null,
      err ? h('div', { className: 'portal-flash error' }, err) : null,

      tab === 'campaigns' ? h('div', null,
        showNew
          ? h('form', { className: 'portal-card', style: { marginBottom: '1rem' },
              onSubmit: function (e) { e.preventDefault(); createCampaign(); } },
              h('h3', { style: { marginTop: 0 } }, 'New campaign'),
              newErr ? h('div', { className: 'portal-flash error' }, newErr) : null,
              h('div', { className: 'portal-field' },
                h('label', null, 'Campaign name *'),
                h('input', { type: 'text', autoFocus: true, value: newName,
                  placeholder: 'e.g. Symphony of the Eclipse',
                  onChange: function (e) { setNewName(e.target.value); } })),
              h('div', { style: { display: 'flex', gap: '0.5rem', marginTop: '0.5rem' } },
                h('button', { type: 'submit', className: 'portal-btn' }, 'Create campaign'),
                h('button', { type: 'button', className: 'portal-btn is-ghost',
                  onClick: function () { setShowNew(false); setNewErr(''); } }, 'Cancel'))
            )
          : h('button', { type: 'button', className: 'portal-btn', style: { marginBottom: '1rem' },
              onClick: function () { setNewName(''); setNewErr(''); setShowNew(true); } }, '+ New campaign'),
        !campaigns.length ? h('div', { className: 'portal-card' }, 'No campaigns yet.') :
          campaigns.map(function (c) {
            var isSel = selected && selected.id === c.id;
            return h('div', { key: c.id, className: 'portal-card', style: { marginBottom: '0.6rem' } },
              h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' } },
                h('div', null,
                  h('strong', null, c.name),
                  c.active ? h('span', { style: { marginLeft: '0.5rem', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#fff', background: 'var(--accent-red)', borderRadius: '0.3rem', padding: '0.1rem 0.4rem' } }, 'Live') : null,
                  c.paused ? h('span', { style: { marginLeft: '0.5rem', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-primary)', border: '1px solid var(--accent-gold)', borderRadius: '0.3rem', padding: '0.1rem 0.4rem' } }, 'Paused') : null
                ),
                h('div', { style: { display: 'flex', gap: '0.35rem', flexWrap: 'wrap' } },
                  // Lifecycle: fresh → Start; live → Pause + End; paused → Resume + End.
                  c.active ? h('button', { type: 'button', className: 'portal-btn is-small is-ghost', onClick: function () { pauseSession(c); } }, 'Pause session') : null,
                  c.paused ? h('button', { type: 'button', className: 'portal-btn is-small', onClick: function () { resumeSession(c); } }, 'Resume session') : null,
                  (c.active || c.paused) ? h('button', { type: 'button', className: 'portal-btn is-small is-danger', onClick: function () { endSession(c); } }, 'End session') : null,
                  (!c.active && !c.paused) ? h('button', { type: 'button', className: 'portal-btn is-small', onClick: function () { startSession(c); } }, 'Start session') : null,
                  c.active
                    ? h('a', { className: 'portal-btn is-small is-ghost', href: '/pv/tools/roll-calculator.html' }, 'Public rolls page')
                    : null,
                  h('button', { type: 'button', className: 'portal-btn is-small is-ghost', onClick: function () { isSel ? setSelected(null) : selectCampaign(c); } }, isSel ? 'Close' : 'Manage'),
                  isAdmin ? h('button', { type: 'button', className: 'portal-btn is-small is-danger', onClick: function () { deleteCampaign(c); } }, 'Delete') : null
                )
              ),

              isSel ? h('div', { style: { marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' } },
                h('div', { className: 'portal-card', style: { background: 'var(--bg-card-light)', marginBottom: '0.5rem' } },
                  h('div', { className: 'portal-field' }, h('label', null, 'Dungeon Master'),
                    members === null ? h('p', { style: { margin: 0, color: 'var(--text-secondary)' } }, 'Loading members…') :
                      h('select', { value: c.dm_member_id != null ? String(c.dm_member_id) : '', onChange: function (e) { setDmFor(c, e.target.value); } },
                        h('option', { value: '' }, '— none —'),
                        (members || []).map(function (m) { return h('option', { key: m.id, value: m.id }, m.name); }))),
                  h('p', { className: 'portal-field-help', style: { margin: '0.25rem 0 0' } }, 'Controls turns and the active-effects panel. May also be a rostered character.')),

                // Add a member — kept at the top of the panel, right under the DM.
                h('div', { className: 'portal-card', style: { background: 'var(--bg-card-light)', marginBottom: '0.5rem' } },
                  h('p', { style: { margin: '0 0 0.5rem', fontWeight: 600 } }, 'Add a member'),
                  members === null ? h('p', null, 'Loading members…') :
                    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(8rem, 1fr))', gap: '0.5rem', alignItems: 'end' } },
                      h('div', { className: 'portal-field' }, h('label', null, 'Member'),
                        h('select', { value: pickMember, onChange: function (e) { onPickMember(e.target.value); } },
                          h('option', { value: '' }, '— choose —'),
                          availableMembers.map(function (m) { return h('option', { key: m.id, value: m.id }, m.name); }))),
                      h('div', { className: 'portal-field' }, h('label', null, 'Class'),
                        h('select', { value: pickRole, onChange: function (e) { setPickRole(e.target.value); } },
                          CLASS_ROLES.map(function (o) { return h('option', { key: o.value, value: o.value }, o.label); }))),
                      h('div', { className: 'portal-field' }, h('label', null, 'Armor'),
                        h('select', { value: pickArmor, onChange: function (e) { setPickArmor(e.target.value); } },
                          ARMOR_TYPES.map(function (o) { return h('option', { key: o.value, value: o.value }, o.label); }))),
                      h('div', { className: 'portal-field' },
                        h('label', { style: { visibility: 'hidden' } }, 'Add'),
                        h('button', { type: 'button', className: 'portal-btn', style: { width: '100%' }, onClick: addCharacter }, 'Add'))
                    )
                ),

                // Campaign items — turn items off for this campaign (options + passives).
                // Only items pulled into the campaign appear; collapsed to a master
                // on/off by default, with an Advanced view for per-item control.
                (function () {
                  if (!disabledSupported) return null;
                  var camp = campaignItemList();
                  if (!camp.length) return null;
                  var loading = disabledItems === null;
                  var offCount = loading ? 0 : camp.filter(function (it) { return !!disabledItems[it.id]; }).length;
                  var onCount = camp.length - offCount;
                  return h('div', { className: 'portal-card', style: { background: 'var(--bg-card-light)', marginBottom: '0.5rem' } },
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' } },
                      h('p', { style: { margin: 0, fontWeight: 600, flex: '1 1 auto' } }, 'Campaign items'),
                      h('span', { style: { color: 'var(--text-secondary)', fontSize: '0.82rem' } },
                        loading ? 'Loading…' : (onCount + ' on · ' + offCount + ' off')),
                      h('button', { type: 'button', className: 'portal-btn is-small', disabled: loading || offCount === 0,
                        onClick: function () { setAllItemsDisabled(false); } }, 'All on'),
                      h('button', { type: 'button', className: 'portal-btn is-small is-ghost', disabled: loading || onCount === 0,
                        onClick: function () { setAllItemsDisabled(true); } }, 'All off'),
                      h('button', { type: 'button', className: 'portal-btn is-small is-ghost',
                        onClick: function () { setItemsAdvanced(!itemsAdvanced); } }, (itemsAdvanced ? '▾ ' : '▸ ') + 'Advanced')),
                    itemsAdvanced ? h('div', { style: { marginTop: '0.6rem', paddingTop: '0.6rem', borderTop: '1px solid var(--border-color)' } },
                      h('p', { className: 'portal-field-help', style: { margin: '0 0 0.6rem' } },
                        'Turn an item Off to drop its roll options and passives from this campaign’s calculator. It stays assigned to whoever holds it.'),
                      loading
                        ? h('p', { style: { margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' } }, 'Loading…')
                        : h('div', { className: 'rp-item-toggle-grid' },
                            camp.map(function (it) {
                              var off = !!disabledItems[it.id];
                              return h('div', { key: it.id, className: 'rp-item-toggle' + (off ? ' is-off' : '') },
                                h('span', { className: 'rp-item-toggle-name', title: it.name }, it.name),
                                h('button', { type: 'button', className: 'portal-btn is-small' + (off ? ' is-ghost' : ''),
                                  onClick: function () { toggleItemDisabled(it.id, !off); } }, off ? 'Off' : 'On'));
                            }))) : null);
                })(),

                // Bosses staged for this campaign. The DM manages HP/visibility and
                // fires skills live from the calculator; this is pre-session setup.
                bossesSupported ? h('div', { className: 'portal-card', style: { background: 'var(--bg-card-light)', marginBottom: '0.5rem' } },
                  h('p', { style: { margin: '0 0 0.5rem', fontWeight: 600 } }, 'Bosses'),
                  campBosses === null ? h('p', { style: { margin: 0, color: 'var(--text-secondary)' } }, 'Loading…') :
                    (!campBosses.length ? h('p', { style: { margin: '0 0 0.4rem', color: 'var(--text-secondary)', fontSize: '0.85rem' } }, 'No bosses staged for this campaign.') :
                      campBosses.map(function (b) {
                        return h('div', { key: b.id, style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0' } },
                          h('span', null, b.name + ' · ' + b.current_hp + '/' + b.max_hp + ' HP' + (b.defeated ? ' · defeated' : '') + (b.hp_visible ? '' : ' · HP hidden')),
                          h('div', { style: { display: 'flex', gap: '0.35rem', flexShrink: 0 } },
                            h('button', { type: 'button', className: 'portal-btn is-small is-ghost', onClick: function () { toggleBossHp(b); } }, b.hp_visible ? 'Hide HP' : 'Show HP'),
                            h('button', { type: 'button', className: 'portal-btn is-small is-danger', onClick: function () { removeCampBoss(b); } }, 'Remove')));
                      })),
                  h('div', { style: { display: 'flex', gap: '0.5rem', marginTop: '0.4rem', flexWrap: 'wrap' } },
                    h('select', { value: campBossPick, style: { flex: '1 1 12rem' }, onChange: function (e) { setCampBossPick(e.target.value); } },
                      h('option', { value: '' }, bossLib.length ? '— add a boss from the library —' : 'No bosses in the library yet'),
                      bossLib.map(function (b) { return h('option', { key: b.id, value: b.id }, b.name + ' (' + b.max_hp + ' HP)'); })),
                    h('button', { type: 'button', className: 'portal-btn is-small', disabled: !campBossPick, onClick: addCampBoss }, 'Add')),
                  h('p', { className: 'portal-field-help', style: { margin: '0.35rem 0 0' } }, 'HP resets to max on session start. The same library boss can be added more than once for multi-enemy fights.')) : null,

                h('p', { style: { margin: '0 0 0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' } }, 'Roster'),
                h('div', { className: 'rp-roster-grid' },
                  roster.map(function (ch) {
                    return h(RosterRow, { key: ch.member_id, character: ch, canEquip: isAdmin,
                      campaignId: selected.id, catalogue: items, onItemsChanged: loadItems,
                      onSave: saveCharacter, onRemove: removeCharacter,
                      imageUrl: profileImages[ch.member_id] || profileImages[Number(ch.member_id)] || profileImages[String(ch.member_id)] });
                  }))
              ) : null
            );
          })
      ) : null,

      tab === 'items' && isAdmin ? h('div', null,
        itemForm ? h(ItemForm, { initial: itemForm.item, onSubmit: submitItem, onCancel: function () { setItemForm(null); } }) : null,
        h('div', { className: 'rp-catalogue-toolbar' },
          h('input', { type: 'search', className: 'portal-search', value: itemQuery,
            placeholder: 'Search items by name…',
            onChange: function (e) { setItemQuery(e.target.value); } }),
          itemForm ? null : h('button', { type: 'button', className: 'portal-btn',
            onClick: function () { setItemForm({}); } }, '+ New item')),
        (function () {
          if (!items.length) return h('div', { className: 'portal-card' }, 'No items yet.');
          var q = itemQuery.trim().toLowerCase();
          var shown = q ? items.filter(function (it) {
            return (it.name || '').toLowerCase().indexOf(q) !== -1;
          }) : items;
          if (!shown.length) return h('div', { className: 'portal-card' }, 'No items match that search.');
          return h('div', { className: 'rp-catalogue-grid' },
            shown.map(function (it) {
              return h(ItemCard, { key: it.id, item: it, onEdit: function (x) { setEditItem(x); }, onDelete: deleteItem });
            }));
        })(),
        editItem ? h(ItemEditorModal, { item: editItem, catalogue: items,
          onChanged: loadItems, onClose: function () { setEditItem(null); } }) : null
      ) : null,

      tab === 'bosses' && bossesSupported ? h('div', null,
        bossForm ? h(BossForm, { onSubmit: createBoss, onCancel: function () { setBossForm(false); } }) : null,
        h('div', { className: 'rp-catalogue-toolbar' },
          h('input', { type: 'search', className: 'portal-search', value: bossQuery,
            placeholder: 'Search bosses by name…',
            onChange: function (e) { setBossQuery(e.target.value); } }),
          bossForm ? null : h('button', { type: 'button', className: 'portal-btn',
            onClick: function () { setBossForm(true); } }, '+ New boss')),
        (function () {
          if (!bossLib.length) return h('div', { className: 'portal-card' }, 'No bosses yet. Create one, give it skills, and the DM can field it in any campaign.');
          var q = bossQuery.trim().toLowerCase();
          var shown = q ? bossLib.filter(function (b) { return (b.name || '').toLowerCase().indexOf(q) !== -1; }) : bossLib;
          if (!shown.length) return h('div', { className: 'portal-card' }, 'No bosses match that search.');
          return h('div', { className: 'rp-catalogue-grid' },
            shown.map(function (b) {
              return h(BossCard, { key: b.id, boss: b, onEdit: function (x) { setEditBoss(x); }, onDelete: deleteBoss });
            }));
        })(),
        editBoss ? h(BossEditorModal, { boss: editBoss,
          onChanged: refreshBossLib, onClose: function () { setEditBoss(null); } }) : null
      ) : null,

      tab === 'rules' && isAdmin ? h(RulesEditor, { anyLive: campaigns.some(function (c) { return c.active; }) }) : null
    );
  }

  window.PVAdminRpRolls = PVAdminRpRolls;
})();
