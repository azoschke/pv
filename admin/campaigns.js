// ============================================================================
//  PVAdminCampaigns — Campaign + chapter editor
//
//  Standalone worker (pv-campaigns-worker.chlorinatorgreen.workers.dev) routes:
//    GET    /campaigns                                  public
//    GET    /campaigns/:slug                            public (campaign + chapter index)
//    GET    /campaigns/:slug/chapters/:chSlug           public (one chapter body)
//    POST   /campaigns                                  officer | admin
//    PATCH  /campaigns/:id                              officer | admin
//    DELETE /campaigns/:id                              officer | admin
//    PUT    /campaigns/reorder            { ids: [] }   officer | admin
//    POST   /campaigns/:id/chapters                     officer | admin
//    PATCH  /chapters/:id                               officer | admin
//    DELETE /chapters/:id                               officer | admin
//    PUT    /campaigns/:id/chapters/reorder { ids: [] } officer | admin
//
//  Auth: forwards the PVAdminAPI session bearer to the campaigns Worker, which
//  validates it against pv-med-database-worker /me (via a Service Binding).
//  This Worker is separate from pv-med-database-worker, so calls go through
//  campaignsRequest (below) rather than PVAdminAPI.request.
// ============================================================================

(function () {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;

  var CAMPAIGNS_API_BASE = 'https://pv-campaigns-worker.chlorinatorgreen.workers.dev';

  var TAG_OPTIONS = [
    { value: 'main',    label: 'Main Campaign' },
    { value: 'side',    label: 'Side Campaign' },
    { value: 'oneshot', label: 'One-Shots' }
  ];
  function tagLabel(t) {
    var found = TAG_OPTIONS.find(function (o) { return o.value === t; });
    return found ? found.label : t;
  }

  // ── Worker request helper ───────────────────────────────────────────────────
  async function campaignsRequest(method, path, body, authed) {
    var headers = { 'Accept': 'application/json' };
    if (body !== undefined && body !== null) headers['Content-Type'] = 'application/json';
    if (authed) {
      var s = PVAdminAPI.getSession();
      if (!s) {
        PVAdminAPI.redirectToLogin();
        throw new Error('Session expired. Please sign in again.');
      }
      headers['Authorization'] = 'Bearer ' + s.token;
    }

    var res = await fetch(CAMPAIGNS_API_BASE + path, {
      method: method,
      headers: headers,
      body: (body === undefined || body === null) ? undefined : JSON.stringify(body)
    });

    if (res.status === 401 && authed) {
      PVAdminAPI.clearSession();
      PVAdminAPI.redirectToLogin();
      throw new Error('Your session is no longer valid. Please sign in again.');
    }

    var text = await res.text();
    var data = null;
    if (text) { try { data = JSON.parse(text); } catch (_e) { data = { raw: text }; } }
    if (!res.ok) {
      var msg = (data && (data.error || data.message)) || ('Request failed (' + res.status + ')');
      var e = new Error(msg);
      e.status = res.status;
      throw e;
    }
    return data;
  }

  // ── Campaign form ───────────────────────────────────────────────────────────
  function CampaignForm(props) {
    var initial = props.initial;        // null for new
    var onSubmit = props.onSubmit;
    var onCancel = props.onCancel;
    var isEdit = !!(initial && initial.id);

    var nameState = useState(initial ? initial.name : '');
    var name = nameState[0], setName = nameState[1];
    var slugState = useState(initial ? initial.slug : '');
    var slug = slugState[0], setSlug = slugState[1];
    var slugTouched = useState(isEdit);  // don't auto-derive once editing/typed
    var touched = slugTouched[0], setTouched = slugTouched[1];
    var tagState = useState(initial ? initial.tag : 'main');
    var tag = tagState[0], setTag = tagState[1];
    var blurbState = useState(initial ? (initial.blurb || '') : '');
    var blurb = blurbState[0], setBlurb = blurbState[1];

    var savingState = useState(false);
    var saving = savingState[0], setSaving = savingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];

    function deriveSlug(v) {
      return String(v || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    }

    function onNameChange(v) {
      setName(v);
      if (!touched) setSlug(deriveSlug(v));
    }

    async function submit(e) {
      e.preventDefault();
      if (!name.trim()) { setErr('Name is required.'); return; }
      var cleanSlug = deriveSlug(slug || name);
      if (!cleanSlug) { setErr('A URL slug is required.'); return; }
      setSaving(true); setErr('');
      try {
        await onSubmit({ name: name.trim(), slug: cleanSlug, tag: tag, blurb: blurb.trim() });
      } catch (e2) {
        setErr(e2.message || 'Failed to save campaign.');
        setSaving(false);
      }
    }

    return h('form', { onSubmit: submit, className: 'portal-card', style: { marginBottom: '1rem' } },
      h('h3', { style: { marginTop: 0 } }, isEdit ? 'Edit campaign' : 'New campaign'),
      err ? h('div', { className: 'portal-flash error' }, err) : null,

      h('div', { className: 'portal-field' },
        h('label', null, 'Name *'),
        h('input', { type: 'text', maxLength: 120, value: name, required: true,
          onChange: function (e) { onNameChange(e.target.value); } })
      ),
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))', gap: '0.75rem' } },
        h('div', { className: 'portal-field' },
          h('label', null, 'URL slug *'),
          h('input', { type: 'text', maxLength: 60, value: slug,
            onChange: function (e) { setTouched(true); setSlug(e.target.value); } }),
          h('p', { style: { margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' } },
            'Used in the link: /campaigns/view.html?c=' + (deriveSlug(slug || name) || '…') +
            (isEdit ? ' — changing it breaks old links.' : ''))
        ),
        h('div', { className: 'portal-field' },
          h('label', null, 'Tag *'),
          h('select', { value: tag, onChange: function (e) { setTag(e.target.value); } },
            TAG_OPTIONS.map(function (o) { return h('option', { key: o.value, value: o.value }, o.label); }))
        )
      ),
      h('div', { className: 'portal-field' },
        h('label', null, 'Landing blurb'),
        h('textarea', { rows: 3, maxLength: 600, value: blurb,
          placeholder: 'Short description shown on the campaign card.',
          onChange: function (e) { setBlurb(e.target.value); } })
      ),

      h('div', { style: { display: 'flex', gap: '0.5rem', marginTop: '0.5rem' } },
        h('button', { type: 'submit', className: 'portal-btn', disabled: saving },
          saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create campaign')),
        h('button', { type: 'button', className: 'portal-btn is-ghost', onClick: onCancel, disabled: saving }, 'Cancel')
      )
    );
  }

  // ── Chapter form ──────────────────────────────────────────────────────────────
  function ChapterForm(props) {
    var initial = props.initial;        // null for new (may be a partial w/o body)
    var onSubmit = props.onSubmit;
    var onCancel = props.onCancel;
    var isEdit = !!(initial && initial.id);

    var titleState = useState(initial ? initial.title : '');
    var title = titleState[0], setTitle = titleState[1];
    var slugState = useState(initial ? (initial.slug || '') : '');
    var slug = slugState[0], setSlug = slugState[1];
    var touchedState = useState(isEdit);
    var touched = touchedState[0], setTouched = touchedState[1];
    var dateState = useState(initial ? (initial.chapter_date || '') : '');
    var date = dateState[0], setDate = dateState[1];
    var bodyState = useState(initial ? (initial.body_md || '') : '');
    var body = bodyState[0], setBody = bodyState[1];
    var tldrState = useState(initial ? (initial.tldr_md || '') : '');
    var tldr = tldrState[0], setTldr = tldrState[1];

    var savingState = useState(false);
    var saving = savingState[0], setSaving = savingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];
    // When editing, the body arrives via a follow-up fetch; reflect that.
    var loadingState = useState(props.loadingBody);
    var loadingBody = loadingState[0], setLoadingBody = loadingState[1];

    // Hydrate body/tldr once the full chapter is fetched by the parent.
    useEffect(function () {
      if (props.fullChapter) {
        setBody(props.fullChapter.body_md || '');
        setTldr(props.fullChapter.tldr_md || '');
        setLoadingBody(false);
      }
    }, [props.fullChapter]);

    function deriveSlug(v) {
      return String(v || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    }
    function onTitleChange(v) {
      setTitle(v);
      if (!touched) setSlug(deriveSlug(v));
    }

    async function submit(e) {
      e.preventDefault();
      if (!title.trim()) { setErr('Title is required.'); return; }
      var cleanSlug = deriveSlug(slug || title);
      if (!cleanSlug) { setErr('A URL slug is required.'); return; }
      setSaving(true); setErr('');
      try {
        await onSubmit({
          title: title.trim(),
          slug: cleanSlug,
          chapter_date: date.trim(),
          body_md: body,
          tldr_md: tldr.trim() ? tldr : null
        });
      } catch (e2) {
        setErr(e2.message || 'Failed to save chapter.');
        setSaving(false);
      }
    }

    return h('form', { onSubmit: submit, className: 'portal-card', style: { marginBottom: '1rem' } },
      h('h3', { style: { marginTop: 0 } }, isEdit ? 'Edit chapter' : 'New chapter'),
      err ? h('div', { className: 'portal-flash error' }, err) : null,

      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))', gap: '0.75rem' } },
        h('div', { className: 'portal-field' },
          h('label', null, 'Title *'),
          h('input', { type: 'text', maxLength: 160, value: title, required: true,
            onChange: function (e) { onTitleChange(e.target.value); } })
        ),
        h('div', { className: 'portal-field' },
          h('label', null, 'Date'),
          h('input', { type: 'text', maxLength: 60, value: date,
            placeholder: 'e.g. March 6, 2025 or Date Unknown',
            onChange: function (e) { setDate(e.target.value); } })
        )
      ),
      h('div', { className: 'portal-field' },
        h('label', null, 'URL slug *'),
        h('input', { type: 'text', maxLength: 60, value: slug,
          onChange: function (e) { setTouched(true); setSlug(e.target.value); } }),
        h('p', { style: { margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' } },
          'Permalink: ?c=' + (props.campaignSlug || '…') + '&ch=' + (deriveSlug(slug || title) || '…') +
          (isEdit ? ' — changing it breaks old links.' : ''))
      ),
      h('div', { className: 'portal-field' },
        h('label', null, 'Chapter text (Markdown) *'),
        loadingBody
          ? h('p', { style: { color: 'var(--text-secondary)' } }, 'Loading chapter text…')
          : h('textarea', { rows: 16, value: body,
              style: { fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: '0.9rem' },
              placeholder: 'Paste the chapter markdown here.',
              onChange: function (e) { setBody(e.target.value); } })
      ),
      h('div', { className: 'portal-field' },
        h('label', null, 'TL;DR (optional, Markdown)'),
        loadingBody
          ? null
          : h('textarea', { rows: 6, value: tldr,
              style: { fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: '0.9rem' },
              placeholder: 'Optional short summary. Leave blank for none.',
              onChange: function (e) { setTldr(e.target.value); } })
      ),

      h('div', { style: { display: 'flex', gap: '0.5rem', marginTop: '0.5rem' } },
        h('button', { type: 'submit', className: 'portal-btn', disabled: saving || loadingBody },
          saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create chapter')),
        h('button', { type: 'button', className: 'portal-btn is-ghost', onClick: onCancel, disabled: saving }, 'Cancel')
      )
    );
  }

  // ── Reusable reorder/edit/delete row controls ────────────────────────────────
  function RowControls(props) {
    return h('div', { style: { display: 'flex', gap: '0.35rem', whiteSpace: 'nowrap' } },
      h('button', { type: 'button', className: 'portal-btn is-small is-ghost',
        title: 'Move up', disabled: props.isFirst, onClick: props.onUp }, '↑'),
      h('button', { type: 'button', className: 'portal-btn is-small is-ghost',
        title: 'Move down', disabled: props.isLast, onClick: props.onDown }, '↓'),
      h('button', { type: 'button', className: 'portal-btn is-small is-ghost', onClick: props.onEdit }, 'Edit'),
      h('button', { type: 'button', className: 'portal-btn is-small is-danger', onClick: props.onDelete }, 'Delete')
    );
  }

  // ── Main component ────────────────────────────────────────────────────────────
  function PVAdminCampaigns() {
    var campaignsState = useState([]);
    var campaigns = campaignsState[0], setCampaigns = campaignsState[1];
    var loadingState = useState(true);
    var loading = loadingState[0], setLoading = loadingState[1];
    var errState = useState('');
    var err = errState[0], setErr = errState[1];
    var flashState = useState('');
    var flash = flashState[0], setFlash = flashState[1];

    // selected campaign (slug) whose chapters are shown
    var selectedState = useState(null);
    var selectedSlug = selectedState[0], setSelectedSlug = selectedState[1];
    var chaptersState = useState([]);    // metadata for selected campaign
    var chapters = chaptersState[0], setChapters = chaptersState[1];
    var chaptersLoadingState = useState(false);
    var chaptersLoading = chaptersLoadingState[0], setChaptersLoading = chaptersLoadingState[1];

    // forms
    var campaignFormState = useState(null);  // null | { campaign }
    var campaignForm = campaignFormState[0], setCampaignForm = campaignFormState[1];
    var chapterFormState = useState(null);   // null | { campaign, chapter? }
    var chapterForm = chapterFormState[0], setChapterForm = chapterFormState[1];
    var fullChapterState = useState(null);   // fetched body for chapter edit
    var fullChapter = fullChapterState[0], setFullChapter = fullChapterState[1];

    function flashFor(msg) { setFlash(msg); setTimeout(function () { setFlash(''); }, 3500); }

    async function reloadCampaigns() {
      setErr('');
      try {
        var data = await campaignsRequest('GET', '/campaigns', undefined, false);
        setCampaigns(Array.isArray(data) ? data : []);
      } catch (e) {
        setErr(e.message || 'Failed to load campaigns.');
      } finally {
        setLoading(false);
      }
    }
    useEffect(function () { reloadCampaigns(); }, []);

    async function loadChapters(slug) {
      setChaptersLoading(true);
      try {
        var data = await campaignsRequest('GET', '/campaigns/' + encodeURIComponent(slug), undefined, false);
        setChapters(Array.isArray(data.chapters) ? data.chapters : []);
      } catch (e) {
        setErr(e.message || 'Failed to load chapters.');
        setChapters([]);
      } finally {
        setChaptersLoading(false);
      }
    }

    function selectCampaign(slug) {
      if (selectedSlug === slug) { setSelectedSlug(null); setChapters([]); return; }
      setSelectedSlug(slug);
      setChapterForm(null);
      loadChapters(slug);
    }

    function campaignById(id) { return campaigns.find(function (c) { return c.id === id; }); }
    function campaignBySlug(slug) { return campaigns.find(function (c) { return c.slug === slug; }); }

    // ── Campaign CRUD ───────────────────────────────────────────────────────────
    async function submitCampaign(payload) {
      var editing = campaignForm && campaignForm.campaign;
      if (editing) {
        await campaignsRequest('PATCH', '/campaigns/' + editing.id, payload, true);
        flashFor('Campaign updated.');
      } else {
        await campaignsRequest('POST', '/campaigns', payload, true);
        flashFor('Campaign created.');
      }
      setCampaignForm(null);
      await reloadCampaigns();
      if (editing && selectedSlug === editing.slug && payload.slug !== editing.slug) {
        setSelectedSlug(payload.slug);
      }
    }

    async function deleteCampaign(c) {
      if (!confirm('Delete campaign “' + c.name + '” and ALL its chapters? This cannot be undone.')) return;
      try {
        await campaignsRequest('DELETE', '/campaigns/' + c.id, undefined, true);
        flashFor('Campaign deleted.');
        if (selectedSlug === c.slug) { setSelectedSlug(null); setChapters([]); }
        await reloadCampaigns();
      } catch (e) { setErr(e.message || 'Failed to delete campaign.'); }
    }

    async function reorderCampaigns(fromIdx, toIdx) {
      if (toIdx < 0 || toIdx >= campaigns.length) return;
      var ids = campaigns.map(function (c) { return c.id; });
      var moved = ids.splice(fromIdx, 1)[0];
      ids.splice(toIdx, 0, moved);
      // optimistic
      var reordered = ids.map(function (id) { return campaignById(id); });
      setCampaigns(reordered);
      try {
        await campaignsRequest('PUT', '/campaigns/reorder', { ids: ids }, true);
      } catch (e) { setErr(e.message || 'Failed to reorder.'); await reloadCampaigns(); }
    }

    // ── Chapter CRUD ──────────────────────────────────────────────────────────────
    async function openChapterEdit(campaign, ch) {
      setFullChapter(null);
      setChapterForm({ campaign: campaign, chapter: ch });
      try {
        var full = await campaignsRequest('GET',
          '/campaigns/' + encodeURIComponent(campaign.slug) + '/chapters/' + encodeURIComponent(ch.slug),
          undefined, false);
        setFullChapter(full);
      } catch (e) { setErr(e.message || 'Failed to load chapter text.'); }
    }

    async function submitChapter(payload) {
      var campaign = chapterForm.campaign;
      var editing = chapterForm.chapter;
      if (editing) {
        await campaignsRequest('PATCH', '/chapters/' + editing.id, payload, true);
        flashFor('Chapter updated.');
      } else {
        await campaignsRequest('POST', '/campaigns/' + campaign.id + '/chapters', payload, true);
        flashFor('Chapter created.');
      }
      setChapterForm(null);
      setFullChapter(null);
      await loadChapters(campaign.slug);
      await reloadCampaigns(); // refresh chapter_count
    }

    async function deleteChapter(campaign, ch) {
      if (!confirm('Delete chapter “' + ch.title + '”? This cannot be undone.')) return;
      try {
        await campaignsRequest('DELETE', '/chapters/' + ch.id, undefined, true);
        flashFor('Chapter deleted.');
        await loadChapters(campaign.slug);
        await reloadCampaigns();
      } catch (e) { setErr(e.message || 'Failed to delete chapter.'); }
    }

    async function reorderChapters(campaign, fromIdx, toIdx) {
      if (toIdx < 0 || toIdx >= chapters.length) return;
      var ids = chapters.map(function (c) { return c.id; });
      var moved = ids.splice(fromIdx, 1)[0];
      ids.splice(toIdx, 0, moved);
      var byId = {}; chapters.forEach(function (c) { byId[c.id] = c; });
      setChapters(ids.map(function (id) { return byId[id]; }));
      try {
        await campaignsRequest('PUT', '/campaigns/' + campaign.id + '/chapters/reorder', { ids: ids }, true);
      } catch (e) { setErr(e.message || 'Failed to reorder.'); await loadChapters(campaign.slug); }
    }

    // ── Render ────────────────────────────────────────────────────────────────────
    if (loading) return h('div', { className: 'portal-card' }, 'Loading campaigns…');

    // Form views take over the panel when open.
    if (campaignForm) {
      return h('div', null,
        h(CampaignForm, {
          initial: campaignForm.campaign || null,
          onSubmit: submitCampaign,
          onCancel: function () { setCampaignForm(null); }
        })
      );
    }
    if (chapterForm) {
      return h('div', null,
        h(ChapterForm, {
          initial: chapterForm.chapter || null,
          fullChapter: fullChapter,
          loadingBody: !!chapterForm.chapter, // editing waits for body fetch
          campaignSlug: chapterForm.campaign.slug,
          onSubmit: submitChapter,
          onCancel: function () { setChapterForm(null); setFullChapter(null); }
        })
      );
    }

    return h('div', null,
      flash ? h('div', { className: 'portal-flash success' }, flash) : null,
      err ? h('div', { className: 'portal-flash error' }, err) : null,

      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' } },
        h('p', { style: { margin: 0, color: 'var(--text-secondary)' } },
          campaigns.length + (campaigns.length === 1 ? ' campaign' : ' campaigns')),
        h('button', { type: 'button', className: 'portal-btn',
          onClick: function () { setCampaignForm({ campaign: null }); } }, '+ New campaign')
      ),

      !campaigns.length
        ? h('div', { className: 'portal-card' }, 'No campaigns yet. Create one to get started.')
        : campaigns.map(function (c, idx) {
            var isSelected = selectedSlug === c.slug;
            return h('div', { key: c.id, className: 'portal-card', style: { marginBottom: '0.75rem' } },
              h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' } },
                h('div', { style: { flex: '1 1 16rem' } },
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' } },
                    h('span', { style: { fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em',
                      color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '0.3rem', padding: '0.1rem 0.4rem' } },
                      tagLabel(c.tag)),
                    h('strong', { style: { fontSize: '1.05rem' } }, c.name)
                  ),
                  h('p', { style: { margin: '0.35rem 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' } },
                    (c.chapter_count != null ? c.chapter_count : (c.chapters ? c.chapters.length : 0)) + ' chapters · /campaigns/view.html?c=' + c.slug)
                ),
                h(RowControls, {
                  isFirst: idx === 0, isLast: idx === campaigns.length - 1,
                  onUp: function () { reorderCampaigns(idx, idx - 1); },
                  onDown: function () { reorderCampaigns(idx, idx + 1); },
                  onEdit: function () { setCampaignForm({ campaign: c }); },
                  onDelete: function () { deleteCampaign(c); }
                })
              ),
              h('div', { style: { marginTop: '0.6rem' } },
                h('button', { type: 'button', className: 'portal-btn is-small is-ghost',
                  onClick: function () { selectCampaign(c.slug); } },
                  isSelected ? '▾ Hide chapters' : '▸ Manage chapters')
              ),

              isSelected ? h('div', { style: { marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' } },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' } },
                  h('span', { style: { color: 'var(--text-secondary)', fontSize: '0.9rem' } }, 'Chapters'),
                  h('button', { type: 'button', className: 'portal-btn is-small',
                    onClick: function () { setFullChapter(null); setChapterForm({ campaign: c, chapter: null }); } }, '+ New chapter')
                ),
                chaptersLoading
                  ? h('p', { style: { color: 'var(--text-secondary)' } }, 'Loading chapters…')
                  : (!chapters.length
                      ? h('p', { style: { color: 'var(--text-secondary)' } }, 'No chapters yet.')
                      : chapters.map(function (ch, cidx) {
                          return h('div', { key: ch.id, style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            gap: '0.75rem', padding: '0.45rem 0', borderBottom: '1px solid var(--border-color)' } },
                            h('div', null,
                              h('div', { style: { fontWeight: 600 } }, ch.title,
                                ch.has_tldr ? h('span', { style: { marginLeft: '0.4rem', fontSize: '0.7rem', color: 'var(--text-secondary)' } }, '· TL;DR') : null),
                              h('div', { style: { fontSize: '0.82rem', color: 'var(--text-secondary)' } }, ch.chapter_date || '—')
                            ),
                            h(RowControls, {
                              isFirst: cidx === 0, isLast: cidx === chapters.length - 1,
                              onUp: function () { reorderChapters(c, cidx, cidx - 1); },
                              onDown: function () { reorderChapters(c, cidx, cidx + 1); },
                              onEdit: function () { openChapterEdit(c, ch); },
                              onDelete: function () { deleteChapter(c, ch); }
                            })
                          );
                        }))
              ) : null
            );
          })
    );
  }

  window.PVAdminCampaigns = PVAdminCampaigns;
})();
