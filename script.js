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
    return;
  }
  const { data, error } = await supabaseClient
    .from("site_state")
    .select("catalog, users, blocked_ips")
    .eq("id", CLOUD_ROW_ID)
    .maybeSingle();
  if (error || !data) {
    return;
  }
  if (Array.isArray(data.catalog)) {
    catalogItems = data.catalog.map(normalizeItem).filter(Boolean);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(catalogItems));
  }
  if (Array.isArray(data.users)) {
    localStorage.setItem(USERS_KEY, JSON.stringify(data.users));
  }
  if (Array.isArray(data.blocked_ips)) {
    localStorage.setItem(BLOCKED_IPS_KEY, JSON.stringify(data.blocked_ips));
  }
};

const pushCloudState = async () => {
  if (!supabaseClient || isCloudSyncing) {
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
    pushCloudState();
  }, 400);
}

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
  if (authStatus) {
    authStatus.textContent = currentUser
      ? `Вы вошли: ${currentUser.username} (${currentUser.role})`
      : "Вы не авторизованы";
  }
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
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const users = getUsers();
    const clientIp = await resolveClientIp();
    if (getBlockedIps().includes(clientIp)) {
      if (authStatus) {
        authStatus.textContent = `Вход с IP ${clientIp} заблокирован`;
      }
      return;
    }
    const username = loginName.value.trim();
    const password = loginPassword.value;
    const found = users.find((user) => user.username === username && user.password === password);
    if (!found) {
      if (authStatus) {
        authStatus.textContent = "Ошибка входа: неверный логин или пароль";
      }
      return;
    }
    if (found.blocked) {
      if (authStatus) {
        authStatus.textContent = "Пользователь заблокирован администратором";
      }
      return;
    }
    found.lastIp = clientIp;
    saveUsers(users);
    currentUser = { ...found };
    setSession(found.username);
    loginForm.reset();
    updateAuthUI();
  });
}

if (registerForm && registerName && registerPassword) {
  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const clientIp = await resolveClientIp();
    if (getBlockedIps().includes(clientIp)) {
      if (authStatus) {
        authStatus.textContent = `Регистрация с IP ${clientIp} заблокирована`;
      }
      return;
    }
    const username = registerName.value.trim();
    const password = registerPassword.value;
    if (username.length < 3 || password.length < 4) {
      if (authStatus) {
        authStatus.textContent = "Логин от 3 символов, пароль от 4 символов";
      }
      return;
    }
    const users = getUsers();
    if (users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
      if (authStatus) {
        authStatus.textContent = "Пользователь с таким логином уже существует";
      }
      return;
    }
    users.push({ username, password, role: "user", blocked: false, lastIp: clientIp });
    saveUsers(users);
    registerForm.reset();
    if (authStatus) {
      authStatus.textContent = "Регистрация успешна. Теперь войдите.";
    }
    renderUsersAdmin();
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    currentUser = null;
    clearSession();
    updateAuthUI();
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
  await pullCloudState();
  restoreSession();
  renderCatalog();
  updateAuthUI();
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
