import type { AsrEngine } from '../types';

export interface AsrEngineInfo {
  readyCommand: string;
  downloadCommand: string;
  modelDirName: string;
}

const ASR_ENGINE_INFO: Record<AsrEngine, AsrEngineInfo> = {
  whisper: {
    readyCommand: 'check_model_ready',
    downloadCommand: 'download_model',
    modelDirName: 'sherpa-onnx-whisper-turbo',
  },
  parakeet: {
    readyCommand: 'check_parakeet_model_ready',
    downloadCommand: 'download_parakeet_model',
    modelDirName: 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8',
  },
};

export function asrEngineInfo(engine: AsrEngine): AsrEngineInfo {
  return ASR_ENGINE_INFO[engine];
}
