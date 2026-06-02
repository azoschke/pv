// ============================================================================
//  PVAdminJobBoard — Job board management for officers/admins
//
//  Worker routes:
//    GET    /jobs          public
//    POST   /jobs          officer | admin
//    PATCH  /jobs/:id      officer | admin
//    DELETE /jobs/:id      officer | admin
//    POST   /jobs/images   officer | admin  (single image upload)
//
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

  async function uploadJobImage(file, jobTitle) {
    var session = PVAdminAPI.getSession();
    if (!session) {
      PVAdminAPI.redirectToLogin();
      throw new Error('Session expired. Please sign in again.');
    }
    var blob = await resizeImageToWebp(file);
    var form = new FormData();
    form.append('file', blob, 'upload.webp');
    form.append('job_title', jobTitle);
    var res = await fetch(PVAdminAPI.API_BASE + '/jobs/images', {
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

  var CATEGORIES = [
    { value: 'mercenary',   label: 'Mercenary' },
    { value: 'medical',     label: 'Medical' },
    { value: 'pirate',      label: 'Pirate' },
    { value: 'house_staff', label: 'House Staff' },
    { value: 'contractor',  label: 'Contractor' }
  ];

  var STATUSES = [
    { value: 'open',   label: 'Open' },
    { value: 'closed', label: 'Closed' },
    { value: 'filled', label: 'Filled' }
  ];

  function labelFor(list, val) {
    for (var i = 0; i < list.length; i++) if (list[i].value === val) return list[i].label;
    return val || '';
  }

  function emptyDraft() {
    return {
      title: '',
      category: 'medical',
      status: 'open',
      description: '',
      contact: '',
      image_url: ''
    };
  }

  function jobToDraft(j) {
    if (!j) return emptyDraft();
    return {
      id: j.id,
      title: j.title || '',
      category: j.category || 'medical',
      status: j.status || 'open',
      description: j.description || '',
      contact: j.contact || '',
      image_url: j.image_url || ''
    };
  }

  function draftToPayload(draft) {
    return {
      title: draft.title.trim(),
      category: draft.category,
      status: draft.status,
      description: draft.description.trim() || null,
      contact: draft.contact.trim() || null,
      image_url: draft.image_url.trim() || null
    };
  }

  // ── Form ────────────────────────────────────────────────────────────────
  function JobForm(props) {
    var initial = props.initial;
    var onSubmit = props.onSubmit;
    var onCancel = props.onCancel;
    var isEdit = !!(initial && initial.id);

    var draftState = useState(initial ? jobToDraft(initial) : emptyDraft());
    var draft = draftState[0], setDraft = draftState[1];
    var savingState = useState(false);
    var saving = savingState[0], setSaving = savingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];
    var uploadingState = useState(false);
    var uploading = uploadingState[0], setUploading = uploadingState[1];
    var uploadErrState = useState('');
    var uploadErr = uploadErrState[0], setUploadErr = uploadErrState[1];

    var titleReady = !!draft.title.trim();

    function setField(k, v) {
      setDraft(function (d) { return Object.assign({}, d, { [k]: v }); });
    }

    async function handleImageUpload(file) {
      if (!file) return;
      if (!titleReady) { setUploadErr('Enter the job title before uploading.'); return; }
      if (file.size > UPLOAD_MAX_BYTES) { setUploadErr('File is larger than 10 MB. Pick a smaller image.'); return; }
      setUploadErr('');
      setUploading(true);
      try {
        var url = await uploadJobImage(file, draft.title.trim());
        setField('image_url', url);
      } catch (e) {
        setUploadErr(e.message || 'Upload failed.');
      } finally {
        setUploading(false);
      }
    }

    function uploadButton() {
      var disabled = !titleReady || uploading || saving;
      var title = !titleReady
        ? 'Enter the job title above before uploading an image.'
        : (uploading ? 'Uploading…' : 'Upload an image.');
      return h('label', {
        className: 'portal-btn is-ghost is-small',
        title: title,
        style: {
          whiteSpace: 'nowrap',
          opacity: disabled ? 0.55 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer'
        }
      },
        uploading ? 'Uploading…' : 'Upload',
        h('input', {
          type: 'file',
          accept: UPLOAD_ACCEPT,
          disabled: disabled,
          style: { display: 'none' },
          onChange: function (e) {
            var f = e.target.files && e.target.files[0];
            e.target.value = '';
            handleImageUpload(f);
          }
        })
      );
    }

    async function handleSubmit(e) {
      e.preventDefault();
      if (!draft.title.trim()) { setErr('Title is required.'); return; }
      setSaving(true); setErr('');
      try {
        await onSubmit(draftToPayload(draft));
      } catch (e2) {
        setErr(e2.message || 'Failed to save posting.');
        setSaving(false);
      }
    }

    return h('form', { onSubmit: handleSubmit },
      err ? h('div', { className: 'portal-flash error' }, err) : null,

      h('div', { className: 'portal-field' },
        h('label', null, 'Title *'),
        h('input', {
          type: 'text', maxLength: 120,
          value: draft.title,
          onChange: function (e) { setField('title', e.target.value); }
        })
      ),

      h('div', { className: 'portal-field-row' },
        h('div', { className: 'portal-field' },
          h('label', null, 'Division *'),
          h('select', {
            value: draft.category,
            onChange: function (e) { setField('category', e.target.value); }
          }, CATEGORIES.map(function (c) {
            return h('option', { key: c.value, value: c.value }, c.label);
          }))
        ),
        h('div', { className: 'portal-field' },
          h('label', null, 'Status *'),
          h('select', {
            value: draft.status,
            onChange: function (e) { setField('status', e.target.value); }
          }, STATUSES.map(function (s) {
            return h('option', { key: s.value, value: s.value }, s.label);
          }))
        )
      ),

      h('div', { className: 'portal-field' },
        h('label', null, 'Contact'),
        h('input', {
          type: 'text', maxLength: 200,
          value: draft.contact,
          onChange: function (e) { setField('contact', e.target.value); },
          placeholder: 'Who to reach, IC or OOC (e.g. /tell, Discord)'
        })
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
          uploadButton()
        ),
        h('p', { className: 'portal-field-help' },
          'Paste a URL, or upload an image. The posting must be titled before uploading.'
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
          onChange: function (e) { setField('description', e.target.value); },
          rows: 6, maxLength: 4000,
          placeholder: 'Markdown allowed.'
        })
      ),

      h('div', { className: 'portal-form-actions' },
        h('button', {
          type: 'submit', className: 'portal-btn', disabled: saving
        }, saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create posting')),
        h('button', {
          type: 'button', className: 'portal-btn is-ghost',
          onClick: onCancel, disabled: saving
        }, 'Cancel')
      )
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────
  function JobRow(props) {
    var j = props.job;
    var onEdit = props.onEdit;
    var onDelete = props.onDelete;

    var statusCls = 'portal-badge' + (j.status === 'open' ? ' is-pinned' : '');

    return h('tr', null,
      h('td', null,
        h('span', { style: { fontWeight: 600 } }, j.title)
      ),
      h('td', null, labelFor(CATEGORIES, j.category)),
      h('td', null,
        h('span', { className: statusCls }, labelFor(STATUSES, j.status))
      ),
      h('td', null,
        j.contact || h('span', { style: { color: 'var(--text-secondary)' } }, '—')
      ),
      h('td', { style: { whiteSpace: 'nowrap' } },
        h('button', {
          type: 'button', className: 'portal-btn is-small is-ghost',
          onClick: function () { onEdit(j); }
        }, 'Edit'),
        ' ',
        h('button', {
          type: 'button', className: 'portal-btn is-small is-danger',
          onClick: function () {
            if (confirm('Delete posting "' + j.title + '"?')) onDelete(j);
          }
        }, 'Delete')
      )
    );
  }

  function JobBoard() {
    var listState = useState([]);
    var list = listState[0], setList = listState[1];
    var loadingState = useState(true);
    var loading = loadingState[0], setLoading = loadingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];
    var flashState = useState('');
    var flash = flashState[0], setFlash = flashState[1];
    var formState = useState(null); // null | { job?: object }
    var formOpen = formState[0], setFormOpen = formState[1];
    var queryState = useState('');
    var query = queryState[0], setQuery = queryState[1];

    async function reload() {
      setErr('');
      try {
        var data = await PVAdminAPI.request('GET', '/jobs', undefined, true);
        setList(Array.isArray(data) ? data : []);
      } catch (e) {
        setErr(e.message || 'Failed to load postings.');
      } finally {
        setLoading(false);
      }
    }

    useEffect(function () { reload(); }, []);

    var filtered = useMemo(function () {
      var q = query.trim().toLowerCase();
      var statusRank = { open: 0, closed: 1, filled: 1 };
      var sorted = list.slice().sort(function (a, b) {
        var ra = statusRank[a.status] == null ? 2 : statusRank[a.status];
        var rb = statusRank[b.status] == null ? 2 : statusRank[b.status];
        return ra - rb
          || (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
      });
      if (!q) return sorted;
      return sorted.filter(function (j) {
        return (
          (j.title || '').toLowerCase().indexOf(q) !== -1 ||
          (j.description || '').toLowerCase().indexOf(q) !== -1 ||
          (j.contact || '').toLowerCase().indexOf(q) !== -1 ||
          labelFor(CATEGORIES, j.category).toLowerCase().indexOf(q) !== -1
        );
      });
    }, [list, query]);

    function flashFor(msg) {
      setFlash(msg);
      setTimeout(function () { setFlash(''); }, 3500);
    }

    async function handleSubmit(payload) {
      var editingId = formOpen && formOpen.job && formOpen.job.id;
      if (editingId) {
        await PVAdminAPI.request('PATCH', '/jobs/' + editingId, payload, true);
        flashFor('Posting updated.');
      } else {
        await PVAdminAPI.request('POST', '/jobs', payload, true);
        flashFor('Posting created.');
      }
      setFormOpen(null);
      await reload();
    }

    async function handleDelete(j) {
      try {
        await PVAdminAPI.request('DELETE', '/jobs/' + j.id, undefined, true);
        flashFor('Posting deleted.');
        await reload();
      } catch (e) {
        setErr(e.message || 'Failed to delete posting.');
      }
    }

    return h('div', null,
      h('div', { className: 'portal-card', style: { padding: '0.85rem 1.1rem' } },
        h('div', {
          style: { display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }
        },
          h('h2', { className: 'portal-card-title', style: { margin: 0, flex: 1 } }, 'Job Board'),
          h('input', {
            type: 'search',
            className: 'portal-search',
            value: query,
            onChange: function (e) { setQuery(e.target.value); },
            placeholder: 'Search postings…'
          }),
          h('button', {
            type: 'button',
            className: 'portal-btn',
            onClick: function () { setFormOpen({ job: null }); }
          },
            h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'add'),
            h('span', null, 'New posting')
          )
        ),
        flash ? h('div', { className: 'portal-flash success', style: { marginTop: '0.75rem', marginBottom: 0 } }, flash) : null
      ),

      err ? h('div', { className: 'portal-card' },
        h('div', { className: 'portal-flash error' }, err)
      ) : null,

      loading
        ? h('div', { className: 'portal-card' }, 'Loading postings…')
        : !filtered.length
          ? h('div', { className: 'portal-card' },
              h('p', { style: { color: 'var(--text-secondary)', margin: 0 } },
                list.length ? 'No postings match that search.' : 'No postings yet. Add the first one.'
              )
            )
          : h('div', { className: 'portal-card' },
              h('div', { className: 'portal-table-wrap' },
                h('table', { className: 'portal-table' },
                  h('thead', null,
                    h('tr', null,
                      h('th', null, 'Title'),
                      h('th', null, 'Division'),
                      h('th', null, 'Status'),
                      h('th', null, 'Contact'),
                      h('th', null, '')
                    )
                  ),
                  h('tbody', null,
                    filtered.map(function (j) {
                      return h(JobRow, {
                        key: j.id,
                        job: j,
                        onEdit: function (jj) { setFormOpen({ job: jj }); },
                        onDelete: handleDelete
                      });
                    })
                  )
                )
              )
            ),

      formOpen ? h(window.PVAdminModal, {
        title: formOpen.job ? 'Edit posting' : 'New posting',
        size: 'lg',
        onClose: function () { setFormOpen(null); }
      },
        h(JobForm, {
          initial: formOpen.job || null,
          onSubmit: handleSubmit,
          onCancel: function () { setFormOpen(null); }
        })
      ) : null
    );
  }

  // The Job Board section stacks the jobs management card on top of the
  // applications management card (loaded from applications.js), mirroring the
  // bulletin-board-over-roster layout of the division sections.
  function JobBoardSection() {
    return h('div', null,
      h(JobBoard),
      window.PVAdminApplications ? h(window.PVAdminApplications) : null
    );
  }

  window.PVAdminJobBoard = JobBoardSection;
})();
