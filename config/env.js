function parseBoolean(value, defaultValue = false) {
  if (typeof value !== 'string') {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') {
    return true;
  }

  if (normalized === 'false') {
    return false;
  }

  return defaultValue;
}

function parseNumber(value, defaultValue) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getNodeEnv() {
  return process.env.NODE_ENV || 'development';
}

function isProduction() {
  return getNodeEnv() === 'production';
}

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;

  if (isProduction()) {
    return getRequiredEnv('SESSION_SECRET');
  }

  return secret || 'change-me-in-production';
}

function getAppConfig() {
  return {
    nodeEnv: getNodeEnv(),
    isProduction: isProduction(),
    port: parseNumber(process.env.PORT, 3000),
    appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
    trustProxy: process.env.TRUST_PROXY || (isProduction() ? '1' : '0')
  };
}

function getDbConfig() {
  const useSsl = parseBoolean(process.env.DB_SSL, false);

  return {
    host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
    port: parseNumber(process.env.DB_PORT || process.env.MYSQLPORT, 3306),
    user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
    database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'todo_app',
    ssl: useSsl ? { rejectUnauthorized: parseBoolean(process.env.DB_SSL_REJECT_UNAUTHORIZED, true) } : undefined
  };
}

function getSecurityConfig() {
  const production = isProduction();

  return {
    sessionName: process.env.SESSION_NAME || 'todo.sid',
    sessionSecret: getSessionSecret(),
    sessionMaxAgeMs: parseNumber(process.env.SESSION_MAX_AGE_MS, 1000 * 60 * 60 * 8),
    sessionSameSite: process.env.SESSION_SAME_SITE || 'lax',
    sessionSecureCookie: parseBoolean(process.env.SESSION_SECURE_COOKIE, production),
    sessionDomain: process.env.SESSION_COOKIE_DOMAIN || undefined,
    authRateLimitWindowMs: parseNumber(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    authRateLimitMax: parseNumber(process.env.AUTH_RATE_LIMIT_MAX, 10),
    globalRateLimitWindowMs: parseNumber(process.env.GLOBAL_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    globalRateLimitMax: parseNumber(process.env.GLOBAL_RATE_LIMIT_MAX, 200)
  };
}

function validateProductionEnv() {
  if (!isProduction()) {
    return;
  }

  getRequiredEnv('SESSION_SECRET');

  if (!process.env.DB_HOST && !process.env.MYSQLHOST) {
    throw new Error('Missing DB host. Set DB_HOST or MYSQLHOST for production.');
  }

  if (!process.env.DB_USER && !process.env.MYSQLUSER) {
    throw new Error('Missing DB user. Set DB_USER or MYSQLUSER for production.');
  }

  if (!process.env.DB_NAME && !process.env.MYSQLDATABASE) {
    throw new Error('Missing DB name. Set DB_NAME or MYSQLDATABASE for production.');
  }
}

module.exports = {
  getAppConfig,
  getDbConfig,
  getSecurityConfig,
  validateProductionEnv
};
