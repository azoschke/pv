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
  // DataRewardChips — shared display/edit widget for data-reward level chips
  // ==========================================================================

  const DataRewardChips = ({ dataReward, mode, onChange }) => {
    if (mode === 'edit') {
      return h('div', { className: 'cdb-data-chip-row' },
        ...DATA_REWARD_LEVELS.map(level =>
          h('div', { key: level.key, className: 'cdb-field-group', style: { minWidth: '70px' } },
            h('label', { className: 'cdb-label-xs' }, level.label),
            h('input', {
              type: 'number',
              placeholder: '0',
              className: 'cdb-input cdb-input-sm',
              value: dataReward[level.key] || 0,
              onChange: (e) => onChange(level.key, parseInt(e.target.value) || 0)
            })
          )
        ),
        h('div', { className: 'cdb-field-group', style: { minWidth: '90px' } },
          h('label', { className: 'cdb-label-xs' }, COSMIC_POINTS_META.label),
          h('input', {
            type: 'number',
            placeholder: '0',
            className: 'cdb-input cdb-input-sm',
            value: dataReward.cosmicPoints || 0,
            onChange: (e) => onChange('cosmicPoints', parseInt(e.target.value) || 0)
          })
        )
      );
    }

    // Display mode: render non-zero levels as chips
    const nonZero = DATA_REWARD_LEVELS.filter(level => (dataReward[level.key] || 0) > 0);
    const hasPoints = (dataReward.cosmicPoints || 0) > 0;
    if (nonZero.length === 0 && !hasPoints) return null;

    return h('div', { className: 'cdb-data-chip-row' },
      ...nonZero.map(level =>
        h('span', {
          key: level.key,
          className: 'cdb-data-chip cdb-data-chip--' + level.accent
        },
          h('span', { className: 'cdb-data-chip-label' }, level.label),
          h('span', { className: 'cdb-data-chip-count' }, '\u00D7 ' + dataReward[level.key])
        )
      ),
      hasPoints && h('span', {
        className: 'cdb-data-chip cdb-data-chip--' + COSMIC_POINTS_META.accent
      },
        h('span', { className: 'material-icons cdb-icon-xs' }, COSMIC_POINTS_META.icon),
        h('span', { className: 'cdb-data-chip-label' }, COSMIC_POINTS_META.label),
        h('span', { className: 'cdb-data-chip-count' }, '\u00D7 ' + dataReward.cosmicPoints)
      )
    );
  };

  // ==========================================================================
  // CosmicForm — Add New (shared shape used by inline edit in a later commit)
  // ==========================================================================

  const blankFormData = () => ({
    questName: '',
    location: LOCATIONS[0],
    job: JOBS[0],
    category: 'Class D',
    foodRequired: false,
    foodType: 'None',
    items: [{ name: '', difficulty: '', quality: '', durability: '' }],
    macros: [{ itemName: '', macro: '' }],
    dataReward: (() => {
      const dr = { job: JOBS[0], cosmicPoints: 0 };
      DATA_REWARD_LEVELS.forEach(l => { dr[l.key] = 0; });
      return dr;
    })(),
    notes: ''
  });

  const CosmicForm = ({ onSave, onCancel }) => {
    const [formData, setFormData] = useState(blankFormData);

    const updateField = (field, value) => {
      if (field === 'job') {
        setFormData(prev => ({
          ...prev,
          job: value,
          dataReward: { ...prev.dataReward, job: value }
        }));
      } else {
        setFormData(prev => ({ ...prev, [field]: value }));
      }
    };

    const updateItem = (index, field, value) => {
      setFormData(prev => {
        const items = prev.items.map((it, i) =>
          i === index ? { ...it, [field]: value } : it
        );
        // Keep macros array in sync with item names for display
        const macros = prev.macros.map((m, i) =>
          i === index && field === 'name' ? { ...m, itemName: value } : m
        );
        return { ...prev, items, macros };
      });
    };

    const updateMacro = (index, value) => {
      setFormData(prev => {
        const macros = prev.macros.map((m, i) =>
          i === index ? { ...m, macro: value } : m
        );
        return { ...prev, macros };
      });
    };

    const addItem = () => {
      setFormData(prev => ({
        ...prev,
        items: [...prev.items, { name: '', difficulty: '', quality: '', durability: '' }],
        macros: [...prev.macros, { itemName: '', macro: '' }]
      }));
    };

    const removeItem = (index) => {
      setFormData(prev => ({
        ...prev,
        items: prev.items.filter((_, i) => i !== index),
        macros: prev.macros.filter((_, i) => i !== index)
      }));
    };

    const updateDataReward = (key, value) => {
      setFormData(prev => ({
        ...prev,
        dataReward: { ...prev.dataReward, [key]: value }
      }));
    };

    const handleSubmit = (e) => {
      if (e) e.preventDefault();
      if (!formData.questName.trim()) {
        alert('Please enter a quest name');
        return;
      }
      if (!formData.items[0].name.trim()) {
        alert('Please enter at least one item name');
        return;
      }
      onSave(formData);
    };

    const multipleItems = formData.items.length > 1;

    return h('div', { className: 'cdb-form-panel' },
      h('h2', { className: 'cdb-form-title craft-name' }, 'Add New Mission'),
      h('form', { onSubmit: handleSubmit, className: 'cdb-form-fields' },
        h('div', null,
          h('label', { className: 'cdb-label' }, 'Quest Name *'),
          h('input', {
            type: 'text',
            value: formData.questName,
            onChange: (e) => updateField('questName', e.target.value),
            className: 'cdb-input',
            required: true
          })
        ),
        h('div', { className: 'cdb-grid-3' },
          h('div', null,
            h('label', { className: 'cdb-label' }, 'Location'),
            h('select', {
              value: formData.location,
              onChange: (e) => updateField('location', e.target.value),
              className: 'cdb-input'
            },
              ...LOCATIONS.map(loc => h('option', { key: loc, value: loc }, loc))
            )
          ),
          h('div', null,
            h('label', { className: 'cdb-label' }, 'Job'),
            h('select', {
              value: formData.job,
              onChange: (e) => updateField('job', e.target.value),
              className: 'cdb-input'
            },
              ...JOBS.map(job => h('option', { key: job, value: job }, job))
            )
          ),
          h('div', null,
            h('label', { className: 'cdb-label' }, 'Category'),
            h('select', {
              value: formData.category,
              onChange: (e) => updateField('category', e.target.value),
              className: 'cdb-input'
            },
              ...CATEGORIES.map(cat => h('option', { key: cat, value: cat }, cat))
            )
          )
        ),
        h('div', { className: 'cdb-field-group' },
          h('div', { className: 'cdb-inline-row' },
            h('input', {
              type: 'checkbox',
              id: 'newFoodRequired',
              checked: formData.foodRequired,
              onChange: (e) => updateField('foodRequired', e.target.checked),
              className: 'cdb-checkbox'
            }),
            h('label', { htmlFor: 'newFoodRequired', className: 'cdb-label' }, 'Food Required')
          ),
          formData.foodRequired && h('select', {
            value: formData.foodType,
            onChange: (e) => updateField('foodType', e.target.value),
            className: 'cdb-input'
          },
            ...FOOD_OPTIONS.map(food => h('option', { key: food, value: food }, food))
          )
        ),
        h('div', null,
          h('div', { className: 'cdb-searchmode-bar' },
            h('label', { className: 'cdb-label', style: { marginBottom: 0 } }, 'Items'),
            h('button', {
              type: 'button',
              onClick: addItem,
              className: 'cdb-btn cdb-btn-secondary'
            }, 'Add Item')
          ),
          ...formData.items.map((item, index) =>
            h('div', { key: index, className: 'cdb-form-fields', style: { marginBottom: '0.75rem', padding: '0.75rem', backgroundColor: 'var(--bg-darker)', borderRadius: '0.375rem' } },
              h('div', { className: 'cdb-grid-3' },
                h('div', null,
                  h('label', { className: 'cdb-label-xs' }, 'Item Name'),
                  h('input', {
                    type: 'text',
                    className: 'cdb-input cdb-input-sm',
                    placeholder: 'Item Name',
                    value: item.name,
                    onChange: (e) => updateItem(index, 'name', e.target.value)
                  })
                ),
                h('div', null,
                  h('label', { className: 'cdb-label-xs' }, 'Difficulty'),
                  h('input', {
                    type: 'number',
                    className: 'cdb-input cdb-input-sm',
                    value: item.difficulty,
                    onChange: (e) => updateItem(index, 'difficulty', e.target.value)
                  })
                ),
                h('div', null,
                  h('label', { className: 'cdb-label-xs' }, 'Quality'),
                  h('input', {
                    type: 'number',
                    className: 'cdb-input cdb-input-sm',
                    value: item.quality,
                    onChange: (e) => updateItem(index, 'quality', e.target.value)
                  })
                )
              ),
              h('div', { className: 'cdb-grid-3' },
                h('div', null,
                  h('label', { className: 'cdb-label-xs' }, 'Durability'),
                  h('input', {
                    type: 'number',
                    className: 'cdb-input cdb-input-sm',
                    value: item.durability,
                    onChange: (e) => updateItem(index, 'durability', e.target.value)
                  })
                ),
                formData.items.length > 1 && h('div', { style: { alignSelf: 'end' } },
                  h('button', {
                    type: 'button',
                    onClick: () => removeItem(index),
                    className: 'cdb-btn cdb-btn-secondary',
                    style: { backgroundColor: 'var(--accent-red)', color: 'white' }
                  }, 'Remove Item')
                )
              ),
              multipleItems && h('div', null,
                h('label', { className: 'cdb-label-xs' },
                  'Macro for ' + (item.name || `Item ${index + 1}`)
                ),
                h('textarea', {
                  className: 'cdb-input cdb-input-mono',
                  rows: 6,
                  value: formData.macros[index] ? formData.macros[index].macro : '',
                  onChange: (e) => updateMacro(index, e.target.value),
                  placeholder: '/ac "Muscle Memory" <wait.3>'
                })
              )
            )
          ),
          !multipleItems && h('div', null,
            h('label', { className: 'cdb-label' }, 'Macro'),
            h('textarea', {
              className: 'cdb-input cdb-input-mono',
              rows: 6,
              value: formData.macros[0] ? formData.macros[0].macro : '',
              onChange: (e) => updateMacro(0, e.target.value),
              placeholder: '/ac "Muscle Memory" <wait.3>'
            })
          )
        ),
        h('div', null,
          h('label', { className: 'cdb-label' }, `Data Reward (${formData.dataReward.job})`),
          h(DataRewardChips, {
            dataReward: formData.dataReward,
            mode: 'edit',
            onChange: updateDataReward
          })
        ),
        h('div', null,
          h('label', { className: 'cdb-label' }, 'Notes'),
          h('textarea', {
            className: 'cdb-input',
            rows: 3,
            value: formData.notes,
            onChange: (e) => updateField('notes', e.target.value),
            placeholder: 'Additional notes...'
          })
        ),
        h('div', { className: 'cdb-form-actions' },
          h('button', {
            type: 'button',
            onClick: onCancel,
            className: 'cdb-btn cdb-btn-secondary'
          }, 'Cancel'),
          h('button', {
            type: 'submit',
            className: 'cdb-btn cdb-btn-primary'
          }, 'Add Mission')
        )
      )
    );
  };

  // ==========================================================================
  // CosmicCard — one entry (collapsed header + expanded read body)
  // ==========================================================================

  const CosmicCard = ({
    entry, isExpanded, onToggle, onDelete, onUpdate,
    highlightDifficulty, highlightQuality, highlightDurability
  }) => {
    const [copiedItemId, setCopiedItemId] = useState(null);
    const [copiedChunkId, setCopiedChunkId] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(false);
    const [isEditingInline, setIsEditingInline] = useState(false);
    const [editFormData, setEditFormData] = useState(() => JSON.parse(JSON.stringify(entry)));

    const handleInlineEdit = () => {
      if (!isExpanded) onToggle();
      setEditFormData(JSON.parse(JSON.stringify(entry)));
      setIsEditingInline(true);
    };

    const handleInlineSave = () => {
      if (!editFormData.questName || !editFormData.questName.trim()) {
        alert('Please enter a quest name');
        return;
      }
      onUpdate(normalizeEntry(editFormData));
      setIsEditingInline(false);
    };

    const handleInlineCancel = () => {
      setIsEditingInline(false);
      setEditFormData(JSON.parse(JSON.stringify(entry)));
    };

    const updateEditField = (field, value) => {
      if (field === 'job') {
        setEditFormData(prev => ({
          ...prev,
          job: value,
          dataReward: { ...prev.dataReward, job: value }
        }));
      } else {
        setEditFormData(prev => ({ ...prev, [field]: value }));
      }
    };

    const updateEditItem = (index, field, value) => {
      setEditFormData(prev => {
        const items = prev.items.map((it, i) =>
          i === index ? { ...it, [field]: field === 'name' ? value : (parseInt(value) || 0) } : it
        );
        const macros = prev.macros.map((m, i) =>
          i === index && field === 'name' ? { ...m, itemName: value } : m
        );
        return { ...prev, items, macros };
      });
    };

    const updateEditMacro = (index, value) => {
      setEditFormData(prev => ({
        ...prev,
        macros: prev.macros.map((m, i) => i === index ? { ...m, macro: value } : m)
      }));
    };

    const addEditItem = () => {
      setEditFormData(prev => ({
        ...prev,
        items: [...prev.items, { name: '', difficulty: 0, quality: 0, durability: 0 }],
        macros: [...prev.macros, { itemName: '', macro: '' }]
      }));
    };

    const removeEditItem = (index) => {
      setEditFormData(prev => ({
        ...prev,
        items: prev.items.filter((_, i) => i !== index),
        macros: prev.macros.filter((_, i) => i !== index)
      }));
    };

    const updateEditDataReward = (key, value) => {
      setEditFormData(prev => ({
        ...prev,
        dataReward: { ...prev.dataReward, [key]: value }
      }));
    };

    const copyText = (text, markerSetter, markerValue) => {
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => {
        markerSetter(markerValue);
        setTimeout(() => markerSetter(null), 1500);
      });
    };

    const header = h('div', {
      className: `craft-card-header ${isExpanded ? 'expanded' : ''}`,
      onClick: onToggle,
      style: { borderColor: isExpanded ? '#C5B89A' : 'transparent', paddingRight: '80px', position: 'relative' }
    },
      h('div', { className: 'craft-title-section' },
        h('h3', { className: 'craft-name' }, entry.questName || '(unnamed)')
      ),
      h('div', { className: 'craft-meta-section' },
        h('div', { className: 'cdb-badge-row' },
          h('span', { className: 'cdb-badge cdb-badge--location' },
            h('span', { className: 'material-icons cdb-icon-xs' }, 'public'),
            entry.location || '—'
          ),
          h('span', { className: 'cdb-badge cdb-badge--job' },
            h('span', { className: 'material-icons cdb-icon-xs' }, JOB_ICONS[entry.job] || 'build'),
            entry.job || '—'
          ),
          h('span', { className: categoryBadgeClass(entry.category) }, entry.category || '—'),
          entry.foodRequired && entry.foodType !== 'None' && h('span', {
            className: 'cdb-badge cdb-badge--food'
          },
            h('span', { className: 'material-icons cdb-icon-xs' }, 'restaurant'),
            entry.foodType
          )
        ),
        h('button', {
          onClick: (e) => { e.stopPropagation(); onToggle(); },
          className: 'cdb-btn cdb-btn-secondary',
          style: {
            padding: '8px',
            position: 'absolute',
            right: '0',
            top: '50%',
            transform: 'translateY(-50%) translateX(50%)',
            zIndex: 10
          },
          title: isExpanded ? 'Collapse' : 'Expand'
        },
          h('span', { className: 'material-icons cdb-icon-md' }, isExpanded ? 'expand_less' : 'expand_more')
        )
      )
    );

    // Collapsed view: header + per-item copy buttons row
    const collapsedBody = !isExpanded && h('div', {
      className: 'cdb-inline-row',
      style: { padding: '0 1rem 0.75rem', flexWrap: 'wrap', gap: '0.4rem' }
    },
      h('span', { style: { fontSize: '0.8rem', color: 'var(--text-secondary)' } }, 'Crafts:'),
      ...(entry.items || []).map((item, idx) => {
        const macroText = (entry.macros && entry.macros[idx]) ? entry.macros[idx].macro : '';
        const markerValue = entry.id + '-' + idx;
        return h('button', {
          key: idx,
          onClick: (e) => {
            e.stopPropagation();
            copyText(macroText, setCopiedItemId, markerValue);
          },
          className: 'cdb-copy-btn',
          title: macroText ? 'Copy macro' : 'No macro for this item'
        },
          h('span', { className: 'material-icons cdb-icon-xs' },
            copiedItemId === markerValue ? 'check' : 'content_copy'
          ),
          item.name || `Item ${idx + 1}`
        );
      })
    );

    if (!isExpanded) {
      return h('div', { className: 'craft-card', style: { overflow: 'visible' } },
        header,
        collapsedBody
      );
    }

    // Expanded view
    const matchesDifficulty = (value) =>
      highlightDifficulty && value && parseInt(highlightDifficulty) === value;
    const matchesQuality = (value) =>
      highlightQuality && value && parseInt(highlightQuality) === value;
    const matchesDurability = (value) =>
      highlightDurability && value && parseInt(highlightDurability) === value;

    const statClass = (matches) =>
      'cdb-cosmic-item-stat' + (matches ? ' cdb-cosmic-item-stat--match' : '');

    const multipleEditItems = isEditingInline && editFormData.items && editFormData.items.length > 1;

    const editBody = isEditingInline && h('div', { className: 'cdb-form-fields' },
      h('div', null,
        h('label', { className: 'cdb-label' }, 'Quest Name *'),
        h('input', {
          type: 'text',
          value: editFormData.questName || '',
          onChange: (e) => updateEditField('questName', e.target.value),
          className: 'cdb-input',
          required: true
        })
      ),
      h('div', { className: 'cdb-grid-3' },
        h('div', null,
          h('label', { className: 'cdb-label' }, 'Location'),
          h('select', {
            value: editFormData.location || LOCATIONS[0],
            onChange: (e) => updateEditField('location', e.target.value),
            className: 'cdb-input'
          },
            // Preserve legacy slash-separated value if present
            editFormData.location && !LOCATIONS.includes(editFormData.location) &&
              h('option', { value: editFormData.location }, editFormData.location),
            ...LOCATIONS.map(loc => h('option', { key: loc, value: loc }, loc))
          )
        ),
        h('div', null,
          h('label', { className: 'cdb-label' }, 'Job'),
          h('select', {
            value: editFormData.job || JOBS[0],
            onChange: (e) => updateEditField('job', e.target.value),
            className: 'cdb-input'
          },
            ...JOBS.map(job => h('option', { key: job, value: job }, job))
          )
        ),
        h('div', null,
          h('label', { className: 'cdb-label' }, 'Category'),
          h('select', {
            value: editFormData.category || 'Class D',
            onChange: (e) => updateEditField('category', e.target.value),
            className: 'cdb-input'
          },
            ...CATEGORIES.map(cat => h('option', { key: cat, value: cat }, cat))
          )
        )
      ),
      h('div', { className: 'cdb-field-group' },
        h('div', { className: 'cdb-inline-row' },
          h('input', {
            type: 'checkbox',
            id: `editFoodRequired-${entry.id}`,
            checked: !!editFormData.foodRequired,
            onChange: (e) => updateEditField('foodRequired', e.target.checked),
            className: 'cdb-checkbox'
          }),
          h('label', { htmlFor: `editFoodRequired-${entry.id}`, className: 'cdb-label' }, 'Food Required')
        ),
        editFormData.foodRequired && h('select', {
          value: editFormData.foodType || 'None',
          onChange: (e) => updateEditField('foodType', e.target.value),
          className: 'cdb-input'
        },
          ...FOOD_OPTIONS.map(food => h('option', { key: food, value: food }, food))
        )
      ),
      h('div', null,
        h('div', { className: 'cdb-searchmode-bar' },
          h('label', { className: 'cdb-label', style: { marginBottom: 0 } }, 'Items'),
          h('button', {
            type: 'button',
            onClick: addEditItem,
            className: 'cdb-btn cdb-btn-secondary'
          }, 'Add Item')
        ),
        ...editFormData.items.map((item, idx) =>
          h('div', { key: idx, className: 'cdb-form-fields', style: { marginBottom: '0.75rem', padding: '0.75rem', backgroundColor: 'var(--bg-darker)', borderRadius: '0.375rem' } },
            h('div', { className: 'cdb-grid-3' },
              h('div', null,
                h('label', { className: 'cdb-label-xs' }, 'Item Name'),
                h('input', {
                  type: 'text',
                  className: 'cdb-input cdb-input-sm',
                  value: item.name || '',
                  onChange: (e) => updateEditItem(idx, 'name', e.target.value)
                })
              ),
              h('div', null,
                h('label', { className: 'cdb-label-xs' }, 'Difficulty'),
                h('input', {
                  type: 'number',
                  className: 'cdb-input cdb-input-sm',
                  value: item.difficulty || 0,
                  onChange: (e) => updateEditItem(idx, 'difficulty', e.target.value)
                })
              ),
              h('div', null,
                h('label', { className: 'cdb-label-xs' }, 'Quality'),
                h('input', {
                  type: 'number',
                  className: 'cdb-input cdb-input-sm',
                  value: item.quality || 0,
                  onChange: (e) => updateEditItem(idx, 'quality', e.target.value)
                })
              )
            ),
            h('div', { className: 'cdb-grid-3' },
              h('div', null,
                h('label', { className: 'cdb-label-xs' }, 'Durability'),
                h('input', {
                  type: 'number',
                  className: 'cdb-input cdb-input-sm',
                  value: item.durability || 0,
                  onChange: (e) => updateEditItem(idx, 'durability', e.target.value)
                })
              ),
              editFormData.items.length > 1 && h('div', { style: { alignSelf: 'end' } },
                h('button', {
                  type: 'button',
                  onClick: () => removeEditItem(idx),
                  className: 'cdb-btn cdb-btn-secondary',
                  style: { backgroundColor: 'var(--accent-red)', color: 'white' }
                }, 'Remove Item')
              )
            ),
            multipleEditItems && h('div', null,
              h('label', { className: 'cdb-label-xs' },
                'Macro for ' + (item.name || `Item ${idx + 1}`)
              ),
              h('textarea', {
                className: 'cdb-input cdb-input-mono',
                rows: 6,
                value: (editFormData.macros[idx] && editFormData.macros[idx].macro) || '',
                onChange: (e) => updateEditMacro(idx, e.target.value)
              })
            )
          )
        ),
        !multipleEditItems && h('div', null,
          h('label', { className: 'cdb-label' }, 'Macro'),
          h('textarea', {
            className: 'cdb-input cdb-input-mono',
            rows: 8,
            value: (editFormData.macros[0] && editFormData.macros[0].macro) || '',
            onChange: (e) => updateEditMacro(0, e.target.value)
          })
        )
      ),
      h('div', null,
        h('label', { className: 'cdb-label' }, `Data Reward (${editFormData.dataReward && editFormData.dataReward.job || editFormData.job})`),
        h(DataRewardChips, {
          dataReward: editFormData.dataReward || {},
          mode: 'edit',
          onChange: updateEditDataReward
        })
      ),
      h('div', null,
        h('label', { className: 'cdb-label' }, 'Notes'),
        h('textarea', {
          className: 'cdb-input',
          rows: 3,
          value: editFormData.notes || '',
          onChange: (e) => updateEditField('notes', e.target.value)
        })
      ),
      h('div', { className: 'cdb-form-actions' },
        h('button', {
          type: 'button',
          onClick: handleInlineCancel,
          className: 'cdb-btn cdb-btn-secondary'
        }, 'Cancel'),
        h('button', {
          type: 'button',
          onClick: handleInlineSave,
          className: 'cdb-btn cdb-btn-primary'
        }, 'Save')
      )
    );

    return h('div', { className: 'craft-card', style: { overflow: 'visible' } },
      header,
      h('div', { className: 'cdb-card-body' },
        isEditingInline && editBody,
        // Items grid
        !isEditingInline && entry.items && entry.items.length > 0 && h('div', null,
          h('h4', { className: 'cdb-subheading' }, 'Items'),
          h('div', { className: 'cdb-cosmic-item-grid' },
            ...entry.items.map((item, idx) =>
              h('div', { key: idx, className: 'cdb-cosmic-item-card' },
                h('div', { className: 'cdb-cosmic-item-name' }, item.name || `Item ${idx + 1}`),
                h('div', { className: statClass(matchesDifficulty(item.difficulty)) },
                  'Difficulty: ',
                  h('span', { className: 'cdb-stat-value' }, item.difficulty || 0)
                ),
                h('div', { className: statClass(matchesQuality(item.quality)) },
                  'Quality: ',
                  h('span', { className: 'cdb-stat-value' }, item.quality || 0)
                ),
                h('div', { className: statClass(matchesDurability(item.durability)) },
                  'Durability: ',
                  h('span', { className: 'cdb-stat-value' }, item.durability || 0)
                )
              )
            )
          )
        ),
        // Data reward
        !isEditingInline && h('div', null,
          h('h4', { className: 'cdb-subheading' }, `Data Reward (${entry.dataReward && entry.dataReward.job || entry.job})`),
          h(DataRewardChips, {
            dataReward: entry.dataReward || {},
            mode: 'display'
          }) || h('span', { style: { color: 'var(--text-secondary)', fontSize: '0.85rem' } }, '(none)')
        ),
        // Macros
        !isEditingInline && entry.macros && entry.macros.length > 0 && h('div', null,
          h('h4', { className: 'cdb-subheading' }, 'Macros'),
          ...(entry.items || []).map((item, itemIdx) => {
            const macroEntry = entry.macros[itemIdx];
            const macroText = (macroEntry && macroEntry.macro) || '';
            if (!macroText) return null;
            const chunks = splitMacroIntoChunks(macroText);
            return h('div', { key: itemIdx, style: { marginBottom: '0.75rem' } },
              entry.items.length > 1 && h('div', {
                style: { fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }
              }, item.name || `Item ${itemIdx + 1}`),
              h('div', { className: 'cdb-macro-grid' },
                ...chunks.map((chunk, chunkIdx) => {
                  const markerValue = entry.id + '-' + itemIdx + '-' + chunkIdx;
                  return h('div', { key: chunkIdx, className: 'cdb-macro-chunk' },
                    h('div', { className: 'cdb-macro-header' },
                      h('span', { className: 'cdb-macro-label' },
                        chunks.length > 1 ? `Macro ${chunkIdx + 1}` : 'Macro'
                      ),
                      h('button', {
                        onClick: () => copyText(chunk, setCopiedChunkId, markerValue),
                        className: 'cdb-copy-btn'
                      },
                        h('span', { className: 'material-icons cdb-icon-xs' },
                          copiedChunkId === markerValue ? 'check' : 'content_copy'
                        ),
                        copiedChunkId === markerValue ? 'Copied' : 'Copy'
                      )
                    ),
                    h('pre', { className: 'cdb-macro-pre' }, chunk)
                  );
                })
              )
            );
          })
        ),
        // Notes
        !isEditingInline && entry.notes && h('div', null,
          h('h4', { className: 'cdb-subheading' }, 'Notes'),
          h('p', { className: 'cdb-notes-text' }, entry.notes)
        )
      ),
      !isEditingInline && h('div', { className: 'cdb-card-footer' },
        h('span', {
          onClick: (e) => { e.stopPropagation(); handleInlineEdit(); },
          className: 'material-icons cdb-icon-btn',
          style: { color: 'var(--accent-brown)', fontSize: '24px' },
          title: 'Edit'
        }, 'edit'),
        deleteConfirm
          ? h('div', { className: 'cdb-inline-row', style: { gap: '0.25rem' } },
              h('button', {
                onClick: (e) => { e.stopPropagation(); onDelete(); setDeleteConfirm(false); },
                className: 'cdb-btn cdb-btn-secondary',
                style: { color: 'var(--accent-red)', borderColor: 'var(--accent-red)' }
              }, 'Confirm'),
              h('button', {
                onClick: (e) => { e.stopPropagation(); setDeleteConfirm(false); },
                className: 'cdb-btn cdb-btn-secondary'
              }, 'Cancel')
            )
          : h('button', {
              onClick: (e) => { e.stopPropagation(); setDeleteConfirm(true); },
              className: 'cdb-btn cdb-btn-secondary',
              style: { color: 'var(--accent-red)', borderColor: 'var(--accent-red)' },
              title: 'Delete'
            },
              h('span', { className: 'material-icons cdb-icon-md' }, 'delete')
            )
      )
    );
  };

  // ==========================================================================
  // SearchModeToggle — numeric vs text search inputs
  // ==========================================================================

  const SearchModeToggle = ({
    searchMode, setSearchMode,
    searchTerm, setSearchTerm,
    difficultySearch, setDifficultySearch,
    qualitySearch, setQualitySearch,
    durabilitySearch, setDurabilitySearch
  }) => {
    return h('div', { className: 'cdb-search-bar' },
      h('div', { className: 'cdb-searchmode-bar' },
        h('span', { className: 'cdb-subheading' }, 'Search Mode'),
        h('button', {
          type: 'button',
          onClick: () => setSearchMode(searchMode === 'numeric' ? 'text' : 'numeric'),
          className: 'cdb-btn cdb-btn-secondary'
        }, `Switch to ${searchMode === 'numeric' ? 'Text' : 'Numeric'} Search`)
      ),
      searchMode === 'numeric'
        ? h('div', { className: 'cdb-numeric-row' },
            h('input', {
              type: 'number',
              placeholder: 'Difficulty (exact)',
              className: 'cdb-input',
              value: difficultySearch,
              onChange: (e) => setDifficultySearch(e.target.value)
            }),
            h('input', {
              type: 'number',
              placeholder: 'Quality (exact)',
              className: 'cdb-input',
              value: qualitySearch,
              onChange: (e) => setQualitySearch(e.target.value)
            }),
            h('input', {
              type: 'number',
              placeholder: 'Durability (exact)',
              className: 'cdb-input',
              value: durabilitySearch,
              onChange: (e) => setDurabilitySearch(e.target.value)
            }),
            h('button', {
              type: 'button',
              onClick: () => {
                setDifficultySearch('');
                setQualitySearch('');
                setDurabilitySearch('');
              },
              className: 'cdb-btn cdb-btn-secondary'
            }, 'Clear')
          )
        : h('input', {
            type: 'text',
            placeholder: 'Search quests, items, or data rewards...',
            className: 'cdb-input',
            value: searchTerm,
            onChange: (e) => setSearchTerm(e.target.value)
          })
    );
  };

  // ==========================================================================
  // Root component
  // ==========================================================================

  const CosmicExplorationDatabase = () => {
    const [macros, setMacros] = useState([]);
    const [hasLoaded, setHasLoaded] = useState(false);

    // Search / filter / sort state
    const [searchMode, setSearchMode]             = useState('numeric');
    const [searchTerm, setSearchTerm]             = useState('');
    const [difficultySearch, setDifficultySearch] = useState('');
    const [qualitySearch, setQualitySearch]       = useState('');
    const [durabilitySearch, setDurabilitySearch] = useState('');
    const [sortBy, setSortBy]                     = useState('questName');
    const [filterCategory, setFilterCategory]     = useState('all');
    const [filterLocation, setFilterLocation]     = useState('all');
    const [filterJob, setFilterJob]               = useState('all');
    const [isAdding, setIsAdding]                 = useState(false);
    const [expandedMacros, setExpandedMacros]     = useState({});

    const addMacro = (formData) => {
      const entry = normalizeEntry({
        ...formData,
        id: makeId(),
        items: formData.items.map(normalizeItem),
        macros: formData.items.map((it, i) => ({
          itemName: it.name,
          macro: formData.macros[i] ? formData.macros[i].macro : ''
        }))
      });
      setMacros(prev => [...prev, entry]);
      setIsAdding(false);
      setExpandedMacros(prev => ({ ...prev, [entry.id]: true }));
    };

    const deleteMacro = (id) => {
      setMacros(prev => prev.filter(m => m.id !== id));
      setExpandedMacros(prev => {
        const { [id]: _removed, ...rest } = prev;
        return rest;
      });
    };

    const updateMacro = (updated) => {
      setMacros(prev => prev.map(m => m.id === updated.id ? updated : m));
    };

    const toggleExpanded = (id) => {
      setExpandedMacros(prev => ({ ...prev, [id]: !prev[id] }));
    };

    useEffect(() => {
      setMacros(loadCosmicData());
      setHasLoaded(true);
    }, []);

    useEffect(() => {
      if (!hasLoaded) return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(macros));
    }, [macros, hasLoaded]);

    // Build location dropdown options from data (split slash-separated values)
    // plus any canonical locations that aren't in the data yet.
    const locationOptions = useMemo(() => {
      const locs = new Set();
      macros.forEach(m => {
        if (m.location && m.location.includes('/')) {
          m.location.split('/').forEach(l => locs.add(l.trim()));
        } else if (m.location) {
          locs.add(m.location);
        }
      });
      LOCATIONS.forEach(l => locs.add(l));
      return ['all', ...Array.from(locs).sort()];
    }, [macros]);

    const filteredMacros = useMemo(() => {
      let filtered = macros;

      if (searchMode === 'text' && searchTerm) {
        const needle = searchTerm.toLowerCase();
        filtered = filtered.filter(macro =>
          (macro.questName || '').toLowerCase().includes(needle) ||
          (macro.items || []).some(item => (item.name || '').toLowerCase().includes(needle)) ||
          (macro.notes || '').toLowerCase().includes(needle) ||
          (macro.dataReward && macro.dataReward.job && macro.dataReward.job.toLowerCase().includes(needle))
        );
      } else if (searchMode === 'numeric') {
        if (difficultySearch) {
          const d = parseInt(difficultySearch);
          filtered = filtered.filter(m => m.items.some(it => it.difficulty === d));
        }
        if (qualitySearch) {
          const q = parseInt(qualitySearch);
          filtered = filtered.filter(m => m.items.some(it => it.quality === q));
        }
        if (durabilitySearch) {
          const du = parseInt(durabilitySearch);
          filtered = filtered.filter(m => m.items.some(it => it.durability === du));
        }
      }

      if (filterCategory !== 'all') {
        filtered = filtered.filter(m => m.category === filterCategory);
      }
      if (filterLocation !== 'all') {
        filtered = filtered.filter(m => (m.location || '').includes(filterLocation));
      }
      if (filterJob !== 'all') {
        filtered = filtered.filter(m => m.job === filterJob);
      }

      const sorted = [...filtered];
      sorted.sort((a, b) => {
        switch (sortBy) {
          case 'questName':
            return (a.questName || '').localeCompare(b.questName || '');
          case 'difficulty': {
            const ma = Math.max(0, ...a.items.map(i => i.difficulty || 0));
            const mb = Math.max(0, ...b.items.map(i => i.difficulty || 0));
            return mb - ma;
          }
          case 'quality': {
            const ma = Math.max(0, ...a.items.map(i => i.quality || 0));
            const mb = Math.max(0, ...b.items.map(i => i.quality || 0));
            return mb - ma;
          }
          case 'category':
            return CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category);
          default:
            return 0;
        }
      });
      return sorted;
    }, [macros, searchTerm, searchMode, sortBy, filterCategory, filterLocation, filterJob, difficultySearch, qualitySearch, durabilitySearch]);

    return h('div', { className: 'cdb-root container' },
      h('header', { className: 'app-header' },
        h('h1', { className: 'app-title craft-name' }, 'FFXIV Cosmic Exploration Macro Database'),
        h('p', { className: 'app-subtitle' }, 'Manage your Cosmic Exploration mission macros')
      ),
      h('div', { className: 'top-controls top-controls-right' },
        h('div', { className: 'action-buttons-top' },
          h('button', {
            onClick: exportToCSV,
            className: 'cdb-btn cdb-btn-secondary'
          },
            h('span', { className: 'material-icons cdb-icon-sm' }, 'download'),
            'Export CSV'
          ),
          h('label', { className: 'cdb-btn cdb-btn-secondary' },
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
      h('div', { className: 'cdb-search-section' },
        h(SearchModeToggle, {
          searchMode, setSearchMode,
          searchTerm, setSearchTerm,
          difficultySearch, setDifficultySearch,
          qualitySearch, setQualitySearch,
          durabilitySearch, setDurabilitySearch
        }),
        h('div', { className: 'filters-row' },
          h('select', {
            value: sortBy,
            onChange: (e) => setSortBy(e.target.value),
            className: 'cdb-select'
          },
            h('option', { value: 'questName' }, 'Sort by Quest Name'),
            h('option', { value: 'category' }, 'Sort by Class (A\u2192D)'),
            h('option', { value: 'difficulty' }, 'Sort by Difficulty'),
            h('option', { value: 'quality' }, 'Sort by Quality')
          ),
          h('select', {
            value: filterCategory,
            onChange: (e) => setFilterCategory(e.target.value),
            className: 'cdb-select'
          },
            h('option', { value: 'all' }, 'All Classes'),
            ...CATEGORIES.map(cat => h('option', { key: cat, value: cat }, cat))
          ),
          h('select', {
            value: filterLocation,
            onChange: (e) => setFilterLocation(e.target.value),
            className: 'cdb-select'
          },
            ...locationOptions.map(loc =>
              h('option', { key: loc, value: loc }, loc === 'all' ? 'All Locations' : loc)
            )
          ),
          h('select', {
            value: filterJob,
            onChange: (e) => setFilterJob(e.target.value),
            className: 'cdb-select'
          },
            h('option', { value: 'all' }, 'All Jobs'),
            ...JOBS.map(job => h('option', { key: job, value: job }, job))
          )
        ),
        h('div', { className: 'add-new-row' },
          h('button', {
            onClick: () => setIsAdding(true),
            className: 'add-new-btn cdb-btn cdb-btn-primary'
          },
            h('span', { className: 'material-icons cdb-icon-sm' }, 'add'),
            'Add New Mission'
          )
        )
      ),
      isAdding && h(CosmicForm, {
        onSave: addMacro,
        onCancel: () => setIsAdding(false)
      }),
      h('div', { style: { margin: '0.5rem 0 1rem', color: 'var(--text-secondary)', fontSize: '0.9rem' } },
        `Found ${filteredMacros.length} mission${filteredMacros.length !== 1 ? 's' : ''}`,
        searchMode === 'numeric' && (difficultySearch || qualitySearch || durabilitySearch) && h('span', { style: { marginLeft: '0.75rem' } },
          difficultySearch && h('span', { style: { marginRight: '0.75rem' } }, `Difficulty = ${difficultySearch}`),
          qualitySearch && h('span', { style: { marginRight: '0.75rem' } }, `Quality = ${qualitySearch}`),
          durabilitySearch && h('span', { style: { marginRight: '0.75rem' } }, `Durability = ${durabilitySearch}`)
        )
      ),
      h('div', { className: 'cdb-craft-list' },
        filteredMacros.length === 0
          ? h('div', { className: 'cdb-empty-state' },
              macros.length === 0
                ? 'No missions yet. Add your first mission above!'
                : 'No missions match your filters.'
            )
          : filteredMacros.map(entry => h(CosmicCard, {
              key: entry.id,
              entry: entry,
              isExpanded: !!expandedMacros[entry.id],
              onToggle: () => toggleExpanded(entry.id),
              onDelete: () => deleteMacro(entry.id),
              onUpdate: updateMacro,
              highlightDifficulty: searchMode === 'numeric' ? difficultySearch : '',
              highlightQuality:    searchMode === 'numeric' ? qualitySearch : '',
              highlightDurability: searchMode === 'numeric' ? durabilitySearch : ''
            }))
      )
    );
  };

  window.CosmicExplorationDatabase = CosmicExplorationDatabase;
  window.CosmicExploration = { exportToCSV, importFromCSV };
})();
