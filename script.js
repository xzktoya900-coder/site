const defaultCatalogItems = [
  {
    category: "Питбайки",
    title: "KAYO Basic 125",
    price: "129 000 ₽",
    description: "Надежный питбайк для тренировок и выходных.",
    features: ["4-тактный двигатель", "Механика", "Подходит новичкам"],
  },
  {
    category: "Эндуро",
    title: "Regulmoto TE 300",
    price: "219 000 ₽",
    description: "Универсальный эндуро для леса, поля и пересеченной местности.",
    features: ["Высокий клиренс", "Усиленная подвеска", "Хорошая тяга"],
  },
  {
    category: "Квадроциклы",
    title: "Avantis Hunter 200",
    price: "289 000 ₽",
    description: "Практичный квадроцикл для отдыха и хозяйственных задач.",
    features: ["Привод 4x4", "Широкая база", "Надежная трансмиссия"],
  },
];

const STORAGE_KEY = "nice-enduro-catalog";
const USERS_KEY = "nice-enduro-users";
const SESSION_KEY = "nice-enduro-session";
const BLOCKED_IPS_KEY = "nice-enduro-blocked-ips";
const DEVICE_IP_KEY = "nice-enduro-device-ip";
const CLOUD_ROW_ID = 1;
const CHAT_MESSAGES_KEY = "nice-enduro-chat-messages";

const SUPABASE_URL = window.NICE_ENDURO_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = window.NICE_ENDURO_SUPABASE_ANON_KEY || "";
const supabaseClient =
  SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

const loadCatalog = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [...defaultCatalogItems];
  } catch {
    return [...defaultCatalogItems];
  }
};

let catalogItems = loadCatalog();
let editIndex = null;
let currentUser = null;
let cloudSyncTimer = null;
let isCloudSyncing = false;
let cloudSyncQueued = false;
let ipRefreshPromise = null;

const catalogGrid = document.querySelector("#catalogGrid");
const adminList = document.querySelector("#adminList");
const catalogForm = document.querySelector("#catalogForm");
const itemCategory = document.querySelector("#itemCategory");
const itemTitle = document.querySelector("#itemTitle");
const itemPrice = document.querySelector("#itemPrice");
const itemDescription = document.querySelector("#itemDescription");
const itemFeatures = document.querySelector("#itemFeatures");
const cancelEditBtn = document.querySelector("#cancelEditBtn");
const adminFormTitle = document.querySelector("#adminFormTitle");
const saveItemBtn = document.querySelector("#saveItemBtn");
const loginForm = document.querySelector("#loginForm");
const registerForm = document.querySelector("#registerForm");
const loginName = document.querySelector("#loginName");
const loginPassword = document.querySelector("#loginPassword");
const registerName = document.querySelector("#registerName");
const registerPassword = document.querySelector("#registerPassword");
const authStatus = document.querySelector("#authStatus");
const usersList = document.querySelector("#usersList");
const usersAdminBox = document.querySelector("#usersAdminBox");
const exportDataBtn = document.querySelector("#exportDataBtn");
const importDataBtn = document.querySelector("#importDataBtn");
const importDataInput = document.querySelector("#importDataInput");
const adminGrid = document.querySelector("#admin .admin-grid");
const adminGuard = document.querySelector("#adminGuard");
const adminSection = document.querySelector("#admin");
const adminMenuLink = document.querySelector("#adminMenuLink");
const adminUsersMenuLink = document.querySelector("#adminUsersMenuLink");
const authMenuLink = document.querySelector("#authMenuLink");
const authModal = document.querySelector("#authModal");
const closeAuthModalBtn = document.querySelector("#closeAuthModalBtn");
const logoutBtn = document.querySelector("#logoutBtn");
const productModal = document.querySelector("#productModal");
const closeModalBtn = document.querySelector("#closeModalBtn");
const closeModalBtnBottom = document.querySelector("#closeModalBtnBottom");
const modalCategory = document.querySelector("#modalCategory");
const modalTitle = document.querySelector("#modalTitle");
const modalPrice = document.querySelector("#modalPrice");
const modalDescription = document.querySelector("#modalDescription");
const modalFeatures = document.querySelector("#modalFeatures");
const chatToggleBtn = document.querySelector("#chatToggleBtn");
const chatUnreadBadge = document.querySelector("#chatUnreadBadge");
const chatPanel = document.querySelector("#chatPanel");
const chatCloseBtn = document.querySelector("#chatCloseBtn");
const chatThreadsWrap = document.querySelector("#chatThreadsWrap");
const chatThreadsList = document.querySelector("#chatThreadsList");
const chatMessagesEl = document.querySelector("#chatMessages");
const chatForm = document.querySelector("#chatForm");
const chatInput = document.querySelector("#chatInput");
const chatSubTitle = document.querySelector("#chatSubTitle");
const chatTyping = document.querySelector("#chatTyping");

let chatMessages = [];
let chatActiveThread = null;
let chatPollTimer = null;

const saveCatalog = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(catalogItems));
  scheduleCloudSync();
};

const getUsers = () => {
  try {
    const stored = localStorage.getItem(USERS_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveUsers = (users) => {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  scheduleCloudSync();
};

const getBlockedIps = () => {
  try {
    const stored = localStorage.getItem(BLOCKED_IPS_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveBlockedIps = (ips) => {
  localStorage.setItem(BLOCKED_IPS_KEY, JSON.stringify(ips));
  scheduleCloudSync();
};

const pullCloudState = async () => {
  if (!supabaseClient) {
    return null;
  }
  const { data, error } = await supabaseClient
    .from("site_state")
    .select("catalog, users, blocked_ips, updated_at")
    .eq("id", CLOUD_ROW_ID)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  return data;
};

const pushCloudState = async () => {
  if (!supabaseClient) {
    return;
  }
  if (isCloudSyncing) {
    cloudSyncQueued = true;
    return;
  }
  isCloudSyncing = true;
  try {
    await supabaseClient.from("site_state").upsert(
      {
        id: CLOUD_ROW_ID,
        catalog: catalogItems,
        users: getUsers(),
        blocked_ips: getBlockedIps(),
      },
      { onConflict: "id" }
    );
  } finally {
    isCloudSyncing = false;
    if (cloudSyncQueued) {
      cloudSyncQueued = false;
      pushCloudState();
    }
  }
};

function scheduleCloudSync() {
  if (!supabaseClient) {
    return;
  }
  if (cloudSyncTimer) {
    clearTimeout(cloudSyncTimer);
  }
  cloudSyncTimer = setTimeout(() => {
    pushCloudState().catch(() => {});
  }, 400);
}

const applyCloudStateSafely = (cloudState) => {
  if (!cloudState) {
    return;
  }
  const cloudCatalog = Array.isArray(cloudState.catalog)
    ? cloudState.catalog.map(normalizeItem).filter(Boolean)
    : [];
  const cloudUsers = Array.isArray(cloudState.users) ? cloudState.users : [];
  const cloudBlockedIps = Array.isArray(cloudState.blocked_ips) ? cloudState.blocked_ips : [];

  const localCatalogRaw = loadCatalog();
  const localCatalog = localCatalogRaw.map(normalizeItem).filter(Boolean);
  const localUsers = getUsers();
  const localIps = getBlockedIps();

  const hasLocalData = localCatalog.length > 0 || localUsers.length > 0 || localIps.length > 0;
  const hasCloudData = cloudCatalog.length > 0 || cloudUsers.length > 0 || cloudBlockedIps.length > 0;

  // Prevent accidental wipe: if cloud is empty but local has data, keep local and sync up.
  if (!hasCloudData && hasLocalData) {
    catalogItems = localCatalog;
    scheduleCloudSync();
    return;
  }

  if (hasCloudData) {
    catalogItems = cloudCatalog;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(catalogItems));
    localStorage.setItem(USERS_KEY, JSON.stringify(cloudUsers));
    localStorage.setItem(BLOCKED_IPS_KEY, JSON.stringify(cloudBlockedIps));
  }
};

const getClientIpTag = () => {
  const existing = localStorage.getItem(DEVICE_IP_KEY);
  if (existing) {
    return existing;
  }
  const generated = `192.168.0.${Math.floor(Math.random() * 180) + 20}`;
  localStorage.setItem(DEVICE_IP_KEY, generated);
  return generated;
};

const resolveClientIp = async () => {
  try {
    const response = await fetch("https://api64.ipify.org?format=json", { cache: "no-store" });
    if (!response.ok) {
      return getClientIpTag();
    }
    const data = await response.json();
    const ip = String(data.ip || "").trim();
    if (!ip) {
      return getClientIpTag();
    }
    localStorage.setItem(DEVICE_IP_KEY, ip);
    return ip;
  } catch {
    return getClientIpTag();
  }
};

const refreshClientIpInBackground = () => {
  if (ipRefreshPromise) {
    return ipRefreshPromise;
  }
  ipRefreshPromise = resolveClientIp()
    .catch(() => getClientIpTag())
    .finally(() => {
      ipRefreshPromise = null;
    });
  return ipRefreshPromise;
};

const getClientIpFast = () => {
  const ip = getClientIpTag();
  refreshClientIpInBackground();
  return ip;
};

const setAuthStatus = (text, tone = "neutral") => {
  if (!authStatus) {
    return;
  }
  authStatus.textContent = text;
  if (tone === "error") {
    authStatus.style.color = "#ff9cac";
    return;
  }
  if (tone === "success") {
    authStatus.style.color = "#8fe7b6";
    return;
  }
  authStatus.style.color = "#c3d0e8";
};

const loadLocalChatMessages = () => {
  try {
    const stored = localStorage.getItem(CHAT_MESSAGES_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveLocalChatMessages = (messages) => {
  localStorage.setItem(CHAT_MESSAGES_KEY, JSON.stringify(messages));
};

const currentThreadForUser = () => (currentUser ? `user:${currentUser.username}` : null);

const fetchChatMessages = async () => {
  if (!supabaseClient) {
    chatMessages = loadLocalChatMessages();
    return;
  }
  const { data, error } = await supabaseClient
    .from("chat_messages")
    .select("id, thread, sender, sender_role, message, created_at")
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) {
    chatMessages = loadLocalChatMessages();
    return;
  }
  chatMessages = (data || []).map((row) => ({
    id: row.id,
    thread: row.thread,
    sender: row.sender,
    senderRole: row.sender_role,
    message: row.message,
    createdAt: row.created_at,
  }));
  saveLocalChatMessages(chatMessages);
};

const sendChatMessage = async (text) => {
  if (!currentUser) {
    return;
  }
  const thread = isAdmin() ? chatActiveThread : currentThreadForUser();
  if (!thread) {
    return;
  }
  const payload = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    thread,
    sender: currentUser.username,
    senderRole: currentUser.role,
    message: text,
    createdAt: new Date().toISOString(),
  };
  chatMessages.push(payload);
  saveLocalChatMessages(chatMessages);
  if (supabaseClient) {
    try {
      await supabaseClient.from("chat_messages").insert({
        id: payload.id,
        thread: payload.thread,
        sender: payload.sender,
        sender_role: payload.senderRole,
        message: payload.message,
        created_at: payload.createdAt,
      });
    } catch {
      // Keep message locally if cloud insert fails.
    }
  }
};

const formatChatTime = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
};

const renderChatThreads = () => {
  if (!chatThreadsList) {
    return;
  }
  if (!isAdmin()) {
    chatThreadsList.innerHTML = "";
    return;
  }
  const threadMap = new Map();
  chatMessages.forEach((msg) => {
    threadMap.set(msg.thread, msg);
  });
  const threads = Array.from(threadMap.keys()).sort();
  if (threads.length === 0) {
    chatThreadsList.innerHTML = '<div class="admin-empty">Пока нет диалогов.</div>';
    return;
  }
  chatThreadsList.innerHTML = threads
    .map((thread) => {
      const label = thread.replace("user:", "");
      const active = thread === chatActiveThread ? "active" : "";
      return `<button type="button" class="chat-thread-item ${active}" data-thread="${thread}">${label}</button>`;
    })
    .join("");
};

const renderChatMessages = () => {
  if (!chatMessagesEl) {
    return;
  }
  if (!currentUser) {
    chatMessagesEl.innerHTML = '<div class="admin-empty">Войдите, чтобы пользоваться чатом.</div>';
    return;
  }
  const thread = isAdmin() ? chatActiveThread : currentThreadForUser();
  if (!thread) {
    chatMessagesEl.innerHTML = '<div class="admin-empty">Выберите диалог.</div>';
    return;
  }
  const list = chatMessages.filter((msg) => msg.thread === thread);
  if (list.length === 0) {
    chatMessagesEl.innerHTML = '<div class="admin-empty">Напишите первое сообщение.</div>';
    return;
  }
  chatMessagesEl.innerHTML = list
    .map((msg) => {
      const roleClass = msg.senderRole === "admin" ? "admin" : "user";
      return `
      <div class="chat-msg ${roleClass}">
        <div>${msg.message}</div>
        <div class="chat-msg-meta">${msg.sender} • ${formatChatTime(msg.createdAt)}</div>
      </div>`;
    })
    .join("");
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
};

const getUnreadCount = () => {
  if (!currentUser) {
    return 0;
  }
  if (isAdmin()) {
    return chatMessages.filter((msg) => msg.senderRole === "user").length;
  }
  const thread = currentThreadForUser();
  return chatMessages.filter((msg) => msg.thread === thread && msg.senderRole === "admin").length;
};

const renderChatUi = () => {
  if (chatThreadsWrap) {
    chatThreadsWrap.classList.toggle("hidden-block", !isAdmin());
  }
  if (chatSubTitle) {
    chatSubTitle.textContent = currentUser
      ? isAdmin()
        ? "Режим администратора"
        : `Вы: ${currentUser.username}`
      : "Войдите, чтобы написать сообщение";
  }
  renderChatThreads();
  renderChatMessages();
  const unread = getUnreadCount();
  if (chatUnreadBadge) {
    chatUnreadBadge.textContent = String(unread);
    chatUnreadBadge.classList.toggle("hidden-block", unread <= 0);
  }
};

const refreshChat = async () => {
  await fetchChatMessages();
  if (isAdmin() && !chatActiveThread) {
    const firstThread = chatMessages.find((msg) => msg.thread.startsWith("user:"));
    chatActiveThread = firstThread ? firstThread.thread : null;
  }
  if (!isAdmin()) {
    chatActiveThread = currentThreadForUser();
  }
  renderChatUi();
};

const ensureDefaultAdmin = () => {
  const users = getUsers();
  if (users.length === 0) {
    users.push({
      username: "admin",
      password: "admin123",
      role: "admin",
      blocked: false,
      lastIp: "local-admin",
    });
    saveUsers(users);
  }
};

const setSession = (username) => {
  localStorage.setItem(SESSION_KEY, username);
};

const clearSession = () => {
  localStorage.removeItem(SESSION_KEY);
};

const restoreSession = () => {
  const sessionName = localStorage.getItem(SESSION_KEY);
  if (!sessionName) {
    currentUser = null;
    return;
  }
  const users = getUsers();
  currentUser = users.find((user) => user.username === sessionName) || null;
};

const isAdmin = () => Boolean(currentUser && currentUser.role === "admin");

const formatPrice = (value) => {
  const digits = String(value || "").replace(/[^\d]/g, "");
  if (!digits) {
    return "";
  }
  return `${Number(digits).toLocaleString("ru-RU")} ₽`;
};

const normalizeItem = (item) => {
  if (!item || typeof item !== "object") {
    return null;
  }
  const title = String(item.title || "").trim();
  const description = String(item.description || "").trim();
  const features = Array.isArray(item.features)
    ? item.features.map((value) => String(value).trim()).filter(Boolean)
    : [];
  const category = String(item.category || title || "Категория").trim();
  const rawPrice = String(item.price || "").trim();
  const price = formatPrice(rawPrice) || "По запросу";
  if (!title || !description || features.length === 0) {
    return null;
  }
  return { category, title, price, description, features };
};

catalogItems = catalogItems.map(normalizeItem).filter(Boolean);

const renderCatalog = () => {
  if (!catalogGrid) {
    return;
  }
  catalogGrid.innerHTML = catalogItems
    .map((item, index) => {
      const features = item.features.map((feature) => `<li>${feature}</li>`).join("");
      return `
      <article class="model-card reveal visible">
        <div class="model-top">
          <span>${item.category}</span>
          <span>${item.price}</span>
        </div>
        <h3>${item.title}</h3>
        <p>${item.description}</p>
        <ul>${features}</ul>
        <button class="btn-card" type="button" data-action="more" data-index="${index}">Подробнее</button>
      </article>
    `;
    })
    .join("");
};

const renderAdminList = () => {
  if (!adminList) {
    return;
  }
  if (!isAdmin()) {
    adminList.innerHTML = "";
    return;
  }
  if (catalogItems.length === 0) {
    adminList.innerHTML = '<div class="admin-empty">Каталог пуст. Добавьте первый товар.</div>';
    return;
  }
  adminList.innerHTML = catalogItems
    .map(
      (item, index) => `
      <article class="admin-item">
        <h4>${String(index + 1).padStart(2, "0")}. ${item.title}</h4>
        <p>${item.category} • ${item.price}</p>
        <p>${item.description}</p>
        <div class="admin-item-actions">
          <button type="button" data-action="edit" data-index="${index}">Редактировать</button>
          <button type="button" data-action="delete" data-index="${index}">Удалить</button>
        </div>
      </article>
    `
    )
    .join("");
};

const resetForm = () => {
  if (!catalogForm || !itemCategory || !itemTitle || !itemPrice || !itemDescription || !itemFeatures) {
    return;
  }
  catalogForm.reset();
  editIndex = null;
  if (adminFormTitle) {
    adminFormTitle.textContent = "Добавить товар";
  }
  if (saveItemBtn) {
    saveItemBtn.textContent = "Добавить";
  }
};

const renderUsersAdmin = () => {
  if (!usersList) {
    return;
  }
  if (!isAdmin()) {
    usersList.innerHTML = "";
    return;
  }
  const users = getUsers();
  usersList.innerHTML = users
    .map((user) => {
      const nextRole = user.role === "admin" ? "user" : "admin";
      const nextLabel = user.role === "admin" ? "Снять админа" : "Сделать админом";
      const blockLabel = user.blocked ? "Разблокировать" : "Блокировать";
      return `
      <div class="user-row">
        <span>${user.username} (${user.role}) • IP: ${user.lastIp || "неизвестно"}</span>
        <div class="user-row-controls">
          <button class="user-role-btn" type="button" data-action="toggle-role" data-user="${user.username}" data-next-role="${nextRole}">
            ${nextLabel}
          </button>
          <button class="user-role-btn" type="button" data-action="toggle-block" data-user="${user.username}">
            ${blockLabel}
          </button>
          <button class="user-role-btn" type="button" data-action="block-ip" data-user="${user.username}">
            Блокировать IP
          </button>
          <button class="user-role-btn" type="button" data-action="delete-user" data-user="${user.username}">
            Удалить профиль
          </button>
        </div>
      </div>
    `;
    })
    .join("");
};

const updateAuthUI = () => {
  setAuthStatus(
    currentUser ? `Вы вошли: ${currentUser.username} (${currentUser.role})` : "Вы не авторизованы",
    currentUser ? "success" : "neutral"
  );
  if (authMenuLink) {
    authMenuLink.textContent = currentUser ? "Аккаунт" : "Вход";
  }
  if (adminSection) {
    adminSection.classList.toggle("hidden-block", !isAdmin());
  }
  if (adminMenuLink) {
    adminMenuLink.classList.toggle("hidden-block", !isAdmin());
  }
  if (adminUsersMenuLink) {
    adminUsersMenuLink.classList.toggle("hidden-block", !isAdmin());
  }
  if (adminGrid) {
    adminGrid.classList.toggle("hidden-block", !isAdmin());
  }
  if (usersAdminBox) {
    usersAdminBox.classList.toggle("hidden-block", !isAdmin());
  }
  if (adminGuard) {
    adminGuard.classList.toggle("hidden-block", isAdmin());
  }
  renderAdminList();
  renderUsersAdmin();
  renderChatUi();
};

if (catalogForm && itemCategory && itemTitle && itemPrice && itemDescription && itemFeatures) {
  itemPrice.addEventListener("input", () => {
    itemPrice.value = formatPrice(itemPrice.value);
  });

  catalogForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!isAdmin()) {
      return;
    }
    const nextItem = {
      category: itemCategory.value.trim(),
      title: itemTitle.value.trim(),
      price: formatPrice(itemPrice.value),
      description: itemDescription.value.trim(),
      features: itemFeatures.value.split(",").map((v) => v.trim()).filter(Boolean),
    };
    if (
      !nextItem.category ||
      !nextItem.title ||
      !nextItem.price ||
      !nextItem.description ||
      nextItem.features.length === 0
    ) {
      return;
    }
    if (editIndex === null) {
      catalogItems.push(nextItem);
    } else {
      catalogItems[editIndex] = nextItem;
    }
    saveCatalog();
    renderCatalog();
    renderAdminList();
    resetForm();
  });
}

if (cancelEditBtn) {
  cancelEditBtn.addEventListener("click", resetForm);
}

if (adminList) {
  adminList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }
    const index = Number(target.dataset.index);
    const action = target.dataset.action;
    if (!isAdmin()) {
      return;
    }
    if (Number.isNaN(index)) {
      return;
    }
    if (action === "delete") {
      catalogItems.splice(index, 1);
      saveCatalog();
      renderCatalog();
      renderAdminList();
      if (editIndex === index) {
        resetForm();
      }
      return;
    }
    if (action === "edit" && itemCategory && itemTitle && itemPrice && itemDescription && itemFeatures) {
      const current = catalogItems[index];
      itemCategory.value = current.category;
      itemTitle.value = current.title;
      itemPrice.value = current.price;
      itemDescription.value = current.description;
      itemFeatures.value = current.features.join(", ");
      editIndex = index;
      if (adminFormTitle) {
        adminFormTitle.textContent = "Редактирование товара";
      }
      if (saveItemBtn) {
        saveItemBtn.textContent = "Сохранить";
      }
    }
  });
}

if (usersList) {
  usersList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement) || !isAdmin()) {
      return;
    }
    const username = target.dataset.user;
    const action = target.dataset.action;
    const nextRole = target.dataset.nextRole;
    if (!username || !action) {
      return;
    }
    const users = getUsers();
    const user = users.find((item) => item.username === username);
    if (!user) {
      return;
    }
    if (action === "toggle-role") {
      if (nextRole !== "admin" && nextRole !== "user") {
        return;
      }
      if (nextRole === "user") {
        if (currentUser && currentUser.username === username) {
          if (authStatus) {
            authStatus.textContent = "Нельзя снять права администратора у самого себя";
          }
          return;
        }
        const adminCount = users.filter((item) => item.role === "admin").length;
        if (user.role === "admin" && adminCount <= 1) {
          if (authStatus) {
            authStatus.textContent = "В системе должен остаться хотя бы один администратор";
          }
          return;
        }
      }
      user.role = nextRole;
      if (currentUser && currentUser.username === username) {
        currentUser.role = nextRole;
      }
      saveUsers(users);
      updateAuthUI();
      return;
    }

    if (action === "toggle-block") {
      if (currentUser && currentUser.username === username) {
        if (authStatus) {
          authStatus.textContent = "Нельзя блокировать самого себя";
        }
        return;
      }
      user.blocked = !user.blocked;
      saveUsers(users);
      updateAuthUI();
      return;
    }

    if (action === "delete-user") {
      if (currentUser && currentUser.username === username) {
        if (authStatus) {
          authStatus.textContent = "Нельзя удалить профиль, под которым вы вошли";
        }
        return;
      }
      const adminCount = users.filter((item) => item.role === "admin").length;
      if (user.role === "admin" && adminCount <= 1) {
        if (authStatus) {
          authStatus.textContent = "Нельзя удалить последнего администратора";
        }
        return;
      }
      const filtered = users.filter((item) => item.username !== username);
      saveUsers(filtered);
      updateAuthUI();
      return;
    }

    if (action === "block-ip") {
      if (currentUser && currentUser.username === username) {
        if (authStatus) {
          authStatus.textContent = "Нельзя блокировать IP самого себя";
        }
        return;
      }
      const ip = user.lastIp;
      if (!ip) {
        if (authStatus) {
          authStatus.textContent = "У пользователя нет сохраненного IP";
        }
        return;
      }
      const blockedIps = getBlockedIps();
      if (!blockedIps.includes(ip)) {
        blockedIps.push(ip);
        saveBlockedIps(blockedIps);
      }
      if (authStatus) {
        authStatus.textContent = `IP ${ip} добавлен в блок-лист`;
      }
      updateAuthUI();
      return;
    }
  });
}

if (loginForm && loginName && loginPassword) {
  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const submitButton = loginForm.querySelector('button[type="submit"]');
    if (submitButton instanceof HTMLButtonElement) {
      submitButton.disabled = true;
    }
    const users = getUsers();
    const clientIp = getClientIpFast();
    if (getBlockedIps().includes(clientIp)) {
      setAuthStatus(`Вход с IP ${clientIp} заблокирован`, "error");
      if (submitButton instanceof HTMLButtonElement) {
        submitButton.disabled = false;
      }
      return;
    }
    const username = loginName.value.trim();
    const password = loginPassword.value;
    const found = users.find((user) => user.username === username && user.password === password);
    if (!found) {
      setAuthStatus("Ошибка входа: неверный логин или пароль", "error");
      if (submitButton instanceof HTMLButtonElement) {
        submitButton.disabled = false;
      }
      return;
    }
    if (found.blocked) {
      setAuthStatus("Пользователь заблокирован администратором", "error");
      if (submitButton instanceof HTMLButtonElement) {
        submitButton.disabled = false;
      }
      return;
    }
    found.lastIp = clientIp;
    saveUsers(users);
    currentUser = { ...found };
    setSession(found.username);
    loginForm.reset();
    updateAuthUI();
    refreshChat();
    if (submitButton instanceof HTMLButtonElement) {
      submitButton.disabled = false;
    }
  });
}

if (registerForm && registerName && registerPassword) {
  registerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const submitButton = registerForm.querySelector('button[type="submit"]');
    if (submitButton instanceof HTMLButtonElement) {
      submitButton.disabled = true;
    }
    const clientIp = getClientIpFast();
    if (getBlockedIps().includes(clientIp)) {
      setAuthStatus(`Регистрация с IP ${clientIp} заблокирована`, "error");
      if (submitButton instanceof HTMLButtonElement) {
        submitButton.disabled = false;
      }
      return;
    }
    const username = registerName.value.trim();
    const password = registerPassword.value;
    if (username.length < 3 || password.length < 4) {
      setAuthStatus("Логин от 3 символов, пароль от 4 символов", "error");
      if (submitButton instanceof HTMLButtonElement) {
        submitButton.disabled = false;
      }
      return;
    }
    const users = getUsers();
    if (users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
      setAuthStatus("Пользователь с таким логином уже существует", "error");
      if (submitButton instanceof HTMLButtonElement) {
        submitButton.disabled = false;
      }
      return;
    }
    users.push({ username, password, role: "user", blocked: false, lastIp: clientIp });
    saveUsers(users);
    registerForm.reset();
    setAuthStatus("Регистрация успешна. Теперь войдите.", "success");
    renderUsersAdmin();
    if (submitButton instanceof HTMLButtonElement) {
      submitButton.disabled = false;
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    currentUser = null;
    clearSession();
    updateAuthUI();
    refreshChat();
  });
}

if (exportDataBtn) {
  exportDataBtn.addEventListener("click", () => {
    if (!isAdmin()) {
      return;
    }
    const payload = {
      catalog: catalogItems,
      users: getUsers(),
      blockedIps: getBlockedIps(),
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "nice-enduro-backup.json";
    link.click();
    URL.revokeObjectURL(url);
  });
}

if (importDataBtn && importDataInput) {
  importDataBtn.addEventListener("click", () => {
    if (!isAdmin()) {
      return;
    }
    importDataInput.click();
  });

  importDataInput.addEventListener("change", async () => {
    const file = importDataInput.files && importDataInput.files[0];
    if (!file || !isAdmin()) {
      return;
    }
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (Array.isArray(data.catalog)) {
        catalogItems = data.catalog.map(normalizeItem).filter(Boolean);
        saveCatalog();
      }
      if (Array.isArray(data.users)) {
        const normalizedUsers = data.users
          .map((user) => ({
            username: String(user.username || "").trim(),
            password: String(user.password || ""),
            role: user.role === "admin" ? "admin" : "user",
            blocked: Boolean(user.blocked),
            lastIp: String(user.lastIp || ""),
          }))
          .filter((user) => user.username && user.password);
        if (normalizedUsers.length > 0) {
          saveUsers(normalizedUsers);
        }
      }
      if (Array.isArray(data.blockedIps)) {
        const ips = data.blockedIps.map((ip) => String(ip).trim()).filter(Boolean);
        saveBlockedIps(ips);
      }
      restoreSession();
      renderCatalog();
      updateAuthUI();
      if (authStatus) {
        authStatus.textContent = "Данные успешно импортированы";
      }
    } catch {
      if (authStatus) {
        authStatus.textContent = "Ошибка импорта: неверный формат файла";
      }
    } finally {
      importDataInput.value = "";
    }
  });
}

const initApp = async () => {
  ensureDefaultAdmin();
  const cloudState = await Promise.race([
    pullCloudState(),
    new Promise((resolve) => setTimeout(() => resolve(null), 1200)),
  ]);
  applyCloudStateSafely(cloudState);
  refreshClientIpInBackground();
  restoreSession();
  renderCatalog();
  updateAuthUI();
  await refreshChat();
  if (chatPollTimer) {
    clearInterval(chatPollTimer);
  }
  chatPollTimer = setInterval(() => {
    refreshChat();
  }, 5000);
};

initApp();

const openModal = (item) => {
  if (!productModal || !modalCategory || !modalTitle || !modalPrice || !modalDescription || !modalFeatures) {
    return;
  }
  modalCategory.textContent = item.category;
  modalTitle.textContent = item.title;
  modalPrice.textContent = item.price;
  modalDescription.textContent = item.description;
  modalFeatures.innerHTML = item.features.map((feature) => `<li>${feature}</li>`).join("");
  productModal.hidden = false;
};

const closeModal = () => {
  if (productModal) {
    productModal.hidden = true;
  }
};

const openAuthModal = () => {
  if (authModal) {
    authModal.hidden = false;
  }
};

const closeAuthModal = () => {
  if (authModal) {
    authModal.hidden = true;
  }
};

if (catalogGrid) {
  catalogGrid.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }
    if (target.dataset.action !== "more") {
      return;
    }
    const index = Number(target.dataset.index);
    if (Number.isNaN(index) || !catalogItems[index]) {
      return;
    }
    openModal(catalogItems[index]);
  });
}

if (closeModalBtn) {
  closeModalBtn.addEventListener("click", closeModal);
}
if (closeModalBtnBottom) {
  closeModalBtnBottom.addEventListener("click", closeModal);
}
if (authMenuLink) {
  authMenuLink.addEventListener("click", (event) => {
    event.preventDefault();
    openAuthModal();
  });
}
if (closeAuthModalBtn) {
  closeAuthModalBtn.addEventListener("click", closeAuthModal);
}
if (chatToggleBtn) {
  chatToggleBtn.addEventListener("click", () => {
    if (chatPanel) {
      chatPanel.classList.toggle("hidden-block");
    }
    if (chatPanel && !chatPanel.classList.contains("hidden-block")) {
      refreshChat();
    }
  });
}
if (chatCloseBtn) {
  chatCloseBtn.addEventListener("click", () => {
    if (chatPanel) {
      chatPanel.classList.add("hidden-block");
    }
  });
}
if (chatThreadsList) {
  chatThreadsList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }
    const thread = target.dataset.thread;
    if (!thread || !isAdmin()) {
      return;
    }
    chatActiveThread = thread;
    renderChatUi();
  });
}
if (chatForm && chatInput) {
  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = chatInput.value.trim();
    if (!text) {
      return;
    }
    if (!currentUser) {
      if (chatSubTitle) {
        chatSubTitle.textContent = "Сначала войдите в аккаунт";
      }
      return;
    }
    await sendChatMessage(text);
    chatInput.value = "";
    if (!isAdmin() && chatTyping) {
      chatTyping.classList.remove("hidden-block");
      setTimeout(() => {
        chatTyping.classList.add("hidden-block");
      }, 1200);
    }
    await refreshChat();
  });
}

if (productModal) {
  productModal.addEventListener("click", (event) => {
    if (event.target === productModal) {
      closeModal();
    }
  });
}
if (authModal) {
  authModal.addEventListener("click", (event) => {
    if (event.target === authModal) {
      closeAuthModal();
    }
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeModal();
    closeAuthModal();
  }
});

const revealElements = document.querySelectorAll(".reveal");
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
      }
    });
  },
  { threshold: 0.15 }
);
revealElements.forEach((el) => observer.observe(el));

const menuBtn = document.querySelector(".menu-btn");
const nav = document.querySelector(".main-nav");
if (menuBtn && nav) {
  menuBtn.addEventListener("click", () => {
    nav.classList.toggle("open");
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => nav.classList.remove("open"));
  });
}
