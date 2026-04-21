// ============================================================================
//  PVAdminAnnouncements — Officer bulletin board
//
//  - Everyone signed in can read bulletins.
//  - Officers and admins can post new ones (with optional Discord toggle).
//  - Admins can delete.
//
//  Worker routes:
//    GET    /announcements
//    POST   /announcements      officer|admin
//    DELETE /announcements/:id  admin only
//
//  The Discord toggle passes `post_to_discord: true`; the med-database worker
//  then forwards to pv-announcements-discord-worker. If either of those is
//  unconfigured, the post still saves and we surface `discord_error` inline.
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;

  function formatWhen(iso) {
    if (!iso) return '';
    var d = new Date(iso.indexOf('Z') === -1 ? iso + 'Z' : iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
  }

  function ComposeForm(props) {
    var onSubmit = props.onSubmit;

    var titleState = useState('');
    var title = titleState[0], setTitle = titleState[1];
    var bodyState = useState('');
    var body = bodyState[0], setBody = bodyState[1];
    var pinnedState = useState(false);
    var pinned = pinnedState[0], setPinned = pinnedState[1];
    var discordState = useState(false);
    var toDiscord = discordState[0], setToDiscord = discordState[1];
    var savingState = useState(false);
    var saving = savingState[0], setSaving = savingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];
    var noteState = useState('');
    var note = noteState[0], setNote = noteState[1];

    async function handleSubmit(e) {
      e.preventDefault();
      if (!title.trim() || !body.trim()) {
        setErr('Title and body are required.');
        return;
      }
      setSaving(true); setErr(''); setNote('');
      try {
        var result = await onSubmit({
          title: title.trim(),
          body: body.trim(),
          pinned: pinned,
          post_to_discord: toDiscord
        });
        setTitle(''); setBody(''); setPinned(false); setToDiscord(false);
        if (result && toDiscord) {
          if (result.discord_posted) setNote('Posted to Discord.');
          else setNote('Saved, but Discord post failed: ' + (result.discord_error || 'unknown error.'));
        }
      } catch (e) {
        setErr(e.message || 'Failed to post announcement.');
      } finally {
        setSaving(false);
      }
    }

    return h('form', { onSubmit: handleSubmit, className: 'portal-card' },
      h('h2', { className: 'portal-card-title' }, 'New Bulletin'),
      err ? h('div', { className: 'portal-flash error' }, err) : null,
      note ? h('div', { className: 'portal-flash success' }, note) : null,
      h('div', { className: 'portal-field' },
        h('label', null, 'Title *'),
        h('input', {
          type: 'text',
          value: title,
          onChange: function (e) { setTitle(e.target.value); },
          maxLength: 200
        })
      ),
      h('div', { className: 'portal-field' },
        h('label', null, 'Body *'),
        h('textarea', {
          value: body,
          onChange: function (e) { setBody(e.target.value); },
          rows: 5
        })
      ),
      h('div', { style: { display: 'flex', gap: '1.25rem', alignItems: 'center', flexWrap: 'wrap' } },
        h('label', { style: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem' } },
          h('input', {
            type: 'checkbox',
            checked: pinned,
            onChange: function (e) { setPinned(e.target.checked); }
          }),
          h('span', null, 'Pin to top')
        ),
        h('label', { style: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem' } },
          h('input', {
            type: 'checkbox',
            checked: toDiscord,
            onChange: function (e) { setToDiscord(e.target.checked); }
          }),
          h('span', null, 'Post to Discord #officer-announcements')
        ),
        h('button', {
          type: 'submit',
          className: 'portal-btn',
          disabled: saving,
          style: { marginLeft: 'auto' }
        }, saving ? 'Posting…' : 'Post bulletin')
      )
    );
  }

  function BulletinCard(props) {
    var a = props.announcement;
    var onDelete = props.onDelete;
    var allowDelete = props.allowDelete;

    var author = a.author_display_name || a.author_username || '— former member —';

    return h('article', {
      className: 'portal-card',
      style: a.pinned ? { borderColor: 'var(--accent-red)' } : null
    },
      h('header', { style: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' } },
        a.pinned ? h('span', { className: 'portal-badge is-pinned' }, 'Pinned') : null,
        h('h2', { className: 'portal-card-title', style: { margin: 0, flex: 1, textTransform: 'none', letterSpacing: 'normal', fontSize: '1.05rem' } }, a.title),
        a.discord_posted ? h('span', { className: 'portal-badge is-ok' }, 'Discord') : null,
        allowDelete ? h('button', {
          type: 'button',
          className: 'portal-btn is-small is-danger',
          onClick: function () {
            if (confirm('Delete “' + a.title + '”?')) onDelete(a);
          }
        }, 'Delete') : null
      ),
      h('p', {
        style: {
          margin: '0.1rem 0 0.5rem', color: 'var(--text-secondary)',
          fontFamily: 'La Belle Aurore, cursive', fontSize: '0.95rem'
        }
      }, author + ' · ' + formatWhen(a.created_at)),
      h('div', { style: { whiteSpace: 'pre-wrap' } }, a.body)
    );
  }

  function Announcements() {
    var canPost = PVAdminAPI.hasRole('officer') || PVAdminAPI.hasRole('admin');
    var canDelete = PVAdminAPI.hasRole('admin');

    var listState = useState([]);
    var list = listState[0], setList = listState[1];
    var loadingState = useState(true);
    var loading = loadingState[0], setLoading = loadingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];

    async function reload() {
      setErr('');
      try {
        var data = await PVAdminAPI.request('GET', '/announcements', undefined, true);
        setList(Array.isArray(data) ? data : []);
      } catch (e) {
        setErr(e.message || 'Failed to load announcements.');
      } finally {
        setLoading(false);
      }
    }

    useEffect(function () { reload(); }, []);

    async function handleCreate(draft) {
      var result = await PVAdminAPI.request('POST', '/announcements', draft, true);
      await reload();
      return result;
    }

    async function handleDelete(a) {
      try {
        await PVAdminAPI.request('DELETE', '/announcements/' + a.id, undefined, true);
        await reload();
      } catch (e) {
        setErr(e.message || 'Failed to delete bulletin.');
      }
    }

    return h('div', null,
      canPost ? h(ComposeForm, { onSubmit: handleCreate }) : null,
      err ? h('div', { className: 'portal-card' }, h('div', { className: 'portal-flash error' }, err)) : null,
      loading
        ? h('div', { className: 'portal-card' }, 'Loading bulletins…')
        : list.length
          ? list.map(function (a) {
              return h(BulletinCard, {
                key: a.id,
                announcement: a,
                onDelete: handleDelete,
                allowDelete: canDelete
              });
            })
          : h('div', { className: 'portal-card' },
              h('p', { style: { color: 'var(--text-secondary)', margin: 0 } }, 'No bulletins posted yet.')
            )
    );
  }

  window.PVAdminAnnouncements = Announcements;
})();
