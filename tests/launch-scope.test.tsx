// Local render/source checks only: these do not exercise live APIs or RLS.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CampusHubView, TodayView, StudyHubView } from '../src/components/WorkspaceHomeViews';
import type { AppUser } from '../src/types';

const props = {
  currentUser: { uid: 'fixture', fullName: 'Test Student', department: 'Test' } as AppUser,
  calendarEvents: [], announcements: [], chats: [], unreadCounts: {}, resources: [], statuses: [],
  onNavigate: () => {},
};

test('campus and home hubs do not offer the deferred commerce features', () => {
  for (const View of [CampusHubView, TodayView, StudyHubView]) {
    const markup = renderToStaticMarkup(<View {...props} />);
    assert.doesNotMatch(markup, /marketplace|rides|errands/i);
  }
  const campus = renderToStaticMarkup(<CampusHubView {...props} />);
  assert.match(campus, /Student updates/);
  assert.match(campus, /Campus updates/);
});

test('app shell has no marketplace or rides tabs or screen entry points', () => {
  const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /id:\s*['"](?:marketplace|rides)['"]/);
  assert.doesNotMatch(source, /activeTab\s*===\s*['"](?:marketplace|rides)['"]/);
  assert.doesNotMatch(source, /<Lazy(?:Marketplace|RidesErrands)View/);
});

test('unready anonymous feed and voice calls are not exposed through the current app shell', () => {
  const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /id:\s*['"]confessions['"]/);
  assert.doesNotMatch(source, /activeTab\s*===\s*['"]confessions['"]/);
  assert.doesNotMatch(source, /onStartVoiceCall\s*=/);
  assert.doesNotMatch(source, /<LazyVoiceCallModal/);
  assert.match(source, /onIncomingCalls:\s*\(\)\s*=>\s*\{\}/);
  const campus = renderToStaticMarkup(<CampusHubView {...props} />);
  assert.doesNotMatch(campus, /Confessions|campus gist/i);
});

test('entry copy reflects the approved product promise', () => {
  const source = readFileSync(new URL('../src/components/AuthScreen.tsx', import.meta.url), 'utf8');
  assert.match(source, /Connect with your classmates and find relevant notices and study materials at GSU\./);
});

test('repository metadata and entry copy do not claim an official GSU relationship', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /official student messenger/i);
  assert.match(html, /independent, student-built/i);
  assert.match(html, /not affiliated with or endorsed by GSU/i);
  const auth = readFileSync(new URL('../src/components/AuthScreen.tsx', import.meta.url), 'utf8');
  assert.match(auth, /not an official GSU service/i);
  const profile = readFileSync(new URL('../src/components/ProfileView.tsx', import.meta.url), 'utf8');
  assert.match(profile, /no official relationship with Gombe State University/i);
  assert.doesNotMatch(profile, /marketplace, and confessions/i);
});

test('launch scope flags keep deferred tables out of normal loading', () => {
  const config = readFileSync(new URL('../src/config/launchScope.ts', import.meta.url), 'utf8');
  for (const feature of ['marketplace', 'ridesErrands', 'anonymousFeed', 'anonymousComments', 'voiceCalls']) {
    assert.match(config, new RegExp(`${feature}: false`));
  }
  const service = readFileSync(new URL('../src/services/supabaseService.ts', import.meta.url), 'utf8');
  assert.match(service, /if \(LAUNCH_SCOPE\.marketplace\) void refreshMarketplace\(\)/);
  assert.match(service, /if \(LAUNCH_SCOPE\.ridesErrands\) void refreshRideErrands\(\)/);
  assert.match(service, /if \(LAUNCH_SCOPE\.anonymousFeed\) void refreshConfessions\(\)/);
  assert.match(service, /if \(LAUNCH_SCOPE\.voiceCalls\) \{\s*void refreshIncomingCalls\(\)/);
});

test('GPA calculator clearly labels estimates as unofficial', () => {
  const source = readFileSync(new URL('../src/components/GpaCalculatorScreen.tsx', import.meta.url), 'utf8');
  assert.match(source, /Estimate only\.<\/strong> This calculator is not an official GSU result or transcript/);
  assert.match(source, /Check your grades, credit units, and the applicable grading rules/);
});

test('notification settings do not present controls that do nothing', () => {
  const profile = readFileSync(new URL('../src/components/ProfileView.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(profile, /gsu_notification_prefs_/);
  assert.doesNotMatch(profile, /soundAlerts|announcementsAndTimetable/);
  assert.match(profile, /does not send push notifications, background alerts or sound alerts/i);
  assert.match(profile, /Do not rely on this app for urgent or time-critical messages/);
});
