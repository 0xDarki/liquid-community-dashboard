import { NextResponse } from 'next/server';
import type { MintTransaction } from '@/lib/solana';
import { loadStoredMints, saveStoredMints } from '@/lib/storage';
import { head } from '@vercel/blob';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Clé pour le fichier mints.json à importer depuis Vercel Blob Storage
// Note: Si vous avez uploadé un fichier mints.json dans Vercel Blob Storage, 
// il doit avoir le nom exact "mints.json" pour être importé
const BLOB_IMPORT_MINTS_KEY = 'mints.json';

export async function POST() {
  try {
    // Lire le fichier mints.json depuis Vercel Blob Storage
    let importMints: MintTransaction[] = [];
    try {
      // Vérifier si le blob existe
      const blobInfo = await head(BLOB_IMPORT_MINTS_KEY).catch(() => null);
      if (!blobInfo) {
        return NextResponse.json(
          { error: 'File mints.json not found in Vercel Blob Storage' },
          { status: 404 }
        );
      }
      
      // Récupérer le contenu via l'URL
      const response = await fetch(blobInfo.url);
      if (!response.ok) {
        if (response.status === 404) {
          return NextResponse.json(
            { error: 'File mints.json not found in Vercel Blob Storage' },
            { status: 404 }
          );
        }
        throw new Error(`Failed to fetch blob: ${response.statusText}`);
      }
      
      const text = await response.text();
      importMints = JSON.parse(text);
      console.log(`[Import] Loaded ${importMints.length} transactions from Vercel Blob Storage (mints.json)`);
    } catch (error: any) {
      if (error.name === 'BlobNotFoundError' || error.status === 404) {
        return NextResponse.json(
          { error: 'File mints.json not found in Vercel Blob Storage' },
          { status: 404 }
        );
      }
      console.error('[Import] Error loading from Blob Storage:', error);
      throw error;
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

