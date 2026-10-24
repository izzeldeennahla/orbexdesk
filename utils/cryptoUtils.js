const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || '';
const ENCRYPTION_KEY = process.env.DPAN_ENCRYPTION_KEY && process.env.DPAN_ENCRYPTION_KEY.length === 64
    ? Buffer.from(process.env.DPAN_ENCRYPTION_KEY, 'hex')
    : crypto.createHash('sha256').update(JWT_SECRET + '_PCI_DPAN_SALT').digest();

const encryptDPAN = (plainText) => {
    if (!plainText || plainText === '-' || plainText.trim() === '') return '-';
    if (plainText.startsWith('enc:')) return plainText;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(String(plainText).trim(), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `enc:${iv.toString('hex')}:${authTag}:${encrypted}`;
};

const decryptDPAN = (cipherText) => {
    if (!cipherText || cipherText === '-' || !cipherText.startsWith('enc:')) return cipherText;
    try {
        const parts = cipherText.split(':');
        if (parts.length !== 4) return '****';
        const [, ivHex, authTagHex, encryptedHex] = parts;
        const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(ivHex, 'hex'));
        decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        return '**** (خطأ فك تشفير)';
    }
};

const formatTicketDPAN = (ticket, user) => {
    if (!ticket || !ticket.card_dpan || ticket.card_dpan === '-') return ticket;
    const raw = decryptDPAN(ticket.card_dpan);
    const canSeeFull = user && (user.role === 'admin' || (user.permissions && user.permissions.can_approve));
    if (canSeeFull) {
        ticket.card_dpan = raw;
    } else {
        const clean = String(raw).replace(/\s+/g, '');
        ticket.card_dpan = clean.length > 4 ? `**** **** **** ${clean.slice(-4)}` : '****';
    }
    return ticket;
};

module.exports = { encryptDPAN, decryptDPAN, formatTicketDPAN };