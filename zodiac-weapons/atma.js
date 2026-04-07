// ===== DATA =====
const ATMA_MAX = 10; // max needed (1 per job * 10 ARR jobs)

const ATMA_LIST = [
  { id: 'lion',        name: 'Atma of the Lion',         zone: 'Outer La Noscea' },
  { id: 'waterbearer', name: 'Atma of the Water-bearer', zone: 'Upper La Noscea' },
  { id: 'ram',         name: 'Atma of the Ram',          zone: 'Middle La Noscea' },
  { id: 'crab',        name: 'Atma of the Crab',         zone: 'Western La Noscea' },
  { id: 'fish',        name: 'Atma of the Fish',         zone: 'Lower La Noscea' },
  { id: 'bull',        name: 'Atma of the Bull',         zone: 'Eastern Thanalan' },
  { id: 'scales',      name: 'Atma of the Scales',       zone: 'Central Thanalan' },
  { id: 'twins',       name: 'Atma of the Twins',        zone: 'Western Thanalan' },
  { id: 'scorpion',    name: 'Atma of the Scorpion',     zone: 'Southern Thanalan' },
  { id: 'archer',      name: 'Atma of the Archer',       zone: 'North Shroud' },
  { id: 'goat',        name: 'Atma of the Goat',         zone: 'East Shroud' },
  { id: 'maiden',      name: 'Atma of the Maiden',       zone: 'Central Shroud' }
];

// ===== STORAGE =====
const LS_THEME = 'trialsOfBraves_theme';
const LS_ATMA  = 'trialsOfBraves_atmaCounts';

function loadSetting(key, fallback) {
  return localStorage.getItem(key) || fallback;
}
function saveSetting(key, val) {
  localStorage.setItem(key, val);
}
function loadAtma() {
  try {
    return JSON.parse(localStorage.getItem(LS_ATMA)) || {};
  } catch { return {}; }
}
function saveAtma(counts) {
  localStorage.setItem(LS_ATMA, JSON.stringify(counts));
}

// ===== RENDERING =====
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function clampCount(n) {
  if (isNaN(n) || n < 0) return 0;
  if (n > ATMA_MAX) return ATMA_MAX;
  return Math.floor(n);
}

function renderAtma() {
  const counts = loadAtma();
  const container = document.getElementById('atma-container');

  let totalHave = 0;
  let typesComplete = 0;

  let html = '<table class="task-table atma-table"><thead><tr>' +
    '<th>#</th><th>Atma</th><th>FATE Zone</th><th class="td-count-header">Count (0&ndash;' + ATMA_MAX + ')</th>' +
    '</tr></thead><tbody>';

  ATMA_LIST.forEach((a, i) => {
    const raw = counts[a.id] || 0;
    const count = clampCount(raw);
    totalHave += count;
    if (count >= ATMA_MAX) typesComplete++;

    const rowCls = count >= ATMA_MAX ? 'checked' : '';
    html += '<tr class="' + rowCls + '">' +
      '<td class="td-num">' + (i + 1) + '</td>' +
      '<td>' + escapeHtml(a.name) + '</td>' +
      '<td>' + escapeHtml(a.zone) + '</td>' +
      '<td class="td-count">' +
        '<div class="count-control">' +
          '<button type="button" class="count-btn" data-action="dec" data-id="' + a.id + '" aria-label="Decrement">&minus;</button>' +
          '<input type="number" min="0" max="' + ATMA_MAX + '" step="1" value="' + count + '" data-id="' + a.id + '" class="count-input">' +
          '<button type="button" class="count-btn" data-action="inc" data-id="' + a.id + '" aria-label="Increment">+</button>' +
        '</div>' +
      '</td>' +
      '</tr>';
  });

  html += '</tbody></table>';
  container.innerHTML = html;

  // Overall progress (capped per-atma to ATMA_MAX).
  const maxTotal = ATMA_LIST.length * ATMA_MAX; // 120
  const pct = maxTotal > 0 ? Math.round((totalHave / maxTotal) * 100) : 0;
  document.getElementById('overall-progress-text').textContent = totalHave + ' / ' + maxTotal;
  document.getElementById('overall-progress-fill').style.width = pct + '%';

  // Secondary line: how many distinct atma types you have at least 1 of
  // (i.e. progress toward finishing a single job's atma set).
  const atLeastOne = ATMA_LIST.filter(a => (counts[a.id] || 0) >= 1).length;
  document.getElementById('overall-progress-sub').textContent =
    atLeastOne + ' / ' + ATMA_LIST.length + ' Atma types obtained (enough for ' + atLeastOne + ' of 12 for a single job)';

  bindAtmaEvents();
}

function updateCount(id, next) {
  const counts = loadAtma();
  const clamped = clampCount(next);
  if (clamped === 0) {
    delete counts[id];
  } else {
    counts[id] = clamped;
  }
  saveAtma(counts);
  renderAtma();
}

function bindAtmaEvents() {
  const container = document.getElementById('atma-container');

  container.querySelectorAll('.count-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const id = this.getAttribute('data-id');
      const action = this.getAttribute('data-action');
      const counts = loadAtma();
      const current = clampCount(counts[id] || 0);
      const next = action === 'inc' ? current + 1 : current - 1;
      updateCount(id, next);
    });
  });

  container.querySelectorAll('.count-input').forEach(input => {
    input.addEventListener('change', function() {
      const id = this.getAttribute('data-id');
      updateCount(id, parseInt(this.value, 10));
    });
  });
}

// ===== THEME =====
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const icon = document.getElementById('theme-icon');
  const text = document.getElementById('theme-text');
  if (theme === 'dark') {
    icon.innerHTML = '&#9788;';
    text.textContent = 'Light';
  } else {
    icon.innerHTML = '&#9790;';
    text.textContent = 'Dark';
  }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', function() {
  const savedTheme = loadSetting(LS_THEME, 'light');
  applyTheme(savedTheme);

  document.getElementById('theme-toggle').addEventListener('click', function() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    saveSetting(LS_THEME, next);
    applyTheme(next);
  });

  renderAtma();
});
