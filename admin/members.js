// ============================================================================
//  PVAdminMembers — FC Member Directory
//
//  - List all members (sorted by name).
//  - Edit / Add open a modal popup form.
//  - Notes truncate at 20 chars with a click popover.
//  - Talked-To checkbox is ONLY visible / clickable when activity is
//    "LOA" or "Inactive"; for Active members it renders as a muted dash.
//
//  Worker routes:
//    GET    /members
//    POST   /members
//    PATCH  /members/:id
//    DELETE /members/:id          (admin only — UI gates with hasRole)
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useRef = React.useRef;

  // Authoritative OOC rank order. Also used to sort the member list —
  // primary key = rank index; secondary = name alphabetical.
  var OOC_RANKS = [
    'Phoenix Captain',
    'Quartermaster',
    'Phoenix Council',
    'Phoenix Guard',
    'Embers',
    'Firesworn',
    'Vanguard',
    'Lieutenant',
    'Operative',
    'Corsair',
    'Buccaneer',
    'Crewmate',
    'Deckhand',
    'Cinders',
    'LOA'
  ];
  var OOC_RANK_INDEX = (function () {
    var m = {};
    OOC_RANKS.forEach(function (r, i) { m[r] = i; });
    return m;
  })();

  var FACTIONS = [
    'Pirate/Mercenary',
    'Pirate',
    'Mercenary',
    'Medical',
    'Mercenary/Medical',
    'House Staff',
    'Contractor',
    'NA - No RP',
    'No Data'
  ];
  var INTERVIEWS = ['Not Started', 'Scheduled', 'Completed', 'NA - No RP', 'No Data',];
  var ACTIVITIES  = ['Active', 'LOA', 'Inactive'];

  function memberSortKey(m) {
    // Members with an unrecognised rank fall at the end, preserving
    // existing data while surfacing it for cleanup.
    var rankIdx = OOC_RANK_INDEX[m.ooc_rank];
    return [
      rankIdx == null ? OOC_RANKS.length : rankIdx,
      (m.name || '').toLowerCase()
    ];
  }
  function compareMembers(a, b) {
    var ka = memberSortKey(a), kb = memberSortKey(b);
    if (ka[0] !== kb[0]) return ka[0] - kb[0];
    return ka[1] < kb[1] ? -1 : ka[1] > kb[1] ? 1 : 0;
  }

  // Activities for which Talked-To is meaningful.
  var TALKED_TO_ACTIVITIES = ['LOA', 'Inactive'];
  function shouldShowTalkedTo(activity) {
    return TALKED_TO_ACTIVITIES.indexOf(activity) !== -1;
  }

  // --------- Note cell: "Read notes" pill button opens a modal popup ----------
  // Rows with a note render a themed button that opens the full note in a
  // modal; rows without a note render a muted dash. The button uses the
  // shared .portal-btn styles so it follows the light/dark theme instead
  // of looking like an unstyled browser button.
  function NoteCell(props) {
    var value = props.value || '';
    var label = props.label || 'Notes';
    var openState = useState(false);
    var open = openState[0], setOpen = openState[1];

    if (!value) return h('span', { style: { color: 'var(--text-secondary)' } }, '—');

    return h(React.Fragment, null,
      h('button', {
        type: 'button',
        className: 'portal-btn is-small is-ghost',
        onClick: function () { setOpen(true); }
      },
        h('span', { className: 'material-icons', 'aria-hidden': 'true', style: { fontSize: '16px' } }, 'sticky_note_2'),
        h('span', null, 'Read notes')
      ),
      open ? h(window.PVAdminModal, {
        title: label,
        onClose: function () { setOpen(false); }
      },
        h('div', { style: { whiteSpace: 'pre-wrap', fontFamily: 'Crimson Pro, serif', fontSize: '1rem' } }, value)
      ) : null
    );
  }

  // --------- Modal form body ----------
  function MemberForm(props) {
    var member = props.member || {};
    var onSave = props.onSave;
    var onCancel = props.onCancel;
    var onDelete = props.onDelete;
    var allowDelete = props.allowDelete;

    var isNew = !member.id;

    var draftState = useState({
      name: member.name || '',
      ooc_rank: member.ooc_rank || '',
      ic_rank: member.ic_rank || '',
      faction: member.faction || '',
      interview: member.interview || INTERVIEWS[0],
      activity:  member.activity  || ACTIVITIES[0],
      talked_to: !!member.talked_to,
      notes: member.notes || ''
    });
    var draft = draftState[0], setDraft = draftState[1];
    var savingState = useState(false);
    var saving = savingState[0], setSaving = savingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];

    function setField(key, val) {
      setDraft(function (d) {
        var n = Object.assign({}, d); n[key] = val;
        // If activity changes away from LOA/Inactive, reset talked_to.
        if (key === 'activity' && !shouldShowTalkedTo(val)) n.talked_to = false;
        return n;
      });
    }

    async function doSave(e) {
      if (e) e.preventDefault();
      if (!draft.name.trim() || !draft.ooc_rank.trim() || !draft.faction.trim()) {
        setErr('Name, OOC Rank, and Faction are required.');
        return;
      }
      setSaving(true); setErr('');
      try { await onSave(draft); }
      catch (e2) { setErr(e2.message || 'Save failed.'); }
      finally { setSaving(false); }
    }

    return h('form', { onSubmit: doSave },
      err ? h('div', { className: 'portal-flash error' }, err) : null,
      h('div', { className: 'portal-field-row' },
        h('div', { className: 'portal-field' },
          h('label', null, 'Name *'),
          h('input', {
            type: 'text',
            value: draft.name,
            onChange: function (e) { setField('name', e.target.value); }
          })
        ),
        h('div', { className: 'portal-field' },
          h('label', null, 'OOC Rank *'),
          h('select', {
            value: draft.ooc_rank,
            onChange: function (e) { setField('ooc_rank', e.target.value); }
          },
            h('option', { value: '' }, '— Select rank —'),
            OOC_RANKS.map(function (v) { return h('option', { key: v, value: v }, v); })
          )
        ),
        h('div', { className: 'portal-field' },
          h('label', null, 'IC Rank'),
          h('input', {
            type: 'text',
            value: draft.ic_rank,
            onChange: function (e) { setField('ic_rank', e.target.value); }
          })
        ),
        h('div', { className: 'portal-field' },
          h('label', null, 'Faction *'),
          h('select', {
            value: draft.faction,
            onChange: function (e) { setField('faction', e.target.value); }
          },
            h('option', { value: '' }, '— Select faction —'),
            FACTIONS.map(function (v) { return h('option', { key: v, value: v }, v); })
          )
        ),
        h('div', { className: 'portal-field' },
          h('label', null, 'Interview'),
          h('select', {
            value: draft.interview,
            onChange: function (e) { setField('interview', e.target.value); }
          }, INTERVIEWS.map(function (v) { return h('option', { key: v, value: v }, v); }))
        ),
        h('div', { className: 'portal-field' },
          h('label', null, 'Activity'),
          h('select', {
            value: draft.activity,
            onChange: function (e) { setField('activity', e.target.value); }
          }, ACTIVITIES.map(function (v) { return h('option', { key: v, value: v }, v); }))
        ),
        shouldShowTalkedTo(draft.activity) ? h('div', { className: 'portal-field' },
          h('label', null, 'Talked To'),
          h('label', { className: 'talked-to-cell' },
            h('input', {
              type: 'checkbox',
              checked: draft.talked_to,
              onChange: function (e) { setField('talked_to', e.target.checked); }
            }),
            h('span', null, draft.talked_to ? 'Yes' : 'No')
          )
        ) : null,
        h('div', { className: 'portal-field', style: { gridColumn: '1 / -1' } },
          h('label', null, 'Notes'),
          h('textarea', {
            value: draft.notes,
            onChange: function (e) { setField('notes', e.target.value); }
          })
        )
      ),
      h('div', { className: 'portal-form-actions' },
        h('button', {
          type: 'submit',
          className: 'portal-btn',
          disabled: saving
        }, saving ? 'Saving…' : (isNew ? 'Add member' : 'Save member')),
        h('button', {
          type: 'button',
          className: 'portal-btn is-ghost',
          onClick: onCancel,
          disabled: saving
        }, 'Cancel'),
        (!isNew && allowDelete) ? h('button', {
          type: 'button',
          className: 'portal-btn is-danger',
          style: { marginLeft: 'auto' },
          onClick: function () {
            if (confirm('Delete "' + (member.name || 'this member') + '"? This cannot be undone.')) {
              onDelete(member);
            }
          },
          disabled: saving
        }, 'Delete') : null
      )
    );
  }

  // --------- Read-only row ----------
  function ReadRow(props) {
    var m = props.member;
    var onEdit = props.onEdit;
    var onToggleTalkedTo = props.onToggleTalkedTo;

    var showTalkedTo = shouldShowTalkedTo(m.activity);

    return h('tr', null,
      h('td', null, m.name),
      h('td', null, m.ooc_rank),
      h('td', null, m.ic_rank || h('span', { style: { color: 'var(--text-secondary)' } }, '—')),
      h('td', null, m.faction),
      h('td', null, m.interview),
      h('td', null, m.activity),
      h('td', null,
        showTalkedTo
          ? h('label', { className: 'talked-to-cell' },
              h('input', {
                type: 'checkbox',
                checked: !!m.talked_to,
                onChange: function (e) { onToggleTalkedTo(m, e.target.checked); }
              }),
              h('span', null, m.talked_to ? 'Yes' : 'No')
            )
          : h('span', { style: { color: 'var(--text-secondary)' } }, '—')
      ),
      h('td', null, h(NoteCell, { value: m.notes, label: 'Notes — ' + (m.name || '') })),
      h('td', { style: { whiteSpace: 'nowrap', textAlign: 'right' } },
        h('button', {
          type: 'button',
          className: 'portal-btn is-small is-ghost',
          onClick: function () { onEdit(m); }
        }, 'Edit')
      )
    );
  }

  // --------- Main component ----------
  function Members() {
    var allowDelete = PVAdminAPI.hasRole('admin');

    var membersState = useState([]);
    var members = membersState[0], setMembers = membersState[1];

    var loadingState = useState(true);
    var loading = loadingState[0], setLoading = loadingState[1];

    var errState = useState('');
    var err = errState[0], setErr = errState[1];

    // modalMember: null = closed, {} = adding, <member> = editing.
    var modalState = useState(null);
    var modalMember = modalState[0], setModalMember = modalState[1];

    var filterState = useState('');
    var filter = filterState[0], setFilter = filterState[1];
    var rankFilterState     = useState('');
    var rankFilter     = rankFilterState[0],     setRankFilter     = rankFilterState[1];
    var factionFilterState  = useState('');
    var factionFilter  = factionFilterState[0],  setFactionFilter  = factionFilterState[1];
    var interviewFilterState = useState('');
    var interviewFilter = interviewFilterState[0], setInterviewFilter = interviewFilterState[1];
    var activityFilterState = useState('');
    var activityFilter = activityFilterState[0], setActivityFilter = activityFilterState[1];

    async function reload() {
      setErr('');
      try {
        var data = await PVAdminAPI.request('GET', '/members', undefined, true);
        setMembers(Array.isArray(data) ? data : []);
      } catch (e) {
        setErr(e.message || 'Failed to load members.');
      } finally {
        setLoading(false);
      }
    }

    useEffect(function () { reload(); }, []);

    async function handleCreate(draft) {
      await PVAdminAPI.request('POST', '/members', draft, true);
      setModalMember(null);
      await reload();
    }

    async function handleUpdate(id, draft) {
      await PVAdminAPI.request('PATCH', '/members/' + id, draft, true);
      setModalMember(null);
      await reload();
    }

    async function handleDelete(member) {
      try {
        await PVAdminAPI.request('DELETE', '/members/' + member.id, undefined, true);
        setModalMember(null);
        await reload();
      } catch (e) {
        setErr(e.message || 'Failed to delete member.');
      }
    }

    async function handleToggleTalkedTo(member, next) {
      var optimistic = members.map(function (m) {
        return m.id === member.id ? Object.assign({}, m, { talked_to: next ? 1 : 0 }) : m;
      });
      setMembers(optimistic);
      try {
        await PVAdminAPI.request('PATCH', '/members/' + member.id, { talked_to: next }, true);
      } catch (e) {
        setErr(e.message || 'Failed to update Talked-To.');
        await reload();
      }
    }

    var q = filter.trim().toLowerCase();
    var filteredBase = members.filter(function (m) {
      if (q) {
        var hit = (m.name && m.name.toLowerCase().indexOf(q) !== -1)
               || (m.faction && m.faction.toLowerCase().indexOf(q) !== -1)
               || (m.ooc_rank && m.ooc_rank.toLowerCase().indexOf(q) !== -1);
        if (!hit) return false;
      }
      if (rankFilter      && m.ooc_rank  !== rankFilter)      return false;
      if (factionFilter   && m.faction   !== factionFilter)   return false;
      if (interviewFilter && m.interview !== interviewFilter) return false;
      if (activityFilter  && m.activity  !== activityFilter)  return false;
      return true;
    });
    // Sort by OOC-rank index, then alphabetical within rank.
    var filtered = filteredBase.slice().sort(compareMembers);

    var modalOpen = modalMember !== null;
    var modalIsNew = modalOpen && !modalMember.id;

    function filterSelect(value, onChange, placeholder, options) {
      return h('select', {
        className: 'portal-filter-select',
        value: value,
        onChange: function (e) { onChange(e.target.value); }
      },
        h('option', { value: '' }, placeholder),
        options.map(function (v) { return h('option', { key: v, value: v }, v); })
      );
    }
    var anyFilterActive = filter || rankFilter || factionFilter || interviewFilter || activityFilter;

    return h('div', null,
      h('div', { className: 'portal-card' },
        h('div', { className: 'portal-card-header' },
          h('h2', { className: 'portal-card-title' }, 'Member Directory'),
          h('div', { className: 'portal-card-actions' },
            h('input', {
              type: 'search',
              className: 'portal-search',
              placeholder: 'Search name…',
              value: filter,
              onChange: function (e) { setFilter(e.target.value); }
            }),
            h('button', {
              type: 'button',
              className: 'portal-btn',
              onClick: function () { setModalMember({}); }
            },
              h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'person_add'),
              h('span', null, 'Add member')
            )
          )
        ),
        h('div', { className: 'portal-filter-row' },
          filterSelect(rankFilter,      setRankFilter,      'All OOC Ranks', OOC_RANKS),
          filterSelect(factionFilter,   setFactionFilter,   'All Factions',  FACTIONS),
          filterSelect(interviewFilter, setInterviewFilter, 'All Interviews', INTERVIEWS),
          filterSelect(activityFilter,  setActivityFilter,  'All Activity',   ACTIVITIES),
          anyFilterActive ? h('button', {
            type: 'button',
            className: 'portal-btn is-ghost is-small',
            onClick: function () {
              setFilter(''); setRankFilter(''); setFactionFilter('');
              setInterviewFilter(''); setActivityFilter('');
            }
          }, 'Clear filters') : null
        ),
        err ? h('div', { className: 'portal-flash error' }, err) : null,
        loading
          ? h('p', { style: { color: 'var(--text-secondary)' } }, 'Loading members…')
          : h('div', { className: 'portal-table-wrap' },
              h('table', { className: 'portal-table' },
                h('thead', null,
                  h('tr', null,
                    h('th', null, 'Name'),
                    h('th', null, 'OOC Rank'),
                    h('th', null, 'IC Rank'),
                    h('th', null, 'Faction'),
                    h('th', null, 'Interview'),
                    h('th', null, 'Activity'),
                    h('th', null, 'Talked To'),
                    h('th', null, 'Notes'),
                    h('th', { style: { textAlign: 'right', width: '1%', whiteSpace: 'nowrap' } }, '')
                  )
                ),
                h('tbody', null,
                  filtered.length
                    ? filtered.map(function (m) {
                        return h(ReadRow, {
                          key: m.id,
                          member: m,
                          onEdit: function (member) { setModalMember(member); },
                          onToggleTalkedTo: handleToggleTalkedTo
                        });
                      })
                    : h('tr', null,
                        h('td', {
                          colSpan: 9,
                          style: { color: 'var(--text-secondary)', textAlign: 'center', padding: '1.5rem' }
                        }, filter ? 'No members match your filter.' : 'No members yet. Click “Add member” to create the first.')
                      )
                )
              )
            )
      ),
      modalOpen ? h(window.PVAdminModal, {
        title: modalIsNew ? 'New Member' : 'Edit Member — ' + (modalMember.name || ''),
        size: 'lg',
        onClose: function () { setModalMember(null); }
      },
        h(MemberForm, {
          member: modalMember,
          onSave: function (draft) {
            return modalIsNew ? handleCreate(draft) : handleUpdate(modalMember.id, draft);
          },
          onCancel: function () { setModalMember(null); },
          onDelete: handleDelete,
          allowDelete: allowDelete
        })
      ) : null
    );
  }

  window.PVAdminMembers = Members;
})();
