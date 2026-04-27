import { useState } from 'react';
import type { ArbitrageOpportunity, ExecuteTradeDto, TradeResult } from '../types/market.types';
import { getSocket } from '../api/socket';

interface Props {
  opportunity: ArbitrageOpportunity;
  onClose: () => void;
  onTradeComplete: (result: TradeResult, positionSize: number) => void;
}

export function TradeModal({ opportunity, onClose, onTradeComplete }: Props) {
  const [size, setSize] = useState('100');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TradeResult | null>(null);

  const positionSize = parseFloat(size) || 0;
  const expectedProfit = (positionSize * opportunity.profitMargin).toFixed(2);
  const totalCost = (positionSize * (opportunity.legA.price + opportunity.legB.price)).toFixed(2);

  const execute = () => {
    if (positionSize <= 0) return;
    setLoading(true);
    const socket = getSocket();

    const dto: ExecuteTradeDto = {
      opportunityId: opportunity.id,
      positionSizeDollars: positionSize,
      legA: opportunity.legA,
      legB: opportunity.legB,
    };

    socket.once('trade:result', (res: TradeResult) => {
      setResult(res);
      setLoading(false);
      onTradeComplete(res, positionSize);
    });

    socket.emit('trade:execute', dto);
  };

  const platformLabel = (p: string) => p.charAt(0).toUpperCase() + p.slice(1);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-lg font-bold text-gray-900">Execute Arbitrage Trade</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 mb-4 text-sm">
          <p className="font-medium text-gray-700 mb-1">Market</p>
          <p className="text-gray-600 text-xs leading-relaxed">{opportunity.pair.canonicalTitle}</p>
        </div>

        {!result ? (
          <>
            <div className="space-y-3 mb-5">
              <div className="flex justify-between items-center bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div>
                  <p className="text-xs text-blue-600 font-medium uppercase tracking-wide">Leg A</p>
                  <p className="font-semibold text-gray-900">
                    BUY {opportunity.legA.side} on {platformLabel(opportunity.legA.platform)}
                  </p>
                </div>
                <span className="text-blue-700 font-bold text-lg">${opportunity.legA.price.toFixed(3)}</span>
              </div>
              <div className="flex justify-between items-center bg-purple-50 border border-purple-200 rounded-lg p-3">
                <div>
                  <p className="text-xs text-purple-600 font-medium uppercase tracking-wide">Leg B</p>
                  <p className="font-semibold text-gray-900">
                    BUY {opportunity.legB.side} on {platformLabel(opportunity.legB.platform)}
                  </p>
                </div>
                <span className="text-purple-700 font-bold text-lg">${opportunity.legB.price.toFixed(3)}</span>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Position size ($)</label>
              <input
                type="number"
                value={size}
                min="1"
                onChange={(e) => setSize(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-5 flex justify-between text-sm">
              <span className="text-gray-600">Expected profit</span>
              <span className="font-bold text-green-700">${expectedProfit} ({(opportunity.profitMargin * 100).toFixed(2)}%)</span>
            </div>
            <div className="text-xs text-gray-500 mb-4">Total cost: ~${totalCost} | Profit guaranteed at settlement</div>

            <button
              onClick={execute}
              disabled={loading || positionSize <= 0}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-bold py-3 rounded-lg transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Executing...
                </span>
              ) : (
                'Execute Both Trades'
              )}
            </button>
          </>
        ) : (
          <div className="space-y-3">
            <div className={`rounded-lg p-4 text-center ${
              result.status === 'SUCCESS' ? 'bg-green-50 border border-green-200' :
              result.status === 'SIMULATED' ? 'bg-orange-50 border border-orange-300' :
              result.status === 'PARTIAL' ? 'bg-yellow-50 border border-yellow-200' :
              'bg-red-50 border border-red-200'
            }`}>
              <p className={`text-xl font-bold mb-1 ${
                result.status === 'SUCCESS' ? 'text-green-700' :
                result.status === 'SIMULATED' ? 'text-orange-700' :
                result.status === 'PARTIAL' ? 'text-yellow-700' :
                'text-red-700'
              }`}>
                {result.status === 'SUCCESS' ? '✓ Trade Executed' :
                 result.status === 'SIMULATED' ? '⚠ NOT Executed — Simulated Only' :
                 result.status === 'PARTIAL' ? '⚠ Partial Fill' :
                 '✗ Trade Failed'}
              </p>
              {result.status === 'SIMULATED' && (
                <p className="text-sm text-orange-600 mt-1">No real orders were placed on any exchange.</p>
              )}
              {result.actualProfitMargin !== undefined && result.status === 'SUCCESS' && (
                <p className="text-sm text-gray-600 mt-1">
                  Locked in ${(positionSize * result.actualProfitMargin).toFixed(2)} profit ({(result.actualProfitMargin * 100).toFixed(2)}%)
                </p>
              )}
              {result.error && (
                <p className="text-sm text-red-600 mt-2 font-mono break-all">{result.error}</p>
              )}
            </div>

            <div className="space-y-2 text-sm">
              {[
                { label: `Leg A (${platformLabel(opportunity.legA.platform)})`, res: result.legAResult },
                { label: `Leg B (${platformLabel(opportunity.legB.platform)})`, res: result.legBResult },
              ].map(({ label, res }) => (
                <div key={label} className={`border rounded-lg p-3 ${
                  !res || res.status === 'FAILED' ? 'border-red-200 bg-red-50' :
                  res.status === 'SIMULATED' ? 'border-orange-200 bg-orange-50' :
                  'border-green-200 bg-green-50'
                }`}>
                  <p className="font-medium text-gray-700 mb-1">{label}</p>
                  {res ? (
                    <>
                      <p className={`font-semibold ${
                        res.status === 'FAILED' ? 'text-red-700' :
                        res.status === 'SIMULATED' ? 'text-orange-700' :
                        'text-green-700'
                      }`}>
                        {res.status}
                        {res.orderId ? ` — #${res.orderId.slice(-8)}` : ''}
                      </p>
                      {res.error && res.status !== 'SIMULATED' && (
                        <p className="text-xs text-red-600 mt-1 font-mono break-all whitespace-pre-wrap">{res.error}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-red-700 font-semibold">FAILED</p>
                  )}
                </div>
              ))}
            </div>

            <button onClick={onClose} className="w-full border border-gray-300 text-gray-700 font-medium py-2 rounded-lg hover:bg-gray-50">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
