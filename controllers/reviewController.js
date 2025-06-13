const pool = require('../db');

// @desc    Додати відгук до послуги
// @route   POST /api/services/:serviceId/reviews
// @access  Private/Client (тільки залогінений користувач може залишити відгук)
const addReview = async (req, res, next) => {
    const { serviceId } = req.params;
    const { rating, comment } = req.body;
    const user_id = req.user.id;

    if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ message: "Рейтинг є обов'язковим і повинен бути від 1 до 5." });
    }
    // Коментар може бути необов'язковим, залежно від вимог
    if (comment && comment.length > 1000) { // Приклад обмеження довжини
        return res.status(400).json({ message: "Коментар занадто довгий (максимум 1000 символів)." });
    }

    try {
        // Перевірка, чи існує послуга
        const [serviceExists] = await pool.query('SELECT id FROM services WHERE id = ? AND is_active = 1', [serviceId]);
        if (serviceExists.length === 0) {
            return res.status(404).json({ message: "Послугу не знайдено або вона неактивна." });
        }

        // Перевірка, чи користувач вже залишав відгук на цю послугу (зазвичай дозволяється один відгук)
        const [existingReview] = await pool.query('SELECT id FROM reviews WHERE user_id = ? AND service_id = ?', [user_id, serviceId]);
        if (existingReview.length > 0) {
            return res.status(400).json({ message: "Ви вже залишили відгук на цю послугу." });
        }

        // Перевірка, чи користувач користувався цією послугою (опціонально, але бажано)
        // Наприклад, перевірити, чи є у користувача завершений запис ('completed') на цю послугу.
        const [completedAppointment] = await pool.query(
            "SELECT id FROM appointments WHERE user_id = ? AND service_id = ? AND status = 'completed'",
            [user_id, serviceId]
        );
        if (completedAppointment.length === 0) {
            // Можна повернути помилку або дозволити, але з позначкою, що відгук не від "перевіреного клієнта"
            return res.status(403).json({ message: "Ви можете залишати відгуки тільки на ті послуги, якими скористалися та які були завершені." });
        }
        
        // is_approved за замовчуванням 0, тобто відгук потребує модерації
        const [result] = await pool.query(
            'INSERT INTO reviews (user_id, service_id, rating, comment, is_approved) VALUES (?, ?, ?, ?, ?)',
            [user_id, serviceId, rating, comment || null, 0] // 0 - очікує схвалення
        );

        res.status(201).json({
            id: result.insertId,
            user_id,
            service_id: Number(serviceId),
            rating,
            comment: comment || null,
            is_approved: false,
            message: "Ваш відгук додано та очікує на модерацію."
        });
    } catch (error) {
        console.error("Помилка додавання відгуку:", error);
        next(error);
    }
};

// @desc    Отримати всі схвалені відгуки для конкретної послуги
// @route   GET /api/services/:serviceId/reviews
// @access  Public
const getServiceReviews = async (req, res, next) => {
    const { serviceId } = req.params;
    const { page = 1, limit = 5, sort = 'newest' } = req.query; // Додамо сортування
    const offset = (page - 1) * limit;

    let orderByClause = 'r.created_at DESC'; // newest
    if (sort === 'oldest') orderByClause = 'r.created_at ASC';
    if (sort === 'highest_rating') orderByClause = 'r.rating DESC, r.created_at DESC';
    if (sort === 'lowest_rating') orderByClause = 'r.rating ASC, r.created_at DESC';

    try {
        const [serviceExists] = await pool.query('SELECT id FROM services WHERE id = ? AND is_active = 1', [serviceId]);
        if (serviceExists.length === 0) {
            return res.status(404).json({ message: "Послугу не знайдено або вона неактивна." });
        }

        const [reviews] = await pool.query(`
            SELECT r.id, r.rating, r.comment, r.created_at, u.first_name, u.last_name 
            FROM reviews r
            JOIN users u ON r.user_id = u.id
            WHERE r.service_id = ? AND r.is_approved = 1
            ORDER BY ${orderByClause}
            LIMIT ? OFFSET ?
        `, [serviceId, parseInt(limit), parseInt(offset)]);

        const [totalResult] = await pool.query(
            'SELECT COUNT(id) as total FROM reviews WHERE service_id = ? AND is_approved = 1', 
            [serviceId]
        );
        const total = totalResult[0].total;

        res.json({
            reviews,
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / limit),
            totalReviews: total
        });
    } catch (error) {
        console.error("Помилка отримання відгуків для послуги:", error);
        next(error);
    }
};

// @desc    Отримати всі відгуки (для адміна, з можливістю фільтрації за статусом схвалення)
// @route   GET /api/reviews
// @access  Private/Admin
const getAllReviewsAdmin = async (req, res, next) => {
    const { page = 1, limit = 10, approved_status, service_id } = req.query; // approved_status: 'all', 'pending', 'approved'
    const offset = (page - 1) * limit;

    let baseQuery = `
        SELECT r.id, r.rating, r.comment, r.is_approved, r.created_at, r.updated_at,
               s.id as service_id_val, s.name as service_name,
               u.id as user_id_val, u.first_name as user_first_name, u.last_name as user_last_name, u.email as user_email
        FROM reviews r
        JOIN services s ON r.service_id = s.id
        JOIN users u ON r.user_id = u.id
    `;
    let countQuery = `SELECT COUNT(r.id) as total FROM reviews r`;

    const whereClauses = [];
    const queryParams = [];

    if (approved_status === 'pending') {
        whereClauses.push('r.is_approved = 0');
    } else if (approved_status === 'approved') {
        whereClauses.push('r.is_approved = 1');
    } // 'all' не додає умову

    if (service_id) {
        whereClauses.push('r.service_id = ?');
        queryParams.push(service_id);
    }
    
    if (whereClauses.length > 0) {
        const whereString = ` WHERE ${whereClauses.join(' AND ')}`;
        baseQuery += whereString;
        countQuery += whereString;
    }
    
    baseQuery += ' ORDER BY r.created_at DESC LIMIT ? OFFSET ?';
    const finalQueryParams = [...queryParams, parseInt(limit), parseInt(offset)];

    try {
        const [reviews] = await pool.query(baseQuery, finalQueryParams);
        const [totalResult] = await pool.query(countQuery, queryParams);
        const total = totalResult[0].total;

        res.json({
            reviews,
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / limit),
            totalReviews: total
        });
    } catch (error) {
        console.error("Помилка отримання всіх відгуків (адмін):", error);
        next(error);
    }
};

// @desc    Оновити статус схвалення відгуку (схвалити/відхилити)
// @route   PUT /api/reviews/:reviewId/approval
// @access  Private/Admin
const updateReviewApproval = async (req, res, next) => {
    const { reviewId } = req.params;
    const { is_approved } = req.body; // очікуємо true (схвалити) або false (неявно відхилити, або можна додати статус 'rejected')

    if (is_approved === undefined || typeof is_approved !== 'boolean') {
        return res.status(400).json({ message: "Статус 'is_approved' (true/false) є обов'язковим." });
    }

    try {
        const [reviewExists] = await pool.query('SELECT id FROM reviews WHERE id = ?', [reviewId]);
        if (reviewExists.length === 0) {
            return res.status(404).json({ message: "Відгук не знайдено." });
        }

        await pool.query('UPDATE reviews SET is_approved = ? WHERE id = ?', [is_approved, reviewId]);
        res.json({ message: `Статус відгуку ID ${reviewId} оновлено на ${is_approved ? 'схвалено' : 'не схвалено/приховано'}.` });
    } catch (error) {
        console.error("Помилка оновлення статусу схвалення відгуку:", error);
        next(error);
    }
};

// @desc    Видалити відгук
// @route   DELETE /api/reviews/:reviewId
// @access  Private/Admin
const deleteReview = async (req, res, next) => {
    const { reviewId } = req.params;
    try {
        const [reviewExists] = await pool.query('SELECT id FROM reviews WHERE id = ?', [reviewId]);
        if (reviewExists.length === 0) {
            return res.status(404).json({ message: "Відгук не знайдено." });
        }
        await pool.query('DELETE FROM reviews WHERE id = ?', [reviewId]);
        res.json({ message: `Відгук ID ${reviewId} успішно видалено.` });
    } catch (error) {
        console.error("Помилка видалення відгуку:", error);
        next(error);
    }
};


module.exports = {
    addReview,
    getServiceReviews,
    getAllReviewsAdmin,
    updateReviewApproval,
    deleteReview
};