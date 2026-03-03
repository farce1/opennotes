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

function SkeletonLine({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-gray-200/70 dark:bg-gray-700/60 ${className}`} />;
}

function LibraryLoadingState({ viewMode, showTrash }: { viewMode: ViewMode; showTrash: boolean }) {
  const itemCount = showTrash ? 3 : viewMode === 'compact' ? 7 : 4;

  if (!showTrash && viewMode === 'compact') {
    return (
      <div className="mt-4 space-y-2">
        {Array.from({ length: itemCount }).map((_, index) => (
          <div
            key={`row-skeleton-${index}`}
            className="rounded-lg border border-gray-200/70 bg-white/60 px-3 py-2.5 shadow-sm dark:border-gray-700/70 dark:bg-gray-900/50"
          >
            <div className="flex items-center gap-3">
              <SkeletonLine className="h-4 w-4 rounded-sm" />
              <SkeletonLine className="h-4 w-1/3" />
              <SkeletonLine className="ml-auto h-4 w-20" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {Array.from({ length: itemCount }).map((_, index) => (
        <div
          key={`card-skeleton-${index}`}
          className="rounded-xl border border-gray-200/70 bg-white/60 p-4 shadow-sm dark:border-gray-700/70 dark:bg-gray-900/50"
        >
          <div className="flex items-center justify-between gap-3">
            <SkeletonLine className="h-5 w-44" />
            <SkeletonLine className="h-5 w-20" />
          </div>
          <SkeletonLine className="mt-2 h-3 w-32" />
          <SkeletonLine className="mt-4 h-3 w-full" />
          <SkeletonLine className="mt-2 h-3 w-10/12" />
          <div className="mt-4 flex justify-end gap-2">
            <SkeletonLine className="h-7 w-20" />
            <SkeletonLine className="h-7 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

type LibraryViewProps = {
  scope?: 'library' | 'trash';
};

export function LibraryView({ scope = 'library' }: LibraryViewProps) {
  const navigate = useNavigate();
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const isTrashScope = scope === 'trash';

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
    toggleSelect,
    selectAll,
    deselectAll,
    startRename,
    commitRename,
    cancelRename,
    refresh,
  } = useLibrary({ initialShowTrash: isTrashScope, lockScope: true });

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

    if (showTrash) {
      return <MeetingCard key={meeting.id} {...sharedProps} />;
    }

    if (viewMode === 'compact') {
      return <MeetingRow key={meeting.id} {...sharedProps} />;
    }

    return <MeetingCard key={meeting.id} {...sharedProps} />;
  };

  const noMeetings = !loading && meetings.length === 0 && searchResults === null;
  const noSearchResults = !loading && searchResults !== null && searchResults.length === 0;
  const hasVisibleContent = searchResults !== null ? searchResults.length > 0 : meetings.length > 0;
  const showLoadingSkeleton = loading && !error && !hasVisibleContent;
  const showRefreshingHint = loading && hasVisibleContent;

  return (
    <section className="relative h-full min-h-[calc(100vh-3rem)] overflow-hidden rounded-[1.75rem] border border-gray-200/70 bg-gradient-to-br from-white/80 via-white/60 to-gray-100/70 p-3 shadow-[0_28px_80px_-50px_rgba(15,23,42,0.45)] dark:border-gray-800/70 dark:from-gray-900/90 dark:via-gray-900/70 dark:to-gray-950/80">
      <div className="pointer-events-none absolute -left-20 -top-16 h-56 w-56 rounded-full bg-accent/10 blur-3xl dark:bg-accent/20" />
      <div className="pointer-events-none absolute -bottom-24 right-12 h-52 w-52 rounded-full bg-gray-400/10 blur-3xl dark:bg-gray-700/25" />

      <div className="relative z-10 flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1">
          <div className="flex h-full min-h-0 flex-col rounded-2xl border border-gray-200/80 bg-white/75 p-3 shadow-[0_12px_32px_-24px_rgba(15,23,42,0.55)] backdrop-blur-sm dark:border-gray-700/80 dark:bg-gray-900/55 sm:p-4 lg:p-5">
            {!showTrash ? (
              <div className="space-y-3 border-b border-gray-200/60 pb-4 dark:border-gray-700/60">
                <FilterBar
                  filters={filters}
                  sortField={sortField}
                  sortDirection={sortDirection}
                  viewMode={viewMode}
                  showTrash={showTrash}
                  showScopeToggle={false}
                  showViewModeToggle
                  onFilterChange={setFilter}
                  onClearFilters={clearFilters}
                  onSortChange={(field: SortField, direction: SortDirection) => {
                    setSortField(field);
                    setSortDirection(direction);
                  }}
                  onViewModeChange={(mode: ViewMode) => setViewMode(mode)}
                  onToggleTrash={() => undefined}
                />
              </div>
            ) : (
              showLoadingSkeleton ? (
                <div className="rounded-xl border border-gray-200/70 bg-white/70 px-4 py-3 dark:border-gray-700/70 dark:bg-gray-900/55">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-2">
                      <SkeletonLine className="h-4 w-32" />
                      <SkeletonLine className="h-3 w-52" />
                    </div>
                    <SkeletonLine className="h-8 w-28 rounded-xl" />
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200/70 bg-white/70 px-4 py-3 dark:border-gray-700/70 dark:bg-gray-900/55">
                  <div>
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-100">Deleted Meetings</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {meetings.length} item{meetings.length === 1 ? '' : 's'} in trash. Auto-purged after 30 days.
                    </p>
                  </div>

                  {meetings.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => void onEmptyTrash()}
                      className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-600 transition-all duration-150 hover:bg-red-500/20 dark:text-red-300 dark:hover:bg-red-500/20"
                    >
                      <Trash2 size={14} />
                      Empty Trash
                    </button>
                  ) : null}
                </div>
              )
            )}

            <div className={`${showTrash ? 'mt-3' : 'mt-4'} min-h-0 flex-1 overflow-y-auto pr-1`}>
              {showLoadingSkeleton ? (
                <LibraryLoadingState viewMode={viewMode} showTrash={showTrash} />
              ) : (
                <>
                  {showRefreshingHint ? (
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Refreshing meetings…</p>
                  ) : null}

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
                    <div className="space-y-3">
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
                </>
              )}
            </div>
          </div>
        </div>
      </div>

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
