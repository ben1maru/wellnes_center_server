const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/postController');
const { protect, authorize } = require('../middleware/authMiddleware');

// --- Маршрути для категорій постів ---
// @route   GET /api/posts/categories
// @desc    Отримати всі категорії постів
// @access  Public
router.get('/categories', getAllPostCategories);

// @route   POST /api/posts/categories
// @desc    Створити нову категорію постів
// @access  Private/Admin
router.post('/categories', protect, authorize('admin'), createPostCategory);

// @route   PUT /api/posts/categories/:id
// @desc    Оновити категорію постів
// @access  Private/Admin
router.put('/categories/:id', protect, authorize('admin'), updatePostCategory);

// @route   DELETE /api/posts/categories/:id
// @desc    Видалити категорію постів
// @access  Private/Admin
router.delete('/categories/:id', protect, authorize('admin'), deletePostCategory);


// --- Маршрути для постів ---
// @route   GET /api/posts
// @desc    Отримати всі опубліковані пости (з пагінацією та фільтрацією)
// @access  Public
router.get('/', getPublishedPosts);

// @route   POST /api/posts
// @desc    Створити новий пост
// @access  Private (Admin, Specialist - залежно від налаштувань ролей)
router.post('/', protect, authorize('admin', 'specialist'), createPost); // Дозволяємо і спеціалістам

// @route   GET /api/posts/:slug
// @desc    Отримати один пост за slug (включаючи повний контент та коментарі)
// @access  Public (або Private для не опублікованих, логіка в контролері)
router.get('/:slug', getPostBySlug); // Доступ до не опублікованих обробляється в контролері

// @route   PUT /api/posts/:id
// @desc    Оновити пост
// @access  Private (Admin or Author)
router.put('/:id', protect, updatePost); // Логіка authorize всередині контролера

// @route   DELETE /api/posts/:id
// @desc    Видалити пост
// @access  Private (Admin or Author)
router.delete('/:id', protect, deletePost); // Логіка authorize всередині контролера


// --- Маршрути для коментарів до постів ---
// @route   POST /api/posts/:postId/comments
// @desc    Додати коментар до поста
// @access  Public (або Private/Client, якщо тільки для зареєстрованих)
router.post('/:postId/comments', protect, addCommentToPost); // protect, якщо тільки зареєстровані
// Якщо анонімні коментарі дозволені, protect можна прибрати, але тоді в контролері req.user може бути undefined

// @route   DELETE /api/posts/:postId/comments/:commentId
// @desc    Видалити коментар (адміністратором)
// @access  Private/Admin
router.delete('/:postId/comments/:commentId', protect, authorize('admin'), deletePostComment);

module.exports = router;