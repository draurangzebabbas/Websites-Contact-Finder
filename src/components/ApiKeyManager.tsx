import React, { useState, useEffect } from 'react';
import { 
  Key, 
  Plus, 
  Trash2, 
  Eye, 
  EyeOff,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

interface ApiKey {
  id: string;
  key_name: string;
  api_key: string;
  provider: string;
  status: string;
  credits_remaining: number;
  last_used: string | null;
  created_at: string;
}

interface ApiKeyManagerProps {
  onSuccess?: () => void;
}

export const ApiKeyManager: React.FC<ApiKeyManagerProps> = ({ onSuccess }) => {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showKeys, setShowKeys] = useState<{ [key: string]: boolean }>({});
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState({
    name: '',
    key: '',
    provider: 'apify',
  });
  const { user } = useAuth();

  // Test Supabase connection
  useEffect(() => {
    console.log('Testing Supabase connection...');
    // Test the connection by making a simple query
    supabase.from('api_keys').select('count').limit(1).then(({ error }) => {
      if (error) {
        console.warn('Supabase connection warning (non-critical):', error.message);
      } else {
        console.log('✅ Supabase connection successful');
      }
    });

    // Test if user profile exists
    if (user) {
      supabase.from('users').select('id').eq('id', user.id).single().then(({ error }) => {
        if (error) {
          console.warn('⚠️ User profile check warning (non-critical):', error.message);
        } else {
          console.log('✅ User profile exists and is accessible');
        }
      });
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchApiKeys();
    }
  }, [user]);

  const fetchApiKeys = async () => {
    try {
      setLoading(true);
      console.log('🔄 Fetching API keys for user:', user!.id);
      
      const { data, error } = await supabase
        .from('api_keys')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('⚠️ API keys fetch warning:', error.message);
        setError('Failed to load API keys. Please try again.');
        return;
      }
      
      setApiKeys(data || []);
      setError(null);
      console.log(`✅ API keys loaded successfully: ${data?.length || 0} keys`);
    } catch (error) {
      console.warn('⚠️ API keys fetch error (non-critical):', error);
      setError('Failed to load API keys. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    
    try {
      // Validate inputs
      if (!newKey.name.trim()) {
        setError('Key name is required');
        setSubmitting(false);
        return;
      }
      if (!newKey.key.trim()) {
        setError('API key is required');
        setSubmitting(false);
        return;
      }

      console.log('🔄 Adding API key:', {
        user_id: user!.id,
        key_name: newKey.name.trim(),
        provider: newKey.provider,
        key_length: newKey.key.trim().length
      });

      const { error } = await supabase
        .from('api_keys')
        .insert({
          user_id: user!.id,
          key_name: newKey.name.trim(),
          api_key: newKey.key.trim(),
          provider: newKey.provider,
          status: 'active',
        });

      if (error) {
        console.warn('⚠️ API key addition warning:', error.message);
        setError(error.message || 'Failed to add API key. Please try again.');
        setSubmitting(false);
        return;
      }

      // Success
      console.log('✅ API key added successfully');
      await fetchApiKeys();
      setShowAddForm(false);
      setNewKey({ name: '', key: '', provider: 'apify' });
      onSuccess?.();
      
    } catch (error: any) {
      console.warn('⚠️ API key addition error (non-critical):', error.message);
      setError(error.message || 'Failed to add API key. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to delete this API key? This action cannot be undone.')) {
      return;
    }

    try {
      setSubmitting(true);
      const { error } = await supabase
        .from('api_keys')
        .delete()
        .eq('id', keyId);

      if (error) {
        console.error('Error deleting API key:', error);
        setError('Failed to delete API key. Please try again.');
        return;
      }

      await fetchApiKeys();
      onSuccess?.();
      console.log('API key deleted successfully');
    } catch (error: any) {
      console.error('Error deleting API key:', error);
      setError('Failed to delete API key. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleKeyVisibility = (keyId: string) => {
    setShowKeys(prev => ({
      ...prev,
      [keyId]: !prev[keyId]
    }));
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'rate_limited':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'rate_limited':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const maskApiKey = (key: string) => {
    if (key.length <= 8) return key;
    return key.substring(0, 4) + '•'.repeat(key.length - 8) + key.substring(key.length - 4);
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white p-6 rounded-xl shadow-sm">
              <div className="h-4 bg-gray-200 rounded mb-2"></div>
              <div className="h-6 bg-gray-200 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">API Key Management</h1>
          <p className="text-gray-600">Manage your Apify API keys for SERP analysis</p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          disabled={submitting}
          className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-400 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-all duration-200 flex items-center shadow-sm hover:shadow-md transform hover:scale-105 active:scale-95"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add API Key
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <XCircle className="w-5 h-5 text-red-500 mr-3" />
            <p className="text-red-700">{error}</p>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-400 hover:text-red-600"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Add Key Form */}
      {showAddForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Add New API Key</h2>
          <form onSubmit={handleAddKey} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Key Name
                </label>
                <input
                  type="text"
                  required
                  disabled={submitting}
                  value={newKey.name}
                  onChange={(e) => setNewKey(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Personal Apify Key 1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:cursor-not-allowed transition-all duration-200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Provider
                </label>
                <select
                  disabled={submitting}
                  value={newKey.provider}
                  onChange={(e) => setNewKey(prev => ({ ...prev, provider: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:cursor-not-allowed transition-all duration-200"
                >
                  <option value="apify">Apify</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                API Key
              </label>
              <input
                type="password"
                required
                disabled={submitting}
                value={newKey.key}
                onChange={(e) => setNewKey(prev => ({ ...prev, key: e.target.value }))}
                placeholder="Enter your API key"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:cursor-not-allowed transition-all duration-200"
              />
            </div>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  setShowAddForm(false);
                  setNewKey({ name: '', key: '', provider: 'apify' });
                  setError(null);
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 disabled:bg-gray-50 disabled:cursor-not-allowed rounded-lg transition-all duration-200 shadow-sm hover:shadow-md transform hover:scale-105 active:scale-95"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-400 disabled:cursor-not-allowed text-white rounded-lg transition-all duration-200 flex items-center shadow-sm hover:shadow-md transform hover:scale-105 active:scale-95"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  'Add Key'
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* API Keys List */}
      <div className="space-y-4">
        {apiKeys.length > 0 ? (
          apiKeys.map((apiKey) => (
            <div key={apiKey.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-all duration-200 transform hover:scale-[1.02]">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Key className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{apiKey.key_name}</h3>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className="text-sm text-gray-600">
                        {showKeys[apiKey.id] ? apiKey.api_key : maskApiKey(apiKey.api_key)}
                      </span>
                      <button
                        onClick={() => toggleKeyVisibility(apiKey.id)}
                        className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
                      >
                        {showKeys[apiKey.id] ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(apiKey.status)}
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(apiKey.status)}`}>
                        {apiKey.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      {apiKey.last_used 
                        ? `Last used ${new Date(apiKey.last_used).toLocaleDateString()}`
                        : 'Never used'
                      }
                    </p>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleDeleteKey(apiKey.id)}
                      disabled={submitting}
                      className="p-2 text-red-600 hover:bg-red-50 active:bg-red-100 disabled:text-red-300 disabled:cursor-not-allowed rounded-lg transition-all duration-200 transform hover:scale-110 active:scale-95"
                    >
                      {submitting ? (
                        <RefreshCw className="w-5 h-5 animate-spin" />
                      ) : (
                        <Trash2 className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <Key className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No API Keys Added</h3>
            <p className="text-gray-600 mb-6">
              Add your first Apify API key to start analyzing SERPs at scale
            </p>
            <button
              onClick={() => setShowAddForm(true)}
              disabled={submitting}
              className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-400 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg transition-all duration-200 flex items-center mx-auto shadow-sm hover:shadow-md transform hover:scale-105 active:scale-95"
            >
              <Plus className="w-5 h-5 mr-2" />
              Add Your First API Key
            </button>
          </div>
        )}
      </div>
    </div>
  );
};