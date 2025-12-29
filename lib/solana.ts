import { Connection, PublicKey, ParsedTransactionWithMeta, ParsedInstruction } from '@solana/web3.js';

// Adresses importantes
export const LP_POOL_ADDRESS = '5DXmqgrTivkdwg43UMU1YSV5WAvVmgvjBxsVP1aLV4Dk';
export const TOKEN_MINT_ADDRESS = 'J2kvsjCVGmKYH5nqo9X7VJGH2jpmKkNdzAaYUfKspump';
export const BUYBACK_ADDRESS = '1nc1nerator11111111111111111111111111111111';

// Transactions à exclure
export const EXCLUDED_TRANSACTIONS = [
  '94gY53mPFY6JiYEvshn3EXdmNPTd4VD4x3wnBnSLEYRMB4n9pDWWUqucf6yR8ywmWvVWPeZ7ZnbQqtjACnWpnAh',
  '3pNwQAYzBtaBiprHMR5ytUaix64Km1XF14NJBqrM62BFNuXdNcSJ1ZZDPfVBjJjDxgiNKAj3QsYmt78eAjnc5ydM', // Failed transaction
  '4aUxESG3rCoNaWWxGXfkkCXF8gcU9FUH6Hx6JJyHCN3bwpd4U7qRGunGjSj1fjMRZDuBpXdw9Y6wuuYrKESctQWs', // Failed transaction
];

// Connexion à Solana (utilise un RPC public, vous pouvez le changer pour un RPC privé)
// Note: Les RPC publics peuvent avoir des limites. Pour la production, utilisez un RPC privé (Helius, QuickNode, etc.)
// Nettoyer l'URL RPC (enlever le slash final s'il existe)
const cleanRpcUrl = (url: string) => url.replace(/\/$/, '');

const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL 
  ? cleanRpcUrl(process.env.NEXT_PUBLIC_SOLANA_RPC_URL)
  : process.env.SOLANA_RPC_URL 
    ? cleanRpcUrl(process.env.SOLANA_RPC_URL)
    : 'https://mainnet.helius-rpc.com/?api-key=6946357d-18e5-4576-8784-90b98b23b9be';

export const connection = new Connection(
  RPC_URL,
  {
    commitment: 'confirmed',
    // Configuration pour réduire les retries et respecter le rate limiting
    confirmTransactionInitialTimeout: 60000,
  }
);

export interface MintTransaction {
  signature: string;
  timestamp: number;
  solAmount: number;
  tokenAmount: number;
  from: string;
}

export interface TransferTransaction {
  signature: string;
  timestamp: number;
  tokenAmount: number;
  from: string;
  to: string;
}

export interface PoolStats {
  solBalance: number;
  tokenBalance: number;
  totalMints: number;
  totalTransfers: number;
  totalSolAdded: number;
  totalTokensAdded: number;
  totalTokensTransferred: number;
  tokenSupply?: number | null; // Supply actuelle du token
  tokenBurned?: number | null; // Tokens brûlés (1,000,000,000 - supply actuelle)
  tokenPrice?: number | null;
  tokenPriceInUsd?: number | null;
  solPrice?: number | null;
  tokenPriceSol?: number | null;
  tokenPriceToken?: number | null;
  totalLiquidity?: number | null; // Liquidité totale en USD
}

// Fonction pour obtenir le solde SOL d'une adresse
export async function getSolBalance(address: string): Promise<number> {
  try {
    const publicKey = new PublicKey(address);
    const balance = await connection.getBalance(publicKey);
    return balance / 1e9; // Convertir lamports en SOL
  } catch (error: any) {
    // Gérer spécifiquement les erreurs 401 (Invalid API key)
    if (error?.message?.includes('401') || error?.message?.includes('Invalid API key') || error?.message?.includes('Unauthorized')) {
      console.error('Error fetching SOL balance: Invalid RPC API key. Please check your NEXT_PUBLIC_SOLANA_RPC_URL or SOLANA_RPC_URL environment variable.');
    } else {
      console.error('Error fetching SOL balance:', error);
    }
    return 0;
  }
}

// Fonction pour obtenir la supply totale d'un token
export async function getTokenSupply(mintAddress: string): Promise<number> {
  try {
    const mintPublicKey = new PublicKey(mintAddress);
    const supply = await connection.getTokenSupply(mintPublicKey);
    
    if (supply && supply.value) {
      // Convertir en nombre décimal (uiAmount)
      const decimals = supply.value.decimals;
      const amount = supply.value.amount;
      const uiAmount = Number(amount) / Math.pow(10, decimals);
      console.log(`[getTokenSupply] Token supply: ${uiAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
      return uiAmount;
    }
    
    return 0;
  } catch (error: any) {
    console.error('[getTokenSupply] Error fetching token supply:', error);
    return 0;
  }
}

// Fonction pour obtenir le solde de tokens d'une adresse
export async function getTokenBalance(address: string, mintAddress: string): Promise<number> {
  try {
    const publicKey = new PublicKey(address);
    const mintPublicKey = new PublicKey(mintAddress);
    
    // Essayer d'abord avec getParsedTokenAccountsByOwner (avec retry pour erreurs temporaires)
    let retries = 0;
    const maxRetries = 3;
    while (retries < maxRetries) {
      try {
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
          mint: mintPublicKey,
        });

        if (tokenAccounts.value.length > 0) {
          const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
          if (balance && balance > 0) {
            console.log(`[getTokenBalance] Found balance via getParsedTokenAccountsByOwner: ${balance}`);
            return balance;
          }
        }
        // Si on arrive ici, pas de balance trouvée, sortir de la boucle
        break;
      } catch (err: any) {
        const errorMessage = err?.message || '';
        const isTemporaryError = 
          errorMessage.includes('500') || 
          errorMessage.includes('Internal Server Error') ||
          errorMessage.includes('Temporary internal error') ||
          errorMessage.includes('503') || 
          errorMessage.includes('Service Unavailable');
        
        if (isTemporaryError && retries < maxRetries - 1) {
          retries++;
          console.log(`[getTokenBalance] Temporary error (attempt ${retries}/${maxRetries}), retrying in 3 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
          continue;
        }
        
        console.log('[getTokenBalance] getParsedTokenAccountsByOwner failed:', err);
        break;
      }
    }
    
    // Alternative: chercher dans les transactions récentes pour trouver le solde
    // Pour la LP, on peut aussi chercher dans les postTokenBalances des transactions récentes
    try {
      const signatures = await connection.getSignaturesForAddress(publicKey, { limit: 10 });
      console.log(`[getTokenBalance] Checking ${signatures.length} recent transactions for token balance...`);
      
      // Chercher dans les transactions récentes (jusqu'à 10)
      for (const sigInfo of signatures) {
        try {
          const tx = await connection.getParsedTransaction(sigInfo.signature, {
            maxSupportedTransactionVersion: 0,
          });
          
          if (tx?.meta?.postTokenBalances) {
            // Chercher tous les balances de tokens pour cette adresse et ce mint
            let totalBalance = 0;
            for (const balance of tx.meta.postTokenBalances) {
              if (balance.owner === address && balance.mint === mintAddress) {
                const amount = balance.uiTokenAmount?.uiAmount || 0;
                totalBalance += amount;
              }
            }
            if (totalBalance > 0) {
              console.log(`[getTokenBalance] Found balance ${totalBalance} in transaction ${sigInfo.signature.substring(0, 20)}...`);
              return totalBalance;
            }
          }
        } catch (txErr) {
          // Continuer avec la transaction suivante
          continue;
        }
      }
    } catch (err) {
      console.log('[getTokenBalance] Transaction search failed:', err);
    }
    
    // Dernière tentative: chercher tous les comptes tokens sans filtre mint
    try {
      // getParsedTokenAccountsByOwner nécessite un filtre, donc on ne peut pas utiliser cette méthode
      // On retourne 0 si aucune méthode n'a fonctionné
      console.log('[getTokenBalance] All previous methods failed, returning 0');
    } catch (err) {
      console.log('[getTokenBalance] All accounts search failed:', err);
    }
    
    console.log(`[getTokenBalance] Could not find token balance for ${address}`);
    return 0;
  } catch (error) {
    console.error('Error fetching token balance:', error);
    return 0;
  }
}

// Fonction pour parser les transactions MINT (ajout de liquidité)
export function parseMintTransaction(tx: ParsedTransactionWithMeta): MintTransaction | null {
  if (!tx.meta || !tx.transaction) return null;

  const instructions = tx.transaction.message.instructions;
  const accountKeys = tx.transaction.message.accountKeys.map((key: any) => 
    typeof key === 'string' ? key : key.pubkey.toString()
  );
  
  let solAmount = 0;
  let tokenAmount = 0;
  let from = '';
  
  // DEBUG: Vérifier si la transaction contient la LP ou le token mint
  const hasLP = accountKeys.includes(LP_POOL_ADDRESS);
  const hasTokenMint = accountKeys.includes(TOKEN_MINT_ADDRESS);
  
  // Si ni la LP ni le token mint ne sont dans les comptes, ce n'est probablement pas une transaction de liquidité
  if (!hasLP && !hasTokenMint) {
    return null;
  }

  // Analyser les changements de balance SOL de la LP (méthode principale)
  const lpIndex = accountKeys.indexOf(LP_POOL_ADDRESS);
  if (lpIndex >= 0 && tx.meta.postBalances && tx.meta.preBalances) {
    const postBalance = tx.meta.postBalances[lpIndex] / 1e9;
    const preBalance = tx.meta.preBalances[lpIndex] / 1e9;
    const solIncrease = postBalance - preBalance;
    if (solIncrease > 0.000001) { // Seuil très réduit pour détecter même de très petits ajouts
      solAmount = solIncrease;
    }
  }

  // Analyser les changements de balance de tokens de la LP
  // Pour Pump.fun, la LP peut avoir plusieurs comptes tokens, il faut tous les vérifier
  let preTokenBalance = 0;
  let postTokenBalance = 0;
  
  // Chercher dans preTokenBalances - additionner tous les comptes tokens de la LP
  if (tx.meta.preTokenBalances) {
    for (const balance of tx.meta.preTokenBalances) {
      if (balance.owner === LP_POOL_ADDRESS && balance.mint === TOKEN_MINT_ADDRESS) {
        preTokenBalance += balance.uiTokenAmount?.uiAmount || 0;
      }
    }
  }
  
  // Chercher dans postTokenBalances - additionner tous les comptes tokens de la LP
  if (tx.meta.postTokenBalances) {
    for (const balance of tx.meta.postTokenBalances) {
      if (balance.owner === LP_POOL_ADDRESS && balance.mint === TOKEN_MINT_ADDRESS) {
        postTokenBalance += balance.uiTokenAmount?.uiAmount || 0;
      }
    }
  }
  
  const tokenIncrease = postTokenBalance - preTokenBalance;
  if (tokenIncrease > 0) {
    tokenAmount = tokenIncrease;
  }
  
  // Si on n'a pas trouvé de tokens directement liés à la LP, chercher dans tous les comptes tokens
  // qui sont dans la transaction et qui ont gagné des tokens (pour Pump.fun, la LP peut être le owner d'un compte token)
  if (tokenAmount === 0 && hasLP) {
    // Trouver tous les comptes qui sont dans accountKeys et qui ont des tokens du bon mint
    const tokenAccountOwners = new Set<string>();
    
    // Collecter tous les owners de comptes tokens dans la transaction
    if (tx.meta.postTokenBalances) {
      for (const balance of tx.meta.postTokenBalances) {
        if (balance.mint === TOKEN_MINT_ADDRESS && balance.owner) {
          const accountIndex = typeof balance.accountIndex === 'number' ? balance.accountIndex : -1;
          if (accountIndex >= 0 && accountIndex < accountKeys.length) {
            // Le compte token est dans la transaction, on garde son owner
            tokenAccountOwners.add(balance.owner);
          }
        }
      }
    }
    
    // Pour chaque owner trouvé, calculer la différence de tokens
    for (const owner of tokenAccountOwners) {
      if (!owner) continue; // Skip si owner est undefined
      
      let ownerPreTokens = 0;
      let ownerPostTokens = 0;
      
      if (tx.meta.preTokenBalances) {
        for (const balance of tx.meta.preTokenBalances) {
          if (balance.owner === owner && balance.mint === TOKEN_MINT_ADDRESS) {
            ownerPreTokens += balance.uiTokenAmount?.uiAmount || 0;
          }
        }
      }
      
      if (tx.meta.postTokenBalances) {
        for (const balance of tx.meta.postTokenBalances) {
          if (balance.owner === owner && balance.mint === TOKEN_MINT_ADDRESS) {
            ownerPostTokens += balance.uiTokenAmount?.uiAmount || 0;
          }
        }
      }
      
      const ownerTokenIncrease = ownerPostTokens - ownerPreTokens;
      // Si ce compte a gagné des tokens ET que la LP est dans la transaction, c'est probablement un ajout de liquidité
      if (ownerTokenIncrease > 0) {
        tokenAmount += ownerTokenIncrease;
        break; // Prendre le premier compte qui a gagné des tokens
      }
    }
  }
  
  // Si on n'a pas trouvé de changement direct, chercher dans les transferts
  // Analyser tous les transferts SOL vers des comptes qui pourraient être liés à la LP
  if (solAmount === 0) {
    let totalSolTransferred = 0;
    for (const instruction of instructions) {
      if ('parsed' in instruction) {
        const parsed = instruction.parsed as any;
        if (parsed.type === 'transfer' && parsed.info.lamports) {
          const destination = parsed.info.destination;
          const amount = parsed.info.lamports / 1e9;
          
          // Vérifier si c'est vers la LP directement
          if (destination === LP_POOL_ADDRESS && amount > 0.000001) {
            totalSolTransferred += amount;
          }
          // Vérifier aussi si c'est vers un compte qui pourrait être un compte token de la LP
          else if (tx.meta.postTokenBalances) {
            const postBalance = tx.meta.postTokenBalances.find(
              (b: any) => {
                const accountIndex = typeof b.accountIndex === 'number' ? b.accountIndex : -1;
                return accountIndex >= 0 && accountIndex < accountKeys.length && 
                       accountKeys[accountIndex] === destination && 
                       b.owner === LP_POOL_ADDRESS;
              }
            );
            if (postBalance && amount > 0.000001) {
              totalSolTransferred += amount;
            }
          }
          // Si on a des tokens ajoutés et que c'est un transfert SOL significatif, l'inclure
          // (pour Pump.fun, le SOL peut passer par des comptes intermédiaires)
          else if (tokenAmount > 0 && amount > 0.0001 && hasLP) {
            // Si c'est un transfert SOL significatif dans une transaction avec LP et tokens, l'inclure
            totalSolTransferred += amount;
          }
        }
      }
    }
    if (totalSolTransferred > 0) {
      solAmount = totalSolTransferred;
    }
  }
  
  // Si on n'a pas trouvé de changement de tokens, chercher dans les transferts de tokens
  if (tokenAmount === 0) {
    for (const instruction of instructions) {
      if ('parsed' in instruction) {
        const parsed = instruction.parsed as any;
        if (parsed.type === 'transfer' && parsed.info.mint === TOKEN_MINT_ADDRESS) {
          const destination = parsed.info.destination;
          const amount = parsed.info.tokenAmount?.uiAmount || (parsed.info.amount ? parsed.info.amount / 1e9 : 0);
          
          if (amount > 0) {
            // Vérifier si c'est vers un compte token dont le owner est la LP
            if (tx.meta.postTokenBalances) {
              const postBalance = tx.meta.postTokenBalances.find(
                (b: any) => {
                  const accountIndex = typeof b.accountIndex === 'number' ? b.accountIndex : -1;
                  return accountIndex >= 0 && accountIndex < accountKeys.length && 
                         accountKeys[accountIndex] === destination && 
                         b.owner === LP_POOL_ADDRESS && 
                         b.mint === TOKEN_MINT_ADDRESS;
                }
              );
              if (postBalance) {
                tokenAmount += amount;
              }
            }
          }
        }
      }
    }
  }
  
  // Si on n'a pas trouvé de changement direct, chercher de manière plus agressive
  // Pour Pump.fun, les transactions peuvent avoir une structure différente
  // Si on a déjà trouvé des tokens mais pas de SOL, chercher quand même le SOL
  if (tokenAmount > 0 && solAmount === 0) {
    // Si on a des tokens ajoutés, il doit y avoir du SOL aussi
    // Chercher tous les transferts SOL dans la transaction
    let totalSolTransferred = 0;
    for (const instruction of instructions) {
      if ('parsed' in instruction) {
        const parsed = instruction.parsed as any;
        if (parsed.type === 'transfer' && parsed.info.lamports) {
          const amount = parsed.info.lamports / 1e9;
          // Accepter tout transfert SOL significatif
          if (amount > 0.000001) {
            totalSolTransferred += amount;
          }
        }
      }
    }
    
    // Si on a des transferts SOL significatifs, les utiliser
    if (totalSolTransferred > 0.000001) {
      solAmount = totalSolTransferred;
    }
  }
  
  // Si on n'a toujours rien trouvé, chercher de manière plus agressive
  if (solAmount === 0 && tokenAmount === 0) {
    // Pour Pump.fun, si la LP ET le token mint sont dans la transaction,
    // c'est probablement une transaction de liquidité même sans changement direct de balance
    if (hasLP && hasTokenMint) {
      // Chercher tous les transferts SOL dans la transaction
      let totalSolTransferred = 0;
      for (const instruction of instructions) {
        if ('parsed' in instruction) {
          const parsed = instruction.parsed as any;
          if (parsed.type === 'transfer' && parsed.info.lamports) {
            const amount = parsed.info.lamports / 1e9;
            // Accepter tout transfert SOL significatif si LP et token mint sont présents
            if (amount > 0.000001) {
              totalSolTransferred += amount;
            }
          }
        }
      }
      
      // Si on a des transferts SOL significatifs, considérer comme ajout de liquidité
      if (totalSolTransferred > 0.000001) {
        solAmount = totalSolTransferred;
      }
      
      // Chercher aussi les transferts de tokens
      let totalTokensTransferred = 0;
      for (const instruction of instructions) {
        if ('parsed' in instruction) {
          const parsed = instruction.parsed as any;
          if (parsed.type === 'transfer' && parsed.info.mint === TOKEN_MINT_ADDRESS) {
            const amount = parsed.info.tokenAmount?.uiAmount || 0;
            if (amount > 0) {
              totalTokensTransferred += amount;
            }
          }
        }
      }
      
      if (totalTokensTransferred > 0) {
        tokenAmount = totalTokensTransferred;
      }
    }
    
    // Si toujours rien trouvé, ce n'est pas un ajout de liquidité
    if (solAmount === 0 && tokenAmount === 0) {
      return null;
    }
  }

  // Chercher l'expéditeur dans les instructions et les changements de balance
  // Analyser les changements de balance pour trouver qui a envoyé
  if (tx.meta.preTokenBalances && tx.meta.postTokenBalances) {
    for (const preBalance of tx.meta.preTokenBalances) {
      if (preBalance.mint === TOKEN_MINT_ADDRESS && preBalance.owner !== LP_POOL_ADDRESS) {
        const preAmount = preBalance.uiTokenAmount?.uiAmount || 0;
        const postBalance = tx.meta.postTokenBalances.find(
          (b: any) => b.owner === preBalance.owner && b.mint === TOKEN_MINT_ADDRESS
        );
        const postAmount = postBalance?.uiTokenAmount?.uiAmount || 0;
        if (preAmount > postAmount && preAmount - postAmount > 0) {
          // Ce compte a perdu des tokens, c'est probablement l'expéditeur
          from = preBalance.owner || accountKeys[0] || 'Unknown';
          break;
        }
      }
    }
  }
  
  // Si on n'a pas trouvé l'expéditeur, chercher dans les instructions
  if (!from) {
    for (const instruction of instructions) {
      if ('parsed' in instruction) {
        const parsed = instruction.parsed as any;
        
        if (parsed.type === 'transfer') {
          if (parsed.info.lamports) {
            const destination = parsed.info.destination;
            if (destination === LP_POOL_ADDRESS) {
              from = parsed.info.authority || parsed.info.source || accountKeys[0] || 'Unknown';
              break;
            }
          }
          if (parsed.info.mint === TOKEN_MINT_ADDRESS) {
            const destination = parsed.info.destination;
            // Vérifier si c'est vers un compte token dont le owner est la LP
            if (tx.meta.postTokenBalances) {
              const postBalance = tx.meta.postTokenBalances.find(
                (b: any) => {
                  const accountIndex = typeof b.accountIndex === 'number' ? b.accountIndex : -1;
                  return accountIndex >= 0 && accountIndex < accountKeys.length && 
                         accountKeys[accountIndex] === destination && 
                         b.owner === LP_POOL_ADDRESS;
                }
              );
              if (postBalance) {
                from = parsed.info.authority || parsed.info.source || accountKeys[0] || 'Unknown';
                break;
              }
            }
          }
        }
      }
    }
  }

  // Si on n'a pas trouvé l'expéditeur, utiliser le premier compte (généralement le signataire)
  if (!from) {
    from = accountKeys[0] || 'Unknown';
  }

  // Retourner la transaction si on a trouvé des changements
  if (solAmount > 0 || tokenAmount > 0) {
    return {
      signature: tx.transaction.signatures[0],
      timestamp: tx.blockTime || Date.now() / 1000,
      solAmount,
      tokenAmount,
      from: from || 'Unknown',
    };
  }

  return null;
}

// Fonction pour parser les transactions TRANSFER vers le buyback
function parseTransferTransaction(tx: ParsedTransactionWithMeta): TransferTransaction | null {
  if (!tx.meta || !tx.transaction) return null;

  const instructions = tx.transaction.message.instructions;
  const accountKeys = tx.transaction.message.accountKeys.map((key: any) => 
    typeof key === 'string' ? key : key.pubkey.toString()
  );
  
  // Vérifier si le buyback est impliqué dans la transaction OU si le token mint est impliqué
  const hasBuyback = accountKeys.includes(BUYBACK_ADDRESS);
  const hasTokenMint = accountKeys.includes(TOKEN_MINT_ADDRESS);
  
  if (!hasBuyback && !hasTokenMint) return null;

  let tokenAmount = 0;
  let from = '';
  let to = BUYBACK_ADDRESS;

  // Analyser les changements de balance de tokens pour le buyback
  let preTokenBalance = 0;
  let postTokenBalance = 0;
  
  if (tx.meta.preTokenBalances) {
    const preBalance = tx.meta.preTokenBalances.find(
      (b: any) => b.owner === BUYBACK_ADDRESS && b.mint === TOKEN_MINT_ADDRESS
    );
    preTokenBalance = preBalance?.uiTokenAmount?.uiAmount || 0;
  }
  
  if (tx.meta.postTokenBalances) {
    const postBalance = tx.meta.postTokenBalances.find(
      (b: any) => b.owner === BUYBACK_ADDRESS && b.mint === TOKEN_MINT_ADDRESS
    );
    postTokenBalance = postBalance?.uiTokenAmount?.uiAmount || 0;
  }
  
  const tokenIncrease = postTokenBalance - preTokenBalance;
  if (tokenIncrease > 0) {
    tokenAmount = tokenIncrease;
  }

  // Si pas de changement direct, chercher dans les instructions
  if (tokenAmount === 0) {
    for (const instruction of instructions) {
      if ('parsed' in instruction && instruction.parsed) {
        const parsed = instruction.parsed as any;
        
        if (parsed.type === 'transfer' && parsed.info.mint === TOKEN_MINT_ADDRESS) {
          const destination = parsed.info.destination;
          // Le buyback peut être le owner du compte token, pas directement la destination
          // Chercher si la destination est un compte token dont le owner est le buyback
          if (destination && parsed.info.tokenAmount) {
            const amount = parsed.info.tokenAmount.uiAmount || 0;
            if (amount > 0) {
              // Vérifier si c'est vers le buyback en cherchant dans les postTokenBalances
              const postBalance = tx.meta.postTokenBalances?.find(
                (b: any) => b.accountIndex === accountKeys.indexOf(destination) && b.mint === TOKEN_MINT_ADDRESS
              );
              if (postBalance && postBalance.owner === BUYBACK_ADDRESS) {
                tokenAmount = amount;
                from = parsed.info.authority || parsed.info.source || accountKeys[0] || 'Unknown';
                break;
              }
            }
          }
        }
      }
    }
  }

  // Trouver l'expéditeur si on a trouvé un transfert
  if (tokenAmount > 0) {
    if (!from) {
      // Chercher qui a perdu des tokens
      for (const preBalance of tx.meta.preTokenBalances || []) {
        if (preBalance.mint === TOKEN_MINT_ADDRESS && preBalance.owner !== BUYBACK_ADDRESS) {
          const preAmount = preBalance.uiTokenAmount?.uiAmount || 0;
          const postBalance = tx.meta.postTokenBalances?.find(
            (b: any) => b.owner === preBalance.owner && b.mint === TOKEN_MINT_ADDRESS
          );
          const postAmount = postBalance?.uiTokenAmount?.uiAmount || 0;
          if (preAmount > postAmount) {
            from = preBalance.owner || accountKeys[0] || 'Unknown';
            break;
          }
        }
      }
      
      // Si toujours pas trouvé, utiliser le premier compte
      if (!from) {
        from = accountKeys[0] || 'Unknown';
      }
    }

    return {
      signature: tx.transaction.signatures[0],
      timestamp: tx.blockTime || Date.now() / 1000,
      tokenAmount,
      from: from || 'Unknown',
      to: BUYBACK_ADDRESS,
    };
  }

  return null;
}

// Fonction pour attendre un délai (pour éviter le rate limiting)
// Limite RPC: 10 req/s = minimum 100ms entre chaque requête
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Délai minimum entre requêtes pour respecter la limite de 15 req/s
// 15 req/s = 66.67ms entre requêtes minimum
// Utiliser 70ms pour être sûr de rester en dessous même avec les retries automatiques
// Cela donne ~14.3 req/s max, bien en dessous de 15 req/s pour éviter 429
export const MIN_REQUEST_DELAY = 70; // 70ms donne ~14.3 req/s max, bien en dessous de 15 req/s pour éviter 429

// Fonction pour obtenir les transactions MINT récentes
export async function getMintTransactions(limit: number = 50, existingSignatures?: Set<string>): Promise<MintTransaction[]> {
  try {
    console.log(`[getMintTransactions] Starting with limit=${limit}, existingSignatures=${existingSignatures?.size || 0}`);
    const transactions: MintTransaction[] = [];
    const seenSignatures = new Set<string>();
    let processedCount = 0;
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 3;
    
    // Limiter drastiquement pour éviter les 429
    // Si limit est 0 ou très grand, récupérer toutes les transactions disponibles
    const getAll = limit === 0 || limit > 1000;
    console.log(`[getMintTransactions] getAll=${getAll}`);
    // Pour getAll, récupérer beaucoup plus de signatures (mais toujours avec pagination)
    // Pour les limites normales, rester conservateur
    const maxSignatures = getAll ? 1000 : Math.min(limit * 2, 20); // Maximum 20 signatures pour éviter trop de requêtes
    
    // Chercher d'abord dans les transactions de la LP
    try {
      console.log(`[getMintTransactions] Fetching from LP address: ${LP_POOL_ADDRESS}`);
      const publicKey = new PublicKey(LP_POOL_ADDRESS);
      await delay(MIN_REQUEST_DELAY); // Délai avant la première requête
      
      let before: string | undefined = undefined;
      let hasMore = true;
      let pageCount = 0;
      // Pour getAll, traiter 1500 transactions par batch pour éviter le timeout Vercel (300 secondes)
      // Calcul : 1500 transactions × 120ms = 180s + overhead (~20s) = ~200s < 300s timeout
      // L'API limite getSignaturesForAddress à 1000 signatures, donc on fait plusieurs requêtes de 1000 signatures
      // Chaque batch traite jusqu'à 1500 transactions (peut nécessiter 2 requêtes de 1000 signatures)
      const maxPages = getAll ? 10 : 2; // Maximum 10 pages en mode getAll pour permettre plusieurs batches
      const maxTransactionsForGetAll = 3000; // Limite totale pour éviter timeout
      const transactionsPerBatch = 1500; // Traiter 1500 transactions par batch (limite pour rester < 300s timeout Vercel)
      
      while (hasMore && transactions.length < (getAll ? maxTransactionsForGetAll : limit) && pageCount < maxPages) {
        // Pour getAll, récupérer 1000 signatures par requête (limite max API)
        // Mais traiter 1500 transactions par batch (2 requêtes pour 3000 transactions)
        const signatureLimit = getAll 
          ? 1000 // L'API limite à 1000 signatures par requête
          : Math.min(10, maxSignatures - transactions.length);
        console.log(`[getMintTransactions] Fetching page ${pageCount + 1}, signatureLimit=${signatureLimit}, before=${before?.substring(0, 20)}...`);
        const signatures = await connection.getSignaturesForAddress(
          publicKey, 
          { 
            limit: signatureLimit,
            before: before
          }
        );
        
        console.log(`[getMintTransactions] Got ${signatures.length} signatures`);
        
        if (signatures.length === 0) {
          console.log(`[getMintTransactions] No more signatures, stopping`);
          hasMore = false;
          break;
        }
        
        before = signatures[signatures.length - 1].signature;
        
        // Pour getAll, traiter 1500 transactions par batch
        // Traiter toutes les signatures récupérées jusqu'à atteindre 1500 transactions par batch
        const remainingInBatch = transactionsPerBatch - (transactions.length % transactionsPerBatch);
        const remainingTotal = maxTransactionsForGetAll - transactions.length;
        const signaturesToProcess = getAll 
          ? signatures.slice(0, Math.min(signatures.length, remainingInBatch, remainingTotal))
          : signatures;
        
        console.log(`[getMintTransactions] Processing ${signaturesToProcess.length} signatures (batch ${pageCount + 1})`);
        
        // Traiter séquentiellement pour éviter les 429 (optimisé : pas de vérification de statut redondante)
        for (const sigInfo of signaturesToProcess) {
          // Ignorer les transactions exclues, déjà vues, ou déjà stockées
          if (EXCLUDED_TRANSACTIONS.includes(sigInfo.signature) || 
              seenSignatures.has(sigInfo.signature) ||
              (existingSignatures && existingSignatures.has(sigInfo.signature))) {
            continue;
          }
          
          if (consecutiveErrors >= maxConsecutiveErrors) {
            console.warn('Too many consecutive errors, stopping transaction fetching');
            hasMore = false;
            break;
          }
          
          if (processedCount > 0) {
            await delay(MIN_REQUEST_DELAY);
          }
          
          try {
            // Récupérer directement la transaction (plus rapide, évite une requête supplémentaire)
            const tx = await connection.getParsedTransaction(sigInfo.signature, {
              maxSupportedTransactionVersion: 0,
            });
            
            if (tx) {
              // Vérifier si la transaction a échoué dans les métadonnées
              if (tx.meta?.err) {
                continue; // Transaction échouée, passer à la suivante
              }
              
              const mintTx = parseMintTransaction(tx);
              if (mintTx && !EXCLUDED_TRANSACTIONS.includes(mintTx.signature)) {
                transactions.push(mintTx);
                seenSignatures.add(mintTx.signature);
                if (transactions.length % 10 === 0) {
                  console.log(`[getMintTransactions] Found ${transactions.length} mint transactions so far...`);
                }
              }
            }
            processedCount++;
            consecutiveErrors = 0;
          } catch (error: any) {
            const errorMessage = error?.message || '';
            const isTemporaryError = 
              errorMessage.includes('500') || 
              errorMessage.includes('Internal Server Error') ||
              errorMessage.includes('Temporary internal error') ||
              errorMessage.includes('503') || 
              errorMessage.includes('Service Unavailable');
            
            // Ne pas compter les erreurs temporaires comme des erreurs consécutives
            if (!isTemporaryError) {
              consecutiveErrors++;
            }
            
            // Gérer spécifiquement les erreurs 401 (Invalid API key)
            if (errorMessage.includes('401') || errorMessage.includes('Invalid API key') || errorMessage.includes('Unauthorized')) {
              console.error('Error fetching transactions: Invalid RPC API key. Please check your NEXT_PUBLIC_SOLANA_RPC_URL or SOLANA_RPC_URL environment variable.');
              throw error; // Arrêter immédiatement si la clé API est invalide
            }
            
            // Gérer les erreurs 500 (Internal Server Error) - erreurs temporaires
            if (errorMessage.includes('500') || errorMessage.includes('Internal Server Error') || errorMessage.includes('Temporary internal error')) {
              console.log(`[getMintTransactions] Temporary RPC error (500), waiting 5 seconds before retry...`);
              await delay(5000); // Délai de 5 secondes pour les erreurs 500
              // Ne pas incrémenter consecutiveErrors pour les erreurs temporaires
              continue;
            }
            
            if (errorMessage.includes('429') || errorMessage.includes('Too Many Requests')) {
              // Pour les erreurs 429, attendre plus longtemps
              console.log(`[getMintTransactions] Rate limited (429), waiting 10 seconds before retry...`);
              await delay(10000); // Délai de 10 secondes pour les erreurs 429
              // Réduire la vitesse après une erreur 429
              await delay(MIN_REQUEST_DELAY * 3); // Triple délai après 429
              // Ne pas compter 429 comme erreur consécutive (c'est temporaire)
              continue;
            }
            
            if (errorMessage.includes('503') || errorMessage.includes('Service Unavailable')) {
              console.log(`[getMintTransactions] Service unavailable (503), waiting 5 seconds before retry...`);
              await delay(5000); // Délai de 5 secondes pour les erreurs 503
              // Ne pas compter 503 comme erreur consécutive (c'est temporaire)
              continue;
            }
            
            // Pour les autres erreurs, vérifier si on doit arrêter
            if (consecutiveErrors >= maxConsecutiveErrors) {
              console.warn(`[getMintTransactions] Too many consecutive errors (${consecutiveErrors}), stopping transaction fetching`);
              hasMore = false;
              break;
            }
            
            // Pour les erreurs non-temporaires, attendre un peu avant de réessayer
            await delay(2000);
          }
          
          // Si on a atteint la limite (et qu'on ne veut pas tout récupérer), arrêter
          if (!getAll && transactions.length >= limit) {
            hasMore = false;
            break;
          }
        }
        
        pageCount++;
        
        // Si on n'a pas trouvé de nouvelles transactions dans cette page, arrêter
        // Pour getAll, continuer même si moins de 10 signatures (peut y avoir des pages plus petites)
        if (!getAll && signatures.length < 10) {
          hasMore = false;
        } else if (getAll && signatures.length === 0) {
          hasMore = false;
        }
      }
    } catch (error: any) {
      // Gérer spécifiquement les erreurs 401 (Invalid API key)
      if (error?.message?.includes('401') || error?.message?.includes('Invalid API key') || error?.message?.includes('Unauthorized')) {
        console.error('Error fetching LP transactions: Invalid RPC API key. Please check your NEXT_PUBLIC_SOLANA_RPC_URL or SOLANA_RPC_URL environment variable.');
        throw error;
      }
      if (error?.message?.includes('503') || error?.message?.includes('Service Unavailable')) {
        console.warn('RPC returned 503 for LP transactions, skipping');
      } else if (!error?.message?.includes('RPC service unavailable')) {
        console.error('Error fetching LP transactions:', error);
      }
    }
    
    // Si on n'a pas assez de transactions ET qu'on n'a pas eu trop d'erreurs, chercher aussi dans les transactions du token mint
    // En mode getAll, limiter drastiquement la recherche dans le token mint pour accélérer
    console.log(`[getMintTransactions] Finished LP search, found ${transactions.length} transactions. Checking if we need to search token mint...`);
    // En mode getAll, ne chercher dans le token mint que si on a moins de 100 transactions depuis la LP
    // Sinon, on a probablement déjà toutes les transactions importantes
    const shouldSearchTokenMint = getAll 
      ? transactions.length < 100  // En getAll, seulement si on a peu de transactions depuis la LP
      : (transactions.length < limit && consecutiveErrors < maxConsecutiveErrors);
    
    if (shouldSearchTokenMint) {
      try {
        console.log(`[getMintTransactions] Searching token mint transactions (limited search)...`);
        const tokenMintPublicKey = new PublicKey(TOKEN_MINT_ADDRESS);
        await delay(MIN_REQUEST_DELAY); // Délai avant la requête
        
        let before: string | undefined = undefined;
        let hasMore = true;
        let pageCount = 0;
        // Pour getAll, traiter 1500 transactions par batch pour éviter le timeout Vercel (300 secondes)
        // Calcul : 1500 transactions × 120ms = 180s + overhead (~20s) = ~200s < 300s timeout
        const maxPages = getAll ? 2 : 1; // 2 pages max en getAll pour token mint (2 batches × 1500 = ~3000 transactions max)
        const transactionsPerBatch = 1500; // Traiter 1500 transactions par batch (limite pour rester < 300s timeout Vercel)
        const maxTransactionsForGetAll = 3000; // Limite totale pour éviter timeout
        
        while (hasMore && (getAll || transactions.length < limit) && pageCount < maxPages) {
          // Utiliser 1000 signatures par requête (limite max API), mais traiter 1500 transactions par batch
          const tokenSignatureLimit = getAll 
            ? 1000 // L'API limite à 1000 signatures par requête
            : Math.min(10, (limit * 2) - transactions.length);
          console.log(`[getMintTransactions] Token mint: Fetching page ${pageCount + 1}, signatureLimit=${tokenSignatureLimit}`);
          const tokenSignatures = await connection.getSignaturesForAddress(
            tokenMintPublicKey, 
            { 
              limit: tokenSignatureLimit,
              before: before
            }
          );
          
          if (tokenSignatures.length === 0) {
            hasMore = false;
            break;
          }
          
          before = tokenSignatures[tokenSignatures.length - 1].signature;
          
          // Pour getAll, traiter 1500 transactions par batch
          // Traiter toutes les signatures récupérées jusqu'à atteindre 1500 transactions par batch
          const remainingInBatch = transactionsPerBatch - (transactions.length % transactionsPerBatch);
          const remainingTotal = maxTransactionsForGetAll - transactions.length;
          const tokenSignaturesToProcess = getAll 
            ? tokenSignatures.slice(0, Math.min(tokenSignatures.length, remainingInBatch, remainingTotal))
            : tokenSignatures;
          
          console.log(`[getMintTransactions] Token mint: Processing ${tokenSignaturesToProcess.length} signatures (batch ${pageCount + 1})`);
          
          for (const sigInfo of tokenSignaturesToProcess) {
            // Ignorer les transactions exclues, déjà vues, ou déjà stockées
            if (EXCLUDED_TRANSACTIONS.includes(sigInfo.signature) || 
                seenSignatures.has(sigInfo.signature) ||
                (existingSignatures && existingSignatures.has(sigInfo.signature))) {
              continue;
            }
            
            if (consecutiveErrors >= maxConsecutiveErrors) {
              hasMore = false;
              break;
            }
            
            if (processedCount > 0) {
              // En mode getAll, réduire le délai pour accélérer (mais rester prudent)
              await delay(MIN_REQUEST_DELAY);
            }
            
            try {
              // Vérifier d'abord le statut de la transaction pour éviter les transactions échouées
              const status = await connection.getSignatureStatus(sigInfo.signature);
              
              // Ne filtrer QUE si la transaction a explicitement échoué (err existe et n'est pas null)
              // Ne pas filtrer si status.value est null/undefined (peut être normal pour certaines transactions anciennes)
              // Une transaction réussie a status.value.confirmationStatus défini et err === null
              // Une transaction échouée a status.value.err défini et non-null
              if (status?.value && status.value.err !== null && status.value.err !== undefined) {
                console.log(`[getMintTransactions] Token mint: Skipping failed transaction: ${sigInfo.signature}, err: ${JSON.stringify(status.value.err)}`);
                processedCount++;
                consecutiveErrors = 0;
                continue;
              }
              
              const tx = await connection.getParsedTransaction(sigInfo.signature, {
                maxSupportedTransactionVersion: 0,
              });
              
              if (tx) {
                // Vérifier aussi dans les métadonnées de la transaction si elle a échoué
                if (tx.meta?.err) {
                  console.log(`[getMintTransactions] Token mint: Skipping failed transaction (meta.err): ${sigInfo.signature}`);
                  processedCount++;
                  consecutiveErrors = 0;
                  continue;
                }
                
                const mintTx = parseMintTransaction(tx);
                if (mintTx && !EXCLUDED_TRANSACTIONS.includes(mintTx.signature)) {
                  transactions.push(mintTx);
                  seenSignatures.add(mintTx.signature);
                }
              }
              processedCount++;
              consecutiveErrors = 0;
            } catch (error: any) {
              const errorMessage = error?.message || '';
              const isTemporaryError = 
                errorMessage.includes('500') || 
                errorMessage.includes('Internal Server Error') ||
                errorMessage.includes('Temporary internal error') ||
                errorMessage.includes('503') || 
                errorMessage.includes('Service Unavailable');
              
              // Ne pas compter les erreurs temporaires comme des erreurs consécutives
              if (!isTemporaryError) {
                consecutiveErrors++;
              }
              
              // Gérer spécifiquement les erreurs 401 (Invalid API key)
              if (errorMessage.includes('401') || errorMessage.includes('Invalid API key') || errorMessage.includes('Unauthorized')) {
                console.error('Error fetching token mint transactions: Invalid RPC API key. Please check your NEXT_PUBLIC_SOLANA_RPC_URL or SOLANA_RPC_URL environment variable.');
                throw error; // Arrêter immédiatement si la clé API est invalide
              }
              
              // Gérer les erreurs 500 (Internal Server Error) - erreurs temporaires
              if (errorMessage.includes('500') || errorMessage.includes('Internal Server Error') || errorMessage.includes('Temporary internal error')) {
                console.log(`[getMintTransactions] Token mint: Temporary RPC error (500), waiting 5 seconds before retry...`);
                await delay(5000);
                continue;
              }
              
              if (errorMessage.includes('429') || errorMessage.includes('Too Many Requests')) {
                // Pour les erreurs 429, attendre plus longtemps et réduire la vitesse
                console.log(`[getMintTransactions] Token mint: Rate limited (429), waiting 10 seconds before retry...`);
                await delay(10000); // Délai de 10 secondes pour les erreurs 429
                // Réduire la vitesse après une erreur 429
                await delay(MIN_REQUEST_DELAY * 3); // Triple délai après 429
                continue;
              }
              
              if (errorMessage.includes('503') || errorMessage.includes('Service Unavailable')) {
                console.log(`[getMintTransactions] Token mint: Service unavailable (503), waiting 5 seconds before retry...`);
                await delay(5000); // Délai de 5 secondes pour les erreurs 503
                continue;
              }
              
              // Pour les autres erreurs, vérifier si on doit arrêter
              if (consecutiveErrors >= maxConsecutiveErrors) {
                console.warn(`[getMintTransactions] Token mint: Too many consecutive errors (${consecutiveErrors}), stopping`);
                hasMore = false;
                break;
              }
              
              // Pour les erreurs non-temporaires, attendre un peu avant de réessayer
              await delay(2000);
            }
            
            // Si on a atteint la limite (et qu'on ne veut pas tout récupérer), arrêter
            if (!getAll && transactions.length >= limit) {
              hasMore = false;
              break;
            }
          }
          
          pageCount++;
          
          // Si on n'a pas trouvé de nouvelles transactions dans cette page, arrêter
          // Pour getAll, continuer même si moins de 10 signatures
          if (!getAll && tokenSignatures.length < 10) {
            hasMore = false;
          } else if (getAll && tokenSignatures.length === 0) {
            hasMore = false;
          }
        }
      } catch (error: any) {
        // Gérer spécifiquement les erreurs 401 (Invalid API key)
        if (error?.message?.includes('401') || error?.message?.includes('Invalid API key') || error?.message?.includes('Unauthorized')) {
          console.error('Error fetching token mint transactions: Invalid RPC API key. Please check your NEXT_PUBLIC_SOLANA_RPC_URL or SOLANA_RPC_URL environment variable.');
          throw error;
        }
        if (error?.message?.includes('503') || error?.message?.includes('Service Unavailable')) {
          console.warn('RPC returned 503 for token mint transactions, skipping');
        } else {
          console.error('Error fetching token mint transactions:', error);
        }
      }
    } else {
      if (getAll && transactions.length >= 100) {
        console.log(`[getMintTransactions] Skipping token mint search - already have ${transactions.length} transactions from LP (sufficient for getAll mode)`);
      } else {
        console.log(`[getMintTransactions] Skipping token mint search (getAll=${getAll}, transactions.length=${transactions.length}, limit=${limit}, consecutiveErrors=${consecutiveErrors})`);
      }
    }
    
    // Trier par timestamp décroissant
    console.log(`[getMintTransactions] Sorting ${transactions.length} transactions...`);
    transactions.sort((a, b) => b.timestamp - a.timestamp);
    
    console.log(`[getMintTransactions] Returning ${transactions.length} transactions (limit=${limit})`);
    
    // Si limit=0 (getAll), retourner toutes les transactions
    // Sinon, limiter au nombre demandé
    if (limit === 0) {
      return transactions;
    }
    return transactions.slice(0, limit);
  } catch (error: any) {
    console.error('Error fetching mint transactions:', error);
    if (error?.message?.includes('429') || error?.message?.includes('Too Many Requests') ||
        error?.message?.includes('503') || error?.message?.includes('Service Unavailable') ||
        error?.message?.includes('Rate limit') || error?.message?.includes('RPC service unavailable')) {
      throw new Error('RPC service unavailable. Please use a private RPC or wait a moment.');
    }
    return [];
  }
}

// Fonction pour obtenir les transactions TRANSFER vers le buyback
export async function getTransferTransactions(limit: number = 50): Promise<TransferTransaction[]> {
  const transactions: TransferTransaction[] = [];
  const seenSignatures = new Set<string>();
  let processedCount = 0;
  let consecutiveErrors = 0;
  const maxConsecutiveErrors = 3;
  let allSignatures: any[] = [];
  let buybackFoundCount = 0;
  let buybackSkippedCount = 0;
  
  try {
    // Chercher les transactions depuis le token mint (plus efficace que depuis le buyback wallet)
    // Cela filtre automatiquement pour ne récupérer que les transactions impliquant ce token
    try {
      const tokenMintPublicKey = new PublicKey(TOKEN_MINT_ADDRESS);
      // Récupérer beaucoup plus de transactions car on va filtrer (ratio ~10:1 ou plus)
      // Si limit=1000, on récupère jusqu'à 5000 transactions du token pour trouver les transfers
      const tokenLimit = limit === 0 ? 10000 : Math.max(limit * 10, 5000); // Récupérer 10x plus ou minimum 5000
      await delay(MIN_REQUEST_DELAY); // Délai avant la première requête
      
      // Pagination pour récupérer toutes les transactions si nécessaire
      let before: string | undefined = undefined;
      let pageCount = 0;
      const maxPages = Math.ceil(tokenLimit / 1000); // Maximum de pages nécessaires
      
      while (pageCount < maxPages && allSignatures.length < tokenLimit) {
        const pageLimit = Math.min(1000, tokenLimit - allSignatures.length);
        const tokenSignatures = await connection.getSignaturesForAddress(tokenMintPublicKey, { 
          limit: pageLimit,
          before: before 
        });
        
        if (tokenSignatures.length === 0) break;
        
        allSignatures = allSignatures.concat(tokenSignatures);
        before = tokenSignatures[tokenSignatures.length - 1].signature;
        pageCount++;
        
        if (tokenSignatures.length < pageLimit) break; // Plus de transactions disponibles
        if (pageCount > 0) await delay(MIN_REQUEST_DELAY); // Délai entre les pages
        
        // Si on a déjà trouvé assez de transfers et qu'on a une limite, on peut arrêter de récupérer
        // Mais seulement si limit > 0 (si limit=0, on veut tout récupérer)
        if (limit > 0 && transactions.length >= limit) {
          break;
        }
      }
      
      console.log(`[getTransferTransactions] Found ${allSignatures.length} token transactions, filtering for buyback transfers (target: ${limit === 0 ? 'all' : limit})...`);
      
      for (const sigInfo of allSignatures) {
        if (EXCLUDED_TRANSACTIONS.includes(sigInfo.signature) || seenSignatures.has(sigInfo.signature)) {
          continue;
        }
        
        // Arrêter si trop d'erreurs consécutives
        if (consecutiveErrors >= maxConsecutiveErrors) {
          console.warn('Too many consecutive errors, stopping transfer transaction fetching');
          break;
        }
        
        // Ajouter un délai entre chaque transaction
        if (processedCount > 0) {
          await delay(MIN_REQUEST_DELAY); // Délai pour respecter la limite de 10 req/s
        }
        
        try {
          // Vérifier d'abord le statut de la transaction pour éviter les transactions échouées
          const status = await connection.getSignatureStatus(sigInfo.signature);
          
          // Ne filtrer QUE si la transaction a explicitement échoué (err existe et n'est pas null)
          // Ne pas filtrer si status.value est null/undefined (peut être normal pour certaines transactions anciennes)
          // Une transaction réussie a status.value.confirmationStatus défini et err === null
          // Une transaction échouée a status.value.err défini et non-null
          if (status?.value && status.value.err !== null && status.value.err !== undefined) {
            console.log(`[getTransferTransactions] Skipping failed transaction: ${sigInfo.signature}, err: ${JSON.stringify(status.value.err)}`);
            processedCount++;
            consecutiveErrors = 0;
            continue;
          }
          
          const tx = await connection.getParsedTransaction(sigInfo.signature, {
            maxSupportedTransactionVersion: 0,
          });
          
          if (tx) {
            // Vérifier aussi dans les métadonnées de la transaction si elle a échoué
            if (tx.meta?.err) {
              console.log(`[getTransferTransactions] Skipping failed transaction (meta.err): ${sigInfo.signature}`);
              processedCount++;
              consecutiveErrors = 0;
              continue;
            }
            
            // Filtrer rapidement : vérifier si le buyback est impliqué dans la transaction
            // Vérifier dans postTokenBalances OU dans les accountKeys
            const hasBuybackInBalances = tx.meta?.postTokenBalances?.some(
              (b: any) => b.owner === BUYBACK_ADDRESS && b.mint === TOKEN_MINT_ADDRESS
            );
            const accountKeys = tx.transaction.message.accountKeys.map((key: any) => 
              typeof key === 'string' ? key : key.pubkey.toString()
            );
            const hasBuybackInAccounts = accountKeys.includes(BUYBACK_ADDRESS);
            
            // Si pas de buyback dans la transaction, skip immédiatement (économise le parsing)
            if (!hasBuybackInBalances && !hasBuybackInAccounts) {
              processedCount++;
              consecutiveErrors = 0;
              continue;
            }
            
            buybackFoundCount++;
            
            // Parser la transaction pour vérifier si c'est vraiment un transfer vers le buyback
            const transferTx = parseTransferTransaction(tx);
            if (transferTx && transferTx.tokenAmount > 0 && !EXCLUDED_TRANSACTIONS.includes(transferTx.signature)) {
              transactions.push(transferTx);
              seenSignatures.add(transferTx.signature);
              
              // Arrêter si on a atteint la limite (sauf si limit=0 pour récupérer tout)
              if (limit > 0 && transactions.length >= limit) {
                console.log(`[getTransferTransactions] Reached limit of ${limit} transfers, stopping`);
                break;
              }
            } else {
              buybackSkippedCount++;
            }
          }
          processedCount++;
          consecutiveErrors = 0; // Réinitialiser le compteur en cas de succès
        } catch (error: any) {
          const errorMessage = error?.message || '';
          const isTemporaryError = 
            errorMessage.includes('500') || 
            errorMessage.includes('Internal Server Error') ||
            errorMessage.includes('Temporary internal error') ||
            errorMessage.includes('503') || 
            errorMessage.includes('Service Unavailable');
          
          // Ne pas compter les erreurs temporaires comme des erreurs consécutives
          if (!isTemporaryError) {
            consecutiveErrors++;
          }
          
          // Gérer les erreurs 500 (Internal Server Error) - erreurs temporaires
          if (errorMessage.includes('500') || errorMessage.includes('Internal Server Error') || errorMessage.includes('Temporary internal error')) {
            console.log(`[getTransferTransactions] Temporary RPC error (500), waiting 5 seconds before retry...`);
            await delay(5000);
            continue;
          }
          
          // Si erreur 429, attendre plus longtemps et réduire la vitesse
          if (errorMessage.includes('429') || errorMessage.includes('Too Many Requests')) {
            console.log(`[getTransferTransactions] Rate limited (429), waiting 10 seconds before retry...`);
            await delay(10000); // Délai de 10 secondes pour les erreurs 429
            // Réduire la vitesse après une erreur 429
            await delay(MIN_REQUEST_DELAY * 3); // Triple délai après 429
            continue;
          }
          
          // Si erreur 503, attendre plus longtemps
          if (errorMessage.includes('503') || errorMessage.includes('Service Unavailable')) {
            console.log(`[getTransferTransactions] Service unavailable (503), waiting 5 seconds before retry...`);
            await delay(5000); // Délai de 5 secondes pour les erreurs 503
            continue;
          }
          
          // Pour les autres erreurs, vérifier si on doit arrêter
          if (consecutiveErrors >= maxConsecutiveErrors) {
            console.warn(`[getTransferTransactions] Too many consecutive errors (${consecutiveErrors}), stopping and returning what we have`);
            break; // Break au lieu de throw pour retourner ce qu'on a
          }
          
          // Pour les erreurs non-temporaires, attendre un peu avant de réessayer
          await delay(2000);
        }
        
        if (transactions.length >= limit) break;
      }
    } catch (error: any) {
      // Si erreur 503, on continue avec ce qu'on a (ne pas throw pour permettre de retourner les transactions trouvées)
      if (error?.message?.includes('503') || error?.message?.includes('Service Unavailable')) {
        console.warn('RPC returned 503 for buyback transactions, returning what we have');
      } else if (error?.message?.includes('429') || error?.message?.includes('Too Many Requests') ||
          error?.message?.includes('Rate limit') || error?.message?.includes('RPC service unavailable')) {
        // Pour les erreurs 429, on peut throw car c'est un problème de rate limiting
        throw error;
      }
    }
    
    // Ne pas chercher dans les transactions du token mint si on a déjà des erreurs
    // Cela réduit drastiquement le nombre de requêtes
    
    // Trier par timestamp décroissant
    transactions.sort((a, b) => b.timestamp - a.timestamp);
    
    console.log(`[getTransferTransactions] Processed ${allSignatures.length} transactions, found ${buybackFoundCount} with buyback, ${transactions.length} valid transfers (${buybackSkippedCount} skipped)`);
    
    return limit === 0 ? transactions : transactions.slice(0, limit);
  } catch (error: any) {
    console.error('Error fetching transfer transactions:', error);
    if (error?.message?.includes('429') || error?.message?.includes('Too Many Requests') ||
        error?.message?.includes('503') || error?.message?.includes('Service Unavailable') ||
        error?.message?.includes('Rate limit') || error?.message?.includes('RPC service unavailable')) {
      throw error;
    }
    return [];
  }
}

// Fonction pour obtenir les stats du pool
export async function getPoolStats(): Promise<PoolStats> {
  try {
    // Charger les balances de manière sérialisée pour respecter la limite de 10 req/s
    const solBalance = await getSolBalance(LP_POOL_ADDRESS);
    await delay(MIN_REQUEST_DELAY);
    const tokenBalance = await getTokenBalance(LP_POOL_ADDRESS, TOKEN_MINT_ADDRESS);

    // Charger un nombre très limité de transactions pour les stats (réduit drastiquement pour éviter le rate limiting)
    let mintTxs: MintTransaction[] = [];
    let transferTxs: TransferTransaction[] = [];
    
    try {
      mintTxs = await getMintTransactions(10); // Réduit à seulement 10 pour les stats
    } catch (error: any) {
      if (error?.message?.includes('Rate limit') || error?.message?.includes('RPC service unavailable') ||
          error?.message?.includes('503') || error?.message?.includes('Service Unavailable')) {
        throw error;
      }
      console.error('Error fetching mint transactions for stats:', error);
    }
    
    try {
      transferTxs = await getTransferTransactions(10); // Réduit à seulement 10 pour les stats
    } catch (error: any) {
      if (error?.message?.includes('Rate limit') || error?.message?.includes('RPC service unavailable') ||
          error?.message?.includes('503') || error?.message?.includes('Service Unavailable')) {
        throw error;
      }
      console.error('Error fetching transfer transactions for stats:', error);
    }

    const totalSolAdded = mintTxs.reduce((sum, tx) => sum + tx.solAmount, 0);
    const totalTokensAdded = mintTxs.reduce((sum, tx) => sum + tx.tokenAmount, 0);
    const totalTokensTransferred = transferTxs.reduce((sum, tx) => sum + tx.tokenAmount, 0);

    return {
      solBalance,
      tokenBalance,
      totalMints: mintTxs.length,
      totalTransfers: transferTxs.length,
      totalSolAdded,
      totalTokensAdded,
      totalTokensTransferred,
    };
  } catch (error: any) {
    console.error('Error fetching pool stats:', error);
    if (error?.message?.includes('Rate limit') || error?.message?.includes('RPC service unavailable') ||
        error?.message?.includes('503') || error?.message?.includes('Service Unavailable')) {
      throw error;
    }
    return {
      solBalance: 0,
      tokenBalance: 0,
      totalMints: 0,
      totalTransfers: 0,
      totalSolAdded: 0,
      totalTokensAdded: 0,
      totalTokensTransferred: 0,
    };
  }
}

// Fonction pour récupérer le prix du token depuis Jupiter API
export async function getTokenPrice(): Promise<{ price: number; priceInUsd: number; solPrice: number; solBalance: number; tokenBalance: number } | null> {
  try {
    const publicKey = new PublicKey(LP_POOL_ADDRESS);
    
    // Récupérer le solde SOL de la LP
    const solBalance = await connection.getBalance(publicKey);
    const solBalanceInSol = solBalance / 1e9; // Convertir lamports en SOL
    
    // Récupérer le solde de tokens de la LP
    let tokenBalance = 0;
    try {
      tokenBalance = await getTokenBalance(LP_POOL_ADDRESS, TOKEN_MINT_ADDRESS);
      console.log(`[getTokenPrice] Token balance from getTokenBalance: ${tokenBalance}`);
    } catch (error) {
      console.error('[getTokenPrice] Error getting token balance:', error);
    }
    
    // Si tokenBalance est 0, essayer de le récupérer depuis les transactions récentes
    if (tokenBalance === 0) {
      console.log('[getTokenPrice] Token balance is 0, trying to find it in recent transactions...');
      try {
        const signatures = await connection.getSignaturesForAddress(publicKey, { limit: 5 });
        for (const sigInfo of signatures) {
          try {
            const tx = await connection.getParsedTransaction(sigInfo.signature, {
              maxSupportedTransactionVersion: 0,
            });
            if (tx?.meta?.postTokenBalances) {
              let totalBalance = 0;
              for (const balance of tx.meta.postTokenBalances) {
                if (balance.owner === LP_POOL_ADDRESS && balance.mint === TOKEN_MINT_ADDRESS) {
                  totalBalance += balance.uiTokenAmount?.uiAmount || 0;
                }
              }
              if (totalBalance > 0) {
                tokenBalance = totalBalance;
                console.log(`[getTokenPrice] Found token balance ${tokenBalance} in recent transaction`);
                break;
              }
            }
          } catch (err) {
            continue;
          }
        }
      } catch (err) {
        console.error('[getTokenPrice] Error searching transactions for balance:', err);
      }
    }
    
    // Récupérer les prix depuis Jupiter API
    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    const jupiterApiKey = process.env.JUPITER_API_KEY;
    
    const headers: HeadersInit = {};
    if (jupiterApiKey) {
      headers['x-api-key'] = jupiterApiKey;
    }
    
    const priceResponse = await fetch(
      `https://api.jup.ag/price/v3?ids=${SOL_MINT},${TOKEN_MINT_ADDRESS}`,
      { headers }
    );
    
    if (!priceResponse.ok) {
      console.error('[getTokenPrice] Jupiter API error:', priceResponse.statusText);
      // Fallback: calculer le prix depuis la LP si on a les balances
      if (tokenBalance > 0 && solBalanceInSol > 0) {
        const price = solBalanceInSol / tokenBalance;
        // Essayer de récupérer le prix du SOL depuis CoinGecko comme fallback
        let solPrice = 0;
        try {
          const solResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
          if (solResponse.ok) {
            const solData = await solResponse.json();
            solPrice = solData.solana?.usd || 0;
          }
        } catch (err) {
          console.error('[getTokenPrice] Error fetching SOL price from CoinGecko:', err);
        }
        
        return {
          price,
          priceInUsd: solPrice > 0 ? price * solPrice : 0,
          solPrice,
          solBalance: solBalanceInSol,
          tokenBalance,
        };
      }
      return null;
    }
    
    const priceData = await priceResponse.json();
    console.log('[getTokenPrice] Jupiter price data:', JSON.stringify(priceData, null, 2));
    
    // La réponse Jupiter a la structure directe { [mint]: { usdPrice, ... } }
    const solPriceData = priceData[SOL_MINT];
    const tokenPriceData = priceData[TOKEN_MINT_ADDRESS];
    
    if (!solPriceData || !tokenPriceData) {
      console.error('[getTokenPrice] Missing price data from Jupiter');
      // Fallback: calculer le prix depuis la LP
      if (tokenBalance > 0 && solBalanceInSol > 0) {
        const price = solBalanceInSol / tokenBalance;
        // Essayer de récupérer le prix du SOL depuis CoinGecko comme fallback
        let solPrice = 0;
        try {
          const solResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
          if (solResponse.ok) {
            const solData = await solResponse.json();
            solPrice = solData.solana?.usd || 0;
          }
        } catch (err) {
          console.error('[getTokenPrice] Error fetching SOL price from CoinGecko:', err);
        }
        
        return {
          price,
          priceInUsd: solPrice > 0 ? price * solPrice : 0,
          solPrice,
          solBalance: solBalanceInSol,
          tokenBalance,
        };
      }
      return null;
    }
    
    // Jupiter API utilise "usdPrice" au lieu de "price"
    const solPrice = solPriceData.usdPrice || 0;
    const tokenPriceInUsd = tokenPriceData.usdPrice || 0;
    
    // Calculer le prix en SOL si on a les balances de la LP
    let priceInSol = 0;
    if (tokenBalance > 0 && solBalanceInSol > 0) {
      priceInSol = solBalanceInSol / tokenBalance;
    } else if (solPrice > 0 && tokenPriceInUsd > 0) {
      // Calculer depuis les prix USD
      priceInSol = tokenPriceInUsd / solPrice;
    }
    
    console.log(`[getTokenPrice] SOL price: $${solPrice}, Token price: $${tokenPriceInUsd}, Price in SOL: ${priceInSol}`);
    
    return {
      price: priceInSol,
      priceInUsd: tokenPriceInUsd,
      solPrice,
      solBalance: solBalanceInSol,
      tokenBalance,
    };
  } catch (error) {
    console.error('Error getting token price:', error);
    return null;
  }
}

