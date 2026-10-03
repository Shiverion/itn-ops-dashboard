import { useEffect, useRef, useState } from 'react';
import { askAdvisor, canEdit, type ChatMessage } from '../api';
import { Markdown } from './Markdown';
import { Panel } from './ui';

const PROJECT_PROMPTS = [
  'What’s the best next move on this project?',
  'Summarise where we are with the client.',
  'What is still open or at risk?',
  'Draft a follow-up email to the client after the last meeting.',
];
const GENERAL_PROMPTS = [
  'Which projects and tenders need my attention this week?',
  'Where is money stuck: overdue invoices, unbilled progress, taxes?',
  'Which open tenders fit our experience best, and why?',
  'What should I prioritise this month?',
];

/**
 * Chat with the AI advisor about one project (projectCode) or the whole
 * business. The server builds the context from what the viewer can see; the
 * conversation lives in this page only.
 */
export function Advisor({ projectCode, title = 'Ask the advisor', tall = false }: { projectCode?: string; title?: string; tall?: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [partial, setPartial] = useState('');
  const [error, setError] = useState('');
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([]);
    setError('');
  }, [projectCode]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [messages, busy, partial]);

  if (!canEdit()) return null;

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    const history = messages;
    setMessages([...history, { role: 'user', content: q }]);
    setInput('');
    setBusy(true);
    setError('');
    setPartial('');
    try {
      const answer = await askAdvisor(q, history, projectCode, (delta) => setPartial((p) => p + delta));
      setMessages((m) => [...m, { role: 'assistant', content: answer }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPartial('');
      setBusy(false);
    }
  };

  const prompts = projectCode ? PROJECT_PROMPTS : GENERAL_PROMPTS;
  return (
    <Panel
      title={title}
      actions={
        messages.length > 0 && (
          <button type="button" onClick={() => setMessages([])} className="text-xs text-ink-2 underline decoration-line underline-offset-4 hover:text-ink">
            New conversation
          </button>
        )
      }
    >
      <div className={`flex flex-col ${tall ? 'min-h-[28rem]' : 'min-h-[18rem]'}`}>
        <div className={`flex-1 space-y-4 overflow-y-auto pb-3 ${tall ? 'max-h-[60vh]' : 'max-h-[28rem]'}`} aria-live="polite">
          {!messages.length && (
            <div>
              <p className="text-sm text-ink-2">
                {projectCode
                  ? 'Answers come from this project’s log and files, linked tenders, finance and the Ask ITN notes.'
                  : 'Answers come from all projects, tenders, certificates, finance, taxes and the Ask ITN notes.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {prompts.map((p) => (
                  <button key={p} type="button" onClick={() => send(p)} className="rounded-full border border-line px-3 py-1.5 text-left text-xs text-ink hover:bg-chip">
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="ml-auto w-fit max-w-[85%] rounded-lg bg-chip px-3 py-2 text-sm text-ink">
                {m.content}
              </div>
            ) : (
              <div key={i} className="max-w-[95%]">
                <Markdown text={m.content} />
              </div>
            ),
          )}
          {busy &&
            (partial ? (
              <div className="max-w-[95%]">
                <Markdown text={partial} />
              </div>
            ) : (
              <p className="text-sm text-muted">Reading the records…</p>
            ))}
          {error && (
            <p role="alert" className="text-sm text-critical">
              {error}
            </p>
          )}
          <div ref={end} />
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex gap-2 border-t border-line pt-3"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={2}
            maxLength={2000}
            placeholder={projectCode ? 'Ask about this project…' : 'Ask about projects, tenders, money, taxes…'}
            aria-label="Question"
            className="min-w-0 flex-1 resize-none rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-ink/50 focus:outline-none"
          />
          <button type="submit" disabled={busy || !input.trim()} className="self-end rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            Ask
          </button>
        </form>
      </div>
    </Panel>
  );
}
