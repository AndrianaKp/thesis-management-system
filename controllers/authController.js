
const { validationResult } = require('express-validator');
const db = require('../db'); // κοινό MySQL pool

/* =========================================================
   Helpers
   ========================================================= */

/** Επιστρέφει true μόνο για "ασφαλή" relative URLs (προστασία από open redirect) */
function isSafeRelative(next) {
  return typeof next === 'string'
    && next.startsWith('/')
    && !next.startsWith('//'); // απορρίπτει
}

/** Dashboard fallback ανά ρόλο χρήστη */
function roleToDashboard(role) {
  switch (role) {
    case 'Professor': return '/professor-dashboard';
    case 'Student':   return '/student-dashboard';
    case 'Admin':     return '/admin-dashboard';
    default:          return '/';
  }
}

/* =========================================================
   Login
   ========================================================= */
exports.login = (req, res) => {
  // 1) Validation (express-validator από route-level)
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { email, password, next } = req.body;

  // 2) Απλοί έλεγχοι πεδίων
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required' });
  }

  // 3) Αναζήτηση χρήστη
  // TODO: Χρησιμοποίησε bcrypt & hashed passwords.
  const sql = 'SELECT id, role, name, email FROM Users WHERE email = ? AND password = ?';
  db.query(sql, [email, password], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }

    if (!results.length) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const user = results[0];
    const role = user.role || 'User';

    // 4) Ασφαλές redirect (προτιμάμε relative "next", αλλιώς fallback ανά ρόλο)
    const safeNext = isSafeRelative(next) ? next : '';
    const fallback = roleToDashboard(role);

    // 5) Καθαρό session πριν αποθηκεύσουμε user (προστασία από fixation)
    req.session.regenerate((regenErr) => {
      if (regenErr) {
        console.error('Session regenerate error:', regenErr);
        return res.status(500).json({ success: false, message: 'Session error' });
      }

      // Αποθήκευση ελάχιστων στοιχείων στο session
      req.session.user = {
        id: user.id,
        role,
        name: user.name,
        email: user.email
      };

      // 6) Τελική απάντηση 
      return res.json({
        success: true,
        message: 'Login successful',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role
        },
        redirectUrl: safeNext || fallback
      });
    });
  });
};
