// ============================================================================
//  PVAdminFactionSection — Mercenary / Pirate Ops portal section
//
//  Renders two stacked cards:
//    1. Channel-scoped bulletin board (via PVAdminBulletinBoard)
//    2. Read-only faction roster pulled from /members, filtered client-side
//       to rows whose faction list includes the section's faction. Only the
//       member name and IC rank are shown.
//
//  Props:
//    faction  e.g. "Pirate" | "Mercenary"  (must match a value the FC roster
//                                           stores in fc_members.faction)
//    channel  e.g. "pirate" | "mercenary"  (announcement channel slug)
//    label    e.g. "Pirate Ops"            (used in headings + compose title)
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;

  // OOC rank order — kept in sync with members.js so faction rosters sort
  // in the same authoritative order as the main directory.
  var OOC_RANKS = [
    'Phoenix Captain',
    'Quartermaster',
    'Phoenix Council',
    'Phoenix Guard',
    'Embers',
    'Firesworn',
    'Vanguard',
    'Lieutenant',
    'Operative',
    'Corsair',
    'Buccaneer',
    'Crewmate',
    'Deckhand',
    'Cinders',
    'LOA'
  ];
  var OOC_RANK_INDEX = (function () {
    var m = {};
    OOC_RANKS.forEach(function (r, i) { m[r] = i; });
    return m;
  })();

  function parseFactions(value) {
    if (!value) return [];
    return String(value)
      .split(',')
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; });
  }

  function compareMembers(a, b) {
    var ra = OOC_RANK_INDEX[a.ooc_rank];
    var rb = OOC_RANK_INDEX[b.ooc_rank];
    if (ra == null) ra = OOC_RANKS.length;
    if (rb == null) rb = OOC_RANKS.length;
    if (ra !== rb) return ra - rb;
    var na = (a.name || '').toLowerCase();
    var nb = (b.name || '').toLowerCase();
    return na < nb ? -1 : na > nb ? 1 : 0;
  }

  function RosterCard(props) {
    var faction = props.faction;
    var label = props.label;

    var membersState = useState([]);
    var members = membersState[0], setMembers = membersState[1];
    var loadingState = useState(true);
    var loading = loadingState[0], setLoading = loadingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];

    useEffect(function () {
      var cancelled = false;
      (async function () {
        try {
          var data = await PVAdminAPI.request('GET', '/members', undefined, true);
          if (cancelled) return;
          var rows = Array.isArray(data) ? data : [];
          var matches = rows.filter(function (m) {
            return parseFactions(m.faction).indexOf(faction) !== -1;
          });
          setMembers(matches.sort(compareMembers));
        } catch (e) {
          if (!cancelled) setErr(e.message || 'Failed to load roster.');
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return function () { cancelled = true; };
    }, [faction]);

    return h('div', { className: 'portal-card' },
      h('div', { className: 'portal-card-header' },
        h('h2', { className: 'portal-card-title' }, label + ' Roster'),
        members.length
          ? h('span', { style: { color: 'var(--text-secondary)', fontSize: '0.9rem' } },
              members.length + (members.length === 1 ? ' member' : ' members'))
          : null
      ),
      err ? h('div', { className: 'portal-flash error' }, err) : null,
      loading
        ? h('p', { style: { color: 'var(--text-secondary)' } }, 'Loading roster…')
        : members.length
          ? h('div', { className: 'portal-table-wrap' },
              h('table', { className: 'portal-table' },
                h('thead', null,
                  h('tr', null,
                    h('th', null, 'Name'),
                    h('th', null, 'IC Rank'),
                    h('th', null, 'Interview')
                  )
                ),
                h('tbody', null,
                  members.map(function (m) {
                    return h('tr', { key: m.id },
                      h('td', null, m.name),
                      h('td', null,
                        m.ic_rank
                          ? m.ic_rank
                          : h('span', { style: { color: 'var(--text-secondary)' } }, '—')
                      ),
                      h('td', null,
                        m.interview
                          ? m.interview
                          : h('span', { style: { color: 'var(--text-secondary)' } }, '—')
                      )
                    );
                  })
                )
              )
            )
          : h('p', { style: { color: 'var(--text-secondary)' } },
              'No ' + faction + ' faction members on the roster yet.')
    );
  }

  function FactionSection(props) {
    var faction = props.faction;
    var channel = props.channel;
    var label = props.label || faction;

    return h('div', null,
      h(window.PVAdminBulletinBoard, {
        channel: channel,
        heading: label + ' Messages',
        composeTitle: 'New ' + label + ' Message',
        showDiscord: false
      }),
      h(RosterCard, { faction: faction, label: label })
    );
  }

  window.PVAdminFactionSection = FactionSection;
})();
