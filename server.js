const path = require('path');
const express = require('express');
const session = require('express-session');
const methodOverride = require('method-override');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const todoRoutes = require('./routes/todos');
const { requireAuth } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(
  session({
    name: 'todo.sid',
    secret: process.env.SESSION_SECRET || 'change-me-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

app.use((req, res, next) => {
  res.locals.isAuthenticated = Boolean(req.session && req.session.user);
  res.locals.currentUser = req.session ? req.session.user : null;
  next();
});

app.use('/', authRoutes);
app.use('/', requireAuth, todoRoutes);

app.use((req, res) => {
  res.status(404).render('index', {
    title: 'Todo App',
    todos: [],
    openTodos: [],
    completedTodos: [],
    selectedEnergy: 'all',
    focusMode: false,
    search: '',
    energyBudget: { high: 3, medium: 2, low: 1 },
    counts: { total: 0, completed: 0, open: 0 },
    focusMessage: '',
    error: 'Page not found.',
    success: '',
    returnTo: '/'
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});