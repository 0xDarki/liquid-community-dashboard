import { NextResponse } from 'next/server';
import type { MintTransaction } from '@/lib/solana';
import { head } from '@vercel/blob';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Clé pour le fichier mints.json dans Vercel Blob Storage
const BLOB_MINTS_KEY = 'mints.json';

export async function GET() {
  try {
    // Lire le fichier mints.json depuis Vercel Blob Storage
    let allMints: MintTransaction[] = [];
    try {
      const blobInfo = await head(BLOB_MINTS_KEY).catch(() => null);
      if (!blobInfo) {
        return NextResponse.json(
          { error: 'File mints.json not found in Vercel Blob Storage' },
          { status: 404 }
        );
      }
      
      const response = await fetch(blobInfo.url);
      if (!response.ok) {
        return NextResponse.json(
          { error: 'Failed to fetch mints.json from Blob Storage' },
          { status: 500 }
        );
      }
      
      const text = await response.text();
      allMints = JSON.parse(text);
      console.log(`[Average Stats] Loaded ${allMints.length} transactions from mints.json`);
    } catch (error: any) {
      console.error('[Average Stats] Error loading mints.json:', error);
      return NextResponse.json(
        { error: error?.message || 'Failed to load mints.json' },
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


