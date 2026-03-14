const pool = require('../config/db');

async function findUserByEmail(email) {
  const sql = 'SELECT id, email, password_hash, reset_password_token_hash, reset_password_expires_at, created_at FROM users WHERE email = ? LIMIT 1';
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

async function setPasswordResetToken(userId, tokenHash, expiresAt) {
  const sql = `
    UPDATE users
    SET reset_password_token_hash = ?, reset_password_expires_at = ?
    WHERE id = ?
  `;
  await pool.query(sql, [tokenHash, expiresAt, userId]);
}

async function findUserByResetTokenHash(tokenHash) {
  const sql = `
    SELECT id, email, reset_password_expires_at
    FROM users
    WHERE reset_password_token_hash = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [tokenHash]);
  return rows[0] || null;
}

async function clearPasswordResetToken(userId) {
  const sql = `
    UPDATE users
    SET reset_password_token_hash = NULL, reset_password_expires_at = NULL
    WHERE id = ?
  `;
  await pool.query(sql, [userId]);
}

async function updateUserPassword(userId, passwordHash) {
  const sql = 'UPDATE users SET password_hash = ? WHERE id = ?';
  await pool.query(sql, [passwordHash, userId]);
}

module.exports = {
  findUserByEmail,
  findUserById,
  createUser,
  setPasswordResetToken,
  findUserByResetTokenHash,
  clearPasswordResetToken,
  updateUserPassword
};
