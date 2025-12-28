import { NextResponse } from 'next/server';
import { syncMints } from '@/lib/storage';

export const dynamic = 'force-dynamic'; // Force dynamic rendering
export const revalidate = 0; // Disable static generation

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const getAll = searchParams.get('getAll') === 'true' || limitParam === '0';
    
    // Si getAll=true ou limit=0, récupérer toutes les transactions
    // Sinon, utiliser la limite fournie ou 100 par défaut
    const limit = getAll ? 0 : parseInt(limitParam || '100', 10);
    
    const result = await syncMints(limit, getAll);
    return NextResponse.json({ 
      success: true, 
      added: result.added,
      total: result.total,
      message: `Added ${result.added} new transactions. Total: ${result.total}`
    });
  } catch (error: any) {
    console.error('Error syncing mints:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to sync mints' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const getAll = searchParams.get('getAll') === 'true' || limitParam === '0';
    
    // Si getAll=true ou limit=0, récupérer toutes les transactions
    // Sinon, utiliser la limite fournie ou 100 par défaut
    const limit = getAll ? 0 : parseInt(limitParam || '100', 10);
    
    const result = await syncMints(limit, getAll);
    return NextResponse.json({ 
      success: true, 
      added: result.added,
      total: result.total,
      message: `Added ${result.added} new transactions. Total: ${result.total}`
    });
  } catch (error: any) {
    console.error('Error syncing mints:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to sync mints' },
      { status: 500 }
    );
  }
}
