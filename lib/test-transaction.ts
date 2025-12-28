// Fonction de test pour analyser une transaction spécifique
import { connection } from './solana';
import { parseMintTransaction } from './solana';

export async function testTransaction(signature: string) {
  try {
    console.log(`\n=== Testing transaction: ${signature} ===\n`);
    
    const tx = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });
    
    if (!tx) {
      console.log('Transaction not found');
      return;
    }
    
    console.log('Transaction found!');
    console.log('Account keys:', tx.transaction.message.accountKeys.map((k: any) => 
      typeof k === 'string' ? k : k.pubkey.toString()
    ));
    
    console.log('\nPre balances:', tx.meta?.preBalances);
    console.log('Post balances:', tx.meta?.postBalances);
    
    console.log('\nPre token balances:');
    tx.meta?.preTokenBalances?.forEach((b: any) => {
      console.log(`  Owner: ${b.owner}, Mint: ${b.mint}, Amount: ${b.uiTokenAmount?.uiAmount}`);
    });
    
    console.log('\nPost token balances:');
    tx.meta?.postTokenBalances?.forEach((b: any) => {
      console.log(`  Owner: ${b.owner}, Mint: ${b.mint}, Amount: ${b.uiTokenAmount?.uiAmount}`);
    });
    
    console.log('\nInstructions:');
    tx.transaction.message.instructions.forEach((inst: any, i: number) => {
      if ('parsed' in inst) {
        console.log(`  ${i}: ${inst.parsed.type}`, inst.parsed);
      } else {
        console.log(`  ${i}: Program instruction`);
      }
    });
    
    const result = parseMintTransaction(tx);
    console.log('\n=== Parse result ===');
    console.log(result);
    
    return result;
  } catch (error) {
    console.error('Error testing transaction:', error);
  }
}
















