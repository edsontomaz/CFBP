'use client';

import { useState, useEffect } from 'react';
import {
  DocumentReference,
  onSnapshot,
  DocumentData,
  FirestoreError,
  DocumentSnapshot,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

/** Tipo utilitário para adicionar o campo 'id' aos dados do documento. */
export type WithId<T> = T & { id: string };

/**
 * Interface para o valor de retorno do hook useDoc.
 * @template T Tipo dos dados do documento.
 */
export interface UseDocResult<T> {
  data: WithId<T> | null; // Dados do documento com ID, ou null.
  isLoading: boolean;       // True enquanto está carregando.
  error: FirestoreError | Error | null; // Objeto de erro ou null.
}

/**
 * Hook React para assinar um único documento do Firestore em tempo real.
 * * IMPORTANTE! Você DEVE MEMORIZAR o DocumentReference passado (usando useMemo ou useMemoFirebase)
 * para evitar re-assinaturas infinitas e consumo excessivo de memória/leituras.
 *
 * @template T Tipo opcional para os dados. Padrão é any.
 * @param {DocumentReference<DocumentData> | null | undefined} memoizedDocRef - 
 * A referência do documento Firestore. Aguarda se for null/undefined.
 * @returns {UseDocResult<T>} Objeto com data, isLoading e error.
 */
export function useDoc<T = any>(
  memoizedDocRef: (DocumentReference<DocumentData> & { __memo?: boolean }) | null | undefined,
): UseDocResult<T> {
  type StateDataType = WithId<T> | null;

  const [data, setData] = useState<StateDataType>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<FirestoreError | Error | null>(null);

  useEffect(() => {
    // Se a referência for nula (ex: ID do usuário ainda não disponível), reseta o estado.
    if (!memoizedDocRef) {
      setData(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    const unsubscribe = onSnapshot(
      memoizedDocRef,
      (snapshot: DocumentSnapshot<DocumentData>) => {
        if (snapshot.exists()) {
          setData({ ...(snapshot.data() as T), id: snapshot.id });
        } else {
          // Documento não existe no banco
          setData(null);
        }
        setError(null);
        setIsLoading(false);
      },
      (err: FirestoreError) => {
        console.error("Firestore useDoc Error:", err);

        const contextualError = new FirestorePermissionError({
          operation: 'get',
          path: memoizedDocRef.path,
        });

        setError(contextualError);
        setData(null);
        setIsLoading(false);

        // Dispara a propagação global do erro de permissão
        errorEmitter.emit('permission-error', contextualError);
      }
    );

    // Cleanup: remove o listener ao desmontar ou mudar a referência
    return () => unsubscribe();
  }, [memoizedDocRef]);

  // Mecanismo de defesa: Valida se a referência foi memorizada corretamente via useMemoFirebase
  if (memoizedDocRef && !memoizedDocRef.__memo) {
    throw new Error(
      `A referência do documento em useDoc não foi memorizada corretamente. 
       Use o hook useMemoFirebase para estabilizar a referência.`
    );
  }

  return { data, isLoading, error };
}