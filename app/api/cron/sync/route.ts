import { NextResponse } from 'next/server';
import { autoSync } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Route pour le cron job Vercel - synchronisation automatique
// Vercel envoie automatiquement le header 'x-vercel-signature' pour les cron jobs
export async function GET(request: Request) {
  try {
    // Vérifier si c'est un appel depuis Vercel Cron (header x-vercel-signature)
    const vercelSignature = request.headers.get('x-vercel-signature');
    const cronSecret = process.env.CRON_SECRET;
    
    // Si CRON_SECRET est défini, vérifier l'autorisation
    // Vercel envoie automatiquement x-vercel-signature pour les cron jobs
    if (cronSecret && !vercelSignature) {
      // Si pas de signature Vercel, vérifier le Bearer token
      const authHeader = request.headers.get('authorization');
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }
    
    console.log('[Cron Sync] Starting automatic sync...');
    
    // Lancer la synchronisation automatique
    const result = await autoSync();
    
    if (result) {
      console.log(`[Cron Sync] Sync completed: ${result.added} new transactions added. Total: ${result.total}`);
      return NextResponse.json({
        success: true,
        added: result.added,
        total: result.total,
        message: `Sync completed: ${result.added} new transactions added. Total: ${result.total}`,
        timestamp: new Date().toISOString()
      });
    } else {
      console.log('[Cron Sync] Sync skipped (already in progress or not needed)');
      return NextResponse.json({
        success: true,
        skipped: true,
        message: 'Sync skipped (already in progress or not needed)',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error: any) {
    console.error('[Cron Sync] Error during sync:', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Failed to sync',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// Support POST aussi (pour compatibilité)
export async function POST(request: Request) {
  return GET(request);
}

