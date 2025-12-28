import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { connection } from '@/lib/solana';
import { parseMintTransaction, LP_POOL_ADDRESS, TOKEN_MINT_ADDRESS } from '@/lib/solana';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const signature = searchParams.get('signature');
    
    if (!signature) {
      return NextResponse.json(
        { error: 'Signature parameter required' },
        { status: 400 }
      );
    }
    
    const tx = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });
    
    if (!tx) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }
    
    const accountKeys = tx.transaction.message.accountKeys.map((key: any) => 
      typeof key === 'string' ? key : key.pubkey.toString()
    );
    
    const hasLP = accountKeys.includes(LP_POOL_ADDRESS);
    const hasTokenMint = accountKeys.includes(TOKEN_MINT_ADDRESS);
    
    const result = parseMintTransaction(tx);
    
    return NextResponse.json({
      signature,
      hasLP,
      hasTokenMint,
      accountKeys: accountKeys.slice(0, 10), // Premiers 10 comptes
      preBalances: tx.meta?.preBalances?.slice(0, 10),
      postBalances: tx.meta?.postBalances?.slice(0, 10),
      preTokenBalances: tx.meta?.preTokenBalances?.filter((b: any) => 
        b.owner === LP_POOL_ADDRESS || b.mint === TOKEN_MINT_ADDRESS
      ),
      postTokenBalances: tx.meta?.postTokenBalances?.filter((b: any) => 
        b.owner === LP_POOL_ADDRESS || b.mint === TOKEN_MINT_ADDRESS
      ),
      parsedResult: result,
      instructions: tx.transaction.message.instructions.slice(0, 5).map((inst: any) => {
        if ('parsed' in inst) {
          return { type: inst.parsed.type, info: inst.parsed.info };
        }
        return { type: 'program' };
      }),
    });
  } catch (error: any) {
    console.error('Error testing transaction:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to test transaction' },
      { status: 500 }
    );
  }
}

