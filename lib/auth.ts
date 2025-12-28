/**
 * Vérifie si la requête provient d'un domaine autorisé
 * @param request - La requête Next.js
 * @returns true si le domaine est autorisé, false sinon
 */
export function isAuthorizedDomain(request: Request): boolean {
  // Récupérer le domaine autorisé depuis les variables d'environnement
  const authorizedDomain = process.env.AUTHORIZED_DOMAIN;
  
  // Si aucun domaine n'est configuré, autoriser toutes les requêtes (pour le développement)
  if (!authorizedDomain) {
    console.warn('[isAuthorizedDomain] AUTHORIZED_DOMAIN not set, allowing all domains');
    return true;
  }
  
  // Récupérer le host de la requête
  const host = request.headers.get('host') || '';
  const url = new URL(request.url);
  const requestHost = host || url.hostname;
  
  // Normaliser les domaines (enlever le protocole et le port si présent)
  const normalizedAuthorized = authorizedDomain.replace(/^https?:\/\//, '').split(':')[0];
  const normalizedRequest = requestHost.replace(/^https?:\/\//, '').split(':')[0];
  
  // Vérifier si le domaine correspond (exact match ou sous-domaine)
  const isAuthorized = normalizedRequest === normalizedAuthorized || 
                       normalizedRequest.endsWith(`.${normalizedAuthorized}`);
  
  if (!isAuthorized) {
    console.log(`[isAuthorizedDomain] Unauthorized domain: ${normalizedRequest} (expected: ${normalizedAuthorized})`);
  }
  
  return isAuthorized;
}

/**
 * Vérifie si on est sur le domaine autorisé côté client
 * @returns true si on est sur le domaine autorisé, false sinon
 */
export function isAuthorizedDomainClient(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  
  const authorizedDomain = process.env.NEXT_PUBLIC_AUTHORIZED_DOMAIN;
  
  // Si aucun domaine n'est configuré, autoriser toutes les requêtes (pour le développement)
  if (!authorizedDomain) {
    return true;
  }
  
  const currentHost = window.location.hostname;
  const normalizedAuthorized = authorizedDomain.replace(/^https?:\/\//, '').split(':')[0];
  const normalizedCurrent = currentHost.replace(/^https?:\/\//, '').split(':')[0];
  
  return normalizedCurrent === normalizedAuthorized || 
         normalizedCurrent.endsWith(`.${normalizedAuthorized}`);
}

