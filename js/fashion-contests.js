// ============================================================================
//  FashionContests — the FC's fashion contests (fashion-contests.html)
//
//  One page, with the view picked by the address:
//    fashion-contests.html                  the list: on now, upcoming, past
//    fashion-contests.html?contest=<link>   a contest: its looks, the ballot
//                                           while voting is open, the results
//                                           once it's closed
//    fashion-contests.html?plan             make a contest
//    fashion-contests.html?edit=<link>      edit and run a contest
//    fashion-contests.html?results=<link>   results so far
//
//  Access (Permissions grid, Site Pages → Fashion Contests):
//    site.fashion-contests.view   open the page, vote when on a voter list
//    fashion_contest.create       make contests
//    fashion_contest.manage       run every contest
//  A contest's maker runs it too. Once voting has closed, only the root admin
//  can edit or delete it, or clear a voter's votes.
//
//  Worker routes (pv-med-database-worker, routes/fashion-contests.js):
//    GET    /fashion-contests              { can, contests, past }
//    GET    /fashion-contests?members=1    { can, members }
//    POST   /fashion-contests              { slug, name, subtitle, description,
//                                            starts_at, prizes, entries,
//                                            voters }
//    GET    /fashion-contests/:slug        the contest; ?edit=1 adds members
//    PATCH  /fashion-contests/:id          returns the contest (?edit=1 too)
//    DELETE /fashion-contests/:id
//    PUT    /fashion-contests/:id/scores   { scores: [{ voter_id?, entry_id,
//                                            creativity, style, theme }] }
//    POST   /fashion-contests/:id/submit   submits your ballot
//    DELETE /fashion-contests/:id/submit   takes it back
//    DELETE /fashion-contests/:id/voters/:voter_id/scores
//  The score, ballot and clearing routes return only what changed (me,
//  my_scores, and voters and in_person_scores for those running it), which
//  is merged into the page's data.
//
//  A contest moves from Upcoming to the top of the list on its day, in the
//  viewer's time zone, and stays until voting closes.
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useRef = React.useRef;

  var LIST_HREF = window.location.pathname;
  var BANNER = 'https://images.phoenixvanguard-tools.com/fashion-contest.jpg';
  var CRITERIA = [
    { key: 'creativity', name: 'Creativity', question: 'How original is this idea?' },
    { key: 'style', name: 'Style', question: 'Do the pieces and colours work together?',
      long: 'How well do the pieces and colours work together?' },
    { key: 'theme', name: 'Theme', question: 'How well does it fit the theme?' }
  ];
  var SCALE = [1, 2, 3, 4, 5];
  var PLACES = ['First place', 'Second place', 'Third place'];
  var PRIZE_NAMES = ['First', 'Second', 'Third'];
  var STATUSES = [
    { key: 'draft', name: 'Not open' },
    { key: 'open', name: 'Voting open' },
    { key: 'closed', name: 'Closed' }
  ];
  var CROSS = 'M7 7l10 10M17 7L7 17';

  function api(method, path, body) {
    return PVAdminAPI.request(method, path, body, true);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function icon(name) {
    return h('span', { className: 'material-symbols-outlined', 'aria-hidden': 'true' }, name);
  }

  function svgIcon(className, d, strokeWidth) {
    return h('svg', {
      className: className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: strokeWidth,
      strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false'
    }, h('path', { d: d }));
  }

  function grip() {
    return h('svg', { viewBox: '0 0 12 18', fill: 'currentColor', 'aria-hidden': 'true', focusable: 'false' },
      [3, 9, 15].map(function (y) {
        return [h('circle', { key: 'l' + y, cx: 3.5, cy: y, r: 1.4 }), h('circle', { key: 'r' + y, cx: 8.5, cy: y, r: 1.4 })];
      }));
  }

  function byName(a, b) {
    return String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' });
  }

  function initials(name) {
    var words = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (words.length >= 2) return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
    return (words[0] || '?').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || '?';
  }

  function matches(name, needle) {
    return String(name || '').toLowerCase().indexOf(needle) !== -1;
  }

  function slugify(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 40).replace(/-+$/, '');
  }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  function fixed(n, places) { return n == null ? '—' : n.toFixed(places); }

  function firstSentence(text) {
    var t = String(text || '').trim();
    var m = t.match(/^[\s\S]*?[.!?](?=\s|$)/);
    return m ? m[0] : t;
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

  function dateOf(iso) {
    var d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }
  function dayKey(d) { return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
  function isDayOf(iso) { var d = dateOf(iso); return !!d && dayKey(d) <= dayKey(new Date()); }
  function isToday(iso) { var d = dateOf(iso); return !!d && dayKey(d) === dayKey(new Date()); }
  function timeText(d) { return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
  // "Fri, Dec 18 · 8:00 PM"
  function shortWhen(iso) {
    var d = dateOf(iso);
    return d ? d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + timeText(d) : '';
  }
  // "Friday, October 30 at 8:00 PM"
  function longWhen(iso) {
    var d = dateOf(iso);
    return d ? d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) + ' at ' + timeText(d) : '';
  }
  function monthYear(iso) {
    var d = dateOf(iso);
    return d ? d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : '';
  }

  function contestHref(slug) { return '?contest=' + encodeURIComponent(slug); }
  function editHref(slug) { return '?edit=' + encodeURIComponent(slug); }
  function resultsHref(slug) { return '?results=' + encodeURIComponent(slug); }
  function contestUrl(slug) { return window.location.origin + window.location.pathname + contestHref(slug); }
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

  function loadError(e, what) {
    if (e && e.status === 403) return 'You don’t have access to Fashion Contests.';
    return (e && e.message) || what + ' could not load.';
  }

  function complete(s) {
    return !!s && CRITERIA.every(function (c) { return s[c.key] != null; });
  }
  function meanOf(s) {
    return (s.creativity + s.style + s.theme) / 3;
  }
  function samePlayer(a, b) {
    return a.main_id != null && a.main_id === b.main_id;
  }

  // Not started (gold), partly done (brown), done (muted), live (red).
  function dotClass(state) {
    return 'status-dot' + (state === 'none' ? ' is-gold' : state === 'part' ? ' is-brown' : state === 'live' ? ' is-red' : '');
  }

  // ── Shared pieces ──────────────────────────────────────────────────────────

  function Avatar(props) {
    var errState = useState(false); var err = errState[0], setErr = errState[1];
    var p = props.person || {};
    return h('span', { className: 'avatar is-small', 'aria-hidden': 'true' },
      p.image_url && !err
        ? h('img', { src: p.image_url, alt: '', loading: 'lazy', onError: function () { setErr(true); } })
        : initials(p.name));
  }

  // A look's picture in its frame, or the placeholder field.
  function LookImage(props) {
    var errState = useState(false); var err = errState[0], setErr = errState[1];
    useEffect(function () { setErr(false); }, [props.url]);
    var show = props.url && !err;
    return h('span', {
      className: 'fc-look ' + props.className + (show ? '' : ' media-ph is-tone-' + ((Math.abs(props.tone || 0) % 5) + 1)),
      'aria-hidden': 'true'
    },
      show
        ? h('img', { className: 'media-card-img', src: props.url, alt: '', loading: 'lazy', onError: function () { setErr(true); } })
        : props.children);
  }

  function Progress(props) {
    var pct = props.of ? Math.round(props.done / props.of * 100) : 0;
    return h('div', { className: 'fc-progress' },
      h('div', {
        className: 'progress-bar', role: 'progressbar', 'aria-label': props.label,
        'aria-valuemin': 0, 'aria-valuemax': props.of, 'aria-valuenow': props.done
      }, h('div', { className: 'progress-bar-fill', style: { width: pct + '%' } })),
      h('span', { className: 'meta-note' }, props.label));
  }

  // A 1–5 score. clearable: clicking the chosen number clears it. keys: one
  // Tab stop that takes 1 to 5 (Backspace or 0 clears).
  function ScoreSeg(props) {
    function onKey(e) {
      if (props.disabled) return;
      if (/^[1-5]$/.test(e.key)) { e.preventDefault(); props.onPick(Number(e.key)); }
      else if (props.clearable && (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0')) { e.preventDefault(); props.onPick(null); }
    }
    return h('div', {
      className: 'fc-score' + (props.compact ? ' is-compact' : '') + (props.className ? ' ' + props.className : ''),
      role: 'group', 'aria-label': props.label,
      tabIndex: props.keys && !props.disabled ? 0 : undefined,
      onKeyDown: props.keys ? onKey : undefined
    },
      SCALE.map(function (n) {
        var on = props.value === n;
        return h('button', {
          key: n, type: 'button', className: 'fc-score-btn', 'aria-pressed': on ? 'true' : 'false',
          tabIndex: props.keys ? -1 : undefined, disabled: props.disabled,
          onClick: function () { props.onPick(on && props.clearable ? null : n); }
        }, n);
      }));
  }

  // Escape or a click on the backdrop closes it.
  function Modal(props) {
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
      className: 'modal-overlay',
      onMouseDown: function (e) { if (e.target === e.currentTarget) closeRef.current(); }
    },
      h('div', {
        className: 'modal ' + props.className, ref: boxRef, tabIndex: -1,
        role: props.alert ? 'alertdialog' : 'dialog', 'aria-modal': 'true', 'aria-labelledby': props.labelledBy
      }, props.children));
  }

  function ConfirmDialog(props) {
    var busyState = useState(false); var busy = busyState[0], setBusy = busyState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];
    function confirm() {
      setBusy(true); setErr('');
      props.onConfirm().catch(function (e) { setBusy(false); setErr(e.message || 'That did not go through.'); });
    }
    return h(Modal, { className: 'is-padded mf-dialog', alert: true, labelledBy: 'fc-confirm-title', onClose: props.onClose },
      h('h2', { id: 'fc-confirm-title', className: 'form-title' }, props.title),
      h('div', { className: 'form-fields' },
        h('p', null, props.text),
        err ? h('p', { className: 'notice-card is-error' }, err) : null,
        h('div', { className: 'form-actions' },
          h('button', { type: 'button', className: 'btn is-quiet', onClick: props.onClose, disabled: busy }, 'Keep it'),
          h('button', { type: 'button', className: 'btn is-destructive', onClick: confirm, disabled: busy }, props.confirmLabel))));
  }

  function BackLink(props) {
    return h('div', { className: 'top-controls' },
      h('a', { className: 'btn is-plain', href: props.href || LIST_HREF }, icon('arrow_back'), props.label || 'Fashion contests'),
      props.children);
  }

  function Notice(props) {
    return h('div', { className: 'notice-panel is-gate tear-half' },
      h('h1', { className: 'form-title' }, props.title),
      h('a', { className: 'btn', href: LIST_HREF }, 'Back to Fashion Contests'));
  }

  function Loading(props) {
    return h('div', null,
      props.back === false ? null : h(BackLink),
      h('p', { className: props.err ? 'notice-card is-error' : 'notice-card' }, props.err || 'Loading…'));
  }

  // Search the FC list and pick someone; skip(person) leaves people out.
  function PeoplePicker(props) {
    var qState = useState(''); var q = qState[0], setQ = qState[1];
    var needle = q.trim().toLowerCase();
    var results = needle
      ? props.pool.filter(function (p) { return !props.skip(p) && matches(p.name, needle); }).slice(0, 20)
      : [];
    return h('div', { className: 'fc-picker' },
      h('input', {
        className: 'field is-block', type: 'search', autoComplete: 'off', 'aria-label': props.placeholder,
        placeholder: props.placeholder, disabled: !!props.disabled, value: q,
        onChange: function (e) { setQ(e.target.value); }
      }),
      needle && !props.disabled
        ? h('div', { className: 'tray mf-results', 'aria-label': 'Matching people' },
            results.map(function (p) {
              return h('button', {
                key: p.id, type: 'button', className: 'mf-result',
                onClick: function () { props.onAdd(p); setQ(''); }
              }, h(Avatar, { person: p }), h('span', { className: 'mf-person-name' }, p.name));
            }),
            results.length ? null : h('p', { className: 'empty-note mf-none' }, 'No one by that name.'))
        : null);
  }

  function ContestHead(props) {
    var c = props.contest;
    return h('header', { className: 'fc-head' },
      h('div', null,
        h('p', { className: 'app-subtitle' }, 'The Phoenix Vanguard presents'),
        h('h1', { className: 'app-title' }, c.name),
        c.subtitle ? h('p', { className: 't-label' }, c.subtitle) : null),
      c.description ? h('p', { className: 'fc-desc' }, c.description) : null);
  }

  function LookCard(props) {
    var e = props.entry;
    return h('div', { className: 'media-card fc-static' },
      h(LookImage, { url: e.image_url, tone: props.index, className: 'media-card-media tear-half fc-portrait' }),
      h('span', { className: 'media-card-body' }, h('span', { className: 'media-card-title' }, e.name)));
  }

  function prizesLine(prizes) {
    var list = prizes.filter(Boolean);
    return list.length ? 'Prizes: ' + list.join(' · ') : '';
  }

  // The top three; more when places are shared.
  function Podium(props) {
    var rows = props.rows.filter(function (r) { return r.rank && r.rank <= 3; });
    if (!rows.length) return null;
    return h('section', { className: 'fc-podium', 'aria-label': props.label },
      rows.map(function (r) {
        var e = props.byId[r.entry_id];
        var prize = props.prizes[r.rank - 1];
        return h('article', { key: r.entry_id, className: 'media-card fc-static' },
          h(LookImage, { url: e.image_url, tone: e.order, className: 'media-card-media tear-half' + (props.wide ? '' : ' fc-landscape') }),
          h('div', { className: 'media-card-body' },
            h('p', { className: 't-script fc-red' }, PLACES[r.rank - 1]),
            h('div', { className: 'media-card-title-row' },
              h('h2', { className: 'media-card-title' }, e.name),
              h('span', { className: 'media-card-title' }, fixed(r.average, 2))),
            prize ? h('p', { className: 'media-card-meta' }, prize) : null));
      }));
  }

  // Criteria to one place, the average to two.
  function ResultsTable(props) {
    return h('section', { className: 'atma-card tear fc-results', 'aria-label': 'All scores' },
      h('div', { className: 'atma-scroll' },
        h('table', { className: 'task-table atma-table' },
          h('thead', null,
            h('tr', null,
              h('th', { scope: 'col' }, 'Rank'),
              h('th', { scope: 'col' }, 'Entrant'),
              CRITERIA.map(function (c) { return h('th', { key: c.key, scope: 'col', className: 'td-count-header' }, c.name); }),
              props.ballots ? h('th', { scope: 'col', className: 'td-count-header' }, 'Ballots') : null,
              h('th', { scope: 'col', className: 'td-count-header' }, 'Average'))),
          h('tbody', null,
            props.rows.map(function (r) {
              var e = props.byId[r.entry_id];
              var mine = props.mine != null && props.mine === r.entry_id;
              return h('tr', { key: r.entry_id, className: mine ? 'fc-mine' : null },
                h('td', { className: 'td-num' }, r.rank || '—'),
                h('td', null,
                  h('span', { className: 'fc-entrant' },
                    props.thumbs ? h(LookImage, { url: e.image_url, tone: e.order, className: 'fc-table-thumb' }) : null,
                    h('span', { className: 'row-name' }, e.name),
                    mine ? h('span', { className: 'meta-note fc-you' }, 'You') : null)),
                CRITERIA.map(function (c) { return h('td', { key: c.key, className: 'td-count' }, fixed(r[c.key], 1)); }),
                props.ballots ? h('td', { className: 'td-count' }, r.ballots) : null,
                h('td', { className: 'td-count fc-avg' }, fixed(r.average, 2)));
            })))),
      props.children ? h('div', { className: 'form-actions fc-table-foot' }, props.children) : null);
  }

  function entriesById(entries) {
    var out = {};
    entries.forEach(function (e, i) { out[e.id] = Object.assign({ order: i }, e); });
    return out;
  }

  // ── The list ───────────────────────────────────────────────────────────────

  function FeatureCard(props) {
    var c = props.contest;
    var open = c.status === 'open';
    var ballot = open ? c.my_ballot : null;
    var d = dateOf(c.starts_at);
    var counts = [plural(c.entries, 'entry', 'entries'), plural(c.voters, 'voter', 'voters')];
    if (open && c.site_ballots && c.site_ballots.of) {
      counts.push(c.site_ballots.in + ' of ' + c.site_ballots.of + ' site ballots in');
    }
    var main = ballot && !ballot.submitted ? (ballot.scored ? 'Keep voting' : 'Vote') : 'Open';
    var blurb = firstSentence(c.description);
    var titleId = 'fc-feature-' + c.id;
    return h('section', { className: 'fc-feature tear', 'aria-labelledby': titleId },
      c.thumbs.length
        ? h('div', { className: 'fc-collage is-' + c.thumbs.length },
            c.thumbs.map(function (url, i) { return h(LookImage, { key: i, url: url, tone: i, className: 'fc-collage-tile' }); }))
        : null,
      h('div', { className: 'fc-feature-body' },
        h('p', { className: 't-label ' + dotClass(open ? 'live' : 'done') },
          open ? 'Voting open' : isToday(c.starts_at) && d ? 'Today · voting opens ' + timeText(d) : 'Voting not open yet'),
        h('div', null,
          h('h2', { id: titleId, className: 'app-title' }, c.name),
          c.subtitle ? h('p', { className: 't-label' }, c.subtitle) : null),
        blurb ? h('p', null, blurb) : null,
        h('p', { className: 'meta-note' }, counts.join(' · ')),
        ballot
          ? h(Progress, {
              done: ballot.submitted ? ballot.of : ballot.scored, of: ballot.of,
              label: 'Your ballot · ' + (ballot.submitted ? 'in' : ballot.scored + ' of ' + ballot.of)
            })
          : null,
        h('div', { className: 'fc-actions' },
          h('a', { className: 'btn', href: contestHref(c.slug) }, main),
          c.can_manage ? h('a', { className: 'btn is-quiet', href: editHref(c.slug) }, 'Edit') : null,
          c.can_manage && open ? h('a', { className: 'btn is-quiet', href: resultsHref(c.slug) }, 'Results so far') : null)));
  }

  function UpcomingRow(props) {
    var c = props.contest;
    var d = dateOf(c.starts_at);
    return h('div', { className: 'fc-up-row' },
      h('div', { className: 'fc-date', 'aria-hidden': 'true' },
        h('span', { className: 't-label' }, d ? d.toLocaleDateString(undefined, { month: 'short' }) : ''),
        h('span', { className: 'fc-date-day' }, d ? d.getDate() : '—')),
      h('div', { className: 'mf-row-main' },
        h('p', { className: 'item-title' }, c.name),
        h('p', { className: 'row-meta' }, shortWhen(c.starts_at))),
      c.can_manage
        ? h('a', { className: 'btn is-quiet is-small', href: editHref(c.slug), 'aria-label': 'Edit ' + c.name }, 'Edit')
        : null);
  }

  function PastCard(props) {
    var c = props.contest;
    return h('a', { className: 'media-card', href: contestHref(c.slug) },
      h(LookImage, { url: c.image_url, tone: c.id, className: 'media-card-media tear-half fc-landscape' }),
      h('span', { className: 'media-card-body' },
        h('span', { className: 'media-card-title' }, c.name),
        h('span', { className: 'media-card-meta' }, monthYear(c.starts_at) + ' · ' + plural(c.entries, 'entry', 'entries')),
        c.winners.length
          ? h('span', { className: 'fc-winner' },
              h('span', { className: 't-script fc-red' }, 'Winner'),
              h('span', { className: 'row-name' }, c.winners.join(' & ')))
          : null));
  }

  // The banner and title card, as on the medical pages.
  function LandingHero(props) {
    return h(React.Fragment, null,
      h('div', { className: 'home-band is-page' },
        h('div', { className: 'home-band-photo media-ph tear' }, h('img', { src: BANNER, alt: '' }))),
      h('header', { className: 'home-hero-card is-page tear' },
        h('p', { className: 'app-subtitle' }, 'The Phoenix Vanguard presents'),
        h('h1', { className: 'app-title' }, 'Fashion Contests'),
        props.canCreate
          ? h('div', { className: 'home-hero-actions' }, h('a', { className: 'btn', href: '?plan' }, 'New contest'))
          : null));
  }

  function Landing(props) {
    var base = props.base;
    var top = base.contests.filter(function (c) { return c.status === 'open' || isDayOf(c.starts_at); });
    var upcoming = base.contests.filter(function (c) { return c.status !== 'open' && !isDayOf(c.starts_at); });
    return h('div', null,
      h(LandingHero, { canCreate: base.can.create }),
      top.map(function (c) { return h(FeatureCard, { key: c.id, contest: c }); }),
      h('section', { className: 'fc-section', 'aria-labelledby': 'fc-up-title' },
        h('h2', { id: 'fc-up-title', className: 'form-title' }, 'Upcoming'),
        h('div', { className: 'fc-upcoming' },
          upcoming.length
            ? upcoming.map(function (c) { return h(UpcomingRow, { key: c.id, contest: c }); })
            : h('p', { className: 'empty-note mf-none' }, 'No contests coming up'))),
      h('section', { className: 'fc-section', 'aria-labelledby': 'fc-past-title' },
        h('div', { className: 'fc-section-head' },
          h('h2', { id: 'fc-past-title', className: 'form-title' }, 'Past contests'),
          base.past.length ? h('span', { className: 'meta-note' }, plural(base.past.length, 'contest', 'contests')) : null),
        base.past.length
          ? h('div', { className: 'card-grid' }, base.past.map(function (c) { return h(PastCard, { key: c.id, contest: c }); }))
          : h('p', { className: 'empty-note' }, 'No past contests yet')));
  }

  // ── A contest ──────────────────────────────────────────────────────────────

  function UpcomingView(props) {
    var data = props.data, c = data.contest;
    var prizes = [];
    c.prizes.forEach(function (p, i) { if (p) prizes.push({ prize: p, i: i }); });
    return h('div', { className: 'fc-layout' },
      h('section', { className: 'card-grid fc-grid', 'aria-label': 'Entries' },
        data.entries.map(function (e, i) { return h(LookCard, { key: e.id, entry: e, index: i }); })),
      h('aside', { className: 'fc-panel', 'aria-label': 'About voting' },
        h('div', null,
          h('p', { className: 't-label' }, 'Voting'),
          h('h2', { className: 'form-title' }, 'Opens ' + longWhen(c.starts_at))),
        h('div', null,
          h('p', { className: 't-label' }, 'How to score'),
          h('dl', { className: 'fc-dl' },
            CRITERIA.map(function (cr) {
              return h(React.Fragment, { key: cr.key },
                h('dt', { className: 'item-title' }, cr.name),
                h('dd', null, cr.long || cr.question));
            })),
          h('p', { className: 'meta-note' }, '1 · Adequate  –  5 · Impressive')),
        prizes.length
          ? h('div', { className: 'fc-panel-foot' },
              h('p', { className: 't-label' }, 'Prizes'),
              h('dl', { className: 'fc-dl' },
                prizes.map(function (x) {
                  return h(React.Fragment, { key: x.i },
                    h('dt', { className: 't-script fc-red' }, PRIZE_NAMES[x.i]),
                    h('dd', null, x.prize));
                })))
          : null));
  }

  // Voting open, for someone not on the voter list.
  function GalleryView(props) {
    var data = props.data;
    var line = prizesLine(data.contest.prizes);
    return h('div', null,
      line ? h('div', { className: 'top-controls top-controls-right' }, h('p', { className: 'meta-note' }, line)) : null,
      h('section', { className: 'card-grid', 'aria-label': 'All looks' },
        data.entries.map(function (e, i) { return h(LookCard, { key: e.id, entry: e, index: i }); })));
  }

  // Voting open, for a voter: pick a look, score it, save and move on, then
  // submit. A submitted ballot is locked until Edit ballot takes it back.
  // In-person voters see their scores without changing them.
  function BallotView(props) {
    var data = props.data, c = data.contest, me = data.me;
    var readOnly = !!me.in_person;
    var locked = readOnly || !!me.submitted;
    var looks = data.entries;
    var own = data.my_entry_id;
    var scoreable = looks.filter(function (e) { return e.id !== own; });
    var saved = {};
    data.my_scores.forEach(function (s) { saved[s.entry_id] = s; });

    var draftsState = useState({}); var drafts = draftsState[0], setDrafts = draftsState[1];
    var currentState = useState(function () {
      var first = scoreable.filter(function (e) { return !complete(saved[e.id]); })[0] || scoreable[0];
      return first ? first.id : null;
    });
    var current = currentState[0], setCurrent = currentState[1];
    var orderState = useState('entry'); var order = orderState[0], setOrder = orderState[1];
    var busyState = useState(false); var busy = busyState[0], setBusy = busyState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];

    var ranked = scoreable.filter(function (e) { return complete(saved[e.id]); })
      .sort(function (a, b) { return meanOf(saved[b.id]) - meanOf(saved[a.id]); });
    var rankOf = {};
    ranked.forEach(function (e, i) { rankOf[e.id] = i + 1; });
    var shown = order === 'rank'
      ? ranked.concat(looks.filter(function (e) { return !rankOf[e.id] && e.id !== own; }), looks.filter(function (e) { return e.id === own; }))
      : looks;

    var cur = null;
    looks.forEach(function (e) { if (e.id === current) cur = e; });
    var vals = cur ? (drafts[cur.id] || saved[cur.id] || {}) : {};
    var scoredCount = ranked.length;
    var allIn = scoreable.length > 0 && scoredCount === scoreable.length;

    // The next unscored look after this one in the order shown, else the next.
    function nextAfter(id) {
      var list = shown.filter(function (e) { return e.id !== own; });
      var at = 0;
      list.forEach(function (e, i) { if (e.id === id) at = i; });
      for (var step = 1; step < list.length; step++) {
        var e = list[(at + step) % list.length];
        if (!complete(saved[e.id])) return e.id;
      }
      return list.length > 1 ? list[(at + 1) % list.length].id : id;
    }

    function pick(key, n) {
      setDrafts(function (prev) {
        var next = Object.assign({}, prev);
        var row = Object.assign({}, prev[cur.id] || saved[cur.id] || {});
        row[key] = n;
        next[cur.id] = row;
        return next;
      });
    }

    function run(req, failText, after) {
      setBusy(true); setErr('');
      req.then(function (d) {
        props.merge(d);
        if (after) after();
        setBusy(false);
      }, function (e) { setBusy(false); setErr(e.message || failText); });
    }

    function saveAndNext() {
      var id = cur.id;
      var go = nextAfter(id);
      run(api('PUT', '/fashion-contests/' + c.id + '/scores', {
        scores: [{ entry_id: id, creativity: vals.creativity, style: vals.style, theme: vals.theme }]
      }), 'Your scores could not be saved.', function () {
        setDrafts(function (prev) { var next = Object.assign({}, prev); delete next[id]; return next; });
        setCurrent(go);
      });
    }

    var line = prizesLine(c.prizes);
    var position = cur ? scoreable.indexOf(cur) + 1 : 0;

    return h('div', null,
      h('div', { className: 'top-controls' },
        h('div', { className: 'seg', role: 'group', 'aria-label': 'Order looks by' },
          h('button', { type: 'button', className: 'seg-btn', 'aria-pressed': order === 'entry' ? 'true' : 'false', onClick: function () { setOrder('entry'); } }, 'Entry order'),
          h('button', { type: 'button', className: 'seg-btn', 'aria-pressed': order === 'rank' ? 'true' : 'false', onClick: function () { setOrder('rank'); } }, 'Your ranking')),
        line ? h('p', { className: 'meta-note' }, line) : null),
      h('div', { className: 'fc-layout' },
        h('section', { className: 'card-grid fc-grid', 'aria-label': 'All looks' },
          shown.map(function (e) {
            var isOwn = e.id === own;
            var isCurrent = e.id === current;
            var s = saved[e.id];
            var summary = isOwn ? 'Your look'
              : complete(s) ? 'Score ' + meanOf(s).toFixed(1)
              : isCurrent ? 'Scoring now' : 'Not scored yet';
            return h('button', {
              key: e.id, type: 'button', disabled: isOwn, 'aria-pressed': isCurrent ? 'true' : 'false',
              className: 'media-card' + (isCurrent ? ' is-current' : '') + (isOwn ? ' is-own fc-static' : ''),
              onClick: function () { setCurrent(e.id); }
            },
              h(LookImage, { url: e.image_url, tone: looks.indexOf(e), className: 'media-card-media tear-half fc-portrait' }),
              h('span', { className: 'media-card-body' },
                h('span', { className: 'media-card-title-row' },
                  h('span', { className: 'media-card-title' }, e.name + (isOwn ? ' (you)' : '')),
                  rankOf[e.id] ? h('span', { className: 'row-name fc-rank' }, '#' + rankOf[e.id]) : null),
                h('span', { className: 'media-card-meta' }, summary)));
          })),
        h('aside', { className: 'fc-panel', 'aria-label': 'Score this look' },
          cur
            ? h(React.Fragment, null,
                h('div', { className: 'fc-ballot-head' },
                  h(LookImage, { url: cur.image_url, tone: looks.indexOf(cur), className: 'fc-thumb tear-half' }),
                  h('div', null,
                    h('p', { className: 't-label' }, (locked ? 'Look ' : 'Scoring · ') + position + ' of ' + scoreable.length),
                    h('h2', { className: 'form-title' }, cur.name),
                    cur.look_title ? h('p', { className: 't-script' }, cur.look_title) : null)),
                CRITERIA.map(function (cr) {
                  return h('div', { key: cr.key, className: 'fc-crit' },
                    h('div', { className: 'fc-crit-head' },
                      h('h3', { className: 'item-title' }, cr.name),
                      h('span', { className: 'meta-note' }, cr.question)),
                    h(ScoreSeg, {
                      value: vals[cr.key], label: cr.name + ' score', disabled: locked || busy,
                      onPick: function (n) { pick(cr.key, n); }
                    }));
                }),
                h('div', { className: 'fc-scale meta-note' }, h('span', null, '1 · Adequate'), h('span', null, '5 · Impressive')),
                locked
                  ? null
                  : h('div', { className: 'form-actions' },
                      h('button', {
                        type: 'button', className: 'btn is-quiet', disabled: busy || scoreable.length < 2,
                        onClick: function () { setCurrent(nextAfter(cur.id)); }
                      }, 'Skip'),
                      h('button', { type: 'button', className: 'btn', disabled: busy || !complete(vals), onClick: saveAndNext }, 'Save and next look')))
            : h('p', { className: 'empty-note' }, 'No looks to score yet'),
          h('div', { className: 'fc-panel-foot' },
            h(Progress, { done: scoredCount, of: scoreable.length, label: scoredCount + ' of ' + scoreable.length + ' scored' }),
            readOnly
              ? null
              : me.submitted
                ? h('div', { className: 'fc-ballot-in' },
                    h('span', { className: dotClass('done') }, 'Ballot submitted'),
                    h('button', {
                      type: 'button', className: 'btn is-quiet', disabled: busy,
                      onClick: function () { run(api('DELETE', '/fashion-contests/' + c.id + '/submit'), 'Your ballot could not be reopened.'); }
                    }, 'Edit ballot'))
                : h('button', {
                    type: 'button', className: 'btn', disabled: busy || !allIn,
                    onClick: function () {
                      run(api('POST', '/fashion-contests/' + c.id + '/submit'), 'Your ballot could not be submitted.', function () { setDrafts({}); });
                    }
                  }, 'Submit ballot')),
          err ? h('p', { className: 'notice-card is-error' }, err) : null)));
  }

  function FinalView(props) {
    var data = props.data, c = data.contest, res = data.results;
    var byId = entriesById(data.entries);
    return h('div', null,
      h(Podium, { rows: res.rows, byId: byId, prizes: c.prizes, label: 'Winners' }),
      h('p', { className: 'meta-note fc-closed-line' }, 'Voting closed · ' + plural(res.voters, 'voter', 'voters')),
      h(ResultsTable, { rows: res.rows, byId: byId, mine: data.my_entry_id, thumbs: true }));
  }

  // Loads a contest; merge(patch) folds a save's response into it.
  function useContest(slug, edit) {
    var dataState = useState(null); var data = dataState[0], setData = dataState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];
    var goneState = useState(false); var gone = goneState[0], setGone = goneState[1];
    function load() {
      return api('GET', '/fashion-contests/' + encodeURIComponent(slug) + (edit ? '?edit=1' : '')).then(function (d) {
        setData(d); setErr('');
        return d;
      }, function (e) {
        if (e.status === 404) setGone(true);
        else setErr(loadError(e, 'The contest'));
      });
    }
    function merge(patch) {
      setData(function (d) { return Object.assign({}, d, patch); });
    }
    useEffect(function () { load(); }, []);
    return { data: data, setData: setData, err: err, setErr: setErr, gone: gone, load: load, merge: merge };
  }

  function ContestPage(props) {
    var s = useContest(props.slug, false);
    if (s.gone) return h(Notice, { title: 'This Contest Isn’t Available' });
    if (!s.data) return h(Loading, { err: s.err });
    var data = s.data, c = data.contest;
    var body = c.status === 'closed' ? h(FinalView, { data: data })
      : c.status === 'open' ? (data.me ? h(BallotView, { data: data, merge: s.merge }) : h(GalleryView, { data: data }))
      : h(UpcomingView, { data: data });
    return h('div', null,
      h(BackLink, null,
        c.can_manage ? h('a', { className: 'btn is-plain', href: editHref(c.slug) }, 'Edit contest') : null),
      h(ContestHead, { contest: c }),
      body);
  }

  // ── Results so far ─────────────────────────────────────────────────────────

  function ResultsPage(props) {
    var s = useContest(props.slug, false);
    var busyState = useState(false); var busy = busyState[0], setBusy = busyState[1];
    if (s.gone || (s.data && !s.data.contest.can_manage)) return h(Notice, { title: 'These Results Aren’t Available' });
    if (!s.data) return h(Loading, { err: s.err });
    var c = s.data.contest, res = s.data.results;
    var byId = entriesById(s.data.entries);
    var counts = [];
    if (res.site_ballots.of) counts.push(res.site_ballots.in + ' of ' + res.site_ballots.of + ' site ballots');
    if (res.in_person_looks) counts.push('in-person ' + res.in_person_looks.in + ' of ' + res.in_person_looks.of + ' looks');
    var stage = c.status === 'open' ? 'voting open' : c.status === 'closed' ? 'voting closed' : 'voting not open';

    function reload() {
      setBusy(true);
      s.load().then(function () { setBusy(false); });
    }
    function close() {
      setBusy(true); s.setErr('');
      api('PATCH', '/fashion-contests/' + c.id, { status: 'closed' }).then(function () {
        goTo(contestHref(c.slug));
      }, function (e) { setBusy(false); s.setErr(e.message || 'Voting could not be closed.'); });
    }

    return h('div', null,
      h(BackLink, { href: editHref(c.slug), label: 'Edit contest' }),
      h('header', { className: 'top-controls' },
        h('div', null,
          h('p', { className: 't-label' }, 'Results so far · ' + stage),
          h('h1', { className: 'app-title' }, c.name)),
        h('div', { className: 'fc-head-side' },
          counts.length ? h('p', { className: 'meta-note' }, counts.join(' · ')) : null,
          h('button', { type: 'button', className: 'btn is-quiet is-small', onClick: reload, disabled: busy }, 'Reload'))),
      h(Podium, { rows: res.rows, byId: byId, prizes: c.prizes, wide: true, label: 'Top three' }),
      h(ResultsTable, { rows: res.rows, byId: byId, ballots: true },
        c.status === 'open'
          ? h('button', { type: 'button', className: 'btn', onClick: close, disabled: busy }, 'Close voting and show results')
          : null),
      s.err ? h('p', { className: 'notice-card is-error' }, s.err) : null);
  }

  // ── Make a contest / Edit a contest ────────────────────────────────────────

  function EntryRow(props) {
    var e = props.entry;
    var Upload = window.PVAdminImageUpload;
    var up = Upload
      ? Upload.useImageUpload({
          kind: 'fashion', name: props.slug + ' ' + e.name,
          onUploaded: function (url) { props.onChange({ image_url: url }); }
        })
      : null;
    return h('div', {
      className: 'mf-added fc-entry' + (props.over ? ' is-over' : '') + (props.dragging ? ' is-dragging' : ''),
      onDragOver: props.onDragOver, onDrop: props.onDrop
    },
      h('span', {
        className: 'fc-handle', draggable: true, title: 'Drag to reorder',
        onDragStart: props.onDragStart, onDragEnd: props.onDragEnd
      }, grip()),
      h(LookImage, { url: e.image_url, tone: props.index, className: 'fc-entry-thumb' },
        h('span', { className: 'fc-no-image' }, 'No image')),
      h('div', { className: 'mf-row-main fc-entry-main' },
        h('div', { className: 'fc-entry-top' },
          h('span', { className: 'row-name' }, e.name),
          props.status ? h('span', { className: 'row-meta ' + dotClass(props.status.state) }, props.status.text) : null),
        h('input', {
          className: 'field is-block is-small', type: 'text', 'aria-label': 'Look title for ' + e.name,
          placeholder: 'Look title (optional)', value: e.look_title, maxLength: 80,
          onChange: function (ev) { props.onChange({ look_title: ev.target.value }); }
        }),
        up && up.error ? h('p', { className: 'notice-card is-error' }, up.error) : null),
      h('div', { className: 'fc-entry-actions' },
        props.scores
          ? h('button', {
              type: 'button', className: 'btn is-small' + (props.scores.next ? '' : ' is-quiet'),
              onClick: props.scores.onOpen
            }, props.scores.label)
          : null,
        up
          ? h('label', { className: 'btn is-quiet is-small', 'aria-label': 'Image for ' + e.name, style: up.uploading ? { opacity: 0.55 } : null },
              up.uploading ? 'Uploading…' : 'Image',
              h('input', {
                type: 'file', className: 'fc-file', accept: Upload.UPLOAD_ACCEPT, disabled: up.uploading,
                onChange: function (ev) { var f = ev.target.files && ev.target.files[0]; ev.target.value = ''; up.upload(f); }
              }))
          : null,
        h('button', {
          type: 'button', className: 'mf-remove', 'aria-label': 'Remove ' + e.name, disabled: props.locked,
          onClick: props.onRemove
        }, svgIcon(null, CROSS, 2.2))));
  }

  // Only a voter with a site account can vote on the site.
  function VoterRow(props) {
    var v = props.voter;
    var sv = props.saved;
    var text = v.has_account ? 'Site account' : 'No site account';
    var state = 'none';
    if (sv && sv.in_person === v.in_person) {
      if (v.in_person) {
        text += ' · ' + (sv.scored ? 'scored ' + sv.scored + ' of ' + sv.of + ' looks' : 'no scores yet');
        state = sv.of && sv.scored >= sv.of ? 'done' : sv.scored ? 'part' : 'none';
      } else if (sv.submitted) {
        text += ' · ballot in';
        state = 'done';
      } else {
        text += ' · ' + (sv.scored ? sv.scored + ' of ' + sv.of + ' scored' : 'not voted');
        state = sv.scored ? 'part' : 'none';
      }
    }
    return h('div', { className: 'mf-added fc-voter' },
      h(Avatar, { person: v }),
      h('div', { className: 'mf-row-main' },
        h('div', { className: 'row-name' }, v.name, props.entrant ? h('span', { className: 'row-meta' }, ' · entrant') : null),
        h('div', null, h('span', { className: 'row-meta ' + dotClass(state) }, text))),
      props.onClear && sv && (sv.score_count || sv.submitted)
        ? h('button', { type: 'button', className: 'btn is-danger is-small', onClick: props.onClear }, 'Clear votes')
        : null,
      h('div', { className: 'seg', role: 'group', 'aria-label': 'How ' + v.name + ' votes' },
        h('button', {
          type: 'button', className: 'seg-btn', 'aria-pressed': v.in_person ? 'false' : 'true',
          disabled: props.locked || !v.has_account, title: v.has_account ? null : 'Needs a site account linked to this character',
          onClick: function () { props.onChange({ in_person: false }); }
        }, 'On the site'),
        h('button', {
          type: 'button', className: 'seg-btn', 'aria-pressed': v.in_person ? 'true' : 'false', disabled: props.locked,
          onClick: function () { props.onChange({ in_person: true }); }
        }, 'In person')),
      h('button', {
        type: 'button', className: 'mf-remove', 'aria-label': 'Remove ' + v.name, disabled: props.locked,
        onClick: props.onRemove
      }, svgIcon(null, CROSS, 2.2)));
  }

  // One look's in-person scores, a row per in-person voter. Moving to another
  // look saves this one; keys 1–5 set the focused score.
  function InPersonDialog(props) {
    var entries = props.entries;
    var idState = useState(props.startId); var id = idState[0], setId = idState[1];
    var draftsState = useState({}); var drafts = draftsState[0], setDrafts = draftsState[1];
    var busyState = useState(false); var busy = busyState[0], setBusy = busyState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];
    var tableRef = useRef(null);

    var at = 0;
    entries.forEach(function (e, i) { if (e.id === id) at = i; });
    var entry = entries[at];
    var prev = entries[at - 1], next = entries[at + 1];

    useEffect(function () {
      var first = tableRef.current && tableRef.current.querySelector('.fc-score[tabindex="0"]');
      if (first) first.focus();
    }, [id]);

    function savedFor(voterId, entryId) { return props.scores[voterId + ':' + entryId] || null; }
    function valueFor(voterId) { return drafts[voterId] || savedFor(voterId, entry.id) || {}; }
    function counts(e) {
      var due = props.voters.filter(function (v) { return !samePlayer(v, e); });
      var got = due.filter(function (v) {
        return complete(e.id === entry.id ? valueFor(v.id) : savedFor(v.id, e.id));
      }).length;
      return { got: got, of: due.length };
    }
    function pick(voterId, key, n) {
      setDrafts(function (p) {
        var nextDrafts = Object.assign({}, p);
        var row = Object.assign({}, p[voterId] || savedFor(voterId, entry.id) || {});
        row[key] = n;
        nextDrafts[voterId] = row;
        return nextDrafts;
      });
    }

    function save() {
      var list = Object.keys(drafts).map(function (voterId) {
        var d = drafts[voterId];
        return {
          voter_id: Number(voterId), entry_id: entry.id,
          creativity: d.creativity == null ? null : d.creativity,
          style: d.style == null ? null : d.style,
          theme: d.theme == null ? null : d.theme
        };
      });
      if (!list.length) return Promise.resolve();
      return api('PUT', '/fashion-contests/' + props.contestId + '/scores', { scores: list }).then(props.onSaved);
    }
    function moveTo(toId) {
      setBusy(true); setErr('');
      save().then(function () { setDrafts({}); setId(toId); setBusy(false); }, function (e) {
        setBusy(false); setErr(e.message || 'The scores could not be saved.');
      });
    }
    function saveAndClose() {
      setBusy(true); setErr('');
      save().then(props.onClose, function (e) { setBusy(false); setErr(e.message || 'The scores could not be saved.'); });
    }

    var here = counts(entry);
    return h(Modal, { className: 'fc-scores-dialog', labelledBy: 'fc-ip-title', onClose: props.onClose },
      h('div', { className: 'fc-dlg-head' },
        h(LookImage, { url: entry.image_url, tone: at, className: 'fc-dlg-thumb tear-half' }),
        h('div', { className: 'mf-row-main' },
          h('p', { className: 't-label' }, 'In-person scores · look ' + (at + 1) + ' of ' + entries.length),
          h('h2', { id: 'fc-ip-title', className: 'form-title' }, entry.name)),
        h('button', { type: 'button', className: 'mf-remove', 'aria-label': 'Close', onClick: props.onClose }, svgIcon(null, CROSS, 2.2))),
      h('nav', { className: 'fc-chips', 'aria-label': 'Looks' },
        entries.map(function (e) {
          var n = counts(e);
          return h('button', {
            key: e.id, type: 'button', className: 'btn is-quiet is-small fc-chip', 'aria-current': e.id === id ? 'true' : 'false', disabled: busy,
            onClick: function () { if (e.id !== id) moveTo(e.id); }
          },
            h('span', { className: dotClass(n.of && n.got >= n.of ? 'done' : n.got ? 'part' : 'none') }, e.name),
            h('span', { className: 'meta-note' }, n.got + '/' + n.of));
        })),
      h('div', { ref: tableRef },
        h('div', { className: 'fc-ip-row is-head t-label', 'aria-hidden': 'true' },
          h('span', null, 'Voter'),
          CRITERIA.map(function (c) { return h('span', { key: c.key }, c.name); }),
          h('span', { className: 'fc-ip-avg' }, 'Avg')),
        props.voters.map(function (v) {
          var who = h('span', { className: 'fc-ip-who' }, h(Avatar, { person: v }), h('span', { className: 'row-name fc-ip-name' }, v.name));
          if (samePlayer(v, entry)) {
            return h('div', { key: v.id, className: 'fc-ip-row is-own' },
              who, h('span', { className: 'meta-note fc-ip-note' }, 'Their own look. Not scored.'));
          }
          var s = valueFor(v.id);
          return h('div', { key: v.id, className: 'fc-ip-row' },
            who,
            CRITERIA.map(function (c) {
              return h(ScoreSeg, {
                key: c.key, className: 'is-' + c.key, compact: true, keys: true, clearable: true, disabled: busy,
                value: s[c.key], label: c.name + ' from ' + v.name,
                onPick: function (n) { pick(v.id, c.key, n); }
              });
            }),
            h('span', { className: 'fc-ip-avg' + (complete(s) ? '' : ' is-muted') }, complete(s) ? meanOf(s).toFixed(1) : '—'));
        }),
        props.voters.length ? null : h('p', { className: 'empty-note mf-none' }, 'No in-person voters')),
      err ? h('p', { className: 'notice-card is-error fc-dlg-error' }, err) : null,
      h('div', { className: 'fc-dlg-foot' },
        prev ? h('button', { type: 'button', className: 'btn is-quiet', disabled: busy, onClick: function () { moveTo(prev.id); } }, '← ' + prev.name) : null,
        h('p', { className: 'meta-note fc-dlg-count' }, here.got + ' of ' + here.of + ' voters in'),
        h('button', { type: 'button', className: 'btn' + (next ? ' is-quiet' : ''), disabled: busy, onClick: saveAndClose }, 'Save and close'),
        next ? h('button', { type: 'button', className: 'btn', disabled: busy, onClick: function () { moveTo(next.id); } }, 'Save, next: ' + next.name + ' →') : null));
  }

  // The fields Save changes sends, to tell whether anything changed.
  function snapshot(f) {
    return JSON.stringify({
      name: f.name, subtitle: f.subtitle, description: f.description, when: f.when, prizes: f.prizes, status: f.status,
      entries: f.entries.map(function (e) { return [e.id, e.member_id, e.look_title, e.image_url]; }),
      voters: f.voters.map(function (v) { return [v.id, v.member_id, v.in_person]; })
    });
  }

  function formFrom(d) {
    var c = d.contest;
    return {
      name: c.name || '', subtitle: c.subtitle || '', description: c.description || '',
      when: toLocalInput(c.starts_at), slug: c.slug, status: c.status,
      prizes: [c.prizes[0] || '', c.prizes[1] || '', c.prizes[2] || ''],
      entries: d.entries.map(function (e) {
        return { key: 'e' + e.id, id: e.id, member_id: e.member_id, main_id: e.main_id, name: e.name, look_title: e.look_title || '', image_url: e.image_url || '' };
      }),
      voters: d.voters.map(function (v) {
        return { key: 'v' + v.id, id: v.id, member_id: v.member_id, main_id: v.main_id, name: v.name, in_person: v.in_person, has_account: v.has_account };
      })
    };
  }

  function blankForm() {
    return { name: '', subtitle: '', description: '', when: '', slug: '', status: 'draft', prizes: ['', '', ''], entries: [], voters: [] };
  }

  // Everything saves with Save changes, except in-person scores (their
  // dialog) and Clear votes.
  function ContestForm(props) {
    var base = props.base, editSlug = props.slug;
    var isEdit = !!editSlug;
    var dataState = useState(null); var data = dataState[0], setData = dataState[1];
    var formState = useState(isEdit ? null : blankForm()); var form = formState[0], setForm = formState[1];
    var initialState = useState(''); var initial = initialState[0], setInitial = initialState[1];
    var goneState = useState(false); var gone = goneState[0], setGone = goneState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];
    var savingState = useState(false); var saving = savingState[0], setSaving = savingState[1];
    var copiedState = useState(false); var copied = copiedState[0], setCopied = copiedState[1];
    var slugEditedState = useState(false); var slugEdited = slugEditedState[0], setSlugEdited = slugEditedState[1];
    var dialogState = useState(null); var dialog = dialogState[0], setDialog = dialogState[1];
    var dragState = useState(null); var dragKey = dragState[0], setDragKey = dragState[1];
    var overState = useState(null); var overKey = overState[0], setOverKey = overState[1];

    // A full contest from the worker: the data, and the form started again
    // from it.
    function take(d) {
      setData(d);
      if (d.contest.can_manage) {
        var f = formFrom(d);
        setForm(f);
        setInitial(snapshot(f));
      }
    }
    function merge(patch) {
      setData(function (d) { return Object.assign({}, d, patch); });
    }
    useEffect(function () {
      if (!isEdit) return;
      api('GET', '/fashion-contests/' + encodeURIComponent(editSlug) + '?edit=1').then(take, function (e) {
        if (e.status === 404) setGone(true);
        else setErr(loadError(e, 'The contest'));
      });
    }, []);

    if (data && !data.contest.can_manage && data.contest.status === 'closed') return h(Notice, { title: 'This Contest Is Closed' });
    if (gone || (data && !data.contest.can_manage)) return h(Notice, { title: 'This Contest Isn’t Available' });
    if (!form) return h(Loading, { err: err });

    var c = isEdit ? data.contest : null;
    var pool = ((isEdit ? data.members : base.members) || []).slice().sort(byName);
    var people = {};
    pool.forEach(function (p) { people[p.id] = p; });
    var savedStatus = c ? c.status : 'draft';
    var locked = form.status === 'closed' && savedStatus === 'closed';
    var dirty = !isEdit || snapshot(form) !== initial;

    function update(patch) { setForm(function (f) { return Object.assign({}, f, patch); }); }
    function setRow(list, key, patch) {
      setForm(function (f) {
        var out = Object.assign({}, f);
        out[list] = f[list].map(function (r) { return r.key === key ? Object.assign({}, r, patch) : r; });
        return out;
      });
    }
    function removeRow(list, key) {
      setForm(function (f) {
        var out = Object.assign({}, f);
        out[list] = f[list].filter(function (r) { return r.key !== key; });
        return out;
      });
    }

    // One character per player: a player already in can only be added as
    // that same character.
    var taken = {};
    form.entries.concat(form.voters).forEach(function (r) { if (r.main_id != null) taken[r.main_id] = r.member_id; });
    function otherCharacter(p) { return taken[p.main_id] != null && taken[p.main_id] !== p.id; }
    var entryIds = {}, voterIds = {};
    form.entries.forEach(function (e) { if (e.member_id != null) entryIds[e.member_id] = true; });
    form.voters.forEach(function (v) { if (v.member_id != null) voterIds[v.member_id] = true; });

    function addEntrant(p) {
      update({ entries: form.entries.concat([{ key: 'n' + p.id, id: null, member_id: p.id, main_id: p.main_id, name: p.name, look_title: '', image_url: '' }]) });
    }
    function newVoter(p) {
      return { key: 'n' + p.id, id: null, member_id: p.id, main_id: p.main_id, name: p.name, image_url: p.image_url, in_person: !p.has_account, has_account: !!p.has_account };
    }
    function addVoter(p) { update({ voters: form.voters.concat([newVoter(p)]) }); }
    function addAllEntrants() {
      var added = form.entries.filter(function (e) { return e.member_id != null && !voterIds[e.member_id] && people[e.member_id]; })
        .map(function (e) { return newVoter(people[e.member_id]); });
      if (added.length) update({ voters: form.voters.concat(added) });
    }

    function startDrag(key) {
      return function (e) {
        try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', key); } catch (_e) { /* old browsers */ }
        // Re-rendering inside dragstart itself makes Chrome cancel the drag.
        setTimeout(function () { setDragKey(key); }, 0);
      };
    }
    function endDrag() { setDragKey(null); setOverKey(null); }
    function dropOn(key) {
      return function (e) {
        e.preventDefault();
        var from = dragKey;
        endDrag();
        if (!from || from === key) return;
        setForm(function (f) {
          var list = f.entries.slice();
          var fromAt = -1, toAt = -1;
          list.forEach(function (r, i) { if (r.key === from) fromAt = i; if (r.key === key) toAt = i; });
          if (fromAt < 0 || toAt < 0) return f;
          var moved = list.splice(fromAt, 1)[0];
          list.splice(toAt, 0, moved);
          return Object.assign({}, f, { entries: list });
        });
      };
    }

    // In-person progress for each saved look.
    var savedVoters = isEdit ? data.voters : [];
    var savedVoterById = {};
    savedVoters.forEach(function (v) { savedVoterById[v.id] = v; });
    var inPersonVoters = savedVoters.filter(function (v) { return v.in_person; });
    var ipScores = {};
    ((isEdit && data.in_person_scores) || []).forEach(function (s) { ipScores[s.voter_id + ':' + s.entry_id] = s; });
    var savedEntries = isEdit ? data.entries : [];
    var savedEntryById = {};
    savedEntries.forEach(function (e) { savedEntryById[e.id] = e; });
    function inPersonFor(e) {
      var due = inPersonVoters.filter(function (v) { return !samePlayer(v, e); });
      var got = due.filter(function (v) { return complete(ipScores[v.id + ':' + e.id]); }).length;
      return { got: got, of: due.length };
    }
    var canScore = isEdit && savedStatus === 'open' && inPersonVoters.length > 0;
    var firstOpen = null;
    if (canScore) {
      savedEntries.forEach(function (e) {
        var n = inPersonFor(e);
        if (firstOpen == null && n.got < n.of) firstOpen = e.id;
      });
    }

    function save() {
      var startsAt = fromLocalInput(form.when);
      var link = slugify(form.slug);
      if (!form.name.trim()) { setErr('Give the contest a name.'); return; }
      if (!startsAt) { setErr('Pick a date and time.'); return; }
      if (!isEdit && !link) { setErr('Give the contest a link.'); return; }
      var body = {
        name: form.name.trim(), subtitle: form.subtitle, description: form.description,
        starts_at: startsAt, prizes: form.prizes,
        entries: form.entries.map(function (e) {
          return e.id
            ? { id: e.id, look_title: e.look_title, image_url: e.image_url }
            : { member_id: e.member_id, look_title: e.look_title, image_url: e.image_url };
        }),
        voters: form.voters.map(function (v) {
          return v.id ? { id: v.id, in_person: v.in_person } : { member_id: v.member_id, in_person: v.in_person };
        })
      };
      if (isEdit) body.status = form.status;
      setSaving(true); setErr('');
      var req = isEdit
        ? api('PATCH', '/fashion-contests/' + c.id + '?edit=1', body).then(take)
        : api('POST', '/fashion-contests', Object.assign({ slug: link }, body)).then(function (d) {
            goTo(editHref((d && d.slug) || link));
          });
      req.then(function () { setSaving(false); }, function (e) {
        setSaving(false); setErr(e.message || 'The contest could not be saved.');
      });
    }

    function copyLink() {
      copyText(contestUrl(form.slug)).then(function () {
        setCopied(true);
        setTimeout(function () { setCopied(false); }, 2000);
      }, function () { setErr('The link could not be copied.'); });
    }

    function field(id, label, input, kind) {
      return h('div', { className: 'mf-field' + (kind ? ' ' + kind : '') }, h('label', { className: 'field-label', htmlFor: id }, label), input);
    }
    function textInput(id, key, placeholder, max) {
      return h('input', {
        id: id, className: 'field is-block', type: 'text', placeholder: placeholder, value: form[key], maxLength: max,
        onChange: function (e) {
          var patch = {};
          patch[key] = e.target.value;
          if (key === 'name' && !isEdit && !slugEdited) patch.slug = slugify(e.target.value);
          update(patch);
        }
      });
    }

    // The link is set when the contest is made and can't change after.
    var linkField = isEdit
      ? h('div', { className: 'mf-field is-link' },
          h('span', { className: 'field-label' }, 'Link'),
          h('div', { className: 'mf-link-text' },
            h('span', { className: 'mf-row-main' }, '…' + window.location.pathname + '?contest=' + form.slug),
            h('button', { type: 'button', className: 'btn is-quiet is-small', onClick: copyLink }, copied ? 'Copied' : 'Copy link')))
      : field('fc-link', 'Link',
          h('div', { className: 'mf-link-input' },
            h('span', { className: 'mf-link-prefix' }, '…?contest='),
            h('input', {
              id: 'fc-link', className: 'field is-block', type: 'text', placeholder: 'contest-name', value: form.slug,
              onChange: function (e) { setSlugEdited(true); update({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-') }); }
            })),
          'is-link');

    var sitesCount = form.voters.filter(function (v) { return !v.in_person; }).length;
    var summary = plural(form.entries.length, 'entry', 'entries') + ' · ' + plural(form.voters.length, 'voter', 'voters');

    return h('div', null,
      h(BackLink),
      h('header', { className: 'app-header' }, h('h1', { className: 'app-title' }, isEdit ? 'Edit Contest' : 'New Contest')),
      h('section', { className: 'card mf-details', 'aria-label': 'Contest details' },
        h('div', { className: 'mf-fields' },
          field('fc-name', 'Name', textInput('fc-name', 'name', 'Contest name', 80)),
          field('fc-subtitle', 'Subtitle', textInput('fc-subtitle', 'subtitle', '', 120)),
          field('fc-when', 'Date and time', h('input', {
            id: 'fc-when', className: 'field is-block', type: 'datetime-local', value: form.when,
            onChange: function (e) { update({ when: e.target.value }); }
          }), 'is-when'),
          linkField),
        h('div', { className: 'mf-fields' },
          field('fc-desc', 'Description', h('textarea', {
            id: 'fc-desc', className: 'field is-block', rows: 2, maxLength: 2000, value: form.description,
            onChange: function (e) { update({ description: e.target.value }); }
          }))),
        h('div', { className: 'mf-fields' },
          [0, 1, 2].map(function (i) {
            var id = 'fc-prize-' + i;
            return h('div', { key: i, className: 'mf-field' },
              h('label', { className: 'field-label', htmlFor: id }, ['1st', '2nd', '3rd'][i] + ' place prize'),
              h('input', {
                id: id, className: 'field is-block', type: 'text', value: form.prizes[i], maxLength: 120,
                onChange: function (e) { var p = form.prizes.slice(); p[i] = e.target.value; update({ prizes: p }); }
              }));
          }))),
      h('div', { className: 'fc-split' },
        h('section', { className: 'mf-panel tear-half', 'aria-labelledby': 'fc-entries-title' },
          h('div', { className: 'mf-panel-head is-baseline' },
            h('h2', { id: 'fc-entries-title', className: 'mf-panel-title' }, 'Entries'),
            h('span', { className: 'meta-note' }, plural(form.entries.length, 'look', 'looks'))),
          h('div', { className: 'mf-panel-body' },
            h(PeoplePicker, {
              placeholder: 'Add an entrant from the FC list', pool: pool, disabled: locked,
              skip: function (p) { return entryIds[p.id] || otherCharacter(p); },
              onAdd: addEntrant
            })),
          form.entries.map(function (e, i) {
            var saved = e.id ? savedEntryById[e.id] : null;
            var status = null, scores = null;
            if (saved && inPersonVoters.length) {
              var n = inPersonFor(saved);
              status = n.got >= n.of
                ? { state: 'done', text: 'In-person scores in' }
                : n.got ? { state: 'part', text: 'In person ' + n.got + ' of ' + n.of } : { state: 'none', text: 'No in-person scores yet' };
              if (canScore) {
                scores = {
                  label: n.got >= n.of ? 'Edit scores' : 'Enter scores', next: e.id === firstOpen,
                  onOpen: function () { setDialog({ type: 'scores', entryId: e.id }); }
                };
              }
            }
            return h(EntryRow, {
              key: e.key, entry: e, index: i, slug: form.slug || slugify(form.name), status: status, scores: scores, locked: locked,
              over: overKey === e.key && dragKey && dragKey !== e.key, dragging: dragKey === e.key,
              onDragStart: startDrag(e.key), onDragEnd: endDrag,
              onDragOver: function (ev) { if (!dragKey) return; ev.preventDefault(); if (overKey !== e.key) setOverKey(e.key); },
              onDrop: dropOn(e.key),
              onChange: function (patch) { setRow('entries', e.key, patch); },
              onRemove: function () { removeRow('entries', e.key); }
            });
          }),
          form.entries.length ? null : h('p', { className: 'empty-note mf-none' }, 'No entries yet')),
        h('section', { className: 'mf-panel tear-half', 'aria-labelledby': 'fc-voters-title' },
          h('div', { className: 'mf-panel-head is-baseline' },
            h('h2', { id: 'fc-voters-title', className: 'mf-panel-title' }, 'Voters'),
            h('span', { className: 'meta-note' }, sitesCount + ' on the site · ' + (form.voters.length - sitesCount) + ' in person')),
          h('div', { className: 'mf-panel-body fc-picker-row' },
            h(PeoplePicker, {
              placeholder: 'Add a voter from the FC list', pool: pool, disabled: locked,
              skip: function (p) { return voterIds[p.id] || otherCharacter(p); },
              onAdd: addVoter
            }),
            h('button', {
              type: 'button', className: 'btn is-quiet', onClick: addAllEntrants,
              disabled: locked || !form.entries.some(function (e) { return e.member_id != null && !voterIds[e.member_id]; })
            }, 'Add all entrants')),
          form.voters.map(function (v) {
            return h(VoterRow, {
              key: v.key, voter: Object.assign({}, v, { image_url: v.image_url || (people[v.member_id] || {}).image_url }),
              saved: v.id ? savedVoterById[v.id] : null, entrant: !!entryIds[v.member_id], locked: locked,
              onChange: function (patch) { setRow('voters', v.key, patch); },
              onRemove: function () { removeRow('voters', v.key); },
              onClear: c && c.can_clear && v.id ? function () { setDialog({ type: 'clear', voter: savedVoterById[v.id] }); } : null
            });
          }),
          form.voters.length ? null : h('p', { className: 'empty-note mf-none' }, 'No voters yet'))),
      err ? h('p', { className: 'notice-card is-error' }, err) : null,
      h('div', { className: 'mf-bar' },
        isEdit
          ? h('div', { className: 'seg', role: 'group', 'aria-label': 'Voting' },
              STATUSES.map(function (s) {
                return h('button', {
                  key: s.key, type: 'button', className: 'seg-btn', 'aria-pressed': form.status === s.key ? 'true' : 'false',
                  onClick: function () { update({ status: s.key }); }
                }, s.name);
              }))
          : null,
        h('p', { className: 'mf-bar-summary' }, summary),
        isEdit ? h('button', { type: 'button', className: 'btn is-danger', onClick: function () { setDialog({ type: 'delete' }); } }, 'Delete') : null,
        isEdit ? h('a', { className: 'btn is-quiet', href: resultsHref(c.slug) }, 'Results so far') : null,
        h('button', { type: 'button', className: 'btn', onClick: save, disabled: saving || !dirty }, isEdit ? 'Save changes' : 'Save and get link')),
      dialog && dialog.type === 'scores'
        ? h(InPersonDialog, {
            contestId: c.id, entries: savedEntries, voters: inPersonVoters.map(function (v) {
              return Object.assign({}, v, { image_url: (people[v.member_id] || {}).image_url });
            }),
            scores: ipScores, startId: dialog.entryId, onSaved: merge,
            onClose: function () { setDialog(null); }
          })
        : null,
      dialog && dialog.type === 'delete'
        ? h(ConfirmDialog, {
            title: 'Delete ' + c.name + '?',
            text: 'This action is final.',
            confirmLabel: 'Delete contest',
            onClose: function () { setDialog(null); },
            onConfirm: function () { return api('DELETE', '/fashion-contests/' + c.id).then(function () { goTo(LIST_HREF); }); }
          })
        : null,
      dialog && dialog.type === 'clear'
        ? h(ConfirmDialog, {
            title: 'Clear ' + dialog.voter.name + '’s Votes?',
            text: 'This action is final.',
            confirmLabel: 'Clear votes',
            onClose: function () { setDialog(null); },
            onConfirm: function () {
              return api('DELETE', '/fashion-contests/' + c.id + '/voters/' + dialog.voter.id + '/scores')
                .then(function (d) { merge(d); setDialog(null); });
            }
          })
        : null);
  }

  // ── The page ───────────────────────────────────────────────────────────────

  function normalizeBase(d) {
    d = d || {};
    var can = d.can || {};
    return {
      can: { create: !!can.create, manage: !!can.manage },
      members: d.members || [],
      contests: d.contests || [],
      past: d.past || []
    };
  }

  function FashionContests() {
    var params = new URLSearchParams(window.location.search);
    var plan = params.has('plan');
    var needsBase = !(params.has('contest') || params.has('edit') || params.has('results'));
    var baseState = useState(null); var base = baseState[0], setBase = baseState[1];
    var errState = useState(''); var err = errState[0], setErr = errState[1];
    var signedIn = !!PVSession.get();

    useEffect(function () {
      if (!signedIn) { PVSession.redirectToLogin(); return; }
      if (!needsBase) return;
      api('GET', '/fashion-contests' + (plan ? '?members=1' : '')).then(function (d) {
        setBase(normalizeBase(d)); setErr('');
      }, function (e) {
        if (plan && e.status === 403) setBase(normalizeBase({}));
        else setErr(loadError(e, 'Fashion Contests'));
      });
    }, []);

    if (!signedIn) return null;
    if (params.has('contest')) return h(ContestPage, { slug: params.get('contest') });
    if (params.has('edit')) return h(ContestForm, { slug: params.get('edit') });
    if (params.has('results')) return h(ResultsPage, { slug: params.get('results') });
    if (!base && !plan) return h('div', null, h(LandingHero), h(Loading, { err: err, back: false }));
    if (!base) return h(Loading, { err: err });
    if (plan) {
      return base.can.create
        ? h(ContestForm, { base: base, slug: null })
        : h(Notice, { title: 'You Can’t Make Contests' });
    }
    return h(Landing, { base: base });
  }

  window.FashionContests = FashionContests;
})();
