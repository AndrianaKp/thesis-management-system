
const router = require('express').Router();
const path   = require('path');
const fs     = require('fs');
const multer = require('multer');
const sec    = require('../controllers/secretariatController');

/* =========================================================
   Multer: αποδοχή ΜΟΝΟ JSON για εισαγωγή χρηστών
   - input name: "jsonFile"
   - αποθήκευση προσωρινά σε /uploads/tmp
   ========================================================= */

const tmpDir = path.join(__dirname, '..', 'uploads', 'tmp');
fs.mkdirSync(tmpDir, { recursive: true }); // εξασφάλιση ύπαρξης φακέλου

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, tmpDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.json';
    cb(null, `import_${Date.now()}${ext}`);
  }
});

// δέχεται application/json ή αρχεία που λήγουν σε .json
const fileFilter = (req, file, cb) => {
  const ok = file.mimetype === 'application/json' || /\.json$/i.test(file.originalname || '');
  cb(ok ? null : new Error('Μόνο αρχεία JSON επιτρέπονται.'), ok);
};

const uploadJson = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

/* =========================================================
   Secretariat endpoints
   ========================================================= */

// Αναθέσεις για Γραμματεία
router.get('/assignments',       sec.getActiveAssignments);
router.get('/assignments/:id',   sec.getAssignmentDetails);

// Καταχώρηση ΑΠ/ΓΣ & ακύρωση ανάθεσης
router.post('/assignments/:id/gs-ap',  sec.submitApPraktiko);
router.post('/assignments/:id/cancel', sec.cancelAssignment);

// Περαιτέρω έλεγχος και ολοκλήρωση διπλωματικής
router.get('/assignments/:id/complete/eligibility', sec.checkCompletionEligibility);
router.post('/assignments/:id/complete',            sec.completeAssignment);

// Εισαγωγή χρηστών από JSON (input field: "jsonFile")
router.post('/import-json', uploadJson.single('jsonFile'), sec.importUsersFromJson);

module.exports = router;
