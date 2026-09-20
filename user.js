/* Print Portal V3 — new crop engine. UI/IDs remain compatible with the existing design. */
import {auth,db,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,sendPasswordResetEmail,signOut,updateProfile,collection,doc,addDoc,setDoc,updateDoc,getDoc,getDocs,query,where,orderBy,limit,onSnapshot,serverTimestamp,runTransaction} from "./firebase.js";
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const state={user:null,profile:null,services:[],servicePrices:[],workflow:null,crop:null,cropTarget:null,pdfCache:new WeakMap(),pdfTasks:new Map(),chatUnsub:null,localKeys:["pp_recent_jobs_v2"],pendingUsageCharges:[]};
const els={}; const recentKey="pp_recent_jobs_v2";
const id=()=>globalThis.crypto?.randomUUID?.()||`pp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const norm=v=>String(v||"").trim().toLowerCase().replace(/\s+/g,"");
const safe=v=>String(v??"").replace(/[<>]/g,"");
const toast=(msg,type="success")=>{const d=document.createElement("div");d.className=`toast ${type}`;d.textContent=msg;els.toastHost.appendChild(d);setTimeout(()=>d.remove(),3200)};
function busy(x,on){const b=$("#"+x);if(!b)return;b.disabled=on;b.dataset.old=b.dataset.old||b.textContent;b.textContent=on?"Processing…":b.dataset.old}
function openModal(id){$("#"+id)?.classList.remove("hidden");document.body.classList.add("modal-open")}
function closeModal(id){if(id==="serviceModal"&&state.pendingUsageCharges?.length){refundPendingUsageCharge().catch(()=>{})}$("#"+id)?.classList.add("hidden");if(!$$('.modal:not(.hidden)').length)document.body.classList.remove("modal-open")}
function loadImage(src){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error("Image could not be loaded"));i.src=src})}
function downloadData(url,name){const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove()}

const PDFJS_VERSION="4.4.168",PDFJS_URL=`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.mjs`,PDFJS_WORKER_URL=`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.mjs`;
let pdfJsPromise=null;
async function getPdfJs(){if(!pdfJsPromise)pdfJsPromise=import(PDFJS_URL).then(m=>{if(!m?.getDocument)throw Error("PDF.js failed to load");if(m.GlobalWorkerOptions)m.GlobalWorkerOptions.workerSrc=PDFJS_WORKER_URL;return m}).catch(e=>(pdfJsPromise=null,Promise.reject(e)));return pdfJsPromise}
function authMessage(e){return(e?.message||"Operation failed").replace(/^Firebase:\s*/i,"").replace(/\s*\(auth\/[^)]+\)\.?/i,"")}

window.addEventListener("DOMContentLoaded",()=>{Object.assign(els,{serviceScroller:$("#serviceScroller"),recentJobs:$("#recentJobs"),personCards:$("#personCards"),a4Preview:$("#a4Preview"),toastHost:$("#toastHost"),hiddenFileInput:$("#hiddenFileInput"),cropCanvas:$("#cropCanvas"),cropBox:$("#cropBox"),cropStage:$("#cropStage"),chatMessages:$("#chatMessages"),chatInput:$("#chatInput")});bindUI();renderRecentJobs();onAuthStateChanged(auth,async u=>{state.user=u;if(u){await loadProfile(u.uid);await loadPortalData();await loadRecentJobs();if(state.profile?.status==="blocked"){await loadPortalData();showBlockedAccountModal();return}}else {state.profile=null;renderRecentJobs()}updateHeader();await loadServices()})});
function bindUI(){
 $("#notificationBtn")?.addEventListener("click",openNotifications);$("#menuBtn")?.addEventListener("click",openMainMenu);
 $("#showSignup")?.addEventListener("click",()=>toggleAuth(true));$("#showLogin")?.addEventListener("click",()=>toggleAuth(false));$("#loginBtn")?.addEventListener("click",login);$("#signupBtn")?.addEventListener("click",signup);$("#forgotBtn")?.addEventListener("click",forgotPassword);
 $$(".recovery-tab").forEach(b=>b.addEventListener("click",()=>switchRecovery(b.dataset.recoveryTab)));$("#manualVerifyBtn")?.addEventListener("click",manualRecovery);$("#emailResetBtn")?.addEventListener("click",emailReset);
 $("#chatBtn")?.addEventListener("click",()=>window.openUserChatV5?.());$("#chatInput")?.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();window.sendUserChatV5?.()}});$("#logoutBtn")?.addEventListener("click",logoutUser);
 $("#closeProfileBtn")?.addEventListener("click",()=>closeModal("profileModal"));$("#bottomProfile")?.addEventListener("click",openProfile);$("#bottomJobs")?.addEventListener("click",()=>$(".recent-section")?.scrollIntoView({behavior:"smooth"}));$("#bottomServices")?.addEventListener("click",()=>openSectionFull("services"));$("#allServicesBtn")?.addEventListener("click",()=>openSectionFull("services"));$("#allToolsBtn")?.addEventListener("click",()=>openSectionFull("tools"));
 $$(".quick-card").forEach(b=>b.addEventListener("click",()=>openServiceByType(b.dataset.action)));$$(".tool-card").forEach(b=>b.addEventListener("click",()=>openTool(b.dataset.tool)));
 $("#addPersonBtn")?.addEventListener("click",()=>{});$("#toPreviewBtn")?.addEventListener("click",prepareFinalPreview);$("#previewBackBtn")?.addEventListener("click",()=>setStep("upload"));$("#previewDownloadBtn")?.addEventListener("click",showExportChoices);$("#previewPrintBtn")?.addEventListener("click",printCurrentLayout);$("#cutMarks")?.addEventListener("change",renderA4Preview);
$("#foldingLine")?.addEventListener("change",renderA4Preview);$("#cancelServiceBtn")?.addEventListener("click",()=>closeModal("serviceModal"));
 $("#cropApply")?.addEventListener("click",applyCrop);$("#cropFullscreenAdd")?.addEventListener("click",applyCrop);$("#cropCancel")?.addEventListener("click",()=>{closeCropModal();closeModal("cropModal")});$("#cropFullscreenBtn")?.addEventListener("click",toggleCropFullscreen);$("#cropFullscreenZoomOut")?.addEventListener("click",toggleCropFullscreen);$("#cropFullscreenPerspective")?.addEventListener("click",togglePerspectiveCrop);$("#cropPerspectiveBtn")?.addEventListener("click",togglePerspectiveCrop);$("#cropReset")?.addEventListener("click",resetCrop);$("#zoomIn")?.addEventListener("click",()=>setCropZoom((state.crop?.zoom||1)+.15));$("#zoomOut")?.addEventListener("click",()=>setCropZoom((state.crop?.zoom||1)-.15));$("#rotateLeft")?.addEventListener("click",()=>setCropRotation((state.crop?.rotation||0)-5));$("#rotateRight")?.addEventListener("click",()=>setCropRotation((state.crop?.rotation||0)+5));$("#rotateSlider")?.addEventListener("input",e=>setCropRotation(+e.target.value));$("#cropMode")?.addEventListener("change",syncCropRatio);
 $("#passwordCancel")?.addEventListener("click",()=>{state.passwordReject?.(Object.assign(Error("PDF operation cancelled"),{code:"PDF_CANCELLED"}));state.passwordReject=null;closeModal("passwordModal")});$("#passwordSubmit")?.addEventListener("click",()=>{const v=$("#pdfPassword")?.value||"";if(!v){$("#passwordError").textContent="Enter password";return}const r=state.passwordResolve;state.passwordResolve=null;state.passwordReject=null;closeModal("passwordModal");r?.(v)});
 $$(".modal-close").forEach(b=>b.addEventListener("click",()=>closeModal(b.dataset.close)));document.addEventListener("keydown",e=>{if(e.key==="Escape"){const cm=$("#cropModal");if(cm?.classList.contains("crop-fullscreen")){cm.classList.remove("crop-fullscreen");state.crop.boxW=null;state.crop.boxH=null;state.crop.boxX=null;state.crop.boxY=null;requestAnimationFrame(drawCropStage);return}$$('.modal:not(.hidden)').forEach(m=>closeModal(m.id))}});bindCropGestures();
}
async function loadProfile(uid){try{const s=await getDoc(doc(db,"users",uid));state.profile=s.exists()?s.data():null}catch{state.profile=null}}
async function loadServices(){try{const [ss,bs,ps,pricing]=await Promise.all([getDocs(query(collection(db,"services"),where("enabled","==",true))),getDoc(doc(db,"serviceSettings","pvc")),getDoc(doc(db,"serviceSettings","passport")),getDocs(collection(db,"servicePricing"))]);const normal=ss.docs.map(d=>({id:d.id,...d.data()}));const pvc={id:"builtin-pvc",name:"PVC Card Print",description:"Manual PVC card crop • front/back",icon:"▣",templateType:"pvc",access:"open",enabled:true,front:true,back:true,builtin:true,...(bs.exists()?bs.data():{})};const passport={id:"builtin-passport",name:"Passport Photo",description:"Manual passport photo crop • free ratio",icon:"▦",templateType:"passport",access:"open",enabled:true,builtin:true,...(ps.exists()?ps.data():{})};state.services=[pvc,passport,...normal].filter(x=>x.enabled!==false);state.servicePrices=pricing.docs.map(d=>({id:d.id,...d.data()}));renderServices()}catch(e){console.warn("Services",e);state.services=[];state.servicePrices=[];els.serviceScroller.innerHTML='<div class="empty-state"><b>No services available</b><small>Services could not be loaded.</small></div>'}}
function renderServices(){els.serviceScroller.innerHTML="";state.services.forEach(s=>{const b=document.createElement("button");b.className="service-card";const p=state.servicePrices?.find(x=>x.id===s.id)||{};const one=Number(p.activationFee||0),use=Number(p.usageFee||0);let priceText="Free";if(one>0&&use>0)priceText=`Activation ${money(one)} • Use ${money(use)}`;else if(one>0)priceText=`Activation ${money(one)}`;else if(use>0)priceText=`Per use ${money(use)}`;b.innerHTML=`<span class="svc-icon">${safe(s.icon||"▣")}</span><b>${safe(s.name||"Service")}</b><small>${safe(s.description||"Document print service")}</small><strong class="service-price">${safe(priceText)}</strong><i>›</i>`;b.addEventListener("click",()=>openService(s));els.serviceScroller.appendChild(b)});if(!state.services.length)els.serviceScroller.innerHTML='<div class="empty-state"><b>No services available</b><small>Ask the admin to enable a service.</small></div>'}
function updateHeader(){const n=state.profile?.name||state.user?.displayName||"Guest";const avatar=$("#avatarText");if(avatar)avatar.textContent=(n[0]||"G").toUpperCase();const wb=$("#walletBalance");if(wb)wb.textContent=money(state.wallet?.balance||state.profile?.walletBalance||0)}
function openProfile(){if(!state.user){openModal("authModal");return}const p=state.profile||{};$("#profileName").textContent=p.name||state.user.email||"User";$("#profileUsername").textContent=p.username?`@${p.username}`:"";$("#profileAvatar").textContent=(p.name||state.user.email||"G")[0].toUpperCase();const box=$("#profileFields");box.innerHTML="";[["Email",p.email||state.user.email||"—"],["Mobile",p.mobile||"—"],["Username",p.username||"—"],["Status",p.status||"active"]].forEach(([a,b])=>{const d=document.createElement("div");d.className="profile-field";d.innerHTML=`<span>${safe(a)}</span><b></b>`;$("b",d).textContent=b;box.appendChild(d)});openModal("profileModal")}
function toggleAuth(signupMode){$("#loginForm")?.classList.toggle("hidden",signupMode);$("#signupForm")?.classList.toggle("hidden",!signupMode);$("#authTitle").textContent=signupMode?"Create your account":"Welcome back";$("#authSub").textContent=signupMode?"Set up your Print Portal profile":"Sign in to continue"}
async function login(){const ident=$("#loginIdentifier")?.value.trim()||"",pw=$("#loginPassword")?.value||"";if(!ident||!pw)return toast("Enter your login details","warn");busy("loginBtn",true);try{let email=ident.toLowerCase();if(!ident.includes("@")){const field=/^\+?[0-9\s-]{8,}$/.test(ident)?"mobile":"username";let s;try{s=await getDocs(query(collection(db,"userLookup"),where(field,"==",norm(ident)),limit(1)))}catch(x){throw Error("Username/Mobile login is unavailable right now. Please login with your registered email.")}if(s.empty)throw Error("User not found. Check username/mobile or use email.");email=String(s.docs[0].data().email||"").trim().toLowerCase();if(!email)throw Error("This account has no login email configured.")}await signInWithEmailAndPassword(auth,email,pw);closeModal("authModal");toast("Logged in successfully")}catch(e){toast(authMessage(e)||"Login failed. Please check your details.","error")}finally{busy("loginBtn",false)}}
async function signup(){const name=$("#signupName").value.trim(),username=norm($("#signupUsername").value),mobile=norm($("#signupMobile").value),email=$("#signupEmail").value.trim().toLowerCase(),pw=$("#signupPassword").value,cf=$("#signupConfirm").value;if(!name||!username||!mobile||!email||!pw)return toast("Fill all signup fields","warn");if(pw!==cf)return toast("Passwords do not match","error");busy("signupBtn",true);try{const [u,m]=await Promise.all([getDocs(query(collection(db,"userLookup"),where("username","==",username),limit(1))),getDocs(query(collection(db,"userLookup"),where("mobile","==",mobile),limit(1)))]);if(!u.empty)throw Error("Username is already registered. Please choose another username.");if(!m.empty)throw Error("Mobile number is already registered. Please use another number.");const c=await createUserWithEmailAndPassword(auth,email,pw);await updateProfile(c.user,{displayName:name});await setDoc(doc(db,"users",c.user.uid),{name,username,mobile,email,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),status:"active"});await setDoc(doc(db,"userLookup",username),{username,email,uid:c.user.uid});await setDoc(doc(db,"userLookup",mobile),{mobile,email,uid:c.user.uid});state.profile={name,username,mobile,email,status:"active"};closeModal("authModal");updateHeader();toast("Account created")}catch(e){toast(authMessage(e),"error")}finally{busy("signupBtn",false)}}
function forgotPassword(){openModal("forgotModal");switchRecovery("email")}function switchRecovery(mode){$$(".recovery-tab").forEach(b=>b.classList.toggle("active",b.dataset.recoveryTab===mode));$("#recoveryEmailPane")?.classList.toggle("hidden",mode!=="email");$("#recoveryManualPane")?.classList.toggle("hidden",mode!=="manual")}
async function emailReset(){const email=$("#resetEmail").value.trim().toLowerCase();if(!email)return toast("Enter your email","warn");busy("emailResetBtn",true);try{await sendPasswordResetEmail(auth,email);toast("Password reset link sent");closeModal("forgotModal")}catch(e){toast(authMessage(e),"error")}finally{busy("emailResetBtn",false)}}
async function manualRecovery(){const email=$("#manualEmail").value.trim().toLowerCase(),mobile=norm($("#manualMobile").value);if(!email||!mobile)return toast("Enter email and mobile number","warn");busy("manualVerifyBtn",true);try{const s=await getDocs(query(collection(db,"users"),where("email","==",email),where("mobile","==",mobile),limit(1)));if(s.empty)throw Error("Wrong email or mobile number");await sendPasswordResetEmail(auth,email);toast("Details verified. Reset link sent.");closeModal("forgotModal")}catch(e){toast(authMessage(e),"error")}finally{busy("manualVerifyBtn",false)}}
function openUserChat(){if(!state.user){openModal("authModal");return}openModal("chatModal");if(state.chatUnsub)state.chatUnsub();state.chatUnsub=onSnapshot(query(collection(db,"chats",state.user.uid,"messages"),orderBy("createdAt","asc")),s=>{els.chatMessages.innerHTML="";s.forEach(d=>{const m=d.data(),r=document.createElement("div");r.className=`chat-bubble ${m.senderRole==="user"?"mine":"theirs"}`;r.textContent=m.text||"";els.chatMessages.appendChild(r)});els.chatMessages.scrollTop=els.chatMessages.scrollHeight},()=>toast("Chat could not be loaded","error"))}
async function sendUserChat(){if(!state.user)return;const text=els.chatInput.value.trim();if(!text)return;busy("sendChatBtn",true);try{await addDoc(collection(db,"chats",state.user.uid,"messages"),{text,senderUid:state.user.uid,senderRole:"user",createdAt:serverTimestamp()});els.chatInput.value=""}catch{toast("Message could not be sent","error")}finally{busy("sendChatBtn",false)}}
async function logoutUser(){try{await signOut(auth);closeModal("profileModal");renderRecentJobs();toast("Logged out")}catch{toast("Logout failed","error")}}
function openServiceByType(type){const s=state.services.find(x=>x.templateType===type);if(s)openService(s);else toast("Service is disabled","warn")}
async function openService(service){state.currentService=service;$("#serviceModalTitle").textContent=service.name;$("#serviceModalDesc").textContent=service.description||"";$("#serviceModalIcon").textContent=safe(service.icon);$("#serviceWorkspace").classList.add("hidden");$("#serviceGate").classList.add("hidden");openModal("serviceModal");const access=service.access||"open";if(access==="login"&&!state.user)return showGate("🔐","Login required","Please login before using this service.",{label:"Login",action:()=>{closeModal("serviceModal");openModal("authModal")}});if(access==="activation"){if(!state.user)return showGate("🔒","Login required","Login before requesting activation.",{label:"Login",action:()=>{closeModal("serviceModal");openModal("authModal")}});if(!(await checkActivation(state.user.uid,service.id)))return showGate("🔒","Service Locked","This service needs approved activation.",{label:"Request Activation",action:()=>requestActivation(service)})}startWorkflow(service)}
async function checkActivation(uid,id){try{const s=await getDoc(doc(db,"activations",uid,id));return s.exists()&&s.data().status==="approved"&&s.data().enabled!==false}catch{return false}}
async function requestActivation(service){try{const q=await getDocs(query(collection(db,"activationRequests"),where("uid","==",state.user.uid),where("serviceId","==",service.id),where("status","==","pending"),limit(1)));if(!q.empty)return toast("Activation request already pending","warn");await addDoc(collection(db,"activationRequests"),{uid:state.user.uid,userName:state.profile?.name||"",serviceId:service.id,serviceName:service.name,status:"pending",createdAt:serverTimestamp()});showGate("⏳","Pending","Waiting for admin approval.");toast("Activation request submitted")}catch{toast("Activation request failed","error")}}
function showGate(icon,title,text,button){const g=$("#serviceGate");g.innerHTML=`<div class="lock">${icon}</div><h4>${safe(title)}</h4><p>${safe(text)}</p>`;g.classList.remove("hidden");if(button){const b=document.createElement("button");b.className="primary-btn";b.textContent=button.label;b.onclick=button.action;g.appendChild(b)}}
function startWorkflow(service){const type=service.templateId?"template":service.templateType||"document";state.workflow={service,type,persons:[],photoSettings:{width:33,height:45,gapX:2,gapY:2,photoScale:100,border:false,borderWidth:0.5},layoutSettings:{paper:"a4",width:210,height:297}};$("#serviceWorkspace").classList.remove("hidden");$("#addPersonBtn").classList.remove("hidden");$("#addPersonBtn").textContent=type==="template"?"＋ Add More Card":"＋ Add More";addPerson(false);setStep("upload")}
function addPerson(focus=true){if(!state.workflow)return;state.workflow.persons.push({id:id(),front:null,back:null,quantity:state.workflow.type==="passport"?6:1});renderPersonCards();if(focus)setTimeout(()=>$("#personCards .person-card:last-child")?.scrollIntoView({behavior:"smooth",block:"center"}),30)}
function addTemplatePersonFromFile(){if(!state.workflow)return;const pid=id();state.workflow.persons.push({id:pid,front:null,back:null,quantity:1});renderPersonCards();setTimeout(()=>chooseTemplateFile(pid),20)}
function getCurrentUsageFee(){const service=state.workflow?.service||state.currentService;const p=state.servicePrices?.find(x=>x.id===service?.id)||{};return Number(p.usageFee||0)}
async function confirmAddMorePerson(){if(!state.workflow)return;const fee=getCurrentUsageFee();const service=state.workflow.service;if(fee<=0){return state.workflow.type==="template"?addTemplatePersonFromFile():addPerson()}state.pendingAddPersonAction=state.workflow.type==="template"?"template":"person";$("#personChargeServiceText").textContent=`${service?.name||"This service"} में 1 और person/card जोड़ने का शुल्क है।`;$("#personChargeAmount").textContent=money(fee);openModal("personChargeModal")}
async function confirmPersonChargeAndAdd(){if(!state.workflow)return closeModal("personChargeModal");const fee=getCurrentUsageFee(),action=state.pendingAddPersonAction;busy("personChargeConfirmBtn",true);try{if(fee>0){const ok=await chargeUsageFee(state.workflow.service,fee);if(!ok)return}closeModal("personChargeModal");state.pendingAddPersonAction=null;if(action==="template")addTemplatePersonFromFile();else addPerson()}finally{busy("personChargeConfirmBtn",false)}}
function chooseTemplateFile(pid){els.hiddenFileInput.value="";els.hiddenFileInput.accept="image/*,application/pdf";els.hiddenFileInput.onchange=async()=>{const f=els.hiddenFileInput.files?.[0];els.hiddenFileInput.onchange=null;if(f)await handleTemplateFile(f,pid)};els.hiddenFileInput.click()}
function removePerson(pid){const p=state.workflow.persons.find(x=>x.id===pid);if(!p)return;[p.front,p.back].forEach(v=>{if(v?.url?.startsWith("blob:"))URL.revokeObjectURL(v.url)});state.workflow.persons=state.workflow.persons.filter(x=>x.id!==pid);renderPersonCards()}
function renderPersonCards(){const wf=state.workflow;if(!wf)return;els.personCards.innerHTML="";wf.persons.forEach((p,idx)=>{if(wf.type==="passport"){els.personCards.appendChild(passportUploadCard(p,idx));return}if(wf.type==="template"){els.personCards.appendChild(templateUploadCard(p,idx));return}const card=document.createElement("div");card.className="person-card";card.innerHTML=`<div class="person-title"><b>Person ${idx+1}</b></div>`;if(wf.persons.length>1){const r=document.createElement("button");r.className="mini-btn alt";r.textContent="Remove";r.onclick=()=>removePerson(p.id);$(".person-title",card).appendChild(r)}const grid=document.createElement("div");grid.className="side-grid";grid.append(sideUI(p,"front","Front side"));if(wf.service.back!==false||wf.type==="pvc")grid.append(sideUI(p,"back","Back side"));card.appendChild(grid);els.personCards.appendChild(card)});}
function passportUploadCard(p,idx){
  const card=document.createElement("div");
  card.className="passport-upload-card person-card";

  card.innerHTML=`
    <div class="person-title">
      <b>Person ${idx+1}</b>
    </div>

    <div class="passport-preview-box">
      ${p?.front ? "" : "Choose photo"}
    </div>
  `;

  if(p?.front){
    const im=new Image();
    im.src=p.front.url;
    im.alt="Passport photo";
    im.draggable=false;

    const preview=$(".passport-preview-box",card);
    preview.innerHTML="";
    preview.appendChild(im);
  }

  const row=document.createElement("div");
  row.className="passport-upload-actions upload-actions";

  const up=document.createElement("button");
  up.className="primary-btn";
  up.textContent=p?.front ? "Change photo" : "Choose file";
  up.onclick=()=>chooseFile(p.id,"front");
  row.appendChild(up);

  if(p?.front){
    const ed=document.createElement("button");
    ed.className="secondary-btn";
    ed.textContent="Edit crop";
    ed.onclick=()=>openCrop(p.id,"front");
    row.appendChild(ed);
  }

  const qtyBox=document.createElement("label");
  qtyBox.className="passport-quantity";

  qtyBox.innerHTML=`
    <span>Quantity</span>
    <input
      type="number"
      min="1"
      max="500"
      value="${Math.max(1,p?.quantity||1)}"
      inputmode="numeric"
    >
  `;

  const qtyInput=$("input",qtyBox);

  qtyInput.addEventListener("input",()=>{
    let value=parseInt(qtyInput.value,10);

    if(!Number.isFinite(value)||value<1)value=1;
    if(value>500)value=500;

    qtyInput.value=value;
    p.quantity=value;
  });

  row.appendChild(qtyBox);

  if(idx>0){
    const rm=document.createElement("button");
    rm.className="mini-btn alt";
    rm.textContent="Remove";
    rm.onclick=()=>removePerson(p.id);
    row.appendChild(rm);
  }

  card.appendChild(row);
  return card;
}
function templateUploadCard(p,idx){const card=document.createElement("div");card.className="person-card auto-person-card";const title=document.createElement("div");title.className="person-title";title.innerHTML=`<b>Card ${idx+1}</b><span class="auto-badge">AUTO CROP</span>`;card.appendChild(title);const grid=document.createElement("div");grid.className="side-grid auto-side-grid";for(const [side,label] of [["front","Front side"],["back","Back side"]]){const wrap=document.createElement("div");wrap.className="upload-side";wrap.innerHTML=`<h5>${label}</h5><div class="preview-box">${p[side]?"":"Waiting for file…"}</div>`;if(p[side]){const im=new Image();im.src=p[side].url;im.alt=label;im.loading="eager";$(".preview-box",wrap).innerHTML="";$(".preview-box",wrap).appendChild(im)}grid.appendChild(wrap)}card.appendChild(grid);if(p.front&&p.back){const ok=document.createElement("div");ok.className="auto-complete";ok.textContent="✓ Front + Back auto-cropped and ready";card.appendChild(ok)}else{const choose=document.createElement("button");choose.className="primary-btn auto-file-btn";choose.type="button";choose.textContent="Select One File → Auto Crop Front + Back";choose.onclick=()=>chooseTemplateFile(p.id);card.appendChild(choose)}if(state.workflow.persons.length>1){const rm=document.createElement("button");rm.className="mini-btn alt auto-remove";rm.textContent="Remove Card";rm.onclick=()=>removePerson(p.id);card.appendChild(rm)}return card}
function sideUI(p,side,label){const wrap=document.createElement("div");wrap.className="upload-side";wrap.innerHTML=`<h5>${label}</h5><div class="preview-box">${p[side]?"":"Choose image / PDF"}</div>`;if(p[side]){const im=new Image();im.src=p[side].url;im.alt=label;$(".preview-box",wrap).innerHTML="";$(".preview-box",wrap).appendChild(im)}const actions=document.createElement("div");actions.className="upload-actions";const up=document.createElement("button");up.className="mini-btn";up.textContent=p[side]?`Change ${side}`:`Upload ${side}`;up.onclick=()=>chooseFile(p.id,side);actions.appendChild(up);if(p[side]&&!p[side].auto){const ed=document.createElement("button");ed.className="mini-btn alt";ed.textContent="Edit crop";ed.onclick=()=>openCrop(p.id,side);actions.appendChild(ed)}if(side==="back"){const same=document.createElement("button");same.className="mini-btn alt";same.textContent="Same as Front";same.onclick=()=>sameAsFront(p.id);actions.appendChild(same)}wrap.appendChild(actions);return wrap}
function chooseFile(pid,side){els.hiddenFileInput.value="";els.hiddenFileInput.accept="image/*,application/pdf";els.hiddenFileInput.onchange=async()=>{const f=els.hiddenFileInput.files?.[0];els.hiddenFileInput.onchange=null;if(f)await handleFile(f,pid,side)};els.hiddenFileInput.click()}
async function handleTemplateFile(file,pid){const p=state.workflow?.persons.find(x=>x.id===pid);if(!p)return;try{const service=state.workflow.service||{};const templateId=String(service.templateId||service.templateID||service.template||"").trim();if(!templateId)throw Error("Auto-crop template is not configured");const t=await getTemplate(templateId);if(!t)throw Error("Selected auto-crop template could not be loaded. Check the service template assignment.");const frontCrop=t.frontCrop,backCrop=t.backCrop;if(!frontCrop||!backCrop)throw Error("Template must contain both Front and Back crop settings");showTemplateProcessing(true);const frontPage=Number(t.frontPage||frontCrop.page||1),backPage=Number(t.backPage||backCrop.page||1);const frontSrc=await fileToPage(file,frontPage),backSrc=backPage===frontPage?frontSrc:await fileToPage(file,backPage);p.front={...await autoCropSource(frontSrc,frontCrop,file,"card"),source:file,pageNumber:frontSrc.pageNumber,totalPages:frontSrc.totalPages,auto:true,type:file.type||""};p.back={...await autoCropSource(backSrc,backCrop,file,"card"),source:file,pageNumber:backSrc.pageNumber,totalPages:backSrc.totalPages,auto:true,type:file.type||""};renderPersonCards();toast(`Card ${state.workflow.persons.findIndex(x=>x.id===pid)+1} added • Front + Back auto-cropped`);if(state.workflow.persons.length===1){} }catch(e){console.error(e);const idx=state.workflow.persons.findIndex(x=>x.id===pid);if(idx>=0&&!state.workflow.persons[idx].front&&!state.workflow.persons[idx].back&&state.workflow.persons.length>1)state.workflow.persons.splice(idx,1);renderPersonCards();if(e?.code!=="PDF_CANCELLED")toast(e.message||"Auto crop failed","error")}finally{showTemplateProcessing(false)}}
function showTemplateProcessing(on){const b=$("#addPersonBtn");if(b){b.disabled=on;b.textContent=on?"Processing…":"＋ Add More Card"}}
async function handleFile(file,pid,side){const p=state.workflow?.persons.find(x=>x.id===pid);if(!p)return;try{const service=state.workflow.service||{};const templateId=String(service.templateId||service.templateID||service.template||"").trim();if(templateId){const t=await getTemplate(templateId);if(!t)throw Error("Selected auto-crop template could not be loaded. Check the service template assignment.");const key=side==="back"?"backCrop":"frontCrop";const pageKey=side==="back"?"backPage":"frontPage";const crop=t[key];if(!crop)throw Error(`${side} template crop is not configured`);const page=Number(t[pageKey]||crop.page||1);const src=await fileToPage(file,page);p[side]={...await autoCropSource(src,crop,file),source:file,pageNumber:src.pageNumber,totalPages:src.totalPages,auto:true,type:file.type||file.name?.split(".").pop()||""};renderPersonCards();toast(`${side} auto-cropped`);return}if(file.type==="application/pdf"){const src=await fileToPage(file,1);p[side]={source:file,url:src.url,image:src.image,pageNumber:1,totalPages:src.totalPages,type:"pdf"};renderPersonCards();openCrop(pid,side);if(src.totalPages>1)openPdfPagePicker(pid,side)}else{const url=URL.createObjectURL(file),img=await loadImage(url);p[side]={source:file,url,image:img,type:"image"};renderPersonCards();openCrop(pid,side)}}catch(e){console.error("File processing error:",e);if(e?.code!=="PDF_CANCELLED")toast(e.message||"File processing failed","error")}}
async function getTemplate(tid){if(!tid)return null;try{const s=await getDoc(doc(db,"templates",tid));return s.exists()?s.data():null}catch{return null}}
async function fileToPage(file,pageNo=1){if(file.type!=="application/pdf"){const url=URL.createObjectURL(file);return{url,image:await loadImage(url),totalPages:1,pageNumber:1}}return renderPdfPage(file,pageNo)}
function requestPdfPassword(msg=""){return new Promise((resolve,reject)=>{state.passwordResolve=resolve;state.passwordReject=reject;$("#pdfPassword").value="";$("#passwordError").textContent=msg;openModal("passwordModal");setTimeout(()=>$("#pdfPassword")?.focus(),50)})}
async function getPdf(file){let pdf=state.pdfCache.get(file);if(pdf)return pdf;const pdfjs=await getPdfJs();let password="";while(true){let task;try{const data=new Uint8Array(await file.arrayBuffer());task=pdfjs.getDocument({data,password});state.pdfTasks.set(file,task);pdf=await task.promise;state.pdfTasks.delete(file);state.pdfCache.set(file,pdf);return pdf}catch(e){try{task?.destroy()}catch{}state.pdfTasks.delete(file);if(e?.name!=="PasswordException"&&e?.code!==1&&e?.code!==2)throw e;password=await requestPdfPassword(e?.code===2?"Incorrect password. Try again.":"")}}}
async function renderPdfPage(file,pageNo=1){const pdf=await getPdf(file),page=await pdf.getPage(Math.max(1,Math.min(pageNo,pdf.numPages))),vp=page.getViewport({scale:3}),c=document.createElement("canvas");c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);const ctx=c.getContext("2d");ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";await page.render({canvasContext:ctx,viewport:vp}).promise;const url=c.toDataURL("image/png");return{url,image:await loadImage(url),totalPages:pdf.numPages,pageNumber:page.pageNumber}}
function openPdfPagePicker(pid,side){const p=state.workflow.persons.find(x=>x.id===pid);if(!p?.[side]||p[side].totalPages<2)return;$("#pdfPagePicker")?.remove();const m=document.createElement("div");m.id="pdfPagePicker";m.className="pdf-page-picker";m.innerHTML=`<div class="pdf-page-picker-inner"><b>Select PDF page for ${side}</b><select id="manualPdfPage">${Array.from({length:p[side].totalPages},(_,i)=>`<option value="${i+1}" ${i+1===p[side].pageNumber?"selected":""}>Page ${i+1}</option>`).join("")}</select><button id="manualPdfPageApply" class="primary-btn">Use this page</button></div>`;document.body.appendChild(m);$("#manualPdfPageApply").onclick=async()=>{try{const n=+$("#manualPdfPage").value,src=await fileToPage(p[side].source,n);p[side]={...p[side],...src,pageNumber:n};m.remove();renderPersonCards();openCrop(pid,side)}catch(e){toast(e.message||"Page could not be opened","error")}}}
async function sameAsFront(pid){const p=state.workflow.persons.find(x=>x.id===pid);if(!p?.front?.source)return toast("Upload the Front side first","warn");try{if(p.back?.url?.startsWith("blob:"))URL.revokeObjectURL(p.back.url);const src=await fileToPage(p.front.source,p.front.pageNumber||1);p.back={source:p.front.source,url:src.url,image:src.image,pageNumber:src.pageNumber,totalPages:src.totalPages,type:p.front.type||p.front.source.type,auto:false,sameAsFrontSource:true};renderPersonCards();openCrop(pid,"back");toast("Front source opened for independent Back crop")}catch(e){toast(e.message||"Front source could not be opened","error")}}

/* ---------- Crop engine: source-locked selection + linked image drag ---------- */
function modeRatio(mode){return mode==="pvc"?85.6/54:null}
function newCropState(src,mode="free"){
  return {source:src,zoom:1,panX:0,panY:0,rotation:0,mode,
    boxX:null,boxY:null,boxW:null,boxH:null,
    x:0,y:0,width:src.naturalWidth,height:src.naturalHeight,
    selectionLocked:false,manualBox:false};
}
function initPerspective(c){
  if(c.perspectivePoints?.length===4)return;
  // Start from the current normal-crop rectangle, so Perspective Crop begins
  // exactly on the area the user has selected instead of the whole source.
  const x=Number.isFinite(c.x)?c.x:0, y=Number.isFinite(c.y)?c.y:0;
  const w=Math.max(1,Number(c.width)||c.source.naturalWidth), h=Math.max(1,Number(c.height)||c.source.naturalHeight);
  c.perspectivePoints=[
    {x,y}, {x:x+w,y}, {x:x+w,y:y+h}, {x,y:y+h}
  ];
}
function sourceToViewPoint(c,p){return sourcePointToView.call(null,p.x,p.y)}
function viewToSourcePoint(c,vx,vy){
  const r=els.cropStage.getBoundingClientRect(),s=cropScale(),ang=-(c.rotation||0)*Math.PI/180,co=Math.cos(ang),si=Math.sin(ang);
  const dx=(vx-(r.width/2+c.panX))/s,dy=(vy-(r.height/2+c.panY))/s;
  return {
    x:c.source.naturalWidth/2+dx*co-dy*si,
    y:c.source.naturalHeight/2+dx*si+dy*co
  };
}
function clampPerspectivePoint(c,p){
  p.x=Math.max(0,Math.min(c.source.naturalWidth,p.x));p.y=Math.max(0,Math.min(c.source.naturalHeight,p.y));return p;
}
function setPerspectiveUI(on){
  const c=state.crop;if(!c)return;
  c.perspectiveMode=!!on;
  if(on)initPerspective(c);
  $("#cropBox")?.classList.toggle("perspective-hidden",!!on);
  $("#perspectiveBox")?.classList.toggle("active",!!on);
  $("#perspectiveOverlay")?.classList.toggle("active",!!on);
  $("#cropPerspectiveBtn")?.classList.toggle("active",!!on);
  $("#cropPerspectiveBtn")?.setAttribute("aria-pressed",String(!!on));
  $("#cropFullscreenPerspective")?.classList.toggle("active",!!on);
  $("#cropFullscreenPerspective")?.setAttribute("aria-pressed",String(!!on));
  $("#cropHint")?.replaceChildren(document.createTextNode(on?"Drag the 4 corners • touch shows a clear zoom loupe • Apply to straighten":"Drag image • pinch/scroll to zoom • use 8 handles"));
  drawCropStage();
}
function togglePerspectiveCrop(){if(!state.crop)return;setPerspectiveUI(!state.crop.perspectiveMode)}
function drawPerspective(){
  const c=state.crop,stage=els.cropStage,ov=$("#perspectiveOverlay"),poly=$("#perspectivePolygon"),box=$("#perspectiveBox");
  if(!c||!stage||!ov||!poly||!box)return;
  initPerspective(c);
  const r=stage.getBoundingClientRect();ov.setAttribute("viewBox",`0 0 ${r.width} ${r.height}`);
  const pts=c.perspectivePoints.map(p=>sourceToViewPoint(c,p));
  poly.setAttribute("points",pts.map(p=>`${p.x},${p.y}`).join(" "));
  [...box.querySelectorAll("i")].forEach((h,i)=>{h.style.left=`${pts[i].x}px`;h.style.top=`${pts[i].y}px`});
}
function updateLoupePosition(clientX,clientY){
  const l=$("#cropLoupe"),stage=els.cropStage;if(!l||!stage)return;
  const r=stage.getBoundingClientRect(),size=Math.min(170,Math.max(132,r.width*.30));
  l.style.width=`${size}px`;l.style.height=`${size}px`;
  let x=clientX-r.left,y=clientY-r.top,left=x<r.width/2?x+30:x-size-30,top=y<r.height/2?y+30:y-size-30;
  left=Math.max(8,Math.min(r.width-size-8,left));top=Math.max(8,Math.min(r.height-size-8,top));
  l.style.left=`${left}px`;l.style.top=`${top}px`;
}
function showCropLoupe(clientX,clientY){
  const l=$("#cropLoupe"),can=$("#cropLoupeCanvas"),main=els.cropCanvas,stage=els.cropStage;if(!l||!can||!main||!stage)return;
  updateLoupePosition(clientX,clientY);l.classList.add("visible");
  const r=stage.getBoundingClientRect(),dpr=devicePixelRatio||1,size=Math.min(170,Math.max(132,r.width*.30)),zoom=2.5;
  can.width=Math.round(size*dpr);can.height=Math.round(size*dpr);can.style.width=`${size}px`;can.style.height=`${size}px`;
  const px=(clientX-r.left)*dpr,py=(clientY-r.top)*dpr,srcSize=size/zoom*dpr,ctx=can.getContext("2d");
  ctx.clearRect(0,0,can.width,can.height);ctx.save();ctx.beginPath();ctx.arc(can.width/2,can.height/2,can.width/2,0,Math.PI*2);ctx.clip();
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
  ctx.drawImage(main,px-srcSize/2,py-srcSize/2,srcSize,srcSize,0,0,can.width,can.height);ctx.restore();
}
function hideCropLoupe(){const l=$("#cropLoupe");if(l)l.classList.remove("visible")}
async function renderPerspectiveCrop(c){
  initPerspective(c);

  const p=c.perspectivePoints;
  if(!Array.isArray(p)||p.length!==4){
    throw new Error("Set all 4 perspective corners first");
  }

  // The four handles are SOURCE-IMAGE coordinates:
  // 0 = top-left, 1 = top-right, 2 = bottom-right, 3 = bottom-left.
  const tl=clampPerspectivePoint(c,{x:Number(p[0].x),y:Number(p[0].y)});
  const tr=clampPerspectivePoint(c,{x:Number(p[1].x),y:Number(p[1].y)});
  const br=clampPerspectivePoint(c,{x:Number(p[2].x),y:Number(p[2].y)});
  const bl=clampPerspectivePoint(c,{x:Number(p[3].x),y:Number(p[3].y)});

  // Keep the selected quadrilateral's real aspect ratio.
  const distance=(a,b)=>Math.hypot(b.x-a.x,b.y-a.y);
  const top=distance(tl,tr);
  const bottom=distance(bl,br);
  const left=distance(tl,bl);
  const right=distance(tr,br);

  const outW0=Math.max(2,Math.round((top+bottom)/2));
  const outH0=Math.max(2,Math.round((left+right)/2));

  // Avoid creating an unnecessarily huge canvas while preserving the
  // selected document proportions.
  const maxDim=2600;
  const fit=Math.min(1,maxDim/Math.max(outW0,outH0));
  const outW=Math.max(2,Math.round(outW0*fit));
  const outH=Math.max(2,Math.round(outH0*fit));

  /*
   * Solve the INVERSE homography directly:
   *
   *   sourceX = (a*u + b*v + c) / (g*u + h*v + 1)
   *   sourceY = (d*u + e*v + f) / (g*u + h*v + 1)
   *
   * where (u,v) is a pixel in the final straight rectangle and the four
   * destination corners correspond exactly to TL/TR/BR/BL in the source.
   *
   * This avoids the old scale-dependent formula and makes every selected
   * corner land exactly on the corresponding output corner.
   */
  const dst=[
    {x:0,    y:0},
    {x:outW, y:0},
    {x:outW, y:outH},
    {x:0,    y:outH}
  ];
  const src=[tl,tr,br,bl];

  const A=[];
  const B=[];

  for(let i=0;i<4;i++){
    const u=dst[i].x;
    const v=dst[i].y;
    const x=src[i].x;
    const y=src[i].y;

    // u*a + v*b + c - x*u*g - x*v*h = x
    A.push([u,v,1,0,0,0,-x*u,-x*v]);
    B.push(x);

    // u*d + v*e + f - y*u*g - y*v*h = y
    A.push([0,0,0,u,v,1,-y*u,-y*v]);
    B.push(y);
  }

  // Gaussian elimination with partial pivoting.
  function solve8(M,Y){
    const n=8;
    const m=M.map((row,i)=>row.slice().concat(Y[i]));

    for(let col=0;col<n;col++){
      let pivot=col;
      let best=Math.abs(m[col][col]);

      for(let row=col+1;row<n;row++){
        const value=Math.abs(m[row][col]);
        if(value>best){
          best=value;
          pivot=row;
        }
      }

      if(best<1e-12){
        throw new Error("Invalid perspective selection");
      }

      if(pivot!==col){
        const tmp=m[col];
        m[col]=m[pivot];
        m[pivot]=tmp;
      }

      const pv=m[col][col];
      for(let j=col;j<=n;j++)m[col][j]/=pv;

      for(let row=0;row<n;row++){
        if(row===col)continue;
        const f=m[row][col];
        if(Math.abs(f)<1e-15)continue;
        for(let j=col;j<=n;j++)m[row][j]-=f*m[col][j];
      }
    }

    return m.map(row=>row[n]);
  }

  const H=solve8(A,B);
  const [ha,hb,hc,hd,he,hf,hg,hh]=H;

  const srcW=c.source.naturalWidth;
  const srcH=c.source.naturalHeight;

  const srcCanvas=document.createElement("canvas");
  srcCanvas.width=srcW;
  srcCanvas.height=srcH;

  const sc=srcCanvas.getContext("2d",{willReadFrequently:true});
  sc.imageSmoothingEnabled=true;
  sc.imageSmoothingQuality="high";
  sc.drawImage(c.source,0,0,srcW,srcH);

  const sd=sc.getImageData(0,0,srcW,srcH).data;

  const outCanvas=document.createElement("canvas");
  outCanvas.width=outW;
  outCanvas.height=outH;

  const out=outCanvas.getContext("2d",{willReadFrequently:false});
  const img=out.createImageData(outW,outH);
  const od=img.data;

  // Inverse-map every destination pixel into the original image.
  for(let y=0;y<outH;y++){
    for(let x=0;x<outW;x++){
      const den=hg*x+hh*y+1;
      const oi=(y*outW+x)*4;

      if(Math.abs(den)<1e-12){
        od[oi+3]=0;
        continue;
      }

      const sx=(ha*x+hb*y+hc)/den;
      const sy=(hd*x+he*y+hf)/den;

      // Outside source image: transparent rather than pulling edge pixels.
      if(sx<0||sy<0||sx>srcW-1||sy>srcH-1){
        od[oi]=255;
        od[oi+1]=255;
        od[oi+2]=255;
        od[oi+3]=0;
        continue;
      }

      // Bilinear interpolation for a clean, camera-scan-like result.
      const x0=Math.floor(sx);
      const y0=Math.floor(sy);
      const x1=Math.min(srcW-1,x0+1);
      const y1=Math.min(srcH-1,y0+1);
      const fx=sx-x0;
      const fy=sy-y0;

      const i00=(y0*srcW+x0)*4;
      const i10=(y0*srcW+x1)*4;
      const i01=(y1*srcW+x0)*4;
      const i11=(y1*srcW+x1)*4;

      const w00=(1-fx)*(1-fy);
      const w10=fx*(1-fy);
      const w01=(1-fx)*fy;
      const w11=fx*fy;

      for(let ch=0;ch<4;ch++){
        od[oi+ch]=
          sd[i00+ch]*w00+
          sd[i10+ch]*w10+
          sd[i01+ch]*w01+
          sd[i11+ch]*w11;
      }
    }
  }

  out.putImageData(img,0,0);

  const url=outCanvas.toDataURL("image/png");
  return {
    url,
    image:await loadImage(url)
  };
}

function openCrop(pid,side){
  const p=state.workflow?.persons.find(x=>x.id===pid);if(!p?.[side]?.image)return;
  state.cropTarget={personId:pid,side};
  const mode=state.workflow?.type==="pvc"?"pvc":"free";
  $("#cropTitle").textContent=`Crop ${side} • Person ${state.workflow.persons.findIndex(x=>x.id===pid)+1}`;
  $("#cropMode").value=mode;
  state.crop=p[side].cropState?restoreCrop(p[side].cropState,p[side].image,mode):newCropState(p[side].image,mode);
  state.crop.mode=mode;
  $("#rotateSlider").value=state.crop.rotation||0;
  $("#rotateValue").textContent=`${Math.round(state.crop.rotation||0)}°`;
  openModal("cropModal");requestAnimationFrame(()=>{initCropBox();setPerspectiveUI(!!state.crop.perspectiveMode);drawCropStage()});
}
function restoreCrop(s,src,mode="free"){
  const c={...newCropState(src,mode),x:Number(s?.x)||0,y:Number(s?.y)||0,width:Number(s?.width)||src.naturalWidth,height:Number(s?.height)||src.naturalHeight,zoom:Number(s?.zoom)||1,panX:Number(s?.panX)||0,panY:Number(s?.panY)||0,rotation:Number(s?.rotation)||0,boxNorm:s?.boxNorm||null};
  c.selectionLocked=true;c.manualBox=false;c.boxX=c.boxY=c.boxW=c.boxH=null;c.perspectiveMode=!!s?.perspectiveMode;c.perspectivePoints=Array.isArray(s?.perspectivePoints)?s.perspectivePoints.map(p=>({x:Number(p.x),y:Number(p.y)})):null;return c;
}
function initCropBox(){
  const c=state.crop,stage=els.cropStage;if(!c||!stage)return;
  const r=stage.getBoundingClientRect(),ratio=modeRatio(c.mode||$("#cropMode").value);
  if(c.boxW&&c.boxH)return;
  let bw=r.width*.48,bh=r.height*.48;
  if(ratio){bw=Math.min(bw,r.height*.60*ratio);bh=bw/ratio}
  bw=Math.max(70,Math.min(bw,r.width-20));bh=Math.max(70,Math.min(bh,r.height-20));
  c.boxW=bw;c.boxH=bh;c.boxX=(r.width-bw)/2;c.boxY=(r.height-bh)/2;
  /* The first box defines the source selection. From this point on it is source-locked. */
  syncSourceCropFromView();
}
function resetCrop(){if(!state.crop)return;const mode=$("#cropMode").value||"free";state.crop=newCropState(state.crop.source,mode);initCropBox();drawCropStage()}
function setCropZoom(z){
  const c=state.crop;if(!c)return;
  const oldZoom=Math.max(.5,Math.min(5,c.zoom||1)),newZoom=Math.max(.5,Math.min(5,z));
  if(oldZoom===newZoom)return;
  /* Keep the SAME source rectangle. Reproject the crop box from source coordinates. */
  c.zoom=newZoom;drawCropStage();
}
function setCropRotation(r){
  if(!state.crop)return;state.crop.rotation=Math.max(-180,Math.min(180,r));
  $("#rotateSlider").value=state.crop.rotation;$("#rotateValue").textContent=`${Math.round(state.crop.rotation)}°`;
  drawCropStage();
}
function syncCropRatio(){
  const c=state.crop;if(!c)return;const mode=$("#cropMode").value||"free";c.mode=mode;
  const ratio=modeRatio(mode),r=els.cropStage.getBoundingClientRect();
  if(ratio){let bw=c.boxW||r.width*.48,bh=bw/ratio;if(bh>r.height-20){bh=r.height-20;bw=bh*ratio}if(bw>r.width-20){bw=r.width-20;bh=bw/ratio}c.boxW=bw;c.boxH=bh;c.boxX=Math.max(10,(r.width-bw)/2);c.boxY=Math.max(10,(r.height-bh)/2)}
  c.manualBox=true;syncSourceCropFromView();drawCropStage();
}
function cropScale(){const c=state.crop,r=els.cropStage.getBoundingClientRect();return Math.min(r.width/c.source.naturalWidth,r.height/c.source.naturalHeight)*c.zoom}
function getRotatedSize(w,h,deg){const a=Math.abs(deg*Math.PI/180),cs=Math.abs(Math.cos(a)),sn=Math.abs(Math.sin(a));return{w:w*cs+h*sn,h:w*sn+h*cs}}
function getImageRect(){
  const c=state.crop,r=els.cropStage.getBoundingClientRect(),s=cropScale(),rw=getRotatedSize(c.source.naturalWidth*s,c.source.naturalHeight*s,c.rotation||0);
  return {left:r.width/2+c.panX-rw.w/2,top:r.height/2+c.panY-rw.h/2,right:r.width/2+c.panX+rw.w/2,bottom:r.height/2+c.panY+rw.h/2,w:rw.w,h:rw.h};
}
function sourcePointToView(sx,sy){
  const c=state.crop,r=els.cropStage.getBoundingClientRect(),s=cropScale(),ang=(c.rotation||0)*Math.PI/180,co=Math.cos(ang),si=Math.sin(ang);
  const dx=(sx-c.source.naturalWidth/2)*s,dy=(sy-c.source.naturalHeight/2)*s;
  return {x:r.width/2+c.panX+dx*co-dy*si,y:r.height/2+c.panY+dx*si+dy*co};
}
function sourceRectToView(){
  const c=state.crop,s=cropScale(),ang=(c.rotation||0)*Math.PI/180,co=Math.cos(ang),si=Math.sin(ang);
  const pts=[[c.x,c.y],[c.x+c.width,c.y],[c.x+c.width,c.y+c.height],[c.x,c.y+c.height]].map(([x,y])=>sourcePointToView(x,y));
  const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);
  return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys),pts,s};
}
function clampImageForSelection(){
  /* Do NOT clamp the pair to the screen. The user explicitly wants the image
     and locked crop selection to be allowed to travel outside the viewport. */
  return;
}
function syncSourceCropFromView(){
  const c=state.crop;if(!c||!els.cropStage)return;initCropBox();
  /* Once the selection exists, screen zoom/drag never rewrites source x/y/w/h. */
  if(c.selectionLocked&&c.width>0&&c.height>0&&c.manualBox===false){
    const b=sourceRectToView();c.boxX=b.x;c.boxY=b.y;c.boxW=b.w;c.boxH=b.h;return;
  }
  const s=cropScale(),r=els.cropStage.getBoundingClientRect(),ang=(c.rotation||0)*Math.PI/180;
  const cropCx=c.boxX+c.boxW/2,cropCy=c.boxY+c.boxH/2,imgCx=r.width/2+c.panX,imgCy=r.height/2+c.panY;
  const dx=(cropCx-imgCx)/s,dy=(cropCy-imgCy)/s,co=Math.cos(ang),si=Math.sin(ang);
  const localX=dx*co+dy*si,localY=-dx*si+dy*co;
  c.x=Math.max(0,Math.min(c.source.naturalWidth-1,c.source.naturalWidth/2+localX-c.boxW/(2*s)));
  c.y=Math.max(0,Math.min(c.source.naturalHeight-1,c.source.naturalHeight/2+localY-c.boxH/(2*s)));
  c.width=Math.max(1,Math.min(c.source.naturalWidth-c.x,c.boxW/s));
  c.height=Math.max(1,Math.min(c.source.naturalHeight-c.y,c.boxH/s));
  c.selectionLocked=true;c.manualBox=false;
}
function drawCropStage(){
  const c=state.crop;if(!c)return;const stage=els.cropStage,r=stage.getBoundingClientRect(),can=els.cropCanvas,dpr=devicePixelRatio||1;
  initCropBox();
  /* Always derive the visible box from the locked source rectangle. */
  if(c.selectionLocked&&!c.manualBox){const b=sourceRectToView();c.boxX=b.x;c.boxY=b.y;c.boxW=b.w;c.boxH=b.h;}
  can.width=Math.max(1,Math.round(r.width*dpr));can.height=Math.max(1,Math.round(r.height*dpr));can.style.width="100%";can.style.height="100%";
  const ctx=can.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,r.width,r.height);
  const s=cropScale();ctx.save();ctx.translate(r.width/2+c.panX,r.height/2+c.panY);ctx.rotate((c.rotation||0)*Math.PI/180);ctx.drawImage(c.source,-c.source.naturalWidth*s/2,-c.source.naturalHeight*s/2,c.source.naturalWidth*s,c.source.naturalHeight*s);ctx.restore();
  els.cropBox.style.left=`${c.boxX}px`;els.cropBox.style.top=`${c.boxY}px`;els.cropBox.style.width=`${c.boxW}px`;els.cropBox.style.height=`${c.boxH}px`;els.cropBox.style.transform="none";
  $("#zoomValue").textContent=`${Math.round(c.zoom*100)}%`;
  drawPerspective();
}
function markCropManual(){if(state.crop){state.crop.manualBox=true;state.crop.selectionLocked=false}}
function bindCropGestures(){
  const stage=els.cropStage,box=els.cropBox;if(!stage||!box)return;
  const pointers=new Map();let mode=null,start=null,lastMid=null,lastDist=0,activePerspectiveHandle=-1;
  const handles=[...box.querySelectorAll("i")],pHandles=[...($("#perspectiveBox")?.querySelectorAll("i")||[])];
  stage.addEventListener("pointerdown",e=>{
    if(!state.crop)return;e.preventDefault();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});stage.setPointerCapture?.(e.pointerId);
    if(pointers.size===2){hideCropLoupe();mode="pinch";const a=[...pointers.values()][0],b=[...pointers.values()][1];lastMid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};lastDist=Math.hypot(a.x-b.x,a.y-b.y);return}
    if(state.crop.perspectiveMode){
      const ph=pHandles.indexOf(e.target.closest("#perspectiveBox i"));
      if(ph>=0){activePerspectiveHandle=ph;mode="perspective";showCropLoupe(e.clientX,e.clientY);return}
    }
    hideCropLoupe();
    const h=handles.indexOf(e.target.closest("#cropBox i"));
    if(h>=0){markCropManual();mode="resize";start={handle:h,x:e.clientX,y:e.clientY,box:{x:state.crop.boxX,y:state.crop.boxY,w:state.crop.boxW,h:state.crop.boxH}};return}
    const inside=!!e.target.closest("#cropBox");mode=inside?"box":"both";start={x:e.clientX,y:e.clientY,box:{x:state.crop.boxX,y:state.crop.boxY,w:state.crop.boxW,h:state.crop.boxH},panX:state.crop.panX,panY:state.crop.panY};
  });
  stage.addEventListener("pointermove",e=>{
    if(!state.crop||!pointers.has(e.pointerId))return;e.preventDefault();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const c=state.crop,r=stage.getBoundingClientRect();
    if(mode==="pinch"&&pointers.size>=2){const [a,b]=[...pointers.values()],mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2},dist=Math.hypot(a.x-b.x,a.y-b.y);if(lastDist){const factor=Math.max(.25,Math.min(4,dist/lastDist));c.zoom=Math.max(.5,Math.min(5,(c.zoom||1)*factor));c.panX+=mid.x-lastMid.x;c.panY+=mid.y-lastMid.y;drawCropStage()}lastDist=dist;lastMid=mid;return}
    if(!start&&mode!=="perspective")return;const dx=e.clientX-(start?.x||e.clientX),dy=e.clientY-(start?.y||e.clientY);
    if(mode==="perspective"){
      showCropLoupe(e.clientX,e.clientY);
      const p=clampPerspectivePoint(c,viewToSourcePoint(c,e.clientX-r.left,e.clientY-r.top));c.perspectivePoints[activePerspectiveHandle]=p;drawCropStage();return;
    }
    if(mode==="both"){c.panX=start.panX+dx;c.panY=start.panY+dy;drawCropStage();return}
    if(mode==="box"){markCropManual();c.boxX=start.box.x+dx;c.boxY=start.box.y+dy;const im=getImageRect(),minX=im.left,maxX=im.right-c.boxW,minY=im.top,maxY=im.bottom-c.boxH;if(minX<=maxX)c.boxX=Math.max(minX,Math.min(maxX,c.boxX));if(minY<=maxY)c.boxY=Math.max(minY,Math.min(maxY,c.boxY));syncSourceCropFromView();drawCropStage();return}
    if(mode==="resize"){markCropManual();const h=start.handle,b=start.box,min=40;let L=b.x,T=b.y,R=b.x+b.w,B=b.y+b.h;const left=[0,7,6].includes(h),right=[2,3,4].includes(h),top=[0,1,2].includes(h),bottom=[4,5,6].includes(h);if(left)L=b.x+dx;if(right)R=b.x+b.w+dx;if(top)T=b.y+dy;if(bottom)B=b.y+b.h+dy;if(left&&R-L<min)L=R-min;if(right&&R-L<min)R=L+min;if(top&&B-T<min)T=B-min;if(bottom&&B-T<min)B=T+min;const im=getImageRect();if(left&&L<im.left)L=im.left;if(right&&R>im.right)R=im.right;if(top&&T<im.top)T=im.top;if(bottom&&B>im.bottom)B=im.bottom;if(left&&R-L<min&&im.right-im.left>=min)L=Math.max(im.left,R-min);if(right&&R-L<min&&im.right-im.left>=min)R=Math.min(im.right,L+min);if(top&&B-T<min&&im.bottom-im.top>=min)T=Math.max(im.top,B-min);if(bottom&&B-T<min&&im.bottom-im.top>=min)B=Math.min(im.bottom,T+min);c.boxX=L;c.boxY=T;c.boxW=Math.max(1,R-L);c.boxH=Math.max(1,B-T);syncSourceCropFromView();drawCropStage()}
  });
  const end=e=>{pointers.delete(e.pointerId);if(pointers.size<2){lastDist=0;lastMid=null}if(!pointers.size){mode=null;start=null;activePerspectiveHandle=-1;setTimeout(hideCropLoupe,180)}};
  stage.addEventListener("pointerup",end);stage.addEventListener("pointercancel",end);stage.addEventListener("pointerleave",()=>{});
  stage.addEventListener("wheel",e=>{e.preventDefault();setCropZoom((state.crop?.zoom||1)+(e.deltaY<0?.1:-.1))},{passive:false});
}
function toggleCropFullscreen(){const m=$("#cropModal");if(!m||!state.crop)return;const entering=!m.classList.contains("crop-fullscreen");if(entering&&els.cropStage.clientWidth){state.crop.boxNorm={x:state.crop.boxX/els.cropStage.clientWidth,y:state.crop.boxY/els.cropStage.clientHeight,w:state.crop.boxW/els.cropStage.clientWidth,h:state.crop.boxH/els.cropStage.clientHeight}}m.classList.toggle("crop-fullscreen");state.crop.boxW=null;state.crop.boxH=null;state.crop.boxX=null;state.crop.boxY=null;requestAnimationFrame(()=>{drawCropStage();setPerspectiveUI(!!state.crop.perspectiveMode)})}
function closeCropModal(){state.crop=null;state.cropTarget=null;$("#cropModal")?.classList.remove("crop-fullscreen")}
async function applyCrop(){
  const c=state.crop,t=state.cropTarget;if(!c||!t)return;busy("cropApply",true);
  try{if(c.perspectiveMode)initPerspective(c);else syncSourceCropFromView();const out=c.perspectiveMode?await renderPerspectiveCrop(c):await renderCrop(c),p=state.workflow.persons.find(x=>x.id===t.personId),old=p[t.side]?.url;
    p[t.side]={...p[t.side],...out,cropped:true,auto:false,cropState:{x:c.x,y:c.y,width:c.width,height:c.height,zoom:c.zoom,panX:c.panX,panY:c.panY,rotation:c.rotation,perspectiveMode:!!c.perspectiveMode,perspectivePoints:c.perspectivePoints?.map(p=>({x:p.x,y:p.y}))||null,boxNorm:{x:(c.boxX||0)/els.cropStage.clientWidth,y:(c.boxY||0)/els.cropStage.clientHeight,w:(c.boxW||0)/els.cropStage.clientWidth,h:(c.boxH||0)/els.cropStage.clientHeight}}};
    if(old?.startsWith("blob:"))URL.revokeObjectURL(old);renderPersonCards();closeModal("cropModal");toast("Crop added")
  }catch(e){toast(e.message||"Crop failed","error")}finally{busy("cropApply",false)}
}
async function renderCrop(c,outSize=null){
  /* Render directly from the source rectangle. This guarantees that zooming or
     moving the image cannot silently change the crop selection. */
  const outW=Math.max(1,Math.round(outSize?.w||c.width)),outH=Math.max(1,Math.round(outSize?.h||c.height)),boost=Math.max(1,300/outW,300/outH),ow=Math.round(outW*boost),oh=Math.round(outH*boost),can=document.createElement("canvas");can.width=ow;can.height=oh;
  const ctx=can.getContext("2d");ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";ctx.fillStyle="#fff";ctx.fillRect(0,0,ow,oh);
  ctx.drawImage(c.source,c.x,c.y,c.width,c.height,0,0,ow,oh);
  const url=can.toDataURL("image/png");return{url,image:await loadImage(url)}
}
function prepareFinalPreview(){const wf=state.workflow;if(!wf)return;const p=wf.persons[0];if(wf.type==="passport"&&!wf.persons.length)return toast("Add at least one person","warn");if(wf.type==="passport"&&wf.persons.some(x=>!x.front))return toast("Choose a photo for every person","warn");if(wf.type!=="passport"&&!wf.persons.some(x=>x.front))return toast("Add at least one front side","warn");renderA4Preview();setStep("preview")}
function setStep(step){$("#stepUpload").classList.toggle("hidden",step!=="upload");$("#stepPreview").classList.toggle("hidden",step!=="preview");$$("#stepper span").forEach((s,i)=>s.classList.toggle("active",step==="upload"?i===0:i>=2))}
function getPersonSettings(person) {
  const wf = state.workflow;
  const global = wf?.photoSettings || {};
  if (!person.layoutSettings) {
    person.layoutSettings = {
      photoScale: Number(global.photoScale ?? 100),
      gapX: Number(global.gapX ?? 2),
      gapY: Number(global.gapY ?? 2),
      border: global.border ?? false,
      borderWidth: Number(global.borderWidth ?? 0.5)
    };
  }
  return person.layoutSettings;
}
function currentItems(){
  const wf=state.workflow;
  if(wf.type==="passport"){
    const items=[];
    wf.persons.filter(p=>p.front).forEach(p=>{
      const s=getPersonSettings(p);
      const q=Math.max(1,Number(p.quantity)||6),im=p.front.image||{};
      const nw=Math.max(1,Number(im.naturalWidth)||1),nh=Math.max(1,Number(im.naturalHeight)||1);
      const scale=Math.max(.1,Number(s.photoScale)||100)/100;
      const w=nw/300*25.4*scale,h=nh/300*25.4*scale;
      const borderMm=s.border?Math.max(0,Number(s.borderWidth)||0):0;
      for(let i=0;i<q;i++)items.push({src:p.front.url,type:"photo",w,h,border:!!s.border,borderMm,personId:p.id});
    });
    return items;
  }
  const a=[];
  wf.persons.filter(x=>x.front).forEach((p,index)=>{
    a.push({src:p.front.url,type:"card",w:85.6,h:54,person:index+1,side:"front"});
    if(p.back)a.push({src:p.back.url,type:"card",w:85.6,h:54,person:index+1,side:"back"});
  });
  return a;
}
function getPaper(wf){const l=wf?.layoutSettings||{};const presets={a4:[210,297],a5:[148,210],letter:[215.9,279.4],legal:[215.9,355.6]};if(l.paper==="custom")return{width:Math.max(30,+l.width||210),height:Math.max(30,+l.height||297)};const [width,height]=presets[l.paper]||presets.a4;return{width,height}}
function layoutPages(wf){
  if(wf.type==="passport") return passportPages(wf);

  const paper=getPaper(wf),pages=[[]],
        mx=8,my=8,cw=85.6,ch=54,gap=8,pairGap=8;
  let y=my;

  for(const [personIndex,p] of wf.persons.filter(x=>x.front).entries()){
    if(y+ch>paper.height-my){
      pages.push([]);
      y=my;
    }

    const personNo=personIndex+1;

    pages.at(-1).push({
      src:p.front.url,
      type:"card",
      w:cw,
      h:ch,
      x:mx,
      y,
      person:personNo,
      side:"front"
    });

    if(p.back){
      pages.at(-1).push({
        src:p.back.url,
        type:"card",
        w:cw,
        h:ch,
        x:mx+cw+pairGap,
        y,
        person:personNo,
        side:"back"
      });
    }

    y+=ch+gap;
  }

  return pages
    .map(items=>items.map(it=>({...it})))
    .filter(page=>page.length);
}
function passportPages(wf){
  const paper=getPaper(wf),items=currentItems(),pages=[[]];
  let x=8,y=8,rowH=0,rowGap=0;
  for(const [index,it] of items.entries()){
    const person=wf.persons.find(p=>p.id===it.personId)||wf.persons[0];
    const s=getPersonSettings(person);
    const gapX=Math.max(0,Number(s.gapX)||0),gapY=Math.max(0,Number(s.gapY)||0);
    if(x+it.w>paper.width-8){x=8;y+=rowH+rowGap;rowH=0;rowGap=gapY}
    if(y+it.h>paper.height-8){pages.push([]);x=8;y=8;rowH=0;rowGap=0}
    pages.at(-1).push({...it,x,y,border:!!s.border,borderMm:s.border?Math.max(0,Number(s.borderWidth)||0):0});
    x+=it.w+gapX;rowH=Math.max(rowH,it.h);rowGap=Math.max(rowGap,gapY);
  }
  return pages.filter(page=>page.length);
}
function renderPassportPagesOnly(){const wf=state.workflow;if(!wf)return;const paper=getPaper(wf);els.a4Preview.querySelectorAll(".page-label,.preview-page").forEach(n=>n.remove());const pages=layoutPages(wf);for(const [pi,items] of pages.entries()){const lab=document.createElement("div");lab.className="page-label";lab.textContent=`${paper.width} × ${paper.height} mm • Page ${pi+1} • ${pages.length} total`;els.a4Preview.appendChild(lab);const page=document.createElement("div");page.className="a4-page preview-page";page.style.aspectRatio=`${paper.width}/${paper.height}`;page.style.setProperty("--paper-ratio",`${paper.width}/${paper.height}`);els.a4Preview.appendChild(page);for(const it of items){const d=document.createElement("div");d.className="a4-item";Object.assign(d.style,{left:`${it.x/paper.width*100}%`,top:`${it.y/paper.height*100}%`,width:`${it.w/paper.width*100}%`,height:`${it.h/paper.height*100}%`});if(it.border&&it.borderMm>0)d.style.border=`${it.borderMm}mm solid #111`;const im=new Image();im.src=it.src;d.appendChild(im);if($("#cutMarks")?.checked&&wf.type!=="passport")d.classList.add("mark");page.appendChild(d)}}}
async function renderA4Preview(){
  const wf=state.workflow;if(!wf)return;
  els.a4Preview.innerHTML="";const paper=getPaper(wf);
  const bar=document.createElement("div");bar.className="final-controls layout-controls clean-final-controls";
  bar.innerHTML=`${wf.type==="passport"?`<label class="person-select-label">Edit person <select id="finalPersonSelect">${wf.persons.map((p,i)=>`<option value="${p.id}">Person ${i+1}</option>`).join("")}</select></label><label>Photo size <input id="photoSizeSlider" type="range" min="25" max="200" step="1"><span id="photoSizeValue"></span></label><label>Horizontal gap <input id="gapXSlider" type="range" min="0" max="10" step="0.5"><span id="gapXValue"></span></label><label>Vertical gap <input id="gapYSlider" type="range" min="0" max="10" step="0.5"><span id="gapYValue"></span></label><label class="check-row">Black border <input id="photoBorder" type="checkbox"></label><label>Border thickness <input id="borderWidthSlider" type="range" min="0.1" max="3" step="0.1"><span id="borderWidthValue"></span></label><button id="applyPassportSettingsAll" type="button" class="btn primary apply-all-btn">Apply to All</button>`:""}<label>Paper <select id="paperSize"><option value="a4">A4</option><option value="a5">A5</option><option value="letter">Letter</option><option value="legal">Legal</option><option value="custom">Custom</option></select></label><label id="customPaperWrap" class="hidden">W <input id="customPaperW" type="number" min="30" max="500" step="1" value="${paper.width}"> H <input id="customPaperH" type="number" min="30" max="500" step="1" value="${paper.height}"></label>`;
  els.a4Preview.appendChild(bar);const ps=$("#paperSize");ps.value=wf.layoutSettings.paper;bindLayoutControls();
  if(wf.type==="passport"){bindPassportControls();renderPassportPagesOnly();return}
  const pages=layoutPages(wf);
  for(const [pi,items] of pages.entries()){
    const lab=document.createElement("div");lab.className="page-label";lab.textContent=`${paper.width} × ${paper.height} mm • Page ${pi+1} • ${pages.length} total`;els.a4Preview.appendChild(lab);
    const page=document.createElement("div");page.className="a4-page preview-page";page.style.aspectRatio=`${paper.width}/${paper.height}`;page.style.setProperty("--paper-ratio",`${paper.width}/${paper.height}`);els.a4Preview.appendChild(page);
    for(const [index,it] of items.entries()){
      const d=document.createElement("div");d.className="a4-item";Object.assign(d.style,{left:`${it.x/paper.width*100}%`,top:`${it.y/paper.height*100}%`,width:`${it.w/paper.width*100}%`,height:`${it.h/paper.height*100}%`});
      if(it.border&&it.borderMm>0)d.style.border=`${it.borderMm}mm solid #111`;
      const im=new Image();im.src=it.src;d.appendChild(im);if($("#cutMarks")?.checked)d.classList.add("mark");page.appendChild(d);
      if($("#foldingLine")?.checked&&it.side==="front"){
        const next=items[index+1];
        if(next&&next.side==="back"&&next.person===it.person){
          const centerX=(it.x+it.w+next.x)/2,top=Math.min(it.y,next.y),bottom=Math.max(it.y+it.h,next.y+next.h);
          const line=document.createElement("div");line.className="folding-line";
          line.style.left=`${centerX/paper.width*100}%`;line.style.top=`${top/paper.height*100}%`;line.style.height=`${(bottom-top)/paper.height*100}%`;
          page.appendChild(line);
        }
      }
    }
  }
}

function bindLayoutControls(){
  const wf=state.workflow;
  if(!wf)return;
  wf.layoutSettings=wf.layoutSettings||{paper:"a4",width:210,height:297};
  const select=$("#paperSize"),wrap=$("#customPaperWrap"),w=$("#customPaperW"),h=$("#customPaperH");
  const applyPaper=()=>{
    if(select)wf.layoutSettings.paper=select.value||"a4";
    if(wrap)wrap.classList.toggle("hidden",wf.layoutSettings.paper!=="custom");
    if(wf.layoutSettings.paper==="custom"){
      wf.layoutSettings.width=Math.max(30,Number(w?.value)||210);
      wf.layoutSettings.height=Math.max(30,Number(h?.value)||297);
    }
    renderPassportPagesOnly();
  };
  select?.addEventListener("change",applyPaper);
  [w,h].forEach(el=>el?.addEventListener("input",applyPaper));
  if(wrap)wrap.classList.toggle("hidden",wf.layoutSettings.paper!=="custom");
}

function bindPassportControls(){
  const wf=state.workflow;if(!wf)return;
  const select=$("#finalPersonSelect");
  const getSelected=()=>wf.persons.find(p=>p.id===select?.value)||wf.persons[0];
  const sync=()=>{const p=getSelected();if(!p)return;const s=getPersonSettings(p);const map=[["#photoSizeSlider","#photoSizeValue",s.photoScale,v=>`${v}%`],["#gapXSlider","#gapXValue",s.gapX,v=>`${v} mm`],["#gapYSlider","#gapYValue",s.gapY,v=>`${v} mm`],["#borderWidthSlider","#borderWidthValue",s.borderWidth,v=>`${v} mm`]];map.forEach(([a,b,val,fmt])=>{const el=$(a),out=$(b);if(el)el.value=val;if(out)out.textContent=fmt(val)});const border=$("#photoBorder"),bw=$("#borderWidthSlider");if(border)border.checked=!!s.border;if(bw)bw.disabled=!s.border};
  sync();select?.addEventListener("change",sync);
  const specs=[["#photoSizeSlider","photoScale",1],["#gapXSlider","gapX",0.5],["#gapYSlider","gapY",0.5],["#borderWidthSlider","borderWidth",0.1]];
  let raf=0;const schedule=()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>renderPassportPagesOnly())};
  specs.forEach(([selector,key])=>{const input=$(selector);if(!input)return;const output=$(selector.replace("Slider","Value"));input.addEventListener("input",()=>{const p=getSelected();if(!p)return;const s=getPersonSettings(p);s[key]=Number(input.value);if(output)output.textContent=key==="photoScale"?`${s[key]}%`:`${s[key]} mm`;schedule()},{passive:true});const label=input.closest("label");if(label&&!label.querySelector(".range-nudges")){const nudges=document.createElement("span");nudges.className="range-nudges";const minus=document.createElement("button");minus.type="button";minus.className="range-nudge";minus.textContent="−";const plus=document.createElement("button");plus.type="button";plus.className="range-nudge";plus.textContent="+";const changeBy=d=>{const min=Number(input.min||0),max=Number(input.max||100);const next=Math.max(min,Math.min(max,Number(input.value)+d));input.value=String(next);input.dispatchEvent(new Event("input",{bubbles:true}))};minus.onclick=()=>changeBy(-Number(input.step||1));plus.onclick=()=>changeBy(Number(input.step||1));nudges.append(minus,plus);label.appendChild(nudges)}});
  $("#photoBorder")?.addEventListener("change",e=>{const p=getSelected();if(!p)return;const s=getPersonSettings(p);s.border=e.target.checked;$("#borderWidthSlider")?.toggleAttribute("disabled",!s.border);schedule()});
  $("#applyPassportSettingsAll")?.addEventListener("click",()=>{const source=getSelected();if(!source)return;const src={...getPersonSettings(source)};wf.persons.forEach(p=>p.layoutSettings={...src});sync();schedule();toast("Settings applied to all persons","success")});
}

function openSectionFull(type){
  const modal=$("#sectionFullModal"),body=$("#sectionFullBody");
  if(!modal||!body)return;
  const isTools=type==="tools";
  $("#sectionFullEyebrow").textContent=isTools?"TOOLS":"DOCUMENT SERVICES";
  $("#sectionFullTitle").textContent=isTools?"All Tools":"All Services";
  $("#sectionFullDesc").textContent=isTools?"All available PDF and document tools":"All available document print services";
  body.innerHTML="";
  if(isTools){
    const tools=[
      ["jpg-pdf","JPG","JPG → PDF","Multiple images"],
      ["pdf-jpg","PDF","PDF → JPG","All pages"],
      ["compress-jpg","IMG","Compress JPG","High / Medium / Low"],
      ["merge-pdf","PDF+","Merge PDF","Keep page order"],
      ["split-pdf","PDF÷","Split PDF","Extract pages"],
      ["rotate-pdf","↻","Rotate PDF","Rotate pages"],
      ["compress-pdf","ZIP","Compress PDF","Reduce file size"],
      ["unlock-pdf","🔓","Unlock PDF","Save unlocked copy"]
    ];
    const grid=document.createElement("div");grid.className="full-tools-grid";
    tools.forEach(([id,icon,name,desc])=>{
      const b=document.createElement("button");b.className="tool-card full-tool-card";
      b.innerHTML=`<span>${icon}</span><b>${name}</b><small>${desc}</small>`;
      b.addEventListener("click",()=>{closeModal("sectionFullModal");openTool(id)});
      grid.appendChild(b);
    });
    body.appendChild(grid);
  }else{
    const grid=document.createElement("div");grid.className="full-service-grid";
    state.services.forEach(service=>{
      const b=document.createElement("button");b.className="service-card full-service-card";
      const p=state.servicePrices?.find(x=>x.id===service.id)||{};const one=Number(p.activationFee||0),use=Number(p.usageFee||0);let priceText="Free";if(one>0&&use>0)priceText=`Activation ${money(one)} • Use ${money(use)}`;else if(one>0)priceText=`Activation ${money(one)}`;else if(use>0)priceText=`Per use ${money(use)}`;b.innerHTML=`<span class="svc-icon">${safe(service.icon||"▣")}</span><b>${safe(service.name||"Service")}</b><small>${safe(service.description||"Document print service")}</small><strong class="service-price">${safe(priceText)}</strong><i>›</i>`;
      b.addEventListener("click",()=>{closeModal("sectionFullModal");openService(service)});
      grid.appendChild(b);
    });
    if(!state.services.length)grid.innerHTML='<div class="empty-state"><b>No services available</b><small>Ask the admin to enable a service.</small></div>';
    body.appendChild(grid);
  }
  openModal("sectionFullModal");
}

function showExportChoices(){openTool("export")}
function drawFoldingLineMm(ctx,front,back,paper,cw,ch){
  if(!$("#foldingLine")?.checked||front?.side!=="front"||back?.side!=="back"||front.person!==back.person)return;
  const centerX=((front.x+front.w+back.x)/2)/paper.width*cw;
  const top=Math.min(front.y,back.y)/paper.height*ch;
  const bottom=Math.max(front.y+front.h,back.y+back.h)/paper.height*ch;
  ctx.save();ctx.strokeStyle="#555";ctx.lineWidth=Math.max(1,0.35/210*cw);ctx.setLineDash([Math.max(3,2/210*cw),Math.max(3,2/210*cw)]);ctx.beginPath();ctx.moveTo(centerX,top);ctx.lineTo(centerX,bottom);ctx.stroke();ctx.restore();
}
function drawFoldingLinePdf(pdf,front,back){
  if(!$("#foldingLine")?.checked||front?.side!=="front"||back?.side!=="back"||front.person!==back.person)return;
  const centerX=(front.x+front.w+back.x)/2,top=Math.min(front.y,back.y),bottom=Math.max(front.y+front.h,back.y+back.h);
  pdf.setDrawColor(85,85,85);pdf.setLineWidth(0.35);pdf.setLineDashPattern([2,2],0);pdf.line(centerX,top,centerX,bottom);pdf.setLineDashPattern([],0);
}
async function exportCurrent(format){
  const wf=state.workflow;if(!wf)return;busy(`export-${format}`,true);
  try{
    const pages=layoutPages(wf),all=[];for(const items of pages){const arr=[];for(const it of items)arr.push({it,img:await loadImage(it.src)});all.push(arr)}
    const paper=getPaper(wf);
    if(format==="pdf"){
      const{jsPDF}=await import("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.es.min.js"),pdf=new jsPDF({unit:"mm",format:[paper.width,paper.height],compress:true});
      all.forEach((items,pi)=>{if(pi)pdf.addPage();items.forEach(({it,img},idx)=>{pdf.addImage(img.src,"PNG",it.x,it.y,it.w,it.h);if(it.border&&it.borderMm>0){pdf.setDrawColor(0,0,0);pdf.setLineWidth(it.borderMm);pdf.rect(it.x,it.y,it.w,it.h)}if(it.side==="front"){const next=items[idx+1]?.it;if(next&&next.side==="back"&&next.person===it.person)drawFoldingLinePdf(pdf,it,next)}})});
      pdf.save(`print-portal-${Date.now()}.pdf`);await commitPendingUsageCharge();recordJob(wf.service.name,"PDF");
    }else{
      for(let pi=0;pi<all.length;pi++){
        const c=document.createElement("canvas");c.width=2480;c.height=Math.max(1,Math.round(2480*paper.height/paper.width));const ctx=c.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);
        all[pi].forEach(({it,img},idx)=>{const x=it.x/paper.width*c.width,y=it.y/paper.height*c.height,w=it.w/paper.width*c.width,h=it.h/paper.height*c.height;ctx.drawImage(img,x,y,w,h);if(it.border&&it.borderMm>0){ctx.save();ctx.strokeStyle="#111";ctx.lineWidth=it.borderMm/210*c.width;ctx.strokeRect(x,y,w,h);ctx.restore()}if(it.side==="front"){const next=all[pi][idx+1]?.it;if(next&&next.side==="back"&&next.person===it.person)drawFoldingLineMm(ctx,it,next,paper,c.width,c.height)}});
        downloadData(c.toDataURL(format==="jpg"?"image/jpeg":"image/png",format==="jpg"?.95:1),`print-page-${pi+1}-${Date.now()}.${format}`)
      }
      await commitPendingUsageCharge();recordJob(wf.service.name,format)
    }
    closeModal("toolModal");toast(`${format.toUpperCase()} generated successfully`)
  }catch(e){if(state.pendingUsageCharges?.length)await refundPendingUsageCharge();toast(e.message||"Export failed","error")}finally{busy(`export-${format}`,false)}
}
async function printCurrentLayout(){
  const wf=state.workflow;if(!wf)return;const paper=getPaper(wf),out=[];
  try{
    for(const items of layoutPages(wf)){
      const c=document.createElement("canvas");c.width=2480;c.height=Math.round(2480*paper.height/paper.width);const ctx=c.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);
      for(let i=0;i<items.length;i++){const it=items[i],im=await loadImage(it.src),x=it.x/paper.width*c.width,y=it.y/paper.height*c.height,w=it.w/paper.width*c.width,h=it.h/paper.height*c.height;ctx.drawImage(im,x,y,w,h);if(it.side==="front"){const next=items[i+1];if(next&&next.side==="back"&&next.person===it.person)drawFoldingLineMm(ctx,it,next,paper,c.width,c.height)}}
      out.push(c.toDataURL("image/png",1))
    }
    const w=window.open("","_blank");if(!w)throw Error("Browser blocked print window");w.document.write(`<html><head><title>Print Portal</title><style>@page{size:${paper.width}mm ${paper.height}mm;margin:0}html,body{margin:0}img{width:${paper.width}mm;height:${paper.height}mm;display:block;page-break-after:always}</style></head><body>${out.map(x=>`<img src="${x}">`).join("")}</body></html>`);w.document.close();w.onload=()=>{w.focus();w.print()};await commitPendingUsageCharge();recordJob(state.workflow.service.name,"PRINT")
  }catch(e){if(state.pendingUsageCharges?.length)await refundPendingUsageCharge();toast(e.message||"Print failed","error")}
}

async function loadRecentJobs(){if(!state.user){renderRecentJobs();return}try{const q=await getDocs(query(collection(db,"users",state.user.uid,"recentJobs"),orderBy("createdAt","desc"),limit(30)));const jobs=q.docs.map(d=>({id:d.id,...d.data(),createdAt:d.data().createdAt?.toMillis?.()||Date.now()}));localStorage.setItem(recentKey,JSON.stringify(jobs));renderRecentJobs()}catch{renderRecentJobs()}}
async function recordJob(service,output){const job={id:id(),service,output,status:"completed",createdAt:Date.now()};if(state.user){try{await addDoc(collection(db,"users",state.user.uid,"recentJobs"),{...job,createdAt:serverTimestamp()});await loadRecentJobs();return}catch{}}let jobs=[];try{jobs=JSON.parse(localStorage.getItem(recentKey)||"[]")}catch{}jobs.unshift(job);localStorage.setItem(recentKey,JSON.stringify(jobs.slice(0,30)));renderRecentJobs()}
function renderRecentJobs(){let jobs=[];try{jobs=JSON.parse(localStorage.getItem(recentKey)||"[]")}catch{}if(!jobs.length){els.recentJobs.innerHTML='<div class="empty-state"><span>◌</span><b>No recent jobs</b><small>Your completed print/export jobs will appear here.</small></div>';return}els.recentJobs.innerHTML="";jobs.slice(0,12).forEach(j=>{const d=document.createElement("div");d.className="job-row";d.innerHTML=`<span class="job-icon">✓</span><div><b></b><small></small></div><span class="status">Completed</span>`;$("b",d).textContent=j.service;$("small",d).textContent=`${new Date(j.createdAt).toLocaleString()} • ${j.output}`;els.recentJobs.appendChild(d)})}

/* Tools from the original UI */
async function openTool(tool){if(tool==="export"){const m=$("#toolModal");if(m)openModal("toolModal");return}const m=$("#toolModal");if(!m)return;openModal("toolModal");$("#toolTitle").textContent=tool||"Tool";$("#toolRun")?.setAttribute("data-tool",tool)}
function toolUI(tool){const body=$("#toolBody");body.innerHTML="";if(tool==="export"){body.innerHTML='<div class="tool-form"><button class="primary-btn" id="export-pdf">Download PDF</button><button class="secondary-btn" id="export-jpg">Download JPG</button><button class="secondary-btn" data-close="toolModal">Close</button></div>';$("#export-pdf").onclick=()=>exportCurrent("pdf");$("#export-jpg").onclick=()=>exportCurrent("jpg");return}body.innerHTML=`<div class="tool-form"><div class="tool-drop"><p>Select files for this tool</p><input id="toolFiles" type="file" multiple accept="image/*,application/pdf"></div><div id="toolExtra"></div><button class="primary-btn" id="runToolBtn">Run tool</button></div>`;const extra=$("#toolExtra");if(tool==="compress-jpg")extra.innerHTML='<label>Quality <input id="quality" type="range" min=".2" max="1" step=".05" value=".75"></label>';if(tool==="split-pdf")extra.innerHTML='<label>Pages <input id="splitPages" placeholder="Example: 1-3,5,8"></label><small>Leave blank to use all pages.</small>';if(tool==="rotate-pdf")extra.innerHTML='<label>Rotate <select id="rotatePdfAngle"><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select></label>';$("#runToolBtn").onclick=()=>runTool(tool)}
const _openTool=openTool;openTool=async function(tool){if(tool==="export"){$("#toolTitle").textContent="Export";$ ("#toolDesc").textContent="Download your final A4 layout";openModal("toolModal");toolUI("export");return}$("#toolTitle").textContent=tool.replaceAll("-"," ");$("#toolDesc").textContent="Choose files and run the tool";openModal("toolModal");toolUI(tool)};
async function runTool(tool){const files=[...($("#toolFiles")?.files||[])];if(!files.length)return toast("Select files","warn");busy("runToolBtn",true);try{const{jsPDF}=await import("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.es.min.js");if(tool==="jpg-pdf"){const pdf=new jsPDF({unit:"mm",format:"a4"});for(let i=0;i<files.length;i++){if(i)pdf.addPage();const img=await fileToDataURL(files[i]);pdf.addImage(img,"JPEG",0,0,210,297)}pdf.save(`jpg-to-pdf-${Date.now()}.pdf`)}else if(tool==="compress-jpg"){const q=+$("#quality").value,img=await loadImage(URL.createObjectURL(files[0])),scale=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight)),c=document.createElement("canvas");c.width=Math.round(img.naturalWidth*scale);c.height=Math.round(img.naturalHeight*scale);c.getContext("2d").drawImage(img,0,0,c.width,c.height);downloadData(c.toDataURL("image/jpeg",q),`compressed-${Date.now()}.jpg`)}else if(tool==="pdf-jpg"){let n=0;for(const f of files)for(const x of await renderAllPdfPages(f))downloadData(x,`pdf-page-${++n}.jpg`)}else if(tool==="merge-pdf"){const pdf=new jsPDF({unit:"mm",format:"a4"});let first=true;for(const f of files)for(const x of await renderAllPdfPages(f)){if(!first)pdf.addPage();first=false;pdf.addImage(x,"JPEG",0,0,210,297)}pdf.save(`merged-${Date.now()}.pdf`)}else if(tool==="split-pdf"){const f=files[0],pdfSrc=await getPdf(f),raw=($("#splitPages")?.value||`1-${pdfSrc.numPages}`).trim();const nums=[];raw.split(",").forEach(part=>{const [a,b]=part.split("-").map(x=>parseInt(x,10));if(Number.isFinite(a)){if(Number.isFinite(b))for(let n=Math.min(a,b);n<=Math.max(a,b);n++)nums.push(n);else nums.push(a)}});const out=new jsPDF({unit:"mm",format:"a4"});let first=true;for(const n of [...new Set(nums)].filter(n=>n>=1&&n<=pdfSrc.numPages)){const x=await renderPdfPage(f,n);if(!first)out.addPage();first=false;out.addImage(x.url,"JPEG",0,0,210,297)}if(!first)out.save(`split-${Date.now()}.pdf`);else throw Error("Enter valid page numbers") }else if(tool==="rotate-pdf"){const angle=(+$("#rotatePdfAngle")?.value||90)%360,f=files[0],src=await getPdf(f),out=new jsPDF({unit:"mm",format:"a4"});for(let n=1;n<=src.numPages;n++){if(n>1)out.addPage();const x=await renderPdfPage(f,n);out.addImage(x.url,"JPEG",0,0,210,297,undefined,"FAST",angle)}out.save(`rotated-${Date.now()}.pdf`)}else if(tool==="compress-pdf"||tool==="unlock-pdf"){const f=files[0],src=await getPdf(f),out=new jsPDF({unit:"mm",format:"a4",compress:true});for(let n=1;n<=src.numPages;n++){if(n>1)out.addPage();const page=await src.getPage(n),vp=page.getViewport({scale:1.25}),c=document.createElement("canvas");c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);await page.render({canvasContext:c.getContext("2d"),viewport:vp}).promise;out.addImage(c.toDataURL("image/jpeg",tool==="compress-pdf"?.65:.9),"JPEG",0,0,210,297)}out.save(`${tool===`unlock-pdf`?`unlocked`:`compressed`}-${Date.now()}.pdf`)}recordJob(tool,tool);toast("Tool completed");closeModal("toolModal")}catch(e){if(e?.code!=="PDF_CANCELLED")toast(e.message||"Tool failed","error")}finally{busy("runToolBtn",false)}}
async function fileToDataURL(f){if(f.type==="application/pdf")return(await fileToPage(f,1)).url;return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(f)})}
async function renderAllPdfPages(file){const pdf=await getPdf(file),out=[];for(let n=1;n<=pdf.numPages;n++){const p=await pdf.getPage(n),vp=p.getViewport({scale:1.5}),c=document.createElement("canvas");c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);await p.render({canvasContext:c.getContext("2d"),viewport:vp}).promise;out.push(c.toDataURL("image/jpeg",.9))}return out}
window.addEventListener("resize",()=>{if(state.crop){state.crop.boxW=null;state.crop.boxH=null;state.crop.boxX=null;state.crop.boxY=null;requestAnimationFrame(drawCropStage)}});


/* =====================================================
   V4 USER WALLET / REQUESTS / NOTIFICATIONS / ACCOUNT ACCESS
   ===================================================== */
state.wallet={balance:0,upiId:""};state.userNotifications=[];state.userTransactions=[];state.userRequests=[];state.portalSettings={};state.pendingServiceForPayment=null;state.userUnsubs=[];
function money(n){return `₹${Number(n||0).toLocaleString("en-IN")}`}
async function loadPortalData(){
 if(!state.user)return;
 state.userUnsubs.forEach(u=>{try{u()}catch{}});state.userUnsubs=[];
 try{const [u,setting,notes,txs,acts,mrs,ars]=await Promise.all([
  getDoc(doc(db,"users",state.user.uid)),getDoc(doc(db,"portalSettings","payments")),
  getDocs(query(collection(db,"users",state.user.uid,"notifications"),orderBy("createdAt","desc"),limit(100))),
  getDocs(query(collection(db,"users",state.user.uid,"transactions"),orderBy("createdAt","desc"),limit(100))),
  getDocs(query(collection(db,"activationRequests"),where("uid","==",state.user.uid))),
  getDocs(query(collection(db,"moneyRequests"),where("uid","==",state.user.uid))),
  getDocs(query(collection(db,"accountActivationRequests"),where("uid","==",state.user.uid)))
 ]);if(u.exists())state.profile={...state.profile,...u.data()};state.wallet.balance=Number(state.profile?.walletBalance||0);state.wallet.upiId=setting.data()?.upiId||"";state.portalSettings=setting.data()||{};try{const sp=await getDocs(collection(db,"servicePricing"));state.servicePrices=sp.docs.map(d=>({id:d.id,...d.data()}));renderServices()}catch{}state.userNotifications=notes.docs.map(d=>({id:d.id,...d.data()}));state.userTransactions=txs.docs.map(d=>({id:d.id,...d.data()}));state.userRequests=[...acts.docs.map(d=>({id:d.id,kind:"Service",...d.data()})),...mrs.docs.map(d=>({id:d.id,kind:"Money",...d.data()})),...ars.docs.map(d=>({id:d.id,kind:"Account",...d.data()}))].sort((a,b)=>Math.max(timeValue(b.reviewedAt),timeValue(b.createdAt))-Math.max(timeValue(a.reviewedAt),timeValue(a.createdAt)));updateWalletUI();renderNotifications();renderTransactions();
  const un=onSnapshot(doc(db,"users",state.user.uid),snap=>{if(snap.exists()){state.profile={...state.profile,...snap.data()};state.wallet.balance=Number(state.profile.walletBalance||0);updateWalletUI();if(state.profile.status==="blocked")showBlockedAccountModal();else closeModal("accountBlockedModal")}});state.userUnsubs.push(un);
  const nn=onSnapshot(query(collection(db,"users",state.user.uid,"notifications"),orderBy("createdAt","desc"),limit(100)),snap=>{state.userNotifications=snap.docs.map(d=>({id:d.id,...d.data()}));renderNotifications()});state.userUnsubs.push(nn);
  const tt=onSnapshot(query(collection(db,"users",state.user.uid,"transactions"),orderBy("createdAt","desc"),limit(100)),snap=>{state.userTransactions=snap.docs.map(d=>({id:d.id,...d.data()}));renderTransactions()});state.userUnsubs.push(tt);
 }catch(e){console.warn("Portal data",e);updateWalletUI()}
}
function timeValue(v){return v?.toMillis?v.toMillis():v?.seconds?v.seconds*1000:Number(v||0)}
function updateWalletUI(){$("#walletBalance")&&( $("#walletBalance").textContent=money(state.wallet.balance));$("#walletModalBalance")&&($("#walletModalBalance").textContent=money(state.wallet.balance));const unread=state.userNotifications.filter(n=>n.read!==true).length;const b=$("#notificationBadge");if(b){b.textContent=unread;b.classList.toggle("hidden",!unread)}}
function qrMake(elId,text){const box=$("#"+elId);if(!box)return;box.innerHTML="";if(!text)return;try{if(window.QRCode)new window.QRCode(box,{text,width:190,height:190,colorDark:"#111827",colorLight:"#ffffff"});else box.innerHTML=`<img alt="UPI QR" src="https://api.qrserver.com/v1/create-qr-code/?size=190x190&data=${encodeURIComponent(text)}">`}catch{box.innerHTML=`<img alt="UPI QR" src="https://api.qrserver.com/v1/create-qr-code/?size=190x190&data=${encodeURIComponent(text)}">`}}
function openWallet(){if(!state.user)return openModal("authModal");$("#walletAmount").value="";$("#walletUtr").value="";$("#walletUpiText").textContent=state.wallet.upiId?`Pay to UPI: ${state.wallet.upiId}`:"Admin has not configured UPI yet.";$("#walletQr").innerHTML="";openModal("walletModal")}
function refreshWalletQr(){const input=$("#walletAmount"),amt=Number(input?.value||0);if(!Number.isFinite(amt)||amt<1||!state.wallet.upiId){$("#walletQr").innerHTML="";return}const uri=`upi://pay?pa=${encodeURIComponent(state.wallet.upiId)}&pn=Print%20Portal&am=${amt.toFixed(2)}&cu=INR`;qrMake("walletQr",uri)}
async function submitWalletRequest(){if(!state.user)return;const rawAmount=Number($("#walletAmount").value||0),amount=Math.floor(rawAmount),utr=$("#walletUtr").value.trim();if(!Number.isFinite(rawAmount)||amount<1)return toast("Enter a valid amount","warn");if(!utr)return toast("Enter UTR / Transaction ID","warn");if(!state.wallet.upiId)return toast("Admin UPI is not configured","error");try{const q=await getDocs(query(collection(db,"moneyRequests"),where("uid","==",state.user.uid),where("utr","==",utr),limit(1)));if(!q.empty)return toast("This UTR is already submitted","warn");await addDoc(collection(db,"moneyRequests"),{uid:state.user.uid,userName:state.profile?.name||"User",amount,utr,paymentMode:"upi",status:"pending",createdAt:serverTimestamp()});await addDoc(collection(db,"users",state.user.uid,"notifications"),{title:"Money request submitted",message:`Your ${money(amount)} wallet request is pending admin verification.`,type:"money",status:"pending",read:false,createdAt:serverTimestamp()});closeModal("walletModal");await loadPortalData();toast("Money request submitted") }catch(e){toast(e.message||"Could not submit request","error")}}
function renderNotifications(){updateWalletUI();const box=$("#notificationList");if(!box)return;box.innerHTML=state.userNotifications.map(n=>`<div class="request-row ${n.read===true?"read":"unread"}"><div><b>${safe(n.title||"Notification")}</b><small>${safe(n.message||"")}</small></div><div><span class="pill ${n.status&&n.status!=="approved"?"off":""}">${safe(n.status||"info")}</span><small>${dateTextUser(n.createdAt)}</small></div></div>`).join("")||'<div class="empty-state">No notifications</div>'}
function dateTextUser(v){try{return v?.toDate?v.toDate().toLocaleString():v?new Date(timeValue(v)).toLocaleString():""}catch{return ""}}
async function markNotificationsRead(){if(!state.user)return;try{const unread=state.userNotifications.filter(n=>n.read!==true);await Promise.all(unread.map(n=>updateDoc(doc(db,"users",state.user.uid,"notifications",n.id),{read:true,readAt:serverTimestamp()})));await loadPortalData();toast("Notifications marked as read")}catch(e){toast(e.message||"Could not mark notifications","error")}}
function renderTransactions(){const box=$("#transactionList");if(!box)return;box.innerHTML=state.userTransactions.map(t=>`<div class="request-row"><div><b>${safe(t.description||t.type||"Transaction")}</b><small>Reference: ${safe(t.reference||"—")} • ${dateTextUser(t.createdAt)}</small></div><div><b>${money(t.amount)}</b><span class="pill ${t.status!=="approved"?"off":""}">${safe(t.status||"pending")}</span></div></div>`).join("")||'<div class="empty-state">No transactions yet</div>'}
function renderMyRequests(){const box=$("#myRequestList");if(!box)return;box.innerHTML=state.userRequests.map(r=>`<div class="request-row"><div><b>${safe(r.kind)} • ${safe(r.serviceName||r.title||r.description||"Request")}</b><small>${r.utr?`UTR: ${safe(r.utr)} • `:""}${dateTextUser(r.createdAt)}</small></div><span class="pill ${r.status!=="approved"?"off":""}">${safe(r.status||"pending")}</span></div>`).join("")||'<div class="empty-state">No requests found</div>'}
function openNotifications(){if(!state.user)return openModal("authModal");renderNotifications();openModal("notificationModal")}
async function openMyRequests(){if(!state.user)return openModal("authModal");await loadPortalData();renderMyRequests();openModal("requestsModal")}
function openTransactions(){if(!state.user)return openModal("authModal");renderTransactions();openModal("transactionsModal")}
function openProfileSettings(){if(!state.user)return openModal("authModal");const p=state.profile||{};$("#profileSettingsBody").innerHTML=`<div class="settings-item"><span>Display name</span><b>${safe(p.name||"—")}</b></div><div class="settings-item"><span>Username</span><b>@${safe(p.username||"—")}</b></div><div class="settings-item"><span>Email</span><b>${safe(p.email||state.user.email||"—")}</b></div><div class="settings-item"><span>Mobile</span><b>${safe(p.mobile||"—")}</b></div><div class="settings-item"><span>Account status</span><b>${safe(p.status||"active")}</b></div><div class="settings-item"><span>Wallet</span><b>${money(state.wallet.balance)}</b></div><button class="secondary-btn full" id="settingsResetPasswordBtn">Send password reset link</button><p class="recovery-note">For password changes, use “Forgot password” from the login screen. Account and service access are controlled by the administrator.</p>`;openModal("profileSettingsModal")}
function showBlockedAccountModal(){if(!state.user)return;$("#accountActivationFee").textContent=money(state.profile?.activationFee||0);openModal("accountBlockedModal")}
function openAccountActivationPayment(){const fee=Number(state.profile?.activationFee||0);if(fee<=0)return activateAccountByWallet();openModal("activationPayModal");$("#activationPayTitle").textContent="Activate your account";$("#activationPayDesc").textContent=`Activation fee ${money(fee)}. Choose wallet or UPI.`;$("#serviceActivationQrPane").classList.add("hidden")}
async function activateAccountByWallet(){if(!state.user)return;const fee=Math.max(0,Number(state.profile?.activationFee||0));if(fee<=0)return activateAccountAfterPayment("wallet");try{await runTransaction(db,async tx=>{const uref=doc(db,"users",state.user.uid),us=await tx.get(uref),bal=Number(us.data()?.walletBalance||0);if(bal<fee)throw Error("Insufficient balance");tx.update(uref,{walletBalance:bal-fee,status:"active",updatedAt:serverTimestamp()});const tr=doc(collection(db,"users",state.user.uid,"transactions"));tx.set(tr,{type:"account_activation",amount:fee,status:"approved",reference:"wallet",createdAt:serverTimestamp(),description:"Account activation fee"})});await addDoc(collection(db,"users",state.user.uid,"notifications"),{title:"Account activated",message:"Your account has been activated using wallet balance.",type:"account",status:"approved",read:false,createdAt:serverTimestamp()});await loadProfile(state.user.uid);await loadPortalData();closeModal("accountBlockedModal");closeModal("activationPayModal");toast("Account activated") }catch(e){toast(e.message||"Insufficient balance","error")}}
async function submitAccountActivationUpi(){const fee=Math.max(0,Number(state.profile?.activationFee||0)),utr=$("#serviceActivationUtr").value.trim();if(fee<=0)return activateAccountByWallet();if(!utr)return toast("Enter UTR / Transaction ID","warn");if(!state.wallet.upiId)return toast("Admin UPI is not configured","error");try{await addDoc(collection(db,"accountActivationRequests"),{uid:state.user.uid,userName:state.profile?.name||"User",amount:fee,utr,paymentMode:"upi",status:"pending",createdAt:serverTimestamp()});await addDoc(collection(db,"users",state.user.uid,"notifications"),{title:"Account activation submitted",message:`UPI activation request for ${money(fee)} is pending admin approval.`,type:"account",status:"pending",read:false,createdAt:serverTimestamp()});closeModal("activationPayModal");toast("Activation request submitted");await loadPortalData()}catch(e){toast(e.message||"Could not submit activation request","error")}}
async function activateAccountAfterPayment(){await activateAccountByWallet()}
async function getServicePricingUser(id){try{const s=await getDoc(doc(db,"servicePricing",id));return s.exists()?s.data():{activationFee:0,usageFee:0}}catch{return {activationFee:0,usageFee:0}}}
async function payServiceActivationWallet(service,fee){if(!state.user)return false;try{await runTransaction(db,async tx=>{const uref=doc(db,"users",state.user.uid),us=await tx.get(uref),bal=Number(us.data()?.walletBalance||0);if(bal<fee)throw Error("Insufficient balance");tx.update(uref,{walletBalance:bal-fee,updatedAt:serverTimestamp()});tx.set(doc(db,"activations",state.user.uid,service.id),{status:"approved",enabled:true,paidAmount:fee,paymentMode:"wallet",updatedAt:serverTimestamp(),approvedBy:state.user.uid},{merge:true});tx.set(doc(collection(db,"users",state.user.uid,"transactions")),{type:"service_activation",amount:fee,status:"approved",reference:service.id,createdAt:serverTimestamp(),description:`${service.name} one-time activation fee`})});await addDoc(collection(db,"users",state.user.uid,"notifications"),{title:"Service activated",message:`${service.name} was activated using wallet balance.`,type:"service",status:"approved",read:false,createdAt:serverTimestamp()});await loadPortalData();return true}catch(e){toast(e.message||"Insufficient balance","error");return false}}
async function submitServiceActivationUpi(){const service=state.pendingServiceForPayment;if(!service)return;const fee=Number((await getServicePricingUser(service.id)).activationFee||0),utr=$("#serviceActivationUtr").value.trim();if(!utr)return toast("Enter UTR / Transaction ID","warn");if(!state.wallet.upiId)return toast("Admin UPI is not configured","error");try{const q=await getDocs(query(collection(db,"activationRequests"),where("uid","==",state.user.uid),where("serviceId","==",service.id),where("status","==","pending"),limit(1)));if(!q.empty)return toast("Request already pending","warn");await addDoc(collection(db,"activationRequests"),{uid:state.user.uid,userName:state.profile?.name||"User",serviceId:service.id,serviceName:service.name,amount:fee,utr,paymentMode:"upi",status:"pending",createdAt:serverTimestamp()});await addDoc(collection(db,"users",state.user.uid,"notifications"),{title:"Service activation submitted",message:`${service.name} activation request is pending admin approval.`,type:"service",status:"pending",read:false,createdAt:serverTimestamp()});closeModal("activationPayModal");showGate("⏳","Payment pending","Admin will verify your UPI payment and activate this service.");toast("Service activation request submitted");await loadPortalData()}catch(e){toast(e.message||"Could not submit request","error")}}
async function chargeUsageFee(service,fee){if(!fee)return true;if(!state.user){toast("Login required","warn");return false}try{const transactionId=id();await runTransaction(db,async tx=>{const uref=doc(db,"users",state.user.uid),us=await tx.get(uref),bal=Number(us.data()?.walletBalance||0);if(bal<fee)throw Error(`Insufficient balance. Required ${money(fee)}, available ${money(bal)}`);tx.update(uref,{walletBalance:bal-fee,updatedAt:serverTimestamp()});tx.set(doc(db,"users",state.user.uid,"transactions",transactionId),{type:"service_use",amount:fee,status:"pending",reference:service.id,createdAt:serverTimestamp(),description:`${service.name} usage fee reserved`})});state.pendingUsageCharges=state.pendingUsageCharges||[];state.pendingUsageCharges.push({transactionId,serviceId:service.id,serviceName:service.name,amount:fee});await loadPortalData();return true}catch(e){toast(e.message||"Insufficient balance","error");return false}}
async function commitPendingUsageCharge(){const list=[...(state.pendingUsageCharges||[])];if(!list.length||!state.user)return;try{await runTransaction(db,async tx=>{const uref=doc(db,"users",state.user.uid),us=await tx.get(uref);const refs=list.map(p=>doc(db,"users",state.user.uid,"transactions",p.transactionId));const snaps=await Promise.all(refs.map(r=>tx.get(r)));const count=snaps.filter(s=>s.exists()&&s.data()?.status==="pending").length;for(let i=0;i<snaps.length;i++){if(snaps[i].exists()&&snaps[i].data()?.status==="pending")tx.update(refs[i],{status:"approved",description:`${list[i].serviceName} usage fee`,completedAt:serverTimestamp()})}tx.update(uref,{usageCount:Number(us.data()?.usageCount||0)+count,updatedAt:serverTimestamp()})});state.pendingUsageCharges=[];await loadPortalData()}catch(e){throw e}}
async function createRefundRequest(list,error){if(!state.user||!list?.length)return;try{const requestId=`refund-${list.map(x=>x.transactionId).sort().join("-").slice(0,180)}`;const total=list.reduce((n,p)=>n+Number(p.amount||0),0);await setDoc(doc(db,"refundRequests",requestId),{uid:state.user.uid,userName:state.profile?.name||state.user.displayName||"User",userEmail:state.user.email||"",amount:total,items:list.map(p=>({transactionId:p.transactionId,serviceId:p.serviceId,serviceName:p.serviceName,amount:Number(p.amount||0)})),status:"pending",reason:"Automatic usage-fee refund failed",error:String(error?.message||error||"Unknown error"),createdAt:serverTimestamp()},{merge:true});await addDoc(collection(db,"users",state.user.uid,"notifications"),{title:"Refund request sent to admin",message:`Automatic refund of ${money(total)} could not be completed. Admin will review and refund it.`,type:"refund",status:"pending",read:false,createdAt:serverTimestamp()})}catch(x){console.error("Refund request creation failed",x)}}
async function refundPendingUsageCharge(){const list=[...(state.pendingUsageCharges||[])];if(!list.length||!state.user)return;try{await runTransaction(db,async tx=>{const uref=doc(db,"users",state.user.uid),us=await tx.get(uref);const refs=list.map(p=>doc(db,"users",state.user.uid,"transactions",p.transactionId));const snaps=await Promise.all(refs.map(r=>tx.get(r)));let refund=0;for(let i=0;i<snaps.length;i++){if(!snaps[i].exists()||snaps[i].data()?.status!=="pending")continue;refund+=Number(list[i].amount||0);tx.update(refs[i],{status:"refunded",description:`${list[i].serviceName} usage fee refunded`,refundedAt:serverTimestamp()})}if(refund>0)tx.update(uref,{walletBalance:Number(us.data()?.walletBalance||0)+refund,updatedAt:serverTimestamp()})});state.pendingUsageCharges=[];await loadPortalData();const total=list.reduce((n,p)=>n+Number(p.amount||0),0);if(total>0)toast(`${money(total)} usage fee refunded`)}catch(e){console.error(e);await createRefundRequest(list,e);toast("Automatic refund failed. Refund request sent to admin.","error")}}

// Service opening now respects both pricing modes while preserving the existing crop/workflow.
const _openServiceV4Base=openService;
openService=async function(service){state.currentService=service;const openPrice=state.servicePrices?.find(x=>x.id===service.id)||{};const openUse=Number(openPrice.usageFee||0),openAct=Number(openPrice.activationFee||0);const openPriceText=openAct&&openUse?`Activation ${money(openAct)} • Per person ${money(openUse)}`:openAct?`Activation ${money(openAct)}`:openUse?`Per person ${money(openUse)}`:"Free";$("#serviceModalTitle").textContent=service.name;$("#serviceModalDesc").textContent=`${service.description||""}${service.description?" • ":""}${openPriceText}`;$("#serviceModalIcon").textContent=safe(service.icon);$("#serviceWorkspace").classList.add("hidden");$("#serviceGate").classList.add("hidden");openModal("serviceModal");const access=service.access||"open";if(access==="login"&&!state.user)return showGate("🔐","Login required","Please login before using this service.",{label:"Login",action:()=>{closeModal("serviceModal");openModal("authModal")}});if(!state.user&&access!=="open")return showGate("🔐","Login required","Please login before using this service.",{label:"Login",action:()=>{closeModal("serviceModal");openModal("authModal")}});const price=await getServicePricingUser(service.id);if(!state.user&&(Number(price.activationFee||0)>0||Number(price.usageFee||0)>0))return showGate("🔐","Login required","This paid service requires a logged-in account.",{label:"Login",action:()=>{closeModal("serviceModal");openModal("authModal")}});if(state.user&&Number(price.activationFee||0)>0&&!(await checkActivation(state.user.uid,service.id))){state.pendingServiceForPayment=service;$("#activationPayTitle").textContent=`Activate ${service.name}`;$("#activationPayDesc").textContent=`One-time activation fee: ${money(price.activationFee)}.`;$("#serviceActivationQrPane").classList.add("hidden");openModal("activationPayModal");return}if(state.user&&access==="activation"&&!(await checkActivation(state.user.uid,service.id)))return showGate("🔒","Service Locked","This service needs approved activation.",{label:"Request Activation",action:()=>requestActivation(service)});if(state.user&&Number(price.usageFee||0)>0){if(!(await chargeUsageFee(service,Number(price.usageFee))))return}startWorkflow(service)};

// Request activation now records a visible user request and notification.
const _requestActivationV4=requestActivation;
requestActivation=async function(service){try{const q=await getDocs(query(collection(db,"activationRequests"),where("uid","==",state.user.uid),where("serviceId","==",service.id),where("status","==","pending"),limit(1)));if(!q.empty)return toast("Activation request already pending","warn");await addDoc(collection(db,"activationRequests"),{uid:state.user.uid,userName:state.profile?.name||"",serviceId:service.id,serviceName:service.name,amount:0,paymentMode:"none",status:"pending",createdAt:serverTimestamp()});await addDoc(collection(db,"users",state.user.uid,"notifications"),{title:"Service activation requested",message:`${service.name} request is pending admin approval.`,type:"service",status:"pending",read:false,createdAt:serverTimestamp()});showGate("⏳","Pending","Waiting for admin approval.");await loadPortalData();toast("Activation request submitted")}catch(e){toast(e.message||"Activation request failed","error")}};

function openMainMenu(){openModal("menuModal")}
function closeMenuAnd(action){closeModal("menuModal");action?.()}
window.addEventListener("DOMContentLoaded",()=>{
 $("#walletBtn")?.addEventListener("click",openWallet);$("#walletAmount")?.addEventListener("input",refreshWalletQr);$("#submitWalletRequestBtn")?.addEventListener("click",submitWalletRequest);
 $("#menuBtn")?.addEventListener("click",openMainMenu);$("#notificationBtn")?.addEventListener("click",openNotifications);
 $("#addPersonBtn")?.addEventListener("click",confirmAddMorePerson);
 $("#personChargeConfirmBtn")?.addEventListener("click",confirmPersonChargeAndAdd);$("#personChargeCancelBtn")?.addEventListener("click",()=>{state.pendingAddPersonAction=null;closeModal("personChargeModal")});
 $("#profileAddMoneyBtn")?.addEventListener("click",()=>{closeModal("profileModal");openWallet()});$("#menuProfileBtn")?.addEventListener("click",()=>{closeModal("menuModal");openProfile()});$("#menuChatBtn")?.addEventListener("click",()=>{closeModal("menuModal");openUserChat()});$("#menuServicesBtn")?.addEventListener("click",()=>{closeModal("menuModal");openSectionFull("services")});$("#menuJobsBtn")?.addEventListener("click",()=>{closeModal("menuModal");$(".recent-section")?.scrollIntoView({behavior:"smooth"})});$("#menuRequestsBtn")?.addEventListener("click",()=>{closeModal("menuModal");openMyRequests()});$("#menuTransactionsBtn")?.addEventListener("click",()=>{closeModal("menuModal");openTransactions()});$("#menuSupportBtn")?.addEventListener("click",()=>{closeModal("menuModal");openUserChat()});$("#menuSettingsBtn")?.addEventListener("click",()=>{closeModal("menuModal");openProfileSettings()});$("#menuToolsBtn")?.addEventListener("click",()=>{closeModal("menuModal");openSectionFull("tools")});$("#notificationBtn")?.addEventListener("click",openNotifications);$("#markAllReadBtn")?.addEventListener("click",markNotificationsRead);$("#myRequestsBtn")?.addEventListener("click",()=>{closeModal("profileModal");openMyRequests()});$("#transactionsBtn")?.addEventListener("click",()=>{closeModal("profileModal");openTransactions()});$("#supportBtn")?.addEventListener("click",()=>{closeModal("profileModal");openUserChat()});$("#profileSettingsBtn")?.addEventListener("click",()=>{closeModal("profileModal");openProfileSettings()});document.addEventListener("click",async e=>{if(e.target?.id==="settingsResetPasswordBtn"){try{await sendPasswordResetEmail(auth,state.user?.email||state.profile?.email);toast("Password reset link sent")}catch(x){toast(authMessage(x),"error")}}});
 $("#activateAccountBtn")?.addEventListener("click",openAccountActivationPayment);$("#payActivationWallet")?.addEventListener("click",async()=>{if(state.profile?.status==="blocked")return activateAccountByWallet();const service=state.pendingServiceForPayment;if(!service)return toast("No service selected","warn");const fee=Number((await getServicePricingUser(service.id)).activationFee||0);if(fee>0&&state.wallet.balance<fee)return toast(`Insufficient balance. Available ${money(state.wallet.balance)}`,"warn");if(fee>0){const ok=await payServiceActivationWallet(service,fee);if(ok){closeModal("activationPayModal");startWorkflow(service)}}else{closeModal("activationPayModal");startWorkflow(service)}});$("#payActivationUpi")?.addEventListener("click",()=>{$("#serviceActivationQrPane").classList.remove("hidden");const fee=Number(state.profile?.activationFee||0);qrMake("serviceActivationQr",`upi://pay?pa=${encodeURIComponent(state.wallet.upiId)}&pn=Print%20Portal&am=${fee.toFixed(2)}&cu=INR`);$("#serviceActivationUpiText").textContent=state.wallet.upiId?`Pay ${money(fee)} to ${state.wallet.upiId}`:"Admin UPI is not configured."});$("#submitServiceActivationBtn")?.addEventListener("click",async()=>{if(state.profile?.status==="blocked")return submitAccountActivationUpi();return submitServiceActivationUpi()});
});

/* PRINT PORTAL FIX PACK 2026-09 */
(function(){
 async function autoCropSource(src,crop,file,kind="card"){
  if(!src?.image)throw Error("Source image could not be prepared for auto-crop.");
  const im=src.image,nw=Number(im.naturalWidth)||0,nh=Number(im.naturalHeight)||0;if(!nw||!nh)throw Error("Source image has invalid dimensions.");
  let nx=Number(crop?.nx),ny=Number(crop?.ny),nww=Number(crop?.nw),nhh=Number(crop?.nh);
  const pw=Number(crop?.pageWidth)||0,ph=Number(crop?.pageHeight)||0;
  if(!(nx>=0&&nx<=1&&ny>=0&&ny<=1&&nww>0&&nww<=1&&nhh>0&&nhh<=1)){const x=Number(crop?.x),y=Number(crop?.y),w=Number(crop?.w??crop?.width),h=Number(crop?.h??crop?.height);if(!(Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(w)&&Number.isFinite(h)))throw Error("Auto-crop template has invalid coordinates. Re-save the template in Admin.");nx=pw?x/pw:0;ny=ph?y/ph:0;nww=pw?w/pw:1;nhh=ph?h/ph:1}
  nx=Math.max(0,Math.min(1,nx));ny=Math.max(0,Math.min(1,ny));nww=Math.max(.0001,Math.min(1-nx,nww));nhh=Math.max(.0001,Math.min(1-ny,nhh));
  const x=Math.round(nx*nw),y=Math.round(ny*nh),w=Math.max(1,Math.min(nw-x,Math.round(nww*nw))),h=Math.max(1,Math.min(nh-y,Math.round(nhh*nh)));
  const c=document.createElement("canvas");c.width=w;c.height=h;const ctx=c.getContext("2d");ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";ctx.drawImage(im,x,y,w,h,0,0,w,h);const url=c.toDataURL("image/png");return{url,image:await loadImage(url),crop:{x,y,width:w,height:h,nx,ny,nw:nww,nh:nhh},source:file};
 }
 window.autoCropSource=autoCropSource;

 let sessionId=null,sessionUnsub=null;
 const sessionCol=()=>collection(db,"chatSessions",state.user.uid,"sessions");
 async function getActiveSession(){if(!state.user)return null;try{const q=await getDocs(query(sessionCol(),where("status","==","open"),orderBy("createdAt","desc"),limit(1)));return q.empty?null:{id:q.docs[0].id,...q.docs[0].data()}}catch{return null}}
 async function createSession(topicType="general",service=null,tx=null){const d=doc(sessionCol());const data={status:"open",topicType,serviceId:service?.id||null,serviceName:service?.name||null,transactionId:tx?.id||null,transaction:{id:tx?.id||null,type:tx?.type||null,amount:Number(tx?.amount||0),description:tx?.description||null,serviceName:tx?.serviceName||null,status:tx?.status||null},createdAt:serverTimestamp(),updatedAt:serverTimestamp()};await setDoc(d,data);return{id:d.id,...data}}
 async function renderChatMessages(sid){if(sessionUnsub)sessionUnsub();sessionId=sid;try{const sd=await getDoc(doc(db,"chatSessions",state.user.uid,"sessions",sid));const c=sd.data()||{};let pin=document.getElementById("chatPinnedContext");if(!pin){pin=document.createElement("div");pin.id="chatPinnedContext";pin.style.cssText="position:sticky;top:0;z-index:5;padding:10px 12px;margin:-2px 0 10px;background:var(--card,#fff);border:1px solid var(--border,#e5e7eb);border-radius:12px;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.06)";els.chatMessages.parentElement?.insertBefore(pin,els.chatMessages)}const isWallet=c.topicType==="wallet";const tx=c.transaction||{};pin.innerHTML=isWallet?`<b>📌 Selected Wallet Transaction</b><br><span>₹${Number(tx.amount||0)} • ${safe(tx.description||tx.type||"Transaction")} • ${safe(tx.status||"")}</span><br><small>ID: ${safe(tx.id||c.transactionId||"—")}</small>`:`<b>📌 Selected Service</b><br><span>${safe(c.serviceName||"General Support")}</span>`}catch{}sessionUnsub=onSnapshot(query(collection(db,"chatSessions",state.user.uid,"sessions",sid,"messages"),orderBy("createdAt","asc")),snap=>{els.chatMessages.innerHTML="";snap.forEach(d=>{const m=d.data(),r=document.createElement("div");r.className=`chat-bubble ${m.senderRole==="user"?"mine":"theirs"}`;r.textContent=m.text||"";els.chatMessages.appendChild(r)});els.chatMessages.scrollTop=els.chatMessages.scrollHeight})}
 async function openUserChatV5(){if(!state.user){openModal("authModal");return}let s=await getActiveSession();if(!s)s=await createSession();openModal("chatModal");$("#chatTopic").textContent=s.serviceName?`Service: ${s.serviceName}`:s.topicType==="wallet"?`Wallet • Transaction: ${s.transactionId||"General"}`:"General support";await renderChatMessages(s.id)}
 function closeUserSupportV5(){const sid=sessionId;if(!sid){closeModal("chatModal");return}updateDoc(doc(db,"chatSessions",state.user.uid,"sessions",sid),{status:"closed",closedAt:serverTimestamp(),closedBy:"user",updatedAt:serverTimestamp()}).catch(()=>{});sessionUnsub?.();sessionUnsub=null;sessionId=null;closeModal("chatModal");toast("Chat closed")}
 async function sendUserChatV5(){if(!state.user)return;let sid=sessionId;if(!sid){const s=await createSession();sid=s.id;sessionId=sid}const text=els.chatInput.value.trim();if(!text)return;try{await addDoc(collection(db,"chatSessions",state.user.uid,"sessions",sid,"messages"),{text,senderUid:state.user.uid,senderRole:"user",createdAt:serverTimestamp()});els.chatInput.value=""}catch(e){toast(e.message||"Message could not be sent","error")}}
 async function openSupportServicePicker(){if(!state.user){openModal("authModal");return}let m=$("#serviceChatPicker");if(!m){m=document.createElement("div");m.id="serviceChatPicker";m.className="modal hidden";document.body.appendChild(m)}m.innerHTML=`<div class="modal-card"><button class="modal-close" id="scpClose">×</button><h3>Start New Chat</h3><p>Select what you want to discuss.</p><div id="scpList"></div></div>`;m.classList.remove("hidden");document.body.classList.add("modal-open");$("#scpClose",m).onclick=()=>{m.classList.add("hidden");if(!$$('.modal:not(.hidden)').length)document.body.classList.remove("modal-open")};const list=$("#scpList",m);list.innerHTML=`<button class="primary-btn full" id="scpWallet">💰 Wallet / Transaction</button>`+state.services.map(s=>`<button class="secondary-btn full" data-scp-service="${safe(s.id)}" style="margin-top:8px">${safe(s.icon||"▣")} ${safe(s.name)}</button>`).join("");$("#scpWallet",m).onclick=()=>openWalletChatPicker(m);$$('[data-scp-service]',m).forEach(b=>b.onclick=()=>startServiceChat(state.services.find(s=>s.id===b.dataset.scpService),m))}
 async function startServiceChat(service,m){m?.classList.add("hidden");const s=await createSession("service",service,null);openModal("chatModal");$("#chatTopic").textContent=`Service: ${service.name}`;await renderChatMessages(s.id)}
 async function openWalletChatPicker(m){const txs=[];try{const q=await getDocs(query(collection(db,"users",state.user.uid,"transactions"),orderBy("createdAt","desc"),limit(30)));q.forEach(d=>txs.push({id:d.id,...d.data()}))}catch{}const list=$("#scpList",m);list.innerHTML='<h4>Wallet Transactions</h4>'+ (txs.map(t=>`<button class="secondary-btn full" data-tx="${safe(t.id)}" style="margin-top:8px">₹${Number(t.amount||0)} • ${safe(t.description||t.type||"Transaction")} • ${safe(t.status||"")}</button>`).join("")||'<div class="empty-state">No transactions found</div>');$$('[data-tx]',m).forEach(b=>b.onclick=()=>startWalletChat(txs.find(t=>t.id===b.dataset.tx),m))}
 async function startWalletChat(tx,m){m?.classList.add("hidden");const s=await createSession("wallet",null,tx);openModal("chatModal");$("#chatTopic").textContent=`Wallet • Transaction: ₹${Number(tx.amount||0)} • ${tx.id}`;await renderChatMessages(s.id)}
 window.openUserChatV5=openUserChatV5;window.sendUserChatV5=sendUserChatV5;window.openSupportServicePicker=openSupportServicePicker;
 window.addEventListener("DOMContentLoaded",()=>{$("#newChatBtn")?.addEventListener("click",openSupportServicePicker);$("#closeChatBtn")?.addEventListener("click",closeUserSupportV5);});

 // Fix service activation: close underlying service modal, persist request, and refresh activation state.
 const baseOpenService=openService; openService=async function(service){state.currentService=service;const price=await getServicePricingUser(service.id);const fee=Number(price.activationFee||0);if(state.user&&fee>0&&!(await checkActivation(state.user.uid,service.id))){closeModal("serviceModal");state.pendingServiceForPayment=service;$("#activationPayTitle").textContent=`Activate ${service.name}`;$("#activationPayDesc").textContent=`One-time activation fee: ${money(fee)}.`;$("#serviceActivationQrPane")?.classList.add("hidden");openModal("activationPayModal");return}return baseOpenService(service)};
 const baseSubmit=submitServiceActivationUpi; submitServiceActivationUpi=async function(){await baseSubmit();state.currentService&&await loadPortalData()};
})();