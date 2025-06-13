const pool = require('../db');
const slugify = require('slugify');

// --- КАТЕГОРІЇ ПОСТІВ ---

// @desc    Отримати всі категорії постів
// @route   GET /api/post-categories
// @access  Public
const getAllPostCategories = async (req, res, next) => {
    try {
        const [categories] = await pool.query('SELECT id, name, slug FROM post_categories ORDER BY name ASC');
        res.json(categories);
    } catch (error) {
        console.error("Помилка отримання категорій постів:", error);
        next(error);
    }
};

// @desc    Створити нову категорію постів
// @route   POST /api/post-categories
// @access  Private/Admin
const createPostCategory = async (req, res, next) => {
    const { name } = req.body;
    if (!name) {
        return res.status(400).json({ message: "Назва категорії є обов'язковою." });
    }
    const slug = slugify(name, { lower: true, strict: true });
    try {
        const [existing] = await pool.query('SELECT id FROM post_categories WHERE slug = ? OR name = ?', [slug, name]);
        if (existing.length > 0) {
            return res.status(400).json({ message: "Категорія з такою назвою або slug вже існує." });
        }
        const [result] = await pool.query('INSERT INTO post_categories (name, slug) VALUES (?, ?)', [name, slug]);
        res.status(201).json({ id: result.insertId, name, slug });
    } catch (error) {
        console.error("Помилка створення категорії постів:", error);
        next(error);
    }
};

// @desc    Оновити категорію постів
// @route   PUT /api/post-categories/:id
// @access  Private/Admin
const updatePostCategory = async (req, res, next) => {
    const { id } = req.params;
    const { name } = req.body;
    if (!name) {
        return res.status(400).json({ message: "Назва категорії є обов'язковою." });
    }
    const newSlug = slugify(name, { lower: true, strict: true });
    try {
        const [category] = await pool.query('SELECT id FROM post_categories WHERE id = ?', [id]);
        if (category.length === 0) return res.status(404).json({ message: "Категорію не знайдено." });

        const [existing] = await pool.query('SELECT id FROM post_categories WHERE (slug = ? OR name = ?) AND id != ?', [newSlug, name, id]);
        if (existing.length > 0) {
            return res.status(400).json({ message: "Інша категорія з такою назвою або slug вже існує." });
        }
        await pool.query('UPDATE post_categories SET name = ?, slug = ? WHERE id = ?', [name, newSlug, id]);
        res.json({ id: Number(id), name, slug: newSlug });
    } catch (error) {
        console.error("Помилка оновлення категорії постів:", error);
        next(error);
    }
};

// @desc    Видалити категорію постів
// @route   DELETE /api/post-categories/:id
// @access  Private/Admin
const deletePostCategory = async (req, res, next) => {
    const { id } = req.params;
    try {
        const [category] = await pool.query('SELECT id FROM post_categories WHERE id = ?', [id]);
        if (category.length === 0) return res.status(404).json({ message: "Категорію не знайдено." });

        const [postsInCategory] = await pool.query('SELECT id FROM posts WHERE category_id = ?', [id]);
        if (postsInCategory.length > 0) {
            return res.status(400).json({ message: "Неможливо видалити категорію, оскільки вона містить пости. Спочатку видаліть або перемістіть пости." });
        }
        await pool.query('DELETE FROM post_categories WHERE id = ?', [id]);
        res.json({ message: "Категорію постів успішно видалено." });
    } catch (error) {
        console.error("Помилка видалення категорії постів:", error);
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
             return res.status(400).json({ message: "Неможливо видалити категорію, оскільки на неї посилаються інші записи (пости)." });
        }
        next(error);
    }
};

// --- ПОСТИ ---

// @desc    Отримати всі опубліковані пости (з пагінацією та фільтрацією)
// @route   GET /api/posts
// @access  Public
const getPublishedPosts = async (req, res, next) => {
    const { page = 1, limit = 10, category_slug, search } = req.query;
    const offset = (page - 1) * limit;

    let query = `
        SELECT 
            p.id, p.title, p.slug, p.content_short, p.image_url, p.published_at,
            pc.name as category_name, pc.slug as category_slug,
            u.first_name as author_first_name, u.last_name as author_last_name
        FROM posts p
        LEFT JOIN post_categories pc ON p.category_id = pc.id
        LEFT JOIN users u ON p.author_id = u.id
        WHERE p.status = 'published'
    `;
    const countQuery = `SELECT COUNT(p.id) as total FROM posts p LEFT JOIN post_categories pc ON p.category_id = pc.id WHERE p.status = 'published'`;
    
    let whereClauses = [];
    const queryParams = [];

    if (category_slug) {
        whereClauses.push('pc.slug = ?');
        queryParams.push(category_slug);
    }
    if (search) {
        whereClauses.push('(p.title LIKE ? OR p.content_short LIKE ? OR p.content_full LIKE ?)');
        const searchTerm = `%${search}%`;
        queryParams.push(searchTerm, searchTerm, searchTerm);
    }

    if (whereClauses.length > 0) {
        const whereString = whereClauses.join(' AND ');
        query += ` AND ${whereString}`;
    }
    
    const finalQueryParams = [...queryParams, parseInt(limit), parseInt(offset)];
    const finalCountParams = [...queryParams];
    
    query += ' ORDER BY p.published_at DESC LIMIT ? OFFSET ?';

    try {
        const [posts] = await pool.query(query, finalQueryParams);
        
        // Для загальної кількості постів (для пагінації)
        let totalPostsQuery = `SELECT COUNT(p.id) as total FROM posts p`;
        if (category_slug || search) {
            totalPostsQuery += ` LEFT JOIN post_categories pc ON p.category_id = pc.id WHERE p.status = 'published'`;
            if (whereClauses.length > 0) {
                 totalPostsQuery += ` AND ${whereClauses.join(' AND ')}`;
            }
        } else {
            totalPostsQuery += ` WHERE p.status = 'published'`;
        }

        const [totalResult] = await pool.query(totalPostsQuery, queryParams);
        const total = totalResult[0].total;

        res.json({
            posts,
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / limit),
            totalPosts: total
        });
    } catch (error) {
        console.error("Помилка отримання опублікованих постів:", error);
        next(error);
    }
};

// @desc    Отримати один пост за slug (включаючи повний контент та коментарі)
// @route   GET /api/posts/:slug
// @access  Public
const getPostBySlug = async (req, res, next) => {
    const { slug } = req.params;
    try {
        const [postRows] = await pool.query(`
            SELECT 
                p.id, p.title, p.slug, p.content_short, p.content_full, p.image_url, 
                p.status, p.published_at, p.created_at, p.updated_at,
                pc.name as category_name, pc.slug as category_slug, p.category_id,
                u.id as author_id, u.first_name as author_first_name, u.last_name as author_last_name
            FROM posts p
            LEFT JOIN post_categories pc ON p.category_id = pc.id
            LEFT JOIN users u ON p.author_id = u.id
            WHERE p.slug = ? 
        `, [slug]);

        if (postRows.length === 0) {
            return res.status(404).json({ message: 'Пост не знайдено.' });
        }
        
        const post = postRows[0];
        // Дозволити перегляд не опублікованих постів адмінам або авторам
        if (post.status !== 'published' && (!req.user || (req.user.id !== post.author_id && req.user.role !== 'admin'))) {
            return res.status(404).json({ message: 'Пост не знайдено або не опубліковано.' });
        }


        // Отримати коментарі до поста (ієрархічно)
        const [comments] = await pool.query(`
            SELECT 
                pc.id, pc.post_id, pc.user_id, pc.parent_comment_id, 
                pc.comment_text, pc.created_at,
                COALESCE(u.first_name, pc.author_name) as author_first_name, 
                COALESCE(u.last_name, '') as author_last_name  -- Обережно з прізвищем для незареєстрованих
            FROM post_comments pc
            LEFT JOIN users u ON pc.user_id = u.id
            WHERE pc.post_id = ?
            ORDER BY pc.created_at ASC 
        `, [post.id]); // is_approved тут не фільтруємо, бо всі одразу видимі

        // Побудова ієрархії коментарів
        const commentsMap = {};
        const rootComments = [];
        comments.forEach(comment => {
            comment.replies = [];
            commentsMap[comment.id] = comment;
            if (comment.parent_comment_id === null) {
                rootComments.push(comment);
            } else {
                if (commentsMap[comment.parent_comment_id]) {
                    commentsMap[comment.parent_comment_id].replies.push(comment);
                } else {
                     // Якщо батьківський коментар видалено, а відповідь залишилась (малоймовірно з CASCADE)
                     // або просто для безпеки, додаємо як коментар верхнього рівня.
                    rootComments.push(comment);
                }
            }
        });

        post.comments = rootComments;
        res.json(post);
    } catch (error) {
        console.error("Помилка отримання поста за slug:", error);
        next(error);
    }
};

// @desc    Створити новий пост
// @route   POST /api/posts
// @access  Private (Admin, Specialist - якщо їм дозволено)
const createPost = async (req, res, next) => {
    const { title, content_short, content_full, category_id, image_url, status = 'draft' } = req.body;
    const author_id = req.user.id; // Автор - поточний користувач

    if (!title || !content_full) {
        return res.status(400).json({ message: "Заголовок та повний зміст є обов'язковими." });
    }
    const slug = slugify(title, { lower: true, strict: true, remove: /[*+~.()'"!:@]/g }); // Більш агресивне видалення символів

    try {
        // Перевірка унікальності slug
        let uniqueSlug = slug;
        let counter = 1;
        while (true) {
            const [existingPost] = await pool.query('SELECT id FROM posts WHERE slug = ?', [uniqueSlug]);
            if (existingPost.length === 0) break;
            uniqueSlug = `${slug}-${counter}`;
            counter++;
        }
        
        const published_at = (status === 'published') ? new Date() : null;

        const [result] = await pool.query(
            'INSERT INTO posts (author_id, category_id, title, slug, content_short, content_full, image_url, status, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [author_id, category_id || null, title, uniqueSlug, content_short || null, content_full, image_url || null, status, published_at]
        );
        res.status(201).json({ 
            id: result.insertId, 
            author_id, category_id, title, slug: uniqueSlug, content_short, content_full, image_url, status, published_at 
        });
    } catch (error) {
        console.error("Помилка створення поста:", error);
        next(error);
    }
};

// @desc    Оновити пост
// @route   PUT /api/posts/:id
// @access  Private (Admin or Author)
const updatePost = async (req, res, next) => {
    const { id } = req.params;
    const { title, content_short, content_full, category_id, image_url, status } = req.body;
    
    try {
        const [postRows] = await pool.query('SELECT author_id, status as current_status, slug as current_slug FROM posts WHERE id = ?', [id]);
        if (postRows.length === 0) {
            return res.status(404).json({ message: "Пост не знайдено." });
        }
        const postToUpdate = postRows[0];

        if (req.user.role !== 'admin' && req.user.id !== postToUpdate.author_id) {
            return res.status(403).json({ message: "Недостатньо прав для оновлення цього поста." });
        }

        let newSlug = postToUpdate.current_slug;
        if (title) {
            const generatedSlug = slugify(title, { lower: true, strict: true, remove: /[*+~.()'"!:@]/g });
            if (generatedSlug !== postToUpdate.current_slug) { // Оновлюємо slug тільки якщо він змінився
                let uniqueSlug = generatedSlug;
                let counter = 1;
                while (true) {
                    const [existingPost] = await pool.query('SELECT id FROM posts WHERE slug = ? AND id != ?', [uniqueSlug, id]);
                    if (existingPost.length === 0) break;
                    uniqueSlug = `${generatedSlug}-${counter}`;
                    counter++;
                }
                newSlug = uniqueSlug;
            }
        }
        
        let published_at = null; // Потрібно отримати поточне значення, якщо статус не змінюється на published
        const [currentPostData] = await pool.query('SELECT published_at FROM posts WHERE id = ?', [id]);
        published_at = currentPostData[0].published_at;

        if (status === 'published' && postToUpdate.current_status !== 'published') {
            published_at = new Date();
        } else if (status && status !== 'published') { // Якщо змінюється на draft або archived
            published_at = null; // Або залишати попередню дату публікації, залежно від логіки
        }


        const fieldsToUpdate = {
            title, content_short, content_full, category_id, image_url, status, slug: newSlug, published_at
        };
        
        const updateClauses = [];
        const updateValues = [];

        for (const key in fieldsToUpdate) {
            if (fieldsToUpdate[key] !== undefined) { // Оновлюємо тільки передані поля
                // Особлива обробка для category_id та image_url, якщо передано null
                if ((key === 'category_id' || key === 'image_url' || key === 'content_short') && fieldsToUpdate[key] === null) {
                    updateClauses.push(`${key} = NULL`);
                } else if (fieldsToUpdate[key] !== null) { // Не додаємо null значення, якщо вони не були передані як null
                    updateClauses.push(`${key} = ?`);
                    updateValues.push(fieldsToUpdate[key]);
                }
            }
        }
        
        if (updateClauses.length === 0) {
            return res.status(400).json({ message: "Немає даних для оновлення." });
        }

        updateValues.push(id); // для WHERE id = ?

        await pool.query(`UPDATE posts SET ${updateClauses.join(', ')} WHERE id = ?`, updateValues);

        res.json({ message: 'Пост успішно оновлено.', id: Number(id), slug: newSlug, /*... інші оновлені поля*/ });
    } catch (error) {
        console.error("Помилка оновлення поста:", error);
        next(error);
    }
};

// @desc    Видалити пост
// @route   DELETE /api/posts/:id
// @access  Private (Admin or Author)
const deletePost = async (req, res, next) => {
    const { id } = req.params;
    try {
        const [postRows] = await pool.query('SELECT author_id FROM posts WHERE id = ?', [id]);
        if (postRows.length === 0) {
            return res.status(404).json({ message: "Пост не знайдено." });
        }
        if (req.user.role !== 'admin' && req.user.id !== postRows[0].author_id) {
            return res.status(403).json({ message: "Недостатньо прав для видалення цього поста." });
        }
        // Завдяки ON DELETE CASCADE в БД, коментарі видаляться автоматично.
        await pool.query('DELETE FROM posts WHERE id = ?', [id]);
        res.json({ message: 'Пост успішно видалено.' });
    } catch (error) {
        console.error("Помилка видалення поста:", error);
        next(error);
    }
};

// --- КОМЕНТАРІ ДО ПОСТІВ ---

// @desc    Додати коментар до поста
// @route   POST /api/posts/:postId/comments
// @access  Public (або Private/Client, якщо тільки для зареєстрованих)
const addCommentToPost = async (req, res, next) => {
    const { postId } = req.params;
    const { parent_comment_id, comment_text, author_name, author_email } = req.body;
    const user_id = req.user ? req.user.id : null; // Якщо користувач залогінений

    if (!comment_text) {
        return res.status(400).json({ message: "Текст коментаря є обов'язковим." });
    }
    // Якщо користувач не залогінений, ім'я та email стають обов'язковими (якщо дозволено анонімні коментарі)
    if (!user_id && (!author_name || !author_email)) {
        return res.status(400).json({ message: "Для незареєстрованих користувачів ім'я та email є обов'язковими для коментарів." });
    }
     // Валідація email для незареєстрованих
    if (!user_id && author_email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(author_email)) {
            return res.status(400).json({ message: "Некоректний формат електронної пошти." });
        }
    }

    try {
        const [postExists] = await pool.query("SELECT id, status FROM posts WHERE id = ? AND status = 'published'", [postId]);
        if (postExists.length === 0) {
            return res.status(404).json({ message: "Пост не знайдено або не опубліковано." });
        }

        if (parent_comment_id) {
            const [parentCommentExists] = await pool.query("SELECT id FROM post_comments WHERE id = ? AND post_id = ?", [parent_comment_id, postId]);
            if (parentCommentExists.length === 0) {
                return res.status(404).json({ message: "Батьківський коментар не знайдено для цього поста." });
            }
        }
        
        // is_approved встановлюємо в true (1), оскільки всі коментарі одразу публікуються
        const [result] = await pool.query(
            'INSERT INTO post_comments (post_id, user_id, parent_comment_id, author_name, author_email, comment_text, is_approved) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [postId, user_id, parent_comment_id || null, user_id ? null : author_name, user_id ? null : author_email, comment_text, 1]
        );
        
        const [newComment] = await pool.query(`
            SELECT 
                pc.id, pc.post_id, pc.user_id, pc.parent_comment_id, 
                pc.comment_text, pc.created_at,
                COALESCE(u.first_name, pc.author_name) as author_first_name, 
                COALESCE(u.last_name, '') as author_last_name
            FROM post_comments pc
            LEFT JOIN users u ON pc.user_id = u.id
            WHERE pc.id = ?
        `, [result.insertId]);

        res.status(201).json(newComment[0]);
    } catch (error) {
        console.error("Помилка додавання коментаря:", error);
        next(error);
    }
};

// @desc    Видалити коментар (адміністратором)
// @route   DELETE /api/posts/:postId/comments/:commentId
// @access  Private/Admin
const deletePostComment = async (req, res, next) => {
    const { commentId } = req.params; 
    // postId з параметрів можна використовувати для додаткової перевірки, але commentId унікальний

    try {
        const [comment] = await pool.query('SELECT id FROM post_comments WHERE id = ?', [commentId]);
        if (comment.length === 0) {
            return res.status(404).json({ message: "Коментар не знайдено." });
        }
        // Завдяки ON DELETE CASCADE, відповіді на цей коментар також будуть видалені.
        await pool.query('DELETE FROM post_comments WHERE id = ?', [commentId]);
        res.json({ message: 'Коментар успішно видалено.' });
    } catch (error) {
        console.error("Помилка видалення коментаря:", error);
        next(error);
    }
};


module.exports = {
    getAllPostCategories,
    createPostCategory,
    updatePostCategory,
    deletePostCategory,
    getPublishedPosts,
    getPostBySlug,
    createPost,
    updatePost,
    deletePost,
    addCommentToPost,
    deletePostComment
};