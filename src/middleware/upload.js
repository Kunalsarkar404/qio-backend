const fs = require('fs');
const path = require('path');
const multer = require('multer');

const UPLOAD_DIR = path.resolve(__dirname, '../../uploads/products');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
        cb(null, unique);
    },
});

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

function fileFilter(_req, file, cb) {
    if (!ALLOWED_TYPES.has(file.mimetype)) {
        return cb(new Error('Only JPEG, PNG, WEBP, or AVIF images are allowed'));
    }
    return cb(null, true);
}

const uploadProductImages = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024, files: 6 },
});

module.exports = { uploadProductImages, UPLOAD_DIR };
