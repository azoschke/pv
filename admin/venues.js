// ============================================================================
//  PVAdminVenues — Venue directory management for officers/admins
//
//  Worker routes:
//    GET    /venues          public
//    POST   /venues          officer | admin
//    PATCH  /venues/:id      officer | admin
//    DELETE /venues/:id      officer | admin
//
//  Image hosting: an external URL field. May be a relative path like
//  /pv/assets/venues/foo.jpg if the file lives in this repo.
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useMemo = React.useMemo;

  var SIZES = [
    { value: 'room',      label: 'Room' },
    { value: 'apartment', label: 'Apartment' },
    { value: 'cottage',   label: 'Cottage' },
    { value: 'house',     label: 'House' },
    { value: 'mansion',   label: 'Mansion' }
  ];

  var DISTRICTS = [
    { value: 'mist',          label: 'Mist' },
    { value: 'lavender_beds', label: 'Lavender Beds' },
    { value: 'goblet',        label: 'Goblet' },
    { value: 'empyreum',      label: 'Empyreum' },
    { value: 'shirogane',     label: 'Shirogane' }
  ];

  var TAGS = [
    { value: 'tavern',     label: 'Tavern' },
    { value: 'clinic',     label: 'Clinic' },
    { value: 'inn',        label: 'Inn' },
    { value: 'lounge',     label: 'Lounge' },
    { value: 'restaurant', label: 'Restaurant' },
    { value: 'fight_club', label: 'Fight Club' },
    { value: 'shop',       label: 'Shop' },
    { value: 'other',      label: 'Other' }
  ];

  function labelFor(list, val) {
    for (var i = 0; i < list.length; i++) if (list[i].value === val) return list[i].label;
    return val || '';
  }

  function emptyDraft() {
    return {
      name: '',
      size: 'house',
      district: 'mist',
      ward: '',
      plot: '',
      room_number: '',
      description: '',
      image_url: '',
      gallery_images: ['', '', ''],
      tags: [],
      extra_tags: [],
      featured: false
    };
  }

  function venueToDraft(v) {
    if (!v) return emptyDraft();
    var gal = Array.isArray(v.gallery_images)
      ? v.gallery_images.slice(0, 3)
      : [v.gallery_image_1, v.gallery_image_2, v.gallery_image_3];
    var galleryImages = ['', '', ''];
    for (var i = 0; i < 3; i++) {
      if (gal && gal[i]) galleryImages[i] = String(gal[i]);
    }
    return {
      id: v.id,
      name: v.name || '',
      size: v.size || 'house',
      district: v.district || 'mist',
      ward: v.ward != null ? String(v.ward) : '',
      plot: v.plot != null ? String(v.plot) : '',
      room_number: v.room_number != null ? String(v.room_number) : '',
      description: v.description || '',
      image_url: v.image_url || '',
      gallery_images: galleryImages,
      tags: Array.isArray(v.tags) ? v.tags.slice() : [],
      extra_tags: Array.isArray(v.extra_tags) ? v.extra_tags.slice() : [],
      featured: !!v.featured
    };
  }

  function draftToPayload(draft) {
    var allowsRoom = draft.size === 'room' || draft.size === 'apartment';
    var isApartment = draft.size === 'apartment';
    return {
      name: draft.name.trim(),
      size: draft.size,
      district: draft.district,
      ward: draft.ward === '' ? null : Number(draft.ward),
      plot: isApartment || draft.plot === '' ? null : Number(draft.plot),
      room_number: !allowsRoom || draft.room_number === '' ? null : Number(draft.room_number),
      description: draft.description.trim() || null,
      image_url: draft.image_url.trim() || null,
      gallery_images: (draft.gallery_images || [])
        .map(function (g) { return (g || '').trim(); })
        .filter(function (g) { return !!g; }),
      tags: draft.tags.slice(),
      extra_tags: draft.extra_tags.slice(),
      featured: !!draft.featured
    };
  }

  // ── Form ────────────────────────────────────────────────────────────────
  function VenueForm(props) {
    var initial = props.initial;
    var onSubmit = props.onSubmit;
    var onCancel = props.onCancel;
    var isEdit = !!(initial && initial.id);

    var draftState = useState(initial ? venueToDraft(initial) : emptyDraft());
    var draft = draftState[0], setDraft = draftState[1];
    var savingState = useState(false);
    var saving = savingState[0], setSaving = savingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];
    var newTagState = useState('');
    var newTag = newTagState[0], setNewTag = newTagState[1];

    var allowsRoom = draft.size === 'room' || draft.size === 'apartment';
    var isApartment = draft.size === 'apartment';

    function setField(k, v) {
      setDraft(function (d) {
        var next = Object.assign({}, d, { [k]: v });
        if (k === 'size' && v !== 'room' && v !== 'apartment') next.room_number = '';
        if (k === 'size' && v === 'apartment') next.plot = '';
        return next;
      });
    }

    function setGalleryImage(idx, value) {
      setDraft(function (d) {
        var next = (d.gallery_images || ['', '', '']).slice();
        while (next.length < 3) next.push('');
        next[idx] = value;
        return Object.assign({}, d, { gallery_images: next });
      });
    }

    function toggleTag(value) {
      setDraft(function (d) {
        var has = d.tags.indexOf(value) !== -1;
        var next = has ? d.tags.filter(function (t) { return t !== value; }) : d.tags.concat([value]);
        return Object.assign({}, d, { tags: next });
      });
    }

    function addExtraTag() {
      var t = newTag.trim();
      if (!t) return;
      if (t.length > 32) { setErr('Extra tags must be 32 characters or fewer.'); return; }
      var lower = t.toLowerCase();
      var dupe = draft.extra_tags.some(function (x) { return x.toLowerCase() === lower; });
      if (dupe) { setNewTag(''); return; }
      if (draft.extra_tags.length >= 12) { setErr('Up to 12 extra tags.'); return; }
      setDraft(function (d) {
        return Object.assign({}, d, { extra_tags: d.extra_tags.concat([t]) });
      });
      setNewTag('');
      setErr('');
    }

    function removeExtraTag(t) {
      setDraft(function (d) {
        return Object.assign({}, d, { extra_tags: d.extra_tags.filter(function (x) { return x !== t; }) });
      });
    }

    async function handleSubmit(e) {
      e.preventDefault();
      if (!draft.name.trim()) { setErr('Name is required.'); return; }
      var ward = Number(draft.ward);
      if (!Number.isInteger(ward) || ward < 1 || ward > 30) {
        setErr('Ward must be an integer 1–30.');
        return;
      }
      if (!isApartment && draft.plot !== '') {
        var plot = Number(draft.plot);
        if (!Number.isInteger(plot) || plot < 1 || plot > 60) {
          setErr('Plot must be an integer 1–60 (or leave blank).');
          return;
        }
      }
      if (allowsRoom && draft.room_number !== '') {
        var rn = Number(draft.room_number);
        if (!Number.isInteger(rn) || rn < 1) {
          setErr('Room number must be a positive integer.');
          return;
        }
      }
      setSaving(true); setErr('');
      try {
        await onSubmit(draftToPayload(draft));
      } catch (e2) {
        setErr(e2.message || 'Failed to save venue.');
        setSaving(false);
      }
    }

    return h('form', { onSubmit: handleSubmit },
      err ? h('div', { className: 'portal-flash error' }, err) : null,

      h('div', { className: 'portal-field' },
        h('label', null, 'Name *'),
        h('input', {
          type: 'text', maxLength: 120,
          value: draft.name,
          onChange: function (e) { setField('name', e.target.value); }
        })
      ),

      h('div', { className: 'portal-field-row' },
        h('div', { className: 'portal-field' },
          h('label', null, 'Size *'),
          h('select', {
            value: draft.size,
            onChange: function (e) { setField('size', e.target.value); }
          }, SIZES.map(function (s) {
            return h('option', { key: s.value, value: s.value }, s.label);
          }))
        ),
        h('div', { className: 'portal-field' },
          h('label', null, 'District *'),
          h('select', {
            value: draft.district,
            onChange: function (e) { setField('district', e.target.value); }
          }, DISTRICTS.map(function (d) {
            return h('option', { key: d.value, value: d.value }, d.label);
          }))
        )
      ),

      h('div', { className: 'portal-field-row' },
        h('div', { className: 'portal-field' },
          h('label', null, 'Ward *'),
          h('input', {
            type: 'number', min: 1, max: 30,
            value: draft.ward,
            onChange: function (e) { setField('ward', e.target.value); }
          })
        ),
        h('div', { className: 'portal-field' },
          h('label', null, 'Plot'),
          h('input', {
            type: 'number', min: 1, max: 60,
            value: isApartment ? '' : draft.plot,
            onChange: function (e) { setField('plot', e.target.value); },
            disabled: isApartment,
            placeholder: isApartment ? 'n/a' : ''
          })
        ),
        h('div', { className: 'portal-field' },
          h('label', null, 'Room #' + (allowsRoom ? ' *' : '')),
          h('input', {
            type: 'number', min: 1,
            value: draft.room_number,
            onChange: function (e) { setField('room_number', e.target.value); },
            disabled: !allowsRoom,
            placeholder: allowsRoom ? '' : 'n/a'
          })
        )
      ),

      h('div', { className: 'portal-field' },
        h('label', null, 'Image URL'),
        h('input', {
          type: 'text',
          value: draft.image_url,
          onChange: function (e) { setField('image_url', e.target.value); },
          placeholder: 'https://… or /pv/assets/venues/your-file.jpg'
        }),
        h('p', { className: 'portal-field-help' },
          'Paste a full URL or a path under /pv/assets/venues/. Leave blank for a themed gradient.'
        ),
        draft.image_url ? h('img', {
          src: draft.image_url, alt: '',
          style: {
            display: 'block', marginTop: '0.5rem',
            maxWidth: '320px', maxHeight: '180px',
            border: '1px solid var(--border-color)', borderRadius: '0.3rem',
            objectFit: 'cover'
          },
          onError: function (e) { e.target.style.display = 'none'; }
        }) : null
      ),

      h('div', { className: 'portal-field' },
        h('label', null, 'Gallery images (up to 3)'),
        h('p', { className: 'portal-field-help', style: { marginTop: 0 } },
          'Additional images shown in the modal slider. Same format as the primary image.'
        ),
        [0, 1, 2].map(function (idx) {
          var val = (draft.gallery_images && draft.gallery_images[idx]) || '';
          return h('div', {
            key: idx,
            style: { display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: idx === 0 ? '0.25rem' : '0.4rem' }
          },
            h('input', {
              type: 'text',
              value: val,
              onChange: function (e) { setGalleryImage(idx, e.target.value); },
              placeholder: 'https://… or /pv/assets/venues/your-file.jpg',
              style: { flex: 1 }
            }),
            val ? h('img', {
              src: val, alt: '',
              style: {
                width: '64px', height: '40px', objectFit: 'cover',
                border: '1px solid var(--border-color)', borderRadius: '0.25rem'
              },
              onError: function (e) { e.target.style.display = 'none'; }
            }) : null
          );
        })
      ),

      h('div', { className: 'portal-field' },
        h('label', null, 'Description'),
        h('textarea', {
          value: draft.description,
          onChange: function (e) { setField('description', e.target.value); },
          rows: 5, maxLength: 4000,
          placeholder: 'Markdown allowed.'
        })
      ),

      h('div', { className: 'portal-field' },
        h('label', null, 'Type tags (filterable)'),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '0.4rem 0.85rem' } },
          TAGS.map(function (t) {
            var checked = draft.tags.indexOf(t.value) !== -1;
            return h('label', {
              key: t.value,
              style: { display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }
            },
              h('input', {
                type: 'checkbox',
                checked: checked,
                onChange: function () { toggleTag(t.value); }
              }),
              h('span', null, t.label)
            );
          })
        )
      ),

      h('div', { className: 'portal-field' },
        h('label', null, 'Extra tags (display-only)'),
        h('div', { style: { display: 'flex', gap: '0.5rem' } },
          h('input', {
            type: 'text',
            value: newTag,
            onChange: function (e) { setNewTag(e.target.value); },
            onKeyDown: function (e) {
              if (e.key === 'Enter') { e.preventDefault(); addExtraTag(); }
            },
            maxLength: 32,
            placeholder: 'Press Enter to add',
            style: { flex: 1 }
          }),
          h('button', {
            type: 'button',
            className: 'portal-btn is-ghost is-small',
            onClick: addExtraTag
          }, 'Add')
        ),
        draft.extra_tags.length ? h('div', {
          style: { display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.5rem' }
        }, draft.extra_tags.map(function (t) {
          return h('span', {
            key: t,
            style: {
              display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
              padding: '0.15rem 0.5rem',
              background: 'var(--bg-card-light)',
              border: '1px solid var(--border-color)',
              borderRadius: '0.25rem',
              fontFamily: '"La Belle Aurore", cursive',
              fontSize: '0.95rem',
              color: 'var(--accent-brown)'
            }
          },
            h('span', null, '#' + t),
            h('button', {
              type: 'button',
              onClick: function () { removeExtraTag(t); },
              'aria-label': 'Remove tag ' + t,
              style: {
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-secondary)', padding: 0, lineHeight: 1, fontSize: '0.95rem'
              }
            }, '✕')
          );
        })) : null
      ),

      h('div', { className: 'portal-field' },
        h('label', { style: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem' } },
          h('input', {
            type: 'checkbox',
            checked: draft.featured,
            onChange: function (e) { setField('featured', e.target.checked); }
          }),
          h('span', null, 'Featured')
        )
      ),

      h('div', { className: 'portal-form-actions' },
        h('button', {
          type: 'submit', className: 'portal-btn', disabled: saving
        }, saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create venue')),
        h('button', {
          type: 'button', className: 'portal-btn is-ghost',
          onClick: onCancel, disabled: saving
        }, 'Cancel')
      )
    );
  }

  // ── List view ────────────────────────────────────────────────────────────
  function VenueRow(props) {
    var v = props.venue;
    var onEdit = props.onEdit;
    var onDelete = props.onDelete;

    var locParts = [labelFor(DISTRICTS, v.district), 'W' + v.ward];
    if (v.plot != null) locParts.push('P' + v.plot);
    if (v.room_number != null) locParts.push('R' + v.room_number);

    return h('tr', null,
      h('td', null,
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '0.4rem' } },
          v.featured ? h('span', { className: 'portal-badge is-pinned' }, '★') : null,
          h('span', { style: { fontWeight: 600 } }, v.name)
        )
      ),
      h('td', null, labelFor(SIZES, v.size)),
      h('td', null, locParts.join(' · ')),
      h('td', null,
        (Array.isArray(v.tags) ? v.tags : [])
          .map(function (t) { return labelFor(TAGS, t); })
          .join(', ') || h('span', { style: { color: 'var(--text-secondary)' } }, '—')
      ),
      h('td', { style: { whiteSpace: 'nowrap' } },
        h('button', {
          type: 'button', className: 'portal-btn is-small is-ghost',
          onClick: function () { onEdit(v); }
        }, 'Edit'),
        ' ',
        h('button', {
          type: 'button', className: 'portal-btn is-small is-danger',
          onClick: function () {
            if (confirm('Delete venue "' + v.name + '"?')) onDelete(v);
          }
        }, 'Delete')
      )
    );
  }

  function Venues() {
    var listState = useState([]);
    var list = listState[0], setList = listState[1];
    var loadingState = useState(true);
    var loading = loadingState[0], setLoading = loadingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];
    var flashState = useState('');
    var flash = flashState[0], setFlash = flashState[1];
    var formState = useState(null); // null | { venue?: object }
    var formOpen = formState[0], setFormOpen = formState[1];
    var queryState = useState('');
    var query = queryState[0], setQuery = queryState[1];

    async function reload() {
      setErr('');
      try {
        var data = await PVAdminAPI.request('GET', '/venues', undefined, true);
        setList(Array.isArray(data) ? data : []);
      } catch (e) {
        setErr(e.message || 'Failed to load venues.');
      } finally {
        setLoading(false);
      }
    }

    useEffect(function () { reload(); }, []);

    var filtered = useMemo(function () {
      var q = query.trim().toLowerCase();
      var sorted = list.slice().sort(function (a, b) {
        return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
      });
      if (!q) return sorted;
      return sorted.filter(function (v) {
        return (
          (v.name || '').toLowerCase().indexOf(q) !== -1 ||
          (v.description || '').toLowerCase().indexOf(q) !== -1 ||
          labelFor(DISTRICTS, v.district).toLowerCase().indexOf(q) !== -1 ||
          (Array.isArray(v.tags) ? v.tags.join(' ') : '').toLowerCase().indexOf(q) !== -1
        );
      });
    }, [list, query]);

    function flashFor(msg) {
      setFlash(msg);
      setTimeout(function () { setFlash(''); }, 3500);
    }

    async function handleSubmit(payload) {
      var editingId = formOpen && formOpen.venue && formOpen.venue.id;
      if (editingId) {
        await PVAdminAPI.request('PATCH', '/venues/' + editingId, payload, true);
        flashFor('Venue updated.');
      } else {
        await PVAdminAPI.request('POST', '/venues', payload, true);
        flashFor('Venue created.');
      }
      setFormOpen(null);
      await reload();
    }

    async function handleDelete(v) {
      try {
        await PVAdminAPI.request('DELETE', '/venues/' + v.id, undefined, true);
        flashFor('Venue deleted.');
        await reload();
      } catch (e) {
        setErr(e.message || 'Failed to delete venue.');
      }
    }

    return h('div', null,
      h('div', { className: 'portal-card', style: { padding: '0.85rem 1.1rem' } },
        h('div', {
          style: { display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }
        },
          h('h2', { className: 'portal-card-title', style: { margin: 0, flex: 1 } }, 'Venue Directory'),
          h('input', {
            type: 'search',
            value: query,
            onChange: function (e) { setQuery(e.target.value); },
            placeholder: 'Search venues…',
            style: {
              padding: '0.4rem 0.6rem',
              background: 'var(--bg-darker)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '0.3rem',
              minWidth: '14rem'
            }
          }),
          h('button', {
            type: 'button',
            className: 'portal-btn',
            onClick: function () { setFormOpen({ venue: null }); }
          },
            h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'add'),
            h('span', null, 'New venue')
          )
        ),
        flash ? h('div', { className: 'portal-flash success', style: { marginTop: '0.75rem', marginBottom: 0 } }, flash) : null
      ),

      err ? h('div', { className: 'portal-card' },
        h('div', { className: 'portal-flash error' }, err)
      ) : null,

      loading
        ? h('div', { className: 'portal-card' }, 'Loading venues…')
        : !filtered.length
          ? h('div', { className: 'portal-card' },
              h('p', { style: { color: 'var(--text-secondary)', margin: 0 } },
                list.length ? 'No venues match that search.' : 'No venues yet. Add the first one.'
              )
            )
          : h('div', { className: 'portal-card', style: { padding: 0 } },
              h('div', { className: 'portal-table-wrap' },
                h('table', { className: 'portal-table' },
                  h('thead', null,
                    h('tr', null,
                      h('th', null, 'Name'),
                      h('th', null, 'Size'),
                      h('th', null, 'Location'),
                      h('th', null, 'Tags'),
                      h('th', null, '')
                    )
                  ),
                  h('tbody', null,
                    filtered.map(function (v) {
                      return h(VenueRow, {
                        key: v.id,
                        venue: v,
                        onEdit: function (vv) { setFormOpen({ venue: vv }); },
                        onDelete: handleDelete
                      });
                    })
                  )
                )
              )
            ),

      formOpen ? h(window.PVAdminModal, {
        title: formOpen.venue ? 'Edit venue' : 'New venue',
        size: 'lg',
        onClose: function () { setFormOpen(null); }
      },
        h(VenueForm, {
          initial: formOpen.venue || null,
          onSubmit: handleSubmit,
          onCancel: function () { setFormOpen(null); }
        })
      ) : null
    );
  }

  window.PVAdminVenues = Venues;
})();
