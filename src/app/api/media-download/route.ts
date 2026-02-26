import { NextRequest, NextResponse } from 'next/server';

function isAllowedMediaUrl(url: URL) {
  return (
    url.hostname === 'firebasestorage.googleapis.com' ||
    url.hostname.endsWith('.firebasestorage.app') ||
    url.hostname === 'storage.googleapis.com'
  );
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[\\/:*?"<>|]/g, '_');
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const urlParam = searchParams.get('url');
  const nameParam = searchParams.get('name') || 'arquivo';

  if (!urlParam) {
    return NextResponse.json({ error: 'Parâmetro url é obrigatório.' }, { status: 400 });
  }

  let mediaUrl: URL;
  try {
    mediaUrl = new URL(urlParam);
  } catch {
    return NextResponse.json({ error: 'URL inválida.' }, { status: 400 });
  }

  if (!isAllowedMediaUrl(mediaUrl)) {
    return NextResponse.json({ error: 'Host de mídia não permitido.' }, { status: 403 });
  }

  try {
    const upstream = await fetch(mediaUrl.toString());
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: 'Não foi possível baixar o arquivo.' }, { status: 502 });
    }

    const safeName = sanitizeFileName(nameParam);
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';

    return new NextResponse(upstream.body, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Erro inesperado ao processar download.' }, { status: 500 });
  }
}
