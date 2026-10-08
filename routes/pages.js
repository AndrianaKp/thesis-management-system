
const express = require('express');
const router  = express.Router();

/* =========================================================
   Middlewares για σελίδες/views
   ========================================================= */

/**
 * Απαιτεί login και συγκεκριμένο ρόλο.
 * - Αν δεν υπάρχει session.user -> redirect σε /login με ?next
 * - Αν δόθηκε role και δεν ταιριάζει -> redirect σε /unknown-role
 */
function requireRole(role) {
  return (req, res, next) => {
    const user = req.session && req.session.user;
    if (!user) {
      const nextUrl = encodeURIComponent(req.originalUrl || '/');
      return res.redirect(`/login?next=${nextUrl}`);
    }
    if (role && user.role !== role) {
      return res.redirect(`/unknown-role?need=${encodeURIComponent(role)}&as=${encodeURIComponent(user.role)}`);
    }
    next();
  };
}

/** Απενεργοποιεί caching για προστατευμένες σελίδες (history/back κτλ.) */
function noStore(req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}

/* =========================================================
   Δημόσιες σελίδες
   ========================================================= */

router.get('/', (req, res) => {
  res.render('home', {
    title: 'Home',
    bodyClass: 'page-home',
    styles: '<link rel="stylesheet" href="/home.css">'
  });
});

router.get('/login', (req, res) => {
  res.render('login', {
    title: 'Login',
    bodyClass: 'page-auth'
  });
});

router.get('/about', (req, res) => {
  res.render('about', { title: 'About – CEID', bodyClass: 'page-public' });
});

router.get('/contact', (req, res) => {
  res.render('contact', { title: 'Contact – CEID', bodyClass: 'page-public' });
});

/* =========================================================
   Προστατευμένες σελίδες (Dashboards)
   ========================================================= */

const sharedDashCss = '<link rel="stylesheet" href="/dashboard-shared.css">';

// Student
router.get('/student-dashboard', noStore, requireRole('Student'), (req, res) => {
  res.render('student-dashboard', {
    title: 'Student Dashboard',
    bodyClass: 'page-student',
    styles: sharedDashCss + '<link rel="stylesheet" href="/student-dashboard.css">'
  });
});

// Professor
router.get('/professor-dashboard', noStore, requireRole('Professor'), (req, res) => {
  res.render('professor-dashboard', {
    title: 'Professor Dashboard',
    bodyClass: 'page-professor',
    styles: sharedDashCss + '<link rel="stylesheet" href="/professor-dashboard.css">'
  });
});

// Admin
router.get('/admin-dashboard', noStore, requireRole('Admin'), (req, res) => {
  res.render('admin-dashboard', {
    title: 'Admin Dashboard',
    bodyClass: 'page-admin',
    styles: sharedDashCss + '<link rel="stylesheet" href="/admin-dashboard.css">'
  });
});

/* =========================================================
   Professor Stats 
   ========================================================= */

router.get('/professor-stats', noStore, requireRole('Professor'), (req, res) => {
  res.render('professor-stats', {
    title: 'Professor Stats',
    bodyClass: 'page-professor',
    styles: sharedDashCss
  });
});

/* =========================================================
   Άγνωστος/λάθος ρόλος & Πρακτικό (Admin-only)
   ========================================================= */

router.get('/unknown-role', (req, res) => {
  res.status(403).render('unknown-role', {
    title: 'Δεν έχετε δικαίωμα πρόσβασης',
    bodyClass: 'page-unknown',
    need: req.query.need || 'τη σελίδα',
    as: req.query.as || 'Άγνωστος'
  });
});

// Στατική έκδοση πρακτικού (Admin). Η δυναμική υπάρχει στο studentsController.viewPraktiko
router.get('/praktiko/:assignmentId', requireRole('Admin'), (req, res) => {
  res.render('praktiko', {
    layout: false,
    student_name   : '—',
    student_number : '—',
    exam_location  : '—',
    exam_date      : '—',
    exam_time      : '—',
    supervisor_name: '—',
    member1_name   : '—',
    member2_name   : '—',
    thesis_title   : '—',
    grade          : '—',
    grade1         : '—',
    grade2         : '—',
    grade3         : '—',
    final_grade    : '—'
  });
});

module.exports = router;
