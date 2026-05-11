// ============================================================================
//  Cosmic Exploration Database (v2)
//  --------------------------------------------------------------------------
//  Quest catalog (quests, items, locations, jobs, categories, data rewards) is
//  pulled from the cosmic-exploration Cloudflare Worker, which reads from D1.
//  This page is strictly read-only against that catalog.
//
//  Per-user data lives entirely in localStorage:
//    - foodRequired / foodType   (per quest)
//    - notes                     (per quest)
//    - macro                     (per item)
//  None of that ever leaves the browser.
//
//  Import/Export ties to stable quest_id + item_id so re-imports survive
//  catalog renames. quest_name / item_name are included as a human-readable
//  fallback in case the IDs ever change.
// ============================================================================

(function () {
  const { useState, useEffect, useMemo, useCallback } = React;
  const { createElement: h } = React;

  // --------------------------------------------------------------------------
  // Configuration
  // --------------------------------------------------------------------------

  const API_BASE         = 'https://cosmic-exploration.chlorinatorgreen.workers.dev';
  const USER_STORAGE_KEY = 'cosmic-exploration-v2.userData';
  const CACHE_KEY        = 'cosmic-exploration-v2.cache';
  const V1_STORAGE_KEY   = 'cosmic-exploration-database';

  // Hard-coded only as a fallback before /api/meta resolves; the live meta
  // response from the Worker is authoritative.
  const FALLBACK_FOOD_OPTIONS = [
    'None',
    'Rroneek Steak (HQ)',
    'Ceviche (HQ)',
    'All i Pebre (HQ)'
  ];

  const FALLBACK_DATA_REWARD_LEVELS = [
    { key: 'i',   label: 'I',   accent: 'gray'  },
    { key: 'ii',  label: 'II',  accent: 'tan'   },
    { key: 'iii', label: 'III', accent: 'olive' },
    { key: 'iv',  label: 'IV',  accent: 'plum'  },
    { key: 'v',   label: 'V',   accent: 'rust'  },
    { key: 'vi',  label: 'VI',  accent: 'wine'  }
  ];

  const COSMIC_POINTS_META = { key: 'cosmicPoints', label: 'Points', icon: 'public', accent: 'brown' };

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

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

  const normFoodLabel = (label, foodOptions) => {
    if (!label || label === 'None') return 'None';
    if (foodOptions.includes(label)) return label;
    const withParens = label.replace(/\s+HQ$/, ' (HQ)');
    if (foodOptions.includes(withParens)) return withParens;
    return label; // keep unknown values so user-entered notes don't vanish
  };

  // --------------------------------------------------------------------------
  // User-data store (localStorage)
  //
  //  Shape:
  //    {
  //      version: 1,
  //      byQuest: {
  //        [questId]: {
  //          questName: '...',     // cached for safety net
  //          foodRequired: bool,
  //          foodType: 'None' | '...',
  //          notes: '...',
  //          items: {
  //            [itemId]: { itemName: '...', macro: '...' }
  //          }
  //        }
  //      }
  //    }
  // --------------------------------------------------------------------------

  const emptyUserData = () => ({ version: 1, byQuest: {} });

  const loadUserData = () => {
    try {
      const raw = localStorage.getItem(USER_STORAGE_KEY);
      if (!raw) return emptyUserData();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.byQuest) return emptyUserData();
      return parsed;
    } catch (_e) {
      return emptyUserData();
    }
  };

  const saveUserData = (data) => {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data));
  };

  const getQuestUserRecord = (userData, questId) => userData.byQuest[questId] || null;

  const blankQuestRecord = (quest) => ({
    questName: quest ? quest.questName : '',
    foodRequired: false,
    foodType: 'None',
    notes: '',
    items: {}
  });

  const upsertQuestUser = (userData, questId, mutate) => {
    const current = userData.byQuest[questId] || blankQuestRecord(null);
    const next = mutate({ ...current, items: { ...current.items } });
    return { ...userData, byQuest: { ...userData.byQuest, [questId]: next } };
  };

  const questHasUserData = (rec) => {
    if (!rec) return false;
    if (rec.foodRequired) return true;
    if (rec.foodType && rec.foodType !== 'None') return true;
    if (rec.notes && rec.notes.trim()) return true;
    if (rec.items) {
      for (const it of Object.values(rec.items)) {
        if (it && it.macro && it.macro.trim()) return true;
      }
    }
    return false;
  };

  const questHasMacro = (rec) => {
    if (!rec || !rec.items) return false;
    for (const it of Object.values(rec.items)) {
      if (it && it.macro && it.macro.trim()) return true;
    }
    return false;
  };

  // --------------------------------------------------------------------------
  // Catalog cache (localStorage)
  // --------------------------------------------------------------------------

  const loadCache = () => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.meta || !Array.isArray(parsed.quests)) return null;
      return parsed;
    } catch (_e) {
      return null;
    }
  };

  const saveCache = (meta, quests) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), meta, quests }));
    } catch (_e) { /* quota — non-fatal */ }
  };

  // --------------------------------------------------------------------------
  // Worker fetches
  // --------------------------------------------------------------------------

  const fetchJSON = async (path) => {
    const res = await fetch(API_BASE + path, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) {
      let msg = 'Request failed (' + res.status + ')';
      try { const j = await res.json(); if (j && j.error) msg = j.error; } catch (_e) { /* ignore */ }
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return res.json();
  };

  const fetchCatalog = async () => {
    const [meta, quests] = await Promise.all([
      fetchJSON('/api/meta'),
      fetchJSON('/api/quests')
    ]);
    return { meta, quests };
  };

  // --------------------------------------------------------------------------
  // v1 macro migration
  //
  //  Matches v1 quests to v2 quests by (questName, location, job) and items
  //  by name. Copies food/notes/macros into v2 user storage. Idempotent —
  //  re-running merges without losing existing v2 user edits.
  // --------------------------------------------------------------------------

  const collectV1Entries = () => {
    try {
      const raw = localStorage.getItem(V1_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_e) {
      return [];
    }
  };

  const importFromV1 = (quests, userData) => {
    const v1Entries = collectV1Entries();
    if (v1Entries.length === 0) {
      return { ok: false, message: 'No v1 macros found in localStorage.', updated: userData };
    }

    const norm = (s) => String(s || '').trim().toLowerCase();
    const questIndex = new Map();
    quests.forEach(q => {
      const k = [norm(q.questName), norm(q.location), norm(q.job)].join('|');
      questIndex.set(k, q);
    });

    let updated = userData;
    let matchedQuests = 0;
    let matchedMacros = 0;
    const unmatched = [];

    v1Entries.forEach(v1 => {
      const key = [norm(v1.questName), norm(v1.location), norm(v1.job)].join('|');
      const quest = questIndex.get(key);
      if (!quest) { unmatched.push(v1.questName || '(unnamed)'); return; }
      matchedQuests++;

      const itemByName = new Map();
      quest.items.forEach(it => itemByName.set(norm(it.name), it));

      updated = upsertQuestUser(updated, quest.id, (rec) => {
        const merged = { ...rec };
        merged.questName = quest.questName;
        if (v1.foodRequired) merged.foodRequired = true;
        if (v1.foodType && v1.foodType !== 'None') merged.foodType = v1.foodType;
        if (v1.notes && !merged.notes) merged.notes = v1.notes;

        const v1Items = Array.isArray(v1.items) ? v1.items : [];
        const v1Macros = Array.isArray(v1.macros) ? v1.macros : [];

        v1Items.forEach((v1Item, idx) => {
          const target = itemByName.get(norm(v1Item.name));
          if (!target) return;
          const v1Macro = (v1Macros[idx] && v1Macros[idx].macro) || '';
          if (!v1Macro) return;
          const existing = merged.items[target.id];
          if (existing && existing.macro && existing.macro.trim()) return; // don't overwrite v2 edits
          merged.items = {
            ...merged.items,
            [target.id]: { itemName: target.name, macro: v1Macro }
          };
          matchedMacros++;
        });

        return merged;
      });
    });

    return {
      ok: true,
      updated,
      message: 'Imported ' + matchedMacros + ' macro' + (matchedMacros === 1 ? '' : 's')
        + ' across ' + matchedQuests + ' quest' + (matchedQuests === 1 ? '' : 's') + '.'
        + (unmatched.length ? ' Unmatched: ' + unmatched.length + '.' : '')
    };
  };

  // --------------------------------------------------------------------------
  // Import / Export of user data
  // --------------------------------------------------------------------------

  const exportUserDataJSON = (userData, quests) => {
    const questById = new Map(quests.map(q => [q.id, q]));
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      quests: Object.entries(userData.byQuest)
        .filter(([_id, rec]) => questHasUserData(rec))
        .map(([questId, rec]) => {
          const quest = questById.get(questId);
          return {
            questId,
            questName: (quest && quest.questName) || rec.questName || '',
            foodRequired: !!rec.foodRequired,
            foodType: rec.foodType || 'None',
            notes: rec.notes || '',
            items: Object.entries(rec.items || {}).map(([itemId, item]) => {
              const matched = quest && quest.items.find(qi => qi.id === itemId);
              return {
                itemId,
                itemName: (matched && matched.name) || item.itemName || '',
                macro: item.macro || ''
              };
            })
          };
        })
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = 'cosmic-exploration-v2-' + stamp + '.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const importUserDataJSON = (file, currentUserData, quests, onDone) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      let payload;
      try {
        payload = JSON.parse(e.target.result);
      } catch (_e) {
        alert('Could not parse file as JSON.');
        return;
      }
      if (!payload || !Array.isArray(payload.quests)) {
        alert('Unexpected file shape — expected { quests: [...] }.');
        return;
      }

      const questById = new Map(quests.map(q => [q.id, q]));
      const questByName = new Map();
      quests.forEach(q => {
        const k = String(q.questName || '').trim().toLowerCase();
        if (k) questByName.set(k, q);
      });

      let updated = currentUserData;
      let questCount = 0;
      let macroCount = 0;
      const skipped = [];

      payload.quests.forEach(entry => {
        let quest = questById.get(entry.questId);
        if (!quest && entry.questName) {
          quest = questByName.get(String(entry.questName).trim().toLowerCase());
        }
        if (!quest) { skipped.push(entry.questName || entry.questId || '(unknown)'); return; }
        questCount++;

        const itemById = new Map(quest.items.map(qi => [qi.id, qi]));
        const itemByName = new Map();
        quest.items.forEach(qi => {
          const k = String(qi.name || '').trim().toLowerCase();
          if (k) itemByName.set(k, qi);
        });

        updated = upsertQuestUser(updated, quest.id, (rec) => {
          const merged = { ...rec };
          merged.questName = quest.questName;
          merged.foodRequired = !!entry.foodRequired;
          merged.foodType = entry.foodType || 'None';
          merged.notes = entry.notes || '';

          const items = { ...merged.items };
          (entry.items || []).forEach(it => {
            let target = itemById.get(it.itemId);
            if (!target && it.itemName) target = itemByName.get(String(it.itemName).trim().toLowerCase());
            if (!target) return;
            if (it.macro && it.macro.trim()) {
              items[target.id] = { itemName: target.name, macro: it.macro };
              macroCount++;
            }
          });
          merged.items = items;
          return merged;
        });
      });

      const proceed = confirm(
        'Import ' + macroCount + ' macros across ' + questCount + ' quests?'
        + (skipped.length ? '\n\n' + skipped.length + ' quest(s) had no match in the current catalog and will be skipped.' : '')
        + '\n\nThis will replace your existing notes/food/macros for matched quests.'
      );
      if (!proceed) return;

      saveUserData(updated);
      onDone(updated);
    };
    reader.readAsText(file);
  };

  // --------------------------------------------------------------------------
  // DataRewardChips — display-only in v2 (no editing of canonical data)
  // --------------------------------------------------------------------------

  const DataRewardChips = ({ dataReward, levels }) => {
    const nonZero = levels.filter(level => (dataReward[level.key] || 0) > 0);
    const hasPoints = (dataReward.cosmicPoints || 0) > 0;
    if (nonZero.length === 0 && !hasPoints) return null;

    return h('div', { className: 'cdb-data-chip-row' },
      ...nonZero.map(level =>
        h('span', { key: level.key, className: 'cdb-data-chip cdb-data-chip--' + level.accent },
          h('span', { className: 'cdb-data-chip-label' }, level.label),
          h('span', { className: 'cdb-data-chip-count' }, '× ' + dataReward[level.key])
        )
      ),
      hasPoints && h('span', { className: 'cdb-data-chip cdb-data-chip--' + COSMIC_POINTS_META.accent },
        h('span', { className: 'material-icons cdb-icon-xs' }, COSMIC_POINTS_META.icon),
        h('span', { className: 'cdb-data-chip-label' }, COSMIC_POINTS_META.label),
        h('span', { className: 'cdb-data-chip-count' }, '× ' + dataReward.cosmicPoints)
      )
    );
  };

  // --------------------------------------------------------------------------
  // FilterChips — toggleable pill row
  // --------------------------------------------------------------------------

  const FilterChips = ({ label, options, active, onChange }) => {
    return h('div', { className: 'cdb-filter-chip-row' },
      h('span', { className: 'cdb-filter-chip-label' }, label),
      h('button', {
        type: 'button',
        onClick: () => onChange('all'),
        className: 'cdb-filter-chip' + (active === 'all' ? ' cdb-filter-chip--active' : '')
      }, 'All'),
      ...options.map(opt =>
        h('button', {
          key: opt,
          type: 'button',
          onClick: () => onChange(opt),
          className: 'cdb-filter-chip' + (active === opt ? ' cdb-filter-chip--active' : '')
        }, opt)
      )
    );
  };

  // --------------------------------------------------------------------------
  // QuestCard — read-only quest header + per-user editable body
  // --------------------------------------------------------------------------

  const QuestCard = ({
    quest, jobIcon, userRecord, foodOptions, dataRewardLevels,
    isExpanded, onToggle, onUserChange,
    highlightDifficulty, highlightQuality, highlightDurability
  }) => {
    const [copiedItemId, setCopiedItemId] = useState(null);
    const [copiedChunkId, setCopiedChunkId] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [draft, setDraft] = useState(null);

    const startEdit = () => {
      const base = userRecord || blankQuestRecord(quest);
      setDraft({
        foodRequired: !!base.foodRequired,
        foodType: base.foodType || 'None',
        notes: base.notes || '',
        items: { ...(base.items || {}) }
      });
      setIsEditing(true);
      if (!isExpanded) onToggle();
    };

    const cancelEdit = () => { setDraft(null); setIsEditing(false); };

    const saveEdit = () => {
      const cleaned = {
        questName: quest.questName,
        foodRequired: !!draft.foodRequired,
        foodType: draft.foodRequired ? (draft.foodType || 'None') : 'None',
        notes: draft.notes || '',
        items: {}
      };
      Object.entries(draft.items || {}).forEach(([itemId, val]) => {
        if (val && val.macro && val.macro.trim()) {
          const matched = quest.items.find(it => it.id === itemId);
          cleaned.items[itemId] = {
            itemName: matched ? matched.name : (val.itemName || ''),
            macro: val.macro
          };
        }
      });
      onUserChange(quest.id, cleaned);
      setIsEditing(false);
      setDraft(null);
    };

    const copyText = (text, markerSetter, markerValue) => {
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => {
        markerSetter(markerValue);
        setTimeout(() => markerSetter(null), 1500);
      });
    };

    const rec = userRecord || blankQuestRecord(quest);
    const showFoodBadge = rec.foodRequired && rec.foodType && rec.foodType !== 'None';

    const header = h('div', {
      className: 'craft-card-header ' + (isExpanded ? 'expanded' : ''),
      onClick: onToggle,
      style: { borderColor: isExpanded ? '#C5B89A' : 'transparent', paddingRight: '80px', position: 'relative' }
    },
      h('div', { className: 'craft-title-section' },
        h('h3', { className: 'craft-name' }, quest.questName || '(unnamed)')
      ),
      h('div', { className: 'craft-meta-section' },
        h('div', { className: 'cdb-badge-row' },
          h('span', { className: 'cdb-badge cdb-badge--location' },
            h('span', { className: 'material-icons cdb-icon-xs' }, 'public'),
            quest.location || '—'
          ),
          h('span', { className: 'cdb-badge cdb-badge--job' },
            h('span', { className: 'material-icons cdb-icon-xs' }, jobIcon || 'build'),
            quest.job || '—'
          ),
          h('span', { className: categoryBadgeClass(quest.category) }, quest.category || '—'),
          showFoodBadge && h('span', { className: 'cdb-badge cdb-badge--food' },
            h('span', { className: 'material-icons cdb-icon-xs' }, 'restaurant'),
            rec.foodType
          )
        ),
        h('button', {
          onClick: (e) => { e.stopPropagation(); onToggle(); },
          className: 'cdb-btn cdb-btn-secondary',
          style: {
            padding: '8px', position: 'absolute', right: '0', top: '50%',
            transform: 'translateY(-50%) translateX(50%)', zIndex: 10
          },
          title: isExpanded ? 'Collapse' : 'Expand'
        },
          h('span', { className: 'material-icons cdb-icon-md' }, isExpanded ? 'expand_less' : 'expand_more')
        )
      )
    );

    // Per-item copy strip when collapsed
    const collapsedBody = !isExpanded && h('div', {
      className: 'cdb-inline-row',
      style: { padding: '0 1rem 0.75rem', flexWrap: 'wrap', gap: '0.4rem' }
    },
      h('span', { style: { fontSize: '0.8rem', color: 'var(--text-secondary)' } }, 'Crafts:'),
      ...(quest.items || []).map((item) => {
        const userItem = rec.items[item.id];
        const macroText = (userItem && userItem.macro) || '';
        const markerValue = quest.id + '-' + item.id;
        return h('button', {
          key: item.id,
          onClick: (e) => { e.stopPropagation(); copyText(macroText, setCopiedItemId, markerValue); },
          className: 'cdb-copy-btn',
          title: macroText ? 'Copy macro' : 'No macro saved for this item',
          disabled: !macroText,
          style: !macroText ? { opacity: 0.55, cursor: 'default' } : null
        },
          h('span', { className: 'material-icons cdb-icon-xs' },
            copiedItemId === markerValue ? 'check' : 'content_copy'
          ),
          item.name || 'Item'
        );
      })
    );

    if (!isExpanded) {
      return h('div', { className: 'craft-card', style: { overflow: 'visible' } },
        header,
        collapsedBody
      );
    }

    // Expanded — stat matching for numeric search
    const matches = (val, hl) => hl && val && parseInt(hl) === val;
    const statClass = (m) => 'cdb-cosmic-item-stat' + (m ? ' cdb-cosmic-item-stat--match' : '');

    const editBody = isEditing && h('div', { className: 'cdb-form-fields' },
      h('div', { className: 'cdb-field-group' },
        h('div', { className: 'cdb-inline-row' },
          h('input', {
            type: 'checkbox',
            id: 'foodRequired-' + quest.id,
            checked: !!draft.foodRequired,
            onChange: (e) => setDraft(d => ({ ...d, foodRequired: e.target.checked })),
            className: 'cdb-checkbox'
          }),
          h('label', { htmlFor: 'foodRequired-' + quest.id, className: 'cdb-label' }, 'Food Required')
        ),
        draft.foodRequired && h('select', {
          value: draft.foodType,
          onChange: (e) => setDraft(d => ({ ...d, foodType: e.target.value })),
          className: 'cdb-input'
        },
          // include current value even if it isn't in the canonical list,
          // so legacy/custom food labels survive editing
          !foodOptions.includes(draft.foodType) && draft.foodType &&
            h('option', { value: draft.foodType }, draft.foodType),
          ...foodOptions.map(food => h('option', { key: food, value: food }, food))
        )
      ),
      h('div', null,
        h('label', { className: 'cdb-label' }, 'Macros'),
        ...quest.items.map((item) => {
          const cur = draft.items[item.id] || { itemName: item.name, macro: '' };
          return h('div', { key: item.id, style: { marginBottom: '0.75rem' } },
            h('label', { className: 'cdb-label-xs' }, 'Macro for ' + (item.name || 'Item')),
            h('textarea', {
              className: 'cdb-input cdb-input-mono',
              rows: 6,
              value: cur.macro || '',
              onChange: (e) => setDraft(d => ({
                ...d,
                items: { ...d.items, [item.id]: { itemName: item.name, macro: e.target.value } }
              })),
              placeholder: '/ac "Muscle Memory" <wait.3>'
            })
          );
        })
      ),
      h('div', null,
        h('label', { className: 'cdb-label' }, 'Notes'),
        h('textarea', {
          className: 'cdb-input',
          rows: 3,
          value: draft.notes || '',
          onChange: (e) => setDraft(d => ({ ...d, notes: e.target.value })),
          placeholder: 'Personal notes for this quest...'
        })
      ),
      h('div', { className: 'cdb-form-actions' },
        h('button', { type: 'button', onClick: cancelEdit, className: 'cdb-btn cdb-btn-secondary' }, 'Cancel'),
        h('button', { type: 'button', onClick: saveEdit, className: 'cdb-btn cdb-btn-primary' }, 'Save')
      )
    );

    return h('div', { className: 'craft-card', style: { overflow: 'visible' } },
      header,
      h('div', { className: 'cdb-card-body' },
        isEditing && editBody,
        !isEditing && quest.items && quest.items.length > 0 && h('div', null,
          h('h4', { className: 'cdb-subheading' }, 'Items'),
          h('div', { className: 'cdb-cosmic-item-grid' },
            ...quest.items.map(item =>
              h('div', { key: item.id, className: 'cdb-cosmic-item-card' },
                h('div', { className: 'cdb-cosmic-item-name' }, item.name || 'Item'),
                h('div', { className: statClass(matches(item.difficulty, highlightDifficulty)) },
                  'Difficulty: ', h('span', { className: 'cdb-stat-value' }, item.difficulty || 0)
                ),
                h('div', { className: statClass(matches(item.quality, highlightQuality)) },
                  'Quality: ', h('span', { className: 'cdb-stat-value' }, item.quality || 0)
                ),
                h('div', { className: statClass(matches(item.durability, highlightDurability)) },
                  'Durability: ', h('span', { className: 'cdb-stat-value' }, item.durability || 0)
                )
              )
            )
          )
        ),
        !isEditing && h('div', null,
          h('h4', { className: 'cdb-subheading' }, 'Data Reward (' + quest.job + ')'),
          h(DataRewardChips, { dataReward: quest.dataReward || {}, levels: dataRewardLevels })
            || h('span', { style: { color: 'var(--text-secondary)', fontSize: '0.85rem' } }, '(none)')
        ),
        !isEditing && questHasMacro(rec) && h('div', null,
          h('h4', { className: 'cdb-subheading' }, 'My Macros'),
          ...quest.items.map(item => {
            const userItem = rec.items[item.id];
            const macroText = (userItem && userItem.macro) || '';
            if (!macroText) return null;
            const chunks = splitMacroIntoChunks(macroText);
            return h('div', { key: item.id, style: { marginBottom: '0.75rem' } },
              quest.items.length > 1 && h('div', {
                style: { fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }
              }, item.name || 'Item'),
              h('div', { className: 'cdb-macro-grid' },
                ...chunks.map((chunk, chunkIdx) => {
                  const markerValue = quest.id + '-' + item.id + '-' + chunkIdx;
                  return h('div', { key: chunkIdx, className: 'cdb-macro-chunk' },
                    h('div', { className: 'cdb-macro-header' },
                      h('span', { className: 'cdb-macro-label' },
                        chunks.length > 1 ? 'Macro ' + (chunkIdx + 1) : 'Macro'
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
        !isEditing && rec.notes && rec.notes.trim() && h('div', null,
          h('h4', { className: 'cdb-subheading' }, 'Notes'),
          h('p', { className: 'cdb-notes-text' }, rec.notes)
        )
      ),
      !isEditing && h('div', { className: 'cdb-card-footer' },
        h('span', {
          onClick: (e) => { e.stopPropagation(); startEdit(); },
          className: 'material-icons cdb-icon-btn',
          style: { color: 'var(--accent-brown)', fontSize: '24px' },
          title: questHasUserData(rec) ? 'Edit my macros / notes' : 'Add my macros / notes'
        }, 'edit')
      )
    );
  };

  // --------------------------------------------------------------------------
  // Root component
  // --------------------------------------------------------------------------

  const CosmicExplorationDatabaseV2 = () => {
    const cached = useMemo(loadCache, []);

    const [quests, setQuests] = useState(cached ? cached.quests : []);
    const [meta, setMeta]     = useState(cached ? cached.meta   : null);
    const [loadState, setLoadState] = useState(cached ? 'ready' : 'loading');
    const [loadError, setLoadError] = useState('');

    const [userData, setUserData] = useState(loadUserData);

    // Search / filter state
    const [searchMode, setSearchMode]             = useState('numeric');
    const [searchTerm, setSearchTerm]             = useState('');
    const [difficultySearch, setDifficultySearch] = useState('');
    const [qualitySearch, setQualitySearch]       = useState('');
    const [durabilitySearch, setDurabilitySearch] = useState('');
    const [sortBy, setSortBy]                     = useState('questName');
    const [filterCategory, setFilterCategory]     = useState('all');
    const [filterLocation, setFilterLocation]     = useState('all');
    const [filterJob, setFilterJob]               = useState('all');
    const [onlyWithMacro, setOnlyWithMacro]       = useState(false);

    const [expanded, setExpanded] = useState({});
    const [migrationMsg, setMigrationMsg] = useState('');

    const toggleExpanded = useCallback((id) => {
      setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
    }, []);

    // Initial fetch (refresh even if cache exists, so data stays current)
    useEffect(() => {
      let cancelled = false;
      fetchCatalog().then(({ meta, quests }) => {
        if (cancelled) return;
        setMeta(meta);
        setQuests(quests);
        setLoadState('ready');
        saveCache(meta, quests);
      }).catch(err => {
        if (cancelled) return;
        if (cached) {
          // Already showing cached data; surface a quiet refresh error.
          setLoadError('Showing cached data — could not refresh: ' + err.message);
        } else {
          setLoadState('error');
          setLoadError(err.message || 'Failed to load catalog');
        }
      });
      return () => { cancelled = true; };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const persistUserData = (next) => {
      setUserData(next);
      saveUserData(next);
    };

    const handleUserChange = (questId, record) => {
      persistUserData({ ...userData, byQuest: { ...userData.byQuest, [questId]: record } });
    };

    const handleImportV1 = () => {
      if (!quests || quests.length === 0) {
        alert('Quest catalog has not loaded yet. Try again in a moment.');
        return;
      }
      const v1 = collectV1Entries();
      if (v1.length === 0) {
        alert('No v1 macros found in localStorage.');
        return;
      }
      if (!confirm('Import macros, food, and notes from your v1 Cosmic Exploration database?\n\nQuests are matched by (Quest Name + Location + Job); items by name.\nExisting v2 macros are kept; v1 data only fills in blanks.')) return;
      const result = importFromV1(quests, userData);
      if (!result.ok) { alert(result.message); return; }
      persistUserData(result.updated);
      setMigrationMsg(result.message);
    };

    const handleExport = () => {
      if (!quests || quests.length === 0) {
        alert('Quest catalog has not loaded yet.');
        return;
      }
      exportUserDataJSON(userData, quests);
    };

    const handleImportFile = (file) => {
      if (!quests || quests.length === 0) {
        alert('Quest catalog has not loaded yet.');
        return;
      }
      importUserDataJSON(file, userData, quests, (next) => {
        setUserData(next);
        setMigrationMsg('Import complete.');
      });
    };

    const handleClearLocal = () => {
      if (!confirm('Delete all locally saved macros, food choices, and notes? This cannot be undone.')) return;
      const empty = emptyUserData();
      saveUserData(empty);
      setUserData(empty);
    };

    // Resolve meta-driven option lists
    const jobIconByName = useMemo(() => {
      const m = new Map();
      (meta && meta.jobs || []).forEach(j => m.set(j.name, j.icon));
      return m;
    }, [meta]);

    const jobOptions = useMemo(
      () => (meta && meta.jobs || []).map(j => j.name),
      [meta]
    );
    const locationOptions = useMemo(
      () => (meta && meta.locations || []).map(l => l.name),
      [meta]
    );
    const categoryOptions = useMemo(
      () => (meta && meta.categories || []).map(c => c.name),
      [meta]
    );
    const dataRewardLevels = useMemo(
      () => (meta && meta.dataRewardLevels) || FALLBACK_DATA_REWARD_LEVELS,
      [meta]
    );
    const foodOptions = FALLBACK_FOOD_OPTIONS;

    const filtered = useMemo(() => {
      let list = quests.slice();

      if (searchMode === 'text' && searchTerm) {
        const needle = searchTerm.toLowerCase();
        list = list.filter(q =>
          (q.questName || '').toLowerCase().includes(needle) ||
          (q.items || []).some(it => (it.name || '').toLowerCase().includes(needle)) ||
          (q.job || '').toLowerCase().includes(needle)
        );
      } else if (searchMode === 'numeric') {
        if (difficultySearch) {
          const d = parseInt(difficultySearch);
          list = list.filter(q => q.items.some(it => it.difficulty === d));
        }
        if (qualitySearch) {
          const v = parseInt(qualitySearch);
          list = list.filter(q => q.items.some(it => it.quality === v));
        }
        if (durabilitySearch) {
          const v = parseInt(durabilitySearch);
          list = list.filter(q => q.items.some(it => it.durability === v));
        }
      }

      if (filterCategory !== 'all') list = list.filter(q => q.category === filterCategory);
      if (filterLocation !== 'all') list = list.filter(q => q.location === filterLocation);
      if (filterJob !== 'all')      list = list.filter(q => q.job === filterJob);

      if (onlyWithMacro) {
        list = list.filter(q => questHasMacro(userData.byQuest[q.id]));
      }

      const categoryOrder = categoryOptions.length ? categoryOptions : [];
      const catRank = (name) => {
        const i = categoryOrder.indexOf(name);
        return i === -1 ? 999 : i;
      };

      list.sort((a, b) => {
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
            return catRank(a.category) - catRank(b.category);
          default:
            return 0;
        }
      });

      return list;
    }, [
      quests, userData, categoryOptions,
      searchMode, searchTerm, sortBy,
      difficultySearch, qualitySearch, durabilitySearch,
      filterCategory, filterLocation, filterJob, onlyWithMacro
    ]);

    return h('div', { className: 'cdb-root container' },
      h('header', { className: 'app-header' },
        h('h1', { className: 'app-title craft-name' }, 'FFXIV Cosmic Exploration Database'),
        h('p', { className: 'app-subtitle' }, 'Shared mission catalog · your macros saved locally')
      ),

      h('div', { className: 'top-controls top-controls-right' },
        h('div', { className: 'action-buttons-top' },
          h('button', { onClick: handleImportV1, className: 'cdb-btn cdb-btn-secondary', title: 'Bring over macros/food/notes from the v1 page' },
            h('span', { className: 'material-icons cdb-icon-sm' }, 'history'),
            'Import from v1'
          ),
          h('button', { onClick: handleExport, className: 'cdb-btn cdb-btn-secondary' },
            h('span', { className: 'material-icons cdb-icon-sm' }, 'download'),
            'Export My Data'
          ),
          h('label', { className: 'cdb-btn cdb-btn-secondary' },
            h('span', { className: 'material-icons cdb-icon-sm' }, 'upload'),
            'Import JSON',
            h('input', {
              type: 'file', accept: '.json,application/json',
              onChange: (e) => {
                const file = e.target.files[0];
                if (file) handleImportFile(file);
                e.target.value = '';
              },
              style: { display: 'none' }
            })
          ),
          h('button', { onClick: handleClearLocal, className: 'cdb-btn cdb-btn-secondary',
            style: { color: 'var(--accent-red)', borderColor: 'var(--accent-red)' } },
            h('span', { className: 'material-icons cdb-icon-sm' }, 'delete_sweep'),
            'Clear My Data'
          )
        )
      ),

      migrationMsg && h('div', {
        style: { margin: '0.5rem 0', padding: '0.5rem 0.75rem', borderRadius: '0.375rem',
                 background: 'var(--bg-darker)', color: 'var(--text-secondary)', fontSize: '0.9rem' }
      }, migrationMsg),

      loadState === 'error' && h('div', {
        style: { margin: '0.5rem 0', padding: '0.75rem 1rem', borderRadius: '0.375rem',
                 background: 'var(--bg-darker)', color: 'var(--accent-red)' }
      }, 'Could not load catalog: ' + (loadError || 'unknown error')),

      loadError && loadState === 'ready' && h('div', {
        style: { margin: '0.5rem 0', padding: '0.5rem 0.75rem', borderRadius: '0.375rem',
                 background: 'var(--bg-darker)', color: 'var(--text-secondary)', fontSize: '0.85rem' }
      }, loadError),

      h('div', { className: 'cdb-search-section' },
        h('div', { className: 'cdb-search-bar' },
          h('div', { className: 'cdb-searchmode-bar' },
            h('span', { className: 'cdb-subheading' }, 'Search Mode'),
            h('button', {
              type: 'button',
              onClick: () => setSearchMode(searchMode === 'numeric' ? 'text' : 'numeric'),
              className: 'cdb-btn cdb-btn-secondary'
            }, 'Switch to ' + (searchMode === 'numeric' ? 'Text' : 'Numeric') + ' Search')
          ),
          searchMode === 'numeric'
            ? h('div', { className: 'cdb-numeric-row' },
                h('input', { type: 'number', placeholder: 'Difficulty (exact)', className: 'cdb-input',
                  value: difficultySearch, onChange: (e) => setDifficultySearch(e.target.value) }),
                h('input', { type: 'number', placeholder: 'Quality (exact)', className: 'cdb-input',
                  value: qualitySearch, onChange: (e) => setQualitySearch(e.target.value) }),
                h('input', { type: 'number', placeholder: 'Durability (exact)', className: 'cdb-input',
                  value: durabilitySearch, onChange: (e) => setDurabilitySearch(e.target.value) }),
                h('button', {
                  type: 'button',
                  onClick: () => { setDifficultySearch(''); setQualitySearch(''); setDurabilitySearch(''); },
                  className: 'cdb-btn cdb-btn-secondary'
                }, 'Clear')
              )
            : h('input', {
                type: 'text', placeholder: 'Search quests, items, or job...', className: 'cdb-input',
                value: searchTerm, onChange: (e) => setSearchTerm(e.target.value)
              })
        ),

        h('div', { className: 'filters-row' },
          h('select', { value: sortBy, onChange: (e) => setSortBy(e.target.value), className: 'cdb-select' },
            h('option', { value: 'questName' }, 'Sort by Quest Name'),
            h('option', { value: 'category' }, 'Sort by Class (A→D)'),
            h('option', { value: 'difficulty' }, 'Sort by Difficulty'),
            h('option', { value: 'quality' }, 'Sort by Quality')
          ),
          h('label', {
            className: 'cdb-inline-row',
            style: { gap: '0.4rem', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-secondary)' }
          },
            h('input', {
              type: 'checkbox',
              className: 'cdb-checkbox',
              checked: onlyWithMacro,
              onChange: (e) => setOnlyWithMacro(e.target.checked)
            }),
            'Only quests with my macros'
          )
        ),

        categoryOptions.length > 0 && h(FilterChips, {
          label: 'Class', options: categoryOptions, active: filterCategory, onChange: setFilterCategory
        }),
        locationOptions.length > 0 && h(FilterChips, {
          label: 'Location', options: locationOptions, active: filterLocation, onChange: setFilterLocation
        }),
        jobOptions.length > 0 && h(FilterChips, {
          label: 'Job', options: jobOptions, active: filterJob, onChange: setFilterJob
        })
      ),

      h('div', { style: { margin: '0.5rem 0 1rem', color: 'var(--text-secondary)', fontSize: '0.9rem' } },
        loadState === 'loading'
          ? 'Loading catalog…'
          : 'Found ' + filtered.length + ' mission' + (filtered.length !== 1 ? 's' : '')
            + (quests.length ? ' · ' + quests.length + ' total' : '')
      ),

      h('div', { className: 'cdb-craft-list' },
        loadState === 'loading' && quests.length === 0
          ? h('div', { className: 'cdb-empty-state' }, 'Loading…')
          : filtered.length === 0
            ? h('div', { className: 'cdb-empty-state' },
                quests.length === 0
                  ? 'No quests in the catalog yet.'
                  : 'No quests match your filters.'
              )
            : filtered.map(quest => h(QuestCard, {
                key: quest.id,
                quest,
                jobIcon: jobIconByName.get(quest.job) || 'build',
                userRecord: userData.byQuest[quest.id] || null,
                foodOptions,
                dataRewardLevels,
                isExpanded: !!expanded[quest.id],
                onToggle: () => toggleExpanded(quest.id),
                onUserChange: handleUserChange,
                highlightDifficulty: searchMode === 'numeric' ? difficultySearch : '',
                highlightQuality:    searchMode === 'numeric' ? qualitySearch    : '',
                highlightDurability: searchMode === 'numeric' ? durabilitySearch : ''
              }))
      )
    );
  };

  window.CosmicExplorationDatabaseV2 = CosmicExplorationDatabaseV2;
})();
