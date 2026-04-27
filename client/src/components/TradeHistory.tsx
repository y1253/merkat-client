import type { TradeHistoryEntry } from '../types/market.types';

interface Props {
  history: TradeHistoryEntry[];
}

export function TradeHistory({ history }: Props) {
  if (history.length === 0) {
    return <p className="text-gray-400 text-sm text-center py-8">No trades executed yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b">
            <th className="px-4 py-2">Market</th>
            <th className="px-4 py-2">Size</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2">Profit</th>
            <th className="px-4 py-2">Time</th>
          </tr>
        </thead>
        <tbody>
          {history.map((entry) => {
            const profit = entry.result.actualProfitMargin != null
              ? `$${(entry.positionSizeDollars * entry.result.actualProfitMargin).toFixed(2)}`
              : '—';
            return (
              <tr key={`${entry.result.opportunityId}-${entry.result.executedAt}`} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 max-w-xs truncate" title={entry.opportunity.pair.canonicalTitle}>
                  {entry.opportunity.pair.canonicalTitle}
                </td>
                <td className="px-4 py-2">${entry.positionSizeDollars}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    entry.result.status === 'SUCCESS' ? 'bg-green-100 text-green-700' :
                    entry.result.status === 'PARTIAL' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {entry.result.status}
                  </span>
                </td>
                <td className="px-4 py-2 font-medium text-green-700">{profit}</td>
                <td className="px-4 py-2 text-gray-400">
                  {new Date(entry.result.executedAt).toLocaleTimeString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
