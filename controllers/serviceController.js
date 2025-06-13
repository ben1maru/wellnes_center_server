const pool = require('../db');
const slugify = require('slugify');

// --- КАТЕГОРІЇ ПОСЛУГ ---

// @desc    Отримати всі категорії послуг
// @route   GET /api/service-categories
// @access  Public
const getAllServiceCategories = async (req, res, next) => {
    try {
        const [categories] = await pool.query('SELECT id, name, slug, description FROM service_categories ORDER BY name ASC');
        res.json(categories);
    } catch (error) {
        console.error("Помилка отримання категорій послуг:", error);
        next(error);
    }
};

// @desc    Створити нову категорію послуг
// @route   POST /api/service-categories
// @access  Private/Admin
const createServiceCategory = async (req, res, next) => {
    const { name, description } = req.body;

    if (!name) {
        return res.status(400).json({ message: "Назва категорії є обов'язковою." });
    }

    const slug = slugify(name, { lower: true, strict: true });

    try {
        const [existingCategory] = await pool.query('SELECT id FROM service_categories WHERE slug = ? OR name = ?', [slug, name]);
        if (existingCategory.length > 0) {
            return res.status(400).json({ message: "Категорія з такою назвою або slug вже існує." });
        }

        const [result] = await pool.query(
            'INSERT INTO service_categories (name, slug, description) VALUES (?, ?, ?)',
            [name, slug, description || null]
        );
        res.status(201).json({
            id: result.insertId,
            name,
            slug,
            description: description || null
        });
    } catch (error) {
        console.error("Помилка створення категорії послуг:", error);
        next(error);
    }
};

// @desc    Оновити категорію послуг
// @route   PUT /api/service-categories/:id
// @access  Private/Admin
const updateServiceCategory = async (req, res, next) => {
    const { id } = req.params;
    const { name, description } = req.body;

    if (!name) {
        return res.status(400).json({ message: "Назва категорії є обов'язковою." });
    }
    const newSlug = slugify(name, { lower: true, strict: true });

    try {
        const [categoryExists] = await pool.query('SELECT id FROM service_categories WHERE id = ?', [id]);
        if (categoryExists.length === 0) {
            return res.status(404).json({ message: "Категорію не знайдено." });
        }

        // Перевірка на унікальність назви/slug, виключаючи поточну категорію
        const [existingCategory] = await pool.query(
            'SELECT id FROM service_categories WHERE (slug = ? OR name = ?) AND id != ?',
            [newSlug, name, id]
        );
        if (existingCategory.length > 0) {
            return res.status(400).json({ message: "Інша категорія з такою назвою або slug вже існує." });
        }

        await pool.query(
            'UPDATE service_categories SET name = ?, slug = ?, description = ? WHERE id = ?',
            [name, newSlug, description || null, id]
        );
        res.json({ id: Number(id), name, slug: newSlug, description: description || null });
    } catch (error) {
        console.error("Помилка оновлення категорії послуг:", error);
        next(error);
    }
};

// @desc    Видалити категорію послуг
// @route   DELETE /api/service-categories/:id
// @access  Private/Admin
// ПОПЕРЕДЖЕННЯ: Видалення категорії може призвести до проблем, якщо є послуги, пов'язані з нею (FOREIGN KEY constraint).
// Краще реалізувати "м'яке видалення" або перевіряти наявність пов'язаних послуг.
// Поки що реалізуємо перевірку.
const deleteServiceCategory = async (req, res, next) => {
    const { id } = req.params;
    try {
        const [categoryExists] = await pool.query('SELECT id FROM service_categories WHERE id = ?', [id]);
        if (categoryExists.length === 0) {
            return res.status(404).json({ message: "Категорію не знайдено." });
        }

        // Перевірка, чи є послуги в цій категорії
        const [servicesInCategory] = await pool.query('SELECT id FROM services WHERE category_id = ?', [id]);
        if (servicesInCategory.length > 0) {
            return res.status(400).json({ message: "Неможливо видалити категорію, оскільки вона містить послуги. Спочатку видаліть або перемістіть послуги." });
        }

        await pool.query('DELETE FROM service_categories WHERE id = ?', [id]);
        res.json({ message: "Категорію успішно видалено." });
    } catch (error) {
        console.error("Помилка видалення категорії послуг:", error);
        // Якщо помилка пов'язана з foreign key (хоча ми перевірили вище)
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
             return res.status(400).json({ message: "Неможливо видалити категорію, оскільки на неї посилаються інші записи (наприклад, послуги)." });
        }
        next(error);
    }
};


// --- ПОСЛУГИ ---

// @desc    Отримати всі активні послуги, можливо з фільтрацією за категорією (slug) та пошуком
// @route   GET /api/services
// @access  Public
const getServices = async (req, res, next) => {
    const { category_slug, search } = req.query; // category_slug для фільтрації, search для пошуку
    try {
        let sqlQuery = `
            SELECT s.id, s.name, s.slug, s.description_short, s.description_full, s.price, s.duration_minutes, s.image_url, s.is_active,
                   sc.id as category_id, sc.name as category_name, sc.slug as category_slug
            FROM services s
            JOIN service_categories sc ON s.category_id = sc.id
            WHERE s.is_active = 1
        `;
        const queryParams = [];

        if (category_slug) {
            sqlQuery += ' AND sc.slug = ?';
            queryParams.push(category_slug);
        }

        if (search) {
            sqlQuery += ' AND (s.name LIKE ? OR s.description_short LIKE ? OR s.description_full LIKE ?)';
            const searchTerm = `%${search}%`;
            queryParams.push(searchTerm, searchTerm, searchTerm);
        }

        sqlQuery += ' ORDER BY s.name ASC';

        const [services] = await pool.query(sqlQuery, queryParams);
        res.json(services);
    } catch (error) {
        console.error("Помилка отримання послуг:", error);
        next(error);
    }
};

// @desc    Отримати одну послугу за її slug
// @route   GET /api/services/:slug
// @access  Public
const getServiceBySlug = async (req, res, next) => {
    const { slug } = req.params;
    try {
        const [services] = await pool.query(`
            SELECT s.id, s.name, s.slug, s.description_short, s.description_full, s.price, s.duration_minutes, s.image_url, s.is_active,
                   sc.id as category_id, sc.name as category_name, sc.slug as category_slug
            FROM services s
            JOIN service_categories sc ON s.category_id = sc.id
            WHERE s.slug = ? AND s.is_active = 1
        `, [slug]);

        if (services.length === 0) {
            return res.status(404).json({ message: 'Послугу не знайдено або вона неактивна.' });
        }
        res.json(services[0]);
    } catch (error) {
        console.error("Помилка отримання послуги за slug:", error);
        next(error);
    }
};

// @desc    Створити нову послугу
// @route   POST /api/services
// @access  Private/Admin
const createService = async (req, res, next) => {
    const { category_id, name, description_short, description_full, price, duration_minutes, image_url, is_active = true } = req.body;

    if (!category_id || !name || !price || !duration_minutes) {
        return res.status(400).json({ message: "Обов'язкові поля: ID категорії, назва, ціна, тривалість." });
    }

    const slug = slugify(name, { lower: true, strict: true });

    try {
        // Перевірка існування категорії
        const [categoryExists] = await pool.query('SELECT id FROM service_categories WHERE id = ?', [category_id]);
        if (categoryExists.length === 0) {
            return res.status(400).json({ message: "Вказану категорію послуг не знайдено." });
        }

        // Перевірка на унікальність slug послуги
        const [existingService] = await pool.query('SELECT id FROM services WHERE slug = ?', [slug]);
        if (existingService.length > 0) {
            return res.status(400).json({ message: "Послуга з таким slug вже існує. Спробуйте іншу назву." });
        }

        const [result] = await pool.query(
            'INSERT INTO services (category_id, name, slug, description_short, description_full, price, duration_minutes, image_url, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [category_id, name, slug, description_short || null, description_full || null, price, duration_minutes, image_url || null, is_active]
        );

        res.status(201).json({
            id: result.insertId,
            category_id, name, slug, description_short, description_full, price, duration_minutes, image_url, is_active
        });
    } catch (error) {
        console.error("Помилка створення послуги:", error);
        next(error);
    }
};

// @desc    Оновити послугу
// @route   PUT /api/services/:id
// @access  Private/Admin
const updateService = async (req, res, next) => {
    const { id } = req.params;
    const { category_id, name, description_short, description_full, price, duration_minutes, image_url, is_active } = req.body;

    if (!category_id && !name && !description_short && !description_full && price === undefined && duration_minutes === undefined && image_url === undefined && is_active === undefined) {
        return res.status(400).json({ message: "Немає даних для оновлення." });
    }
    
    let newSlug;
    if (name) {
        newSlug = slugify(name, { lower: true, strict: true });
    }

    try {
        const [serviceToUpdate] = await pool.query('SELECT * FROM services WHERE id = ?', [id]);
        if (serviceToUpdate.length === 0) {
            return res.status(404).json({ message: "Послугу не знайдено." });
        }

        // Якщо змінюється назва, перевірити унікальність нового slug
        if (newSlug && newSlug !== serviceToUpdate[0].slug) {
            const [existingService] = await pool.query('SELECT id FROM services WHERE slug = ? AND id != ?', [newSlug, id]);
            if (existingService.length > 0) {
                return res.status(400).json({ message: "Інша послуга з таким slug вже існує." });
            }
        }
        
        // Перевірка існування категорії, якщо вона змінюється
        if (category_id) {
            const [categoryExists] = await pool.query('SELECT id FROM service_categories WHERE id = ?', [category_id]);
            if (categoryExists.length === 0) {
                return res.status(400).json({ message: "Вказану категорію послуг не знайдено." });
            }
        }

        const currentService = serviceToUpdate[0];
        const updatedService = {
            category_id: category_id !== undefined ? category_id : currentService.category_id,
            name: name !== undefined ? name : currentService.name,
            slug: newSlug !== undefined ? newSlug : currentService.slug,
            description_short: description_short !== undefined ? description_short : currentService.description_short,
            description_full: description_full !== undefined ? description_full : currentService.description_full,
            price: price !== undefined ? price : currentService.price,
            duration_minutes: duration_minutes !== undefined ? duration_minutes : currentService.duration_minutes,
            image_url: image_url !== undefined ? image_url : currentService.image_url,
            is_active: is_active !== undefined ? is_active : currentService.is_active,
        };
        
        await pool.query(
            'UPDATE services SET category_id = ?, name = ?, slug = ?, description_short = ?, description_full = ?, price = ?, duration_minutes = ?, image_url = ?, is_active = ? WHERE id = ?',
            [updatedService.category_id, updatedService.name, updatedService.slug, updatedService.description_short, updatedService.description_full, updatedService.price, updatedService.duration_minutes, updatedService.image_url, updatedService.is_active, id]
        );

        res.json({ id: Number(id), ...updatedService });
    } catch (error) {
        console.error("Помилка оновлення послуги:", error);
        next(error);
    }
};

// @desc    Видалити послугу (м'яке видалення - встановлення is_active = 0)
// @route   DELETE /api/services/:id
// @access  Private/Admin
const deleteService = async (req, res, next) => {
    const { id } = req.params;
    try {
        const [serviceExists] = await pool.query('SELECT id FROM services WHERE id = ?', [id]);
        if (serviceExists.length === 0) {
            return res.status(404).json({ message: "Послугу не знайдено." });
        }

        await pool.query('UPDATE services SET is_active = 0 WHERE id = ?', [id]);
        // Можна також розглянути видалення пов'язаних записів, наприклад, з specialist_services,
        // або ж це має оброблятися на рівні логіки записів на прийом.

        res.json({ message: "Послугу деактивовано (м\'яке видалення)." });
    } catch (error) {
        console.error("Помилка видалення послуги:", error);
        next(error);
    }
};


module.exports = {
    getAllServiceCategories,
    createServiceCategory,
    updateServiceCategory,
    deleteServiceCategory,
    getServices,
    getServiceBySlug,
    createService,
    updateService,
    deleteService
};