'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download, Loader2 } from 'lucide-react';
import { Header } from '@/components/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useCollection,
  useDoc,
  useFirestore,
  useMemoFirebase,
  useUser,
} from '@/firebase';
import { collection, doc } from 'firebase/firestore';

interface UserProfile {
  role?: string;
}

interface GroupData {
  id: string;
  name: string;
}

interface UserExportRow {
  id: string;
  displayName?: string;
  email?: string;
  grupo?: string[] | string;
  uploadGroups?: string[] | string;
  role?: string;
  sexo?: string;
  endereco?: string;
  cep?: string;
  cidade?: string;
  estado?: string;
  telefone?: string;
  nacionalidade?: string;
  cpf?: string;
  rg?: string;
  dataNascimento?: string | { seconds?: number; nanoseconds?: number };
  profissao?: string;
  fezCF?: boolean;
  modalidade?: string[] | string;
  motivacaoViagem?: string[] | string;
}

export default function ExportPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const [exportGroup, setExportGroup] = useState('');

  const userDocRef = useMemoFirebase(
    () => (user ? doc(firestore, 'users', user.uid) : null),
    [firestore, user],
  );
  const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(userDocRef);

  const groupsQuery = useMemoFirebase(
    () => (userProfile?.role === 'admin' ? collection(firestore, 'groups') : null),
    [firestore, userProfile?.role],
  );
  const { data: availableGroups } = useCollection<GroupData>(groupsQuery);

  const usersQuery = useMemoFirebase(
    () => (userProfile?.role === 'admin' ? collection(firestore, 'users') : null),
    [firestore, userProfile?.role],
  );
  const { data: allUsers, isLoading: isUsersLoading } = useCollection<UserExportRow>(usersQuery);

  const isAdmin = userProfile?.role === 'admin';

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
      return;
    }

    if (!isProfileLoading && user && userProfile && userProfile.role !== 'admin') {
      router.push('/');
    }
  }, [isUserLoading, isProfileLoading, user, userProfile, router]);

  useEffect(() => {
    if (!isAdmin) return;
    if (!availableGroups || availableGroups.length === 0) {
      setExportGroup('');
      return;
    }

    if (!exportGroup || !availableGroups.some((group) => group.name === exportGroup)) {
      setExportGroup(availableGroups[0].name);
    }
  }, [availableGroups, exportGroup, isAdmin]);

  const normalizeGroups = (value?: string[] | string) => {
    if (!value) return [] as string[];
    if (Array.isArray(value)) return value;
    return [value];
  };

  const formatGroupList = (value?: string[] | string) =>
    normalizeGroups(value).join(', ') || '-';

  const formatDate = (value?: string | { seconds?: number; nanoseconds?: number }) => {
    if (!value) return '';
    if (typeof value === 'string') return value.split('T')[0];
    if (typeof value.seconds === 'number') {
      return new Date(value.seconds * 1000).toISOString().split('T')[0];
    }
    return '';
  };

  const usersFromSelectedGroup = useMemo(() => {
    if (!isAdmin || !exportGroup || !allUsers) return [] as UserExportRow[];

    return allUsers.filter((userItem) =>
      normalizeGroups(userItem.grupo).includes(exportGroup),
    );
  }, [allUsers, exportGroup, isAdmin]);

  const handleExportUsersToExcel = async () => {
    if (!exportGroup || usersFromSelectedGroup.length === 0) return;

    const XLSX = await import('xlsx');
    const rows = usersFromSelectedGroup.map((userItem) => ({
      'NOME': userItem.displayName || '',
      'SEXO': userItem.sexo || '',
      'ENDEREÇO': userItem.endereco || '',
      'CEP': userItem.cep || '',
      'CIDADE': userItem.cidade || '',
      'ESTADO': userItem.estado || '',
      'TELEFONE': userItem.telefone || '',
      'NACIONALIDADE': userItem.nacionalidade || '',
      'CPF': userItem.cpf || '',
      'RG': userItem.rg || '',
      'DATA  NACIMENTO': formatDate(userItem.dataNascimento),
      'PROFISSÃO': userItem.profissao || '',
      'EMAIL': userItem.email || '',
      'FEC CF': userItem.fezCF ? 'SIM' : 'NÃO',
      'MODALIDADE': formatGroupList(userItem.modalidade),
      'MOTIVAÇAO VIAGEM': formatGroupList(userItem.motivacaoViagem),
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Usuarios');
    XLSX.writeFile(workbook, `usuarios-${exportGroup}.xlsx`);
  };

  if (isUserLoading || isProfileLoading || !user || !isAdmin) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="container mx-auto flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <Button variant="outline" asChild>
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Link>
          </Button>

          <Card>
            <CardHeader>
              <CardTitle>Exportar usuários por grupo</CardTitle>
              <CardDescription>
                Selecione um grupo para visualizar e exportar os dados completos dos documentos do Firestore.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <div className="w-full md:max-w-sm">
                  <Select value={exportGroup} onValueChange={setExportGroup}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um grupo" />
                    </SelectTrigger>
                    <SelectContent>
                      {(availableGroups || []).map((group) => (
                        <SelectItem key={group.id} value={group.name}>
                          {group.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={handleExportUsersToExcel}
                  disabled={!exportGroup || usersFromSelectedGroup.length === 0 || isUsersLoading}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Exportar Excel
                </Button>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Grupo</TableHead>
                      <TableHead>Upload</TableHead>
                      <TableHead>Perfil</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isUsersLoading && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          Carregando usuários...
                        </TableCell>
                      </TableRow>
                    )}

                    {!isUsersLoading && usersFromSelectedGroup.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          Nenhum usuário encontrado para o grupo selecionado.
                        </TableCell>
                      </TableRow>
                    )}

                    {!isUsersLoading &&
                      usersFromSelectedGroup.map((userItem) => (
                        <TableRow key={userItem.id}>
                          <TableCell>{userItem.displayName || '-'}</TableCell>
                          <TableCell>{userItem.email || '-'}</TableCell>
                          <TableCell>{formatGroupList(userItem.grupo)}</TableCell>
                          <TableCell>{formatGroupList(userItem.uploadGroups)}</TableCell>
                          <TableCell>{userItem.role || 'user'}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
