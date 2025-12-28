'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { format } from 'date-fns';
import type { MintTransaction } from '@/lib/solana';

interface ChartDataPoint {
  timestamp: number;
  date: string;
  solAdded: number;
  tokensAdded: number;
  transactionCount: number;
  cumulativeSol: number;
  cumulativeTokens: number;
}

interface ModernChartProps {
  transactions: MintTransaction[];
}

export default function ModernChart({ transactions }: ModernChartProps) {
  // Grouper les transactions par intervalles de 1 heure
  const groupBy1Hour = (txs: MintTransaction[]): ChartDataPoint[] => {
    if (txs.length === 0) return [];

    // Trier par timestamp croissant (du plus ancien au plus récent)
    const sorted = [...txs].sort((a, b) => a.timestamp - b.timestamp);

    // Trouver le timestamp de la première transaction
    const firstTimestamp = sorted[0].timestamp;
    
    // Arrondir au début de l'intervalle de 1 heure le plus proche
    const oneHourInSeconds = 60 * 60;
    const startTime = Math.floor(firstTimestamp / oneHourInSeconds) * oneHourInSeconds;

    // Grouper par intervalles de 1 heure
    const groups = new Map<number, MintTransaction[]>();
    
    sorted.forEach(tx => {
      const intervalStart = Math.floor((tx.timestamp - startTime) / oneHourInSeconds) * oneHourInSeconds + startTime;
      if (!groups.has(intervalStart)) {
        groups.set(intervalStart, []);
      }
      groups.get(intervalStart)!.push(tx);
    });

    // Convertir en tableau de points de données
    const dataPoints: ChartDataPoint[] = [];
    let cumulativeSol = 0;
    let cumulativeTokens = 0;

    // Trier les intervalles par timestamp
    const sortedIntervals = Array.from(groups.keys()).sort((a, b) => a - b);

    // Déterminer le format de date basé sur le nombre d'intervalles
    const totalIntervals = sortedIntervals.length;
    const useCompactFormat = totalIntervals > 48;

    sortedIntervals.forEach(intervalStart => {
      const txsInInterval = groups.get(intervalStart)!;
      const solAdded = txsInInterval.reduce((sum, tx) => sum + tx.solAmount, 0);
      const tokensAdded = txsInInterval.reduce((sum, tx) => sum + tx.tokenAmount, 0);
      
      cumulativeSol += solAdded;
      cumulativeTokens += tokensAdded;

      // Format de date plus compact pour l'affichage si beaucoup de données
      const date = new Date(intervalStart * 1000);
      const dateStr = useCompactFormat
        ? format(date, 'MM/dd HH:mm') // Format compact si beaucoup de données
        : format(date, 'MMM dd, HH:mm'); // Format complet si peu de données

      dataPoints.push({
        timestamp: intervalStart,
        date: dateStr,
        solAdded,
        tokensAdded,
        transactionCount: txsInInterval.length,
        cumulativeSol,
        cumulativeTokens,
      });
    });

    return dataPoints;
  };

  const chartData = groupBy1Hour(transactions);

  if (chartData.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Historical Charts (1h intervals)
        </h3>
        <p className="text-gray-500 dark:text-gray-400 text-center py-8">
          {transactions.length === 0 
            ? 'Loading data from Supabase...' 
            : 'No data available for charting'}
        </p>
      </div>
    );
  }

  // Calculer l'intervalle optimal pour l'axe X basé sur le nombre de points
  const getXAxisInterval = () => {
    const dataLength = chartData.length;
    if (dataLength <= 24) return 0; // Afficher tous les points si <= 24 heures
    if (dataLength <= 48) return 1; // Afficher 1 sur 2 si <= 48 heures
    if (dataLength <= 168) return Math.floor(dataLength / 24); // Afficher environ 24 points pour une semaine
    return Math.floor(dataLength / 30); // Afficher environ 30 points pour plus d'une semaine
  };

  const xAxisInterval = getXAxisInterval();

  // Calculer le statut du bot
  const getBotStatus = () => {
    if (transactions.length === 0) {
      return { status: 'unknown', message: 'No data available', color: 'gray' };
    }

    const now = Math.floor(Date.now() / 1000);
    const tenMinutesAgo = now - (10 * 60);
    const oneHourAgo = now - (60 * 60);
    
    // Trier les transactions par timestamp (plus récent en premier)
    const sortedTxs = [...transactions].sort((a, b) => b.timestamp - a.timestamp);
    const lastTransaction = sortedTxs[0];
    
    // Vérifier si une transaction a eu lieu dans les 10 dernières minutes
    const hasRecentTransaction = lastTransaction.timestamp >= tenMinutesAgo;
    
    // Compter les transactions de la dernière heure complète
    const lastHourTransactions = sortedTxs.filter(tx => {
      const txTime = tx.timestamp;
      // Heure complète précédente (pas l'heure en cours)
      const lastCompleteHourStart = Math.floor(now / 3600) * 3600 - 3600;
      const lastCompleteHourEnd = Math.floor(now / 3600) * 3600;
      return txTime >= lastCompleteHourStart && txTime < lastCompleteHourEnd;
    });
    
    // Si l'heure est en cours, vérifier les transactions de l'heure en cours
    const currentHourStart = Math.floor(now / 3600) * 3600;
    const currentHourTransactions = sortedTxs.filter(tx => tx.timestamp >= currentHourStart);
    
    // Si > 10 transactions dans l'heure complète précédente → bot fonctionne
    if (lastHourTransactions.length >= 10) {
      return {
        status: 'operational',
        message: `Bot operational (${lastHourTransactions.length} tx in last hour)`,
        color: 'green',
        txCount: lastHourTransactions.length
      };
    }
    
    // Si l'heure est en cours et qu'il y a eu une transaction dans les 10 dernières minutes → actif
    if (hasRecentTransaction && currentHourTransactions.length > 0) {
      const minutesSinceLastTx = Math.floor((now - lastTransaction.timestamp) / 60);
      return {
        status: 'active',
        message: `Bot active (last tx ${minutesSinceLastTx} min ago, ${currentHourTransactions.length} tx this hour)`,
        color: 'blue',
        txCount: currentHourTransactions.length,
        minutesAgo: minutesSinceLastTx
      };
    }
    
    // Si 10 minutes se sont passées sans transaction → inactif
    if (!hasRecentTransaction) {
      const minutesSinceLastTx = Math.floor((now - lastTransaction.timestamp) / 60);
      return {
        status: 'inactive',
        message: `Bot inactive (no tx in last 10 min, last tx ${minutesSinceLastTx} min ago)`,
        color: 'red',
        minutesAgo: minutesSinceLastTx
      };
    }
    
    // Par défaut, considérer comme actif si des transactions récentes
    return {
      status: 'active',
      message: `Bot active (${currentHourTransactions.length} tx this hour)`,
      color: 'blue',
      txCount: currentHourTransactions.length
    };
  };

  const botStatus = getBotStatus();

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl p-4 border border-gray-200 dark:border-gray-700">
          <p className="font-semibold text-gray-900 dark:text-white mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {entry.value != null ? (typeof entry.value === 'number' 
                ? entry.value.toLocaleString('en-US', { maximumFractionDigits: entry.dataKey === 'solAdded' ? 4 : 2 })
                : entry.value) : 'N/A'}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4">
      {/* Graphique en aires - SOL et Tokens ajoutés */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Liquidity Added Over Time (1h intervals)
          </h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {chartData.length} points
          </span>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 5, bottom: 60 }}>
            <defs>
              <linearGradient id="colorSol" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1}/>
              </linearGradient>
              <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.1}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-300 dark:stroke-gray-700" />
            <XAxis 
              dataKey="date" 
              className="text-gray-600 dark:text-gray-400"
              tick={{ fill: 'currentColor', fontSize: 10 }}
              angle={-45}
              textAnchor="end"
              height={60}
              interval={xAxisInterval}
              minTickGap={8}
            />
            <YAxis 
              yAxisId="left"
              className="text-gray-600 dark:text-gray-400"
              tick={{ fill: 'currentColor', fontSize: 12 }}
              tickFormatter={(value) => `${value.toFixed(2)} SOL`}
              width={80}
            />
            <YAxis 
              yAxisId="right"
              orientation="right"
              className="text-gray-600 dark:text-gray-400"
              tick={{ fill: 'currentColor', fontSize: 12 }}
              tickFormatter={(value) => {
                if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
                return value.toFixed(0);
              }}
              width={80}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="solAdded"
              name="SOL Added"
              stroke="#3b82f6"
              fillOpacity={1}
              fill="url(#colorSol)"
              strokeWidth={2}
              connectNulls={false}
            />
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="tokensAdded"
              name="Tokens Added"
              stroke="#10b981"
              fillOpacity={1}
              fill="url(#colorTokens)"
              strokeWidth={2}
              connectNulls={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Indicateur de statut du bot */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Bot Status
            </h3>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${
              botStatus.color === 'green' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' :
              botStatus.color === 'blue' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300' :
              botStatus.color === 'red' ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300' :
              'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                botStatus.color === 'green' ? 'bg-green-500' :
                botStatus.color === 'blue' ? 'bg-blue-500 animate-pulse' :
                botStatus.color === 'red' ? 'bg-red-500' :
                'bg-gray-500'
              }`}></div>
              <span className="text-sm font-medium capitalize">{botStatus.status}</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {botStatus.message}
            </p>
            {botStatus.txCount !== undefined && (
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                {botStatus.txCount} transactions this hour
              </p>
            )}
            {botStatus.minutesAgo !== undefined && (
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                Last transaction: {botStatus.minutesAgo} min ago
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Graphique cumulatif */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Cumulative Liquidity Over Time
          </h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {chartData.length} points
          </span>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 5, bottom: 60 }}>
            <defs>
              <linearGradient id="colorCumulativeSol" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0.1}/>
              </linearGradient>
              <linearGradient id="colorCumulativeTokens" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.1}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-300 dark:stroke-gray-700" />
            <XAxis 
              dataKey="date" 
              className="text-gray-600 dark:text-gray-400"
              tick={{ fill: 'currentColor', fontSize: 10 }}
              angle={-45}
              textAnchor="end"
              height={60}
              interval={xAxisInterval}
              minTickGap={8}
            />
            <YAxis 
              yAxisId="left"
              className="text-gray-600 dark:text-gray-400"
              tick={{ fill: 'currentColor', fontSize: 12 }}
              tickFormatter={(value) => `${value.toFixed(2)} SOL`}
              width={80}
            />
            <YAxis 
              yAxisId="right"
              orientation="right"
              className="text-gray-600 dark:text-gray-400"
              tick={{ fill: 'currentColor', fontSize: 12 }}
              tickFormatter={(value) => {
                if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
                return value.toFixed(0);
              }}
              width={80}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="cumulativeSol"
              name="Cumulative SOL"
              stroke="#6366f1"
              fillOpacity={1}
              fill="url(#colorCumulativeSol)"
              strokeWidth={2}
            />
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="cumulativeTokens"
              name="Cumulative Tokens"
              stroke="#f59e0b"
              fillOpacity={1}
              fill="url(#colorCumulativeTokens)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

