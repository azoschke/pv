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
        'HP ' + ch.current_hp + '/' + ch.max_hp + (ch.shield_value ? ' · shield ' + ch.shield_value : '') + (ch.eliminated ? ' · eliminated' : '')),
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

    // member_id -> profile portrait, so roster cards can show a face when the
    // member has published/drafted a roster profile with an image.
    var profileImgState = useState({}); var profileImages = profileImgState[0], setProfileImages = profileImgState[1];

    // Per-campaign disabled item ids (Set-like map). Loaded when a campaign is
    // opened for management; drives the "Campaign items" toggle panel.
    var disabledItemsState = useState(null); var disabledItems = disabledItemsState[0], setDisabledItems = disabledItemsState[1];
    var disabledSupportedState = useState(true); var disabledSupported = disabledSupportedState[0], setDisabledSupported = disabledSupportedState[1];

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
    useEffect(function () { loadCampaigns(); loadItems(); loadDefaults(); loadProfileImages(); /* eslint-disable-next-line */ }, []);

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

    function selectCampaign(c) {
      setSelected(c); setRoster([]); loadRoster(c.id); loadDefaults(); loadDisabledItems(c.id);
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
    async function setDmFor(c, memberId) {
      try { await PVRollAPI.request('PATCH', '/rp/campaigns/' + c.id, { dm_member_id: memberId === '' ? null : Number(memberId) }); flash[1]('DM updated.'); await loadCampaigns(); }
      catch (e) { setErr(e.message); }
    }

    // available members = roster-eligible not already in this campaign
    var inCampaign = {}; roster.forEach(function (r) { inCampaign[r.member_id] = true; });
    var availableMembers = (members || []).filter(function (m) { return !inCampaign[m.id]; });

    return h('div', null,
      h(window.PVAdminSubnav, {
        tabs: isAdmin
          ? [{ id: 'campaigns', label: 'Campaigns & Sessions' }, { id: 'items', label: 'Item Catalogue' }]
          : [{ id: 'campaigns', label: 'Campaigns & Sessions' }],
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
                (disabledSupported && items.length) ? h('div', { className: 'portal-card', style: { background: 'var(--bg-card-light)', marginBottom: '0.5rem' } },
                  h('p', { style: { margin: '0 0 0.35rem', fontWeight: 600 } }, 'Campaign items'),
                  h('p', { className: 'portal-field-help', style: { margin: '0 0 0.6rem' } },
                    'Turn an item Off to drop its roll options and passives from this campaign’s calculator. It stays assigned to whoever holds it.'),
                  disabledItems === null
                    ? h('p', { style: { margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' } }, 'Loading…')
                    : h('div', { className: 'rp-item-toggle-grid' },
                        items.map(function (it) {
                          var off = !!disabledItems[it.id];
                          return h('div', { key: it.id, className: 'rp-item-toggle' + (off ? ' is-off' : '') },
                            h('span', { className: 'rp-item-toggle-name', title: it.name }, it.name),
                            h('button', { type: 'button', className: 'portal-btn is-small' + (off ? ' is-ghost' : ''),
                              onClick: function () { toggleItemDisabled(it.id, !off); } }, off ? 'Off' : 'On'));
                        }))
                ) : null,

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
      ) : null
    );
  }

  window.PVAdminRpRolls = PVAdminRpRolls;
})();
