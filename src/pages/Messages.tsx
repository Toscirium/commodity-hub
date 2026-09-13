import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Flag, MessageCircle, MoreVertical, Paperclip, Plus, Search, Send, ShieldOff, Smile } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { useVirtualKeyboard } from '@/hooks/useVirtualKeyboard';

type Reaction = { emoji: string; count: number; reacted_by_me: boolean };
type LinkPreview = { url: string; title: string | null; description: string | null; image: string | null; domain: string };
type Conversation = { conversation_id: string; participant_id: string; participant_name: string; participant_avatar_url: string | null; last_message: string | null; last_message_at: string | null; unread_count: number };
type Message = {
  id: string; sender_id: string; sender_name: string; body: string; created_at: string;
  attachment_url?: string | null; attachment_mime?: string | null; attachment_width?: number | null; attachment_height?: number | null;
  link_preview?: LinkPreview | null; reactions?: Reaction[];
};
type Person = { id: string; display_name: string; avatar_url: string | null };

// Mirrors the CHECK constraint on message_reactions in the
// 20260819210000 migration — keep both in sync.
const REACTION_EMOJI = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🎉', '🔥'];
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGE_FILE_BYTES = 5 * 1024 * 1024; // server caps decoded size at 6MB; stay comfortably under that pre-base64
const PLACEHOLDER_PHOTO_CAPTION = '📷 Photo';
const TYPING_BROADCAST_THROTTLE_MS = 2500;
const TYPING_INDICATOR_TTL_MS = 4000;

const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
const when = (value: string | null) => value ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : '';

// External links (a shared URL's link-preview card, or a full-size image
// tap) should open outside the app's own WebView on native, same pattern
// already used for the Play/App Store "manage subscription" links.
const openExternal = async (url: string) => {
  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
};

const readImageDimensions = (dataUrl: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = dataUrl;
  });

const Messages = () => {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [draft, setDraft] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [people, setPeople] = React.useState<Person[]>([]);
  const [starting, setStarting] = React.useState(false);
  const [blockedIds, setBlockedIds] = React.useState<Set<string>>(new Set());
  const [reportTarget, setReportTarget] = React.useState<Message | null>(null);
  const [reportReason, setReportReason] = React.useState('');
  const [uploadingImage, setUploadingImage] = React.useState(false);
  const [typingName, setTypingName] = React.useState<string | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const keyboard = useVirtualKeyboard();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const typingChannelRef = React.useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTypingSentRef = React.useRef(0);
  const typingClearTimeoutRef = React.useRef<number>();
  // Whether the thread was scrolled near the bottom right before the last
  // `messages` update — gates auto-scroll so a reaction/link-preview
  // refresh (or a message arriving while you're reading old history)
  // doesn't yank the view down. Reset to true on every conversation switch
  // so opening a thread always lands on the latest message.
  const isNearBottomRef = React.useRef(true);

  const invoke = React.useCallback(async (action: string, payload: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke('messages', { body: { action, ...payload } });
    if (error || data?.error) throw new Error(data?.error ?? error?.message ?? 'Request failed');
    return data;
  }, []);

  const active = conversations.find((conversation) => conversation.conversation_id === activeId) ?? null;
  const loadConversations = React.useCallback(async () => {
    try { setConversations((await invoke('list_conversations')).conversations ?? []); }
    catch (err) { toast({ title: 'Could not load messages', description: (err as Error).message, variant: 'destructive' }); }
  }, [invoke, toast]);
  const loadMessages = React.useCallback(async (conversationId: string) => {
    try { setMessages((await invoke('list_messages', { conversation_id: conversationId })).messages ?? []); }
    catch { /* keep showing the last-known messages rather than blanking the view */ }
  }, [invoke]);
  const loadBlocked = React.useCallback(async () => {
    try { setBlockedIds(new Set(((await invoke('list_blocked')).blocked ?? []).map((p: Person) => p.id))); }
    catch { /* non-critical */ }
  }, [invoke]);

  React.useEffect(() => { if (user) { void loadConversations(); void loadBlocked(); } }, [user, loadConversations, loadBlocked]);
  React.useEffect(() => {
    isNearBottomRef.current = true;
    setTypingName(null);
    if (!activeId) { setMessages([]); return; }
    void loadMessages(activeId);
    void invoke('mark_read', { conversation_id: activeId });
    const channel = supabase.channel(`messages:${activeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeId}` }, () => {
        void loadMessages(activeId); void loadConversations(); void invoke('mark_read', { conversation_id: activeId });
      })
      // message_reactions has no conversation_id column to filter on, so
      // this listens across all of the user's conversations — RLS still
      // limits delivery to rows they're allowed to see (same reliance the
      // messages-table subscription above already has), it's just not
      // narrowed to `activeId` the way that one is. The extra reload only
      // fires while a conversation is open, so the cost is one wasted
      // refetch if the reaction was on a different thread — not a
      // correctness issue, just a minor inefficiency.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, () => { void loadMessages(activeId); })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!user || payload?.user_id === user.id) return;
        setTypingName(typeof payload?.name === 'string' ? payload.name : 'Someone');
        window.clearTimeout(typingClearTimeoutRef.current);
        typingClearTimeoutRef.current = window.setTimeout(() => setTypingName(null), TYPING_INDICATOR_TTL_MS);
      })
      .subscribe();
    typingChannelRef.current = channel;
    return () => { void supabase.removeChannel(channel); typingChannelRef.current = null; window.clearTimeout(typingClearTimeoutRef.current); };
  }, [activeId, invoke, loadConversations, loadMessages, user]);
  React.useEffect(() => {
    if (isNearBottomRef.current) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  // The keyboard opening shortens the transcript's viewport, which would
  // otherwise leave the newest messages hidden behind it — the user taps the
  // composer and loses sight of what they were replying to.
  React.useEffect(() => {
    if (keyboard.isVisible && isNearBottomRef.current) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [keyboard.isVisible]);
  React.useEffect(() => {
    const term = search.trim();
    if (!user || term.length < 2) { setPeople([]); return; }
    const timeout = window.setTimeout(async () => {
      try { setPeople((await invoke('search_users', { search_text: term })).people ?? []); } catch { /* ignore */ }
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [search, user, invoke]);

  const handleMessagesScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  const selectConversation = (id: string) => { setActiveId(id); setSearch(''); setPeople([]); };
  const startConversation = async (person: Person) => {
    setStarting(true);
    try {
      const data = await invoke('start_conversation', { recipient_id: person.id });
      await loadConversations(); selectConversation(data.conversation_id as string);
    } catch (err) { toast({ title: 'Could not start conversation', description: (err as Error).message, variant: 'destructive' }); }
    finally { setStarting(false); }
  };
  const send = async () => {
    const body = draft.trim();
    if (!body || !activeId || !user) return;
    setDraft('');
    try { await invoke('send', { conversation_id: activeId, body }); void loadMessages(activeId); void loadConversations(); }
    catch (err) {
      setDraft(body);
      const msg = (err as Error).message;
      toast({ title: 'Message not sent', description: msg === 'rate_limited' ? "You're sending messages too fast — try again shortly." : msg === 'blocked' ? "You can't message this person." : msg, variant: 'destructive' });
    }
  };
  const handleDraftChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(event.target.value);
    if (!activeId || !user) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < TYPING_BROADCAST_THROTTLE_MS) return;
    lastTypingSentRef.current = now;
    const name = profile?.full_name || user.email || 'Someone';
    void typingChannelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { user_id: user.id, name } });
  };
  const pickImage = () => fileInputRef.current?.click();
  const handleImageSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same file next time
    if (!file || !activeId) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast({ title: 'Unsupported image type', description: 'Use JPEG, PNG, WebP, or GIF.', variant: 'destructive' });
      return;
    }
    if (file.size > MAX_IMAGE_FILE_BYTES) {
      toast({ title: 'Image too large', description: 'Please choose an image under 5MB.', variant: 'destructive' });
      return;
    }
    setUploadingImage(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error ?? new Error('Could not read the selected file'));
        reader.readAsDataURL(file);
      });
      const base64 = dataUrl.split(',')[1] ?? '';
      const { width, height } = await readImageDimensions(dataUrl);
      await invoke('send_image', { conversation_id: activeId, image_base64: base64, mime_type: file.type, width, height });
      void loadMessages(activeId); void loadConversations();
    } catch (err) {
      const msg = (err as Error).message;
      toast({ title: 'Could not send image', description: msg === 'rate_limited' ? "You're sending messages too fast — try again shortly." : msg === 'blocked' ? "You can't message this person." : msg === 'image_too_large' ? 'That image is too large.' : msg, variant: 'destructive' });
    } finally {
      setUploadingImage(false);
    }
  };
  const toggleReaction = async (message: Message, emoji: string) => {
    if (!activeId) return;
    const mine = message.reactions?.find((r) => r.emoji === emoji)?.reacted_by_me ?? false;
    // Optimistic update — reconciled with the server on failure below, and
    // otherwise confirmed for real by the message_reactions realtime reload.
    setMessages((prev) => prev.map((m) => {
      if (m.id !== message.id) return m;
      const reactions = m.reactions ?? [];
      const idx = reactions.findIndex((r) => r.emoji === emoji);
      const next = [...reactions];
      if (mine) {
        if (idx === -1) return m;
        const updated = { ...next[idx], count: next[idx].count - 1, reacted_by_me: false };
        if (updated.count <= 0) next.splice(idx, 1); else next[idx] = updated;
      } else if (idx === -1) {
        next.push({ emoji, count: 1, reacted_by_me: true });
      } else {
        next[idx] = { ...next[idx], count: next[idx].count + 1, reacted_by_me: true };
      }
      return { ...m, reactions: next };
    }));
    try { await invoke(mine ? 'remove_reaction' : 'add_reaction', { message_id: message.id, emoji }); }
    catch { void loadMessages(activeId); }
  };
  const toggleBlock = async () => {
    if (!active) return;
    const nowBlocked = blockedIds.has(active.participant_id);
    try {
      await invoke(nowBlocked ? 'unblock_user' : 'block_user', { user_id: active.participant_id });
      setBlockedIds((prev) => { const next = new Set(prev); if (nowBlocked) next.delete(active.participant_id); else next.add(active.participant_id); return next; });
      toast({ title: nowBlocked ? `Unblocked ${active.participant_name}` : `Blocked ${active.participant_name}`, description: nowBlocked ? 'They can message you again.' : "They can no longer message you, and won't show up in search." });
    } catch (err) { toast({ title: 'Could not update block', description: (err as Error).message, variant: 'destructive' }); }
  };
  const submitReport = async () => {
    if (!reportTarget || !reportReason.trim()) return;
    try {
      await invoke('report_message', { message_id: reportTarget.id, reason: reportReason.trim() });
      toast({ title: 'Report sent', description: "Thanks — we'll take a look." });
    } catch (err) { toast({ title: 'Could not send report', description: (err as Error).message, variant: 'destructive' }); }
    finally { setReportTarget(null); setReportReason(''); }
  };

  if (!loading && !user) return <div className="min-h-screen bg-background p-6"><div className="mx-auto max-w-md pt-24 text-center"><MessageCircle className="mx-auto h-10 w-10 text-primary" /><h1 className="mt-4 text-2xl font-semibold">Sign in to message traders</h1><p className="mt-2 text-sm text-muted-foreground">Share market tips and strategies privately with the Commodity Hub community.</p><Button className="mt-6" asChild><Link to="/auth">Sign in</Link></Button></div></div>;

  return <div className={`min-h-[100dvh] bg-background ${keyboard.isVisible ? '' : 'pb-20'}`}><header className="sticky top-0 z-20 border-b bg-background px-4 py-3"><div className="mx-auto flex max-w-[1600px] items-center gap-3"><Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Go back"><ArrowLeft className="h-4 w-4" /></Button><div><p className="text-xs font-medium uppercase tracking-[0.12em] text-primary">Community</p><h1 className="text-xl font-semibold">Messages</h1></div></div></header>
    <main className="mx-auto grid max-w-[1600px] gap-4 p-4 md:grid-cols-[320px_1fr]">
      <Card className={`${active ? 'hidden md:block' : ''} min-h-[calc(100dvh-9rem)]`}><CardContent className="p-3"><div className="relative mb-3"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a member" className="pl-9" /></div>
        {people.length > 0 && <div className="mb-3 overflow-hidden rounded-lg border"><p className="px-3 py-2 text-xs font-medium text-muted-foreground">Start a conversation</p>{people.map((person) => <button key={person.id} type="button" disabled={starting} onClick={() => void startConversation(person)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted disabled:opacity-50"><Avatar className="h-8 w-8"><AvatarImage src={person.avatar_url ?? undefined} /><AvatarFallback>{initials(person.display_name)}</AvatarFallback></Avatar><span className="flex-1 truncate text-sm font-medium">{person.display_name}</span><Plus className="h-4 w-4 text-muted-foreground" /></button>)}</div>}
        {conversations.length ? <div className="space-y-1">{conversations.map((conversation) => <button key={conversation.conversation_id} type="button" onClick={() => selectConversation(conversation.conversation_id)} className={`flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left ${activeId === conversation.conversation_id ? 'bg-primary/10' : 'hover:bg-muted'}`}><Avatar><AvatarImage src={conversation.participant_avatar_url ?? undefined} /><AvatarFallback>{initials(conversation.participant_name)}</AvatarFallback></Avatar><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold">{conversation.participant_name}</span><span className="shrink-0 text-[10px] text-muted-foreground">{when(conversation.last_message_at)}</span></span><span className="flex items-center gap-2"><span className="truncate text-xs text-muted-foreground">{conversation.last_message ?? 'Start the conversation'}</span>{conversation.unread_count > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{conversation.unread_count}</span>}</span></span></button>)}</div> : <div className="px-3 py-12 text-center"><MessageCircle className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 text-sm font-medium">No conversations yet</p><p className="mt-1 text-xs text-muted-foreground">Search for a member to share an idea.</p></div>}</CardContent></Card>
      {/* Fixed height (not min-height) so the composer pins to the bottom of
          the viewport and the transcript scrolls inside it. With min-height the
          card could grow past the viewport, pushing the composer off-screen.
          dvh rather than vh: vh is locked to the largest viewport and never
          shrinks for the soft keyboard. */}
      <Card className={`${!active ? 'hidden md:flex' : 'flex'} h-[calc(100dvh-9rem)] flex-col`}><CardContent className="flex min-h-0 flex-1 flex-col p-0">{active ? <>
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <Button className="md:hidden" variant="ghost" size="icon" onClick={() => setActiveId(null)} aria-label="All conversations"><ArrowLeft className="h-4 w-4" /></Button>
          <Avatar><AvatarImage src={active.participant_avatar_url ?? undefined} /><AvatarFallback>{initials(active.participant_name)}</AvatarFallback></Avatar>
          <div className="flex-1"><p className="text-sm font-semibold">{active.participant_name}</p><p className="text-xs text-muted-foreground">{blockedIds.has(active.participant_id) ? 'Blocked' : 'Private conversation'}</p></div>
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Conversation options"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end"><DropdownMenuItem onClick={() => void toggleBlock()}><ShieldOff className="mr-2 h-4 w-4" />{blockedIds.has(active.participant_id) ? `Unblock ${active.participant_name}` : `Block ${active.participant_name}`}</DropdownMenuItem></DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div ref={scrollRef} onScroll={handleMessagesScroll} style={{ overscrollBehavior: 'contain' }} className="flex-1 space-y-3 overflow-y-auto p-4">{messages.map((message) => {
          const mine = message.sender_id === user?.id;
          const showCaption = message.body && !(message.attachment_url && message.body === PLACEHOLDER_PHOTO_CAPTION);
          return <div key={message.id} className={`group flex items-end gap-1.5 ${mine ? 'justify-end' : 'justify-start'}`}>
            {!mine && <button type="button" onClick={() => setReportTarget(message)} className="hidden shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100 sm:block" aria-label="Report message" title="Report message"><Flag className="h-3.5 w-3.5" /></button>}
            <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
              {message.attachment_url && <button type="button" onClick={() => void openExternal(message.attachment_url!)} className="mb-1 block overflow-hidden rounded-lg"><img src={message.attachment_url} alt="Shared attachment" loading="lazy" decoding="async" style={message.attachment_width && message.attachment_height ? { aspectRatio: `${message.attachment_width} / ${message.attachment_height}` } : undefined} className="max-h-64 w-full max-w-xs object-cover" /></button>}
              {showCaption && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
              {message.link_preview && <button type="button" onClick={() => void openExternal(message.link_preview!.url)} className="mt-1 block w-full overflow-hidden rounded-lg border border-border/60 bg-card text-left text-foreground">
                {message.link_preview.image && <img src={message.link_preview.image} alt="" loading="lazy" decoding="async" className="h-28 w-full object-cover" />}
                <span className="block px-2.5 py-1.5"><span className="block truncate text-xs font-medium">{message.link_preview.title ?? message.link_preview.domain}</span><span className="block truncate text-[10px] text-muted-foreground">{message.link_preview.domain}</span></span>
              </button>}
              <p className={`mt-1 text-[10px] ${mine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{when(message.created_at)}</p>
              {(message.reactions?.length ?? 0) > 0 && <div className="mt-1 flex flex-wrap gap-1">{message.reactions!.map((r) => <button key={r.emoji} type="button" onClick={() => void toggleReaction(message, r.emoji)} className={`rounded-full border px-1.5 py-0.5 text-[11px] ${r.reacted_by_me ? 'border-primary bg-primary/15' : 'border-border/60 bg-background/60'} ${mine ? 'text-primary-foreground' : ''}`}>{r.emoji} {r.count}</button>)}</div>}
            </div>
            <Popover>
              <PopoverTrigger asChild><button type="button" className="hidden shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100 sm:block" aria-label="Add reaction" title="Add reaction"><Smile className="h-3.5 w-3.5" /></button></PopoverTrigger>
              <PopoverContent className="w-auto p-1.5" align={mine ? 'end' : 'start'}><div className="flex gap-1">{REACTION_EMOJI.map((emoji) => <button key={emoji} type="button" onClick={() => void toggleReaction(message, emoji)} className="rounded p-1 text-lg hover:bg-muted">{emoji}</button>)}</div></PopoverContent>
            </Popover>
          </div>;
        })}<div ref={endRef} /></div>
        {typingName && <p className="px-4 pb-1 text-xs italic text-muted-foreground">{typingName} is typing…</p>}
        <div className="border-t p-3">{blockedIds.has(active.participant_id) ? <p className="px-1 text-center text-xs text-muted-foreground">You've blocked {active.participant_name}. Unblock them to send a message.</p> : <div className="flex items-end gap-2">
          <input ref={fileInputRef} type="file" accept={ALLOWED_IMAGE_TYPES.join(',')} className="hidden" onChange={(event) => void handleImageSelected(event)} />
          <Button type="button" variant="ghost" size="icon" onClick={pickImage} disabled={uploadingImage} aria-label="Attach image" title="Attach image">{uploadingImage ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Paperclip className="h-4 w-4" />}</Button>
          <Textarea value={draft} onChange={handleDraftChange} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Share a tip or strategy…" maxLength={4000} className="min-h-11 resize-none" /><Button size="icon" onClick={() => void send()} disabled={!draft.trim()} aria-label="Send message"><Send className="h-4 w-4" /></Button></div>}</div>
      </> : <div className="flex flex-1 flex-col items-center justify-center px-6 text-center"><MessageCircle className="h-10 w-10 text-primary" /><h2 className="mt-4 text-lg font-semibold">Your market conversations</h2><p className="mt-1 max-w-sm text-sm text-muted-foreground">Choose a conversation or find a member to exchange market ideas privately.</p></div>}</CardContent></Card>
    </main>
    <Dialog open={Boolean(reportTarget)} onOpenChange={(open) => { if (!open) { setReportTarget(null); setReportReason(''); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Report message</DialogTitle><DialogDescription>Tell us what's wrong with this message. We'll review it.</DialogDescription></DialogHeader>
        <Textarea value={reportReason} onChange={(event) => setReportReason(event.target.value)} placeholder="What's the issue?" maxLength={500} className="min-h-24" />
        <DialogFooter><Button variant="outline" onClick={() => { setReportTarget(null); setReportReason(''); }}>Cancel</Button><Button onClick={() => void submitReport()} disabled={!reportReason.trim()}>Submit report</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
};

export default Messages;
