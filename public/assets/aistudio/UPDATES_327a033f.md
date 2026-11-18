# GSU Connect — Auth & Cohort Update Pack

Apply these in AI Studio. Two files are complete replacements; the rest are
small targeted edits with exact find/replace blocks.

---

## 1. Replace these two files completely

- `src/components/AuthScreen.tsx` → use the updated file in this pack
- `src/services/authService.ts` → use the updated file in this pack

What they add:
- **Recovery email field** on Create Account (required — the database now
  rejects signups without it).
- **Level dropdown driven by course length** — only valid levels for the
  chosen department appear (4-year → 100–400, 5-year → 100–500,
  6-year → 100–600).
- **Session warning** under the level dropdown: "Please select your current
  level for the 2026/2027 academic session." (reads the live session from
  the database, so it updates itself when you start a new session).
- **Forgot password** flow (link under Sign In) that emails a reset link to
  the recovery email on file.
- **`SetPasswordScreen`** component (exported from AuthScreen.tsx) shown
  after a reset link is clicked.

---

## 2. `src/types.ts` — 4 edits

### Edit 1 — allow 600 level (Medicine & Surgery is 6 years)

Find:
```ts
export type AcademicLevel = '100' | '200' | '300' | '400' | '500' | 'Staff';
```
Replace with:
```ts
export type AcademicLevel = '100' | '200' | '300' | '400' | '500' | '600' | 'Staff';
```

### Edit 2 — add course length to DepartmentItem

Find:
```ts
export interface DepartmentItem {
  id: string;
  name: string;
  faculty: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}
```
Replace with:
```ts
export interface DepartmentItem {
  id: string;
  name: string;
  faculty: string;
  durationYears?: number;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}
```

### Edit 3 — add course lengths to the fallback department list

Find:
```ts
export const DEFAULT_GSU_DEPARTMENTS: { name: string; faculty: string }[] = [
```
Replace with:
```ts
export const DEFAULT_GSU_DEPARTMENTS: { name: string; faculty: string; durationYears: number }[] = [
```

Then add `durationYears` to each entry. Every entry gets `durationYears: 4`
**except** these, which get `durationYears: 5`:
`Science Laboratory Technology`, `Pharmacy`, `Common & Islamic Law`, `Law`,
`Private & Property Law`, `Public Law`
— and `Medicine & Surgery`, which gets `durationYears: 6`.

Example (Science Laboratory Technology line):
```ts
  { name: 'Science Laboratory Technology', faculty: 'Science', durationYears: 5 },
```

### Edit 4 — add helpers (paste after the STUDENT_LEVELS block)

Find:
```ts
export const STUDENT_LEVELS: Exclude<AcademicLevel, 'Staff'>[] = [
  '100',
  '200',
  '300',
  '400',
  '500',
];
```
Replace with:
```ts
export const STUDENT_LEVELS: Exclude<AcademicLevel, 'Staff'>[] = [
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
];

/**
 * Formats a stored level for display. Numeric levels become "500 Level";
 * cohort labels such as "Class of 2026" are shown as-is (never "Class of
 * 2026 Level"); Staff stays "Staff".
 */
export function formatLevelLabel(level: string): string {
  const v = (level || '').trim();
  if (!v || v.toLowerCase() === 'staff') return 'Staff';
  if (/^class of \d{4}$/i.test(v)) return v;
  if (/^\d{3}$/.test(v)) return `${v} Level`;
  return v;
}

/** Valid student levels for a course of the given length in years. */
export function levelsForDuration(durationYears: number): AcademicLevel[] {
  const dur = Math.min(6, Math.max(1, Math.floor(durationYears) || 4));
  const levels: AcademicLevel[] = [];
  for (let i = 1; i <= dur; i++) {
    levels.push(`${i}00` as AcademicLevel);
  }
  return levels;
}
```

---

## 3. `src/services/supabaseService.ts` — 3 edits

### Edit 1 — import slugify

In the `from '../types'` import block, add `slugify,` (alphabetical spot is
near `safeJsonParse`… simply add it anywhere in that import list).

### Edit 2 — DepartmentRow gains duration_years

Find:
```ts
interface DepartmentRow {
  id: string;
  name: string;
  faculty: string;
  created_at?: string | null;
  updated_at?: string | null;
}
```
Replace with:
```ts
interface DepartmentRow {
  id?: string;
  name: string;
  faculty: string;
  duration_years?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}
```

### Edit 3 — load departments for guests via the public RPC

Find:
```ts
      const deptPromise = canReadDepartments
        ? supabase.from('departments').select('*').order('name', { ascending: true })
        : Promise.resolve({ data: null });
```
Replace with:
```ts
      const deptPromise = canReadDepartments
        ? supabase.from('departments').select('*').order('name', { ascending: true })
        : supabase.rpc('list_departments');
```

Find:
```ts
      if (canReadDepartments && Array.isArray(deptData) && deptData.length > 0) {
        handlers.onDepartments(
          (deptData as DepartmentRow[]).map((d) => ({
            id: d.id,
            name: d.name,
            faculty: d.faculty,
            createdAt: toAppTimestamp(d.created_at),
            updatedAt: toAppTimestamp(d.updated_at || d.created_at),
          })),
          true
        );
      } else {
        handlers.onDepartments([], false);
      }
```
Replace with:
```ts
      if (Array.isArray(deptData) && deptData.length > 0) {
        handlers.onDepartments(
          (deptData as DepartmentRow[]).map((d) => ({
            id: d.id || slugify(d.name),
            name: d.name,
            faculty: d.faculty,
            durationYears: d.duration_years ?? 4,
            createdAt: d.created_at ? toAppTimestamp(d.created_at) : null,
            updatedAt: d.updated_at
              ? toAppTimestamp(d.updated_at)
              : d.created_at
                ? toAppTimestamp(d.created_at)
                : null,
          })),
          true
        );
      } else {
        handlers.onDepartments([], false);
      }
```

Also update the fallback in `src/App.tsx` (effectiveDepartments) so the
hardcoded list carries durations:

Find:
```ts
    return DEFAULT_GSU_DEPARTMENTS.map((d) => ({
      id: slugify(d.name),
      name: d.name,
      faculty: d.faculty,
    }));
```
Replace with:
```ts
    return DEFAULT_GSU_DEPARTMENTS.map((d) => ({
      id: slugify(d.name),
      name: d.name,
      faculty: d.faculty,
      durationYears: d.durationYears,
    }));
```

---

## 4. `src/App.tsx` — 3 edits (password reset landing screen)

### Edit 1 — lazy import SetPasswordScreen

Find:
```ts
const LazyAuthScreen = React.lazy(() =>
  import('./components/AuthScreen').then((m) => ({ default: m.AuthScreen }))
);
```
Replace with:
```ts
const LazyAuthScreen = React.lazy(() =>
  import('./components/AuthScreen').then((m) => ({ default: m.AuthScreen }))
);
const LazySetPasswordScreen = React.lazy(() =>
  import('./components/AuthScreen').then((m) => ({ default: m.SetPasswordScreen }))
);
```

### Edit 2 — state + auth listener

Find:
```ts
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<SupabaseAuthUser | null>(null);
```
Replace with:
```ts
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<SupabaseAuthUser | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
```

Find:
```ts
    const unsub = subscribeToAuthState((_event, session) => {
      const user = session?.user ?? null;
      setAuthUser(user);
      setAuthReady(true);
```
Replace with:
```ts
    const unsub = subscribeToAuthState((event, session) => {
      const user = session?.user ?? null;
      setAuthUser(user);
      setAuthReady(true);
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true);
      }
```

### Edit 3 — render the set-password screen first

Find:
```ts
  if (!authReady || (authUser && userLoading)) {
```
Replace with:
```ts
  if (passwordRecovery) {
    return (
      <React.Suspense
        fallback={
          <div className="min-h-screen bg-[#F6F8F7] dark:bg-slate-950 flex items-center justify-center p-6">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Loading...</p>
          </div>
        }
      >
        <LazySetPasswordScreen onComplete={() => setPasswordRecovery(false)} />
      </React.Suspense>
    );
  }

  if (!authReady || (authUser && userLoading)) {
```

---

## 5. Level display fixes — 5 files

These stop "Class of 2026 Level" from appearing. In each file, add
`formatLevelLabel` to the existing `from '../types'` import, then swap the
template literal.

**`src/components/UserProfileModal.tsx`**
Find: `{targetUser.level === 'Staff' ? 'University Staff' : `${targetUser.level} Level`}`
Replace: `{targetUser.level === 'Staff' ? 'University Staff' : formatLevelLabel(targetUser.level)}`

**`src/components/StatusGateScreen.tsx`**
Find: `{user.level === 'Staff' ? 'Staff' : `${user.level} Level`}`
Replace: `{user.level === 'Staff' ? 'Staff' : formatLevelLabel(user.level)}`

**`src/components/ChatsView.tsx`** (two places)
Find:
```ts
      const levelText = chat.level
        ? chat.level === 'Staff'
          ? 'Staff'
          : `${chat.level} Level`
        : 'All levels';
```
Replace:
```ts
      const levelText = chat.level ? formatLevelLabel(chat.level) : 'All levels';
```
(Apply to both occurrences — department and deptLevel branches.)

**`src/components/AdminView.tsx`** (two places)
Find: `{user.level === 'Staff' ? 'Staff' : `${user.level} Level`}`
Replace: `{user.level === 'Staff' ? 'Staff' : formatLevelLabel(user.level)}`

Find: `` `${group.department}${group.level ? ` · ${group.level === 'Staff' ? 'Staff' : `${group.level} Level`}` : ' · All levels'}` ``
Replace: `` `${group.department}${group.level ? ` · ${formatLevelLabel(group.level)}` : ' · All levels'}` ``

**`src/components/ProfileView.tsx`**
Find: `{currentUser.level === 'Staff' ? 'Staff' : `${currentUser.level} Level`}`
Replace: `{currentUser.level === 'Staff' ? 'Staff' : formatLevelLabel(currentUser.level)}`

---

## 6. Database steps (already done / still needed)

**Done:** the `password-reset` edge function is deployed and active.

**Still needed — requires you:**
1. Create a free **Brevo** account (brevo.com) → SMTP & API → generate an
   API key (`xkeysib-...`) and verify a sender email address.
2. Give me the API key + verified sender email, and the deployed app URL.
   I will then set the `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, and `APP_URL`
   secrets, and update the auth site URL + redirect allow-list so reset
   links land back in the app.

Until step 2 is done, the forgot-password form will show the "check your
inbox" message but no email will be sent (the function safely does nothing
without its secrets).
