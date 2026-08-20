import { resolvePublicSignupCta } from "../lib/public-signup-cta";
import { IslandBoundary } from "./island-boundary";

interface PublicSignupCtaProps {
  sourcePage: string;
  buttonText?: string;
  ctaText?: string;
  ctaTarget?: string;
}

function PublicSignupCtaInner({
  sourcePage,
  buttonText,
  ctaText,
  ctaTarget,
}: PublicSignupCtaProps) {
  void sourcePage;

  const resolvedCta = resolvePublicSignupCta({
    explicitTarget: ctaTarget,
    explicitText: ctaText ?? buttonText,
  });

  return (
    <a href={resolvedCta.target} className="btn-primary inline-flex items-center justify-center">
      {resolvedCta.text}
    </a>
  );
}

export default function PublicSignupCta(props: PublicSignupCtaProps) {
  return (
    <IslandBoundary>
      <PublicSignupCtaInner {...props} />
    </IslandBoundary>
  );
}
