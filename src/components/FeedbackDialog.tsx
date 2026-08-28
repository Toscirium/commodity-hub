import React from 'react';
import { useLocation } from 'react-router-dom';
import { MessageSquarePlus, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { track } from '@/lib/analytics';

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Lets anyone — signed in or not — say what's wrong without leaving the page.
 * Captures the current route automatically, which is the field that actually
 * makes a report reproducible.
 */
const FeedbackDialog: React.FC<FeedbackDialogProps> = ({ open, onOpenChange }) => {
  const auth = useAuth();
  const location = useLocation();
  const [message, setMessage] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const signedIn = !!auth?.user;

  const submit = async () => {
    const body = message.trim();
    if (!body) return;
    setBusy(true);
    setError(null);
    try {
      const { error: insertError } = await supabase.from('feedback').insert({
        user_id: auth?.user?.id ?? null,
        message: body.slice(0, 4000),
        contact_email: signedIn ? null : (email.trim() || null),
        route: location.pathname,
        user_agent: navigator.userAgent.slice(0, 500),
        app_version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : null,
      });
      if (insertError) throw insertError;
      track('feedback_submitted', { route: location.pathname, signed_in: signedIn });
      setSent(true);
      setMessage('');
      setEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  // Reset back to the form the next time it opens, so a second report doesn't
  // land on the thank-you state.
  const handleOpenChange = (next: boolean) => {
    if (!next) { setSent(false); setError(null); }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        {sent ? (
          <>
            <DialogHeader>
              <DialogTitle>Thanks — that's landed</DialogTitle>
              <DialogDescription>
                It goes straight to the person who builds this. If you left an address, expect a reply.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>Close</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageSquarePlus className="h-5 w-5" /> Send feedback
              </DialogTitle>
              <DialogDescription>
                Broken, confusing, or missing something? Tell me plainly — it reaches me directly.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="feedback-message">What happened?</Label>
                <Textarea
                  id="feedback-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="I tried to… and instead…"
                  rows={5}
                  maxLength={4000}
                  autoFocus
                />
              </div>

              {!signedIn && (
                <div className="space-y-1.5">
                  <Label htmlFor="feedback-email">Email (optional)</Label>
                  <Input
                    id="feedback-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Only if you'd like a reply"
                  />
                </div>
              )}

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Sent with the page you're on ({location.pathname}) and your browser version, so the
                problem can be reproduced.
              </p>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={busy || !message.trim()}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default FeedbackDialog;
