const DISCORD_WEBHOOK_URL = 'https://pv-discord-proxy.chlorinatorgreen.workers.dev/';
const MEDICAL_ROLE_ID = '1283058454373597186';

// Individual medic Discord IDs — fill in placeholders as they are confirmed
const MEDIC_IDS = {
    'Fiora Acaeus':      '477696368325033984',
    "V'ika Tia":         '',
    "Astares De'Ruahn":  '',
    'Addison Tyrrell':   '',
    'Lixiss Valra':            '',
    'Orlando Oleander':  '',
    'Naoji Sugitani':    '',
};

async function submitAppointmentRequest(event) {
    event.preventDefault();

    const name = document.getElementById('appt-name').value.trim();
    const reason = document.getElementById('appt-reason').value.trim();
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
                url: 'https://crafting-tools.github.io/pv/assets/pdf-emblem-web.png'
            },
            fields: [
                { name: 'Patient Name', value: name, inline: true },
                { name: 'Requested Medic', value: medic, inline: true },
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
