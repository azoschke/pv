// CSV export URLs
const patientsURL = "https://docs.google.com/spreadsheets/d/1lCdnYH1rMBAG9mh_9ncNZeFwMvJJebRk8K7f1BRHhxQ/export?format=csv&gid=0";
const visitsURL = "https://docs.google.com/spreadsheets/d/1FhxF4wHA3rUudwqN1ewn7c3xDJfnkbI0BZ-Sc83bPVY/export?format=csv&gid=0";

const patientList = document.getElementById("patientList");
const patientContent = document.getElementById("patientContent");

let patientsData = [];
let visitsData = [];

marked.use({ breaks: true });

// Load patients
Papa.parse(patientsURL, {
  download: true,
  header: true,
  skipEmptyLines: true,
  complete: function(results) {
    patientsData = results.data;
    buildPatientSidebar();
  },
  error: function(err) {
    console.error("Error loading patients CSV:", err);
  }
});

// Load visits
Papa.parse(visitsURL, {
  download: true,
  header: true,
  skipEmptyLines: true,
  complete: function(results) {
    visitsData = results.data;
  },
  error: function(err) {
    console.error("Error loading visits CSV:", err);
  }
});

// Build patient sidebar
function buildPatientSidebar() {
  patientsData.forEach(patient => {
    if (!patient.patient_id || !patient.patient_name) return;
    const li = document.createElement("li");
    const link = document.createElement("span");

    link.textContent = patient.patient_name;
    link.classList.add("patient-link");
    link.dataset.patientId = patient.patient_id;

    link.addEventListener("click", () => {
      document.querySelectorAll(".patient-link").forEach(el => el.classList.remove("active"));
      link.classList.add("active");
      renderPatient(patient.patient_id);
    });

    li.appendChild(link);
    patientList.appendChild(li);
  });
}

// Render a patient by ID
function renderPatient(patientId) {
  const patient = patientsData.find(p => p.patient_id === patientId);
  if (!patient) return;

  const generalFields = [
    { label: "Race", value: patient.race },
    { label: "Gender", value: patient.gender },
    { label: "Age", value: patient.age },
    { label: "Vanguard Position", value: patient.vanguard_position },
    { label: "Date Updated", value: patient.date_updated }
  ];

  const emergencyFields = [
    { label: "Name", value: patient.emergency_contact_name },
    { label: "Relationship", value: patient.emergency_contact_relationship },
    { label: "Contact Method", value: patient.emergency_contact_method }
  ];

  const conditionsFields = [
    { label: "Chronic Illness", value: patient.chronic_illness },
    { label: "Previous Injuries", value: patient.previous_injuries },
    { label: "Known Allergies", value: patient.known_allergies },
    { label: "Current Medications", value: patient.current_medications },
    { label: "Aetheric Abnormalities", value: patient.aetheric_abnormalities }
  ];

  // Filter visits for this patient
  const patientVisits = visitsData
    .map((v, i) => ({ ...v, index: i }))
    .filter(v => v.patient_id === patientId)
    .sort((a, b) => new Date(b.visit_date) - new Date(a.visit_date));

  // Build visit tabs
  let visitTabs = "";
  patientVisits.forEach((v, idx) => {
    visitTabs += `<div class="visit-tab" data-index="${v.index}">${v.visit_date}</div>`;
  });

  const visitsSectionHTML = patientVisits.length
    ? `
      <section class="section visits-section">
        <h2>Visits</h2>
        <div class="visit-tabs">${visitTabs}</div>
        <div class="visit-details-container">
          <div id="visitDetails"></div>
        </div>
      </section>
    `
    : ""; // hide section if no visits

  patientContent.innerHTML = `
    <header class="patient-header">
      <h1 class="patient-name">${patient.patient_name}</h1>
    </header>

    ${renderSection("General Information", generalFields)}
    ${renderSection("Emergency Contact", emergencyFields)}
    ${renderSection("Pre-existing Conditions", conditionsFields)}

    ${visitsSectionHTML}
  `;

  // Attach visit tab events
  document.querySelectorAll(".visit-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".visit-tab").forEach(el => el.classList.remove("active"));
      tab.classList.add("active");
      const visitIdx = parseInt(tab.dataset.index);
      showVisitDetails(visitsData[visitIdx]);
    });
  });

  // Auto-click first visit if exists
  if (patientVisits.length > 0) {
    document.querySelector(".visit-tab").click();
  }
}

// Render visit details, hide empty fields
function showVisitDetails(visit) {
  if (!visit) return;

  const fields = [
    { label: "Presenting Complaint", value: visit.presenting_complaint },
    { label: "Current Symptoms", value: visit.current_symptoms },
    { label: "Recent Exposures", value: visit.recent_exposures },
    { label: "Attending Medic", value: visit.attending_medic },
    { label: "Clinical Summary", value: visit.clinical_summary },
    { label: "Diagnosis", value: visit.diagnosis },
    { label: "Procedures Performed", value: visit.procedures_performed },
    { label: "Treatment Plan", value: visit.treatment_plan },
    { label: "Follow-up", value: visit.follow_up },
    { label: "Discharge Status", value: visit.discharge_status },
    { label: "Additional Notes", value: visit.additional_notes }
  ];

  const visibleFields = fields.filter(f => f.value && f.value.trim() !== "");

  if (visibleFields.length === 0) {
    document.getElementById("visitDetails").innerHTML = "<em>No details available for this visit.</em>";
    return;
  }

const html = visibleFields.map(f => `
    <div class="field">
      <span class="label">${f.label}</span>
      <div class="value">${marked.parse(f.value)}</div>
    </div>
  `).join("");
	
  document.getElementById("visitDetails").innerHTML = html;
}

// Render generic section
function renderSection(title, fieldsArray) {
  const visibleFields = fieldsArray.filter(f => f.value && f.value.trim() !== "");
  if (visibleFields.length === 0) return "";
  const fieldsHTML = visibleFields.map(f => `<div class="field"><span class="label">${f.label}</span><div class="value">${marked.parse(f.value)}</div></div>`).join("");
  return `<section class="section"><h2>${title}</h2>${fieldsHTML}</section>`;
}
