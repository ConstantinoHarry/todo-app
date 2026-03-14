# todo-app

A simple, production-ready full-stack todo app built with Express, MySQL, and EJS.

It includes core CRUD features and a practical custom workflow feature: **Daily Focus Mode with Energy Tracking**.

## Why the custom feature matters

Not every task requires the same mental effort. On busy or low-energy days, this app helps you filter by energy level and limit visible tasks so you can keep moving without overload.

### Daily Focus Mode with Energy Tracking

- Every task has an energy level:
  - `high` → ⚡ High Energy
  - `medium` → 😊 Medium Energy
  - `low` → 😴 Low Energy
- Focus mode can be toggled on/off.
- You can filter by energy level.
- Budget limits in focus mode:
  - High: up to 3 tasks
  - Medium: up to 2 tasks
  - Low: up to 1 task
- “Clear for Today” archives completed tasks to `completed_tasks` and removes them from `todos`.

## Features implemented

- Add tasks with text + energy level
- Toggle complete/incomplete
- Delete tasks
- List tasks with completion state and badges
- Persist all data in MySQL
- Focus mode filtering with per-energy task budget
- Archive completed tasks via transaction-safe clear action
- Basic validation and user-facing error feedback
- CSRF protection for all mutating forms
- Rate limiting on authentication routes
- Secure headers via Helmet
- Password reset flow with expiring token support
- Google and GitHub OAuth login buttons (Passport-based)

## Tech stack

- Node.js
- Express
- MySQL (`mysql2/promise`)
- EJS
- HTML5 + CSS3 + Vanilla JavaScript
- Railway-ready env compatibility

## Project structure

```text
todo-app/
├── public/
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   └── main.js
│   └── images/
├── views/
│   ├── index.ejs
│   └── partials/
│       ├── header.ejs
│       └── footer.ejs
├── routes/
│   └── todos.js
├── models/
│   └── todoModel.js
├── config/
│   └── db.js
├── .env
├── .env.example
├── .gitignore
├── package.json
├── server.js
└── README.md
```

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create local env file:

   ```bash
   cp .env.example .env
   ```

3. Fill `.env` with your local MySQL credentials.

4. Create database and tables (schema below).

5. Run app:

   ```bash
   npm run dev
   ```

6. Open:

   - `http://localhost:3000`

## Environment variables

Primary local variables:

```env
PORT=3000
NODE_ENV=development
APP_BASE_URL=http://localhost:3000
TRUST_PROXY=0
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=todo_app
DB_CONNECTION_LIMIT=10
DB_SSL=false
DB_SSL_REJECT_UNAUTHORIZED=true
SESSION_SECRET=replace_with_a_long_random_secret
SESSION_NAME=todo.sid
SESSION_MAX_AGE_MS=28800000
SESSION_SAME_SITE=lax
SESSION_SECURE_COOKIE=false
SESSION_COOKIE_DOMAIN=
RESET_PASSWORD_URL_BASE=http://localhost:3000
RESET_TOKEN_TTL_MINUTES=60
AUTH_RATE_LIMIT_WINDOW_MS=900000
AUTH_RATE_LIMIT_MAX=10
GLOBAL_RATE_LIMIT_WINDOW_MS=900000
GLOBAL_RATE_LIMIT_MAX=200

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_CALLBACK_URL=http://localhost:3000/auth/github/callback
```

Also supported for Railway-style MySQL environments:

- `MYSQLHOST`
- `MYSQLPORT`
- `MYSQLUSER`
- `MYSQLPASSWORD`
- `MYSQLDATABASE`

`config/db.js` checks `DB_*` first, then falls back to `MYSQL*` variables.

## Database schema

```sql
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

CREATE TABLE IF NOT EXISTS todos (
  id INT PRIMARY KEY AUTO_INCREMENT,
   user_id INT NOT NULL,
  text VARCHAR(255) NOT NULL,
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

CREATE INDEX idx_todos_user_id ON todos(user_id);
CREATE INDEX idx_completed_tasks_user_id ON completed_tasks(user_id);
CREATE INDEX idx_users_reset_token_hash ON users(reset_password_token_hash);
CREATE UNIQUE INDEX idx_users_google_id_unique ON users(google_id);
CREATE UNIQUE INDEX idx_users_github_id_unique ON users(github_id);
```

## OAuth provider setup

For Google OAuth:

- Create OAuth credentials in Google Cloud Console
- Authorized redirect URI: `http://localhost:3000/auth/google/callback`
- Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

For GitHub OAuth:

- Create an OAuth app in GitHub Developer Settings
- Authorization callback URL: `http://localhost:3000/auth/github/callback`
- Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`

## Railway deployment notes

1. Push project to GitHub.
2. Create a Railway project and provision MySQL.
3. Add app service and connect the repository.
4. Ensure env vars are present (`MYSQL*` usually auto-provided by Railway MySQL).
5. Railway runs `npm install` and starts the app with:
   - `npm start`
6. Confirm app is healthy and DB connection works.

## Production readiness checklist

- Set `NODE_ENV=production`
- Set a strong `SESSION_SECRET` (minimum 32 random characters)
- Set `APP_BASE_URL` to your public HTTPS URL
- Set `TRUST_PROXY=1` when deploying behind reverse proxy/load balancer
- Set `SESSION_SECURE_COOKIE=true` in production
- If DB requires TLS, set `DB_SSL=true`
- Run health checks:
   - `/healthz` for liveness
   - `/readyz` for DB readiness

## Security and production notes

- `.env` is ignored by git and must never be committed.
- All SQL uses parameterized queries.
- `clear-completed` uses a DB transaction to avoid partial archive/delete states.
- Sessions are regenerated on login to reduce fixation risk.
- Password reset links are single-use via hashed token + expiry.
- Error handling is intentionally simple but user-friendly for a small project.

## Future improvements

- Add due dates and sort options
- Add search and pagination
- Add edit task text
- Add auth for personal task lists
- Add automated tests (routes + model integration)
