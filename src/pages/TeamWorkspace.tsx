import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Plus, Trash2, UserMinus, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import PremiumPaywall from '@/components/PremiumPaywall';

const SEAT_LIMIT = 5;

type Role = 'owner' | 'editor' | 'viewer';
type TeamSummary = { id: string; name: string; owner_id: string; created_at: string; myRole: Role };
type Member = { user_id: string; role: Role; profile: { email: string; full_name: string | null } | null };
type Comment = { id: string; user_id: string; entity_type: string; entity_id: string | null; body: string; approval_state: 'pending' | 'approved' | 'rejected' | null; created_at: string; profile: { email: string; full_name: string | null } | null };

const nameOf = (p: Member['profile']) => p?.full_name || p?.email || 'Unknown';

const TeamWorkspace: React.FC = () => {
  const auth = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isPro = auth?.isPro ?? false;

  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [paywall, setPaywall] = useState(false);

  const [teamName, setTeamName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('viewer');
  const [commentText, setCommentText] = useState('');
  const [needsApproval, setNeedsApproval] = useState(false);

  const invoke = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('team-workspace', { body });
    if (error || data?.error) throw new Error(data?.error ?? 'Request failed');
    return data;
  };

  const loadTeams = async () => {
    setLoading(true);
    try {
      const data = await invoke({ action: 'list' });
      const list = (data.teams ?? []) as TeamSummary[];
      setTeams(list);
      setSelectedId((prev) => prev ?? list[0]?.id ?? null);
    } catch { /* endpoint may not be deployed yet */ }
    finally { setLoading(false); }
  };

  const loadDetail = async (teamId: string) => {
    try {
      const data = await invoke({ action: 'team_detail', team_id: teamId });
      setMembers(data.members ?? []);
      setComments(data.comments ?? []);
    } catch (err) {
      toast({ title: 'Could not load team', description: (err as Error).message, variant: 'destructive' });
    }
  };

  useEffect(() => { if (auth?.user) loadTeams(); }, [auth?.user]);
  useEffect(() => { if (selectedId) loadDetail(selectedId); }, [selectedId]);

  const selectedTeam = teams.find((t) => t.id === selectedId) ?? null;
  const isOwner = selectedTeam?.myRole === 'owner';
  const canApprove = selectedTeam?.myRole === 'owner' || selectedTeam?.myRole === 'editor';

  const createTeam = async () => {
    if (!teamName.trim()) return;
    if (!isPro) { setPaywall(true); return; }
    setBusy(true);
    try {
      await invoke({ action: 'create_team', name: teamName.trim() });
      setTeamName('');
      await loadTeams();
    } catch (err) {
      toast({ title: 'Could not create team', description: (err as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const inviteMember = async () => {
    if (!selectedId || !inviteEmail.trim()) return;
    setBusy(true);
    try {
      await invoke({ action: 'invite_member', team_id: selectedId, email: inviteEmail.trim(), role: inviteRole });
      setInviteEmail('');
      await loadDetail(selectedId);
    } catch (err) {
      const msg = (err as Error).message;
      const friendly = msg === 'user_not_found' ? "No account with that email yet — they'll need to sign up first."
        : msg === 'already_a_member' ? 'Already on this team.'
        : msg === 'seat_limit_reached' ? `Team is full (max ${SEAT_LIMIT} seats).`
        : msg;
      toast({ title: 'Could not invite', description: friendly, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const removeMember = async (userId: string) => {
    if (!selectedId) return;
    setBusy(true);
    try { await invoke({ action: 'remove_member', team_id: selectedId, user_id: userId }); await loadDetail(selectedId); }
    catch (err) { toast({ title: 'Could not remove member', description: (err as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const changeRole = async (userId: string, role: 'editor' | 'viewer') => {
    if (!selectedId) return;
    setBusy(true);
    try { await invoke({ action: 'update_role', team_id: selectedId, user_id: userId, role }); await loadDetail(selectedId); }
    catch (err) { toast({ title: 'Could not update role', description: (err as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const postComment = async () => {
    if (!selectedId || !commentText.trim()) return;
    setBusy(true);
    try {
      await invoke({ action: 'add_comment', team_id: selectedId, body: commentText.trim(), needs_approval: needsApproval });
      setCommentText(''); setNeedsApproval(false);
      await loadDetail(selectedId);
    } catch (err) { toast({ title: 'Could not post', description: (err as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const setApproval = async (commentId: string, state: 'approved' | 'rejected') => {
    if (!selectedId) return;
    setBusy(true);
    try { await invoke({ action: 'set_approval_state', team_id: selectedId, comment_id: commentId, approval_state: state }); await loadDetail(selectedId); }
    catch (err) { toast({ title: 'Could not update', description: (err as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const deleteTeam = async () => {
    if (!selectedId) return;
    setBusy(true);
    try { await invoke({ action: 'delete_team', team_id: selectedId }); setSelectedId(null); setTeams([]); await loadTeams(); }
    catch (err) { toast({ title: 'Could not delete team', description: (err as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/account-settings')}><ArrowLeft className="mr-2 h-4 w-4" />Account</Button>
        <div>
          <h1 className="text-2xl font-semibold">Team Workspace</h1>
          <p className="text-sm text-muted-foreground">Share notes and approvals with your desk. Included free with Pro — up to {SEAT_LIMIT} seats, no separate charge for teammates.</p>
        </div>

        {loading ? null : teams.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />No team yet</CardTitle>
              <CardDescription>{isPro ? 'Create a team and invite up to ' + (SEAT_LIMIT - 1) + ' teammates — they use their own free accounts.' : 'Team Workspace is a Pro feature. Upgrade to create one; teammates you invite don\'t need their own subscription.'}</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              {isPro ? (
                <>
                  <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Team name, e.g. Trading desk" maxLength={100} />
                  <Button disabled={busy || !teamName.trim()} onClick={createTeam}><Plus className="mr-1 h-4 w-4" />Create</Button>
                </>
              ) : (
                <Button onClick={() => setPaywall(true)}>Upgrade to Pro</Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            {teams.length > 1 && (
              <Select value={selectedId ?? undefined} onValueChange={setSelectedId}>
                <SelectTrigger className="w-full sm:w-64"><SelectValue placeholder="Select a team" /></SelectTrigger>
                <SelectContent>{teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{selectedTeam?.name}</span>
                  <Badge variant="secondary" className="capitalize">{selectedTeam?.myRole}</Badge>
                </CardTitle>
                <CardDescription>{members.length}/{SEAT_LIMIT} seats used</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {members.map((m) => (
                  <div key={m.user_id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                    <div>
                      <p className="font-medium">{nameOf(m.profile)}</p>
                      <p className="text-xs text-muted-foreground">{m.profile?.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isOwner && m.role !== 'owner' ? (
                        <Select value={m.role} onValueChange={(v) => changeRole(m.user_id, v as 'editor' | 'viewer')}>
                          <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="editor">Editor</SelectItem><SelectItem value="viewer">Viewer</SelectItem></SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="outline" className="capitalize">{m.role}</Badge>
                      )}
                      {(isOwner && m.role !== 'owner') || m.user_id === auth?.user?.id ? (
                        <Button size="icon" variant="ghost" disabled={busy} onClick={() => removeMember(m.user_id)}><UserMinus className="h-4 w-4" /></Button>
                      ) : null}
                    </div>
                  </div>
                ))}
                {isOwner && members.length < SEAT_LIMIT && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="teammate@email.com" className="flex-1 min-w-[180px]" />
                    <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as 'editor' | 'viewer')}>
                      <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="editor">Editor</SelectItem><SelectItem value="viewer">Viewer</SelectItem></SelectContent>
                    </Select>
                    <Button disabled={busy || !inviteEmail.trim()} onClick={inviteMember}><Plus className="mr-1 h-4 w-4" />Invite</Button>
                  </div>
                )}
                {isOwner && (
                  <Button variant="outline" className="mt-2 text-destructive" disabled={busy} onClick={deleteTeam}><Trash2 className="mr-1 h-4 w-4" />Delete team</Button>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Notes & approvals</CardTitle><CardDescription>Post a note, or flag it for approval before it counts as sign-off.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                <Textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Share a note with the team…" maxLength={4000} />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Checkbox checked={needsApproval} onCheckedChange={(c) => setNeedsApproval(c === true)} />
                    Needs approval
                  </label>
                  <Button size="sm" disabled={busy || !commentText.trim()} onClick={postComment}>Post</Button>
                </div>
                <div className="space-y-2">
                  {comments.map((c) => (
                    <div key={c.id} className="rounded-md border p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{nameOf(c.profile)}</p>
                        <div className="flex items-center gap-2">
                          {c.approval_state && (
                            <Badge variant={c.approval_state === 'approved' ? 'default' : c.approval_state === 'rejected' ? 'destructive' : 'secondary'} className="capitalize">{c.approval_state}</Badge>
                          )}
                          <span className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
                      {canApprove && c.approval_state === 'pending' && (
                        <div className="mt-2 flex gap-2">
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => setApproval(c.id, 'approved')}><Check className="mr-1 h-4 w-4" />Approve</Button>
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => setApproval(c.id, 'rejected')}><X className="mr-1 h-4 w-4" />Reject</Button>
                        </div>
                      )}
                    </div>
                  ))}
                  {comments.length === 0 && <p className="text-sm text-muted-foreground">No notes yet.</p>}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
      <PremiumPaywall open={paywall} onOpenChange={setPaywall} />
    </div>
  );
};

export default TeamWorkspace;
