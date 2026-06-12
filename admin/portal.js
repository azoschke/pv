// ============================================================================
//  PVAdminPortal — top-level shell for /pv/admin/portal.html
//
//  Responsibilities:
//    - Load /me (refreshes roles on mount in case they changed server-side)
//    - Render the ink-dark sidebar (logo, brand, user, nav, theme, logout)
//    - On mobile/tablet the sidebar collapses to a slide-in drawer opened by
//      a top bar with a hamburger button (mirrors the main site nav)
//    - Gate sidebar items by role via ROLE_ACCESS
//    - Route to the active section's component
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;

  // --------- Role + section metadata ----------
  // NAV_GROUPS is the source of truth for sidebar layout: ordered groups, each
  // with a small-caps header and its nav items. Headers are role-gated — a
  // group whose items are all hidden for the current role renders nothing.
  var NAV_GROUPS = [
    { title: 'Overview', items: [
      { id: 'dashboard',        label: 'Dashboard',          icon: 'space_dashboard' }
    ] },
    { title: 'Personal', items: [
      { id: 'my-profile',       label: 'My Profile',         icon: 'badge' },
      { id: 'my-applications',  label: 'My Applications',    icon: 'assignment' }
    ] },
    { title: 'People', items: [
      { id: 'members',          label: 'FC Members',         icon: 'group' },
      { id: 'member-profiles',  label: 'Member Profiles',    icon: 'contact_page' },
      { id: 'medical',          label: 'Medical Records',    icon: 'folder_shared' }
    ] },
    { title: 'Factions', items: [
      { id: 'medical-division', label: 'Medical',            icon: 'medical_services' },
      { id: 'mercenary',        label: 'Mercenary',          icon: 'security' },
      { id: 'pirate',           label: 'Pirate',             icon: 'sailing' },
      { id: 'house-staff',      label: 'House Staff',        icon: 'home_work' }
    ] },
    { title: 'Operations', items: [
      { id: 'venues',           label: 'Venues',             icon: 'storefront' },
      { id: 'jobs',             label: 'Job Board',          icon: 'work' },
      { id: 'bounties',         label: 'Bounty Board',       icon: 'flag' }
    ] },
    { title: 'Tools / More', items: [
      { id: 'cosmic',           label: 'Cosmic Exploration', icon: 'rocket_launch' },
      { id: 'announcements',    label: 'Announcements',      icon: 'campaign' },
      { id: 'admin',            label: 'Admin Settings',     icon: 'settings' }
    ] }
  ];

  // Flat list derived from NAV_GROUPS for lookups (active section, defaults).
  var SECTIONS = NAV_GROUPS.reduce(function (acc, g) {
    return acc.concat(g.items);
  }, []);

  // '*' means any logged-in account, regardless of roles — used for My
  // Profile so plain members (or accounts with no roles yet) get a home.
  var ROLE_ACCESS = {
    dashboard:        ['officer', 'admin'],
    'my-profile':     '*',
    'my-applications': '*',
    members:          ['officer', 'admin'],
    'member-profiles': ['officer', 'admin'],
    medical:          ['medical', 'admin'],
    'medical-division': ['officer', 'admin'],
    mercenary:        ['mercenary', 'admin'],
    pirate:           ['pirate', 'admin'],
    'house-staff':    ['officer', 'admin'],
    venues:           ['officer', 'admin'],
    jobs:             ['officer', 'admin'],
    bounties:         ['officer', 'admin'],
    cosmic:           ['officer', 'admin'],
    announcements:    ['medical', 'mercenary', 'pirate', 'officer', 'admin'],
    admin:            ['admin']
  };

  function canAccess(sectionId, roles) {
    if (ROLE_ACCESS[sectionId] === '*') return true;
    if (!roles) return false;
    if (roles.indexOf('admin') !== -1) return true;
    var allowed = ROLE_ACCESS[sectionId] || [];
    for (var i = 0; i < allowed.length; i++) {
      if (roles.indexOf(allowed[i]) !== -1) return true;
    }
    return false;
  }

  function defaultSectionFor(roles) {
    for (var i = 0; i < SECTIONS.length; i++) {
      if (canAccess(SECTIONS[i].id, roles)) return SECTIONS[i].id;
    }
    return null;
  }

  // --------- Theme toggle (mirrors js/nav.js behaviour) ----------
  var THEME_KEY = 'crafting-tools-theme';
  function getTheme() {
    return document.documentElement.getAttribute('data-theme') || 'light';
  }
  function setTheme(t) {
    if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else              document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem(THEME_KEY, t); } catch (_e) {}
  }

  // --------- Sidebar body (shared between desktop rail + mobile drawer) ----
  function SidebarBody(props) {
    var session = props.session;
    var activeSection = props.activeSection;
    var onSelect = props.onSelect;
    var onToggleTheme = props.onToggleTheme;
    var onLogout = props.onLogout;
    var theme = props.theme;
    var roles = (session && session.roles) || [];

    // Build groups with only the items this role may see; drop empty groups so
    // the section header never shows above an empty list.
    var visibleGroups = NAV_GROUPS.map(function (g) {
      return {
        title: g.title,
        items: g.items.filter(function (s) { return canAccess(s.id, roles); })
      };
    }).filter(function (g) { return g.items.length > 0; });

    return h('div', { className: 'portal-sidebar-body' },
      h('a', { href: '/pv/index.html', className: 'sidebar-brand', 'aria-label': 'Phoenix Vanguard' },
        h('span', { className: 'site-logo sidebar-logo', role: 'img', 'aria-label': 'Phoenix Vanguard' }),
        h('span', { className: 'sidebar-brand-text' },
          h('span', { className: 'sidebar-brand-title' }, 'Phoenix Vanguard'),
          h('span', { className: 'sidebar-brand-subtitle' }, 'Management Portal')
        )
      ),
      h('div', { className: 'sidebar-user' },
        h('p', { className: 'sidebar-user-name' },
          (session && (session.display_name || session.username)) || 'Unknown'
        ),
        h('p', { className: 'sidebar-user-roles' },
          roles.length ? roles.join(' · ') : 'no roles assigned'
        )
      ),
      h('nav', { className: 'sidebar-nav' },
        visibleGroups.map(function (g) {
          return h('div', { className: 'sidebar-nav-group', key: g.title },
            h('p', { className: 'sidebar-nav-group-title' }, g.title),
            g.items.map(function (s) {
              var cls = 'sidebar-nav-item' + (s.id === activeSection ? ' is-active' : '');
              return h('button', {
                key: s.id,
                type: 'button',
                className: cls,
                onClick: function () { onSelect(s.id); }
              },
                h('span', { className: 'material-icons', 'aria-hidden': 'true' }, s.icon),
                h('span', null, s.label)
              );
            })
          );
        })
      ),
      h('div', { className: 'sidebar-footer' },
        h('button', {
          type: 'button',
          className: 'sidebar-footer-btn',
          onClick: onToggleTheme
        },
          h('span', { className: 'material-icons', 'aria-hidden': 'true' },
            theme === 'dark' ? 'light_mode' : 'dark_mode'),
          h('span', null, theme === 'dark' ? 'Light mode' : 'Dark mode')
        ),
        h('button', {
          type: 'button',
          className: 'sidebar-footer-btn',
          onClick: onLogout
        },
          h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'logout'),
          h('span', null, 'Log out')
        )
      )
    );
  }

  // --------- Top bar (mobile/tablet only) ----------
  function PortalTopBar(props) {
    var onOpenDrawer = props.onOpenDrawer;
    var activeMeta = props.activeMeta;

    return h('header', { className: 'portal-topbar' },
      h('button', {
        type: 'button',
        className: 'portal-topbar-hamburger',
        'aria-label': 'Open menu',
        onClick: onOpenDrawer
      },
        h('span', null), h('span', null), h('span', null)
      ),
      h('a', { href: '/pv/index.html', className: 'portal-topbar-brand', 'aria-label': 'Phoenix Vanguard' },
        h('span', { className: 'site-logo portal-topbar-logo', role: 'img', 'aria-label': '' })
      ),
      h('span', { className: 'portal-topbar-title' },
        activeMeta ? activeMeta.label : ''
      )
    );
  }

  // --------- Section renderer ----------
  function SectionOutlet(props) {
    var section = props.section;
    var session = props.session;
    var onNavigate = props.onNavigate;

    switch (section) {
      case 'dashboard':
        return h(window.PVAdminDashboard || Missing('dashboard.js'), {
          session: session,
          onNavigate: onNavigate
        });
      case 'my-profile':
        return h(window.PVAdminMyProfile || Missing('my-profile.js'), { session: session });
      case 'my-applications':
        return h(window.PVAdminMyApplications || Missing('my-applications.js'), { session: session });
      case 'member-profiles':
        return h(window.PVAdminMemberProfiles || Missing('member-profiles.js'), { session: session });
      case 'bounties':
        return h(window.PVAdminBounties || Missing('bounties.js'), { session: session });
      case 'members':
        return h(window.PVAdminMembers || Missing('members.js'), {
          session: session,
          initialSearch: (props.navParams && props.navParams.search) || ''
        });
      case 'medical':
        return h(window.PVAdminPatients || Missing('patients.js'), { session: session });
      case 'medical-division':
        return h(window.PVAdminMedicalStaff || Missing('medical-staff.js'), { session: session });
      case 'venues':
        return h(window.PVAdminVenues || Missing('venues.js'), { session: session });
      case 'jobs':
        return h(window.PVAdminJobBoard || Missing('job-board.js'), { session: session });
      case 'cosmic':
        return h(window.PVAdminCosmicExploration || Missing('cosmic-exploration.js'), { session: session });
      case 'announcements':
        return h(window.PVAdminAnnouncements || Missing('announcements.js'), { session: session });
      case 'mercenary':
        return h(window.PVAdminFactionSection || Missing('faction-section.js'), {
          faction: 'Mercenary',
          channel: 'mercenary',
          division: 'mercenary',
          label: 'Mercenary'
        });
      case 'pirate':
        return h(window.PVAdminFactionSection || Missing('faction-section.js'), {
          faction: 'Pirate',
          channel: 'pirate',
          division: 'pirate',
          label: 'Pirate'
        });
      case 'house-staff':
        return h(window.PVAdminFactionSection || Missing('faction-section.js'), {
          faction: 'House Staff',
          channel: 'house_staff',
          division: 'house_staff',
          label: 'House Staff'
        });
      case 'admin':
        return h(window.PVAdminSettings || Missing('admin-settings.js'), { session: session });
      default:
        return h('div', { className: 'portal-coming-soon' },
          h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'help_outline'),
          h('h2', null, 'No section selected'),
          h('p', null, 'Choose one from the sidebar.')
        );
    }
  }

  function Missing(file) {
    return function () {
      return h('div', { className: 'portal-card' },
        h('p', { className: 'portal-flash error' },
          'Module not loaded: ' + file + '. Reload the page and try again.'
        )
      );
    };
  }

  // --------- App ----------
  function App() {
    var initialSession = PVAdminAPI.getSession();
    var sessionState = useState(initialSession);
    var session = sessionState[0], setSession = sessionState[1];

    // ?section=<id> deep-links straight to a section (e.g. the public bounty
    // board's "Submit a quest" button opens My Profile), if the role allows.
    var initialRoles = (initialSession && initialSession.roles) || [];
    var requestedSection = new URLSearchParams(window.location.search).get('section');
    var sectionState = useState(
      (requestedSection && canAccess(requestedSection, initialRoles))
        ? requestedSection
        : defaultSectionFor(initialRoles)
    );
    var section = sectionState[0], setSection = sectionState[1];

    var themeState = useState(getTheme());
    var theme = themeState[0], setThemeLocal = themeState[1];

    var drawerState = useState(false);
    var drawerOpen = drawerState[0], setDrawerOpen = drawerState[1];

    // Optional params carried into a section on navigation (e.g. a search term
    // to seed when opening FC Members from a dashboard Needs Attention row).
    var navParamsState = useState(null);
    var navParams = navParamsState[0], setNavParams = navParamsState[1];

    // Refresh /me on mount so stale role lists get corrected.
    useEffect(function () {
      var cancelled = false;
      PVAdminAPI.me().then(function (data) {
        if (cancelled || !data) return;
        var current = PVAdminAPI.getSession();
        if (!current) return;
        var merged = Object.assign({}, current, {
          username: data.username || current.username,
          display_name: data.display_name || current.display_name,
          roles: Array.isArray(data.roles) ? data.roles : current.roles,
          expires_at: data.expires_at || current.expires_at
        });
        PVAdminAPI.setSession(merged);
        setSession(merged);
        if (!canAccess(section, merged.roles)) {
          setSection(defaultSectionFor(merged.roles));
        }
      }).catch(function (_err) { /* 401 handled in api.js */ });
      return function () { cancelled = true; };
    // eslint-disable-next-line
    }, []);

    // Close drawer with ESC
    useEffect(function () {
      if (!drawerOpen) return;
      function onKey(e) { if (e.key === 'Escape') setDrawerOpen(false); }
      document.addEventListener('keydown', onKey);
      return function () { document.removeEventListener('keydown', onKey); };
    }, [drawerOpen]);

    function onSelect(nextId, params) {
      setSection(nextId);
      setNavParams(params || null);
      setDrawerOpen(false);
      var main = document.querySelector('[data-scroll-main]');
      if (main) main.scrollTo({ top: 0, behavior: 'instant' });
    }

    function onToggleTheme() {
      var next = theme === 'dark' ? 'light' : 'dark';
      setTheme(next);
      setThemeLocal(next);
    }

    function onLogout() { PVAdminAPI.logout(); }

    if (!session) {
      PVAdminAPI.redirectToLogin();
      return h('div', { className: 'portal-boot' }, 'Redirecting…');
    }

    var activeMeta = SECTIONS.find(function (s) { return s.id === section; });
    var accessible = activeMeta ? canAccess(activeMeta.id, session.roles || []) : false;

    var sidebarProps = {
      session: session,
      activeSection: section,
      onSelect: onSelect,
      onToggleTheme: onToggleTheme,
      onLogout: onLogout,
      theme: theme
    };

    return h('div', { className: 'portal-shell' + (drawerOpen ? ' drawer-open' : '') },
      // Desktop sidebar rail (always rendered; hidden on small screens by CSS)
      h('aside', { className: 'portal-sidebar portal-sidebar-rail' },
        h(SidebarBody, sidebarProps)
      ),

      // Mobile top bar
      h(PortalTopBar, {
        onOpenDrawer: function () { setDrawerOpen(true); },
        activeMeta: activeMeta
      }),

      // Mobile drawer (always rendered; positioned offscreen when closed)
      h('aside', {
        className: 'portal-sidebar portal-sidebar-drawer' + (drawerOpen ? ' is-open' : ''),
        'aria-hidden': drawerOpen ? 'false' : 'true'
      },
        h('div', { className: 'portal-drawer-header' },
          h('button', {
            type: 'button',
            className: 'portal-drawer-close',
            'aria-label': 'Close menu',
            onClick: function () { setDrawerOpen(false); }
          }, '✕')
        ),
        h(SidebarBody, sidebarProps)
      ),
      h('div', {
        className: 'portal-drawer-overlay' + (drawerOpen ? ' is-visible' : ''),
        onClick: function () { setDrawerOpen(false); }
      }),

      // Main
      h('main', { className: 'portal-main', 'data-scroll-main': '' },
        // The dashboard and FC Members sections render their own headers
        // (with extra controls), so suppress the generic section header there.
        (activeMeta && section !== 'dashboard' && section !== 'members') ? h('div', { className: 'portal-section-header' },
          h('span', { className: 'material-icons', 'aria-hidden': 'true' }, activeMeta.icon),
          h('h1', null, activeMeta.label)
        ) : null,
        accessible
          ? h(SectionOutlet, { section: section, session: session, onNavigate: onSelect, navParams: navParams })
          : h('div', { className: 'portal-card' },
              h('p', { className: 'portal-flash error' },
                'You do not have access to this section.'
              )
            )
      )
    );
  }

  window.PVAdminPortal = App;
})();
