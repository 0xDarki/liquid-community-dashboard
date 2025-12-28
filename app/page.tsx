'use client';

import React, { useEffect, useState } from 'react';
import StatsCard from '@/components/StatsCard';
import TransactionTable from '@/components/TransactionTable';
import type { MintTransaction, TransferTransaction, PoolStats } from '@/lib/solana';

export default function Dashboard() {
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [mintTransactions, setMintTransactions] = useState<MintTransaction[]>([]);
  const [transferTransactions, setTransferTransactions] = useState<TransferTransaction[]>([]);
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
      const [statsRes, mintsRes, transfersRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/mints?limit=0'), // 0 = toutes les transactions stockées
        fetch('/api/transfers?limit=20'), // Réduit à 20 pour les transfers
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

      const [poolStats, mints, transfers] = await Promise.all([
        statsRes.json(),
        mintsRes.json(),
        transfersRes.json(),
      ]);

      setStats(poolStats);
      setMintTransactions(mints);
      setTransferTransactions(transfers);
      setLastUpdate(new Date());
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

  // Mettre à jour le compte à rebours pour le bouton Sync All
  useEffect(() => {
    const updateCountdown = () => {
      if (lastSyncTime) {
        const now = new Date().getTime();
        const lastSync = lastSyncTime.getTime();
        const twoMinutes = 2 * 60 * 1000; // 2 minutes en millisecondes
        const timeElapsed = now - lastSync;
        const timeRemaining = Math.max(0, twoMinutes - timeElapsed);
        setTimeUntilNextSync(timeRemaining);
      } else {
        setTimeUntilNextSync(0);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000); // Mettre à jour toutes les secondes
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
                Liquidity additions tracking - each liquidity addition is followed by a burn
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
                      alert(`Sync successful: ${data.added} new transactions added. Total: ${data.total}`);
                      setLastSyncTime(new Date()); // Mettre à jour le temps de dernière sync
                      fetchData();
                    } else {
                      alert(`Error: ${data.error || 'Sync failed'}`);
                    }
                  } catch (error) {
                    console.error('Error syncing:', error);
                    alert('Error during synchronization');
                  } finally {
                    setSyncing(false);
                  }
                }}
                disabled={syncing || loading || timeUntilNextSync > 0}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                title={timeUntilNextSync > 0 ? `Please wait ${Math.ceil(timeUntilNextSync / 1000)}s before syncing again` : 'Sync the last 60 transactions'}
              >
                {syncing 
                  ? 'Syncing...' 
                  : timeUntilNextSync > 0 
                    ? `Sync All (${Math.ceil(timeUntilNextSync / 1000)}s)`
                    : 'Sync All'}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span>Last update:</span>
            <span className="font-medium">{lastUpdate.toLocaleTimeString('en-US')}</span>
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
              {(() => {
                // Calculer le prix depuis les balances si le prix n'est pas disponible
                const price = stats.tokenPrice ?? (stats.tokenBalance > 0 && stats.solBalance > 0 ? stats.solBalance / stats.tokenBalance : null);
                const priceSol = stats.tokenPriceSol ?? stats.solBalance;
                const priceToken = stats.tokenPriceToken ?? stats.tokenBalance;
                
                return price != null && price > 0 ? (
                  <StatsCard
                    title="Token Price"
                    value={`${price.toFixed(8)} SOL`}
                    subtitle={`${priceSol.toFixed(4)} SOL / ${priceToken.toLocaleString('en-US', { maximumFractionDigits: 2 })} tokens`}
                  />
                ) : null;
              })()}
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

