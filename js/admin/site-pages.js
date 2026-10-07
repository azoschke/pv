// ============================================================================
//  PVAdminSitePages — Admin Settings → Pages (root admin only)
//
//  Site Defaults: the site name, title template, default description and
//  preview image, favicon, theme color and extra robots.txt lines used for
//  every page.
//
//  Pages: every HTML page the site serves, with its title, description, link
//  preview, search-engine settings and access:
//    Public       anyone
//    Signed in    any signed-in account, including ones awaiting a role
//    Restricted   roles granted the page's key in Permissions (Site Pages
//                 group); root always can
//  Add page registers a newly pushed HTML file. It starts Restricted (only
//  root can open it) and marked Needs review until it is first saved, and is
//  placed in the nav (a group, the top level, or unlisted).
//
//  Worker routes (root only):
//    GET    /admin/site             { settings, pages, nav, permissions }
//    PUT    /admin/site/settings
//    POST   /admin/site/pages       { path, title, placement }
//    PATCH  /admin/site/pages/:id
//    DELETE /admin/site/pages/:id
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;

  var ACCESS = [
    { value: 'public', label: 'Public', help: 'Anyone can open this page.' },
    { value: 'signed_in', label: 'Signed in', help: 'Any signed-in account can open it, including accounts still awaiting a role.' },
    { value: 'restricted', label: 'Restricted', help: 'Only roles granted this page in Permissions → Site Pages can open it. You always can.' }
  ];
  function accessLabel(value) {
    var a = ACCESS.find(function (o) { return o.value === value; });
    return a ? a.label : value;
  }
  function accessBadge(page) {
    if (page.access === 'restricted') return h('span', { className: 'portal-badge is-pinned' }, 'Restricted');
    if (page.access === 'signed_in') return h('span', { className: 'portal-badge' }, 'Signed in');
    return null;
  }

  // "/" ↔ index.html, "/job-board" ↔ job-board.html
  function fileOf(path) { return path === '/' ? 'index.html' : path.slice(1) + '.html'; }
  // Mirrors the worker's cleanPagePath: null when it isn't a page file name.
  function cleanPath(raw) {
    var p = String(raw || '').trim().split(/[?#]/)[0]
      .replace(/^\/+|\/+$/g, '').replace(/\.html?$/i, '');
    if (p === '' || p === 'index') return '/';
    return /^[a-z0-9][a-z0-9_-]*$/.test(p) ? '/' + p : null;
  }
  function navGroups(nav) {
    return (nav || []).filter(function (n) { return n.parent_id == null && n.type === 'group'; });
  }
  // Page id → position of its first link in the nav: the top level in order,
  // with each group's links in order where the group sits.
  function navOrder(nav) {
    var order = {}, next = 0;
    function visit(parentId) {
      (nav || [])
        .filter(function (n) { return (n.parent_id == null ? null : n.parent_id) === parentId; })
        .sort(function (a, b) { return a.sort_order - b.sort_order; })
        .forEach(function (n) {
          if (n.page_id && !(n.page_id in order)) order[n.page_id] = next++;
          if (n.type === 'group') visit(n.id);
        });
    }
    visit(null);
    return order;
  }
  // The portal and its sign-in pages, listed last.
  var ACCOUNT_PAGES = ['/portal', '/login', '/register', '/reset'];

  function loadSite() {
    return PVAdminAPI.request('GET', '/admin/site', undefined, true);
  }

  function Checkbox(props) {
    return h('label', { className: 'portal-checkbox-option' + (props.disabled ? ' is-disabled' : '') },
      h('input', {
        type: 'checkbox', checked: !!props.checked, disabled: !!props.disabled,
        onChange: function (e) { props.onChange(e.target.checked); }
      }),
      h('span', null, props.label));
  }

  // ── Site Defaults ─────────────────────────────────────────────────────────
  var SETTINGS_FIELDS = ['site_name', 'title_template', 'default_description', 'default_og_image',
    'favicon_url', 'theme_color', 'robots_extra'];
  function settingsDraft(s) {
    var d = {};
    SETTINGS_FIELDS.forEach(function (k) { d[k] = (s && s[k]) || ''; });
    return d;
  }

  function SettingsCard(props) {
    var draftState = useState(function () { return settingsDraft(props.settings); });
    var draft = draftState[0], setDraft = draftState[1];
    var savingState = useState(false); var saving = savingState[0], setSaving = savingState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];

    useEffect(function () { setDraft(settingsDraft(props.settings)); }, [props.settings]);

    var saved = settingsDraft(props.settings);
    var dirty = SETTINGS_FIELDS.some(function (k) { return draft[k] !== saved[k]; });
    function setField(k, v) { setDraft(function (d) { var n = Object.assign({}, d); n[k] = v; return n; }); }

    function save() {
      setSaving(true); setErr('');
      PVAdminAPI.request('PUT', '/admin/site/settings', draft, true).then(function (data) {
        props.onSaved(data, 'Site defaults saved.');
      }, function (e) {
        setErr(e.message || 'Failed to save site defaults.');
      }).then(function () { setSaving(false); });
    }

    var swatch = /^#[0-9a-f]{6}$/i.test(draft.theme_color) ? draft.theme_color : null;
    return h('div', { className: 'portal-card' },
      h('div', { className: 'portal-card-header' },
        h('h2', { className: 'portal-card-title' }, 'Site Defaults')),
      err ? h('div', { className: 'portal-flash error' }, err) : null,
      h('div', { className: 'portal-field-row' },
        h('div', { className: 'portal-field' },
          h('label', null, 'Site name *'),
          h('input', { type: 'text', maxLength: 80, value: draft.site_name, disabled: saving,
            onChange: function (e) { setField('site_name', e.target.value); } })),
        h('div', { className: 'portal-field' },
          h('label', null, 'Title template *'),
          h('input', { type: 'text', maxLength: 120, value: draft.title_template, disabled: saving,
            onChange: function (e) { setField('title_template', e.target.value); } }),
          h('p', { className: 'portal-field-help' },
            '{title} is replaced with each page\'s title. The home page uses its title as-is.'))),
      h('div', { className: 'portal-field' },
        h('label', null, 'Default description'),
        h('textarea', { rows: 2, maxLength: 300, value: draft.default_description, disabled: saving,
          onChange: function (e) { setField('default_description', e.target.value); } }),
        h('p', { className: 'portal-field-help' }, 'Used in search results and link previews for pages without their own description.')),
      h(PVAdminImageUpload.ImageField, {
        label: 'Default preview image',
        value: draft.default_og_image,
        onChange: function (v) { setField('default_og_image', v); },
        disabled: saving,
        kind: 'site',
        name: 'default-preview',
        help: 'Shown when a link to the site is shared, e.g. on Discord. Uploads are cropped to 1200×630.'
      }),
      h(PVAdminImageUpload.ImageField, {
        label: 'Favicon',
        value: draft.favicon_url,
        onChange: function (v) { setField('favicon_url', v); },
        disabled: saving,
        kind: 'favicon',
        name: 'favicon',
        help: 'The browser tab icon. A square PNG, 512 KB at most.'
      }),
      h('div', { className: 'portal-field-row' },
        h('div', { className: 'portal-field' },
          h('label', null, 'Theme color'),
          h('div', { className: 'portal-image-row' },
            h('input', { type: 'text', maxLength: 7, value: draft.theme_color, placeholder: '#a54d44', disabled: saving,
              className: 'portal-grow',
              onChange: function (e) { setField('theme_color', e.target.value.trim()); } }),
            h('span', { className: 'site-swatch', style: { background: swatch || 'transparent' }, 'aria-hidden': 'true' })),
          h('p', { className: 'portal-field-help' }, 'Colors the edge of link previews on Discord. Leave empty for none.')),
        h('div', { className: 'portal-field' },
          h('label', null, 'Extra robots.txt lines'),
          h('textarea', { rows: 3, maxLength: 2000, value: draft.robots_extra, disabled: saving,
            className: 'site-mono',
            onChange: function (e) { setField('robots_extra', e.target.value); } }),
          h('p', { className: 'portal-field-help' }, 'Added to robots.txt as written. The sitemap line is added for you.'))),
      h('div', { className: 'portal-btn-row' },
        h('button', { type: 'button', className: 'portal-btn', disabled: saving || !dirty, onClick: save },
          saving ? 'Saving…' : 'Save defaults'),
        dirty ? h('button', { type: 'button', className: 'portal-btn is-ghost', disabled: saving,
          onClick: function () { setDraft(saved); } }, 'Discard') : null)
    );
  }

  // ── Edit page ─────────────────────────────────────────────────────────────
  function pageDraft(p) {
    return {
      title: p.title || '',
      file: fileOf(p.path),
      description: p.description || '',
      access: p.access,
      robots_index: !!p.robots_index,
      robots_follow: !!p.robots_follow,
      og_title: p.og_title || '',
      og_description: p.og_description || '',
      og_image: p.og_image || ''
    };
  }

  function EditPageModal(props) {
    var page = props.page;
    var draftState = useState(function () { return pageDraft(page); });
    var draft = draftState[0], setDraft = draftState[1];
    var savingState = useState(false); var saving = savingState[0], setSaving = savingState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];
    function setField(k, v) { setDraft(function (d) { var n = Object.assign({}, d); n[k] = v; return n; }); }

    var accessInfo = ACCESS.find(function (a) { return a.value === draft.access; });
    var alwaysHidden = draft.access === 'restricted';

    function save(e) {
      e.preventDefault();
      if (!draft.title.trim()) { setErr('Enter a title.'); return; }
      if (!cleanPath(draft.file)) { setErr('Enter the page\'s file name, e.g. new-page.html.'); return; }
      if (page.access === 'restricted' && draft.access !== 'restricted' &&
          !confirm('Make "' + page.title + '" ' + accessLabel(draft.access) + '? Its permission key and every role\'s grant ' +
                   'for it are removed. Restricting it again later starts with no grants.')) {
        return;
      }
      setSaving(true); setErr('');
      PVAdminAPI.request('PATCH', '/admin/site/pages/' + page.id, {
        title: draft.title,
        path: draft.file,
        description: draft.description,
        access: draft.access,
        robots_index: draft.robots_index,
        robots_follow: draft.robots_follow,
        og_title: draft.og_title,
        og_description: draft.og_description,
        og_image: draft.og_image
      }, true).then(function (data) {
        props.onSaved(data, '"' + draft.title.trim() + '" saved.');
      }, function (e2) {
        setErr(e2.message || 'Failed to save the page.');
        setSaving(false);
      });
    }

    return h(window.PVAdminModal, { title: 'Edit page — ' + page.title, size: 'lg', onClose: props.onClose },
      h('form', { onSubmit: save },
        page.needs_review
          ? h('div', { className: 'portal-flash', style: { marginBottom: '0.85rem' } },
              'This page is new and only you can open it until roles are granted or its access changes. ' +
              'Saving it marks it reviewed.')
          : null,
        err ? h('div', { className: 'portal-flash error', style: { marginBottom: '0.85rem' } }, err) : null,
        h('div', { className: 'portal-field-row' },
          h('div', { className: 'portal-field' },
            h('label', null, 'Title *'),
            h('input', { type: 'text', maxLength: 120, value: draft.title, disabled: saving,
              onChange: function (e) { setField('title', e.target.value); } })),
          h('div', { className: 'portal-field' },
            h('label', null, 'File *'),
            h('input', { type: 'text', value: draft.file, disabled: saving,
              onChange: function (e) { setField('file', e.target.value); } }),
            h('p', { className: 'portal-field-help' }, 'The page\'s HTML file. Changing it moves these settings to another file.'))),
        h('div', { className: 'portal-field' },
          h('label', null, 'Description'),
          h('textarea', { rows: 2, maxLength: 300, value: draft.description, disabled: saving,
            onChange: function (e) { setField('description', e.target.value); } }),
          h('p', { className: 'portal-field-help' }, 'Used in search results and link previews. Leave empty to use the site default.')),
        h('div', { className: 'portal-field-row' },
          h('div', { className: 'portal-field' },
            h('label', null, 'Access'),
            h('select', { value: draft.access, disabled: saving, onChange: function (e) { setField('access', e.target.value); } },
              ACCESS.map(function (a) { return h('option', { key: a.value, value: a.value }, a.label); })),
            h('p', { className: 'portal-field-help' }, accessInfo ? accessInfo.help : '')),
          h('div', { className: 'portal-field' },
            h('label', null, 'Search engines'),
            h('div', { className: 'portal-checkbox-group' },
              h(Checkbox, { label: 'Show in search results', checked: draft.robots_index, disabled: saving,
                onChange: function (v) { setField('robots_index', v); } }),
              h(Checkbox, { label: 'Follow its links', checked: draft.robots_follow, disabled: saving,
                onChange: function (v) { setField('robots_follow', v); } })),
            h('p', { className: 'portal-field-help' }, alwaysHidden
              ? 'Restricted pages are always hidden from search engines.'
              : 'Pages awaiting review are hidden from search engines until saved.'))),
        h('h3', { className: 'portal-form-title site-subhead' }, 'Link preview'),
        h('p', { className: 'portal-field-help', style: { marginTop: 0 } },
          'Optional. Leave empty to use the title, the description and the site\'s default image.'),
        h('div', { className: 'portal-field-row' },
          h('div', { className: 'portal-field' },
            h('label', null, 'Preview title'),
            h('input', { type: 'text', maxLength: 120, value: draft.og_title, placeholder: draft.title, disabled: saving,
              onChange: function (e) { setField('og_title', e.target.value); } })),
          h('div', { className: 'portal-field' },
            h('label', null, 'Preview description'),
            h('input', { type: 'text', maxLength: 300, value: draft.og_description, disabled: saving,
              onChange: function (e) { setField('og_description', e.target.value); } }))),
        h(PVAdminImageUpload.ImageField, {
          label: 'Preview image',
          value: draft.og_image,
          onChange: function (v) { setField('og_image', v); },
          disabled: saving,
          kind: 'site',
          name: draft.title.trim() || 'page',
          help: 'Uploads are cropped to 1200×630.'
        }),
        h('div', { className: 'portal-btn-row' },
          h('button', { type: 'submit', className: 'portal-btn', disabled: saving }, saving ? 'Saving…' : 'Save page'),
          h('button', { type: 'button', className: 'portal-btn is-ghost', disabled: saving, onClick: props.onClose }, 'Cancel'))
      )
    );
  }

  // ── Add page ──────────────────────────────────────────────────────────────
  function AddPageModal(props) {
    var groups = navGroups(props.data.nav);
    var fileState = useState(''); var file = fileState[0], setFile = fileState[1];
    var titleState = useState(''); var title = titleState[0], setTitle = titleState[1];
    var placeState = useState(groups.length ? String(groups[0].id) : 'top');
    var placement = placeState[0], setPlacement = placeState[1];
    var checkState = useState(null); var check = checkState[0], setCheck = checkState[1];
    var savingState = useState(false); var saving = savingState[0], setSaving = savingState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];

    // Looks for the file on this site and fills in the title from its <title>.
    function lookUp() {
      var path = cleanPath(file);
      if (!file.trim()) { setCheck(null); return; }
      if (!path) { setCheck({ bad: true, text: 'Use the page\'s file name, e.g. new-page.html (lowercase letters, numbers, - and _).' }); return; }
      if (props.data.pages.some(function (p) { return p.path === path; })) {
        setCheck({ bad: true, text: fileOf(path) + ' is already in the list.' });
        return;
      }
      setCheck({ text: 'Looking for ' + fileOf(path) + '…' });
      fetch(fileOf(path), { cache: 'no-store' }).then(function (res) {
        if (!res.ok) throw new Error('missing');
        return res.text();
      }).then(function (html) {
        // Drop the site's own suffix ("… — Phoenix Vanguard"): the title
        // template's ending first, else the site name after a separator.
        var found = (new DOMParser().parseFromString(html, 'text/html').title || '').trim();
        var settings = props.data.settings || {};
        var tpl = settings.title_template || '';
        var at = tpl.indexOf('{title}');
        var suffix = at >= 0 ? tpl.slice(at + '{title}'.length) : '';
        if (suffix && found.length > suffix.length && found.slice(-suffix.length) === suffix) {
          found = found.slice(0, -suffix.length);
        } else if (settings.site_name) {
          var esc = settings.site_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          found = found.replace(new RegExp('\\s*[—–|·:-]\\s*' + esc + '(\\s+Tools)?\\s*$', 'i'), '');
        }
        found = found.trim();
        setCheck({ ok: true, text: 'Found ' + fileOf(path) + '.' });
        setTitle(function (t) { return t || found; });
      }).catch(function () {
        setCheck({ bad: true, text: 'Couldn\'t open ' + fileOf(path) + ' on this site. Check the name; the file has to be ' +
          'pushed first. You can still add it.' });
      });
    }

    function save(e) {
      e.preventDefault();
      var path = cleanPath(file);
      if (!path) { setErr('Enter the page\'s file name, e.g. new-page.html.'); return; }
      if (!title.trim()) { setErr('Enter a title.'); return; }
      setSaving(true); setErr('');
      PVAdminAPI.request('POST', '/admin/site/pages', {
        path: file,
        title: title,
        placement: placement === 'top' || placement === 'unlisted' ? placement : Number(placement)
      }, true).then(function (data) {
        props.onSaved(data, '"' + title.trim() + '" added as Restricted. Grant roles in Permissions → Site Pages, ' +
          'then review and save it here to launch it.');
      }, function (e2) {
        setErr(e2.message || 'Failed to add the page.');
        setSaving(false);
      });
    }

    return h(window.PVAdminModal, { title: 'Add page', onClose: props.onClose },
      h('form', { onSubmit: save },
        err ? h('div', { className: 'portal-flash error', style: { marginBottom: '0.85rem' } }, err) : null,
        h('div', { className: 'portal-field' },
          h('label', null, 'File *'),
          h('input', { type: 'text', value: file, placeholder: 'new-page.html', disabled: saving, autoFocus: true,
            onChange: function (e) { setFile(e.target.value); setCheck(null); },
            onBlur: lookUp }),
          check
            ? h('p', { className: 'portal-field-help' + (check.bad ? ' is-error' : '') }, check.text)
            : h('p', { className: 'portal-field-help' }, 'The new page\'s HTML file, as pushed to the site.')),
        h('div', { className: 'portal-field' },
          h('label', null, 'Title *'),
          h('input', { type: 'text', maxLength: 120, value: title, disabled: saving,
            onChange: function (e) { setTitle(e.target.value); } })),
        h('div', { className: 'portal-field' },
          h('label', null, 'Place in the nav'),
          h('select', { value: placement, disabled: saving, onChange: function (e) { setPlacement(e.target.value); } },
            groups.map(function (g) { return h('option', { key: g.id, value: String(g.id) }, 'End of ' + g.label); }),
            h('option', { value: 'top' }, 'Top level (a plain link)'),
            h('option', { value: 'unlisted' }, 'Unlisted (no nav link)')),
          h('p', { className: 'portal-field-help' },
            'New pages start Restricted: only you can open them, and their nav link only shows to you, until you ' +
            'grant roles in Permissions → Site Pages or change the access.')),
        h('div', { className: 'portal-btn-row' },
          h('button', { type: 'submit', className: 'portal-btn', disabled: saving }, saving ? 'Adding…' : 'Add page'),
          h('button', { type: 'button', className: 'portal-btn is-ghost', disabled: saving, onClick: props.onClose }, 'Cancel'))
      )
    );
  }

  // ── Pages list ────────────────────────────────────────────────────────────
  function PagesCard(props) {
    var data = props.data;
    var deletingState = useState(null); var deleting = deletingState[0], setDeleting = deletingState[1];

    function remove(page) {
      if (!confirm('Delete "' + page.title + '" (' + fileOf(page.path) + ') from the list? Its nav links' +
                   (page.permission_key ? ', its permission key and every role\'s grant for it' : '') +
                   ' are removed too. The HTML file itself stays on the site.')) return;
      setDeleting(page.id);
      PVAdminAPI.request('DELETE', '/admin/site/pages/' + page.id, undefined, true).then(function (d) {
        props.onSaved(d, '"' + page.title + '" removed from the list.');
      }, function (e) {
        props.onError(e.message || 'Failed to delete the page.');
      }).then(function () { setDeleting(null); });
    }

    // Nav order first; then unlisted pages (home first); then the portal and
    // sign-in pages.
    var order = navOrder(data.nav);
    function rank(p) {
      if (p.id in order) return [0, order[p.id]];
      var acct = ACCOUNT_PAGES.indexOf(p.path);
      return acct === -1 ? [1, 0] : [2, acct];
    }
    var pages = data.pages.slice().sort(function (a, b) {
      var ra = rank(a), rb = rank(b);
      return (ra[0] - rb[0]) || (ra[1] - rb[1]) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    });
    return h('div', { className: 'portal-card' },
      h('div', { className: 'portal-card-header' },
        h('h2', { className: 'portal-card-title' }, 'Pages'),
        h('div', { className: 'portal-card-actions' },
          h('button', { type: 'button', className: 'portal-btn', onClick: props.onAdd },
            h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'add'), 'Add page'))),
      h('div', { className: 'portal-table-wrap site-table-scroll' },
        h('table', { className: 'portal-table' },
          h('thead', null, h('tr', null,
            h('th', null, 'Page'),
            h('th', null, 'Access'),
            h('th', null, 'Search'),
            h('th', null, 'Nav'),
            h('th', { className: 'portal-col-actions' }, ''))),
          h('tbody', null, pages.map(function (p) {
            var hidden = !p.robots_index || p.access === 'restricted' || p.needs_review;
            return h('tr', { key: p.id, className: p.needs_review ? 'is-needs-role' : null },
              h('td', null,
                h('div', { className: 'portal-name-row' },
                  h('span', { className: 'portal-strong' }, p.title),
                  p.needs_review ? h('span', { className: 'portal-badge is-warn' }, 'Needs review') : null),
                h('div', { className: 'portal-muted' }, fileOf(p.path))),
              h('td', null, accessBadge(p) || h('span', { className: 'portal-muted' }, 'Public')),
              h('td', null, hidden ? h('span', { className: 'portal-muted' }, 'Hidden') : 'Shown'),
              h('td', null, p.id in order ? 'Listed' : h('span', { className: 'portal-muted' }, 'Unlisted')),
              h('td', { className: 'portal-col-actions' },
                h('div', { className: 'site-row-actions' },
                  h('button', { type: 'button', className: 'portal-btn is-small is-ghost', onClick: function () { props.onEdit(p); } },
                    p.needs_review ? 'Review' : 'Edit'),
                  h('button', { type: 'button', className: 'portal-btn is-small is-danger', disabled: deleting === p.id,
                    onClick: function () { remove(p); } }, deleting === p.id ? 'Deleting…' : 'Delete'))));
          }))))
    );
  }

  // ── Section ───────────────────────────────────────────────────────────────
  function SitePagesSection() {
    var dataState = useState(null); var data = dataState[0], setData = dataState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];
    var flashState = useState(''); var flash = flashState[0], setFlash = flashState[1];
    var editState = useState(null); var editing = editState[0], setEditing = editState[1];
    var addState = useState(false); var adding = addState[0], setAdding = addState[1];

    useEffect(function () {
      loadSite().then(setData, function (e) { setErr(e.message || 'Failed to load pages.'); });
    }, []);

    function saved(d, message) {
      setData(d); setEditing(null); setAdding(false); setErr(''); setFlash(message || '');
    }

    if (!data) {
      return h('div', { className: 'portal-card' },
        err ? h('div', { className: 'portal-flash error' }, err) : h('p', { className: 'perm-loading' }, 'Loading pages…'));
    }
    return h('div', null,
      flash ? h('div', { className: 'portal-flash success', style: { marginBottom: '1rem' } }, flash) : null,
      err ? h('div', { className: 'portal-flash error', style: { marginBottom: '1rem' } }, err) : null,
      h(SettingsCard, { settings: data.settings, onSaved: saved }),
      h(PagesCard, {
        data: data,
        onSaved: saved,
        onError: function (m) { setFlash(''); setErr(m); },
        onEdit: function (p) { setFlash(''); setEditing(p); },
        onAdd: function () { setFlash(''); setAdding(true); }
      }),
      editing ? h(EditPageModal, { page: editing, onClose: function () { setEditing(null); }, onSaved: saved }) : null,
      adding ? h(AddPageModal, { data: data, onClose: function () { setAdding(false); }, onSaved: saved }) : null
    );
  }

  window.PVAdminSitePages = SitePagesSection;
  window.PVAdminSiteShared = {
    ACCESS: ACCESS,
    accessBadge: accessBadge,
    fileOf: fileOf,
    loadSite: loadSite
  };
})();
