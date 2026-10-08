
const router = require('express').Router();
const topics = require('../controllers/topicsController');

router.post('/topics', topics.upload.single('file'), topics.createTopic);
router.put('/topics',  topics.upload.single('file'), topics.updateTopic);
router.get('/topics',  topics.getTopics);


module.exports = router;
