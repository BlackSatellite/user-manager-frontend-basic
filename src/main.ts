import './style.css';
// Импортируем PublicClientApplication и LogLevel как значения, а Configuration и AccountInfo как типы.
import { PublicClientApplication, LogLevel } from '@azure/msal-browser';
import type { Configuration, AccountInfo } from '@azure/msal-browser';

// --- Конфигурация MSAL ---
// Эти значения должны точно соответствовать вашей регистрации приложения в Azure Portal.
const msalConfig: Configuration = {
  auth: {
    // ИСПРАВЛЕННЫЙ ClientId (Идентификатор приложения/клиента) - проверьте, что он точно совпадает с порталом
    clientId: '5af00b78-6fae-4485-9404-d2d579df633b',
    // Authority: Instance + TenantId (Идентификатор каталога/клиента)
    authority: 'https://login.microsoftonline.com/e8af93f4-c5d4-430e-80c3-55493d875661',
    // URL перенаправления, должен быть зарегистрирован в Azure Portal как SPA-тип
    redirectUri: 'https://lively-stone-041b55503.1.azurestaticapps.net',
    // Перенаправлять на запрошенный URL после успешного входа
    navigateToLoginRequestUrl: true,
  },
  cache: {
    // Место хранения кэша токенов (локальное хранилище браузера)
    cacheLocation: 'localStorage',
    // Не хранить состояние аутентификации в файлах cookie
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) {
          return; // Игнорировать сообщения, содержащие конфиденциальную информацию (PII)
        }
        switch (level) {
          case LogLevel.Error:
            console.error(message);
            return;
          case LogLevel.Info:
            console.info(message);
            return;
          case LogLevel.Verbose:
            console.debug(message);
            return;
          case LogLevel.Warning:
            console.warn(message);
            return;
        }
      },
      piiLoggingEnabled: false, // Отключить логирование конфиденциальной информации
      logLevel: LogLevel.Info, // Уровень логирования: Info, Warning, Error, Verbose
    },
  },
};

// Область (Scope) для доступа к вашему бэкенд API.
// Это "Audience", который вы настроили в appsettings.json вашего ASP.NET Core бэкенда,
// например, "api://<ClientId вашего бэкенд-приложения>/access_as_user".
// ИСПРАВЛЕННЫЙ ClientId в скоупе
const apiScope = 'api://5af00b78-6fae-4485-9404-d2d579df633b/access_as_user';
const loginRequest = {
  scopes: [apiScope],
};

// Создаем экземпляр PublicClientApplication.
// Его инициализация будет произведена ниже в асинхронной функции initializeMsalAndApp.
const msalInstance = new PublicClientApplication(msalConfig);

// --- Элементы пользовательского интерфейса (UI Elements) ---
// Получаем ссылки на DOM-элементы по их ID.
const signInButton = document.getElementById('signInButton') as HTMLButtonElement;
const signOutButton = document.getElementById('signOutButton') as HTMLButtonElement;
const welcomeMessage = document.getElementById('welcomeMessage') as HTMLParagraphElement;
const userNameInput = document.getElementById('userNameInput') as HTMLInputElement;
const addButton = document.getElementById('addButton') as HTMLButtonElement;
const getButton = document.getElementById('getButton') as HTMLButtonElement;
const clearButton = document.getElementById('clearButton') as HTMLButtonElement;
const userList = document.getElementById('userList') as HTMLUListElement;
const errorMessage = document.getElementById('errorMessage') as HTMLParagraphElement;

// --- Глобальное состояние приложения ---
let account: AccountInfo | null = null; // Текущая активная учетная запись MSAL
const users: { id: number; name: string }[] = []; // Локальный список пользователей для отображения в UI

// --- Вспомогательные функции ---

/**
 * Отображает сообщение пользователю в элементе errorMessage.
 * @param message Текст сообщения.
 * @param isError Указывает, является ли сообщение ошибкой (для изменения цвета и поведения).
 */
function showMessage(message: string, isError: boolean = false) {
  errorMessage.textContent = message;
  errorMessage.style.color = isError ? 'red' : 'green';
  if (!isError) {
    // Очищать сообщение через 3 секунды, если это не ошибка
    setTimeout(() => {
      errorMessage.textContent = '';
    }, 3000);
  }
}

/**
 * Обновляет состояние кнопок и приветственного сообщения в зависимости от статуса входа.
 */
function updateUI() {
  if (account) {
    // Если пользователь вошел
    welcomeMessage.textContent = `Добро пожаловать, ${account.username || account.name}!`;
    signInButton.style.display = 'none'; // Скрыть кнопку входа
    signOutButton.style.display = 'block'; // Показать кнопку выхода
    userNameInput.disabled = false; // Включить поле ввода имени
    addButton.disabled = false; // Включить кнопку добавления пользователя
    getButton.disabled = false; // Включить кнопку получения пользователей
  } else {
    // Если пользователь не вошел
    welcomeMessage.textContent = 'Пожалуйста, войдите.';
    signInButton.style.display = 'block'; // Показать кнопку входа
    signOutButton.style.display = 'none'; // Скрыть кнопку выхода
    userNameInput.disabled = true; // Отключить поле ввода имени
    addButton.disabled = true; // Отключить кнопку добавления пользователя
    getButton.disabled = true; // Отключить кнопку получения пользователей
  }
  displayUsers(); // Всегда обновляем список пользователей (он может быть пустым)
}

/**
 * Отображает список пользователей в элементе userList.
 */
function displayUsers() {
  userList.innerHTML = ''; // Очищаем текущий список
  if (users.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'Нет пользователей для отображения.';
    userList.appendChild(li);
    return;
  }
  users.forEach(user => {
    const li = document.createElement('li');
    li.textContent = user.name;
    userList.appendChild(li);
  });
}

// --- Функции аутентификации MSAL ---

/**
 * Выполняет перенаправление для входа пользователя.
 */
async function signIn() {
  try {
    // Вызов loginRedirect инициирует перенаправление браузера на страницу входа Microsoft.
    await msalInstance.loginRedirect(loginRequest);
  } catch (error: unknown) { // Обработка ошибки типа 'unknown'
    console.error('Ошибка перенаправления при входе:', error);
    let errorMessageText = 'Произошла неизвестная ошибка при попытке входа.';
    if (error instanceof Error) {
      errorMessageText = `Ошибка входа: ${error.message}`;
    }
    showMessage(errorMessageText, true);
  }
}

/**
 * Выполняет перенаправление для выхода пользователя.
 */
async function signOut() {
  try {
    await msalInstance.logoutRedirect(); // Перенаправляет пользователя для выхода
    account = null; // Очищаем текущую учетную запись
    users.length = 0; // Очищаем локальный список пользователей при выходе
    updateUI(); // Обновляем UI
  } catch (error: unknown) { // Обработка ошибки типа 'unknown'
    console.error('Ошибка перенаправления при выходе:', error);
    let errorMessageText = 'Произошла неизвестная ошибка при попытке выхода.';
    if (error instanceof Error) {
      errorMessageText = `Ошибка выхода: ${error.message}`;
    }
    showMessage(errorMessageText, true);
  }
}

// --- Функции взаимодействия с API ---
// Базовый URL вашего бэкенд API. Убедитесь, что он правильный.
const API_BASE_URL = 'https://simpleuserapi20250708021113-e9hdfva0arhkhddk.canadacentral-01.azurewebsites.net/api/Users';

/**
 * Пытается получить токен доступа для API 404.
 * Сначала пытается получить токен бесшумно, если не удается - через перенаправление.
 * @returns Токен доступа или null, если требуется перенаправление.
 */
async function getAccessToken(): Promise<string | null> {
  if (!account) {
    showMessage('Не выполнен вход в систему.', true);
    return null;
  }
  try {
    // Попытка бесшумного получения токена (используя кэш или токен обновления)
    const response = await msalInstance.acquireTokenSilent(loginRequest);
    return response.accessToken;
  } catch (error: unknown) { // Обработка ошибки типа 'unknown'
    console.warn('Бесшумное получение токена не удалось. Получаем токен через перенаправление.', error);
    // Если бесшумное получение токена не удалось (например, истек),
    // перенаправляем пользователя для интерактивного входа.
    // Функция вернет null, так как токен будет доступен только после завершения перенаправления.
    await msalInstance.acquireTokenRedirect(loginRequest);
    return null;
  }
}

/**
 * Получает список пользователей из бэкенд API.
 */
async function getUsers() {
  showMessage('Получение пользователей...');
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return; // Если токен не получен (возможно, инициировано перенаправление), выходим.
    }

    const response = await fetch(API_BASE_URL, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`, // Передаем токен доступа в заголовке
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ошибка HTTP! Статус: ${response.status}, сообщение: ${errorText}`);
    }

    const data: { id: number; name: string }[] = await response.json();
    users.splice(0, users.length, ...data); // Заменяем весь массив users полученными данными
    updateUI(); // Обновляем UI со списком пользователей
    showMessage('Пользователи успешно получены!');
  } catch (error: unknown) { // Обработка ошибки типа 'unknown'
    console.error('Ошибка получения пользователей:', error);
    let errorMessageText = 'Не удалось получить пользователей: произошла неизвестная ошибка.';
    if (error instanceof Error) {
      errorMessageText = `Не удалось получить пользователей: ${error.message}`;
    }
    showMessage(errorMessageText, true);
  }
}

/**
 * Добавляет нового пользователя через бэкенд API.
 * @param name Имя пользователя для добавления.
 */
async function addUser(name: string) {
  showMessage('Добавление пользователя...');
  if (!name || name.trim() === '') {
    showMessage('Имя пользователя не может быть пустым.', true);
    return;
  }

  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return; // Если токен не получен, выходим.
    }

    const response = await fetch(API_BASE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`, // Передаем токен доступа
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: name }), // Тело запроса с именем пользователя
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ошибка HTTP! Статус: ${response.status}, сообщение: ${errorText}`);
    }

    const newUser: { id: number; name: string } = await response.json();
    users.push(newUser); // Добавляем нового пользователя в локальный список
    updateUI(); // Обновляем UI
    showMessage(`Пользователь "${newUser.name}" успешно добавлен!`);
    userNameInput.value = ''; // Очищаем поле ввода
  } catch (error: unknown) { // Обработка ошибки типа 'unknown'
    console.error('Ошибка добавления пользователя:', error);
    let errorMessageText = 'Не удалось добавить пользователя: произошла неизвестная ошибка.';
    if (error instanceof Error) {
      errorMessageText = `Не удалось добавить пользователя: ${error.message}`;
    }
    showMessage(errorMessageText, true);
  }
}

/**
 * Очищает список пользователей только в UI (не взаимодействует с бэкендом).
 */
function clearUsersListUI() {
  users.length = 0; // Очищаем локальный массив
  updateUI(); // Обновляем UI
  showMessage('Список UI очищен.');
}

// --- Инициализация приложения и обработка событий ---

/**
 * Асинхронная функция для инициализации MSAL и запуска основного кода приложения.
 * Это необходимо, так как msalInstance.initialize() является асинхронной операцией.
 */
async function initializeMsalAndApp() {
  try {
    // Обязательный вызов initialize() для MSAL.js.
    await msalInstance.initialize();

    // MSAL Event Handling (Обработка перенаправления после входа/выхода)
    // Этот код должен быть вызван после инициализации MSAL.
    msalInstance.handleRedirectPromise().then((response) => {
      if (response) {
        console.log('Ответ после перенаправления:', response);
        // Устанавливаем активную учетную запись после успешного перенаправления
        msalInstance.setActiveAccount(response.account);
        account = response.account;
        updateUI();
      } else {
        // Если нет ответа (т.е. это не перенаправление после логина),
        // пытаемся получить учетную запись из кэша (например, при перезагрузке страницы).
        const currentAccounts = msalInstance.getAllAccounts();
        if (currentAccounts && currentAccounts.length === 1) {
          account = currentAccounts[0];
          msalInstance.setActiveAccount(account);
          updateUI();
        } else if (currentAccounts && currentAccounts.length > 1) {
          // Если несколько учетных записей, для простоты берем первую.
          // В реальном приложении здесь может быть логика выбора аккаунта.
          account = currentAccounts[0];
          msalInstance.setActiveAccount(account);
          updateUI();
        }
      }
    }).catch((error: unknown) => {
      console.error('Ошибка перенаправления MSAL:', error);
      let errorMessageText = 'Произошла неизвестная ошибка при перенаправлении аутентификации.';
      if (error instanceof Error) {
        errorMessageText = `Ошибка аутентификации: ${error.message}`;
      }
      showMessage(errorMessageText, true);
    });

    // --- Слушатели событий для кнопок ---
    signInButton.addEventListener('click', signIn);
    signOutButton.addEventListener('click', signOut);
    getButton.addEventListener('click', getUsers);
    addButton.addEventListener('click', () => addUser(userNameInput.value.trim()));
    clearButton.addEventListener('click', clearUsersListUI);

    // Начальное обновление UI при загрузке приложения,
    // чтобы показать правильное состояние (войден/не вошел).
    updateUI();

  } catch (error: unknown) {
    // Обработка ошибок при инициализации MSAL или самого приложения.
    console.error('Не удалось инициализировать MSAL или приложение:', error);
    let errorMessageText = 'Не удалось инициализировать приложение.';
    if (error instanceof Error) {
        errorMessageText += ` Ошибка: ${error.message}`;
    }
    showMessage(errorMessageText, true);
  }
}

// Запускаем асинхронную функцию для инициализации всего приложения.
initializeMsalAndApp();