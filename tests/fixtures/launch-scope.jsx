import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/index.css';
import {CampusHubView, TodayView} from '../../src/components/WorkspaceHomeViews';
import {UserProfileModal} from '../../src/components/UserProfileModal';
import {ConfessionsView} from '../../src/components/ConfessionsView';

const me = {uid:'fixture-a', fullName:'Test Student', role:'student', status:'approved', level:'200', department:'Test', blockedUsers:[]};
const peer = {...me,uid:'fixture-b',fullName:'Test Classmate'};
const data = {currentUser:me,calendarEvents:[],announcements:[],chats:[],unreadCounts:{},resources:[],statuses:[]};
const fixturePost = {id:'00000000-0000-4000-8000-000000000001',category:'Confession',text:'Synthetic post',status:'approved',upvoteCount:0,upvotedByMe:false};
function Fixture() {
  const [section,setSection]=useState('campus');
  const [modal,setModal]=useState(false);
  const [enabled,setEnabled]=useState(false);
  const [message,setMessage]=useState('');
  return <main>
    <nav><button onClick={()=>setSection('today')}>Fixture Today</button><button onClick={()=>setSection('campus')}>Fixture Campus</button><button onClick={()=>setSection('feed')}>Fixture hidden feed</button><button onClick={()=>setSection('admin-feed')}>Fixture admin feed</button><button onClick={()=>setModal(true)}>Open fixture profile</button><button onClick={()=>setEnabled(v=>!v)}>Toggle test-only calling</button></nav>
    <output aria-label="Fixture result">{message}</output>
    {section==='feed' ? <ConfessionsView currentUser={me} confessions={[]}/> : section==='admin-feed' ? <ConfessionsView currentUser={{...me,role:'admin'}} confessions={[fixturePost]}/> : section==='campus' ? <CampusHubView {...data} onNavigate={s=>setMessage(s)}/> : <TodayView {...data} onNavigate={s=>setMessage(s)}/>}
    {modal && <UserProfileModal currentUser={me} targetUser={peer} onClose={()=>setModal(false)} onMessage={()=>setMessage('message')} onVoiceCall={enabled?()=>setMessage('call'):undefined}/>}
  </main>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
