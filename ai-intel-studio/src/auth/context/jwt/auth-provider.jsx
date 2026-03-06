import { useSetState } from 'minimal-shared/hooks';
import { useMemo, useEffect, useCallback } from 'react';

import { CONFIG } from 'src/global-config';

import { AuthContext } from '../auth-context';
import { jwtDecode, setSession, isValidToken } from './utils';
import { JWT_STORAGE_KEY, JWT_USER_STORAGE_KEY } from './constant';

// ----------------------------------------------------------------------

function resolveAvatarUrl(value) {
  if (!value || typeof value !== 'string') return value;
  if (/^https?:\/\//.test(value) || value.startsWith('data:')) return value;
  if (!value.startsWith('/')) return value;

  return `${CONFIG.serverUrl}${value}`;
}

export function AuthProvider({ children }) {
  const { state, setState } = useSetState({ user: null, loading: true });

  const checkUserSession = useCallback(async () => {
    try {
      const accessToken = sessionStorage.getItem(JWT_STORAGE_KEY);

      if (accessToken && isValidToken(accessToken)) {
        await setSession(accessToken);

        const localUserRaw = sessionStorage.getItem(JWT_USER_STORAGE_KEY);
        let localUser = null;
        if (localUserRaw) {
          try {
            localUser = JSON.parse(localUserRaw);
          } catch {
            localUser = null;
          }
        }

        const decoded = jwtDecode(accessToken) || {};
        const fallbackDisplayName = decoded.name || decoded.email || 'User';
        const fallbackAvatar =
          decoded.photoURL || decoded.avatarUrl || '/assets/images/mock/avatar/avatar-25.webp';

        const normalizedUser = {
          id: localUser?.id || decoded.sub || decoded.email || fallbackDisplayName,
          email: localUser?.email || decoded.email || '',
          name: localUser?.name || localUser?.displayName || fallbackDisplayName,
          displayName: localUser?.displayName || localUser?.name || fallbackDisplayName,
          avatarUrl: resolveAvatarUrl(localUser?.avatarUrl || localUser?.photoURL || fallbackAvatar),
          photoURL: resolveAvatarUrl(localUser?.photoURL || localUser?.avatarUrl || fallbackAvatar),
          role: localUser?.role || decoded.role || 'admin',
        };

        setState({ user: { ...normalizedUser, accessToken }, loading: false });
      } else {
        sessionStorage.removeItem(JWT_USER_STORAGE_KEY);
        setState({ user: null, loading: false });
      }
    } catch (error) {
      console.error(error);
      sessionStorage.removeItem(JWT_USER_STORAGE_KEY);
      setState({ user: null, loading: false });
    }
  }, [setState]);

  useEffect(() => {
    checkUserSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----------------------------------------------------------------------

  const checkAuthenticated = state.user ? 'authenticated' : 'unauthenticated';

  const status = state.loading ? 'loading' : checkAuthenticated;

  const memoizedValue = useMemo(
    () => ({
      user: state.user ? { ...state.user, role: state.user?.role ?? 'admin' } : null,
      checkUserSession,
      loading: status === 'loading',
      authenticated: status === 'authenticated',
      unauthenticated: status === 'unauthenticated',
    }),
    [checkUserSession, state.user, status]
  );

  return <AuthContext value={memoizedValue}>{children}</AuthContext>;
}
