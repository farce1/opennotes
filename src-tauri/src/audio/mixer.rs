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

pub fn f32_to_i16(samples: &[f32]) -> Vec<i16> {
    samples
        .iter()
        .map(|sample| (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
        .collect()
}
