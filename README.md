# Todo App

A planning-focused task manager built with Express, EJS, and MySQL.

This app is designed for real daily execution, not just storing todos. It helps you decide what to do now, what to move, and what to defer—using calendar scheduling, energy-based prioritization, carryover decisions, and daily reminder emails.

This app was built to make day-to-day planning feel less overwhelming and more realistic. The current application that inspired this was Microsoft Planner which is the current planner I use to keep track of my tasks. So the goal for this app is to be an enhanced version with the intention of being more intuitive, given the calendar view to see how months are packed with tasks, start of day function so that tasks are managed properly given what is due on that day as well as the energy level feature so tasks can be classified to which required a higher energy level for completion. I am confident that this application I created is something that I will actually use. 

Instead of only storing tasks, it helps you decide *when* to do them (calendar view),
*how demanding* they are (energy levels: high, medium, low), and what to do with unfinished work
using carryover actions (do today, move tomorrow, or unschedule).
The goal is to support better daily focus, clearer priorities, and fewer forgotten due items with the advent of a daily push notifications email reminder.

- **When** a task should happen (calendar + due dates)
- **How demanding** it is (energy levels: `high`, `medium`, `low`)
- **What to do with unfinished work** (carryover actions)

## Core features

- Create, edit, complete, and delete tasks
- Add subtasks to break work into actionable steps
- Assign due date/time and energy level to each task
- Switch between `Required`, `Completed`, and `Calendar` views
- Run daily **Carryover Review** (`Do Today`, `Move Tomorrow`, `Unschedule`)
- Send one due-today reminder email per user per day

## How reminders work

- A scheduler checks open tasks due today
- Reminder emails include task title, due time, description, and subtasks
- Sends are logged in `email_reminder_logs` to prevent duplicate reminders on the same date

## Authentication

- Email/password signup and login
- Optional OAuth with Google and GitHub
- User data isolation per account

## Quick start (local)

1. Install dependencies:

```bash
npm install
```

2. Create environment file:

```bash
cp .env.example .env
```

3. Set database/app values in `.env`.

4. Initialize schema:

```bash
mysql -h 127.0.0.1 -P 3306 -u <user> -p <database> < sql/init.sql
```

5. Start app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Environment variables

Minimum required:

```env
PORT=3000
NODE_ENV=development
APP_BASE_URL=http://localhost:3000

# Prefer this in production/Railway
DATABASE_URL=mysql://user:password@host:3306/database

# Local fallback vars
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=your_db_name

SESSION_SECRET=your_long_random_secret
```

Optional OAuth:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_CALLBACK_URL=http://localhost:3000/auth/github/callback
```

Optional reminders:

```env
REMINDER_ENABLED=true
REMINDER_CHECK_INTERVAL_MS=900000

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM=Todo App <your_email@gmail.com>
```

For Gmail, use a Google App Password for `SMTP_PASS`.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for full production steps.

- Recommended: Railway quickstart
- Alternative: VM + Nginx + PM2 runbook

## Project structure

```text
config/       environment, DB, auth config
controllers/  route handlers
models/       SQL query layer
routes/       route definitions
services/     reminders and schema bootstrap
views/        EJS UI templates
public/       static assets (CSS/JS/images)
sql/          schema scripts
```

## Operational notes

- `.env` is git-ignored and should never be committed
- Security includes CSRF, Helmet, session protection, and rate limiting
- Health endpoints: `/healthz` and `/readyz`
