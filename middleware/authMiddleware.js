// server/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const pool = require('../db'); // Припускаємо, що db.js експортує пул

const protect = async (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            const [rows] = await pool.query('SELECT id, first_name, last_name, email, role FROM users WHERE id = ?', [decoded.id]);
            
            if (rows.length === 0) {
                return res.status(401).json({ message: 'Не авторизовано, користувача не знайдено' });
            }
            req.user = rows[0]; // Додаємо об'єкт користувача до запиту
            next();
        } catch (error) {
            console.error('Помилка верифікації токена:', error.message);
            // Повертаємо конкретну помилку, якщо токен недійсний або прострочений
            if (error.name === 'JsonWebTokenError') {
                return res.status(401).json({ message: 'Не авторизовано, недійсний токен' });
            }
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({ message: 'Не авторизовано, термін дії токена закінчився' });
            }
            return res.status(401).json({ message: 'Не авторизовано, проблема з токеном' });
        }
    }

    if (!token) {
        return res.status(401).json({ message: 'Не авторизовано, немає токена' });
    }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) { // Перевірка, чи req.user взагалі існує
            return res.status(401).json({ message: 'Не авторизовано, для цієї дії потрібна автентифікація' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: `Користувач з роллю '${req.user.role}' не має дозволу на доступ до цього маршруту` });
        }
        next();
    };
};

module.exports = { protect, authorize };