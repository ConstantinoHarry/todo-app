const path = require('path');
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const csrf = require('csurf');
const methodOverride = require('method-override');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const todoRoutes = require('./routes/todos');
const { requireAuth } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const csrfProtection = csrf();
const authLimiter = rateLimit({
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many auth attempts. Please try again shortly.'
});

const sessionStore = new MySQLStore({
  host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
  port: Number(process.env.DB_PORT || process.env.MYSQLPORT) || 3306,
  user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
  password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
  database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'todo_app',
  createDatabaseTable: true
});

if (isProduction) {
  app.set('trust proxy', 1);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(
  session({
    name: 'todo.sid',
    secret: process.env.SESSION_SECRET || 'change-me-in-production',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);
app.use(csrfProtection);

app.use('/login', authLimiter);
app.use('/register', authLimiter);
app.use('/forgot-password', authLimiter);
app.use('/reset-password', authLimiter);

app.use((req, res, next) => {
  res.locals.isAuthenticated = Boolean(req.session && req.session.user);
  res.locals.currentUser = req.session ? req.session.user : null;
  res.locals.csrfToken = req.csrfToken();
  next();
});

app.use('/', authRoutes);
app.use('/', requireAuth, todoRoutes);

app.use((error, req, res, next) => {
  if (error && error.code === 'EBADCSRFTOKEN') {
    const fallbackPath = req.session && req.session.user ? '/' : '/login';
    const queryChar = fallbackPath.includes('?') ? '&' : '?';
    return res.redirect(
      `${fallbackPath}${queryChar}error=${encodeURIComponent('Your session expired. Please try again.')}`
    );
  }

  return next(error);
});

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