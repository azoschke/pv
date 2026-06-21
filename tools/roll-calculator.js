// ============================================================================
//  RollCalculator — player-facing RP roll calculator + party tracker.
//
//  Backed by pv-campaign-rolls-worker via PVRollAPI. The worker serves raw
//  character / item / buff / group-bonus data; ALL roll math happens here so
//  the breakdown updates live as the player types. The tool never generates
//  rolls — the player enters their own dice result.
//
//  Three gate states:
//    - no session            -> Locked card
//    - session, no active     -> Paused card
//    - session + active + you're rostered -> full tool (polls every 5s)
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useRef = React.useRef;

  var POLL_MS = 5000;

  // ── Game rules ────────────────────────────────────────────────────────────
  var ARMOR_ATTACK  = { heavy: -1, medium: 1, light: 2 };
  var ARMOR_DEFENSE = { heavy: 2,  medium: 1, light: -1 };
  var ARMOR_LABEL   = { heavy: 'Heavy Armor', medium: 'Medium Armor', light: 'Light Armor' };
  var ROLE_LABEL    = { tank: 'Tank', dps: 'DPS', healer: 'Healer' };
  var BUFF_LABEL    = { attack_roll: 'Attack', defense_roll: 'Defense', heal_roll: 'Heal' };

  function damageFor(r) {
    if (r >= 20) return 5;
    if (r >= 16) return 4;
    if (r >= 11) return 3;
    if (r >= 6)  return 2;
    return 1; // 1–5, and anything below (negatives floor to the bottom tier)
  }

  function statBuffsOf(character) {
    var out = [];
    ['buff_slot_1', 'buff_slot_2', 'buff_slot_3'].forEach(function (k) {
      var b = character[k];
      if (b && b.type && BUFF_LABEL[b.type]) out.push(b);
    });
    return out;
  }

  function eligibleForGroup(bonus, classRole) {
    var roles = bonus.eligible_roles || [];
    return roles.indexOf('all') !== -1 || roles.indexOf(classRole) !== -1;
  }

  function fmt(n) { return (n >= 0 ? '+' : '') + n; }

  // Compute one roll's modifier stack. kind: 'attack' | 'defense' | 'heal'.
  function computeRoll(kind, raw, ctx) {
    var rollType = kind === 'attack' ? 'attack_roll' : kind === 'defense' ? 'defense_roll' : 'heal_roll';
    var outputType = kind === 'attack' ? 'attack_output' : kind === 'heal' ? 'heal_output' : null;
    var c = ctx.character;
    var rows = [];
    var base = parseInt(raw, 10);
    if (isNaN(base)) base = 0;
    var total = base;

    function add(label, value) { if (value) { rows.push({ label: label, value: value }); total += value; } }

    // 1. Armor
    if (kind === 'attack')  add(ARMOR_LABEL[c.armor_type], ARMOR_ATTACK[c.armor_type]);
    if (kind === 'defense') add(ARMOR_LABEL[c.armor_type], ARMOR_DEFENSE[c.armor_type]);

    // 2. Class passive
    if (kind === 'attack'  && c.class_role === 'dps')  add('DPS Passive', 1);
    if (kind === 'defense' && c.class_role === 'tank') add('Tank Passive', 2);

    // 3. Equipped item passives (roll-type)
    ctx.equipped.forEach(function (it) {
      if (it.equipped && it.modifier_type === rollType && it.passive_modifier) add(it.name, it.passive_modifier);
    });

    // 4. Active group-action bonuses (eligible to my class)
    ctx.groupBonuses.forEach(function (g) {
      if (g.modifier_type === rollType && eligibleForGroup(g, c.class_role)) {
        add('Group: ' + g.item_name + ' (' + g.ability_name + ')', g.modifier_value);
      }
    });

    // 5. Active self abilities (toggled on this turn)
    ctx.activeAbilities.forEach(function (a) {
      if (a.modifier_type === rollType) add('Ability: ' + a.name, a.modifier_value);
    });

    // 6. Personal buffs
    statBuffsOf(c).forEach(function (b) {
      if (b.type === rollType) add('Buff (' + BUFF_LABEL[b.type] + ')', b.value);
    });

    // Direct-to-output modifiers (applied after the table / heal total)
    var outputRows = [];
    var outputTotal = 0;
    if (outputType) {
      function addOut(label, value) { if (value) { outputRows.push({ label: label, value: value }); outputTotal += value; } }
      ctx.equipped.forEach(function (it) {
        if (it.equipped && it.modifier_type === outputType && it.passive_modifier) addOut(it.name, it.passive_modifier);
      });
      ctx.groupBonuses.forEach(function (g) {
        if (g.modifier_type === outputType && eligibleForGroup(g, c.class_role)) addOut('Group: ' + g.item_name, g.modifier_value);
      });
      ctx.activeAbilities.forEach(function (a) {
        if (a.modifier_type === outputType) addOut('Ability: ' + a.name, a.modifier_value);
      });
    }

    return { base: base, rows: rows, total: total, outputRows: outputRows, outputTotal: outputTotal };
  }

  // ── Small presentational helpers ──────────────────────────────────────────
  function Breakdown(props) {
    var calc = props.calc;
    var rows = calc.rows;
    return h('div', { className: 'rp-breakdown' },
      h('div', { className: 'rp-bd-row rp-bd-base' },
        h('span', null, 'Roll'), h('span', null, String(calc.base))),
      rows.map(function (r, i) {
        return h('div', { className: 'rp-bd-row', key: i },
          h('span', null, r.label), h('span', null, fmt(r.value)));
      }),
      h('div', { className: 'rp-bd-rule' }),
      props.children
    );
  }

  // ── Gate cards ────────────────────────────────────────────────────────────
  function LockedCard() {
    return h('div', { className: 'rp-gate' },
      h('span', { className: 'material-icons rp-gate-icon', 'aria-hidden': 'true' }, 'lock'),
      h('h2', null, 'Members only'),
      h('p', null, 'Sign in with your character account to use the Roll Calculator.'),
      h('a', { className: 'rp-btn', href: '/pv/admin/login.html' }, 'Sign in')
    );
  }
  function PausedCard(props) {
    return h('div', { className: 'rp-gate' },
      h('span', { className: 'material-icons rp-gate-icon', 'aria-hidden': 'true' }, 'pause_circle'),
      h('h2', null, props.title || 'No active session'),
      h('p', null, props.message ||
        'There is no live campaign session right now. When an officer starts one and adds your character, the calculator will unlock automatically.')
    );
  }

  // ── Roll panels ───────────────────────────────────────────────────────────
  function AttackPanel(props) {
    var rollState = useState(''); var roll = rollState[0], setRoll = rollState[1];
    var calc = computeRoll('attack', roll, props.ctx);
    var dmg = damageFor(calc.total);
    var finalDmg = dmg + calc.outputTotal;
    return h('div', { className: 'rp-card' },
      h('h3', null, 'Attack Roll'),
      h('label', { className: 'rp-input-label' }, 'Raw D20 roll',
        h('input', { className: 'rp-input', type: 'number', inputMode: 'numeric', value: roll,
          placeholder: 'e.g. 14', onChange: function (e) { setRoll(e.target.value); } })),
      h(Breakdown, { calc: calc },
        h('div', { className: 'rp-bd-row rp-bd-total' },
          h('span', null, 'Modified Roll'),
          h('span', null, calc.total + ' → ' + dmg + ' Damage'))),
      calc.outputRows.length ? h('div', { className: 'rp-breakdown rp-breakdown-output' },
        h('div', { className: 'rp-bd-row rp-bd-base' }, h('span', null, 'Base Damage'), h('span', null, String(dmg))),
        calc.outputRows.map(function (r, i) {
          return h('div', { className: 'rp-bd-row', key: i }, h('span', null, r.label + ' damage'), h('span', null, fmt(r.value)));
        }),
        h('div', { className: 'rp-bd-rule' }),
        h('div', { className: 'rp-bd-row rp-bd-total' }, h('span', null, 'Final Damage'), h('span', null, String(finalDmg)))
      ) : null
    );
  }

  function DefensePanel(props) {
    var rollState = useState(''); var roll = rollState[0], setRoll = rollState[1];
    var calc = computeRoll('defense', roll, props.ctx);
    return h('div', { className: 'rp-card' },
      h('h3', null, 'Defensive Roll'),
      h('label', { className: 'rp-input-label' }, 'Raw D20 roll',
        h('input', { className: 'rp-input', type: 'number', inputMode: 'numeric', value: roll,
          placeholder: 'e.g. 10', onChange: function (e) { setRoll(e.target.value); } })),
      h(Breakdown, { calc: calc },
        h('div', { className: 'rp-bd-row rp-bd-total' },
          h('span', null, 'Modified Roll'), h('span', null, String(calc.total)))),
      h('p', { className: 'rp-note' }, 'Report this number to the GM. No damage tier is shown on defense.')
    );
  }

  function HealPanel(props) {
    var rollState = useState(''); var roll = rollState[0], setRoll = rollState[1];
    var modeState = useState('single'); var mode = modeState[0], setMode = modeState[1];
    var targetsState = useState(''); var targets = targetsState[0], setTargets = targetsState[1];
    var calc = computeRoll('heal', roll, props.ctx);
    var finalHeal = calc.total + calc.outputTotal;
    return h('div', { className: 'rp-card' },
      h('h3', null, 'Healing Roll'),
      h('div', { className: 'rp-seg' },
        h('button', { type: 'button', className: 'rp-seg-btn' + (mode === 'single' ? ' is-active' : ''),
          onClick: function () { setMode('single'); } }, 'Single Target'),
        h('button', { type: 'button', className: 'rp-seg-btn' + (mode === 'aoe' ? ' is-active' : ''),
          onClick: function () { setMode('aoe'); } }, 'AOE')
      ),
      h('label', { className: 'rp-input-label' }, 'Raw D5 heal roll',
        h('input', { className: 'rp-input', type: 'number', inputMode: 'numeric', value: roll,
          placeholder: 'e.g. 3', onChange: function (e) { setRoll(e.target.value); } })),
      mode === 'aoe' ? h('label', { className: 'rp-input-label' }, 'Raw D5 target count',
        h('input', { className: 'rp-input', type: 'number', inputMode: 'numeric', value: targets,
          placeholder: 'e.g. 3', onChange: function (e) { setTargets(e.target.value); } })) : null,
      h(Breakdown, { calc: calc },
        calc.outputRows.map(function (r, i) {
          return h('div', { className: 'rp-bd-row', key: 'o' + i }, h('span', null, r.label), h('span', null, fmt(r.value)));
        }).concat([
          h('div', { className: 'rp-bd-row rp-bd-total', key: 'tot' },
            h('span', null, 'Modified Heal'), h('span', null, String(finalHeal)))
        ])),
      mode === 'aoe' ? h('p', { className: 'rp-note' },
        'Distribute ' + finalHeal + ' across ' + (parseInt(targets, 10) || 0) + ' target(s) manually.') : null
    );
  }

  // ── Abilities ─────────────────────────────────────────────────────────────
  function AbilitiesPanel(props) {
    var abilities = props.abilities;
    if (!abilities.length) return null;
    return h('div', { className: 'rp-card' },
      h('h3', null, 'Item Abilities'),
      abilities.map(function (a) {
        var remaining = a.uses_per_session - a.uses_this_session;
        var eligible = a.eligible_roles.indexOf('all') !== -1 || a.eligible_roles.indexOf(props.classRole) !== -1;
        var spent = remaining <= 0;
        var active = props.activeIds.indexOf(a.id) !== -1;
        return h('div', { className: 'rp-ability', key: a.id },
          h('div', { className: 'rp-ability-info' },
            h('strong', null, a.name),
            h('span', { className: 'rp-ability-meta' },
              a.item_name + ' · ' + fmt(a.modifier_value) + ' ' + a.modifier_type.replace('_', ' ') +
              ' · ' + a.target_scope + ' · ' + remaining + '/' + a.uses_per_session + ' uses'),
            a.description ? h('span', { className: 'rp-ability-desc' }, a.description) : null
          ),
          h('button', {
            type: 'button',
            className: 'rp-btn is-small' + (active ? ' is-active' : ''),
            disabled: !eligible || spent || props.busy,
            title: !eligible ? 'Your class can’t use this' : (spent ? 'No uses left this session' : ''),
            onClick: function () { props.onActivate(a); }
          }, spent ? 'Spent' : (active ? 'Active' : 'Activate'))
        );
      })
    );
  }

  // ── Buff & shield panel ───────────────────────────────────────────────────
  function BuffPanel(props) {
    var c = props.character;
    var savingState = useState(false); var saving = savingState[0], setSaving = savingState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];

    var slots = [c.buff_slot_1, c.buff_slot_2, c.buff_slot_3];
    var shield = c.shield_value;

    function occupied(nextSlots, nextShield) {
      var n = 0;
      nextSlots.forEach(function (s) { if (s) n++; });
      if (nextShield > 0) n++;
      return n;
    }

    async function patch(body) {
      setSaving(true); setErr('');
      try { await props.onSave(body); }
      catch (e) { setErr(e.message || 'Failed to save.'); }
      finally { setSaving(false); }
    }

    function setSlot(idx, value) {
      var next = slots.slice();
      next[idx] = value;
      if (occupied(next, shield) > 3) { setErr('Buff slots full (max 3; shield counts as one).'); return; }
      var body = {}; body['buff_slot_' + (idx + 1)] = value;
      patch(body);
    }

    function setShield(v) {
      var val = Math.max(0, Math.min(3, v));
      if (occupied(slots, val) > 3) { setErr('Buff slots full (max 3; shield counts as one).'); return; }
      patch({ shield_value: val });
    }

    return h('div', { className: 'rp-card' },
      h('h3', null, 'Buffs & Shield'),
      err ? h('div', { className: 'rp-flash error' }, err) : null,
      slots.map(function (slot, idx) {
        return h('div', { className: 'rp-buff-row', key: idx },
          h('span', { className: 'rp-buff-label' }, 'Slot ' + (idx + 1)),
          h('select', {
            className: 'rp-select', value: slot ? slot.type : '', disabled: saving,
            onChange: function (e) { setSlot(idx, e.target.value ? { type: e.target.value, value: 1 } : null); }
          },
            h('option', { value: '' }, '— empty —'),
            h('option', { value: 'attack_roll' }, 'Attack +1'),
            h('option', { value: 'defense_roll' }, 'Defense +1'),
            h('option', { value: 'heal_roll' }, 'Heal +1')
          )
        );
      }),
      h('div', { className: 'rp-buff-row' },
        h('span', { className: 'rp-buff-label' }, 'Shield'),
        h('div', { className: 'rp-stepper' },
          h('button', { type: 'button', className: 'rp-btn is-small', disabled: saving || shield <= 0,
            onClick: function () { setShield(shield - 1); } }, '−'),
          h('span', { className: 'rp-stepper-val' }, String(shield)),
          h('button', { type: 'button', className: 'rp-btn is-small', disabled: saving || shield >= 3,
            onClick: function () { setShield(shield + 1); } }, '+')
        )
      ),
      h('p', { className: 'rp-note' }, 'Stat buffs cap at +1. Shield absorbs flat damage (0–3). Max 3 slots total.')
    );
  }

  // ── Party HP panel ────────────────────────────────────────────────────────
  function PartyPanel(props) {
    var party = props.party;
    var myId = props.myId;
    return h('div', { className: 'rp-card' },
      h('h3', null, 'Party'),
      h('div', { className: 'rp-party' },
        party.map(function (p) {
          var elim = p.eliminated;
          return h('div', { className: 'rp-party-row' + (elim ? ' is-elim' : '') + (p.member_id === myId ? ' is-me' : ''), key: p.member_id },
            h('div', { className: 'rp-party-id' },
              h('strong', null, p.member_name),
              h('span', { className: 'rp-party-role' }, ROLE_LABEL[p.class_role] || p.class_role)
            ),
            h('div', { className: 'rp-party-stats' },
              h('div', { className: 'rp-stepper' },
                h('button', { type: 'button', className: 'rp-btn is-small',
                  onClick: function () { props.onHp(p, p.current_hp - 1); } }, '−'),
                h('span', { className: 'rp-hp' }, p.current_hp + ' / ' + p.max_hp),
                h('button', { type: 'button', className: 'rp-btn is-small',
                  onClick: function () { props.onHp(p, p.current_hp + 1); } }, '+')
              ),
              h('div', { className: 'rp-shield-tag' + (p.shield_value > 0 ? ' is-on' : '') },
                h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'shield'),
                h('span', null, String(p.shield_value))
              ),
              elim ? h('span', { className: 'rp-elim-tag' }, 'Eliminated') : null
            )
          );
        })
      )
    );
  }

  // ── Group bonus banner ────────────────────────────────────────────────────
  function GroupBanner(props) {
    var bonuses = props.bonuses.filter(function (g) {
      return g.eligible_roles.indexOf('all') !== -1 || g.eligible_roles.indexOf(props.classRole) !== -1;
    });
    if (!bonuses.length) return null;
    return h('div', { className: 'rp-group-banner' },
      bonuses.map(function (g) {
        var mine = g.activated_by === props.myId;
        return h('div', { className: 'rp-group-chip', key: g.id },
          h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'auto_awesome'),
          h('span', null, g.item_name + ' — ' + g.ability_name + ' (' + fmt(g.modifier_value) + ' ' + g.modifier_type.replace('_', ' ') + ')'),
          mine ? h('button', { type: 'button', className: 'rp-chip-x', title: 'Dismiss',
            onClick: function () { props.onDismiss(g); } }, '✕') : null
        );
      })
    );
  }

  // ── Main app ──────────────────────────────────────────────────────────────
  function App() {
    var sessionState = useState(PVAdminAPI.getSession());
    var session = sessionState[0];

    var dataState = useState(null);     // bootstrap payload from /rp/me/active
    var data = dataState[0], setData = dataState[1];
    var loadingState = useState(true);  var loading = loadingState[0], setLoading = loadingState[1];
    var errState = useState('');        var err = errState[0], setErr = errState[1];
    var busyState = useState(false);    var busy = busyState[0], setBusy = busyState[1];
    var activeAbilitiesState = useState([]); var activeAbilities = activeAbilitiesState[0], setActiveAbilities = activeAbilitiesState[1];

    var dataRef = useRef(null);
    dataRef.current = data;

    async function bootstrap() {
      if (!session) { setLoading(false); return; }
      try {
        var d = await PVRollAPI.request('GET', '/rp/me/active');
        setData(d);
        setErr('');
      } catch (e) {
        if (e.status === 401) { setData(null); }
        else setErr(e.message || 'Failed to load.');
      } finally {
        setLoading(false);
      }
    }

    useEffect(function () { bootstrap(); /* eslint-disable-next-line */ }, []);

    // Poll only while a session is live.
    useEffect(function () {
      if (!data || !data.active) return;
      var cid = data.campaign.id;
      var timer = setInterval(async function () {
        try {
          var s = await PVRollAPI.request('GET', '/rp/campaigns/' + cid + '/sync');
          if (!s.active) { bootstrap(); return; } // session ended -> re-gate
          var cur = dataRef.current;
          if (!cur) return;
          var me = s.party.filter(function (p) { return p.member_id === cur.character.member_id; })[0];
          // Merge ability use counts into the bootstrap ability list.
          var uses = {};
          (s.ability_uses || []).forEach(function (u) { uses[u.ability_id] = u.uses_this_session; });
          var abilities = cur.abilities.map(function (a) {
            return Object.assign({}, a, { uses_this_session: uses[a.id] != null ? uses[a.id] : a.uses_this_session });
          });
          setData(Object.assign({}, cur, {
            party: s.party,
            group_bonuses: s.group_bonuses,
            character: me || cur.character,
            abilities: abilities
          }));
        } catch (_e) { /* transient; next tick retries */ }
      }, POLL_MS);
      return function () { clearInterval(timer); };
    }, [data && data.active, data && data.campaign && data.campaign.id]);

    // ---- mutations -------------------------------------------------------
    async function refresh() {
      var cur = dataRef.current; if (!cur || !cur.active) return;
      try {
        var s = await PVRollAPI.request('GET', '/rp/campaigns/' + cur.campaign.id + '/sync');
        var me = s.party.filter(function (p) { return p.member_id === cur.character.member_id; })[0];
        setData(Object.assign({}, dataRef.current, { party: s.party, group_bonuses: s.group_bonuses, character: me || cur.character }));
      } catch (_e) {}
    }

    async function patchCharacter(memberId, body) {
      var cur = dataRef.current;
      await PVRollAPI.request('PATCH', '/rp/campaigns/' + cur.campaign.id + '/characters/' + memberId, body);
      await refresh();
    }

    function onHp(p, nextHp) {
      var hp = Math.max(0, Math.min(nextHp, p.max_hp));
      patchCharacter(p.member_id, { current_hp: hp }).catch(function (e) { setErr(e.message); });
    }

    function onSaveBuffs(body) {
      return patchCharacter(dataRef.current.character.member_id, body);
    }

    async function onActivate(a) {
      var cur = dataRef.current;
      setBusy(true); setErr('');
      try {
        var res = await PVRollAPI.request('POST', '/rp/abilities/' + a.id + '/activate', { campaign_id: cur.campaign.id });
        // self abilities become a local active modifier on this turn's stack
        if (a.target_scope === 'self') {
          setActiveAbilities(function (prev) {
            if (prev.some(function (x) { return x.id === a.id; })) return prev;
            return prev.concat([a]);
          });
        }
        // reflect the spent use immediately
        setData(function (prev) {
          if (!prev) return prev;
          return Object.assign({}, prev, {
            abilities: prev.abilities.map(function (x) {
              return x.id === a.id ? Object.assign({}, x, { uses_this_session: res.uses_this_session }) : x;
            })
          });
        });
        await refresh();
      } catch (e) { setErr(e.message || 'Failed to activate.'); }
      finally { setBusy(false); }
    }

    async function onDismissGroup(g) {
      var cur = dataRef.current;
      try { await PVRollAPI.request('DELETE', '/rp/campaigns/' + cur.campaign.id + '/group-bonuses/' + g.id); await refresh(); }
      catch (e) { setErr(e.message); }
    }

    // ---- render ----------------------------------------------------------
    if (!session) return h(LockedCard);
    if (loading) return h('div', { className: 'rp-gate' }, h('p', null, 'Loading…'));
    if (err && !data) return h('div', { className: 'rp-gate' }, h('p', { className: 'rp-flash error' }, err));
    if (!data || !data.active) {
      if (data && data.reason === 'not_linked') {
        return h(PausedCard, { title: 'Account not linked',
          message: 'Your login isn’t linked to a Free Company roster character yet. Ask an officer to add you.' });
      }
      return h(PausedCard, {});
    }

    var c = data.character;
    var ctx = {
      character: c,
      equipped: data.equipped_items || [],
      groupBonuses: data.group_bonuses || [],
      activeAbilities: activeAbilities
    };

    return h('div', { className: 'rp-tool' },
      h('header', { className: 'rp-header' },
        h('div', null,
          h('h1', null, 'Roll Calculator'),
          h('p', { className: 'rp-sub' }, data.campaign.name)
        ),
        h('div', { className: 'rp-me' },
          h('strong', null, c.member_name),
          h('span', null, ROLE_LABEL[c.class_role] + ' · ' + ARMOR_LABEL[c.armor_type])
        )
      ),
      err ? h('div', { className: 'rp-flash error' }, err) : null,

      h(GroupBanner, { bonuses: data.group_bonuses || [], classRole: c.class_role, myId: c.member_id, onDismiss: onDismissGroup }),

      activeAbilities.length ? h('div', { className: 'rp-active-note' },
        'Self abilities active this turn: ' + activeAbilities.map(function (a) { return a.name; }).join(', ') + '. ',
        h('button', { type: 'button', className: 'rp-link', onClick: function () { setActiveAbilities([]); } }, 'Clear')
      ) : null,

      h('div', { className: 'rp-grid' },
        h('div', { className: 'rp-col' },
          h(AttackPanel, { ctx: ctx }),
          h(DefensePanel, { ctx: ctx }),
          c.class_role === 'healer' ? h(HealPanel, { ctx: ctx }) : null,
          h(AbilitiesPanel, {
            abilities: data.abilities || [], classRole: c.class_role, busy: busy,
            activeIds: activeAbilities.map(function (a) { return a.id; }), onActivate: onActivate
          })
        ),
        h('div', { className: 'rp-col' },
          h(PartyPanel, { party: data.party || [], myId: c.member_id, onHp: onHp }),
          h(BuffPanel, { character: c, onSave: onSaveBuffs })
        )
      )
    );
  }

  window.RollCalculator = App;
})();
