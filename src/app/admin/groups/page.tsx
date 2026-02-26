'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { collection, doc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { Header } from '@/components/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, Trash2, FolderPlus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import Link from 'next/link';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Group {
  id: string;
  name: string;
  canUpload?: boolean;
  createdAt?: any;
}

export default function AdminGroupsPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  
  const [newGroupName, setNewGroupName] = useState('');
  const [groupError, setGroupError] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<Group | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const userDocRef = useMemoFirebase(() => (user ? doc(firestore, 'users', user.uid) : null), [firestore, user]);
  const { data: currentUserProfile, isLoading: isProfileLoading } = useDoc<{ role: string }>(userDocRef);

  const groupsQuery = useMemoFirebase(() => {
    if (currentUserProfile && currentUserProfile.role === 'admin') {
      return collection(firestore, 'groups');
    }
    return null;
  }, [firestore, currentUserProfile]);

  const { data: groups, isLoading: areGroupsLoading } = useCollection<Group>(groupsQuery);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
    if (!isProfileLoading && currentUserProfile && currentUserProfile.role !== 'admin') {
      router.push('/');
    }
  }, [user, isUserLoading, currentUserProfile, isProfileLoading, router]);

  const handleAddGroup = async () => {
    const trimmedName = newGroupName.trim();
    
    if (!trimmedName) {
      setGroupError('Digite um nome para o grupo.');
      return;
    }

    if (/\s/.test(trimmedName)) {
      setGroupError('O nome do grupo não pode conter espaços. Use hífens (-) ou underscores (_).');
      return;
    }

    // Verificar se o grupo já existe
    const groupExists = groups?.some(g => g.name.toLowerCase() === trimmedName.toLowerCase());
    if (groupExists) {
      setGroupError('Já existe um grupo com este nome.');
      return;
    }

    try {
      // Usar o nome do grupo como ID do documento para facilitar o acesso às subcoletions
      const groupRef = doc(firestore, 'groups', trimmedName);
      await setDocumentNonBlocking(groupRef, {
        name: trimmedName,
        canUpload: true,
        createdAt: serverTimestamp(),
      }, {});

      toast({
        title: 'Grupo criado!',
        description: `O grupo "${trimmedName}" foi criado com sucesso.`,
      });

      setNewGroupName('');
      setGroupError('');
    } catch (error) {
      console.error('Erro ao criar grupo:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível criar o grupo.',
      });
    }
  };

  const handleDeleteClick = (group: Group) => {
    setGroupToDelete(group);
    setDeleteDialogOpen(true);
  };

  const handleToggleUploadPermission = async (group: Group, checked: boolean | 'indeterminate') => {
    const canUpload = checked === true;

    try {
      const groupRef = doc(firestore, 'groups', group.id);
      await setDocumentNonBlocking(groupRef, {
        canUpload,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      toast({
        title: canUpload ? 'Envio permitido' : 'Envio bloqueado',
        description: `Grupo "${group.name}" ${canUpload ? 'pode enviar mídias' : 'somente leitura de mídias'}.`,
      });
    } catch (error) {
      console.error('Erro ao atualizar permissão de envio do grupo:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível atualizar a permissão de envio do grupo.',
      });
    }
  };

  const handleConfirmDelete = async () => {
    if (!groupToDelete) return;

    setIsDeleting(true);
    try {
      await deleteDoc(doc(firestore, 'groups', groupToDelete.id));
      
      toast({
        title: 'Grupo excluído!',
        description: `O grupo "${groupToDelete.name}" foi removido.`,
      });
      
      setDeleteDialogOpen(false);
      setGroupToDelete(null);
    } catch (error) {
      console.error('Erro ao excluir grupo:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível excluir o grupo.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const isLoading = isUserLoading || isProfileLoading;

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
          <Button variant="outline" asChild>
            <Link href="/admin">← Voltar para o Painel</Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-headline text-2xl flex items-center gap-2">
              <FolderPlus className="h-6 w-6" />
              Gerenciar Grupos
            </CardTitle>
            <CardDescription>
              Crie e gerencie os grupos do sistema. ({groups?.length || 0} grupos)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Formulário para adicionar novo grupo */}
            <div className="border rounded-lg p-4 bg-muted/30">
              <h3 className="font-semibold mb-4">Adicionar Novo Grupo</h3>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    value={newGroupName}
                    onChange={(e) => {
                      setNewGroupName(e.target.value);
                      setGroupError('');
                    }}
                    placeholder="Nome do grupo (sem espaços)"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleAddGroup();
                      }
                    }}
                  />
                  {groupError && (
                    <p className="text-sm text-destructive mt-1">{groupError}</p>
                  )}
                  <p className="text-sm text-muted-foreground mt-1">
                    Use hífens (-) ou underscores (_) em vez de espaços. Ex: CF-2026, Pebas_2026
                  </p>
                </div>
                <Button 
                  onClick={handleAddGroup}
                  disabled={!newGroupName.trim()}
                >
                  <FolderPlus className="h-4 w-4 mr-2" />
                  Criar Grupo
                </Button>
              </div>
            </div>

            {/* Lista de grupos existentes */}
            <div>
              <h3 className="font-semibold mb-4">Grupos Existentes</h3>
              {areGroupsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : groups && groups.length > 0 ? (
                <div className="space-y-2">
                  {groups.map((group) => (
                    <div
                      key={group.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-lg font-semibold text-primary">
                            {group.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium">{group.name}</span>
                          <div className="flex items-center gap-2 mt-1">
                            <Checkbox
                              id={`can-upload-${group.id}`}
                              checked={group.canUpload !== false}
                              onCheckedChange={(checked) => handleToggleUploadPermission(group, checked)}
                            />
                            <label htmlFor={`can-upload-${group.id}`} className="text-sm text-muted-foreground cursor-pointer">
                              Permitir envio de mídias
                            </label>
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteClick(group)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground border rounded-lg bg-muted/20">
                  Nenhum grupo criado ainda.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Dialog de confirmação de exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o grupo <strong>{groupToDelete?.name}</strong>?
              <br />
              <br />
              Esta ação não pode ser desfeita. Os usuários que pertencem a este grupo perderão o acesso às imagens associadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
