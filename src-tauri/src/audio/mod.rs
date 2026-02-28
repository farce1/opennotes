pub mod capture;
pub mod encoder;
pub mod mixer;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread::{self, JoinHandle};

use cpal::traits::StreamTrait;
use cpal::Stream;
use tauri::{AppHandle, Emitter, Manager};

pub type RecordingStateHandle = Arc<Mutex<RecordingState>>;

pub struct RecordingState {
    pub mic_stream: Option<Stream>,
    pub loopback_stream: Option<Stream>,
    pub mic_sample_tx: Option<mpsc::SyncSender<Vec<f32>>>,
    pub system_sample_tx: Option<mpsc::SyncSender<Vec<f32>>>,
    pub transcription_tx: Option<mpsc::SyncSender<Vec<f32>>>,
    pub transcription_rx: Option<mpsc::Receiver<Vec<f32>>>,
    pub encoder_tx: Option<mpsc::SyncSender<Vec<i16>>>,
    pub mixer_handle: Option<JoinHandle<()>>,
    pub encoder_handle: Option<JoinHandle<()>>,
    pub is_paused: AtomicBool,
    pub is_recording: AtomicBool,
    pub output_path: Option<PathBuf>,
}

impl Default for RecordingState {
    fn default() -> Self {
        Self {
            mic_stream: None,
            loopback_stream: None,
            mic_sample_tx: None,
            system_sample_tx: None,
            transcription_tx: None,
            transcription_rx: None,
            encoder_tx: None,
            mixer_handle: None,
            encoder_handle: None,
            is_paused: AtomicBool::new(false),
            is_recording: AtomicBool::new(false),
            output_path: None,
        }
    }
}

fn state_handle_from_app(app: &AppHandle) -> Result<RecordingStateHandle, String> {
    app.try_state::<RecordingStateHandle>()
        .map(|state| state.inner().clone())
        .ok_or_else(|| "recording state is not registered".to_string())
}

pub fn start_recording(
    app: &AppHandle,
    output_path: PathBuf,
    audio_source: Option<&str>,
) -> Result<(), String> {
    #[derive(Clone, Copy)]
    enum SourceMode {
        Mic,
        System,
        Both,
    }

    let state_handle = state_handle_from_app(app)?;
    let source_mode = match audio_source.unwrap_or("both").trim().to_lowercase().as_str() {
        "mic" => SourceMode::Mic,
        "system" => SourceMode::System,
        _ => SourceMode::Both,
    };

    {
        let state = state_handle
            .lock()
            .map_err(|_| "recording state lock poisoned".to_string())?;
        if state.is_recording.load(Ordering::SeqCst) {
            return Err("recording is already active".to_string());
        }
    }

    let (mic_tx, mic_rx) = mpsc::sync_channel::<Vec<f32>>(128);
    let (system_tx, system_rx) = mpsc::sync_channel::<Vec<f32>>(128);
    let (transcription_tx, transcription_rx) = mpsc::sync_channel::<Vec<f32>>(256);
    let (encoder_tx, encoder_rx) = mpsc::sync_channel::<Vec<i16>>(128);

    let capture_mic = !matches!(source_mode, SourceMode::System);
    let capture_system = !matches!(source_mode, SourceMode::Mic);

    let mut mic_stream = None;
    let mut mic_sample_rate = 48_000;
    if capture_mic {
        let mic_capture = capture::build_mic_stream(mic_tx.clone(), app.clone())?;
        mic_sample_rate = mic_capture.sample_rate;
        mic_stream = Some(mic_capture.stream);
    }

    let mut loopback_stream = None;
    let mut loopback_sample_rate = None;
    if capture_system {
        let loopback_capture = capture::build_loopback_stream(system_tx.clone());
        if matches!(source_mode, SourceMode::System) && loopback_capture.is_none() {
            return Err("system audio capture unavailable on this device".to_string());
        }
        loopback_sample_rate = loopback_capture.as_ref().map(|stream| stream.sample_rate);
        loopback_stream = loopback_capture.map(|stream| stream.stream);
    }

    let encoder_sample_rate = loopback_sample_rate.unwrap_or(mic_sample_rate);
    let output_path_for_encoder = output_path.clone();
    let encoder_handle = thread::spawn(move || {
        encoder::run_encoder(
            encoder::EncoderConfig {
                path: output_path_for_encoder,
                sample_rate: encoder_sample_rate,
                channels: 2,
            },
            encoder_rx,
        );
    });

    let mixer_state_handle = state_handle.clone();
    let encoder_tx_for_mixer = encoder_tx.clone();
    let transcription_tx_for_mixer = transcription_tx.clone();
    let mixer_handle = thread::spawn(move || {
        let mut latest_system = Vec::<f32>::new();
        let mut stereo_mix = Vec::<f32>::new();

        match source_mode {
            SourceMode::Mic | SourceMode::Both => {
                while let Ok(mic_chunk) = mic_rx.recv() {
                    while let Ok(system_chunk) = system_rx.try_recv() {
                        latest_system = system_chunk;
                    }

                    let paused = mixer_state_handle
                        .lock()
                        .map(|state| state.is_paused.load(Ordering::Relaxed))
                        .unwrap_or(false);
                    if paused {
                        continue;
                    }

                    let _ = transcription_tx_for_mixer.try_send(mic_chunk.clone());
                    if matches!(source_mode, SourceMode::Both) {
                        mixer::mix_to_stereo(&mic_chunk, &latest_system, &mut stereo_mix);
                    } else {
                        mixer::mix_to_stereo(&mic_chunk, &[], &mut stereo_mix);
                    }
                    let pcm_i16 = mixer::f32_to_i16(&stereo_mix);
                    let _ = encoder_tx_for_mixer.try_send(pcm_i16);
                }
            }
            SourceMode::System => {
                while let Ok(system_chunk) = system_rx.recv() {
                    let paused = mixer_state_handle
                        .lock()
                        .map(|state| state.is_paused.load(Ordering::Relaxed))
                        .unwrap_or(false);
                    if paused {
                        continue;
                    }

                    let _ = transcription_tx_for_mixer.try_send(system_chunk.clone());
                    mixer::mix_to_stereo(&system_chunk, &system_chunk, &mut stereo_mix);
                    let pcm_i16 = mixer::f32_to_i16(&stereo_mix);
                    let _ = encoder_tx_for_mixer.try_send(pcm_i16);
                }
            }
        }
    });

    if let Some(stream) = mic_stream.as_ref() {
        stream
            .play()
            .map_err(|err| format!("failed to start microphone stream: {err}"))?;
    }
    if let Some(stream) = loopback_stream.as_mut() {
        stream
            .play()
            .map_err(|err| format!("failed to start loopback stream: {err}"))?;
    }

    {
        let mut state = state_handle
            .lock()
            .map_err(|_| "recording state lock poisoned".to_string())?;

        state.mic_stream = mic_stream;
        state.loopback_stream = loopback_stream;
        state.mic_sample_tx = if capture_mic { Some(mic_tx) } else { None };
        state.system_sample_tx = if capture_system { Some(system_tx) } else { None };
        state.transcription_tx = Some(transcription_tx);
        state.transcription_rx = Some(transcription_rx);
        state.encoder_tx = Some(encoder_tx);
        state.mixer_handle = Some(mixer_handle);
        state.encoder_handle = Some(encoder_handle);
        state.output_path = Some(output_path);
        state.is_paused.store(false, Ordering::SeqCst);
        state.is_recording.store(true, Ordering::SeqCst);
    }

    Ok(())
}

pub fn stop_recording(app: &AppHandle) -> Result<PathBuf, String> {
    let state_handle = state_handle_from_app(app)?;

    let (
        output_path,
        mic_stream,
        loopback_stream,
        mic_sample_tx,
        system_sample_tx,
        transcription_tx,
        transcription_rx,
        mixer_handle,
        encoder_tx,
        encoder_handle,
    ) = {
        let mut state = state_handle
            .lock()
            .map_err(|_| "recording state lock poisoned".to_string())?;

        if !state.is_recording.load(Ordering::SeqCst) {
            return Err("recording is not active".to_string());
        }

        state.is_recording.store(false, Ordering::SeqCst);
        state.is_paused.store(false, Ordering::SeqCst);

        (
            state.output_path.clone(),
            state.mic_stream.take(),
            state.loopback_stream.take(),
            state.mic_sample_tx.take(),
            state.system_sample_tx.take(),
            state.transcription_tx.take(),
            state.transcription_rx.take(),
            state.mixer_handle.take(),
            state.encoder_tx.take(),
            state.encoder_handle.take(),
        )
    };

    drop(mic_stream);
    drop(loopback_stream);
    drop(mic_sample_tx);
    drop(system_sample_tx);
    drop(transcription_tx);
    drop(transcription_rx);

    if let Some(handle) = mixer_handle {
        let _ = handle.join();
    }

    drop(encoder_tx);
    if let Some(handle) = encoder_handle {
        let _ = handle.join();
    }

    output_path.ok_or_else(|| "recording finished but no output path was tracked".to_string())
}

pub fn pause_recording(app: &AppHandle) -> Result<(), String> {
    let state_handle = state_handle_from_app(app)?;

    {
        let state = state_handle
            .lock()
            .map_err(|_| "recording state lock poisoned".to_string())?;

        if !state.is_recording.load(Ordering::SeqCst) {
            return Err("cannot pause when recording is not active".to_string());
        }

        state.is_paused.store(true, Ordering::SeqCst);
    }

    let _ = app.emit("recording-paused", ());
    Ok(())
}

pub fn resume_recording(app: &AppHandle) -> Result<(), String> {
    let state_handle = state_handle_from_app(app)?;

    {
        let state = state_handle
            .lock()
            .map_err(|_| "recording state lock poisoned".to_string())?;

        if !state.is_recording.load(Ordering::SeqCst) {
            return Err("cannot resume when recording is not active".to_string());
        }

        state.is_paused.store(false, Ordering::SeqCst);
    }

    let _ = app.emit("recording-resumed", ());
    Ok(())
}
