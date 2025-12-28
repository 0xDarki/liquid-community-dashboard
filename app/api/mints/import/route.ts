import { NextResponse } from 'next/server';
import type { MintTransaction } from '@/lib/solana';
import { loadStoredMints, saveStoredMints } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    // Lire les mints depuis le body de la requête (JSON)
    let importMints: MintTransaction[] = [];
    try {
      const body = await request.json();
      
      // Vérifier si c'est un array de transactions
      if (!Array.isArray(body)) {
        return NextResponse.json(
          { error: 'Request body must be an array of MintTransaction objects' },
          { status: 400 }
        );
      }
      
      importMints = body;
      console.log(`[Import] Received ${importMints.length} transactions from request body`);
    } catch (error: any) {
      console.error('[Import] Error parsing request body:', error);
      return NextResponse.json(
        { error: error?.message || 'Failed to parse request body. Expected JSON array of MintTransaction objects.' },
        { status: 400 }
      );
    }
    
    // Charger les mints existants depuis le stockage
    const existingMints = await loadStoredMints();
    console.log(`[Import] Found ${existingMints.length} existing transactions in storage`);
    
    // Créer un Set des signatures existantes pour éviter les doublons
    const existingSignatures = new Set(existingMints.map(m => m.signature));
    
    // Filtrer les nouveaux mints (ceux qui ne sont pas déjà dans le stockage)
    const newMints = importMints.filter(m => !existingSignatures.has(m.signature));
    
    console.log(`[Import] Found ${newMints.length} new transactions to add`);
    
    // Fusionner les mints (existants + nouveaux)
    const allMints = [...existingMints, ...newMints];
    
    // Trier par timestamp (plus récent en premier)
    allMints.sort((a, b) => b.timestamp - a.timestamp);
    
    // Sauvegarder dans le stockage
    await saveStoredMints(allMints);
    
    console.log(`[Import] Successfully imported ${newMints.length} new transactions. Total: ${allMints.length}`);
    
    return NextResponse.json({
      success: true,
      imported: newMints.length,
      total: allMints.length,
      existing: existingMints.length,
      message: `Imported ${newMints.length} new transactions. Total: ${allMints.length}`,
    });
  } catch (error: any) {
    console.error('Error importing mints:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to import mints' },
      { status: 500 }
    );
  }
}

