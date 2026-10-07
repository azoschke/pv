// ============================================================================
//  PVAdminModal — centered modal dialog with overlay, ESC + backdrop close,
//  and body scroll lock. Pure React 18 UMD component (no portals).
//
//  Usage:
//    h(PVAdminModal, { title: 'Edit member', onClose: fn }, childContent)
// ============================================================================

(function () {
  var h = React.createElement;
  var useEffect = React.useEffect;

  function PVAdminModal(props) {
    var title = props.title;
    var onClose = props.onClose;
    var size = props.size || 'md'; // 'md' | 'lg'

    useEffect(function () {
      function onKey(e) {
        if (e.key === 'Escape' && onClose) onClose();
      }
      document.addEventListener('keydown', onKey);
      var prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return function () {
        document.removeEventListener('keydown', onKey);
        document.body.style.overflow = prev;
      };
    }, [onClose]);

    return h('div', {
      className: 'portal-modal-overlay',
      onMouseDown: function (e) {
        if (e.target === e.currentTarget && onClose) onClose();
      }
    },
      h('div', { className: 'portal-modal portal-modal-' + size, role: 'dialog', 'aria-modal': 'true' },
        h('div', { className: 'portal-modal-header' },
          h('h3', { className: 'portal-modal-title' }, title || ''),
          h('button', {
            type: 'button',
            className: 'portal-modal-close',
            'aria-label': 'Close',
            onClick: function () { if (onClose) onClose(); }
          }, '✕')
        ),
        h('div', { className: 'portal-modal-body' },
          props.children
        )
      )
    );
  }

  window.PVAdminModal = PVAdminModal;
})();
