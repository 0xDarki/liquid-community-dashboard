'use client';

import React, { useEffect, useState } from 'react';
import StatsCard from '@/components/StatsCard';
import TransactionTable from '@/components/TransactionTable';
import StatsChart from '@/components/StatsChart';
import ModernChart from '@/components/ModernChart';
import type { MintTransaction, TransferTransaction, PoolStats } from '@/lib/solana';
import type { HistoricalDataPoint } from '@/lib/storage';

export default function Dashboard() {
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [mintTransactions, setMintTransactions] = useState<MintTransaction[]>([]);
  const [transferTransactions, setTransferTransactions] = useState<TransferTransaction[]>([]);
  const [history, setHistory] = useState<HistoricalDataPoint[]>([]);
  const [averageStats, setAverageStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [timeUntilNextSync, setTimeUntilNextSync] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [transactionsPerPage] = useState(20);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Récupérer toutes les transactions MINT stockées
      // Ne pas synchroniser automatiquement pour éviter trop de requêtes
      // La synchronisation peut être faite manuellement via /api/mints/sync
      const [statsRes, mintsRes, transfersRes, historyRes, averageRes, syncStateRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/mints?limit=0'), // 0 = toutes les transactions stockées
        fetch('/api/transfers?limit=20'), // Réduit à 20 pour les transfers
        fetch('/api/history'),
        fetch('/api/stats/average'),
        fetch('/api/sync-state'), // Récupérer l'état de synchronisation partagé
      ]);

      // Vérifier les erreurs de connexion
      if (!statsRes.ok || !mintsRes.ok || !transfersRes.ok) {
        // Vérifier si c'est une erreur de connexion
        if (statsRes.status === 0 || mintsRes.status === 0 || transfersRes.status === 0) {
          throw new Error('CONNECTION_REFUSED');
        }
        
        // Vérifier les erreurs 429
        if (statsRes.status === 429 || mintsRes.status === 429 || transfersRes.status === 429) {
          throw new Error('429');
        }
        
        // Vérifier les erreurs 503
        if (statsRes.status === 503 || mintsRes.status === 503 || transfersRes.status === 503) {
          throw new Error('503');
        }
        
        const errorData = await statsRes.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch data from API');
      }

      const [poolStats, mints, transfers, historyData, averageData, syncState] = await Promise.all([
        statsRes.json(),
        mintsRes.json(),
        transfersRes.json(),
        historyRes.json().catch(() => []), // Si l'API history échoue, utiliser un tableau vide
        averageRes.json().catch(() => null), // Si l'API average échoue, utiliser null
        syncStateRes.json().catch(() => ({ lastSync: 0, isSyncing: false })), // Si l'API sync-state échoue, utiliser des valeurs par défaut
      ]);

      setStats(poolStats);
      setMintTransactions(mints);
      setTransferTransactions(transfers);
      setHistory(historyData);
      setAverageStats(averageData);
      setLastUpdate(new Date());
      
      // Mettre à jour le lastSyncTime depuis le sync state partagé
      if (syncState && syncState.lastSync && syncState.lastSync > 0) {
        setLastSyncTime(new Date(syncState.lastSync));
      } else {
        // Si pas de sync state, vérifier dans le useEffect qui se charge aussi
        setLastSyncTime(null);
      }
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
    const updateCountdown = async () => {
      try {
        // Récupérer le sync state partagé depuis le serveur
        const res = await fetch('/api/sync-state');
        if (res.ok) {
          const syncState = await res.json();
          console.log('Sync state received:', syncState); // Debug
          if (syncState && syncState.lastSync && syncState.lastSync > 0) {
            const now = Date.now();
            const lastSync = syncState.lastSync;
            const twoMinutes = 2 * 60 * 1000; // 2 minutes en millisecondes
            const timeElapsed = now - lastSync;
            const timeRemaining = Math.max(0, twoMinutes - timeElapsed);
            setTimeUntilNextSync(timeRemaining);
            
            // Mettre à jour le lastSyncTime local
            setLastSyncTime(new Date(lastSync));
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
    const interval = setInterval(updateCountdown, 5000); // Mettre à jour toutes les 5 secondes
    return () => clearInterval(interval);
  }, []);

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
                      alert(`Error: ${data.error || 'Update failed'}`);
                    }
                  } catch (error) {
                    console.error('Error updating:', error);
                    alert('Error during update');
                  } finally {
                    setSyncing(false);
                  }
                }}
                disabled={syncing || loading || timeUntilNextSync > 0}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                title={timeUntilNextSync > 0 ? `Please wait ${Math.ceil(timeUntilNextSync / 1000)}s before updating again` : 'Update data from blockchain'}
              >
                {syncing 
                  ? 'Updating...' 
                  : timeUntilNextSync > 0 
                    ? `Update (${Math.ceil(timeUntilNextSync / 1000)}s)`
                    : 'Update'}
              </button>
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

        {/* Average Stats (Last 24h) */}
        {averageStats && averageStats.success && (
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Average Liquidity Addition (Last 24 Hours)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatsCard
                title="Average SOL/Hour"
                value={`${averageStats.averageSolPerHour24h.toFixed(6)} SOL`}
                subtitle={`Total: ${averageStats.totalSolAdded.toFixed(4)} SOL (${averageStats.totalTransactions} transactions)`}
              />
              <StatsCard
                title="Average $LIQUID/Hour"
                value={averageStats.averageTokensPerHour24h.toLocaleString('en-US', {
                  maximumFractionDigits: 2,
                })}
                subtitle={`Total: ${averageStats.totalTokensAdded.toLocaleString('en-US', { maximumFractionDigits: 2 })} $LIQUID`}
              />
              <StatsCard
                title="Transactions (24h)"
                value={averageStats.totalTransactions.toLocaleString('en-US')}
                subtitle={`Over ${averageStats.hoursElapsed.toFixed(1)} hours`}
              />
              <StatsCard
                title="Rate"
                value={`${(averageStats.totalTransactions / 24).toFixed(2)}/hour`}
                subtitle={`${averageStats.totalTransactions} transactions in 24h`}
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

        {/* Historical Charts - Hidden for now */}
        {false && history.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Historical Statistics (12h intervals)
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <StatsChart
                data={history}
                title="Total SOL Added Over Time"
                dataKey="totalSolAdded"
                color="#3b82f6"
                formatter={(value) => `${value.toFixed(4)} SOL`}
              />
              <StatsChart
                data={history}
                title="Total Tokens Added Over Time"
                dataKey="totalTokensAdded"
                color="#10b981"
                formatter={(value) => value.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              />
              <StatsChart
                data={history}
                title="Total Liquidity Over Time"
                dataKey="totalLiquidity"
                color="#8b5cf6"
                formatter={(value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              />
              <StatsChart
                data={history}
                title="Token Price (USD) Over Time"
                dataKey="tokenPriceInUsd"
                color="#f59e0b"
                formatter={(value) => `$${value.toFixed(8)}`}
              />
            </div>
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

