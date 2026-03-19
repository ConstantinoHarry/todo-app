const nodemailer = require('nodemailer');
const dns = require('node:dns').promises;
const { getMailConfig, getReminderConfig } = require('../config/env');
const {
  getUnsentDueTodayReminderPayloads,
  markReminderSent
} = require('../models/reminderModel');

function getLocalDateKey(date = new Date(), timezone = 'UTC') {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  return formatter.format(date);
}

function formatDeadline(deadline) {
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) {
    return 'Time unavailable';
  }

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function sanitizeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildReminderEmailContent(tasks) {
  const taskBlocksHtml = tasks
    .map((task, index) => {
      const subtasksHtml = task.subtasks.length
        ? `
          <ul style="margin: 8px 0 0 18px; padding: 0;">
            ${task.subtasks
              .map((subtask) => `<li style="margin: 0 0 4px; color: #475569;">${subtask.completed ? '✅' : '⬜'} ${sanitizeHtml(subtask.text)}</li>`)
              .join('')}
          </ul>
        `
        : '<p style="margin: 8px 0 0; color: #64748b;">No subtasks</p>';

      const descriptionHtml = task.description
        ? `<p style="margin: 6px 0 0; color: #334155;"><strong>Description:</strong> ${sanitizeHtml(task.description)}</p>`
        : '<p style="margin: 6px 0 0; color: #64748b;"><strong>Description:</strong> None</p>';

      return `
        <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; margin: 0 0 10px; background: #ffffff;">
          <p style="margin: 0; font-weight: 700; color: #0f172a;">${index + 1}. ${sanitizeHtml(task.text)}</p>
          <p style="margin: 6px 0 0; color: #475569;"><strong>Due:</strong> ${sanitizeHtml(formatDeadline(task.deadline))}</p>
          ${descriptionHtml}
          <p style="margin: 8px 0 0; font-weight: 600; color: #334155;">Subtasks:</p>
          ${subtasksHtml}
        </div>
      `;
    })
    .join('');

  const html = `
    <div style="font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background: #f8fafc; padding: 20px;">
      <div style="max-width: 680px; margin: 0 auto; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 14px; padding: 16px;">
        <h2 style="margin: 0 0 8px; color: #1e3a8a;">Tasks Due Today</h2>
        <p style="margin: 0 0 14px; color: #334155;">You have <strong>${tasks.length}</strong> open task(s) due today.</p>
        ${taskBlocksHtml}
      </div>
    </div>
  `;

  const textLines = [];
  textLines.push(`Tasks Due Today (${tasks.length})`);
  textLines.push('');

  tasks.forEach((task, index) => {
    textLines.push(`${index + 1}. ${task.text}`);
    textLines.push(`   Due: ${formatDeadline(task.deadline)}`);
    textLines.push(`   Description: ${task.description || 'None'}`);
    textLines.push('   Subtasks:');

    if (task.subtasks.length === 0) {
      textLines.push('   - None');
    } else {
      task.subtasks.forEach((subtask) => {
        textLines.push(`   - ${subtask.completed ? '[x]' : '[ ]'} ${subtask.text}`);
      });
    }

    textLines.push('');
  });

  return {
    html,
    text: textLines.join('\n')
  };
}

function createTransporter(mailConfig) {
  if (!mailConfig.host || !mailConfig.user || !mailConfig.pass || !mailConfig.from) {
    return null;
  }

  const transportConfig = {
    host: mailConfig.host,
    port: mailConfig.port,
    secure: mailConfig.secure,
    connectionTimeout: mailConfig.connectionTimeout,
    greetingTimeout: mailConfig.greetingTimeout,
    socketTimeout: mailConfig.socketTimeout,
    auth: {
      user: mailConfig.user,
      pass: mailConfig.pass
    }
  };

  if (mailConfig.family === 4 || mailConfig.family === 6) {
    transportConfig.family = mailConfig.family;
  }

  return nodemailer.createTransport(transportConfig);
}

function isSmtpNetworkError(error) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  return (
    error.code === 'ESOCKET' ||
    error.code === 'ETIMEDOUT' ||
    error.code === 'ENETUNREACH' ||
    error.command === 'CONN'
  );
}

async function sendMailWithIpv4Fallback(mailConfig, payload, content) {
  const ipv4Addresses = await dns.resolve4(mailConfig.host);

  if (!Array.isArray(ipv4Addresses) || ipv4Addresses.length === 0) {
    throw new Error(`No IPv4 addresses found for SMTP host: ${mailConfig.host}`);
  }

  const ipv4Host = ipv4Addresses[0];
  const fallbackTransporter = nodemailer.createTransport({
    host: ipv4Host,
    port: mailConfig.port,
    secure: mailConfig.secure,
    connectionTimeout: mailConfig.connectionTimeout,
    greetingTimeout: mailConfig.greetingTimeout,
    socketTimeout: mailConfig.socketTimeout,
    auth: {
      user: mailConfig.user,
      pass: mailConfig.pass
    },
    tls: {
      // Preserve TLS host verification when connecting via an IPv4 literal.
      servername: mailConfig.host
    }
  });

  await fallbackTransporter.sendMail({
    from: mailConfig.from,
    to: payload.email,
    subject: `Reminder: ${payload.tasks.length} task(s) due today`,
    text: content.text,
    html: content.html
  });
}

function getMissingMailConfigFields(mailConfig) {
  const missing = [];

  if (!mailConfig.host) {
    missing.push('SMTP_HOST');
  }

  if (!mailConfig.user) {
    missing.push('SMTP_USER');
  }

  if (!mailConfig.pass) {
    missing.push('SMTP_PASS');
  }

  if (!mailConfig.from) {
    missing.push('SMTP_FROM');
  }

  return missing;
}

async function sendDailyDueTodayReminders(transporter, mailConfig, reminderConfig) {
  const dateKey = getLocalDateKey(new Date(), reminderConfig.timezone);
  const payloads = await getUnsentDueTodayReminderPayloads(dateKey);
  let processedUsers = 0;

  for (const payload of payloads) {
    if (!payload.tasks.length) {
      continue;
    }

    const content = buildReminderEmailContent(payload.tasks);

    try {
      await transporter.sendMail({
        from: mailConfig.from,
        to: payload.email,
        subject: `Reminder: ${payload.tasks.length} task(s) due today`,
        text: content.text,
        html: content.html
      });
    } catch (error) {
      if (!isSmtpNetworkError(error)) {
        throw error;
      }

      console.warn(
        `[reminders] Primary SMTP send failed for ${payload.email}. Retrying with IPv4 fallback for ${mailConfig.host}.`
      );
      await sendMailWithIpv4Fallback(mailConfig, payload, content);
    }

    await markReminderSent(payload.userId, dateKey, payload.tasks.length);
    processedUsers += 1;
  }

  console.log(
    `[reminders] Run completed for ${dateKey} (${reminderConfig.timezone}). Eligible users: ${payloads.length}; processed users: ${processedUsers}.`
  );

  return {
    dateKey,
    eligibleUsers: payloads.length,
    processedUsers
  };
}

async function runDueTodayRemindersNow() {
  const mailConfig = getMailConfig();
  const reminderConfig = getReminderConfig();
  const transporter = createTransporter(mailConfig);

  if (!transporter) {
    const missing = getMissingMailConfigFields(mailConfig);
    throw new Error(`Missing SMTP configuration for reminder send: ${missing.join(', ') || 'unknown fields'}.`);
  }

  return sendDailyDueTodayReminders(transporter, mailConfig, reminderConfig);
}

function startReminderScheduler() {
  const reminderConfig = getReminderConfig();

  if (!reminderConfig.enabled) {
    console.log('[reminders] Disabled. Set REMINDER_ENABLED=true to enable email reminders.');
    return;
  }

  const mailConfig = getMailConfig();
  const transporter = createTransporter(mailConfig);

  if (!transporter) {
    const missing = getMissingMailConfigFields(mailConfig);
    console.warn(
      `[reminders] Missing SMTP configuration (${missing.join(', ')}). Reminder scheduler not started.`
    );
    return;
  }

  let isRunning = false;

  const runCycle = async () => {
    if (isRunning) {
      return;
    }

    isRunning = true;
    try {
      await sendDailyDueTodayReminders(transporter, mailConfig, reminderConfig);
    } catch (error) {
      console.error('[reminders] Failed to send due-today reminders:', error);

      if (isSmtpNetworkError(error)) {
        console.error(
          `[reminders] SMTP network error (host=${mailConfig.host}, port=${mailConfig.port}, family=${mailConfig.family || 'auto'}). ` +
            'If your host resolves to IPv6 on Railway, keep SMTP_FAMILY=4 and verify outbound SMTP access on your plan/provider.'
        );
      }
    } finally {
      isRunning = false;
    }
  };

  runCycle();
  setInterval(runCycle, reminderConfig.checkIntervalMs);
  console.log(
    `[reminders] Scheduler started. Interval: ${reminderConfig.checkIntervalMs}ms. Timezone: ${reminderConfig.timezone}`
  );
}

module.exports = {
  startReminderScheduler,
  runDueTodayRemindersNow
};
