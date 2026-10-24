const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { bucket } = require('../config/firebaseAdmin');

const ALLOWED_MIMES = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'application/pdf': '.pdf',
    'text/csv': '.csv',
    'application/vnd.ms-excel': '.csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'text/plain': '.txt'
};

// استخدام الذاكرة المؤقتة (Memory Storage) لرفع الملف مباشرة إلى Firebase Cloud Storage
const storage = multer.memoryStorage();

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // الحد الأقصى 5MB
    fileFilter: (req, file, cb) => {
        if (ALLOWED_MIMES[file.mimetype]) {
            cb(null, true);
        } else {
            cb(new Error('نوع الملف غير مسموح به أمنياً (المسموح: صور، PDF، CSV، Excel فقط)'));
        }
    }
});

/**
 * دالة لرفع الملف الموجود في req.file.buffer إلى Firebase Cloud Storage
 * وإرجاع رابط التحميل (Signed URL أو Public URL) مع حفظ نسخة محلية احتياطية
 */
const uploadBufferToFirebaseStorage = async (file) => {
    if (!file || !file.buffer) return null;

    const ext = ALLOWED_MIMES[file.mimetype] || path.extname(file.originalname) || '.bin';
    const randomHex = crypto.randomBytes(12).toString('hex');
    const safeFilename = `${Date.now()}-${randomHex}${ext}`;
    const destinationPath = `tickets_attachments/${safeFilename}`;

    // حفظ نسخة محلية أيضاً لضمان عمل مسار /uploads/:filename القديم دون انقطاع
    try {
        const uploadsDir = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
        fs.writeFileSync(path.join(uploadsDir, safeFilename), file.buffer);
    } catch (localErr) {
        // تجاهل خطأ الكتابة المحلية في البيئات السحابية غير القابلة للكتابة
    }

    file.filename = safeFilename;

    if (bucket) {
        try {
            const blob = bucket.file(destinationPath);
            await blob.save(file.buffer, {
                metadata: {
                    contentType: file.mimetype,
                    metadata: {
                        originalName: file.originalname
                    }
                },
                resumable: false
            });

            // محاولة جعل الملف عاماً أو توليد رابط موقع طويل الأمد (Signed URL)
            let downloadUrl = null;
            try {
                await blob.makePublic();
                downloadUrl = `https://storage.googleapis.com/${bucket.name}/${destinationPath}`;
            } catch (pubErr) {
                const [signedUrl] = await blob.getSignedUrl({
                    action: 'read',
                    expires: '03-01-2035'
                });
                downloadUrl = signedUrl;
            }

            file.firebaseUrl = downloadUrl;
            file.storagePath = destinationPath;
            return {
                filename: safeFilename,
                originalname: file.originalname,
                url: downloadUrl,
                storagePath: destinationPath
            };
        } catch (storageErr) {
            console.warn('⚠️ تعذر الرفع إلى Firebase Cloud Storage، تم استخدام التخزين الاحتياطي:', storageErr.message);
        }
    }

    return {
        filename: safeFilename,
        originalname: file.originalname,
        url: `/uploads/${safeFilename}`,
        storagePath: safeFilename
    };
};

/**
 * Middleware يوضع بعد upload.single('attachment') لرفع المرفق تلقائياً إلى Firebase Storage
 */
const uploadToFirebaseStorage = async (req, res, next) => {
    if (!req.file) return next();
    try {
        await uploadBufferToFirebaseStorage(req.file);
        next();
    } catch (err) {
        next(err);
    }
};

module.exports = upload;
module.exports.upload = upload;
module.exports.uploadToFirebaseStorage = uploadToFirebaseStorage;
module.exports.uploadBufferToFirebaseStorage = uploadBufferToFirebaseStorage;
module.exports.ALLOWED_MIMES = ALLOWED_MIMES;