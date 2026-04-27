import { useEffect, useState } from 'react';
import { getSocket } from '../api/socket';
import { useOpportunitiesStore } from '../store/opportunities.store';
import { OpportunityCard } from '../components/OpportunityCard';
import { TradeModal } from '../components/TradeModal';
import { TradeHistory } from '../components/TradeHistory';
import { ConnectionStatus } from '../components/ConnectionStatus';
import type { ArbitrageOpportunity, TradeResult } from '../types/market.types';

interface Props {
  onLogout: () => void;
}

export function Dashboard({ onLogout }: Props) {
  const { opportunities, history, connected, setConnected, setSnapshot, addOpportunity, removeOpportunity, addHistory } =
    useOpportunitiesStore();
  const [selectedOp, setSelectedOp] = useState<ArbitrageOpportunity | null>(null);
  const [tab, setTab] = useState<'live' | 'history'>('live');

  useEffect(() => {
    const socket = getSocket();

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('auth:failed', () => {
      localStorage.removeItem('token');
      onLogout();
    });
    socket.on('opportunities:snapshot', setSnapshot);
    socket.on('opportunity:new', addOpportunity);
    socket.on('opportunity:expired', ({ id }: { id: string }) => removeOpportunity(id));

    if (socket.connected) setConnected(true);

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('auth:failed');
      socket.off('opportunities:snapshot');
      socket.off('opportunity:new');
      socket.off('opportunity:expired');
    };
  }, []);

  const handleTradeComplete = (result: TradeResult, positionSize: number) => {
    if (selectedOp) {
      addHistory({ result, opportunity: selectedOp, positionSizeDollars: positionSize });
    }
  };

  const sorted = [...opportunities].sort((a, b) => b.profitMargin - a.profitMargin);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Arb Scanner</h1>
          <p className="text-xs text-gray-400">Polymarket × Kalshi</p>
        </div>
        <div className="flex items-center gap-4">
          <ConnectionStatus connected={connected} />
          <button
            onClick={onLogout}
            className="text-sm text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1 rounded-lg"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex-1">
            <p className="text-2xl font-bold text-gray-900">{opportunities.length}</p>
            <p className="text-sm text-gray-500">Live opportunities</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex-1">
            <p className="text-2xl font-bold text-green-700">
              {opportunities.length > 0 ? `+${(Math.max(...opportunities.map((o) => o.profitMargin)) * 100).toFixed(2)}%` : '—'}
            </p>
            <p className="text-sm text-gray-500">Best margin</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex-1">
            <p className="text-2xl font-bold text-gray-900">{history.length}</p>
            <p className="text-sm text-gray-500">Trades executed</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setTab('live')}
              className={`px-6 py-3 text-sm font-medium ${tab === 'live' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Live Opportunities
              {opportunities.length > 0 && (
                <span className="ml-2 bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded-full">
                  {opportunities.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab('history')}
              className={`px-6 py-3 text-sm font-medium ${tab === 'history' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Trade History
            </button>
          </div>

          {tab === 'live' ? (
            sorted.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-gray-400 text-lg mb-2">Scanning markets...</p>
                <p className="text-gray-300 text-sm">
                  {connected ? 'Waiting for arbitrage opportunities to appear' : 'Connecting to server...'}
                </p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-3">Market (Original → Normalized)</th>
                    <th className="px-4 py-3 text-center">Leg A</th>
                    <th className="px-4 py-3 text-center">Leg B</th>
                    <th className="px-4 py-3 text-center">Revenue</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((op) => (
                    <OpportunityCard key={op.id} opportunity={op} onExecute={setSelectedOp} />
                  ))}
                </tbody>
              </table>
            )
          ) : (
            <div className="p-4">
              <TradeHistory history={history} />
            </div>
          )}
        </div>
      </main>

      {selectedOp && (
        <TradeModal
          opportunity={selectedOp}
          onClose={() => setSelectedOp(null)}
          onTradeComplete={(result, size) => {
            handleTradeComplete(result, size);
          }}
        />
      )}
    </div>
  );
}
