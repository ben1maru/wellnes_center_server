const express = require('express');
const router = express.Router();
const {
    getAllReviewsAdmin,
    updateReviewApproval,
    deleteReview
} = require('../controllers/reviewController');
const { protect, authorize } = require('../middleware/authMiddleware');

// @route   GET /api/reviews
// @desc    Отримати всі відгуки (для адміна, з фільтрацією)
// @access  Private/Admin
router.get('/', protect, authorize('admin'), getAllReviewsAdmin);

// @route   PUT /api/reviews/:reviewId/approval
// @desc    Оновити статус схвалення відгуку
// @access  Private/Admin
router.put('/:reviewId/approval', protect, authorize('admin'), updateReviewApproval);

// @route   DELETE /api/reviews/:reviewId
// @desc    Видалити відгук
// @access  Private/Admin
router.delete('/:reviewId', protect, authorize('admin'), deleteReview);

module.exports = router;