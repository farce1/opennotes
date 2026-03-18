use std::collections::{BTreeSet, HashMap};
use std::path::PathBuf;

use rubato::{FftFixedIn, Resampler};
use sherpa_rs::diarize::{Diarize, DiarizeConfig};
use sqlx::{FromRow, SqlitePool};
use tauri::ipc::Channel;

use super::{decode, model, DiarizationEvent};

const INPUT_SAMPLE_RATE: usize = 48_000;
const DIARIZATION_SAMPLE_RATE: usize = 16_000;
const RESAMPLER_CHUNK_SIZE: usize = 1_536;

#[derive(Clone, Debug)]
struct TurnSegment {
    speaker_index: i64,
    start_ms: i64,
    end_ms: i64,
}

#[derive(Debug, FromRow)]
struct TranscriptAlignRow {
    id: i64,
    start_time_ms: i64,
    end_time_ms: i64,
}

fn to_ms(seconds: f32) -> i64 {
    (seconds.max(0.0) * 1000.0).round() as i64
}

fn overlap_ms(a_start: i64, a_end: i64, b_start: i64, b_end: i64) -> i64 {
    (a_end.min(b_end) - a_start.max(b_start)).max(0)
}

fn midpoint_ms(start: i64, end: i64) -> i64 {
    start + ((end - start) / 2)
}

fn resample_48k_to_16k(samples_48k: &[f32]) -> Result<Vec<f32>, String> {
    if samples_48k.is_empty() {
        return Ok(Vec::new());
    }

    let mut resampler = FftFixedIn::<f32>::new(
        INPUT_SAMPLE_RATE,
        DIARIZATION_SAMPLE_RATE,
        RESAMPLER_CHUNK_SIZE,
        2,
        1,
    )
    .map_err(|err| format!("failed to initialize diarization resampler: {err}"))?;

    let output_frames = resampler.output_frames_next();
    let mut input_buffer = vec![vec![0.0f32; RESAMPLER_CHUNK_SIZE]];
    let mut output_buffer = vec![vec![0.0f32; output_frames]];
    let mut output = Vec::new();
    let mut index = 0usize;

    while index < samples_48k.len() {
        input_buffer[0].fill(0.0);

        let remaining = samples_48k.len() - index;
        let take = remaining.min(RESAMPLER_CHUNK_SIZE);
        input_buffer[0][..take].copy_from_slice(&samples_48k[index..index + take]);
        index += take;

        let (_, written) = resampler
            .process_into_buffer(&input_buffer, &mut output_buffer, None)
            .map_err(|err| format!("diarization resampler failed: {err}"))?;

        output.extend_from_slice(&output_buffer[0][..written]);
    }

    Ok(output)
}

fn assign_speakers_to_transcript(
    transcript_rows: &[TranscriptAlignRow],
    segments: &[TurnSegment],
) -> Vec<(i64, i64)> {
    if segments.is_empty() {
        return Vec::new();
    }

    let mut assignments = Vec::new();

    for row in transcript_rows {
        let start = row.start_time_ms;
        let end = row.end_time_ms.max(start + 1);

        let mut best_overlap = -1i64;
        let mut best_speaker = None;

        for segment in segments {
            let overlap = overlap_ms(start, end, segment.start_ms, segment.end_ms);
            if overlap > best_overlap {
                best_overlap = overlap;
                best_speaker = Some(segment.speaker_index);
            }
        }

        if best_overlap <= 0 {
            let midpoint = midpoint_ms(start, end);
            let mut closest_distance = i64::MAX;
            for segment in segments {
                let distance = if midpoint < segment.start_ms {
                    segment.start_ms - midpoint
                } else if midpoint > segment.end_ms {
                    midpoint - segment.end_ms
                } else {
                    0
                };
                if distance < closest_distance {
                    closest_distance = distance;
                    best_speaker = Some(segment.speaker_index);
                }
            }
        }

        if let Some(speaker_index) = best_speaker {
            assignments.push((row.id, speaker_index));
        }
    }

    assignments
}

pub fn run_worker(
    pool: SqlitePool,
    data_dir: PathBuf,
    meeting_id: i64,
    on_event: Channel<DiarizationEvent>,
) -> Result<(), String> {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|err| format!("failed to create diarization runtime: {err}"))?;

    let result: Result<(), String> = (|| {
        runtime.block_on(async {
            sqlx::query(
                "UPDATE meetings
                 SET diarization_status = 'running', updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?",
            )
            .bind(meeting_id)
            .execute(&pool)
            .await
            .map_err(|err| format!("failed to set diarization status to running: {err}"))?;

            Ok::<(), String>(())
        })?;

        let audio_path = runtime.block_on(async {
            sqlx::query_scalar::<_, Option<String>>("SELECT audio_path FROM meetings WHERE id = ?")
                .bind(meeting_id)
                .fetch_one(&pool)
                .await
                .map_err(|err| format!("failed to fetch meeting audio path: {err}"))
        })?;

        let audio_path = audio_path
            .as_deref()
            .map(str::trim)
            .filter(|path| !path.is_empty())
            .ok_or_else(|| "meeting has no audio path for diarization".to_string())?;

        let samples_48k = decode::decode_ogg_opus_to_f32(PathBuf::from(audio_path).as_path())?;
        let samples_16k = resample_48k_to_16k(&samples_48k)?;

        let segmentation_model = model::segmentation_model_path(data_dir.as_path());
        let embedding_model = model::embedding_model_path(data_dir.as_path());

        let config = DiarizeConfig {
            num_clusters: None,
            threshold: Some(0.5),
            min_duration_on: Some(0.3),
            min_duration_off: Some(0.5),
            provider: Some("cpu".to_string()),
            debug: false,
        };

        let mut diarizer = Diarize::new(
            segmentation_model.to_string_lossy().to_string(),
            embedding_model.to_string_lossy().to_string(),
            config,
        )
        .map_err(|err| format!("failed to initialize diarization model: {err}"))?;

        let progress_channel = on_event.clone();
        let progress = move |computed: i32, total: i32| -> i32 {
            let percent = if total <= 0 {
                0
            } else {
                ((computed.max(0) as f64 / total as f64) * 100.0).round() as u8
            };
            let _ = progress_channel.send(DiarizationEvent::Progress {
                percent: percent.min(100),
            });
            0
        };

        let diarized_segments = diarizer
            .compute(samples_16k, Some(Box::new(progress)))
            .map_err(|err| format!("diarization compute failed: {err}"))?;

        let turns: Vec<TurnSegment> = diarized_segments
            .iter()
            .map(|segment| TurnSegment {
                speaker_index: i64::from(segment.speaker.max(0)),
                start_ms: to_ms(segment.start),
                end_ms: to_ms(segment.end),
            })
            .collect();

        let transcript_rows = runtime.block_on(async {
            sqlx::query_as::<_, TranscriptAlignRow>(
                "SELECT id, start_time_ms, (start_time_ms + 1000) AS end_time_ms
                 FROM transcripts
                 WHERE meeting_id = ?
                 ORDER BY segment_index",
            )
            .bind(meeting_id)
            .fetch_all(&pool)
            .await
            .map_err(|err| {
                format!("failed to load transcript rows for diarization alignment: {err}")
            })
        })?;

        let assignments = assign_speakers_to_transcript(&transcript_rows, &turns);
        let unique_speakers: BTreeSet<i64> = turns.iter().map(|turn| turn.speaker_index).collect();

        runtime.block_on(async {
            let mut tx = pool
                .begin()
                .await
                .map_err(|err| format!("failed to begin diarization transaction: {err}"))?;

            sqlx::query("DELETE FROM speaker_turns WHERE meeting_id = ?")
                .bind(meeting_id)
                .execute(&mut *tx)
                .await
                .map_err(|err| format!("failed to clear existing speaker turns: {err}"))?;

            sqlx::query("UPDATE transcripts SET speaker_id = NULL WHERE meeting_id = ?")
                .bind(meeting_id)
                .execute(&mut *tx)
                .await
                .map_err(|err| {
                    format!("failed to clear existing transcript speaker links: {err}")
                })?;

            sqlx::query("DELETE FROM speakers WHERE meeting_id = ?")
                .bind(meeting_id)
                .execute(&mut *tx)
                .await
                .map_err(|err| format!("failed to clear existing speakers: {err}"))?;

            for turn in &turns {
                sqlx::query(
                    "INSERT INTO speaker_turns (meeting_id, speaker_index, start_ms, end_ms)
                     VALUES (?, ?, ?, ?)",
                )
                .bind(meeting_id)
                .bind(turn.speaker_index)
                .bind(turn.start_ms)
                .bind(turn.end_ms)
                .execute(&mut *tx)
                .await
                .map_err(|err| format!("failed to insert speaker turn: {err}"))?;
            }

            let mut speaker_ids: HashMap<i64, i64> = HashMap::new();
            for speaker_index in unique_speakers {
                let speaker_id = sqlx::query_scalar::<_, i64>(
                    "INSERT INTO speakers (meeting_id, speaker_index, display_name, color_index)
                     VALUES (?, ?, '', ?)
                     RETURNING id",
                )
                .bind(meeting_id)
                .bind(speaker_index)
                .bind(speaker_index)
                .fetch_one(&mut *tx)
                .await
                .map_err(|err| format!("failed to insert speaker row: {err}"))?;

                speaker_ids.insert(speaker_index, speaker_id);
            }

            for (transcript_id, speaker_index) in assignments {
                if let Some(speaker_id) = speaker_ids.get(&speaker_index) {
                    sqlx::query("UPDATE transcripts SET speaker_id = ? WHERE id = ?")
                        .bind(*speaker_id)
                        .bind(transcript_id)
                        .execute(&mut *tx)
                        .await
                        .map_err(|err| format!("failed to assign transcript speaker: {err}"))?;
                }
            }

            sqlx::query(
                "UPDATE meetings
                 SET diarization_status = 'complete', updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?",
            )
            .bind(meeting_id)
            .execute(&mut *tx)
            .await
            .map_err(|err| format!("failed to set diarization status to complete: {err}"))?;

            tx.commit()
                .await
                .map_err(|err| format!("failed to commit diarization transaction: {err}"))?;

            Ok::<(), String>(())
        })?;

        Ok(())
    })();

    match result {
        Ok(()) => {
            let _ = on_event.send(DiarizationEvent::Complete);
            Ok(())
        }
        Err(message) => {
            let _ = runtime.block_on(async {
                sqlx::query(
                    "UPDATE meetings
                     SET diarization_status = 'failed', updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?",
                )
                .bind(meeting_id)
                .execute(&pool)
                .await
            });

            let _ = on_event.send(DiarizationEvent::Error {
                message: message.clone(),
            });
            Err(message)
        }
    }
}
