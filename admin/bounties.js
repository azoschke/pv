// ============================================================================
//  PVAdminBounties — Bounty Board management (officer | admin)
//
//  Two cards:
//    1. Needs review — member-submitted quests awaiting approval and
//       member-proposed edits to listed quests (shown as a current → proposed
//       diff). Approve / reject from here.
//    2. All quests — full table with schedule, status, signup counts and a
//       "Past date" indicator for one-off scheduled quests whose date has
//       passed (nothing auto-hides; officers re-date, hide or delete).
//
//  Worker routes:
//    GET    /quests/admin             officer | admin
//    POST   /quests                   (officer create -> listed by default)
//    PATCH  /quests/:id               officer | admin
//    DELETE /quests/:id               officer | admin
//    POST   /quest-edits/:id/approve  officer | admin
//    DELETE /quest-edits/:id          officer | admin (reject)
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useMemo = React.useMemo;

  var U = window.PVAdminQuestUtils;

  var STATUS_PILL = {
    pending: { label: 'Pending', cls: 'portal-pill is-gold' },
    listed:  { label: 'Listed',  cls: 'portal-pill is-green' },
    hidden:  { label: 'Hidden',  cls: 'portal-pill is-muted' }
  };

  // Human labels for the fields a proposed edit may touch, in display order.
  var EDIT_FIELDS = [
    ['title', 'Title'],
    ['schedule_mode', 'Schedule'],
    ['scheduled_at', 'Date/time'],
    ['cadence_note', 'Cadence'],
    ['reward', 'Reward'],
    ['contact', 'Contact'],
    ['image_url', 'Image'],
    ['description', 'Description']
  ];

  function fieldDisplay(key, value) {
    if (value == null || value === '') return '—';
    if (key === 'scheduled_at') return U.formatLocal(value) || String(value);
    if (key === 'schedule_mode') return U.SCHEDULE_PILL[value] || String(value);
    return String(value);
  }

  // --------- Proposed-edit review (current vs proposed) ----------
  function EditDiff(props) {
    var quest = props.quest;
    var edit = props.edit;
    var payload = edit.payload || {};

    var rows = EDIT_FIELDS.filter(function (f) { return payload[f[0]] !== undefined; });

    return h('div', null,
      h('p', { style: { margin: '0 0 0.75rem', color: 'var(--text-secondary)', fontSize: '0.92rem' } },
        'Proposed by ' + (edit.submitted_by_name || 'a member') + ' on ' +
        (U.formatLocal(edit.created_at) || edit.created_at) + '. Approving applies these changes to the listed quest.'
      ),
      h('div', { className: 'portal-table-wrap' },
        h('table', { className: 'portal-table' },
          h('thead', null,
            h('tr', null,
              h('th', null, 'Field'),
              h('th', null, 'Current'),
              h('th', null, 'Proposed')
            )
          ),
          h('tbody', null,
            rows.map(function (f) {
              var key = f[0], label = f[1];
              return h('tr', { key: key },
                h('td', { style: { fontWeight: 600, whiteSpace: 'nowrap' } }, label),
                h('td', { style: { whiteSpace: 'pre-wrap' } }, fieldDisplay(key, quest[key])),
                h('td', { style: { whiteSpace: 'pre-wrap' } }, fieldDisplay(key, payload[key]))
              );
            })
          )
        )
      )
    );
  }

  // --------- Read-only quest details (for reviewing submissions) ----------
  function QuestPreview(props) {
    var q = props.quest;
    function row(label, value) {
      if (!value) return null;
      return h('div', { className: 'portal-field', style: { marginBottom: '0.6rem' } },
        h('label', null, label),
        h('p', { style: { margin: 0, whiteSpace: 'pre-wrap' } }, value)
      );
    }
    return h('div', null,
      row('Title', q.title),
      row('Submitted by', q.submitted_by_name),
      row('Schedule', U.scheduleSummary(q)),
      row('Reward', q.reward),
      row('Contact', q.contact),
      q.image_url ? h('div', { className: 'portal-field', style: { marginBottom: '0.6rem' } },
        h('label', null, 'Image'),
        h('img', {
          src: q.image_url, alt: '',
          style: { maxWidth: '320px', maxHeight: '180px', border: '1px solid var(--border-color)', borderRadius: '0.3rem', objectFit: 'cover' },
          onError: function (e) { e.target.style.display = 'none'; }
        })
      ) : null,
      row('Description', q.description)
    );
  }

  // --------- Main component ----------
  function Bounties() {
    var questsState = useState([]);
    var quests = questsState[0], setQuests = questsState[1];
    var loadingState = useState(true);
    var loading = loadingState[0], setLoading = loadingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];
    var flashState = useState('');
    var flash = flashState[0], setFlash = flashState[1];

    // null | { kind: 'form', quest: q|null } | { kind: 'review', quest }
    //      | { kind: 'diff', quest, edit }
    var modalState = useState(null);
    var modal = modalState[0], setModal = modalState[1];

    var queryState = useState('');
    var query = queryState[0], setQuery = queryState[1];

    function flashFor(msg) {
      setFlash(msg);
      setTimeout(function () { setFlash(''); }, 3500);
    }

    async function reload() {
      setErr('');
      try {
        var data = await PVAdminAPI.request('GET', '/quests/admin', undefined, true);
        setQuests(Array.isArray(data) ? data : []);
      } catch (e) {
        setErr(e.message || 'Failed to load quests.');
      } finally {
        setLoading(false);
      }
    }

    useEffect(function () { reload(); }, []);

    var pendingQuests = quests.filter(function (q) { return q.status === 'pending'; });
    var pendingEdits = [];
    quests.forEach(function (q) {
      (q.pending_edits || []).forEach(function (e) {
        pendingEdits.push({ quest: q, edit: e });
      });
    });

    var filtered = useMemo(function () {
      var s = query.trim().toLowerCase();
      if (!s) return quests;
      return quests.filter(function (q) {
        var hay = [
          q.title || '', q.description || '', q.reward || '',
          q.contact || '', q.submitted_by_name || '', q.status || ''
        ].join(' ').toLowerCase();
        return hay.indexOf(s) !== -1;
      });
    }, [quests, query]);

    async function patchQuest(id, body, msg) {
      try {
        await PVAdminAPI.request('PATCH', '/quests/' + id, body, true);
        flashFor(msg);
        setModal(null);
        await reload();
      } catch (e) {
        setErr(e.message || 'Update failed.');
      }
    }

    async function handleSave(payload) {
      if (modal && modal.kind === 'form' && modal.quest) {
        await PVAdminAPI.request('PATCH', '/quests/' + modal.quest.id, payload, true);
        flashFor('Quest updated.');
      } else {
        await PVAdminAPI.request('POST', '/quests', payload, true);
        flashFor('Quest created.');
      }
      setModal(null);
      await reload();
    }

    async function handleDelete(q) {
      if (!confirm('Delete "' + q.title + '"? Signups and pending edits are removed too.')) return;
      try {
        await PVAdminAPI.request('DELETE', '/quests/' + q.id, undefined, true);
        flashFor('Quest deleted.');
        setModal(null);
        await reload();
      } catch (e) {
        setErr(e.message || 'Delete failed.');
      }
    }

    async function approveEdit(item) {
      try {
        await PVAdminAPI.request('POST', '/quest-edits/' + item.edit.id + '/approve', {}, true);
        flashFor('Edit approved and applied.');
        setModal(null);
        await reload();
      } catch (e) {
        setErr(e.message || 'Approve failed.');
      }
    }

    async function rejectEdit(item) {
      if (!confirm('Reject this proposed edit to "' + item.quest.title + '"?')) return;
      try {
        await PVAdminAPI.request('DELETE', '/quest-edits/' + item.edit.id, undefined, true);
        flashFor('Edit rejected.');
        setModal(null);
        await reload();
      } catch (e) {
        setErr(e.message || 'Reject failed.');
      }
    }

    // ----- Needs review card -----
    var reviewCard = (pendingQuests.length || pendingEdits.length) ? h('div', { className: 'portal-card' },
      h('h2', { className: 'portal-card-title' }, 'Needs Review'),

      pendingQuests.map(function (q) {
        return h('div', {
          key: 'q' + q.id,
          style: { display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.35rem 0', flexWrap: 'wrap' }
        },
          h('span', { className: 'portal-pill is-gold' }, 'New submission'),
          h('span', { style: { flex: 1, fontWeight: 600 } },
            q.title + (q.submitted_by_name ? ' — ' + q.submitted_by_name : '')),
          h('button', {
            type: 'button', className: 'portal-btn is-small is-ghost',
            onClick: function () { setModal({ kind: 'review', quest: q }); }
          }, 'Review'),
          h('button', {
            type: 'button', className: 'portal-btn is-small',
            onClick: function () { patchQuest(q.id, { status: 'listed' }, 'Quest approved and listed.'); }
          }, 'Approve'),
          h('button', {
            type: 'button', className: 'portal-btn is-small is-danger',
            onClick: function () { handleDelete(q); }
          }, 'Reject')
        );
      }),

      pendingEdits.map(function (item) {
        return h('div', {
          key: 'e' + item.edit.id,
          style: { display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.35rem 0', flexWrap: 'wrap' }
        },
          h('span', { className: 'portal-pill is-gold' }, 'Edit'),
          h('span', { style: { flex: 1, fontWeight: 600 } },
            item.quest.title + (item.edit.submitted_by_name ? ' — ' + item.edit.submitted_by_name : '')),
          h('button', {
            type: 'button', className: 'portal-btn is-small is-ghost',
            onClick: function () { setModal({ kind: 'diff', quest: item.quest, edit: item.edit }); }
          }, 'Review'),
          h('button', {
            type: 'button', className: 'portal-btn is-small',
            onClick: function () { approveEdit(item); }
          }, 'Approve'),
          h('button', {
            type: 'button', className: 'portal-btn is-small is-danger',
            onClick: function () { rejectEdit(item); }
          }, 'Reject')
        );
      })
    ) : null;

    // ----- All quests table -----
    function QuestRow(props) {
      var q = props.quest;
      var pill = STATUS_PILL[q.status] || STATUS_PILL.hidden;
      var past = U.isPastQuest(q);
      var signupCount = (q.signups || []).length;
      return h('tr', null,
        h('td', null,
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' } },
            h('span', { style: { fontWeight: 600 } }, q.title),
            past ? h('span', { className: 'portal-pill is-red' }, 'Past date') : null
          ),
          q.submitted_by_name ? h('div', { style: { color: 'var(--text-secondary)', fontSize: '0.85rem' } },
            'by ' + q.submitted_by_name) : null
        ),
        h('td', null, U.scheduleSummary(q)),
        h('td', null, h('span', { className: pill.cls }, pill.label)),
        h('td', { style: { textAlign: 'center' } }, signupCount),
        h('td', { style: { whiteSpace: 'nowrap', textAlign: 'right' } },
          h('button', {
            type: 'button', className: 'portal-btn is-small is-ghost',
            onClick: function () { setModal({ kind: 'form', quest: q }); }
          }, 'Edit'),
          h('button', {
            type: 'button', className: 'portal-btn is-small is-danger',
            style: { marginLeft: '0.4rem' },
            onClick: function () { handleDelete(q); }
          }, 'Delete')
        )
      );
    }

    var modalEl = null;
    if (modal && modal.kind === 'form') {
      var signups = (modal.quest && modal.quest.signups) || [];
      modalEl = h(window.PVAdminModal, {
        title: modal.quest ? ('Edit quest — ' + modal.quest.title) : 'New quest',
        size: 'lg',
        onClose: function () { setModal(null); }
      },
        signups.length ? h('div', { className: 'portal-field' },
          h('label', null, 'Signed up (' + signups.length + ')'),
          h('div', { className: 'portal-faction-tags' },
            signups.map(function (s) {
              return h('span', { key: s.member_id, className: 'portal-faction-tag' }, s.member_name);
            })
          )
        ) : null,
        h(window.PVAdminQuestForm, {
          quest: modal.quest,
          withStatus: true,
          saveLabel: modal.quest ? 'Save quest' : 'Create quest',
          onSave: handleSave,
          onCancel: function () { setModal(null); }
        })
      );
    } else if (modal && modal.kind === 'review') {
      modalEl = h(window.PVAdminModal, {
        title: 'Review submission — ' + modal.quest.title,
        size: 'lg',
        onClose: function () { setModal(null); }
      },
        h(QuestPreview, { quest: modal.quest }),
        h('div', { className: 'portal-form-actions' },
          h('button', {
            type: 'button', className: 'portal-btn',
            onClick: function () { patchQuest(modal.quest.id, { status: 'listed' }, 'Quest approved and listed.'); }
          }, 'Approve & list'),
          h('button', {
            type: 'button', className: 'portal-btn is-ghost',
            onClick: function () { setModal({ kind: 'form', quest: modal.quest }); }
          }, 'Edit first'),
          h('button', {
            type: 'button', className: 'portal-btn is-danger', style: { marginLeft: 'auto' },
            onClick: function () { handleDelete(modal.quest); }
          }, 'Reject & delete')
        )
      );
    } else if (modal && modal.kind === 'diff') {
      modalEl = h(window.PVAdminModal, {
        title: 'Proposed edit — ' + modal.quest.title,
        size: 'lg',
        onClose: function () { setModal(null); }
      },
        h(EditDiff, { quest: modal.quest, edit: modal.edit }),
        h('div', { className: 'portal-form-actions' },
          h('button', {
            type: 'button', className: 'portal-btn',
            onClick: function () { approveEdit({ quest: modal.quest, edit: modal.edit }); }
          }, 'Approve & apply'),
          h('button', {
            type: 'button', className: 'portal-btn is-danger', style: { marginLeft: 'auto' },
            onClick: function () { rejectEdit({ quest: modal.quest, edit: modal.edit }); }
          }, 'Reject')
        )
      );
    }

    return h('div', null,
      h('div', { className: 'portal-card', style: { padding: '0.85rem 1.1rem' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' } },
          h('h2', { className: 'portal-card-title', style: { margin: 0, flex: 1 } }, 'Bounty Board'),
          h('input', {
            type: 'search',
            className: 'portal-search',
            value: query,
            onChange: function (e) { setQuery(e.target.value); },
            placeholder: 'Search title, reward, member…'
          }),
          h('button', {
            type: 'button', className: 'portal-btn is-small',
            onClick: function () { setModal({ kind: 'form', quest: null }); }
          }, 'New quest')
        ),
        h('p', { style: { margin: '0.6rem 0 0', color: 'var(--text-secondary)', fontSize: '0.92rem' } },
          'Quests never hide themselves: a one-off whose date has passed gets a "Past date" pill here — re-date it, hide it, or delete it. Repeatable quests just need their next run set after each outing.'
        ),
        flash ? h('div', { className: 'portal-flash success', style: { marginTop: '0.75rem', marginBottom: 0 } }, flash) : null
      ),

      err ? h('div', { className: 'portal-card' },
        h('div', { className: 'portal-flash error' }, err)
      ) : null,

      reviewCard,

      loading
        ? h('div', { className: 'portal-card' }, 'Loading quests…')
        : !filtered.length
          ? h('div', { className: 'portal-card' },
              h('p', { style: { color: 'var(--text-secondary)', margin: 0 } },
                quests.length ? 'No quests match that search.' : 'No quests yet — create one or wait for member submissions.'
              )
            )
          : h('div', { className: 'portal-card' },
              h('div', { className: 'portal-table-wrap' },
                h('table', { className: 'portal-table' },
                  h('thead', null,
                    h('tr', null,
                      h('th', null, 'Title'),
                      h('th', null, 'Schedule'),
                      h('th', null, 'Status'),
                      h('th', { style: { textAlign: 'center' } }, 'Signups'),
                      h('th', { style: { textAlign: 'right', width: '1%', whiteSpace: 'nowrap' } }, '')
                    )
                  ),
                  h('tbody', null,
                    filtered.map(function (q) {
                      return h(QuestRow, { key: q.id, quest: q });
                    })
                  )
                )
              )
            ),

      modalEl
    );
  }

  window.PVAdminBounties = Bounties;
})();
