"use client";

import { useEffect, useState, useRef, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import {
  useUser,
  useFirestore,
  useCollection,
  useDoc,
  useMemoFirebase,
  useStorage,
} from "@/firebase";
import { collection, doc, addDoc, serverTimestamp } from "firebase/firestore";
import {
  ref,
  uploadBytes,
  listAll,
  getMetadata,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { Header } from "@/components/header";
import {
  Loader2,
  X,
  UploadCloud,
  Image as ImageIcon,
  Trash2,
  Download,
  ArrowLeft,
} from "lucide-react";
import Image from "next/image";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface ImageDoc {
  id: string;
  url: string;
  name: string;
  path?: string;
  createdAt: any;
  group: string;
  uploaderUid?: string;
  contentType?: string;
}

interface UserProfile {
  grupo?: string[];
  uploadGroups?: string[];
  role?: string;
}

interface GroupData {
  id: string;
  name: string;
  canUpload?: boolean;
}

export default function GalleryPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const storage = useStorage();
  const router = useRouter();
  const { toast } = useToast();

  const userDocRef = useMemoFirebase(
    () => (user ? doc(firestore, "users", user.uid) : null),
    [firestore, user],
  );
  const { data: userProfile, isLoading: isProfileLoading } =
    useDoc<UserProfile>(userDocRef);

  const guessContentType = (fileName: string) => {
    const lower = fileName.toLowerCase();
    if (lower.endsWith(".mp4")) return "video/mp4";
    if (lower.endsWith(".webm")) return "video/webm";
    if (lower.endsWith(".mov")) return "video/quicktime";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".gif")) return "image/gif";
    if (lower.endsWith(".webp")) return "image/webp";
    return undefined;
  };

  // Buscar grupos válidos da coleção groups
  const groupsQuery = useMemoFirebase(
    () => collection(firestore, "groups"),
    [firestore],
  );
  const { data: availableGroups } = useCollection<GroupData>(groupsQuery);

  const [activeGroup, setActiveGroup] = useState<string | undefined>(undefined);
  const [validUserGroups, setValidUserGroups] = useState<string[]>([]);

  // Filtrar apenas grupos que existem na coleção groups
  useEffect(() => {
    if (userProfile?.grupo && availableGroups) {
      const groupNames = availableGroups.map((g) => g.name);
      const valid = userProfile.grupo.filter((g) => groupNames.includes(g));
      setValidUserGroups(valid);
      console.log("Grupos do usuário:", userProfile.grupo);
      console.log("Grupos disponíveis:", groupNames);
      console.log("Grupos válidos:", valid);
    } else {
      setValidUserGroups([]);
    }
  }, [userProfile, availableGroups]);

  // State for upload functionality
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isDeletingImage, setIsDeletingImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State for Storage images (diretamente do Storage, sem Firestore)
  const [storageImages, setStorageImages] = useState<ImageDoc[]>([]);
  const [isLoadingStorage, setIsLoadingStorage] = useState(false);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push("/login");
    }
  }, [user, isUserLoading, router]);

  useEffect(() => {
    if (validUserGroups.length > 0 && !activeGroup) {
      setActiveGroup(validUserGroups[0]);
    }
  }, [validUserGroups, activeGroup]);

  useEffect(() => {
    if (files.length === 0) {
      setPreviews([]);
      return;
    }
    const objectUrls = files.map((file) => URL.createObjectURL(file));
    setPreviews(objectUrls);
    return () => {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  // Função para buscar imagens diretamente do Storage
  const loadImagesFromStorage = async (groupName: string) => {
    if (!storage) return;

    setIsLoadingStorage(true);
    try {
      const groupFolderRef = ref(storage, groupName);
      const listResult = await listAll(groupFolderRef);

      // Buscar metadados e criar URLs para cada arquivo
      const imagesPromises = listResult.items.map(async (itemRef) => {
        try {
          const metadata = await getMetadata(itemRef);
          const downloadURL = await getDownloadURL(itemRef);
          const cacheBustedUrl = `${downloadURL}&v=${metadata.generation}`;

          const resolvedContentType =
            metadata.contentType || guessContentType(itemRef.name);

          const imageDoc: ImageDoc = {
            id: itemRef.name, // Usar o nome do arquivo como ID
            url: cacheBustedUrl,
            name: itemRef.name,
            path: itemRef.fullPath,
            createdAt: metadata.timeCreated,
            group: groupName,
            uploaderUid: metadata.customMetadata?.uploaderUid,
            contentType: resolvedContentType,
          };

          return imageDoc;
        } catch (error) {
          console.error(`Erro ao carregar metadata de ${itemRef.name}:`, error);
          return null;
        }
      });

      const images = (await Promise.all(imagesPromises)).filter(
        (img) => img !== null,
      ) as ImageDoc[];

      // Ordenar por data de criação (mais recente primeiro)
      images.sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateB - dateA;
      });

      setStorageImages(images);
    } catch (error) {
      console.error("Erro ao listar imagens do Storage:", error);
      setStorageImages([]);
    } finally {
      setIsLoadingStorage(false);
    }
  };

  // Carregar imagens do Storage quando o grupo ativo mudar
  useEffect(() => {
    if (activeGroup && user) {
      loadImagesFromStorage(activeGroup);
    } else {
      setStorageImages([]);
    }
  }, [activeGroup, user, storage]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setFiles(Array.from(event.target.files));
      setIsUploadDialogOpen(true);
    }
    if (event.target) {
      event.target.value = ""; // Reset file input
    }
  };

  const handleRemoveFile = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    setFiles(newFiles);
    if (newFiles.length === 0) {
      setIsUploadDialogOpen(false);
    }
  };

  const hasGroups = validUserGroups.length > 0;
  const targetGroup =
    activeGroup || (hasGroups ? validUserGroups[0] : undefined);
  const activeGroupData = availableGroups?.find(
    (group) => group.name === targetGroup,
  );
  const userCanUploadToActiveGroup = targetGroup
    ? (userProfile?.uploadGroups?.includes(targetGroup) ??
      validUserGroups.includes(targetGroup))
    : false;
  const canUploadToActiveGroup =
    activeGroupData?.canUpload !== false && userCanUploadToActiveGroup;

  const handleUpload = async () => {
    if (isUserLoading || !user || files.length === 0 || !targetGroup) {
      toast({
        variant: "destructive",
        title: "Não foi possível enviar",
        description:
          "Você precisa estar logado e pertencer a um grupo para poder enviar arquivos.",
      });
      return;
    }

    if (!canUploadToActiveGroup) {
      toast({
        variant: "destructive",
        title: "Envio bloqueado para este grupo",
        description: `O envio está desativado para você neste grupo.`,
      });
      return;
    }

    setIsUploading(true);

    try {
      // Buscar o número mais alto atual no Storage para continuar a sequência
      const groupFolderRef = ref(storage, targetGroup);
      let maxNumber = 0;

      try {
        const listResult = await listAll(groupFolderRef);
        console.log(`=== Buscando imagens existentes no Storage ===`);
        console.log(`Pasta: ${targetGroup}`);
        console.log(`Arquivos encontrados: ${listResult.items.length}`);

        listResult.items.forEach((itemRef) => {
          // Extrair apenas o nome do arquivo (não o caminho completo)
          const fileName = itemRef.name;
          console.log(`Arquivo encontrado: ${fileName}`);

          // Tentar extrair número do nome se seguir o padrão "img-001.ext"
          const match = fileName.match(/img-(\d+)/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNumber) {
              maxNumber = num;
              console.log(`Novo número máximo: ${maxNumber}`);
            }
          }
        });

        console.log(`Número máximo encontrado: ${maxNumber}`);
        console.log(`Próximo número será: ${maxNumber + 1}`);
      } catch (listError) {
        console.log(
          "Pasta ainda não existe ou está vazia. Começando do número 1.",
        );
        maxNumber = 0;
      }

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const sequentialNumber = maxNumber + i + 1;

        // Extrair extensão do arquivo original
        const extension = file.name.split(".").pop() || "jpg";

        // Gerar nome sequencial: img-001.jpg, img-002.png, etc
        const sequentialName = `img-${String(sequentialNumber).padStart(3, "0")}.${extension}`;

        // Upload direto na pasta do grupo (sem pasta do usuário)
        const filePath = `${targetGroup}/${sequentialName}`;
        const storageRef = ref(storage, filePath);

        await uploadBytes(storageRef, file, {
          contentType: file.type,
          customMetadata: {
            uploaderUid: user.uid,
          },
        });

        const downloadURL = await getDownloadURL(storageRef);

        const imageData = {
          url: downloadURL,
          path: filePath,
          name: sequentialName,
          group: targetGroup,
          uploaderUid: user.uid,
          contentType: file.type,
          createdAt: serverTimestamp(),
        };

        try {
          const docRef = await addDoc(
            collection(firestore, "groups", targetGroup, "images"),
            imageData,
          );
        } catch (firestoreError: any) {
          console.error(
            "❌ ERRO AO CRIAR DOCUMENTO NO FIRESTORE:",
            firestoreError,
          );
          console.error("Erro completo:", {
            code: firestoreError.code,
            message: firestoreError.message,
            stack: firestoreError.stack,
          });
          throw firestoreError; // Re-throw para o catch externo
        }
      }

      toast({
        title: "Upload concluído!",
        description: `Todos os ${files.length} arquivos foram enviados com sucesso para o grupo ${targetGroup}.`,
      });

      setFiles([]);
      setIsUploadDialogOpen(false);

      // Recarregar imagens do Storage após upload
      await loadImagesFromStorage(targetGroup);
    } catch (error: any) {
      console.error("Error during upload: ", error);
      toast({
        variant: "destructive",
        title: "Erro no Upload",
        description:
          "Ocorreu um erro inesperado ao tentar enviar os arquivos. Verifique as regras do Storage no console do Firebase.",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const isLoading = isUserLoading || isProfileLoading;
  const isAdmin = userProfile?.role === "admin";

  const handleGoBack = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  };

  const handleDeleteImage = async (image: ImageDoc) => {
    if (!activeGroup) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Grupo não identificado.",
      });
      return;
    }

    setIsDeletingImage(image.id);

    try {
      // Tenta usar o path salvo, senão tenta extrair da URL
      let pathToDelete = image.path;
      if (!pathToDelete && image.url) {
        const urlParts = image.url.split("/o/");
        if (urlParts.length > 1) {
          const encodedPath = urlParts[1].split("?")[0];
          pathToDelete = decodeURIComponent(encodedPath);
        }
      }

      if (!pathToDelete) {
        pathToDelete = `${image.group}/${image.name}`;
      }

      const storageRef = ref(storage, pathToDelete);
      await deleteObject(storageRef);

      await loadImagesFromStorage(activeGroup);

      toast({
        title: "Imagem deletada!",
      });
    } catch (error) {
      console.error("Erro ao deletar imagem:", error);
      toast({
        variant: "destructive",
        title: "Erro ao deletar",
        description: "Não foi possível remover a imagem. Tente novamente.",
      });
    } finally {
      setIsDeletingImage(null);
    }
  };

  const handleDownloadMedia = async (image: ImageDoc) => {
    try {
      const link = document.createElement("a");
      link.href = `/api/media-download?url=${encodeURIComponent(image.url)}&name=${encodeURIComponent(image.name)}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({
        title: "Download iniciado",
        description: `Baixando ${image.name}`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Falha no download",
        description: "Não foi possível iniciar o download.",
      });
    }
  };

  const handleImageError = async (imageId: string, imageName: string) => {
    // Sem Firestore ativo, apenas registra o erro de carregamento
    console.log("Erro ao carregar mídia do Storage:", imageId, imageName);
  };

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
        <div className="mb-4">
          <Button variant="outline" onClick={handleGoBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </div>
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold font-headline">
            Sua Galeria de Mídia
          </h1>
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={!hasGroups || isUploading || !canUploadToActiveGroup}
          >
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
          <Tabs
            value={activeGroup}
            onValueChange={setActiveGroup}
            className="w-full"
          >
            <TabsList className="mb-4 grid w-full grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
              {validUserGroups.map((groupName) => (
                <TabsTrigger key={groupName} value={groupName}>
                  {groupName}
                </TabsTrigger>
              ))}
            </TabsList>
            {activeGroup && (
              <TabsContent value={activeGroup}>
                {isLoadingStorage && (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                  </div>
                )}

                {!isLoadingStorage && (storageImages?.length ?? 0) > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {storageImages?.map((image) => (
                      <Card
                        key={image.id}
                        className="overflow-hidden relative group"
                      >
                        <CardContent className="p-0">
                          <div className="aspect-square relative bg-muted">
                            {image.contentType &&
                            image.contentType.startsWith("video/") ? (
                              <video
                                src={image.url}
                                controls
                                className="w-full h-full object-cover"
                                onError={() =>
                                  handleImageError(image.id, image.name)
                                }
                              />
                            ) : (
                              <img
                                src={image.url}
                                alt={image.name}
                                className="w-full h-full object-cover"
                                onError={() =>
                                  handleImageError(image.id, image.name)
                                }
                              />
                            )}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                              <div className="flex gap-2">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleDownloadMedia(image)}
                                >
                                  <Download className="h-4 w-4 mr-2" />
                                  Download
                                </Button>
                                {isAdmin && (
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => handleDeleteImage(image)}
                                    disabled={isDeletingImage === image.id}
                                  >
                                    {isDeletingImage === image.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <>
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Deletar
                                      </>
                                    )}
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {!isLoadingStorage && (storageImages?.length ?? 0) === 0 && (
                  <div className="text-center py-16 border-2 border-dashed rounded-lg">
                    <h2 className="text-xl font-semibold">
                      Nenhuma mídia neste grupo
                    </h2>
                    <p className="text-muted-foreground mt-2">
                      Seja o primeiro a enviar uma imagem ou vídeo para o grupo
                      '{activeGroup}'.
                    </p>
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-4"
                      disabled={!canUploadToActiveGroup}
                    >
                      <UploadCloud className="mr-2 h-4 w-4" />
                      Enviar Mídia
                    </Button>
                    {!canUploadToActiveGroup && (
                      <p className="text-sm text-muted-foreground mt-2">
                        Envio desativado para este grupo (flag do grupo ou do
                        usuário).
                      </p>
                    )}
                  </div>
                )}
              </TabsContent>
            )}
          </Tabs>
        ) : (
          <div className="text-center py-16 border-2 border-dashed rounded-lg">
            <h2 className="text-xl font-semibold">
              Você não pertence a nenhum grupo
            </h2>
            <p className="text-muted-foreground mt-2">
              Peça a um administrador para te adicionar a um grupo para poder
              ver e enviar mídias.
            </p>
            <Button asChild className="mt-4">
              <Link href="/profile">Ver Perfil</Link>
            </Button>
          </div>
        )}

        <Dialog
          open={isUploadDialogOpen}
          onOpenChange={(open) => {
            if (!open) setFiles([]);
            setIsUploadDialogOpen(open);
          }}
        >
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Enviar Mídia para "{targetGroup}"</DialogTitle>
              <DialogDescription>
                Os seguintes arquivos serão enviados para sua galeria. Você pode
                remover arquivos antes de confirmar.
              </DialogDescription>
            </DialogHeader>

            {files.length > 0 ? (
              <div className="max-h-[60vh] overflow-y-auto p-1 -mx-2">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 px-2">
                  {files.map((file, index) => {
                    const preview = previews[index];
                    if (!file || typeof file.type !== "string" || !preview)
                      return null;
                    const itemKey = `${file.name}-${file.lastModified}-${index}`;
                    return (
                      <div key={itemKey} className="relative group">
                        {file.type.startsWith("image/") ? (
                          <Image
                            src={preview}
                            alt={`Preview ${index + 1}`}
                            width={200}
                            height={200}
                            className="rounded-md object-cover aspect-square"
                          />
                        ) : (
                          <video
                            src={preview}
                            className="rounded-md object-cover aspect-square bg-black"
                            muted
                            autoPlay
                            loop
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
                <p className="text-muted-foreground">
                  Nenhum arquivo selecionado.
                </p>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setFiles([]);
                  setIsUploadDialogOpen(false);
                }}
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
