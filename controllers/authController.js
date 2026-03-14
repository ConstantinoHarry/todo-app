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

function login(req, res) {
  const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  const demoEmail = process.env.AUTH_EMAIL || 'demo@todo-app.local';
  const demoPassword = process.env.AUTH_PASSWORD || 'todo1234';

  if (!email || !password) {
    return res.redirect('/login?error=' + encodeURIComponent('Email and password are required.'));
  }

  if (email !== demoEmail || password !== demoPassword) {
    return res.redirect('/login?error=' + encodeURIComponent('Invalid credentials. Try the demo credentials from README/.env.example.'));
  }

  req.session.user = {
    email,
    loginAt: new Date().toISOString()
  };

  return res.redirect('/?success=' + encodeURIComponent('Login successful. Welcome back.'));
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
  renderLogin,
  login,
  logout
};
