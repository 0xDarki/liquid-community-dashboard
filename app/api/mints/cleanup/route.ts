import { NextResponse } from 'next/server';
import { detectAndRemoveFailedTransactions } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    console.log('[Cleanup API] Starting failed transactions detection...');
    
    const result = await detectAndRemoveFailedTransactions();
    
    return NextResponse.json({
      success: result.success,
      checked: result.checked,
      failed: result.failed,
      removed: result.removed,
      failedSignatures: result.failedSignatures,
      message: result.success
        ? `Checked ${result.checked} transactions. Found ${result.failed} failed transactions and removed ${result.removed}.`
        : 'Failed to check transactions'
    });
  } catch (error: any) {
    console.error('Error cleaning up failed transactions:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to cleanup failed transactions' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}

