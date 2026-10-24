const express = require('express');
const router = express.Router();
const upload = require('../middlewares/uploadMiddleware');
const { uploadToFirebaseStorage } = require('../middlewares/uploadMiddleware');
const { createTicket, getTickets, getTicketById, getTicketTimeline, replyToTicket } = require('../controllers/ticketController');
const { verifyToken } = require('../middlewares/auth');
const { canAccessTicket } = require('../middlewares/ticketAuth');

router.use(verifyToken);

router.post('/', upload.single('attachment'), uploadToFirebaseStorage, createTicket);
router.get('/', getTickets);
router.get('/:id', canAccessTicket, getTicketById);
router.get('/:id/timeline', canAccessTicket, getTicketTimeline);
router.post('/:id/reply', canAccessTicket, upload.single('attachment'), uploadToFirebaseStorage, replyToTicket);

module.exports = router;