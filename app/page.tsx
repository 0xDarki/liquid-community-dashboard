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
      // Charger seulement les mints et le sync state (tout est dans mints.json)
      const [mintsRes, syncStateRes] = await Promise.all([
        fetch('/api/mints?limit=0'), // 0 = toutes les transactions stockées
        fetch('/api/sync-state'), // Récupérer l'état de synchronisation partagé
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

      const [mints, syncState] = await Promise.all([
        mintsRes.json(),
        syncStateRes.json().catch(() => ({ lastSync: 0, isSyncing: false })),
      ]);

      // Calculer les stats depuis les mints
      const calculatedStats = calculateStatsFromMints(mints);
      const calculatedAverage = calculateAverageStats(mints);

      setMintTransactions(mints);
      setLastUpdate(new Date());
      
      // Mettre à jour le lastSyncTime depuis le sync state partagé
      if (syncState && syncState.lastSync && syncState.lastSync > 0) {
        const timestamp = syncState.lastSync;
        const now = Date.now();
        
        // Détecter si le timestamp est en secondes (10 chiffres) ou millisecondes (13 chiffres)
        // Un timestamp en secondes Unix est généralement entre 1000000000 (2001) et 9999999999 (2286)
        // Un timestamp en millisecondes est généralement > 1000000000000
        if (timestamp < 1000000000000 && timestamp > 1000000000) {
          // Timestamp en secondes (10 chiffres), convertir en millisecondes
          setLastSyncTime(new Date(timestamp * 1000));
        } else {
          // Timestamp en millisecondes (13 chiffres), utiliser tel quel
          setLastSyncTime(new Date(timestamp));
        }
      } else {
        setLastSyncTime(null);
      }

      // Charger les stats avec prix en arrière-plan (non bloquant)
      fetch('/api/stats')
        .then(res => res.json())
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
          // Utiliser les stats calculées si l'API échoue
          setStats(calculatedStats);
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
    const FETCH_INTERVAL = 120000; // 2 minutes entre chaque fetch pour éviter trop de requêtes
    
    const updateCountdown = async () => {
      const now = Date.now();
      // Éviter de faire trop de requêtes en même temps
      if (now - lastFetchTime < FETCH_INTERVAL) {
        // Si moins de 10 secondes se sont écoulées, mettre à jour seulement le compte à rebours local
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
    // Mettre à jour toutes les 5 secondes (mais ne fetch que toutes les 10 secondes)
    const interval = setInterval(updateCountdown, 5000);
    return () => clearInterval(interval);
  }, [lastSyncTime]);

  if (loading && !stats) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Header */}
        <div className="mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
                Liquid Community Dashboard
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Liquidity additions tracking - each liquidity addition is followed by a burn. Built by 0xDarki.
              </p>
            </div>
            <div className="mt-4 md:mt-0 flex items-center gap-3 flex-wrap">
              <button
                onClick={fetchData}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                {loading ? 'Refreshing...' : 'Refresh'}
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
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                    title={
                      isSyncInProgress 
                        ? 'A sync is already in progress' 
                        : timeUntilNextSync > 0 
                          ? `Please wait ${Math.ceil(timeUntilNextSync / 1000)}s before updating again` 
                          : 'Update data from blockchain'
                    }
                  >
                    {syncing || isSyncInProgress
                      ? 'Updating...' 
                      : timeUntilNextSync > 0 
                        ? `Update (${Math.ceil(timeUntilNextSync / 1000)}s)`
                        : 'Update'}
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
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                    title="Recover all transactions from blockchain and sync to Supabase"
                  >
                    {recovering ? 'Recovering...' : 'Recover All'}
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span>Last sync:</span>
            <span className="font-medium">
              {lastSyncTime 
                ? `${lastSyncTime.toLocaleDateString('en-US')} ${lastSyncTime.toLocaleTimeString('en-US')}`
                : 'Never'}
            </span>
          </div>
          {error && (
            <div className="mt-4 p-4 bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 rounded-lg">
              <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
            </div>
          )}
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              <StatsCard
                title="Liquidity Additions"
                value={stats.totalMints.toLocaleString('en-US')}
                subtitle="Total additions"
              />
              <StatsCard
                title="Total SOL Added"
                value={`${stats.totalSolAdded.toFixed(4)} SOL`}
                subtitle="Since the beginning"
              />
              <StatsCard
                title="Total Tokens Added"
                value={stats.totalTokensAdded.toLocaleString('en-US', {
                  maximumFractionDigits: 2,
                })}
                subtitle="Since the beginning"
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
                
                if (priceInSol != null && priceInSol > 0) {
                  return (
                    <StatsCard
                      title="Token Price"
                      value={priceInUsd != null && priceInUsd > 0 
                        ? `$${priceInUsd.toFixed(8)} $LIQUID`
                        : `${priceInSol.toFixed(8)} SOL`}
                      subtitle={priceInUsd != null && priceInUsd > 0
                        ? `${priceInSol.toFixed(8)} SOL ($${solPrice?.toFixed(2) || 'N/A'} SOL)`
                        : `${priceSol.toFixed(4)} SOL / ${priceToken.toLocaleString('en-US', { maximumFractionDigits: 2 })} tokens`}
                    />
                  );
                }
                return null;
              })()}
              {stats.totalLiquidity != null && stats.totalLiquidity > 0 && (
                <StatsCard
                  title="Total Liquidity"
                  value={`$${stats.totalLiquidity.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`}
                  subtitle={`${stats.totalSolAdded.toFixed(4)} SOL × $${stats.solPrice?.toFixed(2) || '0'} + ${stats.totalTokensAdded.toLocaleString('en-US', { maximumFractionDigits: 2 })} $LIQUID × $${stats.tokenPriceInUsd?.toFixed(8) || '0'}`}
                />
              )}
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Liquidity Addition Transactions
            </h2>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {mintTransactions.length} transactions found
            </span>
          </div>
          
          {/* Pagination Controls */}
          {mintTransactions.length > transactionsPerPage && (
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Showing {((currentPage - 1) * transactionsPerPage) + 1} to {Math.min(currentPage * transactionsPerPage, mintTransactions.length)} of {mintTransactions.length} transactions
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Page {currentPage} of {Math.ceil(mintTransactions.length / transactionsPerPage)}
                </span>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(Math.ceil(mintTransactions.length / transactionsPerPage), prev + 1))}
                  disabled={currentPage >= Math.ceil(mintTransactions.length / transactionsPerPage)}
                  className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                >
                  Next
                </button>
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

