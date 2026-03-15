const pool = require('../config/db');

const state = {
  initialized: false,
  ready: false,
  error: null,
  lastCheckedAt: null
};

async function columnExists(tableName, columnName) {
  const [rows] = await pool.query(
    `
    SELECT COUNT(*) AS count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
    `,
    [tableName, columnName]
  );

  return Number(rows[0] && rows[0].count) > 0;
}

async function ensureColumn(tableName, columnName, definitionSql) {
  const exists = await columnExists(tableName, columnName);
  if (exists) {
    return;
  }

  await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definitionSql}`);
}

async function indexExists(tableName, indexName) {
  const [rows] = await pool.query(
    `
    SELECT COUNT(*) AS count
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND INDEX_NAME = ?
    `,
    [tableName, indexName]
  );

  return Number(rows[0] && rows[0].count) > 0;
}

async function ensureIndex(tableName, indexName, columnsSql, unique = false) {
  const exists = await indexExists(tableName, indexName);
  if (exists) {
    return;
  }

  const uniqueKeyword = unique ? 'UNIQUE ' : '';
  await pool.query(`CREATE ${uniqueKeyword}INDEX ${indexName} ON ${tableName}(${columnsSql})`);
}

async function ensureCoreSchema() {
  await pool.query(
    `
    CREATE TABLE IF NOT EXISTS users (
      id INT PRIMARY KEY AUTO_INCREMENT,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      google_id VARCHAR(191) DEFAULT NULL,
      github_id VARCHAR(191) DEFAULT NULL,
      reset_password_token_hash VARCHAR(64) DEFAULT NULL,
      reset_password_expires_at DATETIME DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
    `
  );

  await ensureColumn('users', 'google_id', 'VARCHAR(191) DEFAULT NULL');
  await ensureColumn('users', 'github_id', 'VARCHAR(191) DEFAULT NULL');
  await ensureColumn('users', 'reset_password_token_hash', 'VARCHAR(64) DEFAULT NULL');
  await ensureColumn('users', 'reset_password_expires_at', 'DATETIME DEFAULT NULL');

  await pool.query(
    `
    CREATE TABLE IF NOT EXISTS todos (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      text VARCHAR(255) NOT NULL,
      description TEXT DEFAULT NULL,
      completed BOOLEAN DEFAULT FALSE,
      energy_level ENUM('high', 'medium', 'low') DEFAULT 'medium',
      deadline DATETIME DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_todos_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
    `
  );

  await ensureColumn('todos', 'description', 'TEXT DEFAULT NULL');
  await ensureColumn('todos', 'deadline', 'DATETIME DEFAULT NULL');

  await pool.query(
    `
    CREATE TABLE IF NOT EXISTS completed_tasks (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      original_id INT,
      text VARCHAR(255) NOT NULL,
      energy_level ENUM('high', 'medium', 'low'),
      completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_completed_tasks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
    `
  );

  await pool.query(
    `
    CREATE TABLE IF NOT EXISTS email_reminder_logs (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      reminder_date DATE NOT NULL,
      tasks_count INT NOT NULL DEFAULT 0,
      sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_email_reminder_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE KEY uniq_email_reminder_user_date (user_id, reminder_date)
    )
    `
  );

  await pool.query(
    `
    CREATE TABLE IF NOT EXISTS subtasks (
      id INT PRIMARY KEY AUTO_INCREMENT,
      todo_id INT NOT NULL,
      user_id INT NOT NULL,
      text VARCHAR(255) NOT NULL,
      completed BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_subtasks_todo FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE,
      CONSTRAINT fk_subtasks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
    `
  );

  await pool.query(
    `
    CREATE TABLE IF NOT EXISTS sessions (
      session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
      expires INT(11) UNSIGNED NOT NULL,
      data MEDIUMTEXT COLLATE utf8mb4_bin,
      PRIMARY KEY (session_id)
    ) ENGINE=InnoDB
    `
  );

  await ensureIndex('todos', 'idx_todos_user_id', 'user_id');
  await ensureIndex('subtasks', 'idx_subtasks_todo_id', 'todo_id');
  await ensureIndex('subtasks', 'idx_subtasks_user_id', 'user_id');
  await ensureIndex('users', 'idx_users_google_id_unique', 'google_id', true);
  await ensureIndex('users', 'idx_users_github_id_unique', 'github_id', true);
}

async function initializeSchema() {
  state.lastCheckedAt = new Date().toISOString();

  try {
    await ensureCoreSchema();
    state.initialized = true;
    state.ready = true;
    state.error = null;
  } catch (error) {
    state.initialized = true;
    state.ready = false;
    state.error = error;
  }

  return state.ready;
}

function isSchemaReady() {
  return state.ready;
}

function getSchemaStatus() {
  return {
    initialized: state.initialized,
    ready: state.ready,
    lastCheckedAt: state.lastCheckedAt,
    errorCode: state.error && state.error.code ? state.error.code : null,
    errorMessage: state.error && state.error.message ? state.error.message : null
  };
}

module.exports = {
  initializeSchema,
  isSchemaReady,
  getSchemaStatus
};