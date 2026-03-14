const express = require('express');
const authController = require('../controllers/authController');
const { requireAuth, requireGuest } = require('../middleware/auth');

const router = express.Router();

router.get('/login', requireGuest, authController.renderLogin);
router.post('/login', requireGuest, authController.login);
router.post('/logout', requireAuth, authController.logout);

module.exports = router;
