// The proxy worker builds the Discord message (embed + medic/role ping) from
// the form fields, so the page only sends { name, medic, reason }. When the
// medic list changes, update the <select> options and the worker's MEDIC_IDS.
const DISCORD_WEBHOOK_URL = 'https://pv-discord-proxy-secure.chlorinatorgreen.workers.dev/';

// ── Auth gate ───────────────────────────────────────────────────────────────
// Requests can only be sent by a logged-in account. When signed out we hide the
// form and show a "log in to continue" panel that round-trips through the admin
// login and returns here (same pattern as the job board's apply button). When
// signed in we prefill the Name field from the account's display name and lock
// it so the request always matches the logged-in identity.
function initAppointmentGate() {
    const session = (window.PVAdminAPI && PVAdminAPI.getSession()) || null;
    const formWrapper = document.getElementById('form-wrapper');
    const loginGate = document.getElementById('login-gate');

    if (!session) {
        if (formWrapper) formWrapper.style.display = 'none';
        if (loginGate) loginGate.style.display = 'block';
        const btn = document.getElementById('login-redirect-btn');
        if (btn) {
            btn.href = 'login.html?redirect=' +
                encodeURIComponent(window.location.pathname);
        }
        return;
    }

    if (loginGate) loginGate.style.display = 'none';
    if (formWrapper) formWrapper.style.display = 'block';

    const accountName = (session.display_name || session.username || '').trim();
    const nameInput = document.getElementById('appt-name');
    if (nameInput && accountName) {
        nameInput.value = accountName;
        nameInput.readOnly = true;
    }
    const note = document.getElementById('appt-name-note');
    if (note && accountName) {
        note.textContent = 'Requesting as ' + accountName + '.';
    }
}

document.addEventListener('DOMContentLoaded', initAppointmentGate);

async function submitAppointmentRequest(event) {
    event.preventDefault();

    // Reassert the session at submit time — a token can expire while the form
    // sits open. If it has, bounce back through login rather than sending.
    const session = (window.PVAdminAPI && PVAdminAPI.getSession()) || null;
    if (!session) {
        window.location.href = 'login.html?redirect=' +
            encodeURIComponent(window.location.pathname);
        return;
    }

    const name = document.getElementById('appt-name').value.trim();
    // Discord caps an embed field value at 1024 chars; clamp so a long reason
    // can't make the webhook 400 (which would surface as "Discord Error").
    const reason = document.getElementById('appt-reason').value.trim().slice(0, 1024);
    const medic = document.getElementById('appt-medic').value;

    const submitBtn = document.getElementById('submit-btn');
    const errorDiv = document.getElementById('error-message');
    const errorText = document.getElementById('error-text');

    errorDiv.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="material-icons">hourglass_empty</span> Sending...';

    const payload = { name: name, medic: medic, reason: reason };

    try {
        const response = await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            document.getElementById('form-wrapper').style.display = 'none';
            document.getElementById('confirmation-wrapper').style.display = 'block';
        } else {
            errorText.textContent = 'Something went wrong. Please try again.';
            errorDiv.style.display = 'block';
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span class="material-icons">send</span> Submit Request';
        }
    } catch (err) {
        errorText.textContent = 'Could not connect. Please check your connection and try again.';
        errorDiv.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span class="material-icons">send</span> Submit Request';
    }
}
