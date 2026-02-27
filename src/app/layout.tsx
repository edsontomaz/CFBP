import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseClientProvider } from '@/firebase';
import { PwaRegister } from '@/components/pwa-register';

export const metadata: Metadata = {
  title: 'CF BIKE PONTAL',
  description: 'AI-powered bike route planning',
  manifest: '/manifest.json',
  icons: {
    icon: '/BP_CF_2P.ico',
    apple: '/BP_CF_2P.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="font-body antialiased">
        <FirebaseClientProvider>
          <PwaRegister />
          {children}
          <Toaster />
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
