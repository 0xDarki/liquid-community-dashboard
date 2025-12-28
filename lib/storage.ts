import { promises as fs } from 'fs';
import path from 'path';
import type { MintTransaction } from './solana';

const STORAGE_DIR = path.join(process.cwd(), 'data');
const MINTS_FILE = path.join(STORAGE_DIR, 'mints.json');
const SYNC_STATE_FILE = path.join(STORAGE_DIR, 'sync-state.json');

// Interface pour l'état de synchronisation
interface SyncState {
  lastSync: number; // Timestamp de la dernière synchronisation
  isSyncing: boolean; // Indique si une synchronisation est en cours
}

// S'assurer que le dossier data existe
async function ensureDataDir() {
  try {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating data directory:', error);
  }
}

// Charger les mints depuis le fichier
export async function loadStoredMints(): Promise<MintTransaction[]> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(MINTS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // Le fichier n'existe pas encore, retourner un tableau vide
      return [];
    }
    console.error('Error loading stored mints:', error);
    return [];
  }
}

// Sauvegarder les mints dans le fichier
export async function saveStoredMints(mints: MintTransaction[]): Promise<void> {
  try {
    console.log(`[saveStoredMints] Ensuring data directory exists...`);
    await ensureDataDir();
    console.log(`[saveStoredMints] Data directory ready, saving ${mints.length} transactions to ${MINTS_FILE}`);
    // Trier par timestamp décroissant
    const sorted = mints.sort((a, b) => b.timestamp - a.timestamp);
    await fs.writeFile(MINTS_FILE, JSON.stringify(sorted, null, 2), 'utf-8');
    console.log(`[saveStoredMints] Successfully wrote ${mints.length} transactions to file`);
  } catch (error) {
    console.error('Error saving stored mints:', error);
    throw error;
  }
}

// Ajouter de nouveaux mints à la liste stockée (évite les doublons)
export async function addMints(newMints: MintTransaction[]): Promise<MintTransaction[]> {
  try {
    const existingMints = await loadStoredMints();
    const existingSignatures = new Set(existingMints.map(m => m.signature));
    
    // Ajouter seulement les nouveaux mints
    const toAdd = newMints.filter(m => !existingSignatures.has(m.signature));
    
    if (toAdd.length > 0) {
      const updated = [...existingMints, ...toAdd];
      await saveStoredMints(updated);
      return updated;
    }
    
    return existingMints;
  } catch (error) {
    console.error('Error adding mints:', error);
    throw error;
  }
}

// Récupérer tous les mints stockés
export async function getAllStoredMints(): Promise<MintTransaction[]> {
  return loadStoredMints();
}

// Récupérer les mints stockés avec une limite
export async function getStoredMints(limit: number = 50): Promise<MintTransaction[]> {
  const all = await loadStoredMints();
  return all.slice(0, limit);
}

// Charger l'état de synchronisation
async function loadSyncState(): Promise<SyncState> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(SYNC_STATE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return { lastSync: 0, isSyncing: false };
    }
    console.error('Error loading sync state:', error);
    return { lastSync: 0, isSyncing: false };
  }
}

// Sauvegarder l'état de synchronisation
async function saveSyncState(state: SyncState): Promise<void> {
  try {
    await ensureDataDir();
    await fs.writeFile(SYNC_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving sync state:', error);
  }
}

// Vérifier si une synchronisation est nécessaire (toutes les 2 minutes)
export async function shouldSync(): Promise<boolean> {
  const state = await loadSyncState();
  const now = Date.now();
  const twoMinutes = 2 * 60 * 1000; // 2 minutes en millisecondes
  
  // Si une synchronisation est en cours, ne pas en lancer une autre
  if (state.isSyncing) {
    return false;
  }
  
  // Si la dernière synchronisation date de plus de 2 minutes
  return (now - state.lastSync) >= twoMinutes;
}

// Synchronisation automatique (appelée par le backend)
export async function autoSync(): Promise<{ added: number; total: number } | null> {
  try {
    const state = await loadSyncState();
    
    // Si une synchronisation est déjà en cours, retourner null
    if (state.isSyncing) {
      return null;
    }
    
    // Marquer comme en cours de synchronisation
    await saveSyncState({ ...state, isSyncing: true });
    
    try {
      // Synchroniser seulement les 20 dernières transactions
      const result = await syncMints(20, false);
      
      // Mettre à jour l'état
      await saveSyncState({
        lastSync: Date.now(),
        isSyncing: false,
      });
      
      return result;
    } catch (error) {
      // En cas d'erreur, réinitialiser le flag
      await saveSyncState({
        ...state,
        isSyncing: false,
      });
      throw error;
    }
  } catch (error) {
    console.error('Error in autoSync:', error);
    return null;
  }
}

// Synchroniser les mints : récupère les nouveaux depuis la blockchain et les ajoute au stockage
export async function syncMints(limit: number = 50, getAll: boolean = false): Promise<{ added: number; total: number }> {
  try {
    // Charger d'abord les transactions existantes pour utiliser le cache
    const existingMints = await loadStoredMints();
    const existingSignatures = new Set(existingMints.map(m => m.signature));
    
    console.log(`[syncMints] Starting sync with limit=${limit}, getAll=${getAll}`);
    console.log(`[syncMints] Already have ${existingMints.length} stored transactions (using as cache)`);
    
    // Si getAll=true, récupérer seulement les 20 dernières transactions (pour synchronisation rapide)
    // Sinon, utiliser la limite fournie
    const syncLimit = getAll ? 20 : Math.min(limit, 1000);
    
    const { getMintTransactions } = await import('./solana');
    
    // Récupérer les mints depuis la blockchain (seulement les plus récentes)
    const newMints = await getMintTransactions(syncLimit);
    
    console.log(`[syncMints] Retrieved ${newMints.length} transactions from blockchain`);
    
    // Filtrer seulement les nouveaux (qui ne sont pas déjà dans le cache)
    const toAdd = newMints.filter(m => !existingSignatures.has(m.signature));
    
    console.log(`[syncMints] Found ${toAdd.length} new transactions to add`);
    
    if (toAdd.length > 0) {
      // Fusionner avec les transactions existantes (les nouvelles sont déjà les plus récentes)
      // Trier par timestamp pour maintenir l'ordre
      const updated = [...existingMints, ...toAdd].sort((a, b) => b.timestamp - a.timestamp);
      console.log(`[syncMints] Saving ${updated.length} total transactions to file...`);
      await saveStoredMints(updated);
      console.log(`[syncMints] Successfully saved ${updated.length} transactions`);
      return { added: toAdd.length, total: updated.length };
    }
    
    console.log(`[syncMints] No new transactions to add`);
    return { added: 0, total: existingMints.length };
  } catch (error) {
    console.error('Error syncing mints:', error);
    // En cas d'erreur, retourner au moins ce qui est stocké
    const existing = await loadStoredMints();
    return { added: 0, total: existing.length };
  }
}

