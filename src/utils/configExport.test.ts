import {
  buildConfigAndHistoryExportPayload,
  buildConfigExportFilename,
} from './configExport';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`configExport test failed: ${message}`);
  }
}

const payload = buildConfigAndHistoryExportPayload({
  exportedAt: '2026-11-24T10:15:00.000Z',
  activeTab: 'style-dna',
  selectedModel: 'gemini-3.1-flash-lite',
  selectedModelName: 'Gemini 3.1 Flash-Lite',
  unfilteredMode: true,
  v2ModelId: 'gemini-4-hydrogen',
  v2StyleIntensity: 5,
  v2CustomInstructions: 'Сохраняй длинные абзацы донора',
  flags: { basic: true, ultra: true, blader: false },
  detectorShields: { binoculars: true, sloptotal: false },
  styleIntensity: 9,
  promptStrategy: 'Больше разговорных связок',
  draftStrength: 8,
  draftCustomInstructions: 'Черновик в научном тоне',
  academicCustomInstructions: 'Строго без вводных клише',
  history: [
    {
      id: 'h-1',
      timestamp: 1732443300000,
      type: 'style-dna',
      strengthOrIntensity: 100,
      inputText: 'Исходный текст',
      outputText: 'Преобразованный текст',
    },
  ],
});

assert(payload.schemaVersion === 'promptgpt-export-v1', 'schemaVersion must match');
assert(payload.settings.global.unfilteredMode === true, 'global.unfilteredMode must be preserved');
assert(payload.settings.promptgptV2.modelId === 'gemini-4-hydrogen', 'v2 modelId must be preserved');
assert(payload.settings.promptgptV2.styleIntensity === 5, 'v2 styleIntensity must be preserved');
assert(
  payload.settings.promptgptV2.customInstructions === 'Сохраняй длинные абзацы донора',
  'v2 customInstructions must be preserved',
);
assert(
  payload.settings.styleDna.activeModules.length === 2 &&
    payload.settings.styleDna.activeModules.includes('basic') &&
    payload.settings.styleDna.activeModules.includes('ultra'),
  'activeModules must list enabled module flags',
);
assert(
  payload.settings.styleDna.activeShields.length === 1 &&
    payload.settings.styleDna.activeShields[0] === 'binoculars',
  'activeShields must list enabled shields',
);
assert(payload.settings.humanizer.styleIntensity === 9, 'humanizer intensity must be preserved');
assert(payload.settings.humanizer.promptStrategy === 'Больше разговорных связок', 'humanizer promptStrategy must be preserved');
assert(payload.settings.draftWorkshop.draftStrength === 8, 'draftStrength must be preserved');
assert(payload.settings.academic39.customInstructions === 'Строго без вводных клише', 'academic customInstructions must be preserved');
assert(payload.historyCount === 1 && payload.history.length === 1, 'historyCount and history entries must match');
assert(payload.history[0]?.isoTimestamp === new Date(1732443300000).toISOString(), 'history item isoTimestamp must be formatted');
assert(!('v2AccessKey' in JSON.parse(JSON.stringify(payload))), 'access keys must never be serialized');

const filename = buildConfigExportFilename(new Date(2026, 10, 24, 2, 15, 9));
assert(filename === 'promptgpt-config-history-2026-11-24_02-15-09.json', `unexpected filename: ${filename}`);

console.log('configExport self-test: PASS');
