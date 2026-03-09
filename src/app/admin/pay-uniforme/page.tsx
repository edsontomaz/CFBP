"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { Header } from "@/components/header";
import {
  useUser,
  useFirestore,
  useDoc,
  useCollection,
  useMemoFirebase,
  setDocumentNonBlocking,
} from "@/firebase";
import { collection, doc, serverTimestamp } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { ArrowLeft, Loader2, Shirt } from "lucide-react";

interface UniformeChoiceUser {
  id: string;
  displayName: string;
  role?: string;
  uniformeChoiceSize?: string;
  uniformeChoiceBretelleSize?: string;
  uniformeChoiceManguitoSize?: string;
  uniformeChoiceCasualSize?: string;
  uniformeChoiceBermudaSize?: string;
  uniformeChoiceQuantity?: number;
  uniformeChoiceBretelleQuantity?: number;
  uniformeChoiceManguitoQuantity?: number;
  uniformeChoiceCasualQuantity?: number;
  uniformeChoiceBermudaQuantity?: number;
  uniformeCF2026Price?: number;
  uniformeCF2026BretellePrice?: number;
  uniformeCF2026ManguitoPrice?: number;
  uniformeCF2026CasualPrice?: number;
  uniformeCF2026BermudaPrice?: number;
  uniformeChoiceTotalAmount?: number;
  uniformePaidAmount?: number;
  uniformePaymentConfirmed?: boolean;
  uniformePaymentValues?: number[];
  uniformePaymentDueDates?: string[];
}

type PaymentsByUser = Record<string, number[]>;
type DueDatesByUser = Record<string, string[]>;
const MAX_INSTALLMENTS = 10;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

const getFirstName = (fullName?: string) => {
  if (!fullName) return "Sem nome";
  return fullName.trim().split(" ")[0] || "Sem nome";
};

const toPositiveNumber = (value: unknown) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const parseCurrencyInput = (value: string) => {
  const digitsOnly = value.replace(/\D/g, "");
  if (!digitsOnly) return 0;
  return Number(digitsOnly) / 100;
};

const formatCurrencyInput = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

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
      const dueDate = String(dueDates[index] || "").trim();
      return value > 0 || dueDate.length > 0;
    });

  if (lastRelevantIndex === undefined) {
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
      String(dueDates[index] || ""),
    ),
  };
};

const formatChoice = (size?: string, quantity?: number) => {
  const qty = toPositiveNumber(quantity);
  const normalizedSize = String(size || "").trim();

  if (qty <= 0 || !normalizedSize || normalizedSize === "N/A") {
    return "-";
  }

  return `${normalizedSize} x${qty}`;
};

const computeChoiceTotal = (user: UniformeChoiceUser) => {
  const jerseyQty = toPositiveNumber(user.uniformeChoiceQuantity);
  const bretelleQty = toPositiveNumber(user.uniformeChoiceBretelleQuantity);
  const manguitoQty = toPositiveNumber(user.uniformeChoiceManguitoQuantity);
  const casualQty = toPositiveNumber(user.uniformeChoiceCasualQuantity);
  const bermudaQty = toPositiveNumber(user.uniformeChoiceBermudaQuantity);
  const jerseyPrice = Number(user.uniformeCF2026Price || 0);
  const bretellePrice = Number(user.uniformeCF2026BretellePrice || 0);
  const manguitoPrice = Number(user.uniformeCF2026ManguitoPrice || 0);
  const casualPrice = Number(user.uniformeCF2026CasualPrice || 0);
  const bermudaPrice = Number(user.uniformeCF2026BermudaPrice || 0);

  return (
    jerseyQty * jerseyPrice +
    bretelleQty * bretellePrice +
    manguitoQty * manguitoPrice +
    casualQty * casualPrice +
    bermudaQty * bermudaPrice
  );
};

export default function AdminPayUniformePage() {
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
    useCollection<UniformeChoiceUser>(usersQuery);
  const [paymentsByUser, setPaymentsByUser] = useState<PaymentsByUser>({});
  const [dueDatesByUser, setDueDatesByUser] = useState<DueDatesByUser>({});
  const [savingByUser, setSavingByUser] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!users) return;

    const nextPaymentsByUser: PaymentsByUser = {};
    const nextDueDatesByUser: DueDatesByUser = {};

    users.forEach((item) => {
      const normalizedInstallments = normalizeInstallments(
        item.uniformePaymentValues,
        item.uniformePaymentDueDates,
        item.uniformePaidAmount,
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

  const usersWithChoice = useMemo(() => {
    if (!users) return [] as Array<UniformeChoiceUser & { total: number }>;

    return users
      .filter((item) => item.role !== "admin")
      .map((item) => {
        const totalFromChoice = computeChoiceTotal(item);
        const savedTotal = Number(item.uniformeChoiceTotalAmount || 0);
        const total = savedTotal > 0 ? savedTotal : totalFromChoice;
        return { ...item, total };
      })
      .filter((item) => item.total > 0)
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "pt-BR"));
  }, [users]);

  const totalGeral = usersWithChoice.reduce((acc, item) => acc + item.total, 0);

  const handleExportOrders = () => {
    const rows = usersWithChoice.map((item) => {
      const paymentValues = paymentsByUser[item.id] || [];
      const currentPaid = paymentValues.reduce(
        (acc, value) => acc + Number(value || 0),
        0,
      );
      const remaining = Math.max(item.total - currentPaid, 0);
      const progressPercentage =
        item.total > 0
          ? Math.min((Math.max(currentPaid, 0) / item.total) * 100, 100)
          : 0;
      const paymentStatus =
        progressPercentage >= 100
          ? "Pago"
          : progressPercentage > 0
            ? "Parcial"
            : "Pendente";

      return {
        Usuario: getFirstName(item.displayName),
        "Jersey Tamanho": String(item.uniformeChoiceSize || "").trim() || "-",
        "Jersey Quantidade": toPositiveNumber(item.uniformeChoiceQuantity),
        "Bretelle Tamanho":
          String(item.uniformeChoiceBretelleSize || "").trim() || "-",
        "Bretelle Quantidade": toPositiveNumber(item.uniformeChoiceBretelleQuantity),
        "Manguito Tamanho":
          String(item.uniformeChoiceManguitoSize || "").trim() || "-",
        "Manguito Quantidade": toPositiveNumber(item.uniformeChoiceManguitoQuantity),
        "Casual Tamanho":
          String(item.uniformeChoiceCasualSize || "").trim() || "-",
        "Casual Quantidade": toPositiveNumber(item.uniformeChoiceCasualQuantity),
        "Bermuda Tamanho":
          String(item.uniformeChoiceBermudaSize || "").trim() || "-",
        "Bermuda Quantidade": toPositiveNumber(item.uniformeChoiceBermudaQuantity),
        Pago: currentPaid,
        Devedor: remaining,
        Status: paymentStatus,
        Total: item.total,
      };
    });

    const sheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Pedidos Uniforme");
    XLSX.writeFile(workbook, "pay-uniforme-pedidos.xlsx");
  };

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

  const handleSavePayments = async (userId: string, total: number) => {
    const userRef = doc(firestore, "users", userId);
    const values = paymentsByUser[userId] || [];
    const dueDates = dueDatesByUser[userId] || [];
    const totalPaid = values.reduce((acc, value) => acc + Number(value || 0), 0);
    const isConfirmed = total > 0 && totalPaid >= total;

    try {
      setSavingByUser((prev) => ({ ...prev, [userId]: true }));

      await setDocumentNonBlocking(
        userRef,
        {
          uniformePaymentValues: values,
          uniformePaymentDueDates: dueDates,
          uniformePaidAmount: totalPaid,
          uniformePaymentConfirmed: isConfirmed,
          uniformePaymentUpdatedAt: serverTimestamp(),
          uniformePaymentConfirmedAt: isConfirmed ? serverTimestamp() : null,
        },
        { merge: true },
      );
    } finally {
      setSavingByUser((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const isLoading = isUserLoading || isProfileLoading || areUsersLoading;

  if (isLoading || !currentUserProfile || currentUserProfile.role !== "admin") {
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
        <div className="mb-4 flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleExportOrders}
            disabled={usersWithChoice.length === 0}
          >
            Exportar Pedidos
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl font-headline">
              <Shirt className="h-6 w-6" />
              Pay Uniforme
            </CardTitle>
            <CardDescription>
              Usuarios com escolha de uniforme salva e valor total do pedido.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Jersey</TableHead>
                  <TableHead>Bretelle</TableHead>
                  <TableHead>Manguito</TableHead>
                  <TableHead>Casual</TableHead>
                  <TableHead>Bermuda</TableHead>
                  <TableHead>Pago</TableHead>
                  <TableHead>Devedor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersWithChoice.map((item) => {
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
                  const currentPaid = paymentValues.reduce(
                    (acc, value) => acc + Number(value || 0),
                    0,
                  );
                  const remaining = Math.max(item.total - currentPaid, 0);
                  const progressPercentage =
                    item.total > 0
                      ? Math.min((Math.max(currentPaid, 0) / item.total) * 100, 100)
                      : 0;
                  const paymentStatus =
                    progressPercentage >= 100
                      ? "Pago"
                      : progressPercentage > 0
                        ? "Parcial"
                        : "Pendente";

                  return [
                    <TableRow key={`${item.id}-summary`}>
                        <TableCell className="font-medium">
                          {getFirstName(item.displayName)}
                        </TableCell>
                        <TableCell>
                          {formatChoice(item.uniformeChoiceSize, item.uniformeChoiceQuantity)}
                        </TableCell>
                        <TableCell>
                          {formatChoice(
                            item.uniformeChoiceBretelleSize,
                            item.uniformeChoiceBretelleQuantity,
                          )}
                        </TableCell>
                        <TableCell>
                          {formatChoice(
                            item.uniformeChoiceManguitoSize,
                            item.uniformeChoiceManguitoQuantity,
                          )}
                        </TableCell>
                        <TableCell>
                          {formatChoice(
                            item.uniformeChoiceCasualSize,
                            item.uniformeChoiceCasualQuantity,
                          )}
                        </TableCell>
                        <TableCell>
                          {formatChoice(
                            item.uniformeChoiceBermudaSize,
                            item.uniformeChoiceBermudaQuantity,
                          )}
                        </TableCell>
                        <TableCell>{formatCurrency(currentPaid)}</TableCell>
                        <TableCell>{formatCurrency(remaining)}</TableCell>
                        <TableCell>
                          <div className="min-w-32 space-y-1">
                            <div className="text-xs font-medium">{paymentStatus}</div>
                            <div className="text-xs text-muted-foreground">
                              {progressPercentage.toFixed(0)}%
                            </div>
                            <Progress value={progressPercentage} />
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(item.total)}
                        </TableCell>
                      </TableRow>,

                    <TableRow key={`${item.id}-payments`}>
                      <TableCell colSpan={10}>
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Button type="button" size="sm" variant="outline" asChild>
                                <Link href={`/admin/view/${item.id}`}>Perfil</Link>
                              </Button>
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
                                onClick={() => void handleSavePayments(item.id, item.total)}
                                disabled={Boolean(savingByUser[item.id])}
                              >
                                {savingByUser[item.id] ? "Salvando..." : "Salvar"}
                              </Button>
                            </div>

                            <div className="overflow-x-auto">
                              <div className="grid min-w-[36rem] grid-cols-1 gap-4 md:grid-cols-2">
                                {installmentsCount === 0 && (
                                  <p className="text-sm text-muted-foreground">
                                    Nenhum pagamento adicionado.
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
                                            value={formatCurrencyInput(
                                              paymentValues[installmentIndex] || 0,
                                            )}
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
                    </TableRow>,
                  ];
                })}

                {usersWithChoice.length > 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="font-semibold">
                      Total Geral
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(totalGeral)}
                    </TableCell>
                  </TableRow>
                )}

                {usersWithChoice.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-muted-foreground">
                      Nenhum usuario com escolha de uniforme salva ainda.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
