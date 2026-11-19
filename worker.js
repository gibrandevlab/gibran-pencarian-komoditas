/* worker.js — mesin data: parse JSON + pencarian + ranking
   Berjalan sebagai Web Worker supaya HP lama tidak macet saat mengetik.
   Kalau Worker tidak tersedia, app.js memuat file ini sebagai skrip biasa
   dan memakai self.KomEngine() di thread utama (API-nya sama persis). */
(function () {
  'use strict';

  const isNum = t => /^\d+$/.test(t);

  function createEngine() {
    // name -> { disp, n, c, base, order, key, cat, rid }
    //   disp  : objek yang ditampilkan (dikirim ke UI)
    //   n     : teks pencarian (huruf kecil)
    //   c     : daftar kode yang dicocokkan sebagai awalan angka
    //   base  : indeks hasil pencarian terakhir (urut data), dipakai ulang saat mengetik lebih panjang
    //   order : base setelah diurutkan (ranking)
    const sets = Object.create(null);

    async function load(m) {
      const have = sets[m.name];
      if (have) return { ok: true, count: have.disp.length };

      let data;
      try {
        const res = await fetch(m.url);
        if (!res.ok) return { ok: false, status: res.status };
        data = await res.json();
      } catch (e) {
        return { ok: false };
      }
      if (!Array.isArray(data)) return { ok: false };

      const s = { disp: [], n: [], c: [], base: null, order: null, key: null, cat: null, rid: -1 };

      if (m.kind === 'kom') {
        // Dua baris pertama file berisi nomor kolom "(1) (2) (3)", bukan data
        for (const x of data) {
          if (typeof x.no !== 'number') continue;
          // Field "alias" (opsional): nama lokal / populer, string atau array
          const alias = Array.isArray(x.alias) ? x.alias.join(' ') : (x.alias || '');
          s.disp.push({ no: x.no, kode: String(x.kode), nama: x.nama, kategori: x.kategori });
          s.n.push((x.nama + ' ' + alias).toLowerCase());
          s.c.push([String(x.kode)]);
        }
      } else {
        for (const x of data) {
          const km = '' + x.Kode_Kelompok + x.Kode_Subkelompok + x.Kode_Kelas + x.Kode_Komoditas;
          const kode = km + x.Kode_Kualitas;
          s.disp.push({
            kel: x.Kode_Kelompok, sub: x.Kode_Subkelompok, kls: x.Kode_Kelas, kom: x.Kode_Komoditas,
            nk: x.Nama_Komoditas, kq: x.Kode_Kualitas, nq: x.Nama_Kualitas,
            km, kode, g: km + x.Nama_Komoditas
          });
          s.n.push((x.Nama_Komoditas + ' ' + x.Nama_Kualitas).toLowerCase());
          // kode lengkap, kode komoditas, dan variasi kode tanpa nol di depan
          s.c.push([kode, km, km.replace(/^0+/, ''), String(+x.Kode_Kelompok) + km.slice(2)]);
        }
      }
      sets[m.name] = s;
      return { ok: true, count: s.disp.length };
    }

    function search(m) {
      const s = sets[m.name];
      if (!s) return { ok: false, error: 'noload' };

      const toks = m.tokens, key = toks.join(' '), cat = m.cat || 'Semua';

      // Semua kata harus cocok; kata berupa angka juga dicocokkan sebagai awalan kode
      const test = i => {
        if (cat !== 'Semua' && s.disp[i].kategori !== cat) return false;
        const n = s.n[i];
        for (const t of toks) {
          if (n.includes(t)) continue;
          if (isNum(t) && s.c[i].some(c => c.startsWith(t))) continue;
          return false;
        }
        return true;
      };

      // Mengetik lebih panjang = hasilnya pasti bagian dari hasil sebelumnya, jadi tidak perlu memindai ulang semua baris
      const reuse = s.base && s.cat === cat && key.startsWith(s.key);
      const out = [];
      if (reuse) {
        const b = s.base;
        for (let k = 0; k < b.length; k++) if (test(b[k])) out.push(b[k]);
      } else {
        for (let i = 0, N = s.disp.length; i < N; i++) if (test(i)) out.push(i);
      }
      s.base = out; s.key = key; s.cat = cat; s.rid = m.rid;

      let order = out;
      if (m.rank && toks.length) {
        // Nama diawali kata kunci (atau kode cocok) -> naik ke atas; urutan data asli tetap terjaga di tiap kelompok
        const t0 = toks[0], a = [], b = [], c = [];
        for (const i of out) {
          const n = s.n[i];
          if (n.startsWith(t0) || (isNum(t0) && s.c[i].some(x => x.startsWith(t0)))) a.push(i);
          else if (n.includes(' ' + t0)) b.push(i);
          else c.push(i);
        }
        order = a.concat(b, c);
      }
      s.order = order;
      return { ok: true, rid: m.rid, total: order.length, rows: order.slice(0, m.limit).map(i => s.disp[i]) };
    }

    function page(m) {
      const s = sets[m.name];
      // Pencarian sudah berganti: halaman lama tidak berlaku lagi
      if (!s || s.rid !== m.rid) return { ok: false, stale: true };
      return { ok: true, rows: s.order.slice(m.start, m.start + m.count).map(i => s.disp[i]) };
    }

    async function handle(m) {
      try {
        const r = m.type === 'load' ? await load(m) : m.type === 'search' ? search(m) : page(m);
        r.id = m.id;
        return r;
      } catch (e) {
        return { id: m.id, ok: false, error: String(e) };
      }
    }

    return { handle };
  }

  if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
    const eng = createEngine();
    self.onmessage = async e => self.postMessage(await eng.handle(e.data));
    self.postMessage({ ready: true });   // tanda "saya hidup" untuk app.js
  } else {
    self.KomEngine = createEngine;
  }
})();
