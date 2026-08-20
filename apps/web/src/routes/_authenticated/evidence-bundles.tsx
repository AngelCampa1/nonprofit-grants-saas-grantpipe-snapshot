import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/evidence-bundles")({
  component: EvidenceBundlesRoute,
});

export function EvidenceBundlesRoute() {
  return <Outlet />;
}
