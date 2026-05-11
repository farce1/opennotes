//! Pure-Rust archive extraction with SHA256 verification, disk pre-check,
//! and a typed error enum that the frontend can map to i18n keys.
//!
//! Phase 19 — EXTRACT-01..04. Replaces system tar shell-outs in
//! `download.rs` per CONTEXT.md D-15..D-20.

use std::fmt;
use std::fs::File;
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};

use bzip2_rs::DecoderReader;
use fs2::available_space;
use sha2::{Digest, Sha256};
use tar::Archive;

/// Co-located URL + SHA256 + size constants for a downloadable model archive.
/// The hash is part of the trust chain — bumping it requires a code change
/// (per CONTEXT.md D-17). Hex must be lowercase.
#[derive(Debug, Clone, Copy)]
pub struct ModelArchive {
    pub url: &'static str,
    pub sha256: &'static str,
    pub compressed_size: u64,
    pub uncompressed_size: u64,
}

impl ModelArchive {
    /// Required free space = compressed + uncompressed + 256 MiB headroom
    /// (per CONTEXT.md D-19). The compressed file lives on disk during
    /// extraction; the extracted tree lives alongside; the buffer covers
    /// filesystem block overhead on large model files.
    pub const HEADROOM_BYTES: u64 = 256 * 1024 * 1024;

    pub fn required_free_space(&self) -> u64 {
        self.compressed_size + self.uncompressed_size + Self::HEADROOM_BYTES
    }
}

/// Typed extraction errors. Each variant maps to a stable `kind` string the
/// frontend uses to look up i18n keys (Phase 11 OllamaError pattern).
#[derive(Debug)]
pub enum ExtractError {
    CorruptArchive(std::io::Error),
    DiskFull { needed: u64, available: u64 },
    PermissionDenied(PathBuf),
    HashMismatch { expected: String, actual: String },
    Unknown(std::io::Error),
}

impl ExtractError {
    /// Stable discriminator string for the JSON channel payload.
    /// Frontend `ModelSetupContext.tsx` reads this as `event.data.kind`.
    pub fn kind(&self) -> &'static str {
        match self {
            ExtractError::CorruptArchive(_)   => "corrupt_archive",
            ExtractError::DiskFull { .. }     => "disk_full",
            ExtractError::PermissionDenied(_) => "permission_denied",
            ExtractError::HashMismatch { .. } => "hash_mismatch",
            ExtractError::Unknown(_)          => "unknown",
        }
    }

    /// Human-readable message (English; final copy review tracked under
    /// ONBOARD-01 in Phase 21). Used to populate the existing
    /// `DownloadEvent::Error { message }` field for backward compat.
    pub fn message(&self) -> String {
        match self {
            ExtractError::CorruptArchive(e) =>
                format!("Archive appears corrupt: {e}"),
            ExtractError::DiskFull { needed, available } =>
                format!("Insufficient disk space: need {needed} bytes, only {available} available"),
            ExtractError::PermissionDenied(p) =>
                format!("Permission denied accessing {}", p.display()),
            ExtractError::HashMismatch { expected, actual } =>
                format!("Archive SHA256 mismatch: expected {expected}, got {actual}"),
            ExtractError::Unknown(e) =>
                format!("Unexpected extraction error: {e}"),
        }
    }
}

impl fmt::Display for ExtractError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message())
    }
}

impl std::error::Error for ExtractError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            ExtractError::CorruptArchive(e) | ExtractError::Unknown(e) => Some(e),
            _ => None,
        }
    }
}

/// Stream-hash `path` and compare against the lowercase hex `expected_hex`.
/// Buffered reads in 64 KiB chunks; no full-file allocation.
pub fn verify_sha256(path: &Path, expected_hex: &str) -> Result<(), ExtractError> {
    let file = File::open(path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::PermissionDenied {
            ExtractError::PermissionDenied(path.to_path_buf())
        } else {
            ExtractError::CorruptArchive(e)
        }
    })?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 65536];
    loop {
        let n = reader.read(&mut buf).map_err(ExtractError::CorruptArchive)?;
        if n == 0 { break; }
        hasher.update(&buf[..n]);
    }
    let actual = format!("{:x}", hasher.finalize());
    if actual != expected_hex {
        return Err(ExtractError::HashMismatch {
            expected: expected_hex.to_string(),
            actual,
        });
    }
    Ok(())
}

/// Verify `available_space(data_dir)` >= `needed`. Returns DiskFull
/// (with both values) if not. Errors from fs2 itself become Unknown.
pub fn check_disk_space(data_dir: &Path, needed: u64) -> Result<(), ExtractError> {
    let available = available_space(data_dir).map_err(ExtractError::Unknown)?;
    if available < needed {
        return Err(ExtractError::DiskFull { needed, available });
    }
    Ok(())
}

/// Streaming pure-Rust extraction:
///   File -> bzip2_rs::DecoderReader -> tar::Archive::unpack(dst)
///
/// Synchronous blocking I/O. Callers in async contexts MUST wrap this in
/// `tokio::task::spawn_blocking` (see CONTEXT.md D-16 and RESEARCH.md Pitfall 6).
///
/// Path-traversal safety: relies on `tar 0.4` default behavior which sanitizes
/// entry paths. Do NOT enable the unpack-xattrs option — it relaxes path
/// sanitization (RESEARCH.md Security Domain — threat: path traversal via malicious .tar.bz2).
/// CI grep gate enforces the literal symbol does not appear in this file.
pub fn extract_tar_bz2(src: &Path, dst: &Path) -> Result<(), ExtractError> {
    let file = File::open(src).map_err(|e| {
        if e.kind() == std::io::ErrorKind::PermissionDenied {
            ExtractError::PermissionDenied(src.to_path_buf())
        } else {
            ExtractError::CorruptArchive(e)
        }
    })?;
    let decoder = DecoderReader::new(file);
    let mut archive = Archive::new(decoder);
    archive.unpack(dst).map_err(|e| {
        if e.kind() == std::io::ErrorKind::PermissionDenied {
            ExtractError::PermissionDenied(dst.to_path_buf())
        } else {
            ExtractError::CorruptArchive(e)
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kind_strings_are_stable() {
        // Frontend i18n keys depend on these exact strings — do not rename.
        let io_err = || std::io::Error::other("x");
        assert_eq!(ExtractError::CorruptArchive(io_err()).kind(), "corrupt_archive");
        assert_eq!(ExtractError::DiskFull { needed: 0, available: 0 }.kind(), "disk_full");
        assert_eq!(ExtractError::PermissionDenied(PathBuf::from("/x")).kind(), "permission_denied");
        assert_eq!(ExtractError::HashMismatch { expected: "a".into(), actual: "b".into() }.kind(), "hash_mismatch");
        assert_eq!(ExtractError::Unknown(io_err()).kind(), "unknown");
    }

    #[test]
    fn required_free_space_includes_headroom() {
        let ma = ModelArchive {
            url: "x", sha256: "y",
            compressed_size: 100, uncompressed_size: 200,
        };
        assert_eq!(ma.required_free_space(), 100 + 200 + 256 * 1024 * 1024);
    }
}
