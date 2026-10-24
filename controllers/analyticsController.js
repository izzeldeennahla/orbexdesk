// controllers/analyticsController.js
const db = require('../database');

const getAdvancedAnalytics = (req, res) => {
    const { department_id, agent_id, kpi_filter } = req.query;

    // شروط الفلترة الأساسية (القسم + الموظف) لحساب بطاقات KPI العلوية بدقة عند اختيار قسم أو موظف
    const baseConds = ['t.deleted_at IS NULL'];
    const baseParams = [];

    if (department_id && String(department_id).trim() !== '') {
        baseConds.push('t.department_id = ?');
        baseParams.push(Number(department_id));
    }

    if (agent_id && String(agent_id).trim() !== '') {
        if (agent_id === 'unassigned') {
            baseConds.push('t.assigned_agent_id IS NULL');
        } else {
            baseConds.push('t.assigned_agent_id = ?');
            baseParams.push(Number(agent_id));
        }
    }

    // شروط الفلترة الكاملة (القسم + الموظف + فلتر بطاقة الـ KPI النشطة) للرسوم البيانية والمؤشرات التفصيلية
    const fullConds = [...baseConds];
    const fullParams = [...baseParams];

    if (kpi_filter === 'open') {
        fullConds.push("t.status IN ('open', 'pending_approval')");
    } else if (kpi_filter === 'progress') {
        fullConds.push("t.status IN ('in_progress', 'pending')");
    } else if (kpi_filter === 'resolved') {
        fullConds.push("t.status IN ('resolved', 'closed')");
    }

    const baseWhere = baseConds.join(' AND ');
    const fullWhere = fullConds.join(' AND ');

    const stats = {
        kpis: { total: 0, open_tickets: 0, progress_tickets: 0, resolved_tickets: 0, breached_sla: 0 },
        summary: {
            filtered_total: 0,
            total_volume: 0,
            avg_mttr_mins: null,
            escalated_count: 0,
            handover_count: 0,
            pending_approval_count: 0
        },
        byPsp: [],
        byDept: [],
        byStatus: [],
        byPriority: [],
        slaCompliance: { met: 0, breached: 0 },
        agentPerformance: []
    };

    db.serialize(() => {
        // 1. مؤشرات الأداء الرئيسية (KPIs) بناءً على القسم والموظف المحددين
        db.get(`SELECT 
            COUNT(*) as total,
            COALESCE(SUM(CASE WHEN t.status IN ('open', 'pending_approval') THEN 1 ELSE 0 END), 0) as open_tickets,
            COALESCE(SUM(CASE WHEN t.status IN ('in_progress', 'pending') THEN 1 ELSE 0 END), 0) as progress_tickets,
            COALESCE(SUM(CASE WHEN t.status IN ('resolved', 'closed') THEN 1 ELSE 0 END), 0) as resolved_tickets,
            COALESCE(SUM(CASE WHEN t.escalated = 1 OR (t.status IN ('resolved', 'closed') AND t.resolved_at IS NOT NULL AND t.sla_due_time IS NOT NULL AND datetime(t.resolved_at) > datetime(t.sla_due_time)) OR (t.status NOT IN ('resolved', 'closed', 'pending', 'pending_approval') AND t.sla_paused = 0 AND t.sla_due_time IS NOT NULL AND datetime(t.sla_due_time) < datetime('now')) THEN 1 ELSE 0 END), 0) as breached_sla
            FROM tickets t WHERE ${baseWhere}`, baseParams, (err, row) => {
                if (row) stats.kpis = row;
        });

        // 1-ب. ملخص تنفيذي شامل (Summary Insights) مع تطبيق كافة الفلاتر النشطة
        db.get(`SELECT 
            COUNT(*) as filtered_total,
            COALESCE(ROUND(SUM(COALESCE(t.amount, 0)), 2), 0) as total_volume,
            ROUND(AVG(CASE WHEN t.status IN ('resolved', 'closed') AND t.resolved_at IS NOT NULL THEN MAX(0, (julianday(t.resolved_at) - julianday(t.created_at)) * 24 * 60) ELSE NULL END), 1) as avg_mttr_mins,
            COALESCE(SUM(CASE WHEN t.escalated = 1 THEN 1 ELSE 0 END), 0) as escalated_count,
            COALESCE(SUM(CASE WHEN t.is_handover = 1 AND t.status NOT IN ('resolved', 'closed') THEN 1 ELSE 0 END), 0) as handover_count,
            COALESCE(SUM(CASE WHEN t.status = 'pending_approval' THEN 1 ELSE 0 END), 0) as pending_approval_count
            FROM tickets t WHERE ${fullWhere}`, fullParams, (err, row) => {
                if (row) stats.summary = row;
        });

        // 2. التوزيع حسب بوابات الدفع (PSP)
        db.all(`SELECT COALESCE(NULLIF(t.psp_name, ''), 'غير محدد') as psp_name, COUNT(*) as count, COALESCE(ROUND(SUM(t.amount), 2), 0) as total_amount
                FROM tickets t WHERE ${fullWhere} GROUP BY psp_name ORDER BY count DESC`, fullParams, (err, rows) => {
            stats.byPsp = rows || [];
        });

        // 3. ضغط العمل حسب الأقسام
        const deptJoinConds = ['t.deleted_at IS NULL'];
        const deptJoinParams = [];
        if (agent_id && String(agent_id).trim() !== '') {
            if (agent_id === 'unassigned') deptJoinConds.push('t.assigned_agent_id IS NULL');
            else { deptJoinConds.push('t.assigned_agent_id = ?'); deptJoinParams.push(Number(agent_id)); }
        }
        if (kpi_filter === 'open') deptJoinConds.push("t.status IN ('open', 'pending_approval')");
        else if (kpi_filter === 'progress') deptJoinConds.push("t.status IN ('in_progress', 'pending')");
        else if (kpi_filter === 'resolved') deptJoinConds.push("t.status IN ('resolved', 'closed')");

        let deptWhere = "d.status = 'active'";
        const deptAllParams = [...deptJoinParams];
        if (department_id && String(department_id).trim() !== '') {
            deptWhere += ' AND d.id = ?';
            deptAllParams.push(Number(department_id));
        }

        db.all(`SELECT d.id, d.name, COUNT(t.id) as count
                FROM departments d
                LEFT JOIN tickets t ON d.id = t.department_id AND ${deptJoinConds.join(' AND ')}
                WHERE ${deptWhere}
                GROUP BY d.id ORDER BY count DESC`, deptAllParams, (err, rows) => {
            stats.byDept = rows || [];
        });

        // 4. حالة التذاكر والأولويات
        db.all(`SELECT t.status, COUNT(*) as count FROM tickets t WHERE ${fullWhere} GROUP BY t.status`, fullParams, (err, rows) => {
            stats.byStatus = rows || [];
        });

        db.all(`SELECT t.priority, COUNT(*) as count FROM tickets t WHERE ${fullWhere} GROUP BY t.priority`, fullParams, (err, rows) => {
            stats.byPriority = rows || [];
        });

        // 5. صحة الـ SLA (SLA Health)
        db.get(`SELECT 
            COALESCE(SUM(CASE WHEN t.escalated = 0 AND (
                (t.status IN ('resolved', 'closed') AND (t.resolved_at IS NULL OR t.sla_due_time IS NULL OR datetime(t.resolved_at) <= datetime(t.sla_due_time)))
                OR (t.status NOT IN ('resolved', 'closed') AND (t.sla_paused = 1 OR t.sla_due_time IS NULL OR datetime(t.sla_due_time) >= datetime('now')))
            ) THEN 1 ELSE 0 END), 0) as met,
            COALESCE(SUM(CASE WHEN t.escalated = 1
                OR (t.status IN ('resolved', 'closed') AND t.resolved_at IS NOT NULL AND t.sla_due_time IS NOT NULL AND datetime(t.resolved_at) > datetime(t.sla_due_time))
                OR (t.status NOT IN ('resolved', 'closed', 'pending', 'pending_approval') AND t.sla_paused = 0 AND t.sla_due_time IS NOT NULL AND datetime(t.sla_due_time) < datetime('now'))
            THEN 1 ELSE 0 END), 0) as breached
            FROM tickets t WHERE ${fullWhere}`, fullParams, (err, row) => {
                stats.slaCompliance = {
                    met: Number(row?.met || 0),
                    breached: Number(row?.breached || 0)
                };
        });

        // 6. تقرير كفاءة الموظفين (MTTR & SLA Success Rate) مع دعم فلترة القسم والموظف وحالة الـ KPI
        const ticketJoinConds = ['t.deleted_at IS NULL'];
        const agentQueryParams = [];

        if (department_id && String(department_id).trim() !== '') {
            ticketJoinConds.push('t.department_id = ?');
            agentQueryParams.push(Number(department_id));
        }
        if (kpi_filter === 'open') {
            ticketJoinConds.push("t.status IN ('open', 'pending_approval')");
        } else if (kpi_filter === 'progress') {
            ticketJoinConds.push("t.status IN ('in_progress', 'pending')");
        } else if (kpi_filter === 'resolved') {
            ticketJoinConds.push("t.status IN ('resolved', 'closed')");
        }

        const userWhereConds = ["u.role IN ('agent', 'admin')"];
        if (agent_id && String(agent_id).trim() !== '') {
            if (agent_id === 'unassigned') {
                userWhereConds.push('1 = 0');
            } else {
                userWhereConds.push('u.id = ?');
                agentQueryParams.push(Number(agent_id));
            }
        } else if (department_id && String(department_id).trim() !== '') {
            userWhereConds.push('(u.department_id = ? OR t.id IS NOT NULL)');
            agentQueryParams.push(Number(department_id));
        }

        const agentQuery = `
            SELECT u.id, u.full_name, u.role, u.department_id, d.name AS dept_name,
                   COUNT(t.id) AS total_assigned,
                   COALESCE(SUM(CASE WHEN t.status IN ('open', 'pending_approval') THEN 1 ELSE 0 END), 0) AS open_count,
                   COALESCE(SUM(CASE WHEN t.status IN ('in_progress', 'pending') THEN 1 ELSE 0 END), 0) AS in_progress_count,
                   COALESCE(SUM(CASE WHEN t.status IN ('resolved', 'closed') THEN 1 ELSE 0 END), 0) AS resolved_count,
                   COALESCE(SUM(CASE WHEN t.escalated = 1
                       OR (t.status IN ('resolved', 'closed') AND t.resolved_at IS NOT NULL AND t.sla_due_time IS NOT NULL AND datetime(t.resolved_at) > datetime(t.sla_due_time))
                       OR (t.status NOT IN ('resolved', 'closed', 'pending', 'pending_approval') AND t.sla_paused = 0 AND t.sla_due_time IS NOT NULL AND datetime(t.sla_due_time) < datetime('now'))
                   THEN 1 ELSE 0 END), 0) AS breached_count,
                   ROUND(AVG(CASE WHEN t.status IN ('resolved', 'closed') AND t.resolved_at IS NOT NULL THEN MAX(0, (julianday(t.resolved_at) - julianday(t.created_at)) * 24 * 60) ELSE NULL END), 1) AS avg_resolution_mins
            FROM users u
            LEFT JOIN departments d ON u.department_id = d.id
            LEFT JOIN tickets t ON u.id = t.assigned_agent_id AND ${ticketJoinConds.join(' AND ')}
            WHERE ${userWhereConds.join(' AND ')}
            GROUP BY u.id
            ORDER BY resolved_count DESC, total_assigned DESC
        `;
        db.all(agentQuery, agentQueryParams, (err, rows) => {
            stats.agentPerformance = rows || [];
            res.json(stats);
        });
    });
};

module.exports = { getAdvancedAnalytics };