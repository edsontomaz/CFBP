"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Loader2, Shirt } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  useUser,
  useFirestore,
  useDoc,
  useMemoFirebase,
  setDocumentNonBlocking,
  useCollection,
} from "@/firebase";
import {
  collection,
  doc,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";

interface UserUniformeProfile {
  role?: string;
  uniformeCF2026Enabled?: boolean;
  uniformeCF2026JerseyEnabled?: boolean;
  uniformeCF2026BretelleEnabled?: boolean;
  uniformeCF2026ManguitoEnabled?: boolean;
  uniformeCF2026CasualEnabled?: boolean;
  uniformeCF2026JerseySizeGuideUrl?: string;
  uniformeCF2026Title?: string;
  uniformeCF2026Description?: string;
  uniformeCF2026Price?: number;
  uniformeCF2026BretellePrice?: number;
  uniformeCF2026ManguitoPrice?: number;
  uniformeCF2026CasualPrice?: number;
  uniformeChoiceSize?: string;
  uniformeChoiceBretelleSize?: string;
  uniformeChoiceManguitoSize?: string;
  uniformeChoiceCasualSize?: string;
  uniformeChoiceQuantity?: number;
  uniformeChoiceBretelleQuantity?: number;
  uniformeChoiceManguitoQuantity?: number;
  uniformeChoiceCasualQuantity?: number;
  uniformeChoiceTotalAmount?: number;
}

interface UniformeChoiceHistoryEntry {
  createdAt?: Timestamp;
  savedAtClient?: string;
  jerseySize: string;
  jerseyQuantity: number;
  bretelleSize: string;
  bretelleQuantity: number;
  manguitoSize: string;
  manguitoQuantity: number;
  casualSize: string;
  casualQuantity: number;
  totalAmount: number;
}

interface AdminUser {
  id: string;
}

const JERSEY_TAMANHOS = ["N/A", "3P", "PP", "P", "M", "G", "GG", "3G", "4G"];
const BRETELLE_TAMANHOS = ["N/A", "PP", "P", "M", "G", "GG", "3G", "4G"];
const MANGUITO_TAMANHOS = ["N/A", "P", "M", "G"];
const CASUAL_TAMANHOS = ["N/A", "PP", "P", "M", "G", "GG", "3G", "4G"];
const PIX_KEY = "bike.pontal@gmail.com.br";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

const formatHistoryDate = (value?: Timestamp, fallback?: string) => {
  if (value instanceof Timestamp) {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(value.toDate());
  }

  if (!fallback) return "-";

  const parsedDate = new Date(fallback);
  if (Number.isNaN(parsedDate.getTime())) {
    return fallback;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsedDate);
};

const formatHistoryItem = (size: string, quantity: number) => {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return "-";
  }

  return `${size || "-"} / ${quantity}`;
};

export default function UniformePage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const userDocRef = useMemoFirebase(
    () => (user ? doc(firestore, "users", user.uid) : null),
    [firestore, user],
  );

  const { data: userProfile, isLoading: isProfileLoading } =
    useDoc<UserUniformeProfile>(userDocRef);

  const isAdmin = userProfile?.role === "admin";
  const usersQuery = useMemoFirebase(
    () => (isAdmin ? collection(firestore, "users") : null),
    [firestore, isAdmin],
  );
  const { data: users } = useCollection<AdminUser>(usersQuery);
  const historyCollectionRef = useMemoFirebase(
    () => (user ? collection(firestore, "users", user.uid, "uniformeHistory") : null),
    [firestore, user],
  );
  const historyQuery = useMemoFirebase(
    () =>
      historyCollectionRef
        ? query(historyCollectionRef, orderBy("createdAt", "desc"))
        : null,
    [historyCollectionRef],
  );
  const { data: pedidoHistory } = useCollection<UniformeChoiceHistoryEntry>(historyQuery);

  const [tamanho, setTamanho] = useState("");
  const [bretelleTamanho, setBretelleTamanho] = useState("");
  const [manguitoTamanho, setManguitoTamanho] = useState("");
  const [casualTamanho, setCasualTamanho] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [bretelleQuantidade, setBretelleQuantidade] = useState("");
  const [manguitoQuantidade, setManguitoQuantidade] = useState("");
  const [casualQuantidade, setCasualQuantidade] = useState("");
  const [uniformeValor, setUniformeValor] = useState("0");
  const [bretelleValor, setBretelleValor] = useState("0");
  const [manguitoValor, setManguitoValor] = useState("0");
  const [casualValor, setCasualValor] = useState("0");
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [uniformeTitle, setUniformeTitle] = useState("Uniforme CF 2026");
  const [uniformeDescription, setUniformeDescription] = useState(
    "Escolha seu uniforme oficial de 2026.",
  );
  const [jerseySizeGuideUrl, setJerseySizeGuideUrl] = useState("");
  const [jerseyEnabled, setJerseyEnabled] = useState(true);
  const [bretelleEnabled, setBretelleEnabled] = useState(true);
  const [manguitoEnabled, setManguitoEnabled] = useState(true);
  const [casualEnabled, setCasualEnabled] = useState(true);
  const isJerseyVisibleForUser = userProfile?.uniformeCF2026JerseyEnabled !== false;
  const isBretelleVisibleForUser = userProfile?.uniformeCF2026BretelleEnabled !== false;
  const isManguitoVisibleForUser = userProfile?.uniformeCF2026ManguitoEnabled !== false;
  const isCasualVisibleForUser = userProfile?.uniformeCF2026CasualEnabled !== false;
  const uniformeCardTitle =
    String(userProfile?.uniformeCF2026Title || "").trim() ||
    "Uniforme CF 2026";
  const uniformeCardDescription =
    String(userProfile?.uniformeCF2026Description || "").trim() ||
    "Escolha seu uniforme oficial de 2026.";
  const uniformePrice = Number(userProfile?.uniformeCF2026Price || 0);
  const uniformeBretellePrice = Number(userProfile?.uniformeCF2026BretellePrice || 0);
  const uniformeManguitoPrice = Number(userProfile?.uniformeCF2026ManguitoPrice || 0);
  const uniformeCasualPrice = Number(userProfile?.uniformeCF2026CasualPrice || 0);
  const jerseyQuantidade = Number(quantidade || 0);
  const bretelleQuantidadeNum = Number(bretelleQuantidade || 0);
  const manguitoQuantidadeNum = Number(manguitoQuantidade || 0);
  const casualQuantidadeNum = Number(casualQuantidade || 0);
  const resumoItens = [
    {
      item: "Jersey",
      tamanho: tamanho,
      quantidade: jerseyQuantidade,
      valor: uniformePrice,
      enabled: isJerseyVisibleForUser,
    },
    {
      item: "Bretelle",
      tamanho: bretelleTamanho,
      quantidade: bretelleQuantidadeNum,
      valor: uniformeBretellePrice,
      enabled: isBretelleVisibleForUser,
    },
    {
      item: "Manguito",
      tamanho: manguitoTamanho,
      quantidade: manguitoQuantidadeNum,
      valor: uniformeManguitoPrice,
      enabled: isManguitoVisibleForUser,
    },
    {
      item: "Camisa Casual",
      tamanho: casualTamanho,
      quantidade: casualQuantidadeNum,
      valor: uniformeCasualPrice,
      enabled: isCasualVisibleForUser,
    },
  ];
  const resumoItensVisiveis = resumoItens.filter(
    (item) =>
      Number.isFinite(item.quantidade) &&
      item.quantidade > 0 &&
      (isAdmin || item.enabled),
  );
  const totalGeralResumo = resumoItensVisiveis.reduce(
    (total, item) => total + item.quantidade * item.valor,
    0,
  );

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push("/login");
    }
  }, [isUserLoading, user, router]);

  useEffect(() => {
    if (!userProfile) return;

    setTamanho(userProfile.uniformeChoiceSize || "");
    setBretelleTamanho(userProfile.uniformeChoiceBretelleSize || "");
    setManguitoTamanho(userProfile.uniformeChoiceManguitoSize || "");
    setCasualTamanho(userProfile.uniformeChoiceCasualSize || "");
    setQuantidade(
      Number(userProfile.uniformeChoiceQuantity || 0) > 0
        ? String(userProfile.uniformeChoiceQuantity)
        : "",
    );
    setBretelleQuantidade(
      Number(userProfile.uniformeChoiceBretelleQuantity || 0) > 0
        ? String(userProfile.uniformeChoiceBretelleQuantity)
        : "",
    );
    setManguitoQuantidade(
      Number(userProfile.uniformeChoiceManguitoQuantity || 0) > 0
        ? String(userProfile.uniformeChoiceManguitoQuantity)
        : "",
    );
    setCasualQuantidade(
      Number(userProfile.uniformeChoiceCasualQuantity || 0) > 0
        ? String(userProfile.uniformeChoiceCasualQuantity)
        : "",
    );
    setUniformeValor(String(Number(userProfile.uniformeCF2026Price || 0)));
    setBretelleValor(String(Number(userProfile.uniformeCF2026BretellePrice || 0)));
    setManguitoValor(String(Number(userProfile.uniformeCF2026ManguitoPrice || 0)));
    setCasualValor(String(Number(userProfile.uniformeCF2026CasualPrice || 0)));
    setUniformeTitle(
      String(userProfile.uniformeCF2026Title || "").trim() ||
        "Uniforme CF 2026",
    );
    setUniformeDescription(
      String(userProfile.uniformeCF2026Description || "").trim() ||
        "Escolha seu uniforme oficial de 2026.",
    );
    setJerseySizeGuideUrl(String(userProfile.uniformeCF2026JerseySizeGuideUrl || "").trim());
    setJerseyEnabled(userProfile.uniformeCF2026JerseyEnabled !== false);
    setBretelleEnabled(userProfile.uniformeCF2026BretelleEnabled !== false);
    setManguitoEnabled(userProfile.uniformeCF2026ManguitoEnabled !== false);
    setCasualEnabled(userProfile.uniformeCF2026CasualEnabled !== false);
  }, [userProfile]);

  useEffect(() => {
    if (isProfileLoading || !userProfile) {
      return;
    }

    if (!isAdmin && !userProfile.uniformeCF2026Enabled) {
      router.replace("/");
    }
  }, [isAdmin, isProfileLoading, userProfile, router]);

  const handleSaveConfig = async () => {
    if (!isAdmin || !users || users.length === 0) {
      return;
    }

    const title = uniformeTitle.trim() || "Uniforme CF 2026";
    const description =
      uniformeDescription.trim() || "Escolha seu uniforme oficial de 2026.";
    const parsedValor = Number(uniformeValor.replace(",", "."));
    const parsedBretelleValor = Number(bretelleValor.replace(",", "."));
    const parsedManguitoValor = Number(manguitoValor.replace(",", "."));
    const parsedCasualValor = Number(casualValor.replace(",", "."));

    if (
      !Number.isFinite(parsedValor) ||
      parsedValor < 0 ||
      !Number.isFinite(parsedBretelleValor) ||
      parsedBretelleValor < 0 ||
      !Number.isFinite(parsedManguitoValor) ||
      parsedManguitoValor < 0 ||
      !Number.isFinite(parsedCasualValor) ||
      parsedCasualValor < 0
    ) {
      toast({
        variant: "destructive",
        title: "Valor inválido",
        description:
          "Informe valores validos para jersey, bretelle, manguito e camisa casual.",
      });
      return;
    }

    try {
      setIsSavingConfig(true);

      await Promise.all(
        users.map((item) =>
          setDocumentNonBlocking(
            doc(firestore, "users", item.id),
            {
              uniformeCF2026Title: title,
              uniformeCF2026Description: description,
              uniformeCF2026JerseySizeGuideUrl: jerseySizeGuideUrl.trim(),
              uniformeCF2026JerseyEnabled: jerseyEnabled,
              uniformeCF2026BretelleEnabled: bretelleEnabled,
              uniformeCF2026ManguitoEnabled: manguitoEnabled,
              uniformeCF2026CasualEnabled: casualEnabled,
              uniformeCF2026Price: parsedValor,
              uniformeCF2026BretellePrice: parsedBretelleValor,
              uniformeCF2026ManguitoPrice: parsedManguitoValor,
              uniformeCF2026CasualPrice: parsedCasualValor,
              uniformeChoiceManguitoSize: manguitoTamanho,
              uniformeChoiceCasualSize: casualTamanho,
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          ),
        ),
      );

      toast({
        title: "Configuração salva",
        description: "As configurações do card de uniforme foram atualizadas.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar configuração",
        description: "Não foi possível salvar as configurações do uniforme.",
      });
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleSave = async () => {
    if (!userDocRef) return;

    const parsedQuantidade = Number(quantidade);
    const parsedBretelleQuantidade = Number(bretelleQuantidade);
    const parsedManguitoQuantidade = Number(manguitoQuantidade);
    const parsedCasualQuantidade = Number(casualQuantidade);

    const itensEscolha = [
      { label: "Jersey", size: tamanho, qty: parsedQuantidade },
      { label: "Bretelle", size: bretelleTamanho, qty: parsedBretelleQuantidade },
      { label: "Manguito", size: manguitoTamanho, qty: parsedManguitoQuantidade },
      { label: "Camisa Casual", size: casualTamanho, qty: parsedCasualQuantidade },
    ].map((item) => ({
      ...item,
      hasRealSize: Boolean(item.size) && item.size !== "N/A",
    }));

    const hasSizeWithoutQty = itensEscolha.some(
      (item) => item.hasRealSize && (!Number.isFinite(item.qty) || item.qty <= 0),
    );

    if (hasSizeWithoutQty) {
      toast({
        variant: "destructive",
        title: "Quantidade obrigatória",
        description: "Se selecionar um tamanho, informe uma quantidade valida para o item.",
      });
      return;
    }

    const hasQtyWithoutSize = itensEscolha.some(
      (item) => !item.hasRealSize && Number.isFinite(item.qty) && item.qty > 0,
    );

    if (hasQtyWithoutSize) {
      toast({
        variant: "destructive",
        title: "Tamanho obrigatório",
        description:
          "Se informar quantidade, selecione um tamanho valido (diferente de N/A).",
      });
      return;
    }

    try {
      setIsSaving(true);

      const safeQuantidade =
        Number.isFinite(parsedQuantidade) && parsedQuantidade > 0
          ? parsedQuantidade
          : 0;
      const safeBretelleQuantidade =
        Number.isFinite(parsedBretelleQuantidade) && parsedBretelleQuantidade > 0
          ? parsedBretelleQuantidade
          : 0;
      const safeManguitoQuantidade =
        Number.isFinite(parsedManguitoQuantidade) && parsedManguitoQuantidade > 0
          ? parsedManguitoQuantidade
          : 0;
      const safeCasualQuantidade =
        Number.isFinite(parsedCasualQuantidade) && parsedCasualQuantidade > 0
          ? parsedCasualQuantidade
          : 0;

      const nextHistoryEntry: UniformeChoiceHistoryEntry = {
        savedAtClient: new Date().toISOString(),
        jerseySize: tamanho,
        jerseyQuantity: safeQuantidade,
        bretelleSize: bretelleTamanho,
        bretelleQuantity: safeBretelleQuantidade,
        manguitoSize: manguitoTamanho,
        manguitoQuantity: safeManguitoQuantidade,
        casualSize: casualTamanho,
        casualQuantity: safeCasualQuantidade,
        totalAmount: totalGeralResumo,
      };

      await setDocumentNonBlocking(
        userDocRef,
        {
          uniformeChoiceSize: tamanho,
          uniformeChoiceBretelleSize: bretelleTamanho,
          uniformeChoiceManguitoSize: manguitoTamanho,
          uniformeChoiceCasualSize: casualTamanho,
          uniformeChoiceQuantity: safeQuantidade,
          uniformeChoiceBretelleQuantity: safeBretelleQuantidade,
          uniformeChoiceManguitoQuantity: safeManguitoQuantidade,
          uniformeChoiceCasualQuantity: safeCasualQuantidade,
          uniformeChoiceTotalAmount: totalGeralResumo,
          uniformeChoiceUpdatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      if (historyCollectionRef) {
        const historyRef = doc(historyCollectionRef);
        await setDocumentNonBlocking(
          historyRef,
          {
            ...nextHistoryEntry,
            createdAt: serverTimestamp(),
          },
          { merge: true },
        );
      }

      toast({
        title: "Uniforme salvo",
        description: "Sua escolha de uniforme foi registrada com sucesso.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: "Não foi possível registrar sua escolha de uniforme.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuantidadeChange = (value: string) => {
    setQuantidade(value.replace(/\D/g, ""));
  };

  const handleBretelleQuantidadeChange = (value: string) => {
    setBretelleQuantidade(value.replace(/\D/g, ""));
  };

  const handleManguitoQuantidadeChange = (value: string) => {
    setManguitoQuantidade(value.replace(/\D/g, ""));
  };

  const handleCasualQuantidadeChange = (value: string) => {
    setCasualQuantidade(value.replace(/\D/g, ""));
  };

  const handleUniformeValorChange = (value: string) => {
    const normalized = value.replace(",", ".").replace(/[^\d.]/g, "");
    const [integerPart, ...decimalParts] = normalized.split(".");
    const nextValue =
      decimalParts.length > 0
        ? `${integerPart}.${decimalParts.join("")}`
        : integerPart;
    setUniformeValor(nextValue);
  };

  const handleBretelleValorChange = (value: string) => {
    const normalized = value.replace(",", ".").replace(/[^\d.]/g, "");
    const [integerPart, ...decimalParts] = normalized.split(".");
    const nextValue =
      decimalParts.length > 0
        ? `${integerPart}.${decimalParts.join("")}`
        : integerPart;
    setBretelleValor(nextValue);
  };

  const handleManguitoValorChange = (value: string) => {
    const normalized = value.replace(",", ".").replace(/[^\d.]/g, "");
    const [integerPart, ...decimalParts] = normalized.split(".");
    const nextValue =
      decimalParts.length > 0
        ? `${integerPart}.${decimalParts.join("")}`
        : integerPart;
    setManguitoValor(nextValue);
  };

  const handleCasualValorChange = (value: string) => {
    const normalized = value.replace(",", ".").replace(/[^\d.]/g, "");
    const [integerPart, ...decimalParts] = normalized.split(".");
    const nextValue =
      decimalParts.length > 0
        ? `${integerPart}.${decimalParts.join("")}`
        : integerPart;
    setCasualValor(nextValue);
  };

  const handleCopyPix = async () => {
    try {
      await navigator.clipboard.writeText(PIX_KEY);
      toast({
        title: "Pix copiado",
        description: `Chave Pix copiada: ${PIX_KEY}`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao copiar Pix",
        description: "Não foi possível copiar a chave Pix.",
      });
    }
  };

  if (isUserLoading || isProfileLoading || !user) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin && !userProfile?.uniformeCF2026Enabled) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="container mx-auto flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-2xl space-y-6">
          <Button asChild variant="outline">
            <Link href="/">Voltar</Link>
          </Button>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shirt className="h-5 w-5" />
                {isAdmin ? "Configurar Uniforme" : uniformeCardTitle}
              </CardTitle>
              <CardDescription className={!isAdmin ? "whitespace-pre-line" : undefined}>
                {isAdmin
                  ? "Defina como o card de uniforme aparece para os usuários."
                  : uniformeCardDescription}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isAdmin ? (
                <>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Título do card</p>
                    <Input
                      value={uniformeTitle}
                      onChange={(event) => setUniformeTitle(event.target.value)}
                      placeholder="Uniforme CF 2026"
                      disabled={isSavingConfig}
                    />
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Descrição do card</p>
                    <Textarea
                      rows={3}
                      value={uniformeDescription}
                      onChange={(event) => setUniformeDescription(event.target.value)}
                      placeholder="Escolha seu uniforme oficial de 2026."
                      disabled={isSavingConfig}
                    />
                  </div>

                  {true && (
                  <div className="space-y-3 rounded-md border p-3">
                    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                      <a
                        href="/jersey.jpeg"
                        target="_blank"
                        rel="noreferrer"
                        className="mx-auto block h-[220px] w-[220px] overflow-hidden rounded-md border md:mx-0"
                      >
                        <Image
                          src="/jersey.jpeg"
                          alt="Jersey CF 2026"
                          width={320}
                          height={420}
                          className="h-full w-full object-cover"
                          priority
                        />
                      </a>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-muted-foreground">Exibir para usuário</p>
                          <Switch
                            checked={jerseyEnabled}
                            onCheckedChange={(checked) => setJerseyEnabled(Boolean(checked))}
                            disabled={isSavingConfig}
                          />
                        </div>
                        <div className="space-y-2">
                          <p className="text-sm text-muted-foreground">Tamanho da Jersey</p>
                          <Select value={tamanho} onValueChange={setTamanho}>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o tamanho" />
                            </SelectTrigger>
                            <SelectContent>
                              {JERSEY_TAMANHOS.map((item) => (
                                <SelectItem key={item} value={item}>
                                  {item}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <p className="text-sm text-muted-foreground">Veja o seu Tamanho</p>
                          <Input
                            type="text"
                            inputMode="url"
                            placeholder="https://..."
                            value={jerseySizeGuideUrl}
                            onChange={(event) => setJerseySizeGuideUrl(event.target.value)}
                            disabled={isSavingConfig}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <p className="text-sm text-muted-foreground">Quantidade</p>
                            <Input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={quantidade}
                              onChange={(event) => handleQuantidadeChange(event.target.value)}
                              placeholder="Quantidade"
                            />
                          </div>

                          <div className="space-y-2">
                            <p className="text-sm text-muted-foreground">Valor (R$)</p>
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={uniformeValor}
                              onChange={(event) => handleUniformeValorChange(event.target.value)}
                              placeholder="Ex.: 199.90"
                              disabled={isSavingConfig}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  )}

                  {true && (
                  <div className="space-y-3 rounded-md border p-3">
                    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                      <a
                        href="/Bretelle.jpeg"
                        target="_blank"
                        rel="noreferrer"
                        className="mx-auto block h-[220px] w-[220px] overflow-hidden rounded-md border md:mx-0"
                      >
                        <Image
                          src="/Bretelle.jpeg"
                          alt="Bretelle CF 2026"
                          width={320}
                          height={420}
                          className="h-full w-full object-cover"
                        />
                      </a>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-muted-foreground">Exibir para usuário</p>
                          <Switch
                            checked={bretelleEnabled}
                            onCheckedChange={(checked) =>
                              setBretelleEnabled(Boolean(checked))
                            }
                            disabled={isSavingConfig}
                          />
                        </div>
                        <div className="space-y-2">
                          <p className="text-sm text-muted-foreground">Tamanho do Bretelle</p>
                          <Select
                            value={bretelleTamanho}
                            onValueChange={setBretelleTamanho}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o tamanho" />
                            </SelectTrigger>
                            <SelectContent>
                              {BRETELLE_TAMANHOS.map((item) => (
                                <SelectItem key={item} value={item}>
                                  {item}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <p className="text-sm text-muted-foreground">Quantidade</p>
                            <Input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={bretelleQuantidade}
                              onChange={(event) =>
                                handleBretelleQuantidadeChange(event.target.value)
                              }
                              placeholder="Quantidade"
                            />
                          </div>

                          <div className="space-y-2">
                            <p className="text-sm text-muted-foreground">Valor (R$)</p>
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={bretelleValor}
                              onChange={(event) =>
                                handleBretelleValorChange(event.target.value)
                              }
                              placeholder="Ex.: 149.90"
                              disabled={isSavingConfig}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  )}

                  {true && (
                  <div className="space-y-3 rounded-md border p-3">
                    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                      <a
                        href="/Manguito.jpeg"
                        target="_blank"
                        rel="noreferrer"
                        className="mx-auto block h-[220px] w-[220px] overflow-hidden rounded-md border md:mx-0"
                      >
                        <Image
                          src="/Manguito.jpeg"
                          alt="Manguito CF 2026"
                          width={320}
                          height={420}
                          className="h-full w-full object-cover"
                        />
                      </a>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-muted-foreground">Exibir para usuário</p>
                          <Switch
                            checked={manguitoEnabled}
                            onCheckedChange={(checked) =>
                              setManguitoEnabled(Boolean(checked))
                            }
                            disabled={isSavingConfig}
                          />
                        </div>
                        <div className="space-y-2">
                          <p className="text-sm text-muted-foreground">Tamanho do Manguito</p>
                          <Select
                            value={manguitoTamanho}
                            onValueChange={setManguitoTamanho}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o tamanho" />
                            </SelectTrigger>
                            <SelectContent>
                              {MANGUITO_TAMANHOS.map((item) => (
                                <SelectItem key={item} value={item}>
                                  {item}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <p className="text-sm text-muted-foreground">Quantidade</p>
                            <Input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={manguitoQuantidade}
                              onChange={(event) =>
                                handleManguitoQuantidadeChange(event.target.value)
                              }
                              placeholder="Quantidade"
                            />
                          </div>

                          <div className="space-y-2">
                            <p className="text-sm text-muted-foreground">Valor (R$)</p>
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={manguitoValor}
                              onChange={(event) =>
                                handleManguitoValorChange(event.target.value)
                              }
                              placeholder="Ex.: 79.90"
                              disabled={isSavingConfig}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  )}

                  {true && (
                  <div className="space-y-3 rounded-md border p-3">
                    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                      <a
                        href="/Casual.jpeg"
                        target="_blank"
                        rel="noreferrer"
                        className="mx-auto block h-[220px] w-[220px] overflow-hidden rounded-md border md:mx-0"
                      >
                        <Image
                          src="/Casual.jpeg"
                          alt="Camisa Casual CF 2026"
                          width={320}
                          height={420}
                          className="h-full w-full object-cover"
                        />
                      </a>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-muted-foreground">Exibir para usuário</p>
                          <Switch
                            checked={casualEnabled}
                            onCheckedChange={(checked) => setCasualEnabled(Boolean(checked))}
                            disabled={isSavingConfig}
                          />
                        </div>
                        <div className="space-y-2">
                          <p className="text-sm text-muted-foreground">Tamanho da Camisa Casual</p>
                          <Select
                            value={casualTamanho}
                            onValueChange={setCasualTamanho}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o tamanho" />
                            </SelectTrigger>
                            <SelectContent>
                              {CASUAL_TAMANHOS.map((item) => (
                                <SelectItem key={item} value={item}>
                                  {item}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <p className="text-sm text-muted-foreground">Quantidade</p>
                            <Input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={casualQuantidade}
                              onChange={(event) =>
                                handleCasualQuantidadeChange(event.target.value)
                              }
                              placeholder="Quantidade"
                            />
                          </div>

                          <div className="space-y-2">
                            <p className="text-sm text-muted-foreground">Valor (R$)</p>
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={casualValor}
                              onChange={(event) =>
                                handleCasualValorChange(event.target.value)
                              }
                              placeholder="Ex.: 99.90"
                              disabled={isSavingConfig}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  )}

                  <Button onClick={handleSaveConfig} disabled={isSavingConfig}>
                    {isSavingConfig ? "Salvando..." : "Salvar Configuração"}
                  </Button>
                </>
              ) : (
                <>
                  <div
                    className={`space-y-3 rounded-md border p-3 ${
                      isJerseyVisibleForUser ? "" : "hidden"
                    }`}
                  >
                    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                      <a
                        href="/jersey.jpeg"
                        target="_blank"
                        rel="noreferrer"
                        className="mx-auto block h-[220px] w-[220px] overflow-hidden rounded-md border md:mx-0"
                      >
                        <Image
                          src="/jersey.jpeg"
                          alt="Jersey CF 2026"
                          width={320}
                          height={420}
                          className="h-full w-full object-cover"
                          priority
                        />
                      </a>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <p className="text-sm text-muted-foreground">Tamanho da Jersey</p>
                          <Select value={tamanho} onValueChange={setTamanho}>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o tamanho" />
                            </SelectTrigger>
                            <SelectContent>
                              {JERSEY_TAMANHOS.map((item) => (
                                <SelectItem key={item} value={item}>
                                  {item}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          {jerseySizeGuideUrl ? (
                            <a
                              href={jerseySizeGuideUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm text-primary underline"
                            >
                              Veja o seu Tamanho
                            </a>
                          ) : (
                            <p className="text-sm text-muted-foreground">Veja o seu Tamanho</p>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <p className="text-sm text-muted-foreground">Quantidade</p>
                            <Input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={quantidade}
                              onChange={(event) => handleQuantidadeChange(event.target.value)}
                              placeholder="Quantidade"
                            />
                          </div>

                          <div className="space-y-2">
                            <p className="text-sm text-muted-foreground">Valor</p>
                            <Input
                              value={formatCurrency(uniformePrice)}
                              readOnly
                              aria-readonly="true"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    className={`space-y-3 rounded-md border p-3 ${
                      isBretelleVisibleForUser ? "" : "hidden"
                    }`}
                  >
                    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                      <a
                        href="/Bretelle.jpeg"
                        target="_blank"
                        rel="noreferrer"
                        className="mx-auto block h-[220px] w-[220px] overflow-hidden rounded-md border md:mx-0"
                      >
                        <Image
                          src="/Bretelle.jpeg"
                          alt="Bretelle CF 2026"
                          width={320}
                          height={420}
                          className="h-full w-full object-cover"
                        />
                      </a>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <p className="text-sm text-muted-foreground">Tamanho do Bretelle</p>
                          <Select
                            value={bretelleTamanho}
                            onValueChange={setBretelleTamanho}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o tamanho" />
                            </SelectTrigger>
                            <SelectContent>
                              {BRETELLE_TAMANHOS.map((item) => (
                                <SelectItem key={item} value={item}>
                                  {item}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <p className="text-sm text-muted-foreground">Quantidade</p>
                            <Input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={bretelleQuantidade}
                              onChange={(event) =>
                                handleBretelleQuantidadeChange(event.target.value)
                              }
                              placeholder="Quantidade"
                            />
                          </div>

                          <div className="space-y-2">
                            <p className="text-sm text-muted-foreground">Valor</p>
                            <Input
                              value={formatCurrency(uniformeBretellePrice)}
                              readOnly
                              aria-readonly="true"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    className={`space-y-3 rounded-md border p-3 ${
                      isManguitoVisibleForUser ? "" : "hidden"
                    }`}
                  >
                    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                      <a
                        href="/Manguito.jpeg"
                        target="_blank"
                        rel="noreferrer"
                        className="mx-auto block h-[220px] w-[220px] overflow-hidden rounded-md border md:mx-0"
                      >
                        <Image
                          src="/Manguito.jpeg"
                          alt="Manguito CF 2026"
                          width={320}
                          height={420}
                          className="h-full w-full object-cover"
                        />
                      </a>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <p className="text-sm text-muted-foreground">Tamanho do Manguito</p>
                          <Select
                            value={manguitoTamanho}
                            onValueChange={setManguitoTamanho}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o tamanho" />
                            </SelectTrigger>
                            <SelectContent>
                              {MANGUITO_TAMANHOS.map((item) => (
                                <SelectItem key={item} value={item}>
                                  {item}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <p className="text-sm text-muted-foreground">Quantidade</p>
                            <Input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={manguitoQuantidade}
                              onChange={(event) =>
                                handleManguitoQuantidadeChange(event.target.value)
                              }
                              placeholder="Quantidade"
                            />
                          </div>

                          <div className="space-y-2">
                            <p className="text-sm text-muted-foreground">Valor</p>
                            <Input
                              value={formatCurrency(uniformeManguitoPrice)}
                              readOnly
                              aria-readonly="true"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    className={`space-y-3 rounded-md border p-3 ${
                      isCasualVisibleForUser ? "" : "hidden"
                    }`}
                  >
                    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                      <a
                        href="/Casual.jpeg"
                        target="_blank"
                        rel="noreferrer"
                        className="mx-auto block h-[220px] w-[220px] overflow-hidden rounded-md border md:mx-0"
                      >
                        <Image
                          src="/Casual.jpeg"
                          alt="Camisa Casual CF 2026"
                          width={320}
                          height={420}
                          className="h-full w-full object-cover"
                        />
                      </a>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <p className="text-sm text-muted-foreground">Tamanho da Camisa Casual</p>
                          <Select
                            value={casualTamanho}
                            onValueChange={setCasualTamanho}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o tamanho" />
                            </SelectTrigger>
                            <SelectContent>
                              {CASUAL_TAMANHOS.map((item) => (
                                <SelectItem key={item} value={item}>
                                  {item}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <p className="text-sm text-muted-foreground">Quantidade</p>
                            <Input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={casualQuantidade}
                              onChange={(event) =>
                                handleCasualQuantidadeChange(event.target.value)
                              }
                              placeholder="Quantidade"
                            />
                          </div>

                          <div className="space-y-2">
                            <p className="text-sm text-muted-foreground">Valor</p>
                            <Input
                              value={formatCurrency(uniformeCasualPrice)}
                              readOnly
                              aria-readonly="true"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-md border p-3">
                    <p className="text-sm font-medium">Resumo do Pedido</p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead>Tamanho</TableHead>
                          <TableHead>Quantidade</TableHead>
                          <TableHead>Valor</TableHead>
                          <TableHead>Subtotal</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {resumoItensVisiveis.map((resumoItem) => {
                          const subtotal = resumoItem.quantidade * resumoItem.valor;

                          return (
                            <TableRow key={resumoItem.item}>
                              <TableCell>{resumoItem.item}</TableCell>
                              <TableCell>{resumoItem.tamanho || "-"}</TableCell>
                              <TableCell>{resumoItem.quantidade || 0}</TableCell>
                              <TableCell>{formatCurrency(resumoItem.valor)}</TableCell>
                              <TableCell>{formatCurrency(subtotal)}</TableCell>
                            </TableRow>
                          );
                        })}
                        {resumoItensVisiveis.length > 0 ? (
                          <>
                            <TableRow>
                              <TableCell className="font-semibold" colSpan={4}>
                                Total Geral
                              </TableCell>
                              <TableCell className="font-semibold">
                                {formatCurrency(totalGeralResumo)}
                              </TableCell>
                            </TableRow>
                          </>
                        ) : (
                          <TableRow>
                            <TableCell colSpan={5} className="text-muted-foreground">
                              Preencha ao menos uma quantidade para ver o resumo.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="space-y-3 rounded-md border p-3">
                    <p className="text-sm font-medium">Histórico de Pedidos</p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Jersey</TableHead>
                          <TableHead>Bretelle</TableHead>
                          <TableHead>Manguito</TableHead>
                          <TableHead>Casual</TableHead>
                          <TableHead>Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pedidoHistory && pedidoHistory.length > 0 ? (
                            pedidoHistory.map((historyItem) => (
                              <TableRow key={historyItem.id}>
                                <TableCell>
                                  {formatHistoryDate(
                                    historyItem.createdAt,
                                    historyItem.savedAtClient,
                                  )}
                                </TableCell>
                                <TableCell>
                                  {formatHistoryItem(
                                    historyItem.jerseySize,
                                    Number(historyItem.jerseyQuantity || 0),
                                  )}
                                </TableCell>
                                <TableCell>
                                  {formatHistoryItem(
                                    historyItem.bretelleSize,
                                    Number(historyItem.bretelleQuantity || 0),
                                  )}
                                </TableCell>
                                <TableCell>
                                  {formatHistoryItem(
                                    historyItem.manguitoSize,
                                    Number(historyItem.manguitoQuantity || 0),
                                  )}
                                </TableCell>
                                <TableCell>
                                  {formatHistoryItem(
                                    historyItem.casualSize,
                                    Number(historyItem.casualQuantity || 0),
                                  )}
                                </TableCell>
                                <TableCell>
                                  {formatCurrency(Number(historyItem.totalAmount || 0))}
                                </TableCell>
                              </TableRow>
                            ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={6} className="text-muted-foreground">
                              Nenhum pedido salvo ainda.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleCopyPix()}
                    >
                      Copiar Pix
                    </Button>
                    <Button onClick={handleSave} disabled={isSaving}>
                      {isSaving ? "Salvando..." : "Salvar Pedido"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
