// ============================================================================
//  PVAdminPatients — Medical Division patient records
//
//  Views:
//    - list           : all patients, two actions per row
//                       (Edit patient / Add or edit visits)
//    - new            : create-patient form (patient_id captured here only)
//    - edit-patient   : edit the patient record
//    - visits         : visit list for the selected patient; each visit is a
//                       compact row (date / medic / discharge / complaint).
//                       Editing or adding opens a modal popup. Delete only
//                       on admin role.
//
//  Patient ID is set at creation and never shown or edited afterwards.
//  Visits are sorted by sort_date DESC (falls back to visit_date DESC).
//  sort_date is exposed on the visit form so it can be tuned manually.
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;

  var DISCHARGE_SUGGESTIONS = ['Under Observation', 'Discharged'];

  // Fields on the patient record. `newOnly: true` means the field is only
  // captured on create — never displayed or editable afterwards.
  var PATIENT_FIELDS = [
    { key: 'patient_id',   label: 'Patient ID', type: 'text', required: true, newOnly: true },
    { key: 'patient_name', label: 'Name',       type: 'text', required: true },
    { key: 'race',         label: 'Race',       type: 'text' },
    { key: 'gender',       label: 'Gender',     type: 'text' },
    { key: 'age',          label: 'Age',        type: 'text' },
    { key: 'vanguard_position', label: 'Vanguard Position', type: 'text' },
    { key: 'emergency_contact_name', label: 'Emergency Contact', type: 'text' },
    { key: 'emergency_contact_relationship', label: 'Relationship', type: 'text' },
    { key: 'emergency_contact_method', label: 'Contact Method', type: 'text' },
    { key: 'chronic_illness',       label: 'Chronic Illnesses',     type: 'textarea' },
    { key: 'previous_injuries',     label: 'Previous Injuries',     type: 'textarea' },
    { key: 'known_allergies',       label: 'Known Allergies',       type: 'textarea' },
    { key: 'current_medications',   label: 'Current Medications',   type: 'textarea' },
    { key: 'aetheric_abnormalities', label: 'Aetheric Abnormalities', type: 'textarea' }
  ];

  // Visit form layout:
  // Row 1: visit_date (IC free-text, half)  |  sort_date (real date, half)
  // Below: every other field is full-width. Follow-up + Discharge Status sit
  // after Treatment Plan per the workflow (record care first, then outcome).
  var VISIT_FIELDS = [
    { key: 'visit_date',           label: 'Visit Date (IC)',       type: 'text', required: true,
      placeholder: 'e.g. Third Sun of the Second Umbral Moon',
      help: 'In-character date. Months alternate Astral/Umbral: 1st Astral (month 1), 1st Umbral (month 2), 2nd Astral (month 3), …' },
    { key: 'sort_date',            label: 'Sort Date (real calendar)', type: 'date',
      help: 'Real-world date used only to order visits in the list.' },
    { key: 'attending_medic',      label: 'Attending Medic',       type: 'text',     fullWidth: true },
    { key: 'presenting_complaint', label: 'Presenting Complaint',  type: 'textarea', fullWidth: true },
    { key: 'current_symptoms',     label: 'Current Symptoms',      type: 'textarea', fullWidth: true },
    { key: 'recent_exposures',     label: 'Recent Exposures',      type: 'textarea', fullWidth: true },
    { key: 'clinical_summary',     label: 'Clinical Summary',      type: 'textarea', fullWidth: true },
    { key: 'diagnosis',            label: 'Diagnosis',             type: 'textarea', fullWidth: true },
    { key: 'procedures_performed', label: 'Procedures Performed',  type: 'textarea', fullWidth: true },
    { key: 'treatment_plan',       label: 'Treatment Plan',        type: 'textarea', fullWidth: true },
    { key: 'follow_up',            label: 'Follow-up',             type: 'textarea', fullWidth: true },
    { key: 'discharge_status',     label: 'Discharge Status',      type: 'text',     fullWidth: true, datalist: 'discharge-status' },
    { key: 'additional_notes',     label: 'Additional Notes',      type: 'textarea', fullWidth: true }
  ];

  // --------- Reusable form ----------
  function RecordForm(props) {
    var fields = props.fields;
    var initial = props.initial || {};
    var isNew = props.isNew;
    var onSubmit = props.onSubmit;
    var onCancel = props.onCancel;
    var submitLabel = props.submitLabel || (isNew ? 'Create' : 'Save');

    var draftState = useState(function () {
      var d = {};
      fields.forEach(function (f) { d[f.key] = initial[f.key] != null ? initial[f.key] : ''; });
      return d;
    });
    var draft = draftState[0], setDraft = draftState[1];
    var savingState = useState(false);
    var saving = savingState[0], setSaving = savingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];

    function setField(k, v) {
      setDraft(function (d) { var n = Object.assign({}, d); n[k] = v; return n; });
    }

    async function handleSubmit(e) {
      e.preventDefault();
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        if (f.newOnly && !isNew) continue;
        if (f.required && !String(draft[f.key] || '').trim()) {
          setErr('“' + f.label + '” is required.');
          return;
        }
      }
      setSaving(true); setErr('');
      try { await onSubmit(draft); }
      catch (e) { setErr(e.message || 'Save failed.'); }
      finally { setSaving(false); }
    }

    return h('form', { onSubmit: handleSubmit },
      err ? h('div', { className: 'portal-flash error' }, err) : null,
      h('div', { className: 'portal-field-row' },
        fields.map(function (f) {
          if (f.newOnly && !isNew) return null;
          var input;
          var common = {
            value: draft[f.key] || '',
            onChange: function (e) { setField(f.key, e.target.value); },
            placeholder: f.placeholder || ''
          };
          if (f.type === 'textarea') {
            input = h('textarea', common);
          } else if (f.type === 'date') {
            input = h('input', Object.assign({ type: 'date' }, common));
          } else {
            input = h('input', Object.assign({ type: 'text', list: f.datalist || null }, common));
          }
          return h('div', {
            className: 'portal-field',
            key: f.key,
            style: f.fullWidth ? { gridColumn: '1 / -1' } : undefined
          },
            h('label', null, f.label + (f.required ? ' *' : '')),
            input,
            f.help ? h('span', { className: 'portal-field-help' }, f.help) : null
          );
        })
      ),
      h('datalist', { id: 'discharge-status' },
        DISCHARGE_SUGGESTIONS.map(function (v) { return h('option', { key: v, value: v }); })),
      h('div', { className: 'portal-form-actions' },
        h('button', {
          type: 'submit',
          className: 'portal-btn',
          disabled: saving
        }, saving ? 'Saving…' : submitLabel),
        onCancel ? h('button', {
          type: 'button',
          className: 'portal-btn is-ghost',
          onClick: onCancel,
          disabled: saving
        }, 'Cancel') : null
      )
    );
  }

  // --------- Patient list ----------
  function PatientList(props) {
    var patients = props.patients;
    var onEditPatient = props.onEditPatient;
    var onVisits = props.onVisits;
    var onNew = props.onNew;

    var filterState = useState('');
    var filter = filterState[0], setFilter = filterState[1];

    var q = filter.trim().toLowerCase();
    var filtered = q
      ? patients.filter(function (p) {
          return (p.patient_name && p.patient_name.toLowerCase().indexOf(q) !== -1);
        })
      : patients;

    return h('div', { className: 'portal-card' },
      h('div', { className: 'portal-card-header' },
        h('h2', { className: 'portal-card-title' }, 'Patient Records'),
        h('div', { className: 'portal-card-actions' },
          h('input', {
            type: 'search',
            className: 'portal-search',
            placeholder: 'Filter by name…',
            value: filter,
            onChange: function (e) { setFilter(e.target.value); }
          }),
          h('button', {
            type: 'button',
            className: 'portal-btn',
            onClick: onNew
          },
            h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'person_add'),
            h('span', null, 'New patient')
          )
        )
      ),
      h('div', { className: 'portal-table-wrap' },
        h('table', { className: 'portal-table' },
          h('thead', null,
            h('tr', null,
              h('th', null, 'Name'),
              h('th', { style: { width: '1%', whiteSpace: 'nowrap', textAlign: 'right' } }, 'Actions')
            )
          ),
          h('tbody', null,
            filtered.length
              ? filtered.map(function (p) {
                  return h('tr', { key: p.patient_id },
                    h('td', null, p.patient_name),
                    h('td', { style: { textAlign: 'right', whiteSpace: 'nowrap' } },
                      h('button', {
                        type: 'button',
                        className: 'portal-btn is-small is-ghost',
                        onClick: function () { onEditPatient(p.patient_id); }
                      }, 'Edit patient'),
                      ' ',
                      h('button', {
                        type: 'button',
                        className: 'portal-btn is-small',
                        onClick: function () { onVisits(p.patient_id); }
                      }, 'Add or edit visits')
                    )
                  );
                })
              : h('tr', null,
                  h('td', {
                    colSpan: 2,
                    style: { color: 'var(--text-secondary)', textAlign: 'center', padding: '1.5rem' }
                  }, q ? 'No patients match your filter.' : 'No patients yet.')
                )
          )
        )
      )
    );
  }

  // --------- Patient edit ----------
  function PatientEdit(props) {
    var patientId = props.patientId;
    var onBack = props.onBack;

    var dataState = useState(null);
    var data = dataState[0], setData = dataState[1];
    var loadingState = useState(true);
    var loading = loadingState[0], setLoading = loadingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];
    var savedState = useState(false);
    var saved = savedState[0], setSaved = savedState[1];

    useEffect(function () {
      var cancelled = false;
      setLoading(true);
      PVAdminAPI.request('GET', '/patients/' + patientId, undefined, true)
        .then(function (resp) { if (!cancelled) setData(resp); })
        .catch(function (e) { if (!cancelled) setErr(e.message || 'Failed to load patient.'); })
        .finally(function () { if (!cancelled) setLoading(false); });
      return function () { cancelled = true; };
    }, [patientId]);

    async function handleSave(draft) {
      await PVAdminAPI.request('PUT', '/patients/' + patientId, draft, true);
      setSaved(true);
      setTimeout(function () { setSaved(false); }, 2500);
    }

    if (loading) return h('div', { className: 'portal-card' }, 'Loading patient…');
    if (err || !data || !data.patient) return h('div', { className: 'portal-card' },
      h('div', { className: 'portal-flash error' }, err || 'Patient not found.'),
      h('button', { type: 'button', className: 'portal-btn is-ghost', onClick: onBack }, 'Back')
    );

    var p = data.patient;

    return h('div', { className: 'portal-card' },
      h('div', { className: 'portal-card-header' },
        h('button', {
          type: 'button',
          className: 'portal-btn is-ghost is-small',
          onClick: onBack
        },
          h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'arrow_back'),
          h('span', null, 'All patients')
        ),
        h('h2', { className: 'portal-card-title' },
          'Edit Patient — ' + p.patient_name)
      ),
      saved ? h('div', { className: 'portal-flash success' }, 'Saved.') : null,
      h(RecordForm, {
        fields: PATIENT_FIELDS,
        initial: p,
        isNew: false,
        submitLabel: 'Save patient',
        onSubmit: handleSave
      })
    );
  }

  // --------- Visit read row (compact) ----------
  function VisitRow(props) {
    var v = props.visit;
    var onEdit = props.onEdit;
    var onDelete = props.onDelete;
    var allowDelete = props.allowDelete;

    var preview = v.presenting_complaint || '';
    if (preview.length > 60) preview = preview.slice(0, 60) + '…';

    return h('tr', null,
      h('td', null, v.visit_date || h('span', { style: { color: 'var(--text-secondary)' } }, '—')),
      h('td', null, v.attending_medic || h('span', { style: { color: 'var(--text-secondary)' } }, '—')),
      h('td', null, v.discharge_status || h('span', { style: { color: 'var(--text-secondary)' } }, '—')),
      h('td', null, preview || h('span', { style: { color: 'var(--text-secondary)' } }, '—')),
      h('td', { style: { whiteSpace: 'nowrap', textAlign: 'right' } },
        h('button', {
          type: 'button',
          className: 'portal-btn is-small is-ghost',
          onClick: function () { onEdit(v); }
        }, 'Edit'),
        allowDelete ? h('span', null, ' ',
          h('button', {
            type: 'button',
            className: 'portal-btn is-small is-danger',
            onClick: function () {
              if (confirm('Delete visit from ' + (v.visit_date || 'unknown date') + '? This cannot be undone.')) {
                onDelete(v);
              }
            }
          }, 'Delete')
        ) : null
      )
    );
  }

  // --------- Visits list ----------
  function PatientVisits(props) {
    var patientId = props.patientId;
    var onBack = props.onBack;
    var allowDelete = PVAdminAPI.hasRole('admin');

    var dataState = useState(null);
    var data = dataState[0], setData = dataState[1];
    var loadingState = useState(true);
    var loading = loadingState[0], setLoading = loadingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];

    // modalVisit: null = closed, {} = adding new, <visit> = editing.
    var modalState = useState(null);
    var modalVisit = modalState[0], setModalVisit = modalState[1];

    async function reload() {
      setErr('');
      try {
        var resp = await PVAdminAPI.request('GET', '/patients/' + patientId, undefined, true);
        setData(resp);
      } catch (e) {
        setErr(e.message || 'Failed to load patient.');
      } finally {
        setLoading(false);
      }
    }

    useEffect(function () { reload(); }, [patientId]);

    async function handleCreate(draft) {
      var body = Object.assign({}, draft, {
        patient_id: patientId,
        patient_name: data.patient.patient_name,
        sort_date: (draft.sort_date || '').trim() || new Date().toISOString().slice(0, 10)
      });
      await PVAdminAPI.request('POST', '/visits', body, true);
      setModalVisit(null);
      await reload();
    }

    async function handleUpdate(visitId, draft) {
      var body = Object.assign({}, draft, {
        sort_date: (draft.sort_date || '').trim() || new Date().toISOString().slice(0, 10)
      });
      await PVAdminAPI.request('PUT', '/visits/' + visitId, body, true);
      setModalVisit(null);
      await reload();
    }

    async function handleDelete(visit) {
      try {
        await PVAdminAPI.request('DELETE', '/visits/' + visit.visit_id, undefined, true);
        await reload();
      } catch (e) {
        setErr(e.message || 'Failed to delete visit.');
      }
    }

    if (loading) return h('div', { className: 'portal-card' }, 'Loading visits…');
    if (err || !data || !data.patient) return h('div', { className: 'portal-card' },
      h('div', { className: 'portal-flash error' }, err || 'Patient not found.'),
      h('button', { type: 'button', className: 'portal-btn is-ghost', onClick: onBack }, 'Back')
    );

    var p = data.patient;
    var visits = (data.visits || []).slice().sort(function (a, b) {
      var ka = a.sort_date || a.visit_date || '';
      var kb = b.sort_date || b.visit_date || '';
      if (ka < kb) return 1;
      if (ka > kb) return -1;
      return 0;
    });

    var modalOpen = modalVisit !== null;
    var modalIsNew = modalOpen && !modalVisit.visit_id;

    return h('div', { className: 'portal-card' },
      h('div', { className: 'portal-card-header' },
        h('button', {
          type: 'button',
          className: 'portal-btn is-ghost is-small',
          onClick: onBack
        },
          h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'arrow_back'),
          h('span', null, 'All patients')
        ),
        h('h2', { className: 'portal-card-title' },
          'Visits — ' + p.patient_name),
        h('div', { className: 'portal-card-actions' },
          h('button', {
            type: 'button',
            className: 'portal-btn is-small',
            onClick: function () {
              setModalVisit({ sort_date: new Date().toISOString().slice(0, 10) });
            }
          },
            h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'add'),
            h('span', null, 'Add visit')
          )
        )
      ),
      h('div', { className: 'portal-table-wrap', style: { marginTop: '0.75rem' } },
        h('table', { className: 'portal-table' },
          h('thead', null,
            h('tr', null,
              h('th', null, 'Date'),
              h('th', null, 'Medic'),
              h('th', null, 'Discharge'),
              h('th', null, 'Presenting Complaint'),
              h('th', { style: { textAlign: 'right', width: '1%', whiteSpace: 'nowrap' } }, 'Actions')
            )
          ),
          h('tbody', null,
            visits.length
              ? visits.map(function (v) {
                  return h(VisitRow, {
                    key: v.visit_id,
                    visit: v,
                    onEdit: function (visit) { setModalVisit(visit); },
                    onDelete: handleDelete,
                    allowDelete: allowDelete
                  });
                })
              : h('tr', null,
                  h('td', {
                    colSpan: 5,
                    style: { color: 'var(--text-secondary)', textAlign: 'center', padding: '1.5rem' }
                  }, 'No visits recorded yet.')
                )
          )
        )
      ),
      modalOpen ? h(window.PVAdminModal, {
        title: modalIsNew
          ? 'New Visit — ' + p.patient_name
          : 'Edit Visit — ' + (modalVisit.visit_date || ''),
        size: 'lg',
        onClose: function () { setModalVisit(null); }
      },
        h(RecordForm, {
          fields: VISIT_FIELDS,
          initial: modalVisit,
          isNew: modalIsNew,
          submitLabel: modalIsNew ? 'Add visit' : 'Save visit',
          onSubmit: function (draft) {
            return modalIsNew
              ? handleCreate(draft)
              : handleUpdate(modalVisit.visit_id, draft);
          },
          onCancel: function () { setModalVisit(null); }
        })
      ) : null
    );
  }

  // --------- New patient ----------
  function PatientNew(props) {
    var onCreated = props.onCreated;
    var onCancel = props.onCancel;

    async function handleCreate(draft) {
      await PVAdminAPI.request('POST', '/patients', draft, true);
      onCreated(draft.patient_id);
    }

    return h('div', { className: 'portal-card' },
      h('div', { className: 'portal-card-header' },
        h('button', {
          type: 'button',
          className: 'portal-btn is-ghost is-small',
          onClick: onCancel
        },
          h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'arrow_back'),
          h('span', null, 'All patients')
        ),
        h('h2', { className: 'portal-card-title' }, 'New Patient Record')
      ),
      h(RecordForm, {
        fields: PATIENT_FIELDS,
        initial: {},
        isNew: true,
        submitLabel: 'Create patient',
        onSubmit: handleCreate,
        onCancel: onCancel
      })
    );
  }

  // --------- Top-level ----------
  function Patients() {
    var viewState = useState('list'); // 'list' | 'new' | 'edit-patient' | 'visits'
    var view = viewState[0], setView = viewState[1];
    var selectedState = useState(null);
    var selected = selectedState[0], setSelected = selectedState[1];
    var patientsState = useState([]);
    var patients = patientsState[0], setPatients = patientsState[1];
    var loadingState = useState(true);
    var loading = loadingState[0], setLoading = loadingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];

    async function reload() {
      setErr('');
      try {
        var list = await PVAdminAPI.request('GET', '/patients', undefined, true);
        setPatients(Array.isArray(list) ? list : []);
      } catch (e) {
        setErr(e.message || 'Failed to load patients.');
      } finally {
        setLoading(false);
      }
    }

    useEffect(function () { reload(); }, []);

    function goList() { setView('list'); setSelected(null); reload(); }

    if (err && view === 'list') {
      return h('div', { className: 'portal-card' },
        h('div', { className: 'portal-flash error' }, err),
        h('button', { type: 'button', className: 'portal-btn is-ghost', onClick: reload }, 'Retry')
      );
    }
    if (loading && view === 'list') return h('div', { className: 'portal-card' }, 'Loading patients…');

    if (view === 'new') {
      return h(PatientNew, {
        onCreated: function (id) { setSelected(id); setView('edit-patient'); reload(); },
        onCancel: goList
      });
    }
    if (view === 'edit-patient' && selected) {
      return h(PatientEdit, { patientId: selected, onBack: goList });
    }
    if (view === 'visits' && selected) {
      return h(PatientVisits, { patientId: selected, onBack: goList });
    }

    return h(PatientList, {
      patients: patients,
      onEditPatient: function (id) { setSelected(id); setView('edit-patient'); },
      onVisits: function (id) { setSelected(id); setView('visits'); },
      onNew: function () { setView('new'); }
    });
  }

  window.PVAdminPatients = Patients;
})();
