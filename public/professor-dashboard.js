

/* =========================================================
   Always send cookies (session) σε ΟΛΑ τα fetch
   ========================================================= */
(function patchFetchToIncludeCredentials() {
  const _fetch = window.fetch;
  window.fetch = (url, options = {}) => _fetch(url, { credentials: 'include', ...options });
})();

/* =========================================================
   Helpers (JSON fetch, DOM utils, escaping)
   ========================================================= */
async function apiJSON(url, options = {}) {
  // Έχουμε ήδη patch στο fetch, αλλά κρατάμε κι εδώ include 
  const res = await fetch(url, { credentials: 'include', ...options });

  if (res.status === 401 || res.status === 403) {
    const msg = await res.text();
    alert(msg || 'Μη εξουσιοδοτημένος χρήστης. Συνδεθείτε ξανά.');
    throw new Error('Unauthorized');
  }

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();

  const txt = await res.text();
  try { return JSON.parse(txt); } catch { return { success:false, message: txt }; }
}

const $         = (id) => document.getElementById(id);
const show      = (el) => { if (el) el.style.display = 'block'; };
const hide      = (el) => { if (el) el.style.display = 'none';  };
const clear     = (el) => { if (el) el.innerHTML = ''; };
const isVisible = (el) => el && el.style.display === 'block';

// HTML escaping για ασφαλή εμφάνιση user/content δεδομένων
function escapeHtml(s=''){
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}

/* Μικρό helper: επαναφόρτωση λίστας διπλωματικών με τα τρέχοντα φίλτρα */
function refreshTheses() {
  const statusFilter = $('status-filter')?.value || '';
  const roleFilter   = $('role-filter')?.value || '';
  return fetchThesesList(statusFilter, roleFilter);
}

/* =========================================================
   Sections manager
   ========================================================= */
const SECTION_IDS = [
  'view-topics-section',
  'create-topic-section',
  'search-student-section',
  'theses-section',
  'invitations-container',
  'stats-container'
];

function clearThesesUI() {
  clear($('theses-list'));
  hide($('export-theses-btn'));
}

function openSection(id) {
  SECTION_IDS.forEach(s => hide($(s)));
  const el = $(id);
  if (!el) return;
  show(el);

  if (id === 'view-topics-section') fetchProfessorTopics();
  if (id === 'invitations-container') fetchInvitations();
  if (id === 'stats-container') fetchAndRenderStats();
  if (id === 'theses-section') clearThesesUI(); // ο χρήστης πατά «Εφαρμογή Φίλτρων»
}

function toggleSection(id) {
  const el = $(id);
  if (!el) return;
  if (isVisible(el)) {
    hide(el);
    if (id === 'search-student-section') clear($('student-results'));
    if (id === 'theses-section') clearThesesUI();
  } else {
    openSection(id);
  }
}

/* =========================================================
   Topics (προβολή/επεξεργασία)
   ========================================================= */
async function fetchProfessorTopics() {
  try {
    const result = await apiJSON('/api/professor-topics');
    if (result.success) renderTopics(result.topics);
    else alert(result.message || 'Σφάλμα κατά τη λήψη των θεμάτων');
  } catch (err) {
    console.error('Error fetching topics:', err);
    alert('Σφάλμα κατά τη λήψη των θεμάτων');
  }
}

function renderTopics(topics = []) {
  const ul = $('topics-list');
  if (!ul) return;
  clear(ul);

  topics.forEach(t => {
    const li = document.createElement('li');
    li.className = 'topic-item';

    li.innerHTML = `
      <div class="topic-head">
        <h3 class="topic-title">${escapeHtml(t.title || '')}</h3>
        <div class="topic-actions">
          ${t.attachment
            ? `<a class="btn btn-sm btn-outline" href="/uploads/${encodeURIComponent(t.attachment)}" target="_blank" rel="noopener">
                 Προβολή Συνημμένου
               </a>` : ''
          }
          <button class="btn btn-sm btn-primary edit-topic-btn"
                  data-topic='${JSON.stringify({
                    id: t.id,
                    title: t.title || '',
                    description: t.description || '',
                    attachment: t.attachment || ''
                  })}'>
            Επεξεργασία
          </button>
        </div>
      </div>

      <p class="topic-desc">${escapeHtml(t.description || '')}</p>

      <div id="edit-topic-form-${t.id}" class="edit-topic-form" style="display:none;">
        <h4>Επεξεργασία Θέματος</h4>
        <form id="edit-form-${t.id}">
          <input type="text" name="title" required placeholder="Νέος Τίτλος"
                 value="${(t.title || '').replace(/"/g,'&quot;')}">
          <textarea name="description" placeholder="Νέα Σύνοψη">${escapeHtml(t.description || '')}</textarea>
          <input type="file" name="file" accept=".pdf">
          <div class="form-actions">
            <button type="submit" class="btn btn-sm btn-primary">Ανανέωση Θέματος</button>
            <button type="button" class="btn btn-sm btn-outline cancel-edit-btn" data-topic-id="${t.id}">Ακύρωση</button>
          </div>
        </form>
      </div>
    `;

    ul.appendChild(li);
  });
}

function editTopic(topicId, title, description) {
  const formWrap = $(`edit-topic-form-${topicId}`);
  const form     = $(`edit-form-${topicId}`);
  if (!formWrap || !form) return;

  show(formWrap);
  form.elements['title'].value       = title || '';
  form.elements['description'].value = description || '';

  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append('id', topicId);
    fd.append('title', form.elements['title'].value);
    fd.append('description', form.elements['description'].value);
    const file = form.elements['file'].files?.[0];
    if (file) fd.append('file', file);

    try {
      const result = await apiJSON('/api/topics', { method: 'PUT', body: fd });
      if (result.success) {
        alert('Το θέμα ενημερώθηκε επιτυχώς!');
        fetchProfessorTopics();
      } else {
        alert(result.message || 'Σφάλμα κατά την ενημέρωση του θέματος');
      }
    } catch (err) {
      console.error('Error updating topic:', err);
      alert('Σφάλμα κατά την ενημέρωση');
    }
  };
}
function cancelEdit(topicId) { hide($(`edit-topic-form-${topicId}`)); }

/* =========================================================
   Search / Assign / Change / Cancel Pending
   ========================================================= */
async function assignTopicToStudent(studentId) {
  try {
    const res = await apiJSON('/api/professor-topics');
    if (!res.success || !res.topics?.length) { alert('Δεν υπάρχουν διαθέσιμα θέματα.'); return; }
    const topicId = await openTopicSelector(res.topics);
    if (!topicId) return;

    const ares = await apiJSON('/api/assign-topic', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ topicId, studentId })
    });
    if (ares.success) {
      alert('Το θέμα ανατέθηκε στον φοιτητή.');
      $('search-student-form')?.dispatchEvent(new Event('submit'));
    } else alert(ares.message || 'Σφάλμα κατά την ανάθεση του θέματος.');
  } catch (err) {
    console.error('Σφάλμα κατά την ανάθεση:', err);
    alert('Σφάλμα κατά την ανάθεση.');
  }
}

async function changeAssignment(topicId, studentId) {
  try {
    const res = await apiJSON('/api/professor-topics');
    if (!res.success || !res.topics?.length) { alert('Δεν υπάρχουν διαθέσιμα θέματα.'); return; }
    const newTopicId = await openTopicSelector(res.topics);
    if (!newTopicId) return;

    const up = await apiJSON('/api/change-assignment', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ topicId: newTopicId, studentId })
    });
    if (up.success) {
      alert('Το θέμα άλλαξε επιτυχώς.');
      $('search-student-form')?.dispatchEvent(new Event('submit'));
    } else alert(up.message || 'Σφάλμα κατά την αλλαγή του θέματος.');
  } catch (err) {
    console.error('Σφάλμα κατά την αλλαγή του θέματος:', err);
    alert('Σφάλμα κατά την αλλαγή του θέματος.');
  }
}

async function cancelPendingAssignment(topicId, studentId) {
  if (!confirm('Είστε σίγουρος ότι θέλετε να ακυρώσετε αυτή την ανάθεση;')) return;
  try {
    const r = await apiJSON('/api/cancel-assignment', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ topicId, studentId })
    });
    if (r.success) {
      alert('Η ανάθεση ακυρώθηκε επιτυχώς.');
      $('search-student-form')?.dispatchEvent(new Event('submit'));
    } else alert(r.message || 'Σφάλμα κατά την ακύρωση της ανάθεσης.');
  } catch (err) {
    console.error('Σφάλμα κατά την ακύρωση της ανάθεσης:', err);
    alert('Σφάλμα κατά την ακύρωση.');
  }
}

/* =========================================================
   Search results (render)
   ========================================================= */
function renderSearchResults(students = []) {
  const box = $('student-results');
  if (!box) return;
  clear(box);

  if (!students.length) { box.textContent = 'Δεν βρέθηκαν φοιτητές.'; return; }

  students.forEach(s => {
    const el = document.createElement('div');
    el.className = 'student-item';

    let statusInfo = 'Δεν έχει ανατεθεί θέμα.';
    let actions = '';

    if (s.topic_id) {
      statusInfo = `Θέμα: ${escapeHtml(s.topic_title)} (Κατάσταση: ${escapeHtml(s.status)})`;
      if (s.status === 'Pending') {
        actions = `
          <button class="change-assignment-btn" data-topic-id="${s.topic_id}" data-student-id="${s.student_id}">Αλλαγή Θέματος</button>
          <button class="cancel-pending-btn" data-topic-id="${s.topic_id}" data-student-id="${s.student_id}">Ακύρωση Ανάθεσης</button>`;
      } else if (s.status === 'Canceled') {
        actions = `<button class="assign-topic-btn" data-student-id="${s.student_id}">Νέα Ανάθεση Θέματος</button>`;
      } else {
        actions = '<p>Δεν μπορείτε να αλλάξετε αυτό το θέμα.</p>';
      }
    } else {
      actions = `<button class="assign-topic-btn" data-student-id="${s.student_id}">Ανάθεση Θέματος</button>`;
    }

    el.innerHTML = `
      <p><strong>${escapeHtml(s.name)}</strong> (${escapeHtml(s.student_number)})</p>
      <p>${statusInfo}</p>
      ${actions}
    `;
    box.appendChild(el);
  });
}

/* =========================================================
   Theses list (filters / render / export)
   ========================================================= */
async function fetchThesesList(statusFilter = '', roleFilter = '') {
  try {
    const qs = new URLSearchParams({ statusFilter, roleFilter });
    const result = await apiJSON(`/api/theses-list?${qs.toString()}`);
    if (result.success) renderThesesList(result.theses);
    else alert(result.message || 'Σφάλμα κατά την ανάκτηση της λίστας διπλωματικών.');
  } catch (err) {
    console.error('Σφάλμα κατά την ανάκτηση της λίστας διπλωματικών:', err);
    alert('Σφάλμα κατά την ανάκτηση της λίστας διπλωματικών.');
  }
}

function renderThesesList(theses = []) {
  const list = $('theses-list');
  const exportBtn = $('export-theses-btn');
  if (!list) return;
  clear(list);

  if (!theses.length) {
    list.innerHTML = '<p>Δεν βρέθηκαν διπλωματικές.</p>';
    if (exportBtn) hide(exportBtn);
    return;
  }

  theses.forEach(thesis => {
    const div = document.createElement('div');
    div.className = 'thesis-item';
    div.dataset.assignmentId = thesis.assignment_id;

    const statusClass = `status-${String(thesis.status || '').toLowerCase()}`;
    const roleLabel = thesis.professor_role || '-';

    let actions = `
      <button class="btn btn-sm btn-outline view-details-btn" data-assignment-id="${thesis.assignment_id}">
        Προβολή Λεπτομερειών
      </button>
    `;

    if (thesis.status === 'Pending' && thesis.professor_role === 'Supervisor') {
      actions += `
        <button class="btn btn-sm btn-danger cancel-assignment-btn" data-assignment-id="${thesis.assignment_id}">
          Ακύρωση Θέματος
        </button>`;
    }

    if (thesis.status === 'Pending') {
      actions += `
        <button class="btn btn-sm btn-outline view-invited-members-btn" data-assignment-id="${thesis.assignment_id}">
          Προσκεκλημένα Μέλη
        </button>
        <div id="invited-members-list-${thesis.assignment_id}" style="display:none;margin-left:4px;"></div>
      `;
    }

    if (thesis.status === 'Active') {
      actions += `
        <button class="btn btn-sm btn-outline notes-btn" data-assignment-id="${thesis.assignment_id}">
          Σημειώσεις
        </button>
        <div id="notes-section-${thesis.assignment_id}" class="notes-section" style="display:none;margin-left:4px;"></div>
      `;
    }

    if (thesis.status === 'Active' && thesis.professor_role === 'Supervisor') {
      actions += `
        <button class="btn btn-sm btn-outline cancel-2y-btn" data-assignment-id="${thesis.assignment_id}">
          Ακύρωση μετά από 2 χρόνια
        </button>
        <button class="btn btn-sm btn-primary set-under-review-btn" data-assignment-id="${thesis.assignment_id}">
          Υπό Εξέταση
        </button>
      `;
    }

    if (thesis.status === 'UnderReview') {
      actions += `
        <button class="btn btn-sm btn-outline view-draft-btn" data-assignment-id="${thesis.assignment_id}">
          Προβολή Πρόχειρου
        </button>
      `;

      if (thesis.professor_role === 'Supervisor') {
        actions += `
          <button class="btn btn-sm btn-outline create-announcement-btn" data-assignment-id="${thesis.assignment_id}">
            Ανακοίνωση
          </button>

          <div class="announcement-form" id="announcement-form-${thesis.assignment_id}" style="display:none;">
            <textarea id="announcement-text-${thesis.assignment_id}" placeholder="Γράψτε το κείμενο της ανακοίνωσης..."></textarea>
            <button class="btn btn-sm btn-primary submit-announcement-btn" data-assignment-id="${thesis.assignment_id}">
              Υποβολή Ανακοίνωσης
            </button>
          </div>
          <div class="announcement-container" id="announcement-container-${thesis.assignment_id}" style="display:none;"></div>

          <button class="btn btn-sm btn-outline enable-grading-btn" data-assignment-id="${thesis.assignment_id}">
            Ενεργοποίηση Καταχώρησης Βαθμού
          </button>
        `;
      }

      actions += `
        <button class="btn btn-sm btn-primary toggle-grading-btn" data-assignment-id="${thesis.assignment_id}">
          Καταχώρηση Βαθμού
        </button>
        <div class="grading-section" id="grading-section-${thesis.assignment_id}" style="display:none;">
          <input type="number" id="grade-input-${thesis.assignment_id}" min="0" max="10" step="0.1" placeholder="Βαθμός">
          <button class="btn btn-sm btn-primary submit-grade-btn" data-assignment-id="${thesis.assignment_id}" ${thesis.grading_enabled ? '' : 'disabled'}>
            Υποβολή Βαθμού
          </button>
          <h4 style="margin:10px 0 6px;">Καταχωρημένοι Βαθμοί</h4>
          <ul id="grades-list-${thesis.assignment_id}" style="margin:0;"></ul>
        </div>
      `;
    }

    div.innerHTML = `
      <div class="thesis-row">
        <div class="meta">
          <h3 class="thesis-title">${escapeHtml(thesis.topic_title)}</h3>
          <div class="sub">Φοιτητής: ${escapeHtml(thesis.student_name)}</div>
          <div class="badges" style="margin-top:6px;">
            <span class="badge ${statusClass}">${escapeHtml(thesis.status)}</span>
            <span class="badge">${escapeHtml(roleLabel)}</span>
          </div>
        </div>
        <div class="toolbar">${actions}</div>
      </div>
      <div class="thesis-details" id="thesis-details-${thesis.assignment_id}" style="display:none;"></div>
    `;

    list.appendChild(div);
  });

  if (exportBtn) show(exportBtn);
}

/* =========================================================
   Thesis details (links + timeline) 
   ========================================================= */
function renderThesisDetailsInto(targetEl, thesisDetails = {}, history = []) {
  if (!thesisDetails || !thesisDetails.assignment_id) {
    targetEl.innerHTML = '<p>Δεν βρέθηκαν λεπτομέρειες για αυτή τη διπλωματική εργασία.</p>';
    return;
  }

  const repoHref = thesisDetails.repository_link && /^https?:\/\//i.test(thesisDetails.repository_link)
    ? thesisDetails.repository_link
    : null;

  // δυναμικό URL πρακτικού 
  const praktikoHref = thesisDetails.praktiko_dynamic_url || null;

  const links = [];
  if (repoHref)     links.push(`<a href="${repoHref}" target="_blank" rel="noopener">Νημερτής – Τελικό Κείμενο</a>`);
  if (praktikoHref) links.push(`<a href="${praktikoHref}" target="_blank" rel="noopener">Πρακτικό Βαθμολόγησης</a>`);
  const linksHtml = links.length ? `<ul>${links.map(li => `<li>${li}</li>`).join('')}</ul>` : '<ul><li>—</li></ul>';

  // Timeline render
  const timelineHtml = (history && history.length)
    ? `<ul>${
        history.map((h, i) => {
          const when   = h.created_at ? ` — ${new Date(h.created_at).toLocaleString('el-GR')}` : '';
          const extras = [];
          if (h.reason) extras.push(escapeHtml(h.reason));
          if (h.gs_arithmos && h.gs_etos) extras.push(`ΓΣ ${h.gs_arithmos}/${h.gs_etos}`);
          return `<li><strong>${escapeHtml(h.status)}</strong>${when}${extras.length ? ' · ' + extras.join(' · ') : ''} <span style="opacity:.6">(βήμα #${i+1})</span></li>`;
        }).join('')
      }</ul>`
    : '<ul><li>—</li></ul>';

  targetEl.innerHTML = `
    <div class="thesis-details-inner">
      <h4>${escapeHtml(thesisDetails.topic_title || '')}</h4>
      <p>${escapeHtml(thesisDetails.topic_description || '')}</p>
      <p><strong>Φοιτητής:</strong> ${escapeHtml(thesisDetails.student_name || '')}</p>
      <p><strong>Κατάσταση:</strong> ${escapeHtml(thesisDetails.status || '-')}</p>
      <p><strong>Τριμελής Επιτροπή:</strong> ${escapeHtml(thesisDetails.committee_members || 'Δεν έχει οριστεί')}</p>

      <p><strong>ΑΠ/ΓΣ:</strong> ${escapeHtml(thesisDetails.practical_protocol || '—')}</p>

      <p><strong>Τελικός Βαθμός:</strong> ${thesisDetails.final_grade ?? 'Δεν έχει βαθμολογηθεί'}</p>

      <h5>Σύνδεσμοι</h5>
      ${linksHtml}

      <h5>Χρονολόγιο Αλλαγών Κατάστασης</h5>
      ${timelineHtml}
    </div>
  `;
}

/* =========================================================
   Export (JSON/CSV)
   ========================================================= */
async function exportTheses(format, statusFilter, roleFilter) {
  const qs = new URLSearchParams({ statusFilter, roleFilter, format });
  const res = await fetch(`/api/export-theses-list?${qs.toString()}`);

  if (format === 'json') {
    const result = await res.json();
    const blob = new Blob([JSON.stringify(result.theses, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: 'theses_list.json' });
    document.body.appendChild(a); a.click(); a.remove();
  } else {
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: 'theses_list.csv' });
    document.body.appendChild(a); a.click(); a.remove();
  }
}

/* =========================================================
   Invited members (render πίνακας)
   ========================================================= */
function renderInvitedMembers(assignmentId, members = []) {
  const c = $(`invited-members-list-${assignmentId}`);
  if (!c) return;

  if (!members.length) {
    c.innerHTML = '<p>Δεν υπάρχουν προσκεκλημένα μέλη.</p>';
    show(c);
    return;
  }

  let html = `
    <table border="1" style="border-collapse:collapse;margin-top:10px;">
      <tr>
        <th>Καθηγητής</th>
        <th>Κατάσταση</th>
        <th>Ημ/νία Πρόσκλησης</th>
        <th>Ημ/νία Απάντησης</th>
      </tr>`;
  members.forEach(m => {
    const sent = m.sent_date ? new Date(m.sent_date).toLocaleString('el-GR') : '-';
    const resp = m.response_date ? new Date(m.response_date).toLocaleString('el-GR') : '-';
    html += `
      <tr>
        <td>${escapeHtml(m.professor_name || '-')}</td>
        <td>${escapeHtml(m.status)}</td>
        <td>${sent}</td>
        <td>${resp}</td>
      </tr>`;
  });
  html += `</table>`;
  c.innerHTML = html;
  show(c);
}

/* =========================================================
   Notes (προβολή/εισαγωγή)
   ========================================================= */
function renderNotesSection(assignmentId, container, notes = []) {
  let html = '<h4>Οι Σημειώσεις μου</h4>';
  if (!notes.length) html += '<p>Δεν υπάρχουν σημειώσεις.</p>';
  else html += '<ul>' + notes.map(n => `<li>${escapeHtml(n.content)}</li>`).join('') + '</ul>';

  html += `
    <h5>Προσθήκη νέας σημείωσης</h5>
    <textarea id="new-note-content-${assignmentId}" rows="3" style="width:95%;" placeholder="Μέχρι 300 χαρακτήρες..."></textarea>
    <br>
    <button class="add-note-btn" data-assignment-id="${assignmentId}">Αποθήκευση Σημείωσης</button>
  `;
  container.innerHTML = html;
}

/* =========================================================
   Announcements (ensure UI / render view)
   ========================================================= */
async function ensureAnnouncementUI(assignmentId) {
  const form = $(`announcement-form-${assignmentId}`);
  const cont = $(`announcement-container-${assignmentId}`);
  if (!form || !cont) return;

  try {
    const r = await apiJSON(`/api/announcements/${assignmentId}`);
    if (r.success && r.announcement) {
      hide(form);
      renderAnnouncementView(cont, r.announcement);
      show(cont);
    } else {
      cont.innerHTML = '';
      hide(cont);
      show(form);
    }
  } catch {
    // Fallback: δείξε φόρμα
    cont.innerHTML = '';
    hide(cont);
    show(form);
  }
}

function renderAnnouncementView(container, ann) {
  container.innerHTML = `
    <div class="announcement-item">
      <div class="announcement-text">${escapeHtml(ann.text)}</div>
      <div class="announcement-meta">Δημιουργήθηκε: ${new Date(ann.created_at).toLocaleString('el-GR')}</div>
    </div>
  `;
}

/* =========================================================
   Grades (φόρτωση λίστας)
   ========================================================= */
async function loadGrades(assignmentId) {
  try {
    const result = await apiJSON(`/api/grades/${assignmentId}`);
    if (result.success) {
      const ul = $(`grades-list-${assignmentId}`);
      if (!ul) return;
      clear(ul);
      ul.innerHTML += `<li>Επιβλέπων: ${result.grades.professor1_grade ?? 'Δεν έχει καταχωρηθεί'}</li>`;
      ul.innerHTML += `<li>Μέλος 1: ${result.grades.professor2_grade ?? 'Δεν έχει καταχωρηθεί'}</li>`;
      ul.innerHTML += `<li>Μέλος 2: ${result.grades.professor3_grade ?? 'Δεν έχει καταχωρηθεί'}</li>`;
      ul.innerHTML += `<li><strong>Τελικός Βαθμός:</strong> ${result.grades.final_grade ?? 'Δεν έχει υπολογιστεί'}</li>`;
    }
  } catch (err) {
    console.error('Σφάλμα φόρτωσης βαθμολογιών:', err);
    alert('Αποτυχία φόρτωσης βαθμολογιών');
  }
}

/* =========================================================
   Invitations (λίστα/απάντηση)
   ========================================================= */
async function fetchInvitations() {
  try {
    const data = await apiJSON('/api/invitations');
    if (!data.success) { alert(data.message || 'Σφάλμα ανάκτησης προσκλήσεων'); return; }
    renderInvitations(data.invitations || []);
  } catch (err) {
    console.error('fetchInvitations error:', err);
    alert('Πρόβλημα σύνδεσης με τον server');
  }
}

function renderInvitations(invitations = []) {
  const list = $('invitations-list');
  if (!list) return;
  clear(list);
  if (!invitations.length) { list.innerHTML = '<p>Δεν υπάρχουν ενεργές προσκλήσεις.</p>'; return; }
  invitations.forEach(inv => {
    const item = document.createElement('div');
    item.className = 'invitation-item';
    item.innerHTML = `
      <h4>${escapeHtml(inv.topic_title)}</h4>
      <p>Φοιτητής: ${escapeHtml(inv.student_name)}</p>
      <p>Κατάσταση: ${escapeHtml(inv.invitation_status)}</p>
      <button class="accept-btn" data-id="${inv.invitation_id}">Αποδοχή</button>
      <button class="reject-btn" data-id="${inv.invitation_id}">Απόρριψη</button>
    `;
    list.appendChild(item);
  });
}

async function respondToInvitation(invitationId, status) {
  try {
    const data = await apiJSON('/api/invitations/respond', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ invitationId, status })
    });
    if (!data.success) { alert(data.message || 'Σφάλμα ενημέρωσης πρόσκλησης'); return; }
    alert(`Η πρόσκληση έχει πλέον: ${status}`);
    fetchInvitations();
  } catch (err) {
    console.error('respondToInvitation error:', err);
    alert('Πρόβλημα αποστολής αιτήματος');
  }
}

/* =========================================================
   Stats (placeholder)
   ========================================================= */
async function fetchAndRenderStats() {}

/* =========================================================
   DOM Ready: δέσιμο handlers 
   ========================================================= */
document.addEventListener('DOMContentLoaded', () => {
  // Κρύψε όλα τα sections αρχικά
  SECTION_IDS.forEach(s => hide($(s)));

  // Κεντρικά κουμπιά
  $('view-topics-btn')?.addEventListener('click', () => toggleSection('view-topics-section'));
  $('create-topic-btn')?.addEventListener('click', () => toggleSection('create-topic-section'));
  $('search-student-btn')?.addEventListener('click', () => toggleSection('search-student-section'));
  $('filter-theses-btn')?.addEventListener('click', () => toggleSection('theses-section'));
  $('invitations-btn')?.addEventListener('click', () => toggleSection('invitations-container'));

  /* Create Topic */
  $('create-topic-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const result = await apiJSON('/api/topics', { method: 'POST', body: fd });
      if (result.success) {
        alert('Θέμα δημιουργήθηκε με επιτυχία!');
        if ($('view-topics-section')?.style.display === 'block') fetchProfessorTopics();
        e.target.reset();
      } else alert(result.message || 'Σφάλμα κατά τη δημιουργία θέματος');
    } catch (err) {
      console.error(err);
      alert('Σφάλμα κατά τη δημιουργία θέματος');
    }
  });

  /* Topics delegation */
  $('topics-list')?.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.edit-topic-btn');
    if (editBtn?.dataset.topic) {
      const topic = JSON.parse(editBtn.dataset.topic);
      editTopic(topic.id, topic.title, topic.description, topic.attachment || '');
      return;
    }
    const cancelBtn = e.target.closest('.cancel-edit-btn');
    if (cancelBtn) cancelEdit(cancelBtn.dataset.topicId);
  });

  /* Search student */
  $('search-student-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = $('student-search')?.value.trim() || '';
    if (!q) { clear($('student-results')); return; }
    try {
      const data = await apiJSON(`/api/search-student?searchQuery=${encodeURIComponent(q)}`);
      if (data.success) renderSearchResults(data.students);
      else alert(data.message || 'Σφάλμα κατά την αναζήτηση του φοιτητή');
    } catch (err) {
      console.error('search-student error:', err);
      alert('Πρόβλημα κατά την αναζήτηση');
    }
  });

  /* Delegation: actions στα αποτελέσματα φοιτητών */
  $('student-results')?.addEventListener('click', (e) => {
    const assignBtn = e.target.closest('.assign-topic-btn');
    if (assignBtn) { assignTopicToStudent(assignBtn.dataset.studentId); return; }
    const changeBtn = e.target.closest('.change-assignment-btn');
    if (changeBtn) { changeAssignment(changeBtn.dataset.topicId, changeBtn.dataset.studentId); return; }
    const cancelPendBtn = e.target.closest('.cancel-pending-btn');
    if (cancelPendBtn) { cancelPendingAssignment(cancelPendBtn.dataset.topicId, cancelPendBtn.dataset.studentId); return; }
  });

  /* Filters: apply & export */
  $('apply-filters-btn')?.addEventListener('click', () => {
    openSection('theses-section');
    refreshTheses();
  });

  $('export-theses-btn')?.addEventListener('click', async () => {
    const statusFilter = $('status-filter')?.value || '';
    const roleFilter   = $('role-filter')?.value || '';
    const format = (prompt('Επιλέξτε μορφή εξαγωγής (json ή csv):', 'json') || 'json').toLowerCase();
    if (!['json', 'csv'].includes(format)) { alert('Μη έγκυρη μορφή.'); return; }
    await exportTheses(format, statusFilter, roleFilter);
  });

  /* ===== Delegation για όλα τα δυναμικά κουμπιά στη λίστα ΔΕ ===== */
  $('theses-list')?.addEventListener('click', async (e) => {
    const tgt = e.target;

    // Προβολή λεπτομερειών (με timeline/links)
    const detailsBtn = tgt.closest('.view-details-btn');
    if (detailsBtn) {
      const assignmentId = detailsBtn.dataset.assignmentId;
      const box = $(`thesis-details-${assignmentId}`);
      if (!box) return;
      if (isVisible(box)) { hide(box); box.innerHTML = ''; return; }
      show(box); box.innerHTML = '<p>Φόρτωση…</p>';
      try {
        const data = await apiJSON(`/api/thesis-details/${assignmentId}`);
        if (!data.success) { box.innerHTML = `<p>${data.message || 'Σφάλμα κατά την ανάκτηση λεπτομερειών.'}</p>`; return; }
        renderThesisDetailsInto(box, data.thesisDetails || {}, data.history || []);
      } catch (err) {
        console.error('Σφάλμα κατά την ανάκτηση λεπτομερειών:', err);
        box.innerHTML = '<p>Σφάλμα κατά την ανάκτηση λεπτομερειών.</p>';
      }
      return;
    }

    // Ακύρωση θέματος (Pending, Supervisor)
    const cancelBtn = tgt.closest('.cancel-assignment-btn');
    if (cancelBtn) {
      const assignmentId = cancelBtn.dataset.assignmentId;
      if (!confirm('Επιβεβαιώνετε την ακύρωση αυτού του θέματος;')) return;
      cancelBtn.disabled = true;
      try {
        const data = await apiJSON('/api/assignments/cancel', {
          method: 'POST',
          headers: { 'Content-Type':'application/json' },
          body: JSON.stringify({ assignmentId })
        });
        if (!data.success) { alert(data.message || 'Σφάλμα κατά την ακύρωση του θέματος'); return; }
        alert('Το θέμα ακυρώθηκε με επιτυχία.');
        await refreshTheses();
      } catch (err) {
        console.error('Error canceling assignment:', err);
        alert('Πρόβλημα κατά την ακύρωση');
      } finally {
        cancelBtn.disabled = false;
      }
      return;
    }

    // Προσκεκλημένα μέλη
    const invitedBtn = tgt.closest('.view-invited-members-btn');
    if (invitedBtn) {
      const assignmentId = invitedBtn.dataset.assignmentId;
      const c = $(`invited-members-list-${assignmentId}`);
      if (!c) return;
      if (isVisible(c)) hide(c);
      else {
        try {
          const data = await apiJSON(`/api/assignments/${assignmentId}/invited-members`);
          if (!data.success) { alert(data.message || 'Σφάλμα κατά την ανάκτηση'); return; }
          renderInvitedMembers(assignmentId, data.invitedMembers);
        } catch (err) {
          console.error('Error fetching invited members:', err);
          alert('Πρόβλημα ανάκτησης');
        }
      }
      return;
    }

    // Σημειώσεις
    const notesBtn = tgt.closest('.notes-btn');
    if (notesBtn) {
      const assignmentId = notesBtn.dataset.assignmentId;
      const notesSec = $(`notes-section-${assignmentId}`);
      if (!notesSec) return;
      if (isVisible(notesSec)) hide(notesSec);
      else {
        show(notesSec);
        try {
          const data = await apiJSON(`/api/my-notes?assignmentId=${assignmentId}`);
          if (!data.success) { alert(data.message || 'Σφάλμα ανάκτησης σημειώσεων'); return; }
          renderNotesSection(assignmentId, notesSec, data.notes);
        } catch (err) {
          console.error('Error loading notes:', err);
          alert('Σφάλμα φόρτωσης σημειώσεων');
        }
      }
      return;
    }

    // Προσθήκη σημείωσης
    const addNoteBtn = tgt.closest('.add-note-btn');
    if (addNoteBtn) {
      const assignmentId = addNoteBtn.dataset.assignmentId;
      const contentEl = $(`new-note-content-${assignmentId}`);
      if (!contentEl) return;
      const content = contentEl.value.trim();
      if (!content) { alert('Παρακαλώ γράψτε κάτι.'); return; }
      if (content.length > 300) { alert('Η σημείωση δεν πρέπει να ξεπερνά τους 300 χαρακτήρες.'); return; }

      try {
        const res = await apiJSON('/api/notes', {
          method: 'POST',
          headers: { 'Content-Type':'application/json' },
          body: JSON.stringify({ assignmentId, content })
        });
        if (!res.success) { alert(res.message || 'Σφάλμα καταχώρησης σημείωσης'); return; }
        contentEl.value = '';
        const reload = await apiJSON(`/api/my-notes?assignmentId=${assignmentId}`);
        if (reload.success) renderNotesSection(assignmentId, $(`notes-section-${assignmentId}`), reload.notes);
      } catch (err) {
        console.error('Error posting note:', err);
        alert('Πρόβλημα αποστολής σημείωσης.');
      }
      return;
    }

    // Ακύρωση μετά από 2 έτη
    const cancel2yBtn = tgt.closest('.cancel-2y-btn');
    if (cancel2yBtn) {
      const assignmentId = cancel2yBtn.dataset.assignmentId;
      if (!confirm('Επιβεβαιώνετε την ακύρωση μετά από 2 έτη;')) return;
      const gsArithmos = prompt('Εισάγετε αριθμό Γενικής Συνέλευσης:');
      if (!gsArithmos) return;
      const gsEtos = prompt('Εισάγετε έτος Γενικής Συνέλευσης:');
      if (!gsEtos) return;

      try {
        const data = await apiJSON('/api/cancel-after-two-years', {
          method: 'POST',
          headers: { 'Content-Type':'application/json' },
          body: JSON.stringify({ assignmentId, gsArithmos, gsEtos })
        });
        if (!data.success) alert(data.message || 'Σφάλμα κατά την ακύρωση');
        else {
          alert(data.message);
          refreshTheses();
        }
      } catch (err) {
        console.error('Error canceling after 2 years:', err);
        alert('Σφάλμα στο αίτημα ακύρωσης.');
      }
      return;
    }

    // Ορισμός UnderReview
    const underRevBtn = tgt.closest('.set-under-review-btn');
    if (underRevBtn) {
      const assignmentId = underRevBtn.dataset.assignmentId;
      if (!confirm('Θέλετε να ορίσετε τη διπλωματική ως "Υπό Εξέταση";')) return;
      try {
        const data = await apiJSON('/api/set-under-review', {
          method: 'POST',
          headers: { 'Content-Type':'application/json' },
          body: JSON.stringify({ assignmentId })
        });
        if (!data.success) alert(data.message || 'Σφάλμα κατά την αλλαγή κατάστασης.');
        else {
          alert(data.message);
          // ο χρήστης έχει φίλτρο Active — επαναφόρτωση τοπικά
          refreshTheses();
        }
      } catch (err) {
        console.error('Error setting under review:', err);
        alert('Πρόβλημα αποστολής αιτήματος.');
      }
      return;
    }

    // Προβολή draft (popup PDF)
    const viewDraftBtn = tgt.closest('.view-draft-btn');
    if (viewDraftBtn) {
      const assignmentId = viewDraftBtn.dataset.assignmentId;
      try {
        const data = await apiJSON(`/api/draft/${assignmentId}`);
        if (!data.success) { alert(data.message || 'Σφάλμα κατά την ανάκτηση του πρόχειρου.'); return; }
        if (!data.submission) { alert('Δεν υπάρχει ανεβασμένο πρόχειρο κείμενο.'); return; }
        const pdfDraftName = data.submission.pdf_draft;
        const supporting = data.submission.supporting_materials;
        if (!pdfDraftName) { alert('Δεν έχει οριστεί pdf_draft.'); return; }
        const pdfUrl = `/uploads/drafts/${pdfDraftName}`;
        openDraftViewer({ pdfUrl, supportingMaterials: supporting });
      } catch (err) {
        console.error('Error fetching draft:', err);
        alert('Πρόβλημα σύνδεσης');
      }
      return;
    }

    // Ανακοίνωση: εμφάνιση είτε προβολής είτε φόρμας 
    const createAnnBtn = tgt.closest('.create-announcement-btn');
    if (createAnnBtn) {
      const assignmentId = createAnnBtn.dataset.assignmentId;
      const frm  = $(`announcement-form-${assignmentId}`);
      const cont = $(`announcement-container-${assignmentId}`);
      if (!frm || !cont) return;
      if (isVisible(frm) || isVisible(cont)) { hide(frm); hide(cont); }
      else { await ensureAnnouncementUI(assignmentId); }
      return;
    }

    // Υποβολή ανακοίνωσης
    const submitAnnBtn = tgt.closest('.submit-announcement-btn');
    if (submitAnnBtn) {
      const assignmentId = submitAnnBtn.dataset.assignmentId;
      const txtEl = $(`announcement-text-${assignmentId}`);
      const text = (txtEl?.value || '').trim();
      if (!text) { alert('Γράψτε κείμενο ανακοίνωσης.'); return; }
      try {
        const res = await apiJSON('/api/announcements', {
          method: 'POST',
          headers: { 'Content-Type':'application/json' },
          body: JSON.stringify({ assignmentId, text })
        });
        if (!res.success) { alert(res.message || 'Αποτυχία καταχώρησης ανακοίνωσης'); return; }
        alert('Ανακοίνωση δημιουργήθηκε επιτυχώς');
        txtEl.value = '';
        await ensureAnnouncementUI(assignmentId);
      } catch (err) {
        console.error('submit announcement error:', err);
        alert('Πρόβλημα αποστολής ανακοίνωσης.');
      }
      return;
    }

    // Ενεργοποίηση καταχώρησης βαθμού (Supervisor)
    const enableGradingBtn = tgt.closest('.enable-grading-btn');
    if (enableGradingBtn) {
      const assignmentId = enableGradingBtn.dataset.assignmentId;
      try {
        const res = await apiJSON('/api/enable-grading', {
          method: 'POST',
          headers: { 'Content-Type':'application/json' },
          body: JSON.stringify({ assignmentId })
        });
        if (!res.success) { alert(res.message || 'Αποτυχία ενεργοποίησης'); return; }
        alert(res.message || 'Η δυνατότητα καταχώρησης ενεργοποιήθηκε.');
        const sec = $(`grading-section-${assignmentId}`);
        const btn = sec?.querySelector('.submit-grade-btn');
        if (sec) show(sec);
        if (btn) btn.disabled = false;
        loadGrades(assignmentId);
      } catch (err) {
        console.error('enable grading error:', err);
        alert('Σφάλμα κατά την ενεργοποίηση.');
      }
      return;
    }

    // Εναλλαγή εμφάνισης grading section
    const toggleGradingBtn = tgt.closest('.toggle-grading-btn');
    if (toggleGradingBtn) {
      const assignmentId = toggleGradingBtn.dataset.assignmentId;
      const sec = $(`grading-section-${assignmentId}`);
      if (!sec) return;
      if (isVisible(sec)) hide(sec);
      else { show(sec); loadGrades(assignmentId); }
      return;
    }

    // Υποβολή βαθμού
    const submitGradeBtn = tgt.closest('.submit-grade-btn');
    if (submitGradeBtn) {
      const assignmentId = submitGradeBtn.dataset.assignmentId;
      const input = $(`grade-input-${assignmentId}`);
      const grade = Number(input?.value);
      if (!Number.isFinite(grade) || grade < 0 || grade > 10) { alert('Ο βαθμός πρέπει να είναι από 0 έως 10.'); return; }
      try {
        const res = await apiJSON('/api/submit-grade', {
          method: 'POST',
          headers: { 'Content-Type':'application/json' },
          body: JSON.stringify({ assignmentId, grade })
        });
        if (!res.success) { alert(res.message || 'Αποτυχία καταχώρησης βαθμού'); return; }
        alert(res.message || 'Ο βαθμός καταχωρήθηκε.');
        loadGrades(assignmentId);
      } catch (err) {
        console.error('Σφάλμα κατά την καταχώρηση βαθμού.', err);
        alert('Σφάλμα κατά την καταχώρηση βαθμού.');
      }
      return;
    }
  });

  /* Invitations delegation (accept/reject) */
  $('invitations-list')?.addEventListener('click', (e) => {
    const accept = e.target.closest('.accept-btn');
    const reject = e.target.closest('.reject-btn');
    if (accept) respondToInvitation(accept.dataset.id, 'Accepted');
    if (reject) respondToInvitation(reject.dataset.id, 'Rejected');
  });
});

/* =========================================================
   MODALS: generic + topic selector + draft viewer
   ========================================================= */
function openModal({ title = '', content, width }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const card = document.createElement('div');
  card.className = 'modal-card';
  if (width) card.style.width = width;

  const header = document.createElement('div');
  header.className = 'modal-header';
  header.innerHTML = `<h3>${escapeHtml(title)}</h3><button class="modal-close" aria-label="Κλείσιμο">×</button>`;

  const body = document.createElement('div');
  body.className = 'modal-body';
  if (typeof content === 'string') body.innerHTML = content; else body.appendChild(content);

  const actions = document.createElement('div');
  actions.className = 'modal-actions';

  card.append(header, body, actions);
  overlay.append(card);
  document.body.append(overlay);

  const onKey = (e) => { if (e.key === 'Escape') close(); };
  function close() { document.removeEventListener('keydown', onKey); overlay.remove(); }
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  header.querySelector('.modal-close').addEventListener('click', close);
  document.addEventListener('keydown', onKey);

  setTimeout(() => {
    const first = card.querySelector('button, [href], input, select, textarea');
    if (first) first.focus();
  }, 0);

  return { overlay, card, body, actions, close };
}

function openTopicSelector(topics = []) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    const label = document.createElement('label');
    label.textContent = 'Επιλέξτε θέμα:';
    label.style.display = 'block';
    label.style.marginBottom = '8px';

    const select = document.createElement('select');
    select.style.width = '100%';
    select.style.height = '40px';
    select.style.fontSize = '16px';
    topics.forEach(t => {
      const o = document.createElement('option');
      o.value = t.id;
      o.textContent = t.title;
      select.appendChild(o);
    });

    wrap.append(label, select);

    const { actions, close } = openModal({ title: 'Επιλογή Θέματος', content: wrap });

    const cancel = document.createElement('button');
    cancel.className = 'secondary-btn';
    cancel.textContent = 'Ακύρωση';

    const ok = document.createElement('button');
    ok.className = 'primary-btn';
    ok.textContent = 'Ανάθεση';

    actions.append(cancel, ok);

    cancel.onclick = () => { close(); resolve(null); };
    ok.onclick     = () => { const v = select.value; close(); resolve(v); };
  });
}

function openDraftViewer({ pdfUrl, supportingMaterials }) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <iframe src="${pdfUrl}" frameborder="0" style="width:100%;height:65vh;"></iframe>
    <div style="margin-top:10px">
      ${ supportingMaterials
          ? `<a href="${supportingMaterials}" target="_blank" rel="noopener">Υποστηρικτικό υλικό</a>`
          : '<em>Δεν υπάρχει υποστηρικτικό υλικό.</em>' }
    </div>
  `;

  const { actions, close } = openModal({
    title: 'Πρόχειρο Κείμενο',
    content: wrap,
    width: 'min(1100px, 98vw)'
  });

  const newTab = document.createElement('button');
  newTab.className = 'secondary-btn';
  newTab.textContent = 'Άνοιγμα σε νέα καρτέλα';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'primary-btn';
  closeBtn.textContent = 'Κλείσιμο';

  actions.append(newTab, closeBtn);

  newTab.onclick = () => window.open(pdfUrl, '_blank', 'noopener');
  closeBtn.onclick = close;
}
