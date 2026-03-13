"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useUser,
  useFirestore,
  useDoc,
  useMemoFirebase,
  setDocumentNonBlocking,
  useAuth,
} from "@/firebase";
import { doc, serverTimestamp, Timestamp } from "firebase/firestore";
import {
  updateEmail,
  reauthenticateWithCredential,
  EmailAuthProvider,
  verifyBeforeUpdateEmail,
  sendPasswordResetEmail,
} from "firebase/auth";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Header } from "@/components/header";
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const profileFormSchema = z
  .object({
    apelido: z.string().optional(),
    displayName: z.string().min(3, "O nome deve ter pelo menos 3 caracteres."),
    email: z.string().email("Informe um e-mail válido."),
    sexo: z.string().optional(),
    endereco: z.string().min(1, "Endereço é obrigatório."),
    cep: z.string().optional(),
    cidade: z.string().min(1, "Cidade é obrigatória."),
    estado: z.string().optional(),
    telefone: z.string().min(1, "Telefone é obrigatório."),
    telefoneEmergencia: z.string().optional(),
    nacionalidade: z.string().optional(),
    tipoSanguineo: z.string().optional(),
    alergias: z.string().optional(),
    possuiConvenio: z.string().optional(),
    nomeConvenio: z.string().optional(),
    cpf: z.string().min(1, "CPF é obrigatório."),
    rg: z.string().optional(),
    dataNascimento: z
      .string()
      .min(1, "Data de nascimento é obrigatória.")
      .refine(
        (value) => /^\d{2}\/\d{2}\/\d{4}$/.test(value),
        "Use o formato DD/MM/AAAA.",
      ),
    profissao: z.string().optional(),
    fezCF: z.boolean().default(false).optional(),
    modalidade: z.array(z.string()).default([]).optional(),
    motivacaoViagem: z.array(z.string()).default([]).optional(),
    grupo: z.array(z.string()).default([]).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.possuiConvenio === "Sim" && !data.nomeConvenio?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nomeConvenio"],
        message: "Informe o nome do convênio.",
      });
    }
  });

type ProfileFormValues = z.infer<typeof profileFormSchema>;

const modalidades = [
  { id: "Caminhada", label: "Caminhada" },
  { id: "Ciclismo", label: "Ciclismo" },
  { id: "Corrida", label: "Corrida" },
];

const motivacoes = [
  { id: "Religiosidade", label: "Religiosidade" },
  { id: "Autoconhecimento", label: "Autoconhecimento" },
  { id: "Turismo", label: "Turismo" },
  { id: "Esporte", label: "Esporte" },
];

const SEXO_OPTIONS = ["Masculino", "Feminino", "Outro"] as const;
const TIPO_SANGUINEO_OPTIONS = [
  "NÃO SEI",
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
] as const;
const POSSUI_CONVENIO_OPTIONS = ["Sim", "Não"] as const;

function normalizeSexo(
  value: unknown,
): "Masculino" | "Feminino" | "Outro" | "" {
  const normalizedValue = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalizedValue) return "";

  const normalizedWithoutAccents = normalizedValue
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/["'`´.,;:!?()[\]{}]/g, "")
    .trim();

  if (
    ["masculino", "masc", "m", "homem"].includes(normalizedWithoutAccents) ||
    normalizedWithoutAccents.startsWith("masc")
  ) {
    return "Masculino";
  }

  if (
    ["feminino", "fem", "f", "mulher"].includes(normalizedWithoutAccents) ||
    normalizedWithoutAccents.startsWith("fem")
  ) {
    return "Feminino";
  }

  if (["outro", "outros", "o"].includes(normalizedWithoutAccents)) {
    return "Outro";
  }

  return "";
}

function normalizePossuiConvenio(value: unknown): "Sim" | "Não" | "" {
  if (value === true) return "Sim";
  if (value === false) return "Não";

  const normalizedValue = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalizedValue) return "";
  if (["sim", "s"].includes(normalizedValue)) return "Sim";
  if (["nao", "não", "n", "nao.", "não."].includes(normalizedValue)) {
    return "Não";
  }
  return "";
}

function normalizeTipoSanguineo(value: unknown): string {
  const normalizedValue = String(value || "")
    .trim()
    .toUpperCase();
  if (!normalizedValue) return "";
  if (normalizedValue === "NAO SEI") return "NÃO SEI";
  return TIPO_SANGUINEO_OPTIONS.includes(
    normalizedValue as (typeof TIPO_SANGUINEO_OPTIONS)[number],
  )
    ? normalizedValue
    : "";
}

const isNoMediaGroup = (groupName: string) =>
  groupName.trim().toUpperCase() === "NO MEDIA";

export default function ProfilePage() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const [showReauthDialog, setShowReauthDialog] = useState(false);
  const [reauthPassword, setReauthPassword] = useState("");
  const [showReauthPassword, setShowReauthPassword] = useState(false);
  const [emailToChange, setEmailToChange] = useState("");
  const [pendingFormValues, setPendingFormValues] =
    useState<ProfileFormValues | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const userDocRef = useMemoFirebase(
    () => (user ? doc(firestore, "users", user.uid) : null),
    [firestore, user],
  );
  const { data: userProfile, isLoading: isProfileLoading } =
    useDoc<ProfileFormValues>(userDocRef);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      apelido: "",
      displayName: "",
      email: "",
      sexo: "",
      endereco: "",
      cep: "",
      cidade: "",
      estado: "",
      telefone: "",
      telefoneEmergencia: "",
      nacionalidade: "",
      tipoSanguineo: "",
      alergias: "",
      possuiConvenio: "",
      nomeConvenio: "",
      cpf: "",
      rg: "",
      dataNascimento: "",
      profissao: "",
      fezCF: false,
      modalidade: [],
      motivacaoViagem: [],
      grupo: [],
    },
  });

  const formatBirthDateForInput = (dateValue: any): string => {
    if (!dateValue) return "";

    if (dateValue instanceof Timestamp) {
      const date = dateValue.toDate();
      const day = String(date.getDate()).padStart(2, "0");
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    }

    if (typeof dateValue === "string") {
      const trimmed = dateValue.split("T")[0].trim();

      if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
        return trimmed;
      }

      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        const [year, month, day] = trimmed.split("-");
        return `${day}/${month}/${year}`;
      }
    }

    return "";
  };

  const formatBirthDateOnType = (value: string): string => {
    const digits = value.replace(/\D/g, "").slice(0, 8);

    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  };

  const normalizeBirthDateForSave = (value?: string | null): string | null => {
    if (!value) return null;
    const trimmedValue = value.trim();

    const match = trimmedValue.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;

    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
  };

  const formatCepOnType = (value: string): string => {
    const digits = value.replace(/\D/g, "").slice(0, 8);

    if (digits.length <= 5) return digits;
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  };

  const formatPhoneOnType = (value: string): string => {
    const digits = value.replace(/\D/g, "").slice(0, 11);

    if (digits.length === 0) return "";
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;

    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const formatRgOnType = (value: string): string => {
    const digits = value.replace(/\D/g, "").slice(0, 9);

    if (digits.length === 0) return "";
    if (digits.length === 1) return digits;

    const body = digits.slice(0, -1);
    const checkDigit = digits.slice(-1);
    const formattedBody = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

    return `${formattedBody}-${checkDigit}`;
  };

  const formatCpfOnType = (value: string): string => {
    const digits = value.replace(/\D/g, "").slice(0, 11);

    if (digits.length <= 3) return digits;
    if (digits.length <= 6) {
      return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    }
    if (digits.length <= 9) {
      return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    }

    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  };

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push("/login");
    }
  }, [user, isUserLoading, router]);

  useEffect(() => {
    if (userProfile && !isProfileLoading) {
      const formData = {
        apelido: userProfile.apelido || "",
        displayName: userProfile.displayName || "",
        email: userProfile.email || "",
        sexo: normalizeSexo(userProfile.sexo),
        endereco: userProfile.endereco || "",
        cep: formatCepOnType(userProfile.cep || ""),
        cidade: userProfile.cidade || "",
        estado: userProfile.estado || "",
        telefone: formatPhoneOnType(userProfile.telefone || ""),
        telefoneEmergencia: formatPhoneOnType(userProfile.telefoneEmergencia || ""),
        nacionalidade: userProfile.nacionalidade || "",
        tipoSanguineo: normalizeTipoSanguineo(userProfile.tipoSanguineo),
        alergias: userProfile.alergias || "",
        possuiConvenio: normalizePossuiConvenio(userProfile.possuiConvenio),
        nomeConvenio: userProfile.nomeConvenio || "",
        cpf: formatCpfOnType(userProfile.cpf || ""),
        rg: formatRgOnType(userProfile.rg || ""),
        dataNascimento: formatBirthDateForInput(userProfile.dataNascimento),
        profissao: userProfile.profissao || "",
        fezCF: userProfile.fezCF || false,
        modalidade: userProfile.modalidade || [],
        motivacaoViagem: userProfile.motivacaoViagem || [],
        grupo: userProfile.grupo || [],
      };
      form.reset(formData);
    }
  }, [userProfile, isProfileLoading, form]);

  const handleReauthenticateAndUpdateEmail = async () => {
    if (!user || !user.email || !reauthPassword) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Preencha a senha para confirmar.",
      });
      return;
    }

    setIsAuthenticating(true);

    try {
      const credential = EmailAuthProvider.credential(
        user.email,
        reauthPassword,
      );
      await reauthenticateWithCredential(user, credential);

      // Após re-autenticação bem-sucedida, envia verificação para o novo email
      if (emailToChange) {
        await verifyBeforeUpdateEmail(user, emailToChange);
      }

      // Agora salva o perfil com os dados pendentes
      if (pendingFormValues && userDocRef) {
        const normalizedSexo = normalizeSexo(pendingFormValues.sexo);
        const fallbackSexo = String(pendingFormValues.sexo || "").trim();
        const normalizedPendingValues = {
          ...pendingFormValues,
          sexo: normalizedSexo || fallbackSexo,
          tipoSanguineo: normalizeTipoSanguineo(
            pendingFormValues.tipoSanguineo,
          ),
          possuiConvenio: normalizePossuiConvenio(
            pendingFormValues.possuiConvenio,
          ),
          nomeConvenio:
            normalizePossuiConvenio(pendingFormValues.possuiConvenio) === "Sim"
              ? pendingFormValues.nomeConvenio || ""
              : "",
        };

        const dataToSave = {
          ...normalizedPendingValues,
          dataNascimento: normalizeBirthDateForSave(
            pendingFormValues.dataNascimento,
          ),
          updatedAt: serverTimestamp(),
        };
        await setDocumentNonBlocking(userDocRef, dataToSave, { merge: true });
      }

      setShowReauthDialog(false);
      setReauthPassword("");
      setEmailToChange("");
      setPendingFormValues(null);

      toast({
        title: "Verificação enviada!",
        description: `Um link de confirmação foi enviado para ${emailToChange}. Clique nele para confirmar a mudança de email.`,
      });

      router.push("/");
    } catch (error: any) {
      console.error("Erro ao atualizar email:", error);
      toast({
        variant: "destructive",
        title: "Erro na atualização",
        description:
          error.message || "Senha incorreta ou erro ao atualizar email.",
      });
    } finally {
      setIsAuthenticating(false);
    }
  };

  const onSubmit = async (values: ProfileFormValues) => {
    if (!userDocRef || !user) return;

    const normalizedSexo = normalizeSexo(values.sexo);
    const fallbackSexo = String(values.sexo || "").trim();
    const normalizedPossuiConvenio = normalizePossuiConvenio(
      values.possuiConvenio,
    );

    const normalizedValues = {
      ...values,
      sexo: normalizedSexo || fallbackSexo,
      tipoSanguineo: normalizeTipoSanguineo(values.tipoSanguineo),
      possuiConvenio: normalizedPossuiConvenio,
      nomeConvenio:
        normalizedPossuiConvenio === "Sim" ? values.nomeConvenio || "" : "",
    };

    // Se o email foi alterado, requer re-autenticação
    if (normalizedValues.email && normalizedValues.email !== user.email) {
      setEmailToChange(normalizedValues.email);
      setPendingFormValues(normalizedValues);
      setShowReauthDialog(true);
      return;
    }

    // Sem mudança de email, salva normalmente
    const dataToSave = {
      ...normalizedValues,
      dataNascimento: normalizeBirthDateForSave(
        normalizedValues.dataNascimento,
      ),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDocumentNonBlocking(userDocRef, dataToSave, { merge: true });

      toast({
        title: "Perfil atualizado!",
        description: "Suas informações foram salvas com sucesso.",
      });

      router.push("/");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível salvar suas informações.",
      });
    }
  };

  const handleChangePassword = async () => {
    if (!user?.email) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível identificar o e-mail da conta.",
      });
      return;
    }

    try {
      await sendPasswordResetEmail(auth, user.email);
      toast({
        title: "Link enviado!",
        description: `Enviamos para ${user.email} o link para alterar sua senha.`,
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível enviar o link para alterar a senha.",
      });
    }
  };

  if (isUserLoading || isProfileLoading || !user || !userProfile) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <Header />
      <main className="container mx-auto max-w-3xl p-4 md:p-8">
        <Button variant="outline" asChild className="mb-4">
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Link>
        </Button>
        <h1 className="mb-8 text-3xl font-bold font-headline text-center">
          Meu Perfil
        </h1>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-8"
          >
            <FormField
              control={form.control}
              name="apelido"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Apelido</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Seu apelido"
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Nome Completo</FormLabel>
                  <FormControl>
                    <Input placeholder="Seu nome completo" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>E-mail</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dataNascimento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de Nascimento</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="DD/MM/AAAA"
                      maxLength={10}
                      {...field}
                      value={field.value || ""}
                      onChange={(event) =>
                        field.onChange(
                          formatBirthDateOnType(event.target.value),
                        )
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sexo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sexo</FormLabel>
                  <Select
                    key={field.value}
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    value={field.value || ""}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Masculino">Masculino</SelectItem>
                      <SelectItem value="Feminino">Feminino</SelectItem>
                      <SelectItem value="Outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="cpf"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CPF</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      inputMode="numeric"
                      maxLength={14}
                      placeholder="000.000.000-00"
                      {...field}
                      value={field.value || ""}
                      onChange={(event) =>
                        field.onChange(formatCpfOnType(event.target.value))
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="rg"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>RG</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      inputMode="numeric"
                      maxLength={12}
                      placeholder="00.000.000-0"
                      {...field}
                      value={field.value || ""}
                      onChange={(event) =>
                        field.onChange(formatRgOnType(event.target.value))
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="endereco"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Endereço</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Rua, Número"
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="cep"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CEP</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      inputMode="numeric"
                      maxLength={9}
                      placeholder="00000-000"
                      {...field}
                      value={field.value || ""}
                      onChange={(event) =>
                        field.onChange(formatCepOnType(event.target.value))
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="cidade"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cidade</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value || ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="estado"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value || ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="telefone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefone</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      inputMode="numeric"
                      maxLength={15}
                      placeholder="(00) 90000-0000"
                      {...field}
                      value={field.value || ""}
                      onChange={(event) =>
                        field.onChange(formatPhoneOnType(event.target.value))
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="telefoneEmergencia"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefone de Emergência</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      inputMode="numeric"
                      maxLength={15}
                      placeholder="(00) 90000-0000"
                      {...field}
                      value={field.value || ""}
                      onChange={(event) =>
                        field.onChange(formatPhoneOnType(event.target.value))
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="nacionalidade"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nacionalidade</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value || ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="profissao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Profissão</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value || ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tipoSanguineo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo sanguíneo</FormLabel>
                  <Select
                    key={field.value}
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    value={field.value || ""}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {TIPO_SANGUINEO_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="alergias"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Alergias</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Descreva alergias relevantes"
                      {...field}
                      value={field.value || ""}
                      rows={4}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="possuiConvenio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Possui convênio?</FormLabel>
                  <Select
                    key={field.value}
                    onValueChange={(value) => {
                      field.onChange(value);
                      if (value !== "Sim") {
                        form.setValue("nomeConvenio", "");
                      }
                    }}
                    defaultValue={field.value}
                    value={field.value || ""}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Sim">Sim</SelectItem>
                      <SelectItem value="Não">Não</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {form.watch("possuiConvenio") === "Sim" && (
              <FormField
                control={form.control}
                name="nomeConvenio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome do convênio</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Informe o nome do convênio"
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="modalidade"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Modalidade</FormLabel>
                  <div className="flex flex-col space-y-2">
                    {modalidades.map((item) => (
                      <FormItem
                        key={item.id}
                        className="flex flex-row items-center space-x-3 space-y-0"
                      >
                        <FormControl>
                          <Checkbox
                            checked={field.value?.includes(item.id)}
                            onCheckedChange={(checked) => {
                              const currentValue = field.value || [];
                              if (checked) {
                                field.onChange([...currentValue, item.id]);
                              } else {
                                field.onChange(
                                  currentValue.filter((id) => id !== item.id),
                                );
                              }
                            }}
                          />
                        </FormControl>
                        <FormLabel className="font-normal">
                          {item.label}
                        </FormLabel>
                      </FormItem>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="motivacaoViagem"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Motivação da Viagem</FormLabel>
                  <div className="flex flex-col space-y-2">
                    {motivacoes.map((item) => (
                      <FormItem
                        key={item.id}
                        className="flex flex-row items-center space-x-3 space-y-0"
                      >
                        <FormControl>
                          <Checkbox
                            checked={field.value?.includes(item.id)}
                            onCheckedChange={(checked) => {
                              const currentValue = field.value || [];
                              if (checked) {
                                field.onChange([...currentValue, item.id]);
                              } else {
                                field.onChange(
                                  currentValue.filter((id) => id !== item.id),
                                );
                              }
                            }}
                          />
                        </FormControl>
                        <FormLabel className="font-normal">
                          {item.label}
                        </FormLabel>
                      </FormItem>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="md:col-span-2 space-y-2">
              <Label>Meus Grupos</Label>
              <div className="flex flex-wrap gap-2 rounded-md border p-4 min-h-[40px]">
                {(
                  form
                    .getValues("grupo")
                    ?.filter((group) => !isNoMediaGroup(group)) || []
                ).length > 0 ? (
                  form
                    .getValues("grupo")
                    ?.filter((group) => !isNoMediaGroup(group))
                    .map((group) => (
                      <Badge key={group} variant="secondary">
                        {group}
                      </Badge>
                    ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Você ainda não pertence a nenhum grupo.
                  </p>
                )}
              </div>
            </div>

            <FormField
              control={form.control}
              name="fezCF"
              render={({ field }) => (
                <FormItem className="md:col-span-2 flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">
                      Fez o Caminho da Fé?
                    </FormLabel>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="md:col-span-2 mt-4 flex flex-wrap gap-2">
              <Button
                type="submit"
                variant="outline"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Salvar Alterações
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleChangePassword}
              >
                Alterar Senha
              </Button>
            </div>
          </form>
        </Form>

        <Dialog open={showReauthDialog} onOpenChange={setShowReauthDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirme sua Senha</DialogTitle>
              <DialogDescription>
                Por segurança, digite sua senha. Um link de confirmação será
                enviado para <strong>{emailToChange}</strong> para validar a
                mudança.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="relative">
                <Input
                  type={showReauthPassword ? "text" : "password"}
                  placeholder="Sua senha"
                  value={reauthPassword}
                  onChange={(e) => setReauthPassword(e.target.value)}
                  disabled={isAuthenticating}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowReauthPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground"
                  aria-label={
                    showReauthPassword ? "Ocultar senha" : "Mostrar senha"
                  }
                  disabled={isAuthenticating}
                >
                  {showReauthPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowReauthDialog(false);
                  setReauthPassword("");
                }}
                disabled={isAuthenticating}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleReauthenticateAndUpdateEmail}
                disabled={isAuthenticating}
              >
                {isAuthenticating && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Confirmar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </>
  );
}
