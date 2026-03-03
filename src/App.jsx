import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from "firebase/app";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot,
  collection, getDocs, deleteDoc
} from "firebase/firestore";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  onAuthStateChanged, signOut, updateProfile, updatePassword,
  EmailAuthProvider, reauthenticateWithCredential
} from "firebase/auth";

// ─── FIREBASE ────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};
const firebaseApp = initializeApp(firebaseConfig);
const db  = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const BASE_POINTS = 100;
const SCORE_RATIO = 0.8;
const FINDER_PENALTY = -20;
const TURN_TIME = 15;
const QUICK_PLAY_PLAYERS = 4;
const QUICK_PLAY_MAX = 35;

// ─── LEVEL (50 seviye, üstel artış) ──────────────────────────────────────────
const xpForLevel = (lvl) => Math.floor(280 * Math.pow(1.42, lvl - 1));
const getLevelInfo = (totalXP) => {
  let level = 1, spent = 0;
  while (level <= 50) {
    const needed = xpForLevel(level);
    if (spent + needed > totalXP) return { level, currentXP: totalXP - spent, requiredXP: needed };
    spent += needed;
    level++;
  }
  return { level: 50, currentXP: 0, requiredXP: 1 };
};
const XP_TABLE = [120, 90, 70, 50, 35, 25, 20, 15, 10, 10];

// ─── KOZMETİKLER (50 level yolu) ─────────────────────────────────────────────
const COSMETICS = [
  { level: 1,  badge: '🌱', title: 'Acemi',          glow: '#64748b' },
  { level: 2,  badge: '⚡', title: 'Çaylak',         glow: '#3b82f6' },
  { level: 3,  badge: '🔥', title: 'Avcı',           glow: '#f97316' },
  { level: 5,  badge: '🎯', title: 'Stratejist',     glow: '#8b5cf6' },
  { level: 7,  badge: '🦊', title: 'Kurnaz',         glow: '#fb923c' },
  { level: 9,  badge: '🐉', title: 'Ejderha',        glow: '#ef4444' },
  { level: 12, badge: '💎', title: 'Usta',           glow: '#06b6d4' },
  { level: 15, badge: '⚔️', title: 'Savaşçı',       glow: '#f59e0b' },
  { level: 18, badge: '👑', title: 'Efsane',         glow: '#eab308' },
  { level: 22, badge: '🌌', title: 'Tanrı',          glow: '#ec4899' },
  { level: 26, badge: '🔮', title: 'Büyücü',         glow: '#a855f7' },
  { level: 30, badge: '☄️', title: 'Meteor',         glow: '#f43f5e' },
  { level: 35, badge: '🌊', title: 'Tsunami',        glow: '#0ea5e9' },
  { level: 40, badge: '🧿', title: 'Gizemli',        glow: '#6366f1' },
  { level: 45, badge: '🪐', title: 'Evren Efendisi', glow: '#d946ef' },
  { level: 50, badge: '💀', title: 'Ölümsüz',        glow: '#ffffff' },
];
const getCosmetic = (lvl) => {
  let c = COSMETICS[0];
  for (const x of COSMETICS) { if (lvl >= x.level) c = x; }
  return c;
};

// ─── TEMA (level'e göre arka plan değişir) ────────────────────────────────────
const getTheme = (lvl) => {
  if (lvl >= 26) return { bg: 'linear-gradient(135deg,#0d0018,#1a0030)', accent: '#d946ef' };
  if (lvl >= 18) return { bg: 'linear-gradient(135deg,#1a1000,#2d1f00)', accent: '#eab308' };
  if (lvl >= 12) return { bg: 'linear-gradient(135deg,#001a1f,#002d35)', accent: '#06b6d4' };
  if (lvl >= 5)  return { bg: 'linear-gradient(135deg,#0d0618,#1a0a2e)', accent: '#8b5cf6' };
  if (lvl >= 3)  return { bg: 'linear-gradient(135deg,#1a0500,#2d0a00)', accent: '#f97316' };
  return { bg: 'linear-gradient(135deg,#020617,#0a0f2e)', accent: '#00f5ff' };
};

// ─── CSS (modul dışında bir kez inject — DOM removeChild bugunu önler) ────────
let _cssInjected = false;
if (typeof document !== 'undefined' && !_cssInjected) {
  _cssInjected = true;
  const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Rajdhani:wght@400;500;600;700&display=swap' });
  document.head.appendChild(link);
  const s = document.createElement('style');
  s.textContent = `
    *{font-family:'Rajdhani',sans-serif;box-sizing:border-box}
    .O{font-family:'Orbitron',monospace!important}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}
    @keyframes pop{0%{transform:scale(.6);opacity:0}70%{transform:scale(1.15)}100%{transform:scale(1);opacity:1}}
    @keyframes bounce{0%,100%{transform:scale(1)}50%{transform:scale(1.22)}}
    @keyframes slideIn{from{transform:translateY(14px);opacity:0}to{transform:translateY(0);opacity:1}}
    @keyframes celebIn{0%{transform:scale(.5);opacity:0}70%{transform:scale(1.06)}100%{transform:scale(1);opacity:1}}
    .gbg{background-image:linear-gradient(rgba(0,245,255,.025)1px,transparent 1px),linear-gradient(90deg,rgba(0,245,255,.025)1px,transparent 1px);background-size:48px 48px}
    .gd{background:rgba(0,0,0,.45);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.07)}
    .gl{background:rgba(255,255,255,.04);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.08)}
    ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#0f172a}::-webkit-scrollbar-thumb{background:#334155;border-radius:2px}
    input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{opacity:1}
    .nb{aspect-ratio:1;border:none;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:700;transition:all .12s;cursor:pointer}
    .nb:hover:not(:disabled){transform:scale(1.1)!important}
    .nb:active:not(:disabled){transform:scale(.92)!important}
  `;
  document.head.appendChild(s);
}

// ─── ERROR BOUNDARY ───────────────────────────────────────────────────────────
class EB extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(e) { return { err: e }; }
  componentDidCatch(e, i) { console.error('[EB]', e, i); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div style={{ background: '#020617', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>⚠️</div>
          <h2 style={{ color: '#f87171', fontFamily: 'monospace', fontSize: '1.15rem', marginBottom: '0.75rem' }}>Bir hata oluştu</h2>
          <pre style={{ color: 'rgba(255,255,255,.3)', fontSize: '.72rem', background: 'rgba(255,255,255,.04)', padding: '1rem', borderRadius: '10px', textAlign: 'left', maxWidth: 460, overflow: 'auto', whiteSpace: 'pre-wrap', marginBottom: '1.5rem' }}>
            {this.state.err?.message}
          </pre>
          <button onClick={() => window.location.reload()} style={{ padding: '.7rem 2rem', background: 'rgba(0,245,255,.15)', border: '1px solid rgba(0,245,255,.3)', borderRadius: '12px', color: '#00f5ff', cursor: 'pointer', fontWeight: 700 }}>
            Sayfayı Yenile
          </button>
        </div>
      </div>
    );
  }
}

// ─── UTILS ───────────────────────────────────────────────────────────────────
const gid = () => Math.random().toString(36).substr(2, 9);

// ─── INPUT STYLE ─────────────────────────────────────────────────────────────
const IS = { padding: '.85rem 1.1rem', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: '12px', color: '#fff', fontSize: '.97rem', outline: 'none', fontWeight: 500, width: '100%', fontFamily: 'Rajdhani,sans-serif' };

// ─── APP ──────────────────────────────────────────────────────────────────────
function App() {
  // auth
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState(null);

  // screens
  const [screen, setScreen] = useState('landing');

  // auth form
  const [tab, setTab] = useState('login');
  const [aNick, setANick] = useState('');
  const [aEmail, setAEmail] = useState('');
  const [aPass, setAPass] = useState('');
  const [aErr, setAErr] = useState('');
  const [aBusy, setABusy] = useState(false);

  // room create
  const [rName, setRName] = useState('');
  const [rPass, setRPass] = useState('');
  const [rMax, setRMax]   = useState(50);
  const [rPl,  setRPl]   = useState(4);

  // room join
  const [jName, setJName] = useState('');
  const [jPass, setJPass] = useState('');

  // game
  const [roomId,      setRoomId]      = useState('');
  const [roomData,    setRoomData]    = useState(null);
  const [players,     setPlayers]     = useState([]);
  const [gameState,   setGameState]   = useState(null);
  const [isHost,      setIsHost]      = useState(false);
  const [mySecret,    setMySecret]    = useState(null);
  const [timeLeft,    setTimeLeft]    = useState(TURN_TIME);
  const [celebration, setCelebration] = useState(null);
  const [xpPopup,     setXpPopup]    = useState(null);

  // quick play
  const [qCount, setQCount] = useState(0);

  // tickers (pure React state, no CSS animation → no removeChild crash)
  const [tickers, setTickers] = useState([]);

  // profile edit
  const [eNick,  setENick]  = useState('');
  const [eOldPw, setEOldPw] = useState('');
  const [eNewPw, setENewPw] = useState('');
  const [eErr,   setEErr]   = useState('');
  const [eOk,    setEOk]    = useState('');

  // refs (stale closure'a karşı)
  const timerRef  = useRef(null);
  const timerLock = useRef(false);
  const unsubR    = useRef(() => {});
  const unsubQ    = useRef(() => {});
  const firstAuth = useRef(false);

  const scrRef      = useRef(screen);
  const gsRef       = useRef(gameState);
  const plRef       = useRef(players);
  const isHostRef   = useRef(isHost);
  const ridRef      = useRef(roomId);
  const authRef     = useRef(authUser);
  const rdRef       = useRef(roomData);
  const profRef     = useRef(profile);

  scrRef.current    = screen;
  gsRef.current     = gameState;
  plRef.current     = players;
  isHostRef.current = isHost;
  ridRef.current    = roomId;
  authRef.current   = authUser;
  rdRef.current     = roomData;
  profRef.current   = profile;

  // ── AUTH ──────────────────────────────────────────────────────────────────
  useEffect(() => onAuthStateChanged(auth, async (user) => {
    const first = !firstAuth.current;
    firstAuth.current = true;
    setAuthUser(user);
    if (user) {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) { setProfile(snap.data()); if (first) setScreen('home'); }
      else { if (first) setScreen('auth'); }
    } else {
      setProfile(null);
      if (first) setScreen('landing');
    }
    setAuthLoading(false);
  }), []);

  // ── ROOM LISTENER ─────────────────────────────────────────────────────────
  useEffect(() => {
    unsubR.current();
    unsubR.current = () => {};
    if (!roomId) return;

    unsubR.current = onSnapshot(doc(db, 'rooms', roomId), snap => {
      if (!snap.exists()) return;
      const d = snap.data();

      const safeGS = d.gameState ? {
        phase:          d.gameState.phase          || 'lobby',
        turnOrder:      d.gameState.turnOrder      || [],
        turnIndex:      d.gameState.turnIndex      ?? 0,
        turnStartTime:  d.gameState.turnStartTime  || 0,
        clickedNumbers: d.gameState.clickedNumbers || [],
        foundPlayers:   d.gameState.foundPlayers   || [],
        celebration:    d.gameState.celebration    || null,
        xpAwarded:      d.gameState.xpAwarded      || false,
      } : null;

      const safePl = (d.players || []).map(p => ({
        id: p.id || '', name: p.name || '?', score: p.score ?? 0,
        isHost: !!p.isHost, hasSelectedNumber: !!p.hasSelectedNumber,
      }));

      setRoomData(d);
      setPlayers(safePl);
      setGameState(safeGS);
      if (d.host === authRef.current?.uid) setIsHost(true);

      // Global celebration → Firestore'dan gelir, herkese gösterilir (FIX #2)
      if (safeGS?.celebration) {
        setCelebration(safeGS.celebration);
        setTimeout(() => setCelebration(null), 3200);
      }

      const curScr = scrRef.current;
      const phase  = safeGS?.phase;
      if (phase === 'selectingNumbers' && (curScr === 'lobby' || curScr === 'results')) {
        setMySecret(null); setScreen('selectNumber');
      }
      if (phase === 'playing' && curScr === 'selectNumber') setScreen('game');
      if (phase === 'finished' && curScr === 'game') {
        // XP sadece host tarafından, bir kez verilir (FIX #3)
        if (isHostRef.current && !safeGS.xpAwarded) awardXP(safePl);
        setTimeout(() => setScreen('results'), 3000);
      }
    });
    return () => unsubR.current();
  }, [roomId]);

  // ── TIMER ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    clearInterval(timerRef.current);
    timerLock.current = false;
    if (gameState?.phase !== 'playing' || screen !== 'game') return;
    const t0 = gameState.turnStartTime;
    const tick = () => {
      if (!t0) { setTimeLeft(TURN_TIME); return; }
      const rem = Math.max(0, Math.min(TURN_TIME, Math.ceil((TURN_TIME * 1000 - (Date.now() - t0)) / 1000)));
      setTimeLeft(rem);
      if (rem === 0 && isHostRef.current && !timerLock.current) {
        timerLock.current = true;
        applyTimeout();
      }
    };
    tick();
    timerRef.current = setInterval(tick, 500);
    return () => clearInterval(timerRef.current);
  }, [gameState?.turnStartTime, gameState?.phase, screen]);

  // ── TICKER (saf React, CSS animasyonu yok → removeChild hatası engellendi) ─
  const addTicker = (text, color) => {
    const id = gid();
    setTickers(t => [...t.slice(-5), { id, text, color }]);
    setTimeout(() => setTickers(t => t.filter(x => x.id !== id)), 2000);
  };

  // ── AUTH FNS ──────────────────────────────────────────────────────────────
  const doRegister = async () => {
    setAErr('');
    if (aNick.trim().length < 3)      return setAErr('Kullanıcı adı en az 3 karakter olmalı.');
    if (!aEmail.toLowerCase().endsWith('@gmail.com')) return setAErr('Sadece @gmail.com adresleri kabul edilir.');
    if (aPass.length < 6)             return setAErr('Şifre en az 6 karakter.');
    setABusy(true);
    try {
      const cr = await createUserWithEmailAndPassword(auth, aEmail, aPass);
      await updateProfile(cr.user, { displayName: aNick.trim() });
      const p = { uid: cr.user.uid, nickname: aNick.trim(), email: aEmail, xp: 0, gamesPlayed: 0, createdAt: Date.now() };
      await setDoc(doc(db, 'users', cr.user.uid), p);
      setProfile(p); setScreen('home');
    } catch (e) {
      setAErr({ 'auth/email-already-in-use': 'Bu email zaten kullanımda.', 'auth/invalid-email': 'Geçersiz email.' }[e.code] || e.message);
    }
    setABusy(false);
  };

  const doLogin = async () => {
    setAErr('');
    if (!aEmail.toLowerCase().endsWith('@gmail.com')) return setAErr('Sadece @gmail.com adresleri kabul edilir.');
    setABusy(true);
    try {
      const cr = await signInWithEmailAndPassword(auth, aEmail, aPass);
      const s  = await getDoc(doc(db, 'users', cr.user.uid));
      if (s.exists()) { setProfile(s.data()); setScreen('home'); }
    } catch (e) {
      setAErr({ 'auth/wrong-password': 'Şifre yanlış.', 'auth/user-not-found': 'Kullanıcı bulunamadı.', 'auth/invalid-credential': 'Email veya şifre hatalı.' }[e.code] || e.message);
    }
    setABusy(false);
  };

  const doSignOut = async () => {
    firstAuth.current = false;
    await signOut(auth);
    setRoomId(''); setRoomData(null); setPlayers([]); setGameState(null); setIsHost(false);
    setScreen('landing');
  };

  // ── PROFİL DÜZENLEME (FIX #7) ────────────────────────────────────────────
  const saveProfile = async () => {
    setEErr(''); setEOk('');
    if (eNick.trim() && eNick.trim().length < 3) return setEErr('Kullanıcı adı en az 3 karakter.');
    try {
      const updates = {};
      if (eNick.trim()) updates.nickname = eNick.trim();
      if (eNewPw) {
        if (!eOldPw) return setEErr('Mevcut şifreni gir.');
        const cr = EmailAuthProvider.credential(authRef.current.email, eOldPw);
        await reauthenticateWithCredential(authRef.current, cr);
        await updatePassword(authRef.current, eNewPw);
      }
      if (Object.keys(updates).length) {
        await updateDoc(doc(db, 'users', authRef.current.uid), updates);
        setProfile(p => ({ ...p, ...updates }));
      }
      setEOk('Profil güncellendi ✅');
      setENick(''); setEOldPw(''); setENewPw('');
    } catch (e) {
      setEErr({ 'auth/wrong-password': 'Mevcut şifre yanlış.', 'auth/weak-password': 'Yeni şifre çok zayıf.' }[e.code] || e.message);
    }
  };

  // ── ROOM FNS ──────────────────────────────────────────────────────────────
  const createRoom = async (o = {}) => {
    const name = o.name || rName.trim();
    const pw   = o.pw   || rPass;
    const maxN = o.maxN || rMax;
    const maxP = o.maxP || rPl;
    if (!name) return alert('Oda adı gerekli!');
    if ((await getDoc(doc(db, 'rooms', name))).exists()) return alert('Bu oda adı alınmış!');
    await setDoc(doc(db, 'rooms', name), {
      name, password: pw, maxPlayers: +maxP, maxNumber: +maxN,
      host: authRef.current.uid, isQuickPlay: !!o.quick,
      players: [{ id: authRef.current.uid, name: profRef.current.nickname, score: 0, isHost: true }],
      gameState: { phase: 'lobby' }, createdAt: Date.now()
    });
    setRoomId(name); setIsHost(true); setScreen('lobby');
  };

  const joinRoom = async (o = {}) => {
    const name = o.name || jName.trim();
    const pw   = o.pw !== undefined ? o.pw : jPass;
    if (!name) return alert('Oda adı gerekli!');
    const snap = await getDoc(doc(db, 'rooms', name));
    if (!snap.exists()) return alert('Oda bulunamadı!');
    const room = snap.data();
    if (room.password !== pw) return alert('Şifre yanlış!');
    if ((room.players || []).length >= room.maxPlayers) return alert('Oda dolu!');
    if ((room.players || []).find(p => p.id === authRef.current.uid)) {
      setRoomId(name); setScreen('lobby'); return;
    }
    if (room.gameState?.phase !== 'lobby') return alert('Oyun zaten başlamış!');
    await updateDoc(doc(db, 'rooms', name), {
      players: [...(room.players || []), { id: authRef.current.uid, name: profRef.current.nickname, score: 0, isHost: false }]
    });
    setRoomId(name); setScreen('lobby');
  };

  const leaveRoom = async () => {
    const rid = ridRef.current;
    if (rid) {
      try {
        const snap = await getDoc(doc(db, 'rooms', rid));
        if (snap.exists()) {
          const rem = (snap.data().players || []).filter(p => p.id !== authRef.current?.uid);
          if (rem.length === 0) await deleteDoc(doc(db, 'rooms', rid));
          // FIX #9: boş oda otomatik silinir
          else await updateDoc(doc(db, 'rooms', rid), {
            players: rem.map((p, i) => i === 0 ? { ...p, isHost: true } : p),
            host: rem[0].id
          });
        }
      } catch {}
    }
    setRoomId(''); setRoomData(null); setPlayers([]); setGameState(null); setIsHost(false);
    setScreen('home');
  };

  const startGame = async () => {
    if (!isHost) return;
    const shuffled = players.map(p => p.id).sort(() => Math.random() - .5);
    await updateDoc(doc(db, 'rooms', roomId), {
      'gameState.phase': 'selectingNumbers',
      'gameState.turnOrder': shuffled,
      'gameState.clickedNumbers': [], 'gameState.foundPlayers': [],
      'gameState.turnIndex': 0, 'gameState.turnStartTime': Date.now(),
      'gameState.celebration': null, 'gameState.xpAwarded': false,
    });
  };

  const submitSecret = async () => {
    const rd = rdRef.current;
    if (!mySecret || mySecret < 1 || mySecret > rd?.maxNumber) return alert(`1–${rd?.maxNumber} arası bir sayı seç!`);
    await setDoc(doc(db, `rooms/${ridRef.current}/secrets`, authRef.current.uid), { number: mySecret });
    const updated = plRef.current.map(p => p.id === authRef.current.uid ? { ...p, hasSelectedNumber: true } : p);
    const allReady = updated.every(p => p.hasSelectedNumber);
    await updateDoc(doc(db, 'rooms', ridRef.current), {
      players: updated,
      'gameState.phase': allReady ? 'playing' : 'selectingNumbers',
      'gameState.turnStartTime': allReady ? Date.now() : 0,
    });
  };

  const clickNumber = async (num) => {
    const gs   = gsRef.current;
    const pl   = plRef.current;
    const rid  = ridRef.current;
    const me   = authRef.current?.uid;
    const rd   = rdRef.current;
    if (!gs || !pl.length || !rid || !me || !rd) return;
    if (!gs.turnOrder?.length || gs.turnOrder[gs.turnIndex] !== me) return;
    try {
      const secSnap = await getDocs(collection(db, `rooms/${rid}/secrets`));
      const sec = {};
      secSnap.forEach(s => (sec[s.id] = s.data().number));

      let found = false;
      let newFoundPl = [...(gs.foundPlayers || [])];
      let newPlayers = [...pl];
      let celebData  = null;

      for (const player of pl) {
        if (newFoundPl.includes(player.id)) continue;
        if (sec[player.id] === num) {
          found = true;
          newFoundPl.push(player.id);
          const earned = Math.round(BASE_POINTS * Math.pow(SCORE_RATIO, gs.foundPlayers.length));
          // FIX #1: found player gets points and WON (kazandı), not eliminated
          newPlayers = newPlayers.map(p => p.id === player.id ? { ...p, score: p.score + earned } : p);
          newPlayers = newPlayers.map(p => p.id === me ? { ...p, score: p.score + FINDER_PENALTY } : p);
          const finderName = pl.find(p => p.id === me)?.name || '?';
          // FIX #2: celebration stored in Firestore → all players see it
          celebData = { finder: finderName, winner: player.name, number: num, earned, penalty: FINDER_PENALTY, ts: Date.now() };
          addTicker(`${player.name} +${earned} 🎉`, '#4ade80');
          addTicker(`${finderName} ${FINDER_PENALTY}`, '#f87171');
        }
      }

      const clicked = [...(gs.clickedNumbers || []), num];
      const unclicked = Array.from({ length: rd.maxNumber }, (_, i) => i + 1).filter(n => !clicked.includes(n));

      let nextIdx = (gs.turnIndex + 1) % gs.turnOrder.length;
      let s = 0;
      while (newFoundPl.includes(gs.turnOrder[nextIdx]) && s++ < pl.length)
        nextIdx = (nextIdx + 1) % gs.turnOrder.length;

      let isDeadlock = false;
      const nextId = gs.turnOrder[nextIdx];
      if (unclicked.length === 1 && unclicked[0] === sec[nextId]) {
        isDeadlock = true;
        const bonus = Math.round(BASE_POINTS * Math.pow(SCORE_RATIO, newFoundPl.length));
        newPlayers = newPlayers.map(p => p.id === nextId ? { ...p, score: p.score + bonus } : p);
      }

      const isEnd = newFoundPl.length >= pl.length - 1 || isDeadlock;

      await updateDoc(doc(db, 'rooms', rid), {
        'gameState.clickedNumbers': clicked,
        'gameState.foundPlayers':   newFoundPl,
        'gameState.turnIndex':      nextIdx,
        'gameState.turnStartTime':  Date.now(),
        'gameState.phase':          isEnd ? 'finished' : 'playing',
        'gameState.celebration':    celebData, // FIX #2: herkese gider
        players: newPlayers,
      });
    } catch (e) { console.error('[click]', e); }
  };

  const applyTimeout = async () => {
    const gs = gsRef.current, pl = plRef.current, rid = ridRef.current;
    if (!gs?.turnOrder?.length || !pl.length || !rid) return;
    try {
      const curId = gs.turnOrder[gs.turnIndex];
      const newP  = pl.map(p => p.id === curId ? { ...p, score: p.score - 20 } : p);
      let nextIdx = (gs.turnIndex + 1) % gs.turnOrder.length;
      let s = 0;
      while (gs.foundPlayers?.includes(gs.turnOrder[nextIdx]) && s++ < pl.length)
        nextIdx = (nextIdx + 1) % gs.turnOrder.length;
      await updateDoc(doc(db, 'rooms', rid), {
        players: newP, 'gameState.turnIndex': nextIdx, 'gameState.turnStartTime': Date.now()
      });
    } catch (e) { console.error('[timeout]', e); }
    timerLock.current = false;
  };

  // ── XP VER (FIX #3: host tarafından, xpAwarded flag ile bir kez) ─────────
  const awardXP = async (finalPl) => {
    const rid = ridRef.current;
    if (!rid) return;
    try {
      await updateDoc(doc(db, 'rooms', rid), { 'gameState.xpAwarded': true });
      const sorted = [...finalPl].sort((a, b) => b.score - a.score);
      for (let i = 0; i < sorted.length; i++) {
        const p = sorted[i];
        const xp = XP_TABLE[i] ?? 10;
        const ps = await getDoc(doc(db, 'users', p.id));
        if (!ps.exists()) continue;
        const cur = ps.data();
        const oldLv = getLevelInfo(cur.xp || 0).level;
        const newXP = (cur.xp || 0) + xp;
        const newLv = getLevelInfo(newXP).level;
        await updateDoc(doc(db, 'users', p.id), { xp: newXP, gamesPlayed: (cur.gamesPlayed || 0) + 1 });
        if (p.id === authRef.current?.uid) {
          setProfile(prev => ({ ...prev, xp: newXP, gamesPlayed: (prev?.gamesPlayed || 0) + 1 }));
          setXpPopup({ xp, levelUp: newLv > oldLv, newLevel: newLv });
        }
      }
    } catch (e) { console.error('[xp]', e); }
  };

  const restartMatch = async () => {
    if (!isHost) return;
    const reset = players.map(p => ({ ...p, hasSelectedNumber: false, score: 0 }));
    await updateDoc(doc(db, 'rooms', roomId), {
      players: reset,
      'gameState.phase': 'selectingNumbers',
      'gameState.clickedNumbers': [], 'gameState.foundPlayers': [],
      'gameState.turnIndex': 0, 'gameState.turnStartTime': Date.now(),
      'gameState.celebration': null, 'gameState.xpAwarded': false,
    });
    setXpPopup(null);
  };

  // ── QUICK PLAY ────────────────────────────────────────────────────────────
  const joinQueue = async () => {
    const qRef = doc(db, 'quickplay', 'queue');
    const snap = await getDoc(qRef);
    const entry = { id: authRef.current.uid, name: profRef.current.nickname, joinedAt: Date.now() };
    if (!snap.exists()) await setDoc(qRef, { players: [entry] });
    else {
      const ex = snap.data().players || [];
      if (!ex.find(p => p.id === authRef.current.uid))
        await updateDoc(qRef, { players: [...ex, entry] });
    }
    setScreen('queue');
  };

  const leaveQueue = async () => {
    try {
      const s = await getDoc(doc(db, 'quickplay', 'queue'));
      if (s.exists()) {
        const rem = (s.data().players || []).filter(p => p.id !== authRef.current?.uid);
        await updateDoc(doc(db, 'quickplay', 'queue'), { players: rem });
      }
    } catch {}
    setScreen('home');
  };

  useEffect(() => {
    if (screen !== 'queue') { unsubQ.current(); unsubQ.current = () => {}; return; }
    const myId = authRef.current?.uid;
    unsubQ.current = onSnapshot(doc(db, 'quickplay', 'queue'), async snap => {
      if (!snap.exists()) return;
      const d = snap.data();
      const qPl = d.players || [];
      setQCount(qPl.length);
      if (qPl.length >= QUICK_PLAY_PLAYERS && qPl[0].id === myId) {
        const chosen = qPl.slice(0, QUICK_PLAY_PLAYERS);
        const rid = `qp_${Date.now()}_${gid()}`;
        const rpw = gid();
        await setDoc(doc(db, 'rooms', rid), {
          name: rid, password: rpw, maxPlayers: QUICK_PLAY_PLAYERS,
          maxNumber: QUICK_PLAY_MAX, host: myId, isQuickPlay: true,
          players: chosen.map((p, i) => ({ ...p, score: 0, isHost: i === 0 })),
          gameState: { phase: 'lobby' }, createdAt: Date.now()
        });
        await updateDoc(doc(db, 'quickplay', 'queue'), {
          players: qPl.slice(QUICK_PLAY_PLAYERS),
          lastMatch: { roomId: rid, password: rpw, playerIds: chosen.map(p => p.id), ts: Date.now() }
        });
      }
      if (d.lastMatch?.playerIds?.includes(myId) && Date.now() - (d.lastMatch.ts || 0) < 15000) {
        unsubQ.current();
        setRoomId(d.lastMatch.roomId);
        setIsHost(d.lastMatch.playerIds[0] === myId);
        setScreen('lobby');
      }
    });
    return () => unsubQ.current();
  }, [screen]);

  // ── COMPUTED ──────────────────────────────────────────────────────────────
  const lvInfo   = getLevelInfo(profile?.xp || 0);
  const cosmetic = getCosmetic(lvInfo.level);
  const theme    = getTheme(lvInfo.level);
  const xpPct    = lvInfo.level >= 50 ? 100 : Math.min(100, (lvInfo.currentXP / lvInfo.requiredXP) * 100);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  if (authLoading) return (
    <div style={{ background: '#020617', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 44, height: 44, border: '3px solid #00f5ff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
    </div>
  );

  // LANDING
  if (screen === 'landing') return (
    <div className="gbg" style={{ background: '#020617', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '8%', left: '4%', width: 320, height: 320, background: 'radial-gradient(circle,rgba(0,245,255,.07) 0%,transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '10%', right: '4%', width: 380, height: 380, background: 'radial-gradient(circle,rgba(139,92,246,.07) 0%,transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ animation: 'float 3s ease-in-out infinite', marginBottom: '2rem' }}>
          <div style={{ width: 94, height: 94, borderRadius: '26px', background: 'linear-gradient(135deg,#00f5ff,#0891b2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', boxShadow: '0 0 60px rgba(0,245,255,.35)', fontSize: '2.75rem' }}>🎯</div>
        </div>
        <h1 className="O" style={{ fontSize: 'clamp(2.5rem,8vw,5rem)', color: '#fff', marginBottom: '.75rem', letterSpacing: '-2px', lineHeight: 1.1 }}>GİZLİ SAYI</h1>
        <div style={{ height: 3, width: 100, background: 'linear-gradient(90deg,transparent,#00f5ff,transparent)', margin: '0 auto 1.25rem' }} />
        <p style={{ color: 'rgba(255,255,255,.5)', fontSize: '1.15rem', maxWidth: 480, lineHeight: 1.65, marginBottom: '2.5rem' }}>
          Sayını sakla. Diğerlerini bul. En son kalan kazanır.
        </p>
        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '2.5rem' }}>
          {['⚡ Hızlı Oyun','👥 2-10 Oyuncu','🏆 50 Level','🎨 Kozmetikler','🌈 Temalar'].map(f => (
            <span key={f} className="gl" style={{ padding: '.35rem 1rem', borderRadius: '100px', color: 'rgba(255,255,255,.7)', fontSize: '.87rem', fontWeight: 600 }}>{f}</span>
          ))}
        </div>
        <button onClick={() => setScreen('auth')} style={{ padding: '1rem 3.5rem', background: 'linear-gradient(135deg,#00f5ff,#0891b2)', color: '#020617', fontWeight: 800, fontSize: '1.1rem', border: 'none', borderRadius: '16px', cursor: 'pointer', letterSpacing: '1px', boxShadow: '0 0 30px rgba(0,245,255,.4)', transition: 'transform .2s' }}
          onMouseEnter={e => e.target.style.transform = 'scale(1.05)'}
          onMouseLeave={e => e.target.style.transform = 'scale(1)'}
        >OYNA</button>
      </div>
    </div>
  );

  // AUTH
  if (screen === 'auth') return (
    <div className="gbg" style={{ background: '#020617', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="gd" style={{ width: '100%', maxWidth: 420, borderRadius: '24px', padding: '2.2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.6rem' }}>
          <div style={{ fontSize: '2rem' }}>🎯</div>
          <h2 className="O" style={{ color: '#fff', fontSize: '1.2rem', marginTop: '.4rem', letterSpacing: '1px' }}>GİZLİ SAYI</h2>
        </div>
        <div style={{ display: 'flex', background: 'rgba(255,255,255,.05)', borderRadius: '11px', padding: '3px', marginBottom: '1.4rem' }}>
          {['login','register'].map(t => (
            <button key={t} onClick={() => { setTab(t); setAErr(''); }} style={{ flex: 1, padding: '.58rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '.87rem', letterSpacing: '.5px', transition: 'all .2s', background: tab === t ? 'linear-gradient(135deg,#00f5ff,#0891b2)' : 'transparent', color: tab === t ? '#020617' : 'rgba(255,255,255,.4)' }}>
              {t === 'login' ? 'GİRİŞ' : 'KAYIT OL'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.78rem' }}>
          {tab === 'register' && <input placeholder="Kullanıcı Adı (min 3)" value={aNick} onChange={e => setANick(e.target.value)} style={IS} />}
          <input placeholder="Gmail adresi (@gmail.com)" type="email" value={aEmail} onChange={e => setAEmail(e.target.value)} style={IS} />
          <input placeholder="Şifre (min 6)" type="password" value={aPass} onChange={e => setAPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && (tab === 'login' ? doLogin() : doRegister())} style={IS} />
          {aErr && <div style={{ padding: '.65rem 1rem', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', borderRadius: '9px', color: '#fca5a5', fontSize: '.86rem' }}>⚠️ {aErr}</div>}
          <button onClick={tab === 'login' ? doLogin : doRegister} disabled={aBusy} style={{ padding: '.88rem', background: aBusy ? 'rgba(255,255,255,.06)' : 'linear-gradient(135deg,#00f5ff,#0891b2)', border: 'none', borderRadius: '11px', color: aBusy ? 'rgba(255,255,255,.25)' : '#020617', fontWeight: 700, fontSize: '.97rem', cursor: aBusy ? 'not-allowed' : 'pointer', letterSpacing: '.5px' }}>
            {aBusy ? '⏳...' : tab === 'login' ? 'GİRİŞ YAP' : 'KAYIT OL'}
          </button>
          <button onClick={() => setScreen('landing')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.22)', cursor: 'pointer', fontSize: '.82rem', fontWeight: 500 }}>← Geri</button>
        </div>
      </div>
    </div>
  );

  // HOME
  if (screen === 'home') return (
    <div className="gbg" style={{ background: theme.bg, minHeight: '100vh', padding: '1.2rem' }}>
      <div style={{ maxWidth: 840, margin: '0 auto' }}>
        {/* Topbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.4rem' }}>
          <span className="O" style={{ color: theme.accent, fontSize: '.95rem', letterSpacing: '2px' }}>GİZLİ SAYI</span>
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <button onClick={() => { setENick(''); setEOldPw(''); setENewPw(''); setEErr(''); setEOk(''); setScreen('profileEdit'); }} style={{ padding: '.4rem .85rem', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: '9px', color: 'rgba(255,255,255,.65)', cursor: 'pointer', fontSize: '.8rem', fontWeight: 600 }}>⚙️ Profil</button>
            <button onClick={doSignOut} style={{ padding: '.4rem .85rem', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.22)', borderRadius: '9px', color: '#fca5a5', cursor: 'pointer', fontSize: '.8rem', fontWeight: 600 }}>Çıkış</button>
          </div>
        </div>

        {/* Profile card */}
        <div className="gd" style={{ borderRadius: '20px', padding: '1.4rem', marginBottom: '1.1rem', borderLeft: `3px solid ${cosmetic.glow}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.9rem', flexWrap: 'wrap' }}>
            <div style={{ width: 56, height: 56, borderRadius: '14px', background: `${cosmetic.glow}20`, border: `2px solid ${cosmetic.glow}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.7rem', flexShrink: 0 }}>{cosmetic.badge}</div>
            <div style={{ flex: 1, minWidth: 170 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.55rem', flexWrap: 'wrap' }}>
                <span style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 700 }}>{profile?.nickname}</span>
                <span style={{ color: cosmetic.glow, fontSize: '.72rem', fontWeight: 700, background: `${cosmetic.glow}15`, padding: '.13rem .55rem', borderRadius: '100px', border: `1px solid ${cosmetic.glow}30` }}>{cosmetic.title}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.45rem', marginTop: '.45rem' }}>
                <span className="O" style={{ color: cosmetic.glow, fontSize: '.77rem', fontWeight: 700, minWidth: 52 }}>LV {lvInfo.level}</span>
                <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,.07)', borderRadius: '100px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${xpPct.toFixed(1)}%`, background: `linear-gradient(90deg,${cosmetic.glow},#fff)`, borderRadius: '100px', transition: 'width 1s ease' }} />
                </div>
                <span style={{ color: 'rgba(255,255,255,.3)', fontSize: '.72rem', minWidth: 75, textAlign: 'right' }}>{lvInfo.currentXP}/{lvInfo.requiredXP} XP</span>
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: 'rgba(255,255,255,.25)', fontSize: '.66rem', letterSpacing: '1px' }}>MAÇLAR</div>
              <div className="O" style={{ color: '#fff', fontSize: '1.35rem', fontWeight: 700 }}>{profile?.gamesPlayed || 0}</div>
            </div>
          </div>
        </div>

        {/* Cosmetics row */}
        <div className="gd" style={{ borderRadius: '16px', padding: '.9rem 1.2rem', marginBottom: '1.1rem' }}>
          <p style={{ color: 'rgba(255,255,255,.22)', fontSize: '.66rem', letterSpacing: '2px', marginBottom: '.55rem' }}>KOZMETİK YOLCULUĞU (50 LEVEL)</p>
          <div style={{ display: 'flex', gap: '.38rem', overflowX: 'auto', paddingBottom: '.15rem' }}>
            {COSMETICS.map(c => {
              const un = lvInfo.level >= c.level;
              const cur = getCosmetic(lvInfo.level).level === c.level;
              return (
                <div key={c.level} title={`Lv${c.level}: ${c.title}`} style={{ flex: '0 0 auto', width: 45, height: 45, borderRadius: '11px', background: cur ? `${c.glow}28` : un ? `${c.glow}12` : 'rgba(255,255,255,.02)', border: `1.5px solid ${cur ? c.glow : un ? c.glow+'44' : 'rgba(255,255,255,.04)'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', filter: un ? 'none' : 'grayscale(1) opacity(.22)', boxShadow: cur ? `0 0 14px ${c.glow}55` : 'none' }}>
                  <span style={{ fontSize: '1.15rem' }}>{c.badge}</span>
                  <span className="O" style={{ fontSize: '.38rem', color: c.glow, marginTop: '1px' }}>LV{c.level}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: '.85rem' }}>
          {[
            { icon: '⚡', label: 'HIZLI OYUN',  sub: '4 kişi dolunca otomatik başlar', c: '#00f5ff', bg: 'rgba(0,245,255,.07)', b: 'rgba(0,245,255,.16)', fn: joinQueue },
            { icon: '🏠', label: 'ODA OLUŞTUR', sub: 'Arkadaşlarınla özel oda',        c: '#a78bfa', bg: 'rgba(139,92,246,.07)', b: 'rgba(139,92,246,.16)', fn: () => setScreen('createRoom') },
            { icon: '🔑', label: 'ODAYA KATIL', sub: 'Oda adı ve şifre ile giriş',     c: '#fbbf24', bg: 'rgba(251,191,36,.07)', b: 'rgba(251,191,36,.16)', fn: () => setScreen('joinRoom') },
          ].map(a => (
            <button key={a.label} onClick={a.fn} style={{ padding: '1.5rem', borderRadius: '16px', background: a.bg, border: `1px solid ${a.b}`, cursor: 'pointer', textAlign: 'left', transition: 'all .2s' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = a.c; }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.borderColor = a.b; }}>
              <div style={{ fontSize: '2.1rem', marginBottom: '.55rem' }}>{a.icon}</div>
              <div style={{ color: a.c, fontWeight: 700, fontSize: '1rem', letterSpacing: '.5px' }}>{a.label}</div>
              <div style={{ color: 'rgba(255,255,255,.3)', fontSize: '.8rem', marginTop: '.2rem' }}>{a.sub}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // PROFILE EDIT (FIX #7)
  if (screen === 'profileEdit') return (
    <div className="gbg" style={{ background: theme.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="gd" style={{ width: '100%', maxWidth: 400, borderRadius: '22px', padding: '1.9rem' }}>
        <button onClick={() => setScreen('home')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.28)', cursor: 'pointer', fontSize: '.87rem', marginBottom: '1.2rem', fontWeight: 600 }}>← Geri</button>
        <div style={{ textAlign: 'center', marginBottom: '1.4rem' }}>
          <div style={{ fontSize: '2.2rem' }}>{cosmetic.badge}</div>
          <div className="O" style={{ color: cosmetic.glow, fontSize: '.8rem', marginTop: '.25rem' }}>{profile?.nickname} — {cosmetic.title}</div>
          <div style={{ color: 'rgba(255,255,255,.25)', fontSize: '.72rem', marginTop: '.15rem' }}>{profile?.email}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.82rem' }}>
          <div>
            <label style={{ color: 'rgba(255,255,255,.3)', fontSize: '.7rem', letterSpacing: '1px', display: 'block', marginBottom: '.3rem' }}>YENİ KULLANICI ADI</label>
            <input placeholder={`Mevcut: ${profile?.nickname}`} value={eNick} onChange={e => setENick(e.target.value)} style={IS} />
          </div>
          <div>
            <label style={{ color: 'rgba(255,255,255,.3)', fontSize: '.7rem', letterSpacing: '1px', display: 'block', marginBottom: '.3rem' }}>ŞİFRE DEĞİŞTİR</label>
            <input placeholder="Mevcut şifre" type="password" value={eOldPw} onChange={e => setEOldPw(e.target.value)} style={{ ...IS, marginBottom: '.4rem' }} />
            <input placeholder="Yeni şifre (min 6)" type="password" value={eNewPw} onChange={e => setENewPw(e.target.value)} style={IS} />
          </div>
          {eErr && <div style={{ padding: '.62rem', background: 'rgba(239,68,68,.09)', borderRadius: '9px', color: '#fca5a5', fontSize: '.83rem' }}>⚠️ {eErr}</div>}
          {eOk  && <div style={{ padding: '.62rem', background: 'rgba(34,197,94,.09)', borderRadius: '9px', color: '#4ade80', fontSize: '.83rem' }}>{eOk}</div>}
          <button onClick={saveProfile} style={{ padding: '.88rem', background: `linear-gradient(135deg,${cosmetic.glow},${cosmetic.glow}99)`, border: 'none', borderRadius: '11px', color: '#fff', fontWeight: 700, fontSize: '.95rem', cursor: 'pointer' }}>KAYDET</button>
        </div>
      </div>
    </div>
  );

  // CREATE ROOM
  if (screen === 'createRoom') return (
    <div className="gbg" style={{ background: theme.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="gd" style={{ width: '100%', maxWidth: 440, borderRadius: '22px', padding: '1.9rem' }}>
        <button onClick={() => setScreen('home')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.28)', cursor: 'pointer', fontSize: '.87rem', marginBottom: '1.2rem', fontWeight: 600 }}>← Geri</button>
        <h2 className="O" style={{ color: '#a78bfa', fontSize: '1.15rem', marginBottom: '1.4rem', letterSpacing: '1px' }}>ODA OLUŞTUR</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.95rem' }}>
          <input placeholder="Oda Adı" value={rName} onChange={e => setRName(e.target.value)} style={IS} />
          <input placeholder="Şifre" type="password" value={rPass} onChange={e => setRPass(e.target.value)} style={IS} />
          <div>
            <label style={{ color: 'rgba(255,255,255,.3)', fontSize: '.7rem', letterSpacing: '1px', display: 'block', marginBottom: '.38rem' }}>SAYI ARALIĞI (20–100) — Klavye ile gir</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.7rem' }}>
              <input type="number" min={20} max={100} value={rMax} onChange={e => setRMax(Math.max(20, Math.min(100, +e.target.value || 20)))} style={{ ...IS, width: 88, textAlign: 'center', fontSize: '1.4rem', fontWeight: 700, color: '#a78bfa', padding: '.55rem' }} />
              <div style={{ display: 'flex', gap: '.38rem', flexWrap: 'wrap' }}>
                {[20,30,50,75,100].map(n => <button key={n} onClick={() => setRMax(n)} style={{ padding: '.3rem .6rem', borderRadius: '7px', border: `1px solid ${rMax===n?'#a78bfa':'rgba(255,255,255,.1)'}`, background: rMax===n?'rgba(139,92,246,.18)':'transparent', color: rMax===n?'#a78bfa':'rgba(255,255,255,.35)', cursor: 'pointer', fontSize: '.8rem', fontWeight: 600 }}>{n}</button>)}
              </div>
            </div>
          </div>
          <div>
            <label style={{ color: 'rgba(255,255,255,.3)', fontSize: '.7rem', letterSpacing: '1px', display: 'block', marginBottom: '.38rem' }}>MAX OYUNCU</label>
            <div style={{ display: 'flex', gap: '.38rem', flexWrap: 'wrap' }}>
              {[2,3,4,5,6,8,10].map(n => <button key={n} onClick={() => setRPl(n)} style={{ padding: '.38rem .75rem', borderRadius: '8px', border: `1px solid ${rPl===n?'#a78bfa':'rgba(255,255,255,.1)'}`, background: rPl===n?'rgba(139,92,246,.18)':'transparent', color: rPl===n?'#a78bfa':'rgba(255,255,255,.35)', cursor: 'pointer', fontWeight: 700 }}>{n}</button>)}
            </div>
          </div>
          <button onClick={() => createRoom()} style={{ padding: '.9rem', background: 'linear-gradient(135deg,#a78bfa,#7c3aed)', border: 'none', borderRadius: '11px', color: '#fff', fontWeight: 700, fontSize: '.95rem', cursor: 'pointer', letterSpacing: '.5px' }}>ODA OLUŞTUR</button>
        </div>
      </div>
    </div>
  );

  // JOIN ROOM
  if (screen === 'joinRoom') return (
    <div className="gbg" style={{ background: theme.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="gd" style={{ width: '100%', maxWidth: 380, borderRadius: '22px', padding: '1.9rem' }}>
        <button onClick={() => setScreen('home')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.28)', cursor: 'pointer', fontSize: '.87rem', marginBottom: '1.2rem', fontWeight: 600 }}>← Geri</button>
        <h2 className="O" style={{ color: '#fbbf24', fontSize: '1.15rem', marginBottom: '1.4rem', letterSpacing: '1px' }}>ODAYA KATIL</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.82rem' }}>
          <input placeholder="Oda Adı" value={jName} onChange={e => setJName(e.target.value)} style={IS} />
          <input placeholder="Şifre" type="password" value={jPass} onChange={e => setJPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && joinRoom()} style={IS} />
          <button onClick={() => joinRoom()} style={{ padding: '.9rem', background: 'linear-gradient(135deg,#fbbf24,#d97706)', border: 'none', borderRadius: '11px', color: '#020617', fontWeight: 700, fontSize: '.95rem', cursor: 'pointer' }}>BAĞLAN</button>
        </div>
      </div>
    </div>
  );

  // QUEUE
  if (screen === 'queue') return (
    <div className="gbg" style={{ background: theme.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="gd" style={{ width: '100%', maxWidth: 360, borderRadius: '22px', padding: '2.4rem 1.7rem', textAlign: 'center' }}>
        <div style={{ width: 68, height: 68, border: '3px solid rgba(0,245,255,.22)', borderTopColor: '#00f5ff', borderRadius: '50%', margin: '0 auto 1.6rem', animation: 'spin 1s linear infinite' }} />
        <h2 className="O" style={{ color: '#00f5ff', fontSize: '1rem', letterSpacing: '2px', marginBottom: '.6rem' }}>SIRA BEKLİYORSUN</h2>
        <p style={{ color: 'rgba(255,255,255,.3)', marginBottom: '1.6rem' }}>{qCount} / {QUICK_PLAY_PLAYERS} oyuncu</p>
        <div style={{ display: 'flex', gap: '.45rem', justifyContent: 'center', marginBottom: '1.4rem' }}>
          {Array.from({ length: QUICK_PLAY_PLAYERS }).map((_, i) => (
            <div key={i} style={{ width: 40, height: 40, borderRadius: '50%', background: i < qCount ? 'linear-gradient(135deg,#00f5ff,#0891b2)' : 'rgba(255,255,255,.05)', border: `2px solid ${i < qCount ? '#00f5ff' : 'rgba(255,255,255,.09)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .3s', fontSize: '1rem' }}>
              {i < qCount ? '👤' : ''}
            </div>
          ))}
        </div>
        <p style={{ color: 'rgba(255,255,255,.18)', fontSize: '.8rem', marginBottom: '1.4rem' }}>Dolunca otomatik başlar · 1–{QUICK_PLAY_MAX}</p>
        <button onClick={leaveQueue} style={{ padding: '.6rem 1.6rem', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.22)', borderRadius: '11px', color: '#fca5a5', cursor: 'pointer', fontWeight: 600 }}>Sıradan Çık</button>
      </div>
    </div>
  );

  // LOBBY
  if (screen === 'lobby') return (
    <div className="gbg" style={{ background: theme.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="gd" style={{ width: '100%', maxWidth: 480, borderRadius: '22px', padding: '1.9rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.6rem' }}>
          <div style={{ fontSize: '2.3rem', marginBottom: '.38rem' }}>👑</div>
          <h2 className="O" style={{ color: '#fff', fontSize: '1.2rem', letterSpacing: '1px' }}>{roomData?.name || '...'}</h2>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '.4rem', flexWrap: 'wrap' }}>
            <span style={{ color: 'rgba(255,255,255,.28)', fontSize: '.72rem', fontWeight: 600, letterSpacing: '1px' }}>👥 MAX {roomData?.maxPlayers}</span>
            <span style={{ color: 'rgba(255,255,255,.28)', fontSize: '.72rem', fontWeight: 600, letterSpacing: '1px' }}>🎯 1–{roomData?.maxNumber}</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', marginBottom: '1.6rem' }}>
          {players.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '.8rem 1rem', borderRadius: '11px', background: p.id === authUser?.uid ? 'rgba(0,245,255,.07)' : 'rgba(255,255,255,.04)', border: `1px solid ${p.id === authUser?.uid ? 'rgba(0,245,255,.18)' : 'rgba(255,255,255,.05)'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.55rem' }}>
                <span style={{ fontSize: '1rem' }}>👤</span>
                <span style={{ color: '#fff', fontWeight: 600 }}>{p.name}</span>
                {p.id === authUser?.uid && <span style={{ color: '#00f5ff', fontSize: '.68rem', fontWeight: 700 }}>(SEN)</span>}
              </div>
              {p.isHost && <span style={{ color: '#fbbf24', background: 'rgba(251,191,36,.1)', border: '1px solid rgba(251,191,36,.22)', padding: '.12rem .5rem', borderRadius: '6px', fontSize: '.68rem', fontWeight: 700 }}>HOST</span>}
            </div>
          ))}
        </div>
        {isHost
          ? <button onClick={startGame} disabled={players.length < 2} style={{ width: '100%', padding: '.95rem', background: players.length < 2 ? 'rgba(255,255,255,.04)' : 'linear-gradient(135deg,#00f5ff,#0891b2)', border: 'none', borderRadius: '13px', color: players.length < 2 ? 'rgba(255,255,255,.18)' : '#020617', fontWeight: 700, fontSize: '.97rem', cursor: players.length < 2 ? 'not-allowed' : 'pointer', letterSpacing: '.5px' }}>
              {players.length < 2 ? 'En az 2 kişi gerekli...' : 'OYUNU BAŞLAT'}
            </button>
          : <div style={{ textAlign: 'center', padding: '.95rem', background: 'rgba(0,245,255,.04)', border: '1px solid rgba(0,245,255,.11)', borderRadius: '13px', color: '#00f5ff', fontWeight: 600 }}>⏳ Host oyunu başlatmayı bekliyor...</div>
        }
        <button onClick={leaveRoom} style={{ display: 'block', margin: '.8rem auto 0', background: 'none', border: 'none', color: 'rgba(255,255,255,.18)', cursor: 'pointer', fontSize: '.8rem' }}>Odadan Ayrıl</button>
      </div>
    </div>
  );

  // SELECT NUMBER
  if (screen === 'selectNumber') {
    const mine = players.find(p => p.id === authUser?.uid);
    const readyN = players.filter(p => p.hasSelectedNumber).length;
    return (
      <div className="gbg" style={{ background: theme.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div className="gd" style={{ width: '100%', maxWidth: 380, borderRadius: '22px', padding: '1.9rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2.3rem', marginBottom: '.7rem' }}>🔐</div>
          <h2 className="O" style={{ color: '#fff', fontSize: '1.1rem', letterSpacing: '1px', marginBottom: '.3rem' }}>SAYINI GİZLE</h2>
          <p style={{ color: 'rgba(255,255,255,.28)', fontSize: '.85rem', marginBottom: '1.4rem' }}>1 ile {roomData?.maxNumber} arasında · kimse bilmeyecek!</p>
          <div style={{ display: 'flex', gap: '.38rem', justifyContent: 'center', marginBottom: '1.1rem' }}>
            {players.map(p => (
              <div key={p.id} title={p.name} style={{ width: 32, height: 32, borderRadius: '50%', background: p.hasSelectedNumber ? 'rgba(34,197,94,.15)' : 'rgba(255,255,255,.04)', border: `2px solid ${p.hasSelectedNumber ? '#22c55e' : 'rgba(255,255,255,.09)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.85rem', transition: 'all .3s' }}>
                {p.hasSelectedNumber ? '✅' : '⏳'}
              </div>
            ))}
          </div>
          <p style={{ color: 'rgba(255,255,255,.18)', fontSize: '.76rem', marginBottom: '1.1rem' }}>{readyN}/{players.length} hazır</p>
          {mine?.hasSelectedNumber
            ? <div style={{ padding: '1.6rem', background: 'rgba(34,197,94,.07)', border: '1px solid rgba(34,197,94,.22)', borderRadius: '16px', color: '#4ade80', fontSize: '1.05rem', fontWeight: 700 }}>🔒 Sayın kilitlendi!</div>
            : <>
                <input type="number" min={1} max={roomData?.maxNumber} value={mySecret || ''} onChange={e => setMySecret(Math.max(1, Math.min(roomData?.maxNumber || 100, +e.target.value || '')))} placeholder="?" onKeyDown={e => e.key === 'Enter' && submitSecret()}
                  style={{ width: '100%', fontSize: '3.2rem', textAlign: 'center', padding: '.7rem', background: 'rgba(255,255,255,.05)', border: '2px solid rgba(255,255,255,.09)', borderRadius: '16px', color: '#00f5ff', fontWeight: 700, outline: 'none', marginBottom: '.8rem' }}
                />
                <button onClick={submitSecret} style={{ width: '100%', padding: '.92rem', background: 'linear-gradient(135deg,#00f5ff,#0891b2)', border: 'none', borderRadius: '12px', color: '#020617', fontWeight: 700, fontSize: '.95rem', cursor: 'pointer' }}>SAYIYI GİZLE</button>
              </>
          }
        </div>
      </div>
    );
  }

  // GAME
  if (screen === 'game') {
    if (!gameState || !roomData) return (
      <div style={{ background: '#020617', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#00f5ff', fontWeight: 700 }}>Yükleniyor...</div>
      </div>
    );

    const curId    = gameState.turnOrder?.[gameState.turnIndex];
    const isMyTurn = curId === authUser?.uid;
    const isFound  = gameState.foundPlayers?.includes(authUser?.uid);
    const curName  = players.find(p => p.id === curId)?.name || '?';
    const maxN     = roomData.maxNumber || 50;

    // FIX #8: Sayıya göre dinamik grid
    const cols    = maxN <= 20 ? 4 : maxN <= 30 ? 5 : maxN <= 42 ? 6 : maxN <= 56 ? 7 : maxN <= 72 ? 8 : 10;
    const btnSz   = maxN <= 30 ? 58 : maxN <= 50 ? 52 : maxN <= 75 ? 44 : 38;

    return (
      <div className="gbg" style={{ background: '#020617', minHeight: '100vh', padding: '.7rem', display: 'flex', flexDirection: 'column', gap: '.7rem' }}>

        {/* Tickers — pure React state, positioned fixed top-right, no CSS animation (FIX removeChild) */}
        {tickers.length > 0 && (
          <div style={{ position: 'fixed', top: '10%', right: '.75rem', zIndex: 200, display: 'flex', flexDirection: 'column', gap: '.35rem', pointerEvents: 'none' }}>
            {tickers.map(t => (
              <div key={t.id} style={{ color: t.color, fontWeight: 700, fontSize: '.92rem', background: 'rgba(0,0,0,.55)', padding: '.3rem .7rem', borderRadius: '8px', border: `1px solid ${t.color}40`, animation: 'slideIn .22s ease' }}>
                {t.text}
              </div>
            ))}
          </div>
        )}

        {/* Celebration overlay — from Firestore, shown to ALL players (FIX #2) */}
        {celebration && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(8px)' }}>
            <div className="gd" style={{ borderRadius: '24px', padding: '2.2rem 1.9rem', textAlign: 'center', border: '1px solid rgba(74,222,128,.28)', maxWidth: 340, animation: 'celebIn .4s ease' }}>
              <div style={{ fontSize: '3.2rem', marginBottom: '.65rem', animation: 'float 1s ease-in-out infinite' }}>🏆</div>
              <h2 className="O" style={{ color: '#4ade80', fontSize: '1.1rem', letterSpacing: '1px', marginBottom: '.45rem' }}>SAYI BULUNDU!</h2>
              {/* FIX #1: bulunan = KAZANDI (puan aldı), bulan = ceza aldı */}
              <p style={{ color: 'rgba(255,255,255,.55)', marginBottom: '.2rem', fontSize: '.93rem' }}>🎯 Bulan: <strong style={{ color: '#fbbf24' }}>{celebration.finder}</strong> <span style={{ color: '#f87171' }}>({celebration.penalty} puan)</span></p>
              <p style={{ color: 'rgba(255,255,255,.55)', fontSize: '.93rem' }}>🎉 Kazanan: <strong style={{ color: '#4ade80' }}>{celebration.winner}</strong> <span style={{ color: '#4ade80' }}>(+{celebration.earned} puan)</span></p>
              <div className="O" style={{ fontSize: '2.2rem', marginTop: '.7rem', color: '#fff' }}>{celebration.number}</div>
            </div>
          </div>
        )}

        {/* Top bar */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.7fr', gap: '.6rem' }}>
          <div className="gd" style={{ padding: '.8rem .95rem', borderRadius: '14px', border: '1px solid rgba(0,245,255,.11)' }}>
            <div style={{ color: 'rgba(255,255,255,.22)', fontSize: '.62rem', letterSpacing: '2px', marginBottom: '.12rem' }}>GİZLİ SAYIM</div>
            <div className="O" style={{ color: '#00f5ff', fontSize: '1.75rem', fontWeight: 700, textShadow: '0 0 14px rgba(0,245,255,.4)' }}>{mySecret ?? '?'}</div>
          </div>
          <div className="gd" style={{ padding: '.8rem .95rem', borderRadius: '14px', border: `1px solid ${isMyTurn ? 'rgba(0,245,255,.32)' : 'rgba(255,255,255,.05)'}`, background: isMyTurn ? 'rgba(0,245,255,.055)' : undefined, display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all .3s' }}>
            <div>
              <div style={{ color: 'rgba(255,255,255,.22)', fontSize: '.62rem', letterSpacing: '2px', marginBottom: '.12rem' }}>SIRADAKI</div>
              <div style={{ color: isMyTurn ? '#00f5ff' : '#fff', fontWeight: 700, fontSize: '.97rem' }}>
                {curName}{isMyTurn && ' ✨ (SEN)'}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div className="O" style={{ fontSize: '1.9rem', fontWeight: 900, color: timeLeft <= 5 ? '#f87171' : timeLeft <= 9 ? '#fbbf24' : '#00f5ff', animation: timeLeft <= 5 ? 'bounce .5s ease-in-out infinite' : undefined }}>
                {timeLeft}
              </div>
              <div style={{ color: 'rgba(255,255,255,.18)', fontSize: '.58rem', letterSpacing: '1px' }}>SN</div>
            </div>
          </div>
        </div>

        {/* Grid + Scoreboard */}
        <div style={{ flex: 1, display: 'flex', gap: '.7rem', alignItems: 'flex-start', minHeight: 0 }}>
          {/* Number grid — FIX #8: dinamik, sayıya göre boyutlanır */}
          <div className="gd" style={{ flex: 1, padding: '.8rem', borderRadius: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, ${btnSz}px)`, gap: '5px', justifyContent: 'center' }}>
              {Array.from({ length: maxN }, (_, i) => i + 1).map(num => {
                const clicked   = gameState.clickedNumbers?.includes(num);
                const isOwn     = num === mySecret;
                const canClick  = isMyTurn && !isFound && !clicked && !isOwn;
                return (
                  <button key={num} className="nb" disabled={!canClick}
                    onClick={() => canClick && clickNumber(num)}
                    style={{
                      width: btnSz, height: btnSz,
                      fontSize: maxN > 60 ? '.78rem' : '.92rem',
                      background: isOwn ? 'rgba(0,245,255,.11)' : clicked ? 'rgba(255,255,255,.03)' : canClick ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.04)',
                      color: isOwn ? '#00f5ff' : clicked ? 'rgba(255,255,255,.1)' : canClick ? '#fff' : 'rgba(255,255,255,.26)',
                      outline: isOwn ? '1.5px solid rgba(0,245,255,.35)' : canClick ? '1px solid rgba(255,255,255,.09)' : 'none',
                      cursor: canClick ? 'pointer' : 'default',
                    }}
                  >
                    {isOwn ? '★' : clicked ? '·' : num}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scoreboard */}
          <div className="gd" style={{ width: 172, borderRadius: '16px', padding: '.9rem', flexShrink: 0 }}>
            <div style={{ color: 'rgba(255,255,255,.22)', fontSize: '.62rem', letterSpacing: '2px', marginBottom: '.65rem' }}>SKOR</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.42rem' }}>
              {[...players].sort((a, b) => b.score - a.score).map((p, i) => {
                const won = gameState.foundPlayers?.includes(p.id);
                return (
                  <div key={p.id} style={{ padding: '.48rem .62rem', borderRadius: '8px', background: p.id === authUser?.uid ? 'rgba(0,245,255,.07)' : 'rgba(255,255,255,.04)', border: `1px solid ${p.id === authUser?.uid ? 'rgba(0,245,255,.16)' : 'rgba(255,255,255,.04)'}`, opacity: won ? .55 : 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: i === 0 ? '#fbbf24' : '#fff', fontSize: '.77rem', fontWeight: 600, maxWidth: 85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i + 1}. {p.name}</span>
                      <span className="O" style={{ color: p.id === authUser?.uid ? '#00f5ff' : 'rgba(255,255,255,.6)', fontSize: '.8rem' }}>{p.score}</span>
                    </div>
                    {/* FIX #1: "KAZANDI 🎉" — sayısı bulunan kazanmış, elenmemiş! */}
                    {won && <div style={{ color: '#4ade80', fontSize: '.6rem', fontWeight: 700, marginTop: '.12rem' }}>KAZANDI 🎉</div>}
                  </div>
                );
              })}
            </div>
            {/* FIX #1: kendi sayın bulunduysa olumlu mesaj */}
            {isFound && (
              <div style={{ marginTop: '.65rem', padding: '.55rem', background: 'rgba(74,222,128,.08)', border: '1px solid rgba(74,222,128,.22)', borderRadius: '8px', color: '#4ade80', fontSize: '.7rem', fontWeight: 700, textAlign: 'center' }}>
                Sayın bulundu 🎉<br /><span style={{ color: 'rgba(255,255,255,.3)', fontWeight: 500 }}>Diğerlerini izle</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // RESULTS
  if (screen === 'results') return (
    <div className="gbg" style={{ background: theme.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="gd" style={{ width: '100%', maxWidth: 420, borderRadius: '24px', padding: '1.9rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3.2rem', marginBottom: '.65rem', animation: 'float 2s ease-in-out infinite' }}>🏆</div>
        <h2 className="O" style={{ color: '#fbbf24', fontSize: '1.4rem', letterSpacing: '2px', marginBottom: '.4rem' }}>OYUN BİTTİ</h2>
        {xpPopup && (
          <div style={{ margin: '.65rem 0', padding: '.6rem 1rem', background: 'rgba(74,222,128,.09)', border: '1px solid rgba(74,222,128,.22)', borderRadius: '11px', display: 'inline-block' }}>
            <span style={{ color: '#4ade80', fontWeight: 700 }}>+{xpPopup.xp} XP</span>
            {xpPopup.levelUp && <span style={{ color: '#fbbf24', fontWeight: 700, marginLeft: '.45rem' }}>🎊 LV {xpPopup.newLevel}!</span>}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', margin: '1.1rem 0' }}>
          {[...players].sort((a, b) => b.score - a.score).map((p, i) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '.8rem 1rem', borderRadius: '13px', background: i === 0 ? 'rgba(251,191,36,.08)' : 'rgba(255,255,255,.04)', border: `1px solid ${i === 0 ? 'rgba(251,191,36,.25)' : 'rgba(255,255,255,.05)'}`, transform: i === 0 ? 'scale(1.02)' : 'scale(1)' }}>
              <span style={{ color: i === 0 ? '#fbbf24' : '#fff', fontWeight: 700, fontSize: '.97rem' }}>
                {['🥇', '🥈', '🥉'][i] || `${i + 1}.`} {p.name}
                {p.id === authUser?.uid && <span style={{ color: '#00f5ff', fontSize: '.72rem', marginLeft: '.3rem' }}>(SEN)</span>}
              </span>
              <span className="O" style={{ color: i === 0 ? '#fbbf24' : 'rgba(255,255,255,.6)', fontWeight: 700 }}>{p.score}</span>
            </div>
          ))}
        </div>
        {isHost
          ? <button onClick={restartMatch} style={{ width: '100%', padding: '.95rem', background: 'linear-gradient(135deg,#00f5ff,#0891b2)', border: 'none', borderRadius: '13px', color: '#020617', fontWeight: 700, fontSize: '.97rem', cursor: 'pointer', letterSpacing: '.5px', marginBottom: '.6rem' }}>🔄 YENİDEN BAŞLAT</button>
          : <div style={{ padding: '.8rem', background: 'rgba(0,245,255,.04)', border: '1px solid rgba(0,245,255,.11)', borderRadius: '12px', color: '#00f5ff', fontWeight: 600, marginBottom: '.6rem' }}>⏳ Host yeni maçı başlatıyor...</div>
        }
        <button onClick={leaveRoom} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.18)', cursor: 'pointer', fontSize: '.8rem' }}>Ana Menüye Dön</button>
      </div>
    </div>
  );

  return null;
}

export default function GizliSayiOyunu() {
  return <EB><App /></EB>;
}
