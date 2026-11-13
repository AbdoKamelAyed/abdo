// Admin interface strings. Both languages must define exactly the same keys (a test enforces it).
// Placeholders: {name}. Validation messages from the shared validator stay in English.
// Counts: a key written as `key__one`, `key__other` (Arabic also `__two`, `__few`, `__many`) is chosen by Intl.PluralRules
// from the `n` parameter; `__other` is the fallback. Never write "item(s)".

const BASE = {
  en: {
    app_title: 'ABDO Admin', admin: 'Admin', main_navigation: 'Main navigation', load_failed: 'The admin could not load its configuration. Reload the page.',
    nav_overview: 'Overview', nav_articles: 'Articles', nav_projects: 'Projects', nav_profile: 'Profile & CV', nav_media: 'Media', nav_publish: 'Review & publish',
    sign_in: 'Sign in', signing_in: 'Signing in…', sign_out: 'Sign out',
    login_title: 'Sign in to manage the site', login_intro: 'Your access token is checked directly with GitHub, kept in this tab only, and never stored in the site.',
    repo_owner: 'GitHub user or organisation', repo_name: 'Repository', repo_branch: 'Branch', access_token: 'Access token',
    token_hint: 'A fine-grained personal access token for this one repository, with Contents: read and write.', remember_tab: 'Keep me signed in while this tab is open',
    login_missing: 'Fill in the repository, the branch and the access token.',
    token_help_title: 'How do I create a token?', token_help_steps: 'On GitHub open Settings → Developer settings → Personal access tokens → Fine-grained tokens.|Choose “Only select repositories” and pick this site’s repository.|Under Repository permissions set Contents to “Read and write”. Leave everything else off.|Set a short expiry, create the token and paste it here.',
    all_published: 'Nothing unpublished', unpublished_count: '{n} unpublished', restored_changes__one: 'Restored {n} unpublished change from this browser.', restored_changes__other: 'Restored {n} unpublished changes from this browser.', restored_conflicts: '{n} of them changed in the repository since you made them. Review them in Review & publish.',
    public_repo_notice: 'This repository is public. Drafts, hidden blocks and private CV entries stay out of the website but remain readable in the repository files.', write_unknown_notice: 'GitHub did not say whether this token can write. Publishing will tell you.', sample_profile_notice: 'The profile is still sample content.',
    stat_published_articles: 'Published articles', stat_published_projects: 'Published projects', stat_drafts: 'Drafts', stat_scheduled: 'Scheduled', stat_unpublished_changes: 'Unpublished changes', stat_problems: 'Problems to fix',
    by_language: 'Published by language', by_topic: 'Published articles by topic', recent_updates: 'Recent updates', language: 'Language', languages: 'Languages', no_data: 'Nothing to show yet.', untitled: '(untitled)',
    new_article: 'New article', new_project: 'New project', search: 'Search titles', status: 'Status', all: 'All', updated: 'Updated', edit: 'Edit', nothing_here: 'Nothing here.', showing_count: 'Showing {n}', has_unpublished_changes: 'Has unpublished changes', no_translation: 'No translation', back_to_list: 'Back to the list', not_found: 'Not found',
    new_hint: 'You can change everything afterwards. The new item starts as a draft.', title_and_summary_required: 'A title and a short summary are required.', create: 'Create', cancel: 'Cancel', save: 'Save', delete: 'Delete', open: 'Open',
    field_title: 'Title', field_subtitle: 'Subtitle (optional)', field_excerpt: 'Excerpt', field_summary: 'Summary', field_cover: 'Cover image', field_cover_alt: 'Cover image description (optional)', field_role: 'Your role (optional)', field_responsibilities: 'Responsibilities (optional)',
    field_challenge: 'Challenge (optional)', field_process: 'Process (optional)', field_solution: 'Solution (optional)', field_outcome: 'Outcome (optional)', field_name: 'Name', field_headline: 'Headline', field_organization: 'Organisation',
    settings: 'Settings', translation_status: 'Status of this language', published_at: 'Publication date', published_at_hint: 'Required when published. Sets the order on the site.', featured: 'Featured', template: 'Template', template_hint: 'The starting layout of this article. Starting from a template in the Studio sets it too.',
    topics: 'Topics', topics_hint: 'The first selected topic in this list becomes the article’s category.', tags: 'Tags', no_topics: 'No public topics yet.', no_tags: 'No tags yet.', sample_flag: 'Sample content (removed by “exclude samples” builds)', created: 'Created',
    slug: 'URL slug', slug_hint: 'Letters of any language, numbers and single hyphens.', slug_from_title: 'From title', mark_published: 'Mark as published', unpublish: 'Move to draft', add_translation: 'Add {language}', add_translation_title: 'Add a {language} version', remove_translation: 'Remove this language', remove_translation_title: 'Remove this language?', remove_translation_message: 'The {language} version will be removed from this item when you publish.',
    delete_item_title: 'Delete this item?', delete_item_message: '“{name}” will be removed when you publish. Until then you can discard the change.', body: 'Content', seo_overrides: 'Search and sharing overrides', seo_title: 'Page title for search engines', seo_description: 'Description for search engines', seo_robots: 'Search engine indexing',
    default: 'Default', none: 'None', project_status: 'Project progress', pstatus_planned: 'Planned', 'pstatus_in-progress': 'In progress', pstatus_completed: 'Completed', pstatus_paused: 'Paused', start_date: 'Start date', end_date: 'End date', gallery: 'Gallery images', tools: 'Tools and technologies', related_articles: 'Related articles', links: 'Links', add_link: 'Add a link', link_kind: 'Kind', link_label: 'Label', link_url: 'Address',
    kind_email: 'Email', kind_social: 'Social', kind_website: 'Website', kind_experience: 'Experience', kind_education: 'Education', kind_skill: 'Skill', kind_section: 'Section',
    status_idea: 'Idea', status_outline: 'Outline', status_draft: 'Draft', status_editing: 'Editing', status_ready: 'Ready', status_scheduled: 'Scheduled', status_published: 'Published', status_archived: 'Archived', 'status_fact-checking': 'Fact-checking',
    block_paragraph: 'Paragraph', block_heading: 'Heading', block_quote: 'Quote', block_list: 'List', block_image: 'Image', block_callout: 'Callout', block_divider: 'Divider', no_blocks: 'No content yet. Add a block below.', move_up: 'Move up', move_down: 'Move down', hide_block: 'Hide', show_block: 'Show',
    one_per_line: 'One per line.', field_caption: 'Caption (optional)',
    image_hint: 'Upload images in Media first.', divider_note: 'A divider has no settings.',
    problems_title__one: '{n} problem to fix', problems_title__other: '{n} problems to fix', problems_hint: 'These must be fixed before publishing. Messages come from the same checks the site build runs.', warnings_title__one: '{n} warning', warnings_title__other: '{n} warnings',
    identity: 'Identity', biography: 'Biography', profile_photo: 'Profile photo', sample_profile_hint: 'Turn off “sample content” once the profile holds your real information; builds that exclude samples refuse to publish a sample profile.',
    experience: 'Experience', education: 'Education', skills: 'Skills', custom_sections: 'Custom sections', add_entry: 'Add', visibility: 'Visibility', visibility_public: 'Public', visibility_private: 'Private (never published)', start_month: 'Start (month)', end_month: 'End (month)', end_hint: 'Leave empty for “present”.',
    upload: 'Upload images', upload_rules: 'PNG, JPEG, GIF or WebP, up to 8 MB. Files are checked by their content. SVG is not accepted yet.', upload_title: 'Add to the library', alt_text: 'Image description', alt_hint: 'Describe the image for people who cannot see it.', alt_required: 'A description is required in every language.', add_to_library: 'Add to library', upload_done: '{name} is ready to publish.',
    edit_alt: 'Edit descriptions', edit_alt_title: 'Descriptions for {name}', archive: 'Archive', restore: 'Restore', media_active: 'Active', media_archived: 'Archived', unpublished: 'Not published yet', used_count: 'Used {n}×', in_use_cannot: 'Still in use by: {list}. Remove it there first.', delete_media_message: '{name} will be removed from the library when you publish.', no_media: 'No images yet.',
    used_in_profile: 'the profile', used_in_site: 'site settings', used_in_topics: 'a topic', used_in_tags: 'a tag', used_in_homepage: 'the homepage',
    changes_title: 'Changes ({n})', no_changes: 'No unpublished changes.', change_added: 'Added', change_changed: 'Changed', change_deleted: 'Deleted', conflict: 'Changed in the repository too', keep_mine: 'Keep mine', discard_mine: 'Discard mine', conflicts_notice: 'Some files changed in the repository after you started editing them. Choose “Keep mine” to overwrite the repository version with yours, or “Discard mine” to keep the repository version.',
    valid_title: 'Everything is valid', valid_text: 'All content passes the same checks as the site build.', problems_block_publish: 'Publishing is blocked until these are fixed, because the site build would fail.',
    commit_message: 'Description of this publish', commit_hint: 'Appears in the repository history. Leave empty for an automatic one.', default_commit__one: 'Update content ({n} file)', default_commit__other: 'Update content ({n} files)', publish_now: 'Publish', publishing: 'Publishing…', blocked_conflicts: 'Resolve the conflicts above first.', blocked_invalid: 'Fix the problems above first.', cannot_publish: 'Publishing is blocked: fix the problems first.',
    discard_all: 'Discard all changes', discard_all_title: 'Discard all unpublished changes?', discard_all_message: 'Everything you changed since the last publish will be lost. This cannot be undone.', discard: 'Discard', reload: 'Reload from repository', reloaded: 'Reloaded the latest content.', conflict_message: 'The repository changed while you were working. Nothing was overwritten. Reload, review the conflicts, and publish again.',
    published_title: 'Published', published_text__one: '{n} file was committed in one step.', published_text__other: '{n} files were committed in one step.', view_commit: 'View the commit on GitHub', deploy_note: 'GitHub now rebuilds the site. This usually takes a minute or two; this page cannot confirm when it is live.', view_actions: 'See the build on GitHub',
  },
  ar: {
    app_title: 'لوحة تحكم عبده', admin: 'الإدارة', main_navigation: 'التنقل الرئيسي', load_failed: 'تعذّر تحميل إعدادات لوحة التحكم. أعد تحميل الصفحة.',
    nav_overview: 'نظرة عامة', nav_articles: 'المقالات', nav_projects: 'الأعمال', nav_profile: 'الملف الشخصي والسيرة', nav_media: 'الوسائط', nav_publish: 'المراجعة والنشر',
    sign_in: 'تسجيل الدخول', signing_in: 'جارٍ تسجيل الدخول…', sign_out: 'تسجيل الخروج',
    login_title: 'سجّل الدخول لإدارة الموقع', login_intro: 'يُفحص رمز الوصول مباشرةً مع GitHub، ويبقى في هذه التبويبة فقط، ولا يُحفظ في الموقع أبدًا.',
    repo_owner: 'مستخدم GitHub أو المؤسسة', repo_name: 'المستودع', repo_branch: 'الفرع', access_token: 'رمز الوصول',
    token_hint: 'رمز وصول شخصي دقيق (fine-grained) لهذا المستودع وحده، بصلاحية Contents: قراءة وكتابة.', remember_tab: 'أبقِني مسجّلًا ما دامت هذه التبويبة مفتوحة',
    login_missing: 'أدخل المستودع والفرع ورمز الوصول.',
    token_help_title: 'كيف أنشئ الرمز؟', token_help_steps: 'في GitHub افتح Settings ← Developer settings ← Personal access tokens ← Fine-grained tokens.|اختر «Only select repositories» ثم مستودع الموقع.|في Repository permissions اجعل Contents على «Read and write» واترك الباقي مغلقًا.|حدّد مدة صلاحية قصيرة، وأنشئ الرمز والصقه هنا.',
    all_published: 'لا شيء غير منشور', unpublished_count: '{n} غير منشور', restored_changes__one: 'استُعيد تعديل واحد غير منشور من هذا المتصفح.', restored_changes__two: 'استُعيد تعديلان غير منشورين من هذا المتصفح.', restored_changes__few: 'استُعيدت {n} تعديلات غير منشورة من هذا المتصفح.', restored_changes__many: 'استُعيد {n} تعديلًا غير منشور من هذا المتصفح.', restored_changes__other: 'استُعيد {n} تعديل غير منشور من هذا المتصفح.', restored_conflicts: 'تغيّر بعضها ({n}) في المستودع منذ أن عدّلته. راجعها في «المراجعة والنشر».',
    public_repo_notice: 'هذا المستودع عام. المسودات والكتل المخفية وبنود السيرة الخاصة لا تظهر في الموقع لكنها تبقى مقروءة في ملفات المستودع.', write_unknown_notice: 'لم يُخبرنا GitHub إن كان هذا الرمز يملك صلاحية الكتابة. سيتّضح ذلك عند النشر.', sample_profile_notice: 'الملف الشخصي ما زال محتوى تجريبيًا.',
    stat_published_articles: 'المقالات المنشورة', stat_published_projects: 'الأعمال المنشورة', stat_drafts: 'المسودات', stat_scheduled: 'المجدولة', stat_unpublished_changes: 'تعديلات غير منشورة', stat_problems: 'مشكلات تحتاج إصلاحًا',
    by_language: 'المنشور حسب اللغة', by_topic: 'المقالات المنشورة حسب الموضوع', recent_updates: 'آخر التحديثات', language: 'اللغة', languages: 'اللغات', no_data: 'لا يوجد ما يُعرض بعد.', untitled: '(بلا عنوان)',
    new_article: 'مقال جديد', new_project: 'عمل جديد', search: 'ابحث في العناوين', status: 'الحالة', all: 'الكل', updated: 'آخر تحديث', edit: 'تحرير', nothing_here: 'لا شيء هنا.', showing_count: 'عدد العناصر: {n}', has_unpublished_changes: 'فيه تعديلات غير منشورة', no_translation: 'لا توجد ترجمة', back_to_list: 'العودة إلى القائمة', not_found: 'غير موجود',
    new_hint: 'يمكنك تغيير كل شيء لاحقًا. يبدأ العنصر الجديد كمسودة.', title_and_summary_required: 'العنوان والملخص القصير مطلوبان.', create: 'إنشاء', cancel: 'إلغاء', save: 'حفظ', delete: 'حذف', open: 'فتح',
    field_title: 'العنوان', field_subtitle: 'عنوان فرعي (اختياري)', field_excerpt: 'المقتطف', field_summary: 'الملخص', field_cover: 'صورة الغلاف', field_cover_alt: 'وصف صورة الغلاف (اختياري)', field_role: 'دورك (اختياري)', field_responsibilities: 'المسؤوليات (اختياري)',
    field_challenge: 'التحدي (اختياري)', field_process: 'العملية (اختياري)', field_solution: 'الحل (اختياري)', field_outcome: 'النتيجة (اختياري)', field_name: 'الاسم', field_headline: 'العنوان التعريفي', field_organization: 'الجهة',
    settings: 'الإعدادات', translation_status: 'حالة هذه اللغة', published_at: 'تاريخ النشر', published_at_hint: 'مطلوب عند النشر. يحدّد الترتيب في الموقع.', featured: 'مميّز', template: 'القالب', template_hint: 'التخطيط الأساسي لهذا المقال. البدء من قالب في الاستوديو يضبطه أيضًا.',
    topics: 'المواضيع', topics_hint: 'أول موضوع محدَّد في هذه القائمة يصبح تصنيف المقال.', tags: 'الوسوم', no_topics: 'لا توجد مواضيع عامة بعد.', no_tags: 'لا توجد وسوم بعد.', sample_flag: 'محتوى تجريبي (يُحذف في بناء «استبعاد التجريبي»)', created: 'أُنشئ',
    slug: 'مقطع الرابط', slug_hint: 'حروف من أي لغة وأرقام وشرطات مفردة.', slug_from_title: 'من العنوان', mark_published: 'وضع علامة منشور', unpublish: 'نقل إلى مسودة', add_translation: 'إضافة {language}', add_translation_title: 'إضافة نسخة {language}', remove_translation: 'إزالة هذه اللغة', remove_translation_title: 'إزالة هذه اللغة؟', remove_translation_message: 'ستُزال نسخة {language} من هذا العنصر عند النشر.',
    delete_item_title: 'حذف هذا العنصر؟', delete_item_message: 'سيُزال «{name}» عند النشر. قبل ذلك يمكنك التراجع عن التغيير.', body: 'المحتوى', seo_overrides: 'تخصيص البحث والمشاركة', seo_title: 'عنوان الصفحة لمحركات البحث', seo_description: 'وصف الصفحة لمحركات البحث', seo_robots: 'أرشفة محركات البحث',
    default: 'الافتراضي', none: 'بلا', project_status: 'تقدّم العمل', pstatus_planned: 'مخطط', 'pstatus_in-progress': 'قيد التنفيذ', pstatus_completed: 'مكتمل', pstatus_paused: 'متوقف مؤقتًا', start_date: 'تاريخ البدء', end_date: 'تاريخ الانتهاء', gallery: 'صور المعرض', tools: 'الأدوات والتقنيات', related_articles: 'مقالات ذات صلة', links: 'الروابط', add_link: 'إضافة رابط', link_kind: 'النوع', link_label: 'النص', link_url: 'العنوان',
    kind_email: 'بريد', kind_social: 'تواصل اجتماعي', kind_website: 'موقع', kind_experience: 'خبرة', kind_education: 'تعليم', kind_skill: 'مهارة', kind_section: 'قسم',
    status_idea: 'فكرة', status_outline: 'مخطط', status_draft: 'مسودة', status_editing: 'قيد التحرير', status_ready: 'جاهز', status_scheduled: 'مجدول', status_published: 'منشور', status_archived: 'مؤرشف', 'status_fact-checking': 'تدقيق معلومات',
    block_paragraph: 'فقرة', block_heading: 'عنوان', block_quote: 'اقتباس', block_list: 'قائمة', block_image: 'صورة', block_callout: 'تنبيه', block_divider: 'فاصل', no_blocks: 'لا يوجد محتوى بعد. أضف كتلة بالأسفل.', move_up: 'تحريك لأعلى', move_down: 'تحريك لأسفل', hide_block: 'إخفاء', show_block: 'إظهار',
    one_per_line: 'بند في كل سطر.', field_caption: 'التعليق (اختياري)',
    image_hint: 'ارفع الصور في «الوسائط» أولًا.', divider_note: 'الفاصل لا إعدادات له.',
    problems_title__one: 'مشكلة واحدة تحتاج إصلاحًا', problems_title__two: 'مشكلتان تحتاجان إصلاحًا', problems_title__few: '{n} مشكلات تحتاج إصلاحًا', problems_title__many: '{n} مشكلة تحتاج إصلاحًا', problems_title__other: '{n} مشكلة تحتاج إصلاحًا', problems_hint: 'يجب إصلاحها قبل النشر. الرسائل صادرة عن نفس فحوص بناء الموقع.', warnings_title__one: 'تحذير واحد', warnings_title__two: 'تحذيران', warnings_title__few: '{n} تحذيرات', warnings_title__many: '{n} تحذيرًا', warnings_title__other: '{n} تحذير',
    identity: 'الهوية', biography: 'السيرة', profile_photo: 'صورة الملف الشخصي', sample_profile_hint: 'ألغِ «محتوى تجريبي» عندما يحمل الملف معلوماتك الحقيقية؛ فبناء استبعاد التجريبي يرفض نشر ملف تجريبي.',
    experience: 'الخبرات', education: 'التعليم', skills: 'المهارات', custom_sections: 'أقسام مخصصة', add_entry: 'إضافة', visibility: 'الظهور', visibility_public: 'عام', visibility_private: 'خاص (لا يُنشر أبدًا)', start_month: 'البداية (شهر)', end_month: 'النهاية (شهر)', end_hint: 'اتركه فارغًا لتعني «حتى الآن».',
    upload: 'رفع صور', upload_rules: 'PNG أو JPEG أو GIF أو WebP حتى 8 ميغابايت. تُفحص الملفات بمحتواها. ملفات SVG غير مقبولة حاليًا.', upload_title: 'الإضافة إلى المكتبة', alt_text: 'وصف الصورة', alt_hint: 'صِف الصورة لمن لا يستطيع رؤيتها.', alt_required: 'الوصف مطلوب بكل لغة.', add_to_library: 'إضافة إلى المكتبة', upload_done: '{name} جاهزة للنشر.',
    edit_alt: 'تعديل الأوصاف', edit_alt_title: 'أوصاف {name}', archive: 'أرشفة', restore: 'استعادة', media_active: 'نشطة', media_archived: 'مؤرشفة', unpublished: 'لم تُنشر بعد', used_count: 'مستخدمة {n} مرة', in_use_cannot: 'ما زالت مستخدمة في: {list}. أزِلها من هناك أولًا.', delete_media_message: 'ستُزال {name} من المكتبة عند النشر.', no_media: 'لا توجد صور بعد.',
    used_in_profile: 'الملف الشخصي', used_in_site: 'إعدادات الموقع', used_in_topics: 'موضوع', used_in_tags: 'وسم', used_in_homepage: 'الصفحة الرئيسية',
    changes_title: 'التغييرات ({n})', no_changes: 'لا توجد تعديلات غير منشورة.', change_added: 'مضاف', change_changed: 'معدَّل', change_deleted: 'محذوف', conflict: 'تغيّر أيضًا في المستودع', keep_mine: 'إبقاء نسختي', discard_mine: 'تجاهل نسختي', conflicts_notice: 'تغيّرت بعض الملفات في المستودع بعد أن بدأت تحريرها. اختر «إبقاء نسختي» لاستبدال نسخة المستودع بنسختك، أو «تجاهل نسختي» لإبقاء نسخة المستودع.',
    valid_title: 'كل شيء سليم', valid_text: 'يجتاز كل المحتوى نفس فحوص بناء الموقع.', problems_block_publish: 'النشر متوقف حتى تُصلح هذه المشكلات، لأن بناء الموقع سيفشل بها.',
    commit_message: 'وصف هذا النشر', commit_hint: 'يظهر في سجل المستودع. اتركه فارغًا لوصف تلقائي.', default_commit__one: 'تحديث المحتوى (ملف واحد)', default_commit__two: 'تحديث المحتوى (ملفان)', default_commit__few: 'تحديث المحتوى ({n} ملفات)', default_commit__many: 'تحديث المحتوى ({n} ملفًا)', default_commit__other: 'تحديث المحتوى ({n} ملف)', publish_now: 'نشر', publishing: 'جارٍ النشر…', blocked_conflicts: 'عالج التعارضات بالأعلى أولًا.', blocked_invalid: 'أصلح المشكلات بالأعلى أولًا.', cannot_publish: 'النشر متوقف: أصلح المشكلات أولًا.',
    discard_all: 'تجاهل كل التعديلات', discard_all_title: 'تجاهل كل التعديلات غير المنشورة؟', discard_all_message: 'ستضيع كل تعديلاتك منذ آخر نشر. لا يمكن التراجع عن هذا.', discard: 'تجاهل', reload: 'إعادة التحميل من المستودع', reloaded: 'أُعيد تحميل آخر محتوى.', conflict_message: 'تغيّر المستودع أثناء عملك. لم يُستبدل شيء. أعد التحميل وراجع التعارضات ثم انشر من جديد.',
    published_title: 'تم النشر', published_text__one: 'سُجّل ملف واحد في خطوة واحدة.', published_text__two: 'سُجّل ملفان في خطوة واحدة.', published_text__few: 'سُجّلت {n} ملفات في خطوة واحدة.', published_text__many: 'سُجّل {n} ملفًا في خطوة واحدة.', published_text__other: 'سُجّل {n} ملف في خطوة واحدة.', view_commit: 'عرض عملية الحفظ على GitHub', deploy_note: 'يعيد GitHub الآن بناء الموقع. يستغرق ذلك عادةً دقيقة أو دقيقتين، ولا تستطيع هذه الصفحة تأكيد لحظة ظهوره.', view_actions: 'عرض البناء على GitHub',
  },
};

import { DESIGN } from './strings-design.mjs';
import { DISCOVERY } from './strings-discovery.mjs';
import { STUDIO } from './strings-studio.mjs';

/** All interface strings: the admin's own plus the Studio's. */
export const STRINGS = { en: { ...BASE.en, ...STUDIO.en, ...DESIGN.en, ...DISCOVERY.en }, ar: { ...BASE.ar, ...STUDIO.ar, ...DESIGN.ar, ...DISCOVERY.ar } };

const pluralRules = new Map();

function lookup(lang, key, n) {
  const table = STRINGS[lang];
  if (Number.isFinite(n)) {
    if (!pluralRules.has(lang)) pluralRules.set(lang, new Intl.PluralRules(lang));
    const text = table[`${key}__${pluralRules.get(lang).select(n)}`] ?? table[`${key}__other`];
    if (text !== undefined) return text;
  }
  return table[key];
}

/** Looks a string up in `lang` (falling back to English, then to the key itself) and fills `{name}` placeholders. */
export function translate(lang, key, params = {}) {
  const text = lookup(lang, key, params.n) ?? lookup('en', key, params.n) ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ''));
}
