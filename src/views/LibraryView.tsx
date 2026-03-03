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
        <h1 className="text-xl font-semibold tracking-tight text-gray-800 dark:text-gray-50">{showTrash ? 'Trash' : 'Meeting Library'}</h1>

        {showTrash && meetings.length > 0 ? (
          <button
            type="button"
            onClick={() => void onEmptyTrash()}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-600 transition-all duration-150 hover:bg-red-500/20 dark:text-red-300 dark:hover:bg-red-500/20"
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

      {loading ? <p className="mt-6 text-sm text-gray-400 dark:text-gray-500">Loading meetings...</p> : null}

      {error ? (
        <p className="mt-4 rounded-xl bg-red-500/8 px-4 py-2.5 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {actionMessage ? (
        <p className="mt-4 rounded-xl bg-amber-500/8 px-4 py-2.5 text-sm text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
          {actionMessage}
        </p>
      ) : null}

      {searchResults !== null ? (
        <div className="mt-6 space-y-1">
          {searchResults.map((result) => (
            <button
              key={result.id}
              type="button"
              onClick={() => onOpenMeeting(result.id)}
              className="w-full cursor-pointer rounded-xl p-4 text-left transition-all duration-150 hover:bg-white/60 dark:hover:bg-gray-800/40"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-100">{result.title}</h2>
                <span className={`rounded-lg px-2 py-0.5 text-[10px] font-medium ${statusClasses(result.status)}`}>
                  {result.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                {formatDate(result.started_at)} &middot; {formatDuration(result.duration_seconds)}
              </p>
              <p
                className="mt-2 text-sm leading-relaxed text-gray-600 [&_mark]:rounded-md [&_mark]:bg-accent/10 [&_mark]:px-0.5 [&_mark]:text-accent dark:text-gray-300 dark:[&_mark]:bg-accent/20 dark:[&_mark]:text-accent-muted"
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
        <div className="mt-6 space-y-1">
          {meetings.map((meeting) => (
            <div key={meeting.id} className="space-y-1">
              {renderMeeting(meeting)}
              <div className="flex justify-end pr-4">
                <button
                  type="button"
                  onClick={() => void onDeletePermanently(meeting.id)}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-500 transition-all duration-150 hover:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/10"
                >
                  <Trash2 size={12} />
                  Delete Permanently
                </button>
              </div>
            </div>
          ))}
          {meetings.length > 0 ? (
            <p className="pt-3 text-xs text-gray-400 dark:text-gray-500">Trash is auto-purged after 30 days.</p>
          ) : null}
        </div>
      ) : null}

      {noMeetings && !showTrash ? (
        <div className="mt-16 flex flex-col items-center justify-center gap-3 text-center">
          <div className="rounded-2xl bg-gray-100/50 p-4 dark:bg-gray-800/30">
            <BookOpen size={40} strokeWidth={1.5} className="text-gray-300 dark:text-gray-600" />
          </div>
          <p className="text-base font-medium text-gray-500 dark:text-gray-400">No meetings yet</p>
          <p className="text-sm text-gray-400 dark:text-gray-500">Your recorded meetings will appear here</p>
        </div>
      ) : null}

      {noMeetings && showTrash ? (
        <div className="mt-16 flex flex-col items-center justify-center gap-3 text-center">
          <div className="rounded-2xl bg-gray-100/50 p-4 dark:bg-gray-800/30">
            <Trash2 size={40} strokeWidth={1.5} className="text-gray-300 dark:text-gray-600" />
          </div>
          <p className="text-base font-medium text-gray-500 dark:text-gray-400">Trash is empty</p>
          <p className="text-sm text-gray-400 dark:text-gray-500">Soft-deleted meetings will appear here.</p>
        </div>
      ) : null}

      {noSearchResults ? (
        <div className="mt-16 flex flex-col items-center justify-center gap-3 text-center">
          <div className="rounded-2xl bg-gray-100/50 p-4 dark:bg-gray-800/30">
            <SearchX size={40} strokeWidth={1.5} className="text-gray-300 dark:text-gray-600" />
          </div>
          <p className="text-base font-medium text-gray-500 dark:text-gray-400">No meetings match your search</p>
          <p className="text-sm text-gray-400 dark:text-gray-500">Try fewer keywords or clear filters.</p>
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
