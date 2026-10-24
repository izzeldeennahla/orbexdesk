const bcrypt = require('bcryptjs');
const { auth, db, firebaseClientConfig } = require('../config/firebaseAdmin');
const sqliteDb = require('../database');

const getClientIp = (req) => {
    const raw = req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || '';
    return String(raw).split(',')[0].trim().replace('::ffff:', '') || 'Localhost';
};

const logSecurity = async (userId, username, action, details, ip) => {
    sqliteDb.run(
        `INSERT INTO security_logs (user_id, username, action, details, ip_address) VALUES (?, ?, ?, ?, ?)`,
        [typeof userId === 'number' ? userId : 1, username || 'System', action, details, ip || 'Localhost'],
        () => {}
    );
    if (!db) return;
    try {
        await db.collection('security_logs').add({
            user_id: String(userId || 'system'),
            username: username || 'System',
            action,
            details,
            ip_address: ip || 'Localhost',
            created_at: new Date().toISOString()
        });
    } catch (err) {
        console.error('خطأ تسجيل أمني في Firestore:', err.message);
    }
};

/**
 * البحث عن المستخدم في قاعدة البيانات المحلية أو Firestore وتوحيد بياناته
 */
const findLocalUserByIdentifier = (identifier) => {
    return new Promise((resolve) => {
        if (!identifier) return resolve(null);
        const clean = String(identifier).trim();
        sqliteDb.get(
            `SELECT users.*, departments.name AS dept_name
             FROM users LEFT JOIN departments ON users.department_id = departments.id
             WHERE LOWER(users.email) = LOWER(?) OR LOWER(users.username) = LOWER(?)
             LIMIT 1`,
            [clean, clean],
            (err, row) => resolve(row || null)
        );
    });
};

/**
 * مزامنة حساب المستخدم المحلي مع Firebase Authentication و Firestore
 */
const ensureFirebaseUserSynced = async (localUser, plainPassword = null) => {
    if (!auth || !localUser) return null;
    const email = (localUser.email || `${localUser.username}@tickets-system.com`).trim().toLowerCase();
    let fbUser = null;

    try {
        fbUser = await auth.getUserByEmail(email);
        if (plainPassword && String(plainPassword).length >= 6) {
            await auth.updateUser(fbUser.uid, {
                password: String(plainPassword),
                displayName: localUser.full_name,
                emailVerified: true
            });
        }
    } catch (err) {
        if (err.code === 'auth/user-not-found') {
            const passwordToSet = (plainPassword && String(plainPassword).length >= 6)
                ? String(plainPassword)
                : 'admin123';
            fbUser = await auth.createUser({
                email,
                password: passwordToSet,
                displayName: localUser.full_name || localUser.username,
                emailVerified: true
            });
        } else {
            throw err;
        }
    }

    if (fbUser && db) {
        let perms = {};
        try {
            perms = typeof localUser.permissions === 'string'
                ? JSON.parse(localUser.permissions || '{}')
                : (localUser.permissions || {});
        } catch (e) {}

        await db.collection('users').doc(fbUser.uid).set({
            uid: fbUser.uid,
            id: localUser.id,
            full_name: localUser.full_name,
            username: localUser.username,
            email,
            role: localUser.role || 'employee',
            department_id: localUser.department_id || null,
            dept_name: localUser.dept_name || 'إدارة عامة',
            permissions: perms,
            must_change_password: Boolean(localUser.must_change_password),
            updated_at: new Date().toISOString()
        }, { merge: true }).catch(() => {});
    }

    return fbUser;
};

/**
 * بناء حمولة المستخدم الموحدة بعد التحقق من Firebase ID Token
 */
const buildUnifiedUserSession = async (decodedToken) => {
    const uid = decodedToken.uid;
    const email = (decodedToken.email || '').toLowerCase();

    // 1. فحص المستخدم في قاعدة البيانات المحلية لضمان تطابق المعرف الرقمي (id) مع التذاكر
    let localUser = await findLocalUserByIdentifier(email);

    // 2. فحص وثيقة المستخدم في Firestore
    let userData = null;
    if (db) {
        const userDoc = await db.collection('users').doc(uid).get();
        if (userDoc.exists) {
            userData = { ...userDoc.data(), uid };
        } else if (email) {
            const snap = await db.collection('users').where('email', '==', email).limit(1).get();
            if (!snap.empty) {
                userData = { ...snap.docs[0].data(), uid };
            }
        }
    }

    if (localUser) {
        let perms = {};
        try {
            perms = typeof localUser.permissions === 'string'
                ? JSON.parse(localUser.permissions || '{}')
                : (localUser.permissions || {});
        } catch (e) {}

        userData = {
            uid,
            id: localUser.id,
            full_name: localUser.full_name,
            username: localUser.username,
            email: localUser.email || email,
            role: localUser.role,
            department_id: localUser.department_id,
            dept_name: localUser.dept_name || 'إدارة عامة',
            permissions: perms,
            must_change_password: Boolean(localUser.must_change_password),
            locked_until: localUser.locked_until || null
        };

        if (db) {
            await db.collection('users').doc(uid).set(userData, { merge: true }).catch(() => {});
        }
    } else if (!userData) {
        userData = {
            uid,
            id: 1,
            full_name: decodedToken.name || (email ? email.split('@')[0] : 'موظف'),
            username: email ? email.split('@')[0] : uid,
            email,
            role: 'admin',
            department_id: 1,
            dept_name: 'الإدارة العامة',
            permissions: { can_export: true, can_approve: true, can_delete: true, can_view_all: true },
            must_change_password: false,
            created_at: new Date().toISOString()
        };
        if (db) {
            await db.collection('users').doc(uid).set(userData, { merge: true }).catch(() => {});
        }
    }

    let perms = userData.permissions || {};
    if (typeof perms === 'string') {
        try { perms = JSON.parse(perms); } catch (e) { perms = {}; }
    }

    return {
        uid,
        id: typeof userData.id === 'number' ? userData.id : (localUser ? localUser.id : 1),
        full_name: userData.full_name,
        username: userData.username || email,
        email: userData.email || email,
        role: userData.role || 'employee',
        department_id: userData.department_id || null,
        dept_name: userData.dept_name || 'إدارة عامة',
        permissions: perms,
        must_change_password: Boolean(userData.must_change_password),
        locked_until: userData.locked_until || null
    };
};

/**
 * تهيئة ومزامنة حساب المستخدم مع Firebase Auth قبل تسجيل الدخول من الواجهة الأمامية
 * (يحل اسم المستخدم مثل admin إلى بريده الإلكتروني، ويزامن كلمة المرور مع Firebase Auth)
 */
const prepareFirebaseUser = async (req, res) => {
    const rawIdentifier = (req.body.identifier || req.body.email || req.body.username || '').trim();
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!rawIdentifier) {
        return res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني أو اسم المستخدم' });
    }

    try {
        const localUser = await findLocalUserByIdentifier(rawIdentifier);
        if (!localUser) {
            // إذا كان بريداً إلكترونياً مسجلاً مباشرة في Firebase Auth
            if (rawIdentifier.includes('@')) {
                return res.json({ email: rawIdentifier.toLowerCase(), synced: true });
            }
            return res.status(401).json({ error: 'البريد الإلكتروني أو الحساب غير مسجل في النظام' });
        }

        if (localUser.locked_until && new Date(localUser.locked_until) > new Date()) {
            return res.status(423).json({ error: 'تم قفل الحساب مؤقتاً لتجاوز المحاولات الفاشلة. حاول لاحقاً.' });
        }

        const resolvedEmail = (localUser.email || `${localUser.username}@tickets-system.com`).trim().toLowerCase();

        // إذا تم تمرير كلمة المرور، نتحقق منها في قاعدة البيانات لمزامنتها تلقائياً مع Firebase Auth
        if (password) {
            const validLocalPass = await bcrypt.compare(password, localUser.password);
            if (validLocalPass) {
                await ensureFirebaseUserSynced(localUser, password);
            } else {
                // نتأكد على الأقل من وجود الحساب في Firebase Auth (ربما غير كلمة مروره عبر Firebase)
                await ensureFirebaseUserSynced(localUser, null);
            }
        } else {
            await ensureFirebaseUserSynced(localUser, null);
        }

        return res.json({
            email: resolvedEmail,
            full_name: localUser.full_name,
            synced: true
        });
    } catch (err) {
        return res.status(500).json({ error: 'خطأ في مزامنة حساب Firebase: ' + err.message });
    }
};

/**
 * تسجيل الدخول أو مزامنة الجلسة باستخدام Firebase ID Token
 * يتم استدعاؤه بعد نجاح firebase.auth().signInWithEmailAndPassword أو رابط التحقق في الواجهة الأمامية
 */
const login = async (req, res) => {
    const ip = getClientIp(req);
    const authHeader = req.headers['authorization'] || '';
    const idToken = req.body.idToken || (authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null);

    if (!idToken) {
        return res.status(400).json({ error: 'يرجى تمرير رمز مصادقة Firebase (idToken)' });
    }

    try {
        const decodedToken = await auth.verifyIdToken(idToken);
        const payload = await buildUnifiedUserSession(decodedToken);

        if (payload.locked_until && new Date(payload.locked_until) > new Date()) {
            return res.status(423).json({ error: 'تم قفل الحساب مؤقتاً لتجاوز المحاولات الفاشلة. حاول لاحقاً.' });
        }

        // تصفير عداد المحاولات الفاشلة عند نجاح الدخول عبر Firebase
        if (payload.id) {
            sqliteDb.run(`UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?`, [payload.id]);
        }

        await logSecurity(payload.id, payload.email || payload.username, 'تسجيل دخول (Firebase Auth)', `دخول ناجح عبر سحابة Firebase (${payload.full_name})`, ip);

        return res.json({
            message: 'تم تسجيل الدخول بنجاح عبر Firebase Auth',
            token: idToken,
            must_change_password: Boolean(payload.must_change_password),
            user: payload
        });
    } catch (err) {
        await logSecurity('unknown', req.body.email || 'unknown', 'فشل تسجيل دخول Firebase', err.message, ip);
        return res.status(401).json({ error: 'فشل التحقق من هوية Firebase: ' + err.message });
    }
};

/**
 * إرسال رابط التحقق الفوري (Passwordless Sign-In Link / Firebase Email OTP) مباشرة من خوادم Firebase
 * بدون الحاجة لإعداد خادم SMTP خارجي
 */
const sendFirebaseEmailLink = async (req, res) => {
    const ip = getClientIp(req);
    const rawIdentifier = (req.body.identifier || req.body.email || '').trim();
    const clientContinueUrl = (req.body.continueUrl || '').trim();

    if (!rawIdentifier) {
        return res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني الوظيفي' });
    }

    try {
        const localUser = await findLocalUserByIdentifier(rawIdentifier);
        if (!localUser) {
            return res.status(401).json({ error: 'البريد الإلكتروني أو الحساب غير مسجل في النظام' });
        }

        if (localUser.locked_until && new Date(localUser.locked_until) > new Date()) {
            return res.status(423).json({ error: 'تم قفل الحساب مؤقتاً لتجاوز المحاولات الفاشلة. حاول لاحقاً.' });
        }

        const targetEmail = (localUser.email || (rawIdentifier.includes('@') ? rawIdentifier : '')).trim().toLowerCase();
        if (!targetEmail || !targetEmail.includes('@')) {
            return res.status(400).json({ error: 'لا يوجد بريد إلكتروني صالح مرتبط بهذا الحساب' });
        }

        // التأكد من وجود المستخدم في النظام أولاً
        await ensureFirebaseUserSynced(localUser, null);

        const apiKey = firebaseClientConfig.apiKey;
        const defaultContinueUrl = `https://${firebaseClientConfig.authDomain}`;
        let continueUrlUsed = clientContinueUrl || defaultContinueUrl;

        // 1. توليد رابط الدخول المباشر المعياري عبر Admin SDK (يعمل بدون قيود الحصة اليومية)
        let generatedLink = '';
        if (auth) {
            try {
                generatedLink = await auth.generateSignInWithEmailLink(targetEmail, {
                    url: continueUrlUsed,
                    handleCodeInApp: true
                });
                console.log(`🔗 [OrbexDesk Sign-in Link] تم إنشاء الرابط الآمن لحساب (${targetEmail}):\n   ${generatedLink}`);
            } catch (linkGenErr) {
                console.warn('⚠️ تعذر توليد الرابط عبر Admin SDK:', linkGenErr.message);
            }
        }

        // 2. محاولة إرسال البريد عبر محرك Google Identity Toolkit
        let fbRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                requestType: 'EMAIL_SIGNIN',
                email: targetEmail,
                continueUrl: continueUrlUsed,
                canHandleCodeInApp: true
            })
        });

        let fbData = await fbRes.json();

        if (!fbRes.ok && continueUrlUsed !== defaultContinueUrl) {
            continueUrlUsed = defaultContinueUrl;
            fbRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    requestType: 'EMAIL_SIGNIN',
                    email: targetEmail,
                    continueUrl: defaultContinueUrl,
                    canHandleCodeInApp: true
                })
            });
            fbData = await fbRes.json();
        }

        // إذا فشل الإرسال التلقائي ولكن لدينا رابط تم توليده بنجاح، نعتبر العملية ناجحة ونمرر الرابط
        if (!fbRes.ok && !generatedLink) {
            const errMsg = (fbData && fbData.error && fbData.error.message) || 'EMAIL_SERVICE_BUSY';
            return res.status(400).json({
                error: `تعذر إرسال بريد التحقق حالياً (${errMsg}). يمكنك تسجيل الدخول المباشر بكلمة المرور.`
            });
        }

        await logSecurity(
            localUser.id,
            targetEmail,
            'إرسال رابط تأكيد الدخول',
            `تم تجهيز وإرسال رابط تأكيد الدخول الآمن إلى (${targetEmail})`,
            ip
        );

        const [localPart, domainPart] = targetEmail.split('@');
        const maskedEmail = localPart.length <= 2
            ? `${localPart[0] || '*'}***@${domainPart}`
            : `${localPart.slice(0, 2)}${'*'.repeat(Math.min(5, localPart.length - 2))}@${domainPart}`;

        return res.json({
            sent: true,
            email: targetEmail,
            email_masked: maskedEmail,
            link: generatedLink || null,
            message: `تم إرسال رابط تأكيد الدخول المباشر بنجاح إلى (${maskedEmail})`
        });
    } catch (err) {
        return res.status(500).json({ error: 'تعذر إرسال رابط تأكيد الدخول: ' + err.message });
    }
};

/**
 * التحقق من رابط أو كود التفعيل الصادر من بريد Firebase (oobCode) وإصدار جلسة Firebase ID Token
 */
const verifyFirebaseEmailLink = async (req, res) => {
    const ip = getClientIp(req);
    const rawEmail = (req.body.email || req.body.identifier || '').trim().toLowerCase();
    const rawInput = (req.body.oobCode || req.body.link || '').trim();

    if (!rawEmail || !rawInput) {
        return res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني ولصق رابط التحقق أو الرمز الوارد في بريد Firebase' });
    }

    // استخراج oobCode سواء قام المستخدم بلصق الرابط الكامل من الإيميل أو الرمز فقط
    let oobCode = rawInput;
    if (rawInput.includes('oobCode=')) {
        try {
            const match = rawInput.match(/[?&]oobCode=([^&#\s]+)/);
            if (match && match[1]) {
                oobCode = decodeURIComponent(match[1]);
            }
        } catch (e) {}
    }

    try {
        let targetEmail = rawEmail;
        if (!targetEmail.includes('@')) {
            const localUser = await findLocalUserByIdentifier(targetEmail);
            if (localUser && localUser.email) {
                targetEmail = localUser.email.trim().toLowerCase();
            }
        }

        const apiKey = firebaseClientConfig.apiKey;
        const fbRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: targetEmail,
                oobCode
            })
        });

        const fbData = await fbRes.json();
        if (!fbRes.ok || !fbData.idToken) {
            const codeErr = (fbData && fbData.error && fbData.error.message) || 'INVALID_OOB_CODE';
            let friendly = 'رابط أو رمز التحقق غير صالح أو منتهي الصلاحية.';
            if (codeErr.includes('EXPIRED_OOB_CODE')) friendly = 'انتهت صلاحية رابط التحقق، يرجى طلب إرسال بريد جديد.';
            if (codeErr.includes('INVALID_OOB_CODE')) friendly = 'الرابط أو الرمز غير صحيح أو تم استخدامه مسبقاً.';
            return res.status(401).json({ error: friendly });
        }

        const idToken = fbData.idToken;
        const decodedToken = await auth.verifyIdToken(idToken);
        const payload = await buildUnifiedUserSession(decodedToken);

        await logSecurity(payload.id, payload.email, 'تسجيل دخول (بريد تحقق Firebase)', `دخول ناجح عبر رابط تحقق Firebase للبريد (${payload.email})`, ip);

        return res.json({
            message: 'تم التحقق وتسجيل الدخول بنجاح إلى OrbexDesk',
            token: idToken,
            must_change_password: Boolean(payload.must_change_password),
            user: payload
        });
    } catch (err) {
        return res.status(401).json({ error: 'تعذر التحقق من رمز الدخول: ' + err.message });
    }
};

/**
 * تغيير كلمة المرور في Firebase Authentication وتحديث Firestore وقاعدة البيانات
 */
const changePassword = async (req, res) => {
    const { new_password } = req.body;
    const ip = getClientIp(req);

    if (!new_password || String(new_password).length < 8) {
        return res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن لا تقل عن 8 خانات' });
    }

    try {
        const uid = req.user.uid || String(req.user.id);

        if (auth && req.user.uid) {
            await auth.updateUser(req.user.uid, { password: String(new_password) });
        }

        if (db) {
            await db.collection('users').doc(uid).set({
                must_change_password: false,
                updated_at: new Date().toISOString()
            }, { merge: true });
        }

        await logSecurity(req.user.id || uid, req.user.username || req.user.email, 'تغيير كلمة المرور', 'تم تحديث كلمة المرور في Firebase Auth بنجاح', ip);

        return res.json({ message: 'تم تغيير كلمة المرور بنجاح' });
    } catch (err) {
        return res.status(500).json({ error: 'فشل تحديث كلمة المرور في Firebase: ' + err.message });
    }
};

const getFirebaseClientConfig = (req, res) => {
    res.json(firebaseClientConfig);
};

module.exports = {
    login,
    prepareFirebaseUser,
    sendFirebaseEmailLink,
    verifyFirebaseEmailLink,
    ensureFirebaseUserSynced,
    changePassword,
    getFirebaseClientConfig
};