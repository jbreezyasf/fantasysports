'use client';

import { useEffect, useMemo, useState } from 'react';
import { askAssistantGM, type AssistantGMChatMessage } from './actions';

type Target = {
  id: string;
  name: string;
  position: string;
  team?: string | null;
  overallRank?: number | null;
  reason: string;
};

type Props = {
  leagueId: string;
  userId: string;
  franchiseName: string;
  week: number;
  initialBrief: string;
  topTargets: Target[];
  freeAgencyUrl: string;
  teamUrl: string;
};

const QUICK_PROMPTS = [
  'Who should I grab?',
  'What’s wrong with my roster?',
  'Who should I start?',
  'Give me the front-office brief.',
] as const;

export default function AssistantGMClient(props: Props) {
  const storageKey = useMemo(() => `bigexec:assistant-gm:${props.userId}:${props.leagueId}`, [props.userId, props.leagueId]);
  const [enabled, setEnabled] = useState(true);
  const [messages, setMessages] = useState<AssistantGMChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as { enabled?: boolean; messages?: AssistantGMChatMessage[] };
        if (typeof saved.enabled === 'boolean') setEnabled(saved.enabled);
        if (Array.isArray(saved.messages)) setMessages(saved.messages.slice(-30));
      }
    } catch {
      // Local persistence is best-effort in the MVP.
    } finally {
      setLoaded(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ enabled, messages: messages.slice(-30) }));
    } catch {
      // Keep the feature usable even when browser storage is unavailable.
    }
  }, [enabled, loaded, messages, storageKey]);

  async function submit(text: string) {
    const clean = text.trim();
    if (!enabled || !clean || busy) return;
    const ownerMessage: AssistantGMChatMessage = { role: 'owner', content: clean };
    const recent = [...messages, ownerMessage].slice(-8);
    setMessages(current => [...current, ownerMessage].slice(-30));
    setQuestion('');
    setBusy(true);
    try {
      const result = await askAssistantGM({ leagueId: props.leagueId, question: clean, history: recent });
      const assistantMessage: AssistantGMChatMessage = { role: 'assistant', content: result.message };
      setMessages(current => [...current, assistantMessage].slice(-30));
    } catch {
      const errorMessage: AssistantGMChatMessage = {
        role: 'assistant',
        content: 'Boss, the office line just went dead. Try that again. I am blaming technology, not the roster.',
      };
      setMessages(current => [...current, errorMessage].slice(-30));
    } finally {
      setBusy(false);
    }
  }

  function toggle() {
    setEnabled(current => !current);
  }

  function clearConversation() {
    setMessages([]);
  }

  return (
    <>
      <section className="panel">
        <div className="commandHeader">
          <div>
            <p className="eyebrow">PRIVATE FRONT OFFICE</p>
            <h2>Your Assistant GM.</h2>
          </div>
          <button className={enabled ? 'primary' : 'secondary'} type="button" onClick={toggle} aria-pressed={enabled}>
            {enabled ? 'ASSISTANT GM: ON' : 'ASSISTANT GM: OFF'}
          </button>
        </div>
        <p className="lede">You are the owner/GM. He advises, argues his case, keeps the jokes mostly aimed at the players, and never makes a roster move without you.</p>
        {!enabled && <p className="successNotice">Office door closed. No Assistant GM question will call the AI layer while this is off.</p>}
      </section>

      <section className="panel">
        <p className="eyebrow">TODAY’S BOARD • WEEK {props.week}</p>
        <h2>What I see right now.</h2>
        <p className="lede">{props.initialBrief}</p>
        <div className="playerList">
          {props.topTargets.map((target, index) => (
            <article className="playerRow" key={target.id}>
              <div>
                <span>#{index + 1} ON MY AVAILABLE BOARD • {target.position} • {target.team ?? 'FA'}</span>
                <strong>{target.name}</strong>
                <small>{target.reason}</small>
              </div>
              <b className="rosteredStatus">{target.overallRank ? `BEX #${target.overallRank}` : 'BEX RANK'}</b>
            </article>
          ))}
          {!props.topTargets.length && <p className="errorNotice">No ranked available target can be proven from the current player pool.</p>}
        </div>
        <div className="actions">
          <a className="primary" href={props.freeAgencyUrl}>Open Free Agency</a>
          <a className="secondary" href={props.teamUrl}>Open Team HQ</a>
        </div>
      </section>

      <section className="panel">
        <div className="commandHeader">
          <div><p className="eyebrow">OWNER + ASSISTANT GM</p><h2>Close the door.</h2></div>
          {!!messages.length && <button className="secondary" type="button" onClick={clearConversation}>Clear Conversation</button>}
        </div>
        <div className="actions" aria-label="Assistant GM quick prompts">
          {QUICK_PROMPTS.map(prompt => (
            <button className="secondary" key={prompt} type="button" disabled={!enabled || busy} onClick={() => submit(prompt)}>{prompt}</button>
          ))}
        </div>

        <div className="playerList" aria-live="polite">
          {!messages.length && <article className="playerRow"><div><span>ASSISTANT GM</span><strong>“Boss, I’ve got the board. What are we fixing?”</strong></div></article>}
          {messages.map((message, index) => (
            <article className="playerRow" key={`${message.role}-${index}-${message.content.slice(0, 12)}`}>
              <div>
                <span>{message.role === 'owner' ? 'OWNER / GM' : 'ASSISTANT GM'}</span>
                <strong>{message.content}</strong>
              </div>
            </article>
          ))}
          {busy && <article className="playerRow"><div><span>ASSISTANT GM</span><strong>Looking at the board…</strong></div></article>}
        </div>

        <form className="inlineForm" onSubmit={event => { event.preventDefault(); void submit(question); }}>
          <input
            value={question}
            onChange={event => setQuestion(event.target.value)}
            placeholder={enabled ? 'Ask your Assistant GM…' : 'Turn Assistant GM on to talk'}
            aria-label="Ask your Assistant GM"
            disabled={!enabled || busy}
            maxLength={900}
          />
          <button className="primary" type="submit" disabled={!enabled || busy || !question.trim()}>Ask</button>
        </form>
        <p className="lede">MVP truth boundary: current Big Exec roster/ranking data is live to this office. Licensed projections, injury/practice feeds, and player news are not connected yet, and the Assistant GM is instructed not to fake them.</p>
      </section>
    </>
  );
}
