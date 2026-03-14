const nodemailer = require('nodemailer');
const { getMailConfig, getReminderConfig } = require('../config/env');
const {
  getUnsentDueTodayReminderPayloads,
  markReminderSent
} = require('../models/reminderModel');

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

  return nodemailer.createTransport({
    host: mailConfig.host,
    port: mailConfig.port,
    secure: mailConfig.secure,
    auth: {
      user: mailConfig.user,
      pass: mailConfig.pass
    }
  });
}

async function sendDailyDueTodayReminders(transporter, mailConfig) {
  const dateKey = getLocalDateKey();
  const payloads = await getUnsentDueTodayReminderPayloads(dateKey);
  let processedUsers = 0;

  for (const payload of payloads) {
    if (!payload.tasks.length) {
      continue;
    }

    const content = buildReminderEmailContent(payload.tasks);

    await transporter.sendMail({
      from: mailConfig.from,
      to: payload.email,
      subject: `Reminder: ${payload.tasks.length} task(s) due today`,
      text: content.text,
      html: content.html
    });

    await markReminderSent(payload.userId, dateKey, payload.tasks.length);
    processedUsers += 1;
  }

  if (payloads.length > 0) {
    console.log(`[reminders] Processed due-today reminders for ${payloads.length} user(s) on ${dateKey}.`);
  }

  return {
    dateKey,
    eligibleUsers: payloads.length,
    processedUsers
  };
}

async function runDueTodayRemindersNow() {
  const mailConfig = getMailConfig();
  const transporter = createTransporter(mailConfig);

  if (!transporter) {
    throw new Error('Missing SMTP configuration for reminder send.');
  }

  return sendDailyDueTodayReminders(transporter, mailConfig);
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
    console.warn('[reminders] Missing SMTP configuration. Reminder scheduler not started.');
    return;
  }

  let isRunning = false;

  const runCycle = async () => {
    if (isRunning) {
      return;
    }

    isRunning = true;
    try {
      await sendDailyDueTodayReminders(transporter, mailConfig);
    } catch (error) {
      console.error('[reminders] Failed to send due-today reminders:', error);
    } finally {
      isRunning = false;
    }
  };

  runCycle();
  setInterval(runCycle, reminderConfig.checkIntervalMs);
  console.log(`[reminders] Scheduler started. Interval: ${reminderConfig.checkIntervalMs}ms`);
}

module.exports = {
  startReminderScheduler,
  runDueTodayRemindersNow
};
