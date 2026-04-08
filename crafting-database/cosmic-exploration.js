(function() {
  const { useState, useEffect, useMemo } = React;
  const { createElement: h } = React;

  // ==========================================================================
  // Constants
  // ==========================================================================

  const STORAGE_KEY = 'cosmic-exploration-database';
  const LEGACY_KEY  = 'ffxiv-macro-database';

  const JOBS = [
    'Carpenter', 'Alchemist', 'Armorer', 'Blacksmith',
    'Culinarian', 'Goldsmith', 'Leatherworker', 'Weaver'
  ];

  const JOB_ICONS = {
    'Carpenter':     'carpenter',
    'Alchemist':     'science',
    'Armorer':       'shield',
    'Blacksmith':    'hardware',
    'Culinarian':    'restaurant',
    'Goldsmith':     'diamond',
    'Leatherworker': 'straighten',
    'Weaver':        'gesture'
  };

  const LOCATIONS = ['Sinus Ardorum', 'Phaenna', 'Oizys', 'Auxesia'];

  // Canonical sort order: Class A Expert hardest -> Critical
  const CATEGORIES = [
    'Class A Expert', 'Class A', 'Class B', 'Class C', 'Class D',
    'Sequential', 'Time-Restricted', 'Critical'
  ];

  // Adopted from Crafting DB; legacy 'Rroneek Steak HQ' / 'Ceviche HQ' migrated on read.
  const FOOD_OPTIONS = [
    'None',
    'Rroneek Steak (HQ)',
    'Ceviche (HQ)',
    'All i Pebre (HQ)'
  ];

  // Single source of truth for data-reward levels.
  // Adding VII/VIII later: append one entry; nothing else changes.
  const DATA_REWARD_LEVELS = [
    { key: 'i',   label: 'I',   accent: 'gray'  },
    { key: 'ii',  label: 'II',  accent: 'tan'   },
    { key: 'iii', label: 'III', accent: 'olive' },
    { key: 'iv',  label: 'IV',  accent: 'plum'  },
    { key: 'v',   label: 'V',   accent: 'rust'  },
    { key: 'vi',  label: 'VI',  accent: 'wine'  }
  ];

  const COSMIC_POINTS_META = { key: 'cosmicPoints', label: 'Points', icon: 'public', accent: 'brown' };

  // ==========================================================================
  // Helpers
  // ==========================================================================

  const splitMacroIntoChunks = (macroText) => {
    if (!macroText) return [''];
    const lines = macroText.split('\n');
    const chunks = [];
    for (let i = 0; i < lines.length; i += 15) {
      chunks.push(lines.slice(i, i + 15).join('\n'));
    }
    return chunks.length > 0 ? chunks : [''];
  };

  const categoryBadgeClass = (category) => {
    const slug = String(category || '').toLowerCase().replace(/\s+/g, '-');
    return 'cdb-cat-badge cdb-cat-badge--' + slug;
  };

  const normalizeFoodLabel = (label) => {
    if (!label || label === 'None') return 'None';
    if (FOOD_OPTIONS.includes(label)) return label;
    // Migrate legacy 'Rroneek Steak HQ' -> 'Rroneek Steak (HQ)'
    const withParens = label.replace(/\s+HQ$/, ' (HQ)');
    if (FOOD_OPTIONS.includes(withParens)) return withParens;
    return 'None';
  };

  const normalizeItem = (item) => ({
    name: (item && item.name) || '',
    difficulty: parseInt(item && item.difficulty) || 0,
    quality: parseInt(item && item.quality) || 0,
    durability: parseInt(item && item.durability) || 0
  });

  const makeId = () =>
    Date.now().toString() + '-' + Math.random().toString(36).slice(2, 8);

  const normalizeEntry = (entry) => {
    const safe = {
      id:           (entry && typeof entry.id === 'string' && entry.id) || String(entry && entry.id) || makeId(),
      questName:    (entry && entry.questName) || '',
      location:     (entry && entry.location) || LOCATIONS[0],
      job:          (entry && entry.job) || JOBS[0],
      category:     (entry && entry.category) || 'Class D',
      foodRequired: !!(entry && entry.foodRequired),
      foodType:     normalizeFoodLabel(entry && entry.foodType),
      notes:        (entry && entry.notes) || ''
    };

    // Items: ensure at least one
    const rawItems = (entry && Array.isArray(entry.items) && entry.items.length)
      ? entry.items
      : [{ name: '', difficulty: 0, quality: 0, durability: 0 }];
    safe.items = rawItems.map(normalizeItem);

    // Macros: always-array of { itemName, macro }, aligned with items by index
    if (entry && Array.isArray(entry.macros) && entry.macros.length) {
      safe.macros = safe.items.map((it, i) => {
        const m = entry.macros[i] || {};
        return { itemName: m.itemName || it.name || '', macro: m.macro || '' };
      });
    } else {
      safe.macros = safe.items.map((it, i) => ({
        itemName: it.name,
        macro: i === 0 ? ((entry && entry.macro) || '') : ''
      }));
    }

    // Data reward: ensure every level defined by DATA_REWARD_LEVELS is present
    const dr = (entry && entry.dataReward) || {};
    safe.dataReward = {
      job: dr.job || safe.job,
      cosmicPoints: parseInt(dr.cosmicPoints) || 0
    };
    DATA_REWARD_LEVELS.forEach((level) => {
      safe.dataReward[level.key] = parseInt(dr[level.key]) || 0;
    });

    return safe;
  };

  const loadCosmicData = () => {
    let raw = localStorage.getItem(STORAGE_KEY);
    let migrated = false;
    if (!raw) {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        raw = legacy;
        migrated = true;
      }
    }
    if (!raw) return [];

    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      console.error('Failed to parse cosmic exploration data:', e);
      return [];
    }
    if (!Array.isArray(data)) return [];

    const normalized = data.map(normalizeEntry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    if (migrated) {
      localStorage.removeItem(LEGACY_KEY);
    }
    return normalized;
  };

  // ==========================================================================
  // CSV helpers (used by import/export)
  // ==========================================================================

  const escapeCSV = (value) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  const parseCSV = (text) => {
    const result = [];
    let currentRow = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (inQuotes) {
        if (char === '"') {
          if (nextChar === '"') {
            currentField += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          currentField += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          currentRow.push(currentField);
          currentField = '';
        } else if (char === '\n') {
          currentRow.push(currentField);
          if (currentRow.length > 0) result.push(currentRow);
          currentRow = [];
          currentField = '';
          if (nextChar === '\r') i++;
        } else if (char !== '\r') {
          currentField += char;
        }
      }
    }
    if (currentField || currentRow.length > 0) {
      currentRow.push(currentField);
      result.push(currentRow);
    }
    return result.filter(row => row.some(f => f.trim() !== ''));
  };

  const exportToCSV = () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      alert('No cosmic exploration database found!');
      return;
    }
    let entries;
    try {
      entries = JSON.parse(raw);
    } catch (e) {
      alert('Error parsing database: ' + e.message);
      return;
    }
    if (!Array.isArray(entries) || entries.length === 0) {
      alert('Database is empty!');
      return;
    }

    const headers = [
      'Quest Name', 'Location', 'Job', 'Category', 'Food Required', 'Food Type',
      'Item Name', 'Difficulty', 'Quality', 'Durability',
      'Data Reward Job',
      ...DATA_REWARD_LEVELS.map(l => 'Data ' + l.label),
      'Cosmic Points', 'Macro', 'Notes'
    ];

    const rows = [];
    entries.forEach(entry => {
      const items = entry.items && entry.items.length ? entry.items : [{ name: '', difficulty: 0, quality: 0, durability: 0 }];
      items.forEach((item, idx) => {
        const row = [];
        row.push(escapeCSV(entry.questName));
        row.push(escapeCSV(entry.location));
        row.push(escapeCSV(entry.job));
        row.push(escapeCSV(entry.category));
        row.push(entry.foodRequired ? 'Yes' : 'No');
        row.push(escapeCSV(entry.foodType || 'None'));
        row.push(escapeCSV(item.name));
        row.push(item.difficulty || 0);
        row.push(item.quality || 0);
        row.push(item.durability || 0);

        const dr = entry.dataReward || {};
        row.push(escapeCSV(dr.job || entry.job));
        DATA_REWARD_LEVELS.forEach(level => {
          row.push(dr[level.key] || 0);
        });
        row.push(dr.cosmicPoints || 0);

        let macroText = '';
        if (entry.macros && entry.macros[idx]) {
          macroText = entry.macros[idx].macro || '';
        } else if (idx === 0 && entry.macro) {
          macroText = entry.macro;
        }
        row.push(escapeCSV(macroText));
        row.push(escapeCSV(entry.notes || ''));

        rows.push(row.join(','));
      });
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().slice(0, 10);
    link.setAttribute('href', url);
    link.setAttribute('download', `cosmic-exploration-${timestamp}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    alert(`Successfully exported ${entries.length} entries to CSV!`);
  };

  const importFromCSV = (file, callback) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const rows = parseCSV(e.target.result);
        if (rows.length < 2) {
          alert('CSV file is empty or invalid!');
          return;
        }
        const headers = rows[0].map(h => h.trim());
        const dataRows = rows.slice(1);

        const colIndex = (name) => headers.indexOf(name);
        const get = (row, name) => {
          const i = colIndex(name);
          return i >= 0 ? row[i] : '';
        };

        const questMap = new Map();
        dataRows.forEach(row => {
          const questName = get(row, 'Quest Name') || '';
          if (!questName.trim()) return;

          const location = get(row, 'Location') || '';
          const job      = get(row, 'Job') || '';
          const key = `${questName}|||${location}|||${job}`;

          let quest = questMap.get(key);
          if (!quest) {
            quest = {
              id: makeId(),
              questName: questName,
              location: location,
              job: job,
              category: get(row, 'Category') || 'Class D',
              foodRequired: get(row, 'Food Required') === 'Yes',
              foodType: get(row, 'Food Type') || 'None',
              items: [],
              macros: [],
              dataReward: {
                job: get(row, 'Data Reward Job') || job,
                cosmicPoints: parseInt(get(row, 'Cosmic Points')) || 0
              },
              notes: get(row, 'Notes') || ''
            };
            DATA_REWARD_LEVELS.forEach(level => {
              quest.dataReward[level.key] = parseInt(get(row, 'Data ' + level.label)) || 0;
            });
            questMap.set(key, quest);
          }

          const itemName = get(row, 'Item Name') || '';
          if (itemName) {
            quest.items.push({
              name: itemName,
              difficulty: parseInt(get(row, 'Difficulty')) || 0,
              quality:    parseInt(get(row, 'Quality')) || 0,
              durability: parseInt(get(row, 'Durability')) || 0
            });
            quest.macros.push({
              itemName: itemName,
              macro: get(row, 'Macro') || ''
            });
          }
        });

        const imported = Array.from(questMap.values()).map(normalizeEntry);
        if (imported.length === 0) {
          alert('No valid data found in CSV file!');
          return;
        }

        const current = localStorage.getItem(STORAGE_KEY);
        let message = `Import ${imported.length} quests from CSV?`;
        if (current) {
          try {
            const currentEntries = JSON.parse(current);
            message = `This will replace your current ${currentEntries.length} entries with ${imported.length} new entries from CSV. Continue?`;
          } catch (e) { /* ignore */ }
        }
        if (confirm(message)) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(imported));
          alert(`Successfully imported ${imported.length} entries from CSV!`);
          if (callback) callback();
        }
      } catch (error) {
        console.error('CSV import error:', error);
        alert(`Error importing CSV: ${error.message}`);
      }
    };
    reader.readAsText(file);
  };

  // ==========================================================================
  // Root component (scaffold — expanded in later commits)
  // ==========================================================================

  const CosmicExplorationDatabase = () => {
    const [macros, setMacros] = useState([]);
    const [hasLoaded, setHasLoaded] = useState(false);

    useEffect(() => {
      setMacros(loadCosmicData());
      setHasLoaded(true);
    }, []);

    useEffect(() => {
      if (!hasLoaded) return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(macros));
    }, [macros, hasLoaded]);

    return h('div', { className: 'cdb-root container' },
      h('div', { className: 'top-controls' },
        h('div', { className: 'action-buttons-top' },
          h('button', {
            onClick: exportToCSV,
            className: 'cdb-btn cdb-btn-primary'
          },
            h('span', { className: 'material-icons cdb-icon-sm' }, 'download'),
            'Export CSV'
          ),
          h('label', { className: 'cdb-btn cdb-btn-primary' },
            h('span', { className: 'material-icons cdb-icon-sm' }, 'upload'),
            'Import CSV',
            h('input', {
              type: 'file',
              accept: '.csv',
              onChange: (e) => {
                const file = e.target.files[0];
                if (file) {
                  importFromCSV(file, () => { window.location.reload(); });
                }
                e.target.value = '';
              },
              style: { display: 'none' }
            })
          )
        )
      ),
      h('header', { className: 'app-header' },
        h('h1', { className: 'app-title craft-name' }, 'FFXIV Cosmic Exploration Macro Database'),
        h('p', { className: 'app-subtitle' }, 'Manage your Cosmic Exploration mission macros')
      ),
      h('div', { className: 'cdb-empty-state' },
        `Loaded ${macros.length} entr${macros.length === 1 ? 'y' : 'ies'}. UI coming in the next commit.`
      )
    );
  };

  window.CosmicExplorationDatabase = CosmicExplorationDatabase;
  window.CosmicExploration = { exportToCSV, importFromCSV };
})();
