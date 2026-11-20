import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/index.css';
import {StatusGateScreen} from '../../src/components/StatusGateScreen';
import {mapProfileRowToAppUser} from '../../src/services/supabaseService';

const row = window.fixtureProfile;
const authUser = {id:row.id,user_metadata:{}};
function Fixture() {
  const [user,setUser] = useState(() => mapProfileRowToAppUser(row));
  return <StatusGateScreen user={user} authUser={authUser} onChecked={setUser} departments={[]}/>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
