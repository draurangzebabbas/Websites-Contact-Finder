//Sync Added
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
import fs from 'fs';

// Load environment variables
dotenv.config();

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Build frontend in production if dist doesn't exist
if (process.env.NODE_ENV === 'production') {
  try {
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

// Enhanced function to call Apify Contact Info Scraper with fallback to sync endpoint
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
    // First try the faster sync endpoint
    console.log(`🚀 Trying fast sync endpoint for ${url}`);
    
    const syncResponse = await fetch(`https://api.apify.com/v2/acts/vdrmota~contact-info-scraper/run-sync?token=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input)
    });

    if (syncResponse.ok) {
      const syncData = await syncResponse.json();
      console.log(`✅ Fast sync endpoint successful for ${url}:`, syncData.length, 'items');
      
      // Process results
      const result = syncData[0] || {};
      
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
    } else {
      console.log(`⚠️ Sync endpoint failed (${syncResponse.status}), falling back to async endpoint`);
    }
  } catch (error) {
    console.log(`⚠️ Sync endpoint error, falling back to async endpoint:`, error.message);
  }

  // Fallback to async endpoint if sync fails
  try {
    console.log(`🔄 Using async endpoint fallback for ${url}`);
    
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
    const maxAttempts = 120; // 120 seconds timeout (2 minutes) - increased for slow Apify responses

    while (!dataset && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Check every 2 seconds instead of 1
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
        } else if (statusData.status === 'RUNNING') {
          console.log(`⏳ Apify run still running for ${url} (attempt ${attempts}/${maxAttempts})`);
        }
      } catch (error) {
        console.error(`❌ Error checking run status for ${url}:`, error.message);
        if (attempts >= maxAttempts) {
          throw error;
        }
      }
    }

    if (!dataset) {
      throw new Error(`Apify run timed out after ${maxAttempts * 2} seconds. The website might be slow or Apify servers are overloaded.`);
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
    
    console.log(`📊 Main page raw data for ${domain}:`, {
      emails: mainPageData.emails,
      phones: mainPageData.phones,
      page_scraped: mainPageData.page_scraped
    });
    
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
      aggregatedData.page_scraped = `https://${domain}`;
      return aggregatedData;
    }
  } catch (error) {
    console.error(`❌ Error scraping main page for ${domain}:`, error.message);
  }

  // Step 2: Check /contact page if no emails found
  try {
    console.log(`📄 Checking /contact page: ${domain}/contact`);
    const contactPageData = await callContactInfoScraper(domain, apiKey, '/contact');
    
    console.log(`📊 /contact page raw data for ${domain}:`, {
      emails: contactPageData.emails,
      phones: contactPageData.phones,
      page_scraped: contactPageData.page_scraped
    });
    
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
      aggregatedData.page_scraped = `https://${domain} (main + /contact)`;
      return aggregatedData;
    }
  } catch (error) {
    console.error(`❌ Error scraping /contact page for ${domain}:`, error.message);
  }

  // Step 3: Check /contact-us page if still no emails found
  try {
    console.log(`📄 Checking /contact-us page: ${domain}/contact-us`);
    const contactUsPageData = await callContactInfoScraper(domain, apiKey, '/contact-us');
    
    console.log(`📊 /contact-us page raw data for ${domain}:`, {
      emails: contactUsPageData.emails,
      phones: contactUsPageData.phones,
      page_scraped: contactUsPageData.page_scraped
    });
    
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
      pages_checked: aggregatedData.page_scraped,
      emails_data: aggregatedData.emails,
      phones_data: aggregatedData.phones,
      linkedins_data: aggregatedData.linkedIns
    });

  return aggregatedData;
}

// Smart API key selection and management functions
async function getSmartKeyAssignment(userId) {
  console.log(`🔍 Getting smart key assignment for user ${userId}`);
  
  // First check and auto-reactivate any cooled down rate-limited keys
  await checkAndReactivateKeys(userId);
  
  // Get all available keys with proper priority filtering
  const { data: allKeys, error: keysError } = await supabase
    .from('api_keys')
    .select('*')
    .eq('user_id', userId);

  if (keysError || !allKeys || allKeys.length === 0) {
    throw new Error('No API keys found for user');
  }

  console.log(`🔑 Found ${allKeys.length} total keys for user ${userId}`);

  // Filter and prioritize keys
  const availableKeys = allKeys.filter(key => {
    // Only consider active and rate_limited keys
    if (key.status === 'failed') {
      console.log(`❌ Skipping failed key: ${key.key_name} (failure count: ${key.failure_count})`);
      return false;
    }
    
    // Check if rate_limited key has cooled down (15 minutes)
    if (key.status === 'rate_limited' && key.last_failed) {
      const cooldownPeriod = 15 * 60 * 1000; // 15 minutes in milliseconds
      const timeSinceFailure = Date.now() - new Date(key.last_failed).getTime();
      
      if (timeSinceFailure < cooldownPeriod) {
        console.log(`⏳ Rate limited key still cooling down: ${key.key_name} (${Math.round((cooldownPeriod - timeSinceFailure) / 1000 / 60)} minutes remaining)`);
        return false;
      } else {
        // Auto-reactivate rate limited key
        console.log(`🔄 Auto-reactivating cooled down key: ${key.key_name}`);
        return true;
      }
    }
    
    return true;
  });

  if (availableKeys.length === 0) {
    throw new Error('No API keys available (all are failed or still rate limited)');
  }

  console.log(`✅ Found ${availableKeys.length} available keys after filtering`);

  // Calculate priority score for each key
  const prioritizedKeys = availableKeys.map(key => {
    let score = 0;
    
    // Status priority (lower = higher priority)
    switch(key.status) {
      case 'active': score += 1000; break;
      case 'rate_limited': score += 2000; break;
      default: score += 3000; break;
    }
    
    // Time-based priority (older = higher priority)
    const lastUsed = key.last_used ? new Date(key.last_used).getTime() : 0;
    const hoursSinceLastUse = lastUsed > 0 ? (Date.now() - lastUsed) / (1000 * 60 * 60) : 24; // Default to 24 hours if never used
    score += hoursSinceLastUse;
    
    // Failure count penalty
    score += (key.failure_count * 100);
    
    console.log(`📊 Key ${key.key_name}: status=${key.status}, score=${score.toFixed(2)}, last_used=${key.last_used || 'never'}, failures=${key.failure_count}`);
    
    return { ...key, priorityScore: score };
  });

  // Sort by priority score (ascending = highest priority first)
  prioritizedKeys.sort((a, b) => a.priorityScore - b.priorityScore);
  
  const selectedKey = prioritizedKeys[0];
  console.log(`🎯 Selected key: ${selectedKey.key_name} (score: ${selectedKey.priorityScore.toFixed(2)})`);
  
  return selectedKey;
}

async function updateKeyStatus(keyId, status, errorMessage = null) {
  try {
    if (status === 'active') {
      const { error } = await supabase
        .from('api_keys')
        .update({
          status: status,
          last_used: new Date().toISOString(),
          failure_count: 0,
          last_failed: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', keyId);

      if (error) {
        console.error(`❌ Failed to update key status to active:`, error);
      } else {
        console.log(`✅ Updated key ${keyId} status to: ${status}`);
      }
    } else if (status === 'rate_limited' || status === 'failed') {
      // First get current failure count
      const { data: currentKey, error: fetchError } = await supabase
        .from('api_keys')
        .select('failure_count')
        .eq('id', keyId)
        .single();

      if (fetchError) {
        console.error(`❌ Failed to fetch current failure count:`, fetchError);
        return;
      }

      const newFailureCount = (currentKey.failure_count || 0) + 1;

      const { error } = await supabase
        .from('api_keys')
        .update({
          status: status,
          last_failed: new Date().toISOString(),
          failure_count: newFailureCount,
          updated_at: new Date().toISOString()
        })
        .eq('id', keyId);

      if (error) {
        console.error(`❌ Failed to update key status to ${status}:`, error);
      } else {
        console.log(`✅ Updated key ${keyId} status to: ${status} (failure count: ${newFailureCount})`);
      }
    }
  } catch (error) {
    console.error(`❌ Error in updateKeyStatus:`, error);
  }
}

// Function to check and auto-reactivate cooled down rate-limited keys
async function checkAndReactivateKeys(userId) {
  try {
    const cooldownPeriod = 15 * 60 * 1000; // 15 minutes in milliseconds
    const cutoffTime = new Date(Date.now() - cooldownPeriod).toISOString();
    
    // Find rate-limited keys that have cooled down
    const { data: cooledKeys, error } = await supabase
      .from('api_keys')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'rate_limited')
      .lt('last_failed', cutoffTime);
    
    if (error) {
      console.error(`❌ Error checking cooled keys:`, error);
      return;
    }
    
    if (cooledKeys && cooledKeys.length > 0) {
      console.log(`🔄 Found ${cooledKeys.length} cooled down rate-limited keys for user ${userId}`);
      
      for (const key of cooledKeys) {
        await updateKeyStatus(key.id, 'active');
        console.log(`✅ Auto-reactivated cooled down key: ${key.key_name}`);
      }
    }
  } catch (error) {
    console.error(`❌ Error in checkAndReactivateKeys:`, error);
  }
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

    // Get smart key assignment for this user
    let currentKey;
    try {
      currentKey = await getSmartKeyAssignment(req.user.id);
      console.log(`🔑 Smart key assignment successful: ${currentKey.key_name}`);
    } catch (error) {
      console.error(`❌ Smart key assignment failed:`, error.message);
      
      await supabase.from('analysis_logs').update({
        status: 'failed',
        error_message: error.message,
        processing_time: Date.now() - startTime
      }).eq('request_id', requestId);

      return res.status(400).json({ 
        error: 'No API keys available', 
        message: error.message 
      });
    }

    const results = [];
    const usedKeys = [];

    // Process each domain
    for (const domain of domains) {
      let success = false;
      let attempts = 0;
      const maxAttempts = 3; // Try up to 3 times with different keys if needed

      while (!success && attempts < maxAttempts) {
        // Get a fresh key assignment for each attempt
        try {
          if (attempts > 0) {
            currentKey = await getSmartKeyAssignment(req.user.id);
            console.log(`🔄 Retry attempt ${attempts + 1} with key: ${currentKey.key_name}`);
          }
        } catch (error) {
          console.error(`❌ Failed to get key for retry attempt ${attempts + 1}:`, error.message);
          break;
        }
        
        try {
          // Try main domain first
          let contactResult = await callContactInfoScraperWithAggregation(domain, currentKey.api_key);
          
          console.log(`📊 Raw contact result for ${domain}:`, {
            domain: contactResult.domain,
            emails: contactResult.emails,
            phones: contactResult.phones,
            page_scraped: contactResult.page_scraped
          });
          
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
            total_contacts: result.total_contacts,
            emails: result.emails
          });
          
          results.push(result);

          // Update key status to active (success)
          await updateKeyStatus(currentKey.id, 'active');

          usedKeys.push(currentKey.id);
          success = true;
          console.log(`✅ Successfully used API key: ${currentKey.key_name}`);
          
        } catch (error) {
          console.error(`❌ Error with API key ${currentKey.key_name}:`, error.message);
          
          // Check if it's a rate limit, credit issue, or invalid key
          const isRateLimit = error.message.includes('rate') || error.message.includes('credit') || error.message.includes('429');
          const isInvalidKey = error.message.includes('Invalid API key') || error.message.includes('401');
          
          if (isRateLimit) {
            await updateKeyStatus(currentKey.id, 'rate_limited');
            console.log(`⚠️ Marked API key as rate limited: ${currentKey.key_name}`);
          } else if (isInvalidKey) {
            await updateKeyStatus(currentKey.id, 'failed');
            console.log(`❌ Marked API key as failed: ${currentKey.key_name}`);
          } else {
            await updateKeyStatus(currentKey.id, 'failed');
            console.log(`⚠️ Marked API key as failed: ${currentKey.key_name}`);
          }

          attempts++;
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
      // Create flat JSON structure for Make.com and Google Sheets
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
      email_found: r.email_found,
      emails: r.emails,
      phones: r.phones,
      linkedin: r.linkedin
    })));
    
    // Return flat JSON structure for Make.com
    if (finalResults.length === 1) {
      // Single domain - return the result directly with metadata
      const singleResult = {
        request_id: requestId,
        domains_processed: domains.length,
        processing_time: processingTime,
        ...finalResults[0]  // Spread the result object directly
      };
      console.log(`📤 Returning single result:`, {
        domain: singleResult.domain,
        email_found: singleResult.email_found,
        emails: singleResult.emails,
        phones: singleResult.phones,
        linkedin: singleResult.linkedin
      });
      res.json(singleResult);
    } else {
      // Multiple domains - return array of flat objects
      const flatResults = finalResults.map(result => ({
        request_id: requestId,
        domains_processed: domains.length,
        processing_time: processingTime,
        ...result  // Spread each result object
      }));
      console.log(`📤 Returning multiple results:`, flatResults.length, 'domains');
      console.log(`📤 Sample result:`, {
        domain: flatResults[0]?.domain,
        email_found: flatResults[0]?.email_found,
        emails: flatResults[0]?.emails,
        phones: flatResults[0]?.phones,
        linkedin: flatResults[0]?.linkedin
      });
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

// Enhanced debug endpoint to check API keys and system status
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
    
    // Analyze key statuses
    const statusCounts = {
      active: 0,
      rate_limited: 0,
      failed: 0
    };
    
    const now = Date.now();
    const cooldownPeriod = 15 * 60 * 1000; // 15 minutes
    
    apiKeys.forEach((key, index) => {
      statusCounts[key.status] = (statusCounts[key.status] || 0) + 1;
      
      console.log(`  ${index + 1}. ID: ${key.id}, Name: "${key.key_name}", Status: ${key.status}`);
      
      if (key.status === 'rate_limited' && key.last_failed) {
        const timeSinceFailure = now - new Date(key.last_failed).getTime();
        const minutesRemaining = Math.max(0, Math.round((cooldownPeriod - timeSinceFailure) / 1000 / 60));
        console.log(`     ⏳ Rate limited: ${minutesRemaining} minutes until auto-reactivation`);
      }
      
      if (key.failure_count > 0) {
        console.log(`     ❌ Failure count: ${key.failure_count}`);
      }
    });
    
    // Check for potential issues
    const issues = [];
    
    if (statusCounts.active === 0) {
      issues.push('No active API keys available');
    }
    
    if (statusCounts.failed > 0) {
      issues.push(`${statusCounts.failed} failed API keys need manual reactivation`);
    }
    
    if (statusCounts.rate_limited > 0) {
      const cooledKeys = apiKeys.filter(key => 
        key.status === 'rate_limited' && 
        key.last_failed && 
        (now - new Date(key.last_failed).getTime()) >= cooldownPeriod
      );
      
      if (cooledKeys.length > 0) {
        issues.push(`${cooledKeys.length} rate-limited keys are ready for auto-reactivation`);
      } else {
        issues.push(`${statusCounts.rate_limited} rate-limited keys are still cooling down`);
      }
    }
    
    // Test smart key assignment
    let smartKeyTest = null;
    try {
      const testKey = await getSmartKeyAssignment(req.user.id);
      smartKeyTest = {
        success: true,
        selected_key: testKey.key_name,
        status: testKey.status,
        message: 'Smart key assignment working correctly'
      };
    } catch (error) {
      smartKeyTest = {
        success: false,
        error: error.message,
        message: 'Smart key assignment failed'
      };
    }
    
    res.json({
      user_id: req.user.id,
      total_keys: apiKeys.length,
      status_summary: statusCounts,
      issues: issues,
      smart_key_test: smartKeyTest,
      keys: apiKeys.map(key => ({
        id: key.id,
        name: key.key_name,
        status: key.status,
        provider: key.provider,
        last_used: key.last_used,
        last_failed: key.last_failed,
        failure_count: key.failure_count,
        created_at: key.created_at,
        cooldown_status: key.status === 'rate_limited' && key.last_failed ? {
          time_since_failure: Math.round((now - new Date(key.last_failed).getTime()) / 1000 / 60),
          minutes_until_reactivation: Math.max(0, Math.round((cooldownPeriod - (now - new Date(key.last_failed).getTime())) / 1000 / 60))
        } : null
      }))
    });
  } catch (error) {
    console.error('Debug keys error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Bulk key status check endpoint
app.get('/api/keys/status', authMiddleware, async (req, res) => {
  try {
    const { data: apiKeys, error } = await supabase
      .from('api_keys')
      .select('*')
      .eq('user_id', req.user.id);
    
    if (error) {
      return res.status(500).json({ error: 'Database error', details: error });
    }
    
    const now = Date.now();
    const cooldownPeriod = 15 * 60 * 1000; // 15 minutes
    
    // Analyze and categorize keys
    const keyAnalysis = {
      total: apiKeys.length,
      active: [],
      rate_limited: [],
      failed: [],
      ready_for_reactivation: [],
      issues: []
    };
    
    apiKeys.forEach(key => {
      const keyInfo = {
        id: key.id,
        name: key.key_name,
        status: key.status,
        provider: key.provider,
        last_used: key.last_used,
        last_failed: key.last_failed,
        failure_count: key.failure_count,
        created_at: key.created_at
      };
      
      switch (key.status) {
        case 'active':
          keyAnalysis.active.push(keyInfo);
          break;
          
        case 'rate_limited':
          keyInfo.cooldown_status = key.last_failed ? {
            time_since_failure: Math.round((now - new Date(key.last_failed).getTime()) / 1000 / 60),
            minutes_until_reactivation: Math.max(0, Math.round((cooldownPeriod - (now - new Date(key.last_failed).getTime())) / 1000 / 60))
          } : null;
          
          keyAnalysis.rate_limited.push(keyInfo);
          
          // Check if ready for auto-reactivation
          if (key.last_failed && (now - new Date(key.last_failed).getTime()) >= cooldownPeriod) {
            keyAnalysis.ready_for_reactivation.push(keyInfo);
          }
          break;
          
        case 'failed':
          keyAnalysis.failed.push(keyInfo);
          break;
      }
    });
    
    // Identify issues
    if (keyAnalysis.active.length === 0) {
      keyAnalysis.issues.push('No active API keys available');
    }
    
    if (keyAnalysis.failed.length > 0) {
      keyAnalysis.issues.push(`${keyAnalysis.failed.length} failed keys need manual reactivation`);
    }
    
    if (keyAnalysis.rate_limited.length > 0 && keyAnalysis.ready_for_reactivation.length === 0) {
      keyAnalysis.issues.push(`${keyAnalysis.rate_limited.length} rate-limited keys are still cooling down`);
    }
    
    // Summary statistics
    const summary = {
      total_keys: keyAnalysis.total,
      active_keys: keyAnalysis.active.length,
      rate_limited_keys: keyAnalysis.rate_limited.length,
      failed_keys: keyAnalysis.failed.length,
      ready_for_reactivation: keyAnalysis.ready_for_reactivation.length,
      system_health: keyAnalysis.active.length > 0 ? 'healthy' : 'critical'
    };
    
    res.json({
      user_id: req.user.id,
      summary: summary,
      analysis: keyAnalysis,
      recommendations: generateRecommendations(keyAnalysis)
    });
    
  } catch (error) {
    console.error('Key status check error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Helper function to generate recommendations
function generateRecommendations(keyAnalysis) {
  const recommendations = [];
  
  if (keyAnalysis.active.length === 0) {
    recommendations.push('Add new API keys or reactivate existing ones');
  }
  
  if (keyAnalysis.failed.length > 0) {
    recommendations.push(`Manually reactivate ${keyAnalysis.failed.length} failed keys`);
  }
  
  if (keyAnalysis.ready_for_reactivation.length > 0) {
    recommendations.push(`${keyAnalysis.ready_for_reactivation.length} rate-limited keys will auto-reactivate soon`);
  }
  
  if (keyAnalysis.active.length < 2) {
    recommendations.push('Consider adding more API keys for better redundancy');
  }
  
  if (keyAnalysis.total === 0) {
    recommendations.push('No API keys found. Please add your first Apify API key');
  }
  
  return recommendations;
}

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

// Manual key reactivation endpoint
app.post('/api/reactivate-key', authMiddleware, async (req, res) => {
  try {
    const { keyId } = req.body;
    
    if (!keyId) {
      return res.status(400).json({ error: 'Key ID required' });
    }
    
    // Get the key and verify ownership
    const { data: key, error: fetchError } = await supabase
      .from('api_keys')
      .select('*')
      .eq('id', keyId)
      .eq('user_id', req.user.id)
      .single();
    
    if (fetchError || !key) {
      return res.status(404).json({ error: 'API key not found or access denied' });
    }
    
    if (key.status === 'active') {
      return res.status(400).json({ error: 'Key is already active' });
    }
    
    // Reactivate the key
    await updateKeyStatus(keyId, 'active');
    
    console.log(`✅ Manually reactivated key: ${key.key_name}`);
    
    res.json({
      success: true,
      message: `Key "${key.key_name}" reactivated successfully`,
      key: {
        id: key.id,
        name: key.key_name,
        status: 'active',
        last_used: null,
        failure_count: 0
      }
    });
    
  } catch (error) {
    console.error('Key reactivation error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
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
