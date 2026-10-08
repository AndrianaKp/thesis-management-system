
const fs = require('fs');
const db = require('../db'); // κοινό MySQL pool

/* ------------------------------------------------------------------
 * 1) Λίστα ενεργών / υπό εξέταση ΔΕ (Active, UnderReview)
 * ------------------------------------------------------------------ */
exports.getActiveAssignments = (req, res) => {
  const query = `
    SELECT 
      A.id,
      A.status,
      U.name        AS student_name,
      U.student_id  AS student_number,
      T.title       AS topic_title
    FROM Assignments A
    JOIN Users  U ON A.student_id = U.id
    JOIN Topics T ON A.topic_id   = T.id
    WHERE A.status IN ('Active', 'UnderReview')
    ORDER BY A.id DESC
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('[getActiveAssignments] DB error:', err);
      return res.json({ success: false, message: 'Σφάλμα βάσης' });
    }
    return res.json({ success: true, assignments: results });
  });
};

/* ------------------------------------------------------------------
 * 2) Λεπτομέρειες ΔΕ + elapsed days + επιτροπή
 * ------------------------------------------------------------------ */
exports.getAssignmentDetails = (req, res) => {
  const assignmentId = req.params.id;

  const detailsQuery = `
    SELECT 
      A.id,
      A.status,
      A.start_date,
      U.name        AS student_name,
      U.student_id  AS student_number,
      T.title       AS topic_title,
      T.description AS topic_description
    FROM Assignments A
    JOIN Users  U ON A.student_id = U.id
    JOIN Topics T ON A.topic_id   = T.id
    WHERE A.id = ?
    LIMIT 1
  `;

  db.query(detailsQuery, [assignmentId], (err, results) => {
    if (err) {
      console.error('[getAssignmentDetails] DB error:', err);
      return res.json({ success: false, message: 'Σφάλμα βάσης' });
    }
    if (!results.length) {
      return res.json({ success: false, message: 'Δεν βρέθηκε η ΔΕ' });
    }

    const assignment = results[0];

    // Helper: ασφαλές parsing MySQL DATETIME 
    const DAY = 24 * 60 * 60 * 1000;
    const parseMySQLDate = (d) => {
      if (!d) return null;
      if (d instanceof Date) return d;
      const s = String(d).trim();
      const isoish = /^\d{4}-\d{2}-\d{2}/.test(s) ? s.replace(' ', 'T') : s;
      const dt = new Date(isoish);
      return isNaN(dt) ? null : dt;
    };

    const start = parseMySQLDate(assignment.start_date);
    // 1 την ημέρα ανάθεσης, 2 μετά από 24h, κ.ο.κ.
    assignment.elapsedTime = start
      ? Math.max(1, Math.floor((Date.now() - start.getTime()) / DAY) + 1)
      : null;

    // Φέρε επιτροπή
    const committeeQuery = `
      SELECT U.name, CM.role
      FROM CommitteeMembers CM
      JOIN Users U ON U.id = CM.professor_id
      WHERE CM.assignment_id = ?
      ORDER BY CM.role = 'Supervisor' DESC, CM.id ASC
    `;

    db.query(committeeQuery, [assignmentId], (err2, members) => {
      if (err2) {
        console.error('[getAssignmentDetails] committee DB error:', err2);
        // ακόμα και σε σφάλμα επιτροπής, επιστρέφουμε τα βασικά
        assignment.committee_members = [];
        return res.json({ success: true, assignment });
      }
      assignment.committee_members = members || [];
      return res.json({ success: true, assignment });
    });
  });
};

/* ------------------------------------------------------------------
 * 3) Εισαγωγή χρηστών από JSON
 *    Δέχεται αντικείμενο {students:[], professors:[], admins:[]}
 * ------------------------------------------------------------------ */
exports.importUsersFromJson = (req, res) => {
  if (!req.file) {
    return res.json({ success: false, message: 'Δεν βρέθηκε αρχείο.' });
  }

  fs.readFile(req.file.path, 'utf8', (err, data) => {
    if (err) {
      // καθάρισε το temp αρχείο σε error paths
      fs.unlink(req.file.path, () => {});
      return res.json({ success: false, message: 'Σφάλμα ανάγνωσης αρχείου.' });
    }

    let json;
    try {
      json = JSON.parse(data);
    } catch (e) {
      fs.unlink(req.file.path, () => {});
      return res.json({ success: false, message: 'Μη έγκυρο JSON. ' + e.message });
    }

    const users = [];

    // Φοιτητές
    if (Array.isArray(json.students)) {
      json.students.forEach((s) => {
        users.push([
          s.password || '123456',
          'Student',
          s.name,
          s.email,
          s.phone || null,
          s.student_id,
          s.address || null,
        ]);
      });
    }

    // Καθηγητές
    if (Array.isArray(json.professors)) {
      json.professors.forEach((p) => {
        users.push([
          p.password || '123456',
          'Professor',
          p.name,
          p.email,
          p.phone || null,
          null, // student_id δεν ισχύει για καθηγητές
          p.address || null,
        ]);
      });
    }

    // Admin
    if (Array.isArray(json.admins)) {
      json.admins.forEach((a) => {
        users.push([
          a.password || '123456',
          'Admin',
          a.name,
          a.email,
          a.phone || null,
          null, // student_id δεν ισχύει για admin
          a.address || null,
        ]);
      });
    }

    if (!users.length) {
      fs.unlink(req.file.path, () => {});
      return res.json({ success: false, message: 'Δε βρέθηκαν δεδομένα προς εισαγωγή.' });
    }

    const sql = `
      INSERT INTO Users (password, role, name, email, phone, student_id, address)
      VALUES ?
      ON DUPLICATE KEY UPDATE
        name=VALUES(name),
        phone=VALUES(phone),
        address=VALUES(address)
    `;

    db.query(sql, [users], (err2, result) => {
      // καθάρισμα temp αρχείου πάντα
      fs.unlink(req.file.path, () => {});
      if (err2) {
        console.error('[importUsersFromJson] DB error:', err2);
        return res.json({ success: false, message: 'Σφάλμα βάσης: ' + err2.message });
      }
      return res.json({
        success: true,
        message: 'Εισήχθησαν ' + result.affectedRows + ' εγγραφές.',
      });
    });
  });
};

/* ------------------------------------------------------------------
 * 4) Καταχώρηση ΑΠ/ΓΣ 
 * ------------------------------------------------------------------ */
exports.submitApPraktiko = (req, res) => {
  const assignment_id = Number(req.params.id);
  const { ap_praktiko } = req.body;

  if (!Number.isInteger(assignment_id) || assignment_id <= 0) {
    return res.json({ success: false, message: 'Άκυρο assignment id.' });
  }
  if (!ap_praktiko) {
    return res.json({ success: false, message: 'Συμπληρώστε αριθμό πρακτικού!' });
  }

  // Βρες τον student_id για το συγκεκριμένο assignment
  const getStudentSql = `SELECT student_id FROM Assignments WHERE id = ? LIMIT 1`;
  db.query(getStudentSql, [assignment_id], (err, results) => {
    if (err) {
      console.error('[submitApPraktiko] DB error:', err);
      return res.json({ success: false, message: 'Σφάλμα βάσης.' });
    }
    if (!results.length) {
      return res.json({ success: false, message: 'Δεν βρέθηκε η ανάθεση.' });
    }

    const student_id = results[0].student_id;

    // Έλεγξε αν υπάρχει ήδη εγγραφή στο SecretarySubmissions για το assignment
    const sel = `SELECT id FROM SecretarySubmissions WHERE assignment_id = ? LIMIT 1`;
    db.query(sel, [assignment_id], (e2, r2) => {
      if (e2) {
        console.error('[submitApPraktiko] DB error (select):', e2);
        return res.json({ success: false, message: 'Σφάλμα βάσης.' });
      }

      if (r2.length) {
        // update
        const upd = `UPDATE SecretarySubmissions SET ap_praktiko = ? WHERE assignment_id = ?`;
        db.query(upd, [ap_praktiko, assignment_id], (e3) => {
          if (e3) {
            console.error('[submitApPraktiko] DB error (update):', e3);
            return res.json({ success: false, message: 'Σφάλμα βάσης.' });
          }
          return res.json({ success: true, message: 'Το ΑΠ/ΓΣ ενημερώθηκε επιτυχώς!' });
        });
      } else {
        // insert
        const ins = `
          INSERT INTO SecretarySubmissions (assignment_id, student_id, ap_praktiko)
          VALUES (?, ?, ?)
        `;
        db.query(ins, [assignment_id, student_id, ap_praktiko], (e4) => {
          if (e4) {
            console.error('[submitApPraktiko] DB error (insert):', e4);
            return res.json({ success: false, message: 'Σφάλμα βάσης.' });
          }
          return res.json({ success: true, message: 'Το ΑΠ/ΓΣ καταχωρήθηκε επιτυχώς!' });
        });
      }
    });
  });
};

/* ------------------------------------------------------------------
 * 5) Ακύρωση ανάθεσης
 * ------------------------------------------------------------------ */
exports.cancelAssignment = (req, res) => {
  const assignmentId = req.params.id;
  const { gs_arithmos, gs_etos, reason } = req.body;

  if (!gs_arithmos || !gs_etos || !reason) {
    return res.json({
      success: false,
      message: 'Συμπληρώστε αριθμό, έτος και λόγο ακύρωσης.',
    });
  }

  const sql = `
    INSERT INTO AssignmentStatusHistory (assignment_id, gs_arithmos, gs_etos, reason, status)
    VALUES (?, ?, ?, ?, 'Canceled')
  `;

  db.query(sql, [assignmentId, gs_arithmos, gs_etos, reason], (err) => {
    if (err) {
      console.error('[cancelAssignment] DB error (history insert):', err);
      return res.json({ success: false, message: 'Σφάλμα βάσης.' });
    }

    // Ενημέρωση status στο Assignments 
    db.query(
      'UPDATE Assignments SET status = \'Canceled\' WHERE id = ?',
      [assignmentId],
      (e2) => {
        if (e2) console.error('[cancelAssignment] DB error (update status):', e2);
        return res.json({ success: true, message: 'Η ανάθεση ακυρώθηκε επιτυχώς!' });
      }
    );
  });
};

/* ------------------------------------------------------------------
 * 6) Έλεγχος προϋποθέσεων για περάτωση (UnderReview + τελικός βαθμός + Nemertes URL)
 * ------------------------------------------------------------------ */
exports.checkCompletionEligibility = (req, res) => {
  const assignmentId = req.params.id;

  const sql = `
    SELECT 
      A.status,
      (SELECT G.final_grade FROM Grades G WHERE G.assignment_id = A.id LIMIT 1) AS final_grade,
      A.repository_link AS nemertes_url
    FROM Assignments A
    WHERE A.id = ?
    LIMIT 1
  `;

  db.query(sql, [assignmentId], (err, rows) => {
    if (err) {
      console.error('[checkCompletionEligibility] DB error:', err);
      return res.json({ success: false, message: 'Σφάλμα βάσης.' });
    }
    if (!rows.length) {
      return res.json({ success: false, message: 'Δεν βρέθηκε η ΔΕ.' });
    }

    const r = rows[0];
    const hasStatus   = r.status === 'UnderReview';
    const hasGrade    = r.final_grade !== null && r.final_grade !== undefined;
    const hasNemertes = !!r.nemertes_url && /^https?:\/\/.+/i.test(r.nemertes_url);

    return res.json({
      success:  true,
      eligible: hasStatus && hasGrade && hasNemertes,
      missing: {
        status:   hasStatus   ? null : "Η ΔΕ δεν είναι σε 'UnderReview'.",
        grade:    hasGrade    ? null : 'Δεν υπάρχει τελικός βαθμός.',
        nemertes: hasNemertes ? null : 'Λείπει/δεν είναι έγκυρος ο σύνδεσμος Νημερτής.',
      },
    });
  });
};

/* ------------------------------------------------------------------
 * 7) Ολοκλήρωση ΔΕ (σήμανση Completed) αφού περάσει τον έλεγχο
 * ------------------------------------------------------------------ */
exports.completeAssignment = (req, res) => {
  const assignmentId = req.params.id;

  const checkSql = `
    SELECT 
      A.status,
      (SELECT G.final_grade FROM Grades G WHERE G.assignment_id = A.id ORDER BY G.id DESC LIMIT 1) AS final_grade,
      A.repository_link AS nemertes_url
    FROM Assignments A
    WHERE A.id = ?
    LIMIT 1
  `;

  db.query(checkSql, [assignmentId], (err, rows) => {
    if (err) {
      console.error('[completeAssignment] DB error (check):', err);
      return res.json({ success: false, message: 'Σφάλμα βάσης.' });
    }
    if (!rows.length) {
      return res.json({ success: false, message: 'Δεν βρέθηκε η ΔΕ.' });
    }

    const a = rows[0];
    const problems = [];
    if (a.status !== 'UnderReview') problems.push("Η ΔΕ δεν είναι 'UnderReview'.");
    if (a.final_grade === null || a.final_grade === undefined)
      problems.push('Δεν υπάρχει τελικός βαθμός.');
    if (!a.nemertes_url || !/^https?:\/\/.+/i.test(a.nemertes_url))
      problems.push('Μη έγκυρος/απών σύνδεσμος Νημερτής.');

    if (problems.length) {
      return res.json({ success: false, message: problems.join(' ') });
    }

    // Ιστορικό αλλαγής κατάστασης
    const insHist = `
      INSERT INTO AssignmentStatusHistory (assignment_id, status, reason, gs_arithmos, gs_etos)
      VALUES (?, 'Completed', 'Ολοκλήρωση από Γραμματεία', 0, YEAR(CURDATE()))
    `;

    db.query(insHist, [assignmentId], (err1) => {
      if (err1) {
        console.error('[completeAssignment] DB error (history insert):', err1);
        return res.json({ success: false, message: 'Σφάλμα ιστορικού.' });
      }

      // Ενημέρωσε την ανάθεση σε Completed
      const upd = `
        UPDATE Assignments
        SET status = 'Completed', completed_date = CURDATE()
        WHERE id = ?
      `;
      db.query(upd, [assignmentId], (err2) => {
        if (err2) {
          console.error('[completeAssignment] DB error (update status):', err2);
          return res.json({ success: false, message: 'Σφάλμα ενημέρωσης κατάστασης.' });
        }
        return res.json({
          success: true,
          message: "Η ΔΕ σημάνθηκε ως 'Completed' (Περατωμένη).",
        });
      });
    });
  });
};
