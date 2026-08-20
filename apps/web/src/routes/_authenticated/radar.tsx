import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/radar")({
  beforeLoad: () => {
    throw redirect({ to: "/deadlines", replace: true });
  },
});
