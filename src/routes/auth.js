const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signUser } = require('../middleware/auth');
const { badRequest, unauthorized } = require('../utils/errors');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) throw badRequest('username and password are required.');
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    throw unauthorized('Username or Password incorrect. Please try again.');
  }
  const accessToken = signUser(user);
  res.status(200).json({
    accessToken,
    tokenType: 'Bearer',
    expiresIn: 28800,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      provinceCode: user.province_code,
      districtCode: user.district_code,
    },
  });
});

module.exports = router;
