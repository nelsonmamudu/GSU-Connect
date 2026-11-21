import React from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/index.css';
import {ConfessionsView} from '../../src/components/ConfessionsView';
const isAdmin=new URLSearchParams(location.search).has('admin');
const user={uid:'fixture-user',fullName:'Fixture User',role:isAdmin?'admin':'student',status:'approved',level:'200',department:'Test',blockedUsers:[]};
const posts=[{id:'00000000-0000-4000-8000-000000000010',category:'Confession',text:'Synthetic post',status:'approved',upvoteCount:0,upvotedByMe:false}];
createRoot(document.getElementById('root')).render(<ConfessionsView currentUser={user} confessions={posts}/>);
