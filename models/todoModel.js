const pool = require('../config/db');

async function getAllTodos(userId) {
  let sql = 'SELECT id, text, description, completed, energy_level, deadline, created_at, updated_at FROM todos WHERE user_id = ?';
  const params = [userId];

  sql += ' ORDER BY completed ASC, created_at DESC';

  const [rows] = await pool.query(sql, params);

  if (rows.length === 0) {
    return rows;
  }

  // Fetch all subtasks for these todos in one query
  const todoIds = rows.map((r) => r.id);
  const [subtaskRows] = await pool.query(
    'SELECT id, todo_id, text, completed, created_at FROM subtasks WHERE todo_id IN (?) AND user_id = ? ORDER BY created_at ASC',
    [todoIds, userId]
  );

  // Group subtasks by todo_id
  const subtaskMap = {};
  for (const s of subtaskRows) {
    if (!subtaskMap[s.todo_id]) subtaskMap[s.todo_id] = [];
    subtaskMap[s.todo_id].push(s);
  }

  return rows.map((r) => ({ ...r, subtasks: subtaskMap[r.id] || [] }));
}

async function createTodo(userId, text, description, energyLevel, deadline) {
  const sql = 'INSERT INTO todos (user_id, text, description, energy_level, deadline) VALUES (?, ?, ?, ?, ?)';
  const [result] = await pool.query(sql, [userId, text, description || null, energyLevel, deadline || null]);
  return result.insertId;
}

async function toggleTodo(userId, id) {
  const sql = 'UPDATE todos SET completed = NOT completed, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?';
  const [result] = await pool.query(sql, [id, userId]);
  return result.affectedRows;
}

async function updateTodo(userId, id, text, description, energyLevel, deadline) {
  const sql = `
    UPDATE todos
    SET text = ?, description = ?, energy_level = ?, deadline = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `;
  const [result] = await pool.query(sql, [text, description || null, energyLevel, deadline || null, id, userId]);
  return result.affectedRows;
}

async function getTodoById(userId, id) {
  const [rows] = await pool.query(
    'SELECT id, user_id, text, completed, energy_level, deadline, created_at, updated_at FROM todos WHERE id = ? AND user_id = ? LIMIT 1',
    [id, userId]
  );

  return rows[0] || null;
}

async function updateTodoDeadline(userId, id, deadline) {
  const [result] = await pool.query(
    'UPDATE todos SET deadline = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
    [deadline || null, id, userId]
  );

  return result.affectedRows;
}

async function deleteTodo(userId, id) {
  const [result] = await pool.query('DELETE FROM todos WHERE id = ? AND user_id = ?', [id, userId]);
  return result.affectedRows;
}

async function clearCompletedTodos(userId) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query(
      `
      INSERT INTO completed_tasks (user_id, original_id, text, energy_level)
      SELECT user_id, id, text, energy_level
      FROM todos
      WHERE completed = TRUE AND user_id = ?
      `
      , [userId]
    );

    const [deleteResult] = await connection.query(
      'DELETE FROM todos WHERE completed = TRUE AND user_id = ?'
      , [userId]
    );

    await connection.commit();
    return deleteResult.affectedRows;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  getAllTodos,
  getTodoById,
  createTodo,
  toggleTodo,
  updateTodo,
  updateTodoDeadline,
  deleteTodo,
  clearCompletedTodos
};
