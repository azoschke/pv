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
  // Abilities (passive or activated) carry every modifier. 'shield' grants a
  // shield (auto-pushed only for activated group abilities); 'none' is pure
  // descriptive/narrative text the player applies manually.
  var ABILITY_MOD_TYPES = ['attack_roll', 'defense_roll', 'heal_roll', 'attack_output', 'heal_output', 'shield', 'none'];

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

    var dirty = role !== ch.class_role || armor !== ch.armor_type || String(ch.max_hp) !== maxHp;

    async function save() {
      setSaving(true);
      try {
        await props.onSave(ch.member_id, { class_role: role, armor_type: armor, max_hp: parseInt(maxHp, 10) || ch.max_hp });
      } finally { setSaving(false); }
    }

    return h('div', { className: 'portal-card', style: { marginBottom: '0.6rem' } },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' } },
        h('strong', null, ch.member_name),
        h('span', { style: { color: 'var(--text-secondary)', fontSize: '0.85rem' } },
          'HP ' + ch.current_hp + '/' + ch.max_hp + (ch.shield_value ? ' · shield ' + ch.shield_value : '') + (ch.eliminated ? ' · eliminated' : ''))
      ),
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
      h('div', { style: { display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' } },
        h('button', { type: 'button', className: 'portal-btn is-small', disabled: !dirty || saving, onClick: save },
          saving ? 'Saving…' : 'Save'),
        props.canEquip ? h('button', { type: 'button', className: 'portal-btn is-small is-ghost',
          onClick: function () { props.onManageItems(ch); } }, 'Items') : null,
        h('button', { type: 'button', className: 'portal-btn is-small is-danger',
          onClick: function () { props.onRemove(ch); } }, 'Remove')
      )
    );
  }

  // ── Item equip modal ──────────────────────────────────────────────────────
  function EquipModal(props) {
    var ch = props.character;
    var items = props.items;          // full catalogue
    var equippedState = useState(null); var equipped = equippedState[0], setEquipped = equippedState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];

    async function load() {
      try {
        var rows = await PVRollAPI.request('GET',
          '/rp/campaigns/' + props.campaignId + '/characters/' + ch.member_id + '/items');
        var map = {}; (rows || []).forEach(function (r) { map[r.item_id] = !!r.equipped; });
        setEquipped(map);
      } catch (e) { setErr(e.message); }
    }
    useEffect(function () { load(); /* eslint-disable-next-line */ }, []);

    async function toggle(item, on) {
      setErr('');
      try {
        if (on) {
          await PVRollAPI.request('POST', '/rp/campaigns/' + props.campaignId + '/characters/' + ch.member_id + '/items',
            { item_id: item.id, equipped: true });
        } else {
          await PVRollAPI.request('DELETE', '/rp/campaigns/' + props.campaignId + '/characters/' + ch.member_id + '/items/' + item.id);
        }
        var next = Object.assign({}, equipped); next[item.id] = on; setEquipped(next);
      } catch (e) { setErr(e.message); }
    }

    return h(PVAdminModal, { title: 'Items — ' + ch.member_name, onClose: props.onClose },
      err ? h('div', { className: 'portal-flash error' }, err) : null,
      equipped === null ? h('p', null, 'Loading…') :
        (!items.length ? h('p', null, 'No items in the catalogue yet.') :
          items.map(function (it) {
            var on = !!equipped[it.id];
            return h('div', { key: it.id, style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', padding: '0.4rem 0', borderBottom: '1px solid var(--border-color)' } },
              h('div', { style: { flex: '1 1 auto', minWidth: 0 } },
                h('strong', null, it.name),
                it.description ? h('div', { style: { fontSize: '0.8rem', color: 'var(--text-secondary)' } }, it.description) : null
              ),
              h('button', { type: 'button', className: 'portal-btn is-small' + (on ? ' is-danger' : ''),
                onClick: function () { toggle(it, !on); } }, on ? 'Unequip' : 'Equip')
            );
          }))
    );
  }

  function fmtNum(n) { return (n >= 0 ? '+' : '') + n; }

  // ── Ability form ──────────────────────────────────────────────────────────
  function AbilityForm(props) {
    var a = props.initial || {};
    var nameState = useState(a.name || ''); var name = nameState[0], setName = nameState[1];
    var descState = useState(a.description || ''); var desc = descState[0], setDesc = descState[1];
    var activationState = useState(a.activation || 'passive'); var activation = activationState[0], setActivation = activationState[1];
    var valState = useState(String(a.modifier_value != null ? a.modifier_value : 1)); var val = valState[0], setVal = valState[1];
    var typeState = useState(a.modifier_type || 'attack_roll'); var type = typeState[0], setType = typeState[1];
    var scopeState = useState(a.target_scope || 'self'); var scope = scopeState[0], setScope = scopeState[1];
    var usesState = useState(String(a.uses_per_session || 1)); var uses = usesState[0], setUses = usesState[1];
    var initialRoles = a.eligible_roles ? String(a.eligible_roles).split(',') : ['all'];
    var rolesState = useState({
      tank: initialRoles.indexOf('all') !== -1 || initialRoles.indexOf('tank') !== -1,
      dps: initialRoles.indexOf('all') !== -1 || initialRoles.indexOf('dps') !== -1,
      healer: initialRoles.indexOf('all') !== -1 || initialRoles.indexOf('healer') !== -1
    });
    var roles = rolesState[0], setRoles = rolesState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];

    function eligibleCsv() {
      if (roles.tank && roles.dps && roles.healer) return 'all';
      var out = [];
      if (roles.tank) out.push('tank');
      if (roles.dps) out.push('dps');
      if (roles.healer) out.push('healer');
      return out.length ? out.join(',') : 'all';
    }

    async function submit(e) {
      e.preventDefault();
      if (!name.trim()) { setErr('Name is required.'); return; }
      try {
        await props.onSubmit({
          name: name.trim(), description: desc.trim() || null, activation: activation,
          modifier_value: parseInt(val, 10) || 0, modifier_type: type,
          target_scope: scope, eligible_roles: eligibleCsv(), uses_per_session: parseInt(uses, 10) || 1
        });
      } catch (e2) { setErr(e2.message || 'Failed to save.'); }
    }

    return h('form', { onSubmit: submit, className: 'portal-card', style: { marginTop: '0.5rem', background: 'var(--bg-card-light)' } },
      err ? h('div', { className: 'portal-flash error' }, err) : null,
      h('div', { className: 'portal-field' }, h('label', null, 'Ability name *'),
        h('input', { type: 'text', value: name, onChange: function (e) { setName(e.target.value); } })),
      h('div', { className: 'portal-field' }, h('label', null, 'Description (shown to the player)'),
        h('textarea', { rows: 4, value: desc, onChange: function (e) { setDesc(e.target.value); } })),
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(8rem, 1fr))', gap: '0.5rem' } },
        h('div', { className: 'portal-field' }, h('label', null, 'Activation'),
          h('select', { value: activation, onChange: function (e) { setActivation(e.target.value); } },
            h('option', { value: 'passive' }, 'Passive (always on)'),
            h('option', { value: 'activated' }, 'Activated (button)'))),
        h('div', { className: 'portal-field' }, h('label', null, 'Modifier'),
          h('input', { type: 'number', value: val, onChange: function (e) { setVal(e.target.value); } })),
        h('div', { className: 'portal-field' }, h('label', null, 'Type'),
          h('select', { value: type, onChange: function (e) { setType(e.target.value); } },
            ABILITY_MOD_TYPES.map(function (t) { return h('option', { key: t, value: t }, t.replace('_', ' ')); }))),
        h('div', { className: 'portal-field' }, h('label', null, 'Scope'),
          h('select', { value: scope, onChange: function (e) { setScope(e.target.value); } },
            h('option', { value: 'self' }, 'Self'), h('option', { value: 'group' }, 'Group'))),
        activation === 'activated' ? h('div', { className: 'portal-field' }, h('label', null, 'Uses / session'),
          h('input', { type: 'number', min: 1, value: uses, onChange: function (e) { setUses(e.target.value); } })) : null
      ),
      h('p', { className: 'portal-field-help', style: { margin: '0.25rem 0 0' } },
        'Use “none” for narrative-only effects (no auto-math). “shield” auto-adds to all eligible players only when an Activated + Group ability fires.'),
      h('div', { className: 'portal-field' }, h('label', null, 'Eligible classes'),
        h('div', { style: { display: 'flex', gap: '1rem' } },
          ['tank', 'dps', 'healer'].map(function (r) {
            return h('label', { key: r, style: { display: 'flex', alignItems: 'center', gap: '0.3rem' } },
              h('input', { type: 'checkbox', checked: roles[r], onChange: function (e) {
                var next = Object.assign({}, roles); next[r] = e.target.checked; setRoles(next);
              } }), r);
          }))
      ),
      h('div', { style: { display: 'flex', gap: '0.5rem', marginTop: '0.5rem' } },
        h('button', { type: 'submit', className: 'portal-btn is-small' }, props.initial ? 'Save ability' : 'Add ability'),
        h('button', { type: 'button', className: 'portal-btn is-small is-ghost', onClick: props.onCancel }, 'Cancel')
      )
    );
  }

  // ── Item card (with its abilities) ────────────────────────────────────────
  function ItemCard(props) {
    var it = props.item;
    var openState = useState(false); var open = openState[0], setOpen = openState[1];
    var abilitiesState = useState(null); var abilities = abilitiesState[0], setAbilities = abilitiesState[1];
    var formState = useState(null); var form = formState[0], setForm = formState[1]; // null | {ability?}
    var errState = useState(''); var err = errState[0], setErr = errState[1];

    async function loadAbilities() {
      try { setAbilities(await PVRollAPI.request('GET', '/rp/items/' + it.id + '/abilities') || []); }
      catch (e) { setErr(e.message); }
    }
    function toggleOpen() { var n = !open; setOpen(n); if (n && abilities === null) loadAbilities(); }

    async function submitAbility(payload) {
      if (form && form.ability) await PVRollAPI.request('PATCH', '/rp/abilities/' + form.ability.id, payload);
      else await PVRollAPI.request('POST', '/rp/items/' + it.id + '/abilities', payload);
      setForm(null); await loadAbilities();
    }
    async function deleteAbility(ab) {
      if (!confirm('Delete ability “' + ab.name + '”?')) return;
      try { await PVRollAPI.request('DELETE', '/rp/abilities/' + ab.id); await loadAbilities(); }
      catch (e) { setErr(e.message); }
    }

    return h('div', { className: 'portal-card', style: { marginBottom: '0.6rem' } },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' } },
        h('div', null,
          h('strong', null, it.name),
          it.description ? h('div', { style: { fontSize: '0.85rem', marginTop: '0.2rem', color: 'var(--text-secondary)', fontStyle: 'italic' } }, it.description) : null
        ),
        h('div', { style: { display: 'flex', gap: '0.35rem' } },
          h('button', { type: 'button', className: 'portal-btn is-small is-ghost', onClick: function () { props.onEdit(it); } }, 'Edit'),
          h('button', { type: 'button', className: 'portal-btn is-small is-danger', onClick: function () { props.onDelete(it); } }, 'Delete')
        )
      ),
      h('button', { type: 'button', className: 'portal-btn is-small is-ghost', style: { marginTop: '0.5rem' }, onClick: toggleOpen },
        open ? '▾ Hide abilities' : '▸ Abilities'),
      open ? h('div', { style: { marginTop: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem' } },
        err ? h('div', { className: 'portal-flash error' }, err) : null,
        abilities === null ? h('p', null, 'Loading…') :
          abilities.map(function (ab) {
            var meta = (ab.activation === 'passive' ? 'Passive' : 'Activated') +
              ' · ' + (ab.modifier_type === 'none' ? 'narrative' : fmtNum(ab.modifier_value) + ' ' + ab.modifier_type.replace('_', ' ')) +
              ' · ' + ab.target_scope + ' · ' + ab.eligible_roles +
              (ab.activation === 'activated' ? ' · ' + ab.uses_per_session + '×' : '');
            return h('div', { key: ab.id, style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', padding: '0.35rem 0', borderTop: '1px solid var(--border-color)' } },
              h('div', null,
                h('strong', null, ab.name),
                h('div', { style: { fontSize: '0.76rem', color: 'var(--text-secondary)' } }, meta),
                ab.description ? h('div', { style: { fontSize: '0.82rem', marginTop: '0.15rem' } }, ab.description) : null
              ),
              h('div', { style: { display: 'flex', gap: '0.3rem' } },
                h('button', { type: 'button', className: 'portal-btn is-small is-ghost', onClick: function () { setForm({ ability: ab }); } }, 'Edit'),
                h('button', { type: 'button', className: 'portal-btn is-small is-danger', onClick: function () { deleteAbility(ab); } }, '✕')
              )
            );
          }),
        form ? h(AbilityForm, { initial: form.ability, onSubmit: submitAbility, onCancel: function () { setForm(null); } })
          : h('button', { type: 'button', className: 'portal-btn is-small', style: { marginTop: '0.4rem' },
              onClick: function () { setForm({}); } }, '+ Add ability')
      ) : null
    );
  }

  // ── Item form ─────────────────────────────────────────────────────────────
  function ItemForm(props) {
    var it = props.initial || {};
    var nameState = useState(it.name || ''); var name = nameState[0], setName = nameState[1];
    var descState = useState(it.description || ''); var desc = descState[0], setDesc = descState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];

    async function submit(e) {
      e.preventDefault();
      if (!name.trim()) { setErr('Name is required.'); return; }
      try {
        await props.onSubmit({ name: name.trim(), description: desc.trim() || null });
      } catch (e2) { setErr(e2.message || 'Failed to save.'); }
    }

    return h('form', { onSubmit: submit, className: 'portal-card', style: { marginBottom: '1rem' } },
      h('h3', { style: { marginTop: 0 } }, props.initial ? 'Edit item' : 'New item'),
      err ? h('div', { className: 'portal-flash error' }, err) : null,
      h('div', { className: 'portal-field' }, h('label', null, 'Name *'),
        h('input', { type: 'text', value: name, onChange: function (e) { setName(e.target.value); } })),
      h('div', { className: 'portal-field' }, h('label', null, 'Flavor / description (shown to the player)'),
        h('textarea', { rows: 3, value: desc, onChange: function (e) { setDesc(e.target.value); } })),
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

    // items
    var itemsState = useState([]); var items = itemsState[0], setItems = itemsState[1];
    var itemFormState = useState(null); var itemForm = itemFormState[0], setItemForm = itemFormState[1];
    var equipState = useState(null); var equipFor = equipState[0], setEquipFor = equipState[1];

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
    useEffect(function () { loadCampaigns(); loadItems(); /* eslint-disable-next-line */ }, []);

    function selectCampaign(c) {
      setSelected(c); setRoster([]); loadRoster(c.id);
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
        setPickMember(''); await loadRoster(selected.id);
      } catch (e) { setErr(e.message); }
    }
    async function saveCharacter(memberId, body) {
      await PVRollAPI.request('PATCH', '/rp/campaigns/' + selected.id + '/characters/' + memberId, body);
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

    // available members = roster-eligible not already in this campaign
    var inCampaign = {}; roster.forEach(function (r) { inCampaign[r.member_id] = true; });
    var availableMembers = (members || []).filter(function (m) { return !inCampaign[m.id]; });

    return h('div', null,
      h('div', { style: { display: 'flex', gap: '0.5rem', marginBottom: '1rem' } },
        h('button', { type: 'button', className: 'portal-btn is-small' + (tab === 'campaigns' ? '' : ' is-ghost'),
          onClick: function () { setTab('campaigns'); } }, 'Campaigns & Sessions'),
        isAdmin ? h('button', { type: 'button', className: 'portal-btn is-small' + (tab === 'items' ? '' : ' is-ghost'),
          onClick: function () { setTab('items'); } }, 'Item Catalogue') : null
      ),
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
                  placeholder: 'e.g. Embers of the Vanguard',
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
                  c.active ? h('span', { style: { marginLeft: '0.5rem', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#fff', background: 'var(--accent-red)', borderRadius: '0.3rem', padding: '0.1rem 0.4rem' } }, 'Live') : null
                ),
                h('div', { style: { display: 'flex', gap: '0.35rem', flexWrap: 'wrap' } },
                  c.active
                    ? h('button', { type: 'button', className: 'portal-btn is-small is-danger', onClick: function () { endSession(c); } }, 'End session')
                    : h('button', { type: 'button', className: 'portal-btn is-small', onClick: function () { startSession(c); } }, 'Start session'),
                  h('button', { type: 'button', className: 'portal-btn is-small is-ghost', onClick: function () { isSel ? setSelected(null) : selectCampaign(c); } }, isSel ? 'Close' : 'Manage'),
                  isAdmin ? h('button', { type: 'button', className: 'portal-btn is-small is-danger', onClick: function () { deleteCampaign(c); } }, 'Delete') : null
                )
              ),

              isSel ? h('div', { style: { marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' } },
                h('p', { style: { margin: '0 0 0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' } }, 'Roster'),
                roster.map(function (ch) {
                  return h(RosterRow, { key: ch.member_id, character: ch, canEquip: isAdmin,
                    onSave: saveCharacter, onRemove: removeCharacter, onManageItems: function (x) { setEquipFor(x); } });
                }),
                h('div', { className: 'portal-card', style: { background: 'var(--bg-card-light)', marginTop: '0.5rem' } },
                  h('p', { style: { margin: '0 0 0.5rem', fontWeight: 600 } }, 'Add a member'),
                  members === null ? h('p', null, 'Loading members…') :
                    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(8rem, 1fr))', gap: '0.5rem', alignItems: 'end' } },
                      h('div', { className: 'portal-field' }, h('label', null, 'Member'),
                        h('select', { value: pickMember, onChange: function (e) { setPickMember(e.target.value); } },
                          h('option', { value: '' }, '— choose —'),
                          availableMembers.map(function (m) { return h('option', { key: m.id, value: m.id }, m.name); }))),
                      h('div', { className: 'portal-field' }, h('label', null, 'Class'),
                        h('select', { value: pickRole, onChange: function (e) { setPickRole(e.target.value); } },
                          CLASS_ROLES.map(function (o) { return h('option', { key: o.value, value: o.value }, o.label); }))),
                      h('div', { className: 'portal-field' }, h('label', null, 'Armor'),
                        h('select', { value: pickArmor, onChange: function (e) { setPickArmor(e.target.value); } },
                          ARMOR_TYPES.map(function (o) { return h('option', { key: o.value, value: o.value }, o.label); }))),
                      h('button', { type: 'button', className: 'portal-btn', onClick: addCharacter }, 'Add')
                    )
                )
              ) : null
            );
          })
      ) : null,

      tab === 'items' && isAdmin ? h('div', null,
        itemForm ? h(ItemForm, { initial: itemForm.item, onSubmit: submitItem, onCancel: function () { setItemForm(null); } })
          : h('button', { type: 'button', className: 'portal-btn', style: { marginBottom: '1rem' }, onClick: function () { setItemForm({}); } }, '+ New item'),
        !items.length ? h('div', { className: 'portal-card' }, 'No items yet.') :
          items.map(function (it) {
            return h(ItemCard, { key: it.id, item: it, onEdit: function (x) { setItemForm({ item: x }); }, onDelete: deleteItem });
          })
      ) : null,

      equipFor ? h(EquipModal, { character: equipFor, campaignId: selected.id, items: items,
        onClose: function () { setEquipFor(null); loadRoster(selected.id); } }) : null
    );
  }

  window.PVAdminRpRolls = PVAdminRpRolls;
})();
