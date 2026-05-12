/**
 * OllamaSetupContext — ONBOARD-04 consent-flow tests.
 *
 * Phase 19. Covers the four critical paths from CONTEXT.md D-20a..D-26.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// --- Mocks (must come before importing the component under test)

const mockInvoke = vi.fn();
const mockOpenUrl = vi.fn();
let mockIsMacOSReturn = true;

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  Channel: class MockChannel {
    onmessage: ((e: unknown) => void) | null = null;
  },
}));

vi.mock('@tauri-apps/plugin-shell', () => ({
  open: (...args: unknown[]) => mockOpenUrl(...args),
}));

vi.mock('../lib/platform', () => ({
  isMacOS: () => mockIsMacOSReturn,
}));

// i18next mock — return defaultValue when key not found
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
    i18n: { language: 'en' },
  }),
}));

// Mock settings — autoSetup() reads ollamaModel
vi.mock('../lib/settings', () => ({
  getSetting: vi.fn().mockResolvedValue('phi4-mini'),
}));

// --- System under test
import { OllamaSetupProvider, useOllamaSetup } from './OllamaSetupContext';

function wrapper({ children }: { children: React.ReactNode }) {
  return <OllamaSetupProvider>{children}</OllamaSetupProvider>;
}

describe('OllamaSetupContext — ONBOARD-04 consent flow', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockOpenUrl.mockReset();
    mockIsMacOSReturn = true;
    // get_ollama_download_metadata returns a stable response by default
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_ollama_download_metadata') {
        return Promise.resolve({
          sourceDomain: 'ollama.com',
          downloadUrl: 'https://ollama.com/download/Ollama-darwin.zip',
          sizeBytes: 123456789,
        });
      }
      if (cmd === 'check_ollama_status') {
        return Promise.resolve({
          installed: false,
          running: false,
          modelReady: false,
        });
      }
      if (cmd === 'auto_setup_ollama') {
        return Promise.resolve();
      }
      return Promise.resolve();
    });
  });

  it('macOS: autoSetup opens the consent modal before invoking auto_setup_ollama', async () => {
    mockIsMacOSReturn = true;
    const { result } = renderHook(() => useOllamaSetup(), { wrapper });

    await act(async () => {
      // Don't await — autoSetup suspends waiting for the consent resolver.
      void result.current.autoSetup();
    });

    await waitFor(() => {
      expect(result.current.consentModalOpen).toBe(true);
    });

    // Metadata fetched, but auto_setup_ollama NOT yet invoked.
    expect(mockInvoke).toHaveBeenCalledWith('get_ollama_download_metadata');
    expect(mockInvoke).not.toHaveBeenCalledWith('auto_setup_ollama', expect.anything());
  });

  it('macOS: confirming consent invokes auto_setup_ollama with userConsented: true', async () => {
    mockIsMacOSReturn = true;
    const { result } = renderHook(() => useOllamaSetup(), { wrapper });

    await act(async () => {
      void result.current.autoSetup();
    });

    await waitFor(() => expect(result.current.consentModalOpen).toBe(true));

    await act(async () => {
      result.current.resolveConsent(true);
    });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'auto_setup_ollama',
        expect.objectContaining({ userConsented: true }),
      );
    });
    expect(mockOpenUrl).not.toHaveBeenCalled();
  });

  it('macOS: declining consent opens the manual-install page and does NOT invoke auto_setup_ollama', async () => {
    mockIsMacOSReturn = true;
    const { result } = renderHook(() => useOllamaSetup(), { wrapper });

    await act(async () => {
      void result.current.autoSetup();
    });

    await waitFor(() => expect(result.current.consentModalOpen).toBe(true));

    await act(async () => {
      result.current.resolveConsent(false);
    });

    await waitFor(() => {
      expect(mockOpenUrl).toHaveBeenCalledWith('https://ollama.com/download');
    });
    expect(mockInvoke).not.toHaveBeenCalledWith('auto_setup_ollama', expect.anything());
  });

  it('non-macOS: autoSetup does NOT show the consent modal and does NOT call get_ollama_download_metadata', async () => {
    mockIsMacOSReturn = false;
    const { result } = renderHook(() => useOllamaSetup(), { wrapper });

    await act(async () => {
      await result.current.autoSetup();
    });

    expect(result.current.consentModalOpen).toBe(false);
    expect(mockInvoke).not.toHaveBeenCalledWith('get_ollama_download_metadata');
    // On non-macOS, the existing flow may still call auto_setup_ollama
    // (which will fail in the backend per its own #[cfg(target_os = "macos")]
    // gating). The test asserts that THIS plan's consent gate did not fire.
  });
});
