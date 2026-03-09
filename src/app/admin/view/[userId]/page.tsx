"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  useUser,
  useFirestore,
  useDoc,
  useMemoFirebase,
  useCollection,
  deleteDocumentNonBlocking,
  setDocumentNonBlocking,
} from "@/firebase";
import {
  collection,
  doc,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
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
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AdminProfile {
  role: string;
}

interface ReadonlyUserProfile {
  apelido?: string;
  displayName?: string;
  email?: string;
  dataNascimento?: string | Timestamp;
  sexo?: string;
  cpf?: string;
  rg?: string;
  endereco?: string;
  cep?: string;
  cidade?: string;
  estado?: string;
  telefone?: string;
  telefoneEmergencia?: string;
  nacionalidade?: string;
  tipoSanguineo?: string;
  alergias?: string;
  possuiConvenio?: string;
  nomeConvenio?: string;
  profissao?: string;
  fezCF?: boolean;
  modalidade?: string[];
  motivacaoViagem?: string[];
  grupo?: string[];
  uploadGroups?: string[];
}

interface UniformeChoiceHistoryEntry {
  id: string;
  createdAt?: Timestamp;
  savedAtClient?: string;
  jerseySize?: string;
  jerseyQuantity?: number;
  bretelleSize?: string;
  bretelleQuantity?: number;
  manguitoSize?: string;
  manguitoQuantity?: number;
  casualSize?: string;
  casualQuantity?: number;
  bermudaSize?: string;
  bermudaQuantity?: number;
  totalAmount?: number;
}

const getDisplayValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (value instanceof Timestamp) {
    return value.toDate().toLocaleString("pt-BR");
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return "-";
    return value.map((item) => getDisplayValue(item)).join(", ");
  }

  if (typeof value === "boolean") {
    return value ? "Sim" : "Não";
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return "[Objeto]";
    }
  }

  return String(value);
};

const formatHistoryDate = (value?: Timestamp, fallback?: string) => {
  if (value instanceof Timestamp) {
    return value.toDate().toLocaleString("pt-BR");
  }

  if (!fallback) return "-";

  const parsedDate = new Date(fallback);
  if (Number.isNaN(parsedDate.getTime())) {
    return fallback;
  }

  return parsedDate.toLocaleString("pt-BR");
};

const formatHistoryItem = (size?: string, quantity?: number) => {
  const safeQuantity = Number(quantity || 0);
  if (!Number.isFinite(safeQuantity) || safeQuantity <= 0) return "-";
  return `${size || "-"} / ${safeQuantity}`;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

const toSafePositiveNumber = (value: unknown) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const normalizeSize = (value?: string) => {
  const normalized = String(value || "").trim();
  return normalized.length > 0 ? normalized : "N/A";
};

export default function AdminViewUserPage() {
  const { user: adminUser, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const params = useParams();
  const userId = params.userId as string;
  const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null);

  const adminDocRef = useMemoFirebase(
    () => (adminUser ? doc(firestore, "users", adminUser.uid) : null),
    [firestore, adminUser],
  );
  const { data: adminProfile, isLoading: isAdminProfileLoading } =
    useDoc<AdminProfile>(adminDocRef);

  const userDocRef = useMemoFirebase(
    () => doc(firestore, "users", userId),
    [firestore, userId],
  );
  const { data: userProfile, isLoading: isProfileLoading } =
    useDoc<ReadonlyUserProfile>(userDocRef);
  const historyCollectionRef = useMemoFirebase(
    () => collection(firestore, "users", userId, "uniformeHistory"),
    [firestore, userId],
  );
  const historyQuery = useMemoFirebase(
    () => query(historyCollectionRef, orderBy("createdAt", "desc")),
    [historyCollectionRef],
  );
  const { data: uniformeHistory, isLoading: isHistoryLoading } =
    useCollection<UniformeChoiceHistoryEntry>(historyQuery);

  useEffect(() => {
    if (!isUserLoading && !adminUser) {
      router.push("/login");
    }

    if (
      !isAdminProfileLoading &&
      adminProfile &&
      adminProfile.role !== "admin"
    ) {
      router.push("/");
    }
  }, [adminUser, adminProfile, isUserLoading, isAdminProfileLoading, router]);

  const isLoading = isUserLoading || isAdminProfileLoading || isProfileLoading;

  const handleDeleteHistory = async (historyId: string) => {
    if (!historyId) return;

    try {
      setDeletingHistoryId(historyId);
      await deleteDocumentNonBlocking(
        doc(firestore, "users", userId, "uniformeHistory", historyId),
      );

      const remainingHistory = (uniformeHistory || []).filter(
        (entry) => entry.id !== historyId,
      );
      const latestEntry = remainingHistory[0];

      await setDocumentNonBlocking(
        doc(firestore, "users", userId),
        {
          uniformeChoiceSize: latestEntry
            ? normalizeSize(latestEntry.jerseySize)
            : "N/A",
          uniformeChoiceBretelleSize: latestEntry
            ? normalizeSize(latestEntry.bretelleSize)
            : "N/A",
          uniformeChoiceManguitoSize: latestEntry
            ? normalizeSize(latestEntry.manguitoSize)
            : "N/A",
          uniformeChoiceCasualSize: latestEntry
            ? normalizeSize(latestEntry.casualSize)
            : "N/A",
          uniformeChoiceBermudaSize: latestEntry
            ? normalizeSize(latestEntry.bermudaSize)
            : "N/A",
          uniformeChoiceQuantity: toSafePositiveNumber(
            latestEntry?.jerseyQuantity,
          ),
          uniformeChoiceBretelleQuantity: toSafePositiveNumber(
            latestEntry?.bretelleQuantity,
          ),
          uniformeChoiceManguitoQuantity: toSafePositiveNumber(
            latestEntry?.manguitoQuantity,
          ),
          uniformeChoiceCasualQuantity: toSafePositiveNumber(
            latestEntry?.casualQuantity,
          ),
          uniformeChoiceBermudaQuantity: toSafePositiveNumber(
            latestEntry?.bermudaQuantity,
          ),
          uniformeChoiceTotalAmount: toSafePositiveNumber(
            latestEntry?.totalAmount,
          ),
          uniformeChoiceUpdatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      toast({
        title: "Histórico removido",
        description:
          "A linha selecionada foi removida e o pedido atual foi sincronizado.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao remover",
        description:
          "Não foi possível remover a linha do histórico e sincronizar o pedido atual.",
      });
    } finally {
      setDeletingHistoryId(null);
    }
  };

  if (isLoading || !adminProfile || adminProfile.role !== "admin") {
    return (
      <div className="flex min-h-screen w-full items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  const profileFields = userProfile
    ? [
        { label: "Apelido", value: userProfile.apelido },
        { label: "Nome Completo", value: userProfile.displayName },
        { label: "E-mail", value: userProfile.email },
        { label: "Data de Nascimento", value: userProfile.dataNascimento },
        { label: "Sexo", value: userProfile.sexo },
        { label: "CPF", value: userProfile.cpf },
        { label: "RG", value: userProfile.rg },
        { label: "Endereço", value: userProfile.endereco },
        { label: "CEP", value: userProfile.cep },
        { label: "Cidade", value: userProfile.cidade },
        { label: "Estado", value: userProfile.estado },
        { label: "Telefone", value: userProfile.telefone },
        { label: "Telefone de Emergência", value: userProfile.telefoneEmergencia },
        { label: "Nacionalidade", value: userProfile.nacionalidade },
        { label: "Tipo Sanguíneo", value: userProfile.tipoSanguineo },
        { label: "Alergias", value: userProfile.alergias },
        { label: "Possui Convênio", value: userProfile.possuiConvenio },
        { label: "Nome do Convênio", value: userProfile.nomeConvenio },
        { label: "Profissão", value: userProfile.profissao },
        { label: "Fez Caminho da Fé", value: userProfile.fezCF },
        { label: "Modalidade", value: userProfile.modalidade },
        { label: "Motivação da Viagem", value: userProfile.motivacaoViagem },
        { label: "Grupos", value: userProfile.grupo },
        { label: "Grupos com Gravação", value: userProfile.uploadGroups },
      ]
    : [];

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="container mx-auto max-w-3xl flex-1 p-4 md:p-8">
        <div className="mb-4 flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/admin">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar para o Painel
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/admin/pay-uniforme">Pagamento Uniforme</Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-headline text-2xl">
              Meu Perfil
            </CardTitle>
            <CardDescription>
              Visualização somente leitura do perfil do usuário correspondente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!userProfile ? (
              <p className="text-muted-foreground">Usuário não encontrado.</p>
            ) : (
              <div className="space-y-3">
                {profileFields.map((field) => (
                  <div key={field.label} className="rounded-md border p-3">
                    <p className="text-sm font-medium">{field.label}</p>
                    <p className="mt-1 break-words text-sm text-muted-foreground">
                      {getDisplayValue(field.value)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="font-headline text-2xl">
              Histórico de Pedido de Uniforme
            </CardTitle>
            <CardDescription>
              O administrador pode remover qualquer linha do histórico do usuário.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isHistoryLoading ? (
              <p className="text-muted-foreground">Carregando histórico...</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Jersey</TableHead>
                    <TableHead>Bretelle</TableHead>
                    <TableHead>Manguito</TableHead>
                    <TableHead>Casual</TableHead>
                    <TableHead>Bermuda</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {uniformeHistory && uniformeHistory.length > 0 ? (
                    uniformeHistory.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          {formatHistoryDate(item.createdAt, item.savedAtClient)}
                        </TableCell>
                        <TableCell>
                          {formatHistoryItem(item.jerseySize, item.jerseyQuantity)}
                        </TableCell>
                        <TableCell>
                          {formatHistoryItem(item.bretelleSize, item.bretelleQuantity)}
                        </TableCell>
                        <TableCell>
                          {formatHistoryItem(item.manguitoSize, item.manguitoQuantity)}
                        </TableCell>
                        <TableCell>
                          {formatHistoryItem(item.casualSize, item.casualQuantity)}
                        </TableCell>
                        <TableCell>
                          {formatHistoryItem(item.bermudaSize, item.bermudaQuantity)}
                        </TableCell>
                        <TableCell>{formatCurrency(Number(item.totalAmount || 0))}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => void handleDeleteHistory(item.id)}
                            disabled={deletingHistoryId === item.id}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="text-muted-foreground">
                        Nenhum histórico de pedido encontrado para este usuário.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
