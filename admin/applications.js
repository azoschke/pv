// ============================================================================
//  PVAdminApplications — recruitment applications
//
//  Exposes two globals:
//    - PVAdminApplications     full management card (Name · Position · Division
//                              · Date · Stage). Rendered beneath the Jobs card
//                              in the Job Board section. Officer/admin edit.
//    - PVAdminApplicationsCard read-only, division-filtered card dropped onto
//                              the Mercenary / Pirate / Medical / House Staff
//                              division pages as an informational card.
//
//  An application links an FC member (name from /members) to a posted job
//  (position from /jobs). The division is captured from the chosen job's
//  category by the worker, so the card on each division page can filter to it.
//
//  Worker routes:
//    GET    /applications[?division=]   officer | admin | pirate | mercenary
//    POST   /applications               officer | admin
//    PATCH  /applications/:id           officer | admin
//    DELETE /applications/:id           officer | admin
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useMemo = React.useMemo;

  var STAGES = [
    { value: 'new',       label: 'New' },
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'accepted',  label: 'Accepted' },
    { value: 'declined',  label: 'Declined' }
  ];

  // Stages that still need action. The read-only division card only surfaces
  // these; accepted/declined are resolved and drop off (still visible in the
  // full Job Board management card).
  var ACTIONABLE_STAGES = ['new', 'scheduled'];

  // Mirrors the job board categories (and the worker's JOB_CATEGORIES).
  var DIVISIONS = [
    { value: 'medical',     label: 'Medical' },
    { value: 'pirate',      label: 'Pirate' },
    { value: 'mercenary',   label: 'Mercenary' },
    { value: 'house_staff', label: 'House Staff' },
    { value: 'contractor',  label: 'Contractor' }
  ];

  function labelFor(list, val) {
    for (var i = 0; i < list.length; i++) if (list[i].value === val) return list[i].label;
    return val || '';
  }

  function stageBadgeClass(stage) {
    if (stage === 'new')      return 'portal-pill is-red-fill';
    if (stage === 'scheduled') return 'portal-pill is-gold';
    if (stage === 'accepted') return 'portal-pill is-green';
    if (stage === 'declined') return 'portal-pill is-red';
    return 'portal-pill is-muted';
  }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso.indexOf('Z') === -1 ? iso + 'Z' : iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  // Local YYYY-MM-DD for <input type="date"> defaults.
  function todayStr() {
    var d = new Date();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + mm + '-' + dd;
  }

  // Pull the date portion out of a stored created_at ("YYYY-MM-DD HH:MM:SS").
  function dateInputValue(iso) {
    if (!iso) return todayStr();
    var m = String(iso).match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : todayStr();
  }

  // Searchable member picker. Source of truth is the member id (value);
  // backed by a free-text box that filters the roster as you type.
  function MemberCombobox(props) {
    var members = props.members;   // already name-sorted
    var value = props.value;       // selected member id as a string ('' if none)
    var onChange = props.onChange; // (idString) => void

    var selected = null;
    for (var i = 0; i < members.length; i++) {
      if (String(members[i].id) === value) { selected = members[i]; break; }
    }

    var textState = useState(selected ? selected.name : '');
    var text = textState[0], setText = textState[1];
    var openState = useState(false);
    var open = openState[0], setOpen = openState[1];

    // Resync the visible text if the selection changes from outside.
    useEffect(function () {
      setText(selected ? selected.name : '');
    // eslint-disable-next-line
    }, [value]);

    var q = text.trim().toLowerCase();
    var matches = members.filter(function (m) {
      return !q || (m.name || '').toLowerCase().indexOf(q) !== -1;
    }).slice(0, 50);

    function pick(m) {
      onChange(String(m.id));
      setText(m.name);
      setOpen(false);
    }

    function handleBlur() {
      // Close after any option mousedown has had a chance to fire. If the typed
      // text exactly names one member, adopt it; otherwise restore the current
      // selection's name (or clear).
      setTimeout(function () {
        setOpen(false);
        var typed = text.trim().toLowerCase();
        var exact = members.filter(function (m) {
          return (m.name || '').toLowerCase() === typed;
        });
        if (exact.length === 1) {
          onChange(String(exact[0].id));
          setText(exact[0].name);
        } else {
          setText(selected ? selected.name : '');
        }
      }, 150);
    }

    return h('div', { style: { position: 'relative' } },
      h('input', {
        type: 'text',
        value: text,
        placeholder: 'Type to search members…',
        autoComplete: 'off',
        onChange: function (e) {
          setText(e.target.value);
          setOpen(true);
          if (value) onChange(''); // editing the text invalidates the prior pick
        },
        onFocus: function () { setOpen(true); },
        onBlur: handleBlur
      }),
      open && matches.length
        ? h('ul', {
            style: {
              position: 'absolute', zIndex: 30, left: 0, right: 0, top: '100%',
              margin: '0.2rem 0 0', padding: '0.25rem', listStyle: 'none',
              maxHeight: '12rem', overflowY: 'auto',
              background: 'var(--bg-darker)',
              border: '1px solid var(--border-color)', borderRadius: '0.3rem',
              boxShadow: '0 6px 18px rgba(0,0,0,0.25)'
            }
          },
            matches.map(function (m) {
              return h('li', { key: m.id },
                h('button', {
                  type: 'button',
                  // mousedown (not click) so it fires before the input blur.
                  onMouseDown: function (e) { e.preventDefault(); pick(m); },
                  style: {
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '0.35rem 0.5rem', background: 'none', border: 'none',
                    color: 'var(--text-primary)', cursor: 'pointer', borderRadius: '0.2rem',
                    font: 'inherit'
                  }
                }, m.name)
              );
            })
          )
        : null
    );
  }

  function StageBadge(props) {
    var stage = props.stage;
    var declined = stage === 'declined';
    return h('span', {
      className: stageBadgeClass(stage),
      style: declined ? { opacity: 0.65 } : null
    }, labelFor(STAGES, stage));
  }

  // ── New / edit form ───────────────────────────────────────────────────────
  function ApplicationForm(props) {
    var initial = props.initial;
    var members = props.members;
    var jobs = props.jobs;
    var onSubmit = props.onSubmit;
    var onCancel = props.onCancel;
    var isEdit = !!(initial && initial.id);

    var draftState = useState({
      member_id: initial && initial.member_id != null ? String(initial.member_id) : '',
      job_id: initial && initial.job_id != null ? String(initial.job_id) : '',
      stage: (initial && initial.stage) || 'new',
      date: dateInputValue(initial && initial.created_at)
    });
    var draft = draftState[0], setDraft = draftState[1];
    var savingState = useState(false);
    var saving = savingState[0], setSaving = savingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];

    function setField(k, v) {
      setDraft(function (d) { return Object.assign({}, d, { [k]: v }); });
    }

    var sortedMembers = useMemo(function () {
      return (members || []).slice().sort(function (a, b) {
        return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
      });
    }, [members]);

    var sortedJobs = useMemo(function () {
      return (jobs || []).slice().sort(function (a, b) {
        return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
      });
    }, [jobs]);

    // Preview the division the worker will capture from the chosen job.
    var selectedJob = useMemo(function () {
      for (var i = 0; i < (jobs || []).length; i++) {
        if (String(jobs[i].id) === draft.job_id) return jobs[i];
      }
      return null;
    }, [jobs, draft.job_id]);

    async function handleSubmit(e) {
      e.preventDefault();
      if (!draft.member_id) { setErr('Pick an FC member.'); return; }
      if (!draft.job_id)    { setErr('Pick a position.'); return; }
      if (!draft.date)      { setErr('Pick a date.'); return; }
      setSaving(true); setErr('');
      try {
        await onSubmit({
          member_id: Number(draft.member_id),
          job_id: Number(draft.job_id),
          stage: draft.stage,
          // Stored at noon so the displayed day is stable across time zones.
          created_at: draft.date + ' 12:00:00'
        });
      } catch (e2) {
        setErr(e2.message || 'Failed to save application.');
        setSaving(false);
      }
    }

    return h('form', { onSubmit: handleSubmit },
      err ? h('div', { className: 'portal-flash error' }, err) : null,

      h('div', { className: 'portal-field' },
        h('label', null, 'Member *'),
        h(MemberCombobox, {
          members: sortedMembers,
          value: draft.member_id,
          onChange: function (id) { setField('member_id', id); }
        }),
        !sortedMembers.length ? h('p', { className: 'portal-field-help' },
          'No FC members loaded. Add them under FC Members first.') : null
      ),

      h('div', { className: 'portal-field' },
        h('label', null, 'Position *'),
        h('select', {
          value: draft.job_id,
          onChange: function (e) { setField('job_id', e.target.value); }
        },
          h('option', { value: '' }, 'Select a posted job…'),
          sortedJobs.map(function (j) {
            return h('option', { key: j.id, value: String(j.id) },
              j.title + ' (' + labelFor(DIVISIONS, j.category) + ')');
          })
        ),
        selectedJob ? h('p', { className: 'portal-field-help' },
          'Division: ' + labelFor(DIVISIONS, selectedJob.category)) : null,
        !sortedJobs.length ? h('p', { className: 'portal-field-help' },
          'No jobs posted yet. Create one in the Jobs card above first.') : null
      ),

      h('div', { className: 'portal-field-row' },
        h('div', { className: 'portal-field' },
          h('label', null, 'Stage *'),
          h('select', {
            value: draft.stage,
            onChange: function (e) { setField('stage', e.target.value); }
          }, STAGES.map(function (s) {
            return h('option', { key: s.value, value: s.value }, s.label);
          }))
        ),
        h('div', { className: 'portal-field' },
          h('label', null, 'Date *'),
          h('input', {
            type: 'date',
            value: draft.date,
            max: todayStr(),
            onChange: function (e) { setField('date', e.target.value); }
          }),
          h('p', { className: 'portal-field-help' }, 'Defaults to today. Set earlier to back-date.')
        )
      ),

      h('div', { className: 'portal-form-actions' },
        h('button', {
          type: 'submit', className: 'portal-btn', disabled: saving
        }, saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Add application')),
        h('button', {
          type: 'button', className: 'portal-btn is-ghost',
          onClick: onCancel, disabled: saving
        }, 'Cancel')
      )
    );
  }

  // ── Management row (Job Board section) ──────────────────────────────────────
  function AppRow(props) {
    var a = props.app;
    var onEdit = props.onEdit;
    var onDelete = props.onDelete;
    var onStage = props.onStage;

    return h('tr', null,
      h('td', null, h('span', { style: { fontWeight: 600 } }, a.member_name)),
      h('td', null, a.job_title),
      h('td', null, labelFor(DIVISIONS, a.division)),
      h('td', { style: { whiteSpace: 'nowrap' } }, formatDate(a.created_at)),
      h('td', null,
        h('select', {
          className: 'portal-filter-select',
          value: a.stage,
          onChange: function (e) { onStage(a, e.target.value); }
        }, STAGES.map(function (s) {
          return h('option', { key: s.value, value: s.value }, s.label);
        }))
      ),
      h('td', { style: { whiteSpace: 'nowrap', textAlign: 'right' } },
        h('button', {
          type: 'button', className: 'portal-btn is-small is-ghost',
          onClick: function () { onEdit(a); }
        }, 'Edit'),
        ' ',
        h('button', {
          type: 'button', className: 'portal-btn is-small is-danger',
          onClick: function () {
            if (confirm('Delete the application for "' + a.member_name + '"?')) onDelete(a);
          }
        }, 'Delete')
      )
    );
  }

  function Applications() {
    var listState = useState([]);
    var list = listState[0], setList = listState[1];
    var membersState = useState([]);
    var members = membersState[0], setMembers = membersState[1];
    var jobsState = useState([]);
    var jobs = jobsState[0], setJobs = jobsState[1];

    var loadingState = useState(true);
    var loading = loadingState[0], setLoading = loadingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];
    var flashState = useState('');
    var flash = flashState[0], setFlash = flashState[1];

    var formState = useState(null); // null | { app: object|null }
    var formOpen = formState[0], setFormOpen = formState[1];
    var queryState = useState('');
    var query = queryState[0], setQuery = queryState[1];
    var divisionState = useState('');
    var divisionFilter = divisionState[0], setDivisionFilter = divisionState[1];

    function flashFor(msg) {
      setFlash(msg);
      setTimeout(function () { setFlash(''); }, 3500);
    }

    async function reload() {
      setErr('');
      try {
        var apps = await PVAdminAPI.request('GET', '/applications', undefined, true);
        setList(Array.isArray(apps) ? apps : []);
      } catch (e) {
        setErr(e.message || 'Failed to load applications.');
      } finally {
        setLoading(false);
      }
    }

    // Members + jobs feed the new/edit dropdowns. Failure here is non-fatal —
    // the list still renders; the form just shows empty selects.
    async function loadPickers() {
      try {
        var m = await PVAdminAPI.request('GET', '/members', undefined, true);
        setMembers(Array.isArray(m) ? m : []);
      } catch (_e) { /* leave empty */ }
      try {
        var j = await PVAdminAPI.request('GET', '/jobs', undefined, true);
        setJobs(Array.isArray(j) ? j : []);
      } catch (_e) { /* leave empty */ }
    }

    useEffect(function () { reload(); loadPickers(); }, []);

    var filtered = useMemo(function () {
      var q = query.trim().toLowerCase();
      var out = list.slice().sort(function (a, b) {
        var ta = Date.parse(a.created_at || '') || 0;
        var tb = Date.parse(b.created_at || '') || 0;
        if (tb !== ta) return tb - ta;
        return (b.id || 0) - (a.id || 0);
      });
      if (divisionFilter) {
        out = out.filter(function (a) { return a.division === divisionFilter; });
      }
      if (q) {
        out = out.filter(function (a) {
          return (
            (a.member_name || '').toLowerCase().indexOf(q) !== -1 ||
            (a.job_title || '').toLowerCase().indexOf(q) !== -1 ||
            labelFor(DIVISIONS, a.division).toLowerCase().indexOf(q) !== -1
          );
        });
      }
      return out;
    }, [list, query, divisionFilter]);

    async function handleSubmit(payload) {
      var editingId = formOpen && formOpen.app && formOpen.app.id;
      if (editingId) {
        await PVAdminAPI.request('PATCH', '/applications/' + editingId, payload, true);
        flashFor('Application updated.');
      } else {
        await PVAdminAPI.request('POST', '/applications', payload, true);
        flashFor('Application added.');
      }
      setFormOpen(null);
      await reload();
    }

    async function handleStage(a, stage) {
      if (stage === a.stage) return;
      try {
        await PVAdminAPI.request('PATCH', '/applications/' + a.id, { stage: stage }, true);
        flashFor('Stage updated.');
        await reload();
      } catch (e) {
        setErr(e.message || 'Failed to update stage.');
      }
    }

    async function handleDelete(a) {
      try {
        await PVAdminAPI.request('DELETE', '/applications/' + a.id, undefined, true);
        flashFor('Application deleted.');
        await reload();
      } catch (e) {
        setErr(e.message || 'Failed to delete application.');
      }
    }

    var anyFilterActive = !!(query || divisionFilter);

    return h('div', null,
      h('div', { className: 'portal-card', style: { padding: '0.85rem 1.1rem' } },
        h('div', {
          style: { display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }
        },
          h('h2', { className: 'portal-card-title', style: { margin: 0, flex: 1 } }, 'Applications'),
          h('input', {
            type: 'search',
            className: 'portal-search',
            value: query,
            onChange: function (e) { setQuery(e.target.value); },
            placeholder: 'Search applications…'
          }),
          h('button', {
            type: 'button',
            className: 'portal-btn',
            onClick: function () { setFormOpen({ app: null }); }
          },
            h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'add'),
            h('span', null, 'New application')
          )
        ),
        h('div', { className: 'portal-filter-row', style: { marginTop: '0.6rem' } },
          h('select', {
            className: 'portal-filter-select',
            value: divisionFilter,
            onChange: function (e) { setDivisionFilter(e.target.value); }
          },
            h('option', { value: '' }, 'All Divisions'),
            DIVISIONS.map(function (d) { return h('option', { key: d.value, value: d.value }, d.label); })
          ),
          anyFilterActive ? h('button', {
            type: 'button',
            className: 'portal-btn is-ghost is-small',
            onClick: function () { setQuery(''); setDivisionFilter(''); }
          }, 'Clear filters') : null
        ),
        flash ? h('div', { className: 'portal-flash success', style: { marginTop: '0.75rem', marginBottom: 0 } }, flash) : null
      ),

      err ? h('div', { className: 'portal-card' },
        h('div', { className: 'portal-flash error' }, err)
      ) : null,

      loading
        ? h('div', { className: 'portal-card' }, 'Loading applications…')
        : !filtered.length
          ? h('div', { className: 'portal-card' },
              h('p', { style: { color: 'var(--text-secondary)', margin: 0 } },
                list.length ? 'No applications match your filter.' : 'No applications yet. Add the first one.'
              )
            )
          : h('div', { className: 'portal-card' },
              h('div', { className: 'portal-table-wrap' },
                h('table', { className: 'portal-table' },
                  h('thead', null,
                    h('tr', null,
                      h('th', null, 'Name'),
                      h('th', null, 'Position'),
                      h('th', null, 'Division'),
                      h('th', null, 'Date'),
                      h('th', null, 'Stage'),
                      h('th', { style: { textAlign: 'right', width: '1%', whiteSpace: 'nowrap' } }, '')
                    )
                  ),
                  h('tbody', null,
                    filtered.map(function (a) {
                      return h(AppRow, {
                        key: a.id,
                        app: a,
                        onEdit: function (aa) { setFormOpen({ app: aa }); },
                        onDelete: handleDelete,
                        onStage: handleStage
                      });
                    })
                  )
                )
              )
            ),

      formOpen ? h(window.PVAdminModal, {
        title: formOpen.app ? 'Edit application' : 'New application',
        size: 'lg',
        onClose: function () { setFormOpen(null); }
      },
        h(ApplicationForm, {
          initial: formOpen.app || null,
          members: members,
          jobs: jobs,
          onSubmit: handleSubmit,
          onCancel: function () { setFormOpen(null); }
        })
      ) : null
    );
  }

  // ── Read-only division card ─────────────────────────────────────────────────
  //  props:
  //    division   'medical' | 'pirate' | 'mercenary' | 'house_staff' | ...
  //    label      heading prefix (default: the division's display label)
  function ApplicationsCard(props) {
    var division = props.division;
    var label = props.label || labelFor(DIVISIONS, division);

    var listState = useState([]);
    var list = listState[0], setList = listState[1];
    var loadingState = useState(true);
    var loading = loadingState[0], setLoading = loadingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];

    useEffect(function () {
      var cancelled = false;
      (async function () {
        try {
          var data = await PVAdminAPI.request(
            'GET',
            '/applications?division=' + encodeURIComponent(division),
            undefined, true
          );
          if (cancelled) return;
          var rows = (Array.isArray(data) ? data : []).slice().sort(function (a, b) {
            var ta = Date.parse(a.created_at || '') || 0;
            var tb = Date.parse(b.created_at || '') || 0;
            if (tb !== ta) return tb - ta;
            return (b.id || 0) - (a.id || 0);
          });
          setList(rows);
        } catch (e) {
          if (!cancelled) setErr(e.message || 'Failed to load applications.');
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return function () { cancelled = true; };
    }, [division]);

    var actionable = list.filter(function (a) {
      return ACTIONABLE_STAGES.indexOf(a.stage) !== -1;
    });
    var newCount = actionable.filter(function (a) { return a.stage === 'new'; }).length;

    // The card is action-required only. Stay out of the layout entirely while
    // loading or when this division has no actionable applications; only
    // surface on a fetch error so failures aren't silent.
    if (loading) return null;
    if (err) {
      return h('div', { className: 'portal-card' },
        h('div', { className: 'portal-flash error' }, err)
      );
    }
    if (!actionable.length) return null;

    return h('div', { className: 'portal-card' },
      h('div', { className: 'portal-card-header' },
        h('h2', { className: 'portal-card-title' }, 'Job Applications'),
        newCount
          ? h('span', { className: 'portal-pill is-red-fill' }, newCount + ' NEW')
          : null
      ),
      h('p', { className: 'portal-card-subtitle' },
        'Job Applications from current Phoenix Vanguard Company Members.'),
      h('div', { className: 'portal-table-wrap' },
        h('table', { className: 'portal-table' },
          h('thead', null,
            h('tr', null,
              h('th', null, 'Name'),
              h('th', null, 'Position'),
              h('th', null, 'Date'),
              h('th', null, 'Stage')
            )
          ),
          h('tbody', null,
            actionable.map(function (a) {
              return h('tr', { key: a.id },
                h('td', null, a.member_name),
                h('td', null, a.job_title),
                h('td', { style: { whiteSpace: 'nowrap' } }, formatDate(a.created_at)),
                h('td', null, h(StageBadge, { stage: a.stage }))
              );
            })
          )
        )
      )
    );
  }

  window.PVAdminApplications = Applications;
  window.PVAdminApplicationsCard = ApplicationsCard;
})();
