// ============================================================================
//  PVAdminMyProfile — member self-service section
//
//  Visible to every logged-in account (it is the only section accounts with
//  just the 'member' role — or no roles at all — can see). Three cards:
//
//    1. Character Profile — image, description, skills, RP hooks, URL, and an
//       opt-in "publish" toggle. Published profiles appear on the public
//       Mercenary / Pirate roster pages for whichever factions officers have
//       assigned in FC Members.
//    2. My Quest Submissions — submit new quests (go live after officer
//       approval), edit them (edits to listed quests are queued for
//       approval), withdraw pending ones.
//    3. My Job Applications — status of applications made from the public
//       job board; withdrawable while still unreviewed.
//
//  Worker routes (all authed, no special role):
//    GET  /my-profile            PUT /my-profile        POST /my-profile/images
//    GET  /my/quests             POST /quests           PATCH/DELETE /my/quests/:id
//    DELETE /quest-edits/:id     (cancel own proposed edit)
//    GET  /my/applications       DELETE /my/applications/:id
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;

  // Factions that have a public roster page; mirrors the worker's ROSTER_FACTIONS.
  var ROSTER_FACTIONS = ['Mercenary', 'Pirate'];

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

  // --------- Profile editor card ----------
  function ProfileCard(props) {
    var member = props.member;
    var profile = props.profile;
    var onSaved = props.onSaved;

    var draftState = useState({
      description: profile ? (profile.description || '') : '',
      skills: profile ? (profile.skills || []).join(', ') : '',
      rp_hooks: profile ? (profile.rp_hooks || '') : '',
      url: profile ? (profile.url || '') : '',
      image_url: profile ? (profile.image_url || '') : '',
      published: profile ? !!profile.published : false
    });
    var draft = draftState[0], setDraft = draftState[1];
    var savingState = useState(false);
    var saving = savingState[0], setSaving = savingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];
    var flashState = useState('');
    var flash = flashState[0], setFlash = flashState[1];

    function setField(k, v) {
      setDraft(function (d) { var n = Object.assign({}, d); n[k] = v; return n; });
    }

    var rosterPages = (member.factions || []).filter(function (f) {
      return ROSTER_FACTIONS.indexOf(f) !== -1;
    });

    async function handleSubmit(e) {
      if (e) e.preventDefault();
      setSaving(true); setErr(''); setFlash('');
      try {
        var skills = draft.skills.split(',')
          .map(function (s) { return s.trim(); })
          .filter(Boolean);
        await PVAdminAPI.request('PUT', '/my-profile', {
          description: draft.description,
          skills: skills,
          rp_hooks: draft.rp_hooks,
          url: draft.url.trim() || null,
          image_url: draft.image_url.trim() || null,
          published: draft.published
        }, true);
        setFlash(draft.published
          ? 'Profile saved and published.'
          : 'Profile saved. It stays off the public rosters until you publish it.');
        setTimeout(function () { setFlash(''); }, 4000);
        onSaved();
      } catch (e2) {
        setErr(e2.message || 'Save failed.');
      } finally {
        setSaving(false);
      }
    }

    return h('div', { className: 'portal-card' },
      h('h2', { className: 'portal-card-title' }, 'Character Profile'),
      h('p', { style: { margin: '0 0 1rem', color: 'var(--text-secondary)', fontSize: '0.92rem' } },
        'Your public roster entry for ',
        h('strong', null, member.name),
        rosterPages.length
          ? '. When published, it appears on the ' + rosterPages.join(' and ') + ' roster page' + (rosterPages.length > 1 ? 's' : '') + '.'
          : '. Your faction does not currently have a public roster page — ask an officer if that seems wrong. You can still fill out and publish your profile; it will appear automatically once your faction is updated.'
      ),

      flash ? h('div', { className: 'portal-flash success' }, flash) : null,

      h('form', { onSubmit: handleSubmit },
        err ? h('div', { className: 'portal-flash error' }, err) : null,

        h(PVAdminQuestUtils.ImageField, {
          value: draft.image_url,
          onChange: function (v) { setField('image_url', v); },
          disabled: saving,
          uploadPath: '/my-profile/images',
          extraFields: {},
          help: 'A portrait for your roster card. Paste a URL or upload an image.'
        }),

        h('div', { className: 'portal-field' },
          h('label', null, 'Description'),
          h('textarea', {
            value: draft.description,
            onChange: function (e) {
              var v = e.target.value;
              setDraft(function (d) { return Object.assign({}, d, { description: v }); });
            },
            rows: 6,
            maxLength: 4000,
            placeholder: 'Who is your character? Markdown allowed.'
          })
        ),

        h('div', { className: 'portal-field' },
          h('label', null, 'Skills'),
          h('input', {
            type: 'text',
            value: draft.skills,
            onChange: function (e) { setField('skills', e.target.value); },
            placeholder: 'Comma-separated, e.g. Swordplay, Field Medicine, Cartography'
          }),
          h('p', { className: 'portal-field-help' },
            'Up to 12 skills, 32 characters each. Shown as tags and filterable on the roster page.'
          )
        ),

        h('div', { className: 'portal-field' },
          h('label', null, 'RP Hooks'),
          h('textarea', {
            value: draft.rp_hooks,
            onChange: function (e) {
              var v = e.target.value;
              setDraft(function (d) { return Object.assign({}, d, { rp_hooks: v }); });
            },
            rows: 4,
            maxLength: 4000,
            placeholder: 'Story threads other players can pull on. Markdown allowed.'
          })
        ),

        h('div', { className: 'portal-field' },
          h('label', null, 'URL'),
          h('input', {
            type: 'text',
            value: draft.url,
            onChange: function (e) { setField('url', e.target.value); },
            placeholder: 'https://… (carrd, Lodestone, etc.)'
          })
        ),

        h('div', { className: 'portal-field' },
          h('label', { className: 'portal-checkbox-option', style: { fontWeight: 600 } },
            h('input', {
              type: 'checkbox',
              checked: draft.published,
              onChange: function (e) { setField('published', e.target.checked); }
            }),
            h('span', null, 'Publish my profile on the public roster')
          ),
          h('p', { className: 'portal-field-help' },
            'Off by default. The public page shows only what you enter above plus your character name — never OOC information.'
          )
        ),

        h('div', { className: 'portal-form-actions' },
          h('button', { type: 'submit', className: 'portal-btn', disabled: saving },
            saving ? 'Saving…' : 'Save profile')
        )
      )
    );
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
        await PVAdminAPI.request('POST', '/quests', payload, true);
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

  // --------- My job applications card ----------
  function MyApplicationsCard(props) {
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
  function MyProfile() {
    var profileState = useState(null);   // { member, profile } | null
    var profileData = profileState[0], setProfileData = profileState[1];
    var questsState = useState({ quests: [], edits: [] });
    var myQuests = questsState[0], setMyQuests = questsState[1];
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
          PVAdminAPI.request('GET', '/my-profile', undefined, true),
          PVAdminAPI.request('GET', '/my/quests', undefined, true),
          PVAdminAPI.request('GET', '/my/applications', undefined, true)
        ]);
        setProfileData(results[0] || { member: null, profile: null });
        setMyQuests(results[1] && results[1].quests ? results[1] : { quests: [], edits: [] });
        setMyApps(Array.isArray(results[2]) ? results[2] : []);
      } catch (e) {
        setErr(e.message || 'Failed to load your profile.');
      } finally {
        setLoading(false);
      }
    }

    useEffect(function () { reload(); }, []);

    if (loading) {
      return h('div', { className: 'portal-card' }, 'Loading your profile…');
    }

    var member = profileData && profileData.member;

    return h('div', null,
      err ? h('div', { className: 'portal-card' },
        h('div', { className: 'portal-flash error' }, err)
      ) : null,

      member
        ? h(ProfileCard, {
            member: member,
            profile: profileData.profile,
            onSaved: reload
          })
        : h('div', { className: 'portal-card' },
            h('h2', { className: 'portal-card-title' }, 'Character Profile'),
            h('div', { className: 'portal-flash error' },
              'Your account is not linked to the FC roster (display name "' +
              ((PVAdminAPI.getSession() || {}).display_name || '?') +
              '" was not found). Contact an officer to fix your roster entry.'
            )
          ),

      member ? h(MyQuestsCard, {
        data: myQuests,
        onChanged: reload,
        onError: setErr
      }) : null,

      member ? h(MyApplicationsCard, {
        apps: myApps,
        onChanged: reload,
        onError: setErr
      }) : null
    );
  }

  window.PVAdminMyProfile = MyProfile;
})();
