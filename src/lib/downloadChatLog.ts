// lib/downloadChatLog.ts

export async function downloadChatLog(roomId: string): Promise<void> {
  const response = await fetch(`/api/download/${roomId}`, {
    headers: {
      'Authorization': `Bearer ${process.env.NEXT_PUBLIC_EXPORT_SECRET}`
    }
  });

  if (!response.ok) {
    throw new Error(`Download fallito: ${response.status}`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);

  const disposition = response.headers.get('Content-Disposition');
  const filename = disposition?.match(/filename="(.+)"/)?.[1] ?? `mkvocal_${roomId}.json`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}