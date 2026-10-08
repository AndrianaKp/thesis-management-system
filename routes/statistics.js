const express = require('express');
const router = express.Router();
const statsController = require('../controllers/statsController');

router.get('/professor-stats', statsController.getProfessorStats);

module.exports = router;
