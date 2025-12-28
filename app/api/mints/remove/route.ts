import { NextResponse } from 'next/server';
import { removeMintBySignature } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { signature } = body;
    
    if (!signature || typeof signature !== 'string') {
      return NextResponse.json(
        { error: 'Signature is required' },
        { status: 400 }
      );
    }
    
    const result = await removeMintBySignature(signature);
    
    return NextResponse.json({
      success: result.success,
      removed: result.removed,
      message: result.removed 
        ? `Transaction ${signature} has been removed successfully`
        : `Transaction ${signature} was not found in storage`
    });
  } catch (error: any) {
    console.error('Error removing transaction:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to remove transaction' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const signature = searchParams.get('signature');
    
    if (!signature) {
      return NextResponse.json(
        { error: 'Signature parameter is required' },
        { status: 400 }
      );
    }
    
    const result = await removeMintBySignature(signature);
    
    return NextResponse.json({
      success: result.success,
      removed: result.removed,
      message: result.removed 
        ? `Transaction ${signature} has been removed successfully`
        : `Transaction ${signature} was not found in storage`
    });
  } catch (error: any) {
    console.error('Error removing transaction:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to remove transaction' },
      { status: 500 }
    );
  }
}







