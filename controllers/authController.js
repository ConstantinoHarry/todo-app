const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const passport = require('passport');
const {
  findUserByEmail,
  createUser,
  setPasswordResetToken,
  findUserByResetTokenHash,
  clearPasswordResetToken,
  updateUserPassword
} = require('../models/userModel');

const PASSWORD_MIN_LENGTH = 8;
const RESET_TOKEN_TTL_MINUTES = Number(process.env.RESET_TOKEN_TTL_MINUTES) || 60;

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getResetBaseUrl(req) {
  if (process.env.RESET_PASSWORD_URL_BASE) {
    return process.env.RESET_PASSWORD_URL_BASE;
  }

  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL;
  }

  return `${req.protocol}://${req.get('host')}`;
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        return reject(error);
      }
      return resolve();
    });
  });
}

function renderLogin(req, res) {
  if (req.session && req.session.user) {
    return res.redirect('/');
  }

  const error = typeof req.query.error === 'string' ? req.query.error : '';
  const success = typeof req.query.success === 'string' ? req.query.success : '';

  res.render('login', {
    title: 'Login | Todo App',
    error,
    success,
    googleEnabled: isGoogleConfigured(),
    githubEnabled: isGithubConfigured()
  });
}

function renderRegister(req, res) {
  if (req.session && req.session.user) {
    return res.redirect('/');
  }

  const error = typeof req.query.error === 'string' ? req.query.error : '';
  const success = typeof req.query.success === 'string' ? req.query.success : '';

  res.render('register', {
    title: 'Create Account | Todo App',
    error,
    success,
    googleEnabled: isGoogleConfigured(),
    githubEnabled: isGithubConfigured()
  });
}

function getProviderStatus(req, res) {
  return res.json({
    google: isGoogleConfigured(),
    github: isGithubConfigured()
  });
}

function isGoogleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function isGithubConfigured() {
  return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

function startGoogleAuth(req, res, next) {
  if (!isGoogleConfigured()) {
    return res.redirect(
      '/login?error=' +
        encodeURIComponent('Google login is not configured yet. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.')
    );
  }

  return passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account'
  })(req, res, next);
}

function startGithubAuth(req, res, next) {
  if (!isGithubConfigured()) {
    return res.redirect(
      '/login?error=' +
        encodeURIComponent('GitHub login is not configured yet. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.')
    );
  }

  return passport.authenticate('github', {
    scope: ['user:email']
  })(req, res, next);
}

function handleSocialAuthCallback(strategyName, providerLabel) {
  return (req, res, next) => {
    passport.authenticate(strategyName, async (error, user) => {
      if (error || !user) {
        console.error(`${providerLabel} login failed:`, error || 'No user returned');
        return res.redirect('/login?error=' + encodeURIComponent(`Unable to login with ${providerLabel}.`));
      }

      try {
        await regenerateSession(req);
        req.session.user = {
          id: user.id,
          email: user.email,
          loginAt: new Date().toISOString()
        };
        return res.redirect('/?success=' + encodeURIComponent(`Logged in with ${providerLabel}.`));
      } catch (sessionError) {
        console.error(`${providerLabel} session setup failed:`, sessionError);
        return res.redirect('/login?error=' + encodeURIComponent('Unable to complete login right now.'));
      }
    })(req, res, next);
  };
}

const googleAuthCallback = handleSocialAuthCallback('google', 'Google');
const githubAuthCallback = handleSocialAuthCallback('github', 'GitHub');

function renderForgotPassword(req, res) {
  if (req.session && req.session.user) {
    return res.redirect('/');
  }

  const error = typeof req.query.error === 'string' ? req.query.error : '';
  const success = typeof req.query.success === 'string' ? req.query.success : '';

  return res.render('forgot-password', {
    title: 'Forgot Password | Todo App',
    error,
    success
  });
}

async function requestPasswordReset(req, res) {
  const email = normalizeEmail(req.body.email);

  if (!email) {
    return res.redirect('/forgot-password?error=' + encodeURIComponent('Email is required.'));
  }

  const successMessage = 'If that email exists, we sent a reset link.';

  try {
    const user = await findUserByEmail(email);

    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashResetToken(rawToken);
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

      await setPasswordResetToken(user.id, tokenHash, expiresAt);

      const resetLink = `${getResetBaseUrl(req)}/reset-password/${rawToken}`;
      console.log(`Password reset link for ${email}: ${resetLink}`);
    }

    return res.redirect('/forgot-password?success=' + encodeURIComponent(successMessage));
  } catch (error) {
    console.error('Failed to request password reset:', error);
    return res.redirect('/forgot-password?error=' + encodeURIComponent('Unable to process request right now.'));
  }
}

async function renderResetPassword(req, res) {
  if (req.session && req.session.user) {
    return res.redirect('/');
  }

  const token = typeof req.params.token === 'string' ? req.params.token.trim() : '';
  const tokenHash = hashResetToken(token);
  const queryError = typeof req.query.error === 'string' ? req.query.error : '';
  const querySuccess = typeof req.query.success === 'string' ? req.query.success : '';

  try {
    const user = token ? await findUserByResetTokenHash(tokenHash) : null;

    if (!user || !user.reset_password_expires_at || new Date(user.reset_password_expires_at) < new Date()) {
      return res.render('reset-password', {
        title: 'Reset Password | Todo App',
        error: queryError || 'This reset link is invalid or has expired.',
        success: querySuccess,
        token: '',
        showForm: false
      });
    }

    return res.render('reset-password', {
      title: 'Reset Password | Todo App',
      error: queryError,
      success: querySuccess,
      token,
      showForm: true
    });
  } catch (error) {
    console.error('Failed to render reset password page:', error);
    return res.render('reset-password', {
      title: 'Reset Password | Todo App',
      error: 'Unable to verify reset link right now.',
      success: '',
      token: '',
      showForm: false
    });
  }
}

async function resetPassword(req, res) {
  const token = typeof req.params.token === 'string' ? req.params.token.trim() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const confirmPassword = typeof req.body.confirmPassword === 'string' ? req.body.confirmPassword : '';

  if (!token) {
    return res.redirect('/forgot-password?error=' + encodeURIComponent('Invalid reset token.'));
  }

  if (!password || !confirmPassword) {
    return res.redirect(`/reset-password/${token}?error=` + encodeURIComponent('All fields are required.'));
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return res.redirect(`/reset-password/${token}?error=` + encodeURIComponent('Password must be at least 8 characters long.'));
  }

  if (password !== confirmPassword) {
    return res.redirect(`/reset-password/${token}?error=` + encodeURIComponent('Passwords do not match.'));
  }

  try {
    const tokenHash = hashResetToken(token);
    const user = await findUserByResetTokenHash(tokenHash);

    if (!user || !user.reset_password_expires_at || new Date(user.reset_password_expires_at) < new Date()) {
      if (user) {
        await clearPasswordResetToken(user.id);
      }
      return res.redirect('/forgot-password?error=' + encodeURIComponent('This reset link is invalid or has expired.'));
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await updateUserPassword(user.id, passwordHash);
    await clearPasswordResetToken(user.id);

    return res.redirect('/login?success=' + encodeURIComponent('Password reset successful. Please login.'));
  } catch (error) {
    console.error('Failed to reset password:', error);
    return res.redirect(`/reset-password/${token}?error=` + encodeURIComponent('Unable to reset password right now.'));
  }
}

async function register(req, res) {
  const email = normalizeEmail(req.body.email);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const confirmPassword = typeof req.body.confirmPassword === 'string' ? req.body.confirmPassword : '';

  if (!email || !password || !confirmPassword) {
    return res.redirect('/register?error=' + encodeURIComponent('All fields are required.'));
  }

  if (!email.includes('@')) {
    return res.redirect('/register?error=' + encodeURIComponent('Please provide a valid email address.'));
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return res.redirect('/register?error=' + encodeURIComponent('Password must be at least 8 characters long.'));
  }

  if (password !== confirmPassword) {
    return res.redirect('/register?error=' + encodeURIComponent('Passwords do not match.'));
  }

  try {
    const existingUser = await findUserByEmail(email);

    if (existingUser) {
      return res.redirect('/register?error=' + encodeURIComponent('Email is already registered.'));
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await createUser(email, passwordHash);

    return res.redirect('/login?success=' + encodeURIComponent('Account created successfully. Please login.'));
  } catch (error) {
    console.error('Failed to register user:', error);
    return res.redirect('/register?error=' + encodeURIComponent('Unable to create account right now.'));
  }
}

async function login(req, res) {
  const email = normalizeEmail(req.body.email);
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!email || !password) {
    return res.redirect('/login?error=' + encodeURIComponent('Email and password are required.'));
  }

  try {
    const user = await findUserByEmail(email);
    if (!user) {
      return res.redirect('/login?error=' + encodeURIComponent('Invalid email or password.'));
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.redirect('/login?error=' + encodeURIComponent('Invalid email or password.'));
    }

    await regenerateSession(req);
    req.session.user = {
      id: user.id,
      email: user.email,
      loginAt: new Date().toISOString()
    };

    return res.redirect('/?success=' + encodeURIComponent('Login successful. Welcome back.'));
  } catch (error) {
    console.error('Failed to login user:', error);
    return res.redirect('/login?error=' + encodeURIComponent('Unable to login right now.'));
  }
}

function logout(req, res) {
  if (!req.session) {
    return res.redirect('/login?success=' + encodeURIComponent('You are logged out.'));
  }

  return req.session.destroy(() => {
    res.clearCookie('todo.sid');
    res.redirect('/login?success=' + encodeURIComponent('You have been logged out.'));
  });
}

module.exports = {
  renderRegister,
  register,
  renderLogin,
  login,
  logout,
  getProviderStatus,
  startGoogleAuth,
  googleAuthCallback,
  startGithubAuth,
  githubAuthCallback,
  renderForgotPassword,
  requestPasswordReset,
  renderResetPassword,
  resetPassword
};
