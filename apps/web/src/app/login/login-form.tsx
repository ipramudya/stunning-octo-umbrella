'use client';

import {
  EyeIcon,
  EyeOffIcon,
  LockKeyIcon,
  SmartPhone01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import React from 'react';

import { CenteredPage } from '@/components/layout/centered-page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface FieldErrors {
  password?: string;
  phone?: string;
}

export function LoginForm() {
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [showPassword, setShowPassword] = React.useState(false);
  const handleSubmit = (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const phoneValue = form.get('phone');
    const passwordValue = form.get('password');
    const phone = typeof phoneValue === 'string' ? phoneValue : '';
    const password = typeof passwordValue === 'string' ? passwordValue : '';
    const nextErrors: FieldErrors = {};
    if (!/^\+62[0-9]+$/u.test(phone)) {
      nextErrors.phone = 'Gunakan nomor Indonesia dengan awalan +62.';
    }
    if (password.length < 12) {
      nextErrors.password = 'Kata sandi harus berisi minimal 12 karakter.';
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
  };
  return (
    <CenteredPage>
      <section
        className="mx-auto w-full max-w-sm"
        aria-labelledby="login-title"
      >
        <h1
          id="login-title"
          className="text-2xl leading-tight font-semibold tracking-tight text-balance"
        >
          Masuk ke akun Anda
        </h1>
        <p className="mt-2 text-sm leading-6 text-pretty text-muted-foreground">
          Gunakan nomor telepon dan kata sandi yang diberikan HRD.
        </p>

        <form
          className="mt-5 flex flex-col gap-5"
          noValidate
          onSubmit={handleSubmit}
        >
          <div className="flex flex-col">
            <div className="flex flex-col gap-2">
              <label
                className={
                  errors.phone === undefined
                    ? 'text-sm font-medium'
                    : 'text-sm font-medium text-destructive'
                }
                htmlFor="phone"
              >
                Nomor telepon
              </label>
              <div className="relative">
                <HugeiconsIcon
                  aria-hidden="true"
                  className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
                  icon={SmartPhone01Icon}
                />
                <Input
                  aria-describedby={
                    errors.phone === undefined ? undefined : 'phone-error'
                  }
                  aria-invalid={Boolean(errors.phone)}
                  autoComplete="tel"
                  className="ps-11 aria-invalid:!border-destructive aria-invalid:!ring-destructive/20"
                  id="phone"
                  inputMode="tel"
                  name="phone"
                  placeholder="+628123456789"
                  required
                  type="tel"
                />
              </div>
              <p
                className="!mt-0 min-h-5 text-xs !text-destructive"
                id="phone-error"
              >
                {errors.phone ?? ''}
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <label
                className={
                  errors.password === undefined
                    ? 'text-sm font-medium'
                    : 'text-sm font-medium text-destructive'
                }
                htmlFor="password"
              >
                Kata sandi
              </label>
              <div className="relative">
                <HugeiconsIcon
                  aria-hidden="true"
                  className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
                  icon={LockKeyIcon}
                />
                <Input
                  aria-describedby={
                    errors.password === undefined ? undefined : 'password-error'
                  }
                  aria-invalid={Boolean(errors.password)}
                  autoComplete="current-password"
                  className="ps-11 pe-12 aria-invalid:!border-destructive aria-invalid:!ring-destructive/20"
                  id="password"
                  name="password"
                  placeholder="Masukkan kata sandi"
                  required
                  type={showPassword ? 'text' : 'password'}
                />
                <button
                  aria-label={
                    showPassword
                      ? 'Sembunyikan kata sandi'
                      : 'Tampilkan kata sandi'
                  }
                  className="absolute inset-y-0 end-0 grid w-12 place-items-center text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
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
              <p
                className="!mt-0 min-h-5 text-xs !text-destructive"
                id="password-error"
              >
                {errors.password ?? ''}
              </p>
            </div>
          </div>

          <Button className="w-full" type="submit">
            Masuk
          </Button>
        </form>

        <p className="mt-5 text-xs leading-5 text-muted-foreground">
          Butuh bantuan akses? Hubungi administrator HRD Anda.
        </p>
      </section>
    </CenteredPage>
  );
}
