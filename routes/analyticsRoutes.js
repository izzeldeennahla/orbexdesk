// routes/analyticsRoutes.js
const express = require('express');
const router = express.Router();
const { getAdvancedAnalytics } = require('../controllers/analyticsController');
const { verifyToken } = require('../middlewares/auth');

router.get('/', verifyToken, getAdvancedAnalytics);

module.exports = router;