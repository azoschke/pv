// ============================================================================
//  PVAdminPermissions — the permission grid (root admin only)
//
//  Rows come from the permissions table as Page → Tab → Action; columns are
//  roles. Clicking a cell cycles blank → Allow → Deny. Changes collect as
//  pending (highlighted) until Save; Discard drops them. Across a person's
//  roles, Deny wins. An action allowed for a role that can't see its page or
//  tab gets a warning tint.
//
//  Roles can be added, relabelled and deleted here; deleting is refused while
//  any account still has the role (the worker names those accounts).
//
//  The preview shows what one account's combined roles allow, including any
//  pending changes.
//
//  Worker routes (root only):
//    GET    /admin/permissions   { permissions, roles, grants }
//    PUT    /admin/permissions   { changes: [{ role_id, permission_key, effect }] }
//    POST   /admin/roles         { slug, label }
//    PATCH  /admin/roles/:id     { label }
//    DELETE /admin/roles/:id
//  and GET /admin/users for the preview's account list.
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

  // What a set of roles allows: allowed keys, plus keys some role allows but
  // another role denies (Deny wins).
  function effective(roleIds, perms, valueOf) {
    var allowed = [];
    var blocked = [];
    perms.forEach(function (p) {
      var allowBy = [], denyBy = [];
      roleIds.forEach(function (rid) {
        var v = valueOf(rid, p.key);
        if (v === 'allow') allowBy.push(rid);
        else if (v === 'deny') denyBy.push(rid);
      });
      if (denyBy.length) { if (allowBy.length) blocked.push({ perm: p, denyBy: denyBy }); }
      else if (allowBy.length) allowed.push(p);
    });
    return { allowed: allowed, blocked: blocked };
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
        roles.map(function (r) {
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
                    h('button', { key: 's', type: 'button', className: 'portal-btn is-small', disabled: busy, onClick: saveLabel }, 'Save'),
                    h('button', { key: 'c', type: 'button', className: 'portal-btn is-small is-ghost', disabled: busy, onClick: function () { setEditing(null); } }, 'Cancel')
                  ]
                : [
                    h('button', { key: 'r', type: 'button', className: 'portal-btn is-small is-ghost', disabled: busy, onClick: function () { setEditing({ id: r.id, label: r.label }); } }, 'Rename'),
                    h('button', {
                      key: 'd', type: 'button', className: 'portal-btn is-small is-danger', disabled: busy,
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
        h('button', { type: 'submit', className: 'portal-btn', disabled: busy || !slug.trim() || !label.trim() }, 'Add role')));
  }

  function PreviewCard(props) {
    var users = props.users;
    var roles = props.roles;
    var pickState = useState(''); var pick = pickState[0], setPick = pickState[1];
    var user = users.filter(function (u) { return String(u.id) === pick; })[0] || null;
    var roleBySlug = {}; roles.forEach(function (r) { roleBySlug[r.slug] = r; });
    var labelOfRole = {}; roles.forEach(function (r) { labelOfRole[r.id] = r.label; });
    var userRoleIds = user ? (user.roles || []).map(function (s) { return roleBySlug[s] ? roleBySlug[s].id : null; }).filter(function (x) { return x != null; }) : [];
    var result = user && !user.is_root ? effective(userRoleIds, props.perms, props.valueOf) : null;

    function grouped(list) {
      var pages = [], byPage = {};
      list.forEach(function (item) {
        var p = item.perm || item;
        var name = p.page + (p.tab ? ' → ' + p.tab : '');
        if (!byPage[name]) { byPage[name] = []; pages.push(name); }
        byPage[name].push(item);
      });
      return pages.map(function (name) { return { name: name, items: byPage[name] }; });
    }

    return h('div', { className: 'portal-card' },
      h('div', { className: 'portal-card-header' },
        h('h2', { className: 'portal-card-title' }, 'Effective access'),
        h('div', { className: 'portal-card-actions' },
          h('select', { className: 'portal-select', value: pick, 'aria-label': 'Account', onChange: function (e) { setPick(e.target.value); } },
            h('option', { value: '' }, '— pick an account —'),
            users.map(function (u) { return h('option', { key: u.id, value: String(u.id) }, (u.display_name || u.username) + ' (' + u.username + ')'); })))),
      !user ? null
        : h('div', null,
            h('p', { className: 'perm-preview-roles' },
              (user.roles && user.roles.length)
                ? user.roles.map(function (s) { return roleBySlug[s] ? roleBySlug[s].label : s; }).join(', ')
                : 'No roles'),
            user.is_root ? h('p', { className: 'perm-preview-root' }, 'Root: every permission.')
              : h('div', { className: 'perm-preview' },
                  h('div', null,
                    h('h3', { className: 'perm-preview-title' }, 'Allowed (' + result.allowed.length + ')'),
                    result.allowed.length
                      ? grouped(result.allowed).map(function (g) {
                          return h('div', { className: 'perm-preview-group', key: g.name },
                            h('div', { className: 'perm-preview-page' }, g.name),
                            h('ul', null, g.items.map(function (p) { return h('li', { key: p.key }, p.label); })));
                        })
                      : h('p', { className: 'perm-preview-empty' }, 'Nothing')),
                  h('div', null,
                    h('h3', { className: 'perm-preview-title is-deny' }, 'Blocked by Deny (' + result.blocked.length + ')'),
                    result.blocked.length
                      ? grouped(result.blocked).map(function (g) {
                          return h('div', { className: 'perm-preview-group', key: g.name },
                            h('div', { className: 'perm-preview-page' }, g.name),
                            h('ul', null, g.items.map(function (b) {
                              return h('li', { key: b.perm.key }, b.perm.label + ' — denied by ' + b.denyBy.map(function (id) { return labelOfRole[id]; }).join(', '));
                            })));
                        })
                      : h('p', { className: 'perm-preview-empty' }, 'Nothing')))));
  }

  function PermissionsSection() {
    var dataState = useState(null); var data = dataState[0], setData = dataState[1];
    var draftState = useState({}); var draft = draftState[0], setDraft = draftState[1];
    var collapsedState = useState({}); var collapsed = collapsedState[0], setCollapsed = collapsedState[1];
    var usersState = useState([]); var users = usersState[0], setUsers = usersState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];
    var flashState = useState(''); var flash = flashState[0], setFlash = flashState[1];
    var savingState = useState(false); var saving = savingState[0], setSaving = savingState[1];

    function load() {
      return PVAdminAPI.request('GET', '/admin/permissions', undefined, true)
        .then(function (d) { setData(d); }, function (e) { setErr(e.message || 'Failed to load permissions.'); });
    }
    useEffect(function () {
      load();
      PVAdminAPI.request('GET', '/admin/users', undefined, true).then(function (rows) {
        setUsers((rows || []).map(function (u) {
          return Object.assign({}, u, { is_root: String(u.username || '').toLowerCase() === 'fiora' });
        }).sort(function (a, b) {
          return String(a.display_name || a.username).localeCompare(String(b.display_name || b.username));
        }));
      }, function () {});
    }, []);

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
              h('button', { type: 'button', className: 'portal-btn is-ghost', disabled: saving, onClick: discard }, 'Discard'),
              h('button', { type: 'button', className: 'portal-btn', disabled: saving, onClick: save }, saving ? 'Saving…' : 'Save'))
          : null),
      h(RolesCard, { roles: roles, onCreate: createRole, onRename: renameRole, onDelete: deleteRole, onError: fail }),
      h(PreviewCard, { users: users, roles: roles, perms: data.permissions, valueOf: valueOf }));
  }

  window.PVAdminPermissions = PermissionsSection;
})();
