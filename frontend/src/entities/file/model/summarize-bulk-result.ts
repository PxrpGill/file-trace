import type { BulkFailure } from './types'

const REASON_LABELS: Record<BulkFailure['reason'], string> = {
  forbidden: 'нет прав',
  not_found: 'файл не найден или уже удалён',
}

export function summarizeBulkResult(
  verb: string,
  done: number,
  total: number,
  skipped: BulkFailure[],
): string {
  if (skipped.length === 0) return `${verb} ${done} из ${total}`
  const reasons = [...new Set(skipped.map((f) => REASON_LABELS[f.reason]))].join(', ')
  return `${verb} ${done} из ${total} — ${skipped.length} пропущено (${reasons})`
}
