interface Props {
  margin: number;
}

export function ProfitBadge({ margin }: Props) {
  const pct = (margin * 100).toFixed(2);
  const cls =
    margin >= 0.02
      ? 'bg-green-100 text-green-800 border-green-300'
      : margin >= 0.005
      ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
      : 'bg-gray-100 text-gray-500 border-gray-300';

  return (
    <span className={`inline-block px-2 py-0.5 rounded border text-sm font-semibold ${cls}`}>
      +{pct}%
    </span>
  );
}
