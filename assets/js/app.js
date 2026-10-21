/* NCD Games 2026 — Competition Manager
 * Backed by Supabase (Postgres + Auth). See supabase/schema.sql for the
 * data model and assets/js/config.js for connection settings.
 */

/* ---------------- Config / client ---------------- */
const CODES = ["Rugby League","Rugby 7s","Touch Footy","Volleyball","Basketball","Soccer","Netball"];
const CATEGORIES = ["Men","Women"];
const ELECTORATES = ["Moresby North-East","Moresby North-West","Moresby South"];
const POSITIONS_HINT = "e.g. Winger, Centre, Forward";
const MAX_PLAYERS = 25;

const TABS = [
  {id:"register",  label:"Register Team"},
  {id:"fixtures",  label:"Fixtures"},
  {id:"standings", label:"Standings"},
  {id:"cup",       label:"Governor's Cup"},
  {id:"directory", label:"Admin Directory"},
];

const cfg = window.NCD_CONFIG || {};
const CONFIGURED = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("YOUR-PROJECT");
const sb = (window.supabase && CONFIGURED)
  ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
  : null;

/* ---------------- State ---------------- */
let state = {
  tab: "register",
  session: null,
  teams: [],          // admin-only (directory + fixture generation source)
  fixtures: [],        // public
  loading: true,
  formPlayers: [],
  detailTeamId: null,
  fixturesPool: null,
  standingsPool: null,
  dirFilters: { code:"", category:"", electorate:"", status:"" },
  loginOpen: false,
  loginMode: "signin",   // "signin" | "forgot"
  loginError: "",
  loginNotice: "",
  resetPasswordOpen: false,
  resetPasswordError: ""
};

function poolKeyOf(t){ return `${t.sporting_code}||${t.category}||${t.electorate}`; }
function poolLabel(key){ const [c,cat,e] = key.split("||"); return `${c} · ${cat} · ${e}`; }

function showToast(msg){
  const root = document.getElementById("toast-root");
  root.innerHTML = `<div class="toast">${escapeHtml(msg)}</div>`;
  setTimeout(()=>{ if(root.innerHTML.includes(escapeHtml(msg))) root.innerHTML=""; }, 3200);
}

function isAdmin(){ return !!state.session; }

/* ---------------- Data loading ---------------- */
async function loadFixtures(){
  if(!sb) return;
  try{
    const { data, error } = await sb.from("fixtures").select("*").order("round", {ascending:true});
    if(error){ showToast("Could not load fixtures: " + error.message); return; }
    state.fixtures = data || [];
  }catch(e){ showToast("Could not load fixtures — network error."); }
}

async function loadTeams(){
  if(!sb || !isAdmin()){ state.teams = []; return; }
  try{
    const { data, error } = await sb.from("teams").select("*").order("created_at", {ascending:false});
    if(error){ showToast("Could not load teams: " + error.message); return; }
    state.teams = data || [];
  }catch(e){ showToast("Could not load teams — network error."); }
}

async function loadAll(){
  state.loading = true; render();
  if(!sb){ state.loading = false; render(); return; }
  try{
    const { data: { session } } = await sb.auth.getSession();
    state.session = session;
    await Promise.all([loadFixtures(), loadTeams()]);
  }catch(e){
    showToast("Could not reach Supabase — check SUPABASE_URL/SUPABASE_ANON_KEY in config.js and your connection.");
  }
  state.loading = false;
  render();
}

/* ---------------- Root render ---------------- */
function renderTabsBar(){
  const nav = document.getElementById("tabs");
  nav.innerHTML = TABS.map(t=>`<button class="${state.tab===t.id?'active':''}" onclick="setTab('${t.id}')">${t.label}</button>`).join("");
}
function setTab(id){ state.tab = id; state.detailTeamId=null; render(); }
window.setTab = setTab;

function renderAuthBar(){
  const el = document.getElementById("authbar");
  if(!sb){
    el.innerHTML = `<span class="pill">Not connected to Supabase</span>`;
    return;
  }
  if(isAdmin()){
    el.innerHTML = `<span class="pill">${escapeHtml(state.session.user.email)}</span><button onclick="doLogout()">Log out</button>`;
  } else {
    el.innerHTML = `<button onclick="openLogin()">Admin Login</button>`;
  }
}

function render(){
  // The login modal is appended straight to <body> (so it can float above
  // everything, including while #app is showing a loading state), which
  // means it survives across #app.innerHTML replacements below and must be
  // removed explicitly here every render pass — otherwise a closed/replaced
  // modal instance is left sitting in the DOM, visually stuck open forever
  // even once state.session is actually set.
  const existingOverlay = document.getElementById("loginOverlay");
  if(existingOverlay) existingOverlay.remove();
  if(state.loginOpen){
    document.body.insertAdjacentHTML("beforeend", renderLoginModal());
    // Attached here, not in attachHandlers() below: these modals live
    // outside #app, and attachHandlers() only runs past the !CONFIGURED /
    // state.loading early-returns a few lines down - a PASSWORD_RECOVERY
    // event firing during that initial window would otherwise insert a
    // dead form with no submit listener.
    const lf = document.getElementById("loginForm");
    if(lf) lf.addEventListener("submit", handleLoginSubmit);
    const ff = document.getElementById("forgotForm");
    if(ff) ff.addEventListener("submit", handleForgotSubmit);
  }

  const existingResetOverlay = document.getElementById("resetPasswordOverlay");
  if(existingResetOverlay) existingResetOverlay.remove();
  if(state.resetPasswordOpen){
    document.body.insertAdjacentHTML("beforeend", renderResetPasswordModal());
    const rpf = document.getElementById("resetPasswordForm");
    if(rpf) rpf.addEventListener("submit", handleResetPasswordSubmit);
  }

  if(!CONFIGURED){
    document.getElementById("app").innerHTML = `<div class="panel"><h2>Not connected yet</h2>
      <p class="desc">This app needs a Supabase project. Open <span class="mono">assets/js/config.js</span> and set
      <span class="mono">SUPABASE_URL</span> and <span class="mono">SUPABASE_ANON_KEY</span> from your Supabase project's
      API settings, after running <span class="mono">supabase/schema.sql</span> in the SQL Editor. See the README for
      full setup steps.</p></div>`;
    document.getElementById("tabs").innerHTML = "";
    document.getElementById("authbar").innerHTML = "";
    return;
  }
  renderTabsBar();
  renderAuthBar();
  const app = document.getElementById("app");
  if(state.loading){ app.innerHTML = `<div class="empty">Loading competition data…</div>`; return; }
  if(state.tab==="register")       app.innerHTML = renderRegister();
  else if(state.tab==="directory") app.innerHTML = renderDirectory();
  else if(state.tab==="fixtures")  app.innerHTML = renderFixtures();
  else if(state.tab==="standings") app.innerHTML = renderStandings();
  else if(state.tab==="cup")       app.innerHTML = renderCup();
  attachHandlers();
}

/* ================= AUTH ================= */
function openLogin(){
  state.loginOpen = true;
  state.loginMode = "signin";
  state.loginError = "";
  state.loginNotice = "";
  render();
}
window.openLogin = openLogin;
function closeLogin(){ state.loginOpen = false; render(); }
window.closeLogin = closeLogin;

function showForgotPassword(ev){
  if(ev) ev.preventDefault();
  state.loginMode = "forgot";
  state.loginError = "";
  state.loginNotice = "";
  render();
}
window.showForgotPassword = showForgotPassword;

function showSignIn(ev){
  if(ev) ev.preventDefault();
  state.loginMode = "signin";
  state.loginError = "";
  state.loginNotice = "";
  render();
}
window.showSignIn = showSignIn;

function renderLoginModal(){
  const body = state.loginMode === "forgot" ? `
      <h3>Reset Password</h3>
      <p class="desc">Enter your admin email and we'll send a password reset link.</p>
      <form id="forgotForm">
        <div class="field"><label>Email</label><input type="email" name="email" required></div>
        ${state.loginError ? `<p class="desc" style="color:var(--ember);">${escapeHtml(state.loginError)}</p>` : ""}
        ${state.loginNotice ? `<p class="desc" style="color:var(--pitch);">${escapeHtml(state.loginNotice)}</p>` : ""}
        <button type="submit" class="btn">Send Reset Link</button>
        <p style="margin-top:12px;"><a href="#" onclick="showSignIn(event)" style="font-size:12.5px;color:var(--ash);">Back to sign in</a></p>
      </form>` : `
      <h3>Admin Login</h3>
      <p class="desc">For NCD Games organizing committee / sports office staff only.</p>
      <form id="loginForm">
        <div class="field"><label>Email</label><input type="email" name="email" required></div>
        <div class="field"><label>Password</label><input type="password" name="password" required></div>
        ${state.loginError ? `<p class="desc" style="color:var(--ember);">${escapeHtml(state.loginError)}</p>` : ""}
        <button type="submit" class="btn">Sign In</button>
        <p style="margin-top:12px;"><a href="#" onclick="showForgotPassword(event)" style="font-size:12.5px;color:var(--ash);">Forgot password?</a></p>
      </form>`;
  return `
  <div class="modal-overlay" id="loginOverlay" onclick="if(event.target===this) closeLogin()">
    <div class="modal login-box">
      <button class="close" onclick="closeLogin()">✕</button>
      ${body}
    </div>
  </div>`;
}
async function handleLoginSubmit(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const email = fd.get("email"), password = fd.get("password");
  const btn = ev.target.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "Signing in…";
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  btn.disabled = false; btn.textContent = "Sign In";
  if(error){ state.loginError = error.message; render(); return; }
  state.session = data.session;
  state.loginOpen = false;
  showToast("Signed in.");
  await loadTeams();
  render();
}
async function handleForgotSubmit(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const email = fd.get("email");
  const btn = ev.target.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "Sending…";
  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
  btn.disabled = false; btn.textContent = "Send Reset Link";
  if(error){ state.loginError = error.message; state.loginNotice = ""; render(); return; }
  state.loginError = "";
  state.loginNotice = "If that email has an admin account, a reset link is on its way — check your inbox.";
  render();
}
async function doLogout(){
  await sb.auth.signOut();
  state.session = null;
  state.teams = [];
  showToast("Signed out.");
  render();
}
window.doLogout = doLogout;

// Shown automatically when the user lands back on the site from a password
// reset email link — Supabase fires a PASSWORD_RECOVERY auth event (see the
// onAuthStateChange listener near the bottom of this file), not something
// triggered by a button click here.
function renderResetPasswordModal(){
  return `
  <div class="modal-overlay" id="resetPasswordOverlay">
    <div class="modal login-box">
      <button class="close" onclick="closeResetPassword()">✕</button>
      <h3>Set a New Password</h3>
      <p class="desc">You followed a password reset link. Choose a new admin password below.</p>
      <form id="resetPasswordForm">
        <div class="field"><label>New Password</label><input type="password" name="password" minlength="6" required></div>
        <div class="field"><label>Confirm Password</label><input type="password" name="confirm" minlength="6" required></div>
        ${state.resetPasswordError ? `<p class="desc" style="color:var(--ember);">${escapeHtml(state.resetPasswordError)}</p>` : ""}
        <button type="submit" class="btn">Set Password</button>
      </form>
    </div>
  </div>`;
}
async function handleResetPasswordSubmit(ev){
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const password = fd.get("password"), confirm = fd.get("confirm");
  if(password !== confirm){ state.resetPasswordError = "Passwords don't match."; render(); return; }
  if(password.length < 6){ state.resetPasswordError = "Password must be at least 6 characters."; render(); return; }
  const btn = ev.target.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "Saving…";
  const { error } = await sb.auth.updateUser({ password });
  btn.disabled = false; btn.textContent = "Set Password";
  if(error){ state.resetPasswordError = error.message; render(); return; }
  state.resetPasswordOpen = false;
  state.resetPasswordError = "";
  showToast("Password updated — you're signed in.");
  await loadTeams();
  render();
}
async function closeResetPassword(){
  state.resetPasswordOpen = false;
  await sb.auth.signOut();
  state.session = null;
  render();
}
window.closeResetPassword = closeResetPassword;

/* ================= REGISTER ================= */
function renderRegister(){
  return `
  <div class="panel">
    <h2>Team Registration</h2>
    <p class="desc">One form per team. Submit a separate form for the Men's and Women's team in the same code. Registration fee K500 covers 1 male + 1 female team per code, paid at the NCDC Sports Office, City Hall.</p>

    <form id="regForm">
      <fieldset>
        <legend>A. Team Information</legend>
        <div class="field">
          <label>Sporting Code</label>
          <div class="choicerow">${CODES.map(c=>`<label class="chip"><input type="radio" name="sportingCode" value="${c}" required>${c}</label>`).join("")}</div>
        </div>
        <div class="field">
          <label>Category</label>
          <div class="choicerow">${CATEGORIES.map(c=>`<label class="chip"><input type="radio" name="category" value="${c}" required>${c}</label>`).join("")}</div>
        </div>
        <div class="grid2">
          <div class="field"><label>Electorate</label>
            <select name="electorate" required><option value="">Select…</option>${ELECTORATES.map(e=>`<option value="${e}">${e}</option>`).join("")}</select>
          </div>
          <div class="field"><label>Community / Ward / Settlement</label><input type="text" name="community" required></div>
        </div>
        <div class="grid2">
          <div class="field"><label>Club Name</label><input type="text" name="clubName" required></div>
          <div class="field"><label>Team Colors</label><input type="text" name="teamColors"></div>
        </div>
        <div class="field"><label>Team Motto / Slogan (optional)</label><input type="text" name="motto"></div>
      </fieldset>

      <fieldset>
        <legend>B. Contact Person (Team Manager)</legend>
        <div class="grid2">
          <div class="field"><label>Given Name</label><input type="text" name="mgrGiven" required></div>
          <div class="field"><label>Surname</label><input type="text" name="mgrSurname" required></div>
        </div>
        <div class="field"><label>Gender</label>
          <div class="choicerow">
            <label class="chip"><input type="radio" name="mgrGender" value="Male" required>Male</label>
            <label class="chip"><input type="radio" name="mgrGender" value="Female">Female</label>
          </div>
        </div>
        <div class="grid2">
          <div class="field"><label>Phone Number</label><input type="tel" name="mgrPhone" required></div>
          <div class="field"><label>Email Address</label><input type="email" name="mgrEmail"></div>
        </div>
        <div class="field"><label>Postal / Residential Address</label><input type="text" name="mgrAddress"></div>
        <div class="field"><label>Occupation</label><input type="text" name="mgrOccupation"></div>
      </fieldset>

      <fieldset>
        <legend>C. Captain Details</legend>
        <div class="grid2">
          <div class="field"><label>Given Name</label><input type="text" name="capGiven" required></div>
          <div class="field"><label>Surname</label><input type="text" name="capSurname" required></div>
        </div>
        <div class="grid2">
          <div class="field"><label>Phone Number</label><input type="tel" name="capPhone" required></div>
          <div class="field"><label>Email Address</label><input type="email" name="capEmail"></div>
        </div>
      </fieldset>

      <fieldset>
        <legend>D. Player Summary Sheet (max ${MAX_PLAYERS})</legend>
        <div id="playerRows">${renderPlayerRows()}</div>
        <button type="button" class="btn secondary small" onclick="addPlayerRow()">+ Add player</button>
        <p class="desc" style="margin-top:10px;">Total registered: <span id="playerCount">${state.formPlayers.length}</span></p>
      </fieldset>

      <fieldset>
        <legend>E. Officials &amp; Support Staff</legend>
        ${["Coach","Assistant Coach","Trainer","Team Doctor"].map(role=>`
          <div class="grid2">
            <div class="field"><label>${role} — Name</label><input type="text" name="off_${role.replace(/\s/g,'')}_name"></div>
            <div class="field"><label>${role} — Phone</label><input type="tel" name="off_${role.replace(/\s/g,'')}_phone"></div>
          </div>`).join("")}
      </fieldset>

      <button type="submit" class="btn">Submit Registration</button>
    </form>
  </div>`;
}

function renderPlayerRows(){
  if(state.formPlayers.length===0){
    return `<div class="empty">No players added yet.</div>`;
  }
  return state.formPlayers.map((p,i)=>`
    <div class="playerrow">
      <input type="text" placeholder="Full name" value="${escapeAttr(p.name)}" oninput="updatePlayer(${i},'name',this.value)">
      <input type="date" value="${escapeAttr(p.dob)}" oninput="updatePlayer(${i},'dob',this.value)">
      <input type="tel" placeholder="Contact #" value="${escapeAttr(p.contact)}" oninput="updatePlayer(${i},'contact',this.value)">
      <input type="text" placeholder="${POSITIONS_HINT}" value="${escapeAttr(p.position)}" oninput="updatePlayer(${i},'position',this.value)">
      <button type="button" class="btn danger small" onclick="removePlayerRow(${i})">Remove</button>
    </div>`).join("");
}
function addPlayerRow(){
  if(state.formPlayers.length>=MAX_PLAYERS){ showToast(`Maximum ${MAX_PLAYERS} players.`); return; }
  state.formPlayers.push({name:"",dob:"",contact:"",position:""});
  document.getElementById("playerRows").innerHTML = renderPlayerRows();
  document.getElementById("playerCount").textContent = state.formPlayers.length;
}
function updatePlayer(i,field,val){ state.formPlayers[i][field]=val; }
function removePlayerRow(i){
  state.formPlayers.splice(i,1);
  document.getElementById("playerRows").innerHTML = renderPlayerRows();
  document.getElementById("playerCount").textContent = state.formPlayers.length;
}
window.addPlayerRow = addPlayerRow;
window.updatePlayer = updatePlayer;
window.removePlayerRow = removePlayerRow;

async function handleRegisterSubmit(ev){
  ev.preventDefault();
  const f = ev.target;
  const fd = new FormData(f);
  const get = (k)=> (fd.get(k)||"").toString().trim();

  const sportingCode = get("sportingCode"), category = get("category"), electorate = get("electorate");
  if(!sportingCode || !category || !electorate){
    showToast("Please select sporting code, category and electorate."); return;
  }

  const teamRow = {
    // Generated client-side rather than left to the DB default: the public
    // registration role can INSERT into teams but deliberately has no
    // SELECT policy on it (privacy), so asking Postgres to hand the row
    // back via RETURNING would itself get blocked by RLS. Knowing the id
    // up front avoids needing it back at all.
    id: crypto.randomUUID(),
    club_name: get("clubName"),
    sporting_code: sportingCode,
    category: category,
    electorate: electorate,
    community: get("community"),
    team_colors: get("teamColors"),
    motto: get("motto") || null,
    manager_given_name: get("mgrGiven"),
    manager_surname: get("mgrSurname"),
    manager_gender: get("mgrGender") || null,
    manager_phone: get("mgrPhone"),
    manager_email: get("mgrEmail") || null,
    manager_address: get("mgrAddress") || null,
    manager_occupation: get("mgrOccupation") || null,
    captain_given_name: get("capGiven"),
    captain_surname: get("capSurname"),
    captain_phone: get("capPhone"),
    captain_email: get("capEmail") || null,
    coach_name: get("off_Coach_name") || null,
    coach_phone: get("off_Coach_phone") || null,
    assistant_coach_name: get("off_AssistantCoach_name") || null,
    assistant_coach_phone: get("off_AssistantCoach_phone") || null,
    trainer_name: get("off_Trainer_name") || null,
    trainer_phone: get("off_Trainer_phone") || null,
    doctor_name: get("off_TeamDoctor_name") || null,
    doctor_phone: get("off_TeamDoctor_phone") || null
  };

  const players = state.formPlayers
    .filter(p=>p.name && p.name.trim()!=="")
    .map(p=>({ full_name:p.name.trim(), dob:p.dob||null, contact:p.contact||null, position:p.position||null }));

  const btn = f.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "Submitting…";

  const { error: teamErr } = await sb.from("teams").insert(teamRow);
  if(teamErr){
    btn.disabled = false; btn.textContent = "Submit Registration";
    showToast("Could not submit registration: " + teamErr.message);
    return;
  }

  if(players.length){
    const rows = players.map(p=>({ ...p, team_id: teamRow.id }));
    const { error: playersErr } = await sb.from("players").insert(rows);
    if(playersErr){
      showToast("Team saved, but players failed to save: " + playersErr.message);
    }
  }

  btn.disabled = false; btn.textContent = "Submit Registration";
  state.formPlayers = [];
  showToast(`Team "${teamRow.club_name}" registered — pending approval.`);
  f.reset();
  render();
}

/* ================= DIRECTORY (admin) ================= */
function renderDirectory(){
  if(!isAdmin()){
    return `<div class="panel">
      <h2>Admin Directory</h2>
      <div class="empty">Admin login required to view registrations.<br><br>
      <button class="btn small" onclick="openLogin()">Admin Login</button></div>
    </div>`;
  }

  const f = state.dirFilters;
  let list = state.teams.filter(t=>
    (!f.code || t.sporting_code===f.code) &&
    (!f.category || t.category===f.category) &&
    (!f.electorate || t.electorate===f.electorate) &&
    (!f.status || t.approval_status===f.status)
  );

  return `
  <div class="panel">
    <h2>Team Directory</h2>
    <p class="desc">Review registrations, confirm payment, approve teams and assign pool/zone + team ID.</p>
    <div class="filters">
      <select onchange="setDirFilter('code',this.value)"><option value="">All codes</option>${CODES.map(c=>`<option ${f.code===c?'selected':''}>${c}</option>`).join("")}</select>
      <select onchange="setDirFilter('category',this.value)"><option value="">All categories</option>${CATEGORIES.map(c=>`<option ${f.category===c?'selected':''}>${c}</option>`).join("")}</select>
      <select onchange="setDirFilter('electorate',this.value)"><option value="">All electorates</option>${ELECTORATES.map(c=>`<option ${f.electorate===c?'selected':''}>${c}</option>`).join("")}</select>
      <select onchange="setDirFilter('status',this.value)"><option value="">All statuses</option>${["Pending","Approved","Rejected"].map(c=>`<option ${f.status===c?'selected':''}>${c}</option>`).join("")}</select>
    </div>
    ${list.length===0 ? `<div class="empty">No teams match these filters.</div>` : `
    <table class="data">
      <thead><tr><th>Club</th><th>Code</th><th>Cat.</th><th>Electorate</th><th>Payment</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${list.map(t=>`
          <tr>
            <td><b>${escapeHtml(t.club_name)}</b><br><span class="mono" style="color:var(--ash);font-size:11px;">${escapeHtml(t.community||"")}</span></td>
            <td>${escapeHtml(t.sporting_code)}</td>
            <td>${escapeHtml(t.category)}</td>
            <td>${escapeHtml(t.electorate)}</td>
            <td>${t.payment_paid ? '✓ Paid' : '—'}</td>
            <td><span class="status-tag status-${t.approval_status}">${t.approval_status}</span></td>
            <td><button class="btn secondary small" onclick="openDetail('${t.id}')">View</button></td>
          </tr>`).join("")}
      </tbody>
    </table>`}
  </div>
  ${state.detailTeamId ? renderDetailModal() : ""}
  `;
}
function setDirFilter(k,v){ state.dirFilters[k]=v; render(); }
window.setDirFilter = setDirFilter;
function openDetail(id){ state.detailTeamId=id; render(); }
window.openDetail = openDetail;
function closeDetail(){ state.detailTeamId=null; render(); }
window.closeDetail = closeDetail;

function renderDetailModal(){
  const t = state.teams.find(x=>x.id===state.detailTeamId);
  if(!t) return "";
  const players = t._players || null; // lazy-loaded below
  return `
  <div class="modal-overlay" onclick="if(event.target===this) closeDetail()">
    <div class="modal">
      <button class="close" onclick="closeDetail()">✕</button>
      <h3>${escapeHtml(t.club_name)}</h3>
      <div class="kv"><b>Code</b><span>${escapeHtml(t.sporting_code)}</span></div>
      <div class="kv"><b>Category</b><span>${escapeHtml(t.category)}</span></div>
      <div class="kv"><b>Electorate</b><span>${escapeHtml(t.electorate)}</span></div>
      <div class="kv"><b>Community</b><span>${escapeHtml(t.community||"—")}</span></div>
      <div class="kv"><b>Colors</b><span>${escapeHtml(t.team_colors||"—")}</span></div>
      <div class="kv"><b>Motto</b><span>${escapeHtml(t.motto||"—")}</span></div>

      <div class="section-title">Manager</div>
      <div class="kv"><b>Name</b><span>${escapeHtml(t.manager_given_name)} ${escapeHtml(t.manager_surname)}</span></div>
      <div class="kv"><b>Phone</b><span>${escapeHtml(t.manager_phone)}</span></div>
      <div class="kv"><b>Email</b><span>${escapeHtml(t.manager_email||"—")}</span></div>

      <div class="section-title">Captain</div>
      <div class="kv"><b>Name</b><span>${escapeHtml(t.captain_given_name)} ${escapeHtml(t.captain_surname)}</span></div>
      <div class="kv"><b>Phone</b><span>${escapeHtml(t.captain_phone)}</span></div>

      <div class="section-title">Players</div>
      <div id="detailPlayers">${players===null ? `<div class="empty">Loading…</div>` : renderPlayersTable(players)}</div>

      <div class="section-title">Officials</div>
      <div class="kv"><b>Coach</b><span>${escapeHtml(t.coach_name||"—")} ${escapeHtml(t.coach_phone||"")}</span></div>
      <div class="kv"><b>Asst. Coach</b><span>${escapeHtml(t.assistant_coach_name||"—")} ${escapeHtml(t.assistant_coach_phone||"")}</span></div>
      <div class="kv"><b>Trainer</b><span>${escapeHtml(t.trainer_name||"—")} ${escapeHtml(t.trainer_phone||"")}</span></div>
      <div class="kv"><b>Doctor</b><span>${escapeHtml(t.doctor_name||"—")} ${escapeHtml(t.doctor_phone||"")}</span></div>

      <div class="section-title">Office Use — Approval</div>
      <div class="grid2">
        <div class="field"><label>Approval Status</label>
          <select id="detStatus">${["Pending","Approved","Rejected"].map(s=>`<option ${t.approval_status===s?'selected':''}>${s}</option>`).join("")}</select>
        </div>
        <div class="field"><label>Team ID Number</label><input type="text" id="detTeamId" value="${escapeAttr(t.team_id_number||'')}"></div>
      </div>
      <div class="field"><label>Pool / Zone</label><input type="text" id="detPool" value="${escapeAttr(t.pool_zone||'')}" placeholder="Auto: ${poolLabel(poolKeyOf(t))}"></div>
      <div class="field"><label>Comments</label><textarea id="detComments" rows="2">${escapeHtml(t.approval_comments||"")}</textarea></div>

      <div class="section-title">Office Use — Payment</div>
      <div class="note">Approving a team auto-generates its invoice number below; ticking "Payment Received" auto-generates the receipt number. Both are printable — save as PDF or hand over a physical printout, no email needed.</div>
      <div class="grid2">
        <div class="field"><label>Payment Received</label>
          <select id="detPaid" onchange="updatePaymentRequiredHint()"><option value="no" ${!t.payment_paid?'selected':''}>No</option><option value="yes" ${t.payment_paid?'selected':''}>Yes</option></select>
        </div>
        <div class="field"><label>Amount (K)</label><input type="text" id="detAmount" value="${escapeAttr(t.payment_amount ?? '')}"></div>
      </div>
      <div class="grid2">
        <div class="field"><label id="detProcessedByLabel">Processed By</label><input type="text" id="detProcessedBy" value="${escapeAttr(t.payment_processed_by||'')}"></div>
        <div class="field"><label id="detDateReceivedLabel">Date Received</label><input type="date" id="detDateReceived" value="${escapeAttr(t.payment_date_received||'')}"></div>
      </div>
      <div class="grid2">
        <div class="field"><label>Invoice Number</label><input type="text" id="detInvoice" value="${escapeAttr(t.invoice_number||'')}" placeholder="Auto on approval" readonly></div>
        <div class="field"><label>Receipt Number</label><input type="text" id="detReceipt" value="${escapeAttr(t.receipt_number||'')}" placeholder="Auto on payment" readonly></div>
      </div>
      <div class="filters" style="margin-bottom:0;">
        ${t.invoice_number ? `<button class="btn secondary small" onclick="printInvoice('${t.id}')">Print Invoice</button>` : ""}
        ${t.receipt_number ? `<button class="btn secondary small" onclick="printReceipt('${t.id}')">Print Receipt</button>` : ""}
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:16px;">
        <button class="btn" onclick="saveDetail('${t.id}')">Save Changes</button>
        <button class="btn danger small" onclick="deleteTeam('${t.id}')">Delete Team</button>
      </div>
    </div>
  </div>`;
}
function renderPlayersTable(players){
  if(!players.length) return `<div class="empty">None listed</div>`;
  return `<table class="data"><thead><tr><th>Name</th><th>DoB</th><th>Contact</th><th>Position</th></tr></thead><tbody>
    ${players.map(p=>`<tr><td>${escapeHtml(p.full_name)}</td><td>${escapeHtml(p.dob||"—")}</td><td>${escapeHtml(p.contact||"—")}</td><td>${escapeHtml(p.position||"—")}</td></tr>`).join("")}
  </tbody></table>`;
}
async function fetchDetailPlayers(teamId){
  const { data, error } = await sb.from("players").select("*").eq("team_id", teamId).order("full_name");
  const t = state.teams.find(x=>x.id===teamId);
  if(t) t._players = error ? [] : data;
  const el = document.getElementById("detailPlayers");
  if(el) el.innerHTML = renderPlayersTable(t ? (t._players||[]) : []);
}

async function saveDetail(id){
  const t = state.teams.find(x=>x.id===id);
  if(!t) return;

  const newStatus = document.getElementById("detStatus").value;
  const newPaid = document.getElementById("detPaid").value==="yes";
  const processedBy = document.getElementById("detProcessedBy").value.trim();
  const dateReceived = document.getElementById("detDateReceived").value;

  if(newPaid && (!processedBy || !dateReceived)){
    showToast("Processed By and Date Received are required to mark payment as received.");
    return;
  }

  const patch = {
    payment_paid: newPaid,
    payment_amount: Number(document.getElementById("detAmount").value) || 0,
    payment_processed_by: processedBy || null,
    payment_date_received: dateReceived || null,
    invoice_number: document.getElementById("detInvoice").value || null,
    receipt_number: document.getElementById("detReceipt").value || null,
    approval_status: newStatus,
    team_id_number: document.getElementById("detTeamId").value || null,
    pool_zone: document.getElementById("detPool").value || null,
    approval_comments: document.getElementById("detComments").value || null
  };

  if(newStatus === "Approved" && !patch.invoice_number){
    const { data: invNum, error: invErr } = await sb.rpc("next_invoice_number");
    if(invErr){ showToast("Could not generate invoice number: " + invErr.message); }
    else { patch.invoice_number = invNum; patch.invoice_issued_at = new Date().toISOString(); }
  }
  if(newPaid && !patch.receipt_number){
    const { data: rcptNum, error: rcptErr } = await sb.rpc("next_receipt_number");
    if(rcptErr){ showToast("Could not generate receipt number: " + rcptErr.message); }
    else { patch.receipt_number = rcptNum; patch.receipt_issued_at = new Date().toISOString(); }
  }

  const { error } = await sb.from("teams").update(patch).eq("id", id);
  if(error){ showToast("Save failed: " + error.message); return; }
  Object.assign(t, patch);
  showToast("Team updated.");
  closeDetail();
}
window.saveDetail = saveDetail;

async function deleteTeam(id){
  const t = state.teams.find(x=>x.id===id);
  if(!t) return;
  if(!confirm(`Delete "${t.club_name}" and all its players? This cannot be undone. Any fixtures already generated for this team will keep their scores/history but stop linking back to it.`)){
    return;
  }
  const { error } = await sb.from("teams").delete().eq("id", id);
  if(error){ showToast("Delete failed: " + error.message); return; }
  state.teams = state.teams.filter(x=>x.id!==id);
  showToast(`Team "${t.club_name}" deleted.`);
  closeDetail();
}
window.deleteTeam = deleteTeam;

/* ---- Printable invoice / receipt (browser print → Save as PDF) ---- */
function openPrintDocument(title, bodyHtml){
  const win = window.open("", "_blank");
  if(!win){ showToast("Please allow pop-ups to print this document."); return; }
  win.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>
    body{font-family:Arial,Helvetica,sans-serif;color:#16140F;padding:40px;max-width:680px;margin:0 auto;}
    .letterhead{display:flex;align-items:center;gap:16px;border-bottom:3px solid #F5B700;padding-bottom:16px;margin-bottom:24px;}
    .letterhead img{height:64px;}
    .letterhead h1{font-size:20px;margin:0;}
    .letterhead p{margin:2px 0 0 0;font-size:12px;color:#555;}
    table{width:100%;border-collapse:collapse;margin:20px 0;}
    td,th{padding:8px;border:1px solid #ccc;text-align:left;font-size:13px;vertical-align:top;}
    th{width:160px;background:#F5F0E4;}
    .doc-title{font-size:22px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;margin:20px 0 4px;}
    .doc-number{font-family:monospace;color:#555;margin-bottom:20px;}
    .amount{font-size:26px;font-weight:bold;color:#1F6F4A;}
    .footer{margin-top:40px;font-size:11px;color:#777;border-top:1px solid #ccc;padding-top:12px;}
    .no-print button{padding:10px 18px;font-size:14px;cursor:pointer;}
    @media print{ .no-print{display:none;} }
  </style></head><body>${bodyHtml}
  <div class="no-print" style="margin-top:24px;"><button onclick="window.print()">Print / Save as PDF</button></div>
  </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(()=>{ try{ win.print(); }catch(e){} }, 300);
}

function printInvoice(teamId){
  const t = state.teams.find(x=>x.id===teamId);
  if(!t || !t.invoice_number) return;
  const logoUrl = new URL("assets/img/logo.png", window.location.href).href;
  const body = `
    <div class="letterhead">
      <img src="${logoUrl}">
      <div><h1>NCD Games 2026</h1><p>NCDC Sports Office &middot; Level 1, City Hall &middot; Port Moresby</p></div>
    </div>
    <div class="doc-title">Invoice</div>
    <div class="doc-number">${escapeHtml(t.invoice_number)} &middot; issued ${t.invoice_issued_at ? new Date(t.invoice_issued_at).toLocaleDateString('en-GB') : '—'}</div>
    <table>
      <tr><th>Club</th><td>${escapeHtml(t.club_name)}</td></tr>
      <tr><th>Sporting Code</th><td>${escapeHtml(t.sporting_code)} — ${escapeHtml(t.category)}</td></tr>
      <tr><th>Electorate</th><td>${escapeHtml(t.electorate)}</td></tr>
      <tr><th>Team Manager</th><td>${escapeHtml(t.manager_given_name)} ${escapeHtml(t.manager_surname)} &middot; ${escapeHtml(t.manager_phone)}</td></tr>
    </table>
    <p>Amount due: <span class="amount">K${escapeHtml(t.payment_amount)}</span></p>
    <p>Please pay at the <b>NCDC Sports Office, Level 1, City Hall</b>, quoting invoice number <b>${escapeHtml(t.invoice_number)}</b>.</p>
    <div class="footer">NCD Games 2026 — One People, One City, One Future</div>`;
  openPrintDocument(`Invoice ${t.invoice_number}`, body);
}
window.printInvoice = printInvoice;

function printReceipt(teamId){
  const t = state.teams.find(x=>x.id===teamId);
  if(!t || !t.receipt_number) return;
  const logoUrl = new URL("assets/img/logo.png", window.location.href).href;
  const body = `
    <div class="letterhead">
      <img src="${logoUrl}">
      <div><h1>NCD Games 2026</h1><p>NCDC Sports Office &middot; Level 1, City Hall &middot; Port Moresby</p></div>
    </div>
    <div class="doc-title">Receipt</div>
    <div class="doc-number">${escapeHtml(t.receipt_number)} &middot; issued ${t.receipt_issued_at ? new Date(t.receipt_issued_at).toLocaleDateString('en-GB') : '—'}</div>
    <table>
      <tr><th>Club</th><td>${escapeHtml(t.club_name)}</td></tr>
      <tr><th>Sporting Code</th><td>${escapeHtml(t.sporting_code)} — ${escapeHtml(t.category)}</td></tr>
      <tr><th>Amount Paid</th><td>K${escapeHtml(t.payment_amount)}</td></tr>
      <tr><th>Date Received</th><td>${escapeHtml(t.payment_date_received||'—')}</td></tr>
      <tr><th>Processed By</th><td>${escapeHtml(t.payment_processed_by||'—')}</td></tr>
    </table>
    <p>This confirms the NCD Games 2026 registration fee has been received in full.</p>
    <div class="footer">NCD Games 2026 — One People, One City, One Future</div>`;
  openPrintDocument(`Receipt ${t.receipt_number}`, body);
}
window.printReceipt = printReceipt;

/* ================= FIXTURES ================= */
function getApprovedPools(){
  const map = {};
  state.teams.filter(t=>t.approval_status==="Approved").forEach(t=>{
    const k = poolKeyOf(t);
    if(!map[k]) map[k]=[];
    map[k].push(t);
  });
  return map;
}
// Pools derived from fixtures already generated (visible to public + admin).
function getFixturePools(){
  const map = {};
  state.fixtures.forEach(f=>{
    const k = `${f.sporting_code}||${f.category}||${f.electorate}`;
    if(!map[k]) map[k]=[];
    map[k].push(f);
  });
  return map;
}
function getMatchDays(){
  const days=[];
  let d = new Date(2026,8,10); // Sept 10 2026
  const end = new Date(2026,10,13); // Nov 13 2026
  while(d<=end){
    const wd = d.getDay();
    if(wd===4||wd===5) days.push(new Date(d));
    d.setDate(d.getDate()+1);
  }
  return days;
}
function fmtDate(d){
  if(typeof d === "string") d = new Date(d + "T00:00:00");
  return d.toLocaleDateString('en-GB',{weekday:'short', day:'numeric', month:'short', year:'numeric'});
}
function generateRoundRobin(ids){
  let arr = [...ids];
  if(arr.length%2!==0) arr.push(null);
  const n = arr.length;
  const rounds = [];
  for(let r=0;r<n-1;r++){
    const matches=[];
    for(let i=0;i<n/2;i++){
      const a=arr[i], b=arr[n-1-i];
      if(a!==null && b!==null) matches.push([a,b]);
    }
    rounds.push(matches);
    const fixed=arr[0]; const rest=arr.slice(1); rest.unshift(rest.pop()); arr=[fixed,...rest];
  }
  return rounds;
}

function renderFixtures(){
  const admin = isAdmin();
  const fixPools = getFixturePools();
  const approvedPools = admin ? getApprovedPools() : {};
  const poolKeys = admin
    ? Array.from(new Set([...Object.keys(fixPools), ...Object.keys(approvedPools)]))
    : Object.keys(fixPools);
  const sel = state.fixturesPool && poolKeys.includes(state.fixturesPool) ? state.fixturesPool : poolKeys[0] || null;

  let body = "";
  if(poolKeys.length===0){
    body = `<div class="empty">${admin ? "No approved teams yet. Approve teams in the Admin Directory first, then generate fixtures here." : "No fixtures published yet."}</div>`;
  } else {
    const approvedTeams = approvedPools[sel] || [];
    const existing = state.fixtures.filter(f=>`${f.sporting_code}||${f.category}||${f.electorate}`===sel);
    let controls = "";
    if(admin){
      controls = approvedTeams.length<2
        ? `<span class="desc" style="align-self:center;">Need at least 2 approved teams in this pool to generate.</span>`
        : existing.length>0
          ? `<button class="btn danger small" onclick="regenerateFixtures('${sel}')">Regenerate Schedule</button>`
          : `<button class="btn small" onclick="generateFixturesForPool('${sel}')">Generate Schedule</button>`;
    }
    body = `
      <div class="filters">
        <select onchange="setFixturesPool(this.value)">
          ${poolKeys.map(k=>`<option value="${k}" ${k===sel?'selected':''}>${poolLabel(k)}</option>`).join("")}
        </select>
        ${controls}
      </div>
      ${renderFixtureList(sel)}
    `;
  }

  return `<div class="panel">
    <h2>Fixtures</h2>
    <p class="desc">Round-robin schedule generated per pool (code · category · electorate) across the Thursday/Friday competition window.</p>
    ${body}
  </div>`;
}
function setFixturesPool(k){ state.fixturesPool=k; render(); }
window.setFixturesPool = setFixturesPool;

function renderFixtureList(poolKey){
  const fx = state.fixtures.filter(f=>`${f.sporting_code}||${f.category}||${f.electorate}`===poolKey).sort((a,b)=> a.round-b.round);
  if(fx.length===0) return `<div class="empty">No fixtures generated yet for this pool.</div>`;
  const byRound = {};
  fx.forEach(f=>{ (byRound[f.round]=byRound[f.round]||[]).push(f); });
  const admin = isAdmin();
  return Object.keys(byRound).sort((a,b)=>a-b).map(r=>{
    const matches = byRound[r];
    return `<div style="margin-bottom:18px;">
      <div class="section-title">Round ${Number(r)+1} — ${fmtDate(matches[0].match_date)}</div>
      <table class="data">
        <thead><tr><th>Home</th><th>Score</th><th>Away</th><th>Score</th><th></th></tr></thead>
        <tbody>
        ${matches.map(f=>`
          <tr>
            <td>${escapeHtml(f.team_a_name)}</td>
            <td>${admin
              ? `<input type="number" min="0" style="width:60px;" value="${f.score_a ?? ''}" onchange="setScore('${f.id}','score_a',this.value)">`
              : (f.score_a ?? '—')}</td>
            <td>${escapeHtml(f.team_b_name)}</td>
            <td>${admin
              ? `<input type="number" min="0" style="width:60px;" value="${f.score_b ?? ''}" onchange="setScore('${f.id}','score_b',this.value)">`
              : (f.score_b ?? '—')}</td>
            <td>${f.played ? '<span class="status-tag status-Approved">Played</span>' : '<span class="status-tag status-Pending">Scheduled</span>'}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
  }).join("");
}

async function generateFixturesForPool(poolKey){
  const pools = getApprovedPools();
  const teams = pools[poolKey];
  if(!teams || teams.length<2){ showToast("Need at least 2 approved teams."); return; }
  const [sportingCode, category, electorate] = poolKey.split("||");
  const rounds = generateRoundRobin(teams.map(t=>t.id));
  const matchDays = getMatchDays();
  const newFixtures = [];
  rounds.forEach((matches, rIdx)=>{
    const date = matchDays[rIdx % matchDays.length];
    matches.forEach(([aId,bId])=>{
      const a = teams.find(t=>t.id===aId), b = teams.find(t=>t.id===bId);
      newFixtures.push({
        sporting_code: sportingCode, category, electorate,
        round: rIdx,
        match_date: date.toISOString().slice(0,10),
        team_a_id:aId, team_a_name:a.club_name,
        team_b_id:bId, team_b_name:b.club_name,
        score_a:null, score_b:null, played:false
      });
    });
  });
  const { error } = await sb.from("fixtures").insert(newFixtures);
  if(error){ showToast("Could not generate fixtures: " + error.message); return; }
  await loadFixtures();
  showToast(`Schedule generated: ${newFixtures.length} fixtures across ${rounds.length} rounds.`);
  render();
}
window.generateFixturesForPool = generateFixturesForPool;

async function regenerateFixtures(poolKey){
  if(!confirm("This will clear existing fixtures and scores for this pool. Continue?")) return;
  const [sportingCode, category, electorate] = poolKey.split("||");
  const { error } = await sb.from("fixtures").delete()
    .eq("sporting_code", sportingCode).eq("category", category).eq("electorate", electorate);
  if(error){ showToast("Could not clear old fixtures: " + error.message); return; }
  await generateFixturesForPool(poolKey);
}
window.regenerateFixtures = regenerateFixtures;

async function setScore(fxId, field, val){
  const f = state.fixtures.find(x=>x.id===fxId);
  if(!f) return;
  const num = val===""? null : Number(val);
  const other = field==="score_a" ? f.score_b : f.score_a;
  const played = (field==="score_a" ? num : f.score_a) !== null && (field==="score_b" ? num : f.score_b) !== null;
  const patch = { [field]: num, played };
  const { error } = await sb.from("fixtures").update(patch).eq("id", fxId);
  if(error){ showToast("Could not save score: " + error.message); return; }
  Object.assign(f, patch);
  showToast("Score saved.");
}
window.setScore = setScore;

/* ================= STANDINGS ================= */
function computeStandings(poolKey){
  const fx = state.fixtures.filter(f=>`${f.sporting_code}||${f.category}||${f.electorate}`===poolKey);
  const table = {};
  fx.forEach(f=>{
    if(!table[f.team_a_id]) table[f.team_a_id] = {id:f.team_a_id, name:f.team_a_name, played:0,won:0,drawn:0,lost:0,for:0,against:0,points:0};
    if(!table[f.team_b_id]) table[f.team_b_id] = {id:f.team_b_id, name:f.team_b_name, played:0,won:0,drawn:0,lost:0,for:0,against:0,points:0};
  });
  fx.filter(f=>f.played).forEach(f=>{
    const a = table[f.team_a_id], b = table[f.team_b_id];
    if(!a || !b) return;
    a.played++; b.played++;
    a.for += f.score_a; a.against += f.score_b;
    b.for += f.score_b; b.against += f.score_a;
    if(f.score_a > f.score_b){ a.won++; a.points+=3; b.lost++; }
    else if(f.score_a < f.score_b){ b.won++; b.points+=3; a.lost++; }
    else { a.drawn++; b.drawn++; a.points+=1; b.points+=1; }
  });
  return Object.values(table).sort((x,y)=> y.points-x.points || (y.for-y.against)-(x.for-x.against) || y.for-x.for);
}

function renderStandings(){
  const fixPools = getFixturePools();
  const poolKeys = Object.keys(fixPools);
  if(poolKeys.length===0) return `<div class="panel"><h2>Standings</h2><div class="empty">No fixtures published yet.</div></div>`;
  const sel = (state.standingsPool && poolKeys.includes(state.standingsPool)) ? state.standingsPool : poolKeys[0];
  const rows = computeStandings(sel);
  return `<div class="panel">
    <h2>Standings</h2>
    <p class="desc">Win = 3 pts, draw = 1 pt, loss = 0. Ranked by points, then goal/point difference.</p>
    <div class="filters">
      <select onchange="setStandingsPool(this.value)">${poolKeys.map(k=>`<option value="${k}" ${k===sel?'selected':''}>${poolLabel(k)}</option>`).join("")}</select>
    </div>
    <table class="data">
      <thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>F</th><th>A</th><th>Diff</th><th>Pts</th></tr></thead>
      <tbody>
        ${rows.map((r,i)=>`
          <tr>
            <td class="${i===0?'rank1':''}">${i+1}</td>
            <td>${escapeHtml(r.name)}</td>
            <td>${r.played}</td><td>${r.won}</td><td>${r.drawn}</td><td>${r.lost}</td>
            <td>${r.for}</td><td>${r.against}</td><td>${r.for-r.against}</td>
            <td><b>${r.points}</b></td>
          </tr>`).join("")}
      </tbody>
    </table>
  </div>`;
}
function setStandingsPool(k){ state.standingsPool=k; render(); }
window.setStandingsPool = setStandingsPool;

/* ================= GOVERNOR'S CUP ================= */
function renderCup(){
  const fixPools = getFixturePools();
  const poolKeys = Object.keys(fixPools);
  if(poolKeys.length===0) return `<div class="panel"><h2>Governor's Cup Qualifiers</h2><div class="empty">No fixtures published yet.</div></div>`;

  const cards = poolKeys.map(k=>{
    const rows = computeStandings(k).slice(0,4);
    return `<div class="pool-card">
      <h3>${poolLabel(k)}</h3>
      <div class="meta">Top 4 advance to the NCD Governor's Cup (15 Dec 2026 – 15 Jan 2027)</div>
      ${rows.length===0 ? `<div class="empty">No results recorded yet.</div>` :
        `<table class="data"><thead><tr><th>#</th><th>Team</th><th>Pts</th></tr></thead><tbody>
          ${rows.map((r,i)=>`<tr><td class="${i===0?'rank1':''}">${i+1}</td><td>${escapeHtml(r.name)}</td><td>${r.points}</td></tr>`).join("")}
        </tbody></table>`}
    </div>`;
  }).join("");

  return `<div class="panel">
    <h2>Governor's Cup Qualifiers</h2>
    <p class="desc">Current top 4 per pool based on standings so far. Final qualifiers are confirmed once each pool completes its round-robin.</p>
    ${cards}
  </div>`;
}

/* ---------------- Utilities ---------------- */
function escapeHtml(s){
  if(s===undefined || s===null) return "";
  return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function escapeAttr(s){ return escapeHtml(s); }

function attachHandlers(){
  const rf = document.getElementById("regForm");
  if(rf) rf.addEventListener("submit", handleRegisterSubmit);
  // loginForm/forgotForm/resetPasswordForm are attached in render() itself,
  // right where they're inserted — see the comment there for why.
  if(state.tab==="directory" && state.detailTeamId){
    const t = state.teams.find(x=>x.id===state.detailTeamId);
    if(t && t._players===undefined){ t._players = null; fetchDetailPlayers(t.id); }
    updatePaymentRequiredHint();
  }
}

// Processed By / Date Received are only mandatory once payment is marked
// as received — nothing to record for them before that. Reflects that in
// the labels live as the admin toggles the select, mirrored by the actual
// validation in saveDetail().
function updatePaymentRequiredHint(){
  const paidEl = document.getElementById("detPaid");
  if(!paidEl) return;
  const required = paidEl.value === "yes";
  const byLabel = document.getElementById("detProcessedByLabel");
  const dateLabel = document.getElementById("detDateReceivedLabel");
  if(byLabel) byLabel.textContent = required ? "Processed By *" : "Processed By";
  if(dateLabel) dateLabel.textContent = required ? "Date Received *" : "Date Received";
}
window.updatePaymentRequiredHint = updatePaymentRequiredHint;

/* ---------------- Init ---------------- */
if(sb){
  sb.auth.onAuthStateChange((event, session)=>{
    state.session = session;
    // Fired when the user lands back on the site from the link in a
    // password-reset email (Supabase parses the recovery token from the
    // URL automatically). Not triggered by anything in this app's own UI.
    if(event === "PASSWORD_RECOVERY"){
      state.resetPasswordOpen = true;
      state.loginOpen = false;
      render();
    }
  });
}
loadAll();
