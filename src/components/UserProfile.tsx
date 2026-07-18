import React from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { User, LogOut, Settings, Crown, Trash2, CreditCard } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';
import ManageSubscriptionButton from '@/components/ManageSubscriptionButton';

const UserProfile = () => {
  const auth = useAuth();
  const { user, profile, signOut, isGuest } = auth ?? ({} as any);
  const isPremium = Boolean(auth?.isPremium);

  // Show signed-in UI as soon as we have a Supabase user, even if the
  // `profiles` row hasn't loaded yet. Otherwise the header keeps showing
  // "Sign In" right after a successful Google OAuth round-trip.
  if (!user) {
    return (
      <div className="flex items-center gap-1.5">
        <Link to="/auth">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 px-2">
            <User className="w-3 h-3" />
            <span className="hidden sm:inline">Sign In</span>
            <span className="sm:hidden">Sign</span>
          </Button>
        </Link>
        <Link to="/auth">
          <Button size="sm" className="gap-1.5 text-xs h-8 px-2">
            <span className="hidden sm:inline">Sign Up Free</span>
            <span className="sm:hidden">Join</span>
          </Button>
        </Link>
      </div>
    );
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Prefer the loaded profile, but fall back to the Supabase user metadata
  // (Google provides full_name/name + avatar_url/picture) so the avatar and
  // menu render immediately after sign-in.
  const meta: any = (user as any)?.user_metadata ?? {};
  const displayName: string =
    profile?.full_name || meta.full_name || meta.name || user?.email || 'Account';
  const displayEmail: string = profile?.email || user?.email || '';
  const displayAvatar: string | undefined =
    profile?.avatar_url || meta.avatar_url || meta.picture || undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative aspect-square h-12 w-12 min-h-12 min-w-12 p-0 rounded-full flex items-center justify-center">
          <Avatar className="aspect-square h-12 w-12">
            <AvatarImage src={displayAvatar} alt={displayName} />
            <AvatarFallback className="bg-primary/10 text-primary font-medium">
              {getInitials(displayName)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64 sm:w-56 mr-2 sm:mr-0" align="end" forceMount>
        <DropdownMenuLabel className="font-normal p-4">
          <div className="flex flex-col space-y-3">
            <p className="text-sm font-medium leading-none truncate">{displayName}</p>
            <p className="text-xs leading-none text-muted-foreground break-words">
              {displayEmail}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer mobile-touch-target px-4 py-3" asChild>
          <Link to="/account-settings">
            <Settings className="mr-3 h-4 w-4" />
            <span className="text-sm">Account Settings</span>
          </Link>
        </DropdownMenuItem>
        {isPremium && (
          <>
            <DropdownMenuSeparator />
            <div className="px-4 py-3">
              <ManageSubscriptionButton className="w-full justify-start" />
            </div>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer mobile-touch-target px-4 py-3" asChild>
          <Link to="/delete-account">
            <Trash2 className="mr-3 h-4 w-4 text-destructive" />
            <span className="text-sm text-destructive">Delete Account</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          className="cursor-pointer text-red-600 focus:text-red-600 mobile-touch-target px-4 py-3"
          onClick={signOut}
        >
          <LogOut className="mr-3 h-4 w-4" />
          <span className="text-sm">Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserProfile;