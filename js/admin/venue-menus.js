// ============================================================================
//  PVAdminVenueMenus — per-venue menu editing (venues.menus)
//
//  Rendered as the "Menus" tab of the Venues section (see js/admin/venues.js).
//  Only venues flagged has_menu appear in the picker; the worker enforces the
//  same rule on write, so an unflagged venue can never gain items.
//
//  Categories own their own sort order, items sort within their category —
//  the two are independent, so re-ordering one never disturbs the other.
//
//  Worker routes:
//    GET    /menus?venue_id=:id      public (shared with the public page)
//    POST   /menu-categories         venues.menus
//    PATCH  /menu-categories/:id     venues.menus
//    DELETE /menu-categories/:id     venues.menus
//    POST   /menu-categories/reorder venues.menus  { venue_id, ids: [] }
//    POST   /menus                   venues.menus
//    PATCH  /menus/:id               venues.menus
//    DELETE /menus/:id               venues.menus
//    POST   /menus/reorder           venues.menus  { category_id, ids: [] }
//    POST   /images                  venues.menus  (kind 'menu', multipart -> { url })
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;

  // Menu images are cropped square at this size (set with the other upload
  // sizes in js/admin/image-upload.js, KINDS.menu).
  var MENU_IMAGE_SIZE = PVAdminImageUpload.KINDS.menu.maxSize;

  // ── Category icons ───────────────────────────────────────────────────────
  //  Must stay in sync with MENU_ICONS in js/menus.js — the worker stores
  //  only the key.
  var DEFAULT_ICON = 'dish';
  var MENU_ICONS = {
    dish:    '<path d="M3 18h18"/><path d="M5 18a7 7 0 0 1 14 0"/><circle cx="12" cy="6" r="1"/>',
    bowl:    '<path d="M3 10h18"/><path d="M4 10a8 8 0 0 0 16 0"/><path d="M11 6c-1-1 0-2 1-3"/>',
    goblet:  '<path d="M7 3h10l-1 6a4 4 0 0 1-8 0z"/><path d="M12 14v6"/><path d="M9 20h6"/>',
    tankard: '<path d="M5 5h11v15H5z"/><path d="M16 8h2.5a2.5 2.5 0 0 1 0 5H16"/><path d="M5 9h11"/>',
    teacup:  '<path d="M4 8h12v4a6 6 0 0 1-12 0z"/><path d="M16 9h2a2 2 0 0 1 0 4h-2"/><path d="M3 20h15"/>',
    bottle:  '<path d="M10 2h4v4l2 3v11a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V9l2-3z"/><path d="M8 13h8"/>',
    bread:   '<path d="M4 12a4 4 0 0 1 4-4h8a4 4 0 0 1 0 8H8a4 4 0 0 1-4-4z"/><path d="M9 8v8"/><path d="M13 8v8"/>',
    fish:    '<path d="M3 12c4-5 9-5 12 0-3 5-8 5-12 0z"/><path d="M15 12l6-4v8z"/><circle cx="7" cy="11" r=".7"/>',
    skewer:  '<circle cx="9" cy="8" r="3"/><circle cx="14" cy="13" r="3"/><path d="M4 20 20 4"/>',
    cake:    '<path d="M4 20h16v-6a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4z"/><path d="M12 6V3"/><path d="M4 16h16"/>',
    fruit:   '<circle cx="12" cy="14" r="6"/><path d="M12 8V4"/><path d="M12 6c2-2 4-2 4-2"/>',
    herb:    '<path d="M20 4C10 4 4 10 4 20c10 0 16-6 16-16z"/><path d="M4 20 14 10"/>',
    flame:   '<path d="M12 3c4 5 6 7 6 11a6 6 0 0 1-12 0c0-2 1-4 3-6 0 2 1 3 2 3 1 0 1-4 1-8z"/>',
    pot:     '<path d="M4 10h16v3a8 8 0 0 1-16 0z"/><path d="M2 10h20"/><path d="M9 6c0-1 1-1 1-2"/><path d="M14 6c0-1 1-1 1-2"/>',
    cheese:  '<path d="M3 16l16-8v8z"/><circle cx="14" cy="13" r="1"/><circle cx="9" cy="14" r="1"/>',
    star:    '<path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6L12 16.8 6.7 19.6l1.1-6L3.4 9.4l6-.8z"/>'
  };
  var ICON_KEYS = Object.keys(MENU_ICONS);

  var ICON_LABEL = {
    dish: 'Covered dish', bowl: 'Bowl', goblet: 'Goblet', tankard: 'Tankard',
    teacup: 'Teacup', bottle: 'Bottle', bread: 'Bread', fish: 'Fish',
    skewer: 'Skewer', cake: 'Cake', fruit: 'Fruit', herb: 'Herb',
    flame: 'Flame', pot: 'Pot', cheese: 'Cheese', star: 'Special'
  };

  function Icon(props) {
    var key = MENU_ICONS[props.name] ? props.name : DEFAULT_ICON;
    return h('svg', {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.5,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true',
      style: Object.assign({
        width: props.size || 20, height: props.size || 20, flex: '0 0 auto'
      }, props.style || {}),
      dangerouslySetInnerHTML: { __html: MENU_ICONS[key] }
    });
  }

  function formatCost(cost) {
    if (cost == null || cost === '') return '—';
    var n = Number(cost);
    if (!isFinite(n)) return '—';
    return n.toLocaleString('en-US') + ' gil';
  }

  // ── Icon picker ──────────────────────────────────────────────────────────
  function IconPicker(props) {
    var value = props.value || DEFAULT_ICON;
    return h('div', {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(8, 1fr)',
        gap: '0.4rem',
        maxWidth: '360px'
      }
    }, ICON_KEYS.map(function (key) {
      var active = key === value;
      return h('button', {
        key: key,
        type: 'button',
        title: ICON_LABEL[key] || key,
        'aria-label': ICON_LABEL[key] || key,
        'aria-pressed': active ? 'true' : 'false',
        onClick: function () { props.onChange(key); },
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0.4rem',
          background: active ? 'var(--bg-darker)' : 'var(--bg-card-light)',
          border: '1px solid ' + (active ? 'var(--accent-brown)' : 'var(--border-color)'),
          borderRadius: '0.25rem',
          color: active ? 'var(--accent-brown)' : 'var(--text-secondary)',
          cursor: 'pointer'
        }
      }, h(Icon, { name: key, size: 20 }));
    }));
  }

  // ── Category form ────────────────────────────────────────────────────────
  function CategoryForm(props) {
    var initial = props.initial;
    var isEdit = !!(initial && initial.id);
    var nameState = useState(initial ? (initial.name || '') : '');
    var name = nameState[0], setName = nameState[1];
    var iconState = useState(initial ? (initial.icon || DEFAULT_ICON) : DEFAULT_ICON);
    var icon = iconState[0], setIcon = iconState[1];
    var savingState = useState(false);
    var saving = savingState[0], setSaving = savingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];

    async function submit(e) {
      e.preventDefault();
      if (!name.trim()) { setErr('A category name is required.'); return; }
      setErr(''); setSaving(true);
      try {
        await props.onSubmit({ name: name.trim(), icon: icon });
      } catch (ex) {
        setErr(ex.message || 'Save failed.');
        setSaving(false);
      }
    }

    return h('form', { onSubmit: submit },
      err ? h('div', { className: 'portal-flash error' }, err) : null,

      h('div', { className: 'portal-field' },
        h('label', null, 'Category name'),
        h('input', {
          type: 'text',
          value: name,
          maxLength: 60,
          onChange: function (e) { setName(e.target.value); },
          placeholder: 'Small Plates, Drink, Sweets…',
          autoFocus: true
        })
      ),

      h('div', { className: 'portal-field' },
        h('label', null, 'Placeholder icon'),
        h('p', {
          style: { margin: '0 0 0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }
        }, 'Shown in place of a photo for items in this category that don’t have one.'),
        h(IconPicker, { value: icon, onChange: setIcon })
      ),

      h('div', { className: 'portal-form-actions' },
        h('button', { type: 'submit', className: 'portal-btn', disabled: saving },
          saving ? 'Saving…' : (isEdit ? 'Save category' : 'Add category')),
        h('button', {
          type: 'button', className: 'portal-btn is-ghost',
          onClick: props.onCancel, disabled: saving
        }, 'Cancel')
      )
    );
  }

  // ── Item form ────────────────────────────────────────────────────────────
  function ItemForm(props) {
    var initial = props.initial;
    var isEdit = !!(initial && initial.id);
    var draftState = useState({
      name: initial ? (initial.name || '') : '',
      description: initial ? (initial.description || '') : '',
      cost: initial && initial.cost != null ? String(initial.cost) : '',
      image_url: initial ? (initial.image_url || '') : ''
    });
    var draft = draftState[0], setDraft = draftState[1];
    var savingState = useState(false);
    var saving = savingState[0], setSaving = savingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];

    function setField(k, v) {
      setDraft(function (d) {
        var next = Object.assign({}, d);
        next[k] = v;
        return next;
      });
    }

    var up = PVAdminImageUpload.useImageUpload({
      kind: 'menu',
      name: props.venueName,
      onUploaded: function (url) { setField('image_url', url); }
    });
    var uploading = up.uploading;

    async function submit(e) {
      e.preventDefault();
      if (!draft.name.trim()) { setErr('An item name is required.'); return; }
      var cost = null;
      if (draft.cost !== '') {
        var n = Number(draft.cost);
        if (!isFinite(n) || n < 0 || Math.floor(n) !== n) {
          setErr('Cost must be a whole number of gil, or left blank.');
          return;
        }
        cost = n;
      }
      setErr(''); setSaving(true);
      try {
        await props.onSubmit({
          name: draft.name.trim(),
          description: draft.description.trim() || null,
          cost: cost,
          image_url: draft.image_url.trim() || null
        });
      } catch (ex) {
        setErr(ex.message || 'Save failed.');
        setSaving(false);
      }
    }

    return h('form', { onSubmit: submit },
      err ? h('div', { className: 'portal-flash error' }, err) : null,

      h('div', { className: 'portal-field' },
        h('label', null, 'Item name'),
        h('input', {
          type: 'text',
          value: draft.name,
          maxLength: 120,
          onChange: function (e) { setField('name', e.target.value); },
          autoFocus: true
        })
      ),

      h('div', { className: 'portal-field' },
        h('label', null, 'Description'),
        h('textarea', {
          rows: 3,
          value: draft.description,
          maxLength: 500,
          onChange: function (e) { setField('description', e.target.value); },
          placeholder: 'A sentence or two. Plain text — no markdown.'
        })
      ),

      h('div', { className: 'portal-field' },
        h('label', null, 'Cost (gil)'),
        h('input', {
          type: 'number',
          min: '0',
          step: '1',
          value: draft.cost,
          onChange: function (e) { setField('cost', e.target.value); },
          placeholder: 'Leave blank for no listed price',
          style: { maxWidth: '220px' }
        })
      ),

      h('div', { className: 'portal-field' },
        h('label', null, 'Image'),
        h('p', {
          style: { margin: '0 0 0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }
        }, 'Cropped square from the centre and saved at ' + MENU_IMAGE_SIZE + '×' + MENU_IMAGE_SIZE + '. Items without one show the category icon.'),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '0.75rem' } },
          draft.image_url
            ? h('img', {
                src: draft.image_url, alt: '',
                style: { width: '64px', height: '64px', objectFit: 'cover', borderRadius: '0.3rem' }
              })
            : h('div', {
                style: {
                  width: '64px', height: '64px', borderRadius: '0.3rem',
                  background: 'var(--bg-darker)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  color: 'var(--text-secondary)'
                }
              }, h(Icon, { name: props.categoryIcon, size: 26 })),
          h(PVAdminImageUpload.UploadButton, { busy: uploading, disabled: saving, title: null, onFile: up.upload }),
          draft.image_url ? h('button', {
            type: 'button',
            className: 'portal-btn is-ghost is-small',
            onClick: function () { setField('image_url', ''); },
            disabled: uploading || saving
          }, 'Remove') : null
        ),
        up.error ? h('p', {
          style: { margin: '0.4rem 0 0', color: 'var(--accent-red)', fontSize: '0.85rem' }
        }, up.error) : null
      ),

      h('div', { className: 'portal-form-actions' },
        h('button', { type: 'submit', className: 'portal-btn', disabled: saving || uploading },
          saving ? 'Saving…' : (isEdit ? 'Save item' : 'Add item')),
        h('button', {
          type: 'button', className: 'portal-btn is-ghost',
          onClick: props.onCancel, disabled: saving
        }, 'Cancel')
      )
    );
  }

  // ── Main ─────────────────────────────────────────────────────────────────
  function VenueMenus() {
    var venuesState = useState([]);
    var venues = venuesState[0], setVenues = venuesState[1];
    var venueIdState = useState('');
    var venueId = venueIdState[0], setVenueId = venueIdState[1];
    var catsState = useState([]);
    var cats = catsState[0], setCats = catsState[1];
    var loadingState = useState(true);
    var loading = loadingState[0], setLoading = loadingState[1];
    var loadingMenuState = useState(false);
    var loadingMenu = loadingMenuState[0], setLoadingMenu = loadingMenuState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];
    var flashState = useState('');
    var flash = flashState[0], setFlash = flashState[1];
    var catFormState = useState(null);   // null | { category }
    var catForm = catFormState[0], setCatForm = catFormState[1];
    var itemFormState = useState(null);  // null | { category, item }
    var itemForm = itemFormState[0], setItemForm = itemFormState[1];

    function flashFor(msg) {
      setFlash(msg);
      setTimeout(function () { setFlash(''); }, 3500);
    }

    var venue = null;
    for (var i = 0; i < venues.length; i++) {
      if (String(venues[i].id) === String(venueId)) { venue = venues[i]; break; }
    }

    async function loadVenues() {
      setErr('');
      try {
        var data = await PVAdminAPI.request('GET', '/venues', undefined, true);
        var withMenus = (Array.isArray(data) ? data : []).filter(function (v) {
          return !!v.has_menu;
        }).sort(function (a, b) {
          return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
        });
        setVenues(withMenus);
      } catch (e) {
        setErr(e.message || 'Failed to load venues.');
      } finally {
        setLoading(false);
      }
    }

    async function loadMenu(id) {
      if (!id) { setCats([]); return; }
      setLoadingMenu(true);
      setErr('');
      try {
        var data = await PVAdminAPI.request('GET', '/menus?venue_id=' + encodeURIComponent(id), undefined, true);
        setCats((data && Array.isArray(data.categories)) ? data.categories : []);
      } catch (e) {
        setErr(e.message || 'Failed to load this menu.');
        setCats([]);
      } finally {
        setLoadingMenu(false);
      }
    }

    useEffect(function () { loadVenues(); }, []);
    useEffect(function () { loadMenu(venueId); }, [venueId]);

    // ── Category actions ───────────────────────────────────────────────────
    async function submitCategory(payload) {
      var editing = catForm && catForm.category;
      if (editing) {
        await PVAdminAPI.request('PATCH', '/menu-categories/' + editing.id, payload, true);
        flashFor('Category updated.');
      } else {
        await PVAdminAPI.request('POST', '/menu-categories',
          Object.assign({ venue_id: Number(venueId) }, payload), true);
        flashFor('Category added.');
      }
      setCatForm(null);
      await loadMenu(venueId);
    }

    async function deleteCategory(cat) {
      var count = (cat.items || []).length;
      var msg = count
        ? 'Delete "' + cat.name + '" and its ' + count + ' item' + (count === 1 ? '' : 's') + '? This cannot be undone.'
        : 'Delete the empty category "' + cat.name + '"?';
      if (!confirm(msg)) return;
      try {
        await PVAdminAPI.request('DELETE', '/menu-categories/' + cat.id, undefined, true);
        flashFor('Category deleted.');
        await loadMenu(venueId);
      } catch (e) {
        setErr(e.message || 'Failed to delete the category.');
      }
    }

    async function moveCategory(index, delta) {
      var target = index + delta;
      if (target < 0 || target >= cats.length) return;
      var ordered = cats.slice();
      var tmp = ordered[index];
      ordered[index] = ordered[target];
      ordered[target] = tmp;
      setCats(ordered);
      try {
        await PVAdminAPI.request('POST', '/menu-categories/reorder', {
          venue_id: Number(venueId),
          ids: ordered.map(function (c) { return c.id; })
        }, true);
      } catch (e) {
        setErr(e.message || 'Failed to save the new order.');
        await loadMenu(venueId);
      }
    }

    // ── Item actions ───────────────────────────────────────────────────────
    async function submitItem(payload) {
      var cat = itemForm.category;
      var editing = itemForm.item;
      if (editing) {
        await PVAdminAPI.request('PATCH', '/menus/' + editing.id, payload, true);
        flashFor('Item updated.');
      } else {
        await PVAdminAPI.request('POST', '/menus',
          Object.assign({ category_id: cat.id }, payload), true);
        flashFor('Item added.');
      }
      setItemForm(null);
      await loadMenu(venueId);
    }

    async function deleteItem(item) {
      if (!confirm('Delete "' + item.name + '"?')) return;
      try {
        await PVAdminAPI.request('DELETE', '/menus/' + item.id, undefined, true);
        flashFor('Item deleted.');
        await loadMenu(venueId);
      } catch (e) {
        setErr(e.message || 'Failed to delete the item.');
      }
    }

    async function moveItem(cat, index, delta) {
      var items = (cat.items || []).slice();
      var target = index + delta;
      if (target < 0 || target >= items.length) return;
      var tmp = items[index];
      items[index] = items[target];
      items[target] = tmp;
      setCats(cats.map(function (c) {
        return c.id === cat.id ? Object.assign({}, c, { items: items }) : c;
      }));
      try {
        await PVAdminAPI.request('POST', '/menus/reorder', {
          category_id: cat.id,
          ids: items.map(function (it) { return it.id; })
        }, true);
      } catch (e) {
        setErr(e.message || 'Failed to save the new order.');
        await loadMenu(venueId);
      }
    }

    // ── Render ─────────────────────────────────────────────────────────────
    function arrowBtn(label, onClick, disabled) {
      return h('button', {
        type: 'button',
        className: 'portal-btn is-small is-ghost',
        onClick: onClick,
        disabled: disabled,
        'aria-label': label === '▲' ? 'Move up' : 'Move down',
        style: { padding: '0.15rem 0.4rem', opacity: disabled ? 0.35 : 1 }
      }, label);
    }

    function renderItem(cat, item, index, total) {
      return h('li', {
        key: item.id,
        style: {
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.5rem 0',
          borderTop: index === 0 ? 'none' : '1px solid var(--border-color)'
        }
      },
        item.image_url
          ? h('img', {
              src: item.image_url, alt: '', loading: 'lazy',
              style: { width: '44px', height: '44px', objectFit: 'cover', borderRadius: '0.25rem', flex: '0 0 auto' }
            })
          : h('div', {
              style: {
                width: '44px', height: '44px', borderRadius: '0.25rem', flex: '0 0 auto',
                background: 'var(--bg-darker)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)'
              }
            }, h(Icon, { name: cat.icon, size: 20 })),

        h('div', { style: { flex: 1, minWidth: 0 } },
          h('div', { className: 'portal-strong' }, item.name),
          item.description
            ? h('div', {
                style: {
                  fontSize: '0.85rem', color: 'var(--text-secondary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }
              }, item.description)
            : null
        ),

        h('div', {
          style: { color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontSize: '0.9rem' }
        }, formatCost(item.cost)),

        h('div', { style: { display: 'flex', gap: '0.2rem', flex: '0 0 auto' } },
          arrowBtn('▲', function () { moveItem(cat, index, -1); }, index === 0),
          arrowBtn('▼', function () { moveItem(cat, index, 1); }, index === total - 1),
          h('button', {
            type: 'button', className: 'portal-btn is-small is-ghost',
            onClick: function () { setItemForm({ category: cat, item: item }); }
          }, 'Edit'),
          h('button', {
            type: 'button', className: 'portal-btn is-small is-danger',
            onClick: function () { deleteItem(item); }
          }, 'Delete')
        )
      );
    }

    function renderCategory(cat, index) {
      var items = cat.items || [];
      return h('div', { key: cat.id, className: 'portal-card' },
        h('div', {
          style: {
            display: 'flex', alignItems: 'center', gap: '0.6rem',
            flexWrap: 'wrap', marginBottom: items.length ? '0.5rem' : 0
          }
        },
          h('span', { style: { color: 'var(--accent-brown)', display: 'flex' } },
            h(Icon, { name: cat.icon, size: 20 })),
          h('h3', {
            className: 'portal-card-title portal-head-title'
          }, cat.name),
          arrowBtn('▲', function () { moveCategory(index, -1); }, index === 0),
          arrowBtn('▼', function () { moveCategory(index, 1); }, index === cats.length - 1),
          h('button', {
            type: 'button', className: 'portal-btn is-small is-ghost',
            onClick: function () { setCatForm({ category: cat }); }
          }, 'Edit'),
          h('button', {
            type: 'button', className: 'portal-btn is-small is-danger',
            onClick: function () { deleteCategory(cat); }
          }, 'Delete'),
          h('button', {
            type: 'button', className: 'portal-btn is-small',
            onClick: function () { setItemForm({ category: cat, item: null }); }
          }, 'Add item')
        ),

        items.length
          ? h('ul', { style: { listStyle: 'none', margin: 0, padding: 0 } },
              items.map(function (it, i) { return renderItem(cat, it, i, items.length); }))
          : h('p', {
              style: { margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }
            }, 'No items in this category yet.')
      );
    }

    return h('div', null,
      h('div', { className: 'portal-card portal-head' },
        h('div', {
          className: 'portal-head-row'
        },
          h('h2', { className: 'portal-card-title portal-head-title' }, 'Venue Menus'),
          h('select', {
            className: 'portal-search',
            value: venueId,
            onChange: function (e) { setVenueId(e.target.value); },
            disabled: loading || !venues.length,
            style: { minWidth: '220px' }
          },
            h('option', { value: '' },
              venues.length ? 'Choose a venue…' : 'No menu-enabled venues'),
            venues.map(function (v) {
              return h('option', { key: v.id, value: v.id }, v.name);
            })
          ),
          venueId ? h('button', {
            type: 'button',
            className: 'portal-btn',
            onClick: function () { setCatForm({ category: null }); }
          },
            h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'add'),
            h('span', null, 'New category')
          ) : null
        ),
        flash ? h('div', {
          className: 'portal-flash success is-head'
        }, flash) : null
      ),

      err ? h('div', { className: 'portal-card' },
        h('div', { className: 'portal-flash error' }, err)
      ) : null,

      loading
        ? h('div', { className: 'portal-card' }, 'Loading venues…')
        : !venues.length
          ? h('div', { className: 'portal-card' },
              h('p', { className: 'portal-note' },
                'No venue has a menu enabled yet. Open the Directory tab, edit a ' +
                'venue tagged Tavern or Restaurant, and tick “Has a menu”.'))
          : !venueId
            ? h('div', { className: 'portal-card' },
                h('p', { className: 'portal-note' },
                  'Choose a venue above to edit its menu.'))
            : loadingMenu
              ? h('div', { className: 'portal-card' }, 'Loading menu…')
              : !cats.length
                ? h('div', { className: 'portal-card' },
                    h('p', { className: 'portal-note' },
                      'This menu is empty. Add a category to get started — items ' +
                      'live inside categories.'))
                : cats.map(renderCategory),

      catForm ? h(window.PVAdminModal, {
        title: catForm.category ? 'Edit category' : 'New category',
        onClose: function () { setCatForm(null); }
      },
        h(CategoryForm, {
          initial: catForm.category,
          onSubmit: submitCategory,
          onCancel: function () { setCatForm(null); }
        })
      ) : null,

      itemForm ? h(window.PVAdminModal, {
        title: itemForm.item ? 'Edit item' : ('New item — ' + itemForm.category.name),
        size: 'lg',
        onClose: function () { setItemForm(null); }
      },
        h(ItemForm, {
          initial: itemForm.item,
          categoryIcon: itemForm.category.icon,
          venueName: venue ? venue.name : '',
          onSubmit: submitItem,
          onCancel: function () { setItemForm(null); }
        })
      ) : null
    );
  }

  window.PVAdminVenueMenus = VenueMenus;
})();
