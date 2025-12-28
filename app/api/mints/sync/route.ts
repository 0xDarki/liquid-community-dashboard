import { NextResponse } from 'next/server';
import { syncMints, loadSyncState, saveSyncState } from '@/lib/storage';
import { isAuthorizedDomain } from '@/lib/auth';

export const dynamic = 'force-dynamic'; // Force dynamic rendering
export const revalidate = 0; // Disable static generation
export const maxDuration = 300; // 5 minutes (maximum pour Vercel Pro/Enterprise)

// Fonction pour vérifier si une sync peut être lancée
async function canSync(): Promise<{ allowed: boolean; reason?: string; timeRemaining?: number }> {
  const currentState = await loadSyncState();
  const now = Date.now();
  const twoMinutes = 2 * 60 * 1000; // 2 minutes en millisecondes
  const threeMinutes = 3 * 60 * 1000; // 3 minutes en millisecondes (seuil pour réinitialiser un sync bloqué)
  
  console.log('[canSync] Current state:', {
    isSyncing: currentState.isSyncing,
    lastSync: currentState.lastSync,
    lastSyncDate: currentState.lastSync > 0 ? new Date(currentState.lastSync).toISOString() : 'never',
    syncStartTime: currentState.syncStartTime,
    now: new Date(now).toISOString(),
  });
  
  // Si isSyncing est true, vérifier si c'est bloqué depuis trop longtemps
  if (currentState.isSyncing) {
    const syncStartTime = currentState.syncStartTime || currentState.lastSync || now;
    const timeSinceSyncStart = now - syncStartTime;
    
    console.log('[canSync] Sync in progress, time since start:', Math.floor(timeSinceSyncStart / 1000), 'seconds');
    
    // Si le sync est bloqué depuis plus de 3 minutes OU si lastSync est 0 et que ça fait plus de 2 minutes,
    // le réinitialiser et permettre un nouveau sync
    // (Si lastSync est 0, c'est qu'une sync précédente n'a jamais été complétée)
    const isStuck = timeSinceSyncStart > threeMinutes || 
                     (currentState.lastSync === 0 && timeSinceSyncStart > twoMinutes);
    
    if (isStuck) {
      console.warn('[canSync] Sync appears to be stuck, resetting. Time since start:', Math.floor(timeSinceSyncStart / 1000), 'seconds, lastSync:', currentState.lastSync);
      await saveSyncState({
        ...currentState,
        isSyncing: false,
        syncStartTime: undefined,
      });
      // Continuer avec la vérification du lastSync
    } else {
      // Sync en cours depuis moins de 3 minutes, refuser
      console.log('[canSync] Sync in progress, refusing new sync');
      return {
        allowed: false,
        reason: 'A sync is already in progress',
      };
    }
  }
  
  // Vérifier si une sync a été effectuée dans les 2 dernières minutes
  if (currentState.lastSync > 0) {
    const timeSinceLastSync = now - currentState.lastSync;
    console.log('[canSync] Time since last sync:', Math.floor(timeSinceLastSync / 1000), 'seconds');
    
    if (timeSinceLastSync < twoMinutes) {
      const timeRemaining = Math.ceil((twoMinutes - timeSinceLastSync) / 1000); // en secondes
      console.log('[canSync] Refusing sync, time remaining:', timeRemaining, 'seconds');
      return {
        allowed: false,
        reason: `Please wait ${timeRemaining} seconds before syncing again. Last sync was ${Math.floor(timeSinceLastSync / 1000)} seconds ago.`,
        timeRemaining,
      };
    }
  }
  
  console.log('[canSync] Sync allowed');
  return { allowed: true };
}

export async function POST(request: Request) {
  try {
    // Vérifier si la requête provient d'un domaine autorisé
    if (!isAuthorizedDomain(request)) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Unauthorized: This action is only available on the private domain',
        },
        { status: 403 } // Forbidden
      );
    }
    
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
    // Vérifier si la requête provient d'un domaine autorisé
    if (!isAuthorizedDomain(request)) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Unauthorized: This action is only available on the private domain',
        },
        { status: 403 } // Forbidden
      );
    }
    
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
