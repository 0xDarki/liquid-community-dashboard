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
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Liquidity Addition Transactions
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {transactions.length} transaction{transactions.length !== 1 ? 's' : ''} found
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                From
              </th>
              {type === 'transfer' && (
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  To
                </th>
              )}
              {type === 'mint' && (
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  SOL
                </th>
              )}
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Tokens
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
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
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {formatDistanceToNow(new Date(mintTx.timestamp * 1000), {
                          addSuffix: true,
                          locale: en,
                        })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        <span className="font-mono">{formatAddress(mintTx.from)}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {mintTx.solAmount.toFixed(4)} SOL
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {mintTx.tokenAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <a
                          href={getExplorerUrl(mintTx.signature)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-600 dark:text-primary-400 hover:underline font-mono"
                        >
                          {formatAddress(mintTx.signature)}
                        </a>
                      </td>
                    </tr>
                  );
                } else {
                  const transferTx = tx as TransferTransaction;
                  return (
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {formatDistanceToNow(new Date(transferTx.timestamp * 1000), {
                          addSuffix: true,
                          locale: en,
                        })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        <span className="font-mono">{formatAddress(transferTx.from)}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        <span className="font-mono">{formatAddress(transferTx.to)}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {transferTx.tokenAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <a
                          href={getExplorerUrl(transferTx.signature)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-600 dark:text-primary-400 hover:underline font-mono"
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

