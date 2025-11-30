// app.js (ES Module)
const DB_NAME = 'Educross_web';
const DB_VERSION = 1;
let db;

const sampleActivities = [
  { id:'mc1', type:'mcq', title:'STEM', question:'What does STEM stand for?', choices:['A. Social Training and Educational Management','B. Science, Technology, Engineering, and Mathematics','C. Structural Testing for Emergency Machinery','D. Systematic Teaching of Environmental Methods'], answer:'B. Science, Technology, Engineering, and Mathematics', points:20 },
  { id:'mc2', type:'mcq', title:'Career', question:'Which of the following careers is most related to STEM?', choices:['A. Chef','B. Mechanical Engineer','C. Lawyer','D. Historian'], answer:'B. Mechanical Engineer', points:10 },
  { id:'dd1', type:'drag', title:'Biology', question:'Drag the stages to its categories', pairs:{AnaphaseI:'Reduction Division',ProphaseI:'Reduction Division',Telophase:'Mitosis',Prophase:'Mitosis', Growth:'Mitosis',"Telophase I and Cytokinesis":'Reduction Division',MetaphaseI:'Reduction Division',Anaphase:'Mitosis',Metaphase:'Mitosis'}, categories:['Mitosis','Reduction Division'], points:50 },
  { id:'cw1', type:'cross', title:'Solar crossword', words:{"The red planet":'MARS',"Earth's satellite":'MOON',"Center of solar system":'SUN'}, points:30 }
];

// ----- IndexedDB helpers -----
function openDB(){ return new Promise((res,rej)=>{
  const req = indexedDB.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = e => {
    const idb = e.target.result;
    if(!idb.objectStoreNames.contains('users')) idb.createObjectStore('users',{keyPath:'username'});
    if(!idb.objectStoreNames.contains('completed')) idb.createObjectStore('completed',{keyPath:['username','activityId']});
  };
  req.onsuccess = e => { db = e.target.result; res(db); };
  req.onerror = e => rej(e);
});}

function tx(store, mode='readonly'){ return db.transaction(store, mode).objectStore(store); }

// ----- Auth CRUD -----
async function createUser(username,password,role){
  const store = tx('users','readwrite');
  return new Promise((res,rej)=>{
    const get = store.get(username);
    get.onsuccess = () => {
      if(get.result) return res({ok:false, msg:'User exists'});
      const add = store.add({username,password,role,totalScore:0});
      add.onsuccess = () => res({ok:true});
      add.onerror = e => rej(e);
    };
    get.onerror = e => rej(e);
  });
}
async function authUser(username,password,role){
  const store = tx('users');
  return new Promise((res,rej)=>{
    const req = store.get(username);
    req.onsuccess = ()=> {
      const u = req.result;
      if(u && u.password === password && u.role === role) res({ok:true,user:u}); else res({ok:false});
    };
    req.onerror = e => rej(e);
  });
}
async function getCompleted(username){
  const store = tx('completed');
  return new Promise((res,rej)=>{
    const list = [];
    const cursor = store.openCursor();
    cursor.onsuccess = e => {
      const c = e.target.result;
      if(!c) { res(list.filter(i=>i.username===username)); return; }
      list.push(c.value);
      c.continue();
    };
    cursor.onerror = e => rej(e);
  });
}

async function getAllUsers(){
  const store = tx('users');
  return new Promise((res,rej)=>{
    const list = [];
    const cursor = store.openCursor();
    cursor.onsuccess = e => {
      const c = e.target.result;
      if(!c) { res(list); return; }
      list.push(c.value);
      c.continue();
    };
    cursor.onerror = e => rej(e);
  });
}

async function updateUser(userData){
  const store = tx('users', 'readwrite');
  return new Promise((res,rej)=>{
    const req = store.put(userData);
    req.onsuccess = () => res({ok:true});
    req.onerror = e => rej({ok:false, error:e});
  });
}

async function getLatestUserData(username){
  const store = tx('users');
  return new Promise((res,rej)=>{
    const req = store.get(username);
    req.onsuccess = (e) => {
      const user = e.target.result;
      if(user) res(user);
      else rej({ok:false});
    };
    req.onerror = (e) => rej(e);
  });
}
async function markCompleted(username,activityId,points){
  const store = tx('completed','readwrite');
  return new Promise((res,rej)=>{
    const key = [username,activityId];
    const put = store.put({username,activityId,points,completedAt:Date.now()});
    put.onsuccess = ()=> res(true);
    put.onerror = e => rej(e);
  });
}

// ----- UI rendering -----
const app = document.getElementById('app');
const authTpl = document.getElementById('auth-template').content;
const dashTpl = document.getElementById('dashboard-template').content;
const teacherDashTpl = document.getElementById('teacher-dashboard-template').content;
let currentUser = null;

function showAuth(){ app.innerHTML=''; app.appendChild(authTpl.cloneNode(true)); setupAuthHandlers(); }
function showDashboard(){ 
  app.innerHTML='';
  if(currentUser.role === 'Teacher') {
    app.appendChild(teacherDashTpl.cloneNode(true));
    setupTeacherDashboard();
  } else {
    app.appendChild(dashTpl.cloneNode(true));
    setupDashboard();
  }
}

function setupAuthHandlers(){
  const loginBtn = document.getElementById('login-btn');
  const signupBtn = document.getElementById('signup-btn');
  loginBtn.onclick = async () => {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const role = document.querySelector('input[name=role]:checked').value;
    if(!username||!password){ showAuthError('Please fill in all fields'); return; }
    const r = await authUser(username,password,role);
    if(r.ok){ 
      currentUser = r.user; 
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
      await ensureActivitiesSeed(); 
      showDashboard(); 
    } else showAuthError('Invalid credentials');
  };
  signupBtn.onclick = async () => {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const role = document.querySelector('input[name=role]:checked').value;
    if(!username||!password){ showAuthError('Please fill in all fields'); return; }
    const r = await createUser(username,password,role);
    if(r.ok){ alert('Account created — you can sign in now'); } else showAuthError(r.msg||'Failed to create user');
  };
}

function showAuthError(msg){ const e = document.getElementById('auth-error'); e.textContent = msg; e.style.display='block'; setTimeout(()=>e.style.display='none',2500); }

async function setupDashboard(){
  // Fetch latest user data from database
  try {
    const latestUser = await getLatestUserData(currentUser.username);
    currentUser = latestUser;
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
  } catch(err) {
    console.log('Could not fetch latest user data, using current session data');
  }
  
  document.getElementById('user-name').textContent = currentUser.username;
  document.getElementById('user-role').textContent = currentUser.role;
  document.getElementById('profile-username').textContent = currentUser.username;
  document.getElementById('profile-role').textContent = currentUser.role;
  
  // Update profile avatar in sidebar
  const profileAvatarElement = document.querySelector('.profile-avatar');
  if(profileAvatarElement && currentUser.profilePic) {
    profileAvatarElement.style.backgroundImage = `url('${currentUser.profilePic}')`;
    profileAvatarElement.textContent = '';
  }
  
  document.getElementById('logout-btn').onclick = ()=> { 
    currentUser = null; 
    localStorage.removeItem('currentUser');
    showAuth(); 
  };

  // Mobile menu toggle
  const menuToggle = document.getElementById('menu-toggle');
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  const sidebarClose = document.getElementById('sidebar-close');

  if (menuToggle) {
    menuToggle.onclick = () => {
      sidebar.classList.add('active');
      sidebarOverlay.classList.add('active');
    };
  }

  if (sidebarClose) {
    sidebarClose.onclick = () => {
      sidebar.classList.remove('active');
      sidebarOverlay.classList.remove('active');
    };
  }

  if (sidebarOverlay) {
    sidebarOverlay.onclick = () => {
      sidebar.classList.remove('active');
      sidebarOverlay.classList.remove('active');
    };
  }

  // Close sidebar when navigation item is clicked
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      sidebar.classList.remove('active');
      sidebarOverlay.classList.remove('active');
    });
  });
  document.getElementById('nav-activities').onclick = () => showActivitySection();
  document.getElementById('nav-progress').onclick = () => showProgressSection();
  document.getElementById('nav-profile').onclick = () => showProfileSection();

  // Show activities by default
  showActivitySection();
}

function showActivitySection(){
  // Update nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById('nav-activities').classList.add('active');
  
  // Show/hide sections
  document.getElementById('activity-area').style.display = 'block';
  document.getElementById('progress-area').style.display = 'none';
  document.getElementById('profile-area').style.display = 'none';

  // Load activities list
  const list = document.getElementById('activity-list');
  list.innerHTML = '';
  getCompleted(currentUser.username).then(completed => {
    const completedIds = completed.map(x=>x.activityId);
    sampleActivities.forEach(act=>{
      const li = document.createElement('li');
      li.className = 'activity-item';
      li.innerHTML = `<div class="activity-item-title">${act.title}</div><div class="activity-item-meta">${act.type.toUpperCase()} - ${act.points} pts</div>`;
      if(completedIds.includes(act.id)) li.classList.add('completed');
      li.onclick = ()=> renderActivity(act);
      list.appendChild(li);
    });
  });
  
  document.getElementById('activity-content').innerHTML = '';
  document.getElementById('activity-title').textContent = 'Select an Activity';
}

async function showProgressSection(){
  // Update nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById('nav-progress').classList.add('active');
  
  // Show/hide sections
  document.getElementById('activity-area').style.display = 'none';
  document.getElementById('progress-area').style.display = 'block';
  document.getElementById('profile-area').style.display = 'none';

  // Load progress data
  const completed = await getCompleted(currentUser.username);
  const completedIds = new Set(completed.map(x => x.activityId));
  const totalPoints = completed.reduce((sum, c) => sum + c.points, 0);
  const completionPercentage = Math.round((completed.length / sampleActivities.length) * 100);

  let html = `
    <div class="progress-dashboard">
      <div class="progress-stats">
        <div class="progress-stat">
          <div class="stat-value">${completed.length}/${sampleActivities.length}</div>
          <div class="stat-label">Activities Completed</div>
        </div>
        <div class="progress-stat">
          <div class="stat-value">${completionPercentage}%</div>
          <div class="stat-label">Completion Rate</div>
        </div>
        <div class="progress-stat">
          <div class="stat-value">${totalPoints}</div>
          <div class="stat-label">Total Points</div>
        </div>
      </div>
      <div class="progress-list">
        <h3>Activity Breakdown</h3>
  `;
  
  sampleActivities.forEach(act => {
    const isCompleted = completedIds.has(act.id);
    const completedData = completed.find(c => c.activityId === act.id);
    html += `
      <div class="progress-item ${isCompleted ? 'completed' : ''}">
        <div class="progress-item-title">${act.title}</div>
        <div class="progress-item-details">
          <span>${act.type.toUpperCase()}</span>
          <span>${isCompleted ? `✅ ${completedData.points} pts` : '⏳ Not started'}</span>
        </div>
      </div>
    `;
  });

  html += `</div></div>`;
  document.getElementById('progress-content').innerHTML = html;
}

async function showProfileSection(){
  // Fetch latest user data from database
  try {
    const latestUser = await getLatestUserData(currentUser.username);
    currentUser = latestUser;
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
  } catch(err) {
    console.log('Using current user data');
  }
  
  // Update nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById('nav-profile').classList.add('active');
  
  // Show/hide sections
  document.getElementById('activity-area').style.display = 'none';
  document.getElementById('progress-area').style.display = 'none';
  document.getElementById('profile-area').style.display = 'block';

  // Load profile data
  const completed = await getCompleted(currentUser.username);
  const totalPoints = completed.reduce((sum, c) => sum + c.points, 0);
  const profilePic = currentUser.profilePic || '👤';
  const hasProfilePic = currentUser.profilePic ? true : false;

  let html = `
    <div class="profile-card">
      <div class="profile-header">
        <div class="profile-pic-wrapper">
          <div id="profile-display" class="profile-pic" ${hasProfilePic ? `style="background-image: url('${currentUser.profilePic}'); background-size: cover; background-position: center; font-size: 0;"` : ''}>${hasProfilePic ? '' : profilePic}</div>
          <input type="file" id="profile-pic-input" accept="image/*" style="display:none;" />
          <button type="button" class="btn-upload" onclick="document.getElementById('profile-pic-input').click()">📷 Change</button>
        </div>
        <div class="profile-basic">
          <h3>${currentUser.username}</h3>
          <p>${currentUser.role}</p>
        </div>
      </div>
      <hr />
      <div class="profile-stats-grid">
        <div class="profile-stat">
          <span class="stat-icon">📚</span>
          <div>
            <div class="stat-value">${sampleActivities.length}</div>
            <div class="stat-label">Total Activities</div>
          </div>
        </div>
        <div class="profile-stat">
          <span class="stat-icon">✅</span>
          <div>
            <div class="stat-value">${completed.length}</div>
            <div class="stat-label">Completed</div>
          </div>
        </div>
        <div class="profile-stat">
          <span class="stat-icon">⭐</span>
          <div>
            <div class="stat-value">${totalPoints}</div>
            <div class="stat-label">Points Earned</div>
          </div>
        </div>
      </div>
      <hr />
      <div class="profile-section">
        <h4>Edit Profile</h4>
        <form id="profile-form">
          <div class="form-group">
            <label>Username:</label>
            <input type="text" id="form-username" value="${currentUser.username}" />
          </div>
          <div class="form-group">
            <label>Role:</label>
            <input type="text" value="${currentUser.role}" disabled />
          </div>
          <div class="form-group">
            <label>Email:</label>
            <input type="email" id="form-email" placeholder="Add your email (optional)" value="${currentUser.email || ''}" />
          </div>
          <div class="form-group">
            <label>Bio:</label>
            <textarea id="form-bio" placeholder="Add a short bio about yourself" rows="3">${currentUser.bio || ''}</textarea>
          </div>
          <div class="form-actions">
            <button type="button" class="btn primary" id="save-btn">💾 Save Changes</button>
            <button type="button" class="btn alt" id="reset-btn">↩️ Reset</button>
          </div>
        </form>
      </div>
    </div>
  `;
  
  document.getElementById('profile-content').innerHTML = html;
  
  // Attach event listeners to buttons
  document.getElementById('save-btn').addEventListener('click', saveProfile);
  document.getElementById('reset-btn').addEventListener('click', resetProfile);
  
  // Setup image upload handler - needs to be after DOM is ready
  setTimeout(() => {
    const picInput = document.getElementById('profile-pic-input');
    if(picInput) {
      picInput.onchange = async (e) => {
        const file = e.target.files[0];
        if(file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const imageData = event.target.result;
            currentUser.profilePic = imageData;
            const displayDiv = document.getElementById('profile-display');
            displayDiv.style.backgroundImage = `url('${imageData}')`;
            displayDiv.style.fontSize = '0';
            displayDiv.textContent = '';
            console.log('✅ Profile picture uploaded');
          };
          reader.readAsDataURL(file);
        }
      };
    }
  }, 0);
}

function updateUsername(){
  const newUsername = document.getElementById('form-username').value.trim();
  if(!newUsername) {
    alert('Username cannot be empty');
    return;
  }
  currentUser.username = newUsername;
  document.getElementById('user-name').textContent = newUsername;
  document.getElementById('profile-username').textContent = newUsername;
  alert('✅ Username updated!');
}

async function saveProfile(){
  console.log('💾 saveProfile called');
  
  try {
    const usernameInput = document.getElementById('form-username');
    const emailInput = document.getElementById('form-email');
    const bioInput = document.getElementById('form-bio');
    
    console.log('Form inputs found:', {
      username: usernameInput ? '✅' : '❌',
      email: emailInput ? '✅' : '❌',
      bio: bioInput ? '✅' : '❌'
    });
    
    const username = usernameInput?.value.trim() || '';
    const email = emailInput?.value.trim() || '';
    const bio = bioInput?.value.trim() || '';
    
    console.log('Form values:', { username, email, bio });
    
    if(!username) {
      alert('❌ Username cannot be empty');
      return;
    }
    
    // Update current user object with new values
    currentUser.username = username;
    currentUser.email = email;
    currentUser.bio = bio;
    
    console.log('Updated currentUser:', currentUser);
    
    // Save to IndexedDB
    const result = await updateUser(currentUser);
    
    console.log('updateUser result:', result);
    
    if(result.ok) {
      // Update localStorage
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
      
      // Update UI
      const userNameEl = document.getElementById('user-name');
      const profileUsernameEl = document.getElementById('profile-username');
      
      if(userNameEl) userNameEl.textContent = username;
      if(profileUsernameEl) profileUsernameEl.textContent = username;
      
      console.log('✅ Profile saved successfully');
      alert('✅ Profile saved successfully!');
      await showProfileSection();
    } else {
      console.error('Save failed - result not ok:', result);
      alert('❌ Failed to save profile');
    }
  } catch(err) {
    console.error('❌ Save error:', err);
    alert('❌ Error saving profile: ' + err.message);
  }
}

function resetProfile(){
  // Reload the profile form without saving (discard changes)
  showProfileSection();
}

function deleteActivity(activityId) {
  if(confirm('⚠️ Are you sure you want to delete this activity? This action cannot be undone.')) {
    // Find and remove activity from sampleActivities array
    const index = sampleActivities.findIndex(a => a.id === activityId);
    if(index > -1) {
      const deletedActivity = sampleActivities.splice(index, 1)[0];
      console.log('🗑️ Activity deleted:', deletedActivity.title);
      alert(`✅ Activity "${deletedActivity.title}" has been deleted!`);
      setupTeacherDashboard(); // Refresh the dashboard
    } else {
      alert('❌ Activity not found');
    }
  }
}

async function setupTeacherDashboard(){
  document.getElementById('teacher-name').textContent = currentUser.username;
  document.getElementById('teacher-role').textContent = currentUser.role;
  document.getElementById('teacher-logout-btn').onclick = ()=> { 
    currentUser = null; 
    localStorage.removeItem('currentUser');
    showAuth(); 
  };

  // Mobile menu toggle for teacher dashboard
  const teacherMenuToggle = document.getElementById('teacher-menu-toggle');
  const teacherSidebar = document.getElementById('teacher-sidebar');
  const teacherSidebarOverlay = document.getElementById('teacher-sidebar-overlay');
  const teacherSidebarClose = document.getElementById('teacher-sidebar-close');

  if (teacherMenuToggle) {
    teacherMenuToggle.onclick = () => {
      teacherSidebar.classList.add('active');
      teacherSidebarOverlay.classList.add('active');
    };
  }

  if (teacherSidebarClose) {
    teacherSidebarClose.onclick = () => {
      teacherSidebar.classList.remove('active');
      teacherSidebarOverlay.classList.remove('active');
    };
  }

  if (teacherSidebarOverlay) {
    teacherSidebarOverlay.onclick = () => {
      teacherSidebar.classList.remove('active');
      teacherSidebarOverlay.classList.remove('active');
    };
  }

  // Stats & Students
  const allUsers = await getAllUsers();
  const students = allUsers.filter(u => u.role === 'Student');
  document.getElementById('total-students').textContent = students.length;
  document.getElementById('total-activities').textContent = sampleActivities.length;
  
  // Calculate completion rate
  let totalCompleted = 0;
  for(const s of students) {
    const completed = await getCompleted(s.username);
    totalCompleted += completed.length;
  }
  const avgCompletion = students.length > 0 ? Math.round((totalCompleted / (students.length * sampleActivities.length)) * 100) : 0;
  document.getElementById('completion-rate').textContent = avgCompletion + '%';

  // Student list in sidebar
  const studentList = document.getElementById('teacher-student-list');
  if(studentList) {
    studentList.innerHTML = '';
    students.forEach(student => {
      const li = document.createElement('li');
      li.className = 'student-item';
      li.innerHTML = `👤 ${student.username}`;
      li.onclick = () => viewStudentProgress(student.username);
      studentList.appendChild(li);
    });
  }

  // Activity list
  const list = document.getElementById('teacher-activity-list');
  list.innerHTML = '';
  sampleActivities.forEach(act => {
    const li = document.createElement('li');
    li.className = 'teacher-activity-item';
    li.style.display = 'flex';
    li.style.justifyContent = 'space-between';
    li.style.alignItems = 'center';
    
    const activityInfo = document.createElement('div');
    activityInfo.style.flex = '1';
    activityInfo.style.cursor = 'pointer';
    activityInfo.innerHTML = `<strong>${act.title}</strong><br><small>${act.type.toUpperCase()} - ${act.points} pts</small>`;
    activityInfo.onclick = () => renderTeacherActivityDetails(act);
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn alt';
    deleteBtn.style.padding = '4px 8px';
    deleteBtn.style.fontSize = '12px';
    deleteBtn.style.marginLeft = '8px';
    deleteBtn.textContent = '🗑️ Delete';
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      deleteActivity(act.id);
    };
    
    li.appendChild(activityInfo);
    li.appendChild(deleteBtn);
    list.appendChild(li);
  });

  // New Activity button
  document.getElementById('new-activity-btn').onclick = () => showCreateActivityForm();

  // Default content
  const content = document.getElementById('teacher-content');
  content.innerHTML = '<div class="welcome-card"><p>👋 Welcome, Teacher! Select a student to view progress, activity to edit, or create a new activity.</p></div>';
}

function viewStudentProgress(username){
  const content = document.getElementById('teacher-content');
  getCompleted(username).then(completed => {
    let html = `<div class="activity-card"><h3>📊 ${username}'s Progress</h3><div class="student-progress">`;
    sampleActivities.forEach(act => {
      const isCompleted = completed.some(c => c.activityId === act.id);
      const completedPoint = completed.find(c => c.activityId === act.id);
      html += `
        <div class="progress-item ${isCompleted ? 'completed' : ''}">
          <div class="progress-title">${act.title}</div>
          <div class="progress-status">${isCompleted ? `✅ Completed - ${completedPoint.points} pts` : '⏳ Not completed'}</div>
        </div>
      `;
    });
    html += '</div></div>';
    content.innerHTML = html;
  });
}

function showCreateActivityForm(){
  const content = document.getElementById('teacher-content');
  content.innerHTML = `
    <div class="activity-card">
      <h3>➕ Create New Activity</h3>
      <form id="create-activity-form" class="create-form">
        <div class="form-group">
          <label>Activity Title:</label>
          <input type="text" id="act-title" placeholder="e.g., World Capitals" required />
        </div>
        <div class="form-group">
          <label>Activity Type:</label>
          <select id="act-type" required>
            <option value="mcq">Multiple Choice (MCQ)</option>
            <option value="drag">Drag & Drop</option>
            <option value="cross">Crossword</option>
          </select>
        </div>
        <div class="form-group">
          <label>Points:</label>
          <input type="number" id="act-points" min="1" value="10" required />
        </div>
        <div class="form-group">
          <label>Question/Description:</label>
          <textarea id="act-question" placeholder="Enter the question or activity description" required></textarea>
        </div>
        <div id="type-specific-fields"></div>
        <div class="form-actions">
          <button type="submit" class="btn primary">✅ Create Activity</button>
          <button type="button" class="btn alt" onclick="setupTeacherDashboard()">❌ Cancel</button>
        </div>
      </form>
    </div>
  `;

  document.getElementById('act-type').onchange = () => updateTypeFields();
  document.getElementById('create-activity-form').onsubmit = (e) => handleCreateActivity(e);
  updateTypeFields();
}

function updateTypeFields(){
  const type = document.getElementById('act-type').value;
  const fieldsDiv = document.getElementById('type-specific-fields');
  
  if(type === 'mcq') {
    fieldsDiv.innerHTML = `
      <div class="form-group">
        <label>Choices (comma-separated):</label>
        <input type="text" id="act-choices" placeholder="e.g., Option A, Option B, Option C, Option D" required />
      </div>
      <div class="form-group">
        <label>Correct Answer:</label>
        <input type="text" id="act-answer" placeholder="e.g., Option A" required />
      </div>
    `;
  } else if(type === 'drag') {
    fieldsDiv.innerHTML = `
      <div class="form-group">
        <label>Items & Categories (format: item-category):</label>
        <textarea id="act-pairs" placeholder="e.g., Dog-Mammals&#10;Cat-Mammals&#10;Eagle-Birds" required></textarea>
      </div>
      <div class="form-group">
        <label>Categories (comma-separated):</label>
        <input type="text" id="act-categories" placeholder="e.g., Mammals, Birds, Fish" required />
      </div>
    `;
  } else if(type === 'cross') {
    fieldsDiv.innerHTML = `
      <div class="form-group">
        <label>Clues & Answers (format: clue-answer):</label>
        <textarea id="act-words" placeholder="e.g., Largest planet-JUPITER&#10;Earth's satellite-MOON" required></textarea>
      </div>
    `;
  }
}

function handleCreateActivity(e){
  e.preventDefault();
  const type = document.getElementById('act-type').value;
  const newActivity = {
    id: 'act' + Date.now(),
    type: type,
    title: document.getElementById('act-title').value,
    question: document.getElementById('act-question').value,
    points: parseInt(document.getElementById('act-points').value)
  };

  if(type === 'mcq') {
    newActivity.choices = document.getElementById('act-choices').value.split(',').map(c => c.trim());
    newActivity.answer = document.getElementById('act-answer').value.trim();
  } else if(type === 'drag') {
    const pairs = {};
    document.getElementById('act-pairs').value.split('\n').forEach(line => {
      const [item, cat] = line.trim().split('-').map(x => x.trim());
      if(item && cat) pairs[item] = cat;
    });
    newActivity.pairs = pairs;
    newActivity.categories = document.getElementById('act-categories').value.split(',').map(c => c.trim());
  } else if(type === 'cross') {
    const words = {};
    document.getElementById('act-words').value.split('\n').forEach(line => {
      const [clue, answer] = line.trim().split('-').map(x => x.trim());
      if(clue && answer) words[clue] = answer;
    });
    newActivity.words = words;
  }

  sampleActivities.push(newActivity);
  alert('✅ Activity created successfully!');
  setupTeacherDashboard();
}

function renderActivity(act){
  document.getElementById('activity-title').textContent = act.title;
  const area = document.getElementById('activity-content');
  area.innerHTML = '';
  if(act.type==='mcq') renderMCQ(area,act);
  else if(act.type==='drag') renderDrag(area,act);
  else if(act.type==='cross') renderCross(area,act);
}

function renderMCQ(area,act){
  const card = document.createElement('div'); card.className='activity-card';
  const q = document.createElement('p'); q.textContent = act.question;
  card.appendChild(q);
  act.choices.forEach(choice=>{
    const b = document.createElement('div'); b.className='choice'; b.textContent = choice;
    b.onclick = async ()=> {
      const correct = choice === act.answer;
      alert(correct ? `Correct! +${act.points} pts` : `Wrong — answer: ${act.answer}`);
      if(correct){ await markCompleted(currentUser.username,act.id,act.points); setupDashboard(); }
    };
    card.appendChild(b);
  });
  area.appendChild(card);
}

function renderDrag(area,act){
  const wrapper = document.createElement('div'); wrapper.className='activity-card';
  const desc = document.createElement('p'); desc.textContent = act.question;
  wrapper.appendChild(desc);

  const dragContainer = document.createElement('div'); dragContainer.className='drag-container';
  const left = document.createElement('div'); left.className='dropzone';
  const right = document.createElement('div'); right.style.width='220px';

  // make items
  Object.keys(act.pairs).forEach(key=>{
    const el = document.createElement('div'); el.className='draggable'; el.draggable=true; el.textContent=key;
    el.addEventListener('dragstart', e=> e.dataTransfer.setData('text/plain', key));
    left.appendChild(el);
  });

  // create drop zones for categories
  act.categories.forEach(cat=>{
    const zone = document.createElement('div'); zone.className='dropzone';
    const title = document.createElement('h4'); title.textContent = cat; zone.appendChild(title);
    zone.addEventListener('dragover', e=> e.preventDefault());
    zone.addEventListener('drop', e=>{
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain');
      const item = Array.from(left.querySelectorAll('.draggable')).find(d=>d.textContent===id);
      if(item){ zone.appendChild(item); item.draggable=false; }
    });
    right.appendChild(zone);
  });

  const checkBtn = document.createElement('button'); checkBtn.textContent='Submit'; checkBtn.className='btn primary';
  checkBtn.onclick = async ()=>{
    const userPairs = {};
    act.categories.forEach(cat=>{
      const zone = Array.from(right.children).find(z=>z.querySelector('h4').textContent===cat);
      Array.from(zone.querySelectorAll('.draggable')).forEach(it => userPairs[it.textContent] = cat);
    });
    const ok = JSON.stringify(userPairs) === JSON.stringify(act.pairs);
    alert(ok ? `Correct! +${act.points} pts` : `Incorrect — try again`);
    if(ok){ await markCompleted(currentUser.username,act.id,act.points); setupDashboard(); }
  };

  dragContainer.appendChild(left); dragContainer.appendChild(right);
  wrapper.appendChild(dragContainer); wrapper.appendChild(checkBtn);
  area.appendChild(wrapper);
}

function renderCross(area,act){
  const card = document.createElement('div'); card.className='activity-card';
  const form = document.createElement('form');
  const words = act.words;
  Object.keys(words).forEach(k=>{
    const row = document.createElement('div');
    const label = document.createElement('div'); label.textContent = k;
    const input = document.createElement('input'); input.placeholder='answer';
    input.dataset.key = k;
    row.appendChild(label); row.appendChild(input);
    form.appendChild(row);
  });
  const submit = document.createElement('button'); submit.textContent='Submit'; submit.className='btn primary';
  submit.type='button';
  submit.onclick = async ()=>{
    const data = {};
    Array.from(form.querySelectorAll('input')).forEach(inp => data[inp.dataset.key] = (inp.value||'').toUpperCase().trim());
    const ok = Object.entries(words).every(([k,v]) => data[k] === v.toUpperCase());
    alert(ok ? `Correct! +${act.points} pts` : `Some answers are wrong`);
    if(ok){ await markCompleted(currentUser.username,act.id,act.points); setupDashboard(); }
  };
  card.appendChild(form); card.appendChild(submit); area.appendChild(card);
}

// seed activities locally in sessionStorage for simplicity (they're defined in sampleActivities)
async function ensureActivitiesSeed(){ /* nothing needed for client-only demo */ }

// bootstrap
(async ()=>{
  await openDB();
  // if no users present, create sample test users:
  const store = tx('users');
  store.getAll?.() || null; // optional
  // create teacher1/student1 if not exists
  const ustore = db.transaction('users','readwrite').objectStore('users');
  ustore.get('teacher1').onsuccess = e => { if(!e.target.result) ustore.add({username:'teacher1',password:'pass123',role:'Teacher',totalScore:0}); };
  ustore.get('student1').onsuccess = e => { if(!e.target.result) ustore.add({username:'student1',password:'pass123',role:'Student',totalScore:0}); };
  
  // Check if user is already logged in
  const savedUser = localStorage.getItem('currentUser');
  if(savedUser) {
    currentUser = JSON.parse(savedUser);
    
    // Fetch latest user data from database to get any saved updates
    const userStore = tx('users');
    const getUserReq = userStore.get(currentUser.username);
    getUserReq.onsuccess = (e) => {
      const dbUser = e.target.result;
      if(dbUser) {
        // Update currentUser with latest data from database
        currentUser = dbUser;
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
      }
      showDashboard();
    };
    getUserReq.onerror = () => {
      // If database fetch fails, use localStorage data
      showDashboard();
    };
  } else {
    showAuth();
  }
})();
