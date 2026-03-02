'use client';
import Image from 'next/image';
import { cn } from '@/lib/utils';

export function LogoAuth({ className }: { className?: string }) {
  return (
    <Image
      src="/logo-auth_2.png"
        alt="logo-auth"
        width={110}
        height={80}
        style={{ height: 'auto', width: 'auto' }}
        className={className}
        priority
    />
  );
}
