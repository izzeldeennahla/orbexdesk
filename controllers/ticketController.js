const { db } = require('../config/firebaseAdmin');
const { encryptDPAN, formatTicketDPAN } = require('../utils/cryptoUtils');

const getClientIp = (req) => {
    const raw = req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || '';
    return String(raw).split(',')[0].trim().replace('::ffff:', '') || 'Localhost';
};

const logSecurity = async (req, action, details) => {
    if (!db || !req.user) return;
    try {
        await db.collection('security_logs').add({
            user_id: String(req.user.uid || req.user.id),
            username: req.user.username || req.user.email || req.user.full_name,
            action,
            details,
            ip_address: getClientIp(req),
            created_at: new Date().toISOString()
        });
    } catch (e) {}
};

const sendSmartNotification = async (req, { user_id = null, department_id = null, ticket_id, title, message }) => {
    if (!db) return;
    try {
        const created_at = new Date().toISOString();
        const docRef = await db.collection('notifications').add({
            user_id,
            department_id,
            ticket_id,
            title,
            message,
            is_read: 0,
            created_at
        });

        const io = req.app && req.app.get ? req.app.get('io') : null;
        if (!io) return;

        const notifData = { id: docRef.id, user_id, department_id, ticket_id, title, message, is_read: 0, created_at };
        if (user_id) io.to(`user_${user_id}`).emit('targeted_notification', notifData);
        if (department_id) io.to(`dept_${department_id}`).emit('targeted_notification', notifData);
        io.to('role_admin').emit('targeted_notification', notifData);
    } catch (e) {}
};

/**
 * توليد رقم تيكت تسلسلي في Firestore
 */
const getNextTicketSequence = async () => {
    const counterRef = db.collection('system_meta').doc('ticket_counter');
    return await db.runTransaction(async (t) => {
        const doc = await t.get(counterRef);
        const current = doc.exists ? (Number(doc.data().last_id) || 1000) : 1000;
        const nextId = current + 1;
        t.set(counterRef, { last_id: nextId }, { merge: true });
        return nextId;
    });
};

/**
 * إنشاء تيكت جديد في Firestore مع حفظ رابط المرفق المرفوع إلى Firebase Cloud Storage
 */
const createTicket = async (req, res) => {
    try {
        const {
            title, issue_type, transaction_type, client_account, client_email,
            psp_name, amount, currency, transaction_ref, card_dpan,
            description, priority, department_id, master_ticket_id
        } = req.body;

        if (!title || !description || !department_id) {
            return res.status(400).json({ error: 'البيانات الأساسية مطلوبة (العنوان، الوصف، القسم)' });
        }

        const creator_id = req.user.id || req.user.uid;
        // رابط المرفق من Firebase Cloud Storage (أو اسم الملف المحلي)
        const attachment_url = req.file ? (req.file.firebaseUrl || `/uploads/${req.file.filename}`) : null;
        const attachment_path = req.file ? (req.file.firebaseUrl || req.file.filename) : null;
        const attachment_name = req.file ? req.file.originalname : null;
        const encryptedDpan = encryptDPAN(card_dpan);
        const ip = getClientIp(req);

        // جلب قواعد Maker-Checker من Firestore
        let amountLimit = 10000;
        let keywords = ['تصفير رصيد', 'تنفيذ دفع يدوي'];
        const rulesDoc = await db.collection('system_meta').doc('maker_checker_rules').get();
        if (rulesDoc.exists) {
            const rData = rulesDoc.data();
            if (rData.amount_limit !== undefined) amountLimit = Number(rData.amount_limit) || 10000;
            if (Array.isArray(rData.keywords)) keywords = rData.keywords;
        }

        const matchesKeyword = keywords.some(kw => String(title).includes(kw));
        const initialStatus = (matchesKeyword || Number(amount) >= amountLimit) ? 'pending_approval' : 'open';
        const finalPriority = priority || 'medium';

        // حساب وقت استحقاق الـ SLA
        const priorityHoursMap = { urgent: 1, high: 2, medium: 4, low: 24 };
        let slaHours = priorityHoursMap[finalPriority] || 4;
        const deptDoc = await db.collection('departments').doc(String(department_id)).get();
        const deptName = deptDoc.exists ? deptDoc.data().name : 'قسم العمليات';
        if (deptDoc.exists && deptDoc.data().sla_hours && finalPriority === 'medium') {
            slaHours = Number(deptDoc.data().sla_hours) || 4;
        }

        const now = new Date();
        const slaDueTime = new Date(now.getTime() + slaHours * 60 * 60 * 1000).toISOString();
        const pauseImmediately = initialStatus === 'pending_approval' ? 1 : 0;

        const ticketId = await getNextTicketSequence();
        const ticketData = {
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
            dept_name: deptName,
            assigned_agent_id: null,
            agent_name: null,
            master_ticket_id: master_ticket_id ? Number(master_ticket_id) : null,
            attachment_url,
            attachment_path,
            attachment_name,
            sla_due_time: slaDueTime,
            sla_paused: pauseImmediately,
            sla_paused_at: pauseImmediately ? now.toISOString() : null,
            escalated: 0,
            is_handover: 0,
            handover_note: '',
            deleted_at: null,
            deleted_by: null,
            resolved_at: null,
            created_at: now.toISOString(),
            updated_at: now.toISOString()
        };

        await db.collection('tickets').doc(String(ticketId)).set(ticketData);

        const msg = initialStatus === 'pending_approval'
            ? 'قام بفتح التيكت (انتظار اعتماد المشرف Maker-Checker)'
            : 'قام بفتح التيكت';

        await db.collection('tickets').doc(String(ticketId)).collection('timeline').add({
            ticket_id: ticketId,
            user_id: creator_id,
            user_name: req.user.full_name || req.user.username,
            role: req.user.role,
            action_type: 'creation',
            content: msg,
            attachment_path,
            attachment_name,
            ip_address: ip,
            created_at: now.toISOString()
        });

        await logSecurity(req, 'إنشاء تيكت', `تيكت #${ticketId}`);
        await sendSmartNotification(req, {
            department_id: Number(department_id),
            ticket_id: ticketId,
            title: `🔔 تيكت جديد (#${ticketId})`,
            message: `${title} | حساب: ${client_account || '-'} (${amount || 0} ${currency || 'USD'})`
        });

        const io = req.app && req.app.get ? req.app.get('io') : null;
        if (io) io.emit('tickets_updated');

        return res.status(201).json({
            message: 'تم الرفع بنجاح إلى Firestore و Firebase Storage',
            ticket_id: ticketId,
            attachment_url
        });
    } catch (err) {
        return res.status(500).json({ error: 'فشل إنشاء التيكت في Firestore: ' + err.message });
    }
};

/**
 * جلب قائمة التذاكر من Firestore حسب صلاحية الموظف
 */
const getTickets = async (req, res) => {
    try {
        const { role, id: userId, uid, department_id, permissions } = req.user;
        const canViewAll = role === 'admin' || (permissions && permissions.can_view_all);

        const snap = await db.collection('tickets').orderBy('created_at', 'desc').limit(500).get();
        let rows = [];

        snap.forEach(doc => {
            const t = { id: doc.id, ...doc.data() };
            if (t.deleted_at) return;

            if (!canViewAll) {
                const isCreator = String(t.creator_id) === String(userId) || (uid && String(t.creator_id) === String(uid));
                if (role === 'employee' && !isCreator) return;
                if (role === 'agent' && Number(t.department_id) !== Number(department_id) && !isCreator && !t.is_handover) return;
            }

            if (req.query.status && t.status !== req.query.status) return;
            if (req.query.department_id && Number(t.department_id) !== Number(req.query.department_id)) return;

            rows.push(formatTicketDPAN(t, req.user));
        });

        return res.json(rows);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

/**
 * جلب تفاصيل تيكت محدد من Firestore
 */
const getTicketById = async (req, res) => {
    try {
        const docSnap = await db.collection('tickets').doc(String(req.params.id)).get();
        if (!docSnap.exists || docSnap.data().deleted_at) {
            return res.status(404).json({ error: 'التيكت غير موجود' });
        }

        const ticket = formatTicketDPAN({ id: docSnap.id, ...docSnap.data() }, req.user);

        const childrenSnap = await db.collection('tickets')
            .where('master_ticket_id', '==', Number(req.params.id))
            .get();

        const linked_children = [];
        childrenSnap.forEach(ch => {
            const d = ch.data();
            if (!d.deleted_at) {
                linked_children.push({ id: d.id, title: d.title, client_account: d.client_account, status: d.status });
            }
        });

        ticket.linked_children = linked_children;
        return res.json(ticket);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

/**
 * جلب السجل الزمني (Timeline) للتيكت من Firestore
 */
const getTicketTimeline = async (req, res) => {
    try {
        const snap = await db.collection('tickets')
            .doc(String(req.params.id))
            .collection('timeline')
            .orderBy('created_at', 'asc')
            .get();

        const rows = [];
        snap.forEach(doc => {
            const item = { id: doc.id, ...doc.data() };
            if (req.user.role === 'employee' && item.action_type === 'internal_note') return;
            rows.push(item);
        });

        return res.json(rows);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

/**
 * إضافة رد أو ملاحظة داخلية أو تحديث حالة التيكت في Firestore مع دعم رفع مرفق إلى Firebase Storage
 */
const replyToTicket = async (req, res) => {
    try {
        const ticketId = String(req.params.id);
        const userId = req.user.id || req.user.uid;
        const { content, action_type, new_status, assigned_agent_id, mention_user_id } = req.body;
        const ip = getClientIp(req);

        const attachment_url = req.file ? (req.file.firebaseUrl || `/uploads/${req.file.filename}`) : null;
        const attachment_path = req.file ? (req.file.firebaseUrl || req.file.filename) : null;
        const attachment_name = req.file ? req.file.originalname : null;
        const finalActionType = (req.user.role !== 'employee' && action_type === 'internal_note') ? 'internal_note' : 'reply';

        const ticketRef = db.collection('tickets').doc(ticketId);
        const ticketDoc = await ticketRef.get();
        if (!ticketDoc.exists || ticketDoc.data().deleted_at) {
            return res.status(404).json({ error: 'التيكت غير موجود' });
        }

        const ticket = ticketDoc.data();
        const nowIso = new Date().toISOString();

        if (content || attachment_path) {
            await ticketRef.collection('timeline').add({
                ticket_id: Number(ticketId) || ticketId,
                user_id: userId,
                user_name: req.user.full_name || req.user.username,
                role: req.user.role,
                action_type: finalActionType,
                content: content || 'مرفق جديد',
                attachment_url,
                attachment_path,
                attachment_name,
                ip_address: ip,
                created_at: nowIso
            });

            if (mention_user_id) {
                await sendSmartNotification(req, {
                    user_id: mention_user_id,
                    ticket_id: ticketId,
                    title: `📣 إشارة خاصة لك (@Mention)`,
                    message: `${req.user.full_name} أشار إليك في التيكت #${ticketId}`
                });
            }
        }

        const updates = { updated_at: nowIso };

        if (new_status) {
            updates.status = new_status;
            const isResolvedOrClosed = (new_status === 'resolved' || new_status === 'closed');
            const shouldPause = (new_status === 'pending' || new_status === 'pending_approval');

            if (isResolvedOrClosed) {
                updates.sla_paused = 0;
                updates.sla_paused_at = null;
                updates.resolved_at = ticket.resolved_at || nowIso;
            } else if (shouldPause) {
                updates.sla_paused = 1;
                updates.sla_paused_at = ticket.sla_paused_at || nowIso;
            } else {
                updates.sla_paused = 0;
                updates.sla_paused_at = null;
            }

            await ticketRef.collection('timeline').add({
                ticket_id: Number(ticketId) || ticketId,
                user_id: userId,
                user_name: req.user.full_name || req.user.username,
                role: req.user.role,
                action_type: 'status_change',
                content: `تغيير الحالة إلى: [${new_status}]`,
                ip_address: ip,
                created_at: nowIso
            });
        }

        if (assigned_agent_id) {
            updates.assigned_agent_id = assigned_agent_id;
        }

        await ticketRef.set(updates, { merge: true });

        const io = req.app && req.app.get ? req.app.get('io') : null;
        if (io) {
            io.emit('ticket_updated', { ticket_id: ticketId });
            io.emit('tickets_updated');
        }

        return res.json({ message: 'تم الحفظ بنجاح في Firestore', attachment_url });
    } catch (err) {
        return res.status(500).json({ error: 'حدث خطأ أثناء حفظ الرد: ' + err.message });
    }
};

module.exports = { createTicket, getTickets, getTicketById, getTicketTimeline, replyToTicket };