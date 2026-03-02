import { Channel, invoke } from '@tauri-apps/api/core';
import { useCallback, useState } from 'react';

import { useSummaryGeneration } from '../contexts/SummaryGenerationContext';
import { getSetting } from '../lib/settings';
import type { LlmTokenEvent } from '../types';

type SummaryRow = {
  id: number;
  meetingId: number;
  content: string;
  format: string;
  llmProvider: string | null;
  llmModel: string | null;
  generatedAt: string;
};

export function useSummary() {
  const { setGenerating: setGlobalGenerating } = useSummaryGeneration();
  const [summaryText, setSummaryText] = useState('');
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState<string | null>(null);
  const [hasExistingSummary, setHasExistingSummary] = useState(false);
  const [edited, setEdited] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [llmModel, setLlmModel] = useState<string | null>(null);

  const loadExisting = useCallback(async (meetingId: number) => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const existing = await invoke<SummaryRow | null>('get_summary', { meetingId });
      if (existing) {
        setSummaryText(existing.content);
        setHasExistingSummary(true);
        setEdited(false);
        setLlmModel(existing.llmModel ?? null);
      } else {
        setSummaryText('');
        setHasExistingSummary(false);
        setLlmModel(null);
      }

      return existing;
    } catch {
      setErrorMessage('Unable to load saved summary from local database.');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const generate = useCallback(async (meetingId: number) => {
    setGenerating(true);
    setGlobalGenerating(true);
    setSummaryText('');
    setEdited(false);
    setErrorMessage(null);
    const serverUrl = await getSetting('ollamaServerUrl');
    const model = await getSetting('ollamaModel');

    const channel = new Channel<LlmTokenEvent>();
    channel.onmessage = (event) => {
      if (event.event === 'token') {
        setSummaryText((previous) => previous + event.data.text);
        if (event.data.done) {
          setGenerating(false);
          setGlobalGenerating(false);
          setHasExistingSummary(true);
        }
        return;
      }

      if (event.event === 'error') {
        setGenerating(false);
        setGlobalGenerating(false);
        setErrorMessage((previous) => previous ?? event.data.message ?? 'Summary generation failed.');
        return;
      }

      if (event.event === 'ollamaError') {
        setGenerating(false);
        setGlobalGenerating(false);
        setErrorMessage(JSON.stringify({ kind: event.data.kind, raw: event.data.raw }));
        return;
      }

      if (event.event === 'contextTruncated') {
        setErrorMessage(JSON.stringify({ kind: 'contextTruncated', raw: 'Summary based on partial transcript (model context limit).' }));
      }

      if (event.event === 'titleExtracted') {
        setTitle(event.data.title);
      }
    };

    try {
      await invoke('generate_summary', {
        meetingId,
        serverUrl: serverUrl || undefined,
        model: model || undefined,
        onToken: channel,
      });

      const savedSummary = await invoke<SummaryRow | null>('get_summary', { meetingId });
      if (savedSummary) {
        setSummaryText(savedSummary.content);
        setHasExistingSummary(true);
        setLlmModel(savedSummary.llmModel ?? null);
      }
    } catch {
      setErrorMessage((previous) => previous ?? 'Summary generation failed. Check Ollama status and try again.');
    } finally {
      setGenerating(false);
      setGlobalGenerating(false);
    }
  }, [setGlobalGenerating]);

  const saveEdit = useCallback(async (meetingId: number, content: string) => {
    setErrorMessage(null);
    await invoke('save_summary', { meetingId, content });
    setEdited(false);
    setHasExistingSummary(true);
  }, []);

  const setText = useCallback((text: string) => {
    setSummaryText(text);
    setEdited(true);
  }, []);

  const saveTitle = useCallback(async (meetingId: number, nextTitle: string) => {
    await invoke('update_meeting_title', {
      meetingId,
      title: nextTitle,
    });
    setTitle(nextTitle);
  }, []);

  return {
    summaryText,
    generating,
    loading,
    title,
    hasExistingSummary,
    edited,
    errorMessage,
    llmModel,
    generate,
    saveEdit,
    setText,
    saveTitle,
    loadExisting,
  };
}
