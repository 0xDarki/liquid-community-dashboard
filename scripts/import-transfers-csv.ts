/**
 * Script pour importer un fichier CSV de transfers dans la base de données
 * Usage: npx tsx scripts/import-transfers-csv.ts <path-to-csv-file>
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadStoredTransfers, saveStoredTransfers } from '../lib/storage';
import { TransferTransaction } from '../lib/solana';

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

async function importCSV(csvFilePath: string) {
  try {
    console.log(`[importCSV] Reading CSV file: ${csvFilePath}`);
    
    // Lire le fichier CSV
    const csvContent = fs.readFileSync(csvFilePath, 'utf-8');
    
    // Parser le CSV
    console.log(`[importCSV] Parsing CSV file...`);
    const importedTransfers = parseCSV(csvContent);
    console.log(`[importCSV] Parsed ${importedTransfers.length} transfers from CSV`);
    
    if (importedTransfers.length === 0) {
      console.error('[importCSV] No valid transfers found in CSV file');
      process.exit(1);
    }
    
    // Charger les transfers existants
    console.log(`[importCSV] Loading existing transfers from database...`);
    const existingTransfers = await loadStoredTransfers();
    const existingSignatures = new Set(existingTransfers.map(t => t.signature));
    
    // Filtrer les nouveaux transfers (ceux qui ne sont pas déjà dans la base)
    const newTransfers = importedTransfers.filter(t => !existingSignatures.has(t.signature));
    const duplicates = importedTransfers.length - newTransfers.length;
    
    console.log(`[importCSV] Found ${newTransfers.length} new transfers, ${duplicates} duplicates`);
    
    if (newTransfers.length === 0) {
      console.log('[importCSV] All transfers from CSV already exist in database');
      console.log(`[importCSV] Total transfers in database: ${existingTransfers.length}`);
      return;
    }
    
    // Fusionner avec les transfers existants
    const updated = [...existingTransfers, ...newTransfers].sort((a, b) => b.timestamp - a.timestamp);
    
    // Sauvegarder
    console.log(`[importCSV] Saving ${updated.length} total transfers...`);
    await saveStoredTransfers(updated);
    console.log(`[importCSV] Successfully imported ${newTransfers.length} transfers`);
    console.log(`[importCSV] Total transfers in database: ${updated.length}`);
    
  } catch (error: any) {
    console.error('[importCSV] Error importing CSV:', error);
    process.exit(1);
  }
}

// Exécuter le script
const csvFilePath = process.argv[2];

if (!csvFilePath) {
  console.error('Usage: npx tsx scripts/import-transfers-csv.ts <path-to-csv-file>');
  process.exit(1);
}

const absolutePath = path.isAbsolute(csvFilePath) 
  ? csvFilePath 
  : path.join(process.cwd(), csvFilePath);

if (!fs.existsSync(absolutePath)) {
  console.error(`[importCSV] File not found: ${absolutePath}`);
  process.exit(1);
}

importCSV(absolutePath).catch(console.error);

