'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
import { doc, serverTimestamp, Timestamp } from 'firebase/firestore';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Header } from '@/components/header';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import Link from 'next/link';


const profileFormSchema = z.object({
  displayName: z.string().min(3, 'O nome deve ter pelo menos 3 caracteres.'),
  email: z.string().email(),
  sexo: z.string().optional(),
  endereco: z.string().optional(),
  cep: z.string().optional(),
  cidade: z.string().optional(),
  estado: z.string().optional(),
  telefone: z.string().optional(),
  nacionalidade: z.string().optional(),
  cpf: z.string().optional(),
  rg: z.string().optional(),
  dataNascimento: z.string().optional(),
  profissao: z.string().optional(),
  fezCF: z.boolean().default(false).optional(),
  modalidade: z.array(z.string()).default([]).optional(),
  motivacaoViagem: z.array(z.string()).default([]).optional(),
  grupo: z.array(z.string()).default([]).optional(),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

const modalidades = [
  { id: 'Caminhada', label: 'Caminhada' },
  { id: 'Ciclismo', label: 'Ciclismo' },
  { id: 'Corrida', label: 'Corrida' },
];

const motivacoes = [
    { id: 'Religiosidade', label: 'Religiosidade' },
    { id: 'Autoconhecimento', label: 'Autoconhecimento' },
    { id: 'Turismo', label: 'Turismo' },
    { id: 'Esporte', label: 'Esporte' },
];

export default function ProfilePage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const userDocRef = useMemoFirebase(
    () => (user ? doc(firestore, 'users', user.uid) : null),
    [firestore, user]
  );
  const { data: userProfile, isLoading: isProfileLoading } = useDoc<ProfileFormValues>(userDocRef);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      displayName: '',
      email: '',
      sexo: '',
      endereco: '',
      cep: '',
      cidade: '',
      estado: '',
      telefone: '',
      nacionalidade: '',
      cpf: '',
      rg: '',
      dataNascimento: '',
      profissao: '',
      fezCF: false,
      modalidade: [],
      motivacaoViagem: [],
      grupo: [],
    },
  });

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  useEffect(() => {
    if (userProfile) {
      // This function safely formats the date of birth, whether it's a string or a Firestore Timestamp.
      // This prevents client-side crashes when rendering the form.
      const getSafeDateString = (dateValue: any): string => {
        if (!dateValue) return '';
        // If it's a Firestore Timestamp, convert it
        if (dateValue instanceof Timestamp) {
          return dateValue.toDate().toISOString().split('T')[0];
        }
        // If it's already a string, just use it (and handle potential ISO format)
        if (typeof dateValue === 'string') {
          return dateValue.split('T')[0];
        }
        return '';
      };

      const formData = {
        displayName: userProfile.displayName || '',
        email: userProfile.email || '',
        sexo: userProfile.sexo || '',
        endereco: userProfile.endereco || '',
        cep: userProfile.cep || '',
        cidade: userProfile.cidade || '',
        estado: userProfile.estado || '',
        telefone: userProfile.telefone || '',
        nacionalidade: userProfile.nacionalidade || '',
        cpf: userProfile.cpf || '',
        rg: userProfile.rg || '',
        dataNascimento: getSafeDateString(userProfile.dataNascimento),
        profissao: userProfile.profissao || '',
        fezCF: userProfile.fezCF || false,
        modalidade: userProfile.modalidade || [],
        motivacaoViagem: userProfile.motivacaoViagem || [],
        grupo: userProfile.grupo || [],
      };
      form.reset(formData);
    }
  }, [userProfile, form]);
  
  const onSubmit = async (values: ProfileFormValues) => {
    if (!userDocRef) return;
    
    const dataToSave = {
        ...values,
        dataNascimento: values.dataNascimento || null,
        updatedAt: serverTimestamp(),
    };

    try {
      await setDocumentNonBlocking(userDocRef, dataToSave, { merge: true });
      
      toast({
        title: 'Perfil atualizado!',
        description: 'Suas informações foram salvas com sucesso.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível salvar suas informações.',
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
          <Link href="/">Voltar</Link>
        </Button>
        <h1 className="mb-8 text-3xl font-bold font-headline text-center">Meu Perfil</h1>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-8">
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
                    <Input {...field} disabled />
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
                    <Input type="date" {...field} value={field.value || ''} />
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
                   <Select onValueChange={field.onChange} value={field.value || ''}>
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
                    <Input placeholder="000.000.000-00" {...field} value={field.value || ''} />
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
                    <Input placeholder="00.000.000-0" {...field} value={field.value || ''} />
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
                    <Input placeholder="Rua, Número" {...field} value={field.value || ''} />
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
                    <Input placeholder="00000-000" {...field} value={field.value || ''} />
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
                    <Input {...field} value={field.value || ''} />
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
                    <Input {...field} value={field.value || ''} />
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
                    <Input placeholder="(00) 90000-0000" {...field} value={field.value || ''} />
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
                    <Input {...field} value={field.value || ''} />
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
                    <Input {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="modalidade"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Modalidade</FormLabel>
                  <div className="flex flex-col space-y-2">
                    {modalidades.map((item) => (
                        <FormItem key={item.id} className="flex flex-row items-center space-x-3 space-y-0">
                            <FormControl>
                                <Checkbox
                                    checked={field.value?.includes(item.id)}
                                    onCheckedChange={(checked) => {
                                        const currentValue = field.value || [];
                                        if (checked) {
                                            field.onChange([...currentValue, item.id]);
                                        } else {
                                            field.onChange(currentValue.filter((id) => id !== item.id));
                                        }
                                    }}
                                />
                            </FormControl>
                            <FormLabel className="font-normal">{item.label}</FormLabel>
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
                        <FormItem key={item.id} className="flex flex-row items-center space-x-3 space-y-0">
                            <FormControl>
                                <Checkbox
                                    checked={field.value?.includes(item.id)}
                                    onCheckedChange={(checked) => {
                                        const currentValue = field.value || [];
                                        if (checked) {
                                            field.onChange([...currentValue, item.id]);
                                        } else {
                                            field.onChange(currentValue.filter((id) => id !== item.id));
                                        }
                                    }}
                                />
                            </FormControl>
                            <FormLabel className="font-normal">{item.label}</FormLabel>
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
                {(form.getValues('grupo') || []).length > 0 ? (
                  form.getValues('grupo')?.map((group) => (
                    <Badge key={group} variant="secondary">{group}</Badge>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Você ainda não pertence a nenhum grupo.</p>
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


            <div className="md:col-span-2 mt-4">
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

    