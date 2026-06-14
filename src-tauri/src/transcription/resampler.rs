use std::collections::VecDeque;

use rubato::{FftFixedIn, Resampler};

pub struct AudioResampler {
    inner: FftFixedIn<f32>,
    input_buffer: Vec<Vec<f32>>,
    output_buffer: Vec<Vec<f32>>,
    chunk_size: usize,
}

impl AudioResampler {
    pub fn new(from_rate: usize, to_rate: usize, chunk_size: usize) -> Result<Self, String> {
        let inner = FftFixedIn::<f32>::new(from_rate, to_rate, chunk_size, 2, 1)
            .map_err(|err| format!("failed to initialize resampler: {err}"))?;

        let output_frames = inner.output_frames_next();
        Ok(Self {
            inner,
            input_buffer: vec![vec![0.0; chunk_size]],
            output_buffer: vec![vec![0.0; output_frames]],
            chunk_size,
        })
    }

    pub fn process(&mut self, input: &[f32]) -> Result<Vec<f32>, String> {
        if input.len() != self.chunk_size {
            return Err(format!(
                "invalid input size for resampler: expected {}, got {}",
                self.chunk_size,
                input.len()
            ));
        }

        self.input_buffer[0].copy_from_slice(input);
        let (_, written_frames) = self
            .inner
            .process_into_buffer(&self.input_buffer, &mut self.output_buffer, None)
            .map_err(|err| format!("resampler process failed: {err}"))?;

        Ok(self.output_buffer[0][..written_frames].to_vec())
    }
}

pub struct RingAccumulator {
    chunk_size: usize,
    buffer: VecDeque<f32>,
}

impl RingAccumulator {
    pub fn new(chunk_size: usize) -> Self {
        Self {
            chunk_size,
            buffer: VecDeque::new(),
        }
    }

    pub fn push(&mut self, samples: &[f32]) {
        self.buffer.extend(samples.iter().copied());
    }

    pub fn drain_chunks(&mut self) -> std::vec::IntoIter<Vec<f32>> {
        let mut chunks = Vec::new();

        while self.buffer.len() >= self.chunk_size {
            let mut chunk = Vec::with_capacity(self.chunk_size);
            for _ in 0..self.chunk_size {
                if let Some(sample) = self.buffer.pop_front() {
                    chunk.push(sample);
                }
            }
            chunks.push(chunk);
        }

        chunks.into_iter()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resampler_handles_16k_input_rate() {
        // Bluetooth HFP mics deliver 16 kHz; resampling must work from the real rate.
        let mut resampler = AudioResampler::new(16_000, 16_000, 1_536).expect("builds");
        let out = resampler.process(&vec![0.0f32; 1_536]).expect("processes");
        assert!(!out.is_empty());
    }

    #[test]
    fn resampler_downsamples_44100_input_rate() {
        let mut resampler = AudioResampler::new(44_100, 16_000, 1_536).expect("builds");
        let out = resampler.process(&vec![0.0f32; 1_536]).expect("processes");
        assert!(!out.is_empty() && out.len() < 1_536);
    }
}
