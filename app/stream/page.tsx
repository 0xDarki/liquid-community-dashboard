'use client';

import React, { useEffect, useState } from 'react';
import type { MintTransaction, PoolStats } from '@/lib/solana';
import { formatDistanceToNow } from 'date-fns';
import en from 'date-fns/locale/en-US';

export default function StreamPage() {
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [recentMints, setRecentMints] = useState<MintTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const fetchData = async () => {
    try {
      const [statsRes, mintsRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/mints?limit=10'), // Les 10 dernières transactions
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      if (mintsRes.ok) {
        const mintsData = await mintsRes.json();
        // Prendre les 10 plus récentes
        const sortedMints = mintsData
          .sort((a: MintTransaction, b: MintTransaction) => b.timestamp - a.timestamp)
          .slice(0, 10);
        setRecentMints(sortedMints);
      }

      setLastUpdate(new Date());
      setLoading(false);
    } catch (error) {
      console.error('Error fetching stream data:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Mettre à jour toutes les 2 minutes pour le streaming
    const interval = setInterval(fetchData, 2 * 60 * 1000); // 2 minutes = 120000 ms
    return () => clearInterval(interval);
  }, []);

  const formatValue = (value: number | null | undefined, decimals: number = 2): string => {
    if (value === null || value === undefined) return 'N/A';
    return value.toLocaleString('en-US', { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-xl">Loading stream data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent mb-2">
            $LIQUID Live Dashboard
          </h1>
          <p className="text-gray-400 text-sm">
            Last update: {lastUpdate.toLocaleTimeString()}
          </p>
        </div>

        {/* Main Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {/* Token Price */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
            <div className="text-gray-400 text-xs mb-1">Token Price</div>
            <div className="text-2xl font-bold text-blue-400">
              {stats?.tokenPriceInUsd 
                ? `$${formatValue(stats.tokenPriceInUsd, 8)}`
                : 'N/A'}
            </div>
            <div className="text-sm text-gray-500 mt-1">
              {stats?.tokenPrice 
                ? `${formatValue(stats.tokenPrice, 8)} SOL`
                : ''}
            </div>
          </div>

          {/* Market Cap */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
            <div className="text-gray-400 text-xs mb-1">Market Cap</div>
            <div className="text-2xl font-bold text-purple-400">
              {stats?.tokenSupply && stats?.tokenPriceInUsd
                ? `$${formatValue(stats.tokenSupply * stats.tokenPriceInUsd, 0)}`
                : 'N/A'}
            </div>
            <div className="text-sm text-gray-500 mt-1">
              Supply: {stats?.tokenSupply ? formatValue(stats.tokenSupply, 0) : 'N/A'}
            </div>
          </div>

          {/* Total Liquidity */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
            <div className="text-gray-400 text-xs mb-1">Total Liquidity</div>
            <div className="text-2xl font-bold text-green-400">
              {stats?.totalLiquidity
                ? `$${formatValue(stats.totalLiquidity, 0)}`
                : 'N/A'}
            </div>
            <div className="text-sm text-gray-500 mt-1">
              {stats?.totalSolAdded ? `${formatValue(stats.totalSolAdded, 2)} SOL` : ''} +{' '}
              {stats?.totalTokensAdded ? formatValue(stats.totalTokensAdded, 0) : '0'} tokens
            </div>
          </div>

          {/* Market Cap / Liquidity Ratio */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
            <div className="text-gray-400 text-xs mb-1">MC / Liquidity</div>
            <div className="text-2xl font-bold text-yellow-400">
              {stats?.tokenSupply && stats?.tokenPriceInUsd && stats?.totalLiquidity && stats.totalLiquidity > 0
                ? formatValue((stats.tokenSupply * stats.tokenPriceInUsd) / stats.totalLiquidity, 2)
                : 'N/A'}
            </div>
            <div className="text-sm text-gray-500 mt-1">
              {stats?.tokenSupply && stats?.tokenPriceInUsd && stats?.totalLiquidity
                ? `MC: $${formatValue(stats.tokenSupply * stats.tokenPriceInUsd, 0)}`
                : ''}
            </div>
          </div>
        </div>

        {/* Secondary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {/* Total SOL Added */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
            <div className="text-gray-400 text-xs mb-1">Total SOL Added</div>
            <div className="text-xl font-bold text-blue-300">
              {stats?.totalSolAdded ? formatValue(stats.totalSolAdded, 4) : 'N/A'} SOL
            </div>
            <div className="text-sm text-gray-500 mt-1">
              {stats?.totalSolAdded && stats?.solPrice
                ? `$${formatValue(stats.totalSolAdded * stats.solPrice, 0)}`
                : ''}
            </div>
          </div>

          {/* Total Tokens Added */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
            <div className="text-gray-400 text-xs mb-1">Total Tokens Added</div>
            <div className="text-xl font-bold text-green-300">
              {stats?.totalTokensAdded ? formatValue(stats.totalTokensAdded, 0) : 'N/A'}
            </div>
            <div className="text-sm text-gray-500 mt-1">
              {stats?.totalTokensAdded && stats?.tokenPriceInUsd
                ? `$${formatValue(stats.totalTokensAdded * stats.tokenPriceInUsd, 0)}`
                : ''}
            </div>
          </div>

          {/* Tokens Burned */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
            <div className="text-gray-400 text-xs mb-1">Tokens Burned</div>
            <div className="text-xl font-bold text-red-300">
              {stats?.tokenBurned ? formatValue(stats.tokenBurned, 0) : 'N/A'}
            </div>
            <div className="text-sm text-gray-500 mt-1">
              {stats?.tokenBurned
                ? `${formatValue((stats.tokenBurned / 1000000000) * 100, 2)}%`
                : ''}
            </div>
          </div>

          {/* Total Mints */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
            <div className="text-gray-400 text-xs mb-1">Total Mints</div>
            <div className="text-xl font-bold text-purple-300">
              {stats?.totalMints ? formatValue(stats.totalMints, 0) : 'N/A'}
            </div>
            <div className="text-sm text-gray-500 mt-1">
              Liquidity additions
            </div>
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-bold mb-4 text-blue-400">Last 10 Transactions</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-400">Time</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-400">From</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">SOL</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">Tokens</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">Signature</th>
                </tr>
              </thead>
              <tbody>
                {recentMints.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-gray-500">
                      No transactions found
                    </td>
                  </tr>
                ) : (
                  recentMints.map((tx, index) => (
                    <tr key={index} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                      <td className="py-3 px-4 text-sm text-gray-300">
                        {formatDistanceToNow(new Date(tx.timestamp * 1000), {
                          addSuffix: true,
                          locale: en,
                        })}
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <span className="font-mono bg-gray-700 px-2 py-1 rounded text-xs text-blue-300">
                          {formatAddress(tx.from)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-right font-semibold text-blue-400">
                        {formatValue(tx.solAmount, 4)} SOL
                      </td>
                      <td className="py-3 px-4 text-sm text-right font-semibold text-green-400">
                        {formatValue(tx.tokenAmount, 2)}
                      </td>
                      <td className="py-3 px-4 text-sm text-right">
                        <a
                          href={`https://solscan.io/tx/${tx.signature}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs text-purple-400 hover:text-purple-300 underline"
                        >
                          {formatAddress(tx.signature)}
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-gray-500 text-sm">
          <p>Live data updates every 2 minutes</p>
        </div>
      </div>
    </div>
  );
}

