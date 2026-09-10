const dateTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Jakarta',
});
const timeFormatter = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Jakarta',
});

export function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value));
}

export function formatTime(value: string) {
  return timeFormatter.format(new Date(value));
}
