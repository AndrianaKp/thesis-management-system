
const express = require('express');
const router = express.Router();

const submissions = require('../controllers/submissionsController');


router.get('/draft/:assignmentId', submissions.viewDraftForUnderReview);

module.exports = router;
