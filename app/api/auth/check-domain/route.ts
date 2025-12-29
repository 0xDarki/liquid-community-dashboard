import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Route pour vérifier si le domaine actuel est autorisé (côté client)
export async function GET(request: Request) {
  try {
    const authorizedDomain = process.env.AUTHORIZED_DOMAIN || process.env.NEXT_PUBLIC_AUTHORIZED_DOMAIN;
    
    // Si aucun domaine n'est configuré, autoriser toutes les requêtes (pour le développement)
    if (!authorizedDomain) {
      return NextResponse.json({
        authorized: true,
        message: 'No authorized domain configured, allowing all domains',
      });
    }
    
    // Récupérer le host de la requête
    const host = request.headers.get('host') || '';
    const url = new URL(request.url);
    const requestHost = host || url.hostname;
    
    // Normaliser les domaines (enlever le protocole et le port si présent)
    const normalizedAuthorized = authorizedDomain.replace(/^https?:\/\//, '').split(':')[0].toLowerCase();
    const normalizedRequest = requestHost.replace(/^https?:\/\//, '').split(':')[0].toLowerCase();
    
    // Vérifier si le domaine correspond (exact match ou sous-domaine)
    const isAuthorized = normalizedRequest === normalizedAuthorized || 
                         normalizedRequest.endsWith(`.${normalizedAuthorized}`);
    
    return NextResponse.json({
      authorized: isAuthorized,
      currentDomain: normalizedRequest,
      authorizedDomain: normalizedAuthorized,
      message: isAuthorized 
        ? 'Domain is authorized' 
        : `Domain ${normalizedRequest} is not authorized. Expected: ${normalizedAuthorized}`,
    });
  } catch (error: any) {
    console.error('Error checking domain authorization:', error);
    return NextResponse.json({
      authorized: true, // Autoriser par défaut en cas d'erreur
      error: error?.message || 'Failed to check domain authorization',
    }, { status: 500 });
  }
}


