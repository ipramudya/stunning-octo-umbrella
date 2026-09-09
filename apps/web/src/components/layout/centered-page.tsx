import React from 'react';

export const CenteredPage = ({ children }: React.PropsWithChildren) => (
  <main className="grid min-h-dvh place-items-center bg-background px-6 py-12 text-foreground">
    <div className="w-full max-w-[40.625rem]">{children}</div>
  </main>
);
