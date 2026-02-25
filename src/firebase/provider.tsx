'use client';

import React, { 
  DependencyList, 
  createContext, 
  useContext, 
  ReactNode, 
  useMemo, 
  useState, 
  useEffect 
} from 'react';
import { FirebaseApp } from 'firebase/app';
import { Firestore } from 'firebase/firestore';
import { Auth, User, onAuthStateChanged } from 'firebase/auth';
import { FirebaseStorage } from 'firebase/storage';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';

// --- Interfaces de Estado ---

interface UserAuthState {
  user: User | null;
  isUserLoading: boolean;
  userError: Error | null;
}

export interface FirebaseContextState extends UserAuthState {
  areServicesAvailable: boolean;
  firebaseApp: FirebaseApp | null;
  firestore: Firestore | null;
  auth: Auth | null;
  storage: FirebaseStorage | null;
}

interface FirebaseProviderProps {
  children: ReactNode;
  firebaseApp: FirebaseApp;
  firestore: Firestore;
  auth: Auth;
  storage: FirebaseStorage;
}

// --- Contexto ---

export const FirebaseContext = createContext<FirebaseContextState | undefined>(undefined);

// --- Provider Principal ---

export const FirebaseProvider: React.FC<FirebaseProviderProps> = ({
  children,
  firebaseApp,
  firestore,
  auth,
  storage,
}) => {
  const [userAuthState, setUserAuthState] = useState<UserAuthState>({
    user: null,
    isUserLoading: true,
    userError: null,
  });

  // Subscreve às mudanças de autenticação
  useEffect(() => {
    if (!auth) {
      setUserAuthState(prev => ({ ...prev, isUserLoading: false, userError: new Error("Auth service não fornecido.") }));
      return;
    }

    // Define como carregando ao mudar a instância de auth
    setUserAuthState(prev => ({ ...prev, isUserLoading: true }));

    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        setUserAuthState({ 
          user: firebaseUser, 
          isUserLoading: false, 
          userError: null 
        });
      },
      (error) => {
        console.error("FirebaseProvider: erro no onAuthStateChanged:", error);
        setUserAuthState({ 
          user: null, 
          isUserLoading: false, 
          userError: error 
        });
      }
    );

    return () => unsubscribe();
  }, [auth]);

  // Memoriza o valor do contexto para evitar re-renderizações desnecessárias
  const contextValue = useMemo((): FirebaseContextState => {
    const servicesAvailable = !!(firebaseApp && firestore && auth && storage);
    return {
      areServicesAvailable: servicesAvailable,
      firebaseApp: servicesAvailable ? firebaseApp : null,
      firestore: servicesAvailable ? firestore : null,
      auth: servicesAvailable ? auth : null,
      storage: servicesAvailable ? storage : null,
      ...userAuthState,
    };
  }, [firebaseApp, firestore, auth, storage, userAuthState]);

  return (
    <FirebaseContext.Provider value={contextValue}>
      <FirebaseErrorListener />
      {children}
    </FirebaseContext.Provider>
  );
};

// --- Hooks de Acesso (Consumo) ---

/**
 * Hook base: Garante que os serviços estão prontos antes de permitir o uso.
 * Previne erros de "undefined" ao tentar acessar storage ou firestore.
 */
export const useFirebase = () => {
  const context = useContext(FirebaseContext);

  if (context === undefined) {
    throw new Error('useFirebase deve ser usado dentro de um FirebaseProvider.');
  }

  if (!context.areServicesAvailable) {
    throw new Error('Serviços core do Firebase não estão disponíveis. Verifique as props do Provider.');
  }

  // Retorno com tipos garantidos (non-null assertion interna para o TS)
  return {
    firebaseApp: context.firebaseApp!,
    firestore: context.firestore!,
    auth: context.auth!,
    storage: context.storage!,
    user: context.user,
    isUserLoading: context.isUserLoading,
    userError: context.userError,
  };
};

// Hooks Específicos
export const useAuth = () => useFirebase().auth;
export const useFirestore = () => useFirebase().firestore;
export const useStorage = () => useFirebase().storage;
export const useFirebaseApp = () => useFirebase().firebaseApp;

/**
 * Hook para monitorar o estado do usuário de forma simples.
 */
export const useUser = () => {
  const { user, isUserLoading, userError } = useFirebase();
  return { user, isUserLoading, userError };
};

// --- Utilitários de Memorização ---

type MemoFirebase<T> = T & { __memo?: boolean };

/**
 * useMemoFirebase: Adiciona uma flag __memo para compatibilidade com hooks
 * de coleção que exigem referências estáveis.
 */
export function useMemoFirebase<T>(factory: () => T, deps: DependencyList): T | MemoFirebase<T> {
  const memoized = useMemo(factory, deps);
  
  if (typeof memoized !== 'object' || memoized === null) return memoized;
  (memoized as MemoFirebase<T>).__memo = true;
  
  return memoized;
}