const express = require('express');
const router = express.Router();
const {
    getAllServiceCategories,
    createServiceCategory,
    updateServiceCategory,
    deleteServiceCategory,
    getServices,
    getServiceBySlug,
    createService,
    updateService,
    deleteService
} = require('../controllers/serviceController');
const { addReview, getServiceReviews } = require('../controllers/reviewController'); // Для відгуків до послуг
const { protect, authorize } = require('../middleware/authMiddleware');

// --- Маршрути для категорій послуг ---
// @route   GET /api/services/categories
// @desc    Отримати всі категорії послуг
// @access  Public
router.get('/categories', getAllServiceCategories);

// @route   POST /api/services/categories
// @desc    Створити нову категорію послуг
// @access  Private/Admin
router.post('/categories', protect, authorize('admin'), createServiceCategory);

// @route   PUT /api/services/categories/:id
// @desc    Оновити категорію послуг
// @access  Private/Admin
router.put('/categories/:id', protect, authorize('admin'), updateServiceCategory);

// @route   DELETE /api/services/categories/:id
// @desc    Видалити категорію послуг
// @access  Private/Admin
router.delete('/categories/:id', protect, authorize('admin'), deleteServiceCategory);


// --- Маршрути для послуг ---
// @route   GET /api/services
// @desc    Отримати всі активні послуги (з фільтрацією/пошуком)
// @access  Public
router.get('/', getServices);

// @route   GET /api/services/:slug
// @desc    Отримати одну послугу за її slug
// @access  Public
router.get('/:slug', getServiceBySlug);

// @route   POST /api/services
// @desc    Створити нову послугу
// @access  Private/Admin
router.post('/', protect, authorize('admin'), createService);

// @route   PUT /api/services/:id
// @desc    Оновити послугу
// @access  Private/Admin
router.put('/:id', protect, authorize('admin'), updateService);

// @route   DELETE /api/services/:id
// @desc    Видалити (деактивувати) послугу
// @access  Private/Admin
router.delete('/:id', protect, authorize('admin'), deleteService);


// --- Маршрути для відгуків до послуг (вкладені) ---
// @route   POST /api/services/:serviceId/reviews
// @desc    Додати відгук до послуги
// @access  Private/Client
router.post('/:serviceId/reviews', protect, authorize('client'), addReview);

// @route   GET /api/services/:serviceId/reviews
// @desc    Отримати всі схвалені відгуки для конкретної послуги
// @access  Public
router.get('/:serviceId/reviews', getServiceReviews);

module.exports = router;