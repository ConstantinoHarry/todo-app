const bcrypt = require('bcryptjs');
const {
  findUserByEmail,
  createUser
} = require('../models/userModel');

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
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
    success
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
    success
  });
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

  if (password.length < 8) {
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
  logout
};
