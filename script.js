// Global state
let currentPage = 'main';
let currentSearchQuery = '';
let currentChannelId = null;
let selectedRating = 0;
let isAdminLoggedIn = false;
let selectedTags = [];
let currentAdminTab = 'channels';
let currentUser = null;
let sessionToken = null;
let currentAdmin = null;

// Telegram WebApp Integration
// Telegram Widget Authentication
function onTelegramAuth(user) {
    console.log('Telegram authentication successful:', user);
    
    // Store user data
    currentUser = user;
    
    // Create session token (simple approach for now)
    sessionToken = generateSessionToken();
    localStorage.setItem('session_token', sessionToken);
    
    // Send user data to server
    authenticateWithTelegramWidget(user);
    
    // Update UI
    updateAuthUI();
    
    // Close modal
    closeLoginModal();
    
    showSuccess('Успешный вход через Telegram!');
}

// Generate simple session token
function generateSessionToken() {
    return 'tg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Helper function to get authorization headers
function getAuthHeaders() {
    if (currentUser && currentUser.id) {
        return {
            'x-user-id': currentUser.id.toString()
        };
    }
    return {};
}

// Authenticate with Telegram Widget data
async function authenticateWithTelegramWidget(user) {
    try {
        const response = await fetch('/api/telegram/widget-auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                id: user.id,
                first_name: user.first_name,
                last_name: user.last_name,
                username: user.username,
                photo_url: user.photo_url,
                auth_date: user.auth_date,
                hash: user.hash
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            console.log('Server authentication successful:', result);
            // Update current user
            currentUser = result.user;
            // Store user data locally
            localStorage.setItem('telegram_user', JSON.stringify(result.user));
            // Force UI update after successful authentication
            setTimeout(() => {
                updateAuthUI();
            }, 100);
            return true;
        } else {
            console.error('Server authentication failed:', result.error);
            return false;
        }
    } catch (error) {
        console.error('Error authenticating with server:', error);
        return false;
    }
}

// Get session token from localStorage
function getSessionToken() {
    if (!sessionToken) {
        sessionToken = localStorage.getItem('session_token');
    }
    return sessionToken;
}

// Check if user is authenticated
function isUserAuthenticated() {
    return currentUser !== null;
}

// Update UI based on authentication status
function updateAuthUI() {
    console.log('updateAuthUI called, currentUser:', currentUser, 'sessionToken:', sessionToken);
    
    const loginBtn = document.getElementById('loginBtn');
    const userStatus = document.getElementById('userStatus');
    const userName = document.getElementById('userName');
    const verifiedBadge = document.getElementById('verifiedBadge');
    
    if (isUserAuthenticated()) {
        console.log('User is authenticated, updating UI...');
        // User is logged in
        loginBtn.style.display = 'none';
        userStatus.classList.remove('hidden');
        
        // Update user info
        let displayName = currentUser.nickname || currentUser.first_name + (currentUser.last_name ? ' ' + currentUser.last_name : '');
        if (currentUser.is_admin) {
            displayName = '👑 ' + displayName;
        }
        userName.textContent = displayName;
        
        // Show verified badge if user is verified
        if (currentUser.is_verified) {
            verifiedBadge.classList.remove('hidden');
        } else {
            verifiedBadge.classList.add('hidden');
        }
        
        // Enable auth-required elements
        document.querySelectorAll('.auth-required').forEach(el => {
            el.classList.remove('auth-required');
        });
    } else {
        console.log('User is not authenticated, showing login button...');
        // User is not logged in
        loginBtn.style.display = 'flex';
        userStatus.classList.add('hidden');
        
        // Remove auth-required restrictions for channels and reviews
        document.querySelectorAll('.auth-required').forEach(el => {
            if (el.textContent.includes('Добавить канал') || el.textContent.includes('Оставить отзыв')) {
                el.classList.remove('auth-required');
            }
        });
    }
}

// Show login modal
function showLoginModal() {
    document.getElementById('loginModal').classList.remove('hidden');
}

// Close login modal
function closeLoginModal() {
    document.getElementById('loginModal').classList.add('hidden');
}

// Login with Telegram (now just shows modal with widget)
function loginWithTelegram() {
    showLoginModal();
}

// Logout user
async function logoutUser() {
    try {
        // Call server logout endpoint to clear cookie
        await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'include'
        });
    } catch (error) {
        console.error('Error logging out:', error);
    }
    
    currentUser = null;
    sessionToken = null;
    // Clear stored user data
    localStorage.removeItem('telegram_user');
    updateAuthUI();
    showSuccess('Вы вышли из аккаунта');
}

// Check authentication before performing actions
function requireAuth(action) {
    if (!isUserAuthenticated()) {
        showLoginModal();
        return false;
    }
    return true;
}

// Page navigation functions
function showMainPage() {
    hideAllPages();
    document.querySelector('.container').style.display = 'block';
    document.body.classList.add('main-page');
    currentPage = 'main';
}

function showSearchPage() {
    hideAllPages();
    document.getElementById('searchPage').classList.remove('hidden');
    currentPage = 'search';
    loadSearchResults();
}

function showAddChannelPage() {
    hideAllPages();
    document.getElementById('addChannelPage').classList.remove('hidden');
    currentPage = 'addChannel';
    loadTags();
}

function showChannelDetails(channelId) {
    hideAllPages();
    document.getElementById('channelDetailsPage').classList.remove('hidden');
    currentPage = 'channelDetails';
    currentChannelId = channelId;
    loadChannelDetails(channelId);
}

function hideAllPages() {
    document.querySelector('.container').style.display = 'none';
    document.getElementById('searchPage').classList.add('hidden');
    document.getElementById('addChannelPage').classList.add('hidden');
    document.getElementById('channelDetailsPage').classList.add('hidden');
    document.getElementById('adminPanelPage').classList.add('hidden');
    document.body.classList.remove('main-page');
}

// Enhanced main search functionality
async function performMainSearch() {
    const searchInput = document.getElementById('mainSearchInput');
    const query = searchInput.value.trim();
    currentSearchQuery = query;
    
    if (!query) {
        hideMainSearchResults();
        return;
    }
    
    try {
        // Show loading state
        const resultsContainer = document.getElementById('mainSearchResults');
        const resultsList = document.getElementById('mainResultsList');
        const resultsCount = document.getElementById('mainResultsCount');
        
        resultsCount.textContent = 'Поиск...';
        resultsList.innerHTML = '<div class="loading">Ищем каналы и теги...</div>';
        resultsContainer.classList.remove('hidden');
        
        // Search channels, tags, and channels by tag
        const [channelsResponse, tagsResponse, channelsByTagResponse] = await Promise.all([
            fetch(`/api/channels/search?q=${encodeURIComponent(query, { ...arguments[1], credentials: 'include' })}`),
            fetch(`/api/tags/search?q=${encodeURIComponent(query, { ...arguments[1], credentials: 'include' })}`),
            fetch(`/api/channels/by-tag?tag=${encodeURIComponent(query, { ...arguments[1], credentials: 'include' })}`)
        ]);
        
        const channels = await channelsResponse.json();
        const tags = await tagsResponse.json();
        const channelsByTag = await channelsByTagResponse.json();
        
        // Combine channels and remove duplicates
        const allChannels = [...channels, ...channelsByTag];
        const uniqueChannels = allChannels.filter((channel, index, self) => 
            index === self.findIndex(c => c.id === channel.id)
        );
        
        displayMainSearchResults(uniqueChannels, tags, query);
    } catch (error) {
        console.error('Error searching:', error);
        showError('Ошибка поиска');
    }
}

function displayMainSearchResults(channels, tags, query) {
    const resultsContainer = document.getElementById('mainSearchResults');
    const resultsList = document.getElementById('mainResultsList');
    const resultsCount = document.getElementById('mainResultsCount');
    
    const totalResults = channels.length + tags.length;
    resultsCount.textContent = `Найдено: ${channels.length} каналов, ${tags.length} тегов`;
    
    if (totalResults === 0) {
        resultsList.innerHTML = `
            <div class="no-results">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                </svg>
                <p>По запросу "${escapeHtml(query)}" ничего не найдено</p>
                <span>Попробуйте изменить запрос или использовать другие слова</span>
            </div>
        `;
    } else {
        let html = '';
        
        // Display tags first
        if (tags.length > 0) {
            html += `
                <div class="search-section">
                    <h4 class="search-section-title">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                            <line x1="7" y1="7" x2="7.01" y2="7"></line>
                        </svg>
                        Теги (${tags.length})
                    </h4>
                    <div class="tags-results">
                        ${tags.map(tag => `
                            <div class="tag-result" onclick="searchByTag('${escapeHtml(tag.name)}')">
                                <span class="tag-name">${escapeHtml(tag.name)}</span>
                                <span class="tag-count">${tag.channel_count} каналов</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        // Display channels
        if (channels.length > 0) {
            html += `
                <div class="search-section">
                    <h4 class="search-section-title">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                        Каналы (${channels.length})
                    </h4>
                    <div class="channels-results">
                        ${channels.map(channel => `
            <div class="result-card">
                                <div class="channel-header">
                <div class="channel-name">${escapeHtml(channel.title)}</div>
                                    <div class="channel-rating">
                    <div class="stars">${channel.stars}</div>
                                        <span class="rating-value">${channel.avg_rating}/5</span>
                </div>
                                </div>
                                <div class="channel-description">${escapeHtml(channel.description)}</div>
                                ${channel.tags && channel.tags.length > 0 ? `
                                    <div class="channel-tags">
                                        ${channel.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
                                    </div>
                                ` : ''}
                <button class="details-button" onclick="showChannelDetails(${channel.id})">
                    Подробнее
                </button>
            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        resultsList.innerHTML = html;
    }
    
    resultsContainer.classList.remove('hidden');
}

function hideMainSearchResults() {
    const resultsContainer = document.getElementById('mainSearchResults');
    resultsContainer.classList.add('hidden');
}

// Show random channel
async function showRandomChannel() {
    try {
        // Show loading state
        const resultsContainer = document.getElementById('mainSearchResults');
        const resultsList = document.getElementById('mainResultsList');
        const resultsCount = document.getElementById('mainResultsCount');
        
        resultsCount.textContent = 'Поиск случайного кф...';
        resultsList.innerHTML = '<div class="loading">Выбираем случайный кф...</div>';
        resultsContainer.classList.remove('hidden');
        
        // Get random channel
        const response = await fetch('/api/channels/random', { ...arguments[1], credentials: 'include' });
        const channel = await response.json();
        
        if (response.ok) {
            // Show the random channel
            resultsCount.textContent = 'Случайный кф';
            resultsList.innerHTML = `
                <div class="search-section">
                    <h4 class="search-section-title">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="1,4 1,10 7,10"></polyline>
                            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                        </svg>
                        Случайный кф
                    </h4>
                    <div class="channels-results">
                        <div class="result-card">
                            <div class="channel-header">
                                <div class="channel-name">${escapeHtml(channel.title)}</div>
                                <div class="channel-rating">
                                    <div class="stars">${channel.stars}</div>
                                    <span class="rating-value">${channel.avg_rating}/5</span>
                                </div>
                            </div>
                            <div class="channel-description">${escapeHtml(channel.description)}</div>
                            ${channel.tags && channel.tags.length > 0 ? `
                                <div class="channel-tags">
                                    ${channel.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
                                </div>
                            ` : ''}
                            <button class="details-button" onclick="showChannelDetails(${channel.id})">
                                Подробнее
                            </button>
                        </div>
                    </div>
                </div>
            `;
        } else {
            resultsCount.textContent = 'Ошибка';
            resultsList.innerHTML = `
                <div class="no-results">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="15" y1="9" x2="9" y2="15"></line>
                        <line x1="9" y1="9" x2="15" y2="15"></line>
                    </svg>
                    <p>Не удалось найти случайный кф</p>
                    <span>Попробуйте еще раз</span>
                </div>
            `;
        }
        
        resultsContainer.classList.remove('hidden');
    } catch (error) {
        console.error('Error getting random channel:', error);
        showError('Ошибка получения случайного кф');
    }
}

// Search by tag function
async function searchByTag(tagName) {
    try {
        // Show loading state
        const resultsContainer = document.getElementById('mainSearchResults');
        const resultsList = document.getElementById('mainResultsList');
        const resultsCount = document.getElementById('mainResultsCount');
        
        resultsCount.textContent = 'Поиск...';
        resultsList.innerHTML = '<div class="loading">Ищем каналы по тегу...</div>';
        resultsContainer.classList.remove('hidden');
        
        // Search channels by tag
        const response = await fetch(`/api/channels/by-tag?tag=${encodeURIComponent(tagName, { ...arguments[1], credentials: 'include' })}`);
        const channels = await response.json();
        
        // Display results
        resultsCount.textContent = `Найдено: ${channels.length} каналов по тегу "${tagName}"`;
        
        if (channels.length === 0) {
            resultsList.innerHTML = `
                <div class="no-results">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                        <line x1="7" y1="7" x2="7.01" y2="7"></line>
                    </svg>
                    <p>По тегу "${escapeHtml(tagName)}" каналы не найдены</p>
                </div>
            `;
        } else {
            resultsList.innerHTML = `
                <div class="search-section">
                    <h4 class="search-section-title">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                        Каналы с тегом "${escapeHtml(tagName)}" (${channels.length})
                    </h4>
                    <div class="channels-results">
                        ${channels.map(channel => `
                            <div class="result-card">
                                <div class="channel-header">
                                    <div class="channel-name">${escapeHtml(channel.title)}</div>
                                    <div class="channel-rating">
                                        <div class="stars">${channel.stars}</div>
                                        <span class="rating-value">${channel.avg_rating}/5</span>
                                    </div>
                                </div>
                                <div class="channel-description">${escapeHtml(channel.description)}</div>
                                ${channel.tags && channel.tags.length > 0 ? `
                                    <div class="channel-tags">
                                        ${channel.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
                                    </div>
                                ` : ''}
                                <button class="details-button" onclick="showChannelDetails(${channel.id})">
                                    Подробнее
                                </button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        resultsContainer.classList.remove('hidden');
    } catch (error) {
        console.error('Error searching by tag:', error);
        showError('Ошибка поиска по тегу');
    }
}

// Legacy search functionality (for separate search page)
async function loadSearchResults() {
    try {
        const response = await fetch('/api/channels', { ...arguments[1], credentials: 'include' });
        const channels = await response.json();
        displaySearchResults(channels);
    } catch (error) {
        console.error('Error loading channels:', error);
        showError('Ошибка загрузки каналов');
    }
}

async function performSearch() {
    const searchInput = document.getElementById('searchInput');
    const query = searchInput.value.trim();
    currentSearchQuery = query;
    
    if (!query) {
        loadSearchResults();
        return;
    }
    
    try {
        const response = await fetch(`/api/channels/search?q=${encodeURIComponent(query, { ...arguments[1], credentials: 'include' })}`);
        const channels = await response.json();
        displaySearchResults(channels);
    } catch (error) {
        console.error('Error searching channels:', error);
        showError('Ошибка поиска');
    }
}

function displaySearchResults(channels) {
    const resultsContainer = document.getElementById('searchResults');
    const resultsCount = document.getElementById('resultsCount');
    
    resultsCount.textContent = `Показано - ${channels.length} результатов`;
    
    if (channels.length === 0) {
        resultsContainer.innerHTML = '<div class="loading">Каналы не найдены</div>';
        return;
    }
    
    resultsContainer.innerHTML = channels.map(channel => `
        <div class="result-card">
            <div class="channel-name">${escapeHtml(channel.title)}</div>
            <div class="channel-description">${escapeHtml(channel.description)}</div>
            <div class="rating-section">
                <span class="rating-label">Рейтинг:</span>
                <div class="stars">${channel.stars}</div>
                <span class="rating-text">(${channel.avg_rating}/5)</span>
            </div>
            <button class="details-button" onclick="showChannelDetails(${channel.id})">
                Подробнее
            </button>
        </div>
    `).join('');
}

// Channel details functionality
async function loadChannelDetails(channelId) {
    try {
        const response = await fetch(`/api/channels/${channelId}`, { ...arguments[1], credentials: 'include' });
        const channel = await response.json();
        displayChannelDetails(channel);
    } catch (error) {
        console.error('Error loading channel details:', error);
        showError('Ошибка загрузки деталей канала');
    }
}

function displayChannelDetails(channel) {
    const detailsContainer = document.getElementById('channelDetails');
    
    detailsContainer.innerHTML = `
        <div class="detail-card">
            <h2 class="detail-title">${escapeHtml(channel.title)}</h2>
            <p class="detail-description">${escapeHtml(channel.description)}</p>
            <a href="${channel.link}" target="_blank" class="detail-link">
                Перейти в канал
            </a>
            <div class="detail-rating">
                <span class="rating-label">Рейтинг:</span>
                <div class="stars">${channel.stars}</div>
                <span class="rating-text">(${channel.avg_rating}/5)</span>
            </div>
        </div>
        
        <div class="reviews-section">
            <h3 class="reviews-title">Отзывы (${channel.review_count})</h3>
            <div id="reviewsList">
                ${channel.reviews.map(review => `
                    <div class="review-card">
                        <div class="review-header">
                            <span class="review-nickname">
                                ${review.is_anonymous ? 'Анонимно' : (review.nickname || 'Пользователь')}
                                ${review.user_id ? '<span class="verified-badge" title="Авторизованный пользователь">✓</span>' : ''}
                            </span>
                            <span class="review-date">${formatDate(review.created_at)}</span>
                        </div>
                        <div class="review-rating">
                            ${generateStarsHTML(review.rating)}
                        </div>
                        <p class="review-text">${escapeHtml(review.text)}</p>
                    </div>
                `).join('')}
            </div>
            
            <div class="add-review-form">
                <h4 class="add-review-title">Добавить отзыв</h4>
                <form id="addReviewForm">
                    <div class="review-form-group">
                        <label>Оценка:</label>
                        <div class="rating-input">
                            ${[1,2,3,4,5].map(i => `
                                <button type="button" class="rating-star" data-rating="${i}" onclick="setRating(${i})">
                                    <svg viewBox="0 0 24 24">
                                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                                    </svg>
                                </button>
                            `).join('')}
                        </div>
                    </div>
                    
                    <div class="review-form-group">
                        <label for="reviewNickname">Ваш ник (необязательно):</label>
                        <input type="text" id="reviewNickname" class="form-input" placeholder="Введите ваш ник или оставьте пустым для анонимности" maxlength="50">
                    </div>
                    
                    <div class="review-form-group">
                        <label for="reviewText">Текст отзыва:</label>
                        <textarea id="reviewText" class="form-textarea" placeholder="Оставьте свой отзыв..." required></textarea>
                    </div>
                    
                    <div class="review-form-group">
                        <label class="checkbox-label">
                            <input type="checkbox" id="anonymousReview" class="form-checkbox">
                            <span class="checkbox-text">Оставить отзыв анонимно</span>
                        </label>
                    </div>
                    
                    <div class="review-form-group">
                        <p class="user-info-display" id="userInfoDisplay">
                            ${isUserAuthenticated() ? 'Отзыв будет добавлен от вашего имени в Telegram ✓' : 'Отзыв будет добавлен анонимно'}
                        </p>
                    </div>
                    
                    <button type="submit" class="submit-button">Добавить отзыв</button>
                </form>
            </div>
        </div>
    `;
    
    // Add form submit handler
    document.getElementById('addReviewForm').addEventListener('submit', handleAddReview);
    
    // Add anonymous review checkbox handler
    document.getElementById('anonymousReview').addEventListener('change', function() {
        const userInfoDisplay = document.getElementById('userInfoDisplay');
        const nicknameField = document.getElementById('reviewNickname');
        
        if (this.checked) {
            userInfoDisplay.textContent = 'Отзыв будет добавлен анонимно';
            nicknameField.disabled = true;
            nicknameField.value = '';
        } else {
            nicknameField.disabled = false;
            if (isUserAuthenticated()) {
                userInfoDisplay.textContent = 'Отзыв будет добавлен от вашего имени в Telegram ✓';
            } else {
                userInfoDisplay.textContent = 'Отзыв будет добавлен с указанным ником или анонимно';
            }
        }
    });
    
    // Add nickname field handler
    document.getElementById('reviewNickname').addEventListener('input', function() {
        const userInfoDisplay = document.getElementById('userInfoDisplay');
        const anonymousCheckbox = document.getElementById('anonymousReview');
        
        if (!anonymousCheckbox.checked) {
            if (this.value.trim()) {
                if (isUserAuthenticated()) {
                    userInfoDisplay.textContent = `Отзыв будет добавлен от ${this.value} (Telegram ✓)`;
                } else {
                    userInfoDisplay.textContent = `Отзыв будет добавлен от ${this.value}`;
                }
            } else {
                if (isUserAuthenticated()) {
                    userInfoDisplay.textContent = 'Отзыв будет добавлен от вашего имени в Telegram ✓';
                } else {
                    userInfoDisplay.textContent = 'Отзыв будет добавлен анонимно';
                }
            }
        }
    });
}

// Add channel functionality
async function loadTags() {
    try {
        const response = await fetch('/api/tags', { ...arguments[1], credentials: 'include' });
        const tags = await response.json();
        displayTags(tags);
    } catch (error) {
        console.error('Error loading tags:', error);
    }
}

function displayTags(tags) {
    const tagsSelect = document.getElementById('channelTags');
    tagsSelect.innerHTML = '<option value="">Выберите теги</option>' +
        tags.map(tag => `<option value="${tag.id}">${escapeHtml(tag.name)}</option>`).join('');
}

// Form handlers
document.getElementById('addChannelForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const channelData = {
        title: document.getElementById('channelName').value,
        description: document.getElementById('channelDescription').value,
        link: document.getElementById('channelLink').value,
        tags: Array.from(document.getElementById('channelTags').selectedOptions).map(option => option.value).filter(v => v)
    };
    
    try {
        const response = await fetch('/api/channels', {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(channelData)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showSuccess(result.message);
            e.target.reset();
        } else {
            showError(result.error);
        }
    } catch (error) {
        console.error('Error adding channel:', error);
        showError('Ошибка добавления канала');
    }
});

async function handleAddReview(e) {
    e.preventDefault();
    
    if (selectedRating === 0) {
        showError('Пожалуйста, выберите оценку');
        return;
    }
    
    const nickname = document.getElementById('reviewNickname').value.trim();
    const isAnonymous = document.getElementById('anonymousReview').checked;
    
    const reviewData = {
        text: document.getElementById('reviewText').value,
        rating: selectedRating,
        is_anonymous: isAnonymous,
        nickname: nickname
    };
    
    try {
        const response = await fetch(`/api/channels/${currentChannelId}/reviews`, {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(reviewData)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showSuccess(result.message);
            e.target.reset();
            selectedRating = 0;
            updateRatingStars();
            // Reload channel details to show new review
            loadChannelDetails(currentChannelId);
        } else {
            showError(result.error);
        }
    } catch (error) {
        console.error('Error adding review:', error);
        showError('Ошибка добавления отзыва');
    }
}

// Rating functionality
function setRating(rating) {
    selectedRating = rating;
    updateRatingStars();
}

function updateRatingStars() {
    const stars = document.querySelectorAll('.rating-star');
    stars.forEach((star, index) => {
        if (index < selectedRating) {
            star.classList.add('active');
        } else {
            star.classList.remove('active');
        }
    });
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function generateStarsHTML(rating) {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
    
    let stars = '';
    for (let i = 0; i < fullStars; i++) {
        stars += '<svg class="star" width="14" height="14" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#fbbf24"/></svg>';
    }
    if (hasHalfStar) {
        stars += '<svg class="star half" width="14" height="14" viewBox="0 0 24 24"><defs><linearGradient id="half-star"><stop offset="50%" stop-color="#fbbf24"/><stop offset="50%" stop-color="#4b5563"/></linearGradient></defs><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="url(#half-star)"/></svg>';
    }
    for (let i = 0; i < emptyStars; i++) {
        stars += '<svg class="star" width="14" height="14" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#4b5563"/></svg>';
    }
    return stars;
}

function showError(message) {
    showMessage(message, 'error');
}

function showSuccess(message) {
    showMessage(message, 'success');
}

function showMessage(message, type) {
    // Remove existing messages
    const existingMessages = document.querySelectorAll('.error, .success');
    existingMessages.forEach(msg => msg.remove());
    
    // Create new message
    const messageDiv = document.createElement('div');
    messageDiv.className = type;
    messageDiv.textContent = message;
    
    // Insert at the top of the current page
    const currentPageElement = document.querySelector('.page:not(.hidden)') || document.querySelector('.container');
    currentPageElement.insertBefore(messageDiv, currentPageElement.firstChild);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.remove();
        }
    }, 5000);
}

// Search input event listeners
document.getElementById('searchInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        performSearch();
    }
});

// Main search input event listeners
document.getElementById('mainSearchInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        performMainSearch();
    }
});

document.getElementById('mainSearchInput').addEventListener('input', (e) => {
    const query = e.target.value.trim();
    if (query.length > 2) {
        performMainSearch();
    } else if (query.length === 0) {
        hideMainSearchResults();
    }
});

// Admin panel placeholder
function showAdminPanel() {
    // Show admin panel page first
    hideAllPages();
    document.getElementById('adminPanelPage').classList.remove('hidden');
    currentPage = 'adminPanel';
    
    // Always show login form first, hide dashboard completely
    document.getElementById('adminLoginForm').style.display = 'block';
    document.getElementById('adminDashboard').style.display = 'none';
    document.getElementById('logoutBtn').style.display = 'none';
    
    // Clear any previous login attempts
    document.getElementById('adminUsername').value = '';
    document.getElementById('adminPassword').value = '';
    
    // Reset admin login state
    isAdminLoggedIn = false;
}

// Admin Panel Functions
async function handleAdminLogin(e) {
    e.preventDefault();
    
    const username = document.getElementById('adminUsername').value;
    const password = document.getElementById('adminPassword').value;
    
    try {
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            
            credentials: 'include',
            body: JSON.stringify({ username, password })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            isAdminLoggedIn = true;
            currentAdmin = result.admin; // Store admin info
            // Hide login form and show dashboard ONLY after successful login
            document.getElementById('adminLoginForm').style.display = 'none';
            document.getElementById('adminDashboard').style.display = 'block';
            document.getElementById('logoutBtn').style.display = 'block';
            loadAdminContent();
            showSuccess('Успешный вход в админ-панель');
        } else {
            showError(result.error);
            // Keep login form visible on error, ensure dashboard is hidden
            document.getElementById('adminLoginForm').style.display = 'block';
            document.getElementById('adminDashboard').style.display = 'none';
            document.getElementById('logoutBtn').style.display = 'none';
            isAdminLoggedIn = false;
        }
    } catch (error) {
        console.error('Error logging in:', error);
        showError('Ошибка входа в админ-панель');
        // Keep login form visible on error, ensure dashboard is hidden
        document.getElementById('adminLoginForm').style.display = 'block';
        document.getElementById('adminDashboard').style.display = 'none';
        document.getElementById('logoutBtn').style.display = 'none';
        isAdminLoggedIn = false;
    }
}

function logoutAdmin() {
    isAdminLoggedIn = false;
    document.getElementById('adminLoginForm').style.display = 'block';
    document.getElementById('adminDashboard').style.display = 'none';
    document.getElementById('logoutBtn').style.display = 'none';
    showSuccess('Вы вышли из админ-панели');
}

async function loadAdminContent() {
    // Check if admin is logged in
    if (!isAdminLoggedIn) {
        showError('Необходима авторизация');
        return;
    }
    await showAdminTab(currentAdminTab);
}

function showAdminTab(tab) {
    currentAdminTab = tab;
    
    // Update tab buttons
    document.querySelectorAll('.admin-tab').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    // Load content based on tab
    switch(tab) {
        case 'channels':
            loadAdminChannels();
            break;
        case 'channels-moderation':
            loadAdminChannelsModeration();
            break;
        case 'reviews':
            loadAdminReviews();
            break;
        case 'reviews-moderation':
            loadAdminReviewsModeration();
            break;
        case 'tags':
            loadAdminTags();
            break;
        case 'users':
            loadAdminUsers();
            break;
        case 'statistics':
            loadAdminStatistics();
            break;
        case 'admins':
            loadAdminAdmins();
            break;
    }
}

async function loadAdminChannels() {
    try {
        const response = await fetch('/api/admin/channels', { ...arguments[1], credentials: 'include' });
        const channels = await response.json();
        displayAdminChannels(channels);
    } catch (error) {
        console.error('Error loading admin channels:', error);
        showError('Ошибка загрузки каналов');
    }
}

function displayAdminChannels(channels) {
    const content = document.getElementById('adminContent');
    
    content.innerHTML = channels.map(channel => `
        <div class="admin-item">
            <div class="admin-item-info">
                <div class="admin-item-title">${escapeHtml(channel.title)}</div>
                <div class="admin-item-details">${escapeHtml(channel.description)}</div>
                <div class="admin-item-details">Ссылка: ${escapeHtml(channel.link)}</div>
                <div class="admin-item-details">Создан: ${formatDate(channel.created_at)}</div>
                ${channel.first_name ? `
                    <div class="admin-item-details">
                        Пользователь: ${channel.first_name} ${channel.last_name || ''} 
                        ${channel.username ? `(@${channel.username})` : ''}
                        ${channel.telegram_id ? `[ID: ${channel.telegram_id}]` : ''}
                    </div>
                ` : '<div class="admin-item-details">Пользователь: Анонимный</div>'}
                <span class="admin-item-status ${channel.status}">${channel.status}</span>
            </div>
            <div class="admin-item-actions">
                <button class="admin-action-btn edit" onclick="editChannel(${channel.id})" title="Редактировать">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>
                <button class="admin-action-btn approve" onclick="approveChannel(${channel.id})" title="Одобрить">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20,6 9,17 4,12"></polyline>
                    </svg>
                </button>
                <button class="admin-action-btn delete" onclick="deleteChannel(${channel.id})" title="Удалить">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3,6 5,6 21,6"></polyline>
                        <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                    </svg>
                </button>
            </div>
        </div>
    `).join('');
}

async function loadAdminReviews() {
    try {
        const response = await fetch('/api/admin/reviews', { ...arguments[1], credentials: 'include' });
        const reviews = await response.json();
        displayAdminReviews(reviews);
    } catch (error) {
        console.error('Error loading admin reviews:', error);
        showError('Ошибка загрузки отзывов');
    }
}

function displayAdminReviews(reviews) {
    const content = document.getElementById('adminContent');
    
    content.innerHTML = reviews.map(review => `
        <div class="admin-item">
            <div class="admin-item-info">
                <div class="admin-item-title">Отзыв #${review.id}</div>
                <div class="admin-item-details">Канал: ${escapeHtml(review.channel_title)}</div>
                <div class="admin-item-details">Автор: ${review.nickname || 'Анонимный пользователь'}</div>
                ${review.first_name ? `
                    <div class="admin-item-details">
                        Telegram: ${review.first_name} ${review.last_name || ''} 
                        ${review.username ? `(@${review.username})` : ''}
                        ${review.telegram_id ? `[ID: ${review.telegram_id}]` : ''}
                    </div>
                ` : ''}
                <div class="admin-item-details">Рейтинг: ${review.rating}/5</div>
                <div class="admin-item-details">Текст: ${escapeHtml(review.text)}</div>
                <div class="admin-item-details">Создан: ${formatDate(review.created_at)}</div>
                <span class="admin-item-status ${review.status}">${review.status}</span>
            </div>
            <div class="admin-item-actions">
                <button class="admin-action-btn approve" onclick="approveReview(${review.id})" title="Одобрить">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20,6 9,17 4,12"></polyline>
                    </svg>
                </button>
                <button class="admin-action-btn delete" onclick="deleteReview(${review.id})" title="Удалить">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3,6 5,6 21,6"></polyline>
                        <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                    </svg>
                </button>
            </div>
        </div>
    `).join('');
}

async function loadAdminTags() {
    try {
        const response = await fetch('/api/admin/tags', { ...arguments[1], credentials: 'include' });
        const tags = await response.json();
        displayAdminTags(tags);
    } catch (error) {
        console.error('Error loading admin tags:', error);
        showError('Ошибка загрузки тегов');
    }
}

function displayAdminTags(tags) {
    const content = document.getElementById('adminContent');
    
    content.innerHTML = `
        <div class="admin-item">
            <div class="admin-item-info">
                <div class="admin-item-title">Управление тегами</div>
                <div class="admin-item-details">Всего тегов: ${tags.length}</div>
            </div>
            <div class="admin-item-actions">
                <button class="admin-action-btn approve" onclick="openAddTagModal()" title="Добавить тег">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                </button>
            </div>
        </div>
    ` + tags.map(tag => `
        <div class="admin-item">
            <div class="admin-item-info">
                <div class="admin-item-title">${escapeHtml(tag.name)}</div>
                <div class="admin-item-details">ID: ${tag.id}</div>
                <span class="admin-item-status ${tag.status}">${tag.status}</span>
            </div>
            <div class="admin-item-actions">
                <button class="admin-action-btn edit" onclick="editTag(${tag.id})" title="Редактировать">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>
                <button class="admin-action-btn delete" onclick="deleteTag(${tag.id})" title="Удалить">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3,6 5,6 21,6"></polyline>
                        <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                    </svg>
                </button>
            </div>
        </div>
    `).join('');
}

async function performAdminSearch() {
    const query = document.getElementById('adminSearchInput').value.trim();
    
    if (!query) {
        loadAdminContent();
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/search?q=${encodeURIComponent(query, { ...arguments[1], credentials: 'include' })}`);
        const results = await response.json();
        displayAdminSearchResults(results);
    } catch (error) {
        console.error('Error performing admin search:', error);
        showError('Ошибка поиска');
    }
}

function displayAdminSearchResults(results) {
    const content = document.getElementById('adminContent');
    
    let html = '<div class="admin-item"><div class="admin-item-info"><div class="admin-item-title">Результаты поиска</div><div class="admin-item-details">Найдено: ' + results.length + ' результатов</div></div></div>';
    
    results.forEach(item => {
        if (item.type === 'channel') {
            html += `
                <div class="admin-item">
                    <div class="admin-item-info">
                        <div class="admin-item-title">Канал: ${escapeHtml(item.title)}</div>
                        <div class="admin-item-details">${escapeHtml(item.description)}</div>
                        <span class="admin-item-status ${item.status}">${item.status}</span>
                    </div>
                    <div class="admin-item-actions">
                        <button class="admin-action-btn edit" onclick="editChannel(${item.id})" title="Редактировать">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="admin-action-btn delete" onclick="deleteChannel(${item.id})" title="Удалить">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3,6 5,6 21,6"></polyline>
                                <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
        }
    });
    
    content.innerHTML = html;
}

// Admin Actions
async function approveChannel(channelId) {
    try {
        const response = await fetch(`/api/admin/channels/${channelId}/approve`, {
            method: 'POST'
        });
        
        if (response.ok) {
            showSuccess('Канал одобрен');
            // Reload the current tab content
            if (currentAdminTab === 'channels-moderation') {
                loadAdminChannelsModeration();
            } else {
                loadAdminChannels();
            }
        } else {
            showError('Ошибка одобрения канала');
        }
    } catch (error) {
        console.error('Error approving channel:', error);
        showError('Ошибка одобрения канала');
    }
}

async function deleteChannel(channelId) {
    if (!confirm('Вы уверены, что хотите удалить этот канал?')) return;
    
    try {
        const response = await fetch(`/api/admin/channels/${channelId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showSuccess('Канал удален');
            // Reload the current tab content
            if (currentAdminTab === 'channels-moderation') {
                loadAdminChannelsModeration();
            } else {
                loadAdminChannels();
            }
        } else {
            showError('Ошибка удаления канала');
        }
    } catch (error) {
        console.error('Error deleting channel:', error);
        showError('Ошибка удаления канала');
    }
}

async function approveReview(reviewId) {
    try {
        const response = await fetch(`/api/admin/reviews/${reviewId}/approve`, {
            method: 'POST'
        });
        
        if (response.ok) {
            showSuccess('Отзыв одобрен');
            // Reload the current tab content
            if (currentAdminTab === 'reviews-moderation') {
                loadAdminReviewsModeration();
            } else {
                loadAdminReviews();
            }
        } else {
            showError('Ошибка одобрения отзыва');
        }
    } catch (error) {
        console.error('Error approving review:', error);
        showError('Ошибка одобрения отзыва');
    }
}

async function deleteReview(reviewId) {
    if (!confirm('Вы уверены, что хотите удалить этот отзыв?')) return;
    
    try {
        const response = await fetch(`/api/admin/reviews/${reviewId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showSuccess('Отзыв удален');
            // Reload the current tab content
            if (currentAdminTab === 'reviews-moderation') {
                loadAdminReviewsModeration();
            } else {
                loadAdminReviews();
            }
        } else {
            showError('Ошибка удаления отзыва');
        }
    } catch (error) {
        console.error('Error deleting review:', error);
        showError('Ошибка удаления отзыва');
    }
}

async function deleteTag(tagId) {
    if (!confirm('Вы уверены, что хотите удалить этот тег?')) return;
    
    try {
        const response = await fetch(`/api/admin/tags/${tagId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showSuccess('Тег удален');
            loadAdminTags();
        } else {
            showError('Ошибка удаления тега');
        }
    } catch (error) {
        console.error('Error deleting tag:', error);
        showError('Ошибка удаления тега');
    }
}

// Tags Management
function addSelectedTag() {
    const select = document.getElementById('channelTags');
    const tagId = select.value;
    const tagName = select.options[select.selectedIndex].text;
    
    if (!tagId || selectedTags.includes(tagId)) return;
    
    selectedTags.push(tagId);
    updateSelectedTagsDisplay();
    select.value = '';
}

function removeSelectedTag(tagId) {
    selectedTags = selectedTags.filter(id => id !== tagId);
    updateSelectedTagsDisplay();
}

function updateSelectedTagsDisplay() {
    const container = document.getElementById('selectedTags');
    
    if (selectedTags.length === 0) {
        container.innerHTML = '<div style="color: #9ca3af; font-size: 14px; text-align: center; padding: 8px;">Выберите теги для канала</div>';
        return;
    }
    
    container.innerHTML = selectedTags.map(tagId => {
        const select = document.getElementById('channelTags');
        const option = select.querySelector(`option[value="${tagId}"]`);
        const tagName = option ? option.text : 'Неизвестный тег';
        
        return `
            <div class="tag-item">
                <span>${escapeHtml(tagName)}</span>
                <button class="tag-remove" onclick="removeSelectedTag('${tagId}')">×</button>
            </div>
        `;
    }).join('');
}

function openAddTagModal() {
    document.getElementById('addTagModal').classList.remove('hidden');
}

function closeAddTagModal() {
    document.getElementById('addTagModal').classList.add('hidden');
    document.getElementById('addTagForm').reset();
}

async function handleAddTag(e) {
    e.preventDefault();
    
    const tagName = document.getElementById('tagName').value.trim();
    
    if (!tagName) return;
    
    try {
        const response = await fetch('/api/admin/tags', {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            
            credentials: 'include',
            body: JSON.stringify({ name: tagName })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showSuccess('Тег добавлен');
            closeAddTagModal();
            loadTags(); // Reload tags in add channel form
            if (currentPage === 'adminPanel') {
                loadAdminTags();
            }
        } else {
            showError(result.error);
        }
    } catch (error) {
        console.error('Error adding tag:', error);
        showError('Ошибка добавления тега');
    }
}

// Update form handlers
document.getElementById('addChannelForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const channelData = {
        title: document.getElementById('channelName').value,
        description: document.getElementById('channelDescription').value,
        link: document.getElementById('channelLink').value,
        tags: selectedTags
    };
    
    try {
        const response = await fetch('/api/channels', {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            
            credentials: 'include',
            body: JSON.stringify(channelData)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showSuccess(result.message);
            e.target.reset();
            selectedTags = [];
            updateSelectedTagsDisplay();
        } else {
            showError(result.error);
        }
    } catch (error) {
        console.error('Error adding channel:', error);
        showError('Ошибка добавления канала');
    }
});

// Admin Management Functions
async function loadAdminAdmins() {
    try {
        const response = await fetch('/api/admin/admins', { ...arguments[1], credentials: 'include' });
        const admins = await response.json();
        displayAdminAdmins(admins);
    } catch (error) {
        console.error('Error loading admins:', error);
        showError('Ошибка загрузки админов');
    }
}

function displayAdminAdmins(admins) {
    const content = document.getElementById('adminContent');
    
    content.innerHTML = `
        <div style="margin-bottom: 20px;">
            <button class="submit-button" onclick="openAddAdminModal()" style="margin: 0;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Добавить админа
            </button>
        </div>
        ${admins.map(admin => `
            <div class="admin-item">
                <div class="admin-item-info">
                    <div class="admin-item-title">${escapeHtml(admin.username)}</div>
                    <div class="admin-item-details">ID: ${admin.id}</div>
                    <div class="admin-item-details">Создан: ${formatDate(admin.created_at)}</div>
                    <div class="admin-item-details">
                        Telegram ID: ${admin.telegram_user_id ? admin.telegram_user_id : 'Не привязан'}
                    </div>
                    <span class="admin-item-status approved">Админ</span>
                </div>
                <div class="admin-item-actions">
                    ${admin.telegram_user_id ? `
                        <button class="admin-action-btn unlink" onclick="unlinkAdminTelegram(${admin.id})" title="Отвязать Telegram ID">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                            </svg>
                        </button>
                    ` : `
                        <button class="admin-action-btn link" onclick="linkAdminTelegram(${admin.id})" title="Привязать Telegram ID">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                            </svg>
                        </button>
                    `}
                    <button class="admin-action-btn delete" onclick="deleteAdmin(${admin.id})" title="Удалить админа">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3,6 5,6 21,6"></polyline>
                            <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `).join('')}
    `;
}

// Load channels pending moderation
async function loadAdminChannelsModeration() {
    try {
        const response = await fetch('/api/admin/channels?status=pending', { ...arguments[1], credentials: 'include' });
        const channels = await response.json();
        displayAdminChannelsModeration(channels);
    } catch (error) {
        console.error('Error loading channels for moderation:', error);
        showError('Ошибка загрузки каналов на модерации');
    }
}

function displayAdminChannelsModeration(channels) {
    const content = document.getElementById('adminContent');
    
    if (channels.length === 0) {
        content.innerHTML = '<div class="no-data">Нет каналов на модерации</div>';
        return;
    }
    
    content.innerHTML = channels.map(channel => `
        <div class="admin-item">
            <div class="admin-item-info">
                <div class="admin-item-title">${escapeHtml(channel.title)}</div>
                <div class="admin-item-details">${escapeHtml(channel.description)}</div>
                <div class="admin-item-details">
                    <a href="${channel.link}" target="_blank" class="channel-link">${channel.link}</a>
                </div>
                <div class="admin-item-details">Добавлен: ${formatDate(channel.created_at)}</div>
                <div class="admin-item-details">Автор: ${channel.user_id ? `ID: ${channel.user_id}` : 'Анонимно'}</div>
                <span class="admin-item-status pending">На модерации</span>
            </div>
            <div class="admin-item-actions">
                <button class="admin-action-btn approve" onclick="approveChannel(${channel.id})" title="Одобрить">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20,6 9,17 4,12"></polyline>
                    </svg>
                </button>
                <button class="admin-action-btn reject" onclick="rejectChannel(${channel.id})" title="Отклонить">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        </div>
    `).join('');
}

// Load reviews pending moderation
async function loadAdminReviewsModeration() {
    try {
        const response = await fetch('/api/admin/reviews?status=pending', { ...arguments[1], credentials: 'include' });
        const reviews = await response.json();
        displayAdminReviewsModeration(reviews);
    } catch (error) {
        console.error('Error loading reviews for moderation:', error);
        showError('Ошибка загрузки отзывов на модерации');
    }
}

function displayAdminReviewsModeration(reviews) {
    const content = document.getElementById('adminContent');
    
    if (reviews.length === 0) {
        content.innerHTML = '<div class="no-data">Нет отзывов на модерации</div>';
        return;
    }
    
    content.innerHTML = reviews.map(review => `
        <div class="admin-item">
            <div class="admin-item-info">
                <div class="admin-item-title">Отзыв на канал: ${escapeHtml(review.channel_title)}</div>
                <div class="admin-item-details">Автор: ${review.is_anonymous ? 'Анонимно' : (review.nickname || 'Пользователь')}</div>
                <div class="admin-item-details">Оценка: ${generateStarsHTML(review.rating)}</div>
                <div class="admin-item-details">${escapeHtml(review.text)}</div>
                <div class="admin-item-details">Добавлен: ${formatDate(review.created_at)}</div>
                <span class="admin-item-status pending">На модерации</span>
            </div>
            <div class="admin-item-actions">
                <button class="admin-action-btn approve" onclick="approveReview(${review.id})" title="Одобрить">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20,6 9,17 4,12"></polyline>
                    </svg>
                </button>
                <button class="admin-action-btn reject" onclick="rejectReview(${review.id})" title="Отклонить">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        </div>
    `).join('');
}

function openAddAdminModal() {
    document.getElementById('addAdminModal').classList.remove('hidden');
}

function closeAddAdminModal() {
    document.getElementById('addAdminModal').classList.add('hidden');
    document.getElementById('addAdminForm').reset();
}

async function handleAddAdmin(e) {
    e.preventDefault();
    
    const username = document.getElementById('adminUsername').value.trim();
    const password = document.getElementById('adminPassword').value;
    const passwordConfirm = document.getElementById('adminPasswordConfirm').value;
    
    if (!username || !password) {
        showError('Заполните все поля');
        return;
    }
    
    if (password !== passwordConfirm) {
        showError('Пароли не совпадают');
        return;
    }
    
    if (password.length < 6) {
        showError('Пароль должен содержать минимум 6 символов');
        return;
    }
    
    try {
        const response = await fetch('/api/admin/admins', {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            
            credentials: 'include',
            body: JSON.stringify({ username, password })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showSuccess(result.message);
            closeAddAdminModal();
            loadAdminAdmins(); // Reload admins list
        } else {
            showError(result.error);
        }
    } catch (error) {
        console.error('Error adding admin:', error);
        showError('Ошибка добавления админа');
    }
}

async function deleteAdmin(adminId) {
    if (!confirm('Вы уверены, что хотите удалить этого админа?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/admins/${adminId}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showSuccess(result.message);
            loadAdminAdmins(); // Reload admins list
        } else {
            showError(result.error);
        }
    } catch (error) {
        console.error('Error deleting admin:', error);
        showError('Ошибка удаления админа');
    }
}

// Admin Users Functions
async function loadAdminUsers() {
    try {
        const response = await fetch('/api/admin/users?page=1&limit=50', { ...arguments[1], credentials: 'include' });
        const data = await response.json();
        displayAdminUsers(data.users, data.pagination);
    } catch (error) {
        console.error('Error loading users:', error);
        showError('Ошибка загрузки пользователей');
    }
}

function displayAdminUsers(users, pagination) {
    const content = document.getElementById('adminContent');
    
    content.innerHTML = `
        <div class="admin-stats-header">
            <h3>Пользователи (${pagination.total} всего)</h3>
            <div class="pagination-info">
                Страница ${pagination.page} из ${pagination.pages}
            </div>
        </div>
        ${users.map(user => `
            <div class="admin-item">
                <div class="admin-item-info">
                    <div class="admin-item-title">
                        ${user.first_name || ''} ${user.last_name || ''} 
                        ${user.username ? `(@${user.username})` : ''}
                        ${user.is_verified ? '<span class="verified-badge">✓</span>' : ''}
                        ${user.is_admin ? '<span class="admin-badge">👑</span>' : ''}
                    </div>
                    <div class="admin-item-details">ID: ${user.telegram_id}</div>
                    <div class="admin-item-details">Язык: ${user.language_code || 'Не указан'}</div>
                    <div class="admin-item-details">Premium: ${user.is_premium ? 'Да' : 'Нет'}</div>
                    <div class="admin-item-details">Устройство: ${user.device_type || 'Неизвестно'}</div>
                    <div class="admin-item-details">Браузер: ${user.browser || 'Неизвестно'}</div>
                    <div class="admin-item-details">ОС: ${user.os || 'Неизвестно'}</div>
                    <div class="admin-item-details">Сессий: ${user.total_sessions || 0}</div>
                    <div class="admin-item-details">Запросов: ${user.total_requests || 0}</div>
                    <div class="admin-item-details">Отзывов: ${user.reviews_count || 0}</div>
                    <div class="admin-item-details">Избранных: ${user.favorites_count || 0}</div>
                    <div class="admin-item-details">Регистрация: ${formatDate(user.created_at)}</div>
                    <div class="admin-item-details">Последний визит: ${formatDate(user.last_seen)}</div>
                    <div class="admin-item-details">Последняя активность: ${formatDate(user.last_activity)}</div>
                    ${user.is_blocked ? `
                        <div class="admin-item-details" style="color: #ef4444;">
                            <strong>Заблокирован:</strong> ${user.blocked_reason || 'Причина не указана'}
                        </div>
                    ` : ''}
                </div>
                <div class="admin-item-actions">
                    <button class="admin-action-btn view" onclick="viewUserDetails(${user.telegram_id})" title="Подробнее">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                    </button>
                    ${!user.is_verified ? `
                        <button class="admin-action-btn verify" onclick="verifyUser(${user.telegram_id})" title="Верифицировать">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="20,6 9,17 4,12"></polyline>
                            </svg>
                        </button>
                    ` : `
                        <button class="admin-action-btn unverify" onclick="unverifyUser(${user.telegram_id})" title="Снять верификацию">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    `}
                    ${!user.is_blocked ? `
                        <button class="admin-action-btn block" onclick="blockUser(${user.telegram_id})" title="Заблокировать">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <circle cx="12" cy="16" r="1"></circle>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                            </svg>
                        </button>
                    ` : `
                        <button class="admin-action-btn unblock" onclick="unblockUser(${user.telegram_id})" title="Разблокировать">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <circle cx="12" cy="16" r="1"></circle>
                                <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                            </svg>
                        </button>
                    `}
                </div>
            </div>
        `).join('')}
    `;
}

// Admin Statistics Functions
async function loadAdminStatistics() {
    try {
        const response = await fetch('/api/admin/statistics', { ...arguments[1], credentials: 'include' });
        const stats = await response.json();
        displayAdminStatistics(stats);
    } catch (error) {
        console.error('Error loading statistics:', error);
        showError('Ошибка загрузки статистики');
    }
}

function displayAdminStatistics(stats) {
    const content = document.getElementById('adminContent');
    
    content.innerHTML = `
        <div class="admin-stats-header">
            <h3>Общая статистика</h3>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <h4>Всего пользователей</h4>
                <div class="stat-number">${stats.overview.total_users}</div>
            </div>
            <div class="stat-card">
                <h4>Новых сегодня</h4>
                <div class="stat-number">${stats.overview.new_users_today}</div>
            </div>
            <div class="stat-card">
                <h4>Активных (7 дней)</h4>
                <div class="stat-number">${stats.overview.active_users}</div>
            </div>
            <div class="stat-card">
                <h4>Premium</h4>
                <div class="stat-number">${stats.overview.premium_users}</div>
            </div>
            <div class="stat-card">
                <h4>Верифицированных</h4>
                <div class="stat-number">${stats.overview.verified_users}</div>
            </div>
            <div class="stat-card">
                <h4>Запросов сегодня</h4>
                <div class="stat-number">${stats.overview.total_requests_today}</div>
            </div>
            <div class="stat-card">
                <h4>Уникальных посетителей</h4>
                <div class="stat-number">${stats.overview.unique_visitors_today}</div>
            </div>
        </div>
        
        <div class="stats-section">
            <h4>Устройства</h4>
            <div class="stats-list">
                ${stats.device_statistics.map(device => `
                    <div class="stat-item">
                        <span>${device.device_type || 'Неизвестно'}</span>
                        <span>${device.count}</span>
                    </div>
                `).join('')}
            </div>
        </div>
        
        <div class="stats-section">
            <h4>Браузеры</h4>
            <div class="stats-list">
                ${stats.browser_statistics.map(browser => `
                    <div class="stat-item">
                        <span>${browser.browser || 'Неизвестно'}</span>
                        <span>${browser.count}</span>
                    </div>
                `).join('')}
            </div>
        </div>
        
        <div class="stats-section">
            <h4>Операционные системы</h4>
            <div class="stats-list">
                ${stats.os_statistics.map(os => `
                    <div class="stat-item">
                        <span>${os.os || 'Неизвестно'}</span>
                        <span>${os.count}</span>
                    </div>
                `).join('')}
            </div>
        </div>
        
        <div class="stats-section">
            <h4>Языки</h4>
            <div class="stats-list">
                ${stats.language_statistics.map(lang => `
                    <div class="stat-item">
                        <span>${lang.language_code || 'Неизвестно'}</span>
                        <span>${lang.count}</span>
                    </div>
                `).join('')}
            </div>
        </div>
        
        ${stats.top_endpoints && stats.top_endpoints.length > 0 ? `
            <div class="stats-section">
                <h4>Популярные страницы</h4>
                <div class="stats-list">
                    ${stats.top_endpoints.map(endpoint => `
                        <div class="stat-item">
                            <span>${endpoint.endpoint}</span>
                            <span>${endpoint.count}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
        
        ${stats.hourly_activity && stats.hourly_activity.length > 0 ? `
            <div class="stats-section">
                <h4>Активность по часам (24 часа)</h4>
                <div class="stats-list">
                    ${stats.hourly_activity.map(hour => `
                        <div class="stat-item">
                            <span>${hour.hour}:00</span>
                            <span>${hour.count}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
    `;
}

// Admin user management functions
async function viewUserDetails(userId) {
    try {
        const response = await fetch(`/api/admin/users/${userId}`, { ...arguments[1], credentials: 'include' });
        const user = await response.json();
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Детали пользователя</h3>
                    <button class="close-btn" onclick="this.closest('.modal').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="user-details">
                        <div class="user-info">
                            <h4>${user.first_name || ''} ${user.last_name || ''} 
                                ${user.username ? `(@${user.username})` : ''}
                                ${user.is_verified ? '<span class="verified-badge">✓</span>' : ''}
                                ${user.is_admin ? '<span class="admin-badge">👑</span>' : ''}
                            </h4>
                            <p><strong>ID:</strong> ${user.telegram_id}</p>
                            <p><strong>Язык:</strong> ${user.language_code || 'Не указан'}</p>
                            <p><strong>Premium:</strong> ${user.is_premium ? 'Да' : 'Нет'}</p>
                            <p><strong>Устройство:</strong> ${user.device_type || 'Неизвестно'}</p>
                            <p><strong>Браузер:</strong> ${user.browser || 'Неизвестно'}</p>
                            <p><strong>ОС:</strong> ${user.os || 'Неизвестно'}</p>
                            <p><strong>IP:</strong> ${user.ip_address || 'Неизвестно'}</p>
                            <p><strong>Сессий:</strong> ${user.total_sessions || 0}</p>
                            <p><strong>Запросов:</strong> ${user.total_requests || 0}</p>
                            <p><strong>Отзывов:</strong> ${user.reviews_count || 0}</p>
                            <p><strong>Избранных:</strong> ${user.favorite_channels_count || 0}</p>
                            <p><strong>Регистрация:</strong> ${formatDate(user.created_at)}</p>
                            <p><strong>Последний визит:</strong> ${formatDate(user.last_seen)}</p>
                            <p><strong>Последняя активность:</strong> ${formatDate(user.last_activity)}</p>
                        </div>
                    </div>
                    ${user.recent_sessions && user.recent_sessions.length > 0 ? `
                        <div class="user-sessions">
                            <h4>Последние сессии</h4>
                            ${user.recent_sessions.map(session => `
                                <div class="session-item">
                                    <p><strong>IP:</strong> ${session.ip_address}</p>
                                    <p><strong>User Agent:</strong> ${session.user_agent}</p>
                                    <p><strong>Создана:</strong> ${formatDate(session.created_at)}</p>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    } catch (error) {
        console.error('Error loading user details:', error);
        showError('Ошибка загрузки деталей пользователя');
    }
}

async function verifyUser(userId) {
    try {
        const response = await fetch(`/api/admin/users/${userId}/verify`, {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            showSuccess('Пользователь верифицирован');
            loadAdminUsers(); // Reload users list
        } else {
            showError('Ошибка верификации пользователя');
        }
    } catch (error) {
        console.error('Error verifying user:', error);
        showError('Ошибка верификации пользователя');
    }
}

async function unverifyUser(userId) {
    try {
        const response = await fetch(`/api/admin/users/${userId}/unverify`, {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            showSuccess('Верификация пользователя снята');
            loadAdminUsers(); // Reload users list
        } else {
            showError('Ошибка снятия верификации');
        }
    } catch (error) {
        console.error('Error unverifying user:', error);
        showError('Ошибка снятия верификации');
    }
}

// Admin Telegram ID management functions
async function linkAdminTelegram(adminId) {
    const telegramId = prompt('Введите Telegram ID пользователя:');
    
    if (!telegramId || isNaN(telegramId)) {
        showError('Введите корректный Telegram ID');
        return;
    }
    
    try {
        const response = await fetch('/api/admin/link-telegram', {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            
            credentials: 'include',
            body: JSON.stringify({
                adminId: adminId,
                telegramId: parseInt(telegramId)
            })
        });
        
        if (response.ok) {
            showSuccess('Telegram ID успешно привязан к админу');
            loadAdminAdmins(); // Reload admins list
        } else {
            const error = await response.json();
            showError(error.error || 'Ошибка привязки Telegram ID');
        }
    } catch (error) {
        console.error('Error linking admin Telegram ID:', error);
        showError('Ошибка привязки Telegram ID');
    }
}

async function unlinkAdminTelegram(adminId) {
    if (!confirm('Вы уверены, что хотите отвязать Telegram ID от этого админа?')) {
        return;
    }
    
    try {
        const response = await fetch('/api/admin/unlink-telegram', {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            
            credentials: 'include',
            body: JSON.stringify({
                adminId: adminId
            })
        });
        
        if (response.ok) {
            showSuccess('Telegram ID успешно отвязан от админа');
            loadAdminAdmins(); // Reload admins list
        } else {
            const error = await response.json();
            showError(error.error || 'Ошибка отвязки Telegram ID');
        }
    } catch (error) {
        console.error('Error unlinking admin Telegram ID:', error);
        showError('Ошибка отвязки Telegram ID');
    }
}

// Block/Unblock user functions
async function blockUser(userId) {
    const reason = prompt('Введите причину блокировки:');
    
    if (!reason) {
        showError('Причина блокировки обязательна');
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/users/${userId}/block`, {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            
            credentials: 'include',
            body: JSON.stringify({
                reason: reason
            })
        });
        
        if (response.ok) {
            showSuccess('Пользователь заблокирован');
            loadAdminUsers(); // Reload users list
        } else {
            const error = await response.json();
            showError(error.error || 'Ошибка блокировки пользователя');
        }
    } catch (error) {
        console.error('Error blocking user:', error);
        showError('Ошибка блокировки пользователя');
    }
}

async function unblockUser(userId) {
    if (!confirm('Вы уверены, что хотите разблокировать этого пользователя?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/users/${userId}/unblock`, {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            showSuccess('Пользователь разблокирован');
            loadAdminUsers(); // Reload users list
        } else {
            const error = await response.json();
            showError(error.error || 'Ошибка разблокировки пользователя');
        }
    } catch (error) {
        console.error('Error unblocking user:', error);
        showError('Ошибка разблокировки пользователя');
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    console.log('Telegram Catalog App initialized');
    
    // Check for stored user data first
    const storedUser = localStorage.getItem('telegram_user');
    if (storedUser) {
        try {
            currentUser = JSON.parse(storedUser);
            updateAuthUI();
            console.log('Restored user from localStorage:', currentUser);
        } catch (e) {
            console.error('Error parsing stored user data:', e);
            localStorage.removeItem('telegram_user');
        }
    }
    
    // Try to authenticate with stored data
    if (storedUser) {
        console.log('Using stored user data');
        return;
    }
    
    // If no stored data, user needs to login via Telegram Widget
    console.log('No stored user data, user needs to login');
    
    // Add event listeners
    document.getElementById('loginForm').addEventListener('submit', handleAdminLogin);
    document.getElementById('addTagForm').addEventListener('submit', handleAddTag);
    document.getElementById('addAdminForm').addEventListener('submit', handleAddAdmin);
    
    // Initialize selected tags display
    updateSelectedTagsDisplay();
    
    // Ensure admin dashboard is hidden on page load
    document.getElementById('adminDashboard').style.display = 'none';
    document.getElementById('logoutBtn').style.display = 'none';
    isAdminLoggedIn = false;
    
    // Add main-page class for black and white theme
    document.body.classList.add('main-page');
    
    // Update auth UI
    updateAuthUI();
    
    // Ensure user dropdown is closed on page load
    const userDropdown = document.getElementById('userDropdown');
    const profileBtn = document.getElementById('profileBtn');
    if (userDropdown) {
        userDropdown.classList.add('hidden');
    }
    if (profileBtn) {
        profileBtn.classList.remove('active');
    }
});

// User Menu Functions
function toggleUserMenu() {
    const dropdown = document.getElementById('userDropdown');
    const profileBtn = document.getElementById('profileBtn');
    
    if (dropdown.classList.contains('hidden')) {
        dropdown.classList.remove('hidden');
        profileBtn.classList.add('active');
    } else {
        dropdown.classList.add('hidden');
        profileBtn.classList.remove('active');
    }
}

// Close dropdown when clicking outside
document.addEventListener('click', function(event) {
    const userMenu = document.querySelector('.user-menu');
    const dropdown = document.getElementById('userDropdown');
    const profileBtn = document.getElementById('profileBtn');
    
    if (userMenu && !userMenu.contains(event.target)) {
        dropdown.classList.add('hidden');
        profileBtn.classList.remove('active');
    }
});

// Close dropdown when pressing Escape
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const dropdown = document.getElementById('userDropdown');
        const profileBtn = document.getElementById('profileBtn');
        
        if (dropdown && !dropdown.classList.contains('hidden')) {
            dropdown.classList.add('hidden');
            profileBtn.classList.remove('active');
        }
    }
});

// Profile Functions
function showProfileModal() {
    if (!isUserAuthenticated()) {
        showLoginModal();
        return;
    }
    
    // Close dropdown
    document.getElementById('userDropdown').classList.add('hidden');
    document.getElementById('profileBtn').classList.remove('active');
    
    loadProfileData();
    document.getElementById('profileModal').classList.remove('hidden');
}

function closeProfileModal() {
    document.getElementById('profileModal').classList.add('hidden');
}

function showFavoriteChannels() {
    if (!isUserAuthenticated()) {
        showLoginModal();
        return;
    }
    
    // Close dropdown
    document.getElementById('userDropdown').classList.add('hidden');
    document.getElementById('profileBtn').classList.remove('active');
    
    // Show profile modal and focus on favorites section
    loadProfileData();
    document.getElementById('profileModal').classList.remove('hidden');
    
    // Scroll to favorites section
    setTimeout(() => {
        const favoritesSection = document.querySelector('.profile-section:last-child');
        if (favoritesSection) {
            favoritesSection.scrollIntoView({ behavior: 'smooth' });
        }
    }, 100);
}

function showMyReviews() {
    if (!isUserAuthenticated()) {
        showLoginModal();
        return;
    }
    
    // Close dropdown
    document.getElementById('userDropdown').classList.add('hidden');
    document.getElementById('profileBtn').classList.remove('active');
    
    // Show profile modal and focus on reviews section
    loadProfileData();
    document.getElementById('profileModal').classList.remove('hidden');
    
    // Scroll to reviews section
    setTimeout(() => {
        const reviewsSection = document.querySelector('.profile-section:nth-child(2)');
        if (reviewsSection) {
            reviewsSection.scrollIntoView({ behavior: 'smooth' });
        }
    }, 100);
}

function logoutUser() {
    // Close dropdown
    document.getElementById('userDropdown').classList.add('hidden');
    document.getElementById('profileBtn').classList.remove('active');
    
    // Clear user data
    currentUser = null;
    sessionToken = null;
    
    // Clear localStorage
    localStorage.removeItem('session_token');
    
    // Update UI
    updateAuthUI();
    
    // Close any open modals
    document.getElementById('profileModal').classList.add('hidden');
    
    // Show success message
    showSuccess('Вы успешно вышли из аккаунта');
    
    // Return to main page
    showMainPage();
}

async function loadProfileData() {
    try {
        const [profileResponse, reviewsResponse, favoritesResponse] = await Promise.all([
            fetch(`/api/user/${currentUser.id}/profile`, { ...arguments[1], credentials: 'include' }),
            fetch(`/api/user/${currentUser.id}/reviews`, { ...arguments[1], credentials: 'include' }),
            fetch(`/api/user/${currentUser.id}/favorites`, { ...arguments[1], credentials: 'include' })
        ]);
        
        const profile = await profileResponse.json();
        const reviews = await reviewsResponse.json();
        const favorites = await favoritesResponse.json();
        
        // Update profile info
        let profileName = profile.nickname || profile.first_name + (profile.last_name ? ' ' + profile.last_name : '');
        if (profile.is_admin) {
            profileName = '👑 ' + profileName;
        }
        document.getElementById('profileName').textContent = profileName;
        document.getElementById('profileUsername').textContent = profile.username ? `@${profile.username}` : 'Без username';
        document.getElementById('profileId').textContent = `ID: ${profile.id}`;
        document.getElementById('profileBio').value = profile.bio || '';
        
        // Avatar removed
        
        // Show verified badge
        const profileVerifiedBadge = document.getElementById('profileVerifiedBadge');
        if (profile.is_verified) {
            profileVerifiedBadge.classList.remove('hidden');
        } else {
            profileVerifiedBadge.classList.add('hidden');
        }
        
        // Update stats
        document.getElementById('reviewsCount').textContent = profile.reviews_count || 0;
        document.getElementById('favoritesCount').textContent = profile.favorite_channels_count || 0;
        
        // Load reviews
        displayUserReviews(reviews);
        
        // Load favorites
        displayFavoriteChannels(favorites);
        
    } catch (error) {
        console.error('Error loading profile data:', error);
        showError('Ошибка загрузки профиля');
    }
}

function displayUserReviews(reviews) {
    const container = document.getElementById('userReviews');
    
    if (reviews.length === 0) {
        container.innerHTML = '<p style="color: #9ca3af; text-align: center; padding: 20px;">Пока нет отзывов</p>';
        return;
    }
    
    container.innerHTML = reviews.map(review => `
        <div class="user-review-item">
            <a href="#" onclick="showChannelDetails(${review.channel_id})" class="review-channel-link">
                ${review.channel_title}
            </a>
            <div class="review-rating">
                <span class="stars">${generateStars(review.rating)}</span>
                <span class="rating-value">${review.rating}/5</span>
            </div>
            <div class="review-text">${review.comment || 'Без комментария'}</div>
            <div class="review-date">${new Date(review.created_at).toLocaleDateString('ru-RU')}</div>
        </div>
    `).join('');
}

function displayFavoriteChannels(favorites) {
    const container = document.getElementById('favoriteChannels');
    
    if (favorites.length === 0) {
        container.innerHTML = '<p style="color: #9ca3af; text-align: center; padding: 20px;">Нет избранных каналов</p>';
        return;
    }
    
    container.innerHTML = favorites.map(channel => `
        <div class="favorite-channel-item">
            <div class="favorite-channel-info">
                <h6>${channel.title}</h6>
                <p>${channel.subscribers || 'Неизвестно'} подписчиков • ${channel.avg_rating}/5 ${channel.stars}</p>
            </div>
            <button class="remove-favorite-btn" onclick="toggleFavorite(${channel.id})" title="Удалить из избранного">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
            </button>
        </div>
    `).join('');
}

async function saveProfile() {
    const bio = document.getElementById('profileBio').value;
    
    try {
        const response = await fetch('/api/user/profile', {
            method: 'PUT',
            
            headers: {
                ...getAuthHeaders(),
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            
            credentials: 'include',
            body: JSON.stringify({
                nickname: currentUser.nickname,
                bio: bio,
                avatar_url: currentUser.avatar_url
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showSuccess('Профиль сохранен!');
            // Update current user data
            currentUser.bio = bio;
            updateAuthUI();
        } else {
            showError(result.error || 'Ошибка сохранения профиля');
        }
    } catch (error) {
        console.error('Error saving profile:', error);
        showError('Ошибка сохранения профиля');
    }
}

// editAvatar function removed

async function toggleFavorite(channelId) {
    if (!isUserAuthenticated()) {
        showLoginModal();
        return;
    }
    
    try {
        const response = await fetch(`/api/user/favorites/${channelId}`, {
            method: 'POST',
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (response.ok) {
            if (result.is_favorite) {
                showSuccess('Добавлено в избранное');
            } else {
                showSuccess('Удалено из избранного');
                // Reload favorites
                loadProfileData();
            }
        } else {
            showError(result.error || 'Ошибка изменения избранного');
        }
    } catch (error) {
        console.error('Error toggling favorite:', error);
        showError('Ошибка изменения избранного');
    }
}

// Show user profile by ID (for viewing other users' profiles)
function showUserProfile(userId) {
    // This would open a read-only profile view
    // For now, just show a message
    showInfo(`Просмотр профиля пользователя ${userId} будет добавлен позже`);
}

// Admin Functions
async function linkAdminWithUser(telegramUserId) {
    if (!currentAdmin) {
        showError('Необходимо войти в админ-панель');
        return;
    }
    
    try {
        const response = await fetch('/api/admin/link-user', {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            
            credentials: 'include',
            body: JSON.stringify({
                adminId: currentAdmin.id,
                telegramUserId: telegramUserId
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showSuccess('Админ успешно связан с пользователем');
            // Update current admin info
            currentAdmin.telegram_user_id = telegramUserId;
        } else {
            showError(result.error || 'Ошибка связывания админа с пользователем');
        }
    } catch (error) {
        console.error('Error linking admin with user:', error);
        showError('Ошибка связывания админа с пользователем');
    }
}

async function unlinkAdminFromUser() {
    if (!currentAdmin) {
        showError('Необходимо войти в админ-панель');
        return;
    }
    
    try {
        const response = await fetch('/api/admin/unlink-user', {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            
            credentials: 'include',
            body: JSON.stringify({
                adminId: currentAdmin.id
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showSuccess('Админ отвязан от пользователя');
            // Update current admin info
            currentAdmin.telegram_user_id = null;
        } else {
            showError(result.error || 'Ошибка отвязывания админа от пользователя');
        }
    } catch (error) {
        console.error('Error unlinking admin from user:', error);
        showError('Ошибка отвязывания админа от пользователя');
    }
}

// Moderation functions
async function approveChannel(channelId) {
    if (!confirm('Вы уверены, что хотите одобрить этот канал?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/channels/${channelId}/approve`, {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            showSuccess('Канал одобрен');
            loadAdminChannelsModeration(); // Reload moderation list
        } else {
            const error = await response.json();
            showError(error.error || 'Ошибка одобрения канала');
        }
    } catch (error) {
        console.error('Error approving channel:', error);
        showError('Ошибка одобрения канала');
    }
}

async function rejectChannel(channelId) {
    const reason = prompt('Введите причину отклонения:');
    
    if (!reason) {
        showError('Причина отклонения обязательна');
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/channels/${channelId}/reject`, {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            
            credentials: 'include',
            body: JSON.stringify({ reason })
        });
        
        if (response.ok) {
            showSuccess('Канал отклонен');
            loadAdminChannelsModeration(); // Reload moderation list
        } else {
            const error = await response.json();
            showError(error.error || 'Ошибка отклонения канала');
        }
    } catch (error) {
        console.error('Error rejecting channel:', error);
        showError('Ошибка отклонения канала');
    }
}

async function approveReview(reviewId) {
    if (!confirm('Вы уверены, что хотите одобрить этот отзыв?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/reviews/${reviewId}/approve`, {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            showSuccess('Отзыв одобрен');
            loadAdminReviewsModeration(); // Reload moderation list
        } else {
            const error = await response.json();
            showError(error.error || 'Ошибка одобрения отзыва');
        }
    } catch (error) {
        console.error('Error approving review:', error);
        showError('Ошибка одобрения отзыва');
    }
}

async function rejectReview(reviewId) {
    const reason = prompt('Введите причину отклонения:');
    
    if (!reason) {
        showError('Причина отклонения обязательна');
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/reviews/${reviewId}/reject`, {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            
            credentials: 'include',
            body: JSON.stringify({ reason })
        });
        
        if (response.ok) {
            showSuccess('Отзыв отклонен');
            loadAdminReviewsModeration(); // Reload moderation list
        } else {
            const error = await response.json();
            showError(error.error || 'Ошибка отклонения отзыва');
        }
    } catch (error) {
        console.error('Error rejecting review:', error);
        showError('Ошибка отклонения отзыва');
    }
}

// Edit channel function
async function editChannel(channelId) {
    try {
        // Get channel details
        const response = await fetch(`/api/channels/${channelId}`, { ...arguments[1], credentials: 'include' });
        const channel = await response.json();
        
        if (!response.ok) {
            showError('Ошибка загрузки данных канала');
            return;
        }
        
        // Show edit modal
        showEditChannelModal(channel);
    } catch (error) {
        console.error('Error loading channel for edit:', error);
        showError('Ошибка загрузки данных канала');
    }
}

function showEditChannelModal(channel) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('editChannelModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'editChannelModal';
        modal.className = 'modal hidden';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Редактировать канал</h3>
                    <button class="close-btn" onclick="closeEditChannelModal()">&times;</button>
                </div>
                <form id="editChannelForm">
                    <div class="form-group">
                        <label for="editChannelTitle">Название:</label>
                        <input type="text" id="editChannelTitle" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label for="editChannelDescription">Описание:</label>
                        <textarea id="editChannelDescription" class="form-textarea" required></textarea>
                    </div>
                    <div class="form-group">
                        <label for="editChannelLink">Ссылка:</label>
                        <input type="url" id="editChannelLink" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label for="editChannelStatus">Статус:</label>
                        <select id="editChannelStatus" class="form-select">
                            <option value="pending">На модерации</option>
                            <option value="approved">Одобрен</option>
                            <option value="rejected">Отклонен</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="editChannelRejectionReason">Причина отклонения (если применимо):</label>
                        <textarea id="editChannelRejectionReason" class="form-textarea"></textarea>
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn-secondary" onclick="closeEditChannelModal()">Отмена</button>
                        <button type="submit" class="submit-button">Сохранить</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    // Fill form with channel data
    document.getElementById('editChannelTitle').value = channel.title;
    document.getElementById('editChannelDescription').value = channel.description;
    document.getElementById('editChannelLink').value = channel.link;
    document.getElementById('editChannelStatus').value = channel.status || 'pending';
    document.getElementById('editChannelRejectionReason').value = channel.rejection_reason || '';
    
    // Store channel ID for form submission
    modal.dataset.channelId = channel.id;
    
    // Show modal
    modal.classList.remove('hidden');
    
    // Add form submit handler
    document.getElementById('editChannelForm').onsubmit = handleEditChannel;
}

function closeEditChannelModal() {
    const modal = document.getElementById('editChannelModal');
    if (modal) {
        modal.classList.add('hidden');
        document.getElementById('editChannelForm').reset();
    }
}

async function handleEditChannel(e) {
    e.preventDefault();
    
    const modal = document.getElementById('editChannelModal');
    const channelId = modal.dataset.channelId;
    
    const formData = {
        title: document.getElementById('editChannelTitle').value,
        description: document.getElementById('editChannelDescription').value,
        link: document.getElementById('editChannelLink').value,
        status: document.getElementById('editChannelStatus').value,
        rejection_reason: document.getElementById('editChannelRejectionReason').value
    };
    
    try {
        const response = await fetch(`/api/admin/channels/${channelId}`, {
            method: 'PUT',
            
            headers: {
                ...getAuthHeaders(),
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            
            credentials: 'include',
            body: JSON.stringify(formData)
        });
        
        if (response.ok) {
            showSuccess('Канал обновлен');
            closeEditChannelModal();
            // Reload current admin tab
            if (currentAdminTab === 'channels') {
                loadAdminChannels();
            } else if (currentAdminTab === 'channels-moderation') {
                loadAdminChannelsModeration();
            }
        } else {
            const error = await response.json();
            showError(error.error || 'Ошибка обновления канала');
        }
    } catch (error) {
        console.error('Error updating channel:', error);
        showError('Ошибка обновления канала');
    }
}