const pool = require('../config/db');

async function getAllTodos(filters = {}) {
  const allowedEnergyLevels = ['high', 'medium', 'low'];
  const hasEnergyFilter = allowedEnergyLevels.includes(filters.energyLevel);

  let sql = 'SELECT id, text, completed, energy_level, created_at, updated_at FROM todos';
  const params = [];

  if (hasEnergyFilter) {
    sql += ' WHERE energy_level = ?';
    params.push(filters.energyLevel);
  }

  sql += ' ORDER BY completed ASC, created_at DESC';

  const [rows] = await pool.query(sql, params);
  return rows;
}

async function createTodo(text, energyLevel) {
  const sql = 'INSERT INTO todos (text, energy_level) VALUES (?, ?)';
  const [result] = await pool.query(sql, [text, energyLevel]);
  return result.insertId;
}

async function toggleTodo(id) {
  const sql = 'UPDATE todos SET completed = NOT completed, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
  const [result] = await pool.query(sql, [id]);
  return result.affectedRows;
}

async function updateTodo(id, text, energyLevel) {
  const sql = `
    UPDATE todos
    SET text = ?, energy_level = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;
  const [result] = await pool.query(sql, [text, energyLevel, id]);
  return result.affectedRows;
}

async function deleteTodo(id) {
  const [result] = await pool.query('DELETE FROM todos WHERE id = ?', [id]);
  return result.affectedRows;
}

async function clearCompletedTodos() {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query(
      `
      INSERT INTO completed_tasks (original_id, text, energy_level)
      SELECT id, text, energy_level
      FROM todos
      WHERE completed = TRUE
      `
    );

    const [deleteResult] = await connection.query(
      'DELETE FROM todos WHERE completed = TRUE'
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
