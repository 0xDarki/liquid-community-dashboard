import { NextResponse } from 'next/server';
import { getStoredMints, getAllStoredMints, syncMints, shouldSync, autoSync } from '@/lib/storage';
import { cache } from '@/lib/cache';

export const dynamic = 'force-dynamic'; // Force dynamic rendering
export const revalidate = 0; // Disable static generation

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const sync = searchParams.get('sync') === 'true';
    const forceSync = searchParams.get('forceSync') === 'true';
    
    // Synchronisation automatique : vérifier si une synchronisation est nécessaire
    // (toutes les 2 minutes) et la faire en arrière-plan si nécessaire
    if (!forceSync && !sync) {
      const needsSync = await shouldSync();
      if (needsSync) {
        // Lancer la synchronisation en arrière-plan (ne pas attendre)
        autoSync().catch(error => {
          console.error('Background sync error:', error);
        });
      }
    }
    
    // Si sync=true ou forceSync=true, synchroniser immédiatement
    if (sync || forceSync) {
      try {
        await syncMints(20, false); // Synchroniser avec seulement 20 nouvelles transactions
      } catch (error) {
        // En cas d'erreur de sync, continuer avec les données stockées
        console.warn('Sync failed, using stored data:', error);
      }
    }
    
    // Si limit=0 ou all, récupérer toutes les transactions stockées
    if (limitParam === '0' || limitParam === 'all') {
      const allMints = await getAllStoredMints();
      return NextResponse.json(allMints);
    }
    
    const limit = parseInt(limitParam || '50', 10);
    
    // Vérifier le cache
    const cacheKey = `mint-transactions-${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }
    
    // Récupérer depuis le stockage
    const transactions = await getStoredMints(limit);
    
    // Mettre en cache pendant 2 minutes pour réduire les requêtes
    cache.set(cacheKey, transactions, 120000);
    
    return NextResponse.json(transactions);
  } catch (error: any) {
    console.error('Error fetching mint transactions:', error);
    let status = 500;
    if (error?.message?.includes('Rate limit') || error?.message?.includes('429')) {
      status = 429;
    } else if (error?.message?.includes('RPC service unavailable') || error?.message?.includes('503') || error?.message?.includes('Service Unavailable')) {
      status = 503;
    }
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch mint transactions' },
      { status }
    );
  }
}

