---
title: Installation
description: Install openNotes on macOS, Windows, or Linux
---

Download the latest release of openNotes from the [GitHub Releases](https://github.com/nicodeforge/opennotes/releases) page.

## System requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| OS | macOS 12+, Windows 10+, Linux (x86_64) | Latest stable release |
| RAM | 4 GB | 8 GB+ |
| Disk space | ~3 GB (app + models) | 5 GB+ (for larger models) |
| Microphone | Any input device | USB or built-in microphone |

## macOS

1. Download the `.dmg` file from [GitHub Releases](https://github.com/nicodeforge/opennotes/releases)
2. Open the `.dmg` file
3. Drag **openNotes** to your **Applications** folder
4. On first launch, macOS may show a security warning — click **Open** to proceed

:::note
openNotes requires microphone access. macOS will prompt you to grant permission on first recording. Go to **System Settings → Privacy & Security → Microphone** if you need to grant it manually.
:::

### Apple Silicon and Intel

The macOS release is a universal binary that runs natively on both Apple Silicon (M1/M2/M3/M4) and Intel Macs.

## Windows

1. Download the `.msi` installer from [GitHub Releases](https://github.com/nicodeforge/opennotes/releases)
2. Run the installer and follow the setup wizard
3. openNotes will be available in your Start menu after installation

:::note
Windows may show a SmartScreen warning for unsigned apps. Click **More info → Run anyway** to proceed.
:::

## Linux

1. Download the `.AppImage` file from [GitHub Releases](https://github.com/nicodeforge/opennotes/releases)
2. Make it executable:
   ```bash
   chmod +x openNotes-*.AppImage
   ```
3. Run it:
   ```bash
   ./openNotes-*.AppImage
   ```

:::tip
To integrate with your desktop environment, consider using [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher) to manage AppImage files.
:::

## Install Ollama

openNotes uses [Ollama](https://ollama.com) to run AI models locally for meeting summarization. Install it before launching openNotes:

1. Visit [ollama.com](https://ollama.com) and download the installer for your platform
2. Run the Ollama installer
3. Verify Ollama is running — open a terminal and run:
   ```bash
   ollama --version
   ```

openNotes will guide you through pulling a recommended AI model (phi4-mini) on first launch.

## Next steps

Once installed, follow the [Quick Start](/quick-start/) guide to record your first meeting.
