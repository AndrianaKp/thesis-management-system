

/* ========================== Βοηθητικά loads ========================== */
/** Φορτώνει (αν υπάρχει) draft assignment id στον κρυφό input */
async function loadDraftAssignmentId() {
  try {
    const r = await fetch('/api/students/draft-assignment');
    const { success, assignmentId, message } = await r.json();
    if (success) {
      const el = document.getElementById('assignment-id');
      if (el) el.value = assignmentId;
    } else {
      console.error(message);
    }
  } catch (err) {
    console.error('Error loading draft assignmentId:', err);
  }
}

/** Φορτώνει (αν υπάρχει) assignment id στον κρυφό input */
async function loadAssignmentId() {
  try {
    const r = await fetch('/api/students/assignment');
    const { success, assignmentId, message } = await r.json();
    if (success) {
      const el = document.getElementById('assignment-id');
      if (el) el.value = assignmentId;
    } else {
      console.error(message);
    }
  } catch (err) {
    console.error('Error loading assignmentId:', err);
  }
}

/** Φέρνει καθηγητές για επιλογή επιτροπής (προαιρετικό assignmentId) */
async function loadTeachers() {
  try {
    const el = document.getElementById('assignment-id');
    const assignmentId = el ? el.value : '';
    const r = await fetch(`/api/students/teachers?assignmentId=${encodeURIComponent(assignmentId)}`);
    const { success, teachers } = await r.json();
    if (!success || !Array.isArray(teachers) || !teachers.length) {
      console.log('Δεν υπάρχουν καθηγητές προς εμφάνιση.');
      return;
    }
    const select = document.getElementById('professors');
    if (!select) return;
    select.innerHTML = '';
    teachers.forEach(t => {
      const option = document.createElement('option');
      option.value = t.id;
      option.textContent = t.name;
      select.appendChild(option);
    });
  } catch (err) {
    console.error('Σφάλμα φόρτωσης καθηγητών:', err);
  }
}

/** Επιστρέφει HTML με την τρέχουσα υποβολή (πρόχειρο PDF + υποστηρικτικό) */
async function loadSubmission() {
  try {
    const r = await fetch('/api/students/submission');
    const result = await r.json();
    if (!result.success) return `<p>${result.message}</p>`;

    const s = result.submission;
    const pdfUrl = s.pdf_draft ? `/uploads/drafts/${encodeURIComponent(s.pdf_draft)}` : null;
    const supporting = s.supporting_materials
      ? `<a href="${s.supporting_materials}" target="_blank" rel="noopener">${s.supporting_materials}</a>`
      : 'Δεν έχει δοθεί υποστηρικτικό υλικό.';

    let html = '';
    if (pdfUrl) {
      html += `
        <iframe src="${pdfUrl}" style="width:100%;height:65vh;border:0;"></iframe>
        <div style="margin-top:8px">
          <a href="${pdfUrl}" target="_blank" rel="noopener">Άνοιγμα PDF σε νέα καρτέλα</a>
        </div>
      `;
    } else {
      html += '<p>Δεν υπάρχει ανεβασμένο αρχείο πρόχειρου.</p>';
    }
    html += `<h4 style="margin-top:14px">Υποστηρικτικό Υλικό</h4><p>${supporting}</p>`;
    return html;
  } catch (err) {
    console.error('Σφάλμα κατά την ανάκτηση της υποβολής:', err);
    return '<p>Σφάλμα κατά την ανάκτηση της υποβολής.</p>';
  }
}

/* ======================== UI helpers / renderers ======================== */
/** Timeline ιστορικού καταστάσεων (απλό <ul>) */
function renderStatusTimeline(history = []) {
  if (!history.length) return '<p>Δεν υπάρχουν καταχωρήσεις ιστορικού.</p>';
  return `
    <h3 style="margin-top:16px">Χρονολόγιο Αλλαγών Κατάστασης</h3>
    <ul>
      ${history.map((h, i) => {
        const when = h.created_at ? new Date(h.created_at).toLocaleString('el-GR') : '—';
        const reason = h.reason ? ` · ${h.reason}` : '';
        return `<li><strong>${h.status || '—'}</strong> — ${when}${reason} <span style="color:#777">(βήμα #${i + 1})</span></li>`;
      }).join('')}
    </ul>
  `;
}

/** Όταν η ΔΕ είναι Completed, κρύβει όλες τις φόρμες και αφήνει μόνο τα “προβολής” */
function applyCompletedUI() {
  const idsToHide = [
    'profile-section',
    'committee-section',
    'draft-submission-section',
    'exam-section',
    'repository-section',
  ];
  idsToHide.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  const praktikoSection = document.getElementById('praktiko-section');
  if (praktikoSection) praktikoSection.style.display = 'block';
}

/* Καρτέλες που «ανοίγουν/κλείνουν» — κρατάμε ποια είναι ανοιχτή για να κλείνουμε την προηγούμενη */
let lastOpenedSection = null;

/* ============================ DOMContentLoaded =========================== */
document.addEventListener('DOMContentLoaded', () => {
  // 1) Prefetch βασικών ταυτοτήτων + λίστα καθηγητών
  loadDraftAssignmentId();
  loadAssignmentId().then(loadTeachers);

  // 2) Προετοιμασία “sections”
  const thesisDetailsDiv        = document.getElementById('thesis-details');
  const committeeSection        = document.getElementById('committee-section');
  const draftSubmissionSection  = document.getElementById('draft-submission-section');
  const viewSubmissionBtn       = document.getElementById('view-submission-btn'); // δηλώνεται ΜΙΑ φορά
  const viewThesisButton        = document.getElementById('view-thesis-button');

  if (thesisDetailsDiv)        thesisDetailsDiv.style.display = 'none';
  if (committeeSection)        committeeSection.style.display = 'none';
  if (draftSubmissionSection)  draftSubmissionSection.style.display = 'none';
  if (viewSubmissionBtn)       viewSubmissionBtn.style.display = 'none';

  // 3) Αν η ΔΕ είναι Completed, διαμορφώνουμε το UI (+ ορισμός πρακτικού με id)
  (async () => {
    try {
      const r = await fetch('/api/students/thesis-details');
      const data = await r.json();
      if (data.success && data.thesisDetails?.status === 'Completed') {
        applyCompletedUI();
        const praktikoButton = document.getElementById('view-praktiko-button');
        if (praktikoButton) {
          praktikoButton.onclick = () =>
            window.open(`/api/students/praktiko/${data.thesisDetails.assignment_id}`, '_blank');
        }
      }
    } catch (e) {
      console.warn('Completed UI check failed:', e);
    }
  })();

  /* ---------------------- Προβολή Θέματος (toggle) ---------------------- */
  if (viewThesisButton) {
    viewThesisButton.addEventListener('click', async () => {
      if (!thesisDetailsDiv) return;

      // Κλείσε όποιο άλλο “section” ήταν ανοιχτό
      if (lastOpenedSection && lastOpenedSection !== thesisDetailsDiv) {
        lastOpenedSection.style.display = 'none';
      }
      // Toggle κλείσιμο
      if (thesisDetailsDiv.style.display === 'block') {
        thesisDetailsDiv.style.display = 'none';
        thesisDetailsDiv.innerHTML = '';
        if (committeeSection)       committeeSection.style.display = 'none';
        if (draftSubmissionSection) draftSubmissionSection.style.display = 'none';
        lastOpenedSection = null;
        return;
      }
      lastOpenedSection = thesisDetailsDiv;

      try {
        thesisDetailsDiv.innerHTML = '<p>Φόρτωση δεδομένων...</p>';
        thesisDetailsDiv.style.display = 'block';

        const r = await fetch('/api/students/thesis-details');
        const { success, message, thesisDetails, history } = await r.json();
        if (!success) {
          thesisDetailsDiv.innerHTML = `<p>${message}</p>`;
          return;
        }

        // Βασικές πληροφορίες θέματος
        thesisDetailsDiv.innerHTML = `
          <h2>${thesisDetails.topic_title}</h2>
          <p>${thesisDetails.topic_description}</p>
          ${
            thesisDetails.topic_attachment
              ? `<a href="/uploads/${thesisDetails.topic_attachment}" target="_blank" rel="noopener">Προβολή Συνημμένου Αρχείου</a>`
              : '<p>Δεν υπάρχει συνημμένο αρχείο.</p>'
          }
          <p>Κατάσταση: ${thesisDetails.status}</p>
          <p>Μέλη Επιτροπής: ${thesisDetails.committee_members || 'Δεν έχουν οριστεί'}</p>
          <p>Χρόνος από Ανάθεση: ${thesisDetails.elapsedTime} ημέρες</p>
        `;

        // Completed: μόνο προβολές + timeline + πρακτικό
        if (thesisDetails.status === 'Completed') {
          applyCompletedUI();
          const praktikoButton = document.getElementById('view-praktiko-button');
          if (praktikoButton) {
            praktikoButton.onclick = () =>
              window.open(`/api/students/praktiko/${thesisDetails.assignment_id}`, '_blank');
          }
          const timelineWrap = document.createElement('div');
          timelineWrap.innerHTML = renderStatusTimeline(history || []);
          thesisDetailsDiv.appendChild(timelineWrap);
          return;
        }

        // Pending: εμφάνιση φόρμας επιτροπής
        if (thesisDetails.status === 'Pending') {
          if (committeeSection) {
            committeeSection.style.display = 'block';
            thesisDetailsDiv.appendChild(committeeSection);
          }
        } else if (committeeSection) {
          committeeSection.style.display = 'none';
        }

        // UnderReview: εμφάνιση φόρμας πρόχειρου + κουμπί προβολής
        const isUnderReview = thesisDetails.status === 'UnderReview';
        if (draftSubmissionSection) draftSubmissionSection.style.display = isUnderReview ? 'block' : 'none';
        if (viewSubmissionBtn)      viewSubmissionBtn.style.display      = isUnderReview ? 'inline-block' : 'none';
        if (isUnderReview && draftSubmissionSection) {
          thesisDetailsDiv.appendChild(draftSubmissionSection);
        }
      } catch (err) {
        console.error('Σφάλμα κατά την ανάκτηση λεπτομερειών:', err);
        thesisDetailsDiv.innerHTML = '<p>Σφάλμα κατά την ανάκτηση δεδομένων.</p>';
      }
    });
  }

  /* ---------------------- Modal προβολής υποβολής ---------------------- */
  if (viewSubmissionBtn) {
    viewSubmissionBtn.addEventListener('click', async () => {
      const modal  = document.getElementById('submission-modal');
      const body   = document.getElementById('submission-modal-body');
      const newTab = document.getElementById('submission-newtab');
      if (!modal || !body) return;

      body.innerHTML = 'Φόρτωση…';
      modal.style.display = 'flex';

      try {
        const r = await fetch('/api/students/submission');
        const result = await r.json();

        if (!result.success) {
          body.innerHTML = `<p>${result.message}</p>`;
          if (newTab) newTab.hidden = true;
          return;
        }

        const s = result.submission;
        const pdfUrl = s.pdf_draft ? `/uploads/drafts/${encodeURIComponent(s.pdf_draft)}` : null;
        const supporting = s.supporting_materials;

        if (pdfUrl) {
          body.innerHTML = `
            <iframe src="${pdfUrl}" style="width:100%;height:65vh;border:0;"></iframe>
            <div style="margin-top:10px">
              ${supporting
                ? `<a href="${supporting}" target="_blank" rel="noopener noreferrer">Υποστηρικτικό υλικό</a>`
                : '<em>Δεν υπάρχει υποστηρικτικό υλικό.</em>'}
            </div>
          `;
          if (newTab) { newTab.href = pdfUrl; newTab.hidden = false; }
        } else {
          body.innerHTML = '<p>Δεν υπάρχει ανεβασμένο αρχείο πρόχειρου.</p>';
          if (newTab) newTab.hidden = true;
        }
      } catch (err) {
        console.error('Σφάλμα κατά την ανάκτηση της υποβολής:', err);
        body.innerHTML = '<p>Σφάλμα κατά την ανάκτηση της υποβολής.</p>';
        if (newTab) newTab.hidden = true;
      }
    });
  }

  // Κλείσιμο modal: κλικ έξω, Χ, ή Escape
  const submissionModal = document.getElementById('submission-modal');
  if (submissionModal) {
    submissionModal.addEventListener('click', (e) => {
      if (e.target === submissionModal || e.target.classList.contains('close')) {
        submissionModal.style.display = 'none';
        const body = document.getElementById('submission-modal-body');
        if (body) body.innerHTML = '';
      }
    });
    document.addEventListener('keydown', (e) => {
      if (submissionModal.style.display === 'flex' && e.key === 'Escape') {
        submissionModal.style.display = 'none';
        const body = document.getElementById('submission-modal-body');
        if (body) body.innerHTML = '';
      }
    });
  }

  /* ---------------------- Προφίλ / Στοιχεία επικοινωνίας ---------------------- */
  const editProfileButton = document.getElementById('edit-profile-button');
  const profileForm       = document.getElementById('profile-form');
  if (editProfileButton && profileForm) {
    editProfileButton.addEventListener('click', () => {
      if (lastOpenedSection && lastOpenedSection !== profileForm) {
        lastOpenedSection.style.display = 'none';
      }
      const open = profileForm.style.display === 'block';
      profileForm.style.display = open ? 'none' : 'block';
      lastOpenedSection = open ? null : profileForm;
    });
  }

  const updateProfileForm = document.getElementById('update-profile-form');
  if (updateProfileForm) {
    updateProfileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email          = document.getElementById('email')?.value || null;
      const phone          = document.getElementById('phone')?.value || null;
      const landline_phone = document.getElementById('landline_phone')?.value || null;
      const address        = document.getElementById('address')?.value || null;

      try {
        const r = await fetch('/api/students/update-contact-info', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, phone, landline_phone, address }),
        });
        const result = await r.json();
        const msg = document.getElementById('profile-message');
        if (msg) {
          msg.innerText = result.message;
          msg.style.color = result.success ? 'green' : 'red';
        }
      } catch (err) {
        console.error('Σφάλμα κατά την ενημέρωση στοιχείων:', err);
        const msg = document.getElementById('profile-message');
        if (msg) msg.innerText = 'Σφάλμα κατά την ενημέρωση.';
      }
    });
  }

  /* ---------------------- Επιτροπή (υποβολή) ---------------------- */
  const committeeForm = document.getElementById('committee-form');
  if (committeeForm) {
    committeeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const assignmentId = document.getElementById('assignment-id')?.value;
      const selectedOptions = Array.from(document.getElementById('professors')?.selectedOptions || []);
      const professorIds = selectedOptions.map(opt => opt.value);

      const r = await fetch('/api/students/committee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId, professorIds }),
      });
      const result = await r.json();
      alert(result.message);
    });
  }

  /* ---------------------- Upload draft ---------------------- */
  const draftForm = document.getElementById('draft-submission-form');
  if (draftForm) {
    draftForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(draftForm);
      const msg = document.getElementById('draft-message');
      if (msg) { msg.textContent = 'Γίνεται αποστολή…'; msg.style.color = ''; }

      try {
        const r = await fetch('/api/students/upload-draft', { method: 'POST', body: fd });
        const result = await r.json();
        if (msg) {
          msg.textContent = result.message || (result.success ? 'ΟΚ' : 'Αποτυχία');
          msg.style.color = result.success ? 'green' : 'red';
        }
        if (result.success) {
          const vbtn = document.getElementById('view-submission-btn');
          if (vbtn) vbtn.style.display = 'inline-block';
        }
      } catch (err) {
        console.error('Error submitting draft:', err);
        if (msg) { msg.textContent = 'Σφάλμα αποστολής.'; msg.style.color = 'red'; }
      }
    });
  }

  /* ---------------------- Δήλωση εξέτασης ---------------------- */
  const examForm = document.getElementById('exam-form');
  if (examForm) {
    examForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const date             = document.getElementById('exam-date')?.value;
      const tropos_eksetasis = document.getElementById('exam-type')?.value;
      const location         = document.getElementById('exam-location')?.value;

      try {
        const r = await fetch('/api/students/exam', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date, tropos_eksetasis, location }),
        });
        const result = await r.json();
        const msg = document.getElementById('exam-message');
        if (msg) {
          msg.innerText = result.message;
          msg.style.color = result.success ? 'green' : 'red';
        }
        if (result.success) {
          const btn = document.getElementById('view-exam-details-button');
          if (btn) btn.style.display = 'block';
        }
      } catch (err) {
        console.error('Σφάλμα κατά την καταχώρηση:', err);
        const msg = document.getElementById('exam-message');
        if (msg) msg.innerText = 'Σφάλμα κατά την καταχώρηση.';
      }
    });
  }

  /* Toggle φόρμας εξέτασης */
  const toggleExamBtn = document.getElementById('toggle-exam-form-button');
  if (toggleExamBtn) {
    toggleExamBtn.addEventListener('click', () => {
      const box = document.getElementById('exam-form-container');
      if (!box) return;
      if (lastOpenedSection && lastOpenedSection !== box) lastOpenedSection.style.display = 'none';
      const open = box.style.display === 'block';
      box.style.display = open ? 'none' : 'block';
      lastOpenedSection = open ? null : box;
    });
  }

  /* Προβολή στοιχείων εξέτασης */
  const viewExamBtn = document.getElementById('view-exam-details-button');
  if (viewExamBtn) {
    viewExamBtn.addEventListener('click', async () => {
      const wrap = document.getElementById('exam-details-container');
      if (!wrap) return;

      // Toggle κλείσιμο
      if (wrap.style.display === 'block') {
        wrap.style.display = 'none';
        return;
      }

      try {
        const r = await fetch('/api/students/exam-details');
        const result = await r.json();
        if (!result.success) {
          wrap.innerHTML = `<p>${result.message}</p>`;
          wrap.style.display = 'block';
          return;
        }

        const { date, location, tropos_eksetasis } = result.examDetails;
        const dateEl = document.getElementById('exam-date-display');
        const typeEl = document.getElementById('exam-type-display');
        const locEl  = document.getElementById('exam-location-display');

        if (dateEl) dateEl.innerText = new Date(date).toLocaleString();
        if (typeEl) typeEl.innerText = tropos_eksetasis;
        if (locEl)  locEl.innerText  = location;

        wrap.style.display = 'block';
      } catch (err) {
        console.error('Σφάλμα κατά την ανάκτηση των στοιχείων εξέτασης:', err);
        wrap.innerHTML = '<p>Σφάλμα κατά την ανάκτηση δεδομένων.</p>';
        wrap.style.display = 'block';
      }
    });
  }

  /* ---------------------- Νημερτής (τελικό link) ---------------------- */
  const repoForm  = document.getElementById('save-repository-form');
  const repoInput = document.getElementById('repository-link');
  const repoMsg   = document.getElementById('repository-message');
  const toggleBtn = document.getElementById('toggle-repository-form-button');

  // Toggle φόρμας Νημερτή
  if (toggleBtn && repoForm) {
    toggleBtn.addEventListener('click', () => {
      const open = repoForm.style.display === 'block';
      repoForm.style.display = open ? 'none' : 'block';
      toggleBtn.textContent = open ? '➕ Καταχώρηση Συνδέσμου Νημερτή'
                                   : '➖ Απόκρυψη Φόρμας';
    });
  }

  // Αποθήκευση συνδέσμου Νημερτή
  if (repoForm && repoInput && repoMsg) {
    repoForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = repoInput.value.trim();

      if (!/^https?:\/\/.+/i.test(url)) {
        repoMsg.textContent = 'Δώστε έγκυρο URL που αρχίζει με http(s)://';
        repoMsg.style.color = 'red';
        return;
      }

      const submitBtn = repoForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const r = await fetch('/api/students/repository-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repository_link: url }),
        });
        const result = await r.json();

        repoMsg.textContent = result.message || (result.success ? 'Αποθηκεύτηκε.' : 'Αποτυχία.');
        repoMsg.style.color = result.success ? 'green' : 'red';

        if (result.success) {
          repoForm.reset();
          repoForm.style.display = 'none';
          if (toggleBtn) toggleBtn.textContent = '➕ Καταχώρηση Συνδέσμου Νημερτή';
        }
      } catch (err) {
        console.error('Σφάλμα αποθήκευσης συνδέσμου:', err);
        repoMsg.textContent = 'Σφάλμα κατά την αποθήκευση.';
        repoMsg.style.color = 'red';
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  /* ---------------------- Πρακτικό (auto-show αν υπάρχουν 3 βαθμοί) ---------------------- */
  checkGradesAndShowPraktiko();
});

/* ======================= Πρακτικό: auto-show helper ======================= */
async function checkGradesAndShowPraktiko() {
  try {
    const r = await fetch('/api/students/thesis-details');
    const { success, thesisDetails: t } = await r.json();
    if (!success || !t) return;

    const has3Grades =
      t.professor1_grade !== null &&
      t.professor2_grade !== null &&
      t.professor3_grade !== null;

    if (has3Grades) {
      const praktikoSection = document.getElementById('praktiko-section');
      const praktikoButton  = document.getElementById('view-praktiko-button');

      if (praktikoSection) praktikoSection.style.display = 'block';
      if (praktikoButton) {
        praktikoButton.onclick = () =>
          window.open(`/api/students/praktiko/${t.assignment_id}`, '_blank');
      }
    }
  } catch (err) {
    console.error('Σφάλμα κατά την εμφάνιση του πρακτικού:', err);
  }
}
