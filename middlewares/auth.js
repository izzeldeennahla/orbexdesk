const jwt = require('jsonwebtoken');
const { auth, db } = require('../config/firebaseAdmin');
const sqliteDb = require('../database');

/**
 * التحقق من التوكن (يدعم كلاً من Firebase ID Token و JWT لضمان التوافق الكامل)
 */
const verifyToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : (req.query.token || null);

    if (!token) {
        return res.status(403).json({ error: 'غير مصرح لك بالوصول (Token مفقود)' });
    }

    // 1. محاولة التحقق عبر Firebase Authentication (verifyIdToken)
    if (auth) {
        try {
            const decodedFirebase = await auth.verifyIdToken(token);
            const uid = decodedFirebase.uid;
            const email = (decodedFirebase.email || '').toLowerCase();

            // البحث أولاً في قاعدة البيانات المحلية لضمان تطابق المعرف الرقمي (id) مع التذاكر والأقسام
            let localRow = null;
            if (email) {
                localRow = await new Promise((resolve) => {
                    sqliteDb.get(
                        `SELECT users.*, departments.name AS dept_name FROM users LEFT JOIN departments ON users.department_id = departments.id WHERE LOWER(users.email) = LOWER(?) OR LOWER(users.username) = LOWER(?) LIMIT 1`,
                        [email, email],
                        (err, row) => resolve(row || null)
                    );
                });
            }

            let userProfile = null;

            if (localRow) {
                let parsedPerms = {};
                try {
                    parsedPerms = typeof localRow.permissions === 'string'
                        ? JSON.parse(localRow.permissions || '{}')
                        : (localRow.permissions || {});
                } catch (e) {}

                userProfile = {
                    uid,
                    id: localRow.id,
                    full_name: localRow.full_name,
                    username: localRow.username || email,
                    email: localRow.email || email,
                    role: localRow.role || 'employee',
                    department_id: localRow.department_id || null,
                    dept_name: localRow.dept_name || 'إدارة عامة',
                    permissions: parsedPerms,
                    must_change_password: Boolean(localRow.must_change_password)
                };
            } else if (db) {
                const userDoc = await db.collection('users').doc(uid).get();
                if (userDoc.exists) {
                    userProfile = { uid, id: userDoc.data().id || 1, ...userDoc.data() };
                } else if (email) {
                    const emailSnap = await db.collection('users').where('email', '==', email).limit(1).get();
                    if (!emailSnap.empty) {
                        const docSnap = emailSnap.docs[0];
                        userProfile = { uid, id: docSnap.data().id || 1, ...docSnap.data() };
                    }
                }
            }

            // إذا كان مستخدماً جديداً في Firebase Auth غير موجود مسبقاً
            if (!userProfile) {
                userProfile = {
                    uid,
                    id: 1,
                    full_name: decodedFirebase.name || (email ? email.split('@')[0] : 'موظف'),
                    username: email || uid,
                    email: email,
                    role: 'admin',
                    department_id: 1,
                    dept_name: 'الإدارة العامة',
                    permissions: { can_export: true, can_approve: true, can_delete: true, can_view_all: true },
                    must_change_password: false
                };
                if (db) {
                    await db.collection('users').doc(uid).set(userProfile, { merge: true }).catch(() => {});
                }
            }

            let perms = userProfile.permissions || {};
            if (typeof perms === 'string') {
                try { perms = JSON.parse(perms); } catch (e) { perms = {}; }
            }

            req.user = {
                uid,
                id: typeof userProfile.id === 'number' ? userProfile.id : 1,
                full_name: userProfile.full_name || decodedFirebase.name || email,
                username: userProfile.username || email,
                email: userProfile.email || email,
                role: userProfile.role || 'employee',
                department_id: userProfile.department_id || null,
                dept_name: userProfile.dept_name || 'إدارة عامة',
                permissions: perms,
                must_change_password: Boolean(userProfile.must_change_password),
                auth_provider: 'firebase'
            };
            return next();
        } catch (firebaseErr) {
            // إذا لم يكن التوكن خاصاً بـ Firebase، ننتقل لفحص JWT المحلي
        }
    }

    // 2. التوافق العكسي مع JWT المحلي (لجلسات الـ OTP الحالية)
    const secret = process.env.JWT_SECRET || 'EnterpriseDesk_v6_Hardened_Fallback_JWT_Secret_2026_SecureKey!';
    jwt.verify(token, secret, (err, decoded) => {
        if (err) {
            return res.status(401).json({ error: 'انتهت الجلسة أو التوكن غير صالح، يرجى تسجيل الدخول مجدداً' });
        }
        req.user = decoded;
        next();
    });
};

const verifyAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        return res.status(403).json({ error: 'صلاحية المشرف العام (Admin) مطلوبة' });
    }
};

module.exports = { verifyToken, verifyAdmin };