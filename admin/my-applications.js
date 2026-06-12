// ============================================================================
//  PVAdminMyApplications — member self-service activity section
//
//  Visible to every logged-in account. Three cards:
//    1. My Quest Submissions — submit new quests (live after officer
//       approval), edit them (edits to listed quests queue for approval),
//       withdraw pending ones.
//    2. My Quest Signups — quests the member has signed up for on the public
//       Bounty Board; withdrawable anytime.
//    3. My Job Applications — status of public job board applications;
//       withdrawable while still unreviewed.
//
//  Worker routes (all authed, no special role):
//    GET  /my/quests        POST /quests      PATCH/DELETE /my/quests/:id
//    DELETE /quest-edits/:id                  (cancel own proposed edit)
//    GET  /my/signups       DELETE /quests/:id/signups
//    GET  /my/applications  DELETE /my/applications/:id
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;

  var QUEST_STATUS_PILL = {
    pending: { label: 'Pending approval', cls: 'portal-pill is-gold' },
    listed:  { label: 'Listed',           cls: 'portal-pill is-green' },
    hidden:  { label: 'Hidden',           cls: 'portal-pill is-muted' }
  };

  var APP_STAGE_PILL = {
    new:       { label: 'Submitted',           cls: 'portal-pill is-gold' },
    scheduled: { label: 'Interview scheduled', cls: 'portal-pill is-green' },
    accepted:  { label: 'Accepted',            cls: 'portal-pill is-green' },
    declined:  { label: 'Declined',            cls: 'portal-pill is-muted' }
  };

  function fmtDate(s) {
    if (!s) return '';
    var t = Date.parse(String(s).replace(' ', 'T') + 'Z');
    if (isNaN(t)) return s;
    return new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  // --------- My quest submissions card ----------
  function MyQuestsCard(props) {
    var data = props.data;           // { quests: [], edits: [] }
    var onChanged = props.onChanged;
    var onError = props.onError;

    var modalState = useState(null); // null | { quest: q|null }
    var modal = modalState[0], setModal = modalState[1];
    var flashState = useState('');
    var flash = flashState[0], setFlash = flashState[1];

    function flashFor(msg) {
      setFlash(msg);
      setTimeout(function () { setFlash(''); }, 4500);
    }

    async function handleSave(payload) {
      if (modal && modal.quest) {
        var res = await PVAdminAPI.request('PATCH', '/my/quests/' + modal.quest.id, payload, true);
        flashFor(res && res.mode === 'edit_pending'
          ? 'Edit submitted — it will go live once an officer approves it.'
          : 'Submission updated.');
      } else {
        // as_submission routes officers/admins through the same pending-
        // approval flow as members, tracked under their own submissions.
        // (Direct, instantly-listed creation lives in the Bounty Board section.)
        await PVAdminAPI.request('POST', '/quests',
          Object.assign({}, payload, { as_submission: true }), true);
        flashFor('Quest submitted! It will appear on the public board once an officer approves it.');
      }
      setModal(null);
      onChanged();
    }

    async function handleWithdraw(q) {
      if (!confirm('Withdraw "' + q.title + '"? This deletes the pending submission.')) return;
      try {
        await PVAdminAPI.request('DELETE', '/my/quests/' + q.id, undefined, true);
        flashFor('Submission withdrawn.');
        onChanged();
      } catch (e) {
        onError(e.message || 'Failed to withdraw.');
      }
    }

    async function handleCancelEdit(edit) {
      if (!confirm('Cancel your proposed edit to "' + edit.quest_title + '"?')) return;
      try {
        await PVAdminAPI.request('DELETE', '/quest-edits/' + edit.id, undefined, true);
        flashFor('Proposed edit cancelled.');
        onChanged();
      } catch (e) {
        onError(e.message || 'Failed to cancel the edit.');
      }
    }

    var quests = (data && data.quests) || [];
    var edits = (data && data.edits) || [];

    return h('div', { className: 'portal-card' },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' } },
        h('h2', { className: 'portal-card-title', style: { margin: 0, flex: 1 } }, 'My Quest Submissions'),
        h('button', {
          type: 'button', className: 'portal-btn is-small',
          onClick: function () { setModal({ quest: null }); }
        }, 'New submission')
      ),
      h('p', { style: { margin: '0.6rem 0 0', color: 'var(--text-secondary)', fontSize: '0.92rem' } },
        'Submissions go live on the public Bounty Board after an officer approves them. ' +
        'Edits to an already-listed quest are also reviewed before they apply.'
      ),

      flash ? h('div', { className: 'portal-flash success', style: { marginTop: '0.75rem' } }, flash) : null,

      quests.length ? h('div', { className: 'portal-table-wrap', style: { marginTop: '0.85rem' } },
        h('table', { className: 'portal-table' },
          h('thead', null,
            h('tr', null,
              h('th', null, 'Title'),
              h('th', null, 'Type'),
              h('th', null, 'Schedule'),
              h('th', null, 'Status'),
              h('th', { style: { textAlign: 'right', width: '1%', whiteSpace: 'nowrap' } }, '')
            )
          ),
          h('tbody', null,
            quests.map(function (q) {
              var pill = QUEST_STATUS_PILL[q.status] || QUEST_STATUS_PILL.hidden;
              return h('tr', { key: q.id },
                h('td', { style: { fontWeight: 600 } }, q.title),
                h('td', null, q.mission_type || '—'),
                h('td', null, PVAdminQuestUtils.scheduleSummary(q)),
                h('td', null, h('span', { className: pill.cls }, pill.label)),
                h('td', { style: { whiteSpace: 'nowrap', textAlign: 'right' } },
                  h('button', {
                    type: 'button', className: 'portal-btn is-small is-ghost',
                    onClick: function () { setModal({ quest: q }); }
                  }, 'Edit'),
                  q.status === 'pending' ? h('button', {
                    type: 'button', className: 'portal-btn is-small is-danger',
                    style: { marginLeft: '0.4rem' },
                    onClick: function () { handleWithdraw(q); }
                  }, 'Withdraw') : null
                )
              );
            })
          )
        )
      ) : h('p', { style: { marginTop: '0.85rem', color: 'var(--text-secondary)' } },
        'Nothing yet — submit a quest or bounty for the public board.'
      ),

      edits.length ? h('div', { style: { marginTop: '0.85rem' } },
        h('p', { style: { margin: '0 0 0.4rem', fontWeight: 600 } }, 'Proposed edits awaiting approval'),
        edits.map(function (e) {
          return h('div', {
            key: e.id,
            style: { display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.3rem 0' }
          },
            h('span', { className: 'portal-pill is-gold' }, 'Edit pending'),
            h('span', { style: { flex: 1 } }, e.quest_title),
            h('button', {
              type: 'button', className: 'portal-btn is-small is-ghost',
              onClick: function () { handleCancelEdit(e); }
            }, 'Cancel')
          );
        })
      ) : null,

      modal ? h(window.PVAdminModal, {
        title: modal.quest ? ('Edit submission — ' + modal.quest.title) : 'Submit a quest',
        size: 'lg',
        onClose: function () { setModal(null); }
      },
        h(window.PVAdminQuestForm, {
          quest: modal.quest,
          withStatus: false,
          saveLabel: modal.quest ? 'Save changes' : 'Submit for approval',
          onSave: handleSave,
          onCancel: function () { setModal(null); }
        })
      ) : null
    );
  }

  // --------- My quest signups card ----------
  function MySignupsCard(props) {
    var signups = props.signups || [];
    var onChanged = props.onChanged;
    var onError = props.onError;

    async function handleWithdraw(s) {
      if (!confirm('Withdraw your signup for "' + s.title + '"?')) return;
      try {
        await PVAdminAPI.request('DELETE', '/quests/' + s.quest_id + '/signups', undefined, true);
        onChanged();
      } catch (e) {
        onError(e.message || 'Failed to withdraw.');
      }
    }

    return h('div', { className: 'portal-card' },
      h('h2', { className: 'portal-card-title' }, 'My Quest Signups'),
      h('p', { style: { margin: '0.6rem 0 0', color: 'var(--text-secondary)', fontSize: '0.92rem' } },
        'Sign up from the public ',
        h('a', { href: '/pv/bounty-board/bounty-board.html' }, 'Bounty Board'),
        '. You can withdraw anytime.'
      ),
      signups.length ? h('div', { className: 'portal-table-wrap', style: { marginTop: '0.85rem' } },
        h('table', { className: 'portal-table' },
          h('thead', null,
            h('tr', null,
              h('th', null, 'Quest'),
              h('th', null, 'Type'),
              h('th', null, 'Schedule'),
              h('th', { style: { textAlign: 'right', width: '1%', whiteSpace: 'nowrap' } }, '')
            )
          ),
          h('tbody', null,
            signups.map(function (s) {
              return h('tr', { key: s.id },
                h('td', { style: { fontWeight: 600 } }, s.title),
                h('td', null, s.mission_type || '—'),
                h('td', null, PVAdminQuestUtils.scheduleSummary(s)),
                h('td', { style: { whiteSpace: 'nowrap', textAlign: 'right' } },
                  h('button', {
                    type: 'button', className: 'portal-btn is-small is-ghost',
                    onClick: function () { handleWithdraw(s); }
                  }, 'Withdraw')
                )
              );
            })
          )
        )
      ) : h('p', { style: { marginTop: '0.85rem', color: 'var(--text-secondary)' } },
        'No signups yet.'
      )
    );
  }

  // --------- My job applications card ----------
  function MyJobApplicationsCard(props) {
    var apps = props.apps || [];
    var onChanged = props.onChanged;
    var onError = props.onError;

    async function handleWithdraw(a) {
      if (!confirm('Withdraw your application for "' + a.job_title + '"?')) return;
      try {
        await PVAdminAPI.request('DELETE', '/my/applications/' + a.id, undefined, true);
        onChanged();
      } catch (e) {
        onError(e.message || 'Failed to withdraw.');
      }
    }

    return h('div', { className: 'portal-card' },
      h('h2', { className: 'portal-card-title' }, 'My Job Applications'),
      h('p', { style: { margin: '0.6rem 0 0', color: 'var(--text-secondary)', fontSize: '0.92rem' } },
        'Apply from the public ',
        h('a', { href: '/pv/job-board/job-board.html' }, 'Job Board'),
        '. Applications can be withdrawn until an officer starts processing them.'
      ),
      apps.length ? h('div', { className: 'portal-table-wrap', style: { marginTop: '0.85rem' } },
        h('table', { className: 'portal-table' },
          h('thead', null,
            h('tr', null,
              h('th', null, 'Posting'),
              h('th', null, 'Division'),
              h('th', null, 'Applied'),
              h('th', null, 'Status'),
              h('th', { style: { textAlign: 'right', width: '1%', whiteSpace: 'nowrap' } }, '')
            )
          ),
          h('tbody', null,
            apps.map(function (a) {
              var pill = APP_STAGE_PILL[a.stage] || APP_STAGE_PILL.new;
              return h('tr', { key: a.id },
                h('td', { style: { fontWeight: 600 } }, a.job_title),
                h('td', null, a.division),
                h('td', null, fmtDate(a.created_at)),
                h('td', null, h('span', { className: pill.cls }, pill.label)),
                h('td', { style: { whiteSpace: 'nowrap', textAlign: 'right' } },
                  a.stage === 'new' ? h('button', {
                    type: 'button', className: 'portal-btn is-small is-ghost',
                    onClick: function () { handleWithdraw(a); }
                  }, 'Withdraw') : null
                )
              );
            })
          )
        )
      ) : h('p', { style: { marginTop: '0.85rem', color: 'var(--text-secondary)' } },
        'No applications yet.'
      )
    );
  }

  // --------- Main component ----------
  function MyApplications() {
    var questsState = useState({ quests: [], edits: [] });
    var myQuests = questsState[0], setMyQuests = questsState[1];
    var signupsState = useState([]);
    var mySignups = signupsState[0], setMySignups = signupsState[1];
    var appsState = useState([]);
    var myApps = appsState[0], setMyApps = appsState[1];

    var loadingState = useState(true);
    var loading = loadingState[0], setLoading = loadingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];

    async function reload() {
      setErr('');
      try {
        var results = await Promise.all([
          PVAdminAPI.request('GET', '/my/quests', undefined, true),
          PVAdminAPI.request('GET', '/my/signups', undefined, true),
          PVAdminAPI.request('GET', '/my/applications', undefined, true)
        ]);
        setMyQuests(results[0] && results[0].quests ? results[0] : { quests: [], edits: [] });
        setMySignups(Array.isArray(results[1]) ? results[1] : []);
        setMyApps(Array.isArray(results[2]) ? results[2] : []);
      } catch (e) {
        setErr(e.message || 'Failed to load your activity.');
      } finally {
        setLoading(false);
      }
    }

    useEffect(function () { reload(); }, []);

    if (loading) {
      return h('div', { className: 'portal-card' }, 'Loading…');
    }

    return h('div', null,
      err ? h('div', { className: 'portal-card' },
        h('div', { className: 'portal-flash error' }, err)
      ) : null,

      h(MyQuestsCard, { data: myQuests, onChanged: reload, onError: setErr }),
      h(MySignupsCard, { signups: mySignups, onChanged: reload, onError: setErr }),
      h(MyJobApplicationsCard, { apps: myApps, onChanged: reload, onError: setErr })
    );
  }

  window.PVAdminMyApplications = MyApplications;
})();
