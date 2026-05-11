//! Integration tests for `src-tauri/src/extract.rs` — Phase 19 EXTRACT-01..04.
//!
//! Covers: SHA256 correctness, hash mismatch, disk-full pre-check,
//! corrupt-archive error path, valid-archive happy path.

use std::fs;
use std::path::{Path, PathBuf};

use app_lib::extract::{
    check_disk_space, extract_tar_bz2, verify_sha256, ExtractError, ModelArchive,
};

// SHA256 of `tests/fixtures/valid.tar.bz2` captured at generation time.
// Regenerate via:
//   shasum -a 256 src-tauri/tests/fixtures/valid.tar.bz2
const VALID_BZ2_SHA256: &str = "a8c8ad9e2b731789a85c90a4197e0146b90d9e0e3fa1eb43e4212da66f85b551";

fn valid_bz2() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/valid.tar.bz2")
}

fn corrupt_bz2() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/corrupt.tar.bz2")
}

#[test]
fn test_sha256_correct() {
    let result = verify_sha256(&valid_bz2(), VALID_BZ2_SHA256);
    assert!(result.is_ok(), "expected Ok for correct hash, got {result:?}");
}

#[test]
fn test_sha256_mismatch() {
    let wrong = "0000000000000000000000000000000000000000000000000000000000000000";
    let result = verify_sha256(&valid_bz2(), wrong);
    match result {
        Err(ExtractError::HashMismatch { expected, actual }) => {
            assert_eq!(expected, wrong);
            assert_eq!(actual.len(), 64, "actual hash must be 64 hex chars");
            assert!(
                actual
                    .chars()
                    .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()),
                "actual must be lowercase hex"
            );
        }
        other => panic!("expected HashMismatch, got {other:?}"),
    }
}

#[test]
fn test_disk_full_returns_diskfull_error() {
    // Request u64::MAX bytes — guaranteed to exceed any disk's available_space.
    let tmp = tempfile::tempdir().expect("create tempdir");
    let result = check_disk_space(tmp.path(), u64::MAX);
    match result {
        Err(ExtractError::DiskFull { needed, available }) => {
            assert_eq!(needed, u64::MAX);
            assert!(available < u64::MAX);
        }
        other => panic!("expected DiskFull, got {other:?}"),
    }
}

#[test]
fn test_corrupt_archive_returns_corruptarchive_error() {
    let dst = tempfile::tempdir().expect("create tempdir");
    let result = extract_tar_bz2(&corrupt_bz2(), dst.path());
    match result {
        Err(ExtractError::CorruptArchive(_)) => {}
        other => panic!("expected CorruptArchive, got {other:?}"),
    }
}

#[test]
fn test_valid_archive_extracts_successfully() {
    let dst = tempfile::tempdir().expect("create tempdir");
    let result = extract_tar_bz2(&valid_bz2(), dst.path());
    assert!(result.is_ok(), "expected Ok for valid archive, got {result:?}");
    let extracted = dst.path().join("hello.txt");
    assert!(extracted.exists(), "hello.txt should be extracted at {extracted:?}");
    let content = fs::read_to_string(&extracted).expect("read extracted file");
    assert_eq!(content, "hello\n");
}

#[test]
fn test_model_archive_required_free_space() {
    let ma = ModelArchive {
        url: "https://example.com/x.tar.bz2",
        sha256: "abc",
        compressed_size: 500,
        uncompressed_size: 1500,
    };
    // headroom = 256 MiB = 268_435_456
    assert_eq!(ma.required_free_space(), 500 + 1500 + 268_435_456);
}
