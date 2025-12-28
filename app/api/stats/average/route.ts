import { NextResponse } from 'next/server';
import type { MintTransaction } from '@/lib/solana';
import { loadStoredMints } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    // Lire les mints depuis le stockage (Supabase ou filesystem)
    let allMints: MintTransaction[] = [];
    try {
      allMints = await loadStoredMints();
      console.log(`[Average Stats] Loaded ${allMints.length} transactions from storage`);
    } catch (error: any) {
      console.error('[Average Stats] Error loading mints:', error);
      return NextResponse.json(
        { error: error?.message || 'Failed to load mints' },
        { status: 500 }
      );
    }
    
    if (allMints.length === 0) {
      return NextResponse.json(
        { error: 'No transactions found in mints.json' },
        { status: 400 }
      );
    }
    
    // Obtenir le timestamp actuel (en secondes)
    const now = Math.floor(Date.now() / 1000);
    
    // Calculer le timestamp d'il y a 24 heures (en secondes)
    const twentyFourHoursAgo = now - (24 * 60 * 60);
    
    // Filtrer les transactions des dernières 24h
    const recentMints = allMints.filter(m => m.timestamp >= twentyFourHoursAgo);
    
    console.log(`[Average Stats] Found ${recentMints.length} transactions in the last 24 hours`);
    
    if (recentMints.length === 0) {
      return NextResponse.json({
        success: true,
        period: '24h',
        totalTransactions: 0,
        totalSolAdded: 0,
        totalTokensAdded: 0,
        averageSolPerHour: 0,
        averageTokensPerHour: 0,
        hours: 24,
        message: 'No transactions in the last 24 hours',
      });
    }
    
    // Calculer les totaux
    const totalSolAdded = recentMints.reduce((sum, m) => sum + m.solAmount, 0);
    const totalTokensAdded = recentMints.reduce((sum, m) => sum + m.tokenAmount, 0);
    
    // Calculer le nombre d'heures écoulées depuis la première transaction
    const firstTransactionTime = Math.min(...recentMints.map(m => m.timestamp));
    const lastTransactionTime = Math.max(...recentMints.map(m => m.timestamp));
    const hoursElapsed = Math.max(1, (lastTransactionTime - firstTransactionTime) / 3600); // Au moins 1 heure
    
    // Calculer les moyennes par heure
    const averageSolPerHour = totalSolAdded / hoursElapsed;
    const averageTokensPerHour = totalTokensAdded / hoursElapsed;
    
    // Calculer aussi la moyenne sur les 24h complètes (même si pas de transactions sur toute la période)
    const averageSolPerHour24h = totalSolAdded / 24;
    const averageTokensPerHour24h = totalTokensAdded / 24;
    
    console.log(`[Average Stats] Total SOL: ${totalSolAdded}, Total Tokens: ${totalTokensAdded}`);
    console.log(`[Average Stats] Hours elapsed: ${hoursElapsed.toFixed(2)}`);
    console.log(`[Average Stats] Average SOL/hour: ${averageSolPerHour.toFixed(4)}, Average Tokens/hour: ${averageTokensPerHour.toFixed(2)}`);
    
    return NextResponse.json({
      success: true,
      period: '24h',
      totalTransactions: recentMints.length,
      totalSolAdded,
      totalTokensAdded,
      averageSolPerHour,
      averageTokensPerHour,
      averageSolPerHour24h,
      averageTokensPerHour24h,
      hoursElapsed: hoursElapsed,
      firstTransactionTime,
      lastTransactionTime,
      message: `Average calculated from ${recentMints.length} transactions in the last 24 hours`,
    });
  } catch (error: any) {
    console.error('Error calculating average stats:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to calculate average stats' },
      { status: 500 }
    );
  }
}





