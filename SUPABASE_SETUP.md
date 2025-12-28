# Configuration Supabase

Ce projet utilise Supabase pour stocker les données au lieu de Vercel Blob Storage.

## Étapes de configuration

### 1. Créer un projet Supabase

1. Allez sur [supabase.com](https://supabase.com)
2. Créez un nouveau projet
3. Notez votre URL de projet et vos clés API

### 2. Créer les tables dans Supabase

**⚠️ IMPORTANT : Vous devez créer les tables avant d'utiliser l'application !**

Exécutez le script SQL fourni dans `supabase-schema.sql` dans l'éditeur SQL de votre projet Supabase :

1. Allez dans votre projet Supabase
2. Ouvrez l'éditeur SQL (SQL Editor dans le menu de gauche)
3. Copiez-collez le **contenu complet** de `supabase-schema.sql`
4. Cliquez sur "Run" ou appuyez sur `Ctrl+Enter` (ou `Cmd+Enter` sur Mac) pour exécuter le script
5. Vérifiez que les 4 tables ont été créées : `mints`, `sync_state`, `price`, `history`

**Vérification :**
- Vous pouvez vérifier que les tables existent en visitant `/api/supabase/check` dans votre application
- Ou allez dans Supabase > Table Editor pour voir les tables créées

### 3. Configurer les variables d'environnement

Ajoutez les variables d'environnement suivantes dans votre fichier `.env.local` (pour le développement local) et dans les paramètres de votre projet Vercel (pour la production) :

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Optionnel : Restreindre les boutons Update et Recover All au domaine privé
AUTHORIZED_DOMAIN=your-private-domain.vercel.app
NEXT_PUBLIC_AUTHORIZED_DOMAIN=your-private-domain.vercel.app
```

**Note sur AUTHORIZED_DOMAIN :**
- Si vous configurez `AUTHORIZED_DOMAIN`, les boutons "Update" et "Recover All" ne seront disponibles que sur ce domaine
- Sur le domaine public, ces boutons seront masqués et les routes API retourneront une erreur 403
- Laissez ces variables vides si vous voulez autoriser tous les domaines (non recommandé en production)

**Important :**
- `NEXT_PUBLIC_SUPABASE_URL` : L'URL de votre projet Supabase (commence par `https://`)
- `SUPABASE_SERVICE_ROLE_KEY` : La clé "service_role" (pas la clé "anon") pour avoir les permissions d'écriture complètes

Pour trouver ces valeurs :
1. Allez dans votre projet Supabase
2. Cliquez sur "Settings" (Paramètres) > "API"
3. Copiez l'URL du projet pour `NEXT_PUBLIC_SUPABASE_URL`
4. Copiez la clé "service_role" (secret) pour `SUPABASE_SERVICE_ROLE_KEY`

### 4. Migration des données (optionnel)

Si vous avez des données existantes dans Vercel Blob Storage, vous pouvez les migrer vers Supabase en utilisant les API routes existantes. Les données seront automatiquement sauvegardées dans Supabase lors de la prochaine synchronisation.

## Structure des tables

Le schéma crée 4 tables :

- **mints** : Stocke toutes les transactions mint (array JSON)
- **sync_state** : Stocke l'état de synchronisation (objet JSON)
- **price** : Stocke les prix des tokens (objet JSON)
- **history** : Stocke les données historiques (array JSON)

Chaque table a :
- `id` : Identifiant unique (auto-incrémenté)
- `key` : Clé unique pour identifier le type de données (ex: 'mints', 'sync_state')
- `data` : Les données JSON stockées
- `updated_at` : Timestamp de dernière mise à jour (auto-mis à jour)

## Fallback vers le filesystem local

Si les variables d'environnement Supabase ne sont pas configurées, le système utilisera automatiquement le filesystem local (pour le développement local uniquement).

