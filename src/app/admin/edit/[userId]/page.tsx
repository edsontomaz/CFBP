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
  useMemoFirebase,
  setDocumentNonBlocking,
} from '@/firebase';
import { doc, serverTimestamp } from 'firebase/firestore';
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

const defaultGroups = ['CF 2026', 'Pebas 2026'];

export default function AdminEditUserPage() {
  const { user: adminUser, isUserLoading: isAdminLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const params = useParams();
  const userId = params.userId as string;

  // State for group management
  const [availableGroups, setAvailableGroups] = useState(defaultGroups);
  const [newGroupName, setNewGroupName] = useState('');

  // Verify if the logged-in user is an admin
  const adminDocRef = useMemoFirebase(() => (adminUser ? doc(firestore, 'users', adminUser.uid) : null), [firestore, adminUser]);
  const { data: adminProfile, isLoading: isAdminProfileLoading } = useDoc<{ role: string }>(adminDocRef);

  // Fetch the profile of the user being edited
  const userDocRef = useMemoFirebase(() => doc(firestore, 'users', userId), [firestore, userId]);
  const { data: userProfile, isLoading: isProfileLoading } = useDoc<EditProfileFormValues>(userDocRef);

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
      // Combine default groups with user's current groups
      const allGroups = new Set([...defaultGroups, ...(userProfile.grupo || [])]);
      setAvailableGroups(Array.from(allGroups));
      form.reset(userProfile);
    }
  }, [userProfile, form]);
  
  const handleAddNewGroup = () => {
    const trimmedName = newGroupName.trim();
    if (trimmedName && !availableGroups.includes(trimmedName)) {
        setAvailableGroups(prev => [...prev, trimmedName]);
        const currentGroups = form.getValues('grupo') || [];
        form.setValue('grupo', [...currentGroups, trimmedName], { shouldDirty: true });
        setNewGroupName('');
    }
  };

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
  
  const isLoading = isAdminLoading || isAdminProfileLoading || isProfileLoading;

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
        <p className="text-muted-foreground mb-8">Modifique os grupos para {userProfile?.displayName || 'o usuário'}.</p>
        
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
                  <FormLabel className="text-base">Grupos</FormLabel>
                   <div className="space-y-2 rounded-md border p-4">
                    {availableGroups.map((groupName) => (
                        <FormItem key={groupName} className="flex flex-row items-center space-x-3 space-y-0">
                            <FormControl>
                                <Checkbox
                                    checked={field.value?.includes(groupName)}
                                    onCheckedChange={(checked) => {
                                        const currentValue = field.value || [];
                                        if (checked) {
                                            field.onChange([...currentValue, groupName]);
                                        } else {
                                            field.onChange(currentValue.filter((id) => id !== groupName));
                                        }
                                    }}
                                />
                            </FormControl>
                            <FormLabel className="font-normal">{groupName}</FormLabel>
                        </FormItem>
                    ))}
                  </div>
                  <FormMessage />
                  <div className="flex items-center gap-2 pt-2">
                    <Input
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        placeholder="Criar novo grupo"
                        className="h-9"
                    />
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddNewGroup}
                        disabled={!newGroupName.trim() || availableGroups.includes(newGroupName.trim())}
                    >
                        Adicionar
                    </Button>
                  </div>
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
