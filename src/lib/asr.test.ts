import { describe, it, expect } from 'vitest';

import { asrEngineInfo } from './asr';

describe('asrEngineInfo', () => {
  it('maps whisper to its readiness/download commands and model dir', () => {
    expect(asrEngineInfo('whisper')).toEqual({
      readyCommand: 'check_model_ready',
      downloadCommand: 'download_model',
      modelDirName: 'sherpa-onnx-whisper-turbo',
    });
  });

  it('maps parakeet to its readiness/download commands and model dir', () => {
    expect(asrEngineInfo('parakeet')).toEqual({
      readyCommand: 'check_parakeet_model_ready',
      downloadCommand: 'download_parakeet_model',
      modelDirName: 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8',
    });
  });
});
