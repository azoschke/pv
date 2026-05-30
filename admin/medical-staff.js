// ============================================================================
//  PVAdminMedicalStaff — Medical Division staff roster management
//
//  The candidate roster is every FC member whose `faction` field contains
//  "Medical". For each candidate, an admin can attach a profile (positions,
//  tags, description) which gates whether they appear on the public roster
//  at /pv/vanguard-medical/staff-roster.html.
//
//  Worker routes:
//    GET    /members                  (existing, auth)
//    GET    /medical-staff/admin      officer | admin
//        -> [{ member_id, positions:[], tags:[], description, updated_at }]
//    PUT    /medical-staff/:member_id officer | admin
//        body { positions:[], tags:[], description }
//    DELETE /medical-staff/:member_id admin
//
//  Public route (used by the staff-roster.html page, not this module):
//    GET    /medical-staff
//        -> inner-joined with members.faction LIKE '%Medical%' AND a profile
//           row exists. Hidden-until-filled rule lives in the worker.
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useMemo = React.useMemo;

  var POSITIONS = [
    'Medical Lead',
    'Assistant Medical Lead',
    'Secretary',
    'Staff Medic',
    'Therapist',
    'Physical Therapist',
    'Nutritionist',
    'Supply Coordinator',
    'Student Medic'
  ];

  var TAGS = [
    'Surgery',
    'Aetherology',
    'Alchemy',
    'Herbal Remedies',
    'Research',
    'Scheduling',
    'Physical Check-up',
    'Counseling',
    'Physical Therapy',
    'Nutrition',
    'Stock Management'
  ];

  function parseList(value) {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.map(function (s) { return String(s).trim(); }).filter(Boolean);
    }
    return String(value)
      .split(',')
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
  }

  function memberIsMedical(m) {
    return parseList(m && m.faction).indexOf('Medical') !== -1;
  }

  // Sort by position rank (lowest POSITIONS index wins), then name.
  function positionRank(positions) {
    var ranks = (positions || []).map(function (p) {
      var i = POSITIONS.indexOf(p);
      return i === -1 ? POSITIONS.length : i;
    });
    if (!ranks.length) return POSITIONS.length + 1;
    return Math.min.apply(null, ranks);
  }

  function compareRows(a, b) {
    // Unfilled (no profile) rows pinned to top of admin list.
    var ua = a.profile ? 1 : 0;
    var ub = b.profile ? 1 : 0;
    if (ua !== ub) return ua - ub;
    var ra = a.profile ? positionRank(a.profile.positions) : 0;
    var rb = b.profile ? positionRank(b.profile.positions) : 0;
    if (ra !== rb) return ra - rb;
    return (a.member.name || '').localeCompare(b.member.name || '', undefined, { sensitivity: 'base' });
  }

  // --------- Edit modal body ----------
  function StaffForm(props) {
    var row = props.row;
    var onSave = props.onSave;
    var onCancel = props.onCancel;
    var onDelete = props.onDelete;
    var allowDelete = props.allowDelete;

    var profile = row.profile || { positions: [], tags: [], description: '' };
    var hasProfile = !!row.profile;

    var draftState = useState({
      positions: (profile.positions || []).slice(),
      tags: (profile.tags || []).slice(),
      description: profile.description || ''
    });
    var draft = draftState[0], setDraft = draftState[1];
    var savingState = useState(false);
    var saving = savingState[0], setSaving = savingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];

    function togglePosition(p) {
      setDraft(function (d) {
        var has = d.positions.indexOf(p) !== -1;
        var next = has
          ? d.positions.filter(function (x) { return x !== p; })
          : POSITIONS.filter(function (x) { return d.positions.indexOf(x) !== -1 || x === p; });
        return Object.assign({}, d, { positions: next });
      });
    }

    function toggleTag(t) {
      setDraft(function (d) {
        var has = d.tags.indexOf(t) !== -1;
        var next = has
          ? d.tags.filter(function (x) { return x !== t; })
          : TAGS.filter(function (x) { return d.tags.indexOf(x) !== -1 || x === t; });
        return Object.assign({}, d, { tags: next });
      });
    }

    async function handleSubmit(e) {
      if (e) e.preventDefault();
      if (!draft.positions.length) {
        setErr('Pick at least one position.');
        return;
      }
      setSaving(true); setErr('');
      try {
        await onSave({
          positions: draft.positions.slice(),
          tags: draft.tags.slice(),
          description: draft.description.trim()
        });
      } catch (e2) {
        setErr(e2.message || 'Save failed.');
        setSaving(false);
      }
    }

    return h('form', { onSubmit: handleSubmit },
      err ? h('div', { className: 'portal-flash error' }, err) : null,

      h('div', { className: 'portal-field' },
        h('label', null, 'Member'),
        h('p', { style: { margin: 0, fontFamily: '"La Belle Aurore", cursive', fontSize: '1.4rem', color: 'var(--accent-brown)' } },
          row.member.name
        )
      ),

      h('div', { className: 'portal-field' },
        h('label', null, 'Position(s) *'),
        h('div', { className: 'portal-checkbox-group', role: 'group', 'aria-label': 'Positions' },
          POSITIONS.map(function (p) {
            var checked = draft.positions.indexOf(p) !== -1;
            return h('label', { key: p, className: 'portal-checkbox-option' },
              h('input', {
                type: 'checkbox',
                checked: checked,
                onChange: function () { togglePosition(p); }
              }),
              h('span', null, p)
            );
          })
        )
      ),

      h('div', { className: 'portal-field' },
        h('label', null, 'Tags'),
        h('div', { className: 'portal-checkbox-group', role: 'group', 'aria-label': 'Tags' },
          TAGS.map(function (t) {
            var checked = draft.tags.indexOf(t) !== -1;
            return h('label', { key: t, className: 'portal-checkbox-option' },
              h('input', {
                type: 'checkbox',
                checked: checked,
                onChange: function () { toggleTag(t); }
              }),
              h('span', null, t)
            );
          })
        )
      ),

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
          placeholder: 'Shown on the public staff roster. Markdown allowed.'
        })
      ),

      h('div', { className: 'portal-form-actions' },
        h('button', {
          type: 'submit', className: 'portal-btn', disabled: saving
        }, saving ? 'Saving…' : (hasProfile ? 'Save profile' : 'Create profile')),
        h('button', {
          type: 'button', className: 'portal-btn is-ghost',
          onClick: onCancel, disabled: saving
        }, 'Cancel'),
        (hasProfile && allowDelete) ? h('button', {
          type: 'button',
          className: 'portal-btn is-danger',
          style: { marginLeft: 'auto' },
          onClick: function () {
            if (confirm('Remove ' + row.member.name + ' from the Medical Division roster? The FC member record is not deleted.')) {
              onDelete(row);
            }
          },
          disabled: saving
        }, 'Remove from roster') : null
      )
    );
  }

  // --------- Read-only row ----------
  function StaffRow(props) {
    var row = props.row;
    var onEdit = props.onEdit;
    var hasProfile = !!row.profile;
    var positions = hasProfile ? row.profile.positions : [];
    var tags      = hasProfile ? row.profile.tags : [];

    return h('tr', null,
      h('td', null,
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '0.4rem' } },
          !hasProfile ? h('span', { className: 'portal-badge is-pinned' }, 'Needs profile') : null,
          h('span', { style: { fontWeight: 600 } }, row.member.name)
        )
      ),
      h('td', null,
        positions.length
          ? h('div', { className: 'portal-faction-tags' },
              positions.map(function (p) {
                return h('span', { key: p, className: 'portal-faction-tag' }, p);
              })
            )
          : h('span', { style: { color: 'var(--text-secondary)' } }, '—')
      ),
      h('td', null,
        tags.length
          ? h('div', { className: 'portal-faction-tags' },
              tags.map(function (t) {
                return h('span', { key: t, className: 'portal-faction-tag' }, t);
              })
            )
          : h('span', { style: { color: 'var(--text-secondary)' } }, '—')
      ),
      h('td', { style: { whiteSpace: 'nowrap', textAlign: 'right' } },
        h('button', {
          type: 'button',
          className: 'portal-btn is-small is-ghost',
          onClick: function () { onEdit(row); }
        }, hasProfile ? 'Edit' : 'Add profile')
      )
    );
  }

  // --------- Main component ----------
  function MedicalStaff() {
    var allowDelete = PVAdminAPI.hasRole('admin') || PVAdminAPI.hasRole('officer');

    var membersState = useState([]);
    var members = membersState[0], setMembers = membersState[1];
    var profilesState = useState([]);
    var profiles = profilesState[0], setProfiles = profilesState[1];

    var loadingState = useState(true);
    var loading = loadingState[0], setLoading = loadingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];
    var flashState = useState('');
    var flash = flashState[0], setFlash = flashState[1];

    var modalState = useState(null); // null | row
    var modalRow = modalState[0], setModalRow = modalState[1];

    var queryState = useState('');
    var query = queryState[0], setQuery = queryState[1];

    function flashFor(msg) {
      setFlash(msg);
      setTimeout(function () { setFlash(''); }, 3500);
    }

    async function reload() {
      setErr('');
      try {
        var membersData = await PVAdminAPI.request('GET', '/members', undefined, true);
        var profilesData = await PVAdminAPI.request('GET', '/medical-staff/admin', undefined, true);
        setMembers(Array.isArray(membersData) ? membersData : []);
        setProfiles(Array.isArray(profilesData) ? profilesData : []);
      } catch (e) {
        setErr(e.message || 'Failed to load roster.');
      } finally {
        setLoading(false);
      }
    }

    useEffect(function () { reload(); }, []);

    // Join members (faction includes Medical) with their profile, if any.
    var rows = useMemo(function () {
      var byId = {};
      profiles.forEach(function (p) {
        if (p && p.member_id != null) {
          byId[p.member_id] = {
            positions: parseList(p.positions),
            tags: parseList(p.tags),
            description: p.description || ''
          };
        }
      });
      return members
        .filter(memberIsMedical)
        .map(function (m) { return { member: m, profile: byId[m.id] || null }; });
    }, [members, profiles]);

    var filtered = useMemo(function () {
      var q = query.trim().toLowerCase();
      var out = rows.slice();
      if (q) {
        out = out.filter(function (r) {
          var hay = [
            r.member.name || '',
            r.profile ? (r.profile.positions || []).join(' ') : '',
            r.profile ? (r.profile.tags || []).join(' ') : '',
            r.profile ? (r.profile.description || '') : ''
          ].join(' ').toLowerCase();
          return hay.indexOf(q) !== -1;
        });
      }
      return out.sort(compareRows);
    }, [rows, query]);

    async function handleSave(row, draft) {
      await PVAdminAPI.request('PUT', '/medical-staff/' + row.member.id, draft, true);
      flashFor(row.profile ? 'Profile updated.' : 'Profile created.');
      setModalRow(null);
      await reload();
    }

    async function handleDelete(row) {
      try {
        await PVAdminAPI.request('DELETE', '/medical-staff/' + row.member.id, undefined, true);
        flashFor('Removed from roster.');
        setModalRow(null);
        await reload();
      } catch (e) {
        setErr(e.message || 'Failed to remove from roster.');
      }
    }

    var needsProfileCount = rows.filter(function (r) { return !r.profile; }).length;
    var publishedCount = rows.length - needsProfileCount;

    return h('div', null,
      h('div', { className: 'portal-card', style: { padding: '0.85rem 1.1rem' } },
        h('div', {
          style: { display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }
        },
          h('h2', { className: 'portal-card-title', style: { margin: 0, flex: 1 } }, 'Medical Division Roster'),
          h('input', {
            type: 'search',
            value: query,
            onChange: function (e) { setQuery(e.target.value); },
            placeholder: 'Search name, position, tag…',
            style: {
              padding: '0.4rem 0.6rem',
              background: 'var(--bg-darker)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '0.3rem',
              minWidth: '14rem'
            }
          })
        ),
        h('p', { style: { margin: '0.6rem 0 0', color: 'var(--text-secondary)', fontSize: '0.92rem' } },
          'Roster pulls automatically from FC members with Faction = Medical. ' +
          'Members without a profile are visible to admins only — they appear on the public ' +
          'Staff Roster once a profile is saved.'
        ),
        h('p', { style: { margin: '0.3rem 0 0', color: 'var(--text-secondary)', fontSize: '0.92rem' } },
          publishedCount + ' published · ' + needsProfileCount + ' awaiting profile'
        ),
        flash ? h('div', { className: 'portal-flash success', style: { marginTop: '0.75rem', marginBottom: 0 } }, flash) : null
      ),

      err ? h('div', { className: 'portal-card' },
        h('div', { className: 'portal-flash error' }, err)
      ) : null,

      loading
        ? h('div', { className: 'portal-card' }, 'Loading roster…')
        : !filtered.length
          ? h('div', { className: 'portal-card' },
              h('p', { style: { color: 'var(--text-secondary)', margin: 0 } },
                rows.length
                  ? 'No members match that search.'
                  : 'No FC members have Faction = Medical yet. Set a member’s Faction to Medical in FC Members to add them here.'
              )
            )
          : h('div', { className: 'portal-card', style: { padding: 0 } },
              h('div', { className: 'portal-table-wrap' },
                h('table', { className: 'portal-table' },
                  h('thead', null,
                    h('tr', null,
                      h('th', null, 'Name'),
                      h('th', null, 'Position(s)'),
                      h('th', null, 'Tags'),
                      h('th', { style: { textAlign: 'right', width: '1%', whiteSpace: 'nowrap' } }, '')
                    )
                  ),
                  h('tbody', null,
                    filtered.map(function (r) {
                      return h(StaffRow, {
                        key: r.member.id,
                        row: r,
                        onEdit: function (rr) { setModalRow(rr); }
                      });
                    })
                  )
                )
              )
            ),

      modalRow ? h(window.PVAdminModal, {
        title: (modalRow.profile ? 'Edit profile — ' : 'Add profile — ') + (modalRow.member.name || ''),
        size: 'lg',
        onClose: function () { setModalRow(null); }
      },
        h(StaffForm, {
          row: modalRow,
          onSave: function (draft) { return handleSave(modalRow, draft); },
          onCancel: function () { setModalRow(null); },
          onDelete: handleDelete,
          allowDelete: allowDelete
        })
      ) : null
    );
  }

  window.PVAdminMedicalStaff = MedicalStaff;
})();
