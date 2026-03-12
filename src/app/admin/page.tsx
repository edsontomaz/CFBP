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
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, FolderPlus, ArrowLeft, Wallet } from "lucide-react";

interface UserProfile {
  id: string;
  displayName: string;
  apelido?: string;
  email: string;
  role: string;
  grupo?: string[];
  eventTotalAmount?: number;
  billingEnabled?: boolean;
}

interface GroupData {
  id: string;
  name: string;
}

type EventValueByUser = Record<string, number>;
type BillingByUser = Record<string, boolean>;
const NO_GROUP_FILTER = "__no_group__";

export default function AdminDashboardPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const [eventValueByUser, setEventValueByUser] =
    useState<EventValueByUser>({});
  const [billingByUser, setBillingByUser] = useState<BillingByUser>({});
  const [savingByUser, setSavingByUser] = useState<Record<string, boolean>>({});
  const [selectedGroupFilter, setSelectedGroupFilter] = useState("all");

  const getFirstName = (fullName?: string) => {
    if (!fullName) return "Sem nome";
    return fullName.trim().split(" ")[0] || "Sem nome";
  };

  const getDisplayNameForAdmin = (userProfile: UserProfile) => {
    const nickname = String(userProfile.apelido || "").trim();
    if (nickname) return nickname;
    return getFirstName(userProfile.displayName);
  };

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

  const groupsQuery = useMemoFirebase(() => {
    if (currentUserProfile && currentUserProfile.role === "admin") {
      return collection(firestore, "groups");
    }
    return null;
  }, [firestore, currentUserProfile]);

  const { data: groups, isLoading: areGroupsLoading } =
    useCollection<GroupData>(groupsQuery);

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

  const isLoading =
    isUserLoading || isProfileLoading || areUsersLoading || areGroupsLoading;

  const availableGroups = Array.from(
    new Set((groups || []).map((group) => group.name).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));

  useEffect(() => {
    if (selectedGroupFilter === "all" || selectedGroupFilter === NO_GROUP_FILTER) {
      return;
    }

    if (!availableGroups.includes(selectedGroupFilter)) {
      setSelectedGroupFilter("all");
    }
  }, [availableGroups, selectedGroupFilter]);

  const filteredUsers = (users || []).filter((u) => {
    if (selectedGroupFilter === "all") return true;
    if (selectedGroupFilter === NO_GROUP_FILTER) {
      return !Array.isArray(u.grupo) || u.grupo.length === 0;
    }
    return Array.isArray(u.grupo) && u.grupo.includes(selectedGroupFilter);
  });

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
          <Button asChild variant="outline">
            <Link href="/admin/financeiro">
              <Wallet className="mr-2 h-4 w-4" />
              Resumo Financeiro
            </Link>
          </Button>
          <Button asChild variant="outline">
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
              Gerencie os usuários cadastrados no sistema. ({filteredUsers.length}
              {" "}de {users?.length || 0} usuários)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Valor do Evento</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead>
                    <div className="space-y-1">
                      <span>Grupo</span>
                      <Select
                        value={selectedGroupFilter}
                        onValueChange={setSelectedGroupFilter}
                      >
                        <SelectTrigger className="h-8 w-[180px]">
                          <SelectValue placeholder="Filtrar grupo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos os grupos</SelectItem>
                          <SelectItem value={NO_GROUP_FILTER}>Sem grupo</SelectItem>
                          {availableGroups.map((groupName) => (
                            <SelectItem key={groupName} value={groupName}>
                              {groupName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        {getDisplayNameForAdmin(u)}
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
                      <TableCell>
                        {Array.isArray(u.grupo) && u.grupo.length > 0
                          ? u.grupo.join(", ")
                          : "Sem grupo"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/admin/view/${u.id}`}>Perfil</Link>
                          </Button>
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/admin/edit/${u.id}`}>Grupo</Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
            {filteredUsers.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                Nenhum usuário encontrado para o filtro selecionado.
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
