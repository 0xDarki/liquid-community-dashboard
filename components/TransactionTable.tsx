import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import en from 'date-fns/locale/en-US';

interface MintTransaction {
  signature: string;
  timestamp: number;
  from: string;
  solAmount: number;
  tokenAmount: number;
}

interface TransferTransaction {
  signature: string;
  timestamp: number;
  from: string;
  to: string;
  tokenAmount: number;
}

interface TransactionTableProps {
  transactions: (MintTransaction | TransferTransaction)[];
  type: 'mint' | 'transfer';
}

export default function TransactionTable({
  transactions,
  type,
}: TransactionTableProps) {
  const formatAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const getExplorerUrl = (signature: string) => {
    return `https://solscan.io/tx/${signature}`;
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">
          {type === 'mint' ? 'Liquidity Addition Transactions' : 'Transfer Transactions'}
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                From
              </th>
              {type === 'transfer' && (
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  To
                </th>
              )}
              {type === 'mint' && (
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  SOL
                </th>
              )}
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                Tokens
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                Signature
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={type === 'mint' ? 6 : 5} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                  No transactions found
                </td>
              </tr>
            ) : (
              transactions.map((tx, index) => {
                if (type === 'mint') {
                  const mintTx = tx as MintTransaction;
                  return (
                    <tr key={index} className="hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 dark:hover:from-blue-900/10 dark:hover:to-indigo-900/10 transition-all duration-200 border-b border-gray-100 dark:border-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                        {formatDistanceToNow(new Date(mintTx.timestamp * 1000), {
                          addSuffix: true,
                          locale: en,
                        })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        <span className="font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs">{formatAddress(mintTx.from)}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-blue-600 dark:text-blue-400">
                        {mintTx.solAmount.toFixed(4)} SOL
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-green-600 dark:text-green-400">
                        {mintTx.tokenAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <a
                          href={getExplorerUrl(mintTx.signature)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 hover:underline font-mono text-xs transition-colors"
                        >
                          {formatAddress(mintTx.signature)}
                        </a>
                      </td>
                    </tr>
                  );
                } else {
                  const transferTx = tx as TransferTransaction;
                  return (
                    <tr key={index} className="hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 dark:hover:from-blue-900/10 dark:hover:to-indigo-900/10 transition-all duration-200 border-b border-gray-100 dark:border-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                        {formatDistanceToNow(new Date(transferTx.timestamp * 1000), {
                          addSuffix: true,
                          locale: en,
                        })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        <span className="font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs">{formatAddress(transferTx.from)}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        <span className="font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs">{formatAddress(transferTx.to)}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-green-600 dark:text-green-400">
                        {transferTx.tokenAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <a
                          href={getExplorerUrl(transferTx.signature)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 hover:underline font-mono text-xs transition-colors"
                        >
                          {formatAddress(transferTx.signature)}
                        </a>
                      </td>
                    </tr>
                  );
                }
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

