const pool = require('../config/db');

function getDateRangeBounds(dateKey) {
  const start = new Date(`${dateKey}T00:00:00`);
  const end = new Date(`${dateKey}T00:00:00`);
  end.setDate(end.getDate() + 1);

  const toSql = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  };

  return {
    start: toSql(start),
    end: toSql(end)
  };
}

function groupRowsByUser(rows) {
  const userMap = new Map();

  rows.forEach((row) => {
    if (!userMap.has(row.user_id)) {
      userMap.set(row.user_id, {
        userId: row.user_id,
        email: row.email,
        tasksById: new Map()
      });
    }

    const userBucket = userMap.get(row.user_id);

    if (!userBucket.tasksById.has(row.todo_id)) {
      userBucket.tasksById.set(row.todo_id, {
        id: row.todo_id,
        text: row.todo_text,
        description: row.todo_description,
        deadline: row.todo_deadline,
        subtasks: []
      });
    }

    if (row.subtask_id) {
      const task = userBucket.tasksById.get(row.todo_id);
      task.subtasks.push({
        id: row.subtask_id,
        text: row.subtask_text,
        completed: Boolean(row.subtask_completed)
      });
    }
  });

  const grouped = [];
  userMap.forEach((value) => {
    grouped.push({
      userId: value.userId,
      email: value.email,
      tasks: Array.from(value.tasksById.values())
    });
  });

  return grouped;
}

async function getUnsentDueTodayReminderPayloads(dateKey) {
  const { start, end } = getDateRangeBounds(dateKey);

  const [rows] = await pool.query(
    `
    SELECT
      u.id AS user_id,
      u.email,
      t.id AS todo_id,
      t.text AS todo_text,
      t.description AS todo_description,
      t.deadline AS todo_deadline,
      s.id AS subtask_id,
      s.text AS subtask_text,
      s.completed AS subtask_completed
    FROM users u
    INNER JOIN todos t ON t.user_id = u.id
    LEFT JOIN subtasks s ON s.todo_id = t.id AND s.user_id = u.id
    WHERE
      t.completed = FALSE
      AND t.deadline IS NOT NULL
      AND t.deadline >= ?
      AND t.deadline < ?
      AND NOT EXISTS (
        SELECT 1
        FROM email_reminder_logs l
        WHERE l.user_id = u.id AND l.reminder_date = ?
      )
    ORDER BY u.id ASC, t.deadline ASC, t.id ASC, s.created_at ASC
    `,
    [start, end, dateKey]
  );

  return groupRowsByUser(rows);
}

async function markReminderSent(userId, dateKey, tasksCount) {
  await pool.query(
    `
    INSERT INTO email_reminder_logs (user_id, reminder_date, tasks_count)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE sent_at = CURRENT_TIMESTAMP, tasks_count = VALUES(tasks_count)
    `,
    [userId, dateKey, tasksCount]
  );
}

module.exports = {
  getUnsentDueTodayReminderPayloads,
  markReminderSent
};
