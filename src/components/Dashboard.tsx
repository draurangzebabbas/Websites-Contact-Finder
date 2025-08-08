import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Key, 
  Webhook, 
  BarChart3, 
  Settings, 
  LogOut,
  Menu,
  X,
  CheckCircle,
  AlertCircle,
  Mail
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { ApiKeyManager } from './ApiKeyManager';
import { WebhookDashboard } from './WebhookDashboard';
import { AnalyticsView } from './AnalyticsView';
import { DashboardOverview } from './DashboardOverview';

type TabType = 'overview' | 'api-keys' | 'webhook' | 'analytics' | 'settings';

interface Notification {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  title: string;
}

export const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const { user, signOut } = useAuth();

  // Handle navigation events from overview
  useEffect(() => {
    const handleNavigation = (event: CustomEvent) => {
      const section = event.detail as TabType;
      setActiveTab(section);
      setSidebarOpen(false);
    };

    window.addEventListener('navigateToSection', handleNavigation as EventListener);
    
    return () => {
      window.removeEventListener('navigateToSection', handleNavigation as EventListener);
    };
  }, []);

  const navigation = [
    { id: 'overview', name: 'Overview', icon: LayoutDashboard },
    { id: 'api-keys', name: 'API Keys', icon: Key },
    { id: 'webhook', name: 'Webhook', icon: Webhook },
    { id: 'analytics', name: 'Analytics', icon: BarChart3 },
    { id: 'settings', name: 'Settings', icon: Settings },
  ];

  const addNotification = (notification: Omit<Notification, 'id'>) => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { ...notification, id }]);
    // Auto remove after 5 seconds
    setTimeout(() => {
      removeNotification(id);
    }, 5000);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return <DashboardOverview />;
      case 'api-keys':
        return <ApiKeyManager onSuccess={() => addNotification({
          type: 'success',
          title: 'API Key Updated',
          message: 'Your API key has been successfully updated.'
        })} />;
      case 'webhook':
        return <WebhookDashboard />;
      case 'analytics':
        return <AnalyticsView />;
      case 'settings':
        return <div className="p-6 text-gray-600">Settings coming soon...</div>;
      default:
        return <DashboardOverview />;
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-blue-500" />;
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200 text-green-800';
      case 'error':
        return 'bg-red-50 border-red-200 text-red-800';
      default:
        return 'bg-blue-50 border-blue-200 text-blue-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Notifications */}
      {notifications.length > 0 && (
        <div className="fixed top-4 right-4 z-50 space-y-2">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`max-w-sm p-4 rounded-lg border shadow-lg ${getNotificationColor(notification.type)}`}
            >
              <div className="flex items-start">
                {getNotificationIcon(notification.type)}
                <div className="ml-3 flex-1">
                  <h4 className="font-medium">{notification.title}</h4>
                  <p className="text-sm mt-1">{notification.message}</p>
                </div>
                <button
                  onClick={() => removeNotification(notification.id)}
                  className="ml-3 text-gray-400 hover:text-gray-600 transition-colors duration-200 transform hover:scale-110 active:scale-95"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <span className="ml-3 font-bold text-gray-900">Contact Extractor</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-gray-400 hover:text-gray-600 transition-colors duration-200 transform hover:scale-110 active:scale-95"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <nav className="mt-6 px-3">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id as TabType);
                  setSidebarOpen(false);
                }}
                className={`
                  w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg mb-1 transition-all duration-200 transform hover:scale-105 active:scale-95
                  ${activeTab === item.id
                    ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-700 shadow-sm'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 hover:shadow-sm'
                  }
                `}
              >
                <Icon className="w-5 h-5 mr-3" />
                {item.name}
              </button>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center">
              <span className="text-white font-medium text-sm">
                {user?.full_name?.charAt(0)?.toUpperCase()}
              </span>
            </div>
            <div className="ml-3 flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user?.full_name}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {user?.email}
              </p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 active:bg-red-100 rounded-lg transition-all duration-200 transform hover:scale-105 active:scale-95"
          >
            <LogOut className="w-5 h-5 mr-3" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="bg-white shadow-sm border-b border-gray-200 lg:hidden">
          <div className="flex items-center justify-between h-16 px-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-gray-400 hover:text-gray-600 transition-colors duration-200 transform hover:scale-110 active:scale-95"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="flex items-center">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <Mail className="w-5 h-5 text-white" />
              </div>
              <span className="ml-2 font-bold text-gray-900">Contact Extractor</span>
            </div>
            <div className="w-6 h-6" /> {/* Spacer */}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {renderContent()}
        </main>
      </div>
    </div>
  );
};