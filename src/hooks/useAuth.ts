import { useState, useEffect, createContext, useContext } from 'react';
import { supabase } from '../lib/supabase';

interface User {
  id: string;
  email: string;
  full_name: string;
  webhook_token: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const useAuthState = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshUser = async () => {
    // Prevent multiple simultaneous refresh calls
    if (isRefreshing) {
      return;
    }

    setIsRefreshing(true);
    
    // Add timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      console.warn('⚠️ User refresh timeout - this is normal for new users');
      setLoading(false);
      setIsRefreshing(false);
    }, 10000); // 10 second timeout
    
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) throw sessionError;
      
      if (!session?.user) {
        setUser(null);
        clearTimeout(timeoutId);
        setLoading(false);
        setIsRefreshing(false);
        return;
      }

      // Try to get user profile - the trigger should have created it automatically
      let { data, error } = await supabase
        .from('users')
        .select('id, email, full_name, webhook_token')
        .eq('id', session.user.id)
        .single();

      if (error && error.code === 'PGRST116') {
        console.log('🔄 Creating user profile...');
        // User profile doesn't exist, create it manually
        const { data: newUser, error: insertError } = await supabase
          .from('users')
          .insert({
            id: session.user.id,
            email: session.user.email!,
            full_name: session.user.user_metadata?.full_name || session.user.email!.split('@')[0],
            webhook_token: crypto.randomUUID().replace(/-/g, ''),
          })
          .select('id, email, full_name, webhook_token')
          .single();

        if (insertError) {
          console.warn('⚠️ Profile creation warning:', insertError.message);
          // If we can't create profile, use basic user data
          setUser({
            id: session.user.id,
            email: session.user.email!,
            full_name: session.user.user_metadata?.full_name || session.user.email!.split('@')[0],
            webhook_token: '',
          });
          clearTimeout(timeoutId);
          setLoading(false);
          setIsRefreshing(false);
          return;
        }
        data = newUser;
        console.log('✅ User profile created successfully');
      } else if (error) {
        console.warn('⚠️ Profile fetch warning:', error.message);
        // If we can't fetch profile, use basic user data
        setUser({
          id: session.user.id,
          email: session.user.email!,
          full_name: session.user.user_metadata?.full_name || session.user.email!.split('@')[0],
          webhook_token: '',
        });
        clearTimeout(timeoutId);
        setLoading(false);
        setIsRefreshing(false);
        return;
      }

      setUser(data);
      clearTimeout(timeoutId);
      setLoading(false);
      setIsRefreshing(false);
    } catch (error) {
      console.warn('⚠️ User refresh error (non-critical):', error);
      setUser(null);
      clearTimeout(timeoutId);
      setLoading(false);
      setIsRefreshing(false);
    }
  }

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) throw error;
      
      if (!data.user) throw new Error('Failed to create user');

      // Return success - the user will need to verify their email
      return;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to sign up');
    }
  };

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      
      if (!data.user) throw new Error('Failed to sign in');

      // The refreshUser will be called automatically by the auth state change listener
    } catch (error: any) {
      setLoading(false);
      throw new Error(error.message || 'Failed to sign in');
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
  };

  useEffect(() => {
    refreshUser();
    
    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          setLoading(true);
          // Add a small delay to allow the trigger to create the profile
          setTimeout(() => {
            refreshUser();
          }, 1000);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return {
    user,
    loading,
    signUp,
    signIn,
    signOut,
    refreshUser,
  };
};

export { AuthContext };
