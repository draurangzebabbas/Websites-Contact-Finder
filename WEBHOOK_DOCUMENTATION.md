# Contact Info Extractor Webhook API Documentation

## Overview
The Contact Info Extractor API provides a webhook endpoint for extracting contact information from websites using the Apify `vdrmota/contact-info-scraper` actor. The API intelligently checks multiple pages per domain to find contact details.

## Base URL
```
https://websites-contact-finder.onrender.com
```

## Authentication
All requests require a Bearer token in the Authorization header:
```
Authorization: Bearer YOUR_WEBHOOK_TOKEN
```

## Endpoints

### POST /api/extract-contacts
Extract contact information from a list of domains and return in JSON format.

### POST /api/extract-contacts-sheets
Extract contact information from a list of domains and return in tab-separated format perfect for Google Sheets.

**Request Body:**
```json
{
  "domains": [
    "example.com",
    "another-domain.com",
    "test-site.org"
  ]
}
```

**Response Format (Completely Flat JSON for Make.com):**

**Single Domain Response:**
```json
{
  "request_id": "uuid-string",
  "domains_processed": 1,
  "processing_time": 45000,
  "domain": "example.com",
  "api_key_used": "Key 1",
  "page_scraped": "https://example.com/contact",
  "email_found": true,
  "total_contacts": 5,
  "emails": "contact@example.com, info@example.com",
  "phones": "+1-555-123-4567, (555) 123-4567",
  "linkedin": "https://linkedin.com/company/example",
  "instagram": "https://instagram.com/example",
  "facebook": "https://facebook.com/example",
  "twitter": "https://twitter.com/example",
  "youtube": "https://youtube.com/example",
  "tiktok": "No TikTok found",
  "pinterest": "No Pinterest found",
  "discord": "No Discord found",
  "telegram": "No Telegram found",
  "error": null
}
```

**Multiple Domains Response (Array of Flat Objects):**
```json
[
  {
    "request_id": "uuid-string",
    "domains_processed": 2,
    "processing_time": 45000,
    "domain": "example.com",
    "api_key_used": "Key 1",
    "page_scraped": "https://example.com/contact",
    "email_found": true,
    "total_contacts": 5,
    "emails": "contact@example.com, info@example.com",
    "phones": "+1-555-123-4567, (555) 123-4567",
    "linkedin": "https://linkedin.com/company/example",
    "instagram": "https://instagram.com/example",
    "facebook": "https://facebook.com/example",
    "twitter": "https://twitter.com/example",
    "youtube": "https://youtube.com/example",
    "tiktok": "No TikTok found",
    "pinterest": "No Pinterest found",
    "discord": "No Discord found",
    "telegram": "No Telegram found",
    "error": null
  },
  {
    "request_id": "uuid-string",
    "domains_processed": 2,
    "processing_time": 45000,
    "domain": "test-site.org",
    "api_key_used": "Key 2",
    "page_scraped": "https://test-site.org",
    "email_found": false,
    "total_contacts": 0,
    "emails": "No emails found",
    "phones": "No phones found",
    "linkedin": "No LinkedIn found",
    "instagram": "No Instagram found",
    "facebook": "No Facebook found",
    "twitter": "No Twitter found",
    "youtube": "No YouTube found",
    "tiktok": "No TikTok found",
    "pinterest": "No Pinterest found",
    "discord": "No Discord found",
    "telegram": "No Telegram found",
    "error": null
  }
]
```

### POST /api/extract-contacts-sheets
Extract contact information and return in **tab-separated format** perfect for Google Sheets.

**Request Body:** (Same as above)
```json
{
  "domains": [
    "example.com",
    "another-domain.com"
  ]
}
```

**Response Format (Tab-Separated for Google Sheets):**

**Single Domain Response:**
```
request_id	uuid-string	domains_processed	1	processing_time	45000	domain	example.com	api_key_used	Key 1	page_scraped	https://example.com (main + /contact)	email_found	true	total_contacts	5	emails	contact@example.com, info@example.com	phones	+1-555-123-4567, (555) 123-4567	linkedin	https://linkedin.com/company/example	instagram	https://instagram.com/example	facebook	https://facebook.com/example	twitter	https://twitter.com/example	youtube	https://youtube.com/example	tiktok	No TikTok found	pinterest	No Pinterest found	discord	No Discord found	telegram	No Telegram found	error	null
```

**Multiple Domains Response:**
```
request_id	uuid-string	domains_processed	2	processing_time	45000	domain	example.com	api_key_used	Key 1	page_scraped	https://example.com (main + /contact)	email_found	true	total_contacts	5	emails	contact@example.com, info@example.com	phones	+1-555-123-4567, (555) 123-4567	linkedin	https://linkedin.com/company/example	instagram	https://instagram.com/example	facebook	https://facebook.com/example	twitter	https://twitter.com/example	youtube	https://youtube.com/example	tiktok	No TikTok found	pinterest	No Pinterest found	discord	No Discord found	telegram	No Telegram found	error	null
request_id	uuid-string	domains_processed	2	processing_time	45000	domain	test-site.org	api_key_used	Key 2	page_scraped	https://test-site.org	email_found	false	total_contacts	0	emails	No emails found	phones	No phones found	linkedin	No LinkedIn found	instagram	No Instagram found	facebook	No Facebook found	twitter	No Twitter found	youtube	No YouTube found	tiktok	No TikTok found	pinterest	No Pinterest found	discord	No Discord found	telegram	No Telegram found	error	null
```

## Field Descriptions

### Request Fields
- **domains** (array, required): List of domain names to extract contact info from (max 30 domains)

### Response Fields (Single Domain)
- **request_id**: Unique identifier for this request
- **domains_processed**: Number of domains processed
- **processing_time**: Total processing time in milliseconds
- **domain**: The domain that was processed
- **api_key_used**: Name of the API key used for this extraction
- **page_scraped**: The actual URL that was scraped (main page, /contact, or /contact-us)
- **email_found**: Boolean indicating if any emails were found
- **total_contacts**: Total number of contact methods found (emails + phones)
- **emails**: Comma-separated list of email addresses found
- **phones**: Comma-separated list of phone numbers found
- **linkedin**: Comma-separated list of LinkedIn URLs found
- **instagram**: Comma-separated list of Instagram URLs found
- **facebook**: Comma-separated list of Facebook URLs found
- **twitter**: Comma-separated list of Twitter URLs found
- **youtube**: Comma-separated list of YouTube URLs found
- **tiktok**: Comma-separated list of TikTok URLs found
- **pinterest**: Comma-separated list of Pinterest URLs found
- **discord**: Comma-separated list of Discord URLs found
- **telegram**: Comma-separated list of Telegram URLs found
- **error**: Error message if extraction failed (null if successful)

### Response Fields (Multiple Domains)
When processing multiple domains, the response is an array where each object contains all the fields listed above.

## Extraction Logic

The API uses intelligent page checking with **data aggregation** to maximize contact discovery:

1. **First**: Scrapes the main domain (e.g., `example.com`) and collects all contact data
2. **If no emails found**: Scrapes `/contact` page (e.g., `example.com/contact`) and **combines** data with main page
3. **If still no emails**: Scrapes `/contact-us` page (e.g., `example.com/contact-us`) and **combines** data from all pages
4. **Stops immediately** when emails are found on any page, but **returns aggregated data** from all checked pages

### **Data Aggregation Example:**
- **Main page**: Found Instagram, LinkedIn, phones, but NO email
- **/contact page**: Found email, but NO Instagram/LinkedIn
- **Result**: Returns email from `/contact` + Instagram/LinkedIn from main page

This ensures you get the **maximum contact information** while still being efficient with API usage.

## Google Sheets Integration

The completely flat JSON format is designed for easy integration with Make.com and Google Sheets:

### Make.com Setup

**Option 1: JSON Format (`/api/extract-contacts`)**
1. **HTTP Request Module**:
   - Method: `POST`
   - URL: `https://websites-contact-finder.onrender.com/api/extract-contacts`
   - Headers: `Authorization: Bearer YOUR_WEBHOOK_TOKEN`
   - Body: JSON with domains array

2. **Google Sheets Module**:
   - For single domain: Use the response object directly
   - For multiple domains: Use the response array (each item maps to one row)
   - All fields are already comma-separated for easy parsing

**Option 2: Tab-Separated Format (`/api/extract-contacts-sheets`) - Recommended for Google Sheets**
1. **HTTP Request Module**:
   - Method: `POST`
   - URL: `https://websites-contact-finder.onrender.com/api/extract-contacts-sheets`
   - Headers: `Authorization: Bearer YOUR_WEBHOOK_TOKEN`
   - Body: JSON with domains array

2. **Google Sheets Module**:
   - Copy the tab-separated response directly
   - Paste into Google Sheets - it will automatically separate into columns
   - Perfect for direct copy-paste workflow

### Google Sheets Structure
| A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P | Q | R | S | T |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| request_id | domains_processed | processing_time | domain | api_key_used | page_scraped | email_found | total_contacts | emails | phones | linkedin | instagram | facebook | twitter | youtube | tiktok | pinterest | discord | telegram | error |

## Rate Limits
- **10 requests per minute** per IP address
- **Maximum 30 domains** per request
- **Automatic API key rotation** for optimal usage

## Error Handling

### Common Error Responses
```json
{
  "error": "Too many requests",
  "message": "Rate limit exceeded. Please try again later."
}
```

```json
{
  "error": "No API keys",
  "message": "Please add at least one Apify API key"
}
```

```json
{
  "error": "Invalid request",
  "message": "Domains array is required and must not be empty"
}
```

## Example Usage

### cURL Examples

**JSON Format:**
```bash
curl -X POST https://websites-contact-finder.onrender.com/api/extract-contacts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_WEBHOOK_TOKEN" \
  -d '{
    "domains": ["example.com", "test-site.org"]
  }'
```

**Tab-Separated Format (Google Sheets):**
```bash
curl -X POST https://websites-contact-finder.onrender.com/api/extract-contacts-sheets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_WEBHOOK_TOKEN" \
  -d '{
    "domains": ["example.com", "test-site.org"]
  }'
```

### JavaScript Examples

**JSON Format:**
```javascript
const response = await fetch('https://websites-contact-finder.onrender.com/api/extract-contacts', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_WEBHOOK_TOKEN'
  },
  body: JSON.stringify({
    domains: ['example.com', 'test-site.org']
  })
});

const data = await response.json();
console.log(data); // Flat object(s) for JSON processing
```

**Tab-Separated Format (Google Sheets):**
```javascript
const response = await fetch('https://websites-contact-finder.onrender.com/api/extract-contacts-sheets', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_WEBHOOK_TOKEN'
  },
  body: JSON.stringify({
    domains: ['example.com', 'test-site.org']
  })
});

const data = await response.text();
console.log(data); // Tab-separated string ready for Google Sheets
```

## Testing

### Health Check
```
GET https://websites-contact-finder.onrender.com/api/health
```

### Test Endpoint
```
GET https://websites-contact-finder.onrender.com/api/test
```

## Support
For issues or questions, check the application dashboard or contact support through the web interface.
