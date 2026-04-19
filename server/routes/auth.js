const express = require('express');
const crypto = require('crypto');
const { promisify } = require('util');
const User = require('../models/User');

const router = express.Router();
const pbkdf2 = promisify(crypto.pbkdf2);

// --- Async hash helpers (non-blocking) ---
async function makeStoredHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const buf = await pbkdf2(password, salt, 100000, 64, 'sha512');
  return `${salt}:${buf.toString('hex')}`;
}

async function verifyStoredHash(password, storedHash) {
  try {
    const [salt, hash] = String(storedHash || '').split(':');
    if (!salt || !hash) return false;
    const inputBuf = await pbkdf2(password, salt, 100000, 64, 'sha512');
    const hashBuffer = Buffer.from(hash, 'hex');
    if (hashBuffer.length !== inputBuf.length) return false;
    return crypto.timingSafeEqual(hashBuffer, inputBuf);
  } catch {
    return false;
  }
}

// ─── EMAIL REGEX ────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── SIGNUP ─────────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  if (!EMAIL_RE.test(normalizedEmail)) {
    return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ success: false, error: 'Password must be at least 6 characters.' });
  }

  try {
    const exists = await User.findOne({ email: normalizedEmail });
    if (exists) {
      return res.status(409).json({ success: false, error: 'Email already registered.' });
    }

    const passwordHash = await makeStoredHash(password); // async — does NOT block event loop
    const user = await User.create({ email: normalizedEmail, passwordHash });

    return res.status(201).json({
      success: true,
      message: 'Sign up successful.',
      user: { email: user.email },
    });
  } catch (err) {
    console.error('Signup error:', err.message);
    return res.status(500).json({ success: false, error: 'Server error during sign up.' });
  }
});

// ─── SIGNIN ─────────────────────────────────────────────────────
router.post('/signin', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const allowedEmail = String(process.env.AUTH_EMAIL || '').trim().toLowerCase();
  const allowedPassword = String(process.env.AUTH_PASSWORD || '');
  const hasEnvAdmin = !!allowedEmail && !!allowedPassword;

  // Fast-path: env-based admin account (plain text compare only for env admin)
  if (hasEnvAdmin && normalizedEmail === allowedEmail && password === allowedPassword) {
    return res.status(200).json({
      success: true,
      message: 'Sign in successful.',
      user: { email: normalizedEmail },
    });
  }

  try {
    const user = await User.findOne({ email: normalizedEmail });
    if (user && (await verifyStoredHash(password, user.passwordHash))) {
      return res.status(200).json({
        success: true,
        message: 'Sign in successful.',
        user: { email: user.email },
      });
    }

    return res.status(401).json({ success: false, error: 'Invalid email or password.' });
  } catch (err) {
    console.error('Signin error:', err.message);
    return res.status(500).json({ success: false, error: 'Server error during sign in.' });
  }
});

module.exports = router;
