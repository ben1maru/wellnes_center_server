const pool = require('../db');
const slugify = require('slugify'); // Може знадобитися, якщо захочемо унікальні slug для сторінок спеціалістів

// @desc    Отримати всіх активних спеціалістів з короткою інформацією
// @route   GET /api/specialists
// @access  Public
const getAllSpecialists = async (req, res, next) => {
    try {
        // Ми отримуємо спеціалістів, які пов'язані з активним користувачем типу 'specialist'
        // і мають заповнені основні дані.
        // Також можна додати фільтр is_active для самої таблиці specialists, якщо такий буде.
        const [specialists] = await pool.query(`
            SELECT 
                s.id, 
                s.user_id,
                s.first_name, 
                s.last_name, 
                s.specialization, 
                s.bio_short, 
                s.photo_url,
                GROUP_CONCAT(DISTINCT serv.name ORDER BY serv.name SEPARATOR ', ') as services_provided
            FROM specialists s
            LEFT JOIN users u ON s.user_id = u.id AND u.role = 'specialist'
            LEFT JOIN specialist_services ss ON s.id = ss.specialist_id
            LEFT JOIN services serv ON ss.service_id = serv.id AND serv.is_active = 1
            WHERE u.id IS NOT NULL  -- Переконуємось, що пов'язаний користувач існує і є спеціалістом
            GROUP BY s.id
            ORDER BY s.last_name, s.first_name;
        `);
        // Примітка: u.is_active (якщо таке поле є в users) або s.is_active (якщо таке поле буде в specialists) 
        // також може бути умовою WHERE. Зараз передбачається, що якщо user_id є, то спеціаліст "активний".

        res.json(specialists);
    } catch (error) {
        console.error("Помилка отримання списку спеціалістів:", error);
        next(error);
    }
};

// @desc    Отримати детальну інформацію про одного спеціаліста за його ID
// @route   GET /api/specialists/:id
// @access  Public
const getSpecialistById = async (req, res, next) => {
    const { id } = req.params;
    try {
        const [specialistRows] = await pool.query(`
            SELECT 
                s.id, 
                s.user_id,
                s.first_name, 
                s.last_name, 
                s.specialization, 
                s.bio_short, 
                s.bio_full, 
                s.photo_url,
                u.email as contact_email,  -- Додаємо контактну інформацію з таблиці users
                u.phone_number as contact_phone 
            FROM specialists s
            LEFT JOIN users u ON s.user_id = u.id 
            WHERE s.id = ? AND u.role = 'specialist'; 
        `, [id]);

        if (specialistRows.length === 0) {
            return res.status(404).json({ message: 'Спеціаліста не знайдено.' });
        }
        
        const specialist = specialistRows[0];

        // Отримати послуги, які надає цей спеціаліст
        const [services] = await pool.query(`
            SELECT serv.id, serv.name, serv.slug, serv.price, serv.duration_minutes
            FROM services serv
            JOIN specialist_services ss ON serv.id = ss.service_id
            WHERE ss.specialist_id = ? AND serv.is_active = 1
            ORDER BY serv.name;
        `, [id]);

        specialist.services_provided = services;

        // Тут можна додати отримання розкладу/доступних слотів, якщо потрібно на цій сторінці

        res.json(specialist);
    } catch (error) {
        console.error("Помилка отримання інформації про спеціаліста:", error);
        next(error);
    }
};

// @desc    Оновити інформацію про спеціаліста (для адміна або самого спеціаліста)
// @route   PUT /api/specialists/:id
// @access  Private (Admin or Own Specialist)
const updateSpecialistProfile = async (req, res, next) => {
    const { id } = req.params; // ID спеціаліста з таблиці specialists
    const { first_name, last_name, specialization, bio_short, bio_full, photo_url } = req.body;
    
    // Перевірка, чи користувач є адміном або власником профілю спеціаліста
    // req.user.id - це ID з таблиці users
    // req.user.role - роль користувача

    try {
        const [specialistToUpdateRows] = await pool.query('SELECT user_id FROM specialists WHERE id = ?', [id]);
        if (specialistToUpdateRows.length === 0) {
            return res.status(404).json({ message: "Профіль спеціаліста не знайдено." });
        }
        const specialistUserId = specialistToUpdateRows[0].user_id;

        if (req.user.role !== 'admin' && req.user.id !== specialistUserId) {
            return res.status(403).json({ message: "Недостатньо прав для оновлення цього профілю." });
        }

        // Оновлення даних в таблиці users, якщо first_name або last_name змінилися
        if (first_name || last_name) {
            const userUpdateFields = [];
            const userUpdateValues = [];
            if (first_name) {
                userUpdateFields.push('first_name = ?');
                userUpdateValues.push(first_name);
            }
            if (last_name) {
                userUpdateFields.push('last_name = ?');
                userUpdateValues.push(last_name);
            }
            if (userUpdateFields.length > 0) {
                userUpdateValues.push(specialistUserId); // Для WHERE user_id = ?
                await pool.query(`UPDATE users SET ${userUpdateFields.join(', ')} WHERE id = ?`, userUpdateValues);
            }
        }
        
        // Оновлення даних в таблиці specialists
        // Збираємо поля для оновлення, щоб не перезаписувати NULL значеннями, якщо вони не передані
        const currentSpecialistData = (await pool.query('SELECT * FROM specialists WHERE id = ?', [id]))[0][0];
        
        const updatedFirstName = first_name !== undefined ? first_name : currentSpecialistData.first_name;
        const updatedLastName = last_name !== undefined ? last_name : currentSpecialistData.last_name;
        const updatedSpecialization = specialization !== undefined ? specialization : currentSpecialistData.specialization;
        const updatedBioShort = bio_short !== undefined ? bio_short : currentSpecialistData.bio_short;
        const updatedBioFull = bio_full !== undefined ? bio_full : currentSpecialistData.bio_full;
        const updatedPhotoUrl = photo_url !== undefined ? photo_url : currentSpecialistData.photo_url;


        await pool.query(
            `UPDATE specialists SET 
                first_name = ?, 
                last_name = ?, 
                specialization = ?, 
                bio_short = ?, 
                bio_full = ?, 
                photo_url = ?
            WHERE id = ?`,
            [updatedFirstName, updatedLastName, updatedSpecialization, updatedBioShort, updatedBioFull, updatedPhotoUrl, id]
        );

        res.json({ 
            message: 'Профіль спеціаліста успішно оновлено.',
            id: Number(id),
            first_name: updatedFirstName,
            last_name: updatedLastName,
            specialization: updatedSpecialization,
            // ... інші поля
        });

    } catch (error) {
        console.error("Помилка оновлення профілю спеціаліста:", error);
        next(error);
    }
};


// @desc    Призначити/зняти послуги для спеціаліста (для адміна)
// @route   POST /api/specialists/:id/services
// @access  Private/Admin
const assignServicesToSpecialist = async (req, res, next) => {
    const { id: specialistId } = req.params; // ID спеціаліста
    const { service_ids } = req.body; // Масив ID послуг [1, 2, 3]

    if (!Array.isArray(service_ids)) {
        return res.status(400).json({ message: "service_ids повинен бути масивом." });
    }

    try {
        const [specialistExists] = await pool.query('SELECT id FROM specialists WHERE id = ?', [specialistId]);
        if (specialistExists.length === 0) {
            return res.status(404).json({ message: "Спеціаліста не знайдено." });
        }

        // Перевірка, чи всі передані service_ids існують
        if (service_ids.length > 0) {
            const placeholders = service_ids.map(() => '?').join(',');
            const [validServices] = await pool.query(`SELECT id FROM services WHERE id IN (${placeholders})`, service_ids);
            if (validServices.length !== service_ids.length) {
                const foundIds = validServices.map(s => s.id);
                const notFoundIds = service_ids.filter(id => !foundIds.includes(id));
                return res.status(400).json({ message: `Деякі ID послуг недійсні або не знайдені: ${notFoundIds.join(', ')}.` });
            }
        }

        // Початок транзакції
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            // Видалити всі поточні прив'язки послуг для цього спеціаліста
            await connection.query('DELETE FROM specialist_services WHERE specialist_id = ?', [specialistId]);

            // Додати нові прив'язки, якщо service_ids не порожній
            if (service_ids.length > 0) {
                const values = service_ids.map(serviceId => [specialistId, serviceId]);
                await connection.query('INSERT INTO specialist_services (specialist_id, service_id) VALUES ?', [values]);
            }

            await connection.commit();
            res.json({ message: `Послуги для спеціаліста ID ${specialistId} успішно оновлено.` });
        } catch (dbError) {
            await connection.rollback();
            console.error("Помилка бази даних при призначенні послуг:", dbError);
            next(new Error("Не вдалося оновити послуги спеціаліста через помилку бази даних."));
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error("Помилка призначення послуг спеціалісту:", error);
        if (!error.statusCode) { // Якщо це не HTTP помилка, яку ми вже кинули
           next(error);
        }
    }
};

// @desc    Отримати послуги, які надає конкретний спеціаліст
// @route   GET /api/specialists/:id/services
// @access  Public
const getSpecialistServices = async (req, res, next) => {
    const { id: specialistId } = req.params;
    try {
        const [specialistExists] = await pool.query('SELECT id FROM specialists WHERE id = ?', [specialistId]);
        if (specialistExists.length === 0) {
            return res.status(404).json({ message: "Спеціаліста не знайдено." });
        }

        const [services] = await pool.query(`
            SELECT serv.id, serv.name, serv.slug, serv.price, serv.duration_minutes 
            FROM services serv
            JOIN specialist_services ss ON serv.id = ss.service_id
            WHERE ss.specialist_id = ? AND serv.is_active = 1
            ORDER BY serv.name;
        `, [specialistId]);

        res.json(services);
    } catch (error) {
        console.error("Помилка отримання послуг спеціаліста:", error);
        next(error);
    }
};


// Можливо, в майбутньому:
// - Функція для адміна для створення нового спеціаліста (якщо реєстрація не покриває повністю)
// - Функція для деактивації/активації профілю спеціаліста

module.exports = {
    getAllSpecialists,
    getSpecialistById,
    updateSpecialistProfile,
    assignServicesToSpecialist,
    getSpecialistServices,
};