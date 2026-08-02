import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Profile, UserRole } from '../types';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: UserRole | null;
  tenantId: string | null;
  tenant: any | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshTenant: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tenant, setTenant] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchTenant = useCallback(async (tId: string) => {
    const { data } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tId)
      .single();
    return data;
  }, []);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Failed to fetch profile:', error.message);
      return null;
    }
    return data as Profile;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session?.user?.id) return;
    const p = await fetchProfile(session.user.id);
    if (p) setProfile(p);
  }, [session, fetchProfile]);

  const refreshTenant = useCallback(async () => {
    if (!profile?.tenant_id) return;
    const t = await fetchTenant(profile.tenant_id);
    if (t) setTenant(t);
  }, [profile, fetchTenant]);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) {
        const p = await fetchProfile(s.user.id);
        setProfile(p);
        if (p?.tenant_id) {
          const t = await fetchTenant(p.tenant_id);
          setTenant(t);
        }
      }
      setLoading(false);
    });

    // Listen for auth state changes
    const { data: listener } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        // Handle token refresh failures — auto sign-out to prevent broken state
        if (event === 'TOKEN_REFRESHED' && !s) {
          console.warn('Token refresh failed, signing out...');
          await supabase.auth.signOut();
          setSession(null);
          setProfile(null);
          setTenant(null);
          setLoading(false);
          return;
        }

        if (event === 'SIGNED_OUT') {
          setSession(null);
          setProfile(null);
          setTenant(null);
          setLoading(false);
          return;
        }

        setSession(s);
        if (s?.user) {
          const p = await fetchProfile(s.user.id);
          setProfile(p);
          if (p?.tenant_id) {
            const t = await fetchTenant(p.tenant_id);
            setTenant(t);
          } else {
            setTenant(null);
          }
        } else {
          setProfile(null);
          setTenant(null);
        }
        setLoading(false);
      },
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setTenant(null);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        role: profile?.role ?? null,
        tenantId: profile?.tenant_id ?? null,
        tenant,
        loading,
        signIn,
        signOut,
        refreshProfile,
        refreshTenant,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
