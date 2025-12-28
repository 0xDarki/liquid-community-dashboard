import { NextResponse } from 'next/server';
import { saveStoredHistory } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST() {
  try {
    // Sauvegarder un tableau vide pour nettoyer l'historique
    await saveStoredHistory([]);
    
    console.log('[Clean History] History cleared successfully');
    
    return NextResponse.json({
      success: true,
      message: 'History cleared successfully',
    });
  } catch (error: any) {
    console.error('Error cleaning history:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to clean history' },
      { status: 500 }
    );
  }
}






