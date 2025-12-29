import { NextResponse } from 'next/server';
import { loadStoredHistory } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const history = await loadStoredHistory();
    return NextResponse.json(history);
  } catch (error: any) {
    console.error('Error fetching history:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch history' },
      { status: 500 }
    );
  }
}











