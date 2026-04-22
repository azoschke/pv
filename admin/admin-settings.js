// ============================================================================
//  PVAdminSettings — Admin-only user + role management
//
//  - Lists every admin_users row (username, display_name, created_at,
//    last_login) along with their current role slugs.
//  - Each row has a set of role checkboxes (medical, mercenary, pirate,
//    officer, admin). Clicking a checkbox PATCHes the server with the
//    full intended role set for that user.
//  - Admins can delete user accounts (confirm prompt). Cannot delete self.
//
//  Worker routes (all gated by admin role on the server):
//    GET    /admin/users                 list users w/ roles
//    PUT    /admin/users/:id/roles       { roles: ['medical', ...] } — replace set
//    DELETE /admin/users/:id             hard delete
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;

  var ROLE_CATALOG = [
    { slug: 'medical',   label: 'Medical' },
    { slug: 'mercenary', label: 'Mercenary' },
    { slug: 'pirate',    label: 'Pirate' },
    { slug: 'officer',   label: 'Officer' },
    { slug: 'admin',     label: 'Admin' }
  ];

  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso.replace(' ', 'T') + 'Z');
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function UserRow(props) {
    var u = props.user;
    var onToggleRole = props.onToggleRole;
    var onDelete = props.onDelete;
    var selfId = props.selfId;
    var busyRoles = props.busyRoles || {};
    var deleting = props.deleting;

    var currentSet = {};
    (u.roles || []).forEach(function (r) { currentSet[r] = true; });
    var isSelf = u.id === selfId;

    return h('tr', null,
      h('td', null,
        h('div', { style: { fontWeight: 600 } }, u.username),
        u.display_name ? h('div', { style: { color: 'var(--text-secondary)', fontSize: '0.9rem' } }, u.display_name) : null
      ),
      h('td', null, fmtDate(u.created_at)),
      h('td', null, u.last_login ? fmtDate(u.last_login) : h('span', { style: { color: 'var(--text-secondary)' } }, 'never')),
      h('td', null,
        h('div', { className: 'admin-role-checkboxes' },
          ROLE_CATALOG.map(function (r) {
            var busyKey = u.id + ':' + r.slug;
            return h('label', { key: r.slug, className: 'admin-role-checkbox' },
              h('input', {
                type: 'checkbox',
                checked: !!currentSet[r.slug],
                disabled: !!busyRoles[busyKey],
                onChange: function (e) { onToggleRole(u, r.slug, e.target.checked); }
              }),
              h('span', null, r.label)
            );
          })
        )
      ),
      h('td', { style: { textAlign: 'right', whiteSpace: 'nowrap' } },
        isSelf
          ? h('span', { style: { color: 'var(--text-secondary)', fontSize: '0.9rem' } }, '(you)')
          : h('button', {
              type: 'button',
              className: 'portal-btn is-small is-danger',
              disabled: deleting,
              onClick: function () {
                if (confirm('Delete account "' + u.username + '"? This cannot be undone.')) {
                  onDelete(u);
                }
              }
            }, deleting ? 'Deleting…' : 'Delete')
      )
    );
  }

  function AdminSettings(props) {
    var usersState = useState([]);
    var users = usersState[0], setUsers = usersState[1];
    var loadingState = useState(true);
    var loading = loadingState[0], setLoading = loadingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];
    var busyRolesState = useState({});
    var busyRoles = busyRolesState[0], setBusyRoles = busyRolesState[1];
    var deletingIdState = useState(null);
    var deletingId = deletingIdState[0], setDeletingId = deletingIdState[1];
    var filterState = useState('');
    var filter = filterState[0], setFilter = filterState[1];

    var session = PVAdminAPI.getSession();
    var selfUsername = session && session.username;

    async function reload() {
      setErr('');
      try {
        var data = await PVAdminAPI.request('GET', '/admin/users', undefined, true);
        setUsers(Array.isArray(data) ? data : []);
      } catch (e) {
        setErr(e.message || 'Failed to load users.');
      } finally {
        setLoading(false);
      }
    }

    useEffect(function () { reload(); }, []);

    async function handleToggleRole(user, roleSlug, next) {
      var busyKey = user.id + ':' + roleSlug;
      setBusyRoles(function (b) { var n = Object.assign({}, b); n[busyKey] = true; return n; });

      var current = user.roles || [];
      var intended = next
        ? (current.indexOf(roleSlug) === -1 ? current.concat([roleSlug]) : current)
        : current.filter(function (r) { return r !== roleSlug; });

      var prev = users;
      setUsers(users.map(function (u) {
        return u.id === user.id ? Object.assign({}, u, { roles: intended }) : u;
      }));

      try {
        await PVAdminAPI.request('PUT', '/admin/users/' + user.id + '/roles', { roles: intended }, true);
      } catch (e) {
        setErr(e.message || 'Failed to update roles.');
        setUsers(prev);
      } finally {
        setBusyRoles(function (b) { var n = Object.assign({}, b); delete n[busyKey]; return n; });
      }
    }

    async function handleDelete(user) {
      setDeletingId(user.id);
      try {
        await PVAdminAPI.request('DELETE', '/admin/users/' + user.id, undefined, true);
        await reload();
      } catch (e) {
        setErr(e.message || 'Failed to delete user.');
      } finally {
        setDeletingId(null);
      }
    }

    var q = filter.trim().toLowerCase();
    var filtered = q
      ? users.filter(function (u) {
          return (u.username && u.username.toLowerCase().indexOf(q) !== -1)
              || (u.display_name && u.display_name.toLowerCase().indexOf(q) !== -1);
        })
      : users;

    var selfId = null;
    if (selfUsername) {
      var self = users.find(function (u) { return u.username === selfUsername; });
      selfId = self ? self.id : null;
    }

    var pending = users.filter(function (u) { return !u.roles || !u.roles.length; }).length;

    return h('div', null,
      h('div', { className: 'portal-card' },
        h('div', { className: 'portal-card-header' },
          h('h2', { className: 'portal-card-title' }, 'Admin Settings — Users & Roles'),
          h('div', { className: 'portal-card-actions' },
            h('input', {
              type: 'search',
              className: 'portal-search',
              placeholder: 'Filter by username or display name…',
              value: filter,
              onChange: function (e) { setFilter(e.target.value); }
            })
          )
        ),
        pending > 0
          ? h('div', { className: 'portal-flash', style: { background: 'rgba(107, 68, 35, 0.1)', color: 'var(--accent-gold)', border: '1px solid rgba(107, 68, 35, 0.35)' } },
              pending + ' account' + (pending === 1 ? '' : 's') + ' pending role assignment.'
            )
          : null,
        err ? h('div', { className: 'portal-flash error' }, err) : null,
        loading
          ? h('p', { style: { color: 'var(--text-secondary)' } }, 'Loading users…')
          : h('div', { className: 'portal-table-wrap' },
              h('table', { className: 'portal-table' },
                h('thead', null,
                  h('tr', null,
                    h('th', null, 'User'),
                    h('th', null, 'Created'),
                    h('th', null, 'Last Login'),
                    h('th', null, 'Roles'),
                    h('th', { style: { textAlign: 'right', width: '1%', whiteSpace: 'nowrap' } }, '')
                  )
                ),
                h('tbody', null,
                  filtered.length
                    ? filtered.map(function (u) {
                        return h(UserRow, {
                          key: u.id,
                          user: u,
                          selfId: selfId,
                          onToggleRole: handleToggleRole,
                          onDelete: handleDelete,
                          busyRoles: busyRoles,
                          deleting: deletingId === u.id
                        });
                      })
                    : h('tr', null,
                        h('td', {
                          colSpan: 5,
                          style: { color: 'var(--text-secondary)', textAlign: 'center', padding: '1.5rem' }
                        }, q ? 'No users match your filter.' : 'No users yet.')
                      )
                )
              )
            )
      )
    );
  }

  window.PVAdminSettings = AdminSettings;
})();
