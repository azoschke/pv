// ============================================================================
//  PVAdminPermissions — the permission grid (root admin only)
//
//  Rows come from the permissions table as Page → Tab → Action; columns are
//  roles. Clicking a cell cycles blank → Allow → Deny. Changes collect as
//  pending (highlighted) until Save; Discard drops them. Across a person's
//  roles, Deny wins. An action allowed for a role that can't see its page or
//  tab gets a warning tint.
//
//  Roles can be added, relabelled, reordered and deleted here; deleting is
//  refused while any account still has the role (the worker names those
//  accounts).
//
//  Worker routes (root only):
//    GET    /admin/permissions   { permissions, roles, grants }
//    PUT    /admin/permissions   { changes: [{ role_id, permission_key, effect }] }
//    POST   /admin/roles         { slug, label }
//    POST   /admin/roles/reorder { ids }
//    PATCH  /admin/roles/:id     { label }
//    DELETE /admin/roles/:id
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useMemo = React.useMemo;

  var NEXT = { '': 'allow', allow: 'deny', deny: '' };
  var SYMBOL = { '': '·', allow: '✓', deny: '✕' };
  var WORD = { '': 'Not set', allow: 'Allow', deny: 'Deny' };

  function cellId(roleId, key) { return roleId + '|' + key; }

  // Group → Page → (page view, page actions, Tab → (tab view, tab actions)),
  // in the order the permissions table sorts them.
  function buildTree(perms) {
    var groups = [];
    var byGroup = {};
    perms.forEach(function (p) {
      var g = byGroup[p.grp];
      if (!g) { g = byGroup[p.grp] = { name: p.grp, pages: [], byPage: {} }; groups.push(g); }
      var pg = g.byPage[p.page];
      if (!pg) { pg = g.byPage[p.page] = { name: p.page, view: null, actions: [], tabs: [], byTab: {} }; g.pages.push(pg); }
      if (!p.tab) {
        if (p.kind === 'page' && !pg.view) pg.view = p; else pg.actions.push(p);
        return;
      }
      var tb = pg.byTab[p.tab];
      if (!tb) { tb = pg.byTab[p.tab] = { name: p.tab, view: null, actions: [] }; pg.tabs.push(tb); }
      if (p.kind === 'tab' && !tb.view) tb.view = p; else tb.actions.push(p);
    });
    return groups;
  }

  function PermCell(props) {
    var v = props.value;
    var cls = 'perm-cell' + (v ? ' is-' + v : ' is-blank') + (props.pending ? ' is-pending' : '') + (props.warn ? ' is-warn' : '');
    return h('td', { className: 'perm-cell-td' },
      h('button', {
        type: 'button',
        className: cls,
        disabled: props.disabled,
        'aria-label': props.roleLabel + ' — ' + props.permLabel + ': ' + WORD[v],
        onClick: props.onClick
      }, SYMBOL[v]));
  }

  function RolesCard(props) {
    var roles = props.roles;
    var slugState = useState(''); var slug = slugState[0], setSlug = slugState[1];
    var labelState = useState(''); var label = labelState[0], setLabel = labelState[1];
    var editState = useState(null); var editing = editState[0], setEditing = editState[1]; // { id, label }
    var busyState = useState(false); var busy = busyState[0], setBusy = busyState[1];

    function run(fn) {
      setBusy(true);
      return Promise.resolve(fn()).then(function () { setBusy(false); }, function (e) { setBusy(false); props.onError(e); });
    }
    function add(e) {
      e.preventDefault();
      run(function () {
        return props.onCreate(slug, label).then(function () { setSlug(''); setLabel(''); });
      });
    }
    function saveLabel() {
      run(function () { return props.onRename(editing.id, editing.label).then(function () { setEditing(null); }); });
    }

    return h('div', { className: 'portal-card' },
      h('div', { className: 'portal-card-header' },
        h('h2', { className: 'portal-card-title' }, 'Roles')),
      h('div', { className: 'perm-roles' },
        roles.map(function (r, i) {
          var isEditing = editing && editing.id === r.id;
          return h('div', { className: 'perm-role', key: r.id },
            isEditing
              ? h('input', {
                  type: 'text', className: 'perm-role-input', value: editing.label, autoFocus: true,
                  'aria-label': 'Label for ' + r.slug,
                  onChange: function (e) { setEditing({ id: r.id, label: e.target.value }); },
                  onKeyDown: function (e) { if (e.key === 'Enter') saveLabel(); if (e.key === 'Escape') setEditing(null); }
                })
              : h('span', { className: 'perm-role-label' }, r.label),
            h('span', { className: 'perm-role-slug' }, r.slug),
            h('span', { className: 'perm-role-count' }, r.user_count + (r.user_count === 1 ? ' account' : ' accounts')),
            h('span', { className: 'perm-role-actions' },
              isEditing
                ? [
                    h('button', { key: 's', type: 'button', className: 'btn is-small', disabled: busy, onClick: saveLabel }, 'Save'),
                    h('button', { key: 'c', type: 'button', className: 'btn is-small is-quiet', disabled: busy, onClick: function () { setEditing(null); } }, 'Cancel')
                  ]
                : [
                    h('button', {
                      key: 'u', type: 'button', className: 'btn is-small is-quiet', 'aria-label': 'Move ' + r.label + ' up',
                      disabled: busy || i === 0, onClick: function () { run(function () { return props.onMove(i, -1); }); }
                    }, '↑'),
                    h('button', {
                      key: 'n', type: 'button', className: 'btn is-small is-quiet', 'aria-label': 'Move ' + r.label + ' down',
                      disabled: busy || i === roles.length - 1, onClick: function () { run(function () { return props.onMove(i, 1); }); }
                    }, '↓'),
                    h('button', { key: 'r', type: 'button', className: 'btn is-small is-quiet', disabled: busy, onClick: function () { setEditing({ id: r.id, label: r.label }); } }, 'Rename'),
                    h('button', {
                      key: 'd', type: 'button', className: 'btn is-small is-danger', disabled: busy,
                      onClick: function () {
                        if (confirm('Delete the ' + r.label + ' role?')) run(function () { return props.onDelete(r); });
                      }
                    }, 'Delete')
                  ]));
        })),
      h('form', { className: 'perm-role-add', onSubmit: add },
        h('div', { className: 'portal-field' }, h('label', { htmlFor: 'perm-new-slug' }, 'Name'),
          h('input', { id: 'perm-new-slug', type: 'text', value: slug, onChange: function (e) { setSlug(e.target.value); } })),
        h('div', { className: 'portal-field' }, h('label', { htmlFor: 'perm-new-label' }, 'Label'),
          h('input', { id: 'perm-new-label', type: 'text', value: label, onChange: function (e) { setLabel(e.target.value); } })),
        h('button', { type: 'submit', className: 'btn', disabled: busy || !slug.trim() || !label.trim() }, 'Add role')));
  }

  function PermissionsSection() {
    var dataState = useState(null); var data = dataState[0], setData = dataState[1];
    var draftState = useState({}); var draft = draftState[0], setDraft = draftState[1];
    var collapsedState = useState({}); var collapsed = collapsedState[0], setCollapsed = collapsedState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];
    var flashState = useState(''); var flash = flashState[0], setFlash = flashState[1];
    var savingState = useState(false); var saving = savingState[0], setSaving = savingState[1];

    function load() {
      return PVAdminAPI.request('GET', '/admin/permissions', undefined, true)
        .then(function (d) { setData(d); }, function (e) { setErr(e.message || 'Failed to load permissions.'); });
    }
    useEffect(function () { load(); }, []);

    var base = useMemo(function () {
      var m = {};
      ((data && data.grants) || []).forEach(function (g) { m[cellId(g.role_id, g.permission_key)] = g.effect; });
      return m;
    }, [data]);
    var tree = useMemo(function () { return buildTree((data && data.permissions) || []); }, [data]);

    function valueOf(roleId, key) {
      var id = cellId(roleId, key);
      if (Object.prototype.hasOwnProperty.call(draft, id)) return draft[id];
      return base[id] || '';
    }
    function cycle(roleId, key) {
      var id = cellId(roleId, key);
      var next = NEXT[valueOf(roleId, key)];
      setDraft(function (d) {
        var n = Object.assign({}, d);
        if (next === (base[id] || '')) delete n[id]; else n[id] = next;
        return n;
      });
    }
    function fail(e) { setFlash(''); setErr((e && e.message) || 'Something went wrong.'); }
    function done(msg) { setErr(''); setFlash(msg); setTimeout(function () { setFlash(''); }, 3000); }

    var pendingIds = Object.keys(draft);
    function save() {
      var changes = pendingIds.map(function (id) {
        var parts = id.split('|');
        return { role_id: Number(parts[0]), permission_key: parts.slice(1).join('|'), effect: draft[id] || null };
      });
      setSaving(true);
      PVAdminAPI.request('PUT', '/admin/permissions', { changes: changes }, true)
        .then(function (d) { setData(d); setDraft({}); setSaving(false); done('Permissions saved.'); }, function (e) { setSaving(false); fail(e); });
    }
    function discard() { setDraft({}); }

    function createRole(slug, label) {
      return PVAdminAPI.request('POST', '/admin/roles', { slug: slug, label: label }, true)
        .then(function () { return load(); }).then(function () { done('Role added.'); });
    }
    function renameRole(id, label) {
      return PVAdminAPI.request('PATCH', '/admin/roles/' + id, { label: label }, true)
        .then(function () { return load(); }).then(function () { done('Role renamed.'); });
    }
    // Role order sets the grid columns and the role lists in Admin Settings.
    // Saved right away.
    function moveRole(index, delta) {
      var ids = data.roles.map(function (r) { return r.id; });
      var other = index + delta;
      ids[index] = data.roles[other].id;
      ids[other] = data.roles[index].id;
      return PVAdminAPI.request('POST', '/admin/roles/reorder', { ids: ids }, true)
        .then(function (d) { setErr(''); setData(d); });
    }
    function deleteRole(r) {
      return PVAdminAPI.request('DELETE', '/admin/roles/' + r.id, undefined, true).then(function () {
        setDraft(function (d) {
          var n = {};
          Object.keys(d).forEach(function (id) { if (id.split('|')[0] !== String(r.id)) n[id] = d[id]; });
          return n;
        });
        return load();
      }).then(function () { done('Role deleted.'); });
    }

    if (!data) {
      return h('div', { className: 'portal-card' },
        err ? h('div', { className: 'portal-flash error' }, err) : h('p', { className: 'perm-loading' }, 'Loading permissions…'));
    }

    var roles = data.roles;
    var cols = roles.length + 1;
    function cells(perm, gate) {
      return roles.map(function (r) {
        var v = valueOf(r.id, perm.key);
        var warn = v === 'allow' && gate && valueOf(r.id, gate.key) !== 'allow';
        return h(PermCell, {
          key: r.id, value: v, warn: warn, disabled: saving,
          pending: Object.prototype.hasOwnProperty.call(draft, cellId(r.id, perm.key)),
          roleLabel: r.label, permLabel: perm.page + (perm.tab ? ' → ' + perm.tab : '') + ' — ' + perm.label,
          onClick: function () { cycle(r.id, perm.key); }
        });
      });
    }
    function emptyCells() { return roles.map(function (r) { return h('td', { key: r.id, className: 'perm-cell-td' }); }); }

    var rows = [];
    tree.forEach(function (g) {
      rows.push(h('tr', { key: 'g:' + g.name, className: 'perm-group-row' }, h('td', { colSpan: cols }, h('span', null, g.name))));
      g.pages.forEach(function (pg) {
        var open = !collapsed[pg.name];
        rows.push(h('tr', { key: 'p:' + pg.name, className: 'perm-page-row' },
          h('th', { scope: 'row', className: 'perm-row-label' },
            h('button', {
              type: 'button', className: 'perm-toggle', 'aria-expanded': open ? 'true' : 'false',
              onClick: function () { setCollapsed(function (c) { var n = Object.assign({}, c); if (open) n[pg.name] = true; else delete n[pg.name]; return n; }); }
            },
              h('span', { className: 'material-icons', 'aria-hidden': 'true' }, open ? 'expand_more' : 'chevron_right'),
              h('span', { className: 'perm-page-name' }, pg.name)),
            pg.view ? h('span', { className: 'perm-row-sub' }, pg.view.label) : null),
          pg.view ? cells(pg.view, null) : emptyCells()));
        if (!open) return;
        pg.actions.forEach(function (p) {
          rows.push(h('tr', { key: p.key, className: 'perm-action-row' },
            h('th', { scope: 'row', className: 'perm-row-label is-action' }, p.label),
            cells(p, pg.view)));
        });
        pg.tabs.forEach(function (tb) {
          rows.push(h('tr', { key: 't:' + pg.name + ':' + tb.name, className: 'perm-tab-row' },
            h('th', { scope: 'row', className: 'perm-row-label is-tab' },
              h('span', { className: 'perm-tab-name' }, tb.name),
              tb.view ? h('span', { className: 'perm-row-sub' }, tb.view.label) : null),
            tb.view ? cells(tb.view, pg.view) : emptyCells()));
          tb.actions.forEach(function (p) {
            rows.push(h('tr', { key: p.key, className: 'perm-action-row' },
              h('th', { scope: 'row', className: 'perm-row-label is-tab-action' }, p.label),
              cells(p, tb.view || pg.view)));
          });
        });
      });
    });

    return h('div', null,
      err ? h('div', { className: 'portal-flash error' }, err) : null,
      flash ? h('div', { className: 'portal-flash success' }, flash) : null,
      h('div', { className: 'portal-card perm-card' },
        h('div', { className: 'portal-card-header' },
          h('h2', { className: 'portal-card-title' }, 'Permissions')),
        h('div', { className: 'perm-grid-wrap' },
          h('table', { className: 'perm-grid' },
            h('thead', null,
              h('tr', null,
                h('th', { className: 'perm-corner', scope: 'col' }, ''),
                roles.map(function (r) { return h('th', { key: r.id, scope: 'col', className: 'perm-role-col' }, r.label); }))),
            h('tbody', null, rows))),
        pendingIds.length
          ? h('div', { className: 'perm-savebar' },
              h('span', { className: 'perm-savebar-count' }, pendingIds.length + (pendingIds.length === 1 ? ' unsaved change' : ' unsaved changes')),
              h('button', { type: 'button', className: 'btn is-quiet', disabled: saving, onClick: discard }, 'Discard'),
              h('button', { type: 'button', className: 'btn', disabled: saving, onClick: save }, saving ? 'Saving…' : 'Save'))
          : null),
      h(RolesCard, { roles: roles, onCreate: createRole, onRename: renameRole, onMove: moveRole, onDelete: deleteRole, onError: fail }));
  }

  window.PVAdminPermissions = PermissionsSection;
})();
