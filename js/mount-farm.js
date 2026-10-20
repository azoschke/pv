// ============================================================================
//  MountFarm — the FC's trial and Savage mount tracker (mount-farm.html)
//
//  One page, with the view picked by the address:
//    mount-farm.html                 the tracker: your columns, anyone added
//                                    in Edit view, and Your events
//    mount-farm.html?event=<link>    an event's page
//    mount-farm.html?plan            plan a new event
//    mount-farm.html?edit=<link>     edit an event
//    mount-farm.html?mounts          manage mounts
//
//  Access (Permissions grid, Site Pages → Mount Farm):
//    site.mount-farm.view   open the page, tick your own (and your alts'), see
//                           the events you are on
//    mount_farm.plan        plan events
//    mount_farm.manage      tick anyone's, see and manage every event, add and
//                           edit mounts
//    mount_farm.delete      delete mounts
//  The person who planned an event can also edit, end and delete it.
//
//  Worker routes (pv-med-database-worker):
//    GET    /mount-farm                    { me, alts, can, mounts, tracked,
//                                            members, events }
//    GET    /mount-farm/owned?members=1,2  { owned: [[member_id, mount_id]] }
//    PUT    /mount-farm/owned              { member_id, mount_id, have }
//    POST   /mount-farm/mounts             { name, fight, grp }
//    PATCH  /mount-farm/mounts/:id         { name, fight, grp }
//    DELETE /mount-farm/mounts/:id
//    POST   /mount-farm/events             { name, slug, starts_at, member_ids,
//                                            mount_ids }
//    GET    /mount-farm/events/:slug       { event, members, mount_ids, owned }
//    GET    /mount-farm/events/:slug?fights=1
//                                          { live, mount_ids, owned }, with the
//                                          ticks for the event's fights only
//    PATCH  /mount-farm/events/:id         any of { name, starts_at,
//                                            member_ids, mount_ids }
//    DELETE /mount-farm/events/:id         ends or deletes the event
//
//  Loading: the tracker asks only for the ticks of the people in your view.
//  An event's page loads its people's ticks once, then every 30 seconds asks
//  only for its fights' ticks, and stops asking while the page is hidden.
//  Edit view and Hide completed are kept per account in this browser.
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useRef = React.useRef;

  var POLL_MS = 30000;
  var MAX_PARTY = 8;
  var SUGGESTION_COUNT = 5;
  var PREFS_KEY = 'pv-mount-farm.view.';

  // Display order of the groups. Mounts keep their release order inside each.
  var GROUPS = [
    { key: 'arr', name: 'A Realm Reborn' },
    { key: 'hw', name: 'Heavensward' },
    { key: 'sb', name: 'Stormblood' },
    { key: 'shb', name: 'Shadowbringers' },
    { key: 'ew', name: 'Endwalker' },
    { key: 'dt', name: 'Dawntrail' },
    { key: 'ec', name: 'Evercold' },
    { key: 'mh', name: 'Monster Hunter Collab' },
    { key: 'sav', name: 'Savage' }
  ];
  // Never suggested under Most needed: not everyone can clear these.
  var NOT_SUGGESTED = ['mh', 'sav'];
  var NEW_MOUNT_GROUP = 'ec';

  function api(method, path, body) {
    return PVAdminAPI.request(method, path, body, true);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function icon(name) {
    return h('span', { className: 'material-symbols-outlined', 'aria-hidden': 'true' }, name);
  }

  function groupIndex(key) {
    for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i].key === key) return i;
    return GROUPS.length;
  }

  // Display order: by group, then release order within the group.
  function sortMounts(mounts) {
    return mounts.slice().sort(function (a, b) {
      return (groupIndex(a.grp) - groupIndex(b.grp)) || (a.sort - b.sort) || (a.id - b.id);
    });
  }

  function groupsWithMounts(mounts, keepEmpty) {
    return GROUPS.map(function (g) {
      return { key: g.key, name: g.name, mounts: mounts.filter(function (m) { return m.grp === g.key; }) };
    }).filter(function (g) { return keepEmpty || g.mounts.length > 0; });
  }

  function byName(a, b) {
    return String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' });
  }

  function initials(name) {
    var words = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (words.length >= 2) return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
    return (words[0] || '?').slice(0, 2).toUpperCase();
  }

  // "Fiora Acaeus" → "Fiora", for the tracker's columns (the full name shows
  // on hover).
  function firstName(name) {
    return String(name || '').trim().split(/\s+/)[0] || '';
  }

  // Initials, or the person's My Profile picture when they have one. Alts
  // get the quiet circle.
  function Avatar(props) {
    var errState = useState(false); var err = errState[0], setErr = errState[1];
    var p = props.person || {};
    return h('span', { className: 'avatar is-small' + (props.alt ? ' mf-avatar-alt' : ''), 'aria-hidden': 'true', title: props.title },
      p.image_url && !err
        ? h('img', { src: p.image_url, alt: '', loading: 'lazy', onError: function () { setErr(true); } })
        : initials(p.name));
  }
  function avatar(person, alt) { return h(Avatar, { person: person, alt: alt }); }

  function svgIcon(className, d, strokeWidth) {
    return h('svg', {
      className: className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: strokeWidth,
      strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false'
    }, h('path', { d: d }));
  }

  // Ticks are kept as a set of "member:mount" keys; the worker sends pairs.
  function tickKey(memberId, mountId) { return memberId + ':' + mountId; }
  function tickSet(pairs) {
    var set = {};
    (pairs || []).forEach(function (p) { set[tickKey(p[0], p[1])] = true; });
    return set;
  }

  function matches(name, needle) {
    return String(name || '').toLowerCase().indexOf(needle) !== -1;
  }

  function slugify(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 40).replace(/-+$/, '');
  }

  function whenText(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  }

  // <input type="datetime-local"> works in local time; the worker keeps UTC.
  function toLocalInput(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    function p(n) { return String(n).padStart(2, '0'); }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function fromLocalInput(value) {
    var d = new Date(value);
    return value && !isNaN(d.getTime()) ? d.toISOString() : '';
  }

  var TRACKER_HREF = window.location.pathname;
  function eventHref(slug) { return '?event=' + encodeURIComponent(slug); }
  function eventUrl(slug) { return window.location.origin + window.location.pathname + eventHref(slug); }
  function goTo(href) { window.location.href = href; }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); resolve(); } catch (e) { reject(e); }
      document.body.removeChild(ta);
    });
  }

  // Edit view and Hide completed, kept per account in this browser.
  function prefsKey() {
    var s = PVSession.get();
    return PREFS_KEY + (s && s.username ? String(s.username).toLowerCase() : 'signed-out');
  }
  function loadPrefs() {
    var prefs = { added: [], hiddenAlts: [], hideCompleted: false };
    try {
      var saved = JSON.parse(localStorage.getItem(prefsKey()) || 'null');
      if (saved && typeof saved === 'object') {
        if (Array.isArray(saved.added)) prefs.added = saved.added.map(Number).filter(Boolean);
        if (Array.isArray(saved.hiddenAlts)) prefs.hiddenAlts = saved.hiddenAlts.map(Number).filter(Boolean);
        prefs.hideCompleted = !!saved.hideCompleted;
      }
    } catch (_e) { /* unreadable — start fresh */ }
    return prefs;
  }
  function savePrefs(prefs) {
    try { localStorage.setItem(prefsKey(), JSON.stringify(prefs)); } catch (_e) { /* storage full or blocked */ }
  }

  // The page's data from GET /mount-farm, with defaults for anything missing.
  function normalizeBase(d) {
    d = d || {};
    var me = d.me || null;
    var alts = (d.alts || []).slice().sort(byName);
    var mine = {};
    if (me) mine[me.id] = true;
    alts.forEach(function (a) { mine[a.id] = true; });
    var can = d.can || {};
    var members = (d.members || []).slice().sort(byName);
    var tracked = (d.tracked || []).slice().sort(byName);
    var byId = {};
    tracked.concat(members).forEach(function (m) { byId[m.id] = m; });
    if (me) byId[me.id] = me;
    alts.forEach(function (a) { byId[a.id] = a; });
    return {
      me: me,
      alts: alts,
      mine: mine,
      can: { plan: !!can.plan, manage: !!can.manage, delete: !!can.delete },
      mounts: sortMounts(d.mounts || []),
      tracked: tracked,
      members: members,
      people: byId,
      events: (d.events || []).slice().sort(function (a, b) { return String(a.starts_at).localeCompare(String(b.starts_at)); })
    };
  }

  // ── Shared pieces ──────────────────────────────────────────────────────────

  // Escape or a click on the backdrop closes it.
  function Dialog(props) {
    var boxRef = useRef(null);
    var closeRef = useRef(props.onClose);
    closeRef.current = props.onClose;
    useEffect(function () {
      var release = PVScrollLock.lock();
      if (boxRef.current) boxRef.current.focus();
      function onKey(e) { if (e.key === 'Escape') closeRef.current(); }
      document.addEventListener('keydown', onKey);
      return function () { document.removeEventListener('keydown', onKey); release(); };
    }, []);
    return h('div', {
      className: 'cdb-modal-overlay',
      onMouseDown: function (e) { if (e.target === e.currentTarget) closeRef.current(); }
    },
      h('div', {
        className: 'cdb-modal mf-dialog', ref: boxRef, tabIndex: -1,
        role: props.alert ? 'alertdialog' : 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'mf-dialog-title'
      },
        h('h2', { id: 'mf-dialog-title', className: 'cdb-form-title' }, props.title),
        h('div', { className: 'cdb-form-fields' },
          props.children,
          h('div', { className: 'cdb-form-actions' }, props.footer))));
  }

  // "Delete Sunday Savage?" / "End Friday Farm?" / "Remove Bluefeather?"
  function ConfirmDialog(props) {
    var busyState = useState(false); var busy = busyState[0], setBusy = busyState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];
    function confirm() {
      setBusy(true); setErr('');
      props.onConfirm().catch(function (e) { setBusy(false); setErr(e.message || 'That did not go through.'); });
    }
    return h(Dialog, {
      title: props.title, alert: true, onClose: props.onClose,
      footer: [
        h('button', { key: 'keep', type: 'button', className: 'btn is-quiet', onClick: props.onClose, disabled: busy }, props.keepLabel || 'Keep it'),
        h('button', { key: 'go', type: 'button', className: 'btn is-destructive', onClick: confirm, disabled: busy }, props.confirmLabel)
      ]
    },
      h('p', null, props.text),
      err ? h('p', { className: 'cdb-notice is-error' }, err) : null);
  }

  function BackLink() {
    return h('div', null,
      h('a', { className: 'btn is-plain', href: TRACKER_HREF }, icon('arrow_back'), 'Back to Mount Farm'));
  }

  function Notice(props) {
    return h('div', { className: 'info-card tear-half mf-notice' },
      h('h1', { className: 'cdb-form-title' }, props.title),
      h('a', { className: 'btn', href: TRACKER_HREF }, 'Back to Mount Farm'));
  }

  function StatusDot(props) {
    return props.live
      ? h('span', { className: 'status-dot is-brown' }, 'Live now')
      : h('span', { className: 'status-dot is-quiet' }, 'Upcoming');
  }

  // A section label with its heading and anything on the right (a button, a
  // count), over a card's contents.
  function CardHead(props) {
    return h('div', { className: 'mf-card-head' },
      h('div', { className: 'mf-row-main' },
        h('h2', { id: props.id, className: 'mf-card-title' }, props.title),
        props.meta ? h('p', { className: 'cdb-meta' }, props.meta) : null),
      props.children);
  }

  // Search the given people and pick one (Who's coming, Edit view). Only the
  // people added are listed underneath; the search finds everyone else.
  function PeoplePicker(props) {
    var qState = useState(''); var q = qState[0], setQ = qState[1];
    var needle = q.trim().toLowerCase();
    var taken = {};
    props.exclude.forEach(function (id) { taken[id] = true; });
    var results = needle
      ? props.pool.filter(function (p) { return !taken[p.id] && matches(p.name, needle); }).slice(0, 20)
      : [];
    return h('div', null,
      h('input', {
        className: 'cdb-input', type: 'search', autoComplete: 'off', 'aria-label': props.label,
        placeholder: props.full ? props.fullText : props.placeholder,
        disabled: !!props.full, value: q,
        onChange: function (e) { setQ(e.target.value); }
      }),
      needle && !props.full
        ? h('div', { className: 'tray mf-results', 'aria-label': 'Matching people' },
            results.map(function (p) {
              return h('button', {
                key: p.id, type: 'button', className: 'mf-result',
                onClick: function () { props.onAdd(p.id); setQ(''); }
              }, avatar(p, !!p.primary_member_id), h('span', { className: 'mf-person-name' }, p.name));
            }),
            results.length ? null : h('p', { className: 'mf-none' }, 'No one by that name.'))
        : null);
  }

  // A group of mounts that opens and closes: the Book Farm's header row, with
  // a chevron that points right and turns down when open.
  function GroupToggle(props) {
    return h('button', {
      type: 'button', className: 'book-header mf-book-toggle', 'aria-expanded': props.open ? 'true' : 'false',
      onClick: props.onToggle
    },
      h('span', { className: 'book-header-left' },
        svgIcon('mf-chevron' + (props.open ? ' is-open' : ''), 'M9 6l6 6-6 6', 2),
        h('span', { className: 'book-name' }, props.name)),
      h('span', { className: 'book-header-right' }, props.children));
  }

  // ── Tracker ────────────────────────────────────────────────────────────────

  function EventRow(props) {
    var ev = props.event;
    return h('div', { className: 'mf-row' },
      h('div', { className: 'mf-row-main' },
        h('div', null, h('span', { className: 'mf-name' }, ev.name), ' ', h(StatusDot, { live: ev.live })),
        h('div', { className: 'cdb-meta' }, whenText(ev.starts_at) + ' · ' + ev.going + ' going')),
      h('div', { className: 'cdb-form-actions' },
        h('a', { className: 'btn is-quiet is-small', href: eventHref(ev.slug) }, 'Open'),
        ev.can_manage ? h('a', { className: 'btn is-quiet is-small', href: '?edit=' + encodeURIComponent(ev.slug) }, 'Edit') : null,
        ev.can_manage
          ? h('button', { type: 'button', className: 'btn is-danger is-small', onClick: function () { props.onClose(ev); } },
              ev.live ? 'End event' : 'Delete')
          : null));
  }

  function EditViewDialog(props) {
    var base = props.base, prefs = props.prefs;
    // Members find people already on the tracker; officers and admins search
    // the whole FC list so they can fill in anyone's mounts.
    var pool = base.can.manage && base.members.length ? base.members : base.tracked;
    var added = prefs.added.map(function (id) { return base.people[id]; }).filter(Boolean);
    function toggleAlt(id) {
      var hidden = prefs.hiddenAlts.indexOf(id) !== -1
        ? prefs.hiddenAlts.filter(function (x) { return x !== id; })
        : prefs.hiddenAlts.concat([id]);
      props.updatePrefs({ hiddenAlts: hidden });
    }
    return h(Dialog, {
      title: 'Edit View', onClose: props.onClose,
      footer: [
        h('button', { key: 'reset', type: 'button', className: 'btn is-plain mf-push-left', onClick: function () { props.updatePrefs({ added: [], hiddenAlts: [] }); } }, 'Reset'),
        h('button', { key: 'done', type: 'button', className: 'btn', onClick: props.onClose }, 'Done')
      ]
    },
      base.me
        ? h('div', null,
            h('p', { className: 'cdb-label' }, 'Your characters'),
            h('div', { className: 'tray mf-list' },
              h('label', { className: 'mf-row' },
                h('input', { type: 'checkbox', className: 'cdb-checkbox', checked: true, disabled: true }),
                avatar(base.me), h('span', { className: 'mf-row-main mf-name' }, base.me.name)),
              base.alts.map(function (a) {
                return h('label', { key: a.id, className: 'mf-row is-button' },
                  h('input', { type: 'checkbox', className: 'cdb-checkbox', checked: prefs.hiddenAlts.indexOf(a.id) === -1, onChange: function () { toggleAlt(a.id); } }),
                  avatar(a), h('span', { className: 'mf-row-main mf-name' }, a.name));
              })))
        : null,
      h('div', null,
        h('p', { className: 'cdb-label' }, 'Others'),
        h(PeoplePicker, {
          label: 'Search for people',
          placeholder: base.can.manage ? 'Search the FC list' : 'Search the tracker',
          pool: pool,
          exclude: Object.keys(base.mine).map(Number).concat(prefs.added),
          onAdd: function (id) { props.updatePrefs({ added: prefs.added.concat([id]) }); }
        }),
        h('div', { className: 'mf-list' },
          added.map(function (p) {
            return h('div', { key: p.id, className: 'mf-row' },
              avatar(p), h('span', { className: 'mf-row-main mf-name' }, p.name),
              h('button', {
                type: 'button', className: 'btn is-quiet is-small is-icon', 'aria-label': 'Remove ' + p.name + ' from your view',
                onClick: function () { props.updatePrefs({ added: prefs.added.filter(function (x) { return x !== p.id; }) }); }
              }, icon('close')));
          }),
          added.length ? null : h('p', { className: 'mf-row cdb-meta' }, 'No one added.'))));
  }

  function Tracker(props) {
    var base = props.base;
    var prefsState = useState(loadPrefs); var prefs = prefsState[0], setPrefs = prefsState[1];
    var ticksState = useState(null); var ticks = ticksState[0], setTicks = ticksState[1];
    var openState = useState({}); var open = openState[0], setOpen = openState[1];
    var dialogState = useState(null); var dialog = dialogState[0], setDialog = dialogState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];
    // The names row's height (the group rows stick just below it) and the
    // width of the table's visible part (the group rows' toggles are that
    // wide, so their summary stays in view when the table scrolls sideways).
    var headRef = useRef(null);
    var scrollRef = useRef(null);
    var sizeState = useState({ head: 0, view: 0 }); var size = sizeState[0], setSize = sizeState[1];

    function updatePrefs(patch) {
      setPrefs(function (p) { var next = Object.assign({}, p, patch); savePrefs(next); return next; });
    }

    // Your columns first (you, then your alts), then anyone added in Edit view.
    var cols = [];
    if (base.me) cols.push(base.me);
    base.alts.forEach(function (a) {
      if (prefs.hiddenAlts.indexOf(a.id) === -1) cols.push(a);
    });
    prefs.added.forEach(function (id) {
      var p = base.people[id];
      if (p && !base.mine[id]) cols.push(p);
    });
    var colKey = cols.map(function (c) { return c.id; }).join(',');

    useEffect(function () {
      var head = headRef.current, view = scrollRef.current;
      if (!head || !view) return;
      function measure() {
        var next = { head: head.offsetHeight, view: view.clientWidth };
        setSize(function (cur) { return cur.head === next.head && cur.view === next.view ? cur : next; });
      }
      measure();
      if (!window.ResizeObserver) return;
      var watcher = new ResizeObserver(measure);
      watcher.observe(head);
      watcher.observe(view);
      return function () { watcher.disconnect(); };
    }, [ticks === null, colKey === '']);

    // Only the ticks of the people in view.
    useEffect(function () {
      if (!colKey) { setTicks({}); return; }
      var cancelled = false;
      api('GET', '/mount-farm/owned?members=' + colKey).then(function (d) {
        if (!cancelled) { setTicks(tickSet(d && d.owned)); setErr(''); }
      }, function (e) {
        if (!cancelled) setErr(e.message || 'The ticks could not load.');
      });
      return function () { cancelled = true; };
    }, [colKey]);

    function toggle(memberId, mountId) {
      var key = tickKey(memberId, mountId);
      var have = !(ticks && ticks[key]);
      function apply(on) {
        setTicks(function (t) { var next = Object.assign({}, t); if (on) next[key] = true; else delete next[key]; return next; });
      }
      apply(have);
      api('PUT', '/mount-farm/owned', { member_id: memberId, mount_id: mountId, have: have }).catch(function (e) {
        apply(!have);
        setErr(e.message || 'That tick did not save.');
      });
    }

    var total = base.mounts.length;
    var colCounts = cols.map(function (c) {
      return base.mounts.filter(function (m) { return ticks && ticks[tickKey(c.id, m.id)]; }).length;
    });

    var groups = groupsWithMounts(base.mounts).map(function (g) {
      var have = 0;
      var rows = g.mounts.map(function (m) {
        var need = 0;
        cols.forEach(function (c) { if (ticks && ticks[tickKey(c.id, m.id)]) have++; else need++; });
        return { mount: m, need: need };
      });
      var cells = rows.length * cols.length;
      var missing = cells - have;
      return {
        key: g.key, name: g.name, complete: cells > 0 && missing === 0, missing: missing,
        pct: cells ? Math.round((have / cells) * 100) : 0,
        rows: prefs.hideCompleted ? rows.filter(function (r) { return r.need > 0; }) : rows
      };
    });
    var shownGroups = prefs.hideCompleted ? groups.filter(function (g) { return !g.complete; }) : groups;

    function closeEvent(ev) {
      setDialog({ type: 'close', event: ev });
    }

    var events = base.events;
    var eventsCard = (events.length || base.can.plan)
      ? h('section', { className: 'info-card', 'aria-labelledby': 'mf-events-title' },
          h(CardHead, { id: 'mf-events-title', title: 'Your events' },
            base.can.plan ? h('a', { className: 'btn is-quiet is-small', href: '?plan' }, 'Plan an event') : null),
          events.length
            ? h('div', { className: 'mf-list' }, events.map(function (ev) { return h(EventRow, { key: ev.id, event: ev, onClose: closeEvent }); }))
            : h('p', { className: 'cdb-meta' }, 'No events planned.'))
      : null;

    var editable = function (memberId) { return base.can.manage || !!base.mine[memberId]; };
    var span = cols.length + 3;
    // Once anyone else is in view, your own columns are tinted.
    var tint = cols.some(function (c) { return !base.mine[c.id]; });
    var isAlt = {};
    base.alts.forEach(function (a) { isAlt[a.id] = true; });
    function colClass(c) { return 'mf-col-person' + (tint && base.mine[c.id] ? ' is-mine' : ''); }

    var table = !cols.length
      ? h('p', { className: 'cdb-notice' }, 'No one in your view.')
      : ticks === null
        ? h('p', { className: 'cdb-notice' }, 'Loading…')
        : h('div', { className: 'atma-card tear' },
            h('div', { className: 'atma-scroll mf-scroll', ref: scrollRef },
              h('table', {
                className: 'task-table atma-table mf-table',
                style: { '--mf-head-h': size.head + 'px', '--mf-view-w': size.view ? size.view + 'px' : '100%' }
              },
                h('thead', { ref: headRef },
                  h('tr', null,
                    h('th', { scope: 'col', 'aria-label': 'Mount' }),
                    cols.map(function (c, i) {
                      return h('th', { key: c.id, scope: 'col', className: colClass(c), title: c.name },
                        h('span', { className: 'mf-col-head' },
                          avatar(c, isAlt[c.id]),
                          h('span', null,
                            h('span', { className: 'mf-col-name' }, firstName(c.name)),
                            h('span', { className: 'mf-col-count' }, colCounts[i] + '/' + total))));
                    }),
                    h('th', { className: 'mf-fill', 'aria-hidden': 'true' }),
                    h('th', { scope: 'col', className: 'td-count' }, 'Still need'))),
                shownGroups.map(function (g) {
                  var isOpen = open[g.key] != null ? open[g.key] : !g.complete;
                  return h('tbody', { key: g.key },
                    h('tr', { className: 'mf-group-row' },
                      h('td', { colSpan: span },
                        h(GroupToggle, {
                          name: g.name, open: isOpen,
                          onToggle: function () { var next = Object.assign({}, open); next[g.key] = !isOpen; setOpen(next); }
                        },
                          h('span', { className: 'book-progress-text' }, g.complete ? 'Complete' : g.missing + ' still needed'),
                          h('span', { className: 'book-progress-bar', 'aria-hidden': 'true' },
                            h('span', { className: 'book-progress-bar-fill', style: { width: g.pct + '%', display: 'block' } }))))),
                    isOpen ? g.rows.map(function (r) {
                      var m = r.mount;
                      return h('tr', { key: m.id, className: 'mf-mount-row' },
                        h('td', { className: 'mf-mount' },
                          h('div', { className: 'mf-mount-name' }, m.name),
                          h('div', { className: 'mf-mount-fight' }, m.fight)),
                        cols.map(function (c) {
                          var have = !!ticks[tickKey(c.id, m.id)];
                          return h('td', { key: c.id, className: colClass(c) },
                            h('button', {
                              type: 'button', className: 'mf-tick' + (have ? ' is-have' : ''),
                              'aria-pressed': have ? 'true' : 'false',
                              'aria-label': c.name + ' has ' + m.name,
                              disabled: !editable(c.id),
                              onClick: function () { toggle(c.id, m.id); }
                            }, have ? svgIcon(null, 'M5 12.5l4.5 4.5L19 7.5', 2.6) : null));
                        }),
                        h('td', { className: 'mf-fill' }),
                        h('td', { className: 'td-count' },
                          r.need
                            ? h('span', { className: 'mf-need' }, r.need + ' need')
                            : h('span', { className: 'atma-complete' }, 'All have')));
                    }) : null);
                }),
                shownGroups.length ? null : h('tbody', null,
                  h('tr', null, h('td', { colSpan: span, className: 'mf-done' }, 'Everything’s complete.'))))));

    return h('div', null,
      h('header', { className: 'app-header' },
        h('h1', { className: 'app-title' }, 'Mount Farm'),
        h('p', { className: 'app-subtitle' }, 'Trial and Savage mounts')),
      eventsCard,
      base.me ? null : h('p', { className: 'cdb-notice' }, 'Your account isn’t linked to an FC member.'),
      h('div', { className: 'top-controls' },
        h('button', { type: 'button', className: 'btn is-quiet is-small', onClick: function () { setDialog({ type: 'view' }); } }, icon('tune'), 'Edit view'),
        h('button', { type: 'button', className: 'btn is-quiet is-small', onClick: function () { updatePrefs({ hideCompleted: !prefs.hideCompleted }); } },
          prefs.hideCompleted ? 'Show completed' : 'Hide completed')),
      err ? h('p', { className: 'cdb-notice is-error' }, err) : null,
      table,
      base.can.manage
        ? h('div', { className: 'cdb-card-footer' }, h('a', { className: 'btn is-plain', href: '?mounts' }, 'Manage mounts'))
        : null,
      dialog && dialog.type === 'view'
        ? h(EditViewDialog, { base: base, prefs: prefs, updatePrefs: updatePrefs, onClose: function () { setDialog(null); } })
        : null,
      dialog && dialog.type === 'close'
        ? h(ConfirmDialog, {
            title: (dialog.event.live ? 'End ' : 'Delete ') + dialog.event.name + '?',
            text: 'The link will no longer be active.',
            keepLabel: dialog.event.live ? 'Keep it open' : 'Keep it',
            confirmLabel: dialog.event.live ? 'End event' : 'Delete event',
            onClose: function () { setDialog(null); },
            onConfirm: function () {
              return api('DELETE', '/mount-farm/events/' + dialog.event.id).then(function () {
                setDialog(null);
                return props.reload();
              });
            }
          })
        : null);
  }

  // ── Event page ─────────────────────────────────────────────────────────────

  function EventPage(props) {
    var base = props.base, slug = props.slug;
    var evState = useState(null); var ev = evState[0], setEv = evState[1];
    var goneState = useState(false); var gone = goneState[0], setGone = goneState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];
    var updatedState = useState(null); var updated = updatedState[0], setUpdated = updatedState[1];
    var dialogState = useState(false); var dialog = dialogState[0], setDialog = dialogState[1];
    var copiedState = useState(false); var copied = copiedState[0], setCopied = copiedState[1];
    var busyState = useState(false); var busy = busyState[0], setBusy = busyState[1];
    var evRef = useRef(null); evRef.current = ev;
    var goneRef = useRef(false); goneRef.current = gone;
    // Ticks saved from this page that a check started earlier mustn't undo.
    var pendingRef = useRef({});

    var path = '/mount-farm/events/' + encodeURIComponent(slug);

    function lost(e) {
      if (e.status === 404 || e.status === 403) { setGone(true); return true; }
      return false;
    }

    function loadFull() {
      return api('GET', path).then(function (d) {
        setEv({ event: d.event, members: (d.members || []).slice().sort(byName), mountIds: d.mount_ids || [], ticks: tickSet(d.owned) });
        setUpdated(new Date()); setErr('');
        if (d.event && d.event.name) document.title = d.event.name + ' — Mount Farm';
      }, function (e) {
        if (!lost(e)) setErr(e.message || 'The event could not load.');
      });
    }

    // The 30-second check: only the ticks for the event's fights.
    function check() {
      var cur = evRef.current;
      if (!cur || goneRef.current) return;
      api('GET', path + '?fights=1').then(function (d) {
        var ids = d.mount_ids || [];
        var known = evRef.current;
        if (!known) return;
        if (ids.slice().sort().join(',') !== known.mountIds.slice().sort().join(',')) { loadFull(); return; }
        var fresh = tickSet(d.owned);
        setEv(function (prev) {
          if (!prev) return prev;
          var next = Object.assign({}, prev.ticks);
          prev.members.forEach(function (m) {
            ids.forEach(function (mountId) {
              var key = tickKey(m.id, mountId);
              if (pendingRef.current[key]) return;
              if (fresh[key]) next[key] = true; else delete next[key];
            });
          });
          return Object.assign({}, prev, { ticks: next, event: Object.assign({}, prev.event, { live: !!d.live }) });
        });
        setUpdated(new Date());
      }, function (e) { lost(e); });
    }

    useEffect(function () {
      loadFull();
      var timer = null;
      function stop() { if (timer) { clearInterval(timer); timer = null; } }
      function start() { stop(); timer = setInterval(check, POLL_MS); }
      // Nothing is asked for while the page is hidden; one check on return.
      function onVisibility() {
        if (document.hidden) stop();
        else { check(); start(); }
      }
      if (!document.hidden) start();
      document.addEventListener('visibilitychange', onVisibility);
      return function () { stop(); document.removeEventListener('visibilitychange', onVisibility); };
    }, []);

    if (gone) {
      return h(Notice, { title: 'This Event Isn’t Available' });
    }
    if (!ev) {
      return h('div', null, h(BackLink),
        h('p', { className: err ? 'cdb-notice is-error' : 'cdb-notice' }, err || 'Loading…'));
    }

    var event = ev.event;
    var canManage = !!event.can_manage;
    var mountsById = {};
    base.mounts.forEach(function (m) { mountsById[m.id] = m; });
    var fights = sortMounts(ev.mountIds.map(function (id) { return mountsById[id]; }).filter(Boolean));
    var party = ev.members;

    function has(memberId, mountId) { return !!ev.ticks[tickKey(memberId, mountId)]; }
    function needCount(mount) { return party.filter(function (p) { return !has(p.id, mount.id); }).length; }

    function toggle(memberId, mountId) {
      var key = tickKey(memberId, mountId);
      var have = !has(memberId, mountId);
      function apply(on) {
        setEv(function (prev) {
          var next = Object.assign({}, prev.ticks);
          if (on) next[key] = true; else delete next[key];
          return Object.assign({}, prev, { ticks: next });
        });
      }
      pendingRef.current[key] = true;
      apply(have);
      api('PUT', '/mount-farm/owned', { member_id: memberId, mount_id: mountId, have: have }).then(function () {
        delete pendingRef.current[key];
      }, function (e) {
        delete pendingRef.current[key];
        apply(!have);
        setErr(e.message || 'That tick did not save.');
      });
    }

    function setFights(ids) {
      setBusy(true); setErr('');
      api('PATCH', '/mount-farm/events/' + event.id, { mount_ids: ids }).then(loadFull, function (e) {
        setErr(e.message || 'The fights could not be changed.');
      }).then(function () { setBusy(false); });
    }

    // Most needed: whatever tonight's expansions still need, then anything else
    // the party needs, each oldest first, up to five; shown most needed first.
    var tonight = {};
    fights.forEach(function (m) { tonight[m.grp] = true; });
    var candidates = base.mounts.map(function (m, i) {
      return { mount: m, need: needCount(m), order: i };
    }).filter(function (x) {
      return x.need > 0 && ev.mountIds.indexOf(x.mount.id) === -1 && NOT_SUGGESTED.indexOf(x.mount.grp) === -1;
    });
    var suggestions = candidates.filter(function (x) { return tonight[x.mount.grp]; })
      .concat(candidates.filter(function (x) { return !tonight[x.mount.grp]; }))
      .slice(0, SUGGESTION_COUNT)
      .sort(function (a, b) { return (b.need - a.need) || (a.order - b.order); });

    function copyLink() {
      copyText(eventUrl(event.slug)).then(function () {
        setCopied(true);
        setTimeout(function () { setCopied(false); }, 2000);
      }, function () { setErr('The link could not be copied.'); });
    }

    var updatedText = updated
      ? 'Updated ' + updated.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      : '';

    return h('div', null,
      h(BackLink),
      h('header', { className: 'app-header' },
        h('p', { className: 'app-subtitle' }, 'Event night'),
        h('h1', { className: 'app-title' }, event.name),
        h('p', { className: 'cdb-meta' },
          h(StatusDot, { live: event.live }), ' · ' + whenText(event.starts_at) + ' · ' + party.length + ' going')),
      h('div', { className: 'top-controls top-controls-center' },
        h('span', { className: 'cdb-meta' }, updatedText),
        h('button', { type: 'button', className: 'btn is-quiet is-small', onClick: loadFull }, icon('refresh'), 'Refresh'),
        h('button', { type: 'button', className: 'btn is-quiet is-small', onClick: copyLink }, icon('link'), copied ? 'Copied' : 'Copy link'),
        canManage ? h('a', { className: 'btn is-quiet is-small', href: '?edit=' + encodeURIComponent(event.slug) }, 'Edit') : null,
        canManage ? h('button', { type: 'button', className: 'btn is-danger is-small', onClick: function () { setDialog(true); } },
          event.live ? 'End event' : 'Delete event') : null),
      err ? h('p', { className: 'cdb-notice is-error' }, err) : null,
      h('div', { className: 'mf-event' },
        h('div', { className: 'mf-fight-grid' },
          fights.map(function (m) {
            var need = needCount(m);
            var haveCount = party.length - need;
            return h('section', { key: m.id, className: 'mf-fight tear-half', 'aria-label': m.fight },
              h('div', { className: 'mf-fight-head' },
                h('div', { className: 'mf-row-main' },
                  h('h2', { className: 'mf-fight-title' }, m.fight),
                  h('p', { className: 'mf-fight-mount' }, m.name)),
                canManage
                  ? h('button', {
                      type: 'button', className: 'btn is-plain mf-fight-remove', disabled: busy,
                      onClick: function () { setFights(ev.mountIds.filter(function (id) { return id !== m.id; })); }
                    }, 'Remove')
                  : null),
              h('div', { className: 'mf-fight-need' },
                h('p', null,
                  h('span', { className: 'mf-fight-count' }, need ? need + ' of ' + party.length : 'Everyone'),
                  h('span', null, need ? 'still need it' : 'has it')),
                h('div', { className: 'progress-bar', role: 'img', 'aria-label': haveCount + ' of ' + party.length + ' have ' + m.name },
                  h('div', { className: 'progress-bar-fill', style: { width: (party.length ? Math.round((haveCount / party.length) * 100) : 0) + '%' } }))),
              h('div', { className: 'mf-tiles' },
                party.map(function (p) {
                  var have = has(p.id, m.id);
                  return h('button', {
                    key: p.id, type: 'button', className: 'mf-tile' + (have ? ' is-have' : ''), title: p.name,
                    'aria-pressed': have ? 'true' : 'false',
                    'aria-label': p.name + (have ? ' has ' : ' needs ') + m.name,
                    disabled: !(base.can.manage || base.mine[p.id]),
                    onClick: function () { toggle(p.id, m.id); }
                  },
                    avatar(p),
                    h('span', { className: 'mf-tile-name' }, firstName(p.name)),
                    have
                      ? h('span', { className: 'mf-tile-state' }, svgIcon(null, 'M5 12.5l4.5 4.5L19 7.5', 2.6), 'Has it')
                      : h('span', { className: 'mf-tile-state is-need' }, 'Needs'));
                })));
          }),
          fights.length ? null : h('p', { className: 'cdb-notice' }, 'No fights yet.')),
        h('aside', { className: 'mf-suggest tear-half', 'aria-labelledby': 'mf-suggest-title' },
          h('h2', { id: 'mf-suggest-title', className: 'mf-suggest-title' }, 'Most needed'),
          suggestions.map(function (x) {
            return h('div', { key: x.mount.id, className: 'mf-suggest-row' },
              h('div', { className: 'mf-row-main' },
                h('div', { className: 'mf-pick-fight' }, x.mount.fight),
                h('div', { className: 'mf-suggest-sub' },
                  h('em', null, x.mount.name), ' · ' + x.need + ' of ' + party.length + ' need')),
              canManage
                ? h('button', {
                    type: 'button', className: 'btn is-quiet is-small', disabled: busy,
                    onClick: function () { setFights(ev.mountIds.concat([x.mount.id])); }
                  }, 'Add')
                : null);
          }),
          suggestions.length ? null : h('p', { className: 'mf-none' }, 'Nothing else is needed.'))),
      dialog
        ? h(ConfirmDialog, {
            title: (event.live ? 'End ' : 'Delete ') + event.name + '?',
            text: 'The link will no longer be active.',
            keepLabel: event.live ? 'Keep it open' : 'Keep it',
            confirmLabel: event.live ? 'End event' : 'Delete event',
            onClose: function () { setDialog(false); },
            onConfirm: function () {
              return api('DELETE', '/mount-farm/events/' + event.id).then(function () { goTo(TRACKER_HREF); });
            }
          })
        : null);
  }

  // ── Plan an event / Edit an event ──────────────────────────────────────────

  function EventForm(props) {
    var base = props.base, editSlug = props.slug;
    var isEdit = !!editSlug;
    var loadedState = useState(!isEdit); var loaded = loadedState[0], setLoaded = loadedState[1];
    var eventState = useState(null); var event = eventState[0], setEvent = eventState[1];
    var goneState = useState(false); var gone = goneState[0], setGone = goneState[1];
    var nameState = useState(''); var name = nameState[0], setName = nameState[1];
    var whenState = useState(''); var when = whenState[0], setWhen = whenState[1];
    var slugState = useState(''); var slugText = slugState[0], setSlugText = slugState[1];
    var slugEditedState = useState(false); var slugEdited = slugEditedState[0], setSlugEdited = slugEditedState[1];
    var partyState = useState([]); var party = partyState[0], setParty = partyState[1];
    var fightsState = useState({}); var fights = fightsState[0], setFights = fightsState[1];
    var openState = useState(null); var open = openState[0], setOpen = openState[1];
    var sortState = useState('default'); var sort = sortState[0], setSort = sortState[1];
    var ticksState = useState({}); var ticks = ticksState[0], setTicks = ticksState[1];
    var savingState = useState(false); var saving = savingState[0], setSaving = savingState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];
    var copiedState = useState(false); var copied = copiedState[0], setCopied = copiedState[1];

    useEffect(function () {
      if (!isEdit) return;
      api('GET', '/mount-farm/events/' + encodeURIComponent(editSlug)).then(function (d) {
        var e = d.event || {};
        setEvent(e);
        setName(e.name || '');
        setWhen(toLocalInput(e.starts_at));
        setSlugText(e.slug || editSlug);
        setParty((d.members || []).map(function (m) { return m.id; }));
        var picked = {};
        (d.mount_ids || []).forEach(function (id) { picked[id] = true; });
        setFights(picked);
        setTicks(tickSet(d.owned));
        setLoaded(true);
      }, function (e) {
        if (e.status === 404 || e.status === 403) setGone(true);
        else setErr(e.message || 'The event could not load.');
      });
    }, []);

    // The ticks of the people coming, for the need counts.
    var partyKey = party.slice().sort(function (a, b) { return a - b; }).join(',');
    useEffect(function () {
      if (!loaded) return;
      if (!partyKey) { setTicks({}); return; }
      var cancelled = false;
      api('GET', '/mount-farm/owned?members=' + partyKey).then(function (d) {
        if (!cancelled) setTicks(tickSet(d && d.owned));
      }, function () { /* need counts stay as they were */ });
      return function () { cancelled = true; };
    }, [partyKey, loaded]);

    if (gone || (event && !event.can_manage)) {
      return h(Notice, { title: 'This Event Isn’t Available' });
    }
    if (!loaded) {
      return h('div', null, h(BackLink),
        h('p', { className: err ? 'cdb-notice is-error' : 'cdb-notice' }, err || 'Loading…'));
    }

    // Planners search the whole FC list.
    var pool = base.members.length ? base.members : base.tracked;
    var partyPeople = party.map(function (id) { return base.people[id] || { id: id, name: 'Member #' + id }; }).sort(byName);
    var full = party.length >= MAX_PARTY;
    var total = base.mounts.length;

    function countFor(id) {
      return base.mounts.filter(function (m) { return ticks[tickKey(id, m.id)]; }).length;
    }
    function needFor(mount) {
      return party.filter(function (id) { return !ticks[tickKey(id, mount.id)]; }).length;
    }

    var picked = 0, needed = 0;
    var groups = groupsWithMounts(base.mounts).map(function (g) {
      var groupNeed = 0, groupPicked = 0;
      var rows = g.mounts.map(function (m, i) {
        var need = needFor(m);
        groupNeed += need;
        if (fights[m.id]) { picked++; groupPicked++; needed += need; }
        return { mount: m, need: need, order: i };
      });
      if (sort === 'need') rows.sort(function (a, b) { return (b.need - a.need) || (a.order - b.order); });
      return { key: g.key, name: g.name, rows: rows, need: groupNeed, picked: groupPicked, all: groupPicked === rows.length };
    });

    function toggleFight(id) {
      var next = Object.assign({}, fights);
      if (next[id]) delete next[id]; else next[id] = true;
      setFights(next);
    }
    function pickGroup(g) {
      var next = Object.assign({}, fights);
      g.rows.forEach(function (r) { if (g.all) delete next[r.mount.id]; else next[r.mount.id] = true; });
      setFights(next);
    }

    function onName(value) {
      setName(value);
      if (!isEdit && !slugEdited) setSlugText(slugify(value));
    }

    function save() {
      var startsAt = fromLocalInput(when);
      var link = slugify(slugText);
      if (!name.trim()) { setErr('Give the event a name.'); return; }
      if (!startsAt) { setErr('Pick a date and time.'); return; }
      if (!isEdit && !link) { setErr('Give the event a link.'); return; }
      var body = {
        name: name.trim(),
        starts_at: startsAt,
        member_ids: party,
        mount_ids: Object.keys(fights).map(Number)
      };
      setSaving(true); setErr('');
      var req = isEdit
        ? api('PATCH', '/mount-farm/events/' + event.id, body).then(function () { goTo(TRACKER_HREF); })
        : api('POST', '/mount-farm/events', Object.assign({ slug: link }, body)).then(function (d) {
            goTo(eventHref((d && d.slug) || link));
          });
      req.catch(function (e) { setSaving(false); setErr(e.message || 'The event could not be saved.'); });
    }

    function copyLink() {
      copyText(eventUrl(slugText)).then(function () {
        setCopied(true);
        setTimeout(function () { setCopied(false); }, 2000);
      }, function () { setErr('The link could not be copied.'); });
    }

    // The link is set when the event is planned and can't change after.
    var linkPrefix = '…' + window.location.pathname + '?event=';
    var linkField = isEdit
      ? h('div', { className: 'mf-field is-link' },
          h('span', { className: 'mf-label' }, 'Link'),
          h('div', { className: 'mf-link-text' },
            h('span', { className: 'mf-row-main' }, linkPrefix + slugText),
            h('button', { type: 'button', className: 'btn is-quiet is-small', onClick: copyLink }, icon('link'), copied ? 'Copied' : 'Copy link')))
      : h('div', { className: 'mf-field is-link' },
          h('label', { className: 'mf-label', htmlFor: 'mf-event-link' }, 'Link'),
          h('div', { className: 'mf-link-input' },
            h('span', { className: 'mf-link-prefix' }, linkPrefix),
            h('input', {
              id: 'mf-event-link', className: 'cdb-input', type: 'text', placeholder: 'event-name', value: slugText,
              onChange: function (e) { setSlugEdited(true); setSlugText(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-')); }
            })));

    var summary = !party.length && !picked
      ? 'Nobody picked yet'
      : party.length + ' going · ' + picked + (picked === 1 ? ' fight' : ' fights') + ' · ' + needed + ' needed';

    return h('div', null,
      h(BackLink),
      h('header', { className: 'app-header' }, h('h1', { className: 'app-title' }, isEdit ? 'Edit Event' : 'Plan an Event')),
      h('section', { className: 'info-card mf-details', 'aria-label': 'Event details' },
        h('div', { className: 'mf-fields' },
          h('div', { className: 'mf-field' },
            h('label', { className: 'mf-label', htmlFor: 'mf-event-name' }, 'Name'),
            h('input', { id: 'mf-event-name', className: 'cdb-input', type: 'text', placeholder: 'Event name', value: name, onChange: function (e) { onName(e.target.value); } })),
          h('div', { className: 'mf-field is-when' },
            h('label', { className: 'mf-label', htmlFor: 'mf-event-when' }, 'Date and time'),
            h('input', { id: 'mf-event-when', className: 'cdb-input', type: 'datetime-local', value: when, onChange: function (e) { setWhen(e.target.value); } })),
          linkField)),
      h('div', { className: 'mf-split is-side-first' },
        h('section', { className: 'mf-panel tear-half', 'aria-labelledby': 'mf-who-title' },
          h('div', { className: 'mf-panel-head is-baseline' },
            h('h2', { id: 'mf-who-title', className: 'mf-panel-title' }, 'Who’s coming'),
            h('span', { className: 'mf-panel-count' }, party.length + ' of ' + MAX_PARTY)),
          h('div', { className: 'mf-panel-body' },
            h(PeoplePicker, {
              label: 'Search the FC list', placeholder: 'Search the FC list',
              full: full, fullText: 'The party is full',
              pool: pool, exclude: party,
              onAdd: function (id) { if (party.length < MAX_PARTY && party.indexOf(id) === -1) setParty(party.concat([id])); }
            })),
          partyPeople.map(function (p) {
            var count = countFor(p.id);
            return h('div', { key: p.id, className: 'mf-added' },
              avatar(p, !!p.primary_member_id),
              h('span', { className: 'mf-person-name' }, p.name),
              count ? h('span', { className: 'mf-sub' }, count + '/' + total) : null,
              h('button', {
                type: 'button', className: 'mf-remove', 'aria-label': 'Remove ' + p.name,
                onClick: function () { setParty(party.filter(function (x) { return x !== p.id; })); }
              }, svgIcon(null, 'M7 7l10 10M17 7L7 17', 2.2)));
          }),
          partyPeople.length ? null : h('p', { className: 'mf-none' }, 'No one added yet.')),
        h('section', { className: 'mf-panel tear-half', 'aria-labelledby': 'mf-fights-title' },
          h('div', { className: 'mf-panel-head' },
            h('h2', { id: 'mf-fights-title', className: 'mf-panel-title' }, 'Fights'),
            h('div', { className: 'seg', role: 'group', 'aria-label': 'Order fights by' },
              h('button', { type: 'button', className: 'seg-btn', 'aria-pressed': sort === 'default' ? 'true' : 'false', onClick: function () { setSort('default'); } }, 'Default'),
              h('button', { type: 'button', className: 'seg-btn', 'aria-pressed': sort === 'need' ? 'true' : 'false', onClick: function () { setSort('need'); } }, 'Most needed'))),
          groups.map(function (g) {
            var isOpen = open && open[g.key] != null ? open[g.key] : g.picked > 0;
            return h('div', { key: g.key },
              h('div', { className: 'mf-group-head' },
                h(GroupToggle, {
                  name: g.name, open: isOpen,
                  onToggle: function () { var next = Object.assign({}, open); next[g.key] = !isOpen; setOpen(next); }
                },
                  party.length ? h('span', { className: 'book-progress-text' }, g.need ? g.need + ' needed' : 'Everyone has these') : null),
                h('button', { type: 'button', className: 'btn is-quiet is-small', onClick: function () { pickGroup(g); } }, g.all ? 'Clear' : 'Select all')),
              isOpen
                ? g.rows.map(function (r) {
                    var m = r.mount;
                    return h('label', { key: m.id, className: 'mf-pick' },
                      h('input', { type: 'checkbox', className: 'cdb-checkbox', checked: !!fights[m.id], onChange: function () { toggleFight(m.id); } }),
                      h('span', { className: 'mf-pick-main' },
                        h('span', { className: 'mf-pick-fight' }, m.fight),
                        h('span', { className: 'mf-pick-mount' }, m.name)),
                      party.length
                        ? h('span', { className: 'mf-pick-need ' + (r.need ? 'mf-need' : 'atma-complete') },
                            r.need ? r.need + ' of ' + party.length + ' need' : 'Everyone has it')
                        : null);
                  })
                : null);
          }))),
      err ? h('p', { className: 'cdb-notice is-error' }, err) : null,
      h('div', { className: 'mf-bar' },
        partyPeople.length
          ? h('div', { className: 'mf-stack' },
              partyPeople.map(function (p) { return h(Avatar, { key: p.id, person: p, alt: !!p.primary_member_id, title: p.name }); }))
          : null,
        h('p', { className: 'mf-bar-summary' }, summary),
        isEdit ? h('a', { className: 'btn is-quiet', href: TRACKER_HREF }, 'Cancel') : null,
        h('button', { type: 'button', className: 'btn', onClick: save, disabled: saving }, isEdit ? 'Save changes' : 'Save and get link')));
  }

  // ── Manage mounts ──────────────────────────────────────────────────────────

  function MountDialog(props) {
    var mount = props.mount;
    var nameState = useState(mount ? mount.name : ''); var name = nameState[0], setName = nameState[1];
    var fightState = useState(mount ? mount.fight : ''); var fight = fightState[0], setFight = fightState[1];
    var grpState = useState(mount ? mount.grp : NEW_MOUNT_GROUP); var grp = grpState[0], setGrp = grpState[1];
    var busyState = useState(false); var busy = busyState[0], setBusy = busyState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];

    function save() {
      if (!name.trim() || !fight.trim()) { setErr('Fill in the mount and the fight.'); return; }
      setBusy(true); setErr('');
      var body = { name: name.trim(), fight: fight.trim(), grp: grp };
      var req = mount
        ? api('PATCH', '/mount-farm/mounts/' + mount.id, body)
        : api('POST', '/mount-farm/mounts', body);
      req.then(function () { return props.onSaved(); }).catch(function (e) {
        setBusy(false); setErr(e.message || 'The mount could not be saved.');
      });
    }

    return h(Dialog, {
      title: mount ? 'Edit Mount' : 'Add a Mount', onClose: props.onClose,
      footer: [
        h('button', { key: 'cancel', type: 'button', className: 'btn is-quiet', onClick: props.onClose, disabled: busy }, 'Cancel'),
        h('button', { key: 'save', type: 'button', className: 'btn', onClick: save, disabled: busy }, mount ? 'Save changes' : 'Add mount')
      ]
    },
      h('div', null,
        h('label', { className: 'cdb-label', htmlFor: 'mf-mount-name' }, 'Mount'),
        h('input', { id: 'mf-mount-name', className: 'cdb-input', type: 'text', placeholder: 'Mount name', value: name, onChange: function (e) { setName(e.target.value); } })),
      h('div', null,
        h('label', { className: 'cdb-label', htmlFor: 'mf-mount-fight' }, 'Drops from'),
        h('input', { id: 'mf-mount-fight', className: 'cdb-input', type: 'text', placeholder: 'The fight name', value: fight, onChange: function (e) { setFight(e.target.value); } })),
      h('div', null,
        h('label', { className: 'cdb-label', htmlFor: 'mf-mount-group' }, 'Group'),
        h('select', { id: 'mf-mount-group', className: 'cdb-select', value: grp, onChange: function (e) { setGrp(e.target.value); } },
          GROUPS.map(function (g) { return h('option', { key: g.key, value: g.key }, g.name); }))),
      err ? h('p', { className: 'cdb-notice is-error' }, err) : null);
  }

  function ManageMounts(props) {
    var base = props.base;
    var openState = useState({}); var open = openState[0], setOpen = openState[1];
    var dialogState = useState(null); var dialog = dialogState[0], setDialog = dialogState[1];

    function close() { setDialog(null); }
    function saved() { return props.reload().then(close); }

    return h('div', { className: 'mf-manage' },
      h(BackLink),
      h('header', { className: 'app-header' }, h('h1', { className: 'app-title' }, 'Manage Mounts')),
      h('div', { className: 'top-controls top-controls-right' },
        h('button', { type: 'button', className: 'btn', onClick: function () { setDialog({ type: 'add' }); } }, icon('add'), 'Add mount')),
      groupsWithMounts(base.mounts, true).map(function (g) {
        var isOpen = !!open[g.key];
        return h('section', { key: g.key, className: 'book' + (isOpen ? ' active' : ''), 'aria-label': g.name },
          h(GroupToggle, {
            name: g.name, open: isOpen,
            onToggle: function () { var next = Object.assign({}, open); next[g.key] = !isOpen; setOpen(next); }
          },
            h('span', { className: 'book-progress-text' }, g.mounts.length ? g.mounts.length + (g.mounts.length === 1 ? ' mount' : ' mounts') : 'No mounts yet')),
          h('div', { className: 'book-body' },
            g.mounts.map(function (m) {
              return h('div', { key: m.id, className: 'mf-item' },
                h('div', { className: 'mf-item-main' },
                  h('div', { className: 'mf-item-name' }, m.name),
                  h('div', { className: 'mf-mount-fight' }, m.fight)),
                h('div', { className: 'cdb-form-actions' },
                  h('button', { type: 'button', className: 'btn is-quiet is-small', onClick: function () { setDialog({ type: 'edit', mount: m }); } }, 'Edit'),
                  base.can.delete
                    ? h('button', { type: 'button', className: 'btn is-danger is-small', onClick: function () { setDialog({ type: 'remove', mount: m }); } }, 'Remove')
                    : null));
            }),
            g.mounts.length ? null : h('p', { className: 'mf-none' }, 'No mounts yet.')));
      }),
      dialog && (dialog.type === 'add' || dialog.type === 'edit')
        ? h(MountDialog, { mount: dialog.mount || null, onClose: close, onSaved: saved })
        : null,
      dialog && dialog.type === 'remove'
        ? h(ConfirmDialog, {
            title: 'Remove ' + dialog.mount.name + '?',
            text: 'This action is final.',
            confirmLabel: 'Remove mount',
            onClose: close,
            onConfirm: function () { return api('DELETE', '/mount-farm/mounts/' + dialog.mount.id).then(saved); }
          })
        : null);
  }

  // ── The page ───────────────────────────────────────────────────────────────

  function MountFarm() {
    var params = new URLSearchParams(window.location.search);
    var baseState = useState(null); var base = baseState[0], setBase = baseState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];

    function load() {
      return api('GET', '/mount-farm').then(function (d) {
        setBase(normalizeBase(d)); setErr('');
      }, function (e) {
        setErr(e.status === 403 ? 'You don’t have access to Mount Farm.' : (e.message || 'Mount Farm could not load.'));
      });
    }

    useEffect(function () {
      if (!PVSession.get()) { PVSession.redirectToLogin(); return; }
      load();
    }, []);

    if (!base) {
      return h('p', { className: err ? 'cdb-notice is-error' : 'cdb-notice' }, err || 'Loading…');
    }
    if (params.has('event')) return h(EventPage, { base: base, slug: params.get('event') });
    if (params.has('edit')) return h(EventForm, { base: base, slug: params.get('edit') });
    if (params.has('plan')) {
      return base.can.plan || base.can.manage
        ? h(EventForm, { base: base, slug: null })
        : h(Notice, { title: 'You Can’t Plan Events' });
    }
    if (params.has('mounts')) {
      return base.can.manage
        ? h(ManageMounts, { base: base, reload: load })
        : h(Notice, { title: 'You Can’t Manage Mounts' });
    }
    return h(Tracker, { base: base, reload: load });
  }

  window.MountFarm = MountFarm;
})();
