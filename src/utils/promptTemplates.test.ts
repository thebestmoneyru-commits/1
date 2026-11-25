import {
  BUILT_IN_PROMPT_TEMPLATES,
  countActiveTemplateFlags,
  createCustomPromptTemplate,
  filterPromptTemplates,
  makeTemplateFlags,
  parseStoredCustomTemplates,
} from './promptTemplates';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`promptTemplates test failed: ${message}`);
  }
}

assert(BUILT_IN_PROMPT_TEMPLATES.length >= 4, 'built-in stylistic templates should be preloaded');
assert(
  BUILT_IN_PROMPT_TEMPLATES.every((t) => t.isBuiltIn && countActiveTemplateFlags(t.config.flags) >= 4),
  'every built-in template must configure module flags',
);

const created = createCustomPromptTemplate({
  name: '  Юридический обзор  ',
  category: 'Право',
  description: 'Точный правовой анализ без канцелярита',
  config: {
    flags: makeTemplateFlags(['basic', 'twentyCycles', 'blader']),
    v2StyleIntensity: 5,
    v2CustomInstructions: 'Сохраняй все юридические оговорки и сроки.',
    styleIntensity: 8,
    promptStrategy: 'Лаконичные выводы после сложных периодов',
    academicCustomInstructions: 'Без шаблонных связок',
    draftStrength: 9,
    selectedModel: 'gemini-4-hydrogen',
    unfilteredMode: false,
  },
  now: 1732445000000,
});

assert(created.name === 'Юридический обзор', 'template name must be trimmed');
assert(created.isBuiltIn === false, 'user template must be marked custom');
assert(countActiveTemplateFlags(created.config.flags) === 3, 'active module flag count must match');
assert(created.config.selectedModel === 'gemini-4-hydrogen', 'model preference should persist in template');

const roundtripped = parseStoredCustomTemplates(JSON.stringify([created, { invalid: true }]));
assert(roundtripped.length === 1 && roundtripped[0].id === created.id, 'valid custom templates must roundtrip cleanly');
assert(
  roundtripped[0].config.v2CustomInstructions === 'Сохраняй все юридические оговорки и сроки.',
  'custom instructions must survive storage roundtrip',
);

const all = [created, ...BUILT_IN_PROMPT_TEMPLATES];
assert(filterPromptTemplates(all, '', 'custom').length === 1, 'custom scope must filter only custom templates');
assert(
  filterPromptTemplates(all, 'юридическ', 'all').length === 1,
  'search query must match template name/instructions',
);
assert(
  filterPromptTemplates(all, 'непредсказуем-несуществующий-токен', 'all').length === 0,
  'non-matching search must return empty list',
);

console.log('promptTemplates self-test: PASS');
