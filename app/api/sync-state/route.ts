import { NextResponse } from 'next/server';
import { loadSyncState, saveSyncState } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    let syncState = await loadSyncState();
    
    // Si isSyncing est true mais qu'il n'y a pas de syncStartTime, l'ajouter
    // (pour les anciens états qui n'avaient pas ce champ)
    if (syncState.isSyncing && !syncState.syncStartTime) {
      syncState = {
        ...syncState,
        syncStartTime: syncState.lastSync || Date.now(),
      };
      await saveSyncState(syncState);
    }
    
    // Retourner l'état sans le syncStartTime (pas nécessaire côté client)
    const { syncStartTime, ...stateToReturn } = syncState;
    // S'assurer que lastSync est toujours présent (même si 0)
    return NextResponse.json({
      lastSync: stateToReturn.lastSync || 0,
      isSyncing: stateToReturn.isSyncing || false,
    });
  } catch (error: any) {
    console.error('Error fetching sync state:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch sync state' },
      { status: 500 }
    );
  }
}

