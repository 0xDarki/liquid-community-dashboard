import { NextResponse } from 'next/server';
import { getPoolStats, getTokenPrice, type TransferTransaction } from '@/lib/solana';
import { getAllStoredMints, getStoredMints, loadStoredPrice } from '@/lib/storage';
import { cache } from '@/lib/cache';

export const dynamic = 'force-dynamic'; // Force dynamic rendering
export const revalidate = 0; // Disable static generation

export async function GET() {
  try {
    // Vérifier le cache (mais toujours récupérer le prix en temps réel)
    const cacheKey = 'pool-stats';
    const cached = cache.get(cacheKey) as any;
    
    // Récupérer le prix du token (depuis le stockage ou en temps réel)
    let tokenPrice = await loadStoredPrice();
    
    // Si le prix n'est pas disponible ou est trop ancien (> 5 minutes), le rafraîchir
    const fiveMinutes = 5 * 60 * 1000;
    if (!tokenPrice || (Date.now() - tokenPrice.timestamp) > fiveMinutes) {
      console.log('[Stats API] Price not found or too old, fetching fresh price...');
      const { getTokenPrice } = await import('@/lib/solana');
      const freshPrice = await getTokenPrice();
      if (freshPrice) {
        const { saveStoredPrice } = await import('@/lib/storage');
        tokenPrice = {
          price: freshPrice.price,
          priceInUsd: freshPrice.priceInUsd,
          solPrice: freshPrice.solPrice,
          solBalance: freshPrice.solBalance,
          tokenBalance: freshPrice.tokenBalance,
          timestamp: Date.now(),
        };
        await saveStoredPrice(tokenPrice);
        console.log('[Stats API] Fresh price saved');
      }
    } else {
      console.log('[Stats API] Using stored price');
    }
    
    console.log('[Stats API] Token price result:', tokenPrice);
    
    // Si on a un cache valide, l'utiliser mais toujours mettre à jour le prix
    if (cached) {
      cached.tokenPrice = tokenPrice?.price ?? null;
      cached.tokenPriceInUsd = tokenPrice?.priceInUsd ?? null;
      cached.solPrice = tokenPrice?.solPrice ?? null;
      cached.tokenPriceSol = tokenPrice?.solBalance ?? null;
      cached.tokenPriceToken = tokenPrice?.tokenBalance ?? null;
      
      // Recalculer la liquidité totale avec les prix mis à jour
      // Utiliser Total SOL Added et Total Tokens Added
      if (tokenPrice?.solPrice && tokenPrice?.priceInUsd && cached.totalSolAdded != null && cached.totalTokensAdded != null) {
        cached.totalLiquidity = (cached.totalSolAdded * tokenPrice.solPrice) + (cached.totalTokensAdded * tokenPrice.priceInUsd);
        console.log(`[Stats API] Recalculated total liquidity: ${cached.totalSolAdded} SOL × $${tokenPrice.solPrice} + ${cached.totalTokensAdded} tokens × $${tokenPrice.priceInUsd} = $${cached.totalLiquidity}`);
      }
      
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
    
    // Calculer la liquidité totale : (Total SOL Added × prix SOL) + (Total Tokens Added × prix token)
    let totalLiquidity: number | null = null;
    if (tokenPrice?.solPrice && tokenPrice?.priceInUsd) {
      const solLiquidity = totalSolAdded * tokenPrice.solPrice;
      const tokenLiquidity = totalTokensAdded * tokenPrice.priceInUsd;
      totalLiquidity = solLiquidity + tokenLiquidity;
      console.log(`[Stats API] Calculated total liquidity: ${totalSolAdded} SOL × $${tokenPrice.solPrice} + ${totalTokensAdded} tokens × $${tokenPrice.priceInUsd} = $${totalLiquidity}`);
    } else {
      console.log(`[Stats API] Cannot calculate total liquidity: solPrice=${tokenPrice?.solPrice}, priceInUsd=${tokenPrice?.priceInUsd}`);
    }
    
    const stats = {
      solBalance,
      tokenBalance,
      totalMints: storedMints.length,
      totalTransfers: transferTxs.length,
      totalSolAdded,
      totalTokensAdded,
      totalTokensTransferred,
      tokenPrice: tokenPrice?.price ?? null,
      tokenPriceInUsd: tokenPrice?.priceInUsd ?? null,
      solPrice: tokenPrice?.solPrice ?? null,
      tokenPriceSol: tokenPrice?.solBalance ?? null,
      tokenPriceToken: tokenPrice?.tokenBalance ?? null,
      totalLiquidity,
    };
    
    console.log('[Stats API] Stats with price:', { ...stats, tokenPrice: stats.tokenPrice });
    
    // Ajouter un point de données historiques (vérifie automatiquement si 12h se sont écoulées)
    try {
      const { addHistoricalDataPoint } = await import('@/lib/storage');
      await addHistoricalDataPoint({
        totalSolAdded,
        totalTokensAdded,
        totalMints: storedMints.length,
        tokenPrice: tokenPrice?.price ?? null,
        tokenPriceInUsd: tokenPrice?.priceInUsd ?? null,
        solPrice: tokenPrice?.solPrice ?? null,
        totalLiquidity,
      });
    } catch (historyError) {
      console.error('[Stats API] Error adding historical data point:', historyError);
      // Ne pas faire échouer la requête si l'ajout historique échoue
    }
    
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

