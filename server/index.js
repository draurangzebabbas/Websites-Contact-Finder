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

// Function to call Apify Contact Info Scraper with smart page checking
async function callContactInfoScraper(domain, apiKey, specificPath = '') {
  const baseUrl = `https://${domain}`;
  const url = specificPath ? `${baseUrl}${specificPath}` : baseUrl;
  
  console.log(`🔍 Scraping: ${url}`);
  
  const input = {
    considerChildFrames: false,
    maxDepth: 0,
    maxRequests: 1,
    sameDomain: true,
    startUrls: [
      {
        url: url,
        method: "GET"
      }
    ],
    useBrowser: true
  };

  try {
    const response = await fetch(`https://api.apify.com/v2/acts/vdrmota~contact-info-scraper/runs?token=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Apify API error for ${url}:`, errorText);
      
      if (response.status === 401) {
        throw new Error('Invalid API key');
      } else if (response.status === 429) {
        throw new Error('Rate limited - please try again later');
      } else if (response.status === 402) {
        throw new Error('Insufficient credits');
      } else {
        throw new Error(`Apify API error: ${response.status} - ${errorText}`);
      }
    }

    const runData = await response.json();
    console.log(`✅ Apify run started for ${url}:`, runData.id);

    // Wait for completion
    let dataset = null;
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds timeout

    while (!dataset && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;

      try {
        const statusResponse = await fetch(`https://api.apify.com/v2/acts/vdrmota~contact-info-scraper/runs/${runData.id}?token=${apiKey}`);
        const statusData = await statusResponse.json();

        if (statusData.status === 'SUCCEEDED') {
          const datasetResponse = await fetch(`https://api.apify.com/v2/acts/vdrmota~contact-info-scraper/runs/${runData.id}/dataset/items?token=${apiKey}`);
          dataset = await datasetResponse.json();
          console.log(`✅ Apify run completed for ${url}:`, dataset.length, 'items');
        } else if (statusData.status === 'FAILED') {
          throw new Error(`Apify run failed: ${statusData.meta?.errorMessage || 'Unknown error'}`);
        }
      } catch (error) {
        console.error(`❌ Error checking run status for ${url}:`, error.message);
        if (attempts >= maxAttempts) {
          throw error;
        }
      }
    }

    if (!dataset) {
      throw new Error('Apify run timed out');
    }

    // Process results
    const result = dataset[0] || {};
    
    return {
      page_scraped: url,
      domain: domain,
      emails: result.emails || [],
      phones: result.phones || [],
      linkedIns: result.linkedIns || [],
      twitters: result.twitters || [],
      instagrams: result.instagrams || [],
      facebooks: result.facebooks || [],
      youtubes: result.youtubes || [],
      tiktoks: result.tiktoks || [],
      pinterests: result.pinterests || [],
      discords: result.discords || [],
      snapchats: result.snapchats || [],
      threads: result.threads || [],
      telegrams: result.telegrams || []
    };

  } catch (error) {
    console.error(`❌ Error scraping ${url}:`, error.message);
    throw error;
  }
}

// Enhanced function to call Contact Info Scraper with data aggregation
async function callContactInfoScraperWithAggregation(domain, apiKey) {
  console.log(`🔍 Starting smart page checking for ${domain}`);
  
  // Initialize aggregated data
  let aggregatedData = {
    page_scraped: `https://${domain}`,
    domain: domain,
    emails: [],
    phones: [],
    linkedIns: [],
    twitters: [],
    instagrams: [],
    facebooks: [],
    youtubes: [],
    tiktoks: [],
    pinterests: [],
    discords: [],
    snapchats: [],
    threads: [],
    telegrams: []
  };

  // Step 1: Check main domain
  try {
    console.log(`📄 Checking main page: ${domain}`);
    const mainPageData = await callContactInfoScraper(domain, apiKey);
    
    // Aggregate data from main page
    aggregatedData.emails = [...new Set([...aggregatedData.emails, ...mainPageData.emails])];
    aggregatedData.phones = [...new Set([...aggregatedData.phones, ...mainPageData.phones])];
    aggregatedData.linkedIns = [...new Set([...aggregatedData.linkedIns, ...mainPageData.linkedIns])];
    aggregatedData.twitters = [...new Set([...aggregatedData.twitters, ...mainPageData.twitters])];
    aggregatedData.instagrams = [...new Set([...aggregatedData.instagrams, ...mainPageData.instagrams])];
    aggregatedData.facebooks = [...new Set([...aggregatedData.facebooks, ...mainPageData.facebooks])];
    aggregatedData.youtubes = [...new Set([...aggregatedData.youtubes, ...mainPageData.youtubes])];
    aggregatedData.tiktoks = [...new Set([...aggregatedData.tiktoks, ...mainPageData.tiktoks])];
    aggregatedData.pinterests = [...new Set([...aggregatedData.pinterests, ...mainPageData.pinterests])];
    aggregatedData.discords = [...new Set([...aggregatedData.discords, ...mainPageData.discords])];
    aggregatedData.snapchats = [...new Set([...aggregatedData.snapchats, ...mainPageData.snapchats])];
    aggregatedData.threads = [...new Set([...aggregatedData.threads, ...mainPageData.threads])];
    aggregatedData.telegrams = [...new Set([...aggregatedData.telegrams, ...mainPageData.telegrams])];
    
    console.log(`✅ Main page data aggregated for ${domain}:`, {
      emails: aggregatedData.emails.length,
      phones: aggregatedData.phones.length,
      social_media: aggregatedData.linkedIns.length + aggregatedData.facebooks.length + aggregatedData.twitters.length
    });
    
    // If we found emails on main page, we're done!
    if (aggregatedData.emails.length > 0) {
      console.log(`📧 Emails found on main page for ${domain}, stopping here`);
      return aggregatedData;
    }
  } catch (error) {
    console.error(`❌ Error scraping main page for ${domain}:`, error.message);
  }

  // Step 2: Check /contact page if no emails found
  try {
    console.log(`📄 Checking /contact page: ${domain}/contact`);
    const contactPageData = await callContactInfoScraper(domain, apiKey, '/contact');
    
    // Update page_scraped to show we checked multiple pages
    aggregatedData.page_scraped = `https://${domain} (main + /contact)`;
    
    // Aggregate data from contact page
    aggregatedData.emails = [...new Set([...aggregatedData.emails, ...contactPageData.emails])];
    aggregatedData.phones = [...new Set([...aggregatedData.phones, ...contactPageData.phones])];
    aggregatedData.linkedIns = [...new Set([...aggregatedData.linkedIns, ...contactPageData.linkedIns])];
    aggregatedData.twitters = [...new Set([...aggregatedData.twitters, ...contactPageData.twitters])];
    aggregatedData.instagrams = [...new Set([...aggregatedData.instagrams, ...contactPageData.instagrams])];
    aggregatedData.facebooks = [...new Set([...aggregatedData.facebooks, ...contactPageData.facebooks])];
    aggregatedData.youtubes = [...new Set([...aggregatedData.youtubes, ...contactPageData.youtubes])];
    aggregatedData.tiktoks = [...new Set([...aggregatedData.tiktoks, ...contactPageData.tiktoks])];
    aggregatedData.pinterests = [...new Set([...aggregatedData.pinterests, ...contactPageData.pinterests])];
    aggregatedData.discords = [...new Set([...aggregatedData.discords, ...contactPageData.discords])];
    aggregatedData.snapchats = [...new Set([...aggregatedData.snapchats, ...contactPageData.snapchats])];
    aggregatedData.threads = [...new Set([...aggregatedData.threads, ...contactPageData.threads])];
    aggregatedData.telegrams = [...new Set([...aggregatedData.telegrams, ...contactPageData.telegrams])];
    
    console.log(`✅ /contact page data aggregated for ${domain}:`, {
      emails: aggregatedData.emails.length,
      phones: aggregatedData.phones.length,
      social_media: aggregatedData.linkedIns.length + aggregatedData.facebooks.length + aggregatedData.twitters.length
    });
    
    // If we found emails on contact page, we're done!
    if (aggregatedData.emails.length > 0) {
      console.log(`📧 Emails found on /contact page for ${domain}, stopping here`);
      return aggregatedData;
    }
  } catch (error) {
    console.error(`❌ Error scraping /contact page for ${domain}:`, error.message);
  }

  // Step 3: Check /contact-us page if still no emails found
  try {
    console.log(`📄 Checking /contact-us page: ${domain}/contact-us`);
    const contactUsPageData = await callContactInfoScraper(domain, apiKey, '/contact-us');
    
    // Update page_scraped to show we checked all pages
    aggregatedData.page_scraped = `https://${domain} (main + /contact + /contact-us)`;
    
    // Aggregate data from contact-us page
    aggregatedData.emails = [...new Set([...aggregatedData.emails, ...contactUsPageData.emails])];
    aggregatedData.phones = [...new Set([...aggregatedData.phones, ...contactUsPageData.phones])];
    aggregatedData.linkedIns = [...new Set([...aggregatedData.linkedIns, ...contactUsPageData.linkedIns])];
    aggregatedData.twitters = [...new Set([...aggregatedData.twitters, ...contactUsPageData.twitters])];
    aggregatedData.instagrams = [...new Set([...aggregatedData.instagrams, ...contactUsPageData.instagrams])];
    aggregatedData.facebooks = [...new Set([...aggregatedData.facebooks, ...contactUsPageData.facebooks])];
    aggregatedData.youtubes = [...new Set([...aggregatedData.youtubes, ...contactUsPageData.youtubes])];
    aggregatedData.tiktoks = [...new Set([...aggregatedData.tiktoks, ...contactUsPageData.tiktoks])];
    aggregatedData.pinterests = [...new Set([...aggregatedData.pinterests, ...contactUsPageData.pinterests])];
    aggregatedData.discords = [...new Set([...aggregatedData.discords, ...contactUsPageData.discords])];
    aggregatedData.snapchats = [...new Set([...aggregatedData.snapchats, ...contactUsPageData.snapchats])];
    aggregatedData.threads = [...new Set([...aggregatedData.threads, ...contactUsPageData.threads])];
    aggregatedData.telegrams = [...new Set([...aggregatedData.telegrams, ...contactUsPageData.telegrams])];
    
    console.log(`✅ /contact-us page data aggregated for ${domain}:`, {
      emails: aggregatedData.emails.length,
      phones: aggregatedData.phones.length,
      social_media: aggregatedData.linkedIns.length + aggregatedData.facebooks.length + aggregatedData.twitters.length
    });
  } catch (error) {
    console.error(`❌ Error scraping /contact-us page for ${domain}:`, error.message);
  }

  console.log(`🎯 Final aggregated data for ${domain}:`, {
    emails: aggregatedData.emails.length,
    phones: aggregatedData.phones.length,
    social_media: aggregatedData.linkedIns.length + aggregatedData.facebooks.length + aggregatedData.twitters.length,
    pages_checked: aggregatedData.page_scraped
  });

  return aggregatedData;
}

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
          let contactResult = await callContactInfoScraperWithAggregation(domain, currentKey.api_key);
          
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
    
    // Return flat JSON without results array wrapper for Make.com
    if (finalResults.length === 1) {
      // Single domain - return the result directly
      res.json({
        request_id: requestId,
        domains_processed: domains.length,
        processing_time: processingTime,
        ...finalResults[0]  // Spread the result object directly
      });
    } else {
      // Multiple domains - return array of flat objects
      const flatResults = finalResults.map(result => ({
        request_id: requestId,
        domains_processed: domains.length,
        processing_time: processingTime,
        ...result  // Spread each result object
      }));
      res.json(flatResults);
    }

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
    const testResult = await callContactInfoScraperWithAggregation(testDomain, testKey.api_key);
    
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

// New endpoint for tab-separated output (Google Sheets friendly)
app.post('/api/extract-contacts-sheets', rateLimitMiddleware, authMiddleware, async (req, res) => {
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
      keywords: domains,
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
          let contactResult = await callContactInfoScraperWithAggregation(domain, currentKey.api_key);
          
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

    // Create tab-separated output for Google Sheets
    const sheetsOutput = results.map(result => {
      const flatResult = {
        request_id: requestId,
        domains_processed: domains.length,
        processing_time: processingTime,
        domain: result.domain,
        api_key_used: result.api_key_used,
        page_scraped: result.page_scraped,
        email_found: result.email_found,
        total_contacts: result.total_contacts,
        emails: result.emails?.join(', ') || 'No emails found',
        phones: result.phones?.join(', ') || 'No phones found',
        linkedin: result.linkedIns?.join(', ') || 'No LinkedIn found',
        instagram: result.instagrams?.join(', ') || 'No Instagram found',
        facebook: result.facebooks?.join(', ') || 'No Facebook found',
        twitter: result.twitters?.join(', ') || 'No Twitter found',
        youtube: result.youtubes?.join(', ') || 'No YouTube found',
        tiktok: result.tiktoks?.join(', ') || 'No TikTok found',
        pinterest: result.pinterests?.join(', ') || 'No Pinterest found',
        discord: result.discords?.join(', ') || 'No Discord found',
        telegram: result.telegrams?.join(', ') || 'No Telegram found',
        error: result.error || null
      };

      // Convert to tab-separated string
      const fields = [
        'request_id', 'domains_processed', 'processing_time', 'domain', 'api_key_used',
        'page_scraped', 'email_found', 'total_contacts', 'emails', 'phones',
        'linkedin', 'instagram', 'facebook', 'twitter', 'youtube', 'tiktok',
        'pinterest', 'discord', 'telegram', 'error'
      ];

      return fields.map(field => flatResult[field]).join('\t');
    });

    // Set content type to plain text
    res.setHeader('Content-Type', 'text/plain');
    
    if (results.length === 1) {
      // Single domain - return one line
      res.send(sheetsOutput[0]);
    } else {
      // Multiple domains - return multiple lines
      res.send(sheetsOutput.join('\n'));
    }

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
