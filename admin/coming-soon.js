// ============================================================================
//  PVAdminComingSoon — placeholder for v1 sections with no schema yet
//  (Mercenary, Pirate, Admin). Reused by portal.js.
// ============================================================================

(function () {
  var h = React.createElement;

  function ComingSoon(props) {
    var icon = props.icon || 'construction';
    var title = props.title || 'Coming Soon';
    var subtitle = props.subtitle || 'This section is being built.';

    return h('div', { className: 'portal-coming-soon' },
      h('span', { className: 'material-icons', 'aria-hidden': 'true' }, icon),
      h('h2', null, title),
      h('p', null, subtitle)
    );
  }

  window.PVAdminComingSoon = ComingSoon;
})();
