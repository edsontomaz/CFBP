"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  useUser,
  useFirestore,
  useDoc,
  useMemoFirebase,
} from "@/firebase";
import { doc, Timestamp } from "firebase/firestore";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft, Loader2 } from "lucide-react";

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

export default function AdminViewUserPage() {
  const { user: adminUser, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const params = useParams();
  const userId = params.userId as string;

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
        <Button variant="outline" asChild className="mb-4">
          <Link href="/admin">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar para o Painel
          </Link>
        </Button>

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
      </main>
    </div>
  );
}
