import { NextResponse } from 'next/server';
import { syncMints, saveSyncState, loadSyncState } from '@/lib/storage';
import { isAuthorizedDomain } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 300; // 5 minutes

// Route pour récupérer toutes les transactions depuis la blockchain
// Cette route ignore les restrictions de temps et récupère tout
export async function POST(request: Request) {
  try {
    // Vérifier si la requête provient d'un domaine autorisé
    if (!isAuthorizedDomain(request)) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Unauthorized: This action is only available on the private domain',
        },
        { status: 403 } // Forbidden
      );
    }
    
    console.log('[Recover] Starting full recovery of all transactions from blockchain...');
    
    // Vérifier l'état actuel
    let currentState = await loadSyncState();
    
    // Si une sync est en cours mais bloquée depuis plus de 3 minutes, la réinitialiser
    if (currentState.isSyncing) {
      const now = Date.now();
      const syncStartTime = currentState.syncStartTime || currentState.lastSync || now;
      const threeMinutes = 3 * 60 * 1000;
      
      if (now - syncStartTime > threeMinutes) {
        console.warn('[Recover] Previous sync appears stuck, resetting before recovery');
        currentState = {
          ...currentState,
          isSyncing: false,
          syncStartTime: undefined,
        };
        await saveSyncState(currentState);
      }
    }
    
    // Marquer comme en cours de synchronisation (ignore les restrictions de temps)
    await saveSyncState({
      ...currentState,
      isSyncing: true,
      syncStartTime: Date.now(),
    });
    
    try {
      // Pour la récupération, on veut récupérer TOUTES les transactions depuis le début
      // On va utiliser getSignaturesForAddress directement pour paginer manuellement
      const { connection, LP_POOL_ADDRESS, parseMintTransaction, EXCLUDED_TRANSACTIONS, MIN_REQUEST_DELAY } = await import('@/lib/solana');
      const { PublicKey } = await import('@solana/web3.js');
      const { loadStoredMints, saveStoredMints } = await import('@/lib/storage');
      
      console.log('[Recover] Fetching all transactions from blockchain using direct pagination...');
      
      // Charger les transactions existantes pour éviter les doublons
      const existingMints = await loadStoredMints();
      const existingSignatures = new Set(existingMints.map(m => m.signature));
      console.log(`[Recover] Already have ${existingMints.length} transactions stored`);
      
      const publicKey = new PublicKey(LP_POOL_ADDRESS);
      const allNewTransactions: any[] = [];
      let before: string | undefined = undefined;
      let pageCount = 0;
      const maxPages = 50; // Augmenter le nombre de pages pour récupérer plus de transactions
      const signaturesPerPage = 1000; // Maximum par requête API
      let hasMore = true;
      
      // Fonction helper pour delay
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      
      // Récupérer toutes les signatures par pagination
      while (hasMore && pageCount < maxPages) {
        console.log(`[Recover] Fetching signatures page ${pageCount + 1}/${maxPages}...`);
        
        try {
          await delay(MIN_REQUEST_DELAY);
          
          // Retry logic pour gérer les erreurs de parsing JSON
          let signatures: any[] = [];
          let retries = 0;
          const maxRetries = 3;
          
          while (retries < maxRetries) {
            try {
              signatures = await connection.getSignaturesForAddress(publicKey, {
                limit: signaturesPerPage,
                before: before,
              });
              break; // Succès, sortir de la boucle
            } catch (retryError: any) {
              const retryErrorMessage = retryError?.message || '';
              const isJsonError = retryErrorMessage.includes('JSON') || 
                                  retryErrorMessage.includes('Unexpected token') ||
                                  retryErrorMessage.includes('SyntaxError');
              const isTemporaryError = retryErrorMessage.includes('500') || 
                                      retryErrorMessage.includes('Internal Server Error') ||
                                      retryErrorMessage.includes('Temporary internal error') ||
                                      retryErrorMessage.includes('503') ||
                                      retryErrorMessage.includes('Service Unavailable');
              
              if ((isJsonError || isTemporaryError) && retries < maxRetries - 1) {
                retries++;
                const waitTime = 5000 * retries; // Augmenter le délai à chaque retry
                console.warn(`[Recover] Error fetching signatures page ${pageCount + 1} (attempt ${retries}/${maxRetries}): ${retryErrorMessage}. Retrying in ${waitTime}ms...`);
                await delay(waitTime);
                continue;
              }
              
              // Si ce n'est pas une erreur temporaire ou qu'on a épuisé les retries, throw
              throw retryError;
            }
          }
          
          if (signatures.length === 0) {
            console.log(`[Recover] No more signatures found, stopping`);
            hasMore = false;
            break;
          }
          
          console.log(`[Recover] Got ${signatures.length} signatures on page ${pageCount + 1}`);
          
          // Traiter chaque signature pour récupérer les transactions MINT
          let processedInPage = 0;
          for (const sigInfo of signatures) {
            // Ignorer les transactions exclues ou déjà stockées
            if (EXCLUDED_TRANSACTIONS.includes(sigInfo.signature) || existingSignatures.has(sigInfo.signature)) {
              continue;
            }
            
            try {
              await delay(MIN_REQUEST_DELAY);
              
              // Retry logic pour gérer les erreurs de parsing JSON
              let tx: any = null;
              let txRetries = 0;
              const maxTxRetries = 2;
              
              while (txRetries < maxTxRetries) {
                try {
                  tx = await connection.getParsedTransaction(sigInfo.signature, {
                    maxSupportedTransactionVersion: 0,
                  });
                  break; // Succès, sortir de la boucle
                } catch (txError: any) {
                  const txErrorMessage = txError?.message || '';
                  const isJsonError = txErrorMessage.includes('JSON') || 
                                      txErrorMessage.includes('Unexpected token') ||
                                      txErrorMessage.includes('SyntaxError');
                  const isTemporaryError = txErrorMessage.includes('500') || 
                                          txErrorMessage.includes('Internal Server Error') ||
                                          txErrorMessage.includes('Temporary internal error') ||
                                          txErrorMessage.includes('503') ||
                                          txErrorMessage.includes('Service Unavailable');
                  
                  if ((isJsonError || isTemporaryError) && txRetries < maxTxRetries - 1) {
                    txRetries++;
                    const waitTime = 3000 * txRetries; // 3s, 6s
                    console.warn(`[Recover] Error fetching transaction ${sigInfo.signature.substring(0, 20)}... (attempt ${txRetries}/${maxTxRetries}): ${txErrorMessage}. Retrying in ${waitTime}ms...`);
                    await delay(waitTime);
                    continue;
                  }
                  
                  // Si ce n'est pas une erreur temporaire ou qu'on a épuisé les retries, throw
                  throw txError;
                }
              }
              
              if (tx && !tx.meta?.err) {
                const mintTx = parseMintTransaction(tx);
                if (mintTx && !EXCLUDED_TRANSACTIONS.includes(mintTx.signature)) {
                  allNewTransactions.push(mintTx);
                  existingSignatures.add(mintTx.signature);
                  processedInPage++;
                  
                  if (allNewTransactions.length % 100 === 0) {
                    console.log(`[Recover] Found ${allNewTransactions.length} new transactions so far...`);
                  }
                }
              }
            } catch (error: any) {
              const errorMessage = error?.message || '';
              const isJsonError = errorMessage.includes('JSON') || 
                                  errorMessage.includes('Unexpected token') ||
                                  errorMessage.includes('SyntaxError');
              
              // Vérifier si c'est une limite quotidienne atteinte
              if (errorMessage.includes('daily request limit') || errorMessage.includes('daily limit reached') || errorMessage.includes('upgrade your account')) {
                console.error(`[Recover] Daily RPC limit reached while processing signatures. Stopping recovery.`);
                hasMore = false;
                
                // Sauvegarder ce qui a été récupéré jusqu'à présent
                if (allNewTransactions.length > 0) {
                  const updated = [...existingMints, ...allNewTransactions].sort((a, b) => b.timestamp - a.timestamp);
                  await saveStoredMints(updated);
                  console.log(`[Recover] Saved ${allNewTransactions.length} transactions recovered before hitting limit. Total: ${updated.length}`);
                }
                
                // Réinitialiser le flag de sync
                await saveSyncState({
                  lastSync: Date.now(),
                  isSyncing: false,
                  syncStartTime: undefined,
                });
                
                return NextResponse.json({
                  success: false,
                  added: allNewTransactions.length,
                  total: existingMints.length + allNewTransactions.length,
                  error: 'RPC_DAILY_LIMIT_REACHED',
                  message: `Daily RPC request limit reached. Recovered ${allNewTransactions.length} new transactions before hitting the limit. Total stored: ${existingMints.length + allNewTransactions.length}. Please try again tomorrow or upgrade your RPC plan. You can also call this endpoint multiple times over several days to gradually recover all transactions.`,
                }, { status: 429 });
              }
              
              // Ignorer les erreurs JSON/temporaires et continuer avec la transaction suivante
              if (isJsonError || errorMessage.includes('429') || errorMessage.includes('503') || errorMessage.includes('500')) {
                if (isJsonError) {
                  console.warn(`[Recover] JSON parsing error for signature ${sigInfo.signature.substring(0, 20)}..., skipping...`);
                } else {
                  console.warn(`[Recover] Temporary error while processing signature, skipping...`);
                }
                // Ne pas attendre pour chaque transaction individuelle, continuer
              }
              continue;
            }
          }
          
          console.log(`[Recover] Page ${pageCount + 1}: Processed ${processedInPage} new transactions. Total: ${allNewTransactions.length}`);
          
          // Mettre à jour le before pour la pagination
          before = signatures[signatures.length - 1].signature;
          pageCount++;
          
          // Si on a récupéré moins de signatures que la limite, on a probablement atteint la fin
          if (signatures.length < signaturesPerPage) {
            console.log(`[Recover] Last page had less than ${signaturesPerPage} signatures, likely reached the end`);
            hasMore = false;
            break;
          }
          
          // Pause entre les pages pour éviter les rate limits (réduite avec RPC 15 req/s)
          if (hasMore && pageCount < maxPages) {
            await delay(500); // Réduit à 500ms avec RPC 15 req/s
          }
        } catch (error: any) {
          console.error(`[Recover] Error fetching page ${pageCount + 1}:`, error);
          const errorMessage = error?.message || '';
          const isJsonError = errorMessage.includes('JSON') || 
                              errorMessage.includes('Unexpected token') ||
                              errorMessage.includes('SyntaxError');
          const isTemporaryError = errorMessage.includes('500') || 
                                  errorMessage.includes('Internal Server Error') ||
                                  errorMessage.includes('Temporary internal error') ||
                                  errorMessage.includes('503') ||
                                  errorMessage.includes('Service Unavailable');
          
          // Vérifier si c'est une limite quotidienne atteinte (daily limit)
          if (errorMessage.includes('daily request limit') || errorMessage.includes('daily limit reached') || errorMessage.includes('upgrade your account')) {
            console.error(`[Recover] Daily RPC limit reached. Cannot continue recovery.`);
            hasMore = false;
            
            // Sauvegarder ce qui a été récupéré jusqu'à présent
            if (allNewTransactions.length > 0) {
              const updated = [...existingMints, ...allNewTransactions].sort((a, b) => b.timestamp - a.timestamp);
              await saveStoredMints(updated);
              console.log(`[Recover] Saved ${allNewTransactions.length} transactions recovered before hitting limit. Total: ${updated.length}`);
            }
            
            // Réinitialiser le flag de sync
            await saveSyncState({
              lastSync: Date.now(),
              isSyncing: false,
              syncStartTime: undefined,
            });
            
            return NextResponse.json({
              success: false,
              added: allNewTransactions.length,
              total: existingMints.length + allNewTransactions.length,
              error: 'RPC_DAILY_LIMIT_REACHED',
              message: `Daily RPC request limit reached. Recovered ${allNewTransactions.length} new transactions before hitting the limit. Total stored: ${existingMints.length + allNewTransactions.length}. Please try again tomorrow or upgrade your RPC plan. You can also call this endpoint multiple times over several days to gradually recover all transactions.`,
            }, { status: 429 });
          }
          
          // Si erreur JSON ou temporaire (500, 503), retenter avec un délai
          if (isJsonError || isTemporaryError || errorMessage.includes('429') || errorMessage.includes('Rate limit')) {
            const waitTime = isJsonError ? 10000 : 10000; // 10 secondes pour les erreurs JSON ou temporaires
            console.warn(`[Recover] ${isJsonError ? 'JSON parsing error' : 'Temporary error'} on page ${pageCount + 1}, waiting ${waitTime}ms before retrying...`);
            await delay(waitTime);
            
            // Réessayer cette page
            pageCount--; // Décrémenter pour réessayer la même page
            continue;
          }
          
          // Pour les autres erreurs, arrêter
          console.error(`[Recover] Fatal error on page ${pageCount + 1}, stopping recovery: ${errorMessage}`);
          hasMore = false;
          break;
        }
      }
      
      console.log(`[Recover] Finished fetching. Total new transactions: ${allNewTransactions.length}, pages processed: ${pageCount}`);
      
      // Fusionner avec les transactions existantes
      const updated = [...existingMints, ...allNewTransactions].sort((a, b) => b.timestamp - a.timestamp);
      
      console.log(`[Recover] Saving ${updated.length} total transactions (${existingMints.length} existing + ${allNewTransactions.length} new)...`);
      await saveStoredMints(updated);
      
      const result = {
        added: allNewTransactions.length,
        total: updated.length,
      };
      
      // Mettre à jour le timestamp de dernière synchronisation
      await saveSyncState({
        lastSync: Date.now(),
        isSyncing: false,
        syncStartTime: undefined,
      });
      
      console.log(`[Recover] Recovery completed: ${result.added} new transactions added. Total: ${result.total}`);
      
      return NextResponse.json({
        success: true,
        added: result.added,
        total: result.total,
        message: result.added > 0
          ? `Recovery successful: ${result.added} transactions recovered. Total: ${result.total}. Note: This process can retrieve up to ~50,000 signatures per call. If you have more transactions, you can call this endpoint again to continue recovering more.`
          : `No new transactions found. Total stored: ${result.total}. If you expected more transactions, you may need to call this endpoint multiple times to recover all historical data.`,
      });
    } catch (error) {
      // En cas d'erreur, réinitialiser le flag
      await saveSyncState({
        ...currentState,
        isSyncing: false,
        syncStartTime: undefined,
      });
      throw error;
    }
  } catch (error: any) {
    console.error('[Recover] Error recovering transactions:', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Failed to recover transactions',
      },
      { status: 500 }
    );
  }
}

// Route GET pour récupérer toutes les transactions (même comportement que POST)
export async function GET(request: Request) {
  // Vérifier si la requête provient d'un domaine autorisé
  if (!isAuthorizedDomain(request)) {
    return NextResponse.json(
      { 
        success: false,
        error: 'Unauthorized: This action is only available on the private domain',
      },
      { status: 403 } // Forbidden
    );
  }
  return POST(request);
}

