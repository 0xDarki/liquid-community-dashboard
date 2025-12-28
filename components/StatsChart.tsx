'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import type { HistoricalDataPoint } from '@/lib/storage';

interface StatsChartProps {
  data: HistoricalDataPoint[];
  title: string;
  dataKey: keyof HistoricalDataPoint;
  color: string;
  formatter?: (value: number) => string;
}

export default function StatsChart({ data, title, dataKey, color, formatter }: StatsChartProps) {
  const chartData = data.map((point) => ({
    ...point,
    date: format(new Date(point.timestamp), 'MM/dd HH:mm'),
  }));

  const formatValue = (value: number) => {
    if (formatter) {
      return formatter(value);
    }
    return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-gray-300 dark:stroke-gray-700" />
          <XAxis 
            dataKey="date" 
            className="text-gray-600 dark:text-gray-400"
            tick={{ fill: 'currentColor' }}
          />
          <YAxis 
            className="text-gray-600 dark:text-gray-400"
            tick={{ fill: 'currentColor' }}
            tickFormatter={formatValue}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
            }}
            formatter={(value: number) => formatValue(value)}
            labelFormatter={(label) => `Date: ${label}`}
          />
          <Legend />
          <Line 
            type="monotone" 
            dataKey={dataKey as string} 
            stroke={color} 
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

