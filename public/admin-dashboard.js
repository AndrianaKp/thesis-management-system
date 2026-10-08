

document.addEventListener('DOMContentLoaded', () => {
  /* ---------------------- JSON Import modal ---------------------- */
  const openJsonBtn   = document.getElementById('open-json-modal');
  const jsonModal     = document.getElementById('json-modal');
  const closeJsonBtn  = document.getElementById('close-json-modal');
  const cancelJsonBtn = document.getElementById('cancel-json-import');

  function openJsonModal() {
    if (jsonModal) jsonModal.style.display = 'flex';
  }
  function closeJsonModal() {
    if (jsonModal) jsonModal.style.display = 'none';
    const m = document.getElementById('json-import-message');
    if (m) { m.textContent = ''; m.removeAttribute('style'); }
    const input = document.getElementById('jsonFile');
    if (input) input.value = '';
  }

  openJsonBtn?.addEventListener('click', openJsonModal);
  closeJsonBtn?.addEventListener('click', closeJsonModal);
  cancelJsonBtn?.addEventListener('click', closeJsonModal);
  jsonModal?.addEventListener('click', (e) => { if (e.target === jsonModal) closeJsonModal(); });

  /* ---------------------- Toggle λίστας -------------------------- */
  const toggleBtn = document.getElementById('toggle-list-btn');
  const listWrap  = document.getElementById('list-wrapper');

  toggleBtn?.addEventListener('click', async () => {
    const isOpen = listWrap.style.display === 'block';
    if (isOpen) {
      listWrap.style.display = 'none';
      toggleBtn.textContent = 'Εμφάνιση Λίστας';
    } else {
      listWrap.style.display = 'block';
      toggleBtn.textContent = 'Απόκρυψη Λίστας';

      // αν ο πίνακας είναι άδειος, φόρτωσε δεδομένα
      const tbody = document.getElementById('assignments-table-body');
      if (!tbody || !tbody.children.length) {
        await loadAssignments();
      }
    }
  });
});

let lastAssignmentId = null;

/* ---------------------- Φόρτωση λίστας -------------------------- */
async function loadAssignments() {
  const tbody = document.getElementById('assignments-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  try {
    const res = await fetch('/api/secretariat/assignments');
    const { success, assignments } = await res.json();

    if (!success || !assignments?.length) {
      tbody.innerHTML = '<tr><td colspan="5">Δεν βρέθηκαν ΔΕ.</td></tr>';
      return;
    }

    assignments.forEach(a => {
      const row = tbody.insertRow();
      row.insertCell().textContent = a.student_name;
      row.insertCell().textContent = a.student_number;
      row.insertCell().textContent = a.topic_title;

      const statusCell = row.insertCell();
      const cls = {
        Pending: 'badge--pending',
        Active: 'badge--active',
        UnderReview: 'badge--underrev',
        Completed: 'badge--completed',
        Canceled: 'badge--canceled'
      }[a.status] || '';
      statusCell.innerHTML = `<span class="badge ${cls}">${a.status}</span>`;

      const actionCell = row.insertCell();
      const detailsBtn = document.createElement('button');
      detailsBtn.textContent = 'Λεπτομέρειες';
      detailsBtn.className = 'show-details-btn';
      detailsBtn.dataset.id = a.id;
      actionCell.appendChild(detailsBtn);

      detailsBtn.addEventListener('click', () => showAssignmentDetails(a.id));
    });
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="5">Σφάλμα σύνδεσης.</td></tr>';
  }
}

/* ---------------------- Λεπτομέρειες ---------------------------- */
async function showAssignmentDetails(assignmentId) {
  const section          = document.getElementById('admin-assignment-details-section');
  const gsApFormSection  = document.getElementById('gs-ap-form-section');
  const cancelSection    = document.getElementById('cancel-assignment-section');
  const completeSection  = document.getElementById('complete-assignment-section');
  const actionsBar       = document.getElementById('admin-details-actions');
  const btnOpenGsAp      = document.getElementById('btn-open-gsap');
  const btnOpenCancel    = document.getElementById('btn-open-cancel');

  const hideAllExtras = () => {
    if (gsApFormSection) gsApFormSection.style.display = 'none';
    if (cancelSection)   cancelSection.style.display   = 'none';
    if (completeSection) completeSection.style.display = 'none';
    if (actionsBar)      actionsBar.style.display      = 'none';
  };

  // toggle off αν ξαναπατηθεί το ίδιο
  if (section.style.display === 'block' && lastAssignmentId === assignmentId) {
    section.style.display = 'none';
    hideAllExtras();
    lastAssignmentId = null;
    return;
  }

  lastAssignmentId = assignmentId;
  section.style.display = 'block';
  hideAllExtras(); // reset UI

  // καθάρισε πεδία
  document.getElementById('details-topic-title').textContent = '';
  document.getElementById('details-student-name').textContent = '';
  document.getElementById('details-student-number').textContent = '';
  document.getElementById('details-topic-description').textContent = '';
  document.getElementById('details-status').textContent = '';
  document.getElementById('details-elapsed').textContent = '';
  document.getElementById('details-committee-list').innerHTML = '';

  try {
    const res = await fetch(`/api/secretariat/assignments/${assignmentId}`);
    const { success, assignment } = await res.json();
    if (!success || !assignment) {
      document.getElementById('details-topic-title').textContent = 'Δεν βρέθηκαν λεπτομέρειες.';
      return;
    }

    // fill
    document.getElementById('details-topic-title').textContent = assignment.topic_title;
    document.getElementById('details-student-name').textContent = assignment.student_name;
    document.getElementById('details-student-number').textContent = assignment.student_number;
    document.getElementById('details-topic-description').textContent = assignment.topic_description;
    document.getElementById('details-status').textContent = assignment.status;
    document.getElementById('details-elapsed').textContent =
      (assignment.elapsedTime != null) ? `${assignment.elapsedTime} ημέρες` : '-';

    const ul = document.getElementById('details-committee-list');
    if (assignment.committee_members?.length) {
      assignment.committee_members.forEach(m => {
        const li = document.createElement('li');
        li.textContent = `${m.role}: ${m.name}`;
        ul.appendChild(li);
      });
    } else {
      const li = document.createElement('li');
      li.textContent = 'Δεν έχουν οριστεί ακόμα.';
      ul.appendChild(li);
    }

    // ACTIVE: δείξε τα κουμπιά (φόρμες κρυφές ως να πατηθούν)
    if (assignment.status === 'Active') {
      if (actionsBar) actionsBar.style.display = 'grid';

      if (btnOpenGsAp && !btnOpenGsAp.dataset.bound) {
        btnOpenGsAp.dataset.bound = '1';
        btnOpenGsAp.addEventListener('click', () => {
          gsApFormSection.style.display =
            (gsApFormSection.style.display === 'block') ? 'none' : 'block';
          if (gsApFormSection.style.display === 'block') {
            cancelSection.style.display = 'none';
            const msg = document.getElementById('gs-ap-message');
            if (msg) msg.textContent = '';
            const input = document.getElementById('gs-arithmos');
            if (input) input.value = '';
          }
        });
      }

      if (btnOpenCancel && !btnOpenCancel.dataset.bound) {
        btnOpenCancel.dataset.bound = '1';
        btnOpenCancel.addEventListener('click', () => {
          cancelSection.style.display =
            (cancelSection.style.display === 'block') ? 'none' : 'block';
          if (cancelSection.style.display === 'block') {
            gsApFormSection.style.display = 'none';
            const msg = document.getElementById('cancel-assignment-message');
            if (msg) msg.textContent = '';
            const a = document.getElementById('cancel-gs-arithmos');
            const e = document.getElementById('cancel-gs-etos');
            const r = document.getElementById('cancel-reason');
            if (a) a.value = '';
            if (e) e.value = '';
            if (r) r.value = 'Κατόπιν αίτησης φοιτητή/τριας';
          }
        });
      }
    }

    // UNDER REVIEW: panel ολοκλήρωσης
    if (assignment.status === 'UnderReview' && completeSection) {
      completeSection.style.display = 'block';
      const checkMsg   = document.getElementById('completion-check-msg');
      const completeBtn = document.getElementById('complete-btn');
      const resultMsg  = document.getElementById('complete-result-message');

      checkMsg.textContent = 'Έλεγχος προϋποθέσεων...';
      resultMsg.textContent = '';
      completeBtn.disabled = true;

      try {
        const r = await fetch(`/api/secretariat/assignments/${assignmentId}/complete/eligibility`);
        const data = await r.json();
        if (data.success) {
          if (data.eligible) {
            checkMsg.textContent = 'OK: υπάρχει βαθμός και σύνδεσμος Νημερτής.';
            completeBtn.disabled = false;
          } else {
            const parts = [];
            if (data.missing?.status)   parts.push(data.missing.status);
            if (data.missing?.grade)    parts.push(data.missing.grade);
            if (data.missing?.nemertes) parts.push(data.missing.nemertes);
            checkMsg.textContent = 'Δεν είναι έτοιμο: ' + parts.join(' ');
          }
        } else {
          checkMsg.textContent = data.message || 'Σφάλμα ελέγχου.';
        }
      } catch {
        checkMsg.textContent = 'Σφάλμα σύνδεσης στον έλεγχο.';
      }
    }
  } catch (e) {
    document.getElementById('details-topic-title').textContent = 'Σφάλμα κατά την ανάκτηση λεπτομερειών.';
  }
}

/* ---------------------- Κλείσιμο panel ------------------------- */
document.getElementById('close-details-btn')?.addEventListener('click', () => {
  document.getElementById('admin-assignment-details-section').style.display = 'none';
  const gsApFormSection = document.getElementById('gs-ap-form-section');
  const cancelSection   = document.getElementById('cancel-assignment-section');
  const completeSection = document.getElementById('complete-assignment-section');
  if (gsApFormSection) gsApFormSection.style.display = 'none';
  if (cancelSection)   cancelSection.style.display   = 'none';
  if (completeSection) completeSection.style.display = 'none';
  lastAssignmentId = null;
});

/* ---------------------- Καταχώρηση ΑΠ/ΓΣ ---------------------- */
document.getElementById('gs-ap-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const ap_praktiko = document.getElementById('gs-arithmos').value;

  const msg = document.getElementById('gs-ap-message');
  msg.textContent = '';

  if (!ap_praktiko) {
    msg.textContent = 'Συμπληρώστε αριθμό πρακτικού!';
    msg.style.color = 'red';
    return;
  }

  try {
    const res = await fetch(`/api/secretariat/assignments/${lastAssignmentId}/gs-ap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ap_praktiko })
    });
    const data = await res.json();
    msg.textContent = data.message;
    msg.style.color = data.success ? 'green' : 'red';
    if (data.success) {
      setTimeout(() => {
        msg.textContent = '';
        document.getElementById('admin-assignment-details-section').style.display = 'none';
        document.getElementById('gs-ap-form-section').style.display = 'none';
        lastAssignmentId = null;
        loadAssignments();
      }, 1300);
    }
  } catch {
    msg.textContent = 'Σφάλμα κατά την αποθήκευση.';
    msg.style.color = 'red';
  }
});

/* ---------------------- Ακύρωση ανάθεσης ---------------------- */
document.getElementById('cancel-assignment-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const gs_arithmos = document.getElementById('cancel-gs-arithmos').value;
  const gs_etos     = document.getElementById('cancel-gs-etos').value;
  const reason      = document.getElementById('cancel-reason').value;
  const msg         = document.getElementById('cancel-assignment-message');
  msg.textContent = '';

  if (!gs_arithmos || !gs_etos) {
    msg.textContent = 'Συμπληρώστε αριθμό και έτος!';
    msg.style.color = 'red';
    return;
  }

  try {
    const res = await fetch(`/api/secretariat/assignments/${lastAssignmentId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gs_arithmos, gs_etos, reason })
    });
    const data = await res.json();
    msg.textContent = data.message;
    msg.style.color = data.success ? 'green' : 'red';
    if (data.success) {
      setTimeout(() => {
        msg.textContent = '';
        document.getElementById('admin-assignment-details-section').style.display = 'none';
        document.getElementById('cancel-assignment-section').style.display = 'none';
        lastAssignmentId = null;
        loadAssignments();
      }, 1200);
    }
  } catch {
    msg.textContent = 'Σφάλμα κατά την ακύρωση.';
    msg.style.color = 'red';
  }
});

/* ---------------------- Εισαγωγή από JSON --------------------- */
document.getElementById('json-import-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const input      = document.getElementById('jsonFile');
  const messageDiv = document.getElementById('json-import-message');
  const submitBtn  = document.getElementById('json-import-submit');
  const cancelBtn  = document.getElementById('cancel-json-import');

  messageDiv.textContent = '';
  messageDiv.style.color = '';

  if (!input?.files?.length) {
    messageDiv.textContent = 'Επιλέξτε αρχείο JSON!';
    messageDiv.style.color = 'red';
    return;
  }

  const formData = new FormData();
  formData.append('jsonFile', input.files[0]);

  submitBtn && (submitBtn.disabled = true);
  cancelBtn && (cancelBtn.disabled = true);

  try {
    const res  = await fetch('/api/secretariat/import-json', { method: 'POST', body: formData });
    const data = await res.json();

    messageDiv.textContent = data.message || 'Η εισαγωγή ολοκληρώθηκε.';
    messageDiv.style.color = data.success ? 'green' : 'red';

    if (data.success) {
      // αφήνουμε το modal ανοικτό για δεύτερη εισαγωγή
      input.value = '';
    }
  } catch (err) {
    console.error(err);
    messageDiv.textContent = 'Σφάλμα κατά την εισαγωγή.';
    messageDiv.style.color = 'red';
  } finally {
    submitBtn && (submitBtn.disabled = false);
    cancelBtn && (cancelBtn.disabled = false);
  }
});

/* --------------------------- Περατωμένη ----------------------- */
const completeBtn = document.getElementById('complete-btn');
if (completeBtn && !completeBtn.dataset.bound) {
  completeBtn.dataset.bound = '1';
  completeBtn.addEventListener('click', async () => {
    const resultMsg = document.getElementById('complete-result-message');
    resultMsg.textContent = '';

    if (!lastAssignmentId) {
      resultMsg.textContent = 'Δεν βρέθηκε ανάθεση.';
      resultMsg.style.color = 'red';
      return;
    }

    completeBtn.disabled = true;
    try {
      const res = await fetch(`/api/secretariat/assignments/${lastAssignmentId}/complete`, { method: 'POST' });
      let data;
      try { data = await res.json(); } catch { data = { success: false, message: `HTTP ${res.status}` }; }

      resultMsg.textContent = data.message || (data.success ? 'Ολοκληρώθηκε.' : 'Αποτυχία.');
      resultMsg.style.color = data.success ? 'green' : 'red';

      if (data.success) {
        setTimeout(() => {
          document.getElementById('admin-assignment-details-section').style.display = 'none';
          document.getElementById('complete-assignment-section').style.display = 'none';
          lastAssignmentId = null;
          loadAssignments();
        }, 900);
      }
    } catch {
      resultMsg.textContent = 'Σφάλμα κατά την ολοκλήρωση.';
      resultMsg.style.color = 'red';
    } finally {
      completeBtn.disabled = false;
    }
  });
}
