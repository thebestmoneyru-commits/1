import React, { useMemo, useState } from 'react';
import {
  BookmarkPlus,
  BookMarked,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Layers,
  RefreshCw,
  Search,
  Sliders,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  countActiveTemplateFlags,
  filterPromptTemplates,
  type PromptTemplate,
} from '../utils/promptTemplates';

interface PromptTemplateSidebarProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  templates: readonly PromptTemplate[];
  activeTemplateId: string | null;
  currentFlagsCount: number;
  currentV2Intensity: 1 | 2 | 3 | 4 | 5;
  currentHumanizerIntensity: number;
  onSaveTemplate: (input: { name: string; category: string; description: string }) => void;
  onApplyTemplate: (template: PromptTemplate) => void;
  onUpdateCustomTemplate: (templateId: string) => void;
  onDeleteCustomTemplate: (templateId: string) => void;
  onDuplicateTemplate: (template: PromptTemplate) => void;
}

export const PromptTemplateSidebar: React.FC<PromptTemplateSidebarProps> = ({
  isOpen,
  onToggleOpen,
  templates,
  activeTemplateId,
  currentFlagsCount,
  currentV2Intensity,
  currentHumanizerIntensity,
  onSaveTemplate,
  onApplyTemplate,
  onUpdateCustomTemplate,
  onDeleteCustomTemplate,
  onDuplicateTemplate,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [scope, setScope] = useState<'all' | 'custom' | 'builtin'>('all');
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [formError, setFormError] = useState('');
  const [justAppliedId, setJustAppliedId] = useState<string | null>(null);
  const [justUpdatedId, setJustUpdatedId] = useState<string | null>(null);

  const customCount = useMemo(
    () => templates.filter((tpl) => !tpl.isBuiltIn).length,
    [templates],
  );

  const filtered = useMemo(
    () => filterPromptTemplates(templates, searchQuery, scope),
    [templates, searchQuery, scope],
  );

  const handleSubmitNew = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      setFormError('Укажите название шаблона');
      return;
    }
    onSaveTemplate({
      name: newName.trim(),
      category: newCategory.trim() || 'Пользовательский',
      description: newDescription.trim(),
    });
    setNewName('');
    setNewCategory('');
    setNewDescription('');
    setFormError('');
    setIsCreating(false);
    setScope('all');
  };

  const handleApply = (tpl: PromptTemplate) => {
    onApplyTemplate(tpl);
    setJustAppliedId(tpl.id);
    setTimeout(() => {
      setJustAppliedId((cur) => (cur === tpl.id ? null : cur));
    }, 1800);
  };

  const handleUpdate = (tpl: PromptTemplate) => {
    onUpdateCustomTemplate(tpl.id);
    setJustUpdatedId(tpl.id);
    setTimeout(() => {
      setJustUpdatedId((cur) => (cur === tpl.id ? null : cur));
    }, 1800);
  };

  if (!isOpen) {
    return (
      <aside className="lg:w-12 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-950/90 flex lg:flex-col items-center justify-between lg:justify-start py-2.5 px-4 lg:px-0 lg:py-5 gap-3">
        <button
          id="open-template-sidebar-btn"
          type="button"
          onClick={onToggleOpen}
          title="Открыть библиотеку шаблонов промтов"
          className="inline-flex items-center gap-2 lg:flex-col px-2.5 py-2 rounded-xl bg-indigo-950/70 hover:bg-indigo-900/80 text-indigo-300 hover:text-white border border-indigo-700/60 transition cursor-pointer"
        >
          <BookMarked className="h-4 w-4 shrink-0" />
          <span className="text-[11px] font-semibold lg:hidden">Шаблоны промтов ({templates.length})</span>
          <ChevronRight className="h-3.5 w-3.5 hidden lg:block" />
        </button>
      </aside>
    );
  }

  return (
    <aside
      id="prompt-template-sidebar"
      aria-label="Библиотека шаблонов промтов"
      className="w-full lg:w-80 xl:w-[340px] shrink-0 border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-900/60 flex flex-col lg:max-h-[calc(100vh-80px)] lg:sticky lg:top-[80px]"
    >
      {/* Sidebar header */}
      <div className="p-4 border-b border-slate-800 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              <BookMarked className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xs font-bold text-white truncate">Библиотека шаблонов</h2>
              <p className="text-[10.5px] text-slate-400 truncate">
                Модули и инструкции ({templates.length})
              </p>
            </div>
          </div>
          <button
            id="collapse-template-sidebar-btn"
            type="button"
            onClick={onToggleOpen}
            title="Свернуть боковую панель"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent hover:border-slate-700 transition cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>

        {/* Save current config button */}
        <button
          id="toggle-save-template-form-btn"
          type="button"
          onClick={() => {
            setIsCreating((prev) => !prev);
            setFormError('');
          }}
          className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-indigo-600/90 to-purple-600/90 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-md shadow-indigo-950/40 transition cursor-pointer"
        >
          <BookmarkPlus className="h-4 w-4" />
          <span>{isCreating ? 'Скрыть форму сохранения' : 'Сохранить текущую конфигурацию'}</span>
        </button>

        <div className="flex items-center justify-between text-[10.5px] text-slate-400 bg-slate-950/70 rounded-lg px-2.5 py-1.5 border border-slate-800/80">
          <span className="inline-flex items-center gap-1">
            <Layers className="h-3 w-3 text-indigo-400" />
            Модули: <strong className="text-slate-200">{currentFlagsCount}/9</strong>
          </span>
          <span className="inline-flex items-center gap-1">
            <Sliders className="h-3 w-3 text-cyan-400" />
            v2: <strong className="text-cyan-300">{currentV2Intensity}/5</strong> • Хум: <strong className="text-slate-200">{currentHumanizerIntensity}/10</strong>
          </span>
        </div>

        {/* Inline create template form */}
        {isCreating && (
          <form onSubmit={handleSubmitNew} className="p-3 rounded-xl bg-slate-950 border border-indigo-700/60 space-y-2.5">
            <div className="space-y-1">
              <label htmlFor="new-template-name" className="block text-[11px] font-semibold text-indigo-200">
                Название шаблона *
              </label>
              <input
                id="new-template-name"
                type="text"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  if (formError) setFormError('');
                }}
                placeholder="Например: Диссертация — строгий стиль"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white outline-none focus:border-indigo-500"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="new-template-category" className="block text-[11px] font-semibold text-slate-300">
                Задача / категория
              </label>
              <input
                id="new-template-category"
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Научный текст, эссе, блог..."
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white outline-none focus:border-indigo-500"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="new-template-desc" className="block text-[11px] font-semibold text-slate-300">
                Заметка
              </label>
              <textarea
                id="new-template-desc"
                rows={2}
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Кратко: когда применять этот профиль..."
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white outline-none focus:border-indigo-500 resize-none"
              />
            </div>
            {formError && <p className="text-[11px] text-rose-400">{formError}</p>}
            <div className="flex items-center gap-2 pt-1">
              <button
                id="confirm-save-template-btn"
                type="submit"
                className="flex-1 py-1.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition cursor-pointer"
              >
                Сохранить
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCreating(false);
                  setFormError('');
                }}
                className="py-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition cursor-pointer"
              >
                Отмена
              </button>
            </div>
          </form>
        )}

        {/* Search & filter */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="search-prompt-templates-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск шаблонов и инструкций..."
              className="w-full rounded-lg border border-slate-800 bg-slate-950 pl-8 pr-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 outline-none focus:border-indigo-500"
            />
          </div>
          <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[11px]">
            {(
              [
                { id: 'all', label: `Все (${templates.length})` },
                { id: 'custom', label: `Мои (${customCount})` },
                { id: 'builtin', label: 'Базовые' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setScope(tab.id)}
                className={`py-1 px-1.5 rounded-md font-medium transition cursor-pointer ${
                  scope === tab.id
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Template list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {filtered.length === 0 ? (
          <div className="p-6 rounded-xl border border-dashed border-slate-800 text-center text-xs text-slate-500">
            {scope === 'custom' && customCount === 0
              ? 'У вас пока нет сохранённых шаблонов. Нажмите «Сохранить текущую конфигурацию» выше.'
              : 'По вашему запросу шаблоны не найдены.'}
          </div>
        ) : (
          filtered.map((tpl) => {
            const isActive = activeTemplateId === tpl.id;
            const isJustApplied = justAppliedId === tpl.id;
            const isJustUpdated = justUpdatedId === tpl.id;
            const activeMods = countActiveTemplateFlags(tpl.config.flags);
            const previewInstructions =
              tpl.config.v2CustomInstructions.trim() ||
              tpl.config.promptStrategy.trim() ||
              tpl.config.academicCustomInstructions.trim();

            return (
              <div
                key={tpl.id}
                className={`rounded-xl border p-3 space-y-2 transition-all ${
                  isActive
                    ? 'bg-indigo-950/40 border-indigo-500/70 ring-1 ring-indigo-500/30'
                    : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-white leading-snug">{tpl.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${
                          tpl.isBuiltIn
                            ? 'bg-slate-900 text-cyan-300 border-cyan-800/60'
                            : 'bg-indigo-950 text-indigo-300 border-indigo-700/60'
                        }`}
                      >
                        {tpl.category}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {activeMods}/9 мод. • v2 {tpl.config.v2StyleIntensity}/5
                      </span>
                    </div>
                  </div>
                  {isActive && (
                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700/60 font-semibold">
                      Активен
                    </span>
                  )}
                </div>

                {tpl.description && (
                  <p className="text-[11px] text-slate-400 leading-relaxed">{tpl.description}</p>
                )}

                {previewInstructions && (
                  <div className="rounded-lg bg-slate-900/90 border border-slate-800/80 px-2.5 py-1.5 text-[10.5px] text-slate-300 line-clamp-2">
                    <Sparkles className="h-3 w-3 text-amber-400 inline mr-1 -mt-0.5" />
                    {previewInstructions}
                  </div>
                )}

                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => handleApply(tpl)}
                    className={`flex-1 py-1.5 px-2.5 rounded-lg text-[11px] font-semibold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      isJustApplied
                        ? 'bg-emerald-950/80 text-emerald-200 border-emerald-500/70'
                        : 'bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-200 border-indigo-500/40'
                    }`}
                  >
                    {isJustApplied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        <span>Загружен</span>
                      </>
                    ) : (
                      <span>Загрузить</span>
                    )}
                  </button>

                  {!tpl.isBuiltIn && (
                    <button
                      type="button"
                      onClick={() => handleUpdate(tpl)}
                      title="Перезаписать шаблон текущими настройками"
                      className={`p-1.5 rounded-lg border text-xs transition cursor-pointer ${
                        isJustUpdated
                          ? 'bg-emerald-950/70 border-emerald-500/60 text-emerald-300'
                          : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-400 hover:text-cyan-300'
                      }`}
                    >
                      {isJustUpdated ? <Check className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onDuplicateTemplate(tpl)}
                    title="Создать копию шаблона в «Мои»"
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>

                  {!tpl.isBuiltIn && (
                    <button
                      type="button"
                      onClick={() => onDeleteCustomTemplate(tpl.id)}
                      title="Удалить шаблон"
                      className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-950/70 border border-slate-800 hover:border-rose-700/60 text-slate-400 hover:text-rose-300 transition cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
