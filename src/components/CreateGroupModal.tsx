import React, { useEffect, useMemo, useState } from 'react';
import { Check, Search, Users, X } from 'lucide-react';
import { createAdminGroup, searchPeople } from '../services/supabaseService';
import {
  AcademicLevel,
  AppUser,
  canViewMemberIdNumber,
  CustomGroupScope,
  DepartmentItem,
  formatCompactLevelLabel,
  STUDENT_LEVELS,
} from '../types';
import { DepartmentPicker } from './DepartmentPicker';
import { UserAvatar } from './UserAvatar';

interface CreateGroupModalProps {
  currentUser: AppUser;
  departments: DepartmentItem[];
  approvedUsers: AppUser[];
  onClose: () => void;
  onCreated: (chatId: string) => void;
}

const SCOPE_OPTIONS: { id: CustomGroupScope; label: string; hint: string }[] = [
  { id: 'all', label: 'All GSU', hint: 'Every approved student & staff' },
  { id: 'department', label: 'Department', hint: 'All levels in one department' },
  { id: 'deptLevel', label: 'Dept + Level', hint: 'Specific department & level' },
  { id: 'invited', label: 'Selected Members', hint: 'Choose specific approved people' },
];

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  currentUser,
  departments,
  approvedUsers,
  onClose,
  onCreated,
}) => {
  const [name, setName] = useState('');
  const [scopeType, setScopeType] = useState<CustomGroupScope>('all');
  const [department, setDepartment] = useState(
    currentUser.department || departments[0]?.name || 'Computer Science'
  );
  const [level, setLevel] = useState<AcademicLevel>('100');
  const [memberSearch, setMemberSearch] = useState('');
  const [remoteMembers, setRemoteMembers] = useState<AppUser[] | null>(null);
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = memberSearch.trim();
    if (scopeType !== 'invited' || trimmed.length < 2) {
      setRemoteMembers(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const rows = await searchPeople(trimmed);
        if (!cancelled) setRemoteMembers(rows);
      } catch {
        if (!cancelled) setRemoteMembers(null);
      }
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [memberSearch, scopeType]);

  const combinedUsers = useMemo(() => {
    if (!remoteMembers || remoteMembers.length === 0) return approvedUsers;
    const byId = new Map<string, AppUser>();
    approvedUsers.forEach((u) => byId.set(u.uid, u));
    remoteMembers.forEach((u) => byId.set(u.uid, u));
    return Array.from(byId.values());
  }, [approvedUsers, remoteMembers]);

  const selectableMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return combinedUsers
      .filter((u) => u.uid !== currentUser.uid)
      .filter((u) => {
        if (!q) return true;
        return (
          u.fullName.toLowerCase().includes(q) ||
          (canViewMemberIdNumber(currentUser, u.uid) &&
            u.idNumber.toLowerCase().includes(q)) ||
          u.department.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [combinedUsers, currentUser.uid, memberSearch]);

  const toggleMember = (uid: string) => {
    setSelectedUids((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (name.trim().length < 2) {
      setError('Please enter a group name (at least 2 characters).');
      return;
    }

    if ((scopeType === 'department' || scopeType === 'deptLevel') && department.trim().length < 2) {
      setError('Please select or enter a department.');
      return;
    }

    const invitedUsers =
      scopeType === 'invited'
        ? combinedUsers.filter((u) => selectedUids.includes(u.uid))
        : undefined;

    setBusy(true);
    try {
      const chatId = await createAdminGroup(currentUser, {
        name,
        scopeType,
        department,
        level,
        invitedUsers,
        allApprovedUsers: approvedUsers,
      });
      onCreated(chatId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create group.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/45 dark:bg-slate-950/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-lg bg-white dark:bg-slate-900 border border-transparent dark:border-slate-800 rounded-t-3xl sm:rounded-3xl p-6 space-y-4 shadow-xl max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Create Group</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close create group modal"
            className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="groupNameInput" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Group Name
            </label>
            <input
              id="groupNameInput"
              type="text"
              required
              minLength={2}
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. SLT Final Year Project, SUG Executives, 100L Orientation"
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/80 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
            />
          </div>

          <div>
            <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Who should be in this group?
            </span>
            <div className="grid grid-cols-2 gap-2">
              {SCOPE_OPTIONS.map((opt) => {
                const active = scopeType === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setScopeType(opt.id)}
                    className={`min-h-[54px] p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                      active
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-600 text-emerald-950 dark:text-emerald-200'
                        : 'bg-white dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <p className="text-xs font-bold">{opt.label}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                      {opt.hint}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {(scopeType === 'department' || scopeType === 'deptLevel') && (
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="groupDeptPicker"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Department
                </label>
                <DepartmentPicker
                  id="groupDeptPicker"
                  departments={departments}
                  value={department}
                  onChange={setDepartment}
                />
              </div>

              {scopeType === 'deptLevel' && (
                <div>
                  <label
                    htmlFor="groupLevelSelect"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Level
                  </label>
                  <select
                    id="groupLevelSelect"
                    value={level}
                    onChange={(e) => setLevel(e.target.value as AcademicLevel)}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/80 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-600"
                  >
                    {STUDENT_LEVELS.map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {lvl} Level
                      </option>
                    ))}
                    <option value="Staff">Staff / Lecturers</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {scopeType === 'invited' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Select Members ({selectedUids.length} selected)
                </span>
                {selectedUids.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedUids([])}
                    className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Search approved people by name, ID, or dept..."
                  className="w-full min-h-[42px] pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/80 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-600"
                />
              </div>

              <div className="max-h-48 overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                {selectableMembers.length === 0 ? (
                  <p className="p-4 text-center text-xs text-slate-500 dark:text-slate-400">
                    No other approved members found.
                  </p>
                ) : (
                  selectableMembers.map((member) => {
                    const checked = selectedUids.includes(member.uid);
                    return (
                      <button
                        key={member.uid}
                        type="button"
                        onClick={() => toggleMember(member.uid)}
                        className={`w-full min-h-[48px] px-3 py-2 text-left flex items-center justify-between gap-2.5 transition-colors cursor-pointer ${
                          checked ? 'bg-emerald-50/80 dark:bg-emerald-950/50' : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <UserAvatar
                            name={member.fullName}
                            photoURL={member.photoURL}
                            avatarId={member.avatarId}
                            size="sm"
                            roundedClass="rounded-xl"
                            fallbackClassName="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                              {member.fullName}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {member.department} ·{' '}
                              {formatCompactLevelLabel(member.level, member.is_alumni)}
                              {canViewMemberIdNumber(currentUser, member.uid) && member.idNumber && (
                                <>
                                  {' · '}
                                  <span className="font-mono">{member.idNumber}</span>
                                </>
                              )}
                            </p>
                          </div>
                        </div>

                        <div
                          className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                            checked
                              ? 'bg-emerald-700 border-emerald-700 text-white'
                              : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                          }`}
                        >
                          {checked && <Check className="w-3.5 h-3.5" />}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/70 px-3.5 py-2.5 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 min-h-[44px] rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-sm font-semibold cursor-pointer"
            >
              {busy ? 'Creating...' : 'Create Group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
