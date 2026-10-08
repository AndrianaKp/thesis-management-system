
const path   = require('path');
const fs     = require('fs');
const multer = require('multer');
const db     = require('../db'); // shared pool

/* =========================================================
   Uploads bootstrap
   ========================================================= */
const uploadsDir = path.join(__dirname, '../uploads');
fs.mkdirSync(uploadsDir, { recursive: true }); // idempotent

/* =========================================================
   Multer configuration
  
   ========================================================= */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const original = file?.originalname || 'file';
    const unique   = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}-${original}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});
exports.upload = upload; 

/* =========================================================
   Helpers
   ========================================================= */
function requireProfessor(req, res) {
  const u = req.session?.user;
  if (!u || u.role !== 'Professor') {
    res.status(403).json({ success: false, message: 'Unauthorized' });
    return null;
  }
  return u.id;
}

/* =========================================================
   Δημιουργία νέου θέματος
   Body: { title, description }, προαιρετικά αρχείο (attachment)
   ========================================================= */
exports.createTopic = (req, res) => {
  const professor_id = requireProfessor(req, res);
  if (!professor_id) return;

  const title       = (req.body?.title || '').trim();
  const description = (req.body?.description || '').trim();
  const file        = req.file ? req.file.filename : null;

  if (!title) {
    return res.status(400).json({ success: false, message: 'Title is required' });
  }

  const sql = `
    INSERT INTO Topics (title, description, attachment, professor_id)
    VALUES (?, ?, ?, ?)
  `;
  db.query(sql, [title, description || null, file, professor_id], (err) => {
    if (err) {
      console.error('createTopic DB error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
    return res.status(201).json({ success: true, message: 'Topic created successfully' });
  });
};

/* =========================================================
   Λήψη όλων των θεμάτων (public)
   ========================================================= */
exports.getTopics = (_req, res) => {
  db.query('SELECT * FROM Topics', (err, results) => {
    if (err) {
      console.error('getTopics DB error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
    return res.status(200).json({ success: true, topics: results });
  });
};

/* =========================================================
   Ενημέρωση υπάρχοντος θέματος
   Body: { id, title?, description? }, προαιρετικά νέο αρχείο
   - Αν δεν δόθηκε κανένα πεδίο για update, επιστρέφουμε 400
   ========================================================= */
exports.updateTopic = (req, res) => {
  const id = Number(req.body?.id);
  const title = (req.body?.title || '').trim();
  const description = (req.body?.description || '').trim();
  const file = req.file ? req.file.filename : null;

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ success: false, message: 'Topic ID is required' });
  }

  // Δυναμική κατασκευή UPDATE μόνο με όσα πεδία στάλθηκαν
  const sets = [];
  const vals = [];
  if (title)       { sets.push('title = ?');       vals.push(title); }
  if (description) { sets.push('description = ?'); vals.push(description); }
  if (file)        { sets.push('attachment = ?');  vals.push(file); }

  if (!sets.length) {
    return res.status(400).json({ success: false, message: 'No fields to update' });
  }

  const sql = `UPDATE Topics SET ${sets.join(', ')} WHERE id = ?`;
  vals.push(id);

  db.query(sql, vals, (err) => {
    if (err) {
      console.error('updateTopic DB error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
    return res.status(200).json({ success: true, message: 'Topic updated successfully' });
  });
};

/* =========================================================
   Λήψη θεμάτων για συγκεκριμένο καθηγητή (από session)
   ========================================================= */
exports.getProfessorTopics = (req, res) => {
  const professor_id = requireProfessor(req, res);
  if (!professor_id) return;

  db.query('SELECT * FROM Topics WHERE professor_id = ?', [professor_id], (err, results) => {
    if (err) {
      console.error('getProfessorTopics DB error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
    return res.status(200).json({ success: true, topics: results });
  });
};

/* =========================================================
   Λήψη θεμάτων για ανάθεση σε φοιτητές
   ========================================================= */
exports.getTopicsForAssignment = (req, res) => {
  const professorId = requireProfessor(req, res);
  if (!professorId) return;

  db.query('SELECT * FROM Topics WHERE professor_id = ?', [professorId], (err, results) => {
    if (err) {
      console.error('getTopicsForAssignment DB error:', err);
      return res.status(500).json({ success: false, message: 'Σφάλμα κατά τη λήψη των θεμάτων' });
    }
    return res.status(200).json({ success: true, topics: results });
  });
};
