import { setSession } from './utils';
import { JWT_USER_STORAGE_KEY } from './constant';

const STATIC_USER = {
  id: 'ai-intel-admin',
  email: 'chao.xue@ai-now.com',
  name: 'AI Intel Admin',
  displayName: 'AI Intel Admin',
  role: 'admin',
  avatarUrl: '/assets/images/mock/avatar/avatar-25.webp',
  photoURL: '/assets/images/mock/avatar/avatar-25.webp',
};
const STATIC_PASSWORD = 'admin123@';

function base64UrlEncode(input) {
  const encoded = btoa(unescape(encodeURIComponent(input)));
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

const STATIC_ACCESS_TOKEN = (() => {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: STATIC_USER.id,
    email: STATIC_USER.email,
    name: STATIC_USER.displayName,
    role: STATIC_USER.role,
    avatarUrl: STATIC_USER.avatarUrl,
    photoURL: STATIC_USER.photoURL,
    iat: 1700000000,
    exp: 4102444800,
  };
  return `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}.local-sign`;
})();

function writeStaticSession() {
  sessionStorage.setItem(JWT_USER_STORAGE_KEY, JSON.stringify(STATIC_USER));
  return setSession(STATIC_ACCESS_TOKEN);
}

/** **************************************
 * Sign in
 *************************************** */

// ----------------------------------------------------------------------

export const signInWithPassword = async ({ email, password }) => {
  try {
    const emailOk = String(email || '').trim().toLowerCase() === STATIC_USER.email.toLowerCase();
    const passwordOk = String(password || '') === STATIC_PASSWORD;
    if (!emailOk || !passwordOk) {
      throw new Error('邮箱或密码错误');
    }
    await writeStaticSession();
  } catch (error) {
    console.error('Error during sign in:', error);
    throw error;
  }
};

/** **************************************
 * Sign up
 *************************************** */

// ----------------------------------------------------------------------

export const signUp = async () => {
  try {
    await writeStaticSession();
  } catch (error) {
    console.error('Error during sign up:', error);
    throw error;
  }
};

/** **************************************
 * Sign out
 *************************************** */

// ----------------------------------------------------------------------

export const signOut = async () => {
  try {
    await setSession(null);
    sessionStorage.removeItem(JWT_USER_STORAGE_KEY);
  } catch (error) {
    console.error('Error during sign out:', error);
    throw error;
  }
};
