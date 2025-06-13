const express = require('express');
const router = express.Router();
const {
    getAllSpecialists,
    getSpecialistById,
    updateSpecialistProfile,
    assignServicesToSpecialist,
    getSpecialistServices
} = require('../controllers/specialistController');
const { protect, authorize } = require('../middleware/authMiddleware');

// @route   GET /api/specialists
// @desc    Отримати всіх активних спеціалістів
// @access  Public
router.get('/', getAllSpecialists);

// @route   GET /api/specialists/:id
// @desc    Отримати детальну інформацію про одного спеціаліста
// @access  Public
router.get('/:id', getSpecialistById);

// @route   PUT /api/specialists/:id
// @desc    Оновити інформацію про спеціаліста
// @access  Private (Admin or Own Specialist profile)
router.put('/:id', protect, updateSpecialistProfile); // Логіка authorize всередині контролера

// @route   GET /api/specialists/:id/services
// @desc    Отримати послуги, які надає конкретний спеціаліст
// @access  Public
router.get('/:id/services', getSpecialistServices);

// @route   POST /api/specialists/:id/services
// @desc    Призначити/зняти послуги для спеціаліста
// @access  Private/Admin
router.post('/:id/services', protect, authorize('admin'), assignServicesToSpecialist);

module.exports = router;