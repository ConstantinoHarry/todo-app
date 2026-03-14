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
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=todo_app
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

CREATE TABLE IF NOT EXISTS todos (
  id INT PRIMARY KEY AUTO_INCREMENT,
  text VARCHAR(255) NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  energy_level ENUM('high', 'medium', 'low') DEFAULT 'medium',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS completed_tasks (
  id INT PRIMARY KEY AUTO_INCREMENT,
  original_id INT,
  text VARCHAR(255) NOT NULL,
  energy_level ENUM('high', 'medium', 'low'),
  completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Railway deployment notes

1. Push project to GitHub.
2. Create a Railway project and provision MySQL.
3. Add app service and connect the repository.
4. Ensure env vars are present (`MYSQL*` usually auto-provided by Railway MySQL).
5. Railway runs `npm install` and starts the app with:
   - `npm start`
6. Confirm app is healthy and DB connection works.

## Security and production notes

- `.env` is ignored by git and must never be committed.
- All SQL uses parameterized queries.
- `clear-completed` uses a DB transaction to avoid partial archive/delete states.
- Error handling is intentionally simple but user-friendly for a small project.

## Future improvements

- Add due dates and sort options
- Add search and pagination
- Add edit task text
- Add auth for personal task lists
- Add automated tests (routes + model integration)
