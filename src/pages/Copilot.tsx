import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { ArrowLeft, Plus, Trash2, MessageSquare, Bot, Sparkles, Menu } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useAiThreads, loadThreadMessages } from '@/hooks/useAiThreads';
import { Button } from '@/components/ui/button';
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation';
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import { PromptInput, PromptInputTextarea, PromptInputFooter, PromptInputSubmit } from '@/components/ai-elements/prompt-input';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { toast } from 'sonner';

const SUGGESTIONS = [
  'Summarize my portfolio risk',
  'Why is crude oil moving today?',
  'Show me my active alerts',
  'Compare gold vs silver this week',
];

export default function Copilot() {
  const { threadId } = useParams<{ threadId?: string }>();
  const navigate = useNavigate();
  const auth = useAuth() as any;
  const userId = auth?.user?.id;
  const { threads, createThread, deleteThread, refresh } = useAiThreads(userId);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Bootstrap: if no threadId, create or pick one
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (!userId || bootstrapped.current || threadId) return;
    bootstrapped.current = true;
    (async () => {
      if (threads.length > 0) {
        navigate(`/copilot/${threads[0].id}`, { replace: true });
      } else {
        const id = await createThread();
        if (id) navigate(`/copilot/${id}`, { replace: true });
      }
    })();
  }, [userId, threadId, threads, navigate, createThread]);

  if (!auth?.user && !auth?.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <Bot className="w-12 h-12 mx-auto text-primary" />
          <p>Please sign in to use the AI Copilot.</p>
          <Link to="/auth"><Button>Sign in</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'fixed inset-y-0 left-0 z-50 w-72' : 'hidden'} md:relative md:flex md:w-72 flex-col border-r bg-card`}>
        <div className="p-4 border-b flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Dashboard
          </Link>
          <Button size="sm" variant="ghost" className="md:hidden" onClick={() => setSidebarOpen(false)}>×</Button>
        </div>
        <div className="p-3">
          <Button
            className="w-full justify-start gap-2"
            onClick={async () => {
              const id = await createThread();
              if (id) { navigate(`/copilot/${id}`); setSidebarOpen(false); }
            }}
          >
            <Plus className="w-4 h-4" /> New conversation
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
          {threads.map((t) => (
            <div
              key={t.id}
              className={`group flex items-center gap-2 rounded-md px-2 py-2 text-sm cursor-pointer hover:bg-accent ${threadId === t.id ? 'bg-accent' : ''}`}
              onClick={() => { navigate(`/copilot/${t.id}`); setSidebarOpen(false); }}
            >
              <MessageSquare className="w-4 h-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{t.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteThread(t.id).then(() => {
                    if (threadId === t.id) navigate('/copilot');
                  });
                }}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-1"
                aria-label="Delete thread"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="border-b p-3 flex items-center gap-2">
          <Button size="sm" variant="ghost" className="md:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5" />
          </Button>
          <Sparkles className="w-5 h-5 text-primary" />
          <h1 className="font-semibold">Commodity Copilot</h1>
          <span className="text-xs text-muted-foreground ml-2">AI-powered market assistant</span>
        </header>
        {threadId ? (
          <ChatWindow key={threadId} threadId={threadId} onRefreshThreads={refresh} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Starting a new conversation…
          </div>
        )}
      </main>
    </div>
  );
}

function ChatWindow({ threadId, onRefreshThreads }: { threadId: string; onRefreshThreads: () => void }) {
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(null);
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadThreadMessages(threadId).then(setInitialMessages);
  }, [threadId]);

  const transport = new DefaultChatTransport({
    api: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-copilot`,
    headers: async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      return {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
    },
    body: { threadId },
  });

  const { messages, sendMessage, status, error } = useChat({
    id: threadId,
    messages: initialMessages ?? [],
    transport,
    onError: (e) => toast.error(e.message ?? 'Copilot error'),
    onFinish: () => onRefreshThreads(),
  });

  useEffect(() => {
    textareaRef.current?.focus();
  }, [threadId, status]);

  if (initialMessages === null) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>;
  }

  const isLoading = status === 'submitted' || status === 'streaming';
  const isEmpty = messages.length === 0;

  const submit = async (text: string) => {
    const t = text.trim();
    if (!t || isLoading) return;
    setInput('');
    await sendMessage({ text: t });
  };

  return (
    <>
      <Conversation className="flex-1">
        <ConversationContent>
          {isEmpty && (
            <div className="max-w-2xl mx-auto py-8 space-y-6">
              <div className="text-center space-y-2">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-xl font-semibold">How can I help you trade today?</h2>
                <p className="text-sm text-muted-foreground">
                  Ask about prices, your portfolio, term structure, news, or set up alerts.
                </p>
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => submit(s)}
                    className="text-left text-sm p-3 rounded-lg border hover:bg-accent transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <Message from={m.role} key={m.id}>
              <MessageContent>
                {m.parts.map((part: any, i: number) => {
                  if (part.type === 'text') {
                    return <MessageResponse key={i}>{part.text}</MessageResponse>;
                  }
                  if (part.type?.startsWith?.('tool-')) {
                    return (
                      <div key={i} className="text-xs text-muted-foreground italic">
                        Using {String(part.type).replace('tool-', '').replace(/_/g, ' ')}…
                      </div>
                    );
                  }
                  return null;
                })}
              </MessageContent>
            </Message>
          ))}
          {status === 'submitted' && (
            <Message from="assistant">
              <MessageContent>
                <Shimmer>Thinking…</Shimmer>
              </MessageContent>
            </Message>
          )}
          {error && (
            <div className="text-sm text-destructive p-3 rounded border border-destructive/30 bg-destructive/5">
              {error.message}
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t p-3">
        <PromptInput onSubmit={() => submit(input)}>
          <PromptInputTextarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about markets, your portfolio, or set up an alert…"
            disabled={isLoading}
          />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} disabled={!input.trim() || isLoading} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </>
  );
}