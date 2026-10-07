// ============================================================================
//  PVAdminSiteNav — Admin Settings → Navigation (root admin only)
//
//  Edits the site's nav as a tree. The top level holds groups (the dropdowns)
//  and plain links; a group holds links, section headings, dividers and the
//  campaign list (every main and side campaign plus One-Shots, filled in from
//  the campaigns worker). Drag rows to reorder them or move them between
//  groups, or use the arrows. Changes collect until Save; Discard drops them.
//
//  A link points either at a page from the Pages tab, which then decides who
//  sees it (a restricted page's link only shows to roles that can open it),
//  or at an address, which gets its own visibility rule. Groups and headings
//  with nothing visible under them hide themselves.
//
//  Unlisted pages shows every page with no link in the nav. Drag one into the
//  tree (or use its + button) to list it; drag a page link onto that row to
//  unlist it.
//
//  Worker routes (root only):
//    GET  /admin/site        { settings, pages, nav, permissions }
//    PUT  /admin/site/nav    { items: [ nested tree ] }
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;

  var TYPE_LABELS = {
    group: 'Group',
    link: 'Link',
    heading: 'Heading',
    divider: 'Divider',
    campaigns: 'Campaign list'
  };
  var VISIBILITY = [
    { value: 'everyone', label: 'Everyone' },
    { value: 'signed_in', label: 'Signed-in members' },
    { value: 'signed_out', label: 'Signed-out visitors' },
    { value: 'permission', label: 'Holders of a permission…' }
  ];
  function visibilityLabel(v) {
    var o = VISIBILITY.find(function (x) { return x.value === v; });
    return o ? o.label : v;
  }

  // ── Tree helpers ──────────────────────────────────────────────────────────
  // The draft is a list of top-level nodes; a group node carries children.
  // Lists are addressed as 'top' or a group node's key.
  var keySeq = 0;
  function newKey() { keySeq += 1; return 'n' + keySeq; }

  function makeNode(fields) {
    var node = Object.assign({
      key: newKey(), type: 'link', label: '', page_id: null, url: '',
      visibility: 'everyone', permission_key: '', new_tab: false
    }, fields);
    if (node.type === 'group' && !node.children) node.children = [];
    return node;
  }
  function toTree(flat) {
    function build(n) {
      var node = makeNode({
        type: n.type, label: n.label || '', page_id: n.page_id, url: n.url || '',
        visibility: n.visibility || 'everyone', permission_key: n.permission_key || '', new_tab: !!n.new_tab
      });
      if (n.type === 'group') {
        node.children = flat.filter(function (c) { return c.parent_id === n.id; }).map(build);
      }
      return node;
    }
    return flat.filter(function (n) { return n.parent_id == null; }).map(build);
  }
  function toPayload(tree) {
    return tree.map(function (n) {
      var out = {
        type: n.type, label: n.label, page_id: n.page_id, url: n.url,
        visibility: n.visibility, permission_key: n.permission_key, new_tab: n.new_tab
      };
      if (n.type === 'group') out.children = toPayload(n.children);
      return out;
    });
  }
  function getList(tree, listId) {
    if (listId === 'top') return tree;
    var g = tree.find(function (n) { return n.key === listId; });
    return g ? g.children : [];
  }
  function withList(tree, listId, list) {
    if (listId === 'top') return list;
    return tree.map(function (n) { return n.key === listId ? Object.assign({}, n, { children: list }) : n; });
  }
  function canHold(listId, type) {
    return listId === 'top' ? (type === 'group' || type === 'link') : type !== 'group';
  }
  function insertAt(tree, listId, index, node) {
    var list = getList(tree, listId).slice();
    list.splice(index, 0, node);
    return withList(tree, listId, list);
  }
  function removeAt(tree, listId, index) {
    var list = getList(tree, listId).slice();
    list.splice(index, 1);
    return withList(tree, listId, list);
  }
  function replaceAt(tree, listId, index, node) {
    var list = getList(tree, listId).slice();
    list[index] = node;
    return withList(tree, listId, list);
  }
  function moveTo(tree, from, toList, toIndex) {
    var node = getList(tree, from.list)[from.index];
    if (!node || !canHold(toList, node.type)) return tree;
    var idx = toIndex;
    if (from.list === toList && from.index < toIndex) idx -= 1;
    if (from.list === toList && from.index === idx) return tree;
    return insertAt(removeAt(tree, from.list, from.index), toList, idx, node);
  }
  function linkedPageIds(tree) {
    var ids = {};
    tree.forEach(function (n) {
      if (n.page_id) ids[n.page_id] = true;
      (n.children || []).forEach(function (c) { if (c.page_id) ids[c.page_id] = true; });
    });
    return ids;
  }

  // ── Item dialog (new or edit) ─────────────────────────────────────────────
  function ItemModal(props) {
    var isNew = !props.node;
    var start = props.node || makeNode({ type: props.types[0] });
    var draftState = useState(function () {
      return Object.assign({}, start, { target: start.page_id || isNew ? 'page' : 'url' });
    });
    var draft = draftState[0], setDraft = draftState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];
    function setField(k, v) { setDraft(function (d) { var n = Object.assign({}, d); n[k] = v; return n; }); }

    var pages = props.pages.slice().sort(function (a, b) { return a.title.localeCompare(b.title); });
    var page = pages.find(function (p) { return p.id === Number(draft.page_id); }) || null;
    var isPageLink = draft.type === 'link' && draft.target === 'page';
    var hasVisibility = (draft.type === 'link' && draft.target === 'url') || draft.type === 'campaigns';

    function save(e) {
      e.preventDefault();
      var node = Object.assign({}, draft);
      delete node.target;
      node.label = (node.label || '').trim();
      if (node.type === 'link') {
        if (isPageLink) {
          if (!node.page_id) { setErr('Pick a page.'); return; }
          node.page_id = Number(node.page_id); node.url = ''; node.visibility = 'everyone'; node.permission_key = '';
        } else {
          node.url = (node.url || '').trim(); node.page_id = null;
          if (!node.url) { setErr('Enter an address.'); return; }
          if (!node.label) { setErr('Links to an address need a label.'); return; }
        }
      }
      if ((node.type === 'group' || node.type === 'heading') && !node.label) { setErr('Enter a label.'); return; }
      if (hasVisibility && node.visibility === 'permission' && !node.permission_key) {
        setErr('Pick the permission that shows this item.'); return;
      }
      if (!hasVisibility && node.type !== 'link') { node.visibility = 'everyone'; node.permission_key = ''; }
      if (node.type === 'group' && !node.children) node.children = [];
      props.onSave(node);
    }

    var title = isNew ? 'Add to ' + props.listLabel : 'Edit ' + TYPE_LABELS[draft.type].toLowerCase();
    return h(window.PVAdminModal, { title: title, onClose: props.onClose },
      h('form', { onSubmit: save },
        err ? h('div', { className: 'portal-flash error', style: { marginBottom: '0.85rem' } }, err) : null,
        isNew && props.types.length > 1
          ? h('div', { className: 'portal-field' },
              h('label', null, 'Type'),
              h('select', { value: draft.type, onChange: function (e) { setField('type', e.target.value); } },
                props.types.map(function (t) { return h('option', { key: t, value: t }, TYPE_LABELS[t]); })))
          : null,

        draft.type === 'link'
          ? h('div', { className: 'portal-field' },
              h('label', null, 'Goes to'),
              h('div', { className: 'portal-checkbox-group' },
                ['page', 'url'].map(function (t) {
                  return h('label', { key: t, className: 'portal-checkbox-option' },
                    h('input', { type: 'radio', name: 'nav-target', checked: draft.target === t,
                      onChange: function () { setField('target', t); } }),
                    h('span', null, t === 'page' ? 'A page' : 'An address'));
                })))
          : null,
        isPageLink
          ? h('div', { className: 'portal-field' },
              h('label', null, 'Page *'),
              h('select', { value: draft.page_id || '', onChange: function (e) { setField('page_id', e.target.value); } },
                h('option', { value: '' }, '— pick a page —'),
                pages.map(function (p) {
                  return h('option', { key: p.id, value: p.id }, p.title + ' (' + PVAdminSiteShared.fileOf(p.path) + ')');
                })),
              h('p', { className: 'portal-field-help' }, 'The page\'s access decides who sees this link.'))
          : null,
        draft.type === 'link' && draft.target === 'url'
          ? h('div', { className: 'portal-field' },
              h('label', null, 'Address *'),
              h('input', { type: 'text', maxLength: 500, value: draft.url, placeholder: '/campaigns?tag=oneshot',
                onChange: function (e) { setField('url', e.target.value); } }),
              h('p', { className: 'portal-field-help' }, 'A path on this site, or a full https:// address.'))
          : null,

        draft.type === 'group' || draft.type === 'heading' || draft.type === 'link'
          ? h('div', { className: 'portal-field' },
              h('label', null, isPageLink ? 'Label' : 'Label *'),
              h('input', { type: 'text', maxLength: 80, value: draft.label,
                placeholder: isPageLink && page ? page.title : '',
                onChange: function (e) { setField('label', e.target.value); } }),
              isPageLink ? h('p', { className: 'portal-field-help' }, 'Leave empty to use the page title.') : null)
          : null,

        hasVisibility
          ? h('div', { className: 'portal-field' },
              h('label', null, 'Shown to'),
              h('select', { value: draft.visibility, onChange: function (e) { setField('visibility', e.target.value); } },
                VISIBILITY.map(function (v) { return h('option', { key: v.value, value: v.value }, v.label); })))
          : null,
        hasVisibility && draft.visibility === 'permission'
          ? h('div', { className: 'portal-field' },
              h('label', null, 'Permission *'),
              h('select', { value: draft.permission_key, onChange: function (e) { setField('permission_key', e.target.value); } },
                h('option', { value: '' }, '— pick a permission —'),
                props.permissions.map(function (p) {
                  return h('option', { key: p.key, value: p.key },
                    p.grp + ' › ' + p.page + (p.tab ? ' › ' + p.tab : '') + ' — ' + p.label);
                })))
          : null,

        draft.type === 'link'
          ? h('div', { className: 'portal-field' },
              h('label', { className: 'portal-checkbox-option' },
                h('input', { type: 'checkbox', checked: !!draft.new_tab, onChange: function (e) { setField('new_tab', e.target.checked); } }),
                h('span', null, 'Open in a new tab')))
          : null,
        draft.type === 'divider'
          ? h('p', { className: 'portal-field-help' }, 'A thin line between items in the dropdown.')
          : null,
        draft.type === 'campaigns'
          ? h('p', { className: 'portal-field-help' }, 'Lists every main and side campaign, then One-Shots.')
          : null,

        h('div', { className: 'portal-btn-row' },
          h('button', { type: 'submit', className: 'portal-btn' }, isNew ? 'Add' : 'Done'),
          h('button', { type: 'button', className: 'portal-btn is-ghost', onClick: props.onClose }, 'Cancel'))
      )
    );
  }

  // ── Place an unlisted page ───────────────────────────────────────────────
  function PlaceModal(props) {
    var groups = props.tree.filter(function (n) { return n.type === 'group'; });
    var placeState = useState(groups.length ? groups[0].key : 'top');
    var place = placeState[0], setPlace = placeState[1];
    return h(window.PVAdminModal, { title: 'Add "' + props.page.title + '" to the nav', onClose: props.onClose },
      h('div', { className: 'portal-field' },
        h('label', null, 'Place it at'),
        h('select', { value: place, onChange: function (e) { setPlace(e.target.value); } },
          groups.map(function (g) { return h('option', { key: g.key, value: g.key }, 'End of ' + g.label); }),
          h('option', { value: 'top' }, 'End of the top level'))),
      h('div', { className: 'portal-btn-row' },
        h('button', { type: 'button', className: 'portal-btn', onClick: function () { props.onPlace(place); } }, 'Add'),
        h('button', { type: 'button', className: 'portal-btn is-ghost', onClick: props.onClose }, 'Cancel'))
    );
  }

  // ── Section ───────────────────────────────────────────────────────────────
  function SiteNavSection() {
    var dataState = useState(null); var data = dataState[0], setData = dataState[1];
    var treeState = useState([]); var tree = treeState[0], setTree = treeState[1];
    var savedState = useState('[]'); var savedJson = savedState[0], setSavedJson = savedState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];
    var flashState = useState(''); var flash = flashState[0], setFlash = flashState[1];
    var savingState = useState(false); var saving = savingState[0], setSaving = savingState[1];
    // drag: { from: { list, index } } for a nav row, or { pageId } for an unlisted page
    var dragState = useState(null); var drag = dragState[0], setDrag = dragState[1];
    var overState = useState(''); var over = overState[0], setOver = overState[1];
    // editing: { list, index, node } (node null when adding)
    var editState = useState(null); var editing = editState[0], setEditing = editState[1];
    var placeState = useState(null); var placing = placeState[0], setPlacing = placeState[1];

    function adopt(d) {
      var t = toTree(d.nav || []);
      setData(d); setTree(t); setSavedJson(JSON.stringify(toPayload(t)));
    }
    useEffect(function () {
      PVAdminSiteShared.loadSite().then(adopt, function (e) { setErr(e.message || 'Failed to load the navigation.'); });
    }, []);

    if (!data) {
      return h('div', { className: 'portal-card' },
        err ? h('div', { className: 'portal-flash error' }, err) : h('p', { className: 'perm-loading' }, 'Loading navigation…'));
    }

    var pagesById = {};
    data.pages.forEach(function (p) { pagesById[p.id] = p; });
    var dirty = JSON.stringify(toPayload(tree)) !== savedJson;
    var linked = linkedPageIds(tree);
    var unlisted = data.pages.filter(function (p) { return !linked[p.id]; })
      .sort(function (a, b) { return a.title.localeCompare(b.title); });

    function change(t) { setTree(t); setFlash(''); }
    function save() {
      setSaving(true); setErr('');
      PVAdminAPI.request('PUT', '/admin/site/nav', { items: toPayload(tree) }, true).then(function (d) {
        adopt(d); setFlash('Navigation saved.');
      }, function (e) {
        setErr(e.message || 'Failed to save the navigation.');
      }).then(function () { setSaving(false); });
    }
    function discard() { adopt(data); setErr(''); }

    // ── Drag and drop ──
    function dragNode() { return drag && drag.from ? getList(tree, drag.from.list)[drag.from.index] : null; }
    function accepts(listId) {
      if (!drag) return false;
      if (drag.pageId) return true; // a page becomes a link, which every list holds
      var n = dragNode();
      return !!n && canHold(listId, n.type);
    }
    function dropProps(listId, index) {
      var id = listId + ':' + index;
      return {
        onDragOver: function (e) {
          if (!accepts(listId)) return;
          e.preventDefault(); e.stopPropagation();
          setDropEffect(e);
          if (over !== id) setOver(id);
        },
        onDrop: function (e) {
          e.preventDefault(); e.stopPropagation();
          if (!accepts(listId)) return;
          if (drag.pageId) change(insertAt(tree, listId, index, makeNode({ type: 'link', page_id: drag.pageId })));
          else change(moveTo(tree, drag.from, listId, index));
          setDrag(null); setOver('');
        }
      };
    }
    function endDrag() { setDrag(null); setOver(''); }
    // Every drag here is a "move" (start and target must agree, or Safari
    // refuses the drop).
    function startDrag(e, next, token) {
      setDrag(next);
      try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', token); } catch (_) {}
    }
    function setDropEffect(e) {
      try { e.dataTransfer.dropEffect = 'move'; } catch (_) {}
    }

    // ── Rows ──
    function iconBtn(icon, label, onClick, disabled) {
      return h('button', { type: 'button', className: 'portal-btn is-ghost is-icon is-small', title: label,
        'aria-label': label, disabled: !!disabled || saving, onClick: onClick },
        h('span', { className: 'material-icons', 'aria-hidden': 'true' }, icon));
    }
    function describe(n) {
      if (n.type === 'group') return [h('span', { key: 'l', className: 'portal-strong' }, n.label)];
      if (n.type === 'heading') return [h('span', { key: 'l', className: 'nav-ed-heading' }, n.label)];
      if (n.type === 'divider') return [h('span', { key: 'l', className: 'portal-muted' }, 'Divider')];
      if (n.type === 'campaigns') {
        return [h('span', { key: 'l' }, 'Campaign list'),
          h('span', { key: 's', className: 'nav-ed-sub' }, 'main and side campaigns, then One-Shots')];
      }
      if (n.page_id) {
        var p = pagesById[n.page_id];
        if (!p) return [h('span', { key: 'l', className: 'portal-muted' }, 'Missing page')];
        return [h('span', { key: 'l' }, n.label || p.title),
          h('span', { key: 's', className: 'nav-ed-sub' }, PVAdminSiteShared.fileOf(p.path)),
          h('span', { key: 'a' }, PVAdminSiteShared.accessBadge(p)),
          p.needs_review ? h('span', { key: 'r', className: 'portal-badge is-warn' }, 'Needs review') : null];
      }
      return [h('span', { key: 'l' }, n.label), h('span', { key: 's', className: 'nav-ed-sub' }, n.url)];
    }
    function badges(n) {
      var out = [];
      if ((n.type === 'campaigns' || (n.type === 'link' && !n.page_id)) && n.visibility !== 'everyone') {
        out.push(h('span', { key: 'v', className: 'portal-badge' },
          n.visibility === 'permission' ? 'By permission' : visibilityLabel(n.visibility)));
      }
      if (n.new_tab) out.push(h('span', { key: 't', className: 'portal-badge' }, 'New tab'));
      return out;
    }
    function row(n, listId, index, length) {
      var id = listId + ':' + index;
      var isDragging = drag && drag.from && drag.from.list === listId && drag.from.index === index;
      var editable = n.type !== 'divider';
      return h('div', Object.assign({
        key: n.key,
        className: 'nav-ed-row' + (n.type === 'group' ? ' is-group' : '') + (isDragging ? ' is-dragging' : '') +
          (over === id && !isDragging ? ' is-over' : ''),
        draggable: !saving,
        onDragStart: function (e) {
          e.stopPropagation();
          startDrag(e, { from: { list: listId, index: index } }, n.key);
        },
        onDragEnd: endDrag
      }, dropProps(listId, index)),
        h('span', { className: 'material-symbols-outlined nav-ed-handle', 'aria-hidden': 'true', title: 'Drag to move' }, 'drag_indicator'),
        h('span', { className: 'nav-ed-type' }, TYPE_LABELS[n.type]),
        h('span', { className: 'nav-ed-main' }, describe(n), badges(n)),
        h('span', { className: 'nav-ed-actions' },
          iconBtn('arrow_upward', 'Move up', function () { change(moveTo(tree, { list: listId, index: index }, listId, index - 1)); }, index === 0),
          iconBtn('arrow_downward', 'Move down', function () { change(moveTo(tree, { list: listId, index: index }, listId, index + 2)); }, index === length - 1),
          editable ? iconBtn('edit', 'Edit', function () { setEditing({ list: listId, index: index, node: n }); }) : null,
          iconBtn('close', 'Remove', function () {
            if (n.type === 'group' && n.children.length &&
                !confirm('Remove the "' + n.label + '" group and the ' + n.children.length + ' items in it?')) return;
            change(removeAt(tree, listId, index));
          }))
      );
    }
    function endZone(listId, length, label) {
      var id = listId + ':' + length;
      return h('div', Object.assign({
        className: 'nav-ed-end' + (accepts(listId) ? ' is-active' : '') + (over === id ? ' is-over' : '')
      }, dropProps(listId, length)), accepts(listId) ? 'Drop here to add to the end of ' + label : null);
    }
    function addButton(listId, label, types) {
      return h('button', { type: 'button', className: 'portal-btn is-ghost is-small', disabled: saving,
        onClick: function () { setEditing({ list: listId, index: getList(tree, listId).length, node: null, types: types, label: label }); } },
        h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'add'), 'Add to ' + label);
    }

    var editTypes = editing && !editing.node ? editing.types : null;
    return h('div', null,
      flash ? h('div', { className: 'portal-flash success', style: { marginBottom: '1rem' } }, flash) : null,
      h('div', { className: 'portal-card' },
        h('div', { className: 'portal-card-header' },
          h('h2', { className: 'portal-card-title' }, 'Navigation'),
          h('div', { className: 'portal-card-actions' }, addButton('top', 'the top level', ['group', 'link']))),
        err ? h('div', { className: 'portal-flash error', style: { marginBottom: '0.85rem' } }, err) : null,
        h('div', { className: 'nav-ed-list' },
          tree.map(function (n, i) {
            if (n.type !== 'group') return row(n, 'top', i, tree.length);
            return h('div', { key: n.key, className: 'nav-ed-group' },
              row(n, 'top', i, tree.length),
              h('div', { className: 'nav-ed-children' },
                n.children.map(function (c, j) { return row(c, n.key, j, n.children.length); }),
                endZone(n.key, n.children.length, n.label),
                h('div', null, addButton(n.key, n.label, ['link', 'heading', 'divider', 'campaigns']))));
          }),
          tree.length ? null : h('p', { className: 'portal-muted' }, 'The nav is empty.'),
          endZone('top', tree.length, 'the top level')),
        dirty
          ? h('div', { className: 'perm-savebar' },
              h('span', { className: 'perm-savebar-count' }, 'Unsaved changes'),
              h('button', { type: 'button', className: 'portal-btn is-ghost', disabled: saving, onClick: discard }, 'Discard'),
              h('button', { type: 'button', className: 'portal-btn', disabled: saving, onClick: save }, saving ? 'Saving…' : 'Save'))
          : null),

      h('div', { className: 'portal-card' },
        h('div', { className: 'portal-card-header' }, h('h2', { className: 'portal-card-title' }, 'Unlisted pages')),
        h('p', { className: 'portal-field-help', style: { marginTop: 0 } },
          'Pages with no link in the nav. Drag one into the nav to list it, or drag a page link here to unlist it. ' +
          'Unlisted pages still open from links elsewhere, for anyone with access.'),
        h('div', {
          className: 'nav-ed-unlisted' + (over === 'unlisted' ? ' is-over' : ''),
          onDragOver: function (e) {
            var n = dragNode();
            if (!n || n.type !== 'link' || !n.page_id) return;
            e.preventDefault();
            setDropEffect(e);
            if (over !== 'unlisted') setOver('unlisted');
          },
          onDrop: function (e) {
            e.preventDefault();
            var n = dragNode();
            if (n && n.type === 'link' && n.page_id) change(removeAt(tree, drag.from.list, drag.from.index));
            endDrag();
          }
        },
          unlisted.length
            ? unlisted.map(function (p) {
                var isDragging = drag && drag.pageId === p.id;
                return h('div', {
                  key: p.id, className: 'nav-ed-row' + (isDragging ? ' is-dragging' : ''), draggable: !saving,
                  onDragStart: function (e) { startDrag(e, { pageId: p.id }, 'page-' + p.id); },
                  onDragEnd: endDrag
                },
                  h('span', { className: 'material-symbols-outlined nav-ed-handle', 'aria-hidden': 'true', title: 'Drag into the nav' }, 'drag_indicator'),
                  h('span', { className: 'nav-ed-main' },
                    h('span', null, p.title),
                    h('span', { className: 'nav-ed-sub' }, PVAdminSiteShared.fileOf(p.path)),
                    PVAdminSiteShared.accessBadge(p),
                    p.needs_review ? h('span', { className: 'portal-badge is-warn' }, 'Needs review') : null),
                  h('span', { className: 'nav-ed-actions' }, iconBtn('add', 'Add to the nav', function () { setPlacing(p); })));
              })
            : h('span', { className: 'portal-muted' }, 'Every page is in the nav.'))),

      editing
        ? h(ItemModal, {
            node: editing.node,
            types: editTypes || [editing.node.type],
            listLabel: editing.label || '',
            pages: data.pages,
            permissions: data.permissions || [],
            onClose: function () { setEditing(null); },
            onSave: function (node) {
              change(editing.node
                ? replaceAt(tree, editing.list, editing.index, Object.assign(node, { key: editing.node.key }))
                : insertAt(tree, editing.list, editing.index, node));
              setEditing(null);
            }
          })
        : null,
      placing
        ? h(PlaceModal, {
            page: placing,
            tree: tree,
            onClose: function () { setPlacing(null); },
            onPlace: function (listId) {
              change(insertAt(tree, listId, getList(tree, listId).length, makeNode({ type: 'link', page_id: placing.id })));
              setPlacing(null);
            }
          })
        : null
    );
  }

  window.PVAdminSiteNav = SiteNavSection;
})();
