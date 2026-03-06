import { useCallback } from 'react';

import Button from '@mui/material/Button';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';

import { toast } from 'src/components/snackbar';

import { useAuthContext } from 'src/auth/hooks';
import { signOut as jwtSignOut } from 'src/auth/context/jwt/action';

// ----------------------------------------------------------------------

export function SignOutButton({ onClose, sx, ...other }) {
  const router = useRouter();
  const { checkUserSession } = useAuthContext();

  const handleLogout = useCallback(async () => {
    try {
      await jwtSignOut();
      await checkUserSession?.();

      onClose?.();
      router.replace(paths.auth.jwt.signIn);
    } catch (error) {
      console.error(error);
      toast.error('Unable to logout!');
    }
  }, [checkUserSession, onClose, router]);

  return (
    <Button fullWidth variant="soft" size="large" color="error" onClick={handleLogout} sx={sx} {...other}>
      Logout
    </Button>
  );
}

