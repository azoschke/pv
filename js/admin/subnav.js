// ============================================================================
//  PVAdminSubnav — unified sub-navigation for portal sections.
//
//  A single underline-style tab strip, rendered as the first element of a
//  section body so it sits directly beneath the shell's section header and
//  reads as one block with it. Replaces the assortment of ad-hoc chip groups
//  and ghost-button toggles that previously varied section to section.
//
//  Props:
//    tabs      [{ id, label }]  ordered sub-views
//    active    id of the active tab
//    onChange  fn(id) called when a different tab is picked
//
//  With one (or zero) tabs it renders nothing — a section gated down to a
//  single accessible sub-view shows no bar at all.
// ============================================================================

(function () {
  var h = React.createElement;

  function PVAdminSubnav(props) {
    var tabs = props.tabs || [];
    if (tabs.length <= 1) return null;
    var active = props.active;
    var onChange = props.onChange;

    return h('div', { className: 'portal-subnav', role: 'tablist' },
      tabs.map(function (t) {
        var isActive = t.id === active;
        return h('button', {
          key: t.id,
          type: 'button',
          role: 'tab',
          'aria-selected': isActive ? 'true' : 'false',
          className: 'subnav-tab' + (isActive ? ' is-active' : ''),
          onClick: function () { if (!isActive && onChange) onChange(t.id); }
        }, t.label);
      })
    );
  }

  window.PVAdminSubnav = PVAdminSubnav;
})();
