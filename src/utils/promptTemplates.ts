export type TemplateFlagKey =
  | 'basic'
  | 'ultra'
  | 'targeted6'
  | 'twentyCycles'
  | 'turnitout'
  | 'lynote'
  | 'dadaNanjesha'
  | 'blader'
  | 'perplexityTopics';

export type TemplateFlags = Record<TemplateFlagKey, boolean>;

export interface PromptTemplateConfig {
  flags: TemplateFlags;
  v2StyleIntensity: 1 | 2 | 3 | 4 | 5;
  v2CustomInstructions: string;
  styleIntensity: number;
  promptStrategy: string;
  academicCustomInstructions: string;
  draftStrength: number;
  selectedModel?: string;
  unfilteredMode?: boolean;
}

export interface PromptTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  isBuiltIn: boolean;
  createdAt: number;
  updatedAt: number;
  config: PromptTemplateConfig;
}

export const PROMPT_TEMPLATES_STORAGE_KEY = 'promptgpt_prompt_templates_v1';

const ALL_TEMPLATE_FLAG_KEYS: readonly TemplateFlagKey[] = [
  'basic',
  'ultra',
  'targeted6',
  'twentyCycles',
  'turnitout',
  'lynote',
  'dadaNanjesha',
  'blader',
  'perplexityTopics',
];

export function makeTemplateFlags(enabled: readonly TemplateFlagKey[]): TemplateFlags {
  return Object.fromEntries(
    ALL_TEMPLATE_FLAG_KEYS.map((key) => [key, enabled.includes(key)]),
  ) as TemplateFlags;
}

export const BUILT_IN_PROMPT_TEMPLATES: readonly PromptTemplate[] = [
  {
    id: 'builtin-academic-monograph',
    name: 'Академическая статья / монография',
    category: 'Научный стиль',
    description: 'Точная терминология, слом n-грамм, зачистка ИИ-клише и 20 циклов сближения с донором.',
    isBuiltIn: true,
    createdAt: 1700000000001,
    updatedAt: 1700000000001,
    config: {
      flags: makeTemplateFlags(['basic', 'ultra', 'targeted6', 'twentyCycles', 'turnitout', 'blader']),
      v2StyleIntensity: 4,
      v2CustomInstructions:
        'Выдерживай строгий научный тон, сохраняй терминологическую точность, избегай канцелярских штампов и шаблонных вводных конструкций.',
      styleIntensity: 8,
      promptStrategy:
        'Академическая логика, живое чередование коротких тезисов и сложных периодов, без клише.',
      academicCustomInstructions:
        'Строго соблюдай научную точность и заменяй глагол «является» на живые предикаты или тире.',
      draftStrength: 9,
    },
  },
  {
    id: 'builtin-essay-voice',
    name: 'Философское / публицистическое эссе',
    category: 'Публицистика',
    description: 'Живая авторская каденция, активный залог и высокий разброс длины предложений.',
    isBuiltIn: true,
    createdAt: 1700000000002,
    updatedAt: 1700000000002,
    config: {
      flags: makeTemplateFlags(['basic', 'ultra', 'twentyCycles', 'lynote', 'dadaNanjesha', 'perplexityTopics']),
      v2StyleIntensity: 5,
      v2CustomInstructions:
        'Глубокая синтаксическая пересборка под ритм донора: сочетай афористичные короткие фразы с развёрнутыми рассуждениями и активным залогом.',
      styleIntensity: 9,
      promptStrategy:
        'Образность, выразительная авторская каденция, активный залог, высокий разброс длины предложений.',
      academicCustomInstructions: '',
      draftStrength: 10,
    },
  },
  {
    id: 'builtin-max-donor-dna',
    name: 'Максимальный перенос ДНК донора',
    category: 'Точный клон стиля',
    description: 'Максимальная перестройка синтаксиса, ритма, связок и пунктуационной плотности под донора.',
    isBuiltIn: true,
    createdAt: 1700000000003,
    updatedAt: 1700000000003,
    config: {
      flags: makeTemplateFlags(['basic', 'ultra', 'twentyCycles', 'turnitout', 'lynote', 'blader']),
      v2StyleIntensity: 5,
      v2CustomInstructions:
        'Полностью откажись от исходного синтаксиса. Воспроизводи не только ритм и связки донора, но и его пунктуационную плотность, разговорные обороты и неровности речи.',
      styleIntensity: 10,
      promptStrategy:
        'Точное копирование авторских неровностей, пунктуации и ритма донора без литературного сглаживания.',
      academicCustomInstructions: '',
      draftStrength: 10,
    },
  },
  {
    id: 'builtin-business-analytics',
    name: 'Деловая аналитика без ИИ-маркеров',
    category: 'Бизнес / Аналитика',
    description: 'Ясные активные формулировки без воды, пассивных цепочек и шаблонных выводов.',
    isBuiltIn: true,
    createdAt: 1700000000004,
    updatedAt: 1700000000004,
    config: {
      flags: makeTemplateFlags(['basic', 'targeted6', 'turnitout', 'dadaNanjesha', 'blader', 'perplexityTopics']),
      v2StyleIntensity: 4,
      v2CustomInstructions:
        'Пиши чётко, конкретно и по делу; перестраивай длинные пассивные конструкции в прямые активные предложения.',
      styleIntensity: 7,
      promptStrategy:
        'Чёткая деловая аналитика, активный залог, минимум вводной воды и шаблонов.',
      academicCustomInstructions:
        'Исключи абстрактные вводные обороты и нагромождения родительных падежей.',
      draftStrength: 7,
    },
  },
];

export function countActiveTemplateFlags(flags: Record<string, boolean>): number {
  return ALL_TEMPLATE_FLAG_KEYS.filter((key) => Boolean(flags[key])).length;
}

export function normalizeTemplateFlags(raw: unknown): TemplateFlags {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(
    ALL_TEMPLATE_FLAG_KEYS.map((key) => [key, Boolean(obj[key])]),
  ) as TemplateFlags;
}

export function createCustomPromptTemplate(input: {
  name: string;
  category?: string;
  description?: string;
  config: PromptTemplateConfig;
  now?: number;
}): PromptTemplate {
  const trimmedName = input.name.trim();
  if (!trimmedName) {
    throw new Error('Название шаблона не может быть пустым.');
  }
  const timestamp = input.now ?? Date.now();
  return {
    id: `tpl-${timestamp}-${Math.random().toString(36).slice(2, 7)}`,
    name: trimmedName,
    category: input.category?.trim() || 'Пользовательский',
    description: input.description?.trim() || '',
    isBuiltIn: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    config: {
      flags: normalizeTemplateFlags(input.config.flags),
      v2StyleIntensity: Math.max(1, Math.min(5, Math.round(input.config.v2StyleIntensity || 5))) as 1 | 2 | 3 | 4 | 5,
      v2CustomInstructions: input.config.v2CustomInstructions ?? '',
      styleIntensity: Math.max(1, Math.min(10, Math.round(input.config.styleIntensity || 9))),
      promptStrategy: input.config.promptStrategy ?? '',
      academicCustomInstructions: input.config.academicCustomInstructions ?? '',
      draftStrength: Math.max(1, Math.min(10, Math.round(input.config.draftStrength || 10))),
      ...(input.config.selectedModel ? { selectedModel: input.config.selectedModel } : {}),
      ...(typeof input.config.unfilteredMode === 'boolean' ? { unfilteredMode: input.config.unfilteredMode } : {}),
    },
  };
}

export function parseStoredCustomTemplates(rawJson: string | null): PromptTemplate[] {
  if (!rawJson) return [];
  try {
    const parsed = JSON.parse(rawJson);
    if (!Array.isArray(parsed)) return [];
    const results: PromptTemplate[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const candidate = item as Record<string, unknown>;
      if (typeof candidate.id !== 'string' || !candidate.id.trim()) continue;
      if (typeof candidate.name !== 'string' || !candidate.name.trim()) continue;
      const cfg = candidate.config && typeof candidate.config === 'object'
        ? (candidate.config as Record<string, unknown>)
        : null;
      if (!cfg) continue;
      const v2Intensity = Number(cfg.v2StyleIntensity);
      const styleIntensity = Number(cfg.styleIntensity);
      const draftStrength = Number(cfg.draftStrength);
      results.push({
        id: candidate.id,
        name: candidate.name.trim(),
        category: typeof candidate.category === 'string' && candidate.category.trim()
          ? candidate.category.trim()
          : 'Пользовательский',
        description: typeof candidate.description === 'string' ? candidate.description : '',
        isBuiltIn: false,
        createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : Date.now(),
        updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : Date.now(),
        config: {
          flags: normalizeTemplateFlags(cfg.flags),
          v2StyleIntensity: (Number.isFinite(v2Intensity)
            ? Math.max(1, Math.min(5, Math.round(v2Intensity)))
            : 5) as 1 | 2 | 3 | 4 | 5,
          v2CustomInstructions: typeof cfg.v2CustomInstructions === 'string' ? cfg.v2CustomInstructions : '',
          styleIntensity: Number.isFinite(styleIntensity)
            ? Math.max(1, Math.min(10, Math.round(styleIntensity)))
            : 9,
          promptStrategy: typeof cfg.promptStrategy === 'string' ? cfg.promptStrategy : '',
          academicCustomInstructions:
            typeof cfg.academicCustomInstructions === 'string' ? cfg.academicCustomInstructions : '',
          draftStrength: Number.isFinite(draftStrength)
            ? Math.max(1, Math.min(10, Math.round(draftStrength)))
            : 10,
          ...(typeof cfg.selectedModel === 'string' && cfg.selectedModel.trim()
            ? { selectedModel: cfg.selectedModel.trim() }
            : {}),
          ...(typeof cfg.unfilteredMode === 'boolean' ? { unfilteredMode: cfg.unfilteredMode } : {}),
        },
      });
    }
    return results;
  } catch {
    return [];
  }
}

export function filterPromptTemplates(
  templates: readonly PromptTemplate[],
  query: string,
  scope: 'all' | 'custom' | 'builtin',
): PromptTemplate[] {
  const q = query.trim().toLowerCase();
  return templates.filter((tpl) => {
    if (scope === 'custom' && tpl.isBuiltIn) return false;
    if (scope === 'builtin' && !tpl.isBuiltIn) return false;
    if (!q) return true;
    const haystack = [
      tpl.name,
      tpl.category,
      tpl.description,
      tpl.config.v2CustomInstructions,
      tpl.config.promptStrategy,
      tpl.config.academicCustomInstructions,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}