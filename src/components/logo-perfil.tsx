'use client';
import Image from 'next/image';
import { cn } from '@/lib/utils';

export function LogoPerfil({ className }: { className?: string }) {
  return (
    <Image
      src="/logo-perfil.png"
      alt="BIKE PONTAL Logo Perfil"
      width={100}
      height={100}
      className={cn('rounded-full h-auto', className)}
      priority
    />
  );
}
