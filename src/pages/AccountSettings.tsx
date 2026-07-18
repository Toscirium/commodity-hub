import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, FileText, Shield, Trash2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import ManageSubscriptionButton from '@/components/ManageSubscriptionButton';

const AccountSettings: React.FC = () => {
  const auth = useAuth();
  const navigate = useNavigate();
  const user = auth?.user;
  const isGuest = auth?.isGuest ?? true;
  const isPremium = auth?.isPremium ?? false;
  const tier = (auth as { tier?: string } | null)?.tier ?? 'free';

  if (isGuest || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Sign In Required</CardTitle>
            <CardDescription>You must be signed in to access account settings.</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button onClick={() => navigate('/auth')}>Sign In</Button>
            <Button variant="outline" onClick={() => navigate('/')}>Back</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
  const displayName = meta.full_name || meta.name || user.email || 'Account';

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/"><ArrowLeft className="w-4 h-4 mr-1" /> Dashboard</Link>
          </Button>
        </div>

        <div>
          <h1 className="text-2xl font-semibold">Account Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your profile, subscription and preferences.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><User className="w-4 h-4" /> Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span>{displayName}</span></div>
            <Separator />
            <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span className="break-all">{user.email}</span></div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Plan</span>
              <Badge variant={isPremium ? 'default' : 'secondary'} className="capitalize">{tier}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Subscription</CardTitle>
            <CardDescription>
              {isPremium ? 'Manage or cancel your subscription through the app store.' : 'Upgrade to unlock premium markets and tools.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isPremium ? (
              <ManageSubscriptionButton className="w-full sm:w-auto" />
            ) : (
              <Button onClick={() => navigate('/?upgrade=1')}>View Premium</Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Button variant="outline" className="justify-start" asChild>
              <Link to="/news-settings"><Bell className="w-4 h-4 mr-2" /> News & alert preferences</Link>
            </Button>
            <Button variant="outline" className="justify-start" asChild>
              <Link to="/price-alerts"><Bell className="w-4 h-4 mr-2" /> Price alerts</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Legal</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Button variant="ghost" className="justify-start" asChild>
              <Link to="/privacy-policy"><Shield className="w-4 h-4 mr-2" /> Privacy policy</Link>
            </Button>
            <Button variant="ghost" className="justify-start" asChild>
              <Link to="/terms-of-service"><FileText className="w-4 h-4 mr-2" /> Terms of service</Link>
            </Button>
            <Button variant="ghost" className="justify-start" asChild>
              <Link to="/licenses"><FileText className="w-4 h-4 mr-2" /> Open-source attributions</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">Danger zone</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" asChild>
              <Link to="/delete-account"><Trash2 className="w-4 h-4 mr-2" /> Delete account</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AccountSettings;