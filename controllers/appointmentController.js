// server/controllers/appointmentController.js
const pool = require('../db');
const { isBefore, addMinutes, formatISO, parseISO, isValid } = require('date-fns');

// @desc    Створити новий запис на прийом
// @route   POST /api/appointments
// @access  Private (Client)
const createAppointment = async (req, res, next) => {
    const { service_id, specialist_id, appointment_datetime, client_notes } = req.body;
    const user_id = req.user.id;

    if (!service_id || !appointment_datetime) {
        return res.status(400).json({ message: "ID послуги та дата/час запису є обов'язковими." });
    }

    let parsedDateTime;
    if (typeof appointment_datetime === 'string') {
        parsedDateTime = parseISO(appointment_datetime);
    } else if (appointment_datetime instanceof Date) {
        parsedDateTime = appointment_datetime; // Вже об'єкт Date
    } else {
        return res.status(400).json({ message: "Некоректний формат дати/часу запису." });
    }

    if (!isValid(parsedDateTime) || isBefore(parsedDateTime, new Date())) {
         return res.status(400).json({ message: "Некоректна дата або час запису. Запис можливий лише на майбутній час." });
    }
    
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [serviceRows] = await connection.query('SELECT duration_minutes, price FROM services WHERE id = ? AND is_active = 1', [service_id]);
        if (serviceRows.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ message: "Послугу не знайдено або вона неактивна." });
        }
        const serviceDuration = serviceRows[0].duration_minutes;

        if (specialist_id) {
            const [specialistServiceRows] = await connection.query(
                'SELECT ss.specialist_id FROM specialist_services ss JOIN specialists s ON ss.specialist_id = s.id JOIN users u ON s.user_id = u.id WHERE ss.specialist_id = ? AND ss.service_id = ? AND u.role = "specialist"',
                [specialist_id, service_id]
            );
            if (specialistServiceRows.length === 0) {
                await connection.rollback();
                connection.release();
                return res.status(400).json({ message: "Обраний спеціаліст не надає цю послугу або не є активним спеціалістом." });
            }
        } else {
            const [anySpecialistProvidesService] = await connection.query(
                'SELECT COUNT(DISTINCT ss.specialist_id) as count FROM specialist_services ss JOIN specialists s ON ss.specialist_id = s.id JOIN users u ON s.user_id = u.id WHERE ss.service_id = ? AND u.role = "specialist"',
                [service_id]
            );
            if (anySpecialistProvidesService[0].count === 0) {
                 await connection.rollback();
                 connection.release();
                 return res.status(400).json({ message: "Наразі жоден спеціаліст не надає обрану послугу." });
            }
        }

        if (specialist_id) {
            const appointmentStart = parsedDateTime;
            const appointmentEnd = addMinutes(appointmentStart, serviceDuration);

            const [overlappingAppointments] = await connection.query(
                `SELECT id, appointment_datetime, duration_minutes FROM appointments 
                 WHERE specialist_id = ? AND status NOT IN ('cancelled_by_client', 'cancelled_by_admin', 'completed', 'no_show')`,
                [specialist_id]
            );
            
            for (const existingApp of overlappingAppointments) {
                let existingAppStart = existingApp.appointment_datetime;
                if (!(existingAppStart instanceof Date)) {
                    existingAppStart = parseISO(existingApp.appointment_datetime);
                }
                 if (!isValid(existingAppStart)) continue; // Пропустити, якщо дата невалідная

                const existingAppEnd = addMinutes(existingAppStart, existingApp.duration_minutes);
                // Перевірка на перетин: (StartA < EndB) and (EndA > StartB)
                if (isBefore(appointmentStart, existingAppEnd) && isBefore(existingAppStart, appointmentEnd)) {
                    await connection.rollback();
                    connection.release();
                    return res.status(409).json({ message: "Обраний час вже зайнятий у цього спеціаліста. Будь ласка, оберіть інший час." });
                }
            }
        }
        
        const [result] = await connection.query(
            'INSERT INTO appointments (user_id, specialist_id, service_id, appointment_datetime, duration_minutes, client_notes, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [user_id, specialist_id || null, service_id, formatISO(parsedDateTime), serviceDuration, client_notes || null, 'pending']
        );
        
        await connection.commit();
        
        res.status(201).json({
            id: result.insertId,
            user_id,
            specialist_id: specialist_id || null,
            service_id,
            appointment_datetime: formatISO(parsedDateTime),
            duration_minutes: serviceDuration,
            status: 'pending',
            message: 'Запис успішно створено та очікує підтвердження.'
        });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error("Помилка створення запису:", error);
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const getMyAppointments = async (req, res, next) => {
    const user_id = req.user.id;
    try {
        const [appointments] = await pool.query(
            `SELECT 
                a.id, a.appointment_datetime, a.duration_minutes, a.status, a.client_notes, a.admin_notes,
                s.name as service_name, s.price as service_price,
                sp.first_name as specialist_first_name, sp.last_name as specialist_last_name, sp.specialization as specialist_specialization
             FROM appointments a
             JOIN services s ON a.service_id = s.id
             LEFT JOIN specialists sp ON a.specialist_id = sp.id
             WHERE a.user_id = ?
             ORDER BY a.appointment_datetime DESC`,
            [user_id]
        );
        res.json(appointments);
    } catch (error) {
        console.error("Помилка отримання записів клієнта:", error);
        next(error);
    }
};

const getAllAppointments = async (req, res, next) => {
    const { specialist_id, client_id, status, date_from, date_to } = req.query;
    // Додаємо filterParams для обробки фільтрів, переданих з AdminAppointmentsPage (календар)
    const filterParams = req.query.filterParams ? JSON.parse(req.query.filterParams) : {};


    let query = `
        SELECT 
            a.id, a.user_id, a.specialist_id, a.appointment_datetime, a.duration_minutes, a.status, 
            a.client_notes, a.admin_notes,
            s.name as service_name, s.price as service_price,
            u.first_name as client_first_name, u.last_name as client_last_name, u.email as client_email,
            sp_user.first_name as specialist_first_name, sp_user.last_name as specialist_last_name 
            /* sp.id as specialist_id_val - вже є a.specialist_id */
        FROM appointments a
        JOIN services s ON a.service_id = s.id
        JOIN users u ON a.user_id = u.id
        LEFT JOIN specialists sp ON a.specialist_id = sp.id
        LEFT JOIN users sp_user ON sp.user_id = sp_user.id 
        WHERE 1=1 
    `; // Додав sp_user для імені спеціаліста
    const queryParams = [];

    // Застосовуємо фільтри з filterParams (які можуть прийти з календаря адміна)
    const effectiveSpecialistId = filterParams.specialist_id || specialist_id;
    const effectiveClientId = filterParams.client_id || client_id;
    const effectiveStatus = filterParams.status || status;

    if (req.user.role === 'specialist') {
        const [specialistProfile] = await pool.query('SELECT id FROM specialists WHERE user_id = ?', [req.user.id]);
        if (specialistProfile.length === 0) {
            return res.status(403).json({ message: "Профіль спеціаліста не знайдено." });
        }
        query += ' AND a.specialist_id = ?';
        queryParams.push(specialistProfile[0].id);
    } else if (req.user.role === 'admin') {
        if (effectiveSpecialistId) {
            query += ' AND a.specialist_id = ?';
            queryParams.push(effectiveSpecialistId);
        }
        if (effectiveClientId) {
            query += ' AND a.user_id = ?';
            queryParams.push(effectiveClientId);
        }
    }

    if (effectiveStatus) {
        query += ' AND a.status = ?';
        queryParams.push(effectiveStatus);
    }

    // Фільтри date_from та date_to з календаря (або з прямих query параметрів)
    const effectiveDateFrom = filterParams.date_from || date_from;
    const effectiveDateTo = filterParams.date_to || date_to;


    if (effectiveDateFrom) {
        let parsedDateFrom = effectiveDateFrom;
        if (!(parsedDateFrom instanceof Date)){
            parsedDateFrom = parseISO(effectiveDateFrom);
        }
        if(isValid(parsedDateFrom)){
            query += ' AND DATE(a.appointment_datetime) >= ?';
            queryParams.push(formatISO(parsedDateFrom, { representation: 'date' }));
        }
    }
    if (effectiveDateTo) {
        let parsedDateTo = effectiveDateTo;
        if(!(parsedDateTo instanceof Date)){
            parsedDateTo = parseISO(effectiveDateTo);
        }
        if(isValid(parsedDateTo)){
            query += ' AND DATE(a.appointment_datetime) <= ?';
            queryParams.push(formatISO(parsedDateTo, { representation: 'date' }));
        }
    }

    query += ' ORDER BY a.appointment_datetime DESC';

    try {
        const [appointments] = await pool.query(query, queryParams);
        res.json(appointments);
    } catch (error) {
        console.error("Помилка отримання всіх записів:", error);
        next(error);
    }
};

const getAppointmentById = async (req, res, next) => {
    const { id } = req.params;
    try {
        const [appointmentRows] = await pool.query(
             `SELECT 
                a.*, 
                s.name as service_name, s.price as service_price,
                u.first_name as client_first_name, u.last_name as client_last_name, u.email as client_email,
                sp_user.first_name as specialist_first_name, sp_user.last_name as specialist_last_name
             FROM appointments a
             JOIN services s ON a.service_id = s.id
             JOIN users u ON a.user_id = u.id
             LEFT JOIN specialists sp ON a.specialist_id = sp.id
             LEFT JOIN users sp_user ON sp.user_id = sp_user.id
             WHERE a.id = ?`, [id]
        );

        if (appointmentRows.length === 0) {
            return res.status(404).json({ message: "Запис не знайдено." });
        }
        const appointment = appointmentRows[0];

        if (req.user.role === 'client' && req.user.id !== appointment.user_id) {
            return res.status(403).json({ message: "Ви не маєте доступу до цього запису." });
        }
        if (req.user.role === 'specialist') {
             const [specialistProfile] = await pool.query('SELECT id FROM specialists WHERE user_id = ?', [req.user.id]);
             if (specialistProfile.length === 0 || specialistProfile[0].id !== appointment.specialist_id) {
                 return res.status(403).json({ message: "Ви не маєте доступу до цього запису." });
             }
        }
        res.json(appointment);
    } catch (error) {
        console.error("Помилка отримання запису за ID:", error);
        next(error);
    }
};

const updateAppointment = async (req, res, next) => {
    const { id } = req.params;
    const { user_id: clientUserId, status, admin_notes, specialist_id, service_id, appointment_datetime, client_notes } = req.body;
    
    const allowedStatuses = ['pending', 'confirmed', 'cancelled_by_client', 'cancelled_by_admin', 'completed', 'no_show'];
    if (status && !allowedStatuses.includes(status)) {
        return res.status(400).json({ message: `Недозволений статус: ${status}.` });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [appointmentRows] = await connection.query('SELECT * FROM appointments WHERE id = ?', [id]);
        if (appointmentRows.length === 0) {
            await connection.rollback(); connection.release();
            return res.status(404).json({ message: "Запис не знайдено." });
        }
        const currentAppointment = appointmentRows[0];

        let canUpdate = false;
        if (req.user.role === 'admin') {
            canUpdate = true;
        } else if (req.user.role === 'specialist') {
            const [specialistProfile] = await connection.query('SELECT id FROM specialists WHERE user_id = ?', [req.user.id]);
            if (specialistProfile.length > 0 && specialistProfile[0].id === currentAppointment.specialist_id) {
                if ((status === 'completed' || status === 'no_show') || (admin_notes !== undefined && !status && !specialist_id && !service_id && !appointment_datetime && !client_notes && !clientUserId )) {
                    canUpdate = true;
                } else if (status && ['completed', 'no_show'].includes(status)) {
                    canUpdate = true;
                }
            }
        } else if (req.user.role === 'client' && req.user.id === currentAppointment.user_id) {
            if (status === 'cancelled_by_client' && (currentAppointment.status === 'pending' || currentAppointment.status === 'confirmed')) {
                canUpdate = true;
            }
        }

        if (!canUpdate) {
             await connection.rollback(); connection.release();
             return res.status(403).json({ message: "Недостатньо прав для оновлення цього запису або зміни на цей статус." });
        }

        const updateFields = {};
        if (status) updateFields.status = status;
        if (admin_notes !== undefined) updateFields.admin_notes = admin_notes;
        
        // Адмін може змінювати більше полів
        if (req.user.role === 'admin') {
            if (clientUserId !== undefined) updateFields.user_id = clientUserId;
            if (specialist_id !== undefined) {
                if (specialist_id !== null) {
                    const [specService] = await connection.query(
                        'SELECT ss.specialist_id FROM specialist_services ss JOIN specialists s ON ss.specialist_id = s.id JOIN users u ON s.user_id = u.id WHERE ss.specialist_id = ? AND ss.service_id = ? AND u.role = "specialist"',
                        [specialist_id, service_id || currentAppointment.service_id]
                    );
                    if (specService.length === 0) {
                        await connection.rollback(); connection.release();
                        return res.status(400).json({ message: "Обраний спеціаліст не надає обрану послугу." });
                    }
                }
                updateFields.specialist_id = specialist_id;
            }
            if (service_id !== undefined) {
                 const [serviceCheck] = await connection.query('SELECT duration_minutes FROM services WHERE id = ? AND is_active = 1', [service_id]);
                 if (serviceCheck.length === 0) {
                     await connection.rollback(); connection.release();
                     return res.status(400).json({ message: "Обрану послугу не знайдено або вона неактивна." });
                 }
                 updateFields.service_id = service_id;
                 updateFields.duration_minutes = serviceCheck[0].duration_minutes; // Оновлюємо тривалість
            }
            if (appointment_datetime !== undefined) {
                let parsedNewDateTime = appointment_datetime;
                if (typeof appointment_datetime === 'string') parsedNewDateTime = parseISO(appointment_datetime);
                if (!isValid(parsedNewDateTime)) {
                    await connection.rollback(); connection.release();
                    return res.status(400).json({ message: "Некоректна нова дата/час запису." });
                }
                updateFields.appointment_datetime = formatISO(parsedNewDateTime);
            }
             if (client_notes !== undefined) updateFields.client_notes = client_notes;
        }


        if (Object.keys(updateFields).length === 0) {
            await connection.rollback(); connection.release();
            return res.status(400).json({ message: "Немає даних для оновлення." });
        }
        
        const setClauses = Object.keys(updateFields).map(key => `${key} = ?`).join(', ');
        const values = [...Object.values(updateFields), id];

        await connection.query(`UPDATE appointments SET ${setClauses} WHERE id = ?`, values);
        await connection.commit();
        
        res.json({ message: 'Запис успішно оновлено.', id: Number(id), ...updateFields });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error("Помилка оновлення запису:", error);
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const getAvailableSlots = async (req, res, next) => {
    const { service_id, specialist_id, date } = req.query;

    if (!service_id || !date) {
        return res.status(400).json({ message: "ID послуги та дата є обов'язковими." });
    }
    
    let queryDate = date;
    if (typeof date === 'string'){
        queryDate = parseISO(date);
    }
    
    if (!isValid(queryDate) || isBefore(queryDate, new Date().setHours(0,0,0,0))) {
        return res.status(400).json({ message: "Некоректна дата. Можна переглядати доступність тільки на майбутні дати." });
    }

    try {
        const [serviceRows] = await pool.query('SELECT duration_minutes FROM services WHERE id = ? AND is_active = 1', [service_id]);
        if (serviceRows.length === 0) {
            return res.status(404).json({ message: "Послугу не знайдено або вона неактивна." });
        }
        const serviceDuration = serviceRows[0].duration_minutes;

        const workDayStartHour = 9;
        const workDayEndHour = 18; // До 18:00 включно, отже слоти до 17:xx
        const slotIntervalMinutes = 30;

        let specialistsToCheck = [];
        if (specialist_id) {
            const [specExists] = await pool.query(
                `SELECT s.id FROM specialists s JOIN users u ON s.user_id = u.id JOIN specialist_services ss ON s.id = ss.specialist_id
                 WHERE s.id = ? AND u.role = 'specialist' AND ss.service_id = ?`,
                [specialist_id, service_id]
            );
            if (specExists.length === 0) {
                return res.status(404).json({ message: "Обраний спеціаліст не знайдений/неактивний/не надає цю послугу." });
            }
            specialistsToCheck.push(specialist_id);
        } else {
            const [allSpecsForService] = await pool.query(
                `SELECT s.id FROM specialists s JOIN users u ON s.user_id = u.id JOIN specialist_services ss ON s.id = ss.specialist_id
                 WHERE ss.service_id = ? AND u.role = 'specialist'`,
                [service_id]
            );
            if (allSpecsForService.length === 0) return res.json([]);
            specialistsToCheck = allSpecsForService.map(s => s.id);
        }

        const availableSlotsBySpecialist = {};
        const formattedQueryDate = formatISO(queryDate, { representation: 'date' });

        for (const specId of specialistsToCheck) {
            const [appointments] = await pool.query(
                `SELECT appointment_datetime, duration_minutes FROM appointments 
                 WHERE specialist_id = ? AND DATE(appointment_datetime) = ? AND status NOT IN ('cancelled_by_client', 'cancelled_by_admin', 'no_show')`,
                [specId, formattedQueryDate]
            );

            const bookedSlots = appointments.map(app => {
                // ВИПРАВЛЕННЯ: Перевіряємо тип app.appointment_datetime
                let start;
                if (app.appointment_datetime instanceof Date) {
                    start = app.appointment_datetime;
                } else if (typeof app.appointment_datetime === 'string') {
                    start = parseISO(app.appointment_datetime);
                } else {
                    console.warn('Невідомий тип дати для запису:', app.appointment_datetime);
                    return null; // Пропустити цей запис, якщо дата незрозуміла
                }

                if (!isValid(start)) {
                     console.warn('Невалідний час запису після парсингу:', app.appointment_datetime, 'для запису:', app);
                     return null; // Пропустити, якщо дата невалідная
                }
                return { start, end: addMinutes(start, app.duration_minutes) };
            }).filter(Boolean); // Видаляємо null (пропущені записи)
            
            const slotsForThisSpecialist = [];
            let tempCurrentTime = new Date(queryDate); // Створюємо новий об'єкт Date для кожного спеціаліста
            tempCurrentTime.setHours(workDayStartHour, 0, 0, 0);

            const dayEnd = new Date(queryDate);
            dayEnd.setHours(workDayEndHour, 0, 0, 0); // Робочий день закінчується о 18:00, останній слот може початися до цього

            while (isBefore(tempCurrentTime, dayEnd)) {
                const potentialSlotStart = new Date(tempCurrentTime); // Копіюємо для кожного слоту
                const potentialSlotEnd = addMinutes(potentialSlotStart, serviceDuration);

                if (isBefore(potentialSlotEnd, dayEnd) || potentialSlotEnd.getTime() === dayEnd.getTime()) {
                    let isSlotFree = true;
                    for (const booked of bookedSlots) {
                        if (isBefore(potentialSlotStart, booked.end) && isBefore(booked.start, potentialSlotEnd)) {
                            isSlotFree = false;
                            break;
                        }
                    }
                    if (isSlotFree) {
                        const now = new Date();
                        // Дозволяємо слоти, якщо це майбутня дата, або якщо це сьогодні і слот ще не минув
                        if (formatISO(queryDate, {representation: 'date'}) > formatISO(now, {representation: 'date'}) || 
                            (formatISO(queryDate, {representation: 'date'}) === formatISO(now, {representation: 'date'}) && isBefore(now, potentialSlotStart))
                           ) {
                           slotsForThisSpecialist.push(formatISO(potentialSlotStart));
                        }
                    }
                }
                tempCurrentTime = addMinutes(tempCurrentTime, slotIntervalMinutes);
            }
            if (slotsForThisSpecialist.length > 0) {
                 availableSlotsBySpecialist[specId] = slotsForThisSpecialist;
            }
        }
        
        if (specialist_id) {
            res.json(availableSlotsBySpecialist[specialist_id] || []);
        } else {
            res.json(availableSlotsBySpecialist);
        }

    } catch (error) {
        console.error("Помилка отримання доступних слотів:", error);
        next(error);
    }
};

module.exports = {
    createAppointment,
    getMyAppointments,
    getAllAppointments,
    getAppointmentById,
    updateAppointment,
    getAvailableSlots,
};