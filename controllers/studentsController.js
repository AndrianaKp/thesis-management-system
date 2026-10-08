
const path   = require('path');
const fs     = require('fs');
const multer = require('multer');
const db     = require('../db');

/* =========================================================
   Uploads (Drafts) – ρύθμιση αποθήκευσης PDF πρόχειρου
   ========================================================= */
const draftsDir = path.join(__dirname, '..', 'uploads', 'drafts');
fs.mkdirSync(draftsDir, { recursive: true });

const storageDrafts = multer.diskStorage({
  destination: (req, file, cb) => cb(null, draftsDir),
  filename   : (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.pdf';
    cb(null, `draft_${Date.now()}${ext}`);
  }
});
const onlyPdf = (req, file, cb) => {
  const ok = file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname || '');
  cb(ok ? null : new Error('Μόνο PDF επιτρέπεται'), ok);
};
const uploadDraftMw = multer({
  storage: storageDrafts,
  fileFilter: onlyPdf,
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
}).single('pdf_draft'); 

// Εξάγουμε το middleware για χρήση στο route
exports.uploadDraftMw = uploadDraftMw;

/* =========================================================
   Λήψη λεπτομερειών διπλωματικής + ιστορικό (τρέχουσα μη-Canceled)
   ========================================================= */
exports.getThesisDetails = (req, res) => {
  const studentId = req.session.user?.id;
  if (!studentId) {
    return res.status(401).json({ success: false, message: 'Δεν βρέθηκε ID φοιτητή στο session.' });
  }

  const detailsSql = `
    SELECT 
      A.id            AS assignment_id,
      A.status,
      T.title         AS topic_title,
      T.description   AS topic_description,
      T.attachment    AS topic_attachment,
      A.start_date,
      A.repository_link,
      GROUP_CONCAT(DISTINCT U.name SEPARATOR ', ') AS committee_members,
      G.professor1_grade,
      G.professor2_grade,
      G.professor3_grade,
      G.final_grade
    FROM (
      SELECT *
      FROM Assignments
      WHERE student_id = ? AND status <> 'Canceled'
      ORDER BY id DESC
      LIMIT 1
    ) A
    JOIN Topics T               ON T.id = A.topic_id
    LEFT JOIN CommitteeMembers CM ON CM.assignment_id = A.id
    LEFT JOIN Users U           ON U.id = CM.professor_id
    LEFT JOIN Grades G          ON G.assignment_id = A.id
    GROUP BY A.id
  `;

  db.query(detailsSql, [studentId], (err, rows) => {
    if (err) {
      console.error('Σφάλμα κατά την ανάκτηση λεπτομερειών διπλωματικής:', err);
      return res.status(500).json({ success: false, message: 'Σφάλμα κατά την ανάκτηση λεπτομερειών διπλωματικής.' });
    }
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Δεν υπάρχει ενεργή/υπό ανάθεση διπλωματική.' });
    }

    const thesis = rows[0];

    // Υπολογισμός elapsed ημερών από start_date (ελάχιστο 1)
    const DAY = 24 * 60 * 60 * 1000;
    const parseMySQLDate = (d) => {
      if (!d) return null;
      if (d instanceof Date) return d;
      const s = String(d).trim();
      const isoish = /^\d{4}-\d{2}-\d{2}/.test(s) ? s.replace(' ', 'T') : s;
      const dt = new Date(isoish);
      return isNaN(dt) ? null : dt;
    };
    const startDate = parseMySQLDate(thesis.start_date);
    const elapsedTime = startDate
      ? Math.max(1, Math.floor((Date.now() - startDate.getTime()) / DAY) + 1)
      : 0;

    const historySql = `
      SELECT id, status, reason, gs_arithmos, gs_etos, created_at
      FROM AssignmentStatusHistory
      WHERE assignment_id = ?
      ORDER BY created_at ASC, id ASC
    `;
    db.query(historySql, [thesis.assignment_id], (e2, historyRows) => {
      if (e2) {
        console.error('Σφάλμα ανάκτησης ιστορικού:', e2);
        return res.status(500).json({ success: false, message: 'Σφάλμα ανάκτησης ιστορικού.' });
      }
      return res.status(200).json({
        success: true,
        thesisDetails: { ...thesis, elapsedTime },
        history: historyRows || []
      });
    });
  });
};

/* =========================================================
   Ενημέρωση στοιχείων επικοινωνίας φοιτητή 
   ========================================================= */
exports.updateContactInfo = (req, res) => {
  const studentId = req.session.user?.id;
  if (!studentId) {
    return res.status(401).json({ success: false, message: 'Δεν υπάρχει ID φοιτητή στο session.' });
  }

  // Παίρνουμε μόνο τα πεδία που ήρθαν (επιτρέπεται κενό => null)
  const payload = {
    email          : (typeof req.body.email          !== 'undefined') ? req.body.email          : undefined,
    phone          : (typeof req.body.phone          !== 'undefined') ? req.body.phone          : undefined,
    landline_phone : (typeof req.body.landline_phone !== 'undefined') ? req.body.landline_phone : undefined,
    address        : (typeof req.body.address        !== 'undefined') ? req.body.address        : undefined,
  };

  // Ελέγχουμε ποιες στήλες όντως υπάρχουν στον πίνακα Users
  db.query('SHOW COLUMNS FROM Users', [], (err, cols) => {
    if (err) {
      console.error('SHOW COLUMNS error:', err);
      return res.status(500).json({ success: false, message: 'Σφάλμα κατά τον έλεγχο στήλων.' });
    }

    const existingCols = new Set((cols || []).map(c => c.Field));
    const updates = [];
    const values  = [];

    for (const [key, val] of Object.entries(payload)) {
      if (typeof val === 'undefined') continue;
      if (!existingCols.has(key)) continue;
      updates.push(`${key} = ?`);
      values.push(val === '' ? null : val);
    }

    if (!updates.length) {
      return res.status(400).json({
        success: false,
        message: 'Δεν δόθηκαν έγκυρα πεδία προς ενημέρωση (ή δεν υπάρχουν αντίστοιχες στήλες).'
      });
    }

    values.push(studentId);
    const sql = `UPDATE Users SET ${updates.join(', ')} WHERE id = ? AND role = 'Student'`;
    db.query(sql, values, (e, result) => {
      if (e) {
        console.error('Update contact info error:', e);
        return res.status(500).json({ success: false, message: 'Σφάλμα κατά την ενημέρωση.' });
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'Δεν βρέθηκε φοιτητής για ενημέρωση.' });
      }
      return res.status(200).json({ success: true, message: 'Τα στοιχεία ενημερώθηκαν με επιτυχία.' });
    });
  });
};

/* =========================================================
   Αποστολή προσκλήσεων μελών επιτροπής 
   ========================================================= */
exports.addCommitteeMembers = (req, res) => {
  const studentId = req.session.user?.id;
  const { assignmentId, professorIds } = req.body;

  if (!studentId) {
    return res.status(401).json({ success: false, message: 'Δεν υπάρχει φοιτητής στο session.' });
  }
  if (!assignmentId || !Array.isArray(professorIds) || professorIds.length === 0) {
    return res.status(400).json({ success: false, message: 'Απαιτείται assignmentId και λίστα καθηγητών.' });
  }

  const insertWithStudent = `
    INSERT INTO Invitations (assignment_id, professor_id, student_id, status, sent_date)
    VALUES ?
  `;
  const insertWithoutStudent = `
    INSERT INTO Invitations (assignment_id, professor_id, status, sent_date)
    VALUES ?
  `;

  const now = new Date();
  const valuesWithStudent = professorIds.map(pid => [assignmentId, pid, studentId, 'Pending', now]);
  const valuesWithoutStudent = professorIds.map(pid => [assignmentId, pid, 'Pending', now]);

  db.query(insertWithStudent, [valuesWithStudent], (err) => {
    if (!err) return res.status(200).json({ success: true, message: 'Οι προσκλήσεις στάλθηκαν επιτυχώς.' });

    // Fallback αν λείπει η στήλη student_id κ.λπ.
    const msg = String(err?.message || '').toLowerCase();
    const canFallback = msg.includes('unknown column') || msg.includes('column') || msg.includes('count');
    if (!canFallback) {
      console.error('Error adding committee members:', err);
      return res.status(500).json({ success: false, message: 'Σφάλμα κατά την αποστολή προσκλήσεων.' });
    }
    db.query(insertWithoutStudent, [valuesWithoutStudent], (err2) => {
      if (err2) {
        console.error('Error adding committee members (no student_id):', err2);
        return res.status(500).json({ success: false, message: 'Σφάλμα κατά την αποστολή προσκλήσεων.' });
      }
      return res.status(200).json({ success: true, message: 'Οι προσκλήσεις στάλθηκαν επιτυχώς.' });
    });
  });
};

/* =========================================================
   Λίστα διδασκόντων για επιλογή επιτροπής (εξαιρεί τον Supervisor)
   ========================================================= */
exports.getTeachers = (req, res) => {
  const assignmentId = req.query.assignmentId;
  if (!assignmentId) {
    return res.status(400).json({ success: false, message: 'Assignment ID is required.' });
  }
  const query = `
    SELECT id, name 
    FROM Users 
    WHERE role = 'Professor'
      AND id NOT IN (
        SELECT professor_id 
        FROM CommitteeMembers 
        WHERE assignment_id = ? AND role = 'Supervisor'
      )
  `;
  db.query(query, [assignmentId], (err, results) => {
    if (err) {
      console.error('Σφάλμα ανάκτησης καθηγητών:', err);
      return res.status(500).json({ success: false, message: 'Σφάλμα στην ανάκτηση καθηγητών.' });
    }
    return res.status(200).json({ success: true, teachers: results });
  });
};

/* =========================================================
   Λήψη assignmentId για Pending
   ========================================================= */
exports.getAssignmentId = (req, res) => {
  const studentId = req.session.user?.id;
  if (!studentId) {
    return res.status(401).json({ success: false, message: 'Δεν υπάρχει φοιτητής στο session.' });
  }

  const query = `
    SELECT id 
    FROM Assignments 
    WHERE student_id = ? AND status = "Pending" 
    ORDER BY id DESC 
    LIMIT 1
  `;
  db.query(query, [studentId], (err, results) => {
    if (err) {
      console.error('Σφάλμα κατά την ανάκτηση της ανάθεσης:', err);
      return res.status(500).json({ success: false, message: 'Σφάλμα στη βάση δεδομένων.' });
    }
    if (!results.length) {
      return res.status(404).json({ success: false, message: 'Δεν βρέθηκε pending ανάθεση για αυτόν τον φοιτητή.' });
    }
    req.session.assignmentId = results[0].id;
    return res.status(200).json({ success: true, assignmentId: req.session.assignmentId });
  });
};

/* =========================================================
   Λήψη assignmentId για UnderReview
   ========================================================= */
exports.getDraftAssignmentId = (req, res) => {
  const studentId = req.session.user?.id;
  if (!studentId) {
    return res.status(401).json({ success: false, message: 'Δεν υπάρχει φοιτητής στο session.' });
  }

  const query = `
    SELECT id 
    FROM Assignments 
    WHERE student_id = ? AND status = "UnderReview" 
    ORDER BY id DESC 
    LIMIT 1
  `;
  db.query(query, [studentId], (err, results) => {
    if (err) {
      console.error('Σφάλμα κατά την ανάκτηση της ανάθεσης:', err);
      return res.status(500).json({ success: false, message: 'Σφάλμα στη βάση δεδομένων.' });
    }
    if (!results.length) {
      return res.status(404).json({ success: false, message: 'Δεν βρέθηκε ανάθεση σε κατάσταση UnderReview για αυτόν τον φοιτητή.' });
    }
    req.session.assignmentId = results[0].id;
    return res.status(200).json({ success: true, assignmentId: req.session.assignmentId });
  });
};

/* =========================================================
   Λήψη υποβολής (draft/supporting) για την τρέχουσα session ανάθεση
   ========================================================= */
exports.getSubmission = (req, res) => {
  const studentId = req.session.user?.id;
  if (!studentId) {
    return res.status(401).json({ success: false, message: 'Δεν υπάρχει φοιτητής στο session.' });
  }
  const assignmentId = req.session.assignmentId;
  if (!assignmentId) {
    return res.status(404).json({ success: false, message: 'Δεν βρέθηκε ανάθεση για αυτόν τον φοιτητή.' });
  }

  const query = 'SELECT pdf_draft, supporting_materials FROM Submissions WHERE assignment_id = ? LIMIT 1';
  db.query(query, [assignmentId], (err, results) => {
    if (err) {
      console.error('Σφάλμα στην ανάκτηση της υποβολής:', err);
      return res.status(500).json({ success: false, message: 'Σφάλμα στη βάση δεδομένων.' });
    }
    if (!results.length) {
      return res.status(404).json({ success: false, message: 'Δεν βρέθηκε υποβολή για αυτή την ανάθεση.' });
    }
    return res.status(200).json({ success: true, submission: results[0] });
  });
};

/* =========================================================
   Στοιχεία εξέτασης – καταχώρηση (απαιτεί υπάρχον draft)
   ========================================================= */
exports.setExamDetails = (req, res) => {
  const { date, location, tropos_eksetasis } = req.body;
  const studentId = req.session.user?.id;
  if (!studentId) {
    return res.status(401).json({ success: false, message: 'Δεν υπάρχει ID φοιτητή στο session.' });
  }

  const getAssignmentQuery = `
    SELECT id, status
    FROM Assignments
    WHERE student_id = ? AND status <> 'Canceled'
    ORDER BY id DESC
    LIMIT 1
  `;
  db.query(getAssignmentQuery, [studentId], (err, result) => {
    if (err) {
      console.error('Σφάλμα κατά την ανάκτηση της ανάθεσης:', err);
      return res.status(500).json({ success: false, message: 'Σφάλμα κατά την ανάκτηση δεδομένων.' });
    }
    if (!result.length) {
      return res.status(404).json({ success: false, message: 'Δεν βρέθηκε ανάθεση για τον φοιτητή.' });
    }

    const assignmentId = result[0].id;

    // Πρέπει να υπάρχει ανεβασμένο πρόχειρο (pdf_draft)
    const qDraft = `SELECT pdf_draft FROM Submissions WHERE assignment_id = ? LIMIT 1`;
    db.query(qDraft, [assignmentId], (eDraft, rDraft) => {
      if (eDraft) {
        console.error('Σφάλμα ελέγχου πρόχειρου:', eDraft);
        return res.status(500).json({ success: false, message: 'Σφάλμα κατά τον έλεγχο του πρόχειρου κειμένου.' });
      }
      const hasDraft = rDraft.length && rDraft[0].pdf_draft;
      if (!hasDraft) {
        return res.status(400).json({
          success: false,
          message: 'Πρέπει πρώτα να ανεβάσετε το πρόχειρο κείμενο (PDF) πριν καταχωρήσετε εξέταση.'
        });
      }

      // Καθαρισμός παλιών Events και εισαγωγή νέου
      db.query(`DELETE FROM Events WHERE assignment_id = ?`, [assignmentId], (errDel) => {
        if (errDel) {
          console.error('Σφάλμα κατά τη διαγραφή παλιών στοιχείων εξέτασης:', errDel);
          return res.status(500).json({ success: false, message: 'Σφάλμα κατά τη διαγραφή παλιών στοιχείων εξέτασης.' });
        }

        const insertQuery = `
          INSERT INTO Events (assignment_id, date, location, tropos_eksetasis)
          VALUES (?, ?, ?, ?)
        `;
        db.query(insertQuery, [assignmentId, date, location, tropos_eksetasis], (errIns) => {
          if (errIns) {
            console.error('Σφάλμα κατά την αποθήκευση των στοιχείων εξέτασης:', errIns);
            return res.status(500).json({ success: false, message: 'Σφάλμα κατά την αποθήκευση.' });
          }

          db.query(
            `SELECT date, location, tropos_eksetasis FROM Events WHERE assignment_id = ? LIMIT 1`,
            [assignmentId],
            (errSel, results) => {
              if (errSel) {
                console.error('Σφάλμα κατά την ανάκτηση των ενημερωμένων στοιχείων εξέτασης:', errSel);
                return res.status(500).json({ success: false, message: 'Σφάλμα κατά την ανάκτηση των νέων δεδομένων.' });
              }
              res.status(200).json({
                success: true,
                message: 'Η ημερομηνία εξέτασης καταχωρήθηκε επιτυχώς.',
                examDetails: results[0]
              });
            }
          );
        });
      });
    });
  });
};

/* =========================================================
   Στοιχεία εξέτασης – προβολή
   ========================================================= */
exports.getExamDetails = (req, res) => {
  const studentId = req.session.user?.id;
  if (!studentId) {
    return res.status(401).json({ success: false, message: 'Δεν υπάρχει ID φοιτητή στο session.' });
  }

  const query = `
    SELECT date, location, tropos_eksetasis
    FROM Events
    WHERE assignment_id = (
      SELECT id
      FROM Assignments
      WHERE student_id = ? AND status <> 'Canceled'
      ORDER BY id DESC
      LIMIT 1
    )
    LIMIT 1
  `;
  db.query(query, [studentId], (err, results) => {
    if (err) {
      console.error('Σφάλμα κατά την ανάκτηση των στοιχείων εξέτασης:', err);
      return res.status(500).json({ success: false, message: 'Σφάλμα κατά την ανάκτηση δεδομένων.' });
    }
    if (!results || !results.length) {
      return res.status(404).json({ success: false, message: 'Δεν έχει καταχωρηθεί εξέταση ακόμα.' });
    }
    res.status(200).json({ success: true, examDetails: results[0] });
  });
};

/* =========================================================
   Προβολή πρακτικού εξέτασης
   ========================================================= */
exports.viewPraktiko = (req, res) => {
  const assignmentId = Number(req.params.assignmentId);

  const sql = `
    SELECT 
      U.name       AS student_name,
      U.student_id AS student_number,
      T.title      AS thesis_title,

      E.date       AS exam_date,
      E.location   AS exam_location,

      G.professor1_grade AS grade1,
      G.professor2_grade AS grade2,
      G.professor3_grade AS grade3,
      G.final_grade      AS final_grade,

      -- Επιτροπή
      SupU.name  AS supervisor_name,
      Mem1U.name AS member1_name,
      Mem2U.name AS member2_name,

      -- ΑΠ/ΓΣ από Γραμματεία (μόνο αριθμός)
      SEC.ap_praktiko

    FROM Assignments A
    JOIN Users  U ON A.student_id = U.id
    JOIN Topics T ON A.topic_id   = T.id

    LEFT JOIN Events  E ON E.assignment_id = A.id
    LEFT JOIN Grades  G ON G.assignment_id = A.id

    -- Επιβλέπων
    LEFT JOIN CommitteeMembers SupCM
           ON SupCM.assignment_id = A.id AND SupCM.role='Supervisor'
    LEFT JOIN Users SupU ON SupU.id = SupCM.professor_id

    -- 2 μέλη (απλή προσέγγιση με δύο JOINs στα Member rows)
    LEFT JOIN CommitteeMembers Mem1CM
           ON Mem1CM.assignment_id = A.id AND Mem1CM.role='Member'
    LEFT JOIN CommitteeMembers Mem2CM
           ON Mem2CM.assignment_id = A.id AND Mem2CM.role='Member' AND Mem2CM.id <> Mem1CM.id
    LEFT JOIN Users Mem1U ON Mem1U.id = Mem1CM.professor_id
    LEFT JOIN Users Mem2U ON Mem2U.id = Mem2CM.professor_id

    LEFT JOIN SecretarySubmissions SEC ON SEC.assignment_id = A.id

    WHERE A.id = ?
    LIMIT 1
  `;

  db.query(sql, [assignmentId], (err, rows) => {
    if (err || !rows.length) {
      console.error('Σφάλμα πρακτικού:', err);
      return res.status(500).send('Σφάλμα κατά την ανάκτηση πρακτικού.');
    }

    const r = rows[0];

    const examDate = r.exam_date
      ? new Date(r.exam_date).toLocaleDateString('el-GR')
      : '—';
    const examTime = r.exam_date
      ? new Date(r.exam_date).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })
      : '—';

    return res.render('praktiko', {
      layout: false, // χωρίς global header/menu

      student_name   : r.student_name,
      student_number : r.student_number,
      thesis_title   : r.thesis_title,

      exam_date      : examDate,
      exam_time      : examTime,
      exam_location  : r.exam_location || '—',

      supervisor_name: r.supervisor_name || '—',
      member1_name   : r.member1_name || '—',
      member2_name   : r.member2_name || '—',

      grade1         : (r.grade1 ?? '—'),
      grade2         : (r.grade2 ?? '—'),
      grade3         : (r.grade3 ?? '—'),
      final_grade    : (r.final_grade ?? '—'),

      ap_praktiko    : r.ap_praktiko || null
    });
  });
};

/* =========================================================
   Καταχώρηση συνδέσμου Νημερτής (μετά την τελική βαθμολογία)
   ========================================================= */
exports.saveRepositoryLink = (req, res) => {
  const studentId = req.session.user?.id;
  let { repository_link } = req.body;

  if (!studentId) {
    return res.status(401).json({ success: false, message: 'Δεν υπάρχει ID φοιτητή στο session.' });
  }
  if (typeof repository_link !== 'string') {
    return res.status(400).json({ success: false, message: 'Πρέπει να δώσετε σύνδεσμο.' });
  }
  repository_link = repository_link.trim();
  if (!/^https?:\/\/.+/i.test(repository_link)) {
    return res.status(400).json({ success: false, message: 'Δώστε έγκυρο URL που αρχίζει με http:// ή https://.' });
  }

  const qFind = `
    SELECT id FROM Assignments
    WHERE student_id = ? AND status = 'UnderReview'
    ORDER BY id DESC LIMIT 1
  `;
  db.query(qFind, [studentId], (e1, r1) => {
    if (e1) {
      console.error('Save Nemertes find assignment error:', e1);
      return res.status(500).json({ success: false, message: 'Σφάλμα αναζήτησης ανάθεσης.' });
    }
    if (!r1.length) {
      const qFallback = `SELECT id FROM Assignments WHERE student_id = ? ORDER BY id DESC LIMIT 1`;
      return db.query(qFallback, [studentId], (eF, rF) => {
        if (eF || !rF.length) {
          if (eF) console.error('Save Nemertes fallback error:', eF);
          return res.status(404).json({ success: false, message: 'Δεν βρέθηκε ανάθεση για τον φοιτητή.' });
        }
        return handleWithAssignmentId(rF[0].id);
      });
    }
    return handleWithAssignmentId(r1[0].id);
  });

  function handleWithAssignmentId(assignmentId) {
    const qGrade = `SELECT final_grade FROM Grades WHERE assignment_id = ? LIMIT 1`;
    db.query(qGrade, [assignmentId], (e2, r2) => {
      if (e2) {
        console.error('Save Nemertes select grade error:', e2);
        return res.status(500).json({ success: false, message: 'Σφάλμα ελέγχου βαθμού.' });
      }
      const finalGrade = r2.length ? r2[0].final_grade : null;
      if (finalGrade == null) {
        return res.status(400).json({
          success: false,
          message: 'Το link Νημερτής καταχωρείται μόνο μετά την τελική βαθμολόγηση.'
        });
      }

      const qUpd = `UPDATE Assignments SET repository_link = ? WHERE id = ?`;
      db.query(qUpd, [repository_link, assignmentId], (e3) => {
        if (e3) {
          console.error('Save Nemertes update error:', e3);
          return res.status(500).json({ success: false, message: 'Σφάλμα κατά την αποθήκευση.' });
        }
        return res.status(200).json({ success: true, message: 'Ο σύνδεσμος Νημερτής καταχωρήθηκε.' });
      });
    });
  }
}

/* =========================================================
   Αποθήκευση draft/supporting ως URLs (τρέχουσα μη-Canceled)
   ========================================================= */
exports.saveDraftAndLinks = (req, res) => {
  const studentId = req.session.user?.id;
  const { pdf_draft, supporting_materials } = req.body;

  if (!studentId) {
    return res.status(401).json({ success: false, message: 'Δεν υπάρχει φοιτητής στο session.' });
  }
  if (pdf_draft && !/^https?:\/\/.+/i.test(pdf_draft)) {
    return res.status(400).json({ success: false, message: 'Το draft πρέπει να είναι έγκυρο URL (http/https).' });
  }

  const getAid = `
    SELECT id
    FROM Assignments
    WHERE student_id = ? AND status <> 'Canceled'
    ORDER BY id DESC
    LIMIT 1
  `;
  db.query(getAid, [studentId], (e, r) => {
    if (e || !r.length) {
      if (e) console.error('saveDraftAndLinks select assignment error:', e);
      return res.status(404).json({ success: false, message: 'Δεν βρέθηκε ανάθεση.' });
    }
    const assignmentId = r[0].id;

    const sel = `SELECT id FROM Submissions WHERE assignment_id=? LIMIT 1`;
    db.query(sel, [assignmentId], (e2, r2) => {
      if (e2) {
        console.error('saveDraftAndLinks select submission error:', e2);
        return res.status(500).json({ success: false, message: 'Σφάλμα.' });
      }

      if (r2.length) {
        const upd = `UPDATE Submissions SET pdf_draft=?, supporting_materials=? WHERE assignment_id=?`;
        db.query(upd, [pdf_draft || null, supporting_materials || null, assignmentId], (e3) => {
          if (e3) {
            console.error('saveDraftAndLinks update submission error:', e3);
            return res.status(500).json({ success: false, message: 'Σφάλμα ενημέρωσης.' });
          }
          return res.status(200).json({ success: true, message: 'Το πρόχειρο/υλικό ενημερώθηκε.' });
        });
      } else {
        const ins = `INSERT INTO Submissions (assignment_id, pdf_draft, supporting_materials) VALUES (?,?,?)`;
        db.query(ins, [assignmentId, pdf_draft || null, supporting_materials || null], (e3) => {
          if (e3) {
            console.error('saveDraftAndLinks insert submission error:', e3);
            return res.status(500).json({ success: false, message: 'Σφάλμα δημιουργίας.' });
          }
          return res.status(200).json({ success: true, message: 'Το πρόχειρο/υλικό αποθηκεύτηκε.' });
        });
      }
    });
  });
};

/* =========================================================
   Upload PDF draft (multipart) – γράφει filename στο Submissions
   ========================================================= */
exports.uploadDraft = (req, res) => {
  const studentId = req.session.user?.id;
  if (!studentId) {
    return res.status(401).json({ success: false, message: 'Δεν υπάρχει φοιτητής στο session.' });
  }

  const draftFile = req.file; // { filename, path, ... } από το multer
  const supporting_materials = (req.body.supporting_materials || '').trim() || null;

  if (!draftFile) {
    return res.status(400).json({ success: false, message: 'Δεν εστάλη αρχείο PDF (pdf_draft).' });
  }

  const qUnder = `
    SELECT id FROM Assignments
    WHERE student_id = ? AND status = 'UnderReview'
    ORDER BY id DESC LIMIT 1
  `;
  db.query(qUnder, [studentId], (e1, r1) => {
    if (e1) {
      console.error('uploadDraft find UnderReview error:', e1);
      return res.status(500).json({ success: false, message: 'Σφάλμα αναζήτησης ανάθεσης.' });
    }

    const useAssignment = (aid) => {
      const sel = `SELECT id FROM Submissions WHERE assignment_id = ? LIMIT 1`;
      db.query(sel, [aid], (e2, r2) => {
        if (e2) {
          console.error('uploadDraft select submission error:', e2);
          return res.status(500).json({ success: false, message: 'Σφάλμα στη βάση δεδομένων.' });
        }

        const filename = draftFile.filename; // αποθηκευμένο όνομα στο /uploads/drafts

        if (r2.length) {
          const upd = `UPDATE Submissions SET pdf_draft = ?, supporting_materials = ? WHERE assignment_id = ?`;
          db.query(upd, [filename, supporting_materials, aid], (e3) => {
            if (e3) {
              console.error('uploadDraft update submission error:', e3);
              return res.status(500).json({ success: false, message: 'Σφάλμα ενημέρωσης υποβολής.' });
            }
            return res.status(200).json({
              success: true,
              message: 'Το πρόχειρο ενημερώθηκε επιτυχώς.',
              file: `/uploads/drafts/${filename}`
            });
          });
        } else {
          const ins = `INSERT INTO Submissions (assignment_id, pdf_draft, supporting_materials) VALUES (?,?,?)`;
          db.query(ins, [aid, filename, supporting_materials], (e3) => {
            if (e3) {
              console.error('uploadDraft insert submission error:', e3);
              return res.status(500).json({ success: false, message: 'Σφάλμα δημιουργίας υποβολής.' });
            }
            return res.status(200).json({
              success: true,
              message: 'Το πρόχειρο αποθηκεύτηκε επιτυχώς.',
              file: `/uploads/drafts/${filename}`
            });
          });
        }
      });
    };

    if (r1.length) return useAssignment(r1[0].id);

    // Fallback: νεότερη μη-Canceled ανάθεση
    const qLatest = `
      SELECT id FROM Assignments
      WHERE student_id = ? AND status <> 'Canceled'
      ORDER BY id DESC LIMIT 1
    `;
    db.query(qLatest, [studentId], (eL, rL) => {
      if (eL || !rL.length) {
        if (eL) console.error('uploadDraft latest assignment error:', eL);
        return res.status(404).json({ success: false, message: 'Δεν βρέθηκε ενεργή ανάθεση.' });
      }
      useAssignment(rL[0].id);
    });
  });
};
