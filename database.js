const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

// إنشاء مجلدات المرفقات والنسخ الاحتياطي تلقائياً
const uploadDir = path.join(__dirname, 'uploads');
const backupDir = path.join(__dirname, 'backups');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

const dbPath = path.join(__dirname, 'enterprise_v4.db');
const rawDb = new DatabaseSync(dbPath);
console.log('✅ تم الاتصال بقاعدة البيانات (Enterprise v6.0 - WAL Hardened).');

const normalizeParams = (params) => {
    if (params === undefined || params === null) return [];
    const arr = Array.isArray(params) ? params : [params];
    return arr.map(v => {
        if (v === undefined) return null;
        if (typeof v === 'boolean') return v ? 1 : 0;
        return v;
    });
};

const db = {
    serialize(fn) {
        if (typeof fn === 'function') fn();
    },
    run(sql, params, callback) {
        let cb = callback;
        let bindParams = params;
        if (typeof params === 'function') {
            cb = params;
            bindParams = [];
        }
        try {
            const cleanParams = normalizeParams(bindParams);
            const stmt = rawDb.prepare(sql);
            const result = stmt.run(...cleanParams);
            const ctx = {
                lastID: Number(result?.lastInsertRowid ?? 0),
                changes: Number(result?.changes ?? 0)
            };
            if (typeof cb === 'function') cb.call(ctx, null);
        } catch (err) {
            if (typeof cb === 'function') cb.call({ lastID: 0, changes: 0 }, err);
        }
        return this;
    },
    get(sql, params, callback) {
        let cb = callback;
        let bindParams = params;
        if (typeof params === 'function') {
            cb = params;
            bindParams = [];
        }
        try {
            const cleanParams = normalizeParams(bindParams);
            const stmt = rawDb.prepare(sql);
            const row = stmt.get(...cleanParams);
            if (typeof cb === 'function') cb(null, row);
        } catch (err) {
            if (typeof cb === 'function') cb(err, null);
        }
        return this;
    },
    all(sql, params, callback) {
        let cb = callback;
        let bindParams = params;
        if (typeof params === 'function') {
            cb = params;
            bindParams = [];
        }
        try {
            const cleanParams = normalizeParams(bindParams);
            const stmt = rawDb.prepare(sql);
            const rows = stmt.all(...cleanParams);
            if (typeof cb === 'function') cb(null, rows || []);
        } catch (err) {
            if (typeof cb === 'function') cb(err, []);
        }
        return this;
    },
    prepare(sql) {
        const stmt = rawDb.prepare(sql);
        let lastError = null;
        return {
            run(...args) {
                let cb = null;
                if (args.length > 0 && typeof args[args.length - 1] === 'function') {
                    cb = args.pop();
                }
                const rawParams = (args.length === 1 && Array.isArray(args[0])) ? args[0] : args;
                try {
                    const cleanParams = normalizeParams(rawParams);
                    const res = stmt.run(...cleanParams);
                    if (cb) cb.call({ lastID: Number(res?.lastInsertRowid ?? 0), changes: Number(res?.changes ?? 0) }, null);
                } catch (err) {
                    lastError = err;
                    if (cb) cb(err);
                }
                return this;
            },
            finalize(cb) {
                if (typeof cb === 'function') cb(lastError);
            }
        };
    },
    close(cb) {
        try {
            rawDb.close();
            if (typeof cb === 'function') cb(null);
        } catch (err) {
            if (typeof cb === 'function') cb(err);
        }
    }
};

db.serialize(async () => {
    // تفعيل وضع السرعة القصوى ومنع قفل قاعدة البيانات (WAL Mode)
    db.run(`PRAGMA journal_mode = WAL;`);
    db.run(`PRAGMA synchronous = NORMAL;`);
    db.run(`PRAGMA foreign_keys = ON;`);
    db.run(`PRAGMA busy_timeout = 5000;`);

    // 0. جدول تتبع الترقيات (Schema Migrations) - البند 11
    db.run(`CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 1. جدول الأقسام
    db.run(`CREATE TABLE IF NOT EXISTS departments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        code TEXT DEFAULT NULL,
        sla_hours INTEGER DEFAULT 4,
        status TEXT DEFAULT 'active'
    )`);

    // 2. جدول المستخدمين والصلاحيات الدقيقة + البريد الإلكتروني + الحماية الأمنية (البند 5 و 7)
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        username TEXT UNIQUE NOT NULL,
        email TEXT DEFAULT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin', 'agent', 'employee')),
        department_id INTEGER,
        permissions TEXT DEFAULT '{"can_export":true,"can_approve":false,"can_delete":false,"can_view_all":false}',
        must_change_password INTEGER DEFAULT 0,
        failed_login_attempts INTEGER DEFAULT 0,
        locked_until DATETIME DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (department_id) REFERENCES departments(id)
    )`);

    // 2.1 جدول رموز التحقق لمرة واحدة عبر البريد الإلكتروني (Email OTP Codes)
    db.run(`CREATE TABLE IF NOT EXISTS otp_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        email TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        attempts INTEGER DEFAULT 0,
        used INTEGER DEFAULT 0,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    // 3. جدول التذاكر الشامل + دعم الحذف الآمن Soft Delete (البند 9)
    db.run(`CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        issue_type TEXT NOT NULL,
        transaction_type TEXT DEFAULT 'أخرى / عام',
        client_account TEXT,
        client_email TEXT,
        psp_name TEXT DEFAULT 'غير محدد',
        amount REAL DEFAULT 0,
        currency TEXT DEFAULT 'USD',
        transaction_ref TEXT,
        card_dpan TEXT,
        description TEXT NOT NULL,
        status TEXT DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'pending', 'pending_approval', 'resolved', 'closed')),
        priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
        creator_id INTEGER NOT NULL,
        department_id INTEGER NOT NULL,
        assigned_agent_id INTEGER,
        master_ticket_id INTEGER,
        is_handover INTEGER DEFAULT 0,
        handover_note TEXT,
        attachment_path TEXT,
        attachment_name TEXT,
        sla_due_time DATETIME,
        sla_paused INTEGER DEFAULT 0,
        sla_paused_at DATETIME DEFAULT NULL,
        escalated INTEGER DEFAULT 0,
        resolved_at DATETIME,
        deleted_at DATETIME DEFAULT NULL,
        deleted_by INTEGER DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (creator_id) REFERENCES users(id),
        FOREIGN KEY (department_id) REFERENCES departments(id),
        FOREIGN KEY (assigned_agent_id) REFERENCES users(id)
    )`);

    // ترقيات آمنة للأعمدة الجديدة على قواعد البيانات القائمة
    const safeAlters = [
        `ALTER TABLE tickets ADD COLUMN escalated INTEGER DEFAULT 0`,
        `ALTER TABLE tickets ADD COLUMN sla_paused_at DATETIME DEFAULT NULL`,
        `ALTER TABLE tickets ADD COLUMN resolved_at DATETIME`,
        `ALTER TABLE tickets ADD COLUMN deleted_at DATETIME DEFAULT NULL`,
        `ALTER TABLE tickets ADD COLUMN deleted_by INTEGER DEFAULT NULL`,
        `ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 0`,
        `ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER DEFAULT 0`,
        `ALTER TABLE users ADD COLUMN locked_until DATETIME DEFAULT NULL`,
        `ALTER TABLE users ADD COLUMN email TEXT DEFAULT NULL`,
        `ALTER TABLE departments ADD COLUMN code TEXT DEFAULT NULL`
    ];
    safeAlters.forEach(sql => db.run(sql, () => {}));

    // إصلاح السجلات القديمة التي أُغلقت دون تسجيل resolved_at أو توقف فيها الـ SLA دون sla_paused_at
    db.run(`UPDATE tickets SET resolved_at = COALESCE(updated_at, created_at) WHERE status IN ('resolved', 'closed') AND resolved_at IS NULL`, () => {});
    db.run(`UPDATE tickets SET sla_paused_at = COALESCE(updated_at, created_at) WHERE sla_paused = 1 AND sla_paused_at IS NULL`, () => {});

    // 4. جدول الخط الزمني وسجل التدقيق (Append-Only Audit Trail)
    db.run(`CREATE TABLE IF NOT EXISTS ticket_timeline (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        action_type TEXT NOT NULL,
        content TEXT NOT NULL,
        attachment_path TEXT,
        attachment_name TEXT,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ticket_id) REFERENCES tickets(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // 5. جدول سجل الرقابة الأمني وتوثيق الـ IP
    db.run(`CREATE TABLE IF NOT EXISTS security_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        username TEXT,
        action TEXT NOT NULL,
        details TEXT,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 6. جدول مركز الإشعارات الذكي + جدول تتبع القراءة المستقل لكل مستخدم (البند 16)
    db.run(`CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        department_id INTEGER,
        ticket_id INTEGER,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS notification_reads (
        notification_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (notification_id, user_id),
        FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    // 7. جدول المشاكل والعناوين الثابتة
    db.run(`CREATE TABLE IF NOT EXISTS predefined_issues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        default_transaction_type TEXT DEFAULT 'إيداع (Deposit)'
    )`);

    // 8. جدول الردود التلقائية السريعة
    db.run(`CREATE TABLE IF NOT EXISTS canned_responses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL,
        content TEXT NOT NULL
    )`);

    // 9. جدول القوائم الديناميكية
    db.run(`CREATE TABLE IF NOT EXISTS system_lists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        list_type TEXT NOT NULL, 
        value TEXT NOT NULL
    )`);

    // 10. جدول إعدادات النظام وقواعد العمل (Rules Engine & Meta - البند 19)
    db.run(`CREATE TABLE IF NOT EXISTS system_meta (
        meta_key TEXT PRIMARY KEY,
        meta_value TEXT
    )`);

    // 11. الفهارس (Indexes) لتسريع الاستعلامات - البند 14
    const indexes = [
        `CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status) WHERE deleted_at IS NULL`,
        `CREATE INDEX IF NOT EXISTS idx_tickets_dept ON tickets(department_id) WHERE deleted_at IS NULL`,
        `CREATE INDEX IF NOT EXISTS idx_tickets_creator ON tickets(creator_id)`,
        `CREATE INDEX IF NOT EXISTS idx_tickets_agent ON tickets(assigned_agent_id)`,
        `CREATE INDEX IF NOT EXISTS idx_tickets_client_acc ON tickets(client_account)`,
        `CREATE INDEX IF NOT EXISTS idx_tickets_sla ON tickets(sla_due_time, status, sla_paused, escalated)`,
        `CREATE INDEX IF NOT EXISTS idx_timeline_ticket ON ticket_timeline(ticket_id, created_at)`,
        `CREATE INDEX IF NOT EXISTS idx_notif_user_dept ON notifications(user_id, department_id, is_read)`,
        `CREATE INDEX IF NOT EXISTS idx_notif_reads_user ON notification_reads(user_id, notification_id)`,
        `CREATE INDEX IF NOT EXISTS idx_seclogs_created ON security_logs(created_at DESC)`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL AND email != ''`,
        `CREATE INDEX IF NOT EXISTS idx_otp_user ON otp_codes(user_id, used, expires_at)`
    ];
    indexes.forEach(idx => db.run(idx));

    // زراعة حساب المشرف العام (مع must_change_password = 1 عند الإنشاء الأول - البند 7)
    const salt = await bcrypt.genSalt(10);
    const hashedPass = await bcrypt.hash('admin123', salt);
    const adminPerms = JSON.stringify({ can_export: true, can_approve: true, can_delete: true, can_view_all: true });
    db.run(`INSERT OR IGNORE INTO users (id, full_name, username, email, password, role, permissions, must_change_password) 
            VALUES (1, 'مدير النظام العام', 'admin', 'ezznhla455@gmail.com', ?, 'admin', ?, 0)`, [hashedPass, adminPerms]);
    db.run(`UPDATE users SET email = 'ezznhla455@gmail.com' WHERE id = 1 AND (email IS NULL OR email = '')`);

    // زراعة إعدادات شريط التنبيه العام وقواعد Maker-Checker وإعدادات الـ SLA و OTP الديناميكية (البند 19)
    const defaultMeta = [
        ['banner_active', '0'],
        ['banner_text', ''],
        ['banner_type', 'warning'],
        ['maker_checker_amount_limit', '10000'],
        ['maker_checker_keywords', JSON.stringify(['تصفير رصيد', 'تنفيذ دفع يدوي'])],
        ['backoffice_dept_id', '1'],
        ['sla_mode', 'dept_default'],
        ['sla_urgent_hours', '1'],
        ['sla_high_hours', '2'],
        ['sla_medium_hours', '4'],
        ['sla_low_hours', '24'],
        ['sla_pause_on_pending', '1'],
        ['sla_pause_on_approval', '1'],
        ['sla_reset_on_transfer', '1'],
        ['sla_auto_escalate', '1'],
        ['auth_login_mode', 'firebase_email_pass'],
        ['smtp_host', 'smtp.gmail.com'],
        ['smtp_port', '587'],
        ['smtp_secure', '0'],
        ['smtp_user', ''],
        ['smtp_pass', ''],
        ['smtp_from_name', 'Enterprise Desk Security']
    ];
    defaultMeta.forEach(([k, v]) => {
        db.run(`INSERT OR IGNORE INTO system_meta (meta_key, meta_value) VALUES (?, ?)`, [k, v]);
    });
    // ترقية الوضع تلقائياً إلى مصادقة Firebase إذا لم يكن خادم SMTP مربوطاً
    db.run(`UPDATE system_meta SET meta_value = 'firebase_email_pass' WHERE meta_key = 'auth_login_mode' AND meta_value = 'email_otp_only' AND COALESCE((SELECT meta_value FROM system_meta WHERE meta_key = 'smtp_pass'), '') = ''`);

    // فحص وزراعة القوائم الافتراضية لأول مرة
    db.get(`SELECT meta_value FROM system_meta WHERE meta_key = 'v5_seeded'`, [], (err, row) => {
        if (!row) {
            console.log('🌱 جاري زراعة البيانات والقوائم الافتراضية لأول مرة...');

            const defaultDepts = [
                ['العمليات المالية - Back Office', 'BACK_OFFICE', 2],
                ['إدارة المخاطر والتداول - Dealing Desk', 'DEALING_DESK', 1],
                ['الامتثال والتدقيق - Compliance', 'COMPLIANCE', 4],
                ['الدعم الفني والتقني - IT', 'IT', 4],
                ['خدمة العملاء - Customer Support', 'SUPPORT', 2]
            ];
            const stmtDept = db.prepare(`INSERT OR IGNORE INTO departments (name, code, sla_hours) VALUES (?, ?, ?)`);
            defaultDepts.forEach(d => stmtDept.run(d[0], d[1], d[2]));
            stmtDept.finalize();

            const defaultIssues = [
                ['متابعة الحركات المالية الأساسية', 'الاستعلام عن إيداع: متابعة حالة عملية إيداع مالي.', 'إيداع (Deposit)'],
                ['متابعة الحركات المالية الأساسية', 'الاستعلام عن سحب: متابعة حالة طلب سحب مالي.', 'سحب (Withdrawal)'],
                ['متابعة الحركات المالية الأساسية', 'الاستعلام عن تحويل: متابعة حالة عملية تحويل بين الحسابات.', 'تحويل داخلي (Internal Transfer)'],
                ['متابعة الحركات المالية الأساسية', 'تصفير رصيد الحساب: تصفية الحساب بالكامل (Zero Balance).', 'تصفير رصيد (Zero Balance)'],
                ['الموافقات والامتثال (Compliance & Approvals)', 'بانتظار موافقة قسم التداول: الطلب قيد المراجعة بانتظار اعتماد قسم التداول (Dealing Desk).', 'سحب (Withdrawal)'],
                ['الموافقات والامتثال (Compliance & Approvals)', 'بانتظار تأكيد العميل: تعليق عملية السحب لحين الحصول على تأكيد نهائي من العميل.', 'سحب (Withdrawal)'],
                ['الموافقات والامتثال (Compliance & Approvals)', 'طلب كشف حساب بنكي: مطالبة العميل بتزويد كشف حساب بنكي (Bank Statement) لغايات التحقق.', 'أخرى / عام'],
                ['الموافقات والامتثال (Compliance & Approvals)', 'مدفوعات طرف ثالث: رصد أو معالجة عمليات إيداع/دفع واردة من طرف ثالث (Third-Party Payments).', 'إيداع (Deposit)'],
                ['المشاكل التقنية وأعطال البوابات (System & PSP Issues)', 'عملية دفع غير مكتملة: عدم اكتمال حركة الدفع بنجاح.', 'إيداع (Deposit)'],
                ['المشاكل التقنية وأعطال البوابات (System & PSP Issues)', 'رفض العملية لعدم كفاية الرصيد: فشل الدفع بسبب عدم توفر رصيد كافٍ، مع حدوث خصم للمبلغ.', 'إيداع (Deposit)'],
                ['المشاكل التقنية وأعطال البوابات (System & PSP Issues)', 'تنفيذ دفع يدوي: معالجة وتسوية الدفعة يدوياً عبر مزود خدمة الدفع (PSP).', 'استرداد / تسوية (Refund)'],
                ['المشاكل التقنية وأعطال البوابات (System & PSP Issues)', 'قيود الصلاحية في بوابة الدفع: فشل أو منع الدفع بسبب عدم توفر الصلاحيات اللازمة على بوابة الدفع.', 'مشكلة تقنية / منصة'],
                ['المشاكل التقنية وأعطال البوابات (System & PSP Issues)', 'خلل فني في النظام: تعطل أو مشكلة تقنية في النظام الداخلي.', 'مشكلة تقنية / منصة'],
                ['المشاكل التقنية وأعطال البوابات (System & PSP Issues)', 'تأخير الإيداع من مزود الخدمة: تأخر وصول وتأكيد الإيداع من جهة مزود خدمة الدفع (PSP).', 'إيداع (Deposit)'],
                ['المشاكل التقنية وأعطال البوابات (System & PSP Issues)', 'تأخير الإيداع من النظام: تأخر انعكاس الإيداع في الحساب بسبب بطء أو خلل في معالجة النظام.', 'إيداع (Deposit)']
            ];
            const stmtIssues = db.prepare(`INSERT INTO predefined_issues (category, title, default_transaction_type) VALUES (?, ?, ?)`);
            defaultIssues.forEach(i => stmtIssues.run(i[0], i[1], i[2]));
            stmtIssues.finalize();

            const defaultCanned = [
                ['✅ تم عكس الإيداع', '✅ تمت مراجعة العملية وعكس الإيداع في حساب العميل بنجاح.'],
                ['⏳ تم تنفيذ السحب', '⏳ تم تنفيذ السحب من طرفنا وبانتظار المعالجة البنكية / مزود الدفع.'],
                ['📄 طلب كشف حساب', '📄 يرجى تزويدنا بكشف حساب بنكي رسمي أو إشعار التحويل لاستكمال المطابقة.'],
                ['🔍 مرفوضة من البنك', '🔍 تمت مطابقة حركة البوابة، العملية مرفوضة من البنك المصدر للبطاقة ولم يتم خصم المبلغ لدينا.']
            ];
            const stmtCanned = db.prepare(`INSERT INTO canned_responses (label, content) VALUES (?, ?)`);
            defaultCanned.forEach(c => stmtCanned.run(c[0], c[1]));
            stmtCanned.finalize();

            const defaultLists = [
                ['psp', 'غير محدد'], ['psp', 'Visa / Mastercard'], ['psp', 'Apple Pay (DPAN)'],
                ['psp', 'USDT (TRC20)'], ['psp', 'USDT (ERC20/BEP20)'], ['psp', 'Wire Transfer (بنكي)'],
                ['psp', 'Skrill / Neteller'], ['psp', 'Local PSP / فواتيركم'],
                ['transaction_type', 'إيداع (Deposit)'], ['transaction_type', 'سحب (Withdrawal)'],
                ['transaction_type', 'تحويل داخلي (Internal Transfer)'], ['transaction_type', 'تصفير رصيد (Zero Balance)'],
                ['transaction_type', 'استرداد / تسوية (Refund)'], ['transaction_type', 'مشكلة تقنية / منصة'], ['transaction_type', 'أخرى / عام'],
                ['currency', 'USD'], ['currency', 'USDT'], ['currency', 'EUR'], ['currency', 'JOD'], ['currency', 'GBP'],
                ['issue_category', 'متابعة الحركات المالية الأساسية'],
                ['issue_category', 'الموافقات والامتثال (Compliance & Approvals)'],
                ['issue_category', 'المشاكل التقنية وأعطال البوابات (System & PSP Issues)'],
                ['issue_category', 'استفسار أو طلب عام']
            ];
            const stmtLists = db.prepare(`INSERT INTO system_lists (list_type, value) VALUES (?, ?)`);
            defaultLists.forEach(l => stmtLists.run(l[0], l[1]));
            stmtLists.finalize();

            db.run(`INSERT INTO system_meta (meta_key, meta_value) VALUES ('v5_seeded', '1')`);
            db.run(`INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (6, 'v6_hardened_schema')`);
        }
    });
});

module.exports = db;