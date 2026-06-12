// ============================================================================
//  PVAdminQuestForm + PVAdminQuestUtils — shared quest editing pieces
//
//  Used by my-profile.js (member submissions / proposed edits, no status
//  field) and bounties.js (officer management, with status field). Loaded
//  before both in portal.html.
//
//  Dates: quests store scheduled_at as UTC "YYYY-MM-DD HH:MM:SS". The form
//  uses a datetime-local input, so values are converted to/from the viewer's
//  local timezone here and every reader sees the time localized.
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;

  var UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp';
  var UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
  var UPLOAD_TARGET_WIDTH = 1400;
  var UPLOAD_WEBP_QUALITY = 0.8;

  var SCHEDULE_MODES = ['scheduled', 'tbd', 'repeatable'];
  var SCHEDULE_LABEL = {
    scheduled: 'Scheduled (has a date)',
    tbd: 'Date TBD — gauge interest',
    repeatable: 'Repeatable'
  };
  var SCHEDULE_PILL = { scheduled: 'Scheduled', tbd: 'Date TBD', repeatable: 'Repeatable' };

  // ── Date helpers ──────────────────────────────────────────────────────────
  function pad(n) { return String(n).padStart(2, '0'); }

  // UTC "YYYY-MM-DD HH:MM:SS" -> datetime-local input value (viewer's zone)
  function utcToLocalInput(s) {
    if (!s) return '';
    var t = Date.parse(String(s).replace(' ', 'T') + 'Z');
    if (isNaN(t)) return '';
    var d = new Date(t);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  // datetime-local input value (viewer's zone) -> UTC "YYYY-MM-DD HH:MM:SS"
  function localInputToUtc(v) {
    if (!v) return null;
    var d = new Date(v);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 19).replace('T', ' ');
  }

  // UTC "YYYY-MM-DD HH:MM:SS" -> readable local string
  function formatLocal(s) {
    if (!s) return '';
    var t = Date.parse(String(s).replace(' ', 'T') + 'Z');
    if (isNaN(t)) return '';
    return new Date(t).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
  }

  function isPastQuest(q) {
    if (!q || q.schedule_mode !== 'scheduled' || !q.scheduled_at) return false;
    var t = Date.parse(String(q.scheduled_at).replace(' ', 'T') + 'Z');
    return !isNaN(t) && t < Date.now();
  }

  // One-line schedule summary for tables / cards.
  function scheduleSummary(q) {
    if (!q) return '';
    if (q.schedule_mode === 'tbd') return 'Date TBD';
    var when = q.scheduled_at ? formatLocal(q.scheduled_at) : '';
    if (q.schedule_mode === 'repeatable') {
      var parts = ['Repeatable'];
      if (when) parts.push('next: ' + when);
      if (q.cadence_note) parts.push(q.cadence_note);
      return parts.join(' · ');
    }
    return when || 'Scheduled';
  }

  // ── Image upload (same resize-to-WebP pattern as the other modules) ──────
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

  // Generic multipart upload to one of the worker's */images endpoints.
  async function uploadImage(path, file, extraFields) {
    var session = PVAdminAPI.getSession();
    if (!session) {
      PVAdminAPI.redirectToLogin();
      throw new Error('Session expired. Please sign in again.');
    }
    var blob = await resizeImageToWebp(file);
    var form = new FormData();
    form.append('file', blob, 'upload.webp');
    Object.keys(extraFields || {}).forEach(function (k) { form.append(k, extraFields[k]); });
    var res = await fetch(PVAdminAPI.API_BASE + path, {
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

  // ── Image field (URL input + upload button + preview) ────────────────────
  function ImageField(props) {
    var value = props.value;
    var onChange = props.onChange;
    var disabled = props.disabled;
    var uploadPath = props.uploadPath;
    var extraFields = props.extraFields;
    var help = props.help;

    var uploadingState = useState(false);
    var uploading = uploadingState[0], setUploading = uploadingState[1];
    var uploadErrState = useState('');
    var uploadErr = uploadErrState[0], setUploadErr = uploadErrState[1];

    async function handleUpload(file) {
      if (!file) return;
      if (file.size > UPLOAD_MAX_BYTES) {
        setUploadErr('File is larger than 10 MB. Pick a smaller image.');
        return;
      }
      setUploadErr('');
      setUploading(true);
      try {
        var url = await uploadImage(uploadPath, file, extraFields);
        onChange(url);
      } catch (e) {
        setUploadErr(e.message || 'Upload failed.');
      } finally {
        setUploading(false);
      }
    }

    return h('div', { className: 'portal-field' },
      h('label', null, 'Image'),
      h('div', { style: { display: 'flex', gap: '0.5rem', alignItems: 'center' } },
        h('input', {
          type: 'text',
          value: value,
          onChange: function (e) { onChange(e.target.value); },
          placeholder: 'https://…',
          style: { flex: 1 }
        }),
        h('label', {
          className: 'portal-btn is-ghost is-small',
          title: uploading ? 'Uploading…' : 'Upload an image.',
          style: {
            whiteSpace: 'nowrap',
            opacity: (uploading || disabled) ? 0.55 : 1,
            cursor: (uploading || disabled) ? 'not-allowed' : 'pointer'
          }
        },
          uploading ? 'Uploading…' : 'Upload',
          h('input', {
            type: 'file',
            accept: UPLOAD_ACCEPT,
            disabled: uploading || disabled,
            style: { display: 'none' },
            onChange: function (e) {
              var f = e.target.files && e.target.files[0];
              e.target.value = '';
              handleUpload(f);
            }
          })
        )
      ),
      help ? h('p', { className: 'portal-field-help' }, help) : null,
      uploadErr ? h('p', {
        className: 'portal-field-help',
        style: { color: 'var(--danger-color, #c0392b)' }
      }, uploadErr) : null,
      value ? h('img', {
        src: value, alt: '',
        style: {
          display: 'block', marginTop: '0.5rem',
          maxWidth: '320px', maxHeight: '180px',
          border: '1px solid var(--border-color)', borderRadius: '0.3rem',
          objectFit: 'cover'
        },
        onError: function (e) { e.target.style.display = 'none'; }
      }) : null
    );
  }

  // ── Quest form ────────────────────────────────────────────────────────────
  //  Props:
  //    quest       existing quest or null (new)
  //    withStatus  show the status select (officer view)
  //    saveLabel   submit button text
  //    onSave(payload)  payload uses worker field names; scheduled_at is UTC
  //    onCancel
  function QuestForm(props) {
    var quest = props.quest || null;
    var withStatus = !!props.withStatus;

    var draftState = useState({
      title: quest ? (quest.title || '') : '',
      description: quest ? (quest.description || '') : '',
      reward: quest ? (quest.reward || '') : '',
      contact: quest ? (quest.contact || '') : '',
      image_url: quest ? (quest.image_url || '') : '',
      schedule_mode: quest ? (quest.schedule_mode || 'tbd') : 'tbd',
      scheduled_local: quest ? utcToLocalInput(quest.scheduled_at) : '',
      cadence_note: quest ? (quest.cadence_note || '') : '',
      status: quest ? (quest.status || 'listed') : 'listed'
    });
    var draft = draftState[0], setDraft = draftState[1];
    var savingState = useState(false);
    var saving = savingState[0], setSaving = savingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];

    function setField(k, v) {
      setDraft(function (d) { var n = Object.assign({}, d); n[k] = v; return n; });
    }

    async function handleSubmit(e) {
      if (e) e.preventDefault();
      if (!draft.title.trim()) { setErr('Title is required.'); return; }
      if (draft.schedule_mode === 'scheduled' && !draft.scheduled_local) {
        setErr('Pick a date/time, or switch the schedule to Date TBD.');
        return;
      }
      var payload = {
        title: draft.title.trim(),
        description: draft.description,
        reward: draft.reward.trim() || null,
        contact: draft.contact.trim() || null,
        image_url: draft.image_url.trim() || null,
        schedule_mode: draft.schedule_mode,
        scheduled_at: draft.schedule_mode === 'tbd' ? null : localInputToUtc(draft.scheduled_local),
        cadence_note: draft.schedule_mode === 'repeatable' ? (draft.cadence_note.trim() || null) : null
      };
      if (withStatus) payload.status = draft.status;

      setSaving(true); setErr('');
      try {
        await props.onSave(payload);
      } catch (e2) {
        setErr(e2.message || 'Save failed.');
        setSaving(false);
      }
    }

    return h('form', { onSubmit: handleSubmit },
      err ? h('div', { className: 'portal-flash error' }, err) : null,

      h('div', { className: 'portal-field' },
        h('label', null, 'Title *'),
        h('input', {
          type: 'text', value: draft.title, maxLength: 120,
          onChange: function (e) { setField('title', e.target.value); }
        })
      ),

      h('div', { className: 'portal-field' },
        h('label', null, 'Schedule *'),
        h('select', {
          value: draft.schedule_mode,
          onChange: function (e) { setField('schedule_mode', e.target.value); }
        },
          SCHEDULE_MODES.map(function (m) {
            return h('option', { key: m, value: m }, SCHEDULE_LABEL[m]);
          })
        ),
        draft.schedule_mode === 'tbd' ? h('p', { className: 'portal-field-help' },
          'The public board shows “Date TBD — sign up to express interest.” Set a date once enough people sign up.'
        ) : null
      ),

      draft.schedule_mode !== 'tbd' ? h('div', { className: 'portal-field' },
        h('label', null, draft.schedule_mode === 'repeatable' ? 'Next run (optional)' : 'Date & time *'),
        h('input', {
          type: 'datetime-local',
          value: draft.scheduled_local,
          onChange: function (e) { setField('scheduled_local', e.target.value); }
        }),
        h('p', { className: 'portal-field-help' },
          'Entered in your local time; every viewer sees it converted to theirs.'
        )
      ) : null,

      draft.schedule_mode === 'repeatable' ? h('div', { className: 'portal-field' },
        h('label', null, 'Cadence (optional)'),
        h('input', {
          type: 'text', value: draft.cadence_note, maxLength: 160,
          placeholder: 'e.g. Every other Saturday',
          onChange: function (e) { setField('cadence_note', e.target.value); }
        })
      ) : null,

      h('div', { className: 'portal-field' },
        h('label', null, 'Reward'),
        h('input', {
          type: 'text', value: draft.reward, maxLength: 200,
          placeholder: 'e.g. 50,000 gil + salvage rights',
          onChange: function (e) { setField('reward', e.target.value); }
        })
      ),

      h('div', { className: 'portal-field' },
        h('label', null, 'Contact'),
        h('input', {
          type: 'text', value: draft.contact, maxLength: 200,
          placeholder: 'Who to reach in-game / on Discord',
          onChange: function (e) { setField('contact', e.target.value); }
        })
      ),

      h(ImageField, {
        value: draft.image_url,
        onChange: function (v) { setField('image_url', v); },
        disabled: saving,
        uploadPath: '/quests/images',
        extraFields: { quest_title: draft.title.trim() || 'quest' },
        help: 'Paste a URL or upload an image. Shown on the public bounty board card.'
      }),

      h('div', { className: 'portal-field' },
        h('label', null, 'Description'),
        h('textarea', {
          value: draft.description,
          onChange: function (e) {
            var v = e.target.value;
            setDraft(function (d) { return Object.assign({}, d, { description: v }); });
          },
          rows: 6,
          maxLength: 4000,
          placeholder: 'Shown on the public bounty board. Markdown allowed.'
        })
      ),

      withStatus ? h('div', { className: 'portal-field' },
        h('label', null, 'Status'),
        h('select', {
          value: draft.status,
          onChange: function (e) { setField('status', e.target.value); }
        },
          h('option', { value: 'listed' }, 'Listed (public)'),
          h('option', { value: 'pending' }, 'Pending approval'),
          h('option', { value: 'hidden' }, 'Hidden')
        )
      ) : null,

      h('div', { className: 'portal-form-actions' },
        h('button', {
          type: 'submit', className: 'portal-btn', disabled: saving
        }, saving ? 'Saving…' : (props.saveLabel || 'Save')),
        h('button', {
          type: 'button', className: 'portal-btn is-ghost',
          onClick: props.onCancel, disabled: saving
        }, 'Cancel')
      )
    );
  }

  window.PVAdminQuestForm = QuestForm;
  window.PVAdminQuestUtils = {
    SCHEDULE_PILL: SCHEDULE_PILL,
    ImageField: ImageField,
    utcToLocalInput: utcToLocalInput,
    localInputToUtc: localInputToUtc,
    formatLocal: formatLocal,
    isPastQuest: isPastQuest,
    scheduleSummary: scheduleSummary
  };
})();
