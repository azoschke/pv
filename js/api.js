// ============================================================================
//  PVAdminAPI — shared client helpers for the med worker
//
//  Exposes a global `PVAdminAPI` object used by login.html, portal.js, and
//  the section modules. Deliberately plain JS (no modules, no build step)
//  so it can be dropped into a <script> tag on any admin page.
//
//  The session itself lives in js/pv-session.js (PVSession), which must load
//  first; the session helpers here pass straight through to it. A sign-in
//  survives new tabs and browser restarts up to the token's expires_at, and
//  logout() clears it explicitly.
//
//  Image uploads: uploadImage() shrinks the picked file and re-encodes it as
//  WebP (JPEG where the browser can't encode WebP, or where the kind asks for
//  JPEG) before posting it to the worker's /images route. Each kind's sizing
//  lives in js/admin/image-upload.js.
// ============================================================================

(function (global) {
  var API_BASE = 'https://pv-med-database-worker.chlorinatorgreen.workers.dev';
  var Session = global.PVSession;

  var UPLOAD_TARGET_WIDTH = 1400;
  var UPLOAD_QUALITY = 0.8;

  // Signed-in requests send the token, and a 401 means the session has expired
  // (back to the login page). Public routes report their own 401s, such as a
  // wrong password on /auth/login.
  async function request(method, path, body, authed) {
    return Session.request(API_BASE, method, path, body, { auth: !!authed, loginOn401: !!authed });
  }

  async function me() {
    return request('GET', '/me', undefined, true);
  }

  async function logout() {
    try {
      await request('POST', '/auth/logout', {}, true);
    } catch (_e) {
      // Even if the server call fails (network, expired token), clear locally.
    }
    Session.clear();
    // Deliberate sign-outs land on the public home page; only expired/invalid
    // sessions (a 401 from request) bounce to the login form.
    window.location.replace('index.html');
  }

  // Decode the picked file and re-encode it as WebP, falling back to JPEG
  // where the browser has no WebP encoder (notably Safari, which silently
  // hands back a PNG the worker would reject). opts:
  //   maxWidth   cap on the width, height follows (default 1400)
  //   square     centre-crop to a square, side capped at opts.maxSize
  //   width, height
  //              centre-crop to that shape, at most that size (link previews)
  //   jpeg       always encode JPEG (link previews, which not every site reads
  //              as WebP)
  //   raw        send the file as picked, untouched (PNG favicons)
  //   quality    encoder quality (default 0.8)
  async function resizeImage(file, opts) {
    opts = opts || {};
    if (opts.raw) return file;
    var quality = opts.quality || UPLOAD_QUALITY;
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
    var canvas = document.createElement('canvas');
    var ctx;
    if (opts.square) {
      var side = Math.min(srcW, srcH);
      var sx = Math.round((srcW - side) / 2);
      var sy = Math.round((srcH - side) / 2);
      var out = Math.min(side, opts.maxSize || UPLOAD_TARGET_WIDTH);
      canvas.width = out; canvas.height = out;
      ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get a 2D canvas context.');
      ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, out, out);
    } else if (opts.width && opts.height) {
      var aspect = opts.width / opts.height;
      var cropW = srcW, cropH = srcH;
      if (srcW / srcH > aspect) cropW = Math.round(srcH * aspect);
      else cropH = Math.round(srcW / aspect);
      var outW = Math.min(opts.width, cropW);
      var outH = Math.max(1, Math.round(outW / aspect));
      canvas.width = outW; canvas.height = outH;
      ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get a 2D canvas context.');
      ctx.drawImage(bitmap, Math.round((srcW - cropW) / 2), Math.round((srcH - cropH) / 2), cropW, cropH,
        0, 0, outW, outH);
    } else {
      var maxW = opts.maxWidth || UPLOAD_TARGET_WIDTH;
      var w = srcW > maxW ? maxW : srcW;
      var hgt = Math.max(1, Math.round((w / srcW) * srcH));
      canvas.width = w; canvas.height = hgt;
      ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get a 2D canvas context.');
      ctx.drawImage(bitmap, 0, 0, w, hgt);
    }
    if (bitmap.close) { try { bitmap.close(); } catch (_e) {} }
    function encode(type) {
      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (b) {
          if (!b) reject(new Error('Could not encode the image.'));
          else resolve(b);
        }, type, quality);
      });
    }
    if (opts.jpeg) return encode('image/jpeg');
    var blob = await encode('image/webp');
    if (blob.type !== 'image/webp') blob = await encode('image/jpeg');
    return blob;
  }

  // POST an image to a worker upload route with the form fields it expects
  // (for /images: { kind, name }). Returns the stored URL.
  async function uploadImage(path, file, extraFields, resizeOpts) {
    if (!Session.get()) {
      Session.redirectToLogin();
      throw new Error('Session expired. Please sign in again.');
    }
    var blob = await resizeImage(file, resizeOpts);
    var form = new FormData();
    var ext = { 'image/jpeg': 'jpg', 'image/png': 'png' }[blob.type] || 'webp';
    form.append('file', blob, 'upload.' + ext);
    Object.keys(extraFields || {}).forEach(function (k) { form.append(k, extraFields[k]); });
    var data = await Session.request(API_BASE, 'POST', path, form,
      { auth: true, loginOn401: true, failText: 'Upload failed' });
    if (!data || !data.url) throw new Error('Upload succeeded but response was missing a URL.');
    return data.url;
  }

  global.PVAdminAPI = {
    API_BASE: API_BASE,
    getSession: Session.get,
    setSession: Session.set,
    clearSession: Session.clear,
    can: function (key) { return Session.can(key); },
    canAny: Session.canAny,
    redirectToLogin: Session.redirectToLogin,
    request: request,
    me: me,
    logout: logout,
    uploadImage: uploadImage
  };
})(window);
