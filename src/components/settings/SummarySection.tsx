import { Channel, invoke } from '@tauri-apps/api/core';
import { Loader2, RotateCw, Sparkles, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useSummaryGeneration } from '../../contexts/SummaryGenerationContext';
import { useSetting } from '../../hooks/useSettings';
import { DEFAULT_SETTINGS } from '../../lib/constants';
import type { OllamaModelInfo, OllamaPullEvent, OllamaStatus } from '../../types';
import { Dropdown } from '../ui/Dropdown';

type PullProgress = {
  status: string;
  completed: number;
  total: number;
};

const panelClasses =
  'relative z-0 rounded-2xl border border-gray-200/80 bg-white/75 p-4 shadow-sm backdrop-blur-sm focus-within:z-20 dark:border-gray-700/80 dark:bg-gray-900/45';

function optionButtonClasses(selected: boolean): string {
  return [
    'rounded-xl border px-3 py-2.5 text-sm transition-all duration-150',
    selected
      ? 'border-accent/35 bg-accent/10 text-accent shadow-sm dark:border-accent/40 dark:bg-accent/15 dark:text-accent-muted'
      : 'border-gray-200/80 bg-white/80 text-gray-600 hover:border-gray-300 hover:bg-white dark:border-gray-700/80 dark:bg-gray-800/70 dark:text-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-800',
  ].join(' ');
}

function formatModelLabel(model: OllamaModelInfo): string {
  const normalizedSize = model.parameterSize?.toLowerCase();
  const sizeIncludedInName = normalizedSize ? model.name.toLowerCase().endsWith(`:${normalizedSize}`) : false;
  const size = model.parameterSize && !sizeIncludedInName ? ` · ${model.parameterSize}` : '';
  const rec = model.name === 'phi4-mini' || model.name === 'phi4-mini:latest' ? ' · Recommended' : '';
  return `${model.name}${size}${rec}`;
}

export function SummarySection() {
  const { generating: globalGenerating } = useSummaryGeneration();
  const [ollamaModel, updateOllamaModel] = useSetting('ollamaModel');
  const [autoSummary, updateAutoSummary] = useSetting('autoSummary');
  const [ollamaServerUrl, updateOllamaServerUrl] = useSetting('ollamaServerUrl');
  const [serverUrlInput, setServerUrlInput] = useState(DEFAULT_SETTINGS.ollamaServerUrl);
  const [models, setModels] = useState<OllamaModelInfo[]>([]);
  const [availablePullModels, setAvailablePullModels] = useState<OllamaModelInfo[]>([]);
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingAvailablePullModels, setLoadingAvailablePullModels] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState<PullProgress | null>(null);
  const [pullModelName, setPullModelName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currentServerUrl = ollamaServerUrl ?? DEFAULT_SETTINGS.ollamaServerUrl;
  const currentModel = ollamaModel ?? DEFAULT_SETTINGS.ollamaModel;
  const isAutoSummary = autoSummary ?? DEFAULT_SETTINGS.autoSummary;

  const refreshModels = useCallback(async (serverUrl: string) => {
    const listed = await invoke<OllamaModelInfo[]>('list_ollama_models', {
      serverUrl,
    });
    setModels(listed);
    return listed;
  }, []);

  const refreshStatus = useCallback(async (serverUrl: string) => {
    const nextStatus = await invoke<OllamaStatus>('check_ollama_status', {
      serverUrl,
      model: currentModel,
    });
    setStatus(nextStatus);
    return nextStatus;
  }, [currentModel]);

  const refreshAll = useCallback(
    async (serverUrl: string) => {
      setLoading(true);
      setErrorMessage(null);
      try {
        await Promise.all([refreshModels(serverUrl), refreshStatus(serverUrl)]);
      } catch {
        setErrorMessage('Unable to load Ollama status. Check server URL and connectivity.');
      } finally {
        setLoading(false);
      }
    },
    [refreshModels, refreshStatus],
  );

  const refreshAvailablePullModels = useCallback(async () => {
    setLoadingAvailablePullModels(true);
    try {
      const listed = await invoke<OllamaModelInfo[]>('list_ollama_library_catalog_models');
      setAvailablePullModels(listed);
      return listed;
    } catch {
      setAvailablePullModels([]);
      setErrorMessage('Unable to load downloadable Ollama model catalog. Check your internet connection and retry.');
      return [];
    } finally {
      setLoadingAvailablePullModels(false);
    }
  }, []);

  useEffect(() => {
    setServerUrlInput(currentServerUrl);
  }, [currentServerUrl]);

  useEffect(() => {
    void refreshAll(currentServerUrl);
  }, [currentServerUrl, refreshAll]);

  useEffect(() => {
    void refreshAvailablePullModels();
  }, [refreshAvailablePullModels]);

  const persistServerUrl = useCallback(async () => {
    const trimmed = serverUrlInput.trim();
    if (!trimmed || trimmed === currentServerUrl) {
      return;
    }
    await updateOllamaServerUrl(trimmed);
  }, [currentServerUrl, serverUrlInput, updateOllamaServerUrl]);

  const testConnection = useCallback(async () => {
    const trimmed = serverUrlInput.trim() || DEFAULT_SETTINGS.ollamaServerUrl;
    setErrorMessage(null);

    try {
      await updateOllamaServerUrl(trimmed);
      await refreshAll(trimmed);
    } catch {
      setErrorMessage(`Cannot connect to ${trimmed}.`);
    }
  }, [refreshAll, serverUrlInput, updateOllamaServerUrl]);

  const handleDeleteModel = useCallback(
    async (modelName: string) => {
      const confirmed = window.confirm(`Delete Ollama model "${modelName}"?`);
      if (!confirmed) {
        return;
      }

      setErrorMessage(null);
      try {
        await invoke('delete_ollama_model', {
          serverUrl: currentServerUrl,
          model: modelName,
        });
        await refreshAll(currentServerUrl);
      } catch {
        setErrorMessage(`Unable to delete model "${modelName}".`);
      }
    },
    [currentServerUrl, refreshAll],
  );

  const handlePullModel = useCallback(async () => {
    const modelName = pullModelName.trim();
    if (!modelName) {
      setErrorMessage('Select a model to pull.');
      return;
    }

    setPulling(true);
    setErrorMessage(null);
    setPullProgress({
      status: 'starting',
      completed: 0,
      total: 0,
    });

    const channel = new Channel<OllamaPullEvent>();
    channel.onmessage = (event) => {
      if (event.event === 'progress') {
        setPullProgress({
          status: event.data.status,
          completed: event.data.completed,
          total: event.data.total,
        });
        return;
      }

      if (event.event === 'complete') {
        setPullProgress(null);
        setPulling(false);
        return;
      }

      if (event.event === 'error') {
        setErrorMessage(event.data.message || 'Model pull failed.');
        setPulling(false);
      }
    };

    try {
      await invoke('pull_ollama_model', {
        serverUrl: currentServerUrl,
        model: modelName,
        onEvent: channel,
      });
      setPullModelName('');
      await refreshAll(currentServerUrl);
    } catch {
      setErrorMessage('Unable to pull model. Ensure Ollama is reachable and retry.');
    } finally {
      setPulling(false);
      setPullProgress(null);
    }
  }, [currentServerUrl, pullModelName, refreshAll]);

  const modelOptions = useMemo(() => {
    const hasCurrentModel = models.some((model) => model.name === currentModel);
    if (hasCurrentModel) {
      return models;
    }
    return [{ name: currentModel, parameterSize: null }, ...models];
  }, [currentModel, models]);

  const modelDropdownOptions = useMemo(
    () =>
      modelOptions.map((model) => ({
        value: model.name,
        label: formatModelLabel(model),
      })),
    [modelOptions],
  );

  const pullModelDropdownOptions = useMemo(
    () =>
      availablePullModels.map((model) => ({
        value: model.name,
        label: formatModelLabel(model),
      })),
    [availablePullModels],
  );

  const connectionOnline = status?.running ?? false;
  const connectionLabel = connectionOnline
    ? `Connected to ${currentServerUrl}`
    : `Cannot connect to ${currentServerUrl}`;

  const pullPercent = useMemo(() => {
    if (!pullProgress || !pullProgress.total) {
      return 0;
    }
    return Math.min(100, Math.round((pullProgress.completed / pullProgress.total) * 100));
  }, [pullProgress]);

  return (
    <section className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="rounded-xl border border-gray-200/80 bg-white/80 p-2 text-gray-500 shadow-sm dark:border-gray-700/80 dark:bg-gray-800/70 dark:text-gray-300">
          <Sparkles size={18} />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-gray-800 dark:text-gray-50">Summary</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Control generation mode and local Ollama model management.</p>
        </div>
      </div>

      <div className={panelClasses}>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-100">Ollama Model for Summaries</h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Pick which installed model generates post-meeting summaries.</p>

        <div className="mt-4 flex items-center gap-2">
          <Dropdown
            value={currentModel}
            options={modelDropdownOptions}
            onChange={(value) => void updateOllamaModel(value)}
            disabled={globalGenerating}
            size="regular"
            fullWidth
            className="w-full"
          />

          <button
            type="button"
            onClick={() => void refreshAll(currentServerUrl)}
            disabled={loading}
            className="rounded-xl border border-gray-200/80 bg-white/80 px-3 py-2.5 text-sm text-gray-600 shadow-sm transition-all duration-150 hover:border-gray-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-70 dark:border-gray-700/80 dark:bg-gray-800/70 dark:text-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-800"
            title="Refresh models"
          >
            <RotateCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>

          {globalGenerating ? <Loader2 size={15} className="animate-spin text-gray-500" /> : null}
        </div>

        {!models.length ? (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            No models found. Ensure Ollama is running, then pull a model below.
          </p>
        ) : null}
      </div>

      <div className={panelClasses}>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-100">Auto-Summary</h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Choose whether summaries generate automatically after recording.</p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => void updateAutoSummary(true)}
            className={optionButtonClasses(isAutoSummary)}
          >
            Auto
          </button>
          <button
            type="button"
            onClick={() => void updateAutoSummary(false)}
            className={optionButtonClasses(!isAutoSummary)}
          >
            Manual
          </button>
        </div>
      </div>

      <div className={panelClasses}>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-100">Ollama Management</h3>

        <div className="mt-4 rounded-xl border border-gray-200/70 bg-white/70 p-3 dark:border-gray-700/70 dark:bg-gray-800/55">
          <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-100">
            <span
              className={[
                'inline-block h-2 w-2 rounded-full',
                connectionOnline ? 'bg-emerald-500' : 'bg-red-500',
              ].join(' ')}
            />
            <span>{connectionLabel}</span>
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={serverUrlInput}
              onChange={(event) => setServerUrlInput(event.target.value)}
              onBlur={() => void persistServerUrl()}
              placeholder="http://localhost:11434"
              className="w-full rounded-xl border border-gray-200/80 bg-white/80 px-3 py-2.5 text-sm text-gray-700 shadow-sm transition-all duration-150 outline-none hover:border-gray-300 focus:border-accent/40 focus:ring-2 focus:ring-accent/20 dark:border-gray-700/80 dark:bg-gray-800/70 dark:text-gray-100 dark:hover:border-gray-600"
            />
            <button
              type="button"
              onClick={() => void testConnection()}
              className="rounded-xl border border-accent/40 bg-accent/8 px-3 py-2.5 text-sm font-medium text-accent transition-all duration-150 hover:bg-accent/12 dark:border-accent/45 dark:bg-accent/15 dark:text-accent-muted"
            >
              Test Connection
            </button>
          </div>

          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Installed Models</p>
            {models.length ? (
              <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200/80 bg-white/75 dark:divide-gray-700 dark:border-gray-700/80 dark:bg-gray-900/45">
                {models.map((model) => (
                  <li key={model.name} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <span className="text-sm text-gray-700 dark:text-gray-100">{model.name}</span>
                    <button
                      type="button"
                      onClick={() => void handleDeleteModel(model.name)}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-300/70 px-2.5 py-1.5 text-xs font-medium text-red-700 transition-all duration-150 hover:bg-red-50/80 dark:border-red-500/40 dark:text-red-200 dark:hover:bg-red-500/20"
                    >
                      <Trash2 size={13} />
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-400">No installed models.</p>
            )}
          </div>

          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Pull New Model</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Dropdown
                value={pullModelName}
                options={pullModelDropdownOptions}
                onChange={setPullModelName}
                placeholder={
                  loadingAvailablePullModels
                    ? 'Loading available models...'
                    : pullModelDropdownOptions.length
                      ? 'Select a model (e.g. llama3.2:3b)'
                      : 'No models available'
                }
                disabled={pulling || loadingAvailablePullModels || !pullModelDropdownOptions.length}
                size="regular"
                fullWidth
                className="w-full"
              />
              <button
                type="button"
                onClick={() => void refreshAvailablePullModels()}
                disabled={loadingAvailablePullModels}
                className="rounded-xl border border-gray-200/80 bg-white/80 px-3 py-2.5 text-sm text-gray-600 shadow-sm transition-all duration-150 hover:border-gray-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-70 dark:border-gray-700/80 dark:bg-gray-800/70 dark:text-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-800"
                title="Refresh downloadable models"
              >
                <RotateCw size={15} className={loadingAvailablePullModels ? 'animate-spin' : ''} />
              </button>
              <button
                type="button"
                onClick={() => void handlePullModel()}
                disabled={pulling || loadingAvailablePullModels || !pullModelName.trim()}
                className="rounded-xl border border-accent/40 bg-accent/8 px-3 py-2.5 text-sm font-medium text-accent transition-all duration-150 hover:bg-accent/12 disabled:cursor-not-allowed disabled:opacity-70 dark:border-accent/45 dark:bg-accent/15 dark:text-accent-muted"
              >
                {pulling ? 'Pulling…' : 'Pull'}
              </button>
            </div>

            {!loadingAvailablePullModels && !pullModelDropdownOptions.length ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Could not load downloadable models. Refresh the catalog and try again.
              </p>
            ) : null}

            {pullProgress ? (
              <div className="space-y-1.5">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {pullProgress.status} {pullProgress.total ? `(${pullPercent}%)` : ''}
                </p>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200/80 dark:bg-gray-700/70">
                  <div className="h-full rounded-full bg-accent transition-all duration-150" style={{ width: `${pullPercent}%` }} />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {errorMessage ? (
          <p className="mt-3 rounded-xl border border-red-300/70 bg-red-50/80 px-3 py-2 text-xs text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </section>
  );
}
