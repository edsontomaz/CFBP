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
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, FolderPlus, ArrowLeft } from "lucide-react";

interface UserProfile {
  id: string;
  displayName: string;
  email: string;
  role: string;
  eventTotalAmount?: number;
  billingEnabled?: boolean;
}

type EventValueByUser = Record<string, number>;
type BillingByUser = Record<string, boolean>;

export default function AdminDashboardPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const [eventValueByUser, setEventValueByUser] =
    useState<EventValueByUser>({});
  const [billingByUser, setBillingByUser] = useState<BillingByUser>({});
  const [savingByUser, setSavingByUser] = useState<Record<string, boolean>>({});

  const userDocRef = useMemoFirebase(
    () => (user ? doc(firestore, "users", user.uid) : null),
    [firestore, user],
  );
  const { data: currentUserProfile, isLoading: isProfileLoading } = useDoc<{
    role: string;
  }>(userDocRef);

  const usersQuery = useMemoFirebase(() => {
    // Only fetch users if the current user is confirmed to be an admin
    if (currentUserProfile && currentUserProfile.role === "admin") {
      return collection(firestore, "users");
    }
    return null;
  }, [firestore, currentUserProfile]);

  const { data: users, isLoading: areUsersLoading } =
    useCollection<UserProfile>(usersQuery);

  useEffect(() => {
    if (!users) return;

    const nextEventValueByUser: EventValueByUser = {};
    const nextBillingByUser: BillingByUser = {};

    users.forEach((item) => {
      nextEventValueByUser[item.id] = Number(item.eventTotalAmount || 0);
      nextBillingByUser[item.id] = Boolean(item.billingEnabled);
    });

    setEventValueByUser(nextEventValueByUser);
    setBillingByUser(nextBillingByUser);
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

  const handleEventValueChange = (userId: string, value: string) => {
    const normalized = value.replace(",", ".").replace(/[^\d.]/g, "");
    const parsed = normalized === "" ? 0 : Number(normalized);
    const safeValue = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;

    setEventValueByUser((prev) => ({
      ...prev,
      [userId]: safeValue,
    }));
  };

  const saveBillingSettings = async (
    userId: string,
    overrides?: { eventTotalAmount?: number; billingEnabled?: boolean },
  ) => {
    try {
      setSavingByUser((prev) => ({ ...prev, [userId]: true }));
      const userRef = doc(firestore, "users", userId);

      await setDocumentNonBlocking(
        userRef,
        {
          eventTotalAmount: Number(
            overrides?.eventTotalAmount ?? eventValueByUser[userId] ?? 0,
          ),
          billingEnabled: Boolean(
            overrides?.billingEnabled ?? billingByUser[userId],
          ),
          updatedAt: serverTimestamp(),
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
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="mb-4 flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Link>
          </Button>
          <Button asChild>
            <Link href="/admin/groups">
              <FolderPlus className="mr-2 h-4 w-4" />
              Gerenciar Grupos
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-headline text-2xl">
              Painel do Administrador
            </CardTitle>
            <CardDescription>
              Gerencie os usuários cadastrados no sistema. ({users?.length || 0}{" "}
              usuários)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead>Valor do Evento</TableHead>
                  <TableHead>Habilitar Cobrança</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users &&
                  users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        {u.displayName}
                      </TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>
                        <Badge
                          variant={u.role === "admin" ? "default" : "secondary"}
                        >
                          {u.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="text"
                          inputMode="decimal"
                          placeholder="R$"
                          value={
                            eventValueByUser[u.id] && eventValueByUser[u.id] > 0
                              ? String(eventValueByUser[u.id])
                              : ""
                          }
                          onChange={(event) =>
                            handleEventValueChange(u.id, event.target.value)
                          }
                          onBlur={() => saveBillingSettings(u.id)}
                          className="w-28"
                          disabled={Boolean(savingByUser[u.id])}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={Boolean(billingByUser[u.id])}
                            onCheckedChange={(checked) => {
                              const nextBillingEnabled = Boolean(checked);
                              setBillingByUser((prev) => ({
                                ...prev,
                                [u.id]: nextBillingEnabled,
                              }));
                              void saveBillingSettings(u.id, {
                                billingEnabled: nextBillingEnabled,
                              });
                            }}
                            disabled={Boolean(savingByUser[u.id])}
                          />
                          <span className="text-sm text-muted-foreground">
                            {billingByUser[u.id] ? "Ativo" : "Inativo"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/admin/edit/${u.id}`}>Editar</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
            {(!users || users.length === 0) && (
              <div className="text-center py-16 text-muted-foreground">
                Nenhum usuário encontrado.
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
