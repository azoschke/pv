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
//    GET    /admin/users                      list users w/ roles
//    PUT    /admin/users/:id/roles            { roles: ['medical', ...] } — replace set
//    DELETE /admin/users/:id                  hard delete
//    POST   /admin/users/:id/reset-password   mint a one-time reset link
//
//  Password resets: an admin mints a single-use, short-lived reset link the
//  member opens at /pv/admin/reset.html to set a new password. Ordinary admins
//  may reset only non-admin accounts; resetting an admin account is limited to
//  the root admin (Fiora). The plaintext token is shown once, here, and is
//  never stored or retrievable again.
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;

  var ROLE_CATALOG = [
    { slug: 'member',    label: 'Member' },
    { slug: 'medical',   label: 'Medical' },
    { slug: 'mercenary', label: 'Mercenary' },
    { slug: 'pirate',    label: 'Pirate' },
    { slug: 'officer',   label: 'Officer' },
    { slug: 'admin',     label: 'Admin' }
  ];

  // Root admin: frozen account. No admin can change its roles or delete it.
  // Mirrors the server-side guard in pv-med-database-worker.
  var ROOT_ADMIN_USERNAME = 'fiora';
  function isRootAdmin(user) {
    return user && user.username && user.username.toLowerCase() === ROOT_ADMIN_USERNAME;
  }

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
    var onReset = props.onReset;
    var selfId = props.selfId;
    var callerIsRoot = props.callerIsRoot;
    var busyRoles = props.busyRoles || {};
    var deleting = props.deleting;
    var resetting = props.resetting;

    var currentSet = {};
    (u.roles || []).forEach(function (r) { currentSet[r] = true; });
    var isSelf = u.id === selfId;
    var isRoot = isRootAdmin(u);
    var needsRole = !(u.roles && u.roles.length);
    var targetIsAdmin = (u.roles || []).indexOf('admin') !== -1;
    // Mirror of the server rule: never reset the root admin; resetting an admin
    // account is limited to the root admin (Fiora).
    var resetAllowed = !isRoot && (!targetIsAdmin || callerIsRoot);

    return h('tr', { className: needsRole ? 'is-needs-role' : null },
      h('td', null,
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '0.4rem' } },
          h('span', { style: { fontWeight: 600 } }, u.username),
          isRoot ? h('span', { className: 'portal-badge is-pinned', title: 'Root admin (protected)' }, 'Root') : null,
          needsRole ? h('span', { className: 'portal-badge is-warn', title: 'No role assigned yet' }, 'Needs role') : null
        ),
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
                disabled: isRoot || !!busyRoles[busyKey],
                onChange: function (e) { onToggleRole(u, r.slug, e.target.checked); }
              }),
              h('span', null, r.label)
            );
          })
        )
      ),
      h('td', { style: { textAlign: 'right', whiteSpace: 'nowrap' } },
        h('div', {
          style: { display: 'inline-flex', gap: '0.4rem', alignItems: 'center', justifyContent: 'flex-end' }
        },
          resetAllowed
            ? h('button', {
                type: 'button',
                className: 'portal-btn is-small is-ghost',
                disabled: !!resetting,
                title: 'Generate a one-time password reset link to send the member',
                onClick: function () { onReset(u); }
              }, resetting ? 'Generating…' : 'Reset password')
            : null,
          isRoot
            ? h('span', { style: { color: 'var(--text-secondary)', fontSize: '0.9rem' } }, '(protected)')
            : isSelf
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
      )
    );
  }

  // Format a reset link's expiry as a friendly local time, e.g. "3:45 PM".
  function fmtExpiry(iso) {
    if (!iso) return null;
    var d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  // Shown once, immediately after a reset link is minted. The token is never
  // stored in plaintext or retrievable again, so this is the only chance to
  // copy it. Provides a ready-to-paste Discord message and a link-only copy.
  function ResetLinkModal(props) {
    var result = props.result;
    var onClose = props.onClose;

    var copiedState = useState('');
    var copied = copiedState[0], setCopied = copiedState[1];

    var expiry = fmtExpiry(result.expires_at);
    var discordMessage =
      'Hey ' + result.display_name + '! Here is your one-time password reset link for the ' +
      'Phoenix Vanguard portal' + (expiry ? ' (it expires around ' + expiry + ' and can only be used once)' : '') +
      ':\n\n' + result.link + '\n\n' +
      'Open it, set a new password, then sign in. Do not share this link with anyone.';

    function copy(text, label) {
      function flash() {
        setCopied(label);
        setTimeout(function () { setCopied(''); }, 2000);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(flash, function () { flash(); });
      } else {
        // Legacy fallback for browsers without the async clipboard API.
        try {
          var ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          flash();
        } catch (_e) { /* ignore */ }
      }
    }

    return h(window.PVAdminModal, {
      title: 'Password reset link — ' + result.display_name,
      onClose: onClose
    },
      h('p', { style: { fontFamily: 'Crimson Pro, serif', margin: '0 0 0.75rem' } },
        'Send this one-time link to ',
        h('strong', null, result.display_name),
        ' over Discord. ',
        expiry ? ('It expires around ' + expiry + ' and ') : 'It ',
        'can only be used once.'
      ),
      h('div', { className: 'portal-flash', style: {
        background: 'rgba(165, 77, 68, 0.10)', border: '1px solid rgba(165, 77, 68, 0.30)',
        color: 'var(--accent-red)', marginBottom: '1rem'
      } },
        'This link is shown only once — copy it now. It cannot be retrieved again.'
      ),
      h('div', { className: 'portal-field', style: { marginBottom: '1rem' } },
        h('label', null, 'Reset link'),
        h('input', {
          type: 'text', readOnly: true, value: result.link,
          onFocus: function (e) { e.target.select(); },
          style: { width: '100%', fontFamily: 'monospace', fontSize: '0.8rem' }
        })
      ),
      h('div', { style: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' } },
        h('button', {
          type: 'button', className: 'portal-btn',
          onClick: function () { copy(discordMessage, 'message'); }
        }, copied === 'message' ? 'Copied!' : 'Copy Discord message'),
        h('button', {
          type: 'button', className: 'portal-btn is-ghost',
          onClick: function () { copy(result.link, 'link'); }
        }, copied === 'link' ? 'Copied!' : 'Copy link only'),
        h('button', {
          type: 'button', className: 'portal-btn is-ghost',
          style: { marginLeft: 'auto' },
          onClick: onClose
        }, 'Done')
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
    var resettingIdState = useState(null);
    var resettingId = resettingIdState[0], setResettingId = resettingIdState[1];
    // resetResult: null = closed; otherwise the freshly-minted link to show once.
    var resetResultState = useState(null);
    var resetResult = resetResultState[0], setResetResult = resetResultState[1];
    var filterState = useState('');
    var filter = filterState[0], setFilter = filterState[1];

    var session = PVAdminAPI.getSession();
    var selfUsername = session && session.username;
    var callerIsRoot = !!selfUsername && selfUsername.toLowerCase() === ROOT_ADMIN_USERNAME;

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
      if (isRootAdmin(user)) return; // UI no-op; server would reject anyway.
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

    async function handleReset(user) {
      setErr('');
      setResettingId(user.id);
      try {
        var res = await PVAdminAPI.request(
          'POST', '/admin/users/' + user.id + '/reset-password', {}, true
        );
        if (!res || !res.token) throw new Error('No reset token was returned.');
        // Build the member-facing link from the current origin so it works on
        // whatever domain the portal is served from.
        var link = window.location.origin + '/pv/admin/reset.html?token=' +
          encodeURIComponent(res.token);
        setResetResult({
          username: res.username || user.username,
          display_name: res.display_name || user.display_name || user.username,
          link: link,
          expires_at: res.expires_at || null
        });
      } catch (e) {
        setErr(e.message || 'Failed to generate a reset link.');
      } finally {
        setResettingId(null);
      }
    }

    var q = filter.trim().toLowerCase();
    var filtered = q
      ? users.filter(function (u) {
          return (u.username && u.username.toLowerCase().indexOf(q) !== -1)
              || (u.display_name && u.display_name.toLowerCase().indexOf(q) !== -1);
        })
      : users;

    // Surface accounts awaiting a role: float the roleless ones to the top,
    // keeping the server's order stable within each group.
    filtered = filtered.slice().sort(function (a, b) {
      var an = (a.roles && a.roles.length) ? 1 : 0;
      var bn = (b.roles && b.roles.length) ? 1 : 0;
      return an - bn;
    });

    var selfId = null;
    if (selfUsername) {
      var self = users.find(function (u) { return u.username === selfUsername; });
      selfId = self ? self.id : null;
    }

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
                          callerIsRoot: callerIsRoot,
                          onToggleRole: handleToggleRole,
                          onDelete: handleDelete,
                          onReset: handleReset,
                          busyRoles: busyRoles,
                          deleting: deletingId === u.id,
                          resetting: resettingId === u.id
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
      ),
      resetResult ? h(ResetLinkModal, {
        result: resetResult,
        onClose: function () { setResetResult(null); }
      }) : null
    );
  }

  window.PVAdminSettings = AdminSettings;
})();
