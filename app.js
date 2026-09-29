class Component extends DCLogic {
  constructor(props) {
    super(props);
    const D = window.Darkroom;
    const ls = (k, d) => { try { const v = localStorage.getItem('darkroom.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
    this.S = {
      photos: [], cur: -1, view: 'edit', split: 0.5, zoom: 1, panX: 0, panY: 0,
      cat: 'all', q: '', favs: ls('favs', []), custom: ls('custom', []), thumbs: {},
      rtab: 'develop', mtab: 'looks',
      open: { basic: true, curve: false, mixer: false, grading: false, effects: true, retro: false, stamp: false, detail: false, calib: false, crop: true, frame: true },
      curveCh: 'crgb', mixTab: 'hue', exp: ls('exp', { format: 'jpeg', size: 'orig', quality: 92 }),
      busy: null, progress: 0, toast: null, saving: false, saveName: '', result: null, drag: false, hover: null
    };
    this.files = {}; this.previews = {}; this.dims = {}; this.hist = {}; this.clip = null;
    this.refDisplay = (el) => { this.display = el; if (el) this.schedule(); };
    this.refViewer = (el) => {
      if (this.viewer === el) return;
      if (this.ro) this.ro.disconnect();
      this.viewer = el;
      if (el && window.ResizeObserver) { this.ro = new ResizeObserver(() => this.schedule()); this.ro.observe(el); }
    };
    this.refHist = (el) => { this.histCanvas = el; if (el) this.scheduleHist(); };
    this.refFile = (el) => { this.fileInput = el; };
    this.refLookFile = (el) => { this.lookInput = el; };
    this.uid = 0;
  }

  /* ---------------- lifecycle ---------------- */
  componentDidMount() {
    this.ensureRenderer();
    if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('40px Caveat'), document.fonts.load('40px VT323')]).then(() => this.schedule()).catch(() => {});
  }
  componentWillUnmount() { if (this.ro) this.ro.disconnect(); if (this.R) this.R.lose(); }
  ensureRenderer() {
    if (this.R || this.rErr) return this.R;
    try { this.R = window.Darkroom.createRenderer(); } catch (e) { this.rErr = e.message; this.toast('This browser can’t run the editor: ' + e.message, true); }
    return this.R;
  }
  up() { this.forceUpdate(); }
  set(patch) { Object.assign(this.S, patch); this.up(); }
  toast(text, err) {
    clearTimeout(this.toastT);
    this.set({ toast: { text, err: !!err } });
    this.toastT = setTimeout(() => this.set({ toast: null }), err ? 6000 : 3200);
  }
  save(k, v) { try { localStorage.setItem('darkroom.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }

  /* ---------------- photos ---------------- */
  get photo() { return this.S.photos[this.S.cur] || null; }
  get edit() { return this.photo ? this.photo.edit : null; }
  pickFiles() { if (this.fileInput) { this.fileInput.value = ''; this.fileInput.click(); } }
  async addFiles(list) {
    const D = window.Darkroom, R = this.ensureRenderer();
    if (!R) return;
    const files = Array.from(list || []).filter((f) => /^image\//.test(f.type) || D.isRaw(f.name) || /\.(jpe?g|png|webp|heic|heif|avif)$/i.test(f.name));
    if (!files.length) { this.toast('Those files aren’t photos this editor can open.', true); return; }
    const maxPrev = Math.min(/Mobi|Android|iPhone|iPad/.test(navigator.userAgent) ? 2048 : 3072, R.maxTex);
    let first = this.S.photos.length;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      this.set({ busy: 'Reading ' + f.name, progress: i / files.length });
      try {
        const { img, exif, note } = await D.decode(f);
        const prev = D.fit(img, maxPrev);
        const blob = await new Promise((r) => prev.toBlob(r, 'image/jpeg', 0.95));
        const thumb = D.fit(img, 180).toDataURL('image/jpeg', 0.8);
        const id = 'p' + (++this.uid) + '-' + Date.now();
        this.files[id] = f; this.previews[id] = blob; this.dims[id] = { w: img.width, h: img.height };
        if (img.close) img.close();
        const edit = D.newEdit(); edit.seed = Math.random();
        const date = D.exifDate(exif);
        this.S.photos.push({ id, name: f.name, thumb, exif, brand: D.brandOf(exif), date, edit });
        if (note) this.toast(note);
      } catch (e) {
        this.toast('Couldn’t open ' + f.name + '. ' + (/heic|heif/i.test(f.name) ? 'This browser can’t read HEIC; export it as JPEG first.' : (e.message || '')), true);
      }
    }
    this.set({ busy: null });
    if (this.S.photos.length > first) await this.select(first);
  }
  async openChart() {
    const c = window.Darkroom.testChart();
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.95));
    await this.addFiles([new File([blob], 'Test Chart.jpg', { type: 'image/jpeg' })]);
  }
  async select(i) {
    if (i < 0 || i >= this.S.photos.length) return;
    const R = this.ensureRenderer(); if (!R) return;
    const ph = this.S.photos[i];
    this.S.cur = i; this.S.hover = null; this.S.zoom = 1; this.S.panX = this.S.panY = 0;
    this.up();
    try {
      const bmp = await (window.createImageBitmap ? createImageBitmap(this.previews[ph.id]) : Promise.reject());
      R.setSource(bmp); if (bmp.close) bmp.close();
    } catch (e) {
      const img = await new Promise((res) => { const u = URL.createObjectURL(this.previews[ph.id]); const im = new Image(); im.onload = () => { res(im); URL.revokeObjectURL(u); }; im.src = u; });
      R.setSource(img);
    }
    this.S.thumbs = {}; this.thumbKey = null;
    this.schedule(); this.scheduleThumbs(0);
    this.up();
  }
  removePhoto() {
    const i = this.S.cur; if (i < 0) return;
    const ph = this.S.photos[i];
    delete this.files[ph.id]; delete this.previews[ph.id]; delete this.hist[ph.id];
    this.S.photos.splice(i, 1);
    if (!this.S.photos.length) { this.S.cur = -1; this.S.thumbs = {}; this.up(); this.clearDisplay(); return; }
    this.select(Math.min(i, this.S.photos.length - 1));
  }
  clearDisplay() { if (this.display) { this.display.width = 1; this.display.height = 1; this.display.style.width = '0px'; } }

  /* ---------------- history ---------------- */
  histOf() { const ph = this.photo; if (!ph) return null; return this.hist[ph.id] || (this.hist[ph.id] = { past: [], future: [] }); }
  begin() {
    const h = this.histOf(); if (!h) return;
    if (!this.changing) { h.past.push(JSON.stringify(this.edit)); if (h.past.length > 80) h.past.shift(); h.future = []; }
    this.changing = true; clearTimeout(this.chgT); this.chgT = setTimeout(() => { this.changing = false; this.up(); }, 450);
  }
  commit() { this.changing = false; this.begin(); this.changing = false; }
  undo() { const h = this.histOf(); if (!h || !h.past.length) return; h.future.push(JSON.stringify(this.edit)); this.photo.edit = JSON.parse(h.past.pop()); this.afterEdit(true); }
  redo() { const h = this.histOf(); if (!h || !h.future.length) return; h.past.push(JSON.stringify(this.edit)); this.photo.edit = JSON.parse(h.future.pop()); this.afterEdit(true); }
  afterEdit(cropMaybe) { this.schedule(); if (cropMaybe) this.scheduleThumbs(500); this.up(); }

  /* ---------------- rendering ---------------- */
  schedule() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; try { this.draw(); } catch (e) { console.error(e); } });
  }
  previewEdit() {
    const e = this.edit; const hv = this.S.hover;
    if (!hv) return { edit: e };
    if (hv.custom) { const c = this.S.custom.find((x) => x.id === hv.id); if (!c) return { edit: e }; const t = JSON.parse(JSON.stringify(e)); t.look = c.base; t.amount = c.amount; t.p = JSON.parse(JSON.stringify(c.p)); return { edit: t }; }
    return { edit: e, look: hv.id };
  }
  draw() {
    const D = window.Darkroom, R = this.R, cv = this.display, vw = this.viewer, ph = this.photo;
    if (!R || !cv || !vw || !ph || !R.hasSource()) return;
    const { edit, look } = this.previewEdit();
    const geo = D.cropGeometry(edit.crop, R.srcW, R.srcH);
    const A = geo.w / geo.h;
    const unit = D.frameLayout(edit.frame, A >= 1 ? 1000 : 1000 * A, A >= 1 ? 1000 / A : 1000);
    const TA = unit.W / unit.H;
    const pad = window.innerWidth < 900 ? 12 : 32;
    const bw = Math.max(40, vw.clientWidth - pad * 2), bh = Math.max(40, vw.clientHeight - pad * 2 - (window.innerWidth < 900 ? 54 : 56));
    let cw = Math.min(bw, bh * TA), ch = cw / TA;
    const z = this.S.zoom, dpr = Math.min(window.devicePixelRatio || 1, 2);
    let scale = dpr * z;
    const maxLong = Math.min(R.maxTex, 4096);
    if (Math.max(cw, ch) * scale > maxLong) scale = maxLong / Math.max(cw, ch);
    const pw = Math.max(8, Math.round(unit.pw / unit.W * cw * scale)), phh = Math.max(8, Math.round(unit.ph / unit.H * ch * scale));
    const lay = D.frameLayout(edit.frame, pw, phh);
    const before = this.S.view === 'before';
    R.render(edit, { w: pw, h: phh, bypass: before, lookOverride: look });
    if (cv.width !== lay.W || cv.height !== lay.H) { cv.width = lay.W; cv.height = lay.H; }
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, lay.W, lay.H);
    const meta = { index: this.S.cur, seed: edit.seed, date: ph.date ? new Date(ph.date + 'T12:00:00') : undefined };
    D.paintFrameBack(ctx, edit.frame, lay);
    ctx.save(); D.photoClip(ctx, edit.frame, lay); ctx.drawImage(R.canvas, 0, 0, pw, phh, lay.x, lay.y, pw, phh); ctx.restore();
    if (!before) D.paintStamp(ctx, edit.stamp, lay, meta);
    if (this.S.view === 'split') {
      R.render(edit, { w: pw, h: phh, bypass: true });
      const sx = Math.round(pw * this.S.split);
      ctx.save(); D.photoClip(ctx, edit.frame, lay); ctx.drawImage(R.canvas, sx, 0, pw - sx, phh, lay.x + sx, lay.y, pw - sx, phh); ctx.restore();
    }
    D.paintFrameFront(ctx, edit.frame, lay, meta);
    const cssW = cw * z, cssH = ch * z;
    cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
    const mx = Math.max(0, (cssW - bw) / 2 + pad), my = Math.max(0, (cssH - bh) / 2 + pad);
    this.S.panX = Math.max(-mx, Math.min(mx, this.S.panX)); this.S.panY = Math.max(-my, Math.min(my, this.S.panY));
    cv.style.transform = 'translate(' + this.S.panX + 'px,' + (this.S.panY - (window.innerWidth < 900 ? 16 : 20)) + 'px)';
    this.dispGeom = { cssW, cssH, lay, pw, phh };
    this.scheduleHist();
  }
  scheduleHist() {
    if (this.histT) { this.histDirty = true; return; }
    this.histT = setTimeout(() => {
      this.histT = 0;
      try { this.drawHist(); } catch (e) { console.error(e); }
      if (this.histDirty) { this.histDirty = false; this.scheduleHist(); }
    }, 90);
  }
  drawHist() {
    const cv = this.histCanvas, R = this.R, ph = this.photo, D = window.Darkroom;
    if (!cv) return;
    const w = Math.round(cv.clientWidth * Math.min(window.devicePixelRatio || 1, 2)) || 320, h = Math.round(72 * Math.min(window.devicePixelRatio || 1, 2));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, w, h);
    if (!R || !ph || !R.hasSource()) return;
    const { edit, look } = this.previewEdit();
    const g = D.cropGeometry(edit.crop, R.srcW, R.srcH), A = g.w / g.h;
    const iw = A >= 1 ? 160 : Math.round(160 * A), ih = A >= 1 ? Math.round(160 / A) : 160;
    const img = R.renderPixels(edit, iw, ih, { lookOverride: look, bypass: this.S.view === 'before' });
    this.lastSample = img;
    const H = D.histogram(img);
    let mx = 1; for (let i = 1; i < 63; i++) mx = Math.max(mx, H.r[i], H.g[i], H.b[i]);
    ctx.globalCompositeOperation = 'lighter';
    const plot = (arr, col) => {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, h);
      for (let i = 0; i < 64; i++) { const x = i / 63 * w, y = h - Math.min(1, arr[i] / mx) * (h - 4); ctx.lineTo(x, y); }
      ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
    };
    plot(H.r, 'rgba(248,113,113,0.55)'); plot(H.g, 'rgba(74,222,128,0.5)'); plot(H.b, 'rgba(96,165,250,0.6)');
    ctx.globalCompositeOperation = 'source-over';
  }
  scheduleThumbs(delay) {
    clearTimeout(this.thumbT);
    this.thumbT = setTimeout(() => this.makeThumbs(), delay || 0);
  }
  thumbEdit() {
    const D = window.Darkroom, e = D.newEdit();
    e.crop = JSON.parse(JSON.stringify(this.edit.crop)); e.seed = this.edit.seed; return e;
  }
  makeThumbs() {
    const D = window.Darkroom, R = this.R;
    if (!R || !this.photo || !R.hasSource()) return;
    const base = this.thumbEdit();
    const key = this.photo.id + JSON.stringify(base.crop);
    if (this.thumbKey !== key) { this.S.thumbs = {}; this.thumbKey = key; }
    const g = D.cropGeometry(base.crop, R.srcW, R.srcH), A = g.w / g.h;
    const tw = A >= 4 / 3 ? Math.round(192 * A * 0.75) : 192, th = Math.round(tw / A);
    const todo = D.LOOKS.map((l) => ({ id: l.id })).concat(this.S.custom.map((c) => ({ id: c.id, custom: c })));
    const run = () => {
      if (this.thumbKey !== key || !this.photo) return;
      const t0 = performance.now(); let n = 0;
      while (todo.length && performance.now() - t0 < 24) {
        const it = todo.shift();
        if (this.S.thumbs[it.id]) continue;
        try {
          if (it.custom) { const e = this.thumbEdit(); e.look = it.custom.base; e.amount = it.custom.amount; e.p = JSON.parse(JSON.stringify(it.custom.p)); this.S.thumbs[it.id] = R.thumb(e, tw, th); }
          else this.S.thumbs[it.id] = R.thumb(base, tw, th, it.id);
        } catch (err) { console.error(err); }
        n++;
      }
      if (n) this.up();
      if (todo.length) setTimeout(run, 16);
    };
    run();
  }

  /* ---------------- looks ---------------- */
  applyLook(id) {
    const D = window.Darkroom, e = this.edit; if (!e) return;
    const custom = this.S.custom.find((c) => c.id === id);
    this.commit();
    if (custom) {
      e.look = custom.base; e.amount = custom.amount; e.p = JSON.parse(JSON.stringify(custom.p)); e.fxApplied = null; e.custom = custom.id;
      if (custom.stamp) { e.stamp = JSON.parse(JSON.stringify(custom.stamp)); }
      this.S.hover = null; this.afterEdit(); return;
    }
    const def = D.lookById(id); if (!def) return;
    const N = D.defaults();
    D.FX_KEYS.forEach((k) => { if (e.fxApplied && e.fxApplied[k] === e.p[k]) e.p[k] = N[k]; });
    e.look = id; e.amount = 100; e.custom = null;
    const fx = {}; for (const k in def.fx) { e.p[k] = def.fx[k]; fx[k] = def.fx[k]; }
    e.fxApplied = fx;
    if (def.frame) {
      if (e.frame.type === 'none' || e.frameFromLook) {
        e.frame.type = def.frame; e.frame.color = def.frame === 'polaroid' ? '#f3f0e8' : '#fbfbf8'; e.frameFromLook = true;
        if (e.crop.aspect === 'orig' || e.cropFromLook) { Object.assign(e.crop, this.instantAspect(def.frame)); e.cropFromLook = true; }
      }
    } else if (e.frameFromLook) { e.frame.type = 'none'; e.frameFromLook = false; if (e.cropFromLook) { e.crop.aspect = 'orig'; e.crop.aspectLock = false; e.cropFromLook = false; } }
    if (def.stamp) {
      if (!e.stamp.on || e.stampFromLook) { e.stamp.on = true; e.stamp.style = def.stamp; e.stamp.color = def.stamp === 'digital' ? '#ffc933' : '#ff7a1a'; e.stamp.fmt = def.stamp === 'digital' ? 'yyyy.mm.dd' : 'yy m d'; e.stampFromLook = true; }
    } else if (e.stampFromLook) { e.stamp.on = false; e.stampFromLook = false; }
    this.S.hover = null;
    this.afterEdit();
  }
  clearLook() {
    const D = window.Darkroom, e = this.edit; if (!e) return;
    this.commit();
    const N = D.defaults();
    if (e.fxApplied) D.FX_KEYS.forEach((k) => { if (e.fxApplied[k] === e.p[k]) e.p[k] = N[k]; });
    e.look = null; e.fxApplied = null; e.custom = null;
    if (e.frameFromLook) { e.frame.type = 'none'; e.frameFromLook = false; if (e.cropFromLook) { e.crop.aspect = 'orig'; e.crop.aspectLock = false; e.cropFromLook = false; } }
    if (e.stampFromLook) { e.stamp.on = false; e.stampFromLook = false; }
    this.afterEdit(true);
  }
  setAmount(v) {
    const D = window.Darkroom, e = this.edit; if (!e || !e.look) return;
    this.begin();
    const old = e.amount / 100, nw = v / 100;
    if (e.fxApplied) {
      const def = D.lookById(e.look);
      D.FX_AMOUNT.forEach((k) => {
        if (e.fxApplied[k] === undefined || e.fxApplied[k] !== e.p[k] || !def) return;
        const nv = Math.round(def.fx[k] * nw * 10) / 10; e.p[k] = nv; e.fxApplied[k] = nv;
      });
    }
    e.amount = v; void old;
    this.afterEdit();
  }
  shuffle() {
    const L = window.Darkroom.LOOKS; if (!this.edit) return;
    let id; do { id = L[Math.floor(Math.random() * L.length)].id; } while (id === this.edit.look && L.length > 1);
    this.applyLook(id);
    this.toast('Trying ' + window.Darkroom.lookById(id).name);
  }
  toggleFav(id) {
    const f = this.S.favs, i = f.indexOf(id);
    if (i >= 0) f.splice(i, 1); else f.push(id);
    this.save('favs', f); this.up();
  }
  confirmSave() {
    const e = this.edit; if (!e) return;
    const name = (this.S.saveName || '').trim() || 'My Look ' + (this.S.custom.length + 1);
    const c = { id: 'my-' + Date.now(), name, base: e.look, amount: e.amount, p: JSON.parse(JSON.stringify(e.p)), stamp: e.stamp.on ? JSON.parse(JSON.stringify(e.stamp)) : null };
    this.S.custom.push(c); this.save('custom', this.S.custom);
    this.S.saving = false; this.S.saveName = ''; e.custom = c.id;
    this.toast('Saved “' + name + '” to My Looks');
    this.scheduleThumbs(0); this.up();
  }
  exportLooks() {
    const blob = new Blob([JSON.stringify({ app: 'darkroom', version: 1, looks: this.S.custom }, null, 2)], { type: 'application/json' });
    window.Darkroom.saveFile(blob, 'darkroom-looks.json').then((r) => this.toast(r === 'declined' ? 'Download cancelled' : 'Looks exported'));
  }
  async importLookFile(file) {
    try {
      const data = JSON.parse(await file.text());
      const arr = (data && data.looks) || [];
      let n = 0;
      arr.forEach((c) => { if (c && c.p && c.name) { c.id = 'my-' + Date.now() + '-' + (n++); this.S.custom.push(c); } });
      this.save('custom', this.S.custom); this.scheduleThumbs(0);
      this.toast(n ? 'Imported ' + n + ' look' + (n > 1 ? 's' : '') : 'No looks found in that file', !n);
    } catch (e) { this.toast('That file isn’t a Darkroom looks file.', true); }
  }

  /* ---------------- params ---------------- */
  setP(key, val, idx) {
    const e = this.edit; if (!e) return;
    this.begin();
    if (idx != null) e.p[key][idx] = val; else e.p[key] = val;
    if (e.custom) e.custom = null;
    this.afterEdit();
  }
  auto() {
    const D = window.Darkroom, R = this.R, e = this.edit; if (!R || !e) return;
    const t = this.thumbEdit(); const img = R.renderPixels(t, 160, 120, { bypass: true });
    const a = D.autoTone(img);
    this.commit(); Object.assign(e.p, a); this.afterEdit();
    this.toast('Auto tone applied. Fine-tune in Basic.');
  }
  resetAll() {
    const D = window.Darkroom, e = this.edit; if (!e) return;
    this.commit();
    const crop = e.crop, frame = e.frame, seed = e.seed;
    this.photo.edit = D.newEdit(); this.photo.edit.crop = crop; this.photo.edit.frame = frame; this.photo.edit.seed = seed;
    this.afterEdit(); this.toast('Look and adjustments reset');
  }
  copy() { const e = this.edit; if (!e) return; this.clip = JSON.parse(JSON.stringify({ look: e.look, amount: e.amount, p: e.p, stamp: e.stamp, fxApplied: e.fxApplied, custom: e.custom })); this.toast('Settings copied'); this.up(); }
  paste() { const e = this.edit; if (!e || !this.clip) return; this.commit(); Object.assign(e, JSON.parse(JSON.stringify(this.clip))); this.afterEdit(); this.toast('Settings pasted'); }
  syncAll() {
    const e = this.edit; if (!e) return;
    const src = JSON.stringify({ look: e.look, amount: e.amount, p: e.p, stamp: e.stamp, frame: e.frame, fxApplied: e.fxApplied, custom: e.custom, frameFromLook: e.frameFromLook, stampFromLook: e.stampFromLook });
    let n = 0;
    this.S.photos.forEach((ph, i) => { if (i === this.S.cur) return; const h = this.hist[ph.id] || (this.hist[ph.id] = { past: [], future: [] }); h.past.push(JSON.stringify(ph.edit)); Object.assign(ph.edit, JSON.parse(src)); n++; });
    this.toast('Synced to ' + n + ' photo' + (n === 1 ? '' : 's') + '. Crops were kept.'); this.up();
  }
  setCrop(patch) { const e = this.edit; if (!e) return; this.begin(); Object.assign(e.crop, patch); this.afterEdit(true); }
  instantAspect(t) { return t === 'polaroid' ? { aspect: '1:1', aspectLock: true, x: 0, y: 0 } : t === 'instaxMini' ? { aspect: '46:62', aspectLock: true, x: 0, y: 0 } : t === 'instaxWide' ? { aspect: '99:62', aspectLock: true, x: 0, y: 0 } : null; }
  setFrame(patch) {
    const e = this.edit; if (!e) return; this.commit();
    Object.assign(e.frame, patch); e.frameFromLook = false;
    if (patch.type) {
      const a = this.instantAspect(patch.type);
      if (a && (e.crop.aspect === 'orig' || e.cropFromLook)) { Object.assign(e.crop, a); e.cropFromLook = true; }
      else if (!a && e.cropFromLook) { e.crop.aspect = 'orig'; e.crop.aspectLock = false; e.cropFromLook = false; }
    }
    this.afterEdit(true);
  }
  setStamp(patch) { const e = this.edit; if (!e) return; this.commit(); Object.assign(e.stamp, patch); e.stampFromLook = false; this.afterEdit(); }

  /* ---------------- export ---------------- */
  baseName(ph) { return (ph.name || 'photo').replace(/\.[^.]+$/, '') + '-darkroom'; }
  ext() { return this.S.exp.format === 'png' ? 'png' : this.S.exp.format === 'webp' ? 'webp' : 'jpg'; }
  async renderExport(ph, onProg) {
    const D = window.Darkroom, R = this.R;
    const dec = await D.decode(this.files[ph.id]);
    const meta = { index: this.S.photos.indexOf(ph), seed: ph.edit.seed, date: ph.date ? new Date(ph.date + 'T12:00:00') : undefined };
    const res = await D.exportImage(R, dec.img, ph.edit, this.S.exp, meta, onProg);
    if (dec.img.close) dec.img.close();
    return res;
  }
  async exportOne() {
    const ph = this.photo; if (!ph || !this.R) return;
    this.set({ busy: 'Developing ' + ph.name, progress: 0 });
    try {
      const res = await this.renderExport(ph, (p) => this.set({ progress: p }));
      const name = this.baseName(ph) + '.' + this.ext();
      this.showResult({ blob: res.blob, name, w: res.w, h: res.h, img: true });
      this.set({ busy: null });
      this.saveBlob(res.blob, name);
    } catch (e) { console.error(e); this.set({ busy: null }); this.toast('Export failed: ' + (e.message || e), true); }
    this.schedule();
  }
  async exportAll() {
    const D = window.Darkroom, phs = this.S.photos.slice(); if (!phs.length || !this.R) return;
    const out = [];
    try {
      for (let i = 0; i < phs.length; i++) {
        this.set({ busy: 'Developing ' + (i + 1) + ' of ' + phs.length, progress: i / phs.length });
        const res = await this.renderExport(phs[i], (p) => this.set({ progress: (i + p) / phs.length }));
        let name = this.baseName(phs[i]) + '.' + this.ext(); while (out.some((o) => o.name === name)) name = name.replace('-darkroom', '-darkroom-' + i);
        out.push({ name, blob: res.blob });
      }
      this.set({ busy: 'Packing ZIP', progress: 1 });
      const zip = await D.zip(out);
      const name = 'darkroom-roll-' + new Date().toISOString().slice(0, 10) + '.zip';
      this.showResult({ blob: zip, name, count: out.length, img: false });
      this.set({ busy: null });
      this.saveBlob(zip, name);
    } catch (e) { console.error(e); this.set({ busy: null }); this.toast('Export failed: ' + (e.message || e), true); }
    this.schedule();
  }
  showResult(r) {
    if (this.S.result && this.S.result.url) URL.revokeObjectURL(this.S.result.url);
    r.url = r.img ? URL.createObjectURL(r.blob) : null;
    this.set({ result: r });
  }
  async saveBlob(blob, name) {
    const r = await window.Darkroom.saveFile(blob, name);
    if (r === 'saved') this.toast('Saved ' + name);
    else if (r === 'declined') this.toast('Save cancelled. Use Save File to try again.');
    else if (r === 'busy') this.toast('A save is already waiting for your answer.');
    else if (r === 'failed') this.toast('Couldn’t start the download here. Right-click or long-press the preview to save it.', true);
  }
  async shareResult() {
    const r = this.S.result; if (!r) return;
    try {
      const file = new File([r.blob], r.name, { type: r.blob.type });
      await navigator.share({ files: [file], title: r.name });
    } catch (e) { if (e && e.name !== 'AbortError') this.toast('Sharing isn’t available here. Save the file instead.', true); }
  }
  canShare() {
    const r = this.S.result; if (!r || !navigator.canShare) return false;
    try { return navigator.canShare({ files: [new File([r.blob], r.name, { type: r.blob.type })] }); } catch (e) { return false; }
  }

  /* ---------------- viewer pointer ---------------- */
  vDown(ev) {
    if (!this.photo || !this.display) return;
    const t = ev.target; if (t.closest && t.closest('.vbar,.empty,.busy')) return;
    this.ptr = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, px: this.S.panX, py: this.S.panY, crop: this.edit ? { x: this.edit.crop.x, y: this.edit.crop.y } : null, moved: false };
    const r = this.display.getBoundingClientRect();
    if (this.S.view === 'split' && r.width) {
      const sx = r.left + (this.dispGeom ? this.dispGeom.lay.x / this.dispGeom.lay.W * r.width + this.S.split * this.dispGeom.pw / this.dispGeom.lay.W * r.width : r.width * this.S.split);
      if (Math.abs(ev.clientX - sx) < 40) this.ptr.mode = 'split';
    }
    if (!this.ptr.mode) this.ptr.mode = this.S.zoom > 1 ? 'pan' : (this.S.rtab === 'frame' && this.edit.crop.zoom > 1 ? 'crop' : this.S.view === 'split' ? 'split' : null);
    if (!this.ptr.mode) { this.ptr = null; return; }
    if (this.ptr.mode === 'crop') this.commit();
    try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
  }
  vMove(ev) {
    const p = this.ptr; if (!p || p.id !== ev.pointerId) return;
    const dx = ev.clientX - p.x, dy = ev.clientY - p.y;
    if (p.mode === 'pan') { this.S.panX = p.px + dx; this.S.panY = p.py + dy; this.schedule(); }
    else if (p.mode === 'split' && this.display && this.dispGeom) {
      const r = this.display.getBoundingClientRect(), g = this.dispGeom;
      const x0 = r.left + g.lay.x / g.lay.W * r.width, wpx = g.pw / g.lay.W * r.width;
      this.S.split = Math.max(0.02, Math.min(0.98, (ev.clientX - x0) / wpx)); this.schedule(); this.up();
    } else if (p.mode === 'crop' && this.dispGeom) {
      const e = this.edit, k = 2 / Math.max(1, (e.crop.zoom - 1) * 1.5 + 0.6);
      e.crop.x = Math.max(-1, Math.min(1, p.crop.x - dx / this.dispGeom.cssW * k));
      e.crop.y = Math.max(-1, Math.min(1, p.crop.y - dy / this.dispGeom.cssH * k));
      this.schedule();
    }
  }
  vUp(ev) {
    const p = this.ptr; if (!p) return;
    this.ptr = null;
    if (p.mode === 'crop') this.scheduleThumbs(300);
  }
  vWheel(ev) {
    if (!this.photo) return;
    if (ev.ctrlKey || ev.metaKey) {
      const z = Math.max(1, Math.min(4, this.S.zoom * (ev.deltaY < 0 ? 1.12 : 1 / 1.12)));
      this.S.zoom = z; if (z === 1) { this.S.panX = 0; this.S.panY = 0; }
      this.schedule(); this.up();
    } else if (this.S.zoom > 1) { this.S.panX -= ev.deltaX; this.S.panY -= ev.deltaY; this.schedule(); }
  }
  cycleZoom() { const z = this.S.zoom < 1.5 ? 2 : this.S.zoom < 3 ? 4 : 1; this.S.zoom = z; if (z === 1) { this.S.panX = 0; this.S.panY = 0; } this.schedule(); this.up(); }

  /* ---------------- curve editor ---------------- */
  curvePt(ev) { const r = ev.currentTarget.getBoundingClientRect(); return [Math.max(0, Math.min(255, (ev.clientX - r.left) / r.width * 255)), Math.max(0, Math.min(255, 255 - (ev.clientY - r.top) / r.height * 255))]; }
  cDown(ev) {
    const e = this.edit; if (!e) return;
    const ch = this.S.curveCh, pts = e.p[ch], [x, y] = this.curvePt(ev);
    let best = -1, bd = 14;
    pts.forEach((q, i) => { const d = Math.hypot(q[0] - x, q[1] - y); if (d < bd) { bd = d; best = i; } });
    this.commit();
    if (best < 0) { const near = pts.findIndex((q) => Math.abs(q[0] - x) < 4); if (near >= 0) best = near; }
    if (best < 0) { const f = window.Darkroom.monotone(pts); pts.push([Math.round(x), Math.round(Math.abs(f(x / 255) * 255 - y) < 24 ? f(x / 255) * 255 : y)]); pts.sort((a, b) => a[0] - b[0]); best = pts.findIndex((q) => q[0] === Math.round(x)); }
    this.cdrag = { i: best, id: ev.pointerId };
    try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch (er) { /* ignore */ }
    this.afterEdit();
  }
  cMove(ev) {
    const d = this.cdrag, e = this.edit; if (!d || !e || d.id !== ev.pointerId) return;
    const pts = e.p[this.S.curveCh], [x, y] = this.curvePt(ev);
    const i = d.i, n = pts.length;
    const lo = i === 0 ? 0 : pts[i - 1][0] + 2, hi = i === n - 1 ? 255 : pts[i + 1][0] - 2;
    const fixedX = i === 0 || i === n - 1;
    pts[i] = [fixedX ? pts[i][0] : Math.round(Math.max(lo, Math.min(hi, x))), Math.round(y)];
    this.afterEdit();
  }
  cUp() { this.cdrag = null; }
  cDbl(ev) {
    const e = this.edit; if (!e) return;
    const pts = e.p[this.S.curveCh], [x, y] = this.curvePt(ev);
    const i = pts.findIndex((q, k) => k > 0 && k < pts.length - 1 && Math.hypot(q[0] - x, q[1] - y) < 16);
    this.commit();
    if (i > 0) pts.splice(i, 1); else if (pts.length <= 3) e.p[this.S.curveCh] = [[0, 0], [255, 255]];
    this.afterEdit();
  }

  /* ---------------- grading wheels ---------------- */
  wheelSet(key, ev) {
    const e = this.edit; if (!e) return;
    const r = ev.currentTarget.getBoundingClientRect();
    const dx = ev.clientX - (r.left + r.width / 2), dy = ev.clientY - (r.top + r.height / 2);
    const rad = Math.min(1, Math.hypot(dx, dy) / (r.width / 2));
    let h = Math.atan2(dy, dx) * 180 / Math.PI; if (h < 0) h += 360;
    e.p[key] = [Math.round(h), Math.round(rad * 100), e.p[key][2]];
    this.afterEdit();
  }

  /* ---------------- keyboard ---------------- */
  onKey(ev) {
    const tg = ev.target, typing = tg && (tg.tagName === 'INPUT' && !/range|button|checkbox|color/.test(tg.type) || tg.tagName === 'TEXTAREA');
    const mod = ev.metaKey || ev.ctrlKey, k = ev.key;
    if (k === 'Escape') { if (this.S.result) this.closeResult(); else if (this.S.hover) this.set({ hover: null }); return; }
    if (typing) return;
    if (mod && (k === 'z' || k === 'Z')) { ev.preventDefault(); if (ev.shiftKey) this.redo(); else this.undo(); return; }
    if (mod && (k === 'y' || k === 'Y')) { ev.preventDefault(); this.redo(); return; }
    if (mod && k === 'c' && !String(window.getSelection && window.getSelection())) { this.copy(); return; }
    if (mod && k === 'v') { this.paste(); return; }
    if (mod) return;
    if (k === '\\') { this.set({ view: this.S.view === 'before' ? 'edit' : 'before' }); this.schedule(); }
    else if (k === 'y' || k === 'Y') { this.set({ view: this.S.view === 'split' ? 'edit' : 'split' }); this.schedule(); }
    else if (k === 'ArrowRight' && tg.type !== 'range') { this.select(Math.min(this.S.photos.length - 1, this.S.cur + 1)); }
    else if (k === 'ArrowLeft' && tg.type !== 'range') { this.select(Math.max(0, this.S.cur - 1)); }
    else if (k === 'z' || k === 'Z') this.cycleZoom();
  }
  closeResult() { if (this.S.result && this.S.result.url) URL.revokeObjectURL(this.S.result.url); this.set({ result: null }); }

  /* ---------------- view model ---------------- */
  slider(key, label, min, max, step, o) {
    o = o || {};
    const D = window.Darkroom, e = this.edit, N = D.defaults();
    const idx = o.idx;
    const cur = e ? (idx != null ? e.p[key][idx] : e.p[key]) : (idx != null ? N[key][idx] : N[key]);
    const def = o.def != null ? o.def : (idx != null ? N[key][idx] : N[key]);
    const v = Number(cur) || 0;
    const pct = (x) => ((x - min) / (max - min)) * 100;
    let style;
    if (o.track) style = '--trk: ' + o.track;
    else { const z = pct(Math.max(min, Math.min(max, min < 0 ? 0 : min))), p = pct(v); style = '--a: ' + Math.min(z, p).toFixed(2) + '%; --b: ' + Math.max(z, p).toFixed(2) + '%'; }
    const fmt = o.fmt || ((x) => (step < 1 ? (x > 0 ? '+' : '') + x.toFixed(2) : (min < 0 && x > 0 ? '+' : '') + Math.round(x)));
    return {
      slider: true, head: false, id: 's-' + key + (idx != null ? '-' + idx : ''), label, min, max, step, value: v, style, display: fmt(v),
      cls: Math.abs(v - def) > 1e-6 ? 'chg' : '',
      onChange: (ev) => { const nv = parseFloat(ev.target.value); if (o.set) o.set(nv); else this.setP(key, nv, idx); },
      reset: () => { if (o.set) o.set(def); else { this.commit(); this.setP(key, def, idx); } }
    };
  }
  head(label) { return { head: true, slider: false, label }; }
  devSections() {
    const e = this.edit, S = this.S, B = window.Darkroom.BANDS;
    const hueOf = [0, 30, 60, 120, 180, 225, 270, 315];
    const names = ['Red', 'Orange', 'Yellow', 'Green', 'Aqua', 'Blue', 'Purple', 'Magenta'];
    const secs = [];
    const mk = (id, title, rows, extra) => {
      const open = !!S.open[id];
      secs.push(Object.assign({ id, title, rows: open ? rows() : [], open, hdCls: open ? 'open' : '', badge: '', toggle: () => { S.open[id] = !S.open[id]; this.up(); }, isCurve: false, isMixer: false, isGrade: false, isCrop: false, isFrame: false, isStamp: false, isRetro: false }, extra || {}));
    };
    if (S.rtab === 'develop') {
      mk('basic', 'Basic', () => [
        this.head('White Balance'),
        this.slider('temp', 'Temp', -100, 100, 1, { track: 'linear-gradient(to right, #3b82f6, #d6d3d1, #f59e0b)' }),
        this.slider('tint', 'Tint', -100, 100, 1, { track: 'linear-gradient(to right, #22c55e, #d6d3d1, #d946ef)' }),
        this.head('Tone'),
        this.slider('exposure', 'Exposure', -4, 4, 0.01),
        this.slider('contrast', 'Contrast', -100, 100, 1), this.slider('highlights', 'Highlights', -100, 100, 1), this.slider('shadows', 'Shadows', -100, 100, 1),
        this.slider('whites', 'Whites', -100, 100, 1), this.slider('blacks', 'Blacks', -100, 100, 1),
        this.head('Presence'),
        this.slider('texture', 'Texture', -100, 100, 1), this.slider('clarity', 'Clarity', -100, 100, 1), this.slider('dehaze', 'Dehaze', -100, 100, 1),
        this.slider('vibrance', 'Vibrance', -100, 100, 1), this.slider('saturation', 'Saturation', -100, 100, 1)
      ]);
      mk('curve', 'Tone Curve', () => [
        this.head('Regions'),
        this.slider('pc', 'Highlights', -100, 100, 1, { idx: 0 }), this.slider('pc', 'Lights', -100, 100, 1, { idx: 1 }),
        this.slider('pc', 'Darks', -100, 100, 1, { idx: 2 }), this.slider('pc', 'Shadows', -100, 100, 1, { idx: 3 }),
        this.head('Matte'),
        this.slider('fade', 'Fade', 0, 100, 1)
      ], { isCurve: true });
      mk('mixer', 'Color Mixer', () => {
        if (S.mixTab === 'bw') return names.map((n, i) => this.slider('bw', n, -100, 100, 1, { idx: i, track: 'linear-gradient(to right, #111, hsl(' + hueOf[i] + ' 70% 50%), #eee)' }));
        const key = S.mixTab === 'hue' ? 'hue' : S.mixTab === 'sat' ? 'hsat' : 'hlum';
        return names.map((n, i) => {
          const h = hueOf[i];
          const tr = key === 'hue' ? 'linear-gradient(to right, hsl(' + (h - 30) + ' 80% 55%), hsl(' + h + ' 80% 55%), hsl(' + (h + 30) + ' 80% 55%))'
            : key === 'hsat' ? 'linear-gradient(to right, hsl(' + h + ' 0% 55%), hsl(' + h + ' 90% 55%))'
              : 'linear-gradient(to right, hsl(' + h + ' 70% 18%), hsl(' + h + ' 70% 50%), hsl(' + h + ' 70% 82%))';
          return this.slider(key, n, -100, 100, 1, { idx: i, track: tr });
        });
      }, { isMixer: true });
      mk('grading', 'Color Grading', () => {
        const rb = 'linear-gradient(to right, hsl(0 85% 55%), hsl(60 85% 55%), hsl(120 85% 55%), hsl(180 85% 55%), hsl(240 85% 55%), hsl(300 85% 55%), hsl(360 85% 55%))';
        const rows = [this.slider('gblend', 'Blending', 0, 100, 1), this.slider('gbal', 'Balance', -100, 100, 1), this.head('Precise')];
        [['gsh', 'Shadows'], ['gmi', 'Midtones'], ['ghi', 'Highlights'], ['ggl', 'Global']].forEach(([k, n]) => {
          const hv = e ? e.p[k][0] : 0;
          rows.push(this.slider(k, n + ' Hue', 0, 360, 1, { idx: 0, track: rb, fmt: (x) => Math.round(x) + '\u00b0' }));
          rows.push(this.slider(k, n + ' Sat', 0, 100, 1, { idx: 1, track: 'linear-gradient(to right, hsl(' + hv + ' 0% 50%), hsl(' + hv + ' 85% 55%))' }));
        });
        return rows;
      }, { isGrade: true });
      mk('effects', 'Effects', () => [
        this.head('Vignette'),
        this.slider('vignette', 'Amount', -100, 100, 1), this.slider('vigMid', 'Midpoint', 0, 100, 1), this.slider('vigRound', 'Roundness', -100, 100, 1), this.slider('vigFeather', 'Feather', 0, 100, 1),
        this.head('Grain'),
        this.slider('grain', 'Amount', 0, 100, 1), this.slider('grainSize', 'Size', 0, 100, 1), this.slider('grainRough', 'Roughness', 0, 100, 1), this.slider('grainColor', 'Color', 0, 100, 1),
        this.head('Glow'),
        this.slider('halation', 'Halation', 0, 100, 1), this.slider('bloom', 'Bloom', 0, 100, 1), this.slider('diffusion', 'Diffusion', 0, 100, 1)
      ]);
      mk('retro', 'Retro FX', () => [
        this.head('Light Leak'),
        this.slider('leak', 'Amount', 0, 100, 1), this.slider('leakHue', 'Color', 0, 360, 1, { track: 'linear-gradient(to right, hsl(0 90% 55%), hsl(60 90% 55%), hsl(120 90% 55%), hsl(180 90% 55%), hsl(240 90% 55%), hsl(300 90% 55%), hsl(360 90% 55%))', fmt: (x) => Math.round(x) + '°' }),
        this.slider('leakPos', 'Position', 0, 100, 1),
        this.head('Wear'),
        this.slider('dust', 'Dust & Scratches', 0, 100, 1), this.slider('ca', 'Chromatic Ab.', 0, 100, 1), this.slider('warp', 'Lens Warp', -100, 100, 1),
        this.head('Tape'),
        this.slider('scanlines', 'Scanlines', 0, 100, 1), this.slider('tracking', 'Tracking', 0, 100, 1), this.slider('bleed', 'Color Bleed', 0, 100, 1)
      ], { isRetro: true });
      mk('stamp', 'Date Stamp', () => (S.open.stamp ? [this.slider('stampSize', 'Size', 50, 200, 1, { def: 100, set: (v) => { this.begin(); this.edit.stamp.size = v; this.afterEdit(); } })].map((r) => Object.assign(r, { value: e ? e.stamp.size : 100, display: (e ? e.stamp.size : 100) + '%', style: '--a: 0%; --b: ' + (((e ? e.stamp.size : 100) - 50) / 150 * 100) + '%', cls: '' })) : []), { isStamp: true, badge: e && e.stamp.on ? 'On' : '' });
      mk('detail', 'Detail', () => [this.slider('sharpen', 'Sharpening', 0, 150, 1), this.slider('nr', 'Noise Reduction', 0, 100, 1)]);
      mk('calib', 'Calibration', () => [
        this.slider('calSh', 'Shadows Tint', -100, 100, 1, { track: 'linear-gradient(to right, #22c55e, #d6d3d1, #d946ef)' }),
        this.head('Red Primary'), this.slider('calR', 'Hue', -100, 100, 1, { idx: 0 }), this.slider('calR', 'Saturation', -100, 100, 1, { idx: 1 }),
        this.head('Green Primary'), this.slider('calG', 'Hue', -100, 100, 1, { idx: 0 }), this.slider('calG', 'Saturation', -100, 100, 1, { idx: 1 }),
        this.head('Blue Primary'), this.slider('calB', 'Hue', -100, 100, 1, { idx: 0 }), this.slider('calB', 'Saturation', -100, 100, 1, { idx: 1 })
      ]);
      if (e) secs.forEach((s) => { if (!s.badge) s.badge = this.changedBadge(s.id); });
    } else if (S.rtab === 'frame') {
      const c = e ? e.crop : window.Darkroom.defaultCrop(), f = e ? e.frame : window.Darkroom.defaultFrame();
      const cs = (key, label, min, max, step, fmt) => {
        const v = c[key]; const z = min < 0 ? 50 : 0, p = (v - min) / (max - min) * 100;
        return { slider: true, head: false, id: 'c-' + key, label, min, max, step, value: v, display: fmt(v), style: '--a: ' + Math.min(z, p) + '%; --b: ' + Math.max(z, p) + '%', cls: '', onChange: (ev) => this.setCrop({ [key]: parseFloat(ev.target.value) }), reset: () => { this.commit(); this.setCrop({ [key]: key === 'zoom' ? 1 : 0 }); } };
      };
      mk('crop', 'Crop & Rotate', () => [
        cs('angle', 'Straighten', -45, 45, 0.1, (v) => v.toFixed(1) + '°'), cs('zoom', 'Crop Zoom', 1, 3, 0.01, (v) => v.toFixed(2) + '×'),
        cs('x', 'Position X', -1, 1, 0.01, (v) => Math.round(v * 100)), cs('y', 'Position Y', -1, 1, 0.01, (v) => Math.round(v * 100))
      ], { isCrop: true });
      const fs = (key, label, min, max) => {
        const v = f[key]; const p = (v - min) / (max - min) * 100;
        return { slider: true, head: false, id: 'f-' + key, label, min, max, step: 1, value: v, display: String(Math.round(v)), style: '--a: 0%; --b: ' + p + '%', cls: '', onChange: (ev) => { this.begin(); this.edit.frame[key] = parseFloat(ev.target.value); this.afterEdit(); }, reset: () => this.setFrame({ [key]: window.Darkroom.defaultFrame()[key] }) };
      };
      mk('frame', 'Frame', () => {
        const rows = [];
        if (f.type === 'classic' || f.type === 'gallery' || f.type === 'rounded') rows.push(fs('size', 'Border', 0, 20));
        if (f.type === 'rounded') rows.push(fs('radius', 'Corner Radius', 0, 30));
        if (f.type !== 'none' && f.type !== 'strip' && f.type !== 'carrier') rows.push(fs('texture', 'Paper Texture', 0, 100));
        return rows;
      }, { isFrame: true });
    }
    return secs;
  }
  changedBadge(id) {
    const D = window.Darkroom, p = this.edit.p, N = D.defaults();
    const keys = {
      basic: ['temp', 'tint', 'exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'texture', 'clarity', 'dehaze', 'vibrance', 'saturation'],
      curve: ['crgb', 'cr', 'cg', 'cb', 'pc', 'fade'], mixer: ['hue', 'hsat', 'hlum', 'bw', 'mono'], grading: ['gsh', 'gmi', 'ghi', 'ggl', 'gblend', 'gbal'],
      effects: ['vignette', 'grain', 'halation', 'bloom', 'diffusion'], retro: ['leak', 'dust', 'ca', 'warp', 'scanlines', 'tracking', 'bleed'],
      detail: ['sharpen', 'nr'], calib: ['calSh', 'calR', 'calG', 'calB']
    }[id];
    if (!keys) return '';
    return keys.some((k) => JSON.stringify(p[k]) !== JSON.stringify(N[k])) ? 'Edited' : '';
  }
  renderVals() {
    const D = window.Darkroom, S = this.S, ph = this.photo, e = this.edit;
    if (!D) return { v: {} };
    const v = {};
    const bind = (name) => (this['_b_' + name] || (this['_b_' + name] = (...a) => this[name](...a)));
    // top
    v.title = ph ? ph.name : 'Darkroom';
    v.subtitle = ph ? (S.cur + 1) + ' of ' + S.photos.length + (D.cameraName(ph.exif) ? ' · ' + D.cameraName(ph.exif) : '') : 'A retro photo lab for your shoots';
    const h = ph ? this.hist[ph.id] : null;
    v.undo = bind('undo'); v.redo = bind('redo');
    v.noUndo = !h || !h.past.length; v.noRedo = !h || !h.future.length;
    v.pickFiles = bind('pickFiles'); v.openChart = bind('openChart');
    v.noPhoto = !ph; v.hasPhoto = !!ph; v.single = S.photos.length < 2;
    v.goExport = () => this.set({ rtab: 'export', mtab: 'export' });
    v.onKey = bind('onKey');
    // looks panel
    const mob = (t) => (S.mtab === t ? '' : 'm-off');
    v.looksCls = mob('looks');
    v.inspCls = S.mtab === 'looks' ? 'm-off' : '';
    v.q = S.q; v.onSearch = (ev) => this.set({ q: ev.target.value });
    const chipDefs = [['all', 'All'], ['favs', 'Favorites']].concat(D.CATS.map((c) => [c.id, c.name])).concat(S.custom.length ? [['mine', 'My Looks']] : []);
    v.chips = chipDefs.map(([id, label]) => ({ label, cls: S.cat === id ? 'on' : '', sel: S.cat === id, pick: () => this.set({ cat: id }) }));
    v.brandBanner = !!(ph && ph.brand && S.cat !== ph.brand);
    v.camera = ph ? D.cameraName(ph.exif) : '';
    v.brandLabel = ph && ph.brand ? 'Show ' + (D.CATS.find((c) => c.id === ph.brand) || {}).name + ' Looks' : '';
    v.showBrand = () => ph && this.set({ cat: ph.brand });
    const lookDef = e && e.look ? D.lookById(e.look) : null;
    const customDef = e && e.custom ? S.custom.find((c) => c.id === e.custom) : null;
    v.hasLook = !!lookDef;
    v.lookName = customDef ? customDef.name : lookDef ? lookDef.name : 'No Look'; v.noLook = !lookDef;
    v.amount = e ? e.amount : 100; v.amountLabel = lookDef ? 'Amount ' + v.amount + '%' : 'Choose one below';
    v.amountStyle = '--a: 0%; --b: ' + (v.amount / 150 * 100).toFixed(1) + '%';
    v.onAmount = (ev) => this.setAmount(parseFloat(ev.target.value));
    v.resetAmount = () => { this.commit(); this.setAmount(100); };
    v.clearLook = bind('clearLook'); v.shuffle = bind('shuffle');
    const q = S.q.trim().toLowerCase();
    const match = (l) => !q || (l.name + ' ' + (l.sub || '') + ' ' + l.cat).toLowerCase().includes(q);
    const card = (l, custom) => {
      const on = custom ? e && e.custom === l.id : e && !e.custom && e.look === l.id;
      const fav = S.favs.includes(l.id), th = S.thumbs[l.id];
      return {
        id: l.id, name: l.name, sub: custom ? 'My Look' : l.sub, thumb: th || '', hasThumb: !!th, noThumb: !th, on: !!on, cls: on ? 'on' : '',
        aria: l.name + (custom ? '' : ', ' + l.sub), favCls: fav ? 'on' : '', favAria: fav ? 'Remove ' + l.name + ' from favorites' : 'Add ' + l.name + ' to favorites',
        pick: () => this.applyLook(l.id), toggleFav: () => this.toggleFav(l.id),
        enter: () => { if (!ph || ('ontouchstart' in window && navigator.maxTouchPoints > 0)) return; clearTimeout(this.hvT); this.hvT = setTimeout(() => { this.S.hover = { id: l.id, custom }; this.schedule(); }, 90); },
        leave: () => { clearTimeout(this.hvT); if (this.S.hover) { this.S.hover = null; this.schedule(); } }
      };
    };
    let sections = [];
    const mine = S.custom.filter(match).map((c) => card(c, true));
    if (S.cat === 'favs' && !q) {
      const f = D.LOOKS.filter((l) => S.favs.includes(l.id) && match(l)).map((l) => card(l)).concat(mine.filter((c) => S.favs.includes(c.id)));
      if (f.length) sections.push({ title: 'Favorites', note: 'Looks you starred', looks: f });
    } else if (S.cat === 'mine' && !q) {
      if (mine.length) sections.push({ title: 'My Looks', note: 'Saved from your edits', looks: mine });
    } else {
      if ((S.cat === 'all' || q) && mine.length) sections.push({ title: 'My Looks', note: 'Saved from your edits', looks: mine });
      D.CATS.forEach((c) => {
        if (!q && S.cat !== 'all' && S.cat !== c.id) return;
        const ls = D.LOOKS.filter((l) => l.cat === c.id && match(l)).map((l) => card(l));
        if (ls.length) sections.push({ title: c.name, note: c.note, looks: ls });
      });
    }
    v.sections = sections;
    v.noResults = !sections.length;
    v.noResultsText = S.cat === 'favs' ? 'Star a look to keep it here.' : 'No looks match “' + S.q + '”.';
    v.saving = S.saving; v.saveName = S.saveName;
    v.onSaveName = (ev) => this.set({ saveName: ev.target.value });
    v.onSaveKey = (ev) => { if (ev.key === 'Enter') this.confirmSave(); };
    v.startSave = () => this.set({ saving: !S.saving });
    v.confirmSave = bind('confirmSave');
    v.importLooks = () => { if (this.lookInput) { this.lookInput.value = ''; this.lookInput.click(); } };
    v.exportLooks = bind('exportLooks'); v.noCustom = !S.custom.length;
    v.refFile = this.refFile; v.refLookFile = this.refLookFile;
    v.onFiles = (ev) => this.addFiles(ev.target.files);
    v.onLookFile = (ev) => { const f = ev.target.files && ev.target.files[0]; if (f) this.importLookFile(f); };
    // viewer
    v.refViewer = this.refViewer; v.refDisplay = this.refDisplay; v.refHist = this.refHist;
    v.displayCls = ph ? '' : 'hide';
    v.canvasAria = ph ? 'Preview of ' + ph.name : 'No photo';
    v.dragCls = S.drag ? 'drag' : '';
    v.vDown = bind('vDown'); v.vMove = bind('vMove'); v.vUp = bind('vUp'); v.vWheel = bind('vWheel');
    v.vDbl = (ev) => { if (ev.target === this.display) this.cycleZoom(); };
    v.onDragOver = (ev) => { ev.preventDefault(); if (!S.drag) this.set({ drag: true }); };
    v.onDragLeave = () => this.set({ drag: false });
    v.onDrop = (ev) => { ev.preventDefault(); this.set({ drag: false }); this.addFiles(ev.dataTransfer && ev.dataTransfer.files); };
    v.isSplit = !!ph && S.view === 'split'; v.isBefore = !!ph && S.view === 'before';
    let splitPx = '50%';
    if (this.dispGeom && this.display && this.viewer) {
      const g = this.dispGeom, vr = this.viewer.getBoundingClientRect(), r = this.display.getBoundingClientRect();
      splitPx = (r.left - vr.left + (g.lay.x + g.pw * S.split) / g.lay.W * r.width) + 'px';
    }
    v.splitStyle = 'left: ' + splitPx;
    v.tagL = 'left: 12px'; v.tagR = 'right: 12px';
    v.showVbar = !!ph;
    v.vEdit = S.view === 'edit' ? 'on' : ''; v.vSplit = S.view === 'split' ? 'on' : ''; v.vBefore = S.view === 'before' ? 'on' : '';
    v.pEdit = S.view === 'edit'; v.pSplit = S.view === 'split'; v.pBefore = S.view === 'before';
    const setView = (m) => () => { this.set({ view: m }); this.schedule(); };
    v.setEdit = setView('edit'); v.setSplit = setView('split'); v.setBefore = setView('before');
    v.cycleZoom = bind('cycleZoom'); v.zoomLabel = S.zoom <= 1 ? 'Fit' : Math.round(S.zoom * 10) / 10 + '×';
    v.busy = !!S.busy; v.busyText = S.busy || ''; v.progStyle = 'width: ' + Math.round((S.progress || 0) * 100) + '%';
    v.photos = S.photos.map((p, i) => ({ thumb: p.thumb, n: i + 1, on: i === S.cur, cls: i === S.cur ? 'on' : '', aria: 'Photo ' + (i + 1) + ', ' + p.name, edited: !!(p.edit.look || this.hist[p.id] && this.hist[p.id].past.length), pick: () => this.select(i) }));
    v.syncAll = bind('syncAll'); v.removePhoto = bind('removePhoto');
    // inspector tabs
    const rt = (t) => () => this.set({ rtab: t, mtab: t });
    v.tDev = S.rtab === 'develop' ? 'on' : ''; v.tFrame = S.rtab === 'frame' ? 'on' : ''; v.tExp = S.rtab === 'export' ? 'on' : '';
    v.sDev = S.rtab === 'develop'; v.sFrame = S.rtab === 'frame'; v.sExp = S.rtab === 'export';
    v.tabDev = rt('develop'); v.tabFrame = rt('frame'); v.tabExp = rt('export');
    v.isDev = S.rtab !== 'export'; v.isExp = S.rtab === 'export'; v.devOnlyCls = S.rtab === 'develop' ? '' : 'hide';
    v.exifLine = ph ? (D.fmtExif(ph.exif) || (this.dims[ph.id] ? this.dims[ph.id].w + ' × ' + this.dims[ph.id].h : '')) : 'Import a photo to see its histogram';
    v.auto = bind('auto'); v.copy = bind('copy'); v.paste = bind('paste'); v.resetAll = bind('resetAll');
    v.noClip = !this.clip || !ph;
    v.devSecs = this.devSections();
    // curve
    const chs = [['crgb', 'RGB', '#e7e5e4'], ['cr', 'Red', '#f87171'], ['cg', 'Green', '#4ade80'], ['cb', 'Blue', '#60a5fa']];
    v.curveTabs = chs.map(([id, label]) => ({ label, cls: S.curveCh === id ? 'on' : '', on: S.curveCh === id, pick: () => this.set({ curveCh: id }) }));
    const pts = e ? e.p[S.curveCh] : [[0, 0], [255, 255]];
    const fn = D.monotone(pts);
    let d = ''; for (let i = 0; i <= 64; i++) { const x = i / 64; d += (i ? 'L' : 'M') + (x * 256).toFixed(1) + ' ' + (256 - fn(x) * 256).toFixed(1); }
    v.curvePath = d;
    v.curveDots = pts.map(([x, y]) => { const cx = x / 255 * 256, cy = 256 - y / 255 * 256, r = 4.5; return 'M' + (cx - r) + ' ' + cy + 'a' + r + ' ' + r + ' 0 1 0 ' + (2 * r) + ' 0a' + r + ' ' + r + ' 0 1 0 ' + (-2 * r) + ' 0'; }).join('');
    v.curveColor = (chs.find((c) => c[0] === S.curveCh) || chs[0])[2];
    v.cDown = bind('cDown'); v.cMove = bind('cMove'); v.cUp = bind('cUp'); v.cDbl = bind('cDbl');
    // mixer
    v.mixTabs = [['hue', 'Hue'], ['sat', 'Saturation'], ['lum', 'Luminance'], ['bw', 'B&W']].map(([id, label]) => ({ label, cls: S.mixTab === id ? 'on' : '', on: S.mixTab === id, pick: () => this.set({ mixTab: id }) }));
    v.isBwTab = S.mixTab === 'bw';
    v.monoOn = !!(e && e.p.mono > 0); v.monoCls = v.monoOn ? 'on' : '';
    v.toggleMono = () => { if (!e) return; this.commit(); this.setP('mono', e.p.mono > 0 ? 0 : 1); };
    // grading
    v.wheels = [['gsh', 'Shadows'], ['gmi', 'Midtones'], ['ghi', 'Highlights'], ['ggl', 'Global']].map(([key, label]) => {
      const w = e ? e.p[key] : [0, 0, 0], a = w[0] * Math.PI / 180, r = w[1] / 100 * 50;
      const lp = (w[2] + 100) / 2;
      return {
        label, aria: label + ' color wheel, hue ' + w[0] + ', saturation ' + w[1],
        puck: 'left: ' + (50 + Math.cos(a) * r).toFixed(2) + '%; top: ' + (50 + Math.sin(a) * r).toFixed(2) + '%; background: ' + (w[1] > 2 ? 'hsl(' + w[0] + ' 80% 55%)' : '#808080'),
        val: w[1] > 0 ? 'H ' + w[0] + '° · S ' + w[1] : 'Neutral',
        lum: w[2], lumAria: label + ' luminance', lumStyle: '--a: ' + Math.min(50, lp) + '%; --b: ' + Math.max(50, lp) + '%',
        down: (ev) => { if (!e) return; this.commit(); this.wdrag = { key, id: ev.pointerId }; try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch (x) { /* ignore */ } this.wheelSet(key, ev); },
        move: (ev) => { if (this.wdrag && this.wdrag.key === key && this.wdrag.id === ev.pointerId) this.wheelSet(key, ev); },
        up: () => { this.wdrag = null; },
        reset: () => { if (!e) return; this.commit(); e.p[key] = [e.p[key][0], 0, e.p[key][2]]; this.afterEdit(); },
        onLum: (ev) => { if (!e) return; this.begin(); e.p[key][2] = parseFloat(ev.target.value); this.afterEdit(); },
        resetLum: () => { if (!e) return; this.commit(); e.p[key][2] = 0; this.afterEdit(); }
      };
    });
    // crop & frame
    const c = e ? e.crop : D.defaultCrop(), f = e ? e.frame : D.defaultFrame();
    v.aspects = [['orig', 'Original'], ['1:1', '1:1'], ['4:5', '4:5'], ['3:2', '3:2'], ['4:3', '4:3'], ['16:9', '16:9'], ['65:24', 'XPan'], ['6:7', '6×7']].map(([id, label]) => ({ label, cls: c.aspect === id ? 'on' : '', on: c.aspect === id, pick: () => { this.commit(); this.edit && (this.edit.cropFromLook = false); this.setCrop({ aspect: id, aspectLock: false, x: 0, y: 0 }); } }));
    v.rotL = () => { this.commit(); this.setCrop({ rot: (c.rot + 270) % 360 }); };
    v.rotR = () => { this.commit(); this.setCrop({ rot: (c.rot + 90) % 360 }); };
    v.flipH = () => { this.commit(); this.setCrop({ flipH: !c.flipH }); }; v.flipV = () => { this.commit(); this.setCrop({ flipV: !c.flipV }); };
    v.flipHCls = c.flipH ? 'on' : ''; v.flipVCls = c.flipV ? 'on' : ''; v.flipHOn = !!c.flipH; v.flipVOn = !!c.flipV;
    const FT = [
      ['none', 'None', 'inset: 0'], ['classic', 'Classic', 'inset: 4px'], ['gallery', 'Gallery', 'top: 4px; left: 4px; right: 4px; bottom: 11px'],
      ['polaroid', 'Polaroid', 'top: 3px; left: 3px; right: 3px; bottom: 12px'], ['instaxMini', 'Instax Mini', 'top: 5px; left: 3px; right: 3px; bottom: 12px'], ['instaxWide', 'Instax Wide', 'top: 5px; left: 2px; right: 2px; bottom: 9px'],
      ['strip', '35mm Strip', 'top: 9px; bottom: 9px; left: 2px; right: 2px'], ['rounded', 'Rounded', 'inset: 4px; border-radius: 5px'], ['carrier', 'Negative', 'inset: 3px']
    ];
    v.ftypes = FT.map(([id, label, inner]) => ({ label, cls: f.type === id ? 'on' : '', on: f.type === id, inner, innerCls: id === 'strip' || id === 'carrier' ? '' : '', box: id === 'strip' || id === 'carrier' ? 'background: #111; box-shadow: 0 0 0 1px var(--input)' : id === 'none' ? 'background: transparent' : '', pick: () => { this.setFrame({ type: id, color: id === 'polaroid' ? '#f3f0e8' : id.startsWith('instax') ? '#fbfbf8' : f.color }); } }));
    const FC = [['#ffffff', 'White'], ['#f3f0e8', 'Warm White'], ['#e9dfc8', 'Cream'], ['#b89b72', 'Kraft'], ['#2a2c33', 'Slate'], ['#111111', 'Black']];
    v.frameColors = !!e && !['none', 'strip', 'carrier'].includes(f.type);
    v.swatches = FC.map(([col, label]) => ({ label, style: 'background: ' + col, cls: f.color === col ? 'on' : '', on: f.color === col, pick: () => this.setFrame({ color: col }) }));
    v.frameColor = f.color; v.onFrameColor = (ev) => this.setFrame({ color: ev.target.value });
    v.hasCaption = ['polaroid', 'instaxMini', 'instaxWide', 'gallery'].includes(f.type);
    v.caption = f.caption; v.onCaption = (ev) => { if (!e) return; e.frame.caption = ev.target.value; this.afterEdit(); };
    v.fHand = f.font !== 'clean' ? 'on' : ''; v.fClean = f.font === 'clean' ? 'on' : '';
    v.setHand = () => this.setFrame({ font: 'hand' }); v.setClean = () => this.setFrame({ font: 'clean' });
    v.isStrip = f.type === 'strip'; v.edge = f.edge; v.onEdge = (ev) => { if (!e) return; e.frame.edge = ev.target.value; this.afterEdit(); };
    v.hasKeyline = f.type === 'classic' || f.type === 'gallery'; v.keyOn = !!f.keyline; v.keyCls = f.keyline ? 'on' : '';
    v.toggleKey = () => this.setFrame({ keyline: !f.keyline });
    // stamp
    const st = e ? e.stamp : D.defaultStamp();
    v.stampOn = !!st.on; v.stampCls = st.on ? 'on' : '';
    v.toggleStamp = () => this.setStamp({ on: !st.on });
    v.stampStyles = [['film', 'Film'], ['digital', 'Digital'], ['camcorder', 'Camcorder']].map(([id, label]) => ({ label, cls: st.style === id ? 'on' : '', on: st.style === id, pick: () => this.setStamp({ style: id, on: true, color: id === 'digital' ? '#ffc933' : st.color === '#ffc933' ? '#ff7a1a' : st.color }) }));
    v.stampDate = st.date || (ph && ph.date) || new Date().toISOString().slice(0, 10);
    v.onStampDate = (ev) => this.setStamp({ date: ev.target.value });
    v.stampLcd = st.style !== 'camcorder';
    v.stampFmts = [['yy m d', "'98 7 14"], ['m d yy', "7 14 '98"], ['d m yy', "14 7 '98"], ['yyyy.mm.dd', '1998.07.14'], ['mm/dd/yy', '07/14/98']].map(([id, label]) => ({ label, cls: st.fmt === id ? 'on' : '', on: st.fmt === id, pick: () => this.setStamp({ fmt: id }) }));
    v.stampColors = [['#ff7a1a', 'Orange'], ['#ff3b1f', 'Red'], ['#ffc933', 'Yellow'], ['#f5f5f5', 'White']].map(([col, label]) => ({ label, style: 'background: ' + col, cls: st.color === col ? 'on' : '', on: st.color === col, pick: () => this.setStamp({ color: col }) }));
    v.posBL = st.pos === 'bl' ? 'on' : ''; v.posBR = st.pos !== 'bl' ? 'on' : '';
    v.setBL = () => this.setStamp({ pos: 'bl' }); v.setBR = () => this.setStamp({ pos: 'br' });
    v.reseed = () => { if (!e) return; this.commit(); e.seed = Math.random(); this.afterEdit(); };
    // export
    const x = S.exp;
    v.formats = [['jpeg', 'JPEG'], ['png', 'PNG'], ['webp', 'WEBP']].map(([id, label]) => ({ label, cls: x.format === id ? 'on' : '', on: x.format === id, pick: () => { x.format = id; this.save('exp', x); this.up(); } }));
    v.sizes = [['orig', 'Full'], ['4096', '4096'], ['2048', '2048'], ['1080', '1080']].map(([id, label]) => ({ label, cls: x.size === id ? 'on' : '', on: x.size === id, pick: () => { x.size = id; this.save('exp', x); this.up(); } }));
    v.hasQuality = x.format !== 'png'; v.quality = x.quality;
    v.qualityStyle = '--a: 0%; --b: ' + ((x.quality - 60) / 40 * 100) + '%';
    v.onQuality = (ev) => { x.quality = parseFloat(ev.target.value); this.save('exp', x); this.up(); };
    v.expName = ph ? ph.name : '—';
    if (ph && this.dims[ph.id]) {
      const dm = this.dims[ph.id], kk = this.R ? Math.min(1, this.R.maxTex / Math.max(dm.w, dm.h)) : 1, sz = D.outputSize(e, Math.round(dm.w * kk), Math.round(dm.h * kk), x.size), lay = D.frameLayout(e.frame, sz.w, sz.h);
      v.expDims = lay.W + ' × ' + lay.H + ' px';
    } else v.expDims = '—';
    v.expFrame = (FT.find((t) => t[0] === f.type) || FT[0])[1] + (st.on ? ' + date stamp' : '');
    v.exportOne = bind('exportOne'); v.exportAll = bind('exportAll');
    v.exportAllLabel = S.photos.length > 1 ? 'Export Roll (' + S.photos.length + ' photos, ZIP)' : 'Export Roll (ZIP)';
    // mobile tabs
    v.mtabs = [
      ['looks', 'Looks', 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20M14.31 8l5.74 9.94M9.69 8h11.48M7.38 12l5.74-9.94M9.69 16L3.95 6.06M14.31 16H2.83M16.62 12l-5.74 9.94'],
      ['develop', 'Develop', 'M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4'],
      ['frame', 'Frame', 'M22 6H2M22 18H2M6 2v20M18 2v20'],
      ['export', 'Export', 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3']
    ].map(([id, label, icon]) => ({ label, icon, cls: S.mtab === id ? 'on' : '', on: S.mtab === id, pick: () => this.set(id === 'looks' ? { mtab: id } : { mtab: id, rtab: id }) }));
    // toast & result
    v.toast = !!S.toast; v.toastText = S.toast ? S.toast.text : ''; v.toastCls = S.toast && S.toast.err ? 'err' : '';
    const r = S.result;
    v.result = !!r; v.resImg = !!(r && r.img); v.resUrl = r && r.url ? r.url : '';
    v.resTitle = r ? (r.img ? 'Your Photo Is Ready' : 'Your Roll Is Ready') : '';
    v.resInfo = r ? r.name + ' · ' + (r.img ? r.w + ' × ' + r.h + ' px · ' : r.count + ' photos · ') + (r.blob.size / 1048576).toFixed(1) + ' MB' : '';
    v.resHint = r ? (r.img ? 'If the download didn’t start, use Save File, or right-click or long-press the preview to save it.' : 'If the download didn’t start, use Save File.') : '';
    v.canShare = this.canShare();
    v.closeResult = bind('closeResult'); v.stop = (ev) => ev.stopPropagation();
    v.saveResult = () => r && this.saveBlob(r.blob, r.name);
    v.shareResult = bind('shareResult');
    return { v };
  }
}
