function renderLogin(req, res) {
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

  return res.redirect('/login?success=' + encodeURIComponent('Login successful (starter mode, no session yet).'));
}

module.exports = {
  renderLogin,
  login
};
