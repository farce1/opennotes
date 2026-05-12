import { describe, expect, it } from 'vitest';

import { resolveDownloadErrorCopy } from './ModelSetupContext';

describe('resolveDownloadErrorCopy', () => {
  // Mock i18next-style translator: translate known keys; otherwise return defaultValue (or key).
  const t = (key: string, opts?: { defaultValue?: string }) => {
    const table: Record<string, string> = {
      model_download_error_disk_full: 'Translated: not enough disk space',
    };
    if (table[key]) return table[key];
    return opts?.defaultValue ?? key;
  };

  it('uses i18n key when kind is recognized AND translation exists', () => {
    expect(
      resolveDownloadErrorCopy(t, { message: 'raw', kind: 'disk_full' }),
    ).toBe('Translated: not enough disk space');
  });

  it('falls through to raw message when kind is recognized but translation missing', () => {
    expect(
      resolveDownloadErrorCopy(t, {
        message: 'Permission denied accessing /foo',
        kind: 'permission_denied',
      }),
    ).toBe('Permission denied accessing /foo');
  });

  it('uses raw message when kind is absent (backward-compat for network errors)', () => {
    expect(
      resolveDownloadErrorCopy(t, { message: 'Network connection lost' }),
    ).toBe('Network connection lost');
  });

  it('uses raw message when kind is an unknown discriminator', () => {
    expect(
      resolveDownloadErrorCopy(t, { message: 'fallback', kind: 'never_emitted_kind' }),
    ).toBe('fallback');
  });
});
