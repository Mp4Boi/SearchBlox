const COLORS = {
  GREEN: '#00b06f',
  BLUE: '#0077ff',
  RED: '#ff3e3e',
};

const { getURL } = chrome.runtime;

const USER = {
  SUCCESS: getURL('images/user-success.png'),
  NEUTRAL: getURL('images/user.png'),
  ERROR: getURL('images/user-error.png'),
};

const get = url => fetch(`https://${url}`).then(res => res.json());

const post = (url, body) => fetch(`https://${url}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body,
}).then(res => res.json());

const search = document.getElementById('sbx-search');
const input = document.getElementById('sbx-input');
const status = document.getElementById('sbx-status');
const icon = document.getElementById('sbx-user');
const bar = document.getElementById('sbx-bar');

search.src = getURL('images/search.png');
icon.src = getURL('images/user.png');

const color = hex => {
  bar.style.backgroundColor = hex;
  search.style.backgroundColor = hex;
};

input.oninput = () => {
  const test = /(^(?=^[^_]+_?[^_]+$)\w{3,20}$|^\d+$)/.test(input.value);
  if (!input.value) icon.src = USER.NEUTRAL;
  else icon.src = test ? USER.SUCCESS : USER.ERROR;
  search.disabled = !test;
};

let searching = false;
let canceled = false;

async function find(imageUrl, place, cursor = '', count = 0) {
  status.innerText = 'Searching...';
  color(COLORS.BLUE);
  search.src = getURL('images/cancel.png');
  icon.src = getURL('images/user-success.png');
  input.disabled = true;

  const { nextPageCursor, data } = await get(`games.roblox.com/v1/games/${place}/servers/Public?limit=100&cursor=${cursor}`);
  cursor = nextPageCursor;

  const [{ maxPlayers }] = data;
  // TODO: Account for VIP servers
  const playing = parseInt(document.querySelectorAll('.text-lead')[document.documentElement.dataset.btrLoaded ? 0 : 3].innerText.replace(/,/g, ''), 10);
  const servers = data.map(s => ({ id: s.id, tokens: s.playerTokens }));

  let matches = 0;

  const stop = () => {
    searching = false;
    color(matches ? COLORS.GREEN : COLORS.RED);
    bar.style.width = '100%';
    input.disabled = false;
    search.src = getURL('images/search.png');
    status.innerText = `${matches || 'No'} server${matches > 1 || !matches ? 's' : ''} found! ${canceled ? '(canceled)' : ''}`;
    canceled = false;
  };

  for (const server of servers) {
    if (canceled) return stop();

    const { data: thumbnailData } = await post('thumbnails.roblox.com/v1/batch', JSON.stringify(server.tokens.map(t => ({ token: t, type: 'AvatarHeadshot', size: '150x150' }))));

    const thumbnails = thumbnailData.filter(d => d.state === 'Completed').map(x => x.imageUrl);

    count += thumbnails.length;
    console.log(`${Math.round((count / playing) * 100)}%`);
    bar.style.width = `${Math.round((count / playing) * 100)}%`;

    const check = thumbnails.some(url => url === imageUrl);

    if (!check) continue;
    matches++;

    color(COLORS.GREEN);
    setTimeout(() => color(COLORS.BLUE), 1000);

    const first = document.querySelectorAll('.rbx-game-server-item')[0];
    const item = document.createElement('li');

    item.className = 'stack-row rbx-game-server-item highlighted';
    item.innerHTML = `
                <div class="section-left rbx-game-server-details'">
                <div class="text-info rbx-game-status rbx-game-server-status'">${server.tokens.length} of ${maxPlayers} people max</div>
                <span>
                <button data-id="${server.id}" type="button" class="btn-full-width btn-control-xs rbx-game-server-join btn-primary-md btn-min-width">Join</button>
                </span>
                </div>
                <div class="section-right rbx-game-server-players">
                ${thumbnails.map(url => `<span class="avatar avatar-headshot-sm player-avatar"><span class="thumbnail-2d-container avatar-card-image"><img src="${url}"></span></span>`).join('')}
                </div>`;

    first.parentNode.insertBefore(item, first);

    const [join] = document.querySelectorAll(`[data-id="${server.id}"]`);
    join.onclick = () => chrome.runtime.sendMessage({ message: { place, id: server.id } });
  }

  if (!cursor) return stop();

  return find(imageUrl, place, cursor, count);
}

search.addEventListener('click', async event => {
  // Prevents page from refreshing
  event.preventDefault();

  if (searching) {
    canceled = true;
    return;
  }

  searching = true;

  const user = await get(`api.roblox.com/users/${/^\d+$/.test(input.value) ? input.value : `get-by-username?username=${input.value}`}`);

  if (user.errors || user.errorMessage) {
    icon.src = USER.ERROR;
    searching = false;
    status.innerText = 'User not found!';
    return;
  }

  const [, place] = window.location.href.match(/games\/(\d+)\//);

  const { data: [{ imageUrl }] } = await get(`thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${user.Id}&size=150x150&format=Png&isCircular=false`);

  const highlighted = document.querySelectorAll('[data-id]');

  highlighted.forEach(child => child.parentNode.parentNode.parentNode.remove());
  find(imageUrl, place);
});
