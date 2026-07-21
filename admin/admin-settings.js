// ============================================================================
//  PVAdminSettings — Admin-only user + role management
//
//  - Lists every admin_users row (username, display_name, created_at,
//    last_login) along with their current role slugs.
//  - Each row shows its roles as a read-only list; an "Edit roles" action
//    opens a popup whose checkboxes commit the full intended role set for
//    that user in one request.
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
  var LABEL_BY_SLUG = {};
  ROLE_CATALOG.forEach(function (r) { LABEL_BY_SLUG[r.slug] = r.label; });
  function roleLabels(roles) {
    return (roles || []).map(function (r) { return LABEL_BY_SLUG[r] || r; });
  }

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
    var onEditRoles = props.onEditRoles;
    var onDelete = props.onDelete;
    var onReset = props.onReset;
    var selfId = props.selfId;
    var callerIsRoot = props.callerIsRoot;
    var deleting = props.deleting;
    var resetting = props.resetting;

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
        (u.roles && u.roles.length)
          ? roleLabels(u.roles).join(', ')
          : h('span', { style: { color: 'var(--text-secondary)' } }, '—')
      ),
      h('td', { style: { textAlign: 'right', whiteSpace: 'nowrap' } },
        h('div', {
          style: { display: 'inline-flex', gap: '0.4rem', alignItems: 'center', justifyContent: 'flex-end' }
        },
          // Root admin is protected: its empty action set is the cue, so no
          // "Edit roles"/"Delete" controls and no explicit "(protected)" label.
          !isRoot
            ? h('button', {
                type: 'button',
                className: 'portal-btn is-small is-ghost',
                onClick: function () { onEditRoles(u); }
              }, 'Edit roles')
            : null,
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
            ? null
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

  // Role editor popup. Holds a local draft of the checked roles and commits the
  // full set in one PUT via onSave (which resolves on success and rejects with
  // an error the modal surfaces inline). The parent closes the modal on success.
  function RoleEditModal(props) {
    var user = props.user;
    var onClose = props.onClose;
    var onSave = props.onSave;

    var draftState = useState(function () {
      var set = {};
      (user.roles || []).forEach(function (r) { set[r] = true; });
      return set;
    });
    var draft = draftState[0], setDraft = draftState[1];
    var savingState = useState(false);
    var saving = savingState[0], setSaving = savingState[1];
    var errState = useState('');
    var merr = errState[0], setMerr = errState[1];

    function toggle(slug, on) {
      setDraft(function (d) {
        var n = Object.assign({}, d);
        if (on) n[slug] = true; else delete n[slug];
        return n;
      });
    }

    function save() {
      var selected = ROLE_CATALOG
        .filter(function (r) { return draft[r.slug]; })
        .map(function (r) { return r.slug; });
      setSaving(true); setMerr('');
      Promise.resolve(onSave(user, selected)).then(null, function (e) {
        setMerr((e && e.message) || 'Failed to update roles.');
        setSaving(false);
      });
    }

    return h(window.PVAdminModal, {
      title: 'Edit roles — ' + (user.display_name || user.username),
      onClose: onClose
    },
      h('p', { style: { fontFamily: 'Crimson Pro, serif', margin: '0 0 0.85rem', color: 'var(--text-secondary)' } },
        'Select the roles for ', h('strong', null, user.username), '.'),
      merr ? h('div', { className: 'portal-flash error', style: { marginBottom: '0.85rem' } }, merr) : null,
      h('div', { className: 'admin-role-checkboxes', style: { marginBottom: '1.1rem' } },
        ROLE_CATALOG.map(function (r) {
          return h('label', { key: r.slug, className: 'admin-role-checkbox' },
            h('input', {
              type: 'checkbox',
              checked: !!draft[r.slug],
              disabled: saving,
              onChange: function (e) { toggle(r.slug, e.target.checked); }
            }),
            h('span', null, r.label)
          );
        })
      ),
      h('div', { style: { display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' } },
        h('button', { type: 'button', className: 'portal-btn is-ghost', disabled: saving, onClick: onClose }, 'Cancel'),
        h('button', { type: 'button', className: 'portal-btn', disabled: saving, onClick: save },
          saving ? 'Saving…' : 'Save roles')
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
    // editingUser: null = closed; otherwise the user whose role popup is open.
    var editingUserState = useState(null);
    var editingUser = editingUserState[0], setEditingUser = editingUserState[1];
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

    // Commit the full intended role set for a user in one request. Resolves on
    // success (and closes the popup); rejects so the popup can show the error.
    async function handleSaveRoles(user, roles) {
      if (isRootAdmin(user)) return; // UI no-op; server would reject anyway.
      setErr('');
      var prev = users;
      setUsers(users.map(function (u) {
        return u.id === user.id ? Object.assign({}, u, { roles: roles }) : u;
      }));
      try {
        await PVAdminAPI.request('PUT', '/admin/users/' + user.id + '/roles', { roles: roles }, true);
        setEditingUser(null);
      } catch (e) {
        setUsers(prev);
        throw e;
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
                          onEditRoles: setEditingUser,
                          onDelete: handleDelete,
                          onReset: handleReset,
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
      editingUser ? h(RoleEditModal, {
        user: editingUser,
        onSave: handleSaveRoles,
        onClose: function () { setEditingUser(null); }
      }) : null,
      resetResult ? h(ResetLinkModal, {
        result: resetResult,
        onClose: function () { setResetResult(null); }
      }) : null
    );
  }

  window.PVAdminSettings = AdminSettings;
})();
