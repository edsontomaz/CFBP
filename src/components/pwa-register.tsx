"use client";

import { useEffect, useState } from "react";
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

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function PwaRegister() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [openInstallDialog, setOpenInstallDialog] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    if (standalone) {
      return;
    }

    const registerServiceWorker = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js");
      } catch (error) {
        console.error("Falha ao registrar service worker:", error);
      }
    };

    const beforeInstallHandler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setOpenInstallDialog(true);
    };

    const appInstalledHandler = () => {
      setInstallPrompt(null);
      setOpenInstallDialog(false);
    };

    registerServiceWorker();

    window.addEventListener("beforeinstallprompt", beforeInstallHandler);
    window.addEventListener("appinstalled", appInstalledHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstallHandler);
      window.removeEventListener("appinstalled", appInstalledHandler);
    };
  }, []);

  const handleInstallNow = async () => {
    if (!installPrompt) return;

    await installPrompt.prompt();
    await installPrompt.userChoice;

    setInstallPrompt(null);
    setOpenInstallDialog(false);
  };

  return (
    <AlertDialog open={openInstallDialog} onOpenChange={setOpenInstallDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Instalar BIKE PONTAL</AlertDialogTitle>
          <AlertDialogDescription>
            Este app pode ser instalado no seu dispositivo para acesso mais
            rápido e melhor experiência.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Agora não</AlertDialogCancel>
          <AlertDialogAction onClick={handleInstallNow}>
            Instalar agora
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
