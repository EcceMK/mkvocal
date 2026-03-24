import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

export async function GET(request: Request, context: any) {
  // Await the destructured params as required by Next.js App Router dynamic routes
  const params = await context.params;
  const roomId = params.roomId;
  
  const roomFile = path.join(os.tmpdir(), 'mkvocal_data', `room_${roomId}.json`);
  
  if (fs.existsSync(roomFile)) {
    const data = fs.readFileSync(roomFile, 'utf8');
    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="chat_log_${roomId}.json"`,
      },
    });
  }
  
  return new NextResponse('[]', {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="chat_log_${roomId}.json"`,
    },
  });
}
