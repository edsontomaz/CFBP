"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useUser,
  useAuth,
  useFirestore,
  useDoc,
  useCollection,
  useMemoFirebase,
  setDocumentNonBlocking,
} from "@/firebase";
import { doc, collection, serverTimestamp } from "firebase/firestore";
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
import { Header } from "@/components/header";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";

const editProfileFormSchema = z.object({
  displayName: z.string().min(3, "O nome deve ter pelo menos 3 caracteres."),
  email: z.string().email(),
  grupo: z.array(z.string()).default([]).optional(),
  uploadGroups: z.array(z.string()).default([]).optional(),
});

type EditProfileFormValues = z.infer<typeof editProfileFormSchema>;

interface Group {
  id: string;
  name: string;
}

export default function AdminEditUserPage() {
  const { user: adminUser, isUserLoading: isAdminLoading } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const params = useParams();
  const userId = params.userId as string;
  const [isDeleting, setIsDeleting] = useState(false);

  // State for group management (removed - groups now come from Firestore)

  // Verify if the logged-in user is an admin
  const adminDocRef = useMemoFirebase(
    () => (adminUser ? doc(firestore, "users", adminUser.uid) : null),
    [firestore, adminUser],
  );
  const { data: adminProfile, isLoading: isAdminProfileLoading } = useDoc<{
    role: string;
  }>(adminDocRef);

  // Fetch the profile of the user being edited
  const userDocRef = useMemoFirebase(
    () => doc(firestore, "users", userId),
    [firestore, userId],
  );
  const { data: userProfile, isLoading: isProfileLoading } =
    useDoc<EditProfileFormValues>(userDocRef);

  // Fetch all groups from Firestore
  const groupsQuery = useMemoFirebase(() => {
    if (adminProfile && adminProfile.role === "admin") {
      return collection(firestore, "groups");
    }
    return null;
  }, [firestore, adminProfile]);
  const { data: groups, isLoading: areGroupsLoading } =
    useCollection<Group>(groupsQuery);

  const form = useForm<EditProfileFormValues>({
    resolver: zodResolver(editProfileFormSchema),
    defaultValues: {
      displayName: "",
      email: "",
      grupo: [],
      uploadGroups: [],
    },
  });

  // Security: Redirect if not admin or not logged in
  useEffect(() => {
    if (!isAdminLoading && !adminUser) {
      router.push("/login");
    }
    if (
      !isAdminProfileLoading &&
      adminProfile &&
      adminProfile.role !== "admin"
    ) {
      router.push("/");
    }
  }, [adminUser, isAdminLoading, adminProfile, isAdminProfileLoading, router]);

  // Populate form with user data
  useEffect(() => {
    if (userProfile) {
      const selectedGroups = userProfile.grupo || [];
      const selectedUploadGroups = userProfile.uploadGroups || selectedGroups;
      form.reset({
        ...userProfile,
        grupo: selectedGroups,
        uploadGroups: selectedUploadGroups,
      });
    }
  }, [userProfile, form]);

  const onSubmit = async (values: EditProfileFormValues) => {
    if (!userDocRef) return;

    // We only want to save the fields present in the form, plus the timestamp
    const dataToSave = {
      displayName: values.displayName,
      grupo: values.grupo || [],
      uploadGroups: values.uploadGroups || [],
      updatedAt: serverTimestamp(),
    };

    try {
      // Use merge:true to avoid overwriting fields not in the form (like 'role', 'cpf', etc.)
      await setDocumentNonBlocking(userDocRef, dataToSave, { merge: true });

      toast({
        title: "Perfil atualizado!",
        description: `As informações de ${values.displayName} foram salvas.`,
      });
      router.push("/admin");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível salvar as informações do usuário.",
      });
    }
  };

  const handleDeleteUser = async () => {
    if (adminUser?.uid === userId) {
      toast({
        variant: "destructive",
        title: "Ação não permitida",
        description:
          "Você não pode excluir o seu próprio usuário por esta tela.",
      });
      return;
    }

    const confirmed = window.confirm(
      `Tem certeza que deseja excluir o usuário ${userProfile?.displayName || ""}? Esta ação não pode ser desfeita.`,
    );

    if (!confirmed) return;

    try {
      setIsDeleting(true);

      const currentAuthUser = auth.currentUser;
      if (!currentAuthUser) {
        throw new Error("Sessão expirada. Faça login novamente.");
      }

      const idToken = await currentAuthUser.getIdToken(true);
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (!response.ok) {
        const responseBody = await response.json().catch(() => null);
        toast({
          variant: "destructive",
          title: "Erro ao excluir",
          description:
            responseBody?.error ||
            "Não foi possível concluir a exclusão do usuário no Authentication.",
        });
        return;
      }

      toast({
        title: "Usuário excluído!",
        description: `${userProfile?.displayName || "Usuário"} foi removido do Authentication e do banco de dados.`,
      });
      router.push("/admin");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao excluir",
        description:
          error instanceof Error
            ? error.message
            : "Não foi possível excluir o usuário.",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const isLoading =
    isAdminLoading ||
    isAdminProfileLoading ||
    isProfileLoading ||
    areGroupsLoading;

  if (
    isLoading ||
    !adminProfile ||
    adminProfile.role !== "admin" ||
    !userProfile
  ) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <Header />
      <main className="container mx-auto max-w-2xl p-4 md:p-8">
        <Button variant="outline" asChild className="mb-4">
          <Link href="/admin">Voltar para o Painel</Link>
        </Button>
        <h1 className="mb-2 text-3xl font-bold font-headline">
          Editar Usuário
        </h1>
        <p className="text-muted-foreground mb-8">
          Selecione os grupos que {userProfile?.displayName || "o usuário"} pode
          acessar.
        </p>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome Completo</FormLabel>
                  <FormControl>
                    <Input placeholder="Nome completo" {...field} />
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
                  <FormLabel>E-mail</FormLabel>
                  <FormControl>
                    <Input {...field} disabled />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormItem>
              <FormLabel>UID</FormLabel>
              <FormControl>
                <Input value={userId} disabled readOnly />
              </FormControl>
            </FormItem>

            <FormField
              control={form.control}
              name="grupo"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel className="text-base">Grupos</FormLabel>
                    <Button type="button" variant="outline" size="sm" asChild>
                      <Link href="/admin/groups">Gerenciar Grupos</Link>
                    </Button>
                  </div>
                  {groups && groups.length > 0 ? (
                    <div className="space-y-2 rounded-md border p-4">
                      {groups.map((group) => (
                        <div
                          key={group.id}
                          className="rounded-md border p-3 space-y-3"
                        >
                          <p className="font-medium">{group.name}</p>

                          <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value?.includes(group.name)}
                                onCheckedChange={(checked) => {
                                  const currentGroups = field.value || [];
                                  const currentUploadGroups =
                                    form.getValues("uploadGroups") || [];

                                  if (checked) {
                                    field.onChange([
                                      ...currentGroups,
                                      group.name,
                                    ]);
                                  } else {
                                    field.onChange(
                                      currentGroups.filter(
                                        (name) => name !== group.name,
                                      ),
                                    );
                                    form.setValue(
                                      "uploadGroups",
                                      currentUploadGroups.filter(
                                        (name) => name !== group.name,
                                      ),
                                      { shouldValidate: true },
                                    );
                                  }
                                }}
                              />
                            </FormControl>
                            <FormLabel className="font-normal cursor-pointer">
                              (Acesso/Leitura)
                            </FormLabel>
                          </FormItem>

                          <FormField
                            control={form.control}
                            name="uploadGroups"
                            render={({ field: uploadField }) => (
                              <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={uploadField.value?.includes(
                                      group.name,
                                    )}
                                    onCheckedChange={(checked) => {
                                      const currentUploadGroups =
                                        uploadField.value || [];
                                      const currentGroups =
                                        form.getValues("grupo") || [];

                                      if (checked) {
                                        if (
                                          !currentGroups.includes(group.name)
                                        ) {
                                          form.setValue(
                                            "grupo",
                                            [...currentGroups, group.name],
                                            { shouldValidate: true },
                                          );
                                        }
                                        uploadField.onChange([
                                          ...currentUploadGroups,
                                          group.name,
                                        ]);
                                      } else {
                                        uploadField.onChange(
                                          currentUploadGroups.filter(
                                            (name) => name !== group.name,
                                          ),
                                        );
                                      }
                                    }}
                                  />
                                </FormControl>
                                <FormLabel className="font-normal cursor-pointer">
                                  (GRAVAÇÃO)
                                </FormLabel>
                              </FormItem>
                            )}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground border rounded-lg bg-muted/20">
                      Nenhum grupo disponível.{" "}
                      <Link href="/admin/groups" className="underline">
                        Criar grupos
                      </Link>
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex flex-wrap gap-3">
              <Button
                type="submit"
                disabled={form.formState.isSubmitting || isDeleting}
              >
                {form.formState.isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Salvar Alterações
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDeleteUser}
                disabled={
                  isDeleting ||
                  form.formState.isSubmitting ||
                  adminUser?.uid === userId
                }
              >
                {isDeleting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Excluir Usuário
              </Button>
            </div>
          </form>
        </Form>
      </main>
    </>
  );
}
