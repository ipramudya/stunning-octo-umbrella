import './globals.css';

import type { Metadata } from 'next';

import { AgentationDevTools } from './agentation';

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="id">
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
