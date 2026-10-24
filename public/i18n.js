// public/i18n.js - OrbexDesk Multilingual (AR / EN) Engine
(function (window) {
    'use strict';

    try {
        if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
            var _f = window.fetch;
            Object.defineProperty(window, 'fetch', {
                configurable: true,
                enumerable: true,
                get: function() { return _f; },
                set: function(fn) { _f = fn; }
            });
        }
    } catch (e) {}

    const I18N_STORAGE_KEY = 'sys_lang';

    const translations = {
        ar: {
            // General & Common
            "app_title": "نظام إدارة التذاكر المؤسسي | OrbexDesk",
            "app_subtitle": "نظام إدارة التذاكر والعمليات الداخلية",
            "lang_btn_text": "English",
            "lang_btn_tooltip": "Switch to English",
            "dashboard": "لوحة العمليات",
            "back_to_dashboard": "العودة للوحة التذاكر",
            "logout": "خروج",
            "dark_mode_title": "الوضع الليلي / النهاري",
            "sound_alerts_title": "التنبيه الصوتي",
            "online_now": "المتصلون الآن",
            "admin_announcement": "تعميم إداري",
            "search_placeholder": "بحث برقم التيكت، العميل، المرجع، أو DPAN...",
            "reset_filters": "تفريغ الفلاتر",
            "quick_shortcut": "اختصار سريع: اضغط Alt + N لفتح تيكت جديد فوراً",
            "filter_all_psps": "كل بوابات الدفع (PSP)",
            "filter_all_trans": "كل الحركات",
            "filter_all_status": "كل الحالات",
            "filter_all_priorities": "كل الأولويات",
            "notifications_title": "🔔 إشعارات القسم والمهام",
            "enable_desktop_notif": "تفعيل الويندوز",
            "clear_all_notifs": "قراءة وحذف كل الإشعارات",
            "no_notifs": "لا توجد إشعارات حالياً",
            "empty": "فارغ",
            "actions": "إجراءات",
            "action": "إجراء",
            "open": "فتح",
            "edit": "تعديل",
            "delete": "حذف",
            "save": "حفظ",
            "cancel": "إلغاء",
            "confirm": "تأكيد",
            "success": "تم بنجاح",
            "error": "خطأ",
            "notice": "تنبيه",
            "yes": "نعم",
            "no": "لا",
            "copy": "نسخ",
            "copied": "تم النسخ",
            "unassigned": "غير مسند",
            "required_mark": "*",

            // Login Page (index.html)
            "login_portal_title": "بوابة الدخول | نظام إدارة التذاكر المؤسسي",
            "login_side_desc": "منصة مركزية لمتابعة طلبات الأقسام، معالجة حركات العملاء، ومراقبة مؤشرات الأداء (SLA) ضمن الشبكة المحلية بأعلى معايير الأمان.",
            "login_encrypted_badge": "اتصال داخلي مشفر ومحمي (JWT)",
            "login_heading": "تسجيل الدخول",
            "login_subheading": "أدخل بيانات الحساب الوظيفي للمتابعة",
            "username_label": "اسم المستخدم",
            "username_placeholder": "مثال: admin",
            "password_label": "كلمة المرور",
            "password_placeholder": "••••••••",
            "login_btn": "دخول إلى النظام",
            "login_verifying": "جاري التحقق...",
            "login_failed": "فشل الدخول",
            "network_error": "تعذر الاتصال بالخادم المركزي",

            // Sidebar Tabs (dashboard.html)
            "tab_all_tickets": "جدول التذاكر الشامل",
            "tab_kanban": "لوحة السحب (Kanban)",
            "tab_handover": "تسليم الشفتات",
            "tab_approval": "بانتظار الاعتماد",
            "tab_analytics": "التحليلات وكفاءة الفريق",
            "tab_admin": "إدارة النظام الشاملة",

            // Top Bar & KPIs (dashboard.html)
            "top_bar_title": "مركز العمليات المالية وإدارة التذاكر",
            "btn_new_ticket": "فتح تيكت جديد",
            "btn_csv_import": "CSV",
            "btn_excel_export": "Excel",
            "kpi_total_title": "إجمالي التذاكر المسجلة",
            "kpi_open_title": "تذاكر مفتوحة وبانتظار",
            "kpi_progress_title": "قيد المعالجة حالياً",
            "kpi_resolved_title": "تذاكر تم حلها وإغلاقها",

            // Statuses & Priorities
            "status_open": "مفتوح",
            "status_in_progress": "قيد المعالجة",
            "status_pending": "بانتظار العميل",
            "status_pending_approval": "🛡️ بانتظار الاعتماد",
            "status_resolved": "تم الحل",
            "status_closed": "مغلق",
            "priority_urgent": "🔥 عاجل جداً",
            "priority_high": "عالية",
            "priority_medium": "متوسطة",
            "priority_low": "منخفضة",

            // SLA Badges & Live Status
            "sla_completed_ontime": "✅ منجز (ضمن الوقت)",
            "sla_completed_late": "⚠️ منجز (تجاوز SLA)",
            "sla_completed": "منجز",
            "sla_paused_approval": "⏸️ متوقف (بانتظار الاعتماد)",
            "sla_paused_customer": "⏸️ متوقف (بانتظار العميل)",
            "sla_paused": "⏸️ متوقف",
            "sla_overdue": "🔥 متأخر",
            "sla_remaining": "⏳ باقي",
            "sla_remaining_header": "باقي",
            "time_day_short": "ي",
            "time_hour_short": "س",
            "time_minute_short": "د",
            "badge_handover": "📌 تسليم شفت",
            "badge_master_sub": "فرعي من #",
            "badge_escalated": "🚨 مصعّد",

            // Table Headers (dashboard.html)
            "th_seq": "#",
            "th_ticket_issue": "العنوان / المشكلة",
            "th_client_account": "حساب العميل",
            "th_psp_amount": "بوابة الدفع والمبلغ",
            "th_client_email": "العميل والبريد",
            "th_amount_currency": "المبلغ والعملة",
            "th_ref_dpan": "المرجع / DPAN",
            "th_dept_agent": "القسم والمستلم",
            "th_status": "الحالة",
            "th_sla": "عداد الـ SLA",
            "th_action": "إجراء",
            "no_matching_tickets": "لا توجد تذاكر مطابقة",

            // Bulk Actions Toolbar (dashboard.html)
            "bulk_selected_prefix": "تم تحديد",
            "bulk_selected_suffix": "تيكت",
            "bulk_selected_count": "تذكرة محددة",
            "bulk_status_placeholder": "-- تغيير الحالة --",
            "bulk_apply_status": "تطبيق الحالة",
            "bulk_link_master_placeholder": "رقم التيكت الأم #",
            "bulk_apply_link": "ربط بتيكت أم",
            "bulk_delete": "حذف جماعي",
            "filter_status_pending_sla": "بانتظار العميل (SLA متوقف)",
            "reset_filters_tooltip": "إعادة ضبط",
            "search_dashboard_placeholder": "🔍 بحث: رقم، حساب عميل، TXID، إيميل...",
            "kanban_account_label": "حساب:",
            "kanban_empty": "فارغ",
            "role_admin": "مدير نظام",
            "role_agent": "مختص قسم",
            "role_employee": "موظف عادي",
            "dept_general": "عام",
            "outage_admin_memo": "تعميم إداري",

            // Kanban Columns (dashboard.html)
            "kanban_open_col": "📥 تذاكر جديدة ومفتوحة",
            "kanban_progress_col": "⚡ قيد المعالجة (In Progress)",
            "kanban_pending_col": "⏸️ بانتظار العميل (Pending)",
            "kanban_resolved_col": "✅ تم الحل والإنهاء (Resolved)",

            // Ticket Modal (dashboard.html)
            "modal_create_ticket_title": "فتح تيكت تشغيلي جديد",
            "sec_1_routing": "1. التوجيه والعنوان المعياري للتيكت",
            "lbl_dept": "القسم المعني",
            "lbl_issue_cat": "تصنيف المشكلة الرئيسي",
            "lbl_priority": "الأولوية",
            "lbl_ticket_title": "عنوان مختصر للتيكت",
            "opt_select_title": "-- اختر المشكلة من القائمة أو اختر كتابة يدوية --",
            "opt_manual_entry": "✍️ كتابة عنوان تيكت يدوي مخصص...",
            "placeholder_manual_title": "اكتب عنوان التيكت المخصص هنا...",
            "lbl_master_ticket": "ربط بتيكت أم (Master #)",
            "placeholder_master_ticket": "اختياري (مثال: 5)",
            "sec_2_fintech": "2. بيانات العميل وبوابة الدفع (FinTech & PSP Details)",
            "lbl_client_account": "رقم حساب العميل (MT4/MT5)",
            "placeholder_client_acc": "مثال: 805412",
            "lbl_client_email": "بريد العميل",
            "lbl_trans_type": "نوع الحركة",
            "lbl_psp": "بوابة الدفع (PSP)",
            "lbl_amount": "المبلغ",
            "lbl_currency": "العملة",
            "lbl_ref": "الرقم المرجعي (يكتشف حتى آخر 6 أرقام)",
            "placeholder_ref": "رقم العملية أو TXID",
            "lbl_dpan": "آخر 4 أرقام بطاقة / DPAN",
            "placeholder_dpan": "مثال: 4219",
            "sec_3_details": "3. الشرح التفصيلي والمرفقات (يدعم اللصق المباشر Ctrl+V)",
            "placeholder_description": "اكتب كافة التفاصيل أو السجلات هنا... (يمكنك الضغط على Ctrl+V للصق لقطة شاشة مباشرة)",
            "paste_zone_hint": "اضغط لاختيار ملف أو اضغط (Ctrl + V) للصق صورة",
            "btn_submit_ticket": "حفظ وإرسال التيكت",

            // CSV Modal (dashboard.html)
            "modal_csv_title": "استيراد تذاكر جماعي عبر ملف CSV",
            "csv_instructions": "ارفع ملف CSV يحتوي على الأعمدة: client_account,amount,currency,psp_name,transaction_ref,title",
            "lbl_csv_dept": "توجيه التذاكر المستوردة إلى قسم:",
            "btn_start_csv_import": "بدء الاستيراد وإنشاء التذاكر",

            // Analytics (dashboard.html)
            "chart_sla_compliance": "نسبة الالتزام بالـ SLA",
            "chart_sla_met": "ضمن الوقت ✅",
            "chart_sla_breached": "متأخر 🚨",
            "chart_dept_dist": "توزيع التذاكر حسب الأقسام",
            "chart_psp_dist": "توزيع التذاكر حسب بوابات الدفع",
            "perf_table_title": "لوحة أداء الموظفين ومتوسط سرعة الإنجاز (MTTR)",
            "th_agent_dept": "الموظف والقسم",
            "th_assigned": "المسندة",
            "th_resolved": "المنجزة",
            "th_completion_rate": "نسبة الإنجاز",
            "th_sla_rate": "الالتزام بالـ SLA",
            "th_mttr": "متوسط وقت الحل",
            "mttr_minutes": "دقيقة",
            "none": "لا يوجد",

            // Ticket Details (ticket.html)
            "ticket_page_title": "معالجة التيكت | OrbexDesk v6.0",
            "print_audit_pdf": "طباعة سند تدقيق (PDF / Audit)",
            "viewers_banner_title": "المتواجدون في هذا التيكت الآن:",
            "viewers_only_you": "أنت فقط",
            "approval_card_title": "مطلوب اعتماد المشرف (Maker-Checker)",
            "approval_card_desc": "هذه الحركة حساسة وتنتظر تعميد المدير أو المخول بالاعتماد.",
            "btn_approve": "✔️ موافقة وتعميد",
            "btn_reject": "❌ رفض وإغلاق",
            "client_financial_heading": "بيانات العميل والحركة المالية",
            "lbl_txid_smart": "الرقم المرجعي / TXID (مع الفحص الذكي)",
            "lbl_current_dept": "القسم الحالي:",
            "lbl_assigned_agent": "الموظف المستلم:",
            "lbl_created_by": "أنشئ بواسطة:",
            "lbl_sla_due_time": "وقت استحقاق الـ SLA:",
            "lbl_sla_indicator": "مؤشر الـ SLA:",
            "agent_panel_heading": "الأتمتة وتحويل الأقسام",
            "btn_assign_me": "استلام التيكت (إسناد لنفسي)",
            "btn_auto_dealing": "موافقة التداول وتحويل تلقائي للـ Back Office",
            "btn_toggle_handover": "إدراج / إلغاء تسليم للشفت القادم",
            "lbl_transfer_to_dept": "تحويل التيكت لقسم آخر:",
            "btn_do_transfer": "تحويل",
            "client_history_heading": "سجل تذاكر العميل السابقة",
            "checking_history": "جاري الفحص...",
            "no_prev_tickets": "لا توجد تذاكر سابقة لهذا العميل",
            "no_acc_number": "لا يوجد رقم حساب",
            "timeline_heading": "الخط الزمني وسجل المعالجة الموثق بالـ IP (Audit Timeline)",
            "quick_canned_prefix": "ردود سريعة:",
            "reply_placeholder": "اكتب الرد هنا... (اضغط Ctrl+Enter للإرسال السريع، أو Ctrl+V للصق صورة)",
            "mention_placeholder": "@ إشارة لزميل...",
            "opt_public_reply": "📢 رد عام",
            "opt_internal_note": "🔒 ملاحظة سرية",
            "opt_keep_status": "-- إبقاء الحالة --",
            "btn_send_reply": "إرسال",
            "view_attachment": "عرض المرفق:",
            "linked_subtickets_heading": "🔗 التذاكر الفرعية المرتبطة بهذا التيكت الأم:",

            // Admin Control Center (admin.html)
            "admin_page_title": "مركز التحكم الشامل للنظام | OrbexDesk v6.0",
            "admin_sidebar_brand": "إدارة النظام v6.0",
            "admin_tab_1": "1. الموظفين والصلاحيات",
            "admin_tab_2": "2. الأقسام وساعات الـ SLA",
            "admin_tab_3": "3. المشاكل والعناوين الثابتة",
            "admin_tab_4": "4. الردود التلقائية السريعة",
            "admin_tab_5": "5. بوابات الدفع والقوائم",
            "admin_tab_6": "6. التنبيه العام والنسخ الاحتياطي",
            "admin_tab_7": "7. سجل الرقابة والأمان (IP)",
            "admin_tab_8": "8. محرك القواعد وتقارير التدقيق",

            "admin_users_heading": "👥 إدارة حسابات الموظفين ومصفوفة الصلاحيات",
            "admin_add_user": "إضافة موظف جديد",
            "admin_fullname": "الاسم الكامل",
            "admin_username": "اسم الدخول (Username)",
            "admin_password": "كلمة المرور",
            "admin_role": "الدور الوظيفي",
            "admin_role_employee": "موظف عادي (يرفع تذاكر)",
            "admin_role_agent": "مختص قسم (Agent)",
            "admin_role_admin": "مدير نظام (Admin)",
            "admin_user_dept": "القسم التابع له:",
            "admin_granular_perms": "الصلاحيات الدقيقة (Granular Permissions):",
            "admin_perm_export": "تصدير تقارير Excel",
            "admin_perm_approve": "اعتماد الحركات (Maker-Checker)",
            "admin_perm_view_all": "رؤية تذاكر كافة الأقسام",
            "admin_perm_delete": "صلاحية حذف التذاكر",
            "admin_btn_create_user": "إنشاء الحساب وتفعيل الصلاحيات",
            "admin_users_register": "سجل الموظفين الحاليين",
            "th_admin_name": "الاسم",
            "th_admin_username": "اسم الدخول",
            "th_admin_role_dept": "الدور والقسم",
            "th_admin_perms": "الصلاحيات",
            "th_admin_actions": "إجراءات",

            "admin_depts_heading": "🏢 إدارة الأقسام وساعات الاستجابة المعيارية (SLA Settings)",
            "admin_add_dept": "إضافة قسم جديد",
            "admin_dept_name": "اسم القسم",
            "admin_dept_sla": "ساعات الـ SLA المعيارية",
            "admin_btn_add_dept": "إضافة القسم",
            "admin_depts_list": "الأقسام الحالية وساعات الاستجابة",
            "th_dept_id": "رقم",
            "th_dept_name": "اسم القسم",
            "th_dept_sla": "ساعات الـ SLA",

            "admin_sla_engine_heading": "إعدادات محرك الـ SLA والأولويات وسياسات التوقف والتصعيد",
            "admin_recalc_original": "إعادة احتساب الـ SLA (من وقت الإنشاء)",
            "admin_recalc_now": "تصفير وتجديد عداد الـ SLA للتذاكر النشطة (من الآن)",
            "admin_sla_mode_label": "آلية احتساب وقت الـ SLA عند فتح التيكت:",
            "admin_sla_mode_hybrid": "⚡ هجين ذكي (الافتراضي): يعتمد ساعات القسم للأولوية المتوسطة، ويطبق ساعات الأولوية عند اختيار (عاجل جداً / عالية / منخفضة)",
            "admin_sla_mode_dept": "🏢 حسب القسم فقط: يلتزم دائماً بساعات الـ SLA المحددة للقسم المستلم بغض النظر عن أولوية التيكت",
            "admin_sla_mode_prio": "🔥 حسب الأولوية فقط: يعتمد ساعات الأولوية المختارة أدناه لجميع الأقسام",
            "admin_sla_urgent_label": "🔥 أولوية عاجل جداً (ساعات)",
            "admin_sla_high_label": "⚡ أولوية عالية (ساعات)",
            "admin_sla_medium_label": "📌 أولوية متوسطة (ساعات)",
            "admin_sla_low_label": "⏳ أولوية منخفضة (ساعات)",
            "admin_sla_policies_heading": "سياسات التوقف المؤقت والتحويل والتصعيد التلقائي:",
            "admin_sla_pause_pending": "⏸️ إيقاف الـ SLA مؤقتاً عند حالة (بانتظار العميل) وتعويض الوقت عند الاستئناف",
            "admin_sla_pause_approval": "🛡️ إيقاف الـ SLA مؤقتاً أثناء انتظار اعتماد المشرف (Maker-Checker) وبدء العداد فور التعميد",
            "admin_sla_reset_transfer": "🔄 منح مهلة SLA جديدة حسب ساعات القسم المستلم عند تحويل التيكت بين الأقسام",
            "admin_sla_auto_escalate": "🚨 تفعيل التصعيد التلقائي (Auto-Escalation) للتذاكر المتأخرة وإشعار الإدارة",
            "admin_btn_save_sla": "حفظ وتعميم إعدادات الـ SLA",

            "admin_issues_heading": "📋 إدارة المشاكل والعناوين الثابتة للتذاكر",
            "admin_add_issue": "إضافة مشكلة ثابتة جديدة للقائمة",
            "admin_issue_cat": "التصنيف الرئيسي",
            "admin_issue_title": "عنوان المشكلة الثابت",
            "admin_issue_trans": "نوع الحركة التلقائي",
            "admin_btn_add_issue": "إضافة المشكلة للقائمة الثابتة",
            "admin_issues_current": "قائمة المشاكل الثابتة الحالية",

            "admin_canned_heading": "⚡ إدارة الردود التلقائية السريعة (Canned Responses)",
            "admin_add_canned": "إضافة زر رد تلقائي جديد",
            "admin_canned_label": "اسم الزر المختصر",
            "admin_canned_content": "نص الرد الكامل",
            "admin_btn_add_canned": "حفظ الرد التلقائي",

            "admin_lists_heading": "💳 إدارة بوابات الدفع (PSPs)، أنواع الحركات، العملات، والتصنيفات",
            "admin_lists_psp": "بوابات الدفع (PSPs)",
            "admin_placeholder_psp": "اسم بوابة دفع جديدة...",
            "admin_lists_trans": "أنواع الحركات المالية",
            "admin_placeholder_trans": "نوع حركة جديد...",
            "admin_lists_curr": "العملات المعتمدة",
            "admin_placeholder_curr": "رمز العملة...",
            "admin_lists_cat": "تصنيفات المشاكل الرئيسية",
            "admin_placeholder_cat": "تصنيف رئيسي جديد...",

            "admin_banner_backup_heading": "🚨 شريط التنبيه العام للأعطال + النسخ الاحتياطي لقاعدة البيانات",
            "admin_banner_card_title": "نشر شريط تنبيه عام لجميع موظفي الشركة (Outage Banner)",
            "admin_banner_card_desc": "يظهر هذا الشريط فوراً في أعلى لوحة العمليات لدى كافة الموظفين لتنبيههم في حال وجود تأخير أو عطل عام في بوابة دفع.",
            "admin_banner_text_label": "نص التعميم / التنبيه العام",
            "admin_banner_text_placeholder": "مثال: ⚠️ تنبيه: يوجد تأخير عام حالياً في بوابة دفع Visa، جاري المتابعة مع المزود...",
            "admin_banner_type_label": "لون الشريط",
            "admin_banner_opt_warning": "🟡 تحذيري (أصفر)",
            "admin_banner_opt_danger": "🔴 طوارئ / عطل (أحمر)",
            "admin_banner_opt_info": "🔵 معلومات عامة (أزرق)",
            "admin_banner_active_label": "تفعيل وإظهار الشريط للجميع الآن",
            "admin_btn_save_banner": "حفظ وبث الشريط فوراً",
            "admin_backup_card_title": "النسخ الاحتياطي وحماية البيانات (Database Backup)",
            "admin_backup_card_desc": "يقوم الخادم تلقائياً بأخذ نسخة احتياطية يومية في مجلد backups/، ويمكنك أيضاً تحميل نسخة كاملة على جهازك في أي لحظة.",
            "admin_btn_download_backup": "تحميل نسخة احتياطية كاملة (.db)",

            "admin_logs_heading": "🛡️ سجل الرقابة الأمني وتوثيق عناوين الشبكة (Security & IP Audit Logs)",
            "th_log_datetime": "التاريخ والوقت",
            "th_log_user": "المستخدم",
            "th_log_action": "نوع الإجراء",
            "th_log_details": "التفاصيل",
            "th_log_ip": "عنوان الـ IP المحلي",

            "admin_rules_heading": "⚙️ محرك قواعد الأعمال (Rules Engine) والتدقيق المالي",
            "admin_rules_card_title": "قواعد الاعتماد المزدوج (Maker-Checker)",
            "admin_rules_card_desc": "أي تيكت يتجاوز هذا المبلغ، أو يحتوي عنوانه على إحدى الكلمات المفتاحية، سيتم تجميده وطلب اعتماد المشرف فوراً.",
            "admin_rule_amount_label": "حد مبلغ الاعتماد المالي (Limit)",
            "admin_rule_keywords_label": "الكلمات المفتاحية الحساسة (افصل بينها بفاصلة)",
            "admin_rule_keywords_placeholder": "مثال: تصفير رصيد, دفع يدوي, تسوية",
            "admin_btn_save_rules": "تحديث وتطبيق القواعد فوراً",
            "admin_audit_card_title": "تصدير تقارير التدقيق (Audit Trails)",
            "admin_audit_card_desc": "تصدير سجل كامل لجميع عمليات 'الموافقة' و 'الرفض' التي تمت عبر نظام Maker-Checker لمطابقتها مع قسم التدقيق أو الامتثال.",
            "admin_btn_export_audit": "تحميل تقرير التدقيق (Excel/CSV)",
            "admin_audit_notice": "يحتوي التقرير على (الموظف المعتمد، IP الجهاز، التوقيت الدقيق، والتفاصيل).",

            "admin_modal_edit_user": "تعديل بيانات وصلاحيات الموظف",
            "admin_modal_new_pass_hint": "كلمة مرور جديدة (اتركه فارغاً لعدم التغيير)",
            "admin_modal_btn_save_user": "حفظ التعديلات",

            // Additional keys for comprehensive coverage
            "btn_add": "إضافة",
            "outage_official_notice": "تعميم إداري",
            "modal_new_ticket_title": "فتح تيكت تشغيلي / مالي جديد",
            "priority_low_default": "منخفضة (24 ساعة)",
            "priority_medium_default": "متوسطة (4 ساعات)",
            "priority_high_default": "عالية (ساعتان)",
            "priority_urgent_default": "🔥 عاجل جداً (ساعة واحدة)",
            "smart_duplicate_warning": "⚠️ تنبيه تطابق ذكي! يوجد تيكت مفتوح لنفس العميل أو يتطابق مع آخر أرقام الـ TXID:",
            "ticket_number_prefix": "تيكت #",
            "ref_prefix": "المرجع:",
            "alert_select_value_first": "اختر القيمة أولاً",
            "alert_bulk_done": "تم تنفيذ الإجراء الجماعي",
            "alert_fill_required": "يرجى تحديد القسم، عنوان التيكت، والشرح التفصيلي",
            "alert_ticket_created": "تم إنشاء التيكت وإشعار القسم المعني",
            "alert_send_error": "خطأ في الإرسال",
            "alert_unexpected_error": "حدث خطأ غير متوقع",
            "alert_select_csv": "اختر ملف CSV أولاً",
            "alert_csv_imported": "تم الاستيراد",
            "clipboard_screenshot_captured": "✅ تم التقاط صورة من الحافظة (Ctrl+V)",
            "csv_default_psp": "غير محدد",
            "csv_default_title": "مراجعة حركة مستوردة",
            "dept_general_management": "إدارة عامة",
            "copy_tooltip": "نسخ",
            "mention_colleague_tooltip": "إشارة لزميل @Mention",
            "copied_to_clipboard": "تم النسخ: ",
            "view": "عرض",
            "dealing_approved_auto": "تم اعتماد التداول وتحويل التيكت للـ Back Office تلقائياً",
            "dept_transfer_note_title": "ملاحظة التحويل للقسم",
            "dept_transfer_note_placeholder": "اكتب سبب التحويل أو المطلوب من القسم...",
            "handover_note_title": "ملاحظة تسليم الشفت القادم",
            "handover_note_placeholder": "ما الذي يجب على موظف الشفت القادم متابعته؟",
            "approval_note_title": "ملاحظة الاعتماد",
            "rejection_reason_title": "سبب الرفض",
            "confirm_delete_issue": "حذف هذه المشكلة؟",
            "confirm_delete_canned": "حذف هذا الرد التلقائي؟",
            "confirm_delete_item": "حذف هذا العنصر؟",
            "confirm_delete_dept": "حذف القسم؟",
            "confirm_delete_user": "حذف الموظف؟",
            "sla_reset_confirm": "سيتم تصفير عداد الـ SLA لجميع التذاكر النشطة حالياً ومنحها مهلة جديدة تبدأ من هذه اللحظة حسب إعدادات القسم والأولوية. هل أنت متأكد؟",
            "sla_recalc_confirm": "سيتم إعادة احتساب وقت استحقاق الـ SLA لجميع التذاكر النشطة بناءً على وقت إنشائها الأصلي وإعدادات القسم والأولوية الحالية. هل تريد المتابعة؟",
            "sla_reset_title": "تصفير وتجديد عدادات الـ SLA",
            "sla_recalc_title": "إعادة احتساب الـ SLA",
            "yes_execute": "نعم، نفّذ الآن",
            "sla_preview_target": "مهلة الـ SLA المستهدفة:",
            "hours_unit": "ساعات",
            "hour_singular": "ساعة",
            "hours_suffix_short": "س SLA",
            "edit_dept_sla_title": "تعديل القسم وساعات الـ SLA",
            "dept_name_label": "اسم القسم",
            "sla_hours_label": "ساعات الـ SLA",
            "recalc_open_tickets": "تحديث عدادات التذاكر المفتوحة حالياً في هذا القسم",
            "save_changes": "حفظ التعديلات",
            "edit_issue_title": "تعديل المشكلة الثابتة",
            "edit_canned_title": "تعديل الرد التلقائي السريع",
            "edit_value_title": "تعديل القيمة",
            "reply_screenshot_ready": "📸 تم إرفاق لقطة شاشة من الحافظة (Ctrl+V) جاهزة للإرسال",
            "no_windows_notif": "المتصفح لا يدعم إشعارات الويندوز",
            "windows_notif_enabled": "ستصلك إشعارات الويندوز المنبثقة فوراً",
            "all_psps_option": "-- كل بوابات الدفع --",
            "all_trans_option": "-- كل أنواع العمليات --",
            "all_cats_option": "-- كل التصنيفات --",

            // Password Security
            "change_pass_title": "تغيير كلمة المرور",
            "must_change_pass_alert": "⚠️ يرجى تغيير كلمة المرور الخاصة بك للمتابعة لأسباب أمنية",
            "current_pass_lbl": "كلمة المرور الحالية",
            "new_pass_lbl": "كلمة المرور الجديدة (8 خانات على الأقل)",
            "confirm_new_pass_lbl": "تأكيد كلمة المرور الجديدة",
            "btn_change_pass": "تحديث كلمة المرور",
            "pass_mismatch_err": "كلمتا المرور غير متطابقتين",
            "pass_len_err": "كلمة المرور الجديدة يجب ألا تقل عن 8 خانات",
            "pass_changed_success": "تم تغيير كلمة المرور بنجاح",
            "btn_change_password_sidebar": "تغيير كلمة المرور",

            // Admin & Live Alerts
            "only_you": "أنت فقط",
            "banner_saved_alert": "تم تحديث شريط التنبيه العام فوراً",
            "user_updated_alert": "تم تحديث بيانات وصلاحيات الموظف",
            "issue_added_alert": "تمت إضافة المشكلة بنجاح",
            "canned_saved_alert": "تم حفظ الرد التلقائي",
            "account_created_alert": "تم إنشاء الحساب بنجاح",
            "rules_updated_title": "تم التحديث",
            "rules_updated_desc": "تم تطبيق القواعد الجديدة على جميع التذاكر القادمة",
            "no_audit_logs": "لا توجد سجلات تدقيق لتصديرها",
            "sla_settings_saved_title": "تم حفظ إعدادات الـ SLA",
            "sla_settings_saved_desc": "تم تطبيق السياسات وساعات الاستجابة الجديدة بنجاح",
            "no_notif": "لا توجد إشعارات حالياً",
            "dashboard_page_title": "لوحة العمليات | OrbexDesk v6.0",

            // High Priority & Enhancements Keys
            "filter_all_depts": "كل الأقسام",
            "bulk_assign_placeholder": "-- إسناد لموظف --",
            "bulk_apply_assign": "إسناد",
            "page_prev": "السابق",
            "page_next": "التالي",
            "page_showing": "عرض",
            "page_of": "من أصل",
            "page_per_page": "تذكرة / صفحة",
            "page_all": "عرض الكل",
            "admin_deleted_card_title": "♻️ سلة المحذوفات والأرشيف الرقابي (Soft-Deleted Tickets)",
            "admin_deleted_card_desc": "التذاكر التي تم حذفها تُحفظ في الأرشيف الرقابي لمنع ضياع البيانات المالية، ويمكن للمشرف العام استرجاعها في أي وقت.",
            "th_deleted_by": "حُذف بواسطة",
            "th_deleted_at": "توقيت الحذف",
            "btn_restore_ticket": "استرجاع",
            "no_deleted_tickets": "لا توجد تذاكر محذوفة في الأرشيف حالياً",
            "ticket_restored_alert": "تم استرجاع التيكت بنجاح وإعادته للوحة العمليات",
            "confirm_restore_ticket": "هل تريد استرجاع هذا التيكت وإعادته للقسم المعني؟",
            "search_logs_placeholder": "🔍 بحث في السجل الأمني: اسم المستخدم، نوع الإجراء، التفاصيل، أو عنوان الـ IP...",
            "handover_banner_prefix": "📌 ملاحظة تسليم الشفت القادم:",
            "reply_saved_toast": "تم حفظ الرد وتحديث التيكت بنجاح",

            // UI/UX Modernization Keys
            "quick_peek_title": "معاينة سريعة للتيكت",
            "quick_peek_btn": "معاينة",
            "quick_peek_open_full": "فتح صفحة المعالجة الكاملة",
            "quick_peek_assign_me": "استلام فوري (إسناد لنفسي)",
            "quick_peek_latest_activity": "آخر التحديثات والملاحظات",
            "quick_peek_quick_note_placeholder": "أضف ملاحظة داخلية سريعة دون مغادرة اللوحة...",
            "quick_peek_send_note": "إرسال الملاحظة",
            "quick_peek_no_activity": "لا توجد ردود مسجلة بعد",
            "kpi_click_hint_all": "اضغط لعرض كل التذاكر",
            "kpi_click_hint_open": "اضغط لتصفية التذاكر المفتوحة",
            "kpi_click_hint_progress": "اضغط لتصفية التذاكر قيد المعالجة",
            "kpi_click_hint_resolved": "اضغط لتصفية التذاكر المنجزة",
            "empty_state_sub": "جرّب تعديل كلمات البحث أو إعادة ضبط الفلاتر لعرض كافة التذاكر النشطة.",
            "btn_reset_all_filters": "إعادة ضبط جميع الفلاتر",
            "toggle_sidebar_tooltip": "طي / توسيع القائمة الجانبية",
            "shortcuts_title": "⌨️ اختصارات لوحة المفاتيح السريعة",
            "sc_search": "التركيز الفوري في شريط البحث",
            "sc_new_ticket": "فتح نافذة تيكت جديد فوراً",
            "sc_send_reply": "إرسال الرد السريع داخل التذكرة",
            "sc_close_drawer": "إغلاق النوافذ المنبثقة أو المعاينة",
            "canned_search_placeholder": "🔍 فلترة الردود السريعة...",
            "internal_note_mode_active": "🔒 وضع الملاحظة الداخلية السرية مفعّل — لن يظهر هذا الرد إلا لفريق العمل الداخلي",
            "copy_done": "تم النسخ",
            "filter_all_agents": "كل الموظفين",
            "filter_unassigned_only": "غير مسند لموظف",
            "analytics_subtitle": "مؤشرات الأداء اللحظية، كفاءة الاستجابة، وتحليل ضغط العمل المالي",
            "analytics_filter_dept_lbl": "فلتر القسم",
            "analytics_filter_agent_lbl": "فلتر اسم الموظف",
            "analytics_filter_kpi_lbl": "نطاق الحالة (KPI)",
            "analytics_kpi_all": "كل التذاكر (إجمالي)",
            "analytics_kpi_open": "التذاكر المفتوحة وبانتظار الاعتماد",
            "analytics_kpi_progress": "التذاكر قيد المعالجة",
            "analytics_kpi_resolved": "التذاكر المنجزة والمغلقة",
            "analytics_ins_sla_title": "معدل الامتثال للـ SLA",
            "analytics_ins_mttr_title": "متوسط سرعة الحل (MTTR)",
            "analytics_ins_vol_title": "الحجم المالي للتذاكر",
            "analytics_ins_esc_title": "التصعيدات وتسليم الشفت",
            "analytics_esc_short": "تصعيد SLA",
            "analytics_handover_short": "تسليم شفت",
            "analytics_chart_priority_title": "توزيع الحالات والأولويات الحرجة",
            "analytics_chart_priority_sub": "تفصيل التذاكر النشطة حسب درجة الأهمية والحالة",
            "th_rank": "الترتيب",
            "th_in_progress": "قيد العمل",
            "th_breached": "تجاوز SLA",
            "leaderboard_filter_agent_hint": "اضغط لتصفية التحليلات على هذا الموظف",
            "analytics_active_filter_badge": "فلتر نشط",
            "analytics_no_data": "لا توجد بيانات مطابقة للفلاتر المحددة",
            "login_otp_badge": "دخول آمن عبر رمز التحقق (OTP)",
            "login_email_subheading": "أدخل بريدك الإلكتروني الوظيفي لإرسال رمز التحقق الفوري (OTP)",
            "login_2fa_subheading": "أدخل البريد الإلكتروني وكلمة المرور لإرسال رمز التحقق الثنائي (2FA OTP)",
            "email_login_label": "البريد الإلكتروني الوظيفي",
            "email_login_placeholder": "name@company.com",
            "send_otp_btn": "إرسال رمز التحقق (OTP)",
            "otp_step_badge": "الخطوة 2: تأكيد الرمز",
            "otp_change_email": "تغيير البريد",
            "otp_verify_heading": "أدخل رمز التحقق (OTP)",
            "otp_sent_to_prefix": "تم إرسال رمز مكون من 6 أرقام إلى:",
            "otp_autofill_btn": "تعبئة تلقائية",
            "otp_expires_in": "صلاحية الرمز:",
            "otp_resend_btn": "إعادة إرسال الرمز",
            "otp_verify_btn": "تأكيد الرمز والدخول للنظام",
            "otp_resent_title": "تم إعادة إرسال رمز التحقق",
            "otp_incomplete_err": "يرجى إدخال رمز التحقق المكون من 6 أرقام كاملاً",
            "admin_user_email": "البريد الإلكتروني الوظيفي (لتسجيل الدخول)",
            "admin_username_optional": "اسم المستخدم (اختياري)",
            "admin_password_optional": "كلمة المرور (Firebase Auth)",
            "th_admin_email": "البريد الإلكتروني (معرّف الدخول)",
            "admin_otp_card_title": "إعدادات الحسابات والمصادقة (Google Firebase)",
            "admin_otp_card_desc": "إدارة مصادقة الموظفين السحابية عبر Google Firebase Authentication.",
            "admin_auth_mode_lbl": "آلية المصادقة:"
        },
        en: {
            // General & Common
            "app_title": "OrbexDesk | Ticketing & Operations System",
            "app_subtitle": "Internal Operations & Ticket Management System",
            "lang_btn_text": "العربية",
            "lang_btn_tooltip": "التحويل إلى العربية",
            "dashboard": "Operations Board",
            "back_to_dashboard": "Back to Tickets",
            "logout": "Logout",
            "dark_mode_title": "Dark / Light Mode",
            "sound_alerts_title": "Sound Alerts",
            "online_now": "Online Now",
            "admin_announcement": "Admin Announcement",
            "search_placeholder": "Search by ID, account, ref, or DPAN...",
            "reset_filters": "Reset Filters",
            "quick_shortcut": "Quick shortcut: Press Alt + N to open a new ticket",
            "filter_all_psps": "All Gateways (PSP)",
            "filter_all_trans": "All Transactions",
            "filter_all_status": "All Statuses",
            "filter_all_priorities": "All Priorities",
            "notifications_title": "🔔 Department & Task Notifications",
            "enable_desktop_notif": "Enable Desktop Alerts",
            "clear_all_notifs": "Clear & mark all as read",
            "no_notifs": "No notifications right now",
            "empty": "Empty",
            "actions": "Actions",
            "action": "Action",
            "open": "Open",
            "edit": "Edit",
            "delete": "Delete",
            "save": "Save",
            "cancel": "Cancel",
            "confirm": "Confirm",
            "success": "Success",
            "error": "Error",
            "notice": "Notice",
            "yes": "Yes",
            "no": "No",
            "copy": "Copy",
            "copied": "Copied",
            "unassigned": "Unassigned",
            "required_mark": "*",

            // Login Page (index.html)
            "login_portal_title": "Login Portal | OrbexDesk System",
            "login_side_desc": "Centralized platform for managing departmental requests, processing client transactions, and monitoring SLA metrics over a secure intranet.",
            "login_encrypted_badge": "Secure encrypted connection (JWT)",
            "login_heading": "Sign In",
            "login_subheading": "Enter your work credentials to proceed",
            "username_label": "Username",
            "username_placeholder": "e.g., admin",
            "password_label": "Password",
            "password_placeholder": "••••••••",
            "login_btn": "Sign In to System",
            "login_verifying": "Authenticating...",
            "login_failed": "Login Failed",
            "network_error": "Could not connect to central server",

            // Sidebar Tabs (dashboard.html)
            "tab_all_tickets": "All Tickets Table",
            "tab_kanban": "Kanban Board",
            "tab_handover": "Shift Handover",
            "tab_approval": "Pending Approval",
            "tab_analytics": "Analytics & Performance",
            "tab_admin": "Admin Control Center",

            // Top Bar & KPIs (dashboard.html)
            "top_bar_title": "Financial Operations & Ticket Management Center",
            "btn_new_ticket": "New Ticket",
            "btn_csv_import": "CSV",
            "btn_excel_export": "Excel",
            "kpi_total_title": "Total Tickets Recorded",
            "kpi_open_title": "Open & Pending Tickets",
            "kpi_progress_title": "Currently In Progress",
            "kpi_resolved_title": "Resolved & Closed",

            // Statuses & Priorities
            "status_open": "Open",
            "status_in_progress": "In Progress",
            "status_pending": "Pending Customer",
            "status_pending_approval": "🛡️ Pending Approval",
            "status_resolved": "Resolved",
            "status_closed": "Closed",
            "priority_urgent": "🔥 Urgent",
            "priority_high": "High",
            "priority_medium": "Medium",
            "priority_low": "Low",

            // SLA Badges & Live Status
            "sla_completed_ontime": "✅ Completed (On-Time)",
            "sla_completed_late": "⚠️ Completed (Overdue SLA)",
            "sla_completed": "Completed",
            "sla_paused_approval": "⏸️ Paused (Pending Approval)",
            "sla_paused_customer": "⏸️ Paused (Pending Customer)",
            "sla_paused": "⏸️ Paused",
            "sla_overdue": "🔥 Overdue",
            "sla_remaining": "⏳ Left",
            "sla_remaining_header": "Left",
            "time_day_short": "d",
            "time_hour_short": "h",
            "time_minute_short": "m",
            "badge_handover": "📌 Handover",
            "badge_master_sub": "Sub-ticket of #",
            "badge_escalated": "🚨 Escalated",

            // Table Headers (dashboard.html)
            "th_seq": "#",
            "th_ticket_issue": "Title / Issue",
            "th_client_account": "Client Account",
            "th_psp_amount": "PSP & Amount",
            "th_client_email": "Client & Email",
            "th_amount_currency": "Amount & Currency",
            "th_ref_dpan": "Ref / DPAN",
            "th_dept_agent": "Dept & Agent",
            "th_status": "Status",
            "th_sla": "SLA Timer",
            "th_action": "Action",
            "no_matching_tickets": "No matching tickets found",

            // Bulk Actions Toolbar (dashboard.html)
            "bulk_selected_prefix": "Selected",
            "bulk_selected_suffix": "tickets",
            "bulk_selected_count": "ticket(s) selected",
            "bulk_status_placeholder": "-- Change Status --",
            "bulk_apply_status": "Apply Status",
            "bulk_link_master_placeholder": "Master Ticket #",
            "bulk_apply_link": "Link to Master",
            "bulk_delete": "Bulk Delete",
            "filter_status_pending_sla": "Pending Customer (SLA Paused)",
            "reset_filters_tooltip": "Reset Filters",
            "search_dashboard_placeholder": "🔍 Search: Ticket #, Account, TXID, Email...",
            "kanban_account_label": "Account:",
            "kanban_empty": "Empty",
            "role_admin": "Admin",
            "role_agent": "Agent",
            "role_employee": "Employee",
            "dept_general": "General",
            "outage_admin_memo": "Admin Notice",

            // Kanban Columns (dashboard.html)
            "kanban_open_col": "📥 New & Open Tickets",
            "kanban_progress_col": "⚡ In Progress",
            "kanban_pending_col": "⏸️ Pending Customer",
            "kanban_resolved_col": "✅ Resolved & Done",

            // Ticket Modal (dashboard.html)
            "modal_create_ticket_title": "Create New Operational Ticket",
            "sec_1_routing": "1. Routing & Standard Ticket Title",
            "lbl_dept": "Target Department",
            "lbl_issue_cat": "Main Issue Category",
            "lbl_priority": "Priority",
            "lbl_ticket_title": "Short Ticket Title",
            "opt_select_title": "-- Select issue from list or custom entry --",
            "opt_manual_entry": "✍️ Custom Manual Title...",
            "placeholder_manual_title": "Enter custom ticket title here...",
            "lbl_master_ticket": "Link to Master Ticket (Master #)",
            "placeholder_master_ticket": "Optional (e.g., 5)",
            "sec_2_fintech": "2. Client & Payment Gateway Details (FinTech & PSP)",
            "lbl_client_account": "Client Account No. (MT4/MT5)",
            "placeholder_client_acc": "e.g., 805412",
            "lbl_client_email": "Client Email",
            "lbl_trans_type": "Transaction Type",
            "lbl_psp": "Payment Gateway (PSP)",
            "lbl_amount": "Amount",
            "lbl_currency": "Currency",
            "lbl_ref": "Transaction Ref / TXID (up to 6 digits matched)",
            "placeholder_ref": "Transaction ID or TXID",
            "lbl_dpan": "Last 4 Card Digits / DPAN",
            "placeholder_dpan": "e.g., 4219",
            "sec_3_details": "3. Detailed Description & Attachments (Supports Ctrl+V)",
            "placeholder_description": "Enter all details or error logs here... (Press Ctrl+V to paste screenshot directly)",
            "paste_zone_hint": "Click to select file or press (Ctrl + V) to paste screenshot",
            "btn_submit_ticket": "Save & Submit Ticket",

            // CSV Modal (dashboard.html)
            "modal_csv_title": "Bulk Ticket Import via CSV File",
            "csv_instructions": "Upload CSV with columns: client_account,amount,currency,psp_name,transaction_ref,title",
            "lbl_csv_dept": "Assign imported tickets to department:",
            "btn_start_csv_import": "Start Import & Generate Tickets",

            // Analytics (dashboard.html)
            "chart_sla_compliance": "SLA Compliance Rate",
            "chart_sla_met": "Within SLA ✅",
            "chart_sla_breached": "Breached 🚨",
            "chart_dept_dist": "Tickets Distribution by Department",
            "chart_psp_dist": "Tickets Distribution by Gateway",
            "perf_table_title": "Agent Performance & Mean Time to Resolution (MTTR)",
            "th_agent_dept": "Agent & Department",
            "th_assigned": "Assigned",
            "th_resolved": "Resolved",
            "th_completion_rate": "Completion Rate",
            "th_sla_rate": "SLA Adherence",
            "th_mttr": "Avg Resolution Time (MTTR)",
            "mttr_minutes": "mins",
            "none": "None",

            // Ticket Details (ticket.html)
            "ticket_page_title": "Ticket Processing | OrbexDesk v6.0",
            "print_audit_pdf": "Print Audit Slip (PDF / Audit)",
            "viewers_banner_title": "Currently viewing this ticket:",
            "viewers_only_you": "Only you",
            "approval_card_title": "Supervisor Approval Required (Maker-Checker)",
            "approval_card_desc": "This transaction is sensitive and awaits supervisor authorization.",
            "btn_approve": "✔️ Approve & Authorize",
            "btn_reject": "❌ Reject & Close",
            "client_financial_heading": "Client & Financial Information",
            "lbl_txid_smart": "Transaction Ref / TXID (Smart Check)",
            "lbl_current_dept": "Current Department:",
            "lbl_assigned_agent": "Assigned Agent:",
            "lbl_created_by": "Created By:",
            "lbl_sla_due_time": "SLA Due Time:",
            "lbl_sla_indicator": "SLA Indicator:",
            "agent_panel_heading": "Automation & Department Transfers",
            "btn_assign_me": "Assign Ticket to Myself",
            "btn_auto_dealing": "Approve Dealing & Auto-Transfer to Back Office",
            "btn_toggle_handover": "Add / Remove Shift Handover",
            "lbl_transfer_to_dept": "Transfer ticket to another department:",
            "btn_do_transfer": "Transfer",
            "client_history_heading": "Client Ticket History",
            "checking_history": "Checking history...",
            "no_prev_tickets": "No previous tickets for this client",
            "no_acc_number": "No account number",
            "timeline_heading": "Processing History & IP-Logged Audit Timeline",
            "quick_canned_prefix": "Quick Replies:",
            "reply_placeholder": "Type reply here... (Press Ctrl+Enter to send, or Ctrl+V to paste screenshot)",
            "mention_placeholder": "@ Mention colleague...",
            "opt_public_reply": "📢 Public Reply",
            "opt_internal_note": "🔒 Internal Note",
            "opt_keep_status": "-- Keep Status --",
            "btn_send_reply": "Send Reply",
            "view_attachment": "View Attachment:",
            "linked_subtickets_heading": "🔗 Linked Sub-Tickets for this Master Ticket:",

            // Admin Control Center (admin.html)
            "admin_page_title": "System Administration & Control Center | OrbexDesk v6.0",
            "admin_sidebar_brand": "System Admin v6.0",
            "admin_tab_1": "1. Employees & Roles",
            "admin_tab_2": "2. Departments & SLA Hours",
            "admin_tab_3": "3. Preset Issues & Titles",
            "admin_tab_4": "4. Canned Responses",
            "admin_tab_5": "5. Gateways & Dynamic Lists",
            "admin_tab_6": "6. Outage Banner & Backup",
            "admin_tab_7": "7. Security & IP Audit Logs",
            "admin_tab_8": "8. Rules Engine & Audits",

            "admin_users_heading": "👥 Employee Accounts & Permissions Matrix",
            "admin_add_user": "Add New Employee",
            "admin_fullname": "Full Name",
            "admin_username": "Username",
            "admin_password": "Password",
            "admin_role": "Job Role",
            "admin_role_employee": "Standard Employee (Creates Tickets)",
            "admin_role_agent": "Department Agent (Agent)",
            "admin_role_admin": "System Administrator (Admin)",
            "admin_user_dept": "Assigned Department:",
            "admin_granular_perms": "Granular Permissions:",
            "admin_perm_export": "Export Excel Reports",
            "admin_perm_approve": "Approve Transactions (Maker-Checker)",
            "admin_perm_view_all": "View All Departments' Tickets",
            "admin_perm_delete": "Delete Tickets Permission",
            "admin_btn_create_user": "Create Account & Apply Permissions",
            "admin_users_register": "Current Employee Register",
            "th_admin_name": "Name",
            "th_admin_username": "Username",
            "th_admin_role_dept": "Role & Department",
            "th_admin_perms": "Permissions",
            "th_admin_actions": "Actions",

            "admin_depts_heading": "🏢 Department Management & Standard Response Times (SLA Settings)",
            "admin_add_dept": "Add New Department",
            "admin_dept_name": "Department Name",
            "admin_dept_sla": "Standard SLA Hours",
            "admin_btn_add_dept": "Add Department",
            "admin_depts_list": "Current Departments & SLA Hours",
            "th_dept_id": "#",
            "th_dept_name": "Department Name",
            "th_dept_sla": "SLA Hours",

            "admin_sla_engine_heading": "SLA Engine Settings, Priorities, Pause & Escalation Policies",
            "admin_recalc_original": "Recalculate SLA (From Creation Time)",
            "admin_recalc_now": "Reset & Refresh Active Tickets SLA (From Now)",
            "admin_sla_mode_label": "SLA Calculation Mode when Ticket is Opened:",
            "admin_sla_mode_hybrid": "⚡ Smart Hybrid (Default): Uses Department SLA for Medium, applies priority hours for Urgent / High / Low",
            "admin_sla_mode_dept": "🏢 Department Only: Always adheres strictly to Department SLA regardless of priority",
            "admin_sla_mode_prio": "🔥 Priority Only: Always adheres strictly to Priority hours across all departments",
            "admin_sla_urgent_label": "🔥 Urgent Priority (Hours)",
            "admin_sla_high_label": "⚡ High Priority (Hours)",
            "admin_sla_medium_label": "📌 Medium Priority (Hours)",
            "admin_sla_low_label": "⏳ Low Priority (Hours)",
            "admin_sla_policies_heading": "Pause, Transfer & Auto-Escalation Policies:",
            "admin_sla_pause_pending": "⏸️ Pause SLA during (Pending Customer) status and compensate time on resume",
            "admin_sla_pause_approval": "🛡️ Pause SLA while awaiting Supervisor Approval (Maker-Checker) and start timer upon authorization",
            "admin_sla_reset_transfer": "🔄 Grant fresh SLA window based on target department upon ticket transfer",
            "admin_sla_auto_escalate": "🚨 Enable Auto-Escalation for overdue tickets and notify management",
            "admin_btn_save_sla": "Save & Broadcast SLA Settings",

            "admin_issues_heading": "📋 Preset Ticket Issues & Standard Titles",
            "admin_add_issue": "Add New Preset Issue to List",
            "admin_issue_cat": "Main Category",
            "admin_issue_title": "Standard Issue Title",
            "admin_issue_trans": "Default Transaction Type",
            "admin_btn_add_issue": "Add Issue to Presets",
            "admin_issues_current": "Current Preset Issues List",

            "admin_canned_heading": "⚡ Quick Canned Responses Management",
            "admin_add_canned": "Add New Canned Response Button",
            "admin_canned_label": "Short Button Label",
            "admin_canned_content": "Full Reply Content",
            "admin_btn_add_canned": "Save Canned Response",

            "admin_lists_heading": "💳 Manage Payment Gateways (PSPs), Transaction Types, Currencies & Categories",
            "admin_lists_psp": "Payment Gateways (PSPs)",
            "admin_placeholder_psp": "New payment gateway name...",
            "admin_lists_trans": "Financial Transaction Types",
            "admin_placeholder_trans": "New transaction type...",
            "admin_lists_curr": "Supported Currencies",
            "admin_placeholder_curr": "Currency code...",
            "admin_lists_cat": "Main Issue Categories",
            "admin_placeholder_cat": "New main category...",

            "admin_banner_backup_heading": "🚨 Global Outage Banner + Database Backup",
            "admin_banner_card_title": "Publish Global Outage Alert Banner to All Staff",
            "admin_banner_card_desc": "This banner appears immediately at the top of the operations board for all staff to alert them of any payment gateway downtime or delays.",
            "admin_banner_text_label": "Announcement / Alert Text",
            "admin_banner_text_placeholder": "e.g., ⚠️ Notice: General delay currently reported with Visa gateway, coordinating with provider...",
            "admin_banner_type_label": "Banner Style",
            "admin_banner_opt_warning": "🟡 Warning (Yellow)",
            "admin_banner_opt_danger": "🔴 Emergency / Outage (Red)",
            "admin_banner_opt_info": "🔵 General Info (Blue)",
            "admin_banner_active_label": "Enable and display banner to all now",
            "admin_btn_save_banner": "Save & Broadcast Banner Now",
            "admin_backup_card_title": "Database Backup & Data Protection",
            "admin_backup_card_desc": "The server automatically takes daily backups in the backups/ folder, and you can also download a complete snapshot (.db) at any time.",
            "admin_btn_download_backup": "Download Full Database Backup (.db)",

            "admin_logs_heading": "🛡️ Security & IP Audit Logs",
            "th_log_datetime": "Date & Time",
            "th_log_user": "User",
            "th_log_action": "Action Type",
            "th_log_details": "Details",
            "th_log_ip": "Local IP Address",

            "admin_rules_heading": "⚙️ Business Rules Engine & Financial Audit",
            "admin_rules_card_title": "Dual Approval Rules (Maker-Checker)",
            "admin_rules_card_desc": "Any ticket exceeding this amount or containing sensitive keywords will be frozen and require supervisor approval immediately.",
            "admin_rule_amount_label": "Financial Approval Limit",
            "admin_rule_keywords_label": "Sensitive Keywords (comma-separated)",
            "admin_rule_keywords_placeholder": "e.g., balance reset, manual payout, settlement",
            "admin_btn_save_rules": "Update & Apply Rules Immediately",
            "admin_audit_card_title": "Export Audit Trail Reports",
            "admin_audit_card_desc": "Export a complete log of all approval and rejection decisions executed via Maker-Checker for audit or compliance matching.",
            "admin_btn_export_audit": "Download Audit Report (Excel/CSV)",
            "admin_audit_notice": "Report includes authorizing employee, device IP, exact timestamp, and decision details.",

            "admin_modal_edit_user": "Edit Employee Data & Permissions",
            "admin_modal_new_pass_hint": "New Password (leave empty to keep unchanged)",
            "admin_modal_btn_save_user": "Save Changes",

            // Additional keys for comprehensive coverage
            "btn_add": "Add",
            "outage_official_notice": "Official Notice",
            "modal_new_ticket_title": "Open New Operational / Financial Ticket",
            "priority_low_default": "Low (24 hours)",
            "priority_medium_default": "Medium (4 hours)",
            "priority_high_default": "High (2 hours)",
            "priority_urgent_default": "🔥 Urgent (1 hour)",
            "smart_duplicate_warning": "⚠️ Smart Duplicate Alert! Open ticket exists for same client or matching last TXID digits:",
            "ticket_number_prefix": "Ticket #",
            "ref_prefix": "Ref:",
            "alert_select_value_first": "Please select a value first",
            "alert_bulk_done": "Bulk action completed successfully",
            "alert_fill_required": "Please fill in department, ticket title, and description",
            "alert_ticket_created": "Ticket created and department notified",
            "alert_send_error": "Submission Error",
            "alert_unexpected_error": "An unexpected error occurred",
            "alert_select_csv": "Please select a CSV file first",
            "alert_csv_imported": "Import Successful",
            "clipboard_screenshot_captured": "✅ Screenshot captured from clipboard (Ctrl+V)",
            "csv_default_psp": "Unspecified",
            "csv_default_title": "Review Imported Transaction",
            "dept_general_management": "General Management",
            "copy_tooltip": "Copy",
            "mention_colleague_tooltip": "Mention colleague @Mention",
            "copied_to_clipboard": "Copied: ",
            "view": "View",
            "dealing_approved_auto": "Dealing approved & ticket auto-transferred to Back Office",
            "dept_transfer_note_title": "Department Transfer Note",
            "dept_transfer_note_placeholder": "Write transfer reason or instructions for the department...",
            "handover_note_title": "Next Shift Handover Note",
            "handover_note_placeholder": "What should the next shift agent follow up on?",
            "approval_note_title": "Approval Note",
            "rejection_reason_title": "Rejection Reason",
            "confirm_delete_issue": "Delete this issue?",
            "confirm_delete_canned": "Delete this quick reply?",
            "confirm_delete_item": "Delete this item?",
            "confirm_delete_dept": "Delete this department?",
            "confirm_delete_user": "Delete this user?",
            "sla_reset_confirm": "SLA counters will be reset for all currently active tickets with a new window starting now based on department & priority settings. Are you sure?",
            "sla_recalc_confirm": "SLA due time will be recalculated for all active tickets based on original creation time and current department/priority settings. Do you want to proceed?",
            "sla_reset_title": "Reset & Renew SLA Counters",
            "sla_recalc_title": "Recalculate SLA",
            "yes_execute": "Yes, Execute Now",
            "sla_preview_target": "Target SLA Window:",
            "hours_unit": "hours",
            "hour_singular": "hour",
            "hours_suffix_short": "h SLA",
            "edit_dept_sla_title": "Edit Department & SLA Hours",
            "dept_name_label": "Department Name",
            "sla_hours_label": "SLA Hours",
            "recalc_open_tickets": "Recalculate SLA for open tickets in this department",
            "save_changes": "Save Changes",
            "edit_issue_title": "Edit Standard Issue",
            "edit_canned_title": "Edit Canned Quick Reply",
            "edit_value_title": "Edit Value",
            "reply_screenshot_ready": "📸 Screenshot attached from clipboard (Ctrl+V) ready to send",
            "no_windows_notif": "Browser does not support desktop notifications",
            "windows_notif_enabled": "Desktop pop-up notifications enabled",
            "all_psps_option": "-- All Payment Gateways --",
            "all_trans_option": "-- All Transaction Types --",
            "all_cats_option": "-- All Categories --",

            // Password Security
            "change_pass_title": "Change Password",
            "must_change_pass_alert": "⚠️ You must change your password to continue for security reasons",
            "current_pass_lbl": "Current Password",
            "new_pass_lbl": "New Password (min 8 characters)",
            "confirm_new_pass_lbl": "Confirm New Password",
            "btn_change_pass": "Update Password",
            "pass_mismatch_err": "Passwords do not match",
            "pass_len_err": "New password must be at least 8 characters",
            "pass_changed_success": "Password changed successfully",
            "btn_change_password_sidebar": "Change Password",

            // Admin & Live Alerts
            "only_you": "Only you",
            "banner_saved_alert": "System announcement banner updated immediately",
            "user_updated_alert": "Employee details and permissions updated",
            "issue_added_alert": "Standard issue added successfully",
            "canned_saved_alert": "Canned quick reply saved",
            "account_created_alert": "Account created successfully",
            "rules_updated_title": "Updated",
            "rules_updated_desc": "New rules applied to all incoming tickets",
            "no_audit_logs": "No audit logs found to export",
            "sla_settings_saved_title": "SLA Settings Saved",
            "sla_settings_saved_desc": "New SLA policies and response hours applied successfully",
            "no_notif": "No current notifications",
            "dashboard_page_title": "Operations Board | OrbexDesk v6.0",

            // High Priority & Enhancements Keys
            "filter_all_depts": "All Departments",
            "bulk_assign_placeholder": "-- Assign to Agent --",
            "bulk_apply_assign": "Assign",
            "page_prev": "Previous",
            "page_next": "Next",
            "page_showing": "Showing",
            "page_of": "of",
            "page_per_page": "per page",
            "page_all": "Show All",
            "admin_deleted_card_title": "♻️ Soft-Deleted Tickets & Audit Archive (Recycle Bin)",
            "admin_deleted_card_desc": "Deleted tickets are safely preserved in the audit archive to prevent financial data loss and can be restored anytime.",
            "th_deleted_by": "Deleted By",
            "th_deleted_at": "Deleted At",
            "btn_restore_ticket": "Restore",
            "no_deleted_tickets": "No soft-deleted tickets in the archive",
            "ticket_restored_alert": "Ticket restored successfully to active operations",
            "confirm_restore_ticket": "Do you want to restore this ticket to active operations?",
            "search_logs_placeholder": "🔍 Filter security logs: username, action, details, or IP address...",
            "handover_banner_prefix": "📌 Shift Handover Note:",
            "reply_saved_toast": "Reply saved & ticket updated",

            // UI/UX Modernization Keys
            "quick_peek_title": "Ticket Quick Preview",
            "quick_peek_btn": "Preview",
            "quick_peek_open_full": "Open Full Workspace",
            "quick_peek_assign_me": "Claim Ticket (Assign to Me)",
            "quick_peek_latest_activity": "Recent Timeline Activity",
            "quick_peek_quick_note_placeholder": "Write a quick internal note without leaving the board...",
            "quick_peek_send_note": "Save Note",
            "quick_peek_no_activity": "No timeline entries yet",
            "kpi_click_hint_all": "Click to show all tickets",
            "kpi_click_hint_open": "Click to filter open tickets",
            "kpi_click_hint_progress": "Click to filter in-progress tickets",
            "kpi_click_hint_resolved": "Click to filter resolved tickets",
            "empty_state_sub": "Try adjusting your search keywords or reset active filters to view all tickets.",
            "btn_reset_all_filters": "Reset All Filters",
            "toggle_sidebar_tooltip": "Collapse / Expand Sidebar",
            "shortcuts_title": "⌨️ Keyboard Productivity Shortcuts",
            "sc_search": "Focus search input immediately",
            "sc_new_ticket": "Open new ticket modal immediately",
            "sc_send_reply": "Submit reply inside ticket view",
            "sc_close_drawer": "Close active modal or preview drawer",
            "canned_search_placeholder": "🔍 Filter canned replies...",
            "internal_note_mode_active": "🔒 Confidential Internal Note Mode Active — Visible only to internal staff",
            "copy_done": "Copied",
            "filter_all_agents": "All Employees",
            "filter_unassigned_only": "Unassigned Only",
            "analytics_subtitle": "Real-time SLA intelligence, operational workload, and financial throughput",
            "analytics_filter_dept_lbl": "Department Filter",
            "analytics_filter_agent_lbl": "Employee Name Filter",
            "analytics_filter_kpi_lbl": "Status Scope (KPI)",
            "analytics_kpi_all": "All Tickets (Total)",
            "analytics_kpi_open": "Open & Pending Approval",
            "analytics_kpi_progress": "Currently In Progress",
            "analytics_kpi_resolved": "Resolved & Closed",
            "analytics_ins_sla_title": "SLA Compliance Rate",
            "analytics_ins_mttr_title": "Avg Resolution Speed (MTTR)",
            "analytics_ins_vol_title": "Total Financial Volume",
            "analytics_ins_esc_title": "Escalations & Handovers",
            "analytics_esc_short": "Escalated",
            "analytics_handover_short": "Handover",
            "analytics_chart_priority_title": "Priority & Status Breakdown",
            "analytics_chart_priority_sub": "Tickets segmented by urgency and lifecycle stage",
            "th_rank": "Rank",
            "th_in_progress": "In Progress",
            "th_breached": "SLA Breached",
            "leaderboard_filter_agent_hint": "Click to filter analytics by this employee",
            "analytics_active_filter_badge": "Active Filter",
            "analytics_no_data": "No data matching the selected filters",
            "login_otp_badge": "Secure Email OTP Authentication",
            "login_email_subheading": "Enter your work email address to receive an instant 6-digit OTP code",
            "login_2fa_subheading": "Enter your work email and password to receive a 2FA OTP code",
            "email_login_label": "Work Email Address",
            "email_login_placeholder": "name@company.com",
            "send_otp_btn": "Send Verification Code (OTP)",
            "otp_step_badge": "Step 2: Verify Code",
            "otp_change_email": "Change Email",
            "otp_verify_heading": "Enter Verification Code (OTP)",
            "otp_sent_to_prefix": "A 6-digit code was sent to:",
            "otp_autofill_btn": "Auto-Fill",
            "otp_expires_in": "Code expires in:",
            "otp_resend_btn": "Resend Code",
            "otp_verify_btn": "Verify Code & Sign In",
            "otp_resent_title": "Verification code resent",
            "otp_incomplete_err": "Please enter the full 6-digit verification code",
            "admin_user_email": "Work Email Address (for Login)",
            "admin_username_optional": "Username (Optional)",
            "admin_password_optional": "Password (Firebase Auth)",
            "th_admin_email": "Work Email (Login ID)",
            "admin_otp_card_title": "Account & Authentication Settings (Google Firebase)",
            "admin_otp_card_desc": "Cloud authentication management via Google Firebase Authentication.",
            "admin_auth_mode_lbl": "Authentication Mode:"
        }
    };

    function getLanguage() {
        return localStorage.getItem(I18N_STORAGE_KEY) || 'ar';
    }

    function t(key, fallback) {
        const lang = getLanguage();
        if (translations[lang] && translations[lang][key] !== undefined) {
            return translations[lang][key];
        }
        if (translations['ar'] && translations['ar'][key] !== undefined) {
            return translations['ar'][key];
        }
        return fallback !== undefined ? fallback : key;
    }

    function applyDirectionAndBootstrap(lang) {
        const isRtl = lang === 'ar';
        document.documentElement.lang = lang;
        document.documentElement.dir = isRtl ? 'rtl' : 'ltr';

        const bCss = document.getElementById('bootstrap-css');
        if (bCss) {
            bCss.href = isRtl
                ? 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.rtl.min.css'
                : 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css';
        }

        let styleEl = document.getElementById('i18n-layout-styles');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'i18n-layout-styles';
            document.head.appendChild(styleEl);
        }

        styleEl.innerHTML = `
            :root {
                --font-mono-num: 'JetBrains Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
            }
            .num-tabular {
                font-variant-numeric: tabular-nums;
                font-family: var(--font-mono-num), 'Cairo', sans-serif;
                letter-spacing: -0.01em;
            }
            .sidebar {
                transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), width 0.25s ease;
            }
            .main-content {
                transition: margin 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            }
            html[dir="ltr"] .sidebar {
                left: 0 !important;
                right: auto !important;
            }
            html[dir="ltr"] .main-content {
                margin-left: 265px !important;
                margin-right: 0 !important;
            }
            /* Collapsible Sidebar Support for RTL & LTR */
            body.sidebar-collapsed .sidebar {
                transform: translateX(100%);
            }
            html[dir="ltr"] body.sidebar-collapsed .sidebar {
                transform: translateX(-100%);
            }
            body.sidebar-collapsed .main-content,
            html[dir="ltr"] body.sidebar-collapsed .main-content {
                margin-right: 0 !important;
                margin-left: 0 !important;
            }
            @media (max-width: 992px) {
                .sidebar {
                    transform: translateX(100%);
                    box-shadow: 0 20px 40px rgba(0,0,0,0.4);
                }
                html[dir="ltr"] .sidebar {
                    transform: translateX(-100%);
                }
                body.sidebar-mobile-open .sidebar,
                html[dir="ltr"] body.sidebar-mobile-open .sidebar {
                    transform: translateX(0);
                }
                .main-content,
                html[dir="ltr"] .main-content {
                    margin-right: 0 !important;
                    margin-left: 0 !important;
                    padding: 15px !important;
                }
            }
            html[dir="ltr"] .section-title {
                border-left: 3px solid #2563eb !important;
                border-right: none !important;
            }
            html[dir="ltr"] .tl-system {
                border-left: 3px solid #2563eb !important;
                border-right: none !important;
            }
            html[dir="ltr"] .online-dot {
                margin-right: 5px !important;
                margin-left: 0 !important;
            }

            /* Skeleton Loading Shimmer */
            @keyframes shimmerPulse {
                0% { background-position: -400px 0; }
                100% { background-position: 400px 0; }
            }
            .skeleton-line {
                height: 14px;
                border-radius: 6px;
                background: linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%);
                background-size: 800px 100%;
                animation: shimmerPulse 1.4s infinite linear;
            }
            body.dark-mode .skeleton-line {
                background: linear-gradient(90deg, #1e293b 25%, #334155 50%, #1e293b 75%);
                background-size: 800px 100%;
            }

            /* Dark mode cohesion across all pages including admin.html */
            body.dark-mode {
                background-color: #0b1120 !important;
                color: #e2e8f0 !important;
            }
            body.dark-mode .card-custom,
            body.dark-mode .top-bar,
            body.dark-mode .kpi-card,
            body.dark-mode .workspace-card,
            body.dark-mode .modal-content,
            body.dark-mode .offcanvas {
                background-color: #1e293b !important;
                color: #f8fafc !important;
                border-color: #334155 !important;
            }
            body.dark-mode .table {
                color: #e2e8f0 !important;
            }
            body.dark-mode .table thead th,
            body.dark-mode .table-light th,
            body.dark-mode .table-light {
                background-color: #0f172a !important;
                color: #94a3b8 !important;
                border-color: #334155 !important;
            }
            body.dark-mode .table tbody td {
                border-color: #334155 !important;
                color: #e2e8f0 !important;
            }
            body.dark-mode .bg-light,
            body.dark-mode .bg-white {
                background-color: #0f172a !important;
                color: #e2e8f0 !important;
                border-color: #334155 !important;
            }
            body.dark-mode .form-control,
            body.dark-mode .form-select {
                background-color: #0f172a !important;
                border-color: #334155 !important;
                color: #f8fafc !important;
            }
            body.dark-mode .btn-light {
                background-color: #1e293b !important;
                border-color: #334155 !important;
                color: #f8fafc !important;
            }
            body.dark-mode .btn-light:hover {
                background-color: #334155 !important;
                border-color: #475569 !important;
                color: #ffffff !important;
            }
            body.dark-mode .dropdown-menu {
                background-color: #1e293b !important;
                border-color: #334155 !important;
                color: #f8fafc !important;
            }
            body.dark-mode .dropdown-item {
                color: #e2e8f0 !important;
            }
            body.dark-mode .dropdown-item:hover, body.dark-mode .dropdown-item:focus {
                background-color: #334155 !important;
                color: #ffffff !important;
            }
        `;
    }

    function updateDOMTranslations() {
        const lang = getLanguage();
        const dict = translations[lang] || translations.ar;

        // Document title if specified
        const titleEl = document.querySelector('title[data-i18n]');
        if (titleEl) {
            const k = titleEl.getAttribute('data-i18n');
            if (dict[k]) document.title = dict[k];
        }

        // Text content
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const k = el.getAttribute('data-i18n');
            if (dict[k] !== undefined) {
                // If element has inner icon or badge, check if only text should be updated
                const icon = el.querySelector('i');
                const badge = el.querySelector('.badge');
                if (icon && !badge && el.children.length === 1) {
                    const textSpan = el.querySelector('.i18n-text');
                    if (textSpan) {
                        textSpan.textContent = dict[k];
                    } else {
                        const iconHtml = icon.outerHTML;
                        el.innerHTML = iconHtml + ' ' + dict[k];
                    }
                } else if (!icon && !badge) {
                    el.textContent = dict[k];
                } else {
                    const textSpan = el.querySelector('.i18n-text');
                    if (textSpan) textSpan.textContent = dict[k];
                }
            }
        });

        // Placeholders
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const k = el.getAttribute('data-i18n-placeholder');
            if (dict[k]) el.placeholder = dict[k];
        });

        // Tooltips / Titles
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const k = el.getAttribute('data-i18n-title');
            if (dict[k]) el.title = dict[k];
        });

        // Update language buttons across UI
        const isEn = lang === 'en';
        // The button displays the ALTERNATE language that clicking will switch to
        const targetLabel = isEn ? 'العربية' : 'English';
        const targetTooltip = isEn ? 'التحويل إلى اللغة العربية' : 'Switch system language to English';

        document.querySelectorAll('.lang-btn-label, #currentLangLabel, #currentLangDisplay, .current-lang-display').forEach(el => {
            el.textContent = targetLabel;
        });
        document.querySelectorAll('#langToggleBtn, .lang-btn-topbar, .lang-toggle-btn, .lang-switch-btn').forEach(btn => {
            btn.title = targetTooltip;
        });
    }

    function setLanguage(newLang) {
        if (newLang !== 'ar' && newLang !== 'en') newLang = 'ar';
        localStorage.setItem(I18N_STORAGE_KEY, newLang);
        applyDirectionAndBootstrap(newLang);
        updateDOMTranslations();

        window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang: newLang } }));
    }

    function toggleLanguage() {
        const current = getLanguage();
        const next = current === 'ar' ? 'en' : 'ar';
        setLanguage(next);
    }

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    window.escapeHtml = escapeHtml;

    // Export functions globally on window for guaranteed access
    window.toggleLanguage = toggleLanguage;
    window.setLanguage = setLanguage;

    // Auto-init on script load
    document.addEventListener('DOMContentLoaded', () => {
        const lang = getLanguage();
        applyDirectionAndBootstrap(lang);
        updateDOMTranslations();
    });

    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        const lang = getLanguage();
        applyDirectionAndBootstrap(lang);
        updateDOMTranslations();
    }

    // Immediate run in case DOM is already loaded or head is ready
    const initialLang = getLanguage();
    applyDirectionAndBootstrap(initialLang);

    window.i18n = {
        getLanguage,
        setLanguage,
        toggleLanguage,
        t,
        escapeHtml,
        translations
    };

})(window);
