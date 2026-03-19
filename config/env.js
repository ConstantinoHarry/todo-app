function parseBoolean(value, defaultValue = false) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value !== 'string') {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

function parseNumber(value, defaultValue) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function parseDbUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return null;
  }

  try {
    const normalizedUrl = rawUrl.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
    const parsed = new URL(normalizedUrl);
    if (!parsed.protocol.startsWith('mysql')) {
      return null;
    }

    return {
      host: parsed.hostname,
      port: parseNumber(parsed.port, 3306),
      user: decodeURIComponent(parsed.username || ''),
      password: decodeURIComponent(parsed.password || ''),
      database: decodeURIComponent((parsed.pathname || '').replace(/^\//, ''))
    };
  } catch (error) {
    return null;
  }
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
  const urlConfig =
    parseDbUrl(process.env.DATABASE_URL) ||
    parseDbUrl(process.env.MYSQL_PUBLIC_URL) ||
    parseDbUrl(process.env.DATABASE_PUBLIC_URL) ||
    parseDbUrl(process.env.MYSQL_URL);

  const useSsl = parseBoolean(process.env.DB_SSL, false);

  if (urlConfig) {
    const fallbackDatabase = process.env.DB_NAME || process.env.MYSQLDATABASE || '';

    return {
      host: urlConfig.host,
      port: urlConfig.port,
      user: urlConfig.user,
      password: urlConfig.password,
      database: urlConfig.database || fallbackDatabase,
      ssl: useSsl ? { rejectUnauthorized: parseBoolean(process.env.DB_SSL_REJECT_UNAUTHORIZED, true) } : undefined
    };
  }

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

function getMailConfig() {
  const normalizedHost =
    typeof process.env.SMTP_HOST === 'string'
      ? process.env.SMTP_HOST.trim()
      : typeof process.env.MAIL_HOST === 'string'
        ? process.env.MAIL_HOST.trim()
        : '';
  const normalizedUser =
    typeof process.env.SMTP_USER === 'string'
      ? process.env.SMTP_USER.trim()
      : typeof process.env.SMTP_USERNAME === 'string'
        ? process.env.SMTP_USERNAME.trim()
        : typeof process.env.MAIL_USER === 'string'
          ? process.env.MAIL_USER.trim()
          : '';
  const normalizedPassRaw =
    typeof process.env.SMTP_PASS === 'string'
      ? process.env.SMTP_PASS.trim()
      : typeof process.env.SMTP_PASSWORD === 'string'
        ? process.env.SMTP_PASSWORD.trim()
        : typeof process.env.MAIL_PASSWORD === 'string'
          ? process.env.MAIL_PASSWORD.trim()
          : '';
  const normalizedPass = normalizedPassRaw.replace(/\s+/g, '');
  const normalizedFrom =
    typeof process.env.SMTP_FROM === 'string'
      ? process.env.SMTP_FROM.trim()
      : typeof process.env.MAIL_FROM === 'string'
        ? process.env.MAIL_FROM.trim()
        : '';
  const portValue = process.env.SMTP_PORT || process.env.MAIL_PORT;
  const secureValue = process.env.SMTP_SECURE || process.env.MAIL_SECURE;
  const secureDefault = parseNumber(portValue, 587) === 465;
  const familyRaw = parseNumber(process.env.SMTP_FAMILY || process.env.MAIL_FAMILY, NaN);
  const family = familyRaw === 4 || familyRaw === 6 ? familyRaw : isProduction() ? 4 : undefined;
  const connectionTimeout = parseNumber(process.env.SMTP_CONNECTION_TIMEOUT_MS, 20 * 1000);
  const greetingTimeout = parseNumber(process.env.SMTP_GREETING_TIMEOUT_MS, 15 * 1000);
  const socketTimeout = parseNumber(process.env.SMTP_SOCKET_TIMEOUT_MS, 30 * 1000);

  return {
    host: normalizedHost,
    port: parseNumber(portValue, 587),
    secure: parseBoolean(secureValue, secureDefault),
    user: normalizedUser,
    pass: normalizedPass,
    from: normalizedFrom,
    family,
    connectionTimeout,
    greetingTimeout,
    socketTimeout
  };
}

function getReminderConfig() {
  const timezone =
    typeof process.env.REMINDER_TIMEZONE === 'string' && process.env.REMINDER_TIMEZONE.trim()
      ? process.env.REMINDER_TIMEZONE.trim()
      : typeof process.env.TZ === 'string' && process.env.TZ.trim()
        ? process.env.TZ.trim()
        : 'UTC';

  return {
    enabled: parseBoolean(process.env.REMINDER_ENABLED || process.env.EMAIL_REMINDER_ENABLED, false),
    checkIntervalMs: parseNumber(process.env.REMINDER_CHECK_INTERVAL_MS, 15 * 60 * 1000),
    timezone
  };
}

function validateProductionEnv() {
  if (!isProduction()) {
    return;
  }

  getRequiredEnv('SESSION_SECRET');

  const hasDbUrl = Boolean(
    parseDbUrl(process.env.DATABASE_URL) ||
      parseDbUrl(process.env.MYSQL_PUBLIC_URL) ||
      parseDbUrl(process.env.DATABASE_PUBLIC_URL) ||
      parseDbUrl(process.env.MYSQL_URL)
  );

  if (hasDbUrl) {
    const dbConfig = getDbConfig();
    if (!dbConfig.database) {
      throw new Error('Missing DB name in DATABASE_URL (or DB_NAME fallback).');
    }

    return;
  }

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
  getMailConfig,
  getReminderConfig,
  validateProductionEnv
};
