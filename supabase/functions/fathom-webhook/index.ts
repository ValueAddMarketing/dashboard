import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
}

/**
 * Fathom Webhook Receiver
 *
 * Receives webhook notifications when a Fathom meeting finishes processing.
 * This can be triggered by:
 *   - Make.com / Zapier integration (sends meeting data via POST)
 *   - Direct Fathom webhook (if available in their API)
 *
 * The webhook payload should contain either:
 *   A) A full recording object with transcript
 *   B) A recording_id that we'll use to fetch from Fathom API
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Validate webhook secret if configured
    const WEBHOOK_SECRET = Deno.env.get('FATHOM_WEBHOOK_SECRET')
    if (WEBHOOK_SECRET) {
      const providedSecret = req.headers.get('x-webhook-secret') ||
                             req.headers.get('authorization')?.replace('Bearer ', '')
      if (providedSecret !== WEBHOOK_SECRET) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    const FATHOM_API_KEY = Deno.env.get('FATHOM_API_KEY')
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const body = await req.json()
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Determine the recording ID
    const recordingId = body.recording_id || body.id || body.data?.id

    if (!recordingId) {
      return new Response(
        JSON.stringify({ error: 'No recording_id provided in webhook payload' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if already processed
    const { data: existing } = await supabase
      .from('fathom_sync_log')
      .select('id, status')
      .eq('fathom_recording_id', recordingId)
      .single()

    if (existing && existing.status === 'processed') {
      return new Response(
        JSON.stringify({ message: 'Already processed', recording_id: recordingId }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // If the webhook payload includes transcript data, use it directly.
    // Otherwise, fetch from Fathom API.
    let transcript = body.transcript
    let title = body.title || body.data?.title
    let url = body.url || body.data?.url
    let invitees = body.calendar_invitees || body.data?.calendar_invitees || []
    let summary = body.summary || body.data?.summary

    if (!transcript && FATHOM_API_KEY) {
      // Fetch the full recording from Fathom
      const fathomResp = await fetch(
        `https://api.fathom.ai/external/v1/meetings/${recordingId}?include_transcript=true`,
        { headers: { 'X-Api-Key': FATHOM_API_KEY } }
      )

      if (fathomResp.ok) {
        const recording = await fathomResp.json()
        transcript = recording.transcript
        title = title || recording.title
        url = url || recording.url
        invitees = invitees.length ? invitees : (recording.calendar_invitees || [])
        summary = summary || recording.summary
      } else {
        const errText = await fathomResp.text()
        return new Response(
          JSON.stringify({ error: 'Failed to fetch recording from Fathom', details: errText }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    if (!transcript || (Array.isArray(transcript) && transcript.length === 0)) {
      // Log the attempt
      await supabase.from('fathom_sync_log').upsert({
        fathom_recording_id: recordingId,
        status: 'failed',
        fathom_title: title,
        fathom_url: url,
        error_message: 'No transcript available — meeting may still be processing',
      }, { onConflict: 'fathom_recording_id' })

      return new Response(
        JSON.stringify({ error: 'No transcript available', recording_id: recordingId }),
        { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Now trigger the main ingest function to process this recording.
    // We call ingest-fathom with a special single-recording mode.
    const { data: ingestResult, error: ingestErr } = await supabase.functions.invoke('ingest-fathom', {
      body: {
        // Pass the full recording data so ingest-fathom doesn't need to re-fetch
        single_recording: {
          id: recordingId,
          title,
          url,
          created_at: body.created_at || body.data?.created_at || new Date().toISOString(),
          calendar_invitees: invitees,
          transcript,
          summary,
          scheduled_at: body.scheduled_at || body.data?.scheduled_at,
          recording_start_at: body.recording_start_at || body.data?.recording_start_at,
          recording_end_at: body.recording_end_at || body.data?.recording_end_at,
        },
        source: 'webhook'
      }
    })

    if (ingestErr) {
      return new Response(
        JSON.stringify({ error: 'Ingestion failed', details: ingestErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        message: 'Webhook processed successfully',
        recording_id: recordingId,
        result: ingestResult
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('fathom-webhook error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
