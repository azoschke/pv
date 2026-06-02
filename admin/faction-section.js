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

  // Mirrors members.js INTERVIEWS, minus "NA - No RP" which never applies
  // to a roleplay faction roster.
  var INTERVIEWS = ['Not Started', 'Scheduled', 'Completed', 'No Data'];

  // Display order for the Faction tag list — mirrors members.js FACTIONS.
  var FACTION_ORDER = [
    'Pirate', 'Mercenary', 'Medical', 'House Staff',
    'Contractor', 'NA - No RP', 'No Data'
  ];
  function orderedFactions(arr) {
    var seen = {};
    arr.forEach(function (f) { if (f) seen[f] = true; });
    var ordered = FACTION_ORDER.filter(function (f) { return seen[f]; });
    var unknown = Object.keys(seen).filter(function (f) {
      return FACTION_ORDER.indexOf(f) === -1;
    });
    return ordered.concat(unknown);
  }

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

    var nameFilterState = useState('');
    var nameFilter = nameFilterState[0], setNameFilter = nameFilterState[1];
    var interviewFilterState = useState('');
    var interviewFilter = interviewFilterState[0], setInterviewFilter = interviewFilterState[1];

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

    var q = nameFilter.trim().toLowerCase();
    var filtered = members.filter(function (m) {
      if (q && (!m.name || m.name.toLowerCase().indexOf(q) === -1)) return false;
      if (interviewFilter && m.interview !== interviewFilter) return false;
      return true;
    });
    var anyFilterActive = !!(nameFilter || interviewFilter);

    return h('div', { className: 'portal-card' },
      h('div', { className: 'portal-card-header' },
        h('h2', { className: 'portal-card-title' }, label + ' Roster'),
        h('div', { className: 'portal-card-actions' },
          h('input', {
            type: 'search',
            className: 'portal-search',
            placeholder: 'Search name…',
            value: nameFilter,
            onChange: function (e) { setNameFilter(e.target.value); }
          }),
          members.length
            ? h('span', { style: { color: 'var(--text-secondary)', fontSize: '0.9rem' } },
                filtered.length + ' of ' + members.length)
            : null
        )
      ),
      h('div', { className: 'portal-filter-row' },
        h('select', {
          className: 'portal-filter-select',
          value: interviewFilter,
          onChange: function (e) { setInterviewFilter(e.target.value); }
        },
          h('option', { value: '' }, 'All Interviews'),
          INTERVIEWS.map(function (v) { return h('option', { key: v, value: v }, v); })
        ),
        anyFilterActive ? h('button', {
          type: 'button',
          className: 'portal-btn is-ghost is-small',
          onClick: function () { setNameFilter(''); setInterviewFilter(''); }
        }, 'Clear filters') : null
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
                    h('th', null, 'Faction'),
                    h('th', null, 'Interview')
                  )
                ),
                h('tbody', null,
                  filtered.length
                    ? filtered.map(function (m) {
                        var factions = orderedFactions(parseFactions(m.faction));
                        return h('tr', { key: m.id },
                          h('td', null, m.name),
                          h('td', null,
                            m.ic_rank
                              ? m.ic_rank
                              : h('span', { style: { color: 'var(--text-secondary)' } }, '—')
                          ),
                          h('td', null,
                            factions.length
                              ? h('div', { className: 'portal-faction-tags' },
                                  factions.map(function (f) {
                                    return h('span', { key: f, className: 'portal-faction-tag' }, f);
                                  })
                                )
                              : h('span', { style: { color: 'var(--text-secondary)' } }, '—')
                          ),
                          h('td', null,
                            m.interview
                              ? m.interview
                              : h('span', { style: { color: 'var(--text-secondary)' } }, '—')
                          )
                        );
                      })
                    : h('tr', null,
                        h('td', {
                          colSpan: 4,
                          style: { color: 'var(--text-secondary)', textAlign: 'center', padding: '1.5rem' }
                        }, 'No members match your filter.')
                      )
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
    var division = props.division;
    var label = props.label || faction;

    return h('div', null,
      h(window.PVAdminBulletinBoard, {
        channel: channel,
        heading: label + ' Messages',
        composeTitle: 'New ' + label + ' Message',
        showDiscord: false
      }),
      (division && window.PVAdminApplicationsCard)
        ? h(window.PVAdminApplicationsCard, { division: division, label: label })
        : null,
      h(RosterCard, { faction: faction, label: label })
    );
  }

  window.PVAdminFactionSection = FactionSection;
})();
