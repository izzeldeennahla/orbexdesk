const express = require('express');
const router = express.Router();
const { login, changePassword, getFirebaseClientConfig } = require('../controllers/authController');
const { verifyToken } = require('../middlewares/auth');

router.get('/firebase-config', getFirebaseClientConfig);
router.post('/login', login);
router.post('/firebase-login', login);
router.post('/change-password', verifyToken, changePassword);

module.exports = router;