import React, { useState, useEffect, useRef, useCallback } from 'react';
import { initializeApp } from "firebase/app";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot,
  collection, getDocs, deleteDoc, serverTimestamp, arrayUnion
} from "firebase/firestore";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  onAuthStateChanged, signOut, updateProfile
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
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const BASE_POINTS = 100;
const SCORE_RATIO = 0.8;
const FINDER_PENALTY = -20;
const TURN_TIME = 15;
const QUICK_PLAY_PLAYERS = 4;
const QUICK_PLAY_MAX_NUMBER = 35;

// ─── LEVEL SİSTEMİ ────────────────────────────────────────────────────────────
// İlk seviye için ~3-4 maç (maç başı ~80-100 XP), giderek zorlaşır
const XP_FOR_LEVEL = (lvl) => Math.floor(280 * Math.pow(1.45, lvl - 1));

const getLevelInfo = (totalXP) => {
  let level = 1, spent = 0;
  while (true) {
    const needed = XP_FOR_LEVEL(level);
    if (spent + needed > totalXP) {
      return { level, currentXP: totalXP - spent, requiredXP: needed, progress: (totalXP - spent) / needed };
    }
    spent += needed;
    level++;
  }
};

const XP_REWARDS = [120, 90, 70, 50]; // 1. 2. 3. 4. sıra için

// ─── KOZMETİK ÖDÜLLER ─────────────────────────────────────────────────────────
const COSMETICS = [
  { level: 1,  badge: '🌱', title: 'Acemi',       glow: '#64748b', ring: 'ring-slate-500'   },
  { level: 2,  badge: '⚡', title: 'Çaylak',      glow: '#3b82f6', ring: 'ring-blue-500'    },
  { level: 3,  badge: '🔥', title: 'Avcı',        glow: '#f97316', ring: 'ring-orange-500'  },
  { level: 5,  badge: '🎯', title: 'Stratejist',  glow: '#8b5cf6', ring: 'ring-violet-500'  },
  { level: 8,  badge: '💎', title: 'Usta',        glow: '#06b6d4', ring: 'ring-cyan-400'    },
  { level: 12, badge: '👑', title: 'Efsane',      glow: '#eab308', ring: 'ring-yellow-400'  },
  { level: 18, badge: '🌌', title: 'Tanrı',       glow: '#ec4899', ring: 'ring-pink-400'    },
  { level: 25, badge: '🔮', title: 'Ölümsüz',     glow: '#a855f7', ring: 'ring-purple-400'  },
];

const getCosmetic = (level) => {
  let cos = COSMETICS[0];
  for (const c of COSMETICS) { if (level >= c.level) cos = c; }
  return cos;
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).substr(2, 9);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Google Fonts import via style tag
const injectFonts = () => {
  if (document.getElementById('gizli-fonts')) return;
  const s = document.createElement('link');
  s.id = 'gizli-fonts';
  s.rel = 'stylesheet';
  s.href = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Rajdhani:wght@400;500;600;700&display=swap';
  document.head.appendChild(s);
  const style = document.createElement('style');
  style.textContent = `
    * { font-family: 'Rajdhani', sans-serif; }
    .font-orbitron { font-family: 'Orbitron', monospace !important; }
    @keyframes pulse-glow {
      0%,100%{box-shadow:0 0 20px var(--glow), 0 0 40px var(--glow);}
      50%{box-shadow:0 0 40px var(--glow), 0 0 80px var(--glow), 0 0 120px var(--glow);}
    }
    @keyframes float { 0%,100%{transform:translateY(0px);} 50%{transform:translateY(-10px);} }
    @keyframes scan { 0%{transform:translateY(-100%);} 100%{transform:translateY(100vh);} }
    @keyframes xp-fill { from{width:0%} to{width:var(--xp-pct)} }
    @keyframes number-pop {
      0%{transform:scale(0.5);opacity:0}
      70%{transform:scale(1.2);}
      100%{transform:scale(1);opacity:1}
    }
    @keyframes count-bounce { 0%,100%{transform:scale(1)} 50%{transform:scale(1.15)} }
    @keyframes ticker {
      0%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(-40px)}
    }
    .animate-float { animation: float 3s ease-in-out infinite; }
    .animate-glow { animation: pulse-glow 2s ease-in-out infinite; }
    .animate-pop { animation: number-pop 0.3s cubic-bezier(.175,.885,.32,1.275); }
    .animate-ticker { animation: ticker 1.2s ease-out forwards; }
    .grid-bg {
      background-image:
        linear-gradient(rgba(0,245,255,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0,245,255,0.03) 1px, transparent 1px);
      background-size: 40px 40px;
    }
    .glass { background: rgba(255,255,255,0.04); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.08); }
    .glass-dark { background: rgba(0,0,0,0.4); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.06); }
    input[type=number]::-webkit-inner-spin-button,
    input[type=number]::-webkit-outer-spin-button { opacity:1; }
    ::-webkit-scrollbar { width:4px; } ::-webkit-scrollbar-track { background:#0f172a; } ::-webkit-scrollbar-thumb { background:#334155; border-radius:2px; }
  `;
  document.head.appendChild(style);
};

// ─── ANA COMPONENT ────────────────────────────────────────────────────────────
export default function GizliSayiOyunu() {
  injectFonts();

  // AUTH
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userProfile, setUserProfile] = useState(null);

  // SCREEN
  const [screen, setScreen] = useState('landing');

  // AUTH FORM
  const [authTab, setAuthTab] = useState('login');
  const [authNick, setAuthNick] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading2, setAuthLoading2] = useState(false);

  // ROOM CREATE
  const [roomName, setRoomName] = useState('');
  const [roomPassword, setRoomPassword] = useState('');
  const [maxNumber, setMaxNumber] = useState(50);
  const [maxPlayers, setMaxPlayers] = useState(4);

  // ROOM JOIN
  const [joinRoomName, setJoinRoomName] = useState('');
  const [joinPassword, setJoinPassword] = useState('');

  // GAME STATE
  const [currentRoom, setCurrentRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [gameState, setGameState] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [secretNumber, setSecretNumber] = useState(null);
  const [myRoomId, setMyRoomId] = useState('');
  const [timeLeft, setTimeLeft] = useState(TURN_TIME);
  const [celebration, setCelebration] = useState(null);
  const [xpGained, setXpGained] = useState(null);

  // QUICK PLAY
  const [inQueue, setInQueue] = useState(false);
  const [queueCount, setQueueCount] = useState(0);

  // TICKER (floating score popups)
  const [tickers, setTickers] = useState([]);

  const timerRef = useRef(null);
  const timerLockRef = useRef(false);
  const unsub = useRef(() => {});
  const queueUnsub = useRef(() => {});

  // ── CRITICAL: Refs to avoid stale closures in async callbacks ─────────────
  const screenRef = useRef(screen);
  const gameStateRef = useRef(gameState);
  const playersRef = useRef(players);
  const isHostRef = useRef(isHost);
  const myRoomIdRef = useRef(myRoomId);
  const authUserRef = useRef(authUser);

  // Keep refs in sync with state on every render
  screenRef.current = screen;
  gameStateRef.current = gameState;
  playersRef.current = players;
  isHostRef.current = isHost;
  myRoomIdRef.current = myRoomId;
  authUserRef.current = authUser;

  // ── AUTH LISTENER ─────────────────────────────────────────────────────────
  useEffect(() => {
    const off = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (user) {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          setUserProfile(snap.data());
          setScreen('home');
        } else {
          setScreen('auth');
        }
      } else {
        setUserProfile(null);
        setScreen('landing');
      }
      setAuthLoading(false);
    });
    return off;
  }, []);

  // ── ROOM LISTENER ─────────────────────────────────────────────────────────
  // FIX: screen is NOT a dependency — we use screenRef.current inside the callback.
  // This prevents the listener from being torn down/rebuilt on every screen change,
  // which was causing race conditions and missed snapshots → white screen.
  useEffect(() => {
    unsub.current();
    unsub.current = () => {};
    if (!myRoomId) return;

    unsub.current = onSnapshot(doc(db, 'rooms', myRoomId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();

      // Normalize all arrays to prevent undefined crashes during render
      const safeGameState = data.gameState ? {
        phase: data.gameState.phase || 'lobby',
        turnOrder: data.gameState.turnOrder || [],
        turnIndex: data.gameState.turnIndex ?? 0,
        turnStartTime: data.gameState.turnStartTime || 0,
        clickedNumbers: data.gameState.clickedNumbers || [],
        foundPlayers: data.gameState.foundPlayers || [],
      } : null;

      const safePlayers = (data.players || []).map(p => ({
        id: p.id || '',
        name: p.name || '?',
        score: p.score ?? 0,
        isHost: p.isHost || false,
        hasSelectedNumber: p.hasSelectedNumber || false,
      }));

      // Batch all state updates together to prevent split renders
      setCurrentRoom(data);
      setPlayers(safePlayers);
      setGameState(safeGameState);
      if (data.host === authUserRef.current?.uid) setIsHost(true);

      // Use screenRef.current — always fresh, never stale
      const curScreen = screenRef.current;
      const phase = safeGameState?.phase;

      if (phase === 'selectingNumbers' && (curScreen === 'lobby' || curScreen === 'results')) {
        setSecretNumber(null);
        setScreen('selectNumber');
      }
      if (phase === 'playing' && curScreen === 'selectNumber') {
        setScreen('game');
      }
      if (phase === 'finished' && curScreen === 'game') {
        setTimeout(() => setScreen('results'), 3200);
      }
    });

    return () => unsub.current();
  }, [myRoomId]); // Only re-subscribe if the room changes, NOT on screen change

  // ── TIMER (FIXED) ─────────────────────────────────────────────────────────
  useEffect(() => {
    clearInterval(timerRef.current);
    timerLockRef.current = false;
    if (gameState?.phase !== 'playing' || screen !== 'game') return;

    const capturedStartTime = gameState.turnStartTime; // capture at effect run time

    const tick = () => {
      if (!capturedStartTime || capturedStartTime <= 0) { setTimeLeft(TURN_TIME); return; }
      const elapsed = Date.now() - capturedStartTime;
      const remaining = Math.max(0, Math.min(TURN_TIME, Math.ceil((TURN_TIME * 1000 - elapsed) / 1000)));
      setTimeLeft(remaining);
      if (remaining === 0 && isHostRef.current && !timerLockRef.current) {
        timerLockRef.current = true;
        applyTimeoutPenalty(); // uses refs internally — always fresh
      }
    };
    tick();
    timerRef.current = setInterval(tick, 500);
    return () => clearInterval(timerRef.current);
  }, [gameState?.turnStartTime, gameState?.phase, screen]);

  // ─── AUTH FUNCTIONS ────────────────────────────────────────────────────────
  const handleRegister = async () => {
    setAuthError('');
    if (!authNick.trim()) return setAuthError('Kullanıcı adı gerekli.');
    if (authNick.length < 3) return setAuthError('Kullanıcı adı en az 3 karakter olmalı.');
    if (!authEmail.endsWith('@gmail.com')) return setAuthError('Sadece Gmail adresleri kabul edilir. (@gmail.com)');
    if (authPass.length < 6) return setAuthError('Şifre en az 6 karakter olmalı.');
    setAuthLoading2(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, authEmail, authPass);
      await updateProfile(cred.user, { displayName: authNick });
      const profile = { uid: cred.user.uid, nickname: authNick, email: authEmail, xp: 0, gamesPlayed: 0, createdAt: Date.now() };
      await setDoc(doc(db, 'users', cred.user.uid), profile);
      setUserProfile(profile);
      setScreen('home');
    } catch (e) {
      const msgs = { 'auth/email-already-in-use': 'Bu email zaten kullanımda.', 'auth/invalid-email': 'Geçersiz email.' };
      setAuthError(msgs[e.code] || e.message);
    }
    setAuthLoading2(false);
  };

  const handleLogin = async () => {
    setAuthError('');
    if (!authEmail.endsWith('@gmail.com')) return setAuthError('Sadece Gmail adresleri kabul edilir.');
    setAuthLoading2(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, authEmail, authPass);
      const snap = await getDoc(doc(db, 'users', cred.user.uid));
      if (snap.exists()) { setUserProfile(snap.data()); setScreen('home'); }
    } catch (e) {
      const msgs = { 'auth/wrong-password': 'Şifre yanlış.', 'auth/user-not-found': 'Kullanıcı bulunamadı.', 'auth/invalid-credential': 'Email veya şifre hatalı.' };
      setAuthError(msgs[e.code] || e.message);
    }
    setAuthLoading2(false);
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setScreen('landing');
    setMyRoomId('');
    setCurrentRoom(null);
    setPlayers([]);
    setGameState(null);
    setIsHost(false);
    setInQueue(false);
  };

  // ─── ROOM FUNCTIONS ───────────────────────────────────────────────────────
  const createRoom = async (customRoomName, customPassword, customMaxNumber, customMaxPlayers, isQuickPlay = false) => {
    const rName = customRoomName || roomName;
    const rPass = customPassword || roomPassword;
    const rMax = customMaxNumber || maxNumber;
    const rPlayers = customMaxPlayers || maxPlayers;
    if (!rName?.trim()) return alert('Oda adı gerekli!');
    const existing = await getDoc(doc(db, 'rooms', rName));
    if (existing.exists()) return alert('Bu oda adı alınmış! Farklı bir isim dene.');
    await setDoc(doc(db, 'rooms', rName), {
      name: rName, password: rPass, maxPlayers: Number(rPlayers), maxNumber: Number(rMax),
      host: authUser.uid, isQuickPlay,
      players: [{ id: authUser.uid, name: userProfile.nickname, score: 0, isHost: true }],
      gameState: { phase: 'lobby' }, createdAt: Date.now()
    });
    setMyRoomId(rName);
    setIsHost(true);
    setScreen('lobby');
  };

  const joinRoom = async (customRoomName, customPassword) => {
    const rName = customRoomName || joinRoomName;
    const rPass = customPassword !== undefined ? customPassword : joinPassword;
    if (!rName?.trim()) return alert('Oda adı gir!');
    const snap = await getDoc(doc(db, 'rooms', rName));
    if (!snap.exists()) return alert('Oda bulunamadı!');
    const room = snap.data();
    if (room.password !== rPass) return alert('Şifre yanlış!');
    if (room.players.length >= room.maxPlayers) return alert('Oda dolu!');
    if (room.players.find(p => p.id === authUser.uid)) {
      setMyRoomId(rName); setScreen('lobby'); return;
    }
    await updateDoc(doc(db, 'rooms', rName), {
      players: [...room.players, { id: authUser.uid, name: userProfile.nickname, score: 0, isHost: false }]
    });
    setMyRoomId(rName);
    setScreen('lobby');
  };

  const startGame = async () => {
    if (!isHost) return;
    const shuffled = players.map(p => p.id).sort(() => Math.random() - 0.5);
    await updateDoc(doc(db, 'rooms', myRoomId), {
      'gameState.phase': 'selectingNumbers',
      'gameState.turnOrder': shuffled,
      'gameState.clickedNumbers': [], 'gameState.foundPlayers': [],
      'gameState.turnIndex': 0, 'gameState.turnStartTime': Date.now()
    });
  };

  const submitSecretNumber = async () => {
    if (!secretNumber || secretNumber < 1 || secretNumber > currentRoom.maxNumber)
      return alert(`1 ile ${currentRoom.maxNumber} arasında bir sayı seç!`);
    await setDoc(doc(db, `rooms/${myRoomId}/secrets`, authUser.uid), { number: secretNumber });
    const updated = players.map(p => p.id === authUser.uid ? { ...p, hasSelectedNumber: true } : p);
    const allReady = updated.every(p => p.hasSelectedNumber);
    await updateDoc(doc(db, 'rooms', myRoomId), {
      players: updated,
      'gameState.phase': allReady ? 'playing' : 'selectingNumbers',
      'gameState.turnStartTime': allReady ? Date.now() : 0
    });
  };

  const clickNumber = async (num) => {
    // Snapshot all refs at call time — immune to stale closures during awaits
    const gs = gameStateRef.current;
    const pl = playersRef.current;
    const rid = myRoomIdRef.current;
    const uid_me = authUserRef.current?.uid;
    if (!gs || !pl.length || !rid || !uid_me) return;
    if (!gs.turnOrder || gs.turnOrder[gs.turnIndex] !== uid_me) return;

    const allSecretsSnap = await getDocs(collection(db, `rooms/${rid}/secrets`));
    const secretsMap = {};
    allSecretsSnap.forEach(s => (secretsMap[s.id] = s.data().number));

    let foundAny = false, foundNames = [];
    let newFoundPlayers = [...(gs.foundPlayers || [])];
    let newPlayers = [...pl];

    for (const player of pl) {
      if (newFoundPlayers.includes(player.id)) continue;
      if (secretsMap[player.id] === num) {
        foundAny = true;
        foundNames.push(player.name);
        newFoundPlayers.push(player.id);
        const earned = Math.round(BASE_POINTS * Math.pow(SCORE_RATIO, gs.foundPlayers.length));
        newPlayers = newPlayers.map(p => p.id === player.id ? { ...p, score: p.score + earned } : p);
        newPlayers = newPlayers.map(p => p.id === uid_me ? { ...p, score: p.score + FINDER_PENALTY } : p);
        addTicker(player.name, `+${earned}`, '#22d3ee');
        addTicker(userProfile.nickname, `${FINDER_PENALTY}`, '#f87171');
      }
    }

    if (foundAny) {
      setCelebration({ finder: userProfile.nickname, found: foundNames.join(', '), number: num });
      setTimeout(() => setCelebration(null), 3000);
    }

    const clickedSoFar = [...(gs.clickedNumbers || []), num];
    const unclicked = Array.from({ length: currentRoom.maxNumber }, (_, i) => i + 1)
      .filter(n => !clickedSoFar.includes(n));

    let nextIdx = (gs.turnIndex + 1) % gs.turnOrder.length;
    let safety = 0;
    while (newFoundPlayers.includes(gs.turnOrder[nextIdx]) && safety++ < pl.length) {
      nextIdx = (nextIdx + 1) % gs.turnOrder.length;
    }
    const nextPlayerId = gs.turnOrder[nextIdx];

    let isDeadlock = false;
    if (unclicked.length === 1 && unclicked[0] === secretsMap[nextPlayerId]) {
      isDeadlock = true;
      const bonus = Math.round(BASE_POINTS * Math.pow(SCORE_RATIO, newFoundPlayers.length));
      newPlayers = newPlayers.map(p => p.id === nextPlayerId ? { ...p, score: p.score + bonus } : p);
    }

    const isEnd = newFoundPlayers.length >= pl.length - 1 || isDeadlock;
    await updateDoc(doc(db, 'rooms', rid), {
      'gameState.clickedNumbers': clickedSoFar,
      'gameState.foundPlayers': newFoundPlayers,
      'gameState.turnIndex': nextIdx,
      'gameState.turnStartTime': Date.now(),
      'gameState.phase': isEnd ? 'finished' : 'playing',
      players: newPlayers
    });
  };

  const applyTimeoutPenalty = async () => {
    // Use refs — guaranteed fresh values, no stale closure
    const gs = gameStateRef.current;
    const pl = playersRef.current;
    const rid = myRoomIdRef.current;
    if (!gs || !pl.length || !rid) return;
    const curId = gs.turnOrder[gs.turnIndex];
    const newP = pl.map(p => p.id === curId ? { ...p, score: p.score - 20 } : p);
    let nextIdx = (gs.turnIndex + 1) % gs.turnOrder.length;
    let s = 0;
    while (gs.foundPlayers.includes(gs.turnOrder[nextIdx]) && s++ < pl.length)
      nextIdx = (nextIdx + 1) % gs.turnOrder.length;
    await updateDoc(doc(db, 'rooms', rid), {
      players: newP, 'gameState.turnIndex': nextIdx, 'gameState.turnStartTime': Date.now()
    });
    timerLockRef.current = false;
  };

  const restartMatch = async () => {
    if (!isHost) return;
    // Award XP to players based on ranking
    await awardMatchXP();
    const reset = players.map(p => ({ ...p, hasSelectedNumber: false, score: 0 }));
    await updateDoc(doc(db, 'rooms', myRoomId), {
      players: reset,
      'gameState.phase': 'selectingNumbers',
      'gameState.clickedNumbers': [], 'gameState.foundPlayers': [],
      'gameState.turnIndex': 0, 'gameState.turnStartTime': Date.now()
    });
  };

  const awardMatchXP = async () => {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i];
      const xp = XP_REWARDS[i] ?? 30;
      const profSnap = await getDoc(doc(db, 'users', p.id));
      if (profSnap.exists()) {
        const cur = profSnap.data();
        await updateDoc(doc(db, 'users', p.id), {
          xp: (cur.xp || 0) + xp, gamesPlayed: (cur.gamesPlayed || 0) + 1
        });
        if (p.id === authUser?.uid) {
          const newProfile = { ...cur, xp: (cur.xp || 0) + xp, gamesPlayed: (cur.gamesPlayed || 0) + 1 };
          setUserProfile(newProfile);
          setXpGained(xp);
        }
      }
    }
  };

  const leaveRoom = async () => {
    if (myRoomId) {
      const snap = await getDoc(doc(db, 'rooms', myRoomId));
      if (snap.exists()) {
        const room = snap.data();
        const remaining = room.players.filter(p => p.id !== authUser.uid);
        if (remaining.length === 0) {
          await deleteDoc(doc(db, 'rooms', myRoomId));
        } else {
          const newHost = remaining[0].id;
          await updateDoc(doc(db, 'rooms', myRoomId), {
            players: remaining.map((p, i) => i === 0 ? { ...p, isHost: true } : p),
            host: newHost
          });
        }
      }
    }
    setMyRoomId(''); setCurrentRoom(null); setPlayers([]); setGameState(null); setIsHost(false);
    setScreen('home');
  };

  // ─── QUICK PLAY ───────────────────────────────────────────────────────────
  const joinQueue = async () => {
    const qRef = doc(db, 'quickplay', 'queue');
    const snap = await getDoc(qRef);
    const entry = { id: authUser.uid, name: userProfile.nickname, joinedAt: Date.now() };
    if (!snap.exists()) {
      await setDoc(qRef, { players: [entry] });
    } else {
      const existing = snap.data().players || [];
      if (existing.find(p => p.id === authUser.uid)) {} // already in
      else await updateDoc(qRef, { players: [...existing, entry] });
    }
    setInQueue(true);
    setScreen('queue');
  };

  const leaveQueue = async () => {
    const qRef = doc(db, 'quickplay', 'queue');
    const snap = await getDoc(qRef);
    if (snap.exists()) {
      const remaining = (snap.data().players || []).filter(p => p.id !== authUser.uid);
      await updateDoc(qRef, { players: remaining });
    }
    setInQueue(false);
    setScreen('home');
  };

  useEffect(() => {
    if (screen !== 'queue') { queueUnsub.current(); queueUnsub.current = () => {}; return; }
    queueUnsub.current = onSnapshot(doc(db, 'quickplay', 'queue'), async (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const qPlayers = data.players || [];
      setQueueCount(qPlayers.length);

      if (qPlayers.length >= QUICK_PLAY_PLAYERS) {
        const chosen = qPlayers.slice(0, QUICK_PLAY_PLAYERS);
        // First player in queue creates the room
        if (chosen[0].id === authUser?.uid) {
          const rId = `quickplay_${Date.now()}_${uid()}`;
          const rPass = uid();
          await setDoc(doc(db, 'rooms', rId), {
            name: rId, password: rPass, maxPlayers: QUICK_PLAY_PLAYERS,
            maxNumber: QUICK_PLAY_MAX_NUMBER, host: authUser.uid, isQuickPlay: true,
            players: chosen.map((p, i) => ({ ...p, score: 0, isHost: i === 0 })),
            gameState: { phase: 'lobby' }, createdAt: Date.now(),
            quickPlayData: { roomId: rId, password: rPass }
          });
          // Write room info for all players to find
          await updateDoc(doc(db, 'quickplay', 'queue'), {
            players: qPlayers.slice(QUICK_PLAY_PLAYERS),
            lastMatch: { roomId: rId, password: rPass, players: chosen.map(p => p.id), createdAt: Date.now() }
          });
        } else if (chosen.find(p => p.id === authUser?.uid)) {
          // Wait for room to be created (watch for lastMatch)
        }
      }

      // Check if we were moved to a room via lastMatch
      if (data.lastMatch) {
        const { roomId, password, players: matchPlayers } = data.lastMatch;
        if (matchPlayers?.includes(authUser?.uid)) {
          queueUnsub.current();
          setInQueue(false);
          setMyRoomId(roomId);
          setIsHost(chosen?.[0]?.id === authUser?.uid);
          setScreen('lobby');
        }
      }
    });
    return () => queueUnsub.current();
  }, [screen, authUser?.uid]);

  // ─── TICKER ───────────────────────────────────────────────────────────────
  const addTicker = (name, text, color) => {
    const id = uid();
    setTickers(t => [...t, { id, name, text, color }]);
    setTimeout(() => setTickers(t => t.filter(x => x.id !== id)), 1400);
  };

  // ─── COMPUTED ─────────────────────────────────────────────────────────────
  const levelInfo = userProfile ? getLevelInfo(userProfile.xp || 0) : null;
  const cosmetic = levelInfo ? getCosmetic(levelInfo.level) : COSMETICS[0];

  // ─── RENDER ───────────────────────────────────────────────────────────────
  if (authLoading) return (
    <div style={{ background: '#020617', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, border: '3px solid #00f5ff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // LANDING
  // ══════════════════════════════════════════════════════════════════════════
  if (screen === 'landing') return (
    <div className="min-h-screen grid-bg" style={{ background: 'linear-gradient(135deg, #020617 0%, #0a0f2e 50%, #020617 100%)', minHeight: '100vh', overflow: 'hidden', position: 'relative' }}>
      {/* Ambient orbs */}
      <div style={{ position: 'absolute', top: '10%', left: '5%', width: 300, height: 300, background: 'radial-gradient(circle, rgba(0,245,255,0.08) 0%, transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '15%', right: '5%', width: 400, height: 400, background: 'radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />

      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center', position: 'relative', zIndex: 1 }}>
        {/* Logo */}
        <div className="animate-float" style={{ marginBottom: '2.5rem' }}>
          <div style={{ width: 100, height: 100, borderRadius: '30px', background: 'linear-gradient(135deg, #00f5ff, #0891b2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', boxShadow: '0 0 60px rgba(0,245,255,0.4)' }}>
            <span style={{ fontSize: '3rem' }}>🎯</span>
          </div>
        </div>

        <h1 className="font-orbitron" style={{ fontSize: 'clamp(2.5rem, 8vw, 5rem)', fontWeight: 900, color: '#fff', lineHeight: 1.1, marginBottom: '1rem', letterSpacing: '-2px' }}>
          GİZLİ SAYI
        </h1>
        <div style={{ height: 3, width: 120, background: 'linear-gradient(90deg, transparent, #00f5ff, transparent)', margin: '0 auto 1.5rem' }} />
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '1.2rem', maxWidth: 500, lineHeight: 1.6, marginBottom: '3rem', fontWeight: 500 }}>
          Sayını sakla. Diğerlerini bul. En son kalanlar kazanır.
        </p>

        {/* Feature pills */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '3rem' }}>
          {['⚡ Hızlı Oyun', '👥 2-10 Oyuncu', '🏆 Level Sistemi', '🎨 Kozmetikler'].map(f => (
            <div key={f} className="glass" style={{ padding: '0.5rem 1.25rem', borderRadius: '100px', color: 'rgba(255,255,255,0.75)', fontSize: '0.9rem', fontWeight: 600 }}>{f}</div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={() => setScreen('auth')} style={{ padding: '1rem 3rem', background: 'linear-gradient(135deg, #00f5ff, #0891b2)', color: '#020617', fontWeight: 700, fontSize: '1.1rem', border: 'none', borderRadius: '16px', cursor: 'pointer', letterSpacing: '1px', boxShadow: '0 0 30px rgba(0,245,255,0.4)', transition: 'all 0.2s' }}
            onMouseEnter={e => e.target.style.transform = 'scale(1.05)'}
            onMouseLeave={e => e.target.style.transform = 'scale(1)'}
          >OYNA</button>
        </div>

        <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.75rem', marginTop: '3rem', letterSpacing: '2px' }}>© GİZLİ SAYI OYUNU</p>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // AUTH
  // ══════════════════════════════════════════════════════════════════════════
  if (screen === 'auth') return (
    <div className="min-h-screen grid-bg" style={{ background: 'linear-gradient(135deg, #020617 0%, #0a0f2e 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ position: 'absolute', top: '20%', right: '10%', width: 250, height: 250, background: 'radial-gradient(circle, rgba(0,245,255,0.06) 0%, transparent 70%)', borderRadius: '50%' }} />

      <div className="glass-dark" style={{ width: '100%', maxWidth: 440, borderRadius: '28px', padding: '2.5rem', position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <span style={{ fontSize: '2.5rem' }}>🎯</span>
          <h2 className="font-orbitron" style={{ color: '#fff', fontSize: '1.5rem', marginTop: '0.75rem', letterSpacing: '1px' }}>GİZLİ SAYI</h2>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '14px', padding: '4px', marginBottom: '1.75rem' }}>
          {['login', 'register'].map(t => (
            <button key={t} onClick={() => { setAuthTab(t); setAuthError(''); }} style={{ flex: 1, padding: '0.65rem', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem', letterSpacing: '0.5px', transition: 'all 0.2s', background: authTab === t ? 'linear-gradient(135deg, #00f5ff, #0891b2)' : 'transparent', color: authTab === t ? '#020617' : 'rgba(255,255,255,0.5)' }}>
              {t === 'login' ? 'GİRİŞ YAP' : 'KAYIT OL'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {authTab === 'register' && (
            <input placeholder="Kullanıcı Adı (min 3 karakter)" value={authNick} onChange={e => setAuthNick(e.target.value)} style={{ padding: '0.9rem 1.25rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', color: '#fff', fontSize: '1rem', outline: 'none', fontWeight: 500 }} />
          )}
          <input placeholder="Gmail adresi (@gmail.com)" value={authEmail} onChange={e => setAuthEmail(e.target.value)} type="email" style={{ padding: '0.9rem 1.25rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', color: '#fff', fontSize: '1rem', outline: 'none', fontWeight: 500 }} />
          <input placeholder="Şifre (min 6 karakter)" value={authPass} onChange={e => setAuthPass(e.target.value)} type="password" style={{ padding: '0.9rem 1.25rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', color: '#fff', fontSize: '1rem', outline: 'none', fontWeight: 500 }}
            onKeyDown={e => e.key === 'Enter' && (authTab === 'login' ? handleLogin() : handleRegister())}
          />

          {authError && <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '0.75rem 1rem', color: '#fca5a5', fontSize: '0.9rem', fontWeight: 500 }}>⚠️ {authError}</div>}

          <button onClick={authTab === 'login' ? handleLogin : handleRegister} disabled={authLoading2} style={{ marginTop: '0.5rem', padding: '1rem', background: authLoading2 ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #00f5ff, #0891b2)', border: 'none', borderRadius: '14px', color: authLoading2 ? 'rgba(255,255,255,0.4)' : '#020617', fontWeight: 700, fontSize: '1rem', letterSpacing: '1px', cursor: authLoading2 ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}>
            {authLoading2 ? '⏳ Bekleniyor...' : authTab === 'login' ? 'GİRİŞ YAP' : 'KAYIT OL'}
          </button>

          <button onClick={() => setScreen('landing')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: '0.85rem', cursor: 'pointer', padding: '0.5rem', fontWeight: 500 }}>← Geri Dön</button>
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // HOME
  // ══════════════════════════════════════════════════════════════════════════
  if (screen === 'home') return (
    <div className="min-h-screen grid-bg" style={{ background: 'linear-gradient(135deg, #020617 0%, #0a0f2e 100%)', minHeight: '100vh', padding: '1.5rem' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* Topbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <span className="font-orbitron" style={{ color: '#00f5ff', fontSize: '1.1rem', letterSpacing: '2px' }}>GİZLİ SAYI</span>
          <button onClick={handleSignOut} style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', padding: '0.5rem 1rem', borderRadius: '10px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>Çıkış</button>
        </div>

        {/* Profile Card */}
        {userProfile && levelInfo && (
          <div className="glass-dark" style={{ borderRadius: '24px', padding: '1.75rem', marginBottom: '2rem', borderLeft: `3px solid ${cosmetic.glow}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
              <div style={{ width: 64, height: 64, borderRadius: '18px', background: `linear-gradient(135deg, ${cosmetic.glow}33, ${cosmetic.glow}11)`, border: `2px solid ${cosmetic.glow}66`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', flexShrink: 0 }}>
                {cosmetic.badge}
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <span style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 700 }}>{userProfile.nickname}</span>
                  <span style={{ color: cosmetic.glow, fontSize: '0.8rem', fontWeight: 700, background: `${cosmetic.glow}22`, padding: '0.2rem 0.75rem', borderRadius: '100px', border: `1px solid ${cosmetic.glow}44` }}>{cosmetic.title}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <span className="font-orbitron" style={{ color: cosmetic.glow, fontSize: '0.9rem', fontWeight: 700, minWidth: 60 }}>LV {levelInfo.level}</span>
                  <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.07)', borderRadius: '100px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(levelInfo.currentXP / levelInfo.requiredXP * 100).toFixed(1)}%`, background: `linear-gradient(90deg, ${cosmetic.glow}, #fff)`, borderRadius: '100px', transition: 'width 0.8s ease' }} />
                  </div>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', fontWeight: 600, minWidth: 80, textAlign: 'right' }}>{levelInfo.currentXP} / {levelInfo.requiredXP} XP</span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', letterSpacing: '1px' }}>TOPLAM MAÇLAR</div>
                <div className="font-orbitron" style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700 }}>{userProfile.gamesPlayed || 0}</div>
              </div>
            </div>
          </div>
        )}

        {/* Level Cosmetics Preview */}
        <div className="glass-dark" style={{ borderRadius: '24px', padding: '1.25rem 1.75rem', marginBottom: '2rem' }}>
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', letterSpacing: '2px', marginBottom: '0.75rem' }}>KOZMETİK YOLCULUĞU</p>
          <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
            {COSMETICS.map(c => {
              const unlocked = levelInfo && levelInfo.level >= c.level;
              return (
                <div key={c.level} title={`Seviye ${c.level}: ${c.title}`} style={{ flex: '0 0 auto', width: 52, height: 52, borderRadius: '14px', background: unlocked ? `linear-gradient(135deg, ${c.glow}33, ${c.glow}11)` : 'rgba(255,255,255,0.03)', border: `2px solid ${unlocked ? c.glow + '66' : 'rgba(255,255,255,0.06)'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', filter: unlocked ? 'none' : 'grayscale(1) opacity(0.3)', cursor: 'default' }}>
                  <span style={{ fontSize: '1.4rem' }}>{c.badge}</span>
                  <span className="font-orbitron" style={{ fontSize: '0.45rem', color: c.glow, marginTop: '2px' }}>LV{c.level}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Main actions */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          {/* Quick Play */}
          <button onClick={joinQueue} style={{ padding: '2rem', borderRadius: '22px', background: 'linear-gradient(135deg, rgba(0,245,255,0.12), rgba(8,145,178,0.08))', border: '1px solid rgba(0,245,255,0.2)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = 'rgba(0,245,255,0.5)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = 'rgba(0,245,255,0.2)'; }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>⚡</div>
            <div style={{ color: '#00f5ff', fontWeight: 700, fontSize: '1.2rem', letterSpacing: '1px' }}>HIZLI OYUN</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', marginTop: '0.35rem' }}>Sıraya gir, 4 kişi dolunca otomatik başlar</div>
          </button>

          {/* Create Room */}
          <button onClick={() => setScreen('createRoom')} style={{ padding: '2rem', borderRadius: '22px', background: 'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(139,92,246,0.05))', border: '1px solid rgba(139,92,246,0.2)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.5)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.2)'; }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🏠</div>
            <div style={{ color: '#a78bfa', fontWeight: 700, fontSize: '1.2rem', letterSpacing: '1px' }}>ODA OLUŞTUR</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', marginTop: '0.35rem' }}>Arkadaşlarınla özel oda kur</div>
          </button>

          {/* Join Room */}
          <button onClick={() => setScreen('joinRoom')} style={{ padding: '2rem', borderRadius: '22px', background: 'linear-gradient(135deg, rgba(234,179,8,0.1), rgba(234,179,8,0.04))', border: '1px solid rgba(234,179,8,0.2)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = 'rgba(234,179,8,0.5)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = 'rgba(234,179,8,0.2)'; }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🔑</div>
            <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: '1.2rem', letterSpacing: '1px' }}>ODAYA KATIL</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', marginTop: '0.35rem' }}>Oda adı ve şifreyle giriş yap</div>
          </button>
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // CREATE ROOM
  // ══════════════════════════════════════════════════════════════════════════
  if (screen === 'createRoom') return (
    <div className="min-h-screen grid-bg" style={{ background: 'linear-gradient(135deg, #020617 0%, #0a0f2e 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="glass-dark" style={{ width: '100%', maxWidth: 460, borderRadius: '28px', padding: '2.5rem' }}>
        <button onClick={() => setScreen('home')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: '0.9rem', marginBottom: '1.5rem', padding: 0, fontWeight: 600 }}>← Geri</button>
        <h2 className="font-orbitron" style={{ color: '#a78bfa', fontSize: '1.3rem', marginBottom: '1.75rem', letterSpacing: '1px' }}>ODA OLUŞTUR</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <input placeholder="Oda Adı" value={roomName} onChange={e => setRoomName(e.target.value)} style={inputStyle} />
          <input placeholder="Şifre" type="password" value={roomPassword} onChange={e => setRoomPassword(e.target.value)} style={inputStyle} />

          {/* Number range - keyboard input */}
          <div>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem', letterSpacing: '1px' }}>SAYI ARALIĞI (20-100)</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <input type="number" min={20} max={100} value={maxNumber}
                onChange={e => setMaxNumber(Math.max(20, Math.min(100, parseInt(e.target.value) || 20)))}
                style={{ ...inputStyle, width: 100, textAlign: 'center', fontSize: '1.4rem', fontWeight: 700, color: '#a78bfa', padding: '0.75rem' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {[20, 35, 50, 75, 100].map(n => (
                    <button key={n} onClick={() => setMaxNumber(n)} style={{ padding: '0.4rem 0.75rem', borderRadius: '8px', border: `1px solid ${maxNumber === n ? '#a78bfa' : 'rgba(255,255,255,0.1)'}`, background: maxNumber === n ? 'rgba(139,92,246,0.2)' : 'transparent', color: maxNumber === n ? '#a78bfa' : 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                      {n}
                    </button>
                  ))}
                </div>
                <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.75rem', marginTop: '0.35rem' }}>Sayıyı klavye ile de girebilirsin</p>
              </div>
            </div>
          </div>

          {/* Max players */}
          <div>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem', letterSpacing: '1px' }}>MAX OYUNCU</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {[2, 3, 4, 5, 6, 8, 10].map(n => (
                <button key={n} onClick={() => setMaxPlayers(n)} style={{ padding: '0.55rem 1rem', borderRadius: '10px', border: `1px solid ${maxPlayers === n ? '#a78bfa' : 'rgba(255,255,255,0.1)'}`, background: maxPlayers === n ? 'rgba(139,92,246,0.2)' : 'transparent', color: maxPlayers === n ? '#a78bfa' : 'rgba(255,255,255,0.4)', cursor: 'pointer', fontWeight: 700 }}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          <button onClick={() => createRoom()} style={{ marginTop: '0.5rem', ...btnPrimaryStyle }}>ODA OLUŞTUR</button>
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // JOIN ROOM
  // ══════════════════════════════════════════════════════════════════════════
  if (screen === 'joinRoom') return (
    <div className="min-h-screen grid-bg" style={{ background: 'linear-gradient(135deg, #020617 0%, #0a0f2e 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="glass-dark" style={{ width: '100%', maxWidth: 420, borderRadius: '28px', padding: '2.5rem' }}>
        <button onClick={() => setScreen('home')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: '0.9rem', marginBottom: '1.5rem', padding: 0, fontWeight: 600 }}>← Geri</button>
        <h2 className="font-orbitron" style={{ color: '#fbbf24', fontSize: '1.3rem', marginBottom: '1.75rem', letterSpacing: '1px' }}>ODAYA KATIL</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <input placeholder="Oda Adı" value={joinRoomName} onChange={e => setJoinRoomName(e.target.value)} style={inputStyle} />
          <input placeholder="Şifre" type="password" value={joinPassword} onChange={e => setJoinPassword(e.target.value)} style={inputStyle}
            onKeyDown={e => e.key === 'Enter' && joinRoom()} />
          <button onClick={() => joinRoom()} style={{ marginTop: '0.5rem', ...btnPrimaryStyle, background: 'linear-gradient(135deg, #fbbf24, #d97706)' }}>BAĞLAN</button>
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // QUEUE
  // ══════════════════════════════════════════════════════════════════════════
  if (screen === 'queue') return (
    <div className="min-h-screen grid-bg" style={{ background: 'linear-gradient(135deg, #020617 0%, #0a0f2e 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="glass-dark" style={{ width: '100%', maxWidth: 400, borderRadius: '28px', padding: '3rem 2rem', textAlign: 'center' }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', border: '3px solid rgba(0,245,255,0.3)', borderTopColor: '#00f5ff', margin: '0 auto 2rem', animation: 'spin 1s linear infinite' }}>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
        <h2 className="font-orbitron" style={{ color: '#00f5ff', fontSize: '1.2rem', letterSpacing: '2px', marginBottom: '1rem' }}>SIRADA BEKLİYORSUN</h2>
        <p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: '2rem', fontSize: '1rem' }}>
          {queueCount} / {QUICK_PLAY_PLAYERS} oyuncu bulundu
        </p>

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '2rem' }}>
          {Array.from({ length: QUICK_PLAY_PLAYERS }).map((_, i) => (
            <div key={i} style={{ width: 40, height: 40, borderRadius: '50%', background: i < queueCount ? 'linear-gradient(135deg, #00f5ff, #0891b2)' : 'rgba(255,255,255,0.07)', border: `2px solid ${i < queueCount ? '#00f5ff' : 'rgba(255,255,255,0.1)'}`, transition: 'all 0.3s', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>
              {i < queueCount ? '👤' : ''}
            </div>
          ))}
        </div>

        <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
          Dolunca otomatik başlayacak — 1-{QUICK_PLAY_MAX_NUMBER} sayı aralığı
        </p>

        <button onClick={leaveQueue} style={{ padding: '0.75rem 2rem', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '14px', color: '#fca5a5', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}>Sıradan Çık</button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // LOBBY
  // ══════════════════════════════════════════════════════════════════════════
  if (screen === 'lobby') return (
    <div className="min-h-screen grid-bg" style={{ background: 'linear-gradient(135deg, #020617 0%, #0a0f2e 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="glass-dark" style={{ width: '100%', maxWidth: 520, borderRadius: '28px', padding: '2.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>👑</div>
          <h2 className="font-orbitron" style={{ color: '#fff', fontSize: '1.4rem', letterSpacing: '1px' }}>{currentRoom?.name || 'Yükleniyor...'}</h2>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '0.75rem' }}>
            <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.8rem', fontWeight: 600, letterSpacing: '1px' }}>👥 MAX {currentRoom?.maxPlayers} KİŞİ</span>
            <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.8rem', fontWeight: 600, letterSpacing: '1px' }}>🎯 1-{currentRoom?.maxNumber}</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '2rem' }}>
          {players.map((p, i) => {
            const cos = COSMETICS[0]; // Would need profile lookup for full cosmetics
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderRadius: '14px', background: p.id === authUser?.uid ? 'rgba(0,245,255,0.08)' : 'rgba(255,255,255,0.04)', border: `1px solid ${p.id === authUser?.uid ? 'rgba(0,245,255,0.25)' : 'rgba(255,255,255,0.06)'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.3rem' }}>👤</span>
                  <span style={{ color: '#fff', fontWeight: 600 }}>{p.name}</span>
                  {p.id === authUser?.uid && <span style={{ color: '#00f5ff', fontSize: '0.75rem', fontWeight: 700 }}>(SEN)</span>}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {p.isHost && <span style={{ color: '#fbbf24', background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)', padding: '0.2rem 0.65rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700 }}>HOST</span>}
                </div>
              </div>
            );
          })}
        </div>

        {isHost ? (
          <button onClick={startGame} disabled={players.length < 2} style={{ width: '100%', padding: '1.1rem', background: players.length < 2 ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #00f5ff, #0891b2)', border: 'none', borderRadius: '16px', color: players.length < 2 ? 'rgba(255,255,255,0.2)' : '#020617', fontWeight: 700, fontSize: '1.1rem', letterSpacing: '1px', cursor: players.length < 2 ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}>
            {players.length < 2 ? 'En az 2 kişi gerekli...' : 'OYUNU BAŞLAT'}
          </button>
        ) : (
          <div style={{ textAlign: 'center', padding: '1.25rem', background: 'rgba(0,245,255,0.05)', border: '1px solid rgba(0,245,255,0.15)', borderRadius: '16px', color: '#00f5ff', fontWeight: 600, animation: 'pulse-glow 2s infinite' }}>
            ⏳ Host başlatmasını bekliyor...
          </div>
        )}

        <button onClick={leaveRoom} style={{ marginTop: '1rem', width: '100%', background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, padding: '0.5rem' }}>Odadan Ayrıl</button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // SELECT NUMBER
  // ══════════════════════════════════════════════════════════════════════════
  if (screen === 'selectNumber') {
    const hasSelected = players.find(p => p.id === authUser?.uid)?.hasSelectedNumber;
    const readyCount = players.filter(p => p.hasSelectedNumber).length;
    return (
      <div className="min-h-screen grid-bg" style={{ background: 'linear-gradient(135deg, #020617 0%, #0a0f2e 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div className="glass-dark" style={{ width: '100%', maxWidth: 420, borderRadius: '28px', padding: '2.5rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔐</div>
          <h2 className="font-orbitron" style={{ color: '#fff', fontSize: '1.3rem', letterSpacing: '1px', marginBottom: '0.5rem' }}>SAYINI SAKLEGİZLE</h2>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.9rem', marginBottom: '2rem' }}>1 ile {currentRoom?.maxNumber} arasında bir sayı seç — kimse bilmeyecek!</p>

          {/* Ready status */}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '2rem' }}>
            {players.map(p => (
              <div key={p.id} title={p.name} style={{ width: 36, height: 36, borderRadius: '50%', background: p.hasSelectedNumber ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.05)', border: `2px solid ${p.hasSelectedNumber ? '#22c55e' : 'rgba(255,255,255,0.1)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', transition: 'all 0.3s' }}>
                {p.hasSelectedNumber ? '✅' : '⏳'}
              </div>
            ))}
          </div>
          <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.8rem', marginBottom: '1.5rem' }}>{readyCount}/{players.length} hazır</p>

          {hasSelected ? (
            <div style={{ padding: '2rem', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '20px', color: '#4ade80', fontSize: '1.2rem', fontWeight: 700 }}>
              🔒 Sayın kilitlendi! Diğerleri bekleniyor...
            </div>
          ) : (
            <>
              <input type="number" min={1} max={currentRoom?.maxNumber} value={secretNumber || ''}
                onChange={e => setSecretNumber(Math.max(1, Math.min(currentRoom?.maxNumber || 100, parseInt(e.target.value) || '')))}
                placeholder="?"
                style={{ width: '100%', fontSize: '4rem', textAlign: 'center', padding: '1rem', background: 'rgba(255,255,255,0.05)', border: '2px solid rgba(255,255,255,0.1)', borderRadius: '20px', color: '#00f5ff', fontWeight: 700, outline: 'none', marginBottom: '1rem', boxSizing: 'border-box' }}
                onKeyDown={e => e.key === 'Enter' && submitSecretNumber()}
              />
              <button onClick={submitSecretNumber} style={{ width: '100%', padding: '1rem', background: 'linear-gradient(135deg, #00f5ff, #0891b2)', border: 'none', borderRadius: '16px', color: '#020617', fontWeight: 700, fontSize: '1.05rem', letterSpacing: '1px', cursor: 'pointer' }}>SAYIYI SAKLEGİZLE</button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GAME
  // ══════════════════════════════════════════════════════════════════════════
  if (screen === 'game') {
    if (!gameState || !currentRoom) return (
      <div style={{ background: '#020617', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#00f5ff', fontWeight: 700, fontSize: '1.2rem' }}>Oyun yükleniyor...</div>
      </div>
    );

    const currentPlayerId = gameState.turnOrder?.[gameState.turnIndex];
    const isMyTurn = currentPlayerId === authUser?.uid;
    const isFound = gameState.foundPlayers?.includes(authUser?.uid);
    const currentPlayerName = players.find(p => p.id === currentPlayerId)?.name || '?';

    return (
      <div className="grid-bg" style={{ background: '#020617', minHeight: '100vh', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', boxSizing: 'border-box' }}>

        {/* Tickers */}
        {tickers.map(t => (
          <div key={t.id} className="animate-ticker" style={{ position: 'fixed', top: '30%', left: '50%', transform: 'translateX(-50%)', zIndex: 100, color: t.color, fontSize: '1.5rem', fontWeight: 700, pointerEvents: 'none', textShadow: `0 0 20px ${t.color}` }}>
            {t.name}: {t.text}
          </div>
        ))}

        {/* Celebration */}
        {celebration && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, backdropFilter: 'blur(8px)' }}>
            <div className="glass-dark" style={{ borderRadius: '28px', padding: '3rem 2.5rem', textAlign: 'center', border: '1px solid rgba(0,245,255,0.3)', maxWidth: 380 }}>
              <div style={{ fontSize: '4rem', marginBottom: '1rem', animation: 'float 1s ease-in-out infinite' }}>🎯</div>
              <h2 className="font-orbitron" style={{ color: '#00f5ff', fontSize: '1.3rem', letterSpacing: '1px', marginBottom: '0.75rem' }}>SAYI BULUNDU!</h2>
              <p style={{ color: 'rgba(255,255,255,0.6)' }}>Bulan: <strong style={{ color: '#fbbf24' }}>{celebration.finder}</strong> (−20 puan)</p>
              <p style={{ color: 'rgba(255,255,255,0.6)' }}>Elenen: <strong style={{ color: '#f87171' }}>{celebration.found}</strong></p>
              <div style={{ fontSize: '3rem', marginTop: '1rem', fontWeight: 900, color: '#fff' }}>{celebration.number}</div>
            </div>
          </div>
        )}

        {/* Top bar */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.8fr', gap: '0.75rem' }}>
          {/* My secret number */}
          <div className="glass-dark" style={{ padding: '1rem 1.25rem', borderRadius: '18px', border: '1px solid rgba(0,245,255,0.15)' }}>
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem', letterSpacing: '2px', marginBottom: '0.25rem' }}>GİZLİ SAYIM</div>
            <div className="font-orbitron" style={{ color: '#00f5ff', fontSize: '2rem', fontWeight: 700, textShadow: '0 0 20px rgba(0,245,255,0.5)' }}>{secretNumber ?? '?'}</div>
          </div>

          {/* Current turn + timer */}
          <div className="glass-dark" style={{ padding: '1rem 1.25rem', borderRadius: '18px', border: `1px solid ${isMyTurn ? 'rgba(0,245,255,0.4)' : 'rgba(255,255,255,0.06)'}`, background: isMyTurn ? 'rgba(0,245,255,0.07)' : undefined, display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all 0.3s' }}>
            <div>
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem', letterSpacing: '2px', marginBottom: '0.25rem' }}>SIRADAKI</div>
              <div style={{ color: isMyTurn ? '#00f5ff' : '#fff', fontWeight: 700, fontSize: '1.1rem', truncate: 'ellipsis' }}>
                {currentPlayerName}{isMyTurn && ' ✨ (SEN)'}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div className="font-orbitron" style={{ fontSize: '2.2rem', fontWeight: 900, color: timeLeft <= 5 ? '#f87171' : timeLeft <= 10 ? '#fbbf24' : '#00f5ff', textShadow: timeLeft <= 5 ? '0 0 20px #f87171' : undefined, animation: timeLeft <= 5 ? 'count-bounce 0.5s ease-in-out infinite' : undefined }}>
                {timeLeft}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.65rem', letterSpacing: '1px' }}>SANIYE</div>
            </div>
          </div>
        </div>

        {/* Number grid */}
        <div style={{ flex: 1, display: 'flex', gap: '1rem', flexWrap: 'wrap-reverse' }}>
          <div style={{ flex: '1 1 0', minWidth: 0 }}>
            <div className="glass-dark" style={{ padding: '1rem', borderRadius: '20px', height: '100%', minHeight: 320 }}>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${currentRoom.maxNumber > 60 ? 44 : 52}px, 1fr))`, gap: '6px' }}>
                {Array.from({ length: currentRoom.maxNumber }, (_, i) => i + 1).map(num => {
                  const clicked = gameState.clickedNumbers?.includes(num);
                  const isOwn = num === secretNumber;
                  const canClick = isMyTurn && !isFound && !clicked && !isOwn;

                  return (
                    <button key={num} onClick={() => canClick && clickNumber(num)} disabled={!canClick}
                      style={{ aspectRatio: '1', borderRadius: '10px', border: 'none', cursor: canClick ? 'pointer' : 'default', fontWeight: 700, fontSize: currentRoom.maxNumber > 60 ? '0.85rem' : '1rem', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: isOwn ? 'rgba(0,245,255,0.1)' : clicked ? 'rgba(255,255,255,0.03)' : canClick ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
                        color: isOwn ? '#00f5ff' : clicked ? 'rgba(255,255,255,0.15)' : canClick ? '#fff' : 'rgba(255,255,255,0.3)',
                        boxShadow: canClick ? '0 0 0 1px rgba(255,255,255,0.1)' : isOwn ? '0 0 10px rgba(0,245,255,0.3), 0 0 0 1px rgba(0,245,255,0.4)' : 'none',
                        transform: canClick ? undefined : undefined
                      }}
                      onMouseEnter={e => canClick && (e.currentTarget.style.background = 'rgba(0,245,255,0.2)', e.currentTarget.style.color = '#00f5ff', e.currentTarget.style.transform = 'scale(1.08)')}
                      onMouseLeave={e => canClick && (e.currentTarget.style.background = 'rgba(255,255,255,0.12)', e.currentTarget.style.color = '#fff', e.currentTarget.style.transform = 'scale(1)')}
                    >
                      {isOwn ? '★' : clicked ? '×' : num}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Scoreboard */}
          <div className="glass-dark" style={{ width: 200, borderRadius: '20px', padding: '1.25rem', flexShrink: 0, alignSelf: 'flex-start' }}>
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem', letterSpacing: '2px', marginBottom: '1rem' }}>SKOR</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[...players].sort((a, b) => b.score - a.score).map((p, i) => {
                const eliminated = gameState.foundPlayers?.includes(p.id);
                return (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.75rem', borderRadius: '10px', background: p.id === authUser?.uid ? 'rgba(0,245,255,0.08)' : 'rgba(255,255,255,0.04)', border: `1px solid ${p.id === authUser?.uid ? 'rgba(0,245,255,0.2)' : 'rgba(255,255,255,0.05)'}`, opacity: eliminated ? 0.4 : 1, textDecoration: eliminated ? 'line-through' : 'none' }}>
                    <span style={{ color: i === 0 ? '#fbbf24' : '#fff', fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 90 }}>{i + 1}. {p.name}</span>
                    <span className="font-orbitron" style={{ color: p.id === authUser?.uid ? '#00f5ff' : 'rgba(255,255,255,0.7)', fontSize: '0.9rem', fontWeight: 700, flexShrink: 0 }}>{p.score}</span>
                  </div>
                );
              })}
            </div>
            {isFound && <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', color: '#f87171', fontSize: '0.8rem', fontWeight: 700, textAlign: 'center' }}>ELENDİN 💀</div>}
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RESULTS
  // ══════════════════════════════════════════════════════════════════════════
  if (screen === 'results') return (
    <div className="min-h-screen grid-bg" style={{ background: 'linear-gradient(135deg, #020617 0%, #0a0f2e 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="glass-dark" style={{ width: '100%', maxWidth: 460, borderRadius: '28px', padding: '2.5rem', textAlign: 'center' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1rem', animation: 'float 2s ease-in-out infinite' }}>🏆</div>
        <h2 className="font-orbitron" style={{ color: '#fbbf24', fontSize: '1.6rem', letterSpacing: '2px', marginBottom: '0.5rem' }}>OYUN BİTTİ</h2>
        {xpGained && <div style={{ color: '#4ade80', fontSize: '0.95rem', fontWeight: 700, marginBottom: '1.5rem' }}>+{xpGained} XP kazandın! 🎉</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '2rem' }}>
          {[...players].sort((a, b) => b.score - a.score).map((p, i) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderRadius: '16px', background: i === 0 ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.04)', border: `1px solid ${i === 0 ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.06)'}`, transform: i === 0 ? 'scale(1.02)' : 'scale(1)' }}>
              <span style={{ color: i === 0 ? '#fbbf24' : '#fff', fontWeight: 700, fontSize: '1.05rem' }}>
                {['🥇', '🥈', '🥉'][i] || `${i + 1}.`} {p.name}
                {p.id === authUser?.uid && <span style={{ color: '#00f5ff', fontSize: '0.8rem' }}> (SEN)</span>}
              </span>
              <span className="font-orbitron" style={{ color: i === 0 ? '#fbbf24' : 'rgba(255,255,255,0.7)', fontWeight: 700, fontSize: '1.1rem' }}>{p.score}</span>
            </div>
          ))}
        </div>

        {isHost ? (
          <button onClick={restartMatch} style={{ width: '100%', padding: '1.1rem', background: 'linear-gradient(135deg, #00f5ff, #0891b2)', border: 'none', borderRadius: '16px', color: '#020617', fontWeight: 700, fontSize: '1.05rem', letterSpacing: '1px', cursor: 'pointer', marginBottom: '1rem' }}>
            🔄 YENİDEN BAŞLAT
          </button>
        ) : (
          <div style={{ padding: '1rem', background: 'rgba(0,245,255,0.05)', border: '1px solid rgba(0,245,255,0.15)', borderRadius: '14px', color: '#00f5ff', fontWeight: 600, marginBottom: '1rem', animation: 'pulse 2s infinite' }}>
            ⏳ Host yeni maçı başlatıyor...
          </div>
        )}
        <button onClick={leaveRoom} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, padding: '0.5rem' }}>Ana Menüye Dön</button>
      </div>
    </div>
  );

  return null;
}

// ─── STYLE HELPERS ────────────────────────────────────────────────────────────
const inputStyle = {
  padding: '0.9rem 1.25rem',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '14px',
  color: '#fff',
  fontSize: '1rem',
  outline: 'none',
  fontWeight: 500,
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'Rajdhani, sans-serif'
};

const btnPrimaryStyle = {
  padding: '1rem',
  background: 'linear-gradient(135deg, #00f5ff, #0891b2)',
  border: 'none',
  borderRadius: '14px',
  color: '#020617',
  fontWeight: 700,
  fontSize: '1rem',
  letterSpacing: '1px',
  cursor: 'pointer',
  transition: 'all 0.2s',
  width: '100%'
};
