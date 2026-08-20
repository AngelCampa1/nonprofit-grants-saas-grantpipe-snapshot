import * as React from "react";

export interface EmptyStateLinkProps {
  href: string;
  className?: string;
  children?: React.ReactNode;
}

type EmptyStateLinkComponent = React.ComponentType<EmptyStateLinkProps>;

const EmptyStateLinkContext = React.createContext<EmptyStateLinkComponent | null>(null);

function DefaultAnchor({ href, className, children }: EmptyStateLinkProps) {
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}

interface EmptyStateLinkProviderProps {
  component: EmptyStateLinkComponent;
  children: React.ReactNode;
}

function EmptyStateLinkProvider({ component, children }: EmptyStateLinkProviderProps) {
  return (
    <EmptyStateLinkContext.Provider value={component}>{children}</EmptyStateLinkContext.Provider>
  );
}

function useEmptyStateLink(): EmptyStateLinkComponent {
  const provided = React.useContext(EmptyStateLinkContext);
  return provided ?? DefaultAnchor;
}

export { EmptyStateLinkContext, EmptyStateLinkProvider, useEmptyStateLink };
