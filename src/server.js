const app = require('./app');
const config = require('./config/env');
const { connectDB } = require('./config/db');
const { initializeCronJobs } = require('./config/cron');

async function start() {
  try {
    console.info('[server] Connecting to MongoDB...');
    await connectDB();

    // Initialize cron jobs
    initializeCronJobs();

    app.listen(config.port, '0.0.0.0', () => {
      console.log(`qio API listening on http://localhost:${config.port}`);
      console.log(`API base: http://localhost:${config.port}${config.apiPrefix}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

start();
