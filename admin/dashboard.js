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

    var st = useState({ loading: true, error: '', members: [], apps: [], jobs: [] });
    var state = st[0], setState = st[1];

    useEffect(function () {
      var cancelled = false;
      function getList(path) {
        return PVAdminAPI.request('GET', path, undefined, true)
          .then(function (d) { return Array.isArray(d) ? d : []; })
          .catch(function () { return null; }); // null marks a failed call
      }
      Promise.all([getList('/members'), getList('/applications'), getList('/jobs')])
        .then(function (res) {
          if (cancelled) return;
          if (res[0] === null && res[1] === null && res[2] === null) {
            setState({ loading: false, error: 'Could not load dashboard data.', members: [], apps: [], jobs: [] });
            return;
          }
          setState({
            loading: false, error: '',
            members: res[0] || [], apps: res[1] || [], jobs: res[2] || []
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

    var members = state.members, apps = state.apps, jobs = state.jobs;
    var newApps       = apps.filter(function (a) { return a.stage === 'new'; });
    var scheduledApps = apps.filter(function (a) { return a.stage === 'scheduled'; });
    var icPending     = members.filter(function (m) { return m.interview === 'Not Started'; });
    var inactive      = members.filter(function (m) { return m.activity === 'Inactive'; });
    var openJobs      = jobs.filter(function (j) { return j.status === 'open'; });

    var stats = [
      { num: members.length,       label: 'FC Members',                  target: 'members' },
      { num: icPending.length,     label: 'IC Interviews Pending',       target: 'members', alert: icPending.length > 0 },
      { num: newApps.length,       label: 'New Job Applications Pending', target: 'jobs',    alert: newApps.length > 0 },
      { num: scheduledApps.length, label: 'Job Interviews Pending',      target: 'jobs',    alert: scheduledApps.length > 0 },
      { num: openJobs.length,      label: 'Open Positions',              target: 'jobs' }
    ];

    // Cross-feature attention feed, ordered: applications → job interviews →
    // IC interviews → inactive members.
    var attention = [];
    newApps.forEach(function (a) {
      attention.push({
        key: 'app-' + a.id, tag: 'Application', tagCls: 'is-application',
        name: a.member_name || a.name || 'Unknown',
        desc: 'applied for ' + (a.job_title || 'a position'),
        source: 'Job Board', target: 'jobs'
      });
    });
    scheduledApps.forEach(function (a) {
      attention.push({
        key: 'sched-' + a.id, tag: 'Job Interview', tagCls: 'is-interview',
        name: a.member_name || a.name || 'Unknown',
        desc: 'Job interview pending',
        source: 'Job Board', target: 'jobs'
      });
    });
    icPending.forEach(function (m) {
      attention.push({
        key: 'ic-' + m.id, tag: 'IC Interview', tagCls: 'is-interview',
        name: m.name || 'Unknown',
        desc: 'IC interview not started',
        source: 'FC Members', target: 'members'
      });
    });
    inactive.forEach(function (m) {
      attention.push({
        key: 'inactive-' + m.id, tag: 'Inactive', tagCls: 'is-inactive',
        name: m.name || 'Unknown',
        desc: 'marked inactive',
        source: 'FC Members', target: 'members'
      });
    });

    return h('div', null,
      header(),
      state.error ? h('p', { className: 'portal-flash error' }, state.error) : null,

      // Stat tiles
      h('div', { className: 'dash-stats' },
        stats.map(function (s) {
          return h('button', {
            key: s.label,
            type: 'button',
            className: 'dash-stat' + (s.alert ? ' is-alert' : ''),
            onClick: function () { onNavigate(s.target); }
          },
            h('span', { className: 'dash-stat-num' }, String(s.num)),
            h('span', { className: 'dash-stat-label' }, s.label)
          );
        })
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
                  h('span', { className: 'dash-tag ' + it.tagCls }, it.tag.toUpperCase()),
                  h('span', { className: 'dash-attention-text' },
                    h('strong', null, it.name), ' ',
                    h('span', null, it.desc), ' ',
                    h('em', { className: 'dash-attention-source' }, it.source)
                  ),
                  h('button', {
                    type: 'button',
                    className: 'portal-btn is-ghost is-small dash-open',
                    onClick: function () { onNavigate(it.target); }
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
