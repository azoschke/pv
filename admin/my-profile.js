// ============================================================================
//  PVAdminMyProfile — member self-service profile editor
//
//  Visible to every logged-in account. Holds the public roster profile only;
//  quest submissions, job applications, and quest signups live in the
//  companion My Applications section (my-applications.js).
//
//  Published profiles appear on the public Mercenary / Pirate roster pages
//  for whichever factions officers have assigned in FC Members.
//
//  Worker routes (authed, no special role):
//    GET  /my-profile    PUT /my-profile    POST /my-profile/images
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;

  // Factions that have a public roster page; mirrors the worker's ROSTER_FACTIONS.
  var ROSTER_FACTIONS = ['Mercenary', 'Pirate'];

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
          : 'Profile saved. It will not be added to the public roster until you publish it.');
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
          : '. Your faction does not currently have a public roster page — ask an officer if you think this is inccorect. You can still fill out and publish your profile; it will appear automatically if your faction is updated.'
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
            h('span', null, 'Publish my profile')
          ),
          h('p', { className: 'portal-field-help' },
            'Off by default, select if you would like to list your profile on the public roster.'
          )
        ),

        h('div', { className: 'portal-form-actions' },
          h('button', { type: 'submit', className: 'portal-btn', disabled: saving },
            saving ? 'Saving…' : 'Save profile')
        )
      )
    );
  }

  // --------- Main component ----------
  function MyProfile() {
    var profileState = useState(null);   // { member, profile } | null
    var profileData = profileState[0], setProfileData = profileState[1];
    var loadingState = useState(true);
    var loading = loadingState[0], setLoading = loadingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];

    async function reload() {
      setErr('');
      try {
        var data = await PVAdminAPI.request('GET', '/my-profile', undefined, true);
        setProfileData(data || { member: null, profile: null });
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
          )
    );
  }

  window.PVAdminMyProfile = MyProfile;
})();
