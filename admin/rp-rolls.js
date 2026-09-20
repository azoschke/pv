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
  // attack_mult multiplies a target's attack damage; damage / dot hit an enemy.
  var MOD_TYPES = ['attack_roll', 'defense_roll', 'heal_roll', 'attack_output', 'attack_mult', 'heal_output', 'shield', 'heal', 'damage', 'dot', 'none'];
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
      { value: 'shield', label: 'Grant shield' }
    ] },
    { label: 'Boosts the holder', options: [
      { value: 'roll', label: 'Add to a roll' },
      { value: 'attack_output', label: 'Add attack damage' },
      { value: 'attack_mult', label: 'Multiply attack damage' },
      { value: 'heal_output', label: 'Boost healing done' },
      { value: 'damage_reduction', label: 'Reduce damage taken' },
      { value: 'skill', label: 'Add to a skill check' }
    ] },
    { label: 'Other', options: [
      { value: 'none', label: 'Narrative only' }
    ] }
  ];
  // One short plain line per effect. Middle-school reading level, no jargon.
  var EFFECT_HELP = {
    damage: 'Hits an enemy you pick for damage.',
    heal: 'Restores HP to the target.',
    shield: 'Gives a shield that blocks damage. It stays until broken.',
    roll: 'Adds to the holder’s dice rolls.',
    attack_output: 'Adds extra damage to the holder’s attacks.',
    attack_mult: 'Multiplies the damage of the holder’s attacks.',
    heal_output: 'Makes the holder’s heals restore more HP.',
    damage_reduction: 'Lowers damage the target takes. A hit still deals at least 1.',
    skill: 'Adds to the holder’s rolls for one skill.',
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
    { value: 'rapport', label: 'Rapport' }
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
  // "How it works" options are phrased per effect so timing reads naturally and
  // never contradicts itself (an "always on" choice never carries a turn limit;
  // over-time is a named option, not a hidden toggle). Each maps to mode +
  // duration under the hood.
  function timingOptions(effect) {
    if (effect === 'damage') return [{ value: 'once', label: 'Hit once' }, { value: 'over', label: 'Damage each turn for a while' }];
    if (effect === 'heal') return [{ value: 'once', label: 'Heal once' }, { value: 'over', label: 'Heal each turn for a while' }, { value: 'passive', label: 'Heal each turn (always on)' }];
    // A shield is granted once and lasts until it's broken, so it has no turn timer.
    if (effect === 'shield') return [{ value: 'once', label: 'Give once (press)' }, { value: 'passive', label: 'Refresh each turn (always on)' }];
    return [{ value: 'passive', label: 'Always on' }, { value: 'toggle', label: 'Toggle on/off' }, { value: 'temp', label: 'Temporary (lasts a while)' }];
  }
  function initTiming(effect, m) {
    var mode = m.mode || 'always';
    if (effect === 'damage') return m.type === 'dot' ? 'over' : 'once';
    if (effect === 'heal') return mode === 'always' ? 'passive' : (m.duration_turns === 1 ? 'once' : 'over');
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
    var enemyScopeState = useState(m.target_kind === 'all_bosses' ? 'all_bosses' : (m.target_kind === 'some_bosses' ? 'some_bosses' : 'boss')); var enemyScope = enemyScopeState[0], setEnemyScope = enemyScopeState[1];
    // "Several enemies" can cap how many are picked (blank = no cap); stored in target_ref.
    var enemyCapState = useState(m.target_kind === 'some_bosses' && m.target_ref ? String(m.target_ref) : ''); var enemyCap = enemyCapState[0], setEnemyCap = enemyCapState[1];
    // Uses is opt-in via a checkbox so simple items never see a "0 = unlimited" box.
    var limitUsesState = useState((m.uses_per_session || 0) > 0); var limitUses = limitUsesState[0], setLimitUses = limitUsesState[1];
    var usesState = useState(String(m.uses_per_session && m.uses_per_session > 0 ? m.uses_per_session : 1)); var uses = usesState[0], setUses = usesState[1];
    var durState = useState(m.duration_turns && m.duration_turns > 1 ? String(m.duration_turns) : ''); var dur = durState[0], setDur = durState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];

    // On first pick (from no effect) default the timing to the effect's first
    // option so a new Heal/Shield doesn't silently start as "always on". When
    // switching between real effects, keep the current timing if it's still valid.
    function changeEffect(next) {
      var wasEmpty = !effect;
      setEffect(next);
      var opts = timingOptions(next).map(function (o) { return o.value; });
      if (wasEmpty || opts.indexOf(timing) === -1) setTiming(opts[0]);
    }

    var hasEffect = !!effect;
    var isStrike = effect === 'damage';   // hits a chosen enemy; always press-to-use
    var isNone = effect === 'none';
    var isOver = timing === 'over';
    var isActivated = timing === 'temp' || timing === 'once' || timing === 'over';
    var showValue = hasEffect && !isNone;
    var showTarget = hasEffect && !isNone && !isStrike;
    var showTiming = hasEffect && !isNone;
    var showUses = hasEffect && isActivated && !isNone;
    var showTurns = hasEffect && (timing === 'temp' || timing === 'over'); // only "…for a while" needs turns

    function resolvedMode() {
      if (isStrike) return 'activated';
      if (timing === 'passive') return 'always';
      if (timing === 'toggle') return 'toggle';
      return 'activated'; // temp / once / over
    }
    function resolvedType() {
      if (effect === 'roll') return 'roll_bonus';
      if (effect === 'skill') return 'skill_roll';
      if (effect === 'damage') return isOver ? 'dot' : 'damage';
      return effect; // heal, shield, attack_output, attack_mult, heal_output, damage_reduction, none
    }
    function resolvedDuration() {
      if (effect === 'heal' && timing === 'once') return 1;   // instant heal = one application
      if (effect === 'heal' && timing === 'passive') return 0; // re-heals every turn, forever
      if (effect === 'damage' && timing === 'once') return 0;  // single hit
      if (!showTurns) return 0;
      return parseInt(dur, 10) || 0; // blank / 0 = until removed
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
      if (effect === 'roll' && !rolls.length) { setErr('Pick at least one roll.'); return; }
      var payload = { label: label.trim() || null, value: parseInt(val, 10) || 0, type: resolvedType(),
        rolls: effect === 'roll' ? rolls : null,
        skill: effect === 'skill' ? skillPick : null,
        target_kind: isStrike ? enemyScope : tk, mode: resolvedMode(),
        uses_per_session: resolvedUses(), duration_turns: resolvedDuration() };
      if (isStrike) payload.target_ref = (enemyScope === 'some_bosses' && parseInt(enemyCap, 10) > 0) ? String(parseInt(enemyCap, 10)) : null;
      else if (tk === 'class') payload.target_ref = ref || 'tank';
      else if (tk === 'holder_items') { if (!refs.length) { setErr('Pick at least one item.'); return; } payload.target_ref = JSON.stringify(refs); }
      else payload.target_ref = null;
      try { await props.onSubmit(payload); } catch (e2) { setErr(e2.message || 'Failed to save.'); }
    }

    function secHead(t) { return h('div', { style: { fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', margin: '0.7rem 0 0.35rem' } }, t); }
    function fieldGrid(children) { return h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))', gap: '0.5rem', alignItems: 'end' } }, children); }

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
      showTiming ? secHead('How it works') : null,
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
    if (m.type === 'none') return m.label ? m.label : 'Narrative effect (shown from the description).';
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
      default: t = '';
    }
    var when = m.mode === 'always' ? 'Always' : m.mode === 'toggle' ? 'While turned on' : 'When activated';
    var dur = m.duration_turns === 1 ? ', this turn' : m.duration_turns > 1 ? ', for ' + m.duration_turns + ' turns' : '';
    var uses = (m.mode === 'activated' && m.uses_per_session > 0) ? ' · ' + m.uses_per_session + ' use' + (m.uses_per_session === 1 ? '' : 's') + '/session' : '';
    var core = m.type === 'roll_bonus' ? rollsPhrase(m.rolls, m.value)
      : m.type === 'skill_roll' ? ((m.value >= 0 ? '+' : '') + m.value + ' to ' + skillLabel(m.skill) + ' checks')
      : typePhrase(m.type, m.value);
    return when + ', ' + core + ' to ' + t + dur + '.' + uses;
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
    if (e.type === 'none') return 'Narrative effect.' + uses;
    var to = bossTargetPhrase(e.target_kind, e.target_ref);
    if (e.type === 'damage') return 'Deals ' + e.value + ' damage to ' + to + '.' + uses;
    return e.value + ' damage per turn to ' + to + (e.duration_turns > 0 ? ', for ' + e.duration_turns + ' turns' : ', until removed') + '.' + uses;
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
      h('div', { className: 'portal-field' }, h('label', null, 'Admin Notes'),
        h('textarea', { rows: 3, value: desc, onChange: function (e) { setDesc(e.target.value); } })),
      h('div', { className: 'portal-field' }, h('label', null, 'Default max HP *'),
        h('input', { type: 'number', min: 1, value: maxHp, onChange: function (e) { setMaxHp(e.target.value); } })),
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
    // Owner picker (rolls DB). Local state so the select reflects the choice
    // immediately; the grid underneath refreshes via props.onChanged.
    var ownerState = useState(it.assigned_member_id == null ? '' : String(it.assigned_member_id));
    var ownerVal = ownerState[0], setOwnerVal = ownerState[1];
    var ownerBusyState = useState(false); var ownerBusy = ownerBusyState[0], setOwnerBusy = ownerBusyState[1];
    var members = props.members;
    var owner = ownerInfo(it, members);

    async function loadAbilities() {
      try { setAbilities(await PVRollAPI.request('GET', '/rp/items/' + it.id + '/abilities') || []); }
      catch (e) { setErr(e.message); }
    }
    useEffect(function () { loadAbilities(); /* eslint-disable-next-line */ }, [it.id]);

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
          members == null ? h('p', { className: 'portal-field-help' }, 'Loading roster…') : null)),

      h('div', { className: 'rp-editor-section' },
        h('h4', null, 'Abilities'),
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
    useEffect(function () { loadCampaigns(); loadItems(); loadDefaults(); loadProfileImages(); loadBossLib(); if (isAdmin) loadMembers(); /* eslint-disable-next-line */ }, []);

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
              h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' } },
                h('div', null,
                  h('span', { className: 'rp-campaign-name' }, c.name),
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
                  (isAdmin || c.is_dm) ? h('button', { type: 'button', className: 'portal-btn is-small is-danger', onClick: function () { deleteCampaign(c); } }, 'Delete') : null
                )
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
              return h(ItemCard, { key: it.id, item: it, members: members, onEdit: function (x) { setEditItem(x); }, onDelete: deleteItem });
            }));
        })(),
        editItem ? h(ItemEditorModal, { item: editItem, catalogue: items, members: members,
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
