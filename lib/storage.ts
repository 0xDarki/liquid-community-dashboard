import { promises as fs } from 'fs';
import path from 'path';
import type { MintTransaction, TransferTransaction } from './solana';
import { createClient } from '@supabase/supabase-js';

const STORAGE_DIR = path.join(process.cwd(), 'data');
const MINTS_FILE = path.join(STORAGE_DIR, 'mints.json');
const TRANSFERS_FILE = path.join(STORAGE_DIR, 'transfers.json');
const SYNC_STATE_FILE = path.join(STORAGE_DIR, 'sync-state.json');

// Interface pour l'état de synchronisation
interface SyncState {
  lastSync: number; // Timestamp de la dernière synchronisation
  isSyncing: boolean; // Indique si une synchronisation est en cours
  syncStartTime?: number; // Timestamp du début de la synchronisation (pour détecter les syncs bloqués)
}

// Interface pour le prix du token
export interface TokenPrice {
  price: number; // Prix en SOL
  priceInUsd: number; // Prix en USD
  solPrice: number; // Prix du SOL en USD
  solBalance: number; // Solde SOL de la LP
  tokenBalance: number; // Solde de tokens de la LP
  timestamp: number; // Timestamp de la dernière mise à jour
}

// Interface pour les données historiques
export interface HistoricalDataPoint {
  timestamp: number; // Timestamp du point de données
  totalSolAdded: number;
  totalTokensAdded: number;
  totalMints: number;
  tokenPrice: number | null;
  tokenPriceInUsd: number | null;
  solPrice: number | null;
  totalLiquidity: number | null;
}

// Initialiser le client Supabase
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)');
  }

  return createClient(supabaseUrl, supabaseKey);
}

// Détecter si on utilise Supabase ou le filesystem local
const useSupabase = () => {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY));
};

// S'assurer que le dossier data existe (pour le mode local uniquement)
async function ensureDataDir() {
  if (useSupabase()) {
    return;
  }
  try {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating data directory:', error);
  }
}

// ========== FONCTIONS SUPABASE ==========

// Charger les mints depuis Supabase
async function loadMintsFromSupabase(): Promise<MintTransaction[]> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('mints')
      .select('data')
      .eq('key', 'mints')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        console.log('[loadMintsFromSupabase] No data found, returning empty array');
      return [];
    }
      if (error.code === 'PGRST205') {
        // Table not found
        console.error('[loadMintsFromSupabase] Table "mints" does not exist. Please run the SQL schema from supabase-schema.sql in your Supabase SQL Editor.');
        return [];
      }
      throw error;
    }
    
    return data?.data || [];
  } catch (error: any) {
    if (error?.code === 'PGRST205') {
      console.error('[loadMintsFromSupabase] Table "mints" does not exist. Please run the SQL schema from supabase-schema.sql in your Supabase SQL Editor.');
      return [];
    }
    console.error('Error loading mints from Supabase:', error);
    return [];
  }
}

// Sauvegarder les mints dans Supabase
async function saveMintsToSupabase(mints: MintTransaction[]): Promise<void> {
  try {
    const sorted = mints.sort((a, b) => b.timestamp - a.timestamp);
    const supabase = getSupabaseClient();
    
    const { error } = await supabase
      .from('mints')
      .upsert({
        key: 'mints',
        data: sorted,
      }, {
        onConflict: 'key',
      });

    if (error) {
      if (error.code === 'PGRST205') {
        console.error('[saveMintsToSupabase] Table "mints" does not exist. Please run the SQL schema from supabase-schema.sql in your Supabase SQL Editor.');
        throw new Error('Supabase table "mints" does not exist. Please run the SQL schema from supabase-schema.sql in your Supabase SQL Editor.');
      }
      throw error;
    }

    console.log(`[saveMintsToSupabase] Successfully saved ${mints.length} transactions`);
  } catch (error: any) {
    if (error?.code === 'PGRST205') {
      console.error('[saveMintsToSupabase] Table "mints" does not exist. Please run the SQL schema from supabase-schema.sql in your Supabase SQL Editor.');
      throw new Error('Supabase table "mints" does not exist. Please run the SQL schema from supabase-schema.sql in your Supabase SQL Editor.');
    }
    console.error('Error saving mints to Supabase:', error);
    throw error;
  }
}

// Charger les transfers depuis Supabase
async function loadTransfersFromSupabase(): Promise<TransferTransaction[]> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('transfers')
      .select('data')
      .eq('key', 'transfers')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        console.log('[loadTransfersFromSupabase] No data found, returning empty array');
        return [];
      }
      if (error.code === 'PGRST205') {
        // Table not found
        console.error('[loadTransfersFromSupabase] Table "transfers" does not exist. Please run the SQL schema from supabase-schema.sql in your Supabase SQL Editor.');
        return [];
      }
      throw error;
    }

    return data?.data || [];
  } catch (error: any) {
    if (error?.code === 'PGRST205') {
      console.error('[loadTransfersFromSupabase] Table "transfers" does not exist. Please run the SQL schema from supabase-schema.sql in your Supabase SQL Editor.');
      return [];
    }
    console.error('Error loading transfers from Supabase:', error);
    return [];
  }
}

// Sauvegarder les transfers dans Supabase
async function saveTransfersToSupabase(transfers: TransferTransaction[]): Promise<void> {
  try {
    const sorted = transfers.sort((a, b) => b.timestamp - a.timestamp);
    const supabase = getSupabaseClient();
    
    const { error } = await supabase
      .from('transfers')
      .upsert({
        key: 'transfers',
        data: sorted,
      }, {
        onConflict: 'key',
      });

    if (error) {
      if (error.code === 'PGRST205') {
        console.error('[saveTransfersToSupabase] Table "transfers" does not exist. Please run the SQL schema from supabase-schema.sql in your Supabase SQL Editor.');
        throw new Error('Supabase table "transfers" does not exist. Please run the SQL schema from supabase-schema.sql in your Supabase SQL Editor.');
      }
      throw error;
    }
    
    console.log(`[saveTransfersToSupabase] Successfully saved ${transfers.length} transactions`);
  } catch (error: any) {
    if (error?.code === 'PGRST205') {
      console.error('[saveTransfersToSupabase] Table "transfers" does not exist. Please run the SQL schema from supabase-schema.sql in your Supabase SQL Editor.');
      throw new Error('Supabase table "transfers" does not exist. Please run the SQL schema from supabase-schema.sql in your Supabase SQL Editor.');
    }
    console.error('Error saving transfers to Supabase:', error);
    throw error;
  }
}

// Charger l'état de synchronisation depuis Supabase
async function loadSyncStateFromSupabase(): Promise<SyncState> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('sync_state')
      .select('data')
      .eq('key', 'sync_state')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        console.log('[loadSyncStateFromSupabase] No data found, returning default state');
        return { lastSync: 0, isSyncing: false };
      }
      if (error.code === 'PGRST205') {
        // Table not found
        console.error('[loadSyncStateFromSupabase] Table "sync_state" does not exist. Please run the SQL schema from supabase-schema.sql in your Supabase SQL Editor.');
        return { lastSync: 0, isSyncing: false };
      }
      throw error;
    }

    const state: SyncState = data?.data || { lastSync: 0, isSyncing: false };

    // Vérifier si un sync est bloqué depuis trop longtemps (plus de 3 minutes)
    if (state.isSyncing) {
      const now = Date.now();
      const syncStartTime = state.syncStartTime || state.lastSync || now;
      const threeMinutes = 3 * 60 * 1000; // 3 minutes en millisecondes
      
      if (now - syncStartTime > threeMinutes) {
        console.warn('[loadSyncStateFromSupabase] Sync appears to be stuck, resetting isSyncing flag');
        // Réinitialiser le flag isSyncing
        const resetState: SyncState = {
          lastSync: state.lastSync,
          isSyncing: false,
        };
        // Sauvegarder l'état réinitialisé
        await saveSyncStateToSupabase(resetState);
        return resetState;
      }
    }

    return state;
  } catch (error: any) {
    if (error?.code === 'PGRST205') {
      console.error('[loadSyncStateFromSupabase] Table "sync_state" does not exist. Please run the SQL schema from supabase-schema.sql in your Supabase SQL Editor.');
      return { lastSync: 0, isSyncing: false };
    }
    console.error('Error loading sync state from Supabase:', error);
    return { lastSync: 0, isSyncing: false };
  }
}

// Throttling pour limiter les mises à jour de sync_state
let lastSyncStateSave = 0;
let lastSavedState: SyncState | null = null;
const SYNC_STATE_SAVE_THROTTLE = 10000; // 10 secondes minimum entre chaque sauvegarde

// Sauvegarder l'état de synchronisation dans Supabase
async function saveSyncStateToSupabase(state: SyncState): Promise<void> {
  try {
    const now = Date.now();
    const timeSinceLastSave = now - lastSyncStateSave;
    
    // Vérifier si l'état a réellement changé
    const hasStateChanged = !lastSavedState || 
      lastSavedState.isSyncing !== state.isSyncing ||
      lastSavedState.lastSync !== state.lastSync ||
      lastSavedState.syncStartTime !== state.syncStartTime;
    
    // Si l'état n'a pas changé, ne pas sauvegarder
    if (!hasStateChanged) {
      return;
    }
    
    // Si moins de 10 secondes se sont écoulées depuis la dernière sauvegarde, ignorer
    // Sauf si c'est une mise à jour critique (fin de sync ou début de sync)
    const isCriticalUpdate = state.isSyncing !== lastSavedState?.isSyncing || 
                            (!state.isSyncing && state.lastSync > 0 && state.lastSync !== lastSavedState?.lastSync);
    
    if (timeSinceLastSave < SYNC_STATE_SAVE_THROTTLE && !isCriticalUpdate) {
      // Sauvegarder seulement en mémoire pour les mises à jour non critiques
      return;
    }
    
    lastSyncStateSave = now;
    lastSavedState = { ...state };
    
    const supabase = getSupabaseClient();
    
    const { error } = await supabase
      .from('sync_state')
      .upsert({
        key: 'sync_state',
        data: state,
      }, {
        onConflict: 'key',
      });

    if (error) {
      if (error.code === 'PGRST205') {
        console.error('[saveSyncStateToSupabase] Table "sync_state" does not exist. Please run the SQL schema from supabase-schema.sql in your Supabase SQL Editor.');
        return; // Ne pas faire échouer, juste logger l'erreur
      }
      throw error;
    }

    // Invalider le cache du sync state
    try {
      const { cache } = await import('./cache');
      cache.clear(); // Nettoyer tout le cache pour forcer le rechargement
    } catch (cacheError) {
      // Ignorer les erreurs de cache
    }
  } catch (error: any) {
    if (error?.code === 'PGRST205') {
      console.error('[saveSyncStateToSupabase] Table "sync_state" does not exist. Please run the SQL schema from supabase-schema.sql in your Supabase SQL Editor.');
      return; // Ne pas faire échouer, juste logger l'erreur
    }
    console.error('Error saving sync state to Supabase:', error);
  }
}

// Charger le prix depuis Supabase
async function loadPriceFromSupabase(): Promise<TokenPrice | null> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('price')
      .select('data')
      .eq('key', 'price')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return null;
      }
      if (error.code === 'PGRST205') {
        // Table not found
        console.error('[loadPriceFromSupabase] Table "price" does not exist. Please run the SQL schema from supabase-schema.sql in your Supabase SQL Editor.');
        return null;
      }
      throw error;
    }

    return data?.data || null;
  } catch (error: any) {
    if (error?.code === 'PGRST205') {
      console.error('[loadPriceFromSupabase] Table "price" does not exist. Please run the SQL schema from supabase-schema.sql in your Supabase SQL Editor.');
      return null;
    }
    console.error('Error loading price from Supabase:', error);
    return null;
  }
}

// Sauvegarder le prix dans Supabase
async function savePriceToSupabase(price: TokenPrice): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    
    const { error } = await supabase
      .from('price')
      .upsert({
        key: 'price',
        data: price,
      }, {
        onConflict: 'key',
      });

    if (error) {
      if (error.code === 'PGRST205') {
        console.error('[savePriceToSupabase] Table "price" does not exist. Please run the SQL schema from supabase-schema.sql in your Supabase SQL Editor.');
        return; // Ne pas faire échouer, juste logger l'erreur
      }
      throw error;
    }
  } catch (error: any) {
    if (error?.code === 'PGRST205') {
      console.error('[savePriceToSupabase] Table "price" does not exist. Please run the SQL schema from supabase-schema.sql in your Supabase SQL Editor.');
      return; // Ne pas faire échouer, juste logger l'erreur
    }
    console.error('Error saving price to Supabase:', error);
  }
}

// Charger les données historiques depuis Supabase
async function loadHistoryFromSupabase(): Promise<HistoricalDataPoint[]> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('history')
      .select('data')
      .eq('key', 'history')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return [];
      }
      if (error.code === 'PGRST205') {
        // Table not found
        console.error('[loadHistoryFromSupabase] Table "history" does not exist. Please run the SQL schema from supabase-schema.sql in your Supabase SQL Editor.');
        return [];
      }
      throw error;
    }

    return data?.data || [];
  } catch (error: any) {
    if (error?.code === 'PGRST205') {
      console.error('[loadHistoryFromSupabase] Table "history" does not exist. Please run the SQL schema from supabase-schema.sql in your Supabase SQL Editor.');
      return [];
    }
    console.error('Error loading history from Supabase:', error);
    return [];
  }
}

// Sauvegarder les données historiques dans Supabase
async function saveHistoryToSupabase(history: HistoricalDataPoint[]): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    
    const { error } = await supabase
      .from('history')
      .upsert({
        key: 'history',
        data: history,
      }, {
        onConflict: 'key',
      });

    if (error) {
      if (error.code === 'PGRST205') {
        console.error('[saveHistoryToSupabase] Table "history" does not exist. Please run the SQL schema from supabase-schema.sql in your Supabase SQL Editor.');
        return; // Ne pas faire échouer, juste logger l'erreur
      }
      throw error;
    }
  } catch (error: any) {
    if (error?.code === 'PGRST205') {
      console.error('[saveHistoryToSupabase] Table "history" does not exist. Please run the SQL schema from supabase-schema.sql in your Supabase SQL Editor.');
      return; // Ne pas faire échouer, juste logger l'erreur
    }
    console.error('Error saving history to Supabase:', error);
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

// Charger les transfers depuis le fichier local
async function loadTransfersFromFile(): Promise<TransferTransaction[]> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(TRANSFERS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }
    console.error('Error loading stored transfers:', error);
    return [];
  }
}

// Sauvegarder les transfers dans le fichier local
async function saveTransfersToFile(transfers: TransferTransaction[]): Promise<void> {
  try {
    await ensureDataDir();
    const sorted = transfers.sort((a, b) => b.timestamp - a.timestamp);
    await fs.writeFile(TRANSFERS_FILE, JSON.stringify(sorted, null, 2), 'utf-8');
    console.log(`[saveTransfersToFile] Successfully wrote ${transfers.length} transactions to file`);
  } catch (error) {
    console.error('Error saving stored transfers:', error);
    throw error;
  }
}

// Charger l'état de synchronisation depuis le fichier local
async function loadSyncStateFromFile(): Promise<SyncState> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(SYNC_STATE_FILE, 'utf-8');
    const state: SyncState = JSON.parse(data);
    
    // Vérifier si un sync est bloqué depuis trop longtemps (plus de 3 minutes)
    if (state.isSyncing) {
      const now = Date.now();
      const syncStartTime = state.syncStartTime || state.lastSync || now;
      const threeMinutes = 3 * 60 * 1000; // 3 minutes en millisecondes
      
      if (now - syncStartTime > threeMinutes) {
        console.warn('[loadSyncStateFromFile] Sync appears to be stuck, resetting isSyncing flag');
        // Réinitialiser le flag isSyncing
        const resetState: SyncState = {
          lastSync: state.lastSync,
          isSyncing: false,
        };
        // Sauvegarder l'état réinitialisé
        await saveSyncStateToFile(resetState);
        return resetState;
      }
    }
    
    return state;
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

// Charger le prix depuis le fichier local
async function loadPriceFromFile(): Promise<TokenPrice | null> {
  try {
    await ensureDataDir();
    const PRICE_FILE = path.join(STORAGE_DIR, 'price.json');
    const data = await fs.readFile(PRICE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null;
    }
    console.error('Error loading price:', error);
    return null;
  }
}

// Sauvegarder le prix dans le fichier local
async function savePriceToFile(price: TokenPrice): Promise<void> {
  try {
    await ensureDataDir();
    const PRICE_FILE = path.join(STORAGE_DIR, 'price.json');
    await fs.writeFile(PRICE_FILE, JSON.stringify(price, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving price:', error);
  }
}

// Charger les données historiques depuis le fichier local
async function loadHistoryFromFile(): Promise<HistoricalDataPoint[]> {
  try {
    await ensureDataDir();
    const HISTORY_FILE = path.join(STORAGE_DIR, 'history.json');
    const data = await fs.readFile(HISTORY_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }
    console.error('Error loading history from file:', error);
    return [];
  }
}

// Sauvegarder les données historiques dans le fichier local
async function saveHistoryToFile(history: HistoricalDataPoint[]): Promise<void> {
  try {
    await ensureDataDir();
    const HISTORY_FILE = path.join(STORAGE_DIR, 'history.json');
    await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving history to file:', error);
  }
}

// ========== FONCTIONS UNIFIÉES (utilisent Supabase ou File selon l'environnement) ==========

// Charger les mints depuis le stockage (Supabase ou File)
export async function loadStoredMints(): Promise<MintTransaction[]> {
  if (useSupabase()) {
    return loadMintsFromSupabase();
  }
  return loadMintsFromFile();
}

// Sauvegarder les mints dans le stockage (Supabase ou File)
export async function saveStoredMints(mints: MintTransaction[]): Promise<void> {
  if (useSupabase()) {
    await saveMintsToSupabase(mints);
  } else {
    await saveMintsToFile(mints);
  }
}

// Charger les transfers depuis le stockage (Supabase ou File)
export async function loadStoredTransfers(): Promise<TransferTransaction[]> {
  if (useSupabase()) {
    return loadTransfersFromSupabase();
  }
  return loadTransfersFromFile();
}

// Sauvegarder les transfers dans le stockage (Supabase ou File)
export async function saveStoredTransfers(transfers: TransferTransaction[]): Promise<void> {
  if (useSupabase()) {
    await saveTransfersToSupabase(transfers);
  } else {
    await saveTransfersToFile(transfers);
  }
}

// Charger l'état de synchronisation
export async function loadSyncState(): Promise<SyncState> {
  if (useSupabase()) {
    return loadSyncStateFromSupabase();
  }
  return loadSyncStateFromFile();
}

// Sauvegarder l'état de synchronisation
export async function saveSyncState(state: SyncState): Promise<void> {
  if (useSupabase()) {
    await saveSyncStateToSupabase(state);
  } else {
    await saveSyncStateToFile(state);
  }
}

// Charger le prix (unifié Supabase/File)
export async function loadStoredPrice(): Promise<TokenPrice | null> {
  if (useSupabase()) {
    return loadPriceFromSupabase();
  }
  return loadPriceFromFile();
}

// Sauvegarder le prix (unifié Supabase/File)
export async function saveStoredPrice(price: TokenPrice): Promise<void> {
  if (useSupabase()) {
    await savePriceToSupabase(price);
  } else {
    await savePriceToFile(price);
  }
}

// Charger les données historiques (unifié Supabase/File)
export async function loadStoredHistory(): Promise<HistoricalDataPoint[]> {
  if (useSupabase()) {
    return loadHistoryFromSupabase();
  }
  return loadHistoryFromFile();
}

// Sauvegarder les données historiques (unifié Supabase/File)
export async function saveStoredHistory(history: HistoricalDataPoint[]): Promise<void> {
  if (useSupabase()) {
    await saveHistoryToSupabase(history);
  } else {
    await saveHistoryToFile(history);
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

// Supprimer une transaction par signature
export async function removeMintBySignature(signature: string): Promise<{ success: boolean; removed: boolean }> {
  try {
    const existingMints = await loadStoredMints();
    const initialCount = existingMints.length;
    
    // Filtrer pour retirer la transaction avec cette signature
    const filtered = existingMints.filter(m => m.signature !== signature);
    
    if (filtered.length < initialCount) {
      // Sauvegarder les transactions filtrées
      await saveStoredMints(filtered);
      console.log(`[removeMintBySignature] Removed transaction ${signature}. Before: ${initialCount}, After: ${filtered.length}`);
      return { success: true, removed: true };
    }
    
    console.log(`[removeMintBySignature] Transaction ${signature} not found in storage`);
    return { success: true, removed: false };
  } catch (error) {
    console.error('Error removing mint:', error);
    return { success: false, removed: false };
  }
}

// Détecter et supprimer automatiquement les transactions échouées
export async function detectAndRemoveFailedTransactions(): Promise<{ 
  success: boolean; 
  checked: number; 
  failed: number; 
  removed: number;
  failedSignatures: string[];
}> {
  try {
    const { connection } = await import('./solana');
    const existingMints = await loadStoredMints();
    
    console.log(`[detectAndRemoveFailedTransactions] Checking ${existingMints.length} transactions for failures...`);
    
    const failedSignatures: string[] = [];
    let checked = 0;
    const batchSize = 5; // Réduire à 5 pour éviter trop de requêtes simultanées
    const MIN_DELAY = 200; // Augmenter le délai à 200ms entre chaque vérification
    
    // Vérifier les transactions par batch
    for (let i = 0; i < existingMints.length; i += batchSize) {
      const batch = existingMints.slice(i, i + batchSize);
      
      // Vérifier chaque transaction du batch
      for (const mint of batch) {
        try {
          // Délai avant chaque vérification pour respecter les limites RPC (10 req/s)
          if (checked > 0) {
            await new Promise(resolve => setTimeout(resolve, MIN_DELAY));
          }
          
          // Utiliser getSignatureStatus pour vérifier rapidement si la transaction a échoué
          const status = await connection.getSignatureStatus(mint.signature);
          
          checked++;
          
          // Ne supprimer QUE si la transaction a explicitement échoué (err existe et n'est pas null)
          // Ne pas supprimer si status.value est null/undefined (peut être normal pour certaines transactions anciennes)
          // Une transaction réussie a status.value.confirmationStatus défini et err === null
          // Une transaction échouée a status.value.err défini et non-null
          if (status?.value && status.value.err !== null && status.value.err !== undefined) {
            failedSignatures.push(mint.signature);
            console.log(`[detectAndRemoveFailedTransactions] Found failed transaction: ${mint.signature}, err: ${JSON.stringify(status.value.err)}`);
          } else {
            // Transaction valide (err === null) ou status non disponible (on garde par sécurité)
            // Ne pas supprimer les transactions valides ou celles dont le status n'est pas disponible
          }
          
          // Gérer les erreurs 429 avec un délai plus long
          if (status === null && checked % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Pause de 1s tous les 10 checks
          }
        } catch (error: any) {
          console.error(`[detectAndRemoveFailedTransactions] Error checking transaction ${mint.signature}:`, error);
          
          // Si erreur 429, attendre plus longtemps avant de continuer
          if (error?.message?.includes('429') || error?.message?.includes('Too Many Requests')) {
            console.log(`[detectAndRemoveFailedTransactions] Rate limited, waiting 5 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            // Ne pas ajouter à failedSignatures si c'est juste une erreur de rate limit
            continue;
          }
          
          // En cas d'erreur autre, considérer comme potentiellement échouée
          failedSignatures.push(mint.signature);
        }
      }
      
      // Pause entre les batches pour éviter les 429
      if (i + batchSize < existingMints.length) {
        await new Promise(resolve => setTimeout(resolve, 500)); // 500ms entre les batches
      }
    }
    
    // Supprimer les transactions échouées
    let removed = 0;
    if (failedSignatures.length > 0) {
      const filtered = existingMints.filter(m => !failedSignatures.includes(m.signature));
      await saveStoredMints(filtered);
      removed = existingMints.length - filtered.length;
      console.log(`[detectAndRemoveFailedTransactions] Removed ${removed} failed transactions`);
    }
    
    return {
      success: true,
      checked,
      failed: failedSignatures.length,
      removed,
      failedSignatures
    };
  } catch (error) {
    console.error('Error detecting failed transactions:', error);
    return {
      success: false,
      checked: 0,
      failed: 0,
      removed: 0,
      failedSignatures: []
    };
  }
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
    console.log(`[syncMints] Storage mode: ${useSupabase() ? 'Supabase' : 'Local filesystem'}`);
    
    // Si getAll=true, récupérer jusqu'à ~3000 transactions en 2 batches de 1500 (pour éviter timeout Vercel de 300s)
    // Chaque batch de 1500 transactions prend ~200s, bien en dessous du timeout de 300s
    // L'utilisateur peut faire plusieurs syncs successifs pour récupérer progressivement toutes les transactions
    // Sinon, utiliser la limite fournie
    const syncLimit = getAll ? 0 : Math.min(limit, 1000);
    
    const { getMintTransactions } = await import('./solana');
    
    // Récupérer les mints depuis la blockchain
    // Passer les signatures existantes pour ne traiter que les transactions manquantes
    // Cela économise beaucoup de requêtes RPC en évitant de traiter les transactions déjà stockées
    const newMints = await getMintTransactions(syncLimit, existingSignatures);
    
    console.log(`[syncMints] Retrieved ${newMints.length} new transactions from blockchain (only missing ones)`);
    
    // Les transactions retournées sont déjà filtrées (seulement les nouvelles)
    const toAdd = newMints;
    
    console.log(`[syncMints] Found ${toAdd.length} new transactions to add`);
    
    if (toAdd.length > 0) {
      // Fusionner avec les transactions existantes (les nouvelles sont déjà les plus récentes)
      // Trier par timestamp pour maintenir l'ordre
      const updated = [...existingMints, ...toAdd].sort((a, b) => b.timestamp - a.timestamp);
      console.log(`[syncMints] Saving ${updated.length} total transactions...`);
      await saveStoredMints(updated);
      console.log(`[syncMints] Successfully saved ${updated.length} transactions`);
      
      // Rafraîchir le prix après la synchronisation
      let priceData: any = null;
      try {
        const { getTokenPrice } = await import('./solana');
        priceData = await getTokenPrice();
        if (priceData) {
          const price: TokenPrice = {
            price: priceData.price,
            priceInUsd: priceData.priceInUsd,
            solPrice: priceData.solPrice,
            solBalance: priceData.solBalance,
            tokenBalance: priceData.tokenBalance,
            timestamp: Date.now(),
          };
          await saveStoredPrice(price);
          console.log(`[syncMints] Price updated: ${price.priceInUsd ? '$' + price.priceInUsd.toFixed(8) : price.price.toFixed(8) + ' SOL'}`);
        }
      } catch (priceError) {
        console.error('[syncMints] Error updating price:', priceError);
        // Ne pas faire échouer la sync si le prix ne peut pas être mis à jour
      }
      
      // Mettre à jour les données historiques (vérifie automatiquement si 12h se sont écoulées)
      try {
        const totalSolAdded = updated.reduce((sum, m) => sum + m.solAmount, 0);
        const totalTokensAdded = updated.reduce((sum, m) => sum + m.tokenAmount, 0);
        const totalLiquidity = priceData?.solPrice && priceData?.priceInUsd
          ? (totalSolAdded * priceData.solPrice) + (totalTokensAdded * priceData.priceInUsd)
          : null;
        
        await addHistoricalDataPoint({
          totalSolAdded,
          totalTokensAdded,
          totalMints: updated.length,
          tokenPrice: priceData?.price ?? null,
          tokenPriceInUsd: priceData?.priceInUsd ?? null,
          solPrice: priceData?.solPrice ?? null,
          totalLiquidity,
        });
      } catch (historyError) {
        console.error('[syncMints] Error adding historical data point:', historyError);
        // Ne pas faire échouer la sync si l'historique ne peut pas être mis à jour
      }
      
      return { added: toAdd.length, total: updated.length };
    }
    
    console.log(`[syncMints] No new transactions to add`);
    
    // Même s'il n'y a pas de nouvelles transactions, mettre à jour le prix
    let priceData: any = null;
    try {
      const { getTokenPrice } = await import('./solana');
      priceData = await getTokenPrice();
      if (priceData) {
        const price: TokenPrice = {
          price: priceData.price,
          priceInUsd: priceData.priceInUsd,
          solPrice: priceData.solPrice,
          solBalance: priceData.solBalance,
          tokenBalance: priceData.tokenBalance,
          timestamp: Date.now(),
        };
        await saveStoredPrice(price);
        console.log(`[syncMints] Price updated (no new transactions): ${price.priceInUsd ? '$' + price.priceInUsd.toFixed(8) : price.price.toFixed(8) + ' SOL'}`);
      }
    } catch (priceError) {
      console.error('[syncMints] Error updating price:', priceError);
      // Ne pas faire échouer la sync si le prix ne peut pas être mis à jour
    }
    
    // Mettre à jour les données historiques (vérifie automatiquement si 12h se sont écoulées)
    try {
      const totalSolAdded = existingMints.reduce((sum, m) => sum + m.solAmount, 0);
      const totalTokensAdded = existingMints.reduce((sum, m) => sum + m.tokenAmount, 0);
      const totalLiquidity = priceData?.solPrice && priceData?.priceInUsd
        ? (totalSolAdded * priceData.solPrice) + (totalTokensAdded * priceData.priceInUsd)
        : null;
      
      await addHistoricalDataPoint({
        totalSolAdded,
        totalTokensAdded,
        totalMints: existingMints.length,
        tokenPrice: priceData?.price ?? null,
        tokenPriceInUsd: priceData?.priceInUsd ?? null,
        solPrice: priceData?.solPrice ?? null,
        totalLiquidity,
      });
    } catch (historyError) {
      console.error('[syncMints] Error adding historical data point:', historyError);
      // Ne pas faire échouer la sync si l'historique ne peut pas être mis à jour
    }
    
    return { added: 0, total: existingMints.length };
  } catch (error) {
    console.error('Error syncing mints:', error);
    // En cas d'erreur, retourner au moins ce qui est stocké
    const existing = await loadStoredMints();
    return { added: 0, total: existing.length };
  }
}

// Synchroniser les transfers : récupère les nouveaux depuis la blockchain et les ajoute au stockage
export async function syncTransfers(limit: number = 1000, getAll: boolean = false): Promise<{ added: number; total: number }> {
  try {
    // Charger d'abord les transactions existantes pour utiliser le cache
    const existingTransfers = await loadStoredTransfers();
    const existingSignatures = new Set(existingTransfers.map(t => t.signature));
    
    console.log(`[syncTransfers] Starting sync with limit=${limit}, getAll=${getAll}`);
    console.log(`[syncTransfers] Already have ${existingTransfers.length} stored transactions (using as cache)`);
    console.log(`[syncTransfers] Storage mode: ${useSupabase() ? 'Supabase' : 'Local filesystem'}`);
    
    // Utiliser la limite fournie, avec un maximum pour éviter les timeouts
    const syncLimit = getAll ? 10000 : Math.min(limit, 1000);
    
    const { getTransferTransactions } = await import('./solana');
    
    // Récupérer les transfers depuis la blockchain
    const allTransfers = await getTransferTransactions(syncLimit);
    
    // Filtrer seulement les nouvelles transactions
    const newTransfers = allTransfers.filter(t => !existingSignatures.has(t.signature));
    
    console.log(`[syncTransfers] Retrieved ${allTransfers.length} transactions from blockchain, ${newTransfers.length} are new`);
    
    if (newTransfers.length > 0) {
      // Fusionner avec les transactions existantes
      const updated = [...existingTransfers, ...newTransfers].sort((a, b) => b.timestamp - a.timestamp);
      console.log(`[syncTransfers] Saving ${updated.length} total transactions...`);
      await saveStoredTransfers(updated);
      console.log(`[syncTransfers] Successfully saved ${updated.length} transactions`);
  } else {
      console.log(`[syncTransfers] No new transactions to add`);
    }
    
    const total = existingTransfers.length + newTransfers.length;
    return { added: newTransfers.length, total };
  } catch (error) {
    console.error('Error syncing transfers:', error);
    // En cas d'erreur, retourner au moins ce qui est stocké
    const existing = await loadStoredTransfers();
    return { added: 0, total: existing.length };
  }
}

// Ajouter un point de données historique (vérifie si 12h se sont écoulées depuis le dernier point)
export async function addHistoricalDataPoint(data: Omit<HistoricalDataPoint, 'timestamp'>): Promise<void> {
  try {
    const history = await loadStoredHistory();
    const now = Date.now();
    const twelveHours = 12 * 60 * 60 * 1000; // 12 heures en millisecondes
    
    // Vérifier si le dernier point est plus ancien que 12h
    const lastPoint = history[history.length - 1];
    if (lastPoint && (now - lastPoint.timestamp) < twelveHours) {
      console.log('[addHistoricalDataPoint] Less than 12h since last point, skipping');
      return;
    }
    
    // Ajouter le nouveau point
    const newPoint: HistoricalDataPoint = {
      ...data,
      timestamp: now,
    };
    
    history.push(newPoint);
    
    // Garder seulement les 30 derniers jours (60 points à 12h d'intervalle)
    const maxPoints = 60;
    if (history.length > maxPoints) {
      history.splice(0, history.length - maxPoints);
    }
    
    await saveStoredHistory(history);
    console.log(`[addHistoricalDataPoint] Added new data point at ${new Date(now).toISOString()}`);
  } catch (error) {
    console.error('Error adding historical data point:', error);
  }
}
