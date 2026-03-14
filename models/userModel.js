const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

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

async function findUserByProviderId(provider, providerId) {
  if (!providerId) {
    return null;
  }

  const column = provider === 'google' ? 'google_id' : provider === 'github' ? 'github_id' : null;
  if (!column) {
    throw new Error('Unsupported auth provider.');
  }

  const sql = `
    SELECT id, email, created_at
    FROM users
    WHERE ${column} = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [providerId]);
  return rows[0] || null;
}

async function linkProviderToUser(userId, provider, providerId) {
  const column = provider === 'google' ? 'google_id' : provider === 'github' ? 'github_id' : null;
  if (!column) {
    throw new Error('Unsupported auth provider.');
  }

  const sql = `UPDATE users SET ${column} = ? WHERE id = ?`;
  await pool.query(sql, [providerId, userId]);
}

async function createSocialUser(email, provider, providerId) {
  const placeholderPassword = crypto.randomBytes(32).toString('hex');
  const passwordHash = await bcrypt.hash(placeholderPassword, 12);

  const sql = `
    INSERT INTO users (email, password_hash, google_id, github_id)
    VALUES (?, ?, ?, ?)
  `;

  const googleId = provider === 'google' ? providerId : null;
  const githubId = provider === 'github' ? providerId : null;

  const [result] = await pool.query(sql, [email, passwordHash, googleId, githubId]);
  return findUserById(result.insertId);
}

async function findOrCreateSocialUser({ provider, providerId, email }) {
  const byProvider = await findUserByProviderId(provider, providerId);
  if (byProvider) {
    return byProvider;
  }

  const existingByEmail = await findUserByEmail(email);
  if (existingByEmail) {
    await linkProviderToUser(existingByEmail.id, provider, providerId);
    return findUserById(existingByEmail.id);
  }

  return createSocialUser(email, provider, providerId);
}

module.exports = {
  findUserByEmail,
  findUserById,
  createUser,
  findOrCreateSocialUser
};
