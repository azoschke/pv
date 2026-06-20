const DISCORD_WEBHOOK_URL = 'https://pv-discord-proxy-secure.chlorinatorgreen.workers.dev/';
const MEDICAL_ROLE_ID = '1283058454373597186';
const MEDIC_IDS = {
    'Fiora Acaeus':      '477696368325033984',
    "Astares De'Ruahn":  '194881867776786451',
    'Addison Tyrrell':   '271478962964791298',
    'Lixiss Valra':      '505184303198765060',
    "M'iah Reid":        '236311329550368771',
    'Nikita Lynkasch':   '224310874180026378',
    'Yumiko Moonstone':  '400723333517410315',
    'Camily Mily':       '593575045255659520',
    'Tsukiko Fujiwara':   '215649054120476674',
    'Tasha Theja':       '1472340765702225994'
};

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
            btn.href = '/pv/admin/login.html?redirect=' +
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
        window.location.href = '/pv/admin/login.html?redirect=' +
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

    // Only 'Any Available Medic' pings the Medical role; specific medics ping their user if their ID is known
    let pingContent = '';
    if (medic === 'Any Available Medic') {
        pingContent = `<@&${MEDICAL_ROLE_ID}>`;
    } else if (MEDIC_IDS[medic]) {
        pingContent = `<@${MEDIC_IDS[medic]}>`;
    }

    const payload = {
        content: pingContent,
        embeds: [{
            title: 'New Appointment Request',
            color: 0xa54d44,
            thumbnail: {
                url: 'https://phoenixvanguard-tools.com/assets/pdf-emblem-web.png'
            },
            fields: [
                { name: 'Name', value: name, inline: false },
                { name: 'Requested Medic', value: medic, inline: false },
                { name: 'Reason for Appointment', value: reason, inline: false }
            ],
            footer: { text: 'Phoenix Vanguard Medical Division' },
            timestamp: new Date().toISOString()
        }]
    };

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
