const pool = require('../config/db');

async function getAllTodos(userId, filters = {}) {
  const allowedEnergyLevels = ['high', 'medium', 'low'];
  const hasEnergyFilter = allowedEnergyLevels.includes(filters.energyLevel);

  let sql = 'SELECT id, text, completed, energy_level, created_at, updated_at FROM todos WHERE user_id = ?';
  const params = [userId];

  if (hasEnergyFilter) {
    sql += ' AND energy_level = ?';
    params.push(filters.energyLevel);
  }

  sql += ' ORDER BY completed ASC, created_at DESC';

  const [rows] = await pool.query(sql, params);
  return rows;
}

async function createTodo(userId, text, energyLevel) {
  const sql = 'INSERT INTO todos (user_id, text, energy_level) VALUES (?, ?, ?)';
  const [result] = await pool.query(sql, [userId, text, energyLevel]);
  return result.insertId;
}

async function toggleTodo(userId, id) {
  const sql = 'UPDATE todos SET completed = NOT completed, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?';
  const [result] = await pool.query(sql, [id, userId]);
  return result.affectedRows;
}

async function updateTodo(userId, id, text, energyLevel) {
  const sql = `
    UPDATE todos
    SET text = ?, energy_level = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `;
  const [result] = await pool.query(sql, [text, energyLevel, id, userId]);
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
  createTodo,
  toggleTodo,
  updateTodo,
  deleteTodo,
  clearCompletedTodos
};
