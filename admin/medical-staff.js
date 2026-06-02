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

  var UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp';
  var UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
  var UPLOAD_TARGET_WIDTH = 1400;
  var UPLOAD_WEBP_QUALITY = 0.8;

  // Decode the picked file, downscale to UPLOAD_TARGET_WIDTH (auto height) if
  // wider than that, and re-encode as WebP. Returns a Blob ready to upload.
  async function resizeImageToWebp(file) {
    var bitmap = null;
    if (typeof createImageBitmap === 'function') {
      try { bitmap = await createImageBitmap(file); }
      catch (_e) { bitmap = null; }
    }
    if (!bitmap) {
      bitmap = await new Promise(function (resolve, reject) {
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not read image.')); };
        img.src = url;
      });
    }
    var srcW = bitmap.width || bitmap.naturalWidth;
    var srcH = bitmap.height || bitmap.naturalHeight;
    if (!srcW || !srcH) throw new Error('Could not read image dimensions.');
    var w = srcW > UPLOAD_TARGET_WIDTH ? UPLOAD_TARGET_WIDTH : srcW;
    var hgt = Math.max(1, Math.round((w / srcW) * srcH));
    var canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = hgt;
    var ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get a 2D canvas context.');
    ctx.drawImage(bitmap, 0, 0, w, hgt);
    if (bitmap.close) { try { bitmap.close(); } catch (_e) {} }
    return await new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) {
        if (!b) reject(new Error('Could not encode image as WebP (browser may not support it).'));
        else resolve(b);
      }, 'image/webp', UPLOAD_WEBP_QUALITY);
    });
  }

  async function uploadMedicalStaffImage(file, memberName) {
    var session = PVAdminAPI.getSession();
    if (!session) {
      PVAdminAPI.redirectToLogin();
      throw new Error('Session expired. Please sign in again.');
    }
    var blob = await resizeImageToWebp(file);
    var form = new FormData();
    form.append('file', blob, 'upload.webp');
    form.append('member_name', memberName);
    var res = await fetch(PVAdminAPI.API_BASE + '/medical-staff/images', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + session.token,
        'Accept': 'application/json'
      },
      body: form
    });
    if (res.status === 401) {
      PVAdminAPI.clearSession();
      PVAdminAPI.redirectToLogin();
      throw new Error('Your session is no longer valid. Please sign in again.');
    }
    var text = await res.text();
    var data = null;
    if (text) {
      try { data = JSON.parse(text); } catch (_e) { data = { raw: text }; }
    }
    if (!res.ok) {
      var msg = (data && (data.error || data.message)) || ('Upload failed (' + res.status + ')');
      throw new Error(msg);
    }
    if (!data || !data.url) throw new Error('Upload succeeded but response was missing a URL.');
    return data.url;
  }

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
      description: profile.description || '',
      image_url: profile.image_url || ''
    });
    var draft = draftState[0], setDraft = draftState[1];
    var savingState = useState(false);
    var saving = savingState[0], setSaving = savingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];
    var uploadingState = useState(false);
    var uploading = uploadingState[0], setUploading = uploadingState[1];
    var uploadErrState = useState('');
    var uploadErr = uploadErrState[0], setUploadErr = uploadErrState[1];

    function setField(k, v) {
      setDraft(function (d) { var n = Object.assign({}, d); n[k] = v; return n; });
    }

    async function handleImageUpload(file) {
      if (!file) return;
      if (file.size > UPLOAD_MAX_BYTES) {
        setUploadErr('File is larger than 10 MB. Pick a smaller image.');
        return;
      }
      setUploadErr('');
      setUploading(true);
      try {
        var url = await uploadMedicalStaffImage(file, row.member.name);
        setField('image_url', url);
      } catch (e) {
        setUploadErr(e.message || 'Upload failed.');
      } finally {
        setUploading(false);
      }
    }

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
          description: draft.description.trim(),
          image_url: draft.image_url.trim() || null
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
        h('label', null, 'Image'),
        h('div', { style: { display: 'flex', gap: '0.5rem', alignItems: 'center' } },
          h('input', {
            type: 'text',
            value: draft.image_url,
            onChange: function (e) { setField('image_url', e.target.value); },
            placeholder: 'https://…',
            style: { flex: 1 }
          }),
          h('label', {
            className: 'portal-btn is-ghost is-small',
            title: uploading ? 'Uploading…' : 'Upload an image.',
            style: {
              whiteSpace: 'nowrap',
              opacity: (uploading || saving) ? 0.55 : 1,
              cursor: (uploading || saving) ? 'not-allowed' : 'pointer'
            }
          },
            uploading ? 'Uploading…' : 'Upload',
            h('input', {
              type: 'file',
              accept: UPLOAD_ACCEPT,
              disabled: uploading || saving,
              style: { display: 'none' },
              onChange: function (e) {
                var f = e.target.files && e.target.files[0];
                e.target.value = '';
                handleImageUpload(f);
              }
            })
          )
        ),
        h('p', { className: 'portal-field-help' },
          'Paste a URL or upload a portrait. Shown on the public staff roster card.'
        ),
        uploadErr ? h('p', {
          className: 'portal-field-help',
          style: { color: 'var(--danger-color, #c0392b)' }
        }, uploadErr) : null,
        draft.image_url ? h('img', {
          src: draft.image_url, alt: '',
          style: {
            display: 'block', marginTop: '0.5rem',
            maxWidth: '320px', maxHeight: '180px',
            border: '1px solid var(--border-color)', borderRadius: '0.3rem',
            objectFit: 'cover'
          },
          onError: function (e) { e.target.style.display = 'none'; }
        }) : null
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
            description: p.description || '',
            image_url: p.image_url || ''
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
          'If you do not see a member of the Medical team within this list, ensure they are tagged with Medical in the primary FC list.'
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
      ) : null,

      window.PVAdminApplicationsCard
        ? h(window.PVAdminApplicationsCard, { division: 'medical', label: 'Medical' })
        : null
    );
  }

  window.PVAdminMedicalStaff = MedicalStaff;
})();
