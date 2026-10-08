
const path   = require('path');
const fs     = require('fs');
const multer = require('multer');
const db     = require('../db'); // shared MySQL pool

/* =========================================================
   Paths & FS bootstrap
   ========================================================= */
const draftsDir = path.join(__dirname, '../uploads/drafts');
fs.mkdirSync(draftsDir, { recursive: true }); // idempotent, χωρίς logs

/* =========================================================
   Multer setup 
    επιτρέπεται και χωρίς αρχείο (req.file μπορεί να είναι null)
   ========================================================= */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, draftsDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const original = file?.originalname || 'file.pdf';
    const ext  = path.extname(original) || '.pdf';
    const base = path.basename(original, path.extname(original));
    cb(null, `${unique}-${base}${ext}`);
  }
});

// Προαιρετικός ήπιος έλεγχος PDF (δεν μπλοκάρει edge cases: βασίζεται σε mimetype/όνομα)
function pdfOnly(_req, file, cb) {
  const ok = file?.mimetype === 'application/pdf'
          || /\.pdf$/i.test(file?.originalname || '');
  cb(ok ? null : new Error('Μόνο PDF επιτρέπεται'), ok);
}

// Input name: draftFile (όπως στο υπάρχον frontend)
const uploadDraftMw = multer({
  storage,
  fileFilter: pdfOnly,           // ήπιο φίλτρο
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
}).single('draftFile');

/* =========================================================
   Helpers
   ========================================================= */

/** Εύκολο 403 για Professors. Επιστρέφει το id ή null αν απάντησε ήδη. */
function requireProfessor(req, res) {
  const u = req.session?.user;
  if (!u || u.role !== 'Professor') {
    res.status(403).json({ success: false, message: 'Μη εξουσιοδοτημένη πρόσβαση (μόνο Διδάσκοντες).' });
    return null;
  }
  return u.id;
}

/** Εύκολο 401 για Students. Επιστρέφει το id ή null αν απάντησε ήδη. */
function requireStudent(req, res) {
  const u = req.session?.user;
  if (!u) {
    res.status(401).json({ success: false, message: 'Δεν υπάρχει φοιτητής στο session.' });
    return null;
  }
  return u.id;
}

/** Upsert του Submissions (λογική: update αν υπάρχει, αλλιώς insert). */
function upsertSubmission({ assignmentId, pdfDraft, supportingMaterials }, done) {
  const sel = 'SELECT id FROM Submissions WHERE assignment_id = ? LIMIT 1';
  db.query(sel, [assignmentId], (e1, r1) => {
    if (e1) return done(e1);

    if (r1.length) {
      const upd = `
        UPDATE Submissions
        SET pdf_draft = ?, supporting_materials = ?
        WHERE assignment_id = ?
      `;
      return db.query(upd, [pdfDraft, supportingMaterials, assignmentId], done);
    }

    const ins = `
      INSERT INTO Submissions (assignment_id, pdf_draft, supporting_materials)
      VALUES (?, ?, ?)
    `;
    return db.query(ins, [assignmentId, pdfDraft, supportingMaterials], done);
  });
}

/* =========================================================
   POST /api/submissions/upload  (uploadDraftSubmission)
   - Χρησιμοποιεί session.assignmentId ή req.body.assignmentId 
   - Απαιτεί Assignments.status = 'UnderReview'
   ========================================================= */
exports.uploadDraftSubmission = (req, res) => {
  const assignmentId = req.session?.assignmentId || req.body?.assignmentId;
  if (!assignmentId) {
    return res.status(400).json({ success: false, message: 'Assignment ID is required.' });
  }

  const qStatus = 'SELECT status FROM Assignments WHERE id = ?';
  db.query(qStatus, [assignmentId], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error.' });
    }
    if (!rows.length || rows[0].status !== 'UnderReview') {
      return res.status(400).json({ success: false, message: 'Assignment is not under review.' });
    }

    // Εκτέλεση upload (input name: draftFile)
    uploadDraftMw(req, res, (upErr) => {
      if (upErr) {
        return res.status(500).json({ success: false, message: 'Error uploading file.' });
      }

      // ΣΥΝΕΠΕΙΑ με το υπάρχον: αν δεν στάλθηκε αρχείο, pdf_draft = null
      const pdfDraft = req.file ? req.file.filename : null;
      const supportingMaterials = req.body?.supporting_materials || null;

      upsertSubmission({ assignmentId, pdfDraft, supportingMaterials }, (e2) => {
        if (e2) {
          return res.status(500).json({ success: false, message: 'Error saving submission.' });
        }
        return res.status(200).json({ success: true, message: 'Draft submitted successfully.' });
      });
    });
  });
};

/* =========================================================
   GET /api/draft/:assignmentId  (viewDraftForUnderReview)
   - Μόνο για Καθηγητές
   - Ελέγχει ότι η ανάθεση είναι UnderReview
   - Επιστρέφει { pdf_draft, supporting_materials } ή submission:null
   ========================================================= */
exports.viewDraftForUnderReview = (req, res) => {
  const professorId = requireProfessor(req, res);
  if (!professorId) return;

  const assignmentId = req.params?.assignmentId;
  if (!assignmentId) {
    return res.status(400).json({ success: false, message: 'Απαιτείται assignmentId.' });
  }

  const qCheck = 'SELECT status FROM Assignments WHERE id = ? LIMIT 1';
  db.query(qCheck, [assignmentId], (e1, r1) => {
    if (e1) {
      return res.status(500).json({ success: false, message: 'Σφάλμα DB' });
    }
    if (!r1.length) {
      return res.status(404).json({ success: false, message: 'Δεν βρέθηκε εργασία με αυτό το ID.' });
    }
    if (r1[0].status !== 'UnderReview') {
      return res.status(400).json({ success: false, message: 'Η εργασία δεν είναι σε κατάσταση Υπό Εξέταση.' });
    }

    const qSub = `
      SELECT pdf_draft, supporting_materials
      FROM Submissions
      WHERE assignment_id = ?
      LIMIT 1
    `;
    db.query(qSub, [assignmentId], (e2, r2) => {
      if (e2) {
        return res.status(500).json({ success: false, message: 'Σφάλμα DB κατά την ανάκτηση του draft.' });
      }
      if (!r2.length) {
        return res.status(200).json({
          success: true,
          message: 'Δεν υπάρχει ανεβασμένο πρόχειρο κείμενο.',
          submission: null
        });
      }
      return res.status(200).json({
        success: true,
        message: 'Draft found.',
        submission: r2[0]
      });
    });
  });
};

/* =========================================================
   GET /api/submissions/draft-assignment-id (getDraftAssignmentId)
   - Για φοιτητή: βρίσκει το πιο πρόσφατο UnderReview assignment
   - Αποθηκεύει και στο session (req.session.assignmentId)
   ========================================================= */
exports.getDraftAssignmentId = (req, res) => {
  const studentId = requireStudent(req, res);
  if (!studentId) return;

  const q = `
    SELECT id
    FROM Assignments
    WHERE student_id = ? AND status = "UnderReview"
    ORDER BY id DESC
    LIMIT 1
  `;
  db.query(q, [studentId], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Σφάλμα στη βάση δεδομένων.' });
    }
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Δεν βρέθηκε ανάθεση σε κατάσταση UnderReview για αυτόν τον φοιτητή.' });
    }
    req.session.assignmentId = rows[0].id;
    return res.status(200).json({ success: true, assignmentId: req.session.assignmentId });
  });
};

/* =========================================================
   GET /api/submissions/current (getSubmission)
   - Για φοιτητή: χρησιμοποιεί το assignmentId από το session
   - Επιστρέφει την υποβολή ή 404
   ========================================================= */
exports.getSubmission = (req, res) => {
  const studentId = requireStudent(req, res);
  if (!studentId) return;

  const assignmentId = req.session?.assignmentId;
  if (!assignmentId) {
    return res.status(404).json({ success: false, message: 'Δεν βρέθηκε ανάθεση για αυτόν τον φοιτητή.' });
    }
  const q = 'SELECT pdf_draft, supporting_materials FROM Submissions WHERE assignment_id = ? LIMIT 1';
  db.query(q, [assignmentId], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Σφάλμα στη βάση δεδομένων.' });
    }
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Δεν βρέθηκε υποβολή για αυτή την ανάθεση.' });
    }
    return res.status(200).json({ success: true, submission: rows[0] });
  });
};
