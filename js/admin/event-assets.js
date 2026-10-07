// ============================================================================
//  PVAdminEventAssets — shared event asset library
//
//  Accounts with event_assets.view can view the assets, copy the individual
//  text fields, and download the images. event_assets.edit adds, edits and
//  deletes entries, and uploads images.
//
//  Type is a single required value; tags are optional. Both are filter-only
//  (not copyable). Listing is a table with a small image thumbnail, matching
//  the other admin sections.
//
//  Worker routes:
//    GET    /event-assets          any role-holder
//    POST   /event-assets          event_assets.edit
//    PATCH  /event-assets/:id       event_assets.edit
//    DELETE /event-assets/:id       event_assets.edit
//    POST   /images                 event_assets.edit   (kind 'event', multipart, returns {url})
//
//  An entry is: { id, event_topic, type, location, description, image_url,
//                 tags: string[], created_at, updated_at }
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useMemo = React.useMemo;

  // Fixed vocabularies — keep in sync with the worker's EVENT_ASSET_TYPES /
  // EVENT_ASSET_TAGS so client and server validation agree.
  var TYPES = ['Roleplay', 'PVE', 'Community', 'Seasonal', 'Collaboration', 'FC Events'];
  var TAGS = [
    'Maps', 'FATEs', 'Field Operations', 'Deep Dungeons', 'V&C Dungeons',
    'Extreme Mount Farm', 'Savage Mount Farm', 'Moogle Treasure Trove', 'Unlock'
  ];

  function canManage() {
    return PVAdminAPI.can('event_assets.edit');
  }

  // Copy helper with a clipboard-API path and a legacy textarea fallback.
  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        resolve();
      } catch (e) { reject(e); }
    });
  }

  // Click anywhere in the cell to copy its text; the whole area hovers and a
  // brief "Copied!" note confirms. Empty values render a non-interactive dash.
  // With props.truncate (a char count), long values are clipped to a preview
  // with a Show more/less toggle — but a click always copies the FULL value.
  function ClickToCopy(props) {
    var copiedState = useState(false);
    var copied = copiedState[0], setCopied = copiedState[1];
    var expandedState = useState(false);
    var expanded = expandedState[0], setExpanded = expandedState[1];
    var value = props.value || '';
    if (!value) return h('div', { className: 'ea-cell-empty' }, '—');
    function doCopy() {
      copyToClipboard(value).then(function () {
        setCopied(true);
        setTimeout(function () { setCopied(false); }, 1500);
      }).catch(function () {});
    }
    var limit = props.truncate || 0;
    var truncatable = limit && value.length > limit;
    var shown = (truncatable && !expanded)
      ? value.slice(0, limit).replace(/\s+$/, '') + '…'
      : value;
    return h('div', {
      className: 'ea-copy',
      role: 'button',
      tabIndex: 0,
      title: 'Click to copy',
      onClick: doCopy,
      onKeyDown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doCopy(); } }
    },
      h('span', {
        style: Object.assign(
          { whiteSpace: props.preserve ? 'pre-wrap' : 'normal' },
          props.bold ? { fontWeight: 600 } : null,
          props.textStyle || null
        )
      }, shown),
      truncatable ? h('button', {
        type: 'button',
        className: 'ea-expand',
        // Don't let the toggle trigger the cell's copy handler.
        onClick: function (e) { e.stopPropagation(); e.preventDefault(); setExpanded(!expanded); },
        onKeyDown: function (e) { e.stopPropagation(); }
      }, expanded ? 'Show less' : 'Show more') : null,
      copied ? h('span', {
        style: { display: 'block', marginTop: '0.2rem', fontSize: '0.78rem', color: 'var(--accent-brown, var(--text-secondary))' }
      }, 'Copied!') : null
    );
  }

  function emptyDraft() {
    return {
      event_topic: '',
      type: '',
      location: '',
      description: '',
      image_url: '',
      tags: []
    };
  }

  function assetToDraft(a) {
    if (!a) return emptyDraft();
    return {
      id: a.id,
      event_topic: a.event_topic || '',
      type: a.type || '',
      location: a.location || '',
      description: a.description || '',
      image_url: a.image_url || '',
      tags: Array.isArray(a.tags) ? a.tags.slice() : []
    };
  }

  function draftToPayload(draft) {
    return {
      event_topic: draft.event_topic.trim(),
      type: draft.type,
      location: draft.location.trim() || null,
      description: draft.description.trim() || null,
      image_url: draft.image_url.trim() || null,
      tags: (draft.tags || []).slice()
    };
  }

  // ── Form (create / edit) ─────────────────────────────────────────────────
  function EventAssetForm(props) {
    var initial = props.initial;
    var onSubmit = props.onSubmit;
    var onCancel = props.onCancel;
    var isEdit = !!(initial && initial.id);

    var draftState = useState(initial ? assetToDraft(initial) : emptyDraft());
    var draft = draftState[0], setDraft = draftState[1];
    var savingState = useState(false);
    var saving = savingState[0], setSaving = savingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];

    var topicReady = !!draft.event_topic.trim();

    function setField(k, v) {
      setDraft(function (d) { return Object.assign({}, d, { [k]: v }); });
    }

    function toggleTag(t) {
      setDraft(function (d) {
        var has = d.tags.indexOf(t) !== -1;
        var next = has ? d.tags.filter(function (x) { return x !== t; }) : d.tags.concat([t]);
        return Object.assign({}, d, { tags: next });
      });
    }

    async function submit(e) {
      e.preventDefault();
      if (!topicReady) { setErr('Event topic is required.'); return; }
      if (!draft.type) { setErr('Type is required.'); return; }
      setErr('');
      setSaving(true);
      try {
        await onSubmit(draftToPayload(draft));
      } catch (ex) {
        setErr(ex.message || 'Could not save.');
        setSaving(false);
      }
    }

    return h('form', { onSubmit: submit, className: 'portal-form' },
      err ? h('div', { className: 'portal-flash error' }, err) : null,

      h('div', { className: 'portal-field' },
        h('label', null, 'Event *'),
        h('input', {
          type: 'text',
          value: draft.event_topic,
          onChange: function (e) { setField('event_topic', e.target.value); },
          maxLength: 200,
          placeholder: '[PVE] Treasure Hunt',
          required: true
        })
      ),

      h('div', { className: 'portal-field' },
        h('label', null, 'Type *'),
        h('select', {
          value: draft.type,
          onChange: function (e) { setField('type', e.target.value); },
          required: true
        },
          h('option', { value: '' }, 'Select a type…'),
          TYPES.map(function (t) { return h('option', { key: t, value: t }, t); })
        )
      ),

      h('div', { className: 'portal-field' },
        h('label', null, 'Tags'),
        h('select', {
          value: '',
          onChange: function (e) {
            var t = e.target.value;
            if (t) toggleTag(t);
          }
        },
          h('option', { value: '' }, draft.tags.length ? 'Add another tag…' : 'Add a tag…'),
          TAGS.filter(function (t) { return draft.tags.indexOf(t) === -1; })
            .map(function (t) { return h('option', { key: t, value: t }, t); })
        ),
        draft.tags.length ? h('div', {
          style: { display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.5rem' }
        }, draft.tags.map(function (t) {
          return h('span', {
            key: t,
            style: {
              display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
              padding: '0.15rem 0.5rem',
              background: 'var(--bg-card-light)',
              border: '1px solid var(--border-color)',
              borderRadius: '0.25rem',
              fontSize: '0.85rem',
              color: 'var(--text-secondary)'
            }
          },
            h('span', null, t),
            h('button', {
              type: 'button',
              onClick: function () { toggleTag(t); },
              'aria-label': 'Remove tag ' + t,
              style: {
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-secondary)', padding: 0, lineHeight: 1, fontSize: '0.9rem'
              }
            }, '✕')
          );
        })) : null
      ),

      h('div', { className: 'portal-field' },
        h('label', null, 'Location'),
        h('input', {
          type: 'text',
          value: draft.location,
          onChange: function (e) { setField('location', e.target.value); },
          maxLength: 200,
          placeholder: 'e.g. Lavender Beds, Ward 5, Plot 30'
        })
      ),

      h('div', { className: 'portal-field' },
        h('label', null, 'Description'),
        h('textarea', {
          value: draft.description,
          onChange: function (e) { setField('description', e.target.value); },
          rows: 6, maxLength: 4000,
          placeholder: 'Details to copy for the Discord event description…'
        })
      ),

      h(PVAdminImageUpload.ImageField, {
        value: draft.image_url,
        onChange: function (v) { setField('image_url', v); },
        disabled: saving,
        blockedReason: topicReady ? null : 'Enter the event topic above before uploading an image.',
        kind: 'event',
        name: draft.event_topic.trim(),
        help: 'Paste an image URL, or upload a file. The event topic must be set before uploading.'
      }),

      h('div', { className: 'portal-form-actions' },
        h('button', {
          type: 'submit', className: 'portal-btn', disabled: saving
        }, saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create asset')),
        h('button', {
          type: 'button', className: 'portal-btn is-ghost',
          onClick: onCancel, disabled: saving
        }, 'Cancel')
      )
    );
  }

  // Build a safe-ish filename from the topic for the download attribute.
  function downloadName(asset) {
    var base = (asset.event_topic || 'event-asset')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'event-asset';
    return base + '-image';
  }

  // Pull a file extension off the stored URL (e.g. ".webp"), ignoring any query.
  function extFromUrl(url) {
    var clean = String(url || '').split('?')[0].split('#')[0];
    var m = clean.match(/\.([a-z0-9]{2,5})$/i);
    return m ? '.' + m[1].toLowerCase() : '';
  }

  // Force a real download. The images are served from a different subdomain, so
  // the <a download> attribute is ignored and the browser would just navigate;
  // fetching the bytes and saving the blob downloads instead. If the fetch is
  // blocked (e.g. the image host sends no CORS header), fall back to opening
  // the image in a new tab so the user can still save it manually.
  async function downloadImage(asset) {
    var url = asset.image_url;
    if (!url) return;
    var filename = downloadName(asset) + extFromUrl(url);
    try {
      // Cache-bust so we don't get served a copy that Cloudflare cached from an
      // earlier <img> load (those lack the Access-Control-Allow-Origin header,
      // which would make this cross-origin fetch fail). A unique query forces a
      // fresh response that carries the bucket's CORS header.
      var sep = url.indexOf('?') === -1 ? '?' : '&';
      var fetchUrl = url + sep + 'dl=' + Date.now();
      var res = await fetch(fetchUrl, { mode: 'cors', cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var blob = await res.blob();
      var objUrl = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = objUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(objUrl); }, 1000);
    } catch (_e) {
      window.open(url, '_blank', 'noopener');
    }
  }

  // ── Table row (everyone) ─────────────────────────────────────────────────
  function AssetRow(props) {
    var a = props.asset;
    var manage = props.manage;
    var onEdit = props.onEdit;
    var onDelete = props.onDelete;

    return h('tr', null,
      // Image fills the cell (no padding) with a seamless full-width Download
      // button directly underneath it.
      h('td', { style: { padding: 0, width: '400px', verticalAlign: 'middle' } },
        a.image_url ? h('div', { style: { position: 'relative' } },
          h('img', {
            src: a.image_url, alt: a.event_topic || '',
            style: { display: 'block', width: '100%', height: 'auto' },
            onError: function (e) { e.target.style.display = 'none'; }
          }),
          // Download control floats over the image's top-right corner.
          h('a', {
            href: a.image_url,
            download: downloadName(a),
            target: '_blank',
            rel: 'noopener noreferrer',
            title: 'Download image',
            'aria-label': 'Download image',
            // Fetch the bytes and save them so it downloads rather than just
            // navigating; the href is the no-JS fallback.
            onClick: function (e) { e.preventDefault(); downloadImage(a); },
            className: 'ea-download-btn'
          },
            h('span', { className: 'material-icons', 'aria-hidden': 'true', style: { fontSize: '1.2rem' } }, 'download')
          )
        ) : h('div', { style: { padding: '0.6rem 0.75rem', textAlign: 'center', color: 'var(--text-secondary)' } }, '—')
      ),
      // Event (click anywhere in the cell to copy)
      h('td', { style: { padding: 0, verticalAlign: 'middle' } },
        h(ClickToCopy, { value: a.event_topic || 'Untitled', textStyle: { fontFamily: 'Stoke, serif', fontSize: '0.9rem' } })
      ),
      // Location (click to copy)
      h('td', { style: { padding: 0, verticalAlign: 'middle' } },
        h(ClickToCopy, { value: a.location })
      ),
      // Description (full text, click to copy)
      h('td', { style: { padding: 0, verticalAlign: 'middle', minWidth: '360px' } },
        h(ClickToCopy, { value: a.description, preserve: true, truncate: 200 })
      ),
      // Actions (managers only)
      manage ? h('td', { style: { whiteSpace: 'nowrap', verticalAlign: 'middle' } },
        h('button', {
          type: 'button', className: 'portal-btn is-small is-ghost is-icon',
          title: 'Edit', 'aria-label': 'Edit',
          onClick: function () { onEdit(a); }
        }, h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'edit')),
        ' ',
        h('button', {
          type: 'button', className: 'portal-btn is-small is-danger is-icon',
          title: 'Delete', 'aria-label': 'Delete',
          onClick: function () {
            if (confirm('Delete event asset "' + (a.event_topic || 'Untitled') + '"?')) onDelete(a);
          }
        }, h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'delete'))
      ) : null
    );
  }

  // ── Section root ─────────────────────────────────────────────────────────
  function EventAssets() {
    var listState = useState([]);
    var list = listState[0], setList = listState[1];
    var loadingState = useState(true);
    var loading = loadingState[0], setLoading = loadingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];
    var flashState = useState('');
    var flash = flashState[0], setFlash = flashState[1];
    var formState = useState(null); // null | { asset: object|null }
    var formOpen = formState[0], setFormOpen = formState[1];
    var queryState = useState('');
    var query = queryState[0], setQuery = queryState[1];
    var typeFilterState = useState('');
    var typeFilter = typeFilterState[0], setTypeFilter = typeFilterState[1];
    var tagFilterState = useState('');
    var tagFilter = tagFilterState[0], setTagFilter = tagFilterState[1];

    var manage = canManage();

    async function reload() {
      setErr('');
      try {
        var data = await PVAdminAPI.request('GET', '/event-assets', undefined, true);
        setList(Array.isArray(data) ? data : []);
      } catch (e) {
        setErr(e.message || 'Failed to load event assets.');
      } finally {
        setLoading(false);
      }
    }

    useEffect(function () { reload(); }, []);

    var filtered = useMemo(function () {
      var q = query.trim().toLowerCase();
      var sorted = list.slice().sort(function (a, b) {
        // Alphabetical by Event name; rows are grouped by type below, so this
        // yields an A–Z order within each type group.
        return (a.event_topic || '').localeCompare(b.event_topic || '', undefined, { sensitivity: 'base' });
      });
      return sorted.filter(function (a) {
        if (typeFilter && a.type !== typeFilter) return false;
        if (tagFilter) {
          var assetTags = Array.isArray(a.tags) ? a.tags : [];
          if (assetTags.indexOf(tagFilter) === -1) return false;
        }
        if (q) {
          var hay = [a.event_topic, a.location, a.description, a.type]
            .filter(Boolean).join(' ').toLowerCase();
          if (hay.indexOf(q) === -1) return false;
        }
        return true;
      });
    }, [list, query, typeFilter, tagFilter]);

    function flashFor(msg) {
      setFlash(msg);
      setTimeout(function () { setFlash(''); }, 3500);
    }

    async function handleSubmit(payload) {
      var editingId = formOpen && formOpen.asset && formOpen.asset.id;
      if (editingId) {
        await PVAdminAPI.request('PATCH', '/event-assets/' + editingId, payload, true);
        flashFor('Event asset updated.');
      } else {
        await PVAdminAPI.request('POST', '/event-assets', payload, true);
        flashFor('Event asset created.');
      }
      setFormOpen(null);
      await reload();
    }

    async function handleDelete(a) {
      try {
        await PVAdminAPI.request('DELETE', '/event-assets/' + a.id, undefined, true);
        flashFor('Event asset deleted.');
        await reload();
      } catch (e) {
        setErr(e.message || 'Failed to delete event asset.');
      }
    }

    var colCount = manage ? 5 : 4;

    // Group the filtered rows under their type, in canonical TYPES order
    // (untyped last) — mirrors how FC Members groups by rank.
    var groups = (function () {
      var byType = {};
      filtered.forEach(function (a) {
        var t = a.type || 'Untyped';
        (byType[t] = byType[t] || []).push(a);
      });
      var ordered = TYPES.filter(function (t) { return byType[t]; });
      var unknown = Object.keys(byType).filter(function (t) { return TYPES.indexOf(t) === -1; });
      return ordered.concat(unknown).map(function (t) {
        return { type: t, assets: byType[t] };
      });
    })();

    return h('div', null,
      h('div', { className: 'portal-card portal-head' },
        h('div', {
          className: 'portal-head-row'
        },
          h('h2', { className: 'portal-card-title portal-head-title' }, 'Event Assets'),
          h('input', {
            type: 'search',
            className: 'portal-search',
            value: query,
            onChange: function (e) { setQuery(e.target.value); },
            placeholder: 'Search assets…'
          }),
          manage ? h('button', {
            type: 'button',
            className: 'portal-btn',
            onClick: function () { setFormOpen({ asset: null }); }
          },
            h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'add'),
            h('span', null, 'New asset')
          ) : null
        ),
        // Filters on their own line: type + tag dropdowns.
        h('div', { className: 'portal-filter-row', style: { marginBottom: 0 } },
          h('select', {
            className: 'portal-filter-select',
            value: typeFilter,
            onChange: function (e) { setTypeFilter(e.target.value); },
            'aria-label': 'Filter by type'
          },
            h('option', { value: '' }, 'All types'),
            TYPES.map(function (t) { return h('option', { key: t, value: t }, t); })
          ),
          h('select', {
            className: 'portal-filter-select',
            value: tagFilter,
            onChange: function (e) { setTagFilter(e.target.value); },
            'aria-label': 'Filter by tag'
          },
            h('option', { value: '' }, 'All tags'),
            TAGS.map(function (t) { return h('option', { key: t, value: t }, t); })
          )
        ),
        h('p', { className: 'portal-field-help', style: { margin: '0.6rem 0 0' } },
          'Click any text to copy it, and use Download to save an image.'
        ),
        flash ? h('div', { className: 'portal-flash success is-head' }, flash) : null
      ),

      err ? h('div', { className: 'portal-card' },
        h('div', { className: 'portal-flash error' }, err)
      ) : null,

      loading
        ? h('div', { className: 'portal-card' }, 'Loading event assets…')
        : !filtered.length
          ? h('div', { className: 'portal-card' },
              h('p', { className: 'portal-note' },
                list.length
                  ? 'No event assets match those filters.'
                  : (manage ? 'No event assets yet. Add the first one.' : 'No event assets yet.')
              )
            )
          : h('div', { className: 'portal-card' },
              h('div', { className: 'portal-table-wrap' },
                h('table', { className: 'portal-table event-assets-table' },
                  h('thead', null,
                    h('tr', null,
                      h('th', null, 'Image'),
                      h('th', null, 'Event'),
                      h('th', null, 'Location'),
                      h('th', null, 'Description'),
                      manage ? h('th', null, '') : null
                    )
                  ),
                  h('tbody', null,
                    groups.map(function (g) {
                      return [
                        h('tr', { key: 'grp-' + g.type, className: 'portal-group-row' },
                          h('td', { colSpan: colCount, className: 'portal-group-cell' },
                            g.type + ' · ' + g.assets.length)
                        )
                      ].concat(g.assets.map(function (a) {
                        return h(AssetRow, {
                          key: a.id,
                          asset: a,
                          manage: manage,
                          onEdit: function (aa) { setFormOpen({ asset: aa }); },
                          onDelete: handleDelete
                        });
                      }));
                    })
                  )
                )
              )
            ),

      formOpen ? h(window.PVAdminModal, {
        title: formOpen.asset ? 'Edit event asset' : 'New event asset',
        size: 'lg',
        onClose: function () { setFormOpen(null); }
      },
        h(EventAssetForm, {
          initial: formOpen.asset || null,
          onSubmit: handleSubmit,
          onCancel: function () { setFormOpen(null); }
        })
      ) : null
    );
  }

  window.PVAdminEventAssets = EventAssets;
})();
