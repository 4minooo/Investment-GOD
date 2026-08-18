const FIREBASE_CDN_VERSION = "10.12.5";
const LOCAL_CONFIG_KEY = "investment-god.firebaseConfig";

export function getStoredFirebaseConfig() {
  const runtimeConfig = window.__FIREBASE_CONFIG__ || {};
  if (hasFirebaseConfig(runtimeConfig)) return runtimeConfig;

  try {
    const localConfig = JSON.parse(localStorage.getItem(LOCAL_CONFIG_KEY) || "{}");
    return hasFirebaseConfig(localConfig) ? localConfig : runtimeConfig;
  } catch {
    return runtimeConfig;
  }
}

export function saveFirebaseConfig(config) {
  localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(config));
}

export function clearFirebaseConfig() {
  localStorage.removeItem(LOCAL_CONFIG_KEY);
}

export function hasFirebaseConfig(config) {
  return Boolean(config?.apiKey && config?.databaseURL && config?.projectId && config?.appId);
}

export async function createFirebaseGameService(config) {
  if (!hasFirebaseConfig(config)) {
    throw new Error("Firebase 설정이 비어 있습니다.");
  }

  const [{ initializeApp }, databaseModule] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_CDN_VERSION}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${FIREBASE_CDN_VERSION}/firebase-database.js`)
  ]);

  const {
    getDatabase,
    ref,
    set,
    update,
    get,
    onValue,
    serverTimestamp,
    onDisconnect,
    runTransaction
  } = databaseModule;

  const app = initializeApp(config);
  const database = getDatabase(app);

  function roomRef(roomCode, suffix = "") {
    return ref(database, `rooms/${roomCode}${suffix}`);
  }

  async function createRoom({ roomCode, seed, stageIds, player }) {
    const snapshot = await get(roomRef(roomCode));
    if (snapshot.exists()) {
      throw new Error("이미 존재하는 방 코드입니다. 다시 시도해주세요.");
    }

    await set(roomRef(roomCode), {
      code: roomCode,
      seed,
      stageIds,
      hostId: player.id,
      status: "waiting",
      currentRound: 0,
      createdAt: serverTimestamp(),
      players: {
        [player.id]: {
          id: player.id,
          name: player.name,
          joinedAt: serverTimestamp(),
          connected: true,
          choices: {}
        }
      }
    });
    await onDisconnect(roomRef(roomCode, `/players/${player.id}/connected`)).set(false);
  }

  async function joinRoom({ roomCode, player }) {
    const snapshot = await get(roomRef(roomCode));
    if (!snapshot.exists()) {
      throw new Error("방을 찾지 못했습니다.");
    }

    const room = snapshot.val();
    const playerCount = Object.keys(room.players || {}).length;
    if (!room.players?.[player.id] && room.status !== "waiting") {
      throw new Error("이미 시작된 방에는 입장할 수 없습니다.");
    }
    if (!room.players?.[player.id] && playerCount >= 4) {
      throw new Error("이미 4명이 입장한 방입니다.");
    }

    const transaction = await runTransaction(roomRef(roomCode), (currentRoom) => {
      if (!currentRoom) return;
      const currentPlayers = currentRoom.players || {};
      const isReturningPlayer = Boolean(currentPlayers[player.id]);
      if (!isReturningPlayer && (currentRoom.status !== "waiting" || Object.keys(currentPlayers).length >= 4)) {
        return;
      }

      currentRoom.players = {
        ...currentPlayers,
        [player.id]: {
          ...currentPlayers[player.id],
          id: player.id,
          name: player.name,
          joinedAt: currentPlayers[player.id]?.joinedAt || Date.now(),
          connected: true,
          choices: currentPlayers[player.id]?.choices || {}
        }
      };
      return currentRoom;
    });
    if (!transaction.committed) {
      throw new Error("방이 가득 찼거나 이미 대전이 시작되었습니다.");
    }
    await onDisconnect(roomRef(roomCode, `/players/${player.id}/connected`)).set(false);
  }

  async function startRoom(roomCode) {
    await update(roomRef(roomCode), {
      status: "active",
      currentRound: 0,
      startedAt: serverTimestamp()
    });
  }

  async function submitChoice({ roomCode, playerId, roundIndex, amount }) {
    await set(roomRef(roomCode, `/players/${playerId}/choices/${roundIndex}`), {
      amount,
      submittedAt: serverTimestamp()
    });
  }

  async function advanceRoom({ roomCode, nextRound, finished }) {
    await update(roomRef(roomCode), {
      currentRound: nextRound,
      status: finished ? "finished" : "active",
      updatedAt: serverTimestamp()
    });
  }

  function subscribeRoom(roomCode, callback) {
    return onValue(roomRef(roomCode), (snapshot) => callback(snapshot.val()));
  }

  return {
    createRoom,
    joinRoom,
    startRoom,
    submitChoice,
    advanceRoom,
    subscribeRoom
  };
}
