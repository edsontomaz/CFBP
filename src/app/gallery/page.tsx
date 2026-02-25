'use client';

import { useEffect, useState, useRef, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useCollection, useDoc, useMemoFirebase, useStorage } from '@/firebase';
import { collection, query, orderBy, doc, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Header } from '@/components/header';
import { Loader2, X, UploadCloud, Image as ImageIcon } from 'lucide-react';
import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

interface ImageDoc {
  id: string;
  url: string;
  name: string;
  createdAt: any;
  group: string;
  contentType?: string;
}

interface UserProfile {
  grupo?: string[];
}

export default function GalleryPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const storage = useStorage();
  const router = useRouter();
  const { toast } = useToast();

  const userDocRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(userDocRef);

  const [activeGroup, setActiveGroup] = useState<string | undefined>(undefined);

  // State for upload functionality
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  useEffect(() => {
    if (userProfile?.grupo && userProfile.grupo.length > 0 && !activeGroup) {
      setActiveGroup(userProfile.grupo[0]);
    }
  }, [userProfile, activeGroup]);

  useEffect(() => {
    if (files.length === 0) {
      setPreviews([]);
      return;
    }
    const objectUrls = files.map(file => URL.createObjectURL(file));
    setPreviews(objectUrls);
    return () => {
      objectUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [files]);

  const imagesQuery = useMemoFirebase(() => {
    if (!activeGroup) return null;
    const collRef = collection(firestore, 'groups', activeGroup, 'images');
    return query(collRef, orderBy('createdAt', 'desc'));
  }, [firestore, activeGroup]);

  const { data: groupImages, isLoading: areImagesLoading } = useCollection<ImageDoc>(imagesQuery);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setFiles(Array.from(event.target.files));
      setIsUploadDialogOpen(true);
    }
    if (event.target) {
      event.target.value = ''; // Reset file input
    }
  };

  const handleRemoveFile = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    setFiles(newFiles);
    if (newFiles.length === 0) {
      setIsUploadDialogOpen(false);
    }
  }

  const hasGroups = userProfile?.grupo && userProfile.grupo.length > 0;
  const targetGroup = activeGroup || (hasGroups ? userProfile.grupo![0] : undefined);

  const handleUpload = async () => {
    if (isUserLoading || !user || files.length === 0 || !targetGroup) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível enviar',
        description: 'Você precisa estar logado e pertencer a um grupo para poder enviar arquivos.',
      });
      return;
    }

    setIsUploading(true);

    try {
      for (const file of files) {
        const filePath = `${targetGroup}/${user.uid}/${Date.now()}-${file.name}`;
        const storageRef = ref(storage, filePath);

        await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(storageRef);

        await addDoc(collection(firestore, 'groups', targetGroup, 'images'), {
          url: downloadURL,
          path: filePath,
          name: file.name,
          group: targetGroup,
          uploaderUid: user.uid,
          contentType: file.type,
          createdAt: serverTimestamp(),
        });
      }

      toast({
        title: 'Upload concluído!',
        description: `Todos os ${files.length} arquivos foram enviados com sucesso para o grupo ${targetGroup}.`,
      });

      setFiles([]);
      setIsUploadDialogOpen(false);

    } catch (error: any) {
      console.error("Error during upload: ", error);
      toast({
        variant: 'destructive',
        title: 'Erro no Upload',
        description: 'Ocorreu um erro inesperado ao tentar enviar os arquivos. Verifique as regras do Storage no console do Firebase.',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const isLoading = isUserLoading || isProfileLoading;

  if (isLoading || !user) {
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
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold font-headline">Sua Galeria de Mídia</h1>
          <Button onClick={() => fileInputRef.current?.click()} disabled={!hasGroups || isUploading}>
            <UploadCloud className="mr-2 h-4 w-4" />
            Enviar Mídia
          </Button>
          <Input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            multiple
            accept="image/*,video/*"
            className="hidden"
          />
        </div>

        {hasGroups ? (
          <Tabs value={activeGroup} onValueChange={setActiveGroup} className="w-full">
            <TabsList className="mb-4 grid w-full grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
              {userProfile.grupo?.map(groupName => (
                <TabsTrigger key={groupName} value={groupName}>
                  {groupName}
                </TabsTrigger>
              ))}
            </TabsList>
            {activeGroup && (
              <TabsContent value={activeGroup}>
                {areImagesLoading && (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                  </div>
                )}

                {!areImagesLoading && (groupImages?.length ?? 0) > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {groupImages?.map(image => (
                      <Card key={image.id} className="overflow-hidden">
                        <CardContent className="p-0">
                          <div className="aspect-square relative bg-muted">
                            {image.contentType && image.contentType.startsWith('video/') ? (
                              <video
                                src={image.url}
                                controls
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Image
                                src={image.url}
                                alt={image.name}
                                fill
                                className="object-cover"
                                sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                              />
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {!areImagesLoading && (groupImages?.length ?? 0) === 0 && (
                  <div className="text-center py-16 border-2 border-dashed rounded-lg">
                    <h2 className="text-xl font-semibold">Nenhuma mídia neste grupo</h2>
                    <p className="text-muted-foreground mt-2">Seja o primeiro a enviar uma imagem ou vídeo para o grupo '{activeGroup}'.</p>
                    <Button onClick={() => fileInputRef.current?.click()} className="mt-4">
                      <UploadCloud className="mr-2 h-4 w-4" />
                      Enviar Mídia
                    </Button>
                  </div>
                )}
              </TabsContent>
            )}
          </Tabs>
        ) : (
          <div className="text-center py-16 border-2 border-dashed rounded-lg">
            <h2 className="text-xl font-semibold">Você não pertence a nenhum grupo</h2>
            <p className="text-muted-foreground mt-2">Peça a um administrador para te adicionar a um grupo para poder ver e enviar mídias.</p>
            <Button asChild className="mt-4">
              <Link href="/profile">Ver Perfil</Link>
            </Button>
          </div>
        )}

        <Dialog open={isUploadDialogOpen} onOpenChange={(open) => { if (!open) setFiles([]); setIsUploadDialogOpen(open); }}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Enviar Mídia para "{targetGroup}"</DialogTitle>
              <DialogDescription>
                Os seguintes arquivos serão enviados para sua galeria. Você pode remover arquivos antes de confirmar.
              </DialogDescription>
            </DialogHeader>

            {previews.length > 0 ? (
              <div className="max-h-[60vh] overflow-y-auto p-1 -mx-2">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 px-2">
                  {previews.map((preview, index) => {
                    const file = files[index];
                    return (
                      <div key={index} className="relative group">
                        {file.type.startsWith('image/') ? (
                          <Image
                            src={preview}
                            alt={`Preview ${index + 1}`}
                            width={200} height={200}
                            className="rounded-md object-cover aspect-square"
                          />
                        ) : (
                          <video
                            src={preview}
                            className="rounded-md object-cover aspect-square bg-black"
                            muted autoPlay loop
                          />
                        )}
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 z-10"
                          onClick={() => handleRemoveFile(index)}
                          disabled={isUploading}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center py-10">
                <p className="text-muted-foreground">Nenhum arquivo selecionado.</p>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => { setFiles([]); setIsUploadDialogOpen(false); }}
                disabled={isUploading}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleUpload}
                disabled={isUploading || files.length === 0}
              >
                {isUploading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Enviar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
