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

    // Load participant name -> client mappings (learned from manual assignments)
    const { data: nameMappings } = await supabase
      .from('client_participant_names')
      .select('participant_name, client_name')

    const nameMap = new Map<string, string>()
    for (const mapping of (nameMappings || [])) {
      nameMap.set(mapping.participant_name.toLowerCase(), mapping.client_name)
    }

    // ── Path A: Single recording from webhook ──────────────────
    if (body.single_recording) {
      const recording = body.single_recording as FathomRecording
      const source = (body.source as string) || 'fathom_webhook'
      const results = await processRecordings([recording], domainMap, nameMap, supabase, ANTHROPIC_API_KEY, source, FATHOM_API_KEY)

      return new Response(
        JSON.stringify({ message: `Processed 1 recording`, results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Path C: Manual client assignment for unmatched meetings ──
    if (body.assign_client) {
      const { recording_id, client_name } = body.assign_client as { recording_id: string; client_name: string }

      if (!recording_id || !client_name) {
        return new Response(
          JSON.stringify({ error: 'assign_client requires recording_id and client_name' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (!FATHOM_API_KEY) {
        return new Response(
          JSON.stringify({ error: 'FATHOM_API_KEY not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Get metadata from existing sync log entry (no single-recording GET endpoint exists)
      const { data: syncEntry } = await supabase
        .from('fathom_sync_log')
        .select('*')
        .eq('fathom_recording_id', recording_id)
        .single()

      // Extract original meeting date from stored metadata
      let origMeetingDate = syncEntry?.synced_at || new Date().toISOString()
      try {
        const errorMeta = JSON.parse(syncEntry?.error_message || '{}')
        if (errorMeta.meeting_date) origMeetingDate = errorMeta.meeting_date
      } catch { /* error_message may be plain text from older entries */ }

      const recording: FathomRecording = {
        id: recording_id,
        title: syncEntry?.fathom_title || 'Unknown Meeting',
        url: syncEntry?.fathom_url || '',
        created_at: origMeetingDate,
      }

      // Process with forced client name (transcript fetch + AI analysis happen inside)
      const results = await processRecordings(
        [recording], domainMap, nameMap, supabase, ANTHROPIC_API_KEY,
        'fathom_manual_assign', FATHOM_API_KEY, client_name
      )

      // Save participant names from the meeting title as name mappings for future auto-matching
      const titleNames = extractNamesFromTitle(recording.title)
      // Also extract invitee names from stored metadata
      let storedParticipants: string[] = []
      try {
        const errorMeta = JSON.parse(syncEntry?.error_message || '{}')
        storedParticipants = (errorMeta.participant_names || []) as string[]
      } catch { /* ignore */ }

      const allNames = [...new Set([...titleNames, ...storedParticipants])]
        .filter(n => n.length > 1)

      // Ignore the user's own name (common patterns)
      const ownerEmails = [(body.user_email as string) || ''].filter(Boolean)
      const ownerNames = ownerEmails.map(e => e.split('@')[0].replace(/[._]/g, ' ').toLowerCase())

      for (const name of allNames) {
        const nameLower = name.toLowerCase()
        if (ownerNames.some(on => nameLower.includes(on) || on.includes(nameLower))) continue
        if (nameMap.has(nameLower)) continue // already mapped

        await supabase.from('client_participant_names').upsert({
          participant_name: nameLower,
          client_name: client_name,
        }, { onConflict: 'participant_name, client_name' })
      }

      return new Response(
        JSON.stringify({ message: `Assigned recording to ${client_name}`, results }),
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

    const defaultLookback = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const createdAfter = (body.created_after as string) || defaultLookback

    // Fetch all meetings using cursor-based pagination
    const allRawItems: Record<string, unknown>[] = []
    let cursor: string | null = null
    let hasMore = true

    while (hasMore) {
      const fathomUrl = new URL('https://api.fathom.ai/external/v1/meetings')
      fathomUrl.searchParams.set('created_after', createdAfter)
      if (cursor) {
        fathomUrl.searchParams.set('cursor', cursor)
      }

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
      const pageItems = Array.isArray(rawItems) ? rawItems : []
      allRawItems.push(...pageItems)

      // Check for more pages — Fathom API uses next_cursor (no has_more field)
      cursor = fathomData.next_cursor || null
      hasMore = !!cursor

      // Rate limit: 1s delay between pages to respect 60 calls/min
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    // Map Fathom API fields to our expected format
    const recordings: FathomRecording[] = allRawItems.map((item: Record<string, unknown>) => ({
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

    // Filter out already-processed recordings (but re-process unmatched ones)
    const recordingIds = recordings.map(r => r.id)
    const { data: existingSyncs } = await supabase
      .from('fathom_sync_log')
      .select('fathom_recording_id, status')
      .in('fathom_recording_id', recordingIds)

    const syncStatusMap = new Map<string, string>()
    for (const s of (existingSyncs || [])) {
      syncStatusMap.set(s.fathom_recording_id, s.status)
    }

    // Skip processed/failed entries, but re-process unmatched ones (in case mappings were added)
    const newRecordings = recordings.filter(r => {
      const status = syncStatusMap.get(r.id)
      return !status || status === 'unmatched'
    })

    const skipped = recordings.length - newRecordings.length
    const results = await processRecordings(newRecordings, domainMap, nameMap, supabase, ANTHROPIC_API_KEY, 'fathom', FATHOM_API_KEY)

    // Add skip entries for processed/failed duplicates
    for (const r of recordings) {
      const status = syncStatusMap.get(r.id)
      if (status && status !== 'unmatched') {
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
  nameMap: Map<string, string>,
  supabase: SupabaseClient,
  anthropicApiKey: string | undefined,
  source: string,
  fathomApiKey?: string | null,
  forceClientName?: string | null
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
      const clientName = forceClientName || matchClient(recording, domainMap, nameMap)

      if (!clientName) {
        const origMeetingDate = recording.scheduled_at || recording.recording_start_at || recording.created_at
        // Extract participant names for future name-based matching
        const participantNames = extractParticipantNames(recording)
        await supabase.from('fathom_sync_log').upsert({
          fathom_recording_id: recording.id,
          status: 'unmatched',
          fathom_title: recording.title,
          fathom_url: recording.url,
          error_message: JSON.stringify({
            reason: 'Could not match to a client. Add email domain mapping in Fathom Settings.',
            meeting_date: origMeetingDate,
            participant_names: participantNames,
            participants: [...(recording.calendar_invitees || []).map(i => i.email).filter(Boolean), ...participantNames]
          })
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
  domainMap: Map<string, string>,
  nameMap: Map<string, string>
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
  const allClientNames = new Set([...domainMap.values(), ...nameMap.values()])
  for (const clientName of allClientNames) {
    if (titleLower.includes(clientName.toLowerCase())) return clientName
  }

  // Strategy 4: Check participant names against learned name mappings
  if (nameMap.size > 0) {
    // Check invitee names
    for (const invitee of invitees) {
      if (invitee.name) {
        const nameLower = invitee.name.toLowerCase().trim()
        if (nameMap.has(nameLower)) return nameMap.get(nameLower)!
      }
    }
    // Check speaker names from transcript
    if (recording.transcript) {
      for (const entry of recording.transcript) {
        const nameLower = (entry.speaker_name || '').toLowerCase().trim()
        if (nameLower && nameMap.has(nameLower)) return nameMap.get(nameLower)!
      }
    }
    // Check names extracted from title (e.g. "Jenny Caceres 1:1 | Accountability")
    const titleNames = extractNamesFromTitle(recording.title)
    for (const name of titleNames) {
      const nameLower = name.toLowerCase()
      if (nameMap.has(nameLower)) return nameMap.get(nameLower)!
    }
  }

  return null
}

// ════════════════════════════════════════════════════════════════
// Helper: Extract participant names from a recording
// ════════════════════════════════════════════════════════════════
function extractParticipantNames(recording: FathomRecording): string[] {
  const names: Set<string> = new Set()

  // From calendar invitees
  for (const invitee of (recording.calendar_invitees || [])) {
    if (invitee.name) names.add(invitee.name.trim())
  }

  // From transcript speaker names
  if (recording.transcript) {
    for (const entry of recording.transcript) {
      if (entry.speaker_name) names.add(entry.speaker_name.trim())
    }
  }

  // From title (before separators like |)
  const titleNames = extractNamesFromTitle(recording.title)
  for (const n of titleNames) names.add(n)

  return [...names].filter(n => n.length > 1)
}

// ════════════════════════════════════════════════════════════════
// Helper: Extract human names from a meeting title
// ════════════════════════════════════════════════════════════════
function extractNamesFromTitle(title: string): string[] {
  if (!title) return []
  // Split on common separators: |
  const beforeSep = title.split(/\s*[|]\s*/)[0] || title
  // Remove common meeting type words
  const cleaned = beforeSep
    .replace(/\b(1:1|1on1|check-?in|meeting|call|sync|weekly|monthly|accountability|huddle|standup|review|retrospective|onboarding)\b/gi, '')
    .trim()
  // If what's left looks like a name (2-4 words, capitalized), return it
  if (cleaned && /^[A-Za-z\s'-]+$/.test(cleaned) && cleaned.split(/\s+/).length <= 4 && cleaned.length > 2) {
    return [cleaned.trim()]
  }
  return []
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
