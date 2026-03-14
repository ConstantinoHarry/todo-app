const express = require('express');
const authController = require('../controllers/authController');
const { requireAuth, requireGuest } = require('../middleware/auth');

const router = express.Router();

router.get('/register', requireGuest, authController.renderRegister);
router.post('/register', requireGuest, authController.register);
router.get('/login', requireGuest, authController.renderLogin);
router.post('/login', requireGuest, authController.login);
router.get('/auth/providers', authController.getProviderStatus);
router.get('/auth/google', requireGuest, authController.startGoogleAuth);
router.get('/auth/google/callback', requireGuest, authController.googleAuthCallback);
router.get('/auth/github', requireGuest, authController.startGithubAuth);
router.get('/auth/github/callback', requireGuest, authController.githubAuthCallback);
router.get('/forgot-password', requireGuest, authController.renderForgotPassword);
router.post('/forgot-password', requireGuest, authController.requestPasswordReset);
router.get('/reset-password/:token', requireGuest, authController.renderResetPassword);
router.post('/reset-password/:token', requireGuest, authController.resetPassword);
router.post('/logout', requireAuth, authController.logout);

module.exports = router;
