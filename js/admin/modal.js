// ============================================================================
//  PVAdminModal — centered modal dialog with overlay, ESC + backdrop close,
//  and page scroll lock (PVScrollLock, js/pv-session.js). Pure React 18 UMD
//  component (no portals).
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
      return function () {
        document.removeEventListener('keydown', onKey);
      };
    }, [onClose]);

    // Lock the page for as long as the modal is mounted (pv-session.js).
    useEffect(function () { return PVScrollLock.lock(); }, []);

    return h('div', {
      className: 'modal-overlay',
      onMouseDown: function (e) {
        if (e.target === e.currentTarget && onClose) onClose();
      }
    },
      h('div', { className: 'modal' + (size === 'lg' ? ' is-wide' : ''), role: 'dialog', 'aria-modal': 'true' },
        h('div', { className: 'modal-head' },
          h('h3', { className: 'modal-title' }, title || ''),
          h('button', {
            type: 'button',
            className: 'btn is-quiet is-small is-icon',
            'aria-label': 'Close',
            onClick: function () { if (onClose) onClose(); }
          }, '✕')
        ),
        h('div', { className: 'modal-body' },
          props.children
        )
      )
    );
  }

  window.PVAdminModal = PVAdminModal;
})();
