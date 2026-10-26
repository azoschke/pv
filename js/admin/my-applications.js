// ============================================================================
//  PVAdminMyApplications — member self-service activity section
//
//  Four cards, each shown only with its permission:
//    1. My Quest Submissions (quests.submit) — submit new quests (live after
//       officer approval), edit them (edits to listed quests queue for
//       approval), withdraw pending ones.
//    2. My Quest Signups (quests.signup) — quests the member has signed up
//       for on the public Bounty Board; withdrawable anytime.
//    3. My Job Applications (jobs.apply) — status of public job board
//       applications; withdrawable while still unreviewed.
//    4. My Appointment Requests (the Appointment Request page's key) — your
//       characters' open requests: Requested ones can be cancelled; Scheduled
//       ones show the assigned medic and when, and stay as they are.
//
//  Cards 1-3 cover all the account's characters (its main and alts); with
//  alts they show a Character column, and a new quest picks one to post as.
//
//  Worker routes (all authed):
//    GET  /my/quests        POST /quests      PATCH/DELETE /my/quests/:id
//    DELETE /quest-edits/:id                  (cancel own proposed edit)
//    GET  /my/signups       DELETE /quests/:id/signups
//    GET  /my/applications  DELETE /my/applications/:id
//    GET  /my/appointments  POST /my/appointments/:id/cancel
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;

  var QUEST_STATUS_PILL = {
    pending: { label: 'Pending approval', cls: 'status-dot is-brown' },
    listed:  { label: 'Listed',           cls: 'status-dot is-quiet' },
    hidden:  { label: 'Hidden',           cls: 'status-dot is-quiet' }
  };

  var APP_STAGE_PILL = {
    new:               { label: 'Submitted',           cls: 'status-dot is-brown' },
    scheduled:         { label: 'Interview scheduled', cls: 'status-dot is-brown' },
    requires_training: { label: 'Requires training',   cls: 'status-dot is-brown' },
    accepted:          { label: 'Accepted',            cls: 'status-dot is-quiet' },
    declined:          { label: 'Declined',            cls: 'status-dot is-quiet' }
  };

  // Division slugs are stored on the application; map to display labels.
  var DIVISION_LABEL = {
    medical: 'Medical', pirate: 'Pirate', mercenary: 'Mercenary',
    house_staff: 'House Staff', recon: 'Recon', contractor: 'Contractor'
  };
  var JOB_TYPE_LABEL = { primary: 'Primary', secondary: 'Secondary' };
  function divisionLabel(v) { return DIVISION_LABEL[v] || v || '—'; }

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
          ? 'Edit submitted! It will go live once an officer approves it.'
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
    var characters = PVSession.characters();
    var hasAlts = characters.length > 1;

    return h('div', { className: 'portal-card' },
      h('div', { className: 'portal-head-row' },
        h('h2', { className: 'portal-card-title portal-head-title' }, 'My Quest Submissions'),
        h('button', {
          type: 'button', className: 'btn is-small',
          onClick: function () { setModal({ quest: null }); }
        }, 'New submission')
      ),
      h('p', { className: 'portal-head-desc' },
        'Submissions go live on the public Bounty Board after an officer approves them. ' +
        'Edits to an approved quest will be reviewed before they apply.'
      ),

      flash ? h('div', { className: 'flash success', style: { marginTop: '0.75rem' } }, flash) : null,

      quests.length ? h('div', { className: 'portal-table-wrap portal-gap-top' },
        h('table', { className: 'portal-table' },
          h('thead', null,
            h('tr', null,
              h('th', null, 'Title'),
              hasAlts ? h('th', null, 'Character') : null,
              h('th', null, 'Type'),
              h('th', null, 'Schedule'),
              h('th', null, 'Status'),
              h('th', { className: 'portal-col-actions' }, '')
            )
          ),
          h('tbody', null,
            quests.map(function (q) {
              var pill = QUEST_STATUS_PILL[q.status] || QUEST_STATUS_PILL.hidden;
              return h('tr', { key: q.id },
                h('td', { className: 'row-name' }, q.title),
                hasAlts ? h('td', null, q.submitted_by_name || '—') : null,
                h('td', null, q.mission_type || '—'),
                h('td', null, PVAdminQuestUtils.scheduleSummary(q)),
                h('td', null, h('span', { className: pill.cls }, pill.label)),
                h('td', { className: 'portal-col-actions' },
                  h('button', {
                    type: 'button', className: 'btn is-small is-quiet',
                    onClick: function () { setModal({ quest: q }); }
                  }, 'Edit'),
                  q.status === 'pending' ? h('button', {
                    type: 'button', className: 'btn is-small is-danger is-spaced',
                    onClick: function () { handleWithdraw(q); }
                  }, 'Withdraw') : null
                )
              );
            })
          )
        )
      ) : h('p', { className: 'portal-muted portal-gap-top' },
        'No quest submissions. Submit a quest or bounty for the public board.'
      ),

      edits.length ? h('div', { className: 'portal-gap-top' },
        h('p', { style: { margin: '0 0 0.4rem', fontWeight: 600 } }, 'Proposed edits awaiting approval'),
        edits.map(function (e) {
          return h('div', {
            key: e.id,
            style: { display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.3rem 0' }
          },
            h('span', { className: 'status-dot is-brown' }, 'Edit pending'),
            h('span', { style: { flex: 1 } }, e.quest_title),
            h('button', {
              type: 'button', className: 'btn is-small is-quiet',
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
          characters: modal.quest ? null : characters,
          characterId: (PVAdminAPI.getSession() || {}).member_id,
          onSave: handleSave,
          onCancel: function () { setModal(null); }
        })
      ) : null
    );
  }

  // --------- My quest signups card ----------
  function MySignupsCard(props) {
    var signups = props.signups || [];
    var hasAlts = PVSession.characters().length > 1;
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
      h('p', { className: 'portal-head-desc' },
        'Sign up from the public ',
        h('a', { href: 'bounty-board.html' }, 'Bounty Board'),
        '. You can withdraw anytime.'
      ),
      signups.length ? h('div', { className: 'portal-table-wrap portal-gap-top' },
        h('table', { className: 'portal-table' },
          h('thead', null,
            h('tr', null,
              h('th', null, 'Quest'),
              hasAlts ? h('th', null, 'Character') : null,
              h('th', null, 'Type'),
              h('th', null, 'Schedule'),
              h('th', { className: 'portal-col-actions' }, '')
            )
          ),
          h('tbody', null,
            signups.map(function (s) {
              return h('tr', { key: s.id },
                h('td', { className: 'row-name' }, s.title),
                hasAlts ? h('td', null, s.member_name) : null,
                h('td', null, s.mission_type || '—'),
                h('td', null, PVAdminQuestUtils.scheduleSummary(s)),
                h('td', { className: 'portal-col-actions' },
                  h('button', {
                    type: 'button', className: 'btn is-small is-quiet',
                    onClick: function () { handleWithdraw(s); }
                  }, 'Withdraw')
                )
              );
            })
          )
        )
      ) : h('p', { className: 'portal-muted portal-gap-top' },
        'No signups yet.'
      )
    );
  }

  // --------- My appointment requests card ----------
  // The Appointment Request page's key (Permissions → Site Pages) opens the
  // page, the request and this card alike.
  var APPOINTMENT_KEY = 'site.appointment-request.view';

  function MyAppointmentsCard(props) {
    var requests = props.requests || [];
    var onChanged = props.onChanged;
    var onError = props.onError;

    async function handleCancel(r) {
      if (!confirm('Cancel the appointment request for ' + r.character_name + '?')) return;
      try {
        await PVAdminAPI.request('POST', '/my/appointments/' + r.id + '/cancel', {}, true);
        onChanged();
      } catch (e) {
        onError(e.message || 'Failed to cancel.');
      }
    }

    return h('div', { className: 'portal-card' },
      h('h2', { className: 'portal-card-title' }, 'My Appointment Requests'),
      h('p', { className: 'portal-head-desc' },
        'Request one from the ',
        h('a', { href: 'appointment-request.html' }, 'Appointment Request'),
        ' page. Appointments can be cancelled until scheduled by a medic.'
      ),
      requests.length ? h('div', { className: 'portal-table-wrap portal-gap-top' },
        h('table', { className: 'portal-table' },
          h('thead', null,
            h('tr', null,
              h('th', null, 'Character'),
              h('th', null, 'Medic'),
              h('th', null, 'Requested'),
              h('th', null, 'Status'),
              h('th', { className: 'portal-col-actions' }, '')
            )
          ),
          h('tbody', null,
            requests.map(function (r) {
              var scheduled = r.status === 'scheduled';
              return h('tr', { key: r.id },
                h('td', { className: 'row-name' }, r.character_name),
                h('td', null, (scheduled && r.assigned_medic_name) || r.requested_medic_name),
                h('td', null, fmtDate(r.created_at)),
                h('td', null,
                  h('span', { className: 'status-dot is-brown' }, scheduled ? 'Scheduled' : 'Requested'),
                  scheduled && PVAdminAppointmentUtils.whenLabel(r)
                    ? h('span', { className: 'portal-muted' }, ' · ' + PVAdminAppointmentUtils.whenLabel(r)) : null
                ),
                h('td', { className: 'portal-col-actions' },
                  scheduled ? null : h('button', {
                    type: 'button', className: 'btn is-small is-quiet',
                    onClick: function () { handleCancel(r); }
                  }, 'Cancel')
                )
              );
            })
          )
        )
      ) : h('p', { className: 'portal-muted portal-gap-top' }, 'No open appointment requests.')
    );
  }

  // --------- My job applications card ----------
  function MyJobApplicationsCard(props) {
    var apps = props.apps || [];
    var hasAlts = PVSession.characters().length > 1;
    var jobsById = props.jobsById || {};
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
      h('p', { className: 'portal-head-desc' },
        'Apply from the public ',
        h('a', { href: 'job-board.html' }, 'Job Board'),
        '. Applications can be withdrawn until an officer starts processing them.'
      ),
      apps.length ? h('div', { className: 'portal-table-wrap portal-gap-top' },
        h('table', { className: 'portal-table' },
          h('thead', null,
            h('tr', null,
              h('th', null, 'Posting'),
              hasAlts ? h('th', null, 'Character') : null,
              h('th', null, 'Division'),
              h('th', null, 'Type'),
              h('th', null, 'Applied'),
              h('th', null, 'Status'),
              h('th', { className: 'portal-col-actions' }, '')
            )
          ),
          h('tbody', null,
            apps.map(function (a) {
              var pill = APP_STAGE_PILL[a.stage] || APP_STAGE_PILL.new;
              var job = jobsById[a.job_id];
              var jobType = job && job.job_type ? job.job_type : null;
              return h('tr', { key: a.id },
                h('td', { className: 'row-name' }, a.job_title),
                hasAlts ? h('td', null, a.member_name) : null,
                h('td', null, divisionLabel(a.division)),
                h('td', null, jobType ? (JOB_TYPE_LABEL[jobType] || jobType) : '—'),
                h('td', null, fmtDate(a.created_at)),
                h('td', null, h('span', { className: pill.cls }, pill.label)),
                h('td', { className: 'portal-col-actions' },
                  a.stage === 'new' ? h('button', {
                    type: 'button', className: 'btn is-small is-quiet',
                    onClick: function () { handleWithdraw(a); }
                  }, 'Withdraw') : null
                )
              );
            })
          )
        )
      ) : h('p', { className: 'portal-muted portal-gap-top' },
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
    var jobsState = useState({});
    var jobsById = jobsState[0], setJobsById = jobsState[1];
    var apptState = useState([]);
    var myAppointments = apptState[0], setMyAppointments = apptState[1];

    var loadingState = useState(true);
    var loading = loadingState[0], setLoading = loadingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];

    var canSubmit = PVAdminAPI.can('quests.submit');
    var canSignup = PVAdminAPI.can('quests.signup');
    var canApply = PVAdminAPI.can('jobs.apply');
    var canRequest = PVAdminAPI.can(APPOINTMENT_KEY);

    // Only load what this account may see.
    function load(allowed, path, empty) {
      return allowed ? PVAdminAPI.request('GET', path, undefined, true) : Promise.resolve(empty);
    }

    async function reload() {
      setErr('');
      try {
        var results = await Promise.all([
          load(canSubmit, '/my/quests', null),
          load(canSignup, '/my/signups', []),
          load(canApply, '/my/applications', []),
          // Postings carry job_type / category; index by id so My Job
          // Applications can show the division label and Primary/Secondary type.
          load(canApply, '/jobs', []).catch(function () { return []; }),
          load(canRequest, '/my/appointments', [])
        ]);
        setMyQuests(results[0] && results[0].quests ? results[0] : { quests: [], edits: [] });
        setMySignups(Array.isArray(results[1]) ? results[1] : []);
        setMyApps(Array.isArray(results[2]) ? results[2] : []);
        var byId = {};
        (Array.isArray(results[3]) ? results[3] : []).forEach(function (j) { byId[j.id] = j; });
        setJobsById(byId);
        setMyAppointments(Array.isArray(results[4]) ? results[4] : []);
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
        h('div', { className: 'flash error' }, err)
      ) : null,

      canSubmit ? h(MyQuestsCard, { data: myQuests, onChanged: reload, onError: setErr }) : null,
      canSignup ? h(MySignupsCard, { signups: mySignups, onChanged: reload, onError: setErr }) : null,
      canApply ? h(MyJobApplicationsCard, { apps: myApps, jobsById: jobsById, onChanged: reload, onError: setErr }) : null,
      canRequest ? h(MyAppointmentsCard, { requests: myAppointments, onChanged: reload, onError: setErr }) : null
    );
  }

  window.PVAdminMyApplications = MyApplications;
})();
