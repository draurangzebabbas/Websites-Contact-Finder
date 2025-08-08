import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

// Load environment variables
dotenv.config();

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Build frontend in production if dist doesn't exist
if (process.env.NODE_ENV === 'production') {
  try {
    const fs = require('fs');
    const distPath = path.join(__dirname, '../dist');
    
    if (!fs.existsSync(distPath)) {
      console.log('🔨 Building frontend for production...');
      execSync('npm run build', { stdio: 'inherit' });
      console.log('✅ Frontend built successfully');
    }
  } catch (error) {
    console.warn('⚠️ Frontend build failed, continuing with server only:', error.message);
  }
}

// Initialize Supabase client with service role key for backend operations
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

// Use service role key for backend operations to bypass RLS
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const app = express();
const PORT = process.env.PORT || 3001;

// Rate limiter
const rateLimiter = new RateLimiterMemory({
  keyGenerator: (req) => req.ip,
  points: 10, // 10 requests
  duration: 60, // per 60 seconds
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static files from the React build
app.use(express.static(path.join(__dirname, '../dist')));

// Rate limiting middleware
const rateLimitMiddleware = async (req, res, next) => {
  try {
    await rateLimiter.consume(req.ip);
    next();
  } catch (rejRes) {
    res.status(429).json({ 
      error: 'Too many requests', 
      message: 'Rate limit exceeded. Please try again later.' 
    });
  }
};

// Auth middleware
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.split(' ')[1];
    
    // Find user by webhook token
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, full_name, webhook_token')
      .eq('webhook_token', token)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid authorization token' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Contact Info Scraper API integration
const callContactInfoScraper = async (domain, apiKey, pagePath = '') => {
  console.log(`🔍 Scraping contact info for domain: ${domain}${pagePath} with API key: ${apiKey.substring(0, 8)}...`);
  
  try {
    // Construct the URL to scrape
    const urlToScrape = `https://${domain}${pagePath}`;
    console.log(`📡 Starting Contact Info Scraper for URL: ${urlToScrape}`);
    
    // Start the contact info scraper actor
    const scraperResponse = await fetch('https://api.apify.com/v2/acts/vdrmota~contact-info-scraper/runs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        "considerChildFrames": false,
        "maxDepth": 0,
        "maxRequests": 1,
        "sameDomain": true,
        "startUrls": [
          {
            "url": urlToScrape,
            "method": "GET"
          }
        ],
        "useBrowser": true
      })
    });

    console.log(`📊 Scraper Response Status: ${scraperResponse.status} ${scraperResponse.statusText}`);

    if (!scraperResponse.ok) {
      const errorText = await scraperResponse.text();
      console.error(`❌ Contact Info Scraper API Error: ${errorText}`);
      throw new Error(`Contact Info Scraper API failed: ${scraperResponse.status} ${scraperResponse.statusText}`);
    }

    // Get raw response text first
    const scraperResponseText = await scraperResponse.text();
    console.log(`📊 Raw scraper response length: ${scraperResponseText.length}`);
    
    if (!scraperResponseText || scraperResponseText.trim() === '') {
      throw new Error('Empty response from Apify Contact Info Scraper API');
    }

    let scraperRunData;
    try {
      scraperRunData = JSON.parse(scraperResponseText);
    } catch (parseError) {
      console.error(`❌ Scraper JSON parse error: ${parseError.message}`);
      throw new Error(`Invalid JSON response from Apify Contact Info Scraper: ${parseError.message}`);
    }

    const runId = scraperRunData.data?.id;
    console.log(`📊 Scraper run ID: ${runId}`);

    if (!runId) {
      console.error(`❌ No run ID found in scraper response:`, scraperRunData);
      throw new Error('No run ID received from Apify Contact Info Scraper API');
    }

    // Wait for scraper run to complete
    console.log(`⏳ Waiting for scraper run to complete...`);
    let scraperAttempts = 0;
    const maxScraperAttempts = 60; // Wait up to 5 minutes

    while (scraperAttempts < maxScraperAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      scraperAttempts++;

      console.log(`📊 Checking scraper run status (attempt ${scraperAttempts}/${maxScraperAttempts})...`);
      const statusResponse = await fetch(`https://api.apify.com/v2/acts/vdrmota~contact-info-scraper/runs/${runId}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      if (!statusResponse.ok) {
        console.error(`❌ Scraper Status Error: ${statusResponse.status}`);
        continue;
      }

      const statusData = await statusResponse.json();
      console.log(`📊 Scraper run status: ${statusData.data?.status} (attempt ${scraperAttempts}/${maxScraperAttempts})`);

      if (statusData.data?.status === 'SUCCEEDED') {
        console.log(`✅ Scraper run completed successfully`);
        break;
      } else if (statusData.data?.status === 'FAILED') {
        throw new Error(`Scraper run failed: ${statusData.data?.meta?.errorMessage || 'Unknown error'}`);
      }
    }

    if (scraperAttempts >= maxScraperAttempts) {
      throw new Error('Scraper run timed out after 5 minutes');
    }

    // Get dataset ID from completed run
    const finalStatusResponse = await fetch(`https://api.apify.com/v2/acts/vdrmota~contact-info-scraper/runs/${runId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    const finalStatusData = await finalStatusResponse.json();
    const datasetId = finalStatusData.data?.defaultDatasetId;
    console.log(`📊 Scraper dataset ID: ${datasetId}`);

    if (!datasetId) {
      console.error(`❌ No dataset ID found in completed scraper run:`, finalStatusData);
      throw new Error('No dataset ID received from completed Apify Contact Info Scraper run');
    }

    // Wait for dataset to populate
    console.log(`⏳ Initial wait for scraper dataset to populate...`);
    await new Promise(resolve => setTimeout(resolve, 20000)); // Wait 20 seconds

    // Poll dataset until we have results
    console.log(`⏳ Polling scraper dataset for results...`);
    let scraperData = null;
    let datasetAttempts = 0;
    const maxDatasetAttempts = 60; // Wait up to 5 minutes

    while (datasetAttempts < maxDatasetAttempts) {
      console.log(`📊 Checking scraper dataset (attempt ${datasetAttempts + 1}/${maxDatasetAttempts})...`);
      const scraperResultsResponse = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      if (!scraperResultsResponse.ok) {
        console.error(`❌ Scraper Results Error: ${scraperResultsResponse.status}`);
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
        datasetAttempts++;
        continue;
      }

      scraperData = await scraperResultsResponse.json();
      console.log(`📊 Scraper dataset has ${scraperData.length} items`);

      if (scraperData && scraperData.length > 0) {
        console.log(`✅ Scraper results received: ${scraperData.length} items`);
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      datasetAttempts++;
    }

    if (!scraperData || scraperData.length === 0) {
      throw new Error('Scraper dataset is empty after 5 minutes of polling');
    }

    console.log(`✅ Contact info data received for: ${domain}${pagePath}`);
    console.log(`📊 Scraper data structure:`, Object.keys(scraperData[0] || {}));

    // Extract contact information from the first result
    const contactInfo = scraperData[0] || {};
    
    return {
      domain: domain,
      page_scraped: urlToScrape,
      emails: contactInfo.emails || [],
      phones: contactInfo.phones || [],
      linkedIns: contactInfo.linkedIns || [],
      twitters: contactInfo.twitters || [],
      instagrams: contactInfo.instagrams || [],
      facebooks: contactInfo.facebooks || [],
      youtubes: contactInfo.youtubes || [],
      tiktoks: contactInfo.tiktoks || [],
      pinterests: contactInfo.pinterests || [],
      discords: contactInfo.discords || [],
      snapchats: contactInfo.snapchats || [],
      threads: contactInfo.threads || [],
      telegrams: contactInfo.telegrams || []
    };

  } catch (error) {
    console.error(`❌ Contact Info Scraper API error for ${domain}:`, error.message);
    
    // Provide more specific error messages
    if (error.message.includes('401')) {
      throw new Error('Invalid API key - please check your Apify API key');
    } else if (error.message.includes('429')) {
      throw new Error('Rate limit exceeded - API key may be out of credits');
    } else if (error.message.includes('404')) {
      throw new Error('Apify actor not found - please check actor configuration');
    } else {
      throw new Error(`Contact Info Scraper API error: ${error.message}`);
    }
  }
};

// Main contact info extraction endpoint
app.post('/api/extract-contacts', rateLimitMiddleware, authMiddleware, async (req, res) => {
  const startTime = Date.now();
  const requestId = uuidv4();
  
  try {
    const { domains } = req.body;
    
    if (!domains || !Array.isArray(domains) || domains.length === 0) {
      return res.status(400).json({ 
        error: 'Invalid request', 
        message: 'Domains array is required and must not be empty' 
      });
    }

    if (domains.length > 30) {
      return res.status(400).json({ 
        error: 'Too many domains', 
        message: 'Maximum 30 domains allowed per request' 
      });
    }

    // Log the request
    await supabase.from('analysis_logs').insert({
      user_id: req.user.id,
      request_id: requestId,
      keywords: domains, // Reusing keywords field for domains
      status: 'pending'
    });

    // Get user's API keys
    const { data: apiKeys, error: keysError } = await supabase
      .from('api_keys')
      .select('*')
      .eq('user_id', req.user.id)
      .in('status', ['active', 'failed', 'rate_limited'])
      .order('last_used', { ascending: true, nullsFirst: true });

    if (keysError || !apiKeys || apiKeys.length === 0) {
      await supabase.from('analysis_logs').update({
        status: 'failed',
        error_message: 'No API keys available',
        processing_time: Date.now() - startTime
      }).eq('request_id', requestId);

      return res.status(400).json({ 
        error: 'No API keys', 
        message: 'Please add at least one Apify API key' 
      });
    }

    console.log(`🔑 Found ${apiKeys.length} API keys for user ${req.user.id}`);

    const results = [];
    const usedKeys = [];
    let currentKeyIndex = 0;

    // Process each domain
    for (const domain of domains) {
      let success = false;
      let attempts = 0;
      const maxAttempts = Math.min(3, apiKeys.length);

      while (!success && attempts < maxAttempts) {
        const currentKey = apiKeys[currentKeyIndex % apiKeys.length];
        
        try {
          // Try main domain first
          let contactResult = await callContactInfoScraper(domain, currentKey.api_key);
          
          // If no emails found, try /contact
          if (contactResult.emails.length === 0) {
            console.log(`📧 No emails found on main page, trying /contact for ${domain}`);
            contactResult = await callContactInfoScraper(domain, currentKey.api_key, '/contact');
          }
          
          // If still no emails found, try /contact-us
          if (contactResult.emails.length === 0) {
            console.log(`📧 No emails found on /contact, trying /contact-us for ${domain}`);
            contactResult = await callContactInfoScraper(domain, currentKey.api_key, '/contact-us');
          }

          const result = {
            domain: domain,
            api_key_used: currentKey.key_name,
            page_scraped: contactResult.page_scraped,
            emails: contactResult.emails,
            phones: contactResult.phones,
            linkedIns: contactResult.linkedIns,
            twitters: contactResult.twitters,
            instagrams: contactResult.instagrams,
            facebooks: contactResult.facebooks,
            youtubes: contactResult.youtubes,
            tiktoks: contactResult.tiktoks,
            pinterests: contactResult.pinterests,
            discords: contactResult.discords,
            snapchats: contactResult.snapchats,
            threads: contactResult.threads,
            telegrams: contactResult.telegrams,
            email_found: contactResult.emails.length > 0,
            total_contacts: contactResult.emails.length + contactResult.phones.length
          };
          
          console.log(`✅ Created result for ${domain}:`, {
            domain: result.domain,
            api_key_used: result.api_key_used,
            email_found: result.email_found,
            total_contacts: result.total_contacts
          });
          
          results.push(result);

          // Update key usage
          await supabase.from('api_keys').update({
            last_used: new Date().toISOString(),
            failure_count: 0,
            status: 'active'
          }).eq('id', currentKey.id);

          usedKeys.push(currentKey.id);
          success = true;
          console.log(`✅ Successfully used API key: ${currentKey.key_name}`);
          
        } catch (error) {
          console.error(`❌ Error with API key ${currentKey.key_name}:`, error.message);
          
          // Check if it's a rate limit, credit issue, or invalid key
          const isRateLimit = error.message.includes('rate') || error.message.includes('credit') || error.message.includes('429');
          const isInvalidKey = error.message.includes('Invalid API key') || error.message.includes('401');
          
          if (isRateLimit) {
            await supabase.from('api_keys').update({
              status: 'rate_limited',
              last_failed: new Date().toISOString(),
              failure_count: currentKey.failure_count + 1
            }).eq('id', currentKey.id);
            console.log(`⚠️ Marked API key as rate limited: ${currentKey.key_name}`);
          } else if (isInvalidKey) {
            await supabase.from('api_keys').update({
              status: 'failed',
              last_failed: new Date().toISOString(),
              failure_count: currentKey.failure_count + 1
            }).eq('id', currentKey.id);
            console.log(`❌ Marked API key as failed: ${currentKey.key_name}`);
          } else {
            await supabase.from('api_keys').update({
              status: 'failed',
              last_failed: new Date().toISOString(),
              failure_count: currentKey.failure_count + 1
            }).eq('id', currentKey.id);
            console.log(`⚠️ Marked API key as failed: ${currentKey.key_name}`);
          }

          attempts++;
          currentKeyIndex++;
        }
      }

      if (!success) {
        // If all keys failed for this domain, add a failure result
        const errorResult = {
          domain: domain,
          api_key_used: null,
          error: 'All API keys failed or rate limited',
          email_found: false,
          total_contacts: 0
        };
        
        console.log(`❌ Adding error result for ${domain}:`, errorResult);
        results.push(errorResult);
      }
    }

    const processingTime = Date.now() - startTime;

    // Update the log with results
    await supabase.from('analysis_logs').update({
      status: 'completed',
      results: results,
      api_keys_used: usedKeys,
      processing_time: processingTime
    }).eq('request_id', requestId);

    const finalResults = results.map(result => {
      // Create flat JSON structure for Google Sheets
      return {
        domain: result.domain,
        api_key_used: result.api_key_used,
        page_scraped: result.page_scraped,
        email_found: result.email_found,
        total_contacts: result.total_contacts,
        // Emails as comma-separated string
        emails: result.emails?.join(', ') || 'No emails found',
        // Phones as comma-separated string
        phones: result.phones?.join(', ') || 'No phones found',
        // LinkedIn as comma-separated string
        linkedin: result.linkedIns?.join(', ') || 'No LinkedIn found',
        // Social media as flat fields
        instagram: result.instagrams?.join(', ') || 'No Instagram found',
        facebook: result.facebooks?.join(', ') || 'No Facebook found',
        twitter: result.twitters?.join(', ') || 'No Twitter found',
        youtube: result.youtubes?.join(', ') || 'No YouTube found',
        tiktok: result.tiktoks?.join(', ') || 'No TikTok found',
        pinterest: result.pinterests?.join(', ') || 'No Pinterest found',
        discord: result.discords?.join(', ') || 'No Discord found',
        telegram: result.telegrams?.join(', ') || 'No Telegram found',
        // Error field if any
        error: result.error || null
      };
    });
    
    console.log(`📊 Final response mapping:`, finalResults.map(r => ({
      domain: r.domain,
      api_key_used: r.api_key_used,
      email_found: r.email_found
    })));
    
    res.json({
      request_id: requestId,
      domains_processed: domains.length,
      processing_time: processingTime,
      results: finalResults
    });

  } catch (error) {
    console.error('Contact extraction error:', error);
    
    const processingTime = Date.now() - startTime;
    
    // Update log with error
    await supabase.from('analysis_logs').update({
      status: 'failed',
      error_message: error.message,
      processing_time: processingTime
    }).eq('request_id', requestId);

    res.status(500).json({ 
      error: 'Extraction failed', 
      message: 'An error occurred during contact extraction' 
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    supabase_connected: !!supabaseUrl
  });
});

// Test endpoint for webhook URL
app.get('/api/test', (req, res) => {
  const baseUrl = process.env.VITE_API_BASE_URL || `http://localhost:${PORT}`;
  const webhookUrl = baseUrl.includes('localhost') 
    ? `http://localhost:${PORT}/api/extract-contacts`
    : `${baseUrl}/api/extract-contacts`;
    
  res.json({ 
    message: 'Contact Info Extractor API is running',
    base_url: baseUrl,
    webhook_url: webhookUrl,
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      health: `${baseUrl}/api/health`,
      extract: webhookUrl,
      test_apify: `${baseUrl}/api/test-apify`,
      debug_keys: `${baseUrl}/api/debug/keys`
    }
  });
});

// Test endpoint for contact extraction
app.post('/api/test-webhook', authMiddleware, async (req, res) => {
  try {
    const { domains = ["example.com"] } = req.body;
    
    console.log(`🧪 Testing webhook with domains:`, domains);
    
    // Get user's API keys
    const { data: apiKeys, error: keysError } = await supabase
      .from('api_keys')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('status', 'active')
      .limit(1);

    if (keysError || !apiKeys || apiKeys.length === 0) {
      return res.status(400).json({ 
        error: 'No active API keys found',
        message: 'Please add at least one active Apify API key'
      });
    }

    const testKey = apiKeys[0];
    console.log(`🧪 Using API key: ${testKey.key_name}`);
    
    // Test with first domain
    const testDomain = domains[0] || "example.com";
    const testResult = await callContactInfoScraper(testDomain, testKey.api_key);
    
    res.json({
      success: true,
      message: 'Webhook test successful',
      test_domain: testDomain,
      api_key_used: testKey.key_name,
      result_summary: {
        domain: testResult.domain,
        page_scraped: testResult.page_scraped,
        emails_found: testResult.emails.length,
        phones_found: testResult.phones.length,
        social_media_found: testResult.linkedIns.length + testResult.facebooks.length + testResult.twitters.length
      },
      full_result: testResult
    });
    
  } catch (error) {
    console.error(`🧪 Webhook test failed:`, error.message);
    res.status(500).json({ 
      error: 'Webhook test failed', 
      details: error.message,
      message: 'Check your API keys and Apify account status'
    });
  }
});

// Debug endpoint to check API keys (requires authentication)
app.get('/api/debug/keys', authMiddleware, async (req, res) => {
  try {
    const { data: apiKeys, error } = await supabase
      .from('api_keys')
      .select('*')
      .eq('user_id', req.user.id);
    
    if (error) {
      return res.status(500).json({ error: 'Database error', details: error });
    }
    
    console.log(`🔍 Debug: Found ${apiKeys.length} API keys for user ${req.user.id}`);
    apiKeys.forEach((key, index) => {
      console.log(`  ${index + 1}. ID: ${key.id}, Name: "${key.key_name}", Status: ${key.status}`);
    });
    
    res.json({
      user_id: req.user.id,
      total_keys: apiKeys.length,
      keys: apiKeys.map(key => ({
        id: key.id,
        name: key.key_name,
        status: key.status,
        provider: key.provider,
        last_used: key.last_used,
        failure_count: key.failure_count,
        created_at: key.created_at
      }))
    });
  } catch (error) {
    console.error('Debug keys error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Test Apify API key endpoint
app.post('/api/test-apify', authMiddleware, async (req, res) => {
  try {
    const { apiKey } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({ error: 'API key required' });
    }
    
    console.log(`🧪 Testing Apify API key: ${apiKey.substring(0, 8)}...`);
    
    // Test with a simple domain using the contact info scraper
    const testResponse = await fetch('https://api.apify.com/v2/acts/vdrmota~contact-info-scraper/run-sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        "considerChildFrames": false,
        "maxDepth": 0,
        "maxRequests": 1,
        "sameDomain": true,
        "startUrls": [
          {
            "url": "https://example.com",
            "method": "GET"
          }
        ],
        "useBrowser": true
      })
    });
    
    const responseText = await testResponse.text();
    const responseData = testResponse.ok ? JSON.parse(responseText) : null;
    
    console.log(`🧪 Test response status: ${testResponse.status}`);
    console.log(`🧪 Test response data:`, responseData);
    
    res.json({
      status: testResponse.status,
      ok: testResponse.ok,
      response_text: responseText,
      response_data: responseData,
      api_key_tested: apiKey.substring(0, 8) + '...'
    });
    
  } catch (error) {
    console.error(`🧪 Test failed:`, error.message);
    res.status(500).json({ error: 'Test failed', details: error.message });
  }
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Start server
app.listen(PORT, () => {
  const baseUrl = process.env.VITE_API_BASE_URL || `http://localhost:${PORT}`;
  const isProduction = baseUrl.includes('onrender.com');
  const webhookUrl = isProduction ? `${baseUrl}/api/extract-contacts` : `http://localhost:${PORT}/api/extract-contacts`;
  
  console.log(`🚀 Contact Info Extractor API server running on port ${PORT}`);
  console.log(`📡 Health check: ${baseUrl}/api/health`);
  console.log(`🔗 Webhook URL: ${webhookUrl}`);
  console.log(`✅ Supabase connected: ${!!supabaseUrl}`);
  console.log(`🌍 Environment: ${isProduction ? 'Production' : 'Development'}`);
});

export default app;
