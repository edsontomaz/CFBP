'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * This page is deprecated and now only serves to redirect users
 * to the gallery page, where upload functionality has been integrated.
 */
export default function DeprecatedUploadPage() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace('/gallery');
  }, [router]);

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-muted-foreground">Redirecionando para a galeria...</p>
    </div>
  );
}
