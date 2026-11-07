/** The AegisPay mark: a wax seal with a shield pressed into it. Decorative unless given a label. */
export function Seal({ size = 28, label }: { size?: number; label?: string }) {
  return (
    <svg
      className="seal"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle cx="16" cy="16" r="15" fill="var(--primary)" />
      <circle cx="16" cy="16" r="11.5" fill="none" stroke="var(--primary-foreground)" strokeOpacity="0.55" strokeWidth="1" />
      <path
        d="M16 9.2l5.6 2.2v4.4c0 3.8-2.5 6.3-5.6 7.5-3.1-1.2-5.6-3.7-5.6-7.5v-4.4z"
        fill="var(--primary-foreground)"
      />
      <path d="M16 12.4v8.2" stroke="var(--primary)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
