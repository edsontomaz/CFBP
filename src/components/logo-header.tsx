'use client';
import Image from 'next/image';
import { cn } from '@/lib/utils';

export function LogoHeader({ className }: { className?: string }) {
  return (
    <Image
      src="/cf-bike-pontal-logo.png"
      alt="CF BIKE PONTAL Logo"
      width={40}
      height={40}
      className={cn('h-10 w-10', className)}
      priority
    />
  );
}
