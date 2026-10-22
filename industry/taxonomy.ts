// 这个行业的分类体系：类别、标签词表、机构（主体）名录，以及防止张冠李戴的身份词典。
// 模型按这里的词表打标签，主题页（topics.json）按标签归类，筛选栏按类别分组。
// 换行业时：类别的 key 会出现在网址里（/all?category=…），上线后就不要再改；标签和名录可以随时增减。

/**
 * 网页上的类别（筛选栏、卡片角标、RSS 分类订阅）。key 是网址和接口里的身份，上线后不要改。
 * section 是日报里的分节标题（几个类别可以共用一节；节的先后在 packages/backend/src/reports/edition.ts 里排）；guide 告诉结构抽取模型这一类收什么、
 * 和相邻类别的边界在哪（总的归类原则写在 prompts/structure.md 里）。
 * commentary 标出评论类（教程、观点）：日报写过的事又有评论类的后续报道，只占一行快讯（报道它的信源够多时除外）。
 * 没归上类的资料在日报里放进第一个 key 为 industry 的类别所在的节（没有就放最后一节）。
 * tagColor 是飞书推送卡片里跟在标题后面的这一类小标签的颜色（飞书 text_tag 的颜色名）。
 * feedLabel 是分类 RSS 标题里的名字（不写就用 label）。公开接口、RSS 和 MCP 里要把一类并进另一类发布，写在站点设置里（site/site.ts 的 PUBLIC_CATEGORIES）。
 */
export const CATEGORIES = [
  { key: "notices", tagColor: "blue", label: "通知公告", section: "通知公告", guide: "面向师生的正式通知、公告与公示：教务安排、考试报名、选课、放假、停水停电、后勤服务、规章制度。与学校要闻的边界：通知是要求读者按之行动或知晓的安排，不是对已发生事件的报道；讲座与活动预告归学生·社团。" },
  { key: "campus", tagColor: "green", label: "学校要闻", feedLabel: "学校要闻", section: "学校要闻", guide: "学校层面的重要新闻：重要会议与决策、校领导重要活动、上级视察、发展规划、重大合作与揭牌。院系的一般性工作报道归学生·社团或科研学术；纯安排类文字归通知公告。" },
  { key: "research", tagColor: "violet", label: "科研学术", section: "学术前沿", guide: "学术前沿：科研成果报道、项目立项、科研奖励、学术会议与学科建设进展。单篇论文的发表（本校或外校，含期刊与预印本）归论文类；学者因成果获得个人荣誉归人物·荣誉；讲座预告归学生·社团。" },
  { key: "papers", tagColor: "violet", label: "论文", section: "论文", guide: "单篇论文与研究报告的发表：期刊论文、会议论文、预印本（arXiv）与期刊目录动态。以论文本身为主体，来源多为 Nature、Science、Cell、arXiv 一类学术信源；围绕论文的新闻报道与综述归科研学术，校内的成果报道（项目、奖励）也归科研学术。" },
  { key: "admissions", tagColor: "orange", label: "招生就业", section: "招生就业", guide: "招生政策与简章、保研推免、考研复试、学位与培养政策变化，以及招聘会、双选会、就业指导。政策文件的原文通知归通知公告，解读与进展归此类。" },
  { key: "student", tagColor: "turquoise", label: "学生·社团", section: "学生·社团", guide: "学生工作与院系动态、社团活动、讲座与活动预告、校园文化与体育赛事。正式的事务性安排归通知公告；学术成果归科研学术。" },
  { key: "people", tagColor: "purple", label: "人物·荣誉", section: "人物·荣誉", guide: "师生获奖、荣誉表彰、学者事迹与校友动态。成果本身归科研学术，授予人的荣誉归此类。" },
  { key: "ai", tagColor: "indigo", label: "AI前沿", feedLabel: "AI前沿", section: "未来智能", guide: "未来智能板块的 AI 行业动态：新模型与重要产品发布、重要研究进展、行业大事。边界：吉林大学自己的 AI 科研成果归科研学术，单篇论文的发表归论文类，学校的信息化建设通知归通知公告；这里只收来自 AI 行业信源的行业消息。" },
] as const satisfies ReadonlyArray<{ key: string; tagColor: string; label: string; feedLabel?: string; section: string; guide: string; commentary?: true }>;

/**
 * 这个行业最受关注的一类发布（AI 行业是新模型）：日报报头的“N 个新模型”、改分类后修订已出的报告都按它数。
 * category 是类别，tag 是标签，两者都对上才算；unit 接在数字后面。
 * 没有这样一类的行业设成 null，报头就不显示这个数。
 */
export const RELEASE: { category: string; tag: string; unit: string } | null = null;

/** 周报月报的总述可以直接写、不必在报道里找到出处的行业通用词（小写）。站名会自动算进去。 */
export const PLAIN_TERMS: readonly string[] = ["jlu", "985", "211", "双一流", "ai", "openai", "gpt", "大模型"];

/**
 * 内容理解一步给每篇资料判的“内容类型”（写在 prompts/content-understanding.md 里，改了类型要同步改那份提示词）。
 * 评分提示词（prompts/selection-score.md）按类型给五个维度不同的权重。
 */
export const ITEM_TYPES = ["notice_announcement", "policy_change", "research_result", "campus_event", "activity_announcement", "honor_recognition", "service_info", "model_release", "product_launch", "tool_or_prompt", "research_paper", "industry_event", "opinion_analysis", "tutorial_explainer"] as const;

// ── 标签词表 ────────────────────────────────────────────────────────────────────────────

/** 每篇资料的第一个标签必须是这些“分类标签”之一。 */
export const CATEGORY_TAGS = [
  "通知公告", "学校要闻", "科研/学术", "论文", "招生/就业", "学生/社团", "人物/荣誉", "讲座/活动", "后勤/服务", "媒体吉大", "AI/前沿", "其他",
] as const;

/** 可选的主题标签。 */
export const TOPIC_TAGS = [
  "教务", "考试", "选课", "奖学金/资助", "保研/推免", "考研/复试", "招生", "就业/招聘", "论文/成果", "学术讲座", "学科建设", "对外合作", "校园文化", "体育/运动会", "后勤/基建", "校友", "大模型", "AI产品", "AI研究",
] as const;

/** 可选的实体标签（学校机关、机构、主管部门）。 */
export const ENTITY_TAGS = ["吉林大学", "教务处", "研究生院", "学生工作部", "校团委", "图书馆", "后勤处", "保卫处", "校医院", "教育部", "吉林省"] as const;

/** 模型常写的近义词，统一成词表里的写法。 */
export const TAG_SYNONYMS: Readonly<Record<string, string>> = {
  通知: "通知公告", 公告: "通知公告", 公示: "通知公告", 通告: "通知公告",
  要闻: "学校要闻", 焦点: "学校要闻", 焦点新闻: "学校要闻",
  科研: "科研/学术", 学术: "科研/学术", 研究: "科研/学术",
  讲座: "学术讲座", 报告会: "学术讲座", 讲座预告: "学术讲座",
  推免: "保研/推免", 保研: "保研/推免", 研究生推免: "保研/推免",
  考研: "考研/复试", 复试: "考研/复试",
  奖学金: "奖学金/资助", 助学金: "奖学金/资助", 资助: "奖学金/资助",
  招生简章: "招生", 本科招生: "招生",
  就业: "就业/招聘", 招聘: "就业/招聘", 求职: "就业/招聘", 双选会: "就业/招聘",
  活动: "学生/社团", 社团: "学生/社团", 学生会: "学生/社团",
  获奖: "人物/荣誉", 荣誉: "人物/荣誉", 表彰: "人物/荣誉",
  后勤: "后勤/服务", 服务: "后勤/服务", 停水停电: "后勤/服务",
  基建: "后勤/基建", 运动会: "体育/运动会", 体育: "体育/运动会", 文艺: "校园文化",
};

// ── 机构与主体 ──────────────────────────────────────────────────────────────────────────

/**
 * 机构与公司主题：id → 显示名、卡片上显示的标签（null 表示只用 entity:<id> 归类）、别名。
 * aliases 给结构抽取模型看；orgNames 是机构或公司发消息时开头用的组织名，otherNames 是其他称呼（官方账号名、子品牌）；
 * 这些名字都用于识别事实主体和发布方。
 */
export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[]; orgNames?: string[]; otherNames?: string[] }> = {
  jlu: { name: "吉林大学", displayTag: "吉林大学", aliases: ["吉林大学", "吉大", "JLU", "Jilin University"], orgNames: ["吉林大学"], otherNames: ["吉林大学新闻网", "吉大新闻"] },
  "jlu-news-center": { name: "吉林大学新闻中心", displayTag: null, aliases: ["吉林大学新闻中心", "吉大新闻中心", "党委宣传部"] },
  "jlu-president-office": { name: "校长办公室", displayTag: null, aliases: ["校长办公室", "校长办"] },
  "jlu-registrar": { name: "教务处", displayTag: "教务处", aliases: ["教务处", "本科生院"] },
  "jlu-graduate-school": { name: "研究生院", displayTag: "研究生院", aliases: ["研究生院", "党委研究生工作部", "研究生工作部"] },
  "jlu-student-affairs": { name: "学生工作部", displayTag: "学生工作部", aliases: ["学生工作部", "学工部", "党委学生工作部"] },
  "jlu-youth-league": { name: "校团委", displayTag: "校团委", aliases: ["校团委", "共青团吉林大学委员会"] },
  "jlu-library": { name: "图书馆", displayTag: "图书馆", aliases: ["吉林大学图书馆", "图书馆"] },
  "jlu-cst": { name: "计算机科学与技术学院", displayTag: null, aliases: ["计算机科学与技术学院", "计算机学院"] },
  "jlu-software": { name: "软件学院", displayTag: null, aliases: ["软件学院"] },
  "jlu-law": { name: "法学院", displayTag: null, aliases: ["法学院"] },
  "jlu-chem": { name: "化学学院", displayTag: null, aliases: ["化学学院"] },
  "jlu-physics": { name: "物理学院", displayTag: null, aliases: ["物理学院"] },
  "jlu-math": { name: "数学学院", displayTag: null, aliases: ["数学学院"] },
  "jlu-medicine": { name: "白求恩医学部", displayTag: null, aliases: ["白求恩医学部", "医学部"] },
  "jlu-econ": { name: "经济学院", displayTag: null, aliases: ["经济学院"] },
  "jlu-busi": { name: "商学院", displayTag: null, aliases: ["商学院"] },
  "jlu-foreign": { name: "外国语学院", displayTag: null, aliases: ["外国语学院"] },
  "jlu-journalism": { name: "新闻与传播学院", displayTag: null, aliases: ["新闻与传播学院"] },
  "jlu-auto": { name: "汽车工程学院", displayTag: null, aliases: ["汽车工程学院"] },
  "jlu-bio": { name: "生命科学学院", displayTag: null, aliases: ["生命科学学院"] },
  "world-labs": { name: "World Labs", displayTag: null, aliases: ["World Labs"] },
  "thinking-machines": { name: "Thinking Machines Lab", displayTag: null, aliases: ["Thinking Machines"] },
  amd: { name: "AMD", displayTag: null, aliases: ["AMD", "Advanced Micro Devices"] },
  openai: { name: "OpenAI", displayTag: "OpenAI", aliases: ["OpenAI", "ChatGPT", "Sora", "Codex", "GPT"], orgNames: ["OpenAI"], otherNames: ["OpenAI Developers"] },
  anthropic: { name: "Anthropic", displayTag: "Anthropic", aliases: ["Anthropic", "Claude"], orgNames: ["Anthropic"], otherNames: ["Claude Code"] },
  google: { name: "Google", displayTag: "Google", aliases: ["Google", "DeepMind", "Gemini", "谷歌"], orgNames: ["Google DeepMind", "Google Research", "Google", "DeepMind", "谷歌"], otherNames: ["Google AI", "Google Labs", "Google Cloud"] },
  deepseek: { name: "DeepSeek", displayTag: "DeepSeek", aliases: ["DeepSeek", "深度求索"], orgNames: ["DeepSeek", "深度求索"] },
  qwen: { name: "千问 Qwen", displayTag: null, aliases: ["Qwen", "通义", "阿里"], orgNames: ["通义千问", "通义实验室", "阿里巴巴", "阿里云", "阿里", "Qwen Team", "Qwen", "Alibaba"], otherNames: ["千问", "千问APP", "Alibaba Cloud"] },
  kimi: { name: "Kimi / 月之暗面", displayTag: null, aliases: ["Kimi", "月之暗面", "Moonshot"], orgNames: ["Moonshot AI", "月之暗面", "Kimi"] },
  minimax: { name: "MiniMax", displayTag: null, aliases: ["MiniMax", "海螺"], orgNames: ["MiniMax", "稀宇科技"] },
  zhipu: { name: "智谱 GLM", displayTag: null, aliases: ["智谱", "GLM", "Z.ai"], orgNames: ["智谱AI", "智谱", "Zhipu AI", "Z.ai"], otherNames: ["Zhipu"] },
  xai: { name: "xAI", displayTag: "xAI", aliases: ["xAI", "Grok"], orgNames: ["SpaceX Super Intelligence", "SpaceXAI", "SpaceXSI", "xAI"], otherNames: ["Grok Bot"] },
  meta: { name: "Meta", displayTag: "Meta", aliases: ["Meta", "Llama"], orgNames: ["Meta Superintelligence Labs", "Meta AI", "Meta"], otherNames: ["AI at Meta", "Muse"] },
  microsoft: { name: "Microsoft", displayTag: "Microsoft", aliases: ["Microsoft", "微软", "Copilot"], orgNames: ["Microsoft Research", "Microsoft AI", "Microsoft", "微软"] },
  nvidia: { name: "NVIDIA", displayTag: null, aliases: ["NVIDIA", "英伟达"], orgNames: ["NVIDIA", "英伟达"] },
  "hugging-face": { name: "Hugging Face", displayTag: "Hugging Face", aliases: ["Hugging Face"], orgNames: ["Hugging Face", "HuggingFace"] },
  cursor: { name: "Cursor", displayTag: null, aliases: ["Cursor", "Anysphere"], orgNames: ["Cursor"] },
  openrouter: { name: "OpenRouter", displayTag: null, aliases: ["OpenRouter"], orgNames: ["OpenRouter"] },
};

/**
 * 身份词典：摘要和标题里出现的机构，必须在原文里也出现过，否则退回原标题、丢掉摘要（防止模型张冠李戴）。
 * 行业没有这个问题时可以留空数组。
 */
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = [
  { id: "jlu", name: "吉林大学", patterns: [/吉林大学|吉大|\bJLU\b|Jilin University/i] },
  { id: "jlu-registrar", name: "教务处", patterns: [/教务处|本科生院/] },
  { id: "jlu-graduate-school", name: "研究生院", patterns: [/研究生院|研究生工作部/] },
  { id: "jlu-student-affairs", name: "学生工作部", patterns: [/学生工作部|学工部/] },
  { id: "jlu-youth-league", name: "校团委", patterns: [/校团委|共青团吉林大学委员会/] },
  { id: "jlu-library", name: "图书馆", patterns: [/图书馆/] },
  { id: "jlu-cst", name: "计算机科学与技术学院", patterns: [/计算机科学与技术学院|计算机学院/] },
  { id: "jlu-law", name: "法学院", patterns: [/法学院/] },
  { id: "jlu-chem", name: "化学学院", patterns: [/化学学院/] },
  { id: "jlu-physics", name: "物理学院", patterns: [/物理学院/] },
  { id: "jlu-medicine", name: "白求恩医学部", patterns: [/白求恩医学部/] },
  { id: "openai", name: "OpenAI", patterns: [/openai|chatgpt|\bgpt-?[o\d]|\bsora\b|\bcodex\b/i] },
  { id: "anthropic", name: "Anthropic", patterns: [/anthropic|\bclaude\b/i, /\b(?:opus|sonnet|haiku)\s*\d+(?:[.\-]\d+)*\b/i, /\bfable\s*\d+(?:[.\-]\d+)*\b|\bmythos\b/i] },
  { id: "google", name: "Google / Gemini", patterns: [/google|deepmind|\bgemini\b|notebooklm|\bveo\s?\d|\bAlphaFold\b|\bAMIE\b/i] },
  { id: "deepseek", name: "DeepSeek", patterns: [/deepseek|深度求索/i] },
  { id: "xai", name: "xAI / Grok", patterns: [/\bxai\b|\bgrok\b/i] },
  { id: "meta", name: "Meta / Llama", patterns: [/\bMeta\b/, /\bmeta\s?ai\b|\bllama\b/i] },
  { id: "microsoft", name: "Microsoft / Copilot", patterns: [/microsoft|copilot|微软/i] },
  { id: "nvidia", name: "NVIDIA", patterns: [/nvidia|英伟达|\bnemotron\b|\bnemo\b|\bblackwell\b|\brubin(?:\s+ultra)?\b|\bcuda\b/i] },
  { id: "qwen", name: "千问 Qwen", patterns: [/\bqwen|通义|千问/i] },
  { id: "hugging-face", name: "Hugging Face", patterns: [/hugging\s?face/i] },
  { id: "cursor", name: "Cursor", patterns: [/\bCursor\b/] },
  { id: "kimi", name: "Kimi / 月之暗面", patterns: [/\bkimi\b|月之暗面|\bmoonshot\s?ai\b/i] },
  { id: "openrouter", name: "OpenRouter", patterns: [/openrouter/i] },
  { id: "minimax", name: "MiniMax", patterns: [/minimax/i] },
  { id: "zhipu", name: "智谱 GLM", patterns: [/智谱|\bglm-?[4-9]/i] },
  { id: "hunyuan", name: "腾讯混元", patterns: [/混元|hunyuan/i] },
  { id: "doubao", name: "字节豆包", patterns: [/豆包|doubao|字节跳动|bytedance/i] },
  { id: "mistral", name: "Mistral", patterns: [/mistral/i] },
  { id: "perplexity", name: "Perplexity", patterns: [/\bPerplexity\b/] },
  { id: "runway", name: "Runway", patterns: [/\brunway\b/i] },
  { id: "suno", name: "Suno", patterns: [/\bsuno\b/i] },
  { id: "midjourney", name: "Midjourney", patterns: [/midjourney/i] },
  { id: "stability-ai", name: "Stability AI", patterns: [/stability\s?ai/i] },
  { id: "elevenlabs", name: "ElevenLabs", patterns: [/eleven\s?labs/i] },
  { id: "vllm", name: "vLLM", patterns: [/\bvllm\b/i] },
  { id: "ollama", name: "Ollama", patterns: [/\bollama\b/i] },
  { id: "windsurf", name: "Windsurf", patterns: [/windsurf/i] },
  { id: "devin", name: "Devin", patterns: [/\bdevin\b/i] },
  { id: "manus", name: "Manus", patterns: [/\bmanus\b/i] },
  { id: "apple", name: "Apple AI", patterns: [/\bapple\s?(intelligence|silicon|ai)\b|苹果(智能|\s?AI)/i] },
  { id: "amazon", name: "Amazon / AWS", patterns: [/amazon|\baws\b|亚马逊/i] },
  { id: "baidu", name: "百度文心", patterns: [/百度|baidu|文心|\bernie\s?bot\b/i] },
];

/** 这些域名上的文章，发布方就是对应的机构（托管平台不算）。 */
export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = [
  { entityId: "jlu", domains: ["jlu.edu.cn", "oa.jlu.edu.cn"] },
  { entityId: "jlu-news-center", domains: ["news.jlu.edu.cn"] },
];

/** 原文里的这些写法也算提到了对应机构。 */
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [
  { entityId: "jlu", pattern: /吉林大学新闻网|吉林大学官方微信|吉林大学官方微博/ },
  { entityId: "jlu-news-center", pattern: /吉大新闻|新闻中心/ },
];
