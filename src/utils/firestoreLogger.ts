import { auth } from '../firebase';

export type OperationType = 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';

export interface LogFirestoreErrorParams {
  timestamp?: string;
  operationType: OperationType;
  collectionName: string;
  documentId?: string | null;
  errorCode?: string;
  errorMessage: string;
  stackTrace?: string;
}

export function logFirestoreError(params: LogFirestoreErrorParams): void {
  const timestamp = params.timestamp || new Date().toISOString();
  
  const currentUser = auth ? auth.currentUser : null;
  const logPayload = {
    timestamp,
    operationType: params.operationType,
    collectionName: params.collectionName,
    documentId: params.documentId || null,
    errorCode: params.errorCode || 'UNKNOWN_FIRESTORE_ERROR',
    errorMessage: params.errorMessage,
    userAuthenticated: !!currentUser,
    userId: currentUser?.uid || null,
    stackTrace: params.stackTrace,
  };

  console.error(`[Firestore Error Log] [${timestamp}] [${params.operationType.toUpperCase()}] Collection: ${params.collectionName}`, logPayload);
}

export function createFirestoreException(
  operationType: OperationType,
  collectionName: string,
  originalError: unknown,
  documentId?: string | null
): Error {
  const errObj = originalError instanceof Error ? originalError : new Error(String(originalError));
  const errorCode = (originalError as any)?.code || 'unknown-error';
  const errorMessage = errObj.message || 'Firestore operation failed';

  logFirestoreError({
    operationType,
    collectionName,
    documentId,
    errorCode,
    errorMessage,
    stackTrace: errObj.stack,
  });

  const formattedMsg = `Firestore ${operationType} operation failed on collection '${collectionName}'${documentId ? ` (doc: ${documentId})` : ''}: ${errorMessage}`;
  return new Error(formattedMsg);
}
