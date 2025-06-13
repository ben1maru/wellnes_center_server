const pool = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// --- Допоміжні функції (раніше планувалися в utils) ---
const hashPassword = async (password) => {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
};

const comparePassword = async (enteredPassword, hashedPassword) => {
    return await bcrypt.compare(enteredPassword, hashedPassword);
};

const generateToken = (userId, role) => {
    return jwt.sign({ id: userId, role: role }, process.env.JWT_SECRET, {
        expiresIn: '1d', // Токен дійсний 1 день, можна змінити
    });
};
// --- Кінець допоміжних функцій ---

// @desc    Реєстрація нового користувача
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res, next) => {
    const { first_name, last_name, email, phone_number, password, role = 'client' } = req.body;

    if (!first_name || !last_name || !email || !password) {
        return res.status(400).json({ message: "Будь ласка, надайте всі обов'язкові поля: ім'я, прізвище, електронна пошта та пароль." });
    }

    // Валідація email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Некоректний формат електронної пошти." });
    }

    // Валідація пароля (наприклад, мінімум 6 символів)
    if (password.length < 6) {
        return res.status(400).json({ message: "Пароль повинен містити щонайменше 6 символів." });
    }

    try {
        // Перевірка, чи існує користувач з такою поштою
        let [existingUsers] = await pool.query('SELECT email FROM users WHERE email = ?', [email]);
        if (existingUsers.length > 0) {
            return res.status(400).json({ message: 'Користувач з такою електронною поштою вже існує.' });
        }

        // Перевірка, чи існує користувач з таким номером телефону (якщо надано)
        if (phone_number) {
            [existingUsers] = await pool.query('SELECT phone_number FROM users WHERE phone_number = ?', [phone_number]);
            if (existingUsers.length > 0) {
                return res.status(400).json({ message: 'Користувач з таким номером телефону вже існує.' });
            }
        }
        
        const hashedPassword = await hashPassword(password);

        const [result] = await pool.query(
            'INSERT INTO users (first_name, last_name, email, phone_number, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)',
            [first_name, last_name, email, phone_number || null, hashedPassword, role]
        );

        const userId = result.insertId;

        // Якщо реєструється спеціаліст, можна одразу створити запис в таблиці specialists
        // Згідно з ТЗ, спеціаліст має first_name, last_name, які вже є в users.
        // Інші поля (specialization, bio_short, bio_full, photo_url) будуть додані/оновлені пізніше.
        if (role === 'specialist') {
            await pool.query(
                'INSERT INTO specialists (user_id, first_name, last_name) VALUES (?, ?, ?)',
                [userId, first_name, last_name]
            );
        }

        const token = generateToken(userId, role);

        res.status(201).json({
            id: userId,
            first_name,
            last_name,
            email,
            phone_number: phone_number || null,
            role,
            token,
        });
    } catch (error) {
        console.error("Помилка реєстрації:", error);
        next(error); // Передаємо помилку обробнику помилок
    }
};

// @desc    Аутентифікація користувача та отримання токена
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res, next) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Будь ласка, надайте електронну пошту та пароль.' });
    }

    try {
        const [users] = await pool.query('SELECT id, first_name, last_name, email, password_hash, role, phone_number FROM users WHERE email = ?', [email]);

        if (users.length === 0) {
            return res.status(401).json({ message: 'Невірні облікові дані (користувача не знайдено).' });
        }

        const user = users[0];
        const isMatch = await comparePassword(password, user.password_hash);

        if (!isMatch) {
            return res.status(401).json({ message: 'Невірні облікові дані (пароль не співпадає).' });
        }

        const token = generateToken(user.id, user.role);

        res.json({
            id: user.id,
            first_name: user.first_name,
            last_name: user.last_name,
            email: user.email,
            phone_number: user.phone_number,
            role: user.role,
            token: token,
        });
    } catch (error) {
        console.error("Помилка входу:", error);
        next(error);
    }
};

// @desc    Отримати профіль поточного користувача
// @route   GET /api/auth/me
// @access  Private (потрібен токен і спрацювання middleware 'protect')
const getMe = async (req, res, next) => {
    // req.user заповнюється middleware 'protect'
    // middleware 'protect' вже витягнув основні дані користувача з БД
    if (!req.user) {
        // Цей випадок малоймовірний, якщо 'protect' спрацював правильно,
        // але для безпеки можна залишити
        return res.status(404).json({ message: 'Користувача не знайдено або не авторизовано.' });
    }
    
    // Можна додати отримання додаткової інформації, якщо потрібно, наприклад, для спеціаліста
    try {
        if (req.user.role === 'specialist') {
            const [specialistDetails] = await pool.query(
                'SELECT specialization, bio_short, bio_full, photo_url FROM specialists WHERE user_id = ?',
                [req.user.id]
            );
            if (specialistDetails.length > 0) {
                req.user.specialist_details = specialistDetails[0];
            }
        }
        res.json(req.user);
    } catch (error) {
        console.error("Помилка отримання профілю:", error);
        next(error);
    }
};

module.exports = {
    registerUser,
    loginUser,
    getMe,
};