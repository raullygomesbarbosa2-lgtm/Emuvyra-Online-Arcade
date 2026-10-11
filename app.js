const gameInfo = {
  sf3: { title: 'Street Fighter III', subtitle: '3rd Strike' },
  kof2002: { title: 'The King of Fighters', subtitle: '2002' },
  garou: { title: 'Garou: Mark of the Wolves', subtitle: 'Real Bout 2' },
};

const connectionDot = document.querySelector('#connection-dot');
const connectionLabel = document.querySelector('#connection-label');
const connectButton = document.querySelector('#connect-button');
const quickMatchButton = document.querySelector('#quick-match');
const matchButton = document.querySelector('#match-button');
const createRoomButton = document.querySelector('#create-room');
const selectedTitle = document.querySelector('#selected-title');
const playerNameInput = document.querySelector('#player-name');
const roomList = document.querySelector('#room-list');
const roomCount = document.querySelector('#room-count');
const onlineCount = document.querySelector('#online-count');
const notice = document.querySelector('#notice');

let selectedGame = 'sf3';
let socket;
let connected = false;
let retryTimer;

try {
  const savedName = localStorage.getItem('neon-versus-name');
  if (savedName) playerNameInput.value = savedName;
} catch { /* Storage may be unavailable in a private browser session. */ }

function playerName() {
  const name = playerNameInput.value.trim().slice(0, 20) || 'Player';
  playerNameInput.value = name;
  try { localStorage.setItem('neon-versus-name', name); } catch { /* Optional preference. */ }
  return name;
}

function setNotice(message, error = false) {
  notice.textContent = message;
  notice.classList.toggle('error', error);
}

function setConnection(isConnected) {
  connected = isConnected;
  connectionDot.classList.toggle('live', isConnected);
  connectionLabel.textContent = isConnected ? 'ONLINE' : 'DESCONECTADO';
  connectButton.textContent = isConnected ? 'CONECTADO' : 'CONECTAR';
  if (!isConnected) renderRooms([]);
}

function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  clearTimeout(retryTimer);
  const endpoint = window.NEON_VERSUS_WS_URL || '';
  if (!endpoint) {
    setNotice('Prévia no GitHub Pages: as salas ao vivo precisam do Worker da Cloudflare.');
    return;
  }
  socket = new WebSocket(endpoint);

  socket.addEventListener('open', () => {
    setConnection(true);
    socket.send(JSON.stringify({ type: 'hello', playerName: playerName() }));
    setNotice('Conectado. Salas atualizadas em tempo real.');
  });

  socket.addEventListener('message', event => {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }
    if (data.type === 'rooms:update') renderRooms(data.rooms || []);
    if (data.type === 'room:created') setNotice(`Sala ${data.room.code} criada. Compartilhe o código com alguém.`);
    if (data.type === 'room:joined') setNotice(`Você entrou na sala ${data.room.code}.`);
    if (data.type === 'room:ready') setNotice(`Sala ${data.room.code} pronta — os dois jogadores estão conectados.`);
    if (data.type === 'match:queued') setNotice(`Na fila para ${gameInfo[data.gameId]?.title || 'o jogo'}. Aguardando oponente…`);
    if (data.type === 'match:found') setNotice(`Oponente encontrado. Sala ${data.room.code} — ${gameInfo[data.room.gameId]?.title || 'jogo selecionado'}.`);
    if (data.type === 'app:error') setNotice(data.message || 'Não foi possível concluir a ação.', true);
  });

  socket.addEventListener('close', () => {
    setConnection(false);
    setNotice('Conexão encerrada. Reconecte para buscar partidas.');
  });

  socket.addEventListener('error', () => {
    setConnection(false);
    setNotice('Não consegui conectar ao serviço. Tente novamente.', true);
  });
}

function send(payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    setNotice('Conecte-se antes de buscar partidas ou criar salas.', true);
    return false;
  }
  socket.send(JSON.stringify({ ...payload, playerName: playerName() }));
  return true;
}

function startMatch() {
  if (send({ type: 'match:queue', gameId: selectedGame })) {
    setNotice(`Buscando oponente para ${gameInfo[selectedGame].title}…`);
  }
}

function renderRooms(rooms) {
  roomList.replaceChildren();
  roomCount.textContent = `${rooms.length} ${rooms.length === 1 ? 'SALA DISPONÍVEL' : 'SALAS DISPONÍVEIS'}`;
  onlineCount.textContent = String(rooms.reduce((total, room) => total + room.players, 0));

  if (!rooms.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const symbol = document.createElement('span');
    symbol.textContent = '⌁';
    const message = document.createElement('p');
    message.textContent = connected ? 'Nenhuma sala aberta. Crie uma e convide alguém.' : 'Conecte-se para ver as salas ao vivo.';
    empty.append(symbol, message);
    roomList.append(empty);
    return;
  }

  for (const room of rooms) {
    const row = document.createElement('div');
    row.className = 'room-row';
    const indicator = document.createElement('span');
    indicator.className = 'room-live';
    const game = document.createElement('div');
    game.className = 'room-game';
    const gameName = document.createElement('b');
    gameName.textContent = gameInfo[room.gameId]?.title || room.gameId;
    const code = document.createElement('small');
    code.textContent = `SALA ${room.code}`;
    game.append(gameName, code);
    const host = document.createElement('div');
    host.className = 'room-host';
    host.textContent = room.host;
    const slots = document.createElement('div');
    slots.className = 'room-slots';
    slots.textContent = `${room.players}/2 jogadores`;
    const join = document.createElement('button');
    join.className = 'join';
    join.textContent = 'ENTRAR ↗';
    join.addEventListener('click', () => send({ type: 'room:join', code: room.code }));
    row.append(indicator, game, host, slots, join);
    roomList.append(row);
  }
}

document.querySelectorAll('.game-card').forEach(card => {
  card.addEventListener('click', () => {
    selectedGame = card.dataset.game;
    document.querySelectorAll('.game-card').forEach(item => {
      const selected = item === card;
      item.classList.toggle('selected', selected);
      item.querySelector('.select-mark').textContent = selected ? 'SELECIONADO' : 'SELECIONAR';
    });
    selectedTitle.textContent = `${gameInfo[selectedGame].title} — ${gameInfo[selectedGame].subtitle}`;
  });
});

connectButton.addEventListener('click', connect);
quickMatchButton.addEventListener('click', startMatch);
matchButton.addEventListener('click', startMatch);
createRoomButton.addEventListener('click', () => send({ type: 'room:create', gameId: selectedGame }));
playerNameInput.addEventListener('change', () => {
  playerName();
  if (connected) send({ type: 'hello' });
});

renderRooms([]);
