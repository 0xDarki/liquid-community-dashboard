import { NextResponse } from 'next/server';
import { getTransferTransactions } from '@/lib/solana';
import { cache } from '@/lib/cache';

export const dynamic = 'force-dynamic'; // Force dynamic rendering
export const revalidate = 0; // Disable static generation // Revalider toutes les 30 secondes

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    
    // Vérifier le cache
    const cacheKey = `transfer-transactions-${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }
    
    const transactions = await getTransferTransactions(limit);
    
    // Mettre en cache pendant 2 minutes pour réduire les requêtes
    cache.set(cacheKey, transactions, 120000);
    
    return NextResponse.json(transactions);
  } catch (error: any) {
    console.error('Error fetching transfer transactions:', error);
    let status = 500;
    if (error?.message?.includes('Rate limit') || error?.message?.includes('429')) {
      status = 429;
    } else if (error?.message?.includes('RPC service unavailable') || error?.message?.includes('503') || error?.message?.includes('Service Unavailable')) {
      status = 503;
    }
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch transfer transactions' },
      { status }
    );
  }
}

