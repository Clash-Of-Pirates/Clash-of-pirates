import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface CopyChipProps {
  label: string;
  value: string;
  display?: string;
}

function truncateMiddle(value: string): string {
  if (value.length <= 13) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function CopyChip({ label, value, display }: CopyChipProps) {
  const [copied, setCopied] = useState(false);
  const text = display ?? truncateMiddle(value);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(id);
  }, [copied]);

  return (
    <button
      type="button"
      className={`copy-chip ${copied ? 'copied' : ''}`}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
      }}
      title={`Copy ${label}`}
    >
      <span className="copy-chip-label">{label}</span>
      <span className="copy-chip-value">{text}</span>
      <span className="copy-chip-icon">{copied ? <Check size={14} /> : <Copy size={14} />}</span>
    </button>
  );
}
