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
import { Progress } from "@/components/ui/progress";
import { Loader2, ArrowLeft, Shield } from "lucide-react";
import { Input } from "@/components/ui/input";

interface FinancialUser {
  id: string;
  displayName: string;
  role?: string;
  billingEnabled?: boolean;
  eventTotalAmount?: number;
  amountPaid?: number;
  paymentValues?: number[];
  paymentDueDates?: string[];
}

type PaymentsByUser = Record<string, number[]>;
type DueDatesByUser = Record<string, string[]>;
const MAX_INSTALLMENTS = 10;

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

const formatDayMonthInput = (value: string) => {
  const digitsOnly = value.replace(/\D/g, "").slice(0, 4);

  if (digitsOnly.length <= 2) {
    return digitsOnly;
  }

  return `${digitsOnly.slice(0, 2)}/${digitsOnly.slice(2)}`;
};

const normalizeInstallments = (
  paymentValues?: number[],
  paymentDueDates?: string[],
) => {
  const values = Array.isArray(paymentValues) ? paymentValues : [];
  const dueDates = Array.isArray(paymentDueDates) ? paymentDueDates : [];
  const maxLength = Math.max(values.length, dueDates.length);

  if (maxLength === 0) {
    return { values: [] as number[], dueDates: [] as string[] };
  }

  const lastRelevantIndex = Array.from({ length: maxLength })
    .map((_, index) => index)
    .reverse()
    .find((index) => {
      const value = Number(values[index] || 0);
      const dueDate = String(dueDates[index] || "").trim();
      return value > 0 || dueDate.length > 0;
    });

  if (lastRelevantIndex === undefined) {
    return { values: [] as number[], dueDates: [] as string[] };
  }

  return {
    values: Array.from({ length: lastRelevantIndex + 1 }, (_, index) =>
      Number(values[index] || 0),
    ),
    dueDates: Array.from({ length: lastRelevantIndex + 1 }, (_, index) =>
      String(dueDates[index] || ""),
    ),
  };
};

const getFirstName = (fullName?: string) => {
  if (!fullName) return "Sem nome";
  return fullName.trim().split(" ")[0] || "Sem nome";
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
  const [dueDatesByUser, setDueDatesByUser] = useState<DueDatesByUser>({});
  const [savingByUser, setSavingByUser] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!users) return;

    const nextPaymentsByUser: PaymentsByUser = {};
    const nextDueDatesByUser: DueDatesByUser = {};

    users.forEach((item) => {
      const normalizedInstallments = normalizeInstallments(
        item.paymentValues,
        item.paymentDueDates,
      );

      nextPaymentsByUser[item.id] = normalizedInstallments.values;
      nextDueDatesByUser[item.id] = normalizedInstallments.dueDates;
    });

    setPaymentsByUser(nextPaymentsByUser);
    setDueDatesByUser(nextDueDatesByUser);
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
      const current = prev[userId] || [];
      const updated = [...current];

      while (updated.length <= paymentIndex) {
        updated.push(0);
      }

      updated[paymentIndex] = safeValue;
      return {
        ...prev,
        [userId]: updated,
      };
    });
  };

  const handleSavePayments = async (userId: string) => {
    const values = paymentsByUser[userId] || [];
    const dueDates = dueDatesByUser[userId] || [];
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
          paymentDueDates: dueDates,
          paymentNotificationPending: true,
          paymentNotificationMessage: "Atualizado Pagamento",
          paymentNotificationUpdatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } finally {
      setSavingByUser((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const handleDueDateChange = (
    userId: string,
    paymentIndex: number,
    value: string,
  ) => {
    const formattedValue = formatDayMonthInput(value);

    setDueDatesByUser((prev) => {
      const current = prev[userId] || [];
      const updated = [...current];

      while (updated.length <= paymentIndex) {
        updated.push("");
      }

      updated[paymentIndex] = formattedValue;
      return {
        ...prev,
        [userId]: updated,
      };
    });
  };

  const handleAddPayment = (userId: string) => {
    const currentCount = Math.max(
      (paymentsByUser[userId] || []).length,
      (dueDatesByUser[userId] || []).length,
    );

    if (currentCount >= MAX_INSTALLMENTS) {
      return;
    }

    setPaymentsByUser((prev) => ({
      ...prev,
      [userId]: [...(prev[userId] || []), 0],
    }));

    setDueDatesByUser((prev) => ({
      ...prev,
      [userId]: [...(prev[userId] || []), ""],
    }));
  };

  const handleRemovePayment = (userId: string, paymentIndex: number) => {
    setPaymentsByUser((prev) => ({
      ...prev,
      [userId]: (prev[userId] || []).filter((_, index) => index !== paymentIndex),
    }));

    setDueDatesByUser((prev) => ({
      ...prev,
      [userId]: (prev[userId] || []).filter((_, index) => index !== paymentIndex),
    }));
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
        <div className="mb-4 flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin">
              <Shield className="mr-2 h-4 w-4" />
              Abrir Admin
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
                  const paymentValues = paymentsByUser[item.id] || [];
                  const paymentDueDates = dueDatesByUser[item.id] || [];
                  const installmentsCountRaw = Math.max(
                    paymentValues.length,
                    paymentDueDates.length,
                  );
                  const installmentsCount = Math.min(
                    installmentsCountRaw,
                    MAX_INSTALLMENTS,
                  );
                  const firstBlockCount = Math.min(5, installmentsCount);
                  const secondBlockCount = Math.max(0, installmentsCount - 5);
                  const paid = paymentValues.reduce(
                    (acc, value) => acc + Number(value || 0),
                    0,
                  );
                  const debt = Math.max(total - paid, 0);
                  const progressPercentage =
                    total > 0 ? Math.min((Math.max(paid, 0) / total) * 100, 100) : 0;
                  const firstName = getFirstName(item.displayName);
                  const paymentStatus =
                    progressPercentage >= 100
                      ? "Pago"
                      : progressPercentage > 0
                        ? "Parcial"
                        : "Pendente";

                  return [
                      <TableRow key={`${item.id}-summary`}>
                        <TableCell className="font-medium">{firstName}</TableCell>
                        <TableCell>{formatCurrency(total)}</TableCell>
                        <TableCell>{formatCurrency(paid)}</TableCell>
                        <TableCell>{formatCurrency(debt)}</TableCell>
                        <TableCell>
                          <div className="min-w-32 space-y-1">
                            <div className="text-xs font-medium">
                              {paymentStatus}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {progressPercentage.toFixed(0)}%
                            </div>
                            <Progress value={progressPercentage} />
                          </div>
                        </TableCell>
                      </TableRow>,

                      <TableRow key={`${item.id}-payments`}>
                        <TableCell colSpan={5}>
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => handleAddPayment(item.id)}
                                disabled={installmentsCountRaw >= MAX_INSTALLMENTS}
                              >
                                + Pagamento
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => handleSavePayments(item.id)}
                                disabled={Boolean(savingByUser[item.id])}
                              >
                                {savingByUser[item.id] ? "Salvando..." : "Salvar"}
                              </Button>
                            </div>

                            <div className="overflow-x-auto">
                              <div className="grid min-w-[36rem] grid-cols-1 gap-4 md:grid-cols-2">
                                {installmentsCount === 0 && (
                                  <p className="text-sm text-muted-foreground">
                                    Nenhuma parcela adicionada.
                                  </p>
                                )}

                                {firstBlockCount > 0 && (
                                  <div className="space-y-2">
                                    {Array.from({ length: firstBlockCount }).map((_, index) => (
                                      <div
                                        key={`${item.id}-payment-${index + 1}`}
                                        className="flex items-center gap-2"
                                      >
                                        <span className="w-16 text-sm text-muted-foreground">
                                          Parc. {index + 1}
                                        </span>
                                        <Input
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
                                          className="w-28"
                                        />
                                        <Input
                                          type="text"
                                          inputMode="numeric"
                                          placeholder="dd/MM"
                                          value={paymentDueDates[index] || ""}
                                          onChange={(event) =>
                                            handleDueDateChange(
                                              item.id,
                                              index,
                                              event.target.value,
                                            )
                                          }
                                          className="w-24"
                                        />
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          onClick={() => handleRemovePayment(item.id, index)}
                                        >
                                          Excluir
                                        </Button>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {secondBlockCount > 0 && (
                                  <div className="space-y-2">
                                    {Array.from({ length: secondBlockCount }).map((_, index) => {
                                      const installmentIndex = index + 5;

                                      return (
                                        <div
                                          key={`${item.id}-payment-${installmentIndex + 1}`}
                                          className="flex items-center gap-2"
                                        >
                                          <span className="w-16 text-sm text-muted-foreground">
                                            Parc. {installmentIndex + 1}
                                          </span>
                                          <Input
                                            type="text"
                                            inputMode="decimal"
                                            value={formatCurrencyInput(paymentValues[installmentIndex] || 0)}
                                            onChange={(event) =>
                                              handlePaymentChange(
                                                item.id,
                                                installmentIndex,
                                                event.target.value,
                                              )
                                            }
                                            className="w-28"
                                          />
                                          <Input
                                            type="text"
                                            inputMode="numeric"
                                            placeholder="dd/MM"
                                            value={paymentDueDates[installmentIndex] || ""}
                                            onChange={(event) =>
                                              handleDueDateChange(
                                                item.id,
                                                installmentIndex,
                                                event.target.value,
                                              )
                                            }
                                            className="w-24"
                                          />
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() =>
                                              handleRemovePayment(item.id, installmentIndex)
                                            }
                                          >
                                            Excluir
                                          </Button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
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
