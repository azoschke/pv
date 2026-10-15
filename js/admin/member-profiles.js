// ============================================================================
//  PVAdminMemberProfiles — moderation view for public roster profiles
//
//  Profiles are written by members themselves (portal → My Profile); officers
//  use this list to review what is publicly visible, unpublish anything
//  inappropriate, or delete a profile outright. Content editing stays with
//  the member.
//
//  Worker routes:
//    GET    /member-profiles/admin        member_profiles.manage
//    PATCH  /member-profiles/:member_id   member_profiles.manage  { published }
//    DELETE /member-profiles/:member_id   member_profiles.delete
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useMemo = React.useMemo;

  // Faction display order — mirrors the public Company Roster (roster.js) and
  // admin members.js so faction tags read the same everywhere.
  var FACTION_ORDER = [
    'Pirate', 'Mercenary', 'Medical', 'House Staff', 'Recon',
    'Contractor', 'NA - No RP', 'No Data'
  ];

  function ProfilePreview(props) {
    var p = props.profile;
    function row(label, value) {
      if (!value) return null;
      return h('div', { className: 'portal-field is-tight' },
        h('label', null, label),
        h('p', { style: { margin: 0, whiteSpace: 'pre-wrap' } }, value)
      );
    }
    return h('div', null,
      p.image_url ? h('img', {
        src: p.image_url, alt: '',
        style: { maxWidth: '320px', maxHeight: '200px', border: '1px solid var(--border-color)', borderRadius: '0.3rem', objectFit: 'cover', marginBottom: '0.75rem' },
        onError: function (e) { e.target.style.display = 'none'; }
      }) : null,
      row('Skills', (p.skills || []).join(', ')),
      row('Description', p.description),
      row('RP Hooks', p.rp_hooks),
      row('URL', p.url)
    );
  }

  function MemberProfiles() {
    var allowDelete = PVAdminAPI.can('member_profiles.delete');
    var profilesState = useState([]);
    var profiles = profilesState[0], setProfiles = profilesState[1];
    var loadingState = useState(true);
    var loading = loadingState[0], setLoading = loadingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];
    var flashState = useState('');
    var flash = flashState[0], setFlash = flashState[1];
    var modalState = useState(null); // null | profile
    var modalProfile = modalState[0], setModalProfile = modalState[1];
    var queryState = useState('');
    var query = queryState[0], setQuery = queryState[1];

    function flashFor(msg) {
      setFlash(msg);
      setTimeout(function () { setFlash(''); }, 3500);
    }

    async function reload() {
      setErr('');
      try {
        var data = await PVAdminAPI.request('GET', '/member-profiles/admin', undefined, true);
        setProfiles(Array.isArray(data) ? data : []);
      } catch (e) {
        setErr(e.message || 'Failed to load profiles.');
      } finally {
        setLoading(false);
      }
    }

    useEffect(function () { reload(); }, []);

    var filtered = useMemo(function () {
      var s = query.trim().toLowerCase();
      var out = profiles.slice();
      if (s) {
        out = out.filter(function (p) {
          var hay = [
            p.name || '',
            (p.factions || []).join(' '),
            (p.skills || []).join(' '),
            p.description || ''
          ].join(' ').toLowerCase();
          return hay.indexOf(s) !== -1;
        });
      }
      return out;
    }, [profiles, query]);

    async function togglePublished(p) {
      try {
        await PVAdminAPI.request('PATCH', '/member-profiles/' + p.member_id,
          { published: !p.published }, true);
        flashFor(p.published ? 'Profile unpublished.' : 'Profile published.');
        await reload();
      } catch (e) {
        setErr(e.message || 'Update failed.');
      }
    }

    async function handleDelete(p) {
      if (!confirm('Delete ' + p.name + '’s profile entirely? They can rebuild it from My Profile.')) return;
      try {
        await PVAdminAPI.request('DELETE', '/member-profiles/' + p.member_id, undefined, true);
        flashFor('Profile deleted.');
        await reload();
      } catch (e) {
        setErr(e.message || 'Delete failed.');
      }
    }

    function orderedFactionsOf(p) {
      var fs = (p.factions || []).slice();
      var known = FACTION_ORDER.filter(function (f) { return fs.indexOf(f) !== -1; });
      var unknown = fs.filter(function (f) { return FACTION_ORDER.indexOf(f) === -1; });
      return known.concat(unknown);
    }

    var publishedCount = profiles.filter(function (p) { return p.published; }).length;

    return h('div', null,
      h('div', { className: 'portal-card portal-head' },
        h('div', { className: 'portal-head-row' },
          h('h2', { className: 'portal-card-title portal-head-title' }, 'Member Profiles'),
          h('input', {
            type: 'search',
            className: 'portal-search',
            value: query,
            onChange: function (e) { setQuery(e.target.value); },
            placeholder: 'Search name, faction, skill…'
          })
        ),
        h('p', { className: 'portal-head-desc' },
          'Published profiles appear on the public Company Roster.'
        ),
        h('p', { className: 'portal-head-desc is-tight' },
          publishedCount + ' published · ' + (profiles.length - publishedCount) + ' drafts'
        ),
        flash ? h('div', { className: 'portal-flash success is-head' }, flash) : null
      ),

      err ? h('div', { className: 'portal-card' },
        h('div', { className: 'portal-flash error' }, err)
      ) : null,

      loading
        ? h('div', { className: 'portal-card' }, 'Loading profiles…')
        : !filtered.length
          ? h('div', { className: 'portal-card' },
              h('p', { className: 'portal-note' },
                profiles.length ? 'No profiles match that search.' : 'No members have created a profile yet.'
              )
            )
          : h('div', { className: 'portal-card' },
              h('div', { className: 'portal-table-wrap' },
                h('table', { className: 'portal-table member-profiles-table' },
                  h('thead', null,
                    h('tr', null,
                      h('th', null, 'Name'),
                      h('th', null, 'Factions'),
                      h('th', null, 'Skills'),
                      h('th', null, 'Visibility'),
                      h('th', { className: 'portal-col-actions' }, '')
                    )
                  ),
                  h('tbody', null,
                    filtered.map(function (p) {
                      var factionTags = orderedFactionsOf(p);
                      return h('tr', { key: p.member_id },
                        h('td', { className: 'portal-row-title' }, p.name),
                        h('td', null,
                          factionTags.length
                            ? h('div', { className: 'portal-faction-tags' },
                                factionTags.map(function (f) {
                                  return h('span', { key: f, className: 'tag' }, f);
                                })
                              )
                            : h('span', { className: 'portal-muted' }, '—')
                        ),
                        h('td', null,
                          (p.skills || []).length
                            ? (p.skills || []).join(', ')
                            : h('span', { className: 'portal-muted' }, '—')
                        ),
                        h('td', null,
                          h('span', { className: 'status-dot is-quiet' },
                            p.published ? 'Published' : 'Draft')
                        ),
                        h('td', { className: 'portal-col-actions' },
                          h('button', {
                            type: 'button', className: 'btn is-small is-quiet',
                            onClick: function () { setModalProfile(p); }
                          }, 'View'),
                          h('button', {
                            type: 'button', className: 'btn is-small is-quiet is-spaced',
                            onClick: function () { togglePublished(p); }
                          }, p.published ? 'Unpublish' : 'Publish'),
                          allowDelete ? h('button', {
                            type: 'button', className: 'btn is-small is-danger is-spaced',
                            onClick: function () { handleDelete(p); }
                          }, 'Delete') : null
                        )
                      );
                    })
                  )
                )
              )
            ),

      modalProfile ? h(window.PVAdminModal, {
        title: 'Profile — ' + (modalProfile.name || ''),
        size: 'lg',
        onClose: function () { setModalProfile(null); }
      },
        h(ProfilePreview, { profile: modalProfile })
      ) : null
    );
  }

  window.PVAdminMemberProfiles = MemberProfiles;
})();
