import { invoke } from '@tauri-apps/api/core';
import { BookOpen, SearchX, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { BulkActionBar } from '../components/library/BulkActionBar';
import { DateSectionHeader } from '../components/library/DateSectionHeader';
import { FilterBar } from '../components/library/FilterBar';
import { MeetingCard } from '../components/library/MeetingCard';
import { MeetingRow } from '../components/library/MeetingRow';
import { formatDate, formatDuration, statusClasses } from '../components/library/meetingUtils';
import { useLibrary } from '../hooks/useLibrary';
import { bulkExportZip, exportMeeting, type ExportFormat } from '../lib/export';
import { getDb } from '../lib/db';
import type { MeetingWithPreview, SortDirection, SortField, ViewMode } from '../types';

function renderSearchSnippet(html: string): { __html: string } {
  return { __html: html };
}

export function LibraryView() {
  const navigate = useNavigate();
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const {
    meetings,
    searchResults,
    sections,
    filters,
    sortField,
    sortDirection,
    viewMode,
    showTrash,
    loading,
    error,
    selectedIds,
    isSelectionMode,
    editingId,
    editTitle,
    setEditTitle,
    setFilter,
    clearFilters,
    setSortField,
    setSortDirection,
    setViewMode,
    toggleTrash,
    toggleSelect,
    selectAll,
    deselectAll,
    startRename,
    commitRename,
    cancelRename,
    refresh,
  } = useLibrary();

  const selectionEnabled = !showTrash && searchResults === null;

  const onOpenMeeting = (meetingId: number) => {
    navigate('/meeting-complete', {
      state: {
        meetingId,
      },
    });
  };

  const onRetranscribe = async (meetingId: number) => {
    try {
      await invoke('retranscribe_meeting', { meetingId });
      setActionMessage('Re-transcription started.');
    } catch (invokeError) {
      setActionMessage(String(invokeError) || 'Re-transcription is not yet available.');
    }
  };

  const onSoftDeleteMeeting = async (meetingId: number) => {
    try {
      await invoke('soft_delete_meeting', { meetingId });
      setActionMessage('Meeting moved to trash.');
      await refresh();
      deselectAll();
    } catch {
      setActionMessage('Failed to move meeting to trash.');
    }
  };

  const onRestoreMeeting = async (meetingId: number) => {
    try {
      await invoke('restore_meeting', { meetingId });
      setActionMessage('Meeting restored.');
      await refresh();
    } catch {
      setActionMessage('Failed to restore meeting from trash.');
    }
  };

  const onDeletePermanently = async (meetingId: number) => {
    const approved = window.confirm('Delete this meeting permanently? This cannot be undone.');
    if (!approved) {
      return;
    }

    try {
      const db = await getDb();
      await db.execute('DELETE FROM meetings WHERE id = $1', [meetingId]);
      setActionMessage('Meeting permanently deleted.');
      await refresh();
    } catch {
      setActionMessage('Failed to permanently delete meeting.');
    }
  };

  const onEmptyTrash = async () => {
    const approved = window.confirm('Permanently delete all meetings in trash? This cannot be undone.');
    if (!approved) {
      return;
    }

    try {
      const db = await getDb();
      await db.execute('DELETE FROM meetings WHERE deleted_at IS NOT NULL');
      setActionMessage('Trash emptied.');
      await refresh();
    } catch {
      setActionMessage('Failed to empty trash.');
    }
  };

  const onExportMeeting = async (meetingId: number, format: ExportFormat) => {
    try {
      await exportMeeting(meetingId, format);
      setActionMessage('Export complete.');
    } catch {
      setActionMessage('Export failed.');
    }
  };

  const onBulkDelete = async () => {
    if (selectedIds.size === 0) {
      return;
    }

    const approved = window.confirm(`Move ${selectedIds.size} selected meetings to trash?`);
    if (!approved) {
      return;
    }

    try {
      await Promise.all(
        Array.from(selectedIds).map((meetingId) => invoke('soft_delete_meeting', { meetingId })),
      );
      setActionMessage(`${selectedIds.size} meetings moved to trash.`);
      deselectAll();
      await refresh();
    } catch {
      setActionMessage('Bulk delete failed.');
    }
  };

  const onBulkExport = async (format: ExportFormat) => {
    if (selectedIds.size === 0) {
      return;
    }

    try {
      await bulkExportZip(Array.from(selectedIds), format);
      setActionMessage('Bulk export complete.');
    } catch {
      setActionMessage('Bulk export failed.');
    }
  };

  const onRenameCommit = async () => {
    const success = await commitRename();
    if (success) {
      setActionMessage('Meeting title updated.');
    }
  };

  const renderMeeting = (meeting: MeetingWithPreview) => {
    const sharedProps = {
      meeting,
      onClick: onOpenMeeting,
      showTrash,
      selected: selectionEnabled ? selectedIds.has(meeting.id) : false,
      selectionMode: selectionEnabled ? isSelectionMode : false,
      onSelect: selectionEnabled ? toggleSelect : () => undefined,
      onStartRename: startRename,
      editingId,
      editTitle,
      onEditTitleChange: setEditTitle,
      onCommitRename: () => void onRenameCommit(),
      onCancelRename: cancelRename,
      onExport: (meetingId: number, format: ExportFormat) => void onExportMeeting(meetingId, format),
      onSoftDelete: (meetingId: number) => void onSoftDeleteMeeting(meetingId),
      onRestore: (meetingId: number) => void onRestoreMeeting(meetingId),
      onRetranscribe: showTrash ? undefined : (meetingId: number) => void onRetranscribe(meetingId),
    };

    if (viewMode === 'compact') {
      return <MeetingRow key={meeting.id} {...sharedProps} />;
    }

    return <MeetingCard key={meeting.id} {...sharedProps} />;
  };

  const noMeetings = !loading && meetings.length === 0 && searchResults === null;
  const noSearchResults = !loading && searchResults !== null && searchResults.length === 0;

  return (
    <section className="h-full min-h-[calc(100vh-3rem)] p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-700 dark:text-gray-100">{showTrash ? 'Trash' : 'Meeting Library'}</h1>

        {showTrash && meetings.length > 0 ? (
          <button
            type="button"
            onClick={() => void onEmptyTrash()}
            className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-red-100/70 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-200/80 dark:border-red-500/60 dark:bg-red-500/20 dark:text-red-200"
          >
            <Trash2 size={14} />
            Empty Trash
          </button>
        ) : null}
      </header>

      <FilterBar
        filters={filters}
        sortField={sortField}
        sortDirection={sortDirection}
        viewMode={viewMode}
        showTrash={showTrash}
        onFilterChange={setFilter}
        onClearFilters={clearFilters}
        onSortChange={(field: SortField, direction: SortDirection) => {
          setSortField(field);
          setSortDirection(direction);
        }}
        onViewModeChange={(mode: ViewMode) => setViewMode(mode)}
        onToggleTrash={toggleTrash}
      />

      {loading ? <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">Loading meetings…</p> : null}

      {error ? (
        <p className="mt-4 rounded-lg border border-red-300/70 bg-red-50/70 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {actionMessage ? (
        <p className="mt-4 rounded-lg border border-amber-300/70 bg-amber-50/70 px-3 py-2 text-sm text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          {actionMessage}
        </p>
      ) : null}

      {searchResults !== null ? (
        <div className="mt-6 space-y-2">
          {searchResults.map((result) => (
            <button
              key={result.id}
              type="button"
              onClick={() => onOpenMeeting(result.id)}
              className="w-full rounded-lg p-4 text-left transition hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-100">{result.title}</h2>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClasses(result.status)}`}>
                  {result.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {formatDate(result.started_at)} • {formatDuration(result.duration_seconds)}
              </p>
              <p
                className="mt-2 text-sm text-gray-600 [&_mark]:rounded [&_mark]:bg-accent-subtle/70 [&_mark]:px-0.5 [&_mark]:text-gray-900 dark:text-gray-200 dark:[&_mark]:bg-accent/30 dark:[&_mark]:text-gray-50"
                dangerouslySetInnerHTML={renderSearchSnippet(result.snippet)}
              />
            </button>
          ))}
        </div>
      ) : null}

      {searchResults === null && !showTrash ? (
        <div className="mt-6 space-y-4">
          {sections.map((section) => (
            <section key={section.label}>
              <DateSectionHeader label={section.label} count={section.items.length} />
              <div className="space-y-2">{section.items.map((meeting) => renderMeeting(meeting))}</div>
            </section>
          ))}
        </div>
      ) : null}

      {searchResults === null && showTrash ? (
        <div className="mt-6 space-y-2">
          {meetings.map((meeting) => (
            <div key={meeting.id} className="space-y-2">
              {renderMeeting(meeting)}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => void onDeletePermanently(meeting.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-red-300 bg-red-100/70 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-200/80 dark:border-red-500/60 dark:bg-red-500/20 dark:text-red-200"
                >
                  <Trash2 size={12} />
                  Delete Permanently
                </button>
              </div>
            </div>
          ))}
          {meetings.length > 0 ? (
            <p className="pt-2 text-xs text-gray-500 dark:text-gray-400">Trash is auto-purged after 30 days.</p>
          ) : null}
        </div>
      ) : null}

      {noMeetings && !showTrash ? (
        <div className="mt-12 flex flex-col items-center justify-center gap-3 text-center text-gray-400 dark:text-gray-400">
          <BookOpen size={52} strokeWidth={1.8} />
          <p className="text-lg font-medium">No meetings yet</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">Your recorded meetings will appear here</p>
        </div>
      ) : null}

      {noMeetings && showTrash ? (
        <div className="mt-12 flex flex-col items-center justify-center gap-3 text-center text-gray-400 dark:text-gray-400">
          <Trash2 size={52} strokeWidth={1.8} />
          <p className="text-lg font-medium">Trash is empty</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">Soft-deleted meetings will appear here.</p>
        </div>
      ) : null}

      {noSearchResults ? (
        <div className="mt-12 flex flex-col items-center justify-center gap-3 text-center text-gray-400 dark:text-gray-400">
          <SearchX size={52} strokeWidth={1.8} />
          <p className="text-lg font-medium">No meetings match your search</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">Try fewer keywords or clear filters.</p>
        </div>
      ) : null}

      {selectionEnabled && isSelectionMode ? (
        <BulkActionBar
          selectedCount={selectedIds.size}
          onSelectAll={selectAll}
          onDeselectAll={deselectAll}
          onBulkDelete={() => void onBulkDelete()}
          onBulkExport={(format) => void onBulkExport(format)}
        />
      ) : null}
    </section>
  );
}
