const cron = require('node-cron');
const { applyMonthlyBonusToAll } = require('../controllers/wallet.controller');

/**
 * Initialize all scheduled cron jobs
 * - Daily at midnight: check if it's the 1st of the month and apply bonus
 * - Or: Run exactly at 00:00 on the 1st of every month
 */
function initializeCronJobs() {
    console.log('[cron] Initializing scheduled jobs...');

    // Run at 00:00 (midnight UTC) on the 1st of every month
    // Cron format: second minute hour day month dayOfWeek
    cron.schedule('0 0 0 1 * *', async () => {
        console.log('[cron] Monthly bonus trigger: Running monthly bonus for all users...');
        try {
            const result = await applyMonthlyBonusToAll();
            console.log(
                `[cron] Monthly bonus completed: ${result.successCount}/${result.totalUsers} users updated`,
            );
        } catch (error) {
            console.error('[cron] Error applying monthly bonus:', error);
        }
    });

    console.log('[cron] Cron jobs initialized successfully');
}

module.exports = {
    initializeCronJobs,
};
