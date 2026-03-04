---
title: Meeting Library
description: Browse, search, and organize your recorded meetings
---

The meeting library stores all your recorded meetings with their transcripts and AI-generated summaries.

## Browsing meetings

Navigate to the **Library** tab to see all your meetings. Each entry shows:

- **Meeting title** — AI-generated from the content
- **Date and time** — When the meeting was recorded
- **Duration** — Length of the recording

Meetings are sorted by date with the most recent first.

## Viewing a meeting

Click on any meeting to view its full details:

- **Summary** — The AI-generated structured summary (overview, key points, decisions, action items)
- **Transcript** — The complete speech-to-text output from the recording

## Searching meetings

Use the search bar at the top of the library to find meetings by:

- **Title** — Search within AI-generated meeting titles
- **Content** — Search across transcripts and summaries

## Deleting meetings

To remove a meeting:

1. Open the meeting from the library
2. Click the **Delete** button
3. The meeting moves to the **Trash**

### Trash

Deleted meetings go to the trash first — they are not immediately removed. This gives you a chance to recover accidentally deleted meetings.

- **Restore** — Move a trashed meeting back to the library
- **Permanent delete** — Remove a meeting and its data permanently

## Re-generating summaries

If you want to try a different AI model on an existing meeting:

1. Open the meeting from the library
2. Select a different model from the dropdown
3. Click **Re-generate** to create a new summary

The previous summary is replaced with the new one.

## Data storage

All meeting data is stored locally in a SQLite database on your machine:

- **macOS:** `~/Library/Application Support/com.opennotes.app/`
- **Windows:** `%APPDATA%\com.opennotes.app\`
- **Linux:** `~/.local/share/com.opennotes.app/`

Your data never leaves your machine unless you explicitly export it.

## Related guides

- [Recording](/guides/recording/) — Record new meetings
- [Export](/guides/export/) — Export meetings from the library
- [AI Models](/guides/ai-models/) — Change the model used for summaries
