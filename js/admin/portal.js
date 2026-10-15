// ============================================================================
//  PVAdminPortal — top-level shell for portal.html
//
//  Responsibilities:
//    - Load /me (refreshes roles and permissions on mount in case they
//      changed server-side)
//    - Render the ink-dark sidebar (logo, brand, user, nav, theme, sign out)
//    - On mobile/tablet the sidebar collapses to a slide-in drawer opened by
//      a top bar with a hamburger button (mirrors the main site nav)
//    - Gate sidebar items and tabs by permission via PAGE_ACCESS
//    - Route to the active section's component
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;

  // --------- Section metadata ----------
  // NAV_GROUPS is the source of truth for sidebar layout: ordered groups, each
  // with a small-caps header and its nav items. Headers are permission-gated —
  // a group whose items are all hidden for the account renders nothing.
  // The pinned group (no header) holds the two personal "landing" destinations;
  // everything else lives under a titled group. Sub-views that used to be their
  // own nav rows are now tabs inside a single section (see FactionsSection and
  // MyProfileSection): the four factions collapse into "Factions", and My
  // Applications + My Items fold into "My Profile".
  var NAV_GROUPS = [
    { pinned: true, items: [
      { id: 'dashboard',        label: 'Dashboard',          icon: 'space_dashboard' },
      { id: 'my-profile',       label: 'My Profile',         icon: 'badge' }
    ] },
    { title: 'People', items: [
      { id: 'members',          label: 'FC Members',         icon: 'group' },
      { id: 'member-profiles',  label: 'Member Profiles',    icon: 'contact_page' },
      { id: 'medical',          label: 'Medical Records',    icon: 'folder_shared' },
      { id: 'factions',         label: 'Factions',           icon: 'shield' }
    ] },
    { title: 'Operations', items: [
      { id: 'venues',           label: 'Venues',             icon: 'storefront' },
      { id: 'jobs',             label: 'Job Board',          icon: 'work' },
      { id: 'bounties',         label: 'Bounty Board',       icon: 'flag' },
      { id: 'event-assets',     label: 'Event Assets',       icon: 'photo_library' }
    ] },
    { title: 'Tools & Admin', items: [
      { id: 'campaigns',        label: 'Campaigns',          icon: 'auto_stories' },
      { id: 'rp-rolls',         label: 'Combat Toolkit',     icon: 'casino' },
      { id: 'cosmic',           label: 'Cosmic Exploration', icon: 'rocket_launch' },
      { id: 'announcements',    label: 'Announcements',      icon: 'campaign' },
      { id: 'admin',            label: 'Admin Settings',     icon: 'settings' }
    ] }
  ];

  // Flat list derived from NAV_GROUPS for lookups (active section, defaults).
  var SECTIONS = NAV_GROUPS.reduce(function (acc, g) {
    return acc.concat(g.items);
  }, []);

  // Permission keys (from the permission grid) that open each section; any
  // one is enough. Tab keys (profile-*, the factions) gate the tabs inside My
  // Profile and Factions; a section opens when any of its tabs would. Accounts
  // with no access at all (new registrations have no roles) get the
  // "awaiting approval" notice instead.
  var PROFILE_TABS = {
    'profile-profile':      ['profile.own'],
    'profile-applications': ['jobs.apply', 'quests.submit', 'quests.signup'],
    'profile-items':        ['items.own']
  };
  var FACTION_TABS = {
    mercenary:     ['factions.mercenary.view'],
    pirate:        ['factions.pirate.view'],
    'medical-division': ['factions.medical.manage'],
    recon:         ['factions.recon.view'],
    'house-staff': ['factions.house_staff.view']
  };
  function unionOf(map) {
    return Object.keys(map).reduce(function (acc, k) { return acc.concat(map[k]); }, []);
  }
  var PAGE_ACCESS = Object.assign({
    dashboard:         ['dashboard.view'],
    'my-profile':      unionOf(PROFILE_TABS),
    members:           ['members.view'],
    'member-profiles': ['member_profiles.manage'],
    medical:           ['medical.view'],
    factions:          unionOf(FACTION_TABS),
    venues:            ['venues.edit', 'venues.menus'],
    jobs:              ['jobs.postings', 'jobs.applications_view'],
    bounties:          ['quests.manage'],
    'event-assets':    ['event_assets.view'],
    campaigns:         ['campaigns.story_edit', 'campaigns.codex_edit'],
    'rp-rolls':        ['combat.view'],
    cosmic:            ['cosmic.edit'],
    announcements:     ['announcements.view'],
    admin:             ['users.view']
  }, PROFILE_TABS, FACTION_TABS);

  function canAccess(sectionId, permissions) {
    var keys = PAGE_ACCESS[sectionId] || [];
    if (!permissions) return false;
    for (var i = 0; i < keys.length; i++) {
      if (permissions.indexOf(keys[i]) !== -1) return true;
    }
    return false;
  }

  function defaultSectionFor(permissions) {
    for (var i = 0; i < SECTIONS.length; i++) {
      if (canAccess(SECTIONS[i].id, permissions)) return SECTIONS[i].id;
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

  // --------- Account picture ----------
  // My Profile's picture in a circle, or the name's initial when there is none
  // or it can't be loaded (as on the Roll Calculator and the site's nav).
  function Avatar(props) {
    var errState = useState(false); var imgErr = errState[0], setImgErr = errState[1];
    useEffect(function () { setImgErr(false); }, [props.url]);
    var initial = (Array.from(String(props.name || '').trim())[0] || '?').toUpperCase();
    return h('span', { className: 'sidebar-avatar', 'aria-hidden': 'true' },
      props.url && !imgErr
        ? h('img', { src: props.url, alt: '', onError: function () { setImgErr(true); } })
        : initial);
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
    var permissions = (session && session.permissions) || [];
    var userName = (session && (session.display_name || session.username)) || 'Unknown';

    // Build groups with only the items this account may see; drop empty groups
    // so the section header never shows above an empty list.
    var visibleGroups = NAV_GROUPS.map(function (g) {
      return {
        title: g.title,
        pinned: !!g.pinned,
        items: g.items.filter(function (s) { return canAccess(s.id, permissions); })
      };
    }).filter(function (g) { return g.items.length > 0; });

    return h('div', { className: 'portal-sidebar-body' },
      h('a', { href: 'index.html', className: 'sidebar-brand', 'aria-label': 'Phoenix Vanguard' },
        h('span', { className: 'site-logo sidebar-logo', role: 'img', 'aria-label': 'Phoenix Vanguard' }),
        h('span', { className: 'sidebar-brand-text' },
          h('span', { className: 'sidebar-brand-title' }, 'Phoenix Vanguard'),
          h('span', { className: 'sidebar-brand-subtitle' }, 'Management Portal')
        )
      ),
      h('div', { className: 'sidebar-user' },
        h(Avatar, { name: userName, url: session && session.avatar_url }),
        h('div', { className: 'sidebar-user-text' },
          h('p', { className: 'sidebar-user-name' }, userName),
          h('p', { className: 'sidebar-user-roles' },
            roles.length ? roles.join(' · ') : 'no roles assigned'
          )
        )
      ),
      h('nav', { className: 'sidebar-nav' },
        visibleGroups.map(function (g, gi) {
          return h('div', {
            className: 'sidebar-nav-group' + (g.pinned ? ' is-pinned' : ''),
            key: g.title || ('pinned-' + gi)
          },
            g.title ? h('p', { className: 'sidebar-nav-group-title' }, g.title) : null,
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
          h('span', null, theme === 'dark' ? 'Light Mode' : 'Dark Mode')
        ),
        h('button', {
          type: 'button',
          className: 'sidebar-footer-btn',
          onClick: onLogout
        },
          h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'logout'),
          h('span', null, 'Sign Out')
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
        className: 'btn is-quiet is-icon portal-topbar-hamburger',
        'aria-label': 'Open menu',
        onClick: onOpenDrawer
      },
        h('span', null), h('span', null), h('span', null)
      ),
      h('a', { href: 'index.html', className: 'portal-topbar-brand', 'aria-label': 'Phoenix Vanguard' },
        h('span', { className: 'site-logo portal-topbar-logo', role: 'img', 'aria-label': '' })
      ),
      h('span', { className: 'portal-topbar-title' },
        activeMeta ? activeMeta.label : ''
      )
    );
  }

  // --------- Consolidated sections (tabbed wrappers) ----------
  // My Profile now hosts three sub-views that used to be separate places:
  // the roster profile editor, the old My Applications section, and the RP
  // item loadout (My Items). Each tab follows its own permissions.
  function MyProfileSection(props) {
    var session = props.session;
    var permissions = (session && session.permissions) || [];
    var TABS = [
      { id: 'profile',      label: 'Profile' },
      { id: 'applications', label: 'Applications' },
      { id: 'items',        label: 'Items' }
    ].filter(function (t) { return canAccess('profile-' + t.id, permissions); });
    var wanted = props.initialTab;
    var initial = TABS.some(function (t) { return t.id === wanted; })
      ? wanted
      : (TABS[0] ? TABS[0].id : null);
    var tabState = useState(initial);
    var tab = tabState[0], setTab = tabState[1];
    var active = TABS.some(function (t) { return t.id === tab; })
      ? tab
      : (TABS[0] ? TABS[0].id : null);

    var body;
    if (active === 'applications') {
      body = h(window.PVAdminMyApplications || Missing('my-applications.js'), { session: session });
    } else if (active === 'items') {
      body = h(window.PVAdminMyItems || Missing('my-profile.js'), { session: session });
    } else {
      body = h(window.PVAdminMyProfile || Missing('my-profile.js'), { session: session });
    }

    return h('div', null,
      h(window.PVAdminSubnav, { tabs: TABS, active: active, onChange: setTab }),
      body
    );
  }

  // Factions folds the four division sections into one entry. Each division is
  // gated on its own access rule, so a member with a single division sees just
  // that tab — and PVAdminSubnav renders no bar for a lone tab. Medical uses a
  // different component (the medical-staff roster) than the other three.
  function FactionsSection(props) {
    var session = props.session;
    var permissions = (session && session.permissions) || [];
    var ALL = [
      { id: 'mercenary',   label: 'Mercenary',   access: 'mercenary' },
      { id: 'pirate',      label: 'Pirate',      access: 'pirate' },
      { id: 'medical',     label: 'Medical',     access: 'medical-division' },
      { id: 'recon',       label: 'Recon',       access: 'recon' },
      { id: 'house-staff', label: 'House Staff', access: 'house-staff' }
    ];
    var tabs = ALL.filter(function (d) { return canAccess(d.access, permissions); });

    var wanted = props.initialTab;
    var initial = tabs.some(function (t) { return t.id === wanted; })
      ? wanted
      : (tabs[0] ? tabs[0].id : null);
    var tabState = useState(initial);
    var tab = tabState[0], setTab = tabState[1];
    var active = tabs.some(function (t) { return t.id === tab; })
      ? tab
      : (tabs[0] ? tabs[0].id : null);

    var body;
    switch (active) {
      case 'mercenary':
        body = h(window.PVAdminFactionSection || Missing('faction-section.js'), {
          faction: 'Mercenary', channel: 'mercenary', division: 'mercenary', label: 'Mercenary'
        });
        break;
      case 'pirate':
        body = h(window.PVAdminFactionSection || Missing('faction-section.js'), {
          faction: 'Pirate', channel: 'pirate', division: 'pirate', label: 'Pirate'
        });
        break;
      case 'medical':
        body = h(window.PVAdminMedicalStaff || Missing('medical-staff.js'), { session: session });
        break;
      case 'recon':
        body = h(window.PVAdminFactionSection || Missing('faction-section.js'), {
          faction: 'Recon', channel: 'recon', division: 'recon', label: 'Recon'
        });
        break;
      case 'house-staff':
        body = h(window.PVAdminFactionSection || Missing('faction-section.js'), {
          faction: 'House Staff', channel: 'house_staff', division: 'house_staff', label: 'House Staff'
        });
        break;
      default:
        body = h('div', { className: 'portal-card' },
          h('p', { className: 'portal-flash error' }, 'You do not have access to any faction division.'));
    }

    return h('div', null,
      h(window.PVAdminSubnav, { tabs: tabs, active: active, onChange: setTab }),
      body
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
        return h(MyProfileSection, {
          session: session,
          initialTab: (props.navParams && props.navParams.tab) || null
        });
      case 'member-profiles':
        return h(window.PVAdminMemberProfiles || Missing('member-profiles.js'), { session: session });
      case 'bounties':
        return h(window.PVAdminBounties || Missing('bounties.js'), { session: session });
      case 'event-assets':
        return h(window.PVAdminEventAssets || Missing('event-assets.js'), { session: session });
      case 'members':
        return h(window.PVAdminMembers || Missing('members.js'), {
          session: session,
          initialSearch: (props.navParams && props.navParams.search) || '',
          initialInterview: (props.navParams && props.navParams.interview) || ''
        });
      case 'medical':
        return h(window.PVAdminPatients || Missing('patients.js'), { session: session });
      case 'factions':
        return h(FactionsSection, {
          session: session,
          initialTab: (props.navParams && props.navParams.tab) || null
        });
      case 'venues':
        return h(window.PVAdminVenues || Missing('venues.js'), { session: session });
      case 'jobs':
        return h(window.PVAdminJobBoard || Missing('job-board.js'), {
          session: session,
          initialView: (props.navParams && props.navParams.view) || 'postings',
          initialStage: (props.navParams && props.navParams.stage) || '',
          initialSearch: (props.navParams && props.navParams.search) || ''
        });
      case 'campaigns':
        return h(window.PVAdminCampaigns || Missing('campaigns.js'), { session: session });
      case 'rp-rolls':
        return h(window.PVAdminRpRolls || Missing('rp-rolls.js'), { session: session });
      case 'cosmic':
        return h(window.PVAdminCosmicExploration || Missing('cosmic-exploration.js'), { session: session });
      case 'announcements':
        return h(window.PVAdminAnnouncements || Missing('announcements.js'), { session: session });
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
    // board's "Submit a quest" button opens My Profile's Applications tab), if
    // the account's permissions allow. ?tab=<id> selects a sub-view within a
    // tabbed section. Legacy section ids that are now tabs are remapped so old links still land
    // in the right place.
    // Sessions stored before permissions existed have none until /me answers;
    // the section is picked then.
    var initialPermissions = initialSession && initialSession.permissions;
    var permissionsKnown = Array.isArray(initialPermissions);
    var _params = new URLSearchParams(window.location.search);
    var requestedSection = _params.get('section');
    var requestedTab = _params.get('tab');
    if (requestedSection === 'my-applications') {
      requestedSection = 'my-profile';
      requestedTab = requestedTab || 'applications';
    } else if (['mercenary', 'pirate', 'house-staff', 'recon', 'medical-division'].indexOf(requestedSection) !== -1) {
      requestedTab = requestedTab || (requestedSection === 'medical-division' ? 'medical' : requestedSection);
      requestedSection = 'factions';
    }
    var sectionState = useState(
      !permissionsKnown
        ? null
        : (requestedSection && canAccess(requestedSection, initialPermissions))
        ? requestedSection
        : defaultSectionFor(initialPermissions)
    );
    var section = sectionState[0], setSection = sectionState[1];

    var themeState = useState(getTheme());
    var theme = themeState[0], setThemeLocal = themeState[1];

    var drawerState = useState(false);
    var drawerOpen = drawerState[0], setDrawerOpen = drawerState[1];

    // Optional params carried into a section on navigation (e.g. a search term
    // to seed when opening FC Members from a dashboard Needs Attention row).
    // Seeded from ?tab= so a deep link opens the right sub-view on first mount;
    // cleared on manual navigation via onSelect.
    var navParamsState = useState(requestedTab ? { tab: requestedTab } : null);
    var navParams = navParamsState[0], setNavParams = navParamsState[1];

    // Refresh /me on mount so stale roles and permissions get corrected.
    useEffect(function () {
      var cancelled = false;
      PVAdminAPI.me().then(function (data) {
        if (cancelled || !data) return;
        var current = PVAdminAPI.getSession();
        if (!current) return;
        var merged = Object.assign({}, current, {
          username: data.username || current.username,
          display_name: data.display_name || current.display_name,
          avatar_url: data.avatar_url !== undefined ? data.avatar_url : (current.avatar_url || null),
          roles: Array.isArray(data.roles) ? data.roles : current.roles,
          permissions: Array.isArray(data.permissions) ? data.permissions : (current.permissions || []),
          is_root: !!data.is_root,
          expires_at: data.expires_at || current.expires_at
        });
        PVAdminAPI.setSession(merged);
        setSession(merged);
        var wantedSection = permissionsKnown ? section : requestedSection;
        if (!canAccess(wantedSection, merged.permissions)) {
          var fallback = defaultSectionFor(merged.permissions);
          setSection(fallback);
          syncSectionUrl(fallback, null);
        } else if (wantedSection !== section) {
          setSection(wantedSection);
        }
      }).catch(function (_err) {
        // 401 is handled in api.js. Without stored permissions there is
        // nothing to show, so sign in again to get them.
        if (!cancelled && !permissionsKnown) {
          PVAdminAPI.clearSession();
          PVAdminAPI.redirectToLogin();
        }
      });
      return function () { cancelled = true; };
    // eslint-disable-next-line
    }, []);

    // The saved sign-in changed elsewhere in the portal (My Profile's picture):
    // show it in the sidebar.
    useEffect(function () {
      function onSession() { var s = PVAdminAPI.getSession(); if (s) setSession(s); }
      window.addEventListener('pv:session', onSession);
      return function () { window.removeEventListener('pv:session', onSession); };
    }, []);

    // Close drawer with ESC
    useEffect(function () {
      if (!drawerOpen) return;
      function onKey(e) { if (e.key === 'Escape') setDrawerOpen(false); }
      document.addEventListener('keydown', onKey);
      return function () { document.removeEventListener('keydown', onKey); };
    }, [drawerOpen]);

    // Keep the URL in step with the active section so a refresh (or a copied
    // link) lands back on the same section instead of the role default. `tab`
    // rides along when a deep link seeds one; a manual nav clears it.
    function syncSectionUrl(id, params) {
      try {
        var u = new URL(window.location.href);
        u.searchParams.set('section', id);
        if (params && params.tab) u.searchParams.set('tab', params.tab);
        else u.searchParams.delete('tab');
        window.history.replaceState(null, '', u);
      } catch (_) { /* history/URL unavailable — non-fatal */ }
    }

    function onSelect(nextId, params) {
      setSection(nextId);
      setNavParams(params || null);
      setDrawerOpen(false);
      syncSectionUrl(nextId, params);
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

    if (!Array.isArray(session.permissions)) {
      return h('div', { className: 'portal-boot' }, 'Loading…');
    }

    var activeMeta = SECTIONS.find(function (s) { return s.id === section; });
    var permissions = session.permissions;
    var accessible = activeMeta ? canAccess(activeMeta.id, permissions) : false;

    // Freshly registered accounts have no roles, which unlocks no sections at
    // all — show an "awaiting approval" notice instead of an empty shell.
    var hasAnyAccess = SECTIONS.some(function (s) { return canAccess(s.id, permissions); });

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
            className: 'btn is-quiet is-small is-icon',
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
        !hasAnyAccess
          ? h('div', { className: 'portal-card' },
              h('h2', { className: 'portal-card-title' }, 'Account awaiting approval'),
              h('p', { style: { margin: '0.6rem 0 0' } },
                'Your account was created successfully, but an officer has not assigned it a role yet. ' +
                'Check back soon, or give an officer a poke.'
              )
            )
          : accessible
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
