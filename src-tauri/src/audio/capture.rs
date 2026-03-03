use std::sync::mpsc;
use std::time::{Duration, Instant};

#[cfg(target_os = "macos")]
use std::process::Command;

use cpal::traits::{DeviceTrait, HostTrait};
use cpal::{BufferSize, SampleFormat, Stream, StreamConfig};
use tauri::{AppHandle, Emitter};

use super::mixer;

pub struct BuiltStream {
    pub stream: Stream,
    pub sample_rate: u32,
}

fn downmix_to_mono(samples: &[f32], channels: u16) -> Vec<f32> {
    if channels <= 1 {
        return samples.to_vec();
    }

    let channels = usize::from(channels);
    let mut mono = Vec::with_capacity(samples.len() / channels + 1);

    for frame in samples.chunks_exact(channels) {
        let sum: f32 = frame.iter().copied().sum();
        mono.push(sum / channels as f32);
    }

    mono
}

fn normalize_i16(samples: &[i16]) -> Vec<f32> {
    samples
        .iter()
        .map(|sample| *sample as f32 / i16::MAX as f32)
        .collect()
}

fn normalize_u16(samples: &[u16]) -> Vec<f32> {
    samples
        .iter()
        .map(|sample| (*sample as f32 / u16::MAX as f32) * 2.0 - 1.0)
        .collect()
}

fn select_mic_config(device: &cpal::Device) -> Result<(StreamConfig, SampleFormat), String> {
    if let Ok(configs) = device.supported_input_configs() {
        for cfg in configs {
            if cfg.sample_format() == SampleFormat::F32
                && cfg.channels() >= 1
                && cfg.min_sample_rate() <= 48_000
                && cfg.max_sample_rate() >= 48_000
            {
                return Ok((
                    StreamConfig {
                        channels: 1,
                        sample_rate: 48_000,
                        buffer_size: BufferSize::Default,
                    },
                    SampleFormat::F32,
                ));
            }
        }
    }

    let fallback = device
        .default_input_config()
        .map_err(|err| format!("failed to get default input config: {err}"))?;
    Ok((fallback.config(), fallback.sample_format()))
}

fn select_loopback_config(device: &cpal::Device) -> Result<(StreamConfig, SampleFormat), String> {
    if let Ok(configs) = device.supported_output_configs() {
        for cfg in configs {
            if cfg.sample_format() == SampleFormat::F32
                && cfg.channels() >= 1
                && cfg.min_sample_rate() <= 48_000
                && cfg.max_sample_rate() >= 48_000
            {
                return Ok((
                    StreamConfig {
                        channels: cfg.channels(),
                        sample_rate: 48_000,
                        buffer_size: BufferSize::Default,
                    },
                    SampleFormat::F32,
                ));
            }
        }
    }

    if let Ok(configs) = device.supported_input_configs() {
        for cfg in configs {
            if cfg.sample_format() == SampleFormat::F32
                && cfg.channels() >= 1
                && cfg.min_sample_rate() <= 48_000
                && cfg.max_sample_rate() >= 48_000
            {
                return Ok((
                    StreamConfig {
                        channels: cfg.channels(),
                        sample_rate: 48_000,
                        buffer_size: BufferSize::Default,
                    },
                    SampleFormat::F32,
                ));
            }
        }
    }

    let fallback = device
        .default_output_config()
        .or_else(|_| device.default_input_config())
        .map_err(|err| format!("failed to get default config for loopback: {err}"))?;
    Ok((fallback.config(), fallback.sample_format()))
}

pub fn build_mic_stream(
    tx: mpsc::SyncSender<Vec<f32>>,
    app: AppHandle,
    preferred_device_name: Option<&str>,
) -> Result<BuiltStream, String> {
    let host = cpal::default_host();
    let (device, used_fallback) = if let Some(name) = preferred_device_name {
        let found = host.input_devices().ok().and_then(|mut devices| {
            devices.find(|device| {
                device
                    .description()
                    .ok()
                    .map(|desc| desc.name().trim().eq_ignore_ascii_case(name.trim()))
                    .unwrap_or(false)
            })
        });

        match found {
            Some(device) => (device, false),
            None => {
                let fallback = host
                    .default_input_device()
                    .ok_or_else(|| "no default microphone input device found".to_string())?;
                (fallback, true)
            }
        }
    } else {
        let default_device = host
            .default_input_device()
            .ok_or_else(|| "no default microphone input device found".to_string())?;
        (default_device, false)
    };

    if used_fallback {
        let _ = app.emit("preferred-mic-unavailable", ());
    }

    let (config, sample_format) = select_mic_config(&device)?;
    let sample_rate = config.sample_rate;
    let channels = config.channels;

    let err_fn = |err| eprintln!("microphone stream error: {err}");

    let stream = match sample_format {
        SampleFormat::F32 => {
            let tx = tx.clone();
            let app = app.clone();
            let mut last_emit = Instant::now();
            device
                .build_input_stream(
                    &config,
                    move |data: &[f32], _| {
                        let mono = downmix_to_mono(data, channels);

                        if last_emit.elapsed() >= Duration::from_millis(50) {
                            let _ = app.emit("audio-level", mixer::rms_level(&mono));
                            last_emit = Instant::now();
                        }

                        let _ = tx.try_send(mono);
                    },
                    err_fn,
                    None,
                )
                .map_err(|err| format!("failed to build microphone stream: {err}"))?
        }
        SampleFormat::I16 => {
            let tx = tx.clone();
            let app = app.clone();
            let mut last_emit = Instant::now();
            device
                .build_input_stream(
                    &config,
                    move |data: &[i16], _| {
                        let mono = downmix_to_mono(&normalize_i16(data), channels);

                        if last_emit.elapsed() >= Duration::from_millis(50) {
                            let _ = app.emit("audio-level", mixer::rms_level(&mono));
                            last_emit = Instant::now();
                        }

                        let _ = tx.try_send(mono);
                    },
                    err_fn,
                    None,
                )
                .map_err(|err| format!("failed to build microphone stream: {err}"))?
        }
        SampleFormat::U16 => {
            let tx = tx.clone();
            let app = app.clone();
            let mut last_emit = Instant::now();
            device
                .build_input_stream(
                    &config,
                    move |data: &[u16], _| {
                        let mono = downmix_to_mono(&normalize_u16(data), channels);

                        if last_emit.elapsed() >= Duration::from_millis(50) {
                            let _ = app.emit("audio-level", mixer::rms_level(&mono));
                            last_emit = Instant::now();
                        }

                        let _ = tx.try_send(mono);
                    },
                    err_fn,
                    None,
                )
                .map_err(|err| format!("failed to build microphone stream: {err}"))?
        }
        _ => {
            return Err(format!(
                "unsupported microphone sample format {:?}; expected f32/i16/u16",
                sample_format
            ))
        }
    };

    Ok(BuiltStream { stream, sample_rate })
}

#[cfg(target_os = "macos")]
pub fn build_loopback_stream(tx: mpsc::SyncSender<Vec<f32>>) -> Option<BuiltStream> {
    let (major, minor) = macos_version();
    if (major, minor) < (14, 6) {
        eprintln!(
            "system audio loopback requires macOS 14.6+; current version {}.{}",
            major, minor
        );
        return None;
    }

    let host = cpal::host_from_id(cpal::HostId::CoreAudio).ok()?;
    let device = host.output_devices().ok()?.next()?;
    let (config, sample_format) = select_loopback_config(&device).ok()?;
    let sample_rate = config.sample_rate;
    let channels = config.channels;

    let err_fn = |err| eprintln!("loopback stream error: {err}");

    let stream = match sample_format {
        SampleFormat::F32 => {
            let tx = tx.clone();
            device
                .build_input_stream(
                    &config,
                    move |data: &[f32], _| {
                        let mono = downmix_to_mono(data, channels);
                        let _ = tx.try_send(mono);
                    },
                    err_fn,
                    None,
                )
                .ok()?
        }
        SampleFormat::I16 => {
            let tx = tx.clone();
            device
                .build_input_stream(
                    &config,
                    move |data: &[i16], _| {
                        let mono = downmix_to_mono(&normalize_i16(data), channels);
                        let _ = tx.try_send(mono);
                    },
                    err_fn,
                    None,
                )
                .ok()?
        }
        SampleFormat::U16 => {
            let tx = tx.clone();
            device
                .build_input_stream(
                    &config,
                    move |data: &[u16], _| {
                        let mono = downmix_to_mono(&normalize_u16(data), channels);
                        let _ = tx.try_send(mono);
                    },
                    err_fn,
                    None,
                )
                .ok()?
        }
        _ => {
            eprintln!(
                "unsupported loopback sample format {:?}; expected f32/i16/u16",
                sample_format
            );
            return None;
        }
    };

    Some(BuiltStream { stream, sample_rate })
}

#[cfg(target_os = "windows")]
pub fn build_loopback_stream(tx: mpsc::SyncSender<Vec<f32>>) -> Option<BuiltStream> {
    let host = cpal::host_from_id(cpal::HostId::Wasapi).ok()?;
    let device = host.default_output_device()?;
    let (config, sample_format) = select_loopback_config(&device).ok()?;
    let sample_rate = config.sample_rate;
    let channels = config.channels;

    let err_fn = |err| eprintln!("loopback stream error: {err}");

    let stream = match sample_format {
        SampleFormat::F32 => {
            let tx = tx.clone();
            device
                .build_input_stream(
                    &config,
                    move |data: &[f32], _| {
                        let mono = downmix_to_mono(data, channels);
                        let _ = tx.try_send(mono);
                    },
                    err_fn,
                    None,
                )
                .ok()?
        }
        SampleFormat::I16 => {
            let tx = tx.clone();
            device
                .build_input_stream(
                    &config,
                    move |data: &[i16], _| {
                        let mono = downmix_to_mono(&normalize_i16(data), channels);
                        let _ = tx.try_send(mono);
                    },
                    err_fn,
                    None,
                )
                .ok()?
        }
        SampleFormat::U16 => {
            let tx = tx.clone();
            device
                .build_input_stream(
                    &config,
                    move |data: &[u16], _| {
                        let mono = downmix_to_mono(&normalize_u16(data), channels);
                        let _ = tx.try_send(mono);
                    },
                    err_fn,
                    None,
                )
                .ok()?
        }
        _ => {
            eprintln!(
                "unsupported loopback sample format {:?}; expected f32/i16/u16",
                sample_format
            );
            return None;
        }
    };

    Some(BuiltStream { stream, sample_rate })
}

#[cfg(target_os = "linux")]
pub fn build_loopback_stream(tx: mpsc::SyncSender<Vec<f32>>) -> Option<BuiltStream> {
    let host = cpal::default_host();
    let device = host.input_devices().ok()?.find(|device| {
        device
            .description()
            .map(|desc| desc.name().to_lowercase().contains("monitor"))
            .unwrap_or(false)
    })?;

    let (config, sample_format) = select_loopback_config(&device).ok()?;
    let sample_rate = config.sample_rate;
    let channels = config.channels;

    let err_fn = |err| eprintln!("loopback stream error: {err}");

    let stream = match sample_format {
        SampleFormat::F32 => {
            let tx = tx.clone();
            device
                .build_input_stream(
                    &config,
                    move |data: &[f32], _| {
                        let mono = downmix_to_mono(data, channels);
                        let _ = tx.try_send(mono);
                    },
                    err_fn,
                    None,
                )
                .ok()?
        }
        SampleFormat::I16 => {
            let tx = tx.clone();
            device
                .build_input_stream(
                    &config,
                    move |data: &[i16], _| {
                        let mono = downmix_to_mono(&normalize_i16(data), channels);
                        let _ = tx.try_send(mono);
                    },
                    err_fn,
                    None,
                )
                .ok()?
        }
        SampleFormat::U16 => {
            let tx = tx.clone();
            device
                .build_input_stream(
                    &config,
                    move |data: &[u16], _| {
                        let mono = downmix_to_mono(&normalize_u16(data), channels);
                        let _ = tx.try_send(mono);
                    },
                    err_fn,
                    None,
                )
                .ok()?
        }
        _ => {
            eprintln!(
                "unsupported loopback sample format {:?}; expected f32/i16/u16",
                sample_format
            );
            return None;
        }
    };

    Some(BuiltStream { stream, sample_rate })
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
pub fn build_loopback_stream(_tx: mpsc::SyncSender<Vec<f32>>) -> Option<BuiltStream> {
    None
}

#[cfg(target_os = "macos")]
pub fn macos_version() -> (u32, u32) {
    let output = Command::new("sysctl")
        .args(["-n", "kern.osproductversion"])
        .output();

    let Ok(output) = output else {
        return (0, 0);
    };

    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let mut parts = version.split('.');

    let major = parts
        .next()
        .and_then(|value| value.parse::<u32>().ok())
        .unwrap_or(0);
    let minor = parts
        .next()
        .and_then(|value| value.parse::<u32>().ok())
        .unwrap_or(0);

    (major, minor)
}
