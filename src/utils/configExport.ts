export type ExportHistoryType = 'humanizer' | 'draft' | 'academic-39' | 'style-dna';

export interface ExportableHistoryItem {
  id: string;
  timestamp: number;
  type: ExportHistoryType;
  strengthOrIntensity: number;
  inputText: string;
  outputText: string;
}

export interface PromptGptExportInput {
  exportedAt?: string;
  activeTab: string;
  selectedModel: string;
  selectedModelName: string;
  unfilteredMode: boolean;
  v2ModelId: string;
  v2StyleIntensity: 1 | 2 | 3 | 4 | 5;
  v2CustomInstructions: string;
  flags: Record<string, boolean>;
  detectorShields: Record<string, boolean>;
  styleIntensity: number;
  promptStrategy: string;
  draftStrength: number;
  draftCustomInstructions: string;
  academicCustomInstructions: string;
  history: ReadonlyArray<ExportableHistoryItem>;
}

export interface PromptGptExportPayload {
  schemaVersion: 'promptgpt-export-v1';
  exportedAt: string;
  activeTab: string;
  settings: {
    global: {
      selectedModel: string;
      selectedModelName: string;
      unfilteredMode: boolean;
    };
    promptgptV2: {
      modelId: string;
      styleIntensity: 1 | 2 | 3 | 4 | 5;
      customInstructions: string;
      unfilteredMode: boolean;
    };
    styleDna: {
      flags: Record<string, boolean>;
      activeModules: string[];
      detectorShields: Record<string, boolean>;
      activeShields: string[];
    };
    humanizer: {
      styleIntensity: number;
      promptStrategy: string;
    };
    draftWorkshop: {
      draftStrength: number;
      customInstructions: string;
    };
    academic39: {
      customInstructions: string;
    };
  };
  historyCount: number;
  history: Array<ExportableHistoryItem & { isoTimestamp: string }>;
}

export function buildConfigAndHistoryExportPayload(
  input: PromptGptExportInput,
): PromptGptExportPayload {
  const exportedAt = input.exportedAt ?? new Date().toISOString();
  const flagsCopy: Record<string, boolean> = { ...input.flags };
  const shieldsCopy: Record<string, boolean> = { ...input.detectorShields };

  return {
    schemaVersion: 'promptgpt-export-v1',
    exportedAt,
    activeTab: input.activeTab,
    settings: {
      global: {
        selectedModel: input.selectedModel,
        selectedModelName: input.selectedModelName,
        unfilteredMode: Boolean(input.unfilteredMode),
      },
      promptgptV2: {
        modelId: input.v2ModelId,
        styleIntensity: input.v2StyleIntensity,
        customInstructions: input.v2CustomInstructions,
        unfilteredMode: Boolean(input.unfilteredMode),
      },
      styleDna: {
        flags: flagsCopy,
        activeModules: Object.entries(flagsCopy)
          .filter(([, enabled]) => Boolean(enabled))
          .map(([key]) => key),
        detectorShields: shieldsCopy,
        activeShields: Object.entries(shieldsCopy)
          .filter(([, enabled]) => Boolean(enabled))
          .map(([key]) => key),
      },
      humanizer: {
        styleIntensity: input.styleIntensity,
        promptStrategy: input.promptStrategy,
      },
      draftWorkshop: {
        draftStrength: input.draftStrength,
        customInstructions: input.draftCustomInstructions,
      },
      academic39: {
        customInstructions: input.academicCustomInstructions,
      },
    },
    historyCount: input.history.length,
    history: input.history.map((item) => ({
      id: item.id,
      timestamp: item.timestamp,
      isoTimestamp: Number.isFinite(item.timestamp)
        ? new Date(item.timestamp).toISOString()
        : exportedAt,
      type: item.type,
      strengthOrIntensity: item.strengthOrIntensity,
      inputText: item.inputText,
      outputText: item.outputText,
    })),
  };
}

export function buildConfigExportFilename(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') +
    '_' +
    [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join('-');
  return `promptgpt-config-history-${stamp}.json`;
}