/* Print Portal V3 Admin — new template/crop logic; same visual structure and Firebase schema. */
import {auth,db,storage,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,sendPasswordResetEmail,signOut,collection,doc,addDoc,setDoc,updateDoc,deleteDoc,getDoc,getDocs,query,where,orderBy,limit,onSnapshot,serverTimestamp,runTransaction,storageRef,uploadBytes,getDownloadURL,deleteObject} from "./firebase.js";
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const state={user:null,isAdmin:false,services:[],activations:[],users:[],templates:[],editingServiceId:null,editingTemplateId:null,activeChatUid:null,chatListeners:[],unreadChats:{},builtin:{},tplFile:null,tplPdf:null,tplSide:"front",tplPages:{front:1,back:1},tplCrop:null,tplCropStates:{front:null,back:null},tplTask:null,pdfCache:null};
const safe=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const toast=(m,t="success")=>{const d=document.createElement("div");d.className=`toast ${t}`;d.textContent=m;$("#adminToast").appendChild(d);setTimeout(()=>d.remove(),3200)};
const busy=(id,on)=>{const b=$("#"+id);if(!b)return;b.disabled=on;b.dataset.old=b.dataset.old||b.textContent;b.textContent=on?"Processing…":b.dataset.old};
const openModal=id=>{$("#"+id)?.classList.remove("hidden");document.body.classList.add("modal-open")};
const closeModal=id=>{$("#"+id)?.classList.add("hidden");if(!$$('.modal:not(.hidden)').length)document.body.classList.remove("modal-open")};
const loadImage=src=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(Error("Image could not be loaded"));i.src=src});
const PDFJS_VERSION="4.4.168",PDFJS_URL=`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.mjs`,PDFJS_WORKER_URL=`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.mjs`;
let pdfJsPromise=null;async function getPdfJs(){if(!pdfJsPromise)pdfJsPromise=import(PDFJS_URL).then(m=>{if(!m?.getDocument)throw Error("PDF.js failed to load");if(m.GlobalWorkerOptions)m.GlobalWorkerOptions.workerSrc=PDFJS_WORKER_URL;return m}).catch(e=>(pdfJsPromise=null,Promise.reject(e)));return pdfJsPromise}
window.addEventListener("DOMContentLoaded",()=>{bind();onAuthStateChanged(auth,async u=>{state.user=u;if(!u){showAuth();return}if(!await verifyAdmin(u.uid)){await signOut(auth);showAuth("This Firebase account is not an authorized admin.");return}state.isAdmin=true;hideAuth();$("#adminEmail").textContent=u.email||"";$("#adminProfileText").textContent=u.email||"";await refreshAll()})});
function bind(){
 $$(".nav-item").forEach(b=>b.onclick=()=>showPage(b.dataset.page));$$("[data-page-jump]").forEach(b=>b.onclick=()=>showPage(b.dataset.pageJump));$("#sidebarToggle").onclick=()=>$("#sidebar").classList.toggle("open");
 $("#adminLoginBtn").onclick=adminLogin;$("#adminForgotBtn").onclick=forgotAdmin;$("#adminLogout").onclick=adminLogout;$("#profileLogoutBtn").onclick=adminLogout;$("#adminProfileBtn").onclick=()=>openModal("adminProfileModal");
 $("#addServiceBtn").onclick=()=>openServiceEditor();$("#serviceForm").onsubmit=e=>{e.preventDefault();saveService()};$("#addTemplateBtn").onclick=()=>openTemplateCreator();$("#saveTemplateBtn").onclick=saveTemplate;$("#tplFile").onchange=handleTemplateFile;$("#activationFilter").onchange=renderActivations;$("#userSearch").oninput=renderUsers;$("#adminSendChatBtn").onclick=window.sendAdminChatV5;$("#adminChatInput").onkeydown=e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();window.sendAdminChatV5?.()}};$$(".modal-close").forEach(b=>b.onclick=()=>closeModal(b.dataset.close));
 $$(".template-side").forEach(b=>b.onclick=()=>{if(!state.tplPdf)return;state.tplSide=b.dataset.tplSide;syncTemplateSideUI();loadTemplateCropPage()});$("#tplPageSelect").onchange=()=>{storeTplCrop();state.tplPages[state.tplSide]=+$("#tplPageSelect").value;loadTemplateCropPage()};$("#tplAddSideBtn").onclick=advanceTemplateSide;$("#tplZoomIn").onclick=()=>tplZoom((state.tplCrop?.zoom||1)+.15);$("#tplZoomOut").onclick=()=>tplZoom((state.tplCrop?.zoom||1)-.15);$("#tplCropReset").onclick=tplReset;bindTemplateGestures();
}
async function verifyAdmin(uid){try{const s=await getDoc(doc(db,"adminAccount","config"));return s.exists()&&s.data().uid===uid&&s.data().status==="active"}catch{return false}}
function showAuth(m=""){$("#adminAuthModal").classList.remove("hidden");$("#adminAuthHint").textContent=m||"Sign in with the Firebase admin account configured in Firestore."}function hideAuth(){$("#adminAuthModal").classList.add("hidden")}
async function adminLogin(){const e=$("#adminEmailInput").value.trim(),p=$("#adminPasswordInput").value;if(!e||!p)return toast("Enter email and password","warn");busy("adminLoginBtn",true);try{await signInWithEmailAndPassword(auth,e,p)}catch(x){toast(x.message||"Login failed","error")}finally{busy("adminLoginBtn",false)}}
async function forgotAdmin(){const e=$("#adminEmailInput").value.trim();if(!e)return toast("Enter admin email","warn");try{await sendPasswordResetEmail(auth,e);toast("Reset email sent")}catch(x){toast(x.message||"Reset failed","error")}}
async function registerFirstAdmin(){const e=$("#adminRegEmail").value.trim(),p=$("#adminRegPassword").value,c=$("#adminRegConfirm").value;if(!e||!p||p!==c)return toast("Check registration fields","warn");busy("adminRegisterBtn",true);try{const cred=await createUserWithEmailAndPassword(auth,e,p);await runTransaction(db,async tx=>{const r=doc(db,"adminAccount","config"),s=await tx.get(r);if(s.exists())throw Error("An admin account already exists");tx.set(r,{uid:cred.user.uid,email:e,status:"active",createdAt:serverTimestamp(),updatedAt:serverTimestamp()})});hideAuth()}catch(x){toast(x.message||"Registration failed","error");try{await signOut(auth)}catch{}}finally{busy("adminRegisterBtn",false)}}
async function adminLogout(){try{await signOut(auth);closeModal("adminProfileModal")}catch{toast("Logout failed","error")}}
async function refreshAll(){await Promise.all([loadServices(),loadActivations(),loadUsers(),loadTemplates(),loadBuiltins()]);renderDashboard()}
async function loadServices(){try{const s=await getDocs(collection(db,"services"));state.services=s.docs.map(d=>({id:d.id,...d.data()}));renderServices()}catch{state.services=[];renderServices()}}
async function loadBuiltins(){const[p,ps]=await Promise.all([getDoc(doc(db,"serviceSettings","pvc")),getDoc(doc(db,"serviceSettings","passport"))]);state.builtin.pvc={id:"builtin-pvc",name:"PVC Card Print",description:"Manual PVC card print",icon:"▣",access:"open",enabled:true,templateType:"pvc",front:true,back:true,builtin:true,...(p.exists()?p.data():{})};state.builtin.passport={id:"builtin-passport",name:"Passport Photo",description:"Manual 33:45 passport photo print",icon:"▦",access:"open",enabled:true,templateType:"passport",builtin:true,...(ps.exists()?ps.data():{})};renderServices()}
async function loadActivations(){try{const s=await getDocs(query(collection(db,"activationRequests"),orderBy("createdAt","desc")));state.activations=s.docs.map(d=>({id:d.id,...d.data()}));renderActivations()}catch{state.activations=[];renderActivations()}}
async function loadUsers(){try{const s=await getDocs(collection(db,"users"));const base=s.docs.map(d=>({id:d.id,...d.data()}));state.users=await Promise.all(base.map(async u=>{if(Number.isFinite(Number(u.usageCount)))return u;try{const q=await getDocs(query(collection(db,"users",u.id,"transactions"),where("type","==","service_use"),where("status","==","approved")));return {...u,usageCount:q.size}}catch{return {...u,usageCount:0}}}));state.chatListeners.forEach(u=>u());state.chatListeners=[];state.unreadChats={};state.users.forEach(u=>watchUserChat(u.id));renderUsers();renderSupport()}catch{state.users=[];renderUsers();renderSupport()}}
function watchUserChat(uid){const un=onSnapshot(query(collection(db,"chats",uid,"messages"),orderBy("createdAt","desc"),limit(1)),s=>{const d=s.docs[0];if(!d)return;const m=d.data();state.unreadChats[uid]=m.senderRole==="user"&&!m.readAt;renderUsers();renderSupport()});state.chatListeners.push(un)}
function renderSupport(){const box=$("#supportList");if(!box)return;const unreadCount=Object.values(state.unreadChats).filter(Boolean).length;$("#supportUnreadCount").textContent=`${unreadCount} unread`;const rows=state.users.map(u=>{const unread=!!state.unreadChats[u.id];return `<div class="support-row"><div><b>${safe(u.name||"User")}</b><small>@${safe(u.username||"—")} • ${safe(u.mobile||"—")}</small></div><span class="support-unread ${unread?"show":""}">${unread?"New":""}</span><button class="tiny-btn blue" data-support-chat="${u.id}">Open chat</button></div>`}).join("");box.innerHTML=rows||'<div class="empty-state">No users yet</div>';$$('[data-support-chat]').forEach(b=>b.onclick=()=>openUserChat(b.dataset.supportChat))}
async function loadTemplates(){try{const s=await getDocs(query(collection(db,"templates"),orderBy("createdAt","desc")));state.templates=s.docs.map(d=>({id:d.id,...d.data()}));renderTemplates()}catch{state.templates=[];renderTemplates()}}
const allAdminServices=()=>[state.builtin.pvc,state.builtin.passport,...state.services].filter(Boolean);
function renderDashboard(){const all=allAdminServices(),active=all.filter(x=>x.enabled!==false).length,p=state.activations.filter(x=>x.status==="pending").length;$("#statsGrid").innerHTML=[["◉",state.users.length,"Total Users"],["▣",active,"Active Services"],["♢",p,"Pending Activations"],["✓",state.services.length,"Custom Services"]].map(x=>`<div class="stat"><div class="stat-icon">${x[0]}</div><b>${x[1]}</b><small>${x[2]}</small></div>`).join("");$("#dashboardServices").innerHTML=all.map(s=>{const pr=getPrice(s.id),one=Number(pr.activationFee||0),use=Number(pr.usageFee||0);const price=one&&use?`Activation ₹${one} • Per use ₹${use}`:one?`Activation ₹${one}`:use?`Per use ₹${use}`:"Free";return `<div class="service-health"><div><b>${safe(s.name)}</b><small>${s.builtin?"Built-in":"Template service"} • ${safe(s.access||"open")} • ${safe(price)}</small></div><span class="pill ${s.enabled===false?"off":""}">${s.enabled===false?"Disabled":"Enabled"}</span></div>`}).join("")||"<div class=empty-state>No services</div>";$("#dashboardActivations").innerHTML=state.activations.filter(x=>x.status==="pending").slice(0,7).map(a=>`<div class="activation-mini"><div><b>${safe(a.userName||a.uid)}</b><small>${safe(a.serviceName||a.serviceId)} • ₹${Number(a.amount||0)}</small></div><span class="pill">Pending</span></div>`).join("")||"<div class=empty-state>No activation requests</div>"}
function renderServices(){const rows=allAdminServices().map(s=>`<tr><td><div class="service-name"><span class="svc-icon">${safe(s.icon||"▣")}</span><div><b>${safe(s.name)}</b><small>${safe(s.description||"")}</small></div></div></td><td>${s.builtin?"Built-in":"Template"}</td><td>${safe(s.access||"open")}</td><td><span class="pill ${s.enabled===false?"off":""}">${s.enabled===false?"Disabled":"Enabled"}</span></td><td>${s.front===false?"No":"Yes"}</td><td>${s.back===false?"No":"Yes"}</td><td>${safe(s.templateName||"—")}</td><td><div class="table-actions"><button class="tiny-btn blue" data-edit-service="${s.id}">Edit</button><button class="tiny-btn" data-toggle-service="${s.id}">${s.enabled===false?"Enable":"Disable"}</button>${s.builtin?"":"<button class=tiny-btn red data-delete-service=\""+s.id+"\">Delete</button>"}</div></td></tr>`).join("");$("#serviceTable").innerHTML=`<div class="table-wrap"><table class="service-table"><thead><tr><th>Service</th><th>Kind</th><th>Access</th><th>Status</th><th>Front</th><th>Back</th><th>Template</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div>`;$$("[data-edit-service]").forEach(b=>b.onclick=()=>openServiceEditor(b.dataset.editService));$$("[data-toggle-service]").forEach(b=>b.onclick=()=>toggleService(b.dataset.toggleService));$$("[data-delete-service]").forEach(b=>b.onclick=()=>deleteService(b.dataset.deleteService))}
function openServiceEditor(id=null){state.editingServiceId=id;const s=id?(allAdminServices().find(x=>x.id===id)||{}):{};$("#serviceEditTitle").textContent=id?"Edit Service":"Add Service";$("#svcName").value=s.name||"";$("#svcIcon").value=s.icon||"▣";$("#svcDesc").value=s.description||"";$("#svcAccess").value=s.access||"open";$("#svcMode").value=s.documentMode||"image";$("#svcFront").checked=s.front!==false;$("#svcBack").checked=s.back!==false;$("#svcEnabled").checked=s.enabled!==false;$("#svcTemplate").innerHTML='<option value="">Select template</option>'+state.templates.map(t=>`<option value="${safe(t.id)}">${safe(t.name)}</option>`).join("");$("#svcTemplate").value=String(s.templateId||"");openModal("serviceEditModal")}
async function saveService(){const name=$("#svcName").value.trim(),tid=String($("#svcTemplate").value||"").trim(),t=state.templates.find(x=>x.id===tid);if(!name)return toast("Service name is required","warn");if(!state.editingServiceId&&!tid)return toast("Select a template","warn");if(tid&&!t)return toast("Selected template was not found. Reload templates and try again.","error");busy("saveServiceBtn",true);try{const patch={name,description:$("#svcDesc").value.trim(),icon:$("#svcIcon").value.trim()||"▣",access:$("#svcAccess").value,documentMode:$("#svcMode").value,front:$("#svcFront").checked,back:$("#svcBack").checked,enabled:$("#svcEnabled").checked,templateId:tid||null,templateName:t?.name||null,templateType:tid?"template":null,pageCount:t?.pageCount||1,updatedAt:serverTimestamp()};if(state.editingServiceId?.startsWith("builtin-")){const key=state.editingServiceId.replace("builtin-","");const existing=state.builtin[key]||{};await setDoc(doc(db,"serviceSettings",key),{name,description:patch.description,icon:patch.icon,access:patch.access,enabled:patch.enabled,documentMode:patch.documentMode,front:patch.front,back:patch.back,templateId:patch.templateId,templateName:patch.templateName,templateType:patch.templateId?"template":(existing.templateType||key),pageCount:patch.pageCount,updatedAt:serverTimestamp()},{merge:true});await loadBuiltins()}else if(state.editingServiceId)await updateDoc(doc(db,"services",state.editingServiceId),patch);else{patch.createdAt=serverTimestamp();await addDoc(collection(db,"services"),patch)}closeModal("serviceEditModal");await loadServices();renderServices();renderDashboard();toast(tid?`Service saved • Auto-crop: ${t.name}`:"Service saved")}catch(e){console.error("Service save error:",e);toast(e.message||"Could not save service","error")}finally{busy("saveServiceBtn",false)}}
async function toggleService(id){const s=allAdminServices().find(x=>x.id===id);if(!s)return;try{if(s.builtin)await setDoc(doc(db,"serviceSettings",s.templateType),{enabled:s.enabled===false,updatedAt:serverTimestamp()},{merge:true});else await updateDoc(doc(db,"services",id),{enabled:s.enabled===false,updatedAt:serverTimestamp()});await loadBuiltins();await loadServices();renderServices();renderDashboard();toast(s.enabled===false?"Service enabled":"Service disabled")}catch(e){toast(e.message||"Toggle failed","error")}}
async function deleteService(id){if(!confirm("Delete this service?"))return;try{await deleteDoc(doc(db,"services",id));await loadServices();renderServices();renderDashboard();toast("Service deleted")}catch(e){toast(e.message||"Delete failed","error")}}
function renderActivations(){const f=$("#activationFilter").value,list=f==="all"?state.activations:state.activations.filter(a=>a.status===f);$("#activationList").innerHTML=list.map(a=>`<div class="activation-row"><div><b>${safe(a.userName||"User")}</b><small>${safe(a.uid||"")}</small></div><div><b>${safe(a.serviceName||a.serviceId||"Service")}</b><small>${a.createdAt?.toDate?a.createdAt.toDate().toLocaleString():""}</small></div><div><span class="pill ${a.status==="rejected"?"off":""}">${safe(a.status||"pending")}</span></div><div>${a.status==="pending"?`<button class="tiny-btn blue" data-approve="${a.id}">Approve</button> <button class="tiny-btn red" data-reject="${a.id}">Reject</button>`:""}</div></div>`).join("")||"<div class=empty-state>No activation requests</div>";$$("[data-approve]").forEach(b=>b.onclick=()=>changeActivation(b.dataset.approve,"approved"));$$("[data-reject]").forEach(b=>b.onclick=()=>changeActivation(b.dataset.reject,"rejected"))}
async function changeActivation(id,status){const a=state.activations.find(x=>x.id===id);if(!a)return;try{await updateDoc(doc(db,"activationRequests",id),{status,reviewedAt:serverTimestamp(),reviewedBy:state.user.uid});await setDoc(doc(db,"activations",a.uid,a.serviceId),{status,enabled:status==="approved",updatedAt:serverTimestamp(),approvedBy:status==="approved"?state.user.uid:null},{merge:true});await loadActivations();renderDashboard();toast(status==="approved"?"Activation approved":"Activation rejected")}catch(e){toast(e.message||"Activation update failed","error")}}
function renderUsers(){const q=$("#userSearch").value.toLowerCase(),list=state.users.filter(u=>[u.name,u.username,u.email,u.mobile,u.id].some(v=>String(v||"").toLowerCase().includes(q)));$("#userList").innerHTML=list.map(u=>{const blocked=u.status==="blocked",unread=!!state.unreadChats[u.id];return `<div class="user-row"><div><b>${safe(u.name||"—")}</b><small>@${safe(u.username||"—")}</small></div><div><b>${safe(u.email||"—")}</b><small>${safe(u.mobile||"—")}</small></div><div><span class="pill ${blocked?"off":""}">${blocked?"Blocked":safe(u.status||"active")}</span><small>${u.createdAt?.toDate?u.createdAt.toDate().toLocaleDateString():""}</small></div><div class=table-actions><button class="tiny-btn blue" data-detail-user="${u.id}">View</button><button class="tiny-btn blue" data-chat-user="${u.id}">💬 Chat ${unread?"🔴":""}</button><button class="tiny-btn ${blocked?"blue":"red"}" data-block-user="${u.id}">${blocked?"Unblock":"Block"}</button></div></div>`}).join("")||"<div class=empty-state>No users</div>";$$('[data-detail-user]').forEach(b=>b.onclick=()=>openUserDetail(b.dataset.detailUser));$$('[data-chat-user]').forEach(b=>b.onclick=()=>openUserChat(b.dataset.chatUser));$$('[data-block-user]').forEach(b=>b.onclick=()=>toggleUserBlock(b.dataset.blockUser))}
async function openUserDetail(uid){const u=state.users.find(x=>x.id===uid);if(!u)return;const acts=state.activations.filter(a=>a.uid===uid);let approved={};try{const s=await getDocs(collection(db,"activations",uid));s.forEach(d=>approved[d.id]=d.data())}catch{}const services=allAdminServices();$("#userDetailTitle").textContent=u.name||"User";$("#userDetailBody").innerHTML=`<div class="detail-grid"><div><b>Username</b><span>@${safe(u.username||"—")}</span></div><div><b>Mobile</b><span>${safe(u.mobile||"—")}</span></div><div><b>Email</b><span>${safe(u.email||"—")}</span></div><div><b>Account</b><span>${safe(u.status||"active")}</span></div></div><h4>Services</h4>${services.map(s=>{const a=approved[s.id]||acts.find(x=>x.serviceId===s.id);const st=a?.status||"Not activated";return `<div class="detail-service"><div><b>${safe(s.name)}</b><small>Access: ${safe(s.access||"open")}</small></div><span class="pill ${st!=="approved"&&st!=="active"?"off":""}">${safe(st)}</span></div>`}).join("")}`;openModal("userDetailModal")}
async function toggleUserBlock(uid){const u=state.users.find(x=>x.id===uid);if(!u)return;const blocked=u.status==="blocked";if(!confirm(`${blocked?"Unblock":"Block"} ${u.name||"this user"}?`))return;try{await updateDoc(doc(db,"users",uid),{status:blocked?"active":"blocked",updatedAt:serverTimestamp()});u.status=blocked?"active":"blocked";renderUsers();toast(blocked?"User unblocked":"User blocked")}catch(e){toast(e.message||"User status update failed","error")}}
let adminChatUnsub=null,activeChatUid=null;function openUserChat(uid){const u=state.users.find(x=>x.id===uid);if(!u)return;activeChatUid=uid;updateUnreadAsRead(uid);$("#chatUserName").textContent=u.name||"User";$("#chatUserMeta").textContent=`@${u.username||"—"} • ${u.mobile||"—"} • ${u.email||"—"}`;$("#chatUserAvatar").textContent=(u.name||"U")[0].toUpperCase();$("#adminChatInput").value="";openModal("userChatModal");adminChatUnsub?.();adminChatUnsub=onSnapshot(query(collection(db,"chats",uid,"messages"),orderBy("createdAt","asc")),s=>{const box=$("#adminChatMessages");box.innerHTML="";s.forEach(d=>{const m=d.data(),r=document.createElement("div");r.className=`chat-bubble ${m.senderRole==="admin"?"mine":"theirs"}`;r.textContent=m.text||"";box.appendChild(r)});box.scrollTop=box.scrollHeight},()=>toast("Chat could not be loaded","error"))}
async function updateUnreadAsRead(uid){try{const q=await getDocs(query(collection(db,"chats",uid,"messages"),orderBy("createdAt","desc"),limit(20)));const batch=q.docs.filter(d=>d.data().senderRole==="user"&&!d.data().readAt).slice(0,20);await Promise.all(batch.map(d=>updateDoc(d.ref,{readAt:serverTimestamp(),readBy:state.user.uid})));state.unreadChats[uid]=false;renderSupport();renderUsers()}catch{}}
async function sendAdminChat(){if(!activeChatUid||!state.user)return;const text=$("#adminChatInput").value.trim();if(!text)return;busy("adminSendChatBtn",true);try{await addDoc(collection(db,"chats",activeChatUid,"messages"),{text,senderUid:state.user.uid,senderRole:"admin",createdAt:serverTimestamp()});$("#adminChatInput").value=""}catch(e){toast(e.message||"Message could not be sent","error")}finally{busy("adminSendChatBtn",false)}}

/* =====================================================
   TEMPLATE WORKFLOW
   Firebase Storage NOT USED
   Only crop configuration is saved in Firestore
===================================================== */


/* ---------- Reset Template ---------- */

function resetTemplate(){

  state.tplFile = null;
  state.tplPdf = null;

  state.tplSide = "front";

  state.tplPages = {
    front: 1,
    back: 1
  };

  state.tplCrop = null;

  state.tplCropStates = {
    front: null,
    back: null
  };

  $("#tplName").value = "";
  $("#tplFile").value = "";

  $("#tplFileInfo").textContent =
    "Choose a PDF to continue.";

  $("#tplCropWorkspace").classList.add("hidden");

  $("#tplAddSideBtn").textContent =
    "Add Front Crop";
}


/* ---------- Create Template ---------- */

function openTemplateCreator(){

  state.editingTemplateId = null;

  resetTemplate();

  $("#templateModalTitle").textContent =
    "Create Template";

  openModal("templateModal");
}


/* =====================================================
   EDIT TEMPLATE

   IMPORTANT:
   PDF is NOT stored in Firebase Storage anymore.

   Therefore when editing an old template,
   admin must select the source PDF again.
===================================================== */

async function editTemplate(id){

  const t =
    state.templates.find(x => x.id === id);

  if(!t) return;

  state.editingTemplateId = id;

  resetTemplate();

  $("#templateModalTitle").textContent =
    "Edit Template";

  $("#tplName").value =
    t.name || "";

  $("#tplFileInfo").textContent =
    "Select the original/source PDF to edit this template.";

  openModal("templateModal");

  /*
    We do NOT fetch t.fileUrl anymore.
    Only saved crop configuration is loaded
    after admin selects the source PDF.
  */

  state.tplExistingTemplate = t;
}


/* =====================================================
   HANDLE TEMPLATE FILE
===================================================== */

async function handleTemplateFile(){

  const f =
    $("#tplFile").files?.[0];

  if(!f) return;

  try{

    state.tplFile = f;

    const old =
      state.editingTemplateId
        ? state.tplExistingTemplate || null
        : null;

    await processTemplateSource(
      f,
      old
    );

  }catch(e){

    if(e.code !== "PDF_CANCELLED"){

      console.error(
        "Template PDF error:",
        e
      );

      toast(
        e.message || "PDF failed",
        "error"
      );
    }
  }
}


/* =====================================================
   PROCESS TEMPLATE SOURCE
===================================================== */

async function processTemplateSource(
  file,
  old
){

  $("#tplFileInfo").textContent =
    `${file.name} • opening…`;

  /*
    IMAGE SOURCE
  */

  if(file.type.startsWith("image/")){

    const url =
      URL.createObjectURL(file);

    const img =
      await loadImage(url);

    state.tplPdf = {
      numPages: 1,
      pages: [img]
    };

  }

  /*
    PDF SOURCE
  */

  else{

    state.tplPdf =
      await openPdf(file);
  }


  /*
    Restore saved page numbers
  */

  state.tplPages = {

    front: Math.min(
      old?.frontPage || 1,
      state.tplPdf.numPages
    ),

    back: Math.min(
      old?.backPage || 1,
      state.tplPdf.numPages
    )

  };


  /*
    Restore saved crop configuration
  */

  state.tplCropStates = {

    front:
      normalizeSavedCrop(
        old?.frontCrop
      ),

    back:
      normalizeSavedCrop(
        old?.backCrop
      )

  };


  fillTemplatePages();


  $("#tplFileInfo").textContent =
    `${file.name} • ${state.tplPdf.numPages} page${
      state.tplPdf.numPages > 1 ? "s" : ""
    }`;


  $("#tplCropWorkspace")
    .classList
    .remove("hidden");


  syncTemplateSideUI();

  loadTemplateCropPage();
}


/* =====================================================
   NORMALIZE OLD / NEW SAVED CROP
===================================================== */

function normalizeSavedCrop(crop){

  if(!crop) return null;

  /*
    New format:

    x
    y
    w
    h
    page
    pageWidth
    pageHeight
    nx
    ny
    nw
    nh
  */

  let x = Number(crop.x);
  let y = Number(crop.y);
  let w = Number(crop.w);
  let h = Number(crop.h);

  /*
    Backward compatibility with your old format:

    width
    height
  */

  if(
    !Number.isFinite(w) &&
    Number.isFinite(crop.width)
  ){

    w = Number(crop.width);
  }

  if(
    !Number.isFinite(h) &&
    Number.isFinite(crop.height)
  ){

    h = Number(crop.height);
  }


  /*
    If old data was normalized x/y/width/height,
    convert it into absolute values.
  */

  const pageWidth =
    Number(crop.pageWidth) || 0;

  const pageHeight =
    Number(crop.pageHeight) || 0;


  if(
    pageWidth &&
    pageHeight
  ){

    /*
      Detect old normalized format
    */

    if(
      x >= 0 &&
      x <= 1 &&
      y >= 0 &&
      y <= 1 &&
      w > 0 &&
      w <= 1 &&
      h > 0 &&
      h <= 1
    ){

      x = x * pageWidth;
      y = y * pageHeight;
      w = w * pageWidth;
      h = h * pageHeight;

    }

  }


  if(
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(w) ||
    !Number.isFinite(h)
  ){

    return null;
  }


  return {

    x,
    y,
    w,
    h,

    page:
      Number(crop.page) || 1,

    pageWidth,

    pageHeight,

    ratio:
      Number(crop.ratio) ||
      (h ? w / h : 0),

    nx:
      crop.nx != null
        ? Number(crop.nx)
        : (
            pageWidth
              ? x / pageWidth
              : 0
          ),

    ny:
      crop.ny != null
        ? Number(crop.ny)
        : (
            pageHeight
              ? y / pageHeight
              : 0
          ),

    nw:
      crop.nw != null
        ? Number(crop.nw)
        : (
            pageWidth
              ? w / pageWidth
              : 0
          ),

    nh:
      crop.nh != null
        ? Number(crop.nh)
        : (
            pageHeight
              ? h / pageHeight
              : 0
          ),

    rotation:
      Number(crop.rotation) || 0

  };
}


/* =====================================================
   OPEN PDF
   Password protected PDF supported
===================================================== */

async function openPdf(file){

  const pdfjs =
    await getPdfJs();

  let password = "";

  while(true){

    let task = null;

    try{

      const data =
        new Uint8Array(
          await file.arrayBuffer()
        );


      task =
        pdfjs.getDocument({
          data,
          password
        });


      state.tplTask = task;


      const pdf =
        await task.promise;


      state.tplTask = null;


      const pages = [];


      for(
        let n = 1;
        n <= pdf.numPages;
        n++
      ){

        pages.push(
          await renderPdfPage(
            pdf,
            n
          )
        );

      }


      return {

        pdf,

        numPages:
          pdf.numPages,

        pages

      };


    }catch(e){

      try{

        task?.destroy();

      }catch{}


      state.tplTask = null;


      /*
        Password required / wrong password
      */

      if(
        e?.name !== "PasswordException" &&
        e?.code !== 1 &&
        e?.code !== 2
      ){

        throw e;

      }


      password =
        await templatePassword(
          e?.code === 2
            ? "Incorrect password. Try again."
            : ""
        );

    }

  }

}


/* =====================================================
   RENDER PDF PAGE
===================================================== */

async function renderPdfPage(
  pdf,
  n
){

  const page =
    await pdf.getPage(n);


  /*
    Scale 2 gives a high quality
    crop calibration image.
  */

  const vp =
    page.getViewport({
      scale: 2
    });


  const c =
    document.createElement(
      "canvas"
    );


  c.width =
    Math.ceil(vp.width);

  c.height =
    Math.ceil(vp.height);


  await page.render({

    canvasContext:
      c.getContext("2d"),

    viewport:
      vp

  }).promise;


  const url =
    c.toDataURL(
      "image/jpeg",
      .94
    );


  return loadImage(url);
}


/* =====================================================
   PASSWORD MODAL
===================================================== */

function templatePassword(
  msg = ""
){

  return new Promise(
    (res, rej) => {

      const m =
        $("#templatePasswordModal");

      const i =
        $("#templatePasswordInput");

      const e =
        $("#templatePasswordError");

      const ok =
        $("#templatePasswordOk");

      const ca =
        $("#templatePasswordCancel");


      i.value = "";

      e.textContent =
        msg;


      openModal(
        "templatePasswordModal"
      );


      const clean = () => {

        ok.onclick = null;

        ca.onclick = null;

        i.onkeydown = null;

      };


      ok.onclick = () => {

        if(!i.value){

          e.textContent =
            "Enter password";

          return;
        }


        const v =
          i.value;


        clean();

        closeModal(
          "templatePasswordModal"
        );


        res(v);

      };


      ca.onclick = () => {

        clean();

        closeModal(
          "templatePasswordModal"
        );


        rej(
          Object.assign(
            Error(
              "Template PDF cancelled"
            ),
            {
              code:
                "PDF_CANCELLED"
            }
          )
        );

      };


      i.onkeydown = x => {

        if(x.key === "Enter"){

          ok.click();

        }

      };


      setTimeout(
        () => i.focus(),
        30
      );

    }
  );

}


/* =====================================================
   TEMPLATE PAGE SELECTOR
===================================================== */

function fillTemplatePages(){

  if(!state.tplPdf)
    return;


  const s =
    $("#tplPageSelect");


  s.innerHTML =
    Array.from(
      {
        length:
          state.tplPdf.numPages
      },
      (_, i) =>
        `<option value="${i + 1}">
          Page ${i + 1}
        </option>`
    ).join("");


  s.value =
    state.tplPages[
      state.tplSide
    ] || 1;


  $("#tplPageCountText")
    .textContent =
      `${state.tplPdf.numPages} page${
        state.tplPdf.numPages > 1
          ? "s"
          : ""
      }`;

}


/* =====================================================
   SIDE UI
===================================================== */

function syncTemplateSideUI(){

  $$(".template-side")
    .forEach(b => {

      b.classList.toggle(
        "active",
        b.dataset.tplSide ===
          state.tplSide
      );

    });


  $("#tplAddSideBtn")
    .textContent =
      state.tplSide === "front"
        ? "Add Front Crop"
        : "Add Back Crop";


  if(state.tplPdf){

    fillTemplatePages();


    $("#tplPageSelect").value =
      state.tplPages[
        state.tplSide
      ] || 1;

  }

}


/* =====================================================
   CURRENT TEMPLATE IMAGE
===================================================== */

function currentTemplateImage(){

  return (
    state.tplPdf
      ?.pages
      ?.[
        (
          state.tplPages[
            state.tplSide
          ] || 1
        ) - 1
      ]
  );

}


/* =====================================================
   STORE TEMPLATE CROP
=====================================================

   SAVED FORMAT:

   {
      x: 806,
      y: 1368,
      w: 868,
      h: 772,

      page: 1,

      pageWidth: 2480,
      pageHeight: 3507,

      ratio: 1.125023,

      nx: ...,
      ny: ...,
      nw: ...,
      nh: ...
   }

===================================================== */

function storeTplCrop(){

  if(
    !state.tplCrop ||
    !state.tplPdf
  ){

    return;
  }


  const s =
    state.tplCrop.source;


  if(
    !s ||
    !s.naturalWidth ||
    !s.naturalHeight
  ){

    return;
  }


  const pageWidth =
    s.naturalWidth;

  const pageHeight =
    s.naturalHeight;


  const x =
    Math.max(
      0,
      Math.min(
        state.tplCrop.x,
        pageWidth
      )
    );


  const y =
    Math.max(
      0,
      Math.min(
        state.tplCrop.y,
        pageHeight
      )
    );


  const w =
    Math.max(
      1,
      Math.min(
        state.tplCrop.width,
        pageWidth - x
      )
    );


  const h =
    Math.max(
      1,
      Math.min(
        state.tplCrop.height,
        pageHeight - y
      )
    );


  state.tplCropStates[
    state.tplSide
  ] = {

    /*
      Absolute crop coordinates
    */

    x:
      Math.round(x),

    y:
      Math.round(y),

    w:
      Math.round(w),

    h:
      Math.round(h),


    /*
      Page information
    */

    page:
      state.tplPages[
        state.tplSide
      ] || 1,

    pageWidth,
    pageHeight,


    /*
      Crop ratio
    */

    ratio:
      Number(
        (w / h).toFixed(6)
      ),


    /*
      Normalized coordinates
      These make auto crop work with
      different PDF render resolutions.
    */

    nx:
      Number(
        (x / pageWidth).toFixed(8)
      ),

    ny:
      Number(
        (y / pageHeight).toFixed(8)
      ),

    nw:
      Number(
        (w / pageWidth).toFixed(8)
      ),

    nh:
      Number(
        (h / pageHeight).toFixed(8)
      ),


    rotation:
      0

  };

}


/* =====================================================
   LOAD SAVED TEMPLATE CROP
===================================================== */

function loadTemplateCropPage(){

  const img =
    currentTemplateImage();


  if(!img) return;


  const old =
    state.tplCropStates[
      state.tplSide
    ];


  if(
    old &&
    Number(old.page) ===
      Number(
        state.tplPages[
          state.tplSide
        ] || 1
      )
  ){

    /*
      Prefer normalized coordinates.
      This makes the crop resolution independent.
    */

    let x, y, width, height;


    if(
      Number.isFinite(
        Number(old.nx)
      ) &&
      Number.isFinite(
        Number(old.ny)
      ) &&
      Number.isFinite(
        Number(old.nw)
      ) &&
      Number.isFinite(
        Number(old.nh)
      )
    ){

      x =
        Number(old.nx) *
        img.naturalWidth;

      y =
        Number(old.ny) *
        img.naturalHeight;

      width =
        Number(old.nw) *
        img.naturalWidth;

      height =
        Number(old.nh) *
        img.naturalHeight;

    }else{

      /*
        Fallback for old saved templates
      */

      x =
        Number(old.x) *
        img.naturalWidth;

      y =
        Number(old.y) *
        img.naturalHeight;

      width =
        Number(
          old.w ??
          old.width
        ) *
        img.naturalWidth;

      height =
        Number(
          old.h ??
          old.height
        ) *
        img.naturalHeight;

    }


    state.tplCrop = {

      source:
        img,

      x:
        Math.max(
          0,
          Math.min(
            x,
            img.naturalWidth - 1
          )
        ),

      y:
        Math.max(
          0,
          Math.min(
            y,
            img.naturalHeight - 1
          )
        ),

      width:
        Math.max(
          12,
          Math.min(
            width,
            img.naturalWidth
          )
        ),

      height:
        Math.max(
          12,
          Math.min(
            height,
            img.naturalHeight
          )
        ),

      zoom:
        1,

      panX:
        0,

      panY:
        0,

      rotation:
        Number(old.rotation) || 0

    };

  }else{

    state.tplCrop =
      newTemplateCrop(img);

  }


  drawTemplateCrop();

}


/* =====================================================
   NEW TEMPLATE CROP
===================================================== */

function newTemplateCrop(src){

  const w =
    src.naturalWidth * .7;

  const h =
    src.naturalHeight * .7;


  return {

    source:
      src,

    x:
      (src.naturalWidth - w) / 2,

    y:
      (src.naturalHeight - h) / 2,

    width:
      w,

    height:
      h,

    zoom:
      1,

    panX:
      0,

    panY:
      0,

    rotation:
      0

  };

}


/* =====================================================
   ZOOM
===================================================== */

function tplZoom(z){

  if(!state.tplCrop)
    return;


  state.tplCrop.zoom =
    Math.max(
      .5,
      Math.min(
        5,
        z
      )
    );


  state.tplCrop.panX = 0;
  state.tplCrop.panY = 0;


  drawTemplateCrop();

}


/* =====================================================
   ROTATE
===================================================== */

function tplRotate(r){

  if(!state.tplCrop)
    return;


  state.tplCrop.rotation =
    Math.max(
      -180,
      Math.min(
        180,
        r
      )
    );


  drawTemplateCrop();

}


/* =====================================================
   RESET CROP
===================================================== */

function tplReset(){

  const i =
    currentTemplateImage();


  if(i){

    state.tplCrop =
      newTemplateCrop(i);

    drawTemplateCrop();

  }

}


/* =====================================================
   CROP SCALE
===================================================== */

function tplScale(){

  const c =
    state.tplCrop;

  const r =
    $("#tplCropStage")
      .getBoundingClientRect();


  if(
    !c ||
    !c.source
  ){

    return 1;
  }


  return Math.min(
    r.width /
      c.source.naturalWidth,

    r.height /
      c.source.naturalHeight
  ) * c.zoom;

}


/* =====================================================
   DRAW TEMPLATE CROP
===================================================== */

function drawTemplateCrop(){

  const c =
    state.tplCrop;

  const stage =
    $("#tplCropStage");

  const can =
    $("#tplCropCanvas");

  const box =
    $("#tplCropBox");


  if(
    !c ||
    !stage ||
    !can ||
    !box
  ){

    return;
  }


  const r =
    stage.getBoundingClientRect();


  const d =
    window.devicePixelRatio || 1;


  can.width =
    Math.max(
      1,
      r.width * d
    );


  can.height =
    Math.max(
      1,
      r.height * d
    );


  const ctx =
    can.getContext("2d");


  ctx.setTransform(
    d,
    0,
    0,
    d,
    0,
    0
  );


  ctx.clearRect(
    0,
    0,
    r.width,
    r.height
  );


  const s =
    tplScale();


  ctx.save();


  ctx.translate(
    r.width / 2,
    r.height / 2
  );


  ctx.rotate(
    c.rotation *
    Math.PI /
    180
  );


  ctx.translate(
    c.panX,
    c.panY
  );


  ctx.drawImage(

    c.source,

    -c.source.naturalWidth *
      s / 2,

    -c.source.naturalHeight *
      s / 2,

    c.source.naturalWidth *
      s,

    c.source.naturalHeight *
      s

  );


  ctx.restore();


  const left =
    r.width / 2 +
    c.panX -
    c.source.naturalWidth *
      s / 2 +
    c.x *
      s;


  const top =
    r.height / 2 +
    c.panY -
    c.source.naturalHeight *
      s / 2 +
    c.y *
      s;


  const w =
    Math.max(
      36,
      c.width * s
    );


  const h =
    Math.max(
      36,
      c.height * s
    );


  box.style.left =
    `${Math.max(
      2,
      Math.min(
        r.width - w - 2,
        left
      )
    )}px`;


  box.style.top =
    `${Math.max(
      2,
      Math.min(
        r.height - h - 2,
        top
      )
    )}px`;


  box.style.width =
    `${Math.min(
      w,
      r.width - 4
    )}px`;


  box.style.height =
    `${Math.min(
      h,
      r.height - 4
    )}px`;


  box.style.transform =
    `rotate(${c.rotation || 0}deg)`;


  $("#tplZoomValue")
    .textContent =
      `${Math.round(
        c.zoom * 100
      )}%`;

}


/* =====================================================
   TEMPLATE TOUCH / MOUSE GESTURES
===================================================== */

function bindTemplateGestures(){

  const stage =
    $("#tplCropStage");

  const box =
    $("#tplCropBox");


  if(!stage || !box)
    return;


  const pointers =
    new Map();


  let mode = null;

  let start = null;

  let lastDist = 0;

  let lastMid = null;


  const hs =
    [
      ...box.querySelectorAll("i")
    ];


  const handle = e => {

    const h =
      e.target.closest("i");


    return (
      h &&
      box.contains(h)
    )
      ? hs.indexOf(h)
      : -1;

  };


  stage.addEventListener(
    "pointerdown",
    e => {

      e.preventDefault();


      pointers.set(
        e.pointerId,
        {
          x: e.clientX,
          y: e.clientY
        }
      );


      stage.setPointerCapture?.(
        e.pointerId
      );


      /*
        Pinch zoom
      */

      if(
        pointers.size === 2
      ){

        mode =
          "pinch";


        const [
          a,
          b
        ] =
          [...pointers.values()];


        lastDist =
          Math.hypot(
            a.x - b.x,
            a.y - b.y
          );


        lastMid = {

          x:
            (a.x + b.x) / 2,

          y:
            (a.y + b.y) / 2

        };


        return;
      }


      const h =
        handle(e);


      /*
        Resize
      */

      if(h >= 0){

        mode =
          "resize";


        start = {

          h,

          x:
            e.clientX,

          y:
            e.clientY,

          c:
            {
              ...state.tplCrop
            }

        };


      }

      /*
        Move crop box
      */

      else if(
        e.target === box ||
        box.contains(e.target)
      ){

        mode =
          "box";


        start = {

          x:
            e.clientX,

          y:
            e.clientY,

          c:
            {
              ...state.tplCrop
            }

        };


      }

      /*
        Pan image
      */

      else{

        mode =
          "pan";


        start = {

          x:
            e.clientX,

          y:
            e.clientY,

          px:
            state.tplCrop.panX,

          py:
            state.tplCrop.panY

        };

      }

    }
  );


  stage.addEventListener(
    "pointermove",
    e => {

      if(
        !pointers.has(
          e.pointerId
        ) ||
        !state.tplCrop
      ){

        return;
      }


      pointers.set(
        e.pointerId,
        {
          x: e.clientX,
          y: e.clientY
        }
      );


      const c =
        state.tplCrop;


      const s =
        tplScale();


      /*
        PINCH
      */

      if(
        mode === "pinch" &&
        pointers.size > 1
      ){

        const [
          a,
          b
        ] =
          [...pointers.values()];


        const mid = {

          x:
            (a.x + b.x) / 2,

          y:
            (a.y + b.y) / 2

        };


        const dist =
          Math.hypot(
            a.x - b.x,
            a.y - b.y
          );


        if(lastDist){

          c.zoom =
            Math.max(
              .5,
              Math.min(
                5,
                c.zoom *
                  dist /
                  lastDist
              )
            );


          c.panX +=
            mid.x -
            lastMid.x;


          c.panY +=
            mid.y -
            lastMid.y;


          drawTemplateCrop();

        }


        lastDist =
          dist;

        lastMid =
          mid;


        return;

      }


      if(!start)
        return;


      const dx =
        (
          e.clientX -
          start.x
        ) / s;


      const dy =
        (
          e.clientY -
          start.y
        ) / s;


      /*
        PAN
      */

      if(mode === "pan"){

        c.panX =
          start.px +
          (
            e.clientX -
            start.x
          );


        c.panY =
          start.py +
          (
            e.clientY -
            start.y
          );


        drawTemplateCrop();

        return;

      }


      /*
        MOVE CROP BOX
      */

      if(mode === "box"){

        c.x =
          Math.max(
            0,
            Math.min(
              c.source.naturalWidth -
                c.width,

              start.c.x + dx
            )
          );


        c.y =
          Math.max(
            0,
            Math.min(
              c.source.naturalHeight -
                c.height,

              start.c.y + dy
            )
          );


        drawTemplateCrop();

        return;

      }


      /*
        RESIZE
      */

      let L =
        start.c.x;

      let T =
        start.c.y;

      let R =
        start.c.x +
        start.c.width;

      let B =
        start.c.y +
        start.c.height;


      const h =
        start.h;


      if(
        [0,7,6].includes(h)
      ){

        L =
          start.c.x +
          dx;

      }


      if(
        [2,3,4].includes(h)
      ){

        R =
          start.c.x +
          start.c.width +
          dx;

      }


      if(
        [0,1,2].includes(h)
      ){

        T =
          start.c.y +
          dy;

      }


      if(
        [4,5,6].includes(h)
      ){

        B =
          start.c.y +
          start.c.height +
          dy;

      }


      L =
        Math.max(
          0,
          Math.min(
            L,
            R - 12
          )
        );


      R =
        Math.min(
          c.source.naturalWidth,
          Math.max(
            R,
            L + 12
          )
        );


      T =
        Math.max(
          0,
          Math.min(
            T,
            B - 12
          )
        );


      B =
        Math.min(
          c.source.naturalHeight,
          Math.max(
            B,
            T + 12
          )
        );


      c.x =
        L;

      c.y =
        T;

      c.width =
        R - L;

      c.height =
        B - T;


      drawTemplateCrop();

    }
  );


  const end = e => {

    pointers.delete(
      e.pointerId
    );


    if(
      pointers.size < 2
    ){

      lastDist = 0;

      lastMid = null;

    }


    if(
      !pointers.size
    ){

      mode = null;

      start = null;

    }

  };


  stage.addEventListener(
    "pointerup",
    end
  );


  stage.addEventListener(
    "pointercancel",
    end
  );


  stage.addEventListener(
    "wheel",
    e => {

      e.preventDefault();


      tplZoom(

        (
          state.tplCrop?.zoom ||
          1
        ) +
        (
          e.deltaY < 0
            ? .1
            : -.1
        )

      );

    },
    {
      passive: false
    }
  );

}


/* =====================================================
   FRONT → BACK
===================================================== */

function advanceTemplateSide(){

  /*
    Save current crop first
  */

  storeTplCrop();


  /*
    FRONT
  */

  if(
    state.tplSide === "front"
  ){

    if(
      !state.tplCropStates.front
    ){

      return toast(
        "Create the Front crop first",
        "warn"
      );

    }


    state.tplSide =
      "back";


    syncTemplateSideUI();

    loadTemplateCropPage();


    toast(
      "Now crop the Back side"
    );


    return;
  }


  /*
    BACK
  */

  if(
    !state.tplCropStates.back
  ){

    return toast(
      "Create the Back crop first",
      "warn"
    );

  }


  toast(
    "Back crop added. Now save the template"
  );

}


/* =====================================================
   SAVE TEMPLATE
   NO FIREBASE STORAGE
===================================================== */

async function saveTemplate(){

  /*
    Save current visible crop
  */

  storeTplCrop();


  const name =
    $("#tplName")
      .value
      .trim();


  const front =
    state.tplCropStates.front;


  const back =
    state.tplCropStates.back;


  /*
    Validation
  */

  if(!name){

    return toast(
      "Enter template name",
      "warn"
    );

  }


  if(
    !state.tplFile ||
    !state.tplPdf
  ){

    return toast(
      "Select the source PDF first",
      "warn"
    );

  }


  if(!front){

    return toast(
      "Add Front crop first",
      "warn"
    );

  }


  if(!back){

    return toast(
      "Add Back crop first",
      "warn"
    );

  }


  busy(
    "saveTemplateBtn",
    true
  );


  try{

    /*
      ONLY crop configuration
      is saved to Firestore.

      NO uploadBytes()
      NO getDownloadURL()
      NO Storage
    */

    const data = {

      name,

      frontPage:
        front.page,

      backPage:
        back.page,


      frontCrop: {

        x:
          front.x,

        y:
          front.y,

        w:
          front.w,

        h:
          front.h,

        page:
          front.page,

        pageWidth:
          front.pageWidth,

        pageHeight:
          front.pageHeight,

        ratio:
          front.ratio,

        nx:
          front.nx,

        ny:
          front.ny,

        nw:
          front.nw,

        nh:
          front.nh,

        rotation:
          0

      },


      backCrop: {

        x:
          back.x,

        y:
          back.y,

        w:
          back.w,

        h:
          back.h,

        page:
          back.page,

        pageWidth:
          back.pageWidth,

        pageHeight:
          back.pageHeight,

        ratio:
          back.ratio,

        nx:
          back.nx,

        ny:
          back.ny,

        nw:
          back.nw,

        nh:
          back.nh,

        rotation:
          0

      },


      pageCount:
        state.tplPdf.numPages,


      updatedAt:
        serverTimestamp()

    };


    /*
      UPDATE
    */

    if(
      state.editingTemplateId
    ){

      await updateDoc(

        doc(
          db,
          "templates",
          state.editingTemplateId
        ),

        data

      );

    }


    /*
      CREATE
    */

    else{

      data.createdBy =
        state.user.uid;

      data.createdAt =
        serverTimestamp();


      await addDoc(

        collection(
          db,
          "templates"
        ),

        data

      );

    }


    closeModal(
      "templateModal"
    );


    await loadTemplates();


    renderTemplates();

    renderServices();


    toast(

      state.editingTemplateId
        ? "Template updated successfully"
        : "Template created successfully"

    );


  }catch(e){

    console.error(
      "Template save error:",
      e
    );


    toast(
      e.message ||
        "Template save failed",
      "error"
    );


  }finally{

    busy(
      "saveTemplateBtn",
      false
    );

  }

}


/* =====================================================
   RENDER TEMPLATES
===================================================== */

function renderTemplates(){

  $("#templateList")
    .innerHTML =

      state.templates
        .map(t => `

          <div class="template-row">

            <div>

              <b>
                ${safe(
                  t.name || ""
                )}
              </b>

              <small>
                Front + Back crop configuration
              </small>

            </div>


            <div>

              <b>
                Front page
                ${t.frontPage || 1}
              </b>

              <small>
                Back page
                ${t.backPage || "—"}
              </small>

            </div>


            <div>

              <b>
                ${t.pageCount || 1}
                page${
                  (t.pageCount || 1) > 1
                    ? "s"
                    : ""
                }
              </b>

              <small>
                Reusable Auto Crop
              </small>

            </div>


            <div class="table-actions">

              <button
                class="tiny-btn blue"
                data-template-edit="${t.id}"
              >
                Edit
              </button>


              <button
                class="tiny-btn red"
                data-template-delete="${t.id}"
              >
                Delete
              </button>

            </div>

          </div>

        `)
        .join("")

      ||

        `<div class="empty-state">
          No templates
        </div>`;


  /*
    Edit buttons
  */

  $$(
    "[data-template-edit]"
  )
  .forEach(b => {

    b.onclick = () =>
      editTemplate(
        b.dataset.templateEdit
      );

  });


  /*
    Delete buttons
  */

  $$(
    "[data-template-delete]"
  )
  .forEach(b => {

    b.onclick = () =>
      deleteTemplate(
        b.dataset.templateDelete
      );

  });

}


/* =====================================================
   DELETE TEMPLATE
   NO STORAGE DELETE NEEDED
===================================================== */

async function deleteTemplate(id){

  const t =
    state.templates
      .find(
        x => x.id === id
      );


  if(
    !t ||
    !confirm(
      `Delete template "${
        t.name || ""
      }"?`
    )
  ){

    return;

  }


  try{

    /*
      Only Firestore document
      is deleted.
    */

    await deleteDoc(
      doc(
        db,
        "templates",
        id
      )
    );


    await loadTemplates();


    renderTemplates();

    renderServices();


    toast(
      "Template deleted"
    );


  }catch(e){

    console.error(
      "Delete template error:",
      e
    );


    toast(
      e.message ||
        "Delete failed",
      "error"
    );

  }

}


/* =====================================================
   SHOW PAGE
===================================================== */

function showPage(p){

  $$(".page")
    .forEach(x =>
      x.classList.add(
        "hidden"
      )
    );


  $(
    "#page-" + p
  )
    ?.classList
    .remove("hidden");


  $$(".nav-item")
    .forEach(b =>
      b.classList.toggle(
        "active",
        b.dataset.page === p
      )
    );


  $("#pageTitle")
    .textContent =
      p[0].toUpperCase() +
      p.slice(1);


  $("#sidebar")
    .classList
    .remove("open");

}

/* =====================================================
   V4 ADMIN CONTROL + WALLET / PRICING / REQUEST CENTER
   ===================================================== */
state.moneyRequests=[];state.accountActivationRequests=[];state.refundRequests=[];state.servicePrices=[];state.adminSettings={};state.pendingUserBlockUid=null;

async function loadEnhancementData(){
  try{const [mr,ar,rr,sp,st]=await Promise.all([
    getDocs(query(collection(db,"moneyRequests"),orderBy("createdAt","desc"))),
    getDocs(query(collection(db,"accountActivationRequests"),orderBy("createdAt","desc"))),
    getDocs(collection(db,"servicePricing")),
    getDoc(doc(db,"portalSettings","payments"))
  ]);
  state.moneyRequests=mr.docs.map(d=>({id:d.id,...d.data()}));
  state.accountActivationRequests=ar.docs.map(d=>({id:d.id,...d.data()}));
  state.servicePrices=sp.docs.map(d=>({id:d.id,...d.data()}));
  state.refundRequests=rr.docs.map(d=>({id:d.id,...d.data()}));state.adminSettings=st.exists()?st.data():{};
  if($("#adminUpiId")) $("#adminUpiId").value=state.adminSettings.upiId||"";
  renderEnhancementSections();updatePendingBadges();
  }catch(e){console.warn("Enhancement data",e);renderEnhancementSections();updatePendingBadges()}
}
function getPrice(id){return state.servicePrices.find(x=>x.id===id)||{activationFee:0,usageFee:0}}
function updateBadge(id,n){const e=$("#"+id);if(!e)return;e.textContent=n;e.classList.toggle("hidden",!n)}
function updatePendingBadges(){
 updateBadge("navActivationBadge",state.activations.filter(x=>x.status==="pending").length);
 updateBadge("navMoneyBadge",state.moneyRequests.filter(x=>x.status==="pending").length);
 updateBadge("navAccountBadge",state.accountActivationRequests.filter(x=>x.status==="pending").length);
  updateBadge("navRefundBadge",state.refundRequests.filter(x=>x.status==="pending").length);
 updateBadge("navSupportBadge",Object.values(state.unreadChats||{}).filter(Boolean).length);
}
function renderEnhancementSections(){
 const services=allAdminServices();
 const priceBox=$("#servicePriceList");
 if(priceBox) priceBox.innerHTML=services.map(s=>{const p=getPrice(s.id);return `<div class="price-row"><div class="price-service"><span class="svc-icon">${safe(s.icon||"▣")}</span><div><b>${safe(s.name)}</b><small>${s.builtin?"Built-in":"Custom service"}</small></div></div><label>One-time fee<input type="number" min="0" step="1" data-price-activation="${safe(s.id)}" value="${Number(p.activationFee||0)}"></label><label>Per-use fee<input type="number" min="0" step="1" data-price-usage="${safe(s.id)}" value="${Number(p.usageFee||0)}"></label><button class="tiny-btn blue" data-save-price="${safe(s.id)}">Save</button></div>`}).join("")||'<div class="empty-state">No services</div>';
 $$('[data-save-price]').forEach(b=>b.onclick=()=>saveServicePrice(b.dataset.savePrice));
 const money=$("#moneyRequestList"); if(money) money.innerHTML=state.moneyRequests.map(r=>`<div class="request-row"><div><b>${safe(r.userName||r.uid)}</b><small>₹${Number(r.amount||0)} • UTR ${safe(r.utr||"—")}</small></div><div><span class="pill ${r.status!=="approved"?"off":""}">${safe(r.status||"pending")}</span><small>${dateText(r.createdAt)}</small></div><div>${r.status==="pending"?`<button class="tiny-btn blue" data-money-approve="${r.id}">Accept</button><button class="tiny-btn red" data-money-reject="${r.id}">Reject</button>`:""}</div></div>`).join("")||'<div class="empty-state">No money requests</div>';
 $$('[data-money-approve]').forEach(b=>b.onclick=()=>reviewMoneyRequest(b.dataset.moneyApprove,"approved"));$$('[data-money-reject]').forEach(b=>b.onclick=()=>reviewMoneyRequest(b.dataset.moneyReject,"rejected"));
 const acc=$("#accountActivationList"); if(acc) acc.innerHTML=state.accountActivationRequests.map(r=>`<div class="request-row"><div><b>${safe(r.userName||r.uid)}</b><small>Activation fee ₹${Number(r.amount||0)} • UPI UTR ${safe(r.utr||"—")}</small></div><div><span class="pill ${r.status!=="approved"?"off":""}">${safe(r.status||"pending")}</span><small>${dateText(r.createdAt)}</small></div><div>${r.status==="pending"?`<button class="tiny-btn blue" data-account-approve="${r.id}">Accept</button><button class="tiny-btn red" data-account-reject="${r.id}">Reject</button>`:""}</div></div>`).join("")||'<div class="empty-state">No account activation requests</div>';
 $$('[data-account-approve]').forEach(b=>b.onclick=()=>reviewAccountActivation(b.dataset.accountApprove,"approved"));$$('[data-account-reject]').forEach(b=>b.onclick=()=>reviewAccountActivation(b.dataset.accountReject,"rejected"));
 const rf=$("#refundRequestList"); if(rf) rf.innerHTML=state.refundRequests.map(r=>`<div class="request-row"><div><b>${safe(r.userName||r.uid)}</b><small>${money(r.amount||0)} • ${safe(r.reason||"Automatic refund failed")}</small><small>${r.items?.map(x=>safe(x.serviceName)+` (${money(x.amount)})`).join(" • ")||""}</small></div><div><span class="pill ${r.status!=="approved"?"off":""}">${safe(r.status||"pending")}</span><small>${dateText(r.createdAt)}</small></div><div>${r.status==="pending"?`<button class="tiny-btn blue" data-refund-approve="${r.id}">Refund</button><button class="tiny-btn red" data-refund-reject="${r.id}">Reject</button>`:""}</div></div>`).join("")||'<div class="empty-state">No refund requests</div>';
 $$('[data-refund-approve]').forEach(b=>b.onclick=()=>reviewRefundRequest(b.dataset.refundApprove,"approved"));
 $$('[data-refund-reject]').forEach(b=>b.onclick=()=>reviewRefundRequest(b.dataset.refundReject,"rejected"));
  const sf=$("#supportFullList"); if(sf) sf.innerHTML=state.users.map(u=>{const unread=!!state.unreadChats[u.id];return `<div class="support-row"><div><b>${safe(u.name||"User")}</b><small>@${safe(u.username||"—")}</small></div><span class="support-unread ${unread?"show":""}">${unread?"New":""}</span><button class="tiny-btn blue" data-support-open="${u.id}">Open</button></div>`}).join("")||'<div class="empty-state">No users</div>';
 $$('[data-support-open]').forEach(b=>b.onclick=()=>openUserChat(b.dataset.supportOpen));
}
function dateText(v){try{return v?.toDate?v.toDate().toLocaleString():v?new Date(v).toLocaleString():""}catch{return ""}}
async function saveServicePrice(id){const a=Number($(`[data-price-activation="${id}"]`)?.value||0),u=Number($(`[data-price-usage="${id}"]`)?.value||0);if(a<0||u<0)return toast("Fee cannot be negative","warn");try{await setDoc(doc(db,"servicePricing",id),{serviceId:id,activationFee:a,usageFee:u,updatedAt:serverTimestamp(),updatedBy:state.user.uid},{merge:true});const old=state.servicePrices.find(x=>x.id===id);if(old)Object.assign(old,{activationFee:a,usageFee:u});else state.servicePrices.push({id,activationFee:a,usageFee:u});toast("Service price saved");renderEnhancementSections()}catch(e){toast(e.message||"Price save failed","error")}}
async function saveAdminUpi(){const upi=$("#adminUpiId").value.trim();if(!upi)return toast("Enter UPI ID","warn");try{await setDoc(doc(db,"portalSettings","payments"),{upiId:upi,updatedAt:serverTimestamp(),updatedBy:state.user.uid},{merge:true});state.adminSettings.upiId=upi;toast("UPI ID saved")}catch(e){toast(e.message||"UPI save failed","error")}}
async function reviewMoneyRequest(id,status){const r=state.moneyRequests.find(x=>x.id===id);if(!r||r.status!=="pending")return;try{if(status==="approved"){await runTransaction(db,async tx=>{const rr=doc(db,"moneyRequests",id),snap=await tx.get(rr);if(!snap.exists()||snap.data().status!=="pending")throw Error("Request already reviewed");const uref=doc(db,"users",r.uid),us=await tx.get(uref);const bal=Number(us.data()?.walletBalance||0),amt=Number(r.amount||0);tx.update(uref,{walletBalance:bal+amt,updatedAt:serverTimestamp()});tx.update(rr,{status:"approved",reviewedAt:serverTimestamp(),reviewedBy:state.user.uid});const tr=doc(collection(db,"users",r.uid,"transactions"));tx.set(tr,{type:"wallet_topup",amount:amt,status:"approved",reference:id,createdAt:serverTimestamp(),description:"Wallet money added"});const n=doc(collection(db,"users",r.uid,"notifications"));tx.set(n,{title:"Money request approved",message:`₹${amt} has been added to your wallet.`,type:"money",status:"approved",read:false,createdAt:serverTimestamp()})});}else{await updateDoc(doc(db,"moneyRequests",id),{status:"rejected",reviewedAt:serverTimestamp(),reviewedBy:state.user.uid});await addDoc(collection(db,"users",r.uid,"notifications"),{title:"Money request rejected",message:`Your ₹${Number(r.amount||0)} wallet request was rejected.`,type:"money",status:"rejected",read:false,createdAt:serverTimestamp()})}await loadEnhancementData();toast(status==="approved"?"Money added to wallet":"Money request rejected")}catch(e){toast(e.message||"Request review failed","error")}}
async function reviewRefundRequest(id,status){const r=state.refundRequests.find(x=>x.id===id);if(!r||r.status!=="pending")return;try{if(status==="approved"){await runTransaction(db,async tx=>{const rr=doc(db,"refundRequests",id),rs=await tx.get(rr);if(!rs.exists()||rs.data().status!=="pending")throw Error("Refund request already reviewed");const uref=doc(db,"users",r.uid),us=await tx.get(uref);const refs=(r.items||[]).map(x=>doc(db,"users",r.uid,"transactions",x.transactionId));const snaps=await Promise.all(refs.map(x=>tx.get(x)));let refund=0;for(let i=0;i<snaps.length;i++){if(snaps[i].exists()&&snaps[i].data()?.status==="pending"){refund+=Number(r.items[i].amount||0);tx.update(refs[i],{status:"refunded",description:`${r.items[i].serviceName} usage fee refunded by admin`,refundedAt:serverTimestamp()})}}if(refund<=0)refund=Number(r.amount||0);tx.update(uref,{walletBalance:Number(us.data()?.walletBalance||0)+refund,updatedAt:serverTimestamp()});tx.update(rr,{status:"approved",refundedAmount:refund,reviewedAt:serverTimestamp(),reviewedBy:state.user.uid});tx.set(doc(collection(db,"users",r.uid,"notifications")),{title:"Refund approved",message:`${money(refund)} has been refunded to your wallet by admin.`,type:"refund",status:"approved",read:false,createdAt:serverTimestamp()})});}else{await updateDoc(doc(db,"refundRequests",id),{status:"rejected",reviewedAt:serverTimestamp(),reviewedBy:state.user.uid});await addDoc(collection(db,"users",r.uid,"notifications"),{title:"Refund request rejected",message:`Your ${money(r.amount||0)} refund request was rejected by admin.`,type:"refund",status:"rejected",read:false,createdAt:serverTimestamp()})}await loadEnhancementData();toast(status==="approved"?"Refund completed":"Refund request rejected")}catch(e){toast(e.message||"Refund review failed","error")}}
async function reviewAccountActivation(id,status){const r=state.accountActivationRequests.find(x=>x.id===id);if(!r||r.status!=="pending")return;try{await updateDoc(doc(db,"accountActivationRequests",id),{status,reviewedAt:serverTimestamp(),reviewedBy:state.user.uid});if(status==="approved"){await updateDoc(doc(db,"users",r.uid),{status:"active",updatedAt:serverTimestamp()});await addDoc(collection(db,"users",r.uid,"transactions"),{type:"account_activation",amount:Number(r.amount||0),status:"approved",reference:id,createdAt:serverTimestamp(),description:"Account activated by UPI"});await addDoc(collection(db,"users",r.uid,"notifications"),{title:"Account activated",message:"Your account activation request was approved.",type:"account",status:"approved",read:false,createdAt:serverTimestamp()})}else await addDoc(collection(db,"users",r.uid,"notifications"),{title:"Account activation rejected",message:"Your account activation request was rejected.",type:"account",status:"rejected",read:false,createdAt:serverTimestamp()});await loadUsers();await loadEnhancementData();toast(status==="approved"?"Account activated":"Account activation rejected")}catch(e){toast(e.message||"Account activation review failed","error")}}

// Replace user blocking with activation-fee prompt
async function toggleUserBlockV4(uid){const u=state.users.find(x=>x.id===uid);if(!u)return;const blocked=u.status==="blocked";if(blocked){try{await updateDoc(doc(db,"users",uid),{status:"active",activationFee:0,updatedAt:serverTimestamp()});u.status="active";renderUsers();renderEnhancementSections();toast("User activated")}catch(e){toast(e.message||"User status update failed","error")}return}state.pendingUserBlockUid=uid;$("#blockActivationFee").value="0";openModal("blockUserModal")}
async function confirmBlockUserV4(){const uid=state.pendingUserBlockUid;if(!uid)return;const fee=Math.max(0,Number($("#blockActivationFee").value||0));const u=state.users.find(x=>x.id===uid);try{await updateDoc(doc(db,"users",uid),{status:"blocked",activationFee:fee,updatedAt:serverTimestamp()});if(u){u.status="blocked";u.activationFee=fee}closeModal("blockUserModal");renderUsers();renderEnhancementSections();await addDoc(collection(db,"users",uid,"notifications"),{title:"Account deactivated",message:`Your account was deactivated by administrator. Activation fee: ₹${fee}.`,type:"account",status:"blocked",read:false,createdAt:serverTimestamp()});toast("User deactivated") }catch(e){toast(e.message||"Could not deactivate user","error")}}

async function openUserServiceAccessV4(uid){const u=state.users.find(x=>x.id===uid);if(!u)return;$("#userServiceAccessTitle").textContent=`Service Access • ${u.name||"User"}`;const refs=allAdminServices();const docs={};try{const q=await getDocs(collection(db,"activations",uid));q.forEach(d=>docs[d.id]=d.data())}catch{}const box=$("#userServiceAccessList");box.innerHTML=refs.map(s=>{const a=docs[s.id];const active=a?.status==="approved"&&a?.enabled!==false;const price=getPrice(s.id);return `<div class="user-access-row"><div><b>${safe(s.name)}</b><small>One-time ₹${Number(price.activationFee||0)} • Per use ₹${Number(price.usageFee||0)}</small></div><span class="pill ${active?"":"off"}">${active?"Active":"Inactive"}</span><button class="tiny-btn ${active?"red":"blue"}" data-direct-access="${safe(s.id)}" data-active="${active}">${active?"Deactivate":"Activate"}</button></div>`}).join("");$$('[data-direct-access]').forEach(b=>b.onclick=()=>directServiceAccess(uid,b.dataset.directAccess,b.dataset.active==="true")) ;openModal("userServiceAccessModal")}
async function directServiceAccess(uid,sid,active){try{await setDoc(doc(db,"activations",uid,sid),{status:active?"disabled":"approved",enabled:!active,updatedAt:serverTimestamp(),approvedBy:state.user.uid,source:"admin_direct"},{merge:true});await addDoc(collection(db,"users",uid,"notifications"),{title:active?"Service deactivated":"Service activated",message:`${allAdminServices().find(s=>s.id===sid)?.name||"Service"} was ${active?"deactivated":"activated"} by administrator.`,type:"service",status:active?"disabled":"approved",read:false,createdAt:serverTimestamp()});await openUserServiceAccessV4(uid);toast(active?"Service deactivated":"Service activated")}catch(e){toast(e.message||"Service access update failed","error")}}

// User detail with direct access control
async function openUserDetailV4(uid){const u=state.users.find(x=>x.id===uid);if(!u)return;const acts=state.activations.filter(a=>a.uid===uid);let approved={};try{const q=await getDocs(collection(db,"activations",uid));q.forEach(d=>approved[d.id]=d.data())}catch{};const services=allAdminServices();$("#userDetailTitle").textContent=u.name||"User";$("#userDetailBody").innerHTML=`<div class="detail-grid"><div><b>Username</b><span>@${safe(u.username||"—")}</span></div><div><b>Mobile</b><span>${safe(u.mobile||"—")}</span></div><div><b>Email</b><span>${safe(u.email||"—")}</span></div><div><b>Account</b><span>${safe(u.status||"active")}${u.status==="blocked"?` • Fee ₹${Number(u.activationFee||0)}`:""}</span></div><div><b>Wallet</b><span>₹${Number(u.walletBalance||0)}</span></div></div><div class="detail-actions"><button class="primary-btn" id="manageUserServicesBtn">Manage all services</button></div><h4>Services</h4>${services.map(s=>{const a=approved[s.id]||acts.find(x=>x.serviceId===s.id);const st=a?.status||"Not activated";return `<div class="detail-service"><div><b>${safe(s.name)}</b><small>Access: ${safe(s.access||"open")}</small></div><span class="pill ${st!=="approved"&&st!=="active"?"off":""}">${safe(st)}</span></div>`}).join("")}`;$("#manageUserServicesBtn").onclick=()=>{closeModal("userDetailModal");openUserServiceAccessV4(uid)};openModal("userDetailModal")}

// Activation review with notifications
async function changeActivationV4(id,status){const a=state.activations.find(x=>x.id===id);if(!a)return;try{await updateDoc(doc(db,"activationRequests",id),{status,reviewedAt:serverTimestamp(),reviewedBy:state.user.uid});await setDoc(doc(db,"activations",a.uid,a.serviceId),{status,enabled:status==="approved",updatedAt:serverTimestamp(),approvedBy:status==="approved"?state.user.uid:null},{merge:true});if(status==="approved"&&Number(a.amount||0)>0){await addDoc(collection(db,"users",a.uid,"transactions"),{type:"service_activation",amount:Number(a.amount||0),status:"approved",reference:id,createdAt:serverTimestamp(),description:`${a.serviceName||a.serviceId} one-time activation fee via UPI`})}await addDoc(collection(db,"users",a.uid,"notifications"),{title:status==="approved"?"Service request approved":"Service request rejected",message:`${a.serviceName||a.serviceId} request was ${status}.`,type:"service",status,read:false,createdAt:serverTimestamp()});await loadActivations();renderDashboard();updatePendingBadges();toast(status==="approved"?"Activation approved":"Activation rejected")}catch(e){toast(e.message||"Activation update failed","error")}}

// Preserve existing chat functions but support service-specific chat sessions.
let activeSupportServiceId=null;
function openSupportServicePicker(){if(!state.user)return openModal("authModal");const list=$("#servicePickerList");list.innerHTML=state.services.map(s=>`<button class="service-picker-item" data-chat-service="${safe(s.id)}"><span>${safe(s.icon||"▣")}</span><div><b>${safe(s.name)}</b><small>Start support for this service</small></div>›</button>`).join("")||'<div class="empty-state">No services</div>';$$('[data-chat-service]').forEach(b=>b.onclick=()=>startServiceChat(b.dataset.chatService));openModal("servicePickerModal")}
async function startServiceChat(sid){activeSupportServiceId=sid;const s=state.services.find(x=>x.id===sid);closeModal("servicePickerModal");await setDoc(doc(db,"chats",state.user.uid),{status:"open",serviceId:sid,serviceName:s?.name||"Service",updatedAt:serverTimestamp(),updatedBy:state.user.uid},{merge:true});openUserChatV4()}
async function openUserChatV4(){if(!state.user){openModal("authModal");return}const root=await getDoc(doc(db,"chats",state.user.uid));activeSupportServiceId=activeSupportServiceId||root.data()?.serviceId||null;$("#chatTopic").textContent=root.data()?.serviceName||"General support";$("#newChatBtn").onclick=openSupportServicePicker;$("#closeChatBtn").onclick=closeUserSupport;openModal("chatModal");state.chatUnsub?.();state.chatUnsub=onSnapshot(query(collection(db,"chats",state.user.uid,"messages"),orderBy("createdAt","asc")),snap=>{els.chatMessages.innerHTML="";snap.forEach(d=>{const m=d.data();const r=document.createElement("div");r.className=`chat-bubble ${m.senderRole==="user"?"mine":"theirs"}`;r.textContent=(m.serviceName?`[${m.serviceName}] `:"")+m.text;els.chatMessages.appendChild(r)});els.chatMessages.scrollTop=els.chatMessages.scrollHeight});}
async function sendUserChatV4(){if(!state.user)return;const text=els.chatInput.value.trim();if(!text)return;const root=await getDoc(doc(db,"chats",state.user.uid));if(root.exists()&&root.data().status==="closed")return toast("This chat is closed. Start a new service chat.","warn");const sid=activeSupportServiceId||root.data()?.serviceId||null;const svc=state.services.find(x=>x.id===sid);busy("sendChatBtn",true);try{await addDoc(collection(db,"chats",state.user.uid,"messages"),{text,senderUid:state.user.uid,senderRole:"user",serviceId:sid,serviceName:svc?.name||root.data()?.serviceName||"General support",createdAt:serverTimestamp()});await setDoc(doc(db,"chats",state.user.uid),{status:"open",serviceId:sid,serviceName:svc?.name||root.data()?.serviceName||"General support",updatedAt:serverTimestamp()},{merge:true});els.chatInput.value=""}catch(e){toast(e.message||"Message could not be sent","error")}finally{busy("sendChatBtn",false)}}
async function closeUserSupport(){if(!state.user)return;try{await setDoc(doc(db,"chats",state.user.uid),{status:"closed",closedAt:serverTimestamp(),closedBy:state.user.uid},{merge:true});closeModal("chatModal");toast("Chat closed")}catch(e){toast(e.message||"Could not close chat","error")}}

// Rebind enhanced handlers and refresh after existing boot data.
const _baseRefreshAllV4=refreshAll; refreshAll=async function(){await _baseRefreshAllV4();await loadEnhancementData();renderEnhancementSections();updatePendingBadges()};
// V4 handlers are bound directly; do not assign undeclared module variables.
window.addEventListener("DOMContentLoaded",()=>{
  $("#saveUpiBtn")?.addEventListener("click",saveAdminUpi);$("#confirmBlockBtn")?.addEventListener("click",confirmBlockUserV4);
  $("#newChatBtn")?.addEventListener("click",openSupportServicePicker);$("#closeChatBtn")?.addEventListener("click",closeUserSupport);
  $("#chatBtn")?.addEventListener("click",openUserChatV4);$("#sendChatBtn")?.addEventListener("click",sendUserChatV4);
});

/* V4 finishing hooks */
function renderUsersV4(){const q=$("#userSearch").value.toLowerCase(),list=state.users.filter(u=>[u.name,u.username,u.email,u.mobile,u.id].some(v=>String(v||"").toLowerCase().includes(q))).sort((a,b)=>Number(b.usageCount||0)-Number(a.usageCount||0));$("#userList").innerHTML=list.map(u=>{const blocked=u.status==="blocked",unread=!!state.unreadChats[u.id];return `<div class="user-row"><div><b>${safe(u.name||"—")}</b><small>@${safe(u.username||"—")}</small></div><div><b>${safe(u.email||"—")}</b><small>${safe(u.mobile||"—")}</small></div><div><span class="pill ${blocked?"off":""}">${blocked?"Blocked":safe(u.status||"active")}</span><small>Wallet ₹${Number(u.walletBalance||0)} • Used ${Number(u.usageCount||0)} time${Number(u.usageCount||0)===1?"":"s"}${blocked?` • Fee ₹${Number(u.activationFee||0)}`:""}</small></div><div class="table-actions"><button class="tiny-btn blue" data-detail-user="${u.id}">View</button><button class="tiny-btn blue" data-access-user="${u.id}">Services</button><button class="tiny-btn blue" data-chat-user="${u.id}">💬 Chat ${unread?"🔴":""}</button><button class="tiny-btn ${blocked?"blue":"red"}" data-block-user="${u.id}">${blocked?"Activate account":"Deactivate"}</button></div></div>`}).join("")||"<div class=empty-state>No users</div>";$$('[data-detail-user]').forEach(b=>b.onclick=()=>openUserDetailV4(b.dataset.detailUser));$$('[data-access-user]').forEach(b=>b.onclick=()=>openUserServiceAccessV4(b.dataset.accessUser));$$('[data-chat-user]').forEach(b=>b.onclick=()=>openUserChat(b.dataset.chatUser));$$('[data-block-user]').forEach(b=>b.onclick=()=>toggleUserBlockV4(b.dataset.blockUser))}
renderUsers=renderUsersV4;
async function closeAdminChatV4(){if(!activeChatUid)return;try{await setDoc(doc(db,"chats",activeChatUid),{status:"closed",closedAt:serverTimestamp(),closedBy:state.user.uid},{merge:true});closeModal("userChatModal");toast("Chat closed")}catch(e){toast(e.message||"Could not close chat","error")}}
window.addEventListener("DOMContentLoaded",()=>{$("#adminCloseChatBtn")?.addEventListener("click",closeAdminChatV4);$("#userSearch")?.addEventListener("input",renderUsersV4)});

/* PRINT PORTAL FIX PACK 2026-09: reliable refunds, pricing and chat sessions */
(function(){
 const esc=v=>safe(v);
 async function loadChatSessions(uid){try{const q=await getDocs(query(collection(db,"chatSessions",uid,"sessions"),orderBy("createdAt","desc"),limit(100)));return q.docs.map(d=>({id:d.id,...d.data()}))}catch{return[]}}
 async function renderSupportV5(){const sf=$("#supportFullList");if(!sf)return;const rows=[];for(const u of state.users){const ss=await loadChatSessions(u.id);for(const c of ss)rows.push({...c,uid:u.id,userName:u.name||"User",username:u.username||""})}const active=rows.filter(x=>x.status!=="closed");const closed=rows.filter(x=>x.status==="closed");sf.innerHTML=`<div class="chat-history-wrap"><div class="panel-head"><h3>Active Chats</h3><span class="pill">${active.length}</span></div>${active.map(c=>`<div class="support-row"><div><b>${esc(c.userName)}</b><small>${esc(c.serviceName||c.topic||"General support")}</small></div><button class="tiny-btn blue" data-v5-open="${c.uid}" data-v5-session="${c.id}">Open</button></div>`).join("")||'<div class="empty-state">No active chats</div>'}<div class="panel-head" style="margin-top:18px"><h3>Chat History</h3><span class="pill">${closed.length}</span></div>${closed.map(c=>`<div class="support-row"><div><b>${esc(c.userName)}</b><small>${esc(c.serviceName||c.topic||"General support")} • Closed</small></div><button class="tiny-btn" data-v5-continue="${c.uid}" data-v5-session="${c.id}">Continue</button></div>`).join("")||'<div class="empty-state">No closed chats</div>'}</div>`;$$('[data-v5-open]').forEach(b=>b.onclick=()=>openUserChatV5(b.dataset.v5Open,b.dataset.v5Session));$$('[data-v5-continue]').forEach(b=>b.onclick=()=>continueUserChatV5(b.dataset.v5Continue,b.dataset.v5Session))}
 async function openUserChatV5(uid,sid){const u=state.users.find(x=>x.id===uid);if(!u)return;activeChatUid=uid;window.__ppAdminSession=sid;await updateUnreadAsRead(uid);$("#chatUserName").textContent=u.name||"User";$("#chatUserMeta").textContent=`@${u.username||"—"} • ${u.mobile||"—"} • ${u.email||"—"}`;$("#chatUserAvatar").textContent=(u.name||"U")[0].toUpperCase();$("#adminChatInput").value="";openModal("userChatModal");let pin=document.getElementById("adminChatPinnedContext");if(!pin){pin=document.createElement("div");pin.id="adminChatPinnedContext";pin.style.cssText="padding:10px 12px;margin:0 0 10px;background:var(--card,#fff);border:1px solid var(--border,#e5e7eb);border-radius:12px;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.06)";document.getElementById("adminChatMessages")?.parentElement?.insertBefore(pin,document.getElementById("adminChatMessages"))}try{if(sid){const sd=await getDoc(doc(db,"chatSessions",uid,"sessions",sid));const c=sd.data()||{};const tx=c.transaction||{};pin.innerHTML=c.topicType==="wallet"?`<b>📌 Selected Wallet Transaction</b><br>₹${Number(tx.amount||0)} • ${esc(tx.description||tx.type||"Transaction")} • ${esc(tx.status||"")}<br><small>ID: ${esc(tx.id||c.transactionId||"—")}</small>`:`<b>📌 Selected Service</b><br>${esc(c.serviceName||"General Support")}`}}catch{}adminChatUnsub?.();let ref=sid?collection(db,"chatSessions",uid,"sessions",sid,"messages"):collection(db,"chats",uid,"messages");adminChatUnsub=onSnapshot(query(ref,orderBy("createdAt","asc")),snap=>{const box=$("#adminChatMessages");box.innerHTML="";snap.forEach(d=>{const m=d.data(),r=document.createElement("div");r.className=`chat-bubble ${m.senderRole==="admin"?"mine":"theirs"}`;r.textContent=m.text||"";box.appendChild(r)});box.scrollTop=box.scrollHeight})}
 async function continueUserChatV5(uid,sid){try{await updateDoc(doc(db,"chatSessions",uid,"sessions",sid),{status:"open",reopenedAt:serverTimestamp()})}catch{}await openUserChatV5(uid,sid);await renderSupportV5()}
 async function closeAdminChatV5(){const uid=activeChatUid,sid=window.__ppAdminSession;if(!uid)return;if(sid){try{await updateDoc(doc(db,"chatSessions",uid,"sessions",sid),{status:"closed",closedAt:serverTimestamp(),closedBy:state.user.uid})}catch(e){toast(e.message||"Chat could not be closed","error")}}else{try{await setDoc(doc(db,"chats",uid),{status:"closed",closedAt:serverTimestamp(),closedBy:state.user.uid},{merge:true})}catch{}}adminChatUnsub?.();adminChatUnsub=null;window.__ppAdminSession=null;closeModal("userChatModal");await renderSupportV5()}
 async function sendAdminChatV5(){if(!activeChatUid||!state.user)return;const text=$("#adminChatInput").value.trim();if(!text)return;const sid=window.__ppAdminSession;if(!sid)return toast("Open an active chat first","warn");try{await addDoc(collection(db,"chatSessions",activeChatUid,"sessions",sid,"messages"),{text,senderUid:state.user.uid,senderRole:"admin",createdAt:serverTimestamp()});$("#adminChatInput").value=""}catch(e){toast(e.message||"Message could not be sent","error")}}
 window.openUserChatV5=openUserChatV5;window.sendAdminChatV5=sendAdminChatV5;window.renderSupportV5=renderSupportV5;openUserChat=openUserChatV5;
 window.addEventListener("DOMContentLoaded",()=>{ $("#adminCloseChatBtn")?.addEventListener("click",closeAdminChatV5); });
 const oldLoad=loadUsers; loadUsers=async function(){await oldLoad();setTimeout(()=>renderSupportV5(),50)};
 const oldRefresh=refreshAll; refreshAll=async function(){await oldRefresh();renderEnhancementSections();renderDashboard();setTimeout(()=>renderSupportV5(),50)};
})();
