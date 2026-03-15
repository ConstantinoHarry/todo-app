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
const { startReminderScheduler } = require('./services/reminderService');
const { initializeSchema, getSchemaStatus } = require('./services/schemaService');
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

    const schemaStatus = getSchemaStatus();
    if (!schemaStatus.ready) {
      return res.status(503).json({
        status: 'not-ready',
        schema: schemaStatus
      });
    }

    return res.status(200).json({ status: 'ready' });
  } catch (error) {
    return res.status(503).json({ status: 'not-ready' });
  }
});

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

app.use('/login', authLimiter);
app.use('/register', authLimiter);

app.use((req, res, next) => {
  res.locals.isAuthenticated = Boolean(req.session && req.session.user);
  res.locals.currentUser = req.session ? req.session.user : null;
  res.locals.csrfToken = req.csrfToken();
  next();
});

app.use('/', authRoutes);
app.use('/', requireAuth, todoRoutes);

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  if (error && error.code === 'EBADCSRFTOKEN') {
    const fallbackPath = req.session && req.session.user ? '/' : '/login';
    const queryChar = fallbackPath.includes('?') ? '&' : '?';
    return res.redirect(
      `${fallbackPath}${queryChar}error=${encodeURIComponent('Your session expired. Please try again.')}`
    );
  }

  const databaseErrorCodes = new Set([
    'ER_ACCESS_DENIED_ERROR',
    'ER_BAD_DB_ERROR',
    'ER_NO_SUCH_TABLE',
    'ECONNREFUSED',
    'PROTOCOL_CONNECTION_LOST'
  ]);

  if (error && databaseErrorCodes.has(error.code)) {
    console.error('Database/session error:', error.code);

    if (req.path === '/readyz') {
      return res.status(503).json({ status: 'not-ready', error: error.code });
    }

    if (req.accepts('json')) {
      return res.status(503).json({
        error: 'Service temporarily unavailable. Please retry shortly.'
      });
    }

    return res.status(503).send('Service temporarily unavailable. Please retry shortly.');
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
    selectedProgressFilter: 'all',
    selectedCalendarMonth: new Date().toISOString().slice(0, 7),
    selectedCalendarDate: '',
    counts: { total: 0, completed: 0, open: 0 },
    progressSummary: { total: 0, completed: 0, rate: 0 },
    calendarView: {
      monthKey: new Date().toISOString().slice(0, 7),
      monthLabel: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      weekdayLabels: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      weeks: [],
      todayMonthKey: new Date().toISOString().slice(0, 7),
      todayDateKey: new Date().toISOString().slice(0, 10),
      prevMonthKey: new Date().toISOString().slice(0, 7),
      nextMonthKey: new Date().toISOString().slice(0, 7),
      scheduledTaskCount: 0
    },
    calendarAgenda: null,
    error: 'Page not found.',
    success: '',
    returnTo: '/'
  });
});

async function startServer() {
  const schemaReady = await initializeSchema();

  if (!schemaReady) {
    const schemaStatus = getSchemaStatus();
    console.error('Database schema initialization failed:', schemaStatus.errorCode || schemaStatus.errorMessage);
  }

  app.listen(PORT, () => {
    console.log(`Server running on ${appConfig.appBaseUrl}`);
    startReminderScheduler();
  });
}

startServer();