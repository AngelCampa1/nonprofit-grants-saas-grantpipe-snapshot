import { clsx } from "clsx";

export interface MobileFormFooterProps {
  /** Primary action button label. */
  primaryLabel: string;
  /** Whether the primary action button is disabled. */
  primaryDisabled?: boolean;
  /** onClick handler for the primary action. */
  onPrimary: () => void;
  /** Optional secondary action label (e.g. "Back"). */
  secondaryLabel?: string;
  /** Whether the secondary action is disabled. */
  secondaryDisabled?: boolean;
  /** onClick handler for the secondary action. */
  onSecondary?: () => void;
  /** Additional className for the root element. */
  className?: string;
}

/**
 * MobileFormFooter — sticky bottom bar for multi-step form navigation on
 * mobile viewports (hidden on sm: and above where inline buttons are used).
 *
 * Provides a full-width primary action button with ≥48px touch target and
 * safe-area-inset-bottom padding for iOS notch support. An optional secondary
 * "Back" action is rendered as a text button on the left.
 */
export function MobileFormFooter({
  primaryLabel,
  primaryDisabled = false,
  onPrimary,
  secondaryLabel,
  secondaryDisabled = false,
  onSecondary,
  className,
}: MobileFormFooterProps) {
  return (
    <div
      data-mobile-form-footer
      className={clsx(
        "fixed bottom-0 left-0 right-0 z-40 sm:hidden",
        "border-t border-neutral-200 bg-[var(--gp-paper)]",
        "pb-[env(safe-area-inset-bottom)]",
        className,
      )}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        {secondaryLabel && onSecondary ? (
          <button
            type="button"
            onClick={onSecondary}
            disabled={secondaryDisabled}
            className="inline-flex min-h-12 items-center rounded-full px-3 py-2 text-sm text-brand-text underline disabled:opacity-40"
          >
            {secondaryLabel}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onPrimary}
          disabled={primaryDisabled}
          className="btn-primary flex-1 min-h-12 w-full flex items-center justify-center px-4 text-sm font-medium disabled:opacity-40"
        >
          {primaryLabel}
        </button>
      </div>
    </div>
  );
}
