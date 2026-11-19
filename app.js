let allData = [];
let activeCategory = 'Semua';

const searchInput = document.getElementById('searchInput');
const clearBtn = document.getElementById('clearBtn');
const resultList = document.getElementById('resultList');
const statusText = document.getElementById('statusText');
const emptyState = document.getElementById('emptyState');
const emptyTitle = document.getElementById('emptyTitle');
const segmentBtns = document.querySelectorAll('.segment-btn');
const segmentThumb = document.getElementById('segmentThumb');
const toastPill = document.getElementById('toastPill');

// 1. Interruptible critically-damped spring (damping = 1.0, response = 0.32s)
const springState = { current: 0, target: 0, velocity: 0, raf: null, lastTime: 0 };
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function animateSegmentSpring(targetIndex) {
  springState.target = targetIndex;
  if (prefersReducedMotion.matches) {
    springState.current = targetIndex;
    segmentThumb.style.transform = `translate3d(${targetIndex * 100}%, 0, 0)`;
    return;
  }
  if (springState.raf) return; // Tetap lanjutkan dari velocity yang sedang berjalan (interruptible)

  springState.lastTime = performance.now();
  const omega = (2 * Math.PI) / 0.32; // response = 0.32s, damping ratio = 1.0

  function step(now) {
    const dt = Math.min((now - springState.lastTime) / 1000, 0.032);
    springState.lastTime = now;

    const displacement = springState.current - springState.target;
    const accel = -omega * omega * displacement - 2 * omega * springState.velocity;

    springState.velocity += accel * dt;
    springState.current += springState.velocity * dt;

    segmentThumb.style.transform = `translate3d(${springState.current * 100}%, 0, 0)`;

    if (Math.abs(displacement) < 0.001 && Math.abs(springState.velocity) < 0.001) {
      springState.current = springState.target;
      springState.velocity = 0;
      segmentThumb.style.transform = `translate3d(${springState.target * 100}%, 0, 0)`;
      springState.raf = null;
      return;
    }
    springState.raf = requestAnimationFrame(step);
  }

  springState.raf = requestAnimationFrame(step);
}

// 2. Load data JSON
fetch('komoditas.json')
  .then((res) => {
    if (!res.ok) throw new Error('Gagal memuat komoditas.json');
    return res.json();
  })
  .then((data) => {
    allData = data;
    renderResults();
  })
  .catch(() => {
    statusText.textContent = 'File komoditas.json belum ditemukan.';
  });

// 3. Highlight kecocokan teks tanpa innerHTML injection
function highlightText(text, query) {
  if (!query) return escapeHtml(text);
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  return escapeHtml(text).replace(regex, '<mark>$1</mark>');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 4. Instant 0ms live search
function renderResults() {
  const query = searchInput.value.trim();
  const qLower = query.toLowerCase();
  clearBtn.hidden = query.length === 0;

  const filtered = allData.filter((item) => {
    const matchCat = activeCategory === 'Semua' || item.kategori === activeCategory;
    if (!matchCat) return false;
    if (!qLower) return true;
    return (
      item.nama.toLowerCase().includes(qLower) ||
      item.kode.toLowerCase().includes(qLower)
    );
  });

  const limit = 150;
  const visible = filtered.slice(0, limit);

  if (filtered.length === 0) {
    resultList.innerHTML = '';
    emptyState.hidden = false;
    emptyTitle.textContent = query ? `Tidak ada hasil untuk “${query}”` : 'Data kosong';
    statusText.textContent = '0 komoditas ditemukan';
    return;
  }

  emptyState.hidden = true;
  statusText.textContent =
    filtered.length > limit
      ? `Menampilkan ${limit} dari ${filtered.length.toLocaleString('id-ID')} komoditas`
      : `${filtered.length.toLocaleString('id-ID')} komoditas`;

  resultList.innerHTML = visible
    .map((item) => {
      const isFood = item.kategori === 'Makanan';
      const badgeClass = isFood ? 'badge-food' : 'badge-nonfood';
      return `
        <li class="commodity-item" data-kode="${escapeHtml(item.kode)}" data-nama="${escapeHtml(item.nama)}" title="Ketuk untuk menyalin kode">
          <span class="col-no">${escapeHtml(item.no)}</span>
          <span class="col-code-desktop">${highlightText(item.kode, query)}</span>
          <span class="col-name">${highlightText(item.nama, query)}</span>
          <span class="col-code-mobile">Kode: <strong>${highlightText(item.kode, query)}</strong> · No. ${escapeHtml(item.no)}</span>
          <span class="col-cat"><span class="badge ${badgeClass}">${escapeHtml(item.kategori)}</span></span>
        </li>
      `;
    })
    .join('');
}

// Event Listeners (pointer-down response)
searchInput.addEventListener('input', renderResults);

clearBtn.addEventListener('click', () => {
  searchInput.value = '';
  searchInput.focus();
  renderResults();
});

segmentBtns.forEach((btn, idx) => {
  btn.addEventListener('pointerdown', () => {
    segmentBtns.forEach((b) => {
      b.classList.remove('is-active');
      b.setAttribute('aria-selected', 'false');
    });
    btn.classList.add('is-active');
    btn.setAttribute('aria-selected', 'true');
    activeCategory = btn.dataset.filter;
    animateSegmentSpring(idx);
    renderResults();
  });
});

// Ketuk baris untuk langsung menyalin kode komoditas ke clipboard
let toastTimer;
resultList.addEventListener('click', async (e) => {
  const row = e.target.closest('.commodity-item');
  if (!row) return;
  const { kode, nama } = row.dataset;
  try {
    await navigator.clipboard.writeText(kode);
    if (navigator.vibrate) navigator.vibrate(10);
    toastPill.textContent = `Kode ${kode} (${nama}) disalin`;
    toastPill.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastPill.classList.remove('is-visible'), 2000);
  } catch (_) {}
});