
const { Parser } = require('json2csv');
const db = require('../db'); // shared MySQL pool

/* =========================================================
   Helpers 
   ========================================================= */

/**
 * Καταχωρεί ένα βήμα στο ιστορικό κατάστασης.
 */
function writeStatusHistory(
  { assignmentId, status, reason = null, gsArithmos = null, gsEtos = null },
  cb = () => {}
) {
  const sql = `
    INSERT INTO AssignmentStatusHistory (assignment_id, status, reason, gs_arithmos, gs_etos)
    VALUES (?, ?, ?, ?, ?)
  `;
  db.query(sql, [assignmentId, status, reason, gsArithmos, gsEtos], (err) => cb(err || null));
}

/**
 * Επιστρέφει μέρη του query για λίστα διπλωματικών καθηγητή,
 * με δυναμικά WHERE/HAVING και ασφαλή params.
 */
function buildProfessorThesesQueryParts({ professorId, statusFilter, roleFilter }) {
  const where = [
    '(T.professor_id = ? OR EXISTS (SELECT 1 FROM CommitteeMembers CMx WHERE CMx.assignment_id = A.id AND CMx.professor_id = ?))'
  ];
  const params = [professorId, professorId];

  if (statusFilter) { where.push('A.status = ?'); params.push(statusFilter); }

  // επιτρέπουμε μόνο Supervisor/Member στο roleFilter
  const allowedRoles = new Set(['Supervisor', 'Member']);
  const havingSql    = allowedRoles.has(roleFilter) ? 'HAVING professor_role = ?' : '';
  const havingParams = havingSql ? [roleFilter] : [];

  return {
    whereSql: 'WHERE ' + where.join(' AND '),
    havingSql,
    params: params.concat(havingParams)
  };
}

/**
 * Recalc τελικού βαθμού όταν υπάρχουν και οι 3 βαθμοί (στρογγυλοποίηση στο 0.1).
 */
function recalcFinalGrade(assignmentId, cb = () => {}) {
  const sel = `
    SELECT professor1_grade AS g1, professor2_grade AS g2, professor3_grade AS g3
    FROM Grades
    WHERE assignment_id = ?
    ORDER BY id DESC
    LIMIT 1
  `;
  db.query(sel, [assignmentId], (err, rows) => {
    if (err || !rows.length) {
      if (err) console.error('recalcFinalGrade select error:', err);
      return cb(err || null);
    }
    const n = x => (x == null ? null : Number(x));
    const g1 = n(rows[0].g1), g2 = n(rows[0].g2), g3 = n(rows[0].g3);
    const allHave = [g1, g2, g3].every(Number.isFinite);
    if (!allHave) return cb(null);

    const avg = Math.round(((g1 + g2 + g3) / 3) * 10) / 10;
    db.query(
      `UPDATE Grades SET final_grade = ? WHERE assignment_id = ?`,
      [avg, assignmentId],
      (e2) => {
        if (e2) console.error('recalcFinalGrade update error:', e2);
        cb(e2 || null);
      }
    );
  });
}

/**
 * Access control: βεβαιώνει ότι ο χρήστης (Professor) είναι Supervisor/Member
 * στη συγκεκριμένη ανάθεση.
 */
function ensureProfessorForAssignment(assignmentId, professorId, roles = ['Supervisor','Member'], cb) {
  const roleMarks = roles.map(() => '?').join(',');
  const sql = `
    SELECT 1
    FROM CommitteeMembers
    WHERE assignment_id = ? AND professor_id = ? AND role IN (${roleMarks})
    LIMIT 1
  `;
  db.query(sql, [assignmentId, professorId, ...roles], (e, r) => cb(e, !!(r && r.length)));
}

/**
 * Access control: βεβαιώνει ότι ο χρήστης (Student) είναι ο κάτοχος της ανάθεσης.
 */
function ensureStudentOwnsAssignment(assignmentId, studentId, cb) {
  db.query(
    `SELECT 1 FROM Assignments WHERE id=? AND student_id=? LIMIT 1`,
    [assignmentId, studentId],
    (e, r) => cb(e, !!(r && r.length))
  );
}

/* =========================================================
   Search / Assign / Change
   ========================================================= */

/**
 * Αναζήτηση φοιτητή + νεότερη μη-Canceled ανάθεση (αν υπάρχει).
 */
exports.searchStudent = (req, res) => {
  const { searchQuery = '' } = req.query;

  const sql = `
    SELECT
      U.id AS student_id,
      U.name,
      U.student_id AS student_number,
      A.topic_id,
      A.status,
      T.title AS topic_title
    FROM Users U
    LEFT JOIN (
      SELECT a1.*
      FROM Assignments a1
      JOIN (
        SELECT student_id, MAX(id) AS max_id
        FROM Assignments
        WHERE status <> 'Canceled'
        GROUP BY student_id
      ) last ON last.student_id = a1.student_id AND last.max_id = a1.id
    ) A ON U.id = A.student_id
    LEFT JOIN Topics T ON A.topic_id = T.id
    WHERE (U.student_id LIKE ? OR U.name LIKE ?)
      AND U.role = 'Student'
    ORDER BY U.name ASC
  `;
  db.query(sql, [`%${searchQuery}%`, `%${searchQuery}%`], (err, results) => {
    if (err) return res.status(500).json({ success:false, message:'Σφάλμα κατά την αναζήτηση του φοιτητή' });
    res.status(200).json({ success:true, students: results });
  });
};

/**
 * Ανάθεση θέματος (επιτρέπεται μόνο αν ΔΕΝ υπάρχει άλλη μη-Canceled).
 * Γράφει αρχικό Pending στο timeline + περνά Supervisor.
 */
exports.assignTopic = (req, res) => {
  const { topicId, studentId } = req.body;

  db.query(`SELECT 1 FROM Assignments WHERE student_id = ? AND status <> 'Canceled' LIMIT 1`,
    [studentId],
    (e, r) => {
      if (e) return res.status(500).json({ success:false, message:'Σφάλμα κατά τον έλεγχο αναθέσεων' });
      if (r.length) return res.status(400).json({ success:false, message:'Ο φοιτητής έχει ήδη ανάθεση θέματος.' });

      db.query(
        `INSERT INTO Assignments (topic_id, student_id, status) VALUES (?,?, 'Pending')`,
        [topicId, studentId],
        (e2, r2) => {
          if (e2) return res.status(500).json({ success:false, message:'Σφάλμα κατά την ανάθεση του θέματος' });

          const assignmentId = r2.insertId;

          // timeline: αρχική Pending
          writeStatusHistory({
            assignmentId,
            status: 'Pending',
            reason: 'Αρχική ανάθεση θέματος (Pending)'
          });

          // Επιβλέπων ως Supervisor
          db.query(`SELECT professor_id FROM Topics WHERE id = ? LIMIT 1`, [topicId], (e3, r3) => {
            if (e3) return res.status(500).json({ success:false, message:'Σφάλμα κατά την αναζήτηση επιβλέποντα' });
            if (!r3.length) return res.status(404).json({ success:false, message:'Δεν βρέθηκε το θέμα για ανάθεση' });

            const supervisorId = r3[0].professor_id;
            db.query(
              `INSERT INTO CommitteeMembers (assignment_id, professor_id, role) VALUES (?,?, 'Supervisor')`,
              [assignmentId, supervisorId],
              (e4) => {
                if (e4) return res.status(500).json({ success:false, message:'Σφάλμα κατά την εισαγωγή επιβλέποντα' });
                res.status(201).json({ success:true, message:'Το θέμα ανατέθηκε (Pending) και ο επιβλέπων καταχωρήθηκε.' });
              }
            );
          });
        }
      );
    }
  );
};

/**
 * Ακύρωση Pending ανάθεσης (status -> Canceled) + timeline.
 */
exports.cancelPendingAssignment = (req, res) => {
  const { topicId, studentId } = req.body;

  const sel = `
    SELECT id FROM Assignments
    WHERE topic_id = ? AND student_id = ? AND status = 'Pending'
    LIMIT 1
  `;
  db.query(sel, [topicId, studentId], (e1, r1) => {
    if (e1) return res.status(500).json({ success:false, message:'Σφάλμα κατά την αναζήτηση ανάθεσης' });
    if (!r1.length) return res.status(404).json({ success:false, message:'Δεν βρέθηκε Pending ανάθεση' });

    const assignmentId = r1[0].id;
    db.query(`UPDATE Assignments SET status = 'Canceled' WHERE id = ? AND status = 'Pending'`,
      [assignmentId],
      (e2, r2) => {
        if (e2) return res.status(500).json({ success:false, message:'Σφάλμα κατά την ακύρωση της ανάθεσης' });
        if (!r2.affectedRows) return res.status(400).json({ success:false, message:'Η ανάθεση δεν είναι πλέον Pending' });

        writeStatusHistory({
          assignmentId,
          status: 'Canceled',
          reason: 'Ακύρωση Pending ανάθεσης από διδάσκοντα'
        }, () => res.status(200).json({ success:true, message:'Η ανάθεση ακυρώθηκε επιτυχώς.' }));
      }
    );
  });
};

/**
 * Αλλαγή θέματος (ενώ είναι Pending) + timeline.
 */
exports.changeAssignment = (req, res) => {
  const { topicId, studentId } = req.body;

  db.query(`SELECT id FROM Assignments WHERE student_id = ? AND status = 'Pending' LIMIT 1`,
    [studentId],
    (e1, r1) => {
      if (e1) return res.status(500).json({ success:false, message:'Σφάλμα κατά τον εντοπισμό ανάθεσης' });
      if (!r1.length) return res.status(404).json({ success:false, message:'Δεν βρέθηκε Pending ανάθεση για αλλαγή' });

      const assignmentId = r1[0].id;
      db.query(`UPDATE Assignments SET topic_id = ? WHERE id = ?`,
        [topicId, assignmentId],
        (err) => {
          if (err) return res.status(500).json({ success:false, message:'Σφάλμα κατά την αλλαγή του θέματος' });

          writeStatusHistory({
            assignmentId,
            status: 'Pending',
            reason: 'Αλλαγή θέματος (παραμένει Pending)'
          }, () => res.status(200).json({ success:true, message:'Το θέμα άλλαξε επιτυχώς.' }));
        }
      );
    }
  );
};

/* =========================================================
   Topics (συνεπές session usage)
   ========================================================= */

exports.getProfessorTopics = (req, res) => {
  const professorId = req.session.user?.id;
  if (!professorId) return res.status(401).json({ success:false, message:'Δεν βρέθηκε ID καθηγητή στο session.' });

  db.query(
    `SELECT T.id, T.title, T.description, T.attachment FROM Topics T WHERE T.professor_id = ?`,
    [professorId],
    (err, results) => {
      if (err) return res.status(500).json({ success:false, message:'Σφάλμα κατά την ανάκτηση θεμάτων.' });
      res.status(200).json({ success:true, topics: results });
    }
  );
};

/* =========================================================
   Theses list & details
   ========================================================= */

exports.getThesesList = (req, res) => {
  const professorId = req.session.user?.id;
  const { statusFilter, roleFilter } = req.query;
  if (!professorId) return res.status(401).json({ success:false, message:'Δεν βρέθηκε ID καθηγητή στο session.' });

  const parts = buildProfessorThesesQueryParts({ professorId, statusFilter, roleFilter });

  const sql = `
    SELECT
      A.id AS assignment_id,
      MAX(A.status) AS status,
      MAX(T.title) AS topic_title,
      MAX(S.name) AS student_name,
      COALESCE(MAX(A.grading_enabled), 0) AS grading_enabled,
      GROUP_CONCAT(DISTINCT CM.professor_id SEPARATOR ',') AS committee_members,
      MAX(
        CASE
          WHEN CM.professor_id = ? THEN CM.role
          WHEN T.professor_id  = ? THEN 'Supervisor'
          ELSE NULL
        END
      ) AS professor_role
    FROM Assignments A
    JOIN Topics T ON A.topic_id = T.id
    JOIN Users  S ON A.student_id = S.id
    LEFT JOIN CommitteeMembers CM ON A.id = CM.assignment_id
    ${parts.whereSql}
    GROUP BY A.id
    ${parts.havingSql}
    ORDER BY A.id DESC
  `;
  const params = [professorId, professorId, ...parts.params];

  db.query(sql, params, (err, results) => {
    if (err) return res.status(500).json({ success:false, message:'Σφάλμα κατά την ανάκτηση της λίστας διπλωματικών.' });
    res.status(200).json({ success:true, theses: results });
  });
};

/**
 * Λεπτομέρειες μίας ΔΕ + timeline.
 * access-control: 
 *    - Professor: πρέπει να είναι Supervisor/Member
 *    - Student: πρέπει να είναι ο κάτοχος
 */
exports.getThesisDetails = (req, res) => {
  const assignmentId = Number(req.params.assignmentId);
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
    return res.status(400).json({ success: false, message: 'Άκυρο assignmentId' });
  }

  const user = req.session.user;
  if (!user) return res.status(401).json({ success:false, message:'Μη εξουσιοδοτημένος χρήστης' });

  const proceed = () => {
    const sql = `
      SELECT 
        A.id                          AS assignment_id,
        A.status                      AS status,
        COALESCE(A.grading_enabled,0) AS grading_enabled,
        A.repository_link             AS repository_link,

        T.title                       AS topic_title,
        T.description                 AS topic_description,

        S.name                        AS student_name,

        -- πιο πρόσφατη εγγραφή Γραμματείας (αν υπάρχει)
        SS.ap_praktiko                AS ap_praktiko,

        -- πιο πρόσφατη εγγραφή Grades (αν υπάρχει)
        G.professor1_grade,
        G.professor2_grade,
        G.professor3_grade,
        G.final_grade,

        -- Επιτροπή ως ενιαίο string
        CMX.committee_concat
      FROM Assignments A
      JOIN Topics T   ON T.id = A.topic_id
      JOIN Users  S   ON S.id = A.student_id

      LEFT JOIN (
        SELECT s1.*
        FROM SecretarySubmissions s1
        JOIN (
          SELECT assignment_id, MAX(id) AS max_id
          FROM SecretarySubmissions
          GROUP BY assignment_id
        ) last ON last.assignment_id = s1.assignment_id AND last.max_id = s1.id
      ) SS ON SS.assignment_id = A.id

      LEFT JOIN (
        SELECT g1.*
        FROM Grades g1
        JOIN (
          SELECT assignment_id, MAX(id) AS max_id
          FROM Grades
          GROUP BY assignment_id
        ) last ON last.assignment_id = g1.assignment_id AND last.max_id = g1.id
      ) G ON G.assignment_id = A.id

      LEFT JOIN (
        SELECT 
          CM.assignment_id,
          GROUP_CONCAT(
            DISTINCT CONCAT(U.name, ' (', CM.role, ')')
            ORDER BY CM.role='Supervisor' DESC, CM.id ASC
            SEPARATOR ', '
          ) AS committee_concat
        FROM CommitteeMembers CM
        JOIN Users U ON U.id = CM.professor_id
        GROUP BY CM.assignment_id
      ) CMX ON CMX.assignment_id = A.id

      WHERE A.id = ?
      LIMIT 1
    `;

    db.query(sql, [assignmentId], (err, rows) => {
      if (err) {
        console.error('getThesisDetails error:', err);
        return res.status(500).json({ success:false, message:'Σφάλμα ανάκτησης λεπτομερειών.' });
      }
      if (!rows.length) return res.status(404).json({ success:false, message:'Δεν βρέθηκε διπλωματική.' });

      const r = rows[0];
      const hasAllGrades =
        r.professor1_grade != null &&
        r.professor2_grade != null &&
        r.professor3_grade != null;

      const info = {
        assignment_id:      r.assignment_id,
        status:             r.status,
        grading_enabled:    r.grading_enabled ? 1 : 0,
        repository_link:    r.repository_link || null,

        topic_title:        r.topic_title || '',
        topic_description:  r.topic_description || '',
        student_name:       r.student_name || '',

        practical_protocol: r.ap_praktiko || null, // αριθμός ΑΠ/ΓΣ

        professor1_grade:   r.professor1_grade ?? null,
        professor2_grade:   r.professor2_grade ?? null,
        professor3_grade:   r.professor3_grade ?? null,
        final_grade:        r.final_grade      ?? null,

        committee_members:  r.committee_concat || null,

        // πρακτικό όταν υπάρχουν και οι 3 βαθμοί
        praktiko_dynamic_url: hasAllGrades ? `/api/students/praktiko/${r.assignment_id}` : null
      };

      const historySql = `
        SELECT id, status, reason, gs_arithmos, gs_etos, created_at
        FROM AssignmentStatusHistory
        WHERE assignment_id = ?
        ORDER BY created_at ASC, id ASC
      `;
      db.query(historySql, [assignmentId], (e2, historyRows) => {
        if (e2) {
          console.error('history error (soft-fail):', e2);
          return res.json({ success: true, thesisDetails: info, history: [] });
        }
        return res.json({ success: true, thesisDetails: info, history: historyRows || [] });
      });
    });
  };

  // Access control ανά ρόλο
  if (user.role === 'Professor') {
    return ensureProfessorForAssignment(assignmentId, user.id, ['Supervisor','Member'], (e, ok) => {
      if (e) return res.status(500).json({ success:false, message:'Σφάλμα ελέγχου πρόσβασης' });
      if (!ok) return res.status(403).json({ success:false, message:'Δεν έχετε πρόσβαση σε αυτή τη διπλωματική.' });
      proceed();
    });
  }
  if (user.role === 'Student') {
    return ensureStudentOwnsAssignment(assignmentId, user.id, (e, ok) => {
      if (e) return res.status(500).json({ success:false, message:'Σφάλμα ελέγχου πρόσβασης' });
      if (!ok) return res.status(403).json({ success:false, message:'Δεν έχετε πρόσβαση σε αυτή τη διπλωματική.' });
      proceed();
    });
  }

  return res.status(403).json({ success:false, message:'Μη αποδεκτός ρόλος' });
};

/* =========================================================
   Export
   ========================================================= */

exports.exportThesesList = (req, res) => {
  const professorId = req.session.user?.id;
  const { format = 'json', statusFilter, roleFilter } = req.query;
  if (!professorId) return res.status(401).json({ success:false, message:'Δεν βρέθηκε ID καθηγητή στο session.' });

  const parts = buildProfessorThesesQueryParts({ professorId, statusFilter, roleFilter });

  // (προαιρετικά) αυξάνουμε group_concat_max_len για μεγάλες επιτροπές
  db.query('SET SESSION group_concat_max_len = 8192', [], () => {
    const sql = `
      SELECT
        A.id AS assignment_id,
        MAX(A.status) AS status,
        MAX(T.title) AS topic_title,
        MAX(S.name) AS student_name,
        GROUP_CONCAT(DISTINCT CM.professor_id SEPARATOR ',') AS committee_members,
        MAX(
          CASE
            WHEN CM.professor_id = ? THEN CM.role
            WHEN T.professor_id  = ? THEN 'Supervisor'
            ELSE NULL
          END
        ) AS professor_role
      FROM Assignments A
      JOIN Topics T ON A.topic_id = T.id
      JOIN Users  S ON A.student_id = S.id
      LEFT JOIN CommitteeMembers CM ON A.id = CM.assignment_id
      ${parts.whereSql}
      GROUP BY A.id
      ${parts.havingSql}
      ORDER BY A.id DESC
    `;
    const params = [professorId, professorId, ...parts.params];

    db.query(sql, params, (err, results) => {
      if (err) return res.status(500).json({ success:false, message:'Σφάλμα κατά την εξαγωγή της λίστας διπλωματικών.' });

      if (format === 'csv') {
        const fields = ['assignment_id','status','topic_title','student_name','committee_members','professor_role'];
        const csv = new Parser({ fields }).parse(results);
        res.setHeader('Content-Type','text/csv; charset=utf-8');
        res.setHeader('Content-Disposition','attachment; filename="theses_list.csv"');
        return res.send(csv);
      }
      res.status(200).json({ success:true, theses: results });
    });
  });
};

/* =========================================================
   Invitations & cancel by professor
   ========================================================= */

/**
 * Προσκεκλημένα μέλη ανάθεσης.
 *  access-control (Professor μέλος επιτροπής ή Student owner).
 */
exports.viewInvitedMembers = (req, res) => {
  const { assignmentId } = req.params;
  const id = Number(assignmentId);
  const user = req.session.user;

  if (!user) return res.status(401).json({ success:false, message:'Μη εξουσιοδοτημένος χρήστης' });
  const go = () => {
    const sql = `
      SELECT i.id AS invitation_id, i.professor_id, u.name AS professor_name,
             i.status, i.sent_date, i.response_date
      FROM Invitations i
      JOIN Users u ON i.professor_id = u.id
      WHERE i.assignment_id = ?
    `;
    db.query(sql, [id], (err, results) => {
      if (err) return res.status(500).json({ success:false, message:'Σφάλμα κατά την ανάκτηση προσκλήσεων' });
      res.status(200).json({ success:true, invitedMembers: results });
    });
  };

  if (user.role === 'Professor') {
    return ensureProfessorForAssignment(id, user.id, ['Supervisor','Member'], (e, ok) => {
      if (e) return res.status(500).json({ success:false, message:'Σφάλμα ελέγχου πρόσβασης' });
      if (!ok) return res.status(403).json({ success:false, message:'Δεν έχετε πρόσβαση σε αυτή τη διπλωματική.' });
      go();
    });
  }
  if (user.role === 'Student') {
    return ensureStudentOwnsAssignment(id, user.id, (e, ok) => {
      if (e) return res.status(500).json({ success:false, message:'Σφάλμα ελέγχου πρόσβασης' });
      if (!ok) return res.status(403).json({ success:false, message:'Δεν έχετε πρόσβαση σε αυτή τη διπλωματική.' });
      go();
    });
  }
  return res.status(403).json({ success:false, message:'Μη αποδεκτός ρόλος' });
};

/**
 * Ακύρωση Pending από επιβλέποντα (status -> Canceled) + timeline.
 */
exports.cancelAssignmentByProfessor = (req, res) => {
  if (!req.session.user || req.session.user.role !== 'Professor') {
    return res.status(403).json({ success:false, message:'Μη εξουσιοδοτημένη πρόσβαση.' });
  }
  const { assignmentId } = req.body;
  const professorId = req.session.user.id;

  const check = `
    SELECT a.id
    FROM Assignments a
    JOIN CommitteeMembers cm ON a.id = cm.assignment_id
    WHERE a.id = ? AND cm.professor_id = ? AND cm.role='Supervisor' AND a.status='Pending'
    LIMIT 1
  `;
  db.query(check, [assignmentId, professorId], (e, r) => {
    if (e) return res.status(500).json({ success:false, message:'DB error' });
    if (!r.length) return res.status(400).json({ success:false, message:'Δεν έχετε δικαίωμα ακύρωσης ή δεν είναι Pending.' });

    db.query(`DELETE FROM Invitations WHERE assignment_id = ?`, [assignmentId], () => {
      db.query(`UPDATE Assignments SET status='Canceled' WHERE id=?`, [assignmentId], (e2) => {
        if (e2) return res.status(500).json({ success:false, message:'DB error' });

        writeStatusHistory({
          assignmentId,
          status: 'Canceled',
          reason: 'Ακύρωση Pending από επιβλέποντα'
        }, () => res.json({ success:true, message:'Ακύρωση Θέματος ολοκληρώθηκε' }));
      });
    });
  });
};

/* =========================================================
   Notes
   ========================================================= */

exports.createNote = (req, res) => {
  if (!req.session.user || req.session.user.role !== 'Professor') {
    return res.status(403).json({ success:false, message:'Μη εξουσιοδοτημένη πρόσβαση.' });
  }
  const professorId = req.session.user.id;
  const { assignmentId, content } = req.body;

  const text = String(content || '').trim();
  if (!text) return res.status(400).json({ success:false, message:'Η σημείωση είναι κενή.' });
  if (text.length > 300) return res.status(400).json({ success:false, message:'Μέχρι 300 χαρακτήρες για τη σημείωση.' });

  db.query(`SELECT id FROM Assignments WHERE id = ? AND status='Active' LIMIT 1`, [assignmentId], (e, r) => {
    if (e) return res.status(500).json({ success:false, message:'Σφάλμα DB κατά τον έλεγχο.' });
    if (!r.length) return res.status(400).json({ success:false, message:'Η διπλωματική δεν είναι ενεργή ή δεν υπάρχει.' });

    db.query(
      `INSERT INTO Notes (assignment_id, professor_id, content) VALUES (?,?,?)`,
      [assignmentId, professorId, text],
      (e2) => {
        if (e2) return res.status(500).json({ success:false, message:'Σφάλμα DB κατά την εισαγωγή σημείωσης.' });
        res.status(201).json({ success:true, message:'Η σημείωση καταχωρήθηκε.' });
      }
    );
  });
};

exports.getMyNotes = (req, res) => {
  if (!req.session.user || req.session.user.role !== 'Professor') {
    return res.status(403).json({ success:false, message:'Μη εξουσιοδοτημένη πρόσβαση.' });
  }
  const professorId = req.session.user.id;
  const { assignmentId } = req.query;

  const sql = `
    SELECT id, content
    FROM Notes
    WHERE assignment_id = ? AND professor_id = ?
    ORDER BY id DESC
  `;
  db.query(sql, [assignmentId, professorId], (err, results) => {
    if (err) return res.status(500).json({ success:false, message:'Σφάλμα DB κατά την ανάκτηση σημειώσεων.' });
    res.status(200).json({ success:true, notes: results });
  });
};

/* =========================================================
   Status changes (2y cancel / UnderReview)
   ========================================================= */

/**
 * Ακύρωση μετά από 2 χρόνια (χρησιμοποιεί TIMESTAMPDIFF για ακρίβεια).
 */
exports.cancelAfterTwoYears = (req, res) => {
  if (!req.session.user || req.session.user.role !== 'Professor') {
    return res.status(403).json({ success:false, message:'Μη εξουσιοδοτημένη πρόσβαση.' });
  }
  const professorId = req.session.user.id;
  const { assignmentId, gsArithmos, gsEtos } = req.body;

  if (!gsArithmos || !gsEtos) {
    return res.status(400).json({ success:false, message:'Απαιτείται αριθμός και έτος ΓΣ για την ακύρωση.' });
  }

  const check = `
    SELECT A.id
    FROM Assignments A
    JOIN CommitteeMembers CM ON A.id = CM.assignment_id
    WHERE A.id = ?
      AND CM.professor_id = ?
      AND CM.role='Supervisor'
      AND A.status='Active'
      AND TIMESTAMPDIFF(YEAR, A.start_date, NOW()) >= 2
    LIMIT 1
  `;
  db.query(check, [assignmentId, professorId], (e, r) => {
    if (e) return res.status(500).json({ success:false, message:'Σφάλμα DB' });
    if (!r.length) return res.status(400).json({ success:false, message:'Δεν έχετε δικαίωμα ή δεν έχουν συμπληρωθεί 2 έτη.' });

    db.query(`UPDATE Assignments SET status='Canceled' WHERE id = ?`, [assignmentId], (e2) => {
      if (e2) return res.status(500).json({ success:false, message:'Σφάλμα κατά την ακύρωση.' });

      writeStatusHistory(
        { assignmentId, status: 'Canceled', reason: 'Aπο διδάσκοντα', gsArithmos, gsEtos },
        (e3) => {
          if (e3) return res.status(500).json({ success:false, message:'Ακυρώθηκε, αλλά απέτυχε η καταχώρηση ιστορικού.' });
          res.status(200).json({ success:true, message:'Η διπλωματική ακυρώθηκε επιτυχώς (μετά από 2 έτη).' });
        }
      );
    });
  });
};

/**
 * Θέση σε UnderReview (απαιτεί Supervisor, Active, και ΑΠ/ΓΣ καταχωρημένο από Γραμματεία).
 */
exports.setUnderReview = (req, res) => {
  if (!req.session.user || req.session.user.role !== 'Professor') {
    return res.status(403).json({ success: false, message: 'Μη εξουσιοδοτημένη πρόσβαση.' });
  }

  const professorId = req.session.user.id;
  const assignmentId = Number(req.body.assignmentId);
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
    return res.status(400).json({ success: false, message: 'Απαιτείται έγκυρο assignmentId.' });
  }

  const checkSql = `
    SELECT A.id
    FROM Assignments A
    JOIN CommitteeMembers CM ON A.id = CM.assignment_id
    WHERE A.id = ?
      AND CM.professor_id = ?
      AND CM.role = 'Supervisor'
      AND A.status = 'Active'
    LIMIT 1
  `;
  db.query(checkSql, [assignmentId, professorId], (e, r) => {
    if (e) return res.status(500).json({ success: false, message: 'Σφάλμα DB.' });
    if (!r.length) {
      return res.status(400).json({
        success: false,
        message: 'Δεν έχετε δικαίωμα ή η διπλωματική δεν είναι σε κατάσταση Active.'
      });
    }

    // πιο πρόσφατο ΑΠ/ΓΣ
    const apSql = `
      SELECT ap_praktiko
      FROM SecretarySubmissions
      WHERE assignment_id = ?
      ORDER BY id DESC
      LIMIT 1
    `;
    db.query(apSql, [assignmentId], (eAP, rAP) => {
      if (eAP) return res.status(500).json({ success: false, message: 'Σφάλμα ελέγχου ΑΠ/ΓΣ.' });
      const ap = rAP.length ? String(rAP[0].ap_praktiko || '').trim() : '';
      if (!ap) {
        return res.status(400).json({
          success: false,
          message: 'Πριν τεθεί σε "Υπό Εξέταση", η Γραμματεία πρέπει να καταχωρήσει τον αριθμό ΑΠ/ΓΣ.'
        });
      }

      db.query(`UPDATE Assignments SET status = 'UnderReview' WHERE id = ?`, [assignmentId], (e2) => {
        if (e2) return res.status(500).json({ success: false, message: 'Σφάλμα κατά την αλλαγή κατάστασης.' });

        writeStatusHistory(
          { assignmentId, status: 'UnderReview', reason: 'Θέση σε Υπό Εξέταση από επιβλέποντα' },
          (e3) => {
            if (e3) console.error('writeStatusHistory error:', e3);
            return res.status(200).json({ success: true, message: 'Η διπλωματική τέθηκε σε Υπό Εξέταση.' });
          }
        );
      });
    });
  });
};

/* =========================================================
   Announcements
   ========================================================= */

exports.createAnnouncement = (req, res) => {
  const { assignmentId, text } = req.body;
  const professorId = req.session.user?.id;
  if (!professorId) return res.status(401).json({ success:false, message:'Μη εξουσιοδοτημένος χρήστης' });

  // (α) υπάρχει ήδη;
  db.query(`SELECT id FROM Announcements WHERE assignment_id=? LIMIT 1`,
    [assignmentId],
    (e0, r0) => {
      if (e0) return res.status(500).json({ success:false, message:'Σφάλμα στη βάση δεδομένων' });
      if (r0.length) return res.status(400).json({ success:false, message:'Υπάρχει ήδη ανακοίνωση για αυτή τη διπλωματική.' });

      // (β) είναι Supervisor & (γ) υπάρχουν στοιχεία εξέτασης
      const chkSup = `SELECT 1 FROM CommitteeMembers WHERE assignment_id=? AND professor_id=? AND role='Supervisor' LIMIT 1`;
      db.query(chkSup, [assignmentId, professorId], (e, r) => {
        if (e) return res.status(500).json({ success:false, message:'Σφάλμα στη βάση δεδομένων' });
        if (!r.length) return res.status(403).json({ success:false, message:'Δεν είστε επιβλέπων αυτής της διπλωματικής' });

        const examInfo = `SELECT date, location, tropos_eksetasis FROM Events WHERE assignment_id=? LIMIT 1`;
        db.query(examInfo, [assignmentId], (e2, r2) => {
          if (e2) return res.status(500).json({ success:false, message:'Σφάλμα στη βάση δεδομένων' });
          const row = r2[0] || {};
          if (!row.date || !row.location || !row.tropos_eksetasis) {
            return res.status(400).json({ success:false, message:'Ο φοιτητής δεν έχει συμπληρώσει στοιχεία εξέτασης.' });
          }

          const textClean = String(text || '').trim();
          if (!textClean) return res.status(400).json({ success:false, message:'Κενό κείμενο ανακοίνωσης' });
          if (textClean.length > 2000) return res.status(400).json({ success:false, message:'Μέχρι 2000 χαρακτήρες' });

          db.query(
            `INSERT INTO Announcements (assignment_id, professor_id, text) VALUES (?,?,?)`,
            [assignmentId, professorId, textClean],
            (e3) => {
              if (e3) return res.status(500).json({ success:false, message:'Αποτυχία καταχώρησης ανακοίνωσης' });
              res.status(201).json({ success:true, message:'Η ανακοίνωση δημιουργήθηκε επιτυχώς' });
            }
          );
        });
      });
    }
  );
};

exports.getAnnouncement = (req, res) => {
  const { assignmentId } = req.params;
  db.query(
    `SELECT text, created_at FROM Announcements WHERE assignment_id = ? ORDER BY id DESC LIMIT 1`,
    [assignmentId],
    (err, results) => {
      if (err) return res.status(500).json({ success:false, message:'Σφάλμα στη βάση δεδομένων' });
      if (!results.length) return res.status(404).json({ success:false, message:'Δεν υπάρχει ανακοίνωση' });
      res.status(200).json({ success:true, announcement: results[0] });
    }
  );
};

/**
 * Προέλεγχος για ανακοίνωση (Supervisor & συμπληρωμένα στοιχεία εξέτασης).
 */
exports.canAnnounce = (req, res) => {
  const professorId  = req.session.user?.id;
  const assignmentId = Number(req.params.assignmentId);

  if (!professorId) return res.status(401).json({ success:false, message:'Μη εξουσιοδοτημένος χρήστης' });
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
    return res.status(400).json({ success:false, message:'Άκυρο assignmentId' });
  }

  const chkSup = `
    SELECT 1
    FROM CommitteeMembers
    WHERE assignment_id = ? AND professor_id = ? AND role='Supervisor'
    LIMIT 1
  `;
  db.query(chkSup, [assignmentId, professorId], (e, r) => {
    if (e) return res.status(500).json({ success:false, message:'Σφάλμα στη βάση δεδομένων' });
    if (!r.length) return res.status(403).json({ success:false, message:'Δεν είστε επιβλέπων αυτής της διπλωματικής' });

    const examInfo = `SELECT date, location, tropos_eksetasis FROM Events WHERE assignment_id = ? LIMIT 1`;
    db.query(examInfo, [assignmentId], (e2, r2) => {
      if (e2) return res.status(500).json({ success:false, message:'Σφάλμα στη βάση δεδομένων' });

      const row = r2 && r2[0] ? r2[0] : {};
      const missing = {
        date: !row.date,
        location: !row.location,
        tropos_eksetasis: !row.tropos_eksetasis
      };
      const can = !missing.date && !missing.location && !missing.tropos_eksetasis;

      const lastAnn = `
        SELECT id, text, created_at
        FROM Announcements
        WHERE assignment_id = ?
        ORDER BY id DESC
        LIMIT 1
      `;
      db.query(lastAnn, [assignmentId], (e3, r3) => {
        if (e3) return res.status(500).json({ success:false, message:'Σφάλμα στη βάση δεδομένων' });
        const announcement = r3 && r3[0] ? r3[0] : null;
        return res.json({ success:true, can, missing, announcement });
      });
    });
  });
};

/* =========================================================
   Grading
   ========================================================= */

exports.enableGrading = (req, res) => {
  const { assignmentId } = req.body;
  const professorId = req.session.user?.id;
  if (!professorId) return res.status(401).json({ success:false, message:'Μη εξουσιοδοτημένος χρήστης' });

  const chkSup = `SELECT 1 FROM CommitteeMembers WHERE assignment_id=? AND professor_id=? AND role='Supervisor' LIMIT 1`;
  db.query(chkSup, [assignmentId, professorId], (e, r) => {
    if (e) return res.status(500).json({ success:false, message:'Σφάλμα βάσης' });
    if (!r.length) return res.status(403).json({ success:false, message:'Δεν είστε επιβλέπων αυτής της διπλωματικής' });

    const checksSql = `
      SELECT
        (SELECT COUNT(*) FROM Announcements WHERE assignment_id = ?) AS has_announcement,
        (SELECT COUNT(*) FROM Submissions  WHERE assignment_id = ? AND pdf_draft IS NOT NULL AND pdf_draft <> '') AS has_draft
    `;
    db.query(checksSql, [assignmentId, assignmentId], (e2, rows) => {
      if (e2) return res.status(500).json({ success:false, message:'Σφάλμα ελέγχου προϋποθέσεων' });
      const row = rows[0] || {};
      const hasAnnouncement = Number(row.has_announcement) > 0;
      const hasDraft        = Number(row.has_draft) > 0;

      if (!hasAnnouncement || !hasDraft) {
        const missing = [];
        if (!hasAnnouncement) missing.push('Ανακοίνωση');
        if (!hasDraft)        missing.push('Πρόχειρο κείμενο (pdf_draft)');
        return res.status(400).json({ success:false, message:`Δεν μπορείτε ακόμη να ενεργοποιήσετε τη βαθμολόγηση. Λείπει: ${missing.join(' και ')}.` });
      }

      // Βεβαιώσου ότι υπάρχει εγγραφή Grades (αν όχι, δημιουργείται)
      db.query(`SELECT id FROM Grades WHERE assignment_id=? ORDER BY id DESC LIMIT 1`, [assignmentId], (e3, r3) => {
        if (e3) return res.status(500).json({ success:false, message:'Σφάλμα βάσης' });

        const after = () => {
          db.query(`UPDATE Assignments SET grading_enabled=1 WHERE id=?`, [assignmentId], (e5) => {
            if (e5) return res.status(500).json({ success:false, message:'Σφάλμα κατά την ενημέρωση grading_enabled' });
            return res.status(200).json({ success:true, message:'Η καταχώρηση βαθμού ενεργοποιήθηκε (υπάρχει ανακοίνωση & πρόχειρο).' });
          });
        };

        if (r3.length) return after();

        db.query(`INSERT INTO Grades (assignment_id) VALUES (?)`, [assignmentId], (e4) => {
          if (e4) return res.status(500).json({ success:false, message:'Αποτυχία προετοιμασίας βαθμολογιών' });
          after();
        });
      });
    });
  });
};

exports.submitGrade = (req, res) => {
  const { assignmentId, grade } = req.body;
  const professorId = req.session.user?.id;
  if (!professorId) return res.status(401).json({ success:false, message:'Μη εξουσιοδοτημένος χρήστης' });

  const id = Number(assignmentId);
  const g  = Number(grade);
  if (!Number.isInteger(id) || id <= 0)       return res.status(400).json({ success:false, message:'Άκυρο assignmentId' });
  if (!Number.isFinite(g) || g < 0 || g > 10) return res.status(400).json({ success:false, message:'Ο βαθμός πρέπει να είναι 0–10' });

  const chk = `
    SELECT A.status, A.grading_enabled, CM.role
    FROM CommitteeMembers CM
    JOIN Assignments A ON CM.assignment_id = A.id
    WHERE CM.assignment_id = ? AND CM.professor_id = ?
    LIMIT 1
  `;
  db.query(chk, [id, professorId], (e, r) => {
    if (e) return res.status(500).json({ success:false, message:'Σφάλμα βάσης' });
    if (!r.length) return res.status(403).json({ success:false, message:'Δεν είστε μέλος της επιτροπής.' });

    const { status, grading_enabled, role } = r[0];
    if (status !== 'UnderReview') return res.status(400).json({ success:false, message:'Η εργασία δεν είναι υπό εξέταση.' });
    if (!grading_enabled)         return res.status(403).json({ success:false, message:'Η βαθμολόγηση δεν έχει ενεργοποιηθεί.' });
    if (!['Supervisor','Member'].includes(role)) return res.status(403).json({ success:false, message:'Μη αποδεκτός ρόλος.' });

    const doUpsert = (col) => {
      const upd = `UPDATE Grades SET ${col} = ? WHERE assignment_id = ?`;
      db.query(upd, [g, id], (e1, r1) => {
        if (e1) return res.status(500).json({ success:false, message:'Αποτυχία καταχώρησης βαθμού (update)' });
        if (r1.affectedRows > 0) {
          return recalcFinalGrade(id, () => res.status(200).json({ success:true, message:`Ο βαθμός καταχωρήθηκε (${role}).` }));
        }
        const ins = `INSERT INTO Grades (assignment_id, ${col}) VALUES (?, ?)`;
        db.query(ins, [id, g], (e2) => {
          if (e2) return res.status(500).json({ success:false, message:'Αποτυχία καταχώρησης βαθμού (insert)' });
          return recalcFinalGrade(id, () => res.status(200).json({ success:true, message:`Ο βαθμός καταχωρήθηκε (${role}).` }));
        });
      });
    };

    if (role === 'Supervisor') return doUpsert('professor1_grade');

    db.query(
      `SELECT professor_id FROM CommitteeMembers WHERE assignment_id=? AND role='Member' ORDER BY id ASC`,
      [id],
      (e3, rows) => {
        if (e3) return res.status(500).json({ success:false, message:'Σφάλμα βάσης κατά την αναγνώριση μέλους' });
        if (rows.length !== 2) return res.status(400).json({ success:false, message:'Η εργασία δεν έχει ακριβώς δύο μέλη.' });

        if (rows[0].professor_id === professorId) return doUpsert('professor2_grade');
        if (rows[1].professor_id === professorId) return doUpsert('professor3_grade');
        return res.status(400).json({ success:false, message:'Δεν εντοπίστηκε σωστά το μέλος.' });
      }
    );
  });
};

exports.getGrades = (req, res) => {
  const { assignmentId } = req.params;
  const id = Number(assignmentId);
  const user = req.session.user;

  if (!user) return res.status(401).json({ success:false, message:'Μη εξουσιοδοτημένος χρήστης' });

  const finish = () => {
    db.query(
      `SELECT professor1_grade, professor2_grade, professor3_grade, final_grade FROM Grades WHERE assignment_id = ? LIMIT 1`,
      [id],
      (err, results) => {
        if (err) return res.status(500).json({ success:false, message:'Σφάλμα στη βάση δεδομένων' });
        if (!results.length) return res.status(404).json({ success:false, message:'Δεν υπάρχουν βαθμοί για αυτή τη διπλωματική' });

        const g = results[0];
        const haveAll = g.professor1_grade != null && g.professor2_grade != null && g.professor3_grade != null;
        if (g.final_grade == null && haveAll) {
          const avg = Math.round(((Number(g.professor1_grade)+Number(g.professor2_grade)+Number(g.professor3_grade))/3)*10)/10;
          g.final_grade = avg;
        }
        res.status(200).json({ success:true, grades: g });
      }
    );
  };

  if (user.role === 'Professor') {
    return ensureProfessorForAssignment(id, user.id, ['Supervisor','Member'], (e, ok) => {
      if (e) return res.status(500).json({ success:false, message:'Σφάλμα ελέγχου πρόσβασης' });
      if (!ok) return res.status(403).json({ success:false, message:'Δεν έχετε πρόσβαση σε αυτή τη διπλωματική.' });
      finish();
    });
  }
  if (user.role === 'Student') {
    return ensureStudentOwnsAssignment(id, user.id, (e, ok) => {
      if (e) return res.status(500).json({ success:false, message:'Σφάλμα ελέγχου πρόσβασης' });
      if (!ok) return res.status(403).json({ success:false, message:'Δεν έχετε πρόσβαση σε αυτή τη διπλωματική.' });
      finish();
    });
  }
  return res.status(403).json({ success:false, message:'Μη αποδεκτός ρόλος' });
};

/* =========================================================
   Public Announcements (no auth)
   ========================================================= */

exports.getPublicAnnouncements = (req, res) => {
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  const toYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const isYMD = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

  const today = new Date();
  const defFrom = toYMD(today);
  const defTo = toYMD(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30));

  const from = isYMD(req.query.from) ? req.query.from : defFrom;
  const to = isYMD(req.query.to) ? req.query.to : defTo;
  const format = (req.query.format || 'json').toLowerCase(); // json | xml
  const wantDownload = ['1','true','yes'].includes(String(req.query.download || '').toLowerCase());

  const sql = `
    SELECT 
      E.id                AS event_id,
      E.date              AS starts_at,
      E.location,
      E.tropos_eksetasis,
      A.id                AS assignment_id,
      T.title             AS topic_title,
      Stu.name            AS student_name,
      Sup.name            AS supervisor_name,
      Ann.text            AS announcement_text,
      Ann.created_at      AS announcement_created_at
    FROM Events E
    JOIN Assignments A ON A.id = E.assignment_id
    JOIN Topics T       ON T.id = A.topic_id
    JOIN Users Stu      ON Stu.id = A.student_id
    JOIN Users Sup      ON Sup.id = T.professor_id
    LEFT JOIN (
      SELECT a1.assignment_id, a1.text, a1.created_at
      FROM Announcements a1
      JOIN (
        SELECT assignment_id, MAX(created_at) AS max_created
        FROM Announcements
        GROUP BY assignment_id
      ) a2 ON a2.assignment_id = a1.assignment_id AND a2.max_created = a1.created_at
    ) Ann ON Ann.assignment_id = E.assignment_id
    WHERE DATE(E.date) BETWEEN ? AND ?
    ORDER BY E.date ASC
  `;

  db.query(sql, [from, to], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: 'DB error', error: String(err) });

    res.set('Cache-Control', 'public, max-age=60');

    if (format === 'xml') {
      const esc = (s = '') =>
        String(s)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;')
          .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
          .replace(/'/g, '&apos;');

      const toIso = (d) => new Date(d).toISOString();

      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<announcements from="${from}" to="${to}">\n`;
      rows.forEach((r) => {
        xml += `  <announcement>\n`;
        xml += `    <starts_at>${esc(toIso(r.starts_at))}</starts_at>\n`;
        xml += `    <topic_title>${esc(r.topic_title)}</topic_title>\n`;
        xml += `    <student>${esc(r.student_name)}</student>\n`;
        xml += `    <supervisor>${esc(r.supervisor_name)}</supervisor>\n`;
        xml += `    <location>${esc(r.location)}</location>\n`;
        xml += `    <exam_mode>${esc(r.tropos_eksetasis)}</exam_mode>\n`;
        if (r.announcement_text) xml += `    <text>${esc(r.announcement_text)}</text>\n`;
        xml += `  </announcement>\n`;
      });
      xml += `</announcements>`;

      res.type('application/xml');
      if (wantDownload) {
        res.set('Content-Disposition', `attachment; filename="announcements_${from}_${to}.xml"`);
      }
      return res.send(xml);
    }

    const data = rows.map((r) => ({
      starts_at: r.starts_at,
      topic_title: r.topic_title,
      student: r.student_name,
      supervisor: r.supervisor_name,
      location: r.location,
      exam_mode: r.tropos_eksetasis,
      text: r.announcement_text || null
    }));

    const payload = {
      success: true,
      range: { from, to },
      count: data.length,
      announcements: data
    };

    if (wantDownload) {
      res.set('Content-Type', 'application/json');
      res.set('Content-Disposition', `attachment; filename="announcements_${from}_${to}.json"`);
      return res.send(JSON.stringify(payload));
    }
    return res.json(payload);
  });
};
