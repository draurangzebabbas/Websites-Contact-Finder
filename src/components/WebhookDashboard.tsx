import React, { useState } from 'react';
import { 
  Webhook, 
  Copy, 
  CheckCircle,
  Code,
  Settings,
  BookOpen,
  Play
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export const WebhookDashboard: React.FC = () => {
  const [copied, setCopied] = useState<string | null>(null);
  const [showMakeGuide, setShowMakeGuide] = useState(false);
  const { user } = useAuth();

  const webhookUrl = `${import.meta.env.VITE_API_BASE_URL}/api/extract-contacts`;
  const authToken = user?.webhook_token || '';

  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const makeConfigExample = `{
  "url": "${webhookUrl}",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer ${authToken}",
    "Content-Type": "application/json"
  },
  "body": {
    "domains": ["example.com", "test.com", "sample.com"]
  }
}`;

  const curlExample = `curl -X POST "${webhookUrl}" \\
  -H "Authorization: Bearer ${authToken}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "domains": ["example.com", "test.com", "sample.com"]
  }'`;

  const makeSteps = [
    {
      step: 1,
      title: "Create New Scenario",
      description: "In Make.com, create a new scenario and add a Google Sheets 'Search Rows' module",
      details: "Connect your Google Sheet and select the column containing your domains (max 30 per batch)"
    },
    {
      step: 2,
      title: "Add HTTP Module",
      description: "Add an HTTP 'Make a Request' module after the Google Sheets module",
      details: `Set URL to: ${webhookUrl}\nMethod: POST\nAdd Authorization header with your token`
    },
    {
      step: 3,
      title: "Configure Request Body",
      description: "Map the domains from Google Sheets to the request body",
      details: 'Format: {"domains": [mapped domains from sheet]}'
    },
    {
      step: 4,
      title: "Add Update Module",
      description: "Add another Google Sheets 'Update a Row' module to write results back",
      details: "Map the response data (emails, phones, social media) to your sheet columns"
    }
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Webhook Configuration</h1>
          <p className="text-gray-600">Connect your contact extractor with Make.com automation</p>
        </div>
        <div className="flex space-x-3">
          <button 
            onClick={() => setShowMakeGuide(!showMakeGuide)}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors duration-200 flex items-center"
          >
            <BookOpen className="w-5 h-5 mr-2" />
            {showMakeGuide ? 'Hide Guide' : 'Setup Guide'}
          </button>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors duration-200 flex items-center">
            <Play className="w-5 h-5 mr-2" />
            Test Webhook
          </button>
        </div>
      </div>

      {/* Make.com Setup Guide */}
      {showMakeGuide && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-green-50 to-blue-50 p-6 border-b border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-2">📋 Complete Make.com Setup Guide</h2>
            <p className="text-gray-600">Follow these steps to connect your Google Sheets with our contact extractor</p>
          </div>
          
          <div className="p-6">
            <div className="space-y-6">
              {makeSteps.map((step) => (
                <div key={step.step} className="flex">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm mr-4">
                    {step.step}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-2">{step.title}</h3>
                    <p className="text-gray-700 mb-2">{step.description}</p>
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <p className="text-sm text-gray-600 whitespace-pre-line">{step.details}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h3 className="font-semibold text-yellow-900 mb-2">⚡ Pro Tips</h3>
              <ul className="text-sm text-yellow-800 space-y-1">
                <li>• Start with 5-10 domains to test your setup</li>
                <li>• Set up error handling in Make.com for failed requests</li>
                <li>• Use filters to only process new/unprocessed domains</li>
                <li>• Schedule your scenario to run automatically (e.g., daily)</li>
                <li>• The system tries main page, /contact, and /contact-us for each domain</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Webhook Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
              <Webhook className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Webhook URL</h2>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Endpoint URL
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  readOnly
                  value={webhookUrl}
                  className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm font-mono"
                />
                <button
                  onClick={() => copyToClipboard(webhookUrl, 'url')}
                  className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors duration-200"
                >
                  {copied === 'url' ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <Copy className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Authorization Token
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  readOnly
                  value={authToken}
                  className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm font-mono"
                />
                <button
                  onClick={() => copyToClipboard(authToken, 'token')}
                  className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors duration-200"
                >
                  {copied === 'token' ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <Copy className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-medium text-blue-900 mb-2">Quick Setup</h3>
              <ol className="text-sm text-blue-800 space-y-1">
                <li>1. Copy the webhook URL above</li>
                <li>2. Add it to your Make.com HTTP module</li>
                <li>3. Set method to POST</li>
                <li>4. Add Authorization header with your token</li>
                <li>5. Send domains as JSON array</li>
              </ol>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mr-3">
              <Settings className="w-5 h-5 text-green-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Make.com Configuration</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                HTTP Request Settings
              </label>
              <div className="bg-gray-50 rounded-lg p-3 text-sm font-mono overflow-x-auto">
                <pre className="whitespace-pre-wrap">{makeConfigExample}</pre>
              </div>
              <button
                onClick={() => copyToClipboard(makeConfigExample, 'config')}
                className="mt-2 text-blue-600 hover:text-blue-700 text-sm flex items-center"
              >
                {copied === 'config' ? (
                  <>
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-1" />
                    Copy Configuration
                  </>
                )}
              </button>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h3 className="font-medium text-yellow-900 mb-2">Expected Response</h3>
              <div className="text-sm text-yellow-800">
                <p>The API will return extracted contact data including:</p>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>API key name used for each extraction</li>
                  <li>Page where contact info was found</li>
                  <li>Email addresses found</li>
                  <li>Phone numbers found</li>
                  <li>Social media profiles (LinkedIn, Facebook, Twitter, etc.)</li>
                  <li>Complete contact information with all platforms</li>
                </ul>
                <div className="mt-3 p-2 bg-white rounded border">
                  <p className="font-medium text-xs">Sample Response:</p>
                  <pre className="text-xs mt-1 overflow-x-auto">
{`{
  "request_id": "uuid",
  "domains_processed": 2,
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
      }
    }
  ]
}`}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Code Examples */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center mb-4">
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
            <Code className="w-5 h-5 text-purple-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Testing Your Webhook</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              cURL Example
            </label>
            <div className="bg-gray-900 rounded-lg p-4 text-sm text-gray-100 overflow-x-auto">
              <pre className="whitespace-pre-wrap">{curlExample}</pre>
            </div>
            <button
              onClick={() => copyToClipboard(curlExample, 'curl')}
              className="mt-2 text-blue-600 hover:text-blue-700 text-sm flex items-center"
            >
              {copied === 'curl' ? (
                <>
                  <CheckCircle className="w-4 h-4 mr-1" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-1" />
                  Copy cURL Command
                </>
              )}
            </button>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h3 className="font-medium text-green-900 mb-2">Rate Limits & Best Practices</h3>
            <ul className="text-sm text-green-800 space-y-1">
              <li>• Maximum 30 domains per request</li>
              <li>• Rate limit: 10 requests per minute</li>
              <li>• Timeout: 60 seconds per request</li>
              <li>• Use webhook token for authentication</li>
              <li>• API automatically rotates between your configured keys</li>
              <li>• API key name is returned for each extraction</li>
              <li>• Test with small batches first (5-10 domains)</li>
              <li>• Monitor your API key credits in the dashboard</li>
              <li>• System tries main page, /contact, and /contact-us for each domain</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};