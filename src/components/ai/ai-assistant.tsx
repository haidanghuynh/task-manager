"use client";

import { FormEvent, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Bot, LoaderCircle, Minus, RotateCcw, Send, Sparkles, X } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { getAiPageContext } from "@/lib/ai/client-context";
import { useLang } from "@/lib/i18n";

type ChatMessage = { role: "user" | "assistant"; content: string };
type FeatureResponse = { success: boolean; data?: { aiAssistant: boolean; aiConfigured: boolean; aiAssistantName?: string | null } };
type ButtonPosition = { x: number; y: number };

const AI_BUTTON_POSITION_KEY = "task-manager-ai-button-position";
const AI_BUTTON_MARGIN = 12;

const copy = {
  vi: {
    title: "Trợ lý AI",
    subtitle: "Lịch và khối lượng công việc",
    placeholder: "Nhập câu hỏi về lịch hoặc công việc...",
    send: "Gửi câu hỏi",
    close: "Đóng",
    minimize: "Thu nhỏ",
    reset: "Cuộc trò chuyện mới",
    thinking: "Đang kiểm tra dữ liệu...",
    notConfigured: "AI đã được bật nhưng chưa có DEEPSEEK_API_KEY trên server.",
    error: "Không thể nhận câu trả lời từ AI. Vui lòng thử lại.",
    rateLimited: "Bạn gửi câu hỏi quá nhanh. Vui lòng chờ một phút.",
    suggestions: ["Ai đang trống hôm nay?", "Hôm nay sản phẩm nào đang có người làm?", "Nhóm tôi có ai bị trùng lịch hôm nay?", "Ai đang có ít task nhất tuần này?"],
    scheduleSuggestions: ["Trong tháng đang xem, ai có nhiều task nhất?", "Hôm nay ai đang trống?", "Có ai bị trùng lịch hôm nay không?", "Task nào đang quá hạn hoặc sắp đến hạn?"],
  },
  ja: {
    title: "AIアシスタント",
    subtitle: "スケジュールと業務負荷",
    placeholder: "スケジュールや業務について質問...",
    send: "送信",
    close: "閉じる",
    minimize: "最小化",
    reset: "新しい会話",
    thinking: "データを確認中...",
    notConfigured: "AIは有効ですが、サーバーにDEEPSEEK_API_KEYが設定されていません。",
    error: "AIから回答を取得できませんでした。もう一度お試しください。",
    rateLimited: "リクエストが多すぎます。1分待ってから再試行してください。",
    suggestions: ["今日空いている人は？", "今日、どの製品を誰が担当していますか？", "今日、チーム内で予定が重複している人は？", "今週タスクが最も少ない人は？"],
    scheduleSuggestions: ["表示中の月でタスクが最も多い人は？", "今日空いている人は？", "今日、予定が重複している人は？", "期限超過または期限が近いタスクは？"],
  },
} as const;

const markdownComponents: Components = {
  h1: ({ children }) => <h1 className="mb-2 mt-3 text-lg font-bold text-gray-900 first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-3 text-base font-bold text-gray-900 first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1.5 mt-3 font-semibold text-gray-900 first:mt-0">{children}</h3>,
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
  blockquote: ({ children }) => <blockquote className="my-2 border-l-4 border-blue-300 pl-3 text-gray-600">{children}</blockquote>,
  table: ({ children }) => <div className="my-3 overflow-x-auto rounded-lg border"><table className="min-w-full border-collapse text-left text-xs">{children}</table></div>,
  th: ({ children }) => <th className="whitespace-nowrap border-b border-r bg-gray-100 px-2.5 py-2 font-semibold text-gray-900 last:border-r-0">{children}</th>,
  td: ({ children }) => <td className="border-b border-r px-2.5 py-2 align-top last:border-r-0">{children}</td>,
  a: ({ children, href }) => {
    const internal = href?.startsWith("/");
    return <a href={href} target={internal ? undefined : "_blank"} rel={internal ? undefined : "noreferrer noopener"} className="text-blue-600 underline hover:no-underline">{children}</a>;
  },
  img: () => null,
  code: ({ children, className }) => className
    ? <code className={`${className} block overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs text-gray-100`}>{children}</code>
    : <code className="rounded bg-gray-200 px-1 py-0.5 font-mono text-xs text-gray-900">{children}</code>,
  hr: () => <hr className="my-3 border-gray-200" />,
};

function AssistantMarkdown({ content }: { content: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={markdownComponents}>{content}</ReactMarkdown>;
}

function compactConversation(messages: ChatMessage[]) {
  const recent = messages.slice(-12);
  const firstUserIndex = recent.findIndex((message) => message.role === "user");
  return firstUserIndex >= 0 ? recent.slice(firstUserIndex) : recent;
}

export function AiAssistant() {
  const { data: session, status } = useSession();
  const { lang } = useLang();
  const pathname = usePathname();
  const labels = copy[lang];
  const role = (session?.user as { role?: string } | undefined)?.role;
  const roleAllowed = role === "ADMIN" || role === "MANAGER";
  const [feature, setFeature] = useState<{ enabled: boolean; configured: boolean; name: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const [buttonPosition, setButtonPosition] = useState<ButtonPosition | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (status !== "authenticated" || !roleAllowed) return;
    let cancelled = false;
    fetch("/api/features", { cache: "no-store" })
      .then((response) => response.json() as Promise<FeatureResponse>)
      .then((json) => {
        if (!cancelled) setFeature({
          enabled: Boolean(json.success && json.data?.aiAssistant),
          configured: Boolean(json.data?.aiConfigured),
          name: json.data?.aiAssistantName?.trim() || labels.title,
        });
      })
      .catch(() => { if (!cancelled) setFeature({ enabled: false, configured: false, name: labels.title }); });
    return () => { cancelled = true; };
  }, [labels.title, roleAllowed, status]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy, open]);

  useEffect(() => {
    function clamp(position: ButtonPosition): ButtonPosition {
      const rect = buttonRef.current?.getBoundingClientRect();
      const width = rect?.width || 56;
      const height = rect?.height || 48;
      return {
        x: Math.min(Math.max(AI_BUTTON_MARGIN, position.x), Math.max(AI_BUTTON_MARGIN, window.innerWidth - width - AI_BUTTON_MARGIN)),
        y: Math.min(Math.max(AI_BUTTON_MARGIN, position.y), Math.max(AI_BUTTON_MARGIN, window.innerHeight - height - AI_BUTTON_MARGIN)),
      };
    }

    try {
      const saved = localStorage.getItem(AI_BUTTON_POSITION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<ButtonPosition>;
        if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) setButtonPosition(clamp({ x: Number(parsed.x), y: Number(parsed.y) }));
      }
    } catch {
      localStorage.removeItem(AI_BUTTON_POSITION_KEY);
    }

    function handleResize() {
      setButtonPosition((current) => {
        if (!current) return current;
        const next = clamp(current);
        localStorage.setItem(AI_BUTTON_POSITION_KEY, JSON.stringify(next));
        return next;
      });
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  function clampButtonPosition(position: ButtonPosition): ButtonPosition {
    const rect = buttonRef.current?.getBoundingClientRect();
    const width = rect?.width || 56;
    const height = rect?.height || 48;
    return {
      x: Math.min(Math.max(AI_BUTTON_MARGIN, position.x), Math.max(AI_BUTTON_MARGIN, window.innerWidth - width - AI_BUTTON_MARGIN)),
      y: Math.min(Math.max(AI_BUTTON_MARGIN, position.y), Math.max(AI_BUTTON_MARGIN, window.innerHeight - height - AI_BUTTON_MARGIN)),
    };
  }

  function startButtonDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: rect.left, originY: rect.top, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveButton(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 5) return;
    drag.moved = true;
    setDragging(true);
    setButtonPosition(clampButtonPosition({ x: drag.originX + deltaX, y: drag.originY + deltaY }));
  }

  function finishButtonDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag.moved) {
      suppressClickRef.current = true;
      setButtonPosition((current) => {
        if (!current) return current;
        const rect = buttonRef.current?.getBoundingClientRect();
        const width = rect?.width || 56;
        const maxX = Math.max(AI_BUTTON_MARGIN, window.innerWidth - width - AI_BUTTON_MARGIN);
        const distanceToLeft = current.x - AI_BUTTON_MARGIN;
        const distanceToRight = maxX - current.x;
        const snapped = clampButtonPosition({
          x: Math.min(distanceToLeft, distanceToRight) <= 72 ? (distanceToLeft <= distanceToRight ? AI_BUTTON_MARGIN : maxX) : current.x,
          y: current.y,
        });
        localStorage.setItem(AI_BUTTON_POSITION_KEY, JSON.stringify(snapped));
        return snapped;
      });
    }
    dragRef.current = null;
    setDragging(false);
  }

  async function sendMessage(content: string) {
    const question = content.trim();
    if (!question || busy || !feature?.configured) return;
    const userMessage: ChatMessage = { role: "user", content: question };
    const history = compactConversation([...messages, userMessage]);
    setMessages(history);
    setInput("");
    setBusy(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          language: lang,
          context: {
            pathname,
            search: window.location.search,
            pageState: getAiPageContext(pathname),
          },
        }),
      });
      const json = await response.json() as { success: boolean; data?: { answer: string }; error?: { code?: string } };
      const errorText = json.error?.code === "RATE_LIMITED" ? labels.rateLimited : labels.error;
      setMessages((current) => [...current, { role: "assistant", content: json.success && json.data?.answer ? json.data.answer : errorText }]);
    } catch {
      setMessages((current) => [...current, { role: "assistant", content: labels.error }]);
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void sendMessage(input);
  }

  if (!roleAllowed || !feature?.enabled) return null;
  const assistantName = feature.name;
  const suggestions = pathname === "/schedule" ? labels.scheduleSuggestions : labels.suggestions;
  const greeting = lang === "ja"
    ? `こんにちは、${assistantName}です。スケジュールや業務負荷を確認し、担当者候補を提案できます。データを自動変更することはありません。`
    : `Xin chào! Tôi là ${assistantName}. Tôi có thể kiểm tra lịch, khối lượng công việc và đề xuất người phù hợp, nhưng sẽ không tự thay đổi task.`;

  return (
    <div data-i18n-ignore>
      {!open && (
        <button
          ref={buttonRef}
          type="button"
          onClick={() => {
            if (suppressClickRef.current) { suppressClickRef.current = false; return; }
            setOpen(true);
          }}
          onPointerDown={startButtonDrag}
          onPointerMove={moveButton}
          onPointerUp={finishButtonDrag}
          onPointerCancel={finishButtonDrag}
          style={buttonPosition ? { left: buttonPosition.x, top: buttonPosition.y, touchAction: "none" } : { touchAction: "none" }}
          className={`fixed z-50 flex cursor-grab items-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-xl hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 active:cursor-grabbing ${buttonPosition ? "" : "bottom-5 right-5"} ${dragging ? "select-none shadow-2xl" : ""}`}
          aria-label={assistantName}
        >
          <Sparkles className="h-5 w-5" />
          <span className="hidden sm:inline">{assistantName}</span>
          {!feature.configured && <span className="h-2 w-2 rounded-full bg-amber-300" />}
        </button>
      )}

      {open && (
        <section className="fixed inset-0 z-50 flex flex-col border bg-white shadow-2xl sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[min(680px,calc(100vh-2.5rem))] sm:w-[440px] sm:rounded-2xl" aria-label={assistantName}>
          <header className="flex items-center gap-3 rounded-t-2xl bg-gray-900 px-4 py-3 text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600"><Bot className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1"><h2 className="font-semibold">{assistantName}</h2><p className="truncate text-xs text-gray-400">{labels.subtitle}</p></div>
            <button type="button" onClick={() => setMessages([])} title={labels.reset} aria-label={labels.reset} className="rounded p-2 text-gray-300 hover:bg-gray-800 hover:text-white"><RotateCcw className="h-4 w-4" /></button>
            <button type="button" onClick={() => setOpen(false)} title={labels.minimize} aria-label={labels.minimize} className="hidden rounded p-2 text-gray-300 hover:bg-gray-800 hover:text-white sm:block"><Minus className="h-4 w-4" /></button>
            <button type="button" onClick={() => setOpen(false)} title={labels.close} aria-label={labels.close} className="rounded p-2 text-gray-300 hover:bg-gray-800 hover:text-white"><X className="h-4 w-4" /></button>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto bg-gray-50 p-4">
            <div className="mr-8 rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-sm text-gray-700 shadow-sm">{greeting}</div>
            {!feature.configured && <div className="rounded-lg border border-amber-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">{labels.notConfigured}</div>}
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`rounded-2xl px-4 py-3 text-sm shadow-sm ${message.role === "user" ? "ml-8 whitespace-pre-wrap rounded-tr-sm bg-blue-600 text-white" : "mr-4 rounded-tl-sm bg-white text-gray-700"}`}>
                {message.role === "assistant" ? <AssistantMarkdown content={message.content} /> : message.content}
              </div>
            ))}
            {busy && <div className="mr-8 flex items-center gap-2 rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-sm text-gray-500 shadow-sm"><LoaderCircle className="h-4 w-4 animate-spin" />{labels.thinking}</div>}
            {messages.length === 0 && feature.configured && (
              <div className="flex flex-wrap gap-2">
                {suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => void sendMessage(suggestion)} className="rounded-full border bg-white px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100">{suggestion}</button>)}
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form onSubmit={submit} className="flex gap-2 border-t bg-white p-3 sm:rounded-b-2xl">
            <textarea
              rows={2}
              maxLength={2000}
              value={input}
              disabled={busy || !feature.configured}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (input.trim()) void sendMessage(input);
                }
              }}
              placeholder={labels.placeholder}
              className="min-h-11 flex-1 resize-none rounded-xl border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-60"
            />
            <button type="submit" disabled={busy || !feature.configured || !input.trim()} title={labels.send} aria-label={labels.send} className="self-end rounded-xl bg-blue-600 p-3 text-white hover:bg-blue-700 disabled:opacity-40"><Send className="h-4 w-4" /></button>
          </form>
        </section>
      )}
    </div>
  );
}
