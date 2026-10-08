
const db = require('../db'); // shared MySQL pool

/* =========================================================
   Helpers
   ========================================================= */

/** Βεβαιώνεται ότι υπάρχει logged-in Professor και επιστρέφει το id του.
 *  Αν όχι, απαντά 403 και γυρίζει null (ώστε να γίνει early return).
 */
function requireProfessor(req, res) {
  const user = req.session?.user;
  if (!user || user.role !== 'Professor') {
    res.status(403).json({ success: false, message: 'Μη εξουσιοδοτημένη πρόσβαση.' });
    return null;
  }
  return user.id;
}

/** Απλό wrapper για queries με ενιαίο χειρισμό 500 */
function runQuery(sql, params, res, onOk) {
  db.query(sql, params, (err, rows) => {
    if (err) {
      // Το μήνυμα που στέλνουμε παραμένει ίδιο ανά κλήση (βλ. κλήσεις παρακάτω)
      return onOk(err, null);
    }
    onOk(null, rows);
  });
}

/* =========================================================
   1) Όλες οι Pending προσκλήσεις για τον τρέχοντα καθηγητή
   ========================================================= */
exports.getInvitations = (req, res) => {
  const professorId = requireProfessor(req, res);
  if (!professorId) return;

  const sql = `
    SELECT 
      i.id     AS invitation_id,
      i.status AS invitation_status,
      i.sent_date,
      u.name   AS student_name,
      t.title  AS topic_title
    FROM Invitations i
    JOIN Assignments a ON i.assignment_id = a.id
    JOIN Topics t      ON a.topic_id     = t.id
    JOIN Users  u      ON a.student_id   = u.id
    WHERE i.professor_id = ?
      AND i.status = 'Pending'
    ORDER BY i.sent_date DESC
  `;

  runQuery(sql, [professorId], res, (err, results) => {
    if (err) {
      console.error('getInvitations error:', err);
      return res.status(500).json({ success: false, message: 'Σφάλμα ανάκτησης προσκλήσεων' });
    }
    return res.status(200).json({ success: true, invitations: results });
  });
};

/* =========================================================
   2) Απάντηση σε πρόσκληση (Accepted / Rejected)
   ========================================================= */
exports.respondToInvitation = (req, res) => {
  const professorId = requireProfessor(req, res);
  if (!professorId) return;

  const { invitationId, status } = req.body; // "Accepted" ή "Rejected"

  if (!['Accepted', 'Rejected'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Λανθασμένο status' });
  }

  // Ενημέρωση της πρόσκλησης μόνο αν είναι Pending
  const updateInvitationQuery = `
    UPDATE Invitations
    SET status = ?, response_date = NOW()
    WHERE id = ? AND status = 'Pending'
  `;

  db.query(updateInvitationQuery, [status, invitationId], (err, updateResult) => {
    if (err) {
      console.error('Error updating invitation:', err);
      return res.status(500).json({ success: false, message: 'Σφάλμα ενημέρωσης πρόσκλησης' });
    }
    if (updateResult.affectedRows === 0) {
      return res.status(400).json({ success: false, message: 'Δεν βρέθηκε pending πρόσκληση' });
    }

    // Αν απορρίφθηκε, τελειώσαμε
    if (status === 'Rejected') {
      return res.status(200).json({ success: true, message: 'Invitation rejected.' });
    }

    // ===================== Accepted =====================

    // Φέρε λεπτομέρειες (assignment_id, professor_id) από την ίδια την πρόσκληση
    const getInvitationDetails = `SELECT assignment_id, professor_id FROM Invitations WHERE id = ? LIMIT 1`;
    db.query(getInvitationDetails, [invitationId], (errDet, invResults) => {
      if (errDet || invResults.length === 0) {
        console.error('Error fetching invitation details:', errDet);
        return res.status(500).json({ success: false, message: 'Σφάλμα στην ανάκτηση λεπτομερειών πρόσκλησης.' });
      }

      const { assignment_id, professor_id } = invResults[0];

      // Μην προσθέσεις διπλό μέλος επιτροπής
      const existsSql = `
        SELECT 1 FROM CommitteeMembers
        WHERE assignment_id = ? AND professor_id = ?
        LIMIT 1
      `;
      db.query(existsSql, [assignment_id, professor_id], (eExists, rExists) => {
        if (eExists) {
          console.error('Error checking existing committee member:', eExists);
          return res.status(500).json({ success: false, message: 'Σφάλμα ελέγχου επιτροπής.' });
        }

        // Συνάρτηση που εκτελείται είτε μετά από επιτυχές insert είτε αν ήδη υπήρχε μέλος
        const afterInsertOrSkip = () => {
          // Πόσα ΜΕΛΗ (role='Member') υπάρχουν τώρα;
          const countMembersSql = `
            SELECT COUNT(*) AS count
            FROM CommitteeMembers
            WHERE assignment_id = ? AND role = 'Member'
          `;
          db.query(countMembersSql, [assignment_id], (errCnt, countResults) => {
            if (errCnt) {
              console.error('Error counting committee members:', errCnt);
              return res.status(500).json({ success: false, message: 'Σφάλμα στον υπολογισμό της επιτροπής.' });
            }

            const memberCount = countResults[0].count;

            // Όταν γίνουν 2 μέλη (μαζί με Supervisor -> τριμελής), τότε:
            //  - κάνε το Assignment Active (αν είναι ακόμη Pending)
            //  - όρισε start_date = σήμερα
            //  - γράψε ιστορικό "Active"
            //  - καθάρισε τις υπόλοιπες Pending προσκλήσεις της ίδιας ανάθεσης
            if (memberCount === 2) {
              const nowActive = `
                UPDATE Assignments
                SET status = 'Active', start_date = CURDATE()
                WHERE id = ? AND status = 'Pending'
              `;
              db.query(nowActive, [assignment_id], (errUpd) => {
                if (errUpd) {
                  console.error('Error updating assignment status/start_date:', errUpd);
                  return res.status(500).json({ success: false, message: 'Σφάλμα στην ενημέρωση της κατάστασης της διπλωματικής.' });
                }

                const insHist = `
                  INSERT INTO AssignmentStatusHistory (assignment_id, status, reason, gs_arithmos, gs_etos)
                  VALUES (?, 'Active', 'Αυτόματη οριστική ανάθεση (συμπληρώθηκε τριμελής)', 0, YEAR(CURDATE()))
                `;
                db.query(insHist, [assignment_id], (hErr) => {
                  if (hErr) {
                    console.error('Error inserting status history:', hErr);
                    // συνεχίζουμε παρ' όλα αυτά
                  }

                  const deletePending = `
                    DELETE FROM Invitations
                    WHERE assignment_id = ? AND status = 'Pending'
                  `;
                  db.query(deletePending, [assignment_id], (delErr) => {
                    if (delErr) {
                      console.error('Error deleting pending invitations:', delErr);
                      return res.status(500).json({ success: false, message: 'Σφάλμα στη διαγραφή των υπόλοιπων προσκλήσεων.' });
                    }
                    return res.status(200).json({
                      success: true,
                      message: 'Invitation accepted. Η διπλωματική έγινε Active, ορίστηκε start_date και ενημερώθηκε το ιστορικό.'
                    });
                  });
                });
              });
            } else {
              // Ακόμη δεν συμπληρώθηκε η τριμελής
              return res.status(200).json({
                success: true,
                message: `Invitation accepted. Περιμένετε την αποδοχή των υπολοίπων καθηγητών. (Μέλη επιτροπής: ${memberCount})`
              });
            }
          });
        };

        // Αν ΔΕΝ υπάρχει ήδη ο καθηγητής ως μέλος -> κάνε εισαγωγή ως 'Member', αλλιώς προχώρα
        if (!rExists.length) {
          const insertMemberSql = `
            INSERT INTO CommitteeMembers (assignment_id, professor_id, role)
            VALUES (?, ?, 'Member')
          `;
          db.query(insertMemberSql, [assignment_id, professor_id], (errIns) => {
            if (errIns) {
              console.error('Error inserting committee member:', errIns);
              return res.status(500).json({ success: false, message: 'Σφάλμα εισαγωγής μέλους επιτροπής.' });
            }
            afterInsertOrSkip();
          });
        } else {
          afterInsertOrSkip();
        }
      });
    });
  });
};
