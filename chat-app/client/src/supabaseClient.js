import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: {
    params: {
      eventsPerSecond: 10, // Limit the number of events per second
      reconnectAttempts: 10, // Number of reconnection attempts
      recoverableErrors: ['Websocket closed'], // Errors to recover from
    },
  },
});
  
export default supabase;