import { NextResponse } from 'next/server';
import { loadSyncState } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const syncState = await loadSyncState();
    return NextResponse.json(syncState);
  } catch (error: any) {
    console.error('Error fetching sync state:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch sync state' },
      { status: 500 }
    );
  }
}

