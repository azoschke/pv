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

  // Inline Material icon. `pos` shifts the optical alignment: 'lead' for an icon
  // that sits before button text, 'trail' for one after it, 'only' for an
  // icon-only button. Always aria-hidden — the button carries its own label/title.
  function mi(name, pos) {
    var style = { fontSize: '1.1em', lineHeight: 1, verticalAlign: '-0.18em', fontVariationSettings: "'FILL' 1" };
    if (pos === 'lead') style.marginRight = '0.28rem';
    else if (pos === 'trail') style.marginLeft = '0.28rem';
    return h('span', { className: 'material-symbols-outlined', 'aria-hidden': 'true', style: style }, name);
  }

  // A vertical drag-to-reorder list (HTML5 DnD). `items` is the ordered array;
  // `renderRow(item, i)` draws a row's content; `onReorder(orderedIds)` fires
  // after a drop with the new id order. Each row gets a grab handle; the whole
  // row is the drag target so the handle is just an affordance. Rows keep their
  // own Edit/Delete buttons working — a click isn't a drag.
  function DragReorder(props) {
    var items = props.items || [];
    var keyOf = props.keyOf || function (x) { return x.id; };
    var dragState = useState(null); var dragIdx = dragState[0], setDragIdx = dragState[1];
    var overState = useState(null); var overIdx = overState[0], setOverIdx = overState[1];
    function drop(toIdx) {
      var from = dragIdx; setDragIdx(null); setOverIdx(null);
      if (from == null || from === toIdx) return;
      var order = items.map(keyOf);
      var moved = order.splice(from, 1)[0]; order.splice(toIdx, 0, moved);
      if (props.onReorder) props.onReorder(order);
    }
    return h('div', null, items.map(function (it, i) {
      return h('div', {
        key: keyOf(it), draggable: true,
        onDragStart: function (e) { setDragIdx(i); try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); } catch (_) {} },
        onDragOver: function (e) { e.preventDefault(); if (overIdx !== i) setOverIdx(i); },
        onDrop: function (e) { e.preventDefault(); drop(i); },
        onDragEnd: function () { setDragIdx(null); setOverIdx(null); },
        style: { opacity: dragIdx === i ? 0.45 : 1, borderTop: (overIdx === i && dragIdx !== i) ? '2px solid var(--accent-gold)' : '2px solid transparent' }
      }, h('div', { style: { display: 'flex', alignItems: 'center', gap: '0.3rem' } },
        h('span', { className: 'material-symbols-outlined', 'aria-hidden': 'true', title: 'Drag to reorder', style: { fontSize: '1.05em', color: 'var(--text-secondary)', cursor: 'grab', flexShrink: 0 } }, 'drag_indicator'),
        h('div', { style: { flex: 1, minWidth: 0 } }, props.renderRow(it, i))));
    }));
  }

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
  // attack_mult multiplies a target's attack damage; damage / dot hit an enemy.
  var MOD_TYPES = ['attack_roll', 'defense_roll', 'heal_roll', 'attack_output', 'attack_mult', 'heal_output', 'shield', 'heal', 'damage', 'dot', 'vulnerability', 'stun', 'none'];
  var MOD_TYPE_LABELS = {
    attack_roll: 'Attack roll bonus', defense_roll: 'Defense roll bonus', heal_roll: 'Healing roll bonus',
    attack_output: 'Bonus attack damage', attack_mult: 'Attack damage multiplier (×)', heal_output: 'Bonus healing',
    shield: 'Grant shield', heal: 'Restore HP', damage: 'Direct damage (to an enemy)', dot: 'Damage over time (to an enemy)', none: 'Narrative only'
  };
  // Types that hit an enemy boss (target is fixed to the chosen boss, Activated mode).
  var BOSS_MOD_TYPES = ['damage', 'dot'];
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

    // A class change resets Max HP to that class's base HP (still editable before
    // Save); switching back to the saved class restores the saved Max HP.
    function changeRole(v) {
      setRole(v);
      var base = (props.baseHp || {})[v];
      if (v === ch.class_role) setMaxHp(String(ch.max_hp));
      else if (base) setMaxHp(String(base));
    }

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
      h('div', { className: 'rp-card-media sketch-wash' },
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
          h('select', { value: role, onChange: function (e) { changeRole(e.target.value); } },
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
      h('div', { className: 'portal-field' }, h('label', null, 'Description'),
        h('textarea', { rows: 4, value: desc, onChange: function (e) { setDesc(e.target.value); } })),
      h('label', { style: { display: 'flex', alignItems: 'center', gap: '0.4rem', margin: '0.25rem 0' } },
        h('input', { type: 'checkbox', checked: activateAll, onChange: function (e) { setActivateAll(e.target.checked); } }),
        'Offer an “Activate all” master control on this ability'),
      h('div', { style: { display: 'flex', gap: '0.5rem', marginTop: '0.5rem' } },
        h('button', { type: 'submit', className: 'portal-btn is-small' }, props.initial ? 'Save ability' : 'Add ability'),
        h('button', { type: 'button', className: 'portal-btn is-small is-ghost', onClick: props.onCancel }, 'Cancel')));
  }

  // ── Modifier form ─────────────────────────────────────────────────────────
  // Effect-driven UI. The player never sees the stored `type` names; the admin
  // picks an EFFECT, and Damage/Heal add an Instant-vs-Over-time toggle. This
  // maps down onto the existing stored types (damage/dot, heal, the roll bonuses,
  // …) so nothing about the data model changes:
  //   • Damage · Instant   → type "damage"  (single hit to the chosen enemy)
  //   • Damage · Over time  → type "dot"     (ticks each turn)
  //   • Heal   · Instant   → type "heal", duration 1 (applies once)
  //   • Heal   · Over time  → type "heal", duration N (re-heals each turn)
  //   • Roll bonus          → attack_roll | defense_roll | heal_roll
  // Effects are grouped into two families: ones where the ITEM acts (deals
  // damage, heals, shields) and ones that BOOST THE HOLDER's own rolls/output.
  // Each maps to a stored `type`; the player never sees these keys.
  var EFFECT_GROUPS = [
    { label: 'The item acts', options: [
      { value: 'damage', label: 'Strike an enemy' },
      { value: 'heal', label: 'Heal HP' },
      { value: 'shield', label: 'Grant shield' },
      { value: 'summon', label: 'Summon minions' }
    ] },
    { label: 'Boosts the holder', options: [
      { value: 'roll', label: 'Add to a roll' },
      { value: 'attack_output', label: 'Add attack damage' },
      { value: 'attack_mult', label: 'Multiply attack damage' },
      { value: 'heal_output', label: 'Boost healing done' },
      { value: 'damage_reduction', label: 'Reduce damage taken' },
      { value: 'skill', label: 'Add to a skill check' }
    ] },
    { label: 'Debuffs a target', options: [
      { value: 'vulnerability', label: 'Make a target take more damage' },
      { value: 'stun', label: 'Stun a target (skip its next turn)' }
    ] },
    { label: 'Other', options: [
      { value: 'none', label: 'Narrative only' }
    ] }
  ];
  // One short plain line per effect. Middle-school reading level, no jargon.
  var EFFECT_HELP = {
    damage: 'Hits an enemy you pick for damage.',
    heal: 'Restores HP to the target.',
    shield: 'Gives a shield that blocks damage.',
    summon: '',
    roll: 'Adds to the holder’s dice rolls.',
    attack_output: 'Adds extra damage to the holder’s attacks.',
    attack_mult: 'Multiplies the damage of the holder’s attacks.',
    heal_output: 'Makes the holder’s heals restore more HP.',
    damage_reduction: 'Lowers damage the target takes.',
    skill: 'Adds to the holder’s rolls for one skill.',
    vulnerability: 'Target takes extra damage for a while.',
    stun: 'Target skips its next turn. Bosses can be immune to stun.',
    none: ''
  };
  var ROLL_KINDS = [
    { value: 'attack_roll', label: 'Attack roll' },
    { value: 'defense_roll', label: 'Defense roll' },
    { value: 'heal_roll', label: 'Healing roll' }
  ];
  // Character skill checks — kept in sync with the roll calculator's list.
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
  var TARGET_OPTIONS = [
    { value: 'self', label: 'Self' },
    { value: 'group', label: 'Everyone' },
    { value: 'class', label: 'A class' },
    { value: 'party_member', label: 'A chosen ally' },
    { value: 'party_members', label: 'Several chosen allies' },
    { value: 'holder_items', label: 'Holder of item(s)' }
  ];
  // ── Conditional activation (Advanced) ───────────────────────────────────────
  // An optional gate on any effect: the holder's HP, or the campaign's scene
  // (location / time of day). Untouched = the effect always applies. These fixed
  // lists are shared with the roll calculator's DM Control Deck AND the worker's
  // validation — keep all three in lockstep if they ever change.
  var RP_LOCATIONS = ['Arctic', 'Cave', 'Coastal', 'Desert', 'Forest', 'Jungle', 'Grassland', 'Mountain', 'Swamp', 'Town'];
  var RP_TIMES = ['Morning', 'Afternoon', 'Evening', 'Night'];
  // HP comparison operators. '=' is only valid with a flat HP value — a percent
  // rarely lands on an exact integer — enforced on submit and in the worker.
  var HP_OPS = [
    { value: '<', label: 'below' },
    { value: '<=', label: 'at or below' },
    { value: '=', label: 'exactly' },
    { value: '>=', label: 'at or above' },
    { value: '>', label: 'above' }
  ];
  function parseConditions(c) {
    if (!c) return null;
    if (typeof c === 'object') return c;
    try { return JSON.parse(c) || null; } catch (_) { return null; }
  }
  // A short plain-language note for the catalogue summary, e.g.
  // "Only while the holder is below 50% HP" / "Only in Forest, Jungle at Night".
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
  // "How it works" options are phrased per effect so timing reads naturally and
  // never contradicts itself (an "always on" choice never carries a turn limit;
  // over-time is a named option, not a hidden toggle). Each maps to mode +
  // duration under the hood.
  function timingOptions(effect) {
    if (effect === 'damage') return [{ value: 'once', label: 'Hit once' }, { value: 'over', label: 'Damage each turn for a while' }];
    if (effect === 'heal') return [{ value: 'once', label: 'Heal once' }, { value: 'over', label: 'Heal each turn for a while' }, { value: 'toggle', label: 'Heal each turn (toggle on/off)' }, { value: 'passive', label: 'Heal each turn (always on)' }];
    // A shield is granted once and lasts until it's broken, so it has no turn timer.
    if (effect === 'shield') return [{ value: 'once', label: 'Give once (press)' }, { value: 'passive', label: 'Refresh each turn (always on)' }];
    return [{ value: 'passive', label: 'Always on' }, { value: 'toggle', label: 'Toggle on/off' }, { value: 'temp', label: 'Temporary (lasts a while)' }];
  }
  function initTiming(effect, m) {
    var mode = m.mode || 'always';
    if (effect === 'damage') return m.type === 'dot' ? 'over' : 'once';
    if (effect === 'heal') return mode === 'toggle' ? 'toggle' : mode === 'always' ? 'passive' : (m.duration_turns === 1 && !m.start_next_turn ? 'once' : 'over');
    if (effect === 'shield') return mode === 'always' ? 'passive' : 'once';
    if (mode === 'toggle') return 'toggle';
    if (mode === 'activated') return 'temp';
    return 'passive';
  }
  function effectOfType(type) {
    if (type === 'attack_roll' || type === 'defense_roll' || type === 'heal_roll' || type === 'roll_bonus') return 'roll';
    if (type === 'damage' || type === 'dot') return 'damage';
    if (type === 'skill_roll') return 'skill';
    return type || 'roll'; // attack_output, attack_mult, heal_output, damage_reduction, shield, heal, none
  }

  // Shared by the item modifier form and the boss effect form.
  function secHead(t) { return h('div', { style: { fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', margin: '0.7rem 0 0.35rem' } }, t); }
  function fieldGrid(children) { return h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))', gap: '0.5rem', alignItems: 'end' } }, children); }

  function ModifierForm(props) {
    var m = props.initial || {};
    var initType = m.type || 'attack_roll';
    // New modifiers start with no effect chosen, so the form isn't a wall of
    // fields until the admin picks what it does.
    var initEffect = props.initial ? effectOfType(initType) : '';
    var labelState = useState(m.label || ''); var label = labelState[0], setLabel = labelState[1];
    var valState = useState(String(m.value != null ? m.value : 1)); var val = valState[0], setVal = valState[1];
    var effectState = useState(initEffect); var effect = effectState[0], setEffect = effectState[1];
    // Roll bonus can boost several rolls at once (tick all = boost every roll);
    // stored as one roll_bonus modifier with a `rolls` array.
    var initRolls = initType === 'roll_bonus'
      ? (Array.isArray(m.rolls) && m.rolls.length ? m.rolls : ['attack_roll'])
      : ((initType === 'attack_roll' || initType === 'defense_roll' || initType === 'heal_roll') ? [initType] : ['attack_roll']);
    var rollsState = useState(initRolls); var rolls = rollsState[0], setRolls = rollsState[1];
    function toggleRoll(rk) { setRolls(function (cur) { return cur.indexOf(rk) !== -1 ? cur.filter(function (x) { return x !== rk; }) : cur.concat([rk]); }); }
    var skillPickState = useState(initType === 'skill_roll' ? (m.skill || 'perception') : 'perception'); var skillPick = skillPickState[0], setSkillPick = skillPickState[1];
    // Summon parameters (stored as a JSON `summon` object on the modifier).
    function parseSummon(s) { if (s && typeof s === 'object') return s; try { return JSON.parse(s) || {}; } catch (_) { return {}; } }
    var initSummon = initType === 'summon' ? parseSummon(m.summon) : {};
    var sNameState = useState(initSummon.name || ''); var sName = sNameState[0], setSName = sNameState[1];
    var sCountState = useState(String(initSummon.count || 1)); var sCount = sCountState[0], setSCount = sCountState[1];
    var sHpState = useState(String(initSummon.hp || 1)); var sHp = sHpState[0], setSHp = sHpState[1];
    var sAtkState = useState(String(initSummon.attack != null ? initSummon.attack : 1)); var sAtk = sAtkState[0], setSAtk = sAtkState[1];
    var sModeState = useState(initSummon.attack_mode === 'd20' ? 'd20' : 'fixed'); var sMode = sModeState[0], setSMode = sModeState[1];
    var sScopeState = useState(initSummon.attack_scope === 'all_bosses' ? 'all_bosses' : (initSummon.attack_scope === 'some_bosses' ? 'some_bosses' : 'boss')); var sScope = sScopeState[0], setSScope = sScopeState[1];
    var sCapState = useState(initSummon.attack_cap ? String(initSummon.attack_cap) : ''); var sCap = sCapState[0], setSCap = sCapState[1];
    var sTurnsState = useState(initSummon.turns ? String(initSummon.turns) : ''); var sTurns = sTurnsState[0], setSTurns = sTurnsState[1];
    // One "How it works" choice (per effect) drives mode + duration together, so
    // "always on" can never carry a turn limit and over-time is a named option.
    var timingState = useState(initTiming(initEffect, m)); var timing = timingState[0], setTiming = timingState[1];
    var initTk = (m.target_kind && m.target_kind !== 'boss' && m.target_kind !== 'all_bosses')
      ? (m.target_kind === 'holder_item' ? 'holder_items' : m.target_kind) : 'self';
    var tkState = useState(initTk); var tk = tkState[0], setTk = tkState[1];
    var refState = useState(m.target_kind === 'class' ? (m.target_ref || 'tank') : ''); var ref = refState[0], setRef = refState[1]; // class role
    // "Holder of item(s)" targets store an array of item ids in target_ref (JSON).
    function parseRefs(s) { if (Array.isArray(s)) return s.map(String); try { var a = JSON.parse(s); return Array.isArray(a) ? a.map(String) : []; } catch (_) { return s ? [String(s)] : []; } }
    var initRefs = m.target_kind === 'holder_items' ? parseRefs(m.target_ref) : (m.target_kind === 'holder_item' && m.target_ref ? [String(m.target_ref)] : []);
    var refsState = useState(initRefs); var refs = refsState[0], setRefs = refsState[1];
    function toggleRef(id) { setRefs(function (cur) { return cur.indexOf(id) !== -1 ? cur.filter(function (x) { return x !== id; }) : cur.concat([id]); }); }
    // Strike can hit one chosen enemy, several chosen enemies, or all of them.
    var enemyScopeState = useState(m.target_kind === 'all_bosses' ? 'all_bosses' : m.target_kind === 'some_bosses' ? 'some_bosses' : m.target_kind === 'minions' ? 'minions' : 'boss'); var enemyScope = enemyScopeState[0], setEnemyScope = enemyScopeState[1];
    // "Several enemies" can cap how many are picked (blank = no cap); stored in target_ref.
    var enemyCapState = useState(m.target_kind === 'some_bosses' && m.target_ref ? String(m.target_ref) : ''); var enemyCap = enemyCapState[0], setEnemyCap = enemyCapState[1];
    // Uses is opt-in via a checkbox so simple items never see a "0 = unlimited" box.
    var limitUsesState = useState((m.uses_per_session || 0) > 0); var limitUses = limitUsesState[0], setLimitUses = limitUsesState[1];
    var usesState = useState(String(m.uses_per_session && m.uses_per_session > 0 ? m.uses_per_session : 1)); var uses = usesState[0], setUses = usesState[1];
    // Pre-fill the saved turns, including 1. The only saved 1 to hide is "Heal once",
    // which stores duration 1 internally but has no turns field.
    var healOnce = m.type === 'heal' && m.duration_turns === 1 && !m.start_next_turn;
    var durState = useState(m.duration_turns > 0 && !healOnce ? String(m.duration_turns) : ''); var dur = durState[0], setDur = durState[1];
    // Vulnerability (debuff): a flat add and/or a multiplier, aimed at an enemy
    // or a player. Reuses enemyScope/enemyCap for the enemy side and tk/ref for
    // the player side.
    // "Wait a turn before it starts" — delays a vulnerability so it does nothing
    // this turn and begins next turn (still its full length). DoTs and heals over
    // time always start next turn; stuns always land now.
    var startNextState = useState(!!m.start_next_turn); var startNext = startNextState[0], setStartNext = startNextState[1];
    var vMultState = useState(String(m.mult != null && m.mult > 1 ? m.mult : 2)); var vMult = vMultState[0], setVMult = vMultState[1];
    // Vulnerability is one-or-the-other: a flat add OR a multiplier, never both.
    // Seed from whichever the stored effect used (multiplier only when there's no flat).
    var vKindState = useState((m.type === 'vulnerability' && m.mult != null && m.mult > 1 && !(m.value > 0)) ? 'mult' : 'flat'); var vKind = vKindState[0], setVKind = vKindState[1];
    var vSideState = useState((m.target_kind === 'boss' || m.target_kind === 'some_bosses' || m.target_kind === 'all_bosses' || m.target_kind === 'minions') ? 'enemy' : ((initType === 'vulnerability' || initType === 'stun') ? 'player' : 'enemy'));
    var vSide = vSideState[0], setVSide = vSideState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];

    // ── Conditional activation (Advanced) ─────────────────────────────────────
    // HP and Scene are mutually exclusive per effect. Untouched (condKind '') =
    // the effect always applies, exactly as before.
    var initConds = props.initial ? parseConditions(m.conditions) : null;
    var condKindState = useState(initConds ? (initConds.kind || '') : ''); var condKind = condKindState[0], setCondKind = condKindState[1];
    var initHp = (initConds && initConds.kind === 'hp') ? initConds : null;
    var condSubjectState = useState(initHp && initHp.subject === 'item_holder' ? 'item_holder' : 'holder'); var condSubject = condSubjectState[0], setCondSubject = condSubjectState[1];
    var condItemState = useState(initHp && initHp.item_id ? String(initHp.item_id) : ''); var condItem = condItemState[0], setCondItem = condItemState[1];
    var startOpState = useState(initHp && initHp.start ? (initHp.start.op || '<') : '<'); var startOp = startOpState[0], setStartOp = startOpState[1];
    var startValState = useState(initHp && initHp.start ? String(initHp.start.value) : '50'); var startVal = startValState[0], setStartVal = startValState[1];
    var startUnitState = useState(initHp && initHp.start && initHp.start.unit === 'flat' ? 'flat' : 'pct'); var startUnit = startUnitState[0], setStartUnit = startUnitState[1];
    var useStopState = useState(!!(initHp && initHp.stop)); var useStop = useStopState[0], setUseStop = useStopState[1];
    var stopOpState = useState(initHp && initHp.stop ? (initHp.stop.op || '>=') : '>='); var stopOp = stopOpState[0], setStopOp = stopOpState[1];
    var stopValState = useState(initHp && initHp.stop ? String(initHp.stop.value) : '50'); var stopVal = stopValState[0], setStopVal = stopValState[1];
    var stopUnitState = useState(initHp && initHp.stop && initHp.stop.unit === 'flat' ? 'flat' : 'pct'); var stopUnit = stopUnitState[0], setStopUnit = stopUnitState[1];
    var initScene = (initConds && initConds.kind === 'scene') ? initConds : null;
    var condLocsState = useState(initScene && Array.isArray(initScene.locations) ? initScene.locations.slice() : []); var condLocs = condLocsState[0], setCondLocs = condLocsState[1];
    var condTimesState = useState(initScene && Array.isArray(initScene.times) ? initScene.times.slice() : []); var condTimes = condTimesState[0], setCondTimes = condTimesState[1];
    function toggleLoc(x) { setCondLocs(function (cur) { return cur.indexOf(x) !== -1 ? cur.filter(function (y) { return y !== x; }) : cur.concat([x]); }); }
    function toggleTime(x) { setCondTimes(function (cur) { return cur.indexOf(x) !== -1 ? cur.filter(function (y) { return y !== x; }) : cur.concat([x]); }); }
    // Advanced Settings is collapsed by default; auto-open when editing an effect
    // that already carries a condition so it isn't hidden.
    var advOpenState = useState(!!initConds); var advOpen = advOpenState[0], setAdvOpen = advOpenState[1];
    function resolvedConditions() {
      if (condKind === 'hp') {
        var start = { op: startOp, value: Math.max(0, parseInt(startVal, 10) || 0), unit: startUnit === 'flat' ? 'flat' : 'pct' };
        var stop = useStop ? { op: stopOp, value: Math.max(0, parseInt(stopVal, 10) || 0), unit: stopUnit === 'flat' ? 'flat' : 'pct' } : null;
        return { kind: 'hp', subject: condSubject === 'item_holder' ? 'item_holder' : 'holder', item_id: condSubject === 'item_holder' ? (condItem || null) : null, start: start, stop: stop };
      }
      if (condKind === 'scene') return { kind: 'scene', locations: condLocs.slice(), times: condTimes.slice() };
      return null;
    }
    function conditionError() {
      if (condKind === 'hp') {
        if (condSubject === 'item_holder' && !condItem) return 'Pick the item whose holder’s HP this watches.';
        if (startUnit === 'pct' && startOp === '=') return 'Use HP (not %) for an “exactly” condition.';
        if (useStop && stopUnit === 'pct' && stopOp === '=') return 'Use HP (not %) for an “exactly” stop condition.';
        if (startUnit === 'pct' && (parseInt(startVal, 10) || 0) > 100) return 'A percent start can’t be above 100.';
        if (useStop && stopUnit === 'pct' && (parseInt(stopVal, 10) || 0) > 100) return 'A percent stop can’t be above 100.';
      }
      if (condKind === 'scene' && !condLocs.length && !condTimes.length) return 'Pick at least one location or time of day.';
      return null;
    }

    // On first pick (from no effect) default the timing to the effect's first
    // option so a new Heal/Shield doesn't silently start as "always on". When
    // switching between real effects, keep the current timing if it's still valid.
    function changeEffect(next) {
      var wasEmpty = !effect;
      setEffect(next);
      // Heal over time stores a hidden start_next_turn flag; don't carry it into
      // another effect's "Wait a turn before it starts" box.
      if (next !== effect) setStartNext(false);
      var opts = timingOptions(next).map(function (o) { return o.value; });
      if (wasEmpty || opts.indexOf(timing) === -1) setTiming(opts[0]);
    }

    var hasEffect = !!effect;
    var isStrike = effect === 'damage';   // hits a chosen enemy; always press-to-use
    var isSummon = effect === 'summon';   // spawns minions; always press-to-use
    var isVuln = effect === 'vulnerability'; // debuff; its own self-contained block
    var isStun = effect === 'stun';           // debuff; its own self-contained block
    var isNone = effect === 'none';
    var isOver = timing === 'over';
    var isActivated = timing === 'temp' || timing === 'once' || timing === 'over';
    var showValue = hasEffect && !isNone && !isSummon && !isVuln && !isStun;
    var showTarget = hasEffect && !isNone && !isStrike && !isSummon && !isVuln && !isStun;
    var showTiming = hasEffect && !isNone && !isSummon && !isVuln && !isStun;
    var showUses = hasEffect && !isNone && (isSummon || isActivated || isVuln || isStun);
    var showTurns = hasEffect && !isSummon && !isVuln && !isStun && (timing === 'temp' || timing === 'over'); // only "…for a while" needs turns

    function resolvedMode() {
      if (isStrike || isSummon) return 'activated';
      if (timing === 'passive') return 'always';
      if (timing === 'toggle') return 'toggle';
      return 'activated'; // temp / once / over
    }
    function resolvedType() {
      if (effect === 'roll') return 'roll_bonus';
      if (effect === 'skill') return 'skill_roll';
      if (effect === 'damage') return isOver ? 'dot' : 'damage';
      return effect; // summon, heal, shield, attack_output, attack_mult, heal_output, damage_reduction, none
    }
    function resolvedDuration() {
      if (effect === 'heal' && timing === 'once') return 1;   // instant heal = one application
      if (effect === 'heal' && timing === 'passive') return 0; // re-heals every turn, forever
      if (effect === 'damage' && timing === 'once') return 0;  // single hit
      if (!showTurns) return 0;
      return parseInt(dur, 10) || 0; // blank / 0 = until removed
    }
    function resolvedSummon() {
      if (!isSummon) return null;
      return { name: sName.trim() || 'Minion', count: Math.max(1, parseInt(sCount, 10) || 1),
        hp: Math.max(1, parseInt(sHp, 10) || 1),
        attack_mode: sMode === 'd20' ? 'd20' : 'fixed',
        attack: sMode === 'd20' ? 0 : Math.max(0, parseInt(sAtk, 10) || 0),
        attack_scope: sScope,
        attack_cap: (sScope === 'some_bosses' && parseInt(sCap, 10) > 0) ? parseInt(sCap, 10) : 0,
        turns: Math.max(0, parseInt(sTurns, 10) || 0) };
    }
    function resolvedUses() { return (showUses && limitUses) ? Math.max(1, parseInt(uses, 10) || 1) : 0; }
    function valueLabel() {
      switch (effect) {
        case 'roll': return 'Amount to add';
        case 'skill': return 'Amount to add';
        case 'attack_output': return 'Extra attack damage';
        case 'heal_output': return 'Extra healing';
        case 'attack_mult': return 'Times damage (×)';
        case 'damage_reduction': return 'Damage reduced';
        case 'shield': return 'Shield amount';
        case 'heal': return isOver ? 'HP each turn' : 'HP restored';
        case 'damage': return isOver ? 'Damage each turn' : 'Damage';
      }
      return 'Amount';
    }

    async function submit(e) {
      e.preventDefault();
      if (!effect) { setErr('Pick an effect.'); return; }
      var condErr = conditionError(); if (condErr) { setErr(condErr); return; }
      var conditions = resolvedConditions();
      if (effect === 'roll' && !rolls.length) { setErr('Pick at least one roll.'); return; }
      if (isVuln) {
        // One-or-the-other: the unused side is sent at its no-op value (flat 0 / ×1).
        var flat = vKind === 'flat' ? Math.max(0, parseInt(val, 10) || 0) : 0;
        var mlt = vKind === 'mult' ? Math.max(1, parseFloat(vMult) || 1) : 1;
        if (vKind === 'flat' && flat <= 0) { setErr('Add some flat extra damage.'); return; }
        if (vKind === 'mult' && mlt <= 1) { setErr('Use a multiplier above 1×.'); return; }
        var vp = { label: label.trim() || null, value: flat, mult: mlt, type: 'vulnerability', rolls: null, skill: null, summon: null, conditions: conditions,
          target_kind: vSide === 'enemy' ? enemyScope : tk, mode: 'activated', uses_per_session: resolvedUses(), duration_turns: parseInt(dur, 10) || 0, start_next_turn: startNext };
        if (vSide === 'enemy') vp.target_ref = (enemyScope === 'some_bosses' && parseInt(enemyCap, 10) > 0) ? String(parseInt(enemyCap, 10)) : null;
        else if (tk === 'class') vp.target_ref = ref || 'tank';
        else vp.target_ref = null;
        try { await props.onSubmit(vp); } catch (e2) { setErr(e2.message || 'Failed to save.'); }
        return;
      }
      if (isStun) {
        var sp = { label: label.trim() || null, value: 0, type: 'stun', rolls: null, skill: null, summon: null, conditions: conditions,
          target_kind: vSide === 'enemy' ? enemyScope : tk, mode: 'activated', uses_per_session: resolvedUses(), duration_turns: Math.max(1, parseInt(dur, 10) || 1), start_next_turn: false };
        if (vSide === 'enemy') sp.target_ref = (enemyScope === 'some_bosses' && parseInt(enemyCap, 10) > 0) ? String(parseInt(enemyCap, 10)) : null;
        else if (tk === 'class') sp.target_ref = ref || 'tank';
        else sp.target_ref = null;
        try { await props.onSubmit(sp); } catch (e2) { setErr(e2.message || 'Failed to save.'); }
        return;
      }
      var payload = { label: label.trim() || null, value: isSummon ? 0 : (parseInt(val, 10) || 0), type: resolvedType(),
        rolls: effect === 'roll' ? rolls : null,
        skill: effect === 'skill' ? skillPick : null,
        summon: resolvedSummon(), conditions: conditions,
        target_kind: isSummon ? 'self' : (isStrike ? enemyScope : tk), mode: resolvedMode(),
        uses_per_session: resolvedUses(), duration_turns: resolvedDuration(),
        start_next_turn: effect === 'heal' && isOver };
      if (isStrike) payload.target_ref = (enemyScope === 'some_bosses' && parseInt(enemyCap, 10) > 0) ? String(parseInt(enemyCap, 10)) : null;
      else if (tk === 'class') payload.target_ref = ref || 'tank';
      else if (tk === 'holder_items') { if (!refs.length) { setErr('Pick at least one item.'); return; } payload.target_ref = JSON.stringify(refs); }
      else payload.target_ref = null;
      try { await props.onSubmit(payload); } catch (e2) { setErr(e2.message || 'Failed to save.'); }
    }

    function startNextField() {
      return h('label', { className: 'portal-check', style: { display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.5rem' } },
        h('input', { type: 'checkbox', checked: startNext, onChange: function (e) { setStartNext(e.target.checked); } }),
        'Wait a turn before it starts');
    }

    return h('form', { onSubmit: submit, className: 'portal-card', style: { marginTop: '0.4rem', background: 'var(--bg-darker)' } },
      err ? h('div', { className: 'portal-flash error' }, err) : null,

      // ── What it does ──────────────────────────────────────────────────────
      secHead('What it does'),
      fieldGrid([
        h('div', { className: 'portal-field', key: 'label' }, h('label', null, 'Name (optional)'),
          h('input', { type: 'text', value: label, placeholder: 'e.g. Vanguard’s Blessing', onChange: function (e) { setLabel(e.target.value); } })),
        h('div', { className: 'portal-field', key: 'effect' }, h('label', null, 'Effect'),
          h('select', { value: effect, onChange: function (e) { changeEffect(e.target.value); } },
            h('option', { value: '' }, '— pick an effect —'),
            EFFECT_GROUPS.map(function (g) {
              return h('optgroup', { key: g.label, label: g.label },
                g.options.map(function (o) { return h('option', { key: o.value, value: o.value }, o.label); }));
            })))
      ]),
      (hasEffect && EFFECT_HELP[effect]) ? h('p', { className: 'portal-field-help', style: { margin: '0.3rem 0 0' } }, EFFECT_HELP[effect]) : null,

      // ── Vulnerability (self-contained: how much, who, how long) ───────────
      isVuln ? secHead('How much extra') : null,
      isVuln ? fieldGrid([
        h('div', { className: 'portal-field', key: 'vkind' }, h('label', null, 'Kind'),
          h('select', { value: vKind, onChange: function (e) { setVKind(e.target.value); } },
            h('option', { value: 'flat' }, 'Flat extra damage'),
            h('option', { value: 'mult' }, 'Multiply damage (×)'))),
        vKind === 'flat'
          ? h('div', { className: 'portal-field', key: 'vflat' }, h('label', null, 'Extra damage (flat)'),
              h('input', { type: 'number', min: 0, value: val, onChange: function (e) { setVal(e.target.value); } }))
          : h('div', { className: 'portal-field', key: 'vmult' }, h('label', null, 'Times damage (×)'),
              h('input', { type: 'number', min: 1, step: '0.5', value: vMult, onChange: function (e) { setVMult(e.target.value); } }))
      ]) : null,
      isVuln ? secHead('Who it affects') : null,
      isVuln ? fieldGrid([
        h('div', { className: 'portal-field', key: 'vside' }, h('label', null, 'Side'),
          h('select', { value: vSide, onChange: function (e) { setVSide(e.target.value); } },
            h('option', { value: 'enemy' }, 'An enemy'),
            h('option', { value: 'player' }, 'A player'))),
        vSide === 'enemy'
          ? h('div', { className: 'portal-field', key: 'venemy' }, h('label', null, 'Which enemies'),
              h('select', { value: enemyScope, onChange: function (e) { setEnemyScope(e.target.value); } },
                h('option', { value: 'boss' }, 'One enemy (chosen on use)'),
                h('option', { value: 'some_bosses' }, 'Several enemies (chosen on use)'),
                h('option', { value: 'all_bosses' }, 'All enemies')))
          : h('div', { className: 'portal-field', key: 'vplayer' }, h('label', null, 'Which players'),
              h('select', { value: tk, onChange: function (e) { setTk(e.target.value); } },
                h('option', { value: 'party_member' }, 'A chosen player'),
                h('option', { value: 'party_members' }, 'Several chosen players'),
                h('option', { value: 'class' }, 'A class'),
                h('option', { value: 'group' }, 'Everyone'))),
        (isVuln && vSide === 'enemy' && enemyScope === 'some_bosses')
          ? h('div', { className: 'portal-field', key: 'vcap' }, h('label', null, 'Up to how many? (blank = no limit)'),
              h('input', { type: 'number', min: 1, value: enemyCap, placeholder: 'no limit', onChange: function (e) { setEnemyCap(e.target.value); } }))
          : null,
        (isVuln && vSide === 'player' && tk === 'class')
          ? h('div', { className: 'portal-field', key: 'vclass' }, h('label', null, 'Which class'),
              h('select', { value: ref || 'tank', onChange: function (e) { setRef(e.target.value); } },
                CLASS_ROLES.map(function (o) { return h('option', { key: o.value, value: o.value }, o.label); })))
          : null
      ]) : null,
      isVuln ? h('div', { className: 'portal-field', style: { maxWidth: '14rem', marginTop: '0.5rem' } }, h('label', null, 'Lasts how many turns?'),
        h('input', { type: 'number', min: 0, value: dur, placeholder: 'until removed', onChange: function (e) { setDur(e.target.value); } })) : null,
      isVuln ? startNextField() : null,

      // ── Stun (self-contained: who, how long; bosses may be immune) ────────
      isStun ? secHead('Who it affects') : null,
      isStun ? fieldGrid([
        h('div', { className: 'portal-field', key: 'sside' }, h('label', null, 'Side'),
          h('select', { value: vSide, onChange: function (e) { setVSide(e.target.value); } },
            h('option', { value: 'enemy' }, 'An enemy'),
            h('option', { value: 'player' }, 'A player'))),
        vSide === 'enemy'
          ? h('div', { className: 'portal-field', key: 'senemy' }, h('label', null, 'Which enemies'),
              h('select', { value: enemyScope, onChange: function (e) { setEnemyScope(e.target.value); } },
                h('option', { value: 'boss' }, 'One enemy (chosen on use)'),
                h('option', { value: 'some_bosses' }, 'Several enemies (chosen on use)'),
                h('option', { value: 'all_bosses' }, 'All enemies'),
                h('option', { value: 'minions' }, 'All minions (enemy adds)')))
          : h('div', { className: 'portal-field', key: 'splayer' }, h('label', null, 'Which players'),
              h('select', { value: tk, onChange: function (e) { setTk(e.target.value); } },
                h('option', { value: 'party_member' }, 'A chosen player'),
                h('option', { value: 'party_members' }, 'Several chosen players'),
                h('option', { value: 'class' }, 'A class'),
                h('option', { value: 'group' }, 'Everyone'))),
        (isStun && vSide === 'enemy' && enemyScope === 'some_bosses')
          ? h('div', { className: 'portal-field', key: 'scap' }, h('label', null, 'Up to how many? (blank = no limit)'),
              h('input', { type: 'number', min: 1, value: enemyCap, placeholder: 'no limit', onChange: function (e) { setEnemyCap(e.target.value); } }))
          : null,
        (isStun && vSide === 'player' && tk === 'class')
          ? h('div', { className: 'portal-field', key: 'sclass' }, h('label', null, 'Which class'),
              h('select', { value: ref || 'tank', onChange: function (e) { setRef(e.target.value); } },
                CLASS_ROLES.map(function (o) { return h('option', { key: o.value, value: o.value }, o.label); })))
          : null
      ]) : null,
      isStun ? h('p', { className: 'portal-field-help', style: { margin: '0.2rem 0 0' } }, 'Bosses marked stun-immune are skipped. Minions are enemy adds.') : null,
      isStun ? h('div', { className: 'portal-field', style: { maxWidth: '14rem', marginTop: '0.5rem' } }, h('label', null, 'Skips how many turns?'),
        h('input', { type: 'number', min: 1, value: dur, placeholder: '1', onChange: function (e) { setDur(e.target.value); } })) : null,

      showValue ? fieldGrid([
        h('div', { className: 'portal-field', key: 'value' }, h('label', null, valueLabel()),
          h('input', { type: 'number', value: val, onChange: function (e) { setVal(e.target.value); } }))
      ]) : null,
      effect === 'roll' ? h('div', { className: 'portal-field', style: { marginTop: '0.4rem' } }, h('label', null, 'Which rolls (tick all for every roll)'),
        h('div', { style: { display: 'flex', gap: '1rem', flexWrap: 'wrap', paddingTop: '0.2rem' } },
          ROLL_KINDS.map(function (o) {
            return h('label', { key: o.value, style: { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontWeight: 400 } },
              h('input', { type: 'checkbox', checked: rolls.indexOf(o.value) !== -1, onChange: function () { toggleRoll(o.value); } }),
              o.label);
          }))) : null,
      effect === 'skill' ? fieldGrid([
        h('div', { className: 'portal-field', key: 'skill' }, h('label', null, 'Which skill'),
          h('select', { value: skillPick, onChange: function (e) { setSkillPick(e.target.value); } },
            SKILLS.map(function (s) { return h('option', { key: s.value, value: s.value }, s.label); })))
      ]) : null,
      isSummon ? secHead('The minions') : null,
      isSummon ? fieldGrid([
        h('div', { className: 'portal-field', key: 'sname' }, h('label', null, 'Minion name'),
          h('input', { type: 'text', value: sName, placeholder: 'e.g. Undead Soldier', onChange: function (e) { setSName(e.target.value); } })),
        h('div', { className: 'portal-field', key: 'scount' }, h('label', null, 'How many'),
          h('input', { type: 'number', min: 1, value: sCount, onChange: function (e) { setSCount(e.target.value); } }))
      ]) : null,
      isSummon ? fieldGrid([
        h('div', { className: 'portal-field', key: 'shp' }, h('label', null, 'HP each'),
          h('input', { type: 'number', min: 1, value: sHp, onChange: function (e) { setSHp(e.target.value); } })),
        h('div', { className: 'portal-field', key: 'satkmode' }, h('label', null, 'Attack style'),
          h('select', { value: sMode, onChange: function (e) { setSMode(e.target.value); } },
            h('option', { value: 'fixed' }, 'Fixed damage'),
            h('option', { value: 'd20' }, 'D20 roll'))),
        sMode === 'fixed' ? h('div', { className: 'portal-field', key: 'satk' }, h('label', null, 'Attack (0 = no attack)'),
          h('input', { type: 'number', min: 0, value: sAtk, onChange: function (e) { setSAtk(e.target.value); } })) : null
      ]) : null,
      (isSummon && sMode === 'd20') ? h('p', { className: 'portal-field-help', style: { margin: '0.1rem 0 0' } }, 'The summoner rolls a d20 on attack; damage uses the normal damage tiers, no bonuses.') : null,
      isSummon ? fieldGrid([
        h('div', { className: 'portal-field', key: 'sscope' }, h('label', null, 'Attack targets'),
          h('select', { value: sScope, onChange: function (e) { setSScope(e.target.value); } },
            h('option', { value: 'boss' }, 'One enemy'),
            h('option', { value: 'some_bosses' }, 'Several enemies'),
            h('option', { value: 'all_bosses' }, 'All enemies'))),
        sScope === 'some_bosses' ? h('div', { className: 'portal-field', key: 'scap' }, h('label', null, 'Up to how many? (blank = no limit)'),
          h('input', { type: 'number', min: 1, value: sCap, placeholder: 'no limit', onChange: function (e) { setSCap(e.target.value); } })) : null
      ]) : null,
      isSummon ? h('div', { className: 'portal-field', style: { maxWidth: '12rem', marginTop: '0.5rem' } }, h('label', null, 'Lasts how many turns?'),
        h('input', { type: 'number', min: 0, value: sTurns, placeholder: 'until they die', onChange: function (e) { setSTurns(e.target.value); } })) : null,

      // ── Who it affects ────────────────────────────────────────────────────
      isStrike ? secHead('Who it affects') : null,
      isStrike ? fieldGrid([
        h('div', { className: 'portal-field', key: 'enemies' }, h('label', null, 'Enemies'),
          h('select', { value: enemyScope, onChange: function (e) { setEnemyScope(e.target.value); } },
            h('option', { value: 'boss' }, 'One enemy (chosen on use)'),
            h('option', { value: 'some_bosses' }, 'Several enemies (chosen on use)'),
            h('option', { value: 'all_bosses' }, 'All enemies'))),
        enemyScope === 'some_bosses' ? h('div', { className: 'portal-field', key: 'cap' }, h('label', null, 'Up to how many? (blank = no limit)'),
          h('input', { type: 'number', min: 1, value: enemyCap, placeholder: 'no limit', onChange: function (e) { setEnemyCap(e.target.value); } })) : null
      ]) : null,
      showTarget ? secHead('Who it affects') : null,
      showTarget ? fieldGrid([
        h('div', { className: 'portal-field', key: 'tk' }, h('label', null, 'Target'),
          h('select', { value: tk, onChange: function (e) { setTk(e.target.value); setRef(''); } },
            TARGET_OPTIONS.map(function (t) { return h('option', { key: t.value, value: t.value }, t.label); }))),
        tk === 'class' ? h('div', { className: 'portal-field', key: 'cls' }, h('label', null, 'Which class'),
          h('select', { value: ref || 'tank', onChange: function (e) { setRef(e.target.value); } },
            CLASS_ROLES.map(function (o) { return h('option', { key: o.value, value: o.value }, o.label); }))) : null
      ]) : null,
      (showTarget && tk === 'party_members') ? h('p', { className: 'portal-field-help', style: { margin: '0.3rem 0 0' } }, 'The player picks the allies when it’s used.') : null,
      (showTarget && tk === 'holder_items') ? h('div', { className: 'portal-field', style: { marginTop: '0.4rem' } }, h('label', null, 'Whose holders (tick each item)'),
        (props.catalogue || []).length
          ? h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '0.6rem 1rem', paddingTop: '0.2rem' } },
              (props.catalogue || []).map(function (c) {
                return h('label', { key: c.id, style: { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontWeight: 400 } },
                  h('input', { type: 'checkbox', checked: refs.indexOf(c.id) !== -1, onChange: function () { toggleRef(c.id); } }),
                  c.name);
              }))
          : h('p', { className: 'portal-field-help', style: { margin: 0 } }, 'No other items yet.')) : null,

      // ── How it works ──────────────────────────────────────────────────────
      (showTiming || isSummon) ? secHead('How it works') : null,
      showTiming ? fieldGrid([
        h('div', { className: 'portal-field', key: 'timing' }, h('label', null, 'Timing'),
          h('select', { value: timing, onChange: function (e) { setTiming(e.target.value); } },
            timingOptions(effect).map(function (o) { return h('option', { key: o.value, value: o.value }, o.label); })))
      ]) : null,
      showUses ? h('div', { style: { marginTop: '0.5rem' } },
        h('label', { style: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 400 } },
          h('input', { type: 'checkbox', checked: limitUses, onChange: function (e) { setLimitUses(e.target.checked); } }),
          'Limit how many times per session'),
        limitUses ? h('div', { className: 'portal-field', style: { maxWidth: '9rem', marginTop: '0.3rem' } }, h('label', null, 'Times per session'),
          h('input', { type: 'number', min: 1, value: uses, onChange: function (e) { setUses(e.target.value); } })) : null) : null,
      showTurns ? h('div', { className: 'portal-field', style: { maxWidth: '12rem', marginTop: '0.5rem' } }, h('label', null, 'How many turns?'),
        h('input', { type: 'number', min: 0, value: dur, placeholder: 'until removed', onChange: function (e) { setDur(e.target.value); } }),
        h('p', { className: 'portal-field-help', style: { margin: '0.25rem 0 0' } }, 'Leave blank to last until the end of the session.')) : null,

      // ── Advanced Settings (collapsible) ───────────────────────────────────
      hasEffect ? h('button', { type: 'button', onClick: function () { setAdvOpen(!advOpen); }, 'aria-expanded': advOpen ? 'true' : 'false',
        style: { display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', margin: '0.7rem 0 0.35rem' } },
        h('span', { 'aria-hidden': 'true', style: { fontSize: '0.9em' } }, advOpen ? '▾' : '▸'),
        'Advanced Settings') : null,
      (hasEffect && advOpen) ? h('div', { className: 'portal-field', style: { maxWidth: '20rem' } }, h('label', null, 'Only active when…'),
        h('select', { value: condKind, onChange: function (e) { setCondKind(e.target.value); } },
          h('option', { value: '' }, 'Always (no condition)'),
          h('option', { value: 'hp' }, 'The holder’s HP is in range'),
          h('option', { value: 'scene' }, 'The scene matches (location / time)'))) : null,

      (hasEffect && advOpen && condKind === 'hp') ? h('div', { style: { marginTop: '0.4rem' } },
        fieldGrid([
          h('div', { className: 'portal-field', key: 'csub' }, h('label', null, 'Whose HP'),
            h('select', { value: condSubject, onChange: function (e) { setCondSubject(e.target.value); } },
              h('option', { value: 'holder' }, 'The holder of this item'),
              h('option', { value: 'item_holder' }, 'The holder of another item'))),
          condSubject === 'item_holder' ? h('div', { className: 'portal-field', key: 'citem' }, h('label', null, 'Which item'),
            h('select', { value: condItem, onChange: function (e) { setCondItem(e.target.value); } },
              h('option', { value: '' }, '— pick an item —'),
              (props.catalogue || []).map(function (c) { return h('option', { key: c.id, value: c.id }, c.name); }))) : null
        ]),
        h('div', { style: { display: 'flex', gap: '0.4rem', alignItems: 'flex-end', flexWrap: 'wrap', marginTop: '0.35rem' } },
          h('div', { className: 'portal-field', style: { flex: '0 0 auto' } }, h('label', null, 'Turns on when HP is'),
            h('select', { value: startOp, onChange: function (e) { setStartOp(e.target.value); } },
              HP_OPS.map(function (o) { return h('option', { key: o.value, value: o.value }, o.label); }))),
          h('div', { className: 'portal-field', style: { maxWidth: '6rem' } }, h('label', null, 'Amount'),
            h('input', { type: 'number', min: 0, value: startVal, onChange: function (e) { setStartVal(e.target.value); } })),
          h('div', { className: 'portal-field', style: { maxWidth: '6rem' } }, h('label', null, 'Unit'),
            h('select', { value: startUnit, onChange: function (e) { setStartUnit(e.target.value); } },
              h('option', { value: 'pct' }, '%'),
              h('option', { value: 'flat' }, 'HP')))),
        h('label', { className: 'portal-check', style: { display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.5rem' } },
          h('input', { type: 'checkbox', checked: useStop, onChange: function (e) { setUseStop(e.target.checked); } }),
          'Keep it on until a separate turn-off point'),
        useStop ? h('div', { style: { display: 'flex', gap: '0.4rem', alignItems: 'flex-end', flexWrap: 'wrap', marginTop: '0.3rem' } },
          h('div', { className: 'portal-field', style: { flex: '0 0 auto' } }, h('label', null, 'Turns off when HP is'),
            h('select', { value: stopOp, onChange: function (e) { setStopOp(e.target.value); } },
              HP_OPS.map(function (o) { return h('option', { key: o.value, value: o.value }, o.label); }))),
          h('div', { className: 'portal-field', style: { maxWidth: '6rem' } }, h('label', null, 'Amount'),
            h('input', { type: 'number', min: 0, value: stopVal, onChange: function (e) { setStopVal(e.target.value); } })),
          h('div', { className: 'portal-field', style: { maxWidth: '6rem' } }, h('label', null, 'Unit'),
            h('select', { value: stopUnit, onChange: function (e) { setStopUnit(e.target.value); } },
              h('option', { value: 'pct' }, '%'),
              h('option', { value: 'flat' }, 'HP')))) : null
      ) : null,

      (hasEffect && advOpen && condKind === 'scene') ? h('div', { style: { marginTop: '0.4rem' } },
        h('div', { className: 'portal-field' }, h('label', null, 'In these locations (any)'),
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '0.4rem 0.9rem', paddingTop: '0.2rem' } },
            RP_LOCATIONS.map(function (loc) {
              return h('label', { key: loc, style: { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontWeight: 400 } },
                h('input', { type: 'checkbox', checked: condLocs.indexOf(loc) !== -1, onChange: function () { toggleLoc(loc); } }), loc);
            }))),
        h('div', { className: 'portal-field', style: { marginTop: '0.4rem' } }, h('label', null, 'And these times of day (any)'),
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '0.4rem 0.9rem', paddingTop: '0.2rem' } },
            RP_TIMES.map(function (tod) {
              return h('label', { key: tod, style: { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontWeight: 400 } },
                h('input', { type: 'checkbox', checked: condTimes.indexOf(tod) !== -1, onChange: function () { toggleTime(tod); } }), tod);
            }))),
      ) : null,

      h('div', { style: { display: 'flex', gap: '0.5rem', marginTop: '0.8rem' } },
        h('button', { type: 'submit', className: 'portal-btn is-small' }, props.initial ? 'Save' : 'Add'),
        h('button', { type: 'button', className: 'portal-btn is-small is-ghost', onClick: props.onCancel }, 'Cancel')));
  }

  // Plain-language summary of a modifier (matches the player-facing wording in
  // the roll calculator) — e.g. "When activated, +8 bonus attack damage to the
  // holder, this turn. · 2 uses/session".
  var CLASS_PLURAL = { tank: 'Tanks', dps: 'DPS', healer: 'Healers' };
  // "+2 to all rolls" / "+1 to attack & defense rolls" for a roll_bonus modifier.
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
  function modifierSummary(m, catalogue) {
    var cnd = conditionPhrase(m.conditions); var cndSuffix = cnd ? ' · ' + cnd : '';
    if (m.type === 'none') return (m.label ? m.label : 'Narrative effect (shown from the description).') + cndSuffix;
    if (m.type === 'summon') {
      var s = (m.summon && typeof m.summon === 'object') ? m.summon : (function () { try { return JSON.parse(m.summon) || {}; } catch (_) { return {}; } })();
      var su = (m.uses_per_session > 0) ? ' · ' + m.uses_per_session + ' use' + (m.uses_per_session === 1 ? '' : 's') + '/session' : '';
      var atk = s.attack_mode === 'd20' ? 'D20 atk' : (s.attack || 0) + ' atk';
      return 'Summons ' + (s.count || 1) + ' × ' + (s.name || 'Minion') + ' (' + (s.hp || 1) + ' HP, ' + atk + (s.turns ? ', ' + s.turns + ' turns' : '') + ').' + su + cndSuffix;
    }
    var t;
    switch (m.target_kind) {
      case 'self': t = 'the holder'; break;
      case 'group': t = 'the whole party'; break;
      case 'class': t = 'all ' + (CLASS_PLURAL[m.target_ref] || String(m.target_ref || '').toUpperCase()); break;
      case 'holder_item': { var it = (catalogue || []).filter(function (c) { return c.id === m.target_ref; })[0]; t = 'whoever holds ' + (it ? it.name : 'the item'); break; }
      case 'holder_items': { var ids = []; try { ids = JSON.parse(m.target_ref) || []; } catch (_) { ids = m.target_ref ? [m.target_ref] : []; } var names = ids.map(function (id) { var c = (catalogue || []).filter(function (x) { return x.id === id; })[0]; return c ? c.name : null; }).filter(Boolean); t = names.length ? 'holders of ' + names.join(', ') : 'item holders'; break; }
      case 'party_member': t = 'a chosen ally'; break;
      case 'party_members': t = 'several chosen allies'; break;
      case 'boss': t = 'a chosen enemy'; break;
      case 'some_bosses': t = 'several chosen enemies' + (m.target_ref ? ' (up to ' + m.target_ref + ')' : ''); break;
      case 'all_bosses': t = 'all enemies'; break;
      case 'minions': t = 'all minions'; break;
      default: t = '';
    }
    var when = m.mode === 'always' ? 'Always' : m.mode === 'toggle' ? 'While turned on' : 'When activated';
    // A heal over time flagged start_next_turn heals from next turn, so 1 turn isn't "this turn".
    var hot1 = m.type === 'heal' && m.start_next_turn && m.duration_turns === 1;
    var dur = hot1 ? ', for 1 turn' : m.duration_turns === 1 ? ', this turn' : m.duration_turns > 1 ? ', for ' + m.duration_turns + ' turns' : '';
    var uses = (m.mode === 'activated' && m.uses_per_session > 0) ? ' · ' + m.uses_per_session + ' use' + (m.uses_per_session === 1 ? '' : 's') + '/session' : '';
    var core = m.type === 'roll_bonus' ? rollsPhrase(m.rolls, m.value)
      : m.type === 'skill_roll' ? ((m.value >= 0 ? '+' : '') + m.value + ' to ' + skillLabel(m.skill) + ' checks')
      : m.type === 'vulnerability' ? ('applies ' + ([m.value > 0 ? '+' + m.value : null, (m.mult != null && m.mult > 1) ? '×' + m.mult : null].filter(Boolean).join(' & ') + ' ').replace(/^ $/, '') + 'vulnerability')
      : m.type === 'stun' ? 'stuns'
      : typePhrase(m.type, m.value);
    return when + ', ' + core + ' to ' + t + dur + '.' + uses + cndSuffix;
  }

  // ── Boss library (officer/admin) ──────────────────────────────────────────
  // Bosses are reusable library entries; DMs spawn instances into a campaign
  // from the calculator (or staff pre-stage them in the campaign panel below).
  // Skills are single-level effects: damage (instant), dot (per turn), none.
  // Tier ladder (biggest → smallest). "Minion" here means an enemy add, not a
  // player summon. Boss tier is stun-immune by default; the rest are stunnable.
  // The stun-immune box just seeds from the tier and can be overridden per boss.
  var BOSS_TIERS = [
    { value: 'boss', label: 'Boss' },
    { value: 'elite', label: 'Elite' },
    { value: 'monster', label: 'Monster' },
    { value: 'minion', label: 'Minion' }
  ];
  function tierStunImmuneDefault(tier) { return tier === 'boss'; }
  function tierLabel(v) { for (var i = 0; i < BOSS_TIERS.length; i++) if (BOSS_TIERS[i].value === v) return BOSS_TIERS[i].label; return 'Monster'; }
  // Boss effect picker, laid out like the item form: pick what it does, then
  // who it hits, then how it plays out. Damage and Heal pick their timing on a
  // separate line (once vs. each turn), same as items.
  var BOSS_EFFECT_GROUPS = [
    { label: 'Attack Players', options: [
      { value: 'damage', label: 'Damage' },
      { value: 'stun', label: 'Stun' }
    ] },
    { label: 'Buff Itself', options: [
      { value: 'heal', label: 'Heal' },
      { value: 'damage_reduction', label: 'Mitigate Damage' }
    ] },
    { label: 'Narrative', options: [
      { value: 'none', label: 'Narrative only' }
    ] }
  ];
  var BOSS_EFFECT_HELP = {
    damage: 'Hits players for damage.',
    stun: 'Targets skip their next turn.',
    heal: 'Restores the boss’s HP, up to its max.',
    damage_reduction: 'Lowers damage the boss takes from each hit.',
    none: ''
  };

  function bossTargetPhrase(tk, ref) {
    switch (tk) {
      case 'party_member': return 'a chosen player';
      case 'party_members': return 'chosen players';
      case 'class': return 'all ' + (CLASS_PLURAL[ref] || String(ref || '').toUpperCase());
      case 'group': return 'the whole party';
    }
    return 'a target';
  }
  // Plain-language boss-effect wording, mirroring the item modifier summary.
  function bossEffectSummary(e) {
    var uses = e.uses_per_session > 0 ? ' · ' + e.uses_per_session + ' use' + (e.uses_per_session === 1 ? '' : 's') + '/session' : '';
    var span = e.duration_turns > 0 ? ', for ' + e.duration_turns + ' turns' : ', until removed';
    if (e.type === 'none') return 'Narrative effect.' + uses;
    if (e.type === 'heal') return (e.duration_turns === 1 && !e.start_next_turn ? 'Heals itself for ' + e.value + ' HP' : 'Heals itself for ' + e.value + ' HP per turn' + span) + '.' + uses;
    if (e.type === 'damage_reduction') return 'Takes ' + e.value + ' less damage per hit' + span + '.' + uses;
    var to = bossTargetPhrase(e.target_kind, e.target_ref);
    if (e.type === 'damage') return 'Deals ' + e.value + ' damage to ' + to + '.' + uses;
    if (e.type === 'stun') { var n = e.duration_turns > 0 ? e.duration_turns : 1; return 'Stuns ' + to + ' for ' + n + ' turn' + (n === 1 ? '' : 's') + '.' + uses; }
    return e.value + ' damage per turn to ' + to + span + '.' + uses;
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
      h('div', { className: 'portal-field' }, h('label', null, 'Description'),
        h('span', { className: 'portal-field-help', style: { display: 'block', margin: '0.1rem 0 0.35rem', lineHeight: 1.2 } }, 'Visible to players on toggle'),
        h('textarea', { rows: 3, value: desc, onChange: function (e) { setDesc(e.target.value); } })),
      h('div', { style: { display: 'flex', gap: '0.5rem', marginTop: '0.4rem' } },
        h('button', { type: 'submit', className: 'portal-btn is-small' }, props.initial ? 'Save skill' : 'Add skill'),
        h('button', { type: 'button', className: 'portal-btn is-small is-ghost', onClick: props.onCancel }, 'Cancel')),
      h('p', { className: 'portal-field-help', style: { margin: '0.4rem 0 0' } },
        'Add ', h('strong', null, 'Skill Effects'), ' after clicking ', h('strong', null, 'Add Skill'), '.'));
  }

  function BossEffectForm(props) {
    var x = props.initial || {};
    // Stored type → form effect + timing. dot is Damage "each turn"; a heal
    // with duration 1 is "once", anything else heals each turn.
    var initEffect = !props.initial ? '' : (x.type === 'dot' ? 'damage' : (x.type || 'damage'));
    var initTiming = x.type === 'dot' ? 'over' : (x.type === 'heal' && (x.duration_turns !== 1 || x.start_next_turn) ? 'over' : 'once');
    var effectState = useState(initEffect); var effect = effectState[0], setEffect = effectState[1];
    var timingState = useState(initTiming); var timing = timingState[0], setTiming = timingState[1];
    var valState = useState(String(x.value != null ? x.value : 2)); var val = valState[0], setVal = valState[1];
    var tkState = useState(x.target_kind && x.target_kind !== 'self' ? x.target_kind : 'party_member'); var tk = tkState[0], setTk = tkState[1];
    var refState = useState(x.target_ref || 'tank'); var ref = refState[0], setRef = refState[1];
    var durState = useState(x.duration_turns > (x.type === 'heal' && !x.start_next_turn ? 1 : 0) ? String(x.duration_turns) : ''); var dur = durState[0], setDur = durState[1];
    var limitUsesState = useState((x.uses_per_session || 0) > 0); var limitUses = limitUsesState[0], setLimitUses = limitUsesState[1];
    var usesState = useState(String(x.uses_per_session > 0 ? x.uses_per_session : 1)); var uses = usesState[0], setUses = usesState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];

    var isDamage = effect === 'damage', isStun = effect === 'stun', isHeal = effect === 'heal', isMitigate = effect === 'damage_reduction';
    var isOver = timing === 'over';
    var hitsPlayers = isDamage || isStun;
    var showValue = isDamage || isHeal || isMitigate;
    var showTurns = ((isDamage || isHeal) && isOver) || isMitigate;

    function changeEffect(next) { setEffect(next); if (next !== effect) setTiming('once'); }
    function valueLabel() {
      if (isDamage) return isOver ? 'Damage each turn' : 'Damage';
      if (isHeal) return isOver ? 'HP each turn' : 'HP restored';
      return 'Damage reduced';
    }
    function timingOpts() {
      return isDamage
        ? [{ value: 'once', label: 'Hit once' }, { value: 'over', label: 'Damage each turn for a while' }]
        : [{ value: 'once', label: 'Heal once' }, { value: 'over', label: 'Heal each turn for a while' }];
    }

    async function submit(e) {
      e.preventDefault();
      if (!effect) { setErr('Pick an effect.'); return; }
      var turns = parseInt(dur, 10) || 0;   // blank / 0 = until removed
      var payload = {
        type: isDamage ? (isOver ? 'dot' : 'damage') : effect,
        value: showValue ? (parseInt(val, 10) || 0) : 0,
        target_kind: hitsPlayers ? tk : 'self',
        target_ref: hitsPlayers && tk === 'class' ? ref : null,
        duration_turns: isStun ? Math.max(1, turns || 1) : (isHeal && !isOver ? 1 : (showTurns ? turns : 0)),
        uses_per_session: limitUses ? Math.max(1, parseInt(uses, 10) || 1) : 0,
        start_next_turn: isHeal && isOver
      };
      try { await props.onSubmit(payload); } catch (e2) { setErr(e2.message || 'Failed to save.'); }
    }
    return h('form', { onSubmit: submit, className: 'portal-card', style: { marginTop: '0.4rem', background: 'var(--bg-darker)' } },
      err ? h('div', { className: 'portal-flash error' }, err) : null,

      secHead('What it does'),
      fieldGrid([
        h('div', { className: 'portal-field', key: 'effect' }, h('label', null, 'Effect'),
          h('select', { value: effect, onChange: function (e) { changeEffect(e.target.value); } },
            h('option', { value: '' }, '— pick an effect —'),
            BOSS_EFFECT_GROUPS.map(function (g) {
              return h('optgroup', { key: g.label, label: g.label },
                g.options.map(function (o) { return h('option', { key: o.value, value: o.value }, o.label); }));
            }))),
        showValue ? h('div', { className: 'portal-field', key: 'value' }, h('label', null, valueLabel()),
          h('input', { type: 'number', min: 0, value: val, onChange: function (e) { setVal(e.target.value); } })) : null
      ]),
      (effect && BOSS_EFFECT_HELP[effect]) ? h('p', { className: 'portal-field-help', style: { margin: '0.3rem 0 0' } }, BOSS_EFFECT_HELP[effect]) : null,

      hitsPlayers ? secHead('Who it affects') : null,
      hitsPlayers ? fieldGrid([
        h('div', { className: 'portal-field', key: 'tk' }, h('label', null, 'Which players'),
          h('select', { value: tk, onChange: function (e) { setTk(e.target.value); } },
            h('option', { value: 'party_member' }, 'A chosen player'),
            h('option', { value: 'party_members' }, 'Several chosen players'),
            h('option', { value: 'class' }, 'A class'),
            h('option', { value: 'group' }, 'Everyone'))),
        tk === 'class' ? h('div', { className: 'portal-field', key: 'cls' }, h('label', null, 'Which class'),
          h('select', { value: ref || 'tank', onChange: function (e) { setRef(e.target.value); } },
            CLASS_ROLES.map(function (o) { return h('option', { key: o.value, value: o.value }, o.label); }))) : null
      ]) : null,

      (effect && effect !== 'none') ? secHead('How it works') : null,
      (isDamage || isHeal) ? fieldGrid([
        h('div', { className: 'portal-field', key: 'timing' }, h('label', null, 'Timing'),
          h('select', { value: timing, onChange: function (e) { setTiming(e.target.value); } },
            timingOpts().map(function (o) { return h('option', { key: o.value, value: o.value }, o.label); })))
      ]) : null,
      isStun ? h('div', { className: 'portal-field', style: { maxWidth: '14rem', marginTop: '0.5rem' } }, h('label', null, 'Skips how many turns?'),
        h('input', { type: 'number', min: 1, value: dur, placeholder: '1', onChange: function (e) { setDur(e.target.value); } })) : null,
      showTurns ? h('div', { className: 'portal-field', style: { maxWidth: '12rem', marginTop: '0.5rem' } }, h('label', null, 'How many turns?'),
        h('input', { type: 'number', min: 0, value: dur, placeholder: 'until removed', onChange: function (e) { setDur(e.target.value); } }),
        h('p', { className: 'portal-field-help', style: { margin: '0.25rem 0 0' } }, 'Leave blank to last until the end of the session.')) : null,
      effect ? h('div', { style: { marginTop: '0.5rem' } },
        h('label', { style: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 400 } },
          h('input', { type: 'checkbox', checked: limitUses, onChange: function (e) { setLimitUses(e.target.checked); } }),
          'Limit how many times per session'),
        limitUses ? h('div', { className: 'portal-field', style: { maxWidth: '9rem', marginTop: '0.3rem' } }, h('label', null, 'Times per session'),
          h('input', { type: 'number', min: 1, value: uses, onChange: function (e) { setUses(e.target.value); } })) : null) : null,

      h('div', { style: { display: 'flex', gap: '0.5rem', marginTop: '0.6rem' } },
        h('button', { type: 'submit', className: 'portal-btn is-small' }, props.initial ? 'Save effect' : 'Add effect'),
        h('button', { type: 'button', className: 'portal-btn is-small is-ghost', onClick: props.onCancel }, 'Cancel')));
  }

  function BossForm(props) {
    var b = props.initial || {};
    var nameState = useState(b.name || ''); var name = nameState[0], setName = nameState[1];
    var descState = useState(b.description || ''); var desc = descState[0], setDesc = descState[1];
    var imageState = useState(b.image_url || ''); var image = imageState[0], setImage = imageState[1];
    var hpState = useState(String(b.max_hp != null ? b.max_hp : 30)); var maxHp = hpState[0], setMaxHp = hpState[1];
    // Tier defaults to Monster (the neutral general tier) for entries saved before
    // tiers existed. stun_immune seeds from the tier unless it was set explicitly.
    var initTier = BOSS_TIERS.some(function (t) { return t.value === b.boss_tier; }) ? b.boss_tier : 'monster';
    var tierState = useState(initTier); var tier = tierState[0], setTier = tierState[1];
    var initImmune = b.stun_immune != null ? !!b.stun_immune : tierStunImmuneDefault(initTier);
    var immuneState = useState(initImmune); var stunImmune = immuneState[0], setStunImmune = immuneState[1];
    // Once the DM toggles the box themselves, changing the tier won't stomp it.
    var immuneTouchedState = useState(b.stun_immune != null); var immuneTouched = immuneTouchedState[0], setImmuneTouched = immuneTouchedState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];

    function changeTier(v) { setTier(v); if (!immuneTouched) setStunImmune(tierStunImmuneDefault(v)); }

    async function submit(e) {
      e.preventDefault();
      if (!name.trim()) { setErr('Name is required.'); return; }
      var hp = parseInt(maxHp, 10);
      if (!hp || hp < 1) { setErr('Max HP must be a positive number.'); return; }
      try { await props.onSubmit({ name: name.trim(), description: desc.trim() || null, image_url: image.trim() || null, max_hp: hp, boss_tier: tier, stun_immune: !!stunImmune }); }
      catch (e2) { setErr(e2.message || 'Failed to save.'); }
    }
    return h('form', { onSubmit: submit, className: props.inModal ? '' : 'portal-card', style: props.inModal ? {} : { marginBottom: '1rem' } },
      props.inModal ? null : h('h3', { style: { marginTop: 0 } }, props.initial ? 'Edit boss' : 'New boss'),
      err ? h('div', { className: 'portal-flash error' }, err) : null,
      h('div', { className: 'portal-field' }, h('label', null, 'Name *'),
        h('input', { type: 'text', value: name, onChange: function (e) { setName(e.target.value); } })),
      // Tier + stun immunity share one row.
      h('div', { className: 'portal-field' }, h('label', null, 'Tier'),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' } },
          h('select', { style: { flex: '1 1 12rem' }, value: tier, onChange: function (e) { changeTier(e.target.value); } },
            BOSS_TIERS.map(function (t) { return h('option', { key: t.value, value: t.value }, t.label); })),
          h('label', { className: 'portal-check', style: { display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0, whiteSpace: 'nowrap' } },
            h('input', { type: 'checkbox', checked: stunImmune, onChange: function (e) { setImmuneTouched(true); setStunImmune(e.target.checked); } }),
            'Immune to stun'))),
      h('div', { className: 'portal-field' }, h('label', null, 'Health *'),
        h('input', { type: 'number', min: 1, value: maxHp, onChange: function (e) { setMaxHp(e.target.value); } })),
      h('div', { className: 'portal-field' }, h('label', null, 'Notes'),
        h('textarea', { rows: 3, value: desc, onChange: function (e) { setDesc(e.target.value); } })),
      (window.PVAdminQuestUtils && PVAdminQuestUtils.ImageField)
        ? h(PVAdminQuestUtils.ImageField, {
            value: image,
            onChange: function (v) { setImage(v); },
            uploadPath: '/venues/images',
            extraFields: { venue_name: name.trim() || 'boss' },
            resize: { square: true, maxSize: 600 }
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
      h('div', { className: 'rp-card-media sketch-wash' },
        (b.image_url && !imgErr)
          ? h('img', { src: b.image_url, alt: '', onError: function () { setImgErr(true); } })
          : h('span', { className: 'rp-card-sig' }, (b.name || '').toLowerCase()),
        h('span', { className: 'contrast-border-half', 'aria-hidden': 'true' })),
      h('h3', { className: 'rp-catalogue-name' }, b.name),
      h('p', { className: 'rp-catalogue-desc' }, tierLabel(b.boss_tier) + ' · ' + b.max_hp + ' HP · ' + (b.abilities || []).length + ' skill' + ((b.abilities || []).length === 1 ? '' : 's') + ((b.stun_immune != null ? b.stun_immune : tierStunImmuneDefault(b.boss_tier || 'monster')) ? ' · stun-immune' : '')),
      b.description ? h('p', { className: 'rp-catalogue-desc' }, b.description) : null,
      h('div', { className: 'rp-catalogue-actions' },
        h('button', { type: 'button', className: 'portal-btn is-small', onClick: function () { props.onSkills(b); } }, 'Skills'),
        h('button', { type: 'button', className: 'portal-btn is-small is-ghost', style: { padding: '0.25rem 0.45rem', lineHeight: 1 }, title: 'Edit boss', 'aria-label': 'Edit boss', onClick: function () { props.onEdit(b); } }, mi('edit', 'only')),
        h('button', { type: 'button', className: 'portal-btn is-small is-danger', style: { padding: '0.25rem 0.45rem', lineHeight: 1 }, title: 'Delete boss', 'aria-label': 'Delete boss', onClick: function () { props.onDelete(b); } }, mi('delete', 'only'))));
  }

  // Boss fields only — skills live in their own modal (BossSkillsModal).
  function BossEditorModal(props) {
    var b = props.boss;
    var savedState = useState(''); var saved = savedState[0], setSaved = savedState[1];
    async function saveBoss(payload) {
      await PVRollAPI.request('PATCH', '/rp/boss-library/' + b.id, payload);
      setSaved('Boss details saved.'); setTimeout(function () { setSaved(''); }, 2500);
      if (props.onChanged) await props.onChanged();
    }
    return h(window.PVAdminModal, { title: b.name, size: 'lg', onClose: props.onClose },
      saved ? h('div', { className: 'portal-flash success' }, saved) : null,
      h(BossForm, { initial: b, inModal: true, onSubmit: saveBoss, onCancel: props.onClose }));
  }

  // Boss skills (abilities + their effects), split out of the boss-fields editor.
  function BossSkillsModal(props) {
    var b = props.boss;
    var abFormState = useState(null); var abForm = abFormState[0], setAbForm = abFormState[1]; // null | {ability?}
    var fxFormState = useState(null); var fxForm = fxFormState[0], setFxForm = fxFormState[1]; // null | {abilityId, effect?}
    var errState = useState(''); var err = errState[0], setErr = errState[1];

    async function submitAbility(payload) {
      if (abForm && abForm.ability) await PVRollAPI.request('PATCH', '/rp/boss-abilities/' + abForm.ability.id, payload);
      else await PVRollAPI.request('POST', '/rp/boss-library/' + b.id + '/abilities', payload);
      setAbForm(null); if (props.onChanged) await props.onChanged();
    }
    async function deleteAbility(a) {
      if (!confirm('Delete skill “' + a.name + '”?')) return;
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
    // Persist a new effect order by stamping each effect's sort with its index.
    async function reorderEffects(orderedIds) {
      try { await Promise.all(orderedIds.map(function (id, i) { return PVRollAPI.request('PATCH', '/rp/boss-ability-effects/' + id, { sort: i }); })); }
      catch (e) { setErr(e.message); }
      if (props.onChanged) await props.onChanged();
    }

    return h(window.PVAdminModal, { title: 'Skills — ' + b.name, size: 'lg', onClose: props.onClose },
      h('div', null,
        err ? h('div', { className: 'portal-flash error' }, err) : null,
        abForm ? h(BossAbilityForm, { initial: abForm.ability, onSubmit: submitAbility, onCancel: function () { setAbForm(null); } })
          : h('button', { type: 'button', className: 'portal-btn is-small', style: { marginBottom: '0.6rem' }, onClick: function () { setAbForm({}); } }, '+ Add skill'),
        !(b.abilities || []).length ? null :
          (b.abilities || []).map(function (a) {
            return h('div', { key: a.id, style: { padding: '0.4rem 0', borderTop: '1px solid var(--border-color)' } },
              h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' } },
                h('div', null,
                  h('strong', null, a.name),
                  a.description ? h('div', { style: { fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.15rem', whiteSpace: 'pre-wrap' } }, a.description) : null),
                h('div', { style: { display: 'flex', gap: '0.3rem', flexShrink: 0 } },
                  h('button', { type: 'button', className: 'portal-btn is-small is-ghost', onClick: function () { setAbForm({ ability: a }); } }, 'Edit'),
                  h('button', { type: 'button', className: 'portal-btn is-small is-danger', onClick: function () { deleteAbility(a); } }, '✕'))),
              h(DragReorder, { items: a.effects || [], onReorder: reorderEffects, renderRow: function (x) {
                return h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0.5rem', background: 'var(--bg-card-light)', border: '1px solid var(--border-color)', borderRadius: '0.35rem', marginTop: '0.3rem' } },
                  h('span', { style: { fontSize: '0.8rem' } }, bossEffectSummary(x)),
                  h('span', { style: { display: 'flex', gap: '0.3rem', flexShrink: 0 } },
                    h('button', { type: 'button', className: 'portal-btn is-small is-ghost', style: { padding: '0.12rem 0.4rem', fontSize: '0.72rem' }, onClick: function () { setFxForm({ abilityId: a.id, effect: x }); } }, 'Edit'),
                    h('button', { type: 'button', className: 'portal-btn is-small is-danger', style: { padding: '0.12rem 0.4rem', fontSize: '0.72rem' }, onClick: function () { deleteEffect(x); } }, '✕')));
              } }),
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
      } catch (e) { setErr(e.status === 404 ? 'The worker doesn’t support editable rules yet.' : (e.message || 'Failed to load rules.')); }
    }
    useEffect(function () { load(); /* eslint-disable-next-line */ }, []);

    function upd(fn) { var next = clone(doc); fn(next); setDoc(next); }
    function num(v) { var n = parseInt(v, 10); return isNaN(n) ? 0 : n; }

    async function save() {
      setSaving(true); setErr(''); setSaved('');
      try {
        var r = await PVRollAPI.request('PUT', '/rp/rules', doc);
        setDoc(clone(r.rules)); setSaved('Rules saved.');
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
      props.anyLive ? h('div', { className: 'portal-flash error' }, 'A session is live right now, saved changes apply to it immediately.') : null,
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
          }))),

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
          return h('div', { key: i, style: { display: 'grid', gridTemplateColumns: '1fr 2.2rem', gap: '0.5rem', alignItems: 'end', marginBottom: '0.35rem' } },
            h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(7rem, 1fr))', gap: '0.5rem', alignItems: 'end' } },
            h('div', { className: 'portal-field' }, h('label', null, 'Class'),
              h('select', { value: p.class, onChange: function (e) { var v = e.target.value; upd(function (d) { d.class_passives[i].class = v; }); } },
                CLASS_ROLES.map(function (o) { return h('option', { key: o.value, value: o.value }, o.label); }))),
            h('div', { className: 'portal-field' }, h('label', null, 'Applies to'),
              h('select', { value: p.type, onChange: function (e) { var v = e.target.value; upd(function (d) { d.class_passives[i].type = v; }); } },
                PASSIVE_TYPES.map(function (o) { return h('option', { key: o.value, value: o.value }, o.label); }))),
            h('div', { className: 'portal-field' }, h('label', null, 'Value'),
              h('input', { type: 'number', value: String(p.value), onChange: function (e) { var v = num(e.target.value); upd(function (d) { d.class_passives[i].value = v; }); } })),
            h('div', { className: 'portal-field' }, h('label', null, 'Label'),
              h('input', { type: 'text', value: p.label || '', onChange: function (e) { var v = e.target.value; upd(function (d) { d.class_passives[i].label = v; }); } }))),
            h('div', { className: 'portal-field' },
              h('label', { 'aria-hidden': 'true' }, '\u00a0'),
              h('button', { type: 'button', className: 'portal-btn is-danger', 'aria-label': 'Remove passive', style: { flex: 1, justifyContent: 'center' }, onClick: function () { upd(function (d) { d.class_passives.splice(i, 1); }); } }, '✕')));
        }),
        h('button', { type: 'button', className: 'portal-btn is-ghost', onClick: function () { upd(function (d) { d.class_passives.push({ class: 'dps', type: 'attack_roll', value: 1, label: '' }); }); } }, '+ Add passive')),

      // Damage tiers
      h('div', { className: 'portal-card', style: { marginBottom: '0.6rem' } },
        h('h3', { style: { marginTop: 0 } }, 'Attack damage tiers'),
        (doc.damage_tiers || []).map(function (t, i) {
          return h('div', { key: i, style: { display: 'grid', gridTemplateColumns: '1fr 1fr 2.2rem', gap: '0.5rem', alignItems: 'end', marginBottom: '0.35rem' } },
            h('div', { className: 'portal-field' }, h('label', null, 'Min roll'),
              h('input', { type: 'number', min: 0, value: String(t.min), onChange: function (e) { var v = num(e.target.value); upd(function (d) { d.damage_tiers[i].min = v; }); } })),
            h('div', { className: 'portal-field' }, h('label', null, 'Damage'),
              h('input', { type: 'number', min: 0, value: String(t.damage), onChange: function (e) { var v = num(e.target.value); upd(function (d) { d.damage_tiers[i].damage = v; }); } })),
            h('div', { className: 'portal-field' },
              h('label', { 'aria-hidden': 'true' }, '\u00a0'),
              h('button', { type: 'button', className: 'portal-btn is-danger', 'aria-label': 'Remove tier', style: { flex: 1, justifyContent: 'center' }, onClick: function () { upd(function (d) { d.damage_tiers.splice(i, 1); }); } }, '✕')));
        }),
        h('button', { type: 'button', className: 'portal-btn is-ghost', onClick: function () { upd(function (d) { d.damage_tiers.push({ min: 0, damage: 1 }); }); } }, '+ Add tier')),

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
                h('button', { type: 'button', className: 'portal-btn is-ghost', onClick: function () { restore(e2); } }, 'Restore'));
            }))) : null);
  }

  // ── Item card (compact; opens the editor modal) ───────────────────────────
  // Image sits full-bleed on top (or the fallback signature tile), text is
  // padded below with the torn contrast border between — matching the roster
  // and public item cards. Editing happens in a modal so the grid never shifts.
  // Resolve an item's owner id to a display label via the FC roster. An id that
  // no longer resolves means the holder was deleted, so the item is "stuck"
  // until reassigned from the item editor.
  function ownerInfo(item, members) {
    var ownerId = item.assigned_member_id;
    var ownerRow = (ownerId != null && members) ? members.filter(function (m) { return String(m.id) === String(ownerId); })[0] : null;
    return {
      id: ownerId,
      label: ownerId == null ? 'Unassigned'
        : (members == null ? 'Owner #' + ownerId : (ownerRow ? ownerRow.name : 'Former member')),
      isOrphan: ownerId != null && members != null && !ownerRow
    };
  }

  function ItemCard(props) {
    var it = props.item;
    var imgErrState = useState(false); var imgErr = imgErrState[0], setImgErr = imgErrState[1];
    var owner = ownerInfo(it, props.members);

    return h('div', { className: 'portal-card rp-catalogue-card' },
      h('div', { className: 'rp-card-media sketch-wash' },
        (it.image_url && !imgErr)
          ? h('img', { src: it.image_url, alt: '', onError: function () { setImgErr(true); } })
          : h('span', { className: 'rp-card-sig' }, (it.name || '').toLowerCase()),
        h('span', { className: 'contrast-border-half', 'aria-hidden': 'true' })),
      h('h3', { className: 'rp-catalogue-name' }, it.name),
      // Read-only owner line; reassignment happens in the item editor.
      h('div', { className: 'rp-catalogue-owner' },
        h('span', { className: 'rp-owner-key' }, 'Owner: '),
        h('span', { className: owner.isOrphan ? 'rp-owner-warn' : 'rp-owner-val' }, owner.label)),
      it.description ? h('p', { className: 'rp-catalogue-desc' }, it.description) : null,
      h('div', { className: 'rp-catalogue-actions' },
        h('button', { type: 'button', className: 'portal-btn is-small', onClick: function () { props.onAbilities(it); } }, 'Abilities'),
        h('button', { type: 'button', className: 'portal-btn is-small is-ghost', style: { padding: '0.25rem 0.45rem', lineHeight: 1 }, title: 'Edit item', 'aria-label': 'Edit item', onClick: function () { props.onEdit(it); } }, mi('edit', 'only')),
        h('button', { type: 'button', className: 'portal-btn is-small is-danger', style: { padding: '0.25rem 0.45rem', lineHeight: 1 }, title: 'Delete item', 'aria-label': 'Delete item', onClick: function () { props.onDelete(it); } }, mi('delete', 'only'))));
  }

  // ── Item editor modal (item fields + owner; abilities live in their own modal) ──
  function ItemEditorModal(props) {
    var it = props.item;
    var errState = useState(''); var err = errState[0], setErr = errState[1];
    var savedState = useState(''); var saved = savedState[0], setSaved = savedState[1];
    // Owner picker (rolls DB). Local state so the select reflects the choice
    // immediately; the grid underneath refreshes via props.onChanged.
    var ownerState = useState(it.assigned_member_id == null ? '' : String(it.assigned_member_id));
    var ownerVal = ownerState[0], setOwnerVal = ownerState[1];
    var ownerBusyState = useState(false); var ownerBusy = ownerBusyState[0], setOwnerBusy = ownerBusyState[1];
    var members = props.members;
    var owner = ownerInfo(it, members);

    async function changeOwner(e) {
      var v = e.target.value; setOwnerVal(v);
      var next = v === '' ? null : Number(v);
      setOwnerBusy(true); setErr('');
      try {
        await PVRollAPI.request('PATCH', '/rp/items/' + it.id + '/owner', { member_id: next });
        setSaved('Owner updated.'); setTimeout(function () { setSaved(''); }, 2500);
        if (props.onChanged) props.onChanged();
      } catch (e2) { setErr(e2.message); }
      setOwnerBusy(false);
    }

    async function saveItem(payload) {
      await PVRollAPI.request('PATCH', '/rp/items/' + it.id, payload);
      setSaved('Item details saved.'); setTimeout(function () { setSaved(''); }, 2500);
      if (props.onChanged) props.onChanged();
    }

    return h(window.PVAdminModal, { title: it.name, size: 'lg', onClose: props.onClose },
      saved ? h('div', { className: 'portal-flash success' }, saved) : null,
      err ? h('div', { className: 'portal-flash error' }, err) : null,
      // Item details — Cancel closes the modal.
      h(ItemForm, { initial: it, inModal: true, onSubmit: saveItem, onCancel: props.onClose }),

      // Owner — assign to a member, or Unassigned to free the item. Frees it
      // from any prior holder, so it also recovers an item whose old holder was
      // deleted from the roster.
      h('div', { className: 'rp-editor-section' },
        h('div', { className: 'portal-field' },
          h('label', null, 'Owner',
            owner.isOrphan ? h('span', { className: 'rp-owner-warn', title: 'The previous holder is no longer on the roster.' }, ' · former member') : null),
          h('select', { value: ownerVal, disabled: ownerBusy || members == null, onChange: changeOwner },
            h('option', { value: '' }, 'Unassigned'),
            owner.isOrphan ? h('option', { value: String(owner.id) }, 'Former member (#' + owner.id + ')') : null,
            (members || []).map(function (m) { return h('option', { key: m.id, value: String(m.id) }, m.name); })),
          members == null ? h('p', { className: 'portal-field-help' }, 'Loading roster…') : null)));
  }

  // ── Item abilities modal (abilities → effects), split out of the item editor ──
  function ItemAbilitiesModal(props) {
    var it = props.item;
    var abilitiesState = useState(null); var abilities = abilitiesState[0], setAbilities = abilitiesState[1];
    var abFormState = useState(null); var abForm = abFormState[0], setAbForm = abFormState[1]; // null | {ability?}
    var modFormState = useState(null); var modForm = modFormState[0], setModForm = modFormState[1]; // null | {abilityId, modifier?}
    var errState = useState(''); var err = errState[0], setErr = errState[1];

    async function loadAbilities() {
      try { setAbilities(await PVRollAPI.request('GET', '/rp/items/' + it.id + '/abilities') || []); }
      catch (e) { setErr(e.message); }
    }
    useEffect(function () { loadAbilities(); /* eslint-disable-next-line */ }, [it.id]);

    async function submitAbility(payload) {
      if (abForm && abForm.ability) await PVRollAPI.request('PATCH', '/rp/abilities/' + abForm.ability.id, payload);
      else await PVRollAPI.request('POST', '/rp/items/' + it.id + '/abilities', payload);
      setAbForm(null); await loadAbilities();
    }
    async function deleteAbility(ab) {
      if (!confirm('Delete ability “' + ab.name + '”?')) return;
      try { await PVRollAPI.request('DELETE', '/rp/abilities/' + ab.id); await loadAbilities(); } catch (e) { setErr(e.message); }
    }
    async function submitModifier(payload) {
      if (modForm.modifier) await PVRollAPI.request('PATCH', '/rp/modifiers/' + modForm.modifier.id, payload);
      else await PVRollAPI.request('POST', '/rp/abilities/' + modForm.abilityId + '/modifiers', payload);
      setModForm(null); await loadAbilities();
    }
    async function deleteModifier(mod) {
      if (!confirm('Delete this effect?')) return;
      try { await PVRollAPI.request('DELETE', '/rp/modifiers/' + mod.id); await loadAbilities(); } catch (e) { setErr(e.message); }
    }
    // Persist a new modifier order by stamping each row's sort with its index.
    async function reorderModifiers(orderedIds) {
      try { await Promise.all(orderedIds.map(function (id, i) { return PVRollAPI.request('PATCH', '/rp/modifiers/' + id, { sort: i }); })); }
      catch (e) { setErr(e.message); }
      await loadAbilities();
    }

    return h(window.PVAdminModal, { title: 'Abilities — ' + it.name, size: 'lg', onClose: props.onClose },
      h('div', null,
        err ? h('div', { className: 'portal-flash error' }, err) : null,
        abForm ? h(AbilityForm, { initial: abForm.ability, onSubmit: submitAbility, onCancel: function () { setAbForm(null); } })
          : h('button', { type: 'button', className: 'portal-btn is-small', style: { marginBottom: '0.6rem' }, onClick: function () { setAbForm({}); } }, '+ Add ability'),
        abilities === null ? h('p', null, 'Loading…') :
          (!abilities.length ? null :
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
              h(DragReorder, { items: ab.modifiers || [], onReorder: reorderModifiers, renderRow: function (mod) {
                return h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0.5rem', background: 'var(--bg-card-light)', border: '1px solid var(--border-color)', borderRadius: '0.35rem', marginTop: '0.3rem' } },
                  h('span', { style: { fontSize: '0.8rem' } }, (mod.label ? mod.label + ' — ' : '') + modifierSummary(mod, props.catalogue)),
                  h('span', { style: { display: 'flex', gap: '0.3rem', flexShrink: 0 } },
                    h('button', { type: 'button', className: 'portal-btn is-small is-ghost', style: { padding: '0.12rem 0.4rem', fontSize: '0.72rem' }, onClick: function () { setModForm({ abilityId: ab.id, modifier: mod }); } }, 'Edit'),
                    h('button', { type: 'button', className: 'portal-btn is-small is-danger', style: { padding: '0.12rem 0.4rem', fontSize: '0.72rem' }, onClick: function () { deleteModifier(mod); } }, '✕')));
              } }),
              (modForm && modForm.abilityId === ab.id)
                ? h(ModifierForm, { initial: modForm.modifier, catalogue: props.catalogue, onSubmit: submitModifier, onCancel: function () { setModForm(null); } })
                : h('button', { type: 'button', className: 'portal-btn is-small is-ghost', style: { marginTop: '0.3rem', padding: '0.12rem 0.4rem', fontSize: '0.72rem' }, onClick: function () { setModForm({ abilityId: ab.id, modifier: null }); } }, '+ Add effect'));
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
      h('div', { className: 'portal-field' }, h('label', null, 'Flavor / description'),
        h('textarea', { rows: 3, value: desc, onChange: function (e) { setDesc(e.target.value); } })),
      (window.PVAdminQuestUtils && PVAdminQuestUtils.ImageField)
        ? h(PVAdminQuestUtils.ImageField, {
            value: image,
            onChange: function (v) { setImage(v); },
            uploadPath: '/venues/images',
            extraFields: { venue_name: name.trim() || 'item' },
            resize: { square: true, maxSize: 600 },
            help: 'Paste a URL or upload an image.'
          })
        : h('div', { className: 'portal-field' }, h('label', null, 'Image URL'),
            h('input', { type: 'text', value: image, placeholder: 'https://…', onChange: function (e) { setImage(e.target.value); } })),
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
    var isStaff = isAdmin || roles.indexOf('officer') !== -1;

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
    // Base HP per class from System Rules (code defaults until loaded), so a
    // roster card's Max HP follows a class change.
    var baseHpState = useState({ tank: 25, dps: 20, healer: 15 }); var baseHp = baseHpState[0], setBaseHp = baseHpState[1];

    // items
    var itemsState = useState([]); var items = itemsState[0], setItems = itemsState[1];
    var itemFormState = useState(null); var itemForm = itemFormState[0], setItemForm = itemFormState[1]; // new-item form only
    var editItemState = useState(null); var editItem = editItemState[0], setEditItem = editItemState[1]; // item open in the fields editor
    var abilitiesItemState = useState(null); var abilitiesItem = abilitiesItemState[0], setAbilitiesItem = abilitiesItemState[1]; // item open in the abilities editor
    var itemQueryState = useState(''); var itemQuery = itemQueryState[0], setItemQuery = itemQueryState[1];

    // boss library + per-campaign staged bosses
    var bossLibState = useState([]); var bossLib = bossLibState[0], setBossLib = bossLibState[1];
    var bossFormState = useState(false); var bossForm = bossFormState[0], setBossForm = bossFormState[1]; // new-boss form open
    var editBossState = useState(null); var editBoss = editBossState[0], setEditBoss = editBossState[1]; // boss open in the fields editor
    var skillsBossState = useState(null); var skillsBoss = skillsBossState[0], setSkillsBoss = skillsBossState[1]; // boss open in the skills editor
    var bossQueryState = useState(''); var bossQuery = bossQueryState[0], setBossQuery = bossQueryState[1];
    var bossCreatorState = useState(''); var bossCreator = bossCreatorState[0], setBossCreator = bossCreatorState[1]; // 'Added By' filter (created_by)
    var bossPrivDraftState = useState(false); var bossPrivDraft = bossPrivDraftState[0], setBossPrivDraft = bossPrivDraftState[1]; // admin privacy when they have no bosses yet
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
    // FC roster, used to resolve/set item owners in the catalogue and to name
    // the DM. Loaded once; selectCampaign also fills it lazily for non-admins.
    async function loadMembers() {
      if (members !== null) return;
      try { setMembers(await PVAdminAPI.request('GET', '/members', undefined, true) || []); }
      catch (e) { setErr('Could not load FC members: ' + e.message); }
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
    async function loadBaseHp() {
      try {
        var r = await PVRollAPI.request('GET', '/rp/rules');
        if (r && r.rules && r.rules.role_base_hp) setBaseHp(r.rules.role_base_hp);
      } catch (e) { /* non-fatal: code defaults stay */ }
    }
    // Officer/admin-only endpoint; non-fatal if it 401s — roster just shows the
    // fallback tiles instead of portraits.
    async function loadProfileImages() {
      function toMap(rows) {
        var map = {}; (rows || []).forEach(function (r) { if (r && r.image_url && r.member_id != null) map[r.member_id] = r.image_url; });
        return map;
      }
      // Staff can read every profile (incl. drafts) via the admin endpoint.
      // DMs/non-staff fall back to the public roster (published profiles only) —
      // the same source the roll-calculator page uses for portraits.
      try {
        var rows = await PVAdminAPI.request('GET', '/member-profiles/admin', undefined, true) || [];
        setProfileImages(toMap(rows));
      } catch (e) {
        try {
          var res = await fetch(PVAdminAPI.API_BASE + '/roster', { headers: { 'Accept': 'application/json' } });
          setProfileImages(toMap(res.ok ? await res.json() : []));
        } catch (_e) { /* no portraits */ }
      }
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
    useEffect(function () { loadCampaigns(); loadItems(); loadDefaults(); loadBaseHp(); loadProfileImages(); loadBossLib(); if (isAdmin) loadMembers(); /* eslint-disable-next-line */ }, []);
    // The boss library's 'Added By' filter names creators from the FC roster.
    useEffect(function () {
      if (!isStaff || tab !== 'bosses' || members !== null) return;
      PVAdminAPI.request('GET', '/members', undefined, true)
        .then(function (rows) { setMembers(rows || []); })
        .catch(function () { /* creators fall back to 'Former member' */ });
      /* eslint-disable-next-line */
    }, [tab]);

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
      setSelected(c); setRoster([]); loadRoster(c.id); loadDefaults();
      // Per-campaign item enable/disable is an admin-only panel.
      if (isAdmin) loadDisabledItems(c.id);
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
      if (!confirm('End the live session for “' + c.name + '”?')) return;
      try { await PVRollAPI.request('POST', '/rp/campaigns/' + c.id + '/session/end'); flash[1]('Session ended.'); await loadCampaigns(); }
      catch (e) { setErr(e.message); }
    }
    async function pauseSession(c) {
      try { await PVRollAPI.request('POST', '/rp/campaigns/' + c.id + '/session/pause'); flash[1]('Session paused.'); await loadCampaigns(); }
      catch (e) { setErr(e.message); }
    }
    async function resumeSession(c) {
      try { await PVRollAPI.request('POST', '/rp/campaigns/' + c.id + '/session/resume'); flash[1]('Session resumed.'); await loadCampaigns(); if (selected && selected.id === c.id) await loadRoster(c.id); }
      catch (e) { setErr(e.message); }
    }
    async function deleteCampaign(c) {
      if (!confirm('Delete campaign “' + c.name + '”? This cannot be undone.')) return;
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
    // Admin-only privacy: hides the admin's own bosses from everyone else's
    // library. State reads off their bosses; with none yet, a local draft
    // decides whether the next one is created private.
    var myBosses = bossLib.filter(function (b) { return b.mine; });
    var bossPrivate = myBosses.length ? myBosses.every(function (b) { return !!b.private; }) : bossPrivDraft;
    async function toggleBossPrivacy(next) {
      if (!myBosses.length) { setBossPrivDraft(next); return; }
      try { await PVRollAPI.request('PUT', '/rp/boss-library/privacy', { private: next }); setBossPrivDraft(next); await loadBossLib(); }
      catch (e) { setErr(e.message); }
    }
    async function createBoss(payload) {
      if (isAdmin) payload = Object.assign({}, payload, { private: bossPrivate });
      await PVRollAPI.request('POST', '/rp/boss-library', payload);
      setBossForm(false); await loadBossLib();
    }
    async function deleteBoss(b) {
      if (!confirm('Delete boss?')) return;
      try { await PVRollAPI.request('DELETE', '/rp/boss-library/' + b.id); await loadBossLib(); if (selected) loadCampBosses(selected.id); }
      catch (e) { setErr(e.message); }
    }
    // Keep the open editor modal in sync after ability edits reload the library.
    async function refreshBossLib() {
      var rows = await loadBossLib();
      function sync(cur) { if (!cur) return cur; var nb = rows.filter(function (x) { return x.id === cur.id; })[0]; return nb || cur; }
      setEditBoss(sync);
      setSkillsBoss(sync);
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
    // Resolve the current DM's display name (for the read-only, non-admin view).
    function dmNameFor(c) {
      if (c.dm_member_id == null) return 'None assigned';
      var byId = (members || []).filter(function (m) { return String(m.id) === String(c.dm_member_id); })[0];
      if (byId) return byId.name;
      var byRoster = (roster || []).filter(function (r) { return String(r.member_id) === String(c.dm_member_id); })[0];
      return byRoster ? byRoster.member_name : 'Assigned';
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
              // Header: title + status on the left; edit (manage) and delete pinned
              // to the top-right corner as icon buttons.
              h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' } },
                h('div', null,
                  h('span', { className: 'rp-campaign-name' }, c.name),
                  c.active ? h('span', { style: { marginLeft: '0.5rem', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#fff', background: 'var(--accent-red)', borderRadius: '0.3rem', padding: '0.1rem 0.4rem' } }, 'Live') : null,
                  c.paused ? h('span', { style: { marginLeft: '0.5rem', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-primary)', border: '1px solid var(--accent-gold)', borderRadius: '0.3rem', padding: '0.1rem 0.4rem' } }, 'Paused') : null
                ),
                h('div', { style: { display: 'flex', gap: '0.35rem', flexShrink: 0 } },
                  h('button', { type: 'button', className: 'portal-btn is-small is-ghost', style: { padding: '0.25rem 0.45rem', lineHeight: 1 },
                    title: isSel ? 'Close manager' : 'Manage', 'aria-label': isSel ? 'Close manager' : 'Manage', 'aria-expanded': isSel ? 'true' : 'false',
                    onClick: function () { isSel ? setSelected(null) : selectCampaign(c); } }, mi(isSel ? 'close' : 'edit', 'only')),
                  (isAdmin || c.is_dm) ? h('button', { type: 'button', className: 'portal-btn is-small is-danger', style: { padding: '0.25rem 0.45rem', lineHeight: 1 },
                    title: 'Delete', 'aria-label': 'Delete campaign', onClick: function () { deleteCampaign(c); } }, mi('delete', 'only')) : null
                )
              ),
              // Lifecycle actions sit beneath the title, where "Start" lives when
              // fresh. Live → Pause + End + Roll Calculator; paused → Resume + End.
              h('div', { style: { display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.5rem' } },
                (!c.active && !c.paused) ? h('button', { type: 'button', className: 'portal-btn is-small', onClick: function () { startSession(c); } }, 'Start', mi('play_arrow', 'trail')) : null,
                c.active ? h('button', { type: 'button', className: 'portal-btn is-small is-ghost', onClick: function () { pauseSession(c); } }, 'Pause', mi('pause', 'trail')) : null,
                c.paused ? h('button', { type: 'button', className: 'portal-btn is-small', onClick: function () { resumeSession(c); } }, 'Resume', mi('play_arrow', 'trail')) : null,
                (c.active || c.paused) ? h('button', { type: 'button', className: 'portal-btn is-small is-danger', onClick: function () { endSession(c); } }, 'End', mi('close', 'trail')) : null,
                c.active ? h('a', { className: 'portal-btn is-small is-ghost', href: '/pv/tools/roll-calculator.html', style: { textDecoration: 'none' } }, 'Roll Calculator', mi('arrow_forward', 'trail')) : null
              ),

              isSel ? h('div', { style: { marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' } },
                isAdmin
                  ? h('div', { className: 'portal-card', style: { background: 'var(--bg-card-light)', marginBottom: '0.5rem' } },
                      h('div', { className: 'portal-field' }, h('label', null, 'Dungeon Master'),
                        members === null ? h('p', { style: { margin: 0, color: 'var(--text-secondary)' } }, 'Loading members…') :
                          h('select', { value: c.dm_member_id != null ? String(c.dm_member_id) : '', onChange: function (e) { setDmFor(c, e.target.value); } },
                            h('option', { value: '' }, '— none —'),
                            (members || []).map(function (m) { return h('option', { key: m.id, value: m.id }, m.name); }))))
                  : h('div', { className: 'portal-field', style: { marginBottom: '0.5rem' } },
                      h('label', null, 'Dungeon Master'),
                      h('p', { style: { margin: 0 } }, dmNameFor(c))),

                // Add a member — kept at the top of the panel, right under the DM.
                h('div', { className: 'portal-card', style: { background: 'var(--bg-card-light)', marginBottom: '0.5rem' } },
                  h('label', { className: 'portal-block-label' }, 'Add a member'),
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
                  // Item control stays with admins; DMs manage rosters/bosses only.
                  if (!isAdmin) return null;
                  var camp = campaignItemList();
                  if (!camp.length) return null;
                  var loading = disabledItems === null;
                  var offCount = loading ? 0 : camp.filter(function (it) { return !!disabledItems[it.id]; }).length;
                  var onCount = camp.length - offCount;
                  return h('div', { className: 'portal-card', style: { background: 'var(--bg-card-light)', marginBottom: '0.5rem' } },
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' } },
                      h('label', { className: 'portal-block-label', style: { margin: 0, flex: '1 1 auto' } }, 'Campaign items'),
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
                  h('label', { className: 'portal-block-label' }, 'Bosses'),
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
                    h('select', { className: 'portal-select', value: campBossPick, style: { flex: '1 1 12rem' }, onChange: function (e) { setCampBossPick(e.target.value); } },
                      h('option', { value: '' }, bossLib.length ? '— add a boss from the library —' : 'No bosses in the library yet'),
                      bossLib.map(function (b) { return h('option', { key: b.id, value: b.id }, b.name + ' (' + b.max_hp + ' HP)'); })),
                    h('button', { type: 'button', className: 'portal-btn is-small', disabled: !campBossPick, onClick: addCampBoss }, 'Add')),
                  h('p', { className: 'portal-field-help', style: { margin: '0.35rem 0 0' } }, 'The same library boss can be added more than once for multi-enemy fights.')) : null,

                h('label', { className: 'portal-block-label' }, 'Roster'),
                h('div', { className: 'rp-roster-grid' },
                  roster.map(function (ch) {
                    return h(RosterRow, { key: ch.member_id, character: ch, canEquip: isAdmin, baseHp: baseHp,
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
              return h(ItemCard, { key: it.id, item: it, members: members, onEdit: function (x) { setEditItem(x); }, onAbilities: function (x) { setAbilitiesItem(x); }, onDelete: deleteItem });
            }));
        })(),
        editItem ? h(ItemEditorModal, { item: editItem, catalogue: items, members: members,
          onChanged: loadItems, onClose: function () { setEditItem(null); } }) : null,
        abilitiesItem ? h(ItemAbilitiesModal, { item: abilitiesItem, catalogue: items,
          onClose: function () { setAbilitiesItem(null); } }) : null
      ) : null,

      tab === 'bosses' && bossesSupported ? h('div', null,
        bossForm ? h(BossForm, { onSubmit: createBoss, onCancel: function () { setBossForm(false); } }) : null,
        h('div', { className: 'rp-catalogue-toolbar' },
          h('input', { type: 'search', className: 'portal-search', value: bossQuery,
            placeholder: 'Search bosses by name…',
            onChange: function (e) { setBossQuery(e.target.value); } }),
          isStaff ? (function () {
            var ids = [];
            bossLib.forEach(function (b) { if (b.created_by != null && ids.indexOf(String(b.created_by)) === -1) ids.push(String(b.created_by)); });
            var opts = ids.map(function (id) {
              var row = members ? members.filter(function (m) { return String(m.id) === id; })[0] : null;
              return { id: id, label: row ? row.name : (members == null ? 'Member #' + id : 'Former member') };
            }).sort(function (a, b) { return a.label.localeCompare(b.label); });
            return h('select', { className: 'portal-filter-select', value: bossCreator,
              onChange: function (e) { setBossCreator(e.target.value); } },
              h('option', { value: '' }, 'Added By: Anyone'),
              opts.map(function (o) { return h('option', { key: o.id, value: o.id }, o.label); }));
          })() : null,
          bossForm ? null : h('button', { type: 'button', className: 'portal-btn',
            onClick: function () { setBossForm(true); } }, '+ New boss')),
        isAdmin ? h('div', { style: { marginTop: '-0.4rem', marginBottom: '1rem' } },
          h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '0.6rem' } },
            h('span', null, 'Hide My Bosses'),
            h('button', { type: 'button', className: 'rp-switch' + (bossPrivate ? ' is-on' : ''), role: 'switch',
              'aria-checked': bossPrivate ? 'true' : 'false', 'aria-label': 'Hide My Bosses',
              onClick: function () { toggleBossPrivacy(!bossPrivate); } },
              h('span', { className: 'rp-switch-txt rp-switch-off' }, 'Off'),
              h('span', { className: 'rp-switch-txt rp-switch-on' }, 'On'),
              h('span', { className: 'rp-switch-knob', 'aria-hidden': 'true' })))) : null,
        (function () {
          if (!bossLib.length) return h('div', { className: 'portal-card' }, 'No bosses yet. Create one and give it skills.');
          var q = bossQuery.trim().toLowerCase();
          var shown = bossLib.filter(function (b) {
            if (q && (b.name || '').toLowerCase().indexOf(q) === -1) return false;
            if (bossCreator && String(b.created_by) !== bossCreator) return false;
            return true;
          });
          if (!shown.length) return h('div', { className: 'portal-card' }, 'No bosses match that search.');
          return h('div', { className: 'rp-catalogue-grid' },
            shown.map(function (b) {
              return h(BossCard, { key: b.id, boss: b, onEdit: function (x) { setEditBoss(x); }, onSkills: function (x) { setSkillsBoss(x); }, onDelete: deleteBoss });
            }));
        })(),
        editBoss ? h(BossEditorModal, { boss: editBoss,
          onChanged: refreshBossLib, onClose: function () { setEditBoss(null); } }) : null,
        skillsBoss ? h(BossSkillsModal, { boss: skillsBoss,
          onChanged: refreshBossLib, onClose: function () { setSkillsBoss(null); } }) : null
      ) : null,

      tab === 'rules' && isAdmin ? h(RulesEditor, { anyLive: campaigns.some(function (c) { return c.active; }) }) : null
    );
  }

  window.PVAdminRpRolls = PVAdminRpRolls;
})();
