
const db = require('../db');

/* =========================================================
   Helpers
   ========================================================= */

/** Επιστρέφει το id του Professor από το session ή απαντά 403 και γυρνά null. */
function requireProfessor(req, res) {
  const u = req.session?.user;
  if (!u || u.role !== 'Professor') {
    res.status(403).json({ success: false, message: 'Μη εξουσιοδοτημένη πρόσβαση.' });
    return null;
  }
  return u.id;
}

/** Εκτελεί ένα query και επιστρέφει Promise<number> με την αριθμητική τιμή (ή 0). */
function querySingleNumber(sql, professorId) {
  return new Promise((resolve, reject) => {
    db.query(sql, [professorId], (err, rows) => {
      if (err) return reject(err);
      resolve(Number(rows?.[0]?.value ?? 0));
    });
  });
}

/* =========================================================
   GET /api/professor-stats
   Επιστρέφει συγκεντρωτικά στατιστικά για τον Professor του session.
   ========================================================= */
exports.getProfessorStats = async (req, res) => {
  const professorId = requireProfessor(req, res);
  if (!professorId) return;


  const queries = {
    // Μ.Ο. χρόνου περάτωσης (Completed + έγκυρες ημερομηνίες)
    avgTimeSupervisor: `
      SELECT COALESCE(AVG(DATEDIFF(a.completed_date, a.start_date)), 0) AS value
      FROM Assignments a
      JOIN CommitteeMembers cm ON a.id = cm.assignment_id
      WHERE cm.professor_id = ?
        AND cm.role = 'Supervisor'
        AND a.status = 'Completed'
        AND a.start_date IS NOT NULL
        AND a.completed_date IS NOT NULL
    `,
    avgTimeMember: `
      SELECT COALESCE(AVG(DATEDIFF(a.completed_date, a.start_date)), 0) AS value
      FROM Assignments a
      JOIN CommitteeMembers cm ON a.id = cm.assignment_id
      WHERE cm.professor_id = ?
        AND cm.role = 'Member'
        AND a.status = 'Completed'
        AND a.start_date IS NOT NULL
        AND a.completed_date IS NOT NULL
    `,

    // Μ.Ο. τελικού βαθμού (Completed + final_grade NOT NULL)
    avgGradeSupervisor: `
      SELECT COALESCE(AVG(g.final_grade), 0) AS value
      FROM Grades g
      JOIN Assignments a ON g.assignment_id = a.id
      JOIN CommitteeMembers cm ON a.id = cm.assignment_id
      WHERE cm.professor_id = ?
        AND cm.role = 'Supervisor'
        AND a.status = 'Completed'
        AND g.final_grade IS NOT NULL
    `,
    avgGradeMember: `
      SELECT COALESCE(AVG(g.final_grade), 0) AS value
      FROM Grades g
      JOIN Assignments a ON g.assignment_id = a.id
      JOIN CommitteeMembers cm ON a.id = cm.assignment_id
      WHERE cm.professor_id = ?
        AND cm.role = 'Member'
        AND a.status = 'Completed'
        AND g.final_grade IS NOT NULL
    `,

    // Σύνολο διπλωματικών 
    totalCountSupervisor: `
      SELECT COUNT(DISTINCT cm.assignment_id) AS value
      FROM CommitteeMembers cm
      WHERE cm.professor_id = ?
        AND cm.role = 'Supervisor'
    `,
    totalCountMember: `
      SELECT COUNT(DISTINCT cm.assignment_id) AS value
      FROM CommitteeMembers cm
      WHERE cm.professor_id = ?
        AND cm.role = 'Member'
    `
  };

  try {
    // Εκτέλεση όλων των queries παράλληλα, διατηρώντας τα ίδια keys
    const entries = await Promise.all(
      Object.entries(queries).map(async ([key, sql]) => {
        const value = await querySingleNumber(sql, professorId);
        return [key, value];
      })
    );

    const stats = Object.fromEntries(entries);
    return res.json({ success: true, stats });
  } catch (err) {
    console.error('getProfessorStats error:', err);
    return res.status(500).json({ success: false, message: 'Σφάλμα ανάκτησης στατιστικών.' });
  }
};
