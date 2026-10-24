/**
 * قوالب البريد الإلكتروني الرسمية لنظام OrbexDesk
 * نمط: Corporate Luxury (كحلي ملكي + أحمر قرمزي رسمي)
 */

function renderCorporateLuxuryMagicLinkEmail({ fullName = 'زميلنا في OrbexDesk', magicLink, appUrl = 'http://localhost:3000' }) {
    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>رابط الدخول المباشر | OrbexDesk</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b1120; font-family: 'Cairo', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; direction: rtl; text-align: right;">
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0b1120; padding: 40px 15px;">
        <tr>
            <td align="center">
                <!-- كرت الرسالة الرئيسي -->
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; background-color: #ffffff; border-radius: 16px; border: 1px solid #1e293b; overflow: hidden; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);">
                    <!-- ترويسة الشعار الفاخرة -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #0b1120 0%, #0f172a 100%); padding: 32px 40px; text-align: center; border-bottom: 2px solid #b91c1c;">
                            <div style="font-size: 26px; font-weight: 900; color: #ffffff; letter-spacing: -0.5px; margin-bottom: 6px;">
                                Orbex<span style="color: #b91c1c;">Desk</span>
                            </div>
                            <div style="font-size: 12px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
                                منصة إدارة العمليات والتذاكر الداخلية
                            </div>
                        </td>
                    </tr>

                    <!-- محتوى الرسالة -->
                    <tr>
                        <td style="padding: 40px 36px 30px; text-align: right;">
                            <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 0; margin-bottom: 16px;">
                                مرحباً ${fullName}،
                            </h2>
                            <p style="font-size: 14px; line-height: 1.8; color: #475569; margin-bottom: 26px;">
                                لقد تلقينا طلباً لتسجيل الدخول المباشر إلى حسابك في نظام <strong>OrbexDesk</strong>. يمكنك الدخول فوراً وبأمان تام دون الحاجة لكلمة مرور عبر الضغط على الزر التالي:
                            </p>

                            <!-- زر الدخول المباشر -->
                            <div style="text-align: center; margin: 34px 0;">
                                <a href="${magicLink}" target="_blank" style="background: linear-gradient(135deg, #b91c1c 0%, #991b1b 100%); color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 800; padding: 14px 42px; border-radius: 10px; display: inline-block; box-shadow: 0 8px 18px rgba(185, 28, 28, 0.35);">
                                    تسجيل الدخول إلى OrbexDesk
                                </a>
                            </div>

                            <!-- رابط احتياطي -->
                            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin-top: 30px;">
                                <div style="font-size: 12px; color: #64748b; font-weight: 700; margin-bottom: 6px;">
                                    إذا تعذر الضغط على الزر، يمكنك نسخ الرابط التالي ولصقه في المتصفح:
                                </div>
                                <div style="font-size: 11.5px; color: #b91c1c; word-break: break-all; direction: ltr; text-align: left; font-family: monospace;">
                                    ${magicLink}
                                </div>
                            </div>

                            <!-- تنبيه أمني -->
                            <div style="margin-top: 26px; border-top: 1px dashed #e2e8f0; padding-top: 18px;">
                                <p style="font-size: 12px; line-height: 1.6; color: #94a3b8; margin: 0;">
                                    🔒 <strong>تنبيه أمني:</strong> هذا الرابط مخصص للاستخدام لمرة واحدة فقط وينتهي تلقائياً بعد فترة وجيزة. إذا لم تكن أنت من طلب هذا الرابط، يرجى تجاهل هذه الرسالة والتأكد من أمان حسابك.
                                </p>
                            </div>
                        </td>
                    </tr>

                    <!-- تذييل الرسالة -->
                    <tr>
                        <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 30px; text-align: center;">
                            <div style="font-size: 11px; color: #94a3b8; font-weight: 600;">
                                © 2026 OrbexDesk Operations Team. جميع الحقوق محفوظة.
                            </div>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

module.exports = {
    renderCorporateLuxuryMagicLinkEmail
};
