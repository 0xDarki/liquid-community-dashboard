import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Route pour vérifier si les tables Supabase existent
export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({
        configured: false,
        error: 'Supabase environment variables are not configured',
        message: 'Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)',
      }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Vérifier chaque table
    const tables = ['mints', 'sync_state', 'price', 'history'];
    const results: Record<string, { exists: boolean; error?: string }> = {};

    for (const table of tables) {
      try {
        // Essayer de faire une requête simple pour vérifier si la table existe
        const { error } = await supabase
          .from(table)
          .select('id')
          .limit(1);

        if (error) {
          if (error.code === 'PGRST205') {
            // Table does not exist
            results[table] = { exists: false, error: 'Table does not exist' };
          } else if (error.code === 'PGRST116') {
            // Table exists but no rows
            results[table] = { exists: true };
          } else {
            results[table] = { exists: false, error: error.message };
          }
        } else {
          results[table] = { exists: true };
        }
      } catch (error: any) {
        results[table] = { exists: false, error: error?.message || 'Unknown error' };
      }
    }

    const allExist = Object.values(results).every(r => r.exists);
    const missingTables = Object.entries(results)
      .filter(([_, r]) => !r.exists)
      .map(([table, _]) => table);

    return NextResponse.json({
      configured: true,
      allTablesExist: allExist,
      tables: results,
      missingTables,
      message: allExist
        ? 'All tables exist and are ready to use'
        : `Missing tables: ${missingTables.join(', ')}. Please run the SQL schema from supabase-schema.sql in your Supabase SQL Editor.`,
    });
  } catch (error: any) {
    return NextResponse.json({
      configured: false,
      error: error?.message || 'Failed to check Supabase tables',
    }, { status: 500 });
  }
}


