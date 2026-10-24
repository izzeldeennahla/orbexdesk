const { auth, db } = require('../config/firebaseAdmin');

// ================= [ إدارة الأقسام في Firestore ] =================
const getDepartments = async (req, res) => {
    try {
        const snap = await db.collection('departments').orderBy('id', 'asc').get();
        const rows = [];
        snap.forEach(doc => rows.push({ id: doc.id, ...doc.data() }));
        return res.json(rows);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

const createDepartment = async (req, res) => {
    try {
        const { name, sla_hours } = req.body;
        if (!name) return res.status(400).json({ error: 'اسم القسم مطلوب' });

        const snap = await db.collection('departments').get();
        const nextId = snap.size + 1;
        const deptData = {
            id: nextId,
            name: String(name).trim(),
            sla_hours: Number(sla_hours) || 4,
            status: 'active',
            created_at: new Date().toISOString()
        };

        await db.collection('departments').doc(String(nextId)).set(deptData);
        return res.status(201).json({ message: 'تم إضافة القسم بنجاح في Firestore', id: nextId });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

const deleteDepartment = async (req, res) => {
    try {
        await db.collection('departments').doc(String(req.params.id)).set({ status: 'inactive' }, { merge: true });
        return res.json({ message: 'تم تعطيل/حذف القسم' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

// ================= [ إدارة الموظفين في Firebase Auth + Firestore ] =================
const getUsers = async (req, res) => {
    try {
        const snap = await db.collection('users').get();
        const rows = [];
        snap.forEach(doc => {
            const d = doc.data();
            rows.push({
                id: d.id || doc.id,
                uid: doc.id,
                full_name: d.full_name,
                username: d.username,
                email: d.email || d.username,
                role: d.role,
                department_id: d.department_id,
                dept_name: d.dept_name || 'إدارة عامة',
                permissions: typeof d.permissions === 'object' ? JSON.stringify(d.permissions) : d.permissions,
                created_at: d.created_at
            });
        });
        return res.json(rows);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

const createUser = async (req, res) => {
    const { full_name, username, email, password, role, department_id, permissions } = req.body;
    const cleanEmail = (email || (username && username.includes('@') ? username : `${username}@tickets-system.com`)).trim().toLowerCase();
    const cleanPassword = (password && String(password).length >= 6) ? String(password) : 'Password123!';

    try {
        // 1. إنشاء الحساب في Firebase Authentication
        const userRecord = await auth.createUser({
            email: cleanEmail,
            password: cleanPassword,
            displayName: full_name
        });

        // تعيين Custom Claims للدور والصلاحيات
        await auth.setCustomUserClaims(userRecord.uid, { role: role || 'employee' });

        const deptId = (role === 'agent') ? Number(department_id) : null;
        let deptName = 'إدارة عامة';
        if (deptId) {
            const dDoc = await db.collection('departments').doc(String(deptId)).get();
            if (dDoc.exists) deptName = dDoc.data().name;
        }

        const permsObj = permissions || { can_export: true, can_approve: false, can_delete: false, can_view_all: false };

        // 2. حفظ وثيقة الموظف في Firestore داخل مجموعة users
        const userDocData = {
            uid: userRecord.uid,
            id: Date.now(),
            full_name,
            username: username || cleanEmail,
            email: cleanEmail,
            role: role || 'employee',
            department_id: deptId,
            dept_name: deptName,
            permissions: permsObj,
            must_change_password: true,
            created_at: new Date().toISOString()
        };

        await db.collection('users').doc(userRecord.uid).set(userDocData);

        return res.status(201).json({
            message: 'تم إنشاء الحساب بنجاح في Firebase Auth و Firestore',
            uid: userRecord.uid
        });
    } catch (err) {
        return res.status(400).json({ error: 'فشل إنشاء المستخدم في Firebase: ' + err.message });
    }
};

const deleteUser = async (req, res) => {
    const targetId = String(req.params.id);
    if (targetId === '1') {
        return res.status(400).json({ error: 'لا يمكن حذف المشرف الأساسي' });
    }

    try {
        const docRef = db.collection('users').doc(targetId);
        const docSnap = await docRef.get();

        if (docSnap.exists) {
            const uid = docSnap.data().uid || targetId;
            await auth.deleteUser(uid).catch(() => {});
            await docRef.delete();
        } else {
            const q = await db.collection('users').where('id', '==', Number(targetId)).limit(1).get();
            if (!q.empty) {
                const found = q.docs[0];
                await auth.deleteUser(found.id).catch(() => {});
                await found.ref.delete();
            }
        }

        return res.json({ message: 'تم حذف الموظف من Firebase بنجاح' });
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
};

// ================= [ قواعد Maker-Checker والتقارير وسلة المحذوفات ] =================
const getRules = async (req, res) => {
    try {
        const doc = await db.collection('system_meta').doc('maker_checker_rules').get();
        if (!doc.exists) {
            return res.json({ amount_limit: 10000, keywords: ['تصفير رصيد', 'تنفيذ دفع يدوي'] });
        }
        return res.json(doc.data());
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

const updateRules = async (req, res) => {
    try {
        const { amount_limit, keywords } = req.body;
        await db.collection('system_meta').doc('maker_checker_rules').set({
            amount_limit: Number(amount_limit) || 10000,
            keywords: Array.isArray(keywords) ? keywords : [],
            updated_at: new Date().toISOString()
        }, { merge: true });

        await db.collection('security_logs').add({
            user_id: String(req.user.uid || req.user.id),
            username: req.user.username || req.user.email,
            action: 'تحديث محرك القواعد',
            details: `تغيير حد الاعتماد إلى ${amount_limit} والكلمات المفتاحية`,
            ip_address: req.ip || 'Localhost',
            created_at: new Date().toISOString()
        });

        return res.json({ message: 'تم تحديث قواعد Maker-Checker بنجاح في Firestore' });
    } catch (err) {
        return res.status(500).json({ error: 'حدث خطأ أثناء الحفظ: ' + err.message });
    }
};

const getAuditReport = async (req, res) => {
    try {
        const snap = await db.collection('security_logs')
            .orderBy('created_at', 'desc')
            .limit(200)
            .get();
        const rows = [];
        snap.forEach(doc => rows.push({ id: doc.id, ...doc.data() }));
        return res.json(rows);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

const getDeletedTickets = async (req, res) => {
    try {
        const snap = await db.collection('tickets').get();
        const rows = [];
        snap.forEach(doc => {
            const d = doc.data();
            if (d.deleted_at) rows.push({ id: doc.id, ...d });
        });
        return res.json(rows);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

const restoreTicket = async (req, res) => {
    try {
        const ticketId = String(req.params.id);
        const ticketRef = db.collection('tickets').doc(ticketId);
        await ticketRef.set({
            deleted_at: null,
            deleted_by: null,
            updated_at: new Date().toISOString()
        }, { merge: true });

        await ticketRef.collection('timeline').add({
            ticket_id: Number(ticketId) || ticketId,
            user_id: req.user.uid || req.user.id,
            user_name: req.user.full_name || req.user.username,
            role: req.user.role,
            action_type: 'status_change',
            content: '♻️ تم استرجاع التيكت من الأرشيف / سلة المحذوفات بواسطة المشرف العام',
            ip_address: req.ip || 'Localhost',
            created_at: new Date().toISOString()
        });

        return res.json({ message: 'تم استرجاع التيكت بنجاح' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

module.exports = {
    getDepartments, createDepartment, deleteDepartment,
    getUsers, createUser, deleteUser,
    getRules, updateRules, getAuditReport,
    getDeletedTickets, restoreTicket
};