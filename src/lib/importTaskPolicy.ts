export interface OwnedImportTaskLike {
  ownerUserId: string;
  status: string;
}

export interface ImportTaskSummary {
  totalCount: number;
  completedCount: number;
  failedCount: number;
  pendingSelectionCount: number;
}

export interface RecognitionFailureDiagnostics {
  requestId?: string;
  failedStage?: string;
  errorType?: string;
}

const SAFE_DIAGNOSTIC = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function tasksForUser<T extends OwnedImportTaskLike>(tasks: readonly T[], userId: string | null): T[] {
  if (!userId) return [];
  return tasks.filter((task) => task.ownerUserId === userId);
}

export function canOperateImportTask<T extends OwnedImportTaskLike>(
  task: T | undefined,
  userId: string | null,
): task is T {
  return Boolean(task && userId && task.ownerUserId === userId);
}

export function summarizeImportTasks(tasks: readonly OwnedImportTaskLike[]): ImportTaskSummary {
  return {
    totalCount: tasks.length,
    completedCount: tasks.filter((task) => task.status === 'done').length,
    failedCount: tasks.filter((task) => task.status === 'failed').length,
    pendingSelectionCount: tasks.filter((task) => task.status === 'needs_selection').length,
  };
}

export function formatRecognitionFailure(diagnostics: RecognitionFailureDiagnostics): string {
  const requestId = typeof diagnostics.requestId === 'string' && SAFE_DIAGNOSTIC.test(diagnostics.requestId)
    ? diagnostics.requestId
    : undefined;
  const timeout = diagnostics.failedStage === 'client_timeout'
    || (typeof diagnostics.errorType === 'string' && diagnostics.errorType.includes('Timeout'));
  const message = timeout ? '识别超时，请重试' : '识别失败，请重试';
  return requestId ? `${message} · ${requestId}` : message;
}
