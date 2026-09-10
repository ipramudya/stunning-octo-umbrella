'use client';

import { Logout01Icon, MoreVerticalIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';

import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function AccountMenu() {
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label="Buka menu akun"
              className="hidden md:inline-flex"
              size="icon"
              type="button"
              variant="outline"
            />
          }
        >
          <HugeiconsIcon aria-hidden="true" icon={MoreVerticalIcon} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-28">
          <DropdownMenuItem variant="destructive">
            <HugeiconsIcon aria-hidden="true" icon={Logout01Icon} />
            Keluar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Drawer>
        <DrawerTrigger
          render={
            <Button
              aria-label="Buka menu akun"
              className="md:hidden"
              size="icon"
              type="button"
              variant="outline"
            />
          }
        >
          <HugeiconsIcon aria-hidden="true" icon={MoreVerticalIcon} />
        </DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Menu akun</DrawerTitle>
          </DrawerHeader>
          <div className="p-4 pt-0">
            <Button
              className="w-full justify-start"
              type="button"
              variant="destructive"
            >
              <HugeiconsIcon aria-hidden="true" icon={Logout01Icon} />
              Keluar
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
