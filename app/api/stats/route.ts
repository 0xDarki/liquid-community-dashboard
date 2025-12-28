import { NextResponse } from 'next/server';
import { getPoolStats, getTokenPrice, type TransferTransaction } from '@/lib/solana';
import { getAllStoredMints, getStoredMints } from '@/lib/storage';
import { cache } from '@/lib/cache';

export const dynamic = 'force-dynamic'; // Force dynamic rendering
export const revalidate = 0; // Disable static generation

export async function GET() {
  try {
    // Vérifier le cache (mais toujours récupérer le prix en temps réel)
    const cacheKey = 'pool-stats';
    const cached = cache.get(cacheKey) as any;
    
    // Récupérer le prix du token depuis la LP (toujours en temps réel, pas de cache)
    const tokenPrice = await getTokenPrice();
    console.log('[Stats API] Token price result:', tokenPrice);
    
    // Si on a un cache valide, l'utiliser mais toujours mettre à jour le prix
    if (cached) {
      cached.tokenPrice = tokenPrice?.price ?? null;
      cached.tokenPriceSol = tokenPrice?.solBalance ?? null;
      cached.tokenPriceToken = tokenPrice?.tokenBalance ?? null;
      cache.set(cacheKey, cached, 120000);
      console.log('[Stats API] Returning cached stats with updated price:', cached.tokenPrice);
      return NextResponse.json(cached);
    }

    // Utiliser TOUS les mints stockés pour calculer les stats correctement
    const storedMints = await getAllStoredMints(); // Récupérer tous les mints pour un calcul précis
    
    // Calculer les stats depuis les mints stockés
    const totalSolAdded = storedMints.reduce((sum, tx) => sum + tx.solAmount, 0);
    const totalTokensAdded = storedMints.reduce((sum, tx) => sum + tx.tokenAmount, 0);
    
    // Récupérer les balances actuelles
    const { getSolBalance, getTokenBalance, LP_POOL_ADDRESS, TOKEN_MINT_ADDRESS } = await import('@/lib/solana');
    const [solBalance, tokenBalance] = await Promise.all([
      getSolBalance(LP_POOL_ADDRESS),
      getTokenBalance(LP_POOL_ADDRESS, TOKEN_MINT_ADDRESS),
    ]);
    
    // Récupérer les transfers (limité pour éviter trop de requêtes)
    const { getTransferTransactions } = await import('@/lib/solana');
    let transferTxs: TransferTransaction[] = [];
    try {
      transferTxs = await getTransferTransactions(100);
    } catch (error) {
      // Ignorer les erreurs pour les transfers
    }
    
    const totalTokensTransferred = transferTxs.reduce((sum, tx) => sum + tx.tokenAmount, 0);
    
    const stats = {
      solBalance,
      tokenBalance,
      totalMints: storedMints.length,
      totalTransfers: transferTxs.length,
      totalSolAdded,
      totalTokensAdded,
      totalTokensTransferred,
      tokenPrice: tokenPrice?.price ?? null,
      tokenPriceSol: tokenPrice?.solBalance ?? null,
      tokenPriceToken: tokenPrice?.tokenBalance ?? null,
    };
    
    console.log('[Stats API] Stats with price:', { ...stats, tokenPrice: stats.tokenPrice });
    
    // Mettre en cache pendant 2 minutes pour réduire les requêtes
    cache.set(cacheKey, stats, 120000);
    
    return NextResponse.json(stats);
  } catch (error: any) {
    console.error('Error fetching stats:', error);
    let status = 500;
    if (error?.message?.includes('Rate limit') || error?.message?.includes('429')) {
      status = 429;
    } else if (error?.message?.includes('RPC service unavailable') || error?.message?.includes('503') || error?.message?.includes('Service Unavailable')) {
      status = 503;
    }
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch stats' },
      { status }
    );
  }
}

