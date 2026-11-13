// Starting outlines for new articles. A template only fills the body with headings and guidance
// written as ⟦placeholders⟧; every block stays an ordinary block that can be edited, moved or
// deleted, and the article's own settings are never constrained by the template.
//
// Placeholders are real text, so the result is valid at once; the validator reminds the author about
// them while the article is a draft and refuses them once it is published (see PLACEHOLDER).
// Templates contain no images: an image block needs a library image, so each outline says where to add one.

import { withFreshIds } from './block-specs.mjs';

// A compact way to write blocks: [kind, ...arguments].
const BUILDERS = {
  p: (text) => ({ type: 'paragraph', text }),
  lead: (text) => ({ type: 'paragraph', text, style: 'lead' }),
  stand: (text) => ({ type: 'paragraph', text, style: 'standfirst' }),
  by: (text) => ({ type: 'paragraph', text, style: 'byline' }),
  h2: (text) => ({ type: 'heading', level: 2, text }),
  h3: (text) => ({ type: 'heading', level: 3, text }),
  quote: (text, cite) => ({ type: 'quote', text, ...(cite ? { cite } : {}), variant: 'block' }),
  pull: (text) => ({ type: 'quote', text, variant: 'pull' }),
  list: (items, ordered = false) => ({ type: 'list', items, ...(ordered ? { ordered: true } : {}) }),
  note: (tone, title, text) => ({ type: 'callout', tone, title, text }),
  facts: (title, rows) => ({ type: 'factbox', title, items: rows.map(([label, value]) => ({ label, value })) }),
  time: (title, rows) => ({ type: 'timeline', title, events: rows.map(([date, name, text]) => ({ date, title: name, text })) }),
  stats: (rows) => ({ type: 'stats', items: rows.map(([value, label]) => ({ value, label })) }),
  table: (rows, caption) => ({ type: 'table', header: true, rows, ...(caption ? { caption } : {}) }),
  steps: (items) => ({ type: 'checklist', items: items.map((text) => ({ text })) }),
  code: (text) => ({ type: 'code', text }),
  refs: (items) => ({ type: 'references', items: items.map((text) => ({ text })) }),
  notes: (items) => ({ type: 'footnotes', items }),
  rule: () => ({ type: 'divider' }),
  author: () => ({ type: 'author' }),
};

const make = (rows) => rows.map(([kind, ...args]) => BUILDERS[kind](...args));

/** @type {{ id: string, name: { en: string, ar: string }, description: { en: string, ar: string }, outline: { en: unknown[][], ar: unknown[][] } }[]} */
export const TEMPLATES = [
  {
    id: 'editorial',
    name: { en: 'Editorial', ar: 'مقال تحريري' },
    description: { en: 'A balanced magazine piece: a lead, two or three sections and a closing thought.', ar: 'مقال مجلاتي متوازن: افتتاحية وقسمان أو ثلاثة وخاتمة.' },
    outline: {
      en: [['lead', '⟦Open with the idea that makes a reader stay, in one or two sentences.⟧'], ['p', '⟦Set the scene: who, what and why it matters now.⟧'], ['h2', '⟦First section⟧'], ['p', '⟦Develop the first point with a concrete example.⟧'], ['pull', '⟦A sentence worth pulling out of the text.⟧'], ['h2', '⟦Second section⟧'], ['p', '⟦Develop the second point.⟧'], ['h2', '⟦Closing thought⟧'], ['p', '⟦End with what the reader can do or think differently.⟧'], ['author']],
      ar: [['lead', '⟦ابدأ بالفكرة التي تُبقي القارئ معك، في جملة أو جملتين.⟧'], ['p', '⟦مهّد للموضوع: من ومتى ولماذا يهم الآن.⟧'], ['h2', '⟦القسم الأول⟧'], ['p', '⟦اشرح النقطة الأولى بمثال محدد.⟧'], ['pull', '⟦جملة تستحق أن تُبرَز من النص.⟧'], ['h2', '⟦القسم الثاني⟧'], ['p', '⟦اشرح النقطة الثانية.⟧'], ['h2', '⟦خاتمة⟧'], ['p', '⟦اختم بما يمكن للقارئ أن يفعله أو يفكر فيه بطريقة مختلفة.⟧'], ['author']],
    },
  },
  {
    id: 'long-read',
    name: { en: 'Long read', ar: 'قراءة مطوّلة' },
    description: { en: 'A long, chaptered piece with an introduction, numbered parts and sources.', ar: 'نص طويل مقسّم إلى فصول، بمقدمة وأجزاء مرقّمة ومصادر.' },
    outline: {
      en: [['stand', '⟦One sentence that promises what the whole piece delivers.⟧'], ['p', '⟦Introduction: the question and why it deserves a long answer.⟧'], ['h2', '⟦Part one⟧'], ['p', '⟦Background and context.⟧'], ['h2', '⟦Part two⟧'], ['p', '⟦The central argument or story.⟧'], ['pull', '⟦The line a reader will remember.⟧'], ['h2', '⟦Part three⟧'], ['p', '⟦Complications, counter-arguments, what remains unknown.⟧'], ['h2', '⟦Conclusion⟧'], ['p', '⟦Bring the parts together.⟧'], ['rule'], ['refs', ['⟦Source or further reading⟧']]],
      ar: [['stand', '⟦جملة واحدة تعد بما سيقدمه النص كله.⟧'], ['p', '⟦مقدمة: السؤال ولماذا يستحق جوابًا مطولًا.⟧'], ['h2', '⟦الجزء الأول⟧'], ['p', '⟦الخلفية والسياق.⟧'], ['h2', '⟦الجزء الثاني⟧'], ['p', '⟦الحجة المحورية أو القصة.⟧'], ['pull', '⟦الجملة التي سيتذكرها القارئ.⟧'], ['h2', '⟦الجزء الثالث⟧'], ['p', '⟦التعقيدات والحجج المضادة وما لا يزال مجهولًا.⟧'], ['h2', '⟦الخلاصة⟧'], ['p', '⟦اجمع الأجزاء معًا.⟧'], ['rule'], ['refs', ['⟦مصدر أو قراءة إضافية⟧']]],
    },
  },
  {
    id: 'news',
    name: { en: 'News', ar: 'خبر' },
    description: { en: 'Inverted pyramid: the key facts first, then detail and background.', ar: 'الهرم المقلوب: الوقائع الأهم أولًا ثم التفاصيل والخلفية.' },
    outline: {
      en: [['lead', '⟦Who did what, where and when, in one sentence.⟧'], ['p', '⟦Why it matters, and the most important detail.⟧'], ['facts', '⟦At a glance⟧', [['⟦When⟧', '⟦Date⟧'], ['⟦Where⟧', '⟦Place⟧']]], ['h2', '⟦What happened⟧'], ['p', '⟦The sequence of events.⟧'], ['quote', '⟦A direct statement from a source.⟧', '⟦Name, role⟧'], ['h2', '⟦Background⟧'], ['p', '⟦What the reader needs to know to understand it.⟧'], ['refs', ['⟦Where the information comes from⟧']]],
      ar: [['lead', '⟦من فعل ماذا، وأين ومتى، في جملة واحدة.⟧'], ['p', '⟦لماذا يهم الخبر، وأهم تفصيل فيه.⟧'], ['facts', '⟦في لمحة⟧', [['⟦متى⟧', '⟦التاريخ⟧'], ['⟦أين⟧', '⟦المكان⟧']]], ['h2', '⟦ما الذي حدث⟧'], ['p', '⟦تسلسل الأحداث.⟧'], ['quote', '⟦تصريح مباشر من مصدر.⟧', '⟦الاسم والصفة⟧'], ['h2', '⟦الخلفية⟧'], ['p', '⟦ما يحتاج القارئ إلى معرفته ليفهم الخبر.⟧'], ['refs', ['⟦مصدر المعلومات⟧']]],
    },
  },
  {
    id: 'interview',
    name: { en: 'Interview', ar: 'حوار' },
    description: { en: 'Question and answer, with an introduction about the guest.', ar: 'أسئلة وأجوبة، مع تقديم للضيف.' },
    outline: {
      en: [['stand', '⟦Who the guest is and why this conversation matters.⟧'], ['facts', '⟦The guest⟧', [['⟦Name⟧', '⟦Full name⟧'], ['⟦Known for⟧', '⟦One line⟧']]], ['h2', '⟦First question⟧'], ['p', '⟦The answer, lightly edited.⟧'], ['h2', '⟦Second question⟧'], ['p', '⟦The answer.⟧'], ['pull', '⟦The best line from the conversation.⟧'], ['h2', '⟦Third question⟧'], ['p', '⟦The answer.⟧'], ['h2', '⟦Last question⟧'], ['p', '⟦The answer, and where to find the guest’s work.⟧'], ['note', 'note', '⟦Note on the interview⟧', '⟦When and how it was recorded, and whether it was edited for length.⟧']],
      ar: [['stand', '⟦من هو الضيف ولماذا يهم هذا الحوار.⟧'], ['facts', '⟦الضيف⟧', [['⟦الاسم⟧', '⟦الاسم الكامل⟧'], ['⟦معروف بـ⟧', '⟦سطر واحد⟧']]], ['h2', '⟦السؤال الأول⟧'], ['p', '⟦الإجابة بعد تحريرها بخفة.⟧'], ['h2', '⟦السؤال الثاني⟧'], ['p', '⟦الإجابة.⟧'], ['pull', '⟦أفضل جملة من الحوار.⟧'], ['h2', '⟦السؤال الثالث⟧'], ['p', '⟦الإجابة.⟧'], ['h2', '⟦السؤال الأخير⟧'], ['p', '⟦الإجابة، ومكان الاطلاع على أعمال الضيف.⟧'], ['note', 'note', '⟦ملاحظة عن الحوار⟧', '⟦متى وكيف سُجّل، وهل حُرّر للاختصار.⟧']],
    },
  },
  {
    id: 'photo-essay',
    name: { en: 'Photo essay', ar: 'مقال مصوَّر' },
    description: { en: 'Images lead and short text carries them. Each outline step says where to add an image.', ar: 'الصور تقود والنص القصير يحملها. كل خطوة تبيّن أين تضيف صورة.' },
    outline: {
      en: [['stand', '⟦What this set of images is about, in a sentence.⟧'], ['p', '⟦Where and when the photographs were taken.⟧'], ['h2', '⟦Chapter one⟧'], ['p', '⟦Add an image or a gallery block here (choose images in Media first).⟧'], ['p', '⟦Two or three sentences about what the viewer is seeing.⟧'], ['h2', '⟦Chapter two⟧'], ['p', '⟦Add an image or a before-and-after block here.⟧'], ['pull', '⟦A short line that gives the images their meaning.⟧'], ['h2', '⟦Chapter three⟧'], ['p', '⟦Add the closing image here.⟧'], ['note', 'note', '⟦Credits⟧', '⟦Photographer, equipment, permissions.⟧']],
      ar: [['stand', '⟦موضوع هذه المجموعة من الصور في جملة.⟧'], ['p', '⟦أين ومتى التُقطت الصور.⟧'], ['h2', '⟦الفصل الأول⟧'], ['p', '⟦أضف هنا كتلة صورة أو معرضًا (اختر الصور من «الوسائط» أولًا).⟧'], ['p', '⟦جملتان أو ثلاث عمّا يراه المشاهد.⟧'], ['h2', '⟦الفصل الثاني⟧'], ['p', '⟦أضف هنا كتلة صورة أو «قبل وبعد».⟧'], ['pull', '⟦سطر قصير يمنح الصور معناها.⟧'], ['h2', '⟦الفصل الثالث⟧'], ['p', '⟦أضف هنا صورة الختام.⟧'], ['note', 'note', '⟦حقوق الصور⟧', '⟦المصوّر والمعدات والأذونات.⟧']],
    },
  },
  {
    id: 'personal-journal',
    name: { en: 'Personal journal', ar: 'يوميات شخصية' },
    description: { en: 'A first-person entry: what happened, what it meant, what comes next.', ar: 'تدوينة بصيغة المتكلم: ما حدث، وما معناه، وما التالي.' },
    outline: {
      en: [['p', '⟦Today, this week or this season: where were you when it started?⟧'], ['h2', '⟦What happened⟧'], ['p', '⟦Tell it in order, with small concrete details.⟧'], ['h2', '⟦What I noticed⟧'], ['p', '⟦What surprised you, bothered you or stayed with you.⟧'], ['quote', '⟦Something someone said, or a line you read.⟧'], ['h2', '⟦What comes next⟧'], ['p', '⟦What you will try, change or keep thinking about.⟧']],
      ar: [['p', '⟦اليوم أو هذا الأسبوع أو هذا الموسم: أين كنت حين بدأ كل شيء؟⟧'], ['h2', '⟦ما الذي حدث⟧'], ['p', '⟦احكِ بالترتيب، مع تفاصيل صغيرة محددة.⟧'], ['h2', '⟦ما لاحظته⟧'], ['p', '⟦ما فاجأك أو أزعجك أو بقي معك.⟧'], ['quote', '⟦شيء قاله أحدهم، أو سطر قرأته.⟧'], ['h2', '⟦وماذا بعد⟧'], ['p', '⟦ما ستجرّبه أو تغيّره أو تظل تفكر فيه.⟧']],
    },
  },
  {
    id: 'research',
    name: { en: 'Research', ar: 'بحث' },
    description: { en: 'Question, method, findings and limits, with footnotes and references.', ar: 'سؤال ومنهج ونتائج وحدود، مع حواشٍ ومراجع.' },
    outline: {
      en: [['stand', '⟦The research question and the short answer.⟧'], ['h2', '⟦Background⟧'], ['p', '⟦What is already known.⟧[^n1]'], ['h2', '⟦Method⟧'], ['p', '⟦How the question was investigated, and what sources were used.⟧'], ['h2', '⟦Findings⟧'], ['p', '⟦What the evidence shows.⟧'], ['table', [['⟦Source⟧', '⟦Finding⟧'], ['⟦First source⟧', '⟦What it shows⟧']], '⟦Summary of the evidence⟧'], ['h2', '⟦Limits⟧'], ['p', '⟦What this work cannot tell you.⟧'], ['h2', '⟦Conclusion⟧'], ['p', '⟦What follows from the findings.⟧'], ['notes', [{ key: 'n1', text: '⟦Source for the background claim⟧' }]], ['refs', ['⟦Full reference⟧']]],
      ar: [['stand', '⟦سؤال البحث والجواب المختصر.⟧'], ['h2', '⟦الخلفية⟧'], ['p', '⟦ما هو معروف سلفًا.⟧[^n1]'], ['h2', '⟦المنهج⟧'], ['p', '⟦كيف جرى تقصّي السؤال وما المصادر المستخدمة.⟧'], ['h2', '⟦النتائج⟧'], ['p', '⟦ما تُظهره الأدلة.⟧'], ['table', [['⟦المصدر⟧', '⟦النتيجة⟧'], ['⟦المصدر الأول⟧', '⟦ما يُظهره⟧']], '⟦ملخص الأدلة⟧'], ['h2', '⟦الحدود⟧'], ['p', '⟦ما لا يستطيع هذا العمل أن يقوله.⟧'], ['h2', '⟦الخلاصة⟧'], ['p', '⟦ما يترتب على النتائج.⟧'], ['notes', [{ key: 'n1', text: '⟦مصدر ادعاء الخلفية⟧' }]], ['refs', ['⟦المرجع الكامل⟧']]],
    },
  },
  {
    id: 'review',
    name: { en: 'Review', ar: 'مراجعة' },
    description: { en: 'A verdict first, then what works, what does not and who it is for.', ar: 'الحكم أولًا، ثم ما ينجح وما لا ينجح ولمن هو مناسب.' },
    outline: {
      en: [['lead', '⟦Your verdict in one or two sentences.⟧'], ['facts', '⟦The thing reviewed⟧', [['⟦Name⟧', '⟦Title⟧'], ['⟦Made by⟧', '⟦Maker⟧'], ['⟦Price or cost⟧', '⟦Amount⟧']]], ['h2', '⟦What works⟧'], ['list', ['⟦First strength⟧', '⟦Second strength⟧']], ['h2', '⟦What does not⟧'], ['list', ['⟦First weakness⟧', '⟦Second weakness⟧']], ['h2', '⟦Who it is for⟧'], ['p', '⟦The person who will get the most from it, and who should skip it.⟧'], ['note', 'tip', '⟦Verdict⟧', '⟦Recommend, recommend with reservations, or do not recommend, and why.⟧']],
      ar: [['lead', '⟦حكمك في جملة أو جملتين.⟧'], ['facts', '⟦موضوع المراجعة⟧', [['⟦الاسم⟧', '⟦العنوان⟧'], ['⟦الجهة المنتجة⟧', '⟦الجهة⟧'], ['⟦السعر أو التكلفة⟧', '⟦المبلغ⟧']]], ['h2', '⟦ما ينجح⟧'], ['list', ['⟦ميزة أولى⟧', '⟦ميزة ثانية⟧']], ['h2', '⟦ما لا ينجح⟧'], ['list', ['⟦عيب أول⟧', '⟦عيب ثانٍ⟧']], ['h2', '⟦لمن هو مناسب⟧'], ['p', '⟦من سيستفيد منه أكثر، ومن الأفضل أن يتجاوزه.⟧'], ['note', 'tip', '⟦الحكم⟧', '⟦أنصح به، أو أنصح به بتحفظ، أو لا أنصح به، ولماذا.⟧']],
    },
  },
  {
    id: 'opinion',
    name: { en: 'Opinion', ar: 'رأي' },
    description: { en: 'A clear position, the strongest evidence for it and the best objection.', ar: 'موقف واضح، وأقوى الأدلة عليه، وأقوى اعتراض.' },
    outline: {
      en: [['lead', '⟦State your position plainly in the first sentence.⟧'], ['p', '⟦Why you are writing about it now.⟧'], ['h2', '⟦The case for it⟧'], ['p', '⟦Your strongest argument, with evidence.⟧'], ['pull', '⟦Your thesis in a sentence a reader could repeat.⟧'], ['h2', '⟦The best objection⟧'], ['p', '⟦State the opposing view fairly, in its strongest form.⟧'], ['h2', '⟦Why I still think so⟧'], ['p', '⟦Answer the objection.⟧'], ['p', '⟦Close with what you would like the reader to do or consider.⟧'], ['author']],
      ar: [['lead', '⟦اذكر موقفك بوضوح في الجملة الأولى.⟧'], ['p', '⟦لماذا تكتب عن هذا الآن.⟧'], ['h2', '⟦حجج الموقف⟧'], ['p', '⟦أقوى حججك، مع الدليل.⟧'], ['pull', '⟦أطروحتك في جملة يستطيع القارئ ترديدها.⟧'], ['h2', '⟦أقوى اعتراض⟧'], ['p', '⟦اعرض الرأي المخالف بإنصاف وبأقوى صوره.⟧'], ['h2', '⟦لماذا ما زلت أرى ذلك⟧'], ['p', '⟦أجب عن الاعتراض.⟧'], ['p', '⟦اختم بما تود أن يفعله القارئ أو يتأمله.⟧'], ['author']],
    },
  },
  {
    id: 'feature-story',
    name: { en: 'Feature story', ar: 'تحقيق صحفي' },
    description: { en: 'A scene-led narrative with a person, a turning point and a wider meaning.', ar: 'سرد يبدأ بمشهد، فيه شخص ولحظة تحوّل ومعنى أوسع.' },
    outline: {
      en: [['lead', '⟦Begin in a scene: a place, a person, a moment.⟧'], ['p', '⟦Widen out: what is this a story about?⟧'], ['h2', '⟦The person⟧'], ['p', '⟦Who they are and what they want.⟧'], ['quote', '⟦Their words, as exactly as you can give them.⟧', '⟦Name⟧'], ['h2', '⟦The turning point⟧'], ['p', '⟦What changed, and how.⟧'], ['time', '⟦How it unfolded⟧', [['⟦Date⟧', '⟦First event⟧', '⟦What happened⟧'], ['⟦Date⟧', '⟦Second event⟧', '⟦What happened⟧']]], ['h2', '⟦What it means⟧'], ['p', '⟦Return to the scene, now carrying the meaning.⟧']],
      ar: [['lead', '⟦ابدأ بمشهد: مكان وشخص ولحظة.⟧'], ['p', '⟦وسّع الصورة: عمّ تدور هذه القصة؟⟧'], ['h2', '⟦الشخص⟧'], ['p', '⟦من هو وماذا يريد.⟧'], ['quote', '⟦كلامه كما تنقله بأكبر دقة ممكنة.⟧', '⟦الاسم⟧'], ['h2', '⟦نقطة التحوّل⟧'], ['p', '⟦ما الذي تغيّر وكيف.⟧'], ['time', '⟦كيف جرى ذلك⟧', [['⟦التاريخ⟧', '⟦الحدث الأول⟧', '⟦ما حدث⟧'], ['⟦التاريخ⟧', '⟦الحدث الثاني⟧', '⟦ما حدث⟧']]], ['h2', '⟦ماذا يعني ذلك⟧'], ['p', '⟦عُد إلى المشهد وقد حمل المعنى.⟧']],
    },
  },
  {
    id: 'report',
    name: { en: 'Report', ar: 'تقرير' },
    description: { en: 'Summary, key numbers, findings, recommendations and next steps.', ar: 'ملخص وأرقام رئيسية ونتائج وتوصيات وخطوات تالية.' },
    outline: {
      en: [['stand', '⟦The summary: what was examined and the main conclusion.⟧'], ['stats', [['⟦00%⟧', '⟦What the first number measures⟧'], ['⟦00⟧', '⟦What the second number measures⟧']]], ['h2', '⟦Scope and method⟧'], ['p', '⟦What was covered, what was left out, how it was measured.⟧'], ['h2', '⟦Findings⟧'], ['table', [['⟦Item⟧', '⟦Result⟧'], ['⟦First item⟧', '⟦Result⟧']], '⟦Results⟧'], ['h2', '⟦Recommendations⟧'], ['list', ['⟦First recommendation⟧', '⟦Second recommendation⟧'], true], ['h2', '⟦Next steps⟧'], ['steps', ['⟦First action⟧', '⟦Second action⟧']]],
      ar: [['stand', '⟦الملخص: ما الذي فُحص وأهم استنتاج.⟧'], ['stats', [['⟦٠٠٪⟧', '⟦ما يقيسه الرقم الأول⟧'], ['⟦٠٠⟧', '⟦ما يقيسه الرقم الثاني⟧']]], ['h2', '⟦النطاق والمنهج⟧'], ['p', '⟦ما الذي شُمل وما الذي استُبعد وكيف جرى القياس.⟧'], ['h2', '⟦النتائج⟧'], ['table', [['⟦البند⟧', '⟦النتيجة⟧'], ['⟦البند الأول⟧', '⟦النتيجة⟧']], '⟦النتائج⟧'], ['h2', '⟦التوصيات⟧'], ['list', ['⟦التوصية الأولى⟧', '⟦التوصية الثانية⟧'], true], ['h2', '⟦الخطوات التالية⟧'], ['steps', ['⟦الإجراء الأول⟧', '⟦الإجراء الثاني⟧']]],
    },
  },
  {
    id: 'tutorial',
    name: { en: 'Tutorial', ar: 'شرح تعليمي' },
    description: { en: 'What you will build, what you need, numbered steps and a way to check it worked.', ar: 'ما ستنجزه، وما تحتاجه، وخطوات مرقّمة، وطريقة للتأكد من النجاح.' },
    outline: {
      en: [['lead', '⟦What the reader will be able to do by the end.⟧'], ['facts', '⟦Before you start⟧', [['⟦Time⟧', '⟦Minutes⟧'], ['⟦Level⟧', '⟦Beginner, intermediate or advanced⟧']]], ['h2', '⟦What you need⟧'], ['steps', ['⟦First requirement⟧', '⟦Second requirement⟧']], ['h2', '⟦Step 1: name it⟧'], ['p', '⟦Say what to do, then why.⟧'], ['code', '⟦command or code⟧'], ['h2', '⟦Step 2: name it⟧'], ['p', '⟦Say what to do, then why.⟧'], ['note', 'warning', '⟦Common mistake⟧', '⟦What often goes wrong here and how to fix it.⟧'], ['h2', '⟦Check that it worked⟧'], ['p', '⟦What the reader should see if everything is right.⟧'], ['h2', '⟦Where to go next⟧'], ['p', '⟦One or two natural follow-ups.⟧']],
      ar: [['lead', '⟦ما الذي سيصبح القارئ قادرًا على فعله في النهاية.⟧'], ['facts', '⟦قبل أن تبدأ⟧', [['⟦الوقت⟧', '⟦دقائق⟧'], ['⟦المستوى⟧', '⟦مبتدئ أو متوسط أو متقدم⟧']]], ['h2', '⟦ما تحتاجه⟧'], ['steps', ['⟦المتطلب الأول⟧', '⟦المتطلب الثاني⟧']], ['h2', '⟦الخطوة ١: سمِّها⟧'], ['p', '⟦قل ما الذي يجب فعله، ثم لماذا.⟧'], ['code', '⟦أمر أو شيفرة⟧'], ['h2', '⟦الخطوة ٢: سمِّها⟧'], ['p', '⟦قل ما الذي يجب فعله، ثم لماذا.⟧'], ['note', 'warning', '⟦خطأ شائع⟧', '⟦ما الذي يخطئ فيه الناس هنا وكيف يُصلح.⟧'], ['h2', '⟦تأكد من نجاح العملية⟧'], ['p', '⟦ما الذي ينبغي أن يراه القارئ إذا سار كل شيء على ما يرام.⟧'], ['h2', '⟦إلى أين بعد ذلك⟧'], ['p', '⟦متابعة أو متابعتان طبيعيتان.⟧']],
    },
  },
];

export const TEMPLATE_IDS = TEMPLATES.map((t) => t.id);

/**
 * The blocks of a template in a language (any language other than Arabic gets the English outline),
 * with fresh block ids.
 * @param {string} id
 * @param {string} lang
 * @param {string[]} [taken] block ids already in use
 */
export function templateBlocks(id, lang, taken = []) {
  const template = TEMPLATES.find((t) => t.id === id);
  if (!template) throw new Error(`Unknown template "${id}"`);
  const rows = lang === 'ar' ? template.outline.ar : template.outline.en;
  return withFreshIds(make(rows), taken);
}

/** The display name of a template in the admin language. */
export const templateName = (template, ui) => template.name[ui] ?? template.name.en;
export const templateDescription = (template, ui) => template.description[ui] ?? template.description.en;
