const express = require('express');
const router = express.Router();
const {
    createContactMessage,
    getAllContactMessages,
    getContactMessageById,
    updateContactMessageStatus,
    deleteContactMessage
} = require('../controllers/contactMessageController');
const { protect, authorize } = require('../middleware/authMiddleware');

// @route   POST /api/contact-messages
// @desc    Надіслати нове повідомлення з контактної форми
// @access  Public
router.post('/', createContactMessage);

// @route   GET /api/contact-messages
// @desc    Отримати всі контактні повідомлення (для адміна)
// @access  Private/Admin
router.get('/', protect, authorize('admin'), getAllContactMessages);

// @route   GET /api/contact-messages/:id
// @desc    Отримати одне контактне повідомлення за ID (для адміна)
// @access  Private/Admin
router.get('/:id', protect, authorize('admin'), getContactMessageById);

// @route   PUT /api/contact-messages/:id/status
// @desc    Оновити статус контактного повідомлення (для адміна)
// @access  Private/Admin
router.put('/:id/status', protect, authorize('admin'), updateContactMessageStatus);

// @route   DELETE /api/contact-messages/:id
// @desc    Видалити контактне повідомлення (для адміна)
// @access  Private/Admin
router.delete('/:id', protect, authorize('admin'), deleteContactMessage);

module.exports = router;