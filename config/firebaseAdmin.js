const admin = require('firebase-admin');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { getStorage } = require('firebase-admin/storage');
const path = require('path');
const fs = require('fs');

// تحميل إعدادات Firebase من ملف firebase-applet-config.json إن وجد
let appletConfig = {};
try {
    const configPath = path.join(__dirname, '../firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
        appletConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
} catch (e) {
    console.warn('⚠️ تعذر قراءة ملف firebase-applet-config.json:', e.message);
}

// إعدادات الواجهة الأمامية وFirebase Client Config
const firebaseClientConfig = {
    apiKey: process.env.FIREBASE_API_KEY || appletConfig.apiKey || "AIzaSyDhIpnjDtoWtOnjBu58PvwYkEQAlX3CewY",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || appletConfig.authDomain || "tickets-system-512018.firebaseapp.com",
    projectId: process.env.FIREBASE_PROJECT_ID || appletConfig.projectId || "tickets-system-512018",
    firestoreDatabaseId: process.env.FIRESTORE_DATABASE_ID || appletConfig.firestoreDatabaseId || "ai-studio-ticketssystem-63bbf347-7189-4c35-a17b-8de53b35432a",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || appletConfig.storageBucket || "tickets-system-512018.firebasestorage.app",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || appletConfig.messagingSenderId || "232961669914",
    appId: process.env.FIREBASE_APP_ID || appletConfig.appId || "1:232961669914:web:a5dac83c07b768726bcaa3",
    measurementId: process.env.FIREBASE_MEASUREMENT_ID || appletConfig.measurementId || ""
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
        path.join(__dirname, 'serviceAccountKey.json'),
        path.join(__dirname, '../serviceAccountKey.json')
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

const firestoreDb = isFirebaseInitialized
    ? (firebaseClientConfig.firestoreDatabaseId && firebaseClientConfig.firestoreDatabaseId !== '(default)'
        ? getFirestore(firebaseApp, firebaseClientConfig.firestoreDatabaseId)
        : getFirestore(firebaseApp))
    : null;

if (firestoreDb) {
    try {
        firestoreDb.settings({ ignoreUndefinedProperties: true });
    } catch (e) {}
}

const adminAuth = isFirebaseInitialized ? getAuth(firebaseApp) : null;
const storageBucket = isFirebaseInitialized && firebaseClientConfig.storageBucket ? getStorage(firebaseApp).bucket(firebaseClientConfig.storageBucket) : null;

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
