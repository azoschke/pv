// ============================================================================
//  PVAdminImageUpload — image uploads shared by the portal sections
//
//  Every upload goes to the worker's POST /images with a kind (venue, menu,
//  boss, …) and a name the stored file is named after. KINDS below holds each
//  kind's sizing, applied in the browser before upload; the worker's matching
//  table (routes/images.js) decides who may upload each kind and how the file
//  is named.
//
//    KINDS                 kind → resize options for PVAdminAPI.uploadImage
//    useImageUpload(opts)  → { uploading, error, upload(file) }
//        opts.kind        one of KINDS
//        opts.name        what the file is named after (venue name, title, …)
//        opts.onUploaded  called with the new image URL
//    UploadButton(props)  the "Upload" button wrapping a hidden file input
//        busy, disabled, title (null = no tooltip), accept, onFile(file)
//    ImageField(props)    label + URL box + Upload + help + error + preview
//        label ('Image'), value, onChange(url), kind, name, help, disabled,
//        readOnly, blockedReason (upload is off and the button's tooltip says
//        why, e.g. "Enter the venue name above…")
//
//  Load after js/api.js and before the section scripts.
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;

  var UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp';
  var UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

  // Sizing per kind. Empty means the default: at most 1400px wide, WebP.
  var KINDS = {
    venue:    {},
    // Menu thumbnails render at 64px, so 512 leaves headroom for retina
    // without paying the venue-image cost on a menu with forty items. Square
    // by design: a wide photo loses its sides rather than being letterboxed.
    menu:     { square: true, maxSize: 512, quality: 0.82 },
    quest:    {},
    job:      {},
    event:    {},
    medic:    {},
    profile:  {},
    boss:     { square: true, maxSize: 600 },
    item:     { square: true, maxSize: 600 },
    codex:    {},
    // Link previews: cropped to 1200×630 and saved as JPEG.
    campaign: { width: 1200, height: 630, jpeg: true },
    site:     { width: 1200, height: 630, jpeg: true },
    // Favicons go up untouched, PNG only.
    favicon:  { raw: true, accept: 'image/png' }
  };

  function useImageUpload(opts) {
    var uploadingState = useState(false);
    var uploading = uploadingState[0], setUploading = uploadingState[1];
    var errState = useState('');
    var error = errState[0], setError = errState[1];

    async function upload(file) {
      if (!file) return;
      if (file.size > UPLOAD_MAX_BYTES) {
        setError('File is larger than 10 MB. Pick a smaller image.');
        return;
      }
      setError('');
      setUploading(true);
      try {
        var url = await PVAdminAPI.uploadImage('/images', file,
          { kind: opts.kind, name: opts.name || '' }, KINDS[opts.kind]);
        opts.onUploaded(url);
      } catch (e) {
        setError(e.message || 'Upload failed.');
      } finally {
        setUploading(false);
      }
    }

    return { uploading: uploading, error: error, upload: upload };
  }

  function UploadButton(props) {
    var off = !!(props.busy || props.disabled);
    return h('label', {
      className: 'btn is-quiet is-small portal-upload-btn',
      title: props.title !== undefined ? props.title : (props.busy ? 'Uploading…' : 'Upload an image.'),
      style: { opacity: off ? 0.55 : 1, cursor: off ? 'not-allowed' : 'pointer' }
    },
      props.busy ? 'Uploading…' : 'Upload',
      h('input', {
        type: 'file',
        accept: props.accept || UPLOAD_ACCEPT,
        disabled: off,
        className: 'portal-file-input',
        onChange: function (e) {
          var f = e.target.files && e.target.files[0];
          e.target.value = '';
          props.onFile(f);
        }
      })
    );
  }

  function ImageField(props) {
    var value = props.value;
    var blocked = props.blockedReason || null;
    var up = useImageUpload({
      kind: props.kind,
      name: props.name,
      onUploaded: props.onChange
    });

    return h('div', { className: 'portal-field' },
      h('label', null, props.label || 'Image'),
      h('div', { className: 'portal-image-row' },
        h('input', {
          type: 'text',
          value: value,
          disabled: !!props.readOnly,
          onChange: function (e) { props.onChange(e.target.value); },
          placeholder: 'https://…',
          className: 'portal-grow'
        }),
        h(UploadButton, {
          busy: up.uploading,
          // readOnly: show the image without letting it change.
          disabled: props.disabled || props.readOnly || !!blocked,
          title: blocked || undefined,
          accept: (KINDS[props.kind] || {}).accept,
          onFile: up.upload
        })
      ),
      props.help ? h('p', { className: 'portal-field-help' }, props.help) : null,
      up.error ? h('p', { className: 'portal-field-help is-error' }, up.error) : null,
      value ? h('img', {
        src: value, alt: '',
        className: 'portal-image-preview',
        onError: function (e) { e.target.style.display = 'none'; }
      }) : null
    );
  }

  window.PVAdminImageUpload = {
    UPLOAD_ACCEPT: UPLOAD_ACCEPT,
    UPLOAD_MAX_BYTES: UPLOAD_MAX_BYTES,
    KINDS: KINDS,
    useImageUpload: useImageUpload,
    UploadButton: UploadButton,
    ImageField: ImageField
  };
})();
