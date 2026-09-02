// RentBill Pro — Supabase Realtime Postgres Changes Subscription
import { getSupabaseClient } from '../core/config.js';
import { loadDashboard } from './dashboard.js';

let realtimeChannel = null;

export function setupRealtimeSubscriptions() {
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient || !supabaseClient.channel) return;

  // Prevent re-subscribing if channel already active
  if (realtimeChannel) {
    return;
  }

  try {
    realtimeChannel = supabaseClient
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        loadDashboard();
      });

    realtimeChannel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        // Silently handle websocket connection notice when Realtime is disabled or offline
        realtimeChannel = null;
      }
    });
  } catch (err) {
    realtimeChannel = null;
  }
}

export function teardownRealtimeSubscriptions() {
  const supabaseClient = getSupabaseClient();
  if (supabaseClient && realtimeChannel) {
    try {
      supabaseClient.removeChannel(realtimeChannel);
    } catch (e) {}
    realtimeChannel = null;
  }
}
