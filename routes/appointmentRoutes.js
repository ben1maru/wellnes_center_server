const express = require('express');
const router = express.Router();
const {
    createAppointment,
    getMyAppointments,
    getAllAppointments,
    getAppointmentById,
    updateAppointment,
    getAvailableSlots
} = require('../controllers/appointmentController');
const { protect, authorize } = require('../middleware/authMiddleware');

// @route   GET /api/appointments/availability
// @desc    Отримати доступні часові слоти для послуги/спеціаліста на дату
// @access  Public
router.get('/availability', getAvailableSlots);

// @route   POST /api/appointments
// @desc    Створити новий запис на прийом
// @access  Private/Client
router.post('/', protect, authorize('client'), createAppointment);

// @route   GET /api/appointments/my
// @desc    Отримати всі записи поточного клієнта
// @access  Private/Client
router.get('/my', protect, authorize('client'), getMyAppointments);

// @route   GET /api/appointments
// @desc    Отримати всі записи (для адміна) / або записи для спеціаліста
// @access  Private (Admin, Specialist)
router.get('/', protect, authorize('admin', 'specialist'), getAllAppointments);

// @route   GET /api/appointments/:id
// @desc    Отримати один запис за ID
// @access  Private (Admin, Owner Client, Assigned Specialist)
router.get('/:id', protect, getAppointmentById); // Логіка доступу всередині контролера

// @route   PUT /api/appointments/:id
// @desc    Оновити статус запису, нотатки, або призначити спеціаліста
// @access  Private (Admin, Client for cancellation, Assigned Specialist for status update)
router.put('/:id', protect, updateAppointment); // Логіка доступу всередині контролера

module.exports = router;