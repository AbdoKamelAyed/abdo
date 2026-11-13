// Interface strings of the Editorial Studio (Phase 3). Merged into STRINGS by strings.mjs, and held to
// the same rules: both languages define exactly the same keys, counts use `key__one` / `key__other` forms.
//
// Naming: f_<field> labels a block field, o_<field>_<value> labels one of its options, h_* are hints,
// item_<type> names the repeated items of a block, block_<type> names the block type itself.

import { CHROME } from './strings-studio-chrome.mjs';

const BLOCKS = {
  en: {
    optional: '(optional)',
    // block types added in Phase 3
    block_checklist: 'Checklist', block_definitions: 'Definition list', block_code: 'Code', block_table: 'Table', block_gallery: 'Gallery', block_compare: 'Before and after', block_imagetext: 'Image with text',
    block_factbox: 'Fact box', block_timeline: 'Timeline', block_stats: 'Statistics', block_related: 'Related pages', block_author: 'Author card', block_footnotes: 'Footnotes', block_references: 'References',
    // field labels
    f_text: 'Text', f_style: 'Paragraph style', f_dropCap: 'Drop cap', f_smallCaps: 'Small capitals (Latin letters)', f_align: 'Alignment', f_dir: 'Text direction', f_level: 'Heading level', f_quote: 'Quotation', f_cite: 'Source', f_variant: 'Look',
    f_ordered: 'Numbered list', f_items: 'Items', f_image: 'Image', f_caption: 'Caption', f_alt: 'Description override', f_size: 'Size', f_aspect: 'Shape', f_border: 'Border', f_radius: 'Corners', f_tone: 'Tone', f_title: 'Title',
    f_code: 'Code', f_language: 'Language label', f_header: 'First row is a heading row', f_rows: 'Cells', f_columns: 'Columns', f_ratio: 'Image shape', f_before: 'Before image', f_after: 'After image', f_beforeLabel: 'Before label', f_afterLabel: 'After label',
    f_beforeAlt: 'Before image description override', f_afterAlt: 'After image description override', f_side: 'Image position', f_note: 'Note', f_term: 'Term', f_definition: 'Definition', f_checked: 'Done', f_label: 'Label', f_value: 'Value',
    f_date: 'Date', f_key: 'Key', f_events: 'Events', f_url: 'Link address', f_spacing: 'Spacing', f_width: 'Width', f_dtone: 'Background', f_alt_text: 'Image description',
    f_indent: 'Level',
    h_list_items: 'One item per line. To nest an item under the one above, indent it with the Indent button or Ctrl+] (two spaces per level, up to four levels).',
    h_one_per_line: 'One item per line.', h_alt_override: 'Only if this image needs a different description here than in the library.', h_language: 'A label such as js or python. It is not used for colouring.',
    h_footnote_key: 'Lowercase letters, numbers and hyphens. In the text it is written as [^key].', h_reference_url: 'Starts with http:// or https://.',
    // option labels
    o_style_body: 'Standard body', o_style_intro: 'Introduction', o_style_lead: 'Lead paragraph', o_style_standfirst: 'Standfirst', o_style_caption: 'Caption', o_style_byline: 'Byline', o_style_small: 'Small text', o_style_highlight: 'Highlighted',
    o_align_start: 'Start', o_align_center: 'Centre', o_align_end: 'End', o_align_justify: 'Justified', o_dir_auto: 'Automatic', o_dir_ltr: 'Left to right', o_dir_rtl: 'Right to left',
    o_variant_block: 'Block quote', o_variant_pull: 'Pull quote', o_size_inline: 'Inline', o_size_wide: 'Wide', o_size_full: 'Full width', o_ratio_auto: 'Original',
    o_border_none: 'None', o_border_thin: 'Thin', o_border_thick: 'Thick', o_radius_none: 'Square', o_radius_sm: 'Slightly rounded', o_radius_lg: 'Rounded', o_radius_round: 'Circle',
    o_tone_note: 'Note', o_tone_tip: 'Tip', o_tone_warning: 'Warning', o_side_start: 'Start side', o_side_end: 'End side',
    o_spacing_compact: 'Compact', o_spacing_normal: 'Normal', o_spacing_relaxed: 'Relaxed', o_width_narrow: 'Narrow', o_width_normal: 'Normal', o_width_wide: 'Wide', o_width_full: 'Full width',
    o_dtone_none: 'Plain', o_dtone_subtle: 'Subtle', o_dtone_accent: 'Accent', o_dtone_inverse: 'Inverted', o_rkind_article: 'Article', o_rkind_project: 'Project',
    // repeated items
    item_checklist: 'Task', item_definitions: 'Definition', item_gallery: 'Image', item_factbox: 'Fact', item_timeline: 'Event', item_stats: 'Statistic', item_related: 'Linked page', item_footnotes: 'Footnote', item_references: 'Reference',
  },
  ar: {
    optional: '(اختياري)',
    block_checklist: 'قائمة مهام', block_definitions: 'قائمة تعريفات', block_code: 'شيفرة', block_table: 'جدول', block_gallery: 'معرض صور', block_compare: 'قبل وبعد', block_imagetext: 'صورة مع نص',
    block_factbox: 'صندوق حقائق', block_timeline: 'خط زمني', block_stats: 'إحصاءات', block_related: 'صفحات ذات صلة', block_author: 'بطاقة الكاتب', block_footnotes: 'الحواشي', block_references: 'المراجع',
    f_text: 'النص', f_style: 'نمط الفقرة', f_dropCap: 'حرف أول كبير', f_smallCaps: 'أحرف لاتينية كبيرة مصغّرة', f_align: 'المحاذاة', f_dir: 'اتجاه النص', f_level: 'مستوى العنوان', f_quote: 'نص الاقتباس', f_cite: 'المصدر', f_variant: 'الشكل',
    f_ordered: 'قائمة مرقّمة', f_items: 'البنود', f_image: 'الصورة', f_caption: 'التعليق', f_alt: 'استبدال وصف الصورة', f_size: 'الحجم', f_aspect: 'الشكل', f_border: 'الإطار', f_radius: 'الزوايا', f_tone: 'النبرة', f_title: 'العنوان',
    f_code: 'الشيفرة', f_language: 'اسم اللغة البرمجية', f_header: 'الصف الأول صف عناوين', f_rows: 'الخلايا', f_columns: 'عدد الأعمدة', f_ratio: 'شكل الصور', f_before: 'صورة «قبل»', f_after: 'صورة «بعد»', f_beforeLabel: 'نص «قبل»', f_afterLabel: 'نص «بعد»',
    f_beforeAlt: 'استبدال وصف صورة «قبل»', f_afterAlt: 'استبدال وصف صورة «بعد»', f_side: 'موضع الصورة', f_note: 'ملاحظة', f_term: 'المصطلح', f_definition: 'التعريف', f_checked: 'منجز', f_label: 'العنوان', f_value: 'القيمة',
    f_date: 'التاريخ', f_key: 'المفتاح', f_events: 'الأحداث', f_url: 'عنوان الرابط', f_spacing: 'المسافات', f_width: 'العرض', f_dtone: 'الخلفية', f_alt_text: 'وصف الصورة',
    f_indent: 'المستوى',
    h_list_items: 'بند في كل سطر. لإدخال بند تحت البند الذي فوقه استخدم زر الإزاحة أو Ctrl+‏] (مسافتان لكل مستوى، حتى أربعة مستويات).',
    h_one_per_line: 'بند في كل سطر.', h_alt_override: 'فقط إن احتاجت الصورة هنا إلى وصف يختلف عن وصفها في المكتبة.', h_language: 'اسم مثل js أو python. لا يُستخدم في التلوين.',
    h_footnote_key: 'حروف لاتينية صغيرة وأرقام وشرطات. يُكتب في النص هكذا: [^المفتاح].', h_reference_url: 'يبدأ بـ http:// أو https://.',
    o_style_body: 'نص عادي', o_style_intro: 'تمهيد', o_style_lead: 'فقرة افتتاحية', o_style_standfirst: 'مقدّمة موجزة', o_style_caption: 'تعليق', o_style_byline: 'سطر الكاتب', o_style_small: 'نص صغير', o_style_highlight: 'فقرة مميّزة',
    o_align_start: 'البداية', o_align_center: 'الوسط', o_align_end: 'النهاية', o_align_justify: 'ضبط', o_dir_auto: 'تلقائي', o_dir_ltr: 'من اليسار إلى اليمين', o_dir_rtl: 'من اليمين إلى اليسار',
    o_variant_block: 'اقتباس عادي', o_variant_pull: 'اقتباس بارز', o_size_inline: 'ضمن النص', o_size_wide: 'عريض', o_size_full: 'عرض كامل', o_ratio_auto: 'الأصلي',
    o_border_none: 'بلا', o_border_thin: 'رفيع', o_border_thick: 'سميك', o_radius_none: 'حادة', o_radius_sm: 'مستديرة قليلًا', o_radius_lg: 'مستديرة', o_radius_round: 'دائرية',
    o_tone_note: 'ملاحظة', o_tone_tip: 'نصيحة', o_tone_warning: 'تحذير', o_side_start: 'جهة البداية', o_side_end: 'جهة النهاية',
    o_spacing_compact: 'مضغوطة', o_spacing_normal: 'عادية', o_spacing_relaxed: 'واسعة', o_width_narrow: 'ضيّق', o_width_normal: 'عادي', o_width_wide: 'عريض', o_width_full: 'عرض كامل',
    o_dtone_none: 'بلا خلفية', o_dtone_subtle: 'خفيفة', o_dtone_accent: 'مميّزة', o_dtone_inverse: 'معكوسة', o_rkind_article: 'مقال', o_rkind_project: 'عمل',
    item_checklist: 'مهمة', item_definitions: 'تعريف', item_gallery: 'صورة', item_factbox: 'حقيقة', item_timeline: 'حدث', item_stats: 'إحصائية', item_related: 'صفحة مرتبطة', item_footnotes: 'حاشية', item_references: 'مرجع',
  },
};

/** Block strings and the Studio's chrome strings, as one table per language. */
export const STUDIO = { en: { ...BLOCKS.en, ...CHROME.en }, ar: { ...BLOCKS.ar, ...CHROME.ar } };
