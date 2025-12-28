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

  // Calculer le statut du bot avec détection des périodes d'inactivité basée sur les heures
  const getBotStatus = () => {
    if (transactions.length === 0) {
      return { 
        status: 'unknown', 
        message: 'No data available', 
        color: 'gray',
        downtimePeriods: [],
        uptimeDuration: null
      };
    }

    const now = Math.floor(Date.now() / 1000);
    const oneHourInSeconds = 60 * 60;
    const tenMinutesAgo = now - (10 * 60);
    
    // Trier les transactions par timestamp (plus ancien en premier)
    const sortedTxs = [...transactions].sort((a, b) => a.timestamp - b.timestamp);
    const lastTransaction = sortedTxs[sortedTxs.length - 1];
    
    // Trouver la première et dernière heure avec des transactions
    const firstTxHour = Math.floor(sortedTxs[0].timestamp / 3600);
    const lastTxHour = Math.floor(lastTransaction.timestamp / 3600);
    const currentHour = Math.floor(now / 3600);
    
    // Grouper les transactions par heure et marquer chaque heure comme active/inactive
    const hourStatus = new Map<number, { active: boolean; txCount: number; start: number }>();
    
    // Parcourir toutes les heures de la première transaction à maintenant
    for (let hour = firstTxHour; hour <= currentHour; hour++) {
      const hourStart = hour * 3600;
      const hourEnd = hourStart + 3600;
      
      // Compter les transactions dans cette heure
      const hourTxs = sortedTxs.filter(tx => tx.timestamp >= hourStart && tx.timestamp < hourEnd);
      const isActive = hourTxs.length >= 5;
      
      hourStatus.set(hour, {
        active: isActive,
        txCount: hourTxs.length,
        start: hourStart
      });
    }
    
    // Détecter les périodes d'inactivité (heures inactives consécutives)
    const downtimePeriods: Array<{ start: number; end: number; duration: number }> = [];
    let currentDowntimeStart: number | null = null;
    
    for (let hour = firstTxHour; hour <= currentHour; hour++) {
      const status = hourStatus.get(hour);
      if (!status) continue;
      
      if (!status.active) {
        // Heure inactive - démarrer ou continuer une période de downtime
        if (currentDowntimeStart === null) {
          currentDowntimeStart = status.start;
        }
      } else {
        // Heure active - terminer la période de downtime si elle existe
        if (currentDowntimeStart !== null) {
          const downtimeEnd = status.start;
          downtimePeriods.push({
            start: currentDowntimeStart,
            end: downtimeEnd,
            duration: downtimeEnd - currentDowntimeStart
          });
          currentDowntimeStart = null;
        }
      }
    }
    
    // Si on est encore dans une période de downtime (heure actuelle inactive)
    const currentHourStatus = hourStatus.get(currentHour);
    if (currentDowntimeStart !== null && currentHourStatus && !currentHourStatus.active) {
      downtimePeriods.push({
        start: currentDowntimeStart,
        end: now,
        duration: now - currentDowntimeStart
      });
    }
    
    // Déterminer le statut actuel (déclarer d'abord les variables nécessaires)
    const lastCompleteHourStart = Math.floor(now / 3600) * 3600 - 3600;
    const lastCompleteHourEnd = Math.floor(now / 3600) * 3600;
    const lastHourTransactions = sortedTxs.filter(tx => {
      return tx.timestamp >= lastCompleteHourStart && tx.timestamp < lastCompleteHourEnd;
    });
    
    const currentHourStart = Math.floor(now / 3600) * 3600;
    const currentHourTransactions = sortedTxs.filter(tx => tx.timestamp >= currentHourStart);
    const hasRecentTransaction = lastTransaction.timestamp >= tenMinutesAgo;
    
    // Calculer la durée de fonctionnement continu (heures actives consécutives)
    let uptimeDuration: number | null = null;
    let uptimeStart: number | null = null;
    
    // Vérifier si le bot est actuellement actif (basé sur les transactions récentes ou l'heure actuelle)
    const isCurrentlyActive = (currentHourStatus && currentHourStatus.active) || 
                              (hasRecentTransaction && currentHourTransactions.length > 0);
    
    // Parcourir de la fin vers le début pour trouver le début de l'uptime actuel
    // On commence par vérifier l'heure actuelle si elle est active, sinon l'heure précédente
    let startHour = currentHour;
    let shouldIncludeCurrentHour = false;
    
    // Si l'heure actuelle a des transactions récentes mais pas encore 5, on peut quand même la considérer
    if (hasRecentTransaction && currentHourTransactions.length > 0) {
      shouldIncludeCurrentHour = true;
    } else if (currentHourStatus && currentHourStatus.active) {
      shouldIncludeCurrentHour = true;
    } else {
      // Si l'heure actuelle n'est pas active, commencer par l'heure précédente
      startHour = currentHour - 1;
    }
    
    // Parcourir les heures pour trouver le début de l'uptime
    // On parcourt de l'heure actuelle (ou précédente) vers le début
    for (let hour = startHour; hour >= firstTxHour; hour--) {
      const status = hourStatus.get(hour);
      
      // Si c'est l'heure actuelle et qu'on doit l'inclure
      if (hour === currentHour && shouldIncludeCurrentHour) {
        // L'heure actuelle a des transactions récentes, la considérer comme active
        // Si on n'a pas encore trouvé de début, cette heure sera le début
        if (!uptimeStart) {
          uptimeStart = currentHourStart;
        }
        // Continuer à chercher en arrière pour voir s'il y a des heures actives précédentes
        continue;
      }
      
      if (!status) {
        // Si pas de statut pour cette heure, continuer
        continue;
      }
      
      if (status.active) {
        // Heure active - mettre à jour le début de l'uptime
        uptimeStart = status.start;
      } else {
        // Heure inactive - arrêter la recherche
        break;
      }
    }
    
    // Si on n'a pas trouvé de début mais que l'heure actuelle doit être incluse
    if (!uptimeStart && shouldIncludeCurrentHour) {
      uptimeStart = currentHourStart;
    }
    
    // Calculer l'uptime si on a trouvé un début
    if (uptimeStart !== null) {
      if (isCurrentlyActive || shouldIncludeCurrentHour) {
        // Le bot est actuellement actif, calculer jusqu'à maintenant
        uptimeDuration = now - uptimeStart;
      } else {
        // Le bot n'est pas actuellement actif, calculer jusqu'à la fin de la dernière heure active
        const lastActiveHour = startHour;
        const lastActiveStatus = hourStatus.get(lastActiveHour);
        if (lastActiveStatus && lastActiveStatus.active) {
          uptimeDuration = (lastActiveHour + 1) * 3600 - uptimeStart;
        } else if (uptimeStart) {
          // Fallback: calculer depuis le début trouvé jusqu'à maintenant
          uptimeDuration = now - uptimeStart;
        }
      }
    }
    
    // S'assurer que l'uptime est calculé si possible (fallback final)
    if (!uptimeDuration && uptimeStart !== null) {
      // Si on a un début mais pas de durée, calculer depuis le début jusqu'à maintenant
      uptimeDuration = now - uptimeStart;
    }
    
    // Si toujours pas d'uptime mais que le bot est actif, utiliser la première transaction comme début
    if (!uptimeDuration && (isCurrentlyActive || shouldIncludeCurrentHour) && sortedTxs.length > 0) {
      uptimeStart = sortedTxs[0].timestamp;
      uptimeDuration = now - uptimeStart;
    }
    
    // Debug: vérifier que l'uptime est calculé
    if (process.env.NODE_ENV === 'development') {
      console.log('[BotStatus] Uptime calculation:', {
        uptimeDuration,
        uptimeStart,
        isCurrentlyActive,
        shouldIncludeCurrentHour,
        hasRecentTransaction,
        currentHourTransactions: currentHourTransactions.length
      });
    }
    
    // Si >= 5 transactions dans l'heure complète précédente → bot fonctionne
    if (lastHourTransactions.length >= 5) {
      return {
        status: 'operational',
        message: `Bot operational (${lastHourTransactions.length} tx in last hour)`,
        color: 'green',
        txCount: lastHourTransactions.length,
        downtimePeriods: downtimePeriods.slice(-5), // Dernières 5 périodes d'inactivité
        uptimeDuration
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
        minutesAgo: minutesSinceLastTx,
        downtimePeriods: downtimePeriods.slice(-5),
        uptimeDuration
      };
    }
    
    // Si 10 minutes se sont passées sans transaction → inactif
    if (!hasRecentTransaction) {
      const minutesSinceLastTx = Math.floor((now - lastTransaction.timestamp) / 60);
      return {
        status: 'inactive',
        message: `Bot inactive (no tx in last 10 min, last tx ${minutesSinceLastTx} min ago)`,
        color: 'red',
        minutesAgo: minutesSinceLastTx,
        downtimePeriods: downtimePeriods.slice(-5),
        uptimeDuration: null
      };
    }
    
    // Par défaut, considérer comme actif si des transactions récentes
    return {
      status: 'active',
      message: `Bot active (${currentHourTransactions.length} tx this hour)`,
      color: 'blue',
      txCount: currentHourTransactions.length,
      downtimePeriods: downtimePeriods.slice(-5),
      uptimeDuration
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
        <div className="space-y-3">
          {/* Statut actuel */}
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

          {/* Durée de fonctionnement continu */}
          {botStatus.uptimeDuration !== null && botStatus.uptimeDuration > 0 && (
            <div className="flex items-center gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Uptime:</span>
              <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                {(() => {
                  const hours = Math.floor(botStatus.uptimeDuration / 3600);
                  const minutes = Math.floor((botStatus.uptimeDuration % 3600) / 60);
                  const days = Math.floor(hours / 24);
                  if (days > 0) {
                    const remainingHours = hours % 24;
                    return `${days}d ${remainingHours}h ${minutes}m`;
                  }
                  if (hours > 0) {
                    return `${hours}h ${minutes}m`;
                  }
                  return `${minutes}m`;
                })()}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-500">
                (running continuously)
              </span>
            </div>
          )}

          {/* Périodes d'inactivité */}
          {botStatus.downtimePeriods && botStatus.downtimePeriods.length > 0 && (
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Recent downtime periods:
                </span>
                <span className="text-xs text-red-600 dark:text-red-400 font-semibold">
                  {botStatus.downtimePeriods.length}
                </span>
              </div>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {botStatus.downtimePeriods.map((downtime, index) => {
                  const startDate = new Date(downtime.start * 1000);
                  const endDate = new Date(downtime.end * 1000);
                  const durationMinutes = Math.floor(downtime.duration / 60);
                  const durationHours = Math.floor(durationMinutes / 60);
                  const durationStr = durationHours > 0 
                    ? `${durationHours}h ${durationMinutes % 60}m`
                    : `${durationMinutes}m`;
                  
                  return (
                    <div key={index} className="flex items-center justify-between text-xs bg-red-50 dark:bg-red-900/20 px-2 py-1.5 rounded">
                      <div className="flex items-center gap-2">
                        <span className="text-red-600 dark:text-red-400">●</span>
                        <span className="text-gray-700 dark:text-gray-300">
                          {format(startDate, 'MMM dd, HH:mm')} - {format(endDate, 'MMM dd, HH:mm')}
                        </span>
                      </div>
                      <span className="text-red-700 dark:text-red-400 font-medium">
                        {durationStr}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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

