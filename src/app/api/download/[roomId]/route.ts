import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

export async function GET(request: Request, context: any) {
  // Await the destructured params as required by Next.js App Router dynamic routes
  const params = await context.params;
  const roomId = params.roomId;


  const token = request.headers.get('Authorization');
  if (token !== `Bearer ${process.env.EXPORT_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const roomFile = path.join(os.tmpdir(), 'mkvocal_data', `room_${roomId}.json`);

  const now = new Date();
  const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;


  if (fs.existsSync(roomFile)) {
    const data = fs.readFileSync(roomFile, 'utf8');
    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="mkvocal_${roomId}_${timestamp}.json"`,
      },
    });
  }

  return new NextResponse('[]', {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="mkvocal_${roomId}_${timestamp}.json"`,
    },
  });
}
