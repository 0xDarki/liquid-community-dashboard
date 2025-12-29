import { NextRequest, NextResponse } from 'next/server';
import { loadStoredTransfers, saveStoredTransfers } from '@/lib/storage';
import { TransferTransaction } from '@/lib/solana';
import { isAuthorizedDomain } from '@/lib/auth';

// Parser le CSV et convertir en TransferTransaction[]
function parseCSV(csvContent: string): TransferTransaction[] {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV file must have at least a header and one data row');
  }
  
  // Parser la première ligne (header)
  const headers = lines[0].split(',').map(h => h.trim());
  
  // Trouver les indices des colonnes nécessaires
  const signatureIndex = headers.findIndex(h => h.toLowerCase() === 'signature');
  const blockTimeIndex = headers.findIndex(h => h.toLowerCase().includes('block') && h.toLowerCase().includes('time'));
  const fromIndex = headers.findIndex(h => h.toLowerCase() === 'from');
  const toIndex = headers.findIndex(h => h.toLowerCase() === 'to');
  const amountIndex = headers.findIndex(h => h.toLowerCase() === 'amount');
  const decimalsIndex = headers.findIndex(h => h.toLowerCase() === 'decimals');
  
  if (signatureIndex === -1 || blockTimeIndex === -1 || fromIndex === -1 || toIndex === -1 || amountIndex === -1) {
    throw new Error('CSV file must contain columns: Signature, Block Time, From, To, Amount');
  }
  
  const transfers: TransferTransaction[] = [];
  
  // Parser chaque ligne de données
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Ignorer les lignes vides
    
    // Parser la ligne CSV (gérer les valeurs entre guillemets)
    const values: string[] = [];
    let currentValue = '';
    let inQuotes = false;
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    values.push(currentValue.trim()); // Ajouter la dernière valeur
    
    if (values.length <= Math.max(signatureIndex, blockTimeIndex, fromIndex, toIndex, amountIndex)) {
      console.warn(`[parseCSV] Skipping line ${i + 1}: not enough columns`);
      continue;
    }
    
    const signature = values[signatureIndex]?.trim();
    const blockTimeStr = values[blockTimeIndex]?.trim();
    const from = values[fromIndex]?.trim();
    const to = values[toIndex]?.trim();
    const amountStr = values[amountIndex]?.trim();
    const decimals = decimalsIndex !== -1 ? parseInt(values[decimalsIndex] || '6', 10) : 6;
    
    if (!signature || !blockTimeStr || !from || !to || !amountStr) {
      console.warn(`[parseCSV] Skipping line ${i + 1}: missing required fields`);
      continue;
    }
    
    // Convertir le timestamp (déjà en Unix timestamp)
    const timestamp = parseInt(blockTimeStr, 10);
    if (isNaN(timestamp)) {
      console.warn(`[parseCSV] Skipping line ${i + 1}: invalid timestamp`);
      continue;
    }
    
    // Convertir le montant (en lamports) en tokens
    const amountLamports = parseFloat(amountStr);
    if (isNaN(amountLamports)) {
      console.warn(`[parseCSV] Skipping line ${i + 1}: invalid amount`);
      continue;
    }
    
    // Convertir les lamports en tokens (diviser par 10^decimals)
    const tokenAmount = amountLamports / Math.pow(10, decimals);
    
    transfers.push({
      signature,
      timestamp,
      tokenAmount,
      from,
      to,
    });
  }
  
  return transfers;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    // Vérifier l'autorisation
    if (!isAuthorizedDomain(request)) {
      return NextResponse.json(
        { error: 'Unauthorized: This action is only available on the private domain' },
        { status: 403 }
      );
    }
    
    // Lire le contenu du fichier CSV depuis le body
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided. Please upload a CSV file.' },
        { status: 400 }
      );
    }
    
    // Vérifier que c'est un fichier CSV
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      return NextResponse.json(
        { error: 'File must be a CSV file' },
        { status: 400 }
      );
    }
    
    // Lire le contenu du fichier
    const csvContent = await file.text();
    
    // Parser le CSV
    console.log(`[importTransfers] Parsing CSV file: ${file.name}`);
    const importedTransfers = parseCSV(csvContent);
    console.log(`[importTransfers] Parsed ${importedTransfers.length} transfers from CSV`);
    
    if (importedTransfers.length === 0) {
      return NextResponse.json(
        { error: 'No valid transfers found in CSV file' },
        { status: 400 }
      );
    }
    
    // Charger les transfers existants
    const existingTransfers = await loadStoredTransfers();
    const existingSignatures = new Set(existingTransfers.map(t => t.signature));
    
    // Filtrer les nouveaux transfers (ceux qui ne sont pas déjà dans la base)
    const newTransfers = importedTransfers.filter(t => !existingSignatures.has(t.signature));
    const duplicates = importedTransfers.length - newTransfers.length;
    
    console.log(`[importTransfers] Found ${newTransfers.length} new transfers, ${duplicates} duplicates`);
    
    if (newTransfers.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All transfers from CSV already exist in database',
        imported: 0,
        duplicates,
        total: existingTransfers.length,
      });
    }
    
    // Fusionner avec les transfers existants
    const updated = [...existingTransfers, ...newTransfers].sort((a, b) => b.timestamp - a.timestamp);
    
    // Sauvegarder
    console.log(`[importTransfers] Saving ${updated.length} total transfers...`);
    await saveStoredTransfers(updated);
    console.log(`[importTransfers] Successfully imported ${newTransfers.length} transfers`);
    
    return NextResponse.json({
      success: true,
      message: `Successfully imported ${newTransfers.length} transfers`,
      imported: newTransfers.length,
      duplicates,
      total: updated.length,
    });
    
  } catch (error: any) {
    console.error('[importTransfers] Error importing CSV:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to import CSV file' },
      { status: 500 }
    );
  }
}

