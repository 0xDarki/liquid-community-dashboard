'use client';

import React, { useEffect, useState } from 'react';
import StatsCard from '@/components/StatsCard';
import TransactionTable from '@/components/TransactionTable';
import ModernChart from '@/components/ModernChart';
import type { MintTransaction, PoolStats } from '@/lib/solana';

export default function Dashboard() {
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [mintTransactions, setMintTransactions] = useState<MintTransaction[]>([]);
  const [averageStats, setAverageStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [timeUntilNextSync, setTimeUntilNextSync] = useState<number>(0);
  const [isSyncInProgress, setIsSyncInProgress] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [transactionsPerPage] = useState(20);
  const [isAuthorizedDomain, setIsAuthorizedDomain] = useState<boolean>(true);
  
  // Vérifier si on est sur le domaine autorisé
  useEffect(() => {
    const checkDomain = async () => {
      if (typeof window === 'undefined') return;
      
      try {
        // Méthode 1: Vérifier via une route API (plus fiable)
        const res = await fetch('/api/auth/check-domain');
        if (res.ok) {
          const data = await res.json();
          setIsAuthorizedDomain(data.authorized || false);
          console.log('[Domain Check]', data);
          return;
        }
      } catch (error) {
        console.warn('[Domain Check] API check failed, using fallback:', error);
      }
      
      // Méthode 2: Fallback - vérifier directement le hostname
      try {
        const authorizedDomain = process.env.NEXT_PUBLIC_AUTHORIZED_DOMAIN;
        
        // Si aucun domaine n'est configuré, autoriser toutes les requêtes (pour le développement)
        if (!authorizedDomain || authorizedDomain.trim() === '') {
          console.log('[Domain Check] No authorized domain configured, allowing all domains');
          setIsAuthorizedDomain(true);
          return;
        }
        
        const currentHost = window.location.hostname.toLowerCase();
        const normalizedAuthorized = authorizedDomain.replace(/^https?:\/\//, '').split(':')[0].toLowerCase().trim();
        const normalizedCurrent = currentHost.replace(/^https?:\/\//, '').split(':')[0].toLowerCase().trim();
        
        const isAuthorized = normalizedCurrent === normalizedAuthorized || 
                             normalizedCurrent.endsWith(`.${normalizedAuthorized}`);
        
        console.log('[Domain Check]', {
          current: normalizedCurrent,
          authorized: normalizedAuthorized,
          isAuthorized,
        });
        
        setIsAuthorizedDomain(isAuthorized);
      } catch (error) {
        console.error('[Domain Check] Error in fallback check:', error);
        // En cas d'erreur, autoriser par défaut (pour le développement)
        setIsAuthorizedDomain(true);
      }
    };
    
    checkDomain();
  }, []);

  // Calculer les stats depuis les transactions mints
  const calculateStatsFromMints = (mints: MintTransaction[]): PoolStats => {
    const totalSolAdded = mints.reduce((sum, m) => sum + m.solAmount, 0);
    const totalTokensAdded = mints.reduce((sum, m) => sum + m.tokenAmount, 0);
    
    return {
      solBalance: 0, // Sera mis à jour par l'API stats si disponible
      tokenBalance: 0,
      totalMints: mints.length,
      totalTransfers: 0,
      totalSolAdded,
      totalTokensAdded,
      totalTokensTransferred: 0,
      tokenSupply: null,
      tokenBurned: null,
      tokenPrice: null,
      tokenPriceInUsd: null,
      solPrice: null,
      tokenPriceSol: null,
      tokenPriceToken: null,
      totalLiquidity: null,
    };
  };

  // Calculer les stats moyennes depuis les transactions mints
  const calculateAverageStats = (mints: MintTransaction[]) => {
    const now = Math.floor(Date.now() / 1000);
    const twentyFourHoursAgo = now - (24 * 60 * 60);
    const recentMints = mints.filter(m => m.timestamp >= twentyFourHoursAgo);
    
    if (recentMints.length === 0) {
      return null;
    }
    
    const totalSolAdded = recentMints.reduce((sum, m) => sum + m.solAmount, 0);
    const totalTokensAdded = recentMints.reduce((sum, m) => sum + m.tokenAmount, 0);
    const firstTransactionTime = Math.min(...recentMints.map(m => m.timestamp));
    const lastTransactionTime = Math.max(...recentMints.map(m => m.timestamp));
    const hoursElapsed = Math.max(1, (lastTransactionTime - firstTransactionTime) / 3600);
    
    return {
      success: true,
      totalTransactions: recentMints.length,
      totalSolAdded,
      totalTokensAdded,
      averageSolPerHour24h: totalSolAdded / 24,
      averageTokensPerHour24h: totalTokensAdded / 24,
      hoursElapsed,
    };
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Charger les mints et les prix depuis la base de données
      // Le sync state est géré séparément par le useEffect dédié toutes les 30 secondes
      const [mintsRes, priceRes] = await Promise.all([
        fetch('/api/mints?limit=0'), // 0 = toutes les transactions stockées
        fetch('/api/price').catch(() => null), // Charger les prix depuis la base de données
      ]);

      // Vérifier les erreurs de connexion
      if (!mintsRes.ok) {
        if (mintsRes.status === 0) {
          throw new Error('CONNECTION_REFUSED');
        }
        if (mintsRes.status === 429) {
          throw new Error('429');
        }
        if (mintsRes.status === 503) {
          throw new Error('503');
        }
        const errorData = await mintsRes.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch data from API');
      }

      const [mints, priceData] = await Promise.all([
        mintsRes.json(),
        priceRes?.json().catch(() => null) || Promise.resolve(null),
      ]);

      // Calculer les stats depuis les mints
      const calculatedStats = calculateStatsFromMints(mints);
      const calculatedAverage = calculateAverageStats(mints);

      setMintTransactions(mints);
      setLastUpdate(new Date());
      
      // Fusionner les stats calculées avec les prix depuis la base de données
      const statsWithPrice = {
        ...calculatedStats,
        tokenPrice: priceData?.price ?? null,
        tokenPriceInUsd: priceData?.priceInUsd ?? null,
        solPrice: priceData?.solPrice ?? null,
        tokenPriceSol: priceData?.solBalance ?? null,
        tokenPriceToken: priceData?.tokenBalance ?? null,
        // Calculer totalLiquidity si on a les prix
        totalLiquidity: priceData?.priceInUsd && priceData?.solPrice
          ? (calculatedStats.totalSolAdded * priceData.solPrice) + (calculatedStats.totalTokensAdded * priceData.priceInUsd)
          : null,
      };
      
      // Définir immédiatement les stats avec les prix depuis la base de données
      setStats(statsWithPrice);

      // Charger les stats avec prix en arrière-plan (non bloquant)
      fetch('/api/stats')
        .then(res => {
          if (!res.ok) {
            throw new Error(`API returned ${res.status}`);
          }
          return res.json();
        })
        .then(poolStats => {
          // Fusionner les stats calculées avec les stats de l'API (prix, balances)
          setStats({
            ...calculatedStats,
            ...poolStats,
            totalMints: calculatedStats.totalMints,
            totalSolAdded: calculatedStats.totalSolAdded,
            totalTokensAdded: calculatedStats.totalTokensAdded,
          });
        })
        .catch(err => {
          console.error('Error fetching stats (non-blocking):', err);
          // Si l'API échoue, définir tokenBurned et tokenSupply à 0 pour éviter "Loading..." indéfini
          setStats(prevStats => ({
            ...prevStats!,
            tokenSupply: prevStats?.tokenSupply ?? 0,
            tokenBurned: prevStats?.tokenBurned ?? 0,
          }));
        });

      setAverageStats(calculatedAverage);
    } catch (error) {
      console.error('Error fetching data:', error);
      if (error instanceof Error) {
        if (error.message === 'CONNECTION_REFUSED' || error.message.includes('Failed to fetch')) {
          setError('Unable to connect to server. Make sure the Next.js server is running (npm run dev).');
        } else if (error.message.includes('429') || error.message === '429') {
          setError('Too many requests (429). Please configure a private RPC in .env.local or wait a few moments.');
        } else if (error.message.includes('503') || error.message === '503' || error.message.includes('Service Unavailable')) {
          setError('RPC service unavailable (503). The public RPC is overloaded. Please configure a private RPC in .env.local.');
        } else {
          setError(`Error: ${error.message}`);
        }
      } else {
        setError('Error loading data. Check your RPC connection.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Rafraîchir toutes les 2 minutes (augmenté pour réduire la charge sur le RPC)
    const interval = setInterval(fetchData, 120000);
    return () => clearInterval(interval);
  }, []);

  // Mettre à jour le compte à rebours pour le bouton Update en utilisant le sync state partagé
  useEffect(() => {
    let lastFetchTime = 0;
    const FETCH_INTERVAL = 30000; // 30 secondes entre chaque fetch
    
    const updateCountdown = async () => {
      const now = Date.now();
      // Éviter de faire trop de requêtes en même temps
      if (now - lastFetchTime < FETCH_INTERVAL) {
        // Si moins de 30 secondes se sont écoulées, mettre à jour seulement le compte à rebours local
        if (lastSyncTime) {
          const timeElapsed = now - lastSyncTime.getTime();
          const twoMinutes = 2 * 60 * 1000;
          const timeRemaining = Math.max(0, twoMinutes - timeElapsed);
          setTimeUntilNextSync(timeRemaining);
        }
        return;
      }
      
      lastFetchTime = now;
      
      try {
        // Récupérer le sync state partagé depuis le serveur
        const res = await fetch('/api/sync-state');
        if (res.ok) {
          const syncState = await res.json();
          
          // Mettre à jour l'état de sync en cours
          setIsSyncInProgress(syncState.isSyncing || false);
          
          // Si une sync est en cours, bloquer le bouton
          if (syncState.isSyncing) {
            setTimeUntilNextSync(Infinity); // Bloquer indéfiniment tant que sync en cours
          } else if (syncState && syncState.lastSync && syncState.lastSync > 0) {
            // Utiliser les données du serveur si disponibles
            if (syncState.timeRemaining !== undefined) {
              setTimeUntilNextSync(syncState.timeRemaining * 1000); // Convertir en millisecondes
            } else {
              // Calculer localement si timeRemaining n'est pas disponible
              const now = Date.now();
              const lastSync = syncState.lastSync;
              const twoMinutes = 2 * 60 * 1000; // 2 minutes en millisecondes
              const timeElapsed = now - lastSync;
              const timeRemaining = Math.max(0, twoMinutes - timeElapsed);
              setTimeUntilNextSync(timeRemaining);
            }
            
            // Mettre à jour le lastSyncTime local
            const timestamp = syncState.lastSync;
            // Détecter si le timestamp est en secondes (10 chiffres) ou millisecondes (13 chiffres)
            if (timestamp < 1000000000000 && timestamp > 1000000000) {
              // Timestamp en secondes (10 chiffres), convertir en millisecondes
              setLastSyncTime(new Date(timestamp * 1000));
            } else {
              // Timestamp en millisecondes (13 chiffres), utiliser tel quel
              setLastSyncTime(new Date(timestamp));
            }
          } else {
            setTimeUntilNextSync(0);
            // Ne pas réinitialiser lastSyncTime si on a déjà une valeur valide
          }
        }
      } catch (error) {
        console.error('Error fetching sync state:', error);
      }
    };

    updateCountdown();
    // Mettre à jour toutes les 30 secondes
    const interval = setInterval(updateCountdown, 30000);
    return () => clearInterval(interval);
  }, []); // Ne pas dépendre de lastSyncTime pour éviter les réexécutions inutiles

  if (loading && !stats) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-200 dark:border-gray-700 border-t-blue-600 dark:border-t-blue-400 mx-auto mb-6"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 bg-blue-600 dark:bg-blue-400 rounded-full animate-pulse"></div>
            </div>
          </div>
          <p className="text-lg font-semibold text-gray-700 dark:text-gray-300 mt-4">Loading dashboard...</p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">Fetching data from Supabase</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 border border-gray-200 dark:border-gray-700 mb-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent mb-2">
                  Liquid Community Dashboard
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Liquidity additions tracking - each liquidity addition is followed by a burn. Tek built by @leyten. Dashboard built by @0xDarki.
                </p>
              </div>
              <div className="mt-4 md:mt-0 flex items-center gap-3 flex-wrap">
                <button
                  onClick={fetchData}
                  disabled={loading}
                  className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-sm font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Refreshing...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Refresh
                    </span>
                  )}
                </button>
              {/* Debug: Afficher l'état d'autorisation (à retirer en production) */}
              {process.env.NODE_ENV === 'development' && (
                <span className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">
                  Auth: {isAuthorizedDomain ? '✓' : '✗'} | Domain: {typeof window !== 'undefined' ? window.location.hostname : 'N/A'}
                </span>
              )}
              {isAuthorizedDomain && (
                <>
                  <button
                    onClick={async () => {
                      setSyncing(true);
                      try {
                        const res = await fetch('/api/mints/sync?limit=60');
                        const data = await res.json();
                        if (res.ok && data.success) {
                          // Le sync state est maintenant mis à jour côté serveur
                          // Attendre un peu pour que le sync state soit bien sauvegardé
                          await new Promise(resolve => setTimeout(resolve, 500));
                          // Rafraîchir toutes les données pour qu'elles soient à jour
                          await fetchData();
                        } else {
                          // Gérer les erreurs 429 (Too Many Requests) et 403 (Forbidden)
                          if (res.status === 403) {
                            alert('Unauthorized: This action is only available on the private domain');
                          } else if (res.status === 429) {
                            const message = data.timeRemaining 
                              ? `Please wait ${data.timeRemaining} seconds before updating again. ${data.error || ''}`
                              : data.error || 'Please wait before updating again';
                            alert(message);
                          } else {
                            alert(`Error: ${data.error || 'Update failed'}`);
                          }
                        }
                      } catch (error) {
                        console.error('Error updating:', error);
                        alert('Error during update');
                      } finally {
                        setSyncing(false);
                      }
                    }}
                    disabled={syncing || loading || isSyncInProgress || timeUntilNextSync > 0 || recovering}
                    className="px-5 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-sm font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95"
                    title={
                      isSyncInProgress 
                        ? 'A sync is already in progress' 
                        : timeUntilNextSync > 0 
                          ? `Please wait ${Math.ceil(timeUntilNextSync / 1000)}s before updating again` 
                          : 'Update data from blockchain'
                    }
                  >
                    {syncing || isSyncInProgress ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Updating...
                      </span>
                    ) : timeUntilNextSync > 0 ? (
                      `Update (${Math.ceil(timeUntilNextSync / 1000)}s)`
                    ) : (
                      <span className="flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Update
                      </span>
                    )}
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm('This will recover ALL transactions from the blockchain and may take several minutes. Continue?')) {
                        return;
                      }
                      setRecovering(true);
                      try {
                        const res = await fetch('/api/mints/recover', { method: 'POST' });
                        const data = await res.json();
                        if (res.ok && data.success) {
                          alert(`Recovery successful: ${data.added} transactions recovered. Total: ${data.total}. ${data.message || ''}`);
                          // Attendre un peu pour que le sync state soit bien sauvegardé
                          await new Promise(resolve => setTimeout(resolve, 500));
                          // Rafraîchir toutes les données pour qu'elles soient à jour
                          await fetchData();
                        } else {
                          if (res.status === 403) {
                            alert('Unauthorized: This action is only available on the private domain');
                          } else if (res.status === 429) {
                            alert(`Error: ${data.message || data.error || 'Recovery failed due to rate limiting'}`);
                          } else {
                            alert(`Error: ${data.error || data.message || 'Recovery failed'}`);
                          }
                        }
                      } catch (error) {
                        console.error('Error recovering:', error);
                        alert('Error during recovery');
                      } finally {
                        setRecovering(false);
                      }
                    }}
                    disabled={syncing || loading || recovering || isSyncInProgress}
                    className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl hover:from-amber-600 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-sm font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95"
                    title="Recover all transactions from blockchain and sync to Supabase"
                  >
                    {recovering ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Recovering...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Recover All
                      </span>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Last sync:</span>
            </div>
            <span className="text-xs font-semibold text-gray-900 dark:text-white">
              {lastSyncTime 
                ? `${lastSyncTime.toLocaleDateString('en-US')} ${lastSyncTime.toLocaleTimeString('en-US')}`
                : 'Never'}
            </span>
          </div>
          {error && (
            <div className="mt-4 p-4 bg-gradient-to-r from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/30 border border-red-300 dark:border-red-700 rounded-xl shadow-lg">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-red-800 dark:text-red-200 text-sm font-medium">{error}</p>
              </div>
            </div>
          )}
          </div>
        </div>

        {/* Stats Cards */}
        {loading ? (
          <div className="mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 border border-gray-200 dark:border-gray-700">
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-2"></div>
                  <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-2"></div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 border border-gray-200 dark:border-gray-700">
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-2"></div>
                  <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-2"></div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 border border-gray-200 dark:border-gray-700">
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-2"></div>
                  <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-2"></div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 border border-gray-200 dark:border-gray-700">
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-2"></div>
                  <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-2"></div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 border border-gray-200 dark:border-gray-700">
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-2"></div>
                  <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-2"></div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
                </div>
              </div>
            </div>
          </div>
        ) : stats && (
          <div className="mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatsCard
                title="Liquidity Additions"
                value={stats.totalMints.toLocaleString('en-US')}
                subtitle="Total additions"
                color="indigo"
              />
              <StatsCard
                title="Total SOL Added"
                value={`${stats.totalSolAdded.toFixed(4)} SOL`}
                subtitle="Since the beginning"
                color="blue"
              />
              <StatsCard
                title="Total Tokens Added"
                value={stats.totalTokensAdded.toLocaleString('en-US', {
                  maximumFractionDigits: 2,
                })}
                subtitle="Since the beginning"
                color="green"
              />
              <StatsCard
                title="$LIQUID Supply Burn"
                value={stats.tokenBurned != null
                  ? stats.tokenBurned > 0
                    ? stats.tokenBurned.toLocaleString('en-US', {
                        maximumFractionDigits: 2,
                      })
                    : '0'
                  : 'Loading...'}
                subtitle={stats.tokenBurned != null
                  ? stats.tokenSupply != null
                    ? `${stats.tokenSupply.toLocaleString('en-US', { maximumFractionDigits: 0 })} / 1,000,000,000 supply`
                    : 'Calculating supply...'
                  : stats.tokenSupply != null
                    ? `${stats.tokenSupply.toLocaleString('en-US', { maximumFractionDigits: 0 })} / 1,000,000,000 supply`
                    : 'Calculating...'}
                color="red"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
            {(() => {
                // Afficher le prix depuis Jupiter API ou calculer depuis les balances
                const priceInSol = stats.tokenPrice ?? (stats.tokenBalance > 0 && stats.solBalance > 0 ? stats.solBalance / stats.tokenBalance : null);
                const priceInUsd = stats.tokenPriceInUsd;
                const solPrice = stats.solPrice;
                const priceSol = stats.tokenPriceSol ?? stats.solBalance;
                const priceToken = stats.tokenPriceToken ?? stats.tokenBalance;
                
                // Toujours afficher la carte Token Price, même si les prix ne sont pas encore disponibles
                return (
                  <StatsCard
                    title="Token Price"
                    value={priceInUsd != null && priceInUsd > 0 
                      ? `$${priceInUsd.toFixed(8)} $LIQUID`
                      : priceInSol != null && priceInSol > 0
                        ? `${priceInSol.toFixed(8)} SOL`
                        : 'Loading...'}
                    subtitle={priceInUsd != null && priceInUsd > 0
                      ? `${priceInSol?.toFixed(8) || '0'} SOL ($${solPrice?.toFixed(2) || 'N/A'} SOL)`
                      : priceInSol != null && priceInSol > 0
                        ? `${priceSol > 0 ? priceSol.toFixed(4) : '0'} SOL / ${priceToken > 0 ? priceToken.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0'} tokens`
                        : 'Fetching price data...'}
                    color="purple"
                  />
                );
              })()}
              <StatsCard
                title="Total Liquidity"
                value={stats.totalLiquidity != null && stats.totalLiquidity > 0 && stats.solPrice != null && stats.tokenPriceInUsd != null
                  ? (() => {
                      const solValue = stats.totalSolAdded * stats.solPrice;
                      const tokenValue = stats.totalTokensAdded * stats.tokenPriceInUsd;
                      
                      // Formater les valeurs en k si nécessaire
                      const formatValue = (val: number): string => {
                        if (val >= 1000000) {
                          return `${(val / 1000000).toFixed(1)}M$`;
                        } else if (val >= 1000) {
                          return `${(val / 1000).toFixed(1)}k$`;
                        } else {
                          return `$${val.toFixed(2)}`;
                        }
                      };
                      
                      const formattedSolValue = formatValue(solValue);
                      const formattedTokenValue = formatValue(tokenValue);
                      const formattedTotal = formatValue(stats.totalLiquidity);
                      
                      return `${formattedSolValue} SOL + ${formattedTokenValue} $LIQUID = ${formattedTotal}`;
                    })()
                  : stats.totalLiquidity != null && stats.totalLiquidity > 0
                    ? `$${stats.totalLiquidity.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}`
                    : 'Loading...'}
                subtitle={stats.totalLiquidity != null && stats.totalLiquidity > 0 && stats.solPrice != null && stats.tokenPriceInUsd != null
                  ? (() => {
                      const solValue = stats.totalSolAdded * stats.solPrice;
                      const tokenValue = stats.totalTokensAdded * stats.tokenPriceInUsd;
                      return `${stats.totalSolAdded.toFixed(4)} SOL × $${stats.solPrice.toFixed(2)} + ${stats.totalTokensAdded.toLocaleString('en-US', { maximumFractionDigits: 1 })} $LIQUID × $${stats.tokenPriceInUsd.toFixed(8)}`;
                    })()
                  : stats.totalLiquidity != null && stats.totalLiquidity > 0
                    ? `${stats.totalSolAdded.toFixed(4)} SOL × $${stats.solPrice?.toFixed(2) || '0'} + ${stats.totalTokensAdded.toLocaleString('en-US', { maximumFractionDigits: 2 })} $LIQUID × $${stats.tokenPriceInUsd?.toFixed(8) || '0'}`
                    : 'Calculating liquidity...'}
                color="orange"
              />
            </div>
          </div>
        )}

        {/* Modern Chart - 6h intervals */}
        {mintTransactions.length > 0 && (
          <div className="mb-6">
            <ModernChart transactions={mintTransactions} />
          </div>
        )}


        {/* Transactions */}
        <div className="mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-5 border border-gray-200 dark:border-gray-700 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                  Liquidity Addition Transactions
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  All mint transactions from the liquidity pool
                </p>
              </div>
              <div className="px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800/30">
                <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                  {mintTransactions.length} transactions
                </span>
              </div>
            </div>
          </div>
          
          {/* Pagination Controls */}
          {mintTransactions.length > transactionsPerPage && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 border border-gray-200 dark:border-gray-700 mb-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Showing <span className="font-semibold text-gray-900 dark:text-white">{((currentPage - 1) * transactionsPerPage) + 1}</span> to <span className="font-semibold text-gray-900 dark:text-white">{Math.min(currentPage * transactionsPerPage, mintTransactions.length)}</span> of <span className="font-semibold text-gray-900 dark:text-white">{mintTransactions.length}</span> transactions
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-sm font-medium shadow-sm hover:shadow-md"
                  >
                    Previous
                  </button>
                  <div className="px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800/30">
                    <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                      Page {currentPage} of {Math.ceil(mintTransactions.length / transactionsPerPage)}
                    </span>
                  </div>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(Math.ceil(mintTransactions.length / transactionsPerPage), prev + 1))}
                    disabled={currentPage >= Math.ceil(mintTransactions.length / transactionsPerPage)}
                    className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-sm font-medium shadow-sm hover:shadow-md"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
          
          <TransactionTable
            transactions={mintTransactions.slice(
              (currentPage - 1) * transactionsPerPage,
              currentPage * transactionsPerPage
            )}
            type="mint"
          />
        </div>

        {/* Adresses importantes */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
            Important Addresses
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <span className="font-medium text-gray-700 dark:text-gray-300 block mb-1">LP Pool</span>
              <span className="font-mono text-primary-600 dark:text-primary-400 break-all">
                5DXmqgrTivkdwg43UMU1YSV5WAvVmgvjBxsVP1aLV4Dk
              </span>
            </div>
            <div>
              <span className="font-medium text-gray-700 dark:text-gray-300 block mb-1">Token Mint</span>
              <span className="font-mono text-primary-600 dark:text-primary-400 break-all">
                J2kvsjCVGmKYH5nqo9X7VJGH2jpmKkNdzAaYUfKspump
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

