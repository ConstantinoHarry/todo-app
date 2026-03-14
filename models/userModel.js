const pool = require('../config/db');

async function findUserByEmail(email) {
  const sql = 'SELECT id, email, password_hash, created_at FROM users WHERE email = ? LIMIT 1';
  const [rows] = await pool.query(sql, [email]);

  return rows[0] || null;
}

async function findUserById(id) {
  const sql = 'SELECT id, email, created_at FROM users WHERE id = ? LIMIT 1';
  const [rows] = await pool.query(sql, [id]);

  return rows[0] || null;
}

async function createUser(email, passwordHash) {
  const sql = 'INSERT INTO users (email, password_hash) VALUES (?, ?)';
  const [result] = await pool.query(sql, [email, passwordHash]);

  return result.insertId;
}

module.exports = {
  findUserByEmail,
  findUserById,
  createUser
};
