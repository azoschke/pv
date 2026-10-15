// ============================================================================
//  PVAdminAnnouncements — Channel-scoped bulletin boards
//
//  Exposes two globals:
//    - PVAdminBulletinBoard   reusable board, rendered by faction sections
//    - PVAdminAnnouncements   the main Announcements tab (general channel)
//
//  Worker routes (channel-aware):
//    GET    /announcements?channel=general|pirate|mercenary|recon|house_staff
//    POST   /announcements      body.channel decides the permission needed
//    DELETE /announcements/:id  announcements.delete
//
//  Discord forwarding only exists on the `general` channel; the worker
//  ignores `post_to_discord` for the other two.
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
    var onCancel = props.onCancel;
    var showDiscord = props.showDiscord;
    var discordLabel = props.discordLabel || 'Post to Discord';

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

    async function handleSubmit(e) {
      e.preventDefault();
      if (!title.trim() || !body.trim()) {
        setErr('Title and body are required.');
        return;
      }
      setSaving(true); setErr('');
      try {
        await onSubmit({
          title: title.trim(),
          body: body.trim(),
          pinned: pinned,
          post_to_discord: showDiscord ? toDiscord : false
        });
      } catch (e) {
        setErr(e.message || 'Failed to post bulletin.');
        setSaving(false);
      }
    }

    return h('form', { onSubmit: handleSubmit },
      err ? h('div', { className: 'portal-flash error' }, err) : null,
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
          rows: 6
        })
      ),
      h('div', { style: { display: 'flex', gap: '1.25rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.25rem' } },
        h('label', { className: 'portal-check-inline' },
          h('input', {
            type: 'checkbox',
            checked: pinned,
            onChange: function (e) { setPinned(e.target.checked); }
          }),
          h('span', null, 'Pin to top')
        ),
        showDiscord ? h('label', { className: 'portal-check-inline' },
          h('input', {
            type: 'checkbox',
            checked: toDiscord,
            onChange: function (e) { setToDiscord(e.target.checked); }
          }),
          h('span', null, discordLabel)
        ) : null
      ),
      h('div', { className: 'portal-form-actions' },
        h('button', {
          type: 'submit',
          className: 'btn',
          disabled: saving
        }, saving ? 'Posting…' : 'Post bulletin'),
        onCancel ? h('button', {
          type: 'button',
          className: 'btn is-quiet',
          onClick: onCancel,
          disabled: saving
        }, 'Cancel') : null
      )
    );
  }

  function BulletinCard(props) {
    var a = props.announcement;
    var onDelete = props.onDelete;
    var allowDelete = props.allowDelete;

    var author = a.author_display_name || a.author_username || '— former member —';

    // A recessed tray inside the board's card; a pinned bulletin carries a
    // red Pinned pill.
    return h('article', { className: 'bulletin-item tray' },
      h('header', { className: 'bulletin-head' },
        h('h2', { className: 'bulletin-title' }, a.title),
        a.pinned ? h('span', { className: 'pill' }, 'Pinned') : null,
        a.discord_posted ? h('span', { className: 'status-dot is-quiet' }, 'Discord') : null,
        allowDelete ? h('button', {
          type: 'button',
          className: 'btn is-small is-danger',
          onClick: function () {
            if (confirm('Delete “' + a.title + '”?')) onDelete(a);
          }
        }, 'Delete') : null
      ),
      h('p', { className: 'bulletin-by' }, author + ' · ' + formatWhen(a.created_at)),
      h('div', { className: 'portal-pre' }, a.body)
    );
  }

  // Permission to POST per channel. Mirrors the worker's channelPostPermission:
  // General is the Announcements page, each faction channel its Factions tab.
  function postPermissionForChannel(channel) {
    return channel === 'general' ? 'announcements.post' : 'factions.' + channel + '.post';
  }

  // --------- Reusable board ----------
  //  props:
  //    channel        'general' | 'pirate' | 'mercenary'
  //    heading        text shown at top of the compose card (default "Announcements")
  //    composeTitle   modal title (default "New Announcement")
  //    showDiscord    boolean (default false — only the general tab passes true)
  //    discordLabel   override the checkbox label
  function BulletinBoard(props) {
    var channel = props.channel || 'general';
    var heading = props.heading || 'Announcements';
    var composeTitle = props.composeTitle || 'New Announcement';
    var showDiscord = !!props.showDiscord;
    var discordLabel = props.discordLabel;

    var canPost = PVAdminAPI.can(postPermissionForChannel(channel));
    var canDelete = PVAdminAPI.can('announcements.delete');

    var listState = useState([]);
    var list = listState[0], setList = listState[1];
    var loadingState = useState(true);
    var loading = loadingState[0], setLoading = loadingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];
    var composeOpenState = useState(false);
    var composeOpen = composeOpenState[0], setComposeOpen = composeOpenState[1];
    var flashState = useState('');
    var flash = flashState[0], setFlash = flashState[1];

    async function reload() {
      setErr('');
      try {
        var data = await PVAdminAPI.request(
          'GET',
          '/announcements?channel=' + encodeURIComponent(channel),
          undefined, true
        );
        setList(Array.isArray(data) ? data : []);
      } catch (e) {
        setErr(e.message || 'Failed to load bulletins.');
      } finally {
        setLoading(false);
      }
    }

    useEffect(function () { reload(); }, [channel]);

    async function handleCreate(draft) {
      var payload = Object.assign({}, draft, { channel: channel });
      var result = await PVAdminAPI.request('POST', '/announcements', payload, true);
      setComposeOpen(false);
      if (showDiscord && draft.post_to_discord) {
        if (result && result.discord_posted) setFlash('Bulletin posted. Posted to Discord.');
        else setFlash('Bulletin posted, but Discord post failed: ' + ((result && result.discord_error) || 'unknown error.'));
      } else {
        setFlash('Bulletin posted.');
      }
      setTimeout(function () { setFlash(''); }, 4000);
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
      h('div', { className: 'portal-card tear' },
        h('div', { className: 'portal-card-header' },
          h('h2', { className: 'portal-card-title' }, heading),
          canPost ? h('div', { className: 'portal-card-actions' },
            h('button', {
              type: 'button',
              className: 'btn',
              onClick: function () { setComposeOpen(true); }
            },
              h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'add'),
              h('span', null, 'New bulletin')
            )
          ) : null
        ),
        flash ? h('div', { className: 'portal-flash success' }, flash) : null,
        err ? h('div', { className: 'portal-flash error' }, err) : null,
        loading
          ? h('p', { className: 'portal-note' }, 'Loading bulletins…')
          : list.length
            ? h('div', { className: 'bulletin-list' },
                list.map(function (a) {
                  return h(BulletinCard, {
                    key: a.id,
                    announcement: a,
                    onDelete: handleDelete,
                    allowDelete: canDelete
                  });
                })
              )
            : h('div', { className: 'portal-empty' }, 'No bulletins posted yet.')
      ),
      composeOpen ? h(window.PVAdminModal, {
        title: composeTitle,
        size: 'lg',
        onClose: function () { setComposeOpen(false); }
      },
        h(ComposeForm, {
          onSubmit: handleCreate,
          onCancel: function () { setComposeOpen(false); },
          showDiscord: showDiscord,
          discordLabel: discordLabel
        })
      ) : null
    );
  }

  // The Announcements tab is just the general-channel board with Discord on.
  function Announcements() {
    return h(BulletinBoard, {
      channel: 'general',
      heading: 'Announcements',
      composeTitle: 'New Announcement',
      showDiscord: true,
      discordLabel: 'Post to Discord #officer-announcements'
    });
  }

  window.PVAdminBulletinBoard = BulletinBoard;
  window.PVAdminAnnouncements = Announcements;
})();
