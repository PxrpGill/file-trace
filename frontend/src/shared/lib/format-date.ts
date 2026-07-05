export function formatDate(iso: string): string {
  // метки времени приходят в UTC; sqlite отдаёт их без указания зоны
  const utc = /Z$|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`
  return new Date(utc).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
