CREATE DATABASE IF NOT EXISTS todo_app;
USE todo_app;

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
);

SET @stmt = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE users ADD COLUMN google_id VARCHAR(191) DEFAULT NULL',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'google_id'
);
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

SET @stmt = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE users ADD COLUMN github_id VARCHAR(191) DEFAULT NULL',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'github_id'
);
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

SET @stmt = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE users ADD COLUMN reset_password_token_hash VARCHAR(64) DEFAULT NULL',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'reset_password_token_hash'
);
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

SET @stmt = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE users ADD COLUMN reset_password_expires_at DATETIME DEFAULT NULL',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'reset_password_expires_at'
);
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

CREATE TABLE IF NOT EXISTS todos (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  text VARCHAR(255) NOT NULL,
  description TEXT DEFAULT NULL,
  completed BOOLEAN DEFAULT FALSE,
  energy_level ENUM('high', 'medium', 'low') DEFAULT 'medium',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_todos_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS completed_tasks (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  original_id INT,
  text VARCHAR(255) NOT NULL,
  energy_level ENUM('high', 'medium', 'low'),
  completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_completed_tasks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

SET @stmt = (
  SELECT IF(
    COUNT(*) = 0,
    'CREATE INDEX idx_todos_user_id ON todos(user_id)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todos' AND INDEX_NAME = 'idx_todos_user_id'
);
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

SET @stmt = (
  SELECT IF(
    COUNT(*) = 0,
    'CREATE INDEX idx_todos_user_completed_created_at ON todos(user_id, completed, created_at)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todos' AND INDEX_NAME = 'idx_todos_user_completed_created_at'
);
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

SET @stmt = (
  SELECT IF(
    COUNT(*) = 0,
    'CREATE INDEX idx_todos_user_deadline ON todos(user_id, deadline)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todos' AND INDEX_NAME = 'idx_todos_user_deadline'
);
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

SET @stmt = (
  SELECT IF(
    COUNT(*) = 0,
    'CREATE INDEX idx_completed_tasks_user_id ON completed_tasks(user_id)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'completed_tasks' AND INDEX_NAME = 'idx_completed_tasks_user_id'
);
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

SET @stmt = (
  SELECT IF(
    COUNT(*) = 0,
    'CREATE INDEX idx_users_reset_token_hash ON users(reset_password_token_hash)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_users_reset_token_hash'
);
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

SET @stmt = (
  SELECT IF(
    COUNT(*) = 0,
    'CREATE UNIQUE INDEX idx_users_google_id_unique ON users(google_id)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_users_google_id_unique'
);
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

SET @stmt = (
  SELECT IF(
    COUNT(*) = 0,
    'CREATE UNIQUE INDEX idx_users_github_id_unique ON users(github_id)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_users_github_id_unique'
);
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- --------------------------------------------------------
-- Deadlines & Subtasks
-- --------------------------------------------------------

-- Add deadline column to todos
SET @stmt = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE todos ADD COLUMN deadline DATETIME DEFAULT NULL',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todos' AND COLUMN_NAME = 'deadline'
);
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- Add description column to todos
SET @stmt = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE todos ADD COLUMN description TEXT DEFAULT NULL',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'todos' AND COLUMN_NAME = 'description'
);
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- Create subtasks table
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
);

-- Index on subtasks(todo_id)
SET @stmt = (
  SELECT IF(
    COUNT(*) = 0,
    'CREATE INDEX idx_subtasks_todo_id ON subtasks(todo_id)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subtasks' AND INDEX_NAME = 'idx_subtasks_todo_id'
);
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

SET @stmt = (
  SELECT IF(
    COUNT(*) = 0,
    'CREATE INDEX idx_subtasks_user_id ON subtasks(user_id)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subtasks' AND INDEX_NAME = 'idx_subtasks_user_id'
);
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;
