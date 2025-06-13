const pool = require('../db');

// @desc    Надіслати нове повідомлення з контактної форми
// @route   POST /api/contact-messages
// @access  Public
const createContactMessage = async (req, res, next) => {
    const { name, email, phone, subject, message } = req.body;

    if (!name || !email || !message) {
        return res.status(400).json({ message: "Ім'я, електронна пошта та текст повідомлення є обов'язковими." });
    }

    // Валідація email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Некоректний формат електронної пошти." });
    }

    // Валідація телефону (якщо потрібно, приклад: +380XXXXXXXXX або 0XXXXXXXXX)
    if (phone) {
        const phoneRegex = /^(?:\+380|0)\d{9}$/;
        if (!phoneRegex.test(phone)) {
            // Можна зробити це попередженням, а не помилкою, якщо формат не критичний
            // return res.status(400).json({ message: "Некоректний формат номера телефону." });
        }
    }

    try {
        const [result] = await pool.query(
            'INSERT INTO contact_messages (name, email, phone, subject, message, status) VALUES (?, ?, ?, ?, ?, ?)',
            [name, email, phone || null, subject || null, message, 'new'] // Статус 'new' за замовчуванням
        );

        // Тут можна додати логіку відправки сповіщення адміністратору про нове повідомлення

        res.status(201).json({
            id: result.insertId,
            name,
            email,
            phone: phone || null,
            subject: subject || null,
            message,
            status: 'new',
            message_response: 'Ваше повідомлення успішно надіслано. Ми зв\'яжемося з вами найближчим часом.'
        });
    } catch (error) {
        console.error("Помилка надсилання контактного повідомлення:", error);
        next(error);
    }
};

// @desc    Отримати всі контактні повідомлення (для адміна)
// @route   GET /api/contact-messages
// @access  Private/Admin
const getAllContactMessages = async (req, res, next) => {
    const { page = 1, limit = 10, status, search } = req.query; // Фільтрація за статусом, пошук
    const offset = (page - 1) * limit;

    let baseQuery = `SELECT id, name, email, phone, subject, LEFT(message, 100) as message_preview, status, created_at, updated_at FROM contact_messages`;
    let countQuery = `SELECT COUNT(id) as total FROM contact_messages`;
    
    const whereClauses = [];
    const queryParams = [];

    if (status && ['new', 'read', 'replied', 'archived'].includes(status)) {
        whereClauses.push('status = ?');
        queryParams.push(status);
    }
    if (search) {
        whereClauses.push('(name LIKE ? OR email LIKE ? OR subject LIKE ? OR message LIKE ?)');
        const searchTerm = `%${search}%`;
        queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (whereClauses.length > 0) {
        const whereString = ` WHERE ${whereClauses.join(' AND ')}`;
        baseQuery += whereString;
        countQuery += whereString;
    }

    baseQuery += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const finalQueryParams = [...queryParams, parseInt(limit), parseInt(offset)];

    try {
        const [messages] = await pool.query(baseQuery, finalQueryParams);
        const [totalResult] = await pool.query(countQuery, queryParams);
        const total = totalResult[0].total;

        res.json({
            messages,
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / limit),
            totalMessages: total
        });
    } catch (error) {
        console.error("Помилка отримання контактних повідомлень (адмін):", error);
        next(error);
    }
};

// @desc    Отримати одне контактне повідомлення за ID (для адміна)
// @route   GET /api/contact-messages/:id
// @access  Private/Admin
const getContactMessageById = async (req, res, next) => {
    const { id } = req.params;
    try {
        const [messageRows] = await pool.query('SELECT * FROM contact_messages WHERE id = ?', [id]);
        if (messageRows.length === 0) {
            return res.status(404).json({ message: "Контактне повідомлення не знайдено." });
        }
        
        const message = messageRows[0];
        
        // Автоматично змінити статус на 'read', якщо він був 'new'
        if (message.status === 'new') {
            await pool.query("UPDATE contact_messages SET status = 'read', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
            message.status = 'read'; // Оновити статус в об'єкті, що повертається
        }

        res.json(message);
    } catch (error) {
        console.error("Помилка отримання контактного повідомлення за ID:", error);
        next(error);
    }
};

// @desc    Оновити статус контактного повідомлення (для адміна)
// @route   PUT /api/contact-messages/:id/status
// @access  Private/Admin
const updateContactMessageStatus = async (req, res, next) => {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = ['new', 'read', 'replied', 'archived'];
    if (!status || !allowedStatuses.includes(status)) {
        return res.status(400).json({ message: `Некоректний або відсутній статус. Дозволені статуси: ${allowedStatuses.join(', ')}.` });
    }

    try {
        const [messageExists] = await pool.query('SELECT id FROM contact_messages WHERE id = ?', [id]);
        if (messageExists.length === 0) {
            return res.status(404).json({ message: "Контактне повідомлення не знайдено." });
        }

        await pool.query('UPDATE contact_messages SET status = ? WHERE id = ?', [status, id]);
        res.json({ message: `Статус повідомлення ID ${id} оновлено на '${status}'.` });
    } catch (error) {
        console.error("Помилка оновлення статусу контактного повідомлення:", error);
        next(error);
    }
};

// @desc    Видалити контактне повідомлення (для адміна)
// @route   DELETE /api/contact-messages/:id
// @access  Private/Admin
const deleteContactMessage = async (req, res, next) => {
    const { id } = req.params;
    try {
        const [messageExists] = await pool.query('SELECT id FROM contact_messages WHERE id = ?', [id]);
        if (messageExists.length === 0) {
            return res.status(404).json({ message: "Контактне повідомлення не знайдено." });
        }
        await pool.query('DELETE FROM contact_messages WHERE id = ?', [id]);
        res.json({ message: `Контактне повідомлення ID ${id} успішно видалено.` });
    } catch (error) {
        console.error("Помилка видалення контактного повідомлення:", error);
        next(error);
    }
};

module.exports = {
    createContactMessage,
    getAllContactMessages,
    getContactMessageById,
    updateContactMessageStatus,
    deleteContactMessage
};