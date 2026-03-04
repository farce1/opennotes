// Exception-safe wrappers around sherpa-onnx C API.
// The upstream C API (c-api.cc) lacks exception handling, so C++ exceptions
// from ONNX Runtime propagate into Rust and abort the process.

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <exception>
#include <cstdint>

struct SherpaOnnxOfflineRecognizerConfig;
struct SherpaOnnxOfflineRecognizer;
struct SherpaOnnxOfflineStream;

struct SherpaOnnxOfflineRecognizerResult {
  const char *text;
  // There are more fields, but we only need text.
};

extern "C" {
const SherpaOnnxOfflineRecognizer *SherpaOnnxCreateOfflineRecognizer(
    const SherpaOnnxOfflineRecognizerConfig *config);

const SherpaOnnxOfflineStream *
SherpaOnnxCreateOfflineStream(const SherpaOnnxOfflineRecognizer *recognizer);

void SherpaOnnxAcceptWaveformOffline(const SherpaOnnxOfflineStream *stream,
                                     int32_t sample_rate, const float *samples,
                                     int32_t n);

void SherpaOnnxDecodeOfflineStream(
    const SherpaOnnxOfflineRecognizer *recognizer,
    const SherpaOnnxOfflineStream *stream);

const SherpaOnnxOfflineRecognizerResult *
SherpaOnnxGetOfflineStreamResult(const SherpaOnnxOfflineStream *stream);

void SherpaOnnxDestroyOfflineRecognizerResult(
    const SherpaOnnxOfflineRecognizerResult *result);

void SherpaOnnxDestroyOfflineStream(const SherpaOnnxOfflineStream *stream);
}

// --- Safe wrapper: model creation ---

extern "C" const SherpaOnnxOfflineRecognizer *
SafeSherpaOnnxCreateOfflineRecognizer(
    const SherpaOnnxOfflineRecognizerConfig *config) {
  try {
    return SherpaOnnxCreateOfflineRecognizer(config);
  } catch (const std::exception &e) {
    fprintf(stderr, "[transcription] C++ exception during model load: %s\n",
            e.what());
    return nullptr;
  } catch (...) {
    fprintf(stderr,
            "[transcription] unknown C++ exception during model load\n");
    return nullptr;
  }
}

// --- Safe wrapper: full transcription ---
// Performs create-stream, accept-waveform, decode, read-result in one call
// wrapped in try/catch.  Returns a malloc'd string (caller must free) or NULL.

extern "C" char *SafeSherpaOnnxTranscribeOffline(
    const SherpaOnnxOfflineRecognizer *recognizer, int32_t sample_rate,
    const float *samples, int32_t num_samples) {
  try {
    auto *stream = SherpaOnnxCreateOfflineStream(recognizer);
    if (!stream) {
      fprintf(stderr, "[transcription] failed to create offline stream\n");
      return nullptr;
    }

    SherpaOnnxAcceptWaveformOffline(stream, sample_rate, samples, num_samples);
    SherpaOnnxDecodeOfflineStream(recognizer, stream);

    const auto *result = SherpaOnnxGetOfflineStreamResult(stream);
    char *text = nullptr;
    if (result && result->text) {
      text = strdup(result->text);
    }

    if (result)
      SherpaOnnxDestroyOfflineRecognizerResult(result);
    SherpaOnnxDestroyOfflineStream(stream);

    return text;
  } catch (const std::exception &e) {
    fprintf(stderr, "[transcription] C++ exception during transcription: %s\n",
            e.what());
    return nullptr;
  } catch (...) {
    fprintf(stderr,
            "[transcription] unknown C++ exception during transcription\n");
    return nullptr;
  }
}

extern "C" void SafeSherpaOnnxFreeString(char *s) { free(s); }
