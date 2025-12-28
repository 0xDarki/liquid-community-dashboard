import { NextResponse } from 'next/server';
import type { MintTransaction } from '@/lib/solana';
import { loadStoredHistory, saveStoredHistory } from '@/lib/storage';
import type { HistoricalDataPoint } from '@/lib/storage';
import { head } from '@vercel/blob';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Clé pour le fichier mints.json dans Vercel Blob Storage
const BLOB_IMPORT_MINTS_KEY = 'mints.json';

// Durée d'une période en millisecondes (12 heures)
const PERIOD_DURATION = 12 * 60 * 60 * 1000;

export async function POST() {
  try {
    // Lire le fichier mints.json depuis Vercel Blob Storage
    let allMints: MintTransaction[] = [];
    try {
      const blobInfo = await head(BLOB_IMPORT_MINTS_KEY).catch(() => null);
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
      console.log(`[Generate History] Loaded ${allMints.length} transactions from mints.json`);
    } catch (error: any) {
      console.error('[Generate History] Error loading mints.json:', error);
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
    
    // Trier les transactions par timestamp (plus ancien en premier)
    allMints.sort((a, b) => a.timestamp - b.timestamp);
    
    // Trouver le timestamp de la première transaction
    const firstTimestamp = allMints[0].timestamp;
    
    // Trouver le timestamp de la dernière transaction
    const lastTimestamp = allMints[allMints.length - 1].timestamp;
    
    // Calculer le nombre de périodes de 12h
    const totalPeriods = Math.ceil((lastTimestamp - firstTimestamp) / PERIOD_DURATION) + 1;
    
    console.log(`[Generate History] First transaction: ${new Date(firstTimestamp * 1000).toISOString()}`);
    console.log(`[Generate History] Last transaction: ${new Date(lastTimestamp * 1000).toISOString()}`);
    console.log(`[Generate History] Will generate ${totalPeriods} historical points`);
    
    // Charger l'historique existant
    const existingHistory = await loadStoredHistory();
    const existingTimestamps = new Set(existingHistory.map(h => h.timestamp));
    
    // Générer les points historiques pour chaque période de 12h
    const newHistoryPoints: HistoricalDataPoint[] = [];
    
    for (let i = 0; i < totalPeriods; i++) {
      const periodStart = firstTimestamp + (i * PERIOD_DURATION / 1000); // Convertir en secondes
      const periodEnd = periodStart + (PERIOD_DURATION / 1000);
      
      // Filtrer les transactions dans cette période
      const periodMints = allMints.filter(m => 
        m.timestamp >= periodStart && m.timestamp < periodEnd
      );
      
      if (periodMints.length === 0) {
        continue; // Ignorer les périodes sans transactions
      }
      
      // Calculer les stats cumulatives jusqu'à la fin de cette période
      const mintsUpToPeriod = allMints.filter(m => m.timestamp <= periodEnd);
      
      const totalSolAdded = mintsUpToPeriod.reduce((sum, m) => sum + m.solAmount, 0);
      const totalTokensAdded = mintsUpToPeriod.reduce((sum, m) => sum + m.tokenAmount, 0);
      const totalMints = mintsUpToPeriod.length;
      
      // Utiliser le timestamp de fin de période (en millisecondes pour le stockage)
      const pointTimestamp = Math.floor(periodEnd * 1000);
      
      // Vérifier si ce point existe déjà
      if (existingTimestamps.has(pointTimestamp)) {
        console.log(`[Generate History] Point at ${new Date(pointTimestamp).toISOString()} already exists, skipping`);
        continue;
      }
      
      // Pour le prix et la liquidité, on ne peut pas les calculer rétroactivement
      // On les laisse à null pour les points historiques générés
      const historyPoint: HistoricalDataPoint = {
        timestamp: pointTimestamp,
        totalSolAdded,
        totalTokensAdded,
        totalMints,
        tokenPrice: null,
        tokenPriceInUsd: null,
        solPrice: null,
        totalLiquidity: null,
      };
      
      newHistoryPoints.push(historyPoint);
    }
    
    console.log(`[Generate History] Generated ${newHistoryPoints.length} new historical points`);
    
    // Fusionner avec l'historique existant
    const allHistory = [...existingHistory, ...newHistoryPoints];
    
    // Trier par timestamp (plus ancien en premier)
    allHistory.sort((a, b) => a.timestamp - b.timestamp);
    
    // Garder seulement les 60 derniers points (30 jours à 12h d'intervalle)
    const maxPoints = 60;
    const finalHistory = allHistory.length > maxPoints 
      ? allHistory.slice(-maxPoints)
      : allHistory;
    
    // Sauvegarder l'historique
    await saveStoredHistory(finalHistory);
    
    console.log(`[Generate History] Saved ${finalHistory.length} total historical points`);
    
    return NextResponse.json({
      success: true,
      generated: newHistoryPoints.length,
      total: finalHistory.length,
      message: `Generated ${newHistoryPoints.length} new historical points. Total: ${finalHistory.length}`,
    });
  } catch (error: any) {
    console.error('Error generating history:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to generate history' },
      { status: 500 }
    );
  }
}






