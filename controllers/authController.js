const bcrypt = require('bcryptjs');
const passport = require('passport');
const { isSchemaReady } = require('../services/schemaService');
const {
  findUserByEmail,
  createUser
} = require('../models/userModel');

const PASSWORD_MIN_LENGTH = 8;

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
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

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
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

function getSchemaNotReadyMessage() {
  return 'Login is temporarily unavailable while database setup completes. Please try again shortly.';
}

function startGoogleAuth(req, res, next) {
  if (!isSchemaReady()) {
    return res.redirect('/login?error=' + encodeURIComponent(getSchemaNotReadyMessage()));
  }

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
  if (!isSchemaReady()) {
    return res.redirect('/login?error=' + encodeURIComponent(getSchemaNotReadyMessage()));
  }

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
    if (!isSchemaReady()) {
      return res.redirect('/login?error=' + encodeURIComponent(getSchemaNotReadyMessage()));
    }

    passport.authenticate(strategyName, async (error, user) => {
      if (error || !user) {
        console.error(`${providerLabel} login failed:`, error || 'No user returned');
        const providerError = error && error.message ? ` ${error.message}` : '';
        return res.redirect(
          '/login?error=' + encodeURIComponent(`Unable to login with ${providerLabel}.${providerError}`)
        );
      }

      try {
        await regenerateSession(req);
        req.session.user = {
          id: user.id,
          email: user.email,
          loginAt: new Date().toISOString()
        };
        await saveSession(req);
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

async function register(req, res) {
  if (!isSchemaReady()) {
    return res.redirect('/register?error=' + encodeURIComponent(getSchemaNotReadyMessage()));
  }

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
  if (!isSchemaReady()) {
    return res.redirect('/login?error=' + encodeURIComponent(getSchemaNotReadyMessage()));
  }

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
    await saveSession(req);

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
  githubAuthCallback
};
