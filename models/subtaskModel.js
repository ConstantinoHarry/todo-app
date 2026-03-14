const pool = require('../config/db');

/**
 * Create a subtask under a todo.
 * Verifies the todo belongs to the user before inserting.
 */
async function createSubtask(userId, todoId, text) {
  const connection = await pool.getConnection();
  try {
    // Ensure the parent todo belongs to this user
    const [todos] = await connection.query(
      'SELECT id FROM todos WHERE id = ? AND user_id = ?',
      [todoId, userId]
    );
    if (todos.length === 0) {
      return 0;
    }

    const [result] = await connection.query(
      'INSERT INTO subtasks (todo_id, user_id, text) VALUES (?, ?, ?)',
      [todoId, userId, text]
    );
    return result.insertId;
  } finally {
    connection.release();
  }
}

/**
 * Toggle a subtask's completed state.
 * Only toggles if the subtask belongs to the user.
 */
async function toggleSubtask(userId, subtaskId) {
  const [result] = await pool.query(
    'UPDATE subtasks SET completed = NOT completed, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
    [subtaskId, userId]
  );
  return result.affectedRows;
}

/**
 * Delete a subtask.
 * Only deletes if the subtask belongs to the user.
 */
async function deleteSubtask(userId, subtaskId) {
  const [result] = await pool.query(
    'DELETE FROM subtasks WHERE id = ? AND user_id = ?',
    [subtaskId, userId]
  );
  return result.affectedRows;
}

module.exports = {
  createSubtask,
  toggleSubtask,
  deleteSubtask
};
