'use client';

import { useState, useEffect } from 'react';
import {
  Query,
  onSnapshot,
  DocumentData,
  FirestoreError,
  QuerySnapshot,
  CollectionReference,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

/** Utilitário para adicionar o campo 'id' aos dados do documento. */
export type WithId<T> = T & { id: string };

/** Interface para o retorno do hook useCollection. */
export interface UseCollectionResult<T> {
  data: WithId<T>[] | null;
  isLoading: boolean;
  error: FirestoreError | Error | null;
}

/** * Interface para acessar propriedades internas do Firebase com segurança. 
 * Útil para extrair o caminho (path) em caso de erro.
 */
export interface InternalQuery extends Query<DocumentData> {
  _query?: {
    path?: {
      canonicalString(): string;
    }
  }
}

/**
 * Hook para assinar uma coleção ou query do Firestore em tempo real.
 * * IMPORTANTE: O parâmetro targetRefOrQuery DEVE ser memorizado com useMemo ou useMemoFirebase.
 * Caso contrário, um novo listener será criado a cada renderização, gerando loops infinitos.
 */
export function useCollection<T = any>(
  memoizedTargetRefOrQuery: ((CollectionReference<DocumentData> | Query<DocumentData>) & { __memo?: boolean }) | null | undefined,
): UseCollectionResult<T> {
  type ResultItemType = WithId<T>;
  type StateDataType = ResultItemType[] | null;

  const [data, setData] = useState<StateDataType>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<FirestoreError | Error | null>(null);

  useEffect(() => {
    // Se não houver query (ex: aguardando carregar o ID do usuário), reseta o estado.
    if (!memoizedTargetRefOrQuery) {
      setData(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    // Inicia o listener em tempo real
    const unsubscribe = onSnapshot(
      memoizedTargetRefOrQuery,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const results: ResultItemType[] = snapshot.docs.map(doc => ({
          ...(doc.data() as T),
          id: doc.id,
        }));
        
        setData(results);
        setError(null);
        setIsLoading(false);
      },
      (err: FirestoreError) => {
        console.error("Firestore useCollection Error:", err);

        // Extrai o caminho da query para dar contexto ao erro de permissão
        let path = 'unknown-path';
        try {
          path = memoizedTargetRefOrQuery.type === 'collection'
            ? (memoizedTargetRefOrQuery as CollectionReference).path
            : (memoizedTargetRefOrQuery as unknown as InternalQuery)._query?.path?.canonicalString() || 'query';
        } catch (e) {
          path = 'error-resolving-path';
        }

        const contextualError = new FirestorePermissionError({
          operation: 'list',
          path,
        });

        setError(contextualError);
        setData(null);
        setIsLoading(false);

        // Dispara propagação global de erro (ex: para mostrar um Toast)
        errorEmitter.emit('permission-error', contextualError);
      }
    );

    // Cleanup: remove o listener ao desmontar o componente ou mudar a query
    return () => unsubscribe();
  }, [memoizedTargetRefOrQuery]);

  // Mecanismo de defesa: Força o desenvolvedor a usar o useMemoFirebase
  if (memoizedTargetRefOrQuery && !memoizedTargetRefOrQuery.__memo) {
    throw new Error(
      `A query passada para useCollection não foi memorizada corretamente. 
       Certifique-se de usar o hook useMemoFirebase para evitar loops de renderização.`
    );
  }

  return { data, isLoading, error };
}