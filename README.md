# qio API

Modular Express.js + MongoDB backend for the qio mobile app.

## Quick start

```bash
cp .env.example .env
npm install
npm run dev
```

Ensure MongoDB is running and `MONGODB_URI` in `.env` is correct.

## Firebase phone authentication

The mobile app verifies the phone OTP with Firebase, then sends the Firebase ID
token to `POST /api/v1/auth/firebase`. The backend verifies that token with
Firebase Admin, creates or finds the MongoDB user, and returns the normal QIO
JWT used by protected API requests.

Create a Firebase service account in **Project settings > Service accounts** and
add these server-only values to `backend/.env`:

```env
FIREBASE_PROJECT_ID=qio-project
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@qio-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Do not put these values in the mobile app or commit them. The mobile
`google-services.json` is a client configuration file and cannot verify tokens
on the server.

```bash
npm run seed   # optional product seed
```

## Modules

| Folder | Role |
|--------|------|
| `config/` | Environment + DB connection |
| `models/` | Mongoose schemas |
| `controllers/` | Business logic |
| `routes/` | HTTP routers |
| `middleware/` | Auth + error handling |
| `utils/` | Shared helpers |
| `scripts/` | One-off jobs (seed) |
