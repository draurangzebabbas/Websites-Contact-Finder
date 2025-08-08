import React, { useState, useEffect } from 'react';
import { 
  Key, 
  Zap, 
  Clock,
  Plus,
  ExternalLink,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ArrowRight,
  BookOpen,
  Webhook,
  Play,
  X,
  Bell,
  Mail
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

interface Stats {
  totalApiKeys: number;
  activeApiKeys: number;
  totalExtractions: number;
  successRate: number;
}

interface SetupStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  action: string;
  icon: React.ComponentType<any>;
}

export const DashboardOverview: React.FC = () => {
  const [stats, setStats] = useState<Stats>({
    totalApiKeys: 0,
    activeApiKeys: 0,
    totalExtractions: 0,
    successRate: 0,
  });
  const [recentExtractions, setRecentExtractions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGettingStarted, setShowGettingStarted] = useState(false);
  const [showWelcomeMessage, setShowWelcomeMessage] = useState(false);
  const { user } = useAuth();

  // Add navigation function
  const navigateToSection = (section: string) => {
    // This will be handled by the parent Dashboard component
    // For now, we'll use a custom event
    const event = new CustomEvent('navigateToSection', { detail: section });
    window.dispatchEvent(event);
  };

  useEffect(() => {
    if (user) {
      fetchDashboardData();
      // Show welcome message for new users (first time visit)
      const hasVisited = localStorage.getItem('hasVisited');
      if (!hasVisited) {
        setShowWelcomeMessage(true);
        localStorage.setItem('hasVisited', 'true');
      }
    }
  }, [user]);

  const fetchDashboardData = async () => {
    try {
      // Fetch API keys stats
      const { data: apiKeys } = await supabase
        .from('api_keys')
        .select('id, status')
        .eq('user_id', user!.id);

      // Fetch extraction logs
      const { data: extractions } = await supabase
        .from('analysis_logs')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(5);

      const totalApiKeys = apiKeys?.length || 0;
      const activeApiKeys = apiKeys?.filter(key => key.status === 'active').length || 0;
      const totalExtractions = extractions?.length || 0;
      const successfulExtractions = extractions?.filter(extraction => extraction.status === 'completed').length || 0;
      const successRate = totalExtractions > 0 ? (successfulExtractions / totalExtractions) * 100 : 0;

      setStats({
        totalApiKeys,
        activeApiKeys,
        totalExtractions,
        successRate,
      });

      setRecentExtractions(extractions || []);
      
      // Show getting started if user is new (no API keys and no extractions)
      setShowGettingStarted(totalApiKeys === 0 && totalExtractions === 0);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const setupSteps: SetupStep[] = [
    {
      id: 'api-keys',
      title: 'Add Your Apify API Keys',
      description: 'Add multiple Apify API keys to enable automatic rotation and scale your contact extraction',
      completed: stats.totalApiKeys > 0,
      action: 'Add API Keys',
      icon: Key,
    },
    {
      id: 'webhook',
      title: 'Get Your Webhook Credentials',
      description: 'Copy your personal webhook URL and auth token for Make.com integration',
      completed: stats.totalApiKeys > 0, // Assume they've seen webhook if they added keys
      action: 'View Webhook',
      icon: Webhook,
    },
    {
      id: 'make-setup',
      title: 'Setup Make.com Automation',
      description: 'Connect your Google Sheets with our webhook to automate contact extraction',
      completed: stats.totalExtractions > 0,
      action: 'Setup Guide',
      icon: ExternalLink,
    },
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white p-6 rounded-xl shadow-sm">
                <div className="h-4 bg-gray-200 rounded mb-2"></div>
                <div className="h-8 bg-gray-200 rounded"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Welcome Message */}
      {showWelcomeMessage && (
        <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-xl p-6">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <Bell className="w-6 h-6 text-green-600" />
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-lg font-semibold text-green-900 mb-2">
                Welcome to Contact Info Extractor! 🎉
              </h3>
              <p className="text-green-800 mb-4">
                You're all set up! Start by adding your Apify API keys to begin extracting contact information at scale. 
                Our intelligent system will automatically rotate between your keys to avoid hitting credit limits.
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowWelcomeMessage(false)}
                  className="bg-green-600 hover:bg-green-700 active:bg-green-800 text-white px-4 py-2 rounded-lg transition-all duration-200 transform hover:scale-105 active:scale-95 shadow-sm hover:shadow-md"
                >
                  Got it!
                </button>
                <button
                  onClick={() => {
                    setShowWelcomeMessage(false);
                    setShowGettingStarted(true);
                  }}
                  className="bg-white hover:bg-gray-50 active:bg-gray-100 text-green-700 border border-green-300 px-4 py-2 rounded-lg transition-all duration-200 transform hover:scale-105 active:scale-95 shadow-sm hover:shadow-md"
                >
                  Show Setup Guide
                </button>
              </div>
            </div>
            <button
              onClick={() => setShowWelcomeMessage(false)}
              className="ml-3 text-green-400 hover:text-green-600 transition-colors duration-200 transform hover:scale-110 active:scale-95"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-6 text-white">
        <h1 className="text-2xl font-bold mb-2">
          Welcome back, {user?.full_name?.split(' ')[0]}!
        </h1>
        <p className="text-blue-100 mb-4">
          Scale your contact extraction with intelligent API key rotation and seamless Make.com integration.
        </p>
        <div className="flex flex-wrap gap-3">
          {showGettingStarted ? (
            <button 
              onClick={() => {
                setShowGettingStarted(true);
                navigateToSection('api-keys');
              }}
              className="bg-white/20 hover:bg-white/30 active:bg-white/40 text-white px-4 py-2 rounded-lg transition-all duration-200 flex items-center transform hover:scale-105 active:scale-95 shadow-sm hover:shadow-md"
            >
              <BookOpen className="w-4 h-4 mr-2" />
              Getting Started Guide
            </button>
          ) : (
            <>
              <button 
                onClick={() => navigateToSection('api-keys')}
                className="bg-white/20 hover:bg-white/30 active:bg-white/40 text-white px-4 py-2 rounded-lg transition-all duration-200 flex items-center transform hover:scale-105 active:scale-95 shadow-sm hover:shadow-md"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add API Key
              </button>
              <button className="bg-white/20 hover:bg-white/30 active:bg-white/40 text-white px-4 py-2 rounded-lg transition-all duration-200 flex items-center transform hover:scale-105 active:scale-95 shadow-sm hover:shadow-md">
                <Play className="w-4 h-4 mr-2" />
                Test Extraction
              </button>
            </>
          )}
        </div>
      </div>

      {/* Getting Started Guide */}
      {showGettingStarted && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-green-50 to-blue-50 p-6 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">🚀 Getting Started</h2>
                <p className="text-gray-600">Follow these 3 simple steps to start scaling your contact extraction</p>
              </div>
              <button
                onClick={() => setShowGettingStarted(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors duration-200 transform hover:scale-110 active:scale-95"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>
          
          <div className="p-6">
            <div className="space-y-4">
              {setupSteps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <div key={step.id} className="flex items-center p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-white shadow-sm mr-4">
                      {step.completed ? (
                        <CheckCircle className="w-6 h-6 text-green-500" />
                      ) : (
                        <span className="text-sm font-bold text-gray-500">{index + 1}</span>
                      )}
                    </div>
                    
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-1">{step.title}</h3>
                      <p className="text-sm text-gray-600">{step.description}</p>
                    </div>
                    
                    <button 
                      onClick={() => {
                        if (step.id === 'api-keys') {
                          navigateToSection('api-keys');
                        } else if (step.id === 'webhook') {
                          navigateToSection('webhook');
                        } else if (step.id === 'make-setup') {
                          navigateToSection('webhook');
                        }
                      }}
                      className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-4 py-2 rounded-lg transition-all duration-200 flex items-center ml-4 transform hover:scale-105 active:scale-95 shadow-sm hover:shadow-md"
                    >
                      <Icon className="w-4 h-4 mr-2" />
                      {step.action}
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </button>
                  </div>
                );
              })}
            </div>
            
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="font-semibold text-blue-900 mb-2">💡 Quick Start Tips</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• You can add multiple Apify API keys to avoid hitting credit limits</li>
                <li>• The system automatically rotates between keys when one runs out</li>
                <li>• Your webhook URL is unique and secure - don't share it publicly</li>
                <li>• Test with 5-10 domains first before scaling to larger batches</li>
                <li>• The system tries main page, /contact, and /contact-us for each domain</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow duration-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total API Keys</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalApiKeys}</p>
              {stats.totalApiKeys === 0 && (
                <p className="text-xs text-orange-600 mt-1">Add your first API key to get started</p>
              )}
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Key className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow duration-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Keys</p>
              <p className="text-2xl font-bold text-gray-900">{stats.activeApiKeys}</p>
              {stats.activeApiKeys === 0 && stats.totalApiKeys > 0 && (
                <p className="text-xs text-red-600 mt-1">No active keys available</p>
              )}
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Zap className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow duration-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Extractions</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalExtractions}</p>
              {stats.totalExtractions === 0 && (
                <p className="text-xs text-blue-600 mt-1">Ready for your first extraction</p>
              )}
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <Mail className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow duration-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Success Rate</p>
              <p className="text-2xl font-bold text-gray-900">{stats.successRate.toFixed(1)}%</p>
              {stats.totalExtractions === 0 && (
                <p className="text-xs text-gray-500 mt-1">No data yet</p>
              )}
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Recent Extractions */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Recent Extractions</h2>
          <p className="text-sm text-gray-600">Latest contact extraction requests and their status</p>
        </div>
        
        <div className="divide-y divide-gray-100">
          {recentExtractions.length > 0 ? (
            recentExtractions.map((extraction) => (
              <div key={extraction.id} className="p-6 hover:bg-gray-50 transition-colors duration-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {getStatusIcon(extraction.status)}
                    <div>
                      <p className="font-medium text-gray-900">
                        {extraction.keywords?.length || 0} domains extracted
                      </p>
                      <p className="text-sm text-gray-600">
                        {new Date(extraction.created_at).toLocaleDateString()} at{' '}
                        {new Date(extraction.created_at).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(extraction.status)}`}>
                      {extraction.status}
                    </span>
                    {extraction.processing_time && (
                      <span className="text-sm text-gray-500">
                        {extraction.processing_time}ms
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="p-12 text-center">
              <Mail className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No extractions yet</h3>
              <p className="text-gray-600 mb-4">
                Start by setting up your API keys and webhook integration with Make.com
              </p>
              <button 
                onClick={() => navigateToSection('api-keys')}
                className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-4 py-2 rounded-lg transition-all duration-200 transform hover:scale-105 active:scale-95 shadow-sm hover:shadow-md"
              >
                Get Started
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};