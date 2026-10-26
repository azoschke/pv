// ============================================================================
//  PVAdminSettings — user + role management (users.view)
//
//  - Lists every admin_users row (username, display_name, created_at,
//    last_login) along with their current role slugs.
//  - Each row shows its roles as a read-only list; an "Edit roles" action
//    (users.roles) opens a popup whose checkboxes commit the full intended
//    role set for that user in one request. Only an admin (the admin role, or
//    the root admin) sees the Admin box; for anyone else an account keeps the
//    admin role exactly as it had it (the worker refuses any change to it).
//  - users.delete deletes user accounts (confirm prompt). Cannot delete self.
//  - Each account is linked to one roster character, whose name it carries.
//    An account linked to an alt (made before alts were managed from their
//    mains) is tagged "Alt account". users.link changes the linked character
//    in a popup; a character belongs to one account at most, and only the
//    root admin changes the root admin's.
//  - users.registration_code sets the code new accounts need to register;
//    a blank code closes account creation.
//  - The root admin also gets the Permissions, Pages and Navigation tabs
//    (js/admin/permissions.js, site-pages.js, site-nav.js).
//
//  Worker routes:
//    GET    /admin/users                      users.view — list users w/ roles and characters
//    PUT    /admin/users/:id/roles            users.roles — { roles: [...] } replace set
//    PUT    /admin/users/:id/character        users.link — { member_id } (null unlinks)
//    DELETE /admin/users/:id                  users.delete — hard delete
//    POST   /admin/users/:id/reset-password   users.reset — mint a one-time reset link
//    GET    /admin/roles                      users.roles or users.view
//    GET    /members/basic                    users.link — the character picker
//    GET    /admin/registration-code          users.registration_code — { code, updated_at, updated_by_name }
//    PUT    /admin/registration-code          users.registration_code — { code }
//
//  Password resets: users.reset mints a single-use, short-lived reset link the
//  member opens at reset.html to set a new password. Only non-admin
//  accounts can be reset this way; resetting an admin account is limited to
//  the root admin (Fiora). The plaintext token is shown once, here, and is
//  never stored or retrievable again.
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;

  // Roles come from the worker (GET /admin/roles) so roles added in the
  // Permissions tab can be assigned. This list is used until it loads, or if
  // the worker doesn't have that route yet.
  var FALLBACK_ROLES = [
    { slug: 'member',      label: 'Member' },
    { slug: 'medical',     label: 'Medical' },
    { slug: 'mercenary',   label: 'Mercenary' },
    { slug: 'pirate',      label: 'Pirate' },
    { slug: 'house_staff', label: 'House Staff' },
    { slug: 'recon',       label: 'Recon' },
    { slug: 'dm',          label: 'Dungeon Master' },
    { slug: 'officer',     label: 'Officer' },
    { slug: 'admin',       label: 'Admin' }
  ];
  function roleLabeler(roles) {
    var bySlug = {};
    roles.forEach(function (r) { bySlug[r.slug] = r.label; });
    return function (slugs) {
      return (slugs || []).map(function (s) { return bySlug[s] || s; });
    };
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
    var roleLabels = props.roleLabels;
    var canRoles = props.canRoles;
    var canDelete = props.canDelete;
    var canReset = props.canReset;
    var canLink = props.canLink;
    var onLink = props.onLink;

    var isSelf = u.id === selfId;
    var isRoot = isRootAdmin(u);
    var needsRole = !(u.roles && u.roles.length);
    var targetIsAdmin = (u.roles || []).indexOf('admin') !== -1;
    // Mirror of the server rule: never reset the root admin; resetting an admin
    // account is limited to the root admin (Fiora).
    var resetAllowed = canReset && !isRoot && (!targetIsAdmin || callerIsRoot);
    // Only the root admin changes the root admin's character.
    var linkAllowed = canLink && (!isRoot || callerIsRoot);

    return h('tr', null,
      h('td', null,
        h('div', { className: 'portal-name-row' },
          h('span', { className: 'row-name' }, u.username),
          isRoot ? h('span', { className: 'tag', title: 'Root admin (protected)' }, 'Root') : null,
          u.is_alt
            ? h('span', { className: 'tag', title: 'Linked to an alt' + (u.main_name ? ' of ' + u.main_name : '') }, 'Alt account')
            : null,
          needsRole ? h('span', { className: 'pill', title: 'No role assigned yet' }, 'Needs role') : null,
          u.member_id == null
            ? h('span', { className: 'pill', title: 'Not linked to a roster character' }, 'No character')
            : null
        ),
        u.display_name
          ? h('div', { style: { color: 'var(--text-secondary)', fontSize: '0.9rem' } },
              u.display_name + (u.is_alt && u.main_name ? ' · alt of ' + u.main_name : ''))
          : null
      ),
      h('td', null, fmtDate(u.created_at)),
      h('td', null, u.last_login ? fmtDate(u.last_login) : h('span', { className: 'portal-muted' }, 'never')),
      h('td', null,
        (u.roles && u.roles.length)
          ? roleLabels(u.roles).join(', ')
          : h('span', { className: 'portal-muted' }, '—')
      ),
      h('td', { className: 'portal-col-actions' },
        h('div', {
          style: { display: 'inline-flex', gap: '0.4rem', alignItems: 'center', justifyContent: 'flex-end' }
        },
          // Root admin is protected: its empty action set is the cue, so no
          // "Edit roles"/"Delete" controls and no explicit "(protected)" label.
          !isRoot && canRoles
            ? h('button', {
                type: 'button',
                className: 'btn is-small is-quiet',
                onClick: function () { onEditRoles(u); }
              }, 'Edit roles')
            : null,
          linkAllowed
            ? h('button', {
                type: 'button',
                className: 'btn is-small is-quiet',
                title: 'Change the roster character this account is linked to',
                onClick: function () { onLink(u); }
              }, 'Character')
            : null,
          resetAllowed
            ? h('button', {
                type: 'button',
                className: 'btn is-small is-quiet',
                disabled: !!resetting,
                title: 'Generate a one-time password reset link to send the member',
                onClick: function () { onReset(u); }
              }, resetting ? 'Generating…' : 'Reset password')
            : null,
          isRoot
            ? null
            : isSelf
              ? h('span', { style: { color: 'var(--text-secondary)', fontSize: '0.9rem' } }, '(you)')
              : !canDelete
              ? null
              : h('button', {
                  type: 'button',
                  className: 'btn is-small is-danger',
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
      h('p', { style: { fontFamily: 'var(--font-text)', margin: '0 0 0.75rem' } },
        'Send this one-time link to ',
        h('strong', null, result.display_name),
        ' over Discord. ',
        expiry ? ('It expires around ' + expiry + ' and ') : 'It ',
        'can only be used once.'
      ),
      h('div', { className: 'flash error', style: { marginBottom: '1rem' } },
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
          type: 'button', className: 'btn',
          onClick: function () { copy(discordMessage, 'message'); }
        }, copied === 'message' ? 'Copied!' : 'Copy Discord message'),
        h('button', {
          type: 'button', className: 'btn is-quiet',
          onClick: function () { copy(result.link, 'link'); }
        }, copied === 'link' ? 'Copied!' : 'Copy link only'),
        h('button', {
          type: 'button', className: 'btn is-quiet is-end',
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
      var selected = props.roles
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
      h('p', { style: { fontFamily: 'var(--font-text)', margin: '0 0 0.85rem', color: 'var(--text-secondary)' } },
        'Select the roles for ', h('strong', null, user.username), '.'),
      merr ? h('div', { className: 'flash error', style: { marginBottom: '0.85rem' } }, merr) : null,
      h('div', { className: 'admin-role-checkboxes', style: { marginBottom: '1.1rem' } },
        // A hidden Admin box keeps its value in the draft, so saving leaves
        // the account's admin role as it was.
        props.roles.filter(function (r) { return props.canAdmin || r.slug !== 'admin'; }).map(function (r) {
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
        h('button', { type: 'button', className: 'btn is-quiet', disabled: saving, onClick: onClose }, 'Cancel'),
        h('button', { type: 'button', className: 'btn', disabled: saving, onClick: save },
          saving ? 'Saving…' : 'Save roles')
      )
    );
  }

  // Linked-character popup. members is the roster (GET /members/basic, null
  // while it loads); a character already linked to another account is listed
  // but can't be picked. onSave(user, memberId or null) resolves on success
  // and rejects with an error shown inline.
  function LinkCharacterModal(props) {
    var user = props.user;
    var onClose = props.onClose;
    var members = props.members;

    var pickState = useState(user.member_id == null ? '' : String(user.member_id));
    var pick = pickState[0], setPick = pickState[1];
    var savingState = useState(false);
    var saving = savingState[0], setSaving = savingState[1];
    var errState = useState('');
    var merr = errState[0], setMerr = errState[1];

    // Character id → the other account it's linked to.
    var takenBy = {};
    (props.users || []).forEach(function (u) {
      if (u.member_id != null && u.id !== user.id) takenBy[u.member_id] = u.username;
    });

    function save() {
      setSaving(true); setMerr('');
      Promise.resolve(props.onSave(user, pick === '' ? null : Number(pick))).then(null, function (e) {
        setMerr((e && e.message) || 'Failed to change the character.');
        setSaving(false);
      });
    }

    return h(window.PVAdminModal, {
      title: 'Linked character',
      onClose: onClose
    },
      merr ? h('div', { className: 'flash error', style: { marginBottom: '0.85rem' } }, merr) : null,
      h('div', { className: 'portal-field' },
        h('label', { htmlFor: 'link-character' }, 'Character'),
        members === null
          ? h('p', { className: 'portal-muted', style: { margin: 0 } }, 'Loading the roster…')
          : h('select', {
              id: 'link-character',
              value: pick,
              disabled: saving,
              onChange: function (e) { setPick(e.target.value); }
            },
              h('option', { value: '' }, 'No character'),
              members.map(function (m) {
                var other = takenBy[m.id];
                return h('option', { key: m.id, value: String(m.id), disabled: !!other },
                  m.name + (other ? ' — linked to ' + other : ''));
              })
            )
      ),
      h('div', { className: 'portal-form-actions' },
        h('button', { type: 'button', className: 'btn is-quiet', disabled: saving, onClick: onClose }, 'Cancel'),
        h('button', {
          type: 'button', className: 'btn',
          disabled: saving || members === null || pick === (user.member_id == null ? '' : String(user.member_id)),
          onClick: save
        }, saving ? 'Saving…' : 'Save')
      )
    );
  }

  // The registration code new accounts need (users.registration_code). With
  // no code set, account creation is closed.
  function RegistrationCodeCard() {
    var dataState = useState(null);   // { code, updated_at, updated_by_name }
    var data = dataState[0], setData = dataState[1];
    var draftState = useState('');
    var draft = draftState[0], setDraft = draftState[1];
    var savingState = useState(false);
    var saving = savingState[0], setSaving = savingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];
    var flashState = useState('');
    var flash = flashState[0], setFlash = flashState[1];

    useEffect(function () {
      PVAdminAPI.request('GET', '/admin/registration-code', undefined, true).then(setData, function (e) {
        setErr(e.message || 'Failed to load the registration code.');
      });
    }, []);

    async function save(code) {
      setSaving(true); setErr(''); setFlash('');
      try {
        var next = await PVAdminAPI.request('PUT', '/admin/registration-code', { code: code }, true);
        setData(next);
        setDraft('');
        setFlash(next.code ? 'Registration code saved.' : 'Account creation is closed.');
        setTimeout(function () { setFlash(''); }, 3000);
      } catch (e) {
        setErr(e.message || 'Failed to save the registration code.');
      } finally {
        setSaving(false);
      }
    }

    return h('div', { className: 'portal-card' },
      h('h2', { className: 'portal-card-title' }, 'Registration Code'),
      err ? h('div', { className: 'flash error' }, err) : null,
      flash ? h('div', { className: 'flash success' }, flash) : null,
      !data
        ? (err ? null : h('p', { className: 'portal-muted' }, 'Loading…'))
        : h('div', null,
            h('p', { style: { fontFamily: 'var(--font-text)', margin: '0 0 0.85rem' } },
              data.code
                ? ['New members need this code to create an account: ', h('strong', { key: 'c' }, data.code)]
                : 'Account creation is closed: no code is set.'),
            data.updated_at
              ? h('p', { className: 'portal-field-help', style: { marginTop: '-0.5rem' } },
                  'Last changed ' + fmtDate(data.updated_at) + (data.updated_by_name ? ' by ' + data.updated_by_name : '') + '.')
              : null,
            h('form', { onSubmit: function (e) { e.preventDefault(); if (draft.trim()) save(draft); } },
              h('div', { className: 'portal-field' },
                h('label', { htmlFor: 'registration-code' }, data.code ? 'New code' : 'Code'),
                h('input', {
                  id: 'registration-code', type: 'text', autoComplete: 'off', spellCheck: false, maxLength: 100,
                  value: draft, disabled: saving,
                  onChange: function (e) { setDraft(e.target.value); }
                }),
                h('p', { className: 'portal-field-help' }, 'At least 6 characters, not case-sensitive.')
              ),
              h('div', { className: 'portal-form-actions' },
                h('button', { type: 'submit', className: 'btn', disabled: saving || !draft.trim() },
                  saving ? 'Saving…' : 'Save code'),
                data.code
                  ? h('button', {
                      type: 'button', className: 'btn is-quiet', disabled: saving,
                      onClick: function () {
                        if (confirm('Close account creation? No one can register until a new code is set.')) save('');
                      }
                    }, 'Close account creation')
                  : null
              )
            )
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
    var rolesState = useState(FALLBACK_ROLES);
    var roles = rolesState[0], setRoles = rolesState[1];
    var tabState = useState('accounts');
    var tab = tabState[0], setTab = tabState[1];
    // linkingUser: null = closed; otherwise the user whose character popup is
    // open. members: the roster for its picker, loaded the first time.
    var linkingUserState = useState(null);
    var linkingUser = linkingUserState[0], setLinkingUser = linkingUserState[1];
    var membersState = useState(null);
    var members = membersState[0], setMembers = membersState[1];

    var session = PVAdminAPI.getSession();
    var selfUsername = session && session.username;
    var callerIsRoot = !!selfUsername && selfUsername.toLowerCase() === ROOT_ADMIN_USERNAME;
    var callerIsAdmin = callerIsRoot || ((session && session.roles) || []).indexOf('admin') !== -1;

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

    // Reload the role list whenever the Accounts tab is shown, so roles added
    // or relabelled in the Permissions tab show up.
    useEffect(function () {
      if (tab !== 'accounts') return;
      PVAdminAPI.request('GET', '/admin/roles', undefined, true).then(function (rows) {
        if (Array.isArray(rows) && rows.length) setRoles(rows);
      }, function () { /* keep the fallback list */ });
    // eslint-disable-next-line
    }, [tab]);

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

    function openLink(user) {
      setLinkingUser(user);
      if (members !== null) return;
      PVAdminAPI.request('GET', '/members/basic', undefined, true).then(function (rows) {
        setMembers(Array.isArray(rows) ? rows : []);
      }, function (e) {
        setLinkingUser(null);
        setErr(e.message || 'Failed to load the roster.');
      });
    }

    // Resolves on success (and closes the popup); rejects so the popup can
    // show the error. Reloads, so the account's name and tags follow.
    async function handleSaveLink(user, memberId) {
      setErr('');
      await PVAdminAPI.request('PUT', '/admin/users/' + user.id + '/character', { member_id: memberId }, true);
      setLinkingUser(null);
      await reload();
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
        // Build the member-facing link from this page's address so it works on
        // whatever domain (and base path) the portal is served from.
        var link = new URL('reset.html', window.location.href).href + '?token=' +
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

    // Root-only tabs, each shown when its script has loaded.
    var rootTabs = [
      { id: 'permissions', label: 'Permissions', component: window.PVAdminPermissions },
      { id: 'pages', label: 'Pages', component: window.PVAdminSitePages },
      { id: 'navigation', label: 'Navigation', component: window.PVAdminSiteNav }
    ].filter(function (t) { return callerIsRoot && t.component; });
    var tabs = [{ id: 'accounts', label: 'Accounts' }].concat(rootTabs.map(function (t) {
      return { id: t.id, label: t.label };
    }));
    var rootTab = rootTabs.find(function (t) { return t.id === tab; });
    if (rootTab) {
      return h('div', null,
        h(window.PVAdminSubnav, { tabs: tabs, active: tab, onChange: setTab }),
        h(rootTab.component));
    }

    return h('div', null,
      h(window.PVAdminSubnav, { tabs: tabs, active: tab, onChange: setTab }),
      PVAdminAPI.can('users.registration_code') ? h(RegistrationCodeCard) : null,
      h('div', { className: 'portal-card' },
        h('div', { className: 'portal-card-header' },
          h('h2', { className: 'portal-card-title' }, 'Users & Roles'),
          h('div', { className: 'portal-card-actions' },
            h('input', {
              type: 'search',
              name: 'account-search',
              autoComplete: 'off',
              className: 'field is-search',
              placeholder: 'Filter by username or display name…',
              value: filter,
              onChange: function (e) { setFilter(e.target.value); }
            })
          )
        ),
        err ? h('div', { className: 'flash error' }, err) : null,
        loading
          ? h('p', { className: 'portal-muted' }, 'Loading users…')
          : h('div', { className: 'portal-table-wrap' },
              h('table', { className: 'portal-table' },
                h('thead', null,
                  h('tr', null,
                    h('th', null, 'User'),
                    h('th', null, 'Created'),
                    h('th', null, 'Last Sign In'),
                    h('th', null, 'Roles'),
                    h('th', { className: 'portal-col-actions' }, '')
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
                          onLink: openLink,
                          onDelete: handleDelete,
                          onReset: handleReset,
                          deleting: deletingId === u.id,
                          resetting: resettingId === u.id,
                          roleLabels: roleLabeler(roles),
                          canRoles: PVAdminAPI.can('users.roles'),
                          canLink: PVAdminAPI.can('users.link'),
                          canDelete: PVAdminAPI.can('users.delete'),
                          canReset: PVAdminAPI.can('users.reset')
                        });
                      })
                    : h('tr', null,
                        h('td', {
                          colSpan: 5,
                          className: 'portal-empty-cell'
                        }, q ? 'No users match your filter.' : 'No users yet.')
                      )
                )
              )
            )
      ),
      editingUser ? h(RoleEditModal, {
        user: editingUser,
        roles: roles,
        canAdmin: callerIsAdmin,
        onSave: handleSaveRoles,
        onClose: function () { setEditingUser(null); }
      }) : null,
      linkingUser ? h(LinkCharacterModal, {
        user: linkingUser,
        users: users,
        members: members,
        onSave: handleSaveLink,
        onClose: function () { setLinkingUser(null); }
      }) : null,
      resetResult ? h(ResetLinkModal, {
        result: resetResult,
        onClose: function () { setResetResult(null); }
      }) : null
    );
  }

  window.PVAdminSettings = AdminSettings;
})();
