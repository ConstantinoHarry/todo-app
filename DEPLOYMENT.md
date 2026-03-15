# Deployment Runbook

This document lists the complete, practical steps to deploy the app to production.

## Railway quickstart (recommended for this project)

### A) Create services

1. Create a new Railway project.
2. Add a **MySQL** service in Railway.
3. Add your app service by connecting this GitHub repository.

### B) Configure app service

In Railway app service settings:

- **Build command**: `npm ci --omit=dev`
- **Start command**: `npm start`
- **Root directory**: repo root

### C) Set environment variables

Set these in Railway app variables:

```dotenv
NODE_ENV=production
PORT=3000
APP_BASE_URL=https://<your-railway-public-domain-or-custom-domain>
TRUST_PROXY=1

DATABASE_URL=<from-railway-mysql-public-or-private-url>
DB_SSL=false

SESSION_SECRET=<long-random-secret>
SESSION_SECURE_COOKIE=true
SESSION_SAME_SITE=lax
SESSION_COOKIE_DOMAIN=

REMINDER_ENABLED=false
```

Optional fallback (only if your `DATABASE_URL` has no db name path):

```dotenv
DB_NAME=<railway_database_name>
```

Generate a strong session secret locally:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Notes:

- Leave `SESSION_COOKIE_DOMAIN` empty unless you use a custom domain and need explicit cookie scoping.
- Keep `REMINDER_ENABLED=false` until SMTP is fully configured.

### D) Database initialization

No manual SQL step is required for base schema on normal startup.

- The app now performs idempotent schema bootstrap at startup (users, todos, subtasks, reminder logs, completed tasks, and sessions table).
- If DB credentials are valid and DB user has create/alter permissions, schema is auto-created.
- If schema bootstrap fails, app stays up but `/readyz` returns `503` with schema error details.

Minimal DB work in Railway:

1. Add MySQL service in the same Railway project.
2. Copy MySQL connection string into app `DATABASE_URL`.
3. Deploy app service.

### E) Deploy and verify

1. Trigger deploy from Railway (or push to the connected branch).
2. Open app URL and check:
     - `/healthz` returns `200`
     - `/readyz` returns `200`
3. Test register/login and create a todo.
4. Test OAuth entry:
    - `/auth/google` redirects to Google consent page
    - `/auth/github` redirects to GitHub authorize page

### F) Optional production extras

- Add a custom domain in Railway and update `APP_BASE_URL`.
- Configure Google/GitHub OAuth callbacks to:
    - `https://<your-domain>/auth/google/callback`
    - `https://<your-domain>/auth/github/callback`
- Enable reminders only after setting SMTP vars.

### G) Railway release flow

For updates:

1. Push to your deploy branch.
2. Railway auto-redeploys.
3. If schema changes, run SQL migration first, then deploy app.
4. Re-check `/readyz` after deploy.

### H) Crash triage checklist (Railway)

If app crashes or restarts:

1. Confirm `DATABASE_URL` and `SESSION_SECRET` are present.
2. Confirm `APP_BASE_URL` matches deployed public URL exactly.
3. Confirm OAuth callback URLs match exactly:
    - `https://<domain>/auth/google/callback`
    - `https://<domain>/auth/github/callback`
4. Hit `/readyz` and inspect `schema.errorCode` or `schema.errorMessage`.
5. If DB auth errors appear, rotate `DATABASE_URL` from Railway MySQL service and redeploy.
6. If table errors appear, verify DB user has `CREATE`, `ALTER`, `INDEX` privileges.
7. Keep `REMINDER_ENABLED=false` until login flow is verified.

## 1) Choose your production setup

Use this baseline architecture:

- **App runtime**: Node.js 20 LTS
- **Process manager**: PM2
- **Reverse proxy + TLS**: Nginx + Let’s Encrypt
- **Database**: MySQL 8 (managed service or separate server)
- **OS target**: Ubuntu 22.04+ (or equivalent Linux distro)

## 2) Pre-deployment checklist

Before any deployment:

- A production domain is ready (example: `todo.yourdomain.com`)
- DNS `A` record points to your server IP
- MySQL database and user are created
- Outbound SMTP access is available (if reminders enabled)
- OAuth providers (Google/GitHub) have production callback URLs configured
- `SESSION_SECRET` generated (long random value)
- Firewall allows ports `80` and `443` (and internal app port, usually `3000`, only locally)

## 3) Server bootstrap

Install system dependencies:

```bash
sudo apt update
sudo apt install -y curl git nginx mysql-client
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

Validate versions:

```bash
node -v
npm -v
pm2 -v
```

## 4) Deploy code

Create app directory and pull code:

```bash
sudo mkdir -p /var/www/todo-app
sudo chown -R $USER:$USER /var/www/todo-app
git clone <your-repo-url> /var/www/todo-app
cd /var/www/todo-app
npm ci --omit=dev
```

## 5) Configure production environment

Create `.env` from template:

```bash
cp .env.example .env
```

Set **minimum required** production values:

```dotenv
NODE_ENV=production
PORT=3000
APP_BASE_URL=https://todo.yourdomain.com
TRUST_PROXY=1

DB_HOST=<mysql-host>
DB_PORT=3306
DB_USER=<mysql-user>
DB_PASSWORD=<mysql-password>
DB_NAME=todo_app
DB_SSL=<true-or-false>
DB_SSL_REJECT_UNAUTHORIZED=true

SESSION_SECRET=<long-random-secret>
SESSION_SECURE_COOKIE=true
SESSION_SAME_SITE=lax
SESSION_COOKIE_DOMAIN=todo.yourdomain.com
```

Optional but recommended:

- `REMINDER_ENABLED=true` only if SMTP is fully configured
- `GOOGLE_*` and `GITHUB_*` only if social login is needed
- Keep callback URLs on `https://todo.yourdomain.com/auth/.../callback`

### SMTP block (if reminders enabled)

```dotenv
REMINDER_ENABLED=true
REMINDER_CHECK_INTERVAL_MS=900000
SMTP_HOST=<smtp-host>
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<smtp-user>
SMTP_PASS=<smtp-pass>
SMTP_FROM=Todo App <no-reply@yourdomain.com>
```

## 6) Initialize database schema

Run once per environment:

```bash
mysql -h <mysql-host> -P 3306 -u <mysql-user> -p <db-name> < sql/init.sql
```

## 7) Start app with PM2

From project root:

```bash
pm2 start server.js --name todo-app
pm2 save
pm2 startup
```

Health checks (before proxy setup):

```bash
curl -sSf http://127.0.0.1:3000/healthz
curl -sSf http://127.0.0.1:3000/readyz
```

## 8) Configure Nginx reverse proxy

Create config:

```bash
sudo tee /etc/nginx/sites-available/todo-app >/dev/null <<'EOF'
server {
    listen 80;
    server_name todo.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/todo-app /etc/nginx/sites-enabled/todo-app
sudo nginx -t
sudo systemctl reload nginx
```

## 9) Enable HTTPS

Install certbot and issue certificate:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d todo.yourdomain.com
```

Auto-renew check:

```bash
sudo certbot renew --dry-run
```

## 10) Post-deploy validation

Run these checks in order:

1. `https://todo.yourdomain.com/healthz` returns `200`
2. `https://todo.yourdomain.com/readyz` returns `200`
3. Login and registration work
4. Create/edit/complete/delete a todo
5. Calendar and carryover actions render correctly
6. If reminders enabled, verify reminder send in logs and inbox

PM2 logs:

```bash
pm2 logs todo-app --lines 200
```

Nginx logs:

```bash
sudo tail -n 200 /var/log/nginx/error.log
sudo tail -n 200 /var/log/nginx/access.log
```

## 11) Release/update procedure

For each deployment:

```bash
cd /var/www/todo-app
git pull
npm ci --omit=dev
pm2 restart todo-app
curl -sSf http://127.0.0.1:3000/healthz
curl -sSf http://127.0.0.1:3000/readyz
```

If schema changed:

- Apply migration SQL before `pm2 restart`
- Always back up DB before schema updates

## 12) Rollback procedure

Fast app rollback:

```bash
pm2 restart todo-app --update-env
```

Code rollback (git tag/commit based):

```bash
cd /var/www/todo-app
git checkout <previous-good-tag-or-commit>
npm ci --omit=dev
pm2 restart todo-app
```

DB rollback:

- Restore from backup/snapshot matching the app version
- Re-run readiness check after restore

## 13) Security and operations hardening

- Keep `.env` out of git (already ignored)
- Rotate `SESSION_SECRET`, DB password, SMTP secrets periodically
- Restrict MySQL inbound rules to app server IP only
- Enable automatic OS security updates
- Monitor `pm2` process restarts and 5xx response rates
- Back up database daily and test restore monthly

## 14) CI/CD minimum pipeline (recommended)

At minimum, automate:

1. Install dependencies (`npm ci`)
2. Optional lint/test stage
3. Build/deploy to server
4. Restart PM2
5. Run `/healthz` and `/readyz` smoke checks

---

## Quick production env checklist

- [ ] `NODE_ENV=production`
- [ ] `APP_BASE_URL` uses `https://...`
- [ ] `TRUST_PROXY=1` behind Nginx/ingress
- [ ] `SESSION_SECRET` set to random long string
- [ ] `SESSION_SECURE_COOKIE=true`
- [ ] `DATABASE_URL` set from Railway MySQL service
- [ ] DB user in `DATABASE_URL` has schema create/alter/index privileges
- [ ] Railway app uses `npm ci --omit=dev` and `npm start`
- [ ] OAuth callback URLs point to production domain
- [ ] SMTP vars set (if reminders enabled)
- [ ] PM2 running and persisted
- [ ] Nginx reverse proxy active
- [ ] TLS certificate installed and renewal validated
- [ ] `/healthz` and `/readyz` pass after deployment
