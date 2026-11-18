export type FilePreviewKind = 'image' | 'pdf' | 'text' | null;

export function getFilePreviewKind(
  mimeType?: string,
  fileName?: string,
  dataUrl?: string
): FilePreviewKind {
  const mime = (mimeType || '').toLowerCase();
  const cleanName = (fileName || '').split(/[?#]/)[0];
  const ext = cleanName.includes('.') ? cleanName.split('.').pop()?.toLowerCase() || '' : '';
  const dataPrefix = (dataUrl || '').slice(0, 60).toLowerCase();

  if (
    mime.startsWith('image/') ||
    dataPrefix.startsWith('data:image/') ||
    ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'].includes(ext)
  ) {
    return 'image';
  }
  if (mime.includes('pdf') || dataPrefix.startsWith('data:application/pdf') || ext === 'pdf') {
    return 'pdf';
  }
  if (
    mime.startsWith('text/') ||
    mime.includes('json') ||
    mime.includes('csv') ||
    mime.includes('xml') ||
    dataPrefix.startsWith('data:text/') ||
    ['txt', 'md', 'csv', 'json', 'log', 'py', 'js', 'ts', 'html', 'css'].includes(ext)
  ) {
    return 'text';
  }
  return null;
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return await response.blob();
}

export async function downloadDataUrl(dataUrl: string, fileName: string): Promise<void> {
  if (!dataUrl) {
    throw new Error('File data is unavailable.');
  }
  try {
    const blob = await dataUrlToBlob(dataUrl);
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName || 'gsu-connect-file';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 15_000);
  } catch {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = fileName || 'gsu-connect-file';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export function decodeDataUrlText(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex === -1) return '';
  const header = dataUrl.slice(0, commaIndex).toLowerCase();
  const body = dataUrl.slice(commaIndex + 1);
  if (header.includes(';base64')) {
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
  return decodeURIComponent(body);
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function formatIcsDateTime(dateStr: string, timeStr: string): string | null {
  const dateParts = dateStr.split('-').map(Number);
  if (dateParts.length !== 3 || dateParts.some(Number.isNaN)) return null;
  const timeMatch = timeStr.trim().match(/^(\d{1,2}):(\d{2})/);
  const hh = timeMatch ? Math.min(23, Math.max(0, Number(timeMatch[1]))) : 9;
  const mm = timeMatch ? Math.min(59, Math.max(0, Number(timeMatch[2]))) : 0;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dateParts[0]}${pad(dateParts[1])}${pad(dateParts[2])}T${pad(hh)}${pad(mm)}00`;
}

export function downloadCalendarEventIcs(ev: {
  id: string;
  title: string;
  description?: string;
  date: string;
  startTime: string;
  endTime?: string;
  venue?: string;
  courseCode?: string;
  department?: string;
}): void {
  const dtStart = formatIcsDateTime(ev.date, ev.startTime);
  if (!dtStart) return;

  let dtEnd = ev.endTime ? formatIcsDateTime(ev.date, ev.endTime) : null;
  if (!dtEnd) {
    const startHour = Number(dtStart.slice(9, 11));
    const endHour = Math.min(23, startHour + 1);
    dtEnd = `${dtStart.slice(0, 9)}${String(endHour).padStart(2, '0')}${dtStart.slice(11)}`;
  }

  const summary = ev.courseCode ? `${ev.courseCode} — ${ev.title}` : ev.title;
  const descParts = [ev.description, ev.department ? `Department: ${ev.department}` : '']
    .filter(Boolean)
    .join('\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GSU Connect//Campus Calendar//EN',
    'BEGIN:VEVENT',
    `UID:${ev.id}@gsuconnect.app`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    ev.venue ? `LOCATION:${escapeIcsText(ev.venue)}` : '',
    descParts ? `DESCRIPTION:${escapeIcsText(descParts)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeSlug = summary.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  link.href = objectUrl;
  link.download = `${safeSlug || 'gsu-event'}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 15_000);
}
