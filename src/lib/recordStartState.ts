import type { ModelStatus, OllamaSetupPhase } from '../types';

export type RecordStartAssistTone = 'info' | 'warning';
export type RecordStartAction = 'openModels' | null;
export type RecordStartButtonLabelKey =
  | 'btn_startRecording'
  | 'btn_starting'
  | 'btn_checkingPermissions'
  | 'btn_preparingRecording';
export type RecordStartHelpTitleKey = 'startAssist_waitingTitle' | 'startAssist_blockedTitle';
export type RecordStartHelpBodyKey =
  | 'startHint_modelChecking'
  | 'startHint_modelPreparing'
  | 'startHint_modelMissing'
  | 'startHint_modelError'
  | 'startHint_aiChecking'
  | 'startHint_aiPreparing'
  | 'startHint_aiMissing'
  | 'startHint_aiError';

export type RecordStartState = {
  disabled: boolean;
  busy: boolean;
  buttonLabelKey: RecordStartButtonLabelKey;
  helpTitleKey: RecordStartHelpTitleKey | null;
  helpBodyKey: RecordStartHelpBodyKey | null;
  tone: RecordStartAssistTone | null;
  action: RecordStartAction;
};

type RecordStartStateArgs = {
  startingSession: boolean;
  permissionLoading: boolean;
  modelStatus: ModelStatus;
  ollamaSetupPhase: OllamaSetupPhase;
};

export function getRecordStartState({
  startingSession,
  permissionLoading,
  modelStatus,
  ollamaSetupPhase,
}: RecordStartStateArgs): RecordStartState {
  if (startingSession) {
    return {
      disabled: true,
      busy: true,
      buttonLabelKey: 'btn_starting',
      helpTitleKey: null,
      helpBodyKey: null,
      tone: null,
      action: null,
    };
  }

  if (permissionLoading) {
    return {
      disabled: true,
      busy: true,
      buttonLabelKey: 'btn_checkingPermissions',
      helpTitleKey: null,
      helpBodyKey: null,
      tone: null,
      action: null,
    };
  }

  if (modelStatus === 'checking' || modelStatus === 'unknown') {
    return {
      disabled: true,
      busy: true,
      buttonLabelKey: 'btn_preparingRecording',
      helpTitleKey: 'startAssist_waitingTitle',
      helpBodyKey: 'startHint_modelChecking',
      tone: 'info',
      action: null,
    };
  }

  if (modelStatus === 'downloading' || modelStatus === 'extracting') {
    return {
      disabled: true,
      busy: true,
      buttonLabelKey: 'btn_preparingRecording',
      helpTitleKey: 'startAssist_waitingTitle',
      helpBodyKey: 'startHint_modelPreparing',
      tone: 'info',
      action: 'openModels',
    };
  }

  if (modelStatus === 'not_ready') {
    return {
      disabled: true,
      busy: false,
      buttonLabelKey: 'btn_startRecording',
      helpTitleKey: 'startAssist_blockedTitle',
      helpBodyKey: 'startHint_modelMissing',
      tone: 'warning',
      action: 'openModels',
    };
  }

  if (modelStatus === 'error') {
    return {
      disabled: true,
      busy: false,
      buttonLabelKey: 'btn_startRecording',
      helpTitleKey: 'startAssist_blockedTitle',
      helpBodyKey: 'startHint_modelError',
      tone: 'warning',
      action: 'openModels',
    };
  }

  if (ollamaSetupPhase === 'checking') {
    return {
      disabled: true,
      busy: true,
      buttonLabelKey: 'btn_preparingRecording',
      helpTitleKey: 'startAssist_waitingTitle',
      helpBodyKey: 'startHint_aiChecking',
      tone: 'info',
      action: null,
    };
  }

  if (
    ollamaSetupPhase === 'downloading_ollama' ||
    ollamaSetupPhase === 'extracting_ollama' ||
    ollamaSetupPhase === 'installing_ollama' ||
    ollamaSetupPhase === 'starting_ollama' ||
    ollamaSetupPhase === 'pulling'
  ) {
    return {
      disabled: true,
      busy: true,
      buttonLabelKey: 'btn_preparingRecording',
      helpTitleKey: 'startAssist_waitingTitle',
      helpBodyKey: 'startHint_aiPreparing',
      tone: 'info',
      action: 'openModels',
    };
  }

  if (
    ollamaSetupPhase === 'not_installed' ||
    ollamaSetupPhase === 'not_running' ||
    ollamaSetupPhase === 'model_not_pulled'
  ) {
    return {
      disabled: true,
      busy: false,
      buttonLabelKey: 'btn_startRecording',
      helpTitleKey: 'startAssist_blockedTitle',
      helpBodyKey: 'startHint_aiMissing',
      tone: 'warning',
      action: 'openModels',
    };
  }

  if (ollamaSetupPhase === 'error') {
    return {
      disabled: true,
      busy: false,
      buttonLabelKey: 'btn_startRecording',
      helpTitleKey: 'startAssist_blockedTitle',
      helpBodyKey: 'startHint_aiError',
      tone: 'warning',
      action: 'openModels',
    };
  }

  return {
    disabled: false,
    busy: false,
    buttonLabelKey: 'btn_startRecording',
    helpTitleKey: null,
    helpBodyKey: null,
    tone: null,
    action: null,
  };
}
