
const router   = require('express').Router();
const students = require('../controllers/studentsController');

/* =========================================================
   Students routes
   ========================================================= */

// Προσωπικά στοιχεία & βασικές πληροφορίες
router.get('/thesis-details',       students.getThesisDetails);
router.put('/update-contact-info',  students.updateContactInfo);

// Αναθέσεις (τρέχουσα / για πρόχειρο)
router.get('/assignment',        students.getAssignmentId);
router.get('/draft-assignment',  students.getDraftAssignmentId);

// Επιτροπή
router.get('/teachers',   students.getTeachers);
router.post('/committee', students.addCommitteeMembers);

// Στοιχεία εξέτασης
router.post('/exam',         students.setExamDetails);
router.get('/exam-details',  students.getExamDetails);

// Πρακτικό (δημόσια προβολή για συγκεκριμένο assignment)
router.get('/praktiko/:assignmentId', students.viewPraktiko);

// Repository & υποβολές
router.post('/repository-link', students.saveRepositoryLink);
router.get('/submission',       students.getSubmission);

// Ανέβασμα πρόχειρου (PDF)
// - Χρησιμοποιεί το middleware από τον controller: students.uploadDraftMw
// - Το input field πρέπει να ταιριάζει με αυτό που περιμένει το middleware (π.χ. "pdf_draft")
router.post('/upload-draft', students.uploadDraftMw, students.uploadDraft);




module.exports = router;
