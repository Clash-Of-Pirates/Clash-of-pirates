import './PageLoading.css';

type Props = {
  title?: string;
  subtitle?: string;
  /** Fill the main content column (not full viewport) */
  variant?: 'viewport' | 'panel';
  className?: string;
};

export function PageLoading({
  title = 'Loading',
  subtitle,
  variant = 'panel',
  className = '',
}: Props) {
  return (
    <div className={`page-loading page-loading--${variant} ${className}`.trim()} role="status" aria-live="polite" aria-busy="true">
      <div className="page-loading-inner">
        <div className="page-loading-shimmer" aria-hidden />
        <p className="page-loading-title">{title}</p>
        {subtitle ? <p className="page-loading-sub">{subtitle}</p> : null}
      </div>
    </div>
  );
}
