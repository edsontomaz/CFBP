'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  useUser,
  useFirestore,
  useDoc,
  useCollection,
  useMemoFirebase,
  setDocumentNonBlocking,
} from '@/firebase';
import { doc, collection, serverTimestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Header } from '@/components/header';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import Link from 'next/link';

const editProfileFormSchema = z.object({
  displayName: z.string().min(3, 'O nome deve ter pelo menos 3 caracteres.'),
  email: z.string().email(),
  grupo: z.array(z.string()).default([]).optional(),
});

type EditProfileFormValues = z.infer<typeof editProfileFormSchema>;

interface Group {
  id: string;
  name: string;
}

export default function AdminEditUserPage() {
  const { user: adminUser, isUserLoading: isAdminLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const params = useParams();
  const userId = params.userId as string;

  // State for group management (removed - groups now come from Firestore)

  // Verify if the logged-in user is an admin
  const adminDocRef = useMemoFirebase(() => (adminUser ? doc(firestore, 'users', adminUser.uid) : null), [firestore, adminUser]);
  const { data: adminProfile, isLoading: isAdminProfileLoading } = useDoc<{ role: string }>(adminDocRef);

  // Fetch the profile of the user being edited
  const userDocRef = useMemoFirebase(() => doc(firestore, 'users', userId), [firestore, userId]);
  const { data: userProfile, isLoading: isProfileLoading } = useDoc<EditProfileFormValues>(userDocRef);

  // Fetch all groups from Firestore
  const groupsQuery = useMemoFirebase(() => {
    if (adminProfile && adminProfile.role === 'admin') {
      return collection(firestore, 'groups');
    }
    return null;
  }, [firestore, adminProfile]);
  const { data: groups, isLoading: areGroupsLoading } = useCollection<Group>(groupsQuery);

  const form = useForm<EditProfileFormValues>({
    resolver: zodResolver(editProfileFormSchema),
    defaultValues: {
      displayName: '',
      email: '',
      grupo: [],
    },
  });

  // Security: Redirect if not admin or not logged in
  useEffect(() => {
    if (!isAdminLoading && !adminUser) {
      router.push('/login');
    }
    if (!isAdminProfileLoading && adminProfile && adminProfile.role !== 'admin') {
      router.push('/');
    }
  }, [adminUser, isAdminLoading, adminProfile, isAdminProfileLoading, router]);

  // Populate form with user data
  useEffect(() => {
    if (userProfile) {
      form.reset(userProfile);
    }
  }, [userProfile, form]);
  


  const onSubmit = async (values: EditProfileFormValues) => {
    if (!userDocRef) return;
    
    // We only want to save the fields present in the form, plus the timestamp
    const dataToSave = {
        displayName: values.displayName,
        grupo: values.grupo || [],
        updatedAt: serverTimestamp(),
    };

    try {
      // Use merge:true to avoid overwriting fields not in the form (like 'role', 'cpf', etc.)
      await setDocumentNonBlocking(userDocRef, dataToSave, { merge: true });
      
      toast({
        title: 'Perfil atualizado!',
        description: `As informações de ${values.displayName} foram salvas.`,
      });
      router.push('/admin');
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível salvar as informações do usuário.',
      });
    }
  };
  
  const isLoading = isAdminLoading || isAdminProfileLoading || isProfileLoading || areGroupsLoading;

  if (isLoading || !adminProfile || adminProfile.role !== 'admin' || !userProfile) {
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
        <h1 className="mb-2 text-3xl font-bold font-headline">Editar Usuário</h1>
        <p className="text-muted-foreground mb-8">Selecione os grupos que {userProfile?.displayName || 'o usuário'} pode acessar.</p>
        
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
            
            <FormField
              control={form.control}
              name="grupo"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel className="text-base">Grupos</FormLabel>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      asChild
                    >
                      <Link href="/admin/groups">Gerenciar Grupos</Link>
                    </Button>
                  </div>
                  {groups && groups.length > 0 ? (
                    <div className="space-y-2 rounded-md border p-4">
                      {groups.map((group) => (
                        <FormItem key={group.id} className="flex flex-row items-center space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value?.includes(group.name)}
                              onCheckedChange={(checked) => {
                                const currentValue = field.value || [];
                                if (checked) {
                                  field.onChange([...currentValue, group.name]);
                                } else {
                                  field.onChange(currentValue.filter((name) => name !== group.name));
                                }
                              }}
                            />
                          </FormControl>
                          <FormLabel className="font-normal cursor-pointer">{group.name}</FormLabel>
                        </FormItem>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground border rounded-lg bg-muted/20">
                      Nenhum grupo disponível. <Link href="/admin/groups" className="underline">Criar grupos</Link>
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <div>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar Alterações
              </Button>
            </div>
          </form>
        </Form>
      </main>
    </>
  );
}
