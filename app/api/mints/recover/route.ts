import { NextResponse } from 'next/server';
import { syncMints, saveSyncState, loadSyncState } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 300; // 5 minutes

// Route pour récupérer toutes les transactions depuis la blockchain
// Cette route ignore les restrictions de temps et récupère tout
export async function POST() {
  try {
    console.log('[Recover] Starting full recovery of all transactions from blockchain...');
    
    // Vérifier l'état actuel
    let currentState = await loadSyncState();
    
    // Si une sync est en cours mais bloquée depuis plus de 3 minutes, la réinitialiser
    if (currentState.isSyncing) {
      const now = Date.now();
      const syncStartTime = currentState.syncStartTime || currentState.lastSync || now;
      const threeMinutes = 3 * 60 * 1000;
      
      if (now - syncStartTime > threeMinutes) {
        console.warn('[Recover] Previous sync appears stuck, resetting before recovery');
        currentState = {
          ...currentState,
          isSyncing: false,
          syncStartTime: undefined,
        };
        await saveSyncState(currentState);
      }
    }
    
    // Marquer comme en cours de synchronisation (ignore les restrictions de temps)
    await saveSyncState({
      ...currentState,
      isSyncing: true,
      syncStartTime: Date.now(),
    });
    
    try {
      // Récupérer toutes les transactions (getAll=true, limit=0)
      // Cela va récupérer jusqu'à ~3000 transactions par batch
      // L'utilisateur peut appeler cette route plusieurs fois pour récupérer progressivement
      const result = await syncMints(0, true);
      
      // Mettre à jour le timestamp de dernière synchronisation
      await saveSyncState({
        lastSync: Date.now(),
        isSyncing: false,
        syncStartTime: undefined,
      });
      
      console.log(`[Recover] Recovery completed: ${result.added} new transactions added. Total: ${result.total}`);
      
      return NextResponse.json({
        success: true,
        added: result.added,
        total: result.total,
        message: result.added > 0
          ? `Recovery successful: ${result.added} transactions recovered. Total: ${result.total}. Note: This process retrieves up to ~3000 transactions per call. You can call this endpoint again to continue recovering more transactions.`
          : `No new transactions found. Total stored: ${result.total}. If you expected more transactions, you may need to call this endpoint multiple times to recover all historical data.`,
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
    console.error('[Recover] Error recovering transactions:', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Failed to recover transactions',
      },
      { status: 500 }
    );
  }
}

// Route GET pour récupérer toutes les transactions (même comportement que POST)
export async function GET() {
  return POST();
}

