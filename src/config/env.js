const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const required = ['MONGODB_URI', 'JWT_SECRET'];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4000,
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  publicUrl: process.env.PUBLIC_URL || `http://localhost:${Number(process.env.PORT) || 4000}`,
  mongoUri: process.env.MONGODB_URI,
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  corsOrigin: process.env.CORS_ORIGIN || '*',
  admin: {
    username: process.env.ADMIN_USERNAME || 'kunal',
    password: process.env.ADMIN_PASSWORD || 'admin-123',
  },
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
};

module.exports = config;
