'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Images, User, Download, Shield, Wallet } from 'lucide-react';
import { Header } from '@/components/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  useUser,
  useDoc,
  useMemoFirebase,
  useFirestore,
} from '@/firebase';
import { doc } from 'firebase/firestore';

interface UserProfile {
  role?: string;
  billingEnabled?: boolean;
  eventTotalAmount?: number;
  amountPaid?: number;
  nextDueDate?: string;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);

export default function HomePage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();

  const userDocRef = useMemoFirebase(
    () => (user ? doc(firestore, 'users', user.uid) : null),
    [firestore, user],
  );
  const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(userDocRef);

  const isAdmin = userProfile?.role === 'admin';
  const isBillingEnabled = Boolean(userProfile?.billingEnabled);
  const totalAmount = Number(userProfile?.eventTotalAmount || 0);
  const amountPaid = Number(userProfile?.amountPaid || 0);
  const debtAmount = Math.max(totalAmount - amountPaid, 0);

  const isPaid = totalAmount > 0 && debtAmount === 0;
  const isPartial = amountPaid > 0 && debtAmount > 0;

  const statusLabel = isPaid ? '🟢 Pago' : isPartial ? '🟡 Parcial' : '🔴 Pendente';
  const statusVariant = isPaid ? 'default' : isPartial ? 'secondary' : 'destructive';

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [isUserLoading, user, router]);

  if (isUserLoading || isProfileLoading || !user) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="container mx-auto flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-3xl space-y-6">
          <div>
            <h1 className="text-3xl font-bold font-headline">Bem-vindo ao BIKE PONTAL</h1>
            <p className="text-muted-foreground mt-2">Gerencie seu perfil e acompanhe as mídias do seu grupo.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {isAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Admin</CardTitle>
                  <CardDescription>Acesse o painel administrativo do sistema.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild variant="outline">
                    <Link href="/admin">Abrir Admin</Link>
                  </Button>
                </CardContent>
              </Card>
            )}

            {isAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Download className="h-5 w-5" /> Exportar Usuários</CardTitle>
                  <CardDescription>Abra a página de exportação por grupo.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild variant="outline">
                    <Link href="/export">Abrir Exportação</Link>
                  </Button>
                </CardContent>
              </Card>
            )}

            {isAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5" /> Financeiro</CardTitle>
                  <CardDescription>Abra o resumo financeiro consolidado dos ciclistas.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild variant="outline">
                    <Link href="/admin/financeiro">Abrir Resumo Financeiro</Link>
                  </Button>
                </CardContent>
              </Card>
            )}

            {isBillingEnabled && (
              <Card>
                <CardHeader>
                  <CardTitle>Resumo Financeiro</CardTitle>
                  <CardDescription>
                    Status rápido do pagamento do pacote do evento.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge variant={statusVariant}>{statusLabel}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total do Pacote</span>
                    <span className="font-medium">{formatCurrency(totalAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Já Pago</span>
                    <span className="font-medium">{formatCurrency(amountPaid)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Saldo Devedor</span>
                    <span className="font-medium">{formatCurrency(debtAmount)}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Images className="h-5 w-5" /> Galeria</CardTitle>
                <CardDescription>Veja e envie mídias para os grupos aos quais você pertence.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline">
                  <Link href="/gallery">Abrir Galeria</Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><User className="h-5 w-5" /> Meu Perfil</CardTitle>
                <CardDescription>Atualize seus dados cadastrais e visualize seus grupos.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline">
                  <Link href="/profile">Ir para Perfil</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
