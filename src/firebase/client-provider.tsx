'use client';

import React, { useMemo, type ReactNode } from 'react';
import { FirebaseProvider } from '@/firebase/provider';
import { initializeFirebase } from '@/firebase';

interface FirebaseClientProviderProps {
  children: ReactNode;
}

/**
 * Componente que isola a inicialização do Firebase no lado do cliente.
 * Ele serve como o invólucro (wrapper) principal no seu layout.tsx.
 */
export function FirebaseClientProvider({ children }: FirebaseClientProviderProps) {
  // Inicializa os serviços do Firebase apenas uma vez na montagem do componente.
  const firebaseServices = useMemo(() => {
    return initializeFirebase();
  }, []); // Dependências vazias garantem estabilidade da instância.

  return (
    <FirebaseProvider
      firebaseApp={firebaseServices.firebaseApp}
      auth={firebaseServices.auth}
      firestore={firebaseServices.firestore}
      storage={firebaseServices.storage}
    >
      {children}
    </FirebaseProvider>
  );
}