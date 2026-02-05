# Supabase Edge Functions

These edge functions handle AI-powered features securely by proxying requests to the Anthropic API.

## Functions

### analyze-transcript
Analyzes meeting transcripts using Claude AI to extract:
- Meeting summary and title
- Participants and topics
- Key points and action items
- Client sentiment and risk level
- Important notes to flag

### live-call-help
Provides real-time AI assistance during customer calls.

## Deployment

### 1. Install Supabase CLI
```bash
npm install -g supabase
```

### 2. Login to Supabase
```bash
supabase login
```

### 3. Link your project
```bash
supabase link --project-ref ecmhhonjazfbletyvncw
```

### 4. Set the Anthropic API key secret
```bash
supabase secrets set ANTHROPIC_API_KEY=your-api-key-here
```

### 5. Deploy the functions
```bash
supabase functions deploy analyze-transcript
supabase functions deploy live-call-help
```

## Testing locally

```bash
supabase start
supabase functions serve analyze-transcript --env-file .env.local
```

Create a `.env.local` file with:
```
ANTHROPIC_API_KEY=your-api-key-here
```

## Usage

The frontend automatically calls these functions via `supabase.functions.invoke()`.
