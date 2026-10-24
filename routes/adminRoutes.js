const express = require('express');
const router = express.Router();
const {
    getDepartments, createDepartment, deleteDepartment,
    getUsers, createUser, deleteUser,
    getRules, updateRules, getAuditReport,
    getDeletedTickets, restoreTicket
} = require('../controllers/adminController');
const { verifyToken, verifyAdmin } = require('../middlewares/auth');

// حماية حديدية: يجب أن يكون لديه توكن + يجب أن يكون دوره admin
router.use(verifyToken, verifyAdmin);

// مسارات الأقسام
router.get('/departments', getDepartments);
router.post('/departments', createDepartment);
router.delete('/departments/:id', deleteDepartment);

// مسارات الموظفين
router.get('/users', getUsers);
router.post('/users', createUser);
router.delete('/users/:id', deleteUser);

// مسارات محرك القواعد والتقارير وسلة المحذوفات
router.get('/rules', getRules);
router.post('/rules', updateRules);
router.get('/audit-report', getAuditReport);
router.get('/deleted-tickets', getDeletedTickets);
router.post('/tickets/:id/restore', restoreTicket);

module.exports = router;