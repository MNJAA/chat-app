import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  },
});
  
export default supabase;