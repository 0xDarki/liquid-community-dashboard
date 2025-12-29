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
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950 text-white p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-20 w-20 border-4 border-transparent border-t-blue-500 border-r-purple-500 mx-auto mb-6"></div>
          <p className="text-2xl font-semibold text-gray-300">Loading stream data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950 text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-4xl font-extrabold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              $LIQUID Live Dashboard
            </h1>
            <div className="flex items-center gap-2 px-4 py-2 bg-gray-800/60 backdrop-blur-md rounded-full border border-gray-700/50">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-sm text-gray-300 font-medium">Live</span>
            </div>
          </div>
          <p className="text-gray-400 text-base">
            Last update: <span className="text-gray-300 font-semibold">{lastUpdate.toLocaleTimeString()}</span>
          </p>
        </div>

        {/* Main Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
          {/* Token Price */}
          <div className="group relative bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50 shadow-2xl hover:border-blue-500/50 transition-all duration-300 hover:shadow-blue-500/20">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/0 to-blue-500/0 group-hover:from-blue-500/5 group-hover:to-transparent rounded-2xl transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-gray-400 text-sm font-medium mb-3 uppercase tracking-wide">Token Price</div>
              <div className="text-3xl font-bold text-blue-400 mb-2">
                {stats?.tokenPriceInUsd 
                  ? `$${formatValue(stats.tokenPriceInUsd, 8)}`
                  : 'N/A'}
              </div>
              <div className="text-base text-gray-400 font-medium">
                {stats?.tokenPrice 
                  ? `${formatValue(stats.tokenPrice, 8)} SOL`
                  : ''}
              </div>
            </div>
          </div>

          {/* Market Cap */}
          <div className="group relative bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50 shadow-2xl hover:border-purple-500/50 transition-all duration-300 hover:shadow-purple-500/20">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/0 to-purple-500/0 group-hover:from-purple-500/5 group-hover:to-transparent rounded-2xl transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-gray-400 text-sm font-medium mb-3 uppercase tracking-wide">Market Cap</div>
              <div className="text-3xl font-bold text-purple-400 mb-2">
                {stats?.tokenSupply && stats?.tokenPriceInUsd
                  ? `$${formatValue(stats.tokenSupply * stats.tokenPriceInUsd, 0)}`
                  : 'N/A'}
              </div>
              <div className="text-base text-gray-400 font-medium">
                Supply: <span className="text-gray-300">{stats?.tokenSupply ? formatValue(stats.tokenSupply, 0) : 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* Total Liquidity */}
          <div className="group relative bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50 shadow-2xl hover:border-green-500/50 transition-all duration-300 hover:shadow-green-500/20">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/0 to-green-500/0 group-hover:from-green-500/5 group-hover:to-transparent rounded-2xl transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-gray-400 text-sm font-medium mb-3 uppercase tracking-wide">Total Liquidity</div>
              <div className="text-3xl font-bold text-green-400 mb-2">
                {stats?.totalLiquidity
                  ? `$${formatValue(stats.totalLiquidity, 0)}`
                  : 'N/A'}
              </div>
              <div className="text-base text-gray-400 font-medium">
                {stats?.totalSolAdded ? `${formatValue(stats.totalSolAdded, 2)} SOL` : ''} +{' '}
                {stats?.totalTokensAdded ? formatValue(stats.totalTokensAdded, 0) : '0'} tokens
              </div>
            </div>
          </div>

          {/* Market Cap / Liquidity Ratio */}
          <div className="group relative bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50 shadow-2xl hover:border-yellow-500/50 transition-all duration-300 hover:shadow-yellow-500/20">
            <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/0 to-yellow-500/0 group-hover:from-yellow-500/5 group-hover:to-transparent rounded-2xl transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-gray-400 text-sm font-medium mb-3 uppercase tracking-wide">MC / Liquidity</div>
              <div className="text-3xl font-bold text-yellow-400 mb-2">
                {stats?.tokenSupply && stats?.tokenPriceInUsd && stats?.totalLiquidity && stats.totalLiquidity > 0
                  ? formatValue((stats.tokenSupply * stats.tokenPriceInUsd) / stats.totalLiquidity, 2)
                  : 'N/A'}
              </div>
              <div className="text-base text-gray-400 font-medium">
                {stats?.tokenSupply && stats?.tokenPriceInUsd && stats?.totalLiquidity
                  ? `MC: $${formatValue(stats.tokenSupply * stats.tokenPriceInUsd, 0)}`
                  : ''}
              </div>
            </div>
          </div>
        </div>

        {/* Secondary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
          {/* Total SOL Added */}
          <div className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 backdrop-blur-xl rounded-xl p-5 border border-gray-700/30 shadow-lg">
            <div className="text-gray-400 text-xs font-semibold mb-2 uppercase tracking-wider">Total SOL Added</div>
            <div className="text-2xl font-bold text-blue-300 mb-1">
              {stats?.totalSolAdded ? formatValue(stats.totalSolAdded, 4) : 'N/A'} <span className="text-lg text-blue-400">SOL</span>
            </div>
            <div className="text-sm text-gray-400 font-medium">
              {stats?.totalSolAdded && stats?.solPrice
                ? `$${formatValue(stats.totalSolAdded * stats.solPrice, 0)}`
                : ''}
            </div>
          </div>

          {/* Total Tokens Added */}
          <div className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 backdrop-blur-xl rounded-xl p-5 border border-gray-700/30 shadow-lg">
            <div className="text-gray-400 text-xs font-semibold mb-2 uppercase tracking-wider">Total Tokens Added</div>
            <div className="text-2xl font-bold text-green-300 mb-1">
              {stats?.totalTokensAdded ? formatValue(stats.totalTokensAdded, 0) : 'N/A'}
            </div>
            <div className="text-sm text-gray-400 font-medium">
              {stats?.totalTokensAdded && stats?.tokenPriceInUsd
                ? `$${formatValue(stats.totalTokensAdded * stats.tokenPriceInUsd, 0)}`
                : ''}
            </div>
          </div>

          {/* Tokens Burned */}
          <div className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 backdrop-blur-xl rounded-xl p-5 border border-gray-700/30 shadow-lg">
            <div className="text-gray-400 text-xs font-semibold mb-2 uppercase tracking-wider">Tokens Burned</div>
            <div className="text-2xl font-bold text-red-300 mb-1">
              {stats?.tokenBurned ? formatValue(stats.tokenBurned, 0) : 'N/A'}
            </div>
            <div className="text-sm text-gray-400 font-medium">
              {stats?.tokenBurned
                ? `${formatValue((stats.tokenBurned / 1000000000) * 100, 2)}% of supply`
                : ''}
            </div>
          </div>

          {/* Total Mints */}
          <div className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 backdrop-blur-xl rounded-xl p-5 border border-gray-700/30 shadow-lg">
            <div className="text-gray-400 text-xs font-semibold mb-2 uppercase tracking-wider">Total Mints</div>
            <div className="text-2xl font-bold text-purple-300 mb-1">
              {stats?.totalMints ? formatValue(stats.totalMints, 0) : 'N/A'}
            </div>
            <div className="text-sm text-gray-400 font-medium">
              Liquidity additions
            </div>
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-xl rounded-2xl p-8 border border-gray-700/50 shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              Last 10 Transactions
            </h2>
            <div className="px-3 py-1 bg-blue-500/20 rounded-full border border-blue-500/30">
              <span className="text-xs font-semibold text-blue-300 uppercase tracking-wider">Live</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700/50">
                  <th className="text-left py-4 px-5 text-sm font-bold text-gray-300 uppercase tracking-wider">Time</th>
                  <th className="text-left py-4 px-5 text-sm font-bold text-gray-300 uppercase tracking-wider">From</th>
                  <th className="text-right py-4 px-5 text-sm font-bold text-gray-300 uppercase tracking-wider">SOL</th>
                  <th className="text-right py-4 px-5 text-sm font-bold text-gray-300 uppercase tracking-wider">Tokens</th>
                  <th className="text-right py-4 px-5 text-sm font-bold text-gray-300 uppercase tracking-wider">Signature</th>
                </tr>
              </thead>
              <tbody>
                {recentMints.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-gray-500 text-lg">
                      No transactions found
                    </td>
                  </tr>
                ) : (
                  recentMints.map((tx, index) => (
                    <tr 
                      key={index} 
                      className="border-b border-gray-700/30 hover:bg-gray-800/50 transition-all duration-200 group"
                    >
                      <td className="py-4 px-5 text-base text-gray-200 font-medium">
                        {formatDistanceToNow(new Date(tx.timestamp * 1000), {
                          addSuffix: true,
                          locale: en,
                        })}
                      </td>
                      <td className="py-4 px-5 text-base">
                        <span className="font-mono bg-gray-800/80 px-3 py-1.5 rounded-lg text-sm text-blue-300 border border-gray-700/50 group-hover:border-blue-500/50 transition-colors">
                          {formatAddress(tx.from)}
                        </span>
                      </td>
                      <td className="py-4 px-5 text-base text-right font-bold text-blue-400">
                        {formatValue(tx.solAmount, 4)} <span className="text-sm text-blue-500">SOL</span>
                      </td>
                      <td className="py-4 px-5 text-base text-right font-bold text-green-400">
                        {formatValue(tx.tokenAmount, 2)}
                      </td>
                      <td className="py-4 px-5 text-base text-right">
                        <a
                          href={`https://solscan.io/tx/${tx.signature}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-sm text-purple-400 hover:text-purple-300 underline decoration-purple-500/50 hover:decoration-purple-400 transition-colors"
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
        <div className="mt-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800/40 backdrop-blur-sm rounded-full border border-gray-700/30">
            <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
            <p className="text-sm text-gray-400 font-medium">
              Live data updates every <span className="text-gray-300 font-semibold">2 minutes</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
