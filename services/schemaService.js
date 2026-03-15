const pool = require('../config/db');

const CORE_SCHEMA_STATEMENTS = [
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
  `,
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
  `,
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
  `,
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
  `,
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
];

async function ensureCoreSchema() {
  for (const statement of CORE_SCHEMA_STATEMENTS) {
    await pool.query(statement);
  }
}

module.exports = {
  ensureCoreSchema
};
