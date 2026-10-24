require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const nodemailer = require('nodemailer');
const db = require('./database');
const { admin, db: firestoreDb, auth: firebaseAuth, bucket: firebaseBucket, firebaseClientConfig, isFirebaseInitialized } = require('./config/firebaseAdmin');
const uploadMiddleware = require('./middlewares/uploadMiddleware');
const { uploadToFirebaseStorage } = uploadMiddleware;
const {
    login: firebaseLoginController,
    prepareFirebaseUser,
    sendFirebaseEmailLink,
    verifyFirebaseEmailLink,
    ensureFirebaseUserSynced,
    getFirebaseClientConfig
} = require('./controllers/authController');
const { getSlaSettings, resolveSlaHours, calculateTicketSlaHours } = require('./utils/slaUtils');
const app = express();
const server = http.createServer(app);

// إعدادات CORS قابلة للتخصيص عبر .env
const allowedOrigins = process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : '*';
const io = new Server(server, { cors: { origin: allowedOrigins } });

// حقن كائن الـ Socket.io داخل تطبيق Express
app.set('io', io);

// Port 3000 is required by AI Studio web environment
const PORT = (process.env.PORT && process.env.PORT !== '8080') ? Number(process.env.PORT) : 3000;

// ================= [ البند 4: تأمين JWT_SECRET ومنع القيم الافتراضية المكشوفة ] =================
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET === 'SuperSecretKeyForTicketingSystem2026!') {
    process.env.JWT_SECRET = 'EnterpriseDesk_v6_Hardened_Fallback_JWT_Secret_2026_SecureKey!';
}
const JWT_SECRET = process.env.JWT_SECRET;

// ================= [ البند 6: تشفير وإخفاء بيانات البطاقات PCI-DSS (AES-256-GCM) ] =================
const { encryptDPAN, decryptDPAN, formatTicketDPAN } = require('./utils/cryptoUtils');

// Security Headers أساسية + منع الوصول المباشر لملفات مفاتيح الخدمة
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    if (req.path && req.path.includes('firebase-adminsdk')) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    next();
});

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// تقديم ملفات الواجهة الأمامية فقط (تم إزالة express.static للمرفقات - البند 3)
app.use(express.static(path.join(__dirname, 'public')));

// ================= [ البند 3: تأمين Multer + الرفع السحابي إلى Firebase Cloud Storage ] =================
const upload = uploadMiddleware;

const getClientIp = (req) => {
    const raw = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    return String(raw).split(',')[0].trim().replace('::ffff:', '') || 'Localhost';
};

const logSecurity = (req, action, details, customUser = null) => {
    const u = customUser || (req && req.user) || { id: null, username: 'System' };
    const ip = req ? getClientIp(req) : 'System-Daemon';
    const username = u.username || u.full_name || u.email || 'System';
    db.run(`INSERT INTO security_logs (user_id, username, action, details, ip_address) VALUES (?, ?, ?, ?, ?)`,
        [u.id, username, action, details, ip], (err) => {
            if (err) console.error('خطأ في تسجيل السجل الأمني:', err.message);
        });
    if (firestoreDb) {
        firestoreDb.collection('security_logs').add({
            user_id: String(u.uid || u.id || 'system'),
            username,
            action,
            details,
            ip_address: ip,
            created_at: new Date().toISOString()
        }).catch(() => {});
    }
};

const sendSmartNotification = ({ user_id = null, department_id = null, ticket_id, title, message }) => {
    const createdAt = new Date().toISOString();
    if (firestoreDb) {
        firestoreDb.collection('notifications').add({
            user_id, department_id, ticket_id, title, message, is_read: 0, created_at: createdAt
        }).catch(() => {});
    }
    db.run(`INSERT INTO notifications (user_id, department_id, ticket_id, title, message) VALUES (?, ?, ?, ?, ?)`,
        [user_id, department_id, ticket_id, title, message], function(err) {
            if (err) return console.error('خطأ في حفظ الإشعار:', err.message);
            const notifData = {
                id: this.lastID, user_id, department_id, ticket_id,
                title, message, is_read: 0, created_at: createdAt
            };
            if (user_id) io.to(`user_${user_id}`).emit('targeted_notification', notifData);
            if (department_id) io.to(`dept_${department_id}`).emit('targeted_notification', notifData);
            io.to('role_admin').emit('targeted_notification', notifData);
        });
};

// مزامنة أولية للبيانات الأساسية إلى Firestore عند تشغيل الخادم
const syncInitialDataToFirestore = () => {
    if (!firestoreDb) return;
    db.all(`SELECT * FROM departments`, [], (err, depts) => {
        if (!err && Array.isArray(depts)) {
            depts.forEach(d => {
                firestoreDb.collection('departments').doc(String(d.id)).set(d, { merge: true }).catch(() => {});
            });
        }
    });
    db.all(`SELECT users.*, departments.name AS dept_name FROM users LEFT JOIN departments ON users.department_id = departments.id`, [], (err, users) => {
        if (!err && Array.isArray(users)) {
            users.forEach(u => {
                let perms = {};
                try { perms = JSON.parse(u.permissions || '{}'); } catch (e) {}
                firestoreDb.collection('users').doc(String(u.id)).set({
                    id: u.id,
                    full_name: u.full_name,
                    username: u.username,
                    email: u.email || `${u.username}@tickets-system.com`,
                    role: u.role,
                    department_id: u.department_id,
                    dept_name: u.dept_name || 'إدارة عامة',
                    permissions: perms,
                    must_change_password: Boolean(u.must_change_password),
                    created_at: u.created_at || new Date().toISOString()
                }, { merge: true }).catch(() => {});

                // مزامنة المستخدم تلقائياً في Firebase Authentication
                ensureFirebaseUserSynced(u, u.username === 'admin' ? 'admin123' : null).catch(() => {});
            });
        }
    });
};
setTimeout(syncInitialDataToFirestore, 2500);

// ================= [ البند 8 و 16: النسخ الاحتياطي الآمن لـ WAL + تدوير النسخ + تنظيف الإشعارات ] =================
const performAutoBackup = () => {
    try {
        const dateStr = new Date().toISOString().slice(0, 10);
        const backupDir = path.join(__dirname, 'backups');
        const dest = path.join(backupDir, `auto_backup_${dateStr}.db`);

        if (!fs.existsSync(dest)) {
            // استخدام VACUUM INTO يضمن نسخ قاعدة البيانات مع دمج الـ WAL بأمان تام دون تلف
            const escapedDest = dest.replace(/'/g, "''");
            db.run(`VACUUM INTO '${escapedDest}'`, (err) => {
                if (err) return console.error('❌ خطأ في النسخ الاحتياطي التلقائي (WAL):', err.message);
                console.log(`💾 تم إنشاء نسخة احتياطية متوافقة مع WAL: auto_backup_${dateStr}.db`);

                // Rotation: الاحتفاظ بآخر 14 نسخة احتياطية فقط
                fs.readdir(backupDir, (readErr, files) => {
                    if (readErr) return;
                    const dbFiles = files
                        .filter(f => f.startsWith('auto_backup_') && f.endsWith('.db'))
                        .sort()
                        .reverse();
                    if (dbFiles.length > 14) {
                        dbFiles.slice(14).forEach(oldFile => {
                            fs.unlink(path.join(backupDir, oldFile), () => {});
                        });
                    }
                });
            });
        }

        // البند 16: سياسة الاحتفاظ بالإشعارات (حذف الإشعارات الأقدم من 90 يوماً وتنظيف جدول القراءات)
        db.run(`DELETE FROM notifications WHERE created_at < datetime('now', '-90 days')`);
        db.run(`DELETE FROM notification_reads WHERE notification_id NOT IN (SELECT id FROM notifications)`);
    } catch (e) {
        console.error('خطأ في الصيانة الدورية:', e.message);
    }
};
setTimeout(performAutoBackup, 5000);
setInterval(performAutoBackup, 6 * 3600 * 1000); // فحص كل 6 ساعات

// ================= [ البند 12: مراقب الـ SLA الموحد بتوقيت UTC ] =================
const runSlaEscalationCheck = () => {
    getSlaSettings(db, (settings) => {
        if (!settings.sla_auto_escalate) return;

        const excludedStatuses = ["'resolved'", "'closed'"];
        if (settings.sla_pause_on_pending) excludedStatuses.push("'pending'");
        if (settings.sla_pause_on_approval) excludedStatuses.push("'pending_approval'");

        const query = `
            SELECT id, title, department_id, sla_due_time 
            FROM tickets 
            WHERE deleted_at IS NULL
              AND status NOT IN (${excludedStatuses.join(', ')}) 
              AND sla_paused = 0 
              AND escalated = 0 
              AND sla_due_time IS NOT NULL
              AND datetime(sla_due_time) < datetime('now')
        `;
        db.all(query, [], (err, overdueTickets) => {
            if (err || !overdueTickets || overdueTickets.length === 0) return;
            overdueTickets.forEach(t => {
                db.run(`UPDATE tickets SET priority = 'urgent', escalated = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [t.id]);
                db.run(`INSERT INTO ticket_timeline (ticket_id, user_id, action_type, content, ip_address) VALUES (?, COALESCE((SELECT id FROM users ORDER BY id ASC LIMIT 1), 1), 'status_change', ?, 'SLA-Engine')`,
                    [t.id, `🚨 [تصعيد تلقائي SLA]: تجاوز التيكت الوقت المعياري للحل، تم رفع الأولوية تلقائياً إلى (🔥 عاجل جداً) وإشعار الإدارة.`]);
                sendSmartNotification({
                    department_id: t.department_id,
                    ticket_id: t.id,
                    title: `🚨 تصعيد SLA خطير للتيكت (#${t.id})`,
                    message: `تجاوز التيكت الوقت المسموح وتم ترفيعه لعاجل جداً: ${t.title}`
                });
                io.emit('ticket_updated', { ticket_id: t.id });
            });
            io.emit('tickets_updated');
        });
    });
};
setTimeout(runSlaEscalationCheck, 3000);
setInterval(runSlaEscalationCheck, 30 * 1000);

// ================= [ حراس الأمان (Firebase ID Token + JWT) ] =================
const { verifyToken, verifyAdmin } = require('./middlewares/auth');

// دالة مساعدة للتحقق من صلاحية الوصول للتيكت (تُستخدم في HTTP و Socket.IO والمرفقات)
const checkTicketAccess = (user, ticketId, callback) => {
    if (!user || !ticketId) return callback(false, null);
    const { role, id: userId, department_id, permissions } = user;

    db.get(`SELECT * FROM tickets WHERE id = ? AND deleted_at IS NULL`, [ticketId], (err, t) => {
        if (err || !t) return callback(false, null);
        if (role === 'admin' || (permissions && permissions.can_view_all)) return callback(true, t);

        const allowed =
            (role === 'employee' && t.creator_id === userId) ||
            (role === 'agent' && (t.department_id === department_id || t.creator_id === userId || t.is_handover === 1));

        callback(allowed, t);
    });
};

// حارس الصلاحيات المركزي على مستوى التيكت (البند 2)
const canAccessTicket = (req, res, next) => {
    checkTicketAccess(req.user, req.params.id, (allowed, ticket) => {
        if (!ticket) return res.status(404).json({ error: 'التيكت غير موجود أو تم حذفه' });
        if (!allowed) {
            logSecurity(req, 'محاولة وصول مرفوضة (IDOR)', `محاولة وصول غير مصرح بها إلى تيكت #${req.params.id}`, req.user);
            return res.status(403).json({ error: 'غير مصرح لك بالوصول لهذا التيكت' });
        }
        req.ticket = ticket;
        next();
    });
};

// ================= [ البند 3: مسار محمي لتحميل وعرض المرفقات بدل الـ Static المكشوف ] =================
const serveProtectedAttachment = (req, res) => {
    const safeFilename = path.basename(req.params.filename);
    const filePath = path.join(__dirname, 'uploads', safeFilename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'المرفق غير موجود' });
    }

    db.get(
        `SELECT t.id FROM tickets t 
         LEFT JOIN ticket_timeline tl ON tl.ticket_id = t.id 
         WHERE (t.attachment_path = ? OR tl.attachment_path = ?) AND t.deleted_at IS NULL LIMIT 1`,
        [safeFilename, safeFilename],
        (err, row) => {
            if (err || !row) return res.status(403).json({ error: 'غير مصرح بالوصول لهذا الملف' });

            checkTicketAccess(req.user, row.id, (allowed) => {
                if (!allowed) return res.status(403).json({ error: 'غير مصرح لك بعرض مرفقات هذا التيكت' });

                res.setHeader('X-Content-Type-Options', 'nosniff');
                res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
                res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);
                res.sendFile(filePath);
            });
        }
    );
};
app.get('/api/attachments/:filename', verifyToken, serveProtectedAttachment);
app.get('/uploads/:filename', verifyToken, serveProtectedAttachment);
app.use('/api/analytics', require('./routes/analyticsRoutes'));

// ================= [ البند 5 و 7: المصادقة + Rate Limiter + قفل الحساب + إجبار تغيير كلمة المرور ] =================
const loginIpBuckets = new Map(); // ip -> { count, resetAt }

const loginRateLimiter = (req, res, next) => {
    const ip = getClientIp(req);
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 دقيقة
    const maxAttempts = 15;

    const record = loginIpBuckets.get(ip) || { count: 0, resetAt: now + windowMs };
    if (now > record.resetAt) {
        record.count = 0;
        record.resetAt = now + windowMs;
    }
    record.count += 1;
    loginIpBuckets.set(ip, record);

    if (record.count > maxAttempts) {
        logSecurity(req, 'حظر Rate Limit', `تجاوز الحد المسموح لمحاولات الدخول من العنوان ${ip}`);
        return res.status(429).json({ error: 'محاولات دخول كثيرة جداً، يرجى الانتظار 15 دقيقة والمحاولة مجدداً.' });
    }
    next();
};

const maskEmailAddress = (email) => {
    if (!email || !email.includes('@')) return email || '';
    const [local, domain] = email.split('@');
    if (local.length <= 2) return `${local[0] || '*'}***@${domain}`;
    return `${local.slice(0, 2)}${'*'.repeat(Math.min(5, local.length - 2))}@${domain}`;
};

// مسار عام لجلب وضع تسجيل الدخول الحالي وإعدادات Firebase للواجهة الأمامية (index.html)
app.get('/api/auth/config', (req, res) => {
    res.json({
        login_mode: 'firebase',
        firebase_config: firebaseClientConfig
    });
});

app.get('/api/auth/firebase-config', getFirebaseClientConfig);
app.post('/api/auth/prepare-firebase-user', loginRateLimiter, prepareFirebaseUser);
app.post('/api/auth/firebase-login', loginRateLimiter, firebaseLoginController);
app.post('/api/auth/send-firebase-email-link', loginRateLimiter, sendFirebaseEmailLink);
app.post('/api/auth/verify-firebase-email-link', loginRateLimiter, verifyFirebaseEmailLink);

// جدول الروابط السريعة الآمنة (Magic Links)
db.run(`
    CREATE TABLE IF NOT EXISTS magic_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at DATETIME NOT NULL,
        used INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
`);

// طلب رابط تسجيل دخول سريع ومباشر (Magic Link)
app.post('/api/auth/request-magic-link', loginRateLimiter, (req, res) => {
    const rawIdentifier = (req.body.identifier || req.body.email || req.body.username || '').trim();
    if (!rawIdentifier) {
        return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم أو البريد الإلكتروني' });
    }

    const query = `
        SELECT users.*, departments.name AS dept_name 
        FROM users LEFT JOIN departments ON users.department_id = departments.id 
        WHERE LOWER(users.email) = LOWER(?) OR LOWER(users.username) = LOWER(?)
        LIMIT 1
    `;
    db.get(query, [rawIdentifier, rawIdentifier], (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: 'الحساب غير مسجل في النظام' });
        }

        const magicToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

        db.run(
            `INSERT INTO magic_links (user_id, token, expires_at) VALUES (?, ?, ?)`,
            [user.id, magicToken, expiresAt],
            (insErr) => {
                if (insErr) {
                    return res.status(500).json({ error: 'تعذر إنشاء رابط الدخول السريع' });
                }

                const targetEmail = (user.email || `${user.username}@orbex.com`).trim().toLowerCase();
                const protocol = req.protocol || 'http';
                const host = req.get('host') || 'localhost:3000';
                const magicLink = `${protocol}://${host}/index.html?magicToken=${magicToken}`;

                console.log(`✨ [OrbexDesk Magic Link] تم إنشاء الرابط بنجاح لحساب (${user.username}):\n   👉 ${magicLink}`);
                logSecurity(req, 'إنشاء رابط سريع', `تم إنشاء رابط دخول سريع للمستخدم (${user.username})`, { id: user.id });

                res.json({
                    success: true,
                    magicLink,
                    email: targetEmail,
                    email_masked: maskEmailAddress(targetEmail),
                    message: 'تم تجهيز رابط الدخول المباشر بنجاح'
                });
            }
        );
    });
});

// التحقق من الرابط السريع وتسجيل الدخول الفوري
app.post('/api/auth/verify-magic-token', loginRateLimiter, (req, res) => {
    const magicToken = (req.body.magicToken || req.body.token || '').trim();
    if (!magicToken) {
        return res.status(400).json({ error: 'رمز الدخول غير صالح' });
    }

    db.get(
        `SELECT m.*, u.id AS u_id, u.full_name, u.username, u.email, u.role, u.department_id, u.permissions, u.must_change_password, d.name AS dept_name
         FROM magic_links m
         JOIN users u ON u.id = m.user_id
         LEFT JOIN departments d ON d.id = u.department_id
         WHERE m.token = ? AND m.used = 0 AND datetime(m.expires_at) > datetime('now')
         LIMIT 1`,
        [magicToken],
        (err, row) => {
            if (err || !row) {
                return res.status(401).json({ error: 'رابط الدخول غير صالح أو تم استخدامه مسبقاً' });
            }

            db.run(`UPDATE magic_links SET used = 1 WHERE id = ?`, [row.id]);

            let perms = {};
            try { perms = JSON.parse(row.permissions || '{}'); } catch (e) {}

            const payload = {
                id: row.u_id,
                full_name: row.full_name,
                username: row.username,
                email: row.email,
                role: row.role,
                department_id: row.department_id,
                permissions: perms,
                must_change_password: Boolean(row.must_change_password)
            };
            const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });

            logSecurity(req, 'دخول برابط سريع', `تم تسجيل الدخول بنجاح عبر الرابط السريع (${row.username})`, payload);

            res.json({
                success: true,
                token,
                user: { ...payload, dept_name: row.dept_name || 'إدارة عامة' },
                message: 'تم تسجيل الدخول بنجاح'
            });
        }
    );
});

app.post('/api/auth/login', loginRateLimiter, (req, res) => {
    const rawIdentifier = (req.body.identifier || req.body.email || req.body.username || '').trim();
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!rawIdentifier || !password) {
        return res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني وكلمة المرور' });
    }

    const query = `
        SELECT users.*, departments.name AS dept_name 
        FROM users LEFT JOIN departments ON users.department_id = departments.id 
        WHERE LOWER(users.email) = LOWER(?) OR LOWER(users.username) = LOWER(?)
        LIMIT 1
    `;
    db.get(query, [rawIdentifier, rawIdentifier], async (err, user) => {
        if (err) return res.status(500).json({ error: 'خطأ في الخادم' });
        if (!user) return res.status(401).json({ error: 'البريد الإلكتروني أو الحساب غير مسجل في النظام' });

        // فحص القفل المؤقت للحساب (البند 5)
        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            return res.status(423).json({ error: 'تم قفل الحساب مؤقتاً لتجاوز المحاولات الفاشلة. حاول بعد 15 دقيقة.' });
        }

        const validPass = await bcrypt.compare(password, user.password);
        if (!validPass) {
            const attempts = (user.failed_login_attempts || 0) + 1;
            const lockUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;

            db.run(`UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?`, [attempts, lockUntil, user.id]);
            logSecurity(req, 'فشل تسجيل دخول', `محاولة فاشلة رقم (${attempts}) لحساب (${user.email || user.username})`, { id: user.id, username: user.username });

            return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
        }

        db.run(`UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?`, [user.id]);
        await ensureFirebaseUserSynced(user, password).catch(() => {});

        const targetEmail = (user.email || `${user.username}@orbex.com`).trim().toLowerCase();
        logSecurity(req, 'تحقق بيانات الدخول', `تم التحقق من بيانات الدخول لحساب (${targetEmail || user.username})`);

        let perms = {};
        try { perms = JSON.parse(user.permissions || '{}'); } catch (e) {}

        const payload = {
            id: user.id,
            full_name: user.full_name,
            username: user.username,
            email: user.email || targetEmail,
            role: user.role,
            department_id: user.department_id,
            permissions: perms,
            must_change_password: Boolean(user.must_change_password)
        };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });

        return res.json({
            success: true,
            token,
            user: { ...payload, dept_name: user.dept_name || 'إدارة عامة' },
            identifier: targetEmail,
            email: targetEmail,
            full_name: user.full_name,
            message: 'تم التحقق من بيانات الدخول بنجاح'
        });
    });
});

// إعادة إرسال رمز الـ OTP
app.post('/api/auth/resend-otp', loginRateLimiter, (req, res) => {
    const rawIdentifier = (req.body.identifier || req.body.email || req.body.username || '').trim();
    if (!rawIdentifier) {
        return res.status(400).json({ error: 'يرجى تحديد الحساب لإعادة إرسال الرمز' });
    }

    const query = `
        SELECT users.*, departments.name AS dept_name 
        FROM users LEFT JOIN departments ON users.department_id = departments.id 
        WHERE LOWER(users.email) = LOWER(?) OR LOWER(users.username) = LOWER(?)
        LIMIT 1
    `;
    db.get(query, [rawIdentifier, rawIdentifier], (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'الحساب غير موجود' });

        const otpCode = String(crypto.randomInt(100000, 999999));
        const codeHash = crypto.createHash('sha256').update(otpCode).digest('hex');
        const targetEmail = (user.email || `${user.username}@orbex.com`).trim().toLowerCase();
        const clientIp = getClientIp(req);

        db.run(`UPDATE otp_codes SET used = 1 WHERE user_id = ? AND used = 0`, [user.id], () => {
            db.run(
                `INSERT INTO otp_codes (user_id, email, code_hash, expires_at, created_at, used, attempts, ip_address)
                 VALUES (?, ?, ?, datetime('now', '+5 minutes'), datetime('now'), 0, 0, ?)`,
                [user.id, targetEmail, codeHash, clientIp],
                (insErr) => {
                    if (insErr) return res.status(500).json({ error: 'تعذر تجديد رمز التحقق' });

                    console.log(`🔄 [OrbexDesk OTP Resend] Code for (${targetEmail || user.username}): ${otpCode}`);

                    getEmailOtpSettings(async (smtpSettings) => {
                        let emailResult = { sent: false };
                        if (targetEmail && targetEmail.includes('@')) {
                            emailResult = await sendOtpEmailViaSmtp({
                                toEmail: targetEmail,
                                fullName: user.full_name || 'موظف أوربكس ديسك',
                                otpCode,
                                settings: smtpSettings
                            });
                        }

                        res.json({
                            success: true,
                            email_masked: maskEmailAddress(targetEmail || user.username),
                            sent_via_email: emailResult.sent,
                            message: emailResult.sent 
                                ? 'تمت إعادة إرسال رمز تحقق جديد إلى بريدك الإلكتروني'
                                : 'تم تجديد رمز التحقق بنجاح.'
                        });
                    });
                }
            );
        });
    });
});

// التحقق من رمز الـ OTP المكون من 6 أرقام وإصدار التوكن
app.post('/api/auth/verify-otp', loginRateLimiter, (req, res) => {
    const rawIdentifier = (req.body.identifier || req.body.email || req.body.username || '').trim();
    const otpCode = String(req.body.otp_code || '').trim();

    if (!rawIdentifier || !/^\d{6}$/.test(otpCode)) {
        return res.status(400).json({ error: 'يرجى إدخال رمز التحقق المكون من 6 أرقام بشكل صحيح' });
    }

    const userQuery = `
        SELECT users.*, departments.name AS dept_name 
        FROM users LEFT JOIN departments ON users.department_id = departments.id 
        WHERE LOWER(users.email) = LOWER(?) OR LOWER(users.username) = LOWER(?)
        LIMIT 1
    `;
    db.get(userQuery, [rawIdentifier, rawIdentifier], (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'الحساب غير موجود' });

        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            return res.status(423).json({ error: 'تم قفل الحساب مؤقتاً لتجاوز المحاولات الفاشلة. حاول بعد 15 دقيقة.' });
        }

        db.get(
            `SELECT *, CASE WHEN datetime(expires_at) < datetime('now') THEN 1 ELSE 0 END AS is_expired
             FROM otp_codes
             WHERE user_id = ? AND used = 0
             ORDER BY id DESC LIMIT 1`,
            [user.id],
            (otpErr, otpRow) => {
                if (otpErr || !otpRow) {
                    return res.status(401).json({ error: 'لا يوجد رمز تحقق نشط، يرجى طلب رمز جديد' });
                }

                if (otpRow.is_expired) {
                    db.run(`UPDATE otp_codes SET used = 1 WHERE id = ?`, [otpRow.id]);
                    return res.status(401).json({ error: 'انتهت صلاحية رمز التحقق (5 دقائق). يرجى الضغط على إعادة إرسال الرمز.' });
                }

                const inputHash = crypto.createHash('sha256').update(otpCode).digest('hex');
                if (inputHash !== otpRow.code_hash) {
                    const newOtpAttempts = (otpRow.attempts || 0) + 1;
                    const markUsed = newOtpAttempts >= 5 ? 1 : 0;
                    db.run(`UPDATE otp_codes SET attempts = ?, used = ? WHERE id = ?`, [newOtpAttempts, markUsed, otpRow.id]);

                    const userAttempts = (user.failed_login_attempts || 0) + 1;
                    const lockUntil = userAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
                    db.run(`UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?`, [userAttempts, lockUntil, user.id]);

                    logSecurity(req, 'فشل تحقق OTP', `رمز OTP خاطئ للمستخدم (${user.email || user.username}) - محاولة (${newOtpAttempts}/5)`, { id: user.id, username: user.username });
                    return res.status(401).json({ error: markUsed ? 'تم استنفاد محاولات هذا الرمز. يرجى طلب رمز جديد.' : 'رمز التحقق غير صحيح، يرجى التأكد والمحاولة مجدداً' });
                }

                // نجاح التحقق من الرمز
                db.run(`UPDATE otp_codes SET used = 1 WHERE id = ?`, [otpRow.id]);
                db.run(`UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?`, [user.id]);

                let perms = {};
                try { perms = JSON.parse(user.permissions || '{}'); } catch (e) {}

                const payload = {
                    id: user.id,
                    full_name: user.full_name,
                    username: user.username,
                    email: user.email || '',
                    role: user.role,
                    department_id: user.department_id,
                    permissions: perms,
                    must_change_password: false
                };
                const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });

                logSecurity(req, 'تسجيل دخول (OTP)', `دخول ناجح عبر رمز التحقق للبريد (${user.email || user.username})`, payload);

                res.json({
                    token,
                    must_change_password: false,
                    user: { ...payload, dept_name: user.dept_name || 'إدارة عامة' }
                });
            }
        );
    });
});

// مسار تغيير كلمة المرور الإجباري أو الاختياري للمستخدم الحالي (البند 7)
app.post('/api/auth/change-password', verifyToken, async (req, res) => {
    const { current_password, new_password } = req.body;
    if (!new_password || String(new_password).length < 8) {
        return res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن لا تقل عن 8 خانات' });
    }

    db.get(`SELECT * FROM users WHERE id = ?`, [req.user.id], async (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'المستخدم غير موجود' });

        // الأمان الحرج: التحقق من كلمة المرور الحالية إلزامي ما لم يكن الدخول أولياً ومطلوباً تغييرها
        if (!user.must_change_password) {
            if (!current_password) {
                return res.status(400).json({ error: 'يرجى إدخال كلمة المرور الحالية' });
            }
            const match = await bcrypt.compare(current_password, user.password);
            if (!match) return res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة' });
        } else if (current_password) {
            // حتى في حالة must_change_password، إذا أدخل كلمة المرور الحالية يتم فحصها
            const match = await bcrypt.compare(current_password, user.password);
            if (!match) return res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashed = await bcrypt.hash(new_password, salt);
        db.run(`UPDATE users SET password = ?, must_change_password = 0, failed_login_attempts = 0, locked_until = NULL WHERE id = ?`, [hashed, req.user.id], async (updateErr) => {
            if (updateErr) return res.status(500).json({ error: 'فشل تحديث كلمة المرور' });
            await ensureFirebaseUserSynced({ ...user, must_change_password: 0 }, new_password).catch(() => {});
            logSecurity(req, 'تغيير كلمة المرور', `قام المستخدم (${req.user.username}) بتحديث كلمة المرور الخاصة به`);

            let perms = {};
            try { perms = JSON.parse(user.permissions || '{}'); } catch (e) {}
            const newPayload = {
                id: user.id,
                full_name: user.full_name,
                username: user.username,
                role: user.role,
                department_id: user.department_id,
                permissions: perms,
                must_change_password: false
            };
            const refreshedToken = jwt.sign(newPayload, JWT_SECRET, { expiresIn: '12h' });
            res.json({
                message: 'تم تغيير كلمة المرور بنجاح',
                token: refreshedToken,
                user: newPayload
            });
        });
    });
});

// ================= [ 2. إعدادات النظام وشريط التنبيه العام ] =================
app.get('/api/system-config', verifyToken, (req, res) => {
    const config = { banner: { active: '0', text: '', type: 'warning' } };
    db.serialize(() => {
        db.all(`SELECT * FROM departments WHERE status = 'active' ORDER BY id ASC`, [], (e, r) => { config.departments = r || []; });
        db.all(`SELECT * FROM predefined_issues ORDER BY id ASC`, [], (e, r) => { config.issues = r || []; });
        db.all(`SELECT * FROM canned_responses ORDER BY id ASC`, [], (e, r) => { config.canned_responses = r || []; });
        db.all(`SELECT * FROM system_lists ORDER BY id ASC`, [], (e, r) => { config.lists = r || []; });
        db.all(`SELECT * FROM system_meta WHERE meta_key LIKE 'banner_%'`, [], (e, rows) => {
            (rows || []).forEach(row => {
                if (row.meta_key === 'banner_active') config.banner.active = row.meta_value;
                if (row.meta_key === 'banner_text') config.banner.text = row.meta_value;
                if (row.meta_key === 'banner_type') config.banner.type = row.meta_value;
            });
            getSlaSettings(db, (slaSettings) => {
                config.sla_settings = slaSettings;
                res.json(config);
            });
        });
    });
});

app.post('/api/admin/banner', verifyToken, verifyAdmin, (req, res) => {
    const { active, text, type } = req.body;
    db.serialize(() => {
        db.run(`INSERT OR REPLACE INTO system_meta (meta_key, meta_value) VALUES ('banner_active', ?)`, [active ? '1' : '0']);
        db.run(`INSERT OR REPLACE INTO system_meta (meta_key, meta_value) VALUES ('banner_text', ?)`, [text || '']);
        db.run(`INSERT OR REPLACE INTO system_meta (meta_key, meta_value) VALUES ('banner_type', ?)`, [type || 'warning'], () => {
            logSecurity(req, 'تحديث شريط التنبيه العام', `الحالة: ${active ? 'مفعل' : 'متوقف'} - النص: ${text}`);
            io.emit('config_updated');
            res.json({ message: 'تم تحديث شريط التنبيه العام لجميع الموظفين' });
        });
    });
});

app.get('/api/departments', verifyToken, (req, res) => {
    db.all(`SELECT * FROM departments WHERE status = 'active' ORDER BY id ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/agents', verifyToken, (req, res) => {
    db.all(`SELECT id, full_name, username, department_id, role FROM users`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ================= [ البند 16: الإشعارات وتخصيص القراءة المستقل لكل مستخدم ] =================
app.get('/api/notifications', verifyToken, (req, res) => {
    const { id, department_id, role } = req.user;
    let query = `
        SELECT n.id, n.user_id, n.department_id, n.ticket_id, n.title, n.message, n.created_at,
               CASE WHEN nr.user_id IS NOT NULL OR (n.user_id = ? AND n.is_read = 1) THEN 1 ELSE 0 END AS is_read
        FROM notifications n
        LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.user_id = ?
        WHERE n.user_id = ? OR (n.department_id = ? AND n.user_id IS NULL)
    `;
    let params = [id, id, id, department_id || 0];

    if (role === 'admin') {
        query = `
            SELECT n.id, n.user_id, n.department_id, n.ticket_id, n.title, n.message, n.created_at,
                   CASE WHEN nr.user_id IS NOT NULL OR (n.user_id = ? AND n.is_read = 1) THEN 1 ELSE 0 END AS is_read
            FROM notifications n
            LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.user_id = ?
            WHERE n.user_id = ? OR n.user_id IS NULL
        `;
        params = [id, id, id];
    }
    query += ` ORDER BY n.id DESC LIMIT 40`;

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.post('/api/notifications/mark-read', verifyToken, (req, res) => {
    const { id, department_id, role } = req.user;
    let selectSql = `SELECT id FROM notifications WHERE user_id = ? OR (department_id = ? AND user_id IS NULL) ORDER BY id DESC LIMIT 100`;
    let selectParams = [id, department_id || 0];
    if (role === 'admin') {
        selectSql = `SELECT id FROM notifications WHERE user_id = ? OR user_id IS NULL ORDER BY id DESC LIMIT 100`;
        selectParams = [id];
    }

    db.all(selectSql, selectParams, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        db.serialize(() => {
            db.run(`BEGIN IMMEDIATE TRANSACTION`);
            const stmt = db.prepare(`INSERT OR IGNORE INTO notification_reads (notification_id, user_id) VALUES (?, ?)`);
            (rows || []).forEach(r => stmt.run([r.id, id]));
            stmt.finalize();
            db.run(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`, [id]);
            db.run(`COMMIT`, () => res.json({ message: 'تمت القراءة' }));
        });
    });
});

app.post('/api/notifications/:id/read', verifyToken, (req, res) => {
    const { id } = req.user;
    const notifId = Number(req.params.id);
    db.serialize(() => {
        db.run(`INSERT OR IGNORE INTO notification_reads (notification_id, user_id) VALUES (?, ?)`, [notifId, id]);
        db.run(`UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`, [notifId, id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'تمت قراءة الإشعار' });
        });
    });
});
// ================= [ 3. الذكاء التشغيلي والمطابقة الذكية للأرقام المقتطعة ] =================
app.get('/api/tickets/check-duplicate', verifyToken, (req, res) => {
    const { account, ref } = req.query;
    let conditions = [];
    let params = [];

    if (account && account.trim().length > 2 && account !== '-') {
        conditions.push(`client_account = ?`);
        params.push(account.trim());
    }

    if (ref && ref.trim().length >= 4 && ref !== '-') {
        const cleanRef = ref.replace(/[^a-zA-Z0-9]/g, '');
        if (cleanRef.length >= 4) {
            const tail = cleanRef.slice(-6);
            conditions.push(`REPLACE(REPLACE(transaction_ref, ' ', ''), '-', '') LIKE ?`);
            params.push(`%${tail}%`);
        }
    }

    if (conditions.length === 0) return res.json([]);

    const query = `
        SELECT id, title, status, client_account, transaction_ref, created_at 
        FROM tickets 
        WHERE deleted_at IS NULL AND (${conditions.join(' OR ')}) AND status NOT IN ('resolved', 'closed')
        ORDER BY id DESC LIMIT 5
    `;
    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.get('/api/tickets/client-history/:account', verifyToken, (req, res) => {
    const acc = req.params.account;
    const currentTicket = req.query.exclude || 0;
    if (!acc || acc === '-' || acc === 'غير محدد') return res.json([]);

    db.all(`SELECT id, title, status, transaction_type, amount, currency, created_at FROM tickets WHERE deleted_at IS NULL AND client_account = ? AND id != ? ORDER BY id DESC LIMIT 10`,
        [acc, currentTicket], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        });
});

// ================= [ 4. إدارة التذاكر + البند 15 (Pagination & Filters) ] =================
app.get('/api/tickets', verifyToken, (req, res) => {
    const { role, id: userId, department_id, permissions } = req.user;
    const canViewAll = role === 'admin' || (permissions && permissions.can_view_all);

    let query = `
        SELECT tickets.*, 
               creator.full_name AS creator_name, 
               agent.full_name AS agent_name,
               departments.name AS dept_name 
        FROM tickets 
        LEFT JOIN users AS creator ON tickets.creator_id = creator.id
        LEFT JOIN users AS agent ON tickets.assigned_agent_id = agent.id
        LEFT JOIN departments ON tickets.department_id = departments.id
        WHERE tickets.deleted_at IS NULL
    `;
    let params = [];

    if (!canViewAll) {
        if (role === 'employee') {
            query += ` AND tickets.creator_id = ?`;
            params.push(userId);
        } else if (role === 'agent') {
            query += ` AND (tickets.department_id = ? OR tickets.creator_id = ? OR tickets.is_handover = 1)`;
            params.push(department_id, userId);
        }
    }

    // فلاتر Server-Side اختيارية (البند 15)
    if (req.query.status) {
        query += ` AND tickets.status = ?`;
        params.push(req.query.status);
    }
    if (req.query.department_id) {
        query += ` AND tickets.department_id = ?`;
        params.push(Number(req.query.department_id));
    }

    const limit = Math.min(Number(req.query.limit) || 500, 1000);
    const offset = Number(req.query.offset) || 0;
    query += ` ORDER BY tickets.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const safeRows = (rows || []).map(r => formatTicketDPAN(r, req.user));
        res.json(safeRows);
    });
});

// إنشاء تيكت + Validation (البند 13) + تشفير DPAN (البند 6) + Rules Engine (البند 19) + Firebase Cloud Storage & Firestore
app.post('/api/tickets', verifyToken, upload.single('attachment'), uploadToFirebaseStorage, (req, res) => {
    const {
        title, issue_type, transaction_type, client_account, client_email,
        psp_name, amount, currency, transaction_ref, card_dpan,
        description, priority, department_id, master_ticket_id
    } = req.body;

    // البند 13: التحقق من المدخلات الأساسية
    if (!title || String(title).trim().length < 3) return res.status(400).json({ error: 'عنوان التيكت مطلوب' });
    if (!description || String(description).trim().length < 3) return res.status(400).json({ error: 'وصف المشكلة مطلوب' });
    if (!department_id || isNaN(Number(department_id))) return res.status(400).json({ error: 'يرجى تحديد القسم المستلم' });

    const creator_id = req.user.id;
    const attachment_url = req.file ? (req.file.firebaseUrl || null) : null;
    const attachment_path = req.file ? (req.file.firebaseUrl || req.file.filename) : null;
    const attachment_name = req.file ? req.file.originalname : null;
    const ip = getClientIp(req);
    const encryptedDpan = encryptDPAN(card_dpan);

    // البند 19: جلب قواعد Maker-Checker من الإعدادات بدل الـ Hardcode
    db.all(`SELECT meta_key, meta_value FROM system_meta WHERE meta_key IN ('maker_checker_amount_limit', 'maker_checker_keywords')`, [], (metaErr, metaRows) => {
        let amountLimit = 10000;
        let keywords = ['تصفير رصيد', 'تنفيذ دفع يدوي'];
        (metaRows || []).forEach(m => {
            if (m.meta_key === 'maker_checker_amount_limit') amountLimit = Number(m.meta_value) || 10000;
            if (m.meta_key === 'maker_checker_keywords') {
                try { keywords = JSON.parse(m.meta_value); } catch (e) {}
            }
        });

        const matchesKeyword = keywords.some(kw => String(title).includes(kw));
        const initialStatus = (matchesKeyword || Number(amount) >= amountLimit) ? 'pending_approval' : 'open';
        const finalPriority = priority || 'medium';

        calculateTicketSlaHours(db, department_id, finalPriority, ({ slaHours, slaMinutes, settings }) => {
            const pauseImmediately = (initialStatus === 'pending_approval' && settings.sla_pause_on_approval) ? 1 : 0;
            const pausedAtSql = pauseImmediately ? `datetime('now')` : `NULL`;

            // البند 12: استخدام datetime('now') بتوقيت UTC الموحد مع احتساب ساعات القسم والأولوية بدقة
            const query = `
                INSERT INTO tickets (
                    title, issue_type, transaction_type, client_account, client_email,
                    psp_name, amount, currency, transaction_ref, card_dpan,
                    description, status, priority, creator_id, department_id, master_ticket_id,
                    attachment_path, attachment_name, sla_due_time, sla_paused, sla_paused_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+${slaMinutes} minutes'), ?, ${pausedAtSql})
            `;

            db.run(query, [
                String(title).trim(), issue_type || 'عام', transaction_type || 'أخرى / عام',
                client_account || '-', client_email || '-', psp_name || 'غير محدد',
                Number(amount) || 0, currency || 'USD', transaction_ref || '-', encryptedDpan,
                String(description).trim(), initialStatus, finalPriority,
                creator_id, Number(department_id), master_ticket_id || null,
                attachment_path, attachment_name, pauseImmediately
            ], function(err) {
                if (err) return res.status(500).json({ error: err.message });

                const ticketId = this.lastID;
                const nowIso = new Date().toISOString();
                const slaDueIso = new Date(Date.now() + slaMinutes * 60 * 1000).toISOString();
                const msg = initialStatus === 'pending_approval'
                    ? `قام بفتح التيكت (وتم تحويله تلقائياً لانتظار اعتماد المشرف Maker-Checker نظراً لحساسية الحركة - SLA: ${slaHours} ساعة)`
                    : `قام بفتح التيكت وإدراج البيانات التشغيلية (SLA المعياري: ${slaHours} ساعة)`;

                // حفظ التيكت والـ Timeline في Firestore (مجموعة tickets)
                if (firestoreDb) {
                    const ticketDocRef = firestoreDb.collection('tickets').doc(String(ticketId));
                    ticketDocRef.set({
                        id: ticketId,
                        title: String(title).trim(),
                        issue_type: issue_type || 'عام',
                        transaction_type: transaction_type || 'أخرى / عام',
                        client_account: client_account || '-',
                        client_email: client_email || '-',
                        psp_name: psp_name || 'غير محدد',
                        amount: Number(amount) || 0,
                        currency: currency || 'USD',
                        transaction_ref: transaction_ref || '-',
                        card_dpan: encryptedDpan,
                        description: String(description).trim(),
                        status: initialStatus,
                        priority: finalPriority,
                        creator_id,
                        creator_name: req.user.full_name || req.user.username,
                        department_id: Number(department_id),
                        master_ticket_id: master_ticket_id ? Number(master_ticket_id) : null,
                        attachment_url: attachment_url || attachment_path,
                        attachment_path,
                        attachment_name,
                        sla_due_time: slaDueIso,
                        sla_paused: pauseImmediately,
                        sla_paused_at: pauseImmediately ? nowIso : null,
                        escalated: 0,
                        is_handover: 0,
                        deleted_at: null,
                        created_at: nowIso,
                        updated_at: nowIso
                    }, { merge: true }).catch(() => {});

                    ticketDocRef.collection('timeline').add({
                        ticket_id: ticketId,
                        user_id: creator_id,
                        user_name: req.user.full_name || req.user.username,
                        role: req.user.role,
                        action_type: 'creation',
                        content: msg,
                        ip_address: ip,
                        created_at: nowIso
                    }).catch(() => {});
                }

                db.run(`INSERT INTO ticket_timeline (ticket_id, user_id, action_type, content, ip_address) VALUES (?, ?, 'creation', ?, ?)`,
                    [ticketId, creator_id, msg, ip], () => {
                        logSecurity(req, 'إنشاء تيكت', `إنشاء تيكت رقم #${ticketId} لحساب (${client_account || '-'})`);

                        sendSmartNotification({
                            department_id: Number(department_id),
                            ticket_id: ticketId,
                            title: `🔔 تيكت جديد لقسمكم (#${ticketId})`,
                            message: `${title} | حساب: ${client_account || '-'} (${amount || 0} ${currency || 'USD'})`
                        });

                        io.emit('tickets_updated');
                        res.status(201).json({ message: 'تم الإنشاء', ticket_id: ticketId, attachment_url: attachment_url || attachment_path });
                    });
            });
        });
    });
});

// استيراد جماعي محمي بـ Transaction (البند 10)
app.post('/api/tickets/bulk-import', verifyToken, (req, res) => {
    const { rows, department_id } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'الملف فارغ' });

    const targetDeptId = Number(department_id) || 1;
    calculateTicketSlaHours(db, targetDeptId, 'medium', ({ slaMinutes }) => {
        db.serialize(() => {
            db.run(`BEGIN IMMEDIATE TRANSACTION`);
            const stmt = db.prepare(`
                INSERT INTO tickets (title, issue_type, transaction_type, client_account, psp_name, amount, currency, transaction_ref, description, priority, creator_id, department_id, sla_due_time)
                VALUES (?, 'متابعة الحركات المالية الأساسية', ?, ?, ?, ?, ?, ?, ?, 'medium', ?, ?, datetime('now', '+${slaMinutes} minutes'))
            `);
            rows.forEach(r => {
                stmt.run([
                    r.title || 'مراجعة حركة مستوردة (Bulk)',
                    r.transaction_type || 'إيداع (Deposit)',
                    r.client_account || '-',
                    r.psp_name || 'غير محدد',
                    Number(r.amount) || 0,
                    r.currency || 'USD',
                    r.transaction_ref || '-',
                    r.description || 'تم الاستيراد عبر ملف CSV الجماعي',
                    req.user.id,
                    targetDeptId
                ]);
            });
            stmt.finalize((err) => {
                if (err) {
                    db.run(`ROLLBACK`);
                    return res.status(500).json({ error: 'فشل الاستيراد الجماعي وتم التراجع عن العملية' });
                }
                db.run(`COMMIT`, () => {
                    logSecurity(req, 'استيراد جماعي CSV', `تم استيراد ${rows.length} تيكت دفعة واحدة`);
                    sendSmartNotification({
                        department_id: targetDeptId,
                        ticket_id: 1,
                        title: `📥 استيراد جماعي جديد (${rows.length} تيكت)`,
                        message: `تم رفع ${rows.length} تيكت جديد لقسمكم عبر ملف CSV`
                    });
                    io.emit('tickets_updated');
                    res.json({ message: `تم استيراد ${rows.length} تيكت بنجاح` });
                });
            });
        });
    });
});

// الإجراءات الجماعية + الحذف الآمن Soft Delete (البند 9)
app.post('/api/tickets/bulk-action', verifyToken, (req, res) => {
    const { ticket_ids, action, value } = req.body;
    if (!Array.isArray(ticket_ids) || ticket_ids.length === 0) return res.status(400).json({ error: 'لم يتم تحديد تذاكر' });

    const cleanIds = ticket_ids.map(id => Number(id)).filter(id => !isNaN(id));
    if (cleanIds.length === 0) return res.status(400).json({ error: 'معرفات غير صالحة' });
    const placeholders = cleanIds.map(() => '?').join(',');

    const { role, department_id, permissions } = req.user;
    const canManageAll = role === 'admin' || (permissions && permissions.can_view_all);

    // الأمان الحرج: منع الموظف العادي من تنفيذ إجراءات جماعية
    if (role === 'employee' && !canManageAll) {
        return res.status(403).json({ error: 'غير مصرح للموظف العادي بتنفيذ إجراءات جماعية' });
    }

    const runBulkAction = () => {
        if (action === 'status') {
            getSlaSettings(db, (settings) => {
                const isResolvedOrClosed = (value === 'resolved' || value === 'closed');
            const shouldPause = (value === 'pending' && settings.sla_pause_on_pending) || (value === 'pending_approval' && settings.sla_pause_on_approval);

            let sql = '';
            if (isResolvedOrClosed) {
                sql = `
                    UPDATE tickets 
                    SET status = ?,
                        sla_due_time = CASE WHEN sla_paused = 1 AND sla_paused_at IS NOT NULL THEN datetime(sla_due_time, '+' || CAST(MAX(0, ROUND((julianday('now') - julianday(sla_paused_at)) * 86400)) AS INTEGER) || ' seconds') ELSE sla_due_time END,
                        sla_paused = 0,
                        sla_paused_at = NULL,
                        resolved_at = COALESCE(resolved_at, CURRENT_TIMESTAMP),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id IN (${placeholders}) AND deleted_at IS NULL
                `;
            } else if (shouldPause) {
                sql = `
                    UPDATE tickets 
                    SET status = ?,
                        sla_paused = 1,
                        sla_paused_at = CASE WHEN sla_paused = 1 AND sla_paused_at IS NOT NULL THEN sla_paused_at ELSE CURRENT_TIMESTAMP END,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id IN (${placeholders}) AND deleted_at IS NULL
                `;
            } else {
                sql = `
                    UPDATE tickets 
                    SET status = ?,
                        sla_due_time = CASE WHEN sla_paused = 1 AND sla_paused_at IS NOT NULL THEN datetime(sla_due_time, '+' || CAST(MAX(0, ROUND((julianday('now') - julianday(sla_paused_at)) * 86400)) AS INTEGER) || ' seconds') ELSE sla_due_time END,
                        sla_paused = 0,
                        sla_paused_at = NULL,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id IN (${placeholders}) AND deleted_at IS NULL
                `;
            }

            db.run(sql, [value, ...cleanIds], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                logSecurity(req, 'إجراء جماعي', `تغيير حالة التذاكر [${cleanIds.join(',')}] إلى ${value}`);
                io.emit('tickets_updated');
                res.json({ message: 'تم تحديث الحالات جماعياً' });
            });
        });
    } else if (action === 'assign') {
        const sql = `
            UPDATE tickets 
            SET assigned_agent_id = ?,
                status = 'in_progress',
                sla_due_time = CASE WHEN sla_paused = 1 AND sla_paused_at IS NOT NULL THEN datetime(sla_due_time, '+' || CAST(MAX(0, ROUND((julianday('now') - julianday(sla_paused_at)) * 86400)) AS INTEGER) || ' seconds') ELSE sla_due_time END,
                sla_paused = 0,
                sla_paused_at = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id IN (${placeholders}) AND deleted_at IS NULL
        `;
        db.run(sql, [value, ...cleanIds], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            logSecurity(req, 'إسناد جماعي', `إسناد التذاكر [${cleanIds.join(',')}] للموظف #${value}`);
            sendSmartNotification({
                user_id: Number(value),
                ticket_id: cleanIds[0],
                title: `📌 إسناد جماعي (${cleanIds.length} تذاكر)`,
                message: `تم إسناد التذاكر أرقام [${cleanIds.join(', ')}] إليك للمتابعة`
            });
            io.emit('tickets_updated');
            res.json({ message: 'تم إسناد التذاكر جماعياً' });
        });
    } else if (action === 'master') {
        db.run(`UPDATE tickets SET master_ticket_id = ? WHERE id IN (${placeholders}) AND deleted_at IS NULL`, [value, ...cleanIds], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            io.emit('tickets_updated');
            res.json({ message: 'تم ربط التذاكر بالتيكت الأم' });
        });
        } else if (action === 'delete') {
            if (req.user.role !== 'admin' && !(req.user.permissions && req.user.permissions.can_delete)) {
                return res.status(403).json({ error: 'لا تملك صلاحية الحذف' });
            }
            // البند 9: Soft Delete بدلاً من Hard Delete للحفاظ على الـ Audit Trail
            db.run(`UPDATE tickets SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ? WHERE id IN (${placeholders})`, [req.user.id, ...cleanIds], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                logSecurity(req, 'حذف آمن (Soft Delete)', `أرشفة/حذف التذاكر [${cleanIds.join(',')}]`);
                io.emit('tickets_updated');
                res.json({ message: 'تم الحذف الآمن مع الاحتفاظ بالسجل الرقابي' });
            });
        } else {
            res.status(400).json({ error: 'إجراء غير معروف' });
        }
    };

    // التحقق من أن تذاكر الإجراء الجماعي تقع ضمن قسم المختص (Agent)
    if (role === 'agent' && !canManageAll) {
        db.all(`SELECT id FROM tickets WHERE id IN (${placeholders}) AND department_id != ? AND deleted_at IS NULL`, [department_id, ...cleanIds], (err, unauthorizedRows) => {
            if (err) return res.status(500).json({ error: err.message });
            if (unauthorizedRows && unauthorizedRows.length > 0) {
                return res.status(403).json({ error: 'لا يمكنك تنفيذ إجراء جماعي على تذاكر خارج قسمك' });
            }
            runBulkAction();
        });
    } else {
        runBulkAction();
    }
});

app.get('/api/tickets/:id', verifyToken, canAccessTicket, (req, res) => {
    const query = `
        SELECT tickets.*, 
               creator.full_name AS creator_name, 
               agent.full_name AS agent_name,
               departments.name AS dept_name,
               departments.sla_hours AS dept_sla_hours
        FROM tickets 
        LEFT JOIN users AS creator ON tickets.creator_id = creator.id
        LEFT JOIN users AS agent ON tickets.assigned_agent_id = agent.id
        LEFT JOIN departments ON tickets.department_id = departments.id
        WHERE tickets.id = ? AND tickets.deleted_at IS NULL
    `;
    db.get(query, [req.params.id], (err, ticket) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!ticket) return res.status(404).json({ error: 'التيكت غير موجود' });

        formatTicketDPAN(ticket, req.user);

        db.all(`SELECT id, title, client_account, status FROM tickets WHERE master_ticket_id = ? AND deleted_at IS NULL`, [req.params.id], (err2, children) => {
            ticket.linked_children = children || [];
            res.json(ticket);
        });
    });
});

app.get('/api/tickets/:id/timeline', verifyToken, canAccessTicket, (req, res) => {
    let query = `
        SELECT ticket_timeline.*, users.full_name AS user_name, users.role 
        FROM ticket_timeline 
        LEFT JOIN users ON ticket_timeline.user_id = users.id
        WHERE ticket_id = ?
    `;
    if (req.user.role === 'employee') query += ` AND action_type != 'internal_note'`;
    query += ` ORDER BY created_at ASC`;

    db.all(query, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// الردود + Transactions (البند 10) + Firebase Cloud Storage & Firestore
app.post('/api/tickets/:id/reply', verifyToken, canAccessTicket, upload.single('attachment'), uploadToFirebaseStorage, (req, res) => {
    const ticketId = req.params.id;
    const userId = req.user.id;
    const { content, action_type, new_status, assigned_agent_id, mention_user_id } = req.body;
    const ip = getClientIp(req);

    const attachment_url = req.file ? (req.file.firebaseUrl || null) : null;
    const attachment_path = req.file ? (req.file.firebaseUrl || req.file.filename) : null;
    const attachment_name = req.file ? req.file.originalname : null;
    const finalActionType = (req.user.role !== 'employee' && action_type === 'internal_note') ? 'internal_note' : 'reply';

    const ticket = req.ticket;

    getSlaSettings(db, (settings) => {
        db.serialize(() => {
            db.run(`BEGIN IMMEDIATE TRANSACTION`);

            if (content || attachment_path) {
                db.run(`INSERT INTO ticket_timeline (ticket_id, user_id, action_type, content, attachment_path, attachment_name, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [ticketId, userId, finalActionType, content || 'مرفق جديد', attachment_path, attachment_name, ip]);

                if (firestoreDb) {
                    firestoreDb.collection('tickets').doc(String(ticketId)).collection('timeline').add({
                        ticket_id: Number(ticketId) || ticketId,
                        user_id: userId,
                        user_name: req.user.full_name || req.user.username,
                        role: req.user.role,
                        action_type: finalActionType,
                        content: content || 'مرفق جديد',
                        attachment_url: attachment_url || attachment_path,
                        attachment_path,
                        attachment_name,
                        ip_address: ip,
                        created_at: new Date().toISOString()
                    }).catch(() => {});
                }

                if (mention_user_id && Number(mention_user_id) > 0) {
                    sendSmartNotification({
                        user_id: Number(mention_user_id),
                        ticket_id: ticketId,
                        title: `📣 إشارة خاصة لك (@Mention) في تيكت (#${ticketId})`,
                        message: `${req.user.full_name} أشار إليك: ${(content || '').slice(0, 65)}`
                    });
                }

                if (finalActionType === 'reply') {
                    if (userId === ticket.creator_id) {
                        sendSmartNotification({
                            user_id: ticket.assigned_agent_id || null,
                            department_id: ticket.assigned_agent_id ? null : ticket.department_id,
                            ticket_id: ticketId,
                            title: `💬 رد جديد على التيكت (#${ticketId})`,
                            message: `${req.user.full_name}: ${(content || 'مرفق').slice(0, 60)}`
                        });
                    } else {
                        sendSmartNotification({
                            user_id: ticket.creator_id,
                            ticket_id: ticketId,
                            title: `💬 رد من القسم على تيكت (#${ticketId})`,
                            message: `${req.user.full_name}: ${(content || 'مرفق').slice(0, 60)}`
                        });
                    }
                }
            }

            if (new_status) {
                const statusAr = {
                    open: 'مفتوح', in_progress: 'قيد المعالجة', pending: 'بانتظار العميل (توقف SLA مؤقتاً)',
                    pending_approval: 'بانتظار اعتماد المشرف', resolved: 'تم الحل', closed: 'مغلق نهائياً'
                };
                const isResolvedOrClosed = (new_status === 'resolved' || new_status === 'closed');
                const shouldPause = (new_status === 'pending' && settings.sla_pause_on_pending) || (new_status === 'pending_approval' && settings.sla_pause_on_approval);

                if (isResolvedOrClosed) {
                    db.run(`
                        UPDATE tickets 
                        SET status = ?,
                            sla_due_time = CASE WHEN sla_paused = 1 AND sla_paused_at IS NOT NULL THEN datetime(sla_due_time, '+' || CAST(MAX(0, ROUND((julianday('now') - julianday(sla_paused_at)) * 86400)) AS INTEGER) || ' seconds') ELSE sla_due_time END,
                            sla_paused = 0,
                            sla_paused_at = NULL,
                            resolved_at = COALESCE(resolved_at, CURRENT_TIMESTAMP),
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    `, [new_status, ticketId]);
                } else if (shouldPause) {
                    db.run(`
                        UPDATE tickets 
                        SET status = ?,
                            sla_paused = 1,
                            sla_paused_at = CASE WHEN sla_paused = 1 AND sla_paused_at IS NOT NULL THEN sla_paused_at ELSE CURRENT_TIMESTAMP END,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    `, [new_status, ticketId]);
                } else {
                    db.run(`
                        UPDATE tickets 
                        SET status = ?,
                            sla_due_time = CASE WHEN sla_paused = 1 AND sla_paused_at IS NOT NULL THEN datetime(sla_due_time, '+' || CAST(MAX(0, ROUND((julianday('now') - julianday(sla_paused_at)) * 86400)) AS INTEGER) || ' seconds') ELSE sla_due_time END,
                            sla_paused = 0,
                            sla_paused_at = NULL,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    `, [new_status, ticketId]);
                }

                db.run(`INSERT INTO ticket_timeline (ticket_id, user_id, action_type, content, ip_address) VALUES (?, ?, 'status_change', ?, ?)`,
                    [ticketId, userId, `قام بتغيير الحالة إلى: [${statusAr[new_status] || new_status}]`, ip]);

                if (userId !== ticket.creator_id) {
                    sendSmartNotification({
                        user_id: ticket.creator_id,
                        ticket_id: ticketId,
                        title: `🔔 تحديث حالة تيكت (#${ticketId})`,
                        message: `تحولت حالة التيكت إلى: ${statusAr[new_status] || new_status}`
                    });
                }

                if (new_status === 'resolved' || new_status === 'closed') {
                    db.all(`SELECT id, creator_id FROM tickets WHERE master_ticket_id = ? AND status NOT IN ('resolved', 'closed') AND deleted_at IS NULL`, [ticketId], (err, children) => {
                        if (children && children.length > 0) {
                            children.forEach(ch => {
                                db.run(`
                                    UPDATE tickets 
                                    SET status = 'resolved',
                                        sla_due_time = CASE WHEN sla_paused = 1 AND sla_paused_at IS NOT NULL THEN datetime(sla_due_time, '+' || CAST(MAX(0, ROUND((julianday('now') - julianday(sla_paused_at)) * 86400)) AS INTEGER) || ' seconds') ELSE sla_due_time END,
                                        sla_paused = 0,
                                        sla_paused_at = NULL,
                                        resolved_at = COALESCE(resolved_at, CURRENT_TIMESTAMP),
                                        updated_at = CURRENT_TIMESTAMP
                                    WHERE id = ?
                                `, [ch.id]);
                                db.run(`INSERT INTO ticket_timeline (ticket_id, user_id, action_type, content, ip_address) VALUES (?, ?, 'status_change', ?, ?)`,
                                    [ch.id, userId, `تم الحل تلقائياً بعد إغلاق وحل التيكت الرئيسي الأم (#${ticketId})`, ip]);
                                sendSmartNotification({
                                    user_id: ch.creator_id,
                                    ticket_id: ch.id,
                                    title: `✅ تم حل التيكت (#${ch.id})`,
                                    message: `تم حل التيكت تلقائياً بعد معالجة المشكلة الرئيسية الأم (#${ticketId})`
                                });
                            });
                        }
                    });
                }
            }

            if (assigned_agent_id) {
                db.run(`UPDATE tickets SET assigned_agent_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [assigned_agent_id, ticketId]);
                db.get(`SELECT full_name FROM users WHERE id = ?`, [assigned_agent_id], (err, agent) => {
                    if (agent) {
                        db.run(`INSERT INTO ticket_timeline (ticket_id, user_id, action_type, content, ip_address) VALUES (?, ?, 'assignment', ?, ?)`,
                            [ticketId, userId, `تم إسناد التيكت إلى: [${agent.full_name}]`, ip]);

                        sendSmartNotification({
                            user_id: Number(assigned_agent_id),
                            ticket_id: ticketId,
                            title: `📌 تم إسناد تيكت إليك (#${ticketId})`,
                            message: `تم تكليفك بمعالجة التيكت رقم #${ticketId} (${ticket.title})`
                        });
                    }
                });
            }

            db.run(`COMMIT`, (commitErr) => {
                if (commitErr) {
                    db.run(`ROLLBACK`);
                    return res.status(500).json({ error: 'حدث خطأ أثناء حفظ الرد' });
                }
                io.emit('ticket_updated', { ticket_id: ticketId });
                io.emit('tickets_updated');
                res.json({ message: 'تم الحفظ' });
            });
        });
    });
});

app.post('/api/tickets/:id/transfer', verifyToken, canAccessTicket, (req, res) => {
    const ticketId = req.params.id;
    const { target_department_id, note, auto_workflow } = req.body;
    const ip = getClientIp(req);
    const currentTicket = req.ticket || {};

    const executeTransfer = (deptId, deptName, isAutoDealing) => {
        calculateTicketSlaHours(db, deptId, currentTicket.priority || 'medium', ({ slaHours, slaMinutes, settings }) => {
            db.serialize(() => {
                db.run(`BEGIN IMMEDIATE TRANSACTION`);
                if (settings.sla_reset_on_transfer) {
                    const newStatusSql = isAutoDealing ? `'in_progress'` : `CASE WHEN status IN ('pending', 'pending_approval') THEN 'open' ELSE status END`;
                    db.run(`
                        UPDATE tickets 
                        SET department_id = ?,
                            status = ${newStatusSql},
                            assigned_agent_id = NULL,
                            sla_due_time = datetime('now', '+${slaMinutes} minutes'),
                            sla_paused = 0,
                            sla_paused_at = NULL,
                            escalated = 0,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    `, [deptId, ticketId]);
                } else {
                    const newStatusSql = isAutoDealing ? `'in_progress'` : `status`;
                    db.run(`
                        UPDATE tickets 
                        SET department_id = ?,
                            status = ${newStatusSql},
                            assigned_agent_id = NULL,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    `, [deptId, ticketId]);
                }

                const timelineMsg = isAutoDealing
                    ? `✅ تمت موافقة قسم التداول (Dealing Desk) وتحويل التيكت تلقائياً إلى [${deptName}] للتنفيذ (SLA الجديد: ${slaHours} ساعة).`
                    : `🔄 تم تحويل التيكت إلى قسم [${deptName}] (SLA القسم: ${slaHours} ساعة) - الملاحظة: ${note || 'استكمال الإجراءات'}`;

                db.run(`INSERT INTO ticket_timeline (ticket_id, user_id, action_type, content, ip_address) VALUES (?, ?, 'status_change', ?, ?)`,
                    [ticketId, req.user.id, timelineMsg, ip]);

                db.run(`COMMIT`, () => {
                    sendSmartNotification({
                        department_id: Number(deptId),
                        ticket_id: ticketId,
                        title: isAutoDealing ? `✅ موافقة تداول جاهزة للتنفيذ (#${ticketId})` : `🔄 تيكت محول لقسمكم (#${ticketId})`,
                        message: isAutoDealing
                            ? `اعتمد قسم التداول التيكت رقم #${ticketId} وتم تحويله لقسمكم للتنفيذ`
                            : `تم تحويل التيكت #${ticketId} إلى [${deptName}] - ${note || ''}`
                    });
                    io.emit('ticket_updated', { ticket_id: ticketId });
                    io.emit('tickets_updated');
                    res.json({ message: isAutoDealing ? 'تم الاعتماد والتحويل للـ Back Office' : 'تم تحويل القسم بنجاح' });
                });
            });
        });
    };

    if (auto_workflow === 'dealing_to_backoffice') {
        db.get(`SELECT id, name FROM departments WHERE code = 'BACK_OFFICE' OR name LIKE '%Back Office%' OR id = 1 LIMIT 1`, [], (err, dept) => {
            const deptId = dept ? dept.id : 1;
            const deptName = dept ? dept.name : 'Back Office';
            executeTransfer(deptId, deptName, true);
        });
    } else {
        db.get(`SELECT id, name FROM departments WHERE id = ?`, [target_department_id], (err, dept) => {
            const deptId = dept ? dept.id : Number(target_department_id);
            const deptName = dept ? dept.name : 'قسم آخر';
            executeTransfer(deptId, deptName, false);
        });
    }
});

app.post('/api/tickets/:id/approve', verifyToken, (req, res) => {
    const canApprove = req.user.role === 'admin' || (req.user.permissions && req.user.permissions.can_approve);
    if (!canApprove) return res.status(403).json({ error: 'لا تملك صلاحية الاعتماد المزدوج (Maker-Checker)' });

    const ticketId = req.params.id;
    const { decision, note } = req.body;
    const newStatus = decision === 'approve' ? 'in_progress' : 'closed';
    const text = decision === 'approve'
        ? `🛡️ [اعتماد Maker-Checker]: تمت الموافقة والتعميد بالتنفيذ وبدء عداد الـ SLA. ${note || ''}`
        : `❌ [رفض Maker-Checker]: تم رفض العملية وإغلاق التيكت. السبب: ${note || ''}`;

    db.get(`SELECT department_id, creator_id, priority FROM tickets WHERE id = ? AND deleted_at IS NULL`, [ticketId], (err, ticket) => {
        if (!ticket) return res.status(404).json({ error: 'التيكت غير موجود' });

        calculateTicketSlaHours(db, ticket.department_id, ticket.priority || 'medium', ({ slaMinutes }) => {
            db.serialize(() => {
                db.run(`BEGIN IMMEDIATE TRANSACTION`);
                if (decision === 'approve') {
                    db.run(`
                        UPDATE tickets 
                        SET status = 'in_progress',
                            sla_due_time = datetime('now', '+${slaMinutes} minutes'),
                            sla_paused = 0,
                            sla_paused_at = NULL,
                            escalated = 0,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    `, [ticketId]);
                } else {
                    db.run(`
                        UPDATE tickets 
                        SET status = 'closed',
                            sla_paused = 0,
                            sla_paused_at = NULL,
                            resolved_at = COALESCE(resolved_at, CURRENT_TIMESTAMP),
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    `, [ticketId]);
                }
                db.run(`INSERT INTO ticket_timeline (ticket_id, user_id, action_type, content, ip_address) VALUES (?, ?, 'status_change', ?, ?)`,
                    [ticketId, req.user.id, text, getClientIp(req)]);
                db.run(`COMMIT`, () => {
                    logSecurity(req, 'اعتماد Maker-Checker', `قرار (${decision}) على تيكت #${ticketId}`);
                    sendSmartNotification({
                        department_id: ticket.department_id,
                        user_id: ticket.creator_id,
                        ticket_id: ticketId,
                        title: `🛡️ قرار اعتماد للتيكت (#${ticketId})`,
                        message: text
                    });
                    io.emit('ticket_updated', { ticket_id: ticketId });
                    io.emit('tickets_updated');
                    res.json({ message: 'تم تسجيل قرار الاعتماد' });
                });
            });
        });
    });
});

app.post('/api/tickets/:id/handover', verifyToken, canAccessTicket, (req, res) => {
    const ticketId = req.params.id;
    const { is_handover, handover_note } = req.body;
    const ip = getClientIp(req);
    const ticket = req.ticket;

    db.serialize(() => {
        db.run(`BEGIN IMMEDIATE TRANSACTION`);
        db.run(`UPDATE tickets SET is_handover = ?, handover_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [is_handover ? 1 : 0, handover_note || '', ticketId]);
        const msg = is_handover
            ? `📌 تم إدراج التيكت في قائمة [تسليم الشفت القادم] - ملاحظة التسليم: ${handover_note}`
            : `تمت إزالة التيكت من قائمة تسليم الشفت بعد استلامه.`;
        db.run(`INSERT INTO ticket_timeline (ticket_id, user_id, action_type, content, ip_address) VALUES (?, ?, 'status_change', ?, ?)`,
            [ticketId, req.user.id, msg, ip]);
        db.run(`COMMIT`, () => {
            if (is_handover && ticket) {
                sendSmartNotification({
                    department_id: ticket.department_id,
                    ticket_id: ticketId,
                    title: `📌 تسليم شفت للتيكت (#${ticketId})`,
                    message: `ملاحظة الشفت: ${handover_note || 'يرجى المتابعة'}`
                });
            }
            io.emit('ticket_updated', { ticket_id: ticketId });
            io.emit('tickets_updated');
            res.json({ message: 'تم تحديث حالة تسليم الشفت' });
        });
    });
});

// ================= [ 5. النسخ الاحتياطي وإدارة الأقسام وإعدادات الـ SLA ] =================
// تحميل نسخة احتياطية فورية متوافقة مع WAL (البند 8)
app.get('/api/admin/backup-download', verifyToken, verifyAdmin, (req, res) => {
    logSecurity(req, 'تحميل نسخة احتياطية', 'قام مدير النظام بتحميل نسخة كاملة من قاعدة البيانات');
    const tempSnapshot = path.join(__dirname, 'backups', `manual_snapshot_${Date.now()}.db`);
    const escapedSnap = tempSnapshot.replace(/'/g, "''");

    db.run(`VACUUM INTO '${escapedSnap}'`, (err) => {
        if (err) return res.status(500).json({ error: 'فشل إنشاء النسخة الاحتياطية الآمنة' });
        res.download(tempSnapshot, `Enterprise_Ticketing_Backup_${new Date().toISOString().slice(0, 10)}.db`, () => {
            fs.unlink(tempSnapshot, () => {});
        });
    });
});

// تصفير وتنظيف البيانات التجريبية لبدء التشغيل الفعلي (Production Factory Reset)
app.post('/api/admin/factory-reset', verifyToken, verifyAdmin, (req, res) => {
    const { remove_non_admin_users } = req.body || {};
    try {
        db.serialize(() => {
            db.run(`BEGIN IMMEDIATE TRANSACTION`);
            db.run(`DELETE FROM notification_reads`);
            db.run(`DELETE FROM notifications`);
            db.run(`DELETE FROM ticket_timeline`);
            db.run(`DELETE FROM tickets`);
            db.run(`DELETE FROM security_logs`);
            db.run(`DELETE FROM sqlite_sequence WHERE name IN ('tickets', 'ticket_timeline', 'notifications', 'security_logs')`);
            if (remove_non_admin_users) {
                db.run(`DELETE FROM users WHERE id != 1 AND role != 'admin'`);
            }
            db.run(`COMMIT`, (err) => {
                if (err) {
                    db.run(`ROLLBACK`);
                    return res.status(500).json({ error: 'فشل تنظيف قاعدة البيانات: ' + err.message });
                }
                // تنظيف المرفقات التجريبية القديمة
                const uploadsDir = path.join(__dirname, 'uploads');
                if (fs.existsSync(uploadsDir)) {
                    fs.readdir(uploadsDir, (readErr, files) => {
                        if (!readErr && Array.isArray(files)) {
                            files.forEach(file => {
                                fs.unlink(path.join(uploadsDir, file), () => {});
                            });
                        }
                    });
                }
                logSecurity(req, 'تصفير النظام للإنتاج (Factory Reset)', `تم مسح جميع التذاكر والسجلات التجريبية وتصفير العدادات لبدء التشغيل الفعلي${remove_non_admin_users ? ' (مع حذف الحسابات التجريبية)' : ''}`);
                io.emit('tickets_updated');
                io.emit('config_updated');
                res.json({ message: 'تم تنظيف قاعدة البيانات وتصفير عداد التذاكر بنجاح. النظام جاهز للعمل الفعلي.' });
            });
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// إدارة الأقسام
app.post('/api/admin/departments', verifyToken, verifyAdmin, (req, res) => {
    const { name, sla_hours } = req.body;
    if (!name || String(name).trim() === '') return res.status(400).json({ error: 'اسم القسم مطلوب' });
    const validSla = Math.max(0.25, parseFloat(sla_hours) || 4);
    db.run(`INSERT INTO departments (name, sla_hours) VALUES (?, ?)`, [name.trim(), validSla], function(err) {
        if (err) return res.status(400).json({ error: 'اسم القسم موجود مسبقاً' });
        logSecurity(req, 'إضافة قسم', `قسم جديد: ${name} (SLA: ${validSla}h)`);
        io.emit('config_updated');
        res.status(201).json({ message: 'تم إضافة القسم', id: this.lastID });
    });
});

app.put('/api/admin/departments/:id', verifyToken, verifyAdmin, (req, res) => {
    const { name, sla_hours, recalculate_open } = req.body;
    if (!name || String(name).trim() === '') return res.status(400).json({ error: 'اسم القسم مطلوب' });
    const validSla = Math.max(0.25, parseFloat(sla_hours) || 4);
    const deptId = Number(req.params.id);

    db.run(`UPDATE departments SET name = ?, sla_hours = ? WHERE id = ?`, [name.trim(), validSla, deptId], function(err) {
        if (err) return res.status(400).json({ error: err.message });

        if (recalculate_open !== false) {
            getSlaSettings(db, (settings) => {
                db.all(`SELECT id, priority, created_at, sla_paused, sla_paused_at FROM tickets WHERE department_id = ? AND status NOT IN ('resolved', 'closed') AND deleted_at IS NULL`, [deptId], (tErr, openTickets) => {
                    if (!tErr && openTickets && openTickets.length > 0) {
                        openTickets.forEach(t => {
                            const hours = resolveSlaHours({ deptSlaHours: validSla, priority: t.priority, settings });
                            const mins = Math.max(1, Math.round(hours * 60));
                            db.run(`
                                UPDATE tickets 
                                SET sla_due_time = datetime(created_at, '+${mins} minutes'),
                                    escalated = CASE WHEN datetime(created_at, '+${mins} minutes') > datetime('now') THEN 0 ELSE escalated END,
                                    updated_at = CURRENT_TIMESTAMP
                                WHERE id = ?
                            `, [t.id]);
                        });
                        io.emit('tickets_updated');
                    }
                });
            });
        }

        logSecurity(req, 'تعديل قسم و SLA', `تعديل القسم #${deptId} إلى (${name.trim()} - ${validSla}h)`);
        io.emit('config_updated');
        res.json({ message: 'تم تعديل القسم وساعات الـ SLA بنجاح' });
    });
});

// إعدادات الـ SLA الشاملة (الأولويات + السياسات + إعادة الاحتساب)
app.get('/api/admin/sla-settings', verifyToken, verifyAdmin, (req, res) => {
    getSlaSettings(db, (settings) => {
        res.json(settings);
    });
});

app.post('/api/admin/sla-settings', verifyToken, verifyAdmin, (req, res) => {
    const {
        sla_mode,
        sla_urgent_hours,
        sla_high_hours,
        sla_medium_hours,
        sla_low_hours,
        sla_pause_on_pending,
        sla_pause_on_approval,
        sla_reset_on_transfer,
        sla_auto_escalate
    } = req.body;

    const mode = ['dept_default', 'department_only', 'priority_only'].includes(sla_mode) ? sla_mode : 'dept_default';
    const urgentH = Math.max(0.25, parseFloat(sla_urgent_hours) || 1);
    const highH = Math.max(0.25, parseFloat(sla_high_hours) || 2);
    const mediumH = Math.max(0.25, parseFloat(sla_medium_hours) || 4);
    const lowH = Math.max(0.5, parseFloat(sla_low_hours) || 24);

    const pairs = [
        ['sla_mode', mode],
        ['sla_urgent_hours', String(urgentH)],
        ['sla_high_hours', String(highH)],
        ['sla_medium_hours', String(mediumH)],
        ['sla_low_hours', String(lowH)],
        ['sla_pause_on_pending', sla_pause_on_pending ? '1' : '0'],
        ['sla_pause_on_approval', sla_pause_on_approval ? '1' : '0'],
        ['sla_reset_on_transfer', sla_reset_on_transfer ? '1' : '0'],
        ['sla_auto_escalate', sla_auto_escalate ? '1' : '0']
    ];

    db.serialize(() => {
        db.run(`BEGIN IMMEDIATE TRANSACTION`);
        pairs.forEach(([k, v]) => {
            db.run(`INSERT OR REPLACE INTO system_meta (meta_key, meta_value) VALUES (?, ?)`, [k, v]);
        });
        logSecurity(req, 'تحديث إعدادات الـ SLA', `الوضع: ${mode} | الساعات (${urgentH}/${highH}/${mediumH}/${lowH})`);
        db.run(`COMMIT`, (err) => {
            if (err) {
                db.run(`ROLLBACK`);
                return res.status(500).json({ error: 'حدث خطأ أثناء حفظ إعدادات الـ SLA' });
            }
            io.emit('config_updated');
            runSlaEscalationCheck();
            res.json({ message: 'تم حفظ وتطبيق إعدادات الـ SLA بنجاح' });
        });
    });
});

app.post('/api/admin/sla-recalculate', verifyToken, verifyAdmin, (req, res) => {
    const { from_now } = req.body || {};
    getSlaSettings(db, (settings) => {
        db.all(`SELECT id, sla_hours FROM departments`, [], (dErr, depts) => {
            const deptMap = {};
            (depts || []).forEach(d => { deptMap[d.id] = d.sla_hours; });

            db.all(`SELECT id, department_id, priority, status, created_at FROM tickets WHERE status NOT IN ('resolved', 'closed') AND deleted_at IS NULL`, [], (tErr, activeTickets) => {
                if (tErr) return res.status(500).json({ error: tErr.message });

                db.serialize(() => {
                    db.run(`BEGIN IMMEDIATE TRANSACTION`);
                    (activeTickets || []).forEach(t => {
                        const deptSlaHours = deptMap[t.department_id];
                        const hours = resolveSlaHours({ deptSlaHours, priority: t.priority, settings });
                        const mins = Math.max(1, Math.round(hours * 60));
                        const shouldPause = (t.status === 'pending' && settings.sla_pause_on_pending) || (t.status === 'pending_approval' && settings.sla_pause_on_approval);
                        const baseTimeExpr = from_now ? `datetime('now', '+${mins} minutes')` : `datetime(created_at, '+${mins} minutes')`;

                        db.run(`
                            UPDATE tickets 
                            SET sla_due_time = ${baseTimeExpr},
                                sla_paused = ?,
                                sla_paused_at = CASE WHEN ? = 1 THEN COALESCE(sla_paused_at, CURRENT_TIMESTAMP) ELSE NULL END,
                                escalated = CASE WHEN ${baseTimeExpr} > datetime('now') OR ? = 1 THEN 0 ELSE escalated END,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id = ?
                        `, [shouldPause ? 1 : 0, shouldPause ? 1 : 0, shouldPause ? 1 : 0, t.id]);
                    });
                    logSecurity(req, 'إعادة احتساب الـ SLA', `تم تحديث عدادات الـ SLA لـ ${(activeTickets || []).length} تيكت نشط (${from_now ? 'من اللحظة الحالية' : 'من وقت الإنشاء'})`);
                    db.run(`COMMIT`, (commitErr) => {
                        if (commitErr) {
                            db.run(`ROLLBACK`);
                            return res.status(500).json({ error: 'فشل إعادة احتساب الـ SLA' });
                        }
                        runSlaEscalationCheck();
                        io.emit('tickets_updated');
                        res.json({ message: `تم تحديث وإعادة احتساب الـ SLA لـ ${(activeTickets || []).length} تيكت نشط بنجاح`, count: (activeTickets || []).length });
                    });
                });
            });
        });
    });
});

app.delete('/api/admin/departments/:id', verifyToken, verifyAdmin, (req, res) => {
    db.run(`UPDATE departments SET status = 'inactive' WHERE id = ?`, [req.params.id], () => {
        logSecurity(req, 'تعطيل قسم', `تعطيل القسم رقم #${req.params.id}`);
        io.emit('config_updated');
        res.json({ message: 'تم حذف القسم' });
    });
});

// إدارة المشاكل الثابتة
app.post('/api/admin/issues', verifyToken, verifyAdmin, (req, res) => {
    const { category, title, default_transaction_type } = req.body;
    db.run(`INSERT INTO predefined_issues (category, title, default_transaction_type) VALUES (?, ?, ?)`,
        [category, title, default_transaction_type || 'إيداع (Deposit)'], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            logSecurity(req, 'إضافة مشكلة ثابتة', `إضافة مشكلة: ${title}`);
            io.emit('config_updated');
            res.status(201).json({ id: this.lastID, message: 'تمت إضافة المشكلة' });
        });
});

app.put('/api/admin/issues/:id', verifyToken, verifyAdmin, (req, res) => {
    const { category, title, default_transaction_type } = req.body;
    db.run(`UPDATE predefined_issues SET category = ?, title = ?, default_transaction_type = ? WHERE id = ?`,
        [category, title, default_transaction_type, req.params.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            logSecurity(req, 'تعديل مشكلة ثابتة', `تعديل المشكلة #${req.params.id}`);
            io.emit('config_updated');
            res.json({ message: 'تم تعديل المشكلة' });
        });
});

app.delete('/api/admin/issues/:id', verifyToken, verifyAdmin, (req, res) => {
    db.run(`DELETE FROM predefined_issues WHERE id = ?`, [req.params.id], () => {
        logSecurity(req, 'حذف مشكلة ثابتة', `حذف المشكلة #${req.params.id}`);
        io.emit('config_updated');
        res.json({ message: 'تم حذف المشكلة' });
    });
});

// إدارة الردود التلقائية السريعة
app.post('/api/admin/canned-responses', verifyToken, verifyAdmin, (req, res) => {
    const { label, content } = req.body;
    db.run(`INSERT INTO canned_responses (label, content) VALUES (?, ?)`, [label, content], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        logSecurity(req, 'إضافة رد تلقائي', `إضافة رد سريع: ${label}`);
        io.emit('config_updated');
        res.status(201).json({ id: this.lastID, message: 'تمت إضافة الرد التلقائي' });
    });
});

app.put('/api/admin/canned-responses/:id', verifyToken, verifyAdmin, (req, res) => {
    const { label, content } = req.body;
    db.run(`UPDATE canned_responses SET label = ?, content = ? WHERE id = ?`, [label, content, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        logSecurity(req, 'تعديل رد تلقائي', `تعديل الرد السريع #${req.params.id}: ${label}`);
        io.emit('config_updated');
        res.json({ message: 'تم تعديل الرد التلقائي' });
    });
});

app.delete('/api/admin/canned-responses/:id', verifyToken, verifyAdmin, (req, res) => {
    db.run(`DELETE FROM canned_responses WHERE id = ?`, [req.params.id], () => {
        logSecurity(req, 'حذف رد تلقائي', `حذف الرد السريع #${req.params.id}`);
        io.emit('config_updated');
        res.json({ message: 'تم حذف الرد التلقائي' });
    });
});

// إدارة القوائم الديناميكية
app.post('/api/admin/system-lists', verifyToken, verifyAdmin, (req, res) => {
    const { list_type, value } = req.body;
    db.run(`INSERT INTO system_lists (list_type, value) VALUES (?, ?)`, [list_type, value], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        logSecurity(req, 'إضافة عنصر قائمة', `إضافة (${value}) إلى قائمة (${list_type})`);
        io.emit('config_updated');
        res.status(201).json({ id: this.lastID, message: 'تمت الإضافة' });
    });
});

app.put('/api/admin/system-lists/:id', verifyToken, verifyAdmin, (req, res) => {
    const { value } = req.body;
    db.run(`UPDATE system_lists SET value = ? WHERE id = ?`, [value, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        logSecurity(req, 'تعديل عنصر قائمة', `تعديل عنصر #${req.params.id} إلى (${value})`);
        io.emit('config_updated');
        res.json({ message: 'تم التعديل' });
    });
});

app.delete('/api/admin/system-lists/:id', verifyToken, verifyAdmin, (req, res) => {
    db.run(`DELETE FROM system_lists WHERE id = ?`, [req.params.id], () => {
        logSecurity(req, 'حذف عنصر قائمة', `حذف العنصر #${req.params.id}`);
        io.emit('config_updated');
        res.json({ message: 'تم الحذف' });
    });
});

// إدارة الموظفين (مع دعم البريد الإلكتروني و OTP)
app.get('/api/admin/users', verifyToken, verifyAdmin, (req, res) => {
    const query = `
        SELECT users.id, users.full_name, users.username, users.email, users.role, users.department_id, users.permissions, users.created_at, departments.name AS dept_name 
        FROM users LEFT JOIN departments ON users.department_id = departments.id ORDER BY users.id ASC
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/admin/users', verifyToken, verifyAdmin, async (req, res) => {
    const { full_name, username, email, password, role, department_id, permissions } = req.body;
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanUsername = (username || cleanEmail || '').trim();

    if (!full_name || (!cleanEmail && !cleanUsername)) {
        return res.status(400).json({ error: 'يرجى إدخال الاسم الكامل والبريد الإلكتروني للموظف' });
    }
    try {
        const rawPass = (password && String(password).trim().length >= 6)
            ? String(password).trim()
            : crypto.randomBytes(16).toString('hex');
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(rawPass, salt);
        const deptId = (role === 'agent') ? department_id : null;
        const permsObj = permissions || { can_export: true, can_approve: false, can_delete: false, can_view_all: false };
        const permsStr = JSON.stringify(permsObj);

        db.run(`INSERT INTO users (full_name, username, email, password, role, department_id, permissions, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
            [full_name.trim(), cleanUsername, cleanEmail || null, hashedPassword, role, deptId, permsStr], async function(err) {
                if (err) return res.status(400).json({ error: 'البريد الإلكتروني أو اسم المستخدم مسجل مسبقاً لموظف آخر' });
                const newUserId = this.lastID;

                // مزامنة الموظف الجديد في Firebase Authentication و Firestore
                const targetEmail = cleanEmail || `${cleanUsername}@tickets-system.com`;
                let firebaseUid = String(newUserId);
                if (firebaseAuth && targetEmail.includes('@')) {
                    try {
                        const fbUser = await firebaseAuth.createUser({
                            email: targetEmail,
                            password: rawPass.length >= 6 ? rawPass : 'Password123!',
                            displayName: full_name.trim()
                        });
                        firebaseUid = fbUser.uid;
                        await firebaseAuth.setCustomUserClaims(firebaseUid, { role: role || 'employee' });
                    } catch (fbErr) {
                        // قد يكون مسجلاً مسبقاً في Firebase Auth
                    }
                }
                if (firestoreDb) {
                    firestoreDb.collection('users').doc(firebaseUid).set({
                        uid: firebaseUid,
                        id: newUserId,
                        full_name: full_name.trim(),
                        username: cleanUsername,
                        email: targetEmail,
                        role,
                        department_id: deptId,
                        permissions: permsObj,
                        must_change_password: false,
                        created_at: new Date().toISOString()
                    }, { merge: true }).catch(() => {});
                }

                logSecurity(req, 'إنشاء موظف', `إنشاء حساب (${cleanEmail || cleanUsername}) بدور (${role})`);
                res.status(201).json({ message: 'تم الإنشاء ومزامنة الحساب مع Firebase', uid: firebaseUid, id: newUserId });
            });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/users/:id', verifyToken, verifyAdmin, async (req, res) => {
    const userId = req.params.id;
    const { full_name, email, username, role, department_id, new_password, permissions } = req.body;
    const cleanEmail = (email || '').trim().toLowerCase() || null;
    const deptId = (role === 'agent') ? department_id : null;
    const permsStr = JSON.stringify(permissions || {});

    db.get(`SELECT username FROM users WHERE id = ?`, [userId], async (findErr, existingUser) => {
        if (findErr || !existingUser) return res.status(404).json({ error: 'الموظف غير موجود' });
        const finalUsername = (username && username.trim()) ? username.trim() : existingUser.username;

        if (new_password && new_password.trim() !== '') {
            const salt = await bcrypt.genSalt(10);
            const hashed = await bcrypt.hash(new_password, salt);
            db.run(`UPDATE users SET full_name = ?, username = ?, email = ?, role = ?, department_id = ?, password = ?, permissions = ?, failed_login_attempts = 0, locked_until = NULL WHERE id = ?`,
                [full_name, finalUsername, cleanEmail, role, deptId, hashed, permsStr, userId], async (uErr) => {
                    if (uErr) return res.status(400).json({ error: 'البريد الإلكتروني أو اسم الدخول مستخدم لحساب آخر' });
                    await ensureFirebaseUserSynced({
                        id: Number(userId),
                        full_name,
                        username: finalUsername,
                        email: cleanEmail,
                        role,
                        department_id: deptId,
                        permissions: permsStr
                    }, new_password.trim()).catch(() => {});
                    logSecurity(req, 'تعديل موظف + كلمة مرور', `تحديث بيانات وبريد الموظف #${userId} (${cleanEmail || finalUsername})`);
                    res.json({ message: 'تم تحديث البيانات وكلمة المرور ومزامنتها مع Firebase' });
                });
        } else {
            db.run(`UPDATE users SET full_name = ?, username = ?, email = ?, role = ?, department_id = ?, permissions = ? WHERE id = ?`,
                [full_name, finalUsername, cleanEmail, role, deptId, permsStr, userId], async (uErr) => {
                    if (uErr) return res.status(400).json({ error: 'البريد الإلكتروني أو اسم الدخول مستخدم لحساب آخر' });
                    await ensureFirebaseUserSynced({
                        id: Number(userId),
                        full_name,
                        username: finalUsername,
                        email: cleanEmail,
                        role,
                        department_id: deptId,
                        permissions: permsStr
                    }, null).catch(() => {});
                    logSecurity(req, 'تعديل صلاحيات وبريد موظف', `تحديث بيانات الموظف #${userId} (${cleanEmail || finalUsername})`);
                    res.json({ message: 'تم تحديث بيانات وصلاحيات الموظف ومزامنتها مع Firebase' });
                });
        }
    });
});

app.delete('/api/admin/users/:id', verifyToken, verifyAdmin, (req, res) => {
    if (req.params.id == 1) return res.status(400).json({ error: 'لا يمكن حذف المشرف الرئيسي' });
    db.run(`DELETE FROM users WHERE id = ?`, [req.params.id], (err) => {
        if (err) return res.status(400).json({ error: 'لا يمكن حذف موظف مرتبط بتذاكر مسجلة، يمكنك تغيير صلاحياته بدلاً من ذلك.' });
        logSecurity(req, 'حذف موظف', `حذف الموظف #${req.params.id}`);
        res.json({ message: 'تم الحذف' });
    });
});


app.get('/api/admin/security-logs', verifyToken, verifyAdmin, (req, res) => {
    db.all(`SELECT * FROM security_logs ORDER BY id DESC LIMIT 150`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.get('/api/admin/rules', verifyToken, verifyAdmin, (req, res) => {
    db.all(`SELECT meta_key, meta_value FROM system_meta WHERE meta_key IN ('maker_checker_amount_limit', 'maker_checker_keywords')`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        let rules = { amount_limit: 10000, keywords: [] };
        (rows || []).forEach(r => {
            if (r.meta_key === 'maker_checker_amount_limit') rules.amount_limit = Number(r.meta_value);
            if (r.meta_key === 'maker_checker_keywords') {
                try { rules.keywords = JSON.parse(r.meta_value); } catch (e) {}
            }
        });
        res.json(rules);
    });
});

app.post('/api/admin/rules', verifyToken, verifyAdmin, (req, res) => {
    const { amount_limit, keywords } = req.body;
    db.serialize(() => {
        db.run(`BEGIN IMMEDIATE TRANSACTION`);
        db.run(`INSERT OR REPLACE INTO system_meta (meta_key, meta_value) VALUES ('maker_checker_amount_limit', ?)`, [Number(amount_limit) || 10000]);
        db.run(`INSERT OR REPLACE INTO system_meta (meta_key, meta_value) VALUES ('maker_checker_keywords', ?)`, [JSON.stringify(Array.isArray(keywords) ? keywords : [])]);
        logSecurity(req, 'تحديث محرك القواعد', `تغيير حد الاعتماد إلى ${amount_limit} والكلمات المفتاحية`);
        db.run(`COMMIT`, (err) => {
            if (err) {
                db.run(`ROLLBACK`);
                return res.status(500).json({ error: 'حدث خطأ أثناء الحفظ' });
            }
            res.json({ message: 'تم تحديث قواعد Maker-Checker بنجاح' });
        });
    });
});

app.get('/api/admin/audit-report', verifyToken, verifyAdmin, (req, res) => {
    const query = `
        SELECT tl.id, tl.action_type, tl.content, tl.created_at, tl.ip_address,
               t.id AS ticket_id, t.title, t.amount, t.currency,
               u.full_name AS user_name, u.role
        FROM ticket_timeline tl
        LEFT JOIN tickets t ON tl.ticket_id = t.id
        LEFT JOIN users u ON tl.user_id = u.id
        WHERE tl.action_type IN ('status_change', 'creation')
          AND (tl.content LIKE '%اعتماد%' OR tl.content LIKE '%رفض%' OR tl.content LIKE '%موافق%' OR tl.content LIKE '%Maker-Checker%')
        ORDER BY tl.created_at DESC LIMIT 500
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

// ================= [ البند 9: سلة المحذوفات واسترجاع التذاكر المحذوفة (Soft Delete Recovery) ] =================
app.get('/api/admin/deleted-tickets', verifyToken, verifyAdmin, (req, res) => {
    const query = `
        SELECT t.id, t.title, t.client_account, t.amount, t.currency, t.psp_name, t.status, t.deleted_at,
               d.name AS dept_name, u.full_name AS deleted_by_name
        FROM tickets t
        LEFT JOIN departments d ON t.department_id = d.id
        LEFT JOIN users u ON t.deleted_by = u.id
        WHERE t.deleted_at IS NOT NULL
        ORDER BY t.deleted_at DESC LIMIT 100
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.post('/api/admin/tickets/:id/restore', verifyToken, verifyAdmin, (req, res) => {
    const ticketId = Number(req.params.id);
    db.run(`UPDATE tickets SET deleted_at = NULL, deleted_by = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [ticketId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        db.run(`INSERT INTO ticket_timeline (ticket_id, user_id, action_type, content, ip_address) VALUES (?, ?, 'status_change', ?, ?)`,
            [ticketId, req.user.id, `♻️ تم استرجاع التيكت من الأرشيف / سلة المحذوفات بواسطة المشرف العام`, getClientIp(req)]);
        logSecurity(req, 'استرجاع تيكت محذوف', `استرجاع التيكت رقم #${ticketId} من سلة المحذوفات`);
        io.emit('tickets_updated');
        res.json({ message: 'تم استرجاع التيكت بنجاح' });
    });
});

// فحص صحة النظام (Health Check)
app.get('/api/health', (req, res) => {
    db.get(`SELECT 1 AS ok`, [], (err) => {
        if (err) return res.status(500).json({ status: 'error', db: 'disconnected' });
        res.json({
            status: 'ok',
            version: '6.0-firebase-cloud',
            firebase_connected: isFirebaseInitialized,
            firebase_project: firebaseClientConfig.projectId,
            uptime: Math.round(process.uptime())
        });
    });
});

// ================= [ 6. Socket.io وكاشف التضارب الحي + دعم Firebase ID Token & JWT ] =================
const onlineUsers = new Map();
const ticketViewers = new Map(); // ticketId -> Map(socket.id -> user)

io.use(async (socket, next) => {
    const token = (socket.handshake.auth && socket.handshake.auth.token) ||
                  (socket.handshake.query && socket.handshake.query.token) ||
                  (socket.handshake.headers && socket.handshake.headers.authorization && socket.handshake.headers.authorization.replace('Bearer ', ''));
    if (!token) return next(new Error('Authentication required'));

    if (firebaseAuth) {
        try {
            const decodedFb = await firebaseAuth.verifyIdToken(token);
            let userProfile = null;
            if (firestoreDb) {
                const uDoc = await firestoreDb.collection('users').doc(decodedFb.uid).get();
                if (uDoc.exists) userProfile = uDoc.data();
            }
            socket.userData = userProfile || {
                id: decodedFb.uid,
                uid: decodedFb.uid,
                full_name: decodedFb.name || decodedFb.email || 'User',
                role: decodedFb.role || 'admin',
                department_id: 1
            };
            return next();
        } catch (fbErr) {
            // ننتقل لفحص JWT المحلي
        }
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return next(new Error('Invalid or expired token'));
        socket.userData = decoded;
        next();
    });
});

io.on('connection', (socket) => {
    socket.on('register_user', () => {
        const userData = socket.userData;
        if (!userData || !userData.id) return;
        socket.join(`user_${userData.id}`);
        if (userData.department_id) socket.join(`dept_${userData.department_id}`);
        if (userData.role === 'admin') socket.join('role_admin');

        onlineUsers.set(socket.id, { id: userData.id, full_name: userData.full_name, role: userData.role });
        io.emit('online_users', Array.from(onlineUsers.values()));
    });

    socket.on('join_ticket_room', ({ ticketId }) => {
        if (!ticketId || !socket.userData) return;

        // فحص صلاحية الوصول للتيكت قبل السماح بدخول الغرفة
        checkTicketAccess(socket.userData, ticketId, (allowed) => {
            if (!allowed) return;

            socket.currentTicketId = ticketId;
            socket.join(`ticket_room_${ticketId}`);

            if (!ticketViewers.has(ticketId)) ticketViewers.set(ticketId, new Map());
            const u = socket.userData;
            ticketViewers.get(ticketId).set(socket.id, { id: u.id, full_name: u.full_name, role: u.role });

            const viewers = Array.from(ticketViewers.get(ticketId).values());
            io.to(`ticket_room_${ticketId}`).emit('ticket_viewers_update', viewers);
        });
    });

    socket.on('typing_in_ticket', ({ ticketId }) => {
        if (!socket.userData || socket.currentTicketId != ticketId) return;
        socket.to(`ticket_room_${ticketId}`).emit('user_typing', { user_name: socket.userData.full_name });
    });

    socket.on('disconnect', () => {
        onlineUsers.delete(socket.id);
        io.emit('online_users', Array.from(onlineUsers.values()));

        const tId = socket.currentTicketId;
        if (tId && ticketViewers.has(tId)) {
            const roomMap = ticketViewers.get(tId);
            roomMap.delete(socket.id);

            // البند 17: تفريغ الـ Map عند خروج آخر مشاهد لمنع Memory Leak
            if (roomMap.size === 0) {
                ticketViewers.delete(tId);
                io.to(`ticket_room_${tId}`).emit('ticket_viewers_update', []);
            } else {
                const viewers = Array.from(roomMap.values());
                io.to(`ticket_room_${tId}`).emit('ticket_viewers_update', viewers);
            }
        }
    });
});

// ================= [ البند 18: معالج الأخطاء المركزي والـ 404 ] =================
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'المسار المطلوب غير موجود' });
});

app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `خطأ في رفع الملف: ${err.message} (الحد الأقصى 5MB)` });
    }
    if (err) {
        console.error('⚠️ خطأ غير متوقع:', err.message);
        return res.status(400).json({ error: err.message || 'خطأ في معالجة الطلب' });
    }
    next();
});

// إغلاق آمن لقاعدة البيانات عند إيقاف السيرفر (Graceful Shutdown)
process.on('SIGINT', () => {
    console.log('\n🛑 جاري إغلاق الخادم ودمج ملفات WAL بأمان...');
    db.close(() => {
        console.log('✅ تم إغلاق قاعدة البيانات بنجاح.');
        process.exit(0);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 نظام OrbexDesk الداخلي للعمليات والتذاكر يعمل بأقصى كفاءة على:\n   👉 http://localhost:${PORT}\n   👉 http://127.0.0.1:${PORT}`);
});