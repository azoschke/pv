// ============================================================================
//  PVAdminTreatmentReport — the treatment report (a visit), written in the
//  portal. It replaces the Treatment Report Form page.
//
//  Patient Records opens it to add or edit a visit; Appointment Requests opens
//  it to answer a request (the request's intake fills the reason for visit
//  and the visit links back to it).
//
//    Date             a date picker that fills the in-character date
//                     ("Third Sun of the Second Umbral Moon") as editable text
//                     and sets the sort date
//    Attending medic  the published Medical staff roster, or Other
//    Request          an optional link to one of the patient's appointment
//                     requests (medical.view)
//    Quick picks      procedures add to their box; follow-up and discharge
//                     fill theirs; Other leaves it empty to type freely
//    Long fields      the bold / italic / heading / list toolbar
//
//  Props:
//    patient      { patient_id, patient_name }
//    initial      the visit being edited, or {} for a new one
//    request      (new only) the appointment request this answers
//    submitLabel  the save button's label
//    onSubmit     fn(body) → promise; body is ready for POST/PUT /visits
//    onCancel     fn()
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useRef = React.useRef;
  var M = window.PVMedical;

  var MARKUP_BUTTONS = [
    ['bold', 'format_bold', 'Bold'],
    ['italic', 'format_italic', 'Italic'],
    ['heading', 'title', 'Heading'],
    ['list', 'format_list_bulleted', 'List']
  ];

  // A textarea with the formatting toolbar (and an optional row of quick picks).
  function MarkupTextarea(props) {
    var ref = useRef(null);
    var pendingSelection = useRef(null);

    useEffect(function () {
      var sel = pendingSelection.current;
      if (sel && ref.current) {
        ref.current.focus();
        ref.current.setSelectionRange(sel.start, sel.end);
        pendingSelection.current = null;
      }
    });

    function markup(type) {
      var el = ref.current;
      if (!el) return;
      var out = M.applyMarkup(props.value || '', el.selectionStart, el.selectionEnd, type);
      pendingSelection.current = { start: out.start, end: out.end };
      props.onChange(out.text);
    }

    return h(React.Fragment, null,
      props.markup === false ? null : h('div', { className: 'markup-toolbar' },
        MARKUP_BUTTONS.map(function (b) {
          return h('button', {
            key: b[0], type: 'button', className: 'markup-btn', title: b[2], 'aria-label': b[2],
            onClick: function () { markup(b[0]); }
          }, h('span', { className: 'material-icons', 'aria-hidden': 'true' }, b[1]));
        })
      ),
      h('textarea', {
        ref: function (el) { ref.current = el; if (props.inputRef) props.inputRef.current = el; },
        value: props.value || '',
        placeholder: props.placeholder || '',
        onChange: function (e) { props.onChange(e.target.value); }
      })
    );
  }

  // Quick picks above a box. 'add' appends the pick (procedures); 'replace'
  // sets the box to the pick's wording (follow-up, discharge). Other leaves
  // the box empty (replace) or as it is (add) and puts the cursor in it.
  function QuickPicks(props) {
    function pick(text) {
      var current = props.value || '';
      var next;
      if (props.mode === 'add') {
        if (current.split(/,\s*/).indexOf(text) !== -1) return;
        next = current.trim() ? current.replace(/[\s,]+$/, '') + ', ' + text : text;
      } else {
        next = text;
      }
      props.onChange(next);
      focusEnd();
    }
    function other() {
      if (props.mode !== 'add') props.onChange('');
      focusEnd();
    }
    function focusEnd() {
      setTimeout(function () {
        var el = props.inputRef && props.inputRef.current;
        if (!el) return;
        el.focus();
        var n = el.value.length;
        el.setSelectionRange(n, n);
      }, 0);
    }
    return h('div', { className: 'portal-quick-picks' },
      props.picks.map(function (p) {
        return h('button', {
          key: p[0], type: 'button', className: 'btn is-quiet is-small',
          onClick: function () { pick(p[1]); }
        }, p[0]);
      }),
      h('button', { type: 'button', className: 'btn is-quiet is-small', onClick: other }, 'Other')
    );
  }

  function requestLabel(r) {
    var when = r.created_at ? String(r.created_at).slice(0, 10) : '';
    var reason = String(r.reason || '');
    if (reason.length > 50) reason = reason.slice(0, 50) + '…';
    return 'Request #' + r.id + (when ? ' · ' + when : '') + (reason ? ' · ' + reason : '') +
      (r.status && r.status !== 'requested' ? ' (' + r.status + ')' : '');
  }

  var OTHER = '__other__';

  function TreatmentReportForm(props) {
    var patient = props.patient || {};
    var initial = props.initial || {};
    var request = props.request || null;
    var isNew = !initial.visit_id;
    var session = PVAdminAPI.getSession();
    var me = (session && (session.display_name || session.username)) || '';

    var draftState = useState(function () {
      var realDate = /^\d{4}-\d{2}-\d{2}$/.test(String(initial.sort_date || ''))
        ? initial.sort_date
        : (isNew ? M.todayISO() : '');
      var fromIntake = request || {};
      return {
        real_date: realDate,
        visit_date: initial.visit_date || (isNew ? M.eorzeanDate(realDate) : ''),
        attending_medic: initial.attending_medic != null
          ? initial.attending_medic
          : ((request && request.assigned_medic_name) || me),
        appointment_id: initial.appointment_id || (request ? request.id : null),
        presenting_complaint: initial.presenting_complaint != null
          ? initial.presenting_complaint
          : (fromIntake.presenting_complaint || fromIntake.reason || ''),
        current_symptoms: initial.current_symptoms != null ? initial.current_symptoms : (fromIntake.current_symptoms || ''),
        recent_exposures: initial.recent_exposures != null ? initial.recent_exposures : (fromIntake.recent_exposures || ''),
        clinical_summary: initial.clinical_summary || '',
        diagnosis: initial.diagnosis || '',
        procedures_performed: initial.procedures_performed || '',
        treatment_plan: initial.treatment_plan || '',
        follow_up: initial.follow_up || '',
        discharge_status: initial.discharge_status || '',
        additional_notes: initial.additional_notes || ''
      };
    });
    var draft = draftState[0], setDraft = draftState[1];
    function setField(k, v) {
      setDraft(function (d) { var n = Object.assign({}, d); n[k] = v; return n; });
    }

    var medicsState = useState([]);
    var medics = medicsState[0], setMedics = medicsState[1];
    var requestsState = useState(null);
    var requests = requestsState[0], setRequests = requestsState[1];
    var otherState = useState(false);
    var medicIsOther = otherState[0], setMedicIsOther = otherState[1];
    var savingState = useState(false);
    var saving = savingState[0], setSaving = savingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];

    var proceduresRef = useRef(null);
    var followUpRef = useRef(null);
    var dischargeRef = useRef(null);

    // The published roster for the medic picker; a name not on it is Other.
    useEffect(function () {
      PVAdminAPI.request('GET', '/medical-staff', undefined, false).then(function (list) {
        var names = (Array.isArray(list) ? list : []).map(function (m) { return m.name; });
        setMedics(names);
        var current = String(draft.attending_medic || '').trim();
        setMedicIsOther(!!current && names.indexOf(current) === -1);
      }, function () { setMedics([]); setMedicIsOther(true); });
    }, []);

    // The patient's requests, for the link (medics who can see the queue).
    useEffect(function () {
      if (!patient.patient_id || !PVAdminAPI.can('medical.view')) return;
      PVAdminAPI.request('GET', '/appointments?status=all&patient_id=' + patient.patient_id, undefined, true)
        .then(function (list) { setRequests(Array.isArray(list) ? list : []); }, function () { setRequests(null); });
    }, [patient.patient_id]);

    function onDate(value) {
      setDraft(function (d) {
        return Object.assign({}, d, { real_date: value, visit_date: value ? M.eorzeanDate(value) : d.visit_date });
      });
    }

    async function handleSubmit(e) {
      e.preventDefault();
      if (!String(draft.visit_date || '').trim()) { setErr('Give the visit a date.'); return; }
      var body = {
        visit_date: draft.visit_date.trim(),
        sort_date: draft.real_date || M.todayISO(),
        attending_medic: String(draft.attending_medic || '').trim(),
        presenting_complaint: draft.presenting_complaint,
        current_symptoms: draft.current_symptoms,
        recent_exposures: draft.recent_exposures,
        clinical_summary: draft.clinical_summary,
        diagnosis: draft.diagnosis,
        procedures_performed: draft.procedures_performed,
        treatment_plan: draft.treatment_plan,
        follow_up: draft.follow_up,
        discharge_status: draft.discharge_status,
        additional_notes: draft.additional_notes
      };
      // Only send the link when it can be seen and changed, so saving never
      // drops a link this account can't see.
      if (requests !== null || request) body.appointment_id = draft.appointment_id ? Number(draft.appointment_id) : null;
      setSaving(true); setErr('');
      try { await props.onSubmit(body); }
      catch (ex) { setErr(ex.message || 'Save failed.'); setSaving(false); }
    }

    function field(label, input, opts) {
      opts = opts || {};
      return h('div', { className: 'portal-field', style: opts.half ? undefined : { gridColumn: '1 / -1' } },
        h('label', null, label),
        input,
        opts.help ? h('span', { className: 'portal-field-help' }, opts.help) : null
      );
    }
    function text(key, opts) {
      return h(MarkupTextarea, {
        value: draft[key],
        onChange: function (v) { setField(key, v); },
        markup: !(opts && opts.plain),
        inputRef: opts && opts.inputRef,
        placeholder: opts && opts.placeholder
      });
    }

    var requestOptions = (requests || []).filter(function (r) {
      return r.status !== 'cancelled' || Number(r.id) === Number(draft.appointment_id);
    });
    var medicValue = medicIsOther ? OTHER : (draft.attending_medic || '');

    return h('form', { onSubmit: handleSubmit },
      err ? h('div', { className: 'portal-flash error' }, err) : null,

      h('div', { className: 'portal-form-section' },
        h('h3', { className: 'portal-form-section-title' }, 'Visit'),
        h('div', { className: 'portal-field-row' },
          field('Date', h('input', {
            type: 'date', value: draft.real_date || '',
            onChange: function (e) { onDate(e.target.value); }
          }), { half: true, help: 'Sets the in-character date and where the visit sorts.' }),
          field('In-character date *', h('input', {
            type: 'text', value: draft.visit_date || '',
            placeholder: 'e.g. Third Sun of the Second Umbral Moon',
            onChange: function (e) { setField('visit_date', e.target.value); }
          }), { half: true, help: 'Filled from the date; edit it if you need to.' }),
          field('Attending medic', h('div', null,
            h('select', {
              className: 'portal-filter-select',
              value: medicValue,
              onChange: function (e) {
                if (e.target.value === OTHER) { setMedicIsOther(true); setField('attending_medic', ''); }
                else { setMedicIsOther(false); setField('attending_medic', e.target.value); }
              }
            },
              h('option', { value: '' }, '— Choose a medic —'),
              medics.map(function (n) { return h('option', { key: n, value: n }, n); }),
              h('option', { value: OTHER }, 'Other…')
            ),
            medicIsOther ? h('input', {
              type: 'text', value: draft.attending_medic || '', placeholder: 'Medic’s name',
              style: { marginTop: '0.5rem' },
              onChange: function (e) { setField('attending_medic', e.target.value); }
            }) : null
          ), { help: medicIsOther ? 'A name not on the staff roster can only be edited later by medics who can edit any visit.' : null }),
          requests !== null && (requestOptions.length || draft.appointment_id) ? field('Appointment request', h('select', {
            className: 'portal-filter-select',
            value: draft.appointment_id ? String(draft.appointment_id) : '',
            onChange: function (e) { setField('appointment_id', e.target.value ? Number(e.target.value) : null); }
          },
            h('option', { value: '' }, '— Not linked to a request —'),
            requestOptions.map(function (r) { return h('option', { key: r.id, value: String(r.id) }, requestLabel(r)); })
          ), { help: 'Linking marks the request seen and shows its intake with this visit.' }) : null
        )
      ),

      h('div', { className: 'portal-form-section' },
        h('h3', { className: 'portal-form-section-title' }, 'Patient Intake'),
        h('div', { className: 'portal-field-row' },
          field('Presenting Complaint', text('presenting_complaint'),
            { help: request ? 'From the request’s intake. Edit as needed.' : null }),
          field('Current Symptoms', text('current_symptoms', { plain: true })),
          field('Recent Exposures', text('recent_exposures', { plain: true }))
        )
      ),

      h('div', { className: 'portal-form-section' },
        h('h3', { className: 'portal-form-section-title' }, 'Treatment Report'),
        h('div', { className: 'portal-field-row' },
          field('Clinical Summary', text('clinical_summary')),
          field('Diagnosis', text('diagnosis')),
          field('Procedures Performed', h('div', null,
            h(QuickPicks, {
              mode: 'add', inputRef: proceduresRef,
              picks: M.PROCEDURES.map(function (p) { return [p, p]; }),
              value: draft.procedures_performed,
              onChange: function (v) { setField('procedures_performed', v); }
            }),
            text('procedures_performed', { plain: true, inputRef: proceduresRef })
          )),
          field('Treatment Plan', text('treatment_plan')),
          field('Follow-up', h('div', null,
            h(QuickPicks, {
              mode: 'replace', inputRef: followUpRef, picks: M.FOLLOW_UPS,
              value: draft.follow_up,
              onChange: function (v) { setField('follow_up', v); }
            }),
            text('follow_up', { plain: true, inputRef: followUpRef })
          )),
          field('Discharge Status', h('div', null,
            h(QuickPicks, {
              mode: 'replace', inputRef: dischargeRef, picks: M.DISCHARGES,
              value: draft.discharge_status,
              onChange: function (v) { setField('discharge_status', v); }
            }),
            text('discharge_status', { plain: true, inputRef: dischargeRef })
          )),
          field('Additional Notes', text('additional_notes'))
        )
      ),

      h('div', { className: 'portal-form-actions' },
        h('button', { type: 'submit', className: 'btn', disabled: saving },
          saving ? 'Saving…' : (props.submitLabel || (isNew ? 'Save treatment report' : 'Save'))),
        props.onCancel ? h('button', {
          type: 'button', className: 'btn is-quiet', onClick: props.onCancel, disabled: saving
        }, 'Cancel') : null
      )
    );
  }

  window.PVAdminTreatmentReport = TreatmentReportForm;
})();
