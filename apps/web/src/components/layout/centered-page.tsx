import React from 'react';

export function CenteredPage({ children }: React.PropsWithChildren) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-6 py-12 text-foreground">
      <div className="w-full max-w-[40.625rem]">{children}</div>
    </main>
  );
}
