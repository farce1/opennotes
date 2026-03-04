pub fn mix_to_stereo(mic: &[f32], system: &[f32], output: &mut Vec<f32>) {
    output.clear();
    output.reserve(mic.len() * 2);

    if system.is_empty() {
        for &sample in mic {
            output.push(sample);
            output.push(sample);
        }
        return;
    }

    for (idx, &mic_sample) in mic.iter().enumerate() {
        let system_sample = system.get(idx).copied().unwrap_or(mic_sample);
        output.push(mic_sample);
        output.push(system_sample);
    }
}

pub fn rms_level(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }

    let sum_squares: f32 = samples.iter().map(|sample| sample * sample).sum();
    (sum_squares / samples.len() as f32).sqrt()
}

fn goertzel_power(samples: &[f32], sample_rate: u32, target_hz: f32) -> f32 {
    if samples.len() < 2 || sample_rate == 0 || target_hz <= 0.0 {
        return 0.0;
    }

    let n = samples.len() as f32;
    let k = ((0.5 + (n * target_hz / sample_rate as f32)).floor()).max(1.0);
    let omega = (2.0 * std::f32::consts::PI * k) / n;
    let coeff = 2.0 * omega.cos();

    let mut q1 = 0.0f32;
    let mut q2 = 0.0f32;
    for &sample in samples {
        let q0 = coeff * q1 - q2 + sample;
        q2 = q1;
        q1 = q0;
    }

    (q1 * q1 + q2 * q2 - coeff * q1 * q2).max(0.0)
}

pub fn spectral_levels(samples: &[f32], sample_rate: u32) -> Vec<f32> {
    const BANDS: [f32; 7] = [120.0, 220.0, 400.0, 700.0, 1200.0, 2000.0, 3200.0];
    const MIN_SAMPLES: usize = 96;
    const WINDOW_SIZE: usize = 512;

    if samples.len() < MIN_SAMPLES || sample_rate == 0 {
        return vec![0.0; BANDS.len()];
    }

    let start = samples.len().saturating_sub(WINDOW_SIZE);
    let slice = &samples[start..];
    let len = slice.len();

    let mut windowed = Vec::with_capacity(len);
    let denom = (len as f32 - 1.0).max(1.0);
    for (idx, &sample) in slice.iter().enumerate() {
        let phase = (2.0 * std::f32::consts::PI * idx as f32) / denom;
        let hann = 0.5 - 0.5 * phase.cos();
        windowed.push(sample * hann);
    }

    let mut bands = Vec::with_capacity(BANDS.len());
    for &freq in &BANDS {
        let power = goertzel_power(&windowed, sample_rate, freq);
        let amplitude = power.sqrt() / len as f32;
        let normalized = (amplitude * 18.0).clamp(0.0, 1.0).powf(0.72);
        bands.push(normalized);
    }

    bands
}

pub fn f32_to_i16(samples: &[f32]) -> Vec<i16> {
    samples
        .iter()
        .map(|sample| (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
        .collect()
}
