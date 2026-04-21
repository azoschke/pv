// ============================================================================
//  PVAdminPortal — top-level shell for /pv/admin/portal.html
//
//  Responsibilities:
//    - Load /me (refreshes roles on mount in case they changed server-side)
//    - Render the 224px ink-dark sidebar (brand, user, nav, theme, logout)
//    - Gate sidebar items by role via ROLE_ACCESS
//    - Route to the active section's component (members/patients/announcements
//      /coming-soon)
//
//  The sidebar wraps itself in data-theme="dark" so its ink surface resolves
//  against dark-mode tokens regardless of the user-chosen site theme.
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;

  // --------- Role + section metadata (ported from the wireframe) ----------
  var SECTIONS = [
    { id: 'members',       label: 'FC Members',        icon: 'group' },
    { id: 'medical',       label: 'Medical Division',  icon: 'medical_services' },
    { id: 'mercenary',     label: 'Mercenary',         icon: 'security' },
    { id: 'pirate',        label: 'Pirate Ops',        icon: 'sailing' },
    { id: 'announcements', label: 'Announcements',     icon: 'campaign' },
    { id: 'admin',         label: 'Admin Settings',    icon: 'settings' }
  ];

  // ROLE_ACCESS: section-id -> array of role slugs that can see it.
  // Admin sees everything (handled explicitly below).
  var ROLE_ACCESS = {
    members:       ['officer', 'admin'],
    medical:       ['medical', 'admin'],
    mercenary:     ['mercenary', 'admin'],
    pirate:        ['pirate', 'admin'],
    announcements: ['medical', 'mercenary', 'pirate', 'officer', 'admin'],
    admin:         ['admin']
  };

  function canAccess(sectionId, roles) {
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
    if (t === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    try { localStorage.setItem(THEME_KEY, t); } catch (_e) {}
  }

  // --------- Sidebar ----------
  function Sidebar(props) {
    var session = props.session;
    var activeSection = props.activeSection;
    var onSelect = props.onSelect;
    var onToggleTheme = props.onToggleTheme;
    var onLogout = props.onLogout;
    var theme = props.theme;
    var roles = (session && session.roles) || [];

    var visibleSections = SECTIONS.filter(function (s) {
      return canAccess(s.id, roles);
    });

    return h('aside', { className: 'portal-sidebar', 'data-theme': 'dark' },
      h('div', { className: 'sidebar-brand' },
        h('p', { className: 'sidebar-brand-title' }, 'Phoenix Vanguard'),
        h('p', { className: 'sidebar-brand-subtitle' }, 'Management Portal')
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
        visibleSections.map(function (s) {
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

  // --------- Section renderer ----------
  function SectionOutlet(props) {
    var section = props.section;
    var session = props.session;

    switch (section) {
      case 'members':
        return h(window.PVAdminMembers || Missing('members.js'), { session: session });
      case 'medical':
        return h(window.PVAdminPatients || Missing('patients.js'), { session: session });
      case 'announcements':
        return h(window.PVAdminAnnouncements || Missing('announcements.js'), { session: session });
      case 'mercenary':
        return h(window.PVAdminComingSoon, {
          icon: 'security',
          title: 'Mercenary Division',
          subtitle: 'Contract tracking and bounty logs are on the way.'
        });
      case 'pirate':
        return h(window.PVAdminComingSoon, {
          icon: 'sailing',
          title: 'Pirate Operations',
          subtitle: 'Raid logs and ship manifests are on the way.'
        });
      case 'admin':
        return h(window.PVAdminComingSoon, {
          icon: 'settings',
          title: 'Admin Settings',
          subtitle: 'User and role management tools are on the way.'
        });
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

    var sectionState = useState(defaultSectionFor((initialSession && initialSession.roles) || []));
    var section = sectionState[0], setSection = sectionState[1];

    var themeState = useState(getTheme());
    var theme = themeState[0], setThemeLocal = themeState[1];

    // Refresh /me on mount so stale role lists in sessionStorage get corrected.
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
        // If current section is no longer accessible (e.g. role was removed),
        // bounce to the first accessible one.
        if (!canAccess(section, merged.roles)) {
          setSection(defaultSectionFor(merged.roles));
        }
      }).catch(function (_err) {
        // 401 handled inside api.js (redirects to login).
      });
      return function () { cancelled = true; };
    // eslint-disable-next-line
    }, []);

    function onSelect(nextId) {
      setSection(nextId);
      // Jump back to top when switching sections.
      var main = document.querySelector('[data-scroll-main]');
      if (main) main.scrollTo({ top: 0, behavior: 'instant' });
    }

    function onToggleTheme() {
      var next = theme === 'dark' ? 'light' : 'dark';
      setTheme(next);
      setThemeLocal(next);
    }

    function onLogout() {
      PVAdminAPI.logout();
    }

    if (!session) {
      PVAdminAPI.redirectToLogin();
      return h('div', { className: 'portal-boot' }, 'Redirecting…');
    }

    var activeMeta = SECTIONS.find(function (s) { return s.id === section; });
    var accessible = activeMeta ? canAccess(activeMeta.id, session.roles || []) : false;

    return h('div', { className: 'portal-shell' },
      h(Sidebar, {
        session: session,
        activeSection: section,
        onSelect: onSelect,
        onToggleTheme: onToggleTheme,
        onLogout: onLogout,
        theme: theme
      }),
      h('main', { className: 'portal-main', 'data-scroll-main': '' },
        activeMeta ? h('div', { className: 'portal-section-header' },
          h('span', { className: 'material-icons', 'aria-hidden': 'true' }, activeMeta.icon),
          h('h1', null, activeMeta.label)
        ) : null,
        accessible
          ? h(SectionOutlet, { section: section, session: session })
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
