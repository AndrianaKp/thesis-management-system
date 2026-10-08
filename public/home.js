
(function () {
  const $ = (id) => document.getElementById(id);
  const list  = $('ann-list');
  const fromEl = $('ann-from');
  const toEl   = $('ann-to');

  const esc = (s='') => String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  const toYMD = (d) => {
    const p = (n) => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
  };

  // default: σήμερα -> +30 ημέρες
  const today = new Date();
  const plus30 = new Date(today); plus30.setDate(today.getDate() + 30);
  fromEl.value = toYMD(today);
  toEl.value   = toYMD(plus30);

  async function loadAnnouncements() {
    const from = fromEl.value || toYMD(today);
    const to   = toEl.value   || toYMD(plus30);

    list.innerHTML = `<p>Φόρτωση…</p>`;
    try {
      const res = await fetch(`/api/public-announcements?from=${from}&to=${to}`);
      const data = await res.json();
      if (!data.success) {
        list.innerHTML = `<p>Σφάλμα φόρτωσης ανακοινώσεων.</p>`;
        return;
      }
      const items = data.announcements || [];
      if (!items.length) {
        list.innerHTML = `<p>Δεν υπάρχουν ανακοινώσεις στο επιλεγμένο διάστημα.</p>`;
        return;
      }
      list.innerHTML = items.map(a => `
        <article class="announcement-item">
          <div class="announcement-text">
            ${esc(a.text || `Εξέταση «${a.topic_title}» – ${a.student}`)}
          </div>
          <div class="announcement-meta">
            ${new Date(a.starts_at).toLocaleString('el-GR')}
            · ${esc(a.location)} · Επιβλέπων: ${esc(a.supervisor)} ·
            Τρόπος: ${esc(a.exam_mode)}
          </div>
        </article>
      `).join('');
    } catch (e) {
      console.error(e);
      list.innerHTML = `<p>Αποτυχία σύνδεσης με τον server.</p>`;
    }
  }

  // χειριστές
  $('ann-apply')?.addEventListener('click', loadAnnouncements);

  $('ann-json')?.addEventListener('click', (e) => {
    e.preventDefault();
    const from = fromEl.value, to = toEl.value;
    window.open(`/api/public-announcements?from=${from}&to=${to}&format=json&download=1`, '_blank');
  });
  $('ann-xml')?.addEventListener('click', (e) => {
    e.preventDefault();
    const from = fromEl.value, to = toEl.value;
    window.open(`/api/public-announcements?from=${from}&to=${to}&format=xml&download=1`, '_blank');
  });

  // πρώτη φόρτωση
  loadAnnouncements();
})();
