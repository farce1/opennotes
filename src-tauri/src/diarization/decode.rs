use std::fs::File;
use std::path::Path;

use ogg::reading::PacketReader;
use opus::{Channels, Decoder};

const OPUS_SAMPLE_RATE: u32 = 48_000;
const OPUS_MAX_FRAME_SAMPLES: usize = 5_760; // 120ms at 48kHz

pub fn decode_ogg_opus_to_f32(path: &Path) -> Result<Vec<f32>, String> {
    let file = File::open(path).map_err(|err| format!("failed to open audio file: {err}"))?;
    let mut reader = PacketReader::new(file);
    let mut decoder =
        Decoder::new(OPUS_SAMPLE_RATE, Channels::Mono).map_err(|err| format!("failed to initialize opus decoder: {err}"))?;

    let mut samples: Vec<f32> = Vec::new();
    let mut pre_skip: usize = 0;

    loop {
        let packet = reader
            .read_packet()
            .map_err(|err| format!("ogg packet read failed: {err}"))?;

        let Some(packet) = packet else {
            break;
        };

        if packet.data.starts_with(b"OpusHead") {
            if packet.data.len() >= 12 {
                pre_skip = u16::from_le_bytes([packet.data[10], packet.data[11]]) as usize;
            }
            continue;
        }

        if packet.data.starts_with(b"OpusTags") {
            continue;
        }

        let mut decoded = vec![0.0f32; OPUS_MAX_FRAME_SAMPLES];
        let frames = decoder
            .decode_float(&packet.data, &mut decoded, false)
            .map_err(|err| format!("opus decode failed: {err}"))?;

        if frames > 0 {
            samples.extend_from_slice(&decoded[..frames]);
        }
    }

    if pre_skip >= samples.len() {
        return Ok(Vec::new());
    }

    if pre_skip > 0 {
        samples.drain(..pre_skip);
    }

    Ok(samples)
}
