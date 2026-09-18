const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const User = require('../models/User');

/**
 * Update user streak based on daily activity
 * - If activity today: increment count by 1
 * - If no activity yesterday: reset count to 1
 * - Otherwise: increment count by 1
 */
async function updateStreak(userId) {
    const user = await User.findById(userId);
    if (!user) {
        throw new ApiError(404, 'User not found');
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const lastActivityDate = user.streak.lastActivityDate
        ? new Date(user.streak.lastActivityDate)
        : null;

    // If already updated today, return current streak
    if (lastActivityDate) {
        const lastActivityDay = new Date(
            lastActivityDate.getFullYear(),
            lastActivityDate.getMonth(),
            lastActivityDate.getDate(),
        );
        if (lastActivityDay.getTime() === today.getTime()) {
            return user.streak;
        }

        // Calculate days since last activity
        const daysSinceLast = Math.floor(
            (today.getTime() - lastActivityDay.getTime()) / (1000 * 60 * 60 * 24),
        );

        // If more than 1 day since last activity, reset streak
        if (daysSinceLast > 1) {
            user.streak.count = 1;
        } else {
            // Increment streak (activity yesterday or earlier today)
            user.streak.count = Math.max(1, user.streak.count + 1);
        }
    } else {
        // First activity ever
        user.streak.count = 1;
    }

    user.streak.lastActivityDate = now;
    await user.save();
    return user.streak;
}

/**
 * Get current user streak
 */
const getStreak = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    if (!user) {
        throw new ApiError(404, 'User not found');
    }

    res.json(
        new ApiResponse(
            200,
            {
                streak: {
                    count: user.streak.count,
                    lastActivityDate: user.streak.lastActivityDate,
                },
            },
            'Streak fetched',
        ),
    );
});

/**
 * Trigger a streak update (called after successful order)
 */
const recordActivity = asyncHandler(async (req, res) => {
    const streak = await updateStreak(req.user._id);

    res.json(
        new ApiResponse(
            200,
            {
                streak: {
                    count: streak.count,
                    lastActivityDate: streak.lastActivityDate,
                },
            },
            'Streak updated',
        ),
    );
});

module.exports = {
    getStreak,
    recordActivity,
    updateStreak,
};
