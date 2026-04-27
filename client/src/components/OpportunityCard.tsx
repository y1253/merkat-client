import type { ArbitrageOpportunity } from '../types/market.types';

interface Props {
  opportunity: ArbitrageOpportunity;
  onExecute: (op: ArbitrageOpportunity) => void;
}

function fmtDate(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function OpportunityCard({ opportunity, onExecute }: Props) {
  const platformLabel = (p: string) => p === 'polymarket' ? 'Poly' : 'Kalshi';
  const age = Math.round((Date.now() - new Date(opportunity.detectedAt).getTime()) / 1000);
  const pct = (opportunity.profitMargin * 100).toFixed(2);
  const profitCls =
    opportunity.profitMargin >= 0.02
      ? 'bg-green-600'
      : opportunity.profitMargin >= 0.005
      ? 'bg-yellow-500'
      : 'bg-gray-400';

  const polyDate = fmtDate(opportunity.polyClosesAt);
  const kalshiDate = fmtDate(opportunity.kalshiClosesAt);

  const kalshiLink = opportunity.kalshiUrl ?? 'https://kalshi.com/markets';

  return (
    <tr className="hover:bg-gray-50 border-b border-gray-100 text-sm align-top">
      <td className="px-4 py-3" style={{ minWidth: '260px', maxWidth: '360px' }}>
        <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Normalized match</p>
        <p className="font-semibold text-gray-900 leading-snug mb-2">
          {opportunity.pair.canonicalTitle}
        </p>
        <div className="space-y-0.5">
          <p className="text-xs text-gray-400 flex items-baseline gap-1">
            {opportunity.polyUrl ? (
              <a
                href={opportunity.polyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block w-14 font-medium text-purple-600 hover:underline shrink-0"
              >
                Poly ↗
              </a>
            ) : (
              <span className="inline-block w-14 font-medium text-purple-400 shrink-0 cursor-default">
                Poly <span className="text-xs font-normal">(demo)</span>
              </span>
            )}
            <span className="text-gray-600">{opportunity.polyTitle}</span>
            {polyDate && <span className="text-gray-400 shrink-0">· {polyDate}</span>}
          </p>
          <p className="text-xs text-gray-400 flex items-baseline gap-1">
            <a
              href={kalshiLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block w-14 font-medium text-orange-600 hover:underline shrink-0"
            >
              Kalshi ↗
            </a>
            <span className="text-gray-600">{opportunity.kalshiTitle}</span>
            {kalshiDate && <span className="text-gray-400 shrink-0">· {kalshiDate}</span>}
          </p>
        </div>
        <p className="text-xs text-gray-400 mt-1.5">{age}s ago</p>
      </td>
      <td className="px-4 py-3 text-center">
        <div className="text-xs text-gray-500 mb-0.5">{platformLabel(opportunity.legA.platform)}</div>
        <div className="font-semibold">{opportunity.legA.side} <span className="text-gray-700">${opportunity.legA.price.toFixed(3)}</span></div>
      </td>
      <td className="px-4 py-3 text-center">
        <div className="text-xs text-gray-500 mb-0.5">{platformLabel(opportunity.legB.platform)}</div>
        <div className="font-semibold">{opportunity.legB.side} <span className="text-gray-700">${opportunity.legB.price.toFixed(3)}</span></div>
      </td>
      <td className="px-4 py-3 text-center">
        <div className={`inline-flex flex-col items-center px-3 py-2 rounded-lg text-white ${profitCls}`}>
          <span className="text-xs font-medium opacity-80 leading-none mb-0.5">Revenue</span>
          <span className="text-lg font-bold leading-none">+{pct}%</span>
          <span className="text-xs opacity-70 leading-none mt-0.5">per $1</span>
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <button
          onClick={() => onExecute(opportunity)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
        >
          Execute
        </button>
      </td>
    </tr>
  );
}
