const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const pool = require('./db'); // Ваш файл підключення до БД
const errorHandler = require('./middleware/errorHandler'); // Наш обробник помилок

// Завантаження змінних середовища
dotenv.config();

// Ініціалізація Express додатку
const app = express();

// Middleware для CORS (дозволяє запити з інших доменів)
app.use(cors()); // Для розробки можна залишити так, для продакшену налаштувати конкретні домени

// Middleware для парсингу JSON тіл запитів
app.use(express.json());

// Middleware для парсингу URL-encoded тіл запитів
app.use(express.urlencoded({ extended: true }));
 

// --- Підключення маршрутів ---
const authRoutes = require('./routes/authRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const specialistRoutes = require('./routes/specialistRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const postRoutes = require('./routes/postRoutes');
const reviewRoutes = require('./routes/reviewRoutes'); // Для адмінських дій над відгуками
const contactMessageRoutes = require('./routes/contactMessageRoutes');

// Використання маршрутів
app.use('/api/auth', authRoutes);
app.use('/api/services', serviceRoutes); // Також включає маршрути для категорій послуг та відгуків до послуг
app.use('/api/specialists', specialistRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/posts', postRoutes); // Також включає маршрути для категорій постів та коментарів
app.use('/api/reviews', reviewRoutes); // Окремі маршрути для адміністрування всіх відгуків
app.use('/api/contact-messages', contactMessageRoutes);


// --- Базовий маршрут для перевірки ---
app.get('/api', (req, res) => {
    res.json({ message: 'Ласкаво просимо до API Оздоровчого Центру!' });
});


// --- Обробник помилок (має бути останнім middleware) ---
app.use(errorHandler);


// Визначення порту та запуск сервера
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Сервер запущено на порті ${PORT} в режимі ${process.env.NODE_ENV || 'development'}`);
    // Перевірка підключення до БД (вже є в db.js, але можна тут повторити для логу при старті)
    pool.getConnection()
        .then(connection => {
            console.log('Успішне підключення до бази даних при старті сервера.');
            connection.release();
        })
        .catch(err => {
            console.error('Помилка підключення до бази даних при старті сервера:', err.message);
        });
});