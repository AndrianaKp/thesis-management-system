
const express = require('express');
const router  = express.Router();

const ctrl = require('../controllers/assignmentsController');

/* =========================================================
   Αναζήτηση / Ανάθεση / Αλλαγή / Ακύρωση (Pending)
   ========================================================= */
// Αναζήτηση φοιτητή (με επιστροφή τελευταίας μη-Canceled ανάθεσης)
router.get('/search-student', ctrl.searchStudent);
// Νέα ανάθεση θέματος (δημιουργεί Pending + Supervisor)
router.post('/assign-topic', ctrl.assignTopic);
// Ακύρωση Pending ανάθεσης (status -> Canceled)
router.post('/cancel-assignment', ctrl.cancelPendingAssignment);
// Αλλαγή θέματος όσο η ανάθεση είναι Pending
router.post('/change-assignment', ctrl.changeAssignment);

/* =========================================================
   Θέματα καθηγητή
   - dropdown για ανάθεση
   - λίστα θεμάτων του καθηγητή
   ========================================================= */
router.get('/professor-topics', ctrl.getProfessorTopics);

/* =========================================================
   Λίστα διπλωματικών / Λεπτομέρειες / Εξαγωγή
   ========================================================= */
router.get('/theses-list', ctrl.getThesesList);
router.get('/thesis-details/:assignmentId(\\d+)', ctrl.getThesisDetails);
router.get('/export-theses-list', ctrl.exportThesesList);

/* =========================================================
   Προσκεκλημένα μέλη & ακύρωση από επιβλέποντα
   ========================================================= */
// Λίστα προσκεκλημένων μελών για συγκεκριμένη ανάθεση
router.get('/assignments/:assignmentId(\\d+)/invited-members', ctrl.viewInvitedMembers);
// Ακύρωση Pending από επιβλέποντα (διαφορετικό endpoint από το γενικό Pending cancel)
router.post('/assignments/cancel', ctrl.cancelAssignmentByProfessor);

/* =========================================================
   Σημειώσεις καθηγητή (ανά ανάθεση)
   ========================================================= */
router.post('/notes', ctrl.createNote);
router.get('/my-notes', ctrl.getMyNotes);

/* =========================================================
   Αλλαγές κατάστασης (status)
   - Ακύρωση μετά από 2 έτη
   - Θέση σε Υπό Εξέταση
   ========================================================= */
router.post('/cancel-after-two-years', ctrl.cancelAfterTwoYears);
router.post('/set-under-review', ctrl.setUnderReview);

/* =========================================================
   Ανακοινώσεις
   - βάζουμε ΠΡΩΤΑ το /can/... ώστε να μην “καταπίνεται” από το /:assignmentId
   ========================================================= */
router.get('/announcements/can/:assignmentId(\\d+)', ctrl.canAnnounce);
router.post('/announcements', ctrl.createAnnouncement);
router.get('/announcements/:assignmentId(\\d+)', ctrl.getAnnouncement);

/* =========================================================
   Δημόσιες ανακοινώσεις (χωρίς auth)
   ========================================================= */
router.get('/public-announcements', ctrl.getPublicAnnouncements);

/* =========================================================
   Βαθμολογία
   ========================================================= */
// Ενεργοποίηση καταχώρησης βαθμών (έλεγχοι προϋποθέσεων server-side)
router.post('/enable-grading', ctrl.enableGrading);
// Καταχώρηση βαθμού μέλους/επιβλέποντα
router.post('/submit-grade', ctrl.submitGrade);
// Λήψη βαθμών ανά ανάθεση
router.get('/grades/:assignmentId(\\d+)', ctrl.getGrades);

module.exports = router;
