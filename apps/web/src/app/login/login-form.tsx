'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  EyeIcon,
  EyeOffIcon,
  LockKeyIcon,
  SmartPhone01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useRouter } from 'next/navigation';
import React from 'react';
import { useForm } from 'react-hook-form';
import { mutate } from 'swr';
import { z } from 'zod';

import { CenteredPage } from '@/components/layout/centered-page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { profileSchema } from '@/lib/contracts';

const loginSchema = z.object({
  password: z.string().min(12, 'Kata sandi harus berisi minimal 12 karakter.'),
  phoneNumber: z
    .string()
    .regex(/^\+62[0-9]+$/u, 'Gunakan nomor Indonesia dengan awalan +62.'),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = React.useState(false);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  const submit = handleSubmit(async (values) => {
    try {
      const profile = await api('/auth/login', profileSchema, {
        body: JSON.stringify(values),
        method: 'POST',
      });

      await mutate('/auth/me', profile, { revalidate: false });
      router.replace(profile.roles.includes('HRD') ? '/hrd' : '/employee');
    } catch (error) {
      setError('root', {
        message:
          error instanceof Error
            ? error.message
            : 'Tidak dapat masuk. Coba kembali.',
      });
    }
  });

  return (
    <CenteredPage>
      <section
        aria-labelledby="login-title"
        className="mx-auto w-full max-w-sm"
      >
        <h1
          className="text-2xl leading-tight font-semibold tracking-tight text-balance"
          id="login-title"
        >
          Masuk ke akun Anda
        </h1>
        <p className="mt-2 text-sm leading-6 text-pretty text-muted-foreground">
          Gunakan nomor telepon dan kata sandi yang diberikan HRD.
        </p>

        <form
          className="mt-5 flex flex-col gap-3"
          noValidate
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <div className="grid gap-1.5">
            <label className="text-sm font-medium" htmlFor="phoneNumber">
              Nomor telepon
            </label>
            <div className="relative">
              <HugeiconsIcon
                aria-hidden="true"
                className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
                icon={SmartPhone01Icon}
              />
              <Input
                {...register('phoneNumber')}
                aria-describedby="phone-error"
                aria-invalid={errors.phoneNumber !== undefined}
                autoComplete="tel"
                className="ps-11"
                id="phoneNumber"
                inputMode="tel"
                placeholder="+628123456789"
                type="tel"
              />
            </div>
            <p className="text-xs text-destructive" id="phone-error">
              {errors.phoneNumber?.message}
            </p>
          </div>

          <div className="grid gap-1.5">
            <label className="text-sm font-medium" htmlFor="password">
              Kata sandi
            </label>
            <div className="relative">
              <HugeiconsIcon
                aria-hidden="true"
                className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
                icon={LockKeyIcon}
              />
              <Input
                {...register('password')}
                aria-describedby="password-error"
                aria-invalid={errors.password !== undefined}
                autoComplete="current-password"
                className="ps-11 pe-12"
                id="password"
                placeholder="Masukkan kata sandi"
                type={showPassword ? 'text' : 'password'}
              />
              <button
                aria-label={
                  showPassword
                    ? 'Sembunyikan kata sandi'
                    : 'Tampilkan kata sandi'
                }
                className="absolute inset-y-0 end-0 grid w-12 place-items-center text-muted-foreground"
                onClick={() => {
                  setShowPassword((visible) => !visible);
                }}
                type="button"
              >
                <HugeiconsIcon
                  aria-hidden="true"
                  className="size-5"
                  icon={showPassword ? EyeOffIcon : EyeIcon}
                />
              </button>
            </div>
            <p className="text-xs text-destructive" id="password-error">
              {errors.password?.message}
            </p>
          </div>

          <p aria-live="polite" className="text-sm text-destructive">
            {errors.root?.message}
          </p>
          <Button className="w-full" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Memproses...' : 'Masuk'}
          </Button>
        </form>
      </section>
    </CenteredPage>
  );
}
