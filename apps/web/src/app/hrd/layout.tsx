import { redirect } from 'next/navigation';
import React from 'react';

import { currentProfile } from '@/lib/server-auth';

export default async function HrdLayout({ children }: React.PropsWithChildren) {
  const profile = await currentProfile();

  if (!profile) {
    redirect('/login');
  }

  if (!profile.roles.includes('HRD')) {
    redirect('/employee');
  }

  return await children;
}
