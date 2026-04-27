interface Props {
  connected: boolean;
}

export function ConnectionStatus({ connected }: Props) {
  return (
    <div className="flex items-center gap-1.5 text-sm">
      <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
      <span className={connected ? 'text-green-700' : 'text-red-600'}>
        {connected ? 'Live' : 'Disconnected'}
      </span>
    </div>
  );
}
