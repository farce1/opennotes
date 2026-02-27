use std::path::PathBuf;
use std::sync::mpsc;

use libopusenc::{
    OpusEncBitrate, OpusEncChannelMapping, OpusEncComments, OpusEncSampleRate, OpusEncoder,
};

pub struct EncoderConfig {
    pub path: PathBuf,
    pub sample_rate: u32,
    pub channels: u16,
}

fn map_sample_rate(sample_rate: u32) -> OpusEncSampleRate {
    match sample_rate {
        8_000 => OpusEncSampleRate::Hz8000,
        12_000 => OpusEncSampleRate::Hz12000,
        16_000 => OpusEncSampleRate::Hz16000,
        24_000 => OpusEncSampleRate::Hz24000,
        48_000 => OpusEncSampleRate::Hz48000,
        _ => {
            eprintln!(
                "unsupported sample rate {} for libopusenc, falling back to 48kHz",
                sample_rate
            );
            OpusEncSampleRate::Hz48000
        }
    }
}

pub fn run_encoder(config: EncoderConfig, rx: mpsc::Receiver<Vec<i16>>) {
    if let Some(parent) = config.path.parent() {
        if let Err(err) = std::fs::create_dir_all(parent) {
            eprintln!("failed to create recording directory: {err}");
            return;
        }
    }

    let mut comments = match OpusEncComments::create() {
        Ok(comments) => comments,
        Err(err) => {
            eprintln!("failed to create opus comments: {err}");
            return;
        }
    };

    let path = config.path.to_string_lossy().to_string();
    let channels = config.channels.clamp(1, 2) as u8;
    let sample_rate = map_sample_rate(config.sample_rate);

    let mut encoder = match OpusEncoder::create_file(
        &path,
        &mut comments,
        sample_rate,
        channels,
        OpusEncChannelMapping::MonoStereo,
    ) {
        Ok(encoder) => encoder,
        Err(err) => {
            eprintln!("failed to create opus encoder: {err}");
            return;
        }
    };

    let bitrate = OpusEncBitrate::Explicit(24_000 * u32::from(channels));
    if let Err(err) = encoder.set_vbr(true).and_then(|enc| enc.set_bitrate(bitrate)) {
        eprintln!("failed to configure opus encoder: {err}");
    }

    while let Ok(samples) = rx.recv() {
        if samples.is_empty() {
            continue;
        }

        if let Err(err) = encoder.write(&samples, usize::from(channels)) {
            eprintln!("failed writing opus samples: {err}");
            break;
        }
    }

    if let Err(err) = encoder.drain() {
        eprintln!("failed to finalize opus encoder: {err}");
    }
}
