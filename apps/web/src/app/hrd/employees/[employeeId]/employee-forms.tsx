'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { mutateApi } from '@/lib/api';
import {
  emptySchema,
  profileSchema,
  resetPasswordSchema,
  updateEmployeeSchema,
  updatePhoneSchema,
} from '@/lib/contracts';
import type { Profile } from '@/lib/contracts';

export function EmployeeForms({ employee }: { employee: Profile }) {
  const key = `/hrd/employees/${employee.id}`;
  const profileForm = useForm<z.infer<typeof updateEmployeeSchema>>({
    defaultValues: {
      email: employee.email ?? '',
      fullName: employee.fullName,
    },
    resolver: zodResolver(updateEmployeeSchema),
  });
  const phoneForm = useForm<z.infer<typeof updatePhoneSchema>>({
    defaultValues: { phoneNumber: employee.phoneNumber },
    resolver: zodResolver(updatePhoneSchema),
  });
  const passwordForm = useForm<z.infer<typeof resetPasswordSchema>>({
    resolver: zodResolver(resetPasswordSchema),
  });
  const updateProfile = profileForm.handleSubmit(async (values) => {
    try {
      await mutateApi(
        key,
        profileSchema,
        { body: JSON.stringify(values), method: 'PATCH' },
        ['/hrd/employees'],
      );
    } catch (error) {
      profileForm.setError('root', {
        message:
          error instanceof Error ? error.message : 'Profil gagal disimpan.',
      });
    }
  });
  const updatePhone = phoneForm.handleSubmit(async (values) => {
    try {
      await mutateApi(
        `${key}/phone-number`,
        profileSchema,
        { body: JSON.stringify(values), method: 'PUT' },
        ['/hrd/employees'],
      );
    } catch (error) {
      phoneForm.setError('root', {
        message:
          error instanceof Error
            ? error.message
            : 'Nomor telepon gagal disimpan.',
      });
    }
  });
  const resetPassword = passwordForm.handleSubmit(async (values) => {
    try {
      await mutateApi(
        `${key}/password`,
        emptySchema,
        { body: JSON.stringify(values), method: 'PUT' },
        [],
      );
      passwordForm.reset();
    } catch (error) {
      passwordForm.setError('root', {
        message:
          error instanceof Error ? error.message : 'Kata sandi gagal diubah.',
      });
    }
  });

  return (
    <div>
      <form
        className="mt-8 space-y-4"
        onSubmit={(event) => {
          void updateProfile(event);
        }}
      >
        <h2 className="text-sm font-semibold">Profil</h2>
        <Input
          {...profileForm.register('fullName')}
          aria-label="Nama lengkap"
          autoComplete="name"
        />
        <Input
          {...profileForm.register('email')}
          aria-label="Email"
          autoComplete="email"
          type="email"
        />
        <p className="text-sm text-destructive">
          {profileForm.formState.errors.root?.message}
        </p>
        <Button disabled={profileForm.formState.isSubmitting} type="submit">
          Simpan profil
        </Button>
      </form>

      <form
        className="mt-8 space-y-4"
        onSubmit={(event) => {
          void updatePhone(event);
        }}
      >
        <h2 className="text-sm font-semibold">Nomor telepon</h2>
        <Input
          {...phoneForm.register('phoneNumber')}
          aria-label="Nomor telepon"
          autoComplete="tel"
          type="tel"
        />
        <p className="text-sm text-destructive">
          {phoneForm.formState.errors.phoneNumber?.message ??
            phoneForm.formState.errors.root?.message}
        </p>
        <Button disabled={phoneForm.formState.isSubmitting} type="submit">
          Simpan nomor telepon
        </Button>
      </form>

      <form
        className="mt-8 space-y-4"
        onSubmit={(event) => {
          void resetPassword(event);
        }}
      >
        <h2 className="text-sm font-semibold">Reset kata sandi</h2>
        <Input
          {...passwordForm.register('password')}
          aria-label="Kata sandi baru"
          autoComplete="new-password"
          placeholder="Minimal 12 karakter"
          type="password"
        />
        <p className="text-sm text-destructive">
          {passwordForm.formState.errors.password?.message ??
            passwordForm.formState.errors.root?.message}
        </p>
        <Button disabled={passwordForm.formState.isSubmitting} type="submit">
          Reset kata sandi
        </Button>
      </form>
    </div>
  );
}
