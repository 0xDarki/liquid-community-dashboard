import { NextResponse } from 'next/server';
import { syncMints, loadSyncState, saveSyncState } from '@/lib/storage';

export const dynamic = 'force-dynamic'; // Force dynamic rendering
export const revalidate = 0; // Disable static generation
export const maxDuration = 300; // 5 minutes (maximum pour Vercel Pro/Enterprise)

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const getAll = searchParams.get('getAll') === 'true' || limitParam === '0';
    
    // Si getAll=true ou limit=0, récupérer toutes les transactions
    // Sinon, utiliser la limite fournie ou 100 par défaut
    const limit = getAll ? 0 : parseInt(limitParam || '100', 10);
    
    // Charger l'état actuel
    const currentState = await loadSyncState();
    
    // Marquer comme en cours de synchronisation avec le timestamp de début
    await saveSyncState({ 
      ...currentState, 
      isSyncing: true,
      syncStartTime: Date.now(),
    });
    
    try {
      const result = await syncMints(limit, getAll);
      
      // Mettre à jour le timestamp de dernière synchronisation
      await saveSyncState({
        lastSync: Date.now(),
        isSyncing: false,
        syncStartTime: undefined,
      });
      
      return NextResponse.json({ 
        success: true, 
        added: result.added,
        total: result.total,
        message: getAll 
          ? `Added ${result.added} new transactions. Total: ${result.total}. Note: Sync processes 1500 transactions per batch (2 batches = ~3000 transactions) to stay under Vercel's 300s timeout. You can run sync again to continue fetching more transactions.`
          : `Added ${result.added} new transactions. Total: ${result.total}`
      });
    } catch (error) {
      // En cas d'erreur, réinitialiser le flag
      await saveSyncState({
        ...currentState,
        isSyncing: false,
        syncStartTime: undefined,
      });
      throw error;
    }
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
    
    // Charger l'état actuel
    const currentState = await loadSyncState();
    
    // Marquer comme en cours de synchronisation avec le timestamp de début
    await saveSyncState({ 
      ...currentState, 
      isSyncing: true,
      syncStartTime: Date.now(),
    });
    
    try {
      const result = await syncMints(limit, getAll);
      
      // Mettre à jour le timestamp de dernière synchronisation
      await saveSyncState({
        lastSync: Date.now(),
        isSyncing: false,
        syncStartTime: undefined,
      });
      
      return NextResponse.json({ 
        success: true, 
        added: result.added,
        total: result.total,
        message: getAll 
          ? `Added ${result.added} new transactions. Total: ${result.total}. Note: Sync processes 1500 transactions per batch (2 batches = ~3000 transactions) to stay under Vercel's 300s timeout. You can run sync again to continue fetching more transactions.`
          : `Added ${result.added} new transactions. Total: ${result.total}`
      });
    } catch (error) {
      // En cas d'erreur, réinitialiser le flag
      await saveSyncState({
        ...currentState,
        isSyncing: false,
        syncStartTime: undefined,
      });
      throw error;
    }
  } catch (error: any) {
    console.error('Error syncing mints:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to sync mints' },
      { status: 500 }
    );
  }
}
