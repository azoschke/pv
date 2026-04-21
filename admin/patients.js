// ============================================================================
//  PVAdminPatients — Medical Division patient records
//
//  Routes used:
//    GET    /patients                list { patient_id, patient_name }
//    GET    /patients/:id            { patient, visits }
//    POST   /patients                create
//    PUT    /patients/:id            update
//    POST   /visits                  create
//    PUT    /visits/:id              update
//    DELETE /visits/:id              admin only
//
//  This component mirrors what the existing med-admin.html page does, but
//  runs inside the portal shell (sidebar stays put; main panel scrolls).
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;

  // Discharge-status dropdown suggestions. Free-text per the locked plan
  // decision, so users can still type anything — this is just a hint list.
  var DISCHARGE_SUGGESTIONS = ['Under Observation', 'Discharged'];

  // Field definitions for the patient record form. Order matters; renders
  // top-to-bottom inside a .portal-field-row grid.
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

  var VISIT_FIELDS = [
    { key: 'visit_date',           label: 'Visit Date',            type: 'text', required: true, placeholder: 'YYYY-MM-DD' },
    { key: 'attending_medic',      label: 'Attending Medic',       type: 'text' },
    { key: 'presenting_complaint', label: 'Presenting Complaint',  type: 'textarea' },
    { key: 'current_symptoms',     label: 'Current Symptoms',      type: 'textarea' },
    { key: 'recent_exposures',     label: 'Recent Exposures',      type: 'textarea' },
    { key: 'clinical_summary',     label: 'Clinical Summary',      type: 'textarea' },
    { key: 'diagnosis',            label: 'Diagnosis',             type: 'textarea' },
    { key: 'procedures_performed', label: 'Procedures Performed',  type: 'textarea' },
    { key: 'treatment_plan',       label: 'Treatment Plan',        type: 'textarea' },
    { key: 'follow_up',            label: 'Follow-up',             type: 'textarea' },
    { key: 'discharge_status',     label: 'Discharge Status',      type: 'text',     datalist: 'discharge-status' },
    { key: 'additional_notes',     label: 'Additional Notes',      type: 'textarea' }
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
          } else {
            input = h('input', Object.assign({ type: 'text', list: f.datalist || null }, common));
          }
          return h('div', { className: 'portal-field', key: f.key },
            h('label', null, f.label + (f.required ? ' *' : '')),
            input
          );
        })
      ),
      h('datalist', { id: 'discharge-status' },
        DISCHARGE_SUGGESTIONS.map(function (v) { return h('option', { key: v, value: v }); })),
      h('div', { style: { display: 'flex', gap: '0.5rem', marginTop: '0.75rem' } },
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
    var onSelect = props.onSelect;
    var onNew = props.onNew;

    var filterState = useState('');
    var filter = filterState[0], setFilter = filterState[1];

    var q = filter.trim().toLowerCase();
    var filtered = q
      ? patients.filter(function (p) {
          return (p.patient_name && p.patient_name.toLowerCase().indexOf(q) !== -1)
              || (String(p.patient_id).indexOf(q) !== -1);
        })
      : patients;

    return h('div', { className: 'portal-card' },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' } },
        h('h2', { className: 'portal-card-title', style: { margin: 0, flex: 1 } }, 'Patient Records'),
        h('input', {
          type: 'search',
          placeholder: 'Filter by name or ID…',
          value: filter,
          onChange: function (e) { setFilter(e.target.value); },
          style: {
            background: 'var(--form-input-bg)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
            padding: '0.4rem 0.6rem',
            borderRadius: '4px',
            minWidth: '16rem'
          }
        }),
        h('button', {
          type: 'button',
          className: 'portal-btn',
          onClick: onNew
        },
          h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'person_add'),
          h('span', null, 'New patient')
        )
      ),
      h('table', { className: 'portal-table', style: { marginTop: '0.75rem' } },
        h('thead', null,
          h('tr', null,
            h('th', null, 'ID'),
            h('th', null, 'Name'),
            h('th', null, '')
          )
        ),
        h('tbody', null,
          filtered.length
            ? filtered.map(function (p) {
                return h('tr', { key: p.patient_id },
                  h('td', null, p.patient_id),
                  h('td', null, p.patient_name),
                  h('td', { style: { textAlign: 'right' } },
                    h('button', {
                      type: 'button',
                      className: 'portal-btn is-small is-ghost',
                      onClick: function () { onSelect(p.patient_id); }
                    }, 'Open')
                  )
                );
              })
            : h('tr', null,
                h('td', {
                  colSpan: 3,
                  style: { color: 'var(--text-secondary)', textAlign: 'center', padding: '1.5rem' }
                }, q ? 'No patients match your filter.' : 'No patients yet.')
              )
        )
      )
    );
  }

  // --------- Patient detail ----------
  function PatientDetail(props) {
    var patientId = props.patientId;
    var onBack = props.onBack;
    var onChanged = props.onChanged;
    var allowDelete = PVAdminAPI.hasRole('admin');

    var dataState = useState(null);  // { patient, visits }
    var data = dataState[0], setData = dataState[1];
    var loadingState = useState(true);
    var loading = loadingState[0], setLoading = loadingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];

    var editingPatientState = useState(false);
    var editingPatient = editingPatientState[0], setEditingPatient = editingPatientState[1];

    var newVisitState = useState(false);
    var newVisit = newVisitState[0], setNewVisit = newVisitState[1];

    var editingVisitState = useState(null);
    var editingVisit = editingVisitState[0], setEditingVisit = editingVisitState[1];

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

    async function handlePatientSave(draft) {
      await PVAdminAPI.request('PUT', '/patients/' + patientId, draft, true);
      setEditingPatient(false);
      await reload();
      if (onChanged) onChanged();
    }

    async function handleVisitCreate(draft) {
      var body = Object.assign({}, draft, {
        patient_id: patientId,
        patient_name: data.patient.patient_name,
        sort_date: draft.visit_date
      });
      await PVAdminAPI.request('POST', '/visits', body, true);
      setNewVisit(false);
      await reload();
    }

    async function handleVisitUpdate(visitId, draft) {
      var body = Object.assign({}, draft, { sort_date: draft.visit_date });
      await PVAdminAPI.request('PUT', '/visits/' + visitId, body, true);
      setEditingVisit(null);
      await reload();
    }

    async function handleVisitDelete(visit) {
      if (!confirm('Delete visit from ' + (visit.visit_date || 'unknown date') + '? This cannot be undone.')) return;
      try {
        await PVAdminAPI.request('DELETE', '/visits/' + visit.visit_id, undefined, true);
        await reload();
      } catch (e) {
        setErr(e.message || 'Failed to delete visit.');
      }
    }

    if (loading) return h('div', { className: 'portal-card' }, 'Loading patient…');
    if (err)     return h('div', { className: 'portal-card' }, h('div', { className: 'portal-flash error' }, err),
      h('button', { type: 'button', className: 'portal-btn is-ghost', onClick: onBack }, 'Back'));
    if (!data || !data.patient) return h('div', { className: 'portal-card' }, 'Patient not found.',
      h('div', { style: { marginTop: '0.5rem' } },
        h('button', { type: 'button', className: 'portal-btn is-ghost', onClick: onBack }, 'Back')));

    var p = data.patient;
    var visits = data.visits || [];

    return h('div', null,
      h('div', { className: 'portal-card' },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '0.75rem' } },
          h('button', {
            type: 'button',
            className: 'portal-btn is-ghost is-small',
            onClick: onBack
          },
            h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'arrow_back'),
            h('span', null, 'All patients')
          ),
          h('h2', { className: 'portal-card-title', style: { margin: 0, flex: 1 } },
            p.patient_name + ' (#' + p.patient_id + ')'),
          editingPatient
            ? null
            : h('button', {
                type: 'button',
                className: 'portal-btn is-small',
                onClick: function () { setEditingPatient(true); }
              }, 'Edit patient')
        ),
        editingPatient
          ? h(RecordForm, {
              fields: PATIENT_FIELDS,
              initial: p,
              isNew: false,
              onSubmit: handlePatientSave,
              onCancel: function () { setEditingPatient(false); }
            })
          : h('dl', { style: { display: 'grid', gridTemplateColumns: 'minmax(9rem, 12rem) 1fr', gap: '0.4rem 1rem', marginTop: '0.75rem' } },
              PATIENT_FIELDS.filter(function (f) { return !f.newOnly; }).map(function (f) {
                var v = p[f.key];
                return [
                  h('dt', { key: f.key + '-k', style: { color: 'var(--text-secondary)', fontFamily: 'Stoke, serif', fontSize: '0.78rem', letterSpacing: '0.08em', textTransform: 'uppercase' } }, f.label),
                  h('dd', { key: f.key + '-v', style: { margin: 0, whiteSpace: 'pre-wrap' } }, v || h('span', { style: { color: 'var(--text-secondary)' } }, '—'))
                ];
              }).flat()
            )
      ),
      h('div', { className: 'portal-card' },
        h('div', { style: { display: 'flex', alignItems: 'center' } },
          h('h2', { className: 'portal-card-title', style: { margin: 0, flex: 1 } }, 'Visits'),
          newVisit
            ? null
            : h('button', {
                type: 'button',
                className: 'portal-btn is-small',
                onClick: function () { setNewVisit(true); setEditingVisit(null); }
              }, 'New visit')
        ),
        newVisit
          ? h('div', { style: { marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' } },
              h(RecordForm, {
                fields: VISIT_FIELDS,
                initial: { visit_date: new Date().toISOString().slice(0, 10) },
                isNew: true,
                submitLabel: 'Add visit',
                onSubmit: handleVisitCreate,
                onCancel: function () { setNewVisit(false); }
              })
            )
          : null,
        visits.length
          ? visits.map(function (v) {
              var isEditing = editingVisit === v.visit_id;
              return h('div', {
                key: v.visit_id,
                style: { marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }
              },
                h('div', { style: { display: 'flex', alignItems: 'center', gap: '0.5rem' } },
                  h('strong', { style: { flex: 1 } }, v.visit_date || 'Undated visit'),
                  v.discharge_status
                    ? h('span', { className: 'portal-badge' + (v.discharge_status === 'Discharged' ? ' is-ok' : '') }, v.discharge_status)
                    : null,
                  !isEditing ? h('button', {
                    type: 'button',
                    className: 'portal-btn is-small is-ghost',
                    onClick: function () { setEditingVisit(v.visit_id); setNewVisit(false); }
                  }, 'Edit') : null,
                  (!isEditing && allowDelete) ? h('button', {
                    type: 'button',
                    className: 'portal-btn is-small is-danger',
                    onClick: function () { handleVisitDelete(v); }
                  }, 'Delete') : null
                ),
                isEditing
                  ? h('div', { style: { marginTop: '0.5rem' } },
                      h(RecordForm, {
                        fields: VISIT_FIELDS,
                        initial: v,
                        isNew: false,
                        onSubmit: function (draft) { return handleVisitUpdate(v.visit_id, draft); },
                        onCancel: function () { setEditingVisit(null); }
                      })
                    )
                  : h('dl', { style: { display: 'grid', gridTemplateColumns: 'minmax(9rem, 12rem) 1fr', gap: '0.3rem 1rem', marginTop: '0.5rem' } },
                      VISIT_FIELDS.map(function (f) {
                        var val = v[f.key];
                        if (!val) return null;
                        return [
                          h('dt', { key: f.key + '-k', style: { color: 'var(--text-secondary)', fontFamily: 'Stoke, serif', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase' } }, f.label),
                          h('dd', { key: f.key + '-v', style: { margin: 0, whiteSpace: 'pre-wrap' } }, val)
                        ];
                      }).filter(Boolean).flat()
                    )
              );
            })
          : (!newVisit
              ? h('p', { style: { color: 'var(--text-secondary)', marginTop: '0.75rem' } }, 'No visits recorded.')
              : null)
      )
    );
  }

  // --------- Top-level section ----------
  function Patients() {
    var viewState = useState('list'); // 'list' | 'detail' | 'new'
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

    async function handleCreatePatient(draft) {
      await PVAdminAPI.request('POST', '/patients', draft, true);
      await reload();
      setView('detail');
      setSelected(draft.patient_id);
    }

    if (err) {
      return h('div', { className: 'portal-card' },
        h('div', { className: 'portal-flash error' }, err),
        h('button', { type: 'button', className: 'portal-btn is-ghost', onClick: reload }, 'Retry')
      );
    }
    if (loading) return h('div', { className: 'portal-card' }, 'Loading patients…');

    if (view === 'new') {
      return h('div', { className: 'portal-card' },
        h('div', { style: { display: 'flex', alignItems: 'center' } },
          h('h2', { className: 'portal-card-title', style: { margin: 0, flex: 1 } }, 'New Patient Record')
        ),
        h(RecordForm, {
          fields: PATIENT_FIELDS,
          initial: {},
          isNew: true,
          submitLabel: 'Create patient',
          onSubmit: handleCreatePatient,
          onCancel: function () { setView('list'); }
        })
      );
    }

    if (view === 'detail' && selected) {
      return h(PatientDetail, {
        patientId: selected,
        onBack: function () { setView('list'); setSelected(null); reload(); },
        onChanged: reload
      });
    }

    return h(PatientList, {
      patients: patients,
      onSelect: function (id) { setSelected(id); setView('detail'); },
      onNew: function () { setView('new'); }
    });
  }

  window.PVAdminPatients = Patients;
})();
