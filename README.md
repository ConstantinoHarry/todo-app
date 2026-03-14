# Todo App

A simple task manager built with Express, EJS, and MySQL.

It supports account login/signup, task planning, calendar view, carryover decisions, and due-date reminder notifications by email.

## What this app does

- Create, edit, complete, and delete tasks
- Add subtasks under each task
- Set energy level (`high`, `medium`, `low`) and due date/time
- Switch between list views (`Required`, `Completed`, `Calendar`)
- Use **Carryover Review** each day to decide: do today, move tomorrow, or unschedule
- Receive a daily reminder notification email for tasks due today (task name, description, and subtasks)

## Feature walkthrough

### 1) Task planning and tracking

- Create tasks with name, optional description, energy level, due date/time, and subtasks.
- Mark tasks complete from the main list or calendar agenda.
- Edit tasks inline when priorities or deadlines change.
- View progress in the overview card with filters like due today, due this week, or due this month.

### 2) Calendar view

- See all scheduled tasks in a monthly calendar.
- Open any date to view that day’s agenda in a modal.
- From the modal, you can add a task for that date, edit existing tasks, or mark tasks done.

### 3) Carryover Review (custom feature)

- At the start of the day, the app highlights overdue and due-today work.
- For each task, you can make a quick decision:
  - **Do Today**
  - **Move Tomorrow**
  - **Unschedule**
- This helps keep the daily list realistic instead of letting overdue tasks pile up.

### 4) Reminder notifications

- A scheduler checks for open tasks due today.
- Each user gets at most one reminder email per day.
- Reminder email includes task title, due time, description, and subtasks.
- Send logs prevent duplicate reminders on the same day.

## Login and signup flow

You can access the app in two ways:

- Email + password registration/login
- OAuth login with Google or GitHub

After login, each user sees only their own tasks.

## Reminder notifications (email)

The app has a reminder scheduler.

- It checks for open tasks due today
- Sends one reminder email per user per day
- Each email includes:
  - task title
  - task description
  - subtasks with completion status

Reminder logging is stored in the database so the same user does not get duplicate reminders on the same day.

## Database schema

Main tables:

- `users`: account information (email/password and optional OAuth IDs)
- `todos`: core tasks for each user (text, description, status, energy level, deadline)
- `subtasks`: checklist items attached to a task
- `completed_tasks`: archived completed tasks
- `email_reminder_logs`: tracks daily reminder sends per user

Relationships:

- One user has many todos
- One todo has many subtasks
- Deleting a user deletes their tasks and related records (cascade)

Schema is managed by `sql/init.sql`.

## Quick start

1. Install dependencies

```bash
npm install
```

2. Copy environment template

```bash
cp .env.example .env
```

3. Fill `.env` with database and auth settings

4. Initialize database schema

```bash
mysql -h 127.0.0.1 -P 3306 -u <user> -p <database> < sql/init.sql
```

5. Start server

```bash
npm run dev
```

Open: `http://localhost:3000`

## 60-second demo flow

1. Sign up (or log in with Google/GitHub).
2. Create 2–3 tasks with due dates and subtasks.
3. Open Calendar and click a date to manage tasks in the agenda modal.
4. Use Carryover Review to move one task to tomorrow and unschedule another.
5. Trigger/verify reminder email for due-today tasks.

## Required environment variables

Core app:

```env
PORT=3000
NODE_ENV=development
APP_BASE_URL=http://localhost:3000

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=todo_user
DB_PASSWORD=todo_pass_123
DB_NAME=todo_app

SESSION_SECRET=replace_with_a_long_random_secret
```

OAuth (optional):

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_CALLBACK_URL=http://localhost:3000/auth/github/callback
```

Reminder notifications (optional):

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

For Gmail, `SMTP_PASS` should be a **Google App Password**.

## Project structure (high level)

```text
config/       app configuration (env, DB, passport)
controllers/  request handlers
models/       database queries
routes/       route mapping
services/     reminder scheduler / email service
views/        EJS templates
public/       CSS and JS assets
sql/          schema initialization
```

## Notes

- `.env` is ignored by git and should never be committed.
- Security middleware includes CSRF protection, Helmet headers, sessions, and rate limiting.
- Health endpoints are available at `/healthz` and `/readyz`.
