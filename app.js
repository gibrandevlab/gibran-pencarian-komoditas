/* ===== Utilitas bersama ===== */
const $ = (s, r = document) => r.querySelector(s);
const fmt = n => n.toLocaleString('id-ID');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tokens = q => q.toLowerCase().split(/\s+/).filter(Boolean);

const COPY_SVG = `<svg class="copy-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.8"/><path d="M3.5 10.5h-.7A1.3 1.3 0 0 1 1.5 9.2V2.8A1.3 1.3 0 0 1 2.8 1.5h6.4a1.3 1.3 0 0 1 1.3 1.3v.7"/></svg>`;
const CHEVRON_SVG = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5"/></svg>`;

// Sorot kecocokan pada teks asli, lalu escape per potongan (aman dari injeksi HTML)
function hl(text, toks) {
  const low = text.toLowerCase(), r = [];
  toks.forEach(t => { for (let i = low.indexOf(t); i > -1; i = low.indexOf(t, i + t.length)) r.push([i, i + t.length]); });
  if (!r.length) return esc(text);
  r.sort((a, b) => a[0] - b[0]);
  let out = '', p = 0;
  for (const [s, e] of r) {
    if (e <= p) continue;
    const st = Math.max(s, p);
    out += esc(text.slice(p, st)) + '<mark>' + esc(text.slice(st, e)) + '</mark>';
    p = e;
  }
  return out + esc(text.slice(p));
}

// Semua kata harus cocok; kata berupa angka juga dicocokkan sebagai awalan kode
const hit = (r, toks) => toks.every(t => r.n.includes(t) || (/^\d+$/.test(t) && r.c.some(c => c.startsWith(t))));

// Render bertahap: 120 baris per tahap, tahap berikutnya dimuat saat mendekati dasar daftar
function mount(ul, rows, render) {
  ul.innerHTML = '';
  let i = 0;
  const end = document.createElement('li');
  end.className = 'sentinel';
  const io = new IntersectionObserver(e => e[0].isIntersecting && load(), { rootMargin: '900px' });
  function load() {
    const to = Math.min(i + 120, rows.length);
    let h = '';
    for (; i < to; i++) h += render(rows[i]);
    end.insertAdjacentHTML('beforebegin', h);
    if (i >= rows.length) { io.disconnect(); end.remove(); }
  }
  ul.append(end); io.observe(end); load();
  return () => io.disconnect();
}

const toast = $('#toast');
let toastTimer;
async function copy(text, label) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const t = document.createElement('textarea');
    t.value = text; t.style.cssText = 'position:fixed;opacity:0';
    document.body.append(t); t.select();
    try { document.execCommand('copy'); } catch {}
    t.remove();
  }
  navigator.vibrate?.(10);
  toast.textContent = `${label} ${text} disalin`;
  toast.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('on'), 1800);
}

// Segmented control: thumb digeser lewat CSS (--i), respons langsung saat disentuh
function segmented(el, onPick) {
  const btns = [...el.querySelectorAll('button')];
  const set = v => btns.forEach((b, i) => {
    const on = b.dataset.v === v;
    b.setAttribute('aria-pressed', on);
    if (on) el.style.setProperty('--i', i);
  });
  const pick = b => { set(b.dataset.v); onPick(b.dataset.v); };
  btns.forEach(b => { b.addEventListener('pointerdown', () => pick(b)); b.addEventListener('click', () => pick(b)); });
  return set;
}

// Pencarian: satu render per frame, tombol hapus, Esc untuk mengosongkan
function bindSearch(panel, render) {
  const q = $('input', panel), clear = $('.clear', panel);
  let f;
  q.addEventListener('input', () => { cancelAnimationFrame(f); f = requestAnimationFrame(render); });
  q.addEventListener('keydown', e => { if (e.key === 'Escape' && q.value) { q.value = ''; render(); } });
  clear.addEventListener('click', () => { q.value = ''; q.focus(); render(); });
  return () => { clear.hidden = !q.value; return tokens(q.value); };
}

function showEmpty(panel, any, query) {
  $('.empty', panel).hidden = any;
  $('.list', panel).hidden = !any;
  if (!any) $('.empty b', panel).textContent = query ? `Tidak ada hasil untuk “${query}”` : 'Data kosong';
}

async function loadJSON(url, panel, onRetry) {
  const st = $('.status', panel);
  st.textContent = 'Memuat data…';
  try {
    const res = await fetch(url);
    if (!res.ok) throw 0;
    return await res.json();
  } catch {
    st.textContent = `Gagal memuat ${url}. Pastikan server lokal aktif dan file tersedia. `;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'retry-btn';
    btn.textContent = 'Coba lagi';
    btn.addEventListener('click', onRetry);
    st.append(btn);
    return null;
  }
}

/* ===== Sinkronisasi tinggi sticky header dinamis ===== */
const kualitasPanel = $('#p-kualitas');
const kualitasBar = $('.bar', kualitasPanel);
if ('ResizeObserver' in window && kualitasBar) {
  new ResizeObserver(() => {
    const h = kualitasBar.offsetHeight;
    if (h > 0) kualitasPanel.style.setProperty('--bar-h', `${h}px`);
  }).observe(kualitasBar);
}

/* ===== Fungsi 1: Daftar komoditas (komoditas.json) ===== */
function initKomoditas() {
  const panel = $('#p-komoditas'), list = $('.list', panel), st = $('.status', panel);
  let data = [], cat = 'Semua', dispose = () => {}, loading = null;
  const read = bindSearch(panel, render);
  segmented($('.seg', panel), v => { cat = v; render(); });

  const row = (r, t) => `<li class="item-row">
    <button type="button" class="row-main" data-copy="${esc(r.kode)}" data-label="Kode" title="Ketuk untuk menyalin kode">
      <span class="no">${r.no}</span>
      <span class="code">${hl(r.kode, t)}${COPY_SVG}</span>
      <span class="name">${hl(r.nama, t)}</span>
      <span class="badge ${r.kategori === 'Makanan' ? 'f' : ''}">${esc(r.kategori)}</span>
    </button>
    <button type="button" class="jump-btn" data-jump="${esc(r.kode)}" aria-label="Lihat daftar kualitas ${esc(r.nama)}" title="Lihat daftar kualitas">
      <span>Kualitas</span>${CHEVRON_SVG}
    </button>
  </li>`;

  function render() {
    const t = read(), q = $('input', panel).value.trim();
    const out = data.filter(r => (cat === 'Semua' || r.kategori === cat) && hit(r, t));
    dispose();
    const hint = out.length ? ' · Ketuk baris untuk menyalin kode' : '';
    st.textContent = `${fmt(out.length)} komoditas${cat === 'Semua' ? '' : ' · ' + cat}${hint}`;
    showEmpty(panel, out.length > 0, q);
    if (out.length) dispose = mount(list, out, r => row(r, t));
  }

  list.addEventListener('click', e => {
    const copyBtn = e.target.closest('[data-copy]');
    if (copyBtn) return copy(copyBtn.dataset.copy, copyBtn.dataset.label);

    const jumpBtn = e.target.closest('[data-jump]');
    if (jumpBtn) go('kualitas', { query: jumpBtn.dataset.jump });
  });

  const load = () => loading ??= loadJSON('komoditas.json', panel, () => { loading = null; load(); }).then(d => {
    if (!d) { loading = null; return; }
    // Dua baris pertama file berisi nomor kolom "(1) (2) (3)", bukan data
    data = d.filter(x => typeof x.no === 'number').map(x => ({ ...x, n: x.nama.toLowerCase(), c: [String(x.kode)] }));
    render();
  });

  return { show: load, render };
}

/* ===== Fungsi 2: Kualitas per komoditas (Master_Komoditas_SPKRT_2027.json) ===== */
function initKualitas() {
  const panel = $('#p-kualitas'), list = $('.list', panel), st = $('.status', panel);
  let rows = [], dispose = () => {}, loading = null, ready = false;
  const read = bindSearch(panel, render);

  // Judul grup = nama komoditas; klik judul menyalin kode komoditas
  const head = (r, t) => `<li class="grp"><button type="button" data-copy="${r.km}" data-label="Kode komoditas" title="Ketuk untuk menyalin kode komoditas">
    <div><strong>${hl(r.nk, t)}</strong><small>Kel ${r.kel} · Sub ${r.sub} · Kelas ${r.kls} · Kom ${r.kom}</small></div>
    <span class="grp-tag">Salin ${r.km}${COPY_SVG}</span>
  </button></li>`;
  const item = (r, t) => `<li><button type="button" class="row b" data-copy="${r.kode}" data-label="Kode" title="Ketuk untuk menyalin kode lengkap">
    <span class="kq">${r.kq}</span><span class="nq">${hl(r.nq, t)}</span><span class="kd">${r.kode}${COPY_SVG}</span></button></li>`;

  function render() {
    const t = read(), q = $('input', panel).value.trim();
    const out = rows.filter(r => hit(r, t));
    dispose();
    const hint = out.length ? ' · Ketuk baris untuk menyalin kode' : '';
    st.textContent = `${fmt(out.length)} kualitas${hint}`;
    showEmpty(panel, out.length > 0, q);
    if (!out.length) return;
    let last = null; // judul muncul setiap kali komoditasnya berganti
    dispose = mount(list, out, r => {
      const h = r.g !== last ? head(r, t) : '';
      last = r.g;
      return h + item(r, t);
    });
  }

  list.addEventListener('click', e => { const b = e.target.closest('[data-copy]'); b && copy(b.dataset.copy, b.dataset.label); });

  // File ±10 MB: dimuat hanya saat tab dibuka (atau saat tombolnya didekati)
  const load = () => loading ??= loadJSON('Master_Komoditas_SPKRT_2027.json', panel, () => { loading = null; load(); }).then(d => {
    if (!d) { loading = null; return; }
    rows = d.map(x => {
      const km = x.Kode_Kelompok + x.Kode_Subkelompok + x.Kode_Kelas + x.Kode_Komoditas;
      const kmNoZero = km.replace(/^0+/, '');
      return {
        kel: x.Kode_Kelompok, sub: x.Kode_Subkelompok, kls: x.Kode_Kelas, kom: x.Kode_Komoditas,
        nk: x.Nama_Komoditas, kq: x.Kode_Kualitas, nq: x.Nama_Kualitas,
        km, kode: km + x.Kode_Kualitas, g: km + x.Nama_Komoditas,
        n: (x.Nama_Komoditas + ' ' + x.Nama_Kualitas).toLowerCase(),
        // kode lengkap, kode komoditas, dan variasi kode tanpa nol di depan
        c: [km + x.Kode_Kualitas, km, kmNoZero, +x.Kode_Kelompok + km.slice(2)].map(String)
      };
    });
    ready = true;
    render();
  });

  return { show: load, warm: load, render: () => ready && render() };
}

/* ===== Navigasi antar tampilan ===== */
const views = { komoditas: initKomoditas(), kualitas: initKualitas() };
const dockEl = $('#dock');
const setDock = segmented(dockEl, v => go(v));

function go(name, opts = {}) {
  if (!views[name]) name = 'komoditas';
  const targetPanel = $('#p-' + name);

  if (typeof opts.query === 'string') {
    const input = $('input', targetPanel);
    input.value = opts.query;
  }

  for (const k in views) $('#p-' + k).hidden = k !== name;
  setDock(name);
  views[name].show();
  if (typeof opts.query === 'string') views[name].render();

  history.replaceState(null, '', '#' + name);
  window.scrollTo(0, 0);
}

dockEl.querySelector('[data-v=kualitas]').addEventListener('pointerenter', () => views.kualitas.warm());
addEventListener('hashchange', () => go(location.hash.slice(1)));
addEventListener('keydown', e => {
  if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
    e.preventDefault();
    $('input', $('.panel:not([hidden])')).focus();
  }
});
go(location.hash.slice(1));

/* ===== Tema terang / gelap (mengikuti sistem sampai dipilih manual) ===== */
const root = document.documentElement, themeBtn = $('#themeBtn'), tcMeta = $('meta[name=theme-color]');
function applyTheme(t, animate) {
  if (animate) { root.classList.add('tt'); setTimeout(() => root.classList.remove('tt'), 450); }
  root.dataset.theme = t;
  tcMeta.content = t === 'dark' ? '#000000' : '#f5f5f7';
  themeBtn.setAttribute('aria-label', t === 'dark' ? 'Ganti ke mode terang' : 'Ganti ke mode gelap');
}
applyTheme(root.dataset.theme || 'light');
themeBtn.addEventListener('click', () => {
  const t = root.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(t, true);
  try { localStorage.setItem('theme', t); } catch {}
});
matchMedia('(prefers-color-scheme:dark)').addEventListener('change', e => {
  let saved = null;
  try { saved = localStorage.getItem('theme'); } catch {}
  if (!saved) applyTheme(e.matches ? 'dark' : 'light', true);
});