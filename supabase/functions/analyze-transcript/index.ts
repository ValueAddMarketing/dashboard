import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { transcript, clientName } = await req.json()

    if (!transcript) {
      return new Response(
        JSON.stringify({ error: 'Transcript is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const promptContent = `Analyze this meeting transcript for client "${clientName || 'Unknown'}".

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
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: promptContent }]
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Anthropic API error:', errorText)
      return new Response(
        JSON.stringify({ error: 'AI analysis failed', details: errorText }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const data = await response.json()
    const responseText = data.content?.[0]?.text || '{}'

    // Parse the JSON response
    let parsedResult
    try {
      // Handle potential markdown code blocks
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) ||
                        responseText.match(/```\s*([\s\S]*?)\s*```/) ||
                        [null, responseText]
      parsedResult = JSON.parse(jsonMatch[1] || responseText)
    } catch (parseError) {
      console.error('JSON parse error:', parseError)
      parsedResult = {
        summary: responseText.substring(0, 500),
        keyPoints: [],
        actionItems: [],
        riskLevel: 'medium',
        importantNotes: [],
        participants: [],
        topics: []
      }
    }

    return new Response(
      JSON.stringify(parsedResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
