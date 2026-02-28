import React, { useState, useEffect, useRef } from 'react';
import { Target, Zap, Crown, Trophy, Eye, RefreshCw, Clock, Users } from 'lucide-react';

// Firebase Bağlantısı
import { initializeApp } from "firebase/app";
import { 
  getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot, collection, getDocs
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- PUANLAMA SABİTLERİ ---
const BASE_POINTS = 100;    // İlk bulunanın alacağı tavan puan
const SCORE_RATIO = 0.8;    // Azalma oranı (Her seferinde %80)
const FINDER_PENALTY = -20; // Sayıyı bulan (avcı) kişinin aldığı ceza

export default function GizliSayiOyunu() {
  const [screen, setScreen] = useState('menu');
  const [playerName, setPlayerName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [roomPassword, setRoomPassword] = useState('');
  const [joinPlayerName, setJoinPlayerName] = useState('');
  const [joinRoomName, setJoinRoomName] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [maxNumber, setMaxNumber] = useState(60);
  const [maxPlayers, setMaxPlayers] = useState(4); // Kişi seçme geri geldi
  const [secretNumber, setSecretNumber] = useState(null);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [gameState, setGameState] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [myPlayerId, setMyPlayerId] = useState(() => localStorage.getItem('gizliSayiPlayerId') || null);
  const [celebration, setCelebration] = useState(null);
  const [timeLeft, setTimeLeft] = useState(15);
  const timerInterval = useRef(null);

  useEffect(() => {
    let unsub = () => {};
    if (roomName && (['lobby', 'game', 'selectNumber', 'results'].includes(screen))) {
      unsub = onSnapshot(doc(db, "rooms", roomName), (snapshot) => {
        if (snapshot.exists()) {
          const roomData = snapshot.data();
          setCurrentRoom(roomData);
          setPlayers(roomData.players || []);
          setGameState(roomData.gameState);
          if (roomData.host === myPlayerId) setIsHost(true);

          if (roomData.gameState?.phase === 'selectingNumbers' && (screen === 'lobby' || screen === 'results')) {
             setScreen('selectNumber');
             setSecretNumber(null);
          }
          if (roomData.gameState?.phase === 'playing' && screen === 'selectNumber') setScreen('game');
          if (roomData.gameState?.phase === 'finished' && screen === 'game') setTimeout(() => setScreen('results'), 3500);
        }
      });
    }
    return () => unsub();
  }, [roomName, screen]);

  useEffect(() => {
    if (gameState?.phase === 'playing' && screen === 'game') {
      timerInterval.current = setInterval(async () => {
        const elapsed = Date.now() - (gameState.turnStartTime || Date.now());
        const remaining = Math.max(0, Math.ceil((15000 - elapsed) / 1000));
        setTimeLeft(remaining);

        if (remaining === 0 && isHost) {
          applyTimeoutPenalty();
        }
      }, 1000);
      return () => clearInterval(timerInterval.current);
    }
  }, [gameState?.turnStartTime, gameState?.phase, screen, isHost]);

  const applyTimeoutPenalty = async () => {
    const currentPlayerId = gameState.turnOrder[gameState.turnIndex];
    const updatedPlayers = players.map(p => p.id === currentPlayerId ? { ...p, score: p.score - 20 } : p);
    let nextTurnIndex = (gameState.turnIndex + 1) % gameState.turnOrder.length;
    while (gameState.foundPlayers.includes(gameState.turnOrder[nextTurnIndex])) {
      nextTurnIndex = (nextTurnIndex + 1) % gameState.turnOrder.length;
    }
    await updateDoc(doc(db, "rooms", roomName), {
      players: updatedPlayers,
      "gameState.turnIndex": nextTurnIndex,
      "gameState.turnStartTime": Date.now()
    });
  };

  const generateId = () => {
    const newId = Math.random().toString(36).substr(2, 9);
    localStorage.setItem('gizliSayiPlayerId', newId);
    setMyPlayerId(newId);
    return newId;
  };

  const createRoom = async () => {
    if (!playerName.trim() || !roomName.trim() || !roomPassword.trim()) return alert('Eksik alan! 🔐');
    const playerId = generateId();
    await setDoc(doc(db, "rooms", roomName), {
      name: roomName, password: roomPassword, maxPlayers: Number(maxPlayers), maxNumber: Number(maxNumber),
      host: playerId, players: [{ id: playerId, name: playerName, score: 0, isHost: true }],
      gameState: { phase: 'lobby' }, createdAt: Date.now()
    });
    setScreen('lobby');
  };

  const joinRoom = async () => {
    const roomSnap = await getDoc(doc(db, "rooms", joinRoomName));
    if (!roomSnap.exists()) return alert('Oda yok! 😕');
    const room = roomSnap.data();
    if (room.password !== joinPassword) return alert('Şifre yanlış! 🔒');
    if (room.players.length >= room.maxPlayers) return alert('Oda dolu! 😞');
    const playerId = generateId();
    await updateDoc(doc(db, "rooms", joinRoomName), {
      players: [...room.players, { id: playerId, name: joinPlayerName, score: 0, isHost: false }]
    });
    setRoomName(joinRoomName); setScreen('lobby');
  };

  const startGame = async () => {
    if (!isHost) return;
    await updateDoc(doc(db, "rooms", roomName), {
      "gameState.phase": 'selectingNumbers',
      "gameState.turnOrder": players.map(p => p.id).sort(() => Math.random() - 0.5),
      "gameState.clickedNumbers": [], "gameState.foundPlayers": [],
      "gameState.turnIndex": 0, "gameState.turnStartTime": Date.now()
    });
  };

  const submitSecretNumber = async () => {
    if (secretNumber === null || secretNumber < 1 || secretNumber > currentRoom.maxNumber) {
      return alert(`1-${currentRoom.maxNumber} arası seç! 🎯`);
    }
    await setDoc(doc(db, `rooms/${roomName}/secrets`, myPlayerId), { number: secretNumber });
    const updatedPlayers = players.map(p => p.id === myPlayerId ? { ...p, hasSelectedNumber: true } : p);
    const allReady = updatedPlayers.every(p => p.hasSelectedNumber);
    await updateDoc(doc(db, "rooms", roomName), {
      players: updatedPlayers,
      "gameState.phase": allReady ? 'playing' : 'selectingNumbers',
      "gameState.turnStartTime": allReady ? Date.now() : 0
    });
  };

  const clickNumber = async (num) => {
    // Kendi sayısına tıklama ve sıra kontrolü
    if (num === secretNumber || gameState.turnOrder[gameState.turnIndex] !== myPlayerId) return;

    let foundAny = false;
    let foundNames = [];
    let newFoundPlayers = [...gameState.foundPlayers];
    let newPlayers = [...players];

    // 1. Sayı Kontrolü ve Oranlı Puanlama
    for (const player of players) {
      if (newFoundPlayers.includes(player.id)) continue;
      const secSnap = await getDoc(doc(db, `rooms/${roomName}/secrets`, player.id));
      if (secSnap.exists() && secSnap.data().number === num) {
        foundAny = true;
        foundNames.push(player.name);
        newFoundPlayers.push(player.id);

        // Sayısı bulunan (hedef) puan kazanır
        const earnedPoints = Math.round(BASE_POINTS * Math.pow(SCORE_RATIO, gameState.foundPlayers.length));
        newPlayers = newPlayers.map(p => p.id === player.id ? { ...p, score: p.score + earnedPoints } : p);

        // Sayıyı bulan (avcı) ceza alır
        newPlayers = newPlayers.map(p => p.id === myPlayerId ? { ...p, score: p.score + FINDER_PENALTY } : p);
      }
    }

    if (foundAny) {
      setCelebration({ finder: players.find(p => p.id === myPlayerId)?.name, found: foundNames.join(", "), number: num });
      setTimeout(() => setCelebration(null), 3000);
    }

    // 2. Deadlock ve Bitiş Kontrolü
    const allPossibleNumbers = Array.from({length: currentRoom.maxNumber}, (_, i) => i + 1);
    const unclickedNumbers = allPossibleNumbers.filter(n => ![...gameState.clickedNumbers, num].includes(n));
    
    // Sıradaki oyuncuyu bul
    let nextTurnIndex = (gameState.turnIndex + 1) % gameState.turnOrder.length;
    while (newFoundPlayers.includes(gameState.turnOrder[nextTurnIndex])) {
      nextTurnIndex = (nextTurnIndex + 1) % gameState.turnOrder.length;
    }
    const nextPlayerId = gameState.turnOrder[nextTurnIndex];

    // Kalan gizli sayıları kontrol et
    const allSecretsSnap = await getDocs(collection(db, `rooms/${roomName}/secrets`));
    const secretsMap = {};
    allSecretsSnap.forEach(s => secretsMap[s.id] = s.data().number);

    let isDeadlockWin = false;
    // DEADLOCK: Eğer kalan tek sayı sıradaki oyuncunun gizli sayısıysa
    if (unclickedNumbers.length === 1 && unclickedNumbers[0] === secretsMap[nextPlayerId]) {
        isDeadlockWin = true;
        // Deadlock yaşayan oyuncuya puanını ver
        const deadlockBonus = Math.round(BASE_POINTS * Math.pow(SCORE_RATIO, newFoundPlayers.length));
        newPlayers = newPlayers.map(p => p.id === nextPlayerId ? { ...p, score: p.score + deadlockBonus } : p);
    }

    const isNormalEnd = newFoundPlayers.length >= players.length - 1;

    // 3. Firebase Güncelleme (Yanlış tıkta ceza yok, sadece sayı listeden çıkar)
    await updateDoc(doc(db, "rooms", roomName), {
      "gameState.clickedNumbers": [...gameState.clickedNumbers, num],
      "gameState.foundPlayers": newFoundPlayers,
      "gameState.turnIndex": nextTurnIndex,
      "gameState.turnStartTime": Date.now(),
      "gameState.phase": (isNormalEnd || isDeadlockWin) ? 'finished' : 'playing',
      players: newPlayers
    });
  };

  const restartMatch = async () => {
    if (!isHost) return;
    const resetPlayers = players.map(p => ({ ...p, hasSelectedNumber: false }));
    await updateDoc(doc(db, "rooms", roomName), {
      players: resetPlayers,
      "gameState.phase": 'selectingNumbers',
      "gameState.clickedNumbers": [], "gameState.foundPlayers": [],
      "gameState.turnIndex": 0, "gameState.turnStartTime": Date.now()
    });
  };

  // --- UI ---

  if (screen === 'menu') return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-[2.5rem] p-8 shadow-2xl border-b-8 border-indigo-200">
        <Target className="w-16 h-16 mx-auto mb-4 text-indigo-600" />
        <h1 className="text-4xl font-black text-center text-slate-800 tracking-tight">GİZLİ SAYI</h1>
        <div className="space-y-3 mt-6">
          <input type="text" placeholder="İsmin" value={playerName} onChange={(e)=>setPlayerName(e.target.value)} className="w-full p-4 bg-slate-100 rounded-2xl font-bold outline-none" />
          <input type="text" placeholder="Oda Adı" value={roomName} onChange={(e)=>setRoomName(e.target.value)} className="w-full p-4 bg-slate-100 rounded-2xl font-bold outline-none" />
          <input type="password" placeholder="Şifre" value={roomPassword} onChange={(e)=>setRoomPassword(e.target.value)} className="w-full p-4 bg-slate-100 rounded-2xl font-bold outline-none" />
          <div className="flex gap-4 items-end py-2">
            <div className="flex-1">
              <p className="text-[10px] font-black text-slate-400 mb-1 uppercase tracking-wider">Sayı Aralığı: 1 - {maxNumber}</p>
              <input type="range" min="20" max="100" value={maxNumber} onChange={(e)=>setMaxNumber(e.target.value)} className="w-full accent-indigo-600 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
            </div>
            <div className="w-24">
              <p className="text-[10px] font-black text-slate-400 mb-1 uppercase">Max Kişi</p>
              <select value={maxPlayers} onChange={(e)=>setMaxPlayers(e.target.value)} className="w-full p-2 bg-slate-100 rounded-xl font-bold text-sm outline-none">
                {[2,3,4,5,6,8,10].map(n => <option key={n} value={n}>{n} Kişi</option>)}
              </select>
            </div>
          </div>
          <button onClick={createRoom} className="w-full py-5 bg-indigo-600 text-white font-black rounded-2xl shadow-xl hover:bg-indigo-700 active:scale-95 transition-all">ODA OLUŞTUR</button>
          <button onClick={()=>setScreen('join')} className="w-full py-4 text-indigo-600 font-bold hover:underline">BİR ODAYA KATIL</button>
        </div>
      </div>
    </div>
  );

  if (screen === 'join') return (
    <div className="min-h-screen bg-indigo-600 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white p-8 rounded-[2.5rem] shadow-2xl space-y-4 text-center">
        <h2 className="text-3xl font-black">GİRİŞ YAP</h2>
        <input type="text" placeholder="İsmin" value={joinPlayerName} onChange={(e)=>setJoinPlayerName(e.target.value)} className="w-full p-4 bg-slate-100 rounded-2xl font-bold" />
        <input type="text" placeholder="Oda Adı" value={joinRoomName} onChange={(e)=>setJoinRoomName(e.target.value)} className="w-full p-4 bg-slate-100 rounded-2xl font-bold" />
        <input type="password" placeholder="Şifre" value={joinPassword} onChange={(e)=>setJoinPassword(e.target.value)} className="w-full p-4 bg-slate-100 rounded-2xl font-bold" />
        <button onClick={joinRoom} className="w-full py-5 bg-indigo-600 text-white font-black rounded-2xl shadow-xl">BAĞLAN</button>
        <button onClick={()=>setScreen('menu')} className="w-full text-slate-400 font-bold py-2">Vazgeç</button>
      </div>
    </div>
  );

  if (screen === 'lobby') return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-xl w-full bg-white p-10 rounded-[3rem] shadow-xl text-center border-b-8 border-slate-200">
        <Crown className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
        <h2 className="text-3xl font-black mb-1">{currentRoom?.name}</h2>
        <p className="text-slate-400 font-bold uppercase text-[10px] mb-8 tracking-widest">Maksimum {currentRoom?.maxPlayers} Kişi</p>
        <div className="space-y-3 mb-10 text-left">
          {players.map(p => (
            <div key={p.id} className="p-4 bg-slate-50 rounded-2xl flex justify-between items-center border-2 border-slate-100">
              <span className="font-black text-slate-700">{p.name} {p.id === myPlayerId && "(SEN ⭐)"}</span>
              {p.isHost && <span className="bg-indigo-600 text-white text-[10px] px-3 py-1 rounded-full font-black">HOST</span>}
            </div>
          ))}
        </div>
        {isHost ? (
          <button onClick={startGame} disabled={players.length < 2} className="w-full py-6 bg-indigo-600 text-white font-black rounded-3xl shadow-xl disabled:opacity-50 transition-all active:scale-95">OYUNU BAŞLAT</button>
        ) : <div className="animate-pulse text-indigo-600 font-bold bg-indigo-50 p-6 rounded-3xl">HOST BAŞLATMASI BEKLENİYOR...</div>}
      </div>
    </div>
  );

  if (screen === 'selectNumber') {
    const hasSelected = players.find(p => p.id === myPlayerId)?.hasSelectedNumber;
    return (
      <div className="min-h-screen bg-indigo-600 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white p-10 rounded-[3rem] text-center shadow-2xl">
          <Zap className="w-16 h-16 text-pink-500 mx-auto mb-6 shadow-lg" />
          <h2 className="text-3xl font-black mb-2 uppercase tracking-tighter">SAYINI GİZLE</h2>
          <p className="text-slate-400 font-bold mb-8 uppercase text-[10px]">1 - {currentRoom?.maxNumber} arası bir sayı seç.</p>
          {hasSelected ? (
            <div className="bg-emerald-50 text-emerald-600 p-8 rounded-3xl font-black text-xl animate-pulse">SAYIN KİLİTLENDİ! 🔒</div>
          ) : (
            <>
              <input type="number" value={secretNumber || ''} onChange={(e)=>setSecretNumber(Number(e.target.value))} className="w-full text-6xl text-center p-6 bg-slate-50 rounded-3xl mb-8 font-black text-indigo-600 outline-none" placeholder="?" />
              <button onClick={submitSecretNumber} className="w-full py-6 bg-indigo-600 text-white font-black rounded-3xl shadow-xl active:scale-95 transition-transform">SAYIYI SAKLA</button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (screen === 'game') {
    const isMyTurn = gameState?.turnOrder[gameState?.turnIndex] === myPlayerId;
    const isFound = gameState?.foundPlayers.includes(myPlayerId);

    return (
      <div className="min-h-screen bg-slate-950 p-4 md:p-8 flex flex-col lg:flex-row gap-6">
        {celebration && (
          <div className="fixed inset-0 bg-slate-900/95 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-10 rounded-[3rem] text-center shadow-2xl border-b-8 border-yellow-400 scale-110">
                <Trophy className="w-16 h-16 mx-auto mb-4 text-yellow-400 animate-bounce" />
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">SAYI BULUNDU!</h2>
                <p className="font-bold text-slate-500">Bulan: {celebration.finder} (Ceza: -20)</p>
                <p className="font-bold text-indigo-600">Elenen: {celebration.found}</p>
            </div>
          </div>
        )}

        <div className="flex-1 max-w-5xl mx-auto w-full">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-indigo-600 p-6 rounded-3xl text-white shadow-xl flex flex-col items-center justify-center border-b-8 border-indigo-800">
               <div className="text-[10px] font-black uppercase opacity-60 mb-1">Gizli Sayın</div>
               <div className="text-4xl font-black text-yellow-300">{secretNumber}</div>
            </div>
            
            <div className={`p-6 rounded-3xl text-white shadow-xl flex justify-between items-center md:col-span-2 border-b-8 transition-all duration-300 ${isMyTurn ? 'bg-pink-600 border-pink-800 scale-105' : 'bg-slate-800 border-slate-900 opacity-80'}`}>
              <div>
                  <div className="text-[10px] font-black uppercase opacity-60">Sıra Şuan:</div>
                  <div className="text-2xl font-black truncate">
                      {players.find(p => p.id === gameState?.turnOrder[gameState?.turnIndex])?.name}
                      {isMyTurn && " ✨"}
                  </div>
              </div>
              <div className="text-5xl font-black bg-black/20 px-6 py-2 rounded-2xl flex items-center gap-3">
                <Clock className="w-8 h-8 opacity-50" /> {timeLeft}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2 bg-slate-900 p-4 rounded-[2rem] border-2 border-slate-800 shadow-inner">
            {Array.from({length: currentRoom?.maxNumber}, (_, i) => i + 1).map(num => {
                const clicked = gameState?.clickedNumbers.includes(num);
                const isMyOwnNumber = num === secretNumber;

                return (
                    <button 
                      key={num}
                      onClick={() => !clicked && !isMyOwnNumber && isMyTurn && !isFound && clickNumber(num)}
                      disabled={clicked || isMyOwnNumber || !isMyTurn || isFound}
                      className={`relative aspect-square rounded-xl font-black text-lg transition-all duration-200 flex items-center justify-center ${
                        isMyOwnNumber ? 'bg-indigo-500/20 text-indigo-400 border-2 border-indigo-500/50 cursor-not-allowed' :
                        clicked ? 'bg-slate-800 text-slate-600 border-2 border-transparent opacity-30' : 
                        (isMyTurn && !isFound) ? 'bg-white text-slate-900 shadow-lg hover:bg-yellow-400 active:scale-90' : 'bg-slate-800 text-slate-600'
                      }`}
                    >
                        {num}
                        {isMyOwnNumber && <span className="absolute inset-0 flex items-center justify-center text-[8px] opacity-20">BEN</span>}
                    </button>
                )
            })}
          </div>
        </div>

        <div className="w-full lg:w-80 space-y-4">
            <div className="bg-white p-6 rounded-[2.5rem] shadow-2xl border-b-8 border-slate-200">
                <h3 className="font-black text-slate-800 uppercase tracking-tighter text-sm mb-4">PUAN DURUMU</h3>
                <div className="space-y-2">
                    {players.sort((a,b) => b.score - a.score).map((p, i) => (
                        <div key={p.id} className={`flex justify-between items-center p-4 rounded-2xl ${p.id === myPlayerId ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-700'}`}>
                            <span className="font-bold text-xs truncate w-24">{i+1}. {p.name}</span>
                            <span className="font-black">{p.score}</span>
                        </div>
                    ))}
                </div>
            </div>
            {isFound && <div className="bg-red-600 p-6 rounded-[2rem] text-white font-black text-center animate-pulse tracking-tighter">ELENDİN! (DİĞERLERİNİ İZLE)</div>}
        </div>
      </div>
    );
  }

  if (screen === 'results') return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-center">
        <div className="bg-white p-10 rounded-[3rem] shadow-2xl w-full max-w-md border-b-[12px] border-indigo-100">
            <Trophy className="w-20 h-20 text-yellow-400 mx-auto mb-6" />
            <h2 className="text-5xl font-black mb-8 text-slate-800 tracking-tighter uppercase">OYUN BİTTİ</h2>
            <div className="space-y-3 mb-10">
              {players.sort((a,b) => b.score - a.score).map((p, i) => (
                  <div key={p.id} className={`flex justify-between p-5 rounded-3xl ${i===0 ? 'bg-indigo-600 text-white shadow-xl scale-105' : 'bg-slate-50 text-slate-700'} text-xl font-black`}>
                      <span>{i+1}. {p.name}</span>
                      <span>{p.score}</span>
                  </div>
              ))}
            </div>
            {isHost ? (
                <button onClick={restartMatch} className="w-full py-6 bg-indigo-600 text-white font-black rounded-[2rem] shadow-xl hover:bg-indigo-700 flex items-center justify-center gap-3 active:scale-95 transition-all">
                    <RefreshCw className="w-6 h-6" /> YENİDEN BAŞLAT
                </button>
            ) : <p className="p-6 bg-slate-100 rounded-3xl font-black text-slate-400 animate-pulse">HOST YENİ MAÇI BAŞLATIYOR...</p>}
            <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="mt-6 text-slate-300 font-bold hover:text-red-500 text-xs uppercase tracking-widest transition-colors">Odayı Kapat ve Çık</button>
        </div>
    </div>
  );

  return null;
}
