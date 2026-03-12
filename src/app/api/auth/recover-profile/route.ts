import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminFirestore } from "@/lib/firebase-admin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = String(body?.email || "").trim().toLowerCase();
    const mode = String(body?.mode || "recover").toLowerCase();

    if (!email) {
      return NextResponse.json(
        { error: "E-mail é obrigatório." },
        { status: 400 },
      );
    }

    const userSnapshot = await adminFirestore
      .collection("users")
      .where("email", "==", email)
      .limit(1)
      .get();

    if (userSnapshot.empty) {
      if (mode === "check") {
        return NextResponse.json({ success: true, profileExists: false });
      }

      return NextResponse.json(
        { error: "Nenhum perfil encontrado para este e-mail." },
        { status: 404 },
      );
    }

    const profileDoc = userSnapshot.docs[0];
    const profileId = profileDoc.id;
    const profileData = profileDoc.data() as {
      displayName?: string;
    };

    if (mode === "check") {
      return NextResponse.json({ success: true, profileExists: true });
    }

    try {
      const existingAuthUser = await adminAuth.getUserByEmail(email);

      if (existingAuthUser.uid !== profileId) {
        return NextResponse.json(
          {
            error:
              "Este e-mail já está vinculado a outra conta de autenticação.",
          },
          { status: 409 },
        );
      }
    } catch (error: any) {
      if (error?.code === "auth/user-not-found") {
        await adminAuth.createUser({
          uid: profileId,
          email,
          displayName: profileData.displayName,
          emailVerified: false,
        });
      } else {
        throw error;
      }
    }

    await adminFirestore.collection("users").doc(profileId).set(
      {
        accountStatus: "ativa",
        authDeleted: false,
        updatedAt: new Date(),
      },
      { merge: true },
    );

    return NextResponse.json({ success: true, profileExists: true });
  } catch (error: any) {
    const isCredentialError =
      error?.code === "app/invalid-credential" ||
      error?.code === "auth/invalid-credential" ||
      error?.message?.toLowerCase?.().includes("default credentials") ||
      error?.message?.toLowerCase?.().includes("credential");

    if (isCredentialError) {
      return NextResponse.json(
        {
          error:
            "Credenciais do Firebase Admin não configuradas no servidor. Configure FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY ou GOOGLE_APPLICATION_CREDENTIALS.",
        },
        { status: 500 },
      );
    }

    const message =
      process.env.NODE_ENV === "development"
        ? `Falha ao recuperar acesso. ${error?.code || ""} ${error?.message || ""}`.trim()
        : "Falha ao recuperar acesso.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
