import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminFirestore, hasServiceAccountCredentials } from '@/lib/firebase-admin';

async function isRequesterAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, status: 401, message: 'Token ausente.' };
  }

  const idToken = authHeader.slice(7);

  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    const adminDoc = await adminFirestore.collection('users').doc(decoded.uid).get();

    if (!adminDoc.exists || adminDoc.data()?.role !== 'admin') {
      return { ok: false, status: 403, message: 'Acesso negado.' };
    }

    return { ok: true, uid: decoded.uid };
  } catch (error: any) {
    const message = process.env.NODE_ENV === 'development'
      ? `Token inválido. ${error?.code || ''} ${error?.message || ''}`.trim()
      : 'Token inválido.';
    return { ok: false, status: 401, message };
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  if (!hasServiceAccountCredentials) {
    return NextResponse.json(
      {
        error:
          'Credenciais do Firebase Admin não configuradas. Defina FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY no ambiente do servidor.',
      },
      { status: 500 }
    );
  }

  const authResult = await isRequesterAdmin(request);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.message }, { status: authResult.status });
  }

  const { userId } = await context.params;

  if (authResult.uid === userId) {
    return NextResponse.json(
      { error: 'Você não pode excluir seu próprio usuário por esta ação.' },
      { status: 400 }
    );
  }

  try {
    await adminFirestore.collection('users').doc(userId).delete();

    try {
      await adminAuth.deleteUser(userId);
    } catch (authError: any) {
      if (authError?.code !== 'auth/user-not-found') {
        throw authError;
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    const message = process.env.NODE_ENV === 'development'
      ? `Falha ao excluir usuário. ${error?.code || ''} ${error?.message || ''}`.trim()
      : 'Falha ao excluir usuário.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
