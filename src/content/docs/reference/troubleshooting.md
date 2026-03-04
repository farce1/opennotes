---
title: Troubleshooting
description: Common issues and solutions for openNotes
---

Solutions for the most common issues you might encounter with openNotes.

## Ollama issues

### Ollama not detected

**Symptoms:** The app shows "Ollama not found" or cannot connect to the Ollama server.

**Solutions:**

1. **Check Ollama is installed:** Open a terminal and run:
   ```bash
   ollama --version
   ```
   If not found, install Ollama from [ollama.com](https://ollama.com).

2. **Check Ollama is running:** Ollama runs as a background service. Restart it if needed:
   ```bash
   ollama serve
   ```

3. **Check the server URL:** In **Settings -> Summary**, verify the Ollama server URL is correct (default: `http://localhost:11434`).

4. **Firewall or antivirus:** Some security software may block local network connections. Allow Ollama through your firewall.

### Model pull fails

**Symptoms:** Downloading a model gets stuck or fails with an error.

**Solutions:**

1. **Check internet connection:** Models download from Ollama's registry and require internet access.
2. **Check disk space:** Models need several GB of free space. A 7B model requires ~4-5 GB.
3. **Try the CLI:** Pull the model directly:
   ```bash
   ollama pull phi4-mini
   ```
4. **Restart Ollama:** Stop and restart the Ollama service, then try again.

### Summary generation fails

**Symptoms:** After recording, the summary shows an error or does not appear.

**Solutions:**

1. **Check the model is installed:** Go to **Settings -> Summary** and verify your selected model appears in the dropdown.
2. **Check Ollama is running:** The LLM server must be active during summary generation.
3. **Try a different model:** If one model consistently fails, try another (e.g., switch from `phi4-mini` to `llama3.2:3b`).
4. **Check system resources:** Summary generation requires available RAM. Close other memory-heavy applications.

## Microphone issues

### Microphone not found

**Symptoms:** No microphone options appear in the device dropdown.

**Solutions:**

1. **Check physical connection:** Ensure your microphone is plugged in and powered on.
2. **Grant permissions:**
   - **macOS:** System Settings -> Privacy & Security -> Microphone -> Enable for openNotes
   - **Windows:** Settings -> Privacy -> Microphone -> Allow apps to access your microphone
   - **Linux:** Check your audio settings and ensure the app has access to PulseAudio/PipeWire
3. **Restart the app:** Reconnect your microphone, then restart openNotes to refresh the device list.

### No audio captured

**Symptoms:** Recording starts but no transcript appears.

**Solutions:**

1. **Check the selected microphone:** Make sure the correct device is selected in the recording dropdown.
2. **Test your microphone:** Use your system's audio settings to verify the microphone is picking up sound.
3. **Check volume levels:** Ensure your microphone input volume is not muted or set too low.
4. **Try a different microphone:** Plug in an external microphone to rule out hardware issues.

## Transcription issues

### Poor transcription quality

**Symptoms:** Transcribed text is inaccurate, missing words, or garbled.

**Solutions:**

1. **Improve audio quality:** Use an external microphone positioned close to the speaker. See [Recording tips](/guides/recording/#tips-for-better-recordings).
2. **Reduce background noise:** Close windows, mute notifications, move to a quieter space.
3. **Speak clearly:** The model works best with clear, moderate-paced speech.
4. **Check language setting:** Ensure the transcription language in Settings matches the language being spoken. Parakeet TDT is optimized for English.

### Transcription is slow

**Symptoms:** Text appears with significant delay during recording.

**Solutions:**

1. **Close resource-heavy apps:** Transcription runs on your CPU. Close unused applications to free up processing power.
2. **Check system requirements:** openNotes needs at least 4 GB RAM. 8 GB or more is recommended.
3. **Monitor CPU usage:** If your CPU is at 100%, the transcription model may not have enough resources.

## Platform-specific issues

### macOS: "App is damaged" or security warning

macOS Gatekeeper may block unsigned apps. To resolve:

1. Go to **System Settings -> Privacy & Security**
2. Find the message about openNotes being blocked
3. Click **Open Anyway**

### Windows: SmartScreen blocks installation

Windows SmartScreen may warn about unrecognized apps:

1. Click **More info** on the SmartScreen dialog
2. Click **Run anyway**

### Linux: AppImage will not launch

1. Make sure the file is executable:
   ```bash
   chmod +x openNotes-*.AppImage
   ```
2. Check that FUSE is installed (required for AppImages on some distributions):
   ```bash
   sudo apt install libfuse2    # Debian/Ubuntu
   sudo dnf install fuse-libs   # Fedora
   ```

## Getting more help

If your issue is not covered here:

- Search the [GitHub Issues](https://github.com/nicodeforge/opennotes/issues) for similar problems
- Open a [new issue](https://github.com/nicodeforge/opennotes/issues/new) with:
  - Your operating system and version
  - Steps to reproduce the issue
  - Any error messages you see
