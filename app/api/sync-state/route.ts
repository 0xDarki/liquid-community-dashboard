import { NextResponse } from 'next/server';
import { loadSyncState, saveSyncState } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    let syncState = await loadSyncState();
    const now = Date.now();
    const twoMinutes = 2 * 60 * 1000;
    
    // Si isSyncing est true mais qu'il n'y a pas de syncStartTime, l'ajouter
    // (pour les anciens états qui n'avaient pas ce champ)
    if (syncState.isSyncing && !syncState.syncStartTime) {
      syncState = {
        ...syncState,
        syncStartTime: syncState.lastSync || Date.now(),
      };
      await saveSyncState(syncState);
    }
    
    // Calculer le temps depuis la dernière sync
    const timeSinceLastSync = syncState.lastSync > 0 ? now - syncState.lastSync : null;
    const canSyncNow = !syncState.isSyncing && (timeSinceLastSync === null || timeSinceLastSync >= twoMinutes);
    const timeRemaining = timeSinceLastSync && timeSinceLastSync < twoMinutes 
      ? Math.ceil((twoMinutes - timeSinceLastSync) / 1000)
      : 0;
    
    // Retourner l'état sans le syncStartTime (pas nécessaire côté client)
    const { syncStartTime, ...stateToReturn } = syncState;
    // S'assurer que lastSync est toujours présent (même si 0)
    return NextResponse.json({
      lastSync: stateToReturn.lastSync || 0,
      isSyncing: stateToReturn.isSyncing || false,
      lastSyncDate: stateToReturn.lastSync > 0 ? new Date(stateToReturn.lastSync).toISOString() : null,
      timeSinceLastSync: timeSinceLastSync ? Math.floor(timeSinceLastSync / 1000) : null,
      canSyncNow,
      timeRemaining,
    });
  } catch (error: any) {
    console.error('Error fetching sync state:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch sync state' },
      { status: 500 }
    );
  }
}

