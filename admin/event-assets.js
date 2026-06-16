// ============================================================================
//  PVAdminEventAssets — shared event asset library for role-holders
//
//  Every signed-in account with at least one role can view the assets, copy
//  the text fields, and download the images. Officers and admins can add,
//  edit, and delete entries, and upload images.
//
//  Worker routes:
//    GET    /event-assets          any valid session
//    POST   /event-assets          officer | admin
//    PATCH  /event-assets/:id       officer | admin
//    DELETE /event-assets/:id       officer | admin
//    POST   /event-assets/images    officer | admin   (multipart, returns {url})
//
//  An entry is: { id, event_topic, location, description, image_url,
//                 created_by, created_at, updated_at }
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useMemo = React.useMemo;

  var UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp';
  var UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
  var UPLOAD_TARGET_WIDTH = 1400;
  var UPLOAD_WEBP_QUALITY = 0.8;

  // Decode the picked file, downscale to UPLOAD_TARGET_WIDTH (auto height) if
  // wider than that, and re-encode as WebP. Returns a Blob ready to upload.
  // (Same approach as the Venues section so uploads stay consistent in size.)
  async function resizeImageToWebp(file) {
    var bitmap = null;
    if (typeof createImageBitmap === 'function') {
      try { bitmap = await createImageBitmap(file); }
      catch (_e) { bitmap = null; }
    }
    if (!bitmap) {
      bitmap = await new Promise(function (resolve, reject) {
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not read image.')); };
        img.src = url;
      });
    }
    var srcW = bitmap.width || bitmap.naturalWidth;
    var srcH = bitmap.height || bitmap.naturalHeight;
    if (!srcW || !srcH) throw new Error('Could not read image dimensions.');
    var w = srcW > UPLOAD_TARGET_WIDTH ? UPLOAD_TARGET_WIDTH : srcW;
    var hgt = Math.max(1, Math.round((w / srcW) * srcH));
    var canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = hgt;
    var ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get a 2D canvas context.');
    ctx.drawImage(bitmap, 0, 0, w, hgt);
    if (bitmap.close) { try { bitmap.close(); } catch (_e) {} }
    return await new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) {
        if (!b) reject(new Error('Could not encode image as WebP (browser may not support it).'));
        else resolve(b);
      }, 'image/webp', UPLOAD_WEBP_QUALITY);
    });
  }

  async function uploadEventAssetImage(file, eventTopic) {
    var session = PVAdminAPI.getSession();
    if (!session) {
      PVAdminAPI.redirectToLogin();
      throw new Error('Session expired. Please sign in again.');
    }
    var blob = await resizeImageToWebp(file);
    var form = new FormData();
    form.append('file', blob, 'upload.webp');
    form.append('event_topic', eventTopic || '');
    var res = await fetch(PVAdminAPI.API_BASE + '/event-assets/images', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + session.token,
        'Accept': 'application/json'
      },
      body: form
    });
    if (res.status === 401) {
      PVAdminAPI.clearSession();
      PVAdminAPI.redirectToLogin();
      throw new Error('Your session is no longer valid. Please sign in again.');
    }
    var text = await res.text();
    var data = null;
    if (text) {
      try { data = JSON.parse(text); } catch (_e) { data = { raw: text }; }
    }
    if (!res.ok) {
      var msg = (data && (data.error || data.message)) || ('Upload failed (' + res.status + ')');
      throw new Error(msg);
    }
    if (!data || !data.url) throw new Error('Upload succeeded but response was missing a URL.');
    return data.url;
  }

  function canManage() {
    return PVAdminAPI.hasAnyRole(['officer', 'admin']);
  }

  // Copy helper with a clipboard-API path and a legacy textarea fallback.
  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        resolve();
      } catch (e) { reject(e); }
    });
  }

  // Small inline "Copy" affordance that flips to "Copied!" briefly on click.
  function CopyButton(props) {
    var copiedState = useState(false);
    var copied = copiedState[0], setCopied = copiedState[1];
    var value = props.value || '';
    if (!value) return null;
    return h('button', {
      type: 'button',
      className: 'portal-btn is-small is-ghost',
      title: props.title || 'Copy',
      onClick: function () {
        copyToClipboard(value).then(function () {
          setCopied(true);
          setTimeout(function () { setCopied(false); }, 1500);
        }).catch(function () {});
      }
    },
      h('span', { className: 'material-icons', 'aria-hidden': 'true', style: { fontSize: '1rem' } },
        copied ? 'check' : 'content_copy'),
      h('span', null, copied ? 'Copied!' : (props.label || 'Copy'))
    );
  }

  function emptyDraft() {
    return {
      event_topic: '',
      location: '',
      description: '',
      image_url: ''
    };
  }

  function assetToDraft(a) {
    if (!a) return emptyDraft();
    return {
      id: a.id,
      event_topic: a.event_topic || '',
      location: a.location || '',
      description: a.description || '',
      image_url: a.image_url || ''
    };
  }

  function draftToPayload(draft) {
    return {
      event_topic: draft.event_topic.trim(),
      location: draft.location.trim() || null,
      description: draft.description.trim() || null,
      image_url: draft.image_url.trim() || null
    };
  }

  // ── Form (create / edit) ─────────────────────────────────────────────────
  function EventAssetForm(props) {
    var initial = props.initial;
    var onSubmit = props.onSubmit;
    var onCancel = props.onCancel;
    var isEdit = !!(initial && initial.id);

    var draftState = useState(initial ? assetToDraft(initial) : emptyDraft());
    var draft = draftState[0], setDraft = draftState[1];
    var savingState = useState(false);
    var saving = savingState[0], setSaving = savingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];
    var uploadingState = useState(false);
    var uploading = uploadingState[0], setUploading = uploadingState[1];
    var uploadErrState = useState('');
    var uploadErr = uploadErrState[0], setUploadErr = uploadErrState[1];

    var topicReady = !!draft.event_topic.trim();

    function setField(k, v) {
      setDraft(function (d) { return Object.assign({}, d, { [k]: v }); });
    }

    async function handleImageUpload(file) {
      if (!file) return;
      if (!topicReady) {
        setUploadErr('Enter the event topic before uploading an image.');
        return;
      }
      if (file.size > UPLOAD_MAX_BYTES) {
        setUploadErr('File is larger than 10 MB. Pick a smaller image.');
        return;
      }
      setUploadErr('');
      setUploading(true);
      try {
        var url = await uploadEventAssetImage(file, draft.event_topic.trim());
        setField('image_url', url);
      } catch (e) {
        setUploadErr(e.message || 'Upload failed.');
      } finally {
        setUploading(false);
      }
    }

    async function submit(e) {
      e.preventDefault();
      if (!topicReady) { setErr('Event topic is required.'); return; }
      setErr('');
      setSaving(true);
      try {
        await onSubmit(draftToPayload(draft));
      } catch (ex) {
        setErr(ex.message || 'Could not save.');
        setSaving(false);
      }
    }

    var uploadDisabled = !topicReady || uploading || saving;

    return h('form', { onSubmit: submit, className: 'portal-form' },
      err ? h('div', { className: 'portal-flash error', style: { marginBottom: '0.75rem' } }, err) : null,

      h('div', { className: 'portal-field' },
        h('label', null, 'Event topic *'),
        h('input', {
          type: 'text',
          value: draft.event_topic,
          onChange: function (e) { setField('event_topic', e.target.value); },
          maxLength: 200,
          placeholder: 'e.g. Summer Solstice Gala',
          required: true
        })
      ),

      h('div', { className: 'portal-field' },
        h('label', null, 'Location'),
        h('input', {
          type: 'text',
          value: draft.location,
          onChange: function (e) { setField('location', e.target.value); },
          maxLength: 200,
          placeholder: 'e.g. Lavender Beds, Ward 5, Plot 30'
        })
      ),

      h('div', { className: 'portal-field' },
        h('label', null, 'Description'),
        h('textarea', {
          value: draft.description,
          onChange: function (e) { setField('description', e.target.value); },
          rows: 6, maxLength: 4000,
          placeholder: 'Details to copy into Discord, flyers, etc.'
        })
      ),

      h('div', { className: 'portal-field' },
        h('label', null, 'Image'),
        h('div', { style: { display: 'flex', gap: '0.5rem', alignItems: 'center' } },
          h('input', {
            type: 'text',
            value: draft.image_url,
            onChange: function (e) { setField('image_url', e.target.value); },
            placeholder: 'https://…',
            style: { flex: 1 }
          }),
          h('label', {
            className: 'portal-btn is-ghost is-small',
            title: !topicReady
              ? 'Enter the event topic above before uploading an image.'
              : (uploading ? 'Uploading…' : 'Upload an image.'),
            style: {
              whiteSpace: 'nowrap',
              opacity: uploadDisabled ? 0.55 : 1,
              cursor: uploadDisabled ? 'not-allowed' : 'pointer'
            }
          },
            uploading ? 'Uploading…' : 'Upload',
            h('input', {
              type: 'file',
              accept: UPLOAD_ACCEPT,
              disabled: uploadDisabled,
              style: { display: 'none' },
              onChange: function (e) {
                var f = e.target.files && e.target.files[0];
                e.target.value = '';
                handleImageUpload(f);
              }
            })
          )
        ),
        h('p', { className: 'portal-field-help' },
          'Paste an image URL, or upload a file. The event topic must be set before uploading. Uploaded images are saved and reused via their stored URL.'
        ),
        uploadErr ? h('p', {
          className: 'portal-field-help',
          style: { color: 'var(--danger-color, #c0392b)' }
        }, uploadErr) : null,
        draft.image_url ? h('img', {
          src: draft.image_url, alt: '',
          style: {
            display: 'block', marginTop: '0.5rem',
            maxWidth: '320px', maxHeight: '180px',
            border: '1px solid var(--border-color)', borderRadius: '0.3rem',
            objectFit: 'cover'
          },
          onError: function (e) { e.target.style.display = 'none'; }
        }) : null
      ),

      h('div', { className: 'portal-form-actions' },
        h('button', {
          type: 'submit', className: 'portal-btn', disabled: saving
        }, saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create asset')),
        h('button', {
          type: 'button', className: 'portal-btn is-ghost',
          onClick: onCancel, disabled: saving
        }, 'Cancel')
      )
    );
  }

  // Build a safe-ish filename from the topic for the download attribute.
  function downloadName(asset) {
    var base = (asset.event_topic || 'event-asset')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'event-asset';
    return base + '-image';
  }

  // ── Asset card (everyone) ────────────────────────────────────────────────
  function AssetCard(props) {
    var a = props.asset;
    var manage = props.manage;
    var onEdit = props.onEdit;
    var onDelete = props.onDelete;

    // "Copy all" combines the text fields into one block for quick reuse.
    var allText = [
      a.event_topic ? a.event_topic : '',
      a.location ? ('Location: ' + a.location) : '',
      a.description ? ('\n' + a.description) : ''
    ].filter(function (s) { return !!s; }).join('\n');

    return h('div', { className: 'portal-card', style: { display: 'flex', flexDirection: 'column', gap: '0.65rem' } },
      a.image_url ? h('div', { style: { position: 'relative' } },
        h('img', {
          src: a.image_url, alt: a.event_topic || '',
          style: {
            display: 'block', width: '100%', maxHeight: '220px',
            objectFit: 'cover', borderRadius: '0.4rem',
            border: '1px solid var(--border-color)'
          },
          onError: function (e) { e.target.style.display = 'none'; }
        })
      ) : null,

      h('div', null,
        h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: '0.5rem' } },
          h('h2', { className: 'portal-card-title', style: { margin: 0, flex: 1 } }, a.event_topic || 'Untitled event'),
          h(CopyButton, { value: a.event_topic, label: 'Copy', title: 'Copy event topic' })
        ),
        a.location ? h('div', {
          style: { display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.35rem', color: 'var(--text-secondary)' }
        },
          h('span', { className: 'material-icons', 'aria-hidden': 'true', style: { fontSize: '1.05rem' } }, 'place'),
          h('span', { style: { flex: 1 } }, a.location),
          h(CopyButton, { value: a.location, label: 'Copy', title: 'Copy location' })
        ) : null
      ),

      a.description ? h('div', null,
        h('p', { style: { whiteSpace: 'pre-wrap', margin: '0 0 0.4rem' } }, a.description),
        h(CopyButton, { value: a.description, label: 'Copy description', title: 'Copy description' })
      ) : null,

      h('div', {
        style: {
          display: 'flex', flexWrap: 'wrap', gap: '0.4rem',
          paddingTop: '0.5rem', borderTop: '1px solid var(--border-color)'
        }
      },
        h(CopyButton, { value: allText, label: 'Copy all text', title: 'Copy topic, location, and description' }),
        a.image_url ? h('a', {
          className: 'portal-btn is-small is-ghost',
          href: a.image_url,
          download: downloadName(a),
          // Cross-origin URLs ignore the download attribute and open in a new
          // tab to save manually; same-origin uploads download directly.
          target: '_blank',
          rel: 'noopener noreferrer'
        },
          h('span', { className: 'material-icons', 'aria-hidden': 'true', style: { fontSize: '1rem' } }, 'download'),
          h('span', null, 'Download image')
        ) : null,
        manage ? h('span', { style: { flex: 1 } }) : null,
        manage ? h('button', {
          type: 'button', className: 'portal-btn is-small is-ghost',
          onClick: function () { onEdit(a); }
        }, 'Edit') : null,
        manage ? h('button', {
          type: 'button', className: 'portal-btn is-small is-danger',
          onClick: function () {
            if (confirm('Delete event asset "' + (a.event_topic || 'Untitled') + '"?')) onDelete(a);
          }
        }, 'Delete') : null
      )
    );
  }

  // ── Section root ─────────────────────────────────────────────────────────
  function EventAssets() {
    var listState = useState([]);
    var list = listState[0], setList = listState[1];
    var loadingState = useState(true);
    var loading = loadingState[0], setLoading = loadingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];
    var flashState = useState('');
    var flash = flashState[0], setFlash = flashState[1];
    var formState = useState(null); // null | { asset: object|null }
    var formOpen = formState[0], setFormOpen = formState[1];
    var queryState = useState('');
    var query = queryState[0], setQuery = queryState[1];

    var manage = canManage();

    async function reload() {
      setErr('');
      try {
        var data = await PVAdminAPI.request('GET', '/event-assets', undefined, true);
        setList(Array.isArray(data) ? data : []);
      } catch (e) {
        setErr(e.message || 'Failed to load event assets.');
      } finally {
        setLoading(false);
      }
    }

    useEffect(function () { reload(); }, []);

    var filtered = useMemo(function () {
      var q = query.trim().toLowerCase();
      var sorted = list.slice().sort(function (a, b) {
        // Newest first when timestamps exist, else by topic.
        var at = a.created_at ? new Date(a.created_at).getTime() : 0;
        var bt = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (at !== bt) return bt - at;
        return (a.event_topic || '').localeCompare(b.event_topic || '', undefined, { sensitivity: 'base' });
      });
      if (!q) return sorted;
      return sorted.filter(function (a) {
        return (
          (a.event_topic || '').toLowerCase().indexOf(q) !== -1 ||
          (a.location || '').toLowerCase().indexOf(q) !== -1 ||
          (a.description || '').toLowerCase().indexOf(q) !== -1
        );
      });
    }, [list, query]);

    function flashFor(msg) {
      setFlash(msg);
      setTimeout(function () { setFlash(''); }, 3500);
    }

    async function handleSubmit(payload) {
      var editingId = formOpen && formOpen.asset && formOpen.asset.id;
      if (editingId) {
        await PVAdminAPI.request('PATCH', '/event-assets/' + editingId, payload, true);
        flashFor('Event asset updated.');
      } else {
        await PVAdminAPI.request('POST', '/event-assets', payload, true);
        flashFor('Event asset created.');
      }
      setFormOpen(null);
      await reload();
    }

    async function handleDelete(a) {
      try {
        await PVAdminAPI.request('DELETE', '/event-assets/' + a.id, undefined, true);
        flashFor('Event asset deleted.');
        await reload();
      } catch (e) {
        setErr(e.message || 'Failed to delete event asset.');
      }
    }

    return h('div', null,
      h('div', { className: 'portal-card', style: { padding: '0.85rem 1.1rem' } },
        h('div', {
          style: { display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }
        },
          h('h2', { className: 'portal-card-title', style: { margin: 0, flex: 1 } }, 'Event Assets'),
          h('input', {
            type: 'search',
            className: 'portal-search',
            value: query,
            onChange: function (e) { setQuery(e.target.value); },
            placeholder: 'Search assets…'
          }),
          manage ? h('button', {
            type: 'button',
            className: 'portal-btn',
            onClick: function () { setFormOpen({ asset: null }); }
          },
            h('span', { className: 'material-icons', 'aria-hidden': 'true' }, 'add'),
            h('span', null, 'New asset')
          ) : null
        ),
        h('p', { className: 'portal-field-help', style: { margin: '0.5rem 0 0' } },
          manage
            ? 'Add event assets for the team. Everyone with a role can copy the text and download the images.'
            : 'Copy the text or download the images you need for events.'
        ),
        flash ? h('div', { className: 'portal-flash success', style: { marginTop: '0.75rem', marginBottom: 0 } }, flash) : null
      ),

      err ? h('div', { className: 'portal-card' },
        h('div', { className: 'portal-flash error' }, err)
      ) : null,

      loading
        ? h('div', { className: 'portal-card' }, 'Loading event assets…')
        : !filtered.length
          ? h('div', { className: 'portal-card' },
              h('p', { style: { color: 'var(--text-secondary)', margin: 0 } },
                list.length
                  ? 'No event assets match that search.'
                  : (manage ? 'No event assets yet. Add the first one.' : 'No event assets yet.')
              )
            )
          : h('div', {
              style: {
                display: 'grid',
                gap: '1rem',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))'
              }
            },
              filtered.map(function (a) {
                return h(AssetCard, {
                  key: a.id,
                  asset: a,
                  manage: manage,
                  onEdit: function (aa) { setFormOpen({ asset: aa }); },
                  onDelete: handleDelete
                });
              })
            ),

      formOpen ? h(window.PVAdminModal, {
        title: formOpen.asset ? 'Edit event asset' : 'New event asset',
        size: 'lg',
        onClose: function () { setFormOpen(null); }
      },
        h(EventAssetForm, {
          initial: formOpen.asset || null,
          onSubmit: handleSubmit,
          onCancel: function () { setFormOpen(null); }
        })
      ) : null
    );
  }

  window.PVAdminEventAssets = EventAssets;
})();
