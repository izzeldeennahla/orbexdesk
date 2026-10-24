const { db } = require('../config/firebaseAdmin');
const sqliteDb = require('../database');

/**
 * التحقق من صلاحية الوصول للتيكت عبر Firestore (مع توافق SQLite)
 */
const canAccessTicket = async (req, res, next) => {
    const ticketId = req.params.id;
    if (!req.user || !ticketId) {
        return res.status(403).json({ error: 'غير مصرح' });
    }

    const { role, id: userId, uid, department_id, permissions } = req.user;

    try {
        let ticket = null;

        // 1. الجلب من Firestore أولاً
        if (db) {
            const docSnap = await db.collection('tickets').doc(String(ticketId)).get();
            if (docSnap.exists) {
                const data = docSnap.data();
                if (!data.deleted_at) {
                    ticket = { id: docSnap.id, ...data };
                }
            }
        }

        // 2. Fallback إلى SQLite إذا كان التيكت قديماً قبل الترحيل
        if (!ticket) {
            ticket = await new Promise((resolve) => {
                sqliteDb.get(`SELECT * FROM tickets WHERE id = ? AND deleted_at IS NULL`, [ticketId], (err, row) => {
                    resolve(row || null);
                });
            });
        }

        if (!ticket) {
            return res.status(404).json({ error: 'التيكت غير موجود أو تم حذفه' });
        }

        if (role === 'admin' || (permissions && permissions.can_view_all)) {
            req.ticket = ticket;
            return next();
        }

        const isCreator = String(ticket.creator_id) === String(userId) || (uid && String(ticket.creator_id) === String(uid));
        const isSameDept = Number(ticket.department_id) === Number(department_id);
        const isHandover = Number(ticket.is_handover) === 1 || ticket.is_handover === true;

        const allowed = (role === 'employee' && isCreator) ||
                        (role === 'agent' && (isSameDept || isCreator || isHandover));

        if (!allowed) {
            if (db) {
                await db.collection('security_logs').add({
                    user_id: String(uid || userId),
                    username: req.user.username || req.user.email || 'Unknown',
                    action: 'IDOR_ATTEMPT',
                    details: `محاولة وصول غير مصرحة لتيكت #${ticketId}`,
                    ip_address: req.ip || 'Localhost',
                    created_at: new Date().toISOString()
                }).catch(() => {});
            }
            return res.status(403).json({ error: 'غير مصرح لك بالوصول لهذا التيكت' });
        }

        req.ticket = ticket;
        next();
    } catch (err) {
        return res.status(500).json({ error: 'خطأ أثناء التحقق من صلاحية التيكت: ' + err.message });
    }
};

module.exports = { canAccessTicket };