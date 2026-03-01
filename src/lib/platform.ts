import { platform, type Platform } from '@tauri-apps/plugin-os';

export function currentPlatform(): Platform {
  return platform();
}

export function isMacOS(): boolean {
  return platform() === 'macos';
}

export function modifierKeyLabel(): string {
  return isMacOS() ? 'Cmd' : 'Ctrl';
}

export function formatShortcutDisplay(
  shortcut: string,
  options: { macSymbols?: boolean } = {},
): string {
  const os = platform();
  const useMacSymbols = options.macSymbols ?? true;

  return shortcut
    .split('+')
    .map((part) => {
      const normalized = part.toLowerCase();
      if (normalized === 'commandorcontrol' || normalized === 'cmdorcontrol') {
        if (os === 'macos') {
          return useMacSymbols ? '⌘' : 'Cmd';
        }
        return 'Ctrl';
      }

      if (normalized === 'alt') {
        return os === 'macos' && useMacSymbols ? '⌥' : 'Alt';
      }

      if (normalized === 'shift') {
        return os === 'macos' && useMacSymbols ? '⇧' : 'Shift';
      }

      return part.length === 1 ? part.toUpperCase() : part;
    })
    .join(os === 'macos' && useMacSymbols ? ' ' : ' + ');
}
