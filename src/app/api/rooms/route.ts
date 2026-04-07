import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'stanze.mk');
    if (!fs.existsSync(filePath)) {
      return NextResponse.json([]);
    }
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const rooms = JSON.parse(fileContent);
    return NextResponse.json(rooms);
  } catch (error) {
    console.error('Error reading stanze.mk:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
