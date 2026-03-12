"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  useAuth,
  useFirestore,
  useUser,
  setDocumentNonBlocking,
} from "@/firebase";
import {
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  sendPasswordResetEmail,
  updateProfile,
} from "firebase/auth";
import {
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { LogoAuth } from "@/components/logo-auth";

const formSchema = z.object({
  displayName: z
    .string()
    .min(3, { message: "O nome deve ter pelo menos 3 caracteres." }),
  email: z.string().email({ message: "Por favor, insira um email válido." }),
  password: z
    .string()
    .min(6, { message: "A senha deve ter pelo menos 6 caracteres." }),
  confirmPassword: z
    .string()
    .min(1, { message: "A confirmação de senha é obrigatória." }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não conferem.",
  path: ["confirmPassword"],
});

export default function RegisterPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const auth = useAuth();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (!isUserLoading && user) {
      router.push("/");
    }
  }, [user, isUserLoading, router]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      displayName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  function clearPasswordFields() {
    form.setValue("password", "");
    form.setValue("confirmPassword", "");
    form.clearErrors(["password", "confirmPassword"]);
  }

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    try {
      const normalizedEmail = values.email.trim().toLowerCase();
      const checkProfileResponse = await fetch("/api/auth/recover-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: normalizedEmail, mode: "check" }),
      });

      const checkProfileBody = await checkProfileResponse
        .json()
        .catch(() => null);
      const hasExistingProfile = Boolean(checkProfileBody?.profileExists);

      if (hasExistingProfile) {
        clearPasswordFields();
        form.setError("email", {
          type: "manual",
          message: "Já existe um perfil com este e-mail.",
        });

        const wantsRecoverAccess = window.confirm(
          "Já existe um perfil com este e-mail. Deseja recuperar o acesso? Enviaremos um e-mail para redefinir sua senha e usar o perfil existente.",
        );

        if (wantsRecoverAccess) {
          try {
            const signInMethods = await fetchSignInMethodsForEmail(
              auth,
              normalizedEmail,
            );

            if (signInMethods.length === 0) {
              const recoverResponse = await fetch("/api/auth/recover-profile", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ email: normalizedEmail }),
              });

              if (!recoverResponse.ok) {
                const recoverBody = await recoverResponse
                  .json()
                  .catch(() => null);
                throw new Error(
                  recoverBody?.error ||
                    "Não foi possível preparar a recuperação deste perfil.",
                );
              }
            }

            await sendPasswordResetEmail(auth, normalizedEmail);

            toast({
              title: "Recuperação enviada",
              description:
                "Enviamos um e-mail para você redefinir a senha e acessar seu perfil existente.",
            });
            router.push("/login");
            return;
          } catch (recoverError: any) {
            toast({
              variant: "destructive",
              title: "Erro no Cadastro",
              description:
                recoverError?.message ||
                "Não foi possível iniciar a recuperação de acesso.",
            });
            router.push("/login");
            return;
          }
        }

        toast({
          variant: "destructive",
          title: "Erro no Cadastro",
          description:
            "Este e-mail já possui perfil. Use a recuperação de acesso para continuar.",
        });
        router.push("/login");
        return;
      }

      const signInMethods = await fetchSignInMethodsForEmail(
        auth,
        normalizedEmail,
      );

      if (signInMethods.length > 0) {
        clearPasswordFields();
        form.setError("email", {
          type: "manual",
          message: "Este email já está sendo usado.",
        });

        toast({
          variant: "destructive",
          title: "Erro no Cadastro",
          description: "Este email já está sendo usado.",
        });

        router.push("/login");

        return;
      }

      const userCredential = await createUserWithEmailAndPassword(
        auth,
        normalizedEmail,
        values.password,
      );
      const newUser = userCredential.user;

      // Update profile display name
      await updateProfile(newUser, {
        displayName: values.displayName,
      });

      // Create user profile document in Firestore
      const userDocRef = doc(firestore, "users", newUser.uid);
      await setDocumentNonBlocking(
        userDocRef,
        {
          id: newUser.uid,
          displayName: values.displayName,
          email: newUser.email,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          sexo: "",
          endereco: "",
          cep: "",
          cidade: "",
          estado: "",
          telefone: "",
          nacionalidade: "",
          cpf: "",
          rg: "",
          dataNascimento: "",
          profissao: "",
          fezCF: false,
          modalidade: [],
          motivacaoViagem: [],
          grupo: [],
          role: "user",
        },
        { merge: true },
      );

      toast({
        title: "Conta criada!",
        description: "Bem-vindo! Você será redirecionado em breve.",
      });
    } catch (error: any) {
      clearPasswordFields();
      let description = "Ocorreu um erro. Tente novamente.";
      if (error.code === "auth/email-already-in-use") {
        description = "Este email já está sendo usado.";
      }
      toast({
        variant: "destructive",
        title: "Erro no Cadastro",
        description,
      });

      router.push("/login");
    } finally {
      setIsLoading(false);
    }
  }

  if (isUserLoading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin" />
      </div>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <LogoAuth />
          </div>
          <CardTitle className="font-headline text-2xl">
            Crie sua Conta
          </CardTitle>
          <CardDescription>
            Junte-se a nós para começar a planejar seus passeios.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl>
                      <Input placeholder="Seu nome" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="seu@email.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Senha</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="********"
                          {...field}
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground"
                          aria-label={
                            showPassword ? "Ocultar senha" : "Mostrar senha"
                          }
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel className="text-yellow-500">Confirmar senha</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showConfirmPassword ? "text" : "password"}
                          placeholder="********"
                          {...field}
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword((prev) => !prev)}
                          className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground"
                          aria-label={
                            showConfirmPassword
                              ? "Ocultar confirmação de senha"
                              : "Mostrar confirmação de senha"
                          }
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage
                      className={
                        fieldState.error?.message === "As senhas não conferem."
                          ? "text-yellow-500"
                          : undefined
                      }
                    />
                  </FormItem>
                )}
              />
              <div className="space-y-2">
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Cadastrar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  asChild
                >
                  <Link href="/login">Cancelar cadastro</Link>
                </Button>
              </div>
            </form>
          </Form>
          <div className="mt-4 text-center text-sm">
            Já tem uma conta?{" "}
            <Link href="/login" className="underline">
              Faça login
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
