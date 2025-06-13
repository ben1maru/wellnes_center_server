// server/middleware/errorHandler.js
const errorHandler = (err, req, res, next) => {
    console.error("ПОМИЛКА:", err.message); // Логуємо повідомлення помилки
    if (process.env.NODE_ENV === 'development') { // В режимі розробки можна логувати весь стек
        console.error(err.stack);
    }

    const statusCode = err.statusCode || 500;
    const responseMessage = err.message || 'Внутрішня помилка сервера';

    res.status(statusCode).json({
        message: responseMessage,
        // stack: process.env.NODE_ENV === 'development' ? err.stack : undefined, // Опціонально: показувати стек в режимі розробки
    });
};

module.exports = errorHandler;