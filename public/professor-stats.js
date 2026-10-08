
document.addEventListener('DOMContentLoaded', async () => {
  const css = getComputedStyle(document.documentElement);
  const brandHex = (css.getPropertyValue('--brand') || '#316dff').trim();
  const lineHex  = (css.getPropertyValue('--line')  || '#e6eaf0').trim();

  const toRGBA = (hex, a = 1) => {
    const m = hex.replace('#','').match(/.{1,2}/g);
    if (!m) return `rgba(49,109,255,${a})`;
    const [r,g,b] = m.map(x => parseInt(x,16));
    return `rgba(${r},${g},${b},${a})`;
  };

  const gridColor   = toRGBA(lineHex, .6);
  const brandFill   = toRGBA(brandHex, .18);
  const brandStroke = toRGBA(brandHex, .95);
  const altFill     = toRGBA('#7c3aed', .18);
  const altStroke   = toRGBA('#7c3aed', .95);

  const commonOptions = (title, formatter) => ({
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 1.9,
    layout: { padding: 8 },
    plugins: {
      legend: { display: false },
      title:  { display: true, text: title, padding: { top: 0, bottom: 8 } },
      tooltip: formatter ? { callbacks: { label: ctx => formatter(ctx.parsed.y) } } : {}
    },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: gridColor } }
    }
  });

  const barSet = (label, data, fill, stroke) => ({
    label,
    data,
    backgroundColor: fill,
    borderColor: stroke,
    borderWidth: 1.5,
    borderRadius: 8,
    barPercentage: 0.6,
    categoryPercentage: 0.5,
    maxBarThickness: 40
  });

  try {
    const res = await fetch('/api/professor-stats', { credentials: 'include' });
    const out = await res.json();
    if (!out.success) throw new Error(out.message || 'Σφάλμα API');
    const s = out.stats || {};

    // Κράτα αριθμούς για τα datasets
    const avgTimeSup = Math.round(Number(s.avgTimeSupervisor) || 0);
    const avgTimeMem = Math.round(Number(s.avgTimeMember) || 0);
    const avgGradeSup = Number(s.avgGradeSupervisor) || 0;
    const avgGradeMem = Number(s.avgGradeMember) || 0;
    const totalSup = Number(s.totalCountSupervisor) || 0;
    const totalMem = Number(s.totalCountMember) || 0;

    // 1) Μ.Ο. Διάρκειας
    new Chart(
      document.getElementById('completionTimeChart').getContext('2d'),
      {
        type: 'bar',
        data: {
          labels: ['Ως Επιβλέπων', 'Ως Μέλος'],
          datasets: [ barSet('Μ.Ο. Ημέρες', [avgTimeSup, avgTimeMem], brandFill, brandStroke) ]
        },
        options: commonOptions('Μ.Ο. Διάρκειας (ημέρες)', v => `${v} ημέρες`)
      }
    );

    // 2) Μ.Ο. Τελικού Βαθμού
    const gradeOptions = {
      ...commonOptions('Μ.Ο. Τελικού Βαθμού', v => Number(v).toFixed(2)),
      scales: {
        x: { grid: { display: false } },
        y: { min: 0, max: 10, ticks: { stepSize: 1 } } // πιο «λογική» κλίμακα για 0–10
      }
    };
    new Chart(
      document.getElementById('avgGradeChart').getContext('2d'),
      {
        type: 'bar',
        data: {
          labels: ['Ως Επιβλέπων', 'Ως Μέλος'],
          datasets: [ barSet('Μ.Ο. Βαθμού', [avgGradeSup, avgGradeMem], altFill, altStroke) ]
        },
        options: gradeOptions
      }
    );

    // 3) Σύνολο Διπλωματικών
    new Chart(
      document.getElementById('totalCountChart').getContext('2d'),
      {
        type: 'bar',
        data: {
          labels: ['Ως Επιβλέπων', 'Ως Μέλος'],
          datasets: [ barSet('Πλήθος', [totalSup, totalMem], brandFill, brandStroke) ]
        },
        options: commonOptions('Σύνολο Διπλωματικών', v => `${v} διπλωματικές`)
      }
    );

  } catch (e) {
    console.error(e);
    alert('Αποτυχία φόρτωσης στατιστικών.');
  }
});
