// ============================================================================
//  PVAdminImageUpload — image uploads shared by the portal sections
//
//  Every section uploads through PVAdminAPI.uploadImage to its own worker
//  route, with its own naming fields (venue_name, job_title, …) and, where it
//  needs one, its own resize (square menu thumbnails, 600px item art). Those
//  stay with each section; this file holds the parts that were copied:
//
//    useImageUpload(opts)  → { uploading, error, upload(file) }
//        opts.path        worker route, e.g. '/venues/images'
//        opts.fields      extra form fields sent with the file
//        opts.resize      resize options for PVAdminAPI.uploadImage (optional)
//        opts.onUploaded  called with the new image URL
//    UploadButton(props)  the "Upload" button wrapping a hidden file input
//        busy, disabled, title (null = no tooltip), onFile(file)
//    ImageField(props)    label + URL box + Upload + help + error + preview
//        label ('Image'), value, onChange(url), uploadPath, extraFields,
//        resize, help, disabled, readOnly, blockedReason (upload is off and
//        the button's tooltip says why, e.g. "Enter the venue name above…")
//
//  Load after js/api.js and before the section scripts.
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;

  var UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp';
  var UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

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
        var url = await PVAdminAPI.uploadImage(opts.path, file, opts.fields, opts.resize);
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
      className: 'portal-btn is-ghost is-small portal-upload-btn',
      title: props.title !== undefined ? props.title : (props.busy ? 'Uploading…' : 'Upload an image.'),
      style: { opacity: off ? 0.55 : 1, cursor: off ? 'not-allowed' : 'pointer' }
    },
      props.busy ? 'Uploading…' : 'Upload',
      h('input', {
        type: 'file',
        accept: UPLOAD_ACCEPT,
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
      path: props.uploadPath,
      fields: props.extraFields,
      resize: props.resize,
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
    useImageUpload: useImageUpload,
    UploadButton: UploadButton,
    ImageField: ImageField
  };
})();
