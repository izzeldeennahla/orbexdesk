const admin = require('firebase-admin');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { getStorage } = require('firebase-admin/storage');
const path = require('path');
const fs = require('fs');

// إعدادات الواجهة الأمامية (Frontend Firebase Config) للمشروع tickets-system-b558b
const firebaseClientConfig = {
    apiKey: process.env.FIREBASE_API_KEY || "AIzaSyA_qiU44rbl_lPSCu83FPUnpXDELGSRMU8",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "tickets-system-b558b.firebaseapp.com",
    projectId: process.env.FIREBASE_PROJECT_ID || "tickets-system-b558b",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "tickets-system-b558b.firebasestorage.app",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "321737048489",
    appId: process.env.FIREBASE_APP_ID || "1:321737048489:web:ab90f057259f29005004b8",
    measurementId: process.env.FIREBASE_MEASUREMENT_ID || "G-4ZZ9LX18SK"
};

let serviceAccount = null;

// 1. محاولة القراءة من متغير البيئة FIREBASE_SERVICE_ACCOUNT (إن وجد في بيئة الإنتاج)
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (err) {
        console.error('⚠️ تعذر تحليل متغير البيئة FIREBASE_SERVICE_ACCOUNT:', err.message);
    }
}

// 2. البحث عن ملف حساب الخدمة المرفق (Service Account JSON)
if (!serviceAccount) {
    const candidatePaths = [
        path.join(__dirname, 'tickets-system-b558b-firebase-adminsdk-fbsvc-75f3e7511f.json'),
        path.join(__dirname, 'serviceAccountKey.json'),
        path.join(__dirname, '../tickets-system-b558b-firebase-adminsdk-fbsvc-75f3e7511f.json')
    ];

    for (const filePath of candidatePaths) {
        if (fs.existsSync(filePath)) {
            try {
                serviceAccount = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                break;
            } catch (err) {
                console.error(`⚠️ خطأ في قراءة ملف الخدمة (${filePath}):`, err.message);
            }
        }
    }
}

let isFirebaseInitialized = false;
let firebaseApp = null;

try {
    const existingApps = getApps();
    if (!existingApps.length) {
        if (serviceAccount && serviceAccount.private_key) {
            firebaseApp = initializeApp({
                credential: cert(serviceAccount),
                projectId: serviceAccount.project_id || firebaseClientConfig.projectId,
                storageBucket: firebaseClientConfig.storageBucket
            });
            isFirebaseInitialized = true;
            console.log(`🔥 تم تهيئة Firebase Admin SDK بنجاح للمشروع: ${serviceAccount.project_id}`);
        } else {
            firebaseApp = initializeApp({
                projectId: firebaseClientConfig.projectId,
                storageBucket: firebaseClientConfig.storageBucket
            });
            isFirebaseInitialized = true;
            console.log(`🔥 تم تهيئة Firebase Admin SDK بالوضع الافتراضي للمشروع: ${firebaseClientConfig.projectId}`);
        }
    } else {
        firebaseApp = existingApps[0];
        isFirebaseInitialized = true;
    }
} catch (initErr) {
    console.error('❌ خطأ في تهيئة Firebase Admin:', initErr.message);
}

const firestoreDb = isFirebaseInitialized ? getFirestore(firebaseApp) : null;
if (firestoreDb) {
    try {
        firestoreDb.settings({ ignoreUndefinedProperties: true });
    } catch (e) {}
}

const adminAuth = isFirebaseInitialized ? getAuth(firebaseApp) : null;
const storageBucket = isFirebaseInitialized ? getStorage(firebaseApp).bucket(firebaseClientConfig.storageBucket) : null;

module.exports = {
    admin,
    app: firebaseApp,
    db: firestoreDb,
    firestore: firestoreDb,
    auth: adminAuth,
    bucket: storageBucket,
    firebaseClientConfig,
    isFirebaseInitialized
};
