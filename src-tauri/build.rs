fn main() {
    // Compile C++ shim that wraps SherpaOnnxCreateOfflineRecognizer in try/catch.
    // The upstream sherpa-onnx C API lacks exception handling, so without this
    // wrapper a C++ exception during model loading aborts the Rust process.
    cc::Build::new()
        .cpp(true)
        .file("cpp/safe_sherpa.cpp")
        .compile("safe_sherpa");

    tauri_build::build()
}
