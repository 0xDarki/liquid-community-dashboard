import { NextResponse } from 'next/server';
import { syncMints, loadSyncState, saveSyncState } from '@/lib/storage';

export const dynamic = 'force-dynamic'; // Force dynamic rendering
export const revalidate = 0; // Disable static generation
export const maxDuration = 300; // 5 minutes (maximum pour Vercel Pro/Enterprise)

// Fonction pour vérifier si une sync peut être lancée
async function canSync(): Promise<{ allowed: boolean; reason?: string; timeRemaining?: number }> {
  const currentState = await loadSyncState();
  const now = Date.now();
  const twoMinutes = 2 * 60 * 1000; // 2 minutes en millisecondes
  const fiveMinutes = 5 * 60 * 1000; // 5 minutes en millisecondes
  
  // Si isSyncing est true, vérifier si c'est bloqué depuis trop longtemps
  if (currentState.isSyncing) {
    const syncStartTime = currentState.syncStartTime || currentState.lastSync || now;
    const timeSinceSyncStart = now - syncStartTime;
    
    // Si le sync est bloqué depuis plus de 5 minutes, le réinitialiser et permettre un nouveau sync
    if (timeSinceSyncStart > fiveMinutes) {
      console.warn('[canSync] Sync appears to be stuck for more than 5 minutes, resetting');
      await saveSyncState({
        ...currentState,
        isSyncing: false,
        syncStartTime: undefined,
      });
      // Continuer avec la vérification du lastSync
    } else {
      // Sync en cours depuis moins de 5 minutes, refuser
      return {
        allowed: false,
        reason: 'A sync is already in progress',
      };
    }
  }
  
  // Vérifier si une sync a été effectuée dans les 2 dernières minutes
  if (currentState.lastSync > 0) {
    const timeSinceLastSync = now - currentState.lastSync;
    if (timeSinceLastSync < twoMinutes) {
      const timeRemaining = Math.ceil((twoMinutes - timeSinceLastSync) / 1000); // en secondes
      return {
        allowed: false,
        reason: `Please wait ${timeRemaining} seconds before syncing again. Last sync was ${Math.floor(timeSinceLastSync / 1000)} seconds ago.`,
        timeRemaining,
      };
    }
  }
  
  return { allowed: true };
}

export async function POST(request: Request) {
  try {
    // Vérifier si une sync peut être lancée
    const canSyncResult = await canSync();
    if (!canSyncResult.allowed) {
      return NextResponse.json(
        { 
          success: false,
          error: canSyncResult.reason || 'Sync not allowed',
          timeRemaining: canSyncResult.timeRemaining,
        },
        { status: 429 } // Too Many Requests
      );
    }
    
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
      try {
        await saveSyncState({
          ...currentState,
          isSyncing: false,
          syncStartTime: undefined,
        });
      } catch (saveError) {
        console.error('Error resetting sync state:', saveError);
      }
      throw error;
    }
  } catch (error: any) {
    console.error('Error syncing mints (POST):', error);
    
    // S'assurer que isSyncing est réinitialisé même en cas d'erreur inattendue
    try {
      const currentState = await loadSyncState();
      if (currentState.isSyncing) {
        await saveSyncState({
          ...currentState,
          isSyncing: false,
          syncStartTime: undefined,
        });
      }
    } catch (resetError) {
      console.error('Error resetting sync state in catch block:', resetError);
    }
    
    return NextResponse.json(
      { error: error?.message || 'Failed to sync mints' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    // Vérifier si une sync peut être lancée
    const canSyncResult = await canSync();
    if (!canSyncResult.allowed) {
      return NextResponse.json(
        { 
          success: false,
          error: canSyncResult.reason || 'Sync not allowed',
          timeRemaining: canSyncResult.timeRemaining,
        },
        { status: 429 } // Too Many Requests
      );
    }
    
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
      try {
        await saveSyncState({
          ...currentState,
          isSyncing: false,
          syncStartTime: undefined,
        });
      } catch (saveError) {
        console.error('Error resetting sync state:', saveError);
      }
      throw error;
    }
  } catch (error: any) {
    console.error('Error syncing mints (GET):', error);
    
    // S'assurer que isSyncing est réinitialisé même en cas d'erreur inattendue
    try {
      const currentState = await loadSyncState();
      if (currentState.isSyncing) {
        await saveSyncState({
          ...currentState,
          isSyncing: false,
          syncStartTime: undefined,
        });
      }
    } catch (resetError) {
      console.error('Error resetting sync state in catch block:', resetError);
    }
    
    return NextResponse.json(
      { error: error?.message || 'Failed to sync mints' },
      { status: 500 }
    );
  }
}
