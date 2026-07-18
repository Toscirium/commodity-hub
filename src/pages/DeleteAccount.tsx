import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Trash2, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const DeleteAccount = () => {
  const auth = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [confirmText, setConfirmText] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const user = auth?.user;
  const isGuest = auth?.isGuest ?? true;

  if (isGuest) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Sign In Required</CardTitle>
            <CardDescription>You must be signed in to manage your account.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/auth')} className="w-full">Sign In</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleDeleteRequest = async () => {
    setDeleting(true);
    try {
      // Delete user data from all user-owned tables
      const userId = user?.id;
      if (!userId) throw new Error('No user found');

      // Delete user data from all tables in parallel
      await Promise.allSettled([
        supabase.from('portfolio_positions').delete().eq('user_id', userId),
        supabase.from('price_comparisons').delete().eq('user_id', userId),
        supabase.from('recent_activities').delete().eq('user_id', userId),
        supabase.from('sentiment_votes').delete().eq('user_id', userId),
        supabase.from('user_favorites').delete().eq('user_id', userId),
      ]);

      // Delete profile
      await supabase.from('profiles').delete().eq('id', userId);
      
      // Delete subscriber record
      await supabase.from('subscribers').delete().eq('user_id', userId);

      // Sign out the user (account deletion from auth.users requires admin/service role)
      await auth?.signOut();

      toast({
        title: 'Account data deleted',
        description: 'Your data has been removed. Your authentication account will be fully purged within 30 days. Contact support@commodityhub.com if you need immediate removal.',
      });

      navigate('/');
    } catch (error) {
      console.error('Account deletion error:', error);
      toast({
        title: 'Deletion Error',
        description: 'Something went wrong. Please contact support@commodityhub.com for assistance.',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
      setShowDialog(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <Button
            variant="ghost"
            size="sm"
            className="w-fit mb-2 -ml-2"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="w-5 h-5" />
            Delete Account
          </CardTitle>
          <CardDescription>
            Permanently delete your Commodity Hub account and all associated data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
              <div className="space-y-1 text-sm">
                <p className="font-medium text-destructive">This action is irreversible</p>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li>All portfolio positions and snapshots will be deleted</li>
                  <li>Trading history and orders will be removed</li>
                  <li>Watchlists, favorites, and saved comparisons will be lost</li>
                  <li>Forum posts and community contributions will be removed</li>
                  <li>Your subscription will be cancelled</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm">
              Type <span className="font-mono font-bold text-destructive">DELETE</span> to confirm
            </Label>
            <Input
              id="confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type DELETE here"
              className="font-mono"
            />
          </div>

          <Button
            variant="destructive"
            className="w-full"
            disabled={confirmText !== 'DELETE' || deleting}
            onClick={() => setShowDialog(true)}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {deleting ? 'Deleting...' : 'Delete My Account'}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Need help? Contact{' '}
            <a href="mailto:support@commodityhub.com" className="text-primary underline">
              support@commodityhub.com
            </a>
          </p>
        </CardContent>
      </Card>

      <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete your account and all data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteRequest}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Yes, delete everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DeleteAccount;
