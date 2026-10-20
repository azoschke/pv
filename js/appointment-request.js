// ============================================================================
//  Appointment Request — a request and its patient intake, in six steps
//
//    1 Request                 character, medic, message for the secretary
//                              (required; the Discord post's reason)
//    2 About the Patient       race, gender, age, emergency contact
//    3 Reason for Visit        complaint, symptoms, exposures
//    4 Pre-Existing Conditions
//    5 Out of Character        as on the Patient Intake Form
//    6 Review & Sign           a summary, the symptoms and exposures combined
//                              into boxes to add detail to, the signature and
//                              date
//
//  The page needs a sign-in (Admin Settings → Pages); without one the visitor
//  is sent to sign in and brought back. GET /appointments/form gives the
//  characters (your own and your linked alts; everyone for medics, who can
//  request on someone's behalf) and, for the chosen character, the patient
//  record to pre-fill steps 2 and 4 from. The medic list is the published
//  Medical staff roster (GET /medical-staff). Progress is kept in this
//  browser as you go, per account, until the request is sent.
//
//  POST /appointments saves the request and its intake; the med worker posts
//  the Discord message (and the "submitted by" note when it is on someone
//  else's behalf). Requests are followed and cancelled in My Profile →
//  Applications.
// ============================================================================

(function () {
  var M = window.PVMedical;
  var STEPS = 6;
  var DRAFT_PREFIX = 'pv.appointment-draft.';
  var ANY = 'any';

  // The patient record fields steps 2 and 4 start from (field id → key).
  var PREFILL_FIELDS = [
    ['intake-race', 'race'],
    ['intake-gender', 'gender'],
    ['intake-age', 'age'],
    ['intake-emergency-name', 'emergency_contact_name'],
    ['intake-emergency-relationship', 'emergency_contact_relationship'],
    ['intake-emergency-contact', 'emergency_contact_method'],
    ['intake-chronic', 'chronic_illness'],
    ['intake-injuries', 'previous_injuries'],
    ['intake-allergies', 'known_allergies'],
    ['intake-medications', 'current_medications'],
    ['intake-aetheric', 'aetheric_abnormalities']
  ];

  var form = null;
  var step = 1;
  var draftKey = '';
  var saveTimer = null;
  // What each review box (symptoms, exposures) was last filled from: the
  // step 3 boxes and detail. It's refilled only when those change, so detail
  // added on the review step stays.
  var combinedFrom = { symptoms: null, exposures: null };
  // True while the characters and medics load: the form shows at once with
  // its fields disabled and nothing saved to the draft.
  var loading = false;

  function $(id) { return document.getElementById(id); }

  // The formatting toolbar's buttons (onclick="insertMarkup(this, 'bold')").
  window.insertMarkup = function (btn, type) {
    var group = btn.closest('.form-group');
    var textarea = group && group.querySelector('textarea');
    if (!textarea) return;
    var out = M.applyMarkup(textarea.value, textarea.selectionStart, textarea.selectionEnd, type);
    textarea.value = out.text;
    textarea.setSelectionRange(out.start, out.end);
    textarea.focus();
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  };

  // ── Reading the form ──────────────────────────────────────────────────────
  function checked(name) {
    return Array.prototype.map.call(form.querySelectorAll('input[name="' + name + '"]:checked'), function (cb) {
      return cb.value;
    });
  }
  function radio(name) {
    var el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : '';
  }
  function val(id) {
    var el = $(id);
    return el ? String(el.value || '').trim() : '';
  }
  function characterTarget() {
    var v = $('appt-character').value;
    if (!v) return null;
    return v.charAt(0) === 'm' ? { member_id: Number(v.slice(2)) } : { patient_id: Number(v.slice(2)) };
  }
  function selectedText(id) {
    var el = $(id);
    var opt = el && el.options[el.selectedIndex];
    return opt && el.value ? opt.getAttribute('data-name') || opt.textContent : '';
  }

  // ── Draft ─────────────────────────────────────────────────────────────────
  function snapshot() {
    var fields = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name) return;
      if (el.type === 'checkbox') {
        fields[el.name] = fields[el.name] || [];
        if (el.checked) fields[el.name].push(el.value);
      } else if (el.type === 'radio') {
        if (el.checked) fields[el.name] = el.value;
      } else {
        fields[el.name] = el.value;
      }
    });
    return { step: step, fields: fields, combinedFrom: combinedFrom };
  }
  function saveDraftSoon() {
    if (loading) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(draftKey, JSON.stringify(snapshot())); } catch (_) {}
    }, 300);
  }
  function clearDraft() {
    clearTimeout(saveTimer);
    try { localStorage.removeItem(draftKey); } catch (_) {}
  }
  function ensureOption(select, value) {
    if (!value || Array.prototype.some.call(select.options, function (o) { return o.value === value; })) return;
    var opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    select.appendChild(opt);
  }
  // The saved draft's step, or 0 when there is none (read before the form's
  // options load, so the page opens on the right step).
  function draftStep() {
    try {
      var draft = JSON.parse(localStorage.getItem(draftKey) || 'null');
      return draft && draft.fields ? Math.min(Math.max(Number(draft.step) || 1, 1), STEPS) : 0;
    } catch (_) { return 0; }
  }

  // Restores a saved draft; returns its step, or 0 when there is none.
  function restoreDraft() {
    var draft = null;
    try { draft = JSON.parse(localStorage.getItem(draftKey) || 'null'); } catch (_) {}
    if (!draft || !draft.fields) return 0;
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || !(el.name in draft.fields)) return;
      var v = draft.fields[el.name];
      if (el.type === 'checkbox') el.checked = Array.isArray(v) && v.indexOf(el.value) !== -1;
      else if (el.type === 'radio') el.checked = v === el.value;
      else {
        if (el.tagName === 'SELECT' && el.id !== 'appt-character' && el.id !== 'appt-medic') ensureOption(el, v);
        el.value = v;
      }
    });
    combinedFrom = draft.combinedFrom || combinedFrom;
    $('appt-draft-note').hidden = false;
    return Math.min(Math.max(Number(draft.step) || 1, 1), STEPS);
  }

  // ── Characters, medics, pre-fill ──────────────────────────────────────────
  function fillCharacters(data) {
    var select = $('appt-character');
    select.innerHTML = '';
    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a character...';
    select.appendChild(placeholder);

    function option(c) {
      var opt = document.createElement('option');
      opt.value = c.member_id ? 'm:' + c.member_id : 'p:' + c.patient_id;
      opt.setAttribute('data-name', c.name);
      opt.textContent = c.name + (c.open ? ' — has an open request' : '');
      opt.disabled = !!c.open;
      return opt;
    }
    var own = data.characters.filter(function (c) { return c.own; });
    var others = data.characters.filter(function (c) { return !c.own; });
    if (data.can_submit_for_others && own.length && others.length) {
      [['Your characters', own], ['Everyone else', others]].forEach(function (g) {
        var group = document.createElement('optgroup');
        group.label = g[0];
        g[1].forEach(function (c) { group.appendChild(option(c)); });
        select.appendChild(group);
      });
    } else {
      data.characters.forEach(function (c) { select.appendChild(option(c)); });
    }
    // A single available character of your own is chosen for you.
    var available = own.filter(function (c) { return !c.open; });
    if (available.length === 1 && !data.can_submit_for_others) select.value = option(available[0]).value;
  }

  function fillMedics(staff, fallback) {
    var select = $('appt-medic');
    select.innerHTML = '';
    function add(value, label, name) {
      var opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      if (name) opt.setAttribute('data-name', name);
      select.appendChild(opt);
    }
    add('', 'Select a medic...');
    add(ANY, 'Any Available Medic', 'Any Available Medic');
    var list = staff && staff.length ? staff : (fallback || []);
    list.forEach(function (m) {
      var positions = Array.isArray(m.positions) && m.positions.length ? ' — ' + m.positions.join(', ') : '';
      add(String(m.member_id), m.name + positions, m.name);
    });
  }

  function showPatientName() {
    $('appt-patient-name').value = selectedText('appt-character');
  }

  async function prefillFromRecord() {
    var target = characterTarget();
    if (!target) return;
    var q = target.member_id ? 'member_id=' + target.member_id : 'patient_id=' + target.patient_id;
    var res;
    try { res = await PVAdminAPI.request('GET', '/appointments/form?' + q, undefined, true); }
    catch (_) { return; }
    var p = (res && res.prefill) || {};
    PREFILL_FIELDS.forEach(function (f) {
      var el = $(f[0]);
      var v = p[f[1]] || '';
      if (el.tagName === 'SELECT') ensureOption(el, v);
      el.value = v;
    });
    saveDraftSoon();
  }

  // ── Steps ─────────────────────────────────────────────────────────────────
  function showError(text) {
    $('error-text').textContent = text;
    $('error-message').style.display = 'block';
  }
  function hideError() { $('error-message').style.display = 'none'; }

  function stepOneComplete(report) {
    var missing = !$('appt-character').value ? 'Choose who the appointment is for.'
      : !$('appt-medic').value ? 'Choose a medic, or Any Available Medic.'
      : !val('appt-reason') ? 'Add a message for the secretary.'
      : '';
    if (missing && report) showError(missing);
    return !missing;
  }

  function showStep(n) {
    step = n;
    hideError();
    Array.prototype.forEach.call(form.querySelectorAll('.form-step'), function (s) {
      s.hidden = Number(s.getAttribute('data-step')) !== n;
    });
    Array.prototype.forEach.call(document.querySelectorAll('.form-progress-step'), function (b) {
      var k = Number(b.getAttribute('data-step'));
      b.classList.toggle('is-current', k === n);
      b.classList.toggle('is-done', k < n);
      if (k === n) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    $('appt-back').hidden = n === 1;
    $('appt-next').hidden = n === STEPS;
    $('submit-btn').hidden = n !== STEPS;
    if (loading) return;
    if (n === 2) showPatientName();
    if (n === STEPS) buildReview();
    var top = $('appt-progress');
    if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
    saveDraftSoon();
  }

  function goTo(n) {
    if (n === step) return;
    if (n > 1 && !stepOneComplete(true)) { if (step !== 1) showStep(1); return; }
    showStep(n);
  }

  // ── Review ────────────────────────────────────────────────────────────────
  function syncCombined() {
    [['symptoms', 'intake-symptoms-detail'], ['exposures', 'intake-exposures-detail']].forEach(function (c) {
      var source = M.combineChecked(checked(c[0]), val(c[1]));
      if (source === combinedFrom[c[0]]) return;
      $('review-' + c[0]).value = source;
      combinedFrom[c[0]] = source;
    });
  }

  function buildReview() {
    syncCombined();

    var groups = [
      ['Request', [
        ['Character', selectedText('appt-character')],
        ['Medic', selectedText('appt-medic')],
        ['Message for the Secretary', val('appt-reason')]
      ]],
      ['Patient Information', [
        ['Race', val('intake-race')], ['Gender', val('intake-gender')], ['Age', val('intake-age')]
      ]],
      ['Emergency Contact', [
        ['Name', val('intake-emergency-name')],
        ['Relationship', val('intake-emergency-relationship')],
        ['Contact Method', val('intake-emergency-contact')]
      ]],
      ['Reason for Visit', [['Presenting Complaint/Injury', val('intake-complaint')]]],
      ['Pre-Existing Conditions', [
        ['Chronic Illness', val('intake-chronic')],
        ['Previous Injuries', val('intake-injuries')],
        ['Known Allergies', val('intake-allergies')],
        ['Current Medications', val('intake-medications')],
        ['Aetheric Abnormalities', val('intake-aetheric')]
      ]],
      ['Out of Character', [
        ['Severity Assessment', M.oocLabel('severity', radio('severity'))],
        ['RP Goals and Timeline', M.oocLabel('rp_timeline', radio('rpTimeline'))],
        ['Conceptual Development', M.oocLabel('concept_dev', radio('conceptDev'))],
        ['Desired Outcomes', val('intake-desired-outcomes')],
        ['Specific Plot Hooks/Story Elements', val('intake-plot-hooks')],
        ['Triggers to Avoid', val('intake-triggers')]
      ]]
    ];
    var box = $('appt-review');
    box.innerHTML = '';
    groups.forEach(function (g, i) {
      var rows = g[1].filter(function (r) { return r[1]; });
      if (!rows.length) return;
      var head = document.createElement('div');
      head.className = 'appt-review-head';
      var title = document.createElement('h4');
      title.className = 'subsection-heading';
      title.textContent = g[0];
      head.appendChild(title);
      // Each group's step: Request 1, patient info and contact 2, reason 3,
      // conditions 4, out of character 5.
      var target = [1, 2, 2, 3, 4, 5][i];
      var edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'btn is-plain';
      edit.textContent = 'Edit';
      edit.addEventListener('click', function () { goTo(target); });
      head.appendChild(edit);
      box.appendChild(head);
      var list = document.createElement('dl');
      list.className = 'appt-review-list';
      rows.forEach(function (r) {
        var dt = document.createElement('dt');
        dt.textContent = r[0];
        var dd = document.createElement('dd');
        dd.textContent = r[1];
        list.appendChild(dt);
        list.appendChild(dd);
      });
      box.appendChild(list);
    });
  }

  function showEorzeanDate() {
    var display = $('intake-eorzean-date');
    var text = M.eorzeanDate($('intake-patient-date').value);
    display.textContent = text;
    display.style.display = text ? 'block' : 'none';
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function submit(event) {
    event.preventDefault();
    if (step !== STEPS) return;
    if (!stepOneComplete(true)) return;
    var session = PVAdminAPI.getSession();
    if (!session) { PVAdminAPI.redirectToLogin(); return; }

    var medic = $('appt-medic').value;
    var signedDate = $('intake-patient-date').value;
    var payload = Object.assign({}, characterTarget(), {
      medic_id: medic === ANY ? null : Number(medic),
      reason: val('appt-reason'),
      race: val('intake-race'),
      gender: val('intake-gender'),
      age: val('intake-age'),
      emergency_contact_name: val('intake-emergency-name'),
      emergency_contact_relationship: val('intake-emergency-relationship'),
      emergency_contact_method: val('intake-emergency-contact'),
      presenting_complaint: val('intake-complaint'),
      current_symptoms: val('review-symptoms'),
      recent_exposures: val('review-exposures'),
      chronic_illness: val('intake-chronic'),
      previous_injuries: val('intake-injuries'),
      known_allergies: val('intake-allergies'),
      current_medications: val('intake-medications'),
      aetheric_abnormalities: val('intake-aetheric'),
      patient_signature: val('intake-patient-signature'),
      signed_date: signedDate,
      signed_ic_date: M.eorzeanDate(signedDate),
      severity: radio('severity'),
      rp_timeline: radio('rpTimeline'),
      concept_dev: radio('conceptDev'),
      desired_outcomes: val('intake-desired-outcomes'),
      plot_hooks: val('intake-plot-hooks'),
      triggers: val('intake-triggers')
    });

    var btn = $('submit-btn');
    btn.disabled = true;
    btn.textContent = 'Sending...';
    hideError();
    try {
      await PVAdminAPI.request('POST', '/appointments', payload, true);
      clearDraft();
      $('form-wrapper').style.display = 'none';
      $('confirmation-wrapper').style.display = 'block';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      showError(e && e.message ? e.message : 'Could not send the request. Please try again.');
      btn.disabled = false;
      btn.textContent = 'Submit Request';
    }
  }

  // ── Start ─────────────────────────────────────────────────────────────────
  function setLoading(on) {
    loading = on;
    Array.prototype.forEach.call(form.elements, function (el) { el.disabled = on; });
    Array.prototype.forEach.call(document.querySelectorAll('.form-progress-step'), function (b) { b.disabled = on; });
    form.setAttribute('aria-busy', on ? 'true' : 'false');
    if (on) {
      ['appt-character', 'appt-medic'].forEach(function (id) {
        $(id).innerHTML = '<option value="">Loading...</option>';
      });
    }
  }

  async function init() {
    var session = (window.PVAdminAPI && PVAdminAPI.getSession()) || null;
    if (!session) { PVAdminAPI.redirectToLogin(); return; }
    form = $('appointmentForm');
    draftKey = DRAFT_PREFIX + String(session.username || '').toLowerCase();

    // The form shows straight away, on the draft's step, until its options
    // arrive.
    setLoading(true);
    showStep(draftStep() || 1);
    $('form-wrapper').style.display = 'block';

    var data, staff;
    try {
      var results = await Promise.all([
        PVAdminAPI.request('GET', '/appointments/form', undefined, true),
        PVAdminAPI.request('GET', '/medical-staff', undefined, false).catch(function () { return []; })
      ]);
      data = results[0];
      staff = results[1];
    } catch (e) {
      // The error shows in place of the steps (it sits inside the form).
      Array.prototype.forEach.call(form.querySelectorAll('.form-step'), function (sec) { sec.hidden = true; });
      form.querySelector('.appt-actions').style.display = 'none';
      $('appt-progress').hidden = true;
      showError(e && e.message ? e.message : 'Could not load the form. Please try again.');
      return;
    }
    if (!data.characters || !data.characters.length) {
      $('form-wrapper').style.display = 'none';
      $('no-character-wrapper').style.display = 'block';
      return;
    }

    setLoading(false);
    fillCharacters(data);
    fillMedics(staff, data.medics);

    var restoredStep = restoreDraft();
    // A drafted character that has since been given an open request can't be
    // chosen again.
    var chosen = $('appt-character').selectedOptions[0];
    if (chosen && chosen.disabled) $('appt-character').value = '';
    if (restoredStep > 1 && !stepOneComplete(false)) restoredStep = 1;
    if (!$('intake-patient-date').value) $('intake-patient-date').value = M.todayISO();
    showEorzeanDate();

    form.addEventListener('input', saveDraftSoon);
    form.addEventListener('change', saveDraftSoon);
    form.addEventListener('submit', submit);
    $('appt-character').addEventListener('change', function () { showPatientName(); prefillFromRecord(); });
    $('intake-patient-date').addEventListener('change', showEorzeanDate);
    $('appt-edit-reason').addEventListener('click', function () { goTo(3); });
    $('appt-next').addEventListener('click', function () { goTo(step + 1); });
    $('appt-back').addEventListener('click', function () { showStep(Math.max(1, step - 1)); });
    Array.prototype.forEach.call(document.querySelectorAll('.form-progress-step'), function (b) {
      b.addEventListener('click', function () { goTo(Number(b.getAttribute('data-step'))); });
    });
    $('appt-start-over').addEventListener('click', function () {
      if (!confirm('Clear this draft and start over?')) return;
      clearDraft();
      window.location.reload();
    });

    // A fresh form (or one chosen for you) starts from the patient record.
    if (!restoredStep && $('appt-character').value) prefillFromRecord();
    showStep(restoredStep || 1);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
