// utils/slaUtils.js

const DEFAULT_SLA_SETTINGS = {
    sla_mode: 'dept_default', // 'dept_default' | 'department_only' | 'priority_only'
    sla_urgent_hours: 1,
    sla_high_hours: 2,
    sla_medium_hours: 4,
    sla_low_hours: 24,
    sla_pause_on_pending: true,
    sla_pause_on_approval: true,
    sla_reset_on_transfer: true,
    sla_auto_escalate: true
};

const SLA_META_KEYS = [
    'sla_mode',
    'sla_urgent_hours',
    'sla_high_hours',
    'sla_medium_hours',
    'sla_low_hours',
    'sla_pause_on_pending',
    'sla_pause_on_approval',
    'sla_reset_on_transfer',
    'sla_auto_escalate'
];

function parseSlaSettingsFromRows(rows) {
    const settings = { ...DEFAULT_SLA_SETTINGS };
    (rows || []).forEach(r => {
        if (!r || !r.meta_key) return;
        const k = r.meta_key;
        const v = r.meta_value;
        if (k === 'sla_mode' && ['dept_default', 'department_only', 'priority_only'].includes(v)) {
            settings.sla_mode = v;
        } else if (['sla_urgent_hours', 'sla_high_hours', 'sla_medium_hours', 'sla_low_hours'].includes(k)) {
            const num = parseFloat(v);
            if (!isNaN(num) && num > 0) settings[k] = num;
        } else if (['sla_pause_on_pending', 'sla_pause_on_approval', 'sla_reset_on_transfer', 'sla_auto_escalate'].includes(k)) {
            settings[k] = v === '1' || v === 'true' || v === true;
        }
    });
    return settings;
}

function getSlaSettings(db, callback) {
    const placeholders = SLA_META_KEYS.map(() => '?').join(',');
    db.all(`SELECT meta_key, meta_value FROM system_meta WHERE meta_key IN (${placeholders})`, SLA_META_KEYS, (err, rows) => {
        if (err) return callback({ ...DEFAULT_SLA_SETTINGS });
        callback(parseSlaSettingsFromRows(rows));
    });
}

function resolveSlaHours({ deptSlaHours, priority, settings }) {
    const cfg = settings || DEFAULT_SLA_SETTINGS;
    const prioMap = {
        urgent: Number(cfg.sla_urgent_hours) || 1,
        high: Number(cfg.sla_high_hours) || 2,
        medium: Number(cfg.sla_medium_hours) || 4,
        low: Number(cfg.sla_low_hours) || 24
    };
    const validDeptSla = (deptSlaHours !== undefined && deptSlaHours !== null && !isNaN(Number(deptSlaHours)) && Number(deptSlaHours) > 0)
        ? Number(deptSlaHours)
        : prioMap.medium;

    const prio = priority || 'medium';

    if (cfg.sla_mode === 'department_only') {
        return validDeptSla;
    }
    if (cfg.sla_mode === 'priority_only') {
        return prioMap[prio] || prioMap.medium;
    }
    // 'dept_default':
    // - 'medium' uses the department's configured SLA hours
    // - 'urgent' and 'high' use the priority SLA hours (or department SLA if department is even stricter)
    // - 'low' uses the low priority SLA hours
    if (prio === 'medium') {
        return validDeptSla;
    }
    if (prio === 'urgent' || prio === 'high') {
        return Math.min(validDeptSla, prioMap[prio]);
    }
    if (prio === 'low') {
        return Math.max(validDeptSla, prioMap.low);
    }
    return validDeptSla;
}

function calculateTicketSlaHours(db, departmentId, priority, callback) {
    getSlaSettings(db, (settings) => {
        db.get(`SELECT sla_hours FROM departments WHERE id = ?`, [Number(departmentId) || 0], (err, dept) => {
            const deptSlaHours = dept ? dept.sla_hours : null;
            const slaHours = resolveSlaHours({ deptSlaHours, priority, settings });
            const slaMinutes = Math.max(1, Math.round(slaHours * 60));
            callback({ slaHours, slaMinutes, settings, deptSlaHours });
        });
    });
}

module.exports = {
    DEFAULT_SLA_SETTINGS,
    SLA_META_KEYS,
    parseSlaSettingsFromRows,
    getSlaSettings,
    resolveSlaHours,
    calculateTicketSlaHours
};
