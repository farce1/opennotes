import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

// --- Mocks (must precede importing the component under test)

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  Channel: class MockChannel {
    onmessage: ((e: unknown) => void) | null = null;
  },
}));

vi.mock('@tauri-apps/api/path', () => ({
  join: (...parts: string[]) => Promise.resolve(parts.join('/')),
  appLocalDataDir: () => Promise.resolve('/data'),
}));

const mockRemove = vi.fn();
vi.mock('@tauri-apps/plugin-fs', () => ({
  readDir: vi.fn().mockResolvedValue([]),
  remove: (...args: unknown[]) => mockRemove(...args),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
    i18n: { language: 'en' },
  }),
}));

let mockEngine: 'whisper' | 'parakeet' = 'whisper';
const mockUpdateEngine = vi.fn();
vi.mock('../../hooks/useSettings', () => ({
  useSetting: () => [mockEngine, mockUpdateEngine],
}));

import { TranscriptionSection } from './TranscriptionSection';

describe('TranscriptionSection ASR picker', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockUpdateEngine.mockReset();
    mockRemove.mockReset();
    mockRemove.mockResolvedValue(undefined);
    mockEngine = 'whisper';
    mockInvoke.mockResolvedValue(false);
  });

  afterEach(() => {
    cleanup();
  });

  it('checks parakeet readiness when the parakeet engine is selected', async () => {
    mockEngine = 'parakeet';
    render(<TranscriptionSection />);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('check_parakeet_model_ready');
    });
  });

  it('persists the chosen engine when picked from the dropdown', async () => {
    mockEngine = 'whisper';
    render(<TranscriptionSection />);

    fireEvent.click(await screen.findByText('Whisper', { exact: true }));
    fireEvent.click(await screen.findByText('Parakeet', { exact: true }));

    await waitFor(() => {
      expect(mockUpdateEngine).toHaveBeenCalledWith('parakeet');
    });
  });

  it('downloads the parakeet model via the parakeet command', async () => {
    mockEngine = 'parakeet';
    render(<TranscriptionSection />);

    fireEvent.click(await screen.findByText('transModel_btnDownload', { exact: true }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'download_parakeet_model',
        expect.objectContaining({ onEvent: expect.anything() }),
      );
    });
  });

  it('deletes only the selected engine model directory, preserving shared VAD', async () => {
    mockEngine = 'parakeet';
    mockInvoke.mockResolvedValue(true); // model ready -> delete button shows
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<TranscriptionSection />);

    fireEvent.click(await screen.findByText('transModel_btnDelete', { exact: true }));

    await waitFor(() => {
      expect(mockRemove).toHaveBeenCalledWith(
        '/data/models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8',
        { recursive: true },
      );
    });
  });
});
