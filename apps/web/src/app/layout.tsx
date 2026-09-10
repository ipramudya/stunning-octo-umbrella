import './globals.css';

import type { Metadata } from 'next';
import React from 'react';

import { AgentationDevTools } from './agentation';
import { inter, manropeHeading } from './fonts';

export default function RootLayout({ children }: React.PropsWithChildren) {
  return (
    <html
      lang="id"
      className={`${inter.variable} ${manropeHeading.variable} font-sans`}
    >
      <body>
        {children}
        <AgentationDevTools />
      </body>
    </html>
  );
}

export const metadata: Metadata = {
  description: 'Aplikasi absensi kerja dari rumah Dexa.',
  title: 'Dexa Attendance',
};
