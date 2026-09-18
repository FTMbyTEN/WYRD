import { callEndpoint, storeAuthSuccess, clearAuthTokens, type AuthSuccess } from './serverpodClient';

// Ports the wire calls for serverpod_auth_idp_server's email provider (EmailIdpBaseEndpoint)
// and serverpod_auth_core's status endpoint -- registration is multi-step (start -> verify code
// emailed to the user -> finish with a password), unlike the old Node backend's single-step
// username+password register.

export function login(email: string, password: string): Promise<AuthSuccess> {
  return callEndpoint<AuthSuccess>('emailIdp', 'login', { email, password }, { authenticated: false });
}

/** Starts registration; the server emails a verification code to [email]. Returns an
 * accountRequestId (a UUID string) to pass to verifyRegistrationCode. */
export function startRegistration(email: string): Promise<string> {
  return callEndpoint<string>('emailIdp', 'startRegistration', { email }, { authenticated: false });
}

/** Verifies the emailed code and returns a registrationToken to pass to finishRegistration. */
export function verifyRegistrationCode(accountRequestId: string, verificationCode: string): Promise<string> {
  return callEndpoint<string>('emailIdp', 'verifyRegistrationCode', { accountRequestId, verificationCode }, { authenticated: false });
}

export function finishRegistration(registrationToken: string, password: string): Promise<AuthSuccess> {
  return callEndpoint<AuthSuccess>('emailIdp', 'finishRegistration', { registrationToken, password }, { authenticated: false });
}

export async function persistAuth(auth: AuthSuccess): Promise<void> {
  await storeAuthSuccess(auth);
}

export async function signOutDevice(): Promise<void> {
  try {
    await callEndpoint<void>('serverpod_auth_core.status', 'signOutDevice', {});
  } finally {
    await clearAuthTokens();
  }
}

export function isSignedIn(): Promise<boolean> {
  return callEndpoint<boolean>('serverpod_auth_core.status', 'isSignedIn', {});
}
