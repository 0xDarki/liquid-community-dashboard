import React from 'react';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'indigo' | 'pink' | 'red';
}

export default function StatsCard({ title, value, subtitle, icon, color = 'blue' }: StatsCardProps) {
  const colorClasses = {
    blue: {
      bg: 'bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20',
      border: 'border-blue-200 dark:border-blue-800/30',
      title: 'text-blue-700 dark:text-blue-300',
      value: 'text-blue-900 dark:text-blue-100',
      subtitle: 'text-blue-600 dark:text-blue-400',
      dot: 'bg-blue-500',
    },
    green: {
      bg: 'bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20',
      border: 'border-green-200 dark:border-green-800/30',
      title: 'text-green-700 dark:text-green-300',
      value: 'text-green-900 dark:text-green-100',
      subtitle: 'text-green-600 dark:text-green-400',
      dot: 'bg-green-500',
    },
    purple: {
      bg: 'bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20',
      border: 'border-purple-200 dark:border-purple-800/30',
      title: 'text-purple-700 dark:text-purple-300',
      value: 'text-purple-900 dark:text-purple-100',
      subtitle: 'text-purple-600 dark:text-purple-400',
      dot: 'bg-purple-500',
    },
    orange: {
      bg: 'bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20',
      border: 'border-orange-200 dark:border-orange-800/30',
      title: 'text-orange-700 dark:text-orange-300',
      value: 'text-orange-900 dark:text-orange-100',
      subtitle: 'text-orange-600 dark:text-orange-400',
      dot: 'bg-orange-500',
    },
    indigo: {
      bg: 'bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/20 dark:to-indigo-800/20',
      border: 'border-indigo-200 dark:border-indigo-800/30',
      title: 'text-indigo-700 dark:text-indigo-300',
      value: 'text-indigo-900 dark:text-indigo-100',
      subtitle: 'text-indigo-600 dark:text-indigo-400',
      dot: 'bg-indigo-500',
    },
    pink: {
      bg: 'bg-gradient-to-br from-pink-50 to-pink-100 dark:from-pink-900/20 dark:to-pink-800/20',
      border: 'border-pink-200 dark:border-pink-800/30',
      title: 'text-pink-700 dark:text-pink-300',
      value: 'text-pink-900 dark:text-pink-100',
      subtitle: 'text-pink-600 dark:text-pink-400',
      dot: 'bg-pink-500',
    },
    red: {
      bg: 'bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20',
      border: 'border-red-200 dark:border-red-800/30',
      title: 'text-red-700 dark:text-red-300',
      value: 'text-red-900 dark:text-red-100',
      subtitle: 'text-red-600 dark:text-red-400',
      dot: 'bg-red-500',
    },
  };

  const colors = colorClasses[color];

  return (
    <div className={`${colors.bg} rounded-xl shadow-lg p-5 border ${colors.border} transition-all duration-200 hover:shadow-xl hover:scale-[1.02]`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-2 h-2 rounded-full ${colors.dot}`}></div>
            <p className={`text-xs font-semibold ${colors.title} uppercase tracking-wide`}>
            {title}
          </p>
          </div>
          <p className={`text-2xl font-bold ${colors.value} mb-1`}>
            {value}
          </p>
          {subtitle && (
            <p className={`text-xs ${colors.subtitle} mt-1`}>
              {subtitle}
            </p>
          )}
        </div>
        {icon && (
          <div className={`ml-4 ${colors.value} opacity-60`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}


















