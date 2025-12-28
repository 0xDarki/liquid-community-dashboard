// Cache simple en mémoire pour réduire les requêtes RPC

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live en millisecondes
}

class SimpleCache {
  private cache: Map<string, CacheEntry<any>> = new Map();

  set<T>(key: string, data: T, ttl: number = 30000): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  clear(): void {
    this.cache.clear();
  }

  // Nettoyer les entrées expirées
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

export const cache = new SimpleCache();

// Nettoyer le cache toutes les minutes (uniquement côté serveur)
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {
  // Utiliser setInterval uniquement dans un contexte Node.js
  if (typeof setInterval !== 'undefined') {
    try {
      setInterval(() => {
        cache.cleanup();
      }, 60000);
    } catch (error) {
      // Ignorer les erreurs si setInterval n'est pas disponible
    }
  }
}

