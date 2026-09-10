import { redirect } from 'next/navigation';
import React from 'react';

import { currentProfile } from '@/lib/server-auth';

export default async function EmployeeLayout({
  children,
}: React.PropsWithChildren) {
  const profile = await currentProfile();

  if (!profile) {
    redirect('/login');
  }

  if (!profile.roles.includes('EMPLOYEE')) {
    redirect('/hrd');
  }

  return await children;
}
