import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import type { MintTransaction } from '@/lib/solana';
import { loadStoredMints, saveStoredMints } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST() {
  try {
    // Chemin vers le fichier mints.json local
    const mintsFilePath = path.join(process.cwd(), 'data', 'mints.json');
    
    // Lire le fichier local
    let localMints: MintTransaction[] = [];
    try {
      const fileContent = await fs.readFile(mintsFilePath, 'utf-8');
      localMints = JSON.parse(fileContent);
      console.log(`[Import] Loaded ${localMints.length} transactions from local mints.json`);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return NextResponse.json(
          { error: 'File data/mints.json not found' },
          { status: 404 }
        );
      }
      throw error;
    }
    
    // Charger les mints existants depuis le stockage
    const existingMints = await loadStoredMints();
    console.log(`[Import] Found ${existingMints.length} existing transactions in storage`);
    
    // Créer un Set des signatures existantes pour éviter les doublons
    const existingSignatures = new Set(existingMints.map(m => m.signature));
    
    // Filtrer les nouveaux mints (ceux qui ne sont pas déjà dans le stockage)
    const newMints = localMints.filter(m => !existingSignatures.has(m.signature));
    
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

