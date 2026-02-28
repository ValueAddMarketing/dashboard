import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Fathom Notetaker Ingestion Edge Function
 *
 * Polls the Fathom API for recent meetings, matches them to clients
 * via email domain mapping, runs AI analysis, and saves to meeting_notes.
 *
 * Can be triggered:
 *   - Manually from the dashboard (POST with optional filters)
 *   - On a cron schedule (POST with no body)
 *   - By the fathom-webhook function (POST with single_recording)
 */

interface FathomTranscriptEntry {
  speaker_name: string
  speaker_email?: string
  text: string
  timestamp: number
}

interface FathomRecording {
  id: string
  title: string
  url: string
  created_at: string
  scheduled_at?: string
  recording_start_at?: string
  recording_end_at?: string
  meeting_type?: string
  transcript_language?: string
  calendar_invitees?: Array<{ email: string; name?: string }>
  transcript?: FathomTranscriptEntry[]
  summary?: string
}

interface ProcessingResult {
  recording_id: string
  title: string
  status: string
  client_name?: string
  error?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const FATHOM_API_KEY = Deno.env.get('FATHOM_API_KEY')
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    let body: Record<string, unknown> = {}
    try {
      body = await req.json()
    } catch {
      // No body is fine — defaults will be used
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Load client email domain mappings (used by all paths)
    const { data: domainMappings } = await supabase
      .from('client_email_domains')
      .select('domain, client_name')

    const domainMap = new Map<string, string>()
    for (const mapping of (domainMappings || [])) {
      domainMap.set(mapping.domain.toLowerCase(), mapping.client_name)
    }

    // ── Path A: Single recording from webhook ──────────────────
    if (body.single_recording) {
      const recording = body.single_recording as FathomRecording
      const source = (body.source as string) || 'fathom_webhook'
      const results = await processRecordings([recording], domainMap, supabase, ANTHROPIC_API_KEY, source, FATHOM_API_KEY)

      return new Response(
        JSON.stringify({ message: `Processed 1 recording`, results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Path B: Poll Fathom API for recent meetings ────────────
    if (!FATHOM_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'FATHOM_API_KEY not configured. Add it via: supabase secrets set FATHOM_API_KEY=your_key' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const defaultLookback = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const createdAfter = (body.created_after as string) || defaultLookback

    const fathomUrl = new URL('https://api.fathom.ai/external/v1/meetings')
    fathomUrl.searchParams.set('created_after', createdAfter)

    const fathomResponse = await fetch(fathomUrl.toString(), {
      headers: { 'X-Api-Key': FATHOM_API_KEY }
    })

    if (!fathomResponse.ok) {
      const errText = await fathomResponse.text()
      return new Response(
        JSON.stringify({ error: 'Fathom API error', details: errText, status: fathomResponse.status }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const fathomData = await fathomResponse.json()
    const rawItems = fathomData.items || fathomData.meetings || fathomData.recordings || fathomData.data || fathomData || []

    // Map Fathom API fields to our expected format
    const recordings: FathomRecording[] = (Array.isArray(rawItems) ? rawItems : []).map((item: Record<string, unknown>) => ({
      id: String(item.recording_id || item.id),
      title: (item.meeting_title || item.title) as string,
      url: item.url as string,
      created_at: item.created_at as string,
      scheduled_at: (item.scheduled_start_time || item.scheduled_at) as string,
      recording_start_at: (item.recording_start_time || item.recording_start_at) as string,
      recording_end_at: (item.recording_end_time || item.recording_end_at) as string,
      calendar_invitees: (item.calendar_invitees || item.invitees || []) as Array<{ email: string; name?: string }>,
      transcript: item.transcript as FathomTranscriptEntry[] | undefined,
      summary: item.summary as string | undefined,
    }))

    if (recordings.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No new meetings found', checked_after: createdAfter }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Filter out already-synced recordings
    const recordingIds = recordings.map(r => r.id)
    const { data: existingSyncs } = await supabase
      .from('fathom_sync_log')
      .select('fathom_recording_id')
      .in('fathom_recording_id', recordingIds)

    const alreadySynced = new Set((existingSyncs || []).map(s => s.fathom_recording_id))
    const newRecordings = recordings.filter(r => !alreadySynced.has(r.id))

    const skipped = recordings.length - newRecordings.length
    const results = await processRecordings(newRecordings, domainMap, supabase, ANTHROPIC_API_KEY, 'fathom', FATHOM_API_KEY)

    // Add skip entries
    for (const r of recordings) {
      if (alreadySynced.has(r.id)) {
        results.unshift({ recording_id: r.id, title: r.title, status: 'skipped_duplicate' })
      }
    }

    return new Response(
      JSON.stringify({
        message: `Processed ${newRecordings.length} new recordings (${skipped} skipped as duplicates)`,
        results,
        checked_after: createdAfter,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('ingest-fathom error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// ════════════════════════════════════════════════════════════════
// Core: Process an array of recordings through the full pipeline
// ════════════════════════════════════════════════════════════════
async function processRecordings(
  recordings: FathomRecording[],
  domainMap: Map<string, string>,
  supabase: SupabaseClient,
  anthropicApiKey: string | undefined,
  source: string,
  fathomApiKey?: string | null
): Promise<ProcessingResult[]> {
  const results: ProcessingResult[] = []

  for (const recording of recordings) {
    try {
      // ── Fetch transcript if missing ─────────────────────────
      if (!recording.transcript && fathomApiKey) {
        try {
          const transcriptResp = await fetch(
            `https://api.fathom.ai/external/v1/recordings/${recording.id}/transcript`,
            { headers: { 'X-Api-Key': fathomApiKey } }
          )
          if (transcriptResp.ok) {
            const transcriptData = await transcriptResp.json()
            recording.transcript = transcriptData.transcript || transcriptData
          }
        } catch (err) {
          console.error(`Failed to fetch transcript for ${recording.id}:`, err)
        }
      }

      // ── Match to a client ────────────────────────────────────
      const clientName = matchClient(recording, domainMap)

      if (!clientName) {
        await supabase.from('fathom_sync_log').upsert({
          fathom_recording_id: recording.id,
          status: 'unmatched',
          fathom_title: recording.title,
          fathom_url: recording.url,
          error_message: 'Could not match to a client. Add email domain mapping in Fathom Settings.'
        }, { onConflict: 'fathom_recording_id' })
        results.push({ recording_id: recording.id, title: recording.title, status: 'unmatched' })
        continue
      }

      // ── Format transcript ────────────────────────────────────
      const transcriptText = formatTranscript(recording)

      if (!transcriptText) {
        await supabase.from('fathom_sync_log').upsert({
          fathom_recording_id: recording.id,
          client_name: clientName,
          status: 'failed',
          fathom_title: recording.title,
          fathom_url: recording.url,
          error_message: 'No transcript content available'
        }, { onConflict: 'fathom_recording_id' })
        results.push({ recording_id: recording.id, title: recording.title, status: 'no_transcript', client_name: clientName })
        continue
      }

      // ── Run AI analysis ──────────────────────────────────────
      let analysis: Record<string, unknown> = {}
      if (anthropicApiKey) {
        analysis = await analyzeWithClaude(transcriptText, clientName, anthropicApiKey)
      } else {
        analysis = {
          summary: recording.summary || 'Fathom transcript imported (AI analysis unavailable — set ANTHROPIC_API_KEY)',
          keyPoints: [],
          actionItems: [],
          riskLevel: 'medium',
        }
      }

      // ── Save to meeting_notes ────────────────────────────────
      const meetingTitle = (analysis.title as string) || recording.title || 'Fathom Meeting'
      const meetingDate = recording.scheduled_at || recording.recording_start_at || recording.created_at

      const allAnalysis = {
        title: meetingTitle,
        summary: analysis.summary || recording.summary || null,
        clientSentiment: analysis.clientSentiment || 'neutral',
        sentimentExplanation: analysis.sentimentExplanation || null,
        keyPoints: analysis.keyPoints || [],
        actionItems: analysis.actionItems || [],
        concerns: analysis.concerns || [],
        riskLevel: analysis.riskLevel || 'medium',
        nextSteps: analysis.nextSteps || [],
        duration: analysis.duration || null,
        participants: analysis.participants || [],
        topics: analysis.topics || [],
        decisions: analysis.decisions || [],
        followUpNeeded: analysis.followUpNeeded || false,
        followUpItems: analysis.followUpItems || [],
        riskFactors: analysis.riskFactors || [],
        clientRequests: analysis.clientRequests || [],
        positiveSignals: analysis.positiveSignals || [],
        warningSignals: analysis.warningSignals || [],
        importantNotes: analysis.importantNotes || [],
        fathomUrl: recording.url,
        createdByName: 'Fathom (auto-sync)'
      }

      const meetingRecord = {
        client_name: clientName,
        meeting_date: meetingDate,
        meeting_type: meetingTitle,
        transcript: transcriptText,
        summary: (analysis.summary as string) || recording.summary || 'Imported from Fathom',
        ad_performance_notes: JSON.stringify(allAnalysis),
        source,
        external_id: recording.id,
        user_email: 'fathom-sync@system',
      }

      // Try with extended columns, fall back to base
      const extended = {
        ...meetingRecord,
        client_sentiment: (analysis.clientSentiment as string) || 'neutral',
        key_points: analysis.keyPoints || [],
        action_items: analysis.actionItems || [],
        client_concerns: analysis.concerns || [],
        risk_level: (analysis.riskLevel as string) || 'medium',
        next_steps: JSON.stringify(analysis.nextSteps || []),
      }

      let insertResult = await supabase.from('meeting_notes').insert(extended).select().single()
      if (insertResult.error) {
        insertResult = await supabase.from('meeting_notes').insert(meetingRecord).select().single()
      }
      if (insertResult.error) throw new Error(insertResult.error.message)

      const meetingData = insertResult.data

      // ── Auto-create important notes ──────────────────────────
      const importantNotes = (analysis.importantNotes || []) as string[]
      for (const note of importantNotes) {
        await supabase.from('client_notes').insert({
          client_name: clientName,
          note_text: `[Fathom ${meetingDate}] ${note}`,
          source: 'ai_extracted',
          is_important: true,
          user_email: 'fathom-sync@system'
        })
      }

      const highPriorityActions = ((analysis.actionItems || []) as Array<{ priority?: string; task?: string; owner?: string }>)
        .filter(a => a.priority === 'high')
      for (const action of highPriorityActions) {
        await supabase.from('client_notes').insert({
          client_name: clientName,
          note_text: `HIGH PRIORITY ACTION [Fathom ${meetingDate}]: ${action.task} (Owner: ${action.owner || 'Unassigned'})`,
          source: 'ai_extracted',
          is_important: true,
          user_email: 'fathom-sync@system'
        })
      }

      // ── Log activity ─────────────────────────────────────────
      await supabase.from('activity_log').insert({
        user_email: 'fathom-sync@system',
        client_name: clientName,
        action: 'Fathom meeting auto-imported',
        details: `${meetingTitle}: ${((analysis.summary as string) || '').substring(0, 100)}`
      })

      // ── Record in sync log ───────────────────────────────────
      await supabase.from('fathom_sync_log').upsert({
        fathom_recording_id: recording.id,
        client_name: clientName,
        meeting_note_id: meetingData?.id || null,
        status: 'processed',
        fathom_title: recording.title,
        fathom_url: recording.url,
        processed_at: new Date().toISOString()
      }, { onConflict: 'fathom_recording_id' })

      results.push({
        recording_id: recording.id,
        title: recording.title,
        status: 'processed',
        client_name: clientName,
      })

    } catch (err) {
      await supabase.from('fathom_sync_log').upsert({
        fathom_recording_id: recording.id,
        status: 'failed',
        fathom_title: recording.title,
        fathom_url: recording.url,
        error_message: (err as Error).message,
      }, { onConflict: 'fathom_recording_id' })

      results.push({
        recording_id: recording.id,
        title: recording.title,
        status: 'failed',
        error: (err as Error).message,
      })
    }
  }

  return results
}

// ════════════════════════════════════════════════════════════════
// Helper: Match a Fathom recording to a client name
// ════════════════════════════════════════════════════════════════
function matchClient(
  recording: FathomRecording,
  domainMap: Map<string, string>
): string | null {
  // Strategy 1: Check calendar invitees against domain map
  const invitees = recording.calendar_invitees || []
  for (const invitee of invitees) {
    if (!invitee.email) continue
    const email = invitee.email.toLowerCase()

    if (domainMap.has(email)) return domainMap.get(email)!

    const domain = email.split('@')[1]
    if (domain && domainMap.has(domain)) return domainMap.get(domain)!
  }

  // Strategy 2: Check speaker emails from transcript
  if (recording.transcript) {
    for (const entry of recording.transcript) {
      if (!entry.speaker_email) continue
      const email = entry.speaker_email.toLowerCase()

      if (domainMap.has(email)) return domainMap.get(email)!

      const domain = email.split('@')[1]
      if (domain && domainMap.has(domain)) return domainMap.get(domain)!
    }
  }

  // Strategy 3: Check if recording title contains a known client name
  const titleLower = (recording.title || '').toLowerCase()
  const clientNames = new Set(domainMap.values())
  for (const clientName of clientNames) {
    if (titleLower.includes(clientName.toLowerCase())) return clientName
  }

  return null
}

// ════════════════════════════════════════════════════════════════
// Helper: Format Fathom transcript entries into readable text
// ════════════════════════════════════════════════════════════════
function formatTranscript(recording: FathomRecording): string {
  if (!recording.transcript || recording.transcript.length === 0) return ''

  return recording.transcript
    .map(entry => `${entry.speaker_name}: ${entry.text}`)
    .join('\n')
}

// ════════════════════════════════════════════════════════════════
// Helper: Analyze transcript with Claude
// ════════════════════════════════════════════════════════════════
async function analyzeWithClaude(
  transcript: string,
  clientName: string,
  apiKey: string
): Promise<Record<string, unknown>> {
  const promptContent = `Analyze this meeting transcript for client "${clientName}".

Extract ALL details and return a comprehensive JSON object with this exact structure:
{
    "title": "Brief meeting title (e.g., 'Weekly Check-in', 'Onboarding Call')",
    "summary": "2-3 sentence executive summary of the meeting",
    "duration": "Estimated duration if mentioned (e.g., '30 minutes') or 'Not specified'",
    "participants": ["List of all people mentioned or who spoke in the meeting"],
    "topics": ["Main topics discussed in the meeting"],
    "clientSentiment": "positive/neutral/negative/frustrated/excited/concerned",
    "sentimentExplanation": "Brief explanation of why this sentiment was detected",
    "keyPoints": ["Important points discussed - be thorough, list ALL key points"],
    "actionItems": [{"task": "Specific task", "owner": "Person responsible", "dueDate": "If mentioned, otherwise null", "priority": "high/medium/low"}],
    "decisions": ["Any decisions made during the meeting"],
    "concerns": ["Any concerns or issues raised by the client"],
    "followUpNeeded": true/false,
    "followUpItems": ["Specific follow-up items needed"],
    "riskLevel": "low/medium/high",
    "riskFactors": ["Reasons for the risk level"],
    "importantNotes": ["Critical notes that should be flagged for attention - these will be added to the Notes History"],
    "nextSteps": ["Agreed next steps"],
    "clientRequests": ["Specific requests made by the client"],
    "positiveSignals": ["Any positive indicators about the client relationship"],
    "warningSignals": ["Any warning signs or red flags detected"]
}

Be thorough and extract as much information as possible. If something isn't mentioned, use null or empty array.
Return ONLY the JSON object, no markdown formatting or code blocks.

TRANSCRIPT:
${transcript}`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: promptContent }]
    })
  })

  if (!response.ok) {
    console.error('Claude API error:', await response.text())
    return {
      summary: 'Fathom transcript imported (AI analysis failed)',
      keyPoints: [],
      actionItems: [],
      riskLevel: 'medium',
    }
  }

  const data = await response.json()
  const responseText = data.content?.[0]?.text || '{}'

  try {
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) ||
                      responseText.match(/```\s*([\s\S]*?)\s*```/) ||
                      [null, responseText]
    return JSON.parse(jsonMatch[1] || responseText)
  } catch {
    return {
      summary: responseText.substring(0, 500),
      keyPoints: [],
      actionItems: [],
      riskLevel: 'medium',
    }
  }
}
