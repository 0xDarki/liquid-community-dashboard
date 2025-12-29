import { NextResponse } from 'next/server';
import { syncTransfers } from '@/lib/storage';
import { isAuthorizedDomain } from '@/lib/auth';

export const dynamic = 'force-dynamic'; // Force dynamic rendering
export const revalidate = 0; // Disable static generation
export const maxDuration = 300; // 5 minutes (maximum pour Vercel Pro/Enterprise)

export async function POST(request: Request) {
  try {
    // Vérifier si la requête provient d'un domaine autorisé
    if (!isAuthorizedDomain(request)) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Unauthorized: This action is only available on the private domain',
        },
        { status: 403 } // Forbidden
      );
    }
    
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const getAll = searchParams.get('getAll') === 'true' || limitParam === '0';
    
    // Si getAll=true ou limit=0, récupérer toutes les transactions
    // Sinon, utiliser la limite fournie ou 1000 par défaut
    const limit = getAll ? 0 : parseInt(limitParam || '1000', 10);
    
    try {
      const result = await syncTransfers(limit, getAll);
      
      return NextResponse.json({ 
        success: true, 
        added: result.added,
        total: result.total,
        message: getAll 
          ? `Added ${result.added} new transfer transactions. Total: ${result.total}.`
          : `Added ${result.added} new transfer transactions. Total: ${result.total}`
      });
    } catch (error) {
      throw error;
    }
  } catch (error: any) {
    console.error('Error syncing transfers (POST):', error);
    
    return NextResponse.json(
      { error: error?.message || 'Failed to sync transfers' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    // Vérifier si la requête provient d'un domaine autorisé
    if (!isAuthorizedDomain(request)) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Unauthorized: This action is only available on the private domain',
        },
        { status: 403 } // Forbidden
      );
    }
    
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const getAll = searchParams.get('getAll') === 'true' || limitParam === '0';
    
    // Si getAll=true ou limit=0, récupérer toutes les transactions
    // Sinon, utiliser la limite fournie ou 1000 par défaut
    const limit = getAll ? 0 : parseInt(limitParam || '1000', 10);
    
    try {
      const result = await syncTransfers(limit, getAll);
      
      return NextResponse.json({ 
        success: true, 
        added: result.added,
        total: result.total,
        message: getAll 
          ? `Added ${result.added} new transfer transactions. Total: ${result.total}.`
          : `Added ${result.added} new transfer transactions. Total: ${result.total}`
      });
    } catch (error) {
      throw error;
    }
  } catch (error: any) {
    console.error('Error syncing transfers (GET):', error);
    
    return NextResponse.json(
      { error: error?.message || 'Failed to sync transfers' },
      { status: 500 }
    );
  }
}

