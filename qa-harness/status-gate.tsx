/**
 * Screenshot-only harness: mounts the real StatusGateScreen with fixture users.
 *
 * Used by scripts/capture-auth-shots.mjs. Not part of the app build.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
// The app's real token layer and Tailwind entry — without this the gate
// renders unstyled.
import '../src/index.css';
import { StatusGateScreen } from '../src/components/StatusGateScreen';
import type { AppUser, DepartmentItem } from '../src/types';

const departments: DepartmentItem[] = [
  { id: 'env-mgt', name: 'Environmental Management', faculty: 'Science', durationYears: 4 },
  { id: 'cs', name: 'Computer Science', faculty: 'Science', durationYears: 4 },
  { id: 'law', name: 'Law', faculty: 'Arts and Social Sciences', durationYears: 5 },
];

const base: AppUser = {
  uid: 'qa-fixture-uid',
  fullName: 'Amina Bello Musa',
  idNumber: 'UG25/QAT/9101',
  idNumberNormalized: 'UG25QAT9101',
  accountType: 'student',
  department: 'Environmental Management',
  level: '200',
  role: 'student',
  email: 'ug25qat9101@gsu.edu.ng',
  status: 'pending',
  createdAt: null,
  updatedAt: null,
  lastSeen: null,
};

function userFor(status: string): AppUser {
  if (status === 'rejected') {
    return {
      ...base,
      status: 'rejected',
      rejectionReason:
        'The uploaded document does not show a matric number that matches the one entered. Please upload a clearer ID card or admission letter.',
    };
  }
  if (status === 'suspended') {
    return {
      ...base,
      status: 'suspended',
      rejectionReason: 'Repeated spam reports from multiple students.',
    };
  }
  return { ...base, status: 'pending' };
}

const authUser = {
  id: 'qa-fixture-uid',
  email: 'ug25qat9101@gsu.edu.ng',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: { provider: 'email' },
  user_metadata: {},
} as never;

function render(user: AppUser) {
  const el = document.getElementById('root');
  if (!el) return;
  const holder = el as unknown as { __qaRoot?: ReturnType<typeof createRoot> };
  holder.__qaRoot?.unmount();
  const root = createRoot(el);
  holder.__qaRoot = root;
  root.render(
    <StatusGateScreen
      user={user}
      authUser={authUser}
      departments={departments}
      onChecked={() => undefined}
    />
  );
}

// Lets the capture script swap fixtures without reloading the page.
(window as unknown as Record<string, unknown>).__setGateUser = (status: string) => {
  render(userFor(status));
};

render(userFor('pending'));
