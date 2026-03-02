import { Channel, invoke } from '@tauri-apps/api/core';
import { RotateCw, Sparkles, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useSetting } from '../../hooks/useSettings';
import { DEFAULT_SETTINGS } from '../../lib/constants';
import type { OllamaModelInfo, OllamaPullEvent, OllamaStatus } from '../../types';

type PullProgress = {
  status: string;
  completed: number;
  total: number;
};

export function SummarySection() {
  const [ollamaModel, updateOllamaModel] = useSetting('ollamaModel');
  const [autoSummary, updateAutoSummary] = useSetting('autoSummary');
  const [ollamaServerUrl, updateOllamaServerUrl] = useSetting('ollamaServerUrl');
  const [serverUrlInput, setServerUrlInput] = useState(DEFAULT_SETTINGS.ollamaServerUrl);
  const [models, setModels] = useState<OllamaModelInfo[]>([]);
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [loading, setLoading] = useState(false);
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

  useEffect(() => {
    setServerUrlInput(currentServerUrl);
  }, [currentServerUrl]);

  useEffect(() => {
    void refreshAll(currentServerUrl);
  }, [currentServerUrl, refreshAll]);

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
      const confirmed = window.confirm(`Delete Ollama model \"${modelName}\"?`);
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
        setErrorMessage(`Unable to delete model \"${modelName}\".`);
      }
    },
    [currentServerUrl, refreshAll],
  );

  const handlePullModel = useCallback(async () => {
    const modelName = pullModelName.trim();
    if (!modelName) {
      setErrorMessage('Enter a model name to pull.');
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
    <section className="space-y-4">
      <div className="flex items-center gap-2 text-warm-700 dark:text-warm-100">
        <Sparkles size={20} />
        <h2 className="text-lg font-semibold">Summary</h2>
      </div>

      <article className="rounded-xl border border-warm-200/80 bg-warm-50 p-4 shadow-sm dark:border-warm-700/60 dark:bg-warm-800/70">
        <h3 className="text-xs font-medium uppercase tracking-wide text-warm-500 dark:text-warm-300">
          Ollama Model for Summaries
        </h3>
        <div className="mt-3 flex items-center gap-2">
          <select
            value={currentModel}
            onChange={(event) => void updateOllamaModel(event.target.value)}
            className="w-full rounded-lg border border-warm-200 bg-white px-3 py-2 text-sm text-warm-700 dark:border-warm-600 dark:bg-warm-700/70 dark:text-warm-100"
          >
            {modelOptions.map((model) => (
              <option key={model.name} value={model.name}>
                {model.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void refreshAll(currentServerUrl)}
            disabled={loading}
            className="rounded-lg border border-warm-200 bg-white px-3 py-2 text-sm text-warm-700 transition hover:bg-warm-100 disabled:cursor-not-allowed disabled:opacity-70 dark:border-warm-600 dark:bg-warm-700/70 dark:text-warm-100 dark:hover:bg-warm-700"
            title="Refresh models"
          >
            <RotateCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        {!models.length ? (
          <p className="mt-2 text-xs text-warm-500 dark:text-warm-300">
            No models found. Ensure Ollama is running, then pull a model below.
          </p>
        ) : null}
      </article>

      <article className="rounded-xl border border-warm-200/80 bg-warm-50 p-4 shadow-sm dark:border-warm-700/60 dark:bg-warm-800/70">
        <h3 className="text-xs font-medium uppercase tracking-wide text-warm-500 dark:text-warm-300">
          Auto-Summary
        </h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => void updateAutoSummary(true)}
            className={[
              'rounded-lg border px-3 py-2 text-sm transition-colors duration-150',
              isAutoSummary
                ? 'border-accent bg-accent-light/60 text-warm-900 dark:text-warm-50'
                : 'border-warm-200 bg-warm-100 text-warm-700 hover:bg-warm-200 dark:border-warm-600 dark:bg-warm-700/70 dark:text-warm-100 dark:hover:bg-warm-700',
            ].join(' ')}
          >
            Auto
          </button>
          <button
            type="button"
            onClick={() => void updateAutoSummary(false)}
            className={[
              'rounded-lg border px-3 py-2 text-sm transition-colors duration-150',
              !isAutoSummary
                ? 'border-accent bg-accent-light/60 text-warm-900 dark:text-warm-50'
                : 'border-warm-200 bg-warm-100 text-warm-700 hover:bg-warm-200 dark:border-warm-600 dark:bg-warm-700/70 dark:text-warm-100 dark:hover:bg-warm-700',
            ].join(' ')}
          >
            Manual
          </button>
        </div>
        <p className="mt-2 text-xs text-warm-500 dark:text-warm-300">
          When enabled, summaries are generated automatically after each recording.
        </p>
      </article>

      <article className="rounded-xl border border-warm-200/80 bg-warm-50 p-4 shadow-sm dark:border-warm-700/60 dark:bg-warm-800/70">
        <h3 className="text-xs font-medium uppercase tracking-wide text-warm-500 dark:text-warm-300">
          Ollama Management
        </h3>

        <div className="mt-3 rounded-lg border border-warm-200/80 bg-white/70 p-3 dark:border-warm-600/80 dark:bg-warm-700/40">
          <div className="flex items-center gap-2 text-sm text-warm-700 dark:text-warm-100">
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
              className="w-full rounded-lg border border-warm-200 bg-white px-3 py-2 text-sm text-warm-700 dark:border-warm-600 dark:bg-warm-700/70 dark:text-warm-100"
            />
            <button
              type="button"
              onClick={() => void testConnection()}
              className="rounded-lg border border-accent px-3 py-2 text-sm text-accent transition hover:bg-accent-light/30"
            >
              Test Connection
            </button>
          </div>

          <div className="mt-4 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-warm-500 dark:text-warm-300">
              Installed Models
            </p>
            {models.length ? (
              <ul className="divide-y divide-warm-200/70 rounded-lg border border-warm-200/70 bg-white/60 dark:divide-warm-600/70 dark:border-warm-600/70 dark:bg-warm-700/30">
                {models.map((model) => (
                  <li key={model.name} className="flex items-center justify-between px-3 py-2">
                    <span className="text-sm text-warm-700 dark:text-warm-100">{model.name}</span>
                    <button
                      type="button"
                      onClick={() => void handleDeleteModel(model.name)}
                      className="inline-flex items-center gap-1 rounded-md border border-red-300/80 px-2 py-1 text-xs text-red-700 transition hover:bg-red-50 dark:border-red-500/40 dark:text-red-200 dark:hover:bg-red-500/10"
                    >
                      <Trash2 size={13} />
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-warm-500 dark:text-warm-300">No installed models.</p>
            )}
          </div>

          <div className="mt-4 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-warm-500 dark:text-warm-300">
              Pull New Model
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={pullModelName}
                onChange={(event) => setPullModelName(event.target.value)}
                placeholder="e.g. llama3.2:3b"
                className="w-full rounded-lg border border-warm-200 bg-white px-3 py-2 text-sm text-warm-700 dark:border-warm-600 dark:bg-warm-700/70 dark:text-warm-100"
              />
              <button
                type="button"
                onClick={() => void handlePullModel()}
                disabled={pulling}
                className="rounded-lg border border-accent px-3 py-2 text-sm text-accent transition hover:bg-accent-light/30 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {pulling ? 'Pulling…' : 'Pull'}
              </button>
            </div>

            {pullProgress ? (
              <div className="space-y-1">
                <p className="text-xs text-warm-500 dark:text-warm-300">
                  {pullProgress.status} {pullProgress.total ? `(${pullPercent}%)` : ''}
                </p>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-warm-200 dark:bg-warm-700">
                  <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pullPercent}%` }} />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {errorMessage ? (
          <p className="mt-3 rounded-lg border border-red-300/70 bg-red-50/70 px-3 py-2 text-xs text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
            {errorMessage}
          </p>
        ) : null}
      </article>
    </section>
  );
}
