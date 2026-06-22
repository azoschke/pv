// ============================================================================
//  PVAdminDashboard — overview landing for officers / admins.
//
//  Aggregates data that already lives behind existing endpoints
//  (/members, /applications, /jobs) entirely client-side — no dedicated
//  worker endpoint. Renders:
//    - an Eorzean date in the header (same convention as the medical forms)
//    - four stat tiles (FC members, new applications, interviews pending,
//      open positions)
//    - a cross-feature "Needs Attention" feed
//
//  "Open →" and the stat tiles call props.onNavigate(sectionId) to switch the
//  portal to the relevant sidebar section.
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;

  // ── Eorzean calendar ──────────────────────────────────────────────────────
  // Ported from vanguard-medical/med-forms.js so the portal date matches the
  // convention used across the medical forms. Months map 1:1 to moons; certain
  // real-world days split into two Eorzean "suns" — we take the earlier sun.
  var SPLIT_DAYS = {
    1: [28], 2: [7, 14, 21], 3: [28], 4: [7, 28], 5: [29], 6: [7, 28],
    7: [28], 8: [28], 9: [7, 28], 10: [28], 11: [7, 28], 12: [28]
  };
  function ordinal(n) {
    var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
  function eorzeanSun(month, day) {
    var splits = SPLIT_DAYS[month] || [];
    var sun = day;
    for (var i = 0; i < splits.length; i++) {
      if (day > splits[i]) sun++;
    }
    return sun;
  }
  function eorzeanTodayLabel() {
    var now = new Date();
    var mo = now.getMonth() + 1, d = now.getDate();
    var sun = eorzeanSun(mo, d);
    if (sun < 1 || sun > 32) return '';
    var pairNum = Math.ceil(mo / 2);
    var type = (mo % 2 === 1) ? 'Astral' : 'Umbral';
    return ordinal(sun) + ' Sun · ' + ordinal(pairNum) + ' ' + type + ' Moon';
  }

  // ── Component ─────────────────────────────────────────────────────────────
  function Dashboard(props) {
    var onNavigate = props.onNavigate || function () {};

    var st = useState({ loading: true, error: '', members: [], apps: [], jobs: [], quests: [] });
    var state = st[0], setState = st[1];

    useEffect(function () {
      var cancelled = false;
      function getList(path) {
        return PVAdminAPI.request('GET', path, undefined, true)
          .then(function (d) { return Array.isArray(d) ? d : []; })
          .catch(function () { return null; }); // null marks a failed call
      }
      Promise.all([getList('/members'), getList('/applications'), getList('/jobs'), getList('/quests/admin')])
        .then(function (res) {
          if (cancelled) return;
          if (res[0] === null && res[1] === null && res[2] === null && res[3] === null) {
            setState({ loading: false, error: 'Could not load dashboard data.', members: [], apps: [], jobs: [], quests: [] });
            return;
          }
          setState({
            loading: false, error: '',
            members: res[0] || [], apps: res[1] || [], jobs: res[2] || [], quests: res[3] || []
          });
        });
      return function () { cancelled = true; };
    }, []);

    var dateLabel = eorzeanTodayLabel();

    function header() {
      return h('div', { className: 'portal-section-header dashboard-header' },
        h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'space_dashboard'),
        h('h1', null, 'Dashboard'),
        dateLabel ? h('span', { className: 'dashboard-date' }, dateLabel) : null
      );
    }

    if (state.loading) {
      return h('div', null, header(),
        h('p', { className: 'dash-loading' }, 'Loading…'));
    }

    var members = state.members, apps = state.apps, quests = state.quests;
    var newApps       = apps.filter(function (a) { return a.stage === 'new'; });
    var scheduledApps = apps.filter(function (a) { return a.stage === 'scheduled'; });
    // Bounty board items awaiting officer review: member-submitted quests
    // (status 'pending') and member-proposed edits to listed quests.
    var pendingQuests = quests.filter(function (q) { return q.status === 'pending'; });
    var pendingEdits  = [];
    quests.forEach(function (q) {
      (q.pending_edits || []).forEach(function (e) {
        pendingEdits.push({ quest: q, edit: e });
      });
    });
    var bountyReviewCount = pendingQuests.length + pendingEdits.length;
    // Member attention buckets — kept in sync with members.js needsAttention.
    var icPending     = members.filter(function (m) { return m.interview === 'Not Started'; });
    var icScheduled   = members.filter(function (m) { return m.interview === 'Scheduled'; });
    var inactive      = members.filter(function (m) { return m.activity === 'Inactive' && !m.talked_to; });

    function statTile(num, label, target, alert, params) {
      return h('button', {
        type: 'button',
        className: 'dash-stat' + (alert ? ' is-alert' : ''),
        onClick: function () { onNavigate(target, params || null); }
      },
        h('span', { className: 'dash-stat-num' }, String(num)),
        h('span', { className: 'dash-stat-label' }, label)
      );
    }

    // Cross-feature attention feed, ordered: applications → job interviews →
    // IC interviews → inactive members.
    var attention = [];
    newApps.forEach(function (a) {
      var name = a.member_name || a.name || 'Unknown';
      attention.push({
        key: 'app-' + a.id, tag: 'Application', pillCls: 'is-red-fill',
        name: name,
        desc: 'applied for ' + (a.job_title || 'a position'),
        source: 'Job Board', target: 'jobs',
        params: { view: 'applications', stage: 'new', search: name }
      });
    });
    scheduledApps.forEach(function (a) {
      var name = a.member_name || a.name || 'Unknown';
      attention.push({
        key: 'sched-' + a.id, tag: 'Job Interview', pillCls: 'is-gold',
        name: name,
        desc: 'Job interview pending',
        source: 'Job Board', target: 'jobs',
        params: { view: 'applications', stage: 'scheduled', search: name }
      });
    });
    pendingQuests.forEach(function (q) {
      attention.push({
        key: 'quest-' + q.id, tag: 'Bounty Quest', pillCls: 'is-gold',
        name: q.submitted_by_name || 'A member',
        desc: 'submitted “' + (q.title || 'a quest') + '” for review',
        source: 'Bounty Board', target: 'bounties'
      });
    });
    pendingEdits.forEach(function (item) {
      attention.push({
        key: 'questedit-' + item.edit.id, tag: 'Bounty Edit', pillCls: 'is-gold',
        name: item.edit.submitted_by_name || 'A member',
        desc: 'proposed an edit to “' + (item.quest.title || 'a quest') + '”',
        source: 'Bounty Board', target: 'bounties'
      });
    });
    icPending.forEach(function (m) {
      attention.push({
        key: 'ic-' + m.id, tag: 'IC Interview', pillCls: 'is-gold',
        name: m.name || 'Unknown',
        desc: 'IC interview not started',
        source: 'FC Members', target: 'members',
        params: { search: m.name }
      });
    });
    icScheduled.forEach(function (m) {
      attention.push({
        key: 'icsched-' + m.id, tag: 'IC Interview', pillCls: 'is-gold',
        name: m.name || 'Unknown',
        desc: 'IC interview scheduled',
        source: 'FC Members', target: 'members',
        params: { search: m.name }
      });
    });
    inactive.forEach(function (m) {
      attention.push({
        key: 'inactive-' + m.id, tag: 'Inactive', pillCls: 'is-red',
        name: m.name || 'Unknown',
        desc: 'marked inactive',
        source: 'FC Members', target: 'members',
        params: { search: m.name }
      });
    });

    return h('div', null,
      header(),
      state.error ? h('p', { className: 'portal-flash error' }, state.error) : null,

      // Stat tiles grouped by stage, with FC Members / Open Positions as
      // smaller reference tiles on their own row at the end.
      h('div', { className: 'dash-stat-groups' },
        h('div', { className: 'dash-stat-section' },
          h('p', { className: 'dash-stat-heading' }, 'Pending'),
          h('div', { className: 'dash-stats' },
            statTile(icPending.length, 'IC Interviews', 'members', icPending.length > 0, { interview: 'Not Started' }),
            statTile(newApps.length, 'Job Applications', 'jobs', newApps.length > 0,
              { view: 'applications', stage: 'new' }),
            statTile(bountyReviewCount, 'Bounty Quests', 'bounties', bountyReviewCount > 0)
          )
        ),
        h('div', { className: 'dash-stat-section' },
          h('p', { className: 'dash-stat-heading' }, 'Scheduled'),
          h('div', { className: 'dash-stats' },
            statTile(icScheduled.length, 'IC Interviews', 'members', icScheduled.length > 0, { interview: 'Scheduled' }),
            statTile(scheduledApps.length, 'Job Interviews', 'jobs', scheduledApps.length > 0,
              { view: 'applications', stage: 'scheduled' })
          )
        )
      ),

      // Needs Attention
      h('div', { className: 'portal-card dash-attention' },
        h('div', { className: 'dash-attention-head' },
          h('p', { className: 'portal-card-title' }, 'Needs Attention'),
          h('span', { className: 'dash-attention-meta' },
            attention.length + (attention.length === 1 ? ' item' : ' items')
          )
        ),
        attention.length === 0
          ? h('p', { className: 'dash-attention-empty' }, 'Nothing needs attention right now.')
          : h('div', { className: 'dash-attention-list' },
              attention.map(function (it) {
                return h('div', { className: 'dash-attention-row', key: it.key },
                  h('span', { className: 'portal-pill ' + it.pillCls }, it.tag),
                  h('span', { className: 'dash-attention-text' },
                    h('strong', null, it.name), ' ',
                    h('span', null, it.desc), ' ',
                    h('em', { className: 'dash-attention-source' }, it.source)
                  ),
                  h('button', {
                    type: 'button',
                    className: 'portal-btn is-ghost is-small dash-open',
                    onClick: function () {
                      onNavigate(it.target, it.params || null);
                    }
                  },
                    h('span', null, 'Open'),
                    h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'arrow_forward')
                  )
                );
              })
            )
      )
    );
  }

  window.PVAdminDashboard = Dashboard;
})();
