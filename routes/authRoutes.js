const express = require('express');
const router = express.Router();
const { registerUser, loginUser, getMe } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

// @route   POST /api/auth/register
// @desc    Реєстрація нового користувача
// @access  Public
router.post('/register', registerUser);

// @route   POST /api/auth/login
// @desc    Аутентифікація користувача та отримання токена
// @access  Public
router.post('/login', loginUser);

// @route   GET /api/auth/me
// @desc    Отримати профіль поточного користувача
// @access  Private
router.get('/me', protect, getMe);

module.exports = router;