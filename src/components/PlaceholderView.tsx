/** Placeholder for feature views not yet implemented in their respective phases. */

interface PlaceholderViewProps {
  appName: string;
  phase: string;
}

export function PlaceholderView({ appName, phase }: PlaceholderViewProps) {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-muted)',
      gap: 12,
    }}>
      <svg viewBox="0 0 24 24" width={48} height={48} style={{ fill: 'var(--border)' }}>
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
      </svg>
      <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-secondary)' }}>{appName}</div>
      <div style={{ fontSize: 13 }}>Coming in {phase}</div>
    </div>
  );
}
