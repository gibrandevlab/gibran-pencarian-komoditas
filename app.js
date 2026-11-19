/* ===== Utilitas bersama ===== */
const $ = (s, r = document) => r.querySelector(s);
const fmt = n => n.toLocaleString('id-ID');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tokens = q => q.toLowerCase().split(/\s+/).filter(Boolean);

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

async function loadJSON(url, panel, label) {
  const st = $('.status', panel);
  try {
    const res = await fetch(url);
    if (!res.ok) throw 0;
    return await res.json();
  } catch {
    st.textContent = `Gagal memuat ${url}. Buka lewat server lokal (misalnya Live Server) dan pastikan file ada di folder yang sama.`;
    return null;
  }
}

/* ===== Fungsi 1: Daftar komoditas (komoditas.json) ===== */
function initKomoditas() {
  const panel = $('#p-komoditas'), list = $('.list', panel), st = $('.status', panel);
  let data = [], cat = 'Semua', dispose = () => {}, loading = null;
  const read = bindSearch(panel, render);
  segmented($('.seg', panel), v => { cat = v; render(); });

  const row = (r, t) => `<li><button class="row a" data-copy="${esc(r.kode)}" data-label="Kode" title="Ketuk untuk menyalin kode">
    <span class="no">${r.no}</span><span class="code">${hl(r.kode, t)}</span><span class="name">${hl(r.nama, t)}</span>
    <span class="badge ${r.kategori === 'Makanan' ? 'f' : ''}">${esc(r.kategori)}</span></button></li>`;

  function render() {
    const t = read(), q = $('input', panel).value.trim();
    const out = data.filter(r => (cat === 'Semua' || r.kategori === cat) && hit(r, t));
    dispose();
    st.textContent = `${fmt(out.length)} komoditas${cat === 'Semua' ? '' : ' · ' + cat}`;
    showEmpty(panel, out.length > 0, q);
    if (out.length) dispose = mount(list, out, r => row(r, t));
  }

  list.addEventListener('click', e => { const b = e.target.closest('[data-copy]'); b && copy(b.dataset.copy, b.dataset.label); });

  return {
    async show() {
      loading ??= loadJSON('komoditas.json', panel).then(d => {
        if (!d) return;
        // Dua baris pertama file berisi nomor kolom "(1) (2) (3)", bukan data
        data = d.filter(x => typeof x.no === 'number').map(x => ({ ...x, n: x.nama.toLowerCase(), c: [x.kode] }));
        render();
      });
    }
  };
}

/* ===== Fungsi 2: Kualitas per komoditas (Master_Komoditas_SPKRT_2027.json) ===== */
function initKualitas() {
  const panel = $('#p-kualitas'), list = $('.list', panel), st = $('.status', panel), chips = $('.chips', panel);
  let rows = [], kel = '', dispose = () => {}, loading = null;
  const read = bindSearch(panel, render);

  const head = (r, t) => `<li class="grp"><button data-copy="${r.km}" data-label="Kode komoditas">
    <strong>${hl(r.kom, t)}</strong><small>Kode komoditas ${r.km} · Kelompok ${r.kel}</small></button></li>`;
  const item = (r, t) => `<li><button class="row b" data-copy="${r.kode}" data-label="Kode" title="Ketuk untuk menyalin kode lengkap">
    <span class="code">${r.kode.slice(0, 7)}<b>${r.kode.slice(7)}</b></span><span class="name">${hl(r.kual, t)}</span></button></li>`;

  function render() {
    const t = read(), q = $('input', panel).value.trim();
    const out = rows.filter(r => (!kel || r.kel === kel) && hit(r, t));
    dispose();
    st.textContent = `${fmt(out.length)} kualitas${kel ? ' · Kelompok ' + kel : ''}`;
    showEmpty(panel, out.length > 0, q);
    if (!out.length) return;
    let last = null; // judul komoditas muncul setiap kali komoditasnya berganti
    dispose = mount(list, out, r => {
      const h = r.g !== last ? head(r, t) : '';
      last = r.g;
      return h + item(r, t);
    });
  }

  function buildChips() {
    const ks = [...new Set(rows.map(r => r.kel))].sort();
    chips.innerHTML = ['', ...ks].map(k => `<button type="button" data-k="${k}" aria-pressed="${k === ''}" title="${k ? 'Kelompok ' + k : 'Semua kelompok'}">${k || 'Semua'}</button>`).join('');
    chips.addEventListener('click', e => {
      const b = e.target.closest('[data-k]');
      if (!b) return;
      kel = b.dataset.k;
      chips.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
      render();
    });
  }

  list.addEventListener('click', e => { const b = e.target.closest('[data-copy]'); b && copy(b.dataset.copy, b.dataset.label); });

  // File ±10 MB: dimuat hanya saat tab dibuka (atau saat tombolnya didekati)
  const load = () => loading ??= loadJSON('Master_Komoditas_SPKRT_2027.json', panel).then(d => {
    if (!d) { loading = null; return; }
    rows = d.map(x => {
      const km = x.Kode_Kelompok + x.Kode_Subkelompok + x.Kode_Kelas + x.Kode_Komoditas;
      return {
        kel: x.Kode_Kelompok, kom: x.Nama_Komoditas, kual: x.Nama_Kualitas,
        km, kode: km + x.Kode_Kualitas, g: km + x.Nama_Komoditas,
        n: (x.Nama_Komoditas + ' ' + x.Nama_Kualitas).toLowerCase(),
        // kode lengkap, kode komoditas, dan kode komoditas gaya komoditas.json (tanpa nol di depan)
        c: [km + x.Kode_Kualitas, km, +x.Kode_Kelompok + km.slice(2)].map(String)
      };
    });
    buildChips();
    render();
  });

  return { show: load, warm: load };
}

/* ===== Navigasi antar tampilan ===== */
const views = { komoditas: initKomoditas(), kualitas: initKualitas() };
const dockEl = $('#dock');
const setDock = segmented(dockEl, go);

function go(name) {
  if (!views[name]) name = 'komoditas';
  for (const k in views) $('#p-' + k).hidden = k !== name;
  setDock(name);
  views[name].show();
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
