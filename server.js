const path = require('path');
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const csrf = require('csurf');
const passport = require('passport');
const methodOverride = require('method-override');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const todoRoutes = require('./routes/todos');
const { requireAuth } = require('./middleware/auth');
const configurePassport = require('./config/passport');
const pool = require('./config/db');
const {
  getAppConfig,
  getDbConfig,
  getSecurityConfig,
  validateProductionEnv
} = require('./config/env');

const app = express();
const appConfig = getAppConfig();
const securityConfig = getSecurityConfig();
const dbConfig = getDbConfig();
const PORT = appConfig.port;
const isProduction = appConfig.isProduction;

validateProductionEnv();

configurePassport();
const csrfProtection = csrf();
const globalLimiter = rateLimit({
  windowMs: securityConfig.globalRateLimitWindowMs,
  max: securityConfig.globalRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests. Please try again later.'
});
const authLimiter = rateLimit({
  windowMs: securityConfig.authRateLimitWindowMs,
  max: securityConfig.authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many auth attempts. Please try again shortly.'
});

const sessionStore = new MySQLStore({
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database,
  createDatabaseTable: true,
  clearExpired: true,
  checkExpirationInterval: 15 * 60 * 1000,
  expiration: securityConfig.sessionMaxAgeMs
});

if (isProduction) {
  app.set('trust proxy', appConfig.trustProxy);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);
app.use(globalLimiter);
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(
  session({
    name: securityConfig.sessionName,
    secret: securityConfig.sessionSecret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: securityConfig.sessionSameSite,
      secure: securityConfig.sessionSecureCookie,
      domain: securityConfig.sessionDomain,
      maxAge: securityConfig.sessionMaxAgeMs
    }
  })
);
app.use(passport.initialize());
app.use(csrfProtection);

app.get('/healthz', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    env: appConfig.nodeEnv
  });
});

app.get('/readyz', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    return res.status(200).json({ status: 'ready' });
  } catch (error) {
    return res.status(503).json({ status: 'not-ready' });
  }
});

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
    visibleTodos: [],
    selectedView: 'required',
    selectedEnergyFilter: 'all',
    selectedDueFilter: 'all',
    counts: { total: 0, completed: 0, open: 0 },
    error: 'Page not found.',
    success: '',
    returnTo: '/'
  });
});

app.listen(PORT, () => {
  console.log(`Server running on ${appConfig.appBaseUrl}`);
});