// ============================================================================
//  PVAdminAppointments — Medical Records → Appointment Requests
//
//  The queue of appointment requests (from the Appointment Request page),
//  each with its patient intake. Open requests (requested and scheduled) show
//  by default; Seen, Cancelled, Archived and All are filters. Opening a
//  request shows the request, its intake (Out of Character included) and:
//    - scheduling: the assigned medic (defaults to the requested one) and
//      when, free text; moving it back, marking it seen, cancelling (a medic's
//      cancellation posts nothing to Discord) or reopening
//    - the patient record: linked automatically when the character has one;
//      otherwise "Create patient record", filled from the intake
//    - its treatment reports, and "Write treatment report", which opens the
//      treatment report form filled from the intake and linked to the request
//    - delete (medical.delete): a request with a linked visit is archived
//      instead, so the visit keeps its intake
//
//  Buttons follow the permission grid: medical.view sees the queue,
//  medical.edit schedules, cancels, creates the record and writes the report,
//  medical.delete deletes.
//
//  Worker routes: GET /appointments?status=, GET/PATCH/DELETE /appointments/:id,
//  POST /patients, POST /visits; GET /medical-staff for the medic picker.
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var M = window.PVMedical;

  var FILTERS = [
    { id: 'open', label: 'Open' },
    { id: 'seen', label: 'Seen' },
    { id: 'cancelled', label: 'Cancelled' },
    { id: 'archived', label: 'Archived' },
    { id: 'all', label: 'All' }
  ];

  // Each status leads with its state, as the dashboard's rows do: a red pill
  // where a medic has to act, a brown dot while it's in hand, quiet once done.
  var STATUS = {
    requested: { label: 'Requested', cls: 'pill' },
    scheduled: { label: 'Scheduled', cls: 'status-dot is-brown' },
    seen:      { label: 'Seen', cls: 'status-dot is-quiet' },
    cancelled: { label: 'Cancelled', cls: 'status-dot is-quiet' },
    archived:  { label: 'Archived', cls: 'status-dot is-quiet' }
  };
  function StatusTag(props) {
    var s = STATUS[props.status] || { label: props.status, cls: 'status-dot is-quiet' };
    return h('span', { className: s.cls }, s.label);
  }

  // Worker timestamps are UTC "YYYY-MM-DD HH:MM:SS"; show the viewer's date.
  function fmtDate(utc) {
    if (!utc) return '';
    var d = new Date(String(utc).replace(' ', 'T') + 'Z');
    if (isNaN(d.getTime())) return String(utc);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function hasValue(v) { return v != null && String(v).trim() !== ''; }

  function Field(props) {
    if (!hasValue(props.value)) return null;
    return h('div', { className: 'appt-field' },
      h('div', { className: 'appt-field-label' }, props.label),
      h('div', { className: 'appt-field-value' }, String(props.value))
    );
  }

  // The intake, In Character then Out of Character (medics always see it).
  function IntakeView(props) {
    var r = props.request;
    var sections = M.INTAKE_SECTIONS.map(function (s) {
      var shown = s.fields.filter(function (f) { return hasValue(r[f[0]]); });
      if (!shown.length) return null;
      return h('div', { key: s.title, className: 'portal-form-section' },
        h('h3', { className: 'portal-form-section-title' }, s.title),
        shown.map(function (f) { return h(Field, { key: f[0], label: f[1], value: r[f[0]] }); })
      );
    });
    var ooc = M.OOC_FIELDS.filter(function (f) { return hasValue(r[f[0]]); });
    return h(React.Fragment, null,
      sections,
      ooc.length ? h('div', { className: 'portal-form-section' },
        h('h3', { className: 'portal-form-section-title' }, 'Out of Character'),
        ooc.map(function (f) {
          return h(Field, { key: f[0], label: f[1], value: M.oocDisplay(f[0], r[f[0]]) });
        })
      ) : null
    );
  }

  // One request: its details and everything a medic does with it.
  function RequestDetail(props) {
    var id = props.id;
    var canEdit = PVAdminAPI.can('medical.edit');
    var canDelete = PVAdminAPI.can('medical.delete');

    var dataState = useState(null);
    var data = dataState[0], setData = dataState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];
    var busyState = useState(false);
    var busy = busyState[0], setBusy = busyState[1];
    var medicsState = useState([]);
    var medics = medicsState[0], setMedics = medicsState[1];
    var schedState = useState({ assigned: '', when: '' });
    var sched = schedState[0], setSched = schedState[1];
    var modeState = useState('detail'); // 'detail' | 'report'
    var mode = modeState[0], setMode = modeState[1];

    function apply(resp) {
      setData(resp);
      var r = resp && resp.request;
      if (r) setSched({ assigned: r.assigned_medic_id ? String(r.assigned_medic_id) : '', when: r.scheduled_when || '' });
    }

    async function load() {
      setErr('');
      try { apply(await PVAdminAPI.request('GET', '/appointments/' + id, undefined, true)); }
      catch (e) { setErr(e.message || 'Failed to load the request.'); }
    }

    useEffect(function () {
      load();
      PVAdminAPI.request('GET', '/medical-staff', undefined, false)
        .then(function (list) { setMedics(Array.isArray(list) ? list : []); }, function () { setMedics([]); });
    }, [id]);

    async function patch(body) {
      setBusy(true); setErr('');
      try {
        apply(await PVAdminAPI.request('PATCH', '/appointments/' + id, body, true));
        props.onChanged();
      } catch (e) { setErr(e.message || 'Save failed.'); }
      finally { setBusy(false); }
    }

    async function createPatient() {
      var r = data.request;
      setBusy(true); setErr('');
      try {
        var body = {
          member_id: r.member_id || '',
          patient_name: r.character_name,
          race: r.race || '', gender: r.gender || '', age: r.age || '', vanguard_position: '',
          emergency_contact_name: r.emergency_contact_name || '',
          emergency_contact_relationship: r.emergency_contact_relationship || '',
          emergency_contact_method: r.emergency_contact_method || '',
          chronic_illness: r.chronic_illness || '',
          previous_injuries: r.previous_injuries || '',
          known_allergies: r.known_allergies || '',
          current_medications: r.current_medications || '',
          aetheric_abnormalities: r.aetheric_abnormalities || ''
        };
        var res = await PVAdminAPI.request('POST', '/patients', body, true);
        // A linked character's requests attach on their own; this covers the rest.
        if (res && res.patient_id) {
          apply(await PVAdminAPI.request('PATCH', '/appointments/' + id, { patient_id: res.patient_id }, true));
        }
        props.onChanged();
      } catch (e) { setErr(e.message || 'Could not create the patient record.'); }
      finally { setBusy(false); }
    }

    async function writeReport(body) {
      var r = data.request;
      await PVAdminAPI.request('POST', '/visits', Object.assign({}, body, {
        patient_id: r.patient_id,
        patient_name: r.character_name
      }), true);
      setMode('detail');
      await load();
      props.onChanged();
    }

    async function remove() {
      var r = data.request;
      var hasVisit = data.visits && data.visits.length;
      var msg = hasVisit
        ? 'This request has a treatment report, so it will be archived (kept with the report, off the lists) rather than deleted. Continue?'
        : 'Delete the request for ' + r.character_name + '? This cannot be undone.';
      if (!confirm(msg)) return;
      setBusy(true); setErr('');
      try {
        await PVAdminAPI.request('DELETE', '/appointments/' + id, undefined, true);
        props.onChanged();
        props.onClose();
      } catch (e) { setErr(e.message || 'Delete failed.'); setBusy(false); }
    }

    if (err && !data) return h('div', { className: 'portal-flash error' }, err);
    if (!data) return h('p', { className: 'portal-muted' }, 'Loading…');
    var r = data.request;

    if (mode === 'report') {
      return h(window.PVAdminTreatmentReport, {
        patient: { patient_id: r.patient_id, patient_name: r.character_name },
        initial: {},
        request: r,
        submitLabel: 'Save treatment report',
        onSubmit: writeReport,
        onCancel: function () { setMode('detail'); }
      });
    }

    var isOpen = r.status === 'requested' || r.status === 'scheduled';
    var medicOptions = medics.map(function (m) { return h('option', { key: m.member_id, value: String(m.member_id) }, m.name); });

    return h('div', { className: 'appt-detail' },
      err ? h('div', { className: 'portal-flash error' }, err) : null,

      h('div', { className: 'appt-detail-head' },
        h(StatusTag, { status: r.status }),
        h('span', { className: 'portal-muted' }, 'Requested ' + fmtDate(r.created_at))
      ),
      h('div', { className: 'portal-form-section' },
        h('h3', { className: 'portal-form-section-title' }, 'Request'),
        h(Field, { label: 'Character', value: r.character_name }),
        h(Field, { label: 'Requested medic', value: r.requested_medic_name }),
        h(Field, { label: 'Reason for appointment', value: r.reason }),
        r.on_behalf ? h(Field, { label: 'Submitted by', value: r.submitted_by_name }) : null,
        r.status === 'cancelled'
          ? h(Field, { label: 'Cancelled', value: r.cancelled_by === 'patient' ? 'By the patient' : 'By a medic' })
          : null
      ),

      canEdit && r.status !== 'archived' ? h('div', { className: 'portal-form-section' },
        h('h3', { className: 'portal-form-section-title' }, 'Scheduling'),
        h('div', { className: 'portal-field-row' },
          h('div', { className: 'portal-field' },
            h('label', null, 'Assigned medic'),
            h('select', {
              className: 'portal-filter-select', value: sched.assigned,
              onChange: function (e) { setSched(Object.assign({}, sched, { assigned: e.target.value })); }
            },
              h('option', { value: '' }, r.requested_medic_id ? '— The requested medic —' : '— Any available medic —'),
              medicOptions
            )
          ),
          h('div', { className: 'portal-field' },
            h('label', null, 'When'),
            h('input', {
              type: 'text', value: sched.when, placeholder: 'e.g. Fourth Sun, evening',
              onChange: function (e) { setSched(Object.assign({}, sched, { when: e.target.value })); }
            }),
            h('span', { className: 'portal-field-help' }, 'The patient sees this in My Profile once scheduled.')
          )
        ),
        h('div', { className: 'portal-form-actions' },
          isOpen ? h('button', {
            type: 'button', className: 'btn is-small', disabled: busy,
            onClick: function () {
              // Left blank, the worker assigns the requested medic.
              var body = { status: 'scheduled', scheduled_when: sched.when };
              if (sched.assigned) body.assigned_medic_id = Number(sched.assigned);
              patch(body);
            }
          }, r.status === 'scheduled' ? 'Save schedule' : 'Mark scheduled') : null,
          r.status === 'scheduled' ? h('button', {
            type: 'button', className: 'btn is-quiet is-small', disabled: busy,
            onClick: function () { patch({ status: 'requested' }); }
          }, 'Back to requested') : null,
          isOpen ? h('button', {
            type: 'button', className: 'btn is-quiet is-small', disabled: busy,
            onClick: function () { patch({ status: 'seen' }); }
          }, 'Mark seen') : null,
          isOpen ? h('button', {
            type: 'button', className: 'btn is-quiet is-small', disabled: busy,
            onClick: function () {
              if (confirm('Cancel this request? Nothing is posted to Discord.')) patch({ status: 'cancelled' });
            }
          }, 'Cancel request') : null,
          !isOpen ? h('button', {
            type: 'button', className: 'btn is-quiet is-small', disabled: busy,
            onClick: function () { patch({ status: 'requested' }); }
          }, 'Reopen') : null
        )
      ) : null,

      h('div', { className: 'portal-form-section' },
        h('h3', { className: 'portal-form-section-title' }, 'Treatment Reports'),
        data.visits && data.visits.length
          ? data.visits.map(function (v) {
              return h('p', { key: v.visit_id, className: 'appt-visit' },
                (v.visit_date || 'Undated visit') + (v.attending_medic ? ' — ' + v.attending_medic : ''));
            })
          : h('p', { className: 'portal-muted' }, 'None yet.'),
        canEdit && r.status !== 'archived' ? h('div', { className: 'portal-form-actions' },
          r.patient_id
            ? h('button', {
                type: 'button', className: 'btn is-small', disabled: busy,
                onClick: function () { setMode('report'); }
              }, 'Write treatment report')
            : h(React.Fragment, null,
                h('button', { type: 'button', className: 'btn is-small', disabled: busy, onClick: createPatient },
                  'Create patient record'),
                h('span', { className: 'portal-field-help', style: { margin: 0 } },
                  r.character_name + ' has no patient record yet. Create one from this intake, then write the report.')
              )
        ) : null
      ),

      h('div', { className: 'appt-intake' }, h(IntakeView, { request: r })),

      canDelete ? h('div', { className: 'portal-form-actions' },
        h('button', { type: 'button', className: 'btn is-small is-danger', disabled: busy, onClick: remove },
          data.visits && data.visits.length ? 'Archive request' : 'Delete request')
      ) : null
    );
  }

  function Appointments(props) {
    var filterState = useState('open');
    var filter = filterState[0], setFilter = filterState[1];
    var listState = useState([]);
    var list = listState[0], setList = listState[1];
    var loadingState = useState(true);
    var loading = loadingState[0], setLoading = loadingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];
    // The request open in the modal: { id, name }.
    var openState = useState(null);
    var open = openState[0], setOpen = openState[1];

    async function reload() {
      setErr('');
      try {
        var rows = await PVAdminAPI.request('GET', '/appointments?status=' + filter, undefined, true);
        setList(Array.isArray(rows) ? rows : []);
      } catch (e) { setErr(e.message || 'Failed to load appointment requests.'); }
      finally { setLoading(false); }
    }
    useEffect(function () { setLoading(true); reload(); }, [filter]);

    return h('div', null,
      h('div', { className: 'portal-filter-row' },
        h('div', { className: 'seg', role: 'group' },
          FILTERS.map(function (f) {
            return h('button', {
              key: f.id, type: 'button',
              className: 'seg-btn' + (filter === f.id ? ' is-active' : ''),
              onClick: function () { setFilter(f.id); }
            }, f.label);
          })
        )
      ),
      err ? h('div', { className: 'portal-flash error' }, err) : null,
      loading
        ? h('p', { className: 'portal-muted' }, 'Loading appointment requests…')
        : h('div', { className: 'portal-card tear' },
            h('div', { className: 'portal-table-wrap' },
              h('table', { className: 'portal-table' },
                h('thead', null,
                  h('tr', null,
                    h('th', null, 'Requested'),
                    h('th', null, 'Character'),
                    h('th', null, 'Medic'),
                    h('th', null, 'Status'),
                    h('th', null, 'Scheduled'),
                    h('th', { className: 'portal-col-actions' }, '')
                  )
                ),
                h('tbody', null,
                  list.length
                    ? list.map(function (r) {
                        return h('tr', { key: r.id },
                          h('td', null, fmtDate(r.created_at)),
                          h('td', null, r.character_name,
                            r.on_behalf ? h('span', { className: 'portal-muted' }, ' · via ' + r.submitted_by_name) : null),
                          h('td', null, r.assigned_medic_name || r.requested_medic_name),
                          h('td', null, h(StatusTag, { status: r.status })),
                          h('td', null, r.status === 'scheduled' ? (r.scheduled_when || '—') : h('span', { className: 'portal-muted' }, '—')),
                          h('td', { className: 'portal-col-actions' },
                            h('button', {
                              type: 'button', className: 'btn is-small is-quiet',
                              onClick: function () { setOpen({ id: r.id, name: r.character_name }); }
                            }, 'Open'))
                        );
                      })
                    : h('tr', null, h('td', { colSpan: 6, className: 'portal-empty-cell' },
                        filter === 'open' ? 'No open appointment requests.' : 'No requests here.'))
                )
              )
            )
          ),
      open ? h(window.PVAdminModal, {
        title: 'Appointment Request — ' + open.name,
        size: 'lg',
        onClose: function () { setOpen(null); }
      },
        h(RequestDetail, {
          id: open.id,
          onChanged: reload,
          onClose: function () { setOpen(null); }
        })
      ) : null
    );
  }

  window.PVAdminAppointments = Appointments;
})();
