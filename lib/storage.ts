import { promises as fs } from 'fs';
import path from 'path';
import type { MintTransaction } from './solana';
import { put, head, list } from '@vercel/blob';

const STORAGE_DIR = path.join(process.cwd(), 'data');
const MINTS_FILE = path.join(STORAGE_DIR, 'mints.json');
const SYNC_STATE_FILE = path.join(STORAGE_DIR, 'sync-state.json');

// Blob storage keys
const BLOB_MINTS_KEY = 'mints.json';
const BLOB_SYNC_STATE_KEY = 'sync-state.json';

// Interface pour l'état de synchronisation
interface SyncState {
  lastSync: number; // Timestamp de la dernière synchronisation
  isSyncing: boolean; // Indique si une synchronisation est en cours
}

// Détecter si on est sur Vercel (utilise Blob Storage) ou en local (utilise filesystem)
// Sur Vercel, on ne peut pas écrire dans le filesystem, donc on utilise toujours Blob si le token est disponible
const useBlobStorage = () => {
  // Si BLOB_READ_WRITE_TOKEN existe, on est sur Vercel ou en local avec Blob configuré
  // Sur Vercel, on ne peut pas créer de dossiers, donc on force Blob Storage
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    // Si on est sur Vercel (VERCEL=1 ou VERCEL_ENV existe), on utilise toujours Blob
    if (process.env.VERCEL === '1' || process.env.VERCEL_ENV) {
      return true;
    }
    // En local, si le token existe, on peut utiliser Blob aussi
    return true;
  }
  return false;
};

// S'assurer que le dossier data existe (pour le mode local uniquement)
async function ensureDataDir() {
  // Ne jamais essayer de créer le dossier sur Vercel
  if (useBlobStorage()) {
    return;
  }
  try {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating data directory:', error);
  }
}

// ========== FONCTIONS BLOB STORAGE (Vercel) ==========

// Charger les mints depuis Vercel Blob
async function loadMintsFromBlob(): Promise<MintTransaction[]> {
  try {
    // Vérifier si le blob existe
    const blobInfo = await head(BLOB_MINTS_KEY).catch(() => null);
    if (!blobInfo) {
      // Le fichier n'existe pas encore, retourner un tableau vide
      return [];
    }
    
    // Récupérer le contenu via l'URL
    const response = await fetch(blobInfo.url);
    if (!response.ok) {
      if (response.status === 404) {
        return [];
      }
      throw new Error(`Failed to fetch blob: ${response.statusText}`);
    }
    
    const text = await response.text();
    return JSON.parse(text);
  } catch (error: any) {
    if (error.name === 'BlobNotFoundError' || error.status === 404) {
      return [];
    }
    console.error('Error loading mints from blob:', error);
    return [];
  }
}

// Sauvegarder les mints dans Vercel Blob
async function saveMintsToBlob(mints: MintTransaction[]): Promise<void> {
  try {
    const sorted = mints.sort((a, b) => b.timestamp - a.timestamp);
    const content = JSON.stringify(sorted, null, 2);
    await put(BLOB_MINTS_KEY, content, {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false, // Garder le même nom de fichier
      allowOverwrite: true, // Permettre l'écrasement
    });
    console.log(`[saveMintsToBlob] Successfully saved ${mints.length} transactions to blob`);
  } catch (error) {
    console.error('Error saving mints to blob:', error);
    throw error;
  }
}

// Charger l'état de synchronisation depuis Vercel Blob
async function loadSyncStateFromBlob(): Promise<SyncState> {
  try {
    const blobInfo = await head(BLOB_SYNC_STATE_KEY).catch(() => null);
    if (!blobInfo) {
      return { lastSync: 0, isSyncing: false };
    }
    
    const response = await fetch(blobInfo.url);
    if (!response.ok) {
      if (response.status === 404) {
        return { lastSync: 0, isSyncing: false };
      }
      throw new Error(`Failed to fetch sync state: ${response.statusText}`);
    }
    
    const text = await response.text();
    return JSON.parse(text);
  } catch (error: any) {
    if (error.name === 'BlobNotFoundError' || error.status === 404) {
      return { lastSync: 0, isSyncing: false };
    }
    console.error('Error loading sync state from blob:', error);
    return { lastSync: 0, isSyncing: false };
  }
}

// Sauvegarder l'état de synchronisation dans Vercel Blob
async function saveSyncStateToBlob(state: SyncState): Promise<void> {
  try {
    const content = JSON.stringify(state, null, 2);
    await put(BLOB_SYNC_STATE_KEY, content, {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  } catch (error) {
    console.error('Error saving sync state to blob:', error);
  }
}

// ========== FONCTIONS FILESYSTEM (Local) ==========

// Charger les mints depuis le fichier local
async function loadMintsFromFile(): Promise<MintTransaction[]> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(MINTS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }
    console.error('Error loading stored mints:', error);
    return [];
  }
}

// Sauvegarder les mints dans le fichier local
async function saveMintsToFile(mints: MintTransaction[]): Promise<void> {
  try {
    await ensureDataDir();
    const sorted = mints.sort((a, b) => b.timestamp - a.timestamp);
    await fs.writeFile(MINTS_FILE, JSON.stringify(sorted, null, 2), 'utf-8');
    console.log(`[saveMintsToFile] Successfully wrote ${mints.length} transactions to file`);
  } catch (error) {
    console.error('Error saving stored mints:', error);
    throw error;
  }
}

// Charger l'état de synchronisation depuis le fichier local
async function loadSyncStateFromFile(): Promise<SyncState> {
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

// Sauvegarder l'état de synchronisation dans le fichier local
async function saveSyncStateToFile(state: SyncState): Promise<void> {
  try {
    await ensureDataDir();
    await fs.writeFile(SYNC_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving sync state:', error);
  }
}

// ========== FONCTIONS UNIFIÉES (utilisent Blob ou File selon l'environnement) ==========

// Charger les mints depuis le stockage (Blob ou File)
export async function loadStoredMints(): Promise<MintTransaction[]> {
  if (useBlobStorage()) {
    return loadMintsFromBlob();
  }
  return loadMintsFromFile();
}

// Sauvegarder les mints dans le stockage (Blob ou File)
export async function saveStoredMints(mints: MintTransaction[]): Promise<void> {
  if (useBlobStorage()) {
    await saveMintsToBlob(mints);
  } else {
    await saveMintsToFile(mints);
  }
}

// Charger l'état de synchronisation
async function loadSyncState(): Promise<SyncState> {
  if (useBlobStorage()) {
    return loadSyncStateFromBlob();
  }
  return loadSyncStateFromFile();
}

// Sauvegarder l'état de synchronisation
async function saveSyncState(state: SyncState): Promise<void> {
  if (useBlobStorage()) {
    await saveSyncStateToBlob(state);
  } else {
    await saveSyncStateToFile(state);
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
    console.log(`[syncMints] Storage mode: ${useBlobStorage() ? 'Vercel Blob' : 'Local filesystem'}`);
    
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
      console.log(`[syncMints] Saving ${updated.length} total transactions...`);
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
