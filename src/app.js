import { MAPS, MAP_DATA_SOURCE } from "./maps.js";
import {
  clearFirebaseConfig,
  createFirebaseGameService,
  getStoredFirebaseConfig,
  hasFirebaseConfig,
  saveFirebaseConfig
} from "./firebase-client.js";

const INITIAL_CAPITAL = 10_000_000;
const ROUND_COUNT = 10;
const CATEGORIES = ["대박 상승", "폭락 회피", "박스권", "속임수", "거래량 힌트"];

const app = document.querySelector("#app");
const mapById = new Map(MAPS.map((map) => [map.id, map]));

const state = {
  mode: "single",
  single: null,
  resultFocus: 0,
  libraryFilter: "all",
  libraryMapId: "",
  statusMessage: "",
  online: {
    service: null,
    serviceStatus: "idle",
    error: "",
    playerId: getPlayerId(),
    name: localStorage.getItem("investment-god.playerName") || "",
    roomCodeInput: "",
    roomCode: "",
    room: null,
    unsubscribe: null,
    draftAmount: 0,
    draftRound: -1,
    advancingKey: ""
  }
};

function getPlayerId() {
  const saved = localStorage.getItem("investment-god.playerId");
  if (saved) return saved;
  const id = crypto.randomUUID();
  localStorage.setItem("investment-god.playerId", id);
  return id;
}

function hashString(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  return function random() {
    let next = (seed += 0x6d2b79f5);
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, seed) {
  const random = mulberry32(hashString(seed));
  const copied = [...items];
  for (let index = copied.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copied[index], copied[swapIndex]] = [copied[swapIndex], copied[index]];
  }
  return copied;
}

function selectMapIds(seed, count = ROUND_COUNT) {
  const selected = [];
  const used = new Set();

  for (const category of CATEGORIES) {
    const candidates = shuffle(
      MAPS.filter((map) => map.category === category),
      `${seed}:${category}`
    );
    for (const map of candidates.slice(0, 2)) {
      selected.push(map.id);
      used.add(map.id);
    }
  }

  if (selected.length < count) {
    for (const map of shuffle(MAPS, `${seed}:fill`)) {
      if (selected.length >= count) break;
      if (!used.has(map.id)) selected.push(map.id);
    }
  }

  return shuffle(selected.slice(0, count), `${seed}:order`);
}

function formatWon(value) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0
  }).format(Math.round(value));
}

function formatPlainNumber(value) {
  return new Intl.NumberFormat("ko-KR").format(Math.round(value));
}

function formatPct(value, digits = 2) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeAmount(value, availableCash = INITIAL_CAPITAL) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.min(Math.max(Math.round(amount), 0), Math.max(0, availableCash));
}

function currentDraftAmount() {
  if (state.mode === "online") return state.online.draftAmount;
  return state.single?.draftAmount ?? 0;
}

function setCurrentDraftAmount(amount, availableCash) {
  const normalized = normalizeAmount(amount, availableCash);
  if (state.mode === "online") {
    state.online.draftAmount = normalized;
  } else if (state.single) {
    state.single.draftAmount = normalized;
  }
  return normalized;
}

function amountFromChoice(choice) {
  if (typeof choice === "number") return normalizeAmount(choice);
  if (Number.isFinite(Number(choice?.amount))) return normalizeAmount(choice.amount);

  // Old online rooms stored a percentage of the former 1,000,000 won round budget.
  if (Number.isFinite(Number(choice?.percent))) {
    return normalizeAmount((INITIAL_CAPITAL / ROUND_COUNT) * (Number(choice.percent) / 100));
  }
  return 0;
}

function cashBeforeRound(choices, roundIndex) {
  let remaining = INITIAL_CAPITAL;
  for (let index = 0; index < roundIndex; index += 1) {
    remaining -= Math.min(amountFromChoice(choices?.[index]), remaining);
  }
  return Math.max(0, remaining);
}

function computePlayerResult(stageIds, choices) {
  let remainingCash = INITIAL_CAPITAL;
  const stages = stageIds.map((mapId, index) => {
    const map = mapById.get(mapId);
    const requestedAmount = amountFromChoice(choices?.[index]);
    const invested = Math.min(requestedAmount, remainingCash);
    remainingCash -= invested;
    const proceeds = invested * (1 + map.returnPct / 100);
    const pnl = proceeds - invested;
    return {
      index,
      map,
      invested,
      proceeds,
      pnl
    };
  });

  const total = remainingCash + stages.reduce((sum, stage) => sum + stage.proceeds, 0);

  return {
    total,
    remainingCash,
    invested: INITIAL_CAPITAL - remainingCash,
    pnl: total - INITIAL_CAPITAL,
    returnPct: ((total - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100,
    stages
  };
}

function gradeForReturn(returnPct) {
  if (returnPct >= 18) return "투자의 신";
  if (returnPct >= 10) return "슈퍼개미";
  if (returnPct >= 3) return "냉정한 투자자";
  if (returnPct >= 0) return "생존한 투자자";
  if (returnPct >= -5) return "리스크 관리자";
  return "손절 연습생";
}

function normalizeRoomChoices(player) {
  const choices = {};
  for (const [roundIndex, payload] of Object.entries(player?.choices || {})) {
    choices[roundIndex] = Number.isFinite(Number(payload?.amount))
      ? { amount: Number(payload.amount) }
      : { percent: Number(payload?.percent ?? 0) };
  }
  return choices;
}

function makeRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const values = crypto.getRandomValues(new Uint32Array(5));
  for (const value of values) {
    code += alphabet[value % alphabet.length];
  }
  return code;
}

function playerName() {
  return state.online.name.trim();
}

function validatePlayerName() {
  if (playerName()) return true;
  state.online.error = "온라인 대전에 사용할 닉네임을 입력해주세요.";
  render();
  return false;
}

function startSingle(seed = `single-${Date.now()}`) {
  state.single = {
    seed,
    stageIds: selectMapIds(seed),
    choices: [],
    roundIndex: 0,
    draftAmount: 0,
    status: "active"
  };
  state.resultFocus = 0;
  state.statusMessage = "";
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
}

function submitSingleChoice() {
  if (!state.single || state.single.status !== "active") return;
  const availableCash = cashBeforeRound(state.single.choices, state.single.roundIndex);
  state.single.choices.push({ amount: normalizeAmount(state.single.draftAmount, availableCash) });

  if (state.single.choices.length >= state.single.stageIds.length) {
    state.single.status = "finished";
    state.resultFocus = 0;
  } else {
    state.single.roundIndex += 1;
    state.single.draftAmount = 0;
  }
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
}

async function ensureFirebaseService() {
  if (state.online.service || state.online.serviceStatus === "loading") return;
  const config = getStoredFirebaseConfig();
  if (!hasFirebaseConfig(config)) {
    state.online.serviceStatus = "missing";
    render();
    return;
  }

  state.online.serviceStatus = "loading";
  state.online.error = "";
  render();
  try {
    state.online.service = await createFirebaseGameService(config);
    state.online.serviceStatus = "ready";
  } catch (error) {
    state.online.error = error instanceof Error ? error.message : "Firebase 연결에 실패했습니다.";
    state.online.serviceStatus = "error";
  }
  render();
}

function subscribeOnlineRoom(roomCode) {
  if (state.online.unsubscribe) {
    state.online.unsubscribe();
  }
  state.online.roomCode = roomCode;
  state.online.unsubscribe = state.online.service.subscribeRoom(roomCode, (room) => {
    state.online.room = room;
    const currentRound = Number(room?.currentRound || 0);
    const roundChanged = state.online.draftRound !== currentRound;
    if (roundChanged) {
      state.online.draftRound = currentRound;
      state.online.draftAmount = 0;
    }
    maybeAdvanceOnlineRoom(room);
    render();
    if (roundChanged) window.scrollTo({ top: 0, behavior: "instant" });
  });
}

async function createOnlineRoom() {
  if (!validatePlayerName()) return;
  await ensureFirebaseService();
  if (!state.online.service) return;

  const roomCode = makeRoomCode();
  const seed = `${roomCode}-${Date.now()}`;
  const stageIds = selectMapIds(seed);
  try {
    await state.online.service.createRoom({
      roomCode,
      seed,
      stageIds,
      player: {
        id: state.online.playerId,
        name: playerName()
      }
    });
    subscribeOnlineRoom(roomCode);
  } catch (error) {
    state.online.error = error instanceof Error ? error.message : "방 생성에 실패했습니다.";
    render();
  }
}

async function joinOnlineRoom() {
  if (!validatePlayerName()) return;
  await ensureFirebaseService();
  if (!state.online.service) return;

  const roomCode = state.online.roomCodeInput.trim().toUpperCase();
  if (!roomCode) {
    state.online.error = "방 코드를 입력해주세요.";
    render();
    return;
  }

  try {
    await state.online.service.joinRoom({
      roomCode,
      player: {
        id: state.online.playerId,
        name: playerName()
      }
    });
    subscribeOnlineRoom(roomCode);
  } catch (error) {
    state.online.error = error instanceof Error ? error.message : "입장에 실패했습니다.";
    render();
  }
}

async function startOnlineRoom() {
  const room = state.online.room;
  if (!state.online.service || !room || room.hostId !== state.online.playerId) return;
  await state.online.service.startRoom(room.code);
}

async function submitOnlineChoice() {
  const room = state.online.room;
  if (!state.online.service || !room || room.status !== "active") return;
  const roundIndex = Number(room.currentRound || 0);
  const me = room.players?.[state.online.playerId];
  const availableCash = cashBeforeRound(normalizeRoomChoices(me), roundIndex);
  const amount = normalizeAmount(state.online.draftAmount, availableCash);
  await state.online.service.submitChoice({
    roomCode: room.code,
    playerId: state.online.playerId,
    roundIndex,
    amount
  });
  render();
}

function maybeAdvanceOnlineRoom(room) {
  if (!room || room.status !== "active") return;
  if (room.hostId !== state.online.playerId) return;

  const players = Object.values(room.players || {});
  if (players.length < 2) return;

  const roundIndex = Number(room.currentRound || 0);
  const allSubmitted = players.every((player) => player.choices?.[roundIndex]);
  if (!allSubmitted) return;

  const key = `${room.code}:${roundIndex}`;
  if (state.online.advancingKey === key) return;
  state.online.advancingKey = key;

  window.setTimeout(async () => {
    try {
      const finished = roundIndex + 1 >= room.stageIds.length;
      await state.online.service.advanceRoom({
        roomCode: room.code,
        nextRound: roundIndex + 1,
        finished
      });
    } catch (error) {
      state.online.error = error instanceof Error ? error.message : "라운드 진행에 실패했습니다.";
    } finally {
      state.online.advancingKey = "";
      render();
    }
  }, 900);
}

function leaveOnlineRoom() {
  if (state.online.unsubscribe) state.online.unsubscribe();
  state.online.room = null;
  state.online.roomCode = "";
  state.online.roomCodeInput = "";
  state.online.draftAmount = 0;
  state.online.draftRound = -1;
  state.online.advancingKey = "";
  render();
}

function goHome() {
  if (state.online.unsubscribe) {
    state.online.unsubscribe();
    state.online.unsubscribe = null;
  }
  state.mode = "single";
  state.single = null;
  state.resultFocus = 0;
  state.libraryMapId = "";
  state.online.room = null;
  state.online.roomCode = "";
  state.online.draftAmount = 0;
  state.online.draftRound = -1;
  state.statusMessage = "";
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
}

function render() {
  app.innerHTML = `
    <div class="shell">
      ${renderHeader()}
      ${MAPS.length === 100 ? renderMain() : renderMissingMaps()}
    </div>
  `;
  window.requestAnimationFrame(drawCharts);
}

function renderHeader() {
  return `
    <header class="topbar">
      <button class="brand" type="button" data-action="go-home" aria-label="홈 화면으로 이동">
        <div class="brand-mark">₩</div>
        <div>
          <h1>투자의 신</h1>
          <p>한국 주식 과거 차트 ${MAPS.length}개 맵</p>
        </div>
      </button>
      <div class="topbar-actions">
        <button class="home-button" type="button" data-action="go-home" title="홈 화면">홈</button>
        <nav class="mode-tabs" aria-label="게임 모드">
          ${modeButton("single", "싱글")}
          ${modeButton("online", "온라인 2-4인")}
          ${modeButton("library", "맵 보관함")}
        </nav>
      </div>
    </header>
  `;
}

function modeButton(mode, label) {
  const active = state.mode === mode ? "is-active" : "";
  return `<button class="${active}" data-mode="${mode}" type="button">${label}</button>`;
}

function renderMain() {
  if (state.mode === "online") return renderOnline();
  if (state.mode === "library") return renderLibrary();
  return renderSingle();
}

function renderMissingMaps() {
  return `
    <main class="main-grid single-column">
      <section class="panel empty-state">
        <h2>맵 데이터가 아직 없습니다</h2>
        <p>실제 한국 주식 차트 100개를 생성한 뒤 게임을 시작할 수 있습니다.</p>
        <code>npm run generate:maps</code>
      </section>
    </main>
  `;
}

function renderSingle() {
  if (!state.single) return renderSingleStart();
  if (state.single.status === "finished") {
    const result = computePlayerResult(state.single.stageIds, state.single.choices);
    return renderResults({
      title: "싱글플레이 결과",
      stageIds: state.single.stageIds,
      results: [{ id: "solo", name: "나", result }],
      ownResult: result
    });
  }

  const map = mapById.get(state.single.stageIds[state.single.roundIndex]);
  const availableCash = cashBeforeRound(state.single.choices, state.single.roundIndex);
  return renderPlaySurface({
    context: "single",
    map,
    roundIndex: state.single.roundIndex,
    totalRounds: state.single.stageIds.length,
    selectedAmount: state.single.draftAmount,
    availableCash,
    submitted: false,
    waitingText: "",
    actionLabel: "매수 주문"
  });
}

function renderSingleStart() {
  const categoryCounts = CATEGORIES.map(
    (category) =>
      `<span><strong>${category}</strong> ${MAPS.filter((map) => map.category === category).length}</span>`
  ).join("");

  return `
    <main class="main-grid">
      <section class="hero-panel">
        <div class="hero-copy">
          <p class="eyebrow">10라운드 차트 심리전</p>
          <h2>종목명과 날짜가 가려진 차트에서 매수 금액을 결정하세요.</h2>
          <p>한 판의 투자금은 총 1,000만 원입니다. 각 맵의 차트 마지막 날 종가로 매수하고 20거래일 후 종가로 정산하며, 결과는 10라운드가 끝난 뒤 한꺼번에 공개됩니다.</p>
          <div class="hero-actions">
            <button class="primary-button" type="button" data-action="start-single">싱글 10맵 시작</button>
            <button class="ghost-button" type="button" data-mode="online">온라인 방 만들기</button>
          </div>
        </div>
        <div class="market-board" aria-label="게임 요약">
          <div>
            <span>초기 자본</span>
            <strong>${formatWon(INITIAL_CAPITAL)}</strong>
          </div>
          <div>
            <span>한 판 총 투자금</span>
            <strong>${formatWon(INITIAL_CAPITAL)}</strong>
          </div>
          <div>
            <span>맵 풀</span>
            <strong>${MAPS.length}개</strong>
          </div>
          <div>
            <span>결과 구간</span>
            <strong>20거래일</strong>
          </div>
        </div>
      </section>
      <aside class="panel map-mix">
        <h3>맵 구성</h3>
        <div class="category-stack">${categoryCounts}</div>
        <div class="source-note">
          <span>데이터 생성</span>
          <strong>${MAP_DATA_SOURCE.generatedAt ? new Date(MAP_DATA_SOURCE.generatedAt).toLocaleDateString("ko-KR") : "대기 중"}</strong>
        </div>
      </aside>
    </main>
  `;
}

function renderPlaySurface({
  context,
  map,
  roundIndex,
  totalRounds,
  selectedAmount,
  availableCash,
  submitted,
  waitingText,
  actionLabel
}) {
  const invested = normalizeAmount(selectedAmount, availableCash);
  const remainingAfterOrder = availableCash - invested;
  const stageNumber = roundIndex + 1;
  return `
    <main class="game-layout">
      <section class="chart-panel">
        <div class="stage-strip">
          <span>맵 ${String(stageNumber).padStart(2, "0")} / ${totalRounds}</span>
          <span>${map.market}</span>
          <span>${map.sector}</span>
          <span>${map.difficulty}</span>
          <span>일봉 · 60거래일</span>
        </div>
        <div class="chart-wrap">
          <canvas data-map-id="${map.id}" data-chart-mode="history" aria-label="과거 주식 차트"></canvas>
        </div>
        <div class="chart-legend" aria-label="차트 범례">
          <span><i class="legend-up"></i>상승</span>
          <span><i class="legend-down"></i>하락</span>
          <span><i class="legend-volume"></i>거래량</span>
        </div>
      </section>
      <aside class="decision-panel">
        <div class="order-tabs" aria-label="주문 종류">
          <strong>현금매수</strong>
          <span>시장가</span>
        </div>
        <div class="account-balance">
          <span>주문 가능 금액</span>
          <strong>${formatWon(availableCash)}</strong>
          <small>${context === "online" ? "온라인 대전" : "싱글플레이"} · ${stageNumber}/${totalRounds} 스테이지</small>
        </div>
        <label class="order-field" for="order-amount-input">
          <span>매수 금액</span>
          <div class="money-input-wrap">
            <input
              id="order-amount-input"
              type="number"
              inputmode="numeric"
              min="0"
              max="${availableCash}"
              step="10000"
              value="${invested}"
              data-available-cash="${availableCash}"
              ${submitted ? "disabled" : ""}
            />
            <b>원</b>
          </div>
        </label>
        <div class="order-tools">
          <span id="order-amount-formatted">${formatPlainNumber(invested)}원</span>
          <button class="text-button" type="button" data-action="set-max-amount" data-max="${availableCash}" ${
            submitted ? "disabled" : ""
          }>최대</button>
        </div>
        <div class="cash-meter" aria-hidden="true"><i id="order-bar-fill" style="width:${
          availableCash > 0 ? (invested / availableCash) * 100 : 0
        }%"></i></div>
        <dl class="order-summary">
          <div><dt>주문 방식</dt><dd>금액 주문</dd></div>
          <div><dt>주문 후 잔액</dt><dd id="order-balance-preview">${formatWon(remainingAfterOrder)}</dd></div>
          <div><dt>정산 시점</dt><dd>20거래일 후 종가</dd></div>
        </dl>
        <button class="primary-button wide" data-action="${
          context === "online" ? "submit-online-choice" : "confirm-single"
        }" type="button" ${submitted ? "disabled" : ""}>${submitted ? "주문 접수 완료" : actionLabel}</button>
        ${waitingText ? `<p class="waiting-text">${waitingText}</p>` : ""}
        <div class="settlement-note">
          <strong>게임 체결 기준</strong>
          <p>차트 마지막 날 종가에 매수한 뒤 20거래일 후 종가로 정산합니다. 사용한 금액은 이번 판이 끝날 때까지 다시 사용할 수 없습니다.</p>
        </div>
      </aside>
    </main>
  `;
}

function renderOnline() {
  const config = getStoredFirebaseConfig();
  if (!hasFirebaseConfig(config)) return renderFirebaseSetup();
  if (state.online.serviceStatus === "idle") {
    window.queueMicrotask(ensureFirebaseService);
  }
  if (state.online.serviceStatus === "loading") {
    return `<main class="main-grid single-column"><section class="panel empty-state"><h2>온라인 대전 준비 중</h2><p>Firebase 연결을 확인하고 있습니다.</p></section></main>`;
  }
  if (state.online.serviceStatus === "error") {
    return renderFirebaseSetup(state.online.error);
  }
  if (state.online.room) return renderOnlineRoom();
  return renderOnlineLobby();
}

function renderFirebaseSetup(error = "") {
  const sample = JSON.stringify(
    {
      apiKey: "",
      authDomain: "",
      databaseURL: "",
      projectId: "",
      storageBucket: "",
      messagingSenderId: "",
      appId: ""
    },
    null,
    2
  );
  return `
    <main class="main-grid">
      <section class="panel setup-panel">
        <h2>Firebase 설정</h2>
        <p>싱글플레이는 바로 가능하고, 온라인 2-4인 대전은 Firebase Web App 설정이 필요합니다.</p>
        ${error ? `<div class="inline-error">${escapeHtml(error)}</div>` : ""}
        <textarea id="firebase-config-input" spellcheck="false" placeholder='${escapeHtml(sample)}'></textarea>
        <div class="button-row">
          <button class="primary-button" type="button" data-action="save-firebase-config">설정 저장</button>
          <button class="ghost-button" type="button" data-action="clear-firebase-config">설정 지우기</button>
        </div>
      </section>
      <aside class="panel map-mix">
        <h3>배포 메모</h3>
        <p>Vercel에서는 <code>.env.example</code>의 값을 환경 변수로 넣으면 <code>/api/firebase-config.js</code>가 자동으로 브라우저 설정을 주입합니다.</p>
      </aside>
    </main>
  `;
}

function renderOnlineLobby() {
  return `
    <main class="main-grid">
      <section class="panel lobby-panel">
        <p class="eyebrow">2-4인 실시간 대전</p>
        <h2>온라인 게임 입장</h2>
        <p>방을 만들거나 참가하기 전에 이번 대전에서 사용할 닉네임을 설정하세요.</p>
        ${state.online.error ? `<div class="inline-error">${escapeHtml(state.online.error)}</div>` : ""}
        <label>
          닉네임
          <input id="player-name-input" value="${escapeHtml(state.online.name)}" maxlength="16" placeholder="2-16자 닉네임" autocomplete="nickname" />
        </label>
        <div class="button-row">
          <button class="primary-button" type="button" data-action="create-room">방 만들기</button>
        </div>
        <div class="join-row">
          <label>
            방 코드
            <input id="room-code-input" value="${escapeHtml(state.online.roomCodeInput)}" maxlength="5" />
          </label>
          <button class="ghost-button" type="button" data-action="join-room">입장</button>
        </div>
      </section>
      <aside class="panel map-mix">
        <h3>대전 규칙</h3>
        <div class="category-stack">
          <span><strong>맵</strong> 같은 10개</span>
          <span><strong>인원</strong> 2-4명</span>
          <span><strong>선택</strong> 비공개 제출</span>
          <span><strong>승리</strong> 최종 자산 1위</span>
          <span><strong>정산</strong> 각 맵 20거래일 후</span>
        </div>
      </aside>
    </main>
  `;
}

function renderOnlineRoom() {
  const room = state.online.room;
  const players = Object.values(room.players || {});
  if (room.status === "waiting") {
    const isHost = room.hostId === state.online.playerId;
    return `
      <main class="main-grid">
        <section class="panel room-panel">
          <div class="room-code">
            <span>방 코드</span>
            <strong>${room.code}</strong>
          </div>
          <div class="players-list">
            ${players.map((player) => `<span>${escapeHtml(player.name)}${player.connected ? "" : " · 오프라인"}</span>`).join("")}
          </div>
          <div class="button-row">
            <button class="primary-button" type="button" data-action="start-room" ${
              isHost && players.length >= 2 ? "" : "disabled"
            }>대전 시작</button>
            <button class="ghost-button" type="button" data-action="leave-room">나가기</button>
          </div>
        </section>
        <aside class="panel map-mix">
          <h3>준비 상태</h3>
          <div class="category-stack">
            <span><strong>${players.length}</strong> / 최대 4명 입장</span>
            <span><strong>${room.stageIds?.length || 10}</strong>개 맵 고정</span>
            <span><strong>${isHost ? "방장" : "참가자"}</strong></span>
          </div>
        </aside>
      </main>
    `;
  }

  if (room.status === "finished") {
    const results = players.map((player) => ({
      id: player.id,
      name: player.name,
      result: computePlayerResult(room.stageIds, normalizeRoomChoices(player))
    }));
    const ownResult = results.find((result) => result.id === state.online.playerId)?.result || results[0]?.result;
    return renderResults({
      title: "온라인 대전 결과",
      stageIds: room.stageIds,
      results,
      ownResult
    });
  }

  const roundIndex = Number(room.currentRound || 0);
  const map = mapById.get(room.stageIds[roundIndex]);
  const me = room.players?.[state.online.playerId];
  const submitted = Boolean(me?.choices?.[roundIndex]);
  const roomChoices = normalizeRoomChoices(me);
  const availableCash = cashBeforeRound(roomChoices, roundIndex);
  const submittedAmount = submitted ? amountFromChoice(roomChoices[roundIndex]) : state.online.draftAmount;
  const submittedCount = players.filter((player) => player.choices?.[roundIndex]).length;
  const waitingText = submitted
    ? `${submittedCount}/${players.length}명 제출 완료`
    : `${players.length}명 입장 · 선택 대기`;

  return `
    ${renderPlaySurface({
      context: "online",
      map,
      roundIndex,
      totalRounds: room.stageIds.length,
      selectedAmount: submittedAmount,
      availableCash,
      submitted,
      waitingText,
      actionLabel: "매수 주문 제출"
    })}
    <div class="room-footer">
      <span>방 ${room.code}</span>
      <button class="text-button" type="button" data-action="leave-room">나가기</button>
    </div>
  `;
}

function renderResults({ title, stageIds, results, ownResult }) {
  const focusedMap = mapById.get(stageIds[state.resultFocus] || stageIds[0]);
  const sorted = [...results].sort((a, b) => b.result.total - a.result.total);
  return `
    <main class="results-layout">
      <section class="result-summary">
        <div>
          <p class="eyebrow">${title}</p>
          <h2>${gradeForReturn(ownResult.returnPct)}</h2>
          <p class="result-rule">차트 마지막 날 종가 매수 · 20거래일 후 종가 정산</p>
        </div>
        <div class="summary-numbers">
          <div>
            <span>최종 자산</span>
            <strong>${formatWon(ownResult.total)}</strong>
          </div>
          <div class="${ownResult.pnl >= 0 ? "positive" : "negative"}">
            <span>손익</span>
            <strong>${formatWon(ownResult.pnl)}</strong>
          </div>
          <div class="${ownResult.returnPct >= 0 ? "positive" : "negative"}">
            <span>수익률</span>
            <strong>${formatPct(ownResult.returnPct)}</strong>
          </div>
        </div>
      </section>
      <section class="chart-panel reveal-panel">
        <div class="stage-strip reveal">
          <span>${focusedMap.name}</span>
          <span>${focusedMap.ticker}</span>
          <span>${focusedMap.decisionDate} → ${focusedMap.resultDate}</span>
          <span class="${focusedMap.returnPct >= 0 ? "positive" : "negative"}">${formatPct(focusedMap.returnPct)}</span>
        </div>
        <div class="chart-wrap">
          <canvas data-map-id="${focusedMap.id}" data-chart-mode="reveal" aria-label="결과 공개 차트"></canvas>
        </div>
      </section>
      <section class="panel leaderboard">
        <h3>순위</h3>
        ${sorted
          .map(
            (entry, index) => `
              <div class="rank-row ${entry.id === state.online.playerId ? "is-me" : ""}">
                <span>${index + 1}</span>
                <strong>${escapeHtml(entry.name)}</strong>
                <em>${formatWon(entry.result.total)}</em>
                <small class="${entry.result.returnPct >= 0 ? "positive" : "negative"}">${formatPct(entry.result.returnPct)}</small>
              </div>
            `
          )
          .join("")}
      </section>
      <section class="stage-results">
        ${stageIds
          .map((mapId, index) => {
            const map = mapById.get(mapId);
            const ownStage = ownResult.stages[index];
            const active = index === state.resultFocus ? "is-active" : "";
            return `
              <button class="stage-card ${active}" type="button" data-action="focus-result" data-index="${index}">
                <span>맵 ${String(index + 1).padStart(2, "0")}</span>
                <strong>${map.name}</strong>
                <small>${map.market} · ${map.sector}</small>
                <div>
                  <em class="${map.returnPct >= 0 ? "positive" : "negative"}">${formatPct(map.returnPct)}</em>
                  <b>${formatWon(ownStage.invested)} 매수</b>
                </div>
              </button>
            `;
          })
          .join("")}
      </section>
      <div class="button-row result-actions">
        <button class="primary-button" type="button" data-action="restart-single">새 싱글 게임</button>
        <button class="ghost-button" type="button" data-mode="library">맵 보관함</button>
        <button class="ghost-button" type="button" data-action="go-home">홈으로</button>
      </div>
    </main>
  `;
}

function renderLibrary() {
  if (state.libraryMapId) {
    const selectedMap = mapById.get(state.libraryMapId);
    if (selectedMap) return renderLibraryMap(selectedMap);
    state.libraryMapId = "";
  }
  const filters = ["all", ...CATEGORIES];
  const maps =
    state.libraryFilter === "all"
      ? MAPS
      : MAPS.filter((map) => map.category === state.libraryFilter);
  return `
    <main class="library-layout">
      <section class="panel library-head">
        <div>
          <p class="eyebrow">맵 보관함</p>
          <h2>100개 실제 과거 차트 맵</h2>
        </div>
        <div class="filter-row">
          ${filters
            .map((filter) => {
              const active = state.libraryFilter === filter ? "is-active" : "";
              const label = filter === "all" ? "전체" : filter;
              return `<button class="${active}" type="button" data-action="set-library-filter" data-filter="${filter}">${label}</button>`;
            })
            .join("")}
        </div>
      </section>
      <section class="map-grid">
        ${maps
          .map(
            (map) => `
              <button class="map-card" type="button" data-action="open-library-map" data-map-id="${map.id}">
                <div>
                  <span>${map.id}</span>
                  <strong>${map.name}</strong>
                </div>
                <small>${map.market} · ${map.sector} · ${map.category}</small>
                <div class="map-card-bottom">
                  <em class="${map.returnPct >= 0 ? "positive" : "negative"}">${formatPct(map.returnPct)}</em>
                  <b>${map.decisionDate}</b>
                </div>
              </button>
            `
          )
          .join("")}
      </section>
    </main>
  `;
}

function renderLibraryMap(map) {
  return `
    <main class="library-layout map-detail-layout">
      <section class="panel map-detail-head">
        <button class="text-button" type="button" data-action="close-library-map">목록으로</button>
        <div>
          <p class="eyebrow">${map.id} · ${map.market}</p>
          <h2>${map.name}</h2>
          <p>${map.ticker} · ${map.sector} · ${map.category} · 난이도 ${map.difficulty}</p>
        </div>
        <div class="map-return ${map.returnPct >= 0 ? "positive" : "negative"}">
          <span>20거래일 수익률</span>
          <strong>${formatPct(map.returnPct)}</strong>
        </div>
      </section>
      <section class="chart-panel reveal-panel map-detail-chart">
        <div class="stage-strip reveal">
          <span>과거 60거래일</span>
          <span>${map.startDate} → ${map.decisionDate}</span>
          <span>정산일 ${map.resultDate}</span>
          <span>매수가 ${formatWon(map.actualBuyPrice)}</span>
          <span>정산가 ${formatWon(map.actualSellPrice)}</span>
        </div>
        <div class="chart-wrap">
          <canvas data-map-id="${map.id}" data-chart-mode="reveal" aria-label="${escapeHtml(map.name)} 전체 차트"></canvas>
        </div>
        <div class="chart-legend" aria-label="차트 범례">
          <span><i class="legend-up"></i>상승</span>
          <span><i class="legend-down"></i>하락</span>
          <span><i class="legend-volume"></i>거래량</span>
          <span><i class="legend-future"></i>매수 후 20거래일</span>
        </div>
      </section>
      <section class="panel map-detail-stats">
        <div><span>차트 구간 등락</span><strong class="${map.historyTrendPct >= 0 ? "positive" : "negative"}">${formatPct(map.historyTrendPct)}</strong></div>
        <div><span>최대 낙폭</span><strong class="negative">${formatPct(map.drawdownPct)}</strong></div>
        <div><span>최근 거래량 신호</span><strong>${map.volumeSignal.toFixed(2)}x</strong></div>
        <div><span>결과 산정</span><strong>판단일 종가 → 20거래일 후 종가</strong></div>
      </section>
    </main>
  `;
}

function drawCharts() {
  document.querySelectorAll("canvas[data-map-id]").forEach((canvas) => {
    const map = mapById.get(canvas.dataset.mapId);
    if (!map) return;
    drawChart(canvas, map, canvas.dataset.chartMode || "history");
  });
}

function drawChart(canvas, map, mode) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(320, rect.width);
  const height = Math.max(260, rect.height);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);

  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);

  const history = map.history;
  const future = mode === "reveal" ? map.future : [];
  const rows = [...history, ...future];
  const priceRows = rows.map((row) => ({ open: row[1], high: row[2], low: row[3], close: row[4], volume: row[5] }));
  const minPrice = Math.min(...priceRows.map((row) => row.low));
  const maxPrice = Math.max(...priceRows.map((row) => row.high));
  const maxVolume = Math.max(...priceRows.map((row) => row.volume));

  const margin = { top: 36, right: 58, bottom: 34, left: 16 };
  const volumeHeight = Math.max(58, height * 0.19);
  const sectionGap = 28;
  const plotHeight = height - margin.top - margin.bottom - volumeHeight - sectionGap;
  const plotWidth = width - margin.left - margin.right;
  const plotBottom = margin.top + plotHeight;
  const volumeTop = plotBottom + sectionGap;
  const xStep = plotWidth / rows.length;
  const candleWidth = Math.max(3, Math.min(10, xStep * 0.68));
  const pricePadding = Math.max(3, (maxPrice - minPrice) * 0.1);
  const min = minPrice - pricePadding;
  const max = maxPrice + pricePadding;
  const priceRange = Math.max(1, max - min);

  function xAt(index) {
    return margin.left + xStep * index + xStep / 2;
  }

  function yAt(price) {
    return margin.top + ((max - price) / priceRange) * plotHeight;
  }

  context.fillStyle = "#fbfcff";
  context.fillRect(0, 0, width, height);

  if (mode === "reveal") {
    const futureStartX = margin.left + xStep * history.length;
    context.fillStyle = "rgba(199, 149, 34, 0.09)";
    context.fillRect(futureStartX, margin.top, width - margin.right - futureStartX, volumeTop + volumeHeight - margin.top);
  }

  context.strokeStyle = "#dfe4eb";
  context.lineWidth = 1;
  context.font = "600 11px system-ui, sans-serif";
  context.textAlign = "left";
  context.fillStyle = "#697386";
  for (let line = 0; line <= 4; line += 1) {
    const y = margin.top + (plotHeight / 4) * line;
    context.beginPath();
    context.moveTo(margin.left, y);
    context.lineTo(width - margin.right, y);
    context.stroke();

    const price = max - (priceRange / 4) * line;
    context.fillText(price.toFixed(0), width - margin.right + 9, y + 4);
  }

  for (let line = 0; line <= 4; line += 1) {
    const x = margin.left + (plotWidth / 4) * line;
    context.beginPath();
    context.moveTo(x, margin.top);
    context.lineTo(x, volumeTop + volumeHeight);
    context.stroke();
  }

  context.strokeStyle = "#cfd6e0";
  context.beginPath();
  context.moveTo(margin.left, volumeTop - 10);
  context.lineTo(width - margin.right, volumeTop - 10);
  context.stroke();
  context.fillStyle = "#697386";
  context.fillText("거래량", margin.left, volumeTop - 15);

  rows.forEach((row, index) => {
    const [, open, high, low, close, volume] = row;
    const x = xAt(index);
    const isFuture = mode === "reveal" && index >= history.length;
    const up = close >= open;
    const color = up ? "#e5484d" : "#2563eb";

    context.globalAlpha = isFuture ? 0.76 : 1;
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 1.3;
    context.beginPath();
    context.moveTo(x, yAt(high));
    context.lineTo(x, yAt(low));
    context.stroke();

    const bodyTop = yAt(Math.max(open, close));
    const bodyBottom = yAt(Math.min(open, close));
    const bodyHeight = Math.max(2, bodyBottom - bodyTop);
    context.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);

    const volumeRatio = maxVolume > 0 ? volume / maxVolume : 0;
    const volumeBarHeight = volumeRatio * (volumeHeight - 8);
    context.globalAlpha = isFuture ? 0.35 : 0.28;
    context.fillRect(x - candleWidth / 2, volumeTop + volumeHeight - volumeBarHeight, candleWidth, volumeBarHeight);
    context.globalAlpha = 1;
  });

  if (mode === "reveal") {
    const decisionX = xAt(history.length - 1) + xStep / 2;
    context.strokeStyle = "#9a7115";
    context.lineWidth = 1.5;
    context.setLineDash([6, 5]);
    context.beginPath();
    context.moveTo(decisionX, margin.top);
    context.lineTo(decisionX, volumeTop + volumeHeight);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = "#76540c";
    context.fillText("매수 판단일", Math.max(margin.left, decisionX - 33), margin.top - 10);
  }

  const labelIndexes = [0, Math.floor((rows.length - 1) / 2), rows.length - 1];
  context.font = "600 11px system-ui, sans-serif";
  context.fillStyle = "#697386";
  labelIndexes.forEach((index, labelIndex) => {
    const labels = mode === "reveal" ? rows[index][0].slice(2) : ["60일 전", "30일 전", "판단일"];
    context.textAlign = labelIndex === 0 ? "left" : labelIndex === 2 ? "right" : "center";
    context.fillText(Array.isArray(labels) ? labels[labelIndex] : labels, xAt(index), height - 10);
  });

  context.textAlign = "left";
  context.fillStyle = "#222725";
  context.font = "800 13px system-ui, sans-serif";
  context.fillText(mode === "reveal" ? `${map.name} · 매수 후 20거래일 공개` : "익명 종목 · 일봉", margin.left, 20);
}

function updateOrderPreview(amount, availableCash) {
  const formattedAmount = document.querySelector("#order-amount-formatted");
  const balancePreview = document.querySelector("#order-balance-preview");
  const barFill = document.querySelector("#order-bar-fill");
  if (formattedAmount) formattedAmount.textContent = `${formatPlainNumber(amount)}원`;
  if (balancePreview) balancePreview.textContent = formatWon(availableCash - amount);
  if (barFill) barFill.style.width = `${availableCash > 0 ? (amount / availableCash) * 100 : 0}%`;
}

app.addEventListener("click", async (event) => {
  const modeButtonElement = event.target.closest("[data-mode]");
  if (modeButtonElement) {
    state.mode = modeButtonElement.dataset.mode;
    state.statusMessage = "";
    if (state.mode === "online") {
      await ensureFirebaseService();
    }
    render();
    window.scrollTo({ top: 0, behavior: "instant" });
    return;
  }

  const actionElement = event.target.closest("[data-action]");
  if (!actionElement) return;
  const { action } = actionElement.dataset;

  if (action === "go-home") {
    goHome();
    return;
  }

  if (action === "start-single" || action === "restart-single") {
    state.mode = "single";
    startSingle();
    return;
  }

  if (action === "set-max-amount") {
    const availableCash = Number(actionElement.dataset.max || 0);
    setCurrentDraftAmount(availableCash, availableCash);
    render();
    return;
  }

  if (action === "confirm-single") {
    submitSingleChoice();
    return;
  }

  if (action === "focus-result") {
    state.resultFocus = Number(actionElement.dataset.index);
    render();
    return;
  }

  if (action === "set-library-filter") {
    state.libraryFilter = actionElement.dataset.filter;
    render();
    return;
  }

  if (action === "open-library-map") {
    state.libraryMapId = actionElement.dataset.mapId;
    render();
    window.scrollTo({ top: 0, behavior: "instant" });
    return;
  }

  if (action === "close-library-map") {
    state.libraryMapId = "";
    render();
    return;
  }

  if (action === "save-firebase-config") {
    const input = document.querySelector("#firebase-config-input");
    try {
      const parsed = JSON.parse(input.value);
      saveFirebaseConfig(parsed);
      state.online.service = null;
      state.online.serviceStatus = "idle";
      await ensureFirebaseService();
    } catch {
      state.online.error = "Firebase 설정 JSON 형식을 확인해주세요.";
      render();
    }
    return;
  }

  if (action === "clear-firebase-config") {
    clearFirebaseConfig();
    state.online.service = null;
    state.online.serviceStatus = "missing";
    render();
    return;
  }

  if (action === "create-room") {
    await createOnlineRoom();
    return;
  }

  if (action === "join-room") {
    await joinOnlineRoom();
    return;
  }

  if (action === "start-room") {
    await startOnlineRoom();
    return;
  }

  if (action === "submit-online-choice") {
    await submitOnlineChoice();
    return;
  }

  if (action === "leave-room") {
    leaveOnlineRoom();
  }
});

app.addEventListener("input", (event) => {
  if (event.target.id === "order-amount-input") {
    const availableCash = Number(event.target.dataset.availableCash || 0);
    const amount = setCurrentDraftAmount(event.target.value, availableCash);
    const rawAmount = Number(event.target.value);
    if (event.target.value !== "" && rawAmount !== amount) event.target.value = String(amount);
    updateOrderPreview(amount, availableCash);
  }
  if (event.target.id === "player-name-input") {
    state.online.name = event.target.value;
    localStorage.setItem("investment-god.playerName", state.online.name);
  }
  if (event.target.id === "room-code-input") {
    state.online.roomCodeInput = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  }
});

render();
