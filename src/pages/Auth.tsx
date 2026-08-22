import React, { useState, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TrendingUp, Eye, EyeOff, Loader2, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';
import AuthHealthPanel from '@/components/auth/AuthHealthPanel';

const Auth = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [signupError, setSignupError] = useState<string | null>(null);
  const [signinError, setSigninError] = useState<string | null>(null);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  // When set, the card swaps to the "enter the 6-digit code" screen. Codes
  // are the primary path for confirming signups and starting password
  // resets — unlike email links they don't depend on the browser → intent →
  // deep-link → PKCE chain that keeps breaking on native. The emailed links
  // still work as a fallback for users who prefer tapping them.
  const [pendingVerification, setPendingVerification] = useState<{
    email: string;
    type: 'signup' | 'recovery';
  } | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);

  // Uncontrolled inputs (refs) — required on Android WebView so that Gboard's
  // IME composition (keyCode 229) is not interrupted by React re-renders,
  // which is what causes Backspace to appear dead in the installed app.
  const signinEmailRef = useRef<HTMLInputElement>(null);
  const signinPasswordRef = useRef<HTMLInputElement>(null);
  const signupNameRef = useRef<HTMLInputElement>(null);
  const signupEmailRef = useRef<HTMLInputElement>(null);
  const signupPasswordRef = useRef<HTMLInputElement>(null);
  const signupConfirmRef = useRef<HTMLInputElement>(null);
  const resetEmailRef = useRef<HTMLInputElement>(null);
  const otpRef = useRef<HTMLInputElement>(null);

  // NOTE: We intentionally do NOT track per-keystroke validity state.
  // On Android WebView, any React re-render during composition causes
  // visible typing lag. Validation happens in the submit handlers, and
  // the native `required` attribute provides the cheap baseline UX.

  const { user, signIn, signUp, signInWithGoogle, resetPassword, resendConfirmation, verifyEmailCode, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Only redirect if user is authenticated and specifically came to auth page
  // Allow users to browse the app without authentication

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = signinEmailRef.current?.value.trim() ?? '';
    const password = signinPasswordRef.current?.value ?? '';
    if (!email || !password) return;

    setSigninError(null);
    setUnconfirmedEmail(null);
    setIsLoading(true);
    const { error } = await signIn(email, password);
    setIsLoading(false);

    if (error) {
      const message = error instanceof Error ? error.message : 'We could not sign you in. Please try again.';
      setSigninError(message);
      // Supabase's signInWithPassword rejects an unconfirmed account with
      // this exact message — that's a dead end without a resend option,
      // since the original confirmation link may have expired, gone to a
      // stale device, or never arrived at all.
      if (/email.*not.*confirm/i.test(message)) {
        setUnconfirmedEmail(email);
      }
    }
  };

  const handleResendConfirmation = async () => {
    if (!unconfirmedEmail) return;
    setIsResending(true);
    const { error } = await resendConfirmation(unconfirmedEmail);
    setIsResending(false);
    if (!error) {
      // Fresh email is on its way — take the user straight to the code
      // entry screen so they can finish without ever leaving the app.
      setSigninError(null);
      setPendingVerification({ email: unconfirmedEmail, type: 'signup' });
      setUnconfirmedEmail(null);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingVerification) return;
    const code = otpRef.current?.value.trim() ?? '';
    if (!code) return;

    setOtpError(null);
    setIsLoading(true);
    const { error, session } = await verifyEmailCode(
      pendingVerification.email,
      code,
      pendingVerification.type
    );
    setIsLoading(false);

    if (error || !session) {
      setOtpError(
        error instanceof Error
          ? error.message
          : 'That code was not accepted. Check for a newer email and try again.'
      );
      otpRef.current?.select();
      return;
    }

    if (pendingVerification.type === 'recovery') {
      // Session is established — send them to set the new password.
      // recovery=1 tells ResetPassword not to look for its own code params.
      navigate('/reset-password?recovery=1', { replace: true });
      return;
    }
    // Signup: the session lands via onAuthStateChange → `user` is set →
    // the <Navigate to="/" /> below redirects into the app.
    setPendingVerification(null);
  };

  const handleResendCode = async () => {
    if (!pendingVerification) return;
    setIsResending(true);
    const { error } =
      pendingVerification.type === 'signup'
        ? await resendConfirmation(pendingVerification.email)
        : await resetPassword(pendingVerification.email);
    setIsResending(false);
    if (!error && otpRef.current) otpRef.current.value = '';
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = signupEmailRef.current?.value.trim() ?? '';
    const password = signupPasswordRef.current?.value ?? '';
    const fullName = signupNameRef.current?.value.trim() ?? '';
    const confirm = signupConfirmRef.current?.value ?? '';
    setSignupError(null);
    if (!email || !password || !fullName || !confirm) {
      setSignupError('Please complete every field to create your account.');
      return;
    }
    if (password !== confirm) {
      setSignupError('Passwords do not match. Please enter the same password twice.');
      signupConfirmRef.current?.focus();
      return;
    }

    setIsLoading(true);
    const { error } = await signUp(email, password, fullName);
    setIsLoading(false);
    if (error) {
      setSignupError(error instanceof Error ? error.message : 'We could not create your account. Please try again.');
      return;
    }
    // Account created, confirmation email sent — go straight to the code
    // entry screen so the whole flow finishes inside the app.
    setPendingVerification({ email, type: 'signup' });
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    const { error } = await signInWithGoogle();
    if (error) {
      setIsLoading(false);
      return;
    }
    setIsLoading(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = resetEmailRef.current?.value.trim() ?? '';
    if (!email) return;

    setIsLoading(true);
    const { error } = await resetPassword(email);
    setIsLoading(false);

    if (!error) {
      // Reset email sent — offer the in-app code path immediately instead
      // of leaving the user to fight the emailed link on native.
      setShowForgotPassword(false);
      setPendingVerification({ email, type: 'recovery' });
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Redirect authenticated users back to the app
  if (user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="text-center space-y-4">
          <Link 
            to="/" 
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
          
          <div className="flex items-center justify-center gap-3">
            <div className="w-12 h-12 bg-primary/15 ring-1 ring-primary/30 rounded-md flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-xl font-semibold tracking-tight">Commodity Hub</h1>
              <p className="text-sm text-muted-foreground">Real-time commodity prices & insights</p>
            </div>
          </div>
        </div>

        <Card className="p-4 sm:p-6 bg-card border border-border mobile-card">
          {pendingVerification && (
            <div className="space-y-4">
              <div className="text-center space-y-2">
                <h2 className="text-xl font-semibold">
                  {pendingVerification.type === 'signup' ? 'Confirm your email' : 'Reset your password'}
                </h2>
                <p className="text-sm text-muted-foreground">
                  We sent a 6-digit code to{' '}
                  <span className="font-medium text-foreground">{pendingVerification.email}</span>.
                  Enter it below{pendingVerification.type === 'recovery' ? ' to choose a new password' : ''}.
                </p>
              </div>

              <form onSubmit={handleVerifyCode} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="otp-code">Verification code</Label>
                  <Input
                    id="otp-code"
                    name="code"
                    type="text"
                    placeholder="123456"
                    ref={otpRef}
                    required
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    maxLength={10}
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className="mobile-input text-center text-lg tracking-[0.5em]"
                  />
                </div>

                {otpError && (
                  <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert" aria-live="polite">
                    {otpError}
                  </p>
                )}

                <Button type="submit" className="w-full mobile-button-large" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    'Verify'
                  )}
                </Button>
              </form>

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setPendingVerification(null);
                    setOtpError(null);
                  }}
                  className="text-muted-foreground hover:text-primary"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={isResending}
                  className="text-primary hover:underline disabled:opacity-50"
                >
                  {isResending ? 'Sending…' : 'Resend code'}
                </button>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                The code expires shortly — request a new one if it stops working.
              </p>
            </div>
          )}

          {!pendingVerification && (
          <Tabs defaultValue="signin" className="space-y-4 sm:space-y-6">
            <TabsList className="grid w-full grid-cols-2 h-12 mobile-touch-target">
              <TabsTrigger value="signin" className="mobile-touch-target">Sign In</TabsTrigger>
              <TabsTrigger value="signup" className="mobile-touch-target">Sign Up</TabsTrigger>
            </TabsList>

            {/* Sign In Tab */}
            <TabsContent value="signin" className="space-y-4">
              <div className="text-center space-y-2">
                <h2 className="text-xl font-semibold">Welcome back</h2>
                <p className="text-sm text-muted-foreground">
                  Sign in to track live commodity prices
                </p>
              </div>

              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signin-email">Email</Label>
                  <Input
                    id="signin-email"
                    name="email"
                    type="email"
                    placeholder="your@email.com"
                    ref={signinEmailRef}

                    required
                    autoComplete="email"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    inputMode="email"
                    className="mobile-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signin-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="signin-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Your password"
                      ref={signinPasswordRef}

                      required
                      autoComplete="current-password"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      className="pr-12 mobile-input"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent mobile-touch-target"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotPassword(true);
                    }}
                    className="text-sm text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>

                {signinError && (
                  <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert" aria-live="polite">
                    {signinError}
                  </p>
                )}

                {unconfirmedEmail && (
                  <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2">
                    <p className="text-xs text-muted-foreground">
                      Didn't get the email, or has the code expired?
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={handleResendConfirmation}
                      disabled={isResending}
                    >
                      {isResending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        'Resend email'
                      )}
                    </Button>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full mobile-button-large"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Sign In'
                  )}
                </Button>
              </form>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <Separator className="w-full" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>

              <Button 
                type="button"
                variant="outline" 
                className="w-full mobile-button-large"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                )}
                Continue with Google
              </Button>
            </TabsContent>

            {/* Sign Up Tab */}
            <TabsContent value="signup" className="space-y-4">
              <div className="text-center space-y-2">
                <h2 className="text-xl font-semibold">Create account</h2>
                <p className="text-sm text-muted-foreground">
                  Track global commodity prices in real time
                </p>
              </div>

              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Full Name</Label>
                  <Input
                    id="signup-name"
                    name="fullName"
                    type="text"
                    placeholder="John Doe"
                    ref={signupNameRef}

                    required
                    autoComplete="name"
                    className="mobile-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    name="email"
                    type="email"
                    placeholder="your@email.com"
                    ref={signupEmailRef}

                    required
                    autoComplete="email"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    inputMode="email"
                    className="mobile-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="signup-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Choose a strong password"
                      ref={signupPasswordRef}

                      required
                      minLength={8}
                      autoComplete="new-password"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      className="pr-10 mobile-input"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Use at least 8 characters, including uppercase, lowercase, and a number.</p>
                </div>

                {signupError && (
                  <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert" aria-live="polite">
                    {signupError}
                  </p>
                )}

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <Input
                    id="confirm-password"
                    name="confirmPassword"
                    type="password"
                    placeholder="Confirm your password"
                    ref={signupConfirmRef}

                    required
                    autoComplete="new-password"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className="mobile-input"
                  />
                </div>

                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    'Create Account'
                  )}
                </Button>
              </form>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <Separator className="w-full" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>

              <Button 
                type="button"
                variant="outline" 
                className="w-full"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                )}
                Continue with Google
              </Button>
            </TabsContent>
          </Tabs>
          )}

          {/* Forgot Password dialog. Uses Radix Dialog rather than a
              hand-rolled `fixed inset-0` overlay: the old one was nested
              inside this Card, so on Android WebView it inherited the
              card's stacking/scroll context and jumped around when the
              soft keyboard opened. Dialog portals to <body>, traps focus,
              locks background scroll, and closes on Escape/back. */}
          <Dialog open={showForgotPassword} onOpenChange={setShowForgotPassword}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Reset password</DialogTitle>
                <DialogDescription>
                  Enter your email address and we'll send you a 6-digit code to reset your password.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email</Label>
                  <Input
                    id="reset-email"
                    name="email"
                    type="email"
                    placeholder="your@email.com"
                    ref={resetEmailRef}
                    defaultValue={
                      signinEmailRef.current?.value ||
                      signupEmailRef.current?.value ||
                      ''
                    }

                    required
                    autoComplete="email"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    inputMode="email"
                    className="mobile-input"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      'Send code'
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowForgotPassword(false)}
                    disabled={isLoading}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          <div className="mt-6 text-center space-y-2">
              <p className="text-xs text-muted-foreground">
                By continuing, you agree to our{" "}
                <a href="/terms-of-service" className="underline hover:text-primary">
                  terms of service
                </a>
                {" and "}
                <a href="/privacy-policy" className="underline hover:text-primary">
                  privacy policy
                </a>
                .
              </p>
          </div>
        </Card>

        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            Need help? Contact our support team for assistance.
          </p>
        </div>

        <AuthHealthPanel />
      </div>
    </div>
  );
};

export default Auth;
