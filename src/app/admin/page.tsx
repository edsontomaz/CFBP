'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import { Header } from '@/components/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, FolderPlus } from 'lucide-react';

interface UserProfile {
  id: string;
  displayName: string;
  email: string;
  role: string;
}

export default function AdminDashboardPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();

  const userDocRef = useMemoFirebase(() => (user ? doc(firestore, 'users', user.uid) : null), [firestore, user]);
  const { data: currentUserProfile, isLoading: isProfileLoading } = useDoc<{ role: string }>(userDocRef);

  const usersQuery = useMemoFirebase(() => {
    // Only fetch users if the current user is confirmed to be an admin
    if (currentUserProfile && currentUserProfile.role === 'admin') {
      return collection(firestore, 'users');
    }
    return null;
  }, [firestore, currentUserProfile]);

  const { data: users, isLoading: areUsersLoading } = useCollection<UserProfile>(usersQuery);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
    if (!isProfileLoading && currentUserProfile && currentUserProfile.role !== 'admin') {
      router.push('/');
    }
  }, [user, isUserLoading, currentUserProfile, isProfileLoading, router]);

  const isLoading = isUserLoading || isProfileLoading || areUsersLoading;

  if (isLoading || !currentUserProfile || currentUserProfile.role !== 'admin') {
    return (
      <div className="flex min-h-screen w-full items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 container mx-auto p-4 md:p-8">
        <div className="mb-4">
          <Button asChild>
            <Link href="/admin/groups">
              <FolderPlus className="mr-2 h-4 w-4" />
              Gerenciar Grupos
            </Link>
          </Button>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle className="font-headline text-2xl">Painel do Administrador</CardTitle>
            <CardDescription>
              Gerencie os usuários cadastrados no sistema. ({users?.length || 0} usuários)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users && users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.displayName}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                        {u.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/admin/edit/${u.id}`}>
                          Editar
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
             {(!users || users.length === 0) && (
                <div className="text-center py-16 text-muted-foreground">
                    Nenhum usuário encontrado.
                </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
