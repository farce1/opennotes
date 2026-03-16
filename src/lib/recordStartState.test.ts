import { describe, expect, it } from 'vitest';

import { getRecordStartState } from './recordStartState';

describe('getRecordStartState', () => {
  it('keeps the start button disabled while transcription readiness is still loading', () => {
    expect(
      getRecordStartState({
        startingSession: false,
        permissionLoading: false,
        modelStatus: 'checking',
        ollamaSetupPhase: 'ready',
      }),
    ).toMatchObject({
      disabled: true,
      busy: true,
      buttonLabelKey: 'btn_preparingRecording',
      helpBodyKey: 'startHint_modelChecking',
      action: null,
    });
  });

  it('surfaces a direct recovery path when the transcription model is missing', () => {
    expect(
      getRecordStartState({
        startingSession: false,
        permissionLoading: false,
        modelStatus: 'not_ready',
        ollamaSetupPhase: 'ready',
      }),
    ).toMatchObject({
      disabled: true,
      busy: false,
      buttonLabelKey: 'btn_startRecording',
      helpBodyKey: 'startHint_modelMissing',
      action: 'openModels',
    });
  });

  it('blocks recording when Ollama setup is not finished yet', () => {
    expect(
      getRecordStartState({
        startingSession: false,
        permissionLoading: false,
        modelStatus: 'ready',
        ollamaSetupPhase: 'model_not_pulled',
      }),
    ).toMatchObject({
      disabled: true,
      busy: false,
      helpBodyKey: 'startHint_aiMissing',
      action: 'openModels',
    });
  });

  it('returns an enabled state only when both transcription and AI setup are ready', () => {
    expect(
      getRecordStartState({
        startingSession: false,
        permissionLoading: false,
        modelStatus: 'ready',
        ollamaSetupPhase: 'ready',
      }),
    ).toEqual({
      disabled: false,
      busy: false,
      buttonLabelKey: 'btn_startRecording',
      helpTitleKey: null,
      helpBodyKey: null,
      tone: null,
      action: null,
    });
  });
});
