'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Images, User, Download, Shield, Wallet, Shirt } from 'lucide-react';
import { Header } from '@/components/header';
import { PwaRegister } from '@/components/pwa-register';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useUser,
  useDoc,
  useMemoFirebase,
  useFirestore,
  setDocumentNonBlocking,
  useCollection,
  useStorage,
} from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import { getMetadata, listAll, ref } from 'firebase/storage';
import { useToast } from '@/hooks/use-toast';

interface UserProfile {
  role?: string;
  galleryCardEnabled?: boolean;
  uniformeCF2026Enabled?: boolean;
  uniformeCF2026Title?: string;
  uniformeCF2026Description?: string;
  billingEnabled?: boolean;
  eventTotalAmount?: number;
  amountPaid?: number;
  paymentValues?: number[];
  paymentDueDates?: string[];
  nextDueDate?: string;
  paymentNotificationPending?: boolean;
  paymentNotificationMessage?: string;
  uniformeChoiceTotalAmount?: number;
  uniformePaidAmount?: number;
  uniformePaymentValues?: number[];
  uniformePaymentDueDates?: string[];
  uniformeCF2026Price?: number;
  uniformeCF2026BretellePrice?: number;
  uniformeCF2026ManguitoPrice?: number;
  uniformeCF2026CasualPrice?: number;
  uniformeChoiceQuantity?: number;
  uniformeChoiceBretelleQuantity?: number;
  uniformeChoiceManguitoQuantity?: number;
  uniformeChoiceCasualQuantity?: number;
}

interface GroupData {
  id: string;
  name: string;
}

interface BasicUser {
  id: string;
}

const dueMonthLabels = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);

const GALLERY_STORAGE_LIMIT_BYTES = 512 * 1024 * 1024 * 1024;

const formatBytesToGb = (valueInBytes: number) => {
  const gb = valueInBytes / (1024 * 1024 * 1024);
  return gb.toFixed(2);
};

const toPositiveNumber = (value: unknown) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const computeUniformTotalFromChoice = (profile?: UserProfile) => {
  if (!profile) return 0;

  const jerseyQty = toPositiveNumber(profile.uniformeChoiceQuantity);
  const bretelleQty = toPositiveNumber(profile.uniformeChoiceBretelleQuantity);
  const manguitoQty = toPositiveNumber(profile.uniformeChoiceManguitoQuantity);
  const casualQty = toPositiveNumber(profile.uniformeChoiceCasualQuantity);
  const jerseyPrice = Number(profile.uniformeCF2026Price || 0);
  const bretellePrice = Number(profile.uniformeCF2026BretellePrice || 0);
  const manguitoPrice = Number(profile.uniformeCF2026ManguitoPrice || 0);
  const casualPrice = Number(profile.uniformeCF2026CasualPrice || 0);

  return (
    jerseyQty * jerseyPrice +
    bretelleQty * bretellePrice +
    manguitoQty * manguitoPrice +
    casualQty * casualPrice
  );
};

const normalizeUniformPayments = (
  paymentValues?: number[],
  paymentDueDates?: string[],
  paidAmountFallback?: number,
) => {
  const values = Array.isArray(paymentValues) ? paymentValues : [];
  const dueDates = Array.isArray(paymentDueDates) ? paymentDueDates : [];
  const maxLength = Math.max(values.length, dueDates.length);

  if (maxLength === 0) {
    const fallbackPaid = Number(paidAmountFallback || 0);
    if (fallbackPaid > 0) {
      return {
        values: [fallbackPaid],
        dueDates: [""],
      };
    }

    return {
      values: [] as number[],
      dueDates: [] as string[],
    };
  }

  const lastRelevantIndex = Array.from({ length: maxLength })
    .map((_, index) => index)
    .reverse()
    .find((index) => {
      const value = Number(values[index] || 0);
      const dueDate = String(dueDates[index] || '').trim();
      return value > 0 || dueDate.length > 0;
    });

  if (lastRelevantIndex === undefined) {
    const fallbackPaid = Number(paidAmountFallback || 0);
    if (fallbackPaid > 0) {
      return {
        values: [fallbackPaid],
        dueDates: [""],
      };
    }

    return {
      values: [] as number[],
      dueDates: [] as string[],
    };
  }

  return {
    values: Array.from({ length: lastRelevantIndex + 1 }, (_, index) =>
      Number(values[index] || 0),
    ),
    dueDates: Array.from({ length: lastRelevantIndex + 1 }, (_, index) =>
      String(dueDates[index] || ''),
    ),
  };
};

export default function HomePage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const storage = useStorage();
  const router = useRouter();
  const { toast } = useToast();
  const isHandlingPaymentNotification = useRef(false);
  const [usedGalleryStorageBytes, setUsedGalleryStorageBytes] = useState(0);
  const [isLoadingGalleryStorage, setIsLoadingGalleryStorage] = useState(false);

  const userDocRef = useMemoFirebase(
    () => (user ? doc(firestore, 'users', user.uid) : null),
    [firestore, user],
  );
  const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(userDocRef);

  const isAdmin = userProfile?.role === 'admin';
  const isBillingEnabled = Boolean(userProfile?.billingEnabled);
  const groupsQuery = useMemoFirebase(
    () => (isAdmin ? collection(firestore, 'groups') : null),
    [firestore, isAdmin],
  );
  const { data: groups } = useCollection<GroupData>(groupsQuery);
  const usersQuery = useMemoFirebase(
    () => (isAdmin ? collection(firestore, 'users') : null),
    [firestore, isAdmin],
  );
  const { data: users } = useCollection<BasicUser>(usersQuery);
  const isUniformeCardEnabled = Boolean(userProfile?.uniformeCF2026Enabled);
  const isGalleryCardEnabled = userProfile?.galleryCardEnabled !== false;
  const [isUpdatingUniformeFlag, setIsUpdatingUniformeFlag] = useState(false);
  const [isUpdatingGalleryFlag, setIsUpdatingGalleryFlag] = useState(false);
  const uniformeCardTitle =
    String(userProfile?.uniformeCF2026Title || '').trim() || 'Uniforme CF 2026';
  const uniformeCardDescription =
    String(userProfile?.uniformeCF2026Description || '').trim() ||
    'Escolha seu uniforme oficial de 2026.';
  const totalAmount = Number(userProfile?.eventTotalAmount || 0);
  const amountPaid = Number(userProfile?.amountPaid || 0);
  const paymentValues = Array.isArray(userProfile?.paymentValues)
    ? userProfile.paymentValues
    : [];
  const paymentDueDates = Array.isArray(userProfile?.paymentDueDates)
    ? userProfile.paymentDueDates
    : [];
  const debtAmount = Math.max(totalAmount - amountPaid, 0);
  const progressPercentage =
    totalAmount > 0
      ? Math.min((Math.max(amountPaid, 0) / totalAmount) * 100, 100)
      : 0;
  const uniformeComputedTotal = computeUniformTotalFromChoice(userProfile);
  const uniformeSavedTotal = Number(userProfile?.uniformeChoiceTotalAmount || 0);
  const uniformeTotalAmount = uniformeSavedTotal > 0 ? uniformeSavedTotal : uniformeComputedTotal;
  const normalizedUniformPayments = normalizeUniformPayments(
    userProfile?.uniformePaymentValues,
    userProfile?.uniformePaymentDueDates,
    userProfile?.uniformePaidAmount,
  );
  const uniformePaymentValues = normalizedUniformPayments.values;
  const uniformePaymentDueDates = normalizedUniformPayments.dueDates;
  const uniformePaidFromInstallments = uniformePaymentValues.reduce(
    (acc, value) => acc + Number(value || 0),
    0,
  );
  const uniformePaidAmount = uniformePaidFromInstallments;
  const uniformeDebtAmount = Math.max(uniformeTotalAmount - uniformePaidAmount, 0);
  const uniformeProgressPercentage =
    uniformeTotalAmount > 0
      ? Math.min((Math.max(uniformePaidAmount, 0) / uniformeTotalAmount) * 100, 100)
      : 0;
  const hasUniformeFinanceSummary =
    uniformeTotalAmount > 0 || uniformePaymentValues.length > 0 || uniformePaidAmount > 0;
  const shouldShowUniformeFinanceSummary =
    !isAdmin && isUniformeCardEnabled && hasUniformeFinanceSummary;
  const galleryStorageProgressPercentage = Math.min(
    (usedGalleryStorageBytes / GALLERY_STORAGE_LIMIT_BYTES) * 100,
    100,
  );

  const handleUniformeVisibilityToggle = async (checked: boolean) => {
    if (!isAdmin || !users || users.length === 0) {
      return;
    }

    setIsUpdatingUniformeFlag(true);

    try {
      await Promise.all(
        users.map((item) =>
          setDocumentNonBlocking(
            doc(firestore, 'users', item.id),
            {
              uniformeCF2026Enabled: checked,
            },
            { merge: true },
          ),
        ),
      );
    } finally {
      setIsUpdatingUniformeFlag(false);
    }
  };

  const handleGalleryVisibilityToggle = async (checked: boolean) => {
    if (!isAdmin || !users || users.length === 0) {
      return;
    }

    setIsUpdatingGalleryFlag(true);

    try {
      await Promise.all(
        users.map((item) =>
          setDocumentNonBlocking(
            doc(firestore, 'users', item.id),
            {
              galleryCardEnabled: checked,
            },
            { merge: true },
          ),
        ),
      );
    } finally {
      setIsUpdatingGalleryFlag(false);
    }
  };

  let remainingPaid = amountPaid;
  const installmentRows = paymentValues
    .map((value, index) => ({
      number: index + 1,
      dueDate:
        String(paymentDueDates[index] || '').trim() ||
        `10/${dueMonthLabels[index % dueMonthLabels.length]}`,
      value: Number(value || 0),
    }))
    .filter((item) => item.value > 0)
    .map((item) => {
      const isConfirmed = remainingPaid >= item.value;
      if (isConfirmed) {
        remainingPaid -= item.value;
      }

      return {
        ...item,
        status: isConfirmed ? 'Confirmado' : 'Aguardando',
      };
    });

  let remainingUniformePaid = uniformePaidAmount;
  const uniformeInstallmentRows = uniformePaymentValues
    .map((value, index) => ({
      number: index + 1,
      dueDate: String(uniformePaymentDueDates[index] || '').trim() || '-',
      value: Number(value || 0),
    }))
    .filter((item) => item.value > 0)
    .map((item) => {
      const isConfirmed = remainingUniformePaid >= item.value;
      if (isConfirmed) {
        remainingUniformePaid -= item.value;
      }

      return {
        ...item,
        status: isConfirmed ? 'Confirmado' : 'Aguardando',
      };
    });

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [isUserLoading, user, router]);

  useEffect(() => {
    const loadGalleryStorageUsage = async () => {
      if (!isAdmin) {
        setUsedGalleryStorageBytes(0);
        return;
      }

      if (!groups || groups.length === 0) {
        setUsedGalleryStorageBytes(0);
        return;
      }

      setIsLoadingGalleryStorage(true);

      try {
        const sizeByGroup = await Promise.all(
          groups.map(async (group) => {
            const groupRef = ref(storage, group.name);
            const listResult = await listAll(groupRef);

            const sizes = await Promise.all(
              listResult.items.map(async (itemRef) => {
                const metadata = await getMetadata(itemRef);
                return Number(metadata.size || 0);
              }),
            );

            return sizes.reduce((acc, current) => acc + current, 0);
          }),
        );

        setUsedGalleryStorageBytes(sizeByGroup.reduce((acc, current) => acc + current, 0));
      } catch (error) {
        console.error('Erro ao calcular uso de armazenamento da galeria:', error);
      } finally {
        setIsLoadingGalleryStorage(false);
      }
    };

    void loadGalleryStorageUsage();
  }, [groups, isAdmin, storage]);

  useEffect(() => {
    const showPaymentUpdateAlert = async () => {
      if (!userDocRef || !userProfile?.paymentNotificationPending || isHandlingPaymentNotification.current) {
        return;
      }

      isHandlingPaymentNotification.current = true;

      toast({
        title: userProfile.paymentNotificationMessage || 'Atualizado Pagamento',
        description: 'Seu resumo financeiro foi atualizado pelo administrador.',
      });

      try {
        await setDocumentNonBlocking(
          userDocRef,
          {
            paymentNotificationPending: false,
            paymentNotificationMessage: '',
          },
          { merge: true },
        );
      } finally {
        isHandlingPaymentNotification.current = false;
      }
    };

    void showPaymentUpdateAlert();
  }, [toast, userDocRef, userProfile?.paymentNotificationPending, userProfile?.paymentNotificationMessage]);

  if (isUserLoading || isProfileLoading || !user) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <PwaRegister />
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
                    <Link href="/admin/financeiro">Resumo Financeiro</Link>
                  </Button>
                </CardContent>
              </Card>
            )}

            {isAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Shirt className="h-5 w-5" /> Pagamento Uniforme</CardTitle>
                  <CardDescription>Abra a pagina de pagamento do uniforme.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild variant="outline">
                    <Link href="/admin/pay-uniforme">Abrir pagina</Link>
                  </Button>
                </CardContent>
              </Card>
            )}

            {isAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle>Uniforme</CardTitle>
                  <CardDescription>
                    Configure o card de uniforme e as opções disponíveis para os usuários.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <Button asChild variant="outline">
                    <Link href="/uniforme">Configurar</Link>
                  </Button>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Exibir card para usuários</span>
                    <Switch
                      checked={isUniformeCardEnabled}
                      onCheckedChange={(checked) => {
                        void handleUniformeVisibilityToggle(Boolean(checked));
                      }}
                      disabled={isUpdatingUniformeFlag}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

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

            {!isAdmin && isUniformeCardEnabled && (
              <Card>
                <CardHeader>
                  <CardTitle>{uniformeCardTitle}</CardTitle>
                  <CardDescription className="whitespace-pre-line">
                    {uniformeCardDescription}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild variant="outline">
                    <Link href="/uniforme">Escolher Uniforme</Link>
                  </Button>
                </CardContent>
              </Card>
            )}

            {(isAdmin || isGalleryCardEnabled) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Images className="h-5 w-5" /> Galeria</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button asChild variant="outline">
                    <Link href="/gallery">Abrir Galeria</Link>
                  </Button>
                  {isAdmin && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Exibir card para usuários</span>
                        <Switch
                          checked={isGalleryCardEnabled}
                          onCheckedChange={(checked) => {
                            void handleGalleryVisibilityToggle(Boolean(checked));
                          }}
                          disabled={isUpdatingGalleryFlag}
                        />
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Armazenamento da galeria</span>
                        <span className="font-medium">
                          {isLoadingGalleryStorage
                            ? 'Calculando...'
                            : `${formatBytesToGb(usedGalleryStorageBytes)} GB / 512.00 GB`}
                        </span>
                      </div>
                      <Progress value={galleryStorageProgressPercentage} />
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground">Veja e envie mídias para os grupos aos quais você pertence.</p>
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
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Progresso do Pagamento</span>
                      <span className="text-sm font-medium">{progressPercentage.toFixed(0)}%</span>
                    </div>
                    <Progress value={progressPercentage} />
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

                  {installmentRows.length > 0 && (
                    <div className="pt-2">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Parcela</TableHead>
                            <TableHead>Valor</TableHead>
                            <TableHead>Data Pag.</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {installmentRows.map((installment) => (
                            <TableRow key={`installment-${installment.number}`}>
                              <TableCell>{installment.number}</TableCell>
                              <TableCell>{formatCurrency(installment.value)}</TableCell>
                              <TableCell>{installment.dueDate}</TableCell>
                              <TableCell>{installment.status}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  {shouldShowUniformeFinanceSummary && (
                    <div className="space-y-3 pt-3 border-t">
                      <CardTitle>Pagamento do Uniforme</CardTitle>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Progresso do Pagamento</span>
                          <span className="text-sm font-medium">
                            {uniformeProgressPercentage.toFixed(0)}%
                          </span>
                        </div>
                        <Progress value={uniformeProgressPercentage} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Total do Uniforme</span>
                        <span className="font-medium">{formatCurrency(uniformeTotalAmount)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Já Pago (Uniforme)</span>
                        <span className="font-medium">{formatCurrency(uniformePaidAmount)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Saldo Devedor (Uniforme)</span>
                        <span className="font-medium">{formatCurrency(uniformeDebtAmount)}</span>
                      </div>

                      {uniformeInstallmentRows.length > 0 && (
                        <div className="pt-2">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Parcela</TableHead>
                                <TableHead>Valor</TableHead>
                                <TableHead>Data Pag.</TableHead>
                                <TableHead>Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {uniformeInstallmentRows.map((installment) => (
                                <TableRow key={`uniforme-installment-${installment.number}`}>
                                  <TableCell>{installment.number}</TableCell>
                                  <TableCell>{formatCurrency(installment.value)}</TableCell>
                                  <TableCell>{installment.dueDate}</TableCell>
                                  <TableCell>{installment.status}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
