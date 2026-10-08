
const express      = require('express');
const router       = express.Router();
const invitations  = require('../controllers/invitationsController');

/* =========================================================
   Προσκλήσεις Επιτροπής (Καθηγητές)
   ========================================================= */

// Λίστα εκκρεμών (Pending) προσκλήσεων για τον τρέχοντα καθηγητή
router.get('/invitations', invitations.getInvitations);

// Απάντηση σε πρόσκληση (Accepted / Rejected)
router.post('/invitations/respond', invitations.respondToInvitation);

module.exports = router;
