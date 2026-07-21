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

  // Factions excluded from the public Company Roster; mirrors the worker's
  // HIDDEN_ROSTER_FACTIONS. A member with any other faction appears on the
  // single public roster once their profile is published.
  var HIDDEN_ROSTER_FACTIONS = ['NA - No RP', 'No Data'];

  // Authoritative roster skill list — members pick from this fixed set rather
  // than free-typing. Keep in sync with the worker's skill validation list.
  var SKILLS = [
    'Armsmanship',
    'Marksmanship',
    'Guardsmanship',
    'Craftsmanship',
    'Navigation',
    'Scouting',
    'Investigation',
    'Espionage',
    'Tracking',
    'Negotiation',
    'Translation',
    'Logistics',
    'Procurement',
    'Chirurgery',
    'Aetherology',
    'Culinarian Arts'
  ];
  var MAX_SKILLS = 5;

  // --------- Profile editor card ----------
  function ProfileCard(props) {
    var member = props.member;
    var profile = props.profile;
    var onSaved = props.onSaved;

    var draftState = useState({
      description: profile ? (profile.description || '') : '',
      // Only pre-check skills that exist in the fixed list; any legacy
      // free-typed skills stay on the public roster until this profile is
      // re-saved (at which point they're replaced by the picked set).
      skills: profile
        ? (profile.skills || []).filter(function (s) { return SKILLS.indexOf(s) !== -1; })
        : [],
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

    var onPublicRoster = (member.factions || []).some(function (f) {
      return HIDDEN_ROSTER_FACTIONS.indexOf(f) === -1;
    });

    async function handleSubmit(e) {
      if (e) e.preventDefault();
      setSaving(true); setErr(''); setFlash('');
      try {
        var skills = (draft.skills || []).filter(function (s) {
          return SKILLS.indexOf(s) !== -1;
        }).slice(0, MAX_SKILLS);
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
        onPublicRoster
          ? '. When published, it appears on the Company roster page.'
          : '. Your faction information is not set, so your profile will not appear on the public roster. Talk to an officer if you think this is incorrect. You may still fill out and publish your profile; it will appear automatically once your faction is updated.'
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
          help: 'Paste a URL or upload an image for your roster portrait.'
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
            placeholder: 'Describe your character. Markdown allowed.'
          })
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
            placeholder: 'Write any specific RP hooks you would like others to be aware of. Markdown allowed.'
          })
        ),

        h('div', { className: 'portal-field' },
          h('label', null, 'Skills'),
          h('div', { className: 'portal-checkbox-group', role: 'group', 'aria-label': 'Skills' },
            SKILLS.map(function (skill) {
              var checked = draft.skills.indexOf(skill) !== -1;
              var atCap = draft.skills.length >= MAX_SKILLS;
              return h('label', {
                key: skill,
                className: 'portal-checkbox-option' + (!checked && atCap ? ' is-disabled' : '')
              },
                h('input', {
                  type: 'checkbox',
                  checked: checked,
                  disabled: !checked && atCap,
                  onChange: function (e) {
                    var next = draft.skills.slice();
                    if (e.target.checked) {
                      if (next.indexOf(skill) === -1 && next.length < MAX_SKILLS) next.push(skill);
                    } else {
                      next = next.filter(function (s) { return s !== skill; });
                    }
                    setField('skills', next);
                  }
                }),
                h('span', null, skill)
              );
            })
          ),
          h('p', { className: 'portal-field-help' },
            'Pick 1–' + MAX_SKILLS + ' skills. ' + draft.skills.length + ' of ' + MAX_SKILLS + ' selected.'
          )
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

  // --------- My Items (read-only RP loadout) ---------------------------------
  // Reuses the public venue card + modal styling (styles.css) so the loadout
  // reads the same as the public-facing grids: a card carrying the torn
  // contrast border, and a detail modal whose title sits in the content rather
  // than a header bar. Item art is square, so the media/modal image are square.
  var ITEM_FALLBACK_BG = 'linear-gradient(135deg, #2a1f1c 0%, #14100e 100%)';

  function ItemModal(props) {
    var it = props.item;
    var onClose = props.onClose;

    useEffect(function () {
      function onKey(e) { if (e.key === 'Escape' && onClose) onClose(); }
      document.addEventListener('keydown', onKey);
      var prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return function () {
        document.removeEventListener('keydown', onKey);
        document.body.style.overflow = prev;
      };
    }, [onClose]);

    var media = it.image_url
      ? h('div', { className: 'contrast-media' },
          h('img', { className: 'venue-modal-img', src: it.image_url, alt: '' }),
          h('span', { className: 'contrast-border', 'aria-hidden': 'true' }))
      : h('div', { className: 'venue-modal-img venue-modal-img-fallback', style: { background: ITEM_FALLBACK_BG } },
          h('span', { className: 'venue-card-sig' }, (it.name || '').toLowerCase()),
          h('span', { className: 'contrast-border', 'aria-hidden': 'true' }));

    var abilities = it.abilities || [];
    return h('div', {
      className: 'venue-modal-overlay is-open',
      onMouseDown: function (e) { if (e.target === e.currentTarget && onClose) onClose(); }
    },
      h('div', { className: 'venue-modal pv-item-modal', role: 'dialog', 'aria-modal': 'true' },
        h('button', { type: 'button', className: 'venue-modal-close', 'aria-label': 'Close', onClick: onClose }, '✕'),
        media,
        h('div', { className: 'venue-modal-content' },
          h('h2', { className: 'venue-modal-title' }, it.name),
          it.description
            ? h('p', { className: 'venue-modal-desc', style: { whiteSpace: 'pre-wrap' } }, it.description)
            : null,
          abilities.length
            ? h('div', { className: 'pv-item-abilities' },
                abilities.map(function (ab, i) {
                  return h('div', { key: i, className: 'pv-item-ability' },
                    h('strong', null, ab.name),
                    ab.description ? h('p', null, ab.description) : null);
                }))
            : null
        )
      )
    );
  }

  function ItemCard(props) {
    var it = props.item;
    var n = (it.abilities || []).length;
    return h('button', {
      type: 'button', className: 'venue-card pv-item-card', 'aria-label': it.name, onClick: props.onOpen
    },
      h('div', { className: 'venue-card-media' },
        it.image_url
          ? h('img', {
              className: 'venue-card-img', src: it.image_url, alt: '', loading: 'lazy',
              onError: function (e) { e.target.style.display = 'none'; }
            })
          : h('span', { className: 'venue-card-sig' }, (it.name || '').toLowerCase()),
        h('span', { className: 'contrast-border-half', 'aria-hidden': 'true' })
      ),
      h('div', { className: 'venue-card-body' },
        h('div', { className: 'venue-card-title-row' },
          h('h3', { className: 'venue-card-title' }, it.name)
        ),
        n ? h('p', { className: 'venue-card-location' }, n + (n === 1 ? ' ABILITY' : ' ABILITIES')) : null
      )
    );
  }

  function MyItems() {
    var itemsState = useState(null); var items = itemsState[0], setItems = itemsState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];
    var openState = useState(null); var openItem = openState[0], setOpenItem = openState[1];

    useEffect(function () {
      (async function () {
        try { setItems(await PVRollAPI.request('GET', '/rp/my-items') || []); }
        catch (e) { setErr(e.message || 'Failed to load items.'); setItems([]); }
      })();
    }, []);

    if (items === null && !err) return h('div', { className: 'portal-card' }, 'Loading your items…');

    return h('div', null,
      err ? h('div', { className: 'portal-flash error' }, err) : null,
      (!items || !items.length)
        ? h('div', { className: 'portal-card' },
            h('p', { style: { margin: 0, color: 'var(--text-secondary)' } }, 'No items are assigned to your character yet.'))
        : h('div', { className: 'my-items-grid' },
            items.map(function (it) {
              return h(ItemCard, { key: it.item_id, item: it, onOpen: function () { setOpenItem(it); } });
            })
          ),
      openItem ? h(ItemModal, { item: openItem, onClose: function () { setOpenItem(null); } }) : null
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
        ? h(ProfileCard, { member: member, profile: profileData.profile, onSaved: reload })
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
  window.PVAdminMyItems = MyItems;
})();
