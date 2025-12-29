import { NextResponse } from 'next/server';
import { loadStoredPrice } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const price = await loadStoredPrice();
    
    if (!price) {
      return NextResponse.json({ 
        price: null,
        priceInUsd: null,
        solPrice: null,
        solBalance: null,
        tokenBalance: null,
        timestamp: null
      });
    }
    
    return NextResponse.json({
      price: price.price,
      priceInUsd: price.priceInUsd,
      solPrice: price.solPrice,
      solBalance: price.solBalance,
      tokenBalance: price.tokenBalance,
      timestamp: price.timestamp
    });
  } catch (error) {
    console.error('Error loading price from storage:', error);
    return NextResponse.json({ 
      price: null,
      priceInUsd: null,
      solPrice: null,
      solBalance: null,
      tokenBalance: null,
      timestamp: null
    }, { status: 500 });
  }
}


