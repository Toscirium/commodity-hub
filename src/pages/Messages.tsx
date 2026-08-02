import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageCircle, Plus, Search, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';

type Conversation = { conversation_id: string; participant_id: string; participant_name: string; participant_avatar_url: string | null; last_message: string | null; last_message_at: string | null; unread_count: number };
type Message = { id: string; sender_id: string; sender_name: string; body: string; created_at: string };
type Person = { id: string; display_name: string; avatar_url: string | null };
const db = supabase as any;

const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
const when = (value: string | null) => value ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : '';

const Messages = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [draft, setDraft] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [people, setPeople] = React.useState<Person[]>([]);
  const [starting, setStarting] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);

  const active = conversations.find((conversation) => conversation.conversation_id === activeId) ?? null;
  const loadConversations = React.useCallback(async () => {
    const { data, error } = await db.rpc('messaging_list_conversations');
    if (error) { toast({ title: 'Could not load messages', description: error.message, variant: 'destructive' }); return; }
    setConversations((data ?? []) as Conversation[]);
  }, [toast]);
  const loadMessages = React.useCallback(async (conversationId: string) => {
    const { data, error } = await db.rpc('messaging_list_messages', { target_conversation_id: conversationId });
    if (!error) setMessages((data ?? []) as Message[]);
  }, []);

  React.useEffect(() => { if (user) void loadConversations(); }, [user, loadConversations]);
  React.useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    void loadMessages(activeId);
    void db.rpc('messaging_mark_read', { target_conversation_id: activeId });
    const channel = supabase.channel(`messages:${activeId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeId}` }, () => {
      void loadMessages(activeId); void loadConversations(); void db.rpc('messaging_mark_read', { target_conversation_id: activeId });
    }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [activeId, loadConversations, loadMessages]);
  React.useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  React.useEffect(() => {
    const term = search.trim();
    if (!user || term.length < 2) { setPeople([]); return; }
    const timeout = window.setTimeout(async () => {
      const { data } = await db.rpc('messaging_search_users', { search_text: term });
      setPeople((data ?? []) as Person[]);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [search, user]);

  const selectConversation = (id: string) => { setActiveId(id); setSearch(''); setPeople([]); };
  const startConversation = async (person: Person) => {
    setStarting(true);
    const { data, error } = await db.rpc('messaging_start_direct_conversation', { recipient_id: person.id });
    setStarting(false);
    if (error || !data) { toast({ title: 'Could not start conversation', description: error?.message, variant: 'destructive' }); return; }
    await loadConversations(); selectConversation(data as string);
  };
  const send = async () => {
    const body = draft.trim();
    if (!body || !activeId || !user) return;
    setDraft('');
    const { error } = await db.from('messages').insert({ conversation_id: activeId, sender_id: user.id, body } as any);
    if (error) { setDraft(body); toast({ title: 'Message not sent', description: error.message, variant: 'destructive' }); return; }
    void loadMessages(activeId); void loadConversations();
  };

  if (!loading && !user) return <div className="min-h-screen bg-background p-6"><div className="mx-auto max-w-md pt-24 text-center"><MessageCircle className="mx-auto h-10 w-10 text-primary" /><h1 className="mt-4 text-2xl font-semibold">Sign in to message traders</h1><p className="mt-2 text-sm text-muted-foreground">Share market tips and strategies privately with the Commodity Hub community.</p><Button className="mt-6" asChild><Link to="/auth">Sign in</Link></Button></div></div>;

  return <div className="min-h-screen bg-background pb-20"><header className="sticky top-0 z-20 border-b bg-background/95 px-4 py-3 backdrop-blur"><div className="mx-auto flex max-w-6xl items-center gap-3"><Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Go back"><ArrowLeft className="h-4 w-4" /></Button><div><p className="text-xs font-medium uppercase tracking-[0.12em] text-primary">Community</p><h1 className="text-xl font-semibold">Messages</h1></div></div></header>
    <main className="mx-auto grid max-w-6xl gap-4 p-4 md:grid-cols-[320px_1fr]">
      <Card className={`${active ? 'hidden md:block' : ''} min-h-[calc(100vh-9rem)]`}><CardContent className="p-3"><div className="relative mb-3"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a member" className="pl-9" /></div>
        {people.length > 0 && <div className="mb-3 overflow-hidden rounded-lg border"><p className="px-3 py-2 text-xs font-medium text-muted-foreground">Start a conversation</p>{people.map((person) => <button key={person.id} type="button" disabled={starting} onClick={() => void startConversation(person)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted disabled:opacity-50"><Avatar className="h-8 w-8"><AvatarImage src={person.avatar_url ?? undefined} /><AvatarFallback>{initials(person.display_name)}</AvatarFallback></Avatar><span className="flex-1 truncate text-sm font-medium">{person.display_name}</span><Plus className="h-4 w-4 text-muted-foreground" /></button>)}</div>}
        {conversations.length ? <div className="space-y-1">{conversations.map((conversation) => <button key={conversation.conversation_id} type="button" onClick={() => selectConversation(conversation.conversation_id)} className={`flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left ${activeId === conversation.conversation_id ? 'bg-primary/10' : 'hover:bg-muted'}`}><Avatar><AvatarImage src={conversation.participant_avatar_url ?? undefined} /><AvatarFallback>{initials(conversation.participant_name)}</AvatarFallback></Avatar><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold">{conversation.participant_name}</span><span className="shrink-0 text-[10px] text-muted-foreground">{when(conversation.last_message_at)}</span></span><span className="flex items-center gap-2"><span className="truncate text-xs text-muted-foreground">{conversation.last_message ?? 'Start the conversation'}</span>{conversation.unread_count > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{conversation.unread_count}</span>}</span></span></button>)}</div> : <div className="px-3 py-12 text-center"><MessageCircle className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 text-sm font-medium">No conversations yet</p><p className="mt-1 text-xs text-muted-foreground">Search for a member to share an idea.</p></div>}</CardContent></Card>
      <Card className={`${!active ? 'hidden md:flex' : 'flex'} min-h-[calc(100vh-9rem)] flex-col`}><CardContent className="flex min-h-0 flex-1 flex-col p-0">{active ? <><div className="flex items-center gap-3 border-b px-4 py-3"><Button className="md:hidden" variant="ghost" size="icon" onClick={() => setActiveId(null)} aria-label="All conversations"><ArrowLeft className="h-4 w-4" /></Button><Avatar><AvatarImage src={active.participant_avatar_url ?? undefined} /><AvatarFallback>{initials(active.participant_name)}</AvatarFallback></Avatar><div><p className="text-sm font-semibold">{active.participant_name}</p><p className="text-xs text-muted-foreground">Private conversation</p></div></div><div className="flex-1 space-y-3 overflow-y-auto p-4">{messages.map((message) => <div key={message.id} className={`flex ${message.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${message.sender_id === user?.id ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}><p className="whitespace-pre-wrap break-words">{message.body}</p><p className={`mt-1 text-[10px] ${message.sender_id === user?.id ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{when(message.created_at)}</p></div></div>)}<div ref={endRef} /></div><div className="border-t p-3"><div className="flex items-end gap-2"><Textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Share a tip or strategy…" maxLength={4000} className="min-h-11 resize-none" /><Button size="icon" onClick={() => void send()} disabled={!draft.trim()} aria-label="Send message"><Send className="h-4 w-4" /></Button></div></div></> : <div className="flex flex-1 flex-col items-center justify-center px-6 text-center"><MessageCircle className="h-10 w-10 text-primary" /><h2 className="mt-4 text-lg font-semibold">Your market conversations</h2><p className="mt-1 max-w-sm text-sm text-muted-foreground">Choose a conversation or find a member to exchange market ideas privately.</p></div>}</CardContent></Card>
    </main></div>;
};

export default Messages;
