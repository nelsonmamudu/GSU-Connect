import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Contact,
  FileText,
  Image as ImageIcon,
  Mic,
  Search,
  Star,
  X,
} from 'lucide-react';
import { formatDateTime, StarredMessage } from '../types';
import { RoleBadge } from './RoleBadge';

interface StarredMessagesModalProps {
  starredMessages: StarredMessage[];
  onClose: () => void;
  onJumpToMessage: (chatId: string, messageId: string) => void;
  onUnstar: (messageId: string) => Promise<void> | void;
}

export const StarredMessagesModal: React.FC<StarredMessagesModalProps> = ({
  starredMessages,
  onClose,
  onJumpToMessage,
  onUnstar,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return starredMessages;
    return starredMessages.filter(
      (item) =>
        item.text.toLowerCase().includes(q) ||
        item.senderName.toLowerCase().includes(q) ||
        item.chatName.toLowerCase().includes(q) ||
        (item.fileName || '').toLowerCase().includes(q) ||
        (item.eventTitle || '').toLowerCase().includes(q) ||
        (item.pollQuestion || '').toLowerCase().includes(q)
    );
  }, [starredMessages, searchQuery]);

  const handleUnstar = async (messageId: string) => {
    if (busyId === messageId) return;
    setBusyId(messageId);
    try {
      await onUnstar(messageId);
    } finally {
      setBusyId(null);
    }
  };

  const renderTypeIcon = (type: StarredMessage['messageType']) => {
    switch (type) {
      case 'voice':
        return <Mic className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />;
      case 'poll':
        return <BarChart3 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />;
      case 'image':
        return <ImageIcon className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400 shrink-0" />;
      case 'document':
        return <FileText className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />;
      case 'event':
        return <CalendarDays className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />;
      case 'contact':
        return <Contact className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />;
      default:
        return null;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Starred Messages"
      className="fixed inset-0 z-50 bg-slate-900/55 dark:bg-slate-950/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="w-full sm:max-w-lg max-h-[88dvh] flex flex-col bg-white dark:bg-slate-900 border border-transparent dark:border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Star className="w-4 h-4 fill-current" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                Starred Messages
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {starredMessages.length} saved {starredMessages.length === 1 ? 'message' : 'messages'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close starred messages"
            className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search saved notes, senders, or chats..."
              className="w-full min-h-[42px] pl-10 pr-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-emerald-600"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear starred search"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#FAFBFB] dark:bg-slate-950/60">
          {filtered.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center mx-auto">
                <Star className="w-5 h-5" />
              </div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {starredMessages.length === 0 ? 'No starred messages yet' : 'No matching saved messages'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto leading-relaxed">
                {starredMessages.length === 0
                  ? 'Tap Star on any note, timetable reminder, or announcement in a chat to bookmark it here.'
                  : 'Try another keyword or clear your search filter.'}
              </p>
            </div>
          ) : (
            filtered.map((item) => (
              <div
                key={item.messageId}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-2.5 shadow-2xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                        {item.senderName}
                      </span>
                      <RoleBadge role={item.senderRole} />
                      <span aria-hidden="true" className="text-xs text-slate-400">
                        ·
                      </span>
                      <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400 truncate">
                        {item.chatName}
                      </span>
                    </div>
                    <p className="text-[11px] font-mono text-slate-400 dark:text-slate-500 mt-0.5 tabular-nums">
                      {formatDateTime(item.messageCreatedAt || item.starredAt)}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={busyId === item.messageId}
                    onClick={() => handleUnstar(item.messageId)}
                    title="Remove from Starred Messages"
                    aria-label="Remove star"
                    className="min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/50 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    <Star className="w-4 h-4 fill-current" />
                  </button>
                </div>

                <div className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                  <span className="mt-1">{renderTypeIcon(item.messageType)}</span>
                  <p className="whitespace-pre-wrap break-words flex-1 min-w-0">{item.text}</p>
                </div>

                <div className="pt-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => onJumpToMessage(item.chatId, item.messageId)}
                    className="min-h-[36px] px-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/70 text-emerald-800 dark:text-emerald-300 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>Jump to conversation</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
