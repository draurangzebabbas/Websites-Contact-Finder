# Contact Info Extractor Webhook API Documentation

## Overview

The Contact Info Extractor webhook API allows you to extract contact information from domains using the Apify contact info scraper. The API returns the name of the API key used for each extraction, along with comprehensive contact data.

## Base URL

- **Development**: `http://localhost:3001`
- **Production**: `https://your-domain.com` (configured via `VITE_API_BASE_URL`)

## Authentication

All requests require a Bearer token in the Authorization header:

```
Authorization: Bearer YOUR_WEBHOOK_TOKEN
```

Your webhook token can be found in your dashboard under the Webhook section.

## Endpoints

### 1. Extract Contact Information

**Endpoint**: `POST /api/extract-contacts`

**Request Body**:
```json
{
  "domains": ["example.com", "test.com", "sample.com"]
}
```

**Response**:
```json
{
  "request_id": "uuid-string",
  "domains_processed": 3,
  "processing_time": 15000,
  "results": [
    {
      "domain": "example.com",
      "api_key_used": "My Apify Key 1",
      "page_scraped": "https://example.com/contact",
      "emails": ["contact@example.com", "info@example.com"],
      "phones": ["+1-555-123-4567", "(555) 123-4567"],
      "linkedIns": ["https://linkedin.com/company/example"],
      "social_media": {
        "instagrams": ["https://instagram.com/example"],
        "facebooks": ["https://facebook.com/example"],
        "twitters": ["https://twitter.com/example"],
        "youtubes": ["https://youtube.com/example"],
        "tiktoks": ["https://tiktok.com/@example"],
        "pinterests": ["https://pinterest.com/example"],
        "discords": [],
        "telegrams": []
      },
      "email_found": true,
      "total_contacts": 4
    }
  ]
}
```

### 2. Health Check

**Endpoint**: `GET /api/health`

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "version": "1.0.0",
  "supabase_connected": true
}
```

### 3. API Info

**Endpoint**: `GET /api/test`

**Response**:
```json
{
  "message": "Contact Info Extractor API is running",
  "base_url": "http://localhost:3001",
  "webhook_url": "http://localhost:3001/api/extract-contacts",
  "environment": "development",
  "endpoints": {
    "health": "http://localhost:3001/api/health",
    "extract": "http://localhost:3001/api/extract-contacts",
    "test_apify": "http://localhost:3001/api/test-apify",
    "debug_keys": "http://localhost:3001/api/debug/keys"
  }
}
```

### 4. Test Apify API Key

**Endpoint**: `POST /api/test-apify`

**Request Body**:
```json
{
  "apiKey": "your-apify-api-key"
}
```

### 5. Test Webhook (Full Extraction)

**Endpoint**: `POST /api/test-webhook`

**Request Body**:
```json
{
  "domains": ["example.com"]
}
```

## Response Fields Explained

### Main Response
- `request_id`: Unique identifier for this extraction request
- `domains_processed`: Number of domains successfully processed
- `processing_time`: Time taken in milliseconds
- `results`: Array of extraction results for each domain

### Result Object
- `domain`: The domain that was processed
- `api_key_used`: **NEW** - Name of the API key used for this extraction
- `page_scraped`: The specific page where contact info was found
- `emails`: Array of email addresses found
- `phones`: Array of phone numbers found
- `linkedIns`: Array of LinkedIn profile URLs
- `social_media`: Object containing all social media profiles
- `email_found`: Boolean indicating if any emails were found
- `total_contacts`: Total number of contact items found

### Social Media Object
- `instagrams`: Array of Instagram profile URLs
- `facebooks`: Array of Facebook page URLs
- `twitters`: Array of Twitter profile URLs
- `youtubes`: Array of YouTube channel URLs
- `tiktoks`: Array of TikTok profile URLs
- `pinterests`: Array of Pinterest profile URLs
- `discords`: Array of Discord server invites
- `telegrams`: Array of Telegram channel links

## Extraction Logic

The API uses the following logic to extract contact information:

1. **Main Page**: First tries to extract from the main domain (e.g., `https://example.com`)
2. **Contact Page**: If no emails found, tries `/contact` (e.g., `https://example.com/contact`)
3. **Contact-Us Page**: If still no emails found, tries `/contact-us` (e.g., `https://example.com/contact-us`)
4. **Returns Results**: Returns the first page where contact information was found

## Error Responses

### 400 Bad Request
```json
{
  "error": "Invalid request",
  "message": "Domains array is required and must not be empty"
}
```

### 401 Unauthorized
```json
{
  "error": "Missing or invalid authorization header"
}
```

### 429 Too Many Requests
```json
{
  "error": "Too many requests",
  "message": "Rate limit exceeded. Please try again later."
}
```

### 500 Internal Server Error
```json
{
  "error": "Extraction failed",
  "message": "An error occurred during contact extraction"
}
```

## Rate Limits

- **10 requests per minute** per IP address
- **Maximum 30 domains** per request
- **Maximum 3 API keys** per user

## API Key Management

The system automatically:
- Rotates between available API keys
- Marks keys as failed if they encounter errors
- Retries with different keys if one fails
- Returns the name of the API key used for each extraction

## Testing

### Using cURL
```bash
curl -X POST "http://localhost:3001/api/extract-contacts" \
  -H "Authorization: Bearer YOUR_WEBHOOK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "domains": ["example.com", "test.com", "sample.com"]
  }'
```

### Using JavaScript
```javascript
const response = await fetch('http://localhost:3001/api/extract-contacts', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_WEBHOOK_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    domains: ['example.com', 'test.com', 'sample.com']
  })
});

const data = await response.json();
console.log('API Key Used:', data.results[0].api_key_used);
console.log('Emails Found:', data.results[0].emails);
```

## Troubleshooting

### Common Issues

1. **"No API keys available"**
   - Add at least one Apify API key in your dashboard
   - Ensure the API key is active and has credits

2. **"Invalid API key"**
   - Check your Apify API key is correct
   - Verify the key has sufficient credits

3. **"Rate limit exceeded"**
   - Wait 60 seconds before making another request
   - Add more API keys to increase capacity

4. **"All API keys failed"**
   - Check all your API keys are valid
   - Ensure you have sufficient Apify credits

### Debug Endpoints

- `/api/debug/keys` - View your API key status
- `/api/test-apify` - Test a specific API key
- `/api/test-webhook` - Test the full extraction process

## Integration Examples

### Make.com (Integromat)
1. Create a new scenario
2. Add Google Sheets "Search Rows" module
3. Add HTTP "Make a Request" module
4. Configure with your webhook URL and token
5. Map domains from sheet to request body
6. Add another Google Sheets module to write results back

### Zapier
1. Create a new Zap
2. Choose your trigger (e.g., Google Sheets)
3. Add "Webhooks by Zapier" action
4. Configure with your webhook URL and token
5. Map the response data to your destination

### Custom Integration
The webhook returns the API key name used for each extraction, making it easy to track which API key was used for billing or debugging purposes.

## Expected Google Sheets Structure

### Input Sheet
| Domain (A) | Status (B) | Email (C) | Phone (D) | LinkedIn (E) | Instagram (F) | Facebook (G) | Twitter (H) |
|------------|------------|-----------|-----------|--------------|---------------|--------------|-------------|
| example.com | pending | | | | | | |
| test.com | pending | | | | | | |

### Output Sheet (After Processing)
| Domain (A) | Status (B) | Email (C) | Phone (D) | LinkedIn (E) | Instagram (F) | Facebook (G) | Twitter (H) |
|------------|------------|-----------|-----------|--------------|---------------|--------------|-------------|
| example.com | done | contact@example.com | +1-555-123-4567 | https://linkedin.com/company/example | https://instagram.com/example | https://facebook.com/example | https://twitter.com/example |
| test.com | done | info@test.com | (555) 987-6543 | | | | | 