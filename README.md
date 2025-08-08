# Websites Contact Finder

A powerful web application that extracts contact information from domains using Apify's contact info scraper. Features intelligent API key rotation to maximize your Apify credits and avoid rate limits.

## 🚀 Features

- **Smart Contact Extraction**: Automatically tries main page, `/contact`, and `/contact-us` for each domain
- **API Key Rotation**: Intelligently rotates between multiple Apify API keys
- **Make.com Integration**: Ready-to-use webhook for automation
- **Comprehensive Data**: Extracts emails, phones, and all social media profiles
- **Real-time Analytics**: Track extraction performance and API key usage
- **Secure Authentication**: Webhook token-based authentication

## 📋 Prerequisites

- Node.js 18+ 
- Supabase account
- Apify account with API keys
- Render account (for deployment)

## 🛠️ Local Development

### 1. Clone and Install
```bash
git clone <your-repo-url>
cd websites-contact-finder
npm install
```

### 2. Environment Setup
Create a `.env` file in the root directory:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
VITE_API_BASE_URL=http://localhost:3001
```

### 3. Database Setup
Run the migration queries in your Supabase SQL editor:
```sql
-- Run all migration files from supabase/migrations/
-- This will create the necessary tables and functions
```

### 4. Start Development Server
```bash
npm run dev
```

The application will be available at:
- Frontend: http://localhost:5174
- Backend API: http://localhost:3001

## 🚀 Deployment to Render

### 1. Prepare Your Repository
Make sure your code is pushed to a Git repository (GitHub, GitLab, etc.).

### 2. Connect to Render
1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" → "Web Service"
3. Connect your Git repository
4. Configure the service:

**Basic Settings:**
- **Name**: `websites-contact-finder`
- **Environment**: `Node`
- **Build Command**: `npm install && npm run build`
- **Start Command**: `node server/index.js`

**Environment Variables:**
```
NODE_ENV=production
PORT=3001
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
VITE_API_BASE_URL=https://websites-contact-finder.onrender.com
```

### 3. Deploy
Click "Create Web Service" and wait for the deployment to complete.

## 🔧 API Endpoints

### Main Endpoint
- **POST** `/api/extract-contacts` - Extract contact information from domains

### Utility Endpoints
- **GET** `/api/health` - Health check
- **GET** `/api/test` - API information
- **POST** `/api/test-webhook` - Test webhook functionality
- **POST** `/api/test-apify` - Test Apify API key
- **GET** `/api/debug/keys` - Debug API keys (requires auth)

## 📊 Webhook Usage

### Request Format
```json
{
  "domains": ["example.com", "test.com", "sample.com"]
}
```

### Response Format
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
      "emails": ["contact@example.com"],
      "phones": ["+1-555-123-4567"],
      "social_media": {
        "linkedIns": ["https://linkedin.com/company/example"],
        "facebooks": ["https://facebook.com/example"],
        "twitters": ["https://twitter.com/example"]
      },
      "email_found": true,
      "total_contacts": 4
    }
  ]
}
```

## 🔐 Authentication

All API requests require a Bearer token:
```
Authorization: Bearer YOUR_WEBHOOK_TOKEN
```

Your webhook token is available in the dashboard under the Webhook section.

## 📈 Rate Limits

- **10 requests per minute** per IP address
- **Maximum 30 domains** per request
- **Maximum 3 API keys** per user

## 🔄 Extraction Logic

The system automatically tries multiple pages for each domain:

1. **Main Page**: `https://example.com`
2. **Contact Page**: `https://example.com/contact`
3. **Contact-Us Page**: `https://example.com/contact-us`

Returns the first page where contact information is found.

## 🎯 Make.com Integration

### Setup Steps
1. Create a new scenario in Make.com
2. Add Google Sheets "Search Rows" module
3. Add HTTP "Make a Request" module
4. Configure with your webhook URL and token
5. Map domains from sheet to request body
6. Add another Google Sheets module to write results back

### Example Configuration
```json
{
  "url": "https://websites-contact-finder.onrender.com/api/extract-contacts",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer YOUR_WEBHOOK_TOKEN",
    "Content-Type": "application/json"
  },
  "body": {
    "domains": ["{{1.domain}}"]
  }
}
```

## 🛠️ Troubleshooting

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

## 📁 Project Structure

```
websites-contact-finder/
├── src/
│   ├── components/          # React components
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utility libraries
│   └── main.tsx           # App entry point
├── server/
│   └── index.js           # Express server
├── supabase/
│   └── migrations/        # Database migrations
├── render.yaml            # Render deployment config
└── package.json           # Dependencies and scripts
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support, please check:
1. The troubleshooting section above
2. The webhook documentation in `WEBHOOK_DOCUMENTATION.md`
3. Your Supabase and Apify account status

---

**Built with ❤️ using React, Express, Supabase, and Apify** 