// ============================================================================
//  PVAdminCosmicExploration — Cosmic Exploration quest catalog editor
//
//  Worker (cosmic-exploration.chlorinatorgreen.workers.dev) routes used:
//    GET    /api/meta                       public
//    GET    /api/quests                     public
//    POST   /api/admin/quests               admin | officer
//    PUT    /api/admin/quests/:id           admin | officer
//    DELETE /api/admin/quests/:id           admin | officer
//
//  Auth: forwards the PVAdminAPI session bearer to the cosmic Worker, which
//  validates it against pv-med-database-worker /me.
//
//  Note: this Worker is separate from pv-med-database-worker, so calls go
//  through cosmicRequest (defined below) instead of PVAdminAPI.request.
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useMemo = React.useMemo;

  var COSMIC_API_BASE = 'https://cosmic-exploration.chlorinatorgreen.workers.dev';
  var FILTER_STORAGE_KEY = 'pv-admin.cosmic-exploration.filters';

  function loadFilters() {
    var defaults = { query: '', filterJob: 'all', filterLoc: 'all', filterCat: 'all' };
    try {
      var raw = localStorage.getItem(FILTER_STORAGE_KEY);
      if (!raw) return defaults;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return defaults;
      return Object.assign(defaults, parsed);
    } catch (_e) {
      return defaults;
    }
  }

  function saveFilters(filters) {
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
    } catch (_e) { /* quota — non-fatal */ }
  }

  var DATA_REWARD_LEVELS = [
    { key: 'i',   label: 'I'   },
    { key: 'ii',  label: 'II'  },
    { key: 'iii', label: 'III' },
    { key: 'iv',  label: 'IV'  },
    { key: 'v',   label: 'V'   },
    { key: 'vi',  label: 'VI'  },
    { key: 'vii', label: 'VII' }
  ];

  // ── Worker request helper ───────────────────────────────────────────────────

  async function cosmicRequest(method, path, body, authed) {
    var headers = { 'Accept': 'application/json' };
    if (body !== undefined && body !== null) headers['Content-Type'] = 'application/json';
    if (authed) {
      var s = PVAdminAPI.getSession();
      if (!s) {
        PVAdminAPI.redirectToLogin();
        throw new Error('Session expired. Please sign in again.');
      }
      headers['Authorization'] = 'Bearer ' + s.token;
    }

    var res = await fetch(COSMIC_API_BASE + path, {
      method: method,
      headers: headers,
      body: (body === undefined || body === null) ? undefined : JSON.stringify(body)
    });

    if (res.status === 401 && authed) {
      PVAdminAPI.clearSession();
      PVAdminAPI.redirectToLogin();
      throw new Error('Your session is no longer valid. Please sign in again.');
    }

    var text = await res.text();
    var data = null;
    if (text) {
      try { data = JSON.parse(text); } catch (_e) { data = { raw: text }; }
    }
    if (!res.ok) {
      var msg = (data && (data.error || data.message)) || ('Request failed (' + res.status + ')');
      var e = new Error(msg);
      e.status = res.status;
      throw e;
    }
    return data;
  }

  // ── Draft helpers ───────────────────────────────────────────────────────────

  function emptyDataReward() {
    var dr = { cosmicPoints: 0 };
    DATA_REWARD_LEVELS.forEach(function (l) { dr[l.key] = 0; });
    return dr;
  }

  function emptyDraft(meta) {
    var firstLoc = (meta && meta.locations && meta.locations[0] && meta.locations[0].name) || '';
    var firstJob = (meta && meta.jobs && meta.jobs[0] && meta.jobs[0].name) || '';
    var firstCat = (meta && meta.categories && meta.categories[0] && meta.categories[0].name) || '';
    return {
      questName: '',
      location:  firstLoc,
      job:       firstJob,
      category:  firstCat,
      items: [{ id: null, name: '', difficulty: '', quality: '', durability: '' }],
      dataReward: emptyDataReward()
    };
  }

  function questToDraft(q) {
    if (!q) return emptyDraft(null);
    var items = (Array.isArray(q.items) && q.items.length ? q.items : [{}]).map(function (it) {
      return {
        id: it.id || null,
        name: it.name || '',
        difficulty: it.difficulty != null ? String(it.difficulty) : '',
        quality:    it.quality    != null ? String(it.quality)    : '',
        durability: it.durability != null ? String(it.durability) : ''
      };
    });
    var dr = Object.assign(emptyDataReward(), q.dataReward || {});
    return {
      id: q.id,
      questName: q.questName || '',
      location:  q.location  || '',
      job:       q.job       || '',
      category:  q.category  || '',
      items: items,
      dataReward: dr
    };
  }

  function draftToPayload(draft) {
    return {
      questName: draft.questName.trim(),
      location:  draft.location,
      job:       draft.job,
      category:  draft.category,
      items: draft.items.map(function (it) {
        var out = {
          name: (it.name || '').trim(),
          difficulty: it.difficulty === '' ? 0 : (Number(it.difficulty) || 0),
          quality:    it.quality    === '' ? 0 : (Number(it.quality)    || 0),
          durability: it.durability === '' ? 0 : (Number(it.durability) || 0)
        };
        if (it.id) out.id = it.id; // preserve so user macros keep working
        return out;
      }),
      dataReward: {
        i:   Number(draft.dataReward.i)   || 0,
        ii:  Number(draft.dataReward.ii)  || 0,
        iii: Number(draft.dataReward.iii) || 0,
        iv:  Number(draft.dataReward.iv)  || 0,
        v:   Number(draft.dataReward.v)   || 0,
        vi:  Number(draft.dataReward.vi)  || 0,
        vii: Number(draft.dataReward.vii) || 0,
        cosmicPoints: Number(draft.dataReward.cosmicPoints) || 0
      }
    };
  }

  // ── Form ────────────────────────────────────────────────────────────────────

  function QuestForm(props) {
    var initial = props.initial;
    var meta    = props.meta;
    var onSubmit = props.onSubmit;
    var onCancel = props.onCancel;
    var isEdit = !!(initial && initial.id);

    var draftState = useState(initial ? questToDraft(initial) : emptyDraft(meta));
    var draft = draftState[0], setDraft = draftState[1];
    var savingState = useState(false);
    var saving = savingState[0], setSaving = savingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];

    function setField(k, v) {
      setDraft(function (d) { return Object.assign({}, d, { [k]: v }); });
    }

    function setItem(idx, k, v) {
      setDraft(function (d) {
        var items = d.items.slice();
        items[idx] = Object.assign({}, items[idx], { [k]: v });
        return Object.assign({}, d, { items: items });
      });
    }

    function addItem() {
      setDraft(function (d) {
        return Object.assign({}, d, {
          items: d.items.concat([{ id: null, name: '', difficulty: '', quality: '', durability: '' }])
        });
      });
    }

    function removeItem(idx) {
      setDraft(function (d) {
        if (d.items.length <= 1) return d;
        return Object.assign({}, d, {
          items: d.items.filter(function (_it, i) { return i !== idx; })
        });
      });
    }

    function setReward(k, v) {
      setDraft(function (d) {
        return Object.assign({}, d, {
          dataReward: Object.assign({}, d.dataReward, { [k]: v })
        });
      });
    }

    async function handleSubmit(e) {
      e.preventDefault();
      if (!draft.questName.trim()) { setErr('Quest name is required.'); return; }
      if (!draft.location) { setErr('Location is required.'); return; }
      if (!draft.job)      { setErr('Job is required.'); return; }
      if (!draft.category) { setErr('Category is required.'); return; }
      if (!draft.items.length || !draft.items[0].name.trim()) {
        setErr('At least one item with a name is required.');
        return;
      }
      for (var i = 0; i < draft.items.length; i++) {
        if (!draft.items[i].name.trim()) {
          setErr('Item ' + (i + 1) + ' is missing a name.');
          return;
        }
      }
      setSaving(true); setErr('');
      try {
        await onSubmit(draftToPayload(draft));
      } catch (e2) {
        setErr(e2.message || 'Failed to save quest.');
        setSaving(false);
      }
    }

    var jobs       = (meta && meta.jobs)       || [];
    var locations  = (meta && meta.locations)  || [];
    var categories = (meta && meta.categories) || [];

    return h('form', { onSubmit: handleSubmit },
      err ? h('div', { className: 'portal-flash error' }, err) : null,

      h('div', { className: 'portal-field' },
        h('label', null, 'Quest Name *'),
        h('input', {
          type: 'text', maxLength: 200,
          value: draft.questName,
          onChange: function (e) { setField('questName', e.target.value); },
          required: true
        })
      ),

      h('div', {
        style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))', gap: '0.75rem' }
      },
        h('div', { className: 'portal-field' },
          h('label', null, 'Location *'),
          h('select', {
            value: draft.location,
            onChange: function (e) { setField('location', e.target.value); }
          },
            locations.map(function (l) {
              return h('option', { key: l.name, value: l.name }, l.name);
            })
          )
        ),
        h('div', { className: 'portal-field' },
          h('label', null, 'Job *'),
          h('select', {
            value: draft.job,
            onChange: function (e) { setField('job', e.target.value); }
          },
            jobs.map(function (j) {
              return h('option', { key: j.name, value: j.name }, j.name);
            })
          )
        ),
        h('div', { className: 'portal-field' },
          h('label', null, 'Category *'),
          h('select', {
            value: draft.category,
            onChange: function (e) { setField('category', e.target.value); }
          },
            categories.map(function (c) {
              return h('option', { key: c.name, value: c.name }, c.name);
            })
          )
        )
      ),

      h('div', { className: 'portal-field' },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' } },
          h('label', { style: { margin: 0 } }, 'Items *'),
          h('button', {
            type: 'button',
            className: 'portal-btn is-small is-ghost',
            onClick: addItem
          }, '+ Add item')
        ),
        draft.items.map(function (it, idx) {
          return h('div', {
            key: idx,
            style: {
              padding: '0.65rem', marginBottom: '0.55rem',
              background: 'var(--bg-darker)', borderRadius: '0.35rem'
            }
          },
            h('div', {
              style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(8rem, 1fr))', gap: '0.5rem' }
            },
              h('div', { className: 'portal-field', style: { gridColumn: '1 / -1' } },
                h('label', null, 'Item name'),
                h('input', {
                  type: 'text', maxLength: 200,
                  value: it.name,
                  onChange: function (e) { setItem(idx, 'name', e.target.value); }
                })
              ),
              h('div', { className: 'portal-field' },
                h('label', null, 'Difficulty'),
                h('input', {
                  type: 'number', min: 0,
                  value: it.difficulty,
                  onChange: function (e) { setItem(idx, 'difficulty', e.target.value); }
                })
              ),
              h('div', { className: 'portal-field' },
                h('label', null, 'Quality'),
                h('input', {
                  type: 'number', min: 0,
                  value: it.quality,
                  onChange: function (e) { setItem(idx, 'quality', e.target.value); }
                })
              ),
              h('div', { className: 'portal-field' },
                h('label', null, 'Durability'),
                h('input', {
                  type: 'number', min: 0,
                  value: it.durability,
                  onChange: function (e) { setItem(idx, 'durability', e.target.value); }
                })
              )
            ),
            draft.items.length > 1 ? h('div', { style: { textAlign: 'right', marginTop: '0.35rem' } },
              h('button', {
                type: 'button',
                className: 'portal-btn is-small is-danger',
                onClick: function () { removeItem(idx); }
              }, 'Remove item')
            ) : null
          );
        })
      ),

      h('div', { className: 'portal-field' },
        h('label', null, 'Data Reward'),
        h('div', {
          style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(5rem, 1fr))', gap: '0.5rem' }
        },
          DATA_REWARD_LEVELS.map(function (lv) {
            return h('div', { key: lv.key, className: 'portal-field' },
              h('label', { style: { fontSize: '0.8rem' } }, lv.label),
              h('input', {
                type: 'number', min: 0,
                value: draft.dataReward[lv.key],
                onChange: function (e) { setReward(lv.key, e.target.value); }
              })
            );
          })
        ),
        h('div', { className: 'portal-field', style: { marginTop: '0.5rem', maxWidth: '12rem' } },
          h('label', { style: { fontSize: '0.8rem' } }, 'Cosmic Points'),
          h('input', {
            type: 'number', min: 0,
            value: draft.dataReward.cosmicPoints,
            onChange: function (e) { setReward('cosmicPoints', e.target.value); }
          })
        )
      ),

      h('div', { className: 'portal-form-actions' },
        h('button', {
          type: 'submit', className: 'portal-btn', disabled: saving
        }, saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create quest')),
        h('button', {
          type: 'button', className: 'portal-btn is-ghost',
          onClick: onCancel, disabled: saving
        }, 'Cancel')
      )
    );
  }

  // ── Row + list ──────────────────────────────────────────────────────────────

  function QuestRow(props) {
    var q = props.quest;
    var onEdit = props.onEdit;
    var onDelete = props.onDelete;

    var itemNames = (q.items || []).map(function (it) { return it.name; }).filter(Boolean).join(', ');
    var dr = q.dataReward || {};
    var rewardBits = DATA_REWARD_LEVELS
      .filter(function (lv) { return (dr[lv.key] || 0) > 0; })
      .map(function (lv) { return lv.label + '×' + dr[lv.key]; });
    if (dr.cosmicPoints) rewardBits.push('Pts×' + dr.cosmicPoints);

    return h('tr', null,
      h('td', null,
        h('div', { style: { fontWeight: 600 } }, q.questName || '(unnamed)'),
        itemNames ? h('div', { style: { color: 'var(--text-secondary)', fontSize: '0.85rem' } }, itemNames) : null
      ),
      h('td', null, q.job || '—'),
      h('td', null, q.location || '—'),
      h('td', null, q.category || '—'),
      h('td', null,
        rewardBits.length
          ? rewardBits.join(' · ')
          : h('span', { style: { color: 'var(--text-secondary)' } }, '—')
      ),
      h('td', { style: { whiteSpace: 'nowrap' } },
        h('button', {
          type: 'button', className: 'portal-btn is-small is-ghost',
          onClick: function () { onEdit(q); }
        }, 'Edit'),
        ' ',
        h('button', {
          type: 'button', className: 'portal-btn is-small is-danger',
          onClick: function () {
            if (confirm('Delete quest "' + (q.questName || q.id) + '"? Saved macros on user devices will keep pointing at this ID but the quest will disappear from the catalog.')) {
              onDelete(q);
            }
          }
        }, 'Delete')
      )
    );
  }

  function CosmicExploration() {
    var listState = useState([]);
    var list = listState[0], setList = listState[1];
    var metaState = useState(null);
    var meta = metaState[0], setMeta = metaState[1];
    var loadingState = useState(true);
    var loading = loadingState[0], setLoading = loadingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];
    var flashState = useState('');
    var flash = flashState[0], setFlash = flashState[1];
    var formState = useState(null); // null | { quest?: object }
    var formOpen = formState[0], setFormOpen = formState[1];
    var savedFilters = useMemo(loadFilters, []);
    var queryState = useState(savedFilters.query);
    var query = queryState[0], setQuery = queryState[1];
    var filterJobState = useState(savedFilters.filterJob);
    var filterJob = filterJobState[0], setFilterJob = filterJobState[1];
    var filterLocState = useState(savedFilters.filterLoc);
    var filterLoc = filterLocState[0], setFilterLoc = filterLocState[1];
    var filterCatState = useState(savedFilters.filterCat);
    var filterCat = filterCatState[0], setFilterCat = filterCatState[1];

    // Keep search/filter choices sticky across refreshes
    useEffect(function () {
      saveFilters({ query: query, filterJob: filterJob, filterLoc: filterLoc, filterCat: filterCat });
    }, [query, filterJob, filterLoc, filterCat]);

    async function reload() {
      setErr('');
      try {
        var pair = await Promise.all([
          cosmicRequest('GET', '/api/meta', undefined, false),
          cosmicRequest('GET', '/api/quests', undefined, false)
        ]);
        setMeta(pair[0]);
        setList(Array.isArray(pair[1]) ? pair[1] : []);
      } catch (e) {
        setErr(e.message || 'Failed to load cosmic catalog.');
      } finally {
        setLoading(false);
      }
    }

    useEffect(function () { reload(); }, []);

    function flashFor(msg) {
      setFlash(msg);
      setTimeout(function () { setFlash(''); }, 3500);
    }

    var filtered = useMemo(function () {
      var q = query.trim().toLowerCase();
      var out = list.slice().sort(function (a, b) {
        return (a.questName || '').localeCompare(b.questName || '', undefined, { sensitivity: 'base' });
      });
      if (filterJob !== 'all') out = out.filter(function (x) { return x.job === filterJob; });
      if (filterLoc !== 'all') out = out.filter(function (x) { return x.location === filterLoc; });
      if (filterCat !== 'all') out = out.filter(function (x) { return x.category === filterCat; });
      if (!q) return out;
      return out.filter(function (x) {
        if ((x.questName || '').toLowerCase().indexOf(q) !== -1) return true;
        if ((x.items || []).some(function (it) { return (it.name || '').toLowerCase().indexOf(q) !== -1; })) return true;
        return false;
      });
    }, [list, query, filterJob, filterLoc, filterCat]);

    async function handleSubmit(payload) {
      var editingId = formOpen && formOpen.quest && formOpen.quest.id;
      if (editingId) {
        await cosmicRequest('PUT', '/api/admin/quests/' + editingId, payload, true);
        flashFor('Quest updated.');
      } else {
        await cosmicRequest('POST', '/api/admin/quests', payload, true);
        flashFor('Quest created.');
      }
      setFormOpen(null);
      await reload();
    }

    async function handleDelete(q) {
      try {
        await cosmicRequest('DELETE', '/api/admin/quests/' + q.id, undefined, true);
        flashFor('Quest deleted.');
        await reload();
      } catch (e) {
        setErr(e.message || 'Failed to delete quest.');
      }
    }

    var jobs       = (meta && meta.jobs)       || [];
    var locations  = (meta && meta.locations)  || [];
    var categories = (meta && meta.categories) || [];

    return h('div', null,
      h('div', { className: 'portal-card', style: { padding: '0.85rem 1.1rem' } },
        h('div', {
          style: { display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }
        },
          h('h2', { className: 'portal-card-title', style: { margin: 0, flex: 1 } }, 'Cosmic Exploration Catalog'),
          h('input', {
            type: 'search',
            className: 'portal-search',
            value: query,
            onChange: function (e) { setQuery(e.target.value); },
            placeholder: 'Search quests or items…'
          }),
          h('select', {
            value: filterJob,
            onChange: function (e) { setFilterJob(e.target.value); },
            style: {
              padding: '0.4rem 0.6rem',
              background: 'var(--bg-darker)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '0.3rem'
            }
          },
            h('option', { value: 'all' }, 'All jobs'),
            jobs.map(function (j) { return h('option', { key: j.name, value: j.name }, j.name); })
          ),
          h('select', {
            value: filterLoc,
            onChange: function (e) { setFilterLoc(e.target.value); },
            style: {
              padding: '0.4rem 0.6rem',
              background: 'var(--bg-darker)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '0.3rem'
            }
          },
            h('option', { value: 'all' }, 'All locations'),
            locations.map(function (l) { return h('option', { key: l.name, value: l.name }, l.name); })
          ),
          h('select', {
            value: filterCat,
            onChange: function (e) { setFilterCat(e.target.value); },
            style: {
              padding: '0.4rem 0.6rem',
              background: 'var(--bg-darker)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '0.3rem'
            }
          },
            h('option', { value: 'all' }, 'All classes'),
            categories.map(function (c) { return h('option', { key: c.name, value: c.name }, c.name); })
          ),
          h('button', {
            type: 'button',
            className: 'portal-btn',
            disabled: !meta,
            onClick: function () { setFormOpen({ quest: null }); }
          },
            h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'add'),
            h('span', null, 'New quest')
          )
        ),
        flash ? h('div', { className: 'portal-flash success', style: { marginTop: '0.75rem', marginBottom: 0 } }, flash) : null
      ),

      err ? h('div', { className: 'portal-card' },
        h('div', { className: 'portal-flash error' }, err)
      ) : null,

      loading
        ? h('div', { className: 'portal-card' }, 'Loading catalog…')
        : !filtered.length
          ? h('div', { className: 'portal-card' },
              h('p', { style: { color: 'var(--text-secondary)', margin: 0 } },
                list.length ? 'No quests match those filters.' : 'No quests yet. Add the first one.'
              )
            )
          : h('div', { className: 'portal-card' },
              h('div', { className: 'portal-table-wrap' },
                h('table', { className: 'portal-table' },
                  h('thead', null,
                    h('tr', null,
                      h('th', null, 'Quest / Items'),
                      h('th', null, 'Job'),
                      h('th', null, 'Location'),
                      h('th', null, 'Class'),
                      h('th', null, 'Data Reward'),
                      h('th', null, '')
                    )
                  ),
                  h('tbody', null,
                    filtered.map(function (q) {
                      return h(QuestRow, {
                        key: q.id,
                        quest: q,
                        onEdit: function (qq) { setFormOpen({ quest: qq }); },
                        onDelete: handleDelete
                      });
                    })
                  )
                )
              )
            ),

      formOpen ? h(window.PVAdminModal, {
        title: formOpen.quest ? 'Edit quest' : 'New quest',
        size: 'lg',
        onClose: function () { setFormOpen(null); }
      },
        h(QuestForm, {
          initial: formOpen.quest || null,
          meta: meta,
          onSubmit: handleSubmit,
          onCancel: function () { setFormOpen(null); }
        })
      ) : null
    );
  }

  window.PVAdminCosmicExploration = CosmicExploration;
})();
