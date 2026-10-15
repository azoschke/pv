// ============================================================================
//  PVAdminJobBoard — Job board management
//
//  Tabs: Job Postings (jobs.postings) and Applications
//  (jobs.applications_view); each shows only with its permission.
//
//  Worker routes:
//    GET    /jobs          public
//    POST   /jobs          jobs.postings
//    PATCH  /jobs/:id      jobs.postings
//    DELETE /jobs/:id      jobs.postings
//    POST   /images        jobs.postings  (kind 'job', single image upload)
//
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useMemo = React.useMemo;

  var CATEGORIES = [
    { value: 'mercenary',   label: 'Mercenary' },
    { value: 'medical',     label: 'Medical' },
    { value: 'pirate',      label: 'Pirate' },
    { value: 'house_staff', label: 'House Staff' },
    { value: 'recon',       label: 'Recon' },
    { value: 'contractor',  label: 'Contractor' }
  ];

  var STATUSES = [
    { value: 'open',   label: 'Open' },
    { value: 'closed', label: 'Closed' },
    { value: 'filled', label: 'Filled' }
  ];

  // Whether a posting is a primary (main) position — a member may only hold an
  // active application to one primary at a time — or a secondary position, of
  // which a member may apply to any number. Enforced by the worker on apply.
  var JOB_TYPES = [
    { value: 'primary',   label: 'Primary' },
    { value: 'secondary', label: 'Secondary' }
  ];

  function labelFor(list, val) {
    for (var i = 0; i < list.length; i++) if (list[i].value === val) return list[i].label;
    return val || '';
  }

  // Group postings by division/category in CATEGORIES order (unknown last),
  // preserving each group's existing sort. Mirrors the FC Members rank
  // grouping. Returns [{ value, label, jobs }] for non-empty groups only.
  function groupByDivision(jobs) {
    var byCat = {};
    jobs.forEach(function (j) {
      var c = j.category || 'other';
      (byCat[c] = byCat[c] || []).push(j);
    });
    var groups = CATEGORIES
      .filter(function (c) { return byCat[c.value]; })
      .map(function (c) { return { value: c.value, label: c.label, jobs: byCat[c.value] }; });
    Object.keys(byCat).forEach(function (c) {
      var known = CATEGORIES.some(function (x) { return x.value === c; });
      if (!known) groups.push({ value: c, label: c, jobs: byCat[c] });
    });
    return groups;
  }

  function emptyDraft() {
    return {
      title: '',
      category: 'medical',
      job_type: 'primary',
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
      job_type: j.job_type || 'primary',
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
      job_type: draft.job_type,
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

    var titleReady = !!draft.title.trim();

    function setField(k, v) {
      setDraft(function (d) { return Object.assign({}, d, { [k]: v }); });
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

      h('div', { className: 'portal-field-row portal-field-row-triple' },
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
          h('label', null, 'Job Type *'),
          h('select', {
            value: draft.job_type,
            onChange: function (e) { setField('job_type', e.target.value); }
          }, JOB_TYPES.map(function (t) {
            return h('option', { key: t.value, value: t.value }, t.label);
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

      h('p', { className: 'portal-field-help', style: { marginTop: '-0.35rem' } },
        'Job Type: members may apply to only one primary position at a time; secondary positions are unlimited.'),


      h('div', { className: 'portal-field' },
        h('label', null, 'Contact'),
        h('input', {
          type: 'text', maxLength: 200,
          value: draft.contact,
          onChange: function (e) { setField('contact', e.target.value); },
          placeholder: 'Who to reach, IC or OOC (e.g. /tell, Discord)'
        })
      ),

      h(PVAdminImageUpload.ImageField, {
        value: draft.image_url,
        onChange: function (v) { setField('image_url', v); },
        disabled: saving,
        blockedReason: titleReady ? null : 'Enter the job title above before uploading an image.',
        kind: 'job',
        name: draft.title.trim(),
        help: 'Paste a URL, or upload an image. The posting must be titled before uploading.'
      }),

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
          type: 'submit', className: 'btn', disabled: saving
        }, saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create posting')),
        h('button', {
          type: 'button', className: 'btn is-quiet',
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

    // Status is settled (muted text); the job type is a category (square tag).
    var statusCls = 'status-dot is-quiet';
    var typeCls = 'tag';

    return h('tr', null,
      h('td', null,
        h('span', { className: 'portal-row-title' }, j.title)
      ),
      h('td', null,
        h('span', { className: typeCls }, labelFor(JOB_TYPES, j.job_type || 'primary'))
      ),
      h('td', null,
        h('span', { className: statusCls }, labelFor(STATUSES, j.status))
      ),
      h('td', null,
        j.contact || h('span', { className: 'portal-muted' }, '—')
      ),
      h('td', { className: 'portal-nowrap' },
        h('button', {
          type: 'button', className: 'btn is-small is-quiet',
          onClick: function () { onEdit(j); }
        }, 'Edit'),
        ' ',
        h('button', {
          type: 'button', className: 'btn is-small is-danger',
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
          labelFor(CATEGORIES, j.category).toLowerCase().indexOf(q) !== -1 ||
          labelFor(JOB_TYPES, j.job_type || 'primary').toLowerCase().indexOf(q) !== -1
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
      h('div', { className: 'portal-card portal-head' },
        h('div', {
          className: 'portal-head-row'
        },
          h('h2', { className: 'portal-card-title portal-head-title' }, 'Job Board'),
          h('input', {
            type: 'search',
            className: 'portal-search',
            value: query,
            onChange: function (e) { setQuery(e.target.value); },
            placeholder: 'Search postings…'
          }),
          h('button', {
            type: 'button',
            className: 'btn',
            onClick: function () { setFormOpen({ job: null }); }
          },
            h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'add'),
            h('span', null, 'New posting')
          )
        ),
        flash ? h('div', { className: 'portal-flash success is-head' }, flash) : null
      ),

      err ? h('div', { className: 'portal-card' },
        h('div', { className: 'portal-flash error' }, err)
      ) : null,

      loading
        ? h('div', { className: 'portal-card' }, 'Loading postings…')
        : !filtered.length
          ? h('div', { className: 'portal-card' },
              h('p', { className: 'portal-note' },
                list.length ? 'No postings match that search.' : 'No postings yet. Add the first one.'
              )
            )
          : h('div', { className: 'portal-card' },
              h('div', { className: 'portal-table-wrap' },
                h('table', { className: 'portal-table job-board-table' },
                  h('thead', null,
                    h('tr', null,
                      h('th', null, 'Title'),
                      h('th', null, 'Type'),
                      h('th', null, 'Status'),
                      h('th', null, 'Contact'),
                      h('th', null, '')
                    )
                  ),
                  h('tbody', null,
                    groupByDivision(filtered).map(function (g) {
                      return [
                        h('tr', { key: 'grp-' + g.value, className: 'portal-group-row' },
                          h('td', { colSpan: 5, className: 'portal-group-cell' },
                            g.label + ' · ' + g.jobs.length)
                        )
                      ].concat(g.jobs.map(function (j) {
                        return h(JobRow, {
                          key: j.id,
                          job: j,
                          onEdit: function (jj) { setFormOpen({ job: jj }); },
                          onDelete: handleDelete
                        });
                      }));
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
  // Segmented Postings / Applications toggle (mirrors the FC Members chips).
  // The dashboard deep-links into the Applications view with a stage filter
  // (and member search) via portal navParams.
  function JobBoardSection(props) {
    var tabs = [
      PVAdminAPI.can('jobs.postings') ? { id: 'postings', label: 'Job Postings' } : null,
      PVAdminAPI.can('jobs.applications_view') ? { id: 'applications', label: 'Applications' } : null
    ].filter(Boolean);
    var wanted = props && props.initialView === 'applications' ? 'applications' : 'postings';
    var viewState = useState(
      tabs.some(function (t) { return t.id === wanted; }) ? wanted : (tabs[0] ? tabs[0].id : null)
    );
    var view = viewState[0], setView = viewState[1];

    return h('div', null,
      h(window.PVAdminSubnav, {
        tabs: tabs,
        active: view,
        onChange: setView
      }),
      view === 'postings'
        ? h(JobBoard)
        : (window.PVAdminApplications
            ? h(window.PVAdminApplications, {
                initialStage: (props && props.initialStage) || '',
                initialSearch: (props && props.initialSearch) || ''
              })
            : null)
    );
  }

  window.PVAdminJobBoard = JobBoardSection;
})();
