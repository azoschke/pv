// ============================================================================
//  PVMedical — what the medical pages share
//
//  The Appointment Request form, the Appointment Requests and Patient Records
//  sections of the portal, and the public patient records page all use:
//    - the Eorzean calendar: a real date → "Third Sun of the Second Umbral
//      Moon" (the first day on split days)
//    - the intake's choices (race, gender, symptoms, exposures) and its Out of
//      Character choices, stored by value and shown by their full label
//    - the treatment report's quick picks (procedures, follow-up, discharge),
//      each of which fills an editable text box
//    - the intake's fields with their labels, for showing a saved intake
//    - the formatting toolbar's edits (bold, italic, heading, list)
//
//  Plain script, no dependencies: <script src="js/medical-shared.js"></script>
// ============================================================================

(function (global) {
  // ── Eorzean calendar ──────────────────────────────────────────────────────
  // Each real month is a moon; the real days listed in SPLIT_DAYS cover two
  // Eorzean days (Before / After Noon), which is how 28–31 real days make 32
  // suns.
  var MOONS = [
    'First Astral Moon', 'First Umbral Moon',
    'Second Astral Moon', 'Second Umbral Moon',
    'Third Astral Moon', 'Third Umbral Moon',
    'Fourth Astral Moon', 'Fourth Umbral Moon',
    'Fifth Astral Moon', 'Fifth Umbral Moon',
    'Sixth Astral Moon', 'Sixth Umbral Moon'
  ];
  var SPLIT_DAYS = {
    1: [28], 2: [7, 14, 21], 3: [28], 4: [7, 28], 5: [29], 6: [7, 28],
    7: [28], 8: [28], 9: [7, 28], 10: [28], 11: [7, 28], 12: [28]
  };

  var ONES = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth',
    'Tenth', 'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth', 'Sixteenth', 'Seventeenth',
    'Eighteenth', 'Nineteenth'];
  var TENS_ORDINAL = { 20: 'Twentieth', 30: 'Thirtieth' };
  var TENS = { 20: 'Twenty', 30: 'Thirty' };

  // 1 → "First", 23 → "Twenty-Third", 32 → "Thirty-Second".
  function ordinalWord(n) {
    if (n < 20) return ONES[n] || String(n);
    var tens = Math.floor(n / 10) * 10;
    var rest = n % 10;
    return rest ? TENS[tens] + '-' + ONES[rest] : TENS_ORDINAL[tens];
  }

  // "YYYY-MM-DD" → { sun, moon } (the first Eorzean day on a split day), or
  // null for an empty or unreadable date.
  function toEorzean(dateString) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateString || ''));
    if (!m) return null;
    var month = Number(m[2]);
    var day = Number(m[3]);
    if (month < 1 || month > 12 || day < 1) return null;
    var sun = day;
    (SPLIT_DAYS[month] || []).forEach(function (split) { if (day > split) sun++; });
    if (sun < 1 || sun > 32) return null;
    return { sun: sun, moon: MOONS[month - 1] };
  }

  // "YYYY-MM-DD" → "Third Sun of the Second Umbral Moon", or ''.
  function eorzeanDate(dateString) {
    var e = toEorzean(dateString);
    return e ? ordinalWord(e.sun) + ' Sun of the ' + e.moon : '';
  }

  // Today as "YYYY-MM-DD" in the viewer's own time zone.
  function todayISO() {
    var d = new Date();
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  // ── Intake choices ────────────────────────────────────────────────────────
  var RACES = ['Hyur', "Miqo'te", 'Elezen', 'Roegadyn', 'Lalafell', 'Au Ra', 'Viera', 'Hrothgar', 'Other'];
  var GENDERS = ['Male', 'Female', 'Non-binary', 'Other', 'Prefer not to say'];
  // No "Other": each list has its own box for anything else.
  var SYMPTOMS = ['Pain', 'Fever/Chills', 'Nausea/Vomiting', 'Dizziness/Disorientation', 'Bleeding',
    'Difficulty Breathing', 'Loss of Consciousness'];
  var EXPOSURES = ['Combat', 'Voidsent Encounter', 'Primal Encounter', 'Poisonous Substances',
    'Extreme Temperatures', 'Overaspected Crystals'];

  // Ticked boxes and their detail as one line, the way the intake has always
  // written them: "Pain, Bleeding - left forearm".
  function combineChecked(checked, detail) {
    var list = (checked || []).join(', ');
    var more = String(detail || '').trim();
    if (list && more) return list + ' - ' + more;
    return list || more;
  }

  // The Out of Character choices: stored value → the label the form shows.
  var OOC_CHOICES = {
    severity: [
      ['Minor', 'Minor (surface wounds, common illness, routine check)'],
      ['Moderate', 'Moderate (significant injury, uncommon illness, requires monitoring)'],
      ['Severe', 'Severe (life-threatening, complex condition, intensive care required)'],
      ['Critical', 'Critical (immediate intervention required, high mortality risk)'],
      ['Not Sure/Other', 'Not Sure/Other']
    ],
    rp_timeline: [
      ['Short-term', 'Short-term: Single session resolution, full recovery expected'],
      ['Medium-term', 'Medium-term: 2-4 sessions, recovery with possible complications'],
      ['Long-term', 'Long-term: Ongoing condition requiring extended care and follow-up'],
      ['Permanent', 'Permanent: Condition will result in lasting effects']
    ],
    concept_dev: [
      ['Collaborative', 'I need help exploring this RP idea and would like collaborative assistance'],
      ['Specific', "I know specifically what the issue is and how I'd like this RP to play out"]
    ]
  };
  function oocLabel(field, value) {
    var list = OOC_CHOICES[field] || [];
    for (var i = 0; i < list.length; i++) if (list[i][0] === value) return list[i][1];
    return value || '';
  }

  // A saved intake's fields, in the form's order, with their labels.
  var INTAKE_SECTIONS = [
    { title: 'Patient Information', fields: [
      ['race', 'Race'], ['gender', 'Gender'], ['age', 'Age']
    ] },
    { title: 'Emergency Contact', fields: [
      ['emergency_contact_name', 'Name'],
      ['emergency_contact_relationship', 'Relationship'],
      ['emergency_contact_method', 'Contact Method']
    ] },
    { title: 'Reason for Visit', fields: [
      ['presenting_complaint', 'Presenting Complaint/Injury'],
      ['current_symptoms', 'Current Symptoms'],
      ['recent_exposures', 'Recent Exposures']
    ] },
    { title: 'Pre-Existing Conditions', fields: [
      ['chronic_illness', 'Chronic Illness'],
      ['previous_injuries', 'Previous Injuries'],
      ['known_allergies', 'Known Allergies'],
      ['current_medications', 'Current Medications'],
      ['aetheric_abnormalities', 'Aetheric Abnormalities']
    ] },
    { title: 'Authorization for Treatment', fields: [
      ['patient_signature', 'Signature'], ['signed_ic_date', 'Date']
    ] }
  ];
  var OOC_FIELDS = [
    ['severity', 'Severity Assessment'],
    ['rp_timeline', 'RP Goals and Timeline'],
    ['concept_dev', 'Conceptual Development'],
    ['desired_outcomes', 'Desired Outcomes'],
    ['plot_hooks', 'Specific Plot Hooks/Story Elements'],
    ['triggers', 'Triggers to Avoid']
  ];
  // An OOC field's value as shown: its full label for a choice, else as typed.
  function oocDisplay(field, value) {
    return OOC_CHOICES[field] ? oocLabel(field, value) : (value || '');
  }

  // ── Treatment report quick picks ──────────────────────────────────────────
  // Procedures add to the box; follow-up and discharge replace it. Each phrase
  // is the wording the treatment report form has always printed, left
  // editable (a trailing ": " is where the medic carries on typing).
  var PROCEDURES = ['Aetheric scan', 'Skeletal imaging', 'Laboratory analysis'];
  var FOLLOW_UPS = [
    ['None', 'No follow-up required - Patient cleared for discharge'],
    ['Follow-up', 'Follow-up required - Next appointment: '],
    ['Ongoing', 'Ongoing monitoring required - Frequency: '],
    ['Referred', 'Referred to specialist/external care']
  ];
  var DISCHARGES = [
    ['Full duty', 'Discharged - Full duty cleared'],
    ['Light duty', 'Discharged - Light duty only (Restrictions: )'],
    ['Medical leave', 'Discharged - Medical leave recommended (Duration: )'],
    ['Admitted', 'Admitted for continued observation/treatment'],
    ['Transferred', 'Transferred to external facility'],
    ['Under observation', 'Under observation'],
    ['Discharged', 'Discharged']
  ];

  // ── Formatting toolbar ────────────────────────────────────────────────────
  // Bold / italic wrap the selection; heading / list prefix its lines (the
  // toolbar on the medical forms). → { text, start, end }, the new value and
  // the selection to put back.
  function applyMarkup(text, start, end, type) {
    var selected = text.substring(start, end);
    if (type === 'bold' || type === 'italic') {
      var wrapper = type === 'bold' ? '**' : '*';
      var insert = selected || (type === 'bold' ? 'bold text' : 'italic text');
      return {
        text: text.substring(0, start) + wrapper + insert + wrapper + text.substring(end),
        start: start + wrapper.length,
        end: start + wrapper.length + insert.length
      };
    }
    var prefix = type === 'heading' ? '## ' : '- ';
    if (selected) {
      var prefixed = selected.split('\n').map(function (line) {
        return line.indexOf(prefix) === 0 ? line : prefix + line;
      }).join('\n');
      return { text: text.substring(0, start) + prefixed + text.substring(end), start: start, end: start + prefixed.length };
    }
    var placeholder = type === 'heading' ? 'Heading' : 'List item';
    var lineStart = text.lastIndexOf('\n', start - 1) + 1;
    if (text.substring(lineStart, start).trim() === '') {
      return {
        text: text.substring(0, lineStart) + prefix + placeholder + text.substring(start),
        start: lineStart + prefix.length,
        end: lineStart + prefix.length + placeholder.length
      };
    }
    return {
      text: text.substring(0, start) + '\n' + prefix + placeholder + text.substring(end),
      start: start + 1 + prefix.length,
      end: start + 1 + prefix.length + placeholder.length
    };
  }

  global.PVMedical = {
    eorzeanDate: eorzeanDate,
    toEorzean: toEorzean,
    ordinalWord: ordinalWord,
    todayISO: todayISO,
    RACES: RACES,
    GENDERS: GENDERS,
    SYMPTOMS: SYMPTOMS,
    EXPOSURES: EXPOSURES,
    combineChecked: combineChecked,
    OOC_CHOICES: OOC_CHOICES,
    oocLabel: oocLabel,
    oocDisplay: oocDisplay,
    INTAKE_SECTIONS: INTAKE_SECTIONS,
    OOC_FIELDS: OOC_FIELDS,
    PROCEDURES: PROCEDURES,
    FOLLOW_UPS: FOLLOW_UPS,
    DISCHARGES: DISCHARGES,
    applyMarkup: applyMarkup
  };
})(window);
