// ============================================================================
//  PVAdminMembers — FC Member Directory
//
//  - List all members (sorted by name).
//  - Inline-editable rows (double-click or "Edit" -> row becomes a form).
//  - "Add member" row at the top.
//  - Notes truncate at 20 chars with a click popover.
//  - Scroll position on the main panel is preserved across edit/save via
//    the `data-scroll-main` attribute (set by portal.js).
//
//  Worker routes used (see admin-portal/workers/pv-med-database-worker.js):
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

  // Suggestion lists for the dropdown fields. These are hints only; the worker
  // stores whatever text we send, matching the visits.discharge_status pattern.
  var OOC_RANKS = [
    'Leader',
    'Captain',
    'Officer',
    'Quartermaster',
    'Archivist',
    'Herald',
    'Chief',
    'Senior Mercenary',
    'Mercenary',
    'Senior Medic',
    'Medic',
    'Apprentice',
    'Recruit',
    'Guest',
    'Alumni'
  ];
  var FACTIONS = [
    'Medical Division',
    'Mercenary Division',
    'Pirate Division',
    'Leadership',
    'Unassigned'
  ];
  var INTERVIEWS = ['Not Started', 'Scheduled', 'Completed'];
  var ACTIVITIES  = ['Active', 'LOA', 'Inactive'];

  var NOTE_TRUNCATE = 20;

  // --------- Note cell with popover ----------
  function NoteCell(props) {
    var value = props.value || '';
    var openState = useState(false);
    var open = openState[0], setOpen = openState[1];
    var wrapRef = useRef(null);

    useEffect(function () {
      if (!open) return;
      function onDoc(e) {
        if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
      }
      document.addEventListener('mousedown', onDoc);
      return function () { document.removeEventListener('mousedown', onDoc); };
    }, [open]);

    if (!value) return h('span', { style: { color: 'var(--text-secondary)' } }, '—');
    if (value.length <= NOTE_TRUNCATE) return h('span', null, value);

    return h('span', { className: 'note-cell', ref: wrapRef },
      h('span', {
        className: 'note-cell-trigger',
        onClick: function () { setOpen(!open); }
      }, value.slice(0, NOTE_TRUNCATE) + '…'),
      open ? h('span', { className: 'note-cell-popover' }, value) : null
    );
  }

  // --------- Row editor ----------
  function EditRow(props) {
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

    function setField(key, val) {
      setDraft(function (d) {
        var n = Object.assign({}, d); n[key] = val; return n;
      });
    }

    async function doSave() {
      if (!draft.name.trim() || !draft.ooc_rank.trim() || !draft.faction.trim()) return;
      setSaving(true);
      try { await onSave(draft); }
      finally { setSaving(false); }
    }

    function input(key, placeholder, datalistId) {
      return h('input', {
        type: 'text',
        value: draft[key],
        placeholder: placeholder || '',
        list: datalistId,
        onChange: function (e) { setField(key, e.target.value); }
      });
    }

    return h('tr', null,
      h('td', null, input('name', 'Name')),
      h('td', null,
        input('ooc_rank', 'OOC rank', 'ooc-ranks'),
        h('datalist', { id: 'ooc-ranks' },
          OOC_RANKS.map(function (v) { return h('option', { key: v, value: v }); }))
      ),
      h('td', null, input('ic_rank', 'IC rank')),
      h('td', null,
        input('faction', 'Faction', 'factions'),
        h('datalist', { id: 'factions' },
          FACTIONS.map(function (v) { return h('option', { key: v, value: v }); }))
      ),
      h('td', null,
        h('select', {
          value: draft.interview,
          onChange: function (e) { setField('interview', e.target.value); }
        }, INTERVIEWS.map(function (v) { return h('option', { key: v, value: v }, v); }))
      ),
      h('td', null,
        h('select', {
          value: draft.activity,
          onChange: function (e) { setField('activity', e.target.value); }
        }, ACTIVITIES.map(function (v) { return h('option', { key: v, value: v }, v); }))
      ),
      h('td', null,
        h('label', { className: 'talked-to-cell' },
          h('input', {
            type: 'checkbox',
            checked: draft.talked_to,
            onChange: function (e) { setField('talked_to', e.target.checked); }
          }),
          h('span', null, draft.talked_to ? 'Yes' : 'No')
        )
      ),
      h('td', null,
        h('input', {
          type: 'text',
          value: draft.notes,
          placeholder: 'Notes',
          onChange: function (e) { setField('notes', e.target.value); }
        })
      ),
      h('td', { style: { whiteSpace: 'nowrap' } },
        h('button', {
          type: 'button',
          className: 'portal-btn is-small',
          onClick: doSave,
          disabled: saving
        }, saving ? 'Saving…' : (isNew ? 'Add' : 'Save')),
        ' ',
        h('button', {
          type: 'button',
          className: 'portal-btn is-small is-ghost',
          onClick: onCancel,
          disabled: saving
        }, 'Cancel'),
        (!isNew && allowDelete) ? h('span', null, ' ',
          h('button', {
            type: 'button',
            className: 'portal-btn is-small is-danger',
            onClick: function () {
              if (confirm('Delete "' + (member.name || 'this member') + '"? This cannot be undone.')) {
                onDelete(member);
              }
            },
            disabled: saving
          }, 'Delete')
        ) : null
      )
    );
  }

  // --------- Read-only row ----------
  function ReadRow(props) {
    var m = props.member;
    var onEdit = props.onEdit;
    var onToggleTalkedTo = props.onToggleTalkedTo;

    return h('tr', null,
      h('td', null, m.name),
      h('td', null, m.ooc_rank),
      h('td', null, m.ic_rank || h('span', { style: { color: 'var(--text-secondary)' } }, '—')),
      h('td', null, m.faction),
      h('td', null, m.interview),
      h('td', null, m.activity),
      h('td', null,
        h('label', { className: 'talked-to-cell' },
          h('input', {
            type: 'checkbox',
            checked: !!m.talked_to,
            onChange: function (e) { onToggleTalkedTo(m, e.target.checked); }
          }),
          h('span', null, m.talked_to ? 'Yes' : 'No')
        )
      ),
      h('td', null, h(NoteCell, { value: m.notes })),
      h('td', { style: { whiteSpace: 'nowrap' } },
        h('button', {
          type: 'button',
          className: 'portal-btn is-small is-ghost',
          onClick: function () { onEdit(m.id); }
        }, 'Edit')
      )
    );
  }

  // --------- Main component ----------
  function Members(props) {
    var allowDelete = PVAdminAPI.hasRole('admin');

    var membersState = useState([]);
    var members = membersState[0], setMembers = membersState[1];

    var loadingState = useState(true);
    var loading = loadingState[0], setLoading = loadingState[1];

    var errState = useState('');
    var err = errState[0], setErr = errState[1];

    var editIdState = useState(null);
    var editId = editIdState[0], setEditId = editIdState[1];

    var addingState = useState(false);
    var adding = addingState[0], setAdding = addingState[1];

    var filterState = useState('');
    var filter = filterState[0], setFilter = filterState[1];

    // Scroll-preservation: capture before an edit/save, restore after the
    // render with the freshly returned list.
    var savedScrollRef = useRef(null);

    function captureScroll() {
      var main = document.querySelector('[data-scroll-main]');
      savedScrollRef.current = main ? main.scrollTop : null;
    }
    function restoreScroll() {
      if (savedScrollRef.current == null) return;
      var y = savedScrollRef.current;
      requestAnimationFrame(function () {
        var main = document.querySelector('[data-scroll-main]');
        if (main) main.scrollTop = y;
        savedScrollRef.current = null;
      });
    }

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
      captureScroll();
      try {
        await PVAdminAPI.request('POST', '/members', draft, true);
        setAdding(false);
        await reload();
        restoreScroll();
      } catch (e) {
        setErr(e.message || 'Failed to add member.');
      }
    }

    async function handleUpdate(id, draft) {
      captureScroll();
      try {
        await PVAdminAPI.request('PATCH', '/members/' + id, draft, true);
        setEditId(null);
        await reload();
        restoreScroll();
      } catch (e) {
        setErr(e.message || 'Failed to save member.');
      }
    }

    async function handleDelete(member) {
      captureScroll();
      try {
        await PVAdminAPI.request('DELETE', '/members/' + member.id, undefined, true);
        setEditId(null);
        await reload();
        restoreScroll();
      } catch (e) {
        setErr(e.message || 'Failed to delete member.');
      }
    }

    async function handleToggleTalkedTo(member, next) {
      // Inline toggle without switching to the full edit row.
      captureScroll();
      var optimistic = members.map(function (m) {
        return m.id === member.id ? Object.assign({}, m, { talked_to: next ? 1 : 0 }) : m;
      });
      setMembers(optimistic);
      try {
        await PVAdminAPI.request('PATCH', '/members/' + member.id, { talked_to: next }, true);
        restoreScroll();
      } catch (e) {
        setErr(e.message || 'Failed to update Talked-To.');
        // Revert on failure.
        await reload();
      }
    }

    var filtered = filter
      ? members.filter(function (m) {
          var q = filter.toLowerCase();
          return (m.name && m.name.toLowerCase().indexOf(q) !== -1)
              || (m.faction && m.faction.toLowerCase().indexOf(q) !== -1)
              || (m.ooc_rank && m.ooc_rank.toLowerCase().indexOf(q) !== -1);
        })
      : members;

    return h('div', null,
      h('div', { className: 'portal-card' },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' } },
          h('h2', { className: 'portal-card-title', style: { margin: 0, flex: 1 } }, 'Member Directory'),
          h('input', {
            type: 'search',
            placeholder: 'Filter by name, faction, rank…',
            value: filter,
            onChange: function (e) { setFilter(e.target.value); },
            style: {
              background: 'var(--form-input-bg)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              padding: '0.4rem 0.6rem',
              borderRadius: '4px',
              minWidth: '16rem'
            }
          }),
          h('button', {
            type: 'button',
            className: 'portal-btn',
            onClick: function () { setAdding(true); setEditId(null); },
            disabled: adding
          },
            h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'person_add'),
            h('span', null, 'Add member')
          )
        ),
        err ? h('div', { className: 'portal-flash error' }, err) : null,
        loading
          ? h('p', { style: { color: 'var(--text-secondary)' } }, 'Loading members…')
          : h('div', { style: { overflowX: 'auto' } },
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
                    h('th', null, '')
                  )
                ),
                h('tbody', null,
                  adding ? h(EditRow, {
                    key: '__new',
                    member: null,
                    onSave: handleCreate,
                    onCancel: function () { setAdding(false); },
                    onDelete: function () {},
                    allowDelete: false
                  }) : null,
                  filtered.map(function (m) {
                    if (editId === m.id) {
                      return h(EditRow, {
                        key: m.id,
                        member: m,
                        onSave: function (draft) { return handleUpdate(m.id, draft); },
                        onCancel: function () { setEditId(null); },
                        onDelete: handleDelete,
                        allowDelete: allowDelete
                      });
                    }
                    return h(ReadRow, {
                      key: m.id,
                      member: m,
                      onEdit: function (id) { setEditId(id); setAdding(false); },
                      onToggleTalkedTo: handleToggleTalkedTo
                    });
                  }),
                  (!adding && !filtered.length)
                    ? h('tr', null,
                        h('td', {
                          colSpan: 9,
                          style: { color: 'var(--text-secondary)', textAlign: 'center', padding: '1.5rem' }
                        }, filter ? 'No members match your filter.' : 'No members yet. Click “Add member” to create the first.')
                      )
                    : null
                )
              )
            )
      )
    );
  }

  window.PVAdminMembers = Members;
})();
