"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  useUser,
  useFirestore,
  useDoc,
  useCollection,
  useMemoFirebase,
  setDocumentNonBlocking,
} from "@/firebase";
import { collection, doc, serverTimestamp } from "firebase/firestore";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";

interface FinancialUser {
  id: string;
  displayName: string;
  role?: string;
  billingEnabled?: boolean;
  eventTotalAmount?: number;
  amountPaid?: number;
  paymentValues?: number[];
}

type PaymentsByUser = Record<string, number[]>;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

const formatCurrencyInput = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const parseCurrencyInput = (value: string) => {
  const digitsOnly = value.replace(/\D/g, "");
  if (!digitsOnly) return 0;
  return Number(digitsOnly) / 100;
};

export default function AdminFinanceiroPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();

  const userDocRef = useMemoFirebase(
    () => (user ? doc(firestore, "users", user.uid) : null),
    [firestore, user],
  );
  const { data: currentUserProfile, isLoading: isProfileLoading } = useDoc<{
    role: string;
  }>(userDocRef);

  const usersQuery = useMemoFirebase(() => {
    if (currentUserProfile?.role === "admin") {
      return collection(firestore, "users");
    }
    return null;
  }, [firestore, currentUserProfile]);

  const { data: users, isLoading: areUsersLoading } =
    useCollection<FinancialUser>(usersQuery);
  const [paymentsByUser, setPaymentsByUser] = useState<PaymentsByUser>({});
  const [savingByUser, setSavingByUser] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!users) return;

    const nextPaymentsByUser: PaymentsByUser = {};

    users.forEach((item) => {
      const currentValues = Array.isArray(item.paymentValues)
        ? item.paymentValues
        : [];

      const normalized = Array.from({ length: 10 }, (_, index) => {
        const value = Number(currentValues[index] || 0);
        return Number.isFinite(value) ? value : 0;
      });

      nextPaymentsByUser[item.id] = normalized;
    });

    setPaymentsByUser(nextPaymentsByUser);
  }, [users]);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push("/login");
    }
    if (
      !isProfileLoading &&
      currentUserProfile &&
      currentUserProfile.role !== "admin"
    ) {
      router.push("/");
    }
  }, [user, isUserLoading, currentUserProfile, isProfileLoading, router]);

  const isLoading = isUserLoading || isProfileLoading || areUsersLoading;

  const handlePaymentChange = (
    userId: string,
    paymentIndex: number,
    value: string,
  ) => {
    const parsedValue = parseCurrencyInput(value);
    const safeValue = Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : 0;

    setPaymentsByUser((prev) => {
      const current = prev[userId] || Array.from({ length: 10 }, () => 0);
      const updated = [...current];
      updated[paymentIndex] = safeValue;
      return {
        ...prev,
        [userId]: updated,
      };
    });
  };

  const handleSavePayments = async (userId: string) => {
    const values = paymentsByUser[userId] || Array.from({ length: 10 }, () => 0);
    const totalPaid = values.reduce((acc, value) => acc + Number(value || 0), 0);

    try {
      setSavingByUser((prev) => ({ ...prev, [userId]: true }));
      const userRef = doc(firestore, "users", userId);

      await setDocumentNonBlocking(
        userRef,
        {
          paymentValues: values,
          amountPaid: totalPaid,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } finally {
      setSavingByUser((prev) => ({ ...prev, [userId]: false }));
    }
  };

  if (isLoading || !currentUserProfile || currentUserProfile.role !== "admin") {
    return (
      <div className="flex min-h-screen w-full items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  const financialUsers =
    users?.filter((item) => item.role !== "admin" && item.billingEnabled) || [];

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="container mx-auto flex-1 p-4 md:p-8">
        <div className="mb-4">
          <Button asChild variant="outline">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar para Início
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-headline text-2xl">
              Resumo Financeiro
            </CardTitle>
            <CardDescription>
              Visão consolidada de cobrança dos usuários habilitados.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ciclista</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Pago</TableHead>
                  <TableHead>Devedor</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {financialUsers.map((item) => {
                  const total = Number(item.eventTotalAmount || 0);
                  const paymentValues =
                    paymentsByUser[item.id] || Array.from({ length: 10 }, () => 0);
                  const paid = paymentValues.reduce(
                    (acc, value) => acc + Number(value || 0),
                    0,
                  );
                  const debt = Math.max(total - paid, 0);

                  const isPaid = total > 0 && debt === 0;
                  const isPartial = paid > 0 && debt > 0;

                  const statusLabel = isPaid
                    ? "🟢 Quitado"
                    : isPartial
                      ? "🟡 Parcial"
                      : "🔴 Pendente";

                  const statusVariant = isPaid
                    ? "default"
                    : isPartial
                      ? "secondary"
                      : "destructive";

                  return [
                      <TableRow key={`${item.id}-summary`}>
                        <TableCell className="font-medium">
                          {item.displayName || "Sem nome"}
                        </TableCell>
                        <TableCell>{formatCurrency(total)}</TableCell>
                        <TableCell>{formatCurrency(paid)}</TableCell>
                        <TableCell>{formatCurrency(debt)}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant}>{statusLabel}</Badge>
                        </TableCell>
                      </TableRow>,

                      <TableRow key={`${item.id}-payments`}>
                        <TableCell colSpan={5}>
                          <div className="space-y-3">
                            <div className="overflow-x-auto">
                              <div className="grid min-w-[36rem] grid-cols-10 gap-2">
                                {Array.from({ length: 10 }).map((_, index) => (
                                  <Input
                                    key={`${item.id}-payment-${index + 1}`}
                                    type="text"
                                    inputMode="decimal"
                                    value={formatCurrencyInput(paymentValues[index] || 0)}
                                    onChange={(event) =>
                                      handlePaymentChange(
                                        item.id,
                                        index,
                                        event.target.value,
                                      )
                                    }
                                    className="w-20"
                                  />
                                ))}
                              </div>
                            </div>
                            <div>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => handleSavePayments(item.id)}
                                disabled={Boolean(savingByUser[item.id])}
                              >
                                {savingByUser[item.id]
                                  ? "Salvando..."
                                  : "Salvar Pagamentos"}
                              </Button>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ];
                })}
              </TableBody>
            </Table>

            {financialUsers.length === 0 && (
              <div className="py-10 text-center text-muted-foreground">
                Nenhum usuário com cobrança habilitada.
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
